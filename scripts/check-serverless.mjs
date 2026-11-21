/**
 * Verifica se o bundle do Vercel (api/index.js) carrega SOZINHO, sem node_modules,
 * como acontece na função serverless. Pega dependências marcadas como "external"
 * por engano (ex.: @opentelemetry/* usado pelo @sentry/node), que derrubavam a API
 * inteira com FUNCTION_INVOCATION_FAILED.
 *
 * Uso: node scripts/check-serverless.mjs   (depois do build da API)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

/** PDF mínimo de uma página (texto fictício), para testar o worker empacotado. */
function tinyPdf(text) {
  const stream = `BT /F1 12 Tf 40 780 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [4 0 R] /Count 1 >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const off = [];
  objs.forEach((o, i) => {
    off.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lupa-serverless-"));
fs.mkdirSync(path.join(dir, "api"));
for (const f of ["index.js", "package.json", "_pdf-worker.mjs"]) fs.copyFileSync(path.join(root, "api", f), path.join(dir, "api", f));

process.env.NODE_ENV = "production";
let app;
try {
  app = (await import(pathToFileURL(path.join(dir, "api", "index.js")).href)).default;
} catch (err) {
  console.error("✗ api/index.js não carrega isolado:", err.message);
  process.exit(1);
}
const server = http.createServer((req, res) => app(req, res));
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const res = await fetch(`http://127.0.0.1:${server.address().port}/api/healthz`);
server.close();
// O worker de PDF empacotado precisa carregar SOZINHO (sem node_modules) e extrair texto
const pdfText = await new Promise((resolve) => {
  const w = new Worker(path.join(dir, "api", "_pdf-worker.mjs"));
  const t = setTimeout(() => {
    w.terminate();
    resolve(null);
  }, 20000);
  w.once("message", (m) => {
    clearTimeout(t);
    w.terminate();
    resolve(m.ok ? m.pages.map((p) => p.text).join(" ") : null);
  });
  w.once("error", () => {
    clearTimeout(t);
    resolve(null);
  });
  w.postMessage({ bytes: tinyPdf("LUPA teste serverless"), maxPages: 5, maxCharsPerPage: 1000 });
});
fs.rmSync(dir, { recursive: true, force: true });
if (pdfText !== "LUPA teste serverless") {
  console.error("✗ api/_pdf-worker.mjs não extraiu texto isolado:", pdfText);
  process.exit(1);
}
console.log("✓ api/_pdf-worker.mjs carrega isolado e extrai texto");
if (res.status !== 200) {
  console.error(`✗ /api/healthz respondeu ${res.status}`);
  process.exit(1);
}
console.log("✓ api/index.js carrega isolado e /api/healthz responde 200");
process.exit(0);
