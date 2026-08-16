"""Genera los PNG del icono ERAM (isotipo de tres barras) en varios tamaños.
Dibuja a mano con Pillow sobre el mismo grid de 64x64 que favicon.svg,
porque no hay rasterizador de SVG disponible en esta máquina (sin
Cairo/rsvg/Inkscape). Reescalar SIEMPRE desde 64 -> el valor no debe
tocarse sin actualizar favicon.svg en paralelo.
"""
from PIL import Image, ImageDraw

SIZES = [16, 32, 180, 192, 512]
GRID = 64

BG = "#0A0E16"
NAVY = "#17233A"
NAVY_STROKE = "#3A4A66"
PASTEL = "#CFE3FA"
BLUE = "#4A7FC9"

for size in SIZES:
    scale = size / GRID
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    def r(x, y, w, h):
        return [x * scale, y * scale, (x + w) * scale, (y + h) * scale]

    draw.rounded_rectangle(r(0, 0, GRID, GRID), radius=14 * scale, fill=BG)
    draw.rounded_rectangle(r(14, 20, 30, 7), radius=3.5 * scale, fill=NAVY, outline=NAVY_STROKE, width=max(1, round(scale)))
    draw.rounded_rectangle(r(19, 29, 19, 7), radius=3.5 * scale, fill=PASTEL)
    draw.rounded_rectangle(r(14, 38, 30, 7), radius=3.5 * scale, fill=BLUE)

    img.save(f"assets/icons/icon-{size}.png")
    print("wrote", size)
