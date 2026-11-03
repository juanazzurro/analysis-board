# Crea un .zip de una app de Mac conservando enlaces simbólicos, permisos y nombres en UTF-8
# (lo que necesita ditto para descomprimirla bien). Uso: python3 mkzip.py <carpeta> "<Nombre>.app" <salida.zip>
import os, sys, zipfile, stat
src_parent, name, out = sys.argv[1], sys.argv[2], sys.argv[3]
root = os.path.join(src_parent, name)
n = 0
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for dp, dns, fns in os.walk(root, followlinks=False):
        rel_dp = os.path.relpath(dp, src_parent)
        # directorios (incluidos los symlinks a directorios, que os.walk lista en dns)
        for d in list(dns):
            full = os.path.join(dp, d); arc = os.path.join(rel_dp, d)
            if os.path.islink(full):
                zi = zipfile.ZipInfo(arc); zi.create_system = 3
                zi.external_attr = (stat.S_IFLNK | 0o755) << 16
                z.writestr(zi, os.readlink(full), compress_type=zipfile.ZIP_STORED); n += 1
                dns.remove(d)
            else:
                zi = zipfile.ZipInfo(arc + "/"); zi.create_system = 3
                zi.external_attr = (stat.S_IFDIR | 0o755) << 16 | 0x10
                z.writestr(zi, b""); n += 1
        for f in fns:
            full = os.path.join(dp, f); arc = os.path.join(rel_dp, f)
            st = os.lstat(full)
            zi = zipfile.ZipInfo(arc); zi.create_system = 3
            if stat.S_ISLNK(st.st_mode):
                zi.external_attr = (stat.S_IFLNK | 0o755) << 16
                z.writestr(zi, os.readlink(full), compress_type=zipfile.ZIP_STORED)
            else:
                zi.external_attr = (stat.S_IFREG | (st.st_mode & 0o777)) << 16
                zi.compress_type = zipfile.ZIP_DEFLATED
                with open(full, "rb") as fh: z.writestr(zi, fh.read())
            n += 1
print("entries", n)
