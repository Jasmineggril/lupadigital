/**
 * @file lib/lupa/deadlines.ts
 * @description Regra ÚNICA de datas e prazos (coletor, situação do edital, catálogo e
 * "Quero participar").
 *
 * Antes: o prazo de inscrição era "a MAIOR data de todos os itens cujo rótulo começa com
 * inscri/envio/prazo…". Uma tarefa pessoal "envio pessoal" (20/12) virava o prazo oficial,
 * mesmo com as inscrições encerradas em 10/11. Também "prazo para recurso" contava como
 * inscrição, e 31/02 era aceito como data.
 *
 * Agora:
 *  - só datas REAIS (dia/mês/ano, inclusive bissexto);
 *  - cada data recebe o rótulo do trecho que a antecede (uma frase pode ter várias datas);
 *  - horário e fuso só quando o texto informa (nunca inventados);
 *  - prazo oficial = itens do EDITAL (ou da análise do edital) do tipo inscrição; tarefas
 *    pessoais nunca entram; prorrogação substitui a data original; com várias fases, vale a
 *    próxima fase em aberto (ou a última, se todas passaram).
 */

export type DateKind = "inscricao" | "recurso" | "resultado" | "publicacao" | "inicio" | "execucao" | "etapa";

export interface DateMention {
  iso: string;
  hora: string | null; // "23:59" — só se o texto informar
  fuso: string | null; // ex.: "horário de Brasília" — só se o texto informar
  kind: DateKind;
  rotulo: string;
  prorrogacao: boolean;
}

const MONTHS: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** Data real? (31/02, 29/02 em ano não bissexto e mês 13 são recusados) */
export function validDate(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  const days = [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return d <= days;
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Classifica pelo texto imediatamente anterior à data. A ordem importa (recurso antes de inscrição). */
export function classifyChunk(chunk: string): { kind: DateKind; rotulo: string; prorrogacao: boolean } {
  const c = norm(chunk);
  const prorrogacao = /prorrog/.test(c);
  if (/recurso/.test(c)) return { kind: "recurso", rotulo: "recurso", prorrogacao };
  if (/resultado (preliminar|provisorio)/.test(c)) return { kind: "resultado", rotulo: "resultado preliminar", prorrogacao };
  if (/resultado|homologa|divulgacao (final|dos aprovados)/.test(c)) return { kind: "resultado", rotulo: "resultado", prorrogacao };
  if (/^abertura|abertura das inscric|inicio das inscric|a partir de/.test(c)) return { kind: "inicio", rotulo: "abertura das inscrições", prorrogacao };
  if (/inscric|submiss|envio (das |de )?propost|recebimento (das |de )?propost|propostas (serao recebidas|poderao ser enviadas)|encerramento das inscric/.test(c))
    return { kind: "inscricao", rotulo: prorrogacao ? "inscrições (prorrogação)" : "inscrições", prorrogacao };
  if (/publicac|lancamento/.test(c)) return { kind: "publicacao", rotulo: "publicação", prorrogacao };
  if (/inicio (das atividades|da execucao|do projeto)|vigencia|execucao/.test(c)) return { kind: "execucao", rotulo: "execução", prorrogacao };
  if (/inicio/.test(c)) return { kind: "inicio", rotulo: "início", prorrogacao };
  return { kind: "etapa", rotulo: "data", prorrogacao };
}

const DATE_RE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b|\b(\d{1,2})(?:º)?\s+de\s+([a-zçã]+)\s+de\s+(\d{4})\b/gi;
const TIME_RE = /^\s*(?:,|\s)*(?:at[eé]\s+(?:[àa]s\s+)?|[àa]s\s+)?(\d{1,2})\s*(?:h|:)\s*(\d{2})?\s*(?:min)?/i;
const TZ_RE = /^[^.;]{0,40}?\(?\s*(hor[aá]rio\s+(?:oficial\s+)?de\s+bras[ií]lia|hor[aá]rio\s+de\s+bras[ií]lia)\s*\)?/i;

/** Todas as datas válidas de um trecho, cada uma com rótulo, horário e fuso quando presentes. */
export function parseDateMentions(text: string): DateMention[] {
  const out: DateMention[] = [];
  let lastEnd = 0;
  let lastClass = classifyChunk(text);
  for (const m of text.matchAll(DATE_RE)) {
    const [day, month, year] = m[1] ? [Number(m[1]), Number(m[2]), Number(m[3])] : [Number(m[4]), MONTHS[norm(m[5])] ?? 0, Number(m[6])];
    const before = text.slice(lastEnd, m.index);
    const cls = /[a-zà-ú]{4,}/i.test(before) ? classifyChunk(before) : lastClass;
    // Intervalo ("de 01/02 a 30/06"): a 2ª data herda o rótulo e a 1ª passa a ser a ABERTURA
    const isRange = /^\s*(a|ate|até)\s*$/i.test(before) && out.length > 0;
    const effective = isRange ? lastClass : cls;
    if (isRange) {
      const prev = out[out.length - 1];
      if (prev.kind === effective.kind) out[out.length - 1] = { ...prev, kind: "inicio", rotulo: `abertura (${prev.rotulo})` };
    }
    lastEnd = (m.index ?? 0) + m[0].length;
    lastClass = effective;
    if (!validDate(year, month, day)) continue;
    const after = text.slice(lastEnd, lastEnd + 60);
    const t = TIME_RE.exec(after);
    const hora = t && Number(t[1]) <= 23 && (!t[2] || Number(t[2]) <= 59) ? `${t[1].padStart(2, "0")}:${t[2] ?? "00"}` : null;
    const tz = TZ_RE.exec(after);
    out.push({ iso: iso(year, month, day), hora, fuso: tz ? "horário de Brasília" : null, ...effective });
  }
  return out;
}

export interface DeadlineCandidate {
  rotulo: string;
  data: string | null; // ISO
  hora?: string | null;
  fuso?: string | null;
  origem: "edital" | "analise" | "usuario";
  evidencia: string | null;
}

export interface OfficialDeadline {
  iso: string;
  hora: string | null;
  fuso: string | null;
  evidencia: string | null;
  prorrogado: boolean;
  /** Mais de uma data de inscrição (fases ou retificações) */
  fases: string[];
  situacao: "aberta" | "encerrada";
}

/** Tipo do item: pelo rótulo (e pela evidência, quando o rótulo é genérico). */
export function candidateKind(c: Pick<DeadlineCandidate, "rotulo" | "evidencia">): { kind: DateKind; prorrogacao: boolean } {
  const byLabel = classifyChunk(c.rotulo);
  if (byLabel.kind !== "etapa") return { kind: byLabel.kind, prorrogacao: byLabel.prorrogacao || /prorrog/.test(norm(c.evidencia ?? "")) };
  const byEvidence = c.evidencia ? classifyChunk(c.evidencia) : byLabel;
  return { kind: byEvidence.kind, prorrogacao: byEvidence.prorrogacao };
}

/**
 * Prazo OFICIAL de inscrição. Tarefas pessoais (origem "usuario") nunca entram.
 * null = não há prazo de inscrição confirmado no texto.
 */
export function officialSubmissionDeadline(items: DeadlineCandidate[], today = new Date().toISOString().slice(0, 10)): OfficialDeadline | null {
  const official = items
    .filter((i) => i.origem !== "usuario" && i.data && /^\d{4}-\d{2}-\d{2}$/.test(i.data))
    .map((i) => ({ ...i, ...candidateKind(i) }))
    .filter((i) => i.kind === "inscricao");
  if (official.length === 0) return null;
  const extended = official.filter((i) => i.prorrogacao);
  // Prorrogação substitui as datas anteriores; sem prorrogação, consideram-se as fases
  const pool = (extended.length ? extended : official).sort((a, b) => (a.data as string).localeCompare(b.data as string));
  const fases = [...new Set(official.map((i) => i.data as string))].sort();
  const next = extended.length ? pool.at(-1)! : pool.find((i) => (i.data as string) >= today) ?? pool.at(-1)!;
  return {
    iso: next.data as string,
    hora: next.hora ?? null,
    fuso: next.fuso ?? null,
    evidencia: next.evidencia,
    prorrogado: extended.length > 0,
    fases,
    situacao: (next.data as string) >= today ? "aberta" : "encerrada",
  };
}

/** "10/11/2026" ou "10/11/2026, até 23:59 (horário de Brasília)" — sem inventar horário. */
export function formatDeadline(d: Pick<OfficialDeadline, "iso" | "hora" | "fuso">): string {
  const [y, m, day] = d.iso.split("-");
  return `${day}/${m}/${y}${d.hora ? `, até ${d.hora}` : ""}${d.fuso ? ` (${d.fuso})` : ""}`;
}
