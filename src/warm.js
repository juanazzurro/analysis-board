// Preparación de la biblioteca en segundo plano.
// Leer una partida lleva unos 9 ms y clasificar sus errores otros 13. Con mil partidas eso eran más de 20 segundos con la
// ventana congelada al abrir. Ahora lo hacen hilos de trabajo: las pantallas muestran lo que ya está listo y se completan solas.
import { store, findEntry, emit, gameOf, gameReady, setGame, detectUserColor, saveLibrary, bumpWarm } from "./state.js";
import { cachedDiag, storeDiag, computeDiag } from "./motifs.js";
import { LANG } from "./i18n.js";

const SYNC_BUDGET_MS = 90;       // lo que se puede hacer en el momento sin que se note (unas pocas partidas)
const W = { pool: null, idle: [], queue: [], inFlight: new Map(), failed: new Set(), total: 0, done: 0, lastEmit: 0, syncSpent: 0, syncReset: null, waiters: [], dirty: false, lastSave: 0 };

export const warmProgress = () => ({ pending: W.queue.length + W.inFlight.size, total: W.total, done: W.done });

function pool() {
  if (W.pool) return W.pool;
  if (typeof Worker === "undefined") return (W.pool = []);
  const n = Math.max(1, Math.min(4, Math.floor(((store.sys && store.sys.cores) || 4) / 2)));
  W.pool = [];
  try {
    for (let i = 0; i < n; i++) {
      const w = new Worker("lib-worker.js?lang=" + LANG);
      w.onmessage = (ev) => finish(w, ev.data);
      w.onerror = () => { for (const [id, j] of W.inFlight) if (j.worker === w) { W.inFlight.delete(id); W.failed.add(id); W.done++; } W.idle.push(w); pump(); };
      W.pool.push(w); W.idle.push(w);
    }
  } catch (e) { /* sin hilos de trabajo: se calcula en el momento, como antes */ }
  return W.pool;
}
function needsDiag(e) { const uc = e.analysis ? detectUserColor(e) : null; return uc && !cachedDiag(e, uc) ? uc : null; }
function finish(w, msg) {
  const j = W.inFlight.get(msg.id); W.inFlight.delete(msg.id); W.idle.push(w); W.done++;
  const e = findEntry(msg.id);
  if (msg.error) W.failed.add(msg.id);
  else if (e && j && e.pgn.length === j.len) {
    setGame(e, msg.game);
    if (msg.diag && e.analysis && e.analysis.at === msg.at && detectUserColor(e) === j.uc) { storeDiag(e, msg.diag); W.dirty = true; }
  }
  const idle = !W.queue.length && !W.inFlight.size, now = Date.now();
  if (idle || now - W.lastEmit > 1200) { W.lastEmit = now; bumpWarm(); emit("warm", warmProgress()); }
  // Guardar la biblioteca entera es caro: una vez al terminar y, si el trabajo es largo, cada tanto.
  if (W.dirty && (idle || now - W.lastSave > 5000)) { W.dirty = false; W.lastSave = now; saveLibrary(); }
  if (idle) { W.total = 0; W.done = 0; for (const f of W.waiters.splice(0)) f(); }
  pump();
}
function pump() {
  while (W.idle.length && W.queue.length) {
    const id = W.queue.shift(); const e = findEntry(id);
    const uc = e ? needsDiag(e) : null;
    if (!e || (gameReady(e) && !uc)) { W.done++; continue; }
    const w = W.idle.pop();
    W.inFlight.set(id, { worker: w, len: e.pgn.length, uc });
    w.postMessage({ id, pgn: e.pgn, analysis: uc ? { at: e.analysis.at, info: e.analysis.info, evals: e.analysis.evals } : null, uc });
  }
  if (!W.queue.length && !W.inFlight.size && W.total) { W.total = 0; W.done = 0; }
}
function enqueue(e) {
  if (W.inFlight.has(e.id) || W.queue.includes(e.id)) return;
  W.queue.push(e.id); W.total++; pump();
}
function syncAllowed() {
  if (W.queue.length || W.inFlight.size) return false;          // ya hay trabajo de fondo: que siga en orden
  if (!W.syncReset) W.syncReset = setTimeout(() => { W.syncSpent = 0; W.syncReset = null; }, 0);
  return W.syncSpent < SYNC_BUDGET_MS;
}
function timed(f) { const t = performance.now(); try { return f(); } finally { W.syncSpent += performance.now() - t; } }

/** La partida leída, si ya está lista. Si no, la pide en segundo plano y devuelve null (avisa con el evento "warm"). */
export function gameSoon(e) {
  const g = gameReady(e); if (g) return g;
  if (W.failed.has(e.id)) return null;
  if (!pool().length || syncAllowed()) { try { return timed(() => gameOf(e)); } catch (err) { W.failed.add(e.id); return null; } }
  enqueue(e); return null;
}
/** El diagnóstico de la partida, si ya está listo. Si no, lo pide en segundo plano y devuelve null. */
export function diagSoon(e, uc) {
  const d = cachedDiag(e, uc); if (d) return d;
  if (W.failed.has(e.id)) return null;
  if (!pool().length || syncAllowed()) {
    try { return timed(() => { const d2 = storeDiag(e, computeDiag(gameOf(e), e.analysis, uc)); saveLibrary(); return d2; }); } catch (err) { W.failed.add(e.id); return null; }
  }
  enqueue(e); return null;
}
/** Al abrir la app: deja leyendo toda la biblioteca, las partidas más nuevas primero. */
export function warmAll() {
  if (!pool().length) return;
  const list = store.library.filter((e) => !W.failed.has(e.id) && (!gameReady(e) || needsDiag(e))).sort((a, b) => (b.date || 0) - (a.date || 0));
  for (const e of list) if (!W.inFlight.has(e.id) && !W.queue.includes(e.id)) { W.queue.push(e.id); W.total++; }
  pump();
}
/** Espera a que termine el trabajo de fondo, pero no más de `ms`: con una biblioteca chica la app abre ya completa. */
export function warmSettled(ms) {
  if (!W.queue.length && !W.inFlight.size) return Promise.resolve();
  return new Promise((res) => { let done = false; const f = () => { if (!done) { done = true; res(); } }; W.waiters.push(f); setTimeout(f, ms); });
}
