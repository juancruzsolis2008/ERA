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
      // Mantiene clubs/once-unidos.categoryCounts.basquet al día. No es una
      // transacción estrictamente atómica (dos admins creando categorías en el
      // mismo instante podrían pisarse el conteo) — mismo nivel de confianza que
      // ya se acepta en otras partes del proyecto por no tener backend propio
      // (ver DATABASE.md).
      db.collection('clubs').doc('once-unidos').get().then(function(clubSnap){
        var current = clubSnap.exists ? ((clubSnap.data().categoryCounts||{}).basquet || 0) : 0;
        return db.collection('clubs').doc('once-unidos').set({ categoryCounts: { basquet: current + 1 } }, { merge: true });
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

  // Convierte el tope de categorías de "un número por club" a "un número por
  // club+deporte" (Etapa 9). Idempotente: recalcula categoryCounts contando los
  // teams reales que existen hoy (no confía en el categoryCount viejo, que podía
  // estar desactualizado) y copia el maxCategories viejo como punto de partida
  // para CADA deporte habilitado del club — el Dueño ajusta después por deporte
  // desde el Panel de la plataforma. No borra maxCategories/categoryCount viejos
  // (quedan huérfanos sin usar), no pisa datos si se repite.
  export function migrateClubLimitsToPerSport(){
    if(!confirm('Esto convierte el tope de categorías de "un solo número por club" a "un número por club+deporte", recalculando los contadores reales desde las categorías que ya existen. No borra nada, es seguro repetirlo. ¿Continuar?')) return;
    showToast('Migrando límites por deporte…');
    db.collection('clubs').get().then(function(clubsSnap){
      return Promise.all(clubsSnap.docs.map(function(clubDoc){
        var club = clubDoc.data();
        var oldMax = club.maxCategories != null ? club.maxCategories : null;
        var enabledSports = club.enabledSports || [];
        return db.collection('teams').where('clubId','==', clubDoc.id).get().then(function(teamsSnap){
          var counts = {};
          teamsSnap.docs.forEach(function(d){
            var sportId = d.data().sportId;
            if(!sportId) return;
            counts[sportId] = (counts[sportId]||0) + 1;
          });
          var limits = {};
          enabledSports.forEach(function(sportId){ limits[sportId] = oldMax; });
          // Por si hay categorías de un deporte que ya no está en enabledSports.
          Object.keys(counts).forEach(function(sportId){ if(!(sportId in limits)) limits[sportId] = oldMax; });
          return db.collection('clubs').doc(clubDoc.id).set({ sportLimits: limits, categoryCounts: counts }, { merge: true });
        });
      }));
    }).then(function(){
      showToast('Límites por deporte migrados.');
    }).catch(function(e){ fail(e); showToast('No se pudo migrar los límites'); });
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
    // El Dueño (isOwner) ya NO usa el panel legacy (adminFullPanel): ese panel
    // opera sobre teams en flat, sin noción de club/deporte, y su "Eliminar
    // acceso" borra el doc users/{uid} entero (huérfano de Auth). El Dueño
    // ahora ve el mismo panel scoped que un Admin de club, pero del club de la
    // categoría que tiene abierta en este momento, y sin restricción de roles
    // asignables. Si algún día queda una cuenta admin legacy que NO sea el
    // Dueño, sigue viendo el panel de siempre (comportamiento sin cambios).
    // Una cuenta puede ser Admin de club/Coordinador en MÁS de un club a la
    // vez (memberships separadas) — currentClubMembership() solo devuelve la
    // primera, así que antes siempre se veía un solo club sin importar nada.
    var staffMemberships = (!f.isAdmin && !f.isOwner)
      ? state.memberships.filter(function(m){ return m.role === 'admin' || m.role === 'coordinador'; })
      : [];
    var showOwnerScoped = f.isOwner;
    var showStaffScoped = staffMemberships.length > 0;
    fullEl.style.display = (f.isAdmin && !f.isOwner) ? '' : 'none';
    scopedEl.style.display = (showOwnerScoped || showStaffScoped) ? '' : 'none';
    ptEl.style.display = (!f.isAdmin && !f.isOwner && !showStaffScoped && f.isPersonal) ? '' : 'none';
    // Preferencia de club a mostrar: lo que ya se eligió a mano en el
    // switcher (persiste al cambiar de categoría) > el club de la categoría
    // que tiene abierta ahora > lo que renderScopedAdminPanel elija por default
    // cuando ninguna de las dos aplica.
    var preferredClubId = selectedAdminClubId || (currentTeam() && currentTeam().clubId) || null;
    if(showOwnerScoped) renderScopedAdminPanel({ ownerOverride: true, clubId: preferredClubId });
    else if(showStaffScoped) renderScopedAdminPanel({ staffMemberships: staffMemberships, clubId: preferredClubId });
    if(!f.isAdmin && !f.isOwner && !showStaffScoped && f.isPersonal) renderPtAdminPanel();
  }

  // El Dueño no depende de tener una categoría abierta para elegir qué club
  // administrar (a diferencia de Admin de club/Coordinador, que sí tienen un
  // club fijo vía su membership) — si no, un club recién creado sin ninguna
  // categoría todavía sería imposible de administrar: no hay categoría para
  // "entrar", y sin entrar no hay forma de crear la primera. Este selector,
  // poblado desde la colección clubs directamente (no desde teams), rompe ese
  // círculo.
  var selectedAdminClubId = null;

  // Administración (por club) — header con club/rol/deporte, categorías
  // agrupadas por deporte con su propio tope (barra de progreso, botón "+ Nueva
  // categoría" o aviso de límite alcanzado), y usuarios reusando exactamente el
  // mismo renderClubUsersPanel del Panel de la plataforma (Etapa 9), acotado acá
  // con opts.allowedRoles/scopeSportId según el rol de quien mira.
  function renderScopedAdminPanel(opts){
    opts = opts || {};
    var switcherWrap = document.getElementById('ownerClubSwitcherWrap');
    if(opts.staffMemberships) return renderStaffClubSwitcher(opts.staffMemberships, opts.clubId);
    if(!opts.ownerOverride){
      if(switcherWrap) switcherWrap.style.display = 'none';
      var membership = currentClubMembership();
      if(!membership) return;
      return renderScopedAdminPanelForClub(membership, false);
    }
    return db.collection('clubs').get().then(function(clubsSnap){
      var clubs = clubsSnap.docs.map(function(d){ var c = d.data(); c.id = d.id; return c; });
      var descEl = document.getElementById('clubScopedDesc');
      if(!clubs.length){
        if(switcherWrap) switcherWrap.style.display = 'none';
        descEl.innerHTML = 'Todavía no hay ningún club creado. Creá uno desde el Panel de la plataforma.';
        document.getElementById('scopedTeamsList').innerHTML = '';
        document.getElementById('scopedUsersList').innerHTML = '';
        return;
      }
      var chosenId = (opts.clubId && clubs.some(function(c){ return c.id === opts.clubId; })) ? opts.clubId : clubs[0].id;
      selectedAdminClubId = chosenId;
      var switcher = document.getElementById('ownerClubSwitcher');
      if(switcherWrap && switcher){
        switcherWrap.style.display = '';
        switcher.innerHTML = clubs.map(function(c){ return '<option value="'+c.id+'"'+(c.id===chosenId?' selected':'')+'>'+escapeHtml(c.name||c.id)+'</option>'; }).join('');
        switcher.onchange = function(){ renderScopedAdminPanel({ ownerOverride: true, clubId: switcher.value }); };
      }
      return renderScopedAdminPanelForClub({ clubId: chosenId, sportId: null, role: 'admin' }, true);
    }).catch(function(e){ fail(e); });
  }

  // Cuenta (no Dueño) con memberships de Admin de club/Coordinador en MÁS de
  // un club — selector acotado a ESOS clubes (no a todos los de ERAM, a
  // diferencia del Dueño). Con un solo club, se comporta exactamente como
  // antes, sin mostrar ningún selector.
  function renderStaffClubSwitcher(staffMemberships, preferredClubId){
    var switcherWrap = document.getElementById('ownerClubSwitcherWrap');
    var uniqueClubIds = uniqArr(staffMemberships.map(function(m){ return m.clubId; }));
    if(uniqueClubIds.length <= 1){
      if(switcherWrap) switcherWrap.style.display = 'none';
      return renderScopedAdminPanelForClub(staffMemberships[0], false);
    }
    return Promise.all(uniqueClubIds.map(function(id){ return db.collection('clubs').doc(id).get(); })).then(function(snaps){
      var chosenId = (preferredClubId && uniqueClubIds.indexOf(preferredClubId) !== -1) ? preferredClubId : uniqueClubIds[0];
      selectedAdminClubId = chosenId;
      var switcher = document.getElementById('ownerClubSwitcher');
      if(switcherWrap && switcher){
        switcherWrap.style.display = '';
        switcher.innerHTML = snaps.map(function(s){
          var name = s.exists ? (s.data().name || s.id) : s.id;
          return '<option value="'+s.id+'"'+(s.id===chosenId?' selected':'')+'>'+escapeHtml(name)+'</option>';
        }).join('');
        switcher.onchange = function(){ renderScopedAdminPanel({ staffMemberships: staffMemberships, clubId: switcher.value }); };
      }
      // Puede tener más de una membership en el club elegido (ej. Coordinador
      // de dos deportes distintos del mismo club) — prioriza Admin de club si
      // tiene, si no la primera que encuentre.
      var membershipsInClub = staffMemberships.filter(function(m){ return m.clubId === chosenId; });
      var chosen = membershipsInClub.find(function(m){ return m.role === 'admin'; }) || membershipsInClub[0];
      return renderScopedAdminPanelForClub(chosen, false);
    }).catch(function(e){ fail(e); });
  }

  function renderScopedAdminPanelForClub(membership, isOwnerOverride){
    var isClubWideAdmin = membership.sportId == null;
    var descEl = document.getElementById('clubScopedDesc');
    // Todo separado por club Y deporte: un Admin de club con varios deportes
    // habilitados ve acá SOLO el deporte de la categoría con la que entró
    // (currentTeam()) — para ver otro deporte, "Cambiar Club/Deporte" arriba.
    // Sin categoría abierta en este club todavía (club nuevo, cero categorías
    // en cualquier deporte) se muestran todos los deportes habilitados, para
    // poder crear la primera categoría en el que sea.
    var ctxTeam = currentTeam();
    var contextSportId = (isClubWideAdmin && ctxTeam && ctxTeam.clubId === membership.clubId) ? ctxTeam.sportId : null;
    return db.collection('clubs').doc(membership.clubId).get().then(function(clubSnap){
      var club = clubSnap.exists ? clubSnap.data() : {};
      var clubName = club.name || membership.clubId;
      var sportIdsToShow = isClubWideAdmin ? (contextSportId ? [contextSportId] : (club.enabledSports||[])) : [membership.sportId];
      return Promise.all(sportIdsToShow.map(function(id){ return db.collection('sportsCatalog').doc(id).get(); })).then(function(sportSnaps){
        var sportsById = {};
        sportSnaps.forEach(function(s){ if(s.exists) sportsById[s.id] = s.data(); });
        var roleLabel = isOwnerOverride ? 'Dueño' : (isClubWideAdmin ? 'Admin de club' : 'Coordinador');
        var showSportId = isClubWideAdmin ? contextSportId : membership.sportId;
        var sportLine = showSportId ? (' · Deporte: <strong>'+escapeHtml((sportsById[showSportId]&&sportsById[showSportId].name)||showSportId)+'</strong>') : '';
        descEl.innerHTML = '<strong>'+escapeHtml(clubName)+'</strong> · '+escapeHtml(roleLabel)+sportLine;
        renderScopedCategoriesBySport(membership.clubId, sportIdsToShow, sportsById, club);
        // El Dueño puede asignar cualquier rol, incluido Admin de club — a
        // diferencia de un Admin de club/Coordinador real, que no puede.
        var allowedRoles = isOwnerOverride ? ['admin','coordinador','coach','fisico']
          : (isClubWideAdmin ? ['coordinador','coach','fisico'] : ['coach','fisico']);
        renderClubUsersPanel(membership.clubId, 'scopedUsersList', { allowedRoles: allowedRoles, scopeSportId: showSportId });
      });
    }).catch(function(e){ fail(e); });
  }

  function renderScopedCategoriesBySport(clubId, sportIds, sportsById, club){
    var wrap = document.getElementById('scopedTeamsList');
    if(!sportIds.length){ wrap.innerHTML = '<div class="empty">Tu club todavía no tiene deportes habilitados. Pedile al Dueño que habilite al menos uno desde el Panel de la plataforma.</div>'; return; }
    var limits = club.sportLimits || {};
    var counts = club.categoryCounts || {};
    wrap.innerHTML = sportIds.map(function(sportId){
      var sportName = (sportsById[sportId] && sportsById[sportId].name) || sportId;
      var max = limits[sportId] != null ? limits[sportId] : null;
      var used = counts[sportId] || 0;
      var atLimit = max != null && used >= max;
      var pct = max ? Math.min(100, Math.round(used/max*100)) : (used>0?100:0);
      var teamsOfSport = state.teams.filter(function(t){ return t.clubId===clubId && t.sportId===sportId; });
      var rows = teamsOfSport.map(function(t){
        return '<div class="row" style="margin-top:6px;">'
          + '<input type="text" class="text-input scopedTeamNameInput" data-team="'+t.id+'" value="'+escapeAttr(t.name)+'">'
          + '<button class="btn secondary small saveScopedTeamNameBtn" data-team="'+t.id+'" type="button">Guardar nombre</button>'
          + '<button class="btn danger small deleteScopedTeamBtn" data-team="'+t.id+'" data-sport="'+sportId+'" data-name="'+escapeAttr(t.name)+'" type="button">Eliminar categoría</button>'
          + '</div>';
      }).join('') || '<div class="helper-text" style="margin-top:8px;">Todavía no hay categorías en este deporte.</div>';
      var createRow = atLimit
        ? '<div class="helper-text" style="margin-top:10px;">Llegaste al límite de categorías para '+escapeHtml(sportName)+'. Para sumar más, el Dueño tiene que ampliar el plan del club desde el Panel de la plataforma.</div>'
        : '<div class="row" style="margin-top:10px;"><input type="text" class="text-input newScopedTeamName" data-sport="'+sportId+'" placeholder="Nombre (ej. U15A)"><button class="btn small createScopedTeamBtn" data-sport="'+sportId+'" type="button">+ Nueva categoría</button></div>';
      return '<div class="team-admin-card" style="margin-bottom:14px;">'
        + '<div class="row" style="justify-content:space-between;"><strong>'+escapeHtml(sportName)+'</strong><span class="helper-text">'+used+' / '+(max!=null?max:'sin tope')+' categorías</span></div>'
        + '<div class="bar-bg" style="margin-top:6px;"><div class="bar-fill" style="width:'+pct+'%"></div></div>'
        + rows + createRow
        + '</div>';
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
        var teamId = btn.dataset.team, sportId = btn.dataset.sport;
        db.collection('teams').doc(teamId).delete()
          .then(function(){
            showToast('Categoría eliminada');
            db.collection('clubs').doc(clubId).get().then(function(clubSnap){
              var curCounts = clubSnap.exists ? (clubSnap.data().categoryCounts||{}) : {};
              var cur = curCounts[sportId] || 0;
              var upd = {}; upd[sportId] = Math.max(0, cur-1);
              return db.collection('clubs').doc(clubId).set({ categoryCounts: upd }, { merge:true });
            }).catch(function(){});
            return loadTeamsForUser();
          })
          .then(function(){ renderScopedAdminPanel(); })
          .catch(function(e){ fail(e); });
      });
    });
    wrap.querySelectorAll('.createScopedTeamBtn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var sportId = btn.dataset.sport;
        var input = wrap.querySelector('.newScopedTeamName[data-sport="'+sportId+'"]');
        var name = input.value.trim();
        if(!name) return;
        createScopedTeam(clubId, sportId, name);
      });
    });
  }

  // clubId/sportId/name vienen del bloque de ESE deporte dentro de Administración
  // (un "+ Nueva categoría" por deporte, no un form único) — a diferencia de antes,
  // ya no depende de inputs estáticos globales.
  export function createScopedTeam(clubId, sportId, name){
    // clubId/sportId ya vienen resueltos por quien llama (Admin de club,
    // Coordinador, o el Dueño vía el selector de club de Administración) — no
    // depende de tener una membership propia acá; el permiso real lo valida
    // firestore.rules (isClubStaff()/isOwner()).
    db.collection('clubs').doc(clubId).get().then(function(clubSnap){
      var club = clubSnap.exists ? clubSnap.data() : {};
      var limits = club.sportLimits || {};
      var counts = club.categoryCounts || {};
      var max = limits[sportId] != null ? limits[sportId] : null;
      var used = counts[sportId] || 0;
      if(max != null && used >= max){ showToast('Llegaste al límite de categorías para este deporte'); return; }
      return db.collection('teams').add({ name: name, members: [state.user.uid], clubId: clubId, sportId: sportId, ownerUid: null, logoUrl: null }).then(function(ref){
        showToast('Categoría creada');
        // Quien crea esta categoría es Admin de club/Coordinador/Dueño — su
        // alcance es dinámico (ver .agents/rules/modelo-negocio-alcance-roles.md),
        // no hace falta (ni corresponde) sumarla a categoryIds de su membership.
        // categoryCounts: solo Admin de club puede escribir clubs (ver
        // firestore.rules) — si sos Coordinador sin ser también Admin de club,
        // esta escritura falla en silencio; límite conocido, ver DATABASE.md.
        var countsUpdate = {}; countsUpdate[sportId] = used + 1;
        db.collection('clubs').doc(clubId).set({ categoryCounts: countsUpdate }, { merge: true }).catch(function(){});
        // Refresco inmediato de la lista visible con lo que ya sabemos, en vez de
        // esperar a loadTeamsForUser() (recarga completa: datos del equipo activo +
        // horarios de TODAS las categorías) — antes la categoría nueva no aparecía
        // hasta que esa cadena pesada terminaba, y eso se sentía como que "tardaba".
        state.teams.push({ id: ref.id, name: name, members: [state.user.uid], clubId: clubId, sportId: sportId, logoUrl: null });
        renderScopedAdminPanel();
        return loadTeamsForUser();
      });
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
  // Recalcula adminClubIds/coordinadorScopes en users/{uid} desde CERO,
  // leyendo la subcolección memberships real — la usa firestore.rules
  // (isTeamStaff) para dar acceso de LISTA (loadTeamsForUser,
  // resolveEntryContext) sin el get() resource-dependiente que Firestore
  // rechaza en queries de más de un resultado. Se llama después de cualquier
  // cambio a las memberships de alguien (crear/editar/sacar acceso). Recalcular
  // entero en vez de sumar/restar a mano evita que un caso raro (rol repetido,
  // orden de ops) deje el caché desincronizado.
  function syncStaffScopeFields(uid){
    return db.collection('users').doc(uid).collection('memberships').get().then(function(snap){
      var adminClubIds = [], coordinadorScopes = [];
      snap.docs.forEach(function(d){
        var m = d.data();
        if(m.role === 'admin') adminClubIds.push(m.clubId);
        if(m.role === 'coordinador') coordinadorScopes.push(m.clubId + '_' + m.sportId);
      });
      return db.collection('users').doc(uid).set({ adminClubIds: uniqArr(adminClubIds), coordinadorScopes: uniqArr(coordinadorScopes) }, { merge: true });
    });
  }

  // Admin de club/Coordinador: alcance DINÁMICO (todo el club, o todo el
  // club+deporte), nunca una lista guardada — ver
  // .agents/rules/modelo-negocio-alcance-roles.md. categoryIds queda [] para
  // esos dos roles a propósito: quién puede operar qué categoría se resuelve
  // consultando teams en el momento (loadTeamsForUser, firestore.rules vía
  // isClubStaff), no leyendo este campo. Entrenador/Preparador físico siguen
  // con categoryIds fijo, elegido a mano.
  function buildMembershipGroups(role, clubId, selectedTeamIds, clubTeams, explicitSportId){
    if(role === 'admin'){
      return [{ id: clubId+'_club', clubId: clubId, sportId: null, role: 'admin', categoryIds: [] }];
    }
    if(role === 'coordinador'){
      return [{ id: clubId+'_'+explicitSportId, clubId: clubId, sportId: explicitSportId, role: 'coordinador', categoryIds: [] }];
    }
    var selectedTeams = clubTeams.filter(function(t){ return selectedTeamIds.indexOf(t.id) !== -1; });
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

  // Deportes con categorías ya creadas en este club (no todo sportsCatalog) —
  // opciones válidas para elegir a qué deporte coordina un Coordinador nuevo.
  function clubSportOptions(clubTeams, sportsById){
    var ids = uniqArr(clubTeams.map(function(t){ return t.sportId; }).filter(Boolean));
    return ids.map(function(id){ return { id: id, name: (sportsById[id]&&sportsById[id].name) || id }; });
  }

  function sportSelectHtml(cls, sportOptions, selectedSportId){
    if(!sportOptions.length) return '<em style="opacity:.6;">Este club todavía no tiene ninguna categoría creada en ningún deporte — creá una primero.</em>';
    return '<select class="text-input '+cls+'">' + sportOptions.map(function(s){
      return '<option value="'+s.id+'"'+(s.id===selectedSportId?' selected':'')+'>'+escapeHtml(s.name)+'</option>';
    }).join('') + '</select>';
  }

  function roleSelectHtml(cls, selectedRole, allowedRoles){
    var options = allowedRoles ? CLUB_MEMBERSHIP_ROLES.filter(function(r){ return allowedRoles.indexOf(r.value) !== -1; }) : CLUB_MEMBERSHIP_ROLES;
    return '<select class="text-input '+cls+'">' + options.map(function(r){
      return '<option value="'+r.value+'"'+(r.value===selectedRole?' selected':'')+'>'+escapeHtml(r.label)+'</option>';
    }).join('') + '</select>';
  }

  function defaultRoleFor(allowedRoles){
    return allowedRoles.indexOf('coach') !== -1 ? 'coach' : allowedRoles[0];
  }

  // opts.allowedRoles: qué roles puede crear/editar quien mira esto (Dueño en el
  // Panel de la plataforma = los 4; Admin de club = coordinador/coach/fisico,
  // nunca admin; Coordinador = coach/fisico nomás — ver firestore.rules
  // canManageMembership(), esto refleja del lado del cliente lo que el servidor
  // ya hace cumplir de verdad). opts.scopeSportId: si viene, acota categorías y
  // usuarios listados a ESE deporte (más los de alcance club-wide) — lo usa
  // Administración cuando quien mira es Coordinador; el Panel de la plataforma no
  // lo manda nunca (el Dueño ve todo el club).
  export function renderClubUsersPanel(clubId, containerId, opts){
    opts = opts || {};
    var allowedRoles = opts.allowedRoles || CLUB_MEMBERSHIP_ROLES.map(function(r){ return r.value; });
    var scopeSportId = opts.scopeSportId || null;
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
      if(scopeSportId) clubTeams = clubTeams.filter(function(t){ return t.sportId === scopeSportId; });
      var usersSnap = res[2];
      return Promise.all(usersSnap.docs.map(function(d){
        return db.collection('users').doc(d.id).collection('memberships').get().then(function(mSnap){
          var memberships = mSnap.docs.map(function(m){ var v = m.data(); v.id = m.id; return v; })
            .filter(function(m){ return m.clubId === clubId; });
          return { uid: d.id, email: d.data().email, memberships: memberships };
        });
      })).then(function(all){
        var clubUsers = all.filter(function(u){ return u.memberships.length > 0; });
        if(scopeSportId){
          clubUsers = clubUsers.filter(function(u){
            return u.memberships.some(function(m){ return m.sportId === scopeSportId || m.sportId == null; });
          });
        }
        renderClubUsersList(wrap, clubId, clubUsers, sportsById, clubTeams, allowedRoles, scopeSportId);
        renderClubUserCreateForm(wrap, clubId, sportsById, clubTeams, allowedRoles, scopeSportId);
      });
    }).catch(function(e){
      fail(e);
      wrap.innerHTML = '<div class="empty">No se pudieron cargar los usuarios de este club.</div>';
    });
  }

  function renderClubUsersList(wrap, clubId, clubUsers, sportsById, clubTeams, allowedRoles, scopeSportId){
    var listEl = document.createElement('div');
    listEl.id = wrap.id + '-list';
    if(!clubUsers.length){
      listEl.innerHTML = '<div class="empty">Este club todavía no tiene usuarios.</div>';
    } else {
      listEl.innerHTML = clubUsers.map(function(u){
        var role = u.memberships[0].role; // una cuenta tiene un solo rol POR club acá (varios docs = varios deportes, mismo rol)
        var canManage = allowedRoles.indexOf(role) !== -1;
        var membershipDesc = u.memberships.map(function(m){
          // Admin de club/Coordinador: alcance dinámico, no leer categoryIds
          // (siempre vacío para estos dos roles a propósito).
          if(m.role === 'admin') return 'Todo el club (todos los deportes, automático)';
          if(m.role === 'coordinador'){
            var sportName = (sportsById[m.sportId]&&sportsById[m.sportId].name) || m.sportId;
            return 'Todo ' + sportName + ' (automático)';
          }
          var scope = m.sportId ? ((sportsById[m.sportId]&&sportsById[m.sportId].name)||m.sportId) : 'Todos los deportes';
          var cats = (m.categoryIds||[]).map(function(id){ var t = clubTeams.find(function(x){return x.id===id;}); return t ? t.name : id; });
          return scope + (cats.length ? (': '+cats.join(', ')) : ' (sin categorías asignadas)');
        }).join(' · ');
        // Editar/Eliminar solo si el rol de esta cuenta está dentro de lo que
        // quien mira puede gestionar (un Coordinador ve al Admin de club de su
        // club en la lista, para saber quién administra, pero no puede tocarlo).
        var actions = '<button class="btn secondary small resetPassClubUserBtn" data-email="'+escapeAttr(u.email)+'" type="button">Restablecer contraseña</button>'
          + (canManage ? '<button class="btn secondary small editClubUserBtn" data-uid="'+u.uid+'" type="button">Editar</button>'
            + '<button class="btn danger small deleteClubUserBtn" data-uid="'+u.uid+'" data-email="'+escapeAttr(u.email)+'" type="button">Sacar acceso a este club</button>' : '');
        return '<div class="team-admin-card" id="clubUserCard-'+clubId+'-'+u.uid+'">'
          + '<div class="thead"><strong>'+escapeHtml(u.email)+'</strong> <span class="helper-text">'+escapeHtml(membershipRoleLabel(role))+'</span></div>'
          + '<div class="helper-text" style="margin-top:4px;">'+escapeHtml(membershipDesc)+'</div>'
          + '<div class="row" style="margin-top:8px;">' + actions + '</div>'
          + '<div class="club-user-edit-form" id="clubUserEdit-'+clubId+'-'+u.uid+'" style="display:none;margin-top:10px;"></div>'
          + '</div>';
      }).join('');
    }
    wrap.innerHTML = '';
    wrap.appendChild(listEl);

    listEl.querySelectorAll('.resetPassClubUserBtn').forEach(function(btn){
      btn.addEventListener('click', function(){
        auth.sendPasswordResetEmail(btn.dataset.email)
          .then(function(){ showToast('Mail de restablecimiento enviado a ' + btn.dataset.email); })
          .catch(function(e){ fail(e); });
      });
    });
    listEl.querySelectorAll('.editClubUserBtn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var u = clubUsers.find(function(x){ return x.uid === btn.dataset.uid; });
        renderClubUserEditForm(u, clubId, sportsById, clubTeams, allowedRoles, function(){ renderClubUsersPanel(clubId, wrap.id, { allowedRoles: allowedRoles, scopeSportId: scopeSportId }); });
      });
    });
    listEl.querySelectorAll('.deleteClubUserBtn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var u = clubUsers.find(function(x){ return x.uid === btn.dataset.uid; });
        deleteClubUserAccess(clubId, u, function(){ renderClubUsersPanel(clubId, wrap.id, { allowedRoles: allowedRoles, scopeSportId: scopeSportId }); });
      });
    });
  }

  function renderClubUserEditForm(u, clubId, sportsById, clubTeams, allowedRoles, onDone){
    var host = document.getElementById('clubUserEdit-'+clubId+'-'+u.uid);
    if(!host) return;
    var editKey = clubId+'-'+u.uid;
    var currentRole = u.memberships[0].role;
    var currentSportId = u.memberships[0].sportId || null;
    var currentTeamIds = uniqArr(u.memberships.reduce(function(acc,m){ return acc.concat(m.categoryIds||[]); }, []));
    var sportOptions = clubSportOptions(clubTeams, sportsById);
    var scopeId = 'clubUserEditScope-'+editKey;
    host.style.display = '';
    host.innerHTML = '<div class="row"><span class="helper-text">Rol:</span>' + roleSelectHtml('editRoleSelect-'+editKey, currentRole, allowedRoles) + '</div>'
      + '<div id="'+scopeId+'" style="margin-top:8px;"></div>'
      + '<div class="row" style="margin-top:10px;">'
      + '<button class="btn small saveClubUserEditBtn" type="button">Guardar cambios</button>'
      + '<button class="btn secondary small cancelClubUserEditBtn" type="button">Cancelar</button>'
      + '</div>';
    function renderScopeFor(role){
      var scopeHost = document.getElementById(scopeId);
      if(role === 'admin'){
        scopeHost.innerHTML = '<span class="helper-text">Acceso automático a todas las categorías del club (todos los deportes), presentes y futuras.</span>';
      } else if(role === 'coordinador'){
        scopeHost.innerHTML = '<span class="helper-text">Deporte a coordinar (acceso automático a todas sus categorías, presentes y futuras):</span><br>' + sportSelectHtml('edit'+editKey+'Sport', sportOptions, currentSportId || (sportOptions[0]&&sportOptions[0].id));
      } else {
        scopeHost.innerHTML = '<span class="helper-text">Categorías:</span><br>' + teamCheckboxesHtml(clubTeams, sportsById, currentTeamIds, 'edit'+editKey);
      }
    }
    renderScopeFor(currentRole);
    host.querySelector('.editRoleSelect-'+editKey).addEventListener('change', function(){ renderScopeFor(this.value); });
    host.querySelector('.cancelClubUserEditBtn').addEventListener('click', function(){ host.style.display = 'none'; host.innerHTML = ''; });
    host.querySelector('.saveClubUserEditBtn').addEventListener('click', function(){
      var newRole = host.querySelector('.editRoleSelect-'+editKey).value;
      var newTeamIds = [], explicitSportId = null;
      if(newRole === 'coordinador'){
        var sportSel = host.querySelector('.edit'+editKey+'Sport');
        explicitSportId = sportSel ? sportSel.value : null;
        if(!explicitSportId){ showToast('Este club todavía no tiene categorías para coordinar'); return; }
      } else if(newRole !== 'admin'){
        newTeamIds = Array.prototype.map.call(host.querySelectorAll('.edit'+editKey+'TeamChk:checked'), function(chk){ return chk.value; });
        if(newTeamIds.length === 0){ showToast('Elegí al menos una categoría'); return; }
      }
      updateClubUserMemberships(clubId, u, newRole, newTeamIds, clubTeams, explicitSportId, onDone);
    });
  }

  function renderClubUserCreateForm(wrap, clubId, sportsById, clubTeams, allowedRoles, scopeSportId){
    var formEl = document.createElement('div');
    formEl.className = 'team-admin-card';
    formEl.style.marginTop = '14px';
    var sportOptions = clubSportOptions(clubTeams, sportsById);
    var scopeId = 'newClubUserScope-'+clubId;
    var defaultRole = defaultRoleFor(allowedRoles);
    formEl.innerHTML = '<div class="thead"><strong>Crear usuario para este club</strong></div>'
      + '<div class="row" style="margin-top:8px;"><input type="email" class="text-input" id="newClubUserEmail-'+clubId+'" placeholder="Email"><input type="text" class="text-input" id="newClubUserPass-'+clubId+'" placeholder="Contraseña provisoria"></div>'
      + '<div class="row" style="margin-top:8px;"><span class="helper-text">Rol:</span>' + roleSelectHtml('newClubUserRole-'+clubId, defaultRole, allowedRoles) + '</div>'
      + '<div id="'+scopeId+'" style="margin-top:8px;"></div>'
      + '<div class="row" style="margin-top:10px;"><button class="btn small createClubUserBtn" type="button">Crear usuario</button></div>';
    wrap.appendChild(formEl);
    if(state.isOwner) renderOrphanRepairTool(wrap);
    function renderScopeFor(role){
      var scopeHost = document.getElementById(scopeId);
      if(role === 'admin'){
        scopeHost.innerHTML = '<span class="helper-text">Acceso automático a todas las categorías del club (todos los deportes), presentes y futuras.</span>';
      } else if(role === 'coordinador'){
        scopeHost.innerHTML = '<span class="helper-text">Deporte a coordinar (acceso automático a todas sus categorías, presentes y futuras):</span><br>' + sportSelectHtml('new'+clubId+'Sport', sportOptions, scopeSportId || (sportOptions[0]&&sportOptions[0].id));
      } else {
        scopeHost.innerHTML = '<span class="helper-text">Categorías:</span><br>' + teamCheckboxesHtml(clubTeams, sportsById, [], 'new'+clubId);
      }
    }
    renderScopeFor(defaultRole);
    formEl.querySelector('.newClubUserRole-'+clubId).addEventListener('change', function(){ renderScopeFor(this.value); });
    formEl.querySelector('.createClubUserBtn').addEventListener('click', function(){
  var email = document.getElementById('newClubUserEmail-'+clubId).value.trim().toLowerCase();
  var pass = document.getElementById('newClubUserPass-'+clubId).value;
  var role = formEl.querySelector('.newClubUserRole-'+clubId).value;
  if(!email){ showToast('Ingresá un email'); return; }
  var teamIds = [], explicitSportId = null;
  if(role === 'coordinador'){
    var sportSel = formEl.querySelector('.new'+clubId+'Sport');
    explicitSportId = sportSel ? sportSel.value : null;
    if(!explicitSportId){ showToast('Este club todavía no tiene categorías para coordinar'); return; }
  } else if(role !== 'admin'){
    teamIds = Array.prototype.map.call(formEl.querySelectorAll('.new'+clubId+'TeamChk:checked'), function(chk){ return chk.value; });
    if(teamIds.length === 0){ showToast('Elegí al menos una categoría'); return; }
  }
  var onDone = function(){ renderClubUsersPanel(clubId, wrap.id, { allowedRoles: allowedRoles, scopeSportId: scopeSportId }); };
  // Si el email ya existe en la plataforma (otro club, u otro deporte de este
  // mismo club), se le suma esta membership sin crear cuenta nueva. Si no
  // existe, sigue el flujo de siempre (crea cuenta de Auth).
  db.collection('users').where('email','==', email).limit(1).get().then(function(snap){
    if(!snap.empty){
      addExistingUserToClub(clubId, snap.docs[0].id, email, role, teamIds, clubTeams, explicitSportId, onDone);
    } else {
      if(pass.length < 6){ showToast('Contraseña de al menos 6 caracteres'); return; }
      createClubUser(clubId, email, pass, role, teamIds, clubTeams, explicitSportId, onDone);
    }
  }).catch(function(e){ fail(e); });
});
  }

  function createClubUser(clubId, email, pass, role, selectedTeamIds, clubTeams, explicitSportId, onDone){
    var newUid;
    createSecondaryAuthUser(email, pass).then(function(uid){
      newUid = uid;
      var groups = buildMembershipGroups(role, clubId, selectedTeamIds, clubTeams, explicitSportId);
      var ops = [ db.collection('users').doc(uid).set({ email: email, role: topLevelRoleFor(role) }) ];
      groups.forEach(function(g){
        ops.push(db.collection('users').doc(uid).collection('memberships').doc(g.id)
          .set({ clubId: g.clubId, sportId: g.sportId, role: g.role, categoryIds: g.categoryIds }));
      });
      // Admin de club/Coordinador: no hace falta sumarlos a teams.members —
      // firestore.rules les da acceso dinámico vía isClubStaff(). Solo
      // Entrenador/Preparador físico dependen de estar en members.
      if(role !== 'admin' && role !== 'coordinador'){
        selectedTeamIds.forEach(function(teamId){
          ops.push(db.collection('teams').doc(teamId).update({ members: firebase.firestore.FieldValue.arrayUnion(uid) }));
        });
      }
      return Promise.all(ops);
    }).then(function(){
      return syncStaffScopeFields(newUid);
    }).then(function(){
      showToast('Usuario creado para ' + email);
      if(onDone) onDone();
    }).catch(function(e){
      console.error(e);
      if(e.code === 'auth/email-already-in-use'){
        showToast('Ya existe un login con ese email pero no tiene ficha en la plataforma. Usá "Reparar cuenta huérfana" (Dueño) con el UID de Firebase Authentication.');
      } else {
        showToast('No se pudo crear el usuario: ' + e.message);
      }
    });
  }

  // Herramienta temporal solo para el Dueño: reconstruye users/{uid} cuando
  // el doc fue borrado (ej. por el viejo botón "Eliminar acceso" del panel
  // legacy, que borra el doc entero) pero la cuenta de Firebase Auth y/o la
  // subcolección memberships siguen existiendo. El UID se copia a mano desde
  // Firebase console > Authentication.
  function renderOrphanRepairTool(wrap){
    var el = document.createElement('div');
    el.className = 'team-admin-card';
    el.style.marginTop = '14px';
    el.innerHTML = '<div class="thead"><strong>Reparar cuenta huérfana (Dueño)</strong></div>'
      + '<div class="helper-text" style="margin-top:4px;">Para cuando el login de Firebase Authentication existe pero no aparece acá. Copiá el UID desde Firebase console → Authentication.</div>'
      + '<div class="row" style="margin-top:8px;"><input type="text" class="text-input" id="orphanUid" placeholder="UID de Firebase Authentication"><input type="email" class="text-input" id="orphanEmail" placeholder="Email"></div>'
      + '<div class="row" style="margin-top:8px;"><span class="helper-text">Rol:</span>' + roleSelectHtml('orphanRole', 'coach', CLUB_MEMBERSHIP_ROLES.map(function(r){ return r.value; })) + '</div>'
      + '<div class="row" style="margin-top:10px;"><button class="btn secondary small repairOrphanBtn" type="button">Reconstruir ficha</button></div>';
    wrap.appendChild(el);
    el.querySelector('.repairOrphanBtn').addEventListener('click', function(){
      var uid = document.getElementById('orphanUid').value.trim();
      var email = document.getElementById('orphanEmail').value.trim().toLowerCase();
      var role = el.querySelector('.orphanRole').value;
      if(!uid || !email){ showToast('Completá UID y email'); return; }
      if(!confirm('¿Reconstruir la ficha de ' + email + ' con UID ' + uid + '? Esto pisa users/'+uid+' con estos datos.')) return;
      repairOrphanedUserDoc(uid, email, role);
    });
  }

  function repairOrphanedUserDoc(uid, email, role){
    db.collection('users').doc(uid).set({ email: email, role: topLevelRoleFor(role) }, { merge: true }).then(function(){
      showToast('Ficha reconstruida para ' + email + '. Ya podés usar "Crear usuario" con ese email.');
    }).catch(function(e){ fail(e); });
  }
// A diferencia de createClubUser(), no crea cuenta de Auth ni pisa el doc
// users/{uid} — el usuario ya existe (en este club o en otro). Solo agrega
// la membership de ESTA selección; las que ya tenía en otros clubes/deportes
// quedan intactas, porque cada grupo se guarda en su propio doc id
// (clubId+'_sportId' o clubId+'_club') sin tocar los demás.
function addExistingUserToClub(clubId, uid, email, role, selectedTeamIds, clubTeams, explicitSportId, onDone){
  var groups = buildMembershipGroups(role, clubId, selectedTeamIds, clubTeams, explicitSportId);
  db.collection('users').doc(uid).collection('memberships').get().then(function(mSnap){
    var existingIds = mSnap.docs.map(function(d){ return d.id; });
    var overlapping = groups.filter(function(g){ return existingIds.indexOf(g.id) !== -1; });
    if(overlapping.length && !confirm('Este usuario ya tiene acceso a ese mismo club/deporte acá. Si seguís, se reemplaza lo que tenía asignado ahí por esto. ¿Continuar?')) return;
    var ops = groups.map(function(g){
      return db.collection('users').doc(uid).collection('memberships').doc(g.id)
        .set({ clubId: g.clubId, sportId: g.sportId, role: g.role, categoryIds: g.categoryIds });
    });
    if(role !== 'admin' && role !== 'coordinador'){
      selectedTeamIds.forEach(function(teamId){
        ops.push(db.collection('teams').doc(teamId).update({ members: firebase.firestore.FieldValue.arrayUnion(uid) }));
      });
    }
    ops.push(db.collection('users').doc(uid).set({ role: topLevelRoleFor(role) }, { merge: true }));
    Promise.all(ops).then(function(){
      return syncStaffScopeFields(uid);
    }).then(function(){
      showToast('Se agregó ' + email + ' a este club');
      if(onDone) onDone();
    }).catch(function(e){
      console.error(e);
      showToast('No se pudo agregar el usuario: ' + e.message);
    });
  }).catch(function(e){ fail(e); });
}

  function updateClubUserMemberships(clubId, u, newRole, newTeamIds, clubTeams, explicitSportId, onDone){
    var oldMemberships = u.memberships;
    var oldTeamIds = uniqArr(oldMemberships.reduce(function(acc,m){ return acc.concat(m.categoryIds||[]); }, []));
    var newGroups = buildMembershipGroups(newRole, clubId, newTeamIds, clubTeams, explicitSportId);
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
      return syncStaffScopeFields(u.uid);
    }).then(function(){
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
      return syncStaffScopeFields(u.uid);
    }).then(function(){
      showToast('Acceso a este club eliminado');
      if(onDone) onDone();
    }).catch(function(e){ fail(e); });
  }
