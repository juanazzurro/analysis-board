# Revisa la salida de una corrida de pruebas de interfaz. Falla (código 1) si:
#  - la interfaz tiró un error, - quedó texto sin traducir (SCAN), - algo se desborda (OVERFLOW),
#  - una comprobación EXPECT dio falso, - la corrida no llegó al final.
#   python3 test/ui/check.py salida.txt [salida2.txt ...]
import json, sys
bad = 0
for path in sys.argv[1:]:
    done = False; n = 0
    for line in open(path, encoding="utf8", errors="replace"):
        line = line.rstrip("\n")
        if line.startswith("[renderer]") and "Uncaught" in line: print(f"{path}: {line[:300]}"); bad += 1
        if line.startswith("[js error]"): print(f"{path}: {line[:300]}"); bad += 1
        if not line.startswith("[js] ["): continue
        try: v = json.loads(line[5:])
        except Exception: continue      # la salida larga se corta: solo importan las líneas cortas de control
        n += 1
        if not isinstance(v, list) or not v or not isinstance(v[0], str): continue
        tag = v[0]
        if tag in ("SCAN", "OVERFLOW", "ERRS") and len(v) > 1 and v[1]: print(f"{path}: {tag} {json.dumps(v[1], ensure_ascii=False)[:400]}"); bad += 1
        if tag.startswith("EXPECT") and (len(v) < 2 or v[1] is not True): print(f"{path}: {json.dumps(v, ensure_ascii=False)[:400]}"); bad += 1
        if tag == "DONE": done = True
    if not done: print(f"{path}: la corrida no terminó"); bad += 1
    print(f"{path}: {n} comprobaciones")
print("FALLÓ" if bad else "TODO BIEN")
sys.exit(1 if bad else 0)
