/**
 * @file lib/analysisFacts.ts
 * @description Fatos de uma análise, conferidos contra o texto do edital. Toda resposta de
 * /edital/analyze atravessa este módulo (em withDocumentBase), seja qual for o agente.
 *
 * Três falhas reproduzidas em produção (22/11/2026, edital fictício de teste) motivaram o módulo:
 *
 *  1. Exigência inventada: a IA acrescentava qualificadores que o edital não traz ("com foto e
 *     assinatura", "cópia autenticada"). Uma mudança no prompt NÃO garante nada — o modelo varia
 *     a cada chamada. Aqui cada item é procurado no texto. O nome do item passa a ser o do próprio
 *     edital, e o que a IA acrescentou sem respaldo fica separado em `nao_confirmado`.
 *  2. Prazo contraditório: o agente Documentação devolvia "Prazo não informado" para um texto com
 *     "Inscrições: de 01/12/2026 até 20/12/2026", e o chat repetia isso enquanto o cronograma mostrava
 *     20/12/2026. O prazo oficial passa a ser resolvido uma única vez, pela regra única de prazos
 *     (lupa/deadlines.ts). Marcadores de "não informado" são trocados pela data do documento, e uma
 *     divergência real entre a IA e o documento fica registrada em `conflitos`, sem escolha silenciosa.
 *  3. Ausentes incoerentes: a base dizia "documentos exigidos: não encontrado" ao lado de uma lista
 *     de documentos do mesmo texto (dois extratores diferentes). `campos` concilia cada campo em
 *     encontrado / parcial / incerto / não localizado, separando "o extrator não achou" de "não existe".
 *
 * Determinístico: não chama IA, não acessa rede. A resposta da IA nunca é usada como evidência.
 */

import { extractFields, datesAsCandidates, type ParsedPage } from "./lupa/collector/parse";
import { officialSubmissionDeadline, formatDeadline } from "./lupa/deadlines";
import type { DocumentBase } from "./documentBase";

export const ANALYSIS_FACTS_VERSION = 1;

export type ItemOrigin = "edital" | "sugestao" | "desconhecido";
/** listado = aparece na lista do edital sem palavra explícita de obrigatoriedade */
export type ItemCondition = "obrigatorio" | "listado" | "opcional" | "alternativa" | "com_dispensa" | "nao_informado";

export interface GroundedItem {
  /** Nome do item: o trecho do edital quando há respaldo; senão o texto da IA */
  texto: string;
  /** Como a IA escreveu (para auditoria) */
  texto_ia: string;
  /** edital = trecho localizado; desconhecido = sem trecho correspondente */
  origem: ItemOrigin;
  /** Trecho literal do documento (nunca texto da IA) */
  evidencia: string | null;
  /** Detalhes que a IA acrescentou e que o trecho do edital não traz */
  nao_confirmado: string[];
  /** O que o próprio trecho diz sobre obrigatoriedade */
  condicao: ItemCondition;
  /** Pede conferência no documento oficial */
  conferir: boolean;
  motivo: string | null;
}

export interface ResolvedDeadline {
  iso: string;
  hora: string | null;
  fuso: string | null;
  /** "20/12/2026" ou "20/12/2026, até 18h (horário de Brasília)" */
  texto: string;
  evidencia: string;
  prorrogado: boolean;
  fases: string[];
  situacao: "aberta" | "encerrada";
  origem: "edital";
}

export interface FactConflict {
  campo: string;
  documento: string;
  ia: string;
  evidencia: string | null;
  mensagem: string;
}

export type FieldState = "encontrado" | "parcial" | "incerto" | "nao_localizado";

export interface FieldStatus {
  campo: string;
  rotulo: string;
  estado: FieldState;
  /** documento = extrator determinístico; ia = só a IA citou (sem trecho); nenhuma */
  fonte: "documento" | "ia" | "nenhuma";
  evidencia: string | null;
  observacao: string;
}

export interface AnalysisFacts {
  versao: number;
  documento_hash: string;
  prazo_inscricao: ResolvedDeadline | null;
  /** O que a IA disse sobre prazo, sem alteração */
  prazo_ia: string | null;
  conflitos: FactConflict[];
  exigencias: GroundedItem[];
  campos: FieldStatus[];
  /** Qualificadores que a análise menciona em qualquer lugar e o documento não traz */
  qualificadores_sem_respaldo: string[];
}

// ── Texto ───────────────────────────────────────────────────────────────────

export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const STOP = new Set([
  "para", "pela", "pelo", "pelos", "pelas", "como", "com", "uma", "umas", "uns", "das", "dos", "nas", "nos", "que", "por",
  "sobre", "entre", "quando", "deve", "devera", "deverao", "ser", "sera", "seja", "este", "esta", "esse", "essa", "edital",
  "documento", "documentos", "exigido", "exigidos", "exigida", "exigidas", "obrigatorio", "obrigatoria", "necessario", "necessaria",
  "apresentar", "enviar", "anexar", "inscricao", "candidato", "candidata", "proponente", "caso", "ate", "mais", "menos", "cada",
]);

const SHORT_STOP = new Set(["de", "do", "da", "em", "no", "na", "ou", "os", "as", "ao", "um", "se", "por", "com", "dos", "das", "nas", "nos", "sem", "via"]);

function stem(w: string): string {
  return w.length > 6 ? w.slice(0, 6) : w.replace(/(es|s)$/, "");
}

function tokens(s: string): string[] {
  // Siglas de 2 letras contam (RG, TI); preposições e artigos curtos não
  return [...new Set(fold(s).split(/[^a-z0-9]+/).filter((w) => (w.length >= 2 || /^\d+$/.test(w)) && !STOP.has(w) && !SHORT_STOP.has(w)).map(stem))];
}

/** Orações do documento (linhas e frases), sem perder "Rótulo: conteúdo". */
function clauses(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[^\d\s][.;])\s+(?=(?:\d+(?:\.\d+)*\.?\s+)?[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/))
    .map((c) => c.trim())
    .filter((c) => c.length >= 4 && c.length <= 800);
}

// ── Qualificadores que costumam ser inventados ───────────────────────────────

/** Rótulo legível → padrão (sobre texto sem acento, minúsculo). */
const QUALIFIERS: Array<[string, RegExp]> = [
  ["foto", /\bfoto(grafia)?s?\b|\b3\s?x\s?4\b/],
  ["assinatura", /\bassinad[oa]s?\b|\bassinatura/],
  ["autenticação", /\bautentica(d[oa]s?|cao|coes)\b/],
  ["firma reconhecida", /\bfirma\s+reconhecida|\breconhecimento\s+de\s+firma/],
  ["cartório", /\bcartorio/],
  ["via original", /\b(via\s+)?origina(l|is)\b/],
  ["cópia", /\bcopias?\b|\bxerox/],
  ["impresso", /\bimpress[oa]s?\b/],
  ["colorido", /\bcolorid[oa]s?\b/],
  ["frente e verso", /\bfrente\s+e\s+verso/],
  ["emissão recente", /\brecente|\bemitid[oa]s?\s+h[a]\s+(no\s+maximo\s+)?\d+|\bvalidade\s+de\s+\d+\s+dias|\bultimos\s+\d+\s+(dias|meses)/],
  ["papel timbrado", /\btimbrad[oa]/],
  ["envio pelos Correios", /\bcorreios\b|\bsedex\b/],
];

export function qualifiersIn(s: string): string[] {
  const f = fold(s);
  return QUALIFIERS.filter(([, re]) => re.test(f)).map(([label]) => label);
}

// ── Exigências com evidência ────────────────────────────────────────────────

const OPTIONAL_RE = /\b(opcion(al|ais)|facultativ[oa]s?|se\s+houver|quando\s+houver|caso\s+possua|desejavel|nao\s+obrigatori[oa])\b/;
const DISPENSE_RE = /\b(dispensad[oa]s?|dispensa|isent[oa]s?|isencao|exceto|salvo|nao\s+se\s+aplica)\b/;
const MANDATORY_RE = /\b(obrigatori[oa]s?|devera|deverao|deve|exigid[oa]s?|indispensave(l|is)|imprescindive(l|is))\b/;

function conditionOf(evidence: string, segment: string): ItemCondition {
  const e = fold(evidence);
  const s = fold(segment);
  if (OPTIONAL_RE.test(s)) return "opcional";
  if (/\bou\b/.test(s)) return "alternativa";
  if (OPTIONAL_RE.test(e) && !MANDATORY_RE.test(e)) return "opcional";
  if (DISPENSE_RE.test(e)) return "com_dispensa";
  if (MANDATORY_RE.test(e)) return "obrigatorio";
  if (/^\s*(\d+(\.\d+)*\.?\s*)?documentos?\b[^:]{0,40}:/.test(e)) return "listado";
  return "nao_informado";
}

function scoreAgainst(itemTokens: string[], foldedClause: string): number {
  if (itemTokens.length === 0) return 0;
  const clauseTokens = new Set(tokens(foldedClause));
  return itemTokens.filter((t) => clauseTokens.has(t)).length / itemTokens.length;
}

/** Partes de uma lista "Documentos: A, B e C" — "ou" fica junto (alternativa é uma exigência só). */
function segmentsOf(clause: string): string[] {
  const body = clause.includes(":") ? clause.slice(clause.indexOf(":") + 1) : clause;
  return body
    .split(/\s*(?:;|,|\s+e\s+(?!verso\b))\s*/i)
    .map((s) => s.replace(/^[\s\-–•(]+|[\s.)]+$/g, "").trim())
    .filter((s) => s.length >= 3);
}

/** Item da IA cortado antes do primeiro qualificador sem respaldo ("X com foto e assinatura" → "X"). */
function stripUnsupported(item: string, unsupported: string[]): string {
  const words = item.split(/\s+/);
  const res = QUALIFIERS.filter(([l]) => unsupported.includes(l)).map(([, re]) => re);
  const first = words.findIndex((_, i) => res.some((re) => re.test(fold(words.slice(i, i + 3).join(" "))) && re.test(fold(words[i]))));
  if (first <= 0) return item;
  let cut = first;
  while (cut > 1 && !/^(com|em|na|no|nas|nos|e|sem)$/i.test(words[cut - 1]) && !/[,(]$/.test(words[cut - 1])) cut--;
  if (/^(com|em|na|no|nas|nos|e|sem)$/i.test(words[cut - 1] ?? "")) cut--;
  const out = words.slice(0, Math.max(cut, 1)).join(" ").replace(/[,(\s]+$/, "");
  return out || item;
}

/** Palavras do item sem os qualificadores: "com foto e assinatura" não pode diluir a busca. */
function coreTokens(item: string): string[] {
  const kept = item.split(/\s+/).filter((w) => !QUALIFIERS.some(([, re]) => re.test(fold(w))));
  return tokens(kept.join(" "));
}

export function groundItem(item: string, text: string, observacao = ""): GroundedItem {
  const itemTokens = coreTokens(item);
  const all = clauses(text);
  let best: { clause: string; score: number; idx: number } | null = null;
  all.forEach((c, idx) => {
    const score = scoreAgainst(itemTokens, c);
    if (score > (best?.score ?? 0)) best = { clause: c, score, idx };
  });
  const found = best as { clause: string; score: number; idx: number } | null;
  // Pelo menos 60% das palavras do item no mesmo trecho (e 2 palavras quando o item tem 3 ou mais)
  const matched = found ? Math.round(found.score * itemTokens.length) : 0;
  const supported = Boolean(found) && found!.score >= 0.6 && (itemTokens.length < 3 || matched >= 2);
  const claimed = [...new Set([...qualifiersIn(item), ...qualifiersIn(observacao)])];

  if (!supported || !found) {
    return {
      texto: item,
      texto_ia: item,
      origem: "desconhecido",
      evidencia: null,
      nao_confirmado: claimed.filter((q) => !qualifiersIn(text).includes(q)),
      condicao: "nao_informado",
      conferir: true,
      motivo: "Não localizamos este item no texto do edital. Pode ser uma sugestão da IA: confira no documento oficial antes de providenciar.",
    };
  }

  // O trecho e a oração seguinte (listas às vezes continuam na linha de baixo)
  const window = [found.clause, all[found.idx + 1] ?? ""].join(" ");
  const supportedQualifiers = qualifiersIn(window);
  const unsupported = claimed.filter((q) => !supportedQualifiers.includes(q));

  const segments = segmentsOf(found.clause);
  let label = item;
  let bestSeg = 0;
  for (const seg of segments) {
    const s = scoreAgainst(itemTokens, seg);
    if (s > bestSeg) {
      bestSeg = s;
      label = seg;
    }
  }
  if (bestSeg < 0.5) label = unsupported.length ? stripUnsupported(item, unsupported) : item;
  label = label.charAt(0).toUpperCase() + label.slice(1);

  return {
    texto: label,
    texto_ia: item,
    origem: "edital",
    evidencia: found.clause,
    nao_confirmado: unsupported,
    condicao: conditionOf(found.clause, label),
    conferir: unsupported.length > 0,
    motivo: unsupported.length
      ? `O edital não menciona: ${unsupported.join(", ")}. Isso não é exigência confirmada; confira no documento oficial.`
      : null,
  };
}

// ── Prazo único ─────────────────────────────────────────────────────────────

const PLACEHOLDER_RE = /n[ãa]o\s+(foi\s+)?(informad|encontrad|identificad|localizad|especificad|mencionad|consta|h[áa]\s+(prazo|data))|sem\s+(prazo|data)|a\s+confirmar|indefinid|desconhecid|^\s*[-–—]?\s*$/i;

export function isPlaceholder(s: unknown): boolean {
  return typeof s !== "string" || PLACEHOLDER_RE.test(s.trim());
}

function datesIn(s: string): string[] {
  return [...s.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)].map((m) => `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`);
}

export function resolveDeadline(text: string, today = new Date().toISOString().slice(0, 10)): ResolvedDeadline | null {
  const page: ParsedPage = { url: "", title: "", text, links: [] };
  const { fields } = extractFields(page);
  const d = officialSubmissionDeadline(datesAsCandidates(fields), today);
  if (!d) return null;
  return { iso: d.iso, hora: d.hora, fuso: d.fuso, texto: formatDeadline(d), evidencia: d.evidencia ?? "", prorrogado: d.prorrogado, fases: d.fases, situacao: d.situacao, origem: "edital" };
}

// ── Conciliação dos campos ──────────────────────────────────────────────────

type AnyRecord = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x.trim() : str((x as AnyRecord | null)?.doc))).filter(Boolean) : [];
}

export function reconcileFields(base: DocumentBase, text: string, ai: AnyRecord, grounded: GroundedItem[]): FieldStatus[] {
  const { fields } = extractFields({ url: "", title: "", text, links: [] });
  const interp = (ai.interpretation ?? {}) as AnyRecord;
  const fromDoc = (campo: string, rotulo: string, evidencia: string | null | undefined, observacao = "Localizado no texto do documento."): FieldStatus => ({
    campo, rotulo, estado: "encontrado", fonte: "documento", evidencia: evidencia ?? null, observacao,
  });
  const notFound = (campo: string, rotulo: string, aiValue: string): FieldStatus =>
    aiValue && !isPlaceholder(aiValue)
      ? { campo, rotulo, estado: "incerto", fonte: "ia", evidencia: null, observacao: "A IA indicou um conteúdo, mas não localizamos o trecho correspondente no texto. Confira no documento." }
      : { campo, rotulo, estado: "nao_localizado", fonte: "nenhuma", evidencia: null, observacao: "Não localizado automaticamente no texto. Isso não significa que o edital não trate do assunto: confira o documento completo." };

  const out: FieldStatus[] = [];
  out.push(base.objeto ? fromDoc("objeto", "objeto", base.objeto.evidencia) : notFound("objeto", "objeto", str(interp.objective)));
  out.push(fields.areas ? fromDoc("areas", "áreas", fields.areas.evidence) : notFound("areas", "áreas", ""));
  if (fields.elegibilidade?.length) out.push(fromDoc("elegibilidade", "público elegível", fields.elegibilidade[0].evidence));
  else if (base.requisitos.length)
    out.push({ campo: "elegibilidade", rotulo: "público elegível", estado: "parcial", fonte: "documento", evidencia: base.requisitos[0].evidencia, observacao: "O texto traz requisitos de participação, mas não uma descrição separada de quem pode participar." });
  else out.push(notFound("elegibilidade", "público elegível", str(interp.targetAudience)));
  out.push(base.requisitos.length ? fromDoc("requisitos", "requisitos", base.requisitos[0].evidencia) : notFound("requisitos", "requisitos", strList(interp.requirements).join("; ")));
  out.push(base.valores.length ? fromDoc("valores", "valores", base.valores[0].evidencia) : notFound("valores", "valores", str((ai.valores as AnyRecord | undefined)?.valor)));

  const groundedDocs = grounded.filter((g) => g.origem === "edital");
  if (base.documentos.length || groundedDocs.length) {
    const partial = grounded.some((g) => g.origem !== "edital" || g.nao_confirmado.length > 0);
    out.push({
      campo: "documentos", rotulo: "documentos exigidos", estado: partial ? "parcial" : "encontrado", fonte: "documento",
      evidencia: base.documentos[0]?.evidencia ?? groundedDocs[0]?.evidencia ?? null,
      observacao: partial ? "Há documentos no texto, mas parte da lista da IA não tem trecho correspondente ou traz detalhes que o edital não menciona." : "Localizado no texto do documento.",
    });
  } else out.push(notFound("documentos", "documentos exigidos", grounded.map((g) => g.texto_ia).join("; ")));

  if (base.datas.length) {
    const hasDeadline = Boolean(resolveDeadline(text));
    out.push(hasDeadline ? fromDoc("datas", "datas e prazos", base.datas[0].evidencia) : { campo: "datas", rotulo: "datas e prazos", estado: "parcial", fonte: "documento", evidencia: base.datas[0].evidencia, observacao: "Há datas no texto, mas nenhuma identificada como prazo de inscrição." });
  } else out.push(notFound("datas", "datas e prazos", str(interp.deadlines)));

  const crit = fields.criterios_avaliacao?.[0]?.evidence ?? base.criterios[0]?.evidencia;
  out.push(crit ? fromDoc("criterios_avaliacao", "critérios de avaliação", crit) : notFound("criterios_avaliacao", "critérios de avaliação", ""));
  out.push(base.canal_inscricao.length ? fromDoc("canal_inscricao", "canal de inscrição", base.canal_inscricao[0].evidencia) : notFound("canal_inscricao", "canal de inscrição", str(interp.registrationLocation)));
  return out;
}

// ── Aplicação na resposta ───────────────────────────────────────────────────

const TEMPLATE_OBSERVATION = /como obter ou preparar\s*[—-]\s*sem adicionar exig/i;

function collectStrings(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 8) return out;
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out, depth + 1);
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) {
      if (k === "originalText" || k === "base" || k === "verificacao" || k === "fatos") continue;
      collectStrings(v, out, depth + 1);
    }
  return out;
}

interface ChecklistLike {
  doc?: unknown;
  obrigatorio?: unknown;
  observacao?: unknown;
  [k: string]: unknown;
}

function groundChecklist(list: unknown, text: string, cache: Map<string, GroundedItem>): unknown {
  if (!Array.isArray(list)) return list;
  return list.map((raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const item = raw as ChecklistLike;
    // Reabrir/reprocessar: parte sempre do texto original da IA, para o resultado não mudar
    const doc = str(item.doc_ia) || str(item.doc);
    if (!doc) return item;
    const obs = TEMPLATE_OBSERVATION.test(str(item.observacao)) ? "" : str(item.observacao);
    const g = cache.get(doc) ?? groundItem(doc, text, obs);
    cache.set(doc, g);
    return {
      ...item,
      doc: g.texto,
      doc_ia: item.doc_ia ?? (g.texto_ia !== g.texto ? g.texto_ia : undefined),
      // A observação é orientação prática, nunca exigência do edital
      observacao: obs,
      observacao_tipo: obs ? "orientacao" : undefined,
      // Só o edital decide se é opcional: "obrigatório" da IA cai quando o trecho diz opcional
      // e sem trecho no edital não há como afirmar obrigatoriedade
      obrigatorio: g.condicao === "opcional" || g.origem !== "edital" ? false : item.obrigatorio,
      origem: g.origem,
      evidencia: g.evidencia,
      condicao: g.condicao,
      nao_confirmado: g.nao_confirmado,
      conferir: g.conferir,
      motivo: g.motivo,
    };
  });
}

function groundStringList(list: unknown, text: string, cache: Map<string, GroundedItem>): unknown {
  if (!Array.isArray(list)) return list;
  return list.map((x) => {
    if (typeof x !== "string" || !x.trim()) return x;
    const g = cache.get(x) ?? groundItem(x, text);
    cache.set(x, g);
    // Lista simples: troca pelo nome do edital só quando a IA acrescentou algo sem respaldo
    return g.origem === "edital" && g.nao_confirmado.length ? g.texto : x;
  });
}

/**
 * Aplica os fatos na resposta (cópia): exigências com evidência, prazo único, campos conciliados.
 * `base` já calculada por buildDocumentBase para o mesmo texto.
 */
export function applyAnalysisFacts<T extends AnyRecord>(result: T, text: string, base: DocumentBase, today = new Date().toISOString().slice(0, 10)): T & { fatos: AnalysisFacts; base: DocumentBase } {
  const out: AnyRecord = { ...result };
  const cache = new Map<string, GroundedItem>();

  // 1. Exigências: checklist canônico, checklist do agente, listas de documentos e requisitos
  if (out.checklist && typeof out.checklist === "object") {
    const c = out.checklist as AnyRecord;
    out.checklist = { ...c, items: groundChecklist(c.items, text, cache) };
  }
  const agent = out.agentResult && typeof out.agentResult === "object" ? { ...(out.agentResult as AnyRecord) } : null;
  if (agent) {
    agent.checklist = groundChecklist(agent.checklist, text, cache);
    if (Array.isArray(agent.documentos)) agent.documentos = groundStringList(agent.documentos, text, cache);
    delete agent.totalPaginas;
    if (typeof agent.anoPublicacao === "number" && !new RegExp(`\\b${agent.anoPublicacao}\\b`).test(text)) delete agent.anoPublicacao;
    out.agentResult = agent;
  }
  if (out.documentosExigidos && typeof out.documentosExigidos === "object") {
    const d = out.documentosExigidos as AnyRecord;
    out.documentosExigidos = { ...d, items: groundStringList(d.items, text, cache) };
  }
  const interp = out.interpretation && typeof out.interpretation === "object" ? { ...(out.interpretation as AnyRecord) } : null;
  if (interp && Array.isArray(interp.requirements)) interp.requirements = groundStringList(interp.requirements, text, cache);

  // 2. Prazo único
  const prazo = resolveDeadline(text, today);
  const prazoIa = interp ? str(interp.deadlines) || null : null;
  const conflitos: FactConflict[] = [];
  if (interp && prazo) {
    if (isPlaceholder(interp.deadlines)) {
      interp.deadlines_ia = interp.deadlines ?? null;
      interp.deadlines = `Inscrições até ${prazo.texto}`;
      interp.deadlines_origem = "documento";
    } else {
      const aiDates = datesIn(str(interp.deadlines));
      if (aiDates.length && !aiDates.includes(prazo.iso)) {
        conflitos.push({
          campo: "prazo de inscrição",
          documento: prazo.texto,
          ia: str(interp.deadlines),
          evidencia: prazo.evidencia,
          mensagem: `A análise da IA indica "${str(interp.deadlines)}", mas o trecho do edital indica inscrições até ${prazo.texto}. Vale o documento oficial: confira o trecho.`,
        });
      }
    }
  }
  if (interp) out.interpretation = interp;

  const exigencias = [...cache.values()];
  const docText = fold(text);
  const qualifiers = [...new Set(collectStrings(result).flatMap(qualifiersIn))].filter((q) => {
    const re = QUALIFIERS.find(([l]) => l === q)?.[1];
    return re ? !re.test(docText) : false;
  });

  const fatos: AnalysisFacts = {
    versao: ANALYSIS_FACTS_VERSION,
    documento_hash: base.documento_hash,
    prazo_inscricao: prazo,
    prazo_ia: prazoIa,
    conflitos,
    exigencias,
    campos: reconcileFields(base, text, result, exigencias),
    qualificadores_sem_respaldo: qualifiers,
  };
  out.fatos = fatos;
  // A lista "ausentes" da base passa a refletir a conciliação (o que nenhum extrator localizou)
  out.base = { ...base, ausentes: fatos.campos.filter((c) => c.estado === "nao_localizado" || c.estado === "incerto").map((c) => c.rotulo) };
  return out as T & { fatos: AnalysisFacts; base: DocumentBase };
}

/** Avisos de verificação (mesmo formato de verifyAgainstText) para exigências e prazos. */
export function factIssues(f: AnalysisFacts): Array<{ tipo: "exigencia" | "prazo"; valor: string; mensagem: string }> {
  const issues: Array<{ tipo: "exigencia" | "prazo"; valor: string; mensagem: string }> = [];
  for (const q of f.qualificadores_sem_respaldo)
    issues.push({ tipo: "exigencia", valor: q, mensagem: `A análise menciona "${q}", mas o documento não fala disso. Não é exigência confirmada: confira no edital antes de providenciar.` });
  for (const e of f.exigencias)
    if (e.origem !== "edital") issues.push({ tipo: "exigencia", valor: e.texto_ia, mensagem: `"${e.texto_ia}" não foi localizado no texto do edital. Pode ser sugestão da IA: confira no documento oficial.` });
  for (const c of f.conflitos) issues.push({ tipo: "prazo", valor: c.documento, mensagem: c.mensagem });
  return issues;
}
