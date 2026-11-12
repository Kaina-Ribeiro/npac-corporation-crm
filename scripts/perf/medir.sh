#!/usr/bin/env bash
# Mede um endpoint da API de medição (`pnpm perf:api`, porta 4150).
# Uso: scripts/perf/medir.sh <usuario> <metodo> <caminho> [corpo-json]
#   ex.: scripts/perf/medir.sh igor GET /api/leads?page=1
#        scripts/perf/medir.sh operacao POST /api/mentoria/plano/semana '{}'
# Loga, faz 1 chamada de aquecimento e imprime a mediana de 5 em ms.
set -euo pipefail
usuario=${1:?usuario}; metodo=${2:?metodo}; caminho=${3:?caminho}; corpo=${4:-}
base=${PERF_API:-http://localhost:4150}
origin=http://localhost:3150
jar=$(mktemp); trap 'rm -f "$jar"' EXIT

status=$(curl -s -o /dev/null -w '%{http_code}' -c "$jar" -H "Origin: $origin" \
  -H 'Content-Type: application/json' -X POST "$base/api/auth/sign-in/username" \
  -d "{\"username\":\"$usuario\",\"password\":\"senha-do-e2e-123\"}")
[ "$status" = 200 ] || { echo "login de $usuario falhou: HTTP $status" >&2; exit 1; }

chamar() {
  local args=(-s -o /dev/null -w '%{http_code} %{time_total}' -b "$jar" -H "Origin: $origin" -X "$metodo")
  [ -n "$corpo" ] && args+=(-H 'Content-Type: application/json' -d "$corpo")
  curl "${args[@]}" "$base$caminho"
}

read -r code _ <<<"$(chamar)"
[ "$code" -lt 400 ] || { echo "$metodo $caminho deu HTTP $code" >&2; exit 1; }
tempos=()
for _ in 1 2 3 4 5; do
  read -r _ t <<<"$(chamar)"
  tempos+=("$(awk -v t="$t" 'BEGIN { printf "%d", t * 1000 }')")
done
mediana=$(printf '%s\n' "${tempos[@]}" | sort -n | sed -n 3p)
echo "$usuario $metodo $caminho: ${mediana} ms (${tempos[*]})"
