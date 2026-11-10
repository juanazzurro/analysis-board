// "¿Qué te amenaza?": primero mostrás la amenaza del rival, después te defendés.
import { store, on, emit, gameOf, detectUserColor, saveTraining, engines, ensureEngines, findEntry, logActivity, enqueueAnalysis, libSignature } from "../state.js";
import { Chess, tryMove, uciOf, pvToSan, moveLabel, wp, toCp, scoreFromInfo } from "../chess-util.js";
import { tr, pieceOn } from "../i18n.js";
import { nullMoveFen } from "../motifs.js";
import { gameSoon, diagSoon } from "../warm.js";
import { isSolved, isDue, isMastered, recordResult, nextReviewText } from "../srs.js";
import { isFork, listTargets } from "../explain.js";
import { makeBoard, syncBoard, arrow, pickPromotion } from "../board.js";
import { $, esc, segBind, segSet, playerStrip, fmtDate } from "../ui.js";

const T = { mode: "new", goal: null, list: [], i: 0, ex: null, step: "find", tries: 0, errors: 0, msg: null, checking: null, cg: null };
let hooks = {};

export function initThreats(h) {
  hooks = h;
  T.cg = makeBoard($("thBoard"), { events: { move: onMove } });
  segBind(document.querySelector("#view-threats .seg"), (d) => { T.mode = d.tm; T.goal = null; rebuild(); });
  $("thCard").addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    const a = t.dataset.act;
    if (a === "defend") startDefend();
    else if (a === "reveal-threat") revealThreat();
    else if (a === "reveal-defense") revealDefense();
    else if (a === "retry") { T.msg = null; T.step === "defend-wrong" ? (T.step = "defend") : null; render(true); }
    else if (a === "next") next();
    else if (a === "open") hooks.openGame(T.ex.entryId, T.ex.k + 1);
    else if (a === "today") { T.goal = null; hooks.goView("today"); }
    else if (a === "goto") hooks.goView(t.dataset.view);
    else if (a === "analyse") { store.library.filter((g) => !g.analysis && detectUserColor(g)).forEach((g) => enqueueAnalysis(g.id, false, "rapida")); hooks.toast(tr("Partidas en cola para analizar.", "Games queued for analysis.")); }
  });
  window.__mesaThreats = { move: (o, d) => onMove(o, d), state: () => ({ n: T.list.length, i: T.i, step: T.step, ex: T.ex && { id: T.ex.id, threat: T.ex.threat, best: T.ex.best, played: T.ex.played }, msg: T.msg && T.msg.text }) };
  on("library", updateCount); on("training", updateCount);
  on("warm", () => { updateCount(); if (!$("view-threats").hidden && !T.ex) rebuild(); });
}

let thCache = null, thKey = "";
export function threatExercises() {
  const key = libSignature();
  if (thCache && thKey === key) return thCache;
  thCache = buildThreats(); thKey = key;
  return thCache;
}
function buildThreats() {
  const out = [];
  for (const e of store.library) {
    const uc = detectUserColor(e); if (!uc || !e.analysis) continue;
    const g = gameSoon(e); if (!g) continue;          // todavía se está leyendo en segundo plano
    const d = diagSoon(e, uc); if (!d) continue;
    for (const it of d.items) {
      if (!it.threat) continue;
      const k = it.k, fen = g.fens[k], nf = nullMoveFen(fen);
      const threatSan = pvToSan(nf, [it.threat], 1)[0]; if (!threatSan) continue;
      const prev = k > 0 ? g.moves[k - 1] : null;
      const B = e.analysis.evals[k];
      out.push({
        id: "t:" + e.id + ":" + k, entryId: e.id, k, fen, nullFen: nf, threat: it.threat, threatSan, color: uc, prev,
        prevLabel: prev ? moveLabel(g.fens[k - 1], prev.san, prev.color) : "", played: g.moves[k].uci, playedSan: g.moves[k].san,
        label: moveLabel(fen, g.moves[k].san, uc), before: B, best: B && B.best, date: e.date, motif: it.motif,
        me: uc === "w" ? e.white : e.black, opp: uc === "w" ? e.black : e.white, meElo: uc === "w" ? e.whiteElo : e.blackElo, oppElo: uc === "w" ? e.blackElo : e.whiteElo
      });
    }
  }
  return out.sort((a, b) => (b.date || 0) - (a.date || 0) || a.k - b.k);
}
export function threatCounts() {
  const all = threatExercises();
  return { total: all.length, fresh: all.filter((x) => !isSolved(store.training[x.id])).length, due: all.filter((x) => isDue(store.training[x.id])).length, mastered: all.filter((x) => isMastered(store.training[x.id])).length };
}
function updateCount() { const c = threatCounts(); const b = $("thCount"); if (b) { const n = c.fresh + c.due; b.hidden = !n; b.textContent = n > 99 ? "99+" : String(n); } }

export function startThreatSession(opts = {}) {
  const c = threatCounts();
  T.mode = opts.mode || (c.due ? "due" : "new");
  T.goal = opts.count ? { count: opts.count, done: 0 } : null;
  segSet(document.querySelector("#view-threats .seg"), "tm", T.mode);
  rebuild();
}
export function showThreats() { if (T.ex && T.step !== "done-all") { render(true); return; } rebuild(); }

function rebuild() {
  let list = threatExercises().slice();
  if (T.mode === "new") list = list.filter((x) => !isSolved(store.training[x.id]));
  if (T.mode === "due") list = list.filter((x) => isDue(store.training[x.id]));
  if (T.goal) list = list.slice(0, T.goal.count);
  T.list = list; T.i = 0; load();
}
function load() {
  stopCheck();
  T.ex = T.list[T.i] || null; T.step = T.ex ? "find" : "empty"; T.tries = 0; T.errors = 0; T.msg = null;
  render(true);
}
function next() {
  if (T.i < T.list.length - 1) { T.i++; load(); }
  else { T.i = T.list.length; T.ex = null; T.step = "done-all"; render(true); }
}
function record(result) {
  store.training[T.ex.id] = recordResult(store.training[T.ex.id], result);
  saveTraining(); logActivity("amenazas"); if (T.goal) T.goal.done++;
  emit("training");
}

function describeThreat(ex) {
  const c = new Chess(ex.nullFen); const m = tryMove(c, ex.threat);
  if (!m) return ex.threatSan;
  if (c.isCheckmate()) return tr("darte jaque mate", "checkmate you");
  if (m.captured) return tr(`capturar ${pieceOn(m.captured, m.to)}`, `capture ${pieceOn(m.captured, m.to)}`);
  const f = isFork(c.fen(), m.to, ex.color === "w" ? "b" : "w");
  if (f) {
    const hasKing = f.some((t) => t.type === "k");
    const others = f.filter((t) => t.type !== "k");
    if (hasKing && others.length) return tr(`darte jaque y atacar ${listTargets(others)} a la vez`, `give check and attack ${listTargets(others)} at the same time`);
    return tr(`atacar ${listTargets(f)} a la vez`, `attack ${listTargets(f)} at the same time`);
  }
  if (m.san.includes("+")) return tr(`darte jaque con ${m.san}`, `give check with ${m.san}`);
  return tr(`jugar ${m.san}`, `play ${m.san}`);
}

/* ---------- interacción ---------- */
function stopCheck() { if (T.checking) { T.checking.cancel(); T.checking = null; } }
async function onMove(orig, dest) {
  const ex = T.ex; if (!ex) return;
  if (T.step === "find") {
    const c = new Chess(ex.nullFen);
    const promo = await pickPromotion(T.cg, c, orig, dest);
    if (promo === null || T.ex !== ex) { render(true); return; }
    const m = tryMove(c, { from: orig, to: dest, promotion: promo });
    if (!m) { render(true); return; }
    const tc = new Chess(ex.nullFen); const tm = tryMove(tc, ex.threat);
    const same = uciOf(m).slice(0, 4) === ex.threat.slice(0, 4) || (tm && m.to === tm.to && m.captured && m.captured === tm.captured) || c.isCheckmate();
    if (same) {
      T.step = "found";
      T.msg = { kind: "ok", text: tr(`¡Exacto! Con ${ex.prevLabel || "su jugada"} tu rival amenaza ${ex.threatSan}: quiere ${describeThreat(ex)}.`, `Exactly! With ${ex.prevLabel || "their move"} your opponent threatens ${ex.threatSan}: they want to ${describeThreat(ex)}.`) };
    } else {
      T.tries++; T.errors++;
      if (T.tries >= 2) { revealThreat(tr(`${m.san} no es la amenaza.`, `${m.san} isn't the threat.`)); return; }
      T.msg = { kind: "bad", text: tr(`${m.san} no es lo que amenaza. Mirá qué cambió con ${ex.prevLabel || "la última jugada"}: ¿qué ataca ahora esa pieza?`, `${m.san} isn't what they threaten. Look at what changed with ${ex.prevLabel || "the last move"}: what does that piece attack now?`) };
    }
    render(true); return;
  }
  if (T.step === "defend") {
    const c = new Chess(ex.fen);
    const promo = await pickPromotion(T.cg, c, orig, dest);
    if (promo === null || T.ex !== ex) { render(true); return; }
    const m = tryMove(c, { from: orig, to: dest, promotion: promo });
    if (!m) { render(true); return; }
    syncBoard(T.cg, c, { orientation: ex.color === "w" ? "white" : "black", lastMove: [m.from, m.to], movable: false, sound: { captured: !!m.captured, check: m.san.includes("+") } });
    if (uciOf(m).slice(0, 4) === ex.played.slice(0, 4)) { defendWrong(m.san, tr(`Eso jugaste en la partida, y tu rival respondió ${ex.threatSan}.`, `That's what you played in the game, and your opponent replied ${ex.threatSan}.`), ex.threat); return; }
    if (ex.best && uciOf(m).slice(0, 4) === ex.best.slice(0, 4)) { defendOk(m.san, true); return; }
    if (c.isCheckmate()) { defendOk(m.san, false); return; }
    T.step = "checking"; T.msg = { kind: "info", text: tr(`Comprobando ${m.san}…`, `Checking ${m.san}…`) }; renderCard();
    if (!engines.live.ready) await ensureEngines();
    if (!engines.live.ready) { T.step = "defend"; T.msg = { kind: "info", text: tr("No pude comprobar la jugada porque el motor no responde. Probá de nuevo.", "I couldn't check the move because the engine isn't responding. Try again.") }; render(true); return; }
    engines.live.stopAll();
    engines.live.configure({ MultiPV: 1 });
    const job = engines.live.search(c.fen(), "depth 16 movetime 900");
    T.checking = job;
    const r = await job.promise;
    if (T.checking !== job || !r) return;
    T.checking = null;
    const sc = scoreFromInfo(r.info, c.fen()); const sign = ex.color === "w" ? 1 : -1;
    const loss = wp(toCp(ex.before) * sign) - wp(toCp(sc) * sign);
    if (loss < 8) defendOk(m.san, false);
    else { const reply = r.best ? pvToSan(c.fen(), [r.best], 1)[0] : null; defendWrong(m.san, reply ? tr(`Tu rival respondería ${reply}.`, `Your opponent would reply ${reply}.`) : "", r.best); }
  }
}
function startDefend() { T.step = "defend"; T.msg = null; render(true); }
function revealThreat(prefix = "") {
  const ex = T.ex; T.errors++;
  T.step = "found";
  T.msg = { kind: "info", text: `${prefix ? prefix + " " : ""}` + tr(`La amenaza era ${ex.threatSan}: tu rival quería ${describeThreat(ex)}.`, `The threat was ${ex.threatSan}: your opponent wanted to ${describeThreat(ex)}.`) };
  render(true);
}
function defendOk(san, exact) {
  const ex = T.ex;
  record(T.errors === 0 ? "first" : "later");
  T.step = "done";
  const bestSan = ex.best ? pvToSan(ex.fen, [ex.best], 1)[0] : null;
  T.msg = { kind: "ok", text: exact || !bestSan ? tr(`¡Bien defendido! ${san} neutraliza la amenaza.`, `Well defended! ${san} neutralizes the threat.`) : tr(`¡Bien defendido! ${san} también sirve. El motor prefería ${bestSan}.`, `Well defended! ${san} works too. The engine preferred ${bestSan}.`) };
  render(false);
}
function defendWrong(san, extra, replyUci) {
  T.errors++; T.step = "defend-wrong";
  T.msg = { kind: "bad", text: tr(`${san} no alcanza. ${extra}`, `${san} isn't enough. ${extra}`).trim() };
  render(false);
  if (replyUci) { try { T.cg.setAutoShapes([arrow(replyUci, "red")]); } catch (e) {} }
}
function revealDefense() {
  const ex = T.ex; stopCheck();
  record("revealed");
  T.step = "done";
  const bestSan = ex.best ? pvToSan(ex.fen, [ex.best], 1)[0] : "—";
  T.msg = { kind: "info", text: tr(`Una buena defensa era ${bestSan}.`, `A good defense was ${bestSan}.`) };
  render(false);
  if (ex.best) { const c = new Chess(ex.fen); const m = tryMove(c, ex.best); if (m) syncBoard(T.cg, c, { orientation: ex.color === "w" ? "white" : "black", lastMove: [m.from, m.to], movable: false, shapes: [arrow(ex.best, "green")] }); }
}

/* ---------- render ---------- */
function render(resetBoard) {
  const ex = T.ex;
  renderStats();
  if (ex) {
    const orient = ex.color === "w" ? "white" : "black";
    const opp = ex.color === "w" ? "b" : "w";
    if (resetBoard) {
      if (T.step === "find") syncBoard(T.cg, new Chess(ex.nullFen), { orientation: orient, lastMove: ex.prev ? [ex.prev.from, ex.prev.to] : undefined, movable: opp, shapes: [] });
      else if (T.step === "found") syncBoard(T.cg, new Chess(ex.nullFen), { orientation: orient, lastMove: ex.prev ? [ex.prev.from, ex.prev.to] : undefined, movable: false, shapes: [arrow(ex.threat, "red")] });
      else if (T.step === "defend") syncBoard(T.cg, new Chess(ex.fen), { orientation: orient, lastMove: ex.prev ? [ex.prev.from, ex.prev.to] : undefined, movable: ex.color, shapes: [arrow(ex.threat, "red")] });
    }
    $("thTop").innerHTML = playerStrip(ex.opp, ex.oppElo, opp, false);
    $("thBot").innerHTML = playerStrip(ex.me, ex.meElo, ex.color, true);
  } else {
    syncBoard(T.cg, new Chess(), { orientation: "white", movable: false });
    $("thTop").innerHTML = ""; $("thBot").innerHTML = "";
  }
  renderCard();
}
function renderStats() {
  const c = threatCounts();
  $("thCounter").textContent = T.list.length && T.i < T.list.length ? tr(`${T.i + 1} de ${T.list.length}`, `${T.i + 1} of ${T.list.length}`) : "";
  $("thStats").innerHTML = `<div class="ln-stat"><b>${c.fresh}</b><span>${tr("nuevos", "new")}</span></div><div class="ln-stat"><b>${c.due}</b><span>${tr("para repasar hoy", "due today")}</span></div><div class="ln-stat"><b>${c.mastered}</b><span>${tr("dominados", "mastered")}</span></div>`
    + (T.goal ? `<div class="goal-bar"><span>${tr("Tanda de hoy", "Today's set")}</span><i><b style="width:${Math.min(100, (T.goal.done / T.goal.count) * 100)}%"></b></i><span>${Math.min(T.goal.done, T.goal.count)}/${T.goal.count}</span></div>` : "");
}
function renderCard() {
  const el = $("thCard"); const ex = T.ex;
  if (!ex) {
    const c = threatCounts();
    const pend = store.library.filter((g) => !g.analysis && detectUserColor(g)).length;
    const n = T.goal ? T.goal.done : 0;
    if (T.step === "done-all" && T.goal) el.innerHTML = `<div class="prompt">${tr("¡Bloque terminado!", "Block complete!")}</div><p>${tr(`Practicaste ${n} ${n === 1 ? "amenaza" : "amenazas"}.`, `You practiced ${n} ${n === 1 ? "threat" : "threats"}.`)}</p><div class="btn-row"><button class="btn primary" type="button" data-act="today">${tr("Volver a Hoy", "Back to Today")}</button></div>`;
    else if (T.step === "done-all") el.innerHTML = `<div class="prompt">${tr("¡Listo por ahora!", "Done for now!")}</div><p>${c.due ? tr(`Te quedan ${c.due} para repasar hoy.`, `${c.due} left to review today.`) : tr("No te queda nada pendiente en esta lista.", "Nothing left in this list.")}</p>`;
    else if (T.mode === "due") el.innerHTML = `<div class="prompt">${tr("Nada para repasar hoy.", "Nothing to review today.")}</div><p class="muted">${tr("Las amenazas que resolviste vuelven solas al día siguiente, a los 3 días, a la semana y así.", "Threats you solved come back on their own the next day, after 3 days, after a week and so on.")}</p>`;
    else if (!c.total && pend) el.innerHTML = `<div class="prompt">${tr("Faltan partidas analizadas.", "You need analyzed games.")}</div><p>${tr(`Los ejercicios salen de las veces en que tu rival te amenazaba algo y no lo viste. Tenés ${pend} ${pend === 1 ? "partida" : "partidas"} sin analizar.`, `Exercises come from moments when your opponent threatened something and you missed it. You have ${pend} ${pend === 1 ? "game" : "games"} not analyzed yet.`)}</p><div class="btn-row"><button class="btn primary" type="button" data-act="analyse">${tr("Analizarlas ahora", "Analyze them now")}</button></div>`;
    else if (!c.total) el.innerHTML = `<div class="prompt">${tr("Todavía no hay amenazas para practicar.", "No threats to practice yet.")}</div><p class="muted">${tr("Aparecen cuando en tus partidas analizadas el rival te amenazaba algo y no lo viste. ¡Puede que no te haya pasado todavía!", "They appear when, in your analyzed games, your opponent threatened something and you missed it. Maybe it hasn't happened yet!")}</p>`;
    else el.innerHTML = `<div class="prompt">${tr("No hay amenazas nuevas.", "No new threats.")}</div><p class="muted">${tr("Pasá a \"Todas\" para repetir las que ya resolviste.", "Switch to \"All\" to repeat the ones you already solved.")}</p>`;
    return;
  }
  let h = `<div class="ctx">vs ${esc(ex.opp)} · ${fmtDate(ex.date)} · ${tr(`en la partida jugaste ${esc(ex.label)}`, `in the game you played ${esc(ex.label)}`)}${isSolved(store.training[ex.id]) && T.step === "find" ? ` · <span class="c-best">${tr("repaso", "review")}</span>` : ""}</div>`;
  const step1 = `<div class="step-pill">${tr("Paso 1 de 2", "Step 1 of 2")}</div>`;
  if (T.step === "find") {
    h += step1 + `<div class="prompt">${tr(`Tu rival jugó ${esc(ex.prevLabel || "")}. ¿Qué amenaza?`, `Your opponent played ${esc(ex.prevLabel || "")}. What's the threat?`)}</div><p class="small muted">${tr("Mové en el tablero la pieza de tu rival como si le tocara otra vez: mostrá qué quiere hacer.", "Move your opponent's piece on the board as if it were their turn again: show what they want to do.")}</p>`;
  } else if (T.step === "found") {
    h += step1;
  } else if (T.step === "defend" || T.step === "checking" || T.step === "defend-wrong") {
    h += `<div class="step-pill">${tr("Paso 2 de 2", "Step 2 of 2")}</div><div class="prompt">${tr(`Ahora te toca: defendete de ${esc(ex.threatSan)}.`, `Your turn: defend against ${esc(ex.threatSan)}.`)}</div>`;
  }
  if (T.msg) h += `<div class="feedback ${T.msg.kind}">${esc(T.msg.text)}</div>`;
  const showDef = `<button class="btn small" type="button" data-act="reveal-defense">${tr("Ver una defensa", "Show a defense")}</button>`;
  if (T.step === "find") h += `<div class="btn-row"><button class="btn small" type="button" data-act="reveal-threat">${tr("Mostrar la amenaza", "Show the threat")}</button><button class="btn small" type="button" data-act="next">${tr("Saltear", "Skip")}</button></div>`;
  else if (T.step === "found") h += `<div class="btn-row"><button class="btn primary" type="button" data-act="defend">${tr("Ahora defendete", "Now defend")}</button></div>`;
  else if (T.step === "defend-wrong") h += `<div class="btn-row"><button class="btn primary small" type="button" data-act="retry">${tr("Probar de nuevo", "Try again")}</button>${showDef}</div>`;
  else if (T.step === "defend" || T.step === "checking") h += `<div class="btn-row">${showDef}</div>`;
  else if (T.step === "done") {
    h += `<p>${tr(`En la partida jugaste <b>${esc(ex.playedSan)}</b> y tu rival respondió <b>${esc(ex.threatSan)}</b>.`, `In the game you played <b>${esc(ex.playedSan)}</b> and your opponent replied <b>${esc(ex.threatSan)}</b>.`)}</p>`;
    h += `<div class="feedback info">${tr("<b>El hábito:</b> después de cada jugada de tu rival, preguntate qué quiere hacer antes de pensar en tu plan.", "<b>The habit:</b> after every move your opponent makes, ask what they want before thinking about your own plan.")}</div>`;
    const tt = store.training[ex.id];
    if (tt && tt.due && isSolved(tt)) h += `<p class="small muted">${tr(`Vuelve a aparecer ${nextReviewText(tt)}.`, `Comes back ${nextReviewText(tt)}.`)}</p>`;
    h += `<div class="btn-row"><button class="btn primary" type="button" data-act="next">${T.i < T.list.length - 1 ? tr("Siguiente", "Next") : tr("Terminar", "Finish")}</button><button class="btn small" type="button" data-act="open">${tr("Ver en la partida", "See in the game")}</button></div>`;
  }
  el.innerHTML = h;
}
