/**
 * Servidor estático do build (dist/public) em :4173, com /api → :3001 e SPA fallback.
 * SOMENTE para os testes de ponta a ponta (ambiente controlado).
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "artifacts/lupa-publica/dist/public");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".json": "application/json", ".ico": "image/x-icon", ".woff2": "font/woff2" };
http
  .createServer((req, res) => {
    if (req.url.startsWith("/api/")) {
      const p = http.request({ host: "127.0.0.1", port: 3001, path: req.url, method: req.method, headers: req.headers }, (r) => {
        res.writeHead(r.statusCode, r.headers);
        r.pipe(res);
      });
      p.on("error", () => {
        res.writeHead(502);
        res.end();
      });
      req.pipe(p);
      return;
    }
    let f = path.join(root, decodeURIComponent(req.url.split("?")[0]));
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, "index.html");
    res.writeHead(200, { "content-type": types[path.extname(f)] ?? "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  })
  .listen(4173, "127.0.0.1", () => console.log("web on 4173"));
