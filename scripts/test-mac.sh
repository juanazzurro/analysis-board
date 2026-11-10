#!/usr/bin/env bash
# Prueba la app ya empaquetada (dist/Analysis Board.app) en una Mac de verdad. Es lo que no se puede probar en Linux:
#   1. arranca, el motor nativo responde, el menú existe y la consulta a GitHub funciona;
#   2. abre un archivo .pgn con "Abrir con" (como desde el Finder);
#   3. rechaza una actualización cuya huella no coincide con la publicada;
#   4. instala una actualización: se reemplaza a sí misma y vuelve a abrir.
# Deja la salida y las capturas en test/ui/out-mac/.   Uso: bash scripts/test-mac.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
[ "$(uname)" = "Darwin" ] || { echo "Solo en macOS."; exit 1; }
VERSION="$(node -p "require('./package.json').version")"
OUT="$ROOT/test/ui/out-mac"; rm -rf "$OUT"; mkdir -p "$OUT"
WORK="$(mktemp -d)"; APPS="$WORK/Applications"; mkdir -p "$APPS"
ditto "dist/Analysis Board.app" "$APPS/Analysis Board.app"
APP="$APPS/Analysis Board.app"; BIN="$APP/Contents/MacOS/Electron"
fail=0; note() { echo "== $*"; }
profile() { rm -rf "$WORK/ud-$1"; mkdir -p "$WORK/ud-$1"; cp test/fixture/demo/*.json "$WORK/ud-$1/"; echo "$WORK/ud-$1"; }
quit_app() { pkill -f "$APPS/Analysis Board.app" 2>/dev/null; sleep 1; }
W='const w=(ms)=>new Promise(r=>setTimeout(r,ms));'

note "codesign"; codesign --verify --deep --strict "$APP" && echo ok || fail=1
note "Info.plist"; /usr/bin/plutil -extract CFBundleShortVersionString raw -o - "$APP/Contents/Info.plist"

# ---------- 1. arranque, motor, menú, GitHub ----------
note "1. arranque"
UD="$(profile boot)"
cat > "$WORK/boot.json" <<JSON
[{"wait":1500,"js":"window.__errs=[]; addEventListener('error',e=>__errs.push(e.message)); addEventListener('unhandledrejection',e=>__errs.push(String(e.reason&&e.reason.stack||e.reason))); (async()=>{const s=await window.api.sysInfo(); return ['EXPECT platform', s.platform==='darwin' && s.version==='$VERSION' && s.menu>=5, s.platform, s.version, s.menu, s.cores]})()"},
 {"wait":300,"js":"['EXPECT fonts', getComputedStyle(document.body).fontFamily.includes('Asap') && [...document.fonts].some(f=>f.status==='loaded'&&/Piazzolla/.test(f.family)), document.querySelector('.td-head h1').textContent]","shot":"$OUT/mac-today.png"},
 {"wait":300,"js":"(async()=>{$W document.querySelector('[data-view=\"library\"]').click(); await w(500); document.querySelector('.lib-row[data-id=\"chesscom-83et6o\"]').click(); await w(2500); const A=__mesaAnalysis; const s=document.querySelector('[data-act=\"rv-skip\"]'); if(s){s.click(); await w(500);} A.tab('moves'); A.go(24); let n=0; for(let i=0;i<40&&!n;i++){await w(500); n=A.state().live;} const d=document.getElementById('anEngMeta').textContent; A.playBest(); await w(1500); const st=A.state(); return ['EXPECT engine', n>=1 && st.depth===25, n, d, st.depth, st.inVar]})()","shot":"$OUT/mac-analysis.png"},
 {"wait":300,"js":"(async()=>{try{const u=await window.api.checkUpdate(); return ['EXPECT github', typeof u.current==='string' && u.current==='$VERSION' && typeof u.newer==='boolean', u.latest, u.newer]}catch(e){const m=String(e.message); /* los servidores de GitHub Actions comparten IP y a veces agotan el cupo sin clave: no es una falla de la app */ return ['EXPECT github', /\(403\)|\(429\)/.test(m), 'sin cupo: '+m.slice(-60)]}})()"},
 {"wait":300,"js":"(async()=>{$W document.querySelector('[data-view=\"diagnosis\"]').click(); await w(1500); return ['EXPECT diagnosis', /14/.test(document.querySelector('.dg-head .sub').textContent), document.querySelector('.dg-head .sub').textContent]})()","shot":"$OUT/mac-diagnosis.png"},
 {"js":"['ERRS', window.__errs]"},{"js":"['DONE']"}]
JSON
MESA_LANG=es APP_BIN="$BIN" bash test/ui/run.sh "$WORK/boot.json" "$UD" > "$OUT/1-boot.txt" 2>&1
cat "$OUT/1-boot.txt" | cut -c1-300; cp "$UD/mesa.log" "$OUT/1-mesa.log" 2>/dev/null

# ---------- 2. abrir un .pgn como desde el Finder ----------
note "2. abrir un .pgn"
UD="$(profile open)"
printf '[Event "Prueba Finder"]\n[White "Blancas Finder"]\n[Black "Negras Finder"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Ke7 3. Qxe5# 1-0\n' > "$WORK/finder.pgn"
cat > "$WORK/open.json" <<JSON
[{"wait":3000,"js":"window.__errs=[]; ['EXPECT openfile', /Blancas Finder/.test((document.querySelector('#anTitle b')||{}).textContent||'') && document.querySelector('.nav-btn.on').dataset.view==='analysis', (document.querySelector('#anTitle b')||{}).textContent, document.querySelector('.nav-btn.on').dataset.view]","shot":"$OUT/mac-openfile.png"},
 {"js":"['ERRS', window.__errs]"},{"js":"['DONE']"}]
JSON
open -W -n -a "$APP" --env MESA_SHOTS="$WORK/open.json" --env MESA_USERDATA="$UD" --env MESA_LANG=es --stdout "$OUT/2-open.txt" --stderr "$OUT/2-open.err" "$WORK/finder.pgn"
cat "$OUT/2-open.txt" | cut -c1-300

# ---------- versión "siguiente" para probar la actualización ----------
note "armando la versión 9.9.9 de prueba"
NEXT="$WORK/next"; mkdir -p "$NEXT"; ditto "dist/Analysis Board.app" "$NEXT/Analysis Board.app"
/usr/bin/plutil -replace CFBundleShortVersionString -string 9.9.9 "$NEXT/Analysis Board.app/Contents/Info.plist"
/usr/bin/plutil -replace CFBundleVersion -string 9.9.9 "$NEXT/Analysis Board.app/Contents/Info.plist"
node -e 'const f=process.argv[1],p=require(f);p.version="9.9.9";require("fs").writeFileSync(f,JSON.stringify(p,null,2))' "$NEXT/Analysis Board.app/Contents/Resources/app/package.json"
codesign --force --deep --sign - "$NEXT/Analysis Board.app"
mkdir -p "$WORK/srv"; (cd "$NEXT" && ditto -c -k --sequesterRsrc --keepParent "Analysis Board.app" "$WORK/srv/Analysis-Board-mac.zip")
SIZE="$(stat -f %z "$WORK/srv/Analysis-Board-mac.zip")"; SHA="$(shasum -a 256 "$WORK/srv/Analysis-Board-mac.zip" | cut -d' ' -f1)"
rel() { printf '{"tag_name":"v9.9.9","html_url":"https://example.invalid","body":"prueba","assets":[{"name":"Analysis-Board-mac.zip","size":%s,"digest":"sha256:%s","browser_download_url":"http://127.0.0.1:8377/Analysis-Board-mac.zip"}]}' "$SIZE" "$1"; }
rel "$SHA" > "$WORK/srv/good.json"; rel "0000000000000000000000000000000000000000000000000000000000000000" > "$WORK/srv/bad.json"
(cd "$WORK/srv" && python3 -m http.server 8377 >/dev/null 2>&1 &) ; sleep 1

# ---------- 3. huella distinta: no se instala ----------
note "3. actualización con huella distinta"
UD="$(profile bad)"
cat > "$WORK/bad.json" <<JSON
[{"wait":1500,"js":"window.__errs=[]; (async()=>{const u=await window.api.checkUpdate(); let err=''; try{await window.api.downloadUpdate()}catch(e){err=String(e.message)} return ['EXPECT rejected', u.newer===true && /GitHub/.test(err), u.latest, err.slice(0,160)]})()"},
 {"js":"['ERRS', window.__errs]"},{"js":"['DONE']"}]
JSON
MESA_UPDATE_API="http://127.0.0.1:8377/bad.json" MESA_LANG=es APP_BIN="$BIN" bash test/ui/run.sh "$WORK/bad.json" "$UD" > "$OUT/3-bad.txt" 2>&1
cat "$OUT/3-bad.txt" | cut -c1-300
V="$(/usr/bin/plutil -extract CFBundleShortVersionString raw -o - "$APP/Contents/Info.plist")"
[ "$V" = "$VERSION" ] && echo "[js] [\"EXPECT untouched\", true, \"$V\"]" >> "$OUT/3-bad.txt" || echo "[js] [\"EXPECT untouched\", false, \"$V\"]" >> "$OUT/3-bad.txt"

# ---------- 4. actualización buena: se reemplaza y vuelve a abrir ----------
note "4. instalar la actualización"
UD="$(profile good)"
cat > "$WORK/good.json" <<JSON
[{"wait":1500,"js":"(async()=>{const u=await window.api.checkUpdate(); const r=await window.api.downloadUpdate(); return ['EXPECT installing', u.newer===true && r && r.version==='9.9.9', r]})()"},
 {"wait":20000,"js":"['no debería llegar acá: la app se cierra para instalarse']"}]
JSON
MESA_UPDATE_API="http://127.0.0.1:8377/good.json" MESA_LANG=es APP_BIN="$BIN" bash test/ui/run.sh "$WORK/good.json" "$UD" > "$OUT/4-good.txt" 2>&1
cat "$OUT/4-good.txt" | cut -c1-300; cp "$UD/mesa.log" "$OUT/4-mesa.log" 2>/dev/null
ok=false; for i in $(seq 1 40); do
  V="$(/usr/bin/plutil -extract CFBundleShortVersionString raw -o - "$APP/Contents/Info.plist" 2>/dev/null)"
  if [ "$V" = "9.9.9" ] && pgrep -f "$APPS/Analysis Board.app/Contents/MacOS" >/dev/null; then ok=true; break; fi; sleep 1
done
echo "[js] [\"EXPECT replaced and reopened\", $ok, \"$V\"]" >> "$OUT/4-good.txt"
ls "$APPS"; screencapture -x "$OUT/mac-after-update.png" 2>/dev/null || true
quit_app; pkill -f "http.server 8377" 2>/dev/null
echo "[js] [\"DONE\"]" >> "$OUT/4-good.txt"

python3 test/ui/check.py "$OUT/1-boot.txt" "$OUT/2-open.txt" "$OUT/3-bad.txt" "$OUT/4-good.txt" || fail=1
[ "$fail" = 0 ] && echo "MAC OK" || { echo "MAC FALLÓ"; exit 1; }
