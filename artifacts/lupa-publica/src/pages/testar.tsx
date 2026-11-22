/**
 * @file testar.tsx
 * @description Página principal de análise de editais do LUPA Digital.
 *
 * Esta é a página central da aplicação — onde o usuário interage com os 6 agentes
 * especializados de IA para analisar editais públicos.
 *
 * Fluxo principal:
 *   1. Entrada: texto colado, URL pública ou PDF enviado
 *   2. Extração: PDF → texto via pdfjs-dist (ou OCR via GPT-4o Vision para PDFs escaneados)
 *   3. Análise: seleção do agente → POST /api/edital/analyze → resultado estruturado
 *   4. Exibição: resultado em abas (Resumo, Indicadores, Timeline, Recomendações, etc.)
 *   5. Persistência: salvar no histórico (autenticado) ou localStorage (anônimo)
 *   6. Compartilhamento: gera token público e URL compartilhável
 *
 * Modos de análise suportados:
 *   - simplificação (agente "simples"): resumo + linguagem cidadã
 *   - agentes especializados: analista, estrategica, acompanhamento, documentacao, elegibilidade
 *
 * Gerenciamento de estado:
 *   - React Query (@tanstack/react-query) para todas as chamadas à API
 *   - Estado local (useState) para UI: texto, modo, arquivo, carregamentos
 *   - Progresso visual de análise com estágios animados (pattern de niasci-utils)
 *
 * Componentes internos notáveis:
 *   - AgentCard: card de seleção de agente com ícone, cor e descrição
 *   - ResultView: renderiza o resultado estruturado do agente em abas/acordeões
 *   - HistoryPanel: painel lateral com histórico de análises e pesquisa
 *   - UploadZone: drag-and-drop de PDF com preview de nome/tamanho
 *
 * @see agents.ts para metadados dos agentes
 * @see analisesService.ts para persistência de análises
 * @see pdf.ts para extração de texto de PDFs
 */

import { useState, useRef, useMemo, useEffect, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LearnBox } from "@/components/edu/LearnBox";
import { AutoTerms } from "@/components/edu/AutoTerms";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import {
  useListEditalHistory,
  useDeleteEdital,
  useExtractEditalFromUrl,
  useAnalyzeEdital,
  useListAgentHistory,
  useSaveAgentResult,
  useDeleteAgentResult,
  getListEditalHistoryQueryKey,
  getListAgentHistoryQueryKey,
} from "@workspace/api-client-react";
import type {
  SavedEdital,
  AgentResultRecord,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  BarChart2,
  Target,
  CalendarDays,
  ClipboardList,
  UserCheck,
  History,
  Heart,
  Trash2,
  ChevronRight,
  X,
  Download,
  Link as LinkIcon,
  Search,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  FileText,
  Info,
  ChevronDown,
  Share2,
  Copy,
  MessageSquare,
} from "lucide-react";
import {
  AGENTS,
  type AgentId,
  type AgentResult,
  type SimplesResult,
  type AnalistaResult,
  type EstrategicaResult,
  type AcompanhamentoResult,
  type DocumentacaoResult,
  type ElegibilidadeResult,
  type UserProfile,
  type ChecklistItem,
} from "@/lib/agents";
// Leitor de PDF (pdf.js + OCR) só é baixado quando a pessoa envia um PDF (~515 KB a menos no /testar)
import type { PdfStructuredData } from "@/lib/pdf";
import { apiFetch } from "@/lib/api";
import { QueroParticipar } from "@/components/lupa/QueroParticipar";
import { deleteLocalHistory, listLocalHistory, saveLocalHistory, setLocalFavorite, type LocalAgentRecord } from "@/lib/localHistory";
import { DocumentTimeline, QuickViewContent, ResultValidity, StageBanner, isPartialResult, type RealStage } from "@/components/testar/AnalysisPanels";
import { LongDocProgress, type LongJobView } from "@/components/testar/LongDocProgress";
import { checkSupabaseConnection, isSupabaseConfigured } from "@/lib/supabase";
import {
  buildChecklistItems,
  buildChatSuggestions,
  buildFaqItems,
  buildTimelineSteps,
  describeDeadline,
  documentLine,
  resolveAnalysisFacts,
  type ChecklistItemSummary,
  type TimelineStep,
} from "@/lib/analysisViewModel";
import {
  salvarAnalise,
  atualizarAnalise,
  listarAnalises,
  excluirAnalise,
  limparAnalises,
  type AnaliseSalva,
} from "@/services/analisesService";

interface CanonicalAnalysisLike {
  analysisId?: string;
  historyId?: number;
  schemaVersion?: string;
  source?: {
    agentId?: string;
    generatedAt?: string;
    textLength?: number;
    profile?: Record<string, unknown>;
  };
  documento?: {
    titulo?: string;
    numero?: string;
    orgao?: string;
    anoPublicacao?: number;
    tipo?: string;
    fonte?: string;
    totalPaginas?: number;
  };
  interpretation?: {
    summary?: string;
    objective?: string;
    targetAudience?: string;
    deadlines?: string;
    registrationLocation?: string;
    requirements?: string[];
    simpleLanguage?: string;
  };
  cronograma?: {
    items?: Array<{ fase: string; periodo: string; descricao: string; status: "passado" | "ativo" | "futuro" }>;
  };
  checklist?: {
    items?: Array<{ doc: string; obrigatorio: boolean; observacao: string; checked: boolean }>;
  };
  elegibilidade?: {
    score?: number;
    criteria?: Array<{ criterio: string; atende: boolean | "parcial" | null; observacao: string }>;
    recommendation?: string;
    nextSteps?: string[];
  };
  valores?: {
    valor?: string;
    moeda?: string;
    observacao?: string;
  };
  documentosExigidos?: {
    items?: string[];
    summary?: string;
  };
  alertas?: Array<string | { descricao?: string; [key: string]: unknown }>;
  agentResult?: Record<string, unknown>;
  processing?: {
    mode?: string;
    totalChunks?: number;
    processedChunks?: number;
    failedChunks?: number;
    complete?: boolean;
    reason?: string;
    userMessage?: string;
    retryable?: boolean;
  };
}

function canonicalToAgentResult(canonical: CanonicalAnalysisLike | null | undefined): AgentResult | null {
  if (!canonical) return null;

  const interpretation = canonical.interpretation ?? {};
  const agentId = (canonical.source?.agentId as AgentId | undefined) ?? "simples";

  const alertas = canonical.alertas ?? [];
  const alerts = alertas.map((alerta) =>
    typeof alerta === "string" ? alerta : alerta.descricao ?? JSON.stringify(alerta),
  );

  switch (agentId) {
    case "analista":
      return {
        type: "analista",
        tipoEdital: interpretation.summary || "Edital público",
        instituicao: interpretation.registrationLocation || "Instituição não identificada",
        prazo: interpretation.deadlines || "Não informado",
        publicoAlvo: interpretation.targetAudience || "Público-alvo conforme edital",
        requisitos: interpretation.requirements ?? [],
        documentos: canonical.documentosExigidos?.items ?? [],
        valor: canonical.valores?.valor || "Não informado",
        alertas: alerts,
      };
    case "documentacao":
      return {
        type: "documentacao",
        checklist: (canonical.checklist?.items ?? []).map((item) => ({
          doc: item.doc,
          obrigatorio: item.obrigatorio,
          observacao: item.observacao,
          checked: item.checked,
        })),
        dica: interpretation.simpleLanguage || "Confira os documentos exigidos no edital original.",
        alertas: alerts,
      };
    case "elegibilidade":
      return {
        type: "elegibilidade",
        score: canonical.elegibilidade?.score ?? 0,
        criterios: (canonical.elegibilidade?.criteria ?? []).map((item) => ({
          criterio: item.criterio,
          atende: item.atende,
          observacao: item.observacao,
        })),
        recomendacao: canonical.elegibilidade?.recommendation || interpretation.summary || "Recomendação não informada.",
        proximosPassos: canonical.elegibilidade?.nextSteps ?? [],
        alertas: alerts,
      };
    case "acompanhamento":
      return {
        type: "acompanhamento",
        timeline: (canonical.cronograma?.items ?? []).map((item) => ({
          fase: item.fase,
          periodo: item.periodo,
          descricao: item.descricao,
          status: item.status,
        })),
        observacao: interpretation.simpleLanguage || "Cronograma consolidado a partir do edital.",
        alertas: alerts,
      };
    case "estrategica":
      return {
        type: "estrategica",
        score: 70,
        oportunidade: interpretation.summary || "Oportunidade a confirmar no documento.",
        vantagens: [interpretation.objective || ""].filter(Boolean),
        pontosAtencao: interpretation.requirements ?? [],
        riscos: alerts,
        recomendacao: interpretation.simpleLanguage || "Revise os pontos de atenção.",
        alertas: alerts,
      };
    case "simples":
    default:
      return {
        type: "simples",
        scoreOportunidade: 70,
        categoria: "Edital público",
        resumo: interpretation.summary || "Resumo consolidado do edital.",
        objetivo: interpretation.objective || "Objetivo não informado.",
        publicoAlvo: interpretation.targetAudience || "Público-alvo conforme edital",
        prazo: interpretation.deadlines || "Não informado",
        requisitos: interpretation.requirements ?? [],
        ondeInscrever: interpretation.registrationLocation || "Não informado",
        observacao: interpretation.simpleLanguage || "Texto adaptado para leitura acessível.",
        alertas: alerts,
      };
  }
}

const missingInfoText = "Não foi possível localizar essa informação.";

function normalizeCanonicalText(value: string | undefined | null) {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return missingInfoText;
}

function normalizeCanonicalList(items: string[] | undefined | null) {
  if (Array.isArray(items) && items.length > 0) {
    return items;
  }
  return [missingInfoText];
}

function buildCanonicalFAQ(canonical: CanonicalAnalysisLike | null) {
  return buildFaqItems(canonical as never);
}

function getCanonicalAnswer(question: string, text: string, canonical: CanonicalAnalysisLike | null, profile: UserProfile) {
  const normalized = question.toLowerCase();
  if (!canonical) {
    return "Ainda não há uma interpretação canônica disponível. Faça a análise primeiro.";
  }

  const interpretation = canonical.interpretation ?? {};
  // Mesmo resolvedor do cronograma, da visão rápida, do FAQ e da exportação
  const facts = resolveAnalysisFacts(canonical as never);
  const docs = facts.documents.length
    ? facts.documents.map(documentLine).join("; ")
    : canonical.documentosExigidos?.items?.length
      ? canonical.documentosExigidos.items.join("; ")
      : normalizeCanonicalText(interpretation.requirements?.join("; "));
  const summary = normalizeCanonicalText(interpretation.summary);
  const recommendation = canonical.elegibilidade?.recommendation
    ? normalizeCanonicalText(canonical.elegibilidade.recommendation)
    : missingInfoText;

  if (/resumo|simples|linguagem simples|explicar/i.test(normalized)) {
    return summary;
  }

  if (/(como|onde)\b.{0,25}inscri|canal|plataforma|sistema de inscri/i.test(normalized)) {
    return facts.registration || "O canal de inscrição não foi localizado automaticamente no texto. Confira no edital.";
  }

  if (/quem pode|p[úu]blico|pode participar/i.test(normalized)) {
    return facts.audience ? `${facts.audience}` : "O público elegível não foi localizado automaticamente no texto. Confira no edital.";
  }

  if (/prazo|data|inscri/i.test(normalized)) {
    return describeDeadline(facts.deadline);
  }

  if (/document|anexo|arquivo|comprov/i.test(normalized)) {
    if (docs === missingInfoText) return "Os documentos exigidos não foram localizados automaticamente no texto. Confira o edital completo.";
    const extra = facts.unsupportedQualifiers.length ? ` O edital não menciona: ${facts.unsupportedQualifiers.join(", ")} — não providencie isso sem conferir.` : "";
    return `Documentos identificados: ${docs}.${extra}`;
  }

  if (/cronograma|timeline|fase|etapa/i.test(normalized)) {
    const cronogramaItems = canonical.cronograma?.items ?? [];
    return cronogramaItems.length > 0
      ? cronogramaItems.map((item) => `${item.fase}: ${item.periodo}`).join("\n")
      : "Não foi possível localizar um cronograma no documento.";
  }

  if (/elegibil|perfil|aderênc|atendo/i.test(normalized)) {
    if (canonical.elegibilidade?.criteria?.length) {
      return `A aderência estimada é ${canonical.elegibilidade.score ?? 0}%. ${recommendation}`;
    }
    return "Não foi possível verificar elegibilidade com os dados disponíveis.";
  }

  if (/valor|benef[ií]cio|bolsa|recurso|financi/i.test(normalized)) {
    return canonical.valores?.valor
      ? `Valor identificado: ${canonical.valores.valor}. ${normalizeCanonicalText(canonical.valores.observacao)}`
      : "Não foi possível localizar valor ou benefício no documento.";
  }

  if (/risco|aten[iç]ão|ponto|vantagem/i.test(normalized)) {
    return canonical.alertas && canonical.alertas.length > 0
      ? `Riscos e alertas: ${canonical.alertas.join("; ")}`
      : "Não foram identificados riscos claros no documento.";
  }

  return `Pergunta recebida. Baseado na análise canônica atual: ${summary}`;
}

/**
 * Mensagem que o PRÓPRIO servidor do LUPA já mandou pronta para a pessoa (campo "error" da resposta).
 * Falha corrigida (21/11/2026): o tradutor abaixo só conhece mensagens técnicas de provedores de IA;
 * respostas do LUPA como "Você atingiu o limite de uso por hora. Tente de novo em 34 min." caíam
 * no genérico "Não foi possível concluir a interpretação", e qualquer 401 (sessão expirada) virava
 * "a chave de API é inválida".
 */
function serverMessage(error: unknown): string | null {
  const e = error as { status?: unknown; data?: unknown } | null;
  const status = typeof e?.status === "number" ? e.status : null;
  if (status === 401) return "Sua sessão expirou. Entre novamente e tente de novo.";
  if (status === 504) return "A análise passou do tempo máximo do servidor. Tente com o edital dividido em partes menores, ou de novo em instantes.";
  const data = e?.data as { error?: unknown; code?: unknown } | null | undefined;
  if (data && typeof data === "object" && typeof data.error === "string" && data.error.trim()) {
    // Mensagens do LUPA são escritas para a pessoa; erros crus do provedor continuam no tradutor
    if (typeof data.code === "string" || status === 429 || status === 413 || status === 422 || status === 503) return data.error;
  }
  return null;
}

function getFriendlyErrorMessage(error: unknown) {
  const fromServer = serverMessage(error);
  if (fromServer) return fromServer;
  const normalize = (value: string) => value.toLowerCase();

  const render = (message: string) => {
    const normalized = normalize(message);
    // Limite para visitantes sem login (backend: code ANON_LIMIT)
    if (normalized.includes("sem login") || normalized.includes("anon_limit")) {
      return "Você atingiu o limite de análises gratuitas sem login. Entre ou crie uma conta gratuita para continuar.";
    }
    if (normalized.includes("minimo") || normalized.includes("20 caracteres")) {
      return "Insira um texto com pelo menos 20 caracteres para continuar.";
    }
    if (normalized.includes("texto pesquisável") || normalized.includes("ocr") || normalized.includes("pdf")) {
      return "O PDF não possui texto pesquisável. Utilize OCR ou outro arquivo.";
    }
    if (normalized.includes("documento vazio") || normalized.includes("sem texto") || normalized.includes("texto do documento")) {
      return "Não foi possível localizar texto no documento.";
    }
    if (
      normalized.includes("ultrapassa o limite") ||
      normalized.includes("content too large") ||
      normalized.includes("request too large") ||
      normalized.includes("input limit") ||
      normalized.includes("input is too long")
    ) {
      return "O documento é extenso e está sendo processado em partes. Aguarde a conclusão.";
    }
    if (
      normalized.includes("context_length_exceeded") ||
      normalized.includes("maximum context length") ||
      normalized.includes("muito extenso") ||
      normalized.includes("excedeu o limite") ||
      normalized.includes("bloco") && normalized.includes("excedeu")
    ) {
      return "Um dos blocos do documento ainda excedeu o limite de processamento.";
    }
    if (
      normalized.includes("rate_limit") ||
      normalized.includes("rate limit") ||
      normalized.includes("sobrecarregada") ||
      normalized.includes("limite tempor") ||
      normalized.includes("quota exceeded")
    ) {
      return "O limite temporário de análises foi atingido. Aguarde e tente novamente.";
    }
    if (
      normalized.includes("401") ||
      normalized.includes("unauthorized") ||
      normalized.includes("invalid api key") ||
      normalized.includes("incorrect api key") ||
      normalized.includes("chave de api") ||
      normalized.includes("chave de api do serviço")
    ) {
      return "A chave de API do serviço de IA é inválida. Entre em contato com o administrador.";
    }
    if (
      normalized.includes("403") ||
      normalized.includes("forbidden") ||
      normalized.includes("permission denied") ||
      normalized.includes("não tem permissão")
    ) {
      return "O serviço de IA não tem permissão para processar esta solicitação.";
    }
    if (
      normalized.includes("404") ||
      normalized.includes("model not found") ||
      normalized.includes("does not exist") ||
      normalized.includes("modelo") && normalized.includes("não está disponível")
    ) {
      return "O modelo de IA configurado não está disponível. Entre em contato com o administrador.";
    }
    if (
      normalized.includes("temporariamente indispon") ||
      normalized.includes("provider unavailable") ||
      normalized.includes("serviço de ia") ||
      normalized.includes("serviço de ia está") ||
      normalized.includes("passando por instabilidade")
    ) {
      return "O serviço de IA está temporariamente indisponível.";
    }
    if (
      normalized.includes("timeout") ||
      normalized.includes("demorou mais") ||
      normalized.includes("etimedout") ||
      normalized.includes("aborted")
    ) {
      return "A análise demorou mais que o esperado. Tente novamente.";
    }
    if (
      normalized.includes("500") ||
      normalized.includes("502") ||
      normalized.includes("504") ||
      normalized.includes("internal server error") ||
      normalized.includes("server had an error") ||
      normalized.includes("bad gateway") ||
      normalized.includes("upstream")
    ) {
      return "O serviço de IA está passando por instabilidade. Tente novamente em alguns instantes.";
    }
    if (normalized.includes("resposta incompleta") || normalized.includes("schema") || normalized.includes("json") || normalized.includes("validation")) {
      return "A IA retornou uma resposta incompleta. A análise não foi salva.";
    }
    if (normalized.includes("safety") || normalized.includes("blocked") || normalized.includes("harmful") || normalized.includes("conteúdo do documento não pôde")) {
      return "O conteúdo do documento não pôde ser processado pelo modelo de IA. Tente com outro documento.";
    }
    if (normalized.includes("banco") || normalized.includes("history") || normalized.includes("salvar")) {
      return "A interpretação foi concluída, mas não foi possível salvá-la no histórico.";
    }
    if (normalized.includes("url")) {
      return "Não foi possível acessar a URL informada. Verifique se ela é pública e tente novamente.";
    }
    if (normalized.includes("network") || normalized.includes("fetch") || normalized.includes("econnrefused") || normalized.includes("econnreset")) {
      return "A conexão com o serviço de interpretação falhou. Tente novamente em instantes.";
    }
    if (normalized.includes("nenhuma chave") || normalized.includes("api key") || normalized.includes("not configured") || normalized.includes("chave de api")) {
      return "O serviço de IA não está configurado. Entre em contato com o administrador do sistema.";
    }
    return "Não foi possível concluir a interpretação neste momento. Tente novamente.";
  };

  if (typeof error === "string") {
    return render(error);
  }

  if (error instanceof Error) {
    return render(error.message);
  }

  return "Não foi possível concluir a interpretação neste momento. Tente novamente.";
}

/** Sugestão automática de agente + o motivo, para a interface explicar a escolha. */
export function suggestAgent(text: string, profile: UserProfile): { agent: AgentId; reason: string } {
  const normalized = `${text} ${profile.atuacao} ${profile.municipio}`.toLowerCase();
  const rules: Array<[RegExp, AgentId]> = [
    [/elegibilidade|perfil|renda|escolaridade|candidatura|aderência/i, "elegibilidade"],
    [/documento|comprovante|certidão|currículo|histórico|anexo/i, "documentacao"],
    [/prazo|cronograma|inscrição|resultado|recurso|convocação/i, "acompanhamento"],
    [/oportunidade|risco|vantagem|estratégia|recomendação/i, "estrategica"],
    [/instituição|público|requisito|valor|benefício|licitação|concurso/i, "analista"],
  ];
  for (const [re, agent] of rules) {
    const m = normalized.match(re);
    if (m) return { agent, reason: `o texto menciona “${m[0]}”` };
  }
  return { agent: "simples", reason: "nenhum foco específico foi detectado no texto" };
}

function resolveAutoAgent(text: string, profile: UserProfile): AgentId {
  const normalized = `${text} ${profile.atuacao} ${profile.municipio}`.toLowerCase();

  if (/elegibilidade|perfil|renda|escolaridade|candidatura|aderência/i.test(normalized)) {
    return "elegibilidade";
  }

  if (/documento|comprovante|certidão|currículo|histórico|anexo/i.test(normalized)) {
    return "documentacao";
  }

  if (/prazo|cronograma|inscrição|resultado|recurso|convocação/i.test(normalized)) {
    return "acompanhamento";
  }

  if (/oportunidade|risco|vantagem|estratégia|recomendação/i.test(normalized)) {
    return "estrategica";
  }

  if (/instituição|público|requisito|valor|benefício|licitação|concurso/i.test(normalized)) {
    return "analista";
  }

  return "simples";
}

type AnalysisStage =
  | "idle"
  | "reading"
  | "extracting"
  | "requirements"
  | "summary"
  | "finalizing"
  | "completed"
  | "error";

// ── Icon map ────────────────────────────────────────────────────
const ICON_MAP: Record<string, ReactNode> = {
  Sparkles: <Sparkles className="w-5 h-5" />,
  BarChart2: <BarChart2 className="w-5 h-5" />,
  Target: <Target className="w-5 h-5" />,
  CalendarDays: <CalendarDays className="w-5 h-5" />,
  ClipboardList: <ClipboardList className="w-5 h-5" />,
  UserCheck: <UserCheck className="w-5 h-5" />,
};

function getSimplifiedText(result: AgentResult) {
  switch (result.type) {
    case "simples":
      return result.resumo;
    case "analista":
      return [
        result.tipoEdital ? `Tipo: ${result.tipoEdital}.` : "",
        result.instituicao ? `Instituição: ${result.instituicao}.` : "",
        result.prazo ? `Prazo(s): ${result.prazo}.` : "",
        result.publicoAlvo ? `Público: ${result.publicoAlvo}.` : "",
        result.valor ? `Valor / Benefício: ${result.valor}.` : "",
      ]
        .filter(Boolean)
        .join(" ");
    case "estrategica":
      return result.oportunidade;
    case "acompanhamento":
      return result.observacao;
    case "documentacao":
      return `Checklist: ${result.checklist.map((item) => item.doc).join(", ")}. ${result.dica}`;
    case "elegibilidade":
      return `${result.recomendacao} ${result.proximosPassos.join(" ")}`;
    default:
      return "";
  }
}

function buildChatSuggestionsForPage(canonical: CanonicalAnalysisLike | null, timelineSteps: TimelineStep[], checklistItems: ChecklistItemSummary[]) {
  return buildChatSuggestions(canonical as never, timelineSteps, checklistItems);
}

// ── PDF export ───────────────────────────────────────────────────
async function exportToPDF(result: AgentResult, title: string, canonicalData?: CanonicalAnalysisLike | null) {
  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const bottomLimit = pageHeight - margin;
  const agentMeta =
    AGENTS.find((agent) => agent.id === result.type) ?? AGENTS[0];
  const normalizedTitle = title
    .slice(0, 40)
    .replace(/[^a-zA-Z0-9\u00C0-\u017F\s]/g, "")
    .trim();

  let cursorY = margin;

  const themeByAgent: Record<
    AgentId,
    {
      accent: [number, number, number];
      title: string;
      subtitle: string;
      summary: string;
    }
  > = {
    simples: {
      accent: [37, 99, 235],
      title: "Resumo fácil",
      subtitle: "Leitura rápida e direta do edital",
      summary: result.type === "simples" ? result.resumo : "",
    },
    analista: {
      accent: [124, 58, 237],
      title: "Indicadores-chave",
      subtitle: "Visão técnica dos dados mais importantes",
      summary:
        result.type === "analista"
          ? [result.tipoEdital, result.instituicao, result.prazo]
              .filter(Boolean)
              .join(" • ")
          : "",
    },
    estrategica: {
      accent: [16, 185, 129],
      title: "Interpretação de oportunidade",
      subtitle: "Leitura estratégica para tomada de decisão",
      summary: result.type === "estrategica" ? result.oportunidade : "",
    },
    acompanhamento: {
      accent: [217, 119, 6],
      title: "Linha do tempo",
      subtitle: "Organização das etapas e prazos",
      summary: result.type === "acompanhamento" ? result.observacao : "",
    },
    documentacao: {
      accent: [225, 29, 72],
      title: "Checklist de docs",
      subtitle: "Lista prática para separar a documentação",
      summary: result.type === "documentacao" ? result.dica : "",
    },
    elegibilidade: {
      accent: [20, 184, 166],
      title: "Elegibilidade",
      subtitle: "Aderência do perfil aos critérios do edital",
      summary: result.type === "elegibilidade" ? result.recomendacao : "",
    },
  };

  const theme = themeByAgent[result.type];
  const canonicalSummary = canonicalData?.interpretation?.summary ?? "";
  const canonicalObjective = canonicalData?.interpretation?.objective ?? "";
  const canonicalChecklist = canonicalData?.checklist?.items ?? [];
  const canonicalTimeline = canonicalData?.cronograma?.items ?? [];
  const canonicalEligibility = canonicalData?.elegibilidade?.criteria ?? [];

  const ensureSpace = (neededHeight: number) => {
    if (cursorY + neededHeight > bottomLimit) {
      pdf.addPage();
      cursorY = margin;
      drawSectionHeader();
    }
  };

  const writeText = (
    text: string,
    size = 11,
    options: { bold?: boolean; color?: [number, number, number] } = {},
  ) => {
    pdf.setFont("helvetica", options.bold ? "bold" : "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(...(options.color ?? [34, 34, 34]));
    const lines = pdf.splitTextToSize(text, contentWidth);
    const lineHeight = size * 0.45 + 3;
    ensureSpace(lines.length * lineHeight + 2);
    pdf.text(lines, margin, cursorY);
    cursorY += lines.length * lineHeight;
  };

  const writeCard = (
    label: string,
    value: string,
    accent: [number, number, number],
  ) => {
    const cardHeight = 18;
    ensureSpace(cardHeight + 2);
    pdf.setDrawColor(accent[0], accent[1], accent[2]);
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(margin, cursorY, contentWidth, cardHeight, 3, 3, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(accent[0], accent[1], accent[2]);
    pdf.text(label, margin + 3, cursorY + 6);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10.5);
    pdf.setTextColor(34, 34, 34);
    const lines = pdf.splitTextToSize(
      value || "Não informado.",
      contentWidth - 6,
    );
    pdf.text(lines.slice(0, 2), margin + 3, cursorY + 11);
    cursorY += cardHeight + 3;
  };

  const writeSectionTitle = (
    text: string,
    accent: [number, number, number],
  ) => {
    ensureSpace(10);
    pdf.setFillColor(accent[0], accent[1], accent[2]);
    pdf.roundedRect(margin, cursorY - 0.5, 3, 3, 1, 1, "F");
    writeText(text, 12, { bold: true, color: accent });
    cursorY += 0.5;
  };

  const writeBullets = (items: string[], accent: [number, number, number]) => {
    items.forEach((item) => {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10.5);
      pdf.setTextColor(accent[0], accent[1], accent[2]);
      const lines = pdf.splitTextToSize(`• ${item}`, contentWidth);
      const lineHeight = 5.3;
      ensureSpace(lines.length * lineHeight + 1);
      pdf.text(lines, margin, cursorY);
      cursorY += lines.length * lineHeight;
    });
  };

  const addPageFooter = (pageNumber: number) => {
    pdf.setDrawColor(226, 232, 240);
    pdf.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`LUPA Digital • ${agentMeta.name}`, margin, pageHeight - 7);
    pdf.setFillColor(theme.accent[0], theme.accent[1], theme.accent[2]);
    pdf.roundedRect(pageWidth - margin - 20, pageHeight - 11, 20, 6, 2, 2, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text(`P${pageNumber}`, pageWidth - margin - 10, pageHeight - 6.7, {
      align: "center",
    });
  };

  const drawSectionHeader = () => {
    pdf.setFillColor(15, 23, 42);
    pdf.rect(0, 0, pageWidth, 28, "F");
    pdf.setFillColor(theme.accent[0], theme.accent[1], theme.accent[2]);
    pdf.circle(pageWidth - margin - 8, 14, 5.2, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.text("LUPA Digital", margin, 12);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.text(`Relatório gerado pela ${agentMeta.name}`, margin, 19);
    pdf.text(theme.title, pageWidth - margin, 19, { align: "right" });
    pdf.setDrawColor(theme.accent[0], theme.accent[1], theme.accent[2]);
    pdf.line(margin, 29.5, pageWidth - margin, 29.5);
    cursorY = 36;
  };

  const drawCover = () => {
    pdf.setFillColor(theme.accent[0], theme.accent[1], theme.accent[2]);
    pdf.rect(0, 0, pageWidth, pageHeight, "F");

    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(margin, 18, contentWidth, 44, 6, 6, "F");
    pdf.setFillColor(theme.accent[0], theme.accent[1], theme.accent[2]);
    pdf.circle(pageWidth - margin - 15, 32, 9, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text("LP", pageWidth - margin - 15, 34, { align: "center" });
    pdf.setTextColor(theme.accent[0], theme.accent[1], theme.accent[2]);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(20);
    pdf.text("LUPA Digital", margin + 8, 34);
    pdf.setFontSize(13);
    pdf.text(theme.title, margin + 8, 42);
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(margin + 8, 45, 42, 7, 3, 3, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.8);
    pdf.setTextColor(theme.accent[0], theme.accent[1], theme.accent[2]);
    pdf.text(agentMeta.name, margin + 29, 49.8, { align: "center" });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(agentMeta.description, margin + 8, 55, {
      maxWidth: contentWidth - 38,
    });

    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(margin, 72, contentWidth, 82, 6, 6, "F");
    pdf.setTextColor(30, 41, 59);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text("Resumo executivo", margin + 8, 84);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10.5);
    pdf.text(theme.subtitle, margin + 8, 92);
    pdf.setFillColor(theme.accent[0], theme.accent[1], theme.accent[2]);
    pdf.roundedRect(margin + 8, 96, 28, 6, 3, 3, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text("PDF EXPORT", margin + 22, 100.2, { align: "center" });

    const coverSummary =
      theme.summary || normalizedTitle || `Interpretação ${agentMeta.name}`;
    const coverLines = pdf.splitTextToSize(coverSummary, contentWidth - 16);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10.5);
    pdf.setTextColor(30, 41, 59);
    pdf.text(coverLines.slice(0, 4), margin + 8, 109);

    const metricY = 130;
    const metricWidth = (contentWidth - 8) / 2;
    const metricHeight = 18;
    const scoreLabel =
      result.type === "simples"
        ? `${result.scoreOportunidade}/100`
        : result.type === "analista"
          ? result.tipoEdital
          : result.type === "estrategica"
            ? `${result.score}/100`
            : result.type === "acompanhamento"
              ? `${result.timeline.length} etapas`
              : result.type === "documentacao"
                ? `${result.checklist.length} docs`
                : `${result.score}%`;
    const secondaryLabel =
      result.type === "simples"
        ? result.categoria
        : result.type === "analista"
          ? result.instituicao
          : result.type === "estrategica"
            ? "Oportunidade"
            : result.type === "acompanhamento"
              ? "Cronograma"
              : result.type === "documentacao"
                ? "Checklist"
                : "Aderência";

    const drawMetric = (x: number, label: string, value: string) => {
      pdf.setDrawColor(theme.accent[0], theme.accent[1], theme.accent[2]);
      pdf.setFillColor(250, 250, 250);
      pdf.roundedRect(x, metricY, metricWidth, metricHeight, 4, 4, "FD");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(theme.accent[0], theme.accent[1], theme.accent[2]);
      pdf.text(label, x + 3, metricY + 6);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.setTextColor(15, 23, 42);
      pdf.text(value, x + 3, metricY + 13);
    };

    drawMetric(margin, "Destaque principal", scoreLabel);
    drawMetric(margin + metricWidth + 8, "Contexto", secondaryLabel);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(255, 255, 255);
    pdf.text(
      `Gerado em ${new Date().toLocaleString("pt-BR")}`,
      margin,
      pageHeight - 10,
    );
    pdf.setFont("helvetica", "bold");
    pdf.text(theme.title, pageWidth - margin, pageHeight - 10, {
      align: "right",
    });
  };

  drawCover();
  pdf.addPage();
  drawSectionHeader();

  writeText(normalizedTitle || `Interpretação ${agentMeta.name}`, 14, { bold: true });
  writeText(agentMeta.description, 10.5, { color: [71, 85, 105] });
  // Identificação do documento e estado da análise (mesma versão exibida na tela)
  const extra = (canonicalData ?? {}) as {
    base?: { caracteres?: number; documento_hash?: string; datas?: Array<{ rotulo: string; iso: string | null; evidencia: string }>; valores?: Array<{ texto: string }>; documentos?: Array<{ texto: string; evidencia: string }>; ausentes?: string[] };
    fatos?: unknown;
    verificacao?: Array<{ mensagem: string }>;
    processing?: { mode?: string; complete?: boolean };
    analysisId?: string;
  };
  writeText(
    `Documento analisado: ${extra.base?.caracteres ? `${extra.base.caracteres.toLocaleString("pt-BR")} caracteres` : "texto informado"}${extra.base?.documento_hash ? ` · código ${extra.base.documento_hash.slice(0, 12)}` : ""}${extra.analysisId ? ` · análise ${String(extra.analysisId).slice(0, 18)}` : ""} · gerado em ${new Date().toLocaleString("pt-BR")}`,
    9,
    { color: [71, 85, 105] },
  );
  if (extra.processing?.mode === "fallback" || extra.processing?.complete === false) {
    writeSectionTitle("ATENÇÃO: análise parcial", [180, 83, 9]);
    writeText(
      extra.processing?.mode === "fallback"
        ? "A IA não respondeu. Este resultado foi montado por regras simples a partir do texto e pode estar incompleto. Não use como análise completa."
        : "Parte do documento não foi processada. Não use este resultado como completo.",
      10.5,
      { color: [146, 64, 14], bold: true },
    );
  }
  if (extra.verificacao?.length) {
    writeSectionTitle("Conferir no documento", [180, 83, 9]);
    writeBullets(extra.verificacao.map((v) => v.mensagem), [180, 83, 9]);
  }
  writeText("Confira sempre as informações no documento oficial: ele prevalece sobre esta interpretação.", 9.5, { color: [71, 85, 105] });
  cursorY += 1;

  if (result.type === "simples") {
    writeSectionTitle("Resumo fácil", theme.accent);
    writeCard(
      "Score de oportunidade",
      `${result.scoreOportunidade}/100`,
      theme.accent,
    );
    writeCard("Categoria", result.categoria, theme.accent);
    writeCard("Público-alvo", result.publicoAlvo, theme.accent);
    writeSectionTitle("Resumo", theme.accent);
    writeText(result.resumo, 11);
    writeSectionTitle("Objetivo", theme.accent);
    writeText(result.objetivo, 11);
    writeSectionTitle("Prazo", theme.accent);
    writeText(result.prazo, 11);
    writeSectionTitle("Requisitos", theme.accent);
    writeBullets(
      result.requisitos.length > 0
        ? result.requisitos
        : ["Nenhum requisito identificado automaticamente."],
      theme.accent,
    );
    writeSectionTitle("Onde se inscrever", theme.accent);
    writeText(result.ondeInscrever, 11);
    writeSectionTitle("Observação", theme.accent);
    writeText(result.observacao, 10.5, { color: [120, 53, 15] });
  } else if (result.type === "analista") {
    writeSectionTitle("Indicadores-chave", theme.accent);
    writeCard("Tipo de edital", result.tipoEdital, theme.accent);
    writeCard("Instituição", result.instituicao, theme.accent);
    writeCard("Prazo(s)", result.prazo, theme.accent);
    writeCard("Público-alvo", result.publicoAlvo, theme.accent);
    writeCard("Valor / Benefício", result.valor, theme.accent);
    writeSectionTitle("Requisitos identificados", theme.accent);
    writeBullets(
      result.requisitos.length > 0
        ? result.requisitos
        : ["Nenhum requisito identificado automaticamente."],
      theme.accent,
    );
    writeSectionTitle("Documentos necessários", theme.accent);
    writeBullets(
      result.documentos.length > 0
        ? result.documentos
        : ["Nenhum documento identificado automaticamente."],
      theme.accent,
    );
  } else if (result.type === "estrategica") {
    writeSectionTitle("Interpretação de oportunidade", theme.accent);
    writeCard("Score", `${result.score}/100`, theme.accent);
    writeText(result.oportunidade, 11);
    writeSectionTitle("Vantagens", theme.accent);
    writeBullets(result.vantagens, theme.accent);
    writeSectionTitle("Pontos de atenção", [245, 158, 11]);
    writeBullets(result.pontosAtencao, [180, 83, 9]);
    writeSectionTitle("Riscos", [220, 38, 38]);
    writeBullets(result.riscos, [220, 38, 38]);
    writeSectionTitle("Recomendação", theme.accent);
    writeText(result.recomendacao, 11);
  } else if (result.type === "acompanhamento") {
    writeSectionTitle("Linha do tempo", theme.accent);
    result.timeline.forEach((item, index) => {
      writeCard(`${index + 1}. ${item.fase}`, item.periodo, theme.accent);
      writeText(item.descricao, 10.5, { color: [71, 85, 105] });
      cursorY += 1;
    });
    writeSectionTitle("Observação", theme.accent);
    writeText(result.observacao, 10.5);
  } else if (result.type === "documentacao") {
    writeSectionTitle("Checklist de docs", theme.accent);
    result.checklist.forEach((item, index) => {
      const status = item.checked ? "Concluído" : "Pendente";
      writeCard(`${index + 1}. ${item.doc}`, status, theme.accent);
      writeText(item.observacao, 10, { color: [71, 85, 105] });
      cursorY += 1;
    });
    writeSectionTitle("Dica", theme.accent);
    writeText(result.dica, 10.5);
  } else {
    writeSectionTitle("Elegibilidade", theme.accent);
    writeCard("Score de aderência", `${result.score}%`, theme.accent);
    writeText(result.recomendacao, 11);
    writeSectionTitle("Critérios analisados", theme.accent);
    result.criterios.forEach((criterio, index) => {
      const estado = (criterio as { estado?: string }).estado;
      const status =
        estado === "atendido" || criterio.atende === true
          ? "Atende"
          : estado === "pendente" || criterio.atende === "parcial"
            ? "Pendente de comprovação"
            : "Não atende";
      writeCard(`${index + 1}. ${criterio.criterio}`, status, theme.accent);
      writeText(criterio.observacao, 10, { color: [71, 85, 105] });
      cursorY += 1;
    });
    writeSectionTitle("Próximos passos", theme.accent);
    writeBullets(result.proximosPassos, theme.accent);
  }

  // Base documental comum: as mesmas datas, valores e documentos para qualquer agente
  // Mesmo resolvedor da tela: prazo, documentos (com origem) e pendências conciliadas
  const facts = resolveAnalysisFacts((canonicalData ?? null) as never);
  writeSectionTitle("Prazo de inscrição", theme.accent);
  writeText(describeDeadline(facts.deadline), 10.5);
  if (facts.documents.some((d) => d.origin)) {
    writeSectionTitle("Documentos (conferidos no texto do edital)", theme.accent);
    writeBullets(facts.documents.map((d) => `${documentLine(d)}${d.evidence ? ` — "${d.evidence.slice(0, 160)}"` : ""}`), theme.accent);
  }
  if (facts.unsupportedQualifiers.length) {
    writeSectionTitle("Não confirmado no edital", [180, 83, 9]);
    writeText(`A análise mencionou ${facts.unsupportedQualifiers.join(", ")}, mas o documento não fala disso. Não trate como exigência sem conferir.`, 10.5);
  }

  if (extra.base) {
    if (extra.base.datas?.length) {
      writeSectionTitle("Datas encontradas no documento", theme.accent);
      writeBullets(
        extra.base.datas.map((d) => `${d.rotulo}: ${d.iso ? d.iso.split("-").reverse().join("/") : "sem data"} — "${d.evidencia.slice(0, 160)}"`),
        theme.accent,
      );
    }
    if (extra.base.valores?.length) {
      writeSectionTitle("Valores encontrados no documento", theme.accent);
      writeBullets(extra.base.valores.map((v) => v.texto.slice(0, 220)), theme.accent);
    }
    if (extra.base.documentos?.length) {
      writeSectionTitle("Documentos exigidos (trechos do documento)", theme.accent);
      writeBullets(extra.base.documentos.map((d) => d.texto.slice(0, 220)), theme.accent);
    }
    if (facts.missing.length) {
      writeSectionTitle("Não localizado automaticamente no texto", [180, 83, 9]);
      writeText("Isso não significa que o edital não trate do assunto: confira o documento completo.", 9.5, { color: [71, 85, 105] });
      writeBullets(facts.missing.map((m) => `${m.label} — ${m.state === "parcial" ? "parcial" : m.state === "incerto" ? "só a IA indicou, sem trecho" : "não localizado"}`), [180, 83, 9]);
    }
  }

  pdf.setPage(1);
  addPageFooter(1);
  for (let page = 2; page <= pdf.getNumberOfPages(); page += 1) {
    pdf.setPage(page);
    addPageFooter(page);
  }

  pdf.save(`${normalizedTitle || `lupa-${result.type}`}.pdf`);
}

// ── Score Gauge ─────────────────────────────────────────────────
function ScoreGauge({ score }: { score: number }) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";
  const gradient =
    score >= 70
      ? "from-emerald-950 via-emerald-900 to-slate-900"
      : score >= 40
        ? "from-amber-950 via-slate-900 to-slate-900"
        : "from-red-950 via-slate-900 to-slate-900";
  const label =
    score >= 70
      ? "Alta Oportunidade"
      : score >= 40
        ? "Oportunidade Moderada"
        : "Baixa Oportunidade";
  const desc =
    score >= 70
      ? "Requisitos acessíveis, boa clareza — vale a inscrição."
      : score >= 40
        ? "Avalie os requisitos com cuidado antes de se inscrever."
        : "Verifique as exigências — pode ser complexo.";

  return (
    <div
      className={`flex items-center gap-5 p-4 rounded-2xl bg-gradient-to-r ${gradient} text-white shadow-xl`}
    >
      <div className="relative w-24 h-24 shrink-0">
        <svg viewBox="0 0 110 110" className="w-full h-full -rotate-90">
          <circle
            cx="55"
            cy="55"
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="10"
          />
          <circle
            cx="55"
            cy="55"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{
              transition: "stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)",
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black tabular-nums" style={{ color }}>
            {score}
          </span>
          <span className="text-[9px] text-white/40 uppercase tracking-widest font-semibold">
            /100
          </span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-white/40 uppercase tracking-widest font-semibold mb-0.5">
          Score de Oportunidade
        </p>
        <p className="text-base font-bold leading-snug" style={{ color }}>
          {label}
        </p>
        <p className="text-xs text-white/55 mt-1 leading-relaxed">{desc}</p>
        <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full transition duration-1000"
            style={{ width: `${score}%`, backgroundColor: color }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Agent Selector ───────────────────────────────────────────────
function AgentSelector({
  selected,
  onSelect,
}: {
  selected: AgentId;
  onSelect: (id: AgentId) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-md bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-3 h-3 text-primary" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">
          Escolha o agente de interpretação
        </h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {AGENTS.map((agent) => {
          const isSelected = selected === agent.id;
          return (
            <button
              key={agent.id}
              onClick={() => onSelect(agent.id)}
              data-testid={`agent-${agent.id}`}
              className={`relative text-left p-3 rounded-xl border transition duration-200 group ${
                isSelected
                  ? `${agent.color} border-transparent shadow-md ring-2 ring-offset-1 ${agent.borderColor.replace("border-", "ring-")}`
                  : "bg-card border-border/70 hover:border-primary/30 hover:shadow-sm"
              }`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 transition ${
                  isSelected
                    ? `bg-white/20 ${agent.textColor}`
                    : "bg-muted/70 text-muted-foreground group-hover:bg-primary/5 group-hover:text-primary"
                }`}
              >
                {ICON_MAP[agent.iconName]}
              </div>
              <p
                className={`text-xs font-bold leading-tight ${isSelected ? agent.textColor : "text-foreground"}`}
              >
                {agent.name}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                {agent.tagline}
              </p>
              {isSelected && (
                <span
                  className={`absolute top-2 right-2 w-2 h-2 rounded-full animate-pulse ${agent.textColor.replace("text-", "bg-")}`}
                />
              )}
            </button>
          );
        })}
      </div>
      {(() => {
        const meta = AGENTS.find((a) => a.id === selected)!;
        return (
          <div
            className={`flex items-start gap-2 ${meta.color} rounded-xl px-3 py-2 border ${meta.borderColor}`}
          >
            <Info className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${meta.textColor}`} />
            <p className={`text-xs leading-relaxed ${meta.textColor}`}>
              {meta.description}
            </p>
          </div>
        );
      })()}
    </div>
  );
}

// ── Profile Form (Elegibilidade) ─────────────────────────────────
function ProfileForm({
  profile,
  onChange,
}: {
  profile: UserProfile;
  onChange: (p: UserProfile) => void;
}) {
  return (
    <div className="space-y-3 p-4 rounded-xl bg-teal-50 border border-teal-200">
      <p className="text-xs font-semibold text-teal-700 flex items-center gap-1.5">
        <UserCheck className="w-3.5 h-3.5" />
        Seu perfil (para interpretação de elegibilidade)
      </p>
      <div className="grid grid-cols-1 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-teal-800">
            Escolaridade
          </label>
          <select
            value={profile.escolaridade}
            onChange={(e) =>
              onChange({ ...profile, escolaridade: e.target.value })
            }
            className="w-full text-xs rounded-lg border border-teal-300 bg-white px-2 py-1.5 text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-lens focus-visible:ring-offset-1 focus:ring-1 focus:ring-teal-400"
          >
            <option value="">Prefiro não informar</option>
            <option value="fundamental">Ensino Fundamental</option>
            <option value="medio">Ensino Médio</option>
            <option value="superior_incompleto">Superior Incompleto</option>
            <option value="superior">Superior Completo</option>
            <option value="pos">Pós-graduação / Mestrado / Doutorado</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-teal-800">
            Área de atuação / Profissão
          </label>
          <Input
            value={profile.atuacao}
            onChange={(e) => onChange({ ...profile, atuacao: e.target.value })}
            placeholder="Ex: Estudante de Pedagogia, Agricultor…"
            className="text-xs h-8 border-teal-300 focus:ring-teal-400"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-teal-800">
              Município/UF
            </label>
            <Input
              value={profile.municipio}
              onChange={(e) =>
                onChange({ ...profile, municipio: e.target.value })
              }
              placeholder="Ex: São Paulo/SP"
              className="text-xs h-8 border-teal-300 focus:ring-teal-400"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-teal-800">
              Renda familiar
            </label>
            <select
              value={profile.rendaFamiliar}
              onChange={(e) =>
                onChange({ ...profile, rendaFamiliar: e.target.value })
              }
              className="w-full text-xs rounded-lg border border-teal-300 bg-white px-2 py-1.5 text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-lens focus-visible:ring-offset-1 focus:ring-1 focus:ring-teal-400"
            >
              <option value="">Prefiro não informar</option>
              <option value="ate1">Até 1 salário mínimo</option>
              <option value="1a3">1 a 3 salários mínimos</option>
              <option value="3a5">3 a 5 salários mínimos</option>
              <option value="acima5">Acima de 5 salários mínimos</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Result Panels ────────────────────────────────────────────────

/**
 * AlertasPanel — Transparência e Rastreabilidade (Etapa 12, Coerência Científica)
 *
 * Exibe alertas de ambiguidade, inferências e pontos que o usuário deve verificar
 * no documento original, garantindo que as decisões da IA sejam transparentes.
 * Segue o Princípio 4 (Transparência) centralizado no AIService.
 */
function AlertasPanel({ alertas }: { alertas: string[] }) {
  if (!alertas || alertas.length === 0) return null;
  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 space-y-1.5">
      <p className="text-[10px] font-semibold text-orange-700 uppercase tracking-wider flex items-center gap-1.5">
        <AlertCircle className="w-3 h-3" />
        Pontos para verificar no documento original
      </p>
      <ul className="space-y-1">
        {alertas.map((alerta, i) => (
          <li key={i} className="text-xs text-orange-800 leading-snug flex items-start gap-1.5">
            <span className="shrink-0 mt-0.5 font-bold">·</span>
            {alerta}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptySection({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center rounded-3xl border border-dashed border-border/70 bg-slate-50/60 p-8">
      <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
        {icon}
      </div>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="text-sm text-muted-foreground mt-1.5 max-w-[340px]">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function SimplesPanel({ result }: { result: SimplesResult }) {
  return (
    <div className="space-y-4">
      {/* Score de Oportunidade */}
      {typeof result.scoreOportunidade === "number" && (
        <ScoreGauge score={result.scoreOportunidade} />
      )}

      {/* Categoria badge */}
      {result.categoria && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-semibold px-3 py-1.5 rounded-full border border-primary/20">
            <BarChart2 className="w-3.5 h-3.5" />
            {result.categoria}
          </span>
        </div>
      )}

      {/* Resumo */}
      <Card className="border-none shadow-md bg-primary text-primary-foreground rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4" />
            Resumo Simplificado
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="leading-relaxed opacity-90 text-sm">{result.resumo}</p>
        </CardContent>
      </Card>

      {/* Info cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          {
            label: "Objetivo",
            value: result.objetivo,
            icon: <Target className="w-3.5 h-3.5 text-primary" />,
          },
          {
            label: "Público-alvo",
            value: result.publicoAlvo,
            icon: <UserCheck className="w-3.5 h-3.5 text-primary" />,
          },
          {
            label: "Prazo",
            value: result.prazo,
            icon: <Clock className="w-3.5 h-3.5 text-primary" />,
          },
          {
            label: "Onde se Inscrever",
            value: result.ondeInscrever,
            icon: <FileText className="w-3.5 h-3.5 text-primary" />,
          },
        ].map(({ label, value, icon }) => (
          <Card key={label} className="rounded-xl shadow-sm">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                {icon}
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <p className="text-sm leading-relaxed">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Requisitos */}
      {result.requisitos && result.requisitos.length > 0 && (
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-primary" />
              Requisitos Principais
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ul className="space-y-1.5">
              {result.requisitos.map((req, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  <span className="leading-snug">{req}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
        <AlertCircle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-700">{result.observacao}</p>
      </div>
      <AlertasPanel alertas={result.alertas ?? []} />
    </div>
  );
}

function AnalistaPanel({ result }: { result: AnalistaResult }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Tipo de Edital", value: result.tipoEdital },
          { label: "Instituição", value: result.instituicao },
          { label: "Prazo(s)", value: result.prazo },
          { label: "Público-alvo", value: result.publicoAlvo },
          { label: "Valor / Benefício", value: result.valor },
        ].map(({ label, value }) => (
          <Card key={label} className="rounded-xl shadow-sm col-span-1">
            <CardContent className="p-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                {label}
              </p>
              <p className="text-sm font-medium leading-snug">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-violet-500" />
            Requisitos Identificados
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <ul className="space-y-1.5">
            {result.requisitos.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="w-4 h-4 rounded-full bg-violet-100 text-violet-600 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {r}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <ClipboardList className="w-3.5 h-3.5 text-violet-500" />
            Documentos Necessários
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <ul className="space-y-1">
            {result.documentos.map((d, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                {d}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <AlertasPanel alertas={result.alertas ?? []} />
    </div>
  );
}

function EstrategicaPanel({ result }: { result: EstrategicaResult }) {
  const scoreColor =
    result.score >= 75
      ? "text-emerald-600"
      : result.score >= 50
        ? "text-amber-600"
        : "text-red-500";
  const scoreLabel =
    result.score >= 75
      ? "Boa oportunidade"
      : result.score >= 50
        ? "Oportunidade moderada"
        : "Avaliar com cautela";
  return (
    <div className="space-y-4">
      <Card className="rounded-2xl shadow-sm border-emerald-100 bg-emerald-50">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="text-center shrink-0">
            <p className={`text-4xl font-black ${scoreColor}`}>
              {result.score}
            </p>
            <p className="text-[10px] text-muted-foreground font-medium">
              / 100
            </p>
          </div>
          <div>
            <p className={`text-sm font-bold ${scoreColor}`}>{scoreLabel}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {result.oportunidade}
            </p>
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="rounded-xl shadow-sm border-emerald-100">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Vantagens
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ul className="space-y-1">
              {result.vantagens.map((v, i) => (
                <li key={i} className="text-xs flex items-start gap-1.5">
                  <span className="text-emerald-500 shrink-0 font-bold">+</span>
                  {v}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card className="rounded-xl shadow-sm border-amber-100">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              Pontos de Atenção
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ul className="space-y-1">
              {result.pontosAtencao.map((p, i) => (
                <li key={i} className="text-xs flex items-start gap-1.5">
                  <span className="text-amber-500 shrink-0">!</span>
                  {p}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
      <Card className="rounded-xl shadow-sm border-red-100">
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-xs font-semibold text-red-600 uppercase tracking-wider flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5" />
            Riscos
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <ul className="space-y-1">
            {result.riscos.map((r, i) => (
              <li key={i} className="text-xs flex items-start gap-1.5">
                <span className="text-red-400 shrink-0">▸</span>
                {r}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
        <Target className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
        <p className="text-xs text-emerald-700 leading-relaxed">
          <strong>Recomendação:</strong> {result.recomendacao}
        </p>
      </div>
      <AlertasPanel alertas={result.alertas ?? []} />
    </div>
  );
}

function AcompanhamentoPanel({ result }: { result: AcompanhamentoResult }) {
  const statusStyle: Record<string, string> = {
    passado: "bg-muted text-muted-foreground border-muted",
    ativo: "bg-amber-50 text-amber-700 border-amber-300",
    futuro: "bg-background text-foreground border-border",
  };
  const dotStyle: Record<string, string> = {
    passado: "bg-muted-foreground",
    ativo: "bg-amber-400 ring-4 ring-amber-100",
    futuro: "bg-border",
  };
  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="absolute left-[15px] top-4 bottom-4 w-0.5 bg-border" />
        <div className="space-y-3">
          {result.timeline.map((item, i) => (
            <div
              key={i}
              className={`relative flex gap-4 p-3 rounded-xl border ${statusStyle[item.status]}`}
            >
              <div
                className={`w-[30px] h-[30px] rounded-full shrink-0 flex items-center justify-center z-10 ${dotStyle[item.status]}`}
              >
                <span className="text-[10px] font-bold text-white">
                  {i + 1}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{item.fase}</p>
                <p className="text-xs font-medium opacity-70 mt-0.5">
                  {item.periodo}
                </p>
                <p className="text-xs mt-1 leading-relaxed opacity-80">
                  {item.descricao}
                </p>
              </div>
              {item.status === "ativo" && (
                <span className="absolute top-2 right-2 text-[9px] font-bold bg-amber-400 text-white px-1.5 py-0.5 rounded-full">
                  AGORA
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl p-3">
        <Info className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-700">{result.observacao}</p>
      </div>
      <AlertasPanel alertas={result.alertas ?? []} />
    </div>
  );
}

function DocumentacaoPanel({
  result,
  onCheckToggle,
}: {
  result: DocumentacaoResult;
  onCheckToggle: (i: number) => void;
}) {
  const obrig = result.checklist.filter((c) => c.obrigatorio);
  const opc = result.checklist.filter((c) => !c.obrigatorio);
  const checked = result.checklist.filter((c) => c.checked).length;
  const pct = Math.round((checked / result.checklist.length) * 100);

  return (
    <div className="space-y-4">
      <Card className="rounded-xl shadow-sm bg-rose-50 border-rose-100">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="text-center shrink-0">
            <p className="text-3xl font-black text-rose-600">{pct}%</p>
            <p className="text-[10px] text-muted-foreground">concluído</p>
          </div>
          <div className="flex-1">
            <div className="w-full bg-rose-200 rounded-full h-2 mb-1">
              <div
                className="bg-rose-500 h-2 rounded-full transition"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-rose-700">
              {checked} de {result.checklist.length} documentos marcados
            </p>
          </div>
        </CardContent>
      </Card>

      {obrig.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Obrigatórios ({obrig.length})
          </p>
          {result.checklist.map((item, i) =>
            !item.obrigatorio ? null : (
              <label
                key={i}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${item.checked ? "bg-rose-50 border-rose-200" : "bg-card border-border hover:bg-muted/40"}`}
              >
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => onCheckToggle(i)}
                  className="mt-0.5 accent-rose-500 w-4 h-4 shrink-0"
                />
                <div className="min-w-0">
                  <p
                    className={`text-sm font-medium ${item.checked ? "line-through text-muted-foreground" : ""}`}
                  >
                    {item.doc}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.observacao}
                  </p>
                </div>
              </label>
            ),
          )}
        </div>
      )}

      {opc.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Opcionais / Conforme Perfil ({opc.length})
          </p>
          {result.checklist.map((item, i) =>
            item.obrigatorio ? null : (
              <label
                key={i}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${item.checked ? "bg-rose-50 border-rose-200" : "bg-card border-border hover:bg-muted/40"}`}
              >
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => onCheckToggle(i)}
                  className="mt-0.5 accent-rose-500 w-4 h-4 shrink-0"
                />
                <div className="min-w-0">
                  <p
                    className={`text-sm ${item.checked ? "line-through text-muted-foreground" : ""}`}
                  >
                    {item.doc}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.observacao}
                  </p>
                </div>
              </label>
            ),
          )}
        </div>
      )}

      <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl p-3">
        <Info className="w-3.5 h-3.5 text-rose-600 mt-0.5 shrink-0" />
        <p className="text-xs text-rose-700">{result.dica}</p>
      </div>
      <AlertasPanel alertas={result.alertas ?? []} />
    </div>
  );
}

function ElegibilidadePanel({ result }: { result: ElegibilidadeResult }) {
  const scoreColor =
    result.score >= 75
      ? "text-teal-600"
      : result.score >= 50
        ? "text-amber-600"
        : "text-red-500";
  const barColor =
    result.score >= 75
      ? "bg-teal-500"
      : result.score >= 50
        ? "bg-amber-400"
        : "bg-red-400";

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl shadow-sm bg-teal-50 border-teal-100">
        <CardContent className="p-4">
          <div className="flex items-center gap-4 mb-3">
            <div className="text-center shrink-0">
              <p className={`text-4xl font-black ${scoreColor}`}>
                {result.score}%
              </p>
              <p className="text-[10px] text-muted-foreground">aderência</p>
            </div>
            <div className="flex-1">
              <div className="w-full bg-teal-200 rounded-full h-3 mb-2">
                <div
                  className={`${barColor} h-3 rounded-full transition`}
                  style={{ width: `${result.score}%` }}
                />
              </div>
              <p className="text-xs text-teal-700 leading-relaxed">
                {result.recomendacao}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Critérios analisados
        </p>
        {result.criterios.map((c, i) => {
          const icon =
            c.atende === true ? (
              <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0" />
            ) : c.atende === "parcial" ? (
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-red-400 shrink-0" />
            );
          const bg =
            c.atende === true
              ? "bg-teal-50 border-teal-100"
              : c.atende === "parcial"
                ? "bg-amber-50 border-amber-100"
                : "bg-red-50 border-red-100";
          return (
            <div
              key={i}
              className={`flex items-start gap-3 p-3 rounded-xl border ${bg}`}
            >
              <div className="mt-0.5">{icon}</div>
              <div>
                <p className="text-sm font-medium">{c.criterio}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {c.observacao}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <ChevronRight className="w-3.5 h-3.5" />
            Próximos Passos
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <ol className="space-y-1.5">
            {result.proximosPassos.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="w-4 h-4 rounded-full bg-teal-100 text-teal-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {p}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
      <AlertasPanel alertas={result.alertas ?? []} />
    </div>
  );
}

function AgentResultPanel({
  result,
  onCheckToggle,
  printRef,
}: {
  result: AgentResult;
  onCheckToggle: (i: number) => void;
  printRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={printRef}
      className="bg-background animate-in fade-in slide-in-from-bottom-4 duration-400"
    >
      {result.type === "simples" && <SimplesPanel result={result} />}
      {result.type === "analista" && <AnalistaPanel result={result} />}
      {result.type === "estrategica" && <EstrategicaPanel result={result} />}
      {result.type === "acompanhamento" && (
        <AcompanhamentoPanel result={result} />
      )}
      {result.type === "documentacao" && (
        <DocumentacaoPanel result={result} onCheckToggle={onCheckToggle} />
      )}
      {result.type === "elegibilidade" && (
        <ElegibilidadePanel result={result} />
      )}
    </div>
  );
}

// ── History Panel ────────────────────────────────────────────────
type DateFilter = "todos" | "hoje" | "semana" | "mes";

type UnifiedItem =
  | { kind: "agent"; data: AgentResultRecord }
  | { kind: "local"; data: LocalAgentRecord }
  | { kind: "legacy"; data: SavedEdital }
  | { kind: "supabase"; data: AnaliseSalva };

const AGENT_BADGE: Record<string, { label: string; color: string }> = {
  simples: { label: "Simples", color: "bg-blue-100 text-blue-700" },
  analista: { label: "Analista", color: "bg-violet-100 text-violet-700" },
  estrategica: {
    label: "Estratégica",
    color: "bg-emerald-100 text-emerald-700",
  },
  acompanhamento: {
    label: "Acompanhamento",
    color: "bg-amber-100 text-amber-700",
  },
  documentacao: { label: "Documentação", color: "bg-rose-100 text-rose-700" },
  elegibilidade: { label: "Elegibilidade", color: "bg-teal-100 text-teal-700" },
};

function HistoryPanel({
  onSelect,
  onSelectAgent,
  onSelectSupabase,
  onClose,
  isLoggedIn,
}: {
  onSelect: (item: SavedEdital) => void;
  onSelectAgent: (item: AgentResultRecord | LocalAgentRecord) => void;
  onSelectSupabase: (item: AnaliseSalva) => void;
  onClose: () => void;
  isLoggedIn: boolean;
}) {
  // Logado: histórico da conta (servidor). Sem login: histórico deste navegador.
  const {
    data: agentHistory,
    isLoading: agentLoadingRaw,
    isError: agentError,
    refetch: refetchAgent,
  } = useListAgentHistory({
    query: { enabled: isLoggedIn } as never,
    request: { signal: AbortSignal.timeout(30_000) },
  });
  const agentLoading = isLoggedIn && agentLoadingRaw;
  const [localItems, setLocalItems] = useState<LocalAgentRecord[]>(() => (isLoggedIn ? [] : listLocalHistory()));
  const { data: legacyHistory, isLoading: legacyLoadingRaw } = useListEditalHistory({ query: { enabled: isLoggedIn } as never });
  const legacyLoading = isLoggedIn && legacyLoadingRaw;
  const deleteAgentResult = useDeleteAgentResult();
  const deleteEdital = useDeleteEdital();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("todos");
  const [supabaseItems, setSupabaseItems] = useState<AnaliseSalva[]>([]);
  const [supabaseLoading, setSupabaseLoading] = useState(true);

  const isLoading = agentLoading || legacyLoading || supabaseLoading;

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  useEffect(() => {
    let ignore = false;
    const loadSupabase = async () => {
      try {
        const data = await listarAnalises();
        if (!ignore) setSupabaseItems(data as AnaliseSalva[]);
      } catch {
        if (!ignore) setSupabaseItems([]);
      } finally {
        if (!ignore) setSupabaseLoading(false);
      }
    };
    void loadSupabase();
    return () => {
      ignore = true;
    };
  }, []);

  const unified = useMemo<UnifiedItem[]>(() => {
    const now = new Date();
    const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sow = new Date(sod);
    sow.setDate(sod.getDate() - sod.getDay());
    const som = new Date(now.getFullYear(), now.getMonth(), 1);
    const q = search.toLowerCase().trim();

    const matchDate = (d?: string) => {
      const dt = new Date(d ?? new Date().toISOString());
      if (dateFilter === "hoje") return dt >= sod;
      if (dateFilter === "semana") return dt >= sow;
      if (dateFilter === "mes") return dt >= som;
      return true;
    };

    const normalizeSearch = (
      item: SavedEdital | AgentResultRecord | AnaliseSalva,
    ) => {
      const title = "title" in item ? (item.title ?? "") : (item.titulo ?? "");
      const original =
        "originalText" in item
          ? (item.originalText ?? "")
          : (item.conteudo_original ?? "");
      const summary =
        "resumo" in item
          ? (item.resumo ?? "")
          : "conteudo_simplificado" in item
            ? (item.conteudo_simplificado ?? "")
            : "";
      return [title, original, summary].join(" ").toLowerCase();
    };

    const parseDate = (
      item: SavedEdital | AgentResultRecord | AnaliseSalva,
    ) => {
      const dateValue =
        "createdAt" in item
          ? (item.createdAt ?? new Date().toISOString())
          : "created_at" in item
            ? (item.created_at ?? new Date().toISOString())
            : new Date().toISOString();
      return new Date(dateValue).getTime();
    };

    const matches = (item: SavedEdital | AgentResultRecord | AnaliseSalva) => {
      return q.length === 0 || normalizeSearch(item).includes(q);
    };

    const agentItems: UnifiedItem[] = [
      ...(agentHistory ?? [])
        .filter((item: AgentResultRecord) => matchDate(item.createdAt) && matches(item))
        .map((data: AgentResultRecord) => ({ kind: "agent" as const, data })),
      ...localItems
        .filter((item) => matchDate(item.createdAt) && matches(item as never))
        .map((data) => ({ kind: "local" as const, data })),
    ];

    const legacyItems: UnifiedItem[] = (legacyHistory ?? [])
      .filter((item: SavedEdital) => matchDate(item.createdAt) && matches(item))
      .map((data: SavedEdital) => ({ kind: "legacy", data }));

    const supabaseItemsUnified: UnifiedItem[] = supabaseItems
      .filter((item) => matchDate(item.created_at) && matches(item))
      .map((data) => ({ kind: "supabase", data }));

    return [...agentItems, ...legacyItems, ...supabaseItemsUnified].sort(
      (a, b) => parseDate(b.data) - parseDate(a.data),
    );
  }, [agentHistory, legacyHistory, supabaseItems, localItems, search, dateFilter]);

  const handleDeleteLocal = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Excluir esta análise do histórico deste navegador? Isso não pode ser desfeito.")) return;
    if (deleteLocalHistory(id)) {
      setLocalItems(listLocalHistory());
      toast({ title: "Removido", description: "Análise removida do histórico deste navegador." });
    } else toast({ title: "Não foi possível remover", description: "O navegador bloqueou a alteração.", variant: "destructive" });
  };

  const handleDeleteAgent = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Excluir esta análise do histórico da sua conta? Isso não pode ser desfeito.")) return;
    deleteAgentResult.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListAgentHistoryQueryKey(),
          });
          toast({
            title: "Removido",
            description: "Interpretação removida do histórico.",
          });
        },
        onError: () =>
          toast({
            title: "Erro",
            description: "Não foi possível remover.",
            variant: "destructive",
          }),
      },
    );
  };

  const handleDeleteSupabase = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Excluir este registro antigo? Isso não pode ser desfeito.")) return;
    try {
      await excluirAnalise(id);
      setSupabaseItems((prev) => prev.filter((item) => item.id !== id));
      toast({
        title: "Removido",
        description: "Interpretação removida do histórico.",
      });
    } catch {
      toast({
        title: "Erro",
        description: "Não foi possível remover a interpretação.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteLegacy = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Excluir este registro antigo? Isso não pode ser desfeito.")) return;
    deleteEdital.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListEditalHistoryQueryKey(),
          });
          toast({
            title: "Removido",
            description: "Edital removido do histórico.",
          });
        },
        onError: () =>
          toast({
            title: "Erro",
            description: "Não foi possível remover.",
            variant: "destructive",
          }),
      },
    );
  };

  const handleClearSupabaseHistory = async () => {
    if (!window.confirm("Excluir TODOS os registros antigos (só texto) do histórico? As análises completas não são afetadas. Isso não pode ser desfeito.")) return;
    try {
      await limparAnalises();
      setSupabaseItems([]);
      toast({
        title: "Histórico limpo",
        description: "As interpretações salvas foram removidas.",
      });
    } catch {
      toast({
        title: "Erro",
        description: "Não foi possível limpar o histórico.",
        variant: "destructive",
      });
    }
  };

  const handleExportCSV = () => {
    if (unified.length === 0) {
      toast({
        title: "Nada para exportar",
        description: "O histórico está vazio.",
        variant: "destructive",
      });
      return;
    }
    const headers = ["Data", "Agente", "Título", "Texto (início)"];
    const rows = unified.map((item) => {
      const date = new Date(
        item.kind === "supabase"
          ? (item.data.created_at ?? new Date().toISOString())
          : (item.data.createdAt ?? new Date().toISOString()),
      ).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const agente =
        item.kind === "agent"
          ? (AGENT_BADGE[item.data.agentId]?.label ?? item.data.agentId)
          : item.kind === "supabase"
            ? "Supabase"
            : "Simples (legado)";
      const titulo =
        item.kind === "supabase"
          ? (item.data.titulo ?? "Interpretação salva")
          : item.data.title;
      const texto =
        item.kind === "supabase"
          ? (item.data.conteudo_original ?? "")
              .slice(0, 120)
              .replace(/\n/g, " ")
          : item.data.originalText.slice(0, 120).replace(/\n/g, " ");
      return [date, agente, titulo, texto];
    });
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historico-lupa-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: "CSV exportado!",
      description: `${unified.length} interpretação(ões) baixadas.`,
    });
  };

  const totalCount =
    (agentHistory?.length ?? 0) +
    (legacyHistory?.length ?? 0) +
    supabaseItems.length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 h-full w-full max-w-md bg-background shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <History className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Histórico de Interpretações</h2>
              <p className="text-xs text-muted-foreground">
                {isLoading
                  ? "Carregando…"
                  : `${totalCount} interpretação(ões) salva(s)`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs rounded-lg"
              onClick={handleExportCSV}
              disabled={isLoading || totalCount === 0}
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs rounded-lg"
              onClick={handleClearSupabaseHistory}
              disabled={isLoading || supabaseItems.length === 0}
              title="Exclui só os registros antigos (só texto)"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpar antigos
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar histórico">
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div className="px-4 pt-4 pb-3 space-y-3 border-b border-border/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar por título…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-xl"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {(["todos", "hoje", "semana", "mes"] as DateFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setDateFilter(f)}
                className={`text-xs px-3 py-1 rounded-full border transition ${dateFilter === f ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
              >
                {
                  {
                    todos: "Todos",
                    hoje: "Hoje",
                    semana: "Semana",
                    mes: "Mês",
                  }[f]
                }
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading &&
            [1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          {!isLoading && unified.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
                <History className="w-7 h-7 text-muted-foreground" />
              </div>
              <p className="text-base font-medium mb-1">
                Nenhuma interpretação salva
              </p>
              <p className="text-sm text-muted-foreground max-w-[240px]">
                Após interpretar um edital, clique em{" "}
                <strong>"Salvar interpretação"</strong> para guardá-la aqui.
              </p>
            </div>
          )}
          {isLoggedIn && agentError && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              Não foi possível carregar o histórico da sua conta.{" "}
              <button type="button" className="font-semibold underline" onClick={() => void refetchAgent()}>
                Tentar novamente
              </button>
            </div>
          )}
          {!isLoggedIn && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              Sem login, o histórico fica só neste navegador (até 30 análises). Entre na conta para guardá-lo no servidor.
            </p>
          )}
          {unified.map((item) => {
            if (item.kind === "local") {
              const badge = AGENT_BADGE[item.data.agentId] ?? { label: item.data.agentId, color: "bg-muted text-muted-foreground" };
              return (
                <div key={`local-${item.data.id}`} className="flex w-full items-start gap-2 rounded-xl border bg-card p-4">
                  <button type="button" onClick={() => onSelectAgent(item.data)} className="min-w-0 flex-1 text-left" data-testid={`historico-local-${item.data.id}`}>
                    <span className="mb-1 flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.color}`}>{badge.label}</span>
                      <span className="text-[10px] text-muted-foreground">neste navegador</span>
                    </span>
                    <span className="block truncate text-sm font-medium">{item.data.title}</span>
                    <span className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" aria-hidden /> {formatDate(item.data.createdAt)}
                    </span>
                  </button>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:bg-destructive/10" aria-label="Excluir do histórico" onClick={(e) => handleDeleteLocal(item.data.id, e)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              );
            }
            if (item.kind === "agent") {
              const badge = AGENT_BADGE[item.data.agentId] ?? { label: item.data.agentId, color: "bg-muted text-muted-foreground" };
              const fav = Boolean((item.data as { favorito?: boolean }).favorito);
              const partial = Boolean((item.data.resultJson as { processing?: { mode?: string; complete?: boolean } } | undefined)?.processing && ((item.data.resultJson as any).processing.mode === "fallback" || (item.data.resultJson as any).processing.complete === false));
              return (
                <div key={`agent-${item.data.id}`} className="flex w-full items-start gap-2 rounded-xl border bg-card p-4">
                  <button type="button" onClick={() => onSelectAgent(item.data)} className="min-w-0 flex-1 text-left" data-testid={`historico-item-${item.data.id}`}>
                    <span className="mb-1 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.color}`}>{badge.label}</span>
                      {fav && <span className="text-[10px] font-semibold text-amber-800">★ favorito</span>}
                      {partial && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">parcial</span>}
                    </span>
                    <span className="block truncate text-sm font-medium">{item.data.title}</span>
                    <span className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" aria-hidden /> {formatDate(item.data.createdAt)}
                    </span>
                  </button>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:bg-destructive/10" aria-label="Excluir do histórico" onClick={(e) => handleDeleteAgent(item.data.id, e)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              );
            }
            if (item.kind === "supabase") {
              return (
                <div
                  key={`supabase-${item.data.id}`}
                  className="w-full p-4 rounded-xl border bg-card hover:bg-accent/5 transition group"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                          Registro antigo · só o texto
                        </span>
                      </div>
                      <p className="text-sm font-medium truncate pr-2">
                        {item.data.titulo ?? "Interpretação salva"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {(item.data.conteudo_simplificado ?? item.data.conteudo_original ?? "Interpretação salva no histórico.")}
                      </p>
                      <p className="text-xs text-muted-foreground/60 mt-1.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(
                          item.data.created_at ?? new Date().toISOString(),
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectSupabase(item.data);
                        }}
                      >
                        Restaurar texto
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10"
                        aria-label="Excluir do histórico"
                        onClick={(e) =>
                          handleDeleteSupabase(item.data.id ?? "", e)
                        }
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <div key={`legacy-${item.data.id}`} className="flex w-full items-start gap-2 rounded-xl border bg-card p-4">
                <button type="button" onClick={() => onSelect(item.data)} className="min-w-0 flex-1 text-left">
                  <span className="mb-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">Registro antigo · Simples</span>
                  <span className="block truncate text-sm font-medium">{item.data.title}</span>
                  <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">{item.data.resumo}</span>
                  <span className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" aria-hidden /> {formatDate(item.data.createdAt)}
                  </span>
                </button>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:bg-destructive/10" aria-label="Excluir registro antigo" onClick={(e) => handleDeleteLegacy(item.data.id, e)}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────
export default function TestarIA() {
  const [text, setText] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [activeTab, setActiveTab] = useState("texto");
  const [selectedAgent, setSelectedAgent] = useState<AgentId>("simples");
  const [manualAgentSelection, setManualAgentSelection] = useState(false);
  const [agentResult, setAgentResult] = useState<AgentResult | null>(null);
  const [canonicalAnalysis, setCanonicalAnalysis] = useState<CanonicalAnalysisLike | null>(null);
  const [checklistState, setChecklistState] = useState<ChecklistItem[]>([]);
  // Sem valores presumidos: vazio = "não informado" (a IA trata como pendente)
  const [profile, setProfile] = useState<UserProfile>({
    escolaridade: "",
    atuacao: "",
    municipio: "",
    rendaFamiliar: "",
  });
  const [showHistory, setShowHistory] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [savedThisResult, setSavedThisResult] = useState(false);
  const [currentSavedId, setCurrentSavedId] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [showShareLink, setShowShareLink] = useState(false);
  const [shareOptionsOpen, setShareOptionsOpen] = useState(false);
  const [question, setQuestion] = useState("");
  // Respostas do chat por documento: "ia" = respondida pelo modelo; "automatica" =
  // montada por regras a partir da análise (sem IA), sempre identificada na tela.
  const [answerHistory, setAnswerHistory] = useState<
    { question: string; answer: string; source?: "ia" | "automatica" }[]
  >([]);
  /** Texto exato que gerou o resultado na tela: liga resultado ↔ documento */
  const [analyzedText, setAnalyzedText] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const analyzeSeq = useRef(0);
  const [isAnswering, setIsAnswering] = useState(false);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [isAnalyzePressed, setIsAnalyzePressed] = useState(false);
  const [analysisStage, setAnalysisStage] = useState<AnalysisStage>("idle");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [pdfStructuredData, setPdfStructuredData] =
    useState<PdfStructuredData | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [supabaseStatus, setSupabaseStatus] = useState<{
    state: "checking" | "connected" | "disconnected" | "not-configured";
    message: string;
  }>({
    state: "checking",
    message: "Verificando Supabase…",
  });

  const printRef = useRef<HTMLDivElement | null>(null);
  const [location] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  // ── Documentos longos: leitura completa em segundo plano (estado no servidor) ──
  const [longJob, setLongJob] = useState<LongJobView | null>(null);
  const [longRunning, setLongRunning] = useState(false);
  // Documento grande sem login: convite ao cadastro (não é erro) e documento guardado neste navegador
  const [needsAccount, setNeedsAccount] = useState<number | null>(null);
  const pendingAutoStart = useRef(false);
  const longJobActive = Boolean(longJob && ["pendente", "processando", "aguardando_cota"].includes(longJob.status));
  const longLoop = useRef(0);
  const [docLimits, setDocLimits] = useState<{ syncMax: number; syncHard: number; maxChars: number; background: boolean }>({ syncMax: 45_000, syncHard: 450_000, maxChars: 1_200_000, background: false });
  useEffect(() => {
    apiFetch<{ analise_direta_max_caracteres: number; analise_direta_limite_rigido?: number; documento_max_caracteres: number; processa_sem_pagina_aberta?: boolean }>("/edital/limits", { auth: false })
      .then((l) => setDocLimits({ syncMax: l.analise_direta_max_caracteres, syncHard: l.analise_direta_limite_rigido ?? 450_000, maxChars: l.documento_max_caracteres, background: Boolean(l.processa_sem_pagina_aberta) }))
      .catch(() => undefined);
    return () => {
      longLoop.current++; // sai da página: o laço para; o andamento continua salvo no servidor
    };
  }, []);
  const [showQuickView, setShowQuickView] = useState(false);
  const [showTimelinePopup, setShowTimelinePopup] = useState(false);
  const extractUrlMutation = useExtractEditalFromUrl();
  const analyzeEditalMutation = useAnalyzeEdital();
  const saveAgentResultMutation = useSaveAgentResult();
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;

    const verifySupabase = async () => {
      if (!isSupabaseConfigured) {
        if (!cancelled) {
          setSupabaseStatus({
            state: "not-configured",
            message: "Supabase não configurado; usando armazenamento local.",
          });
        }
        return;
      }

      const result = await checkSupabaseConnection();
      if (!cancelled) {
        setSupabaseStatus({
          state: result.connected ? "connected" : "disconnected",
          message: result.message,
        });
      }
    };

    void verifySupabase();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (location === "/historico") {
      setShowHistory(true);
    }
  }, [location]);

  // Tempo decorrido REAL da requisição (sem etapas ou porcentagens fictícias)
  useEffect(() => {
    const busy = analyzeEditalMutation.isPending || isPdfLoading || extractUrlMutation.isPending;
    if (!busy) {
      setElapsedSeconds(0);
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => setElapsedSeconds(Math.round((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [analyzeEditalMutation.isPending, isPdfLoading, extractUrlMutation.isPending]);

  useEffect(() => {
    if (!text.trim() || agentResult || manualAgentSelection) return;
    setSelectedAgent(resolveAutoAgent(text, profile));
  }, [text, profile, agentResult, manualAgentSelection]);
  const autoSuggestion = useMemo(() => (text.trim() ? suggestAgent(text, profile) : null), [text, profile]);

  /** Limpa TUDO o que pertence ao documento atual (resultado, análise, chat, compartilhamento). Não toca no histórico salvo. */
  const resetAnalysis = () => {
    analyzeSeq.current++;
    setAgentResult(null);
    setCanonicalAnalysis(null);
    setAnalyzedText(null);
    setAnswerHistory([]);
    setAnalysisError(null);
    setShareToken(null);
    setShowShareLink(false);
    setShareOptionsOpen(false);
    setIsAnalyzePressed(false);
    setSavedThisResult(false);
    setCurrentSavedId(null);
    setIsFavorite(false);
    setChecklistState([]);
    setAnalysisStage("idle");
    setNeedsAccount(null);
    // Tarefa longa ainda ativa continua visível (com Cancelar); terminada sai junto com o resultado
    setLongJob((j) => (j && ["pendente", "processando", "aguardando_cota"].includes(j.status) ? j : null));
  };

  const realStage: RealStage =
    isPdfLoading || extractUrlMutation.isPending
      ? "extraindo"
      : analyzeEditalMutation.isPending || (longJobActive && longRunning)
        ? "analisando"
        : analysisStage === "error"
          ? "falha"
          : canonicalAnalysis
            ? isPartialResult(canonicalAnalysis as never)
              ? "parcial"
              : "concluido"
            : "aguardando";

  const currentAgentMeta = AGENTS.find((a) => a.id === selectedAgent)!;
  const assistantIdentity = {
    name: "Assistente LUPA Digital",
    description: "Especialista em análise inteligente de documentos.",
    color: currentAgentMeta.color,
    textColor: currentAgentMeta.textColor,
    iconName: currentAgentMeta.iconName,
  };
  const isAnalyzing = analyzeEditalMutation.isPending || (longJobActive && longRunning);
  const analyzeButtonLabel = "Analisar Documento";
  
  /**
   * Cronograma: SEMPRE usa dados da IA (canonicalAnalysis.cronograma).
   * Se não houver análise, retorna array vazio — NUNCA usa fallback de regex.
   * 
   * Racionale: O cronograma é uma estrutura crítica que deve vir da IA especializada.
   * Regex simples não consegue diferenciar datas de lei de datas de prazo.
   */
  const timelineSteps = useMemo(() => {
    return buildTimelineSteps(canonicalAnalysis as never, agentResult);
  }, [canonicalAnalysis, agentResult]);
  
  /**
   * Checklist: usa o resultado canônico sempre que possível, mas faz fallback
   * para o resultado do agente quando a estrutura canônica está incompleta.
   */
  const checklistItems = useMemo(() => {
    return buildChecklistItems(canonicalAnalysis as never, agentResult);
  }, [canonicalAnalysis, agentResult]);
  
  const faqItems = useMemo(() => buildCanonicalFAQ(canonicalAnalysis), [canonicalAnalysis]);
  const chatSuggestions = useMemo(
    () => buildChatSuggestionsForPage(canonicalAnalysis, timelineSteps, checklistItems),
    [canonicalAnalysis, timelineSteps, checklistItems],
  );

  const applyResult = (result: AgentResult) => {
    setAgentResult(result);
    if (result.type === "documentacao") setChecklistState(result.checklist);
  };

  const buildAnalysisPayload = (
    result: AgentResult | null,
    canonicalData: CanonicalAnalysisLike | null,
    favorito = false,
    agentIdOverride: AgentId = selectedAgent,
  ): AnaliseSalva => {
    const activeAgentMeta = AGENTS.find((a) => a.id === agentIdOverride) ?? currentAgentMeta;
    const simplifiedText = result
      ? (() => {
          if (result.type === "simples") {
            return [result.resumo, result.objetivo, result.prazo]
              .filter(Boolean)
              .join(" ");
          }
          if (result.type === "documentacao") {
            return [
              result.dica,
              result.checklist?.map((item) => item.doc).join(", "),
            ]
              .filter(Boolean)
              .join(" ");
          }
          if (result.type === "elegibilidade") {
            return [result.recomendacao, result.proximosPassos?.join(" • ")]
              .filter(Boolean)
              .join(" ");
          }
          return [canonicalData?.interpretation?.summary, canonicalData?.interpretation?.simpleLanguage]
            .filter(Boolean)
            .join(" ");
        })()
      : "Interpretação concluída.";

    const indicators = result
      ? {
          tipo: result.type,
          analysisId: canonicalData?.analysisId ?? null,
          schemaVersion: canonicalData?.schemaVersion ?? null,
          generatedAt: canonicalData?.source?.generatedAt ?? null,
          ...(result.type === "simples"
            ? {
                scoreOportunidade: result.scoreOportunidade,
                categoria: result.categoria,
                prazo: result.prazo,
              }
            : {}),
          ...(result.type === "analista"
            ? {
                tipoEdital: result.tipoEdital,
                instituicao: result.instituicao,
                prazo: result.prazo,
                publicoAlvo: result.publicoAlvo,
                valor: result.valor,
              }
            : {}),
          ...(result.type === "estrategica"
            ? {
                score: result.score,
                oportunidade: result.oportunidade,
                recomendacao: result.recomendacao,
              }
            : {}),
          ...(result.type === "acompanhamento"
            ? {
                timeline: result.timeline.length,
                observacao: result.observacao,
              }
            : {}),
          ...(result.type === "documentacao"
            ? { checklist: result.checklist.length, dica: result.dica }
            : {}),
          ...(result.type === "elegibilidade"
            ? { score: result.score, recomendacao: result.recomendacao }
            : {}),
        }
      : { tipo: agentIdOverride };

    const timeline = result
      ? {
          etapa: "Interpretação concluída",
          ...(result.type === "simples"
            ? { prazo: result.prazo, objetivo: result.objetivo }
            : {}),
          ...(result.type === "elegibilidade"
            ? { proximosPassos: result.proximosPassos }
            : {}),
        }
      : { etapa: "Processamento do edital" };

    const recomendacoes = result
      ? {
          ...(result.type === "simples"
            ? {
                ondeInscrever: result.ondeInscrever,
                publicoAlvo: result.publicoAlvo,
              }
            : {}),
          ...(result.type === "documentacao" ? { dica: result.dica } : {}),
          ...(result.type === "elegibilidade"
            ? {
                recomendacao: result.recomendacao,
                proximosPassos: result.proximosPassos,
              }
            : {}),
        }
      : { recomendacao: "Revise o conteúdo e confirme os detalhes do edital." };

    return {
      id: currentSavedId ?? undefined,
      titulo:
      text.trim().slice(0, 80).replace(/\n/g, " ") ||
      `Interpretação ${activeAgentMeta.name}`,
      conteudo_original: text,
      conteudo_simplificado: simplifiedText,
      categoria:
        (result as { categoria?: string } | null)?.categoria ??
        activeAgentMeta.name,
      modo_analise: activeAgentMeta.name,
      indicadores: indicators,
      timeline,
      recomendacoes,
      favorito: favorito,
    };
  };

  /**
   * Salva a análise exibida. Logado: SÓ no histórico da conta (agent_results, resultado
   * completo); se o servidor falhar, informa a falha — não há cópia silenciosa no
   * navegador. Sem login: grava neste navegador e diz isso.
   */
  const persistCurrentAnalysis = async (
    result: AgentResult | null,
    canonicalData: CanonicalAnalysisLike | null,
    agentIdOverride: AgentId = selectedAgent,
    sourceText: string = text,
  ): Promise<{ ok: boolean; where: "conta" | "navegador"; id: string | null; error?: string }> => {
    const title = sourceText.trim().slice(0, 80).replace(/\n/g, " ") || `Interpretação ${AGENTS.find((a) => a.id === agentIdOverride)?.name ?? currentAgentMeta.name}`;
    const resultJson = (canonicalData ? { ...canonicalData, type: agentIdOverride } : result ? { ...result } : { type: agentIdOverride }) as Record<string, unknown>;
    if (user) {
      try {
        const savedAgent = await saveAgentResultMutation.mutateAsync({ data: { agentId: agentIdOverride, title, originalText: sourceText, resultJson } });
        const id = savedAgent?.id != null ? String(savedAgent.id) : null;
        if (savedAgent?.id && canonicalData) setCanonicalAnalysis((prev) => (prev ? { ...prev, historyId: savedAgent.id } : prev));
        setSavedThisResult(Boolean(id));
        setCurrentSavedId(id);
        setIsFavorite(false);
        queryClient.invalidateQueries({ queryKey: getListAgentHistoryQueryKey() });
        return { ok: Boolean(id), where: "conta", id };
      } catch (err) {
        setSavedThisResult(false);
        return { ok: false, where: "conta", id: null, error: err instanceof Error ? err.message : "Falha ao salvar." };
      }
    }
    const saved = saveLocalHistory({ agentId: agentIdOverride, title, originalText: sourceText, resultJson });
    setSavedThisResult(Boolean(saved));
    setCurrentSavedId(saved?.id ?? null);
    setIsFavorite(false);
    return saved ? { ok: true, where: "navegador", id: saved.id } : { ok: false, where: "navegador", id: null, error: "O navegador não permitiu guardar (armazenamento cheio ou bloqueado)." };
  };

  // ── Documento longo ────────────────────────────────────────────────────────
  const LONG_KEY = "lupa-analise-longa-v1";
  const PENDING_KEY = "lupa-documento-pendente-v1";

  // Voltou do cadastro/login: restaura o documento guardado e, já com conta, começa a leitura completa
  useEffect(() => {
    let pending: { text: string; agentId: AgentId; at: number } | null = null;
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      pending = raw ? JSON.parse(raw) : null;
      if (pending && Date.now() - pending.at > 24 * 3600_000) {
        localStorage.removeItem(PENDING_KEY);
        pending = null;
      }
    } catch {
      pending = null;
    }
    if (!pending) return;
    if (!text) {
      setText(pending.text);
      setSelectedAgent(pending.agentId);
      setManualAgentSelection(true);
    }
    if (user) {
      try {
        localStorage.removeItem(PENDING_KEY);
      } catch {
        /* nada */
      }
      setNeedsAccount(null);
      pendingAutoStart.current = true;
    } else setNeedsAccount(pending.text.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  const rememberJob = (id: string | null) => {
    try {
      if (id) localStorage.setItem(LONG_KEY, id);
      else localStorage.removeItem(LONG_KEY);
    } catch {
      /* navegador sem armazenamento: a retomada usa a lista do servidor */
    }
  };

  /** Avança a tarefa enquanto a página estiver aberta; para ao concluir, falhar, cancelar ou sair. */
  const runLongJob = async (id: string, textAtStart: string) => {
    const loop = ++longLoop.current;
    setLongRunning(true);
    try {
      for (;;) {
        if (loop !== longLoop.current) return;
        let v: LongJobView;
        try {
          v = await apiFetch<LongJobView>(`/edital/jobs/${id}/advance`, { method: "POST" });
        } catch (err) {
          // Falha de rede/servidor: o andamento está salvo; espera e tenta de novo
          if (loop !== longLoop.current) return;
          const status = (err as unknown as { status?: number } | null)?.status;
          if (status === 404 || status === 401) {
            setAnalysisError(getFriendlyErrorMessage(err));
            setAnalysisStage("error");
            rememberJob(null);
            return;
          }
          await new Promise((r) => setTimeout(r, 15_000));
          continue;
        }
        if (loop !== longLoop.current) return;
        setLongJob(v);
        if (v.status === "concluida" || v.status === "parcial") {
          if (v.resultado) await acceptAnalysis(v.resultado, v.agentId as AgentId, textAtStart);
          if (v.status === "concluida") rememberJob(null);
          return;
        }
        if (v.status === "falhou" || v.status === "cancelada") {
          setAnalysisStage(v.status === "falhou" ? "error" : "idle");
          if (v.status === "falhou") setAnalysisError(v.erro ?? "A análise longa não pôde continuar.");
          rememberJob(null);
          return;
        }
        // Espera indicada pelo servidor (cota do provedor ou limite por minuto); senão, segue já
        const waitMs = v.proxima_tentativa ? Math.max(0, new Date(v.proxima_tentativa).getTime() - Date.now()) : 0;
        if (waitMs > 0) await new Promise((r) => setTimeout(r, Math.min(Math.max(waitMs, 5_000), 10 * 60_000)));
      }
    } finally {
      if (loop === longLoop.current) setLongRunning(false);
    }
  };

  const startLongJob = async (agentIdToUse: AgentId, textAtStart: string) => {
    if (!user) {
      setIsAnalyzePressed(false);
      setAnalysisStage("idle");
      setNeedsAccount(textAtStart.length);
      // Guarda o documento NESTE navegador para não se perder no cadastro/login (24 h; apagado ao usar)
      try {
        localStorage.setItem(PENDING_KEY, JSON.stringify({ text: textAtStart, agentId: agentIdToUse, at: Date.now() }));
      } catch {
        /* armazenamento cheio ou bloqueado: a pessoa cola de novo depois de entrar */
      }
      return;
    }
    try {
      const v = await apiFetch<LongJobView>("/edital/jobs", {
        method: "POST",
        body: JSON.stringify({ agentId: agentIdToUse, text: textAtStart, ...(agentIdToUse === "elegibilidade" ? { profile } : {}) }),
      });
      setLongJob(v);
      rememberJob(v.id);
      void runLongJob(v.id, textAtStart);
    } catch (err) {
      setIsAnalyzePressed(false);
      setAnalysisStage("error");
      setAnalysisError(getFriendlyErrorMessage(err));
    }
  };

  const cancelLongJob = async () => {
    if (!longJob) return;
    longLoop.current++;
    try {
      const v = await apiFetch<LongJobView>(`/edital/jobs/${longJob.id}/cancel`, { method: "POST" });
      setLongJob(v);
      setLongRunning(false);
      setIsAnalyzePressed(false);
      setAnalysisStage("idle");
      rememberJob(null);
      toast({ title: "Análise cancelada", description: "O documento enviado foi apagado do servidor." });
    } catch (err) {
      toast({ title: "Não foi possível cancelar", description: getFriendlyErrorMessage(err), variant: "destructive" });
    }
  };

  const retryLongJob = async () => {
    if (!longJob) return;
    try {
      const v = await apiFetch<LongJobView>(`/edital/jobs/${longJob.id}/retry-failed`, { method: "POST" });
      setLongJob(v);
      setCanonicalAnalysis(null);
      setAgentResult(null);
      rememberJob(v.id);
      void runLongJob(v.id, analyzedText ?? text);
    } catch (err) {
      toast({ title: "Não foi possível reprocessar", description: getFriendlyErrorMessage(err), variant: "destructive" });
    }
  };

  // Retomar depois de atualizar a página: tarefa lembrada neste navegador ou ativa na conta
  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      let id: string | null = null;
      try {
        id = localStorage.getItem(LONG_KEY);
      } catch {
        id = null;
      }
      if (!id) {
        const list = await apiFetch<{ jobs: Array<{ id: string; status: string }> }>("/edital/jobs").catch(() => ({ jobs: [] as Array<{ id: string; status: string }> }));
        id = list.jobs.find((j) => ["pendente", "processando", "aguardando_cota"].includes(j.status))?.id ?? null;
      }
      if (!id || !alive) return;
      const v = await apiFetch<LongJobView>(`/edital/jobs/${id}`).catch(() => null);
      if (!v || !alive) {
        rememberJob(null);
        return;
      }
      setLongJob(v);
      setSelectedAgent(v.agentId as AgentId);
      if (["pendente", "processando", "aguardando_cota"].includes(v.status)) {
        setIsAnalyzePressed(true);
        void runLongJob(v.id, text);
      } else if ((v.status === "parcial" || v.status === "concluida") && v.resultado) {
        await acceptAnalysis(v.resultado, v.agentId as AgentId, text);
        if (v.status === "concluida") rememberJob(null);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /** Mostra e salva uma análise concluída — mesma rotina para a análise direta e a longa. */
  const acceptAnalysis = async (data: unknown, agentIdToUse: AgentId, textAtStart: string) => {
    const canonicalPayload = data as unknown as CanonicalAnalysisLike;
    const result = canonicalToAgentResult(canonicalPayload) ?? (data as unknown as AgentResult);
    setCanonicalAnalysis(canonicalPayload);
    setAnalyzedText(textAtStart);
    applyResult(result);
    setAnalysisStage("completed");
    const partial = isPartialResult(canonicalPayload as never);
    if (partial) {
      // Resultado de contingência/incompleto não é salvo automaticamente
      // Motivo real (vindo do servidor) + quanto do edital foi lido
      const proc = canonicalPayload.processing as { userMessage?: string; totalChunks?: number; processedChunks?: number } | undefined;
      const partialReason = proc?.userMessage ?? "A IA não concluiu o processamento.";
      const lidas = proc?.totalChunks && proc.totalChunks > 1 && !/partes não foram analisadas/.test(partialReason) ? ` Foram lidas ${proc.processedChunks ?? 0} de ${proc.totalChunks} partes do edital.` : "";
      const convite = !user && textAtStart.length > docLimits.syncMax ? " Entre na sua conta para que o documento inteiro seja lido em segundo plano." : "";
      toast({
        title: "Análise parcialmente concluída",
        description: `${partialReason}${lidas}${convite} O resultado é limitado e não foi salvo automaticamente; você pode tentar de novo ou salvar manualmente.`,
        variant: "destructive",
      });
      return;
    }
    const saved = await persistCurrentAnalysis(result, canonicalPayload, agentIdToUse, textAtStart);
    toast(
      saved.ok
        ? {
            title: "Interpretação concluída",
            description: saved.where === "conta" ? "Salva no histórico da sua conta." : "Salva no histórico deste navegador (entre na conta para guardar no servidor).",
          }
        : {
            title: "Interpretação concluída, mas não foi salva",
            description: saved.error ?? "Não foi possível salvar no histórico. Use o botão Salvar para tentar de novo.",
            variant: "destructive",
          },
    );
  };

  const handleAnalyze = () => {
    if (!text.trim() || text.length < 20) {
      setIsAnalyzePressed(false);
      setAnalysisError(getFriendlyErrorMessage("mínimo 20 caracteres"));
      toast({
        title: "Atenção",
        description: "Insira um texto de edital válido (mínimo 20 caracteres).",
        variant: "destructive",
      });
      return;
    }

    if (analyzeEditalMutation.isPending) return; // cliques repetidos não duplicam análises
    const agentIdToUse = manualAgentSelection ? selectedAgent : resolveAutoAgent(text, profile);
    resetAnalysis();
    const seq = analyzeSeq.current;
    const textAtStart = text;
    setSelectedAgent(agentIdToUse);
    setIsAnalyzePressed(true);
    setAnalysisStage("reading");

    // Documento longo: lido por INTEIRO em segundo plano (nunca pede para escolher trechos)
    // Visitante sem conta: até o limite da análise direta segue como antes (resultado parcial é
    // identificado e convida a entrar para ler tudo); acima disso, precisa entrar.
    if (text.length > docLimits.syncMax && (user || text.length > docLimits.syncHard)) {
      void startLongJob(agentIdToUse, textAtStart);
      return;
    }

    analyzeEditalMutation.mutate(
      {
        data: {
          agentId: agentIdToUse,
          text,
          ...(agentIdToUse === "elegibilidade" ? { profile } : {}),
        },
      },
      {
        onSuccess: async (data) => {
          // Outro documento entrou (ou a tela foi limpa) durante a análise: descarta este resultado
          if (seq !== analyzeSeq.current) return;
          await acceptAnalysis(data, agentIdToUse, textAtStart);
        },
        onError: (error) => {
          setIsAnalyzePressed(false);
          setAnalysisStage("error");
          setAnalysisError(getFriendlyErrorMessage(error));
          toast({
            title: "Não foi possível concluir",
            description: getFriendlyErrorMessage(error),
            variant: "destructive",
          });
        },
      },
    );
  };

  useEffect(() => {
    if (pendingAutoStart.current && user && text.length > docLimits.syncMax) {
      pendingAutoStart.current = false;
      handleAnalyze();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, text, docLimits.syncMax]);

  const handleToggleFavorite = async () => {
    if (!agentResult) {
      toast({ title: "Sem interpretação ativa", description: "Execute uma interpretação antes de favoritar.", variant: "destructive" });
      return;
    }
    if (!currentSavedId) {
      toast({ title: "Salve primeiro", description: "Salve a interpretação no histórico para poder marcá-la como favorita.", variant: "destructive" });
      return;
    }
    const next = !isFavorite;
    let ok = false;
    if (currentSavedId.startsWith("local-")) ok = setLocalFavorite(currentSavedId, next);
    else {
      try {
        const updated = await apiFetch<{ favorito: boolean }>(`/edital/agent-history/${currentSavedId}`, { method: "PATCH", body: JSON.stringify({ favorito: next }) });
        ok = updated.favorito === next;
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setIsFavorite(next);
      toast({ title: next ? "Favorito adicionado" : "Favorito removido", description: "O histórico foi atualizado." });
    } else {
      toast({ title: "Não foi possível atualizar o favorito", description: "Nada foi alterado. Tente novamente.", variant: "destructive" });
    }
  };

  const handleCheckToggle = (index: number) => {
    setChecklistState((prev) => {
      const next = prev.map((item, i) =>
        i === index ? { ...item, checked: !item.checked } : item,
      );
      if (agentResult?.type === "documentacao") {
        setAgentResult({ ...agentResult, checklist: next });
      }
      setCanonicalAnalysis((prev) =>
        prev
          ? {
              ...prev,
              checklist: {
                ...(prev.checklist ?? {}),
                items: next.map((item) => ({
                  doc: item.doc,
                  obrigatorio: item.obrigatorio,
                  observacao: item.observacao,
                  checked: item.checked,
                })),
              },
            }
          : prev,
      );
      return next;
    });
  };

  const handlePdfUpload = async (file: File) => {
    setIsPdfLoading(true);
    setPdfError(null);
    setPdfStructuredData(null);
    let PdfExtractError: (typeof import("@/lib/pdf"))["PdfExtractError"] | null = null;
    try {
      const pdfLib = await import("@/lib/pdf");
      PdfExtractError = pdfLib.PdfExtractError;
      const { text: extracted, structured, ocrTruncated } = await pdfLib.extractTextFromPdf(file);
      if (!extracted?.trim())
        throw new PdfExtractError("empty", "Nenhum texto legível encontrado no PDF.");
      resetAnalysis();
      setText(extracted.trim());
      setPdfStructuredData(structured);
      setActiveTab("pdf");
      toast(
        ocrTruncated
          ? {
              title: "PDF escaneado lido em parte",
              description: `O reconhecimento de texto leu ${ocrTruncated.lidas} de ${ocrTruncated.total} páginas. As páginas ${ocrTruncated.lidas + 1}–${ocrTruncated.total} não foram lidas; o aviso fica no texto e na análise. Se tiver o PDF com texto (não escaneado), envie-o para a leitura completa.`,
              variant: "destructive",
            }
          : {
              title: "PDF processado com sucesso.",
              description: `O texto legível foi extraído (${extracted.trim().length.toLocaleString("pt-BR")} caracteres) e está pronto para interpretação.`,
            },
      );
    } catch (err) {
      setPdfStructuredData(null);
      const isPdfError = Boolean(PdfExtractError && err instanceof PdfExtractError);
      setAnalysisError(isPdfError ? (err as Error).message : getFriendlyErrorMessage(err));
      setPdfError(
        err instanceof Error
          ? err.message
          : "Não foi possível extrair o texto deste PDF.",
      );
      toast({
        title: "Não foi possível ler este PDF",
        description: isPdfError ? (err as Error).message : "Verifique se o arquivo contém texto legível e tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsPdfLoading(false);
    }
  };

  const handleExtractUrl = () => {
    if (!urlInput.trim()) {
      setAnalysisError(getFriendlyErrorMessage("url"));
      toast({
        title: "Atenção",
        description: "Insira uma URL válida.",
        variant: "destructive",
      });
      return;
    }
    setAnalysisError(null);
    extractUrlMutation.mutate(
      { data: { url: urlInput } },
      {
        onSuccess: (data) => {
          resetAnalysis();
          setText(data.text);
          setActiveTab("texto");
          toast({
            title: "Texto extraído",
            description: "Revise o texto e clique em Interpretar.",
          });
        },
        onError: (error) => {
          setAnalysisError(getFriendlyErrorMessage(error));
          toast({
            title: "Erro de extração",
            description: getFriendlyErrorMessage(error),
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleHistorySelect = (item: SavedEdital) => {
    resetAnalysis();
    setText(item.originalText);
    setSelectedAgent("simples");
    setAgentResult({
      type: "simples",
      scoreOportunidade: 0,
      categoria: "Edital Público",
      resumo: item.resumo,
      objetivo: item.objetivo,
      publicoAlvo: item.quemPodeParticipar,
      prazo: item.prazoInscricao,
      requisitos: [],
      ondeInscrever: item.ondeSeInscrever,
      observacao: "Resultado carregado do histórico salvo.",
    });
    setSavedThisResult(true);
    setShowHistory(false);
  };

  const handleAgentHistorySelect = (item: AgentResultRecord | LocalAgentRecord) => {
    resetAnalysis();
    setText(item.originalText);
    setAnalyzedText(item.originalText);
    setCurrentSavedId(String(item.id));
    setIsFavorite(Boolean((item as { favorito?: boolean }).favorito));
    setSelectedAgent(item.agentId as AgentId);
    const parsedCanonical = item.resultJson as CanonicalAnalysisLike;
    const parsed = canonicalToAgentResult(parsedCanonical) ?? (item.resultJson as unknown as AgentResult);
    const withHistoryId = { ...parsedCanonical, historyId: item.id } as CanonicalAnalysisLike;
    setCanonicalAnalysis(withHistoryId && typeof withHistoryId === "object" ? withHistoryId : null);
    applyResult(parsed);
    setSavedThisResult(true);
    setShowHistory(false);
  };

  const BASE = ((import.meta.env.BASE_URL as string) || "/").replace(/\/$/, "");

  const buildShareUrl = (token: string) => {
    const rawBase = (import.meta.env.BASE_URL as string) || "/";
    const normalizedBase = rawBase.replace(/\/$/, "");
    return `${window.location.origin}${normalizedBase}/compartilhado/${token}`;
  };

  const generateShareToken = async () => {
    if (!agentResult) return null;
    if (!user) {
      // Link público só é criado por quem está logado, para que possa ser revogado depois
      toast({
        title: "Entre para compartilhar",
        description: "Links de compartilhamento ficam na sua conta: você vê quem criou, até quando vale e pode revogar em Configurações.",
      });
      return null;
    }
    setIsSharing(true);
    try {
      const title =
          agentResult.type === "simples"
            ? ((agentResult as { resumo?: string }).resumo?.slice(0, 60) ??
              "Edital")
            : "Interpretação de Edital";
      const { token, expiresAt } = await apiFetch<{ token: string; expiresAt?: string }>("/edital/share", {
        method: "POST",
        body: JSON.stringify({
          agentId: agentResult.type,
          title,
          resultJson: canonicalAnalysis ?? agentResult,
        }),
      });
      setShareToken(token);
      setShowShareLink(true);
      setShareOptionsOpen(true);
      toast({
        title: "Link criado",
        description: `Qualquer pessoa com o link pode ver esta interpretação${expiresAt ? ` até ${new Date(expiresAt).toLocaleDateString("pt-BR")}` : ""}. Dados do seu perfil não são incluídos. Revogue em Configurações.`,
      });
      return token;
    } catch (err) {
      toast({
        title: "Link não criado",
        description: err instanceof Error && err.message ? err.message : "Não foi possível gerar o link. Nada foi publicado.",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsSharing(false);
    }
  };

  const handleShare = async () => {
    await generateShareToken();
  };

  const handleAskQuestion = async () => {
    if (!canonicalAnalysis) {
      toast({
        title: "Interpretação canônica necessária",
        description: "Interprete o documento primeiro para usar o chat contextual.",
        variant: "destructive",
      });
      return;
    }

    if (!question.trim()) return;
    const q = question.trim();
    setIsAnswering(true);
    setQuestion("");

    if (!user) {
      // Sem login: resposta automática montada a partir da análise (sem IA) — identificada na tela
      const answer = getCanonicalAnswer(q, text, canonicalAnalysis, profile);
      setAnswerHistory((prev) => [{ question: q, answer, source: "automatica" as const }, ...prev].slice(0, 8));
      setIsAnswering(false);
      return;
    }

    try {
      const facts = resolveAnalysisFacts(canonicalAnalysis as never);
      const factLines = [
        `Prazo de inscrição: ${describeDeadline(facts.deadline)}`,
        facts.documents.length ? `Documentos: ${facts.documents.map(documentLine).join("; ")}` : "",
        facts.unsupportedQualifiers.length ? `Não afirmar como exigência (o edital não menciona): ${facts.unsupportedQualifiers.join(", ")}` : "",
        facts.missing.length ? `Não localizado automaticamente no texto: ${facts.missing.map((m) => m.label).join(", ")}` : "",
      ].filter(Boolean);
      const ctx = [
        `FATOS CONFERIDOS NO DOCUMENTO (prevalecem sobre a interpretação):\n${factLines.join("\n")}`,
        text ? `TEXTO DO EDITAL (trecho):\n${text.slice(0, 4000)}` : "",
        `INTERPRETAÇÃO CANÔNICA:\n${JSON.stringify(canonicalAnalysis, null, 2).slice(0, 3000)}`,
      ].filter(Boolean).join("\n\n");

      // Conversa SÓ deste documento: as perguntas anteriores (deste edital) dão continuidade
      const previous = [...answerHistory]
        .reverse()
        .slice(-3)
        .flatMap((a) => [
          { role: "user" as const, content: a.question },
          { role: "assistant" as const, content: a.answer },
        ]);
      const data = await apiFetch<{ reply?: string }>("/niasci/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: [...previous, { role: "user", content: q }],
          context: ctx,
          historyId: canonicalAnalysis.historyId ?? undefined,
        }),
      });
      if (!data.reply) throw new Error("Resposta vazia.");
      setAnswerHistory((prev) => [{ question: q, answer: data.reply as string, source: "ia" as const }, ...prev].slice(0, 8));
    } catch (err) {
      const fallbackAnswer = getCanonicalAnswer(q, text, canonicalAnalysis, profile);
      setAnswerHistory((prev) => [{ question: q, answer: fallbackAnswer, source: "automatica" as const }, ...prev].slice(0, 8));
      toast({
        title: "A IA do chat não respondeu",
        description: `${err instanceof Error && err.message ? `${err.message} ` : ""}Mostramos uma resposta automática montada a partir da análise, sem IA.`,
        variant: "destructive",
      });
    } finally {
      setIsAnswering(false);
    }
  };

  const handleOpenShareOption = async (
    target: "whatsapp" | "google" | "copy",
  ) => {
    const token = shareToken ?? (await generateShareToken());
    if (!token) {
      return;
    }

    const url = buildShareUrl(token);
    const shareText = `Confira esta interpretação de edital gerada com a LUPA Digital: ${url}`;

    if (target === "copy") {
      navigator.clipboard
        .writeText(url)
        .then(() => {
          setShareOptionsOpen(false);
          toast({
            title: "Link copiado!",
            description: "Cole em qualquer lugar para compartilhar.",
          });
        })
        .catch(() => {
          toast({ title: "Não foi possível copiar", description: `Copie o link manualmente: ${url}`, variant: "destructive" });
        });
      return;
    }

    const encodedText = encodeURIComponent(shareText);
    const encodedTitle = encodeURIComponent("Interpretação de edital - LUPA Digital");

    if (target === "whatsapp") {
      window.open(
        `https://wa.me/?text=${encodedText}`,
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }

    window.open(
      `https://mail.google.com/mail/?view=cm&fs=1&su=${encodedTitle}&body=${encodedText}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const handleSaveAgent = async () => {
    if (!agentResult || !text.trim() || savedThisResult) return;
    const saved = await persistCurrentAnalysis(agentResult, canonicalAnalysis, selectedAgent, analyzedText ?? text);
    toast(
      saved.ok
        ? { title: "Interpretação salva", description: saved.where === "conta" ? "Disponível no histórico da sua conta." : "Disponível no histórico deste navegador." }
        : { title: "Não foi possível salvar", description: saved.error ?? "Nada foi gravado. Tente novamente.", variant: "destructive" },
    );
  };

  const handleExportPDF = async () => {
    const resultToExport = agentResult ?? canonicalToAgentResult(canonicalAnalysis);
    if (!resultToExport) return;
    setIsExporting(true);
    try {
      await exportToPDF(
        resultToExport,
        `lupa-${resultToExport.type}-${currentAgentMeta.name}`,
        canonicalAnalysis,
      );
    } catch {
      toast({
        title: "Erro",
        description: "Não foi possível gerar o PDF.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-[100dvh]">
      {showHistory && (
        <HistoryPanel
          isLoggedIn={Boolean(user)}
          onSelect={handleHistorySelect}
          onSelectAgent={handleAgentHistorySelect}
          onSelectSupabase={(item) => {
            setText(item.conteudo_original ?? "");
            setSavedThisResult(true);
            setShowHistory(false);
            toast({
              title: "Interpretação carregada",
              description: "O texto original foi restaurado no editor.",
            });
          }}
          onClose={() => setShowHistory(false)}
        />
      )}

      <div className="container mx-auto px-4 py-8 max-w-7xl flex-1">
        <div className="mb-8 rounded-3xl border border-border/70 bg-white/80 p-5 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-primary">
                <Sparkles className="w-3.5 h-3.5" />
                Interpretação de editais
              </div>
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
                  Transforme editais em respostas claras
                </h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                  Envie um edital, receba uma interpretação clara e organizada e siga para histórico, chat e exportação sem perder o sentido original do documento.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 rounded-xl shrink-0 border-primary/20 hover:bg-primary/5"
              onClick={() => setShowHistory(true)}
            >
              <History className="w-4 h-4 text-primary" />
              <span className="font-medium">Histórico</span>
            </Button>
          </div>
        </div>

        <div className="mb-6 rounded-3xl border border-border/70 bg-card/70 p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { step: "1", title: "Envie o edital", desc: "Texto, URL ou PDF." },
              { step: "2", title: "Interprete", desc: "Resumo, cronograma e requisitos." },
              { step: "3", title: "Salve e exporte", desc: "Histórico, chat e PDF." },
            ].map((item) => (
              <div key={item.step} className="rounded-2xl border border-border/60 bg-background/80 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-primary">{item.step}</div>
                <p className="mt-1 font-semibold text-foreground">{item.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 items-start lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_320px] xl:gap-8">
          {/* ── Left Column ── */}
          <section className="flex flex-col gap-5">
            <div className="rounded-3xl border border-border/70 bg-card/70 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${assistantIdentity.color} ${assistantIdentity.textColor}`}>
                  <span className="scale-110">{ICON_MAP[assistantIdentity.iconName]}</span>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">{assistantIdentity.name}</p>
                  <p className="text-sm text-muted-foreground">{assistantIdentity.description}</p>
                  <p className="text-xs text-muted-foreground">
                    O foco da interpretação é ajustado automaticamente ao conteúdo do edital.
                  </p>
                </div>
              </div>
            </div>

          <div className="mt-4">
            <AgentSelector
              selected={selectedAgent}
              onSelect={(id) => {
                setSelectedAgent(id);
                setManualAgentSelection(true);
              }}
            />
            <p className="text-xs text-muted-foreground mt-2" aria-live="polite" data-testid="agente-escolha">
              {manualAgentSelection ? (
                <>
                  Agente escolhido por você. A sugestão automática não vai substituir essa escolha.{" "}
                  <button type="button" className="font-semibold text-lens underline underline-offset-2" onClick={() => setManualAgentSelection(false)}>
                    Voltar à sugestão automática
                  </button>
                </>
              ) : autoSuggestion ? (
                <>Sugerido automaticamente: {AGENTS.find((a) => a.id === autoSuggestion.agent)?.name}, porque {autoSuggestion.reason}. Clique em outro agente para mudar.</>
              ) : (
                <>O agente é sugerido automaticamente quando você inserir o texto. Você também pode escolher um agora.</>
              )}
            </p>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-3 mb-3 bg-muted/60">
              <TabsTrigger value="texto">Colar Texto</TabsTrigger>
              <TabsTrigger value="url">Usar URL</TabsTrigger>
              <TabsTrigger value="pdf">Ler PDF</TabsTrigger>
            </TabsList>
            <TabsContent value="texto">
                <div className="relative">
                  <Textarea
                    placeholder="Cole aqui o texto do edital que deseja interpretar…"
                    className="min-h-[280px] resize-y text-sm leading-relaxed p-4 rounded-2xl border-border/60 bg-card/80 shadow-sm focus-visible:ring-primary/30 focus-visible:border-primary/40 font-[inherit] tracking-normal"
                    style={{ fontFamily: "inherit", whiteSpace: "pre-wrap", overflowWrap: "break-word" }}
                    value={text}
                    onChange={(e) => {
                      // Texto mudou: o resultado anterior deixa de valer para este documento
                      if (agentResult || canonicalAnalysis) resetAnalysis();
                      setText(e.target.value);
                    }}
                    disabled={isAnalyzing}
                    data-testid="input-edital-text"
                  />
                  {text && !isAnalyzing && (
                    <button
                      type="button"
                      onClick={() => { resetAnalysis(); setText(""); }}
                      className="absolute top-2.5 right-2.5 rounded-lg p-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                      title="Limpar texto e resultado (o histórico salvo não é apagado)"
                      aria-label="Limpar texto e resultado (o histórico salvo não é apagado)"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>
                  )}
                </div>
                {text && (
                  <div className="flex items-center justify-between mt-2 px-1">
                    <p className="text-xs text-muted-foreground">
                      {text.split(/\s+/).filter(Boolean).length} palavras
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {text.length.toLocaleString("pt-BR")} caracteres
                    </p>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="url">
                <Card className="border-border shadow-sm">
                  <CardContent className="pt-5 pb-5 flex flex-col gap-4">
                    <div className="space-y-2">
                      <label
                        htmlFor="url-input"
                        className="text-sm font-medium"
                      >
                        URL Pública do Edital
                      </label>
                      <div className="flex gap-2">
                        <Input
                          id="url-input"
                          placeholder="https://exemplo.gov.br/edital…"
                          value={urlInput}
                          onChange={(e) => setUrlInput(e.target.value)}
                          className="flex-1"
                        />
                        <Button
                          onClick={handleExtractUrl}
                          disabled={extractUrlMutation.isPending}
                        >
                          {extractUrlMutation.isPending ? (
                            <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
                          ) : (
                            <LinkIcon className="w-4 h-4 mr-2" />
                          )}
                          Extrair
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        O link deve ser acessível publicamente (sem login).
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="pdf">
                <Card className="border-border shadow-sm">
                  <CardContent className="pt-5 pb-5 flex flex-col gap-4">
                    <div className="space-y-3">
                      <label className="text-sm font-medium">
                        Arquivo PDF do Edital
                      </label>
                      <div
                        className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors ${
                          isPdfLoading
                            ? "border-primary/30 bg-primary/5"
                            : "border-border/60 hover:border-primary/40 hover:bg-primary/5"
                        } cursor-pointer`}
                        onClick={() =>
                          !isPdfLoading &&
                          document.getElementById("pdf-input")?.click()
                        }
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const file = e.dataTransfer.files[0];
                          if (file?.type === "application/pdf")
                            handlePdfUpload(file);
                        }}
                      >
                        <input
                          id="pdf-input"
                          type="file"
                          accept="application/pdf,.pdf"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handlePdfUpload(file);
                            e.target.value = "";
                          }}
                        />
                        {isPdfLoading ? (
                          <>
                            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
                            <p className="text-sm text-muted-foreground">
                              Extraindo texto do PDF…
                            </p>
                          </>
                        ) : (
                          <>
                            <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                            <p className="text-sm font-medium mb-1">
                              Clique ou arraste o PDF aqui
                            </p>
                            <p className="text-xs text-muted-foreground">
                              PDF até 20 MB — o texto será extraído
                              automaticamente
                            </p>
                          </>
                        )}
                      </div>
                      {text && activeTab === "pdf" && (
                        <div className="space-y-2">
                          <p className="text-xs text-emerald-600 font-medium flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            PDF processado com sucesso. Texto legível extraído (
                            {text.length} caracteres).
                          </p>
                          {pdfStructuredData && (
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 space-y-2 text-sm">
                              <div className="grid gap-2 sm:grid-cols-2">
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                    Título
                                  </p>
                                  <p className="text-foreground">
                                    {pdfStructuredData.title}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                    Categoria
                                  </p>
                                  <p className="text-foreground">
                                    {pdfStructuredData.categoria}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                    Resumo
                                  </p>
                                  <p className="text-foreground">
                                    {pdfStructuredData.resumo}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                    Prazo
                                  </p>
                                  <p className="text-foreground">
                                    {pdfStructuredData.prazo}
                                  </p>
                                </div>
                              </div>
                              <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                  Requisitos
                                </p>
                                <ul className="mt-1 list-disc pl-5 text-foreground/90 space-y-1">
                                  {pdfStructuredData.requisitos.length > 0 ? (
                                    pdfStructuredData.requisitos.map((item) => (
                                      <li key={item}>{item}</li>
                                    ))
                                  ) : (
                                    <li>
                                      Nenhum requisito identificado
                                      automaticamente.
                                    </li>
                                  )}
                                </ul>
                              </div>
                              <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                  Indicadores
                                </p>
                                <div className="mt-1 flex flex-wrap gap-2">
                                  {Object.entries(
                                    pdfStructuredData.indicadores,
                                  ).map(([key, value]) => (
                                    <Badge
                                      key={key}
                                      variant="secondary"
                                      className="rounded-full"
                                    >
                                      {key}: {String(value)}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                          {pdfError && (
                            <p className="text-xs text-destructive font-medium">
                              {pdfError}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                size="lg"
                className="rounded-xl h-12 px-6 text-base shadow-sm flex-1 sm:flex-none font-semibold"
                onClick={handleAnalyze}
                disabled={isAnalyzing || !text.trim()}
                data-testid="button-analyze"
              >
                {isAnalyzing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                    {"Interpretando…"}
                  </>
                ) : (
                  <>{analyzeButtonLabel}</>
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                Foco automático: <strong>{currentAgentMeta?.name ?? "Assistente"}</strong>
              </p>
            </div>
            {!agentResult && !isAnalyzing && (
              <div className="rounded-2xl border border-border/70 bg-slate-50 p-3 text-sm text-muted-foreground">
                Você pode usar texto, URL pública ou PDF. A IA interpreta e organiza o conteúdo sem alterar o sentido original do documento, e salva a interpretação no histórico quando há sessão ativa.
              </div>
            )}
            {needsAccount !== null && !user && (
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950" role="region" aria-labelledby="precisa-conta" data-testid="documento-grande-cadastro">
                <p id="precisa-conta" className="font-semibold">Documento muito grande: faça o cadastro para ler por inteiro</p>
                <p className="mt-1">
                  Este documento tem {needsAccount.toLocaleString("pt-BR")} caracteres. Documentos assim são lidos inteiros, parte por parte, e o
                  andamento fica guardado na sua conta. O cadastro é gratuito e você não precisa escolher trechos.
                </p>
                <p className="mt-1 text-xs text-sky-900">Guardamos o texto neste navegador enquanto você se cadastra; ao voltar, a leitura começa sozinha.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild size="sm" className="rounded-xl">
                    <Link href="/cadastro?next=%2Ftestar" data-testid="cadastro-documento-grande">Criar conta grátis</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="rounded-xl bg-white">
                    <Link href="/login?next=%2Ftestar">Já tenho conta — entrar</Link>
                  </Button>
                </div>
              </div>
            )}
            {analysisError && !isAnalyzing && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold">Não foi possível concluir a interpretação</p>
                    <p className="mt-1">{analysisError}</p>
                  </div>
                </div>
                {text.trim().length >= 20 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl border-rose-300 bg-white text-rose-700 hover:bg-rose-100"
                      onClick={handleAnalyze}
                      disabled={isAnalyzing}
                    >
                      Tentar novamente
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-xl text-rose-600 hover:bg-rose-100"
                      onClick={() => setAnalysisError(null)}
                    >
                      Dispensar
                    </Button>
                  </div>
                )}
              </div>
            )}


            {/* Agent description banner */}
            {!agentResult && !isAnalyzing && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-xl p-3 border border-border/50">
                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Cole o edital e clique em <strong>Analisar Documento</strong> para ver a interpretação organizada.
                </span>
              </div>
            )}
          </section>

          {/* ── Center Column: Results ── */}
          <section className="relative min-h-[500px] space-y-4">
            {!agentResult && !isAnalyzing && !analysisError && (
              <div className="h-full flex flex-col items-center justify-center text-center p-12 border border-dashed border-border rounded-3xl bg-muted/20">
                <div
                  className={`w-16 h-16 mb-5 rounded-2xl ${assistantIdentity.color} ${assistantIdentity.textColor} flex items-center justify-center`}
                >
                  <span className="scale-150">
                    {ICON_MAP[assistantIdentity.iconName]}
                  </span>
                </div>
                <h3 className="text-lg font-semibold mb-2">{assistantIdentity.name}</h3>
                <p className="text-sm text-muted-foreground max-w-[320px]">
                  O conteúdo do edital define o foco da interpretação e a resposta chega já organizada para revisão.
                </p>
                <Badge variant="outline" className={`mt-4 ${assistantIdentity.textColor} border-current`}>
                  Pronto para interpretar
                </Badge>
              </div>
            )}

            {(isAnalyzing || longJob || isPdfLoading || extractUrlMutation.isPending || realStage === "falha" || realStage === "parcial" || realStage === "concluido") && (
              <div className="space-y-3">
                <StageBanner stage={realStage} elapsedSeconds={elapsedSeconds} agentName={currentAgentMeta.name} />
                {longJob && (
                  <LongDocProgress
                    job={longJob}
                    runningHere={longRunning}
                    backgroundAvailable={docLimits.background}
                    onCancel={() => void cancelLongJob()}
                    onRetryFailed={() => void retryLongJob()}
                    onResume={() => void runLongJob(longJob.id, analyzedText ?? text)}
                  />
                )}
                {isAnalyzing && !longJob && text.length > 8000 && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    Documento extenso ({text.length.toLocaleString("pt-BR")} caracteres): a análise é feita em partes e pode demorar mais.
                  </p>
                )}
                {!isAnalyzing && <ResultValidity analysis={canonicalAnalysis as never} />}
              </div>
            )}

            {agentResult && !isAnalyzing && (
              <>
                <div className="flex flex-wrap gap-2 mt-2 items-center">
                  <Button
                    size="lg"
                    variant="outline"
                    className="rounded-xl h-12 px-5 text-sm gap-2 animate-in fade-in"
                    onClick={handleExportPDF}
                    disabled={isExporting || (!agentResult && !canonicalAnalysis)}
                  >
                    {isExporting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
                        Gerando PDF…
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        Exportação PDF
                      </>
                    )}
                  </Button>
                  <Button
                    size="lg"
                    variant={isFavorite ? "default" : "outline"}
                    className={`rounded-xl h-12 px-5 text-sm gap-2 animate-in fade-in ${isFavorite ? "bg-rose-600 text-white" : ""}`}
                    onClick={handleToggleFavorite}
                  >
                    <Heart className="w-4 h-4" />
                    {isFavorite ? "Favorito" : "Favoritar"}
                  </Button>
                  <Button
                    size="lg"
                    variant={savedThisResult ? "ghost" : "outline"}
                    className={`rounded-xl h-12 px-5 text-sm gap-2 animate-in fade-in ${savedThisResult ? "text-emerald-600 border-emerald-200 bg-emerald-50" : ""}`}
                    onClick={handleSaveAgent}
                    disabled={
                      savedThisResult || saveAgentResultMutation.isPending
                    }
                  >
                    {saveAgentResultMutation.isPending ? (
                      <>
                        <div className="w-4 h-4 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
                        Salvando…
                      </>
                    ) : savedThisResult ? (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Salvo
                      </>
                    ) : (
                      <>
                        <History className="w-4 h-4" />
                        Salvar interpretação
                      </>
                    )}
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="rounded-xl h-12 px-5 text-sm gap-2 animate-in fade-in border-primary/20 hover:bg-primary/5"
                    onClick={
                      showShareLink
                        ? () => setShareOptionsOpen((v) => !v)
                        : handleShare
                    }
                    disabled={isSharing}
                  >
                    {isSharing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                        Gerando…
                      </>
                    ) : (
                      <>
                        <Share2 className="w-4 h-4 text-primary" />
                        Compartilhar
                      </>
                    )}
                  </Button>
                </div>
                {showShareLink && shareOptionsOpen && (
                  <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                    <p className="text-xs font-semibold text-primary">
                      Compartilhar via
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => handleOpenShareOption("whatsapp")}
                      >
                        WhatsApp
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => handleOpenShareOption("google")}
                      >
                        Google
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => handleOpenShareOption("copy")}
                      >
                        Copiar link
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Agent description banner */}
            {!agentResult && !isAnalyzing && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-xl p-3 border border-border/50">
                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Cole o edital e clique em <strong>Analisar Documento</strong> para ver a interpretação organizada.
                </span>
              </div>
            )}
            {agentResult && !isAnalyzing && (
              <section aria-labelledby="proximos-passos" className="rounded-2xl border border-hairline bg-white p-4" data-testid="testar-proximos-passos">
                <h2 id="proximos-passos" className="text-sm font-semibold text-ink">
                  E agora?
                </h2>
                <div className="mt-2 flex flex-wrap items-start gap-3">
                  {user && currentSavedId && !currentSavedId.startsWith("local-") ? (
                    <QueroParticipar agentResultId={Number(currentSavedId)} titulo={text.trim().slice(0, 120).replace(/\n/g, " ")} size="sm" />
                  ) : user ? (
                    <p className="max-w-xs text-xs text-slate-600">
                      Para organizar documentos e prazos em <strong>Quero participar</strong>, salve a interpretação primeiro.
                    </p>
                  ) : (
                    <QueroParticipar size="sm" />
                  )}
                  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <li>
                      <span className="text-slate-600">Documentos e elegibilidade: </span>abas <strong>Checklist</strong> e <strong>Elegibilidade</strong> abaixo
                    </li>
                    <li>
                      <Link href="/glossario" className="font-medium text-lens underline">
                        Entender um termo
                      </Link>
                    </li>
                    <li>
                      <Link href="/oportunidades" className="font-medium text-lens underline">
                        Ver editais parecidos
                      </Link>
                    </li>
                  </ul>
                </div>
              </section>
            )}
            {agentResult && !isAnalyzing && (
              <Tabs defaultValue="resumo" className="w-full">
                <TabsList className="mb-4 grid h-auto grid-cols-3 gap-2 rounded-[32px] border border-slate-200 bg-slate-100 p-2 shadow-sm shadow-slate-200/20 sm:grid-cols-4">
                  <TabsTrigger value="resumo" className="flex min-w-0 flex-col gap-1 whitespace-normal rounded-2xl px-2 py-3 text-[12px] font-semibold leading-tight text-slate-700">
                    <BarChart2 className="w-4 h-4" />
                    Interpretação
                  </TabsTrigger>
                  <TabsTrigger value="cronograma" className="flex min-w-0 flex-col gap-1 whitespace-normal rounded-2xl px-2 py-3 text-[12px] font-semibold leading-tight text-slate-700">
                    <CalendarDays className="w-4 h-4" />
                    Cronograma
                  </TabsTrigger>
                  <TabsTrigger value="checklist" className="flex min-w-0 flex-col gap-1 whitespace-normal rounded-2xl px-2 py-3 text-[12px] font-semibold leading-tight text-slate-700">
                    <ClipboardList className="w-4 h-4" />
                    Checklist
                  </TabsTrigger>
                  <TabsTrigger value="elegibilidade" className="flex min-w-0 flex-col gap-1 whitespace-normal rounded-2xl px-2 py-3 text-[12px] font-semibold leading-tight text-slate-700">
                    <UserCheck className="w-4 h-4" />
                    Elegibilidade
                  </TabsTrigger>
                  <TabsTrigger value="chat" className="flex min-w-0 flex-col gap-1 whitespace-normal rounded-2xl px-2 py-3 text-[12px] font-semibold leading-tight text-slate-700">
                    <MessageSquare className="w-4 h-4" />
                    Chat
                  </TabsTrigger>
                  <TabsTrigger value="historico" className="flex min-w-0 flex-col gap-1 whitespace-normal rounded-2xl px-2 py-3 text-[12px] font-semibold leading-tight text-slate-700">
                    <History className="w-4 h-4" />
                    Histórico
                  </TabsTrigger>
                  <TabsTrigger value="exportacao" className="flex min-w-0 flex-col gap-1 whitespace-normal rounded-2xl px-2 py-3 text-[12px] font-semibold leading-tight text-slate-700">
                    <Download className="w-4 h-4" />
                    Exportação
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="resumo">
                  <Card className="rounded-3xl border border-border/70 bg-white shadow-sm">
                    <CardHeader className="border-b border-border/70 pb-3">
                      <CardTitle className="text-base font-semibold flex items-center gap-2"><BarChart2 className="w-4 h-4 text-primary" /> Interpretação</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                      <LearnBox section="resumo" />
                      <AgentResultPanel result={agentResult} onCheckToggle={handleCheckToggle} printRef={printRef} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="cronograma">
                  <Card className="rounded-3xl border border-border/70 bg-white shadow-sm">
                    <CardHeader className="border-b border-border/70 pb-3">
                      <CardTitle className="text-base font-semibold flex items-center gap-2"><CalendarDays className="w-4 h-4 text-primary" /> Cronograma</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 p-4">
                      <LearnBox section="cronograma" />
                      {timelineSteps.length > 0 ? timelineSteps.map((step, index) => (
                        <div key={step.title} className="flex gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex flex-col items-center">
                            <div className={`h-3.5 w-3.5 rounded-full ${index === 0 ? "bg-primary" : "bg-muted-foreground/40"}`} />
                            {index < timelineSteps.length - 1 && <div className="mt-2 h-full w-px bg-border" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mt-1">{step.date}</p>
                            <p className="text-sm text-slate-700 mt-3"><AutoTerms text={step.description} /></p>
                          </div>
                        </div>
                      )) : (
                        <EmptySection
                          icon={<CalendarDays className="w-5 h-5 text-primary" />}
                          title="Cronograma não identificado"
                          description="O edital analisado não trouxe datas ou etapas suficientes para montar um cronograma."
                          action={
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-xl"
                              onClick={() => {
                                setSelectedAgent("acompanhamento");
                                setManualAgentSelection(true);
                              }}
                            >
                              Analisar com agente Acompanhamento
                            </Button>
                          }
                        />
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="checklist">
                  <Card className="rounded-3xl border border-border/70 bg-white shadow-sm">
                    <CardHeader className="border-b border-border/70 pb-3">
                      <CardTitle className="text-base font-semibold flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> Checklist</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 p-4">
                      <LearnBox section="checklist" />
                      {checklistItems.length > 0 ? checklistItems.map((item) => (
                        <div key={item.label} className={`flex items-start gap-4 rounded-3xl border p-4 ${item.done ? "border-emerald-200 bg-emerald-50/80" : "border-border bg-slate-50"}`}>
                          <div className={`mt-1 h-4 w-4 rounded-full ${item.done ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                          <div className="min-w-0">
                            <p className={`text-sm font-semibold ${item.done ? "text-emerald-800" : "text-slate-900"}`}>{item.label}</p>
                            {item.origin && (
                              <p className="mt-1 text-xs font-medium" data-testid="checklist-origem" data-origem={item.origin}>
                                {item.origin === "edital" ? (
                                  <span className="text-emerald-800">Consta no edital</span>
                                ) : (
                                  <span className="text-amber-800">Não localizado no edital — conferir</span>
                                )}
                              </p>
                            )}
                            <p className="text-sm text-muted-foreground mt-2"><AutoTerms text={item.hint} /></p>
                            {item.unconfirmed && item.unconfirmed.length > 0 && (
                              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900" data-testid="checklist-nao-confirmado">
                                Não confirmado no edital: {item.unconfirmed.join(", ")}.
                              </p>
                            )}
                            {item.evidence && (
                              <blockquote className="evidence mt-2 text-[0.8125rem] leading-relaxed">“{item.evidence.length > 260 ? `${item.evidence.slice(0, 260)}…` : item.evidence}”</blockquote>
                            )}
                            {item.guidance && item.origin && (
                              <p className="mt-2 text-xs text-slate-600"><span className="font-semibold">Orientação (não é exigência do edital):</span> {item.guidance}</p>
                            )}
                          </div>
                        </div>
                      )) : (
                        <EmptySection
                          icon={<ClipboardList className="w-5 h-5 text-primary" />}
                          title="Checklist não identificado"
                          description="Não foi possível listar documentos obrigatórios deste edital a partir da interpretação atual."
                          action={
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-xl"
                              onClick={() => {
                                setSelectedAgent("documentacao");
                                setManualAgentSelection(true);
                              }}
                            >
                              Analisar com agente Documentação
                            </Button>
                          }
                        />
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="elegibilidade">
                  <Card className="rounded-3xl border border-border/70 bg-white shadow-sm">
                    <CardHeader className="border-b border-border/70 pb-3">
                      <CardTitle className="text-base font-semibold flex items-center gap-2"><UserCheck className="w-4 h-4 text-primary" /> Elegibilidade</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 p-4">
                      <LearnBox section="elegibilidade" />
                      {agentResult.type === "elegibilidade" ? (
                        <div className="space-y-4">
                          {agentResult.criterios.map((c) => (
                            <div key={c.criterio} className={`rounded-3xl border p-4 ${c.atende === true ? "border-teal-200 bg-teal-50/80" : c.atende === "parcial" ? "border-amber-200 bg-amber-50/80" : c.atende === null ? "border-slate-200 bg-slate-50" : "border-rose-200 bg-rose-50/80"}`}>
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">{c.criterio}</p>
                                  <p className="text-sm text-muted-foreground mt-2"><AutoTerms text={c.observacao} /></p>
                                </div>
                                <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${c.atende === true ? "bg-teal-600 text-white" : c.atende === "parcial" ? "bg-amber-600 text-white" : c.atende === null ? "bg-slate-400 text-slate-950" : "bg-rose-600 text-white"}`}>
                                  {c.atende === true ? "Atende" : c.atende === "parcial" ? "Parcial" : c.atende === null ? "Não verificado" : "Não atende"}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <EmptySection
                          icon={<UserCheck className="w-5 h-5 text-primary" />}
                          title="Análise de elegibilidade"
                          description="Use o agente de Elegibilidade para verificar quais critérios do edital o seu perfil atende."
                          action={
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-xl"
                              onClick={() => {
                                setSelectedAgent("elegibilidade");
                                setManualAgentSelection(true);
                              }}
                            >
                              Analisar com agente Elegibilidade
                            </Button>
                          }
                        />
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="chat">
                  <Card className="rounded-3xl border border-border/70 bg-white shadow-sm">
                    <CardHeader className="border-b border-border/70 pb-3">
                      <CardTitle className="text-base font-semibold flex items-center gap-2"><MessageSquare className="w-4 h-4 text-primary" /> Chat contextual</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 p-4">
                      <LearnBox section="chat" />
                      <p className="text-sm text-muted-foreground">
                        Pergunte sobre <strong>este</strong> edital. As respostas usam só a análise e o texto dele; se algo não estiver no documento, a resposta deve dizer isso.
                        {!user && " Sem login, as respostas são automáticas (sem IA)."}
                      </p>
                      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                        <Input placeholder="Ex: Qual é o prazo final?" value={question} onChange={(e) => setQuestion(e.target.value)} disabled={isAnswering} />
                        <Button size="sm" className="rounded-xl" onClick={handleAskQuestion} disabled={!question.trim() || isAnswering || !canonicalAnalysis}>{isAnswering ? "Respondendo…" : "Perguntar"}</Button>
                      </div>
                      {answerHistory.length > 0 && (
                        <div className="space-y-3">
                          {answerHistory.map((item, index) => (
                            <div key={`${index}-${item.question}`} className="rounded-3xl border border-border bg-slate-50 p-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Pergunta</p>
                              <p className="mt-2 text-sm font-semibold text-slate-900">{item.question}</p>
                              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mt-3">
                                Resposta{" "}
                                <span className={`ml-1 rounded-full px-2 py-0.5 normal-case tracking-normal ${item.source === "ia" ? "bg-lens-tint text-lens-deep" : "bg-amber-50 text-amber-800"}`}>
                                  {item.source === "ia" ? "IA, com base nesta análise" : "automática, sem IA — confira no documento"}
                                </span>
                              </p>
                              <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{item.answer}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {faqItems.length > 0 && (
                        <div className="grid gap-3 md:grid-cols-2">
                          {faqItems.map((faq) => (
                            <div key={faq.question} className="rounded-3xl border border-border bg-slate-50 p-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{faq.question}</p>
                              <p className="mt-2 text-sm text-slate-900">{faq.answer}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {answerHistory.length === 0 && faqItems.length === 0 && (
                        <EmptySection
                          icon={<MessageSquare className="w-5 h-5 text-primary" />}
                          title="Faça uma pergunta sobre o edital"
                          description="Pergunte sobre prazos, documentos ou critérios e receba respostas com base na interpretação gerada."
                        />
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="historico">
                  <Card className="rounded-3xl border border-border/70 bg-white shadow-sm">
                    <CardHeader className="border-b border-border/70 pb-3">
                      <CardTitle className="text-base font-semibold flex items-center gap-2"><History className="w-4 h-4 text-primary" /> Histórico</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 p-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-3xl border border-border bg-slate-50 p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Último registro</p>
                          <p className="mt-2 text-sm text-slate-900">Acompanhe as interpretações salvas e restaure resultados com um clique.</p>
                        </div>
                        <div className="rounded-3xl border border-border bg-slate-50 p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Salvamento automático</p>
                          <p className="mt-2 text-sm text-slate-900">As análises são mantidas quando você está logado e podem ser acessadas a qualquer momento.</p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-muted-foreground">Use o histórico para comparar interpretações e recuperar informações rapidamente.</p>
                        <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setShowHistory(true)}>Abrir histórico</Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="exportacao">
                  <Card className="rounded-3xl border border-border/70 bg-white shadow-sm">
                    <CardHeader className="border-b border-border/70 pb-3">
                      <CardTitle className="text-base font-semibold flex items-center gap-2"><Download className="w-4 h-4 text-primary" /> Exportação</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 p-4">
                      <div>
                        <p className="text-sm text-slate-900">Baixe a interpretação atual em PDF ou gere um link para compartilhar com sua equipe.</p>
                        <p className="text-sm text-muted-foreground mt-1">A exportação mantém a estrutura do resultado e o conteúdo do edital em um relatório pronto para uso.</p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                        <Button onClick={handleExportPDF} disabled={isExporting || (!agentResult && !canonicalAnalysis)} className="rounded-xl h-12 px-6 text-sm font-semibold">{isExporting ? "Gerando PDF…" : "Exportar PDF"}</Button>
                        <Button size="sm" variant="outline" className="rounded-xl h-12 px-5" onClick={handleShare} disabled={isSharing}>{isSharing ? "Gerando link…" : "Compartilhar"}</Button>
                      </div>
                      <div className="rounded-3xl border border-border bg-slate-50 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Dica</p>
                        <p className="mt-2 text-sm text-slate-900">Use o PDF exportado para arquivar documentos ou compartilhar com parceiros de forma mais profissional.</p>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}
          </section>

          {/* ── Right Sidebar ── */}
          <aside className="space-y-4 lg:sticky lg:top-6">
            <Card className="rounded-3xl border-border/70 bg-card/80 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Clock className="w-4 h-4 text-primary" />
                  Visão rápida
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="rounded-2xl border border-border/60 bg-muted/30 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Agente em foco</p>
                  <p className="mt-1 font-semibold text-foreground">{currentAgentMeta?.name ?? "Assistente"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{currentAgentMeta?.description}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-2xl border border-border/60 bg-background p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Entrada</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{activeTab === "texto" ? "Texto" : activeTab === "url" ? "URL" : "PDF"}</p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Status</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{realStage === "analisando" ? "Analisando" : realStage === "extraindo" ? "Extraindo" : realStage === "concluido" ? "Concluído" : realStage === "parcial" ? "Parcial" : realStage === "falha" ? "Falha" : "Aguardando"}</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background p-3 space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Atalhos</p>
                  <Dialog open={showQuickView} onOpenChange={setShowQuickView}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start rounded-xl"
                        disabled={!canonicalAnalysis}
                      >
                        <Clock className="mr-2 h-4 w-4" />
                        Abrir visão rápida
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Visão rápida</DialogTitle>
                        <DialogDescription>Síntese da análise exibida, a partir do mesmo resultado do resumo, das datas e do checklist.</DialogDescription>
                      </DialogHeader>
                      <div className="mt-2" data-testid="visao-rapida">
                        <QuickViewContent analysis={canonicalAnalysis as never} agentName={currentAgentMeta.name} timeline={timelineSteps} checklistCount={checklistItems.length} />
                      </div>
                      <DialogClose asChild>
                        <Button variant="outline" className="mt-6 w-full rounded-xl">Fechar</Button>
                      </DialogClose>
                    </DialogContent>
                  </Dialog>
                  <Button
                    variant="ghost"
                    className="w-full justify-start rounded-xl"
                    disabled={!text && !agentResult && !urlInput}
                    onClick={() => {
                      resetAnalysis();
                      setText("");
                      setUrlInput("");
                      try {
                        localStorage.removeItem("lupa-documento-pendente-v1"); // documento guardado para depois do cadastro
                      } catch {
                        /* nada */
                      }
                      setPdfStructuredData(null);
                      setPdfError(null);
                      toast({ title: "Entrada limpa", description: "Texto, link e resultado da tela foram limpos. O histórico salvo continua disponível." });
                    }}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Limpar entrada
                  </Button>
                  <p className="px-1 text-[0.75rem] text-muted-foreground">Limpa texto, link e resultado da tela. Não apaga o histórico salvo.</p>
                </div>
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-3">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Use a coluna da esquerda para colar texto, carregar URL ou enviar PDF. O resultado aparece no centro e permanece rastreável no histórico.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-border/70 bg-card/80 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Linha do tempo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  {timelineSteps.length ? `${timelineSteps.length} data(s) encontrada(s) neste edital.` : canonicalAnalysis ? "Nenhuma data encontrada neste edital." : "Aparece depois da análise."}
                </p>
                <Dialog open={showTimelinePopup} onOpenChange={setShowTimelinePopup}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="w-full rounded-xl" disabled={!canonicalAnalysis}>
                      Ver linha do tempo completa
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Datas do edital</DialogTitle>
                      <DialogDescription>Cada data com o trecho do documento de onde ela saiu. Confira sempre no edital oficial.</DialogDescription>
                    </DialogHeader>
                    <div className="mt-4">
                      <DocumentTimeline steps={timelineSteps} />
                    </div>
                    <DialogClose asChild>
                      <Button variant="outline" className="mt-6 w-full rounded-xl">Fechar</Button>
                    </DialogClose>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
