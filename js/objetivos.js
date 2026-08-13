// ============ Objetivos de la categoría. ============
import { db } from './firebase-config.js';
import { renderDashboard } from './inicio.js';
import { escapeHtml, fail, genId, showToast, state } from './state.js';

  export function getObj(){
    var teamId = state.currentTeamId;
    if(!state.objetivos[teamId]) state.objetivos[teamId] = { blocks: [], central: ['','',''] };
    return state.objetivos[teamId];
  }

  export function saveObjetivos(){
    var teamId = state.currentTeamId;
    return db.collection('teams').doc(teamId).collection('data').doc('objetivos').set(getObj())
      .catch(function(e){ fail(e); showToast('No se pudo guardar. Reintentá.'); });
  }

  export function renderObjList(){
    var wrap = document.getElementById('objList');
    var obj = getObj();
    if(!obj.blocks || obj.blocks.length === 0){
      wrap.innerHTML = '<div class="empty">Todavía no agregaste objetivos para esta categoría.</div>';
      renderDashboard();
      return;
    }
    wrap.innerHTML = '';
    obj.blocks.forEach(function(b){
      var row = document.createElement('div');
      row.className = 'obj-item ' + b.type + (b.type==='checkbox' && b.checked ? ' checked' : '');
      var contentHtml = '';
      if(b.type === 'checkbox'){
        contentHtml = '<span class="content" data-action="toggle" data-id="'+b.id+'"><span class="check-mark">'+(b.checked?'☑':'☐')+'</span>'+escapeHtml(b.text)+'</span>';
      } else {
        contentHtml = '<span class="content">'+escapeHtml(b.text)+'</span>';
      }
      row.innerHTML = contentHtml + '<button class="delBtn" data-action="delete" data-id="'+b.id+'" type="button">✕</button>';
      wrap.appendChild(row);
    });
    renderDashboard();
  }

  export function addObjBlock(){
    var typeSel = document.getElementById('objTypeSelect');
    var textInput = document.getElementById('objTextInput');
    var text = textInput.value.trim();
    if(!text) return;
    var type = typeSel.value;
    if(text.indexOf('-') === 0){
      type = 'bullet';
      text = text.slice(1).trim();
    }
    var obj = getObj();
    obj.blocks.push({ id: genId('o'), type: type, text: text, checked: false });
    textInput.value = '';
    renderObjList();
    saveObjetivos();
  }

  export function removeObjBlock(id){
    var obj = getObj();
    obj.blocks = obj.blocks.filter(function(b){ return b.id !== id; });
    renderObjList();
    saveObjetivos();
  }

  export function toggleObjCheckbox(id){
    var obj = getObj();
    var b = obj.blocks.find(function(x){ return x.id === id; });
    if(b){ b.checked = !b.checked; renderObjList(); saveObjetivos(); }
  }

  export function renderCentralInputs(){
    var obj = getObj();
    var c = obj.central || ['','',''];
    document.getElementById('central0').value = c[0] || '';
    document.getElementById('central1').value = c[1] || '';
    document.getElementById('central2').value = c[2] || '';
  }

  export function saveCentralGoals(){
    var obj = getObj();
    obj.central = [
      document.getElementById('central0').value.trim(),
      document.getElementById('central1').value.trim(),
      document.getElementById('central2').value.trim()
    ];
    saveObjetivos().then(function(){ showToast('Objetivos centrales guardados'); renderCentralGoalsBox(); });
  }

  export function renderCentralGoalsBox(){
    var box = document.getElementById('centralGoalsBox');
    var obj = getObj();
    var list = (obj.central || []).filter(function(c){ return c && c.trim(); });
    if(list.length === 0){
      box.innerHTML = '<div class="central-goals-empty">Definir tus Objetivos Centrales en la pestaña de Objetivos</div>';
      return;
    }
    box.innerHTML = '<h3>Objetivos centrales</h3><ul>' + list.map(function(c){ return '<li>'+escapeHtml(c)+'</li>'; }).join('') + '</ul>';
  }
