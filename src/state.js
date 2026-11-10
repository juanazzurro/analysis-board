import { Engine } from "./engine.js";
import { tr } from "./i18n.js";
import { analyseGame, stats } from "./analysis.js";
import { parseGame, headerName } from "./chess-util.js";
import { dayKey } from "./srs.js";

export const DEFAULT_SETTINGS = {
  lichessUser: "", chesscomUser: "",
  depth: "normal", threads: 0, hash: 256,
  sound: true, aiKey: "", aiModel: "claude-sonnet-5-5",
  learnInacc: false, importCount: 25, selfReview: true, dailyPuzzles: 10,
  theme: "system", board: "steel", pieces: "cburnett", notation: "fig", liveEngine: true, liveLines: 3, autoUpdate: true, autoImport: true, textSize: 100
};
export const DEFAULT_PROGRESS = { days: {}, puzzles: { rating: 1000, n: 0, history: [], themes: {}, seen: [] }, endgames: {} };

export const store = { settings: { ...DEFAULT_SETTINGS }, library: [], training: {}, progress: JSON.parse(JSON.stringify(DEFAULT_PROGRESS)), sys: { cores: 4 } };

/* ---------- eventos ---------- */
const handlers = {};
export function on(ev, f) { (handlers[ev] = handlers[ev] || new Set()).add(f); return () => handlers[ev].delete(f); }
export function emit(ev, ...a) { for (const f of handlers[ev] || []) { try { f(...a); } catch (e) { console.error(e); } } }

/* ---------- persistencia ---------- */
let libTimer = null, trTimer = null, prTimer = null;
export async function loadAll() {
  const [s, lib, tr, pr, sys] = await Promise.all([window.api.storeGet("settings"), window.api.storeGet("library"), window.api.storeGet("training"), window.api.storeGet("progress"), window.api.sysInfo()]);
  store.settings = { ...DEFAULT_SETTINGS, ...(s || {}) };
  store.library = Array.isArray(lib) ? lib : [];
  store.training = tr && typeof tr === "object" ? tr : {};
  const base = JSON.parse(JSON.stringify(DEFAULT_PROGRESS));
  store.progress = pr && typeof pr === "object" ? { ...base, ...pr, puzzles: { ...base.puzzles, ...(pr.puzzles || {}) } } : base;
  store.sys = sys || store.sys;
}
export function saveProgress() { clearTimeout(prTimer); prTimer = setTimeout(() => { prTimer = null; window.api.storeSet("progress", store.progress); }, 400); }
/** Registra actividad del día (cuenta para el plan de "Hoy" y la racha). */
export function logActivity(kind, n = 1) {
  const k = dayKey();
  const d = store.progress.days[k] || (store.progress.days[k] = {});
  d[kind] = (d[kind] || 0) + n;
  saveProgress(); emit("activity", kind);
}
export function today() { return store.progress.days[dayKey()] || {}; }
export function saveSettings() { return window.api.storeSet("settings", store.settings); }
export function saveLibrary() { clearTimeout(libTimer); libTimer = setTimeout(() => { libTimer = null; window.api.storeSet("library", store.library); }, 400); }
export function saveTraining() { clearTimeout(trTimer); trTimer = setTimeout(() => { trTimer = null; window.api.storeSet("training", store.training); }, 400); }
/** Guarda ya lo que esté pendiente (al cerrar la ventana no se pierde nada). */
export function flushSaves() {
  if (libTimer) { clearTimeout(libTimer); libTimer = null; window.api.storeSet("library", store.library); }
  if (trTimer) { clearTimeout(trTimer); trTimer = null; window.api.storeSet("training", store.training); }
  if (prTimer) { clearTimeout(prTimer); prTimer = null; window.api.storeSet("progress", store.progress); }
}

/* ---------- motores ---------- */
export function autoThreads() { return Math.max(1, Math.floor((store.sys.cores || 4) / 2)); }
export const engines = { analysis: new Engine("analysis"), live: new Engine("live"), play: new Engine("play") };
export let engineError = null;
/** Mensaje de error del motor, o null si está todo bien. */
export function engineProblem() { return engineError || engines.analysis.failed || null; }
/** Se asegura de que los tres motores estén andando (los reinicia si alguno se cerró). */
export async function ensureEngines() {
  if (engines.analysis.ready && engines.live.ready && engines.play.ready) return null;
  if (startPromise) { const err = await startPromise; if (engines.analysis.ready && engines.live.ready && engines.play.ready) return err; }
  startPromise = null;
  return startEngines();
}
let startPromise = null;
export function startEngines() {
  if (!startPromise) startPromise = doStartEngines().then((err) => { if (err) startPromise = null; return err; });
  return startPromise;
}
async function doStartEngines() {
  const cores = store.sys.cores || 4;
  const t = store.settings.threads || autoThreads();
  try {
    // Los tres arrancan a la vez; los que no estén andando se reinician.
    const jobs = [];
    if (!engines.live.ready) jobs.push(engines.live.start({ threads: Math.min(2, Math.max(1, Math.floor(cores / 4))), hash: 64 }));
    if (!engines.play.ready) jobs.push(engines.play.start({ threads: 1, hash: 32 }));
    if (!engines.analysis.ready) jobs.push(engines.analysis.start({ threads: t, hash: store.settings.hash || 256 }));
    const res = await Promise.allSettled(jobs);
    const bad = res.find((r) => r.status === "rejected");
    if (bad) throw bad.reason;
    engineError = null;
  } catch (e) { engineError = e.message || String(e); try { window.api.log("error al iniciar motores", engineError); } catch (x) {} }
  emit("engines", engineError);
  return engineError;
}

/* ---------- biblioteca ---------- */
const parsed = new WeakMap();
export function gameOf(entry) {
  let g = parsed.get(entry);
  if (!g) { g = parseGame(entry.pgn); parsed.set(entry, g); }
  return g;
}
/** La partida ya leída, o null. Para recorrer toda la biblioteca sin leer nada en el momento (ver warm.js). */
export function gameReady(entry) { return parsed.get(entry) || null; }
export function setGame(entry, g) { parsed.set(entry, g); }
let warmTick = 0;
/** Cambia la firma de la biblioteca cuando termina trabajo de fondo, así las listas guardadas se rehacen. */
export function bumpWarm() { warmTick++; }
export function detectUserColor(entry) {
  if (entry.userColor === "none") return null;
  if (entry.userColor) return entry.userColor;
  const names = [store.settings.lichessUser, store.settings.chesscomUser].filter(Boolean).map((s) => s.toLowerCase());
  if (names.includes(String(entry.white || "").toLowerCase())) return "w";
  if (names.includes(String(entry.black || "").toLowerCase())) return "b";
  return null;
}
export function addGames(list) {
  const ids = new Set(store.library.map((g) => g.id));
  let added = 0; const newIds = [];
  for (const g of list) {
    if (ids.has(g.id)) continue;
    try { parseGame(g.pgn); } catch (e) { continue; }
    store.library.push({ ...g, analysis: null, userColor: g.userColor || null, addedAt: Date.now() });
    ids.add(g.id); added++; newIds.push(g.id);
  }
  store.library.sort((a, b) => (b.date || 0) - (a.date || 0));
  saveLibrary(); emit("library");
  addGames.lastIds = newIds;
  return added;
}
export function entryFromPgn(pgn, extra = {}) {
  const g = parseGame(pgn);
  const h = g.headers;
  let date = Date.now();
  if (h.Date && /^\d{4}\.\d{2}\.\d{2}$/.test(h.Date)) { const d = new Date(h.Date.replace(/\./g, "-") + "T12:00:00"); if (!isNaN(d)) date = d.getTime(); }
  let hash = 0; for (let i = 0; i < pgn.length; i++) hash = (hash * 31 + pgn.charCodeAt(i)) | 0;
  // Si el PGN viene de Lichess o Chess.com, usamos el mismo id que al importar: así no se duplica la partida.
  const li = /lichess\.org\/([A-Za-z0-9]{8})(?:[A-Za-z0-9]{4})?\b/.exec(h.Site || "");
  const cc = /chess\.com\/game\/(?:live|daily)\/(\d+)/.exec(h.Link || h.Site || "");
  const autoId = li ? "li-" + li[1] : cc ? "cc-" + cc[1] : "pgn-" + (hash >>> 0).toString(36);
  const autoSource = li ? "lichess" : cc ? "chesscom" : "pgn";
  return {
    id: extra.id || autoId, source: extra.source || autoSource, url: li ? "https://lichess.org/" + li[1] : cc ? (h.Link || h.Site) : h.Site && /^https?:/.test(h.Site) ? h.Site : "",
    pgn, white: headerName(h, "White", tr("Blancas", "White")), black: headerName(h, "Black", tr("Negras", "Black")),
    whiteElo: +h.WhiteElo || null, blackElo: +h.BlackElo || null, result: h.Result || "*", date, speed: extra.speed || "", opening: h.Opening || "",
    userColor: extra.userColor || null
  };
}
/** Firma barata de la biblioteca: cambia cuando se agregan/borran partidas, termina un análisis o cambia tu color/usuario. */
export function libSignature() {
  let n = 0, a = 0;
  for (const e of store.library) { n++; if (e.analysis) a = (a + (e.analysis.at % 100003)) % 1e12; if (e.userColor) a += e.userColor.length * 7; }
  return `${n}:${a}:${store.settings.lichessUser}:${store.settings.chesscomUser}:${store.settings.learnInacc ? 1 : 0}:${warmTick}`;
}
export function findEntry(id) { return store.library.find((g) => g.id === id) || null; }
/** Quita una partida. Devuelve lo necesario para deshacerlo con restoreEntry. */
export function removeEntry(id) {
  const index = store.library.findIndex((g) => g.id === id); if (index < 0) return null;
  const [entry] = store.library.splice(index, 1);
  saveLibrary(); emit("library");
  return { entry, index };
}
export function restoreEntry(undo) {
  if (!undo || findEntry(undo.entry.id)) return;
  store.library.splice(Math.min(undo.index, store.library.length), 0, undo.entry);
  saveLibrary(); emit("library");
}

/* ---------- cola de análisis ---------- */
const queue = [];
export const progress = { id: null, i: 0, n: 0, evals: null, info: null };
let running = false, stopFlag = null;

export function enqueueAnalysis(id, front = false, depth = null) {
  const e = findEntry(id); if (!e || e.analysis) return;
  if (progress.id === id) return;
  if (depth) e._depth = depth;
  const at = queue.indexOf(id);
  if (at >= 0) queue.splice(at, 1);
  if (front) queue.unshift(id); else queue.push(id);
  emit("queue");
  pump();
}
export function queueLength() { return queue.length + (progress.id ? 1 : 0); }
export function cancelQueue() { queue.length = 0; emit("queue"); }
export function reanalyse(id, depth) {
  const e = findEntry(id); if (!e) return;
  if (progress.id === id) { stopFlag = id; }
  e.analysis = null; e._depth = depth || null; saveLibrary();
  enqueueAnalysis(id, true);
}

async function pump() {
  if (running) return;
  running = true;
  let batch = 0;
  while (queue.length) {
    const id = queue.shift();
    const e = findEntry(id); if (!e || e.analysis) continue;
    if (!engines.analysis.ready) {
      const err = await ensureEngines();
      if (!engines.analysis.ready) {
        queue.unshift(id);
        emit("error", tr("No se pudo iniciar Stockfish: ", "Couldn't start Stockfish: ") + (err || engines.analysis.failed || tr("error desconocido", "unknown error")));
        break;
      }
    }
    let game; try { game = gameOf(e); } catch (err) { continue; }
    Object.assign(progress, { id, i: 0, n: game.fens.length, evals: null, info: null });
    stopFlag = null;
    emit("progress", progress);
    const res = await analyseGame(game, engines.analysis, e._depth || store.settings.depth, (i, n, evals, info) => {
      Object.assign(progress, { i: i + 1, n, evals, info });
      emit("progress", progress);
    }, () => stopFlag === id);
    if (res) {
      e.analysis = { ...res, stats: { w: stats(game, res.info, "w"), b: stats(game, res.info, "b") } };
      delete e._depth;
      saveLibrary(); batch++;
    }
    Object.assign(progress, { id: null, i: 0, n: 0, evals: null, info: null });
    emit("analysed", id, !!res);
    emit("progress", progress);
    emit("library");
  }
  running = false;
  emit("queue");
  if (batch) emit("batch", batch);       // terminó una tanda de análisis
}
