// Analysis Board (antes "Mesa de Análisis") — proceso principal (Electron)
const { app, BrowserWindow, ipcMain, shell, nativeTheme, Menu, dialog, screen } = require("electron");
const { spawn, execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const APP_NAME = "Analysis Board";
const LEGACY_NAME = "Mesa de Análisis";
app.setName(APP_NAME);
// Los datos se quedan donde estaban: si ya existía la carpeta de "Mesa de Análisis", se sigue usando esa.
(function chooseUserData() {
  const appData = app.getPath("appData");
  const legacy = path.join(appData, LEGACY_NAME), current = path.join(appData, APP_NAME);
  app.setPath("userData", !fs.existsSync(current) && fs.existsSync(legacy) ? legacy : current);
})();

/* ---------- Idioma ---------- */
let lang = "es";
const L = (es, en) => (lang === "en" ? en : es);
function readSettings() { try { return JSON.parse(fs.readFileSync(path.join(app.getPath("userData"), "settings.json"), "utf8")); } catch (e) { return null; } }
/** Ajustes > Idioma; si no hay, quien ya usaba la app sigue en castellano y una instalación nueva toma el idioma de la Mac. */
function decideLang() {
  if (process.env.MESA_LANG) return process.env.MESA_LANG === "en" ? "en" : "es";
  const s = readSettings();
  if (s && (s.lang === "en" || s.lang === "es")) return s.lang;
  let sys = "en";
  try { sys = (app.getPreferredSystemLanguages && app.getPreferredSystemLanguages()[0]) || app.getLocale() || "en"; } catch (e) {}
  const chosen = s ? "es" : /^es\b/i.test(sys) ? "es" : "en";
  try {
    const f = path.join(app.getPath("userData"), "settings.json");
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify({ ...(s || {}), lang: chosen }));
  } catch (e) { log("no pude guardar el idioma", e.message); }
  return chosen;
}

let win = null;
const engines = new Map(); // id -> { proc, buf }

/* ---------- Registro de diagnóstico ---------- */
let logFile = null;
function log(...a) {
  try {
    if (!logFile) logFile = path.join(app.getPath("userData"), "mesa.log");
    const line = new Date().toISOString() + " " + a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ") + "\n";
    fs.appendFileSync(logFile, line);
  } catch (e) { /* sin registro */ }
}

/* ---------- Stockfish ---------- */
// No depende de app.isPackaged: en la app de Mac el ejecutable se llama "Electron" y Electron cree que no está empaquetada.
function stockfishCandidates() {
  return [process.env.STOCKFISH_PATH, path.join(process.resourcesPath || "", "stockfish"), path.join(__dirname, "..", "stockfish"), path.join(__dirname, "bin", "stockfish")].filter(Boolean);
}
function stockfishPath() {
  for (const p of stockfishCandidates()) { try { if (fs.statSync(p).isFile()) return p; } catch (e) {} }
  return null;
}

function startEngine(id) {
  stopEngine(id);
  const bin = stockfishPath();
  if (!bin) { log("stockfish no encontrado", stockfishCandidates()); throw new Error(L("No encontré el motor Stockfish dentro de la app. Volvé a instalarla.", "I couldn't find the Stockfish engine inside the app. Please reinstall it.")); }
  try { fs.chmodSync(bin, 0o755); } catch (e) { /* solo lectura: ignorar */ }
  log("iniciando motor", id, bin);
  const proc = spawn(bin, [], { stdio: ["pipe", "pipe", "pipe"] });
  // Prioridad baja: el análisis usa la CPU que sobra y no traba el resto de la Mac.
  try { if (proc.pid) os.setPriority(proc.pid, 15); } catch (e) { log("no pude bajar la prioridad", e.message); }
  const rec = { proc, buf: "" };
  proc.stderr.setEncoding("utf8");
  proc.stderr.on("data", (d) => log("stderr", id, String(d).slice(0, 500)));
  proc.stdin.on("error", (e) => log("stdin error", id, e.message));
  engines.set(id, rec);
  proc.stdout.setEncoding("utf8");
  proc.stdout.on("data", (chunk) => {
    rec.buf += chunk;
    let i;
    while ((i = rec.buf.indexOf("\n")) >= 0) {
      const line = rec.buf.slice(0, i).replace(/\r$/, "");
      rec.buf = rec.buf.slice(i + 1);
      if (line && win && !win.isDestroyed()) win.webContents.send("engine:line", id, line);
    }
  });
  proc.on("exit", (code, signal) => {
    log("motor terminado", id, { code, signal });
    const current = engines.get(id) === rec;
    if (current) engines.delete(id);
    if (current && win && !win.isDestroyed()) win.webContents.send("engine:exit", id, code == null ? "signal:" + signal : code);
  });
  proc.on("error", (err) => {
    log("error al iniciar motor", id, String(err && err.message));
    if (engines.get(id) === rec) engines.delete(id);
    if (win && !win.isDestroyed()) win.webContents.send("engine:exit", id, "error:" + String(err && err.message));
  });
  return true;
}
function stopEngine(id) {
  const rec = engines.get(id);
  if (!rec) return;
  try { rec.proc.stdin.write("quit\n"); } catch (e) {}
  setTimeout(() => { try { rec.proc.kill(); } catch (e) {} }, 300);
  engines.delete(id);
}

ipcMain.handle("engine:start", (_e, id) => startEngine(id));
ipcMain.on("engine:send", (_e, id, cmd) => {
  const rec = engines.get(id);
  if (rec) { try { rec.proc.stdin.write(cmd + "\n"); } catch (e) {} }
});
ipcMain.handle("engine:stop", (_e, id) => stopEngine(id));
ipcMain.handle("sys:info", () => ({ cores: os.cpus().length, mem: Math.round(os.totalmem() / 1048576), platform: process.platform, version: app.getVersion() }));

/* ---------- Actualizar desde un .zip (sin pasar por la Terminal) ---------- */
const OUR_ID = /^ar\.juanazzurro\.mesa/;
function appBundlePath() {
  const p = process.execPath; const i = p.indexOf(".app/Contents/MacOS/");
  return i > 0 ? p.slice(0, i + 4) : null;
}
function run(cmd, args) {
  return new Promise((res, rej) => execFile(cmd, args, { maxBuffer: 1 << 24 }, (err, so, se) => (err ? rej(new Error(String(se || err.message).trim())) : res(String(so).trim()))));
}
async function installUpdate() {
  if (process.platform !== "darwin") throw new Error(L("Esto solo funciona en la Mac.", "This only works on a Mac."));
  const target = appBundlePath();
  if (!target) throw new Error(L("No encontré dónde está instalada la app.", "I couldn't find where the app is installed."));
  if (target.includes("/AppTranslocation/")) throw new Error(L("Mové la app a la carpeta Aplicaciones, abrila desde ahí y probá de nuevo.", "Move the app to the Applications folder, open it from there and try again."));
  try { fs.accessSync(path.dirname(target), fs.constants.W_OK); } catch (e) { throw new Error(L("No tengo permiso para escribir en ", "I don't have permission to write to ") + path.dirname(target) + "."); }
  const pick = await dialog.showOpenDialog(win, {
    title: L("Elegí el .zip de la versión nueva", "Choose the .zip of the new version"), buttonLabel: L("Instalar", "Install"),
    defaultPath: app.getPath("downloads"), properties: ["openFile"], filters: [{ name: APP_NAME, extensions: ["zip"] }]
  });
  if (pick.canceled || !pick.filePaths[0]) return { canceled: true };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mesa-actualizacion-"));
  log("actualizando desde", pick.filePaths[0]);
  await run("/usr/bin/ditto", ["-x", "-k", pick.filePaths[0], tmp]).catch(() => { throw new Error(L("No pude abrir ese .zip. Descargalo de nuevo.", "I couldn't open that .zip. Download it again.")); });
  const name = fs.readdirSync(tmp).find((n) => n.endsWith(".app"));
  if (!name) throw new Error(L("Ese .zip no tiene la app adentro.", "That .zip doesn't contain the app."));
  const fresh = path.join(tmp, name);
  const plist = path.join(fresh, "Contents", "Info.plist");
  const id = await run("/usr/bin/plutil", ["-extract", "CFBundleIdentifier", "raw", "-o", "-", plist]).catch(() => "");
  if (!OUR_ID.test(id)) throw new Error(L("Ese .zip no es de Analysis Board.", "That .zip isn't Analysis Board."));
  const version = await run("/usr/bin/plutil", ["-extract", "CFBundleShortVersionString", "raw", "-o", "-", plist]).catch(() => "?");
  const check = await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", fresh]).then(() => "ok", (e) => e.message);
  log("firma de la versión nueva:", check);
  // Es nuestra propia app: le quitamos la marca de "descargado de internet" para que abra sin el aviso de app dañada.
  await run("/usr/bin/xattr", ["-dr", "com.apple.quarantine", fresh]).catch((e) => log("xattr", e.message));
  // La versión nueva queda con su propio nombre (por ejemplo "Analysis Board.app") en la misma carpeta.
  const dest = path.join(path.dirname(target), name);
  const script = path.join(tmp, "instalar.sh");
  fs.writeFileSync(script, [
    "#!/bin/sh",
    'PID="$1"; OLD="$2"; NEW="$3"; DEST="$4"',
    'i=0; while kill -0 "$PID" 2>/dev/null && [ $i -lt 100 ]; do sleep 0.2; i=$((i+1)); done',
    'rm -rf "$OLD.anterior" "$DEST.anterior"',
    'if [ "$DEST" != "$OLD" ] && [ -e "$DEST" ]; then mv "$DEST" "$DEST.anterior"; fi',
    'if mv "$OLD" "$OLD.anterior" && mv "$NEW" "$DEST"; then rm -rf "$OLD.anterior" "$DEST.anterior"; open "$DEST";',
    'else [ -d "$OLD" ] || mv "$OLD.anterior" "$OLD"; [ -e "$DEST.anterior" ] && [ ! -e "$DEST" ] && mv "$DEST.anterior" "$DEST"; open "$OLD"; fi', ""
  ].join("\n"));
  updating = true;
  spawn("/bin/sh", [script, String(process.pid), target, fresh, dest], { detached: true, stdio: "ignore" }).unref();
  log("instalando versión", version);
  setTimeout(() => app.quit(), 1200);
  return { version };
}
ipcMain.handle("update:install", () => installUpdate());
async function installUpdateFromMenu() {
  try { await installUpdate(); }
  catch (e) { dialog.showMessageBox(win, { type: "warning", message: L("No se pudo instalar la actualización", "The update couldn't be installed"), detail: e.message }); }
}
let updating = false;
/** Las versiones anteriores se llamaban "Mesa de Análisis.app": al cerrar, la app se renombra sola a "Analysis Board.app". */
function renameLegacyBundleOnQuit() {
  if (updating || process.platform !== "darwin" || process.env.MESA_SHOTS) return;
  const cur = appBundlePath(); if (!cur) return;
  if (path.basename(cur).normalize("NFC") !== (LEGACY_NAME + ".app").normalize("NFC")) return;
  const dest = path.join(path.dirname(cur), APP_NAME + ".app");
  try { if (fs.existsSync(dest)) return; fs.accessSync(path.dirname(cur), fs.constants.W_OK); } catch (e) { return; }
  const script = path.join(os.tmpdir(), "analysis-board-renombrar.sh");
  fs.writeFileSync(script, ['#!/bin/sh', 'PID="$1"; OLD="$2"; NEW="$3"', 'i=0; while kill -0 "$PID" 2>/dev/null && [ $i -lt 100 ]; do sleep 0.2; i=$((i+1)); done', '[ -e "$NEW" ] || mv "$OLD" "$NEW"', ""].join("\n"));
  spawn("/bin/sh", [script, String(process.pid), cur, dest], { detached: true, stdio: "ignore" }).unref();
  log("renombrando la app a", dest);
}

/* ---------- Tamaño y posición de la ventana ---------- */
function boundsFile() { return path.join(app.getPath("userData"), "ventana.json"); }
function loadBounds() {
  try {
    const b = JSON.parse(fs.readFileSync(boundsFile(), "utf8"));
    const area = screen.getDisplayMatching(b).workArea;
    if (b.width >= 1020 && b.height >= 680 && b.x >= area.x - 50 && b.y >= area.y - 50 && b.x + 100 <= area.x + area.width && b.y + 100 <= area.y + area.height) return b;
  } catch (e) {}
  return null;
}
function saveBounds() {
  try { if (win && !win.isDestroyed() && !win.isFullScreen() && !win.isMinimized()) fs.writeFileSync(boundsFile(), JSON.stringify(win.getBounds())); } catch (e) {}
}

/* ---------- Almacenamiento local (JSON en la carpeta de datos de la app) ---------- */
function storeFile(key) {
  if (!/^[a-z0-9_-]+$/i.test(key)) throw new Error("invalid key");
  return path.join(app.getPath("userData"), key + ".json");
}
ipcMain.handle("store:get", (_e, key) => {
  try { return JSON.parse(fs.readFileSync(storeFile(key), "utf8")); } catch (e) { return null; }
});
ipcMain.handle("store:set", (_e, key, value) => {
  const f = storeFile(key);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, f);
  return true;
});
ipcMain.handle("store:path", () => app.getPath("userData"));
ipcMain.on("log", (_e, ...a) => log("[ui]", ...a));

/* ---------- Problemas tácticos ---------- */
const PUZZLE_URL = process.env.MESA_PUZZLE_URL || "https://database.lichess.org/lichess_db_puzzle.csv.zst";
const PUZZLE_THEMES = new Set(["mateIn1", "mateIn2", "mateIn3", "mateIn4", "backRankMate", "smotheredMate", "fork", "pin", "skewer", "discoveredAttack", "doubleCheck",
  "hangingPiece", "trappedPiece", "deflection", "attraction", "sacrifice", "promotion", "advancedPawn", "defensiveMove", "quietMove", "zugzwang", "endgame",
  "rookEndgame", "pawnEndgame", "kingsideAttack", "exposedKing", "capturingDefender", "interference", "xRayAttack", "intermezzo", "clearance", "mate"]);
const lichessPuzzleFile = () => path.join(app.getPath("userData"), "problemas-lichess.json");
ipcMain.handle("puzzles:load", () => {
  try {
    const f = lichessPuzzleFile();
    if (fs.existsSync(f)) return { source: "lichess", puzzles: JSON.parse(fs.readFileSync(f, "utf8")) };
  } catch (e) { log("no pude leer la base de Lichess", e.message); }
  const base = path.join(__dirname, "data", "puzzles-base.json");
  return { source: "base", puzzles: JSON.parse(fs.readFileSync(base, "utf8")) };
});
let puzzleDownload = null;
ipcMain.handle("puzzles:download", async () => {
  if (puzzleDownload) return puzzleDownload;
  puzzleDownload = (async () => {
    const { Decompress } = require("./vendor/fzstd.js");
    const send = (p) => { if (win && !win.isDestroyed()) win.webContents.send("puzzles:progress", p); };
    log("descargando problemas", PUZZLE_URL);
    let res;
    try { res = await fetch(PUZZLE_URL, { headers: { "User-Agent": UA } }); }
    catch (e) { log("descarga de problemas", e.message); throw new Error(L("No pude conectarme con Lichess para bajar los problemas. Revisá tu conexión a internet y probá de nuevo.", "I couldn't connect to Lichess to download the puzzles. Check your internet connection and try again.")); }
    if (!res.ok || !res.body) throw new Error(L(`No se pudo descargar la base de problemas (${res.status}).`, `The puzzle database couldn't be downloaded (${res.status}).`));
    const total = +res.headers.get("content-length") || 0;
    const CAP = 90, MAX = 130000;
    const buckets = new Map(); const kept = [];
    let received = 0, rows = 0, rest = "", lastSend = 0;
    const dec = new TextDecoder();
    const handle = (line) => {
      if (!line || line.startsWith("PuzzleId")) return;
      rows++;
      const f = line.split(",");
      if (f.length < 8) return;
      const rating = +f[3], rd = +f[4], pop = +f[5], plays = +f[6];
      if (!(rating >= 400 && rating <= 2700) || rd > 90 || pop < 85 || plays < 400) return;
      const themes = f[7].split(" ").filter((t) => PUZZLE_THEMES.has(t));
      if (!themes.length || kept.length >= MAX) return;
      const b = Math.floor(rating / 100);
      let take = false;
      for (const t of themes) { const k = t + ":" + b; const n = buckets.get(k) || 0; if (n < CAP) { take = true; } }
      if (!take) return;
      for (const t of themes) { const k = t + ":" + b; buckets.set(k, (buckets.get(k) || 0) + 1); }
      kept.push([f[0], f[1], f[2], rating, themes.join(" ")]);
    };
    const zs = new Decompress((chunk, final) => {
      rest += dec.decode(chunk, { stream: !final });
      const lines = rest.split("\n");
      rest = lines.pop();
      for (const l of lines) handle(l.replace(/\r$/, ""));
      if (final && rest) { handle(rest); rest = ""; }
    });
    const reader = res.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        zs.push(value);
        const now = Date.now();
        if (now - lastSend > 300) { lastSend = now; send({ received, total, rows, kept: kept.length }); }
      }
      zs.push(new Uint8Array(0), true);
    } catch (e) {
      log("descarga de problemas cortada", e.message);
      throw new Error(L("Se cortó la descarga de los problemas. Probá de nuevo; los que ya tenías siguen andando.", "The puzzle download was interrupted. Try again; the puzzles you already had still work."));
    }
    if (kept.length < 1000) throw new Error(L("La descarga terminó, pero no encontré problemas válidos en el archivo.", "The download finished, but I found no valid puzzles in the file."));
    const tmp = lichessPuzzleFile() + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(kept)); fs.renameSync(tmp, lichessPuzzleFile());
    log("problemas guardados", kept.length, "de", rows);
    send({ received, total, rows, kept: kept.length, done: true });
    return { count: kept.length, rows };
  })();
  try { return await puzzleDownload; } finally { puzzleDownload = null; }
});

/* ---------- Importar partidas ---------- */
const UA = "AnalysisBoard/1.2 (personal chess analysis app; github.com/juanazzurro/analysis-board)";

async function importLichess(user, max) {
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(user)}?max=${max}&pgnInJson=true&clocks=true&evals=false&opening=true&moves=true`;
  const r = await fetch(url, { headers: { Accept: "application/x-ndjson", "User-Agent": UA } });
  if (r.status === 404) throw new Error(L(`No existe el usuario "${user}" en Lichess.`, `The user "${user}" doesn't exist on Lichess.`));
  if (r.status === 429) throw new Error(L("Lichess pidió esperar un minuto antes de volver a importar.", "Lichess asked to wait a minute before importing again."));
  if (!r.ok) throw new Error(L(`Lichess respondió con un error (${r.status}).`, `Lichess returned an error (${r.status}).`));
  const text = await r.text();
  const out = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let g; try { g = JSON.parse(line); } catch (e) { continue; }
    if (!g.pgn || (g.variant && g.variant !== "standard")) continue;
    out.push({
      id: "li-" + g.id, source: "lichess", url: "https://lichess.org/" + g.id, pgn: g.pgn,
      white: g.players?.white?.user?.name || (g.players?.white?.aiLevel ? L("Stockfish nivel ", "Stockfish level ") + g.players.white.aiLevel : L("Anónimo", "Anonymous")),
      black: g.players?.black?.user?.name || (g.players?.black?.aiLevel ? L("Stockfish nivel ", "Stockfish level ") + g.players.black.aiLevel : L("Anónimo", "Anonymous")),
      whiteElo: g.players?.white?.rating || null, blackElo: g.players?.black?.rating || null,
      result: g.winner === "white" ? "1-0" : g.winner === "black" ? "0-1" : (g.status === "draw" || g.status === "stalemate") ? "½-½" : "*",
      date: g.createdAt || Date.now(), speed: g.speed || "", opening: g.opening?.name || ""
    });
  }
  return out;
}

async function importChesscom(user, max) {
  const u = encodeURIComponent(String(user).toLowerCase());
  const r = await fetch(`https://api.chess.com/pub/player/${u}/games/archives`, { headers: { "User-Agent": UA } });
  if (r.status === 404) throw new Error(L(`No existe el usuario "${user}" en Chess.com.`, `The user "${user}" doesn't exist on Chess.com.`));
  if (!r.ok) throw new Error(L(`Chess.com respondió con un error (${r.status}).`, `Chess.com returned an error (${r.status}).`));
  const { archives = [] } = await r.json();
  const out = [];
  for (let i = archives.length - 1; i >= 0 && out.length < max; i--) {
    const m = await fetch(archives[i], { headers: { "User-Agent": UA } });
    if (!m.ok) continue;
    const { games = [] } = await m.json();
    for (let j = games.length - 1; j >= 0 && out.length < max; j--) {
      const g = games[j];
      if (!g.pgn || (g.rules && g.rules !== "chess")) continue;
      const res = g.white?.result === "win" ? "1-0" : g.black?.result === "win" ? "0-1" : "½-½";
      const idm = /\/(\d+)(?:\?|$)/.exec(g.url || "");
      out.push({
        id: "cc-" + (idm ? idm[1] : g.uuid || g.end_time), source: "chesscom", url: g.url || "", pgn: g.pgn,
        white: g.white?.username || L("Blancas", "White"), black: g.black?.username || L("Negras", "Black"),
        whiteElo: g.white?.rating || null, blackElo: g.black?.rating || null,
        result: res, date: (g.end_time || 0) * 1000, speed: g.time_class || "", opening: ""
      });
    }
  }
  return out;
}

ipcMain.handle("import:games", async (_e, source, user, max) => {
  const n = Math.max(1, Math.min(200, Number(max) || 20));
  if (!user || !String(user).trim()) throw new Error(L("Escribí tu nombre de usuario.", "Enter your username."));
  return source === "lichess" ? importLichess(String(user).trim(), n) : importChesscom(String(user).trim(), n);
});

/* ---------- IA opcional (API de Anthropic, con la clave del usuario) ---------- */
ipcMain.handle("ai:ask", async (_e, { prompt, key, model, maxTokens }) => {
  if (!key) throw new Error(L("Falta la clave de API. Cargala en Ajustes.", "The API key is missing. Add it in Settings."));
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: model || "claude-sonnet-5-5", max_tokens: maxTokens || 900, messages: [{ role: "user", content: prompt }] })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error?.message || "";
    if (r.status === 401) throw new Error(L("La clave de API no es válida. Revisala en Ajustes.", "The API key isn't valid. Check it in Settings."));
    if (r.status === 429) throw new Error(L("Se alcanzó el límite de la API. Probá de nuevo en un rato.", "The API rate limit was reached. Try again in a while."));
    if (r.status === 404) throw new Error(L("El modelo configurado no existe. Revisá el modelo en Ajustes.", "The configured model doesn't exist. Check the model in Settings."));
    throw new Error(L("La API respondió con un error (", "The API returned an error (") + r.status + ")" + (msg ? ": " + msg : "."));
  }
  return (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
});

ipcMain.handle("shell:open", (_e, url) => {
  if (/^https:\/\//.test(url)) shell.openExternal(url);
});

/* ---------- Ventana ---------- */
function createWindow() {
  const dark = nativeTheme.shouldUseDarkColors;
  const b = loadBounds();
  win = new BrowserWindow({
    width: b ? b.width : 1360, height: b ? b.height : 880, minWidth: 1020, minHeight: 680,
    ...(b ? { x: b.x, y: b.y } : {}),
    title: APP_NAME,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: dark ? "#1b1916" : "#f3efe8",
    show: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.once("ready-to-show", () => win.show());
  if (process.env.MESA_SHOTS) win.webContents.once("did-finish-load", () => setTimeout(runShots, 1500));
  win.webContents.on("console-message", (_e, level, message) => { if (process.env.MESA_SHOTS && level >= 2) console.log("[renderer]", message); });
  win.loadFile(path.join(__dirname, "renderer", "index.html"), { query: { lang } });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.on("close", saveBounds);
  win.on("closed", () => { win = null; });
}

if (process.env.MESA_USERDATA) app.setPath("userData", process.env.MESA_USERDATA);
if (process.env.MESA_THEME) app.whenReady().then(() => { nativeTheme.themeSource = process.env.MESA_THEME; });

/* Capturas automáticas para pruebas (solo si se define MESA_SHOTS). */
async function runShots() {
  const steps = JSON.parse(fs.readFileSync(process.env.MESA_SHOTS, "utf8"));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const st of steps) {
    if (st.js) { try { const r = await win.webContents.executeJavaScript(st.js); if (r !== undefined) console.log("[js]", JSON.stringify(r).slice(0, 400)); } catch (e) { console.log("[js error]", e.message); } }
    if (st.wait) await wait(st.wait);
    if (st.shot) { const img = await win.webContents.capturePage(); fs.writeFileSync(st.shot, img.toPNG()); console.log("[shot]", st.shot); }
  }
  app.quit();
}

function buildMenu() {
  if (process.platform !== "darwin") return;
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: APP_NAME, submenu: [{ role: "about", label: L("Acerca de Analysis Board", "About Analysis Board") }, { label: L("Instalar actualización…", "Install update…"), click: installUpdateFromMenu }, { label: L("Ver versiones en GitHub", "See versions on GitHub"), click: () => shell.openExternal("https://github.com/juanazzurro/analysis-board/releases") }, { type: "separator" }, { role: "hide", label: L("Ocultar", "Hide") }, { role: "hideOthers", label: L("Ocultar otras", "Hide Others") }, { type: "separator" }, { role: "quit", label: L("Salir", "Quit") }] },
    { label: L("Edición", "Edit"), submenu: [{ role: "undo", label: L("Deshacer", "Undo") }, { role: "redo", label: L("Rehacer", "Redo") }, { type: "separator" }, { role: "cut", label: L("Cortar", "Cut") }, { role: "copy", label: L("Copiar", "Copy") }, { role: "paste", label: L("Pegar", "Paste") }, { role: "selectAll", label: L("Seleccionar todo", "Select All") }] },
    { label: L("Ver", "View"), submenu: [{ role: "reload", label: L("Recargar", "Reload") }, { role: "togglefullscreen", label: L("Pantalla completa", "Full Screen") }, { role: "resetZoom", label: L("Tamaño real", "Actual Size") }, { role: "zoomIn", label: L("Acercar", "Zoom In") }, { role: "zoomOut", label: L("Alejar", "Zoom Out") }, { type: "separator" }, { role: "toggleDevTools", label: L("Herramientas de desarrollo", "Developer Tools") }] },
    { label: L("Ventana", "Window"), submenu: [{ role: "minimize", label: L("Minimizar", "Minimize") }, { role: "zoom", label: "Zoom" }, { role: "close", label: L("Cerrar", "Close") }] }
  ]));
}
ipcMain.handle("lang:set", (_e, l) => {
  lang = l === "en" ? "en" : "es";
  buildMenu();
  if (win && !win.isDestroyed()) win.loadFile(path.join(__dirname, "renderer", "index.html"), { query: { lang } });
  return lang;
});

app.whenReady().then(() => {
  lang = decideLang();
  app.setAboutPanelOptions({ applicationName: APP_NAME, applicationVersion: app.getVersion(), copyright: "Stockfish 18 (GPL-3.0) · chessground (GPL-3.0) · cburnett (CC BY-SA 3.0)", website: "https://github.com/juanazzurro/analysis-board" });
  buildMenu();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => {
  for (const id of [...engines.keys()]) stopEngine(id);
  app.quit();
});
app.on("before-quit", () => { for (const id of [...engines.keys()]) stopEngine(id); });
app.on("will-quit", () => { try { renameLegacyBundleOnQuit(); } catch (e) { log("no pude renombrar la app", e.message); } });
