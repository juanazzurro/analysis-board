import glob, os, sys, re, json
from fontTools.ttLib import TTFont
app = set()
for f in glob.glob('src/**/*.js', recursive=True) + ['renderer/index.html']:
    if 'puzzles' in f and 'data' in f: continue
    for ch in open(f, encoding='utf8').read():
        if ord(ch) > 127 and not (0x2654 <= ord(ch) <= 0x265F): app.add(ch)
rows = []
for d in sorted(glob.glob('node_modules/@fontsource-variable/*')):
    name = os.path.basename(d)
    files = glob.glob(d + '/files/*latin-*normal.woff2')
    files = [f for f in files if '-latin-ext-' not in f]
    if not files: continue
    # preferir el archivo con más ejes (full > standard > opsz/wdth > wght)
    def rank(f):
        b = os.path.basename(f)
        return (('full' in b) * 4 + ('standard' in b) * 3 + ('wdth' in b or 'opsz' in b) * 2 + ('wght' in b) * 1, )
    f = sorted(files, key=rank)[-1]
    ext = f.replace('-latin-', '-latin-ext-')
    t = TTFont(f)
    cmap = set(t.getBestCmap().keys())
    if os.path.exists(ext): cmap |= set(TTFont(ext).getBestCmap().keys())
    os2 = t['OS/2']; upm = t['head'].unitsPerEm
    axes = {a.axisTag: (int(a.minValue), int(a.maxValue)) for a in t['fvar'].axes} if 'fvar' in t else {}
    feats = sorted({fr.FeatureTag for fr in t['GSUB'].table.FeatureList.FeatureRecord}) if 'GSUB' in t else []
    hm = t['hmtx']; cm = t.getBestCmap()
    def adv(ch): return hm[cm[ord(ch)]][0] / upm if ord(ch) in cm else None
    digs = [adv(c) for c in '0123456789']
    tab_default = len(set(digs)) == 1
    lower = sum(adv(c) for c in 'abcdefghijklmnopqrstuvwxyz') / 26
    italic = bool(glob.glob(d + '/files/*latin-*italic.woff2'))
    miss = ''.join(sorted(c for c in app if ord(c) not in cmap))
    rows.append(dict(name=name, file=os.path.basename(f), kb=os.path.getsize(f)//1024, xh=round(os2.sxHeight/upm,3), cap=round(os2.sCapHeight/upm,3), ratio=round(os2.sxHeight/os2.sCapHeight,3), axes=axes, tnum='tnum' in feats, zero='zero' in feats, case='case' in feats, ss=[x for x in feats if x.startswith('ss')], tabdef=tab_default, lower=round(lower,3), italic=italic, miss=miss))
json.dump(rows, open('metrics.json','w'), ensure_ascii=False)
print('app non-ascii chars:', ''.join(sorted(app)))
print(f"{'family':28}{'x/cap':>6}{'xh':>6}{'lowW':>6} {'kb':>4} tnum zero ital axes / missing")
for r in rows:
    print(f"{r['name']:28}{r['ratio']:>6}{r['xh']:>6}{r['lower']:>6} {r['kb']:>4} {'T' if r['tnum'] else ('d' if r['tabdef'] else '-'):>4} {'Z' if r['zero'] else '-':>4} {'I' if r['italic'] else '-':>4} {r['axes']} {('MISS '+r['miss']) if r['miss'] else ''} ss={len(r['ss'])}")
