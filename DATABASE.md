# Base de datos — Cloud Firestore

Estructura conocida y confirmada por desarrollo directo del proyecto. Antes de agregar una colección nueva, revisar si ya existe algo reusable acá.

## Colecciones

### `users/{uid}`
Campos: `email`, `role` (`'admin'|'coach'|'fisico'|'personal'`).

Subcolecciones:
- `exercises/{id}` — biblioteca táctica **personal** del entrenador/personal trainer (pizarra), reusable entre categorías. Campos: `name`, `category` (tipo de jugada: Ataque/Defensa/Saque/Transición), `teamCategories` (array de nombres de categoría, para filtrar), `description`, `objective`, `materials` (array), `suggestedDurationMinutes`, `diagram` ({version, frames: [{tokens, arrows}]}), `sharedId` (id del doc espejo en `publicExerciseLibrary`, o `null`), `createdBy` ({uid, email}), `createdAt`, `updatedAt`, `archived`.
- `routines/{id}` — rutinas físicas del preparador/personal trainer. Estructura: `days: [{id, blocks:[{id, exercises:[{id, name, sets, weight, notes, photoUrl}]}]}]`. **Hoy son personales del usuario — hay una discusión de diseño en curso para pasarlas a ser por categoría (`teams/{teamId}/routines`), ver FEATURES.md, todavía no implementado.**
- `preferences/{docId}` — preferencias personales (tema claro/oscuro/auto).
- `calendarEvents/{id}` — calendario 100% individual del usuario, nunca compartido.
- `customTests/{id}` — tests físicos personalizados creados por el usuario para Evaluaciones Físicas. Campos: `name`, `category`, `unit`, `resultType` (`'number'|'text'`), `higherIsBetter` (bool|null), `usesAttempts` (bool), `usesSide` (bool), `description`, `createdAt`.

### `teams/{teamId}`
Una "categoría" del club (ej. U15). Campos: `name`, `members` (array de uids con acceso).

Subcolecciones:
- `data/roster` — doc único: `{players: [nombreExacto, ...]}`.
- `data/playerInfo` — **OBSOLETO**, reemplazado por `clubData/playerInfo` (ver más abajo). Puede tener datos huérfanos de antes de la migración.
- `data/plays` — legado pre-refactor de jugadas de pizarra (solo lectura/carga, no se edita más).
- `attendance/{docId}` — un doc por sesión: `{kind: 'pelota'|'fisico', date, records: {nombreJugador: {status, stars}}}`. `status` ∈ `presente|tarde|justificado|ausente`.
- `exercises/{id}` — legado, no confundir con la biblioteca nueva.
- `lessonPlans/{id}` — planificación de clases: actividades (manuales o traídas de biblioteca) con su propio sub-diagrama de pizarra.
- `progress/{id}` — **legado** de la vieja pestaña "Evolución": `{playerName, exerciseName, weight, reps, date, recordedBy, createdAt}` (texto libre). No se borra, se sigue mostrando en el historial de Evaluaciones Físicas como "registro anterior".
- `physicalEvaluations/{id}` — Evaluaciones Físicas (sistema nuevo). `{playerName, date, label, tests: [{testId, testName, categories, unit, higherIsBetter, resultType, attempts, bestResult, side, exercise, notes, adhoc, weight, reps, calc}], createdBy, createdAt}`. Una evaluación puede tener varios tests (evaluación completa).
- `stats/{id}` — estadísticas de partido por jugador.
- `callups/{id}` — convocatorias a partido: `{date, arrivalTime, startTime, place, opponent, isHome, players: [...]}` (campos exactos — POR CONFIRMAR contra el código si se necesita precisión total).

### `invites/{teamId_uid}`
Invitaciones a categorías.

### `physicalExerciseLibrary/{id}`
Biblioteca de ejercicios **físicos** (nombre + foto), club-wide, para armar rutinas rápido sin resubir fotos repetidas.

### `publicExerciseLibrary/{id}`
Biblioteca **táctica pública** — jugadas compartidas por cualquier entrenador del club, visibles para todos. Mismo shape que `users/{uid}/exercises`, más `createdBy: {uid, email}`. El link entre la copia personal y esta va desde el doc personal (`sharedId`), no al revés.

### `clubData/playerInfo`
Doc único con `{players: {nombreExacto: {dni, fechaNacimiento, altura, peso, photoUrl, notas, ...}}}`. **Club-wide, no por categoría** — un jugador que juega en varias categorías tiene una sola ficha visible desde cualquiera de ellas. El roster (plantel) y la asistencia de cada categoría siguen siendo independientes — esto NO los afecta.

### `forumMessages/{id}`
Foro, **un solo canal para todo el club** (no por categoría). `{text, attachmentUrl, attachmentType: 'image'|'pdf', attachmentName, createdBy: {uid, email}, createdAt}`.

## Principio de identidad — importante para cualquier cambio futuro
Un jugador se identifica por su **nombre exacto como string**, no por un ID separado. Si se lo quita de un plantel y se lo vuelve a cargar con el mismo nombre, recupera automáticamente su ficha (`clubData/playerInfo`) y su historial de asistencia/evaluaciones. Es una decisión de diseño deliberada — no "arreglarla" introduciendo IDs de jugador sin que se pida explícitamente, es un cambio de arquitectura grande.

## Reglas de seguridad (Firestore Rules)
El archivo de reglas vive en Firebase Console, no en este repo (POR CONFIRMAR si hay una copia versionada en el proyecto — si no la hay, sería buena práctica agregar `firestore.rules` al repo). Patrón general usado en todo el proyecto:
- `isAdmin()`: chequea `users/{uid}.role == 'admin'`.
- `isMemberOfTeam(teamId)`: chequea que el uid esté en `teams/{teamId}.members`.
- Subcolecciones de `users/{uid}` (exercises, routines, preferences, calendarEvents, customTests): solo el dueño (`request.auth.uid == uid`) puede leer/escribir (routines también permite admin).
- Subcolecciones de `teams/{teamId}`: `isAdmin() || isMemberOfTeam(teamId)`.
- `physicalExerciseLibrary`, `clubData`: cualquier usuario logueado puede leer/escribir (confiado, club-wide).
- `publicExerciseLibrary`, `forumMessages`: cualquiera logueado puede leer y crear; **editar/borrar solo el autor o el admin** (chequeando `resource.data.createdBy.uid`).

**Regla de trabajo**: cualquier cambio de modelo de datos implica revisar y (si hace falta) actualizar las reglas, y compartirlas **completas en texto plano** antes de que se publiquen — nunca asumir que ya están publicadas.
