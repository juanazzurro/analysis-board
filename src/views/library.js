import { familyLabel } from "../openings.js";
import { tr, plural } from "../i18n.js";
import { store, on, addGames, enqueueAnalysis, progress, detectUserColor, removeEntry, saveSettings, entryFromPgn, saveLibrary, findEntry } from "../state.js";
import { splitPgn } from "../chess-util.js";
import { $, esc, toast, fmtDate, segBind, segValue, segSet } from "../ui.js";

let source = "lichess";
let openGame = () => {};

export function initLibrary({ onOpen }) {
  openGame = onOpen;
  const srcSeg = document.querySelector("#view-library .seg");
  segBind(srcSeg, (d) => { source = d.src; $("impUser").value = source === "lichess" ? store.settings.lichessUser : store.settings.chesscomUser; });
  $("impUser").value = store.settings.lichessUser || "";
  if (!store.settings.lichessUser && store.settings.chesscomUser) { source = "chesscom"; segSet(srcSeg, "src", "chesscom"); $("impUser").value = store.settings.chesscomUser; }
  $("impCount").value = String(store.settings.importCount || 25);
  $("impBtn").onclick = doImport;
  $("impUser").addEventListener("keydown", (e) => { if (e.key === "Enter") doImport(); });
  $("libSearch").addEventListener("input", render);
  $("analyseAllBtn").onclick = () => {
    const pend = store.library.filter((g) => !g.analysis);
    if (!pend.length) { toast(tr("No hay partidas pendientes de análisis.", "No games waiting to be analyzed.")); return; }
    pend.forEach((g) => enqueueAnalysis(g.id));
    toast(tr(`${pend.length} ${pend.length === 1 ? "partida en cola" : "partidas en cola"} para analizar.`, `${pend.length} ${pend.length === 1 ? "game" : "games"} queued for analysis.`));
  };
  $("pasteBtn").onclick = openPaste;
  $("libList").addEventListener("click", (e) => {
    const del = e.target.closest(".del");
    if (del) { e.stopPropagation(); askDelete(del.dataset.id, del); return; }
    const row = e.target.closest(".lib-row"); if (row) openGame(row.dataset.id);
  });
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
    toast(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ""), 5000);
  } finally { btn.disabled = false; btn.textContent = tr("Importar", "Import"); }
}

function resultFor(g, uc) {
  if (g.result === "1-0") return uc === "w" ? ["win", "1-0"] : uc === "b" ? ["loss", "1-0"] : ["draw", "1-0"];
  if (g.result === "0-1") return uc === "b" ? ["win", "0-1"] : uc === "w" ? ["loss", "0-1"] : ["draw", "0-1"];
  if (g.result === "½-½" || g.result === "1/2-1/2") return ["draw", "½-½"];
  return ["draw", "*"];
}
/** Apertura para mostrar: la de Lichess, o la que Chess.com pone en ECOUrl. */
function openingLabel(g) {
  let name = g.opening;
  if (!name) { const m = /\[ECOUrl "[^"]*\/openings\/([^"]+)"\]/.exec(g.pgn || ""); if (m) name = decodeURIComponent(m[1]).split("-").filter((w) => w && !/^\d/.test(w)).join(" "); }
  return name ? familyLabel(name) || name.split(":")[0] : "";
}
const SPEED = { bullet: "Bullet", blitz: "Blitz", rapid: tr("Rápida", "Rapid"), classical: tr("Clásica", "Classical"), daily: tr("Diaria", "Daily"), correspondence: tr("Por correspondencia", "Correspondence"), ultraBullet: "Ultrabullet" };

function statusHtml(g, uc) {
  if (progress.id === g.id) {
    const pct = progress.n ? Math.round((progress.i / progress.n) * 100) : 0;
    return `<span class="status">${tr("Analizando", "Analyzing")} <span class="mini"><i style="width:${pct}%"></i></span></span>`;
  }
  if (g.analysis) {
    const s = uc ? g.analysis.stats?.[uc] : null;
    if (s) return `<span class="status">${tr("Precisión", "Accuracy")} <b>${s.acc.toFixed(0)}%</b> · ${s.blunder ? `<span class="c-blunder">${s.blunder}??</span> ` : ""}${s.mistake ? `<span class="c-mistake">${s.mistake}?</span>` : ""}</span>`;
    return `<span class="status">${tr("Analizada", "Analyzed")}</span>`;
  }
  return `<span class="status">${tr("Sin analizar", "Not analyzed")}</span>`;
}

function render() {
  const q = $("libSearch").value.trim().toLowerCase();
  const list = store.library.filter((g) => !q || [g.white, g.black, g.opening, g.result, SPEED[g.speed] || g.speed].join(" ").toLowerCase().includes(q));
  $("libCount").textContent = store.library.length ? tr(`${list.length} de ${store.library.length}`, `${list.length} of ${store.library.length}`) : "";
  if (!store.library.length) {
    $("libList").innerHTML = tr(`<div class="lib-empty"><b>Todavía no hay partidas</b>Escribí tu usuario arriba e importá tus últimas partidas, o pegá un PGN.</div>`, `<div class="lib-empty"><b>No games yet</b>Enter your username above and import your latest games, or paste a PGN.</div>`);
    return;
  }
  if (!list.length) { $("libList").innerHTML = `<div class="lib-empty">${tr("Ninguna partida coincide con la búsqueda.", "No games match your search.")}</div>`; return; }
  $("libList").innerHTML = list.slice(0, 400).map((g) => {
    const uc = detectUserColor(g);
    const [rc, rt] = resultFor(g, uc);
    const meta = [SPEED[g.speed] || g.speed, openingLabel(g), g.source === "lichess" ? "Lichess" : g.source === "chesscom" ? "Chess.com" : g.source === "play" ? "vs Stockfish" : "PGN"].filter(Boolean).join(" · ");
    return `<div class="lib-row" data-id="${esc(g.id)}" role="button" tabindex="0">
      <span class="date">${fmtDate(g.date)}</span>
      <span class="players">
        <span class="${uc === "w" ? "me" : ""}"><i class="pdot w"></i>${esc(g.white)} ${g.whiteElo ? `<small>${g.whiteElo}</small>` : ""}</span>
        <span class="${uc === "b" ? "me" : ""}"><i class="pdot b"></i>${esc(g.black)} ${g.blackElo ? `<small>${g.blackElo}</small>` : ""}</span>
      </span>
      <span class="res ${rc}">${rt}</span>
      <span class="meta">${esc(meta)}</span>
      ${statusHtml(g, uc)}
      <button class="del" type="button" data-id="${esc(g.id)}" title="${tr("Quitar de la lista", "Remove from list")}" aria-label="${tr("Quitar partida", "Remove game")}">✕</button>
    </div>`;
  }).join("");
}
function renderProgressOnly() {
  const row = progress.id ? document.querySelector(`.lib-row[data-id="${CSS.escape(progress.id)}"] .status .mini i`) : null;
  if (row) { if (progress.n) row.style.width = Math.round((progress.i / progress.n) * 100) + "%"; }
  else render();
}

let pendingDelete = null;
function askDelete(id, btn) {
  if (pendingDelete === id) { removeEntry(id); pendingDelete = null; toast(tr("Partida quitada.", "Game removed.")); return; }
  pendingDelete = id; btn.textContent = tr("¿Sí?", "Sure?"); btn.style.opacity = 1; btn.style.width = "auto";
  setTimeout(() => { if (pendingDelete === id) { pendingDelete = null; render(); } }, 2500);
}

/* ---------- Pegar PGN ---------- */
function initPaste() {
  segBind($("pgnColor"));
  $("pgnCancel").onclick = () => { $("modal").hidden = true; };
  $("modal").addEventListener("click", (e) => { if (e.target === $("modal")) $("modal").hidden = true; });
  $("pgnOk").onclick = () => {
    const txt = $("pgnText").value; const color = segValue($("pgnColor")).c || null;
    const chunks = splitPgn(txt);
    if (!chunks.length) { $("pgnErr").textContent = tr("Pegá al menos una partida.", "Paste at least one game."); return; }
    const entries = []; let bad = 0;
    for (const c of chunks) { try { entries.push(entryFromPgn(c, { userColor: color })); } catch (e) { bad++; } }
    if (!entries.length) { $("pgnErr").textContent = tr("No pude leer ese PGN. Revisá que esté completo, con las jugadas numeradas.", "I couldn't read that PGN. Check that it's complete, with numbered moves."); return; }
    for (const e of entries) {
      const existing = store.library.find((g) => g.id === e.id);
      if (existing && color) { existing.userColor = color; saveLibrary(); }
    }
    const added = addGames(entries);
    $("modal").hidden = true;
    entries.forEach((e) => enqueueAnalysis(e.id));
    const dup = entries.length - added;
    toast(added
      ? tr(`${added} ${added === 1 ? "partida agregada" : "partidas agregadas"}${dup ? ` (${dup} ya ${dup === 1 ? "estaba" : "estaban"} en tu lista)` : ""}${bad ? ` · ${bad} no se ${bad === 1 ? "pudo" : "pudieron"} leer` : ""}.`,
        `${added} ${added === 1 ? "game" : "games"} added${dup ? ` (${dup} already in your list)` : ""}${bad ? ` · ${bad} couldn't be read` : ""}.`)
      : tr(`${entries.length === 1 ? "Esa partida ya estaba" : "Esas partidas ya estaban"} en tu lista.`, `${entries.length === 1 ? "That game is" : "Those games are"} already in your list.`));
    if (entries.length === 1) openGame(entries[0].id);
  };
}
function openPaste() {
  $("pgnText").value = ""; $("pgnErr").textContent = ""; segSet($("pgnColor"), "c", "");
  $("modal").hidden = false; $("pgnText").focus();
}
