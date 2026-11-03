const fs = require("fs");
import { Chess, parseGame, tryMove, pvToSan, clockAt, phaseOf, openingName } from "../src/chess-util.js";
import { classifyError, MOTIFS, nullMoveFen } from "../src/motifs.js";
import { openingFamilyEs } from "../src/openings.js";
import { explainMove } from "../src/explain.js";
import { LESSONS } from "../src/endgames-data.js";
const [libPath, users] = [process.argv[2], (process.argv[3] || "").toLowerCase().split(",")];
const lib = JSON.parse(fs.readFileSync(libPath, "utf8"));
const issues = []; const motifs = {}; const fams = {}; let errs = 0, threats = 0, clocks = 0, pressure = 0;
const legal = (fen, uci) => { try { const c = new Chess(fen); return !!tryMove(c, uci); } catch (e) { return false; } };
for (const e of lib) {
  const uc = users.includes(String(e.white).toLowerCase()) ? "w" : users.includes(String(e.black).toLowerCase()) ? "b" : null;
  let g; try { g = parseGame(e.pgn); } catch (err) { issues.push("parse " + e.id + " " + err.message); continue; }
  if (uc) { const f = openingFamilyEs(openingName(e, g.headers), g.moves.slice(0, 8).map((m) => m.san)); fams[f] = (fams[f] || 0) + 1; }
  if (!e.analysis) continue;
  const an = e.analysis;
  if (an.evals.length !== g.fens.length) issues.push(`evals length ${e.id}: ${an.evals.length} vs ${g.fens.length}`);
  for (let k = 0; k < g.moves.length; k++) {
    const x = an.info[k]; if (!x) { issues.push(`info null ${e.id} k=${k}`); continue; }
    try { explainMove(g, an, k, uc); } catch (err) { issues.push(`explain ${e.id} k=${k} ${err.message}`); }
    const B = an.evals[k];
    if (B && B.best && !legal(g.fens[k], B.best)) issues.push(`best ilegal ${e.id} k=${k} ${B.best}`);
    if (!uc || g.moves[k].color !== uc || !["mistake", "blunder"].includes(x.c)) continue;
    errs++;
    let r; try { r = classifyError(g, an, k); } catch (err) { issues.push(`classify ${e.id} k=${k} ${err.stack.split("\n").slice(0, 3).join(" | ")}`); continue; }
    if (!r) { issues.push(`classify null ${e.id} k=${k}`); continue; }
    motifs[r.motif] = (motifs[r.motif] || 0) + 1;
    if (r.clock) { clocks++; if (r.clock.pressure) pressure++; if (r.clock.spent != null && (r.clock.spent < 0 || r.clock.spent > 3600)) issues.push(`clock raro ${e.id} k=${k} ${JSON.stringify(r.clock)}`); }
    if (r.threat) {
      threats++;
      const nf = nullMoveFen(g.fens[k]);
      if (!legal(nf, r.threat)) issues.push(`amenaza ilegal ${e.id} k=${k} ${r.threat}`);
      if (!pvToSan(nf, [r.threat], 1)[0]) issues.push(`amenaza sin SAN ${e.id} k=${k}`);
    }
  }
}
// Problemas
const pz = JSON.parse(fs.readFileSync(__dirname + "/../data/puzzles-base.json", "utf8"));
let pzBad = 0, pzMateBad = 0; const pzThemes = {};
for (const [id, fen, moves, rating, themes] of pz) {
  const ms = moves.split(" ");
  let c; try { c = new Chess(fen); } catch (e) { pzBad++; continue; }
  let ok = true;
  for (const u of ms) { if (!tryMove(c, u)) { ok = false; break; } }
  if (!ok) { pzBad++; if (pzBad < 5) issues.push(`problema ${id} jugada ilegal`); continue; }
  if (ms.length % 2 !== 0) { pzBad++; if (pzBad < 5) issues.push(`problema ${id} cantidad impar de jugadas ${ms.length}`); }
  if (/mateIn\d/.test(themes) && !c.isCheckmate()) { pzMateBad++; if (pzMateBad < 5) issues.push(`problema ${id} (${themes}) no termina en mate`); }
  for (const t of themes.split(" ")) pzThemes[t] = (pzThemes[t] || 0) + 1;
  if (!(rating >= 300 && rating <= 3200)) issues.push(`problema ${id} rating raro ${rating}`);
}
// Finales
for (const l of LESSONS) for (const [i, fen] of l.positions.entries()) {
  try { const c = new Chess(fen); if (c.isGameOver()) issues.push(`final ${l.id}#${i} ya terminado`); } catch (e) { issues.push(`final ${l.id}#${i} FEN inválido ${e.message}`); }
}
console.log("errores clasificados", errs, "motivos", JSON.stringify(motifs));
console.log("con reloj", clocks, "apurado", pressure, "amenazas", threats);
console.log("aperturas", JSON.stringify(fams));
console.log("problemas", pz.length, "inválidos", pzBad, "mate mal", pzMateBad);
console.log("PROBLEMAS (" + issues.length + "):\n" + issues.slice(0, 40).join("\n"));
