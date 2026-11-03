// Problemas tácticos por tema, con dificultad que se ajusta a tu nivel.
import { tr, EN, fmtInt } from "../i18n.js";
import { store, emit, saveProgress, logActivity } from "../state.js";
import { Chess, tryMove, uciOf, pvToSan } from "../chess-util.js";
import { recommendedThemes } from "../insights.js";
import { makeBoard, syncBoard, arrow } from "../board.js";
import { $, esc, toast } from "../ui.js";

export const THEME_LABEL = EN ? {
  mateIn1: "Mate in 1", mateIn2: "Mate in 2", mateIn3: "Mate in 3", mateIn4: "Long mates", mate: "Mates", backRankMate: "Back-rank mate",
  smotheredMate: "Smothered mate", fork: "Fork", pin: "Pin", skewer: "Skewer", discoveredAttack: "Discovered attack", doubleCheck: "Double check",
  hangingPiece: "Hanging piece", trappedPiece: "Trapped piece", deflection: "Deflection", attraction: "Attraction", sacrifice: "Sacrifice",
  promotion: "Promotion", advancedPawn: "Advanced pawn", defensiveMove: "Defensive move", quietMove: "Quiet move", zugzwang: "Zugzwang",
  endgame: "Endgames", rookEndgame: "Rook endgames", pawnEndgame: "Pawn endgames", kingsideAttack: "Kingside attack", exposedKing: "Exposed king",
  capturingDefender: "Remove the defender", interference: "Interference", xRayAttack: "X-ray", intermezzo: "Intermezzo", clearance: "Clearance", tactic: "Mixed tactics"
} : {
  mateIn1: "Mate en 1", mateIn2: "Mate en 2", mateIn3: "Mate en 3", mateIn4: "Mates largos", mate: "Mates", backRankMate: "Mate en la última fila",
  smotheredMate: "Mate de la coz", fork: "Horquilla", pin: "Clavada", skewer: "Enfilada", discoveredAttack: "Ataque descubierto", doubleCheck: "Jaque doble",
  hangingPiece: "Pieza colgada", trappedPiece: "Pieza atrapada", deflection: "Desviación", attraction: "Atracción", sacrifice: "Sacrificio",
  promotion: "Coronación", advancedPawn: "Peón avanzado", defensiveMove: "Jugada defensiva", quietMove: "Jugada tranquila", zugzwang: "Zugzwang",
  endgame: "Finales", rookEndgame: "Finales de torres", pawnEndgame: "Finales de peones", kingsideAttack: "Ataque al rey", exposedKing: "Rey expuesto",
  capturingDefender: "Eliminar al defensor", interference: "Interferencia", xRayAttack: "Rayos X", intermezzo: "Jugada intermedia", clearance: "Despeje", tactic: "Táctica variada"
};
const THEME_ORDER = ["hangingPiece", "fork", "pin", "mateIn1", "mateIn2", "discoveredAttack", "skewer", "backRankMate", "mateIn3", "doubleCheck", "trappedPiece",
  "deflection", "attraction", "capturingDefender", "sacrifice", "promotion", "advancedPawn", "defensiveMove", "kingsideAttack", "exposedKing", "intermezzo",
  "quietMove", "xRayAttack", "interference", "clearance", "zugzwang", "smotheredMate", "mateIn4", "endgame", "pawnEndgame", "rookEndgame", "tactic"];

const P = { db: null, source: "", byTheme: new Map(), theme: "rec", cur: null, chess: null, idx: 0, user: "w", state: "idle", failed: false, hint: false, rated: false, msg: null, delta: 0, goal: null, cg: null, timer: null, loading: null };
let hooks = {};
const prog = () => store.progress.puzzles;

export function initPuzzles(h) {
  hooks = h;
  P.cg = makeBoard($("pzBoard"), { events: { move: onMove } });
  P.theme = prog().theme || "rec";
  $("pzThemes").addEventListener("click", (e) => {
    const b = e.target.closest("[data-theme]"); if (!b) return;
    P.theme = b.dataset.theme; prog().theme = P.theme; saveProgress();
    renderThemes(); nextPuzzle();
  });
  $("pzCard").addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    const a = t.dataset.act;
    if (a === "hint") { P.hint = true; renderBoardShapes(); renderCard(); }
    else if (a === "solution") showSolution();
    else if (a === "next") {
      // Saltear sin intentar: no cuenta para el nivel, pero no vuelve a aparecer enseguida.
      if (P.cur && !P.rated) {
        if (P.hint) rate(0);
        else { const pr = prog(); pr.seen = (pr.seen || []).concat([P.cur.id]).slice(-6000); saveProgress(); }
      }
      nextPuzzle();
    }
    else if (a === "today") { P.goal = null; hooks.goView("today"); }
    else if (a === "lichess") window.api.openExternal("https://lichess.org/training/" + P.cur.id);
  });
  $("pzSource").addEventListener("click", (e) => { if (e.target.closest("[data-act=download]")) download(); });
  window.api.onPuzzlesProgress((p) => renderDownload(p));
  window.__mesaPuzzles = { state: () => ({ id: P.cur && P.cur.id, moves: P.cur && P.cur.moves, idx: P.idx, state: P.state, rating: prog().rating, user: P.user, count: P.db ? P.db.length : 0, msg: P.msg && P.msg.text }), move: (o, d) => onMove(o, d) };
}

async function ensureDb() {
  if (P.db) return;
  if (!P.loading) P.loading = window.api.puzzlesLoad().then((r) => {
    P.db = r.puzzles; P.source = r.source; P.byTheme = new Map();
    P.db.forEach((p, i) => { for (const t of p[4].split(" ")) { if (!P.byTheme.has(t)) P.byTheme.set(t, []); P.byTheme.get(t).push(i); } });
  });
  await P.loading;
}

export async function showPuzzles() {
  await ensureDb();
  renderThemes(); renderSource(); renderThemeStats();
  if (!P.cur) nextPuzzle(); else { renderBoardFresh(); renderCard(); }
}
/** Tanda desde "Hoy": count problemas del tema recomendado. */
export async function startPuzzleSession(opts = {}) {
  P.goal = opts.count ? { count: opts.count, done: 0 } : null;
  if (opts.theme) { P.theme = opts.theme; prog().theme = P.theme; saveProgress(); }
  await ensureDb(); renderThemes(); renderSource(); renderThemeStats();
  nextPuzzle();
}

function themesForPick() {
  if (P.theme === "rec") return recommendedThemes().filter((t) => P.byTheme.has(t));
  return [P.theme];
}
function pick() {
  const r = prog().rating;
  const themes = themesForPick();
  const idxs = new Set(); for (const t of themes) for (const i of P.byTheme.get(t) || []) idxs.add(i);
  let pool = [...idxs]; if (!pool.length) pool = P.db.map((_, i) => i);
  const seen = new Set(prog().seen || []);
  for (let w = 100; ; w *= 2) {
    const c = pool.filter((i) => Math.abs(P.db[i][3] - r) <= w && !seen.has(P.db[i][0]));
    if (c.length >= 12 || w >= 1600) { const list = c.length ? c : pool; return P.db[list[Math.floor(Math.random() * list.length)]]; }
  }
}

function nextPuzzle() {
  clearTimeout(P.timer);
  if (P.goal && P.goal.done >= P.goal.count) { P.state = "goal"; renderCard(); return; }
  const p = pick(); if (!p) return;
  P.cur = { id: p[0], fen: p[1], moves: p[2].split(" "), rating: p[3], themes: p[4].split(" ") };
  P.chess = new Chess(P.cur.fen); P.idx = 0; P.failed = false; P.hint = false; P.rated = false; P.msg = null; P.delta = 0;
  P.user = P.cur.fen.split(" ")[1] === "w" ? "b" : "w";
  P.state = "intro";
  syncBoard(P.cg, P.chess, { orientation: P.user === "w" ? "white" : "black", movable: false, shapes: [] });
  renderCard();
  P.timer = setTimeout(opponentMove, 650);
}
function opponentMove() {
  const u = P.cur.moves[P.idx]; const m = tryMove(P.chess, u);
  if (!m) { P.state = "error"; P.msg = { kind: "bad", text: tr("Este problema tiene un error. Pasá al siguiente.", "This puzzle has an error. Move on to the next one.") }; renderCard(); return; }
  P.idx++;
  P.state = "solving";
  syncBoard(P.cg, P.chess, { orientation: P.user === "w" ? "white" : "black", lastMove: [m.from, m.to], movable: P.user, shapes: [], sound: { captured: !!m.captured, check: m.san.includes("+") } });
  renderCard();
}
function onMove(orig, dest) {
  if (P.state !== "solving") { renderBoardFresh(); return; }
  const exp = P.cur.moves[P.idx];
  const c = new Chess(P.chess.fen());
  const piece = c.get(orig);
  let promo;
  if (piece && piece.type === "p" && (dest[1] === "8" || dest[1] === "1")) promo = exp && exp.slice(0, 4) === orig + dest && exp[4] ? exp[4] : "q";
  const m = tryMove(c, { from: orig, to: dest, promotion: promo });
  if (!m) { renderBoardFresh(); return; }
  const ok = uciOf(m) === exp || c.isCheckmate();
  if (!ok) {
    // Como en Lichess: el primer error ya cuenta para tu nivel (aunque después lo resuelvas o lo saltees).
    if (!P.failed) rate(0);
    P.failed = true;
    P.msg = { kind: "bad", text: tr(`${m.san} no es la jugada. Probá otra.`, `${m.san} isn't the move. Try another one.`) };
    renderBoardFresh(); renderCard(); return;
  }
  P.chess = c; P.idx++;
  P.msg = null;
  const snd = { captured: !!m.captured, check: m.san.includes("+") };
  if (P.idx >= P.cur.moves.length || c.isCheckmate()) {
    syncBoard(P.cg, c, { orientation: P.user === "w" ? "white" : "black", lastMove: [m.from, m.to], movable: false, sound: snd });
    finish(); return;
  }
  P.state = "reply";
  syncBoard(P.cg, c, { orientation: P.user === "w" ? "white" : "black", lastMove: [m.from, m.to], movable: false, sound: snd });
  renderCard();
  P.timer = setTimeout(opponentMove, 420);
}
function rate(score) {
  if (P.rated) return;
  P.rated = true;
  const pr = prog();
  const expct = 1 / (1 + Math.pow(10, (P.cur.rating - pr.rating) / 400));
  const K = (pr.n || 0) < 20 ? 40 : 20;
  const delta = Math.round(K * (score - expct));
  pr.rating = Math.max(100, pr.rating + delta); pr.n = (pr.n || 0) + 1; P.delta = delta;
  pr.history = (pr.history || []).concat([{ t: Date.now(), r: pr.rating }]).slice(-400);
  pr.seen = (pr.seen || []).concat([P.cur.id]).slice(-6000);
  for (const t of P.cur.themes) { const s = pr.themes[t] || (pr.themes[t] = { n: 0, ok: 0 }); s.n++; s.ok += score; }
  saveProgress(); logActivity("problemas");
  if (P.goal) P.goal.done++;
  emit("puzzle");
}
function finish() {
  const clean = !P.failed && !P.hint;
  rate(clean ? 1 : 0);
  P.state = "done";
  P.msg = clean ? { kind: "ok", text: tr("¡Resuelto!", "Solved!") } : { kind: "info", text: tr("Resuelto con ayuda. Vas a ver más problemas de este tipo.", "Solved with help. You'll see more puzzles like this one.") };
  renderCard(); renderThemeStats();
}
function showSolution() {
  if (!P.cur || (P.state !== "solving" && P.state !== "reply")) return;
  clearTimeout(P.timer);
  P.failed = true; P.state = "showing";
  rate(0);
  const step = () => {
    if (P.idx >= P.cur.moves.length) { P.state = "done"; P.msg = { kind: "info", text: tr("Esa era la solución. Repasala moviendo las piezas mentalmente.", "That was the solution. Go over it by moving the pieces in your head.") }; renderCard(); renderThemeStats(); return; }
    const u = P.cur.moves[P.idx]; const m = tryMove(P.chess, u); P.idx++;
    if (!m) { P.state = "done"; renderCard(); return; }
    syncBoard(P.cg, P.chess, { orientation: P.user === "w" ? "white" : "black", lastMove: [m.from, m.to], movable: false, shapes: [arrow(u, m.color === P.user ? "green" : "red")], sound: { captured: !!m.captured } });
    P.timer = setTimeout(step, 900);
  };
  renderCard(); step();
}

/* ---------- render ---------- */
function renderBoardShapes() {
  const shapes = [];
  if (P.hint && P.state === "solving") shapes.push({ orig: P.cur.moves[P.idx].slice(0, 2), brush: "yellow" });
  try { P.cg.setAutoShapes(shapes); } catch (e) {}
}
function renderBoardFresh() {
  if (!P.chess) return;
  const last = P.chess.history({ verbose: true }).pop();
  syncBoard(P.cg, P.chess, { orientation: P.user === "w" ? "white" : "black", lastMove: last ? [last.from, last.to] : undefined, movable: P.state === "solving" ? P.user : false });
  renderBoardShapes();
}
function renderThemes() {
  if (!P.db) return;
  const rec = recommendedThemes().filter((t) => P.byTheme.has(t)).map((t) => THEME_LABEL[t] || t);
  const chips = [`<button class="chip-t${P.theme === "rec" ? " on" : ""}" type="button" data-theme="rec" title="${esc(rec.join(", "))}">${tr("Recomendado para vos", "Recommended for you")}</button>`];
  for (const t of THEME_ORDER) {
    const n = (P.byTheme.get(t) || []).length; if (n < 30) continue;
    chips.push(`<button class="chip-t${P.theme === t ? " on" : ""}" type="button" data-theme="${t}">${esc(THEME_LABEL[t] || t)}</button>`);
  }
  $("pzThemes").innerHTML = chips.join("");
  $("pzRecNote").textContent = P.theme === "rec" ? tr(`Según tus errores: ${rec.slice(0, 4).join(", ")}.`, `Based on your mistakes: ${rec.slice(0, 4).join(", ")}.`) : "";
}
function renderCard() {
  const el = $("pzCard"); const pr = prog();
  $("pzRating").innerHTML = `<b>${pr.rating}</b><span>${P.delta ? `<em class="${P.delta > 0 ? "up" : "down"}">${P.delta > 0 ? "+" : "−"}${Math.abs(P.delta)}</em>` : ""} ${tr("tu nivel en problemas", "your puzzle rating")}</span>`;
  if (P.state === "goal") {
    el.innerHTML = `<div class="prompt">${tr("¡Bloque de táctica terminado!", "Tactics block complete!")}</div><p>${tr(`Hiciste ${P.goal.done} problemas.`, `You did ${P.goal.done} puzzles.`)}</p><div class="btn-row"><button class="btn primary" type="button" data-act="today">${tr("Volver a Hoy", "Back to Today")}</button><button class="btn small" type="button" data-act="next">${tr("Seguir con más", "Keep going")}</button></div>`;
    if (P.goal) P.goal = null;
    return;
  }
  if (!P.cur) { el.innerHTML = `<p class="thinking">${tr("Cargando problemas…", "Loading puzzles…")}</p>`; return; }
  const side = P.user === "w" ? tr("Blancas", "White") : tr("Negras", "Black");
  let h = `<div class="prompt">${P.state === "intro" ? tr("Mirá la jugada de tu rival…", "Watch your opponent's move…") : tr(`Juegan ${side}: encontrá la mejor jugada.`, `${side} to move: find the best move.`)}</div>`;
  if (P.goal) h += `<div class="goal-bar"><span>${tr("Tanda de hoy", "Today's set")}</span><i><b style="width:${Math.min(100, (P.goal.done / P.goal.count) * 100)}%"></b></i><span>${Math.min(P.goal.done, P.goal.count)}/${P.goal.count}</span></div>`;
  if (P.msg) h += `<div class="feedback ${P.msg.kind}">${esc(P.msg.text)}${P.state === "done" && P.delta ? ` <b>${P.delta > 0 ? "+" : "−"}${Math.abs(P.delta)}</b>` : ""}</div>`;
  if (P.state === "solving" || P.state === "reply" || P.state === "intro") {
    h += `<div class="btn-row"><button class="btn small" type="button" data-act="hint" ${P.hint || P.state !== "solving" ? "disabled" : ""}>${tr("Pista", "Hint")}</button><button class="btn small" type="button" data-act="solution" ${P.state === "intro" ? "disabled" : ""}>${tr("Ver solución", "Show solution")}</button><button class="btn small" type="button" data-act="next">${tr("Saltear", "Skip")}</button></div>`;
  } else if (P.state === "done" || P.state === "error") {
    h += `<p class="small muted">${tr(`Problema de ${P.cur.rating}`, `Puzzle rated ${P.cur.rating}`)} · ${esc(P.cur.themes.map((t) => THEME_LABEL[t] || t).join(", "))}</p>`;
    h += `<div class="btn-row"><button class="btn primary" type="button" data-act="next">${tr("Siguiente", "Next")}</button><button class="linkbtn" type="button" data-act="lichess">${tr("Ver en Lichess", "See on Lichess")}</button></div>`;
  }
  el.innerHTML = h;
}
function renderThemeStats() {
  const pr = prog();
  const rows = Object.entries(pr.themes || {}).filter(([, s]) => s.n >= 3).map(([t, s]) => ({ t, n: s.n, pct: s.ok / s.n })).sort((a, b) => a.pct - b.pct).slice(0, 8);
  $("pzStats").innerHTML = rows.length ? rows.map((r) => `<div class="bar-row"><span>${esc(THEME_LABEL[r.t] || r.t)}</span><i><b style="width:${(r.pct * 100).toFixed(0)}%"></b></i><em>${(r.pct * 100).toFixed(0)}% · ${r.n}</em></div>`).join("")
    : `<p class="muted small">${tr("Cuando resuelvas algunos problemas vas a ver acá tus temas más flojos.", "Once you solve some puzzles you'll see your weakest themes here.")}</p>`;
}
function renderSource(extra = "") {
  const n = P.db ? P.db.length : 0;
  const lich = P.source === "lichess";
  $("pzSource").innerHTML = `<p class="small muted">${lich
    ? tr(`Base de Lichess: ${fmtInt(n)} problemas seleccionados por tema y nivel.`, `Lichess database: ${fmtInt(n)} puzzles selected by theme and level.`)
    : tr(`Base incluida: ${fmtInt(n)} problemas de Lichess. La base completa trae más temas (enfilada, desviación, sacrificio, finales de torres…) clasificados por Lichess.`, `Built-in set: ${fmtInt(n)} Lichess puzzles. The full database adds more themes (skewer, deflection, sacrifice, rook endgames…) tagged by Lichess.`)}</p>`
    + (lich ? "" : `<div class="btn-row"><button class="btn small" type="button" data-act="download">${tr("Descargar la base completa (≈ 300 MB, una vez)", "Download the full database (≈ 300 MB, once)")}</button></div>`) + extra;
}
function renderDownload(p) {
  if (p.done) { toast(tr(`Listo: ${fmtInt(p.kept)} problemas nuevos.`, `Done: ${fmtInt(p.kept)} new puzzles.`)); return; }
  const pct = p.total ? Math.min(100, (p.received / p.total) * 100) : 0;
  $("pzSource").innerHTML = `<p class="small">${tr("Descargando y seleccionando problemas…", "Downloading and selecting puzzles…")} ${p.total ? pct.toFixed(0) + "%" : (p.received / 1048576).toFixed(0) + " MB"}</p><div class="progress"><div class="progress-track"><div class="progress-bar" style="width:${pct}%"></div></div><span class="progress-txt">${tr(`${fmtInt(p.kept)} elegidos`, `${fmtInt(p.kept)} selected`)}</span></div>`;
}
async function download() {
  renderDownload({ received: 0, total: 0, kept: 0 });
  try {
    await window.api.puzzlesDownload();
    P.db = null; P.loading = null; await ensureDb();
    renderThemes(); renderSource(); nextPuzzle();
  } catch (e) {
    renderSource(`<p class="err small">${esc(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ""))}</p>`);
  }
}
