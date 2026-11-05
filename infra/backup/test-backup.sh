#!/bin/sh
# Teste do backup cifrado no dev (Docker local): cria o banco npac_test_backup com marcadores
# sintéticos, roda backup.sh num postgres:16-alpine com age, confere com verify-backup.sh que
# os artefatos não têm texto em claro e que decifram e restauram com a chave privada de teste.
#   sh infra/backup/test-backup.sh        (na raiz do repo, com `docker compose up -d`)
# A chave de teste nasce e morre dentro do contêiner. Nada de dado real.
set -eu
cd "$(dirname "$0")/../.."
pw=$(sed -n 's/^OWNER_DB_PASSWORD=//p' .env | tr -d '\r"')
net=${BACKUP_TEST_NETWORK:-npac-corporation_default}
db=npac_test_backup
pg="docker exec -i npac-corporation-postgres-1 psql -q -v ON_ERROR_STOP=1 -U npac_owner"

$pg -d postgres -c "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db"
trap '$pg -d postgres -c "DROP DATABASE IF EXISTS $db" >/dev/null' EXIT
$pg -d "$db" -c "CREATE TABLE marcadores (nome text, nota text);
  INSERT INTO marcadores VALUES ('Mentorado Fictício 01', 'MARCADOR-SENSIVEL-TESTE');"

MSYS_NO_PATHCONV=1 docker run --rm --network "$net" \
  -e PGHOST=postgres -e PGUSER=npac_owner -e PGPASSWORD="$pw" -e PGDATABASE="$db" \
  -v "$(pwd)/infra/backup:/scripts:ro" postgres:16-alpine sh -euc '
    apk add --no-cache age >/dev/null
    mkdir -p /backups /media /keys
    printf "foto MARCADOR-SENSIVEL-TESTE" > /media/arquivo-de-teste
    age-keygen -o /keys/id 2>/dev/null
    export BACKUP_AGE_RECIPIENT=$(age-keygen -y /keys/id)
    /scripts/backup.sh
    dump=$(ls /backups/*.dump.enc)
    tarball=$(ls /backups/*.media.tar.enc)
    sh /scripts/verify-backup.sh "$dump"
    sh /scripts/verify-backup.sh "$tarball"
    # Controle: com a chave privada o dump restaura e o marcador volta (prova que estava lá).
    age -d -i /keys/id "$dump" | pg_restore --data-only -f - | grep -q MARCADOR-SENSIVEL-TESTE
    age -d -i /keys/id "$tarball" | tar -xOf - ./arquivo-de-teste | grep -q MARCADOR-SENSIVEL-TESTE
    echo "restauração ok: dump e mídia decifram com a chave privada"
  '
echo "teste do backup: ok"
