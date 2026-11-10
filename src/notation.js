// Notación de las jugadas en pantalla: figurines (♘f3), letras en castellano (Cf3) o en inglés (Nf3).
// Los datos siempre se guardan y se le pasan al motor en notación estándar; esto es solo cómo se muestran.
const FIG = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘" };
const ES = { K: "R", Q: "D", R: "T", B: "A", N: "C" };
const MARK = "⁠"; // marca invisible: evita volver a convertir una jugada ya convertida ("Rf1" de rey no pasa a torre)
let mode = "fig";

// Jugada de pieza (Nf3, Raxd1+, Qh4#) o coronación (e8=Q, dxc8=N+). Tiene que ser una palabra entera.
const SAN_RE = /(?<![\w⁠=])([KQRBN])([a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)(?![\w⁠])|(?<![\w⁠])([a-h](?:x[a-h])?[18]=)([QRBN])(?![\w⁠])/g;

export function setNotation(m) { mode = m === "es" || m === "en" ? m : "fig"; }
export function notation() { return mode; }
const piece = (p) => (mode === "fig" ? FIG[p] : mode === "es" ? ES[p] + MARK : p);

/** Convierte las jugadas que aparezcan dentro de un texto cualquiera. */
export function fmtText(text) {
  if (mode === "en" || !text) return text;
  return String(text).replace(SAN_RE, (all, p, rest, pawn, promo) => {
    if (p) return piece(p) + rest.replace(/=([QRBN])/, (_m, q) => "=" + piece(q));
    return pawn + piece(promo);
  });
}
export const fmtSan = fmtText;

const SKIP = "textarea, input, select, code, script, style, .nofig, .who, .players, [contenteditable]";
function walk(node) {
  if (node.nodeType === 3) {
    const p = node.parentElement;
    if (!p || p.closest(SKIP)) return;
    const t = node.nodeValue; if (!t || t.length < 3) return;
    const f = fmtText(t);
    if (f !== t) node.nodeValue = f;
    return;
  }
  if (node.nodeType !== 1 || node.matches(SKIP) || node.namespaceURI !== "http://www.w3.org/1999/xhtml") return;
  const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const list = []; while (w.nextNode()) list.push(w.currentNode);
  for (const n of list) walk(n);
}
/** Convierte todo lo que se vaya dibujando dentro de `root` (las vistas no tienen que acordarse de hacerlo). */
export function observeNotation(root) {
  if (mode === "en") return;
  walk(root);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "characterData") walk(m.target);
      else for (const n of m.addedNodes) walk(n);
    }
  }).observe(root, { childList: true, subtree: true, characterData: true });
}
