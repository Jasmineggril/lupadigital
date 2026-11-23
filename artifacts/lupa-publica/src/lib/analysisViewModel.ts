type CanonicalAnalysisLike = {
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
    items?: Array<{ fase: string; periodo: string; descricao: string; status?: string }>;
  };
  checklist?: {
    items?: Array<ChecklistItemLike>;
  };
  elegibilidade?: {
    score?: number;
    criteria?: Array<{ criterio: string; atende?: boolean | "parcial" | null; observacao?: string }>;
    recommendation?: string;
    nextSteps?: string[];
  };
  documentosExigidos?: {
    items?: string[];
    summary?: string;
  };
  documento?: {
    orgao?: string;
  };
  alertas?: Array<string | { descricao?: string }>;
  /** Base documental comum (servidor): igual para todos os agentes, com trechos */
  base?: DocumentBase;
  /** Fatos conferidos no texto (servidor, lib/analysisFacts.ts) */
  fatos?: AnalysisFacts;
};

type ChecklistItemLike = {
  doc?: string;
  obrigatorio?: boolean;
  observacao?: string;
  checked?: boolean;
  origem?: "edital" | "sugestao" | "desconhecido";
  evidencia?: string | null;
  condicao?: ItemCondition;
  nao_confirmado?: string[];
  conferir?: boolean;
  motivo?: string | null;
};

export type ItemCondition = "obrigatorio" | "listado" | "opcional" | "alternativa" | "com_dispensa" | "nao_informado";

export interface AnalysisFacts {
  versao: number;
  documento_hash: string;
  prazo_inscricao: { iso: string; hora: string | null; fuso: string | null; texto: string; evidencia: string; prorrogado: boolean; fases: string[]; situacao: "aberta" | "encerrada"; origem: "edital" } | null;
  prazo_ia: string | null;
  conflitos: Array<{ campo: string; documento: string; ia: string; evidencia: string | null; mensagem: string }>;
  exigencias: Array<{ texto: string; texto_ia: string; origem: "edital" | "sugestao" | "desconhecido"; evidencia: string | null; nao_confirmado: string[]; condicao: ItemCondition; conferir: boolean; motivo: string | null }>;
  campos: Array<{ campo: string; rotulo: string; estado: "encontrado" | "parcial" | "incerto" | "nao_localizado"; fonte: "documento" | "ia" | "nenhuma"; evidencia: string | null; observacao: string }>;
  qualificadores_sem_respaldo: string[];
}

export interface DocumentBase {
  versao: number;
  documento_hash: string;
  caracteres: number;
  objeto: { texto: string; evidencia: string } | null;
  datas: Array<{ rotulo: string; iso: string | null; texto: string; evidencia: string }>;
  valores: Array<{ texto: string; evidencia: string }>;
  documentos: Array<{ texto: string; evidencia: string }>;
  requisitos: Array<{ texto: string; evidencia: string }>;
  restricoes: Array<{ texto: string; evidencia: string }>;
  criterios: Array<{ texto: string; evidencia: string }>;
  obrigacoes?: Array<{ texto: string; evidencia: string }>;
  desclassificacao?: Array<{ texto: string; evidencia: string }>;
  canal_inscricao: Array<{ texto: string; evidencia: string }>;
  ausentes: string[];
  elegibilidade_perfil: Array<{ requisito: string; evidencia: string; estado: "atendido" | "nao_atendido" | "pendente"; motivo: string; base_perfil: string | null }> | null;
}

export function formatIsoDate(iso: string | null | undefined) {
  if (!iso) return "data não informada";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export type TimelineStep = {
  title: string;
  date: string;
  description: string;
  /** Trecho do documento que sustenta a data (quando vem da base documental) */
  evidence?: string;
  iso?: string | null;
};

export type ChecklistItemSummary = {
  label: string;
  done: boolean;
  hint: string;
  evidence?: string;
  /** edital = trecho localizado; desconhecido = sem trecho (pode ser sugestão da IA) */
  origin?: "edital" | "sugestao" | "desconhecido";
  /** O que o trecho diz sobre a obrigatoriedade */
  condition?: ItemCondition;
  /** Detalhes que a IA acrescentou e o edital não traz */
  unconfirmed?: string[];
  check?: boolean;
  /** Orientação prática (não é exigência do edital) */
  guidance?: string;
};

export type EligibilitySummary = {
  criterion: string;
  status: "atende" | "parcial" | "indefinido" | "nao-atende";
  explanation: string;
};

export type FaqItem = {
  question: string;
  answer: string;
};

function resolveText(value?: string | null) {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return "";
}

function resolveList(values?: string[] | null) {
  return Array.isArray(values) ? values.filter(Boolean) : [];
}

function mapEligibilityStatus(value?: boolean | "parcial" | null) {
  if (value === true) return "atende";
  if (value === "parcial") return "parcial";
  if (value === false) return "nao-atende";
  return "indefinido";
}

function getDocumentSummary(canonical: CanonicalAnalysisLike | null | undefined) {
  const docs = resolveList(canonical?.documentosExigidos?.items);
  const requirements = resolveList(canonical?.interpretation?.requirements);
  if (docs.length > 0) return docs;
  if (requirements.length > 0) return requirements;
  return [];
}

// ── Resolvedor único de fatos ───────────────────────────────────────────────
// Toda ferramenta (resumo, cronograma, chat, FAQ, visão rápida, exportação) lê prazo,
// documentos e pendências DAQUI. Antes, o chat lia `interpretation.deadlines` ("Prazo não
// informado") enquanto o cronograma lia as datas do documento (20/12/2026).

const PLACEHOLDER_RE = /n[ãa]o\s+(foi\s+)?(informad|encontrad|identificad|localizad|especificad|mencionad|explicitad|definid|indicad|declarad|consta|h[áa]\s+(prazo|data))|sem\s+(prazo|data|informa)|a\s+confirmar|indefinid|desconhecid|^\s*[-–—]?\s*$|^\s*([\wÀ-ú-]+\s+){0,3}(conforme|segundo)\s+(o\s+)?edital\.?\s*$/i;

export function isPlaceholderText(value: unknown): boolean {
  return typeof value !== "string" || PLACEHOLDER_RE.test(value.trim());
}

export type ResolvedDeadline = {
  /** Texto para mostrar ("20/12/2026" ou o que a IA disse, quando não há data no documento) */
  text: string;
  iso: string | null;
  evidence: string | null;
  /** documento = trecho do edital; ia = só a IA citou, sem trecho localizado */
  source: "documento" | "ia";
  conflict: string | null;
};

export type MissingField = { label: string; state: "nao_localizado" | "incerto" | "parcial"; note: string };

export type ResolvedFacts = {
  deadline: ResolvedDeadline | null;
  conflicts: string[];
  documents: ChecklistItemSummary[];
  missing: MissingField[];
  unsupportedQualifiers: string[];
  /** Quem pode participar / como se inscrever: texto da IA ou, se for marcador genérico, o trecho do edital */
  audience: string;
  registration: string;
};

const LEGACY_FIELD_OK: Record<string, (b: DocumentBase) => boolean> = {
  "documentos exigidos": (b) => b.documentos.length > 0,
  "datas e prazos": (b) => b.datas.length > 0,
  requisitos: (b) => b.requisitos.length > 0,
  valores: (b) => b.valores.length > 0,
  "critérios de avaliação": (b) => b.criterios.length > 0,
  "canal de inscrição": (b) => b.canal_inscricao.length > 0,
};

export function resolveAnalysisFacts(canonical: CanonicalAnalysisLike | null | undefined): ResolvedFacts {
  const fatos = canonical?.fatos;
  const base = canonical?.base;
  const conflicts = (fatos?.conflitos ?? []).map((c) => c.mensagem);

  // Prazo: fatos do servidor → datas da base (análises salvas antes dos fatos) → IA (identificada)
  let deadline: ResolvedDeadline | null = null;
  if (fatos?.prazo_inscricao) {
    const p = fatos.prazo_inscricao;
    deadline = { text: p.texto, iso: p.iso, evidence: p.evidencia, source: "documento", conflict: conflicts[0] ?? null };
  } else {
    const fromBase = [...(base?.datas ?? [])].filter((d) => d.rotulo === "inscrições" && d.iso).pop();
    if (fromBase) deadline = { text: formatIsoDate(fromBase.iso), iso: fromBase.iso, evidence: fromBase.evidencia, source: "documento", conflict: null };
    else {
      const ai = resolveText(canonical?.interpretation?.deadlines);
      if (ai && !isPlaceholderText(ai)) deadline = { text: ai, iso: null, evidence: null, source: "ia", conflict: null };
    }
  }

  // Pendências: estados conciliados no servidor; para análises antigas, concilia com a própria base
  let missing: MissingField[];
  if (fatos?.campos?.length) {
    missing = fatos.campos
      .filter((c) => c.estado !== "encontrado")
      .map((c) => ({ label: c.rotulo, state: c.estado as MissingField["state"], note: c.observacao }));
  } else {
    missing = (base?.ausentes ?? [])
      .filter((label) => !(base && LEGACY_FIELD_OK[label]?.(base)))
      .filter((label) => !(label === "público elegível" && (base?.requisitos.length ?? 0) > 0))
      .map((label) => ({ label, state: "nao_localizado" as const, note: "Não localizado automaticamente no texto. Confira o documento completo." }));
  }

  return {
    deadline,
    conflicts,
    documents: buildChecklistItems(canonical, null),
    missing,
    unsupportedQualifiers: fatos?.qualificadores_sem_respaldo ?? [],
    audience: pickText(canonical?.interpretation?.targetAudience, base?.requisitos[0]?.evidencia),
    registration: pickText(canonical?.interpretation?.registrationLocation, base?.canal_inscricao[0]?.evidencia),
  };
}

/** Texto da análise, a menos que seja marcador genérico — aí o trecho do edital (análises salvas antes dos fatos). */
function pickText(ai: string | undefined, evidence: string | undefined): string {
  const value = resolveText(ai);
  if (value && !isPlaceholderText(value)) return value;
  if (evidence) return `Conforme o edital: ${evidence.replace(/^\s*\d+(\.\d+)*\.?\s*/, "")}`;
  return "";
}

/** "20/12/2026 (trecho do edital)" ou "… (segundo a IA; não localizado no texto)". */
export function describeDeadline(d: ResolvedDeadline | null): string {
  if (!d) return "O prazo de inscrição não foi localizado no texto do documento. Confira no edital oficial.";
  const base = d.source === "documento" ? `Inscrições até ${d.text}, conforme o trecho do edital: "${(d.evidence ?? "").slice(0, 220)}"` : `${d.text} (segundo a IA; a data não foi localizada no texto do documento — confira)`;
  return d.conflict ? `${base}. Atenção: ${d.conflict}` : base;
}

const CONDITION_TEXT: Record<ItemCondition, string> = {
  obrigatorio: "Obrigatório segundo o edital.",
  listado: "Listado no edital.",
  opcional: "Opcional segundo o edital.",
  alternativa: "O edital aceita alternativas.",
  com_dispensa: "O edital prevê dispensa em alguns casos.",
  nao_informado: "Citado no edital.",
};

function summarizeItem(item: ChecklistItemLike, fallbackHint: string): ChecklistItemSummary {
  const label = resolveText(item.doc) || "Documento não identificado";
  const guidance = resolveText(item.observacao);
  if (!item.origem) {
    return { label, done: Boolean(item.checked), hint: guidance || fallbackHint };
  }
  const hint =
    item.origem === "edital"
      ? [CONDITION_TEXT[item.condicao ?? "nao_informado"], item.motivo ?? ""].filter(Boolean).join(" ")
      : item.motivo || "Não localizado no texto do edital. Pode ser sugestão da IA: confira no documento oficial.";
  return {
    label,
    done: Boolean(item.checked),
    hint,
    evidence: item.evidencia ?? undefined,
    origin: item.origem,
    condition: item.condicao,
    unconfirmed: item.nao_confirmado ?? [],
    check: Boolean(item.conferir),
    guidance: guidance || undefined,
  };
}

export function buildTimelineSteps(
  canonical: CanonicalAnalysisLike | null | undefined,
  agentResult?: { type?: string; timeline?: Array<{ fase: string; periodo: string; descricao: string; status?: string }> | null } | null,
): TimelineStep[] {
  // 1º: datas extraídas do próprio documento — iguais para qualquer agente
  const baseDates = canonical?.base?.datas ?? [];
  if (baseDates.length > 0) {
    return baseDates.map((d) => ({
      title: d.rotulo.charAt(0).toUpperCase() + d.rotulo.slice(1),
      date: formatIsoDate(d.iso),
      description: d.texto,
      evidence: d.evidencia,
      iso: d.iso,
    }));
  }
  const canonicalItems = canonical?.cronograma?.items ?? [];
  if (canonicalItems.length > 0) {
    return canonicalItems.map((item) => ({
      title: resolveText(item.fase) || "Etapa",
      date: resolveText(item.periodo) || "A confirmar",
      description: resolveText(item.descricao) || "Detalhe da etapa ainda não informado.",
    }));
  }

  if (agentResult?.type === "acompanhamento" && Array.isArray(agentResult.timeline)) {
    return agentResult.timeline.map((item) => ({
      title: resolveText(item.fase) || "Etapa",
      date: resolveText(item.periodo) || "A confirmar",
      description: resolveText(item.descricao) || "Detalhe da etapa ainda não informado.",
    }));
  }

  const resolved = resolveAnalysisFacts(canonical).deadline;
  const summary = resolveText(canonical?.interpretation?.summary);
  if (resolved) {
    return [{
      title: "Prazo de inscrição",
      date: resolved.text,
      description: resolved.source === "documento" ? "Prazo localizado no texto do edital." : "Prazo indicado pela IA; a data não foi localizada no texto do documento.",
      evidence: resolved.evidence ?? undefined,
      iso: resolved.iso,
    }];
  }

  if (summary) {
    return [{
      title: "Resumo do edital",
      date: "A confirmar",
      description: summary,
    }];
  }

  return [];
}

export function buildChecklistItems(
  canonical: CanonicalAnalysisLike | null | undefined,
  agentResult?: { type?: string; checklist?: Array<{ doc?: string; obrigatorio?: boolean; observacao?: string; checked?: boolean }> | null } | null,
): ChecklistItemSummary[] {
  const canonicalItems = canonical?.checklist?.items ?? [];
  if (canonicalItems.length > 0) {
    return canonicalItems.map((item) => summarizeItem(item, "Documento listado na interpretação do edital."));
  }

  if (agentResult?.type === "documentacao" && Array.isArray(agentResult.checklist)) {
    return agentResult.checklist.map((item) => summarizeItem(item as ChecklistItemLike, "Documento listado no resultado da IA."));
  }

  const baseDocs = canonical?.base?.documentos ?? [];
  if (baseDocs.length > 0) {
    return baseDocs.map((d) => ({ label: d.texto, done: false, hint: "Identificado no texto do edital.", evidence: d.evidencia, origin: "edital" as const }));
  }

  const docs = getDocumentSummary(canonical);
  if (docs.length > 0) {
    return docs.map((doc) => ({
      label: doc,
      done: false,
      hint: "Documento identificado no edital.",
    }));
  }

  return [];
}

export function buildEligibilitySummary(
  canonical: CanonicalAnalysisLike | null | undefined,
  agentResult?: { type?: string; criterios?: Array<{ criterio?: string; atende?: boolean | "parcial" | null; observacao?: string }> | null } | null,
): EligibilitySummary[] {
  const canonicalItems = canonical?.elegibilidade?.criteria ?? [];
  if (canonicalItems.length > 0) {
    return canonicalItems.map((item) => ({
      criterion: resolveText(item.criterio) || "Critério de elegibilidade",
      status: mapEligibilityStatus(item.atende),
      explanation: resolveText(item.observacao) || "Critério interpretado a partir do edital.",
    }));
  }

  if (agentResult?.type === "elegibilidade" && Array.isArray(agentResult.criterios)) {
    return agentResult.criterios.map((item) => ({
      criterion: resolveText(item.criterio) || "Critério de elegibilidade",
      status: mapEligibilityStatus(item.atende),
      explanation: resolveText(item.observacao) || "Critério interpretado a partir do edital.",
    }));
  }

  const recommendation = resolveText(canonical?.elegibilidade?.recommendation);
  const summary = resolveText(canonical?.interpretation?.summary);
  if (recommendation || summary) {
    return [{
      criterion: "Visão geral de elegibilidade",
      status: "indefinido",
      explanation: recommendation || summary,
    }];
  }

  return [];
}

export function buildFaqItems(
  canonical: CanonicalAnalysisLike | null | undefined,
): FaqItem[] {
  const facts = resolveAnalysisFacts(canonical);
  const audience = facts.audience;
  const deadlines = facts.deadline || facts.conflicts.length ? describeDeadline(facts.deadline) : "";
  const docs = facts.documents.length ? facts.documents.map(documentLine) : getDocumentSummary(canonical);
  const registration = facts.registration;
  const recommendation = resolveText(canonical?.elegibilidade?.recommendation);

  const items: FaqItem[] = [];

  if (audience) {
    items.push({ question: "Quem pode participar deste edital?", answer: audience });
  }

  if (deadlines) {
    items.push({ question: "Quais são os prazos mais importantes?", answer: deadlines });
  }

  if (docs.length > 0) {
    items.push({ question: "Quais documentos preciso separar?", answer: docs.join("; ") });
  }

  if (registration) {
    items.push({ question: "Como faço a inscrição?", answer: registration });
  }

  if (recommendation) {
    items.push({ question: "Meu perfil atende a este edital?", answer: recommendation });
  }

  if (items.length === 0) {
    const summary = resolveText(canonical?.interpretation?.summary);
    if (summary) {
      items.push({ question: "Resumo do edital", answer: summary });
    }
  }

  return items;
}

/** "Comprovante de matrícula" ou "RG e CPF (não localizado no edital — confira)". */
export function documentLine(d: ChecklistItemSummary): string {
  if (d.origin === "desconhecido") return `${d.label} (não localizado no edital — confira)`;
  if (d.unconfirmed?.length) return `${d.label} (o edital não menciona ${d.unconfirmed.join(", ")})`;
  if (d.condition === "opcional") return `${d.label} (opcional)`;
  return d.label;
}

export function buildChatSuggestions(
  canonical: CanonicalAnalysisLike | null | undefined,
  timelineSteps: TimelineStep[],
  checklistItems: ChecklistItemSummary[],
): string[] {
  // As sugestões que dependem do documento vêm antes das genéricas (antes, o corte em 6 as descartava)
  const specific: string[] = [];
  if (canonical?.documento?.orgao) specific.push("Qual órgão publicou este edital?");
  if (timelineSteps.some((step) => step.date !== "A confirmar")) specific.push("Quais datas precisam de atenção?");
  if (checklistItems.some((item) => item.done)) specific.push("Quais documentos já foram detectados?");
  const suggestions = [
    ...specific,
    "Qual é o prazo principal?",
    "Quais documentos preciso enviar?",
    "Explique este edital em linguagem simples",
    "Meu perfil parece elegível?",
    "Qual é o cronograma completo?",
  ];

  return suggestions.slice(0, 6);
}
