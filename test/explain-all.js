// Recorre todas las jugadas de una biblioteca analizada y genera las explicaciones (ES o EN según MESA_LANG).
const fs = require("fs");
import { parseGame } from "../src/chess-util.js";
import { explainMove } from "../src/explain.js";
import { diagnoseEntry, MOTIFS } from "../src/motifs.js";
const lib = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const user = (process.argv[3] || "").toLowerCase();
let n = 0, errors = 0; const samples = new Map();
for (const e of lib) {
  if (!e.analysis) continue;
  const g = parseGame(e.pgn);
  const uc = String(e.white).toLowerCase() === user ? "w" : String(e.black).toLowerCase() === user ? "b" : null;
  for (let k = 0; k < g.moves.length; k++) {
    try {
      const r = explainMove(g, e.analysis, k, uc); n++;
      if (r && !samples.has(r.headline) ) samples.set(r.headline, `${g.moves[k].san}: ${r.paragraphs.join(" ")}${r.tip ? " | TIP " + r.tip : ""}`);
    } catch (err) { errors++; if (errors < 4) console.log("ERR", e.id, k, err.stack.split("\n").slice(0, 3).join(" | ")); }
  }
  if (uc) { delete e.diag; delete e.diags; const d = diagnoseEntry(e, g, uc); for (const it of d.items) if (!MOTIFS[it.motif]) { errors++; console.log("motivo raro", it.motif); } }
}
for (const [h, t] of samples) console.log("•", h, "—", t.slice(0, 260));
console.log("explicaciones", n, "errores", errors);
if (errors || !n) process.exitCode = 1;
