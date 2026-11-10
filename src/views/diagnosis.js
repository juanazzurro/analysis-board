// Diagnóstico: tus errores repetidos, cuándo aparecen, cómo venís y con qué aperturas.
import { store, on, detectUserColor, enqueueAnalysis, progress, queueLength } from "../state.js";
import { computeInsights, SPEED_LABEL } from "../insights.js";
import { MOTIFS } from "../motifs.js";
import { PHASE_LABEL, moveLabel } from "../chess-util.js";
import { $, esc, fmtDate } from "../ui.js";
import { tr, EN, fmt1 } from "../i18n.js";
import { periodReport, rangeStart } from "../report.js";

let hooks = {};
let range = null; // "week" | "month" | "all"
export function initDiagnosis(h) {
  hooks = h;
  const root = $("dgBody");
  root.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    const a = t.dataset.act;
    if (a === "range") { range = t.dataset.range; render(); return; }
    if (a === "analyse") analyseMissing();
    else if (a === "train") train(t.dataset.motif);
    else if (a === "open") hooks.openGame(t.dataset.id, t.dataset.ply === "" ? undefined : +t.dataset.ply);
    else if (a === "goto") hooks.goView(t.dataset.view);
  });
  on("analysed", () => { if (!$("view-diagnosis").hidden) render(); });
  on("queue", () => { if (!$("view-diagnosis").hidden) renderQueue(); });
  on("progress", () => { if (!$("view-diagnosis").hidden) renderQueue(); });
}
export function showDiagnosis() { render(); }

export function analyseMissing() {
  const list = store.library.filter((g) => !g.analysis && detectUserColor(g)).sort((a, b) => (b.date || 0) - (a.date || 0));
  list.forEach((g) => enqueueAnalysis(g.id, false, "rapida"));
  hooks.toast(tr(`${list.length} ${list.length === 1 ? "partida" : "partidas"} en cola (modo rápido). Podés seguir usando la app.`,
    `${list.length} ${list.length === 1 ? "game" : "games"} queued (fast mode). You can keep using the app.`));
  render();
}
function train(motif) {
  const m = MOTIFS[motif]; if (!m) return;
  if (m.train === "threats") hooks.startThreats({});
  else if (m.train === "puzzles") hooks.startPuzzles({ theme: (m.themes || [])[0] });
  else if (m.train === "endgames") hooks.goView("endgames");
  else if (m.train === "openings") { const el = $("dgOpenings"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }
  else hooks.startErrors({ motif });
}
// Modo rápido: en una Mac con Apple Silicon son unos 3-4 segundos por partida.
export function minutesFor(n) { const min = Math.round((n * 4) / 60); return min < 60 ? `≈ ${Math.max(1, min)} min` : `≈ ${Math.floor(min / 60)} h ${min % 60 ? (min % 60) + " min" : ""}`.trim(); }
const pct = (x) => `${Math.round(x * 100)}%`;
const OTHER = tr("Otras", "Other");

function renderQueue() {
  const el = $("dgQueue"); if (!el) return;
  const q = queueLength();
  if (!q) { el.innerHTML = ""; return; }
  const p = progress.n ? Math.round((progress.i / progress.n) * 100) : 0;
  el.innerHTML = `<div class="progress"><div class="progress-track"><div class="progress-bar" style="width:${p}%"></div></div><span class="progress-txt">${tr(`Analizando: quedan ${q} ${q === 1 ? "partida" : "partidas"}`, `Analyzing: ${q} ${q === 1 ? "game" : "games"} left`)}</span></div>`;
}

const RANGE_LABEL = { week: tr("Últimos 7 días", "Last 7 days"), month: tr("Últimos 30 días", "Last 30 days"), all: tr("Todo", "All time") };
function rangeSeg() {
  return `<div class="seg" role="tablist" aria-label="${tr("Período", "Period")}">${["week", "month", "all"].map((r) => `<button class="seg-btn${range === r ? " on" : ""}" type="button" data-act="range" data-range="${r}">${RANGE_LABEL[r]}</button>`).join("")}</div>`;
}
/** Informe del período: qué pasó en la semana o el mes y cómo se compara con el período anterior. */
function periodHtml() {
  const rep = periodReport(range); if (!rep) return "";
  const mark = { up: "▲", down: "▼", flat: "•" };
  const title = range === "week" ? tr("Tu semana", "Your week") : tr("Tu mes", "Your month");
  let h = `<section class="dg-sec"><div class="card period-card"><div class="card-head"><h3>${title}</h3><span class="muted small">${range === "week" ? tr("comparada con los 7 días anteriores", "compared with the previous 7 days") : tr("comparado con los 30 días anteriores", "compared with the previous 30 days")}</span></div>`;
  h += `<ul class="rp-ctx">${rep.lines.map((l) => `<li class="${l.tone}"><i>${mark[l.tone]}</i><span>${esc(l.text)}</span></li>`).join("")}</ul>`;
  if (rep.best || rep.worst) {
    const g = (x, label) => (x ? `<button class="chip" type="button" data-act="open" data-id="${esc(x.id)}" data-ply="">${label}: <span class="nofig">${esc(x.label)}</span> (${Math.round(x.acc)}%)</button>` : "");
    h += `<div class="period-games">${g(rep.best, tr("Tu mejor partida", "Your best game"))}${rep.worst && rep.worst.id !== (rep.best && rep.best.id) ? g(rep.worst, tr("La más floja", "The weakest")) : ""}</div>`;
  }
  if (rep.focus) {
    const info = MOTIFS[rep.focus];
    h += `<div class="td-note"><span><b>${tr("Para trabajar ahora:", "To work on now:")}</b> ${esc(info.tip)}</span><button class="btn small primary" type="button" data-act="train" data-motif="${rep.focus}">${trainLabel(info.train)}</button></div>`;
  }
  return h + `</div></section>`;
}

function render() {
  const root = $("dgBody");
  if (!range) { const m = computeInsights(rangeStart("month")); range = m.games.length >= 5 ? "month" : "all"; }
  const ins = computeInsights(rangeStart(range));
  if (!ins.own) {
    root.innerHTML = `<div class="card empty-big"><h2>${tr("Todavía no hay partidas tuyas", "No games of yours yet")}</h2><p>${tr("Cargá tu usuario de Lichess o Chess.com y traé tus partidas. El diagnóstico se arma solo con lo que el motor encuentra en ellas.", "Enter your Lichess or Chess.com username and import your games. The diagnosis builds itself from what the engine finds in them.")}</p><div class="btn-row"><button class="btn primary" type="button" data-act="goto" data-view="library">${tr("Ir a Partidas", "Go to Games")}</button></div></div>`;
    return;
  }
  const n = ins.games.length, few = n && n < 8;
  let h = `<div class="dg-head">${rangeSeg()}<p class="sub">${range !== "all" && !ins.all.length ? "" : tr(
    `Basado en <b>${n}</b> ${n === 1 ? "partida analizada" : "partidas analizadas"} y <b>${ins.totalErrors}</b> errores importantes.${few ? " Con tan pocas partidas es orientativo: a partir de 10 se vuelve confiable." : ""}`,
    `Based on <b>${n}</b> analyzed ${n === 1 ? "game" : "games"} and <b>${ins.totalErrors}</b> significant mistakes.${few ? " With so few games it's only a rough guide: from 10 on it becomes reliable." : ""}`)}</p>`;
  if (ins.pendingAnalysis) {
    const p = ins.pendingAnalysis;
    h += `<div class="dg-pending"><span>${tr(`Te ${p === 1 ? "falta 1 partida" : `faltan ${p} partidas`} por analizar. Cuantas más, más preciso el diagnóstico.`, `${p} ${p === 1 ? "game" : "games"} still to analyze. The more games, the more accurate the diagnosis.`)}</span><button class="btn small primary" type="button" data-act="analyse">${tr("Analizar ahora", "Analyze now")} (${minutesFor(p)})</button></div>`;
  }
  h += `<div id="dgQueue"></div></div>`;
  if (range !== "all") h += periodHtml();
  if (range !== "all" && !ins.all.length) { root.innerHTML = h; renderQueue(); return; }

  if (!n) { root.innerHTML = h + `<div class="card empty-big"><h2>${tr("Falta analizar tus partidas", "Your games still need analyzing")}</h2><p>${tr("Apenas termine el análisis vas a ver acá tus puntos débiles. Mientras tanto, esto sale solo de tus resultados:", "As soon as the analysis finishes you'll see your weak spots here. Meanwhile, this comes from your results alone:")}</p></div>` + speedsHtml(ins) + openingsHtml(ins); renderQueue(); return; }

  // 1. Puntos débiles
  h += `<section class="dg-sec"><h2 class="sec-title">${tr("Tus puntos débiles", "Your weak spots")}</h2><div class="weak-grid">`;
  ins.top.forEach((m, i) => {
    const info = MOTIFS[m.motif];
    const ex = m.examples.slice(-3).reverse();
    const times = tr(`${m.n} ${m.n === 1 ? "vez" : "veces"}`, `${m.n} ${m.n === 1 ? "time" : "times"}`);
    h += `<article class="weak-card">
      <div class="weak-rank">${i + 1}</div>
      <div class="weak-body">
        <h3>${esc(info.label)}</h3>
        <div class="weak-num"><b>${pct(m.share)}</b><span>${tr("de tus errores", "of your mistakes")} · ${times}${m.blunders ? `, ${m.blunders} ${m.blunders === 1 ? "blunder" : "blunders"}` : ""}</span></div>
        <p>${esc(info.why)}</p>
        <p class="weak-tip"><b>${tr("Hábito:", "Habit:")}</b> ${esc(info.tip)}</p>
        <div class="weak-ex">${ex.map((it) => `<button class="chip" type="button" data-act="open" data-id="${esc(it.game.e.id)}" data-ply="${it.k + 1}">${esc(moveLabel(it.game.g.fens[it.k], it.game.g.moves[it.k].san, it.game.g.moves[it.k].color))} <small>${esc(fmtDate(it.game.date))}</small></button>`).join("")}</div>
        <button class="btn primary small" type="button" data-act="train" data-motif="${m.motif}">${trainLabel(info.train)}</button>
      </div></article>`;
  });
  h += `</div></section>`;

  // 2. Tipos y cuándo
  const maxN = Math.max(1, ...ins.ranked.map((m) => m.n));
  h += `<section class="dg-sec dg-two"><div class="card"><h3>${tr("Todos tus errores, por tipo", "All your mistakes, by type")}</h3><div class="bars">`
    + [...ins.ranked].sort((a, b) => b.n - a.n).map((m) => `<div class="bar-row"><span>${esc(MOTIFS[m.motif].short)}</span><i><b style="width:${(m.n / maxN) * 100}%"></b></i><em>${m.n}</em></div>`).join("")
    + `</div></div><div class="card"><h3>${tr("¿Cuándo te equivocás?", "When do you go wrong?")}</h3>`;
  const ph = ins.phases; const phT = Math.max(1, ph.apertura + ph.medio + ph.final);
  h += `<div class="stack">${["apertura", "medio", "final"].map((k) => ph[k] ? `<b class="st-${k}" style="flex:${ph[k]}" title="${PHASE_LABEL[k]}: ${ph[k]}"></b>` : "").join("")}</div>`
    + `<div class="stack-legend">${["apertura", "medio", "final"].map((k) => `<span><i class="st-${k}"></i>${PHASE_LABEL[k]} <b>${pct(ph[k] / phT)}</b></span>`).join("")}</div>`;
  if (ins.pressure.total >= 5) {
    const pp = ins.pressure.inPressure / ins.pressure.total;
    h += `<div class="clock-note"><b>${pct(pp)}</b><span>${tr(
      `de tus errores (con reloj registrado) fueron con apuro de tiempo.${pp >= 0.3 ? " Jugá más rápido en la apertura para llegar con tiempo al medio juego, o elegí ritmos más lentos." : " El reloj no parece ser tu problema principal."}`,
      `of your mistakes (with clock data) were made under time pressure.${pp >= 0.3 ? " Play the opening faster to reach the middlegame with time left, or choose slower time controls." : " The clock doesn't seem to be your main problem."}`)}</span></div>`;
    if (ins.pressure.fast >= 3) h += `<div class="clock-note"><b>${ins.pressure.fast}</b><span>${tr("errores fueron jugadas hechas en menos de 3 segundos sin estar apurado. Tomate un momento para revisar antes de mover.", "mistakes were moves made in under 3 seconds without time trouble. Take a moment to check before you move.")}</span></div>`;
  } else h += `<p class="small muted">${tr("Cuando importes partidas con reloj vas a ver acá cuántos errores fueron con apuro de tiempo.", "When you import games with clock data you'll see here how many mistakes came under time pressure.")}</p>`;
  h += `</div></section>`;

  // 3. Progreso
  h += `<section class="dg-sec"><h2 class="sec-title">${tr("Cómo venís", "How you're doing")}</h2>${range === "all" ? weeklyHtml(ins.weekly) : ""}<div class="dg-two">
    <div class="card"><h3>${tr("Precisión por partida", "Accuracy per game")}</h3>${accChart(ins.trend)}</div>
    <div class="card"><h3>${tr("Blunders por partida", "Blunders per game")} <small class="muted">${tr("últimas 30", "last 30")}</small></h3>${blunderChart(ins.trend)}</div></div></section>`;

  h += speedsHtml(ins) + openingsHtml(ins);

  root.innerHTML = h;
  renderQueue();
}
const speedName = (s) => esc((SPEED_LABEL[s] || "").toLowerCase());
function speedsHtml(ins) {
  const sp = Object.values(ins.speeds).sort((a, b) => b.games - a.games);
  if (!sp.length) return "";
  let h = `<section class="dg-sec"><h2 class="sec-title">${tr("Por ritmo de juego", "By time control")}</h2><div class="card"><table class="tbl"><thead><tr><th>${tr("Ritmo", "Time control")}</th><th>${tr("Partidas", "Games")}</th><th>${tr("Puntos", "Score")}</th><th>${tr("Precisión", "Accuracy")}</th><th>${tr("Blunders por partida", "Blunders per game")}</th></tr></thead><tbody>`
    + sp.map((s) => `<tr><td>${esc(SPEED_LABEL[s.speed] || tr("Otros", "Other"))}</td><td>${s.games}</td><td>${s.scored ? Math.round((s.score / s.scored) * 100) + "%" : "–"}</td><td>${s.accN ? Math.round(s.acc / s.accN) + "%" : "–"}</td><td>${s.accN ? fmt1(s.blunders / s.accN) : "–"}</td></tr>`).join("")
    + `</tbody></table>`;
  const bl = sp.filter((s) => s.accN >= 3).map((s) => ({ s: s.speed, b: s.blunders / s.accN }));
  if (bl.length >= 2) {
    bl.sort((a, b) => b.b - a.b);
    const hi = bl[0], lo = bl[bl.length - 1];
    if (hi.b > lo.b * 1.3) h += `<p class="small">${tr(
      `En <b>${speedName(hi.s)}</b> cometés ${fmt1(hi.b)} blunders por partida, contra ${fmt1(lo.b)} en ${speedName(lo.s)}. Para mejorar, priorizá las partidas más lentas: dan tiempo a revisar cada jugada.`,
      `In <b>${speedName(hi.s)}</b> you make ${fmt1(hi.b)} blunders per game, versus ${fmt1(lo.b)} in ${speedName(lo.s)}. To improve, favor slower games: they give you time to check every move.`)}</p>`;
  } else {
    const sc = sp.filter((s) => s.scored >= 5).map((s) => ({ s: s.speed, p: s.score / s.scored }));
    if (sc.length >= 2) {
      sc.sort((a, b) => b.p - a.p);
      const hi = sc[0], lo = sc[sc.length - 1];
      if (hi.p - lo.p >= 0.15) h += `<p class="small">${tr(`Sumás más puntos en <b>${speedName(hi.s)}</b> (${pct(hi.p)}) que en ${speedName(lo.s)} (${pct(lo.p)}).`, `You score more in <b>${speedName(hi.s)}</b> (${pct(hi.p)}) than in ${speedName(lo.s)} (${pct(lo.p)}).`)}</p>`;
    }
  }
  return h + `</div></section>`;
}
function openingsHtml(ins) {
  const worst = worstOpening(ins);
  let h = `<section class="dg-sec" id="dgOpenings"><h2 class="sec-title">${tr("Tus aperturas", "Your openings")}</h2><div class="dg-two">${openingTable(tr("Con blancas", "With White"), ins.openings.w)}${openingTable(tr("Con negras", "With Black"), ins.openings.b)}</div>`;
  if (worst) {
    const side = worst.color === "w" ? tr("blancas", "White") : tr("negras", "Black");
    h += `<div class="open-note"><span>${tr(
      `Donde más puntos dejás: <b>${esc(worst.name)}</b> con ${side} (${pct(worst.s)} en ${worst.games} partidas). Mirá cómo salió la última y fijate en qué jugada se torció.`,
      `Where you drop the most points: <b>${esc(worst.name)}</b> with ${side} (${pct(worst.s)} in ${worst.games} games). Look at the last one and find the move where it went wrong.`)}</span><button class="btn small" type="button" data-act="open" data-id="${esc(worst.lastId)}" data-ply="0">${tr("Ver la última", "See the last one")}</button></div>`;
  }
  return h + `<p class="small muted">${tr("A tu nivel no hace falta estudiar teoría profunda: alcanza con desarrollar las piezas, controlar el centro y enrocar. Mirá dónde perdés más puntos y repasá esas partidas.", "At your level there's no need for deep theory: develop your pieces, control the center and castle. Look at where you lose the most points and review those games.")}</p></section>`;
}
function worstOpening(ins) {
  const rows = [];
  for (const c of ["w", "b"]) for (const r of Object.values(ins.openings[c])) if (r.games >= 4 && r.name !== OTHER) rows.push({ ...r, color: c, s: (r.w + r.d / 2) / r.games });
  if (!rows.length) return null;
  rows.sort((a, b) => a.s - b.s || b.games - a.games);
  return rows[0].s < 0.45 ? rows[0] : null;
}
function trainLabel(kind) {
  return {
    threats: tr("Entrenar amenazas", "Train threats"), puzzles: tr("Hacer problemas de esto", "Do puzzles on this"), endgames: tr("Ir a los finales", "Go to endgames"),
    openings: tr("Ver mis aperturas", "See my openings"), errors: tr("Repasar estos errores", "Review these mistakes")
  }[kind] || tr("Entrenar", "Train");
}
function weeklyHtml(w) {
  const cell = (label, a, b, fmt, better) => {
    let arrow = "";
    if (a != null && b != null && a !== b) { const up = a > b; const good = better === "up" ? up : !up; arrow = `<em class="${good ? "up" : "down"}">${up ? "▲" : "▼"}</em>`; }
    return `<div class="wk"><span>${label}</span><b>${a == null ? "–" : fmt(a)} ${arrow}</b><small>${tr("semana anterior", "previous week")}: ${b == null ? "–" : fmt(b)}</small></div>`;
  };
  return `<div class="card wk-row">${cell(tr("Partidas", "Games"), w.now.games, w.prev.games, (x) => x, "up")}${cell(tr("Precisión media", "Average accuracy"), w.now.acc, w.prev.acc, (x) => Math.round(x) + "%", "up")}${cell(tr("Blunders por partida", "Blunders per game"), w.now.blunders, w.prev.blunders, fmt1, "down")}${cell(tr("Ejercicios hechos", "Exercises done"), w.now.exercises, w.prev.exercises, (x) => x, "up")}</div>`;
}
function accChart(trend) {
  if (trend.length < 2) return `<p class="muted small">${tr("Hace falta más de una partida analizada.", "You need more than one analyzed game.")}</p>`;
  const W = 600, H = 170, L = 34, R = 10, T = 10, B = 22;
  const n = trend.length, X = (i) => L + (n === 1 ? 0 : (i / (n - 1)) * (W - L - R));
  const lo = 30, hi = 100, Y = (v) => T + (1 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (H - T - B);
  const ma = trend.map((_, i) => { const s = trend.slice(Math.max(0, i - 6), i + 1); return s.reduce((a, x) => a + x.acc, 0) / s.length; });
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${tr("Precisión por partida", "Accuracy per game")}">`;
  for (const g of [40, 60, 80, 100]) s += `<line x1="${L}" x2="${W - R}" y1="${Y(g)}" y2="${Y(g)}" class="grid"/><text x="${L - 6}" y="${Y(g) + 4}" class="ax" text-anchor="end">${g}</text>`;
  s += `<path d="M${X(0)},${Y(ma[0])} ${ma.map((v, i) => `L${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ")} L${X(n - 1)},${H - B} L${X(0)},${H - B} Z" class="area"/>`;
  s += trend.map((t, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(t.acc).toFixed(1)}" r="3" class="dot"><title>${esc(fmtDate(t.date))} · ${esc(t.label)} · ${Math.round(t.acc)}%</title></circle>`).join("");
  s += `<path d="M${ma.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" L")}" class="line"/>`;
  s += `<circle cx="${X(n - 1)}" cy="${Y(ma[n - 1])}" r="4.5" class="end"/>`;
  s += `<text x="${L}" y="${H - 5}" class="ax">${esc(fmtDate(trend[0].date))}</text><text x="${W - R}" y="${H - 5}" class="ax" text-anchor="end">${esc(fmtDate(trend[n - 1].date))}</text></svg>`;
  return s + `<p class="small muted">${tr(`Puntos: cada partida. Línea: promedio de las últimas 7 (ahora ${Math.round(ma[n - 1])}%).`, `Dots: each game. Line: average of the last 7 (now ${Math.round(ma[n - 1])}%).`)}</p>`;
}
function blunderChart(trend) {
  const rows = trend.slice(-30);
  if (!rows.length) return `<p class="muted small">${tr("Sin datos todavía.", "No data yet.")}</p>`;
  const W = 600, H = 170, L = 26, R = 10, T = 10, B = 22;
  const max = Math.max(2, ...rows.map((t) => t.blunders));
  const bw = Math.min(36, (W - L - R) / rows.length); // con pocas partidas, barras finas y no un bloque
  const Y = (v) => T + (1 - v / max) * (H - T - B);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${tr("Blunders por partida", "Blunders per game")}">`;
  for (let g = 0; g <= max; g += Math.max(1, Math.ceil(max / 4))) s += `<line x1="${L}" x2="${W - R}" y1="${Y(g)}" y2="${Y(g)}" class="grid"/><text x="${L - 6}" y="${Y(g) + 4}" class="ax" text-anchor="end">${g}</text>`;
  rows.forEach((t, i) => {
    const x = L + i * bw + 1, h = Math.max(t.blunders ? 2 : 0, (H - T - B) - (Y(t.blunders) - T));
    s += `<rect x="${x.toFixed(1)}" y="${(H - B - h).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="2" class="bar"><title>${esc(fmtDate(t.date))} · ${t.blunders} ${t.blunders === 1 ? "blunder" : "blunders"}</title></rect>`;
  });
  const avg = rows.reduce((a, t) => a + t.blunders, 0) / rows.length;
  s += `<line x1="${L}" x2="${W - R}" y1="${Y(avg)}" y2="${Y(avg)}" class="avg"/></svg>`;
  return s + `<p class="small muted">${tr(`Línea: promedio (${fmt1(avg)} por partida).`, `Line: average (${fmt1(avg)} per game).`)}</p>`;
}
function openingTable(title, obj) {
  const rows = Object.values(obj).sort((a, b) => b.games - a.games).slice(0, 8);
  if (!rows.length) return `<div class="card"><h3>${title}</h3><p class="muted small">${tr("Sin partidas.", "No games.")}</p></div>`;
  const scored = rows.length >= 2 ? rows.filter((r) => r.games >= 3 && r.name !== OTHER).map((r) => ({ r, s: (r.w + r.d / 2) / r.games })) : [];
  const best = scored.length ? scored.reduce((a, b) => (b.s > a.s ? b : a)).r : null;
  const worst = scored.length >= 2 ? scored.reduce((a, b) => (b.s < a.s ? b : a)).r : null;
  return `<div class="card"><h3>${title}</h3><table class="tbl"><thead><tr><th>${tr("Apertura", "Opening")}</th><th>${tr("Partidas", "Games")}</th><th>${tr("G · T · P", "W · D · L")}</th><th>${tr("Puntos", "Score")}</th><th>${tr("Precisión", "Accuracy")}</th></tr></thead><tbody>`
    + rows.map((r) => `<tr><td>${esc(r.name)}${r === best ? ` <span class="tag good">${tr("tu mejor", "your best")}</span>` : ""}${r === worst && r !== best ? ` <span class="tag bad">${tr("a revisar", "needs work")}</span>` : ""}</td><td>${r.games}</td><td>${r.w} · ${r.d} · ${r.l}</td><td>${Math.round(((r.w + r.d / 2) / r.games) * 100)}%</td><td>${r.accN ? Math.round(r.acc / r.accN) + "%" : "–"}</td></tr>`).join("")
    + `</tbody></table></div>`;
}
void EN;
