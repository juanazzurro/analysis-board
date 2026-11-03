#!/usr/bin/env bash
# Arma "Analysis Board.app" para Mac con Apple Silicon y la deja en dist/ junto con el .zip para publicar.
#
#   npm install
#   npm run package:mac
#
# Funciona en macOS (usa codesign y ditto) y también en Linux (usa rcodesign y Python para el zip).
# La firma es "ad hoc" (sin cuenta de desarrollador de Apple): ver el README para abrirla la primera vez.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ELECTRON_VERSION="45.2.1"
STOCKFISH_TAG="sf_18"
BUNDLE_ID="ar.juanazzurro.mesa-de-analisis"
APP_NAME="Analysis Board"
VERSION="$(node -p "require('./package.json').version")"
CACHE="$ROOT/.cache"
DIST="$ROOT/dist"
APP="$DIST/$APP_NAME.app"
ZIP="$DIST/Analysis-Board-$VERSION-mac.zip"

echo "→ Analysis Board $VERSION"
mkdir -p "$CACHE" "$DIST"

# 1. Interfaz
node build.mjs

# 2. Electron y Stockfish (se descargan una sola vez)
EZIP="$CACHE/electron-v$ELECTRON_VERSION-darwin-arm64.zip"
STAR="$CACHE/stockfish-macos-m1-apple-silicon.tar"
[ -f "$EZIP" ] || curl -fL -o "$EZIP" "https://github.com/electron/electron/releases/download/v$ELECTRON_VERSION/electron-v$ELECTRON_VERSION-darwin-arm64.zip"
[ -f "$STAR" ] || curl -fL -o "$STAR" "https://github.com/official-stockfish/Stockfish/releases/download/$STOCKFISH_TAG/stockfish-macos-m1-apple-silicon.tar"

# 3. Electron.app → Analysis Board.app
rm -rf "$APP" "$CACHE/electron" "$CACHE/stockfish"
mkdir -p "$CACHE/electron"
if command -v ditto >/dev/null; then ditto -x -k "$EZIP" "$CACHE/electron"; else unzip -q "$EZIP" -d "$CACHE/electron"; fi
mv "$CACHE/electron/Electron.app" "$APP"
tar -xf "$STAR" -C "$CACHE"

RES="$APP/Contents/Resources"
rm -f "$RES/default_app.asar" "$RES/electron.icns"
cp build/icon.icns "$RES/icon.icns"
cp "$CACHE/stockfish/stockfish-macos-m1-apple-silicon" "$RES/stockfish"
chmod 755 "$RES/stockfish"
cp "$CACHE/stockfish/Copying.txt" "$RES/stockfish-LICENSE.txt"
cp node_modules/chessground/LICENSE "$RES/chessground-LICENSE.txt"

# 4. El código de la app
A="$RES/app"
mkdir -p "$A/renderer" "$A/data" "$A/vendor"
cp main.js preload.js "$A/"
cp renderer/index.html renderer/app.js renderer/styles.css "$A/renderer/"
cp data/puzzles-base.json "$A/data/"
cp vendor/fzstd.js vendor/fzstd-LICENSE "$A/vendor/"
node -e '
const p = require("./package.json");
const out = { name: p.name, productName: p.productName, version: p.version, main: "main.js", license: p.license };
require("fs").writeFileSync(process.argv[1], JSON.stringify(out, null, 2) + "\n");
' "$A/package.json"

# 5. Info.plist: nombre, identificador, versión, categoría (educación, no "juegos": evita el Modo Juego de macOS)
python3 - "$APP" "$BUNDLE_ID" "$APP_NAME" "$VERSION" <<'PY'
import plistlib, sys, os
app, bid, name, ver = sys.argv[1:]
def edit(path, fn):
    with open(path, "rb") as f: d = plistlib.load(f)
    fn(d)
    with open(path, "wb") as f: plistlib.dump(d, f)
def main(d):
    d.update(CFBundleIdentifier=bid, CFBundleName=name, CFBundleDisplayName=name, CFBundleShortVersionString=ver, CFBundleVersion=ver,
             CFBundleIconFile="icon.icns", LSApplicationCategoryType="public.app-category.education", GCSupportsGameMode=False,
             NSHumanReadableCopyright="Stockfish 18 (GPL-3.0) · chessground (GPL-3.0) · piezas cburnett (CC BY-SA 3.0)")
    d.pop("ElectronAsarIntegrity", None)
edit(os.path.join(app, "Contents", "Info.plist"), main)
fw = os.path.join(app, "Contents", "Frameworks")
for h in os.listdir(fw):
    if not h.endswith(".app"): continue
    exe = h[:-4]
    suffix = exe.replace("Electron Helper", "").strip(" ()")
    def helper(d, exe=exe, suffix=suffix):
        d["CFBundleExecutable"] = exe
        d["CFBundleIdentifier"] = bid + ".helper" + ("." + suffix if suffix else "")
    edit(os.path.join(fw, h, "Contents", "Info.plist"), helper)
PY

# 6. Firma ad hoc
if command -v codesign >/dev/null; then
  codesign --force --deep --sign - "$APP"
elif command -v rcodesign >/dev/null; then
  rcodesign sign "$APP" >/dev/null
else
  echo "⚠ No encontré codesign ni rcodesign: la app queda sin firmar." >&2
fi

# 7. Zip para publicar (con los enlaces simbólicos de los frameworks intactos)
rm -f "$ZIP"
if command -v ditto >/dev/null; then
  (cd "$DIST" && ditto -c -k --sequesterRsrc --keepParent "$APP_NAME.app" "$(basename "$ZIP")")
else
  python3 scripts/mkzip.py "$DIST" "$APP_NAME.app" "$ZIP"
fi
echo "✓ $APP"
echo "✓ $ZIP"
