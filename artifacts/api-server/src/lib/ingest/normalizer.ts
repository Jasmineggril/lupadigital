import type { ExtractedDocument, NormalizedDocument } from "./types";
import { JSDOM } from "jsdom";

export async function normalizeExtracted(extracted: ExtractedDocument): Promise<NormalizedDocument> {
  const text = extracted.text ?? "";
  // Se o texto parece ser HTML, limpar tags mantendo títulos, listas e tabelas
  let canonical = text;
  try {
    const dom = new JSDOM(text);
    const doc = dom.window.document;
    // remover scripts e estilos
    doc.querySelectorAll("script,style,noscript").forEach((n) => n.remove());

    // converter headings para linhas com marcadores
    for (let i = 1; i <= 6; i++) {
      doc.querySelectorAll(`h${i}`).forEach((h) => {
        const marker = "#".repeat(i);
        h.replaceWith(doc.createTextNode(`\n${marker} ${h.textContent}\n`));
      });
    }

    // listas
    doc.querySelectorAll("ul,ol").forEach((list) => {
      const items: string[] = [];
      list.querySelectorAll("li").forEach((li) => items.push(`- ${li.textContent?.trim()}`));
      list.replaceWith(doc.createTextNode(`\n${items.join("\n")}\n`));
    });

    // tabelas — extrair como texto tabulado simples
    doc.querySelectorAll("table").forEach((table) => {
      const rows: string[] = [];
      table.querySelectorAll("tr").forEach((tr) => {
        const cols: string[] = [];
        tr.querySelectorAll("th,td").forEach((cell) => cols.push((cell.textContent || "").trim()));
        rows.push(cols.join(" | "));
      });
      table.replaceWith(doc.createTextNode(`\n${rows.join("\n")}\n`));
    });

    // obter texto limpo
    canonical = doc.body.textContent || text;
  } catch (err) {
    // não HTML — aplicar limpeza simples
    canonical = text;
  }

  // normalizações gerais
  canonical = canonical.replace(/\r/g, "\n");
  canonical = canonical.replace(/[ \t]+/g, " ");
  canonical = canonical.replace(/\n{3,}/g, "\n\n");
  canonical = canonical.trim();

  const tokensEstimate = Math.max(0, Math.ceil(canonical.length / 4));

  const normalized: NormalizedDocument = {
    id: extracted.id,
    canonicalText: canonical,
    tokensEstimate,
    metadata: extracted.metadata,
  };

  return normalized;
}
