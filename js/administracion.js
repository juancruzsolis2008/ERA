// ============ Administración: categorías, cuentas, accesos. ============
import { loadTeamsForUser } from './auth.js';
import { auth, db, firebaseConfig } from './firebase-config.js';
import { currentTeam, escapeAttr, escapeHtml, fail, showToast, state } from './state.js';

  export function createTeam(){
    var nameInput = document.getElementById('newTeamNameInput');
    var name = nameInput.value.trim();
    if(!name) return;
    db.collection('teams').add({ name: name, members: [state.user.uid] }).then(function(){
      nameInput.value = '';
      showToast('Categoría creada');
      return loadTeamsForUser();
    }).catch(function(e){ fail(e); showToast('No se pudo crear la categoría'); });
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
