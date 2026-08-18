# ERAM — Contexto del proyecto

Plataforma de gestión de entrenamientos deportivos. Evolucionando de una app de
básquet para un solo club (Once Unidos) a un SaaS multi-club y multi-deporte.

Este archivo lo leen automáticamente Claude Code y Google Antigravity (cuando usa
un modelo Claude) al abrir este repo. Mantenerlo actualizado evita que cualquiera
de las dos herramientas reinvente decisiones ya tomadas.

## Stack — no cambiar sin razón explícita

- HTML + CSS + JavaScript Vanilla. Sin frameworks nuevos salvo necesidad real.
- En transición de un solo archivo (ES5) a dos páginas (`index.html` + `app.html`)
  con **ES modules nativos**, sin bundler ni build step.
- Firebase Authentication + Cloud Firestore.
- Cloudinary para imágenes (unsigned upload preset — nunca exponer API secret en
  el cliente, no hay backend propio).
- Deploy como sitio estático en **GitHub Pages** (reemplazó a Netlify).

## Design system — único en toda la app

- Tipografía: Inter (texto) + Inter Tight (títulos/display).
- Color primario de marca: `#4A7FC9` (azul acero, rebrand ERAM — no es el verde
  de versiones viejas del proyecto).
- Sidebar oscura, cards con `border-radius` ~12–18px, sombras suaves, badges por
  estado (verde/ámbar/rojo/neutro), componentes reutilizados: `row-flex`,
  `tab-pills`, `progress-track`, `mini-card`.
- Inspiración: Apple HIG, Apple Sports, Notion, Linear, Hudl, Material Design 3.
  Tiene que sentirse software profesional, no una página web.
- Antes de crear un componente visual nuevo, reusar uno existente.

## Arquitectura multi-club / multi-deporte

Jerarquía de roles: `Dueño (isOwner:true, global) → Admin de club → Coordinador
(acotado a un deporte dentro del club) → Entrenador / Preparador físico`, más
`Personal Trainer` como cuenta independiente (`ownerUid`-based, sin club).

**Alcance por rol — ver `modelo-negocio-alcance-roles.md` en esta misma carpeta
(fuente de verdad, no reinterpretar).** Resumen: Admin de club/Coordinador
tienen acceso DINÁMICO a todo su club/deporte (nunca una lista guardada);
Entrenador/Preparador físico sí tienen `categoryIds` fijo, elegido a mano.

Firestore (colecciones planas):
- `clubs/{clubId}` — enabledSports, sportLimits (maxCategories por deporte)
- `teams/{teamId}` — clubId, sportId, ownerUid
- `users/{uid}` — isOwner + subcolección `/memberships/{clubId}`
- `sportsCatalog/{sportId}` — catálogo global de deportes, solo editable por el Dueño

**Cancha de la Pizarra táctica y posiciones de jugador: YA varían por deporte**
(`js/sport-profiles.js`, `sportsCatalog/{sportId}.courtType`) — básquet, fútbol y
vóley construidos; sin `courtType` seteado cae a básquet. Lo que sigue sin variar
por deporte: las FICHAS de la Pizarra (atacante/defensor/pelota/cono/etc.) son las
mismas para todos — no hay "fichas de fútbol" distintas todavía. Si se pide sumar
un deporte nuevo o diferenciar fichas por deporte, seguir extendiendo
`sport-profiles.js`, no reescribir desde cero.

## Reglas de trabajo

- Nunca eliminar funcionalidad existente salvo que sea absolutamente necesario.
- Analizar la estructura existente antes de implementar cualquier cambio importante.
- No renombrar funciones/variables/estructuras sin un motivo claro.
- No duplicar código — reusar antes de crear.
- Verificar que todo funcione en escritorio y en mobile.
- Cambios chicos y verificables. Avisar cuándo hay que republicar reglas de
  Firestore, y mandarlas siempre en texto plano además del archivo.

## Errores ya conocidos — no repetirlos

- **No recrear el logo ni ningún asset de imagen como SVG generado** — usar los
  archivos existentes tal cual están. Tendencia recurrente a "recrear" en vez de
  preservar.
- **Coordenadas en canvas/SVG**: mezclar unidades de `viewBox` con escalas en
  porcentaje genera bugs de posición. Especificar la unidad explícitamente antes
  de tocar cualquier cosa relacionada a la Pizarra o a canvas.
- **Firestore rechaza arrays anidados** (`[[x,y],...]`) — usar array de objetos
  (`{x,y}`) en su lugar, con lectura retrocompatible si hace falta.
- **CSS de overlays/lightbox**: `display:flex` le gana al `display:none`
  implícito de `hidden` — siempre agregar la regla explícita
  `[hidden]{display:none}` en overlays nuevos.
- Evaluaciones físicas necesitan la ficha del jugador disponible en el momento de
  evaluar (para métricas derivadas como potencia de salto vía fórmula de Sayers,
  que usa el peso de la ficha).

## Contacto / marca

`eram.app.contacto@gmail.com`
