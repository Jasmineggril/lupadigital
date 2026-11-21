#!/usr/bin/env bash
# Teste de RESTAURAÇÃO em banco DESCARTÁVEL de desenvolvimento (nunca produção).
#
#   RESTORE_URL=postgres://.../lupa_restore  BACKUP_PASSPHRASE=...  bash scripts/ops/restore-test.sh arquivo.dump.enc
#
# Confere: integridade (sha256), descriptografia, restauração sem erro, migrações registradas ×
# arquivos do repositório, RLS ligada em todas as tabelas públicas e isolamento A/B
# (scripts/security/rls-isolation.mjs). Imprime contagem de linhas por tabela.
set -euo pipefail
FILE=${1:?arquivo .dump.enc}
: "${RESTORE_URL:?defina RESTORE_URL (banco descartável)}"
: "${BACKUP_PASSPHRASE:?defina BACKUP_PASSPHRASE}"
case "$RESTORE_URL" in *zhwopvepavcoisclsjnk*) echo "Recusado: RESTORE_URL aponta para produção."; exit 2;; esac
cd "$(dirname "$0")/../.."
[ -f "$FILE.sha256" ] && sha256sum -c "$FILE.sha256"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT; chmod 700 "$TMP"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:BACKUP_PASSPHRASE -in "$FILE" -out "$TMP/db.dump"
# Banco de restauração precisa existir vazio; papéis do Supabase são recriados se faltarem
psql "$RESTORE_URL" -v ON_ERROR_STOP=1 -q -c "DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END \$\$;"
# Banco descartável: começa vazio (o "public" padrão do CREATE DATABASE é removido)
psql "$RESTORE_URL" -v ON_ERROR_STOP=1 -q -c "DROP SCHEMA IF EXISTS public CASCADE"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$RESTORE_URL" "$TMP/db.dump"
echo "── restaurado"
echo "── migrações: banco × repositório"
psql "$RESTORE_URL" -tA -c "select version from supabase_migrations.schema_migrations order by 1" 2>/dev/null > "$TMP/db-mig.txt" || echo "(sem tabela de migrações do Supabase no dump — conferir pelo esquema)"
ls supabase/migrations | sed 's/_.*//' | sort > "$TMP/repo-mig.txt"
if [ -s "$TMP/db-mig.txt" ]; then diff "$TMP/repo-mig.txt" "$TMP/db-mig.txt" && echo "migrações conferem"; fi
echo "── tabelas públicas sem RLS (esperado: nenhuma)"
psql "$RESTORE_URL" -tA -c "select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r' and not relrowsecurity"
echo "── linhas por tabela"
psql "$RESTORE_URL" -tA -c "select relname, n_live_tup from pg_stat_user_tables where schemaname='public' order by 1"
echo "── isolamento A/B"
psql "$RESTORE_URL" -q -f scripts/security/local-supabase-grants.sql
LUPA_ALLOW_RLS_TEST=sim DATABASE_URL="$RESTORE_URL" node scripts/security/rls-isolation.mjs | tail -1
