# Arquitectura técnica — Panel de Entrenadores (ERA)

## Resumen
App modularizada en **dos páginas HTML + módulos ES nativos del navegador** (`<script type="module">`, sin bundler ni npm — ver sección "Estructura de archivos" abajo). JavaScript vanilla estilo ES5 (`var`, `function`, sin clases ES6) dentro de cada módulo, con `import`/`export` reales entre archivos. Sin frameworks (no React/Vue/Angular).

El archivo único original (`index_2_R_.html`, 5194 líneas) se mantiene en el repo como referencia histórica pero **ya no es la fuente de verdad** — no editarlo. Toda la lógica vive ahora en `index.html`/`app.html`/`css/`/`js/`.

## Por qué esta arquitectura (no es casualidad)
- Sin backend propio: todo corre contra Firebase directamente desde el navegador.
- Sin Firebase Storage: el club no activó el plan Blaze (pago). Por eso todas las fotos y adjuntos (PDF/imagen del foro, fotos de jugadores/ejercicios) van a **Cloudinary** vía *unsigned upload preset*, nunca exponiendo API secret en el cliente porque no hay backend que la esconda.
- Sin build step: los módulos ES se editan directo y se suben tal cual a Netlify — el navegador los interpreta nativamente. Esto es intencional para simplicidad de mantenimiento, no un descuido — **no introducir un bundler/framework sin que se pida explícitamente.**
- Dos páginas en vez de una (en vez de un HTML por club, que no es viable sin backend/build): `index.html` cubre login + selección de contexto, `app.html` es el espacio de trabajo genérico que se acomoda según qué club/categoría le llega por query string. Mismo deploy de Netlify, mismo origen — la sesión de Firebase Auth persiste al pasar de una página a la otra sin volver a loguearse.

## Stack
| Capa | Tecnología |
|---|---|
| Frontend | HTML + CSS + JS vanilla, módulos ES nativos (sin build) |
| Auth | Firebase Authentication (SDK compat vía CDN) |
| Base de datos | Cloud Firestore (SDK compat vía CDN) |
| Almacenamiento de archivos | Cloudinary (unsigned upload preset) — NO Firebase Storage |
| Hosting | Netlify (sitio estático) |
| Export a PDF | jsPDF + html2canvas (vía CDN) |
| Tipografías | Google Fonts: Inter (400/500/600/700) + Inter Tight (700/800) |

## Estructura de archivos (real, post-modularización)
```
index.html            — login. Redirige a app.html?team=<id> tras autenticar.
app.html               — markup de todas las <section id="tab-X"> (Inicio, Calendario,
                          Asistencia, Pizarra, Planificación, Rutinas, Evolución,
                          Estadísticas, Convocados, Objetivos, Info/Jugadores, Foro,
                          Admin, Apariencia), modales (#modalRoot), lightbox global.
                          Lee el equipo/categoría activa desde `?team=` en la URL.
css/styles.css          — todo el CSS, compartido por ambas páginas.
js/firebase-config.js   — firebaseConfig, init de Firebase, constantes de Cloudinary.
js/state.js             — objeto `state` central + helpers transversales (escapeHtml,
                          genId, uploadImageFile/uploadForumFile, avatarHtml,
                          photoThumbHtml, showToast, fail, helpers de PDF, etc.)
js/auth.js              — ensureUserDoc, roleFlags(), applyRoleVisibility(),
                          loadTeamsForUser(), renderTeamSelect().
js/main-entrada.js       — boot de index.html: login, redirectToFirstTeam().
js/main-app.js           — boot de app.html: loadTeamData(), switchTab(),
                          bindEventsOnce() (todos los addEventListener de la app).
js/<feature>.js          — un módulo por pestaña/feature grande: asistencia.js,
                          jugadores.js, biblioteca.js, planificacion.js, rutinas.js,
                          evaluaciones-fisicas.js, estadisticas.js, convocados.js,
                          objetivos.js, foro.js, administracion.js, apariencia.js,
                          calendario.js, inicio.js.
index_2_R_.html          — archivo único pre-modularización, referencia histórica.
                          NO editar, no es la fuente de verdad.
```
Todos los módulos usan `export function nombre(...)` / `import {nombre} from './otro.js'` para llamarse entre sí; `state` es un objeto mutable importado donde haga falta (`import {state} from './state.js'`), igual que antes se mutaba directo sobre la variable global.

## Estructura interna de cada página
1. `<head>`: meta, fuentes, `<link rel="stylesheet" href="css/styles.css">`.
2. `<body>`: markup (login en `index.html`; todas las secciones/modales/lightbox en `app.html`).
3. CDNs de Firebase/jsPDF/html2canvas/xlsx/pdf.js vía `<script src="...">` clásico (no son módulos), seguidos de `<script type="module" src="js/main-entrada.js">` o `js/main-app.js` según la página.

## Patrón de navegación
- Barra de pestañas principal (`nav.tabs`, `data-tab="x"`), función `switchTab(tab)` en `js/main-app.js` que hace `display:block/none` sobre cada `<section id="tab-x">`.
- Algunas pestañas tienen **sub-pestañas** internas (ej. Biblioteca: Pizarra/Personal/Pública), mismo patrón visual (`.sub-tabs`) pero scoped dentro de la sección.
- La visibilidad de cada botón de pestaña se controla en `applyRoleVisibility()` (`js/auth.js`), leyendo `roleFlags()`.

## Cuidado con funciones duplicadas en módulos ES (importante, ya causó un bug real)
En el archivo único original (script clásico), dos `function nombre(){}` al mismo nivel eran válidas en silencio — la segunda pisaba a la primera sin error. **En un módulo ES esto es un `SyntaxError` fatal** que rompe toda la cadena de imports de esa página (afecta incluso a páginas que no usan esa función directa, si hay un import transitivo). Ya pasó una vez en la modularización (`renderActivities` duplicada en `js/planificacion.js`, corregida). Antes de dar por terminado cualquier cambio: `grep -rn "function nombreFuncion(" js/` debe dar exactamente 1 resultado.

## Patrón de renderizado
No hay virtual DOM ni reactividad automática. El patrón es: mutar `state`, después llamar explícitamente a la función `renderX()` correspondiente que reconstruye el `innerHTML` del contenedor y vuelve a bindear los listeners de esa sección. **Cuidado**: reconstruir el DOM en cada tecla de un `<input>` rompe el foco/cursor (bug real ya encontrado y corregido) — para inputs de texto que se re-renderizan seguido, actualizar solo el nodo puntual necesario, no todo el contenedor.

## Patrón de identidad de datos
- Jugadores: identificados por **nombre exacto** (string), no por ID. Ver `DATABASE.md`.
- Ejercicios de biblioteca compartidos (personal → pública): identificados por **ID interno** (campo `sharedId` en el doc personal apuntando al doc público), nunca por nombre — para que dos entrenadores no se pisen si eligen el mismo nombre de jugada.

## Integración con Cloudinary — detalle importante
- Imágenes van al endpoint `/image/upload`.
- PDFs van al endpoint `/raw/upload` (con `resource_type=raw`), es un endpoint distinto.
- Para que los PDFs subidos se puedan **ver** (no solo subir), hay que tener activado en la cuenta de Cloudinary: Settings → Security → "Allow delivery of PDF and ZIP files". Si un PDF sube bien pero da error al abrirlo, revisar esto primero.
- No se puede borrar el archivo real en Cloudinary desde el cliente sin el API secret (no expuesto) — "quitar foto" solo desvincula la URL en Firestore, el archivo queda huérfano en la cuenta de Cloudinary.

## Export a PDF
Funciones auxiliares reusables: `pdfDoc()`, `pdfWrapped(doc, text, x, y, maxWidth, lineHeight)`, `pdfFileName(name)`, `captureDiagramImages(x)` (captura las páginas de una pizarra táctica como imágenes). Reusar estas antes de escribir lógica de PDF nueva.

## Deploy
Netlify, sitio estático. No hay `netlify.toml` en el repo — el proceso exacto (drag-and-drop manual vs. conectado a un repo Git con auto-deploy) sigue sin confirmar del lado de Netlify; lo que sí se confirmó es que **no hay conexión Git↔Netlify hoy** porque el repo Git recién se creó (ver abajo). Con la modularización, el deploy tiene que subir `index.html`, `app.html`, `css/` y `js/` completos (no alcanza con un solo archivo).

## Control de versiones
Confirmado: hay un repositorio Git local en el proyecto (creado como punto de restauración antes de la migración a ERA, commit inicial con el estado previo a la modularización). Sin remoto configurado todavía. Seguir el historial de commits existente (mensajes descriptivos en español, un commit por paso verificable) como convención.
