/**
 * @file lib/highlight.tsx
 * @description Grifa (com `mark-term`) as palavras de um termo dentro de um trecho,
 * ignorando acentos, maiúsculas e plural simples — o mesmo critério da comparação
 * no servidor (lib/lupa/matching.ts), para o leitor ver por que o termo casou.
 */
import type { ReactNode } from "react";

const strip = (c: string) => c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function stem(w: string) {
  if (w.length > 5 && /(oes|aes)$/.test(w)) return w.slice(0, -3);
  if (w.length > 4 && /[rsz]es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s")) return w.slice(0, -1);
  return w;
}

export function highlightTerms(text: string, terms: string[]): ReactNode {
  // Texto normalizado caractere a caractere (mesmo comprimento do original)
  const norm = Array.from(text).map((c) => (strip(c) || c)[0]).join("");
  const stems = [
    ...new Set(
      terms
        .flatMap((t) => strip(t).split(/[^a-z0-9]+/))
        .filter((w) => w.length >= 4)
        .map(stem),
    ),
  ];
  if (stems.length === 0) return text;
  const ranges: Array<[number, number]> = [];
  for (const s of stems) {
    const re = new RegExp(`(^|[^a-z0-9])(${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[a-z0-9]*)`, "g");
    for (const m of norm.matchAll(re)) {
      const start = (m.index ?? 0) + m[1].length;
      ranges.push([start, start + m[2].length]);
    }
  }
  if (ranges.length === 0) return text;
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = merged.at(-1);
    // Junta marcas vizinhas separadas só por espaço ("inteligência artificial" vira um grifo)
    if (last && (r[0] <= last[1] || /^\s+$/.test(text.slice(last[1], r[0])))) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  const chars = Array.from(text);
  const out: ReactNode[] = [];
  let pos = 0;
  merged.forEach(([a, b], i) => {
    if (a > pos) out.push(chars.slice(pos, a).join(""));
    out.push(
      <mark key={i} className="mark-term">
        {chars.slice(a, b).join("")}
      </mark>,
    );
    pos = b;
  });
  if (pos < chars.length) out.push(chars.slice(pos).join(""));
  return out;
}
