import { store, loadAll, startEngines, on, progress, queueLength, cancelQueue, findEntry, engines, engineProblem, saveTraining, flushSaves } from "./state.js";
import { migrate } from "./srs.js";
import { invalidateInsights } from "./insights.js";
import { redrawAll } from "./board.js";
import { setSoundEnabled } from "./sound.js";
import { $, esc, toast } from "./ui.js";
import { tr, translateStatic } from "./i18n.js";
import { initLibrary } from "./views/library.js";
import { initAnalysis, openAnalysis, openReview, analysisKey, onShow as analysisShow, leaveAnalysis } from "./views/analysis.js";
import { initLearn, showLearn, startLearnSession } from "./views/learn.js";
import { initPlay, playFrom } from "./views/play.js";
import { initSettings } from "./views/settings.js";
import { initToday, showToday } from "./views/today.js";
import { initDiagnosis, showDiagnosis } from "./views/diagnosis.js";
import { initThreats, showThreats, startThreatSession } from "./views/threats.js";
import { initPuzzles, showPuzzles, startPuzzleSession } from "./views/puzzles.js";
import { initEndgames, showEndgames, startEndgameSession } from "./views/endgames.js";

let current = "";
const BOARD_VIEWS = new Set(["analysis", "learn", "threats", "puzzles", "endgames", "play"]);

function goView(v, opts = {}) {
  if (current === "analysis" && v !== "analysis") leaveAnalysis();
  current = v;
  document.querySelectorAll(".view").forEach((s) => { s.hidden = s.id !== "view-" + v; });
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
  if (BOARD_VIEWS.has(v)) sizeBoards();
  if (opts.skipShow) return;
  if (v === "today") showToday();
  else if (v === "analysis") analysisShow();
  else if (v === "learn") showLearn(null);
  else if (v === "diagnosis") showDiagnosis();
  else if (v === "threats") showThreats();
  else if (v === "puzzles") showPuzzles();
  else if (v === "endgames") showEndgames();
}

function sizeBoards() {
  const side = 216, panel = 400, gaps = 28 + 56, bar = 30;
  const w = window.innerWidth - side - panel - gaps - bar;
  const h = window.innerHeight - 30 - 24 - 26 * 2 - 16 - 46;
  const size = Math.max(300, Math.min(920, Math.floor(Math.min(w, h) / 8) * 8));
  document.documentElement.style.setProperty("--board", size + "px");
  requestAnimationFrame(redrawAll);
}

function renderFoot(err) {
  const el = $("sideFoot");
  const errMsg = err || engineProblem();
  let h = errMsg ? `<div><span class="dot off"></span>${esc(errMsg)}</div>` : (() => { const n = store.settings.threads || Math.max(1, Math.floor((store.sys.cores || 4) / 2)); return `<div><span class="dot"></span>Stockfish 18 · ${n} ${n === 1 ? tr("núcleo", "core") : tr("núcleos", "cores")}</div>`; })();
  if (progress.id) {
    const e = findEntry(progress.id);
    const pct = progress.n ? (progress.i / progress.n) * 100 : 0;
    h += `<div>${tr("Analizando", "Analyzing")} ${e ? esc(e.white) + " – " + esc(e.black) : tr("partida", "game")}</div><div class="mini"><i style="width:${pct.toFixed(1)}%"></i></div>`;
    const q = queueLength() - 1;
    if (q > 0) h += `<div class="muted">${tr(`${q} más en cola`, `${q} more queued`)} · <button class="linkbtn" id="cancelQ" type="button">${tr("Cancelar cola", "Cancel queue")}</button></div>`;
  }
  el.innerHTML = h;
  const c = $("cancelQ"); if (c) c.onclick = () => { cancelQueue(); toast(tr("Cola cancelada. La partida actual termina de analizarse.", "Queue cancelled. The current game will finish analyzing.")); renderFoot(); };
}

async function boot() {
  translateStatic();
  await loadAll();
  // Repaso espaciado: los ejercicios resueltos con la versión anterior arrancan su calendario mañana.
  let migrated = false;
  for (const t of Object.values(store.training)) { const had = t.box; migrate(t); if (had !== t.box) migrated = true; }
  if (migrated) saveTraining();
  setSoundEnabled(store.settings.sound);
  document.querySelectorAll(".nav-btn").forEach((b) => { b.onclick = () => goView(b.dataset.view); });
  document.addEventListener("click", (e) => { const g = e.target.closest("[data-goto]"); if (g) goView(g.dataset.goto); });

  const openGame = (id, ply) => { goView("analysis", { skipShow: true }); openAnalysis(id, ply); };
  const onPlayFrom = (fen, color) => { goView("play"); playFrom(fen, color); };
  const startErrors = (o) => { goView("learn", { skipShow: true }); startLearnSession(o); };
  const startThreats = (o) => { goView("threats", { skipShow: true }); startThreatSession(o); };
  const startPuzzles = (o) => { goView("puzzles", { skipShow: true }); startPuzzleSession(o); };
  const startEndgame = (lesson) => { goView("endgames", { skipShow: true }); startEndgameSession(lesson); };
  const hooks = { goView, openGame, onPlayFrom, toast, startErrors, startThreats, startPuzzles, startEndgame, openReview: (id) => { goView("analysis", { skipShow: true }); openReview(id); } };

  initLibrary({ onOpen: openGame });
  initAnalysis({ onPlayFrom, onTrain: (id) => { goView("learn", { skipShow: true }); showLearn(id); } });
  initLearn(hooks);
  initThreats(hooks);
  initPuzzles(hooks);
  initEndgames(hooks);
  initDiagnosis(hooks);
  initToday(hooks);
  initPlay({ openGame });
  await initSettings();

  on("engines", () => renderFoot()); on("progress", () => renderFoot()); on("queue", () => renderFoot());
  on("analysed", () => invalidateInsights()); on("library", () => invalidateInsights());
  on("error", (msg) => { toast(msg, 7000); renderFoot(); });
  window.addEventListener("resize", () => { if (BOARD_VIEWS.has(current)) sizeBoards(); });
  window.addEventListener("beforeunload", flushSaves);
  document.addEventListener("keydown", (e) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || !$("modal").hidden) { if (e.key === "Escape") $("modal").hidden = true; return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (current === "analysis" && analysisKey(e)) e.preventDefault();
  });

  goView(store.library.length ? "today" : "library");
  renderFoot();
  const err = await startEngines();
  renderFoot(err);
  if (err) toast(tr("No pude iniciar Stockfish: ", "Couldn't start Stockfish: ") + err, 6000);
}

boot();
