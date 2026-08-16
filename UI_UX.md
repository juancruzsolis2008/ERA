# UI / UX — Panel de Entrenadores (ERAM)

Un único Design System para toda la app. Inspiración declarada del proyecto: Apple HIG, Apple Sports, Notion, Linear, Hudl, Material Design 3 — debe sentirse como software profesional, no como una página web genérica. Desde la Etapa 5 también se tomaron principios (no colores ni tipografía exactos, eso sería copiar) del brand style guide público de TeamSnap: color primario sólido + un segundo acento puntual, tipografía de titulares con carácter + cuerpo muy legible, fotos reales por sobre íconos genéricos.

## Colores — azul acero (Etapa 5, reemplaza el verde original de todo el proyecto)
Tema oscuro:
```css
--bg-court:#0A0F0C; --bg-panel:#141B17; --bg-panel-raised:#0E1310;
--line-chalk:#EDF2EE; --line-chalk-dim:#98A69D;
--accent-hardwood:#4A7FC9; --accent-hardwood-dim:#3A66A3; --accent-scoreboard:#6FA0E0;
--accent-alert:#E27268; --accent-warn:#E3B34E; --accent-data-2:#A98CE0;
--border-soft: rgba(237,242,238,0.10);
```
Tema claro (variante más oscura/saturada del mismo azul, para contraste sobre fondos claros):
```css
--bg-court:#F7F9F7; --bg-panel:#FFFFFF; --bg-panel-raised:#F0F3F0;
--line-chalk:#10160F; --line-chalk-dim:#5B6B60;
--accent-hardwood:#2D5FA0; --accent-hardwood-dim:#234A80; --accent-scoreboard:#4A7FC9;
--accent-alert:#B23A32; --accent-warn:#9A6B10; --accent-data-2:#7A4FB0;
--border-soft: rgba(16,22,19,0.10);
```
El tema claro/oscuro/automático se sigue guardando por usuario (`users/{uid}/preferences`) — esto es independiente del color del club (Etapa 4, `js/club-theme.js`), que se aplica encima como override inline solo de lo que el club definió.

Los nombres de las variables (`--accent-hardwood`, `--accent-scoreboard`) quedaron igual aunque ya no son "verde madera" — no hacía falta renombrarlas.

**Segundo acento**: `--accent-warn` (ámbar/dorado), reservado para momentos puntuales (insignias, hitos, "objetivo cumplido", récords en Evaluaciones Físicas) — no compite con el azul principal porque casi no se usa como color de fondo grande.

**`--accent-data-2` cambió de azul a violeta** (`#7A4FB0` claro / `#A98CE0` oscuro) como consecuencia directa de este cambio: antes convivía con un `--accent-hardwood` verde y ahora los dos serían azules casi idénticos, lo que rompía la distinción visual entre "Clase" y "Evento" en los puntitos del calendario (`.dot-clase` vs `.dot-evento`, ver `css/styles.css`). Si se vuelve a tocar la paleta, revisar que estos dos sigan siendo distinguibles a simple vista.

**No tocado a propósito**: los colores de las fichas de la pizarra táctica (atacante verde, defensor rojo — `.token.att`, canvas de `js/biblioteca.js`) son una convención de color del tablero deportivo, no parte de la marca — no se cambiaron con el rebranding.

## Tipografía
- **Inter** (400/500/600/700) — texto general, sin cambios.
- **Barlow Condensed** (600/700/800) — títulos y display (Etapa 5, reemplaza a Inter Tight). Elegida por su carácter deportivo/condensado, sin parecerse a Museo Slab (la tipografía de titulares de TeamSnap, deliberadamente evitada). `--font-display` mantiene `'Inter Tight', 'Inter'` como fallback en la cadena.
- Vía Google Fonts CDN (`family=Barlow+Condensed:wght@600;700;800` sumado al link existente).

## Componentes reutilizables (usar estos, no inventar variantes nuevas)
- `.panel` — tarjeta contenedora de cada pestaña.
- `.btn` (primario, verde), `.btn.secondary` (fondo panel, borde sutil), `.btn.danger` (rojo alerta). **No existe `.btn.ghost`** — no usarlo, no está definido.
- `nav.tabs` — barra de navegación principal (pestaña activa = fondo verde sólido).
- `.sub-tabs` — mismo lenguaje visual que `nav.tabs` pero más chico, para sub-pestañas dentro de una sección (ej. Biblioteca).
- `.exercise-card`, `.plan-card`, `.activity-card`/`.activity-block` — tarjetas de contenido con fondo, borde sutil, sombra suave. (Ojo: si agregás una clase nueva a un elemento, verificá que el CSS la defina con el nombre EXACTO — este proyecto tuvo un bug donde el HTML usaba `activity-card` y el CSS solo definía `activity-block`, y el elemento quedaba sin estilo silenciosamente, sin error visible.)
- `.member-chip` — checkbox tipo "pill" para selección múltiple (categorías, usuarios). Reusar para cualquier "elegí uno o más de esta lista".
- `.section-divider` (`<hr class="section-divider">`) + `<h2>/<h3>` — para separar visualmente bloques dentro de una misma pestaña.
- Lightbox global (`#lightboxOverlay`) — para ver cualquier foto en grande. Reusar, no crear uno nuevo por sección.
- `dashStatCard(label, value, sub)` + `.dash-grid` — tarjetas de estadística tipo KPI, ya usadas en Inicio y Asistencia. Reusar para cualquier nueva tarjeta de número destacado.
- `.club-logo-img` (**NUEVO**, Etapa 4) — logo circular chico (1.3em) para el header, usado por `applyClubBranding()` (`js/club-theme.js`) cuando el club tiene `logoUrl`. Si no tiene, cae al 🏀 + nombre de siempre — probado que ese fallback se ve idéntico a como se veía antes de esta etapa.

## Navegación
- Barra de pestañas horizontal con scroll (mobile: se corta y scrollea, no se apila).
- Sub-pestañas dentro de una pestaña: mismo patrón, un nivel más chico.
- La pestaña/sub-pestaña activa siempre tiene fondo verde sólido (`--accent-hardwood`) y texto blanco.

## Responsive / mobile-first
La mayoría del uso real es desde el celular. Reglas no negociables:
- Todo texto dinámico largo sin espacios (emails, nombres largos) necesita `overflow-wrap: break-word` donde se muestre.
- `overflow-x: hidden` en `html, body` como red de seguridad general contra desbordes horizontales.
- Toda fila de botones (`.row`) necesita `flex-wrap: wrap` — en pantallas angostas los botones deben pasar a una segunda línea, nunca cortarse o quedar invisibles fuera de la pantalla.
- Antes de dar por terminada una pantalla nueva, probarla mentalmente (o revisando el CSS) con contenido largo: un email largo, un nombre de categoría largo, 3+ botones en una fila.

## Jerarquía visual
- Título de pestaña (`<h2>`) + descripción corta (`<p class="desc">`) al tope de cada sección.
- Subtítulos de sub-secciones con `<h3 class="subhead">` + `.section-divider` antes.
- Acciones primarias: `.btn` verde sólido. Acciones secundarias/destructivas: `.btn.secondary` / `.btn.danger`. No usar más de una acción primaria verde por bloque visual — si hay varias acciones, solo la más importante es verde, el resto secondary.

## Accesibilidad / confirmaciones
- Cualquier acción destructiva (borrar jugador, borrar jugada, borrar evaluación, borrar mensaje del foro) pasa por `confirm()` con un mensaje que explique la consecuencia real (ej. "también se borra la copia pública porque la habías compartido"), no un genérico "¿Estás seguro?".

## Criterios para futuras modificaciones visuales
1. ¿Ya existe un componente/patrón para esto en otra pestaña? Reusarlo antes de crear uno nuevo.
2. ¿El cambio se ve bien en mobile angosto (~360px) y en desktop? Si no se puede probar en navegador real, revisar mentalmente contra las reglas de responsive de arriba.
3. ¿Mantiene la paleta de colores y tipografías existentes? No introducir colores nuevos sueltos — si hace falta un color nuevo, agregarlo como variable CSS junto a las demás, no hardcodeado inline repetido en varios lugares.
