#!/usr/bin/env bash
# Pruebas sin interfaz: lector de PGN, libro de aperturas, árbol de variantes, devoluciones y explicaciones en los dos idiomas.
# Las que usan el motor (core-test, motif-test) corren solo si está bin/stockfish.
#   npm test
set -euo pipefail
cd "$(dirname "$0")/.."
run() { npx esbuild "test/$1.js" --bundle --platform=node --outfile="test/$1.cjs" --log-level=error; shift; "$@"; }
run eco-test node test/eco-test.cjs
run parse-test node test/parse-test.cjs
run v2-test node test/v2-test.cjs
run explain-all node test/explain-all.cjs test/fixture/demo/library.json jugador | tail -1
MESA_LANG=en node test/explain-all.cjs test/fixture/demo/library.json jugador | tail -1
if [ -x bin/stockfish ]; then run core-test node test/core-test.cjs | tail -1; run motif-test node test/motif-test.cjs | tail -1; else echo "(sin bin/stockfish: se saltean las pruebas con motor)"; fi
echo "PRUEBAS OK"
