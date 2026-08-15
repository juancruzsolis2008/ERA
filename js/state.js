// ============ Estado global compartido y helpers genéricos transversales. ============
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from './firebase-config.js';

  export var VB_W = 580, VB_H = 348;
  export var KINDS = ['pelota','fisico'];
  export var KIND_LABELS = { pelota: 'Pelota', fisico: 'Físico' };

  export var state = {
    user: null, role: null,
    teams: [], currentTeamId: null,
    players: {}, attendance: {}, plays: {}, exercises: [], publicExercises: [], editingExerciseId: null, editingExerciseSharedId: null, lessonPlans: {}, editingPlan: null, progress: {}, callups: {}, editingCallup: null,
    editFrames: [ {tokens:[], arrows:[]} ], currentFrameIndex: 0,
    selectedTokenId: null, selectedArrowId: null,
    mode: 'move', arrowPending: null, tokenSeq: 1,
    summaryCache: {}, objetivos: {}, undoStack: [], redoStack: [],
    playerInfo: {}, expandedPlayer: null, themePref: 'light', myEvents: [], calendarMonth: null, stats: {}, forumMessages: [],
    evaluations: {}, customTests: [], evoDraft: null, evoCategoryFilter: '',
    playingAnimation: false, animTimer: null,
    profilePhotoUrl: null, // users/{uid}.photoUrl del usuario logueado — Etapa 6
    isOwner: false, // users/{uid}.isOwner — Etapa 7
    memberships: [] // users/{uid}/memberships — Etapa 7 (vacío hasta correr la migración de la Etapa 3)
  };


  export function genId(prefix){ return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

  export function showToast(msg){
    var t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(function(){ t.classList.remove('show'); }, 2600);
  }

  export function escapeHtml(str){ return String(str).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  export function escapeAttr(str){ return escapeHtml(str); }

  // Transición con deslizamiento lateral entre pantallas de index.html
  // (login → selector → panel de plataforma). `reverse` invierte la dirección
  // (usado al volver atrás, ej. panel de plataforma → selector).
  export function animateEntrySwitch(hideId, showId, reverse){
    var hideEl = document.getElementById(hideId);
    var showEl = document.getElementById(showId);
    if(hideEl) hideEl.classList.add(reverse ? 'entry-slide-out-right' : 'entry-slide-out-left');
    showEl.style.display = 'flex';
    showEl.classList.remove('entry-slide-out-left','entry-slide-out-right','entry-slide-in-left','entry-slide-in-right');
    void showEl.offsetWidth; // fuerza reflow para que la animación reinicie
    showEl.classList.add(reverse ? 'entry-slide-in-left' : 'entry-slide-in-right');
    setTimeout(function(){
      if(hideEl){ hideEl.style.display = 'none'; hideEl.classList.remove('entry-slide-out-left','entry-slide-out-right'); }
      showEl.classList.remove('entry-slide-in-left','entry-slide-in-right');
    }, 380);
  }

  export function uploadImageFile(file){
    if(!file) return Promise.reject(new Error('no-file'));
    if(!/^image\//.test(file.type)){ showToast('Elegí un archivo de imagen'); return Promise.reject(new Error('not-image')); }
    if(file.size > 5*1024*1024){ showToast('La imagen no puede pesar más de 5MB'); return Promise.reject(new Error('too-big')); }
    var formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    return fetch('https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD_NAME + '/image/upload', { method: 'POST', body: formData })
      .then(function(res){ return res.json(); })
      .then(function(data){
        if(!data.secure_url){ throw new Error(data.error && data.error.message ? data.error.message : 'cloudinary-error'); }
        return data.secure_url;
      });
  }

  export function uploadForumFile(file){
    if(!file) return Promise.reject(new Error('no-file'));
    var isImage = /^image\//.test(file.type);
    var isPdf = file.type === 'application/pdf';
    if(!isImage && !isPdf){ showToast('Adjuntá una imagen o un PDF'); return Promise.reject(new Error('bad-type')); }
    var maxSize = isImage ? 5*1024*1024 : 15*1024*1024;
    if(file.size > maxSize){ showToast('El archivo no puede pesar más de '+Math.round(maxSize/1024/1024)+'MB'); return Promise.reject(new Error('too-big')); }
    var resourceType = isImage ? 'image' : 'raw';
    var formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    return fetch('https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD_NAME + '/' + resourceType + '/upload', { method: 'POST', body: formData })
      .then(function(res){ return res.json(); })
      .then(function(data){
        if(!data.secure_url){ throw new Error(data.error && data.error.message ? data.error.message : 'cloudinary-error'); }
        return { url: data.secure_url, type: isImage ? 'image' : 'pdf', name: file.name };
      });
  }

  export function deleteImageFile(){
    // Con subida "unsigned" a Cloudinary no se puede borrar el archivo real desde
    // el navegador (requeriría el API secret, que nunca va en este código). Al
    // "quitar" una foto, solo se desvincula de Firestore; el archivo queda
    // huérfano en la cuenta de Cloudinary.
    return Promise.resolve();
  }

  export function avatarHtml(name, url, size){
    size = size || 32;
    if(url) return '<img src="'+escapeAttr(url)+'" class="avatar-img" style="width:'+size+'px;height:'+size+'px;">';
    var initials = (name||'').trim().split(/\s+/).map(function(w){return w[0]||'';}).slice(0,2).join('').toUpperCase();
    return '<span class="avatar-fallback" style="width:'+size+'px;height:'+size+'px;font-size:'+Math.round(size*0.4)+'px;">'+escapeHtml(initials)+'</span>';
  }

  export function photoThumbHtml(url, size){
    if(!url) return '';
    size = size || 44;
    return '<img src="'+escapeAttr(url)+'" class="photo-thumb" style="width:'+size+'px;height:'+size+'px;">';
  }

  export function openLightbox(url){
    if(!url) return;
    document.getElementById('lightboxImg').src = url;
    document.getElementById('lightboxOverlay').hidden = false;
  }

  export function closeLightbox(){
    document.getElementById('lightboxOverlay').hidden = true;
    document.getElementById('lightboxImg').src = '';
  }

  export function pdfDoc(){ return new window.jspdf.jsPDF({ unit:'pt', format:'a4' }); }

  export function pdfWrapped(doc, text, x, y, maxWidth, lineHeight){
    var lines = doc.splitTextToSize(String(text), maxWidth);
    lines.forEach(function(line){
      if(y > 780){ doc.addPage(); y = 40; }
      doc.text(line, x, y);
      y += lineHeight;
    });
    return y;
  }

  export function pdfFileName(name){ return (name||'archivo').toLowerCase().replace(/[^\w\-]+/g,'_').replace(/^_+|_+$/g,'') || 'archivo'; }

  export function imageUrlToPdfData(url){
    return fetch(url).then(function(res){ return res.blob(); }).then(function(blob){
      return new Promise(function(resolve, reject){
        var reader = new FileReader();
        reader.onload = function(){
          var dataUrl = reader.result;
          var img = new Image();
          img.onload = function(){ resolve({ dataUrl: dataUrl, w: img.naturalWidth || 1, h: img.naturalHeight || 1 }); };
          img.onerror = function(){ resolve({ dataUrl: dataUrl, w: 1, h: 1 }); };
          img.src = dataUrl;
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    });
  }

  export function pdfImageFormat(dataUrl){
    var m = /^data:image\/(\w+);/.exec(dataUrl);
    var f = m ? m[1].toUpperCase() : 'JPEG';
    return f === 'JPG' ? 'JPEG' : f;
  }

  export function fail(e){
    var banner = document.getElementById('fallbackBanner');
    banner.textContent = 'No se pudo completar la operación: ' + (e && e.code ? e.code : 'error desconocido') + '. Revisá tu conexión y los permisos de Firebase.';
    banner.style.display='block';
    console.error(e);
    clearTimeout(banner._hideTimer);
    banner._hideTimer = setTimeout(function(){ banner.style.display='none'; }, 6000);
  }

  export function currentTeam(){ return state.teams.find(function(t){ return t.id===state.currentTeamId; }); }

  export function isoDateLocal(d){
    var tzOff = d.getTimezoneOffset()*60000;
    return new Date(d.getTime() - tzOff).toISOString().slice(0,10);
  }

  export function fmtDateShort(iso){
    if(!iso) return '';
    var parts = String(iso).split('-');
    if(parts.length !== 3) return iso;
    return parts[2]+'/'+parts[1]+'/'+parts[0].slice(2);
  }
