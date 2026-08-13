# Base de datos — Cloud Firestore

Estructura conocida y confirmada por desarrollo directo del proyecto. Antes de agregar una colección nueva, revisar si ya existe algo reusable acá.

## Colecciones

### `users/{uid}`
Campos: `email`, `role` (`'admin'|'coach'|'fisico'|'personal'`), `isOwner` (bool, solo `true` en la cuenta del Dueño de la plataforma — el resto de las cuentas no tiene este campo), `photoUrl` (Cloudinary — UI en la pestaña Apariencia desde la Etapa 6, se sube con `uploadImageFile`), `displayName` (campo del modelo de datos, todavía sin UI — no se pidió explícitamente en la Etapa 6, solo la foto).

Subcolecciones:
- `memberships/{membershipId}` — **NUEVO** (Etapa 3, migración multi-club). `{clubId, sportId, role, categoryIds}`. `sportId: null` = alcance a todos los deportes del club (Admin de club). `membershipId` sugerido: `clubId + '_' + (sportId || 'club')`. Hoy conviven con el viejo `users/{uid}.role` plano — la app todavía LEE el `role` plano para todo (login, `roleFlags()`, visibilidad de pestañas); `memberships` está poblado por la migración pero recién se empieza a usar para algo en la Etapa 7 (selector post-login + rol Coordinador). No lo borres pensando que no se usa.
- `exercises/{id}` — biblioteca táctica **personal** del entrenador/personal trainer (pizarra), reusable entre categorías. Campos: `name`, `category` (tipo de jugada: Ataque/Defensa/Saque/Transición), `teamCategories` (array de nombres de categoría, para filtrar), `description`, `objective`, `materials` (array), `suggestedDurationMinutes`, `diagram` ({version, frames: [{tokens, arrows}]}), `sharedId` (id del doc espejo en `publicExerciseLibrary`, o `null`), `createdBy` ({uid, email}), `createdAt`, `updatedAt`, `archived`.
- `routines/{id}` — rutinas físicas del preparador/personal trainer. Estructura: `days: [{id, blocks:[{id, exercises:[{id, name, sets, weight, notes, photoUrl}]}]}]`. **Hoy son personales del usuario — hay una discusión de diseño en curso para pasarlas a ser por categoría (`teams/{teamId}/routines`), ver FEATURES.md, todavía no implementado.**
- `preferences/{docId}` — preferencias personales (tema claro/oscuro/auto).
- `calendarEvents/{id}` — calendario 100% individual del usuario, nunca compartido.
- `customTests/{id}` — tests físicos personalizados creados por el usuario para Evaluaciones Físicas. Campos: `name`, `category`, `unit`, `resultType` (`'number'|'text'`), `higherIsBetter` (bool|null), `usesAttempts` (bool), `usesSide` (bool), `description`, `createdAt`.

### `teams/{teamId}`
Una "categoría" del club (ej. U15). Campos: `name`, `members` (array de uids con acceso), `clubId` (**NUEVO**, `'once-unidos'` para todas las categorías actuales — `null` si algún día es de un Personal Trainer independiente, ver nota abajo), `sportId` (**NUEVO**, `'basquet'` hoy), `ownerUid` (**NUEVO**, `null` salvo que sea una categoría de Personal Trainer), `logoUrl` (**NUEVO**, Cloudinary — UI en Administración → Gestión de categorías desde la Etapa 6).

**Nota sobre la migración**: hoy TODAS las categorías se crean desde el mismo flujo de Administración (solo el admin las crea, incluso para un Personal Trainer) — no hay forma de distinguir en los datos actuales cuál "sería" independiente de un Personal Trainer. La migración de la Etapa 3 trata todas las categorías existentes como categorías del club (`clubId:'once-unidos', ownerUid:null`). Recién desde la Etapa 7, cuando el Personal Trainer tenga su propio mini-panel para crear categorías nuevas, una categoría nueva puede nacer con `ownerUid` desde el vamos.

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
Biblioteca **táctica pública** — jugadas compartidas por cualquier entrenador del club, visibles para todos. Mismo shape que `users/{uid}/exercises`, más `createdBy: {uid, email, photoUrl}` (`photoUrl` **NUEVO** desde la Etapa 6 — copia de `users/{uid}.photoUrl` al momento de compartir, no se actualiza retroactivamente si el usuario cambia de foto después). El link entre la copia personal y esta va desde el doc personal (`sharedId`), no al revés.

### `clubData/playerInfo`
Doc único con `{players: {nombreExacto: {dni, fechaNacimiento, altura, peso, photoUrl, notas, ...}}}`. **Club-wide, no por categoría** — un jugador que juega en varias categorías tiene una sola ficha visible desde cualquiera de ellas. El roster (plantel) y la asistencia de cada categoría siguen siendo independientes — esto NO los afecta.

### `forumMessages/{id}`
Foro, **un solo canal para todo el club** (no por categoría). `{text, attachmentUrl, attachmentType: 'image'|'pdf', attachmentName, createdBy: {uid, email, photoUrl}, createdAt}` (`photoUrl` **NUEVO** desde la Etapa 6, mismo criterio de snapshot que en `publicExerciseLibrary`). Todavía sin `clubId`/`sportId` — eso es Etapa 8.

### `sportsCatalog/{sportId}` — **NUEVO** (Etapa 3)
Catálogo GLOBAL de deportes que existen en la plataforma, compartido entre todos los clubes. Campos: `{name}`. Hoy solo `sportsCatalog/basquet` → `{name:'Básquet'}`. Solo el Dueño puede agregar un deporte nuevo (reglas: `isOwner()`).

### `clubs/{clubId}` — **NUEVO** (Etapa 3)
Un club de la plataforma. Campos: `name`, `logoUrl` (Cloudinary, `null` si no cargó), `theme` (objeto con overrides de colores, cada key opcional — Etapa 4), `enabledSports` (array de ids de `sportsCatalog`, subconjunto habilitado para este club), `maxCategories` (número o `null` = sin límite), `categoryCount` (contador, se recalcula/actualiza al crear una categoría — ver `createTeam()` en `js/administracion.js`), `createdAt`. Hoy solo existe `clubs/once-unidos`, creado por la migración con `enabledSports:['basquet'], maxCategories:null` (club fundador, sin tope).

**Límite de `categoryCount` — limitación conocida, documentada a propósito**: sin backend propio (Cloud Function), el incremento en `createTeam()` es un `get()` + `set()` desde el cliente, no una transacción atómica real — dos admins creando una categoría en el mismo instante exacto podrían pisarse el conteo. Mismo nivel de confianza que ya se acepta en otras partes del proyecto por la misma razón (ej. no se puede borrar el archivo real de Cloudinary desde el cliente). No es un problema práctico hoy (un solo club, un solo admin activo) — si en algún momento hace falta gestionar planes pagos con precisión estricta, ahí sí conviene una Cloud Function.

## Principio de identidad — importante para cualquier cambio futuro
Un jugador se identifica por su **nombre exacto como string**, no por un ID separado. Si se lo quita de un plantel y se lo vuelve a cargar con el mismo nombre, recupera automáticamente su ficha (`clubData/playerInfo`) y su historial de asistencia/evaluaciones. Es una decisión de diseño deliberada — no "arreglarla" introduciendo IDs de jugador sin que se pida explícitamente, es un cambio de arquitectura grande.

## Reglas de seguridad (Firestore Rules)
Confirmado (Etapa 3): las reglas siguen viviendo en Firebase Console, pero ahora hay una copia versionada en el repo, `firestore.rules` — es la fuente de verdad para revisar cambios, pero **hay que publicarla manualmente en Firebase Console → Firestore → Reglas**, este repo no la despliega solo. Patrón general usado en todo el proyecto:
- `isAdmin()`: chequea `users/{uid}.role == 'admin'`.
- `isOwner()`: **NUEVO** (Etapa 3) — chequea `users/{uid}.isOwner == true`. Solo la cuenta del Dueño de la plataforma la cumple.
- `isMemberOfTeam(teamId)`: chequea que el uid esté en `teams/{teamId}.members`.
- Subcolecciones de `users/{uid}` (exercises, routines, preferences, calendarEvents, customTests): solo el dueño (`request.auth.uid == uid`) puede leer/escribir (routines también permite admin).
- `users/{uid}/memberships`: **NUEVO** — lee el dueño de la cuenta o `isAdmin()`/`isOwner()`; escribe solo `isAdmin()`/`isOwner()` (asignar rol es acción administrativa, igual que hoy con `users/{uid}.role`).
- Subcolecciones de `teams/{teamId}`: `isAdmin() || isMemberOfTeam(teamId)`.
- `physicalExerciseLibrary`, `clubData`: cualquier usuario logueado puede leer/escribir (confiado, club-wide).
- `publicExerciseLibrary`, `forumMessages`: cualquiera logueado puede leer y crear; **editar/borrar solo el autor o el admin** (chequeando `resource.data.createdBy.uid`).
- `sportsCatalog`: **NUEVO** — lee cualquier logueado, escribe solo `isOwner()`.
- `clubs`: **NUEVO** — lee cualquier logueado, escribe `isAdmin() || isOwner()`. **Regla interina, documentada a propósito**: hoy `isAdmin()` y `isOwner()` son prácticamente la misma cuenta (un solo club, un solo admin), así que dejar `isAdmin()` habilitado es lo que permite que `createTeam()` actualice `categoryCount` sin que exista todavía un "Admin de club" real distinto del Dueño. Cuando la Etapa 7 separe esos roles (Admin de club por club vs. Dueño de la plataforma), hay que volver a esta regla y restringir `enabledSports`/`maxCategories` a `isOwner()` únicamente — no se puede hacer esa distinción fina todavía porque los datos que la habilitarían (memberships de Admin de club reales, no solo la del Dueño) recién se empiezan a usar en esa etapa.

**Regla de trabajo**: cualquier cambio de modelo de datos implica revisar y (si hace falta) actualizar las reglas, y compartirlas **completas en texto plano** antes de que se publiquen — nunca asumir que ya están publicadas.
