// Finales básicos: jugás la posición contra Stockfish a máxima fuerza hasta cumplir el objetivo.
import { store, engines, ensureEngines, saveProgress, logActivity, emit } from "../state.js";
import { Chess, tryMove, uciOf } from "../chess-util.js";
import { LESSONS } from "../endgames-data.js";
import { makeBoard, syncBoard, pickPromotion } from "../board.js";
import { $, esc } from "../ui.js";
import { tr } from "../i18n.js";

const E = { lesson: null, pos: 0, chess: null, userMoves: 0, state: "pick", msg: null, job: null, cg: null, goal: false };
let hooks = {};
const prog = () => store.progress.endgames;

export function initEndgames(h) {
  hooks = h;
  E.cg = makeBoard($("egBoard"), { events: { move: onMove } });
  $("egList").addEventListener("click", (e) => { const b = e.target.closest("[data-lesson]"); if (b) selectLesson(b.dataset.lesson); });
  $("egCard").addEventListener("click", (e) => {
    const lb = e.target.closest("[data-lesson]"); if (lb) { selectLesson(lb.dataset.lesson); return; }
    const t = e.target.closest("[data-act]"); if (!t) return;
    const a = t.dataset.act;
    if (a === "start") startPosition(E.pos);
    else if (a === "pos") { E.pos = +t.dataset.i; startPosition(E.pos); }
    else if (a === "retry") startPosition(E.pos);
    else if (a === "nextpos") { E.pos = (E.pos + 1) % E.lesson.positions.length; startPosition(E.pos); }
    else if (a === "list") { stopEngine(); E.state = "pick"; render(); }
    else if (a === "today") { E.goal = false; hooks.goView("today"); }
  });
  window.__mesaEndgames = { state: () => ({ lesson: E.lesson && E.lesson.id, pos: E.pos, state: E.state, fen: E.chess && E.chess.fen(), moves: E.userMoves, msg: E.msg && E.msg.text }), move: (o, d) => onMove(o, d), select: (id) => selectLesson(id), start: () => startPosition(E.pos) };
}

export function lessonProgress(l) {
  const p = prog()[l.id] || {};
  const done = Object.keys(p.done || {}).length;
  return { done, total: l.positions.length, mastered: done >= l.positions.length, attempts: p.attempts || 0 };
}
export function nextLesson() { return LESSONS.find((l) => !lessonProgress(l).mastered) || LESSONS[0]; }
export function showEndgames() { render(); }
export function startEndgameSession(lessonId) {
  E.goal = true;
  const l = LESSONS.find((x) => x.id === lessonId) || nextLesson();
  selectLesson(l.id);
  const p = prog()[l.id] || {};
  const firstOpen = l.positions.findIndex((_, i) => !(p.done || {})[i]);
  E.pos = firstOpen >= 0 ? firstOpen : 0;
  render();
}
function selectLesson(id) {
  stopEngine();
  E.lesson = LESSONS.find((l) => l.id === id); E.state = "intro"; E.msg = null;
  const p = prog()[id] || {};
  const firstOpen = E.lesson.positions.findIndex((_, i) => !(p.done || {})[i]);
  E.pos = firstOpen >= 0 ? firstOpen : 0;
  E.chess = new Chess(E.lesson.positions[E.pos]);
  render();
}
function stopEngine() { if (E.job) { E.job.cancel(); E.job = null; } }

async function startPosition(i) {
  stopEngine();
  const l = E.lesson;
  E.chess = new Chess(l.positions[i]); E.userMoves = 0; E.msg = null; E.state = "playing";
  const p = prog()[l.id] || (prog()[l.id] = { done: {}, attempts: 0 }); p.attempts = (p.attempts || 0) + 1; saveProgress();
  render();
  if (!engines.play.ready) await ensureEngines();
  await engines.play.newGame();
  await engines.play.configure({ UCI_LimitStrength: "false", "Skill Level": 20 });
  if (E.chess.turn() !== l.side) engineMove();
}
function sideName(c) { return c === "w" ? tr("Blancas", "White") : tr("Negras", "Black"); }

async function onMove(orig, dest, promo) {
  if (E.state !== "playing" || E.chess.turn() !== E.lesson.side) { renderBoard(); return; }
  const fen0 = E.chess.fen();
  if (promo === undefined) promo = await pickPromotion(E.cg, E.chess, orig, dest);
  if (promo === null || E.state !== "playing" || E.chess.fen() !== fen0) { renderBoard(); return; }
  const m = tryMove(E.chess, { from: orig, to: dest, promotion: promo });
  if (!m) { renderBoard(); return; }
  E.userMoves++;
  renderBoard({ captured: !!m.captured, check: m.san.includes("+") }, [m.from, m.to]);
  if (checkEnd(m, true)) return;
  engineMove();
}
async function engineMove() {
  E.state = "thinking"; renderCard();
  const fen = E.chess.fen();
  const job = engines.play.search(fen, "movetime 450");
  E.job = job;
  const r = await job.promise;
  if (E.job !== job || !r || !r.best || E.chess.fen() !== fen) { if (E.job === job) { E.state = "playing"; renderCard(); } return; }
  E.job = null;
  const m = tryMove(E.chess, r.best);
  if (!m) return;
  E.state = "playing";
  renderBoard({ captured: !!m.captured, check: m.san.includes("+") }, [m.from, m.to]);
  if (checkEnd(m, false)) return;
  renderCard();
}
function queenSafe(c, sq, owner) {
  const opp = owner === "w" ? "b" : "w";
  try { return !c.isAttacked(sq, opp) || c.attackers(sq, owner).length > 0; } catch (e) { return true; }
}
function hasPawn(c, color) { for (const row of c.board()) for (const p of row) if (p && p.type === "p" && p.color === color) return true; return false; }

/** Revisa si la posición terminó. byUser: la última jugada fue tuya. */
function checkEnd(m, byUser) {
  const l = E.lesson, c = E.chess, me = l.side, opp = me === "w" ? "b" : "w";
  let result = null, text = "";
  if (l.goal === "mate") {
    if (c.isCheckmate()) { result = c.turn() === opp ? "win" : "lose"; text = result === "win" ? tr(`¡Mate en ${E.userMoves} ${E.userMoves === 1 ? "jugada" : "jugadas"}!`, `Mate in ${E.userMoves} ${E.userMoves === 1 ? "move" : "moves"}!`) : tr("Te dieron mate.", "You got mated."); }
    else if (c.isStalemate()) { result = "lose"; text = tr("Ahogado: el rey rival no tiene jugadas y no está en jaque. Son tablas. Dejale siempre una casilla libre.", "Stalemate: the enemy king has no moves and isn't in check. It's a draw. Always leave it a free square."); }
    else if (c.isDraw()) { result = "lose"; text = tr("La posición terminó en tablas (perdiste el material necesario o se repitió la posición).", "The position ended in a draw (you lost the material you needed or the position repeated)."); }
    else if (byUser && E.userMoves >= l.limit) { result = "lose"; text = tr(`Pasaste las ${l.limit} jugadas sin dar mate. Repasá las ideas y probá de nuevo.`, `You went past ${l.limit} moves without mating. Review the ideas and try again.`); }
  } else if (l.goal === "promote") {
    if (c.isCheckmate()) { result = c.turn() === opp ? "win" : "lose"; text = result === "win" ? tr("¡Mate! Ganaste el final.", "Mate! You won the endgame.") : tr("Te dieron mate.", "You got mated."); }
    else if (byUser && m.promotion) {
      if (queenSafe(c, m.to, me)) { result = "win"; text = tr(`¡Coronaste en ${E.userMoves} ${E.userMoves === 1 ? "jugada" : "jugadas"}! El final está ganado.`, `You promoted in ${E.userMoves} ${E.userMoves === 1 ? "move" : "moves"}! The endgame is won.`); }
      else { result = "lose"; text = tr("Coronaste, pero la dama nueva se puede capturar. Antes de coronar, controlá la casilla con el rey.", "You promoted, but the new queen can be captured. Before promoting, control the square with your king."); }
    } else if (c.isDraw() || !hasPawn(c, me)) { result = "lose"; text = c.isStalemate() ? tr("Ahogado: son tablas.", "Stalemate: it's a draw.") : tr("Se perdió el peón: son tablas.", "The pawn was lost: it's a draw."); }
    else if (byUser && E.userMoves >= l.limit) { result = "lose"; text = tr(`Pasaste las ${l.limit} jugadas sin coronar.`, `You went past ${l.limit} moves without promoting.`); }
  } else {
    if (c.isCheckmate()) { result = "lose"; text = tr("Te dieron mate.", "You got mated."); }
    else if (!byUser && m.promotion && queenSafe(c, m.to, opp)) { result = "lose"; text = tr("El rival coronó. Volvé a intentarlo: rey delante del peón y oposición.", "Your opponent promoted. Try again: king in front of the pawn, and take the opposition."); }
    else if (c.isDraw() || !hasPawn(c, opp)) { result = "win"; text = c.isStalemate() ? tr("¡Ahogado! Son tablas: defensa lograda.", "Stalemate! It's a draw: defense achieved.") : tr("¡Tablas! Frenaste el peón.", "Draw! You stopped the pawn."); }
    else if (byUser && E.userMoves >= l.limit) { result = "win"; text = tr(`¡Resististe ${l.limit} jugadas! La defensa funciona.`, `You held out for ${l.limit} moves! The defense works.`); }
  }
  if (!result) return false;
  stopEngine();
  E.state = result; E.msg = { kind: result === "win" ? "ok" : "bad", text };
  if (result === "win") {
    const p = prog()[l.id] || (prog()[l.id] = { done: {}, attempts: 0 });
    p.done = p.done || {}; p.done[E.pos] = true; p.wins = (p.wins || 0) + 1; saveProgress();
    emit("endgame");
  }
  // Para el plan de "Hoy" cuenta la práctica, ganes o no: los finales difíciles llevan varios intentos.
  logActivity("finales");
  renderBoard(); render();
  return true;
}

/* ---------- render ---------- */
function renderBoard(sound, lastMove) {
  if (!E.chess) return;
  const l = E.lesson;
  syncBoard(E.cg, E.chess, { orientation: l && l.side === "b" ? "black" : "white", lastMove, movable: E.state === "playing" && l && E.chess.turn() === l.side ? l.side : false, sound });
}
function render() {
  renderList();
  const showLesson = E.lesson && E.state !== "pick";
  $("egBoardCol").classList.toggle("dim", !showLesson);
  if (showLesson) {
    if (!E.chess) E.chess = new Chess(E.lesson.positions[E.pos]);
    renderBoard();
    $("egTop").innerHTML = `<span class="who"><span class="pdot ${E.lesson.side === "w" ? "b" : "w"}"></span><span>Stockfish</span><small>${tr("máxima fuerza", "full strength")}</small></span>`;
    renderBotStrip();
  } else {
    const nl = nextLesson();
    syncBoard(E.cg, new Chess(nl.positions[0]), { orientation: nl.side === "b" ? "black" : "white", movable: false });
    $("egTop").innerHTML = ""; $("egBot").innerHTML = "";
  }
  renderCard();
}
function renderBotStrip() {
  if (!E.lesson || E.state === "pick") return;
  $("egBot").innerHTML = `<span class="who"><span class="pdot ${E.lesson.side}"></span><span>${tr("Vos", "You")}</span><em class="you">${sideName(E.lesson.side)}</em></span><span class="acc">${E.state === "playing" || E.state === "thinking" ? `${tr("Jugadas", "Moves")}: ${E.userMoves}/${E.lesson.limit}` : ""}</span>`;
}
function renderList() {
  $("egList").innerHTML = LESSONS.map((l) => {
    const p = lessonProgress(l);
    const pct = (p.done / p.total) * 100;
    return `<button class="eg-item${E.lesson && E.lesson.id === l.id && E.state !== "pick" ? " on" : ""}${p.mastered ? " done" : ""}" type="button" data-lesson="${l.id}">
      <span class="eg-ring" style="--p:${pct}"><i>${p.mastered ? "✓" : `${p.done}/${p.total}`}</i></span>
      <span class="eg-txt"><b>${esc(l.title)}</b><small>${esc(l.level)} · ${esc(l.summary)}</small></span></button>`;
  }).join("");
}
function renderCard() {
  renderBotStrip();
  const el = $("egCard"); const l = E.lesson;
  if (!l || E.state === "pick") {
    const nl = nextLesson();
    el.innerHTML = `<div class="prompt">${tr("Elegí un final", "Choose an endgame")}</div><p class="muted">${tr("Cada final se juega contra Stockfish a máxima fuerza. Lo dominás cuando ganás (o hacés tablas, si es de defensa) en todas sus posiciones.", "Each endgame is played against Stockfish at full strength. You master it when you win (or draw, if it's a defense) in all of its positions.")}</p><div class="btn-row"><button class="btn primary" type="button" data-lesson="${nl.id}">${tr("Seguir con:", "Continue with:")} ${esc(nl.title)}</button></div>`;
    return;
  }
  const p = lessonProgress(l);
  const goalTxt = l.goal === "mate" ? tr(`Dá mate en ${l.limit} jugadas o menos.`, `Checkmate in ${l.limit} moves or fewer.`) : l.goal === "promote" ? tr(`Coroná el peón (o ganá) en ${l.limit} jugadas o menos.`, `Promote the pawn (or win) in ${l.limit} moves or fewer.`) : tr(`Hacé tablas: frená el peón o resistí ${l.limit} jugadas.`, `Draw: stop the pawn or hold out for ${l.limit} moves.`);
  let h = `<div class="eyebrow">${esc(l.level)} · ${tr(`${p.done}/${p.total} posiciones logradas`, `${p.done}/${p.total} positions done`)}</div><h3 class="eg-title">${esc(l.title)}</h3>`;
  if (E.state === "intro") {
    h += `<ul class="ideas">${l.ideas.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
    h += `<p><b>${tr("Objetivo:", "Goal:")}</b> ${esc(goalTxt)} ${tr("Jugás con", "You play")} ${sideName(l.side)}.</p>`;
    h += `<div class="pos-dots">${l.positions.map((_, i) => `<button type="button" class="pos-dot${i === E.pos ? " on" : ""}${(prog()[l.id] || {}).done?.[i] ? " ok" : ""}" data-act="pos" data-i="${i}" title="${tr("Posición", "Position")} ${i + 1}">${i + 1}</button>`).join("")}</div>`;
    h += `<div class="btn-row"><button class="btn primary" type="button" data-act="start">${tr("Empezar posición", "Start position")} ${E.pos + 1}</button><button class="btn small" type="button" data-act="list">${tr("Ver todos los finales", "See all endgames")}</button></div>`;
  } else if (E.state === "playing" || E.state === "thinking") {
    h += `<p><b>${tr("Objetivo:", "Goal:")}</b> ${esc(goalTxt)}</p>`;
    h += `<details class="ideas-mini"><summary>${tr("Ver las ideas clave", "Show the key ideas")}</summary><ul class="ideas">${l.ideas.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></details>`;
    h += `<div class="feedback info">${E.state === "thinking" ? tr("Stockfish está pensando…", "Stockfish is thinking…") : E.chess.turn() === l.side ? tr("Te toca.", "Your move.") : ""}</div>`;
    h += `<div class="btn-row"><button class="btn small" type="button" data-act="retry">${tr("Reiniciar posición", "Restart position")}</button><button class="btn small" type="button" data-act="list">${tr("Salir", "Exit")}</button></div>`;
  } else {
    if (E.msg) h += `<div class="feedback ${E.msg.kind}">${esc(E.msg.text)}</div>`;
    const allDone = lessonProgress(l).mastered;
    if (E.state === "win" && allDone) h += `<p>${tr("<b>¡Dominaste este final!</b> Ya lo resolviste en todas sus posiciones.", "<b>You've mastered this endgame!</b> You've solved it in every position.")}</p>`;
    h += `<div class="btn-row">${E.state === "win" ? `<button class="btn primary" type="button" data-act="nextpos">${tr("Siguiente posición", "Next position")}</button>` : `<button class="btn primary" type="button" data-act="retry">${tr("Probar de nuevo", "Try again")}</button>`}<button class="btn small" type="button" data-act="list">${tr("Ver todos los finales", "See all endgames")}</button>${E.goal && E.state === "win" ? `<button class="btn small" type="button" data-act="today">${tr("Volver a Hoy", "Back to Today")}</button>` : ""}</div>`;
  }
  el.innerHTML = h;
}
