// ============ Foro del club. ============
import { roleFlags } from './auth.js';
import { db } from './firebase-config.js';
import { avatarHtml, currentTeam, escapeAttr, escapeHtml, fail, showToast, state, uploadForumFile } from './state.js';

  export function forumCollection(){ return db.collection('forumMessages'); }

  // Filtra del lado del cliente por club+deporte de la categoría actual (Etapa 8),
  // mismo criterio que refreshPublicExercises (js/biblioteca.js): evita agregar un
  // .where() que exigiría un índice compuesto nuevo junto al orderBy(createdAt)
  // que ya tenía, y no cambia nada si la categoría actual todavía no tiene clubId
  // (no se corrió la migración de la Etapa 3).
  export function refreshForum(){
    return forumCollection().orderBy('createdAt','desc').limit(200).get().then(function(s){
      var all = s.docs.map(function(d){ var x=d.data(); x.id=d.id; return x; });
      var team = currentTeam();
      state.forumMessages = (team && team.clubId)
        ? all.filter(function(m){ return m.clubId === team.clubId && m.sportId === team.sportId; })
        : all;
      renderForum();
    }).catch(function(e){ fail(e); });
  }

  // Mensaje que se está editando ahora mismo en pantalla (a lo sumo uno) —
  // en memoria, se pierde al cambiar de tab/categoría, mismo criterio que
  // selectedAdminClubId en administracion.js.
  var editingForumMessageId = null;

  export function renderForum(){
    var wrap = document.getElementById('forumMessages');
    if(!wrap) return;
    var list = state.forumMessages || [];
    if(!list.length){ wrap.innerHTML = '<div class="empty-inline">Todavía no hay mensajes. Sé el primero en escribir algo.</div>'; return; }
    // Los mensajes de la lista ya vienen filtrados por clubId+sportId de la
    // categoría actual (ver refreshForum) y roleFlags() ya resuelve
    // isClubAdmin/isCoordinador para ESA misma categoría (currentClubMembership()
    // usa currentTeam()) — un solo cálculo alcanza para toda la lista, el
    // Coordinador ya está acotado a su deporte porque el foro entero lo está.
    var f = roleFlags();
    var isModerator = f.isAdmin || f.isClubAdmin || f.isCoordinador;
    wrap.innerHTML = list.map(function(m){
      var mine = state.user && m.createdBy && m.createdBy.uid === state.user.uid;
      var when = (m.createdAt && m.createdAt.toDate) ? m.createdAt.toDate().toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : 'enviando…';
      var editedTag = m.editedAt ? ' <span class="forum-edited-tag">(editado)</span>' : '';
      var attHtml = '';
      if(m.attachmentUrl){
        if(m.attachmentType === 'image'){
          attHtml = '<img class="forum-attachment-img photo-thumb" src="'+escapeAttr(m.attachmentUrl)+'" alt="'+escapeAttr(m.attachmentName||'imagen')+'">';
        } else {
          attHtml = '<a class="btn secondary small" href="'+escapeAttr(m.attachmentUrl)+'" target="_blank" rel="noopener">📄 '+escapeHtml(m.attachmentName||'Ver PDF')+'</a>';
        }
      }
      var canModerate = mine || isModerator;
      var isEditing = editingForumMessageId === m.id;
      var editBtn = (canModerate && !isEditing) ? '<button class="btn secondary small forumEditBtn" data-id="'+m.id+'" type="button">Editar</button>' : '';
      var delBtn = (canModerate && !isEditing) ? '<button class="btn danger small forumDeleteBtn" data-id="'+m.id+'" type="button">Borrar</button>' : '';
      var bodyHtml = isEditing
        ? '<div class="forum-edit-row"><textarea class="text-input forumEditInput" data-id="'+m.id+'">'+escapeHtml(m.text||'')+'</textarea>'
          + '<div class="row" style="margin-top:6px;"><button class="btn small forumSaveEditBtn" data-id="'+m.id+'" type="button">Guardar</button>'
          + '<button class="btn secondary small forumCancelEditBtn" type="button">Cancelar</button></div></div>'
        : (m.text ? '<div class="forum-msg-text">'+escapeHtml(m.text)+'</div>' : '');
      return '<div class="forum-message'+(mine?' mine':'')+'">'
        + '<div class="forum-msg-head">'+avatarHtml((m.createdBy&&m.createdBy.email)||'', (m.createdBy&&m.createdBy.photoUrl)||null, 22)+'<span class="forum-author">'+escapeHtml((m.createdBy&&(m.createdBy.displayName||m.createdBy.email))||'Alguien')+'</span><span class="forum-time">'+when+editedTag+'</span></div>'
        + bodyHtml
        + (attHtml && !isEditing ? '<div class="forum-msg-attachment">'+attHtml+'</div>' : '')
        + ((editBtn || delBtn) ? '<div class="forum-msg-actions">'+editBtn+delBtn+'</div>' : '')
        + '</div>';
    }).join('');
    wrap.querySelectorAll('.forumDeleteBtn').forEach(function(btn){
      btn.addEventListener('click', function(){ deleteForumMessage(btn.dataset.id); });
    });
    wrap.querySelectorAll('.forumEditBtn').forEach(function(btn){
      btn.addEventListener('click', function(){ editingForumMessageId = btn.dataset.id; renderForum(); });
    });
    wrap.querySelectorAll('.forumCancelEditBtn').forEach(function(btn){
      btn.addEventListener('click', function(){ editingForumMessageId = null; renderForum(); });
    });
    wrap.querySelectorAll('.forumSaveEditBtn').forEach(function(btn){
      btn.addEventListener('click', function(){ saveForumMessageEdit(btn.dataset.id); });
    });
  }

  // Estilo WhatsApp: edita el texto in-place (no modal) y deja marca
  // "editedAt" persistente en Firestore — se muestra como "(editado)" cada
  // vez que se recarga el foro, no solo en esta sesión (renderForum de
  // arriba, junto a la hora). isModerator (Admin de club/Coordinador) puede
  // editar mensajes ajenos con la misma función, ver firestore.rules.
  export function saveForumMessageEdit(id){
    var input = document.querySelector('.forumEditInput[data-id="'+id+'"]');
    if(!input) return;
    var text = input.value.trim();
    if(!text){ showToast('El mensaje no puede quedar vacío'); return; }
    forumCollection().doc(id).update({ text: text, editedAt: firebase.firestore.FieldValue.serverTimestamp() }).then(function(){
      editingForumMessageId = null;
      showToast('Mensaje editado');
      return refreshForum();
    }).catch(function(e){ fail(e); showToast('No se pudo editar el mensaje'); });
  }

  export function sendForumMessage(){
    var input = document.getElementById('forumMessageInput');
    var fileInput = document.getElementById('forumFileInput');
    var text = input.value.trim();
    var file = fileInput.files[0];
    if(!text && !file){ showToast('Escribí un mensaje o adjuntá un archivo'); return; }
    var sendBtn = document.getElementById('forumSendBtn');
    sendBtn.disabled = true;
    var chain = file ? uploadForumFile(file) : Promise.resolve(null);
    var team = currentTeam();
    chain.then(function(att){
      var data = {
        text: text,
        attachmentUrl: att ? att.url : null,
        attachmentType: att ? att.type : null,
        attachmentName: att ? att.name : null,
        createdBy: { uid: state.user.uid, email: state.user.email, photoUrl: state.profilePhotoUrl || null, displayName: state.displayName || null },
        clubId: (team && team.clubId) || null, sportId: (team && team.sportId) || null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      return forumCollection().add(data);
    }).then(function(){
      input.value = '';
      fileInput.value = '';
      document.getElementById('forumAttachName').textContent = '';
      showToast('Mensaje enviado');
      return refreshForum();
    }).catch(function(e){ fail(e); showToast('No se pudo enviar el mensaje'); })
      .then(function(){ sendBtn.disabled = false; });
  }

  export function deleteForumMessage(id){
    if(!confirm('¿Borrar este mensaje del foro? No se puede deshacer.')) return;
    forumCollection().doc(id).delete().then(function(){
      showToast('Mensaje borrado');
      return refreshForum();
    }).catch(function(e){ fail(e); });
  }
