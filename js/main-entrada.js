// ============ Entrada (login) — pantalla previa a app.html ============
import { applyTheme } from './apariencia.js';
import { ensureUserDoc } from './auth.js';
import { auth, db, fbBootError } from './firebase-config.js';
import { escapeHtml, state } from './state.js';

  try{
    var cachedThemePref = localStorage.getItem('ou_theme_pref');
    if(cachedThemePref) applyTheme(cachedThemePref);
  }catch(e){ /* localStorage puede no estar disponible, no pasa nada */ }

  if(fbBootError){
    var errEl0 = document.getElementById('loginError');
    errEl0.textContent = 'No se pudo conectar con Firebase: ' + fbBootError.message;
    errEl0.style.display = 'block';
  }

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

  // Versión liviana de loadTeamsForUser() (js/auth.js): solo necesita saber a qué
  // equipo redirigir, no carga datos de ninguna pestaña (eso lo hace app.html).
  // Mantiene la misma lógica de selección: si hay 1+ equipos, se usa el primero
  // de la lista (state.teams[0]), igual que hacía loadTeamsForUser() hasta ahora.
  function redirectToFirstTeam(){
    var q = state.role === 'admin'
      ? db.collection('teams')
      : db.collection('teams').where('members','array-contains', state.user.uid);
    return q.get().then(function(snap){
      var teams = snap.docs.map(function(d){ return { id: d.id, name: d.data().name, members: d.data().members||[] }; });
      if(teams.length === 0){
        var errEl = document.getElementById('loginError');
        errEl.textContent = 'Todavía no tenés categorías asignadas. Pedile al admin que te dé acceso. Tu UID es: ' + state.user.uid;
        errEl.style.display = 'block';
        auth.signOut();
        return;
      }
      window.location.href = 'app.html?team=' + encodeURIComponent(teams[0].id);
    }).catch(function(e){
      console.error('redirectToFirstTeam error:', e);
      var errEl = document.getElementById('loginError');
      errEl.textContent = 'Error cargando categorías: [' + escapeHtml(e.code||'sin código') + '] ' + escapeHtml(e.message||String(e));
      errEl.style.display = 'block';
    });
  }

  auth.onAuthStateChanged(function(user){
    if(!user){
      state.user = null; state.role = null;
      document.getElementById('loginWrap').style.display = 'flex';
      return;
    }
    state.user = user;
    ensureUserDoc(user).then(function(){
      return redirectToFirstTeam();
    }).catch(function(e){ if(e.message !== 'sin-perfil') console.error(e); });
  });
