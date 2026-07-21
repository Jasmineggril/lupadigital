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
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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
} from "lucide-react";
import {
  AGENTS,
  runAgent,
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
import { extractTextFromPdf, type PdfStructuredData } from "@/lib/pdf";
import { checkSupabaseConnection, isSupabaseConfigured } from "@/lib/supabase";
import {
  salvarAnalise,
  atualizarAnalise,
  listarAnalises,
  excluirAnalise,
  limparAnalises,
  type AnaliseSalva,
} from "@/services/analisesService";

function getFriendlyErrorMessage(error: unknown) {
  const normalize = (value: string) => value.toLowerCase();

  const render = (message: string) => {
    const normalized = normalize(message);
    if (normalized.includes("minimo") || normalized.includes("20 caracteres")) {
      return "Insira um texto com pelo menos 20 caracteres para continuar.";
    }
    if (normalized.includes("texto pesquisável") || normalized.includes("ocr") || normalized.includes("pdf")) {
      return "O PDF não possui texto pesquisável. Utilize OCR ou outro arquivo.";
    }
    if (normalized.includes("documento vazio") || normalized.includes("sem texto") || normalized.includes("texto do documento")) {
      return "Não foi possível localizar texto no documento.";
    }
    if (normalized.includes("ultrapassa o limite") || normalized.includes("processado em partes")) {
      return "O documento ultrapassa o limite da análise. Ele precisa ser processado em partes.";
    }
    if (normalized.includes("rate_limit") || normalized.includes("sobrecarregada") || normalized.includes("limite tempor\u00e1rio")) {
      return "O limite temporário de análises foi atingido. Aguarde e tente novamente.";
    }
    if (normalized.includes("temporariamente indispon") || normalized.includes("provider unavailable") || normalized.includes("serviço de ia")) {
      return "O serviço de IA está temporariamente indisponível.";
    }
    if (normalized.includes("timeout") || normalized.includes("demorou mais") || normalized.includes("etimedout")) {
      return "A análise demorou mais que o esperado. Tente novamente.";
    }
    if (normalized.includes("resposta incompleta") || normalized.includes("schema") || normalized.includes("json") || normalized.includes("validation")) {
      return "A IA retornou uma resposta incompleta. A análise não foi salva.";
    }
    if (normalized.includes("banco") || normalized.includes("history") || normalized.includes("salvar")) {
      return "A interpretação foi concluída, mas não foi possível salvá-la no histórico.";
    }
    if (normalized.includes("url")) {
      return "Não foi possível acessar a URL informada. Verifique se ela é pública e tente novamente.";
    }
    if (normalized.includes("network") || normalized.includes("fetch")) {
      return "A conexão com o serviço de interpretação falhou. Tente novamente em instantes.";
    }
    if (normalized.includes("nenhuma chave") || normalized.includes("api key") || normalized.includes("not configured")) {
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

const ANALYSIS_STAGES: AnalysisStage[] = [
  "reading",
  "extracting",
  "requirements",
  "summary",
  "finalizing",
];

function getAnalysisStageMeta(stage: AnalysisStage) {
  switch (stage) {
    case "reading":
      return {
        title: "Lendo o edital",
        description: "Estamos interpretando o conteúdo principal e a estrutura do documento.",
      };
    case "extracting":
      return {
        title: "Extraindo detalhes",
        description: "Os pontos mais relevantes do edital estão sendo identificados.",
      };
    case "requirements":
      return {
        title: "Validando requisitos",
        description: "Estamos mapeando obrigações, prazos e critérios de elegibilidade.",
      };
    case "summary":
      return {
        title: "Montando síntese",
        description: "A resposta final está sendo organizada para leitura rápida.",
      };
    case "finalizing":
      return {
        title: "Finalizando interpretação",
        description: "Ajustando a apresentação e os próximos passos para você.",
      };
    case "completed":
      return {
        title: "Interpretação concluída",
        description: "O resultado já está pronto para revisar e compartilhar.",
      };
    case "error":
      return {
        title: "Não foi possível concluir",
        description: "Houve um problema ao processar o edital. Tente novamente.",
      };
    default:
      return {
        title: "Pronto para começar",
        description: "Envie o edital para iniciar a interpretação.",
      };
  }
}

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

function highlightDifficultTerms(text: string) {
  const parts = text.split(/(\s+)/);
  return parts.map((part, index) => {
    if (!part.trim()) return <span key={index}>{part}</span>;
    const cleaned = part.replace(/[^\p{L}\p{N}]/gu, "");
    const isDifficult =
      cleaned.length > 7 ||
      /^(inscrição|habilitação|homologação|impugnação|recurso|interposição|documentação|cadastro|requisito|benefício)$/i.test(
        cleaned,
      );
    return (
      <span
        key={index}
        className={
          isDifficult
            ? "rounded-md bg-amber-100 px-1.5 py-0.5 text-amber-800 font-medium"
            : ""
        }
      >
        {part}
      </span>
    );
  });
}

function getComplexityProfile(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const words = normalized.split(" ").filter(Boolean);
  const longWords = words.filter((word) => word.length > 7).length;
  const longWordRatio = words.length ? longWords / words.length : 0;
  const hasDates =
    /\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\b\d{1,2}\s+de\s+[a-záéíóúâêîôûãõ]+\s+de\s+\d{4}\b/i.test(
      normalized,
    );
  const hasRequirements =
    /(requisito|documento|inscrição|prazo|benefício|cadastro|habilitação|homologação)/i.test(
      normalized,
    );

  const score = Math.min(
    100,
    Math.round(
      25 +
        longWordRatio * 45 +
        (hasDates ? 18 : 0) +
        (hasRequirements ? 20 : 0) +
        (normalized.length > 800 ? 15 : normalized.length > 300 ? 8 : 0),
    ),
  );
  const level = score >= 70 ? "Difícil" : score >= 45 ? "Médio" : "Fácil";
  const tone =
    score >= 70
      ? {
          label: "Alta complexidade",
          badge: "bg-rose-100 text-rose-700",
          bar: "bg-rose-500",
        }
      : score >= 45
        ? {
            label: "Complexidade moderada",
            badge: "bg-amber-100 text-amber-700",
            bar: "bg-amber-500",
          }
        : {
            label: "Baixa complexidade",
            badge: "bg-emerald-100 text-emerald-700",
            bar: "bg-emerald-500",
          };

  return {
    score,
    level,
    tone,
    description:
      score >= 70
        ? "O edital apresenta linguagem técnica e muitos critérios, o que pode dificultar a compreensão inicial."
        : score >= 45
          ? "O texto tem estrutura razoável, mas ainda exige atenção em alguns pontos."
          : "O edital é relativamente claro e direto para leitura inicial.",
  };
}

function buildTimelineSteps(text: string) {
  const matches =
    text.match(
      /\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b|\b\d{1,2}\s+de\s+[a-záéíóúâêîôûãõ]+\s+de\s+\d{4}\b/gi,
    ) ?? [];
  const dates = Array.from(new Set(matches)).slice(0, 4);
    return [
    {
      title: "Publicação",
      date: dates[0] ?? "A confirmar",
      description: "Momento em que o edital foi disponibilizado.",
    },
    {
      title: "Inscrições",
      date: dates[1] ?? "A confirmar",
      description: "Período para participação e envio da documentação.",
    },
    {
      title: "Resultado",
      date: dates[2] ?? "A confirmar",
      description: "Divulgação da interpretação das inscrições.",
    },
    {
      title: "Convocação",
      date: dates[3] ?? "A confirmar",
      description: "Etapa final para confirmação e abertura do processo.",
    },
  ];
}

function buildChecklist(text: string) {
  const normalized = text.toLowerCase();
  return [
    {
      label: "Ler o edital",
      done: normalized.length > 120,
      hint: "Entender a proposta e as regras principais.",
    },
    {
      label: "Verificar requisitos",
      done: /(requisito|documento|inscrição|prazo)/i.test(normalized),
      hint: "Confirmar se o seu perfil atende.",
    },
    {
      label: "Separar documentos",
      done: /(documento|comprovante|certidão|currículo|histórico)/i.test(
        normalized,
      ),
      hint: "Organizar a documentação exigida.",
    },
    {
      label: "Fazer inscrição",
      done: /(inscrição|inscreva|submeter)/i.test(normalized),
      hint: "Realizar o procedimento dentro do prazo.",
    },
    {
      label: "Acompanhar resultado",
      done: /(resultado|convocação|homologação|recurso)/i.test(normalized),
      hint: "Monitorar as próximas etapas.",
    },
  ];
}

function computeTextIndicators(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const words = normalized.split(" ").filter(Boolean);
  const sentences = normalized
    .split(/[.!?]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const wordCount = words.length;
  const sentenceCount = Math.max(sentences.length, 1);
  const avgWords = wordCount / sentenceCount;
  const longWords = words.filter((word) => word.length > 7).length;
  const longWordRatio = wordCount ? longWords / wordCount : 0;

  const clarity = Math.round(
    Math.max(20, Math.min(100, 110 - avgWords * 3 - longWordRatio * 35)),
  );
  const complexity = Math.round(
    Math.max(0, Math.min(100, avgWords * 4 + longWordRatio * 40)),
  );
  const transparency = Math.round(
    Math.max(
      20,
      Math.min(
        100,
        20 +
          (/(prazo|inscrição|inscrições|site|portal|www\.|http|valor|benefício|documento|requisito)/i.test(
            normalized,
          )
            ? 30
            : 0) +
          (/(órgão|secretaria|ministério|fundação|universidade|instituto|autarquia)/i.test(
            normalized,
          )
            ? 20
            : 0),
      ),
    ),
  );
  const accessibility = Math.round(
    Math.max(
      20,
      Math.min(100, 100 - longWordRatio * 25 - Math.max(0, avgWords - 14) * 2),
    ),
  );
  const legibility = Math.round(
    Math.max(20, Math.min(100, 120 - avgWords * 2 - longWordRatio * 25)),
  );

  return {
    clareza: clarity,
    complexidade: complexity,
    transparencia: transparency,
    acessibilidade: accessibility,
    legibilidade: legibility,
  };
}

function buildEditalFAQ(result: AgentResult | null) {
  if (!result) return [];

  const getDocuments = () => {
    if (result.type === "documentacao")
      return result.checklist.map((item) => item.doc).join("; ");
    if (result.type === "analista") return result.documentos.join("; ");
    return "Verifique os documentos listados no edital e no resumo de interpretação.";
  };

  const getPrazos = () => {
    if (result.type === "acompanhamento")
      return result.timeline
        .map((item) => `${item.fase}: ${item.periodo}`)
        .join(" • ");
    return (
      (result as { prazo?: string }).prazo ??
      "Não foi possível identificar o prazo com precisão."
    );
  };

  const getInscricao = () => {
    if (result.type === "simples") return result.ondeInscrever;
    if (result.type === "analista")
      return "Consulte o portal oficial do órgão responsável pelo edital e siga as instruções de inscrição.";
    return "Confira a seção de inscrição do edital e os canais oficiais indicados.";
  };

  const getElegibilidade = () => {
    if (result.type === "elegibilidade") return result.recomendacao;
    return "Use o agente Lupa Elegibilidade para comparar seu perfil ao edital e verificar se atende aos critérios.";
  };

  return [
    {
      question: "Quem pode participar deste edital?",
      answer:
        (result as { publicoAlvo?: string }).publicoAlvo ??
        "O edital define o público-alvo no texto original; leia a seção de elegibilidade para confirmar.",
    },
    {
      question: "Quais são os prazos mais importantes?",
      answer: getPrazos(),
    },
    {
      question: "Quais documentos preciso separar?",
      answer: getDocuments(),
    },
    {
      question: "Como faço a inscrição?",
      answer: getInscricao(),
    },
    {
      question: "Meu perfil atende a este edital?",
      answer: getElegibilidade(),
    },
  ];
}

function normalizePublicUrl(value: string) {
  const trimmed = value.trim().replace(/^["'<>\s]+|["'<>\s]+$/g, "");
  if (!trimmed) return null;

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(candidate).toString();
  } catch {
    return null;
  }
}

function getPrimaryDeadline(text: string, result: AgentResult | null) {
  if (result?.type === "simples") return result.prazo;
  if (result?.type === "analista") return result.prazo;

  const match = text.match(/\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b|\b\d{1,2}\s+de\s+[a-záéíóúâêîôûãõ]+\s+de\s+\d{4}\b/gi);
  return match?.[0] ?? "Não identificado no texto";
}

function getDocumentSummary(result: AgentResult | null, checklistItems: ReturnType<typeof buildChecklist>, pdfStructuredData: PdfStructuredData | null) {
  if (result?.type === "documentacao") {
    return result.checklist.length > 0
      ? `${result.checklist.length} documentos detectados. Principais: ${result.checklist.slice(0, 4).map((item) => item.doc).join(", ")}.`
      : "Nenhum documento foi identificado automaticamente.";
  }

  if (pdfStructuredData?.requisitos.length) {
    return `${pdfStructuredData.requisitos.length} requisitos identificados no PDF. Principais: ${pdfStructuredData.requisitos.slice(0, 3).join(", ")}.`;
  }

  return checklistItems.some((item) => item.done)
    ? `${checklistItems.filter((item) => item.done).length} sinais de documentação e prazo foram detectados automaticamente.`
    : "Use o texto completo do edital para extrair documentos e requisitos.";
}

function buildEditalFaqs(text: string, result: AgentResult | null, timelineSteps: ReturnType<typeof buildTimelineSteps>, checklistItems: ReturnType<typeof buildChecklist>, pdfStructuredData: PdfStructuredData | null) {
  const deadline = getPrimaryDeadline(text, result);
  const docs = getDocumentSummary(result, checklistItems, pdfStructuredData);
  const simplified = result ? getSimplifiedText(result) : "";
  const simplifiedText = simplified || pdfStructuredData?.resumo || "Ainda não há uma síntese automática disponível.";
  const eligibility = result?.type === "elegibilidade"
    ? `A aderência estimada é de ${result.score}%. ${result.recomendacao}`
    : "Abra a aba de elegibilidade para simular aderência com base no seu perfil.";

  return [
    {
      question: "Qual é o prazo principal deste edital?",
      answer: deadline,
    },
    {
      question: "Quais documentos devo separar?",
      answer: docs,
    },
    {
      question: "Como este edital fica em linguagem simples?",
      answer: simplifiedText,
    },
    {
      question: "Meu perfil parece elegível?",
      answer: eligibility,
    },
    {
      question: "Qual é o cronograma identificado?",
      answer: timelineSteps.map((step) => `${step.title}: ${step.date}`).join(" | "),
    },
  ];
}

function answerContextualQuestion(question: string, result: AgentResult) {
  const text = question.trim().toLowerCase();

  const match = (terms: string[]) => terms.some((term) => text.includes(term));

  if (match(["prazo", "data", "inscrição", "encerramento"])) {
    if (result.type === "acompanhamento") {
      return `Cronograma: ${result.timeline.map((item) => `${item.fase} - ${item.periodo}`).join("; ")}`;
    }
    return `Prazo identificado: ${(result as { prazo?: string }).prazo ?? "não informado"}`;
  }

  if (match(["documento", "comprovante", "checklist", "papel"])) {
    if (result.type === "documentacao") {
      return `Documentos identificados: ${result.checklist.map((item) => item.doc).join("; ")}`;
    }
    if (result.type === "analista") {
      return `Documentos destacados: ${result.documentos.join("; ")}`;
    }
    return "Os documentos necessários aparecem no resumo de interpretação e no checklist extraído do edital.";
  }

  if (match(["público", "participar", "quem", "perfil", "elegibilidade"])) {
    if ((result as { publicoAlvo?: string }).publicoAlvo) {
      return `Público-alvo: ${(result as { publicoAlvo?: string }).publicoAlvo}`;
    }
    if (result.type === "elegibilidade") {
      return result.recomendacao;
    }
    return "Consulte a seção de público-alvo no resultado da interpretação ou use Lupa Elegibilidade para um diagnóstico mais preciso.";
  }

  if (match(["inscrever", "onde", "portal", "site", "link"])) {
    if (result.type === "simples") {
      return `Inscrição: ${result.ondeInscrever}`;
    }
    return "Verifique o local de inscrição indicado no edital ou na seção de interpretação principal.";
  }

  if (match(["resumo", "simplifica", "linguagem simples"])) {
    return (
      getSimplifiedText(result) ||
      "Resumo simplificado não disponível no momento."
    );
  }

  return `Com base na interpretação atual: ${getSimplifiedText(result) || "não há informação suficiente para responder com precisão."}`;
}

function getContextualAnswer(question: string, text: string, result: AgentResult | null, timelineSteps: ReturnType<typeof buildTimelineSteps>, checklistItems: ReturnType<typeof buildChecklist>, pdfStructuredData: PdfStructuredData | null, profile: UserProfile) {
  const normalized = question.toLowerCase();
  const deadline = getPrimaryDeadline(text, result);
  const docs = getDocumentSummary(result, checklistItems, pdfStructuredData);

  if (/resumo|simples|linguagem simples|explicar/i.test(normalized)) {
    return (result ? getSimplifiedText(result) : "") || pdfStructuredData?.resumo || "Ainda não tenho uma síntese automática deste edital.";
  }

  if (/prazo|data|inscri/i.test(normalized)) {
    return `O prazo principal identificado é: ${deadline}. ${result?.type === "acompanhamento" ? result.observacao : "Confirme sempre a data no edital oficial antes de se inscrever."}`;
  }

  if (/document|anexo|arquivo|comprov/i.test(normalized)) {
    return `${docs} Leia a seção de documentos do edital original para validar a lista final.`;
  }

  if (/cronograma|timeline|fase|etapa/i.test(normalized)) {
    return timelineSteps.map((step) => `${step.title}: ${step.date}`).join("\n");
  }

  if (/elegibil|perfil|aderênc|atendo/i.test(normalized)) {
    if (result?.type === "elegibilidade") {
      return `Seu score de aderência é ${result.score}%. ${result.recomendacao} Próximos passos: ${result.proximosPassos.join(" ")}`;
    }

    return `Para avaliar elegibilidade, use o agente Lupa Elegibilidade e informe escolaridade, atuação, município e renda familiar. Perfil atual registrado: escolaridade ${profile.escolaridade}, atuação ${profile.atuacao || "não informada"}, município ${profile.municipio || "não informado"}.`;
  }

  if (/valor|benef[ií]cio|bolsa|recurso|financi/i.test(normalized)) {
    if (result?.type === "analista") {
      return `O valor ou benefício identificado é: ${result.valor}.`;
    }

    return pdfStructuredData?.indicadores && "data" in pdfStructuredData.indicadores
      ? `Os indicadores extraídos sugerem atenção ao benefício/prazo. ${pdfStructuredData.prazo}`
      : "Não identifiquei um valor explícito no texto enviado.";
  }

  if (/risco|aten[iç]ão|ponto|vantagem/i.test(normalized) && result?.type === "estrategica") {
    return `${result.oportunidade} Pontos de atenção: ${result.pontosAtencao.join("; ")}. Riscos: ${result.riscos.join("; ")}.`;
  }

  return `Posso ajudar com prazo, documentos, elegibilidade, cronograma e resumo simples. Se quiser, pergunte algo mais específico sobre o edital que você enviou.`;
}

function buildChatSuggestions(text: string, result: AgentResult | null, timelineSteps: ReturnType<typeof buildTimelineSteps>, checklistItems: ReturnType<typeof buildChecklist>, pdfStructuredData: PdfStructuredData | null) {
  const suggestions = [
    "Qual é o prazo principal?",
    "Quais documentos preciso enviar?",
    "Explique este edital em linguagem simples",
    "Meu perfil parece elegível?",
    "Qual é o cronograma completo?",
  ];

  if (result?.type === "analista") {
    suggestions.unshift("Qual é a instituição responsável?");
  }

  if (pdfStructuredData?.requisitos.length) {
    suggestions.splice(2, 0, "Quais requisitos o PDF destaca?");
  }

  if (timelineSteps.some((step) => step.date !== "A confirmar")) {
    suggestions.push("Quais datas precisam de atenção?");
  }

  if (checklistItems.some((item) => item.done)) {
    suggestions.push("Quais documentos já foram detectados?");
  }

  return suggestions.slice(0, 5);
}

// ── PDF export ───────────────────────────────────────────────────
async function exportToPDF(result: AgentResult, title: string) {
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
      const status =
        criterio.atende === true
          ? "Atende"
          : criterio.atende === "parcial"
            ? "Parcial"
            : "Não atende";
      writeCard(`${index + 1}. ${criterio.criterio}`, status, theme.accent);
      writeText(criterio.observacao, 10, { color: [71, 85, 105] });
      cursorY += 1;
    });
    writeSectionTitle("Próximos passos", theme.accent);
    writeBullets(result.proximosPassos, theme.accent);
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
            className="h-full rounded-full transition-all duration-1000"
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
              className={`relative text-left p-3 rounded-xl border transition-all duration-200 group ${
                isSelected
                  ? `${agent.color} border-transparent shadow-md ring-2 ring-offset-1 ${agent.borderColor.replace("border-", "ring-")}`
                  : "bg-card border-border/70 hover:border-primary/30 hover:shadow-sm"
              }`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 transition-all ${
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
            className="w-full text-xs rounded-lg border border-teal-300 bg-white px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-teal-400"
          >
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
            placeholder="Ex: Estudante de Pedagogia, Agricultor..."
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
              className="w-full text-xs rounded-lg border border-teal-300 bg-white px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-teal-400"
            >
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
                className="bg-rose-500 h-2 rounded-full transition-all"
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
                  className={`${barColor} h-3 rounded-full transition-all`}
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
}: {
  onSelect: (item: SavedEdital) => void;
  onSelectAgent: (item: AgentResultRecord) => void;
  onSelectSupabase: (item: AnaliseSalva) => void;
  onClose: () => void;
}) {
  const { data: agentHistory, isLoading: agentLoading } = useListAgentHistory();
  const { data: legacyHistory, isLoading: legacyLoading } =
    useListEditalHistory();
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

    const agentItems: UnifiedItem[] = (agentHistory ?? [])
      .filter(
        (item: AgentResultRecord) => matchDate(item.createdAt) && matches(item),
      )
      .map((data: AgentResultRecord) => ({ kind: "agent", data }));

    const legacyItems: UnifiedItem[] = (legacyHistory ?? [])
      .filter((item: SavedEdital) => matchDate(item.createdAt) && matches(item))
      .map((data: SavedEdital) => ({ kind: "legacy", data }));

    const supabaseItemsUnified: UnifiedItem[] = supabaseItems
      .filter((item) => matchDate(item.created_at) && matches(item))
      .map((data) => ({ kind: "supabase", data }));

    return [...agentItems, ...legacyItems, ...supabaseItemsUnified].sort(
      (a, b) => parseDate(b.data) - parseDate(a.data),
    );
  }, [agentHistory, legacyHistory, supabaseItems, search, dateFilter]);

  const handleDeleteAgent = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
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
                  ? "Carregando..."
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
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpar
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div className="px-4 pt-4 pb-3 space-y-3 border-b border-border/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar por título..."
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
                className={`text-xs px-3 py-1 rounded-full border transition-all ${dateFilter === f ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
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
          {unified.map((item) => {
            if (item.kind === "agent") {
              const badge = AGENT_BADGE[item.data.agentId] ?? {
                label: item.data.agentId,
                color: "bg-muted text-muted-foreground",
              };
              return (
                <button
                  key={`agent-${item.data.id}`}
                  onClick={() => onSelectAgent(item.data)}
                  className="w-full text-left p-4 rounded-xl border bg-card hover:bg-accent/5 hover:border-primary/20 transition-all group"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.color}`}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-sm font-medium truncate pr-2">
                        {item.data.title}
                      </p>
                      <p className="text-xs text-muted-foreground/60 mt-1.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(item.data.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/10"
                        onClick={(e) => handleDeleteAgent(item.data.id, e)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                    </div>
                  </div>
                </button>
              );
            }
            if (item.kind === "supabase") {
              return (
                <div
                  key={`supabase-${item.data.id}`}
                  className="w-full p-4 rounded-xl border bg-card hover:bg-accent/5 transition-all group"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          Supabase
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
                        Visualizar
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10"
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
              <button
                key={`legacy-${item.data.id}`}
                onClick={() => onSelect(item.data)}
                className="w-full text-left p-4 rounded-xl border bg-card hover:bg-accent/5 hover:border-primary/20 transition-all group"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        Simples (legado)
                      </span>
                    </div>
                    <p className="text-sm font-medium truncate pr-2">
                      {item.data.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {item.data.resumo}
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-1.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(item.data.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/10"
                      onClick={(e) => handleDeleteLegacy(item.data.id, e)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                  </div>
                </div>
              </button>
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
  const [agentResult, setAgentResult] = useState<AgentResult | null>(null);
  const [checklistState, setChecklistState] = useState<ChecklistItem[]>([]);
  const [profile, setProfile] = useState<UserProfile>({
    escolaridade: "superior",
    atuacao: "",
    municipio: "",
    rendaFamiliar: "1a3",
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
  const [answerHistory, setAnswerHistory] = useState<
    { question: string; answer: string }[]
  >([]);
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
    message: "Verificando Supabase...",
  });

  const printRef = useRef<HTMLDivElement | null>(null);
  const [location] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
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

  useEffect(() => {
    if (!analyzeEditalMutation.isPending) {
      if (analysisStage === "reading" || analysisStage === "extracting" || analysisStage === "requirements" || analysisStage === "summary" || analysisStage === "finalizing") {
        setAnalysisStage("idle");
      }
      return;
    }

    const timer = window.setInterval(() => {
      setAnalysisStage((current) => {
        const currentIndex = ANALYSIS_STAGES.indexOf(current);
        const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % ANALYSIS_STAGES.length : 0;
        return ANALYSIS_STAGES[nextIndex];
      });
    }, 900);

    return () => window.clearInterval(timer);
  }, [analyzeEditalMutation.isPending, analysisStage]);

  useEffect(() => {
    if (!text.trim() || agentResult) return;
    setSelectedAgent(resolveAutoAgent(text, profile));
  }, [text, profile, agentResult]);

  const currentAgentMeta = AGENTS.find((a) => a.id === selectedAgent)!;
  const assistantIdentity = {
    name: "Assistente LUPA Digital",
    description: "Especialista em análise inteligente de documentos.",
    color: currentAgentMeta.color,
    textColor: currentAgentMeta.textColor,
    iconName: currentAgentMeta.iconName,
  };
  const isAnalyzing = analyzeEditalMutation.isPending;
  const analyzeButtonLabel = "Analisar Documento";
  const complexityProfile = useMemo(() => getComplexityProfile(text), [text]);
  const timelineSteps = useMemo(() => buildTimelineSteps(text), [text]);
  const checklistItems = useMemo(() => buildChecklist(text), [text]);
  const faqItems = useMemo(() => buildEditalFAQ(agentResult), [agentResult]);

  const applyResult = (result: AgentResult) => {
    setAgentResult(result);
    if (result.type === "documentacao") setChecklistState(result.checklist);
  };

  const buildAnalysisPayload = (
    result: AgentResult | null,
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
          return JSON.stringify(result);
        })()
      : "Interpretação concluída.";

    const indicators = result
      ? {
          tipo: result.type,
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

  const persistCurrentAnalysis = async (result: AgentResult | null, agentIdOverride: AgentId = selectedAgent) => {
    try {
      const payload = buildAnalysisPayload(result, isFavorite, agentIdOverride);
      let saved;
      if (currentSavedId) {
        payload.id = currentSavedId;
        saved = await atualizarAnalise(payload);
      } else {
        saved = await salvarAnalise(payload);
      }
      setSavedThisResult(Boolean(saved));
      setCurrentSavedId(saved?.id ?? null);
      setIsFavorite(Boolean(saved?.favorito));

      if (user) {
        try {
          await saveAgentResultMutation.mutateAsync({
            data: {
              agentId: agentIdOverride,
              title: payload.titulo ?? `Interpretação ${AGENTS.find((a) => a.id === agentIdOverride)?.name ?? currentAgentMeta.name}`,
              originalText: payload.conteudo_original ?? text,
              resultJson: (result
                ? { ...result }
                : { type: selectedAgent }) as Record<string, unknown>,
            },
          });
          queryClient.invalidateQueries({
            queryKey: getListAgentHistoryQueryKey(),
          });
        } catch {
          // Fallback local persistence already applied above.
        }
      }
      return saved;
    } catch {
      return null;
    }
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

    const agentIdToUse = resolveAutoAgent(text, profile);
    setSelectedAgent(agentIdToUse);
    setIsAnalyzePressed(true);
    setAnalysisError(null);
    setAnalysisStage("reading");
    setAgentResult(null);
    setSavedThisResult(false);

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
          const result = data as unknown as AgentResult;
          applyResult(result);
          setAnalysisStage("completed");
          await persistCurrentAnalysis(result, agentIdToUse);
          toast({
            title: "Interpretação concluída",
            description:
              user
                ? "A interpretação foi salva no histórico e está pronta para revisão."
                : "A interpretação está pronta para revisão.",
          });
        },
        onError: (error) => {
          setIsAnalyzePressed(false);
          setAnalysisStage("error");
          setAnalysisError(getFriendlyErrorMessage(error));
          toast({
            title: "Erro na interpretação",
            description: getFriendlyErrorMessage(error),
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleToggleFavorite = async () => {
    if (!agentResult) {
      toast({
        title: "Sem interpretação ativa",
        description: "Execute uma interpretação antes de favoritar.",
        variant: "destructive",
      });
      return;
    }

    const nextFavorite = !isFavorite;
    setIsFavorite(nextFavorite);

    if (currentSavedId) {
      try {
        const payload = buildAnalysisPayload(agentResult, nextFavorite);
        payload.id = currentSavedId;
        const updated = await atualizarAnalise(payload);
        setCurrentSavedId(updated.id ?? currentSavedId);
        setIsFavorite(Boolean(updated.favorito));
        toast({
          title: nextFavorite ? "Favorito adicionado" : "Favorito removido",
          description: "O histórico foi atualizado.",
        });
      } catch {
        setIsFavorite(!nextFavorite);
        toast({
          title: "Erro",
          description: "Não foi possível atualizar o favorito.",
          variant: "destructive",
        });
      }
    } else {
      toast({
        title: nextFavorite ? "Favorito marcado" : "Favorito desmarcado",
        description: "Salve a interpretação para persistir este favorito.",
      });
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
      return next;
    });
  };

  const handlePdfUpload = async (file: File) => {
    setIsPdfLoading(true);
    setPdfError(null);
    setPdfStructuredData(null);
    try {
      const { text: extracted, structured } = await extractTextFromPdf(file);
      if (!extracted?.trim())
        throw new Error("Nenhum texto legível encontrado no PDF.");
      setText(extracted.trim());
      setPdfStructuredData(structured);
      setActiveTab("pdf");
      setAgentResult(null);
      setAnalysisError(null);
      setShareToken(null);
      setShowShareLink(false);
      toast({
        title: "PDF processado com sucesso.",
        description: "O texto legível foi extraído e está pronto para interpretação.",
      });
    } catch (err) {
      setPdfStructuredData(null);
      setAnalysisError(getFriendlyErrorMessage(err));
      setPdfError(
        err instanceof Error
          ? err.message
          : "Não foi possível extrair o texto deste PDF.",
      );
      toast({
        title: "Não foi possível extrair o texto deste PDF.",
        description:
          "Verifique se o arquivo contém texto legível e tente novamente.",
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
          setText(data.text);
          setActiveTab("texto");
          setAgentResult(null);
          setAnalysisError(null);
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

  const handleAgentHistorySelect = (item: AgentResultRecord) => {
    setText(item.originalText);
    setSelectedAgent(item.agentId as AgentId);
    const parsed = item.resultJson as unknown as AgentResult;
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
    setIsSharing(true);
    try {
      const title =
          agentResult.type === "simples"
            ? ((agentResult as { resumo?: string }).resumo?.slice(0, 60) ??
              "Edital")
            : "Interpretação de Edital";
      const res = await fetch(`${BASE}/api/edital/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agentResult.type,
          title,
          resultJson: agentResult,
        }),
      });
      if (!res.ok) throw new Error();
      const { token } = (await res.json()) as { token: string };
      setShareToken(token);
      setShowShareLink(true);
      setShareOptionsOpen(true);
      return token;
    } catch {
      toast({
        title: "Erro",
        description: "Não foi possível gerar o link.",
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
    if (!agentResult || !question.trim()) return;
    const q = question.trim();
    setIsAnswering(true);
    setQuestion("");

    const API = ((import.meta.env.BASE_URL as string) || "/").replace(/\/$/, "") + "/api";

    try {
      // Monta contexto com o texto do edital + resultado atual da análise
      const ctx = [
        text ? `TEXTO DO EDITAL (trecho):\n${text.slice(0, 4000)}` : "",
        `INTERPRETAÇÃO ATUAL (${agentResult.type}):\n${JSON.stringify(agentResult, null, 2).slice(0, 2000)}`,
      ].filter(Boolean).join("\n\n");

      const res = await fetch(`${API}/niasci/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: q }],
          context: ctx,
        }),
      });

      const data = await res.json().catch(() => ({}));

      // Se o limite diário foi atingido, mostra mensagem amigável
      if (res.status === 429) {
        setAnswerHistory((prev) =>
          [{ question: q, answer: data.error ?? "Limite de uso atingido. Tente novamente mais tarde." }, ...prev].slice(0, 5),
        );
        return;
      }

      const answer = data.reply ?? data.error ?? "Não consegui responder. Tente novamente.";
      setAnswerHistory((prev) =>
        [{ question: q, answer }, ...prev].slice(0, 5),
      );
    } catch {
      setAnswerHistory((prev) =>
        [{ question: q, answer: "Erro ao consultar a IA. Verifique sua conexão e tente novamente." }, ...prev].slice(0, 5),
      );
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
        .catch(() => {});
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
    if (!agentResult || !text.trim()) return;
    try {
      const saved = await persistCurrentAnalysis(agentResult);
      setSavedThisResult(Boolean(saved));
      setCurrentSavedId(saved?.id ?? null);
      setIsFavorite(Boolean(saved?.favorito));
      toast({
        title: "Interpretação salva!",
        description: "Disponível no Histórico de Interpretações.",
      });
    } catch {
      toast({
        title: "Erro",
        description: "Não foi possível salvar a interpretação.",
        variant: "destructive",
      });
    }
  };

  const handleExportPDF = async () => {
    if (!agentResult) return;
    setIsExporting(true);
    try {
      await exportToPDF(
        agentResult,
        `lupa-${agentResult.type}-${currentAgentMeta.name}`,
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

      <main className="container mx-auto px-4 py-8 max-w-7xl flex-1">
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
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

            {/* Profile form for Elegibilidade */}
            {selectedAgent === "elegibilidade" && (
              <ProfileForm profile={profile} onChange={setProfile} />
            )}

            {/* Text / URL / PDF input */}
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
                    placeholder="Cole aqui o texto do edital que deseja interpretar..."
                    className="min-h-[280px] resize-y text-sm leading-relaxed p-4 rounded-2xl border-border/60 bg-card/80 shadow-sm focus-visible:ring-primary/30 focus-visible:border-primary/40 font-[inherit] tracking-normal"
                    style={{ fontFamily: "inherit", whiteSpace: "pre-wrap", overflowWrap: "break-word" }}
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      setAgentResult(null);
                      setAnalysisError(null);
                      setShareToken(null);
                      setShowShareLink(false);
                      setShareOptionsOpen(false);
                      setIsAnalyzePressed(false);
                    }}
                    disabled={isAnalyzing}
                    data-testid="input-edital-text"
                  />
                  {text && !isAnalyzing && (
                    <button
                      type="button"
                      onClick={() => { setText(""); setAgentResult(null); setAnalysisError(null); }}
                      className="absolute top-2.5 right-2.5 rounded-lg p-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                      title="Limpar texto"
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
                          placeholder="https://exemplo.gov.br/edital..."
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
                              Extraindo texto do PDF...
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
                    {"Interpretando..."}
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
            {analysisError && !isAnalyzing && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">Não foi possível concluir a interpretação</p>
                    <p className="mt-1">{analysisError}</p>
                  </div>
                </div>
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
                    disabled={isExporting}
                  >
                    {isExporting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
                        Gerando PDF...
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
                        Salvando...
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
                        Gerando...
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
          </section>

          {/* ── Right Column: Results ── */}
          <section className="relative min-h-[500px]">
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

            {isAnalyzing && (
              <div className="rounded-3xl border border-border/70 bg-card p-4 shadow-sm space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  <div>
                    <p className="text-sm font-semibold">{currentAgentMeta.name}</p>
                    <p className="text-sm text-muted-foreground">{getAnalysisStageMeta(analysisStage).title}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {ANALYSIS_STAGES.map((stage) => {
                    const active = analysisStage === stage;
                    const passed = ANALYSIS_STAGES.indexOf(analysisStage) > ANALYSIS_STAGES.indexOf(stage);
                    return (
                      <div key={stage} className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${active ? "border-primary/30 bg-primary/5" : passed ? "border-emerald-200 bg-emerald-50/70" : "border-border bg-background"}`}>
                        <span className="font-medium">{getAnalysisStageMeta(stage).title}</span>
                        <span className={`text-xs ${active ? "text-primary" : passed ? "text-emerald-700" : "text-muted-foreground"}`}>
                          {getAnalysisStageMeta(stage).description}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {agentResult && !isAnalyzing && (
              <Tabs defaultValue="resumo" className="w-full">
                <TabsList className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-muted/40 p-1 sm:grid-cols-4 lg:grid-cols-7">
                  <TabsTrigger value="resumo" className="rounded-xl">Interpretação</TabsTrigger>
                  <TabsTrigger value="cronograma" className="rounded-xl">Cronograma</TabsTrigger>
                  <TabsTrigger value="checklist" className="rounded-xl">Checklist</TabsTrigger>
                  <TabsTrigger value="elegibilidade" className="rounded-xl">Elegibilidade</TabsTrigger>
                  <TabsTrigger value="chat" className="rounded-xl">Chat</TabsTrigger>
                  <TabsTrigger value="historico" className="rounded-xl">Histórico</TabsTrigger>
                  <TabsTrigger value="exportacao" className="rounded-xl">Exportação</TabsTrigger>
                </TabsList>

                <TabsContent value="resumo">
                  <div className="rounded-3xl border border-border/70 bg-card p-4 shadow-sm">
                    <AgentResultPanel result={agentResult} onCheckToggle={handleCheckToggle} printRef={printRef} />
                  </div>
                </TabsContent>

                <TabsContent value="cronograma">
                  <Card className="rounded-2xl border-border/70 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2"><CalendarDays className="w-4 h-4 text-primary" /> Cronograma</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {timelineSteps.map((step, index) => (
                        <div key={step.title} className="flex gap-3 rounded-xl bg-background p-2.5">
                          <div className="flex flex-col items-center">
                            <div className={`mt-0.5 h-2.5 w-2.5 rounded-full ${index === 0 ? "bg-primary" : "bg-muted-foreground/40"}`} />
                            {index < timelineSteps.length - 1 && (<div className="mt-1 h-full w-px bg-border" />)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">{step.title}</p>
                            <p className="text-xs text-muted-foreground">{step.date}</p>
                            <p className="text-xs text-muted-foreground/80 mt-0.5">{step.description}</p>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="checklist">
                  <Card className="rounded-2xl border-border/70 shadow-sm">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> Checklist</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      {checklistItems.map((item) => (
                        <div key={item.label} className={`flex items-start gap-2 rounded-xl border p-2.5 ${item.done ? "border-emerald-200 bg-emerald-50/70" : "border-border bg-background"}`}>
                          <div className={`mt-0.5 h-4 w-4 rounded-full ${item.done ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                          <div className="min-w-0">
                            <p className={`text-sm font-medium ${item.done ? "text-emerald-700" : "text-foreground"}`}>{item.label}</p>
                            <p className="text-xs text-muted-foreground">{item.hint}</p>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="elegibilidade">
                  {agentResult.type === "elegibilidade" ? (
                    <Card className="rounded-2xl border-border/70 shadow-sm">
                      <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Elegibilidade</CardTitle></CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {agentResult.criterios.map((c) => (
                            <div key={c.criterio} className={`rounded-xl border p-3 ${c.atende === true ? "bg-teal-50 border-teal-200" : c.atende === "parcial" ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"}`}>
                              <p className="text-sm font-semibold">{c.criterio}</p>
                              <p className="text-xs text-muted-foreground mt-1">{c.observacao}</p>
                              <p className={`text-xs font-semibold mt-2 ${c.atende === true ? "text-teal-700" : c.atende === "parcial" ? "text-amber-700" : "text-red-600"}`}>
                                {c.atende === true ? "🟢 Atende" : c.atende === "parcial" ? "🟡 Atende parcialmente" : "🔴 Não atende"}
                              </p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="text-sm text-muted-foreground">Elegibilidade disponível quando o foco da interpretação for correspondente.</div>
                  )}
                </TabsContent>

                <TabsContent value="chat">
                  <Card className="rounded-2xl border-border/70 shadow-sm">
                    <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Search className="w-4 h-4 text-primary" /> Chat contextual</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-muted-foreground">Faça uma pergunta sobre este edital e obtenha uma resposta baseada na interpretação atual do documento.</p>
                      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                        <Input placeholder="Ex: Qual é o prazo final?" value={question} onChange={(e) => setQuestion(e.target.value)} disabled={isAnswering} />
                        <Button size="sm" className="rounded-xl" onClick={handleAskQuestion} disabled={!question.trim() || isAnswering}>{isAnswering ? "Respondendo..." : "Perguntar sobre o edital"}</Button>
                      </div>
                      {answerHistory.length > 0 && <div className="space-y-3">{answerHistory.map((item, index) => (<div key={`${index}-${item.question}`} className="rounded-2xl border border-border bg-background p-3"><p className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground">Pergunta</p><p className="text-sm font-medium mt-1">{item.question}</p><p className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground mt-3">Resposta</p><p className="text-sm mt-1">{item.answer}</p></div>))}</div>}
                      {faqItems.length > 0 && <div className="grid gap-3 md:grid-cols-2">{faqItems.map((faq) => (<div key={faq.question} className="rounded-2xl border border-border bg-muted/30 p-4"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{faq.question}</p><p className="text-sm mt-2 text-foreground">{faq.answer}</p></div>))}</div>}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="historico">
                  <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold">Histórico</h3>
                      <Button size="sm" variant="outline" onClick={() => setShowHistory(true)} className="rounded-lg">Abrir histórico</Button>
                    </div>
                    <p className="text-sm text-muted-foreground">Acesse interpretações anteriores sem sair do fluxo principal.</p>
                  </div>
                </TabsContent>

                <TabsContent value="exportacao">
                  <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm space-y-3">
                    <Button onClick={handleExportPDF} disabled={isExporting || !agentResult} className="rounded-xl">
                      {isExporting ? "Gerando PDF..." : "Exportar para PDF"}
                    </Button>
                    <p className="text-sm text-muted-foreground">Exporte a interpretação atual em PDF para compartilhar ou arquivar.</p>
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
