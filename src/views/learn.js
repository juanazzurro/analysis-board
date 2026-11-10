import { store, on, emit, gameOf, detectUserColor, saveTraining, engines, ensureEngines, findEntry, enqueueAnalysis, logActivity, libSignature } from "../state.js";
import { isSolved as srsSolved, isDue, isMastered, recordResult, nextReviewText } from "../srs.js";
import { diagnoseEntry, MOTIFS } from "../motifs.js";
import { Chess, tryMove, uciOf, pvToSan, numberedLine, moveLabel, wp, toCp, scoreFromInfo, evalText } from "../chess-util.js";
import { CLS } from "../analysis.js";
import { explainMove } from "../explain.js";
import { makeBoard, syncBoard, arrow, pickPromotion } from "../board.js";
import { $, esc, segBind, segSet, playerStrip, fmtDate } from "../ui.js";
import { tr } from "../i18n.js";

const L = { mode: "pending", gameId: null, motif: null, goal: null, list: [], i: 0, ex: null, state: "idle", tries: 0, hint: false, msg: null, checking: null, cg: null, solvedNow: 0 };
let hooks = {};

export function initLearn(h) {
  hooks = h;
  L.cg = makeBoard($("lnBoard"), { events: { move: onMove } });
  segBind(document.querySelector("#view-learn .seg"), (d) => { L.mode = d.ln; L.goal = null; rebuild(); });
  $("lnCard").addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    const a = t.dataset.act;
    if (a === "hint") { L.hint = true; render(); }
    else if (a === "solve") reveal();
    else if (a === "next") next();
    else if (a === "retry") { L.state = "solving"; L.msg = null; render(); }
    else if (a === "analyse") { pendingGames().forEach((g) => enqueueAnalysis(g.id)); hooks.toast(tr("Partidas en cola para analizar.", "Games queued for analysis.")); render(); }
    else if (a === "open") hooks.openGame(L.ex.entryId, L.ex.k + 1);
    else if (a === "play") hooks.onPlayFrom(L.ex.fen, L.ex.color);
    else if (a === "goto") hooks.goView(t.dataset.view);
    else if (a === "again") { L.mode = "pending"; L.motif = null; segSet(document.querySelector("#view-learn .seg"), "ln", "pending"); rebuild(); }
    else if (a === "clearmotif") { L.motif = null; rebuild(); }
    else if (a === "today") { L.goal = null; hooks.goView("today"); }
  });
  // Gancho de diagnóstico (solo lectura de estado y simular una jugada en el tablero).
  window.__mesaLearn = { move: (o, d) => onMove(o, d), state: () => ({ mode: L.mode, i: L.i, n: L.list.length, state: L.state, ex: L.ex && { id: L.ex.id, best: L.ex.best, played: L.ex.played, label: L.ex.label }, msg: L.msg && L.msg.text }) };
  on("analysed", () => { updateBadge(); });
  on("library", updateBadge);
  updateBadge();
}

/** Arranca una tanda desde "Hoy" o desde el diagnóstico. opts: { mode, count, motif } */
export function startLearnSession(opts = {}) {
  L.mode = opts.mode || (dueCount() ? "due" : "pending");
  L.motif = opts.motif || null;
  L.goal = opts.count ? { count: opts.count, done: 0 } : null;
  segSet(document.querySelector("#view-learn .seg"), "ln", L.mode);
  rebuild();
}
export function dueCount() { return allExercises().filter((ex) => isDue(store.training[ex.id])).length; }
export function pendingCount() { return allExercises().filter(isPending).length; }
export function showLearn(gameId) {
  if (gameId) { L.gameId = gameId; L.mode = "game"; segSet(document.querySelector("#view-learn .seg"), "ln", "game"); rebuild(); return; }
  // Al volver a la sección (por ejemplo, después de "Ver en la partida") seguís en el mismo ejercicio.
  if (L.ex && L.state !== "done") { if (L.state === "solving") render(true); else { renderStats(); renderCard(); } return; }
  rebuild();
}

/* ---------- ejercicios ---------- */
const exId = (entryId, k) => entryId + ":" + k;
function buildFor(entry, colorOverride, libraryWide = false) {
  const out = [];
  if (libraryWide && !colorOverride && !detectUserColor(entry)) return out;
  if (!entry || !entry.analysis) return out;
  const uc = colorOverride || detectUserColor(entry);
  // En las listas generales solo entran partidas donde sabemos con qué color jugaste, para no entrenar los errores del rival.
  if (!uc && !colorOverride && L.mode !== "game") return out;
  let g; try { g = gameOf(entry); } catch (e) { return out; }
  const a = entry.analysis;
  const want = store.settings.learnInacc ? ["inacc", "mistake", "blunder"] : ["mistake", "blunder"];
  a.info.forEach((x, k) => {
    if (!x || !want.includes(x.c)) return;
    const m = g.moves[k];
    if (uc && m.color !== uc) return;
    const B = a.evals[k]; if (!B || !B.best) return;
    if (B.mate != null && (m.color === "w" ? B.mate < 0 : B.mate > 0)) return; // ya perdido: nada que encontrar
    out.push({ id: exId(entry.id, k), entryId: entry.id, k, fen: g.fens[k], best: B.best, played: m.uci, playedSan: m.san, color: m.color, c: x.c, before: B, date: entry.date,
      label: moveLabel(g.fens[k], m.san, m.color), opp: m.color === "w" ? entry.black : entry.white, me: m.color === "w" ? entry.white : entry.black,
      meElo: m.color === "w" ? entry.whiteElo : entry.blackElo, oppElo: m.color === "w" ? entry.blackElo : entry.whiteElo });
  });
  return out;
}
function pendingGames() { return store.library.filter((g) => !g.analysis && detectUserColor(g)); }
/** Un error queda resuelto cuando encontraste la jugada, aunque haya sido después de equivocarte o con pista. */
function isSolved(id) { return srsSolved(store.training[id]); }
function motifOf(ex) {
  const e = findEntry(ex.entryId); if (!e) return null;
  const uc = detectUserColor(e); if (!uc) return null;
  let d = null; try { d = diagnoseEntry(e, gameOf(e), uc); } catch (err) { return null; }
  const it = d && d.items.find((x) => x.k === ex.k);
  return it ? it.motif : null;
}
function isPending(ex) { return !isSolved(ex.id); }
let exCache = null, exKey = "";
/** Todos tus errores entrenables (cacheado: solo cambia cuando cambia la biblioteca). */
function allExercises() {
  const k = libSignature();
  if (exCache && exKey === k) return exCache;
  const out = []; for (const e of store.library) out.push(...buildFor(e, null, true));
  exCache = out; exKey = k;
  return out;
}

function rebuild() {
  let list = [];
  if (L.mode === "game") {
    const e = L.gameId ? findEntry(L.gameId) : null;
    if (e) list = buildFor(e, detectUserColor(e) || null);
  } else {
    list = allExercises().slice();
    if (L.mode === "pending") list = list.filter(isPending);
    if (L.mode === "due") list = list.filter((ex) => isDue(store.training[ex.id]));
    if (L.motif) list = list.filter((ex) => motifOf(ex) === L.motif);
    if (L.mode === "due") list.sort((a, b) => (store.training[a.id].due || 0) - (store.training[b.id].due || 0));
    else list.sort((a, b) => (b.date || 0) - (a.date || 0) || a.k - b.k);
    if (L.goal) list = list.slice(0, L.goal.count);
  }
  L.list = list; L.i = 0; L.solvedNow = 0;
  load();
}
function load() {
  stopCheck();
  L.ex = L.list[L.i] || null; L.state = L.ex ? "solving" : "idle"; L.tries = 0; L.hint = false; L.msg = null;
  render(true);
}
function next() { if (L.i < L.list.length - 1) { L.i++; load(); } else { L.i = L.list.length; L.ex = null; L.state = "done"; render(); } }

function record(result) {
  store.training[L.ex.id] = recordResult(store.training[L.ex.id], result);
  saveTraining(); updateBadge();
  logActivity(L.mode === "due" ? "repaso" : "errores");
  if (L.goal) L.goal.done++;
  emit("training");
}

/* ---------- interacción ---------- */
function stopCheck() { if (L.checking) { L.checking.cancel(); L.checking = null; } }
async function onMove(orig, dest, promo) {
  if (!L.ex || L.state !== "solving") { render(); return; }
  engines.live.stopAll();
  const c = new Chess(L.ex.fen);
  if (promo === undefined) promo = await pickPromotion(L.cg, c, orig, dest);
  if (promo === null || !L.ex || L.state !== "solving") { render(); return; }
  const m = tryMove(c, { from: orig, to: dest, promotion: promo });
  if (!m) { render(); return; }
  const uci = uciOf(m);
  syncBoard(L.cg, c, { orientation: L.ex.color === "w" ? "white" : "black", lastMove: [m.from, m.to], movable: false, sound: { captured: !!m.captured, check: m.san.includes("+") } });
  if (uci.slice(0, 4) === L.ex.best.slice(0, 4)) { solved(m.san, true); return; }
  if (uci.slice(0, 4) === L.ex.played.slice(0, 4)) { wrong(m.san, tr("Esa es la jugada que hiciste en la partida.", "That's the move you played in the game.")); return; }
  if (c.isCheckmate()) { solved(m.san, false); return; }
  L.state = "checking"; L.msg = { kind: "info", text: tr(`Comprobando ${m.san}…`, `Checking ${m.san}…`) }; renderCard();
  if (!engines.live.ready) {
    L.msg = { kind: "info", text: tr(`Esperando al motor para comprobar ${m.san}…`, `Waiting for the engine to check ${m.san}…`) }; renderCard();
    await ensureEngines();
  }
  if (!engines.live.ready) {
    L.state = "solving"; L.msg = { kind: "info", text: tr(`No pude comprobar ${m.san} porque el motor no responde. Probá de nuevo en un momento.`, `I couldn't check ${m.san} because the engine isn't responding. Try again in a moment.`) };
    render(true); return;
  }
  engines.live.configure({ MultiPV: 1 });
  const job = engines.live.search(c.fen(), "depth 18 movetime 900");
  L.checking = job;
  const r = await job.promise;
  if (L.checking !== job || !r) return;
  L.checking = null;
  const sc = scoreFromInfo(r.info, c.fen());
  const sign = L.ex.color === "w" ? 1 : -1;
  const loss = (wp(toCp(L.ex.before) * sign) - wp(toCp(sc) * sign));
  if (loss < 4) solved(m.san, false);
  else {
    const reply = r.best ? pvToSan(c.fen(), [r.best], 1)[0] : null;
    wrong(m.san, reply ? tr(`Tu rival respondería ${reply}.`, `Your opponent would reply ${reply}.`) : "", r.best);
  }
}
function solved(san, exact) {
  const first = L.tries === 0 && !L.hint;
  L.state = "solved"; L.solvedNow++;
  const bestSan = pvToSan(L.ex.fen, [L.ex.best], 1)[0];
  L.msg = { kind: "ok", text: exact ? tr(`¡Bien! ${san} es la mejor jugada.`, `Well done! ${san} is the best move.`) : tr(`¡Bien! ${san} también funciona. La primera opción del motor era ${bestSan}.`, `Well done! ${san} works too. The engine's first choice was ${bestSan}.`) };
  record(first ? "first" : "later");
  render();
}
function wrong(san, extra, replyUci) {
  L.tries++; L.state = "wrong";
  L.msg = { kind: "bad", text: tr(`${san} no es suficiente. ${extra}`, `${san} isn't good enough. ${extra}`).trim(), reply: replyUci };
  render();
  if (replyUci) { try { L.cg.setAutoShapes([arrow(replyUci, "red")]); } catch (e) {} }
}
function reveal() {
  if (!L.ex) return;
  stopCheck();
  const c = new Chess(L.ex.fen); const m = tryMove(c, L.ex.best);
  L.state = "revealed";
  L.msg = { kind: "info", text: tr(`La jugada era ${m ? m.san : L.ex.best}.`, `The move was ${m ? m.san : L.ex.best}.`) };
  record("revealed");
  render();
  if (m) syncBoard(L.cg, c, { orientation: L.ex.color === "w" ? "white" : "black", lastMove: [m.from, m.to], movable: false, shapes: [arrow(L.ex.best, "green")], sound: { captured: !!m.captured } });
}

/* ---------- render ---------- */
function updateBadge() {
  const all = allExercises();
  const n = all.filter(isPending).length + all.filter((ex) => isDue(store.training[ex.id])).length;
  const b = $("learnCount"); b.hidden = !n; b.textContent = n > 99 ? "99+" : String(n);
}

function render(fresh = false) {
  renderStats();
  const ex = L.ex;
  if (ex) {
    const orient = ex.color === "w" ? "white" : "black";
    if (L.state === "solving" || fresh) {
      const c = new Chess(ex.fen);
      const shapes = L.hint ? [{ orig: ex.best.slice(0, 2), brush: "yellow" }] : [];
      const prev = gameOf(findEntry(ex.entryId)).moves[ex.k - 1];
      syncBoard(L.cg, c, { orientation: orient, lastMove: prev ? [prev.from, prev.to] : undefined, movable: ex.color, shapes });
    }
    const you = playerStrip(ex.me, ex.meElo, ex.color, true), them = playerStrip(ex.opp, ex.oppElo, ex.color === "w" ? "b" : "w", false);
    $("lnTop").innerHTML = them; $("lnBot").innerHTML = you;
  } else {
    syncBoard(L.cg, new Chess(), { orientation: "white", movable: false });
    $("lnTop").innerHTML = ""; $("lnBot").innerHTML = "";
  }
  renderCard();
}
function renderStats() {
  // Siempre calculado en vivo: baja apenas resolvés un ejercicio.
  const pool = L.mode === "game" ? L.list : allExercises();
  const pending = pool.filter(isPending).length;
  const due = pool.filter((ex) => isDue(store.training[ex.id])).length;
  const mastered = pool.filter((ex) => isMastered(store.training[ex.id])).length;
  $("lnCounter").textContent = L.list.length && L.i < L.list.length ? tr(`${L.i + 1} de ${L.list.length}`, `${L.i + 1} of ${L.list.length}`) : "";
  $("lnStats").innerHTML = `<div class="ln-stat"><b>${pending}</b><span>${tr("sin resolver", "unsolved")}</span></div>
    <div class="ln-stat"><b>${due}</b><span>${tr("para repasar hoy", "due today")}</span></div>
    <div class="ln-stat"><b>${mastered}</b><span>${tr("dominados", "mastered")}</span></div>`
    + (L.motif ? `<div class="filter-chip">${tr("Solo:", "Only:")} ${esc(MOTIFS[L.motif].short)} <button class="linkbtn" type="button" data-act="clearmotif">${tr("Quitar filtro", "Clear filter")}</button></div>` : "")
    + (L.goal ? `<div class="goal-bar"><span>${tr("Tanda de hoy", "Today's set")}</span><i><b style="width:${Math.min(100, (L.goal.done / L.goal.count) * 100)}%"></b></i><span>${Math.min(L.goal.done, L.goal.count)}/${L.goal.count}</span></div>` : "");
}
function renderCard() {
  const el = $("lnCard"); const ex = L.ex;
  if (!ex) {
    const pg = pendingGames();
    const noUser = !store.settings.lichessUser && !store.settings.chesscomUser;
    if (L.state === "done" && L.goal) {
      const n = L.goal.done;
      el.innerHTML = `<div class="prompt">${tr("¡Bloque terminado!", "Block complete!")}</div><p>${tr(`Hiciste ${n} ${n === 1 ? "ejercicio" : "ejercicios"} de tus errores.`, `You did ${n} ${n === 1 ? "exercise" : "exercises"} from your mistakes.`)}</p><div class="btn-row"><button class="btn primary" type="button" data-act="today">${tr("Volver a Hoy", "Back to Today")}</button></div>`;
      return;
    }
    if (L.state === "done" && L.mode === "due") {
      el.innerHTML = `<div class="prompt">${tr("Repaso al día.", "All caught up.")}</div><p>${tr("No te queda nada para repasar hoy. Los ejercicios vuelven solos cuando les toca.", "Nothing left to review today. Exercises come back on their own when they're due.")}</p><div class="btn-row"><button class="btn primary" type="button" data-act="again">${tr("Ver los que no resolviste", "See the unsolved ones")}</button></div>`;
      return;
    }
    if (L.state === "done") {
      const left = allExercises().filter(isPending).length, n = L.solvedNow;
      el.innerHTML = `<div class="prompt">${tr("¡Terminaste la tanda!", "Set finished!")}</div><p>${tr(
        `Resolviste ${n} ${n === 1 ? "ejercicio" : "ejercicios"}.${left ? ` Te ${left === 1 ? "queda 1 pendiente" : `quedan ${left} pendientes`}: los que salteaste o en los que viste la solución.` : " No te queda ninguno pendiente."}`,
        `You solved ${n} ${n === 1 ? "exercise" : "exercises"}.${left ? ` ${left} still unsolved: the ones you skipped or where you looked at the solution.` : " Nothing left unsolved."}`)}</p><div class="btn-row">${left ? `<button class="btn primary" type="button" data-act="again">${tr("Seguir con los pendientes", "Continue with unsolved")}</button>` : ""}<button class="btn${left ? "" : " primary"}" type="button" data-act="goto" data-view="library">${tr("Ir a Partidas", "Go to Games")}</button></div>`;
    }
    else if (L.mode === "game" && !L.gameId) el.innerHTML = `<div class="prompt">${tr("No hay una partida abierta.", "No game is open.")}</div><p>${tr("Abrí una partida en Análisis y tocá “Entrenar esta partida”.", "Open a game in Analysis and click “Train this game”.")}</p>`;
    else if (L.mode === "game") el.innerHTML = `<div class="prompt">${tr("No hay errores para entrenar en esta partida.", "No mistakes to train in this game.")}</div><p class="muted">${tr("Si la partida todavía se está analizando, volvé en un momento. Si no sabe con qué color jugaste, cargá tu usuario en Ajustes.", "If the game is still being analyzed, come back in a moment. If the app doesn't know which color you played, add your username in Settings.")}</p>`;
    else if (noUser) el.innerHTML = `<div class="prompt">${tr("Contale a la app quién sos.", "Tell the app who you are.")}</div><p>${tr("Cargá tu usuario de Lichess o Chess.com en Ajustes para que sepa cuáles son tus jugadas.", "Add your Lichess or Chess.com username in Settings so it knows which moves are yours.")}</p><div class="btn-row"><button class="btn primary" type="button" data-act="goto" data-view="settings">${tr("Ir a Ajustes", "Go to Settings")}</button></div>`;
    else if (pg.length) el.innerHTML = `<div class="prompt">${tr(`Tenés ${pg.length} ${pg.length === 1 ? "partida" : "partidas"} sin analizar.`, `You have ${pg.length} ${pg.length === 1 ? "game" : "games"} not analyzed yet.`)}</div><p>${tr("Los ejercicios salen de tus errores en partidas analizadas.", "Exercises come from your mistakes in analyzed games.")}</p><div class="btn-row"><button class="btn primary" type="button" data-act="analyse">${tr("Analizarlas ahora", "Analyze them now")}</button></div>`;
    else if (L.mode === "due") el.innerHTML = `<div class="prompt">${tr("Nada para repasar hoy.", "Nothing to review today.")}</div><p class="muted">${tr("Cuando resolvés un ejercicio, vuelve al día siguiente, a los 3 días, a la semana, a las 3 semanas y a los 2 meses. Si lo resolvés a la primera en cada repaso, queda dominado.", "When you solve an exercise, it comes back the next day, after 3 days, a week, 3 weeks and 2 months. Solve it on the first try at each review and it's mastered.")}</p>`;
    else if (L.motif) el.innerHTML = `<div class="prompt">${tr("No hay errores de este tipo para entrenar.", "No mistakes of this type to train.")}</div><div class="btn-row"><button class="btn" type="button" data-act="clearmotif">${tr("Ver todos", "See all")}</button></div>`;
    else el.innerHTML = `<div class="prompt">${L.mode === "pending" ? tr("No hay errores pendientes.", "No unsolved mistakes.") : tr("Todavía no hay ejercicios.", "No exercises yet.")}</div><p class="muted">${tr("Importá más partidas desde “Partidas” para generar ejercicios nuevos.", "Import more games from “Games” to create new exercises.")}</p>`;
    return;
  }
  const clsInfo = CLS[ex.c];
  const mot = motifOf(ex);
  const kind = clsInfo.label.toLowerCase();
  let h = `<div class="ctx">vs ${esc(ex.opp)} · ${fmtDate(ex.date)} · <span class="c-${ex.c}">${tr(`${kind} en ${esc(ex.label)}`, `${kind} on ${esc(ex.label)}`)}</span>${isSolved(ex.id) && L.state === "solving" ? ` · <span class="c-best">${tr("repaso", "review")}</span>` : ""}</div>`;
  if (mot && L.state !== "solving") h += `<div class="motif-tag">${esc(MOTIFS[mot].short)}</div>`;
  h += `<div class="prompt">${tr(`Juegan ${ex.color === "w" ? "Blancas" : "Negras"}. Encontrá una jugada mejor que ${esc(ex.playedSan)}.`, `${ex.color === "w" ? "White" : "Black"} to move. Find a better move than ${esc(ex.playedSan)}.`)}</div>`;
  if (L.hint && L.state === "solving") h += `<div class="feedback info">${tr("Pista: la pieza marcada es la que hay que mover.", "Hint: move the highlighted piece.")}</div>`;
  if (L.msg) h += `<div class="feedback ${L.msg.kind}">${esc(L.msg.text)}</div>`;
  if (L.state === "solving" || L.state === "checking") {
    h += `<div class="btn-row"><button class="btn small" type="button" data-act="hint" ${L.hint ? "disabled" : ""}>${tr("Pista", "Hint")}</button><button class="btn small" type="button" data-act="solve">${tr("Ver solución", "Show solution")}</button><button class="btn small" type="button" data-act="next">${tr("Saltear", "Skip")}</button></div>`;
  } else if (L.state === "wrong") {
    h += `<div class="btn-row"><button class="btn primary small" type="button" data-act="retry">${tr("Probar de nuevo", "Try again")}</button><button class="btn small" type="button" data-act="solve">${tr("Ver solución", "Show solution")}</button></div>`;
  } else {
    const e = findEntry(ex.entryId);
    const ex2 = e && e.analysis ? explainMove(gameOf(e), e.analysis, ex.k) : null;
    if (ex2) {
      h += `<div><div class="eyebrow">${tr(`Por qué ${esc(ex.playedSan)} era ${kind}`, `Why ${esc(ex.playedSan)} was a ${kind}`)}</div>${ex2.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}</div>`;
      const line = numberedLine(ex.fen, pvToSan(ex.fen, ex.before.pv, 7));
      if (line) h += `<div><div class="line-lbl"><span>${tr("Línea del motor", "Engine line")}</span></div><div class="line">${esc(line)}</div></div>`;
      if (ex2.tip) h += `<div class="feedback info"><b>${tr("Consejo:", "Tip:")}</b> ${esc(ex2.tip)}</div>`;
    }
    const tt = store.training[ex.id];
    if (tt && tt.due && isSolved(ex.id)) h += `<p class="small muted">${tr(`Vuelve a aparecer ${nextReviewText(tt)}.`, `Comes back ${nextReviewText(tt)}.`)}${isMastered(tt) ? tr(" Ya lo tenés dominado.", " You've mastered it.") : ""}</p>`;
    h += `<div class="btn-row"><button class="btn primary" type="button" data-act="next">${L.i < L.list.length - 1 ? tr("Siguiente", "Next") : tr("Terminar", "Finish")}</button><button class="btn small" type="button" data-act="open">${tr("Ver en la partida", "See in the game")}</button><button class="btn small" type="button" data-act="play">${tr("Practicar contra Stockfish", "Practice vs Stockfish")}</button></div>`;
  }
  el.innerHTML = h;
}
