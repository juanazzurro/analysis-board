const { spawn } = require("child_process");
const fs = require("fs");
const procs = {}; const lineL = new Set(); const exitL = new Set();
globalThis.window = { api: {
  engineStart: async (id) => { const p = spawn(__dirname + "/../bin/stockfish"); procs[id] = p; let buf = ""; p.stdout.setEncoding("utf8"); p.stdout.on("data", (c) => { buf += c; let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (l) for (const f of lineL) f(id, l); } }); return true; },
  engineSend: (id, c) => procs[id].stdin.write(c + "\n"),
  onEngineLine: (f) => lineL.add(f), onEngineExit: (f) => exitL.add(f)
}};
import { Engine } from "../src/engine.js";
import { parseGame } from "../src/chess-util.js";
import { analyseGame, stats, DEPTHS } from "../src/analysis.js";
DEPTHS.test = { label: "test", go: "depth 11" };
(async () => {
  const [inp, out, nAnalyse] = process.argv.slice(2);
  const games = JSON.parse(fs.readFileSync(inp, "utf8"));
  const e = new Engine("t"); await e.start({ threads: 2, hash: 64 });
  const lib = [];
  let i = 0;
  for (const g of games) {
    const game = parseGame(g.pgn);
    let hash = 0; for (let j = 0; j < g.pgn.length; j++) hash = (hash * 31 + g.pgn.charCodeAt(j)) | 0;
    const entry = { id: "chesscom-" + (hash >>> 0).toString(36), source: "chesscom", url: "", pgn: g.pgn, white: g.white, black: g.black,
      whiteElo: g.whiteElo, blackElo: g.blackElo, result: g.result, date: g.date, speed: g.speed, opening: "", userColor: null, analysis: null, addedAt: Date.now() };
    if (i < +nAnalyse) {
      const t0 = Date.now();
      const an = await analyseGame(game, e, "test", null, null);
      an.depth = "rapida";
      entry.analysis = { ...an, stats: { w: stats(game, an.info, "w"), b: stats(game, an.info, "b") } };
      console.error(i, g.white, "-", g.black, game.moves.length, "plies", Date.now() - t0, "ms");
    }
    lib.push(entry); i++;
  }
  lib.sort((a, b) => b.date - a.date);
  fs.writeFileSync(out, JSON.stringify(lib));
  process.exit(0);
})();
