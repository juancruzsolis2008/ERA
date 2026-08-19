// ============ Asistencia (plantel, importación de jugadores, tablas de asistencia, resumen). ============
import { roleFlags } from './auth.js';
import { db } from './firebase-config.js';
import { dashStatCard } from './inicio.js';
import { getPlayerInfo, renderInfoList } from './jugadores.js';
import { KINDS, KIND_LABELS, avatarHtml, currentTeam, escapeAttr, escapeHtml, fail, fmtDateShort, pdfDoc, pdfFileName, pdfWrapped, showToast, state } from './state.js';

  export var STATUSES = [
    {key:'presente', label:'Presente'}, {key:'tarde', label:'Tarde'},
    {key:'justificado', label:'Justif.'}, {key:'ausente', label:'Ausente'}
  ];


  export function exportAttendanceSummaryPdf(){
    var teamId = state.currentTeamId;
    var list = state.players[teamId] || [];
    if(!list.length){ showToast('No hay jugadores cargados'); return; }
    var pelota = (state.summaryCache && state.summaryCache.pelota) || {};
    var fisico = (state.summaryCache && state.summaryCache.fisico) || {};
    var doc = pdfDoc(), x = 40, w = 515, y = 50;
    doc.setFont('helvetica','bold'); doc.setFontSize(16);
    y = pdfWrapped(doc, 'Resumen de asistencia — '+((currentTeam()||{}).name||''), x, y, w, 20);
    list.forEach(function(p){
      var ps = pelota[p] || {present:0,total:0,starsSum:0,starsCount:0};
      var fs = fisico[p] || {present:0,total:0,starsSum:0,starsCount:0};
      var ppct = ps.total ? Math.round((ps.present/ps.total)*100) : 0;
      var fpct = fs.total ? Math.round((fs.present/fs.total)*100) : 0;
      var pAvg = ps.starsCount ? (ps.starsSum/ps.starsCount).toFixed(1) : '—';
      var fAvg = fs.starsCount ? (fs.starsSum/fs.starsCount).toFixed(1) : '—';
      doc.setFont('helvetica','bold'); doc.setFontSize(12);
      y = pdfWrapped(doc, p, x, y+14, w, 15);
      doc.setFont('helvetica','normal'); doc.setFontSize(10);
      y = pdfWrapped(doc, 'Pelota: '+ps.present+'/'+ps.total+' ('+ppct+'%) · promedio '+pAvg+(pAvg!=='—'?'★':''), x+10, y, w-10, 13);
      y = pdfWrapped(doc, 'Físico: '+fs.present+'/'+fs.total+' ('+fpct+'%) · promedio '+fAvg+(fAvg!=='—'?'★':''), x+10, y, w-10, 13);
    });
    doc.save(pdfFileName('resumen_asistencia_'+((currentTeam()||{}).name||''))+'.pdf');
  }

  export function loadAttendanceForDate(teamId, dateStr){
    if(!state.attendance[teamId]) state.attendance[teamId] = {};
    var promises = KINDS.map(function(kind){
      return db.collection('teams').doc(teamId).collection('attendance').doc(dateStr+'_'+kind).get().then(function(snap){
        state.attendance[teamId][kind] = snap.exists ? (snap.data().records||{}) : {};
      });
    });
    return Promise.all(promises);
  }

  export function renderRoster(){
    var wrap = document.getElementById('rosterList');
    wrap.innerHTML = '';
    var list = state.players[state.currentTeamId] || [];
    if(list.length === 0){
      wrap.innerHTML = '<span class="helper-text">Todavía no cargaste jugadores para esta categoría. Se guardan una sola vez y quedan para siempre.</span>';
      return;
    }
    list.forEach(function(name){
      var chip = document.createElement('div');
      chip.className = 'roster-chip';
      chip.innerHTML = '<span>'+escapeHtml(name)+'</span>';
      wrap.appendChild(chip);
    });
  }

  export function renderAddPlayerOtherTeams(){
    var wrap = document.getElementById('addPlayerOtherTeams');
    if(!wrap) return;
    // Todo separado por club+deporte: solo ofrece "también agregar en" otras
    // categorías del MISMO club+deporte, no cualquiera de las que la cuenta
    // pueda tener en otro lado (Dueño, o cuenta con memberships en más de uno).
    var current = currentTeam();
    var otherTeams = (state.teams||[]).filter(function(t){
      return t.id !== state.currentTeamId && (!current || (t.clubId === current.clubId && t.sportId === current.sportId));
    });
    if(!otherTeams.length){ wrap.innerHTML = ''; return; }
    wrap.innerHTML = '<span class="helper-text" style="width:100%;margin-bottom:4px;">También agregar en:</span>'
      + otherTeams.map(function(t){
          return '<label class="member-chip" style="cursor:pointer;"><input type="checkbox" data-add-other-team="'+t.id+'"> '+escapeHtml(t.name)+'</label>';
        }).join(' ');
  }

  export function addPlayer(inputId){
    var input = document.getElementById(inputId || 'newPlayerInputInfo');
    var name = input.value.trim();
    if(!name) return;
    var teamId = state.currentTeamId;
    if(!teamId){ showToast('Elegí una categoría primero'); return; }
    if(!state.players[teamId]) state.players[teamId] = [];
    if(state.players[teamId].indexOf(name) === -1) state.players[teamId].push(name);
    db.collection('teams').doc(teamId).collection('data').doc('roster').set({ players: state.players[teamId] })
      .catch(function(e){ fail(e); });

    // Categorías adicionales tildadas ("también agregar en") — mismo jugador, misma ficha
    // (DNI, fecha de nacimiento, etc. ya son club-wide), pero cada categoría tiene su propio
    // plantel y su propia asistencia por separado.
    var otherTeamsWrap = document.getElementById('addPlayerOtherTeams');
    var extraTeamIds = otherTeamsWrap ? Array.prototype.map.call(
      otherTeamsWrap.querySelectorAll('input[data-add-other-team]:checked'),
      function(cb){ return cb.dataset.addOtherTeam; }
    ) : [];
    extraTeamIds.forEach(function(otherTeamId){
      if(!state.players[otherTeamId]) state.players[otherTeamId] = [];
      if(state.players[otherTeamId].indexOf(name) !== -1) return; // ya estaba
      state.players[otherTeamId].push(name);
      db.collection('teams').doc(otherTeamId).collection('data').doc('roster')
        .set({ players: state.players[otherTeamId] }).catch(function(e){ fail(e); });
    });
    if(extraTeamIds.length){
      var extraNames = (state.teams||[]).filter(function(t){ return extraTeamIds.indexOf(t.id) !== -1; }).map(function(t){ return t.name; });
      showToast('Agregado también en: '+extraNames.join(', '));
    }

    input.value = '';
    renderRoster(); renderAttendanceTables(); renderSummary(); renderInfoList();
  }

  export function parseExcelFile(file){
    return file.arrayBuffer().then(function(buf){
      var wb = XLSX.read(buf, { type: 'array' });
      var lines = [];
      wb.SheetNames.forEach(function(sheetName){
        var rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
        rows.forEach(function(row){
          row.forEach(function(cell){
            var val = String(cell == null ? '' : cell).trim();
            if(val) lines.push(val);
          });
        });
      });
      return lines;
    });
  }

  export function extractPdfPageLines(page){
    return page.getTextContent().then(function(content){
      var lines = {};
      content.items.forEach(function(item){
        var y = Math.round(item.transform[5]);
        if(!lines[y]) lines[y] = [];
        lines[y].push(item.str);
      });
      var ys = Object.keys(lines).map(Number).sort(function(a,b){ return b - a; });
      return ys.map(function(y){ return lines[y].join(' ').trim(); }).filter(Boolean);
    });
  }

  export function parsePdfFile(file){
    return file.arrayBuffer().then(function(buf){
      return pdfjsLib.getDocument({ data: buf }).promise;
    }).then(function(pdf){
      var pagePromises = [];
      for(var i = 1; i <= pdf.numPages; i++){ pagePromises.push(pdf.getPage(i).then(extractPdfPageLines)); }
      return Promise.all(pagePromises);
    }).then(function(pagesLines){
      var all = [];
      pagesLines.forEach(function(lines){ all = all.concat(lines); });
      return all;
    });
  }

  export function stripTrailingStats(line){
    var tokens = line.split(/\s+/);
    while(tokens.length > 1 && /^[\d.,]+$/.test(tokens[tokens.length-1])){ tokens.pop(); }
    return tokens.join(' ').trim();
  }

  export function handleImportPlayersFile(file){
    if(!file) return;
    showToast('Leyendo archivo...');
    var ext = file.name.split('.').pop().toLowerCase();
    var parsePromise = (ext === 'pdf') ? parsePdfFile(file) : parseExcelFile(file);
    parsePromise.then(function(lines){
      var cleaned = lines.map(function(l){ return stripTrailingStats(String(l).trim()); })
        .filter(function(l){ return l && !/^\d+([.,]\d+)?$/.test(l); });
      document.getElementById('importPreviewText').value = cleaned.join('\n');
      document.getElementById('importPreviewBox').hidden = false;
    }).catch(function(err){ console.error(err); showToast('No se pudo leer ese archivo'); });
  }

  export function confirmPlayerImport(){
    var teamId = state.currentTeamId;
    if(!teamId){ showToast('Elegí una categoría primero'); return; }
    var names = document.getElementById('importPreviewText').value.split('\n')
      .map(function(l){ return l.trim(); }).filter(Boolean);
    if(!names.length){ showToast('No hay nombres para cargar'); return; }
    if(!state.players[teamId]) state.players[teamId] = [];
    var existing = state.players[teamId];
    var added = 0;
    names.forEach(function(n){ if(existing.indexOf(n) === -1){ existing.push(n); added++; } });
    db.collection('teams').doc(teamId).collection('data').doc('roster').set({ players: existing })
      .then(function(){
        showToast(added + ' jugadores cargados' + (names.length - added > 0 ? ' ('+(names.length-added)+' ya existían)' : ''));
        document.getElementById('importPreviewBox').hidden = true;
        document.getElementById('importPreviewText').value = '';
        renderRoster(); renderAttendanceTables(); renderSummary(); renderInfoList();
      }).catch(function(e){ fail(e); });
  }

  export function removePlayer(name){
    var teamId = state.currentTeamId;
    var idx = (state.players[teamId] || []).indexOf(name);
    if(idx === -1) return;
    var confirmed = confirm('¿Seguro que querés quitar a "'+name+'" del plantel?\n\nDeja de aparecer en asistencia y listados a partir de ahora. Si más adelante lo volvés a cargar con el mismo nombre exacto, recupera su información y su historial automáticamente — pero mientras tanto no vas a poder verlos.');
    if(!confirmed) return;
    state.players[teamId].splice(idx,1);
    db.collection('teams').doc(teamId).collection('data').doc('roster').set({ players: state.players[teamId] })
      .catch(function(e){ fail(e); });
    state.expandedPlayer = null;
    renderRoster(); renderAttendanceTables(); renderSummary(); renderInfoList();
  }

  export function renderAttendanceTables(){ KINDS.forEach(renderAttendanceTable); }

  export function renderAttendanceTable(kind){
    var wrap = document.getElementById('attTableWrap-'+kind);
    var list = state.players[state.currentTeamId] || [];
    if(list.length === 0){ wrap.innerHTML = '<div class="empty">Agregá jugadores arriba para empezar a tomar asistencia.</div>'; return; }
    var kindData = (state.attendance[state.currentTeamId] && state.attendance[state.currentTeamId][kind]) || {};
    var rows = '';
    list.forEach(function(name){
      var rec = kindData[name] || {status:null, stars:3};
      var info = getPlayerInfo(name);
      rows += '<tr><td class="name"><div class="name-with-avatar">'+avatarHtml(name, info.photoUrl, 26)+'<span>'+escapeHtml(name)+'</span></div></td><td>'+statusGroup(kind,name,rec.status)+'</td><td>'+starGroup(kind,name,rec.stars===undefined||rec.stars===null?3:rec.stars,rec.status)+'</td></tr>';
    });
    wrap.innerHTML = '<table class="attendance"><thead><tr><th>Jugador</th><th>Estado</th><th>Puntaje</th></tr></thead><tbody>'+rows+'</tbody></table>';
    wrap.querySelectorAll('.status-btn').forEach(function(btn){
      btn.addEventListener('click', function(){ setAttendanceStatus(btn.dataset.kind, btn.dataset.player, btn.dataset.status); });
    });
    wrap.querySelectorAll('.star').forEach(function(st){
      st.addEventListener('click', function(){ setAttendanceStars(st.dataset.kind, st.dataset.player, parseInt(st.dataset.value,10)); });
    });
  }

  export function statusGroup(kind, name, currentVal){
    return '<div class="status-group">'+STATUSES.map(function(s){
      var on = currentVal === s.key ? ('on-'+s.key) : '';
      return '<button type="button" class="status-btn '+on+'" data-kind="'+kind+'" data-player="'+escapeAttr(name)+'" data-status="'+s.key+'">'+s.label+'</button>';
    }).join('')+'</div>';
  }

  export function starGroup(kind, name, currentVal, status){
    var disabled = status === 'ausente' || status === 'justificado';
    var out = '<div class="star-group"'+(disabled ? ' title="No se califica a jugadores ausentes o justificados"' : '')+'>';
    for(var i=1;i<=5;i++){
      out += '<span class="star '+(i<=currentVal?'filled':'')+(disabled?' disabled':'')+'" data-kind="'+kind+'" data-player="'+escapeAttr(name)+'" data-value="'+i+'" role="button" aria-label="'+i+' estrellas"'+(disabled?' aria-disabled="true"':'')+'>★</span>';
    }
    return out+'</div>';
  }

  export function ensureRecord(kind, player){
    var teamId = state.currentTeamId;
    if(!state.attendance[teamId]) state.attendance[teamId] = {};
    if(!state.attendance[teamId][kind]) state.attendance[teamId][kind] = {};
    if(!state.attendance[teamId][kind][player]) state.attendance[teamId][kind][player] = {status:null, stars:3};
    return state.attendance[teamId][kind][player];
  }

  export function setAttendanceStatus(kind, player, status){
    var rec = ensureRecord(kind, player);
    rec.status = (rec.status === status) ? null : status;
    renderAttendanceTable(kind);
  }

  export function setAttendanceStars(kind, player, value){
    var rec = ensureRecord(kind, player);
    if(rec.status === 'ausente' || rec.status === 'justificado') return;
    rec.stars = value;
    renderAttendanceTable(kind);
  }

  export function saveAttendanceKind(kind){
    var teamId = state.currentTeamId;
    var dateStr = document.getElementById('attDate').value;
    var data = (state.attendance[teamId] && state.attendance[teamId][kind]) || {};
    db.collection('teams').doc(teamId).collection('attendance').doc(dateStr+'_'+kind)
      .set({ date: dateStr, kind: kind, records: data })
      .then(function(){
        showToast('Asistencia de ' + KIND_LABELS[kind].toLowerCase() + ' guardada para ' + dateStr);
        return renderSummary();
      }).catch(function(e){ fail(e); showToast('No se pudo guardar. Reintentá.'); });
  }

  export function isoWeekKey(dateStr){
    var d = new Date(dateStr+'T00:00:00');
    if(isNaN(d)) return dateStr;
    var target = new Date(d.valueOf());
    var dayNr = (d.getDay()+6)%7;
    target.setDate(target.getDate()-dayNr+3);
    var firstThursday = new Date(target.getFullYear(),0,4);
    var diff = target - firstThursday;
    var week = 1 + Math.round(diff/(7*24*3600*1000));
    return target.getFullYear()+'-W'+week;
  }

  export function computeKindStats(teamId, kind, playerList){
    var stats = {};
    playerList.forEach(function(p){ stats[p] = {total:0, present:0, ausente:0, justificado:0, tarde:0, starsSum:0, starsCount:0, records:[]}; });
    return db.collection('teams').doc(teamId).collection('attendance').get().then(function(snap){
      var rows = snap.docs.map(function(d){ return d.data(); })
        .filter(function(d){ return d.kind === kind; })
        .sort(function(a,b){ return a.date < b.date ? 1 : -1; });
      var weeks = {}, sumPresentPerSession = 0;
      rows.forEach(function(row){
        var sessionPresent = 0;
        weeks[isoWeekKey(row.date)] = true;
        playerList.forEach(function(p){
          var rec = row.records ? row.records[p] : null;
          if(rec && rec.status){
            var s = stats[p];
            s.total++;
            if(rec.status === 'presente' || rec.status === 'tarde'){ s.present++; sessionPresent++; }
            if(rec.status === 'ausente') s.ausente++;
            if(rec.status === 'justificado') s.justificado++;
            if(rec.status === 'tarde') s.tarde++;
            if((rec.status === 'presente' || rec.status === 'tarde') && rec.stars){ s.starsSum += rec.stars; s.starsCount++; }
            s.records.push({date: row.date, status: rec.status, stars: rec.stars||0});
          }
        });
        sumPresentPerSession += sessionPresent;
      });
      // Agregados grupales (para las tarjetas de "Resumen de Asistencia Grupal")
      var totalPresent = 0, totalMarks = 0, totalAusencias = 0;
      playerList.forEach(function(p){ totalPresent += stats[p].present; totalMarks += stats[p].total; totalAusencias += stats[p].ausente; });
      var weeksCount = Object.keys(weeks).length;
      return {
        stats: stats,
        sessionsCount: rows.length,
        overallPct: totalMarks ? Math.round((totalPresent/totalMarks)*100) : 0,
        avgFaltasPerWeek: weeksCount ? (totalAusencias/weeksCount).toFixed(1) : '0',
        avgPlayersPerSession: rows.length ? (sumPresentPerSession/rows.length).toFixed(1) : '0'
      };
    }).catch(function(e){ fail(e); return { stats: stats, sessionsCount:0, overallPct:0, avgFaltasPerWeek:'0', avgPlayersPerSession:'0' }; });
  }

  export function groupStatCard(label, pelotaVal, fisicoVal, showPelota, unit){
    var value = showPelota ? (pelotaVal+' pelota · '+fisicoVal+' físico') : String(fisicoVal);
    return dashStatCard(label, value, unit||'');
  }

  export function renderSummary(){
    var wrap = document.getElementById('attSummary');
    var list = state.players[state.currentTeamId] || [];
    if(list.length === 0){ wrap.innerHTML=''; return Promise.resolve(); }
    var showPelota = roleFlags().hasAsistenciaPelota;
    return Promise.all([
      computeKindStats(state.currentTeamId, 'pelota', list),
      computeKindStats(state.currentTeamId, 'fisico', list)
    ]).then(function(results){
      var pelotaRes = results[0], fisicoRes = results[1];
      state.summaryCache = { pelota: pelotaRes.stats, fisico: fisicoRes.stats };
      var pelotaStats = pelotaRes.stats, fisicoStats = fisicoRes.stats;
      var anyData = list.some(function(p){ return pelotaStats[p].total>0 || fisicoStats[p].total>0; });
      if(!anyData){ wrap.innerHTML = ''; return; }

      var groupCards = groupStatCard('Asistencias cargadas', pelotaRes.sessionsCount, fisicoRes.sessionsCount, showPelota, 'entrenamientos con asistencia tomada')
        + groupStatCard('Asistencia general', pelotaRes.overallPct+'%', fisicoRes.overallPct+'%', showPelota, 'promedio de todo el plantel')
        + groupStatCard('Faltas promedio / semana', pelotaRes.avgFaltasPerWeek, fisicoRes.avgFaltasPerWeek, showPelota, 'ausencias del plantel por semana')
        + groupStatCard('Jugadores promedio / entreno', pelotaRes.avgPlayersPerSession, fisicoRes.avgPlayersPerSession, showPelota, 'presentes por entrenamiento');

      var cards = '';
      list.forEach(function(p){
        var ps = pelotaStats[p], fs = fisicoStats[p];
        var ppct = ps.total ? Math.round((ps.present/ps.total)*100) : 0;
        var fpct = fs.total ? Math.round((fs.present/fs.total)*100) : 0;
        var pelotaRow = showPelota ? '<div class="summary-kind-row"><div class="klabel"><span>Pelota</span><span>'+ps.present+'/'+ps.total+' ('+ppct+'%)</span></div><div class="bar-bg"><div class="bar-fill" style="width:'+ppct+'%"></div></div></div>' : '';
        cards += '<div class="summary-card" data-player="'+escapeAttr(p)+'">'
          + '<div class="pname">'+escapeHtml(p)+'</div>'
          + pelotaRow
          + '<div class="summary-kind-row"><div class="klabel"><span>Físico</span><span>'+fs.present+'/'+fs.total+' ('+fpct+'%)</span></div><div class="bar-bg"><div class="bar-fill fisico" style="width:'+fpct+'%"></div></div></div>'
          + '<div class="detail-hint">Ver detalle ›</div></div>';
      });

      wrap.innerHTML = '<hr class="section-divider">'
        + '<h2 style="margin-top:20px;font-size:0.95rem;">Resumen de Asistencia Grupal</h2>'
        + '<div class="dash-grid">'+groupCards+'</div>'
        + '<h2 style="margin-top:24px;font-size:0.95rem;">Resumen por jugador <button class="btn secondary small" id="exportAttSummaryBtn" type="button" style="margin-left:8px;">Descargar PDF</button></h2>'
        + '<div class="summary-grid">'+cards+'</div>';
      wrap.querySelectorAll('.summary-card').forEach(function(card){
        card.addEventListener('click', function(){ openPlayerDetail(card.dataset.player); });
      });
      document.getElementById('exportAttSummaryBtn').addEventListener('click', function(e){ e.stopPropagation(); exportAttendanceSummaryPdf(); });
    });
  }

  export function statusLabel(key){ var f = STATUSES.find(function(s){ return s.key===key; }); return f?f.label:key; }

  var MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  // Agrupa records (ya ordenados de más reciente a más antiguo) en secciones
  // <details> por mes/año — colapsable nativo del navegador, sin JS de toggle
  // propio. El primer grupo (el más reciente) queda abierto por defecto.
  function groupHistoryByMonth(records){
    if(!records.length) return '<div class="detail-history-row"><span>Sin registros todavía</span></div>';
    var order = [], byMonth = {};
    records.forEach(function(r){
      var key = r.date.slice(0,7); // 'YYYY-MM'
      if(!byMonth[key]){ byMonth[key] = []; order.push(key); }
      byMonth[key].push(r);
    });
    return order.map(function(key, i){
      var parts = key.split('-');
      var label = MONTH_NAMES[parseInt(parts[1],10)-1] + ' ' + parts[0];
      var rows = byMonth[key].map(function(r){
        return '<div class="detail-history-row"><span>'+fmtDateShort(r.date)+' · '+statusLabel(r.status)+'</span><span>'+(r.stars? r.stars+'★' : '—')+'</span></div>';
      }).join('');
      return '<details class="detail-history-month"'+(i===0?' open':'')+'>'
        + '<summary class="admin-accordion-toggle" style="margin-top:'+(i===0?'8':'6')+'px;font-size:0.85rem;padding:8px 12px;">'+label+' <span class="helper-text">('+byMonth[key].length+')</span></summary>'
        + rows + '</details>';
    }).join('');
  }

  export function openPlayerDetail(player){
    var ps = state.summaryCache.pelota ? state.summaryCache.pelota[player] : null;
    var fs = state.summaryCache.fisico ? state.summaryCache.fisico[player] : null;
    var showPelota = roleFlags().hasAsistenciaPelota;
    var root = document.getElementById('modalRoot');
    function kindBlock(label, s){
      if(!s) return '';
      var pct = s.total ? Math.round((s.present/s.total)*100) : 0;
      var starsAvg = s.starsCount ? (s.starsSum/s.starsCount).toFixed(1) : '—';
      // Agrupado por mes/año (más reciente primero — s.records ya viene
      // ordenado así desde computeKindStats), en acordeones colapsables; el
      // mes más reciente abierto por defecto, el resto colapsado.
      var history = groupHistoryByMonth(s.records);
      return '<div class="detail-kind-block"><h4>'+label+'</h4>'
        + '<div class="detail-stat-row"><span>Asistencia promedio</span><span>'+pct+'%</span></div>'
        + '<div class="detail-stat-row"><span>Entrenamientos asistidos</span><span>'+s.present+'</span></div>'
        + '<div class="detail-stat-row"><span>Ausencias normales</span><span>'+s.ausente+'</span></div>'
        + '<div class="detail-stat-row"><span>Ausencias justificadas</span><span>'+s.justificado+'</span></div>'
        + '<div class="detail-stat-row"><span>Llegadas tarde</span><span>'+s.tarde+'</span></div>'
        + '<div class="detail-stat-row"><span>Puntaje promedio</span><span>'+starsAvg+(starsAvg!=='—'?'★':'')+'</span></div>'
        + '<div class="detail-history">'+history+'</div></div>';
    }
    root.innerHTML = '<div class="modal-backdrop" id="playerModalBackdrop"><div class="modal">'
      + '<button class="btn secondary small closeBtn" id="closeModalBtn" type="button">Cerrar</button>'
      + '<h3>'+escapeHtml(player)+'</h3>' + (showPelota ? kindBlock('Pelota', ps) : '') + kindBlock('Físico', fs) + '</div></div>';
    document.getElementById('closeModalBtn').addEventListener('click', function(){ root.innerHTML=''; });
    document.getElementById('playerModalBackdrop').addEventListener('click', function(e){ if(e.target.id==='playerModalBackdrop') root.innerHTML=''; });
  }
