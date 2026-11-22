/**
 * @file lib/longdoc/plan.ts
 * @description Divide documentos longos (até ~1 milhão de caracteres) em partes, sem perder texto.
 *
 * Diferenças em relação ao chunker antigo (aiService.chunkDocument), que continua servindo às
 * análises curtas:
 *   - cada parte tem um intervalo [inicio, fim) de caracteres do texto ORIGINAL; os intervalos são
 *     contíguos e cobrem o documento inteiro (invariante verificada em `assertCoverage`);
 *   - os cortes preferem quebra de página e de seção (CAPÍTULO, ANEXO, CLÁUSULA, item numerado…);
 *   - a sobreposição é só CONTEXTO lido antes da parte (o final da parte anterior), marcado no
 *     prompt — o antigo prefixava o próprio fim da parte a ela mesma, duplicando texto;
 *   - páginas e seção de cada parte vêm de marcadores do texto ("[Página 12]", "Página 12",
 *     quebra de página), para que cada fato possa ser localizado;
 *   - nenhuma linha é descartada (o limpador antigo removia linhas com até 2 caracteres e linhas
 *     repetidas — em tabelas, isso apagava células).
 */
import { createHash } from "node:crypto";

export interface LongDocChunk {
  index: number;
  /** Início e fim (exclusivo) da parte no texto analisado */
  start: number;
  end: number;
  /** Início do contexto (sobreposição): ctxStart ≤ start */
  ctxStart: number;
  pageStart: number | null;
  pageEnd: number | null;
  /** Título da seção em vigor no início da parte */
  section: string | null;
  /** sha256 do trecho [start, end) — prova de qual texto foi analisado */
  hash: string;
  chars: number;
}

export interface PlanOptions {
  /** Tamanho-alvo de cada parte, em caracteres */
  targetChars?: number;
  /** Contexto da parte anterior, em caracteres */
  overlapChars?: number;
}

export const DEFAULT_TARGET_CHARS = 14_000;
export const DEFAULT_OVERLAP_CHARS = 1_200;

/** Limpeza que NÃO apaga conteúdo: só caracteres de controle e espaços repetidos. */
export function normalizeLongText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/\f/g, "\n[Quebra de página]\n")
    .replace(/[\x00-\x08\x0B\x0E-\x1F\x7F-\x9F]/g, " ")
    .replace(/[ \t ]{2,}/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

const PAGE_RE = /^\s*(?:\[\s*)?(?:p[áa]gina|p[áa]g\.|page)\s*[:#nº°-]?\s*(\d{1,5})(?:\s*(?:de|\/)\s*\d{1,5})?\s*\]?\s*$/i;
const PAGE_BREAK_RE = /^\s*\[Quebra de página\]\s*$/;
const HEADING_RE =
  /^\s*(?:(?:CAP[ÍI]TULO|T[ÍI]TULO|SE[ÇC][ÃA]O|ANEXO|AP[ÊE]NDICE|CL[ÁA]USULA|PARTE|RETIFICA[ÇC][ÃA]O|ERRATA)\b[^\n]{0,120}|(?:ART(?:IGO)?\.?\s*\d+)[^\n]{0,120}|\d{1,2}(?:\.\d{1,3}){0,3}\.?\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][^\n]{2,140})$/;

interface Line {
  start: number;
  end: number; // inclui o "\n"
  text: string;
}

function linesOf(text: string): Line[] {
  const out: Line[] = [];
  let pos = 0;
  while (pos < text.length) {
    const nl = text.indexOf("\n", pos);
    const end = nl === -1 ? text.length : nl + 1;
    out.push({ start: pos, end, text: text.slice(pos, nl === -1 ? text.length : nl) });
    pos = end;
  }
  return out;
}

/** Posição de cada marcador de página e de cada título de seção. */
export function documentLandmarks(text: string) {
  const pages: Array<{ offset: number; page: number }> = [];
  const headings: Array<{ offset: number; title: string }> = [];
  let breaks = 0;
  for (const l of linesOf(text)) {
    const m = l.text.match(PAGE_RE);
    if (m) pages.push({ offset: l.start, page: Number(m[1]) });
    else if (PAGE_BREAK_RE.test(l.text)) {
      breaks += 1;
      pages.push({ offset: l.end, page: breaks + 1 });
    } else if (HEADING_RE.test(l.text) && l.text.trim().length <= 160) headings.push({ offset: l.start, title: l.text.trim() });
  }
  return { pages, headings };
}

function pageAt(pages: Array<{ offset: number; page: number }>, offset: number): number | null {
  let current: number | null = null;
  for (const p of pages) {
    if (p.offset > offset) break;
    current = p.page;
  }
  return current;
}

/**
 * Pontos de corte possíveis, com preferência: quebra de página/título (3) > parágrafo (2) >
 * fim de linha (1). Corte no meio da linha só quando a linha sozinha passa do alvo.
 */
function boundaries(text: string, landmarks: ReturnType<typeof documentLandmarks>) {
  const strong = new Set<number>([...landmarks.pages.map((p) => p.offset), ...landmarks.headings.map((h) => h.offset)]);
  const out: Array<{ offset: number; weight: number }> = [];
  for (const l of linesOf(text)) {
    if (l.start === 0) continue;
    const blankBefore = l.start >= 2 && text[l.start - 1] === "\n" && text[l.start - 2] === "\n";
    out.push({ offset: l.start, weight: strong.has(l.start) ? 3 : blankBefore ? 2 : 1 });
  }
  return out;
}

export function planChunks(text: string, opts: PlanOptions = {}): LongDocChunk[] {
  const target = Math.max(2_000, opts.targetChars ?? DEFAULT_TARGET_CHARS);
  const overlap = Math.max(0, Math.min(opts.overlapChars ?? DEFAULT_OVERLAP_CHARS, Math.floor(target / 3)));
  if (!text) return [];
  const landmarks = documentLandmarks(text);
  const cuts = boundaries(text, landmarks);
  const chunks: LongDocChunk[] = [];
  let start = 0;
  let ci = 0;
  while (start < text.length) {
    let end: number;
    if (text.length - start <= target * 1.15) end = text.length;
    else {
      // Melhor corte na janela [60%, 100%] do alvo, preferindo o mais forte e, no empate, o mais distante
      const lo = start + Math.floor(target * 0.6);
      const hi = start + target;
      while (ci < cuts.length && cuts[ci].offset <= lo) ci += 1;
      let best: { offset: number; weight: number } | null = null;
      for (let j = ci; j < cuts.length && cuts[j].offset <= hi; j += 1) {
        const c = cuts[j];
        if (!best || c.weight > best.weight || (c.weight === best.weight && c.offset > best.offset)) best = c;
      }
      if (best) end = best.offset;
      else {
        // Linha enorme (tabela colada, texto sem quebras): corta em espaço; em último caso, no alvo
        const slice = text.slice(lo, hi);
        const sp = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("; "), slice.lastIndexOf(" "));
        end = sp > 0 ? lo + sp + 1 : hi;
      }
    }
    let ctxStart = Math.max(0, start - overlap);
    if (ctxStart > 0) {
      const sp = text.indexOf(" ", ctxStart);
      if (sp !== -1 && sp < start) ctxStart = sp + 1;
    }
    const heading = [...landmarks.headings].reverse().find((h) => h.offset <= start) ?? null;
    const core = text.slice(start, end);
    chunks.push({
      index: chunks.length,
      start,
      end,
      ctxStart,
      pageStart: pageAt(landmarks.pages, start),
      pageEnd: pageAt(landmarks.pages, Math.max(start, end - 1)),
      section: heading?.title.slice(0, 160) ?? null,
      hash: createHash("sha256").update(core).digest("hex"),
      chars: core.length,
    });
    start = end;
  }
  assertCoverage(text, chunks);
  return chunks;
}

/** Os intervalos são contíguos e cobrem 100% do texto; nenhum é vazio. Lança erro se não. */
export function assertCoverage(text: string, chunks: Array<Pick<LongDocChunk, "start" | "end">>): void {
  if (text.length === 0) return;
  if (!chunks.length || chunks[0].start !== 0) throw new Error("Cobertura: a primeira parte não começa no início do documento.");
  for (let i = 0; i < chunks.length; i += 1) {
    if (chunks[i].end <= chunks[i].start) throw new Error(`Cobertura: parte ${i + 1} vazia.`);
    if (i > 0 && chunks[i].start !== chunks[i - 1].end) throw new Error(`Cobertura: lacuna ou sobreposição entre as partes ${i} e ${i + 1}.`);
  }
  if (chunks[chunks.length - 1].end !== text.length) throw new Error("Cobertura: a última parte não termina no fim do documento.");
}

/** Texto enviado à IA para uma parte: contexto marcado + a parte, com referência de páginas/seção. */
export function chunkPromptText(text: string, c: LongDocChunk, total: number): string {
  const ref = [
    `PARTE ${c.index + 1} DE ${total}`,
    c.pageStart != null ? (c.pageEnd != null && c.pageEnd !== c.pageStart ? `páginas ${c.pageStart}–${c.pageEnd}` : `página ${c.pageStart}`) : null,
    c.section ? `seção: ${c.section}` : null,
    `caracteres ${c.start}–${c.end}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const ctx = c.ctxStart < c.start ? text.slice(c.ctxStart, c.start) : "";
  return [
    ctx ? `[CONTEXTO — final da parte anterior, só para entender a continuação; NÃO extraia fatos daqui]\n${ctx}\n[FIM DO CONTEXTO]\n` : "",
    `[${ref}]`,
    text.slice(c.start, c.end),
  ]
    .filter(Boolean)
    .join("\n");
}
