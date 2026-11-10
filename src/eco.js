// Libro de aperturas: nombre exacto y código ECO de una partida, y hasta qué jugada siguió la teoría.
import { ECO_ROWS, ECO_MAX_PLY } from "./eco-data.js";
import { posKey } from "./eco-key.js";

let table = null;
function load() {
  if (table) return table;
  table = new Map();
  for (const line of ECO_ROWS.split("\n")) { const i = line.indexOf("\t"), j = line.indexOf("\t", i + 1); table.set(line.slice(0, i), { eco: line.slice(i + 1, j), name: line.slice(j + 1) }); }
  return table;
}
const cache = new WeakMap();
/**
 * Recorre las posiciones de la partida y devuelve, para cada jugada, la apertura conocida más profunda alcanzada hasta ahí.
 * { ply, eco, name, at: [por posición → {eco,name}|null] }; ply = última jugada que todavía es teoría (0 si ninguna).
 */
export function bookOf(game) {
  let b = cache.get(game); if (b) return b;
  const t = load(); const at = [null]; let last = null, ply = 0;
  // Solo vale desde la posición inicial normal.
  const standard = game.fens[0].startsWith("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq");
  const n = standard ? Math.min(game.fens.length - 1, ECO_MAX_PLY) : 0;
  for (let k = 1; k <= n; k++) { const hit = t.get(posKey(game.fens[k])); if (hit) { last = hit; ply = k; } at.push(last); }
  b = { ply, eco: last ? last.eco : "", name: last ? last.name : "", at };
  cache.set(game, b);
  return b;
}
/** ¿La jugada k (0 = primera) sigue dentro de la teoría? */
export const isBook = (game, k) => k < bookOf(game).ply;
/** Apertura alcanzada en la posición `ply` (o la última conocida antes). */
export function openingAt(game, ply) { const b = bookOf(game); return b.at[Math.min(ply, b.at.length - 1)] || null; }
