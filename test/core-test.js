const { spawn } = require("child_process");
const procs = {}; const lineL = new Set(); const exitL = new Set();
globalThis.window = { api: {
  engineStart: async (id) => { const p = spawn(__dirname + "/../bin/stockfish"); procs[id] = p; let buf = ""; p.stdout.setEncoding("utf8"); p.stdout.on("data", (c) => { buf += c; let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (l) for (const f of lineL) f(id, l); } }); return true; },
  engineSend: (id, c) => procs[id].stdin.write(c + "\n"),
  onEngineLine: (f) => lineL.add(f), onEngineExit: (f) => exitL.add(f)
}};
import { Engine } from "../src/engine.js";
import { parseGame, evalText } from "../src/chess-util.js";
import { analyseGame, stats, CLS } from "../src/analysis.js";
import { explainMove } from "../src/explain.js";
const PGN = `[White "rival_a"]
[Black "jugador"]
[Result "0-1"]

1. d4 d6 2. Bf4 Bf5 3. Nc3 Nc6 4. e4 e5 5. exf5 exf4 6. Nd5 Nxd4 7. Qxd4 c5 8. Qxf4 g6 9. O-O-O Bh6 10. Nf6+ Qxf6 11. Bb5+ Kf8 12. Rd2 Bxf4 13. fxg6 Qe6 14. b3 Qe1+ 15. Kb2 Bxd2 16. Nf3 Qxh1 17. Nxd2 a6 18. Bc4 hxg6 19. Ne4 b5 20. Ng3 Qxh2 21. Nf1 Qxg2 22. Ne3 Qxf2 23. Nd1 Qd4+ 24. Ka3 bxc4 25. Nb2 cxb3 26. axb3 c4 27. bxc4 Rb8 28. Ka4 Qxb2 0-1`;
(async () => {
  const e = new Engine("t"); await e.start({ threads: 4, hash: 128 });
  const g = parseGame(PGN);
  const t0 = Date.now();
  const an = await analyseGame(g, e, "rapida", null, null);
  console.log("analysed", g.fens.length, "positions in", Date.now() - t0, "ms");
  for (let k = 0; k < g.moves.length; k++) {
    const x = an.info[k]; const ex = explainMove(g, an, k);
    if (["best", "excellent", "good"].includes(x.c) && k % 6) continue;
    console.log(`\n${k}. ${g.moves[k].san} [${CLS[x.c].label}] ${evalText(an.evals[k])}→${evalText(an.evals[k+1])}`);
    console.log("  " + ex.headline + " | " + ex.paragraphs.join(" "));
    if (ex.line) console.log("  " + ex.lineLabel + " (" + ex.which + "): " + ex.line);
    if (ex.tip) console.log("  Consejo: " + ex.tip);
  }
  console.log(stats(g, an.info, "w"), stats(g, an.info, "b"));
  process.exit(0);
})();
