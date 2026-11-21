/**
 * Worker de extração de texto de PDF (roda em worker_threads, isolado do servidor).
 *
 * Por que um worker: um PDF malformado pode prender a CPU ou crescer em memória. Aqui o
 * processo principal pode encerrar este worker de verdade (terminate) no tempo-limite e o
 * worker tem teto de memória próprio (resourceLimits) — Promise.race não faz isso.
 *
 * pdf.js 6.5.x (corrigido para GHSA-hq66-cqwq-w95j). Só extrai TEXTO: sem renderização,
 * sem fontes embutidas, sem XFA. O pdf.js não executa o JavaScript do documento (isso só
 * existe no visualizador com sandbox, que não é usado).
 *
 * Mensagem de entrada: { bytes: Uint8Array, maxPages: number, maxCharsPerPage: number }
 * Saída: { ok: true, pages: [{page, text}], total, truncated } | { ok: false, kind, message }
 */
import { parentPort } from "node:worker_threads";

// O pdf.js avisa, ao carregar, que não há "canvas" (só serve para DESENHAR páginas; aqui só se
// extrai texto). Silencia apenas esses avisos conhecidos; qualquer outro continua aparecendo.
const KNOWN = /@napi-rs\/canvas|Cannot polyfill `(DOMMatrix|Path2D|ImageData)`/;
const warn = console.warn;
console.warn = (...a) => (KNOWN.test(String(a[0])) ? undefined : warn(...a));
const worker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
// Usa o "worker" do pdf.js no mesmo thread deste worker (sem abrir outro)
globalThis.pdfjsWorker = worker;
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
console.warn = warn;

parentPort.on("message", async ({ bytes, maxPages, maxCharsPerPage }) => {
  let task;
  try {
    task = pdfjs.getDocument({
      data: bytes,
      disableFontFace: true,
      enableXfa: false,
      useSystemFonts: false,
      isOffscreenCanvasSupported: false,
      stopAtErrors: false,
      verbosity: 0, // só erros; avisos de fonte padrão não interessam para extrair texto
    });
    const doc = await task.promise;
    const last = Math.min(doc.numPages, maxPages);
    const pages = [];
    let truncated = doc.numPages > maxPages;
    for (let n = 1; n <= last; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let prevY = null;
      let text = "";
      for (const it of content.items) {
        if (typeof it.str !== "string") continue;
        const y = it.transform?.[5] ?? null;
        text += prevY !== null && y !== null && Math.abs(y - prevY) > 2 ? `\n${it.str}` : it.str;
        prevY = y;
      }
      text = text.replace(/[ \t]+/g, " ").trim();
      if (text.length > maxCharsPerPage) {
        text = text.slice(0, maxCharsPerPage);
        truncated = true;
      }
      pages.push({ page: n, text });
      page.cleanup();
    }
    parentPort.postMessage({ ok: true, pages, total: doc.numPages, truncated });
  } catch (err) {
    const name = err?.name ?? "";
    const kind = name === "PasswordException" ? "protegido" : name === "InvalidPDFException" ? "invalido" : "erro";
    parentPort.postMessage({ ok: false, kind, message: String(err?.message ?? err).slice(0, 200) });
  } finally {
    await task?.destroy().catch(() => {});
  }
});
