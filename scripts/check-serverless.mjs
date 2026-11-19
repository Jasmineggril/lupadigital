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

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lupa-serverless-"));
fs.mkdirSync(path.join(dir, "api"));
for (const f of ["index.js", "package.json"]) fs.copyFileSync(path.join(root, "api", f), path.join(dir, "api", f));

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
fs.rmSync(dir, { recursive: true, force: true });
if (res.status !== 200) {
  console.error(`✗ /api/healthz respondeu ${res.status}`);
  process.exit(1);
}
console.log("✓ api/index.js carrega isolado e /api/healthz responde 200");
process.exit(0);
