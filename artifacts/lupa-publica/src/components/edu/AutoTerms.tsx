/**
 * @file AutoTerms.tsx
 * @description Destaca automaticamente termos do glossário dentro de um texto.
 *
 * Usado nos textos gerados pela IA (cronograma, checklist, elegibilidade):
 * a primeira ocorrência de cada termo vira um <Term> clicável, sem alterar o
 * texto em si — preservando o conteúdo original, como manda o projeto.
 */

import { GLOSSARY } from "@/lib/glossary";
import { Fragment, useMemo } from "react";
import { Term } from "./Term";

interface Matcher {
  slug: string;
  regex: RegExp;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Letras do português (inclui acentuadas) para simular "limite de palavra".
const WORD = "A-Za-zÀ-ÖØ-öø-ÿ0-9";

let cachedMatchers: Matcher[] | null = null;
function getMatchers(): Matcher[] {
  if (cachedMatchers) return cachedMatchers;
  const list: { slug: string; phrase: string }[] = [];
  for (const t of GLOSSARY) {
    for (const phrase of [t.term, ...(t.aliases ?? [])]) {
      if (phrase.length >= 3) list.push({ slug: t.slug, phrase });
    }
  }
  // Frases mais longas primeiro ("prestação de contas" antes de "prazo")
  list.sort((a, b) => b.phrase.length - a.phrase.length);
  cachedMatchers = list.map(({ slug, phrase }) => ({
    slug,
    regex: new RegExp(`(^|[^${WORD}])(${escapeRegExp(phrase)})(?=[^${WORD}]|$)`, "i"),
  }));
  return cachedMatchers;
}

type Piece = string | { slug: string; text: string };

/** Divide o texto em pedaços, marcando a primeira ocorrência de cada termo. Exportado para testes. */
export function splitWithTerms(text: string, maxTerms = 4): Piece[] {
  let pieces: Piece[] = [text];
  const used = new Set<string>();
  for (const m of getMatchers()) {
    if (used.size >= maxTerms) break;
    if (used.has(m.slug)) continue;
    const next: Piece[] = [];
    let found = false;
    for (const piece of pieces) {
      if (found || typeof piece !== "string") {
        next.push(piece);
        continue;
      }
      const match = m.regex.exec(piece);
      if (!match) {
        next.push(piece);
        continue;
      }
      const start = match.index + match[1].length;
      const end = start + match[2].length;
      if (start > 0) next.push(piece.slice(0, start));
      next.push({ slug: m.slug, text: piece.slice(start, end) });
      if (end < piece.length) next.push(piece.slice(end));
      found = true;
    }
    if (found) used.add(m.slug);
    pieces = next;
  }
  return pieces;
}

export function AutoTerms({ text, maxTerms = 4 }: { text: string; maxTerms?: number }) {
  const pieces = useMemo(() => splitWithTerms(text ?? "", maxTerms), [text, maxTerms]);
  return (
    <>
      {pieces.map((p, i) =>
        typeof p === "string" ? (
          <Fragment key={i}>{p}</Fragment>
        ) : (
          <Term key={i} slug={p.slug}>
            {p.text}
          </Term>
        ),
      )}
    </>
  );
}
