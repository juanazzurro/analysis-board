// Estadísticas sobre tus partidas analizadas: debilidades, etapas, reloj, ritmos, progreso y aperturas.
import { store, gameOf, detectUserColor, saveLibrary, libSignature } from "./state.js";
import { diagnoseEntry, MOTIFS } from "./motifs.js";
import { openingName } from "./chess-util.js";
import { tr } from "./i18n.js";
import { openingFamilyEs } from "./openings.js";
import { dayKey, addDays, startOfDay } from "./srs.js";

export const SPEED_LABEL = { bullet: "Bullet", blitz: "Blitz", rapid: tr("Rápidas", "Rapid"), classical: tr("Clásicas", "Classical"), daily: tr("Por correspondencia", "Correspondence"), correspondence: tr("Por correspondencia", "Correspondence"), ultraBullet: "Bullet" };

export function speedOf(e, g) {
  const s = (e.speed || "").toLowerCase();
  if (s === "ultrabullet") return "bullet";
  if (["bullet", "blitz", "rapid", "classical", "daily", "correspondence"].includes(s)) return s === "correspondence" ? "daily" : s;
  const tc = g && g.tc; if (!tc) return "otro";
  const t = tc.base + 40 * tc.inc;
  return t < 180 ? "bullet" : t < 480 ? "blitz" : t < 1500 ? "rapid" : "classical";
}
export function scoreFor(e, uc) {
  const r = e.result;
  if (r === "1-0") return uc === "w" ? 1 : 0;
  if (r === "0-1") return uc === "b" ? 1 : 0;
  if (r === "½-½" || r === "1/2-1/2") return 0.5;
  return null;
}

let cache = null, cacheKey = "";
const libKey = libSignature;

export function computeInsights() {
  const key = libKey();
  if (cache && cacheKey === key) return cache;
  const games = [], all = []; let pendingAnalysis = 0, own = 0, changed = false;
  for (const e of store.library) {
    const uc = detectUserColor(e); if (!uc) continue;
    own++;
    let g; try { g = gameOf(e); } catch (err) { continue; }
    const opening = openingName(e, g.headers);
    // Para aperturas y ritmos alcanza con el resultado: entran todas tus partidas, analizadas o no.
    all.push({ e, uc, score: scoreFor(e, uc), speed: speedOf(e, g), family: openingFamilyEs(opening, g.moves.slice(0, 8).map((m) => m.san)), st: e.analysis && e.analysis.stats ? e.analysis.stats[uc] : null, date: e.date || 0, analysed: !!e.analysis });
    if (!e.analysis) { pendingAnalysis++; continue; }
    const before = e.diag;
    const d = diagnoseEntry(e, g, uc);
    if (d !== before) changed = true;
    const st = e.analysis.stats ? e.analysis.stats[uc] : null;
    games.push({ e, g, uc, d, st, score: scoreFor(e, uc), speed: speedOf(e, g), opening, date: e.date || 0 });
  }
  if (changed) saveLibrary();
  games.sort((a, b) => a.date - b.date);

  // Errores por motivo (los blunders pesan un poco más que los errores).
  const items = []; for (const x of games) for (const it of x.d.items) items.push({ ...it, game: x });
  const motifs = {};
  for (const it of items) {
    const m = motifs[it.motif] || (motifs[it.motif] = { motif: it.motif, n: 0, w: 0, blunders: 0, examples: [] });
    m.n++; m.w += it.cls === "blunder" ? 1.5 : 1; if (it.cls === "blunder") m.blunders++;
    m.examples.push(it);
  }
  const totalW = Object.values(motifs).reduce((a, m) => a + m.w, 0) || 1;
  const ranked = Object.values(motifs).map((m) => ({ ...m, share: m.w / totalW })).sort((a, b) => b.w - a.w);
  // "Posicional" es lo menos accionable (y a este nivel suele esconder táctica lenta): va al final y solo si falta con qué completar.
  const concrete = ranked.filter((m) => m.motif !== "posicional");
  const top = (concrete.length >= 2 ? concrete : ranked).slice(0, 3);

  const phases = { apertura: 0, medio: 0, final: 0 };
  for (const it of items) phases[it.phase] = (phases[it.phase] || 0) + 1;

  const withClock = items.filter((it) => it.clock);
  const pressure = { total: withClock.length, inPressure: withClock.filter((it) => it.clock.pressure).length, fast: withClock.filter((it) => !it.clock.pressure && it.clock.spent != null && it.clock.spent < 3).length };

  const speeds = {};
  for (const x of all) {
    const s = speeds[x.speed] || (speeds[x.speed] = { speed: x.speed, games: 0, acc: 0, accN: 0, blunders: 0, mistakes: 0, score: 0, scored: 0 });
    s.games++;
    if (x.st) { s.acc += x.st.acc; s.accN++; s.blunders += x.st.blunder; s.mistakes += x.st.mistake; }
    if (x.score != null) { s.score += x.score; s.scored++; }
  }

  const trend = games.filter((x) => x.st).map((x) => ({ date: x.date, acc: x.st.acc, blunders: x.st.blunder, mistakes: x.st.mistake, id: x.e.id, label: `${x.e.white} – ${x.e.black}` }));

  const openings = { w: {}, b: {} };
  for (const x of [...all].sort((a, b) => a.date - b.date)) {
    const fam = x.family;
    const o = openings[x.uc][fam] || (openings[x.uc][fam] = { name: fam, games: 0, w: 0, d: 0, l: 0, acc: 0, accN: 0, lastId: null });
    o.games++; o.lastId = x.e.id;
    if (x.score === 1) o.w++; else if (x.score === 0) o.l++; else if (x.score === 0.5) o.d++;
    if (x.st) { o.acc += x.st.acc; o.accN++; }
  }

  // "Cómo venís" se calcula en el momento: depende del día y de los ejercicios que vayas haciendo.
  const weeklyOf = () => {
    const now = Date.now();
    const weekStart = addDays(now, -6), prevStart = addDays(now, -13);
    const inRange = (x, a, b) => x.date >= a && x.date < b;
    const sumWeek = (a, b) => {
      const gs = games.filter((x) => x.st && inRange(x, a, b));
      const acc = gs.length ? gs.reduce((s, x) => s + x.st.acc, 0) / gs.length : null;
      const bl = gs.length ? gs.reduce((s, x) => s + x.st.blunder, 0) / gs.length : null;
      let ex = 0; for (let d = a; d < b; d = addDays(d, 1)) { const day = store.progress.days[dayKey(d)]; if (day) for (const k of ["errores", "repaso", "amenazas", "problemas", "finales", "revision"]) ex += day[k] || 0; }
      return { games: gs.length, acc, blunders: bl, exercises: ex };
    };
    return { now: sumWeek(startOfDay(weekStart), now + 1), prev: sumWeek(startOfDay(prevStart), startOfDay(weekStart)) };
  };

  cache = { own, pendingAnalysis, games, all, items, ranked, top, phases, pressure, speeds, trend, openings, totalErrors: items.length };
  Object.defineProperty(cache, "weekly", { get: weeklyOf, enumerable: true });
  cacheKey = key;
  return cache;
}
export function invalidateInsights() { cache = null; }

/** Temas de problemas recomendados según tus debilidades. */
export function recommendedThemes() {
  const ins = computeInsights();
  const out = [];
  for (const m of ins.top) for (const t of MOTIFS[m.motif].themes || []) if (!out.includes(t)) out.push(t);
  return out.length ? out : ["hangingPiece", "fork", "mateIn1", "mateIn2", "pin"];
}
