/**
 * @file lib/lupa/eligibility.ts
 * @description Interpretação DETERMINÍSTICA de requisitos de elegibilidade (sem IA).
 *
 * Antes: bastava a palavra "doutorado" aparecer para concluir "exige doutorado". Assim,
 *   "Podem participar candidatos com mestrado ou doutorado" e
 *   "Não é necessário possuir doutorado"
 * viravam IMPEDIMENTO para quem tem mestrado.
 *
 * Agora cada trecho é dividido em segmentos (frases / ";"), e cada segmento é classificado:
 *   - natureza: obrigatório | desejável | descritivo (dispensa, informação);
 *   - a quem se aplica: candidato (padrão) | coordenador | equipe/membros;
 *   - condições: titulação (com alternativas e mínimo), vínculo, instituição no DF, Lattes.
 * Só vira "não atendida" eliminatória uma condição OBRIGATÓRIA, aplicável à pessoa, com
 * interpretação segura. Quando não há interpretação segura → "pendente de conferência".
 */
import type { EligibilityCheck, EligibilityNature, TeacherProfile } from "./types";
import { normalizeText } from "./matching-text";

export const ELIGIBILITY_RULE_VERSION = 2;

const DEGREE_RANK: Record<string, number> = { graduacao: 1, especializacao: 2, mestrado: 3, doutorado: 4 };
const DEGREE_LABEL: Record<string, string> = { graduacao: "graduação", especializacao: "especialização", mestrado: "mestrado", doutorado: "doutorado" };
const SELF_DECLARED = "Dado autodeclarado no perfil — precisa ser comprovado na submissão.";

type State = EligibilityCheck["state"];
interface Part {
  condicao: string;
  state: State;
  reason: string;
  profile_basis: string | null;
}

/** Divide em segmentos com sujeito próprio (frases e ";"). */
export function splitSegments(text: string): string[] {
  return text
    .split(/(?<=[.;!?])\s+|;\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);
}

const DISPENSA = /\b(nao (e|sera|sao|serao) (necessari|exigid|obrigatori|requerid)|nao se exige|nao ha exigencia|dispensad|independe(nte)? d|sem necessidade d|nao precisa)/;
const DESEJAVEL = /\b(preferencialmente|desejavel|desejaveis|de preferencia|sera (valorizad|considerad|pontuad)|serao (valorizad|considerad|pontuad)|diferencial|pontuacao adicional|bonificacao|recomendavel)/;
const OBRIGATORIO_CUE = /\b(dever[aã]o?|deve|devem|obrigatori|exig|requisit|necessari|somente|apenas|exclusivamente|poder[aã]o? (participar|concorrer|submeter|se inscrever)|podem (participar|concorrer|submeter|se inscrever)|e vedad|nao poder|possuir|ter (o )?titulo|titulo de|titulacao|ser (mestres?|doutor(es)?|portador)|aceit|portador|conclui|minimo|pelo menos)/;
const COORD = /\b(coordenador|coordenadora|coordenacao|proponente responsavel|pesquisador responsavel|responsavel pelo projeto)/;
const EQUIPE = /\b(membros?|integrantes?|equipe|colaboradores?|bolsistas?|demais participantes)\b/;

function nature(seg: string): EligibilityNature {
  if (DISPENSA.test(seg)) return "descritivo";
  if (DESEJAVEL.test(seg)) return "desejavel";
  if (OBRIGATORIO_CUE.test(seg)) return "obrigatorio";
  return "descritivo";
}

function appliesTo(seg: string): "candidato" | "coordenador" | "equipe" {
  if (COORD.test(seg)) return "coordenador";
  if (EQUIPE.test(seg) && !/\b(candidat|proponente|pesquisador(a)?(es)? (que|com))/.test(seg)) return "equipe";
  return "candidato";
}

/** Titulação mencionada no segmento: mínimo exigido, alternativas e situação (concluída/em curso). */
export function degreeRequirement(seg: string): { min: string; alternativas: boolean; emCurso: boolean } | { ambiguo: string } | null {
  const found: string[] = [];
  // "instituição de ensino superior" NÃO é exigência de graduação
  if (/\b(graduad[oa]s?|diploma de graduacao|curso superior complet|nivel superior complet)/.test(seg)) found.push("graduacao");
  if (/\b(especializacao|especialistas?)\b/.test(seg)) found.push("especializacao");
  if (/\b(mestres?|mestras?|mestrados?)\b/.test(seg)) found.push("mestrado");
  if (/\b(doutor|doutores|doutoras?|doutorados?)\b/.test(seg)) found.push("doutorado");
  if (found.length === 0) return null;
  const emCurso = /\b(cursando|matriculad|em curso|em andamento|regularmente inscrit)/.test(seg);
  const alternativas = /\bou\b|\bno minimo\b|\bpelo menos\b|\bou superior\b|\bou equivalente\b|\bminima de\b/.test(seg);
  const uniq = [...new Set(found)].sort((a, b) => DEGREE_RANK[a] - DEGREE_RANK[b]);
  if (uniq.length > 1 && !alternativas) return { ambiguo: `menciona ${uniq.map((d) => DEGREE_LABEL[d]).join(" e ")} sem indicar se é alternativa` };
  return { min: uniq[0], alternativas: uniq.length > 1 || alternativas, emCurso };
}

function evalDegree(seg: string, p: TeacherProfile): Part | null {
  const d = degreeRequirement(seg);
  if (!d) return null;
  if ("ambiguo" in d) return { condicao: "titulação", state: "pendente_comprovacao", reason: `Titulação: o trecho ${d.ambiguo}. Confira no edital.`, profile_basis: null };
  const label = d.alternativas && d.min !== "doutorado" ? `${DEGREE_LABEL[d.min]} (ou superior)` : DEGREE_LABEL[d.min];
  if (d.emCurso) {
    return { condicao: `titulação em curso (${DEGREE_LABEL[d.min]})`, state: "pendente_comprovacao", reason: `Pede ${DEGREE_LABEL[d.min]} em curso; confira a sua situação de matrícula.`, profile_basis: null };
  }
  if (!p.declared_degree) return { condicao: `titulação mínima: ${label}`, state: "pendente_comprovacao", reason: `Pede ${label}; titulação não informada no perfil.`, profile_basis: null };
  const ok = DEGREE_RANK[p.declared_degree] >= DEGREE_RANK[d.min];
  return {
    condicao: `titulação mínima: ${label}`,
    state: ok ? "atendida" : "nao_atendida",
    reason: ok ? `Pede ${label}; o perfil informa ${DEGREE_LABEL[p.declared_degree]}. ${SELF_DECLARED}` : `Pede ${label}; o perfil informa ${DEGREE_LABEL[p.declared_degree]}.`,
    profile_basis: `titulação: ${DEGREE_LABEL[p.declared_degree]} (autodeclarado)`,
  };
}

function evalBond(seg: string, p: TeacherProfile): Part | null {
  if (!/vinculo (empregaticio|funcional|efetivo|institucional|permanente)|servidor (publico )?efetivo|quadro (permanente|efetivo)/.test(seg)) return null;
  const bond = p.declared_bond;
  if (!bond) return { condicao: "vínculo institucional", state: "pendente_comprovacao", reason: "Pede vínculo institucional; vínculo não informado no perfil.", profile_basis: null };
  if (bond === "efetivo") return { condicao: "vínculo institucional", state: "atendida", reason: `Pede vínculo; o perfil informa vínculo efetivo. ${SELF_DECLARED}`, profile_basis: "vínculo: efetivo (autodeclarado)" };
  if (bond === "sem_vinculo") return { condicao: "vínculo institucional", state: "nao_atendida", reason: "Pede vínculo institucional; o perfil informa que não há vínculo.", profile_basis: "vínculo: sem vínculo (autodeclarado)" };
  return { condicao: "vínculo institucional", state: "pendente_comprovacao", reason: `Pede vínculo; o perfil informa vínculo "${bond}". Confira no edital se esse tipo é aceito.`, profile_basis: `vínculo: ${bond} (autodeclarado)` };
}

function evalDf(seg: string, p: TeacherProfile): Part | null {
  if (!/(sediad|localizad|situad)\w*\s+(no|na)\s+(distrito federal|df)\b|instituicao.*\bdf\b/.test(seg)) return null;
  if (!p.institution) return { condicao: "instituição no DF", state: "pendente_comprovacao", reason: "Pede instituição no DF; instituição não informada no perfil.", profile_basis: null };
  const inDf = /\bundf\b|distrito federal|\bdf\b|brasilia|\bunb\b|\bifb\b/.test(normalizeText(p.institution));
  return {
    condicao: "instituição no DF",
    state: inDf ? "atendida" : "pendente_comprovacao",
    reason: inDf ? `Pede instituição no DF; o perfil informa ${p.institution}. ${SELF_DECLARED}` : `Pede instituição no DF; não foi possível confirmar a localização de "${p.institution}".`,
    profile_basis: `instituição: ${p.institution} (autodeclarado)`,
  };
}

function evalLattes(seg: string, p: TeacherProfile): Part | null {
  if (!/\blattes\b/.test(seg)) return null;
  const has = Boolean(p.lattes_id || p.lattes_url);
  return {
    condicao: "currículo Lattes",
    state: has ? "atendida" : "pendente_comprovacao",
    reason: has ? "Pede currículo Lattes; o perfil informa o Lattes. Confira se está atualizado." : "Pede currículo Lattes; informe o identificador ou endereço no perfil.",
    profile_basis: has ? "Lattes informado no perfil" : null,
  };
}

const EVALUATORS = [evalDegree, evalBond, evalDf, evalLattes];

/**
 * Avalia um trecho de requisito contra o perfil. null = nenhuma condição reconhecida.
 * A natureza e o alcance de cada segmento entram na decisão; o trecho original é preservado.
 */
export function evaluateRequirementText(text: string, sourceUrl: string, p: TeacherProfile): EligibilityCheck | null {
  const segments = splitSegments(text);
  const parts: Array<Part & { nature: EligibilityNature; applies_to: string }> = [];
  for (const raw of segments.length ? segments : [text]) {
    const seg = normalizeText(raw);
    const nat = nature(seg);
    const who = appliesTo(seg);
    const found = EVALUATORS.map((fn) => fn(seg, p)).filter((x): x is Part => x !== null);
    if (found.length > 1 && /\bou\b/.test(seg) && !found.every((f) => f.condicao.startsWith("titulação"))) {
      // "doutorado OU vínculo": alternativa entre condições diferentes → sem interpretação segura
      parts.push({ condicao: found.map((f) => f.condicao).join(" ou "), state: "pendente_comprovacao", reason: "O trecho combina condições com “ou”; confira qual vale para você.", profile_basis: null, nature: nat, applies_to: who });
      continue;
    }
    for (const f of found) parts.push({ ...f, nature: nat, applies_to: who });
  }
  if (parts.length === 0) return null;

  // Ajusta pela natureza e pelo alcance: só obrigatório + aplicável pode ser "não atendida"
  const role = p.collaboration_role;
  const adjusted = parts.map((x) => {
    if (x.nature === "descritivo") {
      return { ...x, state: (x.state === "nao_atendida" ? "atendida" : x.state) as State, reason: `Informação, não exigência: ${x.reason.replace(/^Pede/, "o texto menciona")} (o trecho dispensa ou só descreve).` };
    }
    if (x.applies_to === "coordenador" && role !== "coordenar" && role !== "ambos") {
      return { ...x, state: "pendente_comprovacao" as State, reason: `Vale para quem coordena: ${x.reason}${role === "colaborar" ? " Você indicou que quer colaborar; a equipe precisa de alguém que atenda." : " Confira o seu papel no projeto."}` };
    }
    if (x.applies_to === "equipe") {
      return { ...x, state: (x.state === "nao_atendida" ? "pendente_comprovacao" : x.state) as State, reason: `Vale para a equipe: ${x.reason}` };
    }
    if (x.nature === "desejavel" && x.state === "nao_atendida") {
      return { ...x, reason: `Desejável, não obrigatório: ${x.reason} Não impede a participação.` };
    }
    return x;
  });

  const eliminatory = adjusted.filter((x) => x.state === "nao_atendida" && x.nature === "obrigatorio");
  const state: State = eliminatory.length ? "nao_atendida" : adjusted.every((x) => x.state === "atendida") ? "atendida" : adjusted.some((x) => x.state === "nao_atendida" || x.state === "pendente_comprovacao") ? "pendente_comprovacao" : "atendida";
  const nat: EligibilityNature = adjusted.some((x) => x.nature === "obrigatorio") ? "obrigatorio" : adjusted.some((x) => x.nature === "desejavel") ? "desejavel" : "descritivo";
  // Texto para a pessoa: o que IMPEDE primeiro ("Exige…"), depois pendências e o que foi atendido;
  // o aviso de autodeclaração aparece uma vez só.
  const ORDER: Record<State, number> = { nao_atendida: 0, pendente_comprovacao: 1, atendida: 2 } as Record<State, number>;
  const phrased = adjusted.map((x) => ({
    ...x,
    reason: x.state === "nao_atendida" && x.nature === "obrigatorio" ? x.reason.replace(/^Pede /, "Exige ") : x.reason,
  }));
  const selfDeclared = phrased.some((x) => x.reason.includes(SELF_DECLARED));
  const reason =
    phrased.length === 1
      ? phrased[0].reason
      : [...phrased]
          .sort((a, b) => (ORDER[a.state] ?? 3) - (ORDER[b.state] ?? 3))
          .map((x) => x.reason.replace(SELF_DECLARED, "").trim())
          .join(" ")
          .concat(selfDeclared ? ` ${SELF_DECLARED}` : "");
  const basis = adjusted.map((x) => x.profile_basis).filter(Boolean).join("; ") || null;
  return {
    requirement: text,
    evidence: text,
    source_url: sourceUrl,
    state,
    reason,
    profile_basis: basis,
    nature: nat,
    eliminatory: eliminatory.length > 0,
    parts: phrased.map(({ condicao, state: s, reason: r, nature: n, applies_to }) => ({ condicao, state: s, reason: r, nature: n, applies_to })),
  };
}
