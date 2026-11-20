/**
 * @file lib/lupa/matching.ts
 * @description Compatibilidade edital × docente, explicada.
 *
 * CRITÉRIOS (documentados também em docs/compatibilidade.md):
 *
 * 1. Aderência temática (0–100) — NÃO é probabilidade de aprovação.
 *    Cada termo do perfil é procurado no título, objeto, áreas, elegibilidade e
 *    requisitos do edital (sem acentos, sem palavras vazias, singular/plural).
 *    Um termo de várias palavras só conta se todas as palavras significativas aparecerem.
 *    Pesos: áreas 3 · temas de pesquisa 3 · palavras-chave 2 · competências 2.
 *    Índice = min(100, soma dos pesos encontrados × 10).
 *    Faixas: alta ≥ 60 · média ≥ 30 · baixa > 0 · indeterminada (perfil sem termos
 *    ou edital sem texto para comparar).
 *
 * 2. Elegibilidade — avaliada separadamente, requisito a requisito:
 *    - atendida: o dado do perfil cumpre o requisito. Como é autodeclarado/importado,
 *      a explicação sempre diz que precisa ser comprovado na submissão.
 *    - nao_atendida: o dado do perfil contradiz o requisito (eliminatório).
 *    - pendente_comprovacao: falta dado no perfil ou o requisito não é avaliável
 *      automaticamente.
 *    Resultado geral: "impedimento" se houver qualquer nao_atendida, mesmo com alta
 *    aderência temática; "pendente" se houver pendências; senão
 *    "sem_impedimento_conhecido".
 *
 * 3. Interesse do usuário — separado das duas anteriores e sem alterar o índice:
 *    - tipo de oportunidade: o tipo do edital (inferido por palavras do título/objeto,
 *      ex.: "bolsa", "evento") está entre os tipos desejados no perfil?
 *    - interesses temporários do perfil encontrados no edital.
 *
 * 4. Pendências: campos do edital não encontrados e dados do perfil que faltam.
 *
 * O feedback "útil / não útil" é guardado, mas NÃO altera estes critérios.
 */

import type { EligibilityCheck, Opportunity, RecommendationResult, TeacherProfile } from "./types";

const STOPWORDS = new Set(
  "a o as os de da do das dos e em no na nos nas para por com sem um uma uns umas ao aos à às que se ou sua seu suas seus como mais menos entre sobre sob até ate the of and in on for to".split(" "),
);

export function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function stem(token: string): string {
  if (token.length > 5 && token.endsWith("oes")) return token.slice(0, -3) + "ao";
  if (token.length > 5 && token.endsWith("aes")) return token.slice(0, -3) + "ao";
  if (token.length > 4 && token.endsWith("es") && /[rsz]es$/.test(token)) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

export function significantTokens(s: string): string[] {
  return normalizeText(s)
    .split(" ")
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
    .map(stem);
}

const FIELD_WEIGHTS: Array<{ key: "areas" | "research_topics" | "keywords" | "competencies"; label: string; weight: number }> = [
  { key: "areas", label: "área de atuação", weight: 3 },
  { key: "research_topics", label: "tema de pesquisa", weight: 3 },
  { key: "keywords", label: "palavra-chave", weight: 2 },
  { key: "competencies", label: "competência", weight: 2 },
];

interface Passage {
  text: string;
}

function opportunityPassages(o: Opportunity): Passage[] {
  const f = o.fields;
  const out: Passage[] = [{ text: o.title }];
  if (f.objeto) out.push({ text: f.objeto.evidence });
  if (f.areas) out.push({ text: f.areas.evidence });
  for (const e of [...(f.elegibilidade ?? []), ...(f.requisitos ?? [])]) out.push({ text: e.evidence });
  return out;
}

function thematic(profile: TeacherProfile, o: Opportunity): RecommendationResult["thematic"] {
  const passages = opportunityPassages(o).map((p) => ({ ...p, tokens: new Set(significantTokens(p.text)) }));
  const allTokens = new Set(passages.flatMap((p) => [...p.tokens]));
  const matches: RecommendationResult["thematic"]["matches"] = [];
  let points = 0;
  let totalTerms = 0;
  const seen = new Set<string>();
  for (const { key, label, weight } of FIELD_WEIGHTS) {
    for (const term of profile[key] ?? []) {
      totalTerms++;
      const tokens = significantTokens(term);
      const norm = tokens.join(" ");
      if (tokens.length === 0 || seen.has(norm)) continue;
      if (!tokens.every((t) => allTokens.has(t))) continue;
      seen.add(norm);
      const passage = passages.find((p) => tokens.every((t) => p.tokens.has(t))) ?? passages.find((p) => p.tokens.has(tokens[0]));
      matches.push({ term, profile_field: label, evidence: passage?.text ?? o.title });
      points += weight;
    }
  }
  const hasOpportunityText = Boolean(o.fields.objeto || o.fields.areas || o.fields.elegibilidade || o.fields.requisitos);
  if (totalTerms === 0 || (!hasOpportunityText && matches.length === 0)) {
    return { score: 0, level: "indeterminada", matches };
  }
  const score = Math.min(100, points * 10);
  const level = score >= 60 ? "alta" : score >= 30 ? "media" : score > 0 ? "baixa" : "baixa";
  return { score, level, matches };
}

const DEGREE_RANK: Record<string, number> = { graduacao: 1, especializacao: 2, mestrado: 3, doutorado: 4 };
const DEGREE_LABEL: Record<string, string> = {
  graduacao: "graduação",
  especializacao: "especialização",
  mestrado: "mestrado",
  doutorado: "doutorado",
};
const SELF_DECLARED = "Dado autodeclarado no perfil — precisa ser comprovado na submissão.";

function evaluateRequirement(text: string, sourceUrl: string, p: TeacherProfile): EligibilityCheck | null {
  const n = normalizeText(text);
  const base = { requirement: text, evidence: text, source_url: sourceUrl };

  // Titulação mínima
  const needsDoctor = /\b(doutor|doutora|doutorado)\b/.test(n);
  const needsMaster = !needsDoctor && /\b(mestre|mestrado)\b/.test(n);
  if (needsDoctor || needsMaster) {
    const required = needsDoctor ? "doutorado" : "mestrado";
    if (!p.declared_degree) {
      return { ...base, state: "pendente_comprovacao", reason: `Exige ${DEGREE_LABEL[required]}; titulação não informada no perfil.`, profile_basis: null };
    }
    const ok = DEGREE_RANK[p.declared_degree] >= DEGREE_RANK[required];
    return {
      ...base,
      state: ok ? "atendida" : "nao_atendida",
      reason: ok
        ? `Exige ${DEGREE_LABEL[required]}; o perfil informa ${DEGREE_LABEL[p.declared_degree]}. ${SELF_DECLARED}`
        : `Exige ${DEGREE_LABEL[required]}; o perfil informa ${DEGREE_LABEL[p.declared_degree]}.`,
      profile_basis: `titulação: ${DEGREE_LABEL[p.declared_degree]} (autodeclarado)`,
    };
  }

  // Vínculo institucional
  if (/vinculo (empregaticio|funcional|efetivo|institucional|permanente)|servidor (publico )?efetivo|quadro (permanente|efetivo)/.test(n)) {
    const bond = p.declared_bond;
    if (!bond) return { ...base, state: "pendente_comprovacao", reason: "Exige vínculo institucional; vínculo não informado no perfil.", profile_basis: null };
    if (bond === "efetivo") {
      return { ...base, state: "atendida", reason: `Exige vínculo; o perfil informa vínculo efetivo. ${SELF_DECLARED}`, profile_basis: "vínculo: efetivo (autodeclarado)" };
    }
    if (bond === "sem_vinculo") {
      return { ...base, state: "nao_atendida", reason: "Exige vínculo institucional; o perfil informa que não há vínculo.", profile_basis: "vínculo: sem vínculo (autodeclarado)" };
    }
    return {
      ...base,
      state: "pendente_comprovacao",
      reason: `Exige vínculo; o perfil informa vínculo "${bond}". Confira no edital se esse tipo é aceito.`,
      profile_basis: `vínculo: ${bond} (autodeclarado)`,
    };
  }

  // Instituição sediada no DF
  if (/(sediad|localizad|situad)\w*\s+(no|na)\s+(distrito federal|df)\b|instituicao.*\bdf\b/.test(n)) {
    if (!p.institution) return { ...base, state: "pendente_comprovacao", reason: "Exige instituição no DF; instituição não informada no perfil.", profile_basis: null };
    const inst = normalizeText(p.institution);
    const inDf = /\bundf\b|distrito federal|\bdf\b|brasilia|\bunb\b|\bifb\b/.test(inst);
    return {
      ...base,
      state: inDf ? "atendida" : "pendente_comprovacao",
      reason: inDf
        ? `Exige instituição no DF; o perfil informa ${p.institution}. ${SELF_DECLARED}`
        : `Exige instituição no DF; não foi possível confirmar a localização de "${p.institution}".`,
      profile_basis: `instituição: ${p.institution} (autodeclarado)`,
    };
  }

  // Currículo Lattes
  if (/\blattes\b/.test(n)) {
    const has = Boolean(p.lattes_id || p.lattes_url);
    return {
      ...base,
      state: has ? "atendida" : "pendente_comprovacao",
      reason: has ? `Exige currículo Lattes; o perfil informa o Lattes. Confira se está atualizado.` : "Exige currículo Lattes; informe o identificador ou endereço no perfil.",
      profile_basis: has ? "Lattes informado no perfil" : null,
    };
  }
  return null;
}

const TYPE_PATTERNS: Array<[string, RegExp]> = [
  ["bolsa", /\bbolsas?\b/],
  ["evento", /\beventos?\b|\bcongress|\bsimp[oó]sio|\bsemin[aá]rio|\bparticipa[cç][aã]o em eventos/],
  ["publicacao", /\bpublica[cç][aã]o\b|\bpublica[cç][õo]es\b|\bperi[oó]dicos?\b|\blivros?\b/],
  ["inovacao", /\binova[cç][aã]o\b|\bstartups?\b|\bempreendedor|\btecnol[oó]gic[oa] e inova/],
  ["infraestrutura", /\binfraestrutura\b|\bequipamentos?\b|\blaborat[oó]rios?\b/],
  ["formacao", /\bforma[cç][aã]o\b|\bcapacita[cç][aã]o\b|\bcursos?\b/],
  ["auxilio_pesquisa", /\bpesquisa\b|\bprojetos? de pesquisa\b|\bpesquisador/],
];

/** Tipos de oportunidade inferidos do título e do objeto (pode haver mais de um). */
export function inferOpportunityTypes(o: Opportunity): string[] {
  const text = `${o.title} ${o.fields.objeto?.evidence ?? ""}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const plain = `${o.title} ${o.fields.objeto?.evidence ?? ""}`.toLowerCase();
  return TYPE_PATTERNS.filter(([, re]) => re.test(plain) || re.test(text)).map(([t]) => t);
}

function interest(profile: TeacherProfile, o: Opportunity): RecommendationResult["interest"] {
  const types = inferOpportunityTypes(o);
  const wanted = profile.opportunity_types ?? [];
  const opportunity_type =
    wanted.length === 0 || types.length === 0 ? "nao_informado" : types.some((t) => wanted.includes(t)) ? "corresponde" : "nao_corresponde";
  const tokens = new Set(opportunityPassages(o).flatMap((p) => significantTokens(p.text)));
  const temporary_matches = (profile.temporary_interests ?? []).filter((term) => {
    const t = significantTokens(term);
    return t.length > 0 && t.every((x) => tokens.has(x));
  });
  return { opportunity_type, temporary_matches };
}

const STATUS_WARNING: Partial<Record<Opportunity["status"], string>> = {
  encerrada: "Prazo de submissão encerrado segundo a fonte.",
  suspensa: "Edital suspenso segundo a fonte oficial.",
  cancelada: "Edital cancelado segundo a fonte oficial.",
  desconhecida: "Situação do prazo não confirmada na fonte.",
};

export function computeRecommendation(profile: TeacherProfile, o: Opportunity): RecommendationResult {
  const them = thematic(profile, o);
  const inter = interest(profile, o);
  const requirementTexts = [...(o.fields.elegibilidade ?? []), ...(o.fields.requisitos ?? [])];
  const checks: EligibilityCheck[] = [];
  const seen = new Set<string>();
  for (const r of requirementTexts) {
    if (seen.has(r.evidence)) continue;
    seen.add(r.evidence);
    const c = evaluateRequirement(r.evidence, r.source_url, profile);
    if (c) checks.push(c);
    else checks.push({
      requirement: r.evidence,
      evidence: r.evidence,
      source_url: r.source_url,
      state: "pendente_comprovacao",
      reason: "Requisito não avaliado automaticamente — confira no documento oficial.",
      profile_basis: null,
    });
  }

  const missing: string[] = [];
  for (const f of o.missing_fields) missing.push(`Edital: ${f.replace(/_/g, " ")} não encontrado — pendente de verificação.`);
  if (!o.fields.elegibilidade && !o.fields.requisitos) missing.push("Edital: nenhum critério de elegibilidade identificado — confira o documento oficial.");
  const termCount = profile.areas.length + profile.research_topics.length + profile.keywords.length + profile.competencies.length;
  if (termCount === 0) missing.push("Perfil: informe áreas, temas ou palavras-chave para calcular a aderência temática.");
  if (!profile.declared_degree) missing.push("Perfil: titulação não informada.");
  if (!profile.declared_bond) missing.push("Perfil: vínculo institucional não informado.");

  const overall = checks.some((c) => c.state === "nao_atendida")
    ? "impedimento"
    : checks.length === 0 || checks.some((c) => c.state === "pendente_comprovacao")
      ? "pendente"
      : "sem_impedimento_conhecido";

  const warnings: string[] = [];
  if (overall === "impedimento" && (them.level === "alta" || them.level === "media")) {
    warnings.push("Aderência temática " + them.level + ", mas há requisito eliminatório não atendido. Confira antes de investir na proposta.");
  }
  if (STATUS_WARNING[o.status]) warnings.push(STATUS_WARNING[o.status] as string);
  if ((profile.opportunity_types ?? []).length === 0) missing.push("Perfil: tipos de oportunidade desejados não informados.");

  const themText =
    them.level === "indeterminada"
      ? "Aderência temática indeterminada."
      : `Aderência temática ${them.level} (${them.score}/100) por ${them.matches.length} termo(s) do seu perfil.`;
  const eligText =
    overall === "impedimento"
      ? "Há requisito eliminatório não atendido."
      : overall === "pendente"
        ? "Elegibilidade com pendências de comprovação."
        : "Nenhum impedimento identificado nos requisitos extraídos.";
  return {
    thematic: them,
    eligibility: { overall, checks },
    interest: inter,
    missing,
    warnings,
    summary: `${themText} ${eligText}${
      inter.opportunity_type === "corresponde" ? " Tipo de oportunidade entre os que você procura." : ""
    }${inter.temporary_matches.length ? ` Relacionado ao seu interesse atual: ${inter.temporary_matches.join(", ")}.` : ""}`,
  };
}
