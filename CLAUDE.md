# CLAUDE.md — Panel de Entrenadores

Instrucciones esenciales para trabajar en este proyecto. Para contexto completo, ver `docs/` (referenciado abajo, no lo repitas de memoria si podés leerlo).

## Qué es esto
App web SaaS de gestión para entrenadores y clubes deportivos (hoy: un club de básquet). Contexto completo → `docs/PROJECT_CONTEXT.md`.

## Cómo trabajar sobre el código
- **Un solo archivo HTML** (`index.html` o similar, ver `docs/ARCHITECTURE.md` para el nombre real). JS vanilla, sin build step. Editalo directamente, no crees versiones paralelas.
- **Cambios incrementales y verificables.** No reescribas secciones grandes de una sola vez si un cambio chico alcanza.
- **Nunca borres funcionalidad existente** sin que se pida explícitamente.
- **Antes de un cambio grande**: leé `docs/ARCHITECTURE.md` y `docs/DATABASE.md`, entendé el impacto, explicá el plan antes de tocar código.
- **Firebase / reglas de seguridad / estructura de datos / autenticación**: nunca los toques sin analizar primero el impacto y explicarlo. Las reglas de Firestore siempre se comparten en **texto plano y completas** (todo el archivo, no un fragmento) antes de publicarse — nunca asumas que ya se publicaron.
- **Reutilizá componentes y patrones existentes** en vez de inventar uno nuevo cada vez (ver `docs/UI_UX.md` para los componentes ya disponibles).
- **No dupliques código.** Si vas a declarar una función, verificá que no exista ya una con ese nombre (`grep -n "function nombreFuncion("`) — este proyecto ya tuvo bugs por funciones duplicadas donde la última pisaba silenciosamente a la primera.
- **Mantené la consistencia visual** — mismo Design System en toda la app, ver `docs/UI_UX.md`.
- **Si una tarea no está clara**, analizá el proyecto primero (leé el código relevante) y explicá qué vas a modificar antes de escribir nada.
- **Probá mobile y desktop.** La mayoría de los usuarios entra desde el celular.

## Antes de dar por terminado un cambio
1. Verificá sintaxis JS válida (no debe haber `function` duplicadas, ni referencias a IDs de HTML que no existan).
2. Verificá que los `<div>` y demás tags queden balanceados si tocaste HTML.
3. Confirmá que no rompiste ningún flujo existente (login, cambio de categoría, guardado).
4. Si cambiaste el modelo de datos, avisá explícitamente qué reglas de Firestore hay que republicar y compartilas completas.

## Dónde está cada cosa
- `docs/PROJECT_CONTEXT.md` — qué es la app, para quién, qué problema resuelve, roles, funcionalidades.
- `docs/ARCHITECTURE.md` — stack técnico, cómo está armado el archivo.
- `docs/DATABASE.md` — colecciones de Firestore, campos, reglas.
- `docs/FEATURES.md` — qué existe, qué está a medias, qué está planificado.
- `docs/UI_UX.md` — Design System, componentes, reglas visuales.
- `docs/DEVELOPMENT.md` — cómo levantar/probar/versionar el proyecto.

No repitas en el chat contenido que ya está en estos archivos — leelos cuando los necesites en vez de pedir que te los expliquen de nuevo.
