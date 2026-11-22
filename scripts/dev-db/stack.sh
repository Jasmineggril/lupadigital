#!/usr/bin/env bash
# Banco REAL de desenvolvimento para provar persistência durável (não memória):
#   Postgres local (54329) com TODAS as migrações + PostgREST (o mesmo serviço do Supabase) +
#   proxy /rest/v1. Imprime as variáveis para a API usar (SUPABASE_URL / SERVICE_ROLE_KEY).
# Uso: bash scripts/dev-db/stack.sh [--reset]    Só desenvolvimento; nunca aponta para produção.
set -euo pipefail
cd "$(dirname "$0")/../.."
PG=${DEVDB_PG:-postgres://postgres@127.0.0.1:54329}
DB=${DEVDB_NAME:-lupa_dev}
OUT=${DEVDB_OUT:-/tmp/lupa-devdb}
mkdir -p "$OUT"
if [ "${1:-}" = "--reset" ] || ! psql "$PG/$DB" -tAc "select 1" >/dev/null 2>&1; then
  psql "$PG/postgres" -qc "drop database if exists $DB" -c "create database $DB"
  psql "$PG/$DB" -q -v ON_ERROR_STOP=1 -f scripts/security/ci-db-bootstrap.sql
  for f in supabase/migrations/*.sql; do psql "$PG/$DB" -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>"$OUT/migr.err" || { echo "migração falhou: $f"; cat "$OUT/migr.err"; exit 1; }; done
  psql "$PG/$DB" -q -v ON_ERROR_STOP=1 -f scripts/security/local-supabase-grants.sql
  psql "$PG/$DB" -q -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticator') THEN CREATE ROLE authenticator LOGIN NOINHERIT; END IF; END $$;
ALTER ROLE service_role BYPASSRLS; -- igual ao Supabase (papel pode existir de antes no cluster local)
GRANT anon, authenticated, service_role TO authenticator;
SQL
fi
SECRET_FILE="$OUT/jwt-secret"
[ -f "$SECRET_FILE" ] || node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))' > "$SECRET_FILE"
SECRET=$(cat "$SECRET_FILE")
docker rm -f lupa-postgrest >/dev/null 2>&1 || true
docker run -d --name lupa-postgrest --network host \
  -e PGRST_DB_URI="postgres://authenticator@127.0.0.1:54329/$DB" -e PGRST_DB_SCHEMAS=public \
  -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="$SECRET" -e PGRST_SERVER_PORT=3010 \
  -e PGRST_DB_POOL=10 postgrest/postgrest:v12.2.3 >/dev/null
pkill -f scripts/dev-db/rest-proxy.mjs 2>/dev/null || true
nohup node scripts/dev-db/rest-proxy.mjs 54330 > "$OUT/proxy.log" 2>&1 &
KEY=$(cd artifacts/api-server && node --input-type=module -e "import {SignJWT} from 'jose'; console.log(await new SignJWT({role:'service_role'}).setProtectedHeader({alg:'HS256'}).setIssuedAt().sign(new TextEncoder().encode(process.argv[1])))" "$SECRET")
for _ in $(seq 1 30); do curl -sf -o /dev/null -H "apikey: $KEY" -H "authorization: Bearer $KEY" http://127.0.0.1:54330/rest/v1/agent_results?limit=1 && break; sleep 1; done
printf 'export SUPABASE_URL=http://127.0.0.1:54330\nexport SUPABASE_SERVICE_ROLE_KEY=%s\n' "$KEY" > "$OUT/env"
echo "banco real pronto: $DB (variáveis em $OUT/env)"
