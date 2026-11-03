import { Chessground } from "chessground";
import { dests } from "./chess-util.js";
import { playMoveSound } from "./sound.js";

const boards = new Set();

export function makeBoard(el, extra = {}) {
  const cg = Chessground(el, {
    coordinates: true,
    animation: { enabled: true, duration: 220 },
    highlight: { lastMove: true, check: true },
    movable: { free: false, color: undefined, showDests: true },
    premovable: { enabled: false },
    draggable: { enabled: true, showGhost: true },
    selectable: { enabled: true },
    drawable: { enabled: true, visible: true, defaultSnapToValidMove: true },
    ...extra
  });
  boards.add(cg);
  return cg;
}

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
