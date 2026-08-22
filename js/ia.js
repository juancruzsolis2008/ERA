// ============ Director Técnico IA (placeholder — Etapa: pestaña sin lógica real todavía). ============
// Acceso controlado por users/{uid}.features.aiAssistant (o isOwner), ver
// roleFlags()/applyRoleVisibility() en auth.js y el toggle en Plataforma
// (js/plataforma.js, refreshAiAccessList()). Este módulo todavía no hace
// nada — existe para no tener que reestructurar cuando se sume la lógica
// real de IA (prompt aparte).

export function renderIaTab(){
  // Sin contenido dinámico por ahora — el placeholder ya vive fijo en
  // app.html (#tab-ia). Se deja esta función exportada para no tener que
  // tocar main-app.js otra vez cuando haya algo que renderizar acá.
}
