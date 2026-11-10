# Arma build/icon.icns a partir de build/icon-1024.png (necesita Pillow).
from PIL import Image
im = Image.open("build/icon-1024.png").convert("RGBA")
im.save("build/icon.icns", format="ICNS", sizes=[(16, 16), (32, 32), (64, 64), (128, 128), (256, 256), (512, 512), (1024, 1024)])
print("build/icon.icns")
