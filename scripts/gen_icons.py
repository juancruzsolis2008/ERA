"""Genera los PNG del icono ERAM en varios tamaños a partir del archivo
REAL que mandó Juan Cruz (assets/branding/eram-icono-transparent.png,
ya sin el fondo gris horneado -- ver scripts/dekey_branding.py).
Recorta al contenido real (bounding box del canal alfa) y reescala con
LANCZOS a cada tamaño, para que el ícono llene el lienzo en vez de
quedar chico con márgenes.
"""
from PIL import Image

SRC = "C:/Users/Escritorio/Desktop/Panel De Entrenadores/assets/branding/eram-icono-transparent.png"
OUT_DIR = "C:/Users/Escritorio/Desktop/Panel De Entrenadores/assets/icons/"
SIZES = [16, 32, 180, 192, 512]

src = Image.open(SRC).convert("RGBA")
bbox = src.getbbox()
cropped = src.crop(bbox)
# Aseguramos lienzo cuadrado (por si el recorte no dio exactamente 1:1)
side = max(cropped.size)
square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
square.paste(cropped, ((side - cropped.width) // 2, (side - cropped.height) // 2))

for size in SIZES:
    resized = square.resize((size, size), Image.LANCZOS)
    resized.save(f"{OUT_DIR}icon-{size}.png")
    print("wrote", size)
