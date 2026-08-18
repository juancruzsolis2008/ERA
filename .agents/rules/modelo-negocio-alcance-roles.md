# Modelo de negocio de ERAM y reglas de alcance por rol

Fuente de verdad sobre qué categorías puede ver/operar cada rol. El alcance se
venía re-interpretando distinto en cada sesión de trabajo, causando bugs de "no
le otorga acceso a todo". No tratar esto como un prompt de una sola vez.

## El modelo de negocio (por qué existe el multi-club)

ERAM es un SaaS B2B. Juan Cruz (Dueño) vende acceso a la plataforma a distintos
clubes deportivos — hoy en Mar del Plata, a futuro en toda Argentina. Flujo
comercial:

1. **Contacto y negociación**: Juan Cruz contacta al presidente/dueño/referente
   de un club. Pactan un precio en base a qué deportes va a tener ese club en
   la plataforma y cuántas categorías puede tener por cada deporte (el límite
   es un número de plan/billing, no una restricción técnica arbitraria).
2. **Alta del club**: desde el Panel de la plataforma (exclusivo del Dueño),
   Juan Cruz crea el club, habilita los deportes pactados, y fija el límite de
   categorías de cada deporte según lo negociado.
3. **Alta del Admin de club**: Juan Cruz le crea una cuenta con rol Admin de
   club a la persona de referencia del club. Esa cuenta recibe acceso
   automático a TODOS los deportes habilitados del club y TODAS las categorías
   que existan ahí — las de hoy y las que se creen después.
4. **De ahí en adelante, el club se autogestiona**: el Admin de club crea
   Coordinadores (uno por deporte, o más), y tanto el Admin de club como cada
   Coordinador pueden crear cuentas de Entrenador y Preparador físico.

## Reglas de alcance por rol

Distinción central: **Admin de club y Coordinador tienen acceso automático a
todo su alcance — nunca es una lista elegida a mano, y nunca se desactualiza
cuando se crea una categoría nueva.** Entrenador y Preparador físico son la
única excepción real: a ellos sí se los asigna a categorías puntuales, elegidas
a mano, porque su trabajo es con equipos específicos, no con el club/deporte
entero.

| Rol | Alcance | ¿Se elige a mano? | Cómo se calcula |
|---|---|---|---|
| **Dueño** | Toda la plataforma — todos los clubes, todos los deportes | No | Bypass total, no depende de memberships |
| **Admin de club** | Todo el club: todos los deportes habilitados, todas las categorías, presentes y futuras | No | Dinámico: todos los `teams` con ese `clubId` |
| **Coordinador** | Todo su deporte dentro del club: todas las categorías de ese deporte, presentes y futuras | No | Dinámico: todos los `teams` con ese `clubId` + `sportId` |
| **Entrenador / Preparador físico** | Solo las categorías puntuales asignadas | **Sí** | Lista fija (`categoryIds` en la membership) |
| **Personal Trainer** | Sus propias categorías independientes (`ownerUid`) | No aplica | No depende de ningún club |

### Implicancia técnica concreta

Para Admin de club y Coordinador, el acceso NO se guarda como una lista de
`categoryIds` — se calcula en el momento, consultando qué categorías existen
ahora mismo para ese club (o club+deporte). Guardar una lista fija ahí
reproduce el bug de "no ve las categorías nuevas".

En la práctica:

- El formulario de crear/editar cuenta no debería mostrar ningún checklist de
  categorías cuando el rol elegido es Admin de club o Coordinador — no
  aplica, el acceso es automático a todo. El checklist de categorías solo
  tiene sentido para Entrenador y Preparador físico.
- Cualquier lugar de la app que decida qué categorías puede operar un usuario
  (selector de categoría al entrar, `loadTeamsForUser()`, panel de
  Administración, listado de "mis categorías", etc.) tiene que, para rol
  admin/coordinador, ignorar `categoryIds` de la membership y en su lugar
  consultar directamente: "todos los `teams` de este `clubId`" (Admin de club)
  o "todos los `teams` de este `clubId` + `sportId`" (Coordinador).
- El límite de categorías (`maxCategories`/`sportLimits`) sigue existiendo
  igual que hoy — eso no cambia, es el número que el Dueño pactó por deporte al
  vender. Lo que cambia es que Admin de club y Coordinador ven todo lo que
  existe dentro de ese límite, no una selección parcial de eso.
