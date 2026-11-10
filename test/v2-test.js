// Pruebas de la versión 2: árbol de variantes, PGN, notación y devoluciones.
//   npx esbuild test/v2-test.js --bundle --platform=node --outfile=test/v2-test.cjs && node test/v2-test.cjs biblioteca.json usuario1,usuario2
import "./_stub.js";
const fs = require("fs");
import { parseGame, Chess } from "../src/chess-util.js";
import { buildTree, addMove, serializeVars, toPgn, movetext, removeBranch, branchRoot, baseOf, lineEnd, hasVariations, clearVariations } from "../src/tree.js";
import { fmtText, setNotation } from "../src/notation.js";
import { store } from "../src/state.js";
import { gameReport, periodReport, reportText } from "../src/report.js";
import { invalidateInsights } from "../src/insights.js";

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log("FALLA:", msg); } };

/* ---- árbol y PGN ---- */
const PGN = `[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 1-0`;
const g = parseGame(PGN);
let t = buildTree(g, null);
ok(t.mainline.length === 11 && !hasVariations(t), "línea principal");
const v1 = addMove(t, t.mainline[4], "f1c4");            // 3. Bc4 en vez de 3. Bb5
const v2 = addMove(t, v1, "g8f6"); addMove(t, v2, "d2d3");
const v3 = addMove(t, v1, "f8c5");                         // sub-variante: 3... Bc5
addMove(t, t.mainline[10], "f1e1");                        // después del final de la partida
ok(addMove(t, t.mainline[4], "f1b5") === t.mainline[5], "la jugada de la partida reutiliza el nodo principal");
ok(addMove(t, t.mainline[4], "f1c4") === v1, "no duplica una variante existente");
ok(addMove(t, t.mainline[4], "a1a8") === null, "rechaza jugadas ilegales");
ok(baseOf(v3) === t.mainline[4] && branchRoot(v2) === v1 && branchRoot(v3) === v3, "base y raíz de variante");
ok(lineEnd(v1).san === "d3", "fin de línea");
const ser = serializeVars(t);
ok(JSON.stringify(ser) === '{"4":[["f1c4",[["g8f6",[["d2d3",[]]]],["f8c5",[]]]]],"10":[["f1e1",[]]]}', "serialización: " + JSON.stringify(ser));
const t2 = buildTree(g, JSON.parse(JSON.stringify(ser)));
ok(JSON.stringify(serializeVars(t2)) === JSON.stringify(ser), "ida y vuelta de variantes");
const mt = movetext(t.root);
ok(mt === "1. e4 e5 2. Nf3 Nc6 3. Bb5 (3. Bc4 Nf6 (3... Bc5) 4. d3) 3... a6 4. Ba4 Nf6 5. O-O Be7 6. Re1", "texto con variantes: " + mt);
const pgn = toPgn(g.headers, t);
const back = parseGame(pgn);
ok(back.moves.length === 11 && back.moves[4].san === "Bb5", "el PGN exportado se vuelve a leer (línea principal de 11 jugadas, con la variante final incluida): " + back.moves.length);
removeBranch(t, branchRoot(v3)); ok(JSON.stringify(serializeVars(t)[4]) === '[["f1c4",[["g8f6",[["d2d3",[]]]]]]]', "borrar sub-variante");
clearVariations(t); ok(!hasVariations(t) && serializeVars(t) === null, "borrar todas");
ok(buildTree(g, { 4: [["zzzz", []], ["f1c4", [["a1a1", []]]]], 99: [["e2e4", []]] }).mainline[4].children.length === 2, "variantes guardadas inválidas se descartan sin romper");
// posición que empieza con negras y en otra jugada
const c = new Chess("8/8/8/4k3/8/8/4P3/4K3 b - - 0 40");
const gf = { headers: { SetUp: "1", FEN: c.fen() }, fens: [c.fen()], checks: [false], term: [null], moves: [], clocks: [], tc: null };
const tf = buildTree(gf, null); const a1 = addMove(tf, tf.root, "e5e4"); addMove(tf, a1, "e1d2"); addMove(tf, tf.root, "e5d4");
ok(movetext(tf.root) === "40... Ke4 (40... Kd4) 41. Kd2", "numeración desde un FEN: " + movetext(tf.root));

/* ---- notación ---- */
setNotation("fig"); ok(fmtText("12. Nf3 Qxd5+ e8=Q# O-O Kb1king") === "12. ♘f3 ♕xd5+ e8=♕# O-O Kb1king", "figurines");
setNotation("es"); const es = fmtText("Kf1 Rae1 Nf3 Bb5 Qd8"); ok(es.replace(/⁠/g, "") === "Rf1 Tae1 Cf3 Ab5 Dd8" && fmtText(es) === es, "letras en castellano, sin reconvertir");
setNotation("en"); ok(fmtText("Nf3") === "Nf3", "inglés sin cambios");

/* ---- devoluciones sobre una biblioteca real ---- */
if (process.argv[2]) {
  const lib = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const users = (process.argv[3] || "").split(",");
  store.library = lib; store.settings.chesscomUser = users[0] || ""; store.settings.lichessUser = users[1] || "";
  invalidateInsights();
  let n = 0, ctx = 0, withClock = 0; const verdicts = new Set(); let sample = null;
  for (const e of lib) {
    if (!e.analysis) continue;
    const game = parseGame(e.pgn);
    for (const uc of [users.includes(String(e.white).toLowerCase()) ? "w" : users.includes(String(e.black).toLowerCase()) ? "b" : null]) {
      let r; try { r = gameReport(e, game, uc); } catch (err) { ok(false, "gameReport " + e.id + ": " + err.stack.split("\n").slice(0, 3).join(" | ")); continue; }
      n++;
      ok(r && r.verdict && r.story.length >= 1, "devolución vacía " + e.id);
      ok(!/undefined|NaN|null/.test(reportText(r)), "texto con valores vacíos " + e.id + ": " + reportText(r).slice(0, 300));
      if (r.context.length) ctx++; if (r.clock) withClock++;
      verdicts.add(r.verdict.replace(/\d+/g, "N"));
      if (uc && r.context.length >= 4 && !sample) sample = r;
    }
  }
  console.log("devoluciones:", n, "con contexto:", ctx, "con reloj:", withClock, "veredictos distintos:", verdicts.size);
  if (sample) console.log("--- ejemplo ---\n" + reportText(sample));
  for (const range of ["week", "month"]) {
    const p = periodReport(range);
    ok(p && p.lines.length >= 1 && !/undefined|NaN|null/.test(p.lines.map((l) => l.text).join(" ")), "informe " + range);
    console.log(`--- ${range} ---\n` + p.lines.map((l) => `${{ up: "▲", down: "▼", flat: "•" }[l.tone]} ${l.text}`).join("\n"));
  }
}
console.log(fails ? `${fails} FALLAS` : "TODO BIEN");
process.exit(fails ? 1 : 0);
