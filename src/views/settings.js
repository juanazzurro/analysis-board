import { store, saveSettings, engines, emit, autoThreads, on } from "../state.js";
import { setSoundEnabled } from "../sound.js";
import { $, toast, esc, segSet, cleanErr } from "../ui.js";
import { tr, LANG } from "../i18n.js";
import { BOARDS, PIECES, applyAppearance, setTheme } from "../appearance.js";
import { upd, checkUpdates, installUpdate, fmtMB } from "../updates.js";
import { saveBackup, restoreBackup, exportAllGames } from "../data.js";

const MODEL = "claude-sonnet-5-5";

export async function initSettings(hooks = {}) {
  const s = store.settings;
  const cores = store.sys.cores || 4;
  const thr = $("stThreads");
  thr.innerHTML = `<option value="0">${tr(`Automático (${autoThreads()} de ${cores})`, `Automatic (${autoThreads()} of ${cores})`)}</option>` + Array.from({ length: cores }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("");
  $("stLichess").value = s.lichessUser || "";
  $("stChesscom").value = s.chesscomUser || "";
  $("stDepth").value = s.depth;
  thr.value = String(s.threads || 0);
  $("stHash").value = String(s.hash || 256);
  $("stLines").value = String(s.liveLines || 3);
  $("stSound").checked = !!s.sound;
  $("stInacc").checked = !!s.learnInacc;
  $("stSelfReview").checked = s.selfReview !== false;
  $("stAutoImport").checked = s.autoImport !== false;
  $("stDaily").value = String(s.dailyPuzzles || 10);
  $("stKey").value = s.aiKey || "";
  $("stModel").value = s.aiModel || MODEL;
  $("stAutoUpd").checked = s.autoUpdate !== false;
  $("stNotation").value = ["fig", "es", "en"].includes(s.notation) ? s.notation : "fig";
  try { $("stPath").textContent = await window.api.storePath(); } catch (e) {}
  $("stVersion").textContent = store.sys.version || "–";
  $("stLang").value = LANG;
  $("stTextSize").value = String(s.textSize || 100);

  const save = (k, v, after) => { store.settings[k] = v; saveSettings(); if (after) after(); };

  /* ---- apariencia ---- */
  segSet($("stTheme"), "t", ["light", "dark"].includes(s.theme) ? s.theme : "system");
  $("stTheme").addEventListener("click", (e) => {
    const b = e.target.closest(".seg-btn"); if (!b) return;
    segSet($("stTheme"), "t", b.dataset.t);
    save("theme", b.dataset.t, () => setTheme(b.dataset.t));
  });
  const swatches = () => {
    $("stBoard").innerHTML = BOARDS.map((b) => `<button type="button" class="swatch${(store.settings.board || "steel") === b.id ? " on" : ""}" data-board="${b.id}" style="--l:${b.l};--d:${b.d}"><i></i>${esc(b.name)}</button>`).join("");
    $("stPieces").innerHTML = PIECES.map((p) => `<button type="button" class="swatch${(store.settings.pieces || "cburnett") === p.id ? " on" : ""}" data-pieces="${p.id}"><i class="pc cg-wrap" data-set="${p.id}"><piece class="knight white" style="position:static;display:block;width:100%;height:100%;background-size:cover"></piece></i>${esc(p.name)}</button>`).join("");
  };
  swatches();
  $("stBoard").addEventListener("click", (e) => { const b = e.target.closest("[data-board]"); if (b) save("board", b.dataset.board, () => { applyAppearance(); swatches(); }); });
  $("stPieces").addEventListener("click", (e) => { const b = e.target.closest("[data-pieces]"); if (b) save("pieces", b.dataset.pieces, () => { applyAppearance(); swatches(); }); });
  // La notación y el idioma cambian todos los textos: se guarda el ajuste y se recarga la interfaz.
  $("stNotation").addEventListener("change", async (e) => { store.settings.notation = e.target.value; await saveSettings(); window.api.reload(); });
  $("stTextSize").addEventListener("change", (e) => save("textSize", +e.target.value, () => { window.api.setZoom(+e.target.value / 100); window.dispatchEvent(new Event("resize")); }));
  $("stLang").addEventListener("change", async (e) => { store.settings.lang = e.target.value; await saveSettings(); window.api.setLang(e.target.value); });
  $("stSound").addEventListener("change", (e) => save("sound", e.target.checked, () => setSoundEnabled(e.target.checked)));

  /* ---- cuentas, motor, entrenamiento ---- */
  $("stLichess").addEventListener("change", (e) => save("lichessUser", e.target.value.trim(), () => emit("library")));
  $("stChesscom").addEventListener("change", (e) => save("chesscomUser", e.target.value.trim(), () => emit("library")));
  $("stDepth").addEventListener("change", (e) => save("depth", e.target.value));
  $("stLines").addEventListener("change", (e) => save("liveLines", +e.target.value));
  const restart = async () => {
    toast(tr("Reiniciando el motor…", "Restarting the engine…"));
    await window.api.engineStop("analysis");
    await engines.analysis.start({ threads: store.settings.threads || autoThreads(), hash: store.settings.hash || 256 }).catch(() => {});
    emit("engines", engines.analysis.ready ? null : tr("No se pudo reiniciar el motor.", "Couldn't restart the engine."));
  };
  thr.addEventListener("change", (e) => save("threads", +e.target.value, restart));
  $("stHash").addEventListener("change", (e) => save("hash", +e.target.value, restart));
  $("stInacc").addEventListener("change", (e) => save("learnInacc", e.target.checked, () => emit("library")));
  $("stSelfReview").addEventListener("change", (e) => save("selfReview", e.target.checked));
  $("stAutoImport").addEventListener("change", (e) => save("autoImport", e.target.checked));
  $("stDaily").addEventListener("change", (e) => save("dailyPuzzles", +e.target.value, () => emit("activity")));

  /* ---- IA ---- */
  $("stKey").addEventListener("change", (e) => save("aiKey", e.target.value.trim(), () => emit("ai")));
  $("stModel").addEventListener("change", (e) => save("aiModel", e.target.value.trim() || MODEL));
  $("stTestAi").onclick = async () => {
    const key = $("stKey").value.trim(); const msg = $("stAiMsg");
    if (!key) { msg.textContent = tr("Pegá una clave primero.", "Paste a key first."); return; }
    msg.textContent = tr("Probando…", "Testing…");
    try {
      await window.api.aiAsk({ prompt: "Respondé solo: OK", key, model: $("stModel").value.trim() || MODEL, maxTokens: 10 });
      msg.textContent = tr("La clave funciona.", "The key works.");
    } catch (e) { msg.textContent = cleanErr(e); }
  };

  /* ---- actualizaciones ---- */
  $("stAutoUpd").addEventListener("change", (e) => save("autoUpdate", e.target.checked));
  $("stReleases").onclick = (e) => { e.preventDefault(); window.api.openExternal("https://github.com/juanazzurro/analysis-board/releases"); };
  $("stUpdate").onclick = async () => {
    const msg = $("stUpdateMsg"); msg.textContent = "";
    try {
      const r = await window.api.installUpdate();
      if (r && r.version) msg.textContent = tr(`Instalando la versión ${r.version}. La app se reinicia sola…`, `Installing version ${r.version}. The app will restart by itself…`);
    } catch (e) { msg.textContent = cleanErr(e); }
  };
  $("stCheck").onclick = () => { if (upd.state === "available") installUpdate(); else checkUpdates(true); };
  const renderUpd = () => {
    const btn = $("stCheck"), msg = $("stCheckMsg"), i = upd.info;
    btn.disabled = ["checking", "downloading", "installing"].includes(upd.state);
    btn.textContent = upd.state === "available" && i && i.hasAsset && i.canInstall ? tr(`Actualizar a la ${i.latest}`, `Update to ${i.latest}`) : tr("Buscar actualizaciones", "Check for updates");
    msg.textContent = upd.state === "checking" ? tr("Buscando…", "Checking…")
      : upd.state === "current" ? (i && i.latest ? tr("Tenés la última versión.", "You have the latest version.") : tr("Todavía no hay versiones publicadas.", "No published versions yet."))
      : upd.state === "available" ? tr(`Hay una versión nueva: ${i.latest}${i.size ? ` (${fmtMB(i.size)})` : ""}.`, `A new version is available: ${i.latest}${i.size ? ` (${fmtMB(i.size)})` : ""}.`)
      : upd.state === "downloading" ? tr(`Descargando… ${Math.round(upd.progress * 100)}%`, `Downloading… ${Math.round(upd.progress * 100)}%`)
      : upd.state === "installing" ? tr("Instalando: la app se reinicia sola…", "Installing: the app will restart by itself…")
      : upd.state === "error" ? upd.error : "";
  };
  on("update", renderUpd); renderUpd();

  /* ---- datos ---- */
  $("stBackup").onclick = saveBackup;
  $("stRestore").onclick = restoreBackup;
  $("stExportAll").onclick = exportAllGames;
  $("stShortcuts").onclick = () => hooks.runCommand && hooks.runCommand("shortcuts");
  $("stLog").onclick = async () => {
    try {
      const text = await window.api.supportReport();
      const r = await window.api.saveFile({ name: "analysis-board-log.txt", text, kind: "txt" });
      if (r && r.saved) $("stHelpMsg").textContent = tr("Registro guardado.", "Log saved.");
    } catch (e) { toast(cleanErr(e), 5000); }
  };
  $("stReport").onclick = () => {
    const v = store.sys.version || "";
    const body = tr(`**Qué pasó**\n\n\n**Qué esperabas que pasara**\n\n\n**Pasos para repetirlo**\n1. \n\n---\nAnalysis Board ${v} · ${store.sys.platform || ""}\n(Adjuntá el registro: Ajustes → Ayuda → Exportar registro)`,
      `**What happened**\n\n\n**What you expected**\n\n\n**Steps to reproduce**\n1. \n\n---\nAnalysis Board ${v} · ${store.sys.platform || ""}\n(Attach the log: Settings → Help → Export log)`);
    window.api.openExternal("https://github.com/juanazzurro/analysis-board/issues/new?body=" + encodeURIComponent(body));
  };
}
