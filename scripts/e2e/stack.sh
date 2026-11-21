#!/usr/bin/env bash
# Sobe a pilha de TESTE de ponta a ponta (somente desenvolvimento/CI):
#   - auth de teste (54321), API real com banco em memória de testes (3001), build estático (4173).
# Nada aqui usa banco, Auth ou IA de produção. Uso: bash scripts/e2e/stack.sh [--build]
set -euo pipefail
cd "$(dirname "$0")/../.."
LOG=${E2E_LOG_DIR:-/tmp/lupa-e2e}
mkdir -p "$LOG"
if [ "${1:-}" = "--build" ]; then
  (cd artifacts/lupa-publica && VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=e2e pnpm run build > "$LOG/build.log" 2>&1)
fi
pkill -f e2e-server.ts 2>/dev/null || true
pkill -f e2e-fake-auth.mjs 2>/dev/null || true
pkill -f scripts/e2e/static-server.mjs 2>/dev/null || true
sleep 1
nohup node scripts/e2e/static-server.mjs artifacts/lupa-publica/dist/public > "$LOG/web.log" 2>&1 &
nohup node artifacts/api-server/src/scripts/e2e-fake-auth.mjs 54321 > "$LOG/auth.log" 2>&1 &
(cd artifacts/api-server; SUPABASE_JWKS_URL=http://127.0.0.1:54321/auth/v1/.well-known/jwks.json LUPA_TEST_AUTH_URL=http://127.0.0.1:54321 PORT=3001 \
  RATE_LIMIT_AI_ANON_PER_HOUR=1000 RATE_LIMIT_OCR_ANON_PER_HOUR=1000 RATE_LIMIT_DEFAULT_MAX=100000 \
  nohup ../../scripts/node_modules/.bin/tsx src/scripts/e2e-server.ts > "$LOG/api.log" 2>&1 &)
for _ in $(seq 1 60); do
  if curl -sf -o /dev/null http://127.0.0.1:3001/api/healthz && curl -sf -o /dev/null http://127.0.0.1:54321/auth/v1/.well-known/jwks.json && curl -sf -o /dev/null http://127.0.0.1:4173/; then
    echo "pilha de teste pronta"; exit 0
  fi
  sleep 1
done
echo "pilha de teste não subiu"; tail -n 30 "$LOG"/*.log; exit 1
