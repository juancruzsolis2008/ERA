// ============ Estadísticas de partidos. ============
import { db } from './firebase-config.js';
import { escapeAttr, escapeHtml, fail, fmtDateShort, showToast, state } from './state.js';

  export function statsCollection(teamId){ return db.collection('teams').doc(teamId||state.currentTeamId).collection('stats'); }

  export function renderStatsPlayerSelect(){
    var sel = document.getElementById('statsPlayerSelect');
    var prev = sel.value;
    var list = state.players[state.currentTeamId] || [];
    sel.innerHTML = list.length ? list.map(function(n){ return '<option value="'+escapeAttr(n)+'">'+escapeHtml(n)+'</option>'; }).join('') : '<option value="">Sin jugadores cargados</option>';
    if(list.indexOf(prev) !== -1) sel.value = prev;
  }

  export function renderStatsList(){
    var wrap = document.getElementById('statsList');
    var playerName = document.getElementById('statsPlayerSelect').value;
    var list = (state.stats[state.currentTeamId] || []).filter(function(e){ return e.playerName === playerName; });
    if(!playerName){ wrap.innerHTML = '<div class="empty-inline">Agregá jugadores a esta categoría primero.</div>'; return; }
    if(!list.length){ wrap.innerHTML = '<div class="empty-inline">Todavía no hay estadísticas para '+escapeHtml(playerName)+'.</div>'; return; }
    var rows = list.map(function(e){
      return '<tr><td>'+fmtDateShort(e.date)+'</td><td>'+escapeHtml(e.statName||'')+'</td><td>'+escapeHtml(e.value||'')+'</td><td>'+escapeHtml(e.opponent||'')+'</td>'
        +'<td><button class="btn danger small" data-del="'+e.id+'" type="button">✕</button></td></tr>';
    }).join('');
    wrap.innerHTML = '<table class="attendance"><thead><tr><th>Fecha</th><th>Estadística</th><th>Valor</th><th>Rival</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>';
    wrap.querySelectorAll('[data-del]').forEach(function(btn){
      btn.addEventListener('click', function(){
        if(!confirm('¿Borrar este registro?')) return;
        var id = btn.getAttribute('data-del');
        statsCollection().doc(id).delete().then(function(){
          state.stats[state.currentTeamId] = state.stats[state.currentTeamId].filter(function(e){return e.id!==id;});
          renderStatsList();
        }).catch(fail);
      });
    });
  }

  export function addStatsEntry(){
    var teamId = state.currentTeamId;
    if(!teamId){ showToast('Elegí una categoría primero'); return; }
    var playerName = document.getElementById('statsPlayerSelect').value;
    var statName = document.getElementById('statsStatInput').value.trim();
    var value = document.getElementById('statsValueInput').value.trim();
    var opponent = document.getElementById('statsOpponentInput').value.trim();
    var date = document.getElementById('statsDateInput').value || new Date().toISOString().slice(0,10);
    if(!playerName){ showToast('Elegí un jugador'); return; }
    if(!statName){ showToast('Escribí el nombre de la estadística'); return; }
    var entry = { playerName:playerName, statName:statName, value:value, opponent:opponent, date:date, recordedBy: state.user.email, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
    statsCollection(teamId).add(entry).then(function(ref){
      entry.id = ref.id;
      if(!state.stats[teamId]) state.stats[teamId] = [];
      state.stats[teamId].unshift(entry);
      document.getElementById('statsStatInput').value = '';
      document.getElementById('statsValueInput').value = '';
      document.getElementById('statsOpponentInput').value = '';
      renderStatsList();
      showToast('Registro agregado');
    }).catch(fail);
  }
