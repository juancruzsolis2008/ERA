// ============ Preferencia de tema claro/oscuro + foto de perfil de la cuenta. ============
import { db } from './firebase-config.js';
import { avatarHtml, deleteImageFile, fail, showToast, state, uploadImageFile } from './state.js';

  export function resolveTheme(pref){
    if(pref === 'dark' || pref === 'light') return pref;
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }

  export function applyTheme(pref){
    document.documentElement.setAttribute('data-theme', resolveTheme(pref));
  }

  export function appearanceDoc(){ return db.collection('users').doc(state.user.uid).collection('preferences').doc('appearance'); }

  // ============ Foto de perfil de la cuenta (Etapa 6) ============
  // Mismo patrón que la foto de ficha de jugador (js/jugadores.js): input file +
  // botón "Quitar foto" condicional, uploadImageFile/deleteImageFile de state.js.
  export function renderUserAvatar(){
    var el = document.getElementById('userAvatar');
    if(el && state.user) el.innerHTML = avatarHtml(state.user.email, state.profilePhotoUrl, 28);
  }

  export function renderProfilePhotoRow(){
    var wrap = document.getElementById('profilePhotoRow');
    if(!wrap || !state.user) return;
    wrap.innerHTML = avatarHtml(state.user.email, state.profilePhotoUrl, 56)
      + '<input type="file" accept="image/*" id="profilePhotoInput">'
      + (state.profilePhotoUrl ? '<button class="btn secondary small" id="removeProfilePhotoBtn" type="button">Quitar foto</button>' : '');
    var input = document.getElementById('profilePhotoInput');
    input.addEventListener('change', function(){
      var file = input.files[0];
      if(!file) return;
      showToast('Subiendo foto…');
      uploadImageFile(file).then(function(url){
        return db.collection('users').doc(state.user.uid).set({ photoUrl: url }, { merge: true }).then(function(){ return url; });
      }).then(function(url){
        state.profilePhotoUrl = url;
        showToast('Foto de perfil guardada');
        renderUserAvatar(); renderProfilePhotoRow();
      }).catch(function(e){ if(e.message!=='not-image'&&e.message!=='too-big') fail(e); });
    });
    var removeBtn = document.getElementById('removeProfilePhotoBtn');
    if(removeBtn){
      removeBtn.addEventListener('click', function(){
        deleteImageFile().then(function(){
          return db.collection('users').doc(state.user.uid).set({ photoUrl: null }, { merge: true });
        }).then(function(){
          state.profilePhotoUrl = null;
          showToast('Foto eliminada');
          renderUserAvatar(); renderProfilePhotoRow();
        }).catch(function(e){ fail(e); });
      });
    }
  }

  export function renderAppearanceTab(){
    document.querySelectorAll('.theme-option').forEach(function(btn){
      btn.classList.toggle('active', btn.dataset.themePref === state.themePref);
    });
  }

  export function loadAppearancePreference(){
    return appearanceDoc().get().then(function(snap){
      state.themePref = (snap.exists && snap.data().theme) || 'light';
      applyTheme(state.themePref);
      try{ localStorage.setItem('ou_theme_pref', state.themePref); }catch(e){}
      renderAppearanceTab();
      renderProfilePhotoRow();
    }).catch(function(e){
      console.error('loadAppearancePreference error:', e);
      state.themePref = state.themePref || 'light';
      applyTheme(state.themePref);
    });
  }

  export function setThemePreference(pref){
    state.themePref = pref;
    applyTheme(pref);
    renderAppearanceTab();
    try{ localStorage.setItem('ou_theme_pref', pref); }catch(e){}
    var statusEl = document.getElementById('themeSaveStatus');
    if(statusEl) statusEl.textContent = 'Guardando...';
    appearanceDoc().set({ theme: pref }, { merge:true }).then(function(){
      if(statusEl) statusEl.textContent = '';
      showToast('Apariencia actualizada');
    }).catch(function(e){
      console.error('setThemePreference error:', e);
      if(statusEl) statusEl.textContent = 'No se pudo guardar. Se aplicó solo en este dispositivo.';
    });
  }
