// ============ Evaluaciones físicas (ex "Evolución"). ============
import { db } from './firebase-config.js';
import { getPlayerInfo, renderInfoList, savePlayerInfoDoc } from './jugadores.js';
import { currentTeam, escapeAttr, escapeHtml, fail, fmtDateShort, genId, pdfDoc, pdfFileName, pdfWrapped, showToast, state } from './state.js';

  export var EVO_CATEGORIES = [
    {key:'fuerza', label:'💪 Fuerza'},
    {key:'salto', label:'🦘 Salto / Potencia'},
    {key:'velocidad', label:'⚡ Velocidad'},
    {key:'agilidad', label:'🔄 Agilidad'},
    {key:'resistencia', label:'🫁 Resistencia'},
    {key:'resistencia_muscular', label:'🏋️ Resistencia muscular'},
    {key:'antropometria', label:'📏 Antropometría'},
    {key:'movilidad', label:'🧘 Movilidad'},
    {key:'basquet', label:'🏀 Básquet'},
    {key:'personalizado', label:'➕ Personalizados'}
  ];

  // Biblioteca de tests precargados. higherIsBetter: true = mayor es mejor, false = menor es
  // mejor, null = no aplica (ej. antropometría, resultado cualitativo). calc: cálculo automático
  // adicional a mostrar ('1rm' estimado, 'speed' velocidad media). singleValue: no tiene sentido
  // cargar varios intentos (ej. altura). usesSide: permite marcar derecha/izquierda.
  export var TEST_LIBRARY = [
    {id:'1rm', name:'1RM', categories:['fuerza'], units:['kg'], resultType:'number', higherIsBetter:true, requiresExercise:true, calc:'1rm'},
    {id:'3rm', name:'3RM', categories:['fuerza'], units:['kg'], resultType:'number', higherIsBetter:true, requiresExercise:true, calc:'1rm'},
    {id:'5rm', name:'5RM', categories:['fuerza'], units:['kg'], resultType:'number', higherIsBetter:true, requiresExercise:true, calc:'1rm'},
    {id:'handgrip', name:'Hand Grip', categories:['fuerza'], units:['kg'], resultType:'number', higherIsBetter:true, usesSide:true},

    {id:'cmj', name:'CMJ (Countermovement Jump)', categories:['salto','basquet'], units:['cm'], resultType:'number', higherIsBetter:true, calc:'jumpPower'},
    {id:'squat_jump', name:'Squat Jump', categories:['salto'], units:['cm'], resultType:'number', higherIsBetter:true, calc:'jumpPower'},
    {id:'abalakov', name:'Abalakov', categories:['salto'], units:['cm'], resultType:'number', higherIsBetter:true, calc:'jumpPower'},
    {id:'salto_horizontal', name:'Salto horizontal', categories:['salto','basquet'], units:['cm'], resultType:'number', higherIsBetter:true},
    {id:'drop_jump', name:'Drop Jump', categories:['salto'], units:['cm'], resultType:'number', higherIsBetter:true, calc:'jumpPower'},
    {id:'five_jump', name:'5 Jump Test', categories:['salto'], units:['m'], resultType:'number', higherIsBetter:true},
    {id:'balon_medicinal', name:'Lanzamiento de balón medicinal', categories:['salto'], units:['m'], resultType:'number', higherIsBetter:true},

    {id:'sprint_10', name:'Sprint 10 m', categories:['velocidad','basquet'], units:['s'], resultType:'number', higherIsBetter:false, distance:10, calc:'speed'},
    {id:'sprint_20', name:'Sprint 20 m', categories:['velocidad','basquet'], units:['s'], resultType:'number', higherIsBetter:false, distance:20, calc:'speed'},
    {id:'sprint_30', name:'Sprint 30 m', categories:['velocidad'], units:['s'], resultType:'number', higherIsBetter:false, distance:30, calc:'speed'},
    {id:'sprint_40', name:'Sprint 40 m', categories:['velocidad'], units:['s'], resultType:'number', higherIsBetter:false, distance:40, calc:'speed'},
    {id:'flying_10', name:'Flying 10 m', categories:['velocidad'], units:['s'], resultType:'number', higherIsBetter:false, distance:10, calc:'speed'},

    {id:'agility_505', name:'505', categories:['agilidad'], units:['s'], resultType:'number', higherIsBetter:false, usesSide:true},
    {id:'t_test', name:'T-Test', categories:['agilidad','basquet'], units:['s'], resultType:'number', higherIsBetter:false},
    {id:'illinois', name:'Illinois Agility Test', categories:['agilidad'], units:['s'], resultType:'number', higherIsBetter:false},
    {id:'pro_agility', name:'5-10-5 / Pro Agility', categories:['agilidad','basquet'], units:['s'], resultType:'number', higherIsBetter:false},
    {id:'zigzag', name:'Zig-Zag Test', categories:['agilidad'], units:['s'], resultType:'number', higherIsBetter:false},
    {id:'lane_agility', name:'Lane Agility Drill', categories:['agilidad','basquet'], units:['s'], resultType:'number', higherIsBetter:false},

    {id:'yoyo_ir1', name:'Yo-Yo IR1', categories:['resistencia','basquet'], units:['m'], resultType:'number', higherIsBetter:true, extraFields:['nivel','fcMax','fcFinal']},
    {id:'yoyo_ir2', name:'Yo-Yo IR2', categories:['resistencia','basquet'], units:['m'], resultType:'number', higherIsBetter:true, extraFields:['nivel','fcMax','fcFinal']},
    {id:'beep_test', name:'Beep Test / Course Navette', categories:['resistencia'], units:['nivel'], resultType:'number', higherIsBetter:true},
    {id:'cooper', name:'Cooper 12 minutos', categories:['resistencia'], units:['m'], resultType:'number', higherIsBetter:true},
    {id:'bronco', name:'Bronco Test', categories:['resistencia'], units:['s'], resultType:'number', higherIsBetter:false},
    {id:'run_1600', name:'1600 m', categories:['resistencia'], units:['s'], resultType:'number', higherIsBetter:false},

    {id:'pushup', name:'Push-Up Test', categories:['resistencia_muscular'], units:['reps'], resultType:'number', higherIsBetter:true, singleValue:true},
    {id:'situp', name:'Sit-Up Test', categories:['resistencia_muscular'], units:['reps'], resultType:'number', higherIsBetter:true, singleValue:true},
    {id:'plank', name:'Plank Test', categories:['resistencia_muscular'], units:['s'], resultType:'number', higherIsBetter:true, singleValue:true},
    {id:'wallsit', name:'Wall Sit', categories:['resistencia_muscular'], units:['s'], resultType:'number', higherIsBetter:true, singleValue:true},
    {id:'pullup', name:'Pull-Up Test', categories:['resistencia_muscular'], units:['reps'], resultType:'number', higherIsBetter:true, singleValue:true},
    {id:'squat_test', name:'Squat Test', categories:['resistencia_muscular'], units:['reps'], resultType:'number', higherIsBetter:true, singleValue:true},

    {id:'altura', name:'Altura', categories:['antropometria'], units:['cm'], resultType:'number', higherIsBetter:null, singleValue:true},
    {id:'peso_corporal', name:'Peso', categories:['antropometria'], units:['kg'], resultType:'number', higherIsBetter:null, singleValue:true},
    {id:'envergadura', name:'Envergadura', categories:['antropometria'], units:['cm'], resultType:'number', higherIsBetter:null, singleValue:true},
    {id:'altura_sentado', name:'Altura sentado', categories:['antropometria'], units:['cm'], resultType:'number', higherIsBetter:null, singleValue:true},
    {id:'long_pierna', name:'Longitud de pierna', categories:['antropometria'], units:['cm'], resultType:'number', higherIsBetter:null, singleValue:true},
    {id:'grasa_pct', name:'% Grasa corporal', categories:['antropometria'], units:['%'], resultType:'number', higherIsBetter:null, singleValue:true},
    {id:'masa_grasa', name:'Masa grasa', categories:['antropometria'], units:['kg'], resultType:'number', higherIsBetter:null, singleValue:true},
    {id:'masa_muscular', name:'Masa muscular', categories:['antropometria'], units:['kg'], resultType:'number', higherIsBetter:null, singleValue:true},
    {id:'perimetros', name:'Perímetros corporales', categories:['antropometria'], units:['cm'], resultType:'number', higherIsBetter:null, singleValue:true, requiresExercise:true, exerciseLabel:'¿Qué perímetro?'},

    {id:'sit_reach', name:'Sit & Reach', categories:['movilidad'], units:['cm'], resultType:'number', higherIsBetter:true, singleValue:true},
    {id:'back_scratch', name:'Back Scratch Test', categories:['movilidad'], units:['cm'], resultType:'number', higherIsBetter:true, singleValue:true},
    {id:'dorsiflexion', name:'Dorsiflexión de tobillo', categories:['movilidad'], units:['grados'], resultType:'number', higherIsBetter:true, singleValue:true, usesSide:true},
    {id:'deep_squat', name:'Deep Squat', categories:['movilidad'], units:['puntos'], resultType:'number', higherIsBetter:true, singleValue:true},
    {id:'overhead_squat', name:'Overhead Squat', categories:['movilidad'], units:['puntos'], resultType:'number', higherIsBetter:true, singleValue:true},
    {id:'thomas_test', name:'Thomas Test', categories:['movilidad'], units:[''], resultType:'text', higherIsBetter:null, singleValue:true},

    {id:'rsa', name:'Repeated Sprint Ability (RSA)', categories:['basquet'], units:['s'], resultType:'number', higherIsBetter:false}
  ];

  export var UNIT_FACTOR_TO_KG = { kg:1, lb:0.453592 };
  export var UNIT_FACTOR_TO_CM = { cm:1, in:2.54 };

  export var GRAVITY = 9.81;


  export function progressCollection(teamId){ return db.collection('teams').doc(teamId||state.currentTeamId).collection('progress'); }

  export function evaluationCollection(teamId){ return db.collection('teams').doc(teamId||state.currentTeamId).collection('physicalEvaluations'); }

  export function customTestCollection(){ return db.collection('users').doc(state.user.uid).collection('customTests'); }

  export function allTests(){
    var custom = (state.customTests||[]).map(function(t){
      var units = t.units && t.units.length ? t.units : (t.unit ? [t.unit] : ['']);
      var cats = [t.category || 'personalizado'];
      if(cats.indexOf('personalizado') === -1) cats.push('personalizado');
      return {id:'custom_'+t.id, name:t.name, categories:cats, units:units, resultType:t.resultType||'number',
        higherIsBetter: t.higherIsBetter===false?false:(t.higherIsBetter===true?true:null), usesSide:!!t.usesSide,
        requiresExercise:false, singleValue:!t.usesAttempts, isCustom:true, customId:t.id};
    });
    return TEST_LIBRARY.concat(custom);
  }

  export function findTest(testId){ return allTests().find(function(t){ return t.id===testId; }); }

  export function refreshCustomTests(){
    return customTestCollection().orderBy('createdAt','desc').get().then(function(s){
      state.customTests = s.docs.map(function(d){ var x=d.data(); x.id=d.id; return x; });
    }).catch(function(e){ fail(e); });
  }

  export function openCustomTestModal(prefill, editingCustomId){
    prefill = prefill || {};
    var root = document.getElementById('modalRoot');
    var catsOptions = EVO_CATEGORIES.filter(function(c){return c.key!=='personalizado';}).map(function(c){
      return '<option value="'+c.key+'"'+(c.key===prefill.category?' selected':'')+'>'+c.label+'</option>';
    }).join('');
    var isEditing = !!editingCustomId;
    var title = isEditing ? 'Editar test' : (prefill.name ? 'Nuevo test a partir de "'+prefill.name+'"' : 'Crear test personalizado');
    var saveLabel = isEditing ? 'Guardar cambios' : 'Crear test';
    root.innerHTML = '<div class="modal-backdrop" id="customTestBackdrop"><div class="modal">'
      + '<button class="btn secondary small closeBtn" id="closeCustomTestBtn" type="button">Cerrar</button>'
      + '<h3>'+escapeHtml(title)+'</h3>'
      + (!isEditing && prefill.name ? '<p class="helper-text">Lo estás usando como plantilla: cambiá lo que necesites y guardalo como un test nuevo, sin tocar el original.</p>' : '')
      + '<div class="field-grid" style="margin-top:10px;">'
      + '<input class="text-input" id="ctName" placeholder="Nombre (ej: Salto unilateral derecho)" value="'+escapeAttr(prefill.name||'')+'">'
      + '<select id="ctCategory">'+catsOptions+'</select>'
      + '<input class="text-input" id="ctUnit" placeholder="Unidad(es) de medida — una o varias separadas por coma (ej: km/h, m/s)" value="'+escapeAttr((prefill.units||[]).join(', '))+'">'
      + '<select id="ctResultType"><option value="number"'+(prefill.resultType==='number'?' selected':'')+'>Numérico</option><option value="text"'+(prefill.resultType==='text'?' selected':'')+'>Cualitativo / texto</option></select>'
      + '<select id="ctBetter"><option value="true"'+(prefill.higherIsBetter===true?' selected':'')+'>Mayor resultado = mejor</option><option value="false"'+(prefill.higherIsBetter===false?' selected':'')+'>Menor resultado = mejor</option><option value=""'+(prefill.higherIsBetter==null?' selected':'')+'>No aplica</option></select>'
      + '<label style="font-size:0.8rem;color:var(--line-chalk-dim);"><input type="checkbox" id="ctAttempts"'+(prefill.usesAttempts!==false?' checked':'')+' style="margin-right:6px;vertical-align:middle;"> Permite varios intentos</label>'
      + '<label style="font-size:0.8rem;color:var(--line-chalk-dim);"><input type="checkbox" id="ctSide"'+(prefill.usesSide?' checked':'')+' style="margin-right:6px;vertical-align:middle;"> Se mide por lado (derecha/izquierda)</label>'
      + '<textarea class="text-input" id="ctDescription" placeholder="Descripción / observaciones (opcional)">'+escapeHtml(prefill.description||'')+'</textarea>'
      + '</div>'
      + '<div class="row" style="margin-top:12px;"><button class="btn small" id="saveCustomTestBtn" type="button">'+escapeHtml(saveLabel)+'</button></div>'
      + '</div></div>';
    document.getElementById('closeCustomTestBtn').addEventListener('click', function(){ root.innerHTML=''; });
    document.getElementById('customTestBackdrop').addEventListener('click', function(e){ if(e.target.id==='customTestBackdrop') root.innerHTML=''; });
    document.getElementById('saveCustomTestBtn').addEventListener('click', function(){ saveCustomTest(editingCustomId); });
  }

  export function useTestAsTemplate(testId){
    var t = findTest(testId); if(!t) return;
    openCustomTestModal({
      name: t.name+' (copia)', category: (t.categories&&t.categories[0])||'', units: t.units||[],
      resultType: t.resultType, higherIsBetter: t.higherIsBetter, usesAttempts: !t.singleValue,
      usesSide: t.usesSide, description: ''
    });
  }

  export function editCustomTest(customId){
    var t = (state.customTests||[]).find(function(x){ return x.id===customId; }); if(!t) return;
    openCustomTestModal({
      name: t.name, category: t.category, units: t.units||(t.unit?[t.unit]:[]),
      resultType: t.resultType, higherIsBetter: t.higherIsBetter, usesAttempts: t.usesAttempts,
      usesSide: t.usesSide, description: t.description
    }, customId);
  }

  export function deleteCustomTest(customId, name){
    if(!confirm('¿Borrar el test "'+name+'"? No se puede deshacer. Las evaluaciones que ya cargaste con este test no se van a borrar, solo dejás de poder elegirlo para evaluaciones nuevas.')) return;
    customTestCollection().doc(customId).delete().then(function(){
      showToast('Test borrado');
      return refreshCustomTests();
    }).then(function(){ if(state.evoDraft) renderEvoTestPicker(); }).catch(fail);
  }

  export function saveCustomTest(editingCustomId){
    var name = document.getElementById('ctName').value.trim();
    if(!name){ showToast('Ponele un nombre al test'); return; }
    var betterVal = document.getElementById('ctBetter').value;
    var data = {
      name: name, category: document.getElementById('ctCategory').value,
      units: document.getElementById('ctUnit').value.split(',').map(function(s){ return s.trim(); }).filter(Boolean),
      resultType: document.getElementById('ctResultType').value,
      higherIsBetter: betterVal==='' ? null : (betterVal==='true'),
      usesAttempts: document.getElementById('ctAttempts').checked,
      usesSide: document.getElementById('ctSide').checked,
      description: document.getElementById('ctDescription').value.trim()
    };
    var savePromise = editingCustomId
      ? customTestCollection().doc(editingCustomId).update(data)
      : customTestCollection().add(Object.assign({}, data, { createdAt: firebase.firestore.FieldValue.serverTimestamp() }));
    savePromise.then(function(){
      showToast(editingCustomId ? 'Test actualizado' : 'Test personalizado creado');
      document.getElementById('modalRoot').innerHTML = '';
      return refreshCustomTests();
    }).then(function(){ if(state.evoDraft) renderEvoTestPicker(); }).catch(fail);
  }

  export function renderEvoPlayerSelect(){
    var sel = document.getElementById('evoPlayerSelect');
    var prev = sel.value;
    var list = state.players[state.currentTeamId] || [];
    sel.innerHTML = list.length ? list.map(function(n){ return '<option value="'+escapeAttr(n)+'">'+escapeHtml(n)+'</option>'; }).join('') : '<option value="">Sin jugadores cargados</option>';
    if(list.indexOf(prev) !== -1) sel.value = prev;
  }

  export function renderEvoOverview(){ renderEvoHistory(); }

  export function sparklineSvg(points, higherIsBetter){
    var nums = points.filter(function(p){ return typeof p.value === 'number'; });
    if(nums.length < 2) return '';
    var w = 280, h = 70, pad = 8;
    var values = nums.map(function(p){ return p.value; });
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    if(min === max){ min -= 1; max += 1; }
    var stepX = (w - pad*2) / (nums.length - 1);
    var coords = nums.map(function(p, i){
      var x = pad + i*stepX;
      var y = pad + (h - pad*2) * (1 - (p.value - min)/(max - min));
      return {x:x, y:y};
    });
    var lineColor = higherIsBetter===false ? 'var(--accent-alert)' : 'var(--accent-hardwood)';
    var pathD = coords.map(function(c,i){ return (i===0?'M':'L')+c.x.toFixed(1)+','+c.y.toFixed(1); }).join(' ');
    var dots = coords.map(function(c){ return '<circle cx="'+c.x.toFixed(1)+'" cy="'+c.y.toFixed(1)+'" r="2.6" fill="'+lineColor+'"/>'; }).join('');
    return '<svg viewBox="0 0 '+w+' '+h+'" style="width:100%;max-width:280px;height:60px;margin-top:8px;display:block;">'
      + '<path d="'+pathD+'" fill="none" stroke="'+lineColor+'" stroke-width="2"/>' + dots + '</svg>';
  }

  export function renderEvoHistory(){
    var wrap = document.getElementById('evoHistory');
    if(!wrap) return;
    var playerName = document.getElementById('evoPlayerSelect').value;
    if(!playerName){ wrap.innerHTML = '<div class="empty-inline">Agregá jugadores a esta categoría primero.</div>'; return; }
    var evals = (state.evaluations[state.currentTeamId] || []).filter(function(e){ return e.playerName === playerName; });
    var legacy = (state.progress[state.currentTeamId] || []).filter(function(e){ return e.playerName === playerName; });

    if(!evals.length && !legacy.length){ wrap.innerHTML = '<div class="empty-inline">Todavía no hay evaluaciones para '+escapeHtml(playerName)+'. Tocá "+ Nueva evaluación" para cargar la primera.</div>'; return; }

    // Agrupar resultados por test, para armar el historial "por test" con comparación 1ra vs última.
    // Ojo: un mismo test (ej. "1RM") puede usarse con distintos ejercicios (Sentadilla, Press banco),
    // así que la clave de agrupación tiene que incluir el ejercicio para no mezclarlos en un mismo gráfico.
    var byTest = {}; // key -> {testName, unit, higherIsBetter, points:[{date,value}]}
    evals.forEach(function(ev){
      (ev.tests||[]).forEach(function(t){
        var key = t.testId + (t.exercise ? ('::'+t.exercise.trim().toLowerCase()) : '');
        var displayName = t.exercise ? (t.testName+' — '+t.exercise) : t.testName;
        if(!byTest[key]) byTest[key] = {testName:displayName, unit:t.unit, higherIsBetter:t.higherIsBetter, testDef:findTest(t.testId), points:[]};
        var extra = t.adhoc && t.reps ? (' · Reps: '+t.reps) : '';
        var val = (t.adhoc && t.bestResult===null) ? null : t.bestResult;
        byTest[key].points.push({date:ev.date, value: val, extra:extra, calc:t.calc||null});
      });
    });
    legacy.forEach(function(e){
      var key = 'legacy_'+e.exerciseName;
      if(!byTest[key]) byTest[key] = {testName:e.exerciseName+' (registro anterior)', unit:'', higherIsBetter:null, points:[]};
      var parts = [];
      if(e.weight) parts.push('Peso: '+e.weight);
      if(e.reps) parts.push('Reps: '+e.reps);
      byTest[key].points.push({date:e.date, value: parts.length ? parts.join(' · ') : 'Sin datos cargados'});
    });

    var testCardsHtml = Object.keys(byTest).map(function(key){
      var t = byTest[key];
      t.points.sort(function(a,b){ return a.date < b.date ? -1 : 1; });
      var first = t.points[0], last = t.points[t.points.length-1];
      var deltaHtml = '';
      if(t.points.length > 1 && typeof first.value === 'number' && typeof last.value === 'number' && t.higherIsBetter !== null){
        var diff = last.value - first.value;
        var pct = first.value !== 0 ? (diff/Math.abs(first.value)*100) : 0;
        var improved = t.higherIsBetter ? diff > 0 : diff < 0;
        deltaHtml = '<span class="'+(improved?'evo-delta-up':'evo-delta-down')+'">'+(diff>0?'+':'')+diff.toFixed(2)+' '+escapeHtml(t.unit)+' ('+(pct>0?'+':'')+pct.toFixed(1)+'%) '+(improved?'▲ mejoró':'▼ empeoró')+'</span>';
      }
      var rows = t.points.map(function(p){
        var derivedLine = (p.calc && t.testDef) ? ('<div style="font-size:0.72rem;color:var(--line-chalk-dim);margin-top:2px;">'+escapeHtml(formatDerivedMetrics(t.testDef, p.calc))+'</div>') : '';
        return '<div class="evo-hist-row" style="flex-direction:column;align-items:flex-start;"><div style="display:flex;justify-content:space-between;width:100%;"><span>'+fmtDateShort(p.date)+'</span><span>'+(p.value!==null && p.value!==undefined ? (escapeHtml(String(p.value))+(t.unit?(' '+escapeHtml(t.unit)):'')) : '')+escapeHtml(p.extra||'')+'</span></div>'+derivedLine+'</div>';
      }).join('');
      return '<div class="evo-hist-card"><h4 style="font-size:0.85rem;margin-bottom:6px;">'+escapeHtml(t.testName)+'</h4>'+rows
        + sparklineSvg(t.points, t.higherIsBetter)
        + (deltaHtml ? '<div style="margin-top:8px;font-size:0.8rem;">Primera vs. última: '+deltaHtml+'</div>' : '')
        + '</div>';
    }).join('');

    var evalsListHtml = evals.length ? ('<h4 class="subhead" style="font-size:0.85rem;margin:16px 0 8px;">Evaluaciones registradas</h4>' + evals.map(function(ev){
      return '<div class="evo-hist-row"><span>'+fmtDateShort(ev.date)+' — '+escapeHtml(ev.label||'Evaluación')+' ('+(ev.tests||[]).length+' test'+((ev.tests||[]).length===1?'':'s')+')</span>'
        + '<span><button class="btn secondary small" data-pdf-eval="'+ev.id+'" type="button">Informe PDF</button> <button class="btn danger small" data-del-eval="'+ev.id+'" type="button">Borrar</button></span></div>';
    }).join('')) : '';

    wrap.innerHTML = testCardsHtml + evalsListHtml;
    wrap.querySelectorAll('[data-pdf-eval]').forEach(function(btn){
      btn.addEventListener('click', function(){ exportEvaluationPdf(btn.getAttribute('data-pdf-eval')); });
    });
    wrap.querySelectorAll('[data-del-eval]').forEach(function(btn){
      btn.addEventListener('click', function(){
        if(!confirm('¿Borrar esta evaluación completa? No se puede deshacer.')) return;
        var id = btn.getAttribute('data-del-eval');
        evaluationCollection().doc(id).delete().then(function(){
          state.evaluations[state.currentTeamId] = state.evaluations[state.currentTeamId].filter(function(e){return e.id!==id;});
          renderEvoHistory();
          showToast('Evaluación borrada');
        }).catch(fail);
      });
    });
  }

  export function openEvoBuilder(){
    var playerName = document.getElementById('evoPlayerSelect').value;
    if(!playerName){ showToast('Elegí un jugador primero'); return; }
    state.evoDraft = { date: new Date().toISOString().slice(0,10), label: '', tests: [] };
    document.getElementById('evoEvalDate').value = state.evoDraft.date;
    document.getElementById('evoEvalLabel').value = '';
    document.getElementById('evoTestSearch').value = '';
    state.evoCategoryFilter = '';
    document.getElementById('evoOverview').style.display = 'none';
    document.getElementById('evoBuilder').style.display = 'block';
    renderEvoCategoryTabs();
    renderEvoTestPicker();
    renderEvoDraftTests();
  }

  export function closeEvoBuilder(){
    state.evoDraft = null;
    document.getElementById('evoBuilder').style.display = 'none';
    document.getElementById('evoOverview').style.display = 'block';
  }

  export function renderEvoCategoryTabs(){
    var wrap = document.getElementById('evoCategoryTabs');
    var chips = '<button type="button" class="'+(state.evoCategoryFilter===''?'active':'')+'" data-cat="">Todas</button>'
      + EVO_CATEGORIES.map(function(c){ return '<button type="button" class="'+(state.evoCategoryFilter===c.key?'active':'')+'" data-cat="'+c.key+'">'+c.label+'</button>'; }).join('');
    wrap.innerHTML = chips;
    wrap.querySelectorAll('button[data-cat]').forEach(function(btn){
      btn.addEventListener('click', function(){ state.evoCategoryFilter = btn.dataset.cat; renderEvoCategoryTabs(); renderEvoTestPicker(); });
    });
  }

  export function renderEvoTestPicker(){
    var wrap = document.getElementById('evoTestPicker');
    var q = (document.getElementById('evoTestSearch').value||'').toLowerCase();
    var list = allTests().filter(function(t){
      var matchesCat = !state.evoCategoryFilter || t.categories.indexOf(state.evoCategoryFilter) !== -1;
      var matchesQ = !q || t.name.toLowerCase().indexOf(q) !== -1;
      var alreadyAdded = state.evoDraft.tests.some(function(dt){ return dt.testId === t.id; });
      return matchesCat && matchesQ && !alreadyAdded;
    });
    if(!list.length){ wrap.innerHTML = '<div class="empty-inline">No hay tests que coincidan (o ya los agregaste todos).</div>'; return; }
    wrap.innerHTML = list.map(function(t){
      var actionLabel = t.isCustom ? '✎ Editar' : '✎ Usar como plantilla';
      var actionAttr = t.isCustom ? 'data-edit-custom="'+escapeAttr(t.customId)+'"' : 'data-use-template="'+escapeAttr(t.id)+'"';
      var deleteBtn = t.isCustom ? '<button type="button" class="btn danger small" data-delete-custom="'+escapeAttr(t.customId)+'" data-delete-name="'+escapeAttr(t.name)+'" style="display:block;margin-top:4px;width:100%;">🗑 Borrar test</button>' : '';
      return '<div class="test-pick-card" data-test="'+escapeAttr(t.id)+'" style="cursor:pointer;">'
        + escapeHtml(t.name)+'<span class="unit">'+escapeHtml((t.units||[]).join(' / '))+'</span>'
        + '<button type="button" class="btn secondary small" '+actionAttr+' style="display:block;margin-top:6px;width:100%;">'+actionLabel+'</button>'
        + deleteBtn
        + '</div>';
    }).join('');
    wrap.querySelectorAll('.test-pick-card').forEach(function(card){
      card.addEventListener('click', function(){ addTestToDraft(card.dataset.test); });
    });
    wrap.querySelectorAll('[data-use-template]').forEach(function(btn){
      btn.addEventListener('click', function(e){ e.stopPropagation(); useTestAsTemplate(btn.dataset.useTemplate); });
    });
    wrap.querySelectorAll('[data-edit-custom]').forEach(function(btn){
      btn.addEventListener('click', function(e){ e.stopPropagation(); editCustomTest(btn.dataset.editCustom); });
    });
    wrap.querySelectorAll('[data-delete-custom]').forEach(function(btn){
      btn.addEventListener('click', function(e){ e.stopPropagation(); deleteCustomTest(btn.dataset.deleteCustom, btn.dataset.deleteName); });
    });
  }

  export function addAdhocExercise(){
    var name = prompt('Nombre del ejercicio (ej: Sentadilla, Press banca):');
    if(!name) return;
    name = name.trim(); if(!name) return;
    var slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
    state.evoDraft.tests.push({ testId:'adhoc_'+(slug||genId('t')), testName:name, adhoc:true, weight:'', reps:'', notes:'' });
    renderEvoDraftTests();
  }

  export function addTestToDraft(testId){
    var t = findTest(testId); if(!t) return;
    state.evoDraft.tests.push({ testId:t.id, testName:t.name, unitUsed:(t.units&&t.units[0])||'', higherIsBetter:t.higherIsBetter, attempts:[''], reps:'', side:'', exercise:'', notes:'', extra:{} });
    renderEvoTestPicker();
    renderEvoDraftTests();
  }

  export function removeTestFromDraft(testId){
    state.evoDraft.tests = state.evoDraft.tests.filter(function(t){ return t.testId !== testId; });
    renderEvoTestPicker();
    renderEvoDraftTests();
  }

  export function renderEvoDraftTests(){
    var wrap = document.getElementById('evoDraftTests');
    if(!state.evoDraft.tests.length){ wrap.innerHTML = '<div class="empty-inline">Todavía no agregaste ningún test. Elegí uno de arriba.</div>'; return; }
    wrap.innerHTML = state.evoDraft.tests.map(function(dt, idx){
      if(dt.adhoc){
        return '<div class="evo-draft-card">'
          + '<h4>'+escapeHtml(dt.testName)+' <button type="button" class="btn danger small" data-remove-test="'+idx+'">Quitar</button></h4>'
          + '<div class="row" style="margin-bottom:8px;">'
          + '<input type="number" step="any" class="text-input" data-adhoc-weight="'+idx+'" placeholder="Peso (kg)" value="'+escapeAttr(dt.weight)+'" style="width:140px;">'
          + '<input class="text-input" data-adhoc-reps="'+idx+'" placeholder="Repeticiones (ej: 4x8)" value="'+escapeAttr(dt.reps)+'" style="width:160px;">'
          + '</div>'
          + '<textarea class="text-input" data-notes="'+idx+'" placeholder="Observaciones">'+escapeHtml(dt.notes)+'</textarea>'
          + '</div>';
      }
      var def = findTest(dt.testId) || {};
      var curUnit = dt.unitUsed || (def.units && def.units[0]) || '';
      var attemptsHtml = dt.attempts.map(function(val, aIdx){
        return '<div class="evo-attempt-row"><span style="font-size:0.75rem;color:var(--line-chalk-dim);">Intento '+(aIdx+1)+'</span>'
          + '<input type="'+(def.resultType==='text'?'text':'number')+'" step="any" class="text-input" data-attempt="'+idx+':'+aIdx+'" value="'+escapeAttr(val)+'" placeholder="'+escapeAttr(curUnit)+'"></div>';
      }).join('');
      var addAttemptBtn = (!def.singleValue) ? '<button type="button" class="btn secondary small" data-add-attempt="'+idx+'">+ Intento</button>' : '';
      var sideHtml = def.usesSide ? '<select data-side="'+idx+'"><option value="">Ambos lados</option><option value="derecha"'+(dt.side==='derecha'?' selected':'')+'>Derecha</option><option value="izquierda"'+(dt.side==='izquierda'?' selected':'')+'>Izquierda</option></select>' : '';
      var exerciseHtml = def.requiresExercise ? '<input class="text-input" data-exercise="'+idx+'" placeholder="'+escapeAttr(def.exerciseLabel||'Ejercicio (ej: Sentadilla)')+'" value="'+escapeAttr(dt.exercise)+'">' : '';
      var repsHtml = def.calc==='1rm' ? '<input type="number" class="text-input" data-reps="'+idx+'" placeholder="Repeticiones (si fue submáximo)" value="'+escapeAttr(dt.reps)+'" style="width:200px;">' : '';
      var unitHtml = (def.units && def.units.length > 1) ? '<select data-unit="'+idx+'">'+def.units.map(function(u){ return '<option value="'+escapeAttr(u)+'"'+(u===curUnit?' selected':'')+'>'+escapeHtml(u)+'</option>'; }).join('')+'</select>' : '';
      var best = computeBest(def, dt.attempts);
      var bestHtml = '<div class="evo-best" data-best-for="'+idx+'">'+(best !== null ? ('Mejor resultado: '+best+' '+escapeHtml(curUnit)) : '')+'</div>';
      var derivedPreview = (typeof best === 'number') ? computeDerivedMetrics(def, best, document.getElementById('evoPlayerSelect').value) : null;
      var derivedHtml = '<div class="helper-text" data-derived-for="'+idx+'">'+escapeHtml(formatDerivedMetrics(def, derivedPreview))+'</div>';
      return '<div class="evo-draft-card">'
        + '<h4>'+escapeHtml(dt.testName)+' <button type="button" class="btn danger small" data-remove-test="'+idx+'">Quitar</button></h4>'
        + '<div class="row" style="margin-bottom:8px;">'+exerciseHtml+unitHtml+sideHtml+repsHtml+'</div>'
        + attemptsHtml + addAttemptBtn
        + '<textarea class="text-input" data-notes="'+idx+'" placeholder="Observaciones" style="margin-top:8px;">'+escapeHtml(dt.notes)+'</textarea>'
        + bestHtml + derivedHtml
        + '</div>';
    }).join('');

    wrap.querySelectorAll('[data-attempt]').forEach(function(inp){
      inp.addEventListener('input', function(){
        var parts = inp.dataset.attempt.split(':'); var idx=+parts[0], aIdx=+parts[1];
        state.evoDraft.tests[idx].attempts[aIdx] = inp.value;
        var def = findTest(state.evoDraft.tests[idx].testId) || {};
        var curUnit = state.evoDraft.tests[idx].unitUsed || (def.units && def.units[0]) || '';
        var best = computeBest(def, state.evoDraft.tests[idx].attempts);
        var bestEl = wrap.querySelector('[data-best-for="'+idx+'"]');
        if(bestEl) bestEl.textContent = (best !== null) ? ('Mejor resultado: '+best+' '+curUnit) : '';
        var derivedEl = wrap.querySelector('[data-derived-for="'+idx+'"]');
        if(derivedEl){
          var derivedPreview = (typeof best === 'number') ? computeDerivedMetrics(def, best, document.getElementById('evoPlayerSelect').value) : null;
          derivedEl.textContent = formatDerivedMetrics(def, derivedPreview);
        }
      });
    });
    wrap.querySelectorAll('[data-unit]').forEach(function(sel){
      sel.addEventListener('change', function(){ state.evoDraft.tests[+sel.dataset.unit].unitUsed = sel.value; renderEvoDraftTests(); });
    });
    wrap.querySelectorAll('[data-add-attempt]').forEach(function(btn){
      btn.addEventListener('click', function(){ state.evoDraft.tests[+btn.dataset.addAttempt].attempts.push(''); renderEvoDraftTests(); });
    });
    wrap.querySelectorAll('[data-adhoc-weight]').forEach(function(inp){ inp.addEventListener('input', function(){ state.evoDraft.tests[+inp.dataset.adhocWeight].weight = inp.value; }); });
    wrap.querySelectorAll('[data-adhoc-reps]').forEach(function(inp){ inp.addEventListener('input', function(){ state.evoDraft.tests[+inp.dataset.adhocReps].reps = inp.value; }); });
    wrap.querySelectorAll('[data-remove-test]').forEach(function(btn){
      btn.addEventListener('click', function(){ state.evoDraft.tests.splice(+btn.dataset.removeTest,1); renderEvoTestPicker(); renderEvoDraftTests(); });
    });
    wrap.querySelectorAll('[data-side]').forEach(function(sel){ sel.addEventListener('change', function(){ state.evoDraft.tests[+sel.dataset.side].side = sel.value; }); });
    wrap.querySelectorAll('[data-exercise]').forEach(function(inp){ inp.addEventListener('input', function(){ state.evoDraft.tests[+inp.dataset.exercise].exercise = inp.value; }); });
    wrap.querySelectorAll('[data-reps]').forEach(function(inp){ inp.addEventListener('input', function(){ state.evoDraft.tests[+inp.dataset.reps].reps = inp.value; }); });
    wrap.querySelectorAll('[data-notes]').forEach(function(ta){ ta.addEventListener('input', function(){ state.evoDraft.tests[+ta.dataset.notes].notes = ta.value; }); });
  }

  export function convertValueToCanonical(def, value, fromUnit){
    if(typeof value !== 'number' || isNaN(value)) return value;
    var canonical = (def.units && def.units[0]) || '';
    if(!fromUnit || fromUnit === canonical) return value;
    // Velocidad de sprints: km/h y m/s no son la unidad canónica (segundos) directamente,
    // hace falta la distancia del test para pasar de velocidad a tiempo.
    if(def.calc === 'speed' && def.distance && (fromUnit === 'km/h' || fromUnit === 'm/s')){
      var metersPerSecond = fromUnit === 'km/h' ? value/3.6 : value;
      return metersPerSecond > 0 ? def.distance/metersPerSecond : value;
    }
    if(UNIT_FACTOR_TO_KG[fromUnit] && UNIT_FACTOR_TO_KG[canonical]){
      return value * UNIT_FACTOR_TO_KG[fromUnit] / UNIT_FACTOR_TO_KG[canonical];
    }
    if(UNIT_FACTOR_TO_CM[fromUnit] && UNIT_FACTOR_TO_CM[canonical]){
      return value * UNIT_FACTOR_TO_CM[fromUnit] / UNIT_FACTOR_TO_CM[canonical];
    }
    return value; // no hay conversión conocida para este par de unidades, se guarda tal cual
  }

  export function computeDerivedMetrics(def, bestResult, playerName){
    if(typeof bestResult !== 'number' || isNaN(bestResult)) return null;
    if(def.calc === 'speed' && def.distance && bestResult > 0){
      var mps = def.distance / bestResult;
      return { speedMs: +mps.toFixed(2), speedKmh: +(mps*3.6).toFixed(2) };
    }
    if(def.calc === 'jumpPower' && bestResult > 0){
      var heightM = bestResult/100;
      var takeoffVelocityMs = +Math.sqrt(2*GRAVITY*heightM).toFixed(2);
      var out = { takeoffVelocityMs: takeoffVelocityMs };
      var weightRaw = playerName ? (getPlayerInfo(playerName).weight || '') : '';
      var weightKg = parseFloat(String(weightRaw).replace(',','.'));
      if(weightRaw && !isNaN(weightKg) && weightKg > 0){
        // Fórmula de Sayers (potencia pico estimada a partir de la altura del salto y el peso corporal)
        out.peakPowerW = Math.round(60.7*bestResult + 45.3*weightKg - 2055);
        out.weightUsedKg = weightKg;
      }
      return out;
    }
    return null;
  }

  export function formatDerivedMetrics(def, derived){
    if(!derived) return '';
    if(def.calc === 'speed'){
      return 'Velocidad media: '+derived.speedMs+' m/s ('+derived.speedKmh+' km/h)';
    }
    if(def.calc === 'jumpPower'){
      var txt = 'Velocidad de despegue: '+derived.takeoffVelocityMs+' m/s';
      txt += derived.peakPowerW
        ? (' · Potencia estimada: '+derived.peakPowerW+' W (con '+derived.weightUsedKg+' kg de la ficha)')
        : ' · Cargá el peso del jugador en Jugadores para estimar también la potencia';
      return txt;
    }
    return '';
  }

  export function computeBest(def, attempts){
    if(!def) return null;
    var nums = attempts.map(function(v){ return parseFloat(v); }).filter(function(n){ return !isNaN(n); });
    if(def.resultType === 'text'){ var lastText = attempts.filter(Boolean).pop(); return lastText || null; }
    if(!nums.length) return null;
    if(def.higherIsBetter === false) return Math.min.apply(null, nums);
    return Math.max.apply(null, nums);
  }

  export function exportEvaluationPdf(evId){
    var teamId = state.currentTeamId;
    var ev = (state.evaluations[teamId]||[]).find(function(e){ return e.id===evId; });
    if(!ev){ showToast('No se encontró la evaluación'); return; }
    showToast('Generando informe...');
    var allEvals = (state.evaluations[teamId]||[]).filter(function(e){ return e.playerName===ev.playerName; })
      .slice().sort(function(a,b){ return a.date < b.date ? -1 : 1; });

    function previousResult(testId, exercise){
      var prevVal = null;
      allEvals.forEach(function(e){
        if(e.date >= ev.date && e.id === ev.id) return;
        if(e.date > ev.date) return;
        (e.tests||[]).forEach(function(t){
          var sameExercise = (t.exercise||'').trim().toLowerCase() === (exercise||'').trim().toLowerCase();
          if(t.testId===testId && sameExercise && typeof t.bestResult==='number') prevVal = t.bestResult;
        });
      });
      return prevVal;
    }

    var byCat = {};
    (ev.tests||[]).forEach(function(t){
      var cat = (t.categories && t.categories[0]) || 'personalizado';
      var catLabel = (EVO_CATEGORIES.find(function(c){return c.key===cat;})||{label:'Otros'}).label;
      if(!byCat[catLabel]) byCat[catLabel] = [];
      byCat[catLabel].push(t);
    });

    var doc = pdfDoc(), xPos = 40, w = 515, y = 50;
    doc.setFont('helvetica','bold'); doc.setFontSize(17);
    y = pdfWrapped(doc, 'EVALUACIÓN FÍSICA', xPos, y, w, 20);
    doc.setFont('helvetica','normal'); doc.setFontSize(11);
    y = pdfWrapped(doc, 'Jugador: '+ev.playerName, xPos, y+8, w, 15);
    y = pdfWrapped(doc, (currentTeam()?currentTeam().name+' · ':'')+'Fecha: '+fmtDateShort(ev.date)+' · '+(ev.label||'Evaluación'), xPos, y, w, 15);

    Object.keys(byCat).forEach(function(catLabel){
      if(y > 720){ doc.addPage(); y = 50; }
      doc.setFont('helvetica','bold'); doc.setFontSize(13);
      y = pdfWrapped(doc, catLabel, xPos, y+16, w, 17);
      doc.setFont('helvetica','normal'); doc.setFontSize(10.5);
      byCat[catLabel].forEach(function(t){
        if(y > 760){ doc.addPage(); y = 50; }
        var resultText = t.adhoc
          ? ((t.weight?('Peso: '+t.weight+' kg'):'')+(t.reps?(' · Reps: '+t.reps):''))
          : (t.bestResult!==null && t.bestResult!==undefined ? (t.bestResult+' '+(t.unit||'')) : 'Sin resultado');
        var prev = previousResult(t.testId, t.exercise);
        var evoText = '';
        if(prev !== null && typeof t.bestResult === 'number'){
          var diff = t.bestResult - prev;
          var improved = t.higherIsBetter === false ? diff < 0 : diff > 0;
          evoText = '  (anterior: '+prev+' '+(t.unit||'')+' → '+(improved?'mejoró':'empeoró')+' '+(diff>0?'+':'')+diff.toFixed(2)+')';
        }
        var testLabel = t.exercise ? (t.testName+' — '+t.exercise) : t.testName;
        y = pdfWrapped(doc, '• '+testLabel+': '+resultText+evoText, xPos, y+4, w, 14);
        if(t.calc){
          var derivedDef = findTest(t.testId);
          var derivedText = derivedDef ? formatDerivedMetrics(derivedDef, t.calc) : '';
          if(derivedText) y = pdfWrapped(doc, '   '+derivedText, xPos, y, w, 13);
        }
        if(t.notes) y = pdfWrapped(doc, '   Obs: '+t.notes, xPos, y, w, 13);
      });
    });

    doc.save(pdfFileName(ev.playerName+'_evaluacion_'+ev.date)+'.pdf');
  }

  export function saveEvaluation(){
    var teamId = state.currentTeamId;
    var playerName = document.getElementById('evoPlayerSelect').value;
    var date = document.getElementById('evoEvalDate').value || new Date().toISOString().slice(0,10);
    var label = document.getElementById('evoEvalLabel').value.trim() || 'Evaluación';
    if(!state.evoDraft.tests.length){ showToast('Agregá al menos un test'); return; }
    var testsOut = [];
    var hasError = false;
    state.evoDraft.tests.forEach(function(dt){
      if(dt.adhoc){
        if(!dt.weight && !dt.reps){ hasError = true; return; }
        testsOut.push({
          testId: dt.testId, testName: dt.testName, categories:['personalizado'], unit:'kg',
          higherIsBetter: true, resultType:'number', adhoc:true,
          attempts: dt.weight ? [parseFloat(dt.weight)] : [], bestResult: dt.weight ? parseFloat(dt.weight) : null,
          side:null, exercise:null, weight: dt.weight||'', reps: dt.reps||'', notes: dt.notes||''
        });
        return;
      }
      var def = findTest(dt.testId);
      var canonicalUnit = (def.units && def.units[0]) || '';
      var chosenUnit = dt.unitUsed || canonicalUnit;
      var attemptsNums = dt.attempts.map(function(v){ return parseFloat(v); }).filter(function(n){ return !isNaN(n); })
        .map(function(n){ return convertValueToCanonical(def, n, chosenUnit); });
      var best = def.resultType==='text' ? computeBest(def, dt.attempts) : (function(){
        if(!attemptsNums.length) return null;
        return def.higherIsBetter === false ? Math.min.apply(null, attemptsNums) : Math.max.apply(null, attemptsNums);
      })();
      if(best === null){ hasError = true; return; }
      var out = {
        testId: dt.testId, testName: dt.testName, categories: (def.categories||[]), unit: canonicalUnit,
        unitEntered: chosenUnit, higherIsBetter: def.higherIsBetter, resultType: def.resultType||'number',
        attempts: def.resultType==='text' ? dt.attempts.filter(Boolean) : attemptsNums,
        bestResult: best, side: dt.side||null, exercise: dt.exercise||null, notes: dt.notes||''
      };
      var derived = computeDerivedMetrics(def, best, playerName);
      if(derived) out.calc = derived;
      if(def.calc === '1rm' && dt.reps && parseFloat(dt.reps) > 1 && typeof best === 'number'){
        out.calc = { estimated1RM: +(best * (1 + parseFloat(dt.reps)/30)).toFixed(1) };
      }
      testsOut.push(out);
    });
    if(hasError){ showToast('Completá al menos un intento en cada test agregado'); return; }
    // IMC automático si en esta misma evaluación se cargó Altura y Peso.
    var alturaT = testsOut.find(function(t){ return t.testId==='altura'; });
    var pesoT = testsOut.find(function(t){ return t.testId==='peso_corporal'; });
    if(alturaT && pesoT && alturaT.bestResult > 0){
      var alturaM = alturaT.bestResult/100;
      var imc = +(pesoT.bestResult / (alturaM*alturaM)).toFixed(1);
      testsOut.push({ testId:'imc_auto', testName:'IMC (calculado)', categories:['antropometria'], unit:'', higherIsBetter:null, resultType:'number', attempts:[imc], bestResult:imc, side:null, exercise:null, notes:'Calculado automáticamente a partir de Altura y Peso de esta evaluación.' });
    }
    // Si esta evaluación cargó datos antropométricos (altura, peso, envergadura, % grasa,
    // masa muscular, masa grasa), se copian también a la ficha del jugador en Jugadores —
    // así no hay que cargarlos dos veces, y la ficha siempre queda con el último valor.
    var EVO_TO_PLAYERINFO = {
      altura: { key:'height', convert:function(cm){ return (cm/100).toFixed(2); } }, // cm -> m (así se guarda en la ficha)
      peso_corporal: { key:'weight', convert:function(v){ return String(v); } },
      envergadura: { key:'wingspan', convert:function(v){ return String(v); } },
      grasa_pct: { key:'bodyFatPct', convert:function(v){ return String(v); } },
      masa_muscular: { key:'muscleMass', convert:function(v){ return String(v); } },
      masa_grasa: { key:'fatMass', convert:function(v){ return String(v); } }
    };
    var infoChanged = false;
    testsOut.forEach(function(t){
      var map = EVO_TO_PLAYERINFO[t.testId];
      if(map && typeof t.bestResult === 'number'){
        getPlayerInfo(playerName)[map.key] = map.convert(t.bestResult);
        infoChanged = true;
      }
    });
    var doc = { playerName:playerName, date:date, label:label, tests:testsOut, createdBy:{uid:state.user.uid, email:state.user.email}, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
    evaluationCollection(teamId).add(doc).then(function(ref){
      doc.id = ref.id;
      if(!state.evaluations[teamId]) state.evaluations[teamId] = [];
      state.evaluations[teamId].unshift(doc);
      if(infoChanged) return savePlayerInfoDoc();
    }).then(function(){
      showToast(infoChanged ? 'Evaluación guardada y ficha del jugador actualizada' : 'Evaluación guardada');
      closeEvoBuilder();
      renderEvoHistory();
      if(document.getElementById('infoList')) renderInfoList();
    }).catch(fail);
  }
