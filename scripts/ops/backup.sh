#!/usr/bin/env bash
# Backup lógico CRIPTOGRAFADO do banco (schemas public e auth).
#
#   DATABASE_URL=postgres://...  BACKUP_PASSPHRASE=...  bash scripts/ops/backup.sh [pasta]
#
# - pg_dump --format=custom (restauração seletiva); precisa de pg_dump da MESMA versão principal
#   do servidor ou mais nova (produção: Postgres 17 → postgresql-client-17).
# - Criptografia simétrica AES-256 (openssl, PBKDF2 com 600 mil iterações). A senha fica só no
#   cofre de quem opera; sem ela o arquivo não serve para nada (e não pode ser recuperado).
# - O schema auth contém e-mails e hashes de senha: o arquivo é DADO PESSOAL SENSÍVEL — guardar
#   só em local com acesso restrito; nunca em repositório, chat ou e-mail.
# - Gera também um .sha256 para conferir integridade na restauração.
set -euo pipefail
: "${DATABASE_URL:?defina DATABASE_URL}"
: "${BACKUP_PASSPHRASE:?defina BACKUP_PASSPHRASE (cofre)}"
OUT=${1:-backups}
mkdir -p "$OUT"
chmod 700 "$OUT"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
FILE="$OUT/lupa-$STAMP.dump.enc"
umask 077
pg_dump --format=custom --no-owner --no-privileges --schema=public --schema=auth --schema=supabase_migrations "$DATABASE_URL" \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass env:BACKUP_PASSPHRASE -out "$FILE"
sha256sum "$FILE" > "$FILE.sha256"
echo "backup: $FILE ($(du -h "$FILE" | cut -f1))"
# Retenção local: mantém os últimos N (padrão 14)
KEEP=${BACKUP_KEEP:-14}
ls -1t "$OUT"/lupa-*.dump.enc 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do rm -f "$old" "$old.sha256"; done
