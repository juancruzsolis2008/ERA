"""Saca el fondo gris claro (~#F9F9F9) horneado en los PNG reales de marca
que mandó Juan Cruz (assets/branding/), para que se puedan usar sobre el
fondo oscuro del sitio sin que se vea un recuadro gris alrededor.
No toca el contenido real de la imagen (el isotipo/wordmark/portada en sí),
solo vuelve transparente el fondo plano que rodea al dibujo.
"""
from PIL import Image
import math

BASE = "C:/Users/Escritorio/Desktop/Panel De Entrenadores/assets/branding/"
BG = (249, 249, 249)
LOW, HIGH = 10, 45  # distancia al color de fondo: <LOW transparente, >HIGH opaco

def dekey(src, dst):
    im = Image.open(BASE + src).convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            dist = math.sqrt((r - BG[0]) ** 2 + (g - BG[1]) ** 2 + (b - BG[2]) ** 2)
            if dist <= LOW:
                new_a = 0
            elif dist >= HIGH:
                new_a = a
            else:
                new_a = round(a * (dist - LOW) / (HIGH - LOW))
            px[x, y] = (r, g, b, new_a)
    im.save(BASE + dst)
    print("wrote", dst)

dekey("1-eram-portada-completa.png", "eram-portada-transparent.png")
dekey("2-eram-wordmark.png", "eram-wordmark-transparent.png")
dekey("3-icono-eram-simple.png", "eram-icono-transparent.png")
