import { Chessground } from "chessground";
import { dests } from "./chess-util.js";
import { playMoveSound } from "./sound.js";

const boards = new Set();

export function makeBoard(el, extra = {}) {
  const cg = Chessground(el, {
    coordinates: true,
    animation: { enabled: true, duration: 200 },
    highlight: { lastMove: true, check: true },
    movable: { free: false, color: undefined, showDests: true },
    premovable: { enabled: false },
    draggable: { enabled: true, showGhost: true },
    selectable: { enabled: true },
    drawable: { enabled: true, visible: true, defaultSnapToValidMove: true, brushes: BRUSHES },
    ...extra
  });
  cg.host = el;
  boards.add(cg);
  return cg;
}

// Flechas: verde = mejor jugada, azul = alternativas, además de los colores para dibujar a mano (clic derecho).
const BRUSHES = {
  green: { key: "g", color: "#15781B", opacity: 1, lineWidth: 10 },
  red: { key: "r", color: "#882020", opacity: 1, lineWidth: 10 },
  blue: { key: "b", color: "#003088", opacity: 1, lineWidth: 10 },
  yellow: { key: "y", color: "#e68f00", opacity: 1, lineWidth: 10 },
  paleBlue: { key: "pb", color: "#2f5bd8", opacity: 0.38, lineWidth: 12 },
  paleGreen: { key: "pg", color: "#15781B", opacity: 0.5, lineWidth: 14 },
  paleRed: { key: "pr", color: "#882020", opacity: 0.4, lineWidth: 14 },
  paleGrey: { key: "pgr", color: "#4a4a4a", opacity: 0.35, lineWidth: 14 },
  best: { key: "be", color: "#2346d2", opacity: 0.78, lineWidth: 13 },
  alt: { key: "al", color: "#2346d2", opacity: 0.3, lineWidth: 10 }
};

export function redrawAll() {
  for (const cg of boards) {
    const wrap = cg.state.dom.elements.wrap;
    if (!wrap || !wrap.offsetWidth) continue;
    try { cg.redrawAll(); } catch (e) {}
  }
}

/**
 * Sincroniza el tablero con una posición de chess.js.
 * opts: { orientation, lastMove:[from,to], movable:boolean|"w"|"b", shapes:[], sound:{captured,check}|null }
 */
export function syncBoard(cg, chess, opts = {}) {
  const turn = chess.turn() === "w" ? "white" : "black";
  let movColor;
  if (opts.movable === true) movColor = turn;
  else if (opts.movable === "w") movColor = "white";
  else if (opts.movable === "b") movColor = "black";
  // Mientras se elige la pieza de coronación el tablero no se redibuja (el análisis de fondo no debe cerrar el selector).
  if (promoOpen(cg)) return;
  cg.set({
    fen: chess.fen(),
    orientation: opts.orientation || cg.state.orientation,
    turnColor: turn,
    check: chess.inCheck() ? turn : false,
    lastMove: opts.lastMove || undefined,
    movable: { color: movColor, dests: movColor ? dests(chess) : new Map(), free: false },
    drawable: { autoShapes: opts.shapes || [] }
  });
  if (opts.sound) playMoveSound(opts.sound);
}

export function arrow(uci, brush = "paleGreen") {
  if (!uci) return null;
  return { orig: uci.slice(0, 2), dest: uci.slice(2, 4), brush };
}

/* ---------- Coronación: elegir la pieza ---------- */
const promoOpen = (cg) => !!(cg.host && cg.host.parentElement && cg.host.parentElement.querySelector(".promo"));
function closePromotion(cg) {
  const box = cg.host && cg.host.parentElement;
  const old = box && box.querySelector(".promo");
  if (old) { const done = old._done; old.remove(); if (done) done(null); }
}
/**
 * Si mover de `orig` a `dest` es una coronación, muestra las cuatro piezas sobre la columna y espera la elección.
 * Devuelve undefined si no es coronación, la letra elegida ("q", "r", "b", "n") o null si se canceló.
 */
export function pickPromotion(cg, chess, orig, dest) {
  const p = chess.get(orig);
  if (!p || p.type !== "p" || (dest[1] !== "8" && dest[1] !== "1")) return Promise.resolve(undefined);
  // Solo si de verdad es una jugada legal de coronación.
  if (!chess.moves({ square: orig, verbose: true }).some((m) => m.to === dest && m.promotion)) return Promise.resolve(undefined);
  const box = cg.host.parentElement;
  closePromotion(cg);
  return new Promise((resolve) => {
    const color = p.color === "w" ? "white" : "black";
    const flipped = cg.state.orientation === "black";
    const file = dest.charCodeAt(0) - 97;
    const col = flipped ? 7 - file : file;
    const fromTop = (dest[1] === "8") !== flipped; // la casilla de coronación queda arriba en pantalla
    const ov = document.createElement("div"); ov.className = "promo";
    const colEl = document.createElement("div"); colEl.className = "promo-col cg-wrap";
    colEl.style.left = col * 12.5 + "%"; colEl.style[fromTop ? "top" : "bottom"] = "0";
    const order = fromTop ? ["q", "n", "r", "b"] : ["b", "r", "n", "q"];
    const names = { q: "queen", r: "rook", b: "bishop", n: "knight" };
    const done = (v) => { ov._done = null; ov.remove(); document.removeEventListener("keydown", onKey, true); resolve(v); };
    const onKey = (e) => { e.stopPropagation(); e.preventDefault(); if (e.key === "Escape") done(null); };
    for (const k of order) {
      const b = document.createElement("button"); b.type = "button"; b.dataset.p = k; b.setAttribute("aria-label", names[k]);
      b.innerHTML = `<piece class="${names[k]} ${color}"></piece>`;
      b.onclick = (e) => { e.stopPropagation(); done(k); };
      colEl.appendChild(b);
    }
    ov.appendChild(colEl);
    ov.onclick = () => done(null);
    ov._done = resolve;
    document.addEventListener("keydown", onKey, true);
    box.appendChild(ov);
  });
}
