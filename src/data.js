// Tus datos: importar PGN (archivo, pegado o arrastrado), exportar partidas y copias de seguridad.
import { store, addGames, enqueueAnalysis, entryFromPgn, saveLibrary, gameOf, flushSaves } from "./state.js";
import { splitPgn } from "./chess-util.js";
import { buildTree, toPgn } from "./tree.js";
import { tr } from "./i18n.js";
import { toast, cleanErr } from "./ui.js";

/**
 * Agrega a la biblioteca las partidas de un texto PGN. Devuelve { entries, added, dup, bad } o null si no había nada legible.
 * opts: { color: "w"|"b"|null }
 */
export function importPgnText(text, opts = {}) {
  const chunks = splitPgn(text || "");
  const entries = []; let bad = 0;
  for (const c of chunks) { try { entries.push(entryFromPgn(c, { userColor: opts.color || null })); } catch (e) { bad++; } }
  if (!entries.length) return null;
  if (opts.color) for (const e of entries) { const ex = store.library.find((g) => g.id === e.id); if (ex) { ex.userColor = opts.color; saveLibrary(); } }
  const added = addGames(entries);
  entries.forEach((e) => enqueueAnalysis(e.id));
  return { entries, added, dup: entries.length - added, bad };
}
export function importSummary(r) {
  if (!r) return tr("No encontré partidas en formato PGN.", "I found no games in PGN format.");
  const { added, dup, bad, entries } = r;
  return added
    ? tr(`${added} ${added === 1 ? "partida agregada" : "partidas agregadas"}${dup ? ` (${dup} ya ${dup === 1 ? "estaba" : "estaban"} en tu lista)` : ""}${bad ? `; ${bad} no se ${bad === 1 ? "pudo" : "pudieron"} leer` : ""}.`,
      `${added} ${added === 1 ? "game" : "games"} added${dup ? ` (${dup} already in your list)` : ""}${bad ? `; ${bad} couldn't be read` : ""}.`)
    : tr(`${entries.length === 1 ? "Esa partida ya estaba" : "Esas partidas ya estaban"} en tu lista.`, `${entries.length === 1 ? "That game is" : "Those games are"} already in your list.`);
}

/** PGN de una partida guardada, con las variantes que le agregaste. */
export function entryPgn(e) {
  const g = gameOf(e);
  const headers = { ...g.headers, White: g.headers.White || e.white, Black: g.headers.Black || e.black, Result: g.headers.Result || (e.result === "½-½" ? "1/2-1/2" : e.result) || "*" };
  return toPgn(headers, buildTree(g, e.vars));
}
const stamp = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export async function exportAllGames() {
  if (!store.library.length) { toast(tr("Todavía no hay partidas para exportar.", "There are no games to export yet.")); return; }
  const out = [];
  for (const e of store.library) { try { out.push(entryPgn(e)); } catch (err) { out.push(e.pgn); } }
  try {
    const r = await window.api.saveFile({ name: `analysis-board-${stamp()}.pgn`, text: out.join("\n"), kind: "pgn" });
    if (r && r.saved) toast(tr(`${out.length} partidas exportadas.`, `${out.length} games exported.`));
  } catch (err) { toast(cleanErr(err), 5000); }
}

const BACKUP_KIND = "analysis-board-backup";
export async function saveBackup() {
  flushSaves();
  const { aiKey, ...settings } = store.settings; void aiKey; // la clave de API no viaja en la copia
  const data = { kind: BACKUP_KIND, version: 1, app: store.sys.version || "", savedAt: new Date().toISOString(), settings, library: store.library, training: store.training, progress: store.progress };
  try {
    const r = await window.api.saveFile({ name: `analysis-board-copia-${stamp()}.json`, text: JSON.stringify(data), kind: "json" });
    if (r && r.saved) toast(tr(`Copia guardada: ${store.library.length} partidas, con sus análisis y tu progreso.`, `Backup saved: ${store.library.length} games, with their analysis and your progress.`), 4500);
  } catch (err) { toast(cleanErr(err), 5000); }
}
/** Restaura una copia: reemplaza partidas, progreso y ajustes, y recarga la app. */
export async function restoreBackup() {
  let files;
  try { files = await window.api.openFile("json"); } catch (err) { toast(cleanErr(err), 5000); return; }
  if (!files || !files[0]) return;
  let data;
  try { data = JSON.parse(files[0].text); } catch (err) { toast(tr("Ese archivo no es una copia de seguridad de Analysis Board.", "That file isn't an Analysis Board backup."), 5000); return; }
  if (!data || data.kind !== BACKUP_KIND || !Array.isArray(data.library)) { toast(tr("Ese archivo no es una copia de seguridad de Analysis Board.", "That file isn't an Analysis Board backup."), 5000); return; }
  const n = data.library.length, mine = store.library.length;
  const when = String(data.savedAt || "").slice(0, 10);
  if (!window.confirm(tr(
    `Vas a reemplazar tus ${mine} partidas y tu progreso por los de la copia del ${when} (${n} partidas). Esto no se puede deshacer. ¿Seguimos?`,
    `You are about to replace your ${mine} games and your progress with those from the ${when} backup (${n} games). This can't be undone. Continue?`))) return;
  flushSaves();
  const settings = { ...store.settings, ...(data.settings || {}), aiKey: store.settings.aiKey, lang: store.settings.lang };
  await window.api.storeSet("library", data.library);
  await window.api.storeSet("training", data.training && typeof data.training === "object" ? data.training : {});
  await window.api.storeSet("progress", data.progress && typeof data.progress === "object" ? data.progress : {});
  await window.api.storeSet("settings", settings);
  window.api.reload();
}
