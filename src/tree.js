// Árbol de jugadas de una partida: la línea principal (lo que se jugó) más las variantes que agrega el usuario.
import { Chess, tryMove, uciOf } from "./chess-util.js";

let seq = 0;
function mk(parent, m, fen, main) {
  return { id: ++seq, parent, ply: parent ? parent.ply + 1 : 0, uci: m ? uciOf(m) : null, san: m ? m.san : null, fen, from: m ? m.from : null, to: m ? m.to : null,
    captured: m ? !!m.captured : false, color: m ? m.color : null, main, children: [] };
}

/** Arma el árbol a partir de la partida y de las variantes guardadas (`vars`: { "ply": [[uci, [hijos]], …] }). */
/** `vars`: variantes guardadas. `notes`: tus comentarios de la línea principal, { jugada: texto }. */
export function buildTree(game, vars, notes) {
  const root = mk(null, null, game.fens[0], 0);
  const byId = new Map([[root.id, root]]);
  const mainline = [root];
  let cur = root;
  game.moves.forEach((m, k) => {
    const n = { id: ++seq, parent: cur, ply: k + 1, uci: m.uci, san: m.san, fen: game.fens[k + 1], from: m.from, to: m.to, captured: !!m.captured, color: m.color, main: k + 1, children: [] };
    cur.children.push(n); byId.set(n.id, n); mainline.push(n); cur = n;
  });
  const tree = { root, byId, mainline };
  const add = (parent, list) => {
    for (const item of list || []) {
      if (!Array.isArray(item) || typeof item[0] !== "string") continue;
      const n = addMove(tree, parent, item[0]);
      if (n) { if (typeof item[2] === "string" && item[2]) n.comment = item[2]; add(n, item[1]); }
    }
  };
  if (vars && typeof vars === "object") for (const [ply, list] of Object.entries(vars)) { const base = mainline[+ply]; if (base) add(base, list); }
  if (notes && typeof notes === "object") for (const [ply, text] of Object.entries(notes)) { const n = mainline[+ply]; if (n && typeof text === "string" && text) n.comment = text; }
  return tree;
}

/** Agrega (o reutiliza) la jugada `uci` como hija de `parent`. Devuelve el nodo o null si la jugada no es legal. */
export function addMove(tree, parent, uci) {
  const key = uci.slice(0, 4), promo = uci[4] || "";
  const ex = parent.children.find((c) => c.uci.slice(0, 4) === key && (c.uci[4] || "") === promo) || (!promo && parent.children.find((c) => c.uci.slice(0, 4) === key));
  if (ex) return ex;
  let c; try { c = new Chess(parent.fen); } catch (e) { return null; }
  const m = tryMove(c, uci); if (!m) return null;
  const n = mk(parent, m, c.fen(), null);
  parent.children.push(n); tree.byId.set(n.id, n);
  return n;
}

export const isMain = (n) => n.main != null;
/** Último nodo de la línea principal del que cuelga este nodo. */
export function baseOf(n) { while (n && n.main == null) n = n.parent; return n; }
/** Primer nodo de la variante a la que pertenece (el que cuelga de la línea principal o de otra variante como alternativa). */
export function branchRoot(n) {
  let r = n;
  while (r.parent && r.parent.main == null && r.parent.children[0] === r) r = r.parent;
  return r;
}
/** Camino desde la raíz hasta el nodo. */
export function pathTo(n) { const out = []; for (let x = n; x; x = x.parent) out.unshift(x); return out; }
/** Sigue la primera continuación hasta el final. */
export function lineEnd(n) { while (n.children.length) n = n.children[0]; return n; }

export function removeBranch(tree, n) {
  if (n.main != null || !n.parent) return null;
  const parent = n.parent;
  parent.children = parent.children.filter((c) => c !== n);
  const drop = (x) => { tree.byId.delete(x.id); x.children.forEach(drop); };
  drop(n);
  return parent;
}
export function hasVariations(tree) { return tree.mainline.some((n) => n.children.some((c) => c.main == null)) ; }
export function clearVariations(tree) {
  for (const n of tree.mainline) for (const c of n.children.filter((x) => x.main == null)) removeBranch(tree, c);
}

/** Variantes en formato compacto para guardar con la partida. */
export function serializeVars(tree) {
  const ser = (n) => (n.comment ? [n.uci, n.children.map(ser), n.comment] : [n.uci, n.children.map(ser)]);
  const out = {};
  tree.mainline.forEach((n, ply) => {
    const vs = n.children.filter((c) => c.main == null);
    if (vs.length) out[ply] = vs.map(ser);
  });
  return Object.keys(out).length ? out : null;
}

/** Comentarios de la línea principal, para guardar con la partida: { jugada: texto } o null. */
export function serializeNotes(tree) {
  const out = {};
  tree.mainline.forEach((n, ply) => { if (ply && n.comment) out[ply] = n.comment; });
  return Object.keys(out).length ? out : null;
}

/* ---------- PGN ---------- */
function moveNo(n, force) {
  const full = Math.floor((n.ply - 1 + plyOffset(n)) / 2) + 1;
  return n.color === "w" ? full + ". " : force ? full + "... " : "";
}
function plyOffset(n) { // posiciones que empiezan con negras o en una jugada que no es la 1
  let r = n; while (r.parent) r = r.parent;
  const p = r.fen.split(" "); const start = (+p[5] || 1) - 1;
  return start * 2 + (p[1] === "b" ? 1 : 0);
}
/** Texto de jugadas en PGN desde `node` (sin incluirlo), con las variantes entre paréntesis. `main`: seguir solo la línea principal como principal. */
export function movetext(node, opts = {}) {
  const out = [];
  // Comentario de una jugada: lo que devuelva opts.comment (por ejemplo la evaluación) más lo que escribió el usuario.
  const note = (n) => { const t = [opts.comment ? opts.comment(n) : "", n.comment || ""].filter(Boolean).join(" ").replace(/[{}]/g, "").replace(/\s+/g, " ").trim(); return t ? ` {${t}}` : ""; };
  const walk = (n, force) => {
    let cur = n, first = force;
    while (cur.children.length) {
      const [head, ...alts] = cur.children;
      const cm = note(head);
      out.push(moveNo(head, first) + head.san + (opts.nag && opts.nag(head) ? " " + opts.nag(head) : "") + cm);
      first = !!cm;          // después de un comentario, el PGN repite el número de jugada
      if (opts.vars !== false) for (const a of alts) { const ca = note(a); out.push("(" + moveNo(a, true) + a.san + ca); walk(a, !!ca); out[out.length - 1] += ")"; first = true; }
      cur = head;
    }
  };
  walk(node, true);
  return out.join(" ");
}
/** PGN completo de una partida con sus variantes. */
export function toPgn(headers, tree, opts = {}) {
  const h = { ...headers };
  const order = ["Event", "Site", "Date", "Round", "White", "Black", "Result"];
  const keys = [...order.filter((k) => h[k] != null), ...Object.keys(h).filter((k) => !order.includes(k) && h[k] != null)];
  const head = keys.map((k) => `[${k} "${String(h[k]).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`).join("\n");
  const body = movetext(tree.root, opts);
  const res = h.Result && h.Result !== "?" ? h.Result : "*";
  return (head ? head + "\n\n" : "") + (body ? body + " " : "") + res + "\n";
}

/** Anotaciones del análisis para exportar: evaluación de cada jugada ([%eval]) y signo ($2 error, $4 blunder, $6 imprecisión). */
export function analysisAnnotations(analysis) {
  if (!analysis || !analysis.evals) return {};
  const NAG = { mistake: "$2", blunder: "$4", inacc: "$6" };
  return {
    nag: (n) => (n.main != null && analysis.info && analysis.info[n.main - 1] ? NAG[analysis.info[n.main - 1].c] || "" : ""),
    comment: (n) => {
      const e = n.main != null ? analysis.evals[n.main] : null; if (!e) return "";
      if (e.mate != null) return `[%eval #${e.mate}]`;
      return e.cp != null ? `[%eval ${(e.cp / 100).toFixed(2)}]` : "";
    },
  };
}
