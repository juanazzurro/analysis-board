const { chromium } = require("playwright"); const fs = require("fs"); const path = require("path");
const rows = JSON.parse(fs.readFileSync("metrics.json"));
rows.push({ name: "ibm-plex-sans", file: "ibm-plex-sans-latin-standard-normal.woff2" }, { name: "source-serif-4", file: "source-serif-4-latin-opsz-normal.woff2" });
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  let css = "";
  for (const r of rows) css += `@font-face{font-family:"${r.name}";src:url("node_modules/@fontsource-variable/${r.name}/files/${r.file}");font-weight:100 900;font-stretch:50% 150%;}\n`;
  fs.writeFileSync("m.html", `<style>${css}</style><body></body>`); await p.goto("file://" + path.resolve("m.html"));
  const out = await p.evaluate(async (names) => {
    const res = {};
    const moves = "14. Nf3 Qxd5 15. O-O-O exd4 16. Rhe1+ Kf8 17. Bb5 a6 18. Bxc6 bxc6 19. e8=Q# +0.35 −1.20 78.4% 5:32";
    const prose = "Llegaste al medio juego con ventaja, pero en la jugada 23 dejaste el alfil sin defensa y la partida se dio vuelta.";
    function ink(font, ch, w) { const c = document.createElement("canvas"); c.width = 160; c.height = 200; const x = c.getContext("2d"); x.font = `${w} 120px "${font}"`; x.textBaseline = "alphabetic"; x.fillText(ch, 30, 150); return x.getImageData(0, 0, 160, 200).data; }
    function diff(a, b) { let d = 0, s = 0; for (let i = 3; i < a.length; i += 4) { d += Math.abs(a[i] - b[i]); s += Math.max(a[i], b[i]); } return s ? d / s : 0; }
    function bbox(a) { let top = 999, bot = -1; for (let y = 0; y < 200; y++) for (let x = 0; x < 160; x++) if (a[(y * 160 + x) * 4 + 3] > 128) { if (y < top) top = y; if (y > bot) bot = y; } return [top, bot]; }
    function stem(font) { // grosor del asta de la "l" a 400, y del trazo fino de la "o": contraste
      const a = ink(font, "l", 400); let w = 0; const y = 110; for (let x = 0; x < 160; x++) if (a[(y * 160 + x) * 4 + 3] > 128) w++;
      const o = ink(font, "o", 400); let cols = []; for (let x = 0; x < 160; x++) { let n = 0; for (let yy = 0; yy < 200; yy++) if (o[(yy * 160 + x) * 4 + 3] > 128) n++; cols.push(n); }
      // trazo horizontal fino: en la columna central, alto de tinta / 2
      const xs = cols.map((n, i) => n ? i : -1).filter(i => i >= 0); const mid = Math.round((xs[0] + xs[xs.length - 1]) / 2);
      return [w / 120, cols[mid] / 2 / 120];
    }
    for (const n of names) {
      await document.fonts.load(`400 20px "${n}"`); await document.fonts.load(`700 20px "${n}"`);
      const c = document.createElement("canvas").getContext("2d");
      const W = (t, w, feat) => { c.font = `${w} 13.5px "${n}"`; c.fontVariantNumeric = feat || "normal"; return c.measureText(t).width; };
      const s = document.createElement("span"); s.style.cssText = `font:400 13.5px "${n}";font-variant-numeric:tabular-nums;white-space:nowrap;position:absolute`; s.textContent = moves; document.body.appendChild(s);
      const w4 = s.getBoundingClientRect().width; s.style.fontWeight = 600; const w6 = s.getBoundingClientRect().width; s.style.fontWeight = 400; s.textContent = prose; const wp = s.getBoundingClientRect().width; s.remove();
      const I = ink(n, "I", 400), l = ink(n, "l", 400), one = ink(n, "1", 400), O = ink(n, "O", 400), zero = ink(n, "0", 400);
      const xb = bbox(ink(n, "x", 400)), Hb = bbox(ink(n, "H", 400));
      const [st, thin] = stem(n);
      res[n] = { moves: +w4.toFixed(1), bold: +((w6 / w4 - 1) * 100).toFixed(1), prose: +wp.toFixed(1), Il: +diff(I, l).toFixed(2), l1: +diff(l, one).toFixed(2), O0: +diff(O, zero).toFixed(2), xcap: +((xb[1] - xb[0]) / (Hb[1] - Hb[0])).toFixed(3), xem: +((xb[1] - xb[0]) / 120).toFixed(3), stem: +st.toFixed(3), contrast: +(st / thin).toFixed(2) };
    }
    return res;
  }, rows.map(r => r.name));
  fs.writeFileSync("browser.json", JSON.stringify(out));
  console.log("family".padEnd(28) + ["moves", "bold%", "prose", "I≠l", "l≠1", "O≠0", "x/cap", "x/em", "stem", "contr"].map(s => s.padStart(7)).join(""));
  for (const [n, r] of Object.entries(out)) console.log(n.padEnd(28) + [r.moves, r.bold, r.prose, r.Il, r.l1, r.O0, r.xcap, r.xem, r.stem, r.contrast].map(v => String(v).padStart(7)).join(""));
  await b.close();
})();
