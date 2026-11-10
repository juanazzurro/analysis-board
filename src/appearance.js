// Apariencia: tema claro/oscuro, colores del tablero y juego de piezas. Se aplica con atributos en <html>.
import { store } from "./state.js";
import { tr } from "./i18n.js";

export const BOARDS = [
  { id: "steel", name: tr("Acero", "Steel"), l: "#e4e9f0", d: "#7e93b8" },
  { id: "walnut", name: tr("Nogal", "Walnut"), l: "#f0d9b5", d: "#b58863" },
  { id: "tournament", name: tr("Torneo", "Tournament"), l: "#f0eed6", d: "#5f8f63" },
  { id: "graphite", name: tr("Grafito", "Graphite"), l: "#dcdee2", d: "#8b9099" }
];
export const PIECES = [
  { id: "cburnett", name: tr("Clásicas", "Classic") },
  { id: "merida", name: "Merida" },
  { id: "mpchess", name: "MPChess" },
  { id: "chessnut", name: "Chessnut" }
];
const mq = window.matchMedia("(prefers-color-scheme: dark)");
function applyTheme() { document.documentElement.dataset.theme = mq.matches ? "dark" : "light"; }
mq.addEventListener("change", applyTheme);

export function applyAppearance() {
  const s = store.settings, root = document.documentElement;
  root.dataset.board = BOARDS.some((b) => b.id === s.board) ? s.board : "steel";
  root.dataset.pieces = PIECES.some((p) => p.id === s.pieces) ? s.pieces : "cburnett";
  applyTheme();
}
/** Cambia el tema (system/light/dark): Electron ajusta prefers-color-scheme y la interfaz lo sigue. */
export async function setTheme(t) {
  try { await window.api.setTheme(t); } catch (e) {}
  applyTheme();
}
