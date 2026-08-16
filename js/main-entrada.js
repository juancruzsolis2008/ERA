// ============ Entrada (login) — pantalla previa a app.html ============
import { applyTheme } from './apariencia.js';
import { ensureUserDoc } from './auth.js';
import { resolveEntryContext } from './entrada.js';
import { auth, fbBootError } from './firebase-config.js';
import { animateEntrySwitch, state } from './state.js';

  try{
    var cachedThemePref = localStorage.getItem('ou_theme_pref');
    if(cachedThemePref) applyTheme(cachedThemePref);
  }catch(e){ /* localStorage puede no estar disponible, no pasa nada */ }

  var ERAM_VERSION = 'v2026.08.15';
  var footerYearEl = document.getElementById('footerYear');
  if(footerYearEl) footerYearEl.textContent = new Date().getFullYear();
  var footerVersionEl = document.getElementById('footerVersion');
  if(footerVersionEl) footerVersionEl.textContent = ERAM_VERSION;

  var seeFeaturesLink = document.getElementById('seeFeaturesLink');
  if(seeFeaturesLink){
    seeFeaturesLink.addEventListener('click', function(){
      document.querySelector('.entry-left').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function hideAuthGate(){
    var gate = document.getElementById('authGate');
    if(gate) gate.classList.add('hide');
  }

  if(fbBootError){
    var errEl0 = document.getElementById('loginError');
    errEl0.textContent = 'No se pudo conectar con Firebase: ' + fbBootError.message;
    errEl0.style.display = 'block';
    hideAuthGate();
  }

  function openLoginFlap(){
    document.getElementById('loginFlap').classList.add('open');
    document.getElementById('loginEmail').focus();
  }
  document.getElementById('openLoginBtn').addEventListener('click', openLoginFlap);

  document.getElementById('loginBtn').addEventListener('click', function(){
    var email = document.getElementById('loginEmail').value.trim();
    var pass = document.getElementById('loginPassword').value;
    var errEl = document.getElementById('loginError');
    errEl.style.display = 'none';
    if(!email || !pass){
      errEl.textContent = 'Completá email y contraseña.';
      errEl.style.display = 'block';
      return;
    }
    auth.signInWithEmailAndPassword(email, pass).catch(function(e){
      errEl.textContent = 'No se pudo iniciar sesión (' + e.code + '): ' + e.message;
      errEl.style.display = 'block';
    });
  });
  document.getElementById('forgotLink').addEventListener('click', function(){
    var email = document.getElementById('loginEmail').value.trim();
    if(!email){ alert('Escribí tu email arriba primero.'); return; }
    auth.sendPasswordResetEmail(email).then(function(){
      alert('Te enviamos un email para restablecer la contraseña.');
    }).catch(function(e){ alert('No se pudo enviar el email: ' + e.message); });
  });

  document.getElementById('platformBackLink').addEventListener('click', function(){
    animateEntrySwitch('platformWrap', 'selectorWrap', true);
  });

  auth.onAuthStateChanged(function(user){
    if(!user){
      state.user = null; state.role = null;
      document.getElementById('loginWrap').style.display = 'flex';
      document.getElementById('selectorWrap').style.display = 'none';
      document.getElementById('platformWrap').style.display = 'none';
      hideAuthGate();
      return;
    }
    state.user = user;
    ensureUserDoc(user).then(function(){
      // resolveEntryContext() (js/entrada.js) decide: si la cuenta todavía no
      // tiene memberships (no se corrió la migración de la Etapa 3, o es Personal
      // Trainer), entra directo como siempre; si tiene una sola categoría
      // accesible, también entra directo; si tiene varias, muestra el selector.
      return resolveEntryContext();
    }).then(function(){ hideAuthGate(); })
      .catch(function(e){ hideAuthGate(); if(e.message !== 'sin-perfil') console.error(e); });
  });
