// Proxy mínimo: o supabase-js chama <url>/rest/v1/<tabela>; o PostgREST local responde em /<tabela>.
// Só para a pilha de DESENVOLVIMENTO (scripts/dev-db/stack.sh). Nunca aponta para produção.
import http from "node:http";
const target = Number(process.env.PGRST_PORT ?? 3010);
const port = Number(process.argv[2] ?? 54330);
http
  .createServer((req, res) => {
    const path = (req.url ?? "/").replace(/^\/rest\/v1/, "") || "/";
    const up = http.request({ host: "127.0.0.1", port: target, path, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${target}` } }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    up.on("error", () => {
      res.writeHead(502);
      res.end("postgrest indisponível");
    });
    req.pipe(up);
  })
  .listen(port, "127.0.0.1", () => console.log(`rest-proxy ${port} → postgrest ${target}`));
