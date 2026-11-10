import { tr, EN } from "../i18n.js";
import { store, on, emit, findEntry, gameOf, progress, enqueueAnalysis, detectUserColor, saveLibrary, engines, ensureEngines, reanalyse, logActivity, entryFromPgn, addGames } from "../state.js";
import { removeGame } from "../data.js";
import { bookOf } from "../eco.js";
import { Chess, tryMove, uciOf, pvToSan, moveLabel, wp, toCp, evalText, scoreFromInfo, START_FEN, openingName, VALUES } from "../chess-util.js";
import { CLS, stats as calcStats } from "../analysis.js";
import { explainMove, aiContext } from "../explain.js";
import { makeBoard, syncBoard, arrow, pickPromotion } from "../board.js";
import { buildTree, addMove, baseOf, branchRoot, lineEnd, pathTo, removeBranch, clearVariations, hasVariations, serializeVars, toPgn, movetext , serializeNotes, analysisAnnotations } from "../tree.js";
import { gameReport, reportText, fmtClock } from "../report.js";
import { familyLabel } from "../openings.js";
import { MOTIFS } from "../motifs.js";
import { $, esc, md, toast, fmtDate, playerStrip, popMenu } from "../ui.js";

const A = { entry: null, game: null, tree: null, node: null, orient: "white", showArrow: true, liveJob: null, live: null, aiMove: {}, aiSum: {}, cg: null, review: false, compare: false, tab: "moves", report: null, reportKey: "", autoReply: false, pendingReply: null };
let hooks = {};
const visible = () => !$("view-analysis").hidden;
const inVar = () => !!A.node && A.node.main == null;
/** Jugada de la línea principal de la que cuelga la posición actual (las evaluaciones guardadas son de esa línea). */
const basePly = () => (A.node ? baseOf(A.node).main : 0);
const engineOn = () => store.settings.liveEngine !== false && !A.review;

export function initAnalysis(h) {
  hooks = h;
  A.cg = makeBoard($("anBoard"), { events: { move: onBoardMove } });
  $("anFirst").onclick = () => nav("first");
  $("anPrev").onclick = () => nav("prev");
  $("anNext").onclick = () => nav("next");
  $("anLast").onclick = () => nav("last");
  $("anFlip").onclick = flip;
  $("anArrow").onclick = toggleArrows;
  $("anPlayBest").onclick = playBest;
  $("anMore").onclick = (e) => moreMenu(e.currentTarget);
  $("anFreeBtn").onclick = () => hooks.newBoard();
  $("anAiSum").onclick = aiSummary;
  $("anTabs").addEventListener("click", (e) => { const b = e.target.closest(".seg-btn"); if (b) setTab(b.dataset.tab); });
  $("anMoves").addEventListener("click", (e) => {
    const b = e.target.closest("[data-node]"); if (b) { const n = A.tree.byId.get(+b.dataset.node); if (n) goNode(n); }
  });
  $("anKeys").addEventListener("click", (e) => { const b = e.target.closest("[data-go]"); if (b) { setTab("moves"); goTo(+b.dataset.go); } });
  // El panel del motor se arma una vez; después solo cambian el estado y las líneas (así no se pierden clics mientras calcula).
  $("anEngine").innerHTML = `<div class="engine-head"><button class="switch" id="anEngSwitch" type="button" role="switch" aria-label="${tr("Motor en vivo", "Live engine")}" title="${tr("Encender o apagar el motor en vivo", "Turn the live engine on or off")}"></button><span class="eng-name">Stockfish 18</span><span class="eng-meta" id="anEngMeta"></span></div>
    <div class="live-lines" id="anEngLines"></div>
    <label class="check small" id="anAutoRow"><input type="checkbox" id="anAutoReply"> <span>${tr("Que el motor responda mis jugadas", "Have the engine answer my moves")}</span></label>`;
  $("anEngSwitch").onclick = () => { store.settings.liveEngine = !engineOnSetting(); hooks.saveSettings(); if (engineOn()) startLive(); else { stopLive(); A.live = null; } renderEngine(); renderBoardShapes(); renderEvalBar(); };
  $("anAutoReply").onchange = (e) => { A.autoReply = e.target.checked; A.pendingReply = null; if (A.autoReply && !engineOnSetting()) $("anEngSwitch").click(); };
  // Las líneas se redibujan varias veces por segundo: se actúa al apretar, sin esperar a soltar el botón.
  $("anEngLines").addEventListener("pointerdown", (e) => { const m = e.target.closest(".pvm"); if (m && e.button === 0) { e.preventDefault(); playLine(+m.dataset.l, +m.dataset.i); } });
  $("anReport").addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    const a = t.dataset.act;
    if (a === "go") { setTab("moves"); goTo(+t.dataset.ply); }
    else if (a === "train-game") hooks.onTrain(A.entry.id);
    else if (a === "threats") hooks.startThreats({});
    else if (a === "puzzles") hooks.startPuzzles({ theme: t.dataset.arg || undefined });
    else if (a === "endgames") hooks.goView("endgames");
    else if (a === "diagnosis") hooks.goView("diagnosis");
    else if (a === "copy-report") { if (A.report) { window.api.copyText(reportText(A.report)); toast(tr("Devolución copiada.", "Report copied.")); } }
  });
  $("anMove").addEventListener("input", (e) => {
    if (e.target.id === "anNote" && A.node) { const v = e.target.value.trim(); if (v) A.node.comment = v; else delete A.node.comment; persistVars(); return; }
    if (e.target.id !== "anRvNote" || !A.review) return;
    const rv = reviewData(); const mk = rv.marks[basePly()]; if (!mk) return;
    mk.note = e.target.value; saveLibrary();
  });
  $("anReviewBtn").onclick = () => { if (A.entry) { A.review = true; A.compare = false; A.tab = "moves"; stopLive(); A.live = null; goNode(baseOf(A.node), false); renderAll(); } };
  $("anCmp").addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    if (t.dataset.act === "go") goTo(+t.dataset.ply);
    else if (t.dataset.act === "closecmp") { A.compare = false; renderPanel(); }
  });
  $("anMove").addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    if (t.dataset.act === "note-edit") { A.noteEdit = A.node.id; renderMoveCard(); const ta = $("anNote"); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } return; }
    if (t.dataset.act === "note-done") { A.noteEdit = null; renderMoveCard(); renderMoves(); return; }
    if (t.dataset.act === "note-del") { delete A.node.comment; persistVars(); A.noteEdit = null; renderMoveCard(); renderMoves(); return; }
    const a = t.dataset.act, p = basePly();
    if (a === "rv-mark") { const rv = reviewData(); rv.marks[p] = rv.marks[p] || { note: "", cand: null, candSan: "" }; saveLibrary(); renderMoveCard(); const n = $("anRvNote"); if (n) n.focus(); return; }
    if (a === "rv-unmark") { const rv = reviewData(); delete rv.marks[p]; saveLibrary(); renderMoveCard(); renderMoves(); return; }
    if (a === "rv-go") { goTo(+t.dataset.ply); return; }
    if (a === "rv-finish") { finishReview(); return; }
    if (a === "rv-skip") { const rv = reviewData(); rv.skipped = true; saveLibrary(); A.review = false; renderAll(); startLive(); return; }
    if (a === "ai") aiExplain(+t.dataset.k);
    else if (a === "showline") showLine(t.dataset.which);
    else if (a === "back") goNode(baseOf(A.node));
    else if (a === "delvar") deleteVariation();
    else if (a === "save-free") saveFree();
    else if (a === "report") setTab("report");
  });
  initGraph();
  $("anMe").addEventListener("click", (e) => {
    const b = e.target.closest(".seg-btn"); if (!b || !A.entry) return;
    A.entry.userColor = b.dataset.c === "x" ? "none" : b.dataset.c;
    saveLibrary(); emit("library");
    A.reportKey = ""; A.showMe = true;
    A.orient = A.entry.userColor === "b" ? "black" : A.entry.userColor === "w" ? "white" : A.orient;
    renderBoard();
    renderStrips(); renderMeRow(); renderPanel();
  });
  on("progress", (p) => {
    if (!A.entry || A.entry.free || !(p.id === A.entry.id || !p.id)) return;
    // Mientras hacés tu revisión el motor trabaja de fondo: solo se actualiza la barra, sin tocar lo que estás escribiendo.
    if (A.review) { renderProgress(); return; }
    renderBoard(); renderPanel();
  });
  on("analysed", (id) => { if (A.entry && id === A.entry.id) { A.reportKey = ""; renderAll(); } });
  // Cuando termina el diagnóstico en segundo plano, la devolución puede sumar el contexto que faltaba.
  on("warm", (p) => { if (p.pending) return; A.reportKey = ""; if (A.entry && !A.review && A.tab === "report" && !$("view-analysis").hidden) renderPanel(); });
  $("anType").addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") { e.target.value = ""; e.target.blur(); return; }
    if (e.key !== "Enter") return;
    const ok = typedMove(e.target.value);
    e.target.classList.toggle("bad", !ok);
    if (ok) e.target.value = ""; else toast(tr("Esa jugada no es legal en esta posición.", "That move isn't legal in this position."));
  });
  $("anType").addEventListener("input", (e) => e.target.classList.remove("bad"));
  window.__mesaAnalysis = {
    state: () => ({ id: A.entry && A.entry.id, ply: basePly(), node: A.node && A.node.id, inVar: inVar(), depth: A.node ? A.node.ply : 0, fen: A.node && A.node.fen, tab: A.tab, review: A.review, compare: A.compare,
      live: A.live && A.live.lines ? A.live.lines.length : 0, vars: A.entry ? A.entry.vars || null : null, marks: A.entry && A.entry.selfReview ? A.entry.selfReview.marks : null }),
    move: (o, d) => onBoardMove(o, d), type: (t) => typedMove(t), go: (p) => goTo(p), playBest, playLine, tab: setTab, nav, pgn: () => currentPgn(), del: deleteVariation
  };
}
const engineOnSetting = () => store.settings.liveEngine !== false;

// La revisión propia arranca sola solo con partidas recién jugadas (o cuando se pide desde "Hoy"):
// abrir una partida vieja para mirar el análisis no debería obligarte a revisarla primero.
const REVIEW_RECENT_MS = 3 * 86400000;
function shouldReview(e) { return !!(store.settings.selfReview && detectUserColor(e) && !(e.selfReview && (e.selfReview.done || e.selfReview.skipped)) && Date.now() - (e.date || 0) < REVIEW_RECENT_MS); }
function reviewData() { const e = A.entry; if (!e.selfReview) e.selfReview = { marks: {} }; if (!e.selfReview.marks) e.selfReview.marks = {}; return e.selfReview; }
export function openReview(id) { openAnalysis(id, 0, { review: true }); }
export function openAnalysis(id, ply, opts = {}) {
  const e = findEntry(id); if (!e) return;
  let game; try { game = gameOf(e); } catch (err) { toast(err.message); return; }
  stopLive();
  const tree = buildTree(game, e.vars, e.notes);
  Object.assign(A, { entry: e, game, tree, live: null, report: null, reportKey: "", pendingReply: null, showMe: false });
  $("anEngLines").innerHTML = "";
  A.node = tree.mainline[Math.max(0, Math.min(tree.mainline.length - 1, ply != null ? ply : 0))];
  A.review = opts.review ? true : ply == null && shouldReview(e);
  A.compare = false;
  // Al abrir una partida ya analizada se ve primero la devolución; si se pidió una jugada puntual, va directo a esa jugada.
  A.tab = !A.review && ply == null && e.analysis ? "report" : "moves";
  const uc = detectUserColor(e);
  A.orient = uc === "b" ? "black" : "white";
  if (!e.analysis) enqueueAnalysis(id, true);
  $("anEmpty").hidden = true; $("anContent").hidden = false;
  renderAll();
  startLive();
}
/** Tablero libre: una posición suelta (o la inicial) para explorar con el motor o cargar una partida a mano. */
export function openFree(fen) {
  let c; try { c = new Chess(fen || START_FEN); } catch (err) { return false; }
  stopLive();
  const f = c.fen();
  const game = { headers: f === START_FEN ? {} : { SetUp: "1", FEN: f }, fens: [f], checks: [c.inCheck()], term: [null], moves: [], clocks: [], tc: null };
  const entry = { id: "free", free: true, white: tr("Blancas", "White"), black: tr("Negras", "Black"), result: "*", date: Date.now(), analysis: null, userColor: "none" };
  const tree = buildTree(game, null);
  Object.assign(A, { entry, game, tree, node: tree.root, live: null, review: false, compare: false, tab: "moves", report: null, reportKey: "", pendingReply: null });
  $("anEngLines").innerHTML = "";
  A.orient = c.turn() === "b" ? "black" : "white";
  $("anEmpty").hidden = true; $("anContent").hidden = false;
  renderAll();
  startLive();
  return true;
}
export function currentEntryId() { return A.entry && !A.entry.free ? A.entry.id : null; }
/** Al salir de Análisis: frena el motor en vivo para no gastar CPU de fondo. */
export function leaveAnalysis() { stopLive(); }
function renderMeRow() {
  if (!A.entry) return;
  const uc = A.entry.userColor === "none" ? "x" : detectUserColor(A.entry) || "";
  $("anMe").querySelectorAll(".seg-btn").forEach((x) => x.classList.toggle("on", x.dataset.c === uc));
}
export function onShow() { renderAll(); if (A.entry) startLive(); }

/* ---------- datos ---------- */
// En la revisión propia el motor queda oculto: nada que venga del análisis se muestra.
function an() { return A.review ? null : realAn(); }
function realAn() {
  if (!A.entry) return null;
  if (A.entry.analysis) return A.entry.analysis;
  if (progress.id === A.entry.id && progress.evals) return { evals: progress.evals, info: progress.info, partial: true };
  return null;
}
const curFen = () => A.node.fen;
const curLast = () => (A.node.from ? [A.node.from, A.node.to] : undefined);
const userColor = () => (A.entry ? detectUserColor(A.entry) : null);
function persistVars() {
  if (!A.entry || A.entry.free) return;
  const v = serializeVars(A.tree);
  if (v) A.entry.vars = v; else delete A.entry.vars;
  const nt = serializeNotes(A.tree);
  if (nt) A.entry.notes = nt; else delete A.entry.notes;
  saveLibrary();
}
/* Comentario propio en la jugada actual (se guarda con la partida y sale en el PGN). */
function noteHtml(n) {
  if (!n || !n.san) return "";
  if (A.noteEdit === n.id) return `<div class="note-edit"><textarea id="anNote" rows="3" maxlength="2000" placeholder="${tr("Tu comentario sobre esta jugada", "Your comment on this move")}">${esc(n.comment || "")}</textarea><div class="btn-row"><button class="btn small primary" type="button" data-act="note-done">${tr("Listo", "Done")}</button>${n.comment ? `<button class="linkbtn" type="button" data-act="note-del">${tr("Borrar", "Delete")}</button>` : ""}</div></div>`;
  return n.comment
    ? `<div class="note"><div class="line-lbl"><span>${tr("Tu comentario", "Your comment")}</span><button class="linkbtn" type="button" data-act="note-edit">${tr("Editar", "Edit")}</button></div><p class="nofig">${esc(n.comment)}</p></div>`
    : `<div class="btn-row"><button class="linkbtn" type="button" data-act="note-edit">${tr("Agregar un comentario", "Add a comment")}</button></div>`;
}

/* ---------- navegación ---------- */
function goNode(n, sound = true) {
  if (!A.tree || !n) return;
  const forward = n.parent === A.node;
  if (A.pendingReply !== n.id) A.pendingReply = null;
  A.node = n;
  if (!(A.live && A.live.fen === n.fen)) A.live = null;
  renderBoard(forward && sound && n.san ? soundFor(n) : null);
  renderPanel();
  // Para lectores de pantalla: la jugada que quedó en el tablero.
  const live = $("srLive"); if (live) live.textContent = n.san ? `${Math.floor((n.ply + 1) / 2)}${n.color === "w" ? "." : "..."} ${n.san}` : tr("Posición inicial", "Starting position");
  startLive();
}
function goTo(p, sound = true) { if (A.tree) goNode(A.tree.mainline[Math.max(0, Math.min(A.tree.mainline.length - 1, p))], sound); }
function nav(where) {
  if (!A.tree) return;
  const n = A.node;
  if (where === "first") goNode(A.tree.root);
  else if (where === "prev") { if (n.parent) goNode(n.parent); }
  else if (where === "next") { if (n.children[0]) goNode(n.children[0]); }
  else goNode(lineEnd(n));
}
function flip() { A.orient = A.orient === "white" ? "black" : "white"; renderBoard(); renderStrips(); }
function toggleArrows() { A.showArrow = !A.showArrow; $("anArrow").classList.toggle("on", A.showArrow); renderBoardShapes(); }
/** Salta al error anterior o siguiente de la partida (los tuyos, si se sabe quién sos). */
function jumpKey(dir) {
  const a = an(); if (!a || !A.game) return;
  const uc = userColor(), p = basePly();
  const ks = a.info.map((x, k) => (x && (x.c === "mistake" || x.c === "blunder") && (!uc || A.game.moves[k].color === uc) ? k + 1 : null)).filter(Boolean);
  const t = dir > 0 ? ks.find((k) => k > p || (k === p && inVar())) : [...ks].reverse().find((k) => k < p);
  if (t != null) { setTab("moves"); goTo(t); }
}
export function analysisKey(e) {
  if (!A.entry) return false;
  if (e.key === "m" || e.key === "M") { $("anType").focus(); return true; }
  if (e.key === "ArrowLeft") { nav("prev"); return true; }
  if (e.key === "ArrowRight") { if (A.tab === "report" && !A.review) setTab("moves"); nav("next"); return true; }
  if (e.key === "ArrowUp") { jumpKey(-1); return true; }
  if (e.key === "ArrowDown") { jumpKey(1); return true; }
  if (e.key === "Home") { nav("first"); return true; }
  if (e.key === "End") { nav("last"); return true; }
  if (e.key === "f" || e.key === "F") { flip(); return true; }
  if (e.key === "a" || e.key === "A") { toggleArrows(); return true; }
  if (e.key === " ") { playBest(); return true; }
  if ((e.key === "Backspace" || e.key === "Delete") && inVar()) { deleteVariation(); return true; }
  if (e.key === "Escape" && inVar()) { goNode(baseOf(A.node)); return true; }
  return false;
}
const soundFor = (m) => (m ? { captured: !!m.captured, check: m.san.includes("+") || m.san.includes("#") } : null);

/* ---------- jugar en el tablero: variantes ---------- */
async function onBoardMove(orig, dest, promo) {
  if (!A.tree) return;
  const from = A.node;
  const c = new Chess(from.fen);
  if (promo === undefined) promo = await pickPromotion(A.cg, c, orig, dest);
  if (promo === null || A.node !== from) { renderBoard(); return; }
  if (A.review) { recordCandidate(orig, dest, promo); return; }
  const n = addMove(A.tree, from, orig + dest + (promo || ""));
  if (!n) { renderBoard(); return; }
  if (A.tab !== "moves") A.tab = "moves";
  if (n.main == null) persistVars();
  // Con "que el motor responda" activado, la próxima jugada la hace Stockfish apenas termina de pensar.
  A.pendingReply = A.autoReply && engineOn() ? n.id : null;
  goNode(n);
}
/** Juega en el tablero una jugada en notación del motor (e2e4). */
function playUci(uci) {
  const n = addMove(A.tree, A.node, uci);
  if (!n) return false;
  if (n.main == null) persistVars();
  goNode(n);
  return true;
}
/** Jugada escrita con el teclado: acepta Cf3 / Nf3, e4, exd5, O-O, e8=D y también e2e4. Devuelve false si no es legal acá. */
function typedMove(text) {
  if (!A.tree || !A.node) return false;
  let t = String(text || "").trim().replace(/[!?+#]+$/, "").replace(/0/g, "O").replace(/\s+/g, "");
  if (!t) return false;
  const c = new Chess(A.node.fen);
  const attempt = (san) => { try { const m = c.move(san, { strict: false }); c.undo(); return m; } catch (e) { return null; } };
  const ES = { R: "K", D: "Q", T: "R", A: "B", C: "N" };
  const es = (x) => x.replace(/^[RDTAC]/, (ch) => ES[ch]).replace(/=([RDTAC])$/, (_m, ch) => "=" + ES[ch]);
  const cap = t.charAt(0).toUpperCase() + t.slice(1);
  const order = store.settings.notation === "es" ? [es(t), es(cap), t, cap] : [t, cap, es(t), es(cap)];
  let m = null;
  if (/^[a-h][1-8][a-h][1-8][qrbnQRBN]?$/.test(t)) { try { m = c.move({ from: t.slice(0, 2), to: t.slice(2, 4), promotion: t[4] ? t[4].toLowerCase() : undefined }); c.undo(); } catch (e) { m = null; } }
  for (const cand of order) { if (m) break; m = attempt(cand); }
  if (!m) return false;
  onBoardMove(m.from, m.to, m.promotion || (m.piece === "p" && /[18]$/.test(m.to) ? "q" : ""));
  return true;
}
/** Juega la jugada que recomienda el motor en la posición actual (para el bando que mueve, sea el tuyo o el rival). */
function playBest() {
  if (!A.tree || A.review) return;
  let uci = null;
  if (A.live && A.live.fen === curFen() && A.live.lines && A.live.lines[0]) uci = A.live.lines[0].pv[0];
  if (!uci && !inVar()) { const a = an(); const e = a && a.evals[basePly()]; if (e && e.best) uci = e.best; }
  if (!uci) { toast(engineOnSetting() ? tr("El motor todavía está calculando esta posición.", "The engine is still calculating this position.") : tr("Encendé el motor para ver su jugada.", "Turn the engine on to see its move.")); return; }
  if (A.tab !== "moves") setTab("moves");
  playUci(uci);
}
/** Juega en el tablero las primeras jugadas de una línea del motor. */
function playLine(l, i) {
  if (!A.live || A.live.fen !== curFen() || !A.live.lines[l]) return;
  const pv = A.live.lines[l].pv.slice(0, i + 1);
  let n = A.node, added = false;
  for (const u of pv) { const x = addMove(A.tree, n, u); if (!x) break; if (x.main == null) added = true; n = x; }
  if (added) persistVars();
  if (n !== A.node) goNode(n);
}
function showLine(which) {
  const a = an(); if (!a || !A.game || inVar()) return;
  const k = basePly() - 1; if (k < 0) return;
  let base, pv;
  if (which === "best") { base = k; pv = a.evals[k]?.pv || []; }
  else if (which === "reply") { base = k + 1; pv = a.evals[k + 1]?.pv || []; }
  else { base = k; pv = [A.game.moves[k].uci, ...(a.evals[k + 1]?.pv || [])]; }
  let n = A.tree.mainline[base], first = null, added = false;
  for (const u of pv.slice(0, 10)) { const x = addMove(A.tree, n, u); if (!x) break; if (x.main == null) added = true; if (!first) first = x; n = x; }
  if (!first) return;
  if (added) persistVars();
  goNode(first);
}
function deleteVariation() {
  if (!inVar()) return;
  const parent = removeBranch(A.tree, branchRoot(A.node));
  persistVars();
  goNode(parent || A.tree.root, false);
}

/* ---------- motor en vivo ---------- */
function stopLive() { clearTimeout(liveTimer); if (A.liveJob) { A.liveJob.cancel(); A.liveJob = null; } }
let liveThrottle = 0, liveTimer = null;
function startLive() {
  stopLive();
  if (!A.entry || !visible() || !engineOn()) { renderEngine(); return; }
  // Un respiro antes de arrancar: si se recorre la partida con las flechas no se lanza una búsqueda por cada posición.
  liveTimer = setTimeout(runLive, 140);
  renderEngine();
}
async function runLive() {
  const fen = curFen();
  const c = new Chess(fen);
  if (c.isGameOver()) { A.live = { fen, done: true, over: c.isCheckmate() ? (c.turn() === "w" ? -1500 : 1500) : 0 }; renderEngine(); renderEvalBar(); return; }
  if (!engines.live.ready) { await ensureEngines(); if (!engines.live.ready || !A.node || curFen() !== fen) { renderEngine(); return; } }
  engines.live.configure({ MultiPV: Math.max(1, Math.min(5, store.settings.liveLines || 3)) });
  const t0 = performance.now(), node = A.node;
  const reply = () => {
    if (A.pendingReply !== node.id || A.node !== node) return false;
    const best = A.live && A.live.fen === fen && A.live.lines[0] && A.live.lines[0].pv[0];
    if (!best) return false;
    A.pendingReply = null;
    playUci(best);
    return true;
  };
  const job = engines.live.search(fen, "depth 30 movetime 20000", (info, multi) => {
    if (A.liveJob !== job) return;
    const now = performance.now();
    // Respuesta automática: alcanza con una profundidad razonable y un instante para que se vea la jugada propia.
    if (A.pendingReply === node.id && multi[1] && multi[1].depth >= 16 && now - t0 > 700) { A.live = { fen, lines: Object.values(multi).sort((a, b) => a.multipv - b.multipv) }; if (reply()) return; }
    if (now - liveThrottle < 150) return; liveThrottle = now;
    A.live = { fen, lines: Object.values(multi).sort((a, b) => a.multipv - b.multipv) };
    renderEngine(); renderEvalBar(); renderBoardShapes();
  }, 30000);
  A.liveJob = job;
  const r = await job.promise;
  if (A.liveJob === job && r && r.lines && r.lines.length) { A.live = { fen, lines: r.lines, final: true }; if (reply()) return; renderEngine(); renderEvalBar(); renderBoardShapes(); }
}
function pvHtml(fen, line, l) {
  const sans = pvToSan(fen, line.pv, 12);
  const parts = fen.split(" "); let side = parts[1], n = +parts[5] || 1;
  return sans.map((s, i) => {
    const num = side === "w" ? `<span class="num">${n}.</span> ` : i === 0 ? `<span class="num">${n}…</span> ` : "";
    if (side === "b") n++;
    side = side === "w" ? "b" : "w";
    return `${num}<span class="pvm${i === 0 ? " first" : ""}" data-l="${l}" data-i="${i}">${esc(s)}</span>`;
  }).join(" ");
}
function renderEngine() {
  const box = $("anEngine"); if (!box || !A.entry) return;
  if (A.review) { box.hidden = true; return; }
  box.hidden = false;
  const on = engineOnSetting();
  const live = A.live && A.live.fen === curFen() ? A.live : null;
  let meta = "";
  if (!on) meta = tr("en pausa", "paused");
  else if (live && live.done) meta = tr("partida terminada", "game over");
  else if (live && live.lines && live.lines[0]) { const l0 = live.lines[0]; meta = tr(`profundidad ${l0.depth}`, `depth ${l0.depth}`) + (l0.nps ? `, ${(l0.nps / 1e6).toFixed(1)} ${tr("M nodos/s", "M nodes/s")}` : ""); }
  else meta = engines.live.failed ? tr("no disponible", "unavailable") : tr("calculando…", "calculating…");
  const sw = $("anEngSwitch"); sw.classList.toggle("on", on); sw.setAttribute("aria-checked", String(on));
  $("anEngMeta").textContent = meta;
  $("anAutoReply").checked = !!A.autoReply;
  $("anAutoRow").hidden = !on;
  const lines = $("anEngLines");
  if (on && live && live.lines && !live.done) {
    const fen = live.fen;
    lines.hidden = false;
    lines.innerHTML = live.lines.map((l, i) => {
      const s = scoreFromInfo(l, fen); const neg = toCp(s) < 0;
      return `<div class="live-line"><span class="ev-chip${neg ? " neg" : ""}">${evalText(s)}</span><span class="pv">${pvHtml(fen, l, i)}</span></div>`;
    }).join("");
  } else if (on && !(live && live.done)) {
    // Mientras calcula se dejan las líneas anteriores atenuadas para que el panel no salte.
    lines.classList.add("stale");
    return;
  } else { lines.hidden = true; lines.innerHTML = ""; }
  lines.classList.remove("stale");
}

/* ---------- render ---------- */
function renderAll() { renderBoard(); renderStrips(); renderPanel(); renderEngine(); }

function currentShapes() {
  const shapes = [];
  if (!A.tree) return shapes;
  const a = an(), p = basePly();
  const live = engineOn() && A.live && A.live.fen === curFen() && A.live.lines && A.live.lines[0] && A.live.lines[0].depth >= 8 ? A.live : null;
  if (A.showArrow) {
    if (live) live.lines.slice(0, 2).forEach((l, i) => { if (l.pv[0]) shapes.push(arrow(l.pv[0], i === 0 ? "best" : "alt")); });
    else if (!inVar() && a && a.evals[p] && a.evals[p].best) shapes.push(arrow(a.evals[p].best, "best"));
  }
  if (!inVar() && a && p > 0 && a.info[p - 1]) {
    const x = a.info[p - 1], m = A.game.moves[p - 1];
    if (["inacc", "mistake", "blunder", "best"].includes(x.c)) {
      const color = { inacc: "var(--inacc)", mistake: "var(--mistake)", blunder: "var(--blunder)", best: "var(--best)" }[x.c];
      shapes.push({ orig: m.to, customSvg: { html: `<g transform="translate(66 4)"><circle cx="15" cy="15" r="15" style="fill:${color}" stroke="#fff" stroke-width="2.5"/><text x="15" y="20.5" font-size="15" text-anchor="middle" fill="${x.c === "inacc" ? "#2b2100" : "#fff"}" font-weight="700" font-family="Helvetica,Arial,sans-serif">${CLS[x.c].g}</text></g>` } });
    }
  }
  return shapes;
}
function renderBoardShapes() { if (!visible() || !A.tree) return; try { A.cg.setAutoShapes(currentShapes()); } catch (e) {} }
function renderBoard(sound) {
  if (!A.tree || !visible()) return;
  const c = new Chess(curFen());
  syncBoard(A.cg, c, { orientation: A.orient, lastMove: curLast(), movable: true, shapes: currentShapes(), sound });
  renderEvalBar(); renderStrips();
  const n = A.node;
  $("anPrev").disabled = !n.parent; $("anFirst").disabled = !n.parent;
  $("anNext").disabled = !n.children.length; $("anLast").disabled = !n.children.length;
  $("anPlayBest").disabled = A.review;
}
function curScore() {
  const a = an();
  if (!inVar() && a && a.evals[basePly()]) return a.evals[basePly()];
  const live = A.live && A.live.fen === curFen() ? A.live : null;
  if (live && live.done) return { done: live.over };
  if (live && live.lines && live.lines[0]) return scoreFromInfo(live.lines[0], live.fen);
  return null;
}
function renderEvalBar() {
  const bar = $("anBar"); const s = A.review ? null : curScore();
  const w = s ? wp(toCp(s)) : 50;
  bar.classList.toggle("flip", A.orient === "black");
  bar.classList.toggle("off", !!A.review);
  bar.querySelector(".evalbar-fill").style.height = w + "%";
  const lbl = bar.querySelector(".evalbar-lbl");
  lbl.textContent = s ? evalText(s).replace("−", "-") : "";
  const whiteAhead = w >= 50;
  const whiteEnd = A.orient === "black" ? "top" : "bottom", blackEnd = A.orient === "black" ? "bottom" : "top";
  lbl.style.top = ""; lbl.style.bottom = "";
  lbl.style[whiteAhead ? whiteEnd : blackEnd] = "5px";
  lbl.style.color = whiteAhead ? "var(--bar-b)" : "var(--bar-w)";
}
const GLYPHS = { q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
/** Piezas de más que tiene cada bando en la posición actual (como en Lichess). */
function materialOf(fen) {
  const cnt = { w: {}, b: {} };
  for (const ch of fen.split(" ")[0]) { const t = ch.toLowerCase(); if (GLYPHS[t]) { const c = ch === t ? "b" : "w"; cnt[c][t] = (cnt[c][t] || 0) + 1; } }
  let diff = 0; const out = { w: "", b: "" };
  for (const t of ["q", "r", "b", "n", "p"]) {
    const d = (cnt.w[t] || 0) - (cnt.b[t] || 0); diff += d * VALUES[t];
    if (d > 0) out.w += GLYPHS[t].repeat(d); else if (d < 0) out.b += GLYPHS[t].repeat(-d);
  }
  return { w: out.w + (diff > 0 ? `<i>+${diff}</i>` : ""), b: out.b + (diff < 0 ? `<i>+${-diff}</i>` : "") };
}
function clockOf(color) {
  const g = A.game; if (!g.clocks || !g.clocks.length) return null;
  for (let k = basePly() - 1; k >= 0; k--) if (g.moves[k].color === color && g.clocks[k] != null) return g.clocks[k];
  return g.tc && g.clocks.some((c) => c != null) ? g.tc.base : null;
}
function renderStrips() {
  if (!A.entry) return;
  const e = A.entry, uc = userColor();
  const mat = materialOf(curFen());
  const right = (c) => {
    const cl = A.review ? null : clockOf(c);
    return `${mat[c] ? `<span class="mat">${mat[c]}</span>` : ""}${cl != null ? `<span class="clock${cl < 30 ? " low" : ""}">${fmtClock(cl)}</span>` : ""}`;
  };
  const w = playerStrip(e.white, e.whiteElo, "w", uc === "w", right("w"));
  const b = playerStrip(e.black, e.blackElo, "b", uc === "b", right("b"));
  $("anTop").innerHTML = A.orient === "white" ? b : w;
  $("anBot").innerHTML = A.orient === "white" ? w : b;
}

function setTab(t) {
  if (A.review || (A.entry && A.entry.free)) t = "moves";
  A.tab = t;
  renderPanel();
}
function renderPanel() {
  if (!A.entry || !visible()) return;
  const e = A.entry, free = !!e.free;
  const op = !free ? openingName(e, A.game.headers) : "";
  const opLabel = op ? (familyLabel(op) && familyLabel(op) !== tr("Otras", "Other") ? familyLabel(op) : op.split(":")[0]) : "";
  $("anTitle").innerHTML = free
    ? `<div class="gt-main"><b>${tr("Tablero libre", "Free board")}</b><span>${tr("Mové las piezas de los dos bandos. El motor analiza cada posición.", "Move the pieces for both sides. The engine analyzes every position.")}</span></div>`
    : `<div class="gt-main"><b class="nofig">${esc(e.white)} – ${esc(e.black)}</b><span>${[esc(e.result || ""), fmtDate(e.date), esc(opLabel)].filter(Boolean).join(" · ")}${e.url ? ` · <a data-url="${esc(e.url)}">${tr("ver original", "view original")}</a>` : ""}</span></div>`;
  const lnk = $("anTitle").querySelector("a[data-url]"); if (lnk) lnk.onclick = () => window.api.openExternal(lnk.dataset.url);
  renderProgress();
  // "Jugaste con…" solo hace falta cuando la app no sabe quién sos en esta partida (o si lo pedís desde el menú).
  $("anMeRow").hidden = free || !(A.showMe || (!userColor() && e.userColor !== "none"));
  $("anGraph").hidden = free;
  $("anTabs").hidden = free || A.review;
  $("anTabs").querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("on", b.dataset.tab === A.tab));
  $("anTabMoves").hidden = A.tab !== "moves"; $("anTabReport").hidden = A.tab !== "report";
  if (!free) { renderGraph(); renderMeRow(); }
  if (A.tab === "moves") { renderMoveCard(); renderMoves(); renderCompare(); }
  else { renderReport(); renderStats(); }
  $("anReviewBtn").hidden = free || A.review || !userColor();
  $("anReviewBtn").textContent = e.selfReview && e.selfReview.done ? tr("Revisar de nuevo", "Review again") : tr("Revisión propia", "Self-review");
  $("anContent").classList.toggle("reviewing", A.review);
  $("anAiSum").hidden = !(store.settings.aiKey && e.analysis);
  const out = $("anAiSumOut"); const cached = A.aiSum[e.id];
  out.innerHTML = cached ? `<div class="ai-out">${md(cached)}</div>` : "";
}

function renderProgress() {
  const e = A.entry, prog = $("anProg");
  if (!e.free && !e.analysis) {
    prog.hidden = false;
    const pct = progress.id === e.id && progress.n ? (progress.i / progress.n) * 100 : 0;
    prog.querySelector(".progress-bar").style.width = pct.toFixed(1) + "%";
    prog.querySelector(".progress-txt").textContent = progress.id === e.id ? `${tr("Analizando", "Analyzing")} ${progress.i}/${progress.n}` : tr("En cola para analizar…", "Queued for analysis…");
  } else prog.hidden = true;
}
function renderGraph() {
  const svg = $("anGraph").querySelector("svg");
  const a = an(); const n = A.game.fens.length - 1; const W = 600, H = 110;
  const X = (i) => (n ? (i / n) * W : 0);
  const pts = [];
  if (a) for (let i = 0; i <= n; i++) { if (!a.evals[i]) break; pts.push([X(i), H - (wp(toCp(a.evals[i])) / 100) * H]); }
  let s = `<rect width="${W}" height="${H}" style="fill:var(--graph-b)"/>`;
  if (pts.length) s += `<path d="M0,${H} ${pts.map((p) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")} L${pts[pts.length - 1][0].toFixed(1)},${H} Z" style="fill:var(--graph-w)"/>`;
  s += `<line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" style="stroke:var(--graph-mid)" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>`;
  if (a) a.info.forEach((x, k) => { if (x && ["mistake", "blunder", "inacc"].includes(x.c) && pts[k + 1]) s += `<circle cx="${pts[k + 1][0]}" cy="${pts[k + 1][1]}" r="${x.c === "inacc" ? 3 : 4}" style="fill:var(--${x.c});stroke:var(--panel)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`; });
  const cx = X(basePly());
  s += `<line x1="${cx}" x2="${cx}" y1="0" y2="${H}" style="stroke:var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
  svg.innerHTML = s;
}
function initGraph() {
  const svg = $("anGraph").querySelector("svg"), tip = $("anGraph").querySelector(".graph-tip");
  const idxAt = (ev) => { const r = svg.getBoundingClientRect(); const n = A.game.fens.length - 1; return Math.max(0, Math.min(n, Math.round(((ev.clientX - r.left) / r.width) * n))); };
  svg.addEventListener("pointermove", (ev) => {
    if (!A.game) return; const a = an(); const i = idxAt(ev); const s = a && a.evals[i];
    if (!s) { tip.hidden = true; return; }
    const r = svg.getBoundingClientRect(); const n = A.game.fens.length - 1;
    tip.textContent = (i ? moveLabel(A.game.fens[i - 1], A.game.moves[i - 1].san, A.game.moves[i - 1].color) : tr("Inicio", "Start")) + "  " + evalText(s);
    tip.style.left = (n ? (i / n) * r.width : 0) + "px"; tip.hidden = false;
  });
  svg.addEventListener("pointerleave", () => { tip.hidden = true; });
  svg.addEventListener("click", (ev) => { if (A.game) { if (A.tab !== "moves" && !A.review) A.tab = "moves"; goTo(idxAt(ev)); } });
}

/* ---------- devolución de la partida ---------- */
function renderReport() {
  const el = $("anReport"); const e = A.entry;
  if (!e.analysis) { el.innerHTML = `<h3>${tr("Devolución", "Game report")}</h3><p class="thinking">${tr("La devolución se escribe sola cuando termina el análisis de la partida.", "The report is written automatically once the game analysis finishes.")}</p>`; return; }
  const uc = userColor();
  const key = `${e.id}:${e.analysis.at}:${uc}:${store.library.length}`;
  if (A.reportKey !== key) { try { A.report = gameReport(e, A.game, uc); } catch (err) { A.report = null; try { window.api.log("devolución", String(err && err.stack || err)); } catch (x) {} } A.reportKey = key; }
  const r = A.report;
  if (!r) { el.innerHTML = `<p class="muted">${tr("No pude armar la devolución de esta partida.", "I couldn't put together the report for this game.")}</p>`; return; }
  const mark = { up: "▲", down: "▼", flat: "•" };
  let h = `<h3 class="rp-verdict">${esc(r.verdict)}</h3>`;
  h += r.story.map((p) => `<p>${esc(p)}</p>`).join("");
  if (r.turning) h += `<div class="btn-row"><button class="btn small" type="button" data-act="go" data-ply="${r.turning.k + 1}">${tr("Ver ese momento", "See that moment")}</button></div>`;
  if (r.clock) h += `<h4>${tr("El reloj", "The clock")}</h4><p>${esc(r.clock)}</p>`;
  if (uc) {
    h += `<h4>${tr("Tus errores en esta partida", "Your mistakes in this game")}</h4>`;
    h += r.mine.length ? `<div class="keys">${r.mine.map((m) => `<button class="chip" type="button" data-act="go" data-ply="${m.moves[0] + 1}" title="${esc(MOTIFS[m.motif].why)}">${esc(m.label)}${m.n > 1 ? ` ×${m.n}` : ""}</button>`).join("")}</div>`
      : `<p>${tr("Ninguno grave. Bien jugado.", "No serious ones. Well played.")}</p>`;
    h += `<h4>${tr("En contexto con tus otras partidas", "In context with your other games")}</h4>`;
    if (r.context.length) h += `<ul class="rp-ctx">${r.context.map((c) => `<li class="${c.tone}"><i>${mark[c.tone]}</i><span>${esc(c.text)}</span></li>`).join("")}</ul>`;
    if (r.contextNote) h += `<p class="muted small">${esc(r.contextNote)}</p>`;
    if (r.context.length) h += `<div class="btn-row"><button class="linkbtn" type="button" data-act="diagnosis">${tr("Ver el informe de la semana y del mes", "See the weekly and monthly report")}</button></div>`;
    if (r.next.length) h += `<h4>${tr("Qué hacer ahora", "What to do next")}</h4><div class="btn-row">${r.next.map((x, i) => `<button class="btn small${i === 0 ? " primary" : ""}" type="button" data-act="${x.act}"${x.arg ? ` data-arg="${esc(x.arg)}"` : ""}>${esc(x.label)}</button>`).join("")}</div>`;
  } else h += `<p class="muted small">${tr("Si jugaste esta partida, indicá con qué color arriba: la devolución pasa a hablarte a vos y la compara con tus otras partidas.", "If you played this game, choose your color above: the report will then speak to you and compare it with your other games.")}</p>`;
  h += `<div class="btn-row rp-foot"><button class="linkbtn" type="button" data-act="copy-report">${tr("Copiar la devolución como texto", "Copy the report as text")}</button></div>`;
  el.innerHTML = h;
}

/* ---------- revisión propia ---------- */
function recordCandidate(orig, dest, promo) {
  const g = A.game, p = basePly(), uc = userColor();
  const c = new Chess(g.fens[p]);
  if (inVar() || c.turn() !== uc || p >= g.moves.length) { renderBoard(); return; }
  const m = tryMove(c, { from: orig, to: dest, promotion: promo || undefined });
  if (!m) { renderBoard(); return; }
  const rv = reviewData();
  const mk = rv.marks[p] || (rv.marks[p] = { note: "", cand: null, candSan: "" });
  mk.cand = uciOf(m); mk.candSan = m.san; saveLibrary();
  renderBoard(); renderMoveCard(); renderMoves();
}
function finishReview() {
  const rv = reviewData();
  rv.done = true; rv.at = Date.now(); delete rv.skipped;
  saveLibrary(); logActivity("revision");
  A.review = false; A.compare = true; A.tab = "moves";
  emit("library");
  renderAll(); startLive();
}
function reviewCard(el) {
  const g = A.game, p = basePly(), uc = userColor(), rv = reviewData();
  const marks = Object.keys(rv.marks).map(Number).sort((a, b) => a - b);
  const myTurn = p < g.moves.length && g.fens[p].split(" ")[1] === uc;
  const mk = rv.marks[p];
  let h = `<div class="eyebrow">${tr("Revisión propia: el motor está oculto", "Self-review: the engine is hidden")}</div>`;
  if (p === 0 && !marks.length) h += `<p>${tr("Antes de mirar a Stockfish, recorré la partida vos. En cada momento donde dudaste o creés que te equivocaste, <b>marcalo</b> y anotá qué pensabas. Si tenías otra jugada en mente, movela en el tablero.", "Before looking at Stockfish, go through the game yourself. At every moment where you hesitated or think you went wrong, <b>mark it</b> and write down what you were thinking. If you had another move in mind, play it on the board.")}</p>`;
  if (myTurn) {
    const nm = g.moves[p];
    h += `<div class="mh"><span class="san">${esc(moveLabel(g.fens[p], nm.san, nm.color))}</span><span class="muted small">${tr("es lo que jugaste acá", "is what you played here")}</span></div>`;
    if (mk) {
      h += `<label class="field"><span>${tr("¿Qué pensabas en este momento?", "What were you thinking here?")}</span><textarea id="anRvNote" rows="3" placeholder="${tr("Ej.: dudé entre cambiar o retroceder el caballo; no vi su jaque…", "E.g.: I wasn't sure whether to trade or retreat the knight; I missed their check…")}">${esc(mk.note || "")}</textarea></label>`;
      h += `<p class="small">${mk.candSan ? tr(`Tu alternativa: <b>${esc(mk.candSan)}</b>. Podés mover otra pieza para cambiarla.`, `Your alternative: <b>${esc(mk.candSan)}</b>. Move another piece to change it.`) : tr("Si pensabas en otra jugada, movela en el tablero para anotarla.", "If you had another move in mind, play it on the board to note it.")}</p>`;
      h += `<div class="btn-row"><button class="btn small" type="button" data-act="rv-unmark">${tr("Quitar la marca", "Remove mark")}</button></div>`;
    } else {
      h += `<div class="btn-row"><button class="btn small primary" type="button" data-act="rv-mark">${tr("Marcar: acá dudé", "Mark: I hesitated here")}</button><span class="small muted">${tr("o mové en el tablero la jugada que pensabas", "or play the move you were considering")}</span></div>`;
    }
  } else if (p < g.moves.length) {
    h += `<p class="muted small">${tr("Le toca a tu rival. Avanzá a la próxima jugada tuya con → .", "It's your opponent's move. Go to your next move with → .")}</p>`;
  } else h += `<p class="muted small">${tr("Llegaste al final de la partida.", "You reached the end of the game.")}</p>`;
  if (marks.length) h += `<div class="rv-marks"><span class="small muted">${tr(`Marcaste ${marks.length} ${marks.length === 1 ? "momento" : "momentos"}:`, `You marked ${marks.length} ${marks.length === 1 ? "moment" : "moments"}:`)}</span>${marks.map((k) => `<button class="chip" type="button" data-act="rv-go" data-ply="${k}">${esc(moveLabel(g.fens[k], g.moves[k].san, g.moves[k].color))}${rv.marks[k].candSan ? " → " + esc(rv.marks[k].candSan) : ""}</button>`).join("")}</div>`;
  const ready = !!A.entry.analysis;
  h += `<div class="btn-row rv-foot"><button class="btn primary" type="button" data-act="rv-finish">${tr("Terminé: mostrar el análisis", "Done: show the analysis")}</button><button class="linkbtn" type="button" data-act="rv-skip">${tr("Saltear la revisión", "Skip the review")}</button></div>`;
  if (!ready) h += `<p class="small muted">${tr("El motor sigue analizando en segundo plano; cuando termines va a estar listo.", "The engine is still analyzing in the background; it will be ready when you finish.")}</p>`;
  el.innerHTML = h;
}
function renderCompare() {
  const box = $("anCmp");
  const rv = A.entry && A.entry.selfReview;
  if (!A.compare || A.review || !rv || !rv.done) { box.hidden = true; return; }
  box.hidden = false;
  const a = A.entry.analysis, g = A.game, uc = userColor();
  if (!a) { box.innerHTML = `<div class="card-head"><h3>${tr("Tu revisión y la de Stockfish", "Your review and Stockfish's")}</h3></div><p class="thinking small">${tr("Esperando que termine el análisis…", "Waiting for the analysis to finish…")}</p>`; return; }
  const marks = Object.keys(rv.marks || {}).map(Number).sort((x, y) => x - y);
  const errs = a.info.map((x, k) => ({ x, k })).filter((o) => o.x && g.moves[o.k].color === uc && (o.x.c === "mistake" || o.x.c === "blunder"));
  const found = errs.filter((o) => marks.includes(o.k));
  const missed = errs.filter((o) => !marks.includes(o.k));
  let h = `<div class="card-head"><h3>${tr("Tu revisión y la de Stockfish", "Your review and Stockfish's")}</h3><button class="linkbtn" type="button" data-act="closecmp">${tr("Cerrar", "Close")}</button></div>`;
  h += `<div class="cmp-score"><b>${found.length}/${errs.length}</b><span>${errs.length ? (found.length === errs.length ? tr("¡Detectaste todos tus errores importantes!", "You spotted all your significant mistakes!") : tr("errores importantes detectados por vos", "significant mistakes spotted by you")) : tr("No cometiste errores importantes en esta partida.", "You made no significant mistakes in this game.")}</span></div>`;
  for (const k of marks) {
    const mk = rv.marks[k], x = a.info[k], B = a.evals[k];
    const best = B && B.best ? pvToSan(g.fens[k], [B.best], 1)[0] : "";
    const candBest = mk.cand && B && B.best && mk.cand.slice(0, 4) === B.best.slice(0, 4);
    h += `<div class="cmp-row"><button class="chip" type="button" data-act="go" data-ply="${k + 1}">${esc(moveLabel(g.fens[k], g.moves[k].san, g.moves[k].color))}</button>`
      + (x ? `<span class="glyph g-${x.c}">${CLS[x.c].g}</span><span class="small">${CLS[x.c].label}${x.c !== "best" && best ? `, ${tr("el motor prefería", "the engine preferred")} <b>${esc(best)}</b>` : ""}</span>` : "")
      + (x && ["best", "excellent", "good"].includes(x.c) && !mk.candSan ? `<p class="small muted">${tr("Acá dudaste, pero jugaste bien.", "You hesitated here, but you played well.")}</p>` : "")
      + (mk.note ? `<p class="small cmp-note">“${esc(mk.note)}”</p>` : "")
      + (mk.candSan ? `<p class="small">${tr("Tu alternativa", "Your alternative")} ${esc(mk.candSan)}: ${candBest ? `<b class="c-best">${tr("era la mejor jugada.", "was the best move.")}</b>` : best ? `${tr("el motor prefería", "the engine preferred")} ${esc(best)}.` : ""}</p>` : "") + `</div>`;
  }
  if (missed.length) h += `<p class="small"><b>${tr("No los marcaste:", "You didn't mark:")}</b> ${missed.map((o) => `<button class="chip" type="button" data-act="go" data-ply="${o.k + 1}"><span class="glyph g-${o.x.c}">${CLS[o.x.c].g}</span>${esc(moveLabel(g.fens[o.k], g.moves[o.k].san, g.moves[o.k].color))}</button>`).join(" ")}</p><p class="small muted">${tr("Esos son los momentos a mirar con más atención: no te diste cuenta del peligro.", "Those are the moments to look at most closely: you didn't sense the danger.")}</p>`;
  box.innerHTML = h;
}

/* ---------- la jugada actual ---------- */
function nodeLabel(n) { return moveLabel(n.parent.fen, n.san, n.color); }
function renderMoveCard() {
  const el = $("anMove"); const a = an(); const g = A.game;
  if (A.review) { reviewCard(el); return; }
  // Mientras escribís un comentario no se redibuja la tarjeta (el motor sigue trabajando de fondo).
  if (A.noteEdit != null && A.node && A.noteEdit !== A.node.id) A.noteEdit = null;
  if (A.noteEdit != null && document.activeElement && document.activeElement.id === "anNote") return;
  if (inVar()) {
    const n = A.node; const free = A.entry.free;
    el.innerHTML = `<div class="eyebrow">${free ? tr("Tu línea", "Your line") : tr("Estás explorando una variante", "You're exploring a variation")}</div>
      <div class="mh"><span class="san">${esc(nodeLabel(n))}</span></div>
      <p class="small muted">${tr("Seguí moviendo por los dos bandos: con la barra espaciadora se juega lo que recomienda el motor.", "Keep moving for both sides: the space bar plays whatever the engine recommends.")}</p>
      <div class="btn-row">${free ? `<button class="btn small primary" type="button" data-act="save-free">${tr("Guardar como partida", "Save as a game")}</button>` : `<button class="btn small" type="button" data-act="back">${tr("Volver a la partida", "Back to the game")}</button>`}<button class="btn small" type="button" data-act="delvar">${tr("Borrar esta variante", "Delete this variation")}</button></div>`;
    el.insertAdjacentHTML("beforeend", noteHtml(n));
    $("anVarInfo").textContent = free ? "" : tr("Variante", "Variation");
    return;
  }
  $("anVarInfo").textContent = "";
  const p = basePly();
  if (A.entry.free) {
    el.innerHTML = `<div class="eyebrow">${tr("Posición de partida", "Starting position")}</div><p>${tr("Mové las piezas para explorar. Si cargás una partida a mano, después la podés guardar para que se analice como las demás.", "Move the pieces to explore. If you enter a game by hand, you can save it afterwards so it gets analyzed like the rest.")}</p>`;
    return;
  }
  if (p === 0) {
    el.innerHTML = `<div class="eyebrow">${tr("Posición inicial", "Starting position")}</div><p>${tr("Recorré la partida con las flechas del teclado. En cualquier momento podés mover las piezas, tuyas o de tu rival, para probar otra idea: el motor la analiza en vivo y la variante queda guardada.", "Step through the game with the arrow keys. At any moment you can move the pieces, yours or your opponent's, to try another idea: the engine analyzes it live and the variation is saved.")}</p>${A.entry.analysis ? `<div class="btn-row"><button class="btn small" type="button" data-act="report">${tr("Leer la devolución de la partida", "Read the game report")}</button></div>` : ""}`;
    return;
  }
  const k = p - 1, m = g.moves[k], x = a && a.info[k];
  const who = m.color === "w" ? A.entry.white : A.entry.black;
  const uc = userColor();
  let h = `<div class="eyebrow nofig">${esc(who)}${uc === m.color ? ` (${tr("vos", "you")})` : ""}</div><div class="mh"><span class="san">${esc(moveLabel(g.fens[k], m.san, m.color))}</span>`;
  if (!x) { el.innerHTML = h + `<span class="muted">${tr("Analizando…", "Analyzing…")}</span></div>`; return; }
  // Dentro de la teoría de aperturas, una jugada correcta se muestra como "de libro" (los errores siguen siendo errores).
  const book = bookOf(g), theory = k < book.ply && ["best", "good", "inacc"].includes(x.c);
  h += theory ? `<span class="cl c-book">${tr("De libro", "Book move")}</span></div>` : `<span class="glyph g-${x.c}">${CLS[x.c].g}</span><span class="cl c-${x.c}">${CLS[x.c].label}</span></div>`;
  h += `<div class="ev">${tr("Evaluación", "Evaluation")} ${evalText(a.evals[k])} → ${evalText(a.evals[k + 1])}</div>`;
  const op = book.at[Math.min(k + 1, book.at.length - 1)];
  if (op && k < book.ply) h += `<div class="op-line nofig"><b>${esc(op.eco)}</b> ${esc(op.name)}</div>`;
  else if (book.ply && k === book.ply) h += `<div class="op-line nofig">${tr("Acá la partida salió de la teoría conocida", "This is where the game left known theory")} (<b>${esc(book.eco)}</b> ${esc(book.name)}).</div>`;
  const ex = explainMove(g, a, k, uc);
  if (ex) {
    if (ex.headline && ex.headline !== CLS[x.c].label) h += `<p><b>${esc(ex.headline)}.</b> ${esc(ex.paragraphs[0] || "")}</p>` + ex.paragraphs.slice(1).map((q) => `<p>${esc(q)}</p>`).join("");
    else h += ex.paragraphs.map((q) => `<p>${esc(q)}</p>`).join("");
    if (ex.line) h += `<div><div class="line-lbl"><span>${esc(ex.lineLabel)}</span><button class="linkbtn" type="button" data-act="showline" data-which="${ex.which || "best"}">${tr("Jugarla en el tablero", "Play it on the board")}</button></div><div class="line">${esc(ex.line)}</div></div>`;
    if (ex.alt) h += `<div><div class="line-lbl"><span>${esc(ex.alt.label)}</span><button class="linkbtn" type="button" data-act="showline" data-which="best">${tr("Jugarla en el tablero", "Play it on the board")}</button></div><div class="line">${esc(ex.alt.line)}</div></div>`;
    if (ex.tip) h += `<div class="tip"><b>${tr("Consejo:", "Tip:")}</b> ${esc(ex.tip)}</div>`;
  }
  if (store.settings.aiKey && !a.partial) {
    const key = A.entry.id + ":" + k; const cached = A.aiMove[key];
    h += `<div class="btn-row"><button class="btn small" type="button" data-act="ai" data-k="${k}">${cached ? tr("Volver a explicar con IA", "Explain again with AI") : tr("Explicar con IA", "Explain with AI")}</button></div>`;
    h += `<div id="anAiOut">${cached ? `<div class="ai-out">${md(cached)}</div>` : ""}</div>`;
  }
  el.innerHTML = h + noteHtml(A.node);
}

/* ---------- planilla ---------- */
const mvBtn = (n, lab) => `<button type="button" class="mv${n === A.node ? " cur" : ""}${n.comment ? " noted" : ""}" data-node="${n.id}"${n.comment ? ` title="${esc(n.comment)}"` : ""}>${esc(lab)}</button>`;
/** Una línea a partir del nodo `n`: la jugada, sus alternativas entre paréntesis (como en un libro) y la continuación. */
function seqHtml(n, force, alts) {
  let h = mvBtn(n, n.color === "w" || force ? nodeLabel(n) : n.san);
  for (const a of alts) h += `<span class="par">(</span>${seqHtml(a, true, [])}<span class="par">)</span>`;
  const [head, ...rest] = n.children;
  if (head) h += seqHtml(head, alts.length > 0, rest);
  return h;
}
const varHtml = (start) => seqHtml(start, true, []);
function renderMoves() {
  const g = A.game, a = an(); const box = $("anMoves"); const keepScroll = box.scrollTop;
  if (!g.moves.length) { // tablero libre: una sola línea con sus variantes
    const first = A.tree.root.children;
    box.innerHTML = first.length ? `<div class="free-line">${seqHtml(first[0], true, first.slice(1))}</div>` : `<p class="muted small" style="padding:10px 12px">${tr("Todavía no hay jugadas.", "No moves yet.")}</p>`;
    return;
  }
  const rows = [];
  const startBlack = g.moves[0].color === "b";
  let i = 0, n = +g.fens[0].split(" ")[5] || 1;
  const cur = A.node;
  const cell = (k) => {
    if (k == null || k >= g.moves.length) return "<td></td>";
    const x = a && a.info[k]; const node = A.tree.mainline[k + 1];
    const rvm = A.review && A.entry.selfReview && A.entry.selfReview.marks && A.entry.selfReview.marks[k];
    const gl = rvm ? `<span class="gl rv-flag" title="${tr("Marcaste este momento", "You marked this moment")}">●</span>` : x && ["inacc", "mistake", "blunder"].includes(x.c) ? `<span class="gl c-${x.c}">${CLS[x.c].g}</span>` : "";
    return `<td><button type="button" class="mv${cur === node ? " cur" : ""}${node.comment ? " noted" : ""}" data-node="${node.id}"${node.comment ? ` title="${esc(node.comment)}"` : ""}>${esc(g.moves[k].san)}${gl}</button></td>`;
  };
  // Variantes que salen de la posición previa a la jugada k (alternativas a esa jugada).
  const varsAt = (k) => (k != null && k < g.moves.length ? A.tree.mainline[k].children.filter((c) => c.main == null) : []);
  const varRow = (ks) => {
    const blocks = ks.flatMap((k) => varsAt(k)).map((v) => `<div class="var-block">${varHtml(v)}</div>`);
    return blocks.length ? `<tr class="var-row"><td colspan="3">${blocks.join("")}</td></tr>` : "";
  };
  if (startBlack) { rows.push(`<tr><td class="n">${n}.</td><td>…</td>${cell(0)}</tr>` + varRow([0])); i = 1; n++; }
  for (; i < g.moves.length; i += 2, n++) rows.push(`<tr><td class="n">${n}.</td>${cell(i)}${cell(i + 1)}</tr>` + varRow([i, i + 1]));
  // variantes que siguen después de la última jugada de la partida
  const tail = A.tree.mainline[g.moves.length].children;
  if (tail.length) rows.push(`<tr class="var-row"><td colspan="3">${tail.map((v) => `<div class="var-block">${varHtml(v)}</div>`).join("")}</td></tr>`);
  box.innerHTML = `<table><tbody>${rows.join("")}</tbody></table>`;
  // Solo se centra la jugada actual cuando cambió: si estás mirando otra parte de la planilla, no te la mueve.
  const c = box.querySelector(".mv.cur");
  if (c && scrolledFor !== cur) { const r = c.closest("tr"); const t = r.offsetTop - box.clientHeight / 2 + r.offsetHeight / 2; box.scrollTop = Math.max(0, t); scrolledFor = cur; }
  else box.scrollTop = keepScroll;
}
let scrolledFor = null;

// En la tabla, "Stockfish nivel 4" se corta: alcanza con "Stockfish" (el nombre completo queda en el título).
const colName = (n) => (/^Stockfish\b/.test(n || "") ? "Stockfish" : n);
function renderStats() {
  const e = A.entry, a = an();
  if (!a) { $("anStats").innerHTML = `<p class="muted small">${tr("Los números aparecen cuando termina el análisis.", "The numbers appear when the analysis finishes.")}</p>`; $("anKeys").innerHTML = ""; return; }
  const W = a.partial ? calcStats(A.game, a.info, "w") : e.analysis.stats?.w; const B = a.partial ? calcStats(A.game, a.info, "b") : e.analysis.stats?.b;
  const v = (o, k, d) => (o && o[k] != null ? (d != null ? o[k].toFixed(d) : o[k]) : "–");
  const row = (k, label) => `<div class="k"><span class="glyph g-${k}">${CLS[k].g}</span>${label}</div><div class="v">${v(W, k)}</div><div class="v">${v(B, k)}</div>`;
  $("anStats").innerHTML = `<div class="stats">
    <div></div><div class="h nofig" title="${esc(e.white)}">${esc(colName(e.white))}</div><div class="h nofig" title="${esc(e.black)}">${esc(colName(e.black))}</div>
    <div class="k">${tr("Precisión", "Accuracy")}</div><div class="big">${W ? W.acc.toFixed(0) + "%" : "–"}</div><div class="big">${B ? B.acc.toFixed(0) + "%" : "–"}</div>
    <div class="k">${tr("Pérdida media (centipeones)", "Average loss (centipawns)")}</div><div class="v">${v(W, "acpl", 0)}</div><div class="v">${v(B, "acpl", 0)}</div>
    ${row("best", tr("Mejores jugadas", "Best moves"))}${row("inacc", tr("Imprecisiones", "Inaccuracies"))}${row("mistake", tr("Errores", "Mistakes"))}${row("blunder", "Blunders")}
  </div>`;
  const keys = (a.info || []).map((x, k) => ({ x, k })).filter((o) => o.x && (o.x.c === "blunder" || o.x.c === "mistake"));
  $("anKeys").innerHTML = keys.length ? `<div class="eyebrow" style="width:100%">${tr("Momentos clave", "Key moments")}</div>` + keys.map((o) => `<button class="chip" type="button" data-go="${o.k + 1}"><span class="glyph g-${o.x.c}">${CLS[o.x.c].g}</span>${esc(moveLabel(A.game.fens[o.k], A.game.moves[o.k].san, A.game.moves[o.k].color))}</button>`).join("") : (a.partial ? "" : `<p class="muted small">${tr("Sin errores graves en esta partida.", "No serious mistakes in this game.")}</p>`);
}

/* ---------- más acciones: copiar, exportar, guardar ---------- */
function currentPgn(withVars = true) {
  const e = A.entry, g = A.game;
  const d = new Date(e.date || Date.now());
  const headers = e.free
    ? { Event: tr("Análisis", "Analysis"), Date: `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`, White: "?", Black: "?", Result: "*", ...g.headers }
    : { ...g.headers, White: g.headers.White || e.white, Black: g.headers.Black || e.black, Result: g.headers.Result || e.result || "*" };
  return toPgn(headers, A.tree, { vars: withVars, ...(e.free ? {} : analysisAnnotations(e.analysis)) });
}
async function copy(text, okMsg) {
  try { await window.api.copyText(text); toast(okMsg); } catch (err) { toast(tr("No pude copiar al portapapeles.", "Couldn't copy to the clipboard.")); }
}
export function copyFen() { if (A.tree) copy(curFen(), tr("Posición copiada (FEN).", "Position copied (FEN).")); }
export function copyPgn() { if (A.tree) copy(currentPgn(), tr("Partida copiada (PGN).", "Game copied (PGN).")); }
export async function exportPgn() {
  if (!A.tree) return;
  const e = A.entry;
  const name = (e.free ? tr("analisis", "analysis") : `${e.white} - ${e.black}`).replace(/[\\/:*?"<>|]/g, "_") + ".pgn";
  try { const r = await window.api.saveFile({ name, text: currentPgn(), kind: "pgn" }); if (r && r.saved) toast(tr("Partida exportada.", "Game exported.")); }
  catch (err) { toast(String(err.message || err)); }
}
/** Tablero libre: guarda la línea que está en el tablero como una partida más (y se analiza). */
function saveFree() {
  if (!A.entry || !A.entry.free) return;
  const end = lineEnd(A.node);
  if (!end.parent) { toast(tr("Jugá al menos una jugada para guardarla.", "Play at least one move to save it.")); return; }
  const path = pathTo(end).slice(1);
  const d = new Date();
  const headers = { Event: tr("Partida cargada a mano", "Game entered by hand"), Date: `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`, White: tr("Blancas", "White"), Black: tr("Negras", "Black"), Result: "*", ...A.game.headers };
  // Solo la línea que está a la vista: es la partida. Las demás ramas no se guardan.
  const line = { root: { ...A.tree.root, children: [] } };
  let cur = line.root; for (const n of path) { const c = { ...n, children: [] }; cur.children = [c]; cur = c; }
  const pgn = toPgn(headers, line, { vars: false });
  let entry;
  try { entry = entryFromPgn(pgn, { id: "man-" + Date.now(), source: "pgn" }); } catch (err) { toast(err.message); return; }
  entry.date = Date.now();
  addGames([entry]); enqueueAnalysis(entry.id, true);
  toast(tr("Guardada en Partidas. Se está analizando.", "Saved to Games. It's being analyzed."));
  openAnalysis(entry.id, path.length);
}
function moreMenu(anchor) {
  if (!A.entry) return;
  const free = !!A.entry.free, vars = A.tree && hasVariations(A.tree);
  popMenu(anchor, [
    { label: tr("Copiar la posición (FEN)", "Copy position (FEN)"), kbd: "⌘⇧C", run: copyFen },
    { label: tr("Copiar la partida (PGN)", "Copy game (PGN)"), run: copyPgn },
    { label: tr("Exportar a un archivo PGN…", "Export to a PGN file…"), kbd: "⌘S", run: exportPgn },
    "-",
    { label: tr("Jugar contra Stockfish desde acá", "Play Stockfish from here"), run: () => hooks.onPlayFrom(curFen(), A.orient === "white" ? "w" : "b") },
    !free && { label: tr("Entrenar los errores de esta partida", "Train this game's mistakes"), run: () => hooks.onTrain(A.entry.id) },
    !free && { label: tr("Cambiar con qué color jugué", "Change which color I played"), run: () => { A.showMe = true; renderPanel(); } },
    !free && { label: tr("Volver a analizar en profundidad", "Re-analyze at high depth"), run: () => { reanalyse(A.entry.id, "profunda"); toast(tr("Reanalizando con profundidad alta…", "Re-analyzing at high depth…")); } },
    free && { label: tr("Guardar como partida", "Save as a game"), run: saveFree },
    "-",
    !free && vars && { label: tr("Borrar todas las variantes", "Delete all variations"), danger: true, run: () => { clearVariations(A.tree); persistVars(); goNode(baseOf(A.node), false); } },
    !free && { label: tr("Quitar esta partida de la lista", "Remove this game from the list"), danger: true, run: () => { const id = A.entry.id; stopLive(); A.entry = null; A.tree = null; A.game = null; $("anContent").hidden = true; $("anEmpty").hidden = false; removeGame(id); hooks.goView("library"); } }
  ].filter(Boolean));
}
void movetext;

/* ---------- IA ---------- */
function aiErr(e) { return String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ""); }
async function aiExplain(k) {
  const a = an(); if (!a || a.partial) return;
  const key = A.entry.id + ":" + k; const out = $("anAiOut"); if (!out) return;
  out.innerHTML = `<div class="ai-out"><p class="thinking">${tr("Pensando…", "Thinking…")}</p></div>`;
  const x = a.info[k];
  const good = ["best", "excellent", "good"].includes(x.c);
  const prompt = `Sos un entrenador de ajedrez que explica en español rioplatense (voseo), claro, cálido y concreto, para un jugador de club.
Estos datos los calculó Stockfish 18; confiá en ellos. No inventes variantes que no aparezcan acá ni nombres jugadas que no estén en estas líneas o en la partida.

${aiContext(A.game, a, k, userColor())}

${good ? "Explicá en 3 o 4 oraciones por qué la jugada es buena: qué logra o qué amenaza, y qué idea general enseña." : "Explicá en 3 a 5 oraciones cuál es el problema concreto de la jugada (qué deja colgado, qué táctica permite, qué plan abandona), por qué la del motor es mejor y qué idea general conviene recordar."}
Después, en una línea aparte que empiece con **Consejo:**, dá un hábito práctico para la próxima partida.
Sin títulos ni listas, sin repetir la FEN, sin hablar de porcentajes.`;
  const promptEn = `You are a chess coach explaining in clear, warm, concrete English for a club player.
This data was computed by Stockfish 18; trust it. Don't invent variations that don't appear here or mention moves that aren't in these lines or in the game.

${aiContext(A.game, a, k, userColor())}

${good ? "In 3 or 4 sentences, explain why the move is good: what it achieves or threatens, and what general idea it teaches." : "In 3 to 5 sentences, explain the concrete problem with the move (what it leaves hanging, what tactic it allows, what plan it abandons), why the engine's move is better, and what general idea to remember."}
Then, on a separate line starting with **Tip:**, give a practical habit for the next game.
No headings or lists, don't repeat the FEN, don't talk about percentages.`;
  try {
    const text = await window.api.aiAsk({ prompt: EN ? promptEn : prompt, key: store.settings.aiKey, model: store.settings.aiModel });
    A.aiMove[key] = text;
    if (basePly() === k + 1 && !inVar() && $("anAiOut")) $("anAiOut").innerHTML = `<div class="ai-out">${md(text)}</div>`;
  } catch (e) {
    if ($("anAiOut")) $("anAiOut").innerHTML = `<p class="err small">${esc(aiErr(e))}</p>`;
  }
}
async function aiSummary() {
  const e = A.entry, a = an(); if (!e || !a || a.partial) return;
  const btn = $("anAiSum"); btn.disabled = true;
  const out = $("anAiSumOut"); out.innerHTML = `<div class="ai-out"><p class="thinking">${tr("Pensando…", "Thinking…")}</p></div>`;
  const g = A.game; const uc = userColor();
  const ann = g.moves.map((m, k) => {
    const x = a.info[k]; let s = (m.color === "w" ? (+g.fens[k].split(" ")[5]) + ". " : "") + m.san;
    if (x && ["inacc", "mistake", "blunder"].includes(x.c)) { const bs = a.evals[k].best ? pvToSan(g.fens[k], [a.evals[k].best], 1)[0] : ""; s += ` {${CLS[x.c].label}; eval ${evalText(a.evals[k])}→${evalText(a.evals[k + 1])}; ${tr("mejor", "best")} ${bs}}`; }
    return s;
  }).join(" ");
  const W = e.analysis.stats.w, B = e.analysis.stats.b;
  let ctx = ""; try { ctx = reportText(gameReport(e, g, uc)); } catch (err) {}
  const prompt = `Sos un entrenador de ajedrez. Escribí en español rioplatense (voseo), concreto y alentador.
${uc ? `La persona que consulta jugó con ${uc === "w" ? "Blancas" : "Negras"} (${uc === "w" ? e.white : e.black}).` : "No sabemos con qué color jugó la persona que consulta; hablale a ambos lados por igual."} Resultado: ${e.result || "desconocido"}.

Partida anotada con el análisis de Stockfish 18 (no inventes jugadas ni variantes que no estén acá):
${ann}

Estadísticas:
- Blancas (${e.white}${e.whiteElo ? ", " + e.whiteElo : ""}): precisión ${W.acc.toFixed(0)}%, pérdida media ${W.acpl.toFixed(0)} cp, ${W.inacc} imprecisiones, ${W.mistake} errores, ${W.blunder} blunders.
- Negras (${e.black}${e.blackElo ? ", " + e.blackElo : ""}): precisión ${B.acc.toFixed(0)}%, pérdida media ${B.acpl.toFixed(0)} cp, ${B.inacc} imprecisiones, ${B.mistake} errores, ${B.blunder} blunders.

Resumen automático de la partida y comparación con las otras partidas recientes de esta persona (usalo como contexto, no lo repitas textual):
${ctx || "(sin datos)"}

Usá este formato (títulos con ###, viñetas con "- "):
### Cómo fue la partida
2 o 3 oraciones.
### Momentos clave
3 viñetas con el número de jugada y qué pasó.
### En contexto
2 o 3 oraciones que relacionen esta partida con cómo viene jugando esta persona (sus errores repetidos, su tendencia).
### Qué entrenar
3 viñetas con recomendaciones concretas basadas en los errores.`;
  const promptEn = `You are a chess coach. Write in concrete, encouraging English.
${uc ? `The person asking played ${uc === "w" ? "White" : "Black"} (${uc === "w" ? e.white : e.black}).` : "We don't know which color the person asking played; address both sides equally."} Result: ${e.result || "unknown"}.

Game annotated with Stockfish 18's analysis (don't invent moves or variations that aren't here):
${ann}

Statistics:
- White (${e.white}${e.whiteElo ? ", " + e.whiteElo : ""}): accuracy ${W.acc.toFixed(0)}%, average loss ${W.acpl.toFixed(0)} cp, ${W.inacc} inaccuracies, ${W.mistake} mistakes, ${W.blunder} blunders.
- Black (${e.black}${e.blackElo ? ", " + e.blackElo : ""}): accuracy ${B.acc.toFixed(0)}%, average loss ${B.acpl.toFixed(0)} cp, ${B.inacc} inaccuracies, ${B.mistake} mistakes, ${B.blunder} blunders.

Automatic summary of the game and comparison with this person's other recent games (use it as context, don't repeat it verbatim):
${ctx || "(no data)"}

Use this format (headings with ###, bullets with "- "):
### How the game went
2 or 3 sentences.
### Key moments
3 bullets with the move number and what happened.
### In context
2 or 3 sentences relating this game to how this person has been playing (their repeated mistakes, their trend).
### What to train
3 bullets with concrete recommendations based on the mistakes.`;
  try {
    const text = await window.api.aiAsk({ prompt: EN ? promptEn : prompt, key: store.settings.aiKey, model: store.settings.aiModel, maxTokens: 1300 });
    A.aiSum[e.id] = text;
    if (A.entry === e) out.innerHTML = `<div class="ai-out">${md(text)}</div>`;
  } catch (err) { out.innerHTML = `<p class="err small">${esc(aiErr(err))}</p>`; }
  finally { btn.disabled = false; }
}
