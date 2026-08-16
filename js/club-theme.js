// ============ Identidad visual por club: colores, logo, nombre (Etapa 4). ============
import { db } from './firebase-config.js';
import { escapeAttr, escapeHtml, state } from './state.js';

  // Nombres de club.theme (ver DATABASE.md) -> variables CSS reales ya definidas
  // en css/styles.css. Cada key es opcional: si el club no la definió, se limpia
  // el override inline y el valor vuelve al default de la app (claro/oscuro).
  var THEME_VAR_MAP = {
    accentHardwood: '--accent-hardwood',
    accentScoreboard: '--accent-scoreboard',
    bgCourt: '--bg-court',
    bgPanel: '--bg-panel',
    bgPanelRaised: '--bg-panel-raised'
  };

  export function applyClubThemeVars(theme){
    Object.keys(THEME_VAR_MAP).forEach(function(key){
      var cssVar = THEME_VAR_MAP[key];
      if(theme && theme[key]){
        document.documentElement.style.setProperty(cssVar, theme[key]);
      } else {
        document.documentElement.style.removeProperty(cssVar);
      }
    });
  }

  // club===null/undefined (sin clubId todavía, migración de la Etapa 3 sin correr,
  // o categoría de Personal Trainer sin club) -> mismo branding que se ve hoy.
  export function applyClubBranding(club){
    var name = (club && club.name) || 'Once Unidos';
    var brandEl = document.getElementById('brandClub');
    if(brandEl){
      brandEl.innerHTML = (club && club.logoUrl)
        ? '<img src="'+escapeAttr(club.logoUrl)+'" class="club-logo-img" alt="">' + escapeHtml(name)
        : '🏀 ' + escapeHtml(name);
    }
    var eyebrowEl = document.getElementById('dashEyebrow');
    if(eyebrowEl) eyebrowEl.textContent = name;
    document.title = name + ' · ERAM';
    applyClubThemeVars(club && club.theme);
  }

  export function loadAndApplyClubForTeam(teamId){
    var team = state.teams.find(function(t){ return t.id === teamId; });
    if(!team || !team.clubId){
      applyClubBranding(null);
      return Promise.resolve();
    }
    return db.collection('clubs').doc(team.clubId).get().then(function(snap){
      applyClubBranding(snap.exists ? snap.data() : null);
    }).catch(function(){
      applyClubBranding(null);
    });
  }
