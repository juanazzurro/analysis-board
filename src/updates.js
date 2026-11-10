// Actualizaciones: le pregunta a GitHub cuál es la última versión, la baja y la instala (la app se reemplaza y se reabre sola).
import { store, emit } from "./state.js";
import { tr } from "./i18n.js";
import { cleanErr } from "./ui.js";

export const upd = { state: "idle", info: null, error: "", progress: 0 }; // idle | checking | available | current | downloading | installing | error
const set = (o) => { Object.assign(upd, o); emit("update"); };

export async function checkUpdates(manual = false) {
  if (upd.state === "checking" || upd.state === "downloading" || upd.state === "installing") return upd;
  set({ state: "checking", error: "" });
  try {
    const info = await window.api.checkUpdate();
    set({ state: info.newer ? "available" : "current", info });
  } catch (e) {
    // Si la búsqueda fue automática y no hay internet, no se molesta a nadie.
    set({ state: manual ? "error" : "idle", error: manual ? cleanErr(e) : "" });
  }
  return upd;
}
export async function installUpdate() {
  if (upd.state === "downloading" || upd.state === "installing") return;
  set({ state: "downloading", progress: 0, error: "" });
  try {
    const r = await window.api.downloadUpdate();
    if (r && r.version && !r.downloaded) set({ state: "installing" });
    else set({ state: "error", error: tr("La descarga terminó, pero la instalación automática solo funciona en la Mac.", "The download finished, but automatic installation only works on a Mac.") });
  } catch (e) { set({ state: "error", error: cleanErr(e) }); }
}
export function initUpdates() {
  window.api.onUpdateProgress((p) => { if (upd.state === "downloading") { upd.progress = p.total ? p.received / p.total : 0; emit("update"); } });
  if (store.settings.autoUpdate !== false) setTimeout(() => checkUpdates(false), 2500);
}
export const fmtMB = (b) => (b / 1048576).toFixed(0) + " MB";
