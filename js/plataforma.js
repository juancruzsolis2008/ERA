// ============ Panel de la plataforma — solo Dueño (Etapa 7). ============
import { db, firebaseConfig } from './firebase-config.js';
import { escapeHtml, fail, showToast } from './state.js';

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
        var sportChecks = allSports.map(function(s){
          var checked = (c.enabledSports||[]).indexOf(s.id) !== -1;
          return '<label class="member-chip" style="cursor:pointer;"><input type="checkbox" class="clubSportToggle" data-club="'+d.id+'" data-sport="'+s.id+'" '+(checked?'checked':'')+'> '+escapeHtml(s.name)+'</label>';
        }).join(' ');
        return '<div class="platform-list-item">'
          + '<strong>'+escapeHtml(c.name)+'</strong> <span class="helper-text">('+(c.categoryCount||0)+' categorías'+(c.maxCategories!=null?(' / tope '+c.maxCategories):' · sin tope')+')</span>'
          + '<div style="margin-top:6px;">'+(sportChecks||'<em style="opacity:.6;">No hay deportes en el catálogo todavía</em>')+'</div>'
          + '<div class="row" style="margin-top:6px;"><input type="number" min="0" class="text-input maxCategoriesInput" data-club="'+d.id+'" placeholder="Tope de categorías (vacío = sin tope)" value="'+(c.maxCategories!=null?c.maxCategories:'')+'" style="max-width:220px;"><button class="btn secondary small saveMaxCategoriesBtn" data-club="'+d.id+'" type="button">Guardar tope</button></div>'
          + '</div>';
      }).join('');
      wrap.querySelectorAll('.clubSportToggle').forEach(function(chk){
        chk.addEventListener('change', function(){
          var op = chk.checked ? firebase.firestore.FieldValue.arrayUnion(chk.dataset.sport) : firebase.firestore.FieldValue.arrayRemove(chk.dataset.sport);
          db.collection('clubs').doc(chk.dataset.club).update({ enabledSports: op })
            .then(function(){ showToast('Deportes habilitados actualizados'); })
            .catch(function(e){ fail(e); chk.checked = !chk.checked; });
        });
      });
      wrap.querySelectorAll('.saveMaxCategoriesBtn').forEach(function(btn){
        btn.addEventListener('click', function(){
          var input = wrap.querySelector('.maxCategoriesInput[data-club="'+btn.dataset.club+'"]');
          var val = input.value.trim();
          var num = val === '' ? null : parseInt(val, 10);
          db.collection('clubs').doc(btn.dataset.club).update({ maxCategories: num })
            .then(function(){ showToast('Tope actualizado'); })
            .catch(function(e){ fail(e); });
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
      name: name, logoUrl: null, theme: {}, enabledSports: [], maxCategories: null, categoryCount: 0,
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
    var secondaryApp = firebase.initializeApp(firebaseConfig, 'Secondary-'+Date.now());
    var secondaryAuth = secondaryApp.auth();
    secondaryAuth.createUserWithEmailAndPassword(email, pass).then(function(cred){
      return db.collection('users').doc(cred.user.uid).set({ email: email, role: 'personal' }).then(function(){
        return secondaryAuth.signOut();
      });
    }).then(function(){
      return secondaryApp.delete();
    }).then(function(){
      document.getElementById('newPtEmail').value = '';
      document.getElementById('newPtPass').value = '';
      showToast('Cuenta de Personal Trainer creada para ' + email);
      refreshPtList();
    }).catch(function(e){
      console.error(e);
      showToast('No se pudo crear la cuenta: ' + e.message);
      secondaryApp.delete().catch(function(){});
    });
  }
