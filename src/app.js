import { store, loadAll, startEngines, on, progress, queueLength, cancelQueue, findEntry, engineProblem, saveTraining, saveSettings, flushSaves } from "./state.js";
import { migrate } from "./srs.js";
import { invalidateInsights } from "./insights.js";
import { redrawAll } from "./board.js";
import { setSoundEnabled } from "./sound.js";
import { $, esc, toast, closeModals, anyModal, openModal, closeMenu } from "./ui.js";
import { tr, translateStatic } from "./i18n.js";
import { setNotation, observeNotation } from "./notation.js";
import { applyAppearance } from "./appearance.js";
import { initUpdates, upd, checkUpdates, installUpdate, fmtMB } from "./updates.js";
import { importPgnText, importSummary, exportAllGames, saveBackup, restoreBackup } from "./data.js";
import { initLibrary, openPaste } from "./views/library.js";
import { initAnalysis, openAnalysis, openReview, openFree, analysisKey, onShow as analysisShow, leaveAnalysis, copyFen, copyPgn, exportPgn, currentEntryId } from "./views/analysis.js";
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
const VIEW_ORDER = ["today", "library", "analysis", "diagnosis", "learn", "threats", "puzzles", "endgames", "play"];

function goView(v, opts = {}) {
  if (current === "analysis" && v !== "analysis") leaveAnalysis();
  closeMenu();
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
  const cs = getComputedStyle(document.documentElement);
  const side = parseFloat(cs.getPropertyValue("--side-w")) || 224, panel = parseFloat(cs.getPropertyValue("--panel-w")) || 420, gaps = 28 + 56, bar = 30;
  const w = window.innerWidth - side - panel - gaps - bar;
  const h = window.innerHeight - 30 - 24 - 28 * 2 - 16 - 46;
  const size = Math.max(300, Math.min(960, Math.floor(Math.min(w, h) / 8) * 8));
  document.documentElement.style.setProperty("--board", size + "px");
  requestAnimationFrame(redrawAll);
}

function renderFoot(err) {
  const el = $("sideFoot");
  const errMsg = err || engineProblem();
  let h = "";
  // Aviso de versión nueva: un clic la baja y la instala.
  if (upd.state === "available" && upd.info) {
    h += `<div class="update-card"><b>${tr(`Versión ${esc(upd.info.latest)} disponible`, `Version ${esc(upd.info.latest)} available`)}</b>`
      + (upd.info.hasAsset && upd.info.canInstall ? `<button class="btn primary small" id="updGo" type="button">${tr("Actualizar ahora", "Update now")}</button>` : "")
      + `<button class="linkbtn" id="updNotes" type="button">${tr("Ver las novedades", "See what's new")}</button></div>`;
  } else if (upd.state === "downloading") {
    h += `<div class="update-card"><b>${tr("Descargando la actualización…", "Downloading the update…")}</b><div class="mini"><i style="width:${(upd.progress * 100).toFixed(1)}%"></i></div><span class="muted">${Math.round(upd.progress * 100)}%${upd.info && upd.info.size ? ` ${tr("de", "of")} ${fmtMB(upd.info.size)}` : ""}</span></div>`;
  } else if (upd.state === "installing") {
    h += `<div class="update-card"><b>${tr("Instalando: la app se reinicia sola…", "Installing: the app will restart by itself…")}</b></div>`;
  } else if (upd.state === "error" && upd.error) {
    h += `<div class="update-card"><b>${tr("No se pudo actualizar", "The update failed")}</b><span>${esc(upd.error)}</span><button class="linkbtn" id="updRetry" type="button">${tr("Probar de nuevo", "Try again")}</button></div>`;
  }
  h += errMsg ? `<div><span class="dot off"></span>${esc(errMsg)}</div>` : (() => { const n = store.settings.threads || Math.max(1, Math.floor((store.sys.cores || 4) / 2)); return `<div><span class="dot"></span>Stockfish 18, ${n} ${n === 1 ? tr("núcleo", "core") : tr("núcleos", "cores")}</div>`; })();
  if (progress.id) {
    const e = findEntry(progress.id);
    const pct = progress.n ? (progress.i / progress.n) * 100 : 0;
    h += `<div class="nofig">${tr("Analizando", "Analyzing")} ${e ? esc(e.white) + " – " + esc(e.black) : tr("partida", "game")}</div><div class="mini"><i style="width:${pct.toFixed(1)}%"></i></div>`;
    const q = queueLength() - 1;
    if (q > 0) h += `<div class="muted">${tr(`${q} más en cola`, `${q} more queued`)} <button class="linkbtn" id="cancelQ" type="button">${tr("Cancelar cola", "Cancel queue")}</button></div>`;
  }
  h += `<div class="muted">v${esc(store.sys.version || "")}</div>`;
  el.innerHTML = h;
  const c = $("cancelQ"); if (c) c.onclick = () => { cancelQueue(); toast(tr("Cola cancelada. La partida actual termina de analizarse.", "Queue cancelled. The current game will finish analyzing.")); renderFoot(); };
  const g = $("updGo"); if (g) g.onclick = installUpdate;
  const n = $("updNotes"); if (n) n.onclick = () => window.api.openExternal(upd.info.url);
  const r = $("updRetry"); if (r) r.onclick = () => (upd.info && upd.info.newer ? installUpdate() : checkUpdates(true));
}

/* ---------- tablero libre ---------- */
function openFenModal() {
  $("fenText").value = ""; $("fenErr").textContent = "";
  openModal("fenModal"); $("fenText").focus();
}
function startFree(fen) {
  goView("analysis", { skipShow: true });
  if (!openFree(fen)) { toast(tr("Esa posición no es válida.", "That position isn't valid.")); return false; }
  return true;
}
function initFenModal() {
  $("fenCancel").onclick = closeModals;
  $("fenStart").onclick = () => { closeModals(); startFree(null); };
  $("fenOk").onclick = () => {
    const raw = $("fenText").value.trim();
    if (!raw) { $("fenErr").textContent = tr("Pegá una posición en formato FEN, o elegí la posición inicial.", "Paste a position in FEN format, or choose the initial position."); return; }
    // Se acepta también un FEN incompleto (solo las piezas, o sin los contadores finales).
    const parts = raw.split(/\s+/);
    const fen = [parts[0], parts[1] || "w", parts[2] || "-", parts[3] || "-", parts[4] || "0", parts[5] || "1"].join(" ");
    closeModals();
    if (!startFree(fen)) { openModal("fenModal"); $("fenText").value = raw; $("fenErr").textContent = tr("No pude leer esa posición. Revisá que el FEN esté completo.", "I couldn't read that position. Check that the FEN is complete."); }
  };
  document.querySelectorAll(".modal").forEach((m) => m.addEventListener("click", (e) => { if (e.target === m) closeModals(); }));
}

/* ---------- atajos ---------- */
function showHelp() {
  const rows = [
    ["← →", tr("Jugada anterior y siguiente", "Previous and next move")],
    ["↑ ↓", tr("Error anterior y siguiente de la partida", "Previous and next mistake in the game")],
    [tr("Inicio / Fin", "Home / End"), tr("Principio y final de la línea", "Start and end of the line")],
    [tr("Barra espaciadora", "Space bar"), tr("Jugar en el tablero la jugada que recomienda el motor", "Play the engine's recommended move on the board")],
    ["F", tr("Girar el tablero", "Flip the board")],
    ["A", tr("Mostrar u ocultar las flechas del motor", "Show or hide the engine arrows")],
    ["⌫", tr("Borrar la variante en la que estás", "Delete the variation you are in")],
    ["Esc", tr("Volver de una variante a la partida", "Go back from a variation to the game")],
    ["⌘1 … ⌘9", tr("Cambiar de sección", "Switch section")],
    ["⌘N", tr("Tablero libre", "Free board")],
    ["⌘O", tr("Abrir un archivo PGN", "Open a PGN file")],
    ["⌘⇧V", tr("Pegar un PGN", "Paste a PGN")],
    ["⌘S", tr("Exportar la partida abierta", "Export the open game")],
    ["⌘⇧C", tr("Copiar la posición (FEN)", "Copy the position (FEN)")],
    ["?", tr("Ver estos atajos", "Show these shortcuts")]
  ];
  $("helpBody").innerHTML = rows.map(([k, t]) => `<kbd class="kbd">${esc(k)}</kbd><span>${esc(t)}</span>`).join("");
  openModal("helpModal");
}

/* ---------- novedades (una sola vez después de actualizar) ---------- */
const NEWS_VERSION = "2.0";
function maybeShowNews() {
  if (store.settings.seenVersion === NEWS_VERSION) return;
  const done = () => { store.settings.seenVersion = NEWS_VERSION; saveSettings(); };
  // A quien recién empieza no se le cuentan "novedades": todo es nuevo.
  if (!store.library.length || store.sys.test) { if (!store.sys.test) done(); return; }
  const items = [
    [tr("Motor en vivo y variantes", "Live engine and variations"), tr("En cualquier partida podés mover las piezas, tuyas y de tu rival. El motor analiza cada posición con varias líneas: tocá una jugada para verla en el tablero o apretá la barra espaciadora para jugar la que recomienda. Las variantes quedan guardadas con la partida.", "In any game you can move the pieces, yours and your opponent's. The engine analyzes every position with several lines: click a move to see it on the board, or press the space bar to play the one it recommends. Variations are saved with the game.")],
    [tr("Devolución de cada partida", "A report for every game"), tr("Cada partida analizada trae una devolución escrita: cómo se desarrolló, qué la decidió, cómo usaste el reloj y cómo se compara con tus otras partidas de la semana y del mes.", "Every analyzed game comes with a written report: how it unfolded, what decided it, how you used the clock, and how it compares with your other games of the week and month.")],
    [tr("Informe semanal y mensual", "Weekly and monthly report"), tr("En Diagnóstico elegís el período y ves qué mejoró y qué empeoró respecto del anterior.", "In Diagnosis you choose the period and see what improved and what got worse compared with the previous one.")],
    [tr("Tablero libre y archivos PGN", "Free board and PGN files"), tr("Analizá cualquier posición, cargá una partida a mano, abrí o arrastrá archivos PGN, exportá tus partidas y guardá una copia de seguridad de todo.", "Analyze any position, enter a game by hand, open or drag PGN files, export your games and save a backup of everything.")],
    [tr("A tu gusto", "Your way"), tr("Notación con figurines o con letras en castellano, cuatro tableros y cuatro juegos de piezas, tema claro u oscuro. Todo en Ajustes.", "Figurine or letter notation, four boards and four piece sets, light or dark theme. All in Settings.")],
    [tr("Actualizaciones con un clic", "One-click updates"), tr("Cuando salga una versión nueva, la app te avisa y se actualiza sola.", "When a new version comes out, the app tells you and updates itself.")]
  ];
  $("newsBody").innerHTML = items.map(([t, d]) => `<li><b>${esc(t)}</b><span>${esc(d)}</span></li>`).join("");
  $("newsClose").onclick = closeModals;
  openModal("newsModal");
  done();
}

/* ---------- archivos PGN ---------- */
function importAndOpen(text) {
  const r = importPgnText(text);
  toast(importSummary(r), 4000);
  if (!r) return;
  if (r.entries.length === 1) { goView("analysis", { skipShow: true }); openAnalysis(r.entries[0].id); }
  else goView("library");
}
async function openPgnFiles() {
  let files;
  try { files = await window.api.openFile("pgn"); } catch (e) { toast(String(e.message || e), 5000); return; }
  if (files && files.length) importAndOpen(files.map((f) => f.text).join("\n\n"));
}
function initDrop() {
  let depth = 0, hint = null;
  const isFile = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
  const hide = () => { depth = 0; if (hint) { hint.remove(); hint = null; } };
  window.addEventListener("dragenter", (e) => { if (!isFile(e)) return; e.preventDefault(); depth++; if (!hint) { hint = document.createElement("div"); hint.className = "drop-hint"; hint.textContent = tr("Soltá el archivo PGN para agregar las partidas", "Drop the PGN file to add its games"); document.body.appendChild(hint); } });
  window.addEventListener("dragover", (e) => { if (isFile(e)) e.preventDefault(); });
  window.addEventListener("dragleave", (e) => { if (!isFile(e)) return; depth--; if (depth <= 0) hide(); });
  window.addEventListener("drop", async (e) => {
    if (!isFile(e)) return;
    e.preventDefault(); hide();
    const texts = [];
    for (const f of e.dataTransfer.files) { if (f.size > 200 * 1048576) continue; try { texts.push(await f.text()); } catch (err) {} }
    if (texts.length) importAndOpen(texts.join("\n\n"));
  });
}

function runCommand(c) {
  if (c.startsWith("view:")) { closeModals(); goView(c.slice(5)); return; }
  if (c === "new-board") openFenModal();
  else if (c === "open-pgn") openPgnFiles();
  else if (c === "paste-pgn") { goView("library"); openPaste(); }
  else if (c === "export-pgn") { if (current === "analysis" && (currentEntryId() || !$("anContent").hidden)) exportPgn(); else toast(tr("Abrí una partida en Análisis para exportarla.", "Open a game in Analysis to export it.")); }
  else if (c === "export-all") exportAllGames();
  else if (c === "backup") saveBackup();
  else if (c === "restore") restoreBackup();
  else if (c === "copy-fen") { if (current === "analysis") copyFen(); }
  else if (c === "copy-pgn") { if (current === "analysis") copyPgn(); }
  else if (c === "shortcuts") showHelp();
  else if (c === "check-updates") { goView("settings"); checkUpdates(true); }
}

async function boot() {
  translateStatic();
  await loadAll();
  setNotation(store.settings.notation);
  applyAppearance();
  observeNotation(document.body);
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
  const onTrain = (id) => { goView("learn", { skipShow: true }); showLearn(id); };
  const hooks = { goView, openGame, onPlayFrom, toast, startErrors, startThreats, startPuzzles, startEndgame, onTrain, saveSettings, newBoard: openFenModal, openPgnFiles, runCommand,
    openReview: (id) => { goView("analysis", { skipShow: true }); openReview(id); } };

  initLibrary({ onOpen: openGame, newBoard: openFenModal, openPgnFiles });
  initAnalysis(hooks);
  initLearn(hooks);
  initThreats(hooks);
  initPuzzles(hooks);
  initEndgames(hooks);
  initDiagnosis(hooks);
  initToday(hooks);
  initPlay({ openGame });
  await initSettings(hooks);
  initFenModal(); initDrop();
  $("helpClose").onclick = closeModals;

  on("engines", () => renderFoot()); on("progress", () => renderFoot()); on("queue", () => renderFoot()); on("update", () => renderFoot());
  on("analysed", () => invalidateInsights()); on("library", () => invalidateInsights());
  on("error", (msg) => { toast(msg, 7000); renderFoot(); });
  window.addEventListener("resize", () => { if (BOARD_VIEWS.has(current)) sizeBoards(); });
  window.addEventListener("beforeunload", flushSaves);
  window.api.onMenu(runCommand);
  window.api.onFileOpened((f) => importAndOpen(f.text));
  const mac = store.sys.platform === "darwin";
  document.addEventListener("keydown", (e) => {
    if (anyModal()) { if (e.key === "Escape") closeModals(); return; }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (e.metaKey || e.ctrlKey) {
      // En la Mac estos atajos los maneja la barra de menú; acá solo se atienden donde no hay menú.
      if (mac || e.altKey) return;
      const k = e.key.toLowerCase();
      if (/^[1-9]$/.test(k)) { e.preventDefault(); runCommand("view:" + VIEW_ORDER[+k - 1]); }
      else if (k === ",") { e.preventDefault(); runCommand("view:settings"); }
      else if (k === "n") { e.preventDefault(); runCommand("new-board"); }
      else if (k === "o") { e.preventDefault(); runCommand("open-pgn"); }
      else if (k === "s") { e.preventDefault(); runCommand("export-pgn"); }
      else if (k === "c" && e.shiftKey) { e.preventDefault(); runCommand("copy-fen"); }
      else if (k === "v" && e.shiftKey) { e.preventDefault(); runCommand("paste-pgn"); }
      return;
    }
    if (typing || e.altKey) return;
    if (e.key === "?") { e.preventDefault(); showHelp(); return; }
    if (current === "analysis" && analysisKey(e)) e.preventDefault();
  });

  goView(store.library.length ? "today" : "library");
  renderFoot();
  const err = await startEngines();
  renderFoot(err);
  if (err) toast(tr("No pude iniciar Stockfish: ", "Couldn't start Stockfish: ") + err, 6000);
  initUpdates();
  maybeShowNews();
  try { for (const f of await window.api.pendingFiles()) importAndOpen(f.text); } catch (e) {}
}

boot();
