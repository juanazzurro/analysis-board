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

/** Menú emergente junto a un botón. items: [{ label, kbd, run, danger } | "-"]. */
export function popMenu(anchor, items) {
  closeMenu();
  const m = document.createElement("div"); m.className = "menu"; m.setAttribute("role", "menu");
  let lastSep = true;
  for (const it of items) {
    if (it === "-") { if (!lastSep) m.appendChild(document.createElement("hr")); lastSep = true; continue; }
    const b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "menuitem");
    if (it.danger) b.className = "danger";
    b.innerHTML = `<span>${esc(it.label)}</span>${it.kbd ? `<kbd>${esc(it.kbd)}</kbd>` : ""}`;
    b.onclick = () => { closeMenu(); it.run(); };
    m.appendChild(b); lastSep = false;
  }
  if (m.lastChild && m.lastChild.tagName === "HR") m.lastChild.remove();
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + "px";
  m.style.top = (r.bottom + h + 8 > window.innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6) + "px";
  setTimeout(() => { document.addEventListener("pointerdown", onDocDown, true); document.addEventListener("keydown", onDocKey, true); }, 0);
}
function onDocDown(e) { if (!e.target.closest(".menu")) closeMenu(); }
function onDocKey(e) { if (e.key === "Escape") { e.stopPropagation(); closeMenu(); } }
export function closeMenu() {
  document.querySelectorAll(".menu").forEach((x) => x.remove());
  document.removeEventListener("pointerdown", onDocDown, true); document.removeEventListener("keydown", onDocKey, true);
}
export function openModal(id) { $(id).hidden = false; }
export function closeModals() { document.querySelectorAll(".modal").forEach((m) => { m.hidden = true; }); }
export const anyModal = () => !!document.querySelector(".modal:not([hidden])");
/** Mensaje de error sin el prefijo técnico de Electron. */
export const cleanErr = (e) => String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
