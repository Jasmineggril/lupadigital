/**
 * @file lib/longdoc/consolidate.ts
 * @description Junta os fatos de todas as partes de um documento longo SEM perder origem:
 *   - cada fato leva a parte e as páginas de onde veio (`parte`, `paginas`);
 *   - fatos repetidos em várias partes viram um só, com todas as origens (`fontes`);
 *   - a mesma data/valor com conteúdos DIFERENTES em partes diferentes vira conflito explícito
 *     (as duas versões, com o trecho), nunca uma escolha silenciosa;
 *   - exceções, dispensas, retificações e prorrogações ficam listadas com a parte em que aparecem,
 *     porque podem mudar uma regra lida antes;
 *   - a cobertura diz quantas partes e quantos caracteres foram de fato analisados e quais
 *     intervalos (com páginas) ficaram de fora.
 */
import type { ChunkAnalysisFacts } from "../aiService";
import type { JobChunk } from "./store";

const FACT_KEYS: Array<[keyof ChunkAnalysisFacts, string]> = [
  ["documentInfo", "title"],
  ["dates", "event"],
  ["requirements", "requirement"],
  ["eligibility", "criterion"],
  ["documents", "document"],
  ["values", "value"],
  ["contacts", "contact"],
  ["obligations", "obligation"],
  ["restrictions", "restriction"],
  ["alerts", "message"],
];

const fold = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.;:,]+$/g, "")
    .trim();

const pagesLabel = (c: Pick<JobChunk, "page_start" | "page_end">) =>
  c.page_start == null ? null : c.page_end != null && c.page_end !== c.page_start ? `${c.page_start}–${c.page_end}` : String(c.page_start);

export interface Conflict {
  tipo: "data" | "valor";
  chave: string;
  versoes: Array<{ valor: string; parte: number; paginas: string | null; trecho: string | null }>;
  mensagem: string;
}

export interface Modifier {
  tipo: "excecao" | "dispensa" | "retificacao" | "prorrogacao" | "revogacao";
  parte: number;
  paginas: string | null;
  trecho: string;
}

export interface Coverage {
  total_partes: number;
  partes_analisadas: number;
  partes_com_falha: number;
  partes_pendentes: number;
  caracteres_totais: number;
  caracteres_analisados: number;
  /** Intervalos do documento que NÃO foram analisados (com páginas, quando conhecidas) */
  nao_analisados: Array<{ parte: number; inicio: number; fim: number; paginas: string | null; motivo: string }>;
  completa: boolean;
}

const MODIFIER_RE: Array<[Modifier["tipo"], RegExp]> = [
  ["prorrogacao", /\bprorrog/i],
  ["retificacao", /\bretifica|\berrata\b|passa(m)?\s+a\s+vigorar|onde\s+se\s+l[êe]/i],
  ["revogacao", /\brevogad|\bfica(m)?\s+sem\s+efeito|\bsuprimid/i],
  ["dispensa", /\bdispensad|\bisent[oa]s?\b|\bisen[çc][ãa]o\b|n[ãa]o\s+se\s+aplica/i],
  ["excecao", /\bexce[çc][ãa]o|\bexceto\b|\bsalvo\b|\bressalvad/i],
];

export function consolidateJobChunks(chunks: JobChunk[], textLength: number) {
  const done = chunks.filter((c) => c.status === "concluida" && c.facts);
  const chunkResults = done.map((c) => ({ chunkId: `parte-${c.idx + 1}`, facts: withOrigin(c) }));

  // Mesma data (evento) ou mesmo rótulo de valor com conteúdos diferentes em partes diferentes
  const conflicts: Conflict[] = [];
  const byEvent = new Map<string, Conflict["versoes"]>();
  for (const c of done) {
    const facts = c.facts as ChunkAnalysisFacts;
    for (const d of facts.dates ?? []) {
      const k = fold(d.event);
      if (!k || !d.value) continue;
      const list = byEvent.get(k) ?? [];
      list.push({ valor: String(d.value), parte: c.idx + 1, paginas: d.page != null ? String(d.page) : pagesLabel(c), trecho: d.text ?? null });
      byEvent.set(k, list);
    }
  }
  for (const [k, versions] of byEvent) {
    const distinct = new Map<string, Conflict["versoes"][number]>();
    for (const v of versions) if (!distinct.has(fold(v.valor))) distinct.set(fold(v.valor), v);
    if (distinct.size > 1) {
      const vs = [...distinct.values()];
      conflicts.push({
        tipo: "data",
        chave: versions[0] ? k : k,
        versoes: vs,
        mensagem: `"${k}" aparece com datas diferentes: ${vs.map((v) => `${v.valor} (parte ${v.parte}${v.paginas ? `, p. ${v.paginas}` : ""})`).join(" e ")}. Confira qual está em vigor (pode haver retificação ou prorrogação).`,
      });
    }
  }

  // Exceções e alterações: procuradas nos fatos de todas as partes
  const modifiers: Modifier[] = [];
  const seen = new Set<string>();
  for (const c of done) {
    const facts = c.facts as ChunkAnalysisFacts;
    for (const [key] of FACT_KEYS) {
      for (const f of (facts[key] ?? []) as Array<Record<string, unknown>>) {
        const t = String(f.text ?? Object.values(f).find((v) => typeof v === "string") ?? "");
        const hit = MODIFIER_RE.find(([, re]) => re.test(t));
        if (!hit) continue;
        const sig = `${hit[0]}|${fold(t)}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        modifiers.push({ tipo: hit[0], parte: c.idx + 1, paginas: typeof f.page === "number" ? String(f.page) : pagesLabel(c), trecho: t.slice(0, 400) });
      }
    }
  }

  const coverage = coverageOf(chunks, textLength);
  return { chunkResults, conflicts, modifiers, coverage };
}

function withOrigin(c: JobChunk): ChunkAnalysisFacts {
  const facts = c.facts as ChunkAnalysisFacts;
  const out = {} as ChunkAnalysisFacts;
  for (const [key] of FACT_KEYS) {
    (out[key] as unknown) = ((facts[key] ?? []) as Array<Record<string, unknown>>).map((f) => ({
      ...f,
      parte: c.idx + 1,
      page: typeof f.page === "number" ? f.page : c.page_start ?? undefined,
      section: f.section ?? c.section ?? undefined,
    }));
  }
  return out;
}

export function coverageOf(chunks: JobChunk[], textLength: number): Coverage {
  const analisadas = chunks.filter((c) => c.status === "concluida");
  const naoAnalisadas = chunks.filter((c) => c.status !== "concluida");
  return {
    total_partes: chunks.length,
    partes_analisadas: analisadas.length,
    partes_com_falha: chunks.filter((c) => c.status === "falhou").length,
    partes_pendentes: chunks.filter((c) => c.status === "pendente" || c.status === "processando").length,
    caracteres_totais: textLength,
    caracteres_analisados: analisadas.reduce((n, c) => n + (c.end_offset - c.start_offset), 0),
    nao_analisados: naoAnalisadas.map((c) => ({
      parte: c.idx + 1,
      inicio: c.start_offset,
      fim: c.end_offset,
      paginas: pagesLabel(c),
      motivo: c.status === "falhou" ? `falhou após ${c.attempts} tentativa(s)${c.error ? `: ${c.error}` : ""}` : "ainda não processada",
    })),
    completa: naoAnalisadas.length === 0 && chunks.length > 0,
  };
}

/** Funde fatos idênticos de partes diferentes guardando todas as origens (usado na lista exibida). */
export function mergeWithSources<T extends Record<string, unknown>>(items: T[], keyField: string): Array<T & { fontes: Array<{ parte: number; pagina?: number }> }> {
  const map = new Map<string, T & { fontes: Array<{ parte: number; pagina?: number }> }>();
  for (const it of items) {
    const k = fold(it[keyField]);
    if (!k) continue;
    const src = { parte: Number(it.parte), ...(typeof it.page === "number" ? { pagina: it.page } : {}) };
    const cur = map.get(k);
    if (cur) cur.fontes.push(src);
    else map.set(k, { ...it, fontes: [src] });
  }
  return [...map.values()];
}
