# LUPA Digital — imagens para servidor próprio (CIIA). Contexto do build: RAIZ do repositório.
#   docker compose -f deploy/ciia/docker-compose.yml build
# Duas imagens: "api" (Node, só o pacote compilado, sem node_modules) e "web" (Caddy: HTTPS,
# arquivos do site e encaminhamento de /api para a API).

# ── build ────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY . .
RUN pnpm install --frozen-lockfile --prod=false
# Variáveis PÚBLICAS do site (vão para o navegador; nunca coloque chaves secretas aqui)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_SENTRY_DSN=""
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY VITE_SENTRY_DSN=$VITE_SENTRY_DSN BASE_PATH=/
RUN test -n "$VITE_SUPABASE_URL" && test -n "$VITE_SUPABASE_ANON_KEY" || (echo "Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env" && exit 1)
RUN pnpm --filter @workspace/api-server run build && pnpm --filter @workspace/lupa-publica run build

# ── api ──────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS api
ENV NODE_ENV=production PORT=3001
WORKDIR /app
COPY --from=build --chown=node:node /repo/artifacts/api-server/dist/ /app/
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "index.mjs"]

# ── web ──────────────────────────────────────────────────────────────────────
FROM caddy:2.10-alpine AS web
COPY deploy/ciia/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/artifacts/lupa-publica/dist/public/ /srv/
