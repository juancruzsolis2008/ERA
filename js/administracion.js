// ============ Administración: categorías, cuentas, accesos. ============
import { currentClubMembership, loadTeamsForUser, roleFlags } from './auth.js';
import { auth, db } from './firebase-config.js';
import { createSecondaryAuthUser, currentTeam, deleteImageFile, escapeAttr, escapeHtml, fail, photoThumbHtml, showToast, state, uploadImageFile } from './state.js';

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

  // ============ Migración a plataforma multi-club (ERAM) ============
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
      // 6) Etapa 8 — backfill de forumMessages/publicExerciseLibrary viejos con
      // clubId/sportId de Once Unidos: sin esto, al activar el filtro por
      // club+deporte los mensajes/jugadas de antes de esta migración "desaparecen"
      // de la vista (no se borran, solo dejan de matchear el filtro). Solo toca
      // los docs que TODAVÍA no tienen clubId (no pisa nada ya migrado).
      return Promise.all([
        db.collection('forumMessages').get(),
        db.collection('publicExerciseLibrary').get()
      ]);
    }).then(function(res){
      var backfillOps = [];
      res[0].docs.forEach(function(d){
        if(!d.data().clubId) backfillOps.push(d.ref.set({ clubId: 'once-unidos', sportId: 'basquet' }, { merge: true }));
      });
      res[1].docs.forEach(function(d){
        if(!d.data().clubId) backfillOps.push(d.ref.set({ clubId: 'once-unidos', sportId: 'basquet' }, { merge: true }));
      });
      return Promise.all(backfillOps);
    }).then(function(){
      showToast('Migración a ERAM completa. Todo sigue funcionando igual que antes.');
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
    createSecondaryAuthUser(email, pass).then(function(uid){
      return db.collection('users').doc(uid).set({ email: email, role: role });
    }).then(function(){
      document.getElementById('newUserEmail').value = '';
      document.getElementById('newUserPass').value = '';
      showToast('Cuenta creada para ' + email);
    }).catch(function(e){
      console.error(e);
      showToast('No se pudo crear la cuenta: ' + e.message);
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
        + '</div>'
        + '<div class="photo-row">' + photoThumbHtml(t.logoUrl, 40)
        + '<input type="file" accept="image/*" class="teamLogoInput" data-team="'+t.id+'">'
        + (t.logoUrl ? '<button class="btn secondary small removeTeamLogoBtn" data-team="'+t.id+'" type="button">Quitar escudo</button>' : '')
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
    wrap.querySelectorAll('.teamLogoInput').forEach(function(inp){
      inp.addEventListener('change', function(){
        var file = inp.files[0];
        if(!file) return;
        showToast('Subiendo escudo…');
        uploadImageFile(file).then(function(url){
          return db.collection('teams').doc(inp.dataset.team).update({ logoUrl: url });
        }).then(function(){
          showToast('Escudo guardado');
          return loadTeamsForUser(); // ya re-renderiza teamsAdminList al final (rol admin)
        }).catch(function(e){ if(e.message!=='not-image'&&e.message!=='too-big') fail(e); });
      });
    });
    wrap.querySelectorAll('.removeTeamLogoBtn').forEach(function(btn){
      btn.addEventListener('click', function(){
        deleteImageFile().then(function(){
          return db.collection('teams').doc(btn.dataset.team).update({ logoUrl: null });
        }).then(function(){
          showToast('Escudo eliminado');
          return loadTeamsForUser(); // ya re-renderiza teamsAdminList al final (rol admin)
        }).catch(function(e){ fail(e); });
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

  // ============ Administración por rol (Etapa 7) ============
  // Decide qué de los tres paneles de #tab-admin mostrar: el completo (Dueño/admin
  // legacy, sin cambios), el acotado a club/deporte (Admin de club/Coordinador), o
  // el mini-panel de Personal Trainer. Se llama desde applyRoleVisibility().
  export function renderAdminPanelForRole(){
    var f = roleFlags();
    var fullEl = document.getElementById('adminFullPanel');
    var scopedEl = document.getElementById('adminClubScopedPanel');
    var ptEl = document.getElementById('adminPersonalPanel');
    if(!fullEl) return; // #tab-admin no está en esta página
    fullEl.style.display = f.isAdmin ? '' : 'none';
    scopedEl.style.display = (!f.isAdmin && (f.isClubAdmin || f.isCoordinador)) ? '' : 'none';
    ptEl.style.display = (!f.isAdmin && f.isPersonal) ? '' : 'none';
    if(!f.isAdmin && (f.isClubAdmin || f.isCoordinador)) renderScopedAdminPanel();
    if(!f.isAdmin && f.isPersonal) renderPtAdminPanel();
  }

  function scopedTeams(membership){
    return state.teams.filter(function(t){
      return t.clubId === membership.clubId && (membership.sportId == null || t.sportId === membership.sportId);
    });
  }

  function renderScopedAdminPanel(){
    var membership = currentClubMembership();
    if(!membership) return;
    var descEl = document.getElementById('clubScopedDesc');
    db.collection('clubs').doc(membership.clubId).get().then(function(clubSnap){
      var clubName = clubSnap.exists ? clubSnap.data().name : membership.clubId;
      descEl.textContent = membership.sportId == null
        ? 'Gestioná las categorías y accesos de ' + clubName + ' (todos los deportes).'
        : 'Gestioná las categorías y accesos de tu deporte en ' + clubName + '.';
    });
    var sportSelect = document.getElementById('scopedTeamSportSelect');
    if(membership.sportId){
      sportSelect.style.display = 'none'; sportSelect.innerHTML = '';
    } else {
      sportSelect.style.display = '';
      db.collection('clubs').doc(membership.clubId).get().then(function(clubSnap){
        var enabledSports = (clubSnap.exists && clubSnap.data().enabledSports) || [];
        return Promise.all(enabledSports.map(function(id){ return db.collection('sportsCatalog').doc(id).get(); }));
      }).then(function(snaps){
        sportSelect.innerHTML = snaps.filter(function(s){ return s.exists; })
          .map(function(s){ return '<option value="'+s.id+'">'+escapeHtml(s.data().name)+'</option>'; }).join('');
      }).catch(function(e){ fail(e); });
    }
    var teams = scopedTeams(membership);
    renderScopedTeamsList(teams);
    renderScopedUsersList(teams);
  }

  function renderScopedTeamsList(teams){
    var wrap = document.getElementById('scopedTeamsList');
    if(!teams.length){ wrap.innerHTML = '<div class="empty">Todavía no hay categorías en tu alcance.</div>'; return; }
    wrap.innerHTML = teams.map(function(t){
      return '<div class="team-admin-card"><div class="row">'
        + '<input type="text" class="text-input scopedTeamNameInput" data-team="'+t.id+'" value="'+escapeAttr(t.name)+'">'
        + '<button class="btn secondary small saveScopedTeamNameBtn" data-team="'+t.id+'" type="button">Guardar nombre</button>'
        + '<button class="btn danger small deleteScopedTeamBtn" data-team="'+t.id+'" data-name="'+escapeAttr(t.name)+'" type="button">Eliminar categoría</button>'
        + '</div></div>';
    }).join('');
    wrap.querySelectorAll('.saveScopedTeamNameBtn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var input = wrap.querySelector('.scopedTeamNameInput[data-team="'+btn.dataset.team+'"]');
        var name = input.value.trim();
        if(!name){ showToast('Ponele un nombre a la categoría'); return; }
        db.collection('teams').doc(btn.dataset.team).update({ name: name })
          .then(function(){ showToast('Nombre actualizado'); return loadTeamsForUser(); })
          .catch(function(e){ fail(e); });
      });
    });
    wrap.querySelectorAll('.deleteScopedTeamBtn').forEach(function(btn){
      btn.addEventListener('click', function(){
        if(!confirm('¿Eliminar la categoría "'+btn.dataset.name+'"? Esto no se puede deshacer. La asistencia, planificaciones y demás datos guardados ahí quedan sin poder verse desde la app.')) return;
        db.collection('teams').doc(btn.dataset.team).delete()
          .then(function(){ showToast('Categoría eliminada'); return loadTeamsForUser(); })
          .catch(function(e){ fail(e); });
      });
    });
  }

  function renderScopedUsersList(teams){
    var wrap = document.getElementById('scopedUsersList');
    if(!teams.length){ wrap.innerHTML = '<div class="empty">Creá una categoría primero.</div>'; return; }
    db.collection('users').get().then(function(snap){
      var relevant = snap.docs.filter(function(d){ var role = d.data().role; return role === 'coach' || role === 'fisico'; });
      if(!relevant.length){ wrap.innerHTML = '<div class="empty">No hay entrenadores o preparadores físicos creados todavía. Las cuentas nuevas las crea el Dueño desde el Panel de la plataforma.</div>'; return; }
      wrap.innerHTML = relevant.map(function(d){
        var uid = d.id, u = d.data();
        var checks = teams.map(function(t){
          var checked = (t.members||[]).indexOf(uid) !== -1;
          return '<label class="member-chip" style="cursor:pointer;"><input type="checkbox" data-scoped-toggle="'+t.id+'" data-uid="'+uid+'" '+(checked?'checked':'')+'> '+escapeHtml(t.name)+'</label>';
        }).join(' ');
        return '<div class="team-admin-card"><div class="thead"><strong>'+escapeHtml(u.email)+'</strong></div><div style="margin-top:6px;">'+checks+'</div></div>';
      }).join('');
      wrap.querySelectorAll('[data-scoped-toggle]').forEach(function(chk){
        chk.addEventListener('change', function(){
          var teamId = chk.getAttribute('data-scoped-toggle'), uid = chk.getAttribute('data-uid');
          var op = chk.checked ? firebase.firestore.FieldValue.arrayUnion(uid) : firebase.firestore.FieldValue.arrayRemove(uid);
          db.collection('teams').doc(teamId).update({ members: op })
            .then(function(){ showToast('Acceso actualizado'); return loadTeamsForUser(); })
            .catch(function(e){ fail(e); chk.checked = !chk.checked; });
        });
      });
    }).catch(function(e){ fail(e); });
  }

  export function createScopedTeam(){
    var membership = currentClubMembership();
    if(!membership) return;
    var nameInput = document.getElementById('scopedTeamNameInput');
    var name = nameInput.value.trim();
    if(!name) return;
    var sportId = membership.sportId || document.getElementById('scopedTeamSportSelect').value;
    if(!sportId){ showToast('Elegí un deporte'); return; }
    db.collection('teams').add({ name: name, members: [state.user.uid], clubId: membership.clubId, sportId: sportId, ownerUid: null, logoUrl: null }).then(function(ref){
      nameInput.value = '';
      showToast('Categoría creada');
      var membershipDocId = membership.sportId ? (membership.clubId+'_'+membership.sportId) : (membership.clubId+'_club');
      db.collection('users').doc(state.user.uid).collection('memberships').doc(membershipDocId)
        .update({ categoryIds: firebase.firestore.FieldValue.arrayUnion(ref.id) }).catch(function(){});
      // categoryCount: solo Admin de club puede escribir clubs (ver
      // firestore.rules) — si sos Coordinador sin ser también Admin de club, esta
      // escritura falla en silencio; límite conocido, ver DATABASE.md.
      db.collection('clubs').doc(membership.clubId).get().then(function(clubSnap){
        var current = clubSnap.exists ? (clubSnap.data().categoryCount||0) : 0;
        return db.collection('clubs').doc(membership.clubId).set({ categoryCount: current+1 }, { merge:true });
      }).catch(function(){});
      // Refresco inmediato de la lista visible con lo que ya sabemos, en vez de
      // esperar a loadTeamsForUser() (recarga completa: datos del equipo activo +
      // horarios de TODAS las categorías) — antes la categoría nueva no aparecía
      // hasta que esa cadena pesada terminaba, y eso se sentía como que "tardaba".
      state.teams.push({ id: ref.id, name: name, members: [state.user.uid], clubId: membership.clubId, sportId: sportId, logoUrl: null });
      renderScopedAdminPanel();
      return loadTeamsForUser();
    }).catch(function(e){ fail(e); showToast('No se pudo crear la categoría'); });
  }

  // ============ Mini-panel de Personal Trainer (Etapa 7) ============
  export function renderPtAdminPanel(){
    db.collection('teams').where('ownerUid','==', state.user.uid).get().then(function(snap){
      var teams = snap.docs.map(function(d){ var t = d.data(); t.id = d.id; return t; });
      renderPtTeamsList(teams);
    }).catch(function(e){ fail(e); });
  }

  function renderPtTeamsList(teams){
    var wrap = document.getElementById('ptTeamsList');
    if(!teams.length){ wrap.innerHTML = '<div class="empty">Todavía no creaste categorías propias.</div>'; return; }
    wrap.innerHTML = teams.map(function(t){
      return '<div class="team-admin-card"><div class="row">'
        + '<input type="text" class="text-input ptTeamNameInput" data-team="'+t.id+'" value="'+escapeAttr(t.name)+'">'
        + '<button class="btn secondary small savePtTeamNameBtn" data-team="'+t.id+'" type="button">Guardar nombre</button>'
        + '<button class="btn danger small deletePtTeamBtn" data-team="'+t.id+'" data-name="'+escapeAttr(t.name)+'" type="button">Eliminar categoría</button>'
        + '</div></div>';
    }).join('');
    wrap.querySelectorAll('.savePtTeamNameBtn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var input = wrap.querySelector('.ptTeamNameInput[data-team="'+btn.dataset.team+'"]');
        var name = input.value.trim();
        if(!name){ showToast('Ponele un nombre a la categoría'); return; }
        db.collection('teams').doc(btn.dataset.team).update({ name: name })
          .then(function(){ showToast('Nombre actualizado'); return loadTeamsForUser(); })
          .then(function(){ renderPtAdminPanel(); })
          .catch(function(e){ fail(e); });
      });
    });
    wrap.querySelectorAll('.deletePtTeamBtn').forEach(function(btn){
      btn.addEventListener('click', function(){
        if(!confirm('¿Eliminar la categoría "'+btn.dataset.name+'"? Esto no se puede deshacer.')) return;
        db.collection('teams').doc(btn.dataset.team).delete()
          .then(function(){ showToast('Categoría eliminada'); return loadTeamsForUser(); })
          .then(function(){ renderPtAdminPanel(); })
          .catch(function(e){ fail(e); });
      });
    });
  }

  export function createPtTeam(){
    var nameInput = document.getElementById('ptTeamNameInput');
    var name = nameInput.value.trim();
    if(!name) return;
    db.collection('teams').add({ name: name, members: [state.user.uid], clubId: null, sportId: null, ownerUid: state.user.uid, logoUrl: null })
      .then(function(ref){
        nameInput.value = '';
        showToast('Categoría creada');
        // Mismo motivo que en createScopedTeam(): no esperar la recarga pesada de
        // loadTeamsForUser() para que la categoría nueva aparezca en la lista.
        state.teams.push({ id: ref.id, name: name, members: [state.user.uid], clubId: null, sportId: null, logoUrl: null });
        renderPtAdminPanel();
        return loadTeamsForUser();
      })
      .catch(function(e){ fail(e); showToast('No se pudo crear la categoría'); });
  }

  // ============ Usuarios de un club, por clubId (Etapa 9) ============
  // Parametrizada por clubId (no "el club actual") para que sirva desde el
  // Panel de la plataforma: el Dueño gestiona usuarios de CUALQUIER club sin
  // necesitar membership propia ahí (isAdmin()/isOwner() ya cubren esto en
  // firestore.rules, no hace falta tocar reglas). Administración (scoped, Admin
  // de club/Coordinador) sigue con su alcance de siempre — no usa esto todavía.
  var CLUB_MEMBERSHIP_ROLES = [
    { value: 'admin', label: 'Admin de club' },
    { value: 'coordinador', label: 'Coordinador' },
    { value: 'coach', label: 'Entrenador' },
    { value: 'fisico', label: 'Preparador físico' }
  ];

  function membershipRoleLabel(role){
    var found = CLUB_MEMBERSHIP_ROLES.find(function(r){ return r.value === role; });
    return found ? found.label : role;
  }

  // El rol plano de users/{uid}.role sigue controlando visibilidad de pestañas
  // GLOBALES (Rutinas/Evolución para 'fisico', etc.) sin importar el club — la
  // capacidad de Admin de club/Coordinador vive aparte, en la membership.
  function topLevelRoleFor(membershipRole){
    return membershipRole === 'fisico' ? 'fisico' : 'coach';
  }

  function uniqArr(arr){
    var seen = {}, out = [];
    arr.forEach(function(v){ if(!seen[v]){ seen[v] = true; out.push(v); } });
    return out;
  }

  // Agrupa las categorías elegidas en los docs de membership que corresponden:
  // Admin de club = un solo doc club-wide (sportId:null) con TODAS las
  // categorías elegidas, sin importar de qué deporte sean. Cualquier otro rol =
  // un doc por deporte presente en la selección (mismo convenio de ids que ya
  // usa migrateToMultiClub(): clubId+'_club' o clubId+'_'+sportId).
  function buildMembershipGroups(role, clubId, selectedTeamIds, clubTeams){
    var selectedTeams = clubTeams.filter(function(t){ return selectedTeamIds.indexOf(t.id) !== -1; });
    if(role === 'admin'){
      return [{ id: clubId+'_club', clubId: clubId, sportId: null, role: 'admin', categoryIds: selectedTeams.map(function(t){ return t.id; }) }];
    }
    var bySport = {};
    selectedTeams.forEach(function(t){
      var key = t.sportId || '_sin-deporte';
      if(!bySport[key]) bySport[key] = [];
      bySport[key].push(t.id);
    });
    return Object.keys(bySport).map(function(sportId){
      return { id: clubId+'_'+sportId, clubId: clubId, sportId: sportId, role: role, categoryIds: bySport[sportId] };
    });
  }

  function teamCheckboxesHtml(clubTeams, sportsById, checkedIds, namePrefix){
    if(!clubTeams.length) return '<em style="opacity:.6;">Este club todavía no tiene categorías creadas.</em>';
    return clubTeams.map(function(t){
      var sportName = (sportsById[t.sportId] && sportsById[t.sportId].name) || 'Sin deporte';
      var checked = checkedIds.indexOf(t.id) !== -1;
      return '<label class="member-chip" style="cursor:pointer;"><input type="checkbox" class="'+namePrefix+'TeamChk" value="'+t.id+'" '+(checked?'checked':'')+'> '+escapeHtml(sportName)+' — '+escapeHtml(t.name)+'</label>';
    }).join(' ');
  }

  function roleSelectHtml(cls, selectedRole){
    return '<select class="text-input '+cls+'">' + CLUB_MEMBERSHIP_ROLES.map(function(r){
      return '<option value="'+r.value+'"'+(r.value===selectedRole?' selected':'')+'>'+escapeHtml(r.label)+'</option>';
    }).join('') + '</select>';
  }

  export function renderClubUsersPanel(clubId, containerId){
    var wrap = document.getElementById(containerId);
    if(!wrap) return Promise.resolve();
    wrap.innerHTML = '<div class="empty">Cargando usuarios…</div>';
    return Promise.all([
      db.collection('sportsCatalog').get(),
      db.collection('teams').where('clubId','==', clubId).get(),
      db.collection('users').get()
    ]).then(function(res){
      var sportsById = {};
      res[0].docs.forEach(function(d){ sportsById[d.id] = d.data(); });
      var clubTeams = res[1].docs.map(function(d){ var t = d.data(); t.id = d.id; return t; });
      var usersSnap = res[2];
      return Promise.all(usersSnap.docs.map(function(d){
        return db.collection('users').doc(d.id).collection('memberships').get().then(function(mSnap){
          var memberships = mSnap.docs.map(function(m){ var v = m.data(); v.id = m.id; return v; })
            .filter(function(m){ return m.clubId === clubId; });
          return { uid: d.id, email: d.data().email, memberships: memberships };
        });
      })).then(function(all){
        var clubUsers = all.filter(function(u){ return u.memberships.length > 0; });
        renderClubUsersList(wrap, clubId, clubUsers, sportsById, clubTeams);
        renderClubUserCreateForm(wrap, clubId, sportsById, clubTeams);
      });
    }).catch(function(e){
      fail(e);
      wrap.innerHTML = '<div class="empty">No se pudieron cargar los usuarios de este club.</div>';
    });
  }

  function renderClubUsersList(wrap, clubId, clubUsers, sportsById, clubTeams){
    var listEl = document.createElement('div');
    listEl.id = wrap.id + '-list';
    if(!clubUsers.length){
      listEl.innerHTML = '<div class="empty">Este club todavía no tiene usuarios.</div>';
    } else {
      listEl.innerHTML = clubUsers.map(function(u){
        var teamIds = uniqArr(u.memberships.reduce(function(acc,m){ return acc.concat(m.categoryIds||[]); }, []));
        var role = u.memberships[0].role; // una cuenta tiene un solo rol POR club acá (varios docs = varios deportes, mismo rol)
        var membershipDesc = u.memberships.map(function(m){
          var scope = m.sportId ? ((sportsById[m.sportId]&&sportsById[m.sportId].name)||m.sportId) : 'Todos los deportes';
          var cats = (m.categoryIds||[]).map(function(id){ var t = clubTeams.find(function(x){return x.id===id;}); return t ? t.name : id; });
          return scope + (cats.length ? (': '+cats.join(', ')) : ' (sin categorías asignadas)');
        }).join(' · ');
        return '<div class="team-admin-card" id="clubUserCard-'+clubId+'-'+u.uid+'">'
          + '<div class="thead"><strong>'+escapeHtml(u.email)+'</strong> <span class="helper-text">'+escapeHtml(membershipRoleLabel(role))+'</span></div>'
          + '<div class="helper-text" style="margin-top:4px;">'+escapeHtml(membershipDesc)+'</div>'
          + '<div class="row" style="margin-top:8px;">'
          + '<button class="btn secondary small editClubUserBtn" data-uid="'+u.uid+'" type="button">Editar</button>'
          + '<button class="btn danger small deleteClubUserBtn" data-uid="'+u.uid+'" data-email="'+escapeAttr(u.email)+'" type="button">Sacar acceso a este club</button>'
          + '</div>'
          + '<div class="club-user-edit-form" id="clubUserEdit-'+clubId+'-'+u.uid+'" style="display:none;margin-top:10px;"></div>'
          + '</div>';
      }).join('');
    }
    wrap.innerHTML = '';
    wrap.appendChild(listEl);

    listEl.querySelectorAll('.editClubUserBtn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var u = clubUsers.find(function(x){ return x.uid === btn.dataset.uid; });
        renderClubUserEditForm(u, clubId, sportsById, clubTeams, function(){ renderClubUsersPanel(clubId, wrap.id); });
      });
    });
    listEl.querySelectorAll('.deleteClubUserBtn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var u = clubUsers.find(function(x){ return x.uid === btn.dataset.uid; });
        deleteClubUserAccess(clubId, u, function(){ renderClubUsersPanel(clubId, wrap.id); });
      });
    });
  }

  function renderClubUserEditForm(u, clubId, sportsById, clubTeams, onDone){
    var host = document.getElementById('clubUserEdit-'+clubId+'-'+u.uid);
    if(!host) return;
    var editKey = clubId+'-'+u.uid;
    var currentRole = u.memberships[0].role;
    var currentTeamIds = uniqArr(u.memberships.reduce(function(acc,m){ return acc.concat(m.categoryIds||[]); }, []));
    host.style.display = '';
    host.innerHTML = '<div class="row"><span class="helper-text">Rol:</span>' + roleSelectHtml('editRoleSelect-'+editKey, currentRole) + '</div>'
      + '<div style="margin-top:8px;"><span class="helper-text">Categorías:</span><br>' + teamCheckboxesHtml(clubTeams, sportsById, currentTeamIds, 'edit'+editKey) + '</div>'
      + '<div class="row" style="margin-top:10px;">'
      + '<button class="btn small saveClubUserEditBtn" type="button">Guardar cambios</button>'
      + '<button class="btn secondary small cancelClubUserEditBtn" type="button">Cancelar</button>'
      + '</div>';
    host.querySelector('.cancelClubUserEditBtn').addEventListener('click', function(){ host.style.display = 'none'; host.innerHTML = ''; });
    host.querySelector('.saveClubUserEditBtn').addEventListener('click', function(){
      var newRole = host.querySelector('.editRoleSelect-'+editKey).value;
      var newTeamIds = Array.prototype.map.call(host.querySelectorAll('.edit'+editKey+'TeamChk:checked'), function(chk){ return chk.value; });
      if(newRole !== 'admin' && newTeamIds.length === 0){ showToast('Elegí al menos una categoría'); return; }
      updateClubUserMemberships(clubId, u, newRole, newTeamIds, clubTeams, onDone);
    });
  }

  function renderClubUserCreateForm(wrap, clubId, sportsById, clubTeams){
    var formEl = document.createElement('div');
    formEl.className = 'team-admin-card';
    formEl.style.marginTop = '14px';
    formEl.innerHTML = '<div class="thead"><strong>Crear usuario para este club</strong></div>'
      + '<div class="row" style="margin-top:8px;"><input type="email" class="text-input" id="newClubUserEmail-'+clubId+'" placeholder="Email"><input type="text" class="text-input" id="newClubUserPass-'+clubId+'" placeholder="Contraseña provisoria"></div>'
      + '<div class="row" style="margin-top:8px;"><span class="helper-text">Rol:</span>' + roleSelectHtml('newClubUserRole-'+clubId, 'coach') + '</div>'
      + '<div style="margin-top:8px;"><span class="helper-text">Categorías:</span><br>' + teamCheckboxesHtml(clubTeams, sportsById, [], 'new'+clubId) + '</div>'
      + '<div class="row" style="margin-top:10px;"><button class="btn small createClubUserBtn" type="button">Crear usuario</button></div>';
    wrap.appendChild(formEl);
    formEl.querySelector('.createClubUserBtn').addEventListener('click', function(){
      var email = document.getElementById('newClubUserEmail-'+clubId).value.trim().toLowerCase();
      var pass = document.getElementById('newClubUserPass-'+clubId).value;
      var role = formEl.querySelector('.newClubUserRole-'+clubId).value;
      var teamIds = Array.prototype.map.call(formEl.querySelectorAll('.new'+clubId+'TeamChk:checked'), function(chk){ return chk.value; });
      if(!email || pass.length < 6){ showToast('Contraseña de al menos 6 caracteres'); return; }
      if(role !== 'admin' && teamIds.length === 0){ showToast('Elegí al menos una categoría'); return; }
      createClubUser(clubId, email, pass, role, teamIds, clubTeams, function(){ renderClubUsersPanel(clubId, wrap.id); });
    });
  }

  function createClubUser(clubId, email, pass, role, selectedTeamIds, clubTeams, onDone){
    createSecondaryAuthUser(email, pass).then(function(uid){
      var groups = buildMembershipGroups(role, clubId, selectedTeamIds, clubTeams);
      var ops = [ db.collection('users').doc(uid).set({ email: email, role: topLevelRoleFor(role) }) ];
      groups.forEach(function(g){
        ops.push(db.collection('users').doc(uid).collection('memberships').doc(g.id)
          .set({ clubId: g.clubId, sportId: g.sportId, role: g.role, categoryIds: g.categoryIds }));
      });
      selectedTeamIds.forEach(function(teamId){
        ops.push(db.collection('teams').doc(teamId).update({ members: firebase.firestore.FieldValue.arrayUnion(uid) }));
      });
      return Promise.all(ops);
    }).then(function(){
      showToast('Usuario creado para ' + email);
      if(onDone) onDone();
    }).catch(function(e){
      console.error(e);
      showToast('No se pudo crear el usuario: ' + e.message);
    });
  }

  function updateClubUserMemberships(clubId, u, newRole, newTeamIds, clubTeams, onDone){
    var oldMemberships = u.memberships;
    var oldTeamIds = uniqArr(oldMemberships.reduce(function(acc,m){ return acc.concat(m.categoryIds||[]); }, []));
    var newGroups = buildMembershipGroups(newRole, clubId, newTeamIds, clubTeams);
    var toRemoveFromTeams = oldTeamIds.filter(function(id){ return newTeamIds.indexOf(id) === -1; });
    var toAddToTeams = newTeamIds.filter(function(id){ return oldTeamIds.indexOf(id) === -1; });
    var ops = [];
    oldMemberships.forEach(function(m){ ops.push(db.collection('users').doc(u.uid).collection('memberships').doc(m.id).delete()); });
    newGroups.forEach(function(g){
      ops.push(db.collection('users').doc(u.uid).collection('memberships').doc(g.id)
        .set({ clubId: g.clubId, sportId: g.sportId, role: g.role, categoryIds: g.categoryIds }));
    });
    toRemoveFromTeams.forEach(function(id){ ops.push(db.collection('teams').doc(id).update({ members: firebase.firestore.FieldValue.arrayRemove(u.uid) })); });
    toAddToTeams.forEach(function(id){ ops.push(db.collection('teams').doc(id).update({ members: firebase.firestore.FieldValue.arrayUnion(u.uid) })); });
    ops.push(db.collection('users').doc(u.uid).set({ role: topLevelRoleFor(newRole) }, { merge: true }));
    Promise.all(ops).then(function(){
      showToast('Usuario actualizado');
      if(onDone) onDone();
    }).catch(function(e){ fail(e); showToast('No se pudo actualizar el usuario'); });
  }

  function deleteClubUserAccess(clubId, u, onDone){
    if(!confirm('¿Sacarle el acceso a este club a '+u.email+'? Pierde el rol y las categorías asignadas ACÁ. Si tiene acceso a otro club, ese no se toca. El login en Firebase Authentication sigue existiendo.')) return;
    var teamIds = uniqArr(u.memberships.reduce(function(acc,m){ return acc.concat(m.categoryIds||[]); }, []));
    var ops = u.memberships.map(function(m){ return db.collection('users').doc(u.uid).collection('memberships').doc(m.id).delete(); });
    teamIds.forEach(function(id){ ops.push(db.collection('teams').doc(id).update({ members: firebase.firestore.FieldValue.arrayRemove(u.uid) })); });
    Promise.all(ops).then(function(){
      showToast('Acceso a este club eliminado');
      if(onDone) onDone();
    }).catch(function(e){ fail(e); });
  }
