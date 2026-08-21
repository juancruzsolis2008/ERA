// ============ Motor compartido de resultados de test (Etapa: catálogo único). ============
// Un doc = un test, una fecha, uno o varios jugadores (players[]) — carga
// individual o grupal en el mismo shape, sin duplicar colección. Lo usan
// Evaluaciones Físicas (grupal) y Estadísticas (tabs Entrenamiento/Partido).
// No reemplaza physicalEvaluations/stats — conviven, ver DATABASE.md.
import { db } from './firebase-config.js';
import { allTests, findTest, renderEvoHistory } from './evaluaciones-fisicas.js';
import { escapeHtml, fail, fmtDateShort, showToast, state } from './state.js';

  export function testResultsCollection(teamId){ return db.collection('teams').doc(teamId||state.currentTeamId).collection('testResults'); }

  export function refreshTestResults(teamId){
    return testResultsCollection(teamId).orderBy('date','desc').get().then(function(s){
      state.testResults[teamId] = s.docs.map(function(d){ var x=d.data(); x.id=d.id; return x; });
    }).catch(function(e){ console.error('refreshTestResults error:', e); state.testResults[teamId] = state.testResults[teamId] || []; });
  }

  // players: [{playerName, value}] — un valor por jugador (singleValue-style,
  // ver evaluaciones-fisicas.js TEST_LIBRARY). section: 'entrenamiento'|'partido'|null
  // (null = cargado desde Evaluación grupal en Evolución, sin tag de sección).
  export function saveTestResult(opts){
    var teamId = state.currentTeamId;
    var def = findTest(opts.testId);
    if(!def){ showToast('Elegí un test'); return Promise.resolve(); }
    var players = (opts.players||[]).filter(function(p){ return p.playerName && p.value !== '' && p.value != null; });
    if(!players.length){ showToast('Cargá al menos un valor'); return Promise.resolve(); }
    var playersOut = players.map(function(p){
      var num = def.resultType === 'text' ? null : parseFloat(p.value);
      var best = def.resultType === 'text' ? p.value : num;
      return { playerName: p.playerName, attempts: [p.value], bestResult: best, notes: p.notes || '' };
    });
    var entry = {
      testId: def.id, testName: def.name, unit: (def.units && def.units[0]) || '',
      higherIsBetter: def.higherIsBetter, resultType: def.resultType || 'number',
      date: opts.date, section: opts.section || null, opponent: opts.opponent || null,
      players: playersOut, createdBy: state.user.email, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    return testResultsCollection(teamId).add(entry).then(function(ref){
      entry.id = ref.id;
      if(!state.testResults[teamId]) state.testResults[teamId] = [];
      state.testResults[teamId].unshift(entry);
      showToast('Registro guardado');
      return entry;
    }).catch(function(e){ fail(e); });
  }

  export function deleteTestResult(id){
    var teamId = state.currentTeamId;
    return testResultsCollection(teamId).doc(id).delete().then(function(){
      state.testResults[teamId] = (state.testResults[teamId]||[]).filter(function(e){ return e.id !== id; });
      showToast('Registro borrado');
    }).catch(function(e){ fail(e); });
  }

  // Solo tests singleValue (un número por jugador, sin intentos múltiples) —
  // los de intentos (CMJ, Sprint, etc.) siguen yendo por la Evaluación
  // individual completa (evoBuilder), pensada para eso.
  function singleValueTests(){ return allTests().filter(function(t){ return t.singleValue; }); }

  function testSelectOptionsHtml(){
    return singleValueTests().map(function(t){
      var unit = (t.units && t.units[0]) ? ' ('+escapeHtml(t.units[0])+')' : '';
      return '<option value="'+t.id+'">'+escapeHtml(t.name)+unit+'</option>';
    }).join('');
  }

  // Evaluación grupal (Evolución) — ahora fusionada en el builder individual
  // de js/evaluaciones-fisicas.js (openEvoBuilder/saveEvaluation, modo
  // groupMode cuando hay 2+ jugadores tildados en el checklist de arriba).
  // Ya no hay pantalla ni botón separados; saveTestResult() de acá abajo
  // sigue siendo el único punto de escritura, llamado en loop (uno por test).

  // ============ Estadísticas — tabs Entrenamiento/Partido ============

  export function switchStatsSection(section){
    state.statsSection = section;
    document.querySelectorAll('#statsSectionTabs button').forEach(function(b){ b.classList.toggle('active', b.dataset.section===section); });
    document.getElementById('statsTestOpponentInput').style.display = section==='partido' ? '' : 'none';
    document.getElementById('statsTestSelect').innerHTML = testSelectOptionsHtml();
    renderTestResultsList();
  }

  export function addTestResultFromStatsForm(){
    var teamId = state.currentTeamId;
    if(!teamId){ showToast('Elegí una categoría primero'); return; }
    var testId = document.getElementById('statsTestSelect').value;
    var playerName = document.getElementById('statsPlayerSelect').value;
    var value = document.getElementById('statsTestValueInput').value.trim();
    var opponent = state.statsSection === 'partido' ? document.getElementById('statsTestOpponentInput').value.trim() : null;
    var date = document.getElementById('statsTestDateInput').value || new Date().toISOString().slice(0,10);
    if(!playerName){ showToast('Elegí un jugador'); return; }
    if(!testId){ showToast('Elegí un test'); return; }
    saveTestResult({ testId: testId, date: date, section: state.statsSection, opponent: opponent, players: [{ playerName: playerName, value: value }] }).then(function(entry){
      if(!entry) return;
      document.getElementById('statsTestValueInput').value = '';
      document.getElementById('statsTestOpponentInput').value = '';
      renderTestResultsList();
    });
  }

  export function renderTestResultsList(){
    var wrap = document.getElementById('testResultsList');
    if(!wrap) return;
    var playerName = document.getElementById('statsPlayerSelect').value;
    if(!playerName){ wrap.innerHTML = '<div class="empty-inline">Agregá jugadores a esta categoría primero.</div>'; return; }
    var list = (state.testResults[state.currentTeamId] || []).filter(function(e){
      return e.section === state.statsSection && (e.players||[]).some(function(p){ return p.playerName === playerName; });
    });
    if(!list.length){ wrap.innerHTML = '<div class="empty-inline">Todavía no hay registros de '+escapeHtml(state.statsSection)+' para '+escapeHtml(playerName)+'.</div>'; return; }
    var rows = list.map(function(e){
      var mine = (e.players||[]).find(function(p){ return p.playerName === playerName; });
      var val = mine ? mine.bestResult : '';
      return '<tr><td>'+fmtDateShort(e.date)+'</td><td>'+escapeHtml(e.testName)+'</td><td>'+escapeHtml(val!=null?String(val):'')+(e.unit?(' '+escapeHtml(e.unit)):'')+'</td><td>'+escapeHtml(e.opponent||'')+'</td>'
        +'<td><button class="btn danger small" data-del-tr="'+e.id+'" type="button">✕</button></td></tr>';
    }).join('');
    wrap.innerHTML = '<table class="attendance"><thead><tr><th>Fecha</th><th>Test</th><th>Valor</th><th>Rival</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>';
    wrap.querySelectorAll('[data-del-tr]').forEach(function(btn){
      btn.addEventListener('click', function(){
        if(!confirm('¿Borrar este registro?')) return;
        deleteTestResult(btn.getAttribute('data-del-tr')).then(renderTestResultsList);
      });
    });
  }
