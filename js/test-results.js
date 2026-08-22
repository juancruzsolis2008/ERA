// ============ Motor compartido de resultados de test (Etapa: catálogo único). ============
// Un doc = un test, una fecha, uno o varios jugadores (players[]) — carga
// individual o grupal en el mismo shape, sin duplicar colección. Lo usan
// Evaluaciones Físicas (grupal) y Estadísticas (tabs Entrenamiento/Partido).
// No reemplaza physicalEvaluations/stats — conviven, ver DATABASE.md.
import { db } from './firebase-config.js';
import { allTests, findTest, renderEvoHistory } from './evaluaciones-fisicas.js';
import { escapeAttr, escapeHtml, fail, fmtDateShort, showToast, state } from './state.js';

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

  // Promedio grupal: solo cuenta jugadores con bestResult numérico cargado —
  // no hace falta que todos tengan valor para guardar ni para promediar
  // (pedido explícito: "debería dejar guardar la evaluación y hacerte el
  // promedio con los datos que hay"). null en tests de texto (Thomas Test).
  export function computeGroupAverage(tr){
    if(tr.resultType === 'text') return null;
    var nums = (tr.players||[]).map(function(p){ return p.bestResult; }).filter(function(v){ return typeof v === 'number' && !isNaN(v); });
    if(!nums.length) return null;
    var avg = nums.reduce(function(a,b){ return a+b; }, 0) / nums.length;
    return { avg: +avg.toFixed(2), count: nums.length, total: (tr.players||[]).length };
  }

  export function deleteTestResult(id){
    var teamId = state.currentTeamId;
    return testResultsCollection(teamId).doc(id).delete().then(function(){
      state.testResults[teamId] = (state.testResults[teamId]||[]).filter(function(e){ return e.id !== id; });
      showToast('Registro borrado');
    }).catch(function(e){ fail(e); });
  }

  // Catálogo de Estadísticas: SOLO los tests statsOnly ("estilo partido" —
  // puntos, rebotes, etc.) — separado a propósito del catálogo de
  // Evaluaciones Físicas, ver TEST_LIBRARY en evaluaciones-fisicas.js.
  function statsTests(){ return allTests().filter(function(t){ return t.statsOnly; }); }

  // Evaluación grupal (Evolución) — ahora fusionada en el builder individual
  // de js/evaluaciones-fisicas.js (openEvoBuilder/saveEvaluation, modo
  // groupMode cuando hay 2+ jugadores tildados en el checklist de arriba).
  // Ya no hay pantalla ni botón separados; saveTestResult() de acá abajo
  // sigue siendo el único punto de escritura, llamado en loop (uno por test).

  // ============ Estadísticas — tabs Entrenamiento/Partido ============
  // Mismo patrón que la evaluación grupal de arriba: checklist multi-jugador
  // + picker categorizado (mismo TEST_LIBRARY, catálogo único compartido con
  // Evaluaciones Físicas — un test personalizado nuevo aparece automático acá
  // también) + un valor por jugador tildado. Entrenamiento/Partido decide
  // SOLO el campo `section`/`opponent` del testResult, nunca qué tests hay
  // disponibles.

  export function getSelectedStatsPlayers(){
    return Array.prototype.map.call(document.querySelectorAll('#statsPlayerChecklist input:checked'), function(cb){ return cb.value; });
  }

  export function renderStatsPlayerChecklist(){
    var wrap = document.getElementById('statsPlayerChecklist');
    if(!wrap) return;
    var prevChecked = getSelectedStatsPlayers();
    var list = state.players[state.currentTeamId] || [];
    if(!list.length){ wrap.innerHTML = '<span class="empty-inline">Sin jugadores cargados</span>'; return; }
    wrap.innerHTML = list.map(function(n){
      var checked = prevChecked.indexOf(n) !== -1;
      return '<label class="member-chip" style="cursor:pointer;"><input type="checkbox" class="statsPlayerChk" value="'+escapeAttr(n)+'" '+(checked?'checked':'')+'> '+escapeHtml(n)+'</label>';
    }).join('');
    wrap.querySelectorAll('.statsPlayerChk').forEach(function(cb){
      cb.addEventListener('change', renderTestResultsList);
    });
  }

  export function toggleSelectAllStatsPlayers(){
    var boxes = document.querySelectorAll('#statsPlayerChecklist input');
    if(!boxes.length) return;
    var allChecked = Array.prototype.every.call(boxes, function(cb){ return cb.checked; });
    boxes.forEach(function(cb){ cb.checked = !allChecked; });
    renderTestResultsList();
  }

  function ensureStatsDraft(){
    if(!state.statsDraft) state.statsDraft = { date: new Date().toISOString().slice(0,10), tests: [] };
    return state.statsDraft;
  }

  export function switchStatsSection(section){
    state.statsSection = section;
    document.querySelectorAll('#statsSectionTabs button').forEach(function(b){ b.classList.toggle('active', b.dataset.section===section); });
    document.getElementById('statsTestOpponentInput').style.display = section==='partido' ? '' : 'none';
    renderTestResultsList();
  }

  // Sin chips de categoría acá a propósito: statsTests() ya es SOLO
  // "básquet"/estilo partido, filtrar por categoría no tendría sentido (todo
  // cae en la misma) — se muestra la lista completa directo.
  export function renderStatsTestPicker(){
    var wrap = document.getElementById('statsTestPicker');
    if(!wrap) return;
    var draft = ensureStatsDraft();
    var q = (document.getElementById('statsTestSearch').value||'').toLowerCase();
    var list = statsTests().filter(function(t){
      var matchesQ = !q || t.name.toLowerCase().indexOf(q) !== -1;
      var alreadyAdded = draft.tests.some(function(dt){ return dt.testId === t.id; });
      return matchesQ && !alreadyAdded;
    });
    if(!list.length){ wrap.innerHTML = '<div class="empty-inline">No hay tests que coincidan (o ya los agregaste todos).</div>'; return; }
    wrap.innerHTML = list.map(function(t){
      var unit = (t.units && t.units[0]) ? ' ('+escapeHtml(t.units[0])+')' : '';
      return '<div class="test-pick-card" data-test="'+escapeAttr(t.id)+'" style="cursor:pointer;">'+escapeHtml(t.name)+'<span class="unit">'+unit+'</span></div>';
    }).join('');
    wrap.querySelectorAll('.test-pick-card').forEach(function(card){
      card.addEventListener('click', function(){ addStatsTestToDraft(card.dataset.test); });
    });
  }

  export function addStatsTestToDraft(testId){
    var t = findTest(testId); if(!t) return;
    var selected = getSelectedStatsPlayers();
    if(!selected.length){ showToast('Tildá al menos un jugador arriba'); return; }
    var draft = ensureStatsDraft();
    draft.tests.push({ testId: t.id, testName: t.name, groupValues: selected.map(function(n){ return { playerName: n, value: '' }; }) });
    renderStatsTestPicker();
    renderStatsDraftTests();
  }

  export function removeStatsTestFromDraft(testId){
    var draft = ensureStatsDraft();
    draft.tests = draft.tests.filter(function(t){ return t.testId !== testId; });
    renderStatsTestPicker();
    renderStatsDraftTests();
  }

  export function renderStatsDraftTests(){
    var wrap = document.getElementById('statsDraftTests');
    if(!wrap) return;
    var draft = ensureStatsDraft();
    if(!draft.tests.length){ wrap.innerHTML = '<div class="empty-inline">Todavía no agregaste ningún test. Elegí uno de arriba.</div>'; return; }
    wrap.innerHTML = draft.tests.map(function(dt, idx){
      var rows = dt.groupValues.map(function(gv, gIdx){
        return '<div class="row" style="margin-bottom:6px;"><span style="min-width:140px;">'+escapeHtml(gv.playerName)+'</span>'
          + '<input class="text-input" data-stats-group-value="'+idx+':'+gIdx+'" value="'+escapeAttr(gv.value)+'" placeholder="Valor" style="max-width:140px;"></div>';
      }).join('');
      return '<div class="evo-draft-card"><h4>'+escapeHtml(dt.testName)+' <button type="button" class="btn danger small" data-remove-stats-test="'+escapeAttr(dt.testId)+'">Quitar</button></h4>'+rows+'</div>';
    }).join('');
    wrap.querySelectorAll('[data-stats-group-value]').forEach(function(inp){
      inp.addEventListener('input', function(){
        var parts = inp.dataset.statsGroupValue.split(':'); var idx=+parts[0], gIdx=+parts[1];
        draft.tests[idx].groupValues[gIdx].value = inp.value;
      });
    });
    wrap.querySelectorAll('[data-remove-stats-test]').forEach(function(btn){
      btn.addEventListener('click', function(){ removeStatsTestFromDraft(btn.getAttribute('data-remove-stats-test')); });
    });
  }

  export function saveStatsDraft(){
    var teamId = state.currentTeamId;
    if(!teamId){ showToast('Elegí una categoría primero'); return; }
    var draft = ensureStatsDraft();
    if(!draft.tests.length){ showToast('Agregá al menos un test'); return; }
    var date = document.getElementById('statsTestDateInput').value || new Date().toISOString().slice(0,10);
    var opponent = state.statsSection === 'partido' ? document.getElementById('statsTestOpponentInput').value.trim() : null;
    var hasValue = draft.tests.some(function(dt){ return dt.groupValues.some(function(gv){ return gv.value !== '' && gv.value != null; }); });
    if(!hasValue){ showToast('Cargá al menos un valor'); return; }
    Promise.all(draft.tests.map(function(dt){
      return saveTestResult({ testId: dt.testId, date: date, section: state.statsSection, opponent: opponent, players: dt.groupValues });
    })).then(function(){
      showToast('Registrado');
      state.statsDraft = { date: date, tests: [] };
      document.getElementById('statsTestOpponentInput').value = '';
      renderStatsTestPicker();
      renderStatsDraftTests();
      renderTestResultsList();
    });
  }

  // Historial agrupado por fecha+test+conjunto exacto de jugadores tildados
  // (mismo criterio que renderEvoHistoryGroup en evaluaciones-fisicas.js),
  // filtrado además por la sección activa (Entrenamiento/Partido) — un mismo
  // test puede tener registros de ambas secciones, no se mezclan acá.
  export function renderTestResultsList(){
    var wrap = document.getElementById('testResultsList');
    if(!wrap) return;
    var selected = getSelectedStatsPlayers();
    if(!selected.length){ wrap.innerHTML = '<div class="empty-inline">Tildá al menos un jugador arriba.</div>'; return; }
    // Subconjunto, no igualdad exacta: un registro con menos jugadores que
    // los tildados (carga parcial, valor no cargado a todos) tiene que
    // seguir apareciendo mientras esté tildado a QUIÉNES SÍ tiene cargados —
    // pedido explícito: "seleccionás a todos pero no le cargás el test a
    // todos, igual debería dejar guardar y hacer el promedio con los datos
    // que hay". Si exigiera igualdad exacta, ese registro desaparecería.
    var wantedSet = {}; selected.forEach(function(n){ wantedSet[n] = true; });
    var list = (state.testResults[state.currentTeamId] || []).filter(function(tr){
      if(tr.section !== state.statsSection) return false;
      var names = (tr.players||[]);
      return names.length > 0 && names.every(function(p){ return wantedSet[p.playerName]; });
    });
    if(!list.length){ wrap.innerHTML = '<div class="empty-inline">Todavía no hay registros de '+escapeHtml(state.statsSection)+' para este grupo exacto de jugadores.</div>'; return; }
    list = list.slice().sort(function(a,b){ return a.date < b.date ? 1 : -1; });
    wrap.innerHTML = list.map(function(tr){
      var avg = computeGroupAverage(tr);
      var avgHtml = avg ? (' · <strong>Promedio: '+avg.avg+(tr.unit?(' '+escapeHtml(tr.unit)):'')+'</strong> ('+avg.count+'/'+avg.total+' jugadores)') : '';
      var rows = (tr.players||[]).map(function(p){
        return '<div class="evo-hist-row"><span>'+escapeHtml(p.playerName)+'</span><span>'+(p.bestResult!=null?escapeHtml(String(p.bestResult)):'')+(tr.unit?(' '+escapeHtml(tr.unit)):'')+'</span></div>';
      }).join('');
      return '<div class="evo-hist-card"><h4 style="font-size:0.85rem;margin-bottom:6px;">'+fmtDateShort(tr.date)+' — '+escapeHtml(tr.testName)+(tr.opponent?(' vs '+escapeHtml(tr.opponent)):'')+avgHtml+' <button class="btn danger small" data-del-tr="'+tr.id+'" type="button">Borrar</button></h4>'+rows+'</div>';
    }).join('');
    wrap.querySelectorAll('[data-del-tr]').forEach(function(btn){
      btn.addEventListener('click', function(){
        if(!confirm('¿Borrar este registro?')) return;
        deleteTestResult(btn.getAttribute('data-del-tr')).then(renderTestResultsList);
      });
    });
  }
