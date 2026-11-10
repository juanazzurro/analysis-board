import { store, engines, ensureEngines, entryFromPgn, addGames, enqueueAnalysis, saveLibrary, findEntry, removeEntry } from "../state.js";
import { Chess, tryMove, uciOf, START_FEN, moveLabel } from "../chess-util.js";
import { makeBoard, syncBoard, pickPromotion, arrow } from "../board.js";
import { $, esc, segBind, segValue, segSet, playerStrip, toast } from "../ui.js";
import { tr } from "../i18n.js";

export const LEVELS = [
  { label: tr("Nivel 1 · ≈ 600", "Level 1 · ≈ 600"), opts: { UCI_LimitStrength: "false", "Skill Level": 0 }, go: "depth 1" },
  { label: tr("Nivel 2 · ≈ 850", "Level 2 · ≈ 850"), opts: { UCI_LimitStrength: "false", "Skill Level": 2 }, go: "depth 2 movetime 150" },
  { label: tr("Nivel 3 · ≈ 1100", "Level 3 · ≈ 1100"), opts: { UCI_LimitStrength: "false", "Skill Level": 5 }, go: "depth 4 movetime 250" },
  { label: tr("Nivel 4 · ≈ 1350", "Level 4 · ≈ 1350"), opts: { UCI_LimitStrength: "true", UCI_Elo: 1350 }, go: "movetime 500" },
  { label: tr("Nivel 5 · ≈ 1550", "Level 5 · ≈ 1550"), opts: { UCI_LimitStrength: "true", UCI_Elo: 1550 }, go: "movetime 600" },
  { label: tr("Nivel 6 · ≈ 1750", "Level 6 · ≈ 1750"), opts: { UCI_LimitStrength: "true", UCI_Elo: 1750 }, go: "movetime 700" },
  { label: tr("Nivel 7 · ≈ 2000", "Level 7 · ≈ 2000"), opts: { UCI_LimitStrength: "true", UCI_Elo: 2000 }, go: "movetime 800" },
  { label: tr("Nivel 8 · ≈ 2300", "Level 8 · ≈ 2300"), opts: { UCI_LimitStrength: "true", UCI_Elo: 2300 }, go: "movetime 900" },
  { label: tr("Nivel 9 · ≈ 2700", "Level 9 · ≈ 2700"), opts: { UCI_LimitStrength: "true", UCI_Elo: 2700 }, go: "movetime 1000" },
  { label: tr("Nivel 10 · Máximo", "Level 10 · Max"), opts: { UCI_LimitStrength: "false", "Skill Level": 20 }, go: "movetime 1500" }
];

const P = { chess: null, startFen: START_FEN, user: "w", level: 4, over: null, thinking: false, job: null, from: "start", pendingFen: null, cg: null, history: [], resigned: false };
let hooks = {};

export function initPlay(h) {
  hooks = h;
  P.cg = makeBoard($("plBoard"), { events: { move: onMove } });
  segBind($("plColor")); segBind($("plFrom"));
  $("plLevel").addEventListener("input", () => { $("plLevelLbl").textContent = LEVELS[+$("plLevel").value - 1].label.replace(/^(Nivel|Level) \d+ · /, ""); });
  $("plLevel").dispatchEvent(new Event("input"));
  $("plStart").onclick = start;
  $("plNew").onclick = setup;
  $("plUndo").onclick = undo;
  $("plHint").onclick = hint;
  $("plResign").onclick = resign;
  $("plAnalyse").onclick = analyse;
  $("plMoves").addEventListener("click", () => {});
  syncBoard(P.cg, new Chess(), { orientation: "white", movable: false });
  stripsFor(null);
}

export function playFrom(fen, color) {
  P.pendingFen = fen; $("plFromRow").hidden = false; segSet($("plFrom"), "f", "pos");
  if (color) segSet($("plColor"), "c", color);
  setup();
  try { syncBoard(P.cg, new Chess(fen), { orientation: color === "b" ? "black" : "white", movable: false }); } catch (e) {}
}

function setup() {
  cancelThink(); clearHint();
  $("plSetup").hidden = false; $("plGame").hidden = true;
  P.over = null; P.chess = null;
}

async function start() {
  P.savedId = null; P.savedLen = 0;
  const c = segValue($("plColor")).c || "w";
  P.user = c === "r" ? (Math.random() < 0.5 ? "w" : "b") : c;
  P.level = +$("plLevel").value;
  P.from = $("plFromRow").hidden ? "start" : segValue($("plFrom")).f || "start";
  P.startFen = P.from === "pos" && P.pendingFen ? P.pendingFen : START_FEN;
  try { P.chess = new Chess(P.startFen); } catch (e) { P.chess = new Chess(); P.startFen = START_FEN; }
  P.history = []; P.over = null; P.resigned = false; P.hint = null; P.hints = 0;
  $("plSetup").hidden = true; $("plGame").hidden = false;
  $("plLevelNow").textContent = LEVELS[P.level - 1].label;
  if (!engines.play.ready) {
    const err = await ensureEngines();
    if (!engines.play.ready) { toast(tr("No se pudo iniciar Stockfish: ", "Couldn't start Stockfish: ") + (err || engines.play.failed || tr("error desconocido", "unknown error")), 7000); setup(); return; }
  }
  await engines.play.newGame();
  await engines.play.configure(LEVELS[P.level - 1].opts);
  render();
  if (P.chess.turn() !== P.user) engineMove();
}

function clearHint() { P.hint = null; if (P.hintJob) { P.hintJob.cancel(); P.hintJob = null; } }
/** Pista: el motor (a toda su fuerza) marca con una flecha la jugada que haría en tu lugar. */
async function hint() {
  if (!P.chess || P.over || P.thinking || P.chess.turn() !== P.user) return;
  const fen = P.chess.fen();
  if (!engines.live.ready) { await ensureEngines(); if (!engines.live.ready) { toast(tr("El motor no está disponible para dar una pista.", "The engine isn't available to give a hint.")); return; } }
  clearHint();
  $("plHint").disabled = true;
  engines.live.configure({ MultiPV: 1 });
  const job = engines.live.search(fen, "depth 18 movetime 1200");
  P.hintJob = job;
  const r = await job.promise;
  if (P.hintJob !== job) return;
  P.hintJob = null;
  if (r && r.best && P.chess && P.chess.fen() === fen && !P.over) { P.hint = r.best; P.hints = (P.hints || 0) + 1; }
  render();
}
function cancelThink() { if (P.job) { P.job.cancel(); P.job = null; } P.thinking = false; }

async function onMove(orig, dest, promo) {
  if (!P.chess || P.over || P.thinking || P.chess.turn() !== P.user) { render(); return; }
  const fen0 = P.chess.fen();
  if (promo === undefined) promo = await pickPromotion(P.cg, P.chess, orig, dest);
  if (promo === null || !P.chess || P.chess.fen() !== fen0 || P.over) { render(); return; }
  clearHint();
  const m = tryMove(P.chess, { from: orig, to: dest, promotion: promo });
  if (!m) { render(); return; }
  P.history.push({ uci: uciOf(m), san: m.san, from: m.from, to: m.to, color: m.color });
  render({ captured: !!m.captured, check: m.san.includes("+") || m.san.includes("#") });
  if (!checkOver()) engineMove();
}

async function engineMove() {
  if (!P.chess || P.over) return;
  P.thinking = true; render();
  const fen = P.chess.fen();
  const t0 = performance.now();
  const job = engines.play.search(fen, LEVELS[P.level - 1].go);
  P.job = job;
  const r = await job.promise;
  if (P.job !== job) return;
  P.job = null;
  if (!r && !engines.play.ready) { P.thinking = false; toast(tr("Stockfish se cerró. Tocá “Nueva partida” para reintentar.", "Stockfish closed. Click “New game” to try again."), 6000); render(); return; }
  const wait = Math.max(0, 380 - (performance.now() - t0));
  if (wait) await new Promise((res) => setTimeout(res, wait));
  if (!P.chess || P.chess.fen() !== fen || P.over) { P.thinking = false; return; }
  P.thinking = false;
  if (!r || !r.best) { render(); return; }
  const m = tryMove(P.chess, r.best);
  if (m) P.history.push({ uci: uciOf(m), san: m.san, from: m.from, to: m.to, color: m.color });
  render(m ? { captured: !!m.captured, check: m.san.includes("+") || m.san.includes("#") } : null);
  checkOver();
}

function checkOver() {
  const c = P.chess;
  if (!c.isGameOver()) return false;
  if (c.isCheckmate()) P.over = c.turn() === P.user ? tr("Stockfish gana por jaque mate", "Stockfish wins by checkmate") : tr("¡Ganaste por jaque mate!", "You won by checkmate!");
  else if (c.isStalemate()) P.over = tr("Tablas por ahogado", "Draw by stalemate");
  else if (c.isThreefoldRepetition()) P.over = tr("Tablas por repetición", "Draw by repetition");
  else if (c.isInsufficientMaterial()) P.over = tr("Tablas por material insuficiente", "Draw by insufficient material");
  else P.over = tr("Tablas", "Draw");
  render();
  return true;
}
function undo() {
  if (!P.chess || P.history.length === 0) return;
  cancelThink(); clearHint();
  let n = P.chess.turn() === P.user ? 2 : 1;
  if (P.over) n = P.chess.turn() === P.user ? 2 : 1;
  for (let i = 0; i < n && P.history.length; i++) { P.chess.undo(); P.history.pop(); }
  P.over = null; P.resigned = false;
  render();
  if (P.chess.turn() !== P.user) engineMove();
}
function resign() {
  if (!P.chess || P.over) return;
  cancelThink(); P.resigned = true; P.over = tr("Te rendiste", "You resigned"); render();
}
function resultTag() {
  if (P.resigned) return P.user === "w" ? "0-1" : "1-0";
  const c = P.chess;
  if (c.isCheckmate()) return c.turn() === "w" ? "0-1" : "1-0";
  if (c.isGameOver()) return "1/2-1/2";
  return "*";
}
function analyse() {
  if (!P.chess || !P.history.length) { toast(tr("Jugá al menos una jugada para analizar.", "Play at least one move to analyze.")); return; }
  // Si ya la mandaste a analizar y no cambió, abrimos la misma (sin duplicarla en la lista).
  if (P.savedId && P.savedLen === P.history.length && findEntry(P.savedId)) { hooks.openGame(P.savedId, 0); return; }
  const c = new Chess(P.startFen);
  for (const h of P.history) tryMove(c, h.uci);
  const me = tr("Vos", "You"), bot = "Stockfish " + LEVELS[P.level - 1].label.replace(/^(Nivel|Level) (\d+).*/, tr("nivel $2", "level $2"));
  c.setHeader("Event", tr("Partida contra Stockfish", "Game against Stockfish"));
  c.setHeader("White", P.user === "w" ? me : bot);
  c.setHeader("Black", P.user === "b" ? me : bot);
  const d = new Date(); c.setHeader("Date", `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`);
  c.setHeader("Result", resultTag());
  const pgn = c.pgn();
  let entry;
  try { entry = entryFromPgn(pgn, { id: "play-" + Date.now(), source: "play", userColor: P.user }); } catch (e) { toast(e.message); return; }
  entry.date = Date.now();
  if (P.savedId && findEntry(P.savedId)) removeEntry(P.savedId);
  P.savedId = entry.id; P.savedLen = P.history.length;
  addGames([entry]); enqueueAnalysis(entry.id, true);
  // Pediste el análisis explícitamente: se abre directo (la revisión propia queda a un botón).
  hooks.openGame(entry.id, 0);
}

function stripsFor(chess) {
  const lvl = LEVELS[P.level - 1].label;
  const you = playerStrip(tr("Vos", "You"), "", P.user, true), bot = playerStrip("Stockfish", lvl.replace(/^(Nivel|Level) \d+ · /, ""), P.user === "w" ? "b" : "w", false);
  $("plTop").innerHTML = chess ? bot : ""; $("plBot").innerHTML = chess ? you : "";
}
function render(sound) {
  const c = P.chess;
  if (!c) return;
  const last = P.history[P.history.length - 1];
  const myTurn = !P.over && !P.thinking && c.turn() === P.user;
  syncBoard(P.cg, c, { orientation: P.user === "w" ? "white" : "black", lastMove: last ? [last.from, last.to] : undefined, movable: myTurn ? P.user : false, shapes: P.hint && myTurn ? [arrow(P.hint, "best")] : [], sound });
  $("plHint").disabled = !myTurn;
  stripsFor(c);
  $("plStatus").textContent = P.over || (P.thinking ? tr("Stockfish está pensando…", "Stockfish is thinking…") : c.turn() === P.user ? tr("Te toca", "Your move") : tr("Turno de Stockfish", "Stockfish to move"));
  $("plUndo").disabled = !P.history.length; $("plResign").disabled = !!P.over;
  // lista de jugadas
  const rows = []; const start = new Chess(P.startFen); let n = +P.startFen.split(" ")[5] || 1;
  let i = 0; const hs = P.history;
  if (hs.length && start.turn() === "b") { rows.push(`<tr><td class="n">${n}.</td><td>…</td><td><span class="mv">${esc(hs[0].san)}</span></td></tr>`); i = 1; n++; }
  for (; i < hs.length; i += 2, n++) rows.push(`<tr><td class="n">${n}.</td><td><span class="mv">${esc(hs[i].san)}</span></td><td>${hs[i + 1] ? `<span class="mv">${esc(hs[i + 1].san)}</span>` : ""}</td></tr>`);
  const box = $("plMoves"); box.innerHTML = rows.length ? `<table><tbody>${rows.join("")}</tbody></table>` : `<p class="muted small" style="padding:8px">${P.user === "w" && c.turn() === "w" ? tr("Empezás vos.", "You start.") : tr("Stockfish empieza.", "Stockfish starts.")}</p>`;
  box.scrollTop = box.scrollHeight;
  void moveLabel;
}
