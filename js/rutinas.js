// ============ Rutinas físicas. ============
import { publicExerciseCollection } from './biblioteca.js';
import { db } from './firebase-config.js';
import { deleteImageFile, escapeAttr, escapeHtml, fail, genId, imageUrlToPdfData, pdfDoc, pdfFileName, pdfImageFormat, pdfWrapped, photoThumbHtml, showToast, state, uploadImageFile } from './state.js';

  export var EXAMPLE_EXERCISE_ICONS = {
    sentadilla: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#EAF0F5"/><circle cx="50" cy="26" r="9" fill="none" stroke="#234A80" stroke-width="5"/><path d="M50 35 L50 54 M50 41 L33 48 M50 41 L67 48 M50 54 L40 80 M40 80 L28 80 M50 54 L64 80 M64 80 L74 80" fill="none" stroke="#234A80" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    flexiones: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#EAF0F5"/><circle cx="78" cy="42" r="8" fill="none" stroke="#234A80" stroke-width="5"/><path d="M70 46 L28 60 M28 60 L16 78 M28 60 L34 80 M45 55 L40 78 M60 50 L64 40 M60 50 L68 62" fill="none" stroke="#234A80" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    plancha: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#EAF0F5"/><circle cx="80" cy="46" r="8" fill="none" stroke="#234A80" stroke-width="5"/><path d="M72 48 L20 62 M20 62 L20 80 M40 58 L36 80 M62 52 L66 40 M62 52 L70 40" fill="none" stroke="#234A80" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    zancadas: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#EAF0F5"/><circle cx="46" cy="24" r="9" fill="none" stroke="#234A80" stroke-width="5"/><path d="M46 33 L48 54 M48 40 L34 48 M48 40 L62 46 M48 54 L30 66 M30 66 L20 82 M48 54 L64 62 M64 62 L64 82" fill="none" stroke="#234A80" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    abdominales: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#EAF0F5"/><circle cx="66" cy="52" r="8" fill="none" stroke="#234A80" stroke-width="5"/><path d="M58 55 L34 62 M34 62 L18 52 M34 62 L20 74 M46 60 L46 78 M46 78 L36 82 M46 78 L58 82" fill="none" stroke="#234A80" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    salto: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#EAF0F5"/><circle cx="50" cy="22" r="9" fill="none" stroke="#234A80" stroke-width="5"/><path d="M50 31 L50 58 M50 38 L34 24 M50 38 L66 24 M50 58 L36 78 M50 58 L64 78" fill="none" stroke="#234A80" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 70 L20 70 M80 70 L86 70 M50 92 L50 98" stroke="#9FB8D6" stroke-width="4" stroke-linecap="round"/></svg>'
  };


  export function svgToDataUri(svg){ return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))); }

  export function exampleExerciseIcon(key){ return svgToDataUri(EXAMPLE_EXERCISE_ICONS[key]); }

  export function loadExampleRoutine(){
    var r = {
      name: 'Rutina de ejemplo — Fuerza general',
      objective: 'Ejemplo para mostrar cómo se arma una rutina (borrala cuando quieras)',
      days: [{
        id: genId('day'), label:'Día 1', title:'Full body',
        blocks: [{
          id: genId('blk'), title:'Bloque principal', rounds:'3',
          exercises: [
            {id:genId('ex'), name:'Sentadilla', sets:'3x12', weight:'', notes:'Peso corporal o con barra', photoUrl: exampleExerciseIcon('sentadilla')},
            {id:genId('ex'), name:'Flexiones de brazos', sets:'3x10', weight:'', notes:'Apoyo de rodillas si hace falta', photoUrl: exampleExerciseIcon('flexiones')},
            {id:genId('ex'), name:'Plancha', sets:'3x30seg', weight:'', notes:'', photoUrl: exampleExerciseIcon('plancha')},
            {id:genId('ex'), name:'Zancadas', sets:'3x10 c/pierna', weight:'', notes:'', photoUrl: exampleExerciseIcon('zancadas')},
            {id:genId('ex'), name:'Abdominales', sets:'3x15', weight:'', notes:'', photoUrl: exampleExerciseIcon('abdominales')},
            {id:genId('ex'), name:'Salto al cajón', sets:'3x8', weight:'', notes:'Sacar si no hay cajón disponible', photoUrl: exampleExerciseIcon('salto')}
          ]
        }]
      }],
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    return routineCollection().add(r).then(function(){ showToast('Rutina de ejemplo agregada'); return refreshRoutines(); }).catch(fail);
  }

  export function exportRoutinePdf(r){
    showToast('Generando PDF...');
    var urls = [];
    (r.days||[]).forEach(function(day){ (day.blocks||[]).forEach(function(block){ (block.exercises||[]).forEach(function(ex){
      if(ex.photoUrl && urls.indexOf(ex.photoUrl) === -1) urls.push(ex.photoUrl);
    }); }); });
    Promise.all(urls.map(function(u){ return imageUrlToPdfData(u).catch(function(){ return null; }); })).then(function(results){
      var imgMap = {};
      urls.forEach(function(u, i){ imgMap[u] = results[i]; });
      var doc = pdfDoc(), x = 40, w = 515, y = 50;
      var maxImgSize = 90;
      doc.setFont('helvetica','bold'); doc.setFontSize(16);
      y = pdfWrapped(doc, r.name || 'Rutina física', x, y, w, 20);
      if(r.objective){ doc.setFont('helvetica','normal'); doc.setFontSize(10.5); y = pdfWrapped(doc, 'Objetivo: '+r.objective, x, y+2, w, 14); }
      (r.days||[]).forEach(function(day){
        doc.setFont('helvetica','bold'); doc.setFontSize(13);
        y = pdfWrapped(doc, (day.label||'Día')+(day.title?' — '+day.title:''), x, y+14, w, 16);
        (day.blocks||[]).forEach(function(block){
          doc.setFont('helvetica','bold'); doc.setFontSize(11);
          y = pdfWrapped(doc, (block.title||'Bloque')+(block.rounds?' ('+block.rounds+' vueltas)':''), x+10, y+8, w-10, 14);
          doc.setFont('helvetica','normal'); doc.setFontSize(10);
          (block.exercises||[]).forEach(function(ex){
            var img = ex.photoUrl ? imgMap[ex.photoUrl] : null;
            var textX = x+20;
            if(img){
              if(y + maxImgSize > 790){ doc.addPage(); y = 40; }
              var scale = Math.min(maxImgSize/img.w, maxImgSize/img.h, 1);
              var iw = img.w*scale, ih = img.h*scale;
              try{ doc.addImage(img.dataUrl, pdfImageFormat(img.dataUrl), x+20, y, iw, ih); }catch(err){}
              textX = x + 20 + maxImgSize + 10;
              var lineY = y + 12;
              var line = (ex.name||'')+(ex.sets?' — '+ex.sets:'')+(ex.weight?' — '+ex.weight:'')+(ex.notes?' ('+ex.notes+')':'');
              pdfWrapped(doc, '• '+line, textX, lineY, w-20-maxImgSize-10, 13);
              y += Math.max(ih, 24) + 6;
            } else {
              var line2 = '• '+(ex.name||'')+(ex.sets?' — '+ex.sets:'')+(ex.weight?' — '+ex.weight:'')+(ex.notes?' ('+ex.notes+')':'');
              y = pdfWrapped(doc, line2, textX, y+4, w-20, 13);
            }
          });
        });
      });
      doc.save(pdfFileName(r.name)+'.pdf');
    });
  }

  export function routineCollection(){ return db.collection('users').doc(state.user.uid).collection('routines'); }

  export function refreshRoutines(){ return routineCollection().orderBy('updatedAt','desc').get().then(function(s){state.routines=s.docs.map(function(d){var x=d.data();x.id=d.id;return x;});renderRoutinesList();}).catch(function(e){ console.error('refreshRoutines error:', e); fail(e); }); }

  export function toggleRoutineFavorite(r){ r.isFavorite=!r.isFavorite; routineCollection().doc(r.id).update({isFavorite:r.isFavorite}).catch(fail); renderRoutinesList(); }

  export function renderRoutinesList(){
    var wrap=document.getElementById('routinesList'), q=(document.getElementById('routineSearch').value||'').toLowerCase();
    var favBtn=document.getElementById('routineFavFilterBtn'), favOnly=favBtn&&favBtn.classList.contains('active');
    var list=(state.routines||[]).filter(function(r){return (!q||(r.name||'').toLowerCase().indexOf(q)!==-1)&&(!favOnly||r.isFavorite);});
    if(!list.length){
      wrap.innerHTML='<div class="empty-inline">Todavía no hay rutinas que coincidan.</div>'
        +(favOnly?'':'<button class="btn secondary small" id="loadExampleRoutineBtn" type="button" style="margin-top:10px;">Cargar rutina de ejemplo con ejercicios comunes</button>');
      var exBtn = document.getElementById('loadExampleRoutineBtn');
      if(exBtn) exBtn.addEventListener('click', loadExampleRoutine);
      return;
    }
    wrap.innerHTML='';
    list.forEach(function(r){
      var el=document.createElement('div');el.className='plan-card';
      el.innerHTML='<button class="fav-star'+(r.isFavorite?' active':'')+'" data-a="fav" title="'+(r.isFavorite?'Quitar de favoritas':'Marcar como favorita')+'">'+(r.isFavorite?'★':'☆')+'</button><div><h3>'+escapeHtml(r.name)+'</h3><div class="meta-line">'+escapeHtml(String((r.days||[]).length))+' días'+(r.objective?(' · '+escapeHtml(r.objective)):'')+'</div></div><div class="play-actions"><button class="btn secondary small" data-a="open">Abrir</button><button class="btn secondary small" data-a="pdf">PDF</button><button class="btn danger small" data-a="delete">Borrar</button></div>';
      el.querySelector('[data-a="fav"]').onclick=function(){ toggleRoutineFavorite(r); };
      el.querySelector('[data-a="open"]').onclick=function(){ openRoutine(r); };
      el.querySelector('[data-a="pdf"]').onclick=function(){ exportRoutinePdf(r); };
      el.querySelector('[data-a="delete"]').onclick=function(){ if(confirm('¿Borrar esta rutina?')) routineCollection().doc(r.id).delete().then(refreshRoutines).catch(fail); };
      wrap.appendChild(el);
    });
  }

  export function newRoutine(){
    state.editingRoutine = {id:null,name:'',objective:'',days:[]};
    document.getElementById('routineEditorTitle').textContent='Nueva rutina';
    document.getElementById('routineName').value='';
    document.getElementById('routineObjective').value='';
    renderDays();
    document.getElementById('routineEditor').hidden=false;
  }

  export function openRoutine(r){
    state.editingRoutine = JSON.parse(JSON.stringify(r));
    document.getElementById('routineEditorTitle').textContent=r.name;
    document.getElementById('routineName').value=r.name||'';
    document.getElementById('routineObjective').value=r.objective||'';
    renderDays();
    document.getElementById('routineEditor').hidden=false;
  }

  export function closeRoutineEditor(){ document.getElementById('routineEditor').hidden=true; state.editingRoutine=null; }

  export function findDay(dayId){ return (state.editingRoutine.days||[]).find(function(d){return d.id===dayId;}); }

  export function findBlock(dayId,blockId){ var d=findDay(dayId); if(!d)return null; return (d.blocks||[]).find(function(b){return b.id===blockId;}); }

  export function addDay(){
    if(!state.editingRoutine)return;
    state.editingRoutine.days.push({id:genId('day'),label:'Día '+(state.editingRoutine.days.length+1),title:'',blocks:[]});
    renderDays();
  }

  export function removeDay(dayId){
    if(!state.editingRoutine)return;
    if(!confirm('¿Borrar este día?'))return;
    state.editingRoutine.days = state.editingRoutine.days.filter(function(d){return d.id!==dayId;});
    renderDays();
  }

  export function addBlock(dayId){
    var day=findDay(dayId); if(!day)return;
    day.blocks.push({id:genId('blk'),title:'Bloque '+(day.blocks.length+1),rounds:'',exercises:[]});
    renderDays();
  }

  export function removeBlock(dayId,blockId){
    var day=findDay(dayId); if(!day)return;
    if(!confirm('¿Borrar este bloque?'))return;
    day.blocks = day.blocks.filter(function(b){return b.id!==blockId;});
    renderDays();
  }

  export function addExercise(dayId,blockId){
    var block=findBlock(dayId,blockId); if(!block)return;
    block.exercises.push({id:genId('ex'),name:'',sets:'',weight:'',notes:'',photoUrl:null});
    renderDays();
  }

  export function removeExercise(dayId,blockId,exId){
    var block=findBlock(dayId,blockId); if(!block)return;
    block.exercises = block.exercises.filter(function(e){return e.id!==exId;});
    renderDays();
  }

  export function addExerciseFromLibrary(dayId, blockId, isPublic){
    var day = findDay(dayId); if(!day) return;
    var block = (day.blocks||[]).find(function(b){return b.id===blockId;}); if(!block) return;
    var sourcePromise = isPublic
      ? publicExerciseCollection().orderBy('updatedAt','desc').get().then(function(snap){ return snap.docs.map(function(d){ var x=d.data(); x.id=d.id; return x; }); })
      : Promise.resolve(state.exercises || []);
    showToast('Buscando en la biblioteca'+(isPublic?' pública':'')+'…');
    sourcePromise.then(function(list){
      if(!list.length){ showToast('Todavía no hay ejercicios en esa biblioteca'); return; }
      var choices = list.map(function(x,i){ return (i+1)+'. '+x.name+(isPublic && x.createdBy && x.createdBy.email ? ' — '+x.createdBy.email : ''); }).join('\n');
      var selected = parseInt(prompt('Elegí un ejercicio de la biblioteca'+(isPublic?' pública':'')+' escribiendo su número:\n'+choices), 10) - 1;
      var x = list[selected]; if(!x) return;
      var notesParts = [x.description, x.objective ? 'Objetivo: '+x.objective : '', (x.materials&&x.materials.length) ? 'Materiales: '+x.materials.join(', ') : ''].filter(Boolean);
      block.exercises.push({ id: genId('ex'), name: x.name||'', sets:'', weight:'', notes: notesParts.join(' — '), photoUrl:null });
      renderDays();
    }).catch(function(e){ fail(e); });
  }

  export function openExercisePicker(dayId, blockId){
    var day = findDay(dayId); if(!day) return;
    var block = (day.blocks||[]).find(function(b){return b.id===blockId;}); if(!block) return;
    var seen = {}, list = [];
    var sources = (state.routines||[]).slice();
    if(state.editingRoutine) sources.push(state.editingRoutine);
    sources.forEach(function(r){
      (r.days||[]).forEach(function(d){
        (d.blocks||[]).forEach(function(b){
          (b.exercises||[]).forEach(function(ex){
            var key = (ex.name||'').trim().toLowerCase();
            if(!key || seen[key]) return;
            seen[key] = true;
            list.push(ex);
          });
        });
      });
    });
    if(!list.length){ showToast('Todavía no cargaste ejercicios en ninguna rutina'); return; }
    list.sort(function(a,b){ return (a.name||'').localeCompare(b.name||''); });
    var choices = list.map(function(x,i){ return (i+1)+'. '+x.name+(x.sets?(' — '+x.sets):''); }).join('\n');
    var selected = parseInt(prompt('Elegí un ejercicio ya usado escribiendo su número:\n'+choices), 10) - 1;
    var x = list[selected]; if(!x) return;
    block.exercises.push({id:genId('ex'), name:x.name||'', sets:x.sets||'', weight:x.weight||'', notes:x.notes||'', photoUrl:x.photoUrl||null});
    renderDays();
    showToast('Ejercicio agregado (recordá "Guardar rutina")');
  }

  export function renderDays(){
    var wrap=document.getElementById('daysList'); wrap.innerHTML='';
    if(!state.editingRoutine)return;
    state.editingRoutine.days.forEach(function(day){
      var dayEl=document.createElement('div'); dayEl.className='activity-card';
      var exRowsHtml = function(block){
        return (block.exercises||[]).map(function(ex){
          return '<div class="row exercise-row" data-ex="'+ex.id+'" style="flex-wrap:wrap;">'
            +photoThumbHtml(ex.photoUrl, 44)
            +'<input class="text-input" data-f="name" placeholder="Nombre del ejercicio" value="'+escapeAttr(ex.name||'')+'">'
            +'<input class="text-input" data-f="sets" placeholder="Series x reps (ej: 3x10-8-6)" value="'+escapeAttr(ex.sets||'')+'">'
            +'<input class="text-input" data-f="weight" placeholder="Peso (opcional)" value="'+escapeAttr(ex.weight||'')+'">'
            +'<input class="text-input" data-f="notes" placeholder="Notas (opcional)" value="'+escapeAttr(ex.notes||'')+'">'
            +'<input type="file" accept="image/*" class="exPhotoInput" data-ex-photo="'+ex.id+'" style="max-width:140px;">'
            +(ex.photoUrl?'<button class="btn secondary small removeExPhotoBtn" data-ex-photo-remove="'+ex.id+'" type="button">Quitar foto</button>':'')
            +'<button class="btn danger small" data-a="removeEx" type="button">✕</button>'
            +'</div>';
        }).join('');
      };
      var blocksHtml = (day.blocks||[]).map(function(block){
        return '<div class="activity-card" data-block="'+block.id+'" style="margin-top:10px;">'
          +'<div class="row"><input class="text-input" data-f="blockTitle" placeholder="Nombre del bloque" value="'+escapeAttr(block.title||'')+'" style="flex:2;">'
          +'<input class="text-input" data-f="blockRounds" placeholder="Vueltas (ej: 3)" value="'+escapeAttr(block.rounds||'')+'" style="flex:1;">'
          +'<button class="btn danger small" data-a="removeBlock" type="button">Borrar bloque</button></div>'
          +'<div class="exercises-wrap">'+exRowsHtml(block)+'</div>'
          +'<div class="row" style="margin-top:6px;"><button class="btn secondary small" data-a="addEx" type="button">+ Ejercicio</button>'
          +'<button class="btn secondary small" data-a="addExFromUsed" type="button">+ Ejercicio ya usado</button>'
          +'<button class="btn secondary small" data-a="addExFromLibrary" type="button">+ Desde biblioteca</button>'
          +'<button class="btn secondary small" data-a="addExFromPublicLibrary" type="button">+ Desde biblioteca pública</button></div>'
          +'</div>';
      }).join('');
      dayEl.innerHTML = '<div class="row"><input class="text-input" data-f="dayLabel" placeholder="Ej: Día 1" value="'+escapeAttr(day.label||'')+'" style="flex:1;">'
        +'<input class="text-input" data-f="dayTitle" placeholder="Objetivo del día (opcional)" value="'+escapeAttr(day.title||'')+'" style="flex:2;">'
        +'<button class="btn danger small" data-a="removeDay" type="button">Borrar día</button></div>'
        +'<div class="blocks-wrap">'+blocksHtml+'</div>'
        +'<button class="btn secondary small" data-a="addBlock" type="button" style="margin-top:8px;">+ Bloque</button>';
      dayEl.querySelector('[data-f="dayLabel"]').addEventListener('input', function(e){ day.label=e.target.value; });
      dayEl.querySelector('[data-f="dayTitle"]').addEventListener('input', function(e){ day.title=e.target.value; });
      dayEl.querySelector('[data-a="removeDay"]').addEventListener('click', function(){ removeDay(day.id); });
      dayEl.querySelector('[data-a="addBlock"]').addEventListener('click', function(){ addBlock(day.id); });
      dayEl.querySelectorAll('[data-block]').forEach(function(blockEl){
        var blockId = blockEl.getAttribute('data-block');
        var block = (day.blocks||[]).find(function(b){return b.id===blockId;});
        blockEl.querySelector('[data-f="blockTitle"]').addEventListener('input', function(e){ block.title=e.target.value; });
        blockEl.querySelector('[data-f="blockRounds"]').addEventListener('input', function(e){ block.rounds=e.target.value; });
        blockEl.querySelector('[data-a="removeBlock"]').addEventListener('click', function(){ removeBlock(day.id, block.id); });
        blockEl.querySelector('[data-a="addEx"]').addEventListener('click', function(){ addExercise(day.id, block.id); });
        blockEl.querySelector('[data-a="addExFromUsed"]').addEventListener('click', function(){ openExercisePicker(day.id, block.id); });
        blockEl.querySelector('[data-a="addExFromLibrary"]').addEventListener('click', function(){ addExerciseFromLibrary(day.id, block.id, false); });
        blockEl.querySelector('[data-a="addExFromPublicLibrary"]').addEventListener('click', function(){ addExerciseFromLibrary(day.id, block.id, true); });
        blockEl.querySelectorAll('[data-ex]').forEach(function(exEl){
          var exId = exEl.getAttribute('data-ex');
          var ex = (block.exercises||[]).find(function(x){return x.id===exId;});
          exEl.querySelector('[data-f="name"]').addEventListener('input', function(e){ ex.name=e.target.value; });
          exEl.querySelector('[data-f="sets"]').addEventListener('input', function(e){ ex.sets=e.target.value; });
          exEl.querySelector('[data-f="weight"]').addEventListener('input', function(e){ ex.weight=e.target.value; });
          exEl.querySelector('[data-f="notes"]').addEventListener('input', function(e){ ex.notes=e.target.value; });
          exEl.querySelector('[data-a="removeEx"]').addEventListener('click', function(){ removeExercise(day.id, block.id, ex.id); });
          var photoInput = exEl.querySelector('[data-ex-photo]');
          photoInput.addEventListener('click', function(e){ e.stopPropagation(); });
          photoInput.addEventListener('change', function(e){
            var file = photoInput.files[0]; if(!file) return;
            showToast('Subiendo foto...');
            uploadImageFile(file).then(function(url){ ex.photoUrl = url; renderDays(); showToast('Foto guardada (recordá "Guardar rutina")'); })
              .catch(function(e){ if(e.message!=='not-image'&&e.message!=='too-big') fail(e); });
          });
          var removeExPhotoBtn = exEl.querySelector('[data-ex-photo-remove]');
          if(removeExPhotoBtn){
            removeExPhotoBtn.addEventListener('click', function(){
              deleteImageFile().then(function(){ delete ex.photoUrl; renderDays(); showToast('Foto quitada (recordá "Guardar rutina")'); });
            });
          }
        });
      });
      wrap.appendChild(dayEl);
    });
  }

  export function saveRoutine(){
    if(!state.editingRoutine)return;
    var r = state.editingRoutine;
    var name = document.getElementById('routineName').value.trim();
    if(!name){ showToast('Ponele un nombre a la rutina'); return; }
    r.name = name;
    r.objective = document.getElementById('routineObjective').value.trim();
    r.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    if(!r.id){
      r.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      delete r.id;
      routineCollection().add(r).then(function(){ showToast('Rutina guardada'); closeRoutineEditor(); return refreshRoutines(); }).catch(fail);
    } else {
      routineCollection().doc(r.id).set(r,{merge:true}).then(function(){ showToast('Rutina actualizada'); closeRoutineEditor(); return refreshRoutines(); }).catch(fail);
    }
  }
