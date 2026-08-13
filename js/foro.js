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

  export function renderForum(){
    var wrap = document.getElementById('forumMessages');
    if(!wrap) return;
    var list = state.forumMessages || [];
    if(!list.length){ wrap.innerHTML = '<div class="empty-inline">Todavía no hay mensajes. Sé el primero en escribir algo.</div>'; return; }
    wrap.innerHTML = list.map(function(m){
      var mine = state.user && m.createdBy && m.createdBy.uid === state.user.uid;
      var when = (m.createdAt && m.createdAt.toDate) ? m.createdAt.toDate().toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : 'enviando…';
      var attHtml = '';
      if(m.attachmentUrl){
        if(m.attachmentType === 'image'){
          attHtml = '<img class="forum-attachment-img photo-thumb" src="'+escapeAttr(m.attachmentUrl)+'" alt="'+escapeAttr(m.attachmentName||'imagen')+'">';
        } else {
          attHtml = '<a class="btn secondary small" href="'+escapeAttr(m.attachmentUrl)+'" target="_blank" rel="noopener">📄 '+escapeHtml(m.attachmentName||'Ver PDF')+'</a>';
        }
      }
      var delBtn = (mine || roleFlags().isAdmin) ? '<button class="btn danger small forumDeleteBtn" data-id="'+m.id+'" type="button">Borrar</button>' : '';
      return '<div class="forum-message'+(mine?' mine':'')+'">'
        + '<div class="forum-msg-head">'+avatarHtml((m.createdBy&&m.createdBy.email)||'', (m.createdBy&&m.createdBy.photoUrl)||null, 22)+'<span class="forum-author">'+escapeHtml((m.createdBy&&m.createdBy.email)||'Alguien')+'</span><span class="forum-time">'+when+'</span></div>'
        + (m.text ? '<div class="forum-msg-text">'+escapeHtml(m.text)+'</div>' : '')
        + (attHtml ? '<div class="forum-msg-attachment">'+attHtml+'</div>' : '')
        + (delBtn ? '<div class="forum-msg-actions">'+delBtn+'</div>' : '')
        + '</div>';
    }).join('');
    wrap.querySelectorAll('.forumDeleteBtn').forEach(function(btn){
      btn.addEventListener('click', function(){ deleteForumMessage(btn.dataset.id); });
    });
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
        createdBy: { uid: state.user.uid, email: state.user.email, photoUrl: state.profilePhotoUrl || null },
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
