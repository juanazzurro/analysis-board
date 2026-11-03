import { tr } from "./i18n.js";
import { wp, toCp, accOf, scoreFromInfo } from "./chess-util.js";

export const DEPTHS = {
  rapida: { label: tr("Rápida", "Fast"), go: "depth 14 movetime 600" },
  normal: { label: tr("Normal", "Normal"), go: "depth 18 movetime 1500" },
  profunda: { label: tr("Profunda", "Deep"), go: "depth 22 movetime 4000" }
};

export const CLS = {
  best: { label: tr("Mejor jugada", "Best move"), short: tr("Mejor", "Best"), g: "★" },
  excellent: { label: tr("Excelente", "Excellent"), short: tr("Excelente", "Excellent"), g: "!" },
  good: { label: tr("Buena", "Good"), short: tr("Buena", "Good"), g: "✓" },
  inacc: { label: tr("Imprecisión", "Inaccuracy"), short: tr("Imprecisión", "Inaccuracy"), g: "?!" },
  mistake: { label: tr("Error", "Mistake"), short: tr("Error", "Mistake"), g: "?" },
  blunder: { label: "Blunder", short: "Blunder", g: "??" }
};

export function classify(before, after, move) {
  const wb = wp(toCp(before)), wa = wp(toCp(after));
  const loss = Math.max(0, move.color === "w" ? wb - wa : wa - wb);
  const cb = Math.max(-1000, Math.min(1000, toCp(before))), ca = Math.max(-1000, Math.min(1000, toCp(after)));
  const cpl = Math.max(0, move.color === "w" ? cb - ca : ca - cb);
  const isBest = !!before.best && before.best.slice(0, 4) === move.uci.slice(0, 4);
  const c = isBest ? "best" : loss >= 20 ? "blunder" : loss >= 10 ? "mistake" : loss >= 5 ? "inacc" : loss < 2 ? "excellent" : "good";
  return { loss, cpl, acc: accOf(loss), c };
}

export function stats(game, info, color) {
  const xs = info.map((x, i) => (x && game.moves[i].color === color ? x : null)).filter(Boolean);
  if (!xs.length) return null;
  const cnt = (k) => xs.filter((x) => x.c === k).length;
  // precisión: promedio armónico-aritmético como Lichess (simplificado)
  const mean = xs.reduce((a, x) => a + x.acc, 0) / xs.length;
  const harm = xs.length / xs.reduce((a, x) => a + 1 / Math.max(x.acc, 1), 0);
  return {
    acc: (mean + harm) / 2,
    acpl: xs.reduce((a, x) => a + x.cpl, 0) / xs.length,
    best: cnt("best"), excellent: cnt("excellent"), good: cnt("good"),
    inacc: cnt("inacc"), mistake: cnt("mistake"), blunder: cnt("blunder"), n: xs.length
  };
}

/**
 * Analiza todas las posiciones. onStep(i, n, evals, info) se llama tras cada posición.
 * shouldStop() permite cortar el análisis.
 */
export async function analyseGame(game, engine, depthKey, onStep, shouldStop) {
  const go = (DEPTHS[depthKey] || DEPTHS.normal).go;
  const n = game.fens.length;
  const evals = new Array(n).fill(null);
  const info = new Array(game.moves.length).fill(null);
  await engine.configure({ MultiPV: 1 });
  await engine.newGame();
  for (let i = 0; i < n; i++) {
    if (shouldStop && shouldStop()) return null;
    if (game.term[i] != null) {
      evals[i] = { done: game.term[i], pv: [], best: null };
    } else {
      const job = engine.search(game.fens[i], go);
      const r = await job.promise;
      if (!r || (shouldStop && shouldStop())) return null;
      evals[i] = Object.assign(scoreFromInfo(r.info, game.fens[i]), { pv: (r.info?.pv || []).slice(0, 12), best: r.best, depth: r.info?.depth || 0 });
    }
    if (i > 0) info[i - 1] = classify(evals[i - 1], evals[i], game.moves[i - 1]);
    if (onStep) onStep(i, n, evals, info);
  }
  return { evals, info, depth: depthKey, at: Date.now() };
}
