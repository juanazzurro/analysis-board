# Pruebas de las funciones de la 2.1 sobre la biblioteca de ejemplo (test/fixture/demo).
#   python3 test/ui/features.py <carpeta de capturas> <salida.json>
import json, sys
shots, out = sys.argv[1], sys.argv[2]
W = "const w=(ms)=>new Promise(r=>setTimeout(r,ms));"
def js(body): return "(async()=>{" + W + body + "})()"
GAME = "chesscom-83et6o"
ROW = '.lib-row[data-id="%s"]' % GAME
OPEN = r"""document.querySelector('[data-view="library"]').click(); await w(500); document.querySelector('%s').click(); await w(2200); const A=__mesaAnalysis; const s=document.querySelector('[data-act="rv-skip"]'); if(s){s.click(); await w(500);} A.tab('moves');""" % ROW
steps = [
 {"wait": 1200, "js": r"""window.__errs=[]; addEventListener('error',e=>__errs.push(e.message)); addEventListener('unhandledrejection',e=>__errs.push(String(e.reason&&e.reason.stack||e.reason))); ['EXPECT look', document.querySelector('.brand-mark').getAttribute('viewBox')==='100 100 824 824' && !!document.querySelector('.brand-mark path[d^="M22 10"]') && getComputedStyle(document.body).fontFamily.includes('Asap') && getComputedStyle(document.querySelector('h1')).fontFamily.includes('Piazzolla')]"""},
 # libro de aperturas
 {"js": js(OPEN + r""" A.go(2); await w(700); const c=(document.querySelector('#anMove .cl')||{}).textContent||'', o=(document.querySelector('#anMove .op-line')||{}).textContent||''; return ['EXPECT book', /libro|Book/.test(c) && /^A0\d /.test(o), c, o]"""), "shot": f"{shots}/f-book.png"},
 # jugada escrita con el teclado
 {"js": js(r"""const A=__mesaAnalysis; A.go(1); await w(300); const bad=A.type('Zz9'); const ok=A.type('e5'); await w(600); const st=A.state(); return ['EXPECT typed', bad===false && ok===true && st.inVar===true && st.depth===2, st.depth]""")},
 # comentario propio y PGN con evaluaciones
 {"js": js(r"""const A=__mesaAnalysis; A.go(12); await w(500); document.querySelector('#anMove [data-act="note-edit"]').click(); await w(200); const ta=document.getElementById('anNote'); ta.value='Nota de prueba.'; ta.dispatchEvent(new Event('input',{bubbles:true})); await w(200); document.querySelector('#anMove [data-act="note-done"]').click(); await w(300); const pgn=A.pgn(); return ['EXPECT note', (document.querySelector('#anMove .note p')||{}).textContent==='Nota de prueba.' && document.querySelectorAll('.mv.noted').length===1 && /\{\[%eval [-0-9.#]+\] Nota de prueba\.\}/.test(pgn) && (pgn.match(/\[%eval/g)||[]).length>40, (pgn.match(/\$[246]/g)||[]).length]"""), "shot": f"{shots}/f-note.png"},
 # devolución: nombre exacto de la apertura y copiar como texto
 {"js": js(r"""const A=__mesaAnalysis; A.tab('report'); await w(600); const p=(document.querySelector('#anReport p')||{}).textContent||''; document.querySelector('[data-act="copy-report"]').click(); await w(200); return ['EXPECT report', /\(A0\d [A-Z]/.test(p) && document.getElementById('toast').textContent.length>5, p.slice(0,80)]"""), "shot": f"{shots}/f-report.png"},
 # quitar una partida y deshacer
 {"js": js(r"""document.querySelector('[data-view="library"]').click(); await w(500); const sel='%s'; const n0=document.querySelectorAll('.lib-row').length; document.querySelector(sel+' .del').click(); await w(150); document.querySelector(sel+' .del').click(); await w(400); const n1=document.querySelectorAll('.lib-row').length; document.querySelector('#toast .toast-act').click(); await w(500); const n2=document.querySelectorAll('.lib-row').length; return ['EXPECT undo', n1===n0-1 && n2===n0 && !!document.querySelector(sel), n0, n1, n2]""" % ROW)},
 # el comentario quedó guardado
 {"js": js(r"""document.querySelector('%s').click(); await w(1500); return ['EXPECT persist', /Nota de prueba/.test(__mesaAnalysis.pgn())]""" % ROW)},
 # registro para soporte
 {"js": js(r"""const t=await window.api.supportReport(); return ['EXPECT support', /^Analysis Board \d/.test(t) && t.includes('--- log ---') && !/sk-ant-[A-Za-z0-9]/.test(t)]""")},
 # tamaño de texto: sin desbordes
 {"js": js(r"""document.querySelector('[data-view="settings"]').click(); await w(400); const s=document.getElementById('stTextSize'); s.value='120'; s.dispatchEvent(new Event('change',{bubbles:true})); await w(700); document.querySelector('[data-view="today"]').click(); await w(600); const ok=document.documentElement.scrollWidth<=innerWidth+1; document.querySelector('[data-view="settings"]').click(); await w(300); s.value='100'; s.dispatchEvent(new Event('change',{bubbles:true})); await w(500); return ['EXPECT zoom', ok]"""), "shot": f"{shots}/f-settings.png"},
 {"js": "['ERRS', window.__errs]"}, {"js": "['DONE']"},
]
json.dump(steps, open(out, "w"))
print(len(steps), "steps")
