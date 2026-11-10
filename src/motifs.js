// Clasifica cada error en un motivo concreto (lo que un entrenador anotaría al margen).
import { Chess, tryMove, VALUES, clockAt, phaseOf, pvToSan } from "./chess-util.js";
import { settledMaterial, isFork, pinOf, pitfalls } from "./explain.js";
import { tr, LANG } from "./i18n.js";

export const DIAG_VERSION = 3;

export const MOTIFS = {
  amenaza: {
    label: tr("No viste la amenaza del rival", "You missed your opponent's threat"), short: tr("Amenaza no vista", "Missed threat"), train: "threats",
    why: tr("Tu rival ya amenazaba algo con su jugada anterior y lo dejaste pasar.", "Your opponent's previous move already threatened something and you let it happen."),
    tip: tr("Antes de mover, preguntate siempre: ¿qué quiere hacer mi rival con lo que acaba de jugar?", "Before you move, always ask: what does my opponent want with the move they just played?")
  },
  mate_contra: {
    label: tr("Te dejaste mate", "You walked into mate"), short: tr("Mate permitido", "Allowed mate"), train: "threats",
    why: tr("Después de tu jugada, el rival tenía una secuencia de mate.", "After your move, your opponent had a mating sequence."),
    tip: tr("Revisá cada jaque posible de tu rival antes de soltar la pieza.", "Check every possible check your opponent has before letting go of the piece.")
  },
  colgada: {
    label: tr("Dejaste piezas sin defensa", "You left pieces hanging"), short: tr("Pieza colgada", "Hanging piece"), train: "errors",
    why: tr("La pieza que moviste, o una que quedó desprotegida, se podía capturar gratis.", "The piece you moved, or one you left unprotected, could be captured for free."),
    tip: tr("Antes de soltar la pieza, mirá qué queda sin defensa y qué puede capturar tu rival.", "Before letting go of the piece, look at what is left undefended and what your opponent can capture.")
  },
  tactica: {
    label: tr("Permitiste una táctica del rival", "You allowed a tactic"), short: tr("Táctica permitida", "Allowed tactic"), train: "puzzles", themes: ["fork", "pin", "skewer", "discoveredAttack", "doubleCheck"],
    why: tr("Tu jugada le dejó al rival una horquilla, una clavada o un ataque doble.", "Your move gave your opponent a fork, a pin or a double attack."),
    tip: tr("Ojo con las piezas alineadas con tu rey o tu dama, y con las casillas de horquilla de los caballos.", "Watch out for pieces lined up with your king or queen, and for knight fork squares.")
  },
  ganancia: {
    label: tr("Se te pasó ganar material", "You missed winning material"), short: tr("Ganancia no vista", "Missed win"), train: "puzzles", themes: ["hangingPiece", "fork", "pin", "skewer", "trappedPiece"],
    why: tr("Había una jugada que ganaba material y jugaste otra cosa.", "There was a move that won material and you played something else."),
    tip: tr("Mirá primero los jaques, las capturas y las amenazas: tuyas y del rival.", "Look at checks, captures and threats first: yours and your opponent's.")
  },
  mate_perdido: {
    label: tr("Se te pasaron mates", "You missed mates"), short: tr("Mate no visto", "Missed mate"), train: "puzzles", themes: ["mateIn1", "mateIn2", "mateIn3", "backRankMate"],
    why: tr("Tenías una secuencia de mate y no la encontraste.", "You had a mating sequence and didn't find it."),
    tip: tr("Cuando el rey rival está expuesto, buscá todos los jaques, aunque parezcan sacrificios.", "When the enemy king is exposed, look at every check, even if it looks like a sacrifice.")
  },
  rey: {
    label: tr("Debilitaste a tu rey", "You weakened your king"), short: tr("Rey expuesto", "Exposed king"), train: "errors",
    why: tr("Moviste el rey o los peones que lo protegían sin necesidad.", "You moved your king or the pawns protecting it without need."),
    tip: tr("Enrocá temprano y no muevas los peones delante de tu rey sin un motivo claro.", "Castle early and don't push the pawns in front of your king without a clear reason.")
  },
  apertura: {
    label: tr("Imprecisiones en la apertura", "Opening inaccuracies"), short: tr("Apertura", "Opening"), train: "openings",
    why: tr("Errores en las primeras jugadas: desarrollo lento, dama temprano, misma pieza dos veces.", "Mistakes in the first moves: slow development, early queen, moving the same piece twice."),
    tip: tr("Desarrollá caballos y alfiles, controlá el centro con peones y enrocá antes de atacar.", "Develop knights and bishops, control the center with pawns and castle before attacking.")
  },
  final: {
    label: tr("Técnica de finales", "Endgame technique"), short: tr("Finales", "Endgames"), train: "endgames",
    why: tr("Con poco material en el tablero, la jugada empeoró tu posición sin perder material.", "With little material left, the move made your position worse without losing material."),
    tip: tr("En el final el rey es una pieza más: activalo hacia el centro y hacia los peones.", "In the endgame the king is a fighting piece: bring it to the center and toward the pawns.")
  },
  posicional: {
    label: tr("Decisiones posicionales", "Positional decisions"), short: tr("Posicional", "Positional"), train: "errors",
    why: tr("Sin táctica de por medio, la jugada empeoró tu posición.", "With no tactic involved, the move made your position worse."),
    tip: tr("Si no hay táctica, mejorá tu pieza peor ubicada antes de lanzarte a atacar.", "If there's no tactic, improve your worst-placed piece before launching an attack.")
  }
};

/** Posición igual pero moviendo el rival (para ver qué amenazaba antes de tu jugada). */
export function nullMoveFen(fen) {
  const p = fen.split(" ");
  p[1] = p[1] === "w" ? "b" : "w";
  p[3] = "-";
  return p.join(" ");
}

/** ¿La jugada del rival `reply` ya era una amenaza seria antes de que movieras? */
export function threatExisted(fen, reply, moverColor) {
  if (!reply) return false;
  const c0 = new Chess(fen);
  if (c0.inCheck()) return false;
  let c;
  try { c = new Chess(nullMoveFen(fen)); } catch (e) { return false; }
  const before = new Chess(c.fen());
  const m = tryMove(c, reply);
  if (!m) return false;
  if (c.isCheckmate()) return true;
  if (m.captured) {
    const gain = VALUES[m.captured];
    let defended = false;
    try { defended = c.attackers(m.to, moverColor).length > 0; } catch (e) {}
    const net = defended ? gain - VALUES[m.piece] : gain;
    if (net >= 2) return true;
  }
  const opp = moverColor === "w" ? "b" : "w";
  const fork = isFork(c.fen(), m.to, opp);
  if (fork && fork.some((t) => t.type === "k" || t.value >= 5 || !t.defended)) return true;
  void before;
  return false;
}

function gainDetail(fen, uci, color) {
  const c = new Chess(fen); const before = new Chess(fen);
  const m = tryMove(c, uci); if (!m) return "";
  const opp = color === "w" ? "b" : "w";
  if (m.captured) {
    let defended = true;
    try { defended = before.attackers(m.to, opp).length > 0; } catch (e) {}
    if (!defended) return m.captured === "p" ? tr("peón gratis", "free pawn") : tr("pieza gratis", "free piece");
  }
  if (isFork(c.fen(), m.to, color)) return tr("horquilla", "fork");
  if (pinOf(c.fen(), m.to, color)) return tr("clavada", "pin");
  if (m.san.includes("+")) return tr("jaque que gana material", "check that wins material");
  return tr("combinación", "combination");
}

/**
 * Motivo de la jugada k. Devuelve { k, motif, detail, phase, clock, cls, threat }.
 * threat: jugada del rival (uci) que ya amenazaba antes de tu jugada, si la hay.
 */
export function classifyError(game, an, k) {
  const m = game.moves[k], B = an.evals[k], A = an.evals[k + 1], x = an.info[k];
  if (!m || !B || !A || !x) return null;
  const fen = game.fens[k], fenA = game.fens[k + 1];
  const sign = m.color === "w" ? 1 : -1, opp = m.color === "w" ? "b" : "w";
  const phase = phaseOf(fen, k);
  const clock = clockAt(game, k);
  const base = { k, cls: x.c, phase, clock: clock ? { pressure: clock.pressure, spent: clock.spent, before: clock.before } : null, loss: x.loss };
  const mateA = A.mate != null ? A.mate * sign : null;
  const mateB = B.mate != null ? B.mate * sign : null;
  const reply = A.pv && A.pv[0];

  if (A.done != null) return { ...base, motif: phase === "final" ? "final" : "posicional", detail: tr("tablas", "draw") };
  if (mateA != null && mateA < 0 && !(mateB != null && mateB < 0)) {
    const existed = threatExisted(fen, reply, m.color);
    return { ...base, motif: "mate_contra", detail: existed ? tr("la amenaza de mate ya estaba", "the mate threat was already there") : "", threat: existed ? reply : null };
  }
  if (mateB != null && mateB > 0 && !(mateA != null && mateA > 0)) {
    return { ...base, motif: "mate_perdido", detail: tr(`mate en ${mateB}`, `mate in ${mateB}`), best: B.best };
  }
  const matP = settledMaterial(fen, [m.uci, ...(A.pv || [])], sign);
  const matB = settledMaterial(fen, B.pv || [], sign);
  const dP = matP.delta, dB = matB.delta;
  // Umbral de un peón: a este nivel, regalar o dejar pasar un peón también es un patrón entrenable.
  if (dP <= -1 && dB - dP >= 1.5) {
    if (threatExisted(fen, reply, m.color)) return { ...base, motif: "amenaza", detail: pvToSan(nullMoveFen(fen), [reply], 1)[0] || "", threat: reply };
    const c = new Chess(fenA); const rm = reply ? tryMove(c, reply) : null;
    if (rm) {
      const fork = isFork(c.fen(), rm.to, opp), pin = pinOf(c.fen(), rm.to, opp);
      if (fork) return { ...base, motif: "tactica", detail: tr("horquilla", "fork") };
      if (pin) return { ...base, motif: "tactica", detail: tr("clavada", "pin") };
      if (rm.captured) return { ...base, motif: "colgada", detail: rm.captured === "p" ? tr("un peón sin defensa", "an undefended pawn") : rm.to === m.to ? tr("la pieza que moviste", "the piece you moved") : tr("otra pieza quedó sin defensa", "another piece was left undefended") };
      return { ...base, motif: "tactica", detail: rm.san.includes("+") ? tr("jaque", "check") : tr("ataque doble", "double attack") };
    }
    return { ...base, motif: "colgada", detail: "" };
  }
  if (dB >= 1 && dB - dP >= 1.5 && B.best) return { ...base, motif: "ganancia", detail: gainDetail(fen, B.best, m.color), best: B.best };
  const pits = pitfalls(game, k);
  const kingPit = pits.find((p) => p.k === "king");
  if (kingPit) return { ...base, motif: "rey", detail: "" };
  if (phase === "apertura") return { ...base, motif: "apertura", detail: pits[0] ? pits[0].t : "" };
  if (phase === "final") return { ...base, motif: "final", detail: "" };
  return { ...base, motif: "posicional", detail: "" };
}

/** Los errores propios de una partida, clasificados. Función pura: también la usa el hilo de trabajo (diag-worker.js). */
export function computeDiag(game, an, userColor) {
  const items = [];
  an.info.forEach((x, k) => {
    if (!x || !game.moves[k] || game.moves[k].color !== userColor) return;
    if (!["mistake", "blunder"].includes(x.c)) return;
    try { const r = classifyError(game, an, k); if (r) items.push(r); } catch (e) { /* posición rara: se ignora */ }
  });
  return { v: DIAG_VERSION, at: an.at, color: userColor, items };
}
const valid = (d, entry, uc) => !!d && d.v === DIAG_VERSION && d.at === entry.analysis.at && d.color === uc;
/** El diagnóstico guardado de una partida, o null si falta o quedó viejo. Se guarda uno por idioma (los detalles son texto),
 *  así cambiar de idioma no obliga a recalcular todo. */
export function cachedDiag(entry, userColor) {
  if (!entry.analysis || !userColor) return null;
  // Formato anterior a 2.1: un solo diagnóstico, con su idioma adentro.
  if (entry.diag) { const d = entry.diag; delete entry.diag; if (d && d.items) { entry.diags = entry.diags || {}; if (!entry.diags[d.lang || "es"]) entry.diags[d.lang || "es"] = d; } }
  const d = entry.diags && entry.diags[LANG];
  return valid(d, entry, userColor) ? d : null;
}
export function storeDiag(entry, d) { (entry.diags = entry.diags || {})[LANG] = d; return d; }
/** Diagnóstico de una partida (guardado en la entrada). Si falta, lo calcula en el momento. */
export function diagnoseEntry(entry, game, userColor) {
  if (!entry.analysis || !userColor) return null;
  return cachedDiag(entry, userColor) || storeDiag(entry, computeDiag(game, entry.analysis, userColor));
}
