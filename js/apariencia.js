// ============ Preferencia de tema claro/oscuro + foto de perfil de la cuenta. ============
import { roleFlags } from './auth.js';
import { applyClubPaletteForCurrentMode, DEFAULT_ERAM_PALETTE, saveClubTheme } from './club-theme.js';
import { db } from './firebase-config.js';
import { avatarHtml, currentTeam, deleteImageFile, fail, resolveTheme, showToast, state, uploadImageFile } from './state.js';

  export function applyTheme(pref){
    document.documentElement.setAttribute('data-theme', resolveTheme(pref));
    // Re-aplica la paleta del club (si useClubPalette está activo) para el modo
    // recién resuelto — mismo punto único de re-ejecución que usa cualquier
    // caller de applyTheme (toggle en caliente, carga inicial, etc.).
    applyClubPaletteForCurrentMode();
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

  // ============ Nombre visible (Etapa: personalización de perfil) ============
  // Se usa en el saludo de Inicio (#welcomeUser) y en el foro (createdBy.displayName)
  // con fallback al email si está vacío — ver main-app.js y foro.js.
  export function renderDisplayNameInput(){
    var input = document.getElementById('displayNameInput');
    if(input) input.value = state.displayName || '';
  }

  export function saveDisplayName(){
    var input = document.getElementById('displayNameInput');
    if(!input || !state.user) return;
    var name = input.value.trim();
    db.collection('users').doc(state.user.uid).set({ displayName: name || null }, { merge: true }).then(function(){
      state.displayName = name || null;
      var welcome = document.getElementById('welcomeUser');
      if(welcome) welcome.textContent = state.displayName || state.user.email;
      showToast('Nombre guardado');
    }).catch(function(e){ fail(e); });
  }

  export function loadAppearancePreference(){
    return appearanceDoc().get().then(function(snap){
      var data = snap.exists ? snap.data() : {};
      state.themePref = data.theme || 'light';
      state.useClubPalette = !!data.useClubPalette; // default false — no rompe cuentas existentes sin el campo
      applyTheme(state.themePref);
      try{ localStorage.setItem('ou_theme_pref', state.themePref); }catch(e){}
      renderAppearanceTab();
      renderProfilePhotoRow();
      renderDisplayNameInput();
      renderClubPaletteUI();
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

  // Escribe useClubPalette en preferences/appearance y re-aplica tokens en caliente.
  export function setUseClubPalette(value){
    state.useClubPalette = !!value;
    applyClubPaletteForCurrentMode();
    appearanceDoc().set({ useClubPalette: state.useClubPalette }, { merge:true }).catch(function(e){
      console.error('setUseClubPalette error:', e);
    });
  }

  // ============ Paleta de colores del club (selector para todos + editor para Admin/Dueño) ============

  function clubPaletteModeHasData(mode){
    var t = state.currentClub && state.currentClub.theme && state.currentClub.theme[mode];
    return !!(t && (t.bgCourt || t.accentHardwood || t.accentScoreboard || t.lineChalk));
  }

  // Punto único de refresco de ambos bloques (selector + editor) — se llama al
  // cargar preferencias y cada vez que se cambia de categoría/club (ver
  // loadTeamData() en main-app.js, que encadena esto después de cargar el club).
  export function renderClubPaletteUI(){
    renderClubPaletteSelector();
    renderClubPaletteEditorGate();
  }

  // Visible SOLO si el club actual definió datos en theme.light o theme.dark —
  // si nunca configuró nada, el selector ni aparece (nada para elegir).
  function renderClubPaletteSelector(){
    var wrap = document.getElementById('clubPaletteSelectorWrap');
    if(!wrap) return;
    var hasPalette = clubPaletteModeHasData('light') || clubPaletteModeHasData('dark');
    wrap.style.display = hasPalette ? '' : 'none';
    if(!hasPalette) return;
    document.querySelectorAll('#clubPaletteSelector .theme-option').forEach(function(btn){
      btn.classList.toggle('active', btn.dataset.palettePref === (state.useClubPalette ? 'club' : 'eram'));
    });
  }

  export function setClubPalette(pref){
    setUseClubPalette(pref === 'club');
    renderClubPaletteSelector();
  }

  // Admin de club/Coordinador (isClubAdmin) o Dueño (isOwner) de la categoría
  // ACTUAL — el Dueño mirando un club que no es "el suyo" también entra acá,
  // isOwner es un flag de cuenta, no depende de membership. isAdmin (legacy)
  // incluido por consistencia con el resto de gates de rol de la app.
  function renderClubPaletteEditorGate(){
    var wrap = document.getElementById('clubPaletteEditorWrap');
    if(!wrap) return;
    var team = currentTeam();
    var f = roleFlags();
    var canEdit = !!(team && team.clubId) && (f.isOwner || f.isClubAdmin || f.isAdmin);
    wrap.style.display = canEdit ? '' : 'none';
    if(canEdit){ fillPaletteEditor('light'); fillPaletteEditor('dark'); }
  }

  function paletteInputIds(mode){
    var prefix = mode === 'light' ? 'paletteLight' : 'paletteDark';
    return { bgCourt: prefix+'BgCourt', accentHardwood: prefix+'AccentHardwood', accentScoreboard: prefix+'AccentScoreboard', lineChalk: prefix+'LineChalk' };
  }

  // Precarga con los valores guardados del club, o si el club todavía no tiene
  // paleta para ese modo, con los defaults de ERAM (nunca en blanco).
  function fillPaletteEditor(mode){
    var ids = paletteInputIds(mode);
    var saved = (state.currentClub && state.currentClub.theme && state.currentClub.theme[mode]) || {};
    var defaults = DEFAULT_ERAM_PALETTE[mode];
    Object.keys(ids).forEach(function(key){
      var input = document.getElementById(ids[key]);
      if(input) input.value = saved[key] || defaults[key];
    });
    updatePalettePreview(mode);
  }

  // Preview LOCAL al componente: pinta directo los elementos del preview de acá
  // abajo, nunca toca variables CSS de :root — no le cambia la app a nadie
  // (ni siquiera a la propia sesión del Admin) hasta que se guarde.
  export function updatePalettePreview(mode){
    var ids = paletteInputIds(mode);
    var previewEl = document.getElementById(mode === 'light' ? 'palettePreviewLight' : 'palettePreviewDark');
    if(!previewEl) return;
    var bgCourtInput = document.getElementById(ids.bgCourt);
    var accentHardwoodInput = document.getElementById(ids.accentHardwood);
    var accentScoreboardInput = document.getElementById(ids.accentScoreboard);
    var lineChalkInput = document.getElementById(ids.lineChalk);
    if(!bgCourtInput || !accentHardwoodInput || !accentScoreboardInput || !lineChalkInput) return;
    previewEl.style.background = bgCourtInput.value;
    var titleEl = previewEl.querySelector('.palette-preview-title');
    if(titleEl) titleEl.style.color = lineChalkInput.value;
    var btnEl = previewEl.querySelector('.palette-preview-btn');
    if(btnEl){ btnEl.style.background = accentHardwoodInput.value; btnEl.style.color = '#fff'; btnEl.style.borderColor = accentScoreboardInput.value; }
  }

  function readPaletteEditorValues(mode){
    var ids = paletteInputIds(mode);
    var colors = {};
    Object.keys(ids).forEach(function(key){
      var input = document.getElementById(ids[key]);
      colors[key] = input ? input.value : DEFAULT_ERAM_PALETTE[mode][key];
    });
    return colors;
  }

  // Recién acá se persiste de verdad — todo lo de arriba (fillPaletteEditor/
  // updatePalettePreview) es edición local sin efecto real hasta este punto.
  export function saveClubPaletteFromEditor(){
    var team = currentTeam();
    if(!team || !team.clubId) return;
    var statusEl = document.getElementById('clubPaletteSaveStatus');
    if(statusEl) statusEl.textContent = 'Guardando...';
    var lightColors = readPaletteEditorValues('light');
    var darkColors = readPaletteEditorValues('dark');
    saveClubTheme(team.clubId, 'light', lightColors).then(function(){
      return saveClubTheme(team.clubId, 'dark', darkColors);
    }).then(function(){
      state.currentClub = state.currentClub || {};
      state.currentClub.theme = state.currentClub.theme || {};
      state.currentClub.theme.light = lightColors;
      state.currentClub.theme.dark = darkColors;
      applyClubPaletteForCurrentMode(); // re-aplica ya mismo si el Admin tiene useClubPalette activado en su propia sesión
      renderClubPaletteSelector(); // el selector puede pasar de oculto a visible si esta era la primera vez que el club definía paleta
      if(statusEl) statusEl.textContent = '';
      showToast('Paleta del club guardada');
    }).catch(function(e){
      fail(e);
      if(statusEl) statusEl.textContent = 'No se pudo guardar.';
    });
  }
