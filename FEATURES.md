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

## Planificadas (diseño acordado, sin implementar)

- **Rebranding a "ERA"**: nuevo nombre (E-ntrena, R-egistra, A-naliza), slogan "Una nueva ERA para el entrenamiento". Diseño de identidad visual: pendiente.
- **Arquitectura multi-club / multi-deporte**: la app pasa de ser "el panel de Once Unidos" a ser una plataforma que **Once Unidos usa**, preparada para más clubes y deportes. Diseño acordado (resumen — ver el historial de decisiones si hace falta el detalle completo):
  - Nuevas entidades: `clubs/{clubId}` con `sports` (mapa de deportes del club). `teams` (categorías) ganan `clubId` + `sportId`.
  - Un usuario puede pertenecer a **varios clubes**. El acceso ya no es un `role` único en `users/{uid}`, pasa a ser un array/subcolección de **membresías** (`clubId`, `sportId`, `role`, `categoryIds`).
  - **Nuevo rol: Coordinador** — como un admin, pero acotado a un deporte dentro de un club (crea categorías de ese deporte, crea cuentas, asigna accesos). El admin de club sigue existiendo por encima, con alcance a todos los deportes.
  - Selector de club/deporte/categoría: **después** del login (Firebase Auth es un pool global, no sabe de clubes hasta leer el perfil). Si el usuario tiene una sola membresía, entra directo sin selector (como hoy); si tiene varias, elige.
  - Foro y bibliotecas públicas pasan a estar **separados por club + deporte** (hoy son club-wide únicos).
  - Profesionales independientes (sin club): sin membresía, siguen usando `users/{uid}/exercises` y `routines` tal como hoy — este cambio no les afecta.
  - Migración: Once Unidos se convierte en el primer `club`, Básquet en su primer `sport`, todo lo actual queda adentro (migración automática con botón, sin borrar nada — mismo patrón que la migración de fichas de jugadores).
  - Plan de implementación en etapas: (1) rebranding visual, (2) modelo de datos + migración, (3) selector post-login + rol Coordinador + admin de clubes/deportes, (4) foro/bibliotecas separados por club+deporte.

## Ideas futuras (mencionadas, sin diseño cerrado todavía)

- Integración con CABB (import de estadísticas de partido post-partido vía PDF/Excel, reusando el importador de jugadores).
- Implementación de IA (sin definir alcance).
- Convertir la app en PWA.
- Borrado real de archivos huérfanos en Cloudinary (necesitaría una Cloud Function — hoy no hay backend).
- Foro en tiempo real (hoy se actualiza al entrar a la pestaña y tras enviar/borrar, no con listeners en vivo).
- Selección de entrenadores específicos para compartir una jugada (hoy Compartir es todo-o-nada: biblioteca pública visible para todo el club).
