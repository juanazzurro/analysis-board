// Dibuja el ícono de la app (build/icon-1024.png). Después: python3 tools/make-icns.py
// Uso: node tools/make-icon.mjs   (necesita playwright)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
const knight = fs.readFileSync("build/knight.svg", "utf8").replace(/<svg[^>]*>/, "").replace("</svg>", "");
const L = "#e4e9f0", D = "#7e93b8";
let sq = "";
for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) sq += `<rect x="${c * 206}" y="${r * 206}" width="206" height="206" fill="${(r + c) % 2 ? D : L}"/>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <clipPath id="sq"><rect x="100" y="100" width="824" height="824" rx="186"/></clipPath>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#0b1020" flood-opacity=".32"/></filter>
    <filter id="ks" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="0.9" stdDeviation="1.1" flood-color="#0b1020" flood-opacity=".38"/></filter>
    <linearGradient id="gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </defs>
  <g filter="url(#sh)"><g clip-path="url(#sq)"><g transform="translate(100 100)">${sq}</g>
    <!-- la flecha del motor: de la casilla del caballo hacia donde conviene jugar -->
    <g opacity=".92"><path d="M318 706 L640 384" stroke="#2346d2" stroke-width="58" stroke-linecap="round"/><path d="M548 330 H694 V476" fill="none" stroke="#2346d2" stroke-width="58" stroke-linecap="round" stroke-linejoin="round"/></g>
    <rect x="100" y="100" width="824" height="824" fill="url(#gl)"/></g></g>
  <g transform="translate(232 250) scale(12.4)" filter="url(#ks)">${knight}</g>
</svg>`;
fs.writeFileSync("build/icon.svg", svg);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
await p.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
await p.screenshot({ path: "build/icon-1024.png", omitBackground: true });
await b.close();
console.log("build/icon-1024.png");
