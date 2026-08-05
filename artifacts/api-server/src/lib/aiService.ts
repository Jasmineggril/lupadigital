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

import {
  openai,
  getOpenAIClient,
  getOpenAIVisionClient,
  getOpenAIVisionModel,
  getOpenAIModel,
  getVisionClient,
  getVisionClients,
  createWithFallback,
  type FallbackResult,
} from "@workspace/integrations-openai-ai-server";
import { SimplifyEditalResponse } from "@workspace/api-zod";
import { randomUUID, createHash } from "crypto";
import { z } from "zod";
import { GLOBAL_BUDGET_MS, RESERVE_MS, MIN_CHUNK_TIMEOUT_MS, createTimeBudget, type TimeBudget } from "./timeBudget";
export { createTimeBudget };

const MAX_BACKOFF_MS = 30_000;

const DEFAULT_AI_MAX_INPUT_TOKENS = 12000;
const DEFAULT_AI_CHUNK_TARGET_TOKENS = 4000;
const DEFAULT_AI_CHUNK_OVERLAP_TOKENS = 400;
const DEFAULT_AI_CHUNK_CONCURRENCY = 1;

function getChunkingConfig() {
  const configuredTarget = Number.parseInt(process.env.AI_CHUNK_TARGET_TOKENS ?? "", 10) || DEFAULT_AI_CHUNK_TARGET_TOKENS;
  // O alvo de chunk é reduzido quando o TPM do provedor é baixo, para que um
  // chunk (tokens reais ≈ 1,25× da estimativa) + prompt de extração + saída
  // caibam no limite por minuto sem estourar (evita 413 de TPM).
  const tpm = getTpmLimit();
  const tpmAwareTarget = tpm > 0 ? Math.floor((tpm * 0.85 - 1124) / 1.25) : configuredTarget;
  return {
    maxInputTokens: Number.parseInt(process.env.AI_MAX_INPUT_TOKENS ?? "", 10) || DEFAULT_AI_MAX_INPUT_TOKENS,
    targetTokens: Math.max(800, Math.min(configuredTarget, tpmAwareTarget)),
    overlapTokens: Number.parseInt(process.env.AI_CHUNK_OVERLAP_TOKENS ?? "", 10) || DEFAULT_AI_CHUNK_OVERLAP_TOKENS,
    concurrency: Number.parseInt(process.env.AI_CHUNK_CONCURRENCY ?? "", 10) || DEFAULT_AI_CHUNK_CONCURRENCY,
  };
}

const DEFAULT_AI_TPM_LIMIT = 12000;
const PROMPT_BUDGET_SAFETY = 1.4;
const CHUNK_FACT_MAX_OUTPUT = 2048;
const TPM_WINDOW_MS = 60_000;

// Orçamento de tokens por minuto do provedor (limite do tier grátis medido).
// Groq/llama-3.3-70b-versatile: 12.000 TPM (medido via 413 da API).
function getTpmLimit(model?: string): number {
  const fromEnv = Number.parseInt(process.env.AI_TPM_LIMIT ?? "", 10);
  if (fromEnv > 0) return fromEnv;
  const m = (model ?? getOpenAIModel()).toLowerCase();
  if (m.includes("llama") || m.includes("groq")) return 12_000;
  if (m.includes("gemini")) return 100_000;
  if (m.includes("gpt")) return 60_000;
  return DEFAULT_AI_TPM_LIMIT;
}

// Reserva de saída que cabe no TPM: prompt estimado (com margem de segurança)
// + max_tokens + reserva não pode exceder o limite de tokens por minuto.
function calcRequestMaxTokens(estimatedPromptTokens: number, model?: string): number {
  const tpm = getTpmLimit(model);
  const availableForOutput = tpm - Math.ceil(estimatedPromptTokens * PROMPT_BUDGET_SAFETY) - OUTPUT_RESERVE;
  const modelMax = calcMaxOutputTokens(model);
  return Math.max(512, Math.min(modelMax, availableForOutput));
}

// ── Controle deslizante de TPM (janela de 60s) ──────────────────────────
// Registra o consumo REAL (prompt + completion) de cada chamada bem-sucedida
// e, antes de uma nova chamada, calcula o atraso necessário para que
// (consumo na janela + reserva da próxima chamada) não exceda o TPM do provedor.
const tpmWindow: Array<{ at: number; tokens: number }> = [];

function pruneTpmWindow(now: number) {
  while (tpmWindow.length && now - tpmWindow[0].at > TPM_WINDOW_MS) tpmWindow.shift();
}

function tpmUsedInWindow(now: number): number {
  pruneTpmWindow(now);
  return tpmWindow.reduce((sum, entry) => sum + entry.tokens, 0);
}

function recordTpmUsage(tokens: number) {
  if (tokens <= 0) return;
  pruneTpmWindow(Date.now());
  tpmWindow.push({ at: Date.now(), tokens });
}

// Em testes, as chaves são placeholders ("test-key"/"test-gemini-key") e as
// chamadas à IA são mockadas; pular o pacing evita sleeps artificiais de até
// 60s entre chunks supostamente instantâneos.
function isMockAiEnvironment(): boolean {
  const key = process.env.GROQ_API_KEY ?? process.env.GEMINI_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
  return !key || /^test[-_]/i.test(key) || key.length < 10;
}

async function waitForTpmBudget(reservationTokens: number): Promise<void> {
  if (isMockAiEnvironment()) return;
  const tpm = getTpmLimit();
  if (tpm <= 0) return;
  const now = Date.now();
  const used = tpmUsedInWindow(now);
  const projected = used + reservationTokens;
  if (projected <= tpm) return;

  const overflow = projected - tpm;
  // Avança o relógio até que tokens suficientes da janela expirem.
  let accrued = 0;
  let waitMs = 0;
  for (const entry of tpmWindow) {
    accrued += entry.tokens;
    if (accrued >= overflow) {
      waitMs = Math.max(0, entry.at + TPM_WINDOW_MS - now);
      break;
    }
  }
  // Se a janela inteira não cobrir o excesso, espera proporcionalmente.
  if (waitMs <= 0 && tpmWindow.length) {
    waitMs = Math.max(1_000, Math.ceil((overflow / tpm) * TPM_WINDOW_MS));
  }
  if (waitMs <= 0) return;
  logger.info({ step: "tpm_pacing_wait", waitMs, usedTokens: used, reservationTokens }, `TPM pacing: waiting ${Math.round(waitMs / 1000)}s`);
  await new Promise((resolve) => setTimeout(resolve, waitMs));
}

function getProviderNameFromModel(model: string): string {
  if (model.includes("llama")) return "groq";
  if (model.includes("gemini")) return "gemini";
  if (model.includes("gpt")) return "openai";
  return "unknown";
}

interface ModelContextConfig {
  contextWindow: number;
  maxOutputTokens: number;
  promptOverhead: number;
}

const MODEL_CONFIGS: Record<string, ModelContextConfig> = {
  groq: { contextWindow: 128_000, maxOutputTokens: 8_192, promptOverhead: 4_000 },
  gemini: { contextWindow: 1_000_000, maxOutputTokens: 8_192, promptOverhead: 4_000 },
  openai: { contextWindow: 128_000, maxOutputTokens: 16_384, promptOverhead: 4_000 },
};

const DEFAULT_MODEL_CONFIG: ModelContextConfig = { contextWindow: 128_000, maxOutputTokens: 4_096, promptOverhead: 4_000 };
const OUTPUT_RESERVE = 512;

function getModelContextConfig(model?: string): ModelContextConfig {
  const m = (model ?? getOpenAIModel()).toLowerCase();
  if (m.includes("llama") || m.includes("groq")) return MODEL_CONFIGS.groq;
  if (m.includes("gemini")) return MODEL_CONFIGS.gemini;
  if (m.includes("gpt")) return MODEL_CONFIGS.openai;
  return DEFAULT_MODEL_CONFIG;
}

function isContextLengthError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("context_length_exceeded") ||
    m.includes("maximum context length") ||
    (m.includes("context") && m.includes("length") && m.includes("exceed"))
  );
}

function calcMaxOutputTokens(model?: string): number {
  const config = getModelContextConfig(model);
  const available = config.contextWindow - config.promptOverhead - OUTPUT_RESERVE;
  return Math.min(config.maxOutputTokens, Math.max(512, available));
}

export function estimateTokens(text: string): number {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return 0;
  const words = compact.split(/\s+/).length;
  const chars = compact.length;
  return Math.max(1, Math.ceil((words * 1.3 + chars / 4) / 2));
}

function normalizeControlCharacters(text: string): string {
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, " ");
}

function normalizeDocumentText(raw: string): { text: string; pages: Array<{ pageNumber: number; text: string }> } {
  const withoutControl = normalizeControlCharacters(raw ?? "");
  const collapsed = withoutControl
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\u00A0]/g, " ").trim())
    .filter((line, index, arr) => {
      if (!line) return true;
      const prev = arr[index - 1];
      return !(prev && prev === line);
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const pages: Array<{ pageNumber: number; text: string }> = [];
  const pagePattern = /(?:^|\n)\s*(?:p[aá]gina|page)\s*[:#-]?\s*(\d+)/gi;
  const matches = [...collapsed.matchAll(pagePattern)];
  if (matches.length > 0) {
    for (let index = 0; index < matches.length; index += 1) {
      const match = matches[index];
      const start = match.index ?? 0;
      const next = matches[index + 1]?.index ?? collapsed.length;
      const pageText = collapsed.slice(start, next).trim();
      pages.push({ pageNumber: Number.parseInt(match[1], 10), text: pageText });
    }
  }

  return { text: collapsed, pages };
}

export interface DocumentChunk {
  chunkId: string;
  index: number;
  pageStart: number | null;
  pageEnd: number | null;
  sectionTitles: string[];
  text: string;
  estimatedTokens: number;
}

// Teto do orçamento de processamento em chunks (15 min). Acima disso o edital
// é grande demais para a janela diária/por-minuto do provedor e o fluxo
// degrada para "processamento parcial", devolvendo os chunks concluídos.
const MAX_CHUNKING_BUDGET_MS = 900_000;

// O orçamento global fixo (240s) cabe em TPM alto, mas a 6.000 TPM cada chunk
// leva ~60s só de pacing (janela deslizante de 60s) — um edital grande com 6+
// chunks estoura o orçamento e os últimos chunks são descartados. Aqui o
// orçamento é dimensionado pelo TPM do provedor:
//   (tokens de entrada × safety + saída total) / tpm × 60s + overhead por chunk + reserva.
function computeChunkingBudgetMs(chunks: DocumentChunk[]): number {
  if (isMockAiEnvironment() || chunks.length <= 1) return GLOBAL_BUDGET_MS;
  const tpm = getTpmLimit();
  if (tpm <= 0) return GLOBAL_BUDGET_MS;
  const totalInputTokens = chunks.reduce((sum, chunk) => sum + (chunk.estimatedTokens || 0), 0);
  const totalPromptTokens = Math.ceil(totalInputTokens * PROMPT_BUDGET_SAFETY);
  const totalOutputTokens = chunks.length * CHUNK_FACT_MAX_OUTPUT;
  const throughputMs = ((totalPromptTokens + totalOutputTokens) / tpm) * TPM_WINDOW_MS;
  const perChunkOverheadMs = chunks.length * 15_000;
  const estimatedMs = throughputMs + perChunkOverheadMs + RESERVE_MS;
  return Math.max(GLOBAL_BUDGET_MS, Math.min(estimatedMs, MAX_CHUNKING_BUDGET_MS));
}

export interface ChunkAnalysisFacts {
  documentInfo: Array<{ title?: string; organization?: string; page?: number; section?: string; text?: string; confidence?: "alta" | "média" | "baixa" }>;
  dates: Array<{ event?: string; value?: string; page?: number; section?: string; text?: string; confidence?: "alta" | "média" | "baixa" }>;
  requirements: Array<{ requirement?: string; page?: number; section?: string; text?: string; confidence?: "alta" | "média" | "baixa" }>;
  eligibility: Array<{ criterion?: string; page?: number; section?: string; text?: string; confidence?: "alta" | "média" | "baixa" }>;
  documents: Array<{ document?: string; page?: number; section?: string; text?: string; confidence?: "alta" | "média" | "baixa" }>;
  values: Array<{ value?: string; page?: number; section?: string; text?: string; confidence?: "alta" | "média" | "baixa" }>;
  contacts: Array<{ contact?: string; page?: number; section?: string; text?: string; confidence?: "alta" | "média" | "baixa" }>;
  obligations: Array<{ obligation?: string; page?: number; section?: string; text?: string; confidence?: "alta" | "média" | "baixa" }>;
  restrictions: Array<{ restriction?: string; page?: number; section?: string; text?: string; confidence?: "alta" | "média" | "baixa" }>;
  alerts: Array<{ message?: string; page?: number; section?: string; text?: string; confidence?: "alta" | "média" | "baixa" }>;
}

function getSectionTitles(text: string): string[] {
  const lines = text.split(/\n/).map((line) => line.trim()).filter(Boolean);
  return lines.filter((line) => line.length <= 120 && /[A-ZÁÉÍÓÚÂÊÔÃÕ]/.test(line) && !/^(http|www)/i.test(line)).slice(0, 3);
}

function getChunkOverlapText(previousText: string, overlapTokens: number): string {
  if (!previousText) return "";
  const compact = previousText.replace(/\s+/g, " ").trim();
  const maxChars = Math.max(120, Math.round(overlapTokens * 4));
  return compact.slice(-maxChars).trim();
}

/**
 * Divide um documento grande em blocos menores, preservando seções, títulos e contexto.
 * A função prioriza parágrafos e seções antes de cortar o texto em partes menores,
 * evitando truncamento silencioso e preservando a estrutura do documento.
 */
export function chunkDocument(text: string): DocumentChunk[] {
  const { text: normalizedText } = normalizeDocumentText(text);
  if (!normalizedText.trim()) return [];

  const { targetTokens, overlapTokens } = getChunkingConfig();
  const paragraphs = normalizedText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks: DocumentChunk[] = [];
  let currentText = "";
  let currentTitles: string[] = [];

  const flushChunk = (chunkText: string, sectionTitles: string[], previousText: string) => {
    if (!chunkText.trim()) return previousText;
    const estimatedTokens = estimateTokens(chunkText);
    chunks.push({
      chunkId: `chunk-${chunks.length + 1}`,
      index: chunks.length,
      pageStart: null,
      pageEnd: null,
      sectionTitles: sectionTitles.slice(0, 3),
      text: chunkText,
      estimatedTokens,
    });
    return chunkText;
  };

  const addParagraph = (paragraph: string, titles: string[]) => {
    const nextText = currentText ? `${currentText}\n\n${paragraph}` : paragraph;
    const nextTokens = estimateTokens(nextText);
    if (!currentText || nextTokens <= targetTokens) {
      currentText = nextText;
      currentTitles = currentTitles.length ? [...new Set([...currentTitles, ...titles])] : titles;
      return;
    }

    const overlapText = overlapTokens > 0 ? getChunkOverlapText(currentText, overlapTokens) : "";
    const chunkText = overlapText ? `${overlapText}\n\n${currentText}` : currentText;
    flushChunk(chunkText, currentTitles, currentText);
    currentText = overlapText ? `${overlapText}\n\n${paragraph}` : paragraph;
    currentTitles = titles;
  };

  const splitParagraphIntoPieces = (paragraph: string, target: number): string[] => {
    const pieces: string[] = [];
    let current = "";
    const sentences = paragraph.match(/[^.!?]+[.!?]*\s*/g) ?? [paragraph];
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;
      const candidate = current ? `${current} ${trimmed}` : trimmed;
      if (!current || estimateTokens(candidate) <= target) {
        current = candidate;
      } else {
        if (current) pieces.push(current);
        current = trimmed;
      }
    }
    if (current) pieces.push(current);
    return pieces;
  };

  paragraphs.forEach((paragraph) => {
    const titles = getSectionTitles(paragraph);
    const paragraphTokens = estimateTokens(paragraph);
    if (paragraphTokens > targetTokens) {
      for (const piece of splitParagraphIntoPieces(paragraph, targetTokens)) {
        addParagraph(piece, titles);
      }
      return;
    }
    addParagraph(paragraph, titles);
  });

  if (currentText.trim()) {
    const overlapText = overlapTokens > 0 ? getChunkOverlapText(currentText, overlapTokens) : "";
    const chunkText = overlapText ? `${overlapText}\n\n${currentText}` : currentText;
    flushChunk(chunkText, currentTitles, currentText);
  }

  return chunks.map((chunk, index) => ({ ...chunk, index }));
}

function normalizeFactText(value?: string): string {
  return (value ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Detecta retificações no texto do edital e resolve conflitos de datas.
 * 
 * Regra: retificação posterior vence texto original anterior.
 * 
 * Exemplo de padrão detectado:
 *   "O item 2 passa a viger com a seguinte redação: ... até 14 de agosto de 2026"
 *   (original dizia "até 31 de julho de 2026")
 */
interface Retification {
  campo: string;
  valorOriginal: string;
  valorVigente: string;
  documentoRetificacao: string;
  paginaRetificacao?: number;
  trechoRetificacao?: string;
}

export function detectRetifications(originalText: string): Retification[] {
  if (!originalText || !originalText.trim()) return [];
  
  const retifications: Retification[] = [];
  const normalized = originalText.toLowerCase();
  
  // Padrão 1: "passa a viger com a seguinte redação" + data nova
  const retificationPatterns = [
    /passa\s+a\s+viger\s+com\s+a\s+seguinte\s+redação/gi,
    /retifica[çc][ãa]o.*?(?:altera|modifica|muda)/gi,
    /alteração.*?(?:encerramento|prazo|data)/gi,
    /prazo.*?(?:alterado|prorrogado|extendido)/gi,
    /até\s+(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/gi,
  ];
  
  // Busca por padrões de retificação
  for (const pattern of retificationPatterns) {
    const matches = Array.from(originalText.matchAll(pattern));
    for (const match of matches) {
      // Extrai datas do contexto da retificação
      const contextStart = Math.max(0, match.index! - 200);
      const contextEnd = Math.min(originalText.length, match.index! + match[0].length + 500);
      const context = originalText.slice(contextStart, contextEnd);
      
      // Busca datas no contexto
      const datePattern = /(\d{1,2})\s+de\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/gi;
      const dates = Array.from(context.matchAll(datePattern));
      
      if (dates.length >= 2) {
        // Se encontrou duas datas, assume que a primeira é original e a segunda é vigente
        retifications.push({
          campo: "encerramento de inscrições",
          valorOriginal: dates[0][0],
          valorVigente: dates[1][0],
          documentoRetificacao: match[0],
          trechoRetificacao: context.slice(0, 200),
        });
      }
    }
  }
  
  // Padrão 2: Busca por "até [data original]" seguido de "até [data nova]"
  const untilPattern = /até\s+(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/gi;
  const untilMatches = Array.from(originalText.matchAll(untilPattern));
  
  if (untilMatches.length >= 2) {
    // Verifica se há contexto de retificação entre as datas
    for (let i = 0; i < untilMatches.length - 1; i++) {
      const first = untilMatches[i];
      const second = untilMatches[i + 1];
      
      if (first.index !== undefined && second.index !== undefined) {
        const between = originalText.slice(first.index! + first[0].length, second.index!);
        
        // Se há palavras-chave de retificação entre as datas
        if (/passa|viger|redação|retifica|altera/i.test(between)) {
          // Verifica se não já adicionou esta retificação
          const alreadyExists = retifications.some(
            r => r.valorOriginal === first[0] && r.valorVigente === second[0]
          );
          
          if (!alreadyExists) {
            retifications.push({
              campo: "encerramento de inscrições",
              valorOriginal: first[0],
              valorVigente: second[0],
              documentoRetificacao: between.trim(),
              trechoRetificacao: between.slice(0, 200),
            });
          }
        }
      }
    }
  }
  
  return retifications;
}

/**
 * Aplica retificações a um array de itens do cronograma.
 * 
 * Regra: retificação posterior vence texto original anterior.
 * 
 * Para cada retificação encontrada:
 * 1. Marca o valor original como "Prazo original, posteriormente alterado pela retificação"
 * 2. Usa o valor vigente como o prazo atual
 */
function applyRetificationsToTimeline(
  items: Array<Record<string, unknown>>,
  retifications: Retification[],
  originalText: string,
): Array<Record<string, unknown>> {
  if (!retifications.length) return items;
  
  return items.map(item => {
    const updated = { ...item };
    
    for (const ret of retifications) {
      // Verifica se este item contém a data original
      const periodo = typeof updated.periodo === "string" ? updated.periodo : "";
      const descricao = typeof updated.descricao === "string" ? updated.descricao : "";
      
      if (periodo.includes(ret.valorOriginal) || descricao.includes(ret.valorOriginal)) {
        // Marca como retificado
        updated.retificado = true;
        updated.dataOriginal = ret.valorOriginal;
        updated.valorVigente = ret.valorVigente;
        updated.observacaoRetificacao = `Prazo original (${ret.valorOriginal}), posteriormente alterado pela retificação para ${ret.valorVigente}.`;
        
        // Atualiza o período para mostrar o valor vigente
        if (periodo.includes(ret.valorOriginal)) {
          updated.periodo = periodo.replace(ret.valorOriginal, ret.valorVigente);
        }
      }
    }
    
    return updated;
  });
}

function mergeFacts<T extends Record<string, unknown>>(items: T[], keyField: string): T[] {
  const merged = new Map<string, T>();

  items.forEach((item) => {
    const key = normalizeFactText(String((item as Record<string, unknown>)[keyField] ?? ""));
    if (!key) return;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, item);
      return;
    }

    Object.entries(item).forEach(([field, value]) => {
      const currentValue = (existing as Record<string, unknown>)[field];
      if (currentValue && !String(currentValue).trim()) {
        (existing as Record<string, unknown>)[field] = value;
      }
    });
  });

  return Array.from(merged.values());
}

/**
 * Consolida fatos extraídos de blocos diferentes, removendo duplicidades e preservando as fontes.
 */
export function consolidateChunkFacts(chunkResults: Array<{ chunkId: string; facts: ChunkAnalysisFacts }>): ChunkAnalysisFacts {
  return {
    documentInfo: mergeFacts(chunkResults.flatMap((entry) => entry.facts.documentInfo.map((fact) => ({ ...fact, chunkId: entry.chunkId }))), "title"),
    dates: mergeFacts(chunkResults.flatMap((entry) => entry.facts.dates.map((fact) => ({ ...fact, chunkId: entry.chunkId }))), "event"),
    requirements: mergeFacts(chunkResults.flatMap((entry) => entry.facts.requirements.map((fact) => ({ ...fact, chunkId: entry.chunkId }))), "requirement"),
    eligibility: mergeFacts(chunkResults.flatMap((entry) => entry.facts.eligibility.map((fact) => ({ ...fact, chunkId: entry.chunkId }))), "criterion"),
    documents: mergeFacts(chunkResults.flatMap((entry) => entry.facts.documents.map((fact) => ({ ...fact, chunkId: entry.chunkId }))), "document"),
    values: mergeFacts(chunkResults.flatMap((entry) => entry.facts.values.map((fact) => ({ ...fact, chunkId: entry.chunkId }))), "value"),
    contacts: mergeFacts(chunkResults.flatMap((entry) => entry.facts.contacts.map((fact) => ({ ...fact, chunkId: entry.chunkId }))), "contact"),
    obligations: mergeFacts(chunkResults.flatMap((entry) => entry.facts.obligations.map((fact) => ({ ...fact, chunkId: entry.chunkId }))), "obligation"),
    restrictions: mergeFacts(chunkResults.flatMap((entry) => entry.facts.restrictions.map((fact) => ({ ...fact, chunkId: entry.chunkId }))), "restriction"),
    alerts: mergeFacts(chunkResults.flatMap((entry) => entry.facts.alerts.map((fact) => ({ ...fact, chunkId: entry.chunkId }))), "message"),
  };
}

function buildFallbackChunkFacts(chunkText: string): ChunkAnalysisFacts {
  const lines = chunkText.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const dates = Array.from(chunkText.matchAll(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+de\s+[\wáéíóúçãõ]+\s+de\s+\d{4})\b/gi)).map((match) => ({ value: match[0], text: match[0] }));
  const requirements = lines.filter((line) => /deve|obrigat|requisito|documento|inscri/i.test(line)).slice(0, 5).map((line) => ({ requirement: line }));
  const obligations = lines.filter((line) => /deve|obrigat|entreg|apresent|cumpr/i.test(line)).slice(0, 5).map((line) => ({ obligation: line }));
  const documents = Array.from(new Set(
    lines.flatMap((line) => {
      const matches = Array.from(line.matchAll(/\b(CPF|RG|CNH|currículo|curriculo|comprovante(?:\s+de\s+residência|\s+de\s+residencia)?|declaração|declaração de residência|declaração de renda|certidão|certificado)\b/gi));
      return matches.map((match) => {
        const raw = match[1];
        if (/currículo|curriculo/i.test(raw)) return "currículo";
        if (/comprovante/i.test(raw)) return "comprovante de residência";
        if (/declaração/i.test(raw)) return "declaração";
        if (/certidão/i.test(raw)) return "certidão";
        return raw.toUpperCase();
      });
    })
  )).map((document) => ({ document }));
  const alerts = lines.filter((line) => /atenção|importante|aviso|alerta/i.test(line)).slice(0, 3).map((line) => ({ message: line }));

  return {
    documentInfo: lines.slice(0, 2).filter((line) => line.length < 140).map((line) => ({ title: line })),
    dates,
    requirements,
    eligibility: lines.filter((line) => /idade|residir|renda|escolaridade|perfil/i.test(line)).slice(0, 3).map((line) => ({ criterion: line })),
    documents,
    values: Array.from(chunkText.matchAll(/R\$\s*\d{1,3}(?:[\.,]\d{3})*(?:[\.,]\d{2})?/gi)).map((match) => ({ value: match[0] })),
    contacts: [],
    obligations,
    restrictions: lines.filter((line) => /não|proib|restri/i.test(line)).slice(0, 3).map((line) => ({ restriction: line })),
    alerts,
  };
}

const CHUNK_FACT_KEYS = ["documentInfo", "dates", "requirements", "eligibility", "documents", "values", "contacts", "obligations", "restrictions", "alerts"] as const;

// A Groq frequentemente devolve um objeto único no lugar de uma lista
// (ex.: {"documentInfo": {...}} em vez de {"documentInfo": [...]}).
// Normaliza valores objeto em listas de um elemento antes da validação.
function normalizeChunkFactsPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const source = payload as Record<string, unknown>;
  const normalized: Record<string, unknown> = { ...source };
  for (const key of CHUNK_FACT_KEYS) {
    const value = source[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      normalized[key] = [value];
    }
  }
  return normalized;
}

function buildHeuristicAgentResult(agentId: AgentId, text: string, profile?: z.infer<typeof AgentUserProfileSchema>, reason?: string) {
  const { text: normalizedText } = normalizeDocumentText(text);
  const lines = normalizedText.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const fallbackFacts = buildFallbackChunkFacts(normalizedText);
  const title = lines[0] && lines[0].length < 140 ? lines[0] : fallbackFacts.documentInfo[0]?.title || "Edital público";
  const organization = lines.find((line) => /prefeitura|secretaria|município|universidade|empresa|fundação|estado|instituto|governo/i.test(line)) || fallbackFacts.documentInfo[0]?.organization || "Não informado";
  const requirements = fallbackFacts.requirements.map((item) => item.requirement).filter(Boolean);
  const documents = fallbackFacts.documents.map((item) => item.document).filter(Boolean);
  const values = fallbackFacts.values.map((item) => item.value).filter(Boolean);
  const eligibility = fallbackFacts.eligibility.map((item) => item.criterion).filter(Boolean);
  const dates = fallbackFacts.dates.map((item) => item.value).filter(Boolean);
  const fallbackAlert = {
    categoria: "fallback" as const,
    descricao: reason
      ? `Análise heurística gerada porque a IA não concluiu o processamento: ${reason}`
      : "Análise heurística gerada porque a IA não concluiu o processamento.",
    severidade: "média" as const,
  };

  return {
    type: agentId,
    tipoEdital: title,
    instituicao: organization,
    prazo: dates.join(" | ") || "Prazo não informado.",
    publicoAlvo: profile?.municipio ? `Público-alvo relacionado ao perfil de ${profile.municipio}.` : "Público-alvo conforme o edital.",
    requisitos: requirements.length > 0 ? requirements.slice(0, 8) : ["Requisitos não identificados com confiança no texto disponível."],
    documentos: documents.length > 0 ? documents.slice(0, 8) : ["Documentos não identificados com confiança no texto disponível."],
    valor: values.join(" | ") || "Não informado",
    timeline: fallbackFacts.dates.map((item) => ({
      fase: item.event || "Evento",
      periodo: item.value || "Verificar no edital",
      descricao: item.text || item.event || "Data identificada no texto",
      status: "ativo" as const,
      confianca: "baixa" as const,
    })),
    checklist: documents.length > 0
      ? documents.slice(0, 8).map((document) => ({
          doc: document,
          obrigatorio: true,
          observacao: "Documento identificado no texto disponível.",
          checked: false,
        }))
      : [{
          doc: "Documentos não identificados com confiança no texto disponível.",
          obrigatorio: true,
          observacao: "Não foi possível identificar documentos com confiança no texto fornecido.",
          checked: false,
        }],
    criterios: eligibility.length > 0
      ? eligibility.slice(0, 6).map((criterion) => ({
          criterio: criterion,
          atende: true,
          observacao: "Critério identificado no texto disponível.",
        }))
      : [{
          criterio: "Critérios de elegibilidade não identificados com confiança.",
          atende: false,
          observacao: "A análise heurística não encontrou critérios explícitos no texto.",
        }],
    observacao: "Análise heurística construída a partir do texto disponível porque a IA não concluiu o processamento.",
    alertas: [
      fallbackAlert,
      ...fallbackFacts.alerts.map((item) => item.message || item.text || "Alerta identificado no texto.").filter(Boolean),
    ],
    processing: {
      mode: "fallback" as const,
      totalChunks: 1,
      processedChunks: 1,
      failedChunks: 0,
      complete: true,
    },
    originalText: normalizedText,
  };
}

function buildHeuristicCanonicalAnalysis(agentId: AgentId, text: string, profile?: z.infer<typeof AgentUserProfileSchema>, reason?: string) {
  const agentResult = buildHeuristicAgentResult(agentId, text, profile, reason);
  const canonical = buildCanonicalAnalysis(agentId, agentResult as Record<string, unknown>, text, profile);
  return {
    ...canonical,
    ...agentResult,
    type: agentId,
    agentResult,
    analysisId: canonical.analysisId,
    schemaVersion: canonical.schemaVersion,
    interpretation: canonical.interpretation,
    cronograma: canonical.cronograma,
    checklist: canonical.checklist,
    elegibilidade: canonical.elegibilidade,
    valores: canonical.valores,
    documentosExigidos: canonical.documentosExigidos,
    alertas: canonical.alertas,
    processing: canonical.processing,
  } as Record<string, unknown>;
}

const ChunkFactsSchema = z.object({
  documentInfo: z.array(z.object({ title: z.string().optional(), organization: z.string().optional(), page: z.number().int().nullable().optional(), section: z.string().optional(), text: z.string().optional(), confidence: z.enum(["alta", "média", "baixa"]).optional() })).default([]),
  dates: z.array(z.object({ event: z.string().optional(), value: z.string().optional(), page: z.number().int().nullable().optional(), section: z.string().optional(), text: z.string().optional(), confidence: z.enum(["alta", "média", "baixa"]).optional() })).default([]),
  requirements: z.array(z.object({ requirement: z.string().optional(), page: z.number().int().nullable().optional(), section: z.string().optional(), text: z.string().optional(), confidence: z.enum(["alta", "média", "baixa"]).optional() })).default([]),
  eligibility: z.array(z.object({ criterion: z.string().optional(), page: z.number().int().nullable().optional(), section: z.string().optional(), text: z.string().optional(), confidence: z.enum(["alta", "média", "baixa"]).optional() })).default([]),
  documents: z.array(z.object({ document: z.string().optional(), page: z.number().int().nullable().optional(), section: z.string().optional(), text: z.string().optional(), confidence: z.enum(["alta", "média", "baixa"]).optional() })).default([]),
  values: z.array(z.object({ value: z.string().optional(), page: z.number().int().nullable().optional(), section: z.string().optional(), text: z.string().optional(), confidence: z.enum(["alta", "média", "baixa"]).optional() })).default([]),
  contacts: z.array(z.object({ contact: z.string().optional(), page: z.number().int().nullable().optional(), section: z.string().optional(), text: z.string().optional(), confidence: z.enum(["alta", "média", "baixa"]).optional() })).default([]),
  obligations: z.array(z.object({ obligation: z.string().optional(), page: z.number().int().nullable().optional(), section: z.string().optional(), text: z.string().optional(), confidence: z.enum(["alta", "média", "baixa"]).optional() })).default([]),
  restrictions: z.array(z.object({ restriction: z.string().optional(), page: z.number().int().nullable().optional(), section: z.string().optional(), text: z.string().optional(), confidence: z.enum(["alta", "média", "baixa"]).optional() })).default([]),
  alerts: z.array(z.object({ message: z.string().optional(), page: z.number().int().nullable().optional(), section: z.string().optional(), text: z.string().optional(), confidence: z.enum(["alta", "média", "baixa"]).optional() })).default([]),
});

function buildChunkFactPrompt(agentId: AgentId, chunkText: string, profile?: z.infer<typeof AgentUserProfileSchema>) {
  const profileInfo = profile && agentId === "elegibilidade"
    ? `\n\nPERFIL DO USUÁRIO:\n- Escolaridade: ${profile.escolaridade}\n- Área de atuação: ${profile.atuacao || "não informada"}\n- Município/UF: ${profile.municipio || "não informada"}\n- Renda familiar: ${profile.rendaFamiliar}`
    : "";

  const system = [
    "Você é um assistente especializado em extração estruturada de fatos de editais públicos.",
    "Extraia apenas fatos explícitos e rastreáveis do trecho abaixo.",
    "Não invente ou adicione informações ausentes.",
    "Preserve páginas, seções e trechos de origem quando possível.",
    "Responda apenas em JSON válido.",
  ].join("\n");

  const user = `Extraia fatos estruturados do trecho abaixo e devolva um JSON com as chaves documentInfo, dates, requirements, eligibility, documents, values, contacts, obligations, restrictions e alerts. CADA chave deve ser uma LISTA (array) de objetos; se houver um único fato, devolva uma lista com um único elemento. Nunca use objetos avulsos no lugar de listas.${profileInfo}\n\nTRECHO:\n${chunkText}`;

  return { system, user };
}

async function analyzeChunkFacts(agentId: AgentId, chunkText: string, profile?: z.infer<typeof AgentUserProfileSchema>, opts?: { userId?: string | null; documentId?: string | null; chunkTimeoutMs?: number; chunkId?: string }) {
  const { system, user } = buildChunkFactPrompt(agentId, chunkText, profile);
  const chunkStart = Date.now();
  const timeoutMs = opts?.chunkTimeoutMs ?? 60_000;
  const model = getOpenAIModel();
  const provider = getProviderNameFromModel(model);
  const estimatedInputTokens = estimateTokens(chunkText);
  const estimatedPromptTokens = estimateTokens(system) + estimateTokens(user);
  const requestedMaxOutputTokens = Math.min(calcRequestMaxTokens(estimatedPromptTokens, model), CHUNK_FACT_MAX_OUTPUT);
  const estimatedTotalTokens = estimatedInputTokens + estimatedPromptTokens + requestedMaxOutputTokens;

  logger.info({
    step: "chunk_ai_request",
    provider,
    model,
    chunkId: opts?.chunkId ?? "unknown",
    estimatedInputTokens,
    estimatedPromptTokens,
    requestedMaxOutputTokens,
    estimatedTotalTokens,
    contextWindow: getModelContextConfig(model).contextWindow,
    messageCount: 2,
    timeoutMs,
  }, `AI request: ${provider}/${model} — ~${estimatedTotalTokens} tokens (input: ~${estimatedInputTokens}, prompt: ~${estimatedPromptTokens}, max_output: ${requestedMaxOutputTokens})`);

  let completionResult;
  try {
    await waitForTpmBudget(Math.ceil(estimatedPromptTokens * PROMPT_BUDGET_SAFETY) + requestedMaxOutputTokens);
    completionResult = await createJsonChatCompletion({
      model,
      max_tokens: requestedMaxOutputTokens,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }, "AIService.analyzeChunkFacts", 2, { signal: AbortSignal.timeout(timeoutMs) });

    const usageTokens = completionResult.usage
      ? (completionResult.usage.prompt_tokens ?? 0) + (completionResult.usage.completion_tokens ?? 0)
      : 0;
    recordTpmUsage(usageTokens || estimatedPromptTokens + requestedMaxOutputTokens);
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    const httpMatch = errMessage.match(/status[_\s]*(\d{3})/i) ?? errMessage.match(/\b(4\d{2}|5\d{2})\b/);
    const httpStatus = httpMatch ? Number(httpMatch[1]) : null;
    const sanitizedError = errMessage
      .replace(/sk-[a-zA-Z0-9]{20,}/g, "[REDACTED]")
      .replace(/gsk_[a-zA-Z0-9]{20,}/g, "[REDACTED]")
      .replace(/key[_\s]*[:=][_\s]*["']?[a-zA-Z0-9]{20,}["']?/gi, "key=[REDACTED]")
      .slice(0, 500);

    logger.error({
      step: "chunk_ai_error",
      provider,
      model,
      chunkId: opts?.chunkId ?? "unknown",
      estimatedInputTokens,
      estimatedPromptTokens,
      requestedMaxOutputTokens,
      estimatedTotalTokens,
      httpStatus,
      sanitizedError,
      durationMs: Date.now() - chunkStart,
    }, `AI error: ${provider}/${model} — HTTP ${httpStatus ?? "unknown"} — ${sanitizedError.slice(0, 200)}`);

    throw error;
  }

  const { parsed } = completionResult;

  if (completionResult.fallbackAttempted) {
    logger.warn({
      module: "analyzeChunkFacts",
      provider: completionResult.provider,
      model: completionResult.model,
      durationMs: Date.now() - chunkStart,
      fallbackAttempted: true,
      fallbackSucceeded: completionResult.fallbackSucceeded,
    }, "Chunk fallback triggered");
  }

  const validated = ChunkFactsSchema.safeParse(normalizeChunkFactsPayload(parsed));
  if (!validated.success) {
    throw new Error(`AIService: resposta da IA não é um ChunkFacts válido: ${validated.error.message}`);
  }

  return validated.data as ChunkAnalysisFacts;
}

function parseRetryAfterMs(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const anyErr = err as Record<string, unknown>;
  const cause = anyErr.cause as Record<string, unknown> | undefined;
  const headers = (cause?.headers ?? anyErr.headers) as Record<string, unknown> | undefined;
  if (headers) {
    const raw = headers["retry-after"] ?? headers["Retry-After"];
    if (raw != null) {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return n * 1000;
    }
  }
  const body = cause?.body as Record<string, unknown> | undefined;
  if (body && typeof body["retry_after"] === "number") return body["retry_after"] * 1000;
  return null;
}

function splitChunkText(text: string): [string, string] {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  if (paragraphs.length <= 1) {
    const mid = Math.ceil(text.length / 2);
    return [text.slice(0, mid), text.slice(mid)];
  }
  const mid = Math.ceil(paragraphs.length / 2);
  return [paragraphs.slice(0, mid).join("\n\n"), paragraphs.slice(mid).join("\n\n")];
}

function buildSubChunk(original: DocumentChunk, text: string, suffix: string): DocumentChunk {
  return {
    ...original,
    chunkId: `${original.chunkId}-${suffix}`,
    text,
    estimatedTokens: estimateTokens(text),
  };
}

async function processChunkWithRetry(
  agentId: AgentId,
  chunk: DocumentChunk,
  budget: TimeBudget,
  totalChunks: number,
  processedCount: number,
  profile?: z.infer<typeof AgentUserProfileSchema>,
  opts?: { userId?: string | null; documentId?: string | null },
  depth = 0,
): Promise<{ ok: true; chunk: DocumentChunk; facts: ChunkAnalysisFacts } | { ok: false; chunk: DocumentChunk; error: string }> {
  const maxAttempts = 3;
  const maxDepth = 2;
  const timeoutMs = budget.getChunkTimeoutMs(totalChunks, processedCount);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const facts = await analyzeChunkFacts(agentId, chunk.text, profile, {
        ...opts,
        chunkTimeoutMs: timeoutMs,
        chunkId: chunk.chunkId,
      });
      return { ok: true as const, chunk, facts };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);

      if (isContextLengthError(message) && depth < maxDepth) {
        logger.warn({
          step: "context_length_subdivide",
          agentId,
          chunkId: chunk.chunkId,
          depth,
          chunkTokens: chunk.estimatedTokens,
        }, `Chunk exceeded context length — subdividing (depth ${depth + 1}/${maxDepth})`);

        const [textA, textB] = splitChunkText(chunk.text);
        const subA = buildSubChunk(chunk, textA, "a");
        const subB = buildSubChunk(chunk, textB, "b");

        const [resultA, resultB] = await Promise.all([
          processChunkWithRetry(agentId, subA, budget, totalChunks, processedCount, profile, opts, depth + 1),
          processChunkWithRetry(agentId, subB, budget, totalChunks, processedCount, profile, opts, depth + 1),
        ]);

        const successes = [resultA, resultB].filter((r) => r.ok) as Array<{ ok: true; chunk: DocumentChunk; facts: ChunkAnalysisFacts }>;
        if (successes.length === 0) {
          const firstErr = !resultA.ok ? resultA.error : !resultB.ok ? resultB.error : "subdivision failed";
          return { ok: false as const, chunk, error: `Subdivisão falhou para ${chunk.chunkId}: ${firstErr}` };
        }

        const consolidated = consolidateChunkFacts(successes.map((s) => ({ chunkId: s.chunk.chunkId, facts: s.facts })));
        logger.info({
          step: "context_length_subdivided_ok",
          agentId,
          chunkId: chunk.chunkId,
          subChunksProcessed: successes.length,
        }, `Subdivision succeeded: ${successes.length}/2 sub-chunks OK`);
        return { ok: true as const, chunk, facts: consolidated };
      }

      const classification = classifyAiError(message);
      const isRateLimit = classification.reason === "rate_limit";

      if (!classification.retryable || attempt >= maxAttempts) {
        return { ok: false as const, chunk, error: message };
      }

      if (!budget.canStartChunk(totalChunks, processedCount)) {
        logger.warn({ step: "budget_exhausted", agentId, chunkId: chunk.chunkId, attempt }, "No time budget remaining for retry");
        return { ok: false as const, chunk, error: `Orçamento de tempo esgotado. ${message}` };
      }

      let delayMs: number;
      if (isRateLimit) {
        const retryAfter = parseRetryAfterMs(error);
        if (retryAfter) {
          delayMs = retryAfter;
        } else if (classification.tpm) {
          // Limite de tokens por minuto: espera suficiente para a janela de 60s
          // liberar orçamento, em vez de backoff exponencial curto ineficaz.
          delayMs = Math.min(45_000, MAX_BACKOFF_MS);
        } else {
          const baseDelay = Math.min(1000 * Math.pow(2, attempt - 1), MAX_BACKOFF_MS);
          delayMs = baseDelay + Math.random() * 1000;
        }
      } else {
        delayMs = 1000;
      }

      const waitUntil = Date.now() + delayMs;
      if (waitUntil - budget.startMs + RESERVE_MS > budget.globalBudgetMs) {
        logger.warn({ step: "backoff_would_exceed_budget", agentId, chunkId: chunk.chunkId, delayMs, attempt }, "Backoff would exceed global budget");
        return { ok: false as const, chunk, error: `Orçamento de tempo insuficiente para retry. ${message}` };
      }

      logger.info({ step: "retry_wait", agentId, chunkId: chunk.chunkId, attempt, delayMs, isRateLimit }, `Waiting ${Math.round(delayMs)}ms before retry`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return { ok: false as const, chunk, error: lastError instanceof Error ? lastError.message : String(lastError) };
}

async function processDocumentInChunks(agentId: AgentId, text: string, profile?: z.infer<typeof AgentUserProfileSchema>, opts?: { userId?: string | null; documentId?: string | null }) {
  const { text: normalizedText } = normalizeDocumentText(text);
  const chunks = chunkDocument(normalizedText);
  const concurrency = Math.max(1, getChunkingConfig().concurrency);
  const results: Array<{ ok: boolean; chunk: DocumentChunk; facts?: ChunkAnalysisFacts; error?: string }> = [];
  const budget = createTimeBudget(Date.now(), computeChunkingBudgetMs(chunks));

  logger.info({
    step: "budget_created",
    agentId,
    totalChunks: chunks.length,
    globalBudgetMs: budget.globalBudgetMs,
    reserveMs: budget.reserveMs,
  }, `Time budget: ${budget.globalBudgetMs / 1000}s total, ${budget.reserveMs / 1000}s reserved for consolidation`);

  for (let index = 0; index < chunks.length; index += concurrency) {
    const processedCount = results.length;

    if (!budget.canStartChunk(chunks.length, processedCount)) {
      logger.error({
        step: "budget_exhausted_skip",
        agentId,
        processedCount,
        remainingChunks: chunks.length - processedCount,
        elapsedMs: budget.getElapsedMs(),
        remainingMs: budget.getRemainingMs(),
      }, "Skipping remaining chunks — insufficient time budget");

      for (let remaining = index; remaining < chunks.length; remaining += 1) {
        results.push({ ok: false, chunk: chunks[remaining], error: "Orçamento de tempo insuficiente para processar chunk" });
      }
      break;
    }

    const batch = chunks.slice(index, index + concurrency);
    const chunkIds = batch.map((c) => c.chunkId);
    const chunkTimeout = budget.getChunkTimeoutMs(chunks.length, processedCount);

    logger.info({
      step: "chunk_started",
      agentId,
      chunkIds,
      batchStart: index,
      chunkTimeoutMs: chunkTimeout,
      elapsedMs: budget.getElapsedMs(),
      remainingMs: budget.getRemainingMs(),
    }, `Processing batch of ${batch.length} chunk(s) [timeout: ${Math.round(chunkTimeout / 1000)}s]`);

    const batchResults = await Promise.all(
      batch.map((chunk) => processChunkWithRetry(agentId, chunk, budget, chunks.length, processedCount, profile, opts)),
    );

    for (const result of batchResults) {
      if (result.ok) {
        logger.info({ step: "chunk_completed", agentId, chunkId: result.chunk.chunkId, estimatedTokens: result.chunk.estimatedTokens, elapsedMs: budget.getElapsedMs() }, "Chunk processed successfully");
      } else {
        logger.warn({ step: "chunk_failed", agentId, chunkId: result.chunk.chunkId, error: result.error, elapsedMs: budget.getElapsedMs() }, "Chunk processing failed");
      }
    }
    results.push(...batchResults);
  }

  const failedCount = results.filter((result) => !result.ok).length;
  const processing = {
    mode: "chunked" as const,
    totalChunks: chunks.length,
    processedChunks: results.filter((result) => result.ok).length,
    failedChunks: failedCount,
    complete: failedCount === 0,
  };

  logger.info({
    step: "chunking_completed",
    agentId,
    ...processing,
    totalElapsedMs: budget.getElapsedMs(),
    remainingBudgetMs: budget.getRemainingMs(),
  }, `Chunking completed in ${Math.round(budget.getElapsedMs() / 1000)}s — ${budget.getRemainingMs() / 1000}s remaining for consolidation`);

  if (!processing.complete) {
    const failedChunkIds = results.filter((r) => !r.ok).map((r) => r.chunk.chunkId);
    const firstError = results.find((r) => !r.ok)?.error ?? "unknown";
    logger.warn({
      step: "chunking_partial_failure",
      agentId,
      failedChunks: failedCount,
      totalChunks: chunks.length,
      failedChunkIds,
      firstError,
    }, `AIService: ${failedCount} de ${chunks.length} chunks falharam. Continuando com chunks bem-sucedidos.`);
  }

  const successfulResults = results.filter((result): result is { ok: true; chunk: DocumentChunk; facts: ChunkAnalysisFacts } => result.ok).map((result) => ({ chunkId: result.chunk.chunkId, facts: result.facts! }));

  return {
    chunks,
    chunkResults: successfulResults,
    processing,
  };
}

function detectCategoria(text: string): string {
  const t = (text ?? "").toLowerCase();
  if (/(concurso|processo seletivo)/.test(t)) return "Concurso";
  if (/(pregão|pregao)/.test(t)) return "Pregão";
  if (/(licitação|licitacao)/.test(t)) return "Licitação";
  if (/credenciamento/.test(t)) return "Credenciamento";
  if (/chamamento/.test(t)) return "Chamamento Público";
  if (/(bolsa|bolsas)/.test(t)) return "Bolsas";
  if (/(subvenção|subvencao|fomento)/.test(t)) return "Subvenção";
  if (/(financiamento|empréstimo|emprestimo)/.test(t)) return "Financiamento";
  return "Edital";
}

function heuristicOportunidadeScore(facts: ChunkAnalysisFacts): number {
  const density = facts.dates.length * 4 + facts.requirements.length * 3 + facts.documents.length * 2 + facts.values.length * 2 + facts.eligibility.length * 2;
  return Math.max(15, Math.min(100, 45 + density));
}

function buildConsolidatedAgentResult(agentId: AgentId, chunkResults: Array<{ chunkId: string; facts: ChunkAnalysisFacts }>, originalText: string, profile?: z.infer<typeof AgentUserProfileSchema>) {
  const consolidatedFacts = consolidateChunkFacts(chunkResults);
  const firstDocument = consolidatedFacts.documentInfo[0];
  const hasEnoughEligibilityData = consolidatedFacts.eligibility.length > 0 && !!profile;
  const timeline = consolidatedFacts.dates.map((date) => ({
    fase: date.event || "Evento",
    periodo: date.value || "Verificar no edital",
    descricao: date.text || date.event || "Evento identificado no documento",
    status: "ativo" as const,
    pagina: date.page,
    secao: date.section,
    trechoFonte: date.text,
    confianca: (date.confidence ?? "média") as "alta" | "média" | "baixa",
  }));

  // Campos específicos de cada agente que a consolidação por chunks não
  // consegue derivar da IA (score, categoria, recomendações, etc.), sintetizados
  // heuristicamente a partir dos fatos consolidados para que o resultado
  // atenda ao schema do agente e renderize corretamente no frontend.
  const agentFields: Record<string, unknown> = {};
  if (agentId === "simples") {
    const fonteTexto = firstDocument?.text || firstDocument?.title || "";
    agentFields.scoreOportunidade = heuristicOportunidadeScore(consolidatedFacts);
    agentFields.categoria = detectCategoria(fonteTexto);
    agentFields.resumo = (fonteTexto || "Análise consolidada a partir de todas as partes do documento.").slice(0, 500);
    agentFields.objetivo = firstDocument?.title || "Analisar o edital para identificar oportunidades.";
    agentFields.ondeInscrever = consolidatedFacts.contacts[0]?.contact || "Verificar no edital original.";
  }
  if (agentId === "estrategica") {
    agentFields.score = heuristicOportunidadeScore(consolidatedFacts);
    agentFields.oportunidade = firstDocument?.title || "Oportunidade identificada no edital.";
    agentFields.vantagens = consolidatedFacts.documentInfo.slice(1, 5).map((f) => f.text || f.title).filter(Boolean);
    agentFields.pontosAtencao = consolidatedFacts.restrictions.map((f) => f.restriction).filter(Boolean);
    agentFields.riscos = consolidatedFacts.alerts.map((f) => f.message || f.text).filter(Boolean);
    agentFields.recomendacao = consolidatedFacts.alerts.length > 0
      ? "Revise os pontos de atenção antes de tomar qualquer providência."
      : "Avalie a oportunidade com base nos requisitos e prazos identificados.";
  }
  if (agentId === "documentacao") {
    agentFields.dica = "Organize os documentos com antecedência para evitar imprevistos no dia da inscrição.";
  }
  if (agentId === "elegibilidade") {
    agentFields.score = heuristicOportunidadeScore(consolidatedFacts);
    agentFields.recomendacao = hasEnoughEligibilityData
      ? "O perfil informado é compatível com os critérios identificados no edital."
      : "Consulte os critérios de elegibilidade no edital original.";
    agentFields.proximosPassos = [];
  }

  return {
    type: agentId,
    tipoEdital: firstDocument?.title || "Edital público",
    instituicao: firstDocument?.organization || "Não informado",
    prazo: consolidatedFacts.dates.map((date) => `${date.event || "Evento"}: ${date.value || "Verificar no edital"}`).join(" | ") || "Não informado",
    publicoAlvo: "Público-alvo conforme o edital",
    requisitos: consolidatedFacts.requirements.map((item) => item.requirement || "Requisito identificado").filter(Boolean),
    documentos: consolidatedFacts.documents.map((item) => item.document || "Documento identificado").filter(Boolean),
    valor: consolidatedFacts.values.map((item) => item.value || "Valor identificado").filter(Boolean).join(" | ") || "Não informado",
    timeline,
    checklist: consolidatedFacts.documents.map((item) => ({
      doc: item.document || "Documento identificado",
      obrigatorio: true,
      observacao: item.text || "Documento identificado no documento.",
      checked: false,
    })),
    criterios: consolidatedFacts.eligibility.map((item) => ({
      criterio: item.criterion || "Critério identificado",
      atende: hasEnoughEligibilityData ? true : null,
      observacao: item.text || "Critério identificado no documento.",
    })),
    observacao: consolidatedFacts.alerts.length > 0
      ? "Análise consolidada a partir de múltiplas partes do documento."
      : "Análise consolidada a partir de todas as partes do documento.",
    alertas: consolidatedFacts.alerts.map((item) => item.message || item.text || "Alerta identificado no documento.")
      .filter(Boolean),
    numero: undefined,
    anoPublicacao: undefined,
    fonte: undefined,
    totalPaginas: undefined,
    ...agentFields,
    processing: {
      mode: "chunked" as const,
      totalChunks: chunkResults.length,
      processedChunks: chunkResults.length,
      failedChunks: 0,
      complete: true,
    },
    originalText,
  };
}

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

function isJsonRetryableError(message: string): boolean {
  const normalized = message.toLowerCase();
  return [
    "json inválido",
    "resposta da ia não é um objeto json válido",
    "is not valid json",
    "response is not valid json",
    "ai response is not valid json",
    "did not match expected schema",
    "validation failed",
    "unexpected token",
    "invalid json",
    "json parse",
  ].some((indicator) => normalized.includes(indicator));
}

async function createJsonChatCompletion(
  payload: Record<string, unknown>,
  module: string,
  attempts = 2,
  requestOptions?: { signal?: AbortSignal | null; timeout?: number },
): Promise<{
  raw: string;
  parsed: Record<string, unknown>;
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
  provider?: string;
  model?: string;
  fallbackAttempted?: boolean;
  fallbackSucceeded?: boolean;
}> {
  let lastError: Error | null = null;
  let lastFallback: FallbackResult | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const fallbackResult = await createWithFallback(payload, requestOptions);
      lastFallback = fallbackResult;
      const completion = (fallbackResult.result as any) ?? {};
      const raw = completion.choices?.[0]?.message?.content ?? "";
      const parsed = extractJsonFromResponse(raw);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error(`${module}: resposta da IA não é um objeto JSON válido.`);
      }
      const usage = completion?.usage ?? null;
      return {
        raw,
        parsed: parsed as Record<string, unknown>,
        usage,
        provider: fallbackResult.provider,
        model: fallbackResult.model,
        fallbackAttempted: fallbackResult.fallbackAttempted,
        fallbackSucceeded: fallbackResult.fallbackSucceeded,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < attempts && isJsonRetryableError(lastError.message)) {
        payload = {
          ...payload,
          messages: [
            ...(Array.isArray(payload.messages) ? (payload.messages as unknown[]) : []),
            {
              role: "user",
              content:
                "A resposta anterior não foi um JSON válido. Responda APENAS com JSON válido, sem markdown, sem texto adicional e sem explicações.",
            },
          ],
        };
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error(`${module}: falha desconhecida ao chamar a IA`);
}

import { logger } from "./logger";
import { getSupabaseAdmin } from "./supabase";
import { classifyAiError } from "./processingErrors";

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
  categoria: "ambiguidade" | "contradição" | "ausência" | "inferência" | "temporal" | "fallback";
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
  documentoOrigem?: string;
  vigente?: boolean;
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
  processing?: {
    mode: "single" | "chunked";
    totalChunks: number;
    processedChunks: number;
    failedChunks: number;
    complete: boolean;
  };
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
  cronograma: {
    items: CronogramaItem[];
    summary?: string;
    retificacoes?: Array<{
      campo: string;
      valorOriginal: string;
      valorVigente: string;
      documentoRetificacao: string;
      paginaRetificacao?: number;
      trechoRetificacao?: string;
    }>;
    validacaoTemporal?: {
      temConflitos: boolean;
      conflitos: Array<{ evento1: string; evento2: string; problema: string }>;
    };
  };
  checklist: {
    items: Array<{ doc: string; obrigatorio: boolean; observacao: string; checked: boolean }>;
    summary?: string;
  };
  elegibilidade: {
    score?: number;
    criteria: Array<{
      criterio: string;
      atende: boolean | "parcial" | null;
      observacao: string;
      pagina?: number;
      secao?: string;
      trechoFonte?: string;
      confianca?: "alta" | "média" | "baixa";
      documentoOrigem?: string;
      vigente?: boolean;
    }>;
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
    documentoOrigem?: string;
    vigente?: boolean;
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

/**
 * Validação documental antes de salvar no Supabase.
 * 
 * Verifica:
 * 1. Identificação: número, ano, órgão, título
 * 2. Cronograma: datas existem, retificação aplicada, nenhuma data histórica como prazo atual
 * 3. Interpretação: resumo corresponde, nenhuma informação inventada
 * 4. Checklist: todos os itens existem no edital
 * 5. Elegibilidade: critérios vêm do edital
 * 
 * Retorna { valid: true } ou { valid: false, errors: string[] }
 */
export function validateDocumentAnalysis(
  canonicalAnalysis: Record<string, unknown>,
  originalText: string,
): { valid: true } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  const normalizedText = originalText.toLowerCase();
  
  // 1. Validação de identificação
  const documento = canonicalAnalysis.documento as Record<string, unknown> | undefined;
  if (documento) {
    if (!documento.titulo && !documento.orgao) {
      errors.push("Identificação incompleta: título e órgão não identificados");
    }
    if (documento.anoPublicacao && typeof documento.anoPublicacao === "number") {
      const currentYear = new Date().getFullYear();
      if (documento.anoPublicacao < currentYear - 2 || documento.anoPublicacao > currentYear + 1) {
        errors.push(`Ano de publicação suspeito: ${documento.anoPublicacao}`);
      }
    }
  }
  
  // 2. Validação de cronograma
  const cronograma = canonicalAnalysis.cronograma as Record<string, unknown> | undefined;
  if (cronograma && Array.isArray(cronograma.items)) {
    const items = cronograma.items as Array<Record<string, unknown>>;

    const mesesMap: Record<string, string> = {
      janeiro: "01", fevereiro: "02", março: "03", abril: "04", maio: "05", junho: "06",
      julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
    };
    const normalizeDateForComparison = (dateStr: string): string => {
      const isoMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (isoMatch) {
        const [, d, m, y] = isoMatch;
        const mesNome = Object.entries(mesesMap).find(([, v]) => v === m)?.[0] || "";
        return `${d} de ${mesNome} de ${y}`;
      }
      return dateStr.toLowerCase();
    };

    for (const item of items) {
      const periodo = typeof item.periodo === "string" ? item.periodo : "";
      const fase = typeof item.fase === "string" ? item.fase : "";
      
      const datePatterns = [
        /\d{1,2}\/\d{1,2}\/\d{4}/g,
        /\d{1,2}\s+de\s+\w+\s+de\s+\d{4}/g,
      ];
      
      for (const pattern of datePatterns) {
        const dates = periodo.match(pattern) || [];
        for (const date of dates) {
          const normalizedDate = normalizeDateForComparison(date);
          const found = normalizedText.includes(date.toLowerCase()) || normalizedText.includes(normalizedDate);
          
          if (!found) {
            const retificacao = (cronograma.retificacoes as Array<Record<string, unknown>> | undefined)
              ?.find(r => {
                const vigente = typeof r.valorVigente === "string" ? r.valorVigente : "";
                return vigente.includes(date) || vigente.includes(normalizedDate);
              });
            
            if (!retificacao) {
              errors.push(`Data "${date}" no cronograma não encontrada no edital original`);
            }
          }
        }
      }
    }
  }
  
  // 3. Validação de elegibilidade
  const elegibilidade = canonicalAnalysis.elegibilidade as Record<string, unknown> | undefined;
  if (elegibilidade && Array.isArray(elegibilidade.criteria)) {
    const criteria = elegibilidade.criteria as Array<Record<string, unknown>>;
    
    for (const criterion of criteria) {
      const criterio = typeof criterion.criterio === "string" ? criterion.criterio : "";
      
      // Verifica se o critério tem fonte no edital
      if (criterio && !normalizedText.includes(criterio.toLowerCase().slice(0, 30))) {
        // Critério muito específico, pode ser inferência
        if (criterio.length > 50) {
          errors.push(`Critério de elegibilidade sem fonte explícita no edital: "${criterio.slice(0, 50)}..."`);
        }
      }
    }
  }
  
  // 4. Verificação de informações inventadas
  const interpretation = canonicalAnalysis.interpretation as Record<string, unknown> | undefined;
  if (interpretation) {
    const summary = typeof interpretation.summary === "string" ? interpretation.summary : "";
    
    // Verifica se o resumo contém termos muito específicos que podem ser inventados
    const inventedTerms = [
      /valor total de/i,
      /orçamento de/i,
      /financiamento de/i,
      /investimento de/i,
    ];
    
    for (const term of inventedTerms) {
      if (term.test(summary) && !normalizedText.match(term)) {
        errors.push(`Resumo contém termo não encontrado no edital: "${summary.match(term)?.[0]}"`);
      }
    }
  }
  
  if (errors.length > 0) {
    return { valid: false, errors };
  }
  
  return { valid: true };
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

  const processing = (result.processing as CanonicalAnalysis["processing"] | undefined) ?? {
    mode: "single",
    totalChunks: 1,
    processedChunks: 1,
    failedChunks: 0,
    complete: true,
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
  const buildCronograma = (): CanonicalAnalysis["cronograma"] => {
    if (!Array.isArray(result.timeline)) {
      return { items: [] };
    }

    const retifications = detectRetifications(originalText);
    const rawTimeline = result.timeline as Array<Record<string, unknown>>;
    const timelineWithRetifications = applyRetificationsToTimeline(
      rawTimeline,
      retifications,
      originalText,
    );
    
    const items = timelineWithRetifications.map(
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
        documentoOrigem: typeof item.retificado === "boolean" && item.retificado
          ? typeof item.observacaoRetificacao === "string" ? item.observacaoRetificacao : "Retificação detectada no edital"
          : undefined,
        vigente: typeof item.retificado === "boolean" ? !item.retificado : true,
      })
    );

    const conflitos = validateTemporalConsistency(items, originalText);
    
    if (retifications.length > 0) {
      retifications.forEach(ret => {
        conflitos.push({
          evento1: `Original: ${ret.valorOriginal}`,
          evento2: `Vigente: ${ret.valorVigente}`,
          problema: `Retificação detectada: ${ret.campo} alterado de "${ret.valorOriginal}" para "${ret.valorVigente}". O prazo vigente é ${ret.valorVigente}.`,
        });
      });
    }
    
    return {
      items,
      summary: typeof result.observacao === "string" ? result.observacao : undefined,
      retificacoes: retifications.length > 0 ? retifications : undefined,
      validacaoTemporal:
        conflitos.length > 0
          ? {
              temConflitos: true,
              conflitos,
            }
          : undefined,
    };
  };

  const cronograma = buildCronograma();

  const buildChecklist = () => {
    if (!Array.isArray(result.checklist)) {
      return { items: [] };
    }
    return {
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
    };
  };

  const checklist = buildChecklist();

  const buildElegibilidade = () => {
    if (!Array.isArray(result.criterios)) {
      return { criteria: [] };
    }
    return {
      score:
        typeof result.score === "number" ? result.score : undefined,
      criteria: (result.criterios as Array<Record<string, unknown>>).map(
        (item) => {
          const atendeValue = item.atende;
          const atende: boolean | "parcial" | null =
            atendeValue === "parcial"
              ? "parcial"
              : atendeValue === true
              ? true
              : atendeValue === null
              ? null
              : false;

          return {
            criterio:
              typeof item.criterio === "string" ? item.criterio : "",
            atende,
            observacao:
              typeof item.observacao === "string"
                ? item.observacao
                : "",
            pagina:
              typeof item.pagina === "number" ? item.pagina : undefined,
            secao:
              typeof item.secao === "string" ? item.secao : undefined,
            trechoFonte:
              typeof item.trechoFonte === "string"
                ? item.trechoFonte
                : undefined,
            confianca:
              (item.confianca as "alta" | "média" | "baixa") ?? "média",
            documentoOrigem:
              typeof item.documentoOrigem === "string"
                ? item.documentoOrigem
                : undefined,
            vigente: typeof item.vigente === "boolean" ? item.vigente : true,
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
    };
  };

  const elegibilidade = buildElegibilidade();

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

  if (cronograma.items.length > 0) {
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
          documentoOrigem: item.documentoOrigem,
          vigente: item.vigente,
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
    cronograma.validacaoTemporal?.temConflitos &&
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
    processing,
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
/**
 * Preprocessa valores de campos numéricos opcionais que a IA pode preencher
 * com strings como "Não informado" quando o dado não está disponível.
 */
function optionalInt(v: unknown) {
  if (v === "Não informado" || v === "Não especificado" || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : undefined;
}

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
  numero: z.string().optional(),
  anoPublicacao: z.preprocess(optionalInt, z.number().int().optional()),
  fonte: z.string().optional(),
  totalPaginas: z.preprocess(optionalInt, z.number().int().optional()),
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
  numero: z.string().optional(),
  anoPublicacao: z.preprocess(optionalInt, z.number().int().optional()),
  fonte: z.string().optional(),
  totalPaginas: z.preprocess(optionalInt, z.number().int().optional()),
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
  numero: z.string().optional(),
  anoPublicacao: z.preprocess(optionalInt, z.number().int().optional()),
  fonte: z.string().optional(),
  totalPaginas: z.preprocess(optionalInt, z.number().int().optional()),
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
  numero: z.string().optional(),
  anoPublicacao: z.preprocess(optionalInt, z.number().int().optional()),
  fonte: z.string().optional(),
  totalPaginas: z.preprocess(optionalInt, z.number().int().optional()),
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
  numero: z.string().optional(),
  anoPublicacao: z.preprocess(optionalInt, z.number().int().optional()),
  fonte: z.string().optional(),
  totalPaginas: z.preprocess(optionalInt, z.number().int().optional()),
  alertas: z.array(z.string()).optional().default([]),
});

const ElegibilidadeCriterioSchema = z.object({
  criterio: z.string(),
  atende: z.union([z.boolean(), z.literal("parcial"), z.null()]),
  observacao: z.string(),
});

export const ElegibilidadeResponseSchema = z.object({
  type: z.literal("elegibilidade"),
  score: z.number().int().min(0).max(100),
  criterios: z.array(ElegibilidadeCriterioSchema),
  recomendacao: z.string(),
  proximosPassos: z.array(z.string()),
  numero: z.string().optional(),
  anoPublicacao: z.preprocess(optionalInt, z.number().int().optional()),
  fonte: z.string().optional(),
  totalPaginas: z.preprocess(optionalInt, z.number().int().optional()),
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
 * usando um modelo de visão como motor de OCR.
 *
 * Limitação atual (documentada): o OCR depende de um modelo de visão de um
 * provedor configurado (OpenAI GPT-4o ou Gemini gemini-2.5-flash). O Groq
 * (llama-3.3-70b-versatile) NÃO tem suporte a imagens. Se a chave preferida
 * (GPT-4o) estiver sem cota (429), o serviço tenta o próximo provedor com
 * visão configurado; se nenhum provedor conseguir processar, retorna um
 * erro específico de "OCR indisponível" em vez de um fallback genérico.
 *
 * Centralizado no AIService para garantir logging, rastreabilidade e
 * controle centralizado de todas as chamadas à API de visão.
 *
 * @param pages - Array de strings base64 (JPEG) representando páginas do PDF
 * @returns Texto extraído concatenado de todas as páginas
 */
export async function ocrPdf(
  pages: string[],
  opts?: { userId?: string | null },
): Promise<string> {
  if (!pages.length) return "";

  const visionClients = getVisionClients();
  if (visionClients.length === 0) {
    throw new Error(
      "OCR_INDISPONIVEL: Este PDF parece ser escaneado (apenas imagens). O provedor de IA configurado (Groq/llama-3.3-70b-versatile) não oferece OCR. Configure GEMINI_API_KEY ou OPENAI_API_KEY para analisar PDFs escaneados, ou cole o texto manualmente na aba 'Colar Texto'.",
    );
  }
  const start = Date.now();
  // Processa as páginas em lotes de 8 imagens por chamada à API.
  // Por quê BATCH=8? Modelos de visão suportam múltiplas imagens por mensagem,
  // e 8 é o sweet-spot entre contexto (tokens de imagem ~85–1700 tokens cada)
  // e janela de 128k tokens. Lotes maiores aumentam risco de truncamento silencioso.
  const BATCH = 8;
  const OCR_PROMPT =
    "Você é um assistente de OCR especializado em documentos oficiais brasileiros. Extraia TODO o texto das páginas do documento abaixo, em português, preservando parágrafos, seções e estrutura. Saída: apenas o texto extraído, sem comentários ou marcações extras.";

  let lastError: { provider: string; message: string; providerLevel: boolean } | null = null;

  for (const { client: visionClient, provider, model } of visionClients) {
    try {
      const parts: string[] = [];
      for (let i = 0; i < pages.length; i += BATCH) {
        const batch = pages.slice(i, i + BATCH);
        const imageBlocks = batch.map((b64) => ({
          type: "image_url" as const,
          image_url: { url: `data:image/jpeg;base64,${b64}`, detail: "auto" as const },
        }));

        const response = await visionClient.chat.completions.create({
          model,
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: OCR_PROMPT }, ...imageBlocks],
            },
          ],
          max_tokens: 8192,
        }, { signal: AbortSignal.timeout(GLOBAL_BUDGET_MS) });

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
      const classification = classifyAiError(msg);
      // Erro atribuível ao provedor (cota, auth, indisponibilidade, request
      // inválida): vale a pena tentar o próximo provedor com visão.
      const providerLevel =
        classification.status === 429 ||
        classification.status === 401 ||
        classification.status === 403 ||
        classification.status === 503 ||
        classification.status === 400;
      lastError = { provider, message: msg, providerLevel };

      logger.warn(
        { provider, model, error: msg, reason: classification.reason, providerLevel },
        "OCR vision provider failed; checking next provider",
      );
      if (!providerLevel) break;
    }
  }

  const latency = Date.now() - start;
  await persistUsageLog({
    module: "AIService.ocrPdf",
    model: lastError?.provider ?? "none",
    userId: opts?.userId ?? null,
    documentId: null,
    latencyMs: latency,
    success: false,
    errorMessage: lastError?.message ?? "No vision provider configured",
    level: "error",
    message: "OCR failed",
  });

  // Propaga o erro para o mapeamento correto no route (429 quota, 503 auth,
  // 422 conteúdo, etc.) — nunca um fallback genérico.
  if (lastError) {
    throw new Error(`OCR error: ${lastError.message}`);
  }
  throw new Error("OCR error: nenhum provedor de visão está configurado.");
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
    const { raw, parsed, usage } = await createJsonChatCompletion(
      {
        model,
        max_tokens: 4096,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      } as any,
      "AIService.simplifyEdital",
      2,
      { signal: AbortSignal.timeout(GLOBAL_BUDGET_MS) },
    );

    const validated = SimplifyEditalResponse.safeParse(parsed);
    const latency = Date.now() - start;
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
  const parsedProfile = AgentUserProfileSchema.safeParse(profile ?? undefined);
  const { text: normalizedText } = normalizeDocumentText(text);
  const model = getOpenAIModel();
  const start = Date.now();
  const requestId = randomUUID();

  let currentStep = "initialization";
  try {
    const { text: normalizedDocumentText } = normalizeDocumentText(text);
    const estimatedTokens = estimateTokens(normalizedDocumentText);
    const chunkThreshold = getChunkingConfig().maxInputTokens * 0.6;

    // O single-pass precisa caber no TPM do provedor (prompt + max_tokens).
    // Se o orçamento de saída for mínimo (< 1024 tokens), força chunking para
    // que o documento seja processado em partes que cabem no limite por minuto.
    const singlePassPrompt = buildAgentPrompt(agentId, normalizedDocumentText, parsedProfile.success ? parsedProfile.data : undefined);
    const estimatedPromptTokens = estimateTokens(singlePassPrompt.system) + estimateTokens(singlePassPrompt.user);
    const singlePassMaxOutput = calcRequestMaxTokens(estimatedPromptTokens, model);
    const tpmFitsSinglePass = singlePassMaxOutput >= 1024;
    const shouldChunk = estimatedTokens > chunkThreshold || !tpmFitsSinglePass;

    logger.info({
      requestId,
      step: "analysis_started",
      module: "analyzeAgent",
      agentId,
      provider: getProviderNameFromModel(model),
      model,
      inputCharacters: normalizedDocumentText.length,
      estimatedTokens,
      chunkThreshold,
      shouldChunk,
      estimatedPromptTokens,
      singlePassMaxOutput,
      tpmFitsSinglePass,
      userId: opts?.userId ?? null,
    }, "AI analysis started");

    if (!shouldChunk) {
      currentStep = "single_pass_prompt_build";
      const { system, user } = singlePassPrompt;

      currentStep = "single_pass_api_call";
      logger.info({ requestId, step: "single_pass_started", agentId, estimatedTokens, singlePassMaxOutput }, "Single-pass analysis started");
      await waitForTpmBudget(Math.ceil(estimatedPromptTokens * PROMPT_BUDGET_SAFETY) + singlePassMaxOutput);
      const completionResult = await createJsonChatCompletion(
        {
          model,
          max_tokens: singlePassMaxOutput,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        } as any,
        "AIService.analyzeAgent",
        2,
        { signal: AbortSignal.timeout(GLOBAL_BUDGET_MS) },
      );

      const { raw, parsed: parsedRaw, usage } = completionResult;

      const usageTokens = usage ? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0) : 0;
      recordTpmUsage(usageTokens || estimatedPromptTokens + singlePassMaxOutput);

      logger.info({
        requestId,
        step: "single_pass_completed",
        module: "analyzeAgent",
        provider: completionResult.provider ?? getProviderNameFromModel(model),
        model: completionResult.model ?? model,
        durationMs: Date.now() - start,
        inputCharacters: normalizedDocumentText.length,
        estimatedTokens,
        fallbackAttempted: completionResult.fallbackAttempted ?? false,
        fallbackSucceeded: completionResult.fallbackSucceeded ?? false,
        promptTokens: usage?.prompt_tokens ?? null,
        completionTokens: usage?.completion_tokens ?? null,
      }, "AI single-pass completed");

      currentStep = "single_pass_validation";
      const parsed =
        parsedRaw !== null && typeof parsedRaw === "object" && !Array.isArray(parsedRaw) && !(parsedRaw as Record<string, unknown>).type
          ? { type: agentId, ...(parsedRaw as Record<string, unknown>) }
          : parsedRaw;
      const validator = VALIDATORS[agentId];
      const validated = validator.safeParse(parsed);
      const latency = Date.now() - start;
      const inputTokens = typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : null;
      const outputTokens = typeof usage?.completion_tokens === "number" ? usage.completion_tokens : null;
      const totalTokens = typeof usage?.total_tokens === "number" ? usage.total_tokens : null;

      if (!validated.success) {
        const schemaPreview = JSON.stringify(validated.error.format()).slice(0, 300);
        logger.warn({
          requestId,
          step: "single_pass_validation_failed",
          agentId,
          schemaPreview,
          rawPreview: raw.slice(0, 200),
        }, "AI response validation failed");
        const e = new Error(`AI response did not match expected schema: ${schemaPreview} | raw: ${raw.slice(0, 200)}`);
        (e as any).requestId = requestId;
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

      currentStep = "single_pass_canonical";
      const canonical = buildCanonicalAnalysis(agentId, validated.data as Record<string, unknown>, normalizedDocumentText, parsedProfile.success ? parsedProfile.data : undefined);

      currentStep = "response_sent";
      logger.info({ requestId, step: "response_sent", agentId, mode: "single" }, "Analysis response ready");

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
    }

    currentStep = "chunk_processing_started";
    logger.info({ requestId, step: "chunk_processing_started", agentId, estimatedTokens, chunkThreshold }, "Chunked analysis started");
    const chunkProcessing = await processDocumentInChunks(agentId, normalizedDocumentText, parsedProfile.success ? parsedProfile.data : undefined, opts);

    currentStep = "consolidation_started";
    logger.info({
      requestId,
      step: "consolidation_started",
      agentId,
      totalChunks: chunkProcessing.processing.totalChunks,
      processedChunks: chunkProcessing.processing.processedChunks,
      failedChunks: chunkProcessing.processing.failedChunks,
    }, "Consolidating chunk results");
    const consolidatedAgentResult = buildConsolidatedAgentResult(agentId, chunkProcessing.chunkResults, normalizedDocumentText, parsedProfile.success ? parsedProfile.data : undefined);

    const consolidatedWithType = { ...consolidatedAgentResult, type: agentId } as Record<string, unknown>;
    const validator = VALIDATORS[agentId];
    const validatedConsolidation = validator.safeParse(consolidatedWithType);
    if (!validatedConsolidation.success) {
      const schemaPreview = JSON.stringify(validatedConsolidation.error.format()).slice(0, 300);
      logger.warn({
        requestId,
        step: "consolidation_validation_failed",
        agentId,
        schemaPreview,
      }, "Consolidated result did not match expected schema — continuing with raw result");
    }

    currentStep = "consolidation_canonical";
    const canonical = buildCanonicalAnalysis(agentId, { ...consolidatedAgentResult, processing: chunkProcessing.processing } as Record<string, unknown>, normalizedDocumentText, parsedProfile.success ? parsedProfile.data : undefined);

    currentStep = "response_sent";
    logger.info({
      requestId,
      step: "consolidation_completed",
      agentId,
      totalChunks: chunkProcessing.processing.totalChunks,
      processedChunks: chunkProcessing.processing.processedChunks,
      complete: chunkProcessing.processing.complete,
    }, "Chunked analysis consolidated");

    const latency = Date.now() - start;
    await persistUsageLog({
      module: "AIService.analyzeAgent",
      model,
      userId: opts?.userId ?? null,
      documentId: opts?.documentId ?? null,
      latencyMs: latency,
      success: chunkProcessing.processing.complete,
      errorMessage: chunkProcessing.processing.complete ? null : "partial_chunk_failure",
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      agentId,
      level: chunkProcessing.processing.complete ? "info" : "warn",
      message: chunkProcessing.processing.complete ? "Chunked analysis completed" : "Chunked analysis completed with partial failures",
    });

    return {
      ...canonical,
      ...consolidatedAgentResult,
      type: agentId,
      agentResult: consolidatedAgentResult,
      analysisId: canonical.analysisId,
      schemaVersion: canonical.schemaVersion,
      interpretation: canonical.interpretation,
      cronograma: canonical.cronograma,
      checklist: canonical.checklist,
      elegibilidade: canonical.elegibilidade,
      valores: canonical.valores,
      documentosExigidos: canonical.documentosExigidos,
      alertas: canonical.alertas,
      processing: canonical.processing,
    } as Record<string, unknown>;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const errorName = err instanceof Error ? err.name : "UnknownError";
    const errorStack = err instanceof Error ? err.stack : undefined;
    const latency = Date.now() - start;

    logger.error({
      requestId,
      step: currentStep,
      module: "analyzeAgent",
      provider: getProviderNameFromModel(model),
      model,
      agentId,
      durationMs: latency,
      inputCharacters: normalizedText.length,
      estimatedTokens: estimateTokens(normalizedText),
      errorName,
      errorMessage: message,
      errorStack: errorStack?.slice(0, 500),
      userId: opts?.userId ?? null,
    }, "AI analysis failed");

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
      message: `AIService error (${model})`,
    });

    const shouldPropagate = /chunks falharam|orçamento|429|rate limit|internal server error/i.test(message);
    if (shouldPropagate) {
      throw err;
    }

    const fallbackAnalysis = buildHeuristicCanonicalAnalysis(agentId, normalizedText, parsedProfile.success ? parsedProfile.data : undefined, message);
    logger.warn({
      requestId,
      step: currentStep,
      module: "analyzeAgent",
      provider: getProviderNameFromModel(model),
      model,
      agentId,
      durationMs: latency,
      inputCharacters: normalizedText.length,
      estimatedTokens: estimateTokens(normalizedText),
      errorName,
      errorMessage: message,
    }, "AI analysis failed; returning heuristic fallback");

    await persistUsageLog({
      module: "AIService.analyzeAgent",
      model,
      userId: opts?.userId ?? null,
      documentId: opts?.documentId ?? null,
      latencyMs: latency,
      success: true,
      errorMessage: "heuristic_fallback",
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      agentId,
      level: "warn",
      message: "AIService fallback completed",
    });

    return fallbackAnalysis;
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
    const { raw, parsed, usage } = await createJsonChatCompletion(
      {
        model,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      },
      module,
    );

    const latency = Date.now() - start;

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

  const hasStructuredContext = context?.startsWith("ANÁLISE SALVA DO EDITAL");

  const systemContent = [
    "Você é o Assistente IA do NIASci, um assistente científico especializado em apoiar pesquisadores, estudantes e educadores brasileiros.",
    "Sua função é responder perguntas sobre ciência, metodologia de pesquisa, currículos Lattes, artigos científicos, projetos de pesquisa e editais de fomento.",
    "",
    hasStructuredContext
      ? [
          "REGRAS OBRIGATÓRIAS — CONTEXTO DE ANÁLISE SALVA:",
          "1. Responda APENAS com base nos fatos fornecidos no contexto da análise salva.",
          "2. NÃO invente, infera ou reinterprete informações que não estejam explicitamente no contexto.",
          "3. NÃO consulte o texto original do edital — use exclusivamente os fatos consolidados fornecidos.",
          "4. Se a informação solicitada não existe no contexto fornecido, responda EXATAMENTE:",
          '   "Essa informação não foi localizada no edital analisado."',
          "5. Cite o campo ou seção de onde retirou a informação (ex: cronograma, elegibilidade, checklist).",
          "6. Quando houver retificação, sempre apresente o valor vigente e mencione que houve alteração.",
          "7. Não contradiga o cronograma, checklist ou elegibilidade fornecidos.",
        ].join("\n")
      : "Seja sempre preciso, cite fontes quando possível, e use linguagem acessível sem perder a precisão científica.",
    "",
    context ? `\n\nCONTEXTO:\n${context.slice(0, 8000)}` : "",
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
    }, { signal: AbortSignal.timeout(60_000) });

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
