// ============ Autenticación, ensureUserDoc, roles, carga de equipos. ============
import { renderAdminPanelForRole, renderAdminTeams, renderUsersAdmin } from './administracion.js';
import { preloadAllTeamSchedules, refreshMyEvents, renderCalendar } from './calendario.js';
import { auth, db } from './firebase-config.js';
import { renderDashboard } from './inicio.js';
import { loadTeamData } from './main-app.js';
import { currentTeam, escapeHtml, fail, state } from './state.js';

  export function ensureUserDoc(user){
    var ref = db.collection('users').doc(user.uid);
    return ref.get().then(function(snap){
      if(snap.exists){
        state.role = snap.data().role || 'coach';
        state.profilePhotoUrl = snap.data().photoUrl || null;
        state.isOwner = !!snap.data().isOwner;
        return loadMemberships();
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

  // Membresías de la cuenta logueada (Etapa 7) — vacío hasta correr la migración
  // de la Etapa 3, o si la cuenta es Personal Trainer (nunca tiene membership).
  export function loadMemberships(){
    return db.collection('users').doc(state.user.uid).collection('memberships').get().then(function(snap){
      state.memberships = snap.docs.map(function(d){ var m = d.data(); m.id = d.id; return m; });
    }).catch(function(){ state.memberships = []; });
  }

  // Membership de Admin de club o Coordinador PARA LA CATEGORÍA ACTUALMENTE
  // ABIERTA — null si en ESE club/deporte la cuenta no es Admin de club ni
  // Coordinador (ej. ahí es Entrenador/Preparador físico, o no tiene ningún
  // rol). El rol de una cuenta se lee POR club/deporte, no globalmente: la
  // misma persona puede ser Admin de club en un club y Entrenador en otro —
  // roleFlags() tiene que reflejar el que corresponde a la categoría que
  // tiene abierta ahora mismo, no "cualquier membership admin/coordinador
  // que tenga en algún lado". El panel de Administración (renderStaffClubSwitcher
  // en administracion.js) NO usa esta función — arma su propia lista de TODAS
  // las memberships admin/coordinador de la cuenta, sin este filtro.
  export function currentClubMembership(){
    var team = currentTeam();
    if(!team || !team.clubId) return null;
    var adminHere = state.memberships.find(function(m){ return m.role === 'admin' && m.clubId === team.clubId; });
    if(adminHere) return adminHere;
    return state.memberships.find(function(m){ return m.role === 'coordinador' && m.clubId === team.clubId && m.sportId === team.sportId; }) || null;
  }

  export function roleFlags(){
    var role = state.role;
    var isAdmin = role === 'admin'; // Dueño o admin global "legacy" — sigue viendo TODO, sin cambios
    var isFisico = role === 'fisico';
    var isPersonal = role === 'personal';
    var isCoach = !isAdmin && !isFisico && !isPersonal; // 'coach' (y cualquier valor por defecto)
    var clubMembership = isAdmin ? null : currentClubMembership();
    var isClubAdmin = !!(clubMembership && clubMembership.role === 'admin'); // Admin de club, no-Dueño
    var isCoordinador = !!(clubMembership && clubMembership.role === 'coordinador');
    return {
      isAdmin: isAdmin, isFisico: isFisico, isPersonal: isPersonal, isCoach: isCoach,
      isClubAdmin: isClubAdmin, isCoordinador: isCoordinador, isOwner: !!state.isOwner,
      // Administración es visible para el admin legacy, para Admin de club/Coordinador
      // (versión acotada a su club/deporte) y para Personal Trainer (mini-panel).
      hasAdminTab: isAdmin || isClubAdmin || isCoordinador || isPersonal,
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
    document.getElementById('adminTabBtn').style.display = f.hasAdminTab ? '' : 'none';
    renderAdminPanelForRole();
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
    // Admin de club/Coordinador: alcance dinámico, no depende de estar en
    // teams.members (ver .agents/rules/modelo-negocio-alcance-roles.md) — se
    // consulta directo por clubId (Admin de club) o clubId+sportId
    // (Coordinador), así que ven las categorías nuevas sin que nadie los
    // tenga que volver a agregar. Entrenador/Preparador físico siguen
    // dependiendo de members, sin cambios.
    // Una cuenta puede ser Admin de club/Coordinador en MÁS de un club a la
    // vez (memberships separadas) — currentClubMembership() solo devuelve la
    // primera, así que acá se arma una query POR CADA membership admin/
    // coordinador y se unen los resultados, no una sola.
    var staffMemberships = state.role === 'admin' ? [] : state.memberships.filter(function(m){ return m.role === 'admin' || m.role === 'coordinador'; });
    var queries;
    if(state.role === 'admin'){
      queries = [db.collection('teams').get()];
    } else if(staffMemberships.length){
      queries = staffMemberships.map(function(m){
        var q = db.collection('teams').where('clubId','==', m.clubId);
        if(m.role === 'coordinador') q = q.where('sportId','==', m.sportId);
        return q.get();
      });
    } else {
      queries = [db.collection('teams').where('members','array-contains', state.user.uid).get()];
    }
    return Promise.all(queries).then(function(snaps){
      var seen = {}, docs = [];
      snaps.forEach(function(snap){ snap.docs.forEach(function(d){ if(!seen[d.id]){ seen[d.id] = true; docs.push(d); } }); });
      state.teams = docs.map(function(d){
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
        renderAdminPanelForRole(); // Coordinador/Admin de club/Personal Trainer sin categorías todavía igual necesitan ver su panel para crear la primera
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

  function uniqTeamClubIds(teams){
    var seen = {}, out = [];
    teams.forEach(function(t){ var k = t.clubId || '__sinclub'; if(!seen[k]){ seen[k] = true; out.push(k); } });
    return out;
  }

  export function renderTeamSelect(){
    var sel = document.getElementById('teamSelect');
    sel.innerHTML = '';
    // El Dueño ve categorías de TODOS los clubes/deportes acá (loadTeamsForUser
    // le trae todo por tener role==='admin'). Un Admin de club/Coordinador con
    // memberships en MÁS de un club también puede terminar con categorías de
    // varios clubes en state.teams (ver loadTeamsForUser). En ambos casos, sin
    // agrupar, una lista plana de nombres es imposible de leer — se agrupa por
    // club (<optgroup>) con "Deporte · Categoría" como texto. Si solo hay un
    // club (el caso normal de casi todas las cuentas), sigue siendo la lista
    // plana de siempre, sin el fetch extra de clubs/sportsCatalog.
    var distinctClubIds = uniqTeamClubIds(state.teams);
    if(distinctClubIds.length <= 1){
      state.teams.forEach(function(t){
        var opt = document.createElement('option');
        opt.value = t.id; opt.textContent = t.name;
        if(t.id === state.currentTeamId) opt.selected = true;
        sel.appendChild(opt);
      });
      return;
    }
    return Promise.all([db.collection('clubs').get(), db.collection('sportsCatalog').get()]).then(function(res){
      var clubsById = {}; res[0].docs.forEach(function(d){ clubsById[d.id] = d.data(); });
      var sportsById = {}; res[1].docs.forEach(function(d){ sportsById[d.id] = d.data(); });
      var byClub = {}, order = [];
      state.teams.forEach(function(t){
        var key = t.clubId || '__sinclub';
        if(!byClub[key]){ byClub[key] = []; order.push(key); }
        byClub[key].push(t);
      });
      order.forEach(function(clubId){
        var group = document.createElement('optgroup');
        group.label = clubId === '__sinclub' ? 'Personal Trainer (sin club)' : ((clubsById[clubId]&&clubsById[clubId].name) || clubId);
        byClub[clubId].forEach(function(t){
          var sportName = (sportsById[t.sportId] && sportsById[t.sportId].name) || t.sportId;
          var opt = document.createElement('option');
          opt.value = t.id;
          opt.textContent = (sportName ? sportName + ' · ' : '') + t.name;
          if(t.id === state.currentTeamId) opt.selected = true;
          group.appendChild(opt);
        });
        sel.appendChild(group);
      });
    }).catch(function(e){ fail(e); });
  }
