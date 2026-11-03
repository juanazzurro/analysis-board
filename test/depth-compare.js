const { spawn } = require("child_process");
const fs = require("fs");
const procs = {}; const lineL = new Set(); const exitL = new Set();
globalThis.window = { api: {
  engineStart: async (id) => { const p = spawn(__dirname + "/../bin/stockfish"); procs[id] = p; let buf = ""; p.stdout.setEncoding("utf8"); p.stdout.on("data", (c) => { buf += c; let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (l) for (const f of lineL) f(id, l); } }); return true; },
  engineSend: (id, c) => procs[id].stdin.write(c + "\n"), onEngineLine: (f) => lineL.add(f), onEngineExit: (f) => exitL.add(f)
}};
import { Engine } from "../src/engine.js";
import { parseGame } from "../src/chess-util.js";
import { analyseGame, stats } from "../src/analysis.js";
(async () => {
  const games = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).slice(0, +process.argv[3] || 5);
  const e = new Engine("t"); await e.start({ threads: 2, hash: 128 });
  let agree = 0, onlyR = 0, onlyN = 0, tR = 0, tN = 0;
  for (const g of games) {
    const game = parseGame(g.pgn); const uc = g.white === "jugador" ? "w" : "b";
    let t0 = Date.now(); const r = await analyseGame(game, e, "rapida"); tR += Date.now() - t0;
    t0 = Date.now(); const n = await analyseGame(game, e, "normal"); tN += Date.now() - t0;
    const bad = (an) => new Set(an.info.map((x, k) => (x && game.moves[k].color === uc && ["mistake", "blunder"].includes(x.c) ? k : null)).filter((k) => k != null));
    const R = bad(r), N = bad(n);
    for (const k of R) N.has(k) ? agree++ : onlyR++;
    for (const k of N) if (!R.has(k)) onlyN++;
    const sr = stats(game, r.info, uc), sn = stats(game, n.info, uc);
    console.log(`${g.white}-${g.black} ${game.moves.length}p  precisión rápida ${sr.acc.toFixed(1)} normal ${sn.acc.toFixed(1)} | errores rápida ${R.size} normal ${N.size} coinciden ${[...R].filter((k) => N.has(k)).length}`);
  }
  console.log(`TOTAL coinciden ${agree}, solo rápida ${onlyR}, solo normal ${onlyN}; tiempo rápida ${(tR/1000).toFixed(0)}s normal ${(tN/1000).toFixed(0)}s`);
  process.exit(0);
})();
