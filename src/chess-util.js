import { Chess } from "chess.js";
import { tr } from "./i18n.js";

export { Chess };
export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
export const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const PIECE = { p: "peón", n: "caballo", b: "alfil", r: "torre", q: "dama", k: "rey" };
export const PIECE_ART = { p: "el peón", n: "el caballo", b: "el alfil", r: "la torre", q: "la dama", k: "el rey" };

export function chessAt(fen) { return new Chess(fen); }

export function dests(chess) {
  const d = new Map();
  for (const m of chess.moves({ verbose: true })) {
    if (!d.has(m.from)) d.set(m.from, []);
    d.get(m.from).push(m.to);
  }
  return d;
}

export function tryMove(chess, uciOrObj) {
  try {
    if (typeof uciOrObj === "string") {
      return chess.move({ from: uciOrObj.slice(0, 2), to: uciOrObj.slice(2, 4), promotion: uciOrObj[4] || undefined });
    }
    return chess.move(uciOrObj);
  } catch (e) { return null; }
}

export const uciOf = (m) => m.from + m.to + (m.promotion || "");

export function pvToSan(fen, pv, max = 8) {
  const c = new Chess(fen); const out = [];
  for (const u of (pv || []).slice(0, max)) { const m = tryMove(c, u); if (!m) break; out.push(m.san); }
  return out;
}

export function numberedLine(fen, sans) {
  const parts = fen.split(" "); let side = parts[1], n = +parts[5] || 1; const out = [];
  sans.forEach((s, i) => {
    if (side === "w") out.push(n + ". " + s);
    else { out.push((i === 0 ? n + "… " : "") + s); n++; }
    side = side === "w" ? "b" : "w";
  });
  return out.join(" ");
}

export function moveLabel(fen, san, color) {
  const n = +fen.split(" ")[5] || 1;
  return color === "w" ? `${n}. ${san}` : `${n}… ${san}`;
}

/* ---------- evaluaciones (siempre desde el punto de vista de Blancas) ---------- */
export const wp = (cp) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
export function toCp(s) {
  if (!s) return 0;
  if (s.done != null) return s.done;
  if (s.mate != null) { const m = Math.abs(s.mate); const v = 1500 - Math.min(m, 20) * 5; return s.mate > 0 ? v : -v; }
  return Math.max(-1500, Math.min(1500, s.cp));
}
export function evalText(s) {
  if (!s) return "…";
  if (s.done != null) return s.done > 0 ? "1-0" : s.done < 0 ? "0-1" : "½-½";
  if (s.mate != null) return (s.mate > 0 ? "#" : "#-") + Math.abs(s.mate);
  const v = s.cp / 100; return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1);
}
export function scoreFromInfo(info, fen) {
  const black = fen.split(" ")[1] === "b";
  if (!info) return { cp: 0 };
  if (info.mate != null) return { mate: black ? -info.mate : info.mate };
  return { cp: black ? -info.cp : info.cp };
}
export const accOf = (loss) => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));

export function materialDiff(chess) {
  let d = 0;
  for (const row of chess.board()) for (const p of row) if (p) d += (p.color === "w" ? 1 : -1) * VALUES[p.type];
  return d; // positivo = ventaja material de Blancas
}

/* ---------- PGN ---------- */
export function splitPgn(text) {
  const t = text.replace(/\r/g, "").trim();
  if (!t) return [];
  const chunks = t.split(/\n(?=\[Event )/g).map((s) => s.trim()).filter(Boolean);
  return chunks.length ? chunks : [t];
}

/** Junta comentarios seguidos ("{ a } { b }" → "{ a b }"), que chess.js no acepta. */
function mergeComments(t) { return t.replace(/\}\s*\{/g, " "); }
/** Saca variantes "( … )" y comentarios de línea ";", respetando los comentarios entre llaves. */
function stripVariations(t) {
  let out = "", depth = 0, inC = false, inLine = false;
  for (const ch of t) {
    if (inLine) { if (ch === "\n") { inLine = false; if (!depth) out += ch; } continue; }
    if (inC) { if (!depth) out += ch; if (ch === "}") inC = false; continue; }
    if (ch === "{") { inC = true; if (!depth) out += ch; continue; }
    if (ch === ";" ) { inLine = true; continue; }
    if (ch === "(") { depth++; continue; }
    if (ch === ")") { depth = Math.max(0, depth - 1); continue; }
    if (!depth) out += ch;
  }
  return out;
}
function loadLoose(pgn) {
  const t = pgn.replace(/\r/g, "").trim();
  const clean = mergeComments(stripVariations(t));
  const tries = [t, mergeComments(t), clean, clean.replace(/\$\d+/g, "").replace(/(^|\s)[!?]{1,2}(?=\s|$)/g, "$1")];
  let last;
  for (const x of tries) {
    const c = new Chess();
    try { c.loadPgn(x, { strict: false }); return c; } catch (e) { last = e; }
  }
  throw last;
}

export function parseGame(pgn) {
  let c;
  try { c = loadLoose(pgn); }
  catch (e) { throw new Error(tr("No pude leer ese PGN. Revisá que esté completo, con las jugadas numeradas.", "I couldn't read that PGN. Check that it's complete, with numbered moves.")); }
  const hist = c.history({ verbose: true });
  if (!hist.length) throw new Error(tr("El PGN no tiene jugadas.", "The PGN has no moves."));
  const headers = c.getHeaders ? c.getHeaders() : c.header();
  const comments = new Map();
  try { for (const x of c.getComments()) comments.set(x.fen, x.comment); } catch (e) {}
  const r = headers.FEN ? new Chess(headers.FEN) : new Chess();
  const fens = [r.fen()], checks = [r.inCheck()], term = [null], clocks = [];
  const moves = [];
  for (const m of hist) {
    const mv = tryMove(r, { from: m.from, to: m.to, promotion: m.promotion });
    if (!mv) break;
    moves.push({ san: mv.san, from: mv.from, to: mv.to, color: mv.color, piece: mv.piece, captured: mv.captured || null, promotion: mv.promotion || null, uci: uciOf(mv), flags: mv.flags });
    fens.push(r.fen()); checks.push(r.inCheck());
    clocks.push(parseClk(comments.get(r.fen())));
    term.push(r.isCheckmate() ? (r.turn() === "w" ? -1500 : 1500) : (r.isStalemate() || r.isInsufficientMaterial() || r.isThreefoldRepetition() || r.isDrawByFiftyMoves()) ? 0 : null);
  }
  return { headers, fens, checks, term, moves, clocks, tc: parseTimeControl(headers.TimeControl) };
}

/* ---------- reloj ---------- */
export function parseClk(comment) {
  if (!comment) return null;
  const m = /%clk\s+(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(comment);
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : null;
}
export function parseTimeControl(tc) {
  if (!tc || tc === "-" || tc === "?" || tc.includes("/")) return null;
  const m = /^(\d+)(?:\+(\d+(?:\.\d+)?))?$/.exec(String(tc).trim());
  return m ? { base: +m[1], inc: m[2] ? +m[2] : 0 } : null;
}
/** Segundos que tenías después de la jugada k, segundos que gastaste en ella y si estabas apurado. */
export function clockAt(game, k) {
  const left = game.clocks ? game.clocks[k] : null;
  if (left == null) return null;
  const prev = k >= 2 ? game.clocks[k - 2] : game.tc ? game.tc.base : null;
  const inc = game.tc ? game.tc.inc : 0;
  const spent = prev != null ? Math.max(0, prev - left + inc) : null;
  const before = left + (spent != null ? spent - inc : 0);
  const base = game.tc ? game.tc.base : null;
  const pressure = before < 30 || (base ? before < base * 0.1 : false);
  return { left, spent, before, pressure };
}

/* ---------- etapa de la partida ---------- */
export function nonPawnMaterial(chess) {
  let n = 0;
  for (const row of chess.board()) for (const p of row) if (p && p.type !== "p" && p.type !== "k") n += VALUES[p.type];
  return n;
}
export function phaseOf(fen, ply) {
  const npm = nonPawnMaterial(new Chess(fen));
  if (npm <= 20) return "final";
  if (ply < 20 && npm >= 46) return "apertura";
  return "medio";
}
export const PHASE_LABEL = { apertura: tr("Apertura", "Opening"), medio: tr("Medio juego", "Middlegame"), final: tr("Final", "Endgame") };

/* ---------- apertura ---------- */
export function openingName(entry, headers) {
  if (entry && entry.opening) return entry.opening;
  const h = headers || {};
  if (h.Opening && h.Opening !== "?") return h.Opening;
  if (h.ECOUrl) {
    const slug = decodeURIComponent(String(h.ECOUrl).split("/openings/")[1] || "");
    const words = slug.split("-").filter((w) => w && !/^\d/.test(w));
    if (words.length) return words.join(" ");
  }
  return h.ECO && h.ECO !== "?" ? "ECO " + h.ECO : "";
}
/** Familia: "Italian Game: Two Knights" -> "Italian Game". */
export function openingFamily(name) {
  if (!name) return tr("Sin nombre", "Unnamed");
  const base = name.split(":")[0].trim();
  const m = /^(.*?\b(Defense|Defence|Game|Opening|Gambit|Attack|System|Variation))\b/.exec(base);
  return (m ? m[1] : base.split(" ").slice(0, 3).join(" ")).trim();
}

export function headerName(h, k, fallback) {
  const v = h && h[k]; return v && v !== "?" ? v : fallback;
}
