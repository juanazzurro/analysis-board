import { store, saveSettings, engines, startEngines, emit, autoThreads } from "../state.js";
import { setSoundEnabled } from "../sound.js";
import { $, toast } from "../ui.js";
import { tr, LANG } from "../i18n.js";

export async function initSettings() {
  const s = store.settings;
  const cores = store.sys.cores || 4;
  const thr = $("stThreads");
  thr.innerHTML = `<option value="0">${tr(`Automático (${autoThreads()} de ${cores})`, `Automatic (${autoThreads()} of ${cores})`)}</option>` + Array.from({ length: cores }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("");
  $("stLichess").value = s.lichessUser || "";
  $("stChesscom").value = s.chesscomUser || "";
  $("stDepth").value = s.depth;
  thr.value = String(s.threads || 0);
  $("stHash").value = String(s.hash || 256);
  $("stSound").checked = !!s.sound;
  $("stInacc").checked = !!s.learnInacc;
  $("stSelfReview").checked = s.selfReview !== false;
  $("stDaily").value = String(s.dailyPuzzles || 10);
  $("stKey").value = s.aiKey || "";
  $("stModel").value = s.aiModel || "claude-sonnet-5-5";
  try { $("stPath").textContent = await window.api.storePath(); } catch (e) {}
  $("stVersion").textContent = store.sys.version || "–";
  $("stLang").value = LANG;
  // Cambiar el idioma guarda el ajuste y recarga la interfaz (los menús de la Mac también cambian).
  $("stLang").addEventListener("change", async (e) => { store.settings.lang = e.target.value; await saveSettings(); window.api.setLang(e.target.value); });
  $("stReleases").onclick = (e) => { e.preventDefault(); window.api.openExternal("https://github.com/juanazzurro/analysis-board/releases"); };
  $("stUpdate").onclick = async () => {
    const msg = $("stUpdateMsg"); msg.textContent = "";
    try {
      const r = await window.api.installUpdate();
      if (r && r.version) msg.textContent = tr(`Instalando la versión ${r.version}. La app se reinicia sola…`, `Installing version ${r.version}. The app will restart by itself…`);
    } catch (e) { msg.textContent = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ""); }
  };

  const save = (k, v, after) => { store.settings[k] = v; saveSettings(); if (after) after(); };
  $("stLichess").addEventListener("change", (e) => save("lichessUser", e.target.value.trim(), () => emit("library")));
  $("stChesscom").addEventListener("change", (e) => save("chesscomUser", e.target.value.trim(), () => emit("library")));
  $("stDepth").addEventListener("change", (e) => save("depth", e.target.value));
  const restart = async () => {
    toast(tr("Reiniciando el motor…", "Restarting the engine…"));
    await window.api.engineStop("analysis");
    await engines.analysis.start({ threads: store.settings.threads || autoThreads(), hash: store.settings.hash || 256 }).catch(() => {});
    emit("engines", engines.analysis.ready ? null : tr("No se pudo reiniciar el motor.", "Couldn't restart the engine."));
  };
  thr.addEventListener("change", (e) => save("threads", +e.target.value, restart));
  $("stHash").addEventListener("change", (e) => save("hash", +e.target.value, restart));
  $("stSound").addEventListener("change", (e) => save("sound", e.target.checked, () => setSoundEnabled(e.target.checked)));
  $("stInacc").addEventListener("change", (e) => save("learnInacc", e.target.checked, () => emit("library")));
  $("stSelfReview").addEventListener("change", (e) => save("selfReview", e.target.checked));
  $("stDaily").addEventListener("change", (e) => save("dailyPuzzles", +e.target.value, () => emit("activity")));
  $("stKey").addEventListener("change", (e) => save("aiKey", e.target.value.trim(), () => emit("ai")));
  $("stModel").addEventListener("change", (e) => save("aiModel", e.target.value.trim() || "claude-sonnet-5-5"));
  $("stTestAi").onclick = async () => {
    const key = $("stKey").value.trim(); const msg = $("stAiMsg");
    if (!key) { msg.textContent = tr("Pegá una clave primero.", "Paste a key first."); return; }
    msg.textContent = tr("Probando…", "Testing…");
    try {
      await window.api.aiAsk({ prompt: "Respondé solo: OK", key, model: $("stModel").value.trim() || "claude-sonnet-5-5", maxTokens: 10 });
      msg.textContent = tr("La clave funciona.", "The key works.");
    } catch (e) { msg.textContent = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ""); }
  };
  void startEngines;
}
