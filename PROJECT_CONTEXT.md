# Contexto del proyecto — Panel de Entrenadores

## Objetivo de la aplicación
Plataforma de gestión integral para un club deportivo: centraliza asistencia, planificación de entrenamientos, biblioteca de jugadas tácticas, rutinas físicas, evaluación y seguimiento del rendimiento físico, estadísticas de partido, convocatorias, comunicación interna (foro) y administración de usuarios/categorías, en un solo lugar en vez de repartido entre WhatsApp, Excel y papel.

## Público objetivo
- **Entrenadores** de las distintas categorías del club.
- **Preparadores físicos.**
- **Personal trainers** (rol más acotado que preparador físico, ver más abajo).
- **Administrador del club** (hoy: el dueño del proyecto).
- Pensado para **celular en primer lugar** — la mayoría del uso real es desde el teléfono, cargando datos entre entrenamientos o durante el partido.

## Problema que resuelve
Antes de esta app, la información de un club de básquet vive dispersa: planillas de asistencia en papel o Excel, jugadas dibujadas a mano o en fotos sueltas, rutinas en PDFs sin versionar, convocatorias armadas a mano en WhatsApp cada semana, sin ficha unificada de jugador ni forma de ver su evolución física en el tiempo. La app junta todo eso, con permisos claros por rol y compartiendo lo que corresponde compartir entre entrenadores de una misma categoría (o entre categorías, cuando aplica).

## Público/alcance actual (importante)
Hoy la app sirve a **un solo club** (Once Unidos, básquet, Mar del Plata). Hay una discusión de diseño en curso para evolucionar hacia una plataforma multi-club y multi-deporte (nombre en danza: "ERA") — **todavía no implementada**. Ver `FEATURES.md` → sección "Planificadas" para el detalle de esa visión. Este documento describe la app **tal como existe hoy**.

## Roles y estructura de usuarios
Cuatro roles, todos definidos en un único punto del código (función `roleFlags()`, ver `ARCHITECTURE.md`):

| Rol | Quién es |
|---|---|
| `admin` | Dueño/administrador del club. Acceso total. |
| `coach` ("Entrenador") | Entrenador de una o más categorías. |
| `fisico` ("Preparador físico") | Trabaja la parte física, sin acceso a planificación táctica ni convocatorias. |
| `personal` ("Personal Trainer") | Rol más nuevo, similar a `fisico` pero con acceso adicional a Biblioteca, Convocados* y gestión de jugadores (*confirmar estado exacto en `DATABASE.md`/código, esto se ajustó varias veces). |

No hay auto-registro: **solo el admin crea cuentas**, desde Administración.

Un usuario puede tener acceso a **varias categorías** dentro del club (ej. un entrenador que dirige U15 y U17). El acceso a categorías se administra desde el panel de Administración (tildes por categoría, y de a un jugador también se puede sumar a varias categorías a la vez desde Jugadores).

## Clubes / Deportes / Equipos / Categorías (estado actual)
- Hoy existe **un solo club** implícito (no hay una entidad "club" en los datos todavía) y **un solo deporte** (básquet).
- La unidad organizativa real en los datos es **`teams`** = "categoría" (ej. U13, U15, U17, Primera) — no confundir con "equipo deportivo" en el sentido amplio, en este proyecto "categoría" y `team` son sinónimos.
- Cada categoría tiene: un plantel de jugadores (roster), su propia asistencia, planificación, convocatorias, evolución/evaluaciones y estadísticas — todo separado por categoría.
- La **ficha de cada jugador** (DNI, fecha de nacimiento, altura, peso, foto) es compartida entre categorías del mismo club (para jugadores que juegan en más de una categoría), aunque el plantel y la asistencia de cada categoría siguen siendo independientes entre sí. Ver `DATABASE.md`.

## Funcionalidades actuales (resumen — detalle técnico en DATABASE.md, lista completa en FEATURES.md)

- **Inicio**: dashboard con resumen del día, accesos rápidos y tarjetas según rol.
- **Calendario**: 100% individual por usuario (no se comparte entre entrenadores), con lectura superpuesta de clases/partidos según el rol.
- **Asistencia**: carga separada de asistencia "pelota" (técnica) y "físico", con resumen grupal y por jugador (incluye comparativas y estrellas de valoración).
- **Jugadores**: alta manual o por import de Excel/CSV/PDF, ficha compartida entre categorías, alta de un jugador en varias categorías a la vez.
- **Biblioteca**: pizarra táctica (dibujo de jugadas con fichas de jugadores/defensores/pelota/elementos de entrenamiento), biblioteca personal y biblioteca pública (compartida entre entrenadores del club), con export a PDF.
- **Planificación de clases**: por categoría, actividades manuales o traídas de biblioteca (personal o pública).
- **Rutinas físicas**: estructura Día → Bloque → Ejercicio, hoy personales de cada preparador/personal trainer (reusables entre categorías) — **en discusión pasar a ser por categoría**, ver `FEATURES.md`.
- **Evaluaciones Físicas** (antes "Evolución"): sistema de evaluación física con biblioteca de ~45 tests precargados (fuerza, salto, velocidad, agilidad, resistencia, antropometría, movilidad, básquet), tests personalizados, historial con gráficos y comparación, informe en PDF.
- **Estadísticas**: registro de estadísticas de partido por jugador.
- **Convocados**: armado de convocatoria a partido + mensaje listo para WhatsApp.
- **Objetivos**: notas libres tipo checklist por categoría, con objetivos centrales destacados en Inicio.
- **Foro**: un solo canal para todo el club, con adjuntos de imagen y PDF.
- **Administración**: creación de categorías, cuentas de usuario, gestión de accesos y roles.
- **Apariencia**: tema claro/oscuro/automático, por usuario.

## Fuera de alcance / decisiones deliberadas
- No hay backend propio — todo corre contra Firebase directo desde el cliente.
- No se usa Firebase Storage (el club no activó el plan pago) — todas las fotos/adjuntos van a Cloudinary.
- La identidad de un jugador es su **nombre exacto como string** (no hay ID de jugador separado). Si se lo quita del plantel y se vuelve a cargar con el mismo nombre, recupera su ficha e historial automáticamente. Esta es una decisión de diseño deliberada, no un bug.
