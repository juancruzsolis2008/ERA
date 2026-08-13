// ============ Autenticación, ensureUserDoc, roles, carga de equipos. ============
import { renderAdminTeams, renderUsersAdmin } from './administracion.js';
import { preloadAllTeamSchedules, refreshMyEvents, renderCalendar } from './calendario.js';
import { auth, db } from './firebase-config.js';
import { renderDashboard } from './inicio.js';
import { loadTeamData } from './main-app.js';
import { escapeHtml, fail, state } from './state.js';

  export function ensureUserDoc(user){
    var ref = db.collection('users').doc(user.uid);
    return ref.get().then(function(snap){
      if(snap.exists){
        state.role = snap.data().role || 'coach';
        return;
      }
      // Ya no hay auto-alta: las cuentas las crea únicamente el admin desde
      // el panel. Si llegamos acá, la cuenta existe en Auth pero todavía no
      // tiene perfil en Firestore (ej. la creó el admin y algo falló a mitad
      // de camino). Avisamos y cerramos sesión en vez de fallar en silencio.
      return auth.signOut().then(function(){
        // loginError solo existe en index.html; si ensureUserDoc se llama desde
        // app.html (sesión que dejó de tener perfil válido), no hay dónde mostrar
        // el mensaje acá: igual se cierra sesión y bindEventsOnce/onAuthStateChanged
        // redirige a index.html.
        var errEl = document.getElementById('loginError');
        if(errEl){
          errEl.textContent = 'Tu cuenta no tiene un perfil habilitado todavía. Pedile al admin que te dé de alta.';
          errEl.style.display = 'block';
        }
        return Promise.reject(new Error('sin-perfil'));
      });
    });
  }

  export function roleFlags(){
    var role = state.role;
    var isAdmin = role === 'admin';
    var isFisico = role === 'fisico';
    var isPersonal = role === 'personal';
    var isCoach = !isAdmin && !isFisico && !isPersonal; // 'coach' (y cualquier valor por defecto)
    return {
      isAdmin: isAdmin, isFisico: isFisico, isPersonal: isPersonal, isCoach: isCoach,
      hasPlanificacion: isAdmin || isCoach,
      hasEstadisticas:  isAdmin || isCoach,
      hasPizarra:       isAdmin || isCoach || isPersonal,
      hasObjetivos:     isAdmin || isCoach || isPersonal,
      hasConvocados:    isAdmin || isCoach,
      hasRutinas:       isAdmin || isFisico || isPersonal,
      hasEvolucion:     isAdmin || isFisico || isPersonal,
      hasAsistenciaPelota: isAdmin || isCoach,
      canShareTeam:     isAdmin || isCoach, // compartir código de categoría: solo admin/coach
      canRemovePlayers: isAdmin || isCoach || isPersonal, // quitar jugadores: también personal trainer
      canAddPlayers:    isAdmin || isCoach || isPersonal // cargar jugadores nuevos: también personal trainer
    };
  }

  export function applyRoleVisibility(){
    var f = roleFlags();
    document.getElementById('adminTabBtn').style.display = f.isAdmin ? '' : 'none';
    document.querySelector('[data-tab="pizarra"]').style.display = f.hasPizarra ? '' : 'none';
    document.querySelector('[data-tab="objetivos"]').style.display = f.hasObjetivos ? '' : 'none';
    document.querySelector('[data-tab="planificacion"]').style.display = f.hasPlanificacion ? '' : 'none';
    document.querySelector('[data-tab="rutinas"]').style.display = f.hasRutinas ? '' : 'none';
    document.querySelector('[data-tab="evolucion"]').style.display = f.hasEvolucion ? '' : 'none';
    document.querySelector('[data-tab="convocados"]').style.display = f.hasConvocados ? '' : 'none';
    document.querySelector('[data-tab="estadisticas"]').style.display = f.hasEstadisticas ? '' : 'none';
    document.getElementById('kindSection-pelota').style.display = f.hasAsistenciaPelota ? '' : 'none';
    document.getElementById('addPlayerRowInfo').style.display = f.canAddPlayers ? '' : 'none';
    document.getElementById('shareTeamBtn').style.display = f.canShareTeam ? '' : 'none';
  }

  export function loadTeamsForUser(){
    var q = state.role === 'admin'
      ? db.collection('teams')
      : db.collection('teams').where('members','array-contains', state.user.uid);
    return q.get().then(function(snap){
      state.teams = snap.docs.map(function(d){
        var data = d.data();
        return { id: d.id, name: data.name, members: data.members||[], clubId: data.clubId||null, sportId: data.sportId||null, logoUrl: data.logoUrl||null };
      });
      renderTeamSelect();
      console.log('loadTeamsForUser: role=', state.role, 'uid=', state.user.uid, 'teams found=', state.teams.length);
      var debugLine = document.getElementById('debugDiag');
      if(debugLine){
        debugLine.innerHTML = 'Rol: <strong>'+escapeHtml(state.role)+'</strong> · UID: <code style="user-select:all;">'+state.user.uid+'</code> · Categorías encontradas: <strong>'+state.teams.length+'</strong>'
          + (state.teams.length ? (' → '+state.teams.map(function(t){return escapeHtml(t.name)+' ('+t.id+')';}).join(', ')) : '');
      }
      if(state.teams.length === 0){
        var noTeamMsg = '<span class="helper-text">Todavía no tenés categorías asignadas. Pedile al admin que te dé acceso desde la pestaña de Administración.<br><br>Tu identificador de cuenta (UID) es:<br><code style="user-select:all;word-break:break-all;">'+state.user.uid+'</code><br>Comparalo con lo que aparece en Firestore → teams → esa categoría → members.</span>';
        document.getElementById('rosterList').innerHTML = noTeamMsg;
        document.getElementById('centralGoalsBox').innerHTML = '<div class="central-goals-empty">Todavía no tenés categorías asignadas. Pedile al admin que te dé acceso.<br><br>UID: <code style="user-select:all;word-break:break-all;">'+state.user.uid+'</code></div>';
        if(state.role === 'admin'){ renderAdminTeams(); renderUsersAdmin(); }
        return;
      }
      if(!state.currentTeamId || !state.teams.find(function(t){return t.id===state.currentTeamId;})){
        state.currentTeamId = state.teams[0].id;
      }
      return Promise.all([
        loadTeamData(state.currentTeamId),
        preloadAllTeamSchedules(),
        refreshMyEvents()
      ]).then(function(){
        renderDashboard(); renderCalendar();
        if(state.role === 'admin') return Promise.all([renderAdminTeams(), renderUsersAdmin()]);
      });
    }).catch(function(e){
      console.error('loadTeamsForUser error:', e);
      var errMsg = 'Error cargando categorías: ['+escapeHtml(e.code||'sin código')+'] '+escapeHtml(e.message||String(e));
      document.getElementById('rosterList').innerHTML = '<span class="helper-text">'+errMsg+'</span>';
      var debugLine2 = document.getElementById('debugDiag');
      if(debugLine2){ debugLine2.innerHTML = '<strong style="color:#D64545;">'+errMsg+'</strong>'; }
      fail(e);
    });
  }

  export function renderTeamSelect(){
    var sel = document.getElementById('teamSelect');
    sel.innerHTML = '';
    state.teams.forEach(function(t){
      var opt = document.createElement('option');
      opt.value = t.id; opt.textContent = t.name;
      if(t.id === state.currentTeamId) opt.selected = true;
      sel.appendChild(opt);
    });
  }
