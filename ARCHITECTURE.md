# Arquitectura técnica — Panel de Entrenadores

## Resumen
Aplicación de **un solo archivo HTML** (nombre real en el repo: POR CONFIRMAR — Claude Code debe verificarlo listando el directorio; en el historial de desarrollo se lo nombró `index_2_R_.html`, pero podría haberse renombrado al desplegar). JavaScript vanilla estilo ES5 (`var`, `function`, sin clases ES6, sin build tools), CSS embebido en el mismo archivo. Sin frameworks (no React/Vue/Angular).

## Por qué esta arquitectura (no es casualidad)
- Sin backend propio: todo corre contra Firebase directamente desde el navegador.
- Sin Firebase Storage: el club no activó el plan Blaze (pago). Por eso todas las fotos y adjuntos (PDF/imagen del foro, fotos de jugadores/ejercicios) van a **Cloudinary** vía *unsigned upload preset*, nunca exponiendo API secret en el cliente porque no hay backend que la esconda.
- Sin build step: se edita el HTML directo y se sube tal cual. Esto es intencional para simplicidad de mantenimiento, no un descuido — **no introducir un bundler/framework sin que se pida explícitamente.**

## Stack
| Capa | Tecnología |
|---|---|
| Frontend | HTML + CSS + JS vanilla, un solo archivo |
| Auth | Firebase Authentication (SDK compat vía CDN) |
| Base de datos | Cloud Firestore (SDK compat vía CDN) |
| Almacenamiento de archivos | Cloudinary (unsigned upload preset) — NO Firebase Storage |
| Hosting | Netlify (sitio estático) |
| Export a PDF | jsPDF + html2canvas (vía CDN) |
| Tipografías | Google Fonts: Inter (400/500/600/700) + Inter Tight (700/800) |

## Estructura interna del archivo (orden aproximado)
1. `<head>`: meta, fuentes, `<style>` con todo el CSS (design tokens, componentes, responsive).
2. `<body>`: markup de todas las pestañas (secciones `<section id="tab-X">`, todas presentes en el DOM, mostradas/ocultas con `display`), modales (`#modalRoot`), lightbox global.
3. `<script>` único al final con toda la lógica:
   - Configuración Firebase + inicialización.
   - Configuración Cloudinary (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_UPLOAD_PRESET`).
   - Objeto `state` central (todo el estado de la app vive ahí, no hay Redux/Context).
   - `roleFlags()`: función única que centraliza TODOS los permisos por rol. **Nunca** agregar chequeos sueltos de `state.role === 'x'` fuera de esta función — no escala y ya causó bugs cuando se agregó un rol nuevo.
   - Bloques de funciones por feature, cada uno con su propio comentario `// ============ NOMBRE ============`.
   - `bindEventsOnce()` al final: conecta todos los listeners, se llama una sola vez tras el login.

## Patrón de navegación
- Barra de pestañas principal (`nav.tabs`, `data-tab="x"`), función `switchTab(tab)` que hace `display:block/none` sobre cada `<section id="tab-x">`.
- Algunas pestañas tienen **sub-pestañas** internas (ej. Biblioteca: Pizarra/Personal/Pública), mismo patrón visual (`.sub-tabs`) pero scoped dentro de la sección.
- La visibilidad de cada botón de pestaña se controla en `applyRoleVisibility()`, leyendo `roleFlags()`.

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
Netlify, sitio estático. Proceso exacto de deploy (¿drag-and-drop manual, o conectado a un repo Git con auto-deploy?): **POR CONFIRMAR — Claude Code debe verificarlo** (buscar `netlify.toml`, carpeta `.git`, o preguntar).

## Control de versiones
POR CONFIRMAR — Claude Code debe verificar si existe un repositorio Git en el proyecto (`git status`, `git log`) antes de asumir cualquier flujo de versionado. Ver también `DEVELOPMENT.md`.
