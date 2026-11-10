// "Hoy": la sesión diaria de ~20 minutos, armada según tus debilidades.
import { store, on, today, saveProgress, detectUserColor } from "../state.js";
import { computeInsights, recommendedThemes } from "../insights.js";
import { MOTIFS } from "../motifs.js";
import { dueCount, pendingCount } from "./learn.js";
import { threatCounts } from "./threats.js";
import { nextLesson } from "./endgames.js";
import { THEME_LABEL } from "./puzzles.js";
import { analyseMissing, minutesFor } from "./diagnosis.js";
import { queueLength } from "../state.js";
import { dayKey, addDays, startOfDay } from "../srs.js";
import { $, esc } from "../ui.js";
import { tr, fmtLongDay, DAY_INITIALS } from "../i18n.js";

let hooks = {};

export function initToday(h) {
  hooks = h;
  $("tdBody").addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    const a = t.dataset.act;
    if (a === "errors") hooks.startErrors({ count: +t.dataset.n });
    else if (a === "puzzles") hooks.startPuzzles({ count: +t.dataset.n, theme: "rec" });
    else if (a === "threats") hooks.startThreats({ count: +t.dataset.n });
    else if (a === "review") hooks.openReview(t.dataset.id);
    else if (a === "endgame") hooks.startEndgame(t.dataset.lesson);
    else if (a === "goto") hooks.goView(t.dataset.view);
    else if (a === "analyse") { analyseMissing(); render(); }
  });
  on("queue", () => { if (!$("view-today").hidden) render(); });
  on("warm", (p) => { if (!p.pending && !$("view-today").hidden) render(); });
  on("activity", () => { markComplete(); if (!$("view-today").hidden) render(); updateBadge(); });
  updateBadge();
}
export function showToday() { render(); }

function lastUnreviewed() {
  const lim = addDays(Date.now(), -14);
  return store.library.filter((e) => e.analysis && detectUserColor(e) && !(e.selfReview && e.selfReview.done) && (e.date || 0) >= lim)
    .sort((a, b) => (b.date || 0) - (a.date || 0))[0] || null;
}
export function plan() {
  const d = today(); const blocks = [];
  const errDone = (d.errores || 0) + (d.repaso || 0);
  const errAvail = dueCount() + pendingCount();
  const errTarget = Math.min(5, errAvail + errDone);
  if (errTarget) blocks.push({ id: "errores", title: tr("Repasá tus errores", "Review your mistakes"), sub: dueCount() ? tr(`${dueCount()} para repasar hoy, de partidas tuyas`, `${dueCount()} due for review today, from your games`) : tr("Posiciones de tus partidas donde te equivocaste", "Positions from your games where you went wrong"), target: errTarget, done: errDone, min: 5, act: "errors" });
  const rec = recommendedThemes().slice(0, 3).map((t) => (THEME_LABEL[t] || t).toLowerCase());
  blocks.push({ id: "problemas", title: tr("Táctica", "Tactics"), sub: tr(`Problemas de ${rec.join(", ")}`, `Puzzles: ${rec.join(", ")}`), target: store.settings.dailyPuzzles || 10, done: d.problemas || 0, min: 10, act: "puzzles" });
  const tc = threatCounts(); const thDone = d.amenazas || 0;
  const thTarget = Math.min(3, tc.fresh + tc.due + thDone);
  if (thTarget) blocks.push({ id: "amenazas", title: tr("¿Qué te amenaza?", "What's the threat?"), sub: tr("Detectá la amenaza de tu rival y defendete", "Spot your opponent's threat and defend"), target: thTarget, done: thDone, min: 3, act: "threats" });
  const lastDone = (d.revision || 0) + (d.finales || 0);
  const un = lastUnreviewed();
  if (un && !lastDone) {
    const uc = detectUserColor(un);
    blocks.push({ id: "cierre", title: tr("Revisá tu última partida", "Review your last game"), sub: tr(`vs ${uc === "w" ? un.black : un.white}: primero vos, después el motor`, `vs ${uc === "w" ? un.black : un.white}: you first, then the engine`), target: 1, done: 0, min: 5, act: "review", entryId: un.id });
  } else {
    const l = nextLesson();
    blocks.push({ id: "cierre", title: d.revision ? tr("Revisión de tu partida", "Game review") : tr("Final del día", "Endgame of the day"), sub: d.revision ? tr("Hecha", "Done") : l.title, target: 1, done: lastDone, min: 5, act: "endgame", lesson: l.id });
  }
  return blocks;
}
function markComplete() {
  const blocks = plan();
  const ok = blocks.every((b) => b.done >= b.target);
  const k = dayKey();
  const day = store.progress.days[k] || (store.progress.days[k] = {});
  if (ok && !day.complete) { day.complete = true; saveProgress(); hooks.toast && hooks.toast(tr("¡Día cumplido! Sumaste un día a tu racha.", "Day complete! Your streak grows by one.")); }
}
export function streak() {
  const days = store.progress.days; let n = 0;
  let t = days[dayKey()] && days[dayKey()].complete ? Date.now() : addDays(Date.now(), -1);
  for (let i = 0; i < 2000; i++) { const d = days[dayKey(t)]; if (d && d.complete) { n++; t = addDays(t, -1); } else break; }
  return n;
}
function updateBadge() {
  const b = $("tdCount"); if (!b) return;
  const left = plan().filter((x) => x.done < x.target).length;
  b.hidden = !left; b.textContent = String(left);
}

function render() {
  const blocks = plan();
  const now = new Date();
  const doneAll = blocks.every((b) => b.done >= b.target);
  const st = streak();
  const ins = computeInsights();
  let h = `<header class="td-head"><div><h1>${tr("Hoy", "Today")}</h1><p class="sub">${fmtLongDay(now)} · ${tr("unos 20 minutos", "about 20 minutes")}</p></div>
    <div class="streak${st ? " on" : ""}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 5 5.5 5 11a5 5 0 0 1-10 0c0-3 1.5-4.5 2.5-6 .5 2 1.5 3 2.5 3-1-3 0-6 0-8z"/></svg><b>${st}</b><span>${st === 1 ? tr("día seguido", "day streak") : tr("días seguidos", "day streak")}</span></div></header>`;
  h += weekStrip();
  if (ins.top.length) {
    const m = ins.top[0], info = MOTIFS[m.motif];
    h += `<div class="focus card"><div class="eyebrow">${tr("Tu foco esta semana", "Your focus this week")}</div><h2>${esc(info.label)}</h2><p>${esc(info.tip)}</p><button class="linkbtn" type="button" data-act="goto" data-view="diagnosis">${tr("Ver tu diagnóstico completo", "See your full diagnosis")}</button></div>`;
  } else if (ins.pendingDiag) {
    h += `<div class="focus card"><div class="eyebrow">${tr("Tu foco", "Your focus")}</div><h2>${tr("Preparando tu diagnóstico…", "Preparing your diagnosis…")}</h2><p>${tr(`Estoy clasificando los errores de ${ins.pendingDiag} ${ins.pendingDiag === 1 ? "partida" : "partidas"}. Aparece acá apenas termine.`, `Classifying the mistakes in ${ins.pendingDiag} ${ins.pendingDiag === 1 ? "game" : "games"}. It will show up here as soon as it's done.`)}</p></div>`;
  } else {
    const pend = store.library.filter((e) => !e.analysis && detectUserColor(e)).length;
    h += `<div class="focus card"><div class="eyebrow">${tr("Tu foco", "Your focus")}</div><h2>${pend ? tr("Analizá tus partidas", "Analyze your games") : tr("Traé tus partidas", "Bring in your games")}</h2><p>${pend ? tr(`Tenés ${pend} partidas sin analizar. Con el análisis, el plan de cada día se arma según tus errores.`, `You have ${pend} games not analyzed yet. Once they are, each day's plan is built from your own mistakes.`) : tr("Importá tus partidas de Lichess o Chess.com para que el plan se arme según tus errores.", "Import your games from Lichess or Chess.com so the plan is built from your mistakes.")}</p><button class="btn small" type="button" data-act="goto" data-view="${pend ? "diagnosis" : "library"}">${pend ? tr("Ir al diagnóstico", "Go to diagnosis") : tr("Ir a Partidas", "Go to Games")}</button></div>`;
  }
  if (ins.pendingAnalysis && ins.games.length < 10) {
    h += queueLength()
      ? `<div class="td-note"><span>${tr(`Analizando tus partidas en segundo plano (quedan ${queueLength()}). El diagnóstico y los ejercicios se van completando solos.`, `Analyzing your games in the background (${queueLength()} left). The diagnosis and exercises fill in as it goes.`)}</span></div>`
      : `<div class="td-note"><span>${tr(`Tenés <b>${ins.pendingAnalysis}</b> ${ins.pendingAnalysis === 1 ? "partida" : "partidas"} sin analizar. Con ellas, el plan se arma con tus errores reales y no con una muestra chica.`, `You have <b>${ins.pendingAnalysis}</b> ${ins.pendingAnalysis === 1 ? "game" : "games"} not analyzed yet. With them, the plan is built from your real mistakes instead of a small sample.`)}</span><button class="btn small primary" type="button" data-act="analyse">${tr("Analizar ahora", "Analyze now")} (${minutesFor(ins.pendingAnalysis)})</button></div>`;
  }
  if (doneAll) h += `<div class="day-done">${tr("<b>¡Día cumplido!</b> Volvé mañana para seguir sumando. Si querés más, cualquier bloque se puede repetir.", "<b>Day complete!</b> Come back tomorrow to keep it going. If you want more, any block can be repeated.")}</div>`;
  h += `<ol class="plan">`;
  blocks.forEach((b, i) => {
    const ok = b.done >= b.target;
    const p = Math.min(1, b.done / b.target);
    const extra = b.act === "review" ? `data-id="${esc(b.entryId)}"` : b.act === "endgame" ? `data-lesson="${esc(b.lesson)}"` : `data-n="${Math.max(1, b.target - b.done)}"`;
    h += `<li class="plan-item${ok ? " ok" : ""}"><span class="plan-num">${ok ? "✓" : i + 1}</span>
      <div class="plan-body"><b>${esc(b.title)}</b><small>${esc(b.sub)}</small><i class="plan-bar"><b style="width:${p * 100}%"></b></i></div>
      <span class="plan-meta">${Math.min(b.done, b.target)}/${b.target}<small>≈ ${b.min} min</small></span>
      <button class="btn${ok ? "" : " primary"} small" type="button" data-act="${b.act}" ${extra}>${ok ? tr("Repetir", "Repeat") : b.done ? tr("Seguir", "Continue") : tr("Empezar", "Start")}</button></li>`;
  });
  h += `</ol>`;
  h += summaryRow(ins);
  $("tdBody").innerHTML = h;
}
function weekStrip() {
  const labels = DAY_INITIALS; let s = `<div class="week">`;
  for (let i = 6; i >= 0; i--) {
    const t = addDays(Date.now(), -i); const d = store.progress.days[dayKey(t)] || {};
    const any = Object.keys(d).some((k) => k !== "complete" && d[k] > 0);
    s += `<div class="wd${d.complete ? " full" : any ? " some" : ""}${i === 0 ? " today" : ""}"><i></i><span>${labels[new Date(t).getDay()]}</span></div>`;
  }
  return s + `</div>`;
}
function summaryRow(ins) {
  const pr = store.progress.puzzles;
  const weekAgo = startOfDay(addDays(Date.now(), -7));
  const old = (pr.history || []).filter((h) => h.t < weekAgo).pop();
  const delta = old ? pr.rating - old.r : null;
  const last5 = ins.trend.slice(-5);
  const acc = last5.length ? Math.round(last5.reduce((a, t) => a + t.acc, 0) / last5.length) : null;
  return `<div class="td-stats">
    <div><span>${tr("Nivel en problemas", "Puzzle rating")}</span><b>${pr.rating}</b><small>${delta == null ? tr("todavía sin historial semanal", "no weekly history yet") : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)} ${tr("en 7 días", "in 7 days")}`}</small></div>
    <div><span>${tr("Precisión", "Accuracy")}</span><b>${acc == null ? "–" : acc + "%"}</b><small>${last5.length === 1 ? tr("de tu última partida analizada", "from your last analyzed game") : tr(`promedio de tus últimas ${last5.length || 5} partidas`, `average of your last ${last5.length || 5} games`)}</small></div>
    <div><span>${tr("Esta semana", "This week")}</span><b>${ins.weekly.now.exercises}</b><small>${tr("ejercicios hechos", "exercises done")}</small></div></div>`;
}
