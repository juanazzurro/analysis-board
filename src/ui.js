import { tr, fmtShortDate } from "./i18n.js";
export const $ = (id) => document.getElementById(id);
export function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

let toastTimer = null;
export function toast(msg, ms = 2800) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

export function fmtDate(ms) {
  const d = new Date(ms); if (isNaN(d)) return "";
  return fmtShortDate(d);
}

export function md(t) {
  const lines = esc(t).split(/\n/); let out = "", inList = false, para = [];
  const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const flush = () => { if (para.length) { out += "<p>" + inline(para.join(" ")) + "</p>"; para = []; } };
  for (const raw of lines) {
    const l = raw.trim();
    if (/^[-*•] /.test(l)) { flush(); if (!inList) { out += "<ul>"; inList = true; } out += "<li>" + inline(l.replace(/^[-*•] /, "")) + "</li>"; continue; }
    if (inList) { out += "</ul>"; inList = false; }
    if (/^#{1,4} /.test(l)) { flush(); out += "<h4>" + inline(l.replace(/^#{1,4} /, "")) + "</h4>"; continue; }
    if (!l) { flush(); continue; }
    para.push(l);
  }
  flush(); if (inList) out += "</ul>";
  return out;
}

export function segValue(container) { const b = container.querySelector(".seg-btn.on"); return b ? b.dataset : {}; }
export function segBind(container, onChange) {
  container.addEventListener("click", (e) => {
    const b = e.target.closest(".seg-btn"); if (!b || !container.contains(b)) return;
    container.querySelectorAll(".seg-btn").forEach((x) => x.classList.toggle("on", x === b));
    if (onChange) onChange(b.dataset);
  });
}
export function segSet(container, key, value) {
  container.querySelectorAll(".seg-btn").forEach((x) => x.classList.toggle("on", x.dataset[key] === value));
}

export function playerStrip(name, elo, color, isYou, extraRight = "") {
  return `<span class="who"><span class="pdot ${color}"></span><span>${esc(name)}</span>${elo ? `<small>${esc(elo)}</small>` : ""}${isYou ? `<em class="you">${tr("vos", "you")}</em>` : ""}</span><span class="acc">${extraRight}</span>`;
}
