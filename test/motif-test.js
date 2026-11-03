const { spawn } = require("child_process");
const procs = {}; const lineL = new Set(); const exitL = new Set();
globalThis.window = { api: {
  engineStart: async (id) => { const p = spawn(__dirname + "/../bin/stockfish"); procs[id] = p; let buf = ""; p.stdout.setEncoding("utf8"); p.stdout.on("data", (c) => { buf += c; let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (l) for (const f of lineL) f(id, l); } }); return true; },
  engineSend: (id, c) => procs[id].stdin.write(c + "\n"), onEngineLine: (f) => lineL.add(f), onEngineExit: (f) => exitL.add(f), log: () => {}
}};
import { Engine } from "../src/engine.js";
import { parseGame } from "../src/chess-util.js";
import { analyseGame } from "../src/analysis.js";
import { diagnoseEntry, MOTIFS } from "../src/motifs.js";
const GAMES = [
`[White "rival_a"]\n[Black "jugador"]\n[Result "0-1"]\n\n1. d4 d6 2. Bf4 Bf5 3. Nc3 Nc6 4. e4 e5 5. exf5 exf4 6. Nd5 Nxd4 7. Qxd4 c5 8. Qxf4 g6 9. O-O-O Bh6 10. Nf6+ Qxf6 11. Bb5+ Kf8 12. Rd2 Bxf4 13. fxg6 Qe6 14. b3 Qe1+ 15. Kb2 Bxd2 16. Nf3 Qxh1 17. Nxd2 a6 18. Bc4 hxg6 19. Ne4 b5 20. Ng3 Qxh2 21. Nf1 Qxg2 22. Ne3 Qxf2 23. Nd1 Qd4+ 24. Ka3 bxc4 25. Nb2 cxb3 26. axb3 c4 27. bxc4 Rb8 28. Ka4 Qxb2 0-1`,
`[White "Rival"]\n[Black "yo"]\n[Result "0-1"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3# 0-1`,
`[White "yo"]\n[Black "Rival"]\n[Result "0-1"]\n\n1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0`,
`[White "yo"]\n[Black "Rival"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1`];
(async () => {
  const e = new Engine("t"); await e.start({ threads: 2, hash: 64 });
  for (const [gi, pgn] of GAMES.entries()) {
    const g = parseGame(pgn); const an = await analyseGame(g, e, "rapida", null, null);
    for (const color of ["w", "b"]) {
      const entry = { analysis: an };
      const d = diagnoseEntry(entry, g, color);
      for (const it of d.items) console.log(`g${gi} ${color} ${it.k}. ${g.moves[it.k].san} [${it.cls}] -> ${it.motif} (${MOTIFS[it.motif].short}) ${it.detail || ""} ${it.threat ? "amenaza=" + it.threat : ""} fase=${it.phase}`);
    }
  }
  process.exit(0);
})();
