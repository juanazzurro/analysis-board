// Devoluciones escritas: qué pasó en una partida, cómo se compara con tus otras partidas, y el informe de la semana o del mes.
// Todo sale del análisis guardado: no usa internet ni IA.
import { store, gameOf, detectUserColor } from "./state.js";
import { computeInsights, scoreFor, speedOf, SPEED_LABEL } from "./insights.js";
import { diagnoseEntry, MOTIFS } from "./motifs.js";
import { wp, toCp, evalText, moveLabel, phaseOf, clockAt, openingName, PHASE_LABEL } from "./chess-util.js";
import { CLS } from "./analysis.js";
import { openingFamilyEs } from "./openings.js";
import { tr, EN, fmt1 } from "./i18n.js";
import { dayKey, addDays, startOfDay } from "./srs.js";
import { bookOf } from "./eco.js";

const DAY = 86400000;
const pc = (x) => Math.round(x) + "%";
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const nGames = (n) => tr(`${n} ${n === 1 ? "partida" : "partidas"}`, `${n} ${n === 1 ? "game" : "games"}`);
const times = (n) => tr(`${n} ${n === 1 ? "vez" : "veces"}`, `${n} ${n === 1 ? "time" : "times"}`);

/** Ventaja en palabras, desde el punto de vista de quien lee (u = probabilidad de ganar, 0 a 100). */
function standing(u) {
  if (u >= 88) return tr("con posición ganadora", "with a winning position");
  if (u >= 70) return tr("con clara ventaja", "clearly better");
  if (u >= 58) return tr("algo mejor", "slightly better");
  if (u > 42) return tr("con la posición pareja", "with an equal position");
  if (u > 30) return tr("algo peor", "slightly worse");
  if (u > 12) return tr("con clara desventaja", "clearly worse");
  return tr("con posición perdida", "with a lost position");
}
const lab = (g, k) => moveLabel(g.fens[k], g.moves[k].san, g.moves[k].color);
/** Evaluación contada desde el lado de quien lee (sign = 1 blancas, -1 negras): "+1.2" es a su favor. */
function povEval(s, sign) {
  if (!s) return "…";
  if (s.done != null) return evalText(s);
  if (s.mate != null) { const m = s.mate * sign; return m > 0 ? tr(`mate a favor en ${m}`, `mate in ${m} for you`) : tr(`mate en contra en ${-m}`, `mate in ${-m} against you`); }
  const v = (sign * s.cp) / 100; return (v > 0.04 ? "+" : v < -0.04 ? "−" : "") + Math.abs(v).toFixed(1);
}

function phaseBounds(game) {
  const ph = game.fens.map((f, i) => phaseOf(f, i));
  let mid = ph.findIndex((p) => p !== "apertura"); if (mid < 0) mid = ph.length;
  let end = ph.findIndex((p, i) => i >= mid && p === "final"); if (end < 0) end = ph.length;
  return { ph, mid, end };
}

/**
 * Devolución de una partida. uc = color del usuario ("w"/"b") o null si no jugó.
 * Devuelve { verdict, story[], clock, mine[], context[], contextNote, next[], turning }.
 */
export function gameReport(entry, game, uc) {
  const an = entry.analysis; if (!an || !an.evals || !an.info) return null;
  const n = game.moves.length;
  const pov = uc || "w";
  const sign = pov === "w" ? 1 : -1;
  const U = an.evals.map((e) => (e ? wp(sign * toCp(e)) : 50));
  const me = uc ? null : entry.white, opp = uc ? null : entry.black; // sin usuario se habla de Blancas y Negras por nombre
  const score = scoreFor(entry, pov);
  const errsOf = (color) => an.info.map((x, k) => ({ x, k })).filter((o) => o.x && game.moves[o.k].color === color && (o.x.c === "mistake" || o.x.c === "blunder"));
  const mineE = errsOf(pov), theirE = errsOf(pov === "w" ? "b" : "w");
  const st = an.stats ? an.stats[pov] : null, stO = an.stats ? an.stats[pov === "w" ? "b" : "w"] : null;
  let minU = 100, minK = 0, maxU = 0, maxK = 0;
  U.forEach((u, i) => { if (u < minU) { minU = u; minK = i; } if (u > maxU) { maxU = u; maxK = i; } });
  // Con usuario, las evaluaciones del relato se cuentan desde su lado; sin usuario, como siempre, desde las blancas.
  const ev = (s) => (uc ? povEval(s, sign) : evalText(s));
  const moveNo = (i) => Math.max(1, Math.ceil(i / 2) + ((+game.fens[0].split(" ")[5] || 1) - 1));

  /* ----- veredicto ----- */
  let verdict;
  const you = (es, en) => tr(es, en);
  if (uc) {
    if (score === 1) {
      if (minU >= 40) verdict = you("Ganaste sin pasar sobresaltos: nunca estuviste claramente peor.", "You won without any scares: you were never clearly worse.");
      else if (minU < 20) verdict = you(`La diste vuelta: en la jugada ${moveNo(minK)} estabas perdido y terminaste ganando.`, `You turned it around: on move ${moveNo(minK)} you were lost, and you ended up winning.`);
      else verdict = you(`Ganaste una partida con idas y vueltas: llegaste a estar peor en la jugada ${moveNo(minK)}.`, `You won a back-and-forth game: you were worse on move ${moveNo(minK)}.`);
    } else if (score === 0) {
      if (maxU >= 80) verdict = you(`Se te escapó una partida ganada: en la jugada ${moveNo(maxK)} tenías ventaja decisiva.`, `A won game slipped away: on move ${moveNo(maxK)} you had a decisive advantage.`);
      else if (maxU >= 62) verdict = you(`Perdiste una partida en la que llegaste a estar mejor (jugada ${moveNo(maxK)}).`, `You lost a game in which you were better at one point (move ${moveNo(maxK)}).`);
      else verdict = you("Perdiste sin llegar a tener ventaja: tu rival llevó la iniciativa desde temprano.", "You lost without ever being better: your opponent had the initiative from early on.");
    } else if (score === 0.5) {
      if (maxU >= 80) verdict = you(`Tablas con sabor a poco: en la jugada ${moveNo(maxK)} tenías la partida ganada.`, `A draw that could have been more: on move ${moveNo(maxK)} you were winning.`);
      else if (minU <= 20) verdict = you(`Salvaste medio punto: en la jugada ${moveNo(minK)} estabas perdido.`, `You saved half a point: on move ${moveNo(minK)} you were lost.`);
      else verdict = you("Tablas en una partida pareja.", "A draw in a balanced game.");
    } else verdict = you("Partida sin resultado registrado.", "Game with no recorded result.");
  } else {
    const r = entry.result;
    verdict = r === "1-0" ? tr(`Ganó ${entry.white} con blancas.`, `${entry.white} won with White.`) : r === "0-1" ? tr(`Ganó ${entry.black} con negras.`, `${entry.black} won with Black.`) : (r === "½-½" || r === "1/2-1/2") ? tr("La partida terminó en tablas.", "The game ended in a draw.") : tr("Partida sin resultado registrado.", "Game with no recorded result.");
  }
  if (uc) {
    const mine = uc === "w" ? entry.whiteElo : entry.blackElo, theirs = uc === "w" ? entry.blackElo : entry.whiteElo;
    if (mine && theirs && Math.abs(mine - theirs) >= 80) {
      const d = Math.abs(mine - theirs);
      verdict += " " + (theirs > mine ? tr(`Tu rival tenía ${d} puntos más que vos.`, `Your opponent was rated ${d} points above you.`) : tr(`Tu rival tenía ${d} puntos menos que vos.`, `Your opponent was rated ${d} points below you.`));
    }
  }

  /* ----- el momento que decidió la partida ----- */
  let turning = null;
  {
    // La jugada que más probabilidad de ganar regaló y que no se recuperó: la última gran caída del bando que terminó peor.
    const all = an.info.map((x, k) => ({ x, k })).filter((o) => o.x && o.x.loss >= 12);
    const loserColor = score === 1 ? (pov === "w" ? "b" : "w") : score === 0 ? pov : null;
    const cand = loserColor ? all.filter((o) => game.moves[o.k].color === loserColor) : all;
    cand.sort((a, b) => b.x.loss - a.x.loss);
    const t = cand[0];
    if (t) {
      const mineMove = game.moves[t.k].color === pov;
      const who = uc ? (mineMove ? tr("tuyo", "by you") : tr("de tu rival", "by your opponent")) : tr(`de ${mineMove ? entry.white : entry.black}`, `by ${mineMove ? entry.white : entry.black}`);
      const before = an.evals[t.k], after = an.evals[t.k + 1];
      turning = { k: t.k, text: tr(
        `El momento que más pesó fue ${lab(game, t.k)}, ${CLS[t.x.c].label.toLowerCase()} ${who}: la evaluación${uc ? ", vista desde tu lado," : ""} pasó de ${ev(before)} a ${ev(after)}.`,
        `The moment that mattered most was ${lab(game, t.k)}, a ${CLS[t.x.c].label.toLowerCase()} ${who}: the evaluation${uc ? ", seen from your side," : ""} went from ${ev(before)} to ${ev(after)}.`) };
    }
  }

  /* ----- relato por etapas ----- */
  const story = [];
  const { ph, mid, end } = phaseBounds(game);
  const fam = openingFamilyEs(openingName(entry, game.headers), game.moves.slice(0, 8).map((m) => m.san));
  const other = tr("Otras", "Other");
  const inPhase = (list, a, b) => list.filter((o) => o.k >= a && o.k < b);
  const subj = uc ? null : entry.white;
  {
    const u = U[Math.min(mid, U.length - 1)];
    const errs = inPhase(mineE, 0, mid);
    // Nombre exacto y código ECO, del libro de aperturas; y hasta dónde llegó la teoría conocida.
    const book = bookOf(game), exact = book.name ? `${book.eco} ${book.name}` : "";
    let s = fam && fam !== other ? tr(`Apertura: ${fam}${exact ? ` (${exact})` : ""}. `, `Opening: ${fam}${exact ? ` (${exact})` : ""}. `) : exact ? tr(`Apertura: ${exact}. `, `Opening: ${exact}. `) : "";
    if (book.ply >= 4 && book.ply < n) s += tr(`La teoría conocida llegó hasta la jugada ${Math.ceil(book.ply / 2)}. `, `Known theory lasted until move ${Math.ceil(book.ply / 2)}. `);
    if (mid >= n) s += uc ? tr(`La partida no salió de la apertura; terminaste ${standing(U[U.length - 1])}.`, `The game never left the opening; you finished ${standing(U[U.length - 1])}.`) : tr(`La partida no salió de la apertura.`, `The game never left the opening.`);
    else s += uc ? tr(`Saliste de la apertura ${standing(u)} (${ev(an.evals[mid])} en la jugada ${moveNo(mid)})`, `You came out of the opening ${standing(u)} (${ev(an.evals[mid])} on move ${moveNo(mid)})`)
      : tr(`${subj} salió de la apertura ${standing(u)} (${ev(an.evals[mid])} en la jugada ${moveNo(mid)})`, `${subj} came out of the opening ${standing(u)} (${ev(an.evals[mid])} on move ${moveNo(mid)})`);
    if (mid < n) s += errs.length ? (uc ? tr(`, con ${errs.length === 1 ? "un error" : errs.length + " errores"} en esas primeras jugadas (${errs.map((o) => lab(game, o.k)).join(", ")}).`, `, with ${errs.length === 1 ? "one mistake" : errs.length + " mistakes"} in those first moves (${errs.map((o) => lab(game, o.k)).join(", ")}).`) : ".") : ".";
    story.push(s);
  }
  if (mid < n) {
    const a = mid, b = Math.min(end, n);
    const m1 = inPhase(mineE, a, b), t1 = inPhase(theirE, a, b);
    const uEnd = U[Math.min(b, U.length - 1)];
    let s;
    if (uc) {
      s = tr(`En el medio juego `, `In the middlegame `);
      if (!m1.length && !t1.length) s += tr(`nadie cometió errores graves`, `neither side made a serious mistake`);
      else if (!m1.length) s += tr(`no cometiste errores graves y tu rival cometió ${t1.length}`, `you made no serious mistakes and your opponent made ${t1.length}`);
      else s += tr(`cometiste ${m1.length === 1 ? "un error grave" : m1.length + " errores graves"}${t1.length ? ` y tu rival ${t1.length}` : " y tu rival ninguno"}`, `you made ${m1.length === 1 ? "one serious mistake" : m1.length + " serious mistakes"}${t1.length ? ` and your opponent ${t1.length}` : " and your opponent none"}`);
      s += end < n ? tr(`; llegaste al final ${standing(uEnd)}.`, `; you reached the endgame ${standing(uEnd)}.`) : tr(`; la partida terminó ahí, ${standing(U[U.length - 1])} para vos.`, `; the game ended there, ${standing(U[U.length - 1])} for you.`);
    } else {
      s = tr(`En el medio juego ${entry.white} cometió ${m1.length} ${m1.length === 1 ? "error grave" : "errores graves"} y ${entry.black} ${t1.length}.`, `In the middlegame ${entry.white} made ${m1.length} serious ${m1.length === 1 ? "mistake" : "mistakes"} and ${entry.black} ${t1.length}.`);
    }
    story.push(s);
  }
  if (end < n && n - end >= 4) {
    const m2 = inPhase(mineE, end, n), t2 = inPhase(theirE, end, n);
    const uS = U[end], uF = U[U.length - 1];
    let s;
    if (uc) {
      if (uS >= 70 && score === 1) s = tr(`En el final convertiste la ventaja${m2.length ? `, aunque con ${m2.length === 1 ? "un error" : m2.length + " errores"} en el camino` : " sin errores graves"}.`, `In the endgame you converted your advantage${m2.length ? `, though with ${m2.length === 1 ? "one mistake" : m2.length + " mistakes"} along the way` : " without serious mistakes"}.`);
      else if (uS >= 70 && score !== 1) s = tr(`Entraste al final con ventaja y no la pudiste convertir${m2.length ? ` (${m2.map((o) => lab(game, o.k)).join(", ")})` : ""}.`, `You entered the endgame with an advantage and couldn't convert it${m2.length ? ` (${m2.map((o) => lab(game, o.k)).join(", ")})` : ""}.`);
      else if (uS <= 30 && score !== 0) s = tr(`Entraste al final en desventaja y lo salvaste${t2.length ? ` gracias a ${t2.length === 1 ? "un error" : t2.length + " errores"} de tu rival` : ""}.`, `You entered the endgame worse and saved it${t2.length ? ` thanks to ${t2.length === 1 ? "one mistake" : t2.length + " mistakes"} by your opponent` : ""}.`);
      else s = tr(`En el final cometiste ${m2.length} ${m2.length === 1 ? "error grave" : "errores graves"} y tu rival ${t2.length}; terminaste ${standing(uF)}.`, `In the endgame you made ${m2.length} serious ${m2.length === 1 ? "mistake" : "mistakes"} and your opponent ${t2.length}; you finished ${standing(uF)}.`);
    } else s = tr(`En el final ${entry.white} cometió ${m2.length} ${m2.length === 1 ? "error grave" : "errores graves"} y ${entry.black} ${t2.length}.`, `In the endgame ${entry.white} made ${m2.length} serious ${m2.length === 1 ? "mistake" : "mistakes"} and ${entry.black} ${t2.length}.`);
    story.push(s);
  }
  if (turning) story.push(turning.text);

  /* ----- reloj ----- */
  let clock = null;
  if (uc && game.clocks && game.clocks.some((c) => c != null)) {
    const ks = game.moves.map((m, k) => k).filter((k) => game.moves[k].color === uc);
    const spent = ks.map((k) => clockAt(game, k)).filter((c) => c && c.spent != null);
    const ce = mineE.map((o) => clockAt(game, o.k)).filter(Boolean);
    const press = ce.filter((c) => c.pressure).length, fast = ce.filter((c) => !c.pressure && c.spent != null && c.spent < 3).length;
    const last = clockAt(game, ks[ks.length - 1]);
    const parts = [];
    if (spent.length) parts.push(tr(`Pensaste en promedio ${fmt1(avg(spent.map((c) => c.spent)))} s por jugada`, `You spent ${fmt1(avg(spent.map((c) => c.spent)))} s per move on average`) + (last ? tr(` y terminaste con ${fmtClock(last.left)} en el reloj.`, ` and finished with ${fmtClock(last.left)} on the clock.`) : "."));
    if (ce.length && press) parts.push(tr(`${press} de tus ${ce.length} errores graves ${press === 1 ? "fue" : "fueron"} con apuro de tiempo.`, `${press} of your ${ce.length} serious mistakes ${press === 1 ? "was" : "were"} made in time trouble.`));
    if (fast) parts.push(tr(`${fast === 1 ? "Un error fue una jugada hecha" : fast + " errores fueron jugadas hechas"} en menos de 3 segundos, sin estar apurado.`, `${fast === 1 ? "One mistake was a move played" : fast + " mistakes were moves played"} in under 3 seconds, without time trouble.`));
    if (ce.length && !press && !fast) parts.push(tr("Tus errores no fueron por el reloj: tuviste tiempo para pensarlos.", "Your mistakes weren't about the clock: you had time to think."));
    clock = parts.join(" ") || null;
  }

  /* ----- tus errores, por tipo ----- */
  const mine = [];
  let diag = null;
  if (uc) {
    diag = diagnoseEntry(entry, game, uc);
    const by = {};
    for (const it of diag ? diag.items : []) (by[it.motif] = by[it.motif] || []).push(it);
    for (const [motif, items] of Object.entries(by)) mine.push({ motif, n: items.length, label: MOTIFS[motif].short, moves: items.map((it) => it.k) });
    mine.sort((a, b) => b.n - a.n);
  }

  /* ----- en contexto: tus otras partidas ----- */
  const context = []; let contextNote = null, period = null;
  if (uc && st) {
    const ins = computeInsights();
    const date = entry.date || Date.now();
    const others = ins.games.filter((x) => x.e.id !== entry.id && x.st);
    let pool = others.filter((x) => x.date <= date && x.date >= date - 30 * DAY);
    let poolLabel = tr(`tus otras ${nGames(pool.length)} de esos 30 días`, `your other ${nGames(pool.length)} from those 30 days`);
    if (pool.length < 3) {
      pool = others.filter((x) => x.date <= date).slice(-20);
      if (pool.length < 3) pool = others.slice(-20);
      poolLabel = tr(`tus otras ${nGames(pool.length)} analizadas`, `your other ${pool.length} analyzed ${pool.length === 1 ? "game" : "games"}`);
    }
    if (pool.length < 3) contextNote = tr("Cuando tengas al menos 3 partidas más analizadas, acá vas a ver cómo se compara esta con las demás.", "Once you have at least 3 more analyzed games, you'll see here how this one compares with the rest.");
    else {
      period = { n: pool.length, label: poolLabel };
      const accs = pool.map((x) => x.st.acc), mAcc = avg(accs);
      const d = st.acc - mAcc;
      const better = accs.filter((a) => a > st.acc).length;
      context.push({ tone: d >= 3 ? "up" : d <= -3 ? "down" : "flat", text: tr(
        `Precisión ${pc(st.acc)}: ${Math.abs(d) < 3 ? "en línea con" : d > 0 ? `${Math.round(d)} puntos por encima de` : `${Math.round(-d)} puntos por debajo de`} tu promedio de ${pc(mAcc)} en ${poolLabel}${better === 0 ? ". Fue tu mejor partida del período" : better === pool.length ? ". Fue la más floja del período" : ""}.`,
        `Accuracy ${pc(st.acc)}: ${Math.abs(d) < 3 ? "in line with" : d > 0 ? `${Math.round(d)} points above` : `${Math.round(-d)} points below`} your ${pc(mAcc)} average across ${poolLabel}${better === 0 ? ". It was your best game of the period" : better === pool.length ? ". It was the weakest of the period" : ""}.`) });
      const week = others.filter((x) => x.date <= date && x.date >= date - 7 * DAY);
      if (week.length >= 2 && week.length < pool.length) {
        const wAcc = avg(week.map((x) => x.st.acc));
        context.push({ tone: wAcc - mAcc >= 3 ? "up" : wAcc - mAcc <= -3 ? "down" : "flat", text: tr(
          `En la última semana (${nGames(week.length)}) tu precisión media fue ${pc(wAcc)}: ${Math.abs(wAcc - mAcc) < 3 ? "igual que en el mes" : wAcc > mAcc ? "venís en alza" : "venís en baja"}.`,
          `Over the last week (${nGames(week.length)}) your average accuracy was ${pc(wAcc)}: ${Math.abs(wAcc - mAcc) < 3 ? "the same as over the month" : wAcc > mAcc ? "you're trending up" : "you're trending down"}.`) });
      }
      const errsHere = st.blunder + st.mistake, errsAvg = avg(pool.map((x) => x.st.blunder + x.st.mistake));
      context.push({ tone: errsHere < errsAvg - 0.5 ? "up" : errsHere > errsAvg + 0.5 ? "down" : "flat", text: tr(
        `Errores graves: ${errsHere} en esta partida; tu promedio es ${fmt1(errsAvg)} por partida.`,
        `Serious mistakes: ${errsHere} in this game; your average is ${fmt1(errsAvg)} per game.`) });
      // ¿Son los errores de siempre?
      const counts = {}; const inGames = {};
      for (const x of pool) { const seen = new Set(); for (const it of x.d ? x.d.items : []) { counts[it.motif] = (counts[it.motif] || 0) + 1; if (!seen.has(it.motif)) { seen.add(it.motif); inGames[it.motif] = (inGames[it.motif] || 0) + 1; } } }
      const rank = Object.entries(counts).sort((a, b) => b[1] - a[1]).map((e) => e[0]).filter((m) => m !== "posicional");
      // "Posicional" dice poco: solo se comenta si no hay nada más concreto.
      const concrete = mine.filter((m) => m.motif !== "posicional");
      for (const m of (concrete.length ? concrete : mine).slice(0, 3)) {
        const c = counts[m.motif] || 0;
        const isTop = rank[0] === m.motif;
        if (c >= 2) context.push({ tone: "down", motif: m.motif, text: tr(
          `${MOTIFS[m.motif].short}: ${times(m.n)} en esta partida y ${c} más en ${poolLabel} (en ${inGames[m.motif]} de ${pool.length}).${isTop ? " Es tu error más repetido." : " Es un patrón tuyo."}`,
          `${MOTIFS[m.motif].short}: ${times(m.n)} in this game and ${c} more across ${poolLabel} (in ${inGames[m.motif]} of ${pool.length}).${isTop ? " It's your most repeated mistake." : " It's a pattern of yours."}`) });
        else context.push({ tone: "flat", motif: m.motif, text: tr(
          `${MOTIFS[m.motif].short}: ${times(m.n)} en esta partida. No es habitual en vos${c ? ` (${times(c)} más en el período)` : ""}.`,
          `${MOTIFS[m.motif].short}: ${times(m.n)} in this game. It's not usual for you${c ? ` (${times(c)} more in the period)` : ""}.`) });
      }
      if (rank[0] && counts[rank[0]] >= 3 && !mine.some((m) => m.motif === rank[0])) context.push({ tone: "up", text: tr(
        `Esta vez evitaste tu error más repetido: “${MOTIFS[rank[0]].short.toLowerCase()}” (${times(counts[rank[0]])} en el período).`,
        `This time you avoided your most repeated mistake: “${MOTIFS[rank[0]].short.toLowerCase()}” (${times(counts[rank[0]])} in the period).`) });
      // reloj, comparado
      if (diag && diag.items.length) {
        const pi = pool.flatMap((x) => (x.d ? x.d.items : [])).filter((it) => it.clock);
        const here = diag.items.filter((it) => it.clock);
        if (pi.length >= 5 && here.length) {
          const share = pi.filter((it) => it.clock.pressure).length / pi.length, mineP = here.filter((it) => it.clock.pressure).length / here.length;
          if (mineP >= 0.5 && share >= 0.3) context.push({ tone: "down", text: tr(`El reloj volvió a pesar: en el período, el ${pc(share * 100)} de tus errores son con apuro de tiempo.`, `The clock was a factor again: over the period, ${pc(share * 100)} of your mistakes come in time trouble.`) });
        }
      }
    }
    // la apertura, con todas tus partidas (no solo las del período)
    if (fam && fam !== other) {
      const same = ins.all.filter((x) => x.e.id !== entry.id && x.uc === uc && x.family === fam && x.score != null);
      if (same.length >= 2) {
        const pts = same.reduce((a, x) => a + x.score, 0), wins = same.filter((x) => x.score === 1).length;
        const accs = same.filter((x) => x.st).map((x) => x.st.acc), mA = avg(accs);
        const share = pts / same.length;
        context.push({ tone: share >= 0.6 ? "up" : share <= 0.4 ? "down" : "flat", text: tr(
          `${fam} con ${uc === "w" ? "blancas" : "negras"}: la jugaste ${same.length} veces más, ganaste ${wins} (${pc(share * 100)} de los puntos)${mA != null ? ` con precisión media de ${pc(mA)}` : ""}.`,
          `${fam} as ${uc === "w" ? "White" : "Black"}: you played it ${same.length} other times and won ${wins} (${pc(share * 100)} of the points)${mA != null ? ` with ${pc(mA)} average accuracy` : ""}.`) });
      }
    }
    // el ritmo
    const sp = speedOf(entry, game), spAll = ins.speeds[sp];
    if (spAll && spAll.accN >= 4 && SPEED_LABEL[sp]) {
      const a = spAll.acc / spAll.accN;
      if (Math.abs(st.acc - a) >= 5) context.push({ tone: st.acc > a ? "up" : "down", text: tr(
        `En ${SPEED_LABEL[sp].toLowerCase()} tu precisión habitual es ${pc(a)}; esta fue ${st.acc > a ? "mejor" : "peor"}.`,
        `In ${SPEED_LABEL[sp].toLowerCase()} your usual accuracy is ${pc(a)}; this one was ${st.acc > a ? "better" : "worse"}.`) });
    }
  }

  /* ----- qué hacer ahora ----- */
  const next = [];
  if (uc && mineE.length) next.push({ act: "train-game", label: mineE.length === 1 ? tr("Entrenar el error de esta partida", "Train this game's mistake") : tr(`Entrenar los ${mineE.length} errores de esta partida`, `Train this game's ${mineE.length} mistakes`) });
  const seen = new Set();
  for (const m of mine) {
    const t = MOTIFS[m.motif].train; if (seen.has(t)) continue; seen.add(t);
    if (t === "threats") next.push({ act: "threats", label: tr("Practicar “¿Qué te amenaza?”", "Practice “What's the threat?”") });
    else if (t === "puzzles") next.push({ act: "puzzles", arg: (MOTIFS[m.motif].themes || [])[0], label: tr("Hacer problemas de táctica", "Solve tactics puzzles") });
    else if (t === "endgames") next.push({ act: "endgames", label: tr("Repasar finales básicos", "Review basic endgames") });
    if (next.length >= 3) break;
  }

  return { verdict, story, clock, mine, context, contextNote, period, next, turning, stats: { me: st, opp: stO } };
}
function fmtClock(s) { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60), r = s % 60; return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`; }
export { fmtClock };

/** Texto plano de la devolución y su contexto, para sumar a las explicaciones con IA. */
export function reportText(rep) {
  if (!rep) return "";
  return [rep.verdict, ...rep.story, rep.clock, rep.mine.length ? tr("Errores por tipo: ", "Mistakes by type: ") + rep.mine.map((m) => `${m.label} (${m.n})`).join(", ") : "", ...rep.context.map((c) => "- " + c.text)].filter(Boolean).join("\n");
}

/* =====================================================================================
   Informe del período (semana o mes), comparado con el período anterior
   ===================================================================================== */
export const RANGES = { week: 7, month: 30 };
export function rangeStart(range, now = Date.now()) { return RANGES[range] ? startOfDay(addDays(now, -(RANGES[range] - 1))) : 0; }

function periodStats(ins, a, b) {
  const all = ins.all.filter((x) => x.date >= a && x.date < b);
  const games = ins.games.filter((x) => x.date >= a && x.date < b && x.st);
  const scored = all.filter((x) => x.score != null);
  const motifs = {}; let press = 0, clocked = 0; const phases = { apertura: 0, medio: 0, final: 0 };
  for (const x of games) for (const it of x.d ? x.d.items : []) { motifs[it.motif] = (motifs[it.motif] || 0) + 1; phases[it.phase]++; if (it.clock) { clocked++; if (it.clock.pressure) press++; } }
  let ex = 0, days = 0;
  for (let d = a; d < b; d = addDays(d, 1)) { const day = store.progress.days[dayKey(d)]; let n = 0; if (day) for (const k of ["errores", "repaso", "amenazas", "problemas", "finales", "revision"]) n += day[k] || 0; ex += n; if (n) days++; }
  return {
    played: all.length, analysed: games.length, w: scored.filter((x) => x.score === 1).length, d: scored.filter((x) => x.score === 0.5).length, l: scored.filter((x) => x.score === 0).length,
    points: scored.length ? scored.reduce((s, x) => s + x.score, 0) / scored.length : null,
    acc: avg(games.map((x) => x.st.acc)), blunders: avg(games.map((x) => x.st.blunder)), mistakes: avg(games.map((x) => x.st.mistake)),
    motifs, errors: Object.values(motifs).reduce((s, v) => s + v, 0), pressure: clocked >= 4 ? press / clocked : null, phases, exercises: ex, days, games
  };
}

/** Informe de los últimos 7 o 30 días contra los 7 o 30 anteriores. */
export function periodReport(range) {
  const ins = computeInsights();
  const N = RANGES[range]; if (!N) return null;
  const now = Date.now(), a = rangeStart(range, now), prevA = addDays(a, -N);
  const cur = periodStats(ins, a, now + 1), prev = periodStats(ins, prevA, a);
  const name = range === "week" ? tr("la semana", "the week") : tr("el mes", "the month");
  const prevName = range === "week" ? tr("la semana anterior", "the previous week") : tr("el mes anterior", "the previous month");
  const lines = [];
  if (!cur.played) return { range, cur, prev, empty: true, lines: [{ tone: "flat", text: tr(`No jugaste partidas en los últimos ${N} días. Importá las más recientes desde Partidas para ver el informe.`, `You played no games in the last ${N} days. Import your latest ones from Games to see the report.`) }] };

  const pts = cur.points != null ? pc(cur.points * 100) : null;
  lines.push({ tone: cur.points != null && prev.points != null ? (cur.points - prev.points >= 0.08 ? "up" : cur.points - prev.points <= -0.08 ? "down" : "flat") : "flat", text: tr(
    `Jugaste ${nGames(cur.played)}: ${cur.w} ${cur.w === 1 ? "ganada" : "ganadas"}, ${cur.d} ${cur.d === 1 ? "empatada" : "empatadas"} y ${cur.l} ${cur.l === 1 ? "perdida" : "perdidas"}${pts ? ` (${pts} de los puntos${prev.points != null ? `; ${prevName}, ${pc(prev.points * 100)} en ${nGames(prev.played)}` : ""})` : ""}.`,
    `You played ${nGames(cur.played)}: ${cur.w} ${cur.w === 1 ? "win" : "wins"}, ${cur.d} ${cur.d === 1 ? "draw" : "draws"} and ${cur.l} ${cur.l === 1 ? "loss" : "losses"}${pts ? ` (${pts} of the points${prev.points != null ? `; ${prevName}, ${pc(prev.points * 100)} over ${nGames(prev.played)}` : ""})` : ""}.`) });
  if (!cur.analysed) lines.push({ tone: "flat", text: tr("Todavía no están analizadas: cuando termine el análisis vas a ver acá la precisión, los errores y qué se repite.", "They aren't analyzed yet: once the analysis finishes you'll see accuracy, mistakes and patterns here.") });
  else if (cur.analysed < cur.played) lines.push({ tone: "flat", text: tr(`${cur.played - cur.analysed} de esas partidas todavía no ${cur.played - cur.analysed === 1 ? "está analizada" : "están analizadas"}: el resto del informe usa las ${cur.analysed} que sí.`, `${cur.played - cur.analysed} of those games ${cur.played - cur.analysed === 1 ? "isn't" : "aren't"} analyzed yet: the rest of the report uses the ${cur.analysed} that are.`) });
  if (cur.acc != null) {
    const d = prev.acc != null ? cur.acc - prev.acc : null;
    lines.push({ tone: d == null ? "flat" : d >= 2 ? "up" : d <= -2 ? "down" : "flat", text: tr(
      `Precisión media ${pc(cur.acc)}${d != null ? (Math.abs(d) < 2 ? `, igual que ${prevName} (${pc(prev.acc)})` : `, ${Math.round(Math.abs(d))} ${Math.round(Math.abs(d)) === 1 ? "punto" : "puntos"} ${d > 0 ? "más" : "menos"} que ${prevName} (${pc(prev.acc)})`) : ""}.`,
      `Average accuracy ${pc(cur.acc)}${d != null ? (Math.abs(d) < 2 ? `, the same as ${prevName} (${pc(prev.acc)})` : `, ${Math.round(Math.abs(d))} ${Math.round(Math.abs(d)) === 1 ? "point" : "points"} ${d > 0 ? "higher" : "lower"} than ${prevName} (${pc(prev.acc)})`) : ""}.`) });
    const b = cur.blunders, pb = prev.blunders;
    lines.push({ tone: pb == null ? "flat" : b <= pb - 0.3 ? "up" : b >= pb + 0.3 ? "down" : "flat", text: tr(
      `Blunders por partida: ${fmt1(b)}${pb != null ? ` (${prevName}: ${fmt1(pb)})` : ""}. Errores por partida: ${fmt1(cur.mistakes)}${prev.mistakes != null ? ` (${fmt1(prev.mistakes)})` : ""}.`,
      `Blunders per game: ${fmt1(b)}${pb != null ? ` (${prevName}: ${fmt1(pb)})` : ""}. Mistakes per game: ${fmt1(cur.mistakes)}${prev.mistakes != null ? ` (${fmt1(prev.mistakes)})` : ""}.`) });
  }
  // patrones: se comparan por partida, para que jugar más o menos no distorsione
  const rate = (s, m) => (s.analysed ? (s.motifs[m] || 0) / s.analysed : null);
  const ms = Object.keys({ ...cur.motifs, ...prev.motifs }).filter((m) => m !== "posicional");
  const ranked = ms.filter((m) => cur.motifs[m]).sort((x, y) => cur.motifs[y] - cur.motifs[x]);
  let focus = ranked[0] || null;
  if (focus) {
    const c = cur.motifs[focus], r = rate(cur, focus), pr = rate(prev, focus);
    lines.push({ tone: pr != null && prev.analysed >= 3 ? (r < pr * 0.75 ? "up" : r > pr * 1.25 + 0.1 ? "down" : "flat") : "flat", motif: focus, text: tr(
      `Lo que más se repitió: “${MOTIFS[focus].short.toLowerCase()}”, ${times(c)} (${fmt1(r)} por partida${pr != null && prev.analysed >= 3 ? `; ${prevName}, ${fmt1(pr)}` : ""}).`,
      `Most repeated: “${MOTIFS[focus].short.toLowerCase()}”, ${times(c)} (${fmt1(r)} per game${pr != null && prev.analysed >= 3 ? `; ${prevName}, ${fmt1(pr)}` : ""}).`) });
  }
  if (prev.analysed >= 3 && cur.analysed >= 3) {
    const deltas = ms.map((m) => ({ m, d: rate(cur, m) - rate(prev, m), c: cur.motifs[m] || 0, p: prev.motifs[m] || 0 }));
    const best = deltas.filter((x) => x.p >= 2 && x.d <= -0.25).sort((x, y) => x.d - y.d)[0];
    const worst = deltas.filter((x) => x.c >= 2 && x.d >= 0.25 && x.m !== focus).sort((x, y) => y.d - x.d)[0];
    if (best) lines.push({ tone: "up", text: tr(`Mejoraste en “${MOTIFS[best.m].short.toLowerCase()}”: de ${best.p} en ${nGames(prev.analysed)} a ${best.c} en ${nGames(cur.analysed)}.`, `You improved at “${MOTIFS[best.m].short.toLowerCase()}”: from ${best.p} in ${nGames(prev.analysed)} to ${best.c} in ${nGames(cur.analysed)}.`) });
    if (worst) lines.push({ tone: "down", text: tr(`Empeoró “${MOTIFS[worst.m].short.toLowerCase()}”: de ${worst.p} en ${nGames(prev.analysed)} a ${worst.c} en ${nGames(cur.analysed)}.`, `“${MOTIFS[worst.m].short}” got worse: from ${worst.p} in ${nGames(prev.analysed)} to ${worst.c} in ${nGames(cur.analysed)}.`) });
  }
  if (cur.errors >= 4) {
    const ph = Object.entries(cur.phases).sort((x, y) => y[1] - x[1])[0];
    if (ph[1] / cur.errors >= 0.5) lines.push({ tone: "flat", text: tr(`El ${pc((ph[1] / cur.errors) * 100)} de tus errores graves fue en ${ph[0] === "medio" ? "el medio juego" : ph[0] === "final" ? "el final" : "la apertura"}.`, `${pc((ph[1] / cur.errors) * 100)} of your serious mistakes came in the ${PHASE_LABEL[ph[0]].toLowerCase()}.`) });
  }
  if (cur.pressure != null) lines.push({ tone: prev.pressure != null ? (cur.pressure <= prev.pressure - 0.1 ? "up" : cur.pressure >= prev.pressure + 0.1 ? "down" : "flat") : "flat", text: tr(
    `Con apuro de tiempo: ${pc(cur.pressure * 100)} de tus errores${prev.pressure != null ? ` (${prevName}: ${pc(prev.pressure * 100)})` : ""}.`,
    `In time trouble: ${pc(cur.pressure * 100)} of your mistakes${prev.pressure != null ? ` (${prevName}: ${pc(prev.pressure * 100)})` : ""}.`) });
  lines.push({ tone: cur.exercises > prev.exercises ? "up" : cur.exercises < prev.exercises ? "down" : "flat", text: cur.exercises
    ? tr(`Entrenamiento: ${cur.exercises} ${cur.exercises === 1 ? "ejercicio" : "ejercicios"} en ${cur.days} ${cur.days === 1 ? "día" : "días"}${prev.exercises ? ` (${prevName}: ${prev.exercises})` : ""}.`, `Training: ${cur.exercises} ${cur.exercises === 1 ? "exercise" : "exercises"} on ${cur.days} ${cur.days === 1 ? "day" : "days"}${prev.exercises ? ` (${prevName}: ${prev.exercises})` : ""}.`)
    : tr(`No hiciste ejercicios en ${name}${prev.exercises ? ` (${prevName}: ${prev.exercises})` : ""}.`, `You did no exercises this ${range}${prev.exercises ? ` (${prevName}: ${prev.exercises})` : ""}.`) });

  const byAcc = [...cur.games].sort((x, y) => y.st.acc - x.st.acc);
  const pick = (x) => (x ? { id: x.e.id, acc: x.st.acc, label: `${x.e.white} – ${x.e.black}`, date: x.date, score: x.score } : null);
  return { range, cur, prev, lines, focus, best: byAcc.length >= 2 ? pick(byAcc[0]) : null, worst: byAcc.length >= 2 ? pick(byAcc[byAcc.length - 1]) : null };
}
void detectUserColor; void gameOf; void EN;
