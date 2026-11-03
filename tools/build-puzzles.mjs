// Arma data/puzzles-base.json a partir de un subconjunto abierto de la base de Lichess (CC0), clasificando temas.
import fs from "fs";
import { Chess } from "chess.js";
import { isFork, pinOf, attackedTargets } from "../src/explain.js";
import { tryMove, VALUES, nonPawnMaterial } from "../src/chess-util.js";

const rows = fs.readFileSync(new URL("../data/fexd.csv", import.meta.url), "utf8").trim().split("\n");
const out = []; const count = {};
function sliderAttacks(c, color) {
  const set = new Set();
  for (const row of c.board()) for (const p of row) {
    if (!p || p.color === color || !["k", "q", "r"].includes(p.type)) continue;
    for (const a of c.attackers(p.square, color)) { const q = c.get(a); if (q && ["b", "r", "q"].includes(q.type)) set.add(a + ">" + p.square); }
  }
  return set;
}
for (const line of rows) {
  const [id, fen, movesStr, ratingStr] = line.split(",");
  const moves = movesStr.trim().split(" ");
  const rating = +ratingStr;
  let c; try { c = new Chess(fen); } catch (e) { continue; }
  if (!tryMove(c, moves[0])) continue;
  const me = c.turn(); const themes = new Set();
  const start = c.fen();
  let ok = true, userMoves = 0;
  for (let i = 1; i < moves.length; i++) {
    const before = new Chess(c.fen());
    const beforeSl = i % 2 === 1 ? sliderAttacks(before, me) : null;
    const m = tryMove(c, moves[i]); if (!m) { ok = false; break; }
    if (i % 2 === 1) {
      userMoves++;
      if (m.promotion) themes.add("promotion");
      if (i === 1 && m.captured && VALUES[m.captured] >= 3) {
        let defended = true; try { defended = before.attackers(m.to, m.color === "w" ? "b" : "w").length > 0; } catch (e) {}
        if (!defended) themes.add("hangingPiece");
      }
      if (!c.isCheckmate()) {
        const f = isFork(c.fen(), m.to, me);
        if (f && f.filter((t) => t.type === "k" || t.value >= 3).length >= 2) themes.add("fork");
        if (pinOf(c.fen(), m.to, me)) themes.add("pin");
        const afterSl = sliderAttacks(c, me);
        for (const k of afterSl) if (!beforeSl.has(k) && !k.startsWith(m.to)) { themes.add("discoveredAttack"); break; }
      }
    }
  }
  if (!ok) continue;
  if (c.isCheckmate()) {
    themes.add(userMoves === 1 ? "mateIn1" : userMoves === 2 ? "mateIn2" : "mateIn3");
    let k = null; for (const row of c.board()) for (const p of row) if (p && p.type === "k" && p.color !== me) k = p.square;
    if (k && (k[1] === "8" || k[1] === "1")) { const last = c.history({ verbose: true }).pop(); if (last && ["r", "q"].includes(last.piece) && last.to[1] === k[1]) themes.add("backRankMate"); }
  }
  if (nonPawnMaterial(new Chess(start)) <= 20) themes.add("endgame");
  if (!themes.size) themes.add("tactic");
  for (const t of themes) count[t] = (count[t] || 0) + 1;
  out.push([id, fen, movesStr.trim(), rating, [...themes].join(" ")]);
}
fs.writeFileSync(new URL("../data/puzzles-base.json", import.meta.url), JSON.stringify(out));
console.log(out.length, "problemas", count);
