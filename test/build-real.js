// Arma una biblioteca de prueba con partidas reales (Chess.com / Lichess) y las analiza.
const { spawn } = require("child_process");
const fs = require("fs");
const procs = {}; const lineL = new Set(); const exitL = new Set();
globalThis.window = { api: {
  engineStart: async (id) => { const p = spawn(__dirname + "/../bin/stockfish"); procs[id] = p; let buf = ""; p.stdout.setEncoding("utf8"); p.stdout.on("data", (c) => { buf += c; let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (l) for (const f of lineL) f(id, l); } }); return true; },
  engineSend: (id, c) => procs[id].stdin.write(c + "\n"), onEngineLine: (f) => lineL.add(f), onEngineExit: (f) => exitL.add(f)
}};
import { Engine } from "../src/engine.js";
import { parseGame, splitPgn } from "../src/chess-util.js";
import { analyseGame, stats, DEPTHS } from "../src/analysis.js";
DEPTHS.test = { go: "depth 11" };
const H = (pgn, k) => { const m = new RegExp(`\\[${k} "([^"]*)"\\]`).exec(pgn); return m ? m[1] : ""; };
(async () => {
  const [dir, out, analyseN] = process.argv.slice(2);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".pgn")).sort();
  const entries = []; const bad = [];
  for (const f of files) {
    for (const pgn of splitPgn(fs.readFileSync(dir + "/" + f, "utf8"))) {
      let g; try { g = parseGame(pgn); } catch (e) { bad.push(f + ": " + e.message); continue; }
      const cc = /Chess\.com/.test(H(pgn, "Site"));
      const tc = H(pgn, "TimeControl"); const base = +tc.split("+")[0] || 0, inc = +tc.split("+")[1] || 0;
      const t = base + 40 * inc;
      const speed = cc ? (t < 180 ? "bullet" : t < 600 ? "blitz" : "rapid") : (/(\w+) game/i.exec(H(pgn, "Event")) || [, ""])[1].toLowerCase();
      const res = H(pgn, "Result");
      const d = new Date((H(pgn, "UTCDate") || H(pgn, "Date")).replace(/\./g, "-") + "T" + (H(pgn, "UTCTime") || "12:00:00") + "Z").getTime();
      const site = H(pgn, "Site"), link = H(pgn, "Link");
      entries.push({ id: (cc ? "cc-" : "li-") + ((/(\d+)$/.exec(link) || /lichess\.org\/(\w+)/.exec(site) || [, String(d)])[1]), source: cc ? "chesscom" : "lichess",
        url: cc ? link : site, pgn, white: H(pgn, "White"), black: H(pgn, "Black"), whiteElo: +H(pgn, "WhiteElo") || null, blackElo: +H(pgn, "BlackElo") || null,
        result: res === "1/2-1/2" ? "½-½" : res, date: d, speed, opening: cc ? "" : H(pgn, "Opening"), userColor: null, analysis: null, addedAt: Date.now(), _plies: g.moves.length });
    }
  }
  // Fechas: repartidas en los últimos 45 días, manteniendo el orden original.
  entries.sort((a, b) => a.date - b.date);
  const now = Date.now();
  entries.forEach((e, i) => { e.date = now - Math.round((entries.length - i) * (45 * 86400000) / entries.length) + 3600000; });
  const e = new Engine("t"); await e.start({ threads: 2, hash: 64 });
  let n = 0;
  for (const en of [...entries].reverse()) {
    if (n >= +analyseN) break;
    const g = parseGame(en.pgn);
    const an = await analyseGame(g, e, "test"); an.depth = "rapida";
    en.analysis = { ...an, stats: { w: stats(g, an.info, "w"), b: stats(g, an.info, "b") } };
    n++;
  }
  entries.forEach((x) => delete x._plies);
  entries.sort((a, b) => b.date - a.date);
  fs.writeFileSync(out, JSON.stringify(entries));
  console.log("partidas", entries.length, "analizadas", n, "con error de lectura", bad.length, bad.slice(0, 5));
  process.exit(0);
})();
