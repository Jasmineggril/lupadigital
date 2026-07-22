/**
 * @file aiService.ts
 * @description Serviço central de IA do LUPA Digital (NIASci).
 *
 * FUNDAMENTOS CIENTÍFICOS
 * ────────────────────────────────────────────────────────────────────────────
 * Este serviço implementa dois princípios científicos complementares:
 *
 * 1. PRESERVAÇÃO SEMÂNTICA (Saussure — signo linguístico)
 *    Distinção entre significante (forma) e significado (conteúdo).
 *    A IA pode transformar o significante; nunca o significado.
 *
 * 2. MEDIAÇÃO LINGUÍSTICA (Linguística Aplicada)
 *    A IA não é uma resumidora de textos: é uma mediadora que traduz entre
 *    o registro burocrático/jurídico e a linguagem cidadã acessível,
 *    preservando a força pragmática dos enunciados originais.
 *
 * 3. LINGUAGEM SIMPLES (Plain Language — ISO 24495-1:2023)
 *    Princípios técnicos de acessibilidade textual aplicados sistematicamente
 *    a todas as saídas da IA.
 *
 * 4. TRANSPARÊNCIA E RASTREABILIDADE
 *    Toda análise pode gerar alertas de ambiguidade (campo `alertas`) que
 *    sinalizam ao usuário quando um trecho precisa ser verificado no original.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { openai, getOpenAIModel } from "@workspace/integrations-openai-ai-server";
import { SimplifyEditalResponse } from "@workspace/api-zod";
import { randomUUID, createHash } from "crypto";
import { z } from "zod";

/**
 * Extrai o primeiro objeto JSON válido de uma string.
 * O Gemini 2.5 Flash às vezes retorna texto antes/depois do JSON
 * mesmo com responseMimeType: "application/json". Esta função
 * tenta múltiplas estratégias para extrair o JSON.
 */
function extractJsonFromResponse(raw: string): unknown {
  // Estratégia 0: strip de blocos <thinking>…</thinking> do Gemini 2.5 Flash
  // O modelo emite raciocínio interno antes do JSON quando em modo thinking
  const noThinking = raw.replace(/[\s\S]*?<\/thinking>/gi, "").trim();
  const base = noThinking || raw;

  // Estratégia 1: parse direto
  try { return JSON.parse(base); } catch { /* segue */ }

  // Estratégia 2: strip markdown code blocks
  const stripped = base
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```\s*$/m, "")
    .trim();
  try { return JSON.parse(stripped); } catch { /* segue */ }

  // Estratégia 3: slice do primeiro { ao último }
  const first = stripped.indexOf("{");
  const last = stripped.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try { return JSON.parse(stripped.slice(first, last + 1)); } catch { /* segue */ }
  }

  // Estratégia 4: igual no raw original
  const firstRaw = raw.indexOf("{");
  const lastRaw = raw.lastIndexOf("}");
  if (firstRaw !== -1 && lastRaw > firstRaw) {
    try { return JSON.parse(raw.slice(firstRaw, lastRaw + 1)); } catch { /* segue */ }
  }

  const e = new Error(`AI response is not valid JSON. Raw (first 300): ${raw.slice(0, 300)}`);
  throw e;
}

import { logger } from "./logger";
import { getSupabaseAdmin } from "./supabase";

export type AgentId = "simples" | "analista" | "estrategica" | "acompanhamento" | "documentacao" | "elegibilidade";

export const AgentUserProfileSchema = z.object({
  escolaridade: z.string().default("superior"),
  atuacao: z.string().default(""),
  municipio: z.string().default(""),
  rendaFamiliar: z.string().default("1a3"),
});

export const AgentAnalyzeBodySchema = z.object({
  agentId: z.enum(["simples", "analista", "estrategica", "acompanhamento", "documentacao", "elegibilidade"]),
  text: z.string().min(10),
  profile: AgentUserProfileSchema.optional(),
});

/**
 * Alerta estruturado para indicar inconsistências, ambiguidades ou ausências de informação.
 * Permite rastreamento fino de problemas e navegação para fontes.
 */
export interface ValidationAlert {
  categoria: "ambiguidade" | "contradição" | "ausência" | "inferência" | "temporal";
  descricao: string;
  pagina?: number;
  secao?: string;
  trechoFonte?: string;
  severidade: "baixa" | "média" | "alta";
}

/**
 * Item de cronograma validado com informações de origem e confiança.
 * Garante rastreabilidade de cada data e detecção de inconsistências temporais.
 */
export interface CronogramaItem {
  fase: string;
  periodo: string;
  dataInicio?: string; // ISO 8601 quando possível
  dataFim?: string;    // ISO 8601 quando possível
  descricao: string;
  status: "passado" | "ativo" | "futuro";
  pagina?: number;
  secao?: string;
  trechoFonte?: string;
  confianca: "alta" | "média" | "baixa";
}

/**
 * Documento estruturado com informações de obrigatoriedade e rastreamento.
 */
export interface DocumentoExigido {
  nome: string;
  obrigatorio: boolean;
  observacao: string;
  pagina?: number;
  secao?: string;
  trechoFonte?: string;
}

/**
 * Critério de elegibilidade com rastreamento de origem.
 */
export interface CriterioElegibilidade {
  criterio: string;
  atende?: boolean | "parcial";
  observacao: string;
  pagina?: number;
  secao?: string;
  trechoFonte?: string;
  confianca: "alta" | "média" | "baixa";
}

/**
 * Estrutura canônica unificada para todas as análises de edital.
 * 
 * PRINCÍPIO: Fonte Única de Verdade
 * Todas as áreas da interface (Interpretação, Cronograma, Checklist, Elegibilidade, Chat, Exportação)
 * consomem SOMENTE esta estrutura. Não há análises independentes por área.
 *
 * VALIDAÇÃO: Todos os campos críticos incluem rastreamento de origem (página, trecho, confiança).
 *
 * ALERTAS: Inconsistências temporais, ambiguidades, dados faltantes são sinalizados em `alertas`.
 */
export interface CanonicalAnalysis {
  analysisId: string;
  schemaVersion: "1.0.1";
  source: {
    agentId: AgentId;
    generatedAt: string;
    textLength: number;
    profile?: z.infer<typeof AgentUserProfileSchema>;
    documentHash?: string;
    promptVersion?: string;
  };
  documento: {
    titulo?: string;
    numero?: string;
    orgao?: string;
    anoPublicacao?: number;
    tipo?: string;
    fonte?: string;
    totalPaginas?: number;
  };
  interpretation: {
    summary: string;
    objective: string;
    targetAudience: string;
    deadlines: string;
    registrationLocation: string;
    requirements: string[];
    simpleLanguage: string;
  };
  cronograma?: {
    items: CronogramaItem[];
    summary?: string;
    validacaoTemporal?: {
      temConflitos: boolean;
      conflitos: Array<{ evento1: string; evento2: string; problema: string }>;
    };
  };
  checklist?: {
    items: Array<{ doc: string; obrigatorio: boolean; observacao: string; checked: boolean }>;
    summary?: string;
  };
  elegibilidade?: {
    score?: number;
    criteria: Array<{ criterio: string; atende: boolean | "parcial"; observacao: string }>;
    recommendation?: string;
    nextSteps?: string[];
  };
  valores?: {
    valor?: string;
    moeda?: string;
    observacao?: string;
  };
  documentosExigidos: {
    items: string[];
    summary: string;
  };
  evidencias?: Array<{
    campo: string;
    evento?: string;
    descricao: string;
    pagina?: number;
    secao?: string;
    trecho?: string;
    confianca?: "alta" | "média" | "baixa";
  }>;
  alertas: (string | ValidationAlert)[];
  agentResult: Record<string, unknown>;
}

/**
 * Tenta fazer parse de uma data em múltiplos formatos brasileiros.
 * Retorna Date se conseguir, null caso contrário.
 *
 * Suporta:
 * - "31 de dezembro de 2026" (português completo)
 * - "31/12/2026" (DD/MM/YYYY)
 * - "2026-12-31" (ISO 8601)
 * - "december 31, 2026" (inglês — detecta contexto)
 *
 * @param dateString - String contendo uma data
 * @returns Date válido ou null
 */
function parseDate(dateString: string): Date | null {
  if (!dateString || typeof dateString !== "string") return null;

  // Tira espaços extras
  const clean = dateString.trim();

  // Padrão: "31 de dezembro de 2026"
  const ptMatch = clean.match(
    /(\d{1,2})\s+de\s+([a-záéíóúâêîôûãõ]+)\s+de\s+(\d{4})/i
  );
  if (ptMatch) {
    const meses: Record<string, number> = {
      janeiro: 1, fevereiro: 2, março: 3, abril: 4, maio: 5, junho: 6,
      julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
    };
    const dia = parseInt(ptMatch[1], 10);
    const mesStr = ptMatch[2].toLowerCase();
    const ano = parseInt(ptMatch[3], 10);
    const mes = meses[mesStr];
    if (mes) {
      return new Date(ano, mes - 1, dia);
    }
  }

  // Padrão: "31/12/2026"
  const brMatch = clean.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (brMatch) {
    const dia = parseInt(brMatch[1], 10);
    const mes = parseInt(brMatch[2], 10);
    const ano = parseInt(brMatch[3], 10);
    return new Date(ano, mes - 1, dia);
  }

  // Padrão: "2026-12-31" (ISO)
  try {
    const isoDate = new Date(clean);
    if (!isNaN(isoDate.getTime())) return isoDate;
  } catch { /* ignore */ }

  return null;
}

/**
 * Detecta conflitos temporais em um cronograma.
 * 
 * Valida:
 * - Data de início < data de fim
 * - Fases em sequência cronológica
 * - Ausência de datas inconsistentes
 *
 * @param items - Array de items do cronograma com datas parseadas
 * @returns Array de conflitos encontrados
 */
function hasExplicitTemporalSupport(item: CronogramaItem, originalText: string, editalYear?: number): boolean {
  if (!originalText || !originalText.trim()) return false;

  const normalizedOriginal = originalText.toLowerCase();
  const normalizedDate = item.periodo?.toLowerCase().trim();
  const hasDateInOriginal = normalizedDate ? normalizedOriginal.includes(normalizedDate) : false;
  const sourceSnippet = [item.trechoFonte, item.fase, item.descricao].filter(Boolean).join(" ").toLowerCase();
  const hasSourceEvidence = Boolean(item.trechoFonte?.trim()) && /inscri|resultado|recurso|execu|vigên|publica|retifica|lei|documento|referênc|evento/i.test(sourceSnippet);

  if (!hasDateInOriginal && !hasSourceEvidence) {
    return false;
  }

  if (editalYear) {
    const yearMatch = normalizedDate?.match(/(19|20)\d{2}/);
    const eventYear = yearMatch ? Number(yearMatch[0]) : undefined;
    const isHistoricalReference = /históric|referência histórica|referência|anterior|passado|anterio/i.test(normalizedOriginal);

    if (eventYear && eventYear < editalYear && !isHistoricalReference) {
      return false;
    }
  }

  return true;
}

function validateTemporalConsistency(
  items: CronogramaItem[],
  originalText: string,
): Array<{ evento1: string; evento2: string; problema: string }> {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }
  const conflitos: Array<{ evento1: string; evento2: string; problema: string }> = [];
  const hasExplicitEvidence = (item: CronogramaItem) => hasExplicitTemporalSupport(item, originalText);

  // Tenta fazer parse de datas
  const itemsWithDates = items
    .map((item) => ({
      ...item,
      inicio: item.dataInicio ? parseDate(item.dataInicio) : null,
      fim: item.dataFim ? parseDate(item.dataFim) : null,
    }))
    .filter((item) => item.inicio || item.fim);

  // Verifica se data de fim é anterior à de início (no mesmo evento)
  itemsWithDates.forEach((item) => {
    if (!hasExplicitEvidence(item)) {
      conflitos.push({
        evento1: item.fase || "evento sem nome",
        evento2: item.fase || "evento sem nome",
        problema: `Data sem evidência explícita no edital para o evento "${item.fase || "evento sem nome"}"`,
      });
    }
    if (item.inicio && item.fim && item.inicio > item.fim) {
      conflitos.push({
        evento1: item.fase,
        evento2: item.fase,
        problema: `Data de fim anterior à data de início no evento "${item.fase}"`,
      });
    }
  });

  // Verifica ordem cronológica entre eventos
  for (let i = 0; i < itemsWithDates.length - 1; i++) {
    const curr = itemsWithDates[i];
    const next = itemsWithDates[i + 1];

    if (curr.fim && next.inicio && curr.fim > next.inicio) {
      conflitos.push({
        evento1: curr.fase,
        evento2: next.fase,
        problema: `"${curr.fase}" termina após o início de "${next.fase}"`,
      });
    }
  }

  return conflitos;
}

export function buildCanonicalAnalysis(
  agentId: AgentId,
  agentResult: Record<string, unknown>,
  originalText: string,
  profile?: z.infer<typeof AgentUserProfileSchema>,
): CanonicalAnalysis {
  const result = agentResult as Record<string, unknown>;
  const editalYear = typeof result.anoPublicacao === "number" ? result.anoPublicacao : undefined;
  /**
   * Calcula um hash do texto original normalizado para permitir cache,
   * detecção de duplicatas e rastreabilidade sem expor o conteúdo bruto.
   */
  const documentHash = originalText && originalText.trim().length > 0 ? createHash("sha256").update(originalText.trim()).digest("hex") : undefined;
  
  /**
   * Normaliza alertas para formato estruturado.
   * Suporta tanto strings simples quanto ValidationAlert completos.
   */
  const normalizeAlerts = (): (string | ValidationAlert)[] => {
    const rawAlerts = Array.isArray(result.alertas)
      ? (result.alertas as Array<string | ValidationAlert>)
      : [];

    return rawAlerts.reduce<(string | ValidationAlert)[]>((acc, alert) => {
      if (typeof alert === "string") {
        if (/ambiguid/i.test(alert)) {
          acc.push({
            categoria: "ambiguidade",
            descricao: alert,
            severidade: "média",
          });
          return acc;
        }
        if (/contradi/i.test(alert)) {
          acc.push({
            categoria: "contradição",
            descricao: alert,
            severidade: "alta",
          });
          return acc;
        }
        if (/ausênc|não informad/i.test(alert)) {
          acc.push({
            categoria: "ausência",
            descricao: alert,
            severidade: "baixa",
          });
          return acc;
        }
        if (/inferid|pressum|consider/i.test(alert)) {
          acc.push({
            categoria: "inferência",
            descricao: alert,
            severidade: "média",
          });
          return acc;
        }
        acc.push(alert);
        return acc;
      }

      if (typeof alert === "object" && alert !== null) {
        acc.push(alert as ValidationAlert);
      }

      return acc;
    }, []);
  };

  const interpretation = {
    summary:
      (typeof result.tipoEdital === "string" && result.tipoEdital) ||
      (typeof result.resumo === "string" && result.resumo) ||
      (typeof result.oportunidade === "string" && result.oportunidade) ||
      (typeof result.recomendacao === "string" && result.recomendacao) ||
      (typeof result.observacao === "string" && result.observacao) ||
      "Interpretação consolidada do edital.",
    objective:
      (typeof result.objetivo === "string" && result.objetivo) ||
      (typeof result.oportunidade === "string" && result.oportunidade) ||
      (typeof result.recomendacao === "string" && result.recomendacao) ||
      "Objetivo não explicitado no documento.",
    targetAudience:
      (typeof result.publicoAlvo === "string" && result.publicoAlvo) ||
      (typeof result.tipoEdital === "string" && result.tipoEdital) ||
      "Público-alvo conforme o edital.",
    deadlines:
      (typeof result.prazo === "string" && result.prazo) ||
      "Prazo não informado.",
    registrationLocation:
      (typeof result.ondeInscrever === "string" && result.ondeInscrever) ||
      (typeof result.instituicao === "string" && result.instituicao) ||
      "Local de inscrição não informado.",
    requirements:
      Array.isArray(result.requisitos)
        ? (result.requisitos as string[]).filter(Boolean)
        : Array.isArray(result.documentos)
          ? (result.documentos as string[]).filter(Boolean)
          : [],
    simpleLanguage:
      (typeof result.observacao === "string" && result.observacao) ||
      (typeof result.dica === "string" && result.dica) ||
      "Texto adaptado para leitura acessível.",
  };

  /**
   * Constrói cronograma com validação temporal.
   * Se houver conflitos de datas, adiciona alertas estruturados.
   */
  const cronograma = Array.isArray(result.timeline)
    ? (() => {
        const items = (result.timeline as Array<Record<string, unknown>>).map(
          (item): CronogramaItem => ({
            fase: typeof item.fase === "string" ? item.fase : "",
            periodo: typeof item.periodo === "string" ? item.periodo : "",
            dataInicio:
              typeof item.dataInicio === "string"
                ? item.dataInicio
                : undefined,
            dataFim:
              typeof item.dataFim === "string" ? item.dataFim : undefined,
            descricao: typeof item.descricao === "string" ? item.descricao : "",
            status: (item.status as "passado" | "ativo" | "futuro") ?? "ativo",
            pagina:
              typeof item.pagina === "number" ? item.pagina : undefined,
            secao:
              typeof item.secao === "string" ? item.secao : undefined,
            trechoFonte:
              typeof item.trechoFonte === "string"
                ? item.trechoFonte
                : undefined,
            confianca: (item.confianca as "alta" | "média" | "baixa") ?? "média",
          })
        );

        const conflitos = validateTemporalConsistency(items, originalText);
        
        return {
          items,
          summary: typeof result.observacao === "string" ? result.observacao : undefined,
          validacaoTemporal:
            conflitos.length > 0
              ? {
                  temConflitos: true,
                  conflitos,
                }
              : undefined,
        };
      })()
    : undefined;

  const checklist = Array.isArray(result.checklist)
    ? {
        items: (result.checklist as Array<Record<string, unknown>>).map(
          (item) => ({
            doc: typeof item.doc === "string" ? item.doc : "",
            obrigatorio: Boolean(item.obrigatorio),
            observacao:
              typeof item.observacao === "string" ? item.observacao : "",
            checked: Boolean(item.checked),
          })
        ),
        summary:
          typeof result.dica === "string" ? result.dica : undefined,
      }
    : undefined;

  const elegibilidade = Array.isArray(result.criterios)
    ? {
        score:
          typeof result.score === "number" ? result.score : undefined,
        criteria: (result.criterios as Array<Record<string, unknown>>).map(
          (item) => {
            const atendeValue = item.atende;
            const atende: boolean | "parcial" =
              atendeValue === "parcial"
                ? "parcial"
                : atendeValue === true
                ? true
                : false;

            return {
              criterio:
                typeof item.criterio === "string" ? item.criterio : "",
              atende,
              observacao:
                typeof item.observacao === "string"
                  ? item.observacao
                  : "",
            };
          }
        ),
        recommendation:
          typeof result.recomendacao === "string"
            ? result.recomendacao
            : undefined,
        nextSteps: Array.isArray(result.proximosPassos)
          ? (result.proximosPassos as string[]).filter(Boolean)
          : undefined,
      }
    : undefined;

  const documentosExigidos = {
    items:
      Array.isArray(result.documentos)
        ? (result.documentos as string[]).filter(Boolean)
        : Array.isArray(result.checklist)
          ? (result.checklist as Array<Record<string, unknown>>)
              .map((item) =>
                typeof item.doc === "string" ? item.doc : ""
              )
              .filter(Boolean)
          : [],
    summary:
      Array.isArray(result.documentos) &&
      (result.documentos as string[]).length > 0
        ? `Documentos exigidos: ${(result.documentos as string[]).join(
            ", "
          )}`
        : Array.isArray(result.checklist)
          ? "Checklist de documentos listado na interpretação."
          : "Não há documentos exigidos identificados no texto.",
  };

  const allAlerts = normalizeAlerts();
  const evidencias: CanonicalAnalysis["evidencias"] = [];

  if (cronograma?.items?.length) {
    cronograma.items.forEach((item) => {
      if (item.fase || item.periodo) {
        const isExplicitlySupported = hasExplicitTemporalSupport(item, originalText, editalYear);

        evidencias.push({
          campo: "cronograma",
          evento: item.fase || "evento",
          descricao: isExplicitlySupported ? `Evidência de cronograma para ${item.fase || "evento"}` : `Data sem evidência explícita no edital para ${item.fase || "evento"}`,
          pagina: item.pagina,
          secao: item.secao,
          trecho: item.trechoFonte,
          confianca: item.confianca,
        });

        if (!isExplicitlySupported) {
          allAlerts.push({
            categoria: "temporal" as const,
            descricao: `O evento "${item.fase || "evento"}" usa uma data sem suporte explícito no edital.`,
            severidade: "alta" as const,
          });
        }
      }
    });
  }

  // Adiciona alerta para conflitos temporais
  if (
    cronograma?.validacaoTemporal?.temConflitos &&
    cronograma.validacaoTemporal.conflitos.length > 0
  ) {
    cronograma.validacaoTemporal.conflitos.forEach((conf) => {
      allAlerts.push({
        categoria: "temporal" as const,
        descricao: conf.problema,
        severidade: "alta" as const,
      });
    });
  }

  return {
    analysisId: `analysis-${randomUUID()}`,
    schemaVersion: "1.0.1",
    source: {
      agentId,
      generatedAt: new Date().toISOString(),
      textLength: originalText.trim().length,
      profile,
      documentHash,
    },
    documento: {
      titulo:
        typeof result.tipoEdital === "string"
          ? result.tipoEdital
          : undefined,
      numero:
        typeof result.numero === "string"
          ? result.numero
          : undefined,
      orgao:
        typeof result.instituicao === "string"
          ? result.instituicao
          : undefined,
      anoPublicacao:
        typeof result.anoPublicacao === "number"
          ? result.anoPublicacao
          : undefined,
      tipo:
        typeof result.tipoEdital === "string"
          ? result.tipoEdital
          : undefined,
      fonte:
        typeof result.fonte === "string"
          ? result.fonte
          : undefined,
      totalPaginas:
        typeof result.totalPaginas === "number"
          ? result.totalPaginas
          : undefined,
    },
    interpretation,
    cronograma,
    checklist,
    elegibilidade,
    valores: {
      valor:
        typeof result.valor === "string" ? result.valor : undefined,
      moeda:
        typeof result.valor === "string" && /R\$/i.test(result.valor)
          ? "BRL"
          : undefined,
      observacao:
        typeof result.observacao === "string"
          ? result.observacao
          : undefined,
    },
    documentosExigidos,
    evidencias,
    alertas: allAlerts,
    agentResult,
  };
}

// ── Response validators ────────────────────────────────────────────────────
export const SimplesResponseSchema = z.object({
  type: z.literal("simples"),
  scoreOportunidade: z.number().int().min(0).max(100),
  categoria: z.string(),
  resumo: z.string(),
  objetivo: z.string(),
  publicoAlvo: z.string(),
  prazo: z.string(),
  requisitos: z.array(z.string()),
  ondeInscrever: z.string(),
  observacao: z.string(),
  /** Metadados do documento para rastreabilidade */
  numero: z.string().optional(),
  anoPublicacao: z.number().int().optional(),
  fonte: z.string().optional(),
  totalPaginas: z.number().int().optional(),
  /** Alertas de ambiguidade: sinais de trechos imprecisos, inferidos ou contraditórios */
  alertas: z.array(z.string()).optional().default([]),
});

export const AnalistaResponseSchema = z.object({
  type: z.literal("analista"),
  tipoEdital: z.string(),
  instituicao: z.string(),
  prazo: z.string(),
  publicoAlvo: z.string(),
  requisitos: z.array(z.string()),
  documentos: z.array(z.string()),
  valor: z.string(),
  /** Metadados do documento para rastreabilidade */
  numero: z.string().optional(),
  anoPublicacao: z.number().int().optional(),
  fonte: z.string().optional(),
  totalPaginas: z.number().int().optional(),
  /** Alertas de ambiguidade: sinais de trechos imprecisos, inferidos ou contraditórios */
  alertas: z.array(z.string()).optional().default([]),
});

export const EstrategicaResponseSchema = z.object({
  type: z.literal("estrategica"),
  score: z.number().int().min(0).max(100),
  oportunidade: z.string(),
  vantagens: z.array(z.string()),
  pontosAtencao: z.array(z.string()),
  riscos: z.array(z.string()),
  recomendacao: z.string(),
  /** Metadados do documento para rastreabilidade */
  numero: z.string().optional(),
  anoPublicacao: z.number().int().optional(),
  fonte: z.string().optional(),
  totalPaginas: z.number().int().optional(),
  /** Alertas de ambiguidade: sinais de trechos imprecisos, inferidos ou contraditórios */
  alertas: z.array(z.string()).optional().default([]),
});

const TimelineItemSchema = z.object({
  fase: z.string(),
  periodo: z.string(),
  descricao: z.string(),
  status: z.enum(["passado", "ativo", "futuro"]),
});

export const AcompanhamentoResponseSchema = z.object({
  type: z.literal("acompanhamento"),
  timeline: z.array(TimelineItemSchema),
  observacao: z.string(),
  /** Metadados do documento para rastreabilidade */
  numero: z.string().optional(),
  anoPublicacao: z.number().int().optional(),
  fonte: z.string().optional(),
  totalPaginas: z.number().int().optional(),
  /** Alertas de ambiguidade: sinais de trechos imprecisos, inferidos ou contraditórios */
  alertas: z.array(z.string()).optional().default([]),
});

const ChecklistItemSchema = z.object({
  doc: z.string(),
  obrigatorio: z.boolean(),
  observacao: z.string(),
  checked: z.boolean().default(false),
});

export const DocumentacaoResponseSchema = z.object({
  type: z.literal("documentacao"),
  checklist: z.array(ChecklistItemSchema),
  dica: z.string(),
  /** Metadados do documento para rastreabilidade */
  numero: z.string().optional(),
  anoPublicacao: z.number().int().optional(),
  fonte: z.string().optional(),
  totalPaginas: z.number().int().optional(),
  /** Alertas de ambiguidade: sinais de trechos imprecisos, inferidos ou contraditórios */
  alertas: z.array(z.string()).optional().default([]),
});

const ElegibilidadeCriterioSchema = z.object({
  criterio: z.string(),
  atende: z.union([z.boolean(), z.literal("parcial")]),
  observacao: z.string(),
});

export const ElegibilidadeResponseSchema = z.object({
  type: z.literal("elegibilidade"),
  score: z.number().int().min(0).max(100),
  criterios: z.array(ElegibilidadeCriterioSchema),
  recomendacao: z.string(),
  proximosPassos: z.array(z.string()),
  /** Metadados do documento para rastreabilidade */
  numero: z.string().optional(),
  anoPublicacao: z.number().int().optional(),
  fonte: z.string().optional(),
  totalPaginas: z.number().int().optional(),
  /** Alertas de ambiguidade: sinais de trechos imprecisos, inferidos ou contraditórios */
  alertas: z.array(z.string()).optional().default([]),
});

// ── Fundamentos científicos (injetados em todos os prompts) ────────────────

/**
 * Princípio 1 — Preservação Semântica.
 * Inspirado no conceito de signo linguístico de Saussure.
 * Garante que a IA transforme apenas o significante, nunca o significado.
 */
const SEMANTIC_PRESERVATION_MANDATE = `
PRINCÍPIO 1 — PRESERVAÇÃO SEMÂNTICA (obrigatório):
Você pode transformar o SIGNIFICANTE (forma linguística), mas NUNCA o SIGNIFICADO.

PERMITIDO — transformações de forma:
- Simplificar vocabulário e substituir jargão por linguagem acessível
- Reduzir frases longas e reorganizar informações
- Explicar termos técnicos e jurídicos entre parênteses
- Adaptar o nível de linguagem ao cidadão comum

PROIBIDO — alterações de conteúdo:
- Inventar informações que não estão no documento
- Alterar ou omitir prazos (datas, períodos, vigências)
- Mudar critérios de elegibilidade ou requisitos
- Omitir exigências, condições ou obrigações importantes
- Alterar valores monetários ou quantitativos
- Transformar uma OBRIGAÇÃO em recomendação ou sugestão
- Transformar uma POSSIBILIDADE em certeza ou garantia
- Modificar relações de causa e consequência`.trim();

/**
 * Princípio 2 — Mediação Linguística.
 * Fundamentado em Linguística Aplicada e Teoria da Tradução.
 * Define o papel da IA como mediadora, não como resumidora.
 */
const MEDIADORA_LINGUISTICA_MANDATE = `
PRINCÍPIO 2 — MEDIAÇÃO LINGUÍSTICA (obrigatório):
Você NÃO é uma resumidora de textos. Você é uma MEDIADORA LINGUÍSTICA.

Sua função é traduzir entre dois registros comunicativos:
→ Registro de ENTRADA: linguagem burocrática, jurídica, técnica e formal
→ Registro de SAÍDA: linguagem clara, acessível e cidadã

Esta mediação preserva obrigatoriamente:
- O conteúdo semântico completo — o que o documento diz
- A força pragmática dos enunciados — obrigações permanecem obrigações
- A intenção comunicativa original — não interprete além do que está escrito
- As relações lógicas de causa, condição e consequência`.trim();

/**
 * Princípio 3 — Linguagem Simples (Plain Language, ISO 24495-1:2023).
 * Sete princípios técnicos de acessibilidade textual aplicados a
 * todos os textos produzidos pelo sistema.
 */
const PLAIN_LANGUAGE_PRINCIPLES = `
PRINCÍPIO 3 — LINGUAGEM SIMPLES / PLAIN LANGUAGE (obrigatório):
Ao produzir texto acessível, aplique os sete princípios técnicos:

1. VOCABULÁRIO COTIDIANO — substitua jargão por palavras do dia a dia.
   Exemplo: "rescisão contratual" → "cancelamento do contrato"

2. FRASES CURTAS — máximo de 25 palavras por frase. Divida períodos longos.

3. VOZ ATIVA — prefira "A entidade exige..." a "É exigido pela entidade..."
   Sujeito → Verbo → Complemento.

4. UMA IDEIA POR CAMPO — não agrupe conceitos distintos na mesma resposta.

5. ESTRUTURA LÓGICA — apresente o mais importante primeiro.
   Contexto → Regra → Consequência.

6. TERMOS TÉCNICOS INEVITÁVEIS — explique-os entre parênteses.
   Exemplo: "edital (documento oficial com as regras do processo)"

7. LINGUAGEM INCLUSIVA — tom respeitoso, direto, acessível a qualquer escolaridade.
   Evite regionalismos, gírias e construções excludentes.`.trim();

/**
 * Princípio 4 — Transparência e Rastreabilidade.
 * Instrui a IA a sinalizar ambiguidades, inferências e pontos de incerteza
 * no campo `alertas`, garantindo que o usuário saiba quando verificar o original.
 */
const TRANSPARENCY_MANDATE = `
PRINCÍPIO 4 — TRANSPARÊNCIA E RASTREABILIDADE (obrigatório):
Use o campo "alertas" (array de strings) para sinalizar:

- Trechos ambíguos que admitem mais de uma interpretação
- Informações inferidas do contexto (não declaradas explicitamente)
- Informações ausentes que seriam esperadas (ex: prazo não informado)
- Contradições internas encontradas no documento
- Qualquer ponto que o usuário DEVE verificar no documento original

Formato de cada alerta: "⚠ [categoria] descrição objetiva do problema"
Exemplos:
  "⚠ [ambiguidade] O prazo de inscrição não está explícito — verificar no edital original."
  "⚠ [inferência] Requisito de graduação inferido do contexto; não declarado explicitamente."
  "⚠ [contradição] O texto menciona dois valores distintos para o mesmo benefício."

Se não houver alertas, retorne "alertas": [] — NUNCA omita o campo.`.trim();

// ── Schemas de resposta por agente ─────────────────────────────────────────
const SCHEMA_EXAMPLES: Record<AgentId, string> = {
  simples: `{
  "type": "simples",
  "scoreOportunidade": 72,
  "categoria": "Classificação do edital (ex: Bolsa, Concurso, Fomento, Licitação)",
  "resumo": "Resumo em 3-4 frases simples — mantendo todos os critérios e condições originais",
  "objetivo": "O objetivo principal em 1-2 frases diretas, fiel ao documento",
  "publicoAlvo": "Quem pode participar, sem omitir restrições",
  "prazo": "Data limite EXATAMENTE como consta no edital (ou 'Não informado')",
  "requisitos": ["Requisito 1 — fiel ao documento", "Requisito 2", "Requisito 3"],
  "ondeInscrever": "Como e onde se inscrever exatamente como consta",
  "observacao": "Dica prática para o candidato — sem criar expectativas não previstas",
  "numero": "Número/identificador do edital se disponível",
  "anoPublicacao": 2024,
  "fonte": "Fonte oficial (ex: site do MEC, instituição responsável)",
  "totalPaginas": 45,
  "alertas": ["⚠ [ambiguidade] exemplo — apenas se houver problemas reais"]
}`,
  analista: `{
  "type": "analista",
  "tipoEdital": "Tipo do edital (ex: Concurso Público, Bolsa, Licitação, Fomento)",
  "instituicao": "Nome completo da instituição responsável",
  "prazo": "Todas as datas separadas por ' | ' — transcreva exatamente do documento",
  "publicoAlvo": "Público-alvo completo, incluindo todas as restrições",
  "requisitos": ["Requisito 1 — fiel ao texto", "Requisito 2"],
  "documentos": ["Documento 1", "Documento 2"],
  "valor": "Valor EXATAMENTE como consta (ou 'Não especificado')",
  "numero": "Número/identificador do edital se disponível",
  "anoPublicacao": 2024,
  "fonte": "Fonte oficial (ex: site do MEC, instituição responsável)",
  "totalPaginas": 45,
  "alertas": ["⚠ [inferência] exemplo — apenas se houver problemas reais"]
}`,
  estrategica: `{
  "type": "estrategica",
  "score": 75,
  "oportunidade": "Descrição da oportunidade baseada estritamente no edital",
  "vantagens": ["Vantagem 1 — baseada no documento", "Vantagem 2"],
  "pontosAtencao": ["Ponto de atenção 1 — exigência real do edital", "Ponto 2"],
  "riscos": ["Risco 1 — fundamentado no texto", "Risco 2"],
  "recomendacao": "Recomendação estratégica baseada exclusivamente nas condições reais",
  "numero": "Número/identificador do edital se disponível",
  "anoPublicacao": 2024,
  "fonte": "Fonte oficial (ex: site do MEC, instituição responsável)",
  "totalPaginas": 45,
  "alertas": ["⚠ [ambiguidade] exemplo — apenas se houver problemas reais"]
}`,
  acompanhamento: `{
  "type": "acompanhamento",
  "timeline": [
    {"fase": "📢 Publicação do Edital", "periodo": "data EXATA do documento ou 'Verificar no edital'", "descricao": "descrição fiel", "status": "passado"},
    {"fase": "📝 Período de Inscrições", "periodo": "data EXATA ou 'Verificar no edital'", "descricao": "descrição fiel", "status": "ativo"},
    {"fase": "📋 Análise / Seleção", "periodo": "data EXATA ou 'Verificar no edital'", "descricao": "descrição fiel", "status": "futuro"},
    {"fase": "📣 Resultado Preliminar", "periodo": "data EXATA ou 'Verificar no edital'", "descricao": "descrição fiel", "status": "futuro"},
    {"fase": "✉️ Prazo para Recurso", "periodo": "data EXATA ou 'Verificar no edital'", "descricao": "descrição fiel", "status": "futuro"},
    {"fase": "🏆 Resultado Final", "periodo": "data EXATA ou 'Verificar no edital'", "descricao": "descrição fiel", "status": "futuro"}
  ],
  "observacao": "Observação sobre os prazos — se não constar no edital, indicar 'Verificar no edital'",
  "numero": "Número/identificador do edital se disponível",
  "anoPublicacao": 2024,
  "fonte": "Fonte oficial (ex: site do MEC, instituição responsável)",
  "totalPaginas": 45,
  "alertas": ["⚠ [ausência] exemplo — apenas se houver datas não informadas ou ambíguas"]
}`,
  documentacao: `{
  "type": "documentacao",
  "checklist": [
    {"doc": "Nome exato do documento conforme o edital", "obrigatorio": true, "observacao": "Como obter ou preparar — sem adicionar exigências ausentes no edital", "checked": false}
  ],
  "dica": "Dica prática baseada no que o edital efetivamente exige",
  "numero": "Número/identificador do edital se disponível",
  "anoPublicacao": 2024,
  "fonte": "Fonte oficial (ex: site do MEC, instituição responsável)",
  "totalPaginas": 45,
  "alertas": ["⚠ [inferência] exemplo — apenas para documentos inferidos, não declarados"]
}`,
  elegibilidade: `{
  "type": "elegibilidade",
  "score": 75,
  "criterios": [
    {
      "criterio": "Critério exato conforme o edital",
      "atende": true,
      "observacao": "Explique de forma direta com base no perfil informado. Se a informação não estiver disponível, escreva: 'O documento enviado não apresenta esse dado.' Nunca use frases como 'considera-se que...', 'presume-se...' ou 'é possível inferir...'"
    }
  ],
  "recomendacao": "Recomendação baseada nos critérios reais — sem suavizar exigências não atendidas",
  "proximosPassos": ["Passo 1 — ação concreta baseada no edital", "Passo 2"],
  "numero": "Número/identificador do edital se disponível",
  "anoPublicacao": 2024,
  "fonte": "Fonte oficial (ex: site do MEC, instituição responsável)",
  "totalPaginas": 45,
  "alertas": ["⚠ [ambiguidade] exemplo — apenas se critérios forem ambíguos ou imprecisos"]
}`,
};

// ── Instruções de identidade por agente ───────────────────────────────────
/**
 * Define o papel e missão de cada agente como mediador linguístico.
 * Cada instrução é injetada junto com os 4 mandatos científicos no prompt
 * de sistema, garantindo coerência científica em todas as análises.
 */
const INSTRUCTIONS: Record<AgentId, string> = {
  simples:
    "Você é o agente Lupa Simples, uma mediadora linguística especializada em tornar editais públicos acessíveis a qualquer cidadão brasileiro. Crie um resumo em linguagem simples e direta, sem jargão técnico. Adapte a forma da linguagem; preserve integralmente o conteúdo — todos os prazos, critérios e exigências devem ser mantidos com exatidão.",

  analista:
    "Você é o agente Lupa Analista, uma mediadora linguística especializada em extração precisa de indicadores-chave de editais públicos. Extraia e organize: tipo, instituição, prazos, público-alvo, requisitos, documentos e valor do benefício. Transcreva datas e valores exatamente como constam. Se uma informação não estiver explícita, use 'Não informado' — nunca infira nem invente.",

  estrategica:
    "Você é o agente Lupa Estratégica, uma consultora especializada em análise de oportunidades em editais públicos. Avalie a oportunidade (score 0–100), identifique vantagens, pontos de atenção e riscos. Toda avaliação deve ser fundamentada exclusivamente em informações presentes no edital — não crie vantagens ou riscos sem base textual.",

  acompanhamento:
    "Você é o agente Lupa Acompanhamento, uma mediadora especializada em construir linhas do tempo de editais públicos. Use SOMENTE datas e períodos que constem explicitamente no documento. Para fases sem data informada, use 'Verificar no edital' — jamais invente ou estime datas. Classifique cada fase como 'passado', 'ativo' ou 'futuro' com base nas datas reais.",

  documentacao:
    "Você é o agente Lupa Documentação, uma mediadora especializada em criar checklists de documentação para editais públicos. Liste todos os documentos explicitamente mencionados. Documentos inferidos do tipo de edital devem ser sinalizados com '(inferido)' na observação e registrados em alertas. Para cada item, informe se é obrigatório conforme o edital.",

  elegibilidade:
    "Você é o agente Lupa Elegibilidade, uma mediadora especializada em análise de aderência de perfis a editais públicos. Compare cada requisito do edital com o perfil informado: true (atende), false (não atende) ou 'parcial' (atende parcialmente). Nas observações, use linguagem direta e objetiva. Quando a informação não estiver no perfil, escreva exatamente: 'O documento enviado não apresenta esse dado.' — nunca use 'considera-se que...', 'presume-se...' ou 'é possível inferir...'. Não suavize critérios não atendidos. Calcule o score proporcional aos critérios efetivamente atendidos.",
};

// ── Construção de prompts ──────────────────────────────────────────────────
/**
 * Constrói os prompts de sistema e usuário para um agente específico.
 *
 * Injeta os 4 mandatos científicos no sistema de todo agente:
 * 1. Preservação Semântica    2. Mediação Linguística
 * 3. Linguagem Simples        4. Transparência e Rastreabilidade
 */
function buildAgentPrompt(agentId: AgentId, text: string, profile?: z.infer<typeof AgentUserProfileSchema>) {
  const profileInfo =
    profile && agentId === "elegibilidade"
      ? `\n\nPERFIL DO USUÁRIO:\n- Escolaridade: ${profile.escolaridade}\n- Área de atuação: ${profile.atuacao || "não informada"}\n- Município/UF: ${profile.municipio || "não informado"}\n- Renda familiar: ${profile.rendaFamiliar}`
      : "";

  const system = [
    INSTRUCTIONS[agentId],
    "",
    SEMANTIC_PRESERVATION_MANDATE,
    "",
    MEDIADORA_LINGUISTICA_MANDATE,
    "",
    PLAIN_LANGUAGE_PRINCIPLES,
    "",
    TRANSPARENCY_MANDATE,
    "",
    "Responda SEMPRE em português brasileiro.",
    "Retorne SOMENTE um JSON válido sem markdown, sem blocos de código, sem texto adicional.",
  ].join("\n");

  const user = `Analise o edital abaixo e retorne um JSON com exatamente esta estrutura:\n\n${SCHEMA_EXAMPLES[agentId]}${profileInfo}\n\nEDITAL:\n${text}\n\nResponda APENAS com o JSON válido. O campo "alertas" é obrigatório — use [] se não houver alertas.`;

  return { system, user };
}

// ── Logging de uso ─────────────────────────────────────────────────────────
function buildUsageLogPayload(args: {
  userId?: string | null;
  documentId?: string | null;
  latencyMs: number;
  success: boolean;
  errorMessage?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
}) {
  return {
    user_id: args.userId ?? null,
    document_id: args.documentId ?? null,
    latency_ms: args.latencyMs,
    input_tokens: args.inputTokens ?? null,
    output_tokens: args.outputTokens ?? null,
    total_tokens: args.totalTokens ?? null,
    success: args.success,
    error_message: args.errorMessage ?? null,
  };
}

async function persistUsageLog(args: {
  module: string;
  model: string;
  userId?: string | null;
  documentId?: string | null;
  latencyMs: number;
  success: boolean;
  errorMessage?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  agentId?: AgentId | null;
  level?: "info" | "warn" | "error";
  message?: string;
}) {
  const payload = {
    module: args.module,
    model: args.model,
    ...buildUsageLogPayload({
      userId: args.userId ?? null,
      documentId: args.documentId ?? null,
      latencyMs: args.latencyMs,
      success: args.success,
      errorMessage: args.errorMessage ?? null,
      inputTokens: args.inputTokens ?? null,
      outputTokens: args.outputTokens ?? null,
      totalTokens: args.totalTokens ?? null,
    }),
  };

  const logContext = {
    module: args.module,
    model: args.model,
    agentId: args.agentId ?? null,
    user_id: args.userId ?? null,
    document_id: args.documentId ?? null,
    latency_ms: args.latencyMs,
    success: args.success,
    error_message: args.errorMessage ?? null,
    total_tokens: args.totalTokens ?? null,
  };

  try {
    if (args.level === "error") {
      logger.error(logContext, args.message ?? "AIService usage log");
    } else if (args.level === "warn") {
      logger.warn(logContext, args.message ?? "AIService usage log");
    } else {
      logger.info(logContext, args.message ?? "AIService usage log");
    }
    const supa = getSupabaseAdmin();
    await supa.from("ai_usage_logs").insert(payload);
  } catch (logErr) {
    logger.warn({ err: logErr instanceof Error ? logErr.message : String(logErr) }, "Failed to persist ai_usage_logs");
  }
}

const VALIDATORS: Record<AgentId, z.ZodTypeAny> = {
  simples: SimplesResponseSchema,
  analista: AnalistaResponseSchema,
  estrategica: EstrategicaResponseSchema,
  acompanhamento: AcompanhamentoResponseSchema,
  documentacao: DocumentacaoResponseSchema,
  elegibilidade: ElegibilidadeResponseSchema,
};

// ── ocrPdf ─────────────────────────────────────────────────────────────────
/**
 * Extrai texto de páginas de PDF renderizadas como imagens JPEG (base64),
 * usando GPT-4o Vision como motor de OCR.
 *
 * Centralizado no AIService para garantir logging, rastreabilidade e
 * controle centralizado de todas as chamadas à API OpenAI.
 *
 * @param pages - Array de strings base64 (JPEG) representando páginas do PDF
 * @returns Texto extraído concatenado de todas as páginas
 */
export async function ocrPdf(
  pages: string[],
  opts?: { userId?: string | null },
): Promise<string> {
  if (!pages.length) return "";

  const model = getOpenAIModel();
  const start = Date.now();
  // Processa as páginas em lotes de 8 imagens por chamada à API.
  // Por quê BATCH=8? GPT-4o Vision suporta até 10 imagens por mensagem,
  // mas 8 é o sweet-spot entre contexto (tokens de imagem ~85–1700 tokens cada)
  // e janela de 128k tokens. Lotes maiores aumentam risco de truncamento silencioso.
  const BATCH = 8;
  const parts: string[] = [];

  try {
    for (let i = 0; i < pages.length; i += BATCH) {
      const batch = pages.slice(i, i + BATCH);
      const imageBlocks = batch.map((b64) => ({
        type: "image_url" as const,
        image_url: { url: `data:image/jpeg;base64,${b64}`, detail: "auto" as const },
      }));

      const response = await openai.chat.completions.create({
        model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Você é um assistente de OCR especializado em documentos oficiais brasileiros. Extraia TODO o texto das páginas do documento abaixo, em português, preservando parágrafos, seções e estrutura. Saída: apenas o texto extraído, sem comentários ou marcações extras.",
              },
              ...imageBlocks,
            ],
          },
        ],
        max_tokens: 8192,
      });

      parts.push(response.choices[0]?.message?.content ?? "");
    }

    const latency = Date.now() - start;
    await persistUsageLog({
      module: "AIService.ocrPdf",
      model,
      userId: opts?.userId ?? null,
      documentId: null,
      latencyMs: latency,
      success: true,
      level: "info",
      message: `OCR completed: ${pages.length} pages`,
    });

    return parts.join("\n\n");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const latency = Date.now() - start;
    await persistUsageLog({
      module: "AIService.ocrPdf",
      model,
      userId: opts?.userId ?? null,
      documentId: null,
      latencyMs: latency,
      success: false,
      errorMessage: msg,
      level: "error",
      message: "OCR failed",
    });
    throw new Error(`OCR error: ${msg}`);
  }
}

// ── simplifyEdital ─────────────────────────────────────────────────────────
/**
 * Simplifica um edital público em linguagem acessível.
 *
 * Aplica os 4 mandatos científicos: preservação semântica, mediação linguística,
 * linguagem simples e transparência — garantindo que a simplificação altere
 * apenas a forma linguística sem distorcer o conteúdo do documento.
 */
export async function simplifyEdital(
  text: string,
  opts?: { userId?: string | null; documentId?: string | null },
) {
  // Limpa bytes binários e ruído antes de truncar (mesmo padrão da rota /analyze)
  const cleaned = text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const truncated = cleaned.length > 10000 ? cleaned.slice(0, 10000) + "\n\n[Texto truncado para processamento]" : cleaned;

  const systemPrompt = [
    "Você é um especialista em simplificação de documentos públicos brasileiros.",
    "Sua missão é tornar editais acessíveis para toda a população, independentemente do nível de escolaridade.",
    "Responda SEMPRE em português brasileiro com linguagem simples, clara e direta.",
    "",
    SEMANTIC_PRESERVATION_MANDATE,
    "",
    MEDIADORA_LINGUISTICA_MANDATE,
    "",
    PLAIN_LANGUAGE_PRINCIPLES,
  ].join("\n");

  const userPrompt = `Analise o edital a seguir e retorne as informações no formato JSON especificado.

EDITAL:
${truncated}

Retorne um JSON válido com exatamente estes campos:
{
  "resumo": "Resumo claro em 3-5 frases simples — mantendo todos os critérios e condições originais",
  "objetivo": "O que este edital quer alcançar, fiel ao documento",
  "quemPodeParticipar": "Quem tem direito de participar — sem omitir restrições",
  "prazoInscricao": "Data e hora limite EXATAMENTE como consta (ou 'Não informado' se não constar)",
  "ondeSeInscrever": "Como e onde se inscrever exatamente como consta (ou 'Não informado')",
  "principaisRequisitos": "Requisitos em linguagem simples mas fiel — não omita nenhuma exigência",
  "linguagemSimples": "Reescreva os pontos mais importantes em linguagem simples, como se explicasse para alguém que nunca leu um edital. Frases curtas. Preserve integralmente prazos, valores, critérios e obrigações."
}

Responda SOMENTE com o JSON, sem markdown, sem código, sem texto adicional.`;

  const model = getOpenAIModel();
  const start = Date.now();

  try {
    const completion = await openai.chat.completions.create({
      model,
      max_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    } as any);

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = extractJsonFromResponse(raw);
    const validated = SimplifyEditalResponse.safeParse(parsed);
    const latency = Date.now() - start;
    const usage = (completion as any)?.usage;
    const inputTokens = typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : null;
    const outputTokens = typeof usage?.completion_tokens === "number" ? usage.completion_tokens : null;
    const totalTokens = typeof usage?.total_tokens === "number" ? usage.total_tokens : null;

    if (!validated.success) {
      const e = new Error("AI response did not match expected schema");
      (e as any).validation = validated.error.format();
      (e as any).raw = raw;
      throw e;
    }

    await persistUsageLog({
      module: "AIService.simplifyEdital",
      model,
      userId: opts?.userId ?? null,
      documentId: opts?.documentId ?? null,
      latencyMs: latency,
      success: true,
      errorMessage: null,
      inputTokens,
      outputTokens,
      totalTokens,
      level: "info",
      message: "AI simplify request completed",
    });

    return validated.data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const latency = Date.now() - start;
    await persistUsageLog({
      module: "AIService.simplifyEdital",
      model,
      userId: opts?.userId ?? null,
      documentId: opts?.documentId ?? null,
      latencyMs: latency,
      success: false,
      errorMessage: message,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      level: "error",
      message: "AIService simplify error",
    });
    throw new Error(message);
  }
}

// ── analyzeAgent ───────────────────────────────────────────────────────────
/**
 * Executa um agente de análise de edital como mediador linguístico.
 *
 * Os 4 mandatos científicos (preservação semântica, mediação linguística,
 * linguagem simples, transparência) são injetados em todos os agentes via
 * buildAgentPrompt(), garantindo coerência científica em toda análise.
 *
 * O campo `alertas` no resultado sinaliza ambiguidades, inferências e pontos
 * que precisam ser verificados no documento original pelo usuário.
 */
export async function analyzeAgent(
  agentId: AgentId,
  text: string,
  profile?: unknown,
  opts?: { userId?: string | null; documentId?: string | null },
) {
  const truncated = text.length > 12000 ? text.slice(0, 12000) + "\n\n[Texto truncado para processamento]" : text;
  const parsedProfile = AgentUserProfileSchema.safeParse(profile ?? undefined);
  const { system, user } = buildAgentPrompt(agentId, truncated, parsedProfile.success ? parsedProfile.data : undefined);

  const model = getOpenAIModel();
  const start = Date.now();

  try {
    const completion = await openai.chat.completions.create({
      model,
      max_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    } as any);

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsedRaw = extractJsonFromResponse(raw);
    // gpt-4o-mini frequentemente omite o campo "type" mesmo com instruções explícitas.
    // Injetamos automaticamente antes de validar para evitar falha de schema.
    const parsed =
      parsedRaw !== null && typeof parsedRaw === "object" && !Array.isArray(parsedRaw) && !(parsedRaw as Record<string, unknown>).type
        ? { type: agentId, ...(parsedRaw as Record<string, unknown>) }
        : parsedRaw;
    const validator = VALIDATORS[agentId];
    const validated = validator.safeParse(parsed);
    const latency = Date.now() - start;
    const usage = (completion as any)?.usage;
    const inputTokens = typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : null;
    const outputTokens = typeof usage?.completion_tokens === "number" ? usage.completion_tokens : null;
    const totalTokens = typeof usage?.total_tokens === "number" ? usage.total_tokens : null;

    if (!validated.success) {
      const e = new Error(`AI response did not match expected schema: ${JSON.stringify(validated.error.format()).slice(0, 300)} | raw: ${raw.slice(0, 200)}`);
      (e as any).validation = validated.error.format();
      (e as any).raw = raw;
      await persistUsageLog({
        module: "AIService.analyzeAgent",
        model,
        userId: opts?.userId ?? null,
        documentId: opts?.documentId ?? null,
        latencyMs: latency,
        success: false,
        errorMessage: "validation_failure",
        inputTokens,
        outputTokens,
        totalTokens,
        agentId,
        level: "warn",
        message: "AI response validation failed",
      });
      throw e;
    }

    const canonical = buildCanonicalAnalysis(agentId, validated.data as Record<string, unknown>, text, parsedProfile.success ? parsedProfile.data : undefined);

    await persistUsageLog({
      module: "AIService.analyzeAgent",
      model,
      userId: opts?.userId ?? null,
      documentId: opts?.documentId ?? null,
      latencyMs: latency,
      success: true,
      errorMessage: null,
      inputTokens,
      outputTokens,
      totalTokens,
      agentId,
      level: "info",
      message: "AI request completed",
    });

    return {
      ...canonical,
      ...validated.data,
      type: agentId,
      agentResult: validated.data,
      analysisId: canonical.analysisId,
      schemaVersion: canonical.schemaVersion,
      interpretation: canonical.interpretation,
      cronograma: canonical.cronograma,
      checklist: canonical.checklist,
      elegibilidade: canonical.elegibilidade,
      valores: canonical.valores,
      documentosExigidos: canonical.documentosExigidos,
      alertas: canonical.alertas,
    } as Record<string, unknown>;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const latency = Date.now() - start;
    await persistUsageLog({
      module: "AIService.analyzeAgent",
      model,
      userId: opts?.userId ?? null,
      documentId: opts?.documentId ?? null,
      latencyMs: latency,
      success: false,
      errorMessage: message,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      agentId,
      level: "error",
      message: "AIService error",
    });
    throw new Error(`AIService error: ${message}`);
  }
}

export default { analyzeAgent };

// ═══════════════════════════════════════════════════════════════════════════
// MÓDULOS NIASci — Funções de análise especializadas
//
// Cada função segue o mesmo padrão do analyzeAgent:
//   1. Constrói prompt com os mandatos científicos do sistema
//   2. Chama a API OpenAI via cliente centralizado
//   3. Faz parse e validação com Zod
//   4. Registra métricas de uso no Supabase (ai_usage_logs)
//   5. Retorna resultado estruturado ou lança erro com mensagem clara
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Utilitário interno: chama OpenAI e retorna JSON parsed.
 * Centraliza o tratamento de resposta JSON para todos os módulos NIASci.
 *
 * @param system - Prompt de sistema com instruções e mandatos científicos
 * @param user - Prompt do usuário com o conteúdo a ser analisado
 * @param module - Nome do módulo para logging (ex: "NIASci.eLattes")
 * @param opts - Opções opcionais (userId para rastreabilidade)
 */
async function callNiasciAI(
  system: string,
  user: string,
  module: string,
  opts?: { userId?: string | null },
): Promise<Record<string, unknown>> {
  const model = getOpenAIModel();
  const start = Date.now();

  try {
    // response_format: json_object força a OpenAI a retornar JSON válido.
    // ATENÇÃO: exige que a palavra "JSON" apareça no prompt de sistema —
    // caso contrário, a API retorna erro 400 "Must contain word JSON".
    // temperature: 0.3 reduz criatividade para respostas mais determinísticas
    // e estruturadas (importante para manter o schema JSON estável).
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";

    let parsed: Record<string, unknown>;
    try {
      const candidate = JSON.parse(raw);
      // Valida que a resposta é um objeto não-nulo (nunca um array ou primitivo)
      if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
        throw new Error("Resposta da IA não é um objeto JSON válido.");
      }
      parsed = candidate as Record<string, unknown>;
    } catch (parseErr) {
      const parseMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      throw new Error(`${module}: JSON inválido recebido da IA — ${parseMsg}`);
    }

    const latency = Date.now() - start;
    const usage = (completion as any)?.usage;

    // Registra uso bem-sucedido no Supabase para rastreabilidade
    await persistUsageLog({
      module,
      model,
      userId: opts?.userId ?? null,
      documentId: null,
      latencyMs: latency,
      success: true,
      inputTokens: usage?.prompt_tokens ?? null,
      outputTokens: usage?.completion_tokens ?? null,
      totalTokens: usage?.total_tokens ?? null,
      level: "info",
      message: `${module} completed`,
    });

    return parsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const latency = Date.now() - start;

    // Registra falha para diagnóstico
    await persistUsageLog({
      module,
      model,
      userId: opts?.userId ?? null,
      documentId: null,
      latencyMs: latency,
      success: false,
      errorMessage: message,
      level: "error",
      message: `${module} failed`,
    });

    throw new Error(`${module}: ${message}`);
  }
}

// ── analyzeLattes ───────────────────────────────────────────────────────────
/**
 * Analisa um currículo Lattes e retorna dados acadêmicos estruturados.
 *
 * O prompt aplica os mandatos científicos do sistema (Princípios 1-4) para
 * garantir que a IA preserve o conteúdo do currículo sem inferir nem inventar
 * dados que não estão explicitamente presentes no texto.
 *
 * Integração: chamado pela rota POST /api/niasci/elattes/analyze
 *
 * @param text - Texto extraído do currículo Lattes (via PDF ou colar)
 * @param opts - Opções: userId para logging e rastreabilidade
 * @returns Objeto com resumo, timeline, competências, publicações, áreas e sugestões
 */
export async function analyzeLattes(text: string, opts?: { userId?: string | null }) {
  // Limpa bytes binários de PDF e ruído tipográfico antes de truncar
  const cleaned = text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const truncated = cleaned.length > 8000 ? cleaned.slice(0, 8000) + "\n[Texto truncado]" : cleaned;

  const system = [
    "Você é um assistente especializado em análise de currículos Lattes do CNPq para pesquisadores brasileiros.",
    "Sua função é estruturar as informações do currículo de forma organizada, acessível e útil para o pesquisador.",
    "",
    SEMANTIC_PRESERVATION_MANDATE,
    "",
    PLAIN_LANGUAGE_PRINCIPLES,
    "",
    TRANSPARENCY_MANDATE,
    "",
    "Responda SEMPRE em português brasileiro.",
    "Retorne SOMENTE um JSON válido sem markdown.",
  ].join("\n");

  const user = `Analise o currículo Lattes abaixo e retorne um JSON com exatamente esta estrutura.

INSTRUÇÕES IMPORTANTES:
1. TIMELINE: inclua TODOS os marcos cronológicos: formação (fundamental, médio, graduação, mestrado, doutorado), publicações com ano, premiações, participações, empregos. Ordene do mais recente para o mais antigo.
2. COMPETÊNCIAS: extraia de TODAS as fontes: áreas de interesse, linguagens, ferramentas, técnicas, idiomas, portfólio, projetos. Nunca retorne [].
3. SUGESTÕES DE EDITAIS: gere pelo menos 5 sugestões concretas com nome do programa, órgão financiador e motivo da compatibilidade com o perfil.
4. OPORTUNIDADES: gere pelo menos 4 oportunidades (bolsas, estágios, grupos de pesquisa, competições, certificações).
5. SUGESTÕES DE MELHORIA: gere pelo menos 6 sugestões organizadas em 3 categorias — "Currículo", "Produção Científica" e "Competências". Cada sugestão deve ser uma ação concreta que o pesquisador pode tomar. Sempre indique que são recomendações da IA.
6. ÍNDICE DE MATURIDADE CIENTÍFICA (0–100): calcule com base em: produção científica (25pts), participação em projetos (20pts), nível de formação (20pts), experiência (15pts), atualização do currículo (10pts), internacionalização (5pts), colaboração (5pts). Explique quais fatores reduziram a pontuação e sugira as 3 ações prioritárias.
7. Nunca invente publicações — se não houver, retorne publicacoes: [].
8. Nunca use frases como "considera-se", "presume-se" ou "é possível inferir" — se a informação não estiver no currículo, indique: "O documento não apresenta esse dado."

ESTRUTURA ESPERADA:
{
  "resumo": "Parágrafo executivo de 3-5 frases descrevendo o pesquisador: nível acadêmico, instituição, interesses e perfil geral.",
  "nomeInferido": "Nome completo extraído do texto (ou 'Não identificado')",
  "timeline": [{"year": "2024", "text": "Descrição clara do evento"}],
  "competencias": ["competência ou habilidade"],
  "publicacoes": ["referência bibliográfica completa — deixe [] se não houver"],
  "areas": ["área de pesquisa ou atuação identificada"],
  "sugestoes": ["Nome do edital — Órgão: motivo da compatibilidade"],
  "oportunidades": ["Oportunidade concreta: o que fazer e por quê"],
  "sugestoesMelhoria": {
    "curriculo": ["Sugestão concreta de melhoria do currículo"],
    "producaoCientifica": ["Sugestão concreta de produção científica"],
    "competencias": ["Competência pouco explorada e como desenvolvê-la"]
  },
  "maturidadeCientifica": {
    "score": 74,
    "explicacao": "Resumo em 2-3 frases dos fatores que mais impactaram a pontuação.",
    "fatoresRedutores": ["Fator que reduziu a pontuação — ex: ausência de ORCID"],
    "acoesPrioritarias": ["Ação 1 para aumentar a pontuação", "Ação 2", "Ação 3"]
  },
  "alertas": ["⚠ [categoria] descrição do problema. Impacto: consequência prática para o pesquisador — ex: '⚠ Não foi encontrado ORCID. Impacto: Alguns editais valorizam identificação internacional do pesquisador.'"]
}

CURRÍCULO LATTES:
${truncated}

Retorne APENAS o JSON válido. Nunca retorne listas vazias para competencias, sugestoes ou oportunidades.`;

  return callNiasciAI(system, user, "NIASci.analyzeLattes", opts);
}

// ── analyzeArtigo ───────────────────────────────────────────────────────────
/**
 * Analisa um artigo científico e extrai sua estrutura acadêmica completa.
 *
 * Identifica os componentes canônicos IMRaD (Introduction, Methods, Results
 * and Discussion) além de referências, citações e palavras-chave.
 *
 * Integração: chamado pela rota POST /api/niasci/artigos/analyze
 *
 * @param text - Texto completo do artigo científico
 * @param opts - Opções: userId para logging
 * @returns Estrutura completa do artigo com todos os componentes acadêmicos
 */
export async function analyzeArtigo(text: string, opts?: { userId?: string | null }) {
  const truncated = text.length > 14000 ? text.slice(0, 14000) + "\n[Texto truncado]" : text;

  const system = [
    "Você é um assistente de pesquisa acadêmica especializado em análise de artigos científicos brasileiros e internacionais.",
    "Sua função é extrair e estruturar os componentes canônicos do artigo de forma clara e fiel ao texto original.",
    "",
    SEMANTIC_PRESERVATION_MANDATE,
    "",
    PLAIN_LANGUAGE_PRINCIPLES,
    "",
    TRANSPARENCY_MANDATE,
    "",
    "Responda SEMPRE em português brasileiro.",
    "Retorne SOMENTE um JSON válido sem markdown.",
  ].join("\n");

  const user = `Analise o artigo científico abaixo e retorne um JSON com esta estrutura:
{
  "titulo": "Título do artigo (infira se não explícito)",
  "tipo": "Tipo do artigo: Revisão sistemática | Estudo experimental | Estudo de caso | Meta-análise | Relato de experiência | Outro",
  "resumo": "Resumo executivo em 3-5 frases claras preservando objetivo, método e resultados",
  "objetivo": "Objetivo principal da pesquisa em 1-3 frases diretas",
  "metodologia": "Abordagem metodológica utilizada (design, amostra, instrumentos, procedimentos)",
  "resultados": "Principais achados e dados quantitativos/qualitativos encontrados",
  "conclusoes": "Conclusões e contribuições do trabalho para a área",
  "limitacoes": "Limitações declaradas ou inferidas do estudo",
  "referencias": ["referência bibliográfica identificada no texto — máx 15"],
  "citacoes": [{"trecho": "trecho relevante citado", "relevancia": "por que esta citação é importante"}],
  "keywords": ["palavra-chave identificada — máx 8"],
  "sugestoesDeUso": ["como este artigo pode ser utilizado em pesquisas, ensino ou aplicações práticas"],
  "alertas": ["⚠ [categoria] descrição — apenas se houver problemas reais"]
}

ARTIGO:
${truncated}

Retorne APENAS o JSON válido.`;

  return callNiasciAI(system, user, "NIASci.analyzeArtigo", opts);
}

// ── analyzeProject ──────────────────────────────────────────────────────────
/**
 * Transforma a descrição de uma ideia de pesquisa em um plano de projeto
 * científico completo e estruturado.
 *
 * Gera todos os componentes necessários para gestão: objetivos, equipe
 * sugerida, cronograma por fases, indicadores de desempenho e análise de riscos.
 *
 * Integração: chamado pela rota POST /api/niasci/projetos/analyze
 *
 * @param description - Descrição livre do projeto de pesquisa
 * @param opts - Opções: userId para logging
 * @returns Plano de projeto completo com todos os componentes de gestão
 */
export async function analyzeProject(description: string, opts?: { userId?: string | null }) {
  const truncated = description.length > 8000 ? description.slice(0, 8000) + "\n[Truncado]" : description;

  const system = [
    "Você é um consultor especializado em gestão de projetos de pesquisa científica e inovação no Brasil.",
    "Sua função é transformar descrições de ideias de pesquisa em planos de projeto completos, realistas e bem estruturados.",
    "Baseie suas sugestões em boas práticas de gestão de projetos científicos e editais de fomento brasileiros (CNPq, CAPES, FAPs).",
    "",
    PLAIN_LANGUAGE_PRINCIPLES,
    "",
    TRANSPARENCY_MANDATE,
    "",
    "Responda SEMPRE em português brasileiro.",
    "Retorne SOMENTE um JSON válido sem markdown.",
  ].join("\n");

  const user = `Com base na descrição do projeto abaixo, gere um plano de projeto científico completo:
{
  "titulo": "Título sugerido para o projeto",
  "resumo": "Resumo executivo do projeto em 3-5 frases",
  "objetivos": ["objetivo geral do projeto", "objetivo específico 1", "objetivo específico 2"],
  "equipe": [{"papel": "Coordenador(a)", "responsabilidades": "descrição das responsabilidades"}, {"papel": "Pesquisador(a)", "responsabilidades": "..."}],
  "cronograma": [{"fase": "Fase 1 — Revisão bibliográfica", "duracao": "3 meses", "descricao": "atividades desta fase"}],
  "etapas": [{"nome": "nome da etapa", "descricao": "o que será feito", "entregavel": "produto ou resultado esperado"}],
  "indicadores": [{"nome": "nome do indicador", "meta": "valor ou resultado esperado", "metodologia": "como será medido"}],
  "riscos": [{"risco": "descrição do risco", "probabilidade": "Alta | Média | Baixa", "mitigacao": "estratégia de mitigação"}],
  "pendencias": ["ação necessária antes de iniciar o projeto"],
  "proximasAcoes": ["próxima ação concreta para avançar o projeto"],
  "alertas": ["⚠ [categoria] descrição — informações ausentes na descrição que são necessárias"]
}

DESCRIÇÃO DO PROJETO:
${truncated}

Retorne APENAS o JSON válido.`;

  return callNiasciAI(system, user, "NIASci.analyzeProject", opts);
}

// ── generatePlanetario ──────────────────────────────────────────────────────
/**
 * Gera conteúdo científico educativo e acessível sobre um tema específico.
 *
 * Adapta a linguagem ao público-alvo informado, aplicando os princípios
 * de linguagem simples (ISO 24495-1:2023) e mediação linguística para
 * tornar conceitos científicos complexos acessíveis a qualquer audiência.
 *
 * Integração: chamado pela rota POST /api/niasci/planetario/generate
 *
 * @param topic - Tema científico a ser explicado
 * @param audience - Público-alvo: criancas | jovens | adultos | geral
 * @param opts - Opções: userId para logging
 * @returns Conteúdo educativo completo com roteiro, curiosidades, quiz e glossário
 */
export async function generatePlanetario(
  topic: string,
  audience: string,
  opts?: { userId?: string | null },
) {
  const audienceLabel: Record<string, string> = {
    criancas: "crianças de 6 a 11 anos — linguagem lúdica, frases curtas, analogias do cotidiano",
    jovens: "adolescentes de 12 a 17 anos — linguagem engajante, exemplos práticos, conexão com tecnologia",
    adultos: "adultos leigos — linguagem clara, objetiva, sem jargão técnico excessivo",
    geral: "público geral de todas as idades — linguagem inclusiva, acessível e envolvente",
  };

  const system = [
    "Você é um educador científico especializado em divulgação científica e comunicação da ciência no Brasil.",
    `Crie conteúdo educativo para: ${audienceLabel[audience] ?? audienceLabel.geral}`,
    "Aplique os princípios de linguagem simples, analogias do cotidiano e exemplos práticos.",
    "",
    PLAIN_LANGUAGE_PRINCIPLES,
    "",
    "Responda SEMPRE em português brasileiro.",
    "Retorne SOMENTE um JSON válido sem markdown.",
  ].join("\n");

  const user = `Crie conteúdo científico educativo completo sobre o tema: "${topic}"

Retorne um JSON com esta estrutura:
{
  "titulo": "Título criativo e atrativo para o conteúdo",
  "introducao": "Parágrafo de introdução envolvente (3-4 frases que despertem curiosidade)",
  "explicacaoSimplificada": "Explicação do conceito em linguagem muito simples (5-7 frases, sem jargão)",
  "roteiro": [{"subtitulo": "subtítulo do tópico", "conteudo": "explicação clara do tópico em 3-4 frases"}],
  "curiosidades": ["fato surpreendente e verificável sobre o tema"],
  "perguntas": ["pergunta reflexiva para discussão em sala ou família"],
  "quiz": [{"pergunta": "pergunta de múltipla escolha", "opcoes": ["A) opção", "B) opção", "C) opção", "D) opção"], "resposta": "A", "explicacao": "por que esta é a resposta correta"}],
  "slides": [{"titulo": "título do slide", "conteudo": "texto do slide (máx 3 pontos)", "emoji": "emoji representativo"}],
  "glossario": [{"termo": "termo técnico", "definicao": "definição em linguagem simples"}],
  "fontes": ["nome da fonte confiável para aprofundamento"]
}

Retorne APENAS o JSON válido.`;

  return callNiasciAI(system, user, "NIASci.generatePlanetario", opts);
}

// ── chatNiasci ───────────────────────────────────────────────────────────────
/**
 * Processa uma mensagem do chat científico do Assistente IA NIASci.
 *
 * Mantém o contexto da conversa via histórico de mensagens e aplica
 * os princípios de linguagem simples para respostas acessíveis.
 * Pode receber contexto adicional dos outros módulos (e-Lattes, artigos, etc.)
 * para respostas mais personalizadas.
 *
 * Integração: chamado pela rota POST /api/niasci/chat
 *
 * @param messages - Histórico de mensagens no formato {role, content}[]
 * @param context - Contexto opcional de outros módulos (texto adicional)
 * @param opts - Opções: userId para logging
 * @returns Resposta do assistente como string de texto
 */
export async function chatNiasci(
  messages: { role: string; content: string }[],
  context?: string,
  opts?: { userId?: string | null },
): Promise<string> {
  const model = getOpenAIModel();
  const start = Date.now();

  // Prompt de sistema que define o papel do assistente científico
  const systemContent = [
    "Você é o Assistente IA do NIASci, um assistente científico especializado em apoiar pesquisadores, estudantes e educadores brasileiros.",
    "Sua função é responder perguntas sobre ciência, metodologia de pesquisa, currículos Lattes, artigos científicos, projetos de pesquisa e editais de fomento.",
    "Seja sempre preciso, cite fontes quando possível, e use linguagem acessível sem perder a precisão científica.",
    context ? `\n\nCONTEXTO ADICIONAL DO USUÁRIO:\n${context.slice(0, 3000)}` : "",
    "",
    PLAIN_LANGUAGE_PRINCIPLES,
    "",
    "Responda SEMPRE em português brasileiro.",
    "Seja direto, útil e encorajador. Não invente informações que não sabe.",
  ].join("\n");

  try {
    // Monta as mensagens incluindo o histórico da conversa
    const chatMessages = [
      { role: "system" as const, content: systemContent },
      // slice(-20): limita o histórico às 20 últimas mensagens.
      // GPT-4o tem janela de 128k tokens, mas conversas longas aumentam latência e custo.
      // 20 mensagens ≈ 3-5k tokens de histórico, deixando margem para o sistema e resposta.
      ...messages.slice(-20).map((m) => ({ // Mantém as últimas 20 mensagens (≈ 3-5k tokens)
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const completion = await openai.chat.completions.create({
      model,
      messages: chatMessages,
    });

    const response = completion.choices[0]?.message?.content ?? "Não consegui gerar uma resposta. Tente novamente.";
    const latency = Date.now() - start;
    const usage = (completion as any)?.usage;

    await persistUsageLog({
      module: "NIASci.chat",
      model,
      userId: opts?.userId ?? null,
      documentId: null,
      latencyMs: latency,
      success: true,
      inputTokens: usage?.prompt_tokens ?? null,
      outputTokens: usage?.completion_tokens ?? null,
      totalTokens: usage?.total_tokens ?? null,
      level: "info",
      message: "Chat response generated",
    });

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const latency = Date.now() - start;

    await persistUsageLog({
      module: "NIASci.chat",
      model,
      userId: opts?.userId ?? null,
      documentId: null,
      latencyMs: latency,
      success: false,
      errorMessage: message,
      level: "error",
      message: "Chat failed",
    });

    throw new Error(`Chat error: ${message}`);
  }
}
