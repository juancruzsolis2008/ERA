// ============ Administración: categorías, cuentas, accesos. ============
import { loadTeamsForUser } from './auth.js';
import { auth, db, firebaseConfig } from './firebase-config.js';
import { currentTeam, escapeAttr, escapeHtml, fail, showToast, state } from './state.js';

  export function createTeam(){
    var nameInput = document.getElementById('newTeamNameInput');
    var name = nameInput.value.trim();
    if(!name) return;
    // clubId/sportId hardcodeados a Once Unidos/Básquet: hoy es el único club y el
    // único deporte que existen. Cuando la Etapa 7 agregue el selector real de
    // club/deporte, esto pasa a tomarse de ahí en vez de estar fijo acá.
    db.collection('teams').add({ name: name, members: [state.user.uid], clubId: 'once-unidos', sportId: 'basquet', ownerUid: null, logoUrl: null }).then(function(){
      nameInput.value = '';
      showToast('Categoría creada');
      // Mantiene clubs/once-unidos.categoryCount al día. No es una transacción
      // estrictamente atómica (dos admins creando categorías en el mismo instante
      // podrían pisarse el conteo) — mismo nivel de confianza que ya se acepta en
      // otras partes del proyecto por no tener backend propio (ver DATABASE.md).
      db.collection('clubs').doc('once-unidos').get().then(function(clubSnap){
        var current = clubSnap.exists ? (clubSnap.data().categoryCount || 0) : 0;
        return db.collection('clubs').doc('once-unidos').set({ categoryCount: current + 1 }, { merge: true });
      }).catch(function(){ /* si todavía no se corrió la migración, no hay clubs/once-unidos que actualizar */ });
      return loadTeamsForUser();
    }).catch(function(e){ fail(e); showToast('No se pudo crear la categoría'); });
  }

  // ============ Migración a plataforma multi-club (ERA) ============
  // Mismo patrón que migratePlayerInfoToClubWide (js/jugadores.js): confirm()
  // explicando que es seguro repetir, showToast antes/después, escritura aditiva
  // que nunca borra datos existentes. Idempotente: usa .set(..., {merge:true}) con
  // valores recalculados en cada corrida, no incrementos ciegos.
  export var OWNER_EMAIL = 'juancruzsolis2008@gmail.com';

  export function migrateToMultiClub(){
    if(!confirm('Esto prepara la base para que la app soporte más de un club: crea el catálogo de deportes, el club "Once Unidos" con todas las categorías actuales adentro, y una membresía por rol para cada cuenta existente. No cambia nada de lo que ya funciona hoy (login, categorías, accesos siguen igual). Se puede repetir sin problema, no borra ni pisa datos. ¿Continuar?')) return;
    showToast('Migrando a plataforma multi-club…');

    var ownerUid = null;
    var teamsSnapGlobal = null;

    db.collection('users').where('email', '==', OWNER_EMAIL).get().then(function(ownerSnap){
      if(ownerSnap.empty) throw new Error('no-owner-account');
      ownerUid = ownerSnap.docs[0].id;
      // 1) Marcar isOwner=true PRIMERO: las reglas nuevas de sportsCatalog/clubs
      // exigen isOwner()==true, y esa escritura recién habilita las siguientes.
      return db.collection('users').doc(ownerUid).set({ isOwner: true }, { merge: true });
    }).then(function(){
      // 2) Catálogo global de deportes (solo Básquet por ahora).
      return db.collection('sportsCatalog').doc('basquet').set({ name: 'Básquet' }, { merge: true });
    }).then(function(){
      return db.collection('teams').get();
    }).then(function(teamsSnap){
      teamsSnapGlobal = teamsSnap;
      // 3) Club Once Unidos, sin límite (es el club fundador) — categoryCount es
      // la cantidad real de categorías que ya existen hoy.
      return db.collection('clubs').doc('once-unidos').set({
        name: 'Once Unidos', logoUrl: null, theme: {}, enabledSports: ['basquet'],
        maxCategories: null, categoryCount: teamsSnap.docs.length,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }).then(function(){
      // 4) Cada team existente pasa a colgar de Once Unidos/Básquet. Se tratan
      // todas las categorías actuales como categorías del club (no de un Personal
      // Trainer independiente) porque hoy TODAS se crean desde el mismo flujo de
      // Administración — no hay forma de distinguir en los datos actuales cuál
      // sería "propia" de un Personal Trainer; esa distinción real recién se puede
      // hacer desde la Etapa 7, cuando el Personal Trainer tenga su propio
      // mini-panel para crear categorías nuevas con ownerUid desde el vamos.
      var teamUpdates = teamsSnapGlobal.docs.map(function(d){
        return db.collection('teams').doc(d.id).set({ clubId: 'once-unidos', sportId: 'basquet', ownerUid: null }, { merge: true });
      });
      return Promise.all(teamUpdates);
    }).then(function(){
      return db.collection('users').get();
    }).then(function(usersSnap){
      var memberOps = [];
      usersSnap.docs.forEach(function(d){
        var uid = d.id, u = d.data();
        var effectiveRole = u.role || 'coach'; // mismo fallback que roleFlags()
        if(effectiveRole === 'personal') return; // 5) Personal Trainer: sin membership.
        var categoryIds = teamsSnapGlobal.docs.filter(function(t){
          return ((t.data().members)||[]).indexOf(uid) !== -1;
        }).map(function(t){ return t.id; });
        if(effectiveRole === 'admin'){
          // Admin de club, alcance a todos los deportes (sportId:null). Cualquier
          // cuenta con role:'admin' recibe esta membership, no solo el Dueño — el
          // Dueño además ya recibió isOwner:true en el paso 1.
          memberOps.push(
            db.collection('users').doc(uid).collection('memberships').doc('once-unidos_club')
              .set({ clubId: 'once-unidos', sportId: null, role: 'admin', categoryIds: categoryIds }, { merge: true })
          );
        } else {
          memberOps.push(
            db.collection('users').doc(uid).collection('memberships').doc('once-unidos_basquet')
              .set({ clubId: 'once-unidos', sportId: 'basquet', role: effectiveRole, categoryIds: categoryIds }, { merge: true })
          );
        }
      });
      return Promise.all(memberOps);
    }).then(function(){
      showToast('Migración a ERA completa. Todo sigue funcionando igual que antes.');
    }).catch(function(e){
      fail(e);
      if(e && e.message === 'no-owner-account'){
        showToast('No se encontró ninguna cuenta con email ' + OWNER_EMAIL + ' en Firestore → users. Revisá el email antes de repetir.');
      } else {
        showToast('No se pudo migrar. Revisá que ya publicaste las reglas nuevas de Firestore.');
      }
    });
  }

  export function createUserAccount(){
    var email = document.getElementById('newUserEmail').value.trim().toLowerCase();
    var pass = document.getElementById('newUserPass').value;
    var role = document.getElementById('newUserRole').value;
    if(!email || pass.length < 6){ showToast('Contraseña de al menos 6 caracteres'); return; }
    var secondaryApp = firebase.initializeApp(firebaseConfig, 'Secondary-'+Date.now());
    var secondaryAuth = secondaryApp.auth();
    secondaryAuth.createUserWithEmailAndPassword(email, pass).then(function(cred){
      return db.collection('users').doc(cred.user.uid).set({ email: email, role: role }).then(function(){
        return secondaryAuth.signOut();
      });
    }).then(function(){
      return secondaryApp.delete();
    }).then(function(){
      document.getElementById('newUserEmail').value = '';
      document.getElementById('newUserPass').value = '';
      showToast('Cuenta creada para ' + email);
    }).catch(function(e){
      console.error(e);
      showToast('No se pudo crear la cuenta: ' + e.message);
      secondaryApp.delete().catch(function(){});
    });
  }

  export function renderAdminTeams(){
    var wrap = document.getElementById('teamsAdminList');
    if(state.teams.length === 0){ wrap.innerHTML = '<div class="empty">Todavía no creaste categorías.</div>'; return; }
    wrap.innerHTML = '';
    state.teams.forEach(function(t){
      var card = document.createElement('div');
      card.className = 'team-admin-card';
      card.innerHTML = '<div class="row">'
        + '<input type="text" class="text-input teamNameInput" data-team="'+t.id+'" value="'+escapeAttr(t.name)+'">'
        + '<button class="btn secondary small saveTeamNameBtn" data-team="'+t.id+'" type="button">Guardar nombre</button>'
        + '<button class="btn danger small deleteTeamBtn" data-team="'+t.id+'" data-name="'+escapeAttr(t.name)+'" type="button">Eliminar categoría</button>'
        + '</div>';
      wrap.appendChild(card);
    });
    wrap.querySelectorAll('.saveTeamNameBtn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var input = wrap.querySelector('.teamNameInput[data-team="'+btn.dataset.team+'"]');
        var name = input.value.trim();
        if(!name){ showToast('Ponele un nombre a la categoría'); return; }
        db.collection('teams').doc(btn.dataset.team).update({ name: name })
          .then(function(){ showToast('Nombre actualizado'); return loadTeamsForUser(); })
          .catch(function(e){ fail(e); });
      });
    });
    wrap.querySelectorAll('.deleteTeamBtn').forEach(function(btn){
      btn.addEventListener('click', function(){
        if(!confirm('¿Eliminar la categoría "'+btn.dataset.name+'"? Esto no se puede deshacer. La asistencia, planificaciones y demás datos guardados ahí quedan sin poder verse desde la app.')) return;
        db.collection('teams').doc(btn.dataset.team).delete()
          .then(function(){ showToast('Categoría eliminada'); return loadTeamsForUser(); })
          .catch(function(e){ fail(e); });
      });
    });
  }

  export function renderUsersAdmin(){
    var wrap = document.getElementById('usersAdminList');
    return db.collection('users').get().then(function(usersSnap){
      if(usersSnap.empty){ wrap.innerHTML = '<div class="empty">Todavía no creaste cuentas.</div>'; return; }
      wrap.innerHTML = '';
      usersSnap.docs.forEach(function(d){
        var uid = d.id, u = d.data();
        var isSelf = uid === state.user.uid;
        var card = document.createElement('div');
        card.className = 'team-admin-card';
        var teamChecks = state.teams.map(function(t){
          var checked = (t.members||[]).indexOf(uid) !== -1;
          return '<label class="member-chip" style="cursor:pointer;"><input type="checkbox" data-team-toggle="'+t.id+'" data-uid="'+uid+'" '+(checked?'checked':'')+'> '+escapeHtml(t.name)+'</label>';
        }).join(' ');
        card.innerHTML = '<div class="thead"><strong>'+escapeHtml(u.email)+'</strong>'+(isSelf?' <em style="opacity:.6;font-style:normal;">(vos)</em>':'')+'</div>'
          + '<div class="row" style="margin-top:6px;">'
          + '<select class="text-input roleSelect" data-uid="'+uid+'" '+(isSelf?'disabled':'')+'>'
            + '<option value="coach"'+(u.role==='coach'?' selected':'')+'>Entrenador</option>'
            + '<option value="fisico"'+(u.role==='fisico'?' selected':'')+'>Preparador físico</option>'
            + '<option value="personal"'+(u.role==='personal'?' selected':'')+'>Personal Trainer</option>'
            + '<option value="admin"'+(u.role==='admin'?' selected':'')+'>Admin</option>'
          + '</select>'
          + '<button class="btn secondary small resetPassBtn" data-email="'+escapeAttr(u.email)+'" type="button">Restablecer contraseña</button>'
          + (isSelf?'':'<button class="btn danger small deleteUserBtn" data-uid="'+uid+'" data-email="'+escapeAttr(u.email)+'" type="button">Eliminar acceso</button>')
          + '</div>'
          + '<div style="margin-top:8px;"><span class="helper-text">Acceso a categorías:</span><br>'+(teamChecks||'<em style="opacity:.6;">No hay categorías creadas todavía</em>')+'</div>';
        wrap.appendChild(card);
      });
      wrap.querySelectorAll('.roleSelect').forEach(function(sel){
        sel.addEventListener('change', function(){
          db.collection('users').doc(sel.dataset.uid).set({ role: sel.value }, { merge: true })
            .then(function(){ showToast('Rol actualizado'); }).catch(function(e){ fail(e); });
        });
      });
      wrap.querySelectorAll('.resetPassBtn').forEach(function(btn){
        btn.addEventListener('click', function(){
          auth.sendPasswordResetEmail(btn.dataset.email)
            .then(function(){ showToast('Mail de restablecimiento enviado a ' + btn.dataset.email); })
            .catch(function(e){ fail(e); });
        });
      });
      wrap.querySelectorAll('[data-team-toggle]').forEach(function(chk){
        chk.addEventListener('change', function(){
          var teamId = chk.getAttribute('data-team-toggle'), uid = chk.getAttribute('data-uid');
          var op = chk.checked ? firebase.firestore.FieldValue.arrayUnion(uid) : firebase.firestore.FieldValue.arrayRemove(uid);
          db.collection('teams').doc(teamId).update({ members: op })
            .then(function(){ showToast('Acceso actualizado'); return loadTeamsForUser(); })
            .catch(function(e){ fail(e); chk.checked = !chk.checked; });
        });
      });
      wrap.querySelectorAll('.deleteUserBtn').forEach(function(btn){
        btn.addEventListener('click', function(){
          var uid = btn.dataset.uid, email = btn.dataset.email;
          if(!confirm('¿Eliminar el acceso de ' + email + '? Se le va a sacar el rol y el acceso a todas las categorías. El login en Firebase Authentication va a seguir existiendo hasta que lo borres a mano en la consola.')) return;
          var removals = state.teams.filter(function(t){ return (t.members||[]).indexOf(uid) !== -1; })
            .map(function(t){ return db.collection('teams').doc(t.id).update({ members: firebase.firestore.FieldValue.arrayRemove(uid) }); });
          Promise.all(removals).then(function(){
            return db.collection('users').doc(uid).delete();
          }).then(function(){
            showToast('Acceso de ' + email + ' eliminado');
            return loadTeamsForUser();
          }).catch(function(e){ fail(e); });
        });
      });
    });
  }

  export function shareCurrentTeam(){
    var team = currentTeam();
    if(!team) return;
    var email = prompt('Email del entrenador con el que querés compartir "'+team.name+'":');
    if(!email) return;
    var trimmed = email.trim().toLowerCase();
    db.collection('users').where('email','==', trimmed).get().then(function(snap){
      if(snap.empty){ showToast('Ese entrenador todavía no tiene cuenta (pedile al admin que le cree una)'); return; }
      var inviteeUid = snap.docs[0].id;
      if((team.members||[]).indexOf(inviteeUid) !== -1){ showToast('Ya tiene acceso a esta categoría'); return; }
      return db.collection('invites').doc(team.id+'_'+inviteeUid).set({
        teamId: team.id, teamName: team.name, invitedEmail: trimmed, invitedUid: inviteeUid,
        invitedByEmail: state.user.email, createdAt: Date.now()
      }).then(function(){ showToast('Invitación enviada a ' + trimmed); });
    }).catch(function(e){ fail(e); showToast('No se pudo enviar la invitación'); });
  }

  export function loadPendingInvites(){
    var banner = document.getElementById('inviteBanner');
    return db.collection('invites').where('invitedUid','==', state.user.uid).get().then(function(snap){
      if(snap.empty){ banner.style.display='none'; banner.innerHTML=''; return; }
      banner.style.display = 'block';
      banner.innerHTML = '<strong>Invitaciones pendientes</strong>' + snap.docs.map(function(d){
        var inv = d.data();
        return '<div class="invite-row"><span>'+escapeHtml(inv.invitedByEmail)+' te invitó a "'+escapeHtml(inv.teamName)+'"</span>'
          + '<span><button class="btn small acceptInviteBtn" data-id="'+d.id+'" data-team="'+inv.teamId+'" type="button">Aceptar</button> '
          + '<button class="btn secondary small declineInviteBtn" data-id="'+d.id+'" type="button">Rechazar</button></span></div>';
      }).join('');
      banner.querySelectorAll('.acceptInviteBtn').forEach(function(btn){
        btn.addEventListener('click', function(){
          db.collection('teams').doc(btn.dataset.team).update({ members: firebase.firestore.FieldValue.arrayUnion(state.user.uid) })
            .then(function(){ return db.collection('invites').doc(btn.dataset.id).delete(); })
            .then(function(){ showToast('Ahora tenés acceso a esa categoría'); return loadTeamsForUser(); })
            .then(function(){ return loadPendingInvites(); })
            .catch(function(e){ fail(e); });
        });
      });
      banner.querySelectorAll('.declineInviteBtn').forEach(function(btn){
        btn.addEventListener('click', function(){
          db.collection('invites').doc(btn.dataset.id).delete().then(function(){ return loadPendingInvites(); }).catch(function(e){ fail(e); });
        });
      });
    }).catch(function(e){ fail(e); });
  }
