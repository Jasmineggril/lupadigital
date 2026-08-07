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
    items?: Array<{ doc: string; obrigatorio?: boolean; observacao?: string; checked?: boolean }>;
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
};

export type TimelineStep = {
  title: string;
  date: string;
  description: string;
};

export type ChecklistItemSummary = {
  label: string;
  done: boolean;
  hint: string;
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

export function buildTimelineSteps(
  canonical: CanonicalAnalysisLike | null | undefined,
  agentResult?: { type?: string; timeline?: Array<{ fase: string; periodo: string; descricao: string; status?: string }> | null } | null,
): TimelineStep[] {
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

  const deadline = resolveText(canonical?.interpretation?.deadlines);
  const summary = resolveText(canonical?.interpretation?.summary);
  if (deadline) {
    return [{
      title: "Prazo principal",
      date: deadline,
      description: summary || "Prazo destacado pela interpretação do edital.",
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
    return canonicalItems.map((item) => ({
      label: resolveText(item.doc) || "Documento não identificado",
      done: Boolean(item.checked),
      hint: resolveText(item.observacao) || "Documento listado na interpretação do edital.",
    }));
  }

  if (agentResult?.type === "documentacao" && Array.isArray(agentResult.checklist)) {
    return agentResult.checklist.map((item) => ({
      label: resolveText(item.doc) || "Documento não identificado",
      done: Boolean(item.checked),
      hint: resolveText(item.observacao) || "Documento listado no resultado da IA.",
    }));
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
  const audience = resolveText(canonical?.interpretation?.targetAudience);
  const deadlines = resolveText(canonical?.interpretation?.deadlines);
  const docs = getDocumentSummary(canonical);
  const registration = resolveText(canonical?.interpretation?.registrationLocation);
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

export function buildChatSuggestions(
  canonical: CanonicalAnalysisLike | null | undefined,
  timelineSteps: TimelineStep[],
  checklistItems: ChecklistItemSummary[],
): string[] {
  const suggestions = [
    "Qual é o prazo principal?",
    "Quais documentos preciso enviar?",
    "Explique este edital em linguagem simples",
    "Meu perfil parece elegível?",
    "Qual é o cronograma completo?",
  ];

  if (canonical?.documento?.orgao) {
    suggestions.unshift("Qual órgão publicou este edital?");
  }

  if (timelineSteps.some((step) => step.date !== "A confirmar")) {
    suggestions.push("Quais datas precisam de atenção?");
  }

  if (checklistItems.some((item) => item.done)) {
    suggestions.push("Quais documentos já foram detectados?");
  }

  return suggestions.slice(0, 6);
}
