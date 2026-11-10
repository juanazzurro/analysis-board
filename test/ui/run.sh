#!/usr/bin/env bash
# Abre la app con una lista de pasos (MESA_SHOTS) y un perfil de datos aparte, y deja la salida en pantalla.
#   test/ui/run.sh <pasos.json> <carpeta de datos> [light|dark]
# Variables: MESA_LANG (es|en), APP_BIN (ejecutable de una app empaquetada; si falta se usa Electron sobre este repositorio).
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STEPS="$1"; UD="$2"; THEME="${3:-light}"
export MESA_SHOTS="$STEPS" MESA_USERDATA="$UD" MESA_THEME="$THEME"
if [ -n "${APP_BIN:-}" ]; then CMD=("$APP_BIN"); else CMD=("$ROOT/node_modules/.bin/electron" "$ROOT" --no-sandbox --disable-gpu); fi
FILTER='dbus|Fontconfig|libva|viz_main|gpu_init|sandbox_linux|ERROR:bus|object_proxy|gles2|angle|NODE_OPTION|console-message'
if [ "$(uname)" = "Linux" ] && [ -z "${DISPLAY:-}" ]; then
  timeout 420 xvfb-run -a -s "-screen 0 ${SCREEN:-1512x945}x24" "${CMD[@]}" 2>&1 | grep -v -E "$FILTER"
else
  "${CMD[@]}" 2>&1 | grep -v -E "$FILTER"
fi
exit 0
