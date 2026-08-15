// ============ Selector de club/deporte/categoría post-login (Etapa 7). ============
import { auth, db } from './firebase-config.js';
import { animateEntrySwitch, escapeHtml, state } from './state.js';

  function uniq(arr){
    var seen = {}, out = [];
    arr.forEach(function(v){ if(v && !seen[v]){ seen[v] = true; out.push(v); } });
    return out;
  }

  function chunk(arr, size){
    var out = [];
    for(var i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  // Mismo comportamiento de siempre: auto-entra al primer equipo encontrado vía
  // teams.members. Se usa cuando la cuenta todavía no tiene memberships (no se
  // corrió la migración de la Etapa 3, o es un Personal Trainer — nunca tiene
  // membership por diseño, ver DATABASE.md).
  function legacyRedirect(){
    var q = state.role === 'admin'
      ? db.collection('teams')
      : db.collection('teams').where('members','array-contains', state.user.uid);
    return q.get().then(function(snap){
      var teams = snap.docs.map(function(d){ return { id: d.id, name: d.data().name }; });
      if(teams.length === 0){
        // Personal Trainer sin categorías todavía: a diferencia de coach/físico
        // (que dependen de que un admin les dé acceso), un PT crea sus propias
        // categorías desde Administración → "Mi club chico" dentro de app.html.
        // Antes esto lo sacaba de sesión con un mensaje que no aplicaba a su
        // caso, dejándolo sin forma de llegar a esa pantalla de autoservicio.
        if(state.role === 'personal'){
          window.location.href = 'app.html';
          return;
        }
        showLoginError('Todavía no tenés categorías asignadas. Pedile al admin que te dé acceso. Tu UID es: ' + state.user.uid);
        auth.signOut();
        return;
      }
      window.location.href = 'app.html?team=' + encodeURIComponent(teams[0].id);
    }).catch(function(e){
      console.error('legacyRedirect error:', e);
      showLoginError('Error cargando categorías: [' + escapeHtml(e.code||'sin código') + '] ' + escapeHtml(e.message||String(e)));
    });
  }

  function showLoginError(msg){
    var errEl = document.getElementById('loginError');
    errEl.textContent = msg;
    errEl.style.display = 'block';
  }

  // state.memberships ya está cargado acá (ensureUserDoc() espera loadMemberships()
  // antes de resolver, ver js/auth.js) — no hace falta pedirlo de nuevo.
  export function resolveEntryContext(){
    if(!state.memberships || state.memberships.length === 0) return legacyRedirect();
    var categoryIdsSet = {};
    state.memberships.forEach(function(m){ (m.categoryIds||[]).forEach(function(id){ categoryIdsSet[id] = true; }); });
    var categoryIds = Object.keys(categoryIdsSet);
    if(categoryIds.length === 0) return legacyRedirect();
    // Con una sola categoría accesible, entra directo sin fricción — salvo el
    // Dueño, que siempre ve el selector para poder llegar al Panel de la
    // plataforma (si no, nunca tendría dónde hacer clic para llegar ahí).
    if(categoryIds.length === 1 && !state.isOwner){
      window.location.href = 'app.html?team=' + encodeURIComponent(categoryIds[0]);
      return Promise.resolve();
    }
    return renderSelector(categoryIds);
  }

  function renderSelector(categoryIds){
    var idChunks = chunk(categoryIds, 10); // límite de Firestore para consultas "in"
    return Promise.all(idChunks.map(function(ids){
      return db.collection('teams').where(firebase.firestore.FieldPath.documentId(), 'in', ids).get();
    })).then(function(snaps){
      var teams = [];
      snaps.forEach(function(s){ s.docs.forEach(function(d){ var t = d.data(); t.id = d.id; teams.push(t); }); });
      var clubIds = uniq(teams.map(function(t){ return t.clubId; }));
      var sportIds = uniq(teams.map(function(t){ return t.sportId; }));
      return Promise.all([
        Promise.all(clubIds.map(function(id){ return db.collection('clubs').doc(id).get(); })),
        Promise.all(sportIds.map(function(id){ return db.collection('sportsCatalog').doc(id).get(); }))
      ]).then(function(res){
        var clubs = {}; res[0].forEach(function(s){ if(s.exists) clubs[s.id] = s.data(); });
        var sports = {}; res[1].forEach(function(s){ if(s.exists) sports[s.id] = s.data(); });
        showSelector(teams, clubs, sports);
      });
    }).catch(function(e){
      console.error('renderSelector error:', e);
      showLoginError('Error cargando tus categorías: [' + escapeHtml(e.code||'sin código') + '] ' + escapeHtml(e.message||String(e)));
    });
  }

  // Selector post-login: club -> deporte, nada más. La categoría NO es un
  // tercer paso acá — ese selector ya existe dentro de app.html (#teamSelect,
  // ver js/auth.js renderTeamSelect()), tal como funcionaba antes del
  // multi-club. Este flujo solo tiene que resolver a QUÉ categoría entrar por
  // default; si el usuario quiere cambiar a otra que también tenga acceso, lo
  // hace desde ese selector ya existente adentro de la app.
  function showSelector(teams, clubs, sports){
    animateEntrySwitch('loginWrap', 'selectorWrap', false);
    document.getElementById('selectorLogoutLink').addEventListener('click', function(){ auth.signOut(); });
    var clubIds = uniq(teams.map(function(t){ return t.clubId || '_'; }));
    if(clubIds.length <= 1){
      renderSportStep(teams, sports, true);
    } else {
      renderClubStep(teams, clubs, sports, clubIds);
    }
  }

  function renderStepShell(bodyHtml, subText, isFirstStep){
    var html = '';
    if(state.isOwner && isFirstStep){
      html += '<button class="btn secondary" id="goPlatformPanelBtn" type="button" style="width:100%;margin-bottom:18px;">⚙ Panel de la plataforma</button>';
    }
    html += bodyHtml;
    document.getElementById('selectorList').innerHTML = html;
    document.querySelector('.selector-box .sub').textContent = subText;
    var platformBtn = document.getElementById('goPlatformPanelBtn');
    if(platformBtn){
      platformBtn.addEventListener('click', function(){
        import('./plataforma.js').then(function(mod){
          animateEntrySwitch('selectorWrap', 'platformWrap', false);
          mod.renderPlatformPanel();
        });
      });
    }
  }

  function renderClubStep(teams, clubs, sports, clubIds){
    var body = '<div class="selector-categories" style="flex-direction:column;">' + clubIds.map(function(clubId){
      var clubName = (clubs[clubId] && clubs[clubId].name) || 'Club';
      return '<button class="btn secondary selectorClubBtn" data-club="' + clubId + '" type="button" style="width:100%;margin-bottom:8px;">' + escapeHtml(clubName) + '</button>';
    }).join('') + '</div>';
    renderStepShell(body, 'Elegí tu club', true);
    document.querySelectorAll('.selectorClubBtn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var clubId = btn.dataset.club;
        var clubTeams = teams.filter(function(t){ return (t.clubId || '_') === clubId; });
        renderSportStep(clubTeams, sports, false);
      });
    });
  }

  function renderSportStep(teams, sports, isFirstStep){
    var sportIds = uniq(teams.map(function(t){ return t.sportId || '_'; }));
    // El Dueño siempre tiene que ver al menos una pantalla acá (aunque haya un
    // solo club y un solo deporte) para poder llegar al Panel de la
    // plataforma — si no, nunca tendría dónde hacer clic para llegar ahí.
    if(sportIds.length <= 1 && !(isFirstStep && state.isOwner)){ goToTeam(teams[0].id); return; }
    var body = '<div class="selector-categories" style="flex-direction:column;">' + sportIds.map(function(sportId){
      var sportName = (sports[sportId] && sports[sportId].name) || 'General';
      return '<button class="btn secondary selectorSportBtn" data-sport="' + sportId + '" type="button" style="width:100%;margin-bottom:8px;">' + escapeHtml(sportName) + '</button>';
    }).join('') + '</div>';
    renderStepShell(body, 'Elegí tu deporte', isFirstStep);
    document.querySelectorAll('.selectorSportBtn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var match = teams.find(function(t){ return (t.sportId || '_') === btn.dataset.sport; });
        goToTeam(match.id);
      });
    });
  }

  function goToTeam(teamId){
    var selectorWrap = document.getElementById('selectorWrap');
    selectorWrap.classList.add('entry-slide-out-left');
    setTimeout(function(){ window.location.href = 'app.html?team=' + encodeURIComponent(teamId); }, 180);
  }
