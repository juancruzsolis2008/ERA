# Base de datos — Cloud Firestore

Estructura conocida y confirmada por desarrollo directo del proyecto. Antes de agregar una colección nueva, revisar si ya existe algo reusable acá.

## Colecciones

### `users/{uid}`
Campos: `email`, `role` (`'admin'|'coach'|'fisico'|'personal'`), `isOwner` (bool, solo `true` en la cuenta del Dueño de la plataforma — el resto de las cuentas no tiene este campo), `photoUrl` (Cloudinary — UI en la pestaña Apariencia desde la Etapa 6, se sube con `uploadImageFile`), `displayName` (campo del modelo de datos, todavía sin UI — no se pidió explícitamente en la Etapa 6, solo la foto).

Subcolecciones:
- `memberships/{membershipId}` — **NUEVO** (Etapa 3, migración multi-club). `{clubId, sportId, role, categoryIds}`. `sportId: null` = alcance a todos los deportes del club (Admin de club). `membershipId` sugerido: `clubId + '_' + (sportId || 'club')`. Hoy conviven con el viejo `users/{uid}.role` plano — la app todavía LEE el `role` plano para todo (login, `roleFlags()`, visibilidad de pestañas); `memberships` está poblado por la migración pero recién se empieza a usar para algo en la Etapa 7 (selector post-login + rol Coordinador). No lo borres pensando que no se usa.
  **`categoryIds` solo se llena para Entrenador/Preparador físico** (lista elegida a mano). Para `role: 'admin'` (Admin de club) y `role: 'coordinador'`, `categoryIds` queda `[]` a propósito — su alcance es DINÁMICO, se calcula consultando `teams` por `clubId` (Admin de club) o `clubId`+`sportId` (Coordinador) en el momento, nunca leyendo esta lista. Ver `.agents/rules/modelo-negocio-alcance-roles.md`. Por lo mismo, esos dos roles YA NO dependen de estar en `teams/{teamId}.members` para leer/escribir los datos de una categoría — `firestore.rules` los deja pasar vía `isStaffOfTeam(teamId)`.
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
Biblioteca **táctica pública** — jugadas compartidas, visible solo para entrenadores del MISMO club+deporte de quien la compartió (**Etapa 8**, antes era club-wide único). Mismo shape que `users/{uid}/exercises`, más `createdBy: {uid, email, photoUrl}` (`photoUrl` **NUEVO** desde la Etapa 6 — copia de `users/{uid}.photoUrl` al momento de compartir, no se actualiza retroactivamente si el usuario cambia de foto después), `clubId`/`sportId` (**NUEVO** Etapa 8, tomados de la categoría activa al compartir). El filtro por club+deporte se hace **del lado del cliente** después de traer todo con `orderBy('updatedAt','desc')` — agregar un `.where()` ahí exigiría un índice compuesto nuevo en Firestore que no se puede crear desde este repo. Si la categoría actual todavía no tiene `clubId` (no se corrió la migración), no filtra nada — se ve club-wide como antes. El link entre la copia personal y esta va desde el doc personal (`sharedId`), no al revés.

### `clubData/playerInfo`
Doc único con `{players: {nombreExacto: {dni, fechaNacimiento, altura, peso, photoUrl, notas, ...}}}`. **Club-wide, no por categoría** — un jugador que juega en varias categorías tiene una sola ficha visible desde cualquiera de ellas. El roster (plantel) y la asistencia de cada categoría siguen siendo independientes — esto NO los afecta.

### `forumMessages/{id}`
Foro, **un canal por club+deporte** (Etapa 8 — antes era un solo canal para todo el club, sin distinguir deporte). `{text, attachmentUrl, attachmentType: 'image'|'pdf', attachmentName, createdBy: {uid, email, photoUrl}, clubId, sportId, createdAt}` (`photoUrl` desde la Etapa 6; `clubId`/`sportId` **NUEVO** Etapa 8, mismo criterio de filtro-del-lado-del-cliente que `publicExerciseLibrary` — ver esa entrada para el porqué). Los mensajes de antes de la Etapa 8 se backfillean con `clubId:'once-unidos', sportId:'basquet'` como parte de `migrateToMultiClub()` (si no, "desaparecerían" al activar el filtro sin haberse borrado realmente).

### `sportsCatalog/{sportId}` — **NUEVO** (Etapa 3)
Catálogo GLOBAL de deportes que existen en la plataforma, compartido entre todos los clubes. Campos: `{name}`. Hoy solo `sportsCatalog/basquet` → `{name:'Básquet'}`. Solo el Dueño puede agregar un deporte nuevo (reglas: `isOwner()`).

### `clubs/{clubId}` — **NUEVO** (Etapa 3)
Un club de la plataforma. Campos: `name`, `logoUrl` (Cloudinary, `null` si no cargó), `theme` (objeto con overrides de colores, cada key opcional — Etapa 4), `enabledSports` (array de ids de `sportsCatalog`, subconjunto habilitado para este club), `sportLimits` (**Etapa 9**, reemplaza `maxCategories` — mapa `{sportId: número|null}`, tope de categorías POR DEPORTE, `null` = sin tope para ese deporte), `categoryCounts` (**Etapa 9**, reemplaza `categoryCount` — mapa `{sportId: número}`, se recalcula/actualiza al crear/borrar una categoría de ese deporte — ver `createScopedTeam()`/`renderScopedCategoriesBySport()` en `js/administracion.js`), `createdAt`. Hoy solo existe `clubs/once-unidos`. Clubes creados antes de la Etapa 9 tienen los campos viejos (`maxCategories`/`categoryCount`) huérfanos hasta correr `migrateClubLimitsToPerSport()` (botón en Administración → panel del Dueño) — no se borran solos, quedan sin usar.

**Límite de `categoryCounts` — limitación conocida, documentada a propósito**: sin backend propio (Cloud Function), el incremento/decremento en `createScopedTeam()`/al borrar una categoría es un `get()` + `set()` desde el cliente, no una transacción atómica real — dos admins creando una categoría del mismo deporte en el mismo instante exacto podrían pisarse el conteo. Mismo nivel de confianza que ya se acepta en otras partes del proyecto por la misma razón (ej. no se puede borrar el archivo real de Cloudinary desde el cliente). No es un problema práctico hoy (pocos clubes, un admin activo por vez) — si en algún momento hace falta gestionar planes pagos con precisión estricta, ahí sí conviene una Cloud Function.

## Principio de identidad — importante para cualquier cambio futuro
Un jugador se identifica por su **nombre exacto como string**, no por un ID separado. Si se lo quita de un plantel y se lo vuelve a cargar con el mismo nombre, recupera automáticamente su ficha (`clubData/playerInfo`) y su historial de asistencia/evaluaciones. Es una decisión de diseño deliberada — no "arreglarla" introduciendo IDs de jugador sin que se pida explícitamente, es un cambio de arquitectura grande.

## Reglas de seguridad (Firestore Rules)
Confirmado (Etapa 3): las reglas siguen viviendo en Firebase Console, pero ahora hay una copia versionada en el repo, `firestore.rules` — es la fuente de verdad para revisar cambios, pero **hay que publicarla manualmente en Firebase Console → Firestore → Reglas**, este repo no la despliega solo. Patrón general usado en todo el proyecto:
- `isAdmin()`: chequea `users/{uid}.role == 'admin'`.
- `isOwner()`: **NUEVO** (Etapa 3) — chequea `users/{uid}.isOwner == true`. Solo la cuenta del Dueño de la plataforma la cumple.
- `isClubAdmin(clubId)` / `isCoordinadorOf(clubId, sportId)` / `isClubStaff(clubId, sportId)`: **NUEVO** (Etapa 7) — chequean, vía `users/{uid}/memberships/{clubId}_club` o `.../{clubId}_{sportId}`, si la cuenta es Admin de club o Coordinador de ESE club/deporte puntual. `teams` (crear/editar/borrar) acepta `isClubStaff` de su propio `clubId`/`sportId` además de `isAdmin()`. **Limitación conocida y documentada a propósito**: el acceso real a los DATOS de una categoría (asistencia, planificación, etc.) sigue dependiendo de estar en `teams.members` — un Admin de club/Coordinador no ve automáticamente TODAS las categorías de su club por tener el rol, solo las que creó él mismo (se auto-agrega a `members`) o a las que lo sumaron a mano (mismo mecanismo que ya existía para dar acceso a un entrenador). Cerrar esto del todo (ver todo el club sin depender de `members`) necesitaría reglas mucho más complejas o un backend propio — no se hizo por ahora.
- `isMemberOfTeam(teamId)`: chequea que el uid esté en `teams/{teamId}.members`.
- Subcolecciones de `users/{uid}` (exercises, routines, preferences, calendarEvents, customTests): solo el dueño (`request.auth.uid == uid`) puede leer/escribir (routines también permite admin).
- `users/{uid}` (el doc en sí, no las subcolecciones): **Etapa 9** — `create`/`update` ya no son exclusivos de `isAdmin()`. Cualquier cuenta logueada puede crear/actualizar el doc de OTRO uid, pero acotado a solo `email`+`role`, y `role` solo puede ser `'coach'`/`'fisico'` (nunca `'admin'`/`'personal'`, nunca toca `isOwner`) — necesario para que Admin de club/Coordinador puedan provisionar cuentas nuevas sin ser `isAdmin()`. `delete` sigue siendo exclusivo de `isAdmin()`.
- `users/{uid}/memberships`: **Etapa 9** — lee el dueño de la cuenta o `isAdmin()`/`isOwner()`. Escribe (`create`/`update`/`delete`) `isAdmin()`/`isOwner()`, **o** `canManageMembership()`: Admin de club de ESE `clubId` puede asignar rol `coordinador`/`coach`/`fisico` (nunca `admin` — no puede crear otro Admin de club); Coordinador de ESE `clubId`+`sportId` exacto puede asignar `coach`/`fisico`, pero solo dentro de su propio deporte (`isCoordinadorOf(clubId,sportId)` exige ese `sportId` puntual, así que no puede escribir una membership de otro deporte ni la suya propia con otro alcance, aunque manipule el request directo y no solo la UI).
- Subcolecciones de `teams/{teamId}`: `isAdmin() || isMemberOfTeam(teamId)`.
- `physicalExerciseLibrary`, `clubData`: cualquier usuario logueado puede leer/escribir (confiado, club-wide).
- `publicExerciseLibrary`: cualquiera logueado puede leer y crear; editar/borrar solo el autor o el admin (chequeando `resource.data.createdBy.uid`).
- `forumMessages`: cualquiera logueado puede leer y crear; **borrar** solo el autor o el admin; **update** (**NUEVO** Etapa 8, no existía) solo `isAdmin()` — no hay función de "editar mensaje", esta regla existe únicamente para que el backfill de `migrateToMultiClub()` pueda completar `clubId`/`sportId` en mensajes viejos.
- `sportsCatalog`: **NUEVO** — lee cualquier logueado, escribe solo `isOwner()`.
- `clubs`: lee cualquier logueado. Escribe sin restricción `isAdmin() || isOwner()` (Dueño global). Desde la Etapa 7, además el Admin de club de ESE club puede escribir, pero acotado por `diff().affectedKeys().hasOnly(['categoryCounts'])` (**Etapa 9**, antes `categoryCount`) — no puede tocar `enabledSports`/`sportLimits` (eso sigue siendo exclusivo del Dueño, es el control del "plan pago"). Coordinador (sin ser también Admin de club) no tiene escritura acá — si crea una categoría, `categoryCounts` de su club simplemente no se actualiza en ese caso (mismo tipo de límite que ya tenía `createScopedTeam()` sin backend propio).

**Regla de trabajo**: cualquier cambio de modelo de datos implica revisar y (si hace falta) actualizar las reglas, y compartirlas **completas en texto plano** antes de que se publiquen — nunca asumir que ya están publicadas.
