// ============ Identidad visual por club: colores, logo, nombre (Etapa 4). ============
import { db } from './firebase-config.js';
import { escapeAttr, escapeHtml, resolveTheme, state } from './state.js';

  // Nombres de club.theme.{light|dark} (ver DATABASE.md) -> variables CSS reales
  // ya definidas en css/styles.css. Cada key es opcional: si el club no la
  // definió, se limpia el override inline y el valor vuelve al default de la
  // app (claro/oscuro). bgPanel/bgPanelRaised quedan afuera a propósito — no
  // son parte de esta funcionalidad, siempre en su valor fijo del CSS.
  var THEME_VAR_MAP = {
    accentHardwood: '--accent-hardwood',
    accentScoreboard: '--accent-scoreboard',
    bgCourt: '--bg-court',
    lineChalk: '--line-chalk'
  };

  // Recibe el sub-objeto de UN modo (club.theme.light o club.theme.dark), no el
  // theme completo — quien llama ya resolvió cuál corresponde (ver
  // applyClubPaletteForCurrentMode()). modeTheme puede venir undefined/vacío:
  // cada key ausente hace removeProperty, mismo efecto que "sin paleta de club".
  export function applyClubThemeVars(modeTheme){
    Object.keys(THEME_VAR_MAP).forEach(function(key){
      var cssVar = THEME_VAR_MAP[key];
      if(modeTheme && modeTheme[key]){
        document.documentElement.style.setProperty(cssVar, modeTheme[key]);
      } else {
        document.documentElement.style.removeProperty(cssVar);
      }
    });
  }

  // Punto único de aplicación/re-aplicación de la paleta de club — se llama al
  // cargar el club (applyClubBranding) y de nuevo cada vez que se re-ejecuta
  // applyTheme() (toggle claro/oscuro/automático en caliente, ver apariencia.js).
  // Gate: si useClubPalette está apagado, ni mira club.theme — limpia cualquier
  // override y listo (queda el default de ERAM). Si está prendido pero el club
  // no definió paleta para el modo actual, applyClubThemeVars ya hace el mismo
  // fallback silencioso key por key (sin setProperty con valores undefined).
  export function applyClubPaletteForCurrentMode(){
    if(!state.useClubPalette){ applyClubThemeVars(null); return; }
    var mode = resolveTheme(state.themePref);
    var clubTheme = state.currentClub && state.currentClub.theme;
    applyClubThemeVars(clubTheme && clubTheme[mode]);
  }

  // club===null/undefined: sin clubId todavía (migración de la Etapa 3 sin
  // correr) o categoría de Personal Trainer (mini-club, sin club real). En
  // ese caso fallbackName es el nombre de la propia categoría (el jugador,
  // para un PT) — antes caía siempre a un "Once Unidos" hardcodeado, quedaba
  // mal para cualquier cuenta que no fuera ese club en particular.
  export function applyClubBranding(club, fallbackName){
    var name = (club && club.name) || fallbackName || 'ERAM';
    var brandEl = document.getElementById('brandClub');
    if(brandEl){
      brandEl.innerHTML = (club && club.logoUrl)
        ? '<img src="'+escapeAttr(club.logoUrl)+'" class="club-logo-img" alt="">' + escapeHtml(name)
        : '🏀 ' + escapeHtml(name);
    }
    var eyebrowEl = document.getElementById('dashEyebrow');
    if(eyebrowEl) eyebrowEl.textContent = name;
    document.title = name + ' · ERAM';
    state.currentClub = club || null; // cache para applyClubPaletteForCurrentMode() en cada toggle de tema
    applyClubPaletteForCurrentMode();
  }

  // Valores default de ERAM (mismos que css/styles.css :root / [data-theme="dark"])
  // — usados para precargar el editor de paleta cuando el club todavía no tiene
  // una propia, así el Admin edita desde una base conocida, no un form en blanco.
  export var DEFAULT_ERAM_PALETTE = {
    light: { bgCourt: '#F7F9F7', accentHardwood: '#2D5FA0', accentScoreboard: '#4A7FC9', lineChalk: '#10160F' },
    dark:  { bgCourt: '#0A0F0C', accentHardwood: '#4A7FC9', accentScoreboard: '#6FA0E0', lineChalk: '#EDF2EE' }
  };

  // Guarda SOLO el modo indicado (merge parcial) — no toca el otro modo del club.
  export function saveClubTheme(clubId, mode, colors){
    var patch = {};
    patch[mode] = colors;
    return db.collection('clubs').doc(clubId).set({ theme: patch }, { merge: true });
  }

  export function loadAndApplyClubForTeam(teamId){
    var team = state.teams.find(function(t){ return t.id === teamId; });
    if(!team || !team.clubId){
      applyClubBranding(null, team && team.name);
      return Promise.resolve();
    }
    return db.collection('clubs').doc(team.clubId).get().then(function(snap){
      applyClubBranding(snap.exists ? snap.data() : null, team.name);
    }).catch(function(){
      applyClubBranding(null, team.name);
    });
  }
