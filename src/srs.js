import { tr } from "./i18n.js";
// Repaso espaciado: cada ejercicio vuelve a los 1, 3, 7, 21 y 60 días si lo resolvés a la primera.
export const INTERVALS = [1, 3, 7, 21, 60];
const DAY = 86400000;

export function dayKey(t = Date.now()) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function startOfDay(t = Date.now()) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
export function addDays(t, n) { const d = new Date(startOfDay(t)); d.setDate(d.getDate() + n); return d.getTime(); }

/** Resuelto alguna vez (aunque haya sido con ayuda). */
export function isSolved(t) { return !!t && (t.solved === true || t.last === "first" || t.last === "later"); }
/** Le toca repaso hoy. */
export function isDue(t, now = Date.now()) { return isSolved(t) && (t.due == null || t.due <= now); }
/** Dominado: lo resolviste a la primera en días distintos hasta superar el intervalo de 3 semanas. */
export function isMastered(t) { return !!t && (t.box || 0) >= 4; }

export function migrate(t) {
  if (t && isSolved(t) && t.box == null) { t.box = 1; t.due = addDays(t.solvedAt || t.at || Date.now(), 1); }
  return t;
}

/** result: "first" (a la primera), "later" (con errores o pista), "revealed" (vio la solución). */
export function recordResult(t, result) {
  t = migrate(t || { seen: 0, first: 0, box: 0 });
  const today = dayKey();
  t.seen = (t.seen || 0) + 1; t.at = Date.now();
  if (result === "first") {
    t.first = (t.first || 0) + 1;
    t.solved = true; t.solvedAt = t.solvedAt || Date.now();
    if (t.lastOkDay !== today) t.box = Math.min((t.box || 0) + 1, INTERVALS.length);
    t.lastOkDay = today;
    t.due = addDays(Date.now(), INTERVALS[Math.max(0, t.box - 1)]);
  } else if (result === "later") {
    t.solved = true; t.solvedAt = t.solvedAt || Date.now();
    t.box = 1; t.due = addDays(Date.now(), 1);
  } else {
    t.box = 0;
    if (isSolved(t)) t.due = addDays(Date.now(), 1);
  }
  t.last = result;
  return t;
}

export function nextReviewText(t) {
  if (!t || !t.due) return "";
  const days = Math.round((startOfDay(t.due) - startOfDay()) / DAY);
  if (days <= 0) return tr("hoy", "today");
  if (days === 1) return tr("mañana", "tomorrow");
  if (days < 7) return tr(`en ${days} días`, `in ${days} days`);
  const w = Math.round(days / 7), mo = Math.round(days / 30);
  if (days < 30) return tr(`en ${w} ${w === 1 ? "semana" : "semanas"}`, `in ${w} ${w === 1 ? "week" : "weeks"}`);
  return tr(`en ${mo} ${mo === 1 ? "mes" : "meses"}`, `in ${mo} ${mo === 1 ? "month" : "months"}`);
}
