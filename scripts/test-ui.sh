#!/usr/bin/env bash
# Pruebas de interfaz: recorrido completo en castellano y en inglés, y las funciones nuevas. Deja capturas en test/ui/out/.
#   npm run test:ui            (en Linux hace falta xvfb; el motor tiene que estar en bin/stockfish)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
OUT="$ROOT/test/ui/out"; rm -rf "$OUT"; mkdir -p "$OUT/shots"
node build.mjs
profile() { rm -rf "$OUT/ud-$1"; mkdir -p "$OUT/ud-$1"; cp test/fixture/demo/*.json "$OUT/ud-$1/"; }
for lang in es en; do
  profile "$lang"; python3 test/ui/suite.py "$lang" "$OUT/shots" "$OUT/suite-$lang.json" >/dev/null
  MESA_LANG="$lang" bash test/ui/run.sh "$OUT/suite-$lang.json" "$OUT/ud-$lang" > "$OUT/suite-$lang.txt" || true
done
profile feat; python3 test/ui/features.py "$OUT/shots" "$OUT/features.json" >/dev/null
MESA_LANG=es bash test/ui/run.sh "$OUT/features.json" "$OUT/ud-feat" > "$OUT/features.txt" || true
python3 test/ui/check.py "$OUT/suite-es.txt" "$OUT/suite-en.txt" "$OUT/features.txt"
