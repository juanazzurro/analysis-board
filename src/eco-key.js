// Huella corta de una posición (piezas, turno, enroques y captura al paso), para buscarla en la tabla de aperturas.
function fnv(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
export function posKey(fen) {
  const epd = fen.split(" ").slice(0, 4).join(" ");
  return fnv(epd, 2166136261).toString(36) + "." + fnv(epd, 3339675911).toString(36);
}
