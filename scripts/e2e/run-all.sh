#!/usr/bin/env bash
# Roda TODAS as jornadas de navegador numa pilha de teste isolada (reiniciada entre as suítes,
# para que cada uma comece com o banco em memória vazio). Falha se qualquer jornada falhar.
# Uso: bash scripts/e2e/run-all.sh [--build]
set -uo pipefail
cd "$(dirname "$0")/../.."
OUT=${E2E_OUT:-e2e-out}
case "$OUT" in /*) ;; *) OUT="$PWD/$OUT" ;; esac  # caminho absoluto: não grava dentro do repositório
mkdir -p "$OUT"
export AXE_PATH=${AXE_PATH:-$PWD/scripts/node_modules/axe-core/axe.min.js}
status=0
first=1
for suite in e2e-testar e2e-docente e2e-jornadas e2e-regressao e2e-longo e2e-continuidade e2e-jornada-completa e2e-tv e2e-responsivo; do
  if [ $first = 1 ] && [ "${1:-}" = "--build" ]; then bash scripts/e2e/stack.sh --build || exit 1; else bash scripts/e2e/stack.sh || exit 1; fi
  first=0
  echo "── $suite"
  if (cd scripts && E2E_SHOTS="$OUT/$suite" node "$suite.mjs"); then
    echo "$suite: ok" >> "$OUT/resumo.txt"
  else
    echo "$suite: FALHOU" >> "$OUT/resumo.txt"; status=1
  fi
done
pkill -f e2e-server.ts 2>/dev/null; pkill -f e2e-fake-auth.mjs 2>/dev/null; pkill -f scripts/e2e/static-server.mjs 2>/dev/null
cat "$OUT/resumo.txt"
exit $status
