// ============ Panel de la plataforma — solo Dueño (Etapa 7). ============
import { migrateToMultiClub, renderClubUsersPanel, renderPtPlayersFor, resyncAllStaffScopes, resyncOrphanedCategoryIds, sportCategoryCardHtml, updatePtDisplayName, wireSportCategoryCards } from './administracion.js';
import { db } from './firebase-config.js';
import { COURT_TYPE_OPTIONS, DEFAULT_COURT_TYPE } from './sport-profiles.js';
import { createSecondaryAuthUser, escapeAttr, escapeHtml, fail, showToast } from './state.js';

  function slugify(name){
    return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  }

  function initials(name){
    return (name||'').trim().split(/\s+/).map(function(w){ return w[0]; }).slice(0,2).join('').toUpperCase() || '?';
  }

  // Layout reorganizado (boceto confirmado): 3 bloques — Deportes / Clubes /
  // Personal Trainers. En mobile se ven de a uno vía tabs (.platform-tabs); en
  // desktop (min-width:900px, ver css/styles.css) los 3 se muestran juntos:
  // Deportes arriba en una tira horizontal, Clubes + PT lado a lado en grid.
  export function renderPlatformPanel(){
    var wrap = document.getElementById('platformContent');
    wrap.innerHTML =
      '<div class="platform-shell">'
      + '<div class="admin-block" id="bugfixToolsBlock">'
      +   '<h3 class="subhead">🛠 Corrección y depuración de bugs</h3>'
      +   '<p class="helper-text">Herramientas de mantenimiento — se corren una sola vez o para reparar una cuenta puntual, no rompen nada de lo que ya funciona.</p>'
      +   '<div class="admin-block" style="margin-top:10px;">'
      +     '<h4 class="subhead">Migración a plataforma multi-club (ERAM)</h4>'
      +     '<p class="helper-text">Prepara la base de datos para que la app soporte más de un club: crea el catálogo de deportes, el club "Once Unidos" con todas las categorías actuales adentro, una membresía por rol para cada cuenta existente, y completa el club/deporte en los mensajes del Foro y las jugadas de la Biblioteca pública de antes de este cambio. Es seguro repetirlo si hace falta (ej. para reparar una cuenta con permisos desactualizados) — no borra ni pisa datos.</p>'
      +     '<div class="row"><button class="btn secondary small" id="migrateToMultiClubBtn" type="button">Migrar a multi-club ahora</button></div>'
      +   '</div>'
      +   '<div class="admin-block" style="margin-top:10px;">'
      +     '<h4 class="subhead">Reparar permisos de Admin de club / Coordinador</h4>'
      +     '<p class="helper-text">Recalcula el caché de permisos de TODAS las cuentas a partir de sus memberships reales. Corré esto si una cuenta Admin de club o Coordinador ve el cartel "No se pudo completar la operación: permission-denied" al iniciar sesión — pasa cuando esa cuenta recibió su rol antes de que existiera este caché. Es seguro repetirlo, no borra ni cambia memberships ni roles.</p>'
      +     '<div class="row"><button class="btn secondary small" id="resyncStaffScopesBtn" type="button">Reparar permisos ahora</button></div>'
      +   '</div>'
      +   '<div class="admin-block" style="margin-top:10px;">'
      +     '<h4 class="subhead">Reparar categorías huérfanas</h4>'
      +     '<p class="helper-text">Saca de los accesos de Entrenador/Preparador físico cualquier categoría YA BORRADA que haya quedado colgada. Corré esto si una cuenta con acceso a varias categorías ve "permission-denied" al iniciar sesión justo después de borrar una categoría — una sola referencia vieja rompe TODO su login, no solo esa categoría. Seguro de repetir, no borra memberships ni roles.</p>'
      +     '<div class="row"><button class="btn secondary small" id="resyncOrphanedCategoryIdsBtn" type="button">Reparar categorías huérfanas ahora</button></div>'
      +   '</div>'
      + '</div>'
      + '<div class="platform-tabs" id="platformTabs">'
      +   '<button type="button" class="ptab-btn active" data-ptab="deportes">Deportes</button>'
      +   '<button type="button" class="ptab-btn" data-ptab="clubes">Clubes</button>'
      +   '<button type="button" class="ptab-btn" data-ptab="pt">Personal Trainers</button>'
      + '</div>'
      + '<section class="sports-strip platform-panel-block active" data-ptab-panel="deportes">'
      +   '<div class="sports-strip-head"><h3>🏅 Catálogo de deportes</h3><span class="helper-text">Define la cancha de la Pizarra y las posiciones de cada deporte</span></div>'
      +   '<div id="sportsCatalogList" class="sport-chips"></div>'
      +   '<div class="sport-add">'
      +     '<input type="text" class="text-input" id="newSportName" placeholder="Nombre del deporte (ej. Handball)">'
      +     courtTypeSelectHtml('newSportCourtType', DEFAULT_COURT_TYPE)
      +     '<button class="btn small" id="createSportBtn" type="button">+ Agregar deporte</button>'
      +   '</div>'
      + '</section>'
      + '<div class="platform-main-grid">'
      +   '<div class="platform-panel-block" data-ptab-panel="clubes">'
      +     '<div class="col-head"><h3>🏟 Clubes</h3></div>'
      +     '<div id="clubsList" class="clubs-grid"></div>'
      +     '<div class="row" style="margin-top:12px;">'
      +       '<input type="text" class="text-input" id="newClubName" placeholder="Nombre del club nuevo">'
      +       '<button class="btn small" id="createClubBtn" type="button">+ Crear club</button>'
      +     '</div>'
      +   '</div>'
      +   '<aside class="platform-panel-block" data-ptab-panel="pt">'
      +     '<div class="col-head"><h3>🧑‍🏫 Personal Trainers</h3></div>'
      +     '<div id="ptList"></div>'
      +     '<div class="pt-create">'
      +       '<h4>+ Nuevo Personal Trainer</h4>'
      +       '<div class="stack">'
      +         '<input type="text" class="text-input" id="newPtName" placeholder="Nombre (para identificarlo)">'
      +         '<input type="email" class="text-input" id="newPtEmail" placeholder="Email">'
      +         '<input type="text" class="text-input" id="newPtPass" placeholder="Contraseña provisoria (solo cuenta nueva)">'
      +         '<button class="btn small" id="createPtBtn" type="button">Crear / agregar mini-club</button>'
      +       '</div>'
      +       '<p class="helper-text">Un Personal Trainer no pertenece a ningún club: entra directo a su propio espacio ("club chico"). Si el email ya tiene cuenta, se le agrega el mini-club sin pedir contraseña.</p>'
      +     '</div>'
      +   '</aside>'
      + '</div>'
      + '</div>';
    refreshSportsCatalog();
    refreshClubsList();
    refreshPtList();
    document.getElementById('migrateToMultiClubBtn').addEventListener('click', migrateToMultiClub);
    document.getElementById('resyncStaffScopesBtn').addEventListener('click', resyncAllStaffScopes);
    document.getElementById('resyncOrphanedCategoryIdsBtn').addEventListener('click', resyncOrphanedCategoryIds);
    document.getElementById('createSportBtn').addEventListener('click', createSport);
    document.getElementById('createClubBtn').addEventListener('click', createClub);
    document.getElementById('createPtBtn').addEventListener('click', createPersonalTrainer);
    document.querySelectorAll('.ptab-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        document.querySelectorAll('.ptab-btn').forEach(function(b){ b.classList.remove('active'); });
        document.querySelectorAll('.platform-panel-block').forEach(function(p){ p.classList.remove('active'); });
        btn.classList.add('active');
        document.querySelector('.platform-panel-block[data-ptab-panel="'+btn.dataset.ptab+'"]').classList.add('active');
      });
    });
  }

  function courtTypeSelectHtml(cls, selected){
    return '<select class="text-input '+cls+'">' + COURT_TYPE_OPTIONS.map(function(o){
      return '<option value="'+o.value+'"'+(o.value===selected?' selected':'')+'>'+escapeHtml(o.label)+'</option>';
    }).join('') + '</select>';
  }

  function refreshSportsCatalog(){
    var wrap = document.getElementById('sportsCatalogList');
    db.collection('sportsCatalog').get().then(function(snap){
      if(snap.empty){ wrap.innerHTML = '<div class="empty">Sin deportes todavía.</div>'; return; }
      wrap.innerHTML = snap.docs.map(function(d){
        var courtType = d.data().courtType || DEFAULT_COURT_TYPE;
        return '<span class="sport-chip">'+escapeHtml(d.data().name)
          + courtTypeSelectHtml('sportCourtType-'+d.id, courtType)
          + '</span>';
      }).join('');
      snap.docs.forEach(function(d){
        wrap.querySelector('.sportCourtType-'+d.id).addEventListener('change', function(){
          db.collection('sportsCatalog').doc(d.id).set({ courtType: this.value }, { merge: true })
            .then(function(){ showToast('Tipo de cancha actualizado'); }).catch(function(e){ fail(e); });
        });
      });
    }).catch(function(e){ fail(e); });
  }

  function createSport(){
    var input = document.getElementById('newSportName');
    var name = input.value.trim();
    if(!name) return;
    var id = slugify(name);
    if(!id){ showToast('Nombre inválido'); return; }
    var courtType = document.querySelector('.newSportCourtType').value;
    db.collection('sportsCatalog').doc(id).set({ name: name, courtType: courtType }, { merge: true }).then(function(){
      input.value = '';
      showToast('Deporte agregado');
      refreshSportsCatalog();
    }).catch(function(e){ fail(e); });
  }

  function refreshClubsList(){
    var wrap = document.getElementById('clubsList');
    Promise.all([db.collection('clubs').get(), db.collection('sportsCatalog').get(), db.collection('teams').get()]).then(function(res){
      var clubsSnap = res[0], sportsSnap = res[1], teamsSnap = res[2];
      var allSports = sportsSnap.docs.map(function(d){ return { id: d.id, name: d.data().name }; });
      // Plataforma vive en index.html — a diferencia de app.html, acá no hay
      // state.teams poblado (loadTeamsForUser() nunca corrió), así que se trae
      // directo de Firestore y se filtra en memoria club por club/deporte.
      var allTeams = teamsSnap.docs.map(function(d){ var t = d.data(); t.id = d.id; return t; });
      if(clubsSnap.empty){ wrap.innerHTML = '<div class="empty">Sin clubes todavía.</div>'; return; }
      wrap.innerHTML = clubsSnap.docs.map(function(d){
        var c = d.data();
        var clubId = d.id;
        var enabledSports = c.enabledSports || [];
        var limits = c.sportLimits || {};
        var counts = c.categoryCounts || {};
        var totalCats = enabledSports.reduce(function(sum, sportId){ return sum + (counts[sportId]||0); }, 0);
        var sportsRow = allSports.map(function(s){
          var checked = enabledSports.indexOf(s.id) !== -1;
          return '<label class="mini-chip'+(checked?' on':'')+'"><input type="checkbox" class="clubSportToggle" data-club="'+clubId+'" data-sport="'+s.id+'" '+(checked?'checked':'')+'>'+escapeHtml(s.name)+'</label>';
        }).join('');
        var subLine = enabledSports.length
          ? enabledSports.map(function(id){ return (allSports.find(function(s){return s.id===id;})||{}).name || id; }).join(' · ')
          : 'Sin deportes habilitados';
        // Tope de categorías por deporte (no por club, control exclusivo del
        // Dueño — "plan pago") + la card de categorías compartida con
        // Administración, que acá antes faltaba: antes de esto Plataforma solo
        // dejaba crear una categoría nueva, sin ver ni editar las que ya había.
        var sportBlocks = enabledSports.map(function(sportId){
          var sportName = (allSports.find(function(s){return s.id===sportId;})||{}).name || sportId;
          var max = limits[sportId] != null ? limits[sportId] : null;
          var used = counts[sportId] || 0;
          var teamsOfSport = allTeams.filter(function(t){ return t.clubId===clubId && t.sportId===sportId; });
          var limitEditor = '<div class="team-admin-card">'
            + '<div class="row"><strong>Tope · '+escapeHtml(sportName)+'</strong></div>'
            + '<div class="row" style="margin-top:8px;"><input type="number" min="0" class="text-input sportLimitInput" data-club="'+clubId+'" data-sport="'+sportId+'" placeholder="Tope (vacío = sin tope)" value="'+(max!=null?max:'')+'" style="max-width:180px;"><button class="btn secondary small saveSportLimitBtn" data-club="'+clubId+'" data-sport="'+sportId+'" type="button">Guardar tope</button></div>'
            + '</div>';
          return limitEditor + sportCategoryCardHtml(clubId, sportId, sportName, max, used, teamsOfSport);
        }).join('') || '<div class="helper-text">Habilitá un deporte arriba para crear categorías.</div>';
        return '<div class="club-card">'
          + '<div class="club-card-top">'
          +   '<div class="club-card-name"><div class="club-badge">'+(c.logoUrl ? '<img src="'+escapeAttr(c.logoUrl)+'" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" alt="">' : escapeHtml(initials(c.name)))+'</div>'
          +     '<div><strong>'+escapeHtml(c.name)+'</strong><span class="sub">'+escapeHtml(subLine)+'</span></div></div>'
          +   '<div class="club-sports-row">'+sportsRow+'</div>'
          +   '<div class="cat-stat-row"><div class="cat-stat"><div class="num">'+totalCats+'</div><div class="lbl">Categorías</div></div>'
          +     '<div class="cat-stat"><div class="num">'+enabledSports.length+'</div><div class="lbl">Deportes</div></div></div>'
          + '</div>'
          + '<div class="club-card-actions">'
          +   '<button class="toggleClubDetailBtn" data-club="'+clubId+'" type="button">Gestionar categorías</button>'
          +   '<button class="toggleClubUsersBtn" data-club="'+clubId+'" type="button">👥 Usuarios</button>'
          + '</div>'
          + '<div class="club-detail" id="clubDetail-'+clubId+'" style="display:none;">'+sportBlocks+'</div>'
          + '<div id="clubUsers-'+clubId+'" style="display:none;" class="club-detail"></div>'
          + '</div>';
      }).join('');
      wireSportCategoryCards(wrap, refreshClubsList);
      wrap.querySelectorAll('.clubSportToggle').forEach(function(chk){
        chk.addEventListener('change', function(){
          var op = chk.checked ? firebase.firestore.FieldValue.arrayUnion(chk.dataset.sport) : firebase.firestore.FieldValue.arrayRemove(chk.dataset.sport);
          db.collection('clubs').doc(chk.dataset.club).update({ enabledSports: op })
            .then(function(){ showToast('Deportes habilitados actualizados'); refreshClubsList(); })
            .catch(function(e){ fail(e); chk.checked = !chk.checked; });
        });
      });
      wrap.querySelectorAll('.saveSportLimitBtn').forEach(function(btn){
        btn.addEventListener('click', function(){
          var input = wrap.querySelector('.sportLimitInput[data-club="'+btn.dataset.club+'"][data-sport="'+btn.dataset.sport+'"]');
          var val = input.value.trim();
          var num = val === '' ? null : parseInt(val, 10);
          var limitUpdate = {}; limitUpdate[btn.dataset.sport] = num;
          db.collection('clubs').doc(btn.dataset.club).set({ sportLimits: limitUpdate }, { merge: true })
            .then(function(){ showToast('Tope actualizado'); refreshClubsList(); })
            .catch(function(e){ fail(e); });
        });
      });
      wrap.querySelectorAll('.toggleClubDetailBtn').forEach(function(btn){
        btn.addEventListener('click', function(){
          var panel = document.getElementById('clubDetail-'+btn.dataset.club);
          var opening = panel.style.display === 'none';
          panel.style.display = opening ? '' : 'none';
          btn.textContent = opening ? 'Ocultar categorías' : 'Gestionar categorías';
        });
      });
      // Sección de usuarios por club (Etapa 9): carga recién al abrirla, no de
      // entrada — evita traer todos los usuarios de la plataforma por cada club
      // listado si el Dueño ni siquiera la va a mirar.
      wrap.querySelectorAll('.toggleClubUsersBtn').forEach(function(btn){
        btn.addEventListener('click', function(){
          var panel = document.getElementById('clubUsers-'+btn.dataset.club);
          var opening = panel.style.display === 'none';
          if(opening){
            panel.style.display = '';
            btn.textContent = '👥 Ocultar usuarios';
            renderClubUsersPanel(btn.dataset.club, panel.id);
          } else {
            panel.style.display = 'none';
            btn.textContent = '👥 Usuarios';
          }
        });
      });
    }).catch(function(e){ fail(e); });
  }

  function createClub(){
    var input = document.getElementById('newClubName');
    var name = input.value.trim();
    if(!name) return;
    var id = slugify(name);
    if(!id){ showToast('Nombre inválido'); return; }
    db.collection('clubs').doc(id).set({
      name: name, logoUrl: null, theme: {}, enabledSports: [], sportLimits: {}, categoryCounts: {},
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).then(function(){
      input.value = '';
      showToast('Club creado. Recordá habilitarle al menos un deporte.');
      refreshClubsList();
    }).catch(function(e){ fail(e); });
  }

  function refreshPtList(){
    var wrap = document.getElementById('ptList');
    // isPersonalTrainer, no role==='personal': una cuenta que también tiene
    // rol de club tiene role en 'coach'/'fisico'/etc, pero sigue siendo PT.
    db.collection('users').where('isPersonalTrainer','==',true).get().then(function(snap){
      if(snap.empty){ wrap.innerHTML = '<div class="empty">Sin Personal Trainers todavía.</div>'; return; }
      wrap.innerHTML = '<div class="pt-panel">' + snap.docs.map(function(d){
        var uid = d.id, u = d.data();
        var name = u.displayName || u.email;
        return '<div class="pt-row">'
          + '<div class="pt-row-head">'
          +   '<div class="pt-who"><div class="pt-avatar">'+escapeHtml(initials(name))+'</div>'
          +     '<div><span class="name">'+escapeHtml(name)+'</span><span class="email">'+escapeHtml(u.email)+(u.role && u.role!=='personal' ? ' · también rol de club' : '')+'</span></div></div>'
          +   '<button class="btn secondary small togglePtBtn" data-uid="'+uid+'" type="button">Ver / editar</button>'
          + '</div>'
          + '<div class="pt-detail" id="ptDetail-'+uid+'" style="display:none;">'
          +   '<div class="row"><input type="text" class="text-input ptDisplayNameInput" data-uid="'+uid+'" placeholder="Nombre visible" value="'+escapeAttr(u.displayName||'')+'"><button class="btn secondary small savePtDisplayNameBtn" data-uid="'+uid+'" type="button">Guardar nombre</button></div>'
          +   '<div class="helper-text" style="margin:8px 0;">Jugadores (categorías) de este mini-club:</div>'
          +   '<div id="ptPlayers-'+uid+'"></div>'
          + '</div>'
          + '</div>';
      }).join('') + '</div>';
      wrap.querySelectorAll('.togglePtBtn').forEach(function(btn){
        btn.addEventListener('click', function(){
          var panel = document.getElementById('ptDetail-'+btn.dataset.uid);
          var opening = panel.style.display === 'none';
          if(opening){
            panel.style.display = '';
            btn.textContent = 'Ocultar';
            renderPtPlayersFor(btn.dataset.uid, 'ptPlayers-'+btn.dataset.uid);
          } else {
            panel.style.display = 'none';
            btn.textContent = 'Ver / editar';
          }
        });
      });
      wrap.querySelectorAll('.savePtDisplayNameBtn').forEach(function(btn){
        btn.addEventListener('click', function(){
          var input = wrap.querySelector('.ptDisplayNameInput[data-uid="'+btn.dataset.uid+'"]');
          updatePtDisplayName(btn.dataset.uid, input.value.trim())
            .then(function(){ showToast('Nombre guardado'); refreshPtList(); })
            .catch(function(e){ fail(e); });
        });
      });
    }).catch(function(e){ fail(e); });
  }

  function createPersonalTrainer(){
    var email = document.getElementById('newPtEmail').value.trim().toLowerCase();
    var pass = document.getElementById('newPtPass').value;
    var name = document.getElementById('newPtName').value.trim();
    if(!email){ showToast('Ingresá un email'); return; }
    // Si el email ya existe en la plataforma (ya tiene cuenta, con o sin rol
    // de club), se le agrega isPersonalTrainer sin crear cuenta de Auth
    // nueva — no aplica pedir contraseña acá, esa cuenta ya tiene una. Mismo
    // patrón que addExistingUserToClub() en administracion.js.
    db.collection('users').where('email','==', email).limit(1).get().then(function(snap){
      if(!snap.empty){
        var uid = snap.docs[0].id;
        var data = { isPersonalTrainer: true };
        if(name) data.displayName = name;
        return db.collection('users').doc(uid).set(data, { merge: true }).then(function(){
          showToast('Se agregó el mini-club a ' + email);
        });
      }
      if(pass.length < 6){ showToast('Contraseña de al menos 6 caracteres'); return; }
      return createSecondaryAuthUser(email, pass).then(function(uid){
        var data = { email: email, role: 'personal', isPersonalTrainer: true };
        if(name) data.displayName = name;
        return db.collection('users').doc(uid).set(data);
      }).then(function(){
        showToast('Cuenta de Personal Trainer creada para ' + email);
      });
    }).then(function(){
      document.getElementById('newPtEmail').value = '';
      document.getElementById('newPtPass').value = '';
      document.getElementById('newPtName').value = '';
      refreshPtList();
    }).catch(function(e){
      console.error(e);
      showToast('No se pudo procesar: ' + e.message);
    });
  }
