import { tr, EN } from "../i18n.js";
import { store, on, emit, findEntry, gameOf, progress, enqueueAnalysis, detectUserColor, saveLibrary, engines, ensureEngines, reanalyse, logActivity } from "../state.js";
import { Chess, tryMove, uciOf, pvToSan, numberedLine, moveLabel, wp, toCp, evalText, scoreFromInfo, headerName } from "../chess-util.js";
import { CLS, stats as calcStats } from "../analysis.js";
import { explainMove, aiContext } from "../explain.js";
import { makeBoard, syncBoard, arrow } from "../board.js";
import { $, esc, md, toast, fmtDate, playerStrip } from "../ui.js";

const A = { entry: null, game: null, ply: 0, orient: "white", showArrow: true, variation: null, liveJob: null, live: null, aiMove: {}, aiSum: {}, cg: null, review: false, compare: false };
let hooks = {};

export function initAnalysis(h) {
  hooks = h;
  A.cg = makeBoard($("anBoard"), { events: { move: onBoardMove } });
  $("anFirst").onclick = () => nav("first");
  $("anPrev").onclick = () => nav("prev");
  $("anNext").onclick = () => nav("next");
  $("anLast").onclick = () => nav("last");
  $("anFlip").onclick = flip;
  $("anArrow").onclick = () => { A.showArrow = !A.showArrow; $("anArrow").classList.toggle("on", A.showArrow); renderBoard(); };
  $("anPlayHere").onclick = () => { if (A.game) hooks.onPlayFrom(curFen(), A.orient === "white" ? "w" : "b"); };
  $("anTrain").onclick = () => { if (A.entry) hooks.onTrain(A.entry.id); };
  $("anAiSum").onclick = aiSummary;
  $("anMoves").addEventListener("click", (e) => {
    const b = e.target.closest("[data-go]"); if (b) { exitVariation(false); goTo(+b.dataset.go); return; }
    const v = e.target.closest("[data-vgo]"); if (v && A.variation) { A.variation.idx = +v.dataset.vgo; afterVarChange(); }
  });
  $("anKeys").addEventListener("click", (e) => { const b = e.target.closest("[data-go]"); if (b) { exitVariation(false); goTo(+b.dataset.go); } });
  $("anMove").addEventListener("input", (e) => {
    if (e.target.id !== "anRvNote" || !A.review) return;
    const rv = reviewData(); const mk = rv.marks[A.ply]; if (!mk) return;
    mk.note = e.target.value; saveLibrary();
  });
  $("anReviewBtn").onclick = () => { if (A.entry) { A.review = true; A.compare = false; exitVariation(false); stopLive(); renderAll(); } };
  $("anCmp").addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    if (t.dataset.act === "go") { exitVariation(false); goTo(+t.dataset.ply); }
    else if (t.dataset.act === "closecmp") { A.compare = false; renderPanel(); }
  });
  $("anMove").addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    if (t.dataset.act === "rv-mark") { const rv = reviewData(); rv.marks[A.ply] = rv.marks[A.ply] || { note: "", cand: null, candSan: "" }; saveLibrary(); renderMoveCard(); const n = $("anRvNote"); if (n) n.focus(); return; }
    if (t.dataset.act === "rv-unmark") { const rv = reviewData(); delete rv.marks[A.ply]; saveLibrary(); renderMoveCard(); renderMoves(); return; }
    if (t.dataset.act === "rv-go") { goTo(+t.dataset.ply); return; }
    if (t.dataset.act === "rv-finish") { finishReview(); return; }
    if (t.dataset.act === "rv-skip") { const rv = reviewData(); rv.skipped = true; saveLibrary(); A.review = false; renderAll(); return; }
    if (t.dataset.act === "ai") aiExplain(+t.dataset.k);
    else if (t.dataset.act === "showline") showLine(t.dataset.which);
    else if (t.dataset.act === "back") exitVariation(true);
    else if (t.dataset.act === "reanalyse") { reanalyse(A.entry.id, "profunda"); toast(tr("Reanalizando con profundidad alta…", "Re-analyzing at high depth…")); }
  });
  initGraph();
  $("anMe").addEventListener("click", (e) => {
    const b = e.target.closest(".seg-btn"); if (!b || !A.entry) return;
    A.entry.userColor = b.dataset.c === "x" ? "none" : b.dataset.c;
    saveLibrary(); emit("library");
    renderStrips(); renderMeRow();
  });
  on("progress", (p) => { if (A.entry && (p.id === A.entry.id || !p.id)) { renderBoard(); renderPanel(); } });
  on("analysed", (id) => { if (A.entry && id === A.entry.id) { renderAll(); } });
  window.__mesaAnalysis = { state: () => ({ id: A.entry && A.entry.id, ply: A.ply, review: A.review, compare: A.compare, marks: A.entry && A.entry.selfReview ? A.entry.selfReview.marks : null }), move: (o, d) => onBoardMove(o, d), go: (p) => goTo(p) };
}

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
  Object.assign(A, { entry: e, game, variation: null, live: null });
  A.ply = ply != null ? ply : 0;
  A.review = opts.review ? true : ply == null && shouldReview(e);
  A.compare = false;
  const uc = detectUserColor(e);
  A.orient = uc === "b" ? "black" : "white";
  if (!e.analysis) enqueueAnalysis(id, true);
  $("anEmpty").hidden = true; $("anContent").hidden = false;
  renderAll();
}
export function currentEntryId() { return A.entry ? A.entry.id : null; }
/** Al salir de Análisis: frena el motor en vivo para no gastar CPU de fondo. */
export function leaveAnalysis() { stopLive(); }
function renderMeRow() {
  if (!A.entry) return;
  const uc = A.entry.userColor === "none" ? "x" : detectUserColor(A.entry) || "";
  $("anMe").querySelectorAll(".seg-btn").forEach((x) => x.classList.toggle("on", x.dataset.c === uc));
}
export function onShow() { renderAll(); }

/* ---------- datos ---------- */
// En la revisión propia el motor queda oculto: nada que venga del análisis se muestra.
function an() { return A.review ? null : realAn(); }
function realAn() {
  if (!A.entry) return null;
  if (A.entry.analysis) return A.entry.analysis;
  if (progress.id === A.entry.id && progress.evals) return { evals: progress.evals, info: progress.info, partial: true };
  return null;
}
function curFen() {
  const v = A.variation;
  if (v) return v.idx > 0 ? v.moves[v.idx - 1].fen : A.game.fens[v.base];
  return A.game.fens[A.ply];
}
function curLast() {
  const v = A.variation;
  if (v && v.idx > 0) { const m = v.moves[v.idx - 1]; return [m.from, m.to]; }
  const p = v ? v.base : A.ply;
  if (p > 0) { const m = A.game.moves[p - 1]; return [m.from, m.to]; }
  return undefined;
}
const userColor = () => (A.entry ? detectUserColor(A.entry) : null);

/* ---------- navegación ---------- */
function goTo(p, sound = true) {
  if (!A.game) return;
  const np = Math.max(0, Math.min(A.game.fens.length - 1, p));
  const forward = np === A.ply + 1;
  A.ply = np;
  renderBoard(forward && sound ? soundFor(A.game.moves[np - 1]) : null);
  renderPanel();
}
function nav(where) {
  if (!A.game) return;
  const v = A.variation;
  if (v) {
    if (where === "prev") { if (v.idx > 0) { v.idx--; afterVarChange(); } else exitVariation(true); }
    else if (where === "next") { if (v.idx < v.moves.length) { v.idx++; afterVarChange(true); } }
    else if (where === "first") { exitVariation(false); goTo(0); }
    else if (where === "last") { v.idx = v.moves.length; afterVarChange(); }
    return;
  }
  if (where === "first") goTo(0);
  else if (where === "prev") goTo(A.ply - 1);
  else if (where === "next") goTo(A.ply + 1);
  else goTo(A.game.fens.length - 1);
}
function flip() { A.orient = A.orient === "white" ? "black" : "white"; renderBoard(); renderStrips(); }
export function analysisKey(e) {
  if (e.key === "ArrowLeft") { nav("prev"); return true; }
  if (e.key === "ArrowRight") { nav("next"); return true; }
  if (e.key === "Home") { nav("first"); return true; }
  if (e.key === "End") { nav("last"); return true; }
  if (e.key === "f" || e.key === "F") { flip(); return true; }
  if (e.key === "Escape" && A.variation) { exitVariation(true); return true; }
  return false;
}
function soundFor(m) { return m ? { captured: !!m.captured, check: m.san.includes("+") || m.san.includes("#") } : null; }

/* ---------- variantes ---------- */
function onBoardMove(orig, dest) {
  if (!A.game) return;
  if (A.review) { recordCandidate(orig, dest); return; }
  const c = new Chess(curFen());
  const piece = c.get(orig);
  const promo = piece && piece.type === "p" && (dest[1] === "8" || dest[1] === "1") ? "q" : undefined;
  const m = tryMove(c, { from: orig, to: dest, promotion: promo });
  if (!m) { renderBoard(); return; }
  const uci = uciOf(m);
  const snd = { captured: !!m.captured, check: m.san.includes("+") || m.san.includes("#") };
  if (!A.variation && A.ply < A.game.moves.length && A.game.moves[A.ply].uci === uci) { goTo(A.ply + 1); return; }
  if (A.variation && A.variation.idx < A.variation.moves.length && A.variation.moves[A.variation.idx].uci === uci) { A.variation.idx++; afterVarChange(true); return; }
  if (!A.variation) A.variation = { base: A.ply, moves: [], idx: 0 };
  const v = A.variation;
  v.moves = v.moves.slice(0, v.idx);
  v.moves.push({ uci, san: m.san, fen: c.fen(), from: m.from, to: m.to, captured: !!m.captured });
  v.idx = v.moves.length;
  afterVarChange(false, snd);
}
function afterVarChange(forward = false, snd = null) {
  const v = A.variation;
  if (forward && !snd && v.idx > 0) { const m = v.moves[v.idx - 1]; snd = { captured: m.captured, check: m.san.includes("+") }; }
  A.live = null;
  renderBoard(snd); renderPanel();
  startLive();
}
function exitVariation(render = true) {
  if (!A.variation) return;
  const base = A.variation.base;
  A.variation = null; stopLive(); A.live = null;
  A.ply = base;
  if (render) { renderBoard(); renderPanel(); }
}
function showLine(which) {
  const a = an(); if (!a || !A.game) return;
  const k = A.ply - 1; if (k < 0) return;
  let base, pv;
  if (which === "best") { base = k; pv = a.evals[k]?.pv || []; }
  else if (which === "reply") { base = k + 1; pv = a.evals[k + 1]?.pv || []; }
  else { base = k; pv = [A.game.moves[k].uci, ...(a.evals[k + 1]?.pv || [])]; }
  const c = new Chess(A.game.fens[base]); const moves = [];
  for (const u of pv.slice(0, 10)) { const m = tryMove(c, u); if (!m) break; moves.push({ uci: uciOf(m), san: m.san, fen: c.fen(), from: m.from, to: m.to, captured: !!m.captured }); }
  if (!moves.length) return;
  A.variation = { base, moves, idx: 1 };
  afterVarChange(true);
}

/* ---------- motor en vivo (variantes) ---------- */
function stopLive() { if (A.liveJob) { A.liveJob.cancel(); A.liveJob = null; } }
let liveThrottle = 0;
async function startLive() {
  stopLive();
  const fen = curFen();
  const c = new Chess(fen);
  if (c.isGameOver()) { A.live = { done: true, over: c.isCheckmate() ? (c.turn() === "w" ? -1500 : 1500) : 0 }; renderLive(); renderEvalBar(); return; }
  if (!engines.live.ready) { await ensureEngines(); if (!engines.live.ready || curFen() !== fen) return; }
  engines.live.configure({ MultiPV: 3 });
  const job = engines.live.search(fen, "depth 26 movetime 10000", (info, multi) => {
    const now = performance.now(); if (now - liveThrottle < 120) return; liveThrottle = now;
    A.live = { fen, lines: Object.values(multi).sort((a, b) => a.multipv - b.multipv) };
    renderLive(); renderEvalBar(); renderBoardShapes();
  });
  A.liveJob = job;
  const r = await job.promise;
  if (A.liveJob === job && r && r.lines) { A.live = { fen, lines: r.lines }; renderLive(); renderEvalBar(); renderBoardShapes(); }
}

/* ---------- render ---------- */
function renderAll() { renderBoard(); renderStrips(); renderPanel(); }

function currentShapes() {
  const shapes = [];
  if (!A.game) return shapes;
  if (A.variation) {
    if (A.showArrow && A.live && A.live.lines && A.live.lines[0] && A.live.fen === curFen()) {
      A.live.lines.slice(0, 2).forEach((l, i) => { if (l.pv[0]) shapes.push(arrow(l.pv[0], i === 0 ? "paleGreen" : "paleBlue")); });
    }
    return shapes;
  }
  const a = an();
  if (a && A.showArrow && a.evals[A.ply] && a.evals[A.ply].best) shapes.push(arrow(a.evals[A.ply].best, "paleGreen"));
  if (a && A.ply > 0 && a.info[A.ply - 1]) {
    const x = a.info[A.ply - 1], m = A.game.moves[A.ply - 1];
    if (["inacc", "mistake", "blunder", "best"].includes(x.c)) {
      const color = { inacc: "var(--inacc)", mistake: "var(--mistake)", blunder: "var(--blunder)", best: "var(--best)" }[x.c];
      shapes.push({ orig: m.to, customSvg: { html: `<g transform="translate(66 4)"><circle cx="15" cy="15" r="15" style="fill:${color}" stroke="#fff" stroke-width="2.5"/><text x="15" y="20.5" font-size="15" text-anchor="middle" fill="#fff" font-weight="700" font-family="-apple-system,Helvetica,sans-serif">${CLS[x.c].g}</text></g>` } });
    }
  }
  return shapes;
}
function renderBoardShapes() { if (!visible()) return; try { A.cg.setAutoShapes(currentShapes()); } catch (e) {} }
const visible = () => !$("view-analysis").hidden;
function renderBoard(sound) {
  if (!A.game || !visible()) return;
  const c = new Chess(curFen());
  syncBoard(A.cg, c, { orientation: A.orient, lastMove: curLast(), movable: true, shapes: currentShapes(), sound });
  renderEvalBar();
  const v = A.variation;
  $("anPrev").disabled = !v && A.ply === 0; $("anFirst").disabled = !v && A.ply === 0;
  $("anNext").disabled = v ? v.idx >= v.moves.length : A.ply >= A.game.fens.length - 1;
  $("anLast").disabled = $("anNext").disabled;
}
function curScore() {
  if (A.variation) {
    if (A.live && A.live.done) return { done: A.live.over };
    if (A.live && A.live.lines && A.live.lines[0] && A.live.fen === curFen()) return scoreFromInfo(A.live.lines[0], A.live.fen);
    return null;
  }
  const a = an(); return a ? a.evals[A.ply] : null;
}
function renderEvalBar() {
  const bar = $("anBar"); const s = curScore();
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
function renderStrips() {
  if (!A.entry) return;
  const e = A.entry, uc = userColor(), a = an();
  const sw = a && !a.partial ? e.analysis.stats?.w : null, sb = a && !a.partial ? e.analysis.stats?.b : null;
  const w = playerStrip(e.white, e.whiteElo, "w", uc === "w", sw ? `${tr("Precisión", "Accuracy")} ${sw.acc.toFixed(0)}%` : "");
  const b = playerStrip(e.black, e.blackElo, "b", uc === "b", sb ? `${tr("Precisión", "Accuracy")} ${sb.acc.toFixed(0)}%` : "");
  $("anTop").innerHTML = A.orient === "white" ? b : w;
  $("anBot").innerHTML = A.orient === "white" ? w : b;
}

function renderPanel() {
  if (!A.entry || !visible()) return;
  const e = A.entry, a = an();
  $("anTitle").innerHTML = `<b>${esc(e.white)} – ${esc(e.black)}</b><span>${esc(e.result || "")} · ${fmtDate(e.date)}${e.url ? ` · <a data-url="${esc(e.url)}">${tr("ver original", "view original")}</a>` : ""}</span>`;
  const lnk = $("anTitle").querySelector("a[data-url]"); if (lnk) lnk.onclick = () => window.api.openExternal(lnk.dataset.url);
  const prog = $("anProg");
  if (!e.analysis) {
    prog.hidden = false;
    const pct = progress.id === e.id && progress.n ? (progress.i / progress.n) * 100 : 0;
    prog.querySelector(".progress-bar").style.width = pct.toFixed(1) + "%";
    prog.querySelector(".progress-txt").textContent = progress.id === e.id ? `${tr("Analizando", "Analyzing")} ${progress.i}/${progress.n}` : tr("En cola para analizar…", "Queued for analysis…");
  } else prog.hidden = true;
  renderGraph(); renderMoveCard(); renderMoves(); renderStats(); renderStrips(); renderMeRow(); renderCompare();
  $("anReviewBtn").hidden = A.review || !userColor();
  $("anReviewBtn").textContent = e.selfReview && e.selfReview.done ? tr("Revisar de nuevo", "Review again") : tr("Revisión propia", "Self-review");
  $("anContent").classList.toggle("reviewing", A.review);
  $("anAiSum").hidden = !(store.settings.aiKey && e.analysis);
  const out = $("anAiSumOut"); const cached = A.aiSum[e.id];
  out.innerHTML = cached ? `<div class="ai-out">${md(cached)}</div>` : "";
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
  const cx = X(A.variation ? A.variation.base : A.ply);
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
  svg.addEventListener("click", (ev) => { if (A.game) { exitVariation(false); goTo(idxAt(ev)); } });
}

function renderLive() {
  const box = $("anLive"); if (!box || !A.variation) return;
  if (A.live && A.live.done) { box.innerHTML = `<p class="muted small">${tr("Partida terminada en esta línea.", "Game over in this line.")}</p>`; return; }
  if (!A.live || !A.live.lines || A.live.fen !== curFen()) { box.innerHTML = `<p class="thinking small">${tr("Calculando…", "Calculating…")}</p>`; return; }
  const fen = A.live.fen;
  box.innerHTML = A.live.lines.map((l) => `<div class="live-line"><b>${evalText(scoreFromInfo(l, fen))}</b><span>${esc(numberedLine(fen, pvToSan(fen, l.pv, 8)))}</span></div>`).join("") + `<div class="muted small">${tr("Profundidad", "Depth")} ${A.live.lines[0].depth}</div>`;
}

/* ---------- revisión propia ---------- */
function recordCandidate(orig, dest) {
  const g = A.game, p = A.ply, uc = userColor();
  const c = new Chess(g.fens[p]);
  if (c.turn() !== uc || p >= g.moves.length) { renderBoard(); return; }
  const piece = c.get(orig);
  const promo = piece && piece.type === "p" && (dest[1] === "8" || dest[1] === "1") ? "q" : undefined;
  const m = tryMove(c, { from: orig, to: dest, promotion: promo });
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
  A.review = false; A.compare = true;
  emit("library");
  renderAll();
}
function reviewCard(el) {
  const g = A.game, p = A.ply, uc = userColor(), rv = reviewData();
  const marks = Object.keys(rv.marks).map(Number).sort((a, b) => a - b);
  const myTurn = p < g.moves.length && g.fens[p].split(" ")[1] === uc;
  const mk = rv.marks[p];
  let h = `<div class="eyebrow">${tr("Revisión propia · el motor está oculto", "Self-review · engine hidden")}</div>`;
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
  if (!a) { box.innerHTML = `<div class="card-head"><h3>${tr("Tu revisión vs. Stockfish", "Your review vs. Stockfish")}</h3></div><p class="thinking small">${tr("Esperando que termine el análisis…", "Waiting for the analysis to finish…")}</p>`; return; }
  const marks = Object.keys(rv.marks || {}).map(Number).sort((x, y) => x - y);
  const errs = a.info.map((x, k) => ({ x, k })).filter((o) => o.x && g.moves[o.k].color === uc && (o.x.c === "mistake" || o.x.c === "blunder"));
  const found = errs.filter((o) => marks.includes(o.k));
  const missed = errs.filter((o) => !marks.includes(o.k));
  let h = `<div class="card-head"><h3>${tr("Tu revisión vs. Stockfish", "Your review vs. Stockfish")}</h3><button class="linkbtn" type="button" data-act="closecmp">${tr("Cerrar", "Close")}</button></div>`;
  h += `<div class="cmp-score"><b>${found.length}/${errs.length}</b><span>${errs.length ? (found.length === errs.length ? tr("¡Detectaste todos tus errores importantes!", "You spotted all your significant mistakes!") : tr("errores importantes detectados por vos", "significant mistakes spotted by you")) : tr("No cometiste errores importantes en esta partida.", "You made no significant mistakes in this game.")}</span></div>`;
  for (const k of marks) {
    const mk = rv.marks[k], x = a.info[k], B = a.evals[k];
    const best = B && B.best ? pvToSan(g.fens[k], [B.best], 1)[0] : "";
    const candBest = mk.cand && B && B.best && mk.cand.slice(0, 4) === B.best.slice(0, 4);
    h += `<div class="cmp-row"><button class="chip" type="button" data-act="go" data-ply="${k + 1}">${esc(moveLabel(g.fens[k], g.moves[k].san, g.moves[k].color))}</button>`
      + (x ? `<span class="glyph g-${x.c}">${CLS[x.c].g}</span><span class="small">${CLS[x.c].label}${x.c !== "best" && best ? ` · ${tr("el motor prefería", "the engine preferred")} <b>${esc(best)}</b>` : ""}</span>` : "")
      + (x && ["best", "excellent", "good"].includes(x.c) && !mk.candSan ? `<p class="small muted">${tr("Acá dudaste, pero jugaste bien.", "You hesitated here, but you played well.")}</p>` : "")
      + (mk.note ? `<p class="small cmp-note">“${esc(mk.note)}”</p>` : "")
      + (mk.candSan ? `<p class="small">${tr("Tu alternativa", "Your alternative")} ${esc(mk.candSan)}: ${candBest ? `<b class="c-best">${tr("era la mejor jugada.", "was the best move.")}</b>` : best ? `${tr("el motor prefería", "the engine preferred")} ${esc(best)}.` : ""}</p>` : "") + `</div>`;
  }
  if (missed.length) h += `<p class="small"><b>${tr("No los marcaste:", "You didn't mark:")}</b> ${missed.map((o) => `<button class="chip" type="button" data-act="go" data-ply="${o.k + 1}"><span class="glyph g-${o.x.c}">${CLS[o.x.c].g}</span>${esc(moveLabel(g.fens[o.k], g.moves[o.k].san, g.moves[o.k].color))}</button>`).join(" ")}</p><p class="small muted">${tr("Esos son los momentos a mirar con más atención: no te diste cuenta del peligro.", "Those are the moments to look at most closely: you didn't sense the danger.")}</p>`;
  box.innerHTML = h;
}

function renderMoveCard() {
  const el = $("anMove"); const a = an(); const g = A.game;
  if (A.review) { reviewCard(el); return; }
  if (A.variation) {
    const v = A.variation;
    const label = v.idx > 0 ? (() => { const fenBefore = v.idx > 1 ? v.moves[v.idx - 2].fen : g.fens[v.base]; return moveLabel(fenBefore, v.moves[v.idx - 1].san, fenBefore.split(" ")[1]); })() : tr("Posición de la partida", "Game position");
    el.innerHTML = `<div class="eyebrow">${tr("Explorando una variante", "Exploring a variation")}</div>
      <div class="mh"><span class="san">${esc(label)}</span></div>
      <div id="anLive" class="live-lines"></div>
      <div class="btn-row"><button class="btn small" type="button" data-act="back">${tr("Volver a la partida", "Back to the game")}</button><span class="muted small">${tr("Mové las piezas para seguir probando.", "Move the pieces to keep exploring.")}</span></div>`;
    renderLive();
    $("anVarInfo").textContent = tr("Variante", "Variation");
    return;
  }
  $("anVarInfo").textContent = "";
  if (A.ply === 0) {
    el.innerHTML = `<div class="eyebrow">${tr("Posición inicial", "Starting position")}</div><p>${tr("Recorré la partida con las flechas del teclado o tocando una jugada. Podés mover las piezas en cualquier momento para probar otras ideas: el motor las analiza en vivo.", "Step through the game with the arrow keys or by clicking a move. You can move the pieces at any time to try other ideas: the engine analyzes them live.")}</p>`;
    return;
  }
  const k = A.ply - 1, m = g.moves[k], x = a && a.info[k];
  const who = m.color === "w" ? A.entry.white : A.entry.black;
  const uc = userColor();
  let h = `<div class="eyebrow">${esc(who)}${uc === m.color ? ` · ${tr("vos", "you")}` : ""}</div><div class="mh"><span class="san">${esc(moveLabel(g.fens[k], m.san, m.color))}</span>`;
  if (!x) { el.innerHTML = h + `<span class="muted">${tr("Analizando…", "Analyzing…")}</span></div>`; return; }
  h += `<span class="glyph g-${x.c}">${CLS[x.c].g}</span><span class="cl c-${x.c}">${CLS[x.c].label}</span></div>`;
  h += `<div class="ev">${tr("Evaluación", "Evaluation")} ${evalText(a.evals[k])} → ${evalText(a.evals[k + 1])}</div>`;
  const ex = explainMove(g, a, k, uc);
  if (ex) {
    if (ex.headline && ex.headline !== CLS[x.c].label) h += `<p><b>${esc(ex.headline)}.</b> ${esc(ex.paragraphs[0] || "")}</p>` + ex.paragraphs.slice(1).map((p) => `<p>${esc(p)}</p>`).join("");
    else h += ex.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("");
    if (ex.line) h += `<div><div class="line-lbl"><span>${esc(ex.lineLabel)}</span><button class="linkbtn" type="button" data-act="showline" data-which="${ex.which || "best"}">${tr("Ver en el tablero", "Show on board")}</button></div><div class="line">${esc(ex.line)}</div></div>`;
    if (ex.alt) h += `<div><div class="line-lbl"><span>${esc(ex.alt.label)}</span><button class="linkbtn" type="button" data-act="showline" data-which="best">${tr("Ver en el tablero", "Show on board")}</button></div><div class="line">${esc(ex.alt.line)}</div></div>`;
    if (ex.tip) h += `<div class="tip"><b>${tr("Consejo:", "Tip:")}</b> ${esc(ex.tip)}</div>`;
  }
  if (store.settings.aiKey && !a.partial) {
    const key = A.entry.id + ":" + k; const cached = A.aiMove[key];
    h += `<div class="btn-row"><button class="btn small" type="button" data-act="ai" data-k="${k}">${cached ? tr("Volver a explicar con IA", "Explain again with AI") : tr("Explicar con IA", "Explain with AI")}</button></div>`;
    h += `<div id="anAiOut">${cached ? `<div class="ai-out">${md(cached)}</div>` : ""}</div>`;
  }
  el.innerHTML = h;
}

function renderMoves() {
  const g = A.game, a = an(); const rows = [];
  const startBlack = g.moves.length && g.moves[0].color === "b";
  let i = 0, n = +g.fens[0].split(" ")[5] || 1;
  const curPly = A.variation ? A.variation.base : A.ply;
  const cell = (k) => {
    if (k == null || k >= g.moves.length) return "<td></td>";
    const x = a && a.info[k];
    const rvm = A.review && A.entry.selfReview && A.entry.selfReview.marks && A.entry.selfReview.marks[k];
    const gl = rvm ? `<span class="gl rv-flag" title="${tr("Marcaste este momento", "You marked this moment")}">●</span>` : x && ["inacc", "mistake", "blunder"].includes(x.c) ? `<span class="gl c-${x.c}">${CLS[x.c].g}</span>` : "";
    return `<td><button type="button" class="mv${curPly === k + 1 && !A.variation ? " cur" : ""}" data-go="${k + 1}">${esc(g.moves[k].san)}${gl}</button></td>`;
  };
  if (startBlack) { rows.push(`<tr><td class="n">${n}.</td><td>…</td>${cell(0)}</tr>`); i = 1; n++; }
  for (; i < g.moves.length; i += 2, n++) rows.push(`<tr><td class="n">${n}.</td>${cell(i)}${cell(i + 1)}</tr>`);
  let html = `<table><tbody>${rows.join("")}</tbody></table>`;
  if (A.variation) {
    const v = A.variation; let fen = g.fens[v.base];
    const parts = v.moves.map((m, j) => {
      const lab = moveLabel(fen, m.san, fen.split(" ")[1]); fen = m.fen;
      return `<button type="button" class="mv${v.idx === j + 1 ? " cur" : ""}" data-vgo="${j + 1}">${esc(j === 0 || lab.includes(". ") ? lab : m.san)}</button>`;
    });
    html += `<div class="varline"><span class="muted small">${tr("Variante:", "Variation:")}</span>${parts.join("")}</div>`;
  }
  const box = $("anMoves"); box.innerHTML = html;
  const cur = box.querySelector("table .mv.cur");
  if (cur) { const t = cur.offsetTop - box.clientHeight / 2; box.scrollTop = Math.max(0, t); }
}

// En la tabla, "Stockfish nivel 4" se corta: alcanza con "Stockfish" (el nombre completo queda en el título).
const colName = (n) => (/^Stockfish\b/.test(n || "") ? "Stockfish" : n);
function renderStats() {
  const e = A.entry, a = an();
  if (!a) { $("anStats").innerHTML = `<p class="muted small">${A.review ? tr("El resumen del motor aparece cuando terminás tu revisión.", "The engine summary appears when you finish your review.") : tr("El resumen aparece cuando termina el análisis.", "The summary appears when the analysis finishes.")}</p>`; $("anKeys").innerHTML = ""; return; }
  const W = a.partial ? calcStats(A.game, a.info, "w") : e.analysis.stats?.w; const B = a.partial ? calcStats(A.game, a.info, "b") : e.analysis.stats?.b;
  const v = (o, k, d) => (o && o[k] != null ? (d != null ? o[k].toFixed(d) : o[k]) : "–");
  const row = (k, label) => `<div class="k"><span class="glyph g-${k}">${CLS[k].g}</span>${label}</div><div class="v">${v(W, k)}</div><div class="v">${v(B, k)}</div>`;
  $("anStats").innerHTML = `<div class="stats">
    <div></div><div class="h" title="${esc(e.white)}">${esc(colName(e.white))}</div><div class="h" title="${esc(e.black)}">${esc(colName(e.black))}</div>
    <div class="k">${tr("Precisión", "Accuracy")}</div><div class="big">${W ? W.acc.toFixed(0) + "%" : "–"}</div><div class="big">${B ? B.acc.toFixed(0) + "%" : "–"}</div>
    <div class="k">${tr("Pérdida media (cp)", "Avg. loss (cp)")}</div><div class="v">${v(W, "acpl", 0)}</div><div class="v">${v(B, "acpl", 0)}</div>
    ${row("best", tr("Mejores jugadas", "Best moves"))}${row("inacc", tr("Imprecisiones", "Inaccuracies"))}${row("mistake", tr("Errores", "Mistakes"))}${row("blunder", "Blunders")}
  </div>`;
  const keys = (a.info || []).map((x, k) => ({ x, k })).filter((o) => o.x && (o.x.c === "blunder" || o.x.c === "mistake"));
  $("anKeys").innerHTML = keys.length ? `<div class="eyebrow" style="width:100%">${tr("Momentos clave", "Key moments")}</div>` + keys.map((o) => `<button class="chip" type="button" data-go="${o.k + 1}"><span class="glyph g-${o.x.c}">${CLS[o.x.c].g}</span>${esc(moveLabel(A.game.fens[o.k], A.game.moves[o.k].san, A.game.moves[o.k].color))}</button>`).join("") : (a.partial ? "" : `<p class="muted small">${tr("Sin errores graves en esta partida.", "No serious mistakes in this game.")}</p>`);
}

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
    if (A.ply === k + 1 && !A.variation && $("anAiOut")) $("anAiOut").innerHTML = `<div class="ai-out">${md(text)}</div>`;
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
  const prompt = `Sos un entrenador de ajedrez. Escribí en español rioplatense (voseo), concreto y alentador.
${uc ? `La persona que consulta jugó con ${uc === "w" ? "Blancas" : "Negras"} (${uc === "w" ? e.white : e.black}).` : "No sabemos con qué color jugó la persona que consulta; hablale a ambos lados por igual."} Resultado: ${e.result || "desconocido"}.

Partida anotada con el análisis de Stockfish 18 (no inventes jugadas ni variantes que no estén acá):
${ann}

Estadísticas:
- Blancas (${e.white}${e.whiteElo ? ", " + e.whiteElo : ""}): precisión ${W.acc.toFixed(0)}%, pérdida media ${W.acpl.toFixed(0)} cp, ${W.inacc} imprecisiones, ${W.mistake} errores, ${W.blunder} blunders.
- Negras (${e.black}${e.blackElo ? ", " + e.blackElo : ""}): precisión ${B.acc.toFixed(0)}%, pérdida media ${B.acpl.toFixed(0)} cp, ${B.inacc} imprecisiones, ${B.mistake} errores, ${B.blunder} blunders.

Usá este formato (títulos con ###, viñetas con "- "):
### Cómo fue la partida
2 o 3 oraciones.
### Momentos clave
3 viñetas con el número de jugada y qué pasó.
### Qué entrenar
3 viñetas con recomendaciones concretas basadas en los errores.`;
  const promptEn = `You are a chess coach. Write in concrete, encouraging English.
${uc ? `The person asking played ${uc === "w" ? "White" : "Black"} (${uc === "w" ? e.white : e.black}).` : "We don't know which color the person asking played; address both sides equally."} Result: ${e.result || "unknown"}.

Game annotated with Stockfish 18's analysis (don't invent moves or variations that aren't here):
${ann}

Statistics:
- White (${e.white}${e.whiteElo ? ", " + e.whiteElo : ""}): accuracy ${W.acc.toFixed(0)}%, average loss ${W.acpl.toFixed(0)} cp, ${W.inacc} inaccuracies, ${W.mistake} mistakes, ${W.blunder} blunders.
- Black (${e.black}${e.blackElo ? ", " + e.blackElo : ""}): accuracy ${B.acc.toFixed(0)}%, average loss ${B.acpl.toFixed(0)} cp, ${B.inacc} inaccuracies, ${B.mistake} mistakes, ${B.blunder} blunders.

Use this format (headings with ###, bullets with "- "):
### How the game went
2 or 3 sentences.
### Key moments
3 bullets with the move number and what happened.
### What to train
3 bullets with concrete recommendations based on the mistakes.`;
  try {
    const text = await window.api.aiAsk({ prompt: EN ? promptEn : prompt, key: store.settings.aiKey, model: store.settings.aiModel, maxTokens: 1100 });
    A.aiSum[e.id] = text;
    if (A.entry === e) out.innerHTML = `<div class="ai-out">${md(text)}</div>`;
  } catch (err) { out.innerHTML = `<p class="err small">${esc(aiErr(err))}</p>`; }
  finally { btn.disabled = false; }
}
