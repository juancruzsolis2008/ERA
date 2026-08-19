// ============ Planificaciones de clase. ============
import { captureDiagramImages, freehandPathD, publicExerciseCollection, zigzagPathD } from './biblioteca.js';
import { renderCalendar } from './calendario.js';
import { db } from './firebase-config.js';
import { renderDashboard } from './inicio.js';
import { currentTeam, escapeAttr, escapeHtml, fail, fmtDateShort, genId, pdfDoc, pdfFileName, pdfWrapped, showToast, state } from './state.js';

  export function exportPlanPdf(p){
    showToast('Generando PDF...');
    var activities = p.activities || [];
    var chain = Promise.resolve(), imagesPerActivity = [];
    activities.forEach(function(a){
      chain = chain.then(function(){ return captureDiagramImages(a); }).then(function(imgs){ imagesPerActivity.push(imgs); });
    });
    chain.then(function(){
      var doc = pdfDoc(), x = 40, w = 515, y = 50;
      doc.setFont('helvetica','bold'); doc.setFontSize(16);
      y = pdfWrapped(doc, p.name || 'Planificación', x, y, w, 20);
      doc.setFont('helvetica','normal'); doc.setFontSize(10.5);
      y = pdfWrapped(doc, [p.categoryName?('Categoría: '+p.categoryName):'', p.date?('Fecha: '+fmtDateShort(p.date)):'', p.coachName?('Entrenador: '+p.coachName):''].filter(Boolean).join(' · '), x, y+2, w, 14);
      if(p.generalObjective) y = pdfWrapped(doc, 'Objetivo general: '+p.generalObjective, x, y+4, w, 14);
      if(p.observations) y = pdfWrapped(doc, 'Observaciones: '+p.observations, x, y+4, w, 14);
      activities.forEach(function(a, i){
        doc.setFont('helvetica','bold'); doc.setFontSize(12);
        y = pdfWrapped(doc, (i+1)+'. '+(a.name||'Actividad')+(a.durationMinutes?' ('+a.durationMinutes+' min)':''), x, y+12, w, 15);
        doc.setFont('helvetica','normal'); doc.setFontSize(10);
        if(a.objective) y = pdfWrapped(doc, 'Objetivo: '+a.objective, x+10, y, w-10, 13);
        if(a.materials && a.materials.length) y = pdfWrapped(doc, 'Materiales: '+a.materials.join(', '), x+10, y, w-10, 13);
        if(a.description) y = pdfWrapped(doc, a.description, x+10, y, w-10, 13);
        var imgs = imagesPerActivity[i] || [];
        imgs.forEach(function(img, pageIdx){
          if(!img) return;
          var maxW = 300, ratio = img.h/img.w, imgW = maxW, imgH = maxW*ratio;
          if(y + imgH + 14 > 790){ doc.addPage(); y = 40; }
          if(imgs.length > 1){ doc.setFontSize(9); y = pdfWrapped(doc, 'Pizarra '+(pageIdx+1)+'/'+imgs.length, x+10, y+10, w-10, 11); doc.setFontSize(10); }
          try{ doc.addImage(img.dataUrl, 'PNG', x+10, y+2, imgW, imgH); }catch(err){}
          y += imgH + 12;
        });
      });
      doc.save(pdfFileName(p.name)+'.pdf');
    });
  }

  export function planCollection(){return db.collection('teams').doc(state.currentTeamId).collection('lessonPlans');}

  export function newPlan(){state.editingPlan={id:null,activities:[]};document.getElementById('planName').value='';document.getElementById('planDate').value=new Date().toISOString().slice(0,10);document.getElementById('planDuration').value='';document.getElementById('planObjective').value='';document.getElementById('planObservations').value='';document.getElementById('planEditorTitle').textContent='Nueva planificación';document.getElementById('planEditor').hidden=false;renderActivities();}

  export function closePlanEditor(){document.getElementById('planEditor').hidden=true;state.editingPlan=null;}

  export function openPlan(p){state.editingPlan=JSON.parse(JSON.stringify(p));document.getElementById('planName').value=p.name||'';document.getElementById('planDate').value=p.date||'';document.getElementById('planDuration').value=p.durationMinutes||'';document.getElementById('planObjective').value=p.generalObjective||'';document.getElementById('planObservations').value=p.observations||'';document.getElementById('planEditorTitle').textContent='Editar planificación';document.getElementById('planEditor').hidden=false;renderActivities();}

  export function addManualActivity(){if(!state.editingPlan)return;state.editingPlan.activities.push({id:genId('act'),kind:'manual',name:'',description:'',objective:'',materials:[],durationMinutes:null,diagram:null,collapsed:false});renderActivities();var inputs=document.querySelectorAll('#activitiesList [data-f="name"]');var last=inputs[inputs.length-1];if(last)last.focus();}

  export function addLibraryActivity(){var list=state.exercises||[];if(!list.length){showToast('Primero creá un ejercicio en la biblioteca');return;}var choices=list.map(function(x,i){return (i+1)+'. '+x.name;}).join('\n'),selected=parseInt(prompt('Elegí un ejercicio escribiendo su número:\n'+choices),10)-1,x=list[selected];if(!x)return;state.editingPlan.activities.push({id:genId('act'),kind:'exercise',sourceExerciseId:x.id,name:x.name,description:x.description||'',objective:x.objective||'',materials:JSON.parse(JSON.stringify(x.materials||[])),durationMinutes:x.suggestedDurationMinutes||null,diagram:JSON.parse(JSON.stringify(x.diagram||null)),collapsed:false});renderActivities();}

  export function addPublicLibraryActivity(){
    showToast('Buscando en la biblioteca pública…');
    publicExerciseCollection().orderBy('updatedAt','desc').get().then(function(snap){
      var list = snap.docs.map(function(d){ var x=d.data(); x.id=d.id; return x; });
      if(!list.length){ showToast('Todavía no hay ejercicios compartidos en la biblioteca pública'); return; }
      var choices = list.map(function(x,i){ return (i+1)+'. '+x.name+(x.createdBy&&x.createdBy.email ? ' — '+x.createdBy.email : ''); }).join('\n');
      var selected = parseInt(prompt('Elegí un ejercicio de la biblioteca pública escribiendo su número:\n'+choices),10)-1;
      var x = list[selected]; if(!x) return;
      state.editingPlan.activities.push({id:genId('act'),kind:'exercise',sourceExerciseId:null,name:x.name,description:x.description||'',objective:x.objective||'',materials:JSON.parse(JSON.stringify(x.materials||[])),durationMinutes:x.suggestedDurationMinutes||null,diagram:JSON.parse(JSON.stringify(x.diagram||null)),collapsed:false});
      renderActivities();
    }).catch(function(e){ fail(e); });
  }

  export function previewNumber(value){ value=Number(value); return isFinite(value) ? value : 0; }

  export function previewArrow(a, markerId){
    var type=a.type||'line', stroke='#151515', marker=' marker-end="url(#'+markerId+')"';
    if(type==='freehand') return '<path d="'+freehandPathD(a.points||[])+'" fill="none" stroke="'+stroke+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />';
    var x1=previewNumber(a.x1), y1=previewNumber(a.y1), x2=previewNumber(a.x2), y2=previewNumber(a.y2);
    if(type==='dashed') return '<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+stroke+'" stroke-width="2.5" stroke-dasharray="7,6"'+marker+' />';
    if(type==='zigzag') return '<path d="'+zigzagPathD(x1,y1,x2,y2)+'" fill="none" stroke="'+stroke+'" stroke-width="2.5"'+marker+' />';
    if(type==='screen'){ var dx=x2-x1,dy=y2-y1,len=Math.sqrt(dx*dx+dy*dy)||1,px=-dy/len*10,py=dx/len*10; return '<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+stroke+'" stroke-width="2.5" /><line x1="'+(x2+px)+'" y1="'+(y2+py)+'" x2="'+(x2-px)+'" y2="'+(y2-py)+'" stroke="'+stroke+'" stroke-width="2.5" />'; }
    if(type==='shot'){ var sdx=x2-x1,sdy=y2-y1,slen=Math.sqrt(sdx*sdx+sdy*sdy)||1,spx=-sdy/slen*3.2,spy=sdx/slen*3.2;
      return '<line x1="'+(x1+spx)+'" y1="'+(y1+spy)+'" x2="'+(x2+spx)+'" y2="'+(y2+spy)+'" stroke="'+stroke+'" stroke-width="2.5" />'
        +'<line x1="'+(x1-spx)+'" y1="'+(y1-spy)+'" x2="'+(x2-spx)+'" y2="'+(y2-spy)+'" stroke="'+stroke+'" stroke-width="2.5" />'
        +'<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="transparent" stroke-width="1"'+marker+' />'; }
    return '<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+stroke+'" stroke-width="2.5"'+marker+' />';
  }

  export function renderActivityPreview(activity){
    if(!activity.diagram || !activity.diagram.frames || !activity.diagram.frames.length) return '';
    var frames=activity.diagram.frames, page=Math.max(0,Math.min(activity.previewPage||0,frames.length-1)), frame=frames[page], markerId='preview-arrow-'+activity.id+'-'+page;
    var arrows=(frame.arrows||[]).map(function(a){return previewArrow(a,markerId);}).join('');
    // html2canvas no siempre renderiza bien los background-image con SVG en data-URI —
    // por eso el defensor usa un <svg> inline real en vez de depender del CSS .def.
    var tokens=(frame.tokens||[]).map(function(t){
      var style='left:'+previewNumber(t.x)+'%;top:'+previewNumber(t.y)+'%;';
      if(t.type==='def'){
        return '<span class="diagram-preview-token def" style="'+style+'">'
          +'<svg viewBox="0 0 50 40" style="position:absolute;inset:0;width:100%;height:100%;"><path d="M2,24 A21,21 0 0 1 48,24 Z" fill="#B23A32" stroke="#000" stroke-width="2"/><circle cx="25" cy="28" r="9" fill="#B23A32" stroke="#000" stroke-width="2"/></svg>'
          +'<span style="position:relative;">'+escapeHtml(t.label||'')+'</span>'
          +'</span>';
      }
      return '<span class="diagram-preview-token '+escapeAttr(t.type||'')+'" style="'+style+'">'+escapeHtml(t.label||'')+'</span>';
    }).join('');
    // Mismo SVG de cancha que el real de #courtWrap (ver <svg class="lines"> en la sección
    // Pizarra) — mantenerlos sincronizados si se agrega/cambia algún elemento de la cancha.
    var court='<svg viewBox="0 0 580 348" preserveAspectRatio="none" aria-label="Vista previa de pizarra">'
      +'<rect x="0" y="0" width="580" height="348" fill="#8c6339"/>'
      +'<rect x="42" y="42" width="496" height="264" fill="#be8c41"/>'
      +'<rect x="42" y="42" width="496" height="264" fill="none" stroke="#f3eee3" stroke-width="2.5"/>'
      +'<line x1="290" y1="42" x2="290" y2="306" stroke="#f3eee3" stroke-width="2"/>'
      +'<circle cx="290" cy="174" r="42" fill="none" stroke="#f3eee3" stroke-width="2"/>'
      +'<rect x="42" y="132" width="100" height="84" fill="none" stroke="#f3eee3" stroke-width="2"/>'
      +'<circle cx="142" cy="174" r="32" fill="none" stroke="#f3eee3" stroke-width="2"/>'
      +'<path d="M 42,58 L 116,58 A 125,125 0 0 1 116,290 L 42,290" fill="none" stroke="#f3eee3" stroke-width="2"/>'
      +'<circle cx="70" cy="174" r="3" fill="#f3eee3"/>'
      +'<rect x="438" y="132" width="100" height="84" fill="none" stroke="#f3eee3" stroke-width="2"/>'
      +'<circle cx="438" cy="174" r="32" fill="none" stroke="#f3eee3" stroke-width="2"/>'
      +'<path d="M 538,58 L 464,58 A 125,125 0 0 0 464,290 L 538,290" fill="none" stroke="#f3eee3" stroke-width="2"/>'
      +'<circle cx="510" cy="174" r="3" fill="#f3eee3"/>'
      +'</svg>';
    var drawing='<svg viewBox="0 0 580 348" preserveAspectRatio="none"><defs><marker id="'+markerId+'" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#151515"/></marker></defs>'+arrows+'</svg>';
    var nav=frames.length>1?'<div class="diagram-preview-nav"><button class="btn secondary small" data-preview="prev" '+(page===0?'disabled':'')+' type="button">◀</button><span>Pizarra '+(page+1)+' / '+frames.length+'</span><button class="btn secondary small" data-preview="next" '+(page===frames.length-1?'disabled':'')+' type="button">▶</button></div>':'<div class="diagram-preview-nav"><span>Pizarra del ejercicio</span></div>';
    return '<div class="diagram-preview">'+ '<div class="diagram-preview-court">'+court+drawing+tokens+'</div>'+nav+'</div>';
  }

  export function renderActivities(){
    var wrap=document.getElementById('activitiesList'), list=(state.editingPlan&&state.editingPlan.activities)||[];
    if(!list.length){ wrap.innerHTML='<div class="empty-inline">Sumá una actividad manual o elegí una de la biblioteca.</div>'; return; }
    wrap.innerHTML='';
    list.forEach(function(a,index){
      var el=document.createElement('article');
      el.className='activity-block'+(a.collapsed?' collapsed':'');
      el.innerHTML='<div class="activity-head"><h3>'+ (index+1)+'. '+escapeHtml(a.name||'Nueva actividad')+'</h3><div class="play-actions">'
        +'<button class="btn secondary small" data-a="up" '+(index===0?'disabled':'')+' title="Subir actividad">↑</button>'
        +'<button class="btn secondary small" data-a="down" '+(index===list.length-1?'disabled':'')+' title="Bajar actividad">↓</button>'
        +'<button class="btn secondary small" data-a="toggle">'+(a.collapsed?'Abrir':'Plegar')+'</button>'
        +'<button class="btn secondary small" data-a="duplicate">Duplicar</button><button class="btn danger small" data-a="delete">Eliminar</button></div></div>'
        +'<div class="activity-body"><div class="field-grid"><input class="text-input" data-f="name" placeholder="Nombre de la actividad (ej: Práctica de tiros libres)" value="'+escapeAttr(a.name||'')+'">'
        +'<input class="text-input" data-f="durationMinutes" type="number" min="1" placeholder="Minutos" value="'+escapeAttr(a.durationMinutes||'')+'">'
        +'<input class="text-input" data-f="objective" placeholder="Objetivo" value="'+escapeAttr(a.objective||'')+'">'
        +'<input class="text-input" data-f="materials" placeholder="Materiales separados por coma" value="'+escapeAttr((a.materials||[]).join(', '))+'"></div>'
        +'<textarea class="text-input" data-f="description" style="width:100%;min-height:60px;" placeholder="Descripción">'+escapeHtml(a.description||'')+'</textarea></div>'
        +renderActivityPreview(a);
      el.querySelectorAll('[data-f]').forEach(function(input){ input.oninput=function(){ var f=input.dataset.f; if(f==='materials') a.materials=input.value.split(',').map(function(v){return v.trim();}).filter(Boolean); else if(f==='durationMinutes') a.durationMinutes=parseInt(input.value,10)||null; else a[f]=input.value; el.querySelector('h3').textContent=(index+1)+'. '+(a.name||'Nueva actividad'); }; });
      el.querySelector('[data-a="up"]').onclick=function(){ if(index>0){ var previous=list[index-1]; list[index-1]=a; list[index]=previous; renderActivities(); } };
      el.querySelector('[data-a="down"]').onclick=function(){ if(index<list.length-1){ var next=list[index+1]; list[index+1]=a; list[index]=next; renderActivities(); } };
      el.querySelector('[data-a="toggle"]').onclick=function(){ a.collapsed=!a.collapsed; renderActivities(); };
      el.querySelector('[data-a="duplicate"]').onclick=function(){ var copy=JSON.parse(JSON.stringify(a)); copy.id=genId('act'); list.splice(index+1,0,copy); renderActivities(); };
      el.querySelector('[data-a="delete"]').onclick=function(){ list.splice(index,1); renderActivities(); };
      var previousPage=el.querySelector('[data-preview="prev"]'), nextPage=el.querySelector('[data-preview="next"]');
      if(previousPage) previousPage.onclick=function(){ a.previewPage=Math.max(0,(a.previewPage||0)-1); renderActivities(); };
      if(nextPage) nextPage.onclick=function(){ a.previewPage=Math.min(a.diagram.frames.length-1,(a.previewPage||0)+1); renderActivities(); };
      wrap.appendChild(el);
    });
  }

  export function savePlan(){if(!state.editingPlan)return;var p=state.editingPlan,name=document.getElementById('planName').value.trim(),date=document.getElementById('planDate').value;if(!name||!date){showToast('Completá nombre y fecha');return;}p.name=name;p.date=date;p.durationMinutes=parseInt(document.getElementById('planDuration').value,10)||null;p.generalObjective=document.getElementById('planObjective').value.trim();p.observations=document.getElementById('planObservations').value.trim();p.categoryId=state.currentTeamId;p.categoryName=(currentTeam()||{}).name||'';p.coachId=state.user.uid;p.coachName=state.user.email;p.updatedAt=firebase.firestore.FieldValue.serverTimestamp();if(!p.id){p.createdAt=firebase.firestore.FieldValue.serverTimestamp();delete p.id;planCollection().add(p).then(function(){showToast('Planificación guardada');closePlanEditor();return refreshPlans();}).then(function(){renderDashboard();renderCalendar();}).catch(fail);}else planCollection().doc(p.id).set(p,{merge:true}).then(function(){showToast('Planificación actualizada');closePlanEditor();return refreshPlans();}).then(function(){renderDashboard();renderCalendar();}).catch(fail);}

  export function refreshPlans(){return planCollection().orderBy('date','desc').get().then(function(s){state.lessonPlans[state.currentTeamId]=s.docs.map(function(d){var x=d.data();x.id=d.id;return x;});renderPlans();});}

  export function togglePlanFavorite(p){p.isFavorite=!p.isFavorite;planCollection().doc(p.id).update({isFavorite:p.isFavorite}).catch(fail);renderPlans();}

  export function renderPlans(){var wrap=document.getElementById('plansList'),q=(document.getElementById('planSearch').value||'').toLowerCase(),dateFrom=document.getElementById('planDateFilterFrom').value,dateTo=document.getElementById('planDateFilterTo').value,favBtn=document.getElementById('planFavFilterBtn'),favOnly=favBtn&&favBtn.classList.contains('active'),list=(state.lessonPlans[state.currentTeamId]||[]).filter(function(p){return (!q||[p.name,p.generalObjective].join(' ').toLowerCase().indexOf(q)!==-1)&&(!dateFrom||!p.date||p.date>=dateFrom)&&(!dateTo||!p.date||p.date<=dateTo)&&(!favOnly||p.isFavorite);});if(!list.length){wrap.innerHTML='<div class="empty-inline">Todavía no hay planificaciones que coincidan.</div>';return;}wrap.innerHTML='';list.forEach(function(p){var el=document.createElement('div');el.className='plan-card';el.innerHTML='<button class="fav-star'+(p.isFavorite?' active':'')+'" data-a="fav" title="'+(p.isFavorite?'Quitar de favoritas':'Marcar como favorita')+'">'+(p.isFavorite?'★':'☆')+'</button><div><h3>'+escapeHtml(p.name)+'</h3><div class="meta-line">'+escapeHtml(p.date?fmtDateShort(p.date):'Sin fecha')+' · '+escapeHtml(String((p.activities||[]).length))+' actividades · '+escapeHtml(p.coachName||'')+'</div></div><div class="play-actions"><button class="btn secondary small" data-a="open">Abrir</button><button class="btn secondary small" data-a="pdf">PDF</button><button class="btn danger small" data-a="delete">Borrar</button></div>';el.querySelector('[data-a="fav"]').onclick=function(){togglePlanFavorite(p);};el.querySelector('[data-a="open"]').onclick=function(){openPlan(p);};el.querySelector('[data-a="pdf"]').onclick=function(){exportPlanPdf(p);};el.querySelector('[data-a="delete"]').onclick=function(){if(confirm('¿Borrar esta planificación?'))planCollection().doc(p.id).delete().then(refreshPlans).catch(fail);};wrap.appendChild(el);});}

  export function refreshPlansForTeam(teamId){
    return db.collection('teams').doc(teamId).collection('lessonPlans').orderBy('date','desc').get().then(function(s){
      state.lessonPlans[teamId] = s.docs.map(function(d){ var x=d.data(); x.id=d.id; return x; });
    }).catch(function(e){ console.error('refreshPlansForTeam error:', e); state.lessonPlans[teamId] = state.lessonPlans[teamId] || []; });
  }
