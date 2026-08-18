// ============ Selector de club/deporte/categoría post-login (Etapa 7). ============
import { auth, db } from './firebase-config.js';
import { animateEntrySwitch, escapeHtml, state } from './state.js';

  function initials(name){
    return (name||'').trim().split(/\s+/).map(function(w){ return w[0]; }).slice(0,2).join('').toUpperCase();
  }

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
    // El Dueño (isOwner) tiene acceso automático a TODO ERAM — todos los clubes,
    // deportes y categorías, sin depender de tener una membership puntual en cada
    // uno (las reglas de Firestore ya le dan isAdmin()/isOwner() en todos lados;
    // esto es solo para que el SELECTOR post-login también refleje eso, en vez de
    // limitarse a los clubes donde alguna migración vieja le haya dejado una
    // membership armada a mano — así un club nuevo creado desde el Panel de la
    // plataforma aparece acá sin ningún paso extra).
    if(state.isOwner) return renderAllTeamsSelector();
    if(!state.memberships || state.memberships.length === 0) return legacyRedirect();
    var categoryIdsSet = {};
    state.memberships.forEach(function(m){ (m.categoryIds||[]).forEach(function(id){ categoryIdsSet[id] = true; }); });
    // Admin de club/Coordinador: alcance DINÁMICO, categoryIds siempre vacío a
    // propósito (ver .agents/rules/modelo-negocio-alcance-roles.md) — hay que
    // consultar teams reales por clubId (Admin de club) o clubId+sportId
    // (Coordinador), si no una cuenta que solo tiene memberships de estos dos
    // roles nunca junta ninguna categoryId y queda bloqueada en legacyRedirect().
    var dynamicScopeQueries = state.memberships
      .filter(function(m){ return m.role === 'admin' || m.role === 'coordinador'; })
      .map(function(m){
        var q = db.collection('teams').where('clubId','==', m.clubId);
        if(m.role === 'coordinador') q = q.where('sportId','==', m.sportId);
        return q.get();
      });
    return Promise.all(dynamicScopeQueries).then(function(snaps){
      snaps.forEach(function(snap){ snap.docs.forEach(function(d){ categoryIdsSet[d.id] = true; }); });
      var categoryIds = Object.keys(categoryIdsSet);
      if(categoryIds.length === 0) return legacyRedirect();
      // Con una sola categoría accesible, entra directo sin fricción.
      if(categoryIds.length === 1){
        window.location.href = 'app.html?team=' + encodeURIComponent(categoryIds[0]);
        return;
      }
      return renderSelector(categoryIds);
    }).catch(function(e){
      console.error('resolveEntryContext error:', e);
      showLoginError('Error cargando tus categorías: [' + escapeHtml(e.code||'sin código') + '] ' + escapeHtml(e.message||String(e)));
    });
  }

  // Arma el selector (showSelector) a partir de una lista de docs de `teams` ya
  // resueltos — común entre el camino "solo mis categorías" (renderSelector,
  // filtra por documentId) y el camino "TODO ERAM" del Dueño (renderAllTeamsSelector,
  // sin filtro).
  function finishSelectorFromTeamDocs(docs){
    var teams = docs.map(function(d){ var t = d.data(); t.id = d.id; return t; });
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
  }

  function renderSelector(categoryIds){
    var idChunks = chunk(categoryIds, 10); // límite de Firestore para consultas "in"
    return Promise.all(idChunks.map(function(ids){
      return db.collection('teams').where(firebase.firestore.FieldPath.documentId(), 'in', ids).get();
    })).then(function(snaps){
      var docs = [];
      snaps.forEach(function(s){ docs = docs.concat(s.docs); });
      return finishSelectorFromTeamDocs(docs);
    }).catch(function(e){
      console.error('renderSelector error:', e);
      showLoginError('Error cargando tus categorías: [' + escapeHtml(e.code||'sin código') + '] ' + escapeHtml(e.message||String(e)));
    });
  }

  function renderAllTeamsSelector(){
    return db.collection('teams').get().then(function(snap){
      return finishSelectorFromTeamDocs(snap.docs);
    }).catch(function(e){
      console.error('renderAllTeamsSelector error:', e);
      showLoginError('Error cargando todos los clubes: [' + escapeHtml(e.code||'sin código') + '] ' + escapeHtml(e.message||String(e)));
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

  // Anima el cambio de paso DENTRO del selector (club -> deporte, deporte ->
  // club), reusando las mismas clases entry-slide-* que ya animan el pasaje
  // login -> selector. reverse=true = "volver atrás" (desliza al revés).
  // Primer render (lista todavía vacía) no anima, ya viene de la transición
  // de página que hizo showSelector().
  function transitionStep(applyFn, reverse){
    var listEl = document.getElementById('selectorList');
    var hasContent = listEl.children.length > 0;
    if(!hasContent){ applyFn(); return; }
    listEl.classList.add(reverse ? 'entry-slide-out-right' : 'entry-slide-out-left');
    setTimeout(function(){
      listEl.classList.remove('entry-slide-out-right', 'entry-slide-out-left');
      applyFn();
      listEl.classList.add(reverse ? 'entry-slide-in-left' : 'entry-slide-in-right');
      setTimeout(function(){ listEl.classList.remove('entry-slide-in-left', 'entry-slide-in-right'); }, 380);
    }, 380);
  }

  function renderStepShell(bodyHtml, subText, isFirstStep, backHandler, reverse, afterRender){
    var html = '';
    if(backHandler){
      html += '<button class="selector-backlink" id="selectorBackBtn" type="button">‹ Cambiar de club</button>';
    }
    if(state.isOwner && isFirstStep){
      html += '<button class="btn secondary" id="goPlatformPanelBtn" type="button" style="width:100%;margin-bottom:18px;">⚙ Panel de la plataforma</button>';
    }
    html += bodyHtml;
    transitionStep(function(){
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
      var backBtn = document.getElementById('selectorBackBtn');
      if(backBtn) backBtn.addEventListener('click', backHandler);
      if(afterRender) afterRender();
    }, reverse);
  }

  function renderClubStep(teams, clubs, sports, clubIds, reverse){
    var body = '<div class="selector-opt-list">' + clubIds.map(function(clubId){
      var club = clubs[clubId] || {};
      var clubName = club.name || 'Club';
      var sportsCount = (club.enabledSports || []).length;
      var meta = sportsCount === 1 ? '1 deporte habilitado' : (sportsCount + ' deportes habilitados');
      return '<button class="selector-opt selectorClubBtn" data-club="' + clubId + '" type="button">'
        + '<div class="mark">' + escapeHtml(initials(clubName)) + '</div>'
        + '<div class="txt"><div class="name">' + escapeHtml(clubName) + '</div><div class="meta">' + escapeHtml(meta) + '</div></div>'
        + '<div class="chev">›</div>'
        + '</button>';
    }).join('') + '</div>';
    renderStepShell(body, 'Elegí tu club', true, null, reverse, function(){
      document.querySelectorAll('.selectorClubBtn').forEach(function(btn){
        btn.addEventListener('click', function(){
          var clubId = btn.dataset.club;
          var clubTeams = teams.filter(function(t){ return (t.clubId || '_') === clubId; });
          renderSportStep(clubTeams, sports, false, function(){ renderClubStep(teams, clubs, sports, clubIds, true); }, false);
        });
      });
    });
  }

  function renderSportStep(teams, sports, isFirstStep, backHandler, reverse){
    var sportIds = uniq(teams.map(function(t){ return t.sportId || '_'; }));
    // El Dueño siempre tiene que ver al menos una pantalla acá (aunque haya un
    // solo club y un solo deporte) para poder llegar al Panel de la
    // plataforma — si no, nunca tendría dónde hacer clic para llegar ahí.
    if(sportIds.length <= 1 && !(isFirstStep && state.isOwner)){ goToTeam(teams[0].id); return; }
    var body = '<div class="selector-opt-list">' + sportIds.map(function(sportId){
      var sportName = (sports[sportId] && sports[sportId].name) || 'General';
      var categoryCount = teams.filter(function(t){ return (t.sportId || '_') === sportId; }).length;
      var meta = categoryCount === 1 ? '1 categoría' : (categoryCount + ' categorías');
      return '<button class="selector-opt selectorSportBtn" data-sport="' + sportId + '" type="button">'
        + '<div class="mark">' + escapeHtml(initials(sportName)) + '</div>'
        + '<div class="txt"><div class="name">' + escapeHtml(sportName) + '</div><div class="meta">' + escapeHtml(meta) + '</div></div>'
        + '<div class="chev">›</div>'
        + '</button>';
    }).join('') + '</div>';
    renderStepShell(body, 'Elegí tu deporte', isFirstStep, backHandler, reverse, function(){
      document.querySelectorAll('.selectorSportBtn').forEach(function(btn){
        btn.addEventListener('click', function(){
          var match = teams.find(function(t){ return (t.sportId || '_') === btn.dataset.sport; });
          goToTeam(match.id);
        });
      });
    });
  }

  function goToTeam(teamId){
    var selectorWrap = document.getElementById('selectorWrap');
    selectorWrap.classList.add('entry-slide-out-left');
    setTimeout(function(){ window.location.href = 'app.html?team=' + encodeURIComponent(teamId); }, 180);
  }
