# Guía de desarrollo — Panel de Entrenadores

## Cómo iniciar el proyecto
No hay build step. Es un archivo HTML estático con todo embebido (JS, CSS). Para verlo funcionando:
- Abrir el archivo directo en un navegador, **o**
- Servirlo con cualquier servidor estático simple (ej. `npx serve .` o `python3 -m http.server`) — no es obligatorio, pero evita restricciones de `file://` en algunos navegadores.

No hace falta `npm install` ni ningún paso de compilación. Si en algún momento el proyecto suma un build step, **actualizar este archivo**, porque cambia todo el flujo de trabajo.

## Cómo desarrollar localmente
1. Editar el archivo HTML directo.
2. Recargar el navegador para ver los cambios (no hay hot-reload).
3. Para probar contra datos reales, hace falta conexión a internet (Firebase/Cloudinary no tienen modo offline configurado acá) y las credenciales de Firebase ya embebidas en el archivo (proyecto: POR CONFIRMAR — ver `ARCHITECTURE.md`).

## Cómo comprobar cambios antes de darlos por terminados
No hay tests automatizados. Checklist manual mínimo:
1. **Sintaxis JS válida**: no debe haber errores al parsear el `<script>`. Si tenés Node disponible, se puede validar rápido extrayendo el contenido de `<script>...</script>` y corriendo `new Function(codigo)` — si tira excepción, hay un error de sintaxis.
2. **Sin funciones duplicadas**: `grep -c "function nombreFuncion(" archivo.html` debe dar `1` para cada función que tocaste o creaste. Si da 2+, hay una versión vieja que quedó sin borrar y va a ganar la última declaración silenciosamente.
3. **Sin IDs de HTML huérfanos**: todo `getElementById('x')` en el JS debe tener un `id="x"` real en el HTML. Se puede chequear comparando ambas listas con una regex.
4. **HTML balanceado**: si tocaste `<div>`s, contar aperturas vs cierres en la sección que editaste.
5. **Probar el flujo completo a mano**: login → cambiar de categoría → entrar a la pestaña que tocaste → hacer la acción → confirmar que se guardó (recargar y ver que persiste).
6. **Mobile**: revisar que no haya texto cortado ni botones que se salgan de la pantalla (ver reglas en `UI_UX.md`).

## Cómo evitar romper funcionalidades existentes
- Cambios chicos y verificables, no reescrituras grandes de una sola vez.
- Antes de modificar una función que ya existe, leerla entera y entender todos sus llamadores (`grep -n "nombreFuncion("`) antes de cambiar su firma o su comportamiento.
- Si el cambio toca el modelo de datos de Firestore, revisar TODOS los lugares que leen/escriben esa colección, no solo el que motivó el cambio.
- Nunca borrar una funcionalidad porque "parece" no usarse — confirmar primero, y si hay que sacarla, que sea una decisión explícita y comunicada, no un efecto secundario.

## Buenas prácticas específicas de este proyecto
- Reutilizar patrones ya existentes (ver `UI_UX.md` para componentes, `ARCHITECTURE.md` para patrones de código como `roleFlags()`).
- Nombrar funciones y variables de forma consistente con lo que ya existe (español para dominio del negocio — "jugador", "categoría", "rutina" — inglés para lo genérico de programación).
- Comentar el *por qué* de una decisión no obvia (ej. por qué la ficha de jugador es club-wide y no por categoría), no el *qué* (el código ya dice qué hace).
- Cuando una funcionalidad tiene una decisión de diseño deliberada que podría parecer un bug a primera vista (ej. "recuperar historial si se vuelve a cargar el mismo nombre"), dejarlo documentado en un comentario cerca del código, no solo en estos docs.

## Uso de Git
POR CONFIRMAR — Claude Code debe verificar si existe un repositorio Git en la carpeta del proyecto (`git status`) antes de asumir cualquier flujo. Si existe, seguir el historial de commits existente para inferir convenciones (mensajes en español/inglés, granularidad, etc.) antes de proponer un flujo nuevo. Si no existe, sugerir inicializarlo antes de seguir haciendo cambios grandes, para tener un historial recuperable.

## Qué revisar antes de hacer commit (o antes de entregar un cambio, si no se usa Git)
1. Corrida completa del checklist de "Cómo comprobar cambios" de arriba.
2. Si el cambio afecta el modelo de datos de Firestore: ¿hace falta actualizar las reglas de seguridad? Si sí, tenerlas listas en texto plano y completas para compartir antes de publicarlas.
3. ¿El cambio afecta a algún rol en particular? Confirmar que no se rompió el acceso de los demás roles (repasar `roleFlags()`).
4. Mensaje de commit (si aplica) que explique el *qué* y brevemente el *por qué*, no solo "fix" o "update".
