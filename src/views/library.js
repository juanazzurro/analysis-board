import { familyLabel, openingFamilyEs } from "../openings.js";
import { tr } from "../i18n.js";
import { store, on, addGames, enqueueAnalysis, progress, detectUserColor, removeEntry, saveSettings, findEntry, gameOf } from "../state.js";
import { speedOf, scoreFor } from "../insights.js";
import { importPgnText, importSummary } from "../data.js";
import { $, esc, toast, fmtDate, segBind, segValue, segSet, closeModals, openModal, cleanErr } from "../ui.js";

let source = "lichess";
let hooks = { onOpen() {}, newBoard() {}, openPgnFiles() {} };
let limit = 200;

export function initLibrary(h) {
  hooks = h;
  const srcSeg = document.querySelector("#view-library .seg");
  segBind(srcSeg, (d) => { source = d.src; $("impUser").value = source === "lichess" ? store.settings.lichessUser : store.settings.chesscomUser; });
  $("impUser").value = store.settings.lichessUser || "";
  if (!store.settings.lichessUser && store.settings.chesscomUser) { source = "chesscom"; segSet(srcSeg, "src", "chesscom"); $("impUser").value = store.settings.chesscomUser; }
  $("impCount").value = String(store.settings.importCount || 25);
  $("impBtn").onclick = doImport;
  $("impUser").addEventListener("keydown", (e) => { if (e.key === "Enter") doImport(); });
  const refilter = () => { limit = 200; render(); };
  $("libSearch").addEventListener("input", refilter);
  for (const id of ["libRes", "libSpeed", "libSort"]) $(id).addEventListener("change", refilter);
  $("libMoreBtn").onclick = () => { limit += 300; render(); };
  $("analyseAllBtn").onclick = () => {
    const pend = store.library.filter((g) => !g.analysis);
    if (!pend.length) { toast(tr("No hay partidas pendientes de análisis.", "No games waiting to be analyzed.")); return; }
    pend.forEach((g) => enqueueAnalysis(g.id));
    toast(tr(`${pend.length} ${pend.length === 1 ? "partida en cola" : "partidas en cola"} para analizar.`, `${pend.length} ${pend.length === 1 ? "game" : "games"} queued for analysis.`));
  };
  $("pasteBtn").onclick = openPaste;
  $("newBoardBtn").onclick = () => hooks.newBoard();
  $("openPgnBtn").onclick = () => hooks.openPgnFiles();
  $("libList").addEventListener("click", (e) => {
    const del = e.target.closest(".del");
    if (del) { e.stopPropagation(); askDelete(del.dataset.id, del); return; }
    const row = e.target.closest(".lib-row"); if (row) hooks.onOpen(row.dataset.id);
  });
  $("libList").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.classList.contains("lib-row")) hooks.onOpen(e.target.dataset.id); });
  initPaste();
  on("library", render); on("progress", renderProgressOnly); on("queue", render);
  render();
}

async function doImport() {
  const user = $("impUser").value.trim();
  const count = +$("impCount").value;
  if (!user) { toast(tr("Escribí tu usuario de ", "Enter your username for ") + (source === "lichess" ? "Lichess" : "Chess.com") + "."); $("impUser").focus(); return; }
  if (source === "lichess") store.settings.lichessUser = user; else store.settings.chesscomUser = user;
  store.settings.importCount = count; saveSettings();
  const btn = $("impBtn"); btn.disabled = true; btn.textContent = tr("Importando…", "Importing…");
  try {
    const list = await window.api.importGames(source, user, count);
    const added = addGames(list);
    // Las partidas nuevas se analizan solas, de la más reciente a la más vieja.
    const fresh = (addGames.lastIds || []).map(findEntry).filter(Boolean).sort((a, b) => (b.date || 0) - (a.date || 0));
    fresh.forEach((e) => enqueueAnalysis(e.id));
    toast(added ? tr(`Se agregaron ${added} ${added === 1 ? "partida nueva" : "partidas nuevas"}. Se van a analizar solas.`, `Added ${added} new ${added === 1 ? "game" : "games"}. They will be analyzed automatically.`) : tr("No había partidas nuevas.", "No new games."));
  } catch (e) {
    toast(cleanErr(e), 5000);
  } finally { btn.disabled = false; btn.textContent = tr("Importar", "Import"); }
}

function resultFor(g, uc) {
  if (g.result === "1-0") return uc === "w" ? ["win", "1-0"] : uc === "b" ? ["loss", "1-0"] : ["draw", "1-0"];
  if (g.result === "0-1") return uc === "b" ? ["win", "0-1"] : uc === "w" ? ["loss", "0-1"] : ["draw", "0-1"];
  if (g.result === "½-½" || g.result === "1/2-1/2") return ["draw", "½-½"];
  return ["draw", "*"];
}
/** Apertura para mostrar: la de Lichess, o la que Chess.com pone en ECOUrl. */
const opCache = new WeakMap();
function openingLabel(g) {
  let lab = opCache.get(g);
  if (lab !== undefined) return lab;
  let name = g.opening;
  if (!name) { const m = /\[ECOUrl "[^"]*\/openings\/([^"]+)"\]/.exec(g.pgn || ""); if (m) name = decodeURIComponent(m[1]).split("-").filter((w) => w && !/^\d/.test(w)).join(" "); }
  lab = name ? familyLabel(name) || name.split(":")[0] : "";
  // Sin nombre en el PGN: se reconoce por las primeras jugadas.
  if (!lab || lab === OTHER) { try { const fam = openingFamilyEs(name || "", gameOf(g).moves.slice(0, 8).map((m) => m.san)); if (fam && fam !== OTHER) lab = fam; else if (lab === OTHER) lab = name ? name.split(":")[0] : ""; } catch (e) {} }
  opCache.set(g, lab);
  return lab;
}
const OTHER = tr("Otras", "Other");
const SPEED = { bullet: "Bullet", blitz: "Blitz", rapid: tr("Rápida", "Rapid"), classical: tr("Clásica", "Classical"), daily: tr("Por correspondencia", "Correspondence"), correspondence: tr("Por correspondencia", "Correspondence"), ultraBullet: "Bullet", otro: tr("Otro ritmo", "Other") };
const SOURCE = { lichess: "Lichess", chesscom: "Chess.com", play: tr("contra Stockfish", "vs Stockfish"), pgn: "PGN" };
// El ritmo de cada partida se calcula una vez (para las de PGN sale del control de tiempo).
const speedCache = new WeakMap();
function speedKey(g) {
  let s = speedCache.get(g);
  if (s === undefined) { let game = null; if (!g.speed) { try { game = gameOf(g); } catch (e) {} } s = speedOf(g, game); speedCache.set(g, s); }
  return s;
}

function statusHtml(g, uc) {
  if (progress.id === g.id) {
    const pct = progress.n ? Math.round((progress.i / progress.n) * 100) : 0;
    return `<span class="status">${tr("Analizando", "Analyzing")} <span class="mini"><i style="width:${pct}%"></i></span></span>`;
  }
  if (g.analysis) {
    const s = uc ? g.analysis.stats?.[uc] : null;
    if (s) return `<span class="status"><b>${s.acc.toFixed(0)}%</b> ${tr("de precisión", "accuracy")}${s.blunder ? ` <span class="c-blunder nofig">${s.blunder}??</span>` : ""}${s.mistake ? ` <span class="c-mistake nofig">${s.mistake}?</span>` : ""}</span>`;
    return `<span class="status">${tr("Analizada", "Analyzed")}</span>`;
  }
  return `<span class="status">${tr("Sin analizar", "Not analyzed")}</span>`;
}

function fillSpeeds() {
  const sel = $("libSpeed"), cur = sel.value;
  const have = [...new Set(store.library.map(speedKey))].filter((s) => SPEED[s]);
  const order = ["bullet", "blitz", "rapid", "classical", "daily", "otro"].filter((s) => have.includes(s));
  const sig = order.join(",");
  if (sel.dataset.sig === sig) return;
  sel.dataset.sig = sig;
  sel.innerHTML = `<option value="">${tr("Todos los ritmos", "All time controls")}</option>` + order.map((s) => `<option value="${s}">${SPEED[s]}</option>`).join("");
  sel.value = order.includes(cur) ? cur : "";
}

function render() {
  const empty = !store.library.length;
  $("libTools").hidden = empty; $("analyseAllBtn").hidden = empty;
  if (empty) {
    $("libMore").hidden = true;
    $("libList").innerHTML = `<div class="lib-empty"><b>${tr("Empezá por traer tus partidas", "Start by bringing in your games")}</b>${tr(
      "Escribí arriba tu usuario de Lichess o Chess.com y tocá Importar. También podés abrir un archivo PGN, arrastrarlo a esta ventana o pegar una partida. Cada una se analiza sola y después vas a ver tu diagnóstico y tu plan de entrenamiento.",
      "Enter your Lichess or Chess.com username above and click Import. You can also open a PGN file, drag it onto this window or paste a game. Each one is analyzed automatically, and then you'll see your diagnosis and training plan.")}</div>`;
    return;
  }
  fillSpeeds();
  const q = $("libSearch").value.trim().toLowerCase(), fr = $("libRes").value, fs = $("libSpeed").value, sort = $("libSort").value;
  const rows = store.library.map((g) => { const uc = detectUserColor(g); return { g, uc, res: resultFor(g, uc) }; });
  let list = rows.filter(({ g, uc, res }) =>
    (!q || [g.white, g.black, g.opening, openingLabel(g), g.result, SPEED[speedKey(g)] || ""].join(" ").toLowerCase().includes(q))
    && (!fr || (uc && res[0] === fr && g.result !== "*"))
    && (!fs || speedKey(g) === fs));
  const acc = (x) => (x.uc && x.g.analysis && x.g.analysis.stats && x.g.analysis.stats[x.uc] ? x.g.analysis.stats[x.uc].acc : null);
  if (sort === "old") list.sort((a, b) => (a.g.date || 0) - (b.g.date || 0));
  else if (sort === "accUp" || sort === "accDown") { const dir = sort === "accUp" ? 1 : -1; list = list.filter((x) => acc(x) != null).sort((a, b) => dir * (acc(a) - acc(b))); }
  else list.sort((a, b) => (b.g.date || 0) - (a.g.date || 0));
  // marcador de lo que se está viendo
  const mine = list.filter((x) => x.uc && scoreFor(x.g, x.uc) != null);
  const w = mine.filter((x) => scoreFor(x.g, x.uc) === 1).length, d = mine.filter((x) => scoreFor(x.g, x.uc) === 0.5).length, l = mine.length - w - d;
  $("libRecord").innerHTML = `<span>${tr(`${list.length} de ${store.library.length}`, `${list.length} of ${store.library.length}`)}</span>` + (mine.length ? `<span><b>${w}</b>${tr("ganadas", "won")}</span><span><b>${d}</b>${tr("tablas", "drawn")}</span><span><b>${l}</b>${tr("perdidas", "lost")}</span>` : "");
  if (!list.length) { $("libMore").hidden = true; $("libList").innerHTML = `<div class="lib-empty">${tr("Ninguna partida coincide con lo que buscás.", "No games match what you're looking for.")}</div>`; return; }
  $("libMore").hidden = list.length <= limit;
  $("libList").innerHTML = list.slice(0, limit).map(({ g, uc, res }) => {
    const [rc, rt] = res;
    const op = openingLabel(g);
    const meta = [SPEED[speedKey(g)], SOURCE[g.source] || "PGN"].filter(Boolean).join(", ");
    return `<div class="lib-row" data-id="${esc(g.id)}" role="button" tabindex="0">
      <span class="date">${fmtDate(g.date)}</span>
      <span class="players">
        <span class="${uc === "w" ? "me" : ""}"><i class="pdot w"></i>${esc(g.white)} ${g.whiteElo ? `<small>${g.whiteElo}</small>` : ""}</span>
        <span class="${uc === "b" ? "me" : ""}"><i class="pdot b"></i>${esc(g.black)} ${g.blackElo ? `<small>${g.blackElo}</small>` : ""}</span>
      </span>
      <span class="res ${uc ? rc : "draw"} nofig">${rt}</span>
      <span class="meta"><span>${esc(op || tr("Apertura sin nombre", "Unnamed opening"))}</span><small>${esc(meta)}</small></span>
      ${statusHtml(g, uc)}
      <button class="del" type="button" data-id="${esc(g.id)}" title="${tr("Quitar de la lista", "Remove from list")}" aria-label="${tr("Quitar partida", "Remove game")}">✕</button>
    </div>`;
  }).join("");
}
function renderProgressOnly() {
  const row = progress.id ? document.querySelector(`.lib-row[data-id="${CSS.escape(progress.id)}"] .status .mini i`) : null;
  if (row) { if (progress.n) row.style.width = Math.round((progress.i / progress.n) * 100) + "%"; }
  else if (!$("view-library").hidden) render();
}

let pendingDelete = null;
function askDelete(id, btn) {
  if (pendingDelete === id) { removeEntry(id); pendingDelete = null; toast(tr("Partida quitada.", "Game removed.")); return; }
  pendingDelete = id; btn.textContent = tr("¿Quitar?", "Remove?"); btn.style.opacity = 1; btn.style.width = "auto";
  setTimeout(() => { if (pendingDelete === id) { pendingDelete = null; render(); } }, 2500);
}

/* ---------- Pegar PGN ---------- */
function initPaste() {
  segBind($("pgnColor"));
  $("pgnCancel").onclick = closeModals;
  $("pgnOk").onclick = () => {
    const txt = $("pgnText").value; const color = segValue($("pgnColor")).c || null;
    if (!txt.trim()) { $("pgnErr").textContent = tr("Pegá al menos una partida.", "Paste at least one game."); return; }
    const r = importPgnText(txt, { color });
    if (!r) { $("pgnErr").textContent = tr("No pude leer ese PGN. Revisá que esté completo, con las jugadas numeradas.", "I couldn't read that PGN. Check that it's complete, with numbered moves."); return; }
    closeModals();
    toast(importSummary(r));
    if (r.entries.length === 1) hooks.onOpen(r.entries[0].id);
  };
}
export function openPaste() {
  $("pgnText").value = ""; $("pgnErr").textContent = ""; segSet($("pgnColor"), "c", "");
  openModal("modal"); $("pgnText").focus();
}
