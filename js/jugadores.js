// ============ Ficha de información de jugadores (club-wide). ============
import { removePlayer, renderAddPlayerOtherTeams, renderAttendanceTables } from './asistencia.js';
import { roleFlags } from './auth.js';
import { db } from './firebase-config.js';
import { avatarHtml, deleteImageFile, escapeAttr, escapeHtml, fail, showToast, state, uploadImageFile } from './state.js';

  export var INFO_FIELDS = [
    {key:'birthdate', label:'Fecha de nacimiento', type:'date', group:'admin'},
    {key:'dni', label:'DNI', type:'text', group:'admin'},
    {key:'emergencyPhone', label:'Contacto de emergencia', type:'text', group:'admin'},
    {key:'healthInsurance', label:'Obra social / cobertura', type:'text', group:'admin'},
    {key:'position', label:'Posición', type:'select', options:['','Base','Escolta','Alero','Ala-pívot','Pívot'], group:'posicion'},
    {key:'height', label:'Altura (m)', type:'text', group:'fisico'},
    {key:'weight', label:'Peso (kg)', type:'text', group:'fisico'},
    {key:'wingspan', label:'Envergadura (cm)', type:'text', group:'fisico'},
    {key:'bodyFatPct', label:'% Grasa corporal', type:'text', group:'fisico'},
    {key:'muscleMass', label:'Masa muscular (kg)', type:'text', group:'fisico'},
    {key:'fatMass', label:'Masa grasa (kg)', type:'text', group:'fisico'}
  ];

  // Las posiciones dependen del deporte de la categoría actual (ver
  // js/sport-profiles.js) — el valor de arriba es solo el default de arranque
  // (básquet). Se reemplaza en el momento al cambiar de categoría (llamado
  // desde biblioteca.js applySportProfileForTeam()), mutando el array en vez
  // de reasignar el campo, así cualquier render que ya tenga una referencia a
  // INFO_FIELDS ve las opciones nuevas sin tener que releer el módulo entero.
  export function setPositionOptions(options){
    var field = INFO_FIELDS.find(function(f){ return f.key === 'position'; });
    if(!field) return;
    field.options = [''].concat(options);
  }
  export var INFO_GROUPS = [
    {key:'admin', label:'Datos administrativos'},
    {key:'posicion', label:'Posición'},
    {key:'fisico', label:'Datos físicos'}
  ];


  export function calcAge(birthdate){
    if(!birthdate) return null;
    var b = new Date(birthdate+'T00:00:00');
    if(isNaN(b.getTime())) return null;
    var diff = Date.now() - b.getTime();
    return Math.floor(diff / (1000*60*60*24*365.25));
  }

  export function getPlayerInfo(name){
    if(!state.playerInfo) state.playerInfo = {};
    if(!state.playerInfo[name]) state.playerInfo[name] = {};
    return state.playerInfo[name];
  }

  export function savePlayerInfoDoc(){
    return db.collection('clubData').doc('playerInfo')
      .set({ players: state.playerInfo || {} })
      .catch(function(e){ fail(e); showToast('No se pudo guardar. Reintentá.'); });
  }

  export function migratePlayerInfoToClubWide(){
    if(!confirm('Esto junta las fichas de jugadores de todas las categorías en una sola ficha compartida por nombre exacto. Se puede repetir sin problema, no borra nada. ¿Continuar?')) return;
    showToast('Migrando fichas…');
    db.collection('teams').get().then(function(teamsSnap){
      var teamIds = teamsSnap.docs.map(function(d){ return d.id; });
      return Promise.all(teamIds.map(function(tid){
        return db.collection('teams').doc(tid).collection('data').doc('playerInfo').get()
          .then(function(snap){ return snap.exists ? (snap.data().players || {}) : {}; })
          .catch(function(){ return {}; });
      }));
    }).then(function(allTeamInfos){
      var merged = Object.assign({}, state.playerInfo || {});
      allTeamInfos.forEach(function(teamPlayers){
        Object.keys(teamPlayers).forEach(function(name){
          merged[name] = merged[name] || {};
          var info = teamPlayers[name] || {};
          Object.keys(info).forEach(function(field){
            if(info[field] && !merged[name][field]) merged[name][field] = info[field];
          });
        });
      });
      return db.collection('clubData').doc('playerInfo').set({ players: merged }).then(function(){ return merged; });
    }).then(function(merged){
      state.playerInfo = merged;
      renderInfoList();
      showToast('Listo: '+Object.keys(merged).length+' jugadores con ficha compartida.');
    }).catch(function(e){ fail(e); showToast('No se pudo migrar. Revisá que ya publicaste las reglas nuevas.'); });
  }

  export function renderInfoList(){
    renderAddPlayerOtherTeams();
    var wrap = document.getElementById('infoList');
    var list = state.players[state.currentTeamId] || [];
    if(list.length === 0){ wrap.innerHTML = '<div class="empty">Todavía no hay jugadores — agregalos arriba.</div>'; return; }
    wrap.innerHTML = '';
    list.forEach(function(name){
      var info = getPlayerInfo(name);
      var expanded = state.expandedPlayer === name;
      var card = document.createElement('div');
      card.className = 'info-card' + (expanded ? ' expanded' : '');
      var age = calcAge(info.birthdate);
      var preview = [info.position || null, age ? age+' años' : null, info.height ? info.height+'m' : null].filter(Boolean).join(' · ');
      var headHtml = '<div class="info-name">'+avatarHtml(name, info.photoUrl, 32)+'<span>'+escapeHtml(name)+'</span><span style="margin-left:auto;">'+(expanded?'▲':'▼')+'</span></div>'
        + (preview ? '<div class="info-preview">'+escapeHtml(preview)+'</div>' : '<div class="info-preview">Sin datos cargados</div>');
      card.innerHTML = headHtml;
      if(expanded){
        var formHtml = '<div class="info-form">';
        formHtml += '<div class="full-width photo-row">'+avatarHtml(name, info.photoUrl, 56)
          + '<input type="file" accept="image/*" class="playerPhotoInput" data-player="'+escapeAttr(name)+'">'
          + (info.photoUrl ? '<button class="btn secondary small removePhotoBtn" data-player="'+escapeAttr(name)+'" type="button">Quitar foto</button>' : '')
          + '</div>';
        INFO_GROUPS.forEach(function(group){
          var fieldsInGroup = INFO_FIELDS.filter(function(f){ return f.group === group.key; });
          if(!fieldsInGroup.length) return;
          formHtml += '<div class="info-form-section"><div class="info-form-section-title">'+escapeHtml(group.label)+'</div><div class="info-form-grid">';
          fieldsInGroup.forEach(function(f){
            var val = info[f.key] || '';
            formHtml += '<div class="info-field-box">' + '<label>'+f.label+'</label>';
            if(f.type === 'select'){
              formHtml += '<select data-field="'+f.key+'" class="text-input">' + f.options.map(function(o){
                return '<option value="'+escapeAttr(o)+'"'+(o===val?' selected':'')+'>'+(o===''?'—':escapeHtml(o))+'</option>';
              }).join('') + '</select>';
            } else {
              formHtml += '<input type="'+f.type+'" class="text-input" data-field="'+f.key+'" value="'+escapeAttr(val)+'"'+(f.placeholder?(' placeholder="'+f.placeholder+'"'):'')+'>';
            }
            formHtml += '</div>';
          });
          formHtml += '</div></div>';
        });
        formHtml += '<div class="full-width"><label>Lesiones previas o dolores frecuentes</label><textarea class="textarea-input" data-field="injuries">'+escapeHtml(info.injuries||'')+'</textarea></div>';
        formHtml += '<div class="full-width"><label>Anotaciones varias</label><textarea class="textarea-input" data-field="notes">'+escapeHtml(info.notes||'')+'</textarea></div>';
        formHtml += '<div class="full-width row" style="margin-top:6px;"><button class="btn small saveInfoBtn" data-player="'+escapeAttr(name)+'" type="button">Guardar datos</button>'
          + (roleFlags().canRemovePlayers ? '<button class="btn danger small removePlayerBtn" data-player="'+escapeAttr(name)+'" type="button">Quitar jugador</button>' : '')
          + '</div>';
        formHtml += '</div>';
        card.innerHTML += formHtml;
      }
      card.addEventListener('click', function(e){
        if(e.target.closest('.info-form')) return;
        state.expandedPlayer = expanded ? null : name;
        renderInfoList();
      });
      wrap.appendChild(card);
    });
    wrap.querySelectorAll('.saveInfoBtn').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var name = btn.dataset.player;
        var card = btn.closest('.info-card');
        var info = getPlayerInfo(name);
        card.querySelectorAll('[data-field]').forEach(function(el){
          info[el.dataset.field] = el.value.trim();
        });
        savePlayerInfoDoc().then(function(){ showToast('Datos de '+name+' guardados'); });
      });
    });
    wrap.querySelectorAll('.removePlayerBtn').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        removePlayer(btn.dataset.player);
      });
    });
    wrap.querySelectorAll('.playerPhotoInput').forEach(function(inp){
      inp.addEventListener('click', function(e){ e.stopPropagation(); });
      inp.addEventListener('change', function(e){
        e.stopPropagation();
        var name = inp.dataset.player;
        var file = inp.files[0];
        if(!file) return;
        showToast('Subiendo foto...');
        uploadImageFile(file).then(function(url){
          getPlayerInfo(name).photoUrl = url;
          return savePlayerInfoDoc();
        }).then(function(){
          showToast('Foto de '+name+' guardada');
          renderInfoList(); renderAttendanceTables();
        }).catch(function(e){ if(e.message!=='not-image'&&e.message!=='too-big') fail(e); });
      });
    });
    wrap.querySelectorAll('.removePhotoBtn').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var name = btn.dataset.player;
        deleteImageFile().then(function(){
          delete getPlayerInfo(name).photoUrl;
          return savePlayerInfoDoc();
        }).then(function(){
          showToast('Foto de '+name+' eliminada');
          renderInfoList(); renderAttendanceTables();
        }).catch(function(e){ fail(e); });
      });
    });
  }
