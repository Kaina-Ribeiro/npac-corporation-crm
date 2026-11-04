#!/bin/sh
# Prova que o último backup restaura: decifra com a chave PRIVADA age (fora da VM, montada só
# para o teste em BACKUP_AGE_IDENTITY), carrega num banco temporário, confere tabelas
# essenciais e apaga. Rode semanalmente (ou antes de qualquer migração arriscada):
#   docker compose -f docker-compose.prod.yml run --rm \
#     -v /caminho/da/chave:/keys/id:ro -e BACKUP_AGE_IDENTITY=/keys/id backup /scripts/restore-check.sh
set -eu
: "${BACKUP_AGE_IDENTITY:?monte a chave privada age e defina BACKUP_AGE_IDENTITY}"
command -v age >/dev/null || apk add --no-cache age >/dev/null
latest=$(ls -1t /backups/npac-*.dump.enc 2>/dev/null | head -n1)
[ -n "$latest" ] || { echo "nenhum backup encontrado"; exit 1; }
db=npac_restore_check
psql -v ON_ERROR_STOP=1 -d postgres -c "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db"
trap 'psql -d postgres -c "DROP DATABASE IF EXISTS $db" >/dev/null' EXIT
age -d -i "$BACKUP_AGE_IDENTITY" "$latest" | pg_restore --no-owner --exit-on-error -d "$db"
psql -v ON_ERROR_STOP=1 -d "$db" -At -c "
  SELECT 'users=' || count(*) FROM \"user\";
  SELECT 'leads=' || count(*) FROM leads;
  SELECT 'deals=' || count(*) FROM deals;
  SELECT 'mentoria_fichas=' || count(*) FROM mentoria_fichas;
  SELECT 'migrations=' || count(*) FROM drizzle.__drizzle_migrations;"
echo "restore ok: $(basename "$latest")"
