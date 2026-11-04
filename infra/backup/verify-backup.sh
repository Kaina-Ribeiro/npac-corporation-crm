#!/bin/sh
# Confere que um artefato de backup está cifrado (age) e não tem texto em claro.
#   verify-backup.sh <arquivo> [marcador ...]
# Sai 0 só se o arquivo começa com o cabeçalho do age e nenhum marcador aparece. Os marcadores
# padrão são os textos sintéticos do teste (nunca dado real). Não imprime o conteúdo.
set -eu
file=${1:?uso: verify-backup.sh <arquivo> [marcador ...]}
shift
[ -s "$file" ] || { echo "FALHA: arquivo vazio ou inexistente"; exit 1; }
if [ "$#" -eq 0 ]; then set -- 'Mentorado Fictício' 'MARCADOR-SENSIVEL-TESTE'; fi
if ! head -c 21 "$file" | grep -q 'age-encryption.org/v1'; then
  echo "FALHA: $(basename "$file") não está cifrado com age"
  exit 1
fi
for m in "$@"; do
  if grep -a -q -F -- "$m" "$file"; then
    echo "FALHA: $(basename "$file") tem texto em claro (marcador $(printf %s "$m" | wc -c) bytes)"
    exit 1
  fi
done
echo "ok: $(basename "$file") cifrado, sem marcadores em claro"
