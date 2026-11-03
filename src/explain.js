// Explicaciones automáticas (sin IA) a partir del análisis de Stockfish. En castellano o en inglés.
import { Chess, tryMove, pvToSan, numberedLine, materialDiff, VALUES, evalText, toCp, moveLabel } from "./chess-util.js";
import { EN, tr, pieceArt, pieceOn, pieceName, joinList } from "./i18n.js";

export const TIPS = {
  hanging: tr("Antes de soltar la pieza, revisá qué queda sin defensa y qué puede capturar tu rival.", "Before letting go of the piece, check what is left undefended and what your opponent can capture."),
  checks: tr("En cada jugada, mirá primero los jaques y las capturas que tiene tu rival.", "On every move, look first at your opponent's checks and captures."),
  forcing: tr("Buscá siempre jugadas forzantes: jaques, capturas y amenazas, en ese orden.", "Always look for forcing moves: checks, captures and threats, in that order."),
  punish: tr("Cuando tu rival juega algo raro, preguntate qué dejó desprotegido.", "When your opponent plays something odd, ask yourself what they left unprotected."),
  opening: tr("En la apertura: desarrollá caballos y alfiles, controlá el centro y enrocá pronto.", "In the opening: develop knights and bishops, control the center and castle early."),
  positional: tr("Si no hay táctica a la vista, buscá mejorar tu pieza más pasiva.", "If there is no tactic in sight, improve your most passive piece."),
  stalemate: tr("Cuando vas ganando, fijate que tu rival siempre tenga alguna jugada legal.", "When you are winning, make sure your opponent always has a legal move."),
  good: tr("Seguí así: antes de jugar, compará al menos dos candidatas.", "Keep it up: before moving, compare at least two candidate moves.")
};

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function pawnsText(n) {
  const r = Math.round(n);
  if (r <= 1) return tr("un peón", "a pawn");
  if (r === 2) return tr("dos peones", "two pawns");
  if (r === 3) return tr("una pieza (3 puntos)", "a piece (3 points)");
  if (r === 4) return tr("una pieza y un peón", "a piece and a pawn");
  if (r === 5) return tr("una torre (5 puntos)", "a rook (5 points)");
  if (r >= 9 && r <= 10) return tr("la dama", "the queen");
  return tr(`${r} puntos de material`, `${r} points of material`);
}

/** Material "asentado": valor tras la última jugada que no sigue con una captura. */
export function settledMaterial(fen, line, sign, maxPly = 8) {
  const c = new Chess(fen);
  const start = materialDiff(c) * sign;
  const seq = [];
  for (const u of (line || []).slice(0, 12)) {
    const m = tryMove(c, u); if (!m) break;
    seq.push({ m, mat: materialDiff(c) * sign });
  }
  let settled = start, idx = -1;
  for (let j = 0; j < Math.min(seq.length, maxPly); j++) {
    const next = seq[j + 1];
    if (!next || !(next.m.captured || next.m.promotion)) { settled = seq[j].mat; idx = j; }
  }
  return { start, settled, delta: settled - start, seq, idx };
}

const COUNT_NAMES = EN
  ? { p: ["a pawn", "two pawns", "three pawns"], n: ["a knight", "both knights"], b: ["a bishop", "both bishops"], r: ["a rook", "both rooks"], q: ["the queen", "two queens"] }
  : { p: ["un peón", "dos peones", "tres peones"], n: ["un caballo", "los dos caballos"], b: ["un alfil", "los dos alfiles"], r: ["una torre", "las dos torres"], q: ["la dama", "dos damas"] };
/** Qué entrega y qué gana el bando que mueve, a lo largo de la línea hasta el punto asentado. */
function materialStory(mat, moverColor) {
  const lost = {}, won = {};
  for (let j = 0; j <= mat.idx; j++) {
    const m = mat.seq[j].m;
    if (m.captured) { const bag = m.color === moverColor ? won : lost; bag[m.captured] = (bag[m.captured] || 0) + 1; }
    if (m.promotion) { const bag = m.color === moverColor ? won : lost; bag[m.promotion] = (bag[m.promotion] || 0) + 1; bag.p = (bag.p || 0) - 1; }
  }
  for (const t of Object.keys(VALUES)) { const x = Math.min(lost[t] || 0, won[t] || 0); if (x > 0) { lost[t] -= x; won[t] -= x; } }
  const phrase = (bag) => joinList(["q", "r", "b", "n", "p"].filter((t) => (bag[t] || 0) > 0).map((t) => (COUNT_NAMES[t][bag[t] - 1] || `${bag[t]} ${pieceName(t)}s`)));
  return { lost: phrase(lost), won: phrase(won) };
}
function lossSentence(mat, moverColor, fallbackPoints) {
  const st = materialStory(mat, moverColor);
  if (st.lost && st.won) return tr(`entregás ${st.lost} a cambio de ${st.won}`, `you give up ${st.lost} for ${st.won}`);
  return tr(`perdés ${st.lost || pawnsText(fallbackPoints)}`, `you lose ${st.lost || pawnsText(fallbackPoints)}`);
}
/** present: "ganás" (lo hiciste) en vez de "ganabas" (lo que se podía). */
function gainSentence(mat, moverColor, fallbackPoints, present = false) {
  const st = materialStory(mat, moverColor);
  const what = st.won && st.lost ? tr(`${st.won} a cambio de ${st.lost}`, `${st.won} for ${st.lost}`) : st.won || pawnsText(fallbackPoints);
  return present ? tr(`ganás ${what}`, `you win ${what}`) : tr(`ganabas ${what}`, `you would have won ${what}`);
}

/** Clavada absoluta: la pieza en `sq` ataca una pieza que no puede moverse sin dejar al rey en jaque. */
export function pinOf(fen, sq, byColor) {
  const c = new Chess(fen); const a = c.get(sq); if (!a || !["b", "r", "q"].includes(a.type)) return null;
  const victimColor = byColor === "w" ? "b" : "w";
  let kingSq = null;
  for (const row of c.board()) for (const p of row) if (p && p.type === "k" && p.color === victimColor) kingSq = p.square;
  if (!kingSq) return null;
  for (const t of attackedTargets(fen, sq, byColor)) {
    if (t.type === "k") continue;
    const c2 = new Chess(fen);
    try { c2.remove(t.square); if (c2.attackers(kingSq, byColor).includes(sq)) return t; } catch (e) {}
  }
  return null;
}

/** Piezas valiosas del rival atacadas por la pieza en `sq` (en la posición `fen`). */
export function attackedTargets(fen, sq, byColor) {
  const c = new Chess(fen);
  const attacker = c.get(sq); if (!attacker) return [];
  const out = [];
  for (const row of c.board()) for (const p of row) {
    if (!p || p.color === byColor) continue;
    if (p.type !== "k" && VALUES[p.type] < 3) continue;
    let ats = [];
    try { ats = c.attackers(p.square, byColor); } catch (e) { ats = []; }
    if (ats.includes(sq)) {
      let defended = true;
      try { defended = p.type === "k" || c.attackers(p.square, p.color).length > 0; } catch (e) {}
      out.push({ type: p.type, square: p.square, value: p.type === "k" ? 100 : VALUES[p.type], defended });
    }
  }
  return out;
}
export function isFork(fen, sq, byColor) {
  const c = new Chess(fen); const a = c.get(sq); if (!a) return null;
  const t = attackedTargets(fen, sq, byColor);
  const worthy = t.filter((x) => x.type === "k" || x.value > VALUES[a.type] || !x.defended);
  return t.length >= 2 && worthy.length >= 1 ? t : null;
}
/** "al rey y a la dama de e5" / "the king and the queen on e5" (objeto de "ataca"). */
export const listTargets = (t) => joinList(t.map((x) => {
  if (EN) return x.type === "k" ? "the king" : pieceOn(x.type, x.square);
  return x.type === "k" ? "al rey" : pieceOn(x.type, x.square).replace(/^el /, "al ").replace(/^la /, "a la ");
}));

function describeIdea(fen, bestUci, ply, played) {
  const c = new Chess(fen); const bm = tryMove(c, bestUci);
  if (!bm) return "";
  const playedDevelops = played && (played.piece === "n" || played.piece === "b") && played.from[1] === (played.color === "w" ? "1" : "8");
  if (bm.flags.includes("k") || bm.flags.includes("q")) return tr(`El motor prefería enrocar (${bm.san}) para poner el rey a salvo y conectar las torres.`, `The engine preferred castling (${bm.san}) to get the king to safety and connect the rooks.`);
  if (bm.san.includes("+")) return tr(`${bm.san} da jaque y te hace ganar tiempo.`, `${bm.san} gives check and gains time.`);
  if (bm.captured) return tr(`${bm.san} captura ${pieceOn(bm.captured, bm.to)}.`, `${bm.san} captures ${pieceOn(bm.captured, bm.to)}.`);
  const backRank = bm.color === "w" ? "1" : "8";
  if ((bm.piece === "n" || bm.piece === "b") && bm.from[1] === backRank && ply < 30 && !playedDevelops) return tr(`${bm.san} desarrolla ${pieceArt(bm.piece)}, que todavía no había salido.`, `${bm.san} develops ${pieceArt(bm.piece)}, which hadn't moved yet.`);
  if (bm.piece === "p" && "de".includes(bm.to[0]) && ply < 30) return tr(`${bm.san} gana espacio en el centro.`, `${bm.san} gains space in the center.`);
  const fork = isFork(c.fen(), bm.to, bm.color);
  if (fork) return tr(`${bm.san} ataca ${listTargets(fork)} a la vez.`, `${bm.san} attacks ${listTargets(fork)} at the same time.`);
  const pin = pinOf(c.fen(), bm.to, bm.color);
  if (pin) return tr(`${bm.san} clava ${pieceOn(pin.type, pin.square)} contra el rey.`, `${bm.san} pins ${pieceOn(pin.type, pin.square)} to the king.`);
  return tr(`El motor prefería ${bm.san}.`, `The engine preferred ${bm.san}.`);
}

export function pitfalls(game, k) {
  const m = game.moves[k]; const fen = game.fens[k]; const out = [];
  const rights = fen.split(" ")[2] || "-";
  const myRights = m.color === "w" ? /[KQ]/.test(rights) : /[kq]/.test(rights);
  if (m.piece === "q" && k < 14 && !m.captured) out.push({ t: tr("Sacar la dama tan temprano suele costar tiempo: tu rival la ataca mientras desarrolla sus piezas.", "Bringing the queen out this early usually costs time: your opponent attacks it while developing their pieces."), tip: "opening" });
  if (m.piece === "k" && !m.flags.includes("k") && !m.flags.includes("q") && myRights) out.push({ t: tr("Al mover el rey perdés el derecho a enrocar.", "Moving the king gives up the right to castle."), tip: "opening", k: "king" });
  if (k >= 2 && k < 20) {
    const prev = game.moves[k - 2];
    if (prev && prev.to === m.from && m.piece !== "p" && !m.captured) out.push({ t: tr("Mover la misma pieza dos veces en la apertura retrasa tu desarrollo.", "Moving the same piece twice in the opening delays your development."), tip: "opening" });
  }
  if (m.piece === "p") {
    const c = new Chess(fen); let kingSq = null;
    for (const row of c.board()) for (const p of row) if (p && p.type === "k" && p.color === m.color) kingSq = p.square;
    if (kingSq) {
      const kingSide = "gh".includes(kingSq[0]), queenSide = "abc".includes(kingSq[0]);
      if ((kingSide && "fgh".includes(m.from[0])) || (queenSide && "abc".includes(m.from[0])))
        out.push({ t: tr("Mover los peones que protegen a tu rey enrocado debilita su refugio.", "Moving the pawns in front of your castled king weakens its shelter."), tip: "positional", k: "king" });
    }
  }
  return out;
}

/** Pasa una explicación escrita para "vos" a tercera persona (jugadas del rival). */
const THIRD_ES = [
  [/\bTu rival\b/g, "El rival"], [/\btu rival\b/g, "el rival"], [/\bTu jugada\b/g, "Su jugada"], [/\btu rey\b/g, "su rey"],
  [/\btu posición\b/g, "su posición"], [/\btu desarrollo\b/g, "el desarrollo"], [/\bPerdés\b/g, "Pierde"], [/\bperdés\b/g, "pierde"],
  [/\bentregás\b/g, "entrega"], [/\bganabas\b/g, "ganaba"], [/\bganás\b/g, "gana"], [/\bCapturás\b/g, "Captura"], [/\bcapturás\b/g, "captura"],
  [/\bPermitís\b/g, "Permite"], [/\bAprovechás\b/g, "Aprovecha"], [/\batacás\b/g, "ataca"], [/\bTenías\b/g, "Tenía"], [/\bevitabas\b/g, "evitaba"],
  [/\bseguías\b/g, "seguía"], [/\bibas\b/g, "iba"], [/\bperdías\b/g, "perdía"], [/\bjugaste\b/g, "jugó"], [/\bte sale\b/g, "le sale"],
  [/\bte hace ganar\b/g, "le hace ganar"], [/\bSe te pasó/g, "Se le pasó"], [/\bde el rival\b/g, "del rival"], [/\ba el rival\b/g, "al rival"]
];
// En inglés alcanza con cambiar los pronombres (los textos evitan "you" como objeto).
const THIRD_EN = [[/\bto you\b/g, "to them"], [/\bYou\b/g, "They"], [/\byou\b/g, "they"], [/\bYour\b/g, "Their"], [/\byour\b/g, "their"]];
function toThird(t) { let s = t; for (const [re, rep] of EN ? THIRD_EN : THIRD_ES) s = s.replace(re, rep); return s; }

/**
 * Devuelve { headline, paragraphs[], tip, lineLabel, line }.
 */
export function explainMove(game, an, k, userColor = null) {
  const r = explainInner(game, an, k);
  if (r && userColor && game.moves[k] && game.moves[k].color !== userColor) {
    r.headline = toThird(r.headline); r.paragraphs = r.paragraphs.map(toThird); r.tip = null;
  }
  if (!r || !r.line) return r;
  const fen = game.fens[k], fenA = game.fens[k + 1], B = an.evals[k], A = an.evals[k + 1];
  const replyLine = A.pv && A.pv.length ? numberedLine(fenA, pvToSan(fenA, A.pv, 6)) : "";
  const bestLine = B.pv && B.pv.length ? numberedLine(fen, pvToSan(fen, B.pv, 7)) : "";
  r.which = r.line === replyLine ? "reply" : r.line === bestLine ? "best" : "played";
  return r;
}

function explainInner(game, an, k) {
  const m = game.moves[k], x = an.info[k], B = an.evals[k], A = an.evals[k + 1];
  if (!m || !x || !B || !A) return null;
  const fen = game.fens[k], fenA = game.fens[k + 1];
  const sign = m.color === "w" ? 1 : -1;
  const opp = m.color === "w" ? "b" : "w";
  const bestUci = B.best;
  const bestSan = bestUci ? pvToSan(fen, [bestUci], 1)[0] : null;
  const bestLine = B.pv && B.pv.length ? numberedLine(fen, pvToSan(fen, B.pv, 7)) : "";
  const replyLine = A.pv && A.pv.length ? numberedLine(fenA, pvToSan(fenA, A.pv, 6)) : "";
  const playedLine = numberedLine(fen, pvToSan(fen, [m.uci, ...(A.pv || [])], 7));
  const mateA = A.mate != null ? A.mate * sign : null;
  const mateB = B.mate != null ? B.mate * sign : null;
  const prev = k > 0 ? an.info[k - 1] : null;
  const prevBad = prev && (prev.c === "mistake" || prev.c === "blunder");
  const prevSan = k > 0 ? game.moves[k - 1].san : "";
  const isBest = x.c === "best";
  const isGood = ["best", "excellent", "good"].includes(x.c);
  const P = []; let tip = null; let headline = "";
  const L_ENGINE = tr("Línea del motor", "Engine line");
  let lineLabel = isBest ? tr("Continuación", "Continuation") : L_ENGINE, line = isBest ? playedLine : bestLine;

  // 1) La jugada termina la partida
  if (A.done != null) {
    if (A.done * sign > 0) return { headline: tr("Jaque mate", "Checkmate"), paragraphs: [tr(`¡${m.san} es mate! Partida terminada.`, `${m.san} is mate! Game over.`)], tip: null, lineLabel: "", line: "" };
    if (toCp(B) * sign > 250) return { headline: tr("Tablas por ahogado", "Stalemate"), paragraphs: [tr(`Con ${m.san} tu rival queda sin jugadas legales y la partida termina en tablas, aunque ibas ganando.`, `After ${m.san} your opponent has no legal moves and the game is a draw, even though you were winning.`), bestSan ? tr(`Con ${bestSan} seguías con ventaja.`, `With ${bestSan} you would have kept the advantage.`) : ""].filter(Boolean), tip: TIPS.stalemate, lineLabel: L_ENGINE, line: bestLine };
    return { headline: tr("Tablas", "Draw"), paragraphs: [tr("La partida termina en tablas.", "The game ends in a draw.")], tip: null, lineLabel: "", line: "" };
  }

  const matP = settledMaterial(fen, [m.uci, ...(A.pv || [])], sign);
  const matB = settledMaterial(fen, B.pv || [], sign);
  const dP = matP.delta, dB = matB.delta;

  // 2) Permite mate
  if (mateA != null && mateA < 0) {
    if (mateB != null && mateB < 0) {
      headline = tr("Mate inevitable", "Unavoidable mate");
      const faster = -mateA < -mateB;
      P.push(tr(`Ya no había defensa contra el mate.${faster ? " Esta jugada lo acelera un poco" + (bestSan ? `; ${bestSan} resistía más.` : ".") : ""}`,
        `There was no defense against mate anymore.${faster ? " This move speeds it up a little" + (bestSan ? `; ${bestSan} held out longer.` : ".") : ""}`));
    } else {
      headline = tr("Permite mate", "Allows mate");
      P.push(tr(`Después de ${m.san}, tu rival tiene mate en ${-mateA}: ${replyLine}.`, `After ${m.san}, your opponent has mate in ${-mateA}: ${replyLine}.`));
      if (bestSan) P.push(tr(`Con ${bestSan} evitabas el mate.`, `With ${bestSan} you would have avoided mate.`));
      tip = TIPS.checks;
    }
    lineLabel = tr("Mate del rival", "Opponent's mate"); line = replyLine;
    return { headline, paragraphs: P, tip, lineLabel, line };
  }
  // 3) Mate que se escapó
  if (mateB != null && mateB > 0 && !(mateA != null && mateA > 0)) {
    return { headline: tr("Se te pasó un mate", "You missed a mate"), paragraphs: [tr(`Tenías mate en ${mateB} empezando con ${bestSan}.`, `You had mate in ${mateB} starting with ${bestSan}.`), prevBad ? tr(`Tu rival acababa de equivocarse con ${prevSan} y lo dejaba servido.`, `Your opponent had just blundered with ${prevSan} and handed it to you.`) : ""].filter(Boolean), tip: TIPS.forcing, lineLabel: tr("El mate", "The mate"), line: bestLine };
  }
  // 4) Mate forzado propio
  if (mateA != null && mateA > 0) {
    if (mateB != null && mateB > 0 && mateA > mateB && !isBest)
      return { headline: tr("Había un mate más rápido", "There was a faster mate"), paragraphs: [tr(`${m.san} mantiene el mate (en ${mateA}), pero ${bestSan} lo daba en ${mateB}.`, `${m.san} keeps the mate (in ${mateA}), but ${bestSan} mated in ${mateB}.`)], tip: TIPS.forcing, lineLabel: tr("Mate más rápido", "Faster mate"), line: bestLine };
    return { headline: tr("Mate forzado", "Forced mate"), paragraphs: [tr(`${m.san} lleva a mate en ${mateA}. Tu rival ya no tiene defensa.`, `${m.san} leads to mate in ${mateA}. Your opponent has no defense left.`)], tip: null, lineLabel: tr("El mate", "The mate"), line: playedLine };
  }

  // 5) Pierde material
  if (!isGood && dP <= -1.5 && dB - dP >= 1.5) {
    headline = x.c === "blunder" ? tr("Pierde material", "Loses material") : tr("Cede material", "Gives up material");
    const c = new Chess(fenA); const rm = A.pv && A.pv[0] ? tryMove(c, A.pv[0]) : null;
    const pin = rm ? pinOf(c.fen(), rm.to, opp) : null;
    if (dB <= -1.5) {
      headline = tr("Pierde más material del necesario", "Loses more material than necessary");
      P.push(tr(`Ya ibas a perder material, pero ${bestSan} lo limitaba: así ${lossSentence(matB, m.color, -dB)}; con ${m.san} ${lossSentence(matP, m.color, -dP)}.`,
        `You were going to lose material anyway, but ${bestSan} limited it: that way ${lossSentence(matB, m.color, -dB)}; with ${m.san} ${lossSentence(matP, m.color, -dP)}.`));
      return { headline, paragraphs: P, tip: TIPS.hanging, lineLabel: L_ENGINE, line: bestLine };
    }
    if (pin) {
      P.push(tr(`Permitís ${rm.san}, que clava ${pieceOn(pin.type, pin.square)} contra tu rey: no puede moverse sin dejar al rey en jaque.`,
        `You allow ${rm.san}, which pins ${pieceOn(pin.type, pin.square)} to your king: it can't move without exposing the king to check.`));
    } else if (rm && rm.captured) {
      if (rm.to === m.to && m.captured) P.push(tr(`Capturás ${pieceOn(m.captured, m.to)}, pero tu rival recaptura con ${rm.san} y el cambio te sale caro.`, `You capture ${pieceOn(m.captured, m.to)}, but your opponent recaptures with ${rm.san} and the trade costs material.`));
      else if (rm.to === m.to) P.push(tr(`${cap(pieceArt(m.promotion || m.piece))} que jugaste a ${m.to} queda mal defendido: tu rival responde ${rm.san}.`, `${cap(pieceArt(m.promotion || m.piece))} you moved to ${m.to} is poorly defended: your opponent replies ${rm.san}.`));
      else P.push(tr(`Tu jugada deja ${pieceOn(rm.captured, rm.to)} sin defensa suficiente: tu rival juega ${rm.san}.`, `Your move leaves ${pieceOn(rm.captured, rm.to)} without enough defense: your opponent plays ${rm.san}.`));
    } else if (rm) {
      const fork = isFork(c.fen(), rm.to, opp);
      if (fork) P.push(tr(`Permitís ${rm.san}, una horquilla que ataca ${listTargets(fork)} a la vez.`, `You allow ${rm.san}, a fork that attacks ${listTargets(fork)} at the same time.`));
      else if (rm.san.includes("+")) P.push(tr(`Permitís ${rm.san}, un jaque que termina ganando material.`, `You allow ${rm.san}, a check that ends up winning material.`));
      else P.push(tr(`Tu rival responde ${rm.san} y termina ganando material.`, `Your opponent replies ${rm.san} and ends up winning material.`));
    }
    const tail = bestSan ? (dB > 0.5 ? tr(` Con ${bestSan} incluso ganabas material.`, ` With ${bestSan} you would even have won material.`) : tr(` Con ${bestSan} no perdías nada.`, ` With ${bestSan} you would have lost nothing.`)) : "";
    P.push(tr(`En total ${lossSentence(matP, m.color, -dP)}.`, `In total ${lossSentence(matP, m.color, -dP)}.`) + tail);
    tip = TIPS.hanging; lineLabel = tr("Respuesta del rival", "Opponent's reply"); line = replyLine;
    return { headline, paragraphs: P, tip, lineLabel, line, alt: bestLine ? { label: tr("Lo mejor era", "Best was"), line: bestLine } : null };
  }

  // 6) Se escapó ganar material
  if (!isGood && dB - dP >= 1.5 && dB >= 1.5) {
    headline = tr("Se te pasó ganar material", "You missed winning material");
    if (prevBad) P.push(tr(`Tu rival acababa de equivocarse con ${prevSan}.`, `Your opponent had just made a mistake with ${prevSan}.`));
    const c = new Chess(fen); const before = new Chess(fen); const bm = tryMove(c, bestUci);
    if (bm) {
      let undefended = false;
      if (bm.captured) { try { undefended = before.attackers(bm.to, opp).length === 0; } catch (e) {} }
      const fork = isFork(c.fen(), bm.to, m.color);
      const pn = pinOf(c.fen(), bm.to, m.color);
      if (bm.captured && undefended) P.push(tr(`${bm.san} capturaba ${pieceOn(bm.captured, bm.to)}, que estaba sin defensa.`, `${bm.san} captured ${pieceOn(bm.captured, bm.to)}, which was undefended.`));
      else if (fork) P.push(tr(`${bm.san} era una horquilla: atacaba ${listTargets(fork)} a la vez.`, `${bm.san} was a fork: it attacked ${listTargets(fork)} at the same time.`));
      else if (bm.san.includes("+")) P.push(tr(`${bm.san} era un jaque que ganaba material.`, `${bm.san} was a check that won material.`));
      else if (pn) P.push(tr(`${bm.san} clavaba ${pieceOn(pn.type, pn.square)} contra el rey y ${gainSentence(matB, m.color, dB)}.`, `${bm.san} pinned ${pieceOn(pn.type, pn.square)} to the king and ${gainSentence(matB, m.color, dB)}.`));
      else P.push(tr(`Con ${bm.san} ${gainSentence(matB, m.color, dB)}.`, `With ${bm.san} ${gainSentence(matB, m.color, dB)}.`));
    }
    return { headline, paragraphs: P, tip: prevBad ? TIPS.punish : TIPS.forcing, lineLabel, line };
  }

  // 7) Buenas jugadas
  if (isGood) {
    const c = new Chess(fen); const pm = tryMove(c, m.uci);
    if (isBest) {
      headline = tr("La mejor jugada", "The best move");
      const fork = pm ? isFork(c.fen(), pm.to, m.color) : null;
      if (prevBad && dP >= 1.5) P.push(tr(`Aprovechás el error de tu rival (${prevSan}): ${gainSentence(matP, m.color, dP, true)}.`, `You take advantage of your opponent's mistake (${prevSan}): ${gainSentence(matP, m.color, dP, true)}.`));
      else if (fork) P.push(tr(`Es una horquilla: atacás ${listTargets(fork)} a la vez.`, `It's a fork: you attack ${listTargets(fork)} at the same time.`));
      else if (m.flags.includes("k") || m.flags.includes("q")) P.push(tr("Enrocar pone tu rey a salvo y conecta las torres.", "Castling gets your king to safety and connects the rooks."));
      else if (m.captured) P.push(tr(`Capturás ${pieceArt(m.captured)} y el motor confirma que es lo mejor.`, `You capture ${pieceArt(m.captured)} and the engine confirms it's best.`));
      else if (m.san.includes("+")) P.push(tr("Un jaque que el motor considera lo mejor de la posición.", "A check the engine considers the best move in the position."));
      else P.push(tr("Coincide con la primera opción de Stockfish.", "It matches Stockfish's first choice."));
    } else if (x.c === "excellent") {
      headline = tr("Excelente", "Excellent");
      P.push(tr(`Muy buena jugada; la diferencia con la mejor (${bestSan}) es mínima.`, `Very good move; the difference from the best one (${bestSan}) is tiny.`));
      lineLabel = tr("Opción del motor", "Engine's choice");
    } else {
      headline = tr("Buena jugada", "Good move");
      P.push(tr(`Jugada correcta; ${bestSan} era un poco más precisa.`, `A sound move; ${bestSan} was a bit more accurate.`));
      lineLabel = tr("Opción del motor", "Engine's choice");
    }
    return { headline, paragraphs: P, tip: null, lineLabel, line };
  }

  // 8) Imprecisiones y errores posicionales
  headline = x.c === "inacc" ? tr("Imprecisión", "Inaccuracy") : x.c === "mistake" ? tr("Error", "Mistake") : tr("Error grave", "Serious mistake");
  const moverB = toCp(B) * sign, moverA = toCp(A) * sign;
  if (moverA < moverB) P.push(tr(`No perdés material de inmediato, pero tu posición empeora (${evalText(B)} → ${evalText(A)}).`, `You don't lose material right away, but your position gets worse (${evalText(B)} → ${evalText(A)}).`));
  if (prevBad && bestSan) P.push(tr(`Tu rival acababa de equivocarse con ${prevSan}; ${bestSan} lo aprovechaba mejor.`, `Your opponent had just made a mistake with ${prevSan}; ${bestSan} took better advantage of it.`));
  const idea = bestUci ? describeIdea(fen, bestUci, k, m) : "";
  if (idea) P.push(idea);
  const pits = pitfalls(game, k);
  for (const p of pits.slice(0, 1)) P.push(p.t);
  tip = pits.length ? TIPS[pits[0].tip] : prevBad ? TIPS.punish : k < 20 ? TIPS.opening : TIPS.positional;
  return { headline, paragraphs: P, tip, lineLabel, line };
}

/** Texto plano con todos los datos, para pasarle a la IA. */
export function aiContext(game, an, k, userColor) {
  const m = game.moves[k], x = an.info[k], B = an.evals[k], A = an.evals[k + 1];
  const fen = game.fens[k], fenA = game.fens[k + 1];
  const bestSan = B.best ? pvToSan(fen, [B.best], 1)[0] : tr("la jugada hecha", "the move played");
  const hist = numberedLine(game.fens[0], game.moves.slice(0, k + 1).map((mm) => mm.san));
  const side = m.color === "w" ? tr("Blancas", "White") : tr("Negras", "Black");
  return [
    tr(`Partida hasta esta jugada: ${hist}`, `Game up to this move: ${hist}`),
    tr(`Posición ANTES de la jugada (FEN): ${fen}`, `Position BEFORE the move (FEN): ${fen}`),
    tr(`Mueven: ${side}. Jugada hecha: ${moveLabel(fen, m.san, m.color)}`, `To move: ${side}. Move played: ${moveLabel(fen, m.san, m.color)}`),
    tr(`Clasificación del motor: ${x.c} (probabilidad de ganar perdida: ${x.loss.toFixed(0)} puntos sobre 100)`, `Engine classification: ${x.c} (winning chances lost: ${x.loss.toFixed(0)} points out of 100)`),
    tr(`Evaluación antes: ${evalText(B)} · después: ${evalText(A)} (positivo = ventaja de Blancas; # = mate)`, `Evaluation before: ${evalText(B)} · after: ${evalText(A)} (positive = White is better; # = mate)`),
    tr(`Mejor jugada según el motor: ${bestSan}. Línea: ${B.pv && B.pv.length ? numberedLine(fen, pvToSan(fen, B.pv, 8)) : "-"}`, `Engine's best move: ${bestSan}. Line: ${B.pv && B.pv.length ? numberedLine(fen, pvToSan(fen, B.pv, 8)) : "-"}`),
    tr(`Mejor continuación tras la jugada hecha: ${A.pv && A.pv.length ? numberedLine(fenA, pvToSan(fenA, A.pv, 6)) : "(la partida terminó)"}`, `Best continuation after the move played: ${A.pv && A.pv.length ? numberedLine(fenA, pvToSan(fenA, A.pv, 6)) : "(the game ended)"}`),
    userColor ? (userColor === m.color ? tr("Esta jugada la hizo la persona que consulta.", "This move was played by the person asking.") : tr("Esta jugada la hizo el rival de la persona que consulta.", "This move was played by the opponent of the person asking.")) : ""
  ].filter(Boolean).join("\n");
}
