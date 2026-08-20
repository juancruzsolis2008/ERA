// ============ Autenticación, ensureUserDoc, roles, carga de equipos. ============
import { renderAdminPanelForRole, renderAdminTeams, renderPtAdminPanel, renderUsersAdmin } from './administracion.js';
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
        state.displayName = snap.data().displayName || null;
        state.isOwner = !!snap.data().isOwner;
        state.isPersonalTrainer = !!snap.data().isPersonalTrainer;
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
    // isPersonal: independiente de role — una cuenta puede ser PT (jugadores
    // propios) Y tener un rol real de club (role pasa a 'coach'/'fisico' al
    // dárselo) al mismo tiempo, sin perder ninguno de los dos. role==='personal'
    // sigue funcionando para cuentas viejas que nunca tuvieron isPersonalTrainer
    // seteado explícitamente.
    var isPersonal = !!state.isPersonalTrainer || role === 'personal';
    var isCoach = !isAdmin && !isFisico && role !== 'personal'; // 'coach' (y cualquier valor por defecto) — no se excluye por isPersonal, son aditivos
    var clubMembership = isAdmin ? null : currentClubMembership();
    var isClubAdmin = !!(clubMembership && clubMembership.role === 'admin'); // Admin de club, no-Dueño
    var isCoordinador = !!(clubMembership && clubMembership.role === 'coordinador');
    return {
      isAdmin: isAdmin, isFisico: isFisico, isPersonal: isPersonal, isCoach: isCoach,
      isClubAdmin: isClubAdmin, isCoordinador: isCoordinador, isOwner: !!state.isOwner,
      // Administración es visible para el admin legacy y para Admin de club/
      // Coordinador (versión acotada a su club/deporte). Un Personal Trainer
      // NO la ve — su "Agregar jugador" vive en la pestaña Jugadores, no acá.
      hasAdminTab: isAdmin || isClubAdmin || isCoordinador,
      hasPlanificacion: isAdmin || isCoach,
      hasEstadisticas:  isAdmin || isCoach,
      hasPizarra:       isAdmin || isCoach || isPersonal,
      hasObjetivos:     isAdmin || isCoach || isPersonal,
      hasConvocados:    isAdmin || isCoach,
      // Admin de club/Coordinador ven estas dos pestañas también, aunque no
      // sean 'fisico' — Admin de club en TODO su club (isClubAdmin ya es
      // club-wide, sin depender del deporte de la categoría actual);
      // Coordinador solo en SU deporte (clubMembership ya viene acotado a la
      // categoría actual vía currentClubMembership(), así que si es
      // coordinador de otro deporte o solo entrenador acá, no la ve). Rutinas
      // sigue siendo la biblioteca PERSONAL de quien mira (users/{uid}/routines,
      // ver DATABASE.md) — no ven las rutinas de otros preparadores físicos,
      // arman las suyas propias, igual que la Biblioteca de Pizarra.
      hasRutinas:       isAdmin || isFisico || isPersonal || isClubAdmin || isCoordinador,
      hasEvolucion:     isAdmin || isFisico || isPersonal || isClubAdmin || isCoordinador,
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
    // "Agregar jugador" de Personal Trainer vive en la pestaña Jugadores, no
    // en Administración (que un PT puro ni siquiera ve, ver hasAdminTab).
    var ptPanel = document.getElementById('adminPersonalPanel');
    if(ptPanel){
      ptPanel.style.display = f.isPersonal ? '' : 'none';
      if(f.isPersonal) renderPtAdminPanel();
    }
    document.querySelector('[data-tab="pizarra"]').style.display = f.hasPizarra ? '' : 'none';
    document.querySelector('[data-tab="objetivos"]').style.display = f.hasObjetivos ? '' : 'none';
    document.querySelector('[data-tab="planificacion"]').style.display = f.hasPlanificacion ? '' : 'none';
    document.querySelector('[data-tab="rutinas"]').style.display = f.hasRutinas ? '' : 'none';
    document.querySelector('[data-tab="evolucion"]').style.display = f.hasEvolucion ? '' : 'none';
    document.querySelector('[data-tab="convocados"]').style.display = f.hasConvocados ? '' : 'none';
    document.querySelector('[data-tab="estadisticas"]').style.display = f.hasEstadisticas ? '' : 'none';
    document.getElementById('kindSection-pelota').style.display = f.hasAsistenciaPelota ? '' : 'none';
    // Un jugador de mini-club (clubId null, categoría = 1 solo jugador) ya
    // queda cargado al crear la categoría desde "Agregar jugador" arriba —
    // el widget viejo de agregar/importar jugadores AL PLANTEL no aplica ahí
    // (no hay "plantel", es un jugador solo). Se oculta según la categoría
    // actual, no según el rol — un PT que también opera un club real sigue
    // viendo este widget normal dentro de las categorías de ESE club.
    var teamNow = currentTeam();
    var isMiniClubTeam = !!(teamNow && teamNow.clubId == null);
    document.getElementById('addPlayerRowInfo').style.display = (f.canAddPlayers && !isMiniClubTeam) ? '' : 'none';
    var otherTeamsWrap = document.getElementById('addPlayerOtherTeams');
    if(otherTeamsWrap) otherTeamsWrap.style.display = isMiniClubTeam ? 'none' : '';
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
      // Cuenta PT-y-también-Admin de club/Coordinador a la vez: la rama de
      // members array-contains (abajo) ya incluiría sus propios jugadores,
      // pero esta rama no — sumarlos también, si no desaparecen del selector.
      if(state.isPersonalTrainer){
        queries.push(db.collection('teams').where('ownerUid','==', state.user.uid).get());
      }
    } else {
      queries = [db.collection('teams').where('members','array-contains', state.user.uid).get()];
    }
    return Promise.all(queries).then(function(snaps){
      var seen = {}, docs = [];
      snaps.forEach(function(snap){ snap.docs.forEach(function(d){ if(!seen[d.id]){ seen[d.id] = true; docs.push(d); } }); });
      state.teams = docs.map(function(d){
        var data = d.data();
        return { id: d.id, name: data.name, members: data.members||[], clubId: data.clubId||null, sportId: data.sportId||null, courtType: data.courtType||null, logoUrl: data.logoUrl||null };
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

  export function renderTeamSelect(){
    var sel = document.getElementById('teamSelect');
    sel.innerHTML = '';
    // Todo separado por club Y deporte: el selector de categorías solo
    // muestra las de currentTeam() (club+deporte actual) — aunque state.teams
    // tenga categorías de otros clubes/deportes (Dueño, o cuenta con
    // memberships en más de uno), acá no se mezclan. Para cambiar de club o
    // deporte hay que usar el botón "Cambiar Club/Deporte" (vuelve al
    // selector post-login), no este dropdown.
    var current = currentTeam();
    var scopedTeams = current
      ? state.teams.filter(function(t){ return t.clubId === current.clubId && t.sportId === current.sportId; })
      : state.teams;
    scopedTeams.forEach(function(t){
      var opt = document.createElement('option');
      opt.value = t.id; opt.textContent = t.name;
      if(t.id === state.currentTeamId) opt.selected = true;
      sel.appendChild(opt);
    });
  }
