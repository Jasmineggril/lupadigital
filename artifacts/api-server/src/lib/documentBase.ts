/**
 * @file lib/documentBase.ts
 * @description Base documental comum de uma análise de edital.
 *
 * Problema que resolve: cada agente de IA devolvia uma estrutura diferente e só o
 * "Acompanhamento" preenchia o cronograma, então a linha do tempo, o checklist e a
 * visão rápida mudavam (ou sumiam) conforme o agente — para o MESMO documento.
 *
 * A base é extraída deterministicamente do próprio texto (mesmo extrator do coletor
 * de editais, lib/lupa/collector/parse.ts) e é IGUAL para todos os agentes:
 *   - datas, valores, documentos, requisitos, restrições, critérios e canal de
 *     inscrição, cada item com o trecho exato do documento (evidência);
 *   - campos não encontrados ficam listados como ausentes (nada é inventado);
 *   - verificação: datas e valores que a IA citou mas NÃO aparecem no texto viram
 *     alerta ("conferir: não encontrado no documento");
 *   - elegibilidade em 3 estados (atendido / não atendido / pendente de comprovação),
 *     comparando requisitos do texto com o perfil docente quando o usuário está logado.
 *
 * Determinística e barata: calculada a cada resposta, fora do cache da IA.
 */

import { createHash } from "node:crypto";
import { extractFields, type ParsedPage } from "./lupa/collector/parse";
import { evaluateRequirement } from "./lupa/matching";
import type { EligibilityState, TeacherProfile } from "./lupa/types";

export const DOCUMENT_BASE_VERSION = 1;

export interface BaseItem {
  texto: string;
  /** Trecho literal do documento que sustenta o item */
  evidencia: string;
}

export interface BaseDate extends BaseItem {
  rotulo: string;
  /** Data em ISO (AAAA-MM-DD), quando o texto traz uma data completa */
  iso: string | null;
}

export interface BaseEligibilityItem {
  requisito: string;
  evidencia: string;
  estado: "atendido" | "nao_atendido" | "pendente";
  motivo: string;
  /** Dado do perfil usado (sempre autodeclarado; nunca comprova sozinho) */
  base_perfil: string | null;
}

export interface DocumentBase {
  versao: number;
  /** Hash do texto analisado: liga a análise ao documento exato */
  documento_hash: string;
  caracteres: number;
  objeto: BaseItem | null;
  datas: BaseDate[];
  valores: BaseItem[];
  documentos: BaseItem[];
  requisitos: BaseItem[];
  restricoes: BaseItem[];
  criterios: BaseItem[];
  canal_inscricao: BaseItem[];
  ausentes: string[];
  /** Comparação com o perfil docente (null = usuário sem perfil docente) */
  elegibilidade_perfil: BaseEligibilityItem[] | null;
}

export function documentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

const FIELD_LABEL: Record<string, string> = {
  objeto: "objeto",
  areas: "áreas",
  elegibilidade: "público elegível",
  requisitos: "requisitos",
  valores: "valores",
  documentos: "documentos exigidos",
  datas: "datas e prazos",
  criterios_avaliacao: "critérios de avaliação",
  canal_inscricao: "canal de inscrição",
};

const STATE_MAP: Record<EligibilityState, BaseEligibilityItem["estado"]> = {
  atendida: "atendido",
  nao_atendida: "nao_atendido",
  pendente_comprovacao: "pendente",
};

export function buildDocumentBase(text: string, teacher?: TeacherProfile | null): DocumentBase {
  const firstLine = text.split(/\n/).map((l) => l.trim()).find(Boolean) ?? "";
  const page: ParsedPage = { url: "", title: firstLine.slice(0, 200), text, links: [] };
  const { fields, missing } = extractFields(page);
  const items = (list?: Array<{ value: string; evidence: string }>) => (list ?? []).map((e) => ({ texto: e.value, evidencia: e.evidence }));

  const requirementTexts = dedupe([...(fields.elegibilidade ?? []), ...(fields.requisitos ?? [])]);
  let elegibilidade_perfil: BaseEligibilityItem[] | null = null;
  if (teacher) {
    elegibilidade_perfil = [];
    for (const r of requirementTexts) {
      // Uma frase pode reunir várias condições ("título de doutor E vínculo efetivo…"):
      // cada condição é avaliada separadamente, com a frase inteira como evidência.
      const clauses = splitConditions(r.evidence);
      let evaluated = 0;
      for (const clause of clauses) {
        const c = evaluateRequirement(clause, "", teacher);
        if (!c) continue;
        evaluated++;
        elegibilidade_perfil.push({ requisito: clause, evidencia: r.evidence, estado: STATE_MAP[c.state], motivo: c.reason, base_perfil: c.profile_basis });
      }
      if (evaluated === 0) {
        elegibilidade_perfil.push({
          requisito: r.evidence,
          evidencia: r.evidence,
          estado: "pendente",
          motivo: "Requisito não avaliado automaticamente — confira no documento.",
          base_perfil: null,
        });
      }
    }
    // Vedações: nunca dá para confirmar só com o perfil — ficam pendentes, explícitas
    for (const v of fields.restricoes ?? []) {
      elegibilidade_perfil.push({
        requisito: v.evidence,
        evidencia: v.evidence,
        estado: "pendente",
        motivo: "Vedação do edital: confirme que você não se enquadra nela.",
        base_perfil: null,
      });
    }
  }

  return {
    versao: DOCUMENT_BASE_VERSION,
    documento_hash: documentHash(text),
    caracteres: text.length,
    objeto: fields.objeto ? { texto: fields.objeto.value, evidencia: fields.objeto.evidence } : null,
    datas: extractDates(text),
    valores: items(fields.valores),
    documentos: extractDocuments(text, items(fields.documentos)),
    requisitos: items(requirementTexts),
    restricoes: items(fields.restricoes),
    criterios: extractClauses(text, /crit[ée]rios?\s+(de\s+)?(avalia|julgamento|sele|classifica)|crit[ée]rios?:|\bpeso\s+\d|\bpontua[çc][ãa]o\b|\bnota\s+m[íi]nima/i),
    canal_inscricao: items(fields.canal_inscricao),
    ausentes: missing.map((k) => FIELD_LABEL[k] ?? k),
    elegibilidade_perfil,
  };
}

function dedupe<T extends { evidence: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((x) => (seen.has(x.evidence) ? false : (seen.add(x.evidence), true)));
}

const CONDITION_SPLIT = /\s*(?:;|,\s+e\s+|\s+e\s+(?=(?:possuir|ter|estar|ser|v[íi]nculo|t[íi]tulo|curr[íi]culo|comprovar|apresentar)\b))\s*/i;

export function splitConditions(sentence: string): string[] {
  const parts = sentence.split(CONDITION_SPLIT).map((p) => p.trim()).filter((p) => p.length >= 8);
  return parts.length ? parts : [sentence];
}

const MONTHS: Record<string, string> = {
  janeiro: "01", fevereiro: "02", marco: "03", março: "03", abril: "04", maio: "05", junho: "06",
  julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
};

const DATE_LABELS: Array<[RegExp, string]> = [
  [/resultado\s+preliminar/i, "resultado preliminar"],
  [/resultado\s+final|homologa/i, "resultado final"],
  [/recurso/i, "recurso"],
  [/inscri[çc][õo]es|submiss[ãa]o|envio\s+(das\s+)?propostas|propostas\s+(ser[ãa]o\s+)?recebidas/i, "inscrições"],
  [/publica[çc][ãa]o|lan[çc]amento/i, "publicação"],
  [/resultado/i, "resultado"],
  [/contrata[çc][ãa]o|assinatura|termo\s+de\s+outorga/i, "contratação"],
  [/in[íi]cio\s+(das\s+)?atividades|execu[çc][ãa]o|vig[êe]ncia/i, "execução"],
  [/relat[óo]rio|presta[çc][ãa]o\s+de\s+contas/i, "prestação de contas"],
  [/prazo|encerramento|at[ée]\s/i, "prazo"],
];

function toIso(d: string, m: string, y: string): string | null {
  const dd = Number(d), mm = Number(m);
  if (!(dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12)) return null;
  return `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/**
 * Datas do documento com rótulo e trecho. Divide em orações só em ponto final
 * (não em ":"), para que "Publicação do edital: 05/01/2027" mantenha o rótulo.
 * Intervalos ("de 10/01 a 28/02/2027") usam a última data como limite.
 */
export function extractDates(text: string): BaseDate[] {
  const out: BaseDate[] = [];
  const clauses = text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=\.)\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9])/))
    .map((c) => c.trim())
    .filter((c) => c.length >= 8 && c.length <= 600);
  for (const c of clauses) {
    const numeric = [...c.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)].map((m) => toIso(m[1], m[2], m[3]));
    const written = [...c.matchAll(/\b(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})\b/gi)].map((m) =>
      MONTHS[m[2].toLowerCase()] ? toIso(m[1], MONTHS[m[2].toLowerCase()], m[3]) : null,
    );
    const isos = [...numeric, ...written].filter((x): x is string => Boolean(x));
    if (isos.length === 0) continue;
    const before = c.slice(0, Math.max(c.search(/\d{1,2}(\/|\s+de\s+)/), 0)) || c;
    const label = DATE_LABELS.find(([re]) => re.test(before))?.[1] ?? DATE_LABELS.find(([re]) => re.test(c))?.[1] ?? "data";
    out.push({ rotulo: label, iso: isos[isos.length - 1], texto: c, evidencia: c });
    if (out.length >= 30) break;
  }
  return out.sort((a, b) => (a.iso ?? "").localeCompare(b.iso ?? ""));
}

const DOC_RE = /\b(formul[áa]rio|declara[çc][ãa]o|comprovante|certid[ãa]o|plano\s+de\s+trabalho|curr[íi]culo|anexo\s+[ivxl\d]+|termo\s+de\s+(anu[êe]ncia|compromisso|aceite)|c[óo]pia\s+d[eoa]|carta\s+de|projeto\s+de\s+pesquisa\s+\(|or[çc]amento)\b/i;

/** Orações do texto (divididas só em ponto final — preserva "Rótulo: conteúdo"). */
function sentenceClauses(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=\.)\s+(?=(?:\d+(?:\.\d+)*\.?\s+)?[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/))
    .map((c) => c.trim())
    .filter((c) => c.length >= 8 && c.length <= 600);
}

export function extractClauses(text: string, re: RegExp, limit = 10): BaseItem[] {
  const seen = new Set<string>();
  const out: BaseItem[] = [];
  for (const c of sentenceClauses(text)) {
    if (!re.test(c) || seen.has(c)) continue;
    seen.add(c);
    out.push({ texto: c.replace(/^\d+(\.\d+)*\.?\s*/, ""), evidencia: c });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Documentos exigidos: itens que nomeiam um tipo de documento. Cada oração vira um
 * item, com o trecho como evidência. Une com o que o extrator do coletor achou.
 */
export function extractDocuments(text: string, fromCollector: BaseItem[] = []): BaseItem[] {
  const out: BaseItem[] = [];
  const seen = new Set<string>();
  const clauses = text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=\.)\s+(?=(?:\d+(?:\.\d+)*\s+)?[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/))
    .map((c) => c.trim())
    .filter((c) => c.length >= 8 && c.length <= 500);
  for (const c of [...clauses, ...fromCollector.map((d) => d.evidencia)]) {
    if (!DOC_RE.test(c) || seen.has(c)) continue;
    // Ignora frases que só mencionam um documento sem exigi-lo (ex.: "O resultado será publicado no anexo")
    if (/resultado|ser[áa]\s+publicad|divulgad/i.test(c) && !/deve|dever[áa]|exig|apresentar|anexar|enviar|entregar|^\d/i.test(c)) continue;
    seen.add(c);
    out.push({ texto: c.replace(/^\d+(\.\d+)*\s*/, ""), evidencia: c });
    if (out.length >= 30) break;
  }
  return out;
}

// ── Verificação contra o texto ───────────────────────────────────────────────

const DATE_RE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
const MONEY_RE = /R\$\s?([\d.]+(?:,\d{2})?)/g;

function normDate(d: string, m: string, y: string) {
  return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
}
function normMoney(v: string) {
  return v.replace(/\./g, "").replace(/,00$/, "");
}

function collectStrings(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 8) return out;
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out, depth + 1);
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      // Não verifica o próprio texto original nem a base (que vem do texto)
      if (k === "originalText" || k === "base" || k === "verificacao") continue;
      collectStrings(v, out, depth + 1);
    }
  }
  return out;
}

export interface VerificationIssue {
  tipo: "data" | "valor";
  valor: string;
  mensagem: string;
}

/**
 * Datas (dd/mm/aaaa) e valores (R$) citados na resposta da IA que não aparecem no
 * documento. Não corrige a resposta — sinaliza para o usuário conferir.
 */
export function verifyAgainstText(result: unknown, text: string): VerificationIssue[] {
  const docDates = new Set([...text.matchAll(DATE_RE)].map((m) => normDate(m[1], m[2], m[3])));
  const docMoney = new Set([...text.matchAll(MONEY_RE)].map((m) => normMoney(m[1])));
  const issues = new Map<string, VerificationIssue>();
  for (const s of collectStrings(result)) {
    for (const m of s.matchAll(DATE_RE)) {
      const d = normDate(m[1], m[2], m[3]);
      if (!docDates.has(d) && !issues.has(`d${d}`))
        issues.set(`d${d}`, { tipo: "data", valor: d, mensagem: `A data ${d} aparece na análise, mas não foi encontrada no documento. Confira antes de usar.` });
    }
    for (const m of s.matchAll(MONEY_RE)) {
      const v = normMoney(m[1]);
      if (v && !docMoney.has(v) && !issues.has(`v${v}`))
        issues.set(`v${v}`, { tipo: "valor", valor: `R$ ${m[1]}`, mensagem: `O valor R$ ${m[1]} aparece na análise, mas não foi encontrado no documento. Confira antes de usar.` });
    }
  }
  return [...issues.values()].slice(0, 20);
}

// ── Elegibilidade da IA em 3 estados ─────────────────────────────────────────

const MISSING_DATA = /(n[ãa]o (apresenta|informa|consta|h[áa] (informa|dado)|foi poss[íi]vel|est[áa] (claro|informad))|sem informa[çc][ãa]o|n[ãa]o informad|dado n[ãa]o|depende de|verificar|comprova)/i;

/**
 * A IA devolve `atende: boolean`, o que confunde "não atende" com "faltou dado".
 * Acrescenta `estado` em 3 valores sem remover os campos originais.
 */
export function normalizeEligibilityCriteria(criterios: unknown): unknown {
  if (!Array.isArray(criterios)) return criterios;
  return criterios.map((c) => {
    if (!c || typeof c !== "object") return c;
    const item = c as { atende?: unknown; observacao?: unknown };
    const obs = typeof item.observacao === "string" ? item.observacao : "";
    const estado = item.atende === true ? "atendido" : MISSING_DATA.test(obs) || item.atende == null ? "pendente" : "nao_atendido";
    return { ...item, estado };
  });
}
