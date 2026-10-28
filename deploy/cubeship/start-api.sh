#!/bin/sh
# Entrada da imagem da API no Cubeship (não há passo de release: a migração roda aqui).
set -e
case "$NPAC_PROCESS" in
  retention)
    while true; do
      node node_modules/@npac/db/dist/retention-cli.js
      sleep 86400
    done
    ;;
  *)
    # Idempotente: com várias cópias, a segunda só encontra tudo aplicado.
    node node_modules/@npac/db/dist/migrate-cli.js
    exec node dist/main.js
    ;;
esac
