#!/bin/sh
# Prova que o último backup restaura: carrega num banco temporário, confere tabelas
# essenciais e apaga. Rode semanalmente (ou antes de qualquer migração arriscada):
#   docker compose -f docker-compose.prod.yml exec backup /scripts/restore-check.sh
set -eu
latest=$(ls -1t /backups/npac-*.dump 2>/dev/null | head -n1)
[ -n "$latest" ] || { echo "nenhum backup encontrado"; exit 1; }
db=npac_restore_check
psql -v ON_ERROR_STOP=1 -d postgres -c "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db"
trap 'psql -d postgres -c "DROP DATABASE IF EXISTS $db" >/dev/null' EXIT
pg_restore --no-owner --exit-on-error -d "$db" "$latest"
psql -v ON_ERROR_STOP=1 -d "$db" -At -c "
  SELECT 'users=' || count(*) FROM \"user\";
  SELECT 'leads=' || count(*) FROM leads;
  SELECT 'deals=' || count(*) FROM deals;
  SELECT 'migrations=' || count(*) FROM drizzle.__drizzle_migrations;"
echo "restore ok: $(basename "$latest")"
