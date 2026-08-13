// ============ Calendario personal del entrenador. ============
import { roleFlags } from './auth.js';
import { callupCollection, formatCallupDate, openCallup, refreshCallups } from './convocados.js';
import { db } from './firebase-config.js';
import { renderDashboard } from './inicio.js';
import { loadTeamData, switchTab } from './main-app.js';
import { openPlan, refreshPlans, refreshPlansForTeam } from './planificacion.js';
import { escapeAttr, escapeHtml, fail, isoDateLocal, showToast, state } from './state.js';

  export var CAL_MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];


  export function calendarEventsCollection(){ return db.collection('users').doc(state.user.uid).collection('calendarEvents'); }

  export function refreshMyEvents(){
    return calendarEventsCollection().orderBy('date').get().then(function(s){
      state.myEvents = s.docs.map(function(d){ var x=d.data(); x.id=d.id; return x; });
    }).catch(function(e){
      console.error('refreshMyEvents error:', e);
      state.myEvents = state.myEvents || [];
    });
  }

  export function saveNewMyEvent(dateIso, title, time){
    return calendarEventsCollection().add({
      title: title.trim(), date: dateIso, time: time || '', notes: '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function(){ return refreshMyEvents(); });
  }

  export function deleteMyEvent(eventId){
    return calendarEventsCollection().doc(eventId).delete().then(function(){ return refreshMyEvents(); });
  }

  export function calRoleFlags(){
    var f = roleFlags();
    return { hasPlanificacion: f.hasPlanificacion, hasConvocados: f.hasConvocados };
  }

  export function renderCalendar(){
    var gridEl = document.getElementById('calGrid');
    if(!state.user || !gridEl) return;
    if(!state.calendarMonth){
      var t0 = new Date();
      state.calendarMonth = new Date(t0.getFullYear(), t0.getMonth(), 1);
    }
    var monthDate = state.calendarMonth;
    var monthName = CAL_MONTHS[monthDate.getMonth()];
    var labelEl = document.getElementById('calMonthLabel');
    if(labelEl) labelEl.textContent = monthName.charAt(0).toUpperCase()+monthName.slice(1)+' '+monthDate.getFullYear();

    var calFlags = calRoleFlags();
    var multiCategory = (state.teams||[]).length > 1;
    var plans = calFlags.hasPlanificacion ? allMyPlans() : [];
    var callups = calFlags.hasConvocados ? allMyCallups() : [];
    var events = state.myEvents || [];

    var byDate = {};
    function push(date, item){ if(!date) return; (byDate[date] = byDate[date] || []).push(item); }
    plans.forEach(function(p){ push(p.date, { type:'clase', label: (p.name||'Entrenamiento') + (multiCategory ? ' · '+p.categoryName : '') }); });
    callups.forEach(function(c){ push(c.date, { type:'partido', label: 'vs '+(c.opponent||'rival') + (multiCategory ? ' · '+c.categoryName : '') }); });
    events.forEach(function(e){ push(e.date, { type:'evento', label: e.title }); });

    var legendEl = document.getElementById('calLegend');
    if(legendEl) legendEl.querySelectorAll('.cal-legend-item').forEach(function(li, idx){
      // idx 0 = entrenamiento (Planificación), 1 = partido (Convocados) -> ocultos si el rol no los ve
      if(idx === 0) li.style.display = calFlags.hasPlanificacion ? '' : 'none';
      if(idx === 1) li.style.display = calFlags.hasConvocados ? '' : 'none';
    });

    var firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    var startDow = firstOfMonth.getDay();
    var gridStart = new Date(firstOfMonth);
    gridStart.setDate(1 - (startDow===0 ? 6 : startDow-1));
    var todayIso = isoDateLocal(new Date());
    var html = '';
    for(var i=0;i<42;i++){
      var d = new Date(gridStart); d.setDate(gridStart.getDate()+i);
      var iso = isoDateLocal(d);
      var inMonth = d.getMonth() === monthDate.getMonth();
      var items = byDate[iso] || [];
      var chips = items.slice(0,3).map(function(it){ return '<div class="cal-chip '+it.type+'"><span class="cal-chip-dot"></span><span class="cal-chip-label">'+escapeHtml(it.label)+'</span></div>'; }).join('');
      var more = items.length > 3 ? '<div class="cal-more">+'+(items.length-3)+' más</div>' : '';
      html += '<div class="cal-day'+(inMonth?'':' other-month')+(iso===todayIso?' today':'')+'" data-date="'+iso+'">'
        + '<div class="cal-daynum">'+d.getDate()+'</div>' + chips + more + '</div>';
    }
    gridEl.innerHTML = html;
    gridEl.querySelectorAll('.cal-day').forEach(function(cell){
      cell.addEventListener('click', function(){ openCalendarDay(cell.dataset.date); });
    });
  }

  export function openCalendarDay(dateIso){
    var calFlags = calRoleFlags();
    var multiCategory = (state.teams||[]).length > 1;
    var plans = calFlags.hasPlanificacion ? allMyPlans().filter(function(p){ return p.date===dateIso; }) : [];
    var callups = calFlags.hasConvocados ? allMyCallups().filter(function(c){ return c.date===dateIso; }) : [];
    var events = (state.myEvents||[]).filter(function(e){ return e.date===dateIso; });

    var itemsHtml = '';
    plans.forEach(function(p){
      itemsHtml += '<div class="cal-day-item"><span class="cal-day-item-dot dot-clase"></span>'
        + '<span class="cal-day-item-label">'+escapeHtml(p.name||'Entrenamiento')+(multiCategory?' <span style="color:var(--line-chalk-dim);font-weight:400;">· '+escapeHtml(p.categoryName)+'</span>':'')+'</span>'
        + '<button class="btn secondary small" data-open-plan="'+p.id+'" data-cat="'+escapeAttr(p.categoryId)+'" type="button">Abrir</button>'
        + '<button class="btn-icon" data-del-plan="'+p.id+'" data-cat="'+escapeAttr(p.categoryId)+'" type="button">✕</button></div>';
    });
    callups.forEach(function(c){
      itemsHtml += '<div class="cal-day-item"><span class="cal-day-item-dot dot-partido"></span>'
        + '<span class="cal-day-item-label">vs '+escapeHtml(c.opponent||'rival a confirmar')+(multiCategory?' <span style="color:var(--line-chalk-dim);font-weight:400;">· '+escapeHtml(c.categoryName)+'</span>':'')+'</span>'
        + '<button class="btn secondary small" data-open-callup="'+c.id+'" data-cat="'+escapeAttr(c.categoryId)+'" type="button">Abrir</button>'
        + '<button class="btn-icon" data-del-callup="'+c.id+'" data-cat="'+escapeAttr(c.categoryId)+'" type="button">✕</button></div>';
    });
    events.forEach(function(e){
      itemsHtml += '<div class="cal-day-item"><span class="cal-day-item-dot dot-evento"></span>'
        + '<span class="cal-day-item-label">'+escapeHtml(e.title)+(e.time?' · '+escapeHtml(e.time):'')+'</span>'
        + '<button class="btn-icon" data-del-event="'+e.id+'" type="button">✕</button></div>';
    });
    if(!itemsHtml) itemsHtml = '<div class="empty">Sin nada cargado este día.</div>';

    var typeOptions = '<option value="evento">Evento</option>'
      + (calFlags.hasPlanificacion ? '<option value="clase">Entrenamiento</option>' : '')
      + (calFlags.hasConvocados ? '<option value="partido">Partido</option>' : '');
    var categoryOptions = (state.teams||[]).map(function(t){
      return '<option value="'+escapeAttr(t.id)+'"'+(t.id===state.currentTeamId?' selected':'')+'>'+escapeHtml(t.name)+'</option>';
    }).join('');

    var root = document.getElementById('modalRoot');
    root.innerHTML = '<div class="modal-backdrop" id="calDayBackdrop"><div class="modal">'
      + '<button class="btn secondary small closeBtn" id="calDayCloseBtn" type="button">Cerrar</button>'
      + '<h3 style="text-transform:capitalize;">'+escapeHtml(formatCallupDate(dateIso))+'</h3>'
      + '<div class="cal-day-list">'+itemsHtml+'</div>'
      + '<div class="field">'
      + '<label>Agregar a este día</label>'
      + '<div class="row"><select id="calNewType" style="flex:1;">'+typeOptions+'</select>'
      + '<select id="calNewCategory" style="flex:1;">'+categoryOptions+'</select></div>'
      + '<div class="row" style="margin-bottom:0;">'
      + '<input class="text-input" id="calNewTitle" placeholder="Título" style="flex:2;min-width:140px;">'
      + '<input class="text-input" id="calNewTime" type="time" style="flex:1;min-width:100px;">'
      + '</div>'
      + '<button class="btn small" id="calSaveNewBtn" type="button" style="margin-top:10px;">Agregar</button>'
      + '</div>'
      + '</div></div>';

    function close(){ root.innerHTML = ''; }
    document.getElementById('calDayCloseBtn').addEventListener('click', close);
    document.getElementById('calDayBackdrop').addEventListener('click', function(e){ if(e.target.id==='calDayBackdrop') close(); });
    root.querySelectorAll('[data-open-plan]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var plan = plans.find(function(p){ return p.id===btn.dataset.openPlan; });
        close();
        switchToCategory(btn.dataset.cat).then(function(){ switchTab('planificacion'); if(plan) openPlan(plan); });
      });
    });
    root.querySelectorAll('[data-open-callup]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var c = callups.find(function(c){ return c.id===btn.dataset.openCallup; });
        close();
        switchToCategory(btn.dataset.cat).then(function(){ switchTab('convocados'); if(c) openCallup(c); });
      });
    });
    root.querySelectorAll('[data-del-event]').forEach(function(btn){
      btn.addEventListener('click', function(){
        deleteMyEvent(btn.dataset.delEvent).then(function(){ renderCalendar(); renderDashboard(); openCalendarDay(dateIso); }).catch(function(e){ fail(e); });
      });
    });
    root.querySelectorAll('[data-del-plan]').forEach(function(btn){
      btn.addEventListener('click', function(){
        if(!confirm('¿Borrar esta clase planificada?')) return;
        var catId = btn.dataset.cat;
        db.collection('teams').doc(catId).collection('lessonPlans').doc(btn.dataset.delPlan).delete()
          .then(function(){ return refreshPlansForTeam(catId); })
          .then(function(){ if(catId===state.currentTeamId) return refreshPlans(); })
          .then(function(){ renderDashboard(); renderCalendar(); openCalendarDay(dateIso); }).catch(function(e){ fail(e); });
      });
    });
    root.querySelectorAll('[data-del-callup]').forEach(function(btn){
      btn.addEventListener('click', function(){
        if(!confirm('¿Borrar esta convocatoria?')) return;
        var catId = btn.dataset.cat;
        callupCollection(catId).doc(btn.dataset.delCallup).delete().then(function(){ return refreshCallups(catId); })
          .then(function(){ renderDashboard(); renderCalendar(); openCalendarDay(dateIso); }).catch(function(e){ fail(e); });
      });
    });
    var typeSelect = document.getElementById('calNewType');
    var categorySelect = document.getElementById('calNewCategory');
    var titleInput = document.getElementById('calNewTitle');
    var timeInput = document.getElementById('calNewTime');
    function updateFieldsUI(){
      var type = typeSelect.value;
      if(type==='clase'){ titleInput.placeholder='Nombre de la clase'; timeInput.style.display='none'; categorySelect.style.display=''; }
      else if(type==='partido'){ titleInput.placeholder='Rival'; timeInput.style.display=''; categorySelect.style.display=''; }
      else { titleInput.placeholder='Título del evento'; timeInput.style.display=''; categorySelect.style.display='none'; }
    }
    typeSelect.addEventListener('change', updateFieldsUI);
    updateFieldsUI();
    document.getElementById('calSaveNewBtn').addEventListener('click', function(){
      var type = typeSelect.value;
      var title = titleInput.value.trim();
      var time = timeInput.value;
      var catId = categorySelect.value;
      if(!title){ showToast('Completá el nombre'); return; }
      if((type==='clase' || type==='partido') && !catId){ showToast('Elegí una categoría'); return; }
      var promise;
      if(type==='clase'){
        promise = db.collection('teams').doc(catId).collection('lessonPlans').add({
          name: title, date: dateIso, durationMinutes: null, generalObjective: '', observations: '', activities: [],
          categoryId: catId, categoryName: (state.teams.find(function(t){return t.id===catId;})||{}).name || '',
          coachId: state.user.uid, coachName: state.user.email,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function(){ return refreshPlansForTeam(catId); }).then(function(){ if(catId===state.currentTeamId) return refreshPlans(); });
      } else if(type==='partido'){
        promise = callupCollection(catId).add({
          date: dateIso, opponent: title, location: '', homeAway: 'local', arrivalTime: '', kickoffTime: time || '', players: []
        }).then(function(){ return refreshCallups(catId); });
      } else {
        promise = saveNewMyEvent(dateIso, title, time);
      }
      promise.then(function(){
        showToast('Agregado al calendario');
        renderCalendar(); renderDashboard();
        openCalendarDay(dateIso);
      }).catch(function(e){ fail(e); showToast('No se pudo guardar'); });
    });
  }

  export function preloadAllTeamSchedules(){
    return Promise.all((state.teams||[]).map(function(t){
      return Promise.all([ refreshPlansForTeam(t.id), refreshCallups(t.id) ]);
    }));
  }

  export function allMyPlans(){
    var out = [];
    (state.teams||[]).forEach(function(t){
      (state.lessonPlans[t.id]||[]).forEach(function(p){
        var copy = {}; for(var k in p){ if(p.hasOwnProperty(k)) copy[k]=p[k]; }
        copy.categoryId = t.id; copy.categoryName = t.name;
        out.push(copy);
      });
    });
    return out;
  }

  export function allMyCallups(){
    var out = [];
    (state.teams||[]).forEach(function(t){
      (state.callups[t.id]||[]).forEach(function(c){
        var copy = {}; for(var k in c){ if(c.hasOwnProperty(k)) copy[k]=c[k]; }
        copy.categoryId = t.id; copy.categoryName = t.name;
        out.push(copy);
      });
    });
    return out;
  }

  export function switchToCategory(teamId){
    if(!teamId || state.currentTeamId === teamId) return Promise.resolve();
    state.currentTeamId = teamId;
    var sel = document.getElementById('teamSelect');
    if(sel) sel.value = teamId;
    return loadTeamData(teamId);
  }
