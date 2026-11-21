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

export { normalizeText } from "./matching-text";
import { normalizeText } from "./matching-text";
import { evaluateRequirementText } from "./eligibility";

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
  // Antes: min(100, pontos×10) — saturava com 4 termos. Agora: fração dos pesos do perfil
  // encontrados, com referência entre 9 e 15 pontos (≈3 a 5 termos fortes).
  const possible = FIELD_WEIGHTS.reduce((acc, f) => acc + (profile[f.key] ?? []).length * f.weight, 0);
  const reference = Math.min(15, Math.max(9, possible));
  const score = Math.min(100, Math.round((points / reference) * 100));
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

/** Avalia um requisito (ver eligibility.ts: alternativas, negações, alcance, natureza). */
export function evaluateRequirement(text: string, sourceUrl: string, p: TeacherProfile): EligibilityCheck | null {
  return evaluateRequirementText(text, sourceUrl, p);
}

const TYPE_PATTERNS: Array<[string, RegExp]> = [
  ["bolsa", /\bbolsas?\b/],
  ["evento", /\beventos?\b|\bcongress|\bsimp[oó]sio|\bsemin[aá]rio|\bparticipa[cç][aã]o em eventos/],
  ["publicacao", /\bpublica[cç][aã]o\b|\bpublica[cç][õo]es\b|\bperi[oó]dicos?\b|\blivros?\b/],
  ["inovacao", /\binova[cç][aã]o\b|\bstartups?\b|\bempreendedor|\btecnol[oó]gic[oa] e inova/],
  ["infraestrutura", /\binfraestrutura\b|\bequipamentos?\b|\blaborat[oó]rios?\b/],
  ["formacao", /\bforma[cç][aã]o\b|\bcapacita[cç][aã]o\b|\bcursos?\b/],
  ["extensao", /\bextens[aã]o\b|\bprojetos? de extens/],
  ["hackathon", /\bhackathons?\b|\bmaratona de (programa[cç][aã]o|inova[cç][aã]o)|\bdesafio de inova/],
  ["concurso", /\bconcurso p[uú]blico\b|\bprocesso seletivo\b|\bsele[cç][aã]o p[uú]blica\b|\bconcurso de (provas|t[ií]tulos)/],
  ["auxilio_pesquisa", /\bpesquisa\b|\bprojetos? de pesquisa\b|\bpesquisador/],
];

/** Tipos de oportunidade inferidos do título e do objeto (pode haver mais de um). */
export function inferOpportunityTypes(o: Opportunity): string[] {
  const text = `${o.title} ${o.fields.objeto?.evidence ?? ""}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const plain = `${o.title} ${o.fields.objeto?.evidence ?? ""}`.toLowerCase();
  return TYPE_PATTERNS.filter(([, re]) => re.test(plain) || re.test(text)).map(([t]) => t);
}

export const RECOMMENDATION_RULE_VERSION = 3;

/** Objetivos do perfil progressivo → tipos de oportunidade (interesse, não requisito). */
const OBJECTIVE_TYPES: Record<string, string[]> = {
  bolsas: ["bolsa"],
  pesquisa: ["auxilio_pesquisa"],
  extensao: ["extensao"],
  inovacao: ["inovacao"],
  hackathons: ["hackathon"],
  concursos: ["concurso"],
  formacao: ["formacao"],
  eventos: ["evento"],
};

function editalText(o: Opportunity): string {
  const f = o.fields;
  return normalizeText([o.title, f.objeto?.evidence, f.areas?.evidence, ...(f.elegibilidade ?? []).map((e) => e.evidence), ...(f.requisitos ?? []).map((e) => e.evidence)].filter(Boolean).join(" "));
}

/** Compara preferências SÓ quando o edital traz a informação; caso contrário, diz que não informa. */
export function preferences(profile: TeacherProfile, o: Opportunity): NonNullable<RecommendationResult["interest"]["preferences"]> {
  const t = editalText(o);
  const out: NonNullable<RecommendationResult["interest"]["preferences"]> = [];
  // Modalidade
  const modal = /\b(a distancia|remot[oa]|online|virtual)\b/.test(t) ? (/\bpresencial\b/.test(t) ? "hibrido" : "remoto") : /\bpresencial\b/.test(t) ? "presencial" : /\bhibrid/.test(t) ? "hibrido" : null;
  if (!profile.modalidade) out.push({ campo: "modalidade", situacao: "perfil_nao_informa", motivo: "Você não informou a modalidade preferida." });
  else if (!modal) out.push({ campo: "modalidade", situacao: "edital_nao_informa", motivo: "O edital não informa a modalidade." });
  else
    out.push({
      campo: "modalidade",
      situacao: profile.modalidade === "qualquer" || profile.modalidade === modal || modal === "hibrido" ? "corresponde" : "diverge",
      motivo: `Edital: ${modal}; sua preferência: ${profile.modalidade}.`,
    });
  // Localização (região de atuação); a exigência formal de instituição no DF fica na elegibilidade
  const regionDf = /\b(distrito federal|brasilia)\b|\bdf\b/.test(t);
  if (!profile.localizacao) out.push({ campo: "localizacao", situacao: "perfil_nao_informa", motivo: "Você não informou cidade/UF." });
  else if (!regionDf) out.push({ campo: "localizacao", situacao: "edital_nao_informa", motivo: "O edital não restringe região no texto extraído." });
  else {
    const inDf = /\b(df|distrito federal|brasilia)\b/.test(normalizeText(profile.localizacao));
    out.push({ campo: "localizacao", situacao: inDf ? "corresponde" : "diverge", motivo: inDf ? "O edital é voltado ao DF e você informou estar no DF." : `O edital é voltado ao DF; você informou ${profile.localizacao}.` });
  }
  // Formação em curso (bolsas para estudantes)
  const wantsEnrolled = /\b(matriculad|regularmente inscrit|cursando|estudantes? de (graduacao|mestrado|doutorado))/.test(t);
  if (wantsEnrolled) {
    if (!profile.formacao_situacao) out.push({ campo: "formacao", situacao: "perfil_nao_informa", motivo: "O edital é para quem está cursando; você não informou a situação da formação." });
    else out.push({ campo: "formacao", situacao: profile.formacao_situacao === "em_curso" ? "corresponde" : "diverge", motivo: profile.formacao_situacao === "em_curso" ? "O edital é para quem está cursando, como você informou." : "O edital é para quem está cursando; você informou formação concluída." });
  }
  return out;
}

function interest(profile: TeacherProfile, o: Opportunity): RecommendationResult["interest"] {
  const types = inferOpportunityTypes(o);
  const fromObjectives = (profile.objetivos ?? []).flatMap((x) => OBJECTIVE_TYPES[x] ?? []);
  const wanted = [...new Set([...(profile.opportunity_types ?? []), ...fromObjectives])];
  const opportunity_type =
    wanted.length === 0 || types.length === 0 ? "nao_informado" : types.some((t) => wanted.includes(t)) ? "corresponde" : "nao_corresponde";
  const tokens = new Set(opportunityPassages(o).flatMap((p) => significantTokens(p.text)));
  const temporary_matches = (profile.temporary_interests ?? []).filter((term) => {
    const t = significantTokens(term);
    return t.length > 0 && t.every((x) => tokens.has(x));
  });
  const prefs = preferences(profile, o);
  if (fromObjectives.length) {
    prefs.unshift({
      campo: "objetivos",
      situacao: types.length === 0 ? "edital_nao_informa" : types.some((t) => fromObjectives.includes(t)) ? "corresponde" : "diverge",
      motivo: types.length === 0 ? "Não foi possível identificar o tipo do edital." : `Tipo do edital: ${types.join(", ")}; seus objetivos: ${(profile.objetivos ?? []).join(", ")}.`,
    });
  }
  return { opportunity_type, temporary_matches, preferences: prefs };
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

  // Impedimento só com requisito OBRIGATÓRIO, aplicável e contrariado pelo perfil
  const overall = checks.some((c) => c.state === "nao_atendida" && c.eliminatory !== false)
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
  const divergent = (inter.preferences ?? []).filter((x) => x.situacao === "diverge");
  return {
    rule_version: RECOMMENDATION_RULE_VERSION,
    thematic: them,
    eligibility: { overall, checks },
    interest: inter,
    missing,
    warnings,
    summary: `${themText} ${eligText}${
      inter.opportunity_type === "corresponde" ? " Tipo de oportunidade entre os que você procura." : ""
    }${inter.temporary_matches.length ? ` Relacionado ao seu interesse atual: ${inter.temporary_matches.join(", ")}.` : ""}${
      divergent.length ? ` Diferente das suas preferências (não impede): ${divergent.map((d) => d.campo).join(", ")}.` : ""
    }`,
  };
}
