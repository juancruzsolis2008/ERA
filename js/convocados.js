// ============ Convocatorias. ============
import { renderCalendar } from './calendario.js';
import { db } from './firebase-config.js';
import { renderDashboard } from './inicio.js';
import { escapeAttr, escapeHtml, fail, fmtDateShort, showToast, state } from './state.js';

  export var DOW_ES = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];


  export function callupCollection(teamId){ return db.collection('teams').doc(teamId||state.currentTeamId).collection('callups'); }

  export function refreshCallups(teamId){
    return callupCollection(teamId).orderBy('date','desc').get().then(function(s){
      state.callups[teamId] = s.docs.map(function(d){ var x=d.data(); x.id=d.id; return x; });
      renderCallupsList();
    }).catch(function(e){ console.error('refreshCallups error:', e); fail(e); });
  }

  export function renderCallupsList(){
    var wrap = document.getElementById('callupsList');
    var list = state.callups[state.currentTeamId] || [];
    if(!list.length){ wrap.innerHTML = '<div class="empty-inline">Todavía no hay convocatorias cargadas.</div>'; return; }
    wrap.innerHTML = '';
    list.forEach(function(c){
      var el = document.createElement('div'); el.className = 'plan-card';
      var dateLabel = c.date ? formatCallupDate(c.date) : 'Sin fecha';
      el.innerHTML = '<div><h3>'+escapeHtml((c.opponent?('vs '+c.opponent):'Convocatoria'))+'</h3><div class="meta-line">'+escapeHtml(dateLabel)+' · '+escapeHtml(String((c.players||[]).length))+' convocados</div></div><div class="play-actions"><button class="btn secondary small" data-a="open">Abrir</button><button class="btn danger small" data-a="delete">Borrar</button></div>';
      el.querySelector('[data-a="open"]').onclick = function(){ openCallup(c); };
      el.querySelector('[data-a="delete"]').onclick = function(){ if(confirm('¿Borrar esta convocatoria?')) callupCollection().doc(c.id).delete().then(function(){ return refreshCallups(state.currentTeamId); }).catch(fail); };
      wrap.appendChild(el);
    });
  }

  export function formatCallupDate(dateStr){
    var d = new Date(dateStr+'T00:00:00');
    if(isNaN(d.getTime())) return dateStr;
    return DOW_ES[d.getDay()]+' '+fmtDateShort(dateStr);
  }

  export function newCallup(){
    state.editingCallup = { id:null, date:'', opponent:'', location:'', homeAway:'local', arrivalTime:'', kickoffTime:'', players:[] };
    document.getElementById('callupEditorTitle').textContent = 'Nueva convocatoria';
    document.getElementById('callupDate').value = '';
    document.getElementById('callupOpponent').value = '';
    document.getElementById('callupLocation').value = '';
    document.getElementById('callupHomeAway').value = 'local';
    document.getElementById('callupArrivalTime').value = '';
    document.getElementById('callupKickoffTime').value = '';
    renderCallupPlayers();
    document.getElementById('callupEditor').hidden = false;
  }

  export function openCallup(c){
    state.editingCallup = Object.assign({}, c, { players: (c.players||[]).slice() });
    document.getElementById('callupEditorTitle').textContent = c.opponent ? ('vs '+c.opponent) : 'Convocatoria';
    document.getElementById('callupDate').value = c.date || '';
    document.getElementById('callupOpponent').value = c.opponent || '';
    document.getElementById('callupLocation').value = c.location || '';
    document.getElementById('callupHomeAway').value = c.homeAway || 'local';
    document.getElementById('callupArrivalTime').value = c.arrivalTime || '';
    document.getElementById('callupKickoffTime').value = c.kickoffTime || '';
    renderCallupPlayers();
    document.getElementById('callupEditor').hidden = false;
  }

  export function closeCallupEditor(){ document.getElementById('callupEditor').hidden = true; state.editingCallup = null; }

  export function renderCallupPlayers(){
    var wrap = document.getElementById('callupPlayersList');
    var roster = state.players[state.currentTeamId] || [];
    var selected = (state.editingCallup && state.editingCallup.players) || [];
    if(!roster.length){ wrap.innerHTML = '<div class="empty-inline">No hay jugadores cargados en esta categoría.</div>'; return; }
    wrap.innerHTML = roster.map(function(name){
      var checked = selected.indexOf(name) !== -1;
      return '<label><input type="checkbox" data-callup-player="'+escapeAttr(name)+'" '+(checked?'checked':'')+'> '+escapeHtml(name)+'</label>';
    }).join('');
    wrap.querySelectorAll('[data-callup-player]').forEach(function(chk){
      chk.addEventListener('change', function(){
        var name = chk.getAttribute('data-callup-player');
        var players = state.editingCallup.players;
        var idx = players.indexOf(name);
        if(chk.checked && idx === -1) players.push(name);
        else if(!chk.checked && idx !== -1) players.splice(idx, 1);
      });
    });
  }

  export function readCallupFormIntoState(){
    var c = state.editingCallup;
    c.date = document.getElementById('callupDate').value;
    c.opponent = document.getElementById('callupOpponent').value.trim();
    c.location = document.getElementById('callupLocation').value.trim();
    c.homeAway = document.getElementById('callupHomeAway').value;
    c.arrivalTime = document.getElementById('callupArrivalTime').value;
    c.kickoffTime = document.getElementById('callupKickoffTime').value;
  }

  export function buildCallupMessage(){
    var c = state.editingCallup;
    readCallupFormIntoState();
    var dayLabel = c.date ? formatCallupDate(c.date) : '';
    var lines = [];
    var intro = 'Hola, buenas!' + (dayLabel ? (' '+dayLabel) : '');
    var times = [];
    if(c.arrivalTime) times.push('hay que estar '+c.arrivalTime+'hs');
    if(c.kickoffTime) times.push('arranca '+c.kickoffTime+'hs');
    if(times.length) intro += ' ' + times.join(', ');
    if(c.opponent) intro += ' vs ' + c.opponent;
    if(c.location) intro += ' en ' + c.location;
    if(c.homeAway) intro += ' (' + c.homeAway + ')';
    lines.push(intro);
    lines.push('');
    (c.players||[]).forEach(function(p){ lines.push(p); });
    return lines.join('\n');
  }

  export function copyCallupMessage(){
    var text = buildCallupMessage();
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){ showToast('Mensaje copiado'); }).catch(function(){ showToast('No se pudo copiar, copialo a mano'); });
    } else {
      showToast('No se pudo copiar, copialo a mano');
    }
  }

  export function saveCallup(){
    var c = state.editingCallup;
    if(!c) return;
    readCallupFormIntoState();
    if(!c.date){ showToast('Elegí la fecha del partido'); return; }
    if(!c.players.length){ showToast('Elegí al menos un convocado'); return; }
    var teamId = state.currentTeamId;
    c.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    var save;
    if(!c.id){
      c.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      var toSave = Object.assign({}, c); delete toSave.id;
      save = callupCollection(teamId).add(toSave);
    } else {
      var id = c.id; var toSave2 = Object.assign({}, c); delete toSave2.id;
      save = callupCollection(teamId).doc(id).set(toSave2, { merge: true });
    }
    save.then(function(){
      showToast('Convocatoria guardada');
      closeCallupEditor();
      return refreshCallups(teamId);
    }).then(function(){
      renderDashboard();
      renderCalendar();
    }).catch(function(e){ fail(e); });
  }
