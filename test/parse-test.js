// Lector de PGN: resultados de cada tipo de final, relojes, variantes y posición inicial propia.
import "./_stub.js";
import { parseGame, firstSans } from "../src/chess-util.js";
let fails = 0; const ok = (name, cond, extra) => { if (!cond) { fails++; console.log("FAIL", name, extra === undefined ? "" : JSON.stringify(extra)); } };
let g = parseGame('[TimeControl "180+2"]\n\n1. e4 {[%clk 0:03:00]} e5 {[%clk 0:02:58.5]} 2. Nf3 $1 (2. f4 exf4) Nc6 {[%clk 0:02:50]} 3. Bb5 a6 1/2-1/2');
ok("jugadas", g.moves.length === 6 && g.fens.length === 7, g.moves.length);
ok("relojes", g.clocks[0] === 180 && g.clocks[1] === 178.5 && g.clocks[3] === 170, g.clocks);
ok("control", g.tc && g.tc.base === 180 && g.tc.inc === 2, g.tc);
ok("uci", g.moves[0].uci === "e2e4" && g.moves[2].uci === "g1f3");
g = parseGame("1. f3 e5 2. g4 Qh4#");
ok("mate", g.term[4] === -1500 && g.checks[4] === true && g.term[3] === null, g.term);
g = parseGame('[SetUp "1"]\n[FEN "6k1/8/6K1/8/8/8/8/5Q2 b - - 0 1"]\n\n1... Kh8 2. Qf8# 1-0');
ok("fen propio", g.fens[0].startsWith("6k1/8/6K1") && g.term[2] === 1500 && g.moves[0].color === "b", g.fens[0]);
g = parseGame('[SetUp "1"]\n[FEN "7k/8/5QK1/8/8/8/8/8 w - - 0 1"]\n\n1. Qf7 1/2-1/2');
ok("ahogado", g.term[1] === 0, g.term);
g = parseGame('[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/3p4/3K4 w - - 0 1"]\n\n1. Kxd2 1/2-1/2');
ok("material insuficiente", g.term[1] === 0, g.term);
g = parseGame("1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 5. Nf3");
ok("triple repetición", g.term[8] === 0 && g.term[7] === null && g.term[4] === null, g.term);
g = parseGame('[SetUp "1"]\n[FEN "8/P6k/8/8/8/8/8/K7 w - - 0 1"]\n\n1. a8=N Kg7');
ok("coronación", g.moves[0].promotion === "n" && g.moves[0].uci === "a7a8n", g.moves[0]);
let threw = false; try { parseGame("hola esto no es un pgn"); } catch (e) { threw = true; }
ok("pgn inválido", threw);
ok("primeras jugadas", firstSans('[Event "x"]\n\n1. e4 {hola} e5 2. Nf3! (2. f4) Nc6 3. Bb5 a6 1-0', 5).join(" ") === "e4 e5 Nf3 Nc6 Bb5", firstSans('[Event "x"]\n\n1. e4 {hola} e5 2. Nf3! (2. f4) Nc6 3. Bb5 a6 1-0', 5));
console.log(fails ? `parse-test: ${fails} fallas` : "parse-test: ok");
process.exit(fails ? 1 : 0);
