// ============ Dashboard de inicio. ============
import { roleFlags } from './auth.js';
import { allMyCallups, allMyPlans, openCalendarDay, switchToCategory } from './calendario.js';
import { formatCallupDate, openCallup } from './convocados.js';
import { db } from './firebase-config.js';
import { switchTab } from './main-app.js';
import { getObj } from './objetivos.js';
import { newPlan, openPlan } from './planificacion.js';
import { newRoutine } from './rutinas.js';
import { currentTeam, escapeAttr, escapeHtml, isoDateLocal, state } from './state.js';

  export var DASH_DOW_LONG = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  export var DASH_MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];


  export function dashStatCard(label, value, sub){
    return '<div class="stat-card"><div class="label">'+escapeHtml(label)+'</div><div class="value">'+escapeHtml(String(value))+'</div>'
      + (sub ? '<div class="foot">'+escapeHtml(sub)+'</div>' : '') + '</div>';
  }

  export function dashQuickAction(tab, label){
    return '<button type="button" class="qa-item" data-goto="'+escapeAttr(tab)+'">'+escapeHtml(label)+'</button>';
  }

  export function nextUpcoming(list){
    var today = isoDateLocal(new Date());
    return (list||[]).filter(function(x){ return x.date && x.date >= today; })
      .sort(function(a,b){ return a.date < b.date ? -1 : 1; })[0] || null;
  }

  export function renderDashWeekStrip(plans, callups, events){
    var wrap = document.getElementById('dashWeekStrip');
    if(!wrap) return;
    var today = new Date(); today.setHours(0,0,0,0);
    var dow = today.getDay();
    var monday = new Date(today); monday.setDate(today.getDate() + (dow===0 ? -6 : 1-dow));
    var eventDates = {};
    (plans||[]).forEach(function(p){ if(p.date) eventDates[p.date] = true; });
    (callups||[]).forEach(function(c){ if(c.date) eventDates[c.date] = true; });
    (events||[]).forEach(function(e){ if(e.date) eventDates[e.date] = true; });
    var labels = ['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM'];
    var todayIso = isoDateLocal(today);
    var html = '';
    for(var i=0;i<7;i++){
      var d = new Date(monday); d.setDate(monday.getDate()+i);
      var iso = isoDateLocal(d);
      html += '<div class="week-day'+(iso===todayIso?' today':'')+'"><div class="dow">'+labels[i]+'</div><div class="dnum">'+d.getDate()+'</div>'
        + (eventDates[iso] ? '<div class="ddot"></div>' : '') + '</div>';
    }
    wrap.innerHTML = html;
  }

  export function renderDashNextEvent(containerId, label, item, titleFn, onOpen, emptyText){
    var el = document.getElementById(containerId);
    if(!el) return;
    if(!item){
      el.innerHTML = '<div class="dash-card empty"><div class="dash-card-label">'+escapeHtml(label)+'</div><div class="dash-card-empty-text">'+escapeHtml(emptyText)+'</div></div>';
      return;
    }
    el.innerHTML = '<div class="dash-card">'
      + '<div class="dash-card-label">'+escapeHtml(label)+'</div>'
      + '<div class="dash-card-title">'+titleFn(item)+'</div>'
      + '<div class="dash-card-meta">'+escapeHtml(formatCallupDate(item.date))+'</div>'
      + '<button type="button" class="btn secondary small">Abrir</button></div>';
    el.querySelector('button').addEventListener('click', onOpen);
  }

  export function renderDashTodayClass(plans){
    var el = document.getElementById('dashNextClass');
    if(!el) return;
    var multiCategory = (state.teams||[]).length > 1;
    var todayIso = isoDateLocal(new Date());
    var todayPlan = (plans||[]).find(function(p){ return p.date === todayIso; });
    if(todayPlan){
      el.innerHTML = '<div class="dash-card">'
        + '<div class="dash-card-label">Clase de hoy'+(multiCategory?' · '+escapeHtml(todayPlan.categoryName||''):'')+'</div>'
        + '<div class="dash-card-title">'+escapeHtml(todayPlan.name||'Sin nombre')+'</div>'
        + '<div class="dash-card-meta">'+escapeHtml(String((todayPlan.activities||[]).length))+' actividades</div>'
        + '<button type="button" class="btn secondary small">Abrir</button></div>';
      el.querySelector('button').addEventListener('click', function(){
        switchToCategory(todayPlan.categoryId).then(function(){ switchTab('planificacion'); openPlan(todayPlan); });
      });
    } else {
      el.innerHTML = '<div class="dash-card empty">'
        + '<div class="dash-card-label">Clase de hoy</div>'
        + '<div class="dash-card-empty-text">Todavía no planificaste la clase de hoy.</div>'
        + '<button type="button" class="btn small" style="margin-top:10px;">Planificar ahora</button></div>';
      el.querySelector('button').addEventListener('click', function(){ switchTab('planificacion'); newPlan(); });
    }
  }

  export function lastWeekRange(){
    var today = new Date(); today.setHours(0,0,0,0);
    var dow = today.getDay();
    var thisMonday = new Date(today); thisMonday.setDate(today.getDate() + (dow===0 ? -6 : 1-dow));
    var lastMonday = new Date(thisMonday); lastMonday.setDate(thisMonday.getDate()-7);
    var lastSunday = new Date(thisMonday); lastSunday.setDate(thisMonday.getDate()-1);
    return { start: isoDateLocal(lastMonday), end: isoDateLocal(lastSunday) };
  }

  export function loadLastWeekAttendance(teamId){
    var range = lastWeekRange();
    return db.collection('teams').doc(teamId).collection('attendance')
      .where('date','>=', range.start).where('date','<=', range.end)
      .get().then(function(snap){
        var byKind = { pelota: {present:0, total:0}, fisico: {present:0, total:0} };
        snap.docs.forEach(function(d){
          var data = d.data();
          var bucket = byKind[data.kind];
          if(!bucket) return;
          var records = data.records || {};
          Object.keys(records).forEach(function(name){
            var st = records[name] && records[name].status;
            if(!st) return;
            bucket.total++;
            if(st === 'presente' || st === 'tarde') bucket.present++;
          });
        });
        return byKind;
      }).catch(function(e){ console.error('loadLastWeekAttendance error:', e); return null; });
  }

  export function renderDashLastWeekAttendance(teamId){
    var el = document.getElementById('dashLastWeekAtt');
    if(!el) return;
    loadLastWeekAttendance(teamId).then(function(byKind){
      if(state.currentTeamId !== teamId) return; // cambió de categoría mientras cargaba
      var pPct = byKind && byKind.pelota.total ? Math.round((byKind.pelota.present/byKind.pelota.total)*100) : null;
      var fPct = byKind && byKind.fisico.total ? Math.round((byKind.fisico.present/byKind.fisico.total)*100) : null;
      if(pPct === null && fPct === null){
        el.innerHTML = '<div class="dash-card empty"><div class="dash-card-label">Asistencia · semana pasada</div><div class="dash-card-empty-text">No se cargó asistencia la semana pasada.</div></div>';
        return;
      }
      el.innerHTML = '<div class="dash-card">'
        + '<div class="dash-card-label">Asistencia · semana pasada</div>'
        + '<div class="dash-week-att-row"><span>Pelota</span><strong>'+(pPct===null?'—':pPct+'%')+'</strong></div>'
        + '<div class="dash-week-att-row"><span>Físico</span><strong>'+(fPct===null?'—':fPct+'%')+'</strong></div>'
        + '<button type="button" class="btn secondary small" style="margin-top:10px;">Ver asistencia</button></div>';
      el.querySelector('button').addEventListener('click', function(){ switchTab('asistencia'); });
    });
  }

  export function renderDashRoutinesCard(routines){
    var el = document.getElementById('dashNextMatch');
    if(!el) return;
    var count = (routines||[]).length;
    if(count){
      var lastRoutine = routines[routines.length-1];
      el.innerHTML = '<div class="dash-card">'
        + '<div class="dash-card-label">Rutinas físicas</div>'
        + '<div class="dash-card-title">'+escapeHtml(String(count))+' rutina'+(count===1?'':'s')+' cargada'+(count===1?'':'s')+'</div>'
        + '<div class="dash-card-meta">Última: '+escapeHtml(lastRoutine.name||'Sin nombre')+'</div>'
        + '<button type="button" class="btn secondary small">Ver rutinas</button></div>';
      el.querySelector('button').addEventListener('click', function(){ switchTab('rutinas'); });
    } else {
      el.innerHTML = '<div class="dash-card empty">'
        + '<div class="dash-card-label">Rutinas físicas</div>'
        + '<div class="dash-card-empty-text">Todavía no cargaste ninguna rutina.</div>'
        + '<button type="button" class="btn small" style="margin-top:10px;">Planificar rutina</button></div>';
      el.querySelector('button').addEventListener('click', function(){ switchTab('rutinas'); newRoutine(); });
    }
  }

  export function renderDashboard(){
    var teamId = state.currentTeamId;
    if(!teamId || !state.user) return;
    var players = state.players[teamId] || [];
    var plans = state.lessonPlans[teamId] || [];
    var callups = state.callups[teamId] || [];
    var events = state.myEvents || [];
    var routines = state.routines || [];
    var obj = getObj();
    var objTotal = (obj.blocks||[]).length;
    var objDone = (obj.blocks||[]).filter(function(b){ return b.type==='checkbox' && b.checked; }).length;

    var now = new Date();
    var dateLabelEl = document.getElementById('dashDateLabel');
    if(dateLabelEl) dateLabelEl.textContent = DASH_DOW_LONG[now.getDay()]+' '+now.getDate()+' de '+DASH_MONTHS[now.getMonth()];

    var statsEl = document.getElementById('dashStats');
    if(statsEl){
      statsEl.innerHTML = [
        dashStatCard('Jugadores', players.length, (currentTeam()||{}).name || ''),
        dashStatCard('Planificaciones', plans.length, 'en esta categoría'),
        dashStatCard('Rutinas', routines.length, 'en tu biblioteca'),
        dashStatCard('Objetivos', objTotal ? (objDone+'/'+objTotal) : '—', objTotal ? 'cumplidos' : 'sin cargar todavía')
      ].join('');
    }

    var f = roleFlags();

    // El calendario ahora es personal (junta todas tus categorías), no por categoría seleccionada.
    var allPlans = f.hasPlanificacion ? allMyPlans() : [];
    var allCallups = f.hasConvocados ? allMyCallups() : [];

    renderDashWeekStrip(allPlans, allCallups, events);

    var classEl = document.getElementById('dashNextClass');
    if(classEl){
      classEl.style.display = f.hasPlanificacion ? '' : 'none';
      if(f.hasPlanificacion) renderDashTodayClass(allPlans);
    }

    var matchEl = document.getElementById('dashNextMatch');
    if(matchEl){
      matchEl.style.display = (f.hasConvocados || f.hasRutinas) ? '' : 'none';
      if(f.hasConvocados){
        var multiCategory = (state.teams||[]).length > 1;
        var nextCallup = nextUpcoming(allCallups);
        renderDashNextEvent('dashNextMatch', 'Próximo partido', nextCallup,
          function(c){ return 'vs '+escapeHtml(c.opponent || 'rival a confirmar')+(multiCategory?' <span style="color:var(--line-chalk-dim);font-weight:400;">· '+escapeHtml(c.categoryName)+'</span>':''); },
          function(){ switchToCategory(nextCallup.categoryId).then(function(){ switchTab('convocados'); openCallup(nextCallup); }); },
          'Todavía no cargaste ninguna convocatoria futura.');
      } else if(f.hasRutinas){
        renderDashRoutinesCard(routines);
      }
    }

    // El calendario y sus eventos generales son personales (para todos los roles).
    var nextEvt = nextUpcoming(events);
    renderDashNextEvent('dashNextEvent', 'Próximo evento', nextEvt, function(e){ return escapeHtml(e.title || 'Evento'); },
      function(){ switchTab('calendario'); if(nextEvt) openCalendarDay(nextEvt.date); },
      'No hay eventos próximos cargados.');

    // La asistencia (pelota y físico) se carga por separado pero le sirve a los dos roles.
    renderDashLastWeekAttendance(teamId);

    var qaEl = document.getElementById('dashQuickActions');
    if(qaEl){
      var actions = [];
      if(f.hasPlanificacion){
        actions.push(dashQuickAction('planificacion','Nueva clase'));
      }
      if(f.canAddPlayers){
        actions.push(dashQuickAction('info','Nuevo jugador'));
      }
      if(f.hasConvocados){
        actions.push(dashQuickAction('convocados','Convocatoria'));
      }
      if(f.hasPizarra){
        actions.push(dashQuickAction('pizarra','Nuevo ejercicio'));
      }
      if(f.hasRutinas || f.hasEvolucion){
        if(f.hasRutinas) actions.push(dashQuickAction('rutinas','Nueva rutina'));
        if(f.hasEvolucion) actions.push(dashQuickAction('evolucion','Evaluaciones físicas'));
        actions.push(dashQuickAction('asistencia','Cargar Asistencia'));
      }
      qaEl.innerHTML = actions.join('');
      qaEl.querySelectorAll('.qa-item').forEach(function(btn){
        btn.addEventListener('click', function(){ switchTab(btn.dataset.goto); });
      });
    }
  }
