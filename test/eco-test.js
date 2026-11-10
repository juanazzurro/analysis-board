import "./_stub.js";
import { parseGame } from "../src/chess-util.js";
import { bookOf, isBook, openingAt } from "../src/eco.js";
const t = (name, pgn, want) => { const g = parseGame(pgn); const b = bookOf(g); const ok = b.eco === want.eco && b.name === want.name && b.ply === want.ply; console.log(ok ? "ok  " : "FAIL", name, JSON.stringify({ eco: b.eco, name: b.name, ply: b.ply })); if (!ok) process.exitCode = 1; return g; };
t("najdorf", "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. h3 e5 7. Nde2 h5", { eco: "B90", name: "Sicilian Defense: Najdorf Variation, Adams Attack", ply: 11 });
t("transposición", "1. Nf3 d5 2. d4 Nf6 3. c4 e6 4. Nc3 Be7", { eco: "D37", name: "Queen's Gambit Declined: Three Knights Variation", ply: 7 });
const g = t("opera", "1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6", { eco: "C41", name: "Philidor Defense", ply: 5 });
console.log(isBook(g, 4), isBook(g, 5), openingAt(g, 2));
t("no estándar", '[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n1. e4 Kd7', { eco: "", name: "", ply: 0 });
