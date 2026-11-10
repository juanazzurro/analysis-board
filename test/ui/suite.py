# Recorrido completo de la app para las pruebas de interfaz (ver test/ui/README.md).
# Genera los pasos que ejecuta la propia app cuando se abre con MESA_SHOTS=<archivo>.
#   python3 test/ui/suite.py <es|en> <carpeta de capturas> <salida.json>
import json, sys
lang, out_shots, out_json = sys.argv[1], sys.argv[2], sys.argv[3]
other = "en" if lang == "es" else "es"
W = "const w=(ms)=>new Promise(r=>setTimeout(r,ms));"
def A(body): return "(async()=>{" + W + body + "})()"
txt = lambda sel: f"(document.querySelector('{sel}')||{{textContent:''}}).textContent.replace(/\\s+/g,' ').trim().slice(0,260)"
SCAN = r"""(() => {
  const view = [...document.querySelectorAll('.view')].find((v) => !v.hidden);
  const t = (view ? view.innerText : "") + "\n" + document.querySelector('.side').innerText;
  const re = document.documentElement.dataset.scanlang === 'en'
    ? /\b(de|la|el|los|las|tu|tus|vos|con|para|por|una|que|qué|sin|más|partida|partidas|jugada|jugadas|Ver|Analiz\w*|Repas\w*|Hoy|Problemas|Finales|Amenazas|errores|Ajustes)\b|[áéíóúñ¿¡]/
    : /\b(the|you|your|and|with|game|games|move|moves|Show|Analyze|Review|Today|Settings|Puzzles|Endgames|Threats|mistakes|Next|Skip|Hint|Try again)\b/;
  const lines = t.split(/\n+/).map((l) => l.trim()).filter((l) => l && re.test(l) && !/^(Español|English|Stockfish.*|Lichess|Chess\.com|.*vs .*|Réti Opening.*)$/.test(l));
  return ['SCAN', [...new Set(lines)].slice(0, 12)];
})()"""
OVER = r"""(() => { const out = []; /* lo que recorta un contenedor con overflow oculto no se ve: no cuenta */ const clipped = (el, p, pr) => { for (let a = el.parentElement; a && a !== p; a = a.parentElement) { const ox = getComputedStyle(a).overflowX; if (ox !== 'visible' && a.getBoundingClientRect().right <= pr.right + 1) return true; } return false; }; for (const p of document.querySelectorAll('.panel, .view')) { if (p.offsetParent === null) continue; const pr = p.getBoundingClientRect(); for (const el of p.querySelectorAll('*')) { const r = el.getBoundingClientRect(); if (r.width && r.right > pr.right + 1 && getComputedStyle(el).position !== 'fixed' && !clipped(el, p, pr)) out.push((el.id || String(el.className).slice(0,30) || el.tagName) + ' ' + Math.round(r.right) + '>' + Math.round(pr.right)); } } return ['OVERFLOW', out.slice(0, 6)]; })()"""
def nav(v, shot=None, wait=1300):
    s = {"js": f"document.querySelector('[data-view=\"{v}\"]').click(); 'nav {v}'", "wait": wait}
    if shot: s["shot"] = f"{out_shots}/{lang}-{shot}.png"
    return s
def checks(): return [{"js": SCAN}, {"js": OVER}]
steps = []
steps.append({"wait": 3500, "js": f"window.__errs=[]; addEventListener('error',e=>__errs.push(e.message)); addEventListener('unhandledrejection',e=>__errs.push(String(e.reason&&e.reason.stack||e.reason))); document.documentElement.dataset.scanlang='{lang}'; ['BOOT', location.search, document.title, document.documentElement.lang, {txt('.brand')}, {txt('#sideFoot')}]"})
# Hoy
steps += [nav("today", "01-today")] + checks()
steps.append({"js": A("const b=[...document.querySelectorAll('#tdBody [data-act]')].map(x=>x.dataset.act+':'+(x.dataset.view||x.dataset.mode||'')+':'+x.textContent.trim().slice(0,30)); return ['TODAY-ACTS', b]")})
steps.append({"js": A("const b=document.querySelector('#tdBody .btn.primary[data-act]'); if(!b) return 'no primary'; const t=b.textContent.trim(); b.click(); await w(1500); return ['TODAY-START', t, document.querySelector('.nav-btn.on').dataset.view, window.__mesaLearn.state()]"), "shot": f"{out_shots}/{lang}-02-today-start.png"})
# Aprender
steps.append(nav("learn", None, 900))
steps.append({"js": A("const L=window.__mesaLearn; let s=L.state(); if(!s.ex) return ['LEARN none', s, " + txt('#lnCard') + "]; const p=s.ex.played; L.move(p.slice(0,2),p.slice(2,4)); await w(1500); const s2=L.state(); return ['LEARN wrong', s2.state, s2.msg, " + txt('#lnCard') + "]"), "shot": f"{out_shots}/{lang}-03-learn-wrong.png"})
steps.append({"js": A("const r=document.querySelector('#lnCard [data-act=\"retry\"]'); if(r) r.click(); await w(600); const L=window.__mesaLearn; const s=L.state(); const b=s.ex.best; L.move(b.slice(0,2),b.slice(2,4)); await w(2500); const s2=L.state(); return ['LEARN solve', s2.state, s2.msg, " + txt('#lnCard') + "]"), "shot": f"{out_shots}/{lang}-04-learn-solved.png"})
steps.append({"js": A("document.querySelector('#lnCard [data-act=\"next\"]').click(); await w(1200); document.querySelector('#lnCard [data-act=\"hint\"]').click(); await w(400); const a=" + txt('#lnCard') + "; document.querySelector('#lnCard [data-act=\"solve\"]').click(); await w(1500); return ['LEARN hint+solve', a, window.__mesaLearn.state().state, " + txt('#lnCard') + "]"), "shot": f"{out_shots}/{lang}-05-learn-solution.png"})
steps += checks()
# Amenazas
steps.append(nav("threats", None, 1200))
steps.append({"js": A("const T=window.__mesaThreats; const s=T.state(); if(!s.ex) return ['THREATS none', " + txt('#thCard') + "]; const t=s.ex.threat; T.move(t.slice(0,2),t.slice(2,4)); await w(1500); const s2=T.state(); let out=['THREATS found', s2.step, s2.msg, " + txt('#thCard') + "]; const d=document.querySelector('#thCard [data-act=\"defend\"]'); if(d){ d.click(); await w(800);} const s3=T.state(); if(s3.ex&&s3.ex.best){ const b=s3.ex.best; T.move(b.slice(0,2),b.slice(2,4)); await w(2500);} const s4=T.state(); out.push('then', s4.step, s4.msg, " + txt('#thCard') + "); return out"), "shot": f"{out_shots}/{lang}-06-threats.png"})
steps += checks()
# Problemas
steps.append(nav("puzzles", None, 2500))
steps.append({"js": A("const P=window.__mesaPuzzles; let s=P.state(); let g=0; while(s.state!=='solved'&&s.state!=='failed'&&g++<25){ await w(800); s=P.state(); if(s.state!=='solved'&&s.state!=='failed'&&s.idx%2===1){ const u=s.moves[s.idx]; P.move(u.slice(0,2),u.slice(2,4)); } } return ['PUZZLE solve', s.state, s.rating, s.msg, " + txt('#pzCard') + "]"), "shot": f"{out_shots}/{lang}-07-puzzle-solved.png"})
steps.append({"js": A("const n=document.querySelector('#pzCard [data-act=\"next\"]'); if(n) n.click(); await w(1800); const P=window.__mesaPuzzles; for (const m of ['a2a3','a7a6','h2h3','h7h6','b2b3','b7b6','g2g3','g7g6']) { const s=P.state(); if(s.state!=='play'&&s.state!=='solving') break; P.move(m.slice(0,2),m.slice(2,4)); await w(150);} await w(800); const s=P.state(); return ['PUZZLE wrong', s.state, s.rating, s.msg, " + txt('#pzCard') + "]"), "shot": f"{out_shots}/{lang}-08-puzzle-wrong.png"})
steps.append({"js": "[...document.querySelectorAll('#pzThemes button, #pzThemes option')].slice(0,8).map(b=>b.textContent.trim())"})
steps += checks()
# Finales
steps.append(nav("endgames", None, 900))
steps.append({"js": A("const E=window.__mesaEndgames; E.select('dama'); await w(600); E.start(); await w(1200); let s=E.state(); E.move('d1','d3'); await w(2500); s=E.state(); return ['ENDGAME', s.lesson, s.state, s.moves, s.fen, s.msg, " + txt('#egCard') + "]"), "shot": f"{out_shots}/{lang}-09-endgame.png"})
steps += checks()
# Jugar
steps.append({"js": "document.querySelector('[data-view=\"play\"]').click(); document.querySelector('#plColor [data-c=\"b\"]').click(); document.getElementById('plStart').click(); 'play start'", "wait": 3500})
steps.append({"js": "['PLAY', document.getElementById('plStatus').textContent, document.getElementById('plMoves').textContent.slice(0,80), document.getElementById('plLevelNow').textContent]", "shot": f"{out_shots}/{lang}-10-play.png"})
steps.append({"js": "document.getElementById('plResign').click(); ['PLAY resign', document.getElementById('plStatus').textContent, !document.getElementById('plAnalyse').hidden]", "wait": 800})
steps += checks()
steps.append({"js": "document.getElementById('plAnalyse').click(); 'analyse played'", "wait": 6000})
steps.append({"js": "['PLAY->ANALYSIS', document.querySelector('.nav-btn.on').dataset.view, window.__mesaAnalysis.state(), " + txt('#anTitle') + ", " + txt('#anProg') + "]", "shot": f"{out_shots}/{lang}-11-played-analysis.png"})
# Biblioteca: pegar, duplicado, inválido, buscar
PGN = """[Event "Paris"]\n[Date "1858.??.??"]\n[White "Paul Morphy"]\n[Black "Duke Karl / Count Isouard"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0"""
steps.append({"js": A("document.querySelector('[data-view=\"library\"]').click(); await w(400); const n0=document.querySelectorAll('.lib-row').length; document.getElementById('pasteBtn').click(); document.getElementById('pgnText').value=" + json.dumps(PGN) + "; document.getElementById('pgnOk').click(); await w(2500); return ['PASTE 1', n0, document.querySelector('.nav-btn.on').dataset.view, window.__mesaAnalysis.state().id, [...document.querySelectorAll('.toast')].map(t=>t.textContent).join(' | ')]")})
steps.append({"js": A("document.querySelector('[data-view=\"library\"]').click(); await w(400); document.getElementById('pasteBtn').click(); document.getElementById('pgnText').value=" + json.dumps(PGN) + "; document.getElementById('pgnOk').click(); await w(1500); return ['PASTE dup', document.querySelectorAll('.lib-row').length, [...document.querySelectorAll('.toast')].map(t=>t.textContent).join(' | ')]")})
steps.append({"js": A("document.querySelector('[data-view=\"library\"]').click(); await w(300); document.getElementById('pasteBtn').click(); document.getElementById('pgnText').value='hola esto no es un pgn'; document.getElementById('pgnOk').click(); await w(500); const e=document.getElementById('pgnErr').textContent; document.querySelector('#pgnDlg [data-close], #pgnCancel') && (document.querySelector('#pgnDlg [data-close], #pgnCancel')).click(); return ['PASTE bad', e]"), "shot": f"{out_shots}/{lang}-12-paste-bad.png"})
steps.append({"js": A("const d=document.querySelector('dialog[open]'); if(d) d.close(); const s=document.getElementById('libSearch'); s.value='rival_c'; s.dispatchEvent(new Event('input')); await w(500); const a=document.querySelectorAll('.lib-row').length; s.value=''; s.dispatchEvent(new Event('input')); await w(400); return ['SEARCH', a, document.querySelectorAll('.lib-row').length, " + txt('#libRecord') + "]"), "shot": f"{out_shots}/{lang}-13-library.png"})
steps += checks()
# Análisis de una partida real
steps.append({"js": A("document.querySelector('[data-view=\"library\"]').click(); await w(300); const rows=[...document.querySelectorAll('.lib-row')]; const r=rows.find(x=>/jugador/i.test(x.textContent))||rows[0]; r.click(); await w(1500); const A2=window.__mesaAnalysis; A2.go(20); await w(900); return ['ANALYSIS', A2.state(), " + txt('#anTitle') + ", " + txt('#anMove') + ", " + txt('#anStats') + "]"), "shot": f"{out_shots}/{lang}-14-analysis.png"})
steps.append({"js": A("const b=document.getElementById('anReviewBtn'); if(!b||b.hidden) return 'no review btn'; b.click(); await w(800); const A2=window.__mesaAnalysis; const s=A2.state(); const m=document.querySelector('[data-act=\"rv-mark\"]'); if(m){ m.click(); await w(300);} const t=document.getElementById('anRvNote'); if(t){ t.value='test'; t.dispatchEvent(new Event('input')); } return ['REVIEW', s.review, " + txt('#anMove') + "]"), "shot": f"{out_shots}/{lang}-15-review.png"})
steps.append({"js": A("const f=document.querySelector('[data-act=\"rv-finish\"]'); if(f){ f.click(); await w(1500);} const s=window.__mesaAnalysis.state(); return ['REVIEW end', s.review, s.compare, " + txt('#anMove') + "]"), "shot": f"{out_shots}/{lang}-16-compare.png"})
steps += checks()
steps.append({"js": A("document.querySelector('[data-view=\"library\"]').click(); await w(300); const rows=[...document.querySelectorAll('.lib-row')].filter(x=>/%/.test(x.textContent)); rows[3].click(); await w(1500); const sk=document.querySelector('[data-act=\"rv-skip\"]'); if(sk){sk.click(); await w(500);} window.__mesaAnalysis.tab('report'); await w(600); return ['REPORT', window.__mesaAnalysis.state().tab, " + txt('#anReport') + ", document.querySelectorAll('#anReport .rp-ctx li').length]"), "shot": f"{out_shots}/{lang}-16b-report.png"})
steps += checks()
# Diagnóstico
steps.append(nav("diagnosis", f"17-diagnosis", 1500))
steps += checks()
for r in ["week", "all", "month"]:
    steps.append({"js": A(f"document.querySelector('#dgBody [data-range=\"{r}\"]').click(); await w(700); return ['DIAG {r}', (document.querySelector('.period-card')||{{textContent:''}}).textContent.replace(/\\s+/g,' ').slice(0,200), document.querySelectorAll('.weak-card').length]")})
    steps += checks()
steps.append({"js": A("const b=document.querySelector('#dgBody [data-act=\"train\"]'); if(!b) return 'no train'; const t=b.textContent.trim(); b.click(); await w(1500); return ['DIAG train', t, document.querySelector('.nav-btn.on').dataset.view, window.__mesaLearn.state().n, " + txt('#lnStats') + "]"), "shot": f"{out_shots}/{lang}-18-diag-train.png"})
steps.append({"js": A("const b=document.querySelector('#dgBody [data-act=\"open\"]'); document.querySelector('[data-view=\"diagnosis\"]').click(); await w(800); const o=document.querySelector('#dgBody [data-act=\"open\"]'); if(!o) return 'no open'; o.click(); await w(1500); return ['DIAG open', document.querySelector('.nav-btn.on').dataset.view, window.__mesaAnalysis.state()]")})
# Ajustes y cambio de idioma
steps.append(nav("settings", "19-settings", 1000))
steps += checks()
steps.append({"js": "['ERRS', window.__errs || ['sin registro']]"})
steps.append({"js": A(f"const s=document.getElementById('stLang'); const before=s.value; s.value='{other}'; s.dispatchEvent(new Event('change')); return ['LANG switch', before]"), "wait": 4500})
steps.append({"js": f"document.documentElement.dataset.scanlang='{other}'; ['AFTER SWITCH', location.search, document.title, {txt('.side')}, document.getElementById('stLang') && document.getElementById('stLang').value, (window.__errs||'no hook')]", "shot": f"{out_shots}/{lang}-20-after-switch.png"})
for v in ["today", "library", "diagnosis", "learn", "threats", "puzzles", "endgames", "play", "settings"]:
    steps.append(nav(v, None, 1100)); steps += checks()
steps.append({"js": A(f"const s=document.getElementById('stLang'); s.value='{lang}'; s.dispatchEvent(new Event('change')); return 'back'"), "wait": 4000})
steps.append({"js": "['BACK', location.search, document.querySelector('.side').innerText.replace(/\\s+/g,' ').slice(0,120)]"})
steps.append({"js": "['DONE']"})
json.dump(steps, open(out_json, "w"))
print(len(steps), "steps")
