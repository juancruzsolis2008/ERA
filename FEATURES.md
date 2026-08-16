# Funcionalidades — Panel de Entrenadores

## Existentes (completas y en uso)

- **Login** con Firebase Auth, sin auto-registro (solo admin crea cuentas).
- **Roles**: admin, coach, fisico, personal — permisos centralizados en `roleFlags()`.
- **Inicio**: dashboard con resumen, accesos rápidos y tarjetas adaptadas por rol.
- **Calendario**: individual por usuario, con lectura de clases/partidos superpuesta según rol.
- **Asistencia**: pelota + físico por separado, resumen grupal (4 tarjetas: asistencias cargadas, % general, faltas promedio/semana, jugadores promedio/entreno) y resumen por jugador con historial y detalle modal.
- **Jugadores**: alta manual o import (Excel/CSV/PDF con revisión), ficha club-wide compartida entre categorías, alta simultánea en varias categorías, borrado con confirmación (recupera info si se vuelve a cargar con el mismo nombre).
- **Biblioteca**: Pizarra (dibujo táctico con fichas: atacante, defensor con forma anatómica y rotación, pelota emoji, cono, aro circular, silla, colchoneta, escalera de coordinación, valla), Biblioteca personal (buscador + filtros, PDF, compartir, borrar), Biblioteca pública (solo lectura + cargar).
- **Planificación de clases**: actividades manuales o desde biblioteca (personal o pública), export PDF.
- **Rutinas físicas**: Día → Bloque → Ejercicio, con "+ Ejercicio ya usado", "+ Desde biblioteca" y "+ Desde biblioteca pública", export PDF.
- **Evaluaciones Físicas** (renombrada desde "Evolución"): biblioteca de ~45 tests precargados en 9 categorías, tests personalizados, evaluación con múltiples tests ("evaluación completa"), cálculos automáticos (1RM estimado, velocidad, IMC), historial con gráfico de línea por test+ejercicio, comparación automática primera-vs-última, informe PDF por evaluación. Compatibilidad con datos viejos de "Evolución" (se muestran como "registro anterior").
- **Estadísticas**: registro por jugador y partido.
- **Convocados**: convocatoria + mensaje para WhatsApp.
- **Objetivos**: notas libres (subtítulo/texto/lista/casillero) por categoría, objetivos centrales en Inicio.
- **Foro**: canal único del club, adjuntos de imagen y PDF, borrado solo por el autor/admin.
- **Administración**: crear categorías, crear cuentas (con selector de rol), gestionar accesos por categoría, resetear contraseña.
- **Apariencia**: tema claro/oscuro/auto por usuario.

## Parcialmente implementadas / con deuda conocida

- **Rutinas por categoría**: se decidió pasar las rutinas de "personales del usuario" a "por categoría/compartidas", pero **todavía no se implementó**. Quedan dos decisiones de diseño pendientes de cerrar antes de programarlo: (1) qué hacer con las rutinas ya cargadas que no tienen categoría asociada (migrarlas como legado de solo lectura, o duplicarlas en todas las categorías del usuario), (2) si "+ Ejercicio ya usado" debe seguir buscando en todas las categorías o solo en la actual.
- **Migración de fichas de jugadores**: existe el botón en Administración para juntar las fichas viejas (por categoría) en el modelo club-wide nuevo — hay que haberlo corrido al menos una vez en cada instalación nueva del proyecto, si no las fichas parecen "vacías".

## Rumbo a ERAM — plataforma multi-club/multi-deporte

Plan completo en `C:\Users\Escritorio\.claude\plans\0-antes-de-crispy-dawn.md`, en 8 etapas. Estado real (no lo que decía el plan original, esto refleja lo ya hecho):

**Implementado (Etapas 1-8 — plan completo):**
- Modularización: `index.html` + `app.html` + módulos ES en `js/`, `index_2_R_.html` queda de referencia histórica.
- Rebranding a ERAM: nombre + slogan "La nueva ERAM para el entrenamiento" en el login; dentro de un club, el club tiene el protagonismo y ERAM queda discreta (header + pie de página).
- Modelo de datos multi-club: `sportsCatalog`, `clubs/{clubId}` (con `theme`/`enabledSports`/`maxCategories`/`categoryCount`), `teams` con `clubId`/`sportId`/`ownerUid`/`logoUrl`, `users` con `isOwner`/`photoUrl`/`displayName` + subcolección `memberships`. Migración de Once Unidos con botón idempotente en Administración (`migrateToMultiClub`, corrida pendiente por el usuario — ver ARCHITECTURE.md/DATABASE.md).
- Identidad visual por club: `js/club-theme.js` aplica colores/logo del club actual sobre las variables CSS, con fallback exacto al branding de Once Unidos si el club no personalizó nada.
- Estética general: azul acero reemplaza el verde en toda la app, tipografía de titulares Barlow Condensed.
- Fotos de perfil (Apariencia) y de categoría (Administración → Gestión de categorías), mismo patrón de subida que las fichas de jugador.
- Selector de club/deporte/categoría post-login (`js/entrada.js`): si la cuenta tiene memberships con 2+ categorías accesibles, se muestra un selector agrupado por club → deporte → categoría; con 1 sola, entra directo (salvo el Dueño, que siempre ve el selector para poder llegar al Panel de la plataforma). Si la cuenta todavía no tiene memberships (no se corrió la migración, o es Personal Trainer), cae al comportamiento de siempre sin cambios.
- Rol Coordinador y Admin de club (no-Dueño): `roleFlags()` reconoce memberships con `role:'admin'`/`'coordinador'` y habilita una pestaña Administración acotada a su club/deporte (crear/renombrar/borrar categorías de su alcance, gestionar a qué categorías tiene acceso un entrenador/preparador físico ya existente). **Límite conocido y documentado a propósito**: crear cuentas nuevas sigue siendo exclusivo del Dueño — acotar esa creación por club/deporte en las reglas de Firestore sin backend propio no es viable de forma segura (ver `firestore.rules` y `DATABASE.md`).
- Panel de la plataforma (`js/plataforma.js`, solo Dueño): catálogo global de deportes, alta de clubes + habilitar deportes + tope de categorías, alta de cuentas de Personal Trainer. Accesible desde el selector post-login.
- Mini-panel de Administración del Personal Trainer: crear/renombrar/borrar sus propias categorías (`ownerUid` = su uid, sin club ni deporte), sin límite de categorías.
- Foro y Biblioteca pública separados por club + deporte: `forumMessages`/`publicExerciseLibrary` ganan `clubId`/`sportId`, filtrados **del lado del cliente** (evita exigir un índice compuesto nuevo en Firestore). Mensajes/jugadas de antes de este cambio se backfillean como parte de `migrateToMultiClub()` — no se pierden, solo hay que correr la migración para que sigan apareciendo una vez activo el filtro.

Las 8 etapas del plan original están implementadas. Sigue pendiente que el usuario publique `firestore.rules` y corra `migrateToMultiClub()` en producción — hasta entonces, toda esta funcionalidad nueva convive sin romper nada gracias a los fallbacks descritos arriba.

## Ideas futuras (mencionadas, sin diseño cerrado todavía)

- Integración con CABB (import de estadísticas de partido post-partido vía PDF/Excel, reusando el importador de jugadores).
- Implementación de IA (sin definir alcance).
- Convertir la app en PWA.
- Borrado real de archivos huérfanos en Cloudinary (necesitaría una Cloud Function — hoy no hay backend).
- Foro en tiempo real (hoy se actualiza al entrar a la pestaña y tras enviar/borrar, no con listeners en vivo).
- Selección de entrenadores específicos para compartir una jugada (hoy Compartir es todo-o-nada: biblioteca pública visible para todo el club).
