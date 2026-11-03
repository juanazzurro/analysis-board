// Idioma de la interfaz. Lo decide el proceso principal (Ajustes o idioma de la Mac) y llega en la URL
// (?lang=en), así está disponible desde el primer momento, incluso para los textos fijos de los módulos.
const requested = typeof location !== "undefined" ? new URLSearchParams(location.search).get("lang")
  : typeof process !== "undefined" && process.env ? process.env.MESA_LANG : null;
export const LANG = requested === "en" ? "en" : "es";
export const EN = LANG === "en";

/** Elige el texto según el idioma: tr("Hoy", "Today"). */
export const tr = (es, en) => (EN ? en : es);
/** Singular o plural: plural(n, "partida", "partidas", "game", "games"). */
export const plural = (n, es1, esN, en1, enN) => (n === 1 ? tr(es1, en1) : tr(esN, enN));

const PIECE_ES = { p: "peón", n: "caballo", b: "alfil", r: "torre", q: "dama", k: "rey" };
const PIECE_EN = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
const ART_ES = { p: "el peón", n: "el caballo", b: "el alfil", r: "la torre", q: "la dama", k: "el rey" };
/** Nombre de la pieza: "caballo" / "knight". */
export const pieceName = (t) => (EN ? PIECE_EN : PIECE_ES)[t];
/** Con artículo: "el caballo" / "the knight". */
export const pieceArt = (t) => (EN ? "the " + PIECE_EN[t] : ART_ES[t]);
/** "el caballo de e4" / "the knight on e4". */
export const pieceOn = (t, sq) => (EN ? `the ${PIECE_EN[t]} on ${sq}` : `${ART_ES[t]} de ${sq}`);
/** Une una lista: "a, b y c" / "a, b and c". */
export function joinList(items) {
  if (items.length <= 1) return items[0] || "";
  return items.slice(0, -1).join(", ") + tr(" y ", " and ") + items[items.length - 1];
}

const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MONTHS_LONG_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** "3 nov 2026" / "Nov 3, 2026" */
export function fmtShortDate(d) { return EN ? `${MONTHS_EN[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` : `${d.getDate()} ${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`; }
/** "martes 3 de noviembre" / "Tuesday, November 3" */
export function fmtLongDay(d) { return EN ? `${DAYS_EN[d.getDay()]}, ${MONTHS_LONG_EN[d.getMonth()]} ${d.getDate()}` : `${DAYS_ES[d.getDay()]} ${d.getDate()} de ${MONTHS_LONG_ES[d.getMonth()]}`; }
/** Iniciales de los días, empezando por domingo. */
export const DAY_INITIALS = EN ? ["S", "M", "T", "W", "T", "F", "S"] : ["D", "L", "M", "M", "J", "V", "S"];
/** Número con el separador decimal del idioma. */
export const fmt1 = (x) => (x == null ? "–" : EN ? x.toFixed(1) : x.toFixed(1).replace(".", ","));
export const fmtInt = (n) => Number(n).toLocaleString(EN ? "en-US" : "es-AR");

/** Traduce los textos fijos del HTML marcados con data-en, data-en-html, data-en-placeholder, data-en-title y data-en-aria. */
export function translateStatic(root = document) {
  document.documentElement.lang = LANG;
  if (!EN) return;
  root.querySelectorAll("[data-en]").forEach((el) => { el.textContent = el.dataset.en; });
  root.querySelectorAll("[data-en-html]").forEach((el) => { el.innerHTML = el.dataset.enHtml; });
  root.querySelectorAll("[data-en-placeholder]").forEach((el) => { el.placeholder = el.dataset.enPlaceholder; });
  root.querySelectorAll("[data-en-title]").forEach((el) => { el.title = el.dataset.enTitle; });
  root.querySelectorAll("[data-en-aria]").forEach((el) => { el.setAttribute("aria-label", el.dataset.enAria); });
}
