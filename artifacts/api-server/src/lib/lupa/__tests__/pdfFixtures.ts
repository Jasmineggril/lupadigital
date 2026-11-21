/**
 * PDFs FICTÍCIOS gerados no teste (sem rede): um PDF válido por página de texto.
 * Usado para testar a leitura de documentos da coleta (hash, páginas, troca na mesma URL,
 * retificação, arquivo inválido, PDF sem texto).
 */
import type { DocumentFetcher, FetchedDocument } from "../collector/documents";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

/** PDF mínimo válido; cada item de `pages` é o texto de uma página ("" = página sem texto). */
export function makePdf(pages: string[]): Uint8Array {
  const objs: string[] = [];
  const n = pages.length;
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  objs.push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${n} >>`);
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  pages.forEach((text, i) => {
    const lines = text ? text.split("\n") : [];
    const stream = lines.length ? `BT /F1 10 Tf 40 780 Td 14 TL ${lines.map((l) => `(${esc(l)}) Tj T*`).join(" ")} ET` : "";
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objs.push(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
  });
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}

/** Fetcher de documentos controlado: mapa URL → bytes (ou erro). */
export function fixtureDocumentFetcher(map: Record<string, Uint8Array | Error>): { fetcher: DocumentFetcher; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    fetcher: async (url: string): Promise<FetchedDocument> => {
      calls.push(url);
      const v = map[url];
      if (v instanceof Error) throw v;
      if (!v) return { url, status: 404, contentType: "text/html", bytes: new Uint8Array() };
      return { url, status: 200, contentType: "application/pdf", bytes: v };
    },
  };
}
