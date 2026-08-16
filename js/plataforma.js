// ============ Panel de la plataforma — solo Dueño (Etapa 7). ============
import { renderClubUsersPanel } from './administracion.js';
import { db } from './firebase-config.js';
import { createSecondaryAuthUser, escapeHtml, fail, showToast } from './state.js';

  function slugify(name){
    return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  }

  export function renderPlatformPanel(){
    var wrap = document.getElementById('platformContent');
    wrap.innerHTML =
      '<div class="platform-section" id="sportsCatalogSection"><h3>Catálogo de deportes</h3><div id="sportsCatalogList"></div>'
      + '<div class="row" style="margin-top:8px;"><input type="text" class="text-input" id="newSportName" placeholder="Nombre del deporte (ej. Vóley)"><button class="btn small" id="createSportBtn" type="button">Agregar deporte</button></div></div>'
      + '<div class="platform-section" id="clubsSection"><h3>Clubes</h3><div id="clubsList"></div>'
      + '<div class="row" style="margin-top:8px;"><input type="text" class="text-input" id="newClubName" placeholder="Nombre del club nuevo"><button class="btn small" id="createClubBtn" type="button">Crear club</button></div></div>'
      + '<div class="platform-section" id="ptSection"><h3>Personal Trainers</h3>'
      + '<p class="helper-text">Un Personal Trainer no pertenece a ningún club: entra directo a su propio espacio y arma ahí sus propias categorías (su "club chico"), sin depender de que un club le dé acceso.</p>'
      + '<div id="ptList"></div>'
      + '<div class="row" style="margin-top:8px;"><input type="email" class="text-input" id="newPtEmail" placeholder="Email"><input type="text" class="text-input" id="newPtPass" placeholder="Contraseña provisoria"><button class="btn small" id="createPtBtn" type="button">Crear cuenta</button></div></div>';
    refreshSportsCatalog();
    refreshClubsList();
    refreshPtList();
    document.getElementById('createSportBtn').addEventListener('click', createSport);
    document.getElementById('createClubBtn').addEventListener('click', createClub);
    document.getElementById('createPtBtn').addEventListener('click', createPersonalTrainer);
  }

  function refreshSportsCatalog(){
    var wrap = document.getElementById('sportsCatalogList');
    db.collection('sportsCatalog').get().then(function(snap){
      wrap.innerHTML = snap.empty ? '<div class="empty">Sin deportes todavía.</div>'
        : snap.docs.map(function(d){ return '<div class="platform-list-item">'+escapeHtml(d.data().name)+'</div>'; }).join('');
    }).catch(function(e){ fail(e); });
  }

  function createSport(){
    var input = document.getElementById('newSportName');
    var name = input.value.trim();
    if(!name) return;
    var id = slugify(name);
    if(!id){ showToast('Nombre inválido'); return; }
    db.collection('sportsCatalog').doc(id).set({ name: name }, { merge: true }).then(function(){
      input.value = '';
      showToast('Deporte agregado');
      refreshSportsCatalog();
    }).catch(function(e){ fail(e); });
  }

  function refreshClubsList(){
    var wrap = document.getElementById('clubsList');
    Promise.all([db.collection('clubs').get(), db.collection('sportsCatalog').get()]).then(function(res){
      var clubsSnap = res[0], sportsSnap = res[1];
      var allSports = sportsSnap.docs.map(function(d){ return { id: d.id, name: d.data().name }; });
      if(clubsSnap.empty){ wrap.innerHTML = '<div class="empty">Sin clubes todavía.</div>'; return; }
      wrap.innerHTML = clubsSnap.docs.map(function(d){
        var c = d.data();
        var clubId = d.id;
        var enabledSports = c.enabledSports || [];
        var limits = c.sportLimits || {};
        var counts = c.categoryCounts || {};
        var sportChecks = allSports.map(function(s){
          var checked = enabledSports.indexOf(s.id) !== -1;
          return '<label class="member-chip" style="cursor:pointer;"><input type="checkbox" class="clubSportToggle" data-club="'+clubId+'" data-sport="'+s.id+'" '+(checked?'checked':'')+'> '+escapeHtml(s.name)+'</label>';
        }).join(' ');
        // Tope de categorías por deporte (no por club) — cada deporte habilitado
        // tiene su propio tope independiente, el Admin de club consume uno sin
        // afectar a los demás deportes del club.
        var sportLimitBlocks = enabledSports.map(function(sportId){
          var sportName = (allSports.find(function(s){return s.id===sportId;})||{}).name || sportId;
          var max = limits[sportId] != null ? limits[sportId] : null;
          var used = counts[sportId] || 0;
          var pct = max ? Math.min(100, Math.round(used/max*100)) : (used>0?100:0);
          return '<div class="team-admin-card" style="margin-top:8px;">'
            + '<div class="row" style="justify-content:space-between;"><strong>'+escapeHtml(sportName)+'</strong><span class="helper-text">'+used+' / '+(max!=null?max:'sin tope')+' categorías</span></div>'
            + '<div class="bar-bg" style="margin-top:6px;"><div class="bar-fill" style="width:'+pct+'%"></div></div>'
            + '<div class="row" style="margin-top:8px;"><input type="number" min="0" class="text-input sportLimitInput" data-club="'+clubId+'" data-sport="'+sportId+'" placeholder="Tope (vacío = sin tope)" value="'+(max!=null?max:'')+'" style="max-width:180px;"><button class="btn secondary small saveSportLimitBtn" data-club="'+clubId+'" data-sport="'+sportId+'" type="button">Guardar tope</button></div>'
            + '</div>';
        }).join('');
        return '<div class="platform-list-item">'
          + '<strong>'+escapeHtml(c.name)+'</strong>'
          + '<div style="margin-top:6px;">'+(sportChecks||'<em style="opacity:.6;">No hay deportes en el catálogo todavía</em>')+'</div>'
          + (sportLimitBlocks || '<div class="helper-text" style="margin-top:8px;">Habilitá un deporte para fijarle un tope de categorías.</div>')
          + '<div class="row" style="margin-top:10px;"><button class="btn secondary small toggleClubUsersBtn" data-club="'+clubId+'" type="button">👥 Gestionar usuarios</button></div>'
          + '<div id="clubUsers-'+clubId+'" style="display:none;margin-top:10px;"></div>'
          + '</div>';
      }).join('');
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
            btn.textContent = '👥 Gestionar usuarios';
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
    db.collection('users').where('role','==','personal').get().then(function(snap){
      wrap.innerHTML = snap.empty ? '<div class="empty">Sin Personal Trainers todavía.</div>'
        : snap.docs.map(function(d){ return '<div class="platform-list-item">'+escapeHtml(d.data().email)+'</div>'; }).join('');
    }).catch(function(e){ fail(e); });
  }

  function createPersonalTrainer(){
    var email = document.getElementById('newPtEmail').value.trim().toLowerCase();
    var pass = document.getElementById('newPtPass').value;
    if(!email || pass.length < 6){ showToast('Contraseña de al menos 6 caracteres'); return; }
    createSecondaryAuthUser(email, pass).then(function(uid){
      return db.collection('users').doc(uid).set({ email: email, role: 'personal' });
    }).then(function(){
      document.getElementById('newPtEmail').value = '';
      document.getElementById('newPtPass').value = '';
      showToast('Cuenta de Personal Trainer creada para ' + email);
      refreshPtList();
    }).catch(function(e){
      console.error(e);
      showToast('No se pudo crear la cuenta: ' + e.message);
    });
  }
