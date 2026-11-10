// Arma src/eco-data.js a partir de la tabla de aperturas de Lichess (data/eco/*.tsv, dominio público, CC0):
// https://github.com/lichess-org/chess-openings
// Para cada apertura guarda el código ECO, el nombre y una huella de la posición final, así se reconoce por posición
// (también por transposición) sin volver a jugar nada al abrir la app.  Uso: node tools/build-eco.mjs
import fs from "node:fs";
import { Chess } from "chess.js";
import { posKey } from "../src/eco-key.js";
const rows = [];
for (const f of ["a", "b", "c", "d", "e"]) {
  const lines = fs.readFileSync(`data/eco/${f}.tsv`, "utf8").split("\n").slice(1);
  for (const line of lines) { const [eco, name, pgn] = line.split("\t"); if (eco && name && pgn) rows.push({ eco, name, pgn }); }
}
const seen = new Map(), out = [];
let maxPly = 0;
for (const r of rows) {
  const c = new Chess();
  c.loadPgn(r.pgn);
  const ply = c.history().length; maxPly = Math.max(maxPly, ply);
  const key = posKey(c.fen());
  if (seen.has(key)) continue;         // misma posición por otro orden de jugadas: queda el primer nombre
  seen.set(key, 1);
  out.push(`${key}\t${r.eco}\t${r.name}`);
}
fs.writeFileSync("src/eco-data.js", `// Generado por tools/build-eco.mjs a partir de lichess-org/chess-openings (CC0). No editar a mano.\nexport const ECO_MAX_PLY = ${maxPly};\nexport const ECO_ROWS = ${JSON.stringify(out.join("\n"))};\n`);
console.log(out.length, "aperturas,", rows.length - out.length, "transposiciones repetidas, hasta la jugada", Math.ceil(maxPly / 2));
