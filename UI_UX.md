# UI / UX — Panel de Entrenadores

Un único Design System para toda la app. Inspiración declarada del proyecto: Apple HIG, Apple Sports, Notion, Linear, Hudl, Material Design 3 — debe sentirse como software profesional, no como una página web genérica.

## Colores (tema oscuro "cancha de noche", con variante clara/automática)
```css
--bg-court:#0A0F0C; --bg-panel:#141B17; --bg-panel-raised:#0E1310;
--line-chalk:#EDF2EE; --line-chalk-dim:#98A69D;
--accent-hardwood:#34C77E; --accent-scoreboard:#3DDB8E;
--accent-alert:#E27268; --accent-warn:#E3B34E;
--border-soft: rgba(237,242,238,0.10);
```
El tema claro/oscuro/automático se guarda por usuario (`users/{uid}/preferences`) — los valores hex exactos del tema claro: POR CONFIRMAR contra el `:root`/`[data-theme]` del CSS actual.

## Tipografía
- **Inter** (400/500/600/700) — texto general.
- **Inter Tight** (700/800) — títulos y display.
- Vía Google Fonts CDN.

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
