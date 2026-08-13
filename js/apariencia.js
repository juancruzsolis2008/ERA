// ============ Preferencia de tema claro/oscuro. ============
import { db } from './firebase-config.js';
import { showToast, state } from './state.js';

  export function resolveTheme(pref){
    if(pref === 'dark' || pref === 'light') return pref;
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }

  export function applyTheme(pref){
    document.documentElement.setAttribute('data-theme', resolveTheme(pref));
  }

  export function appearanceDoc(){ return db.collection('users').doc(state.user.uid).collection('preferences').doc('appearance'); }

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
