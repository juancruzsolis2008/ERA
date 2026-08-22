// ============ Orquestación de la app (tabs, eventos, carga de datos de equipo). ============
import { createPtTeam, createTeam, createUserAccount, loadPendingInvites, migrateClubLimitsToPerSport, migrateToMultiClub, shareCurrentTeam } from './administracion.js';
import { applyTheme, loadAppearancePreference, renderClubPaletteUI, renderUserAvatar, resetClubPaletteToDefault, saveClubPaletteFromEditor, saveDisplayName, setClubPalette, setThemePreference, updatePalettePreview } from './apariencia.js';
import { addPlayer, confirmPlayerImport, handleImportPlayersFile, loadAttendanceForDate, renderAttendanceTables, renderRoster, renderSummary, saveAttendanceKind } from './asistencia.js';
import { ensureUserDoc, applyRoleVisibility, loadTeamsForUser } from './auth.js';
import { addFrame, addToken, applySportProfileForTeam, clearBoard, deleteFrame, exportVideo, handleArrowPointClick, newExerciseForm, nextFrame, playAnimation, prevFrame, redo, refreshExercises, renderExercises, renderFrame, renderPlaysList, renderPublicExercises, rotateSelectedToken, saveExercise, setMode, shareExercise, startFreehand, switchBibSubTab, toggleArrowModeBtn, toggleEraserModeBtn, toggleFreehandModeBtn, undo, viewboxPointFromEvent } from './biblioteca.js';
import { renderCalendar } from './calendario.js';
import { loadAndApplyClubForTeam } from './club-theme.js';
import { closeCallupEditor, copyCallupMessage, newCallup, refreshCallups, saveCallup } from './convocados.js';
import { addStatsEntry, renderStatsList, renderStatsPlayerSelect } from './estadisticas.js';
import { addAdhocExercise, closeEvoBuilder, openCustomTestModal, openEvoBuilder, refreshCustomTests, renderEvoHistory, renderEvoOverview, renderEvoPlayerSelect, renderEvoTestPicker, saveEvaluation, toggleSelectAllEvoPlayers } from './evaluaciones-fisicas.js';
import { auth, db, fbBootError } from './firebase-config.js';
import { refreshForum, sendForumMessage } from './foro.js';
import { renderDashboard } from './inicio.js';
import { migratePlayerInfoToClubWide, renderInfoList } from './jugadores.js';
import { addObjBlock, removeObjBlock, renderCentralGoalsBox, renderCentralInputs, renderObjList, saveCentralGoals, toggleObjCheckbox } from './objetivos.js';
import { addLibraryActivity, addManualActivity, addPublicLibraryActivity, closePlanEditor, newPlan, renderPlans, savePlan } from './planificacion.js';
import { addDay, closeRoutineEditor, newRoutine, refreshRoutines, renderRoutinesList, saveRoutine } from './rutinas.js';
import { closeLightbox, fail, openLightbox, photoThumbHtml, state } from './state.js';
import { refreshTestResults, renderStatsDraftTests, renderStatsPlayerChecklist, renderStatsTestPicker, renderTestResultsList, saveStatsDraft, switchStatsSection, toggleSelectAllStatsPlayers } from './test-results.js';

  var eventsBound = false;

  export function loadTeamData(teamId){
    loadAndApplyClubForTeam(teamId).then(renderClubPaletteUI); // visual, no bloquea el resto de la carga
    applySportProfileForTeam(teamId); // cancha de la Pizarra + posiciones según el deporte — tampoco bloquea
    // Recalcula qué ve el usuario para ESTA categoría en particular: en el primer
    // boot, applyRoleVisibility() corrió antes de que state.teams tuviera datos
    // (currentClubMembership() necesita saber el clubId/sportId de la categoría
    // actual), así que hace falta repetirlo acá. También cubre el caso de un
    // Admin de club/Coordinador cambiando entre categorías de distinto alcance.
    applyRoleVisibility();
    var badge = document.getElementById('teamLogoBadge');
    if(badge){
      var team = state.teams.find(function(t){ return t.id === teamId; });
      badge.innerHTML = photoThumbHtml(team && team.logoUrl, 26);
    }
    return db.collection('teams').doc(teamId).collection('data').doc('roster').get().then(function(rosterSnap){
      state.players[teamId] = rosterSnap.exists ? (rosterSnap.data().players||[]) : [];
      return loadAttendanceForDate(teamId, document.getElementById('attDate').value);
    }).then(function(){
      return db.collection('teams').doc(teamId).collection('data').doc('plays').get();
    }).then(function(playsSnap){
      state.plays[teamId] = playsSnap.exists ? (playsSnap.data().plays||[]) : [];
      state.editFrames = [ {tokens:[], arrows:[]} ];
      state.currentFrameIndex = 0; state.selectedTokenId = null; state.selectedArrowId = null;
      state.undoStack = []; state.redoStack = [];
      setMode('move');
      renderRoster(); renderAttendanceTables();
      return renderSummary();
    }).then(function(){
      return db.collection('teams').doc(teamId).collection('data').doc('objetivos').get();
    }).then(function(objSnap){
      state.objetivos[teamId] = objSnap.exists ? objSnap.data() : { blocks: [], central: ['','',''] };
      if(!state.objetivos[teamId].central) state.objetivos[teamId].central = ['','',''];
      renderFrame(); renderPlaysList();
      renderObjList(); renderCentralInputs(); renderCentralGoalsBox();
      return db.collection('clubData').doc('playerInfo').get();
    }).then(function(infoSnap){
      state.playerInfo = infoSnap.exists ? (infoSnap.data().players || {}) : {};
      state.expandedPlayer = null;
      renderInfoList();
      return db.collection('teams').doc(teamId).collection('lessonPlans').orderBy('date','desc').get();
    }).then(function(plansSnap){
      state.lessonPlans[teamId] = plansSnap.docs.map(function(d){ var x=d.data(); x.id=d.id; return x; });
      state.editingPlan = null;
      renderPlans(); closePlanEditor();
      return refreshExercises();
    }).then(function(){
      return db.collection('teams').doc(teamId).collection('progress').orderBy('date','desc').get();
    }).then(function(progressSnap){
      state.progress[teamId] = progressSnap.docs.map(function(d){ var x=d.data(); x.id=d.id; return x; });
      return db.collection('teams').doc(teamId).collection('physicalEvaluations').orderBy('date','desc').get();
    }).then(function(evalSnap){
      state.evaluations[teamId] = evalSnap.docs.map(function(d){ var x=d.data(); x.id=d.id; return x; });
      return refreshTestResults(teamId);
    }).then(function(){
      renderEvoPlayerSelect(); renderEvoOverview();
      return db.collection('teams').doc(teamId).collection('stats').orderBy('date','desc').get();
    }).then(function(statsSnap){
      state.stats[teamId] = statsSnap.docs.map(function(d){ var x=d.data(); x.id=d.id; return x; });
      state.statsDraft = null;
      renderStatsPlayerSelect(); renderStatsList();
      renderStatsPlayerChecklist(); renderStatsTestPicker(); renderStatsDraftTests();
      switchStatsSection(state.statsSection);
      return refreshCallups(teamId);
    }).then(function(){
      renderDashboard();
      renderCalendar();
    }).catch(function(e){ fail(e); });
  }

  export function switchTab(tab){
    document.getElementById('tab-inicio').style.display = tab==='inicio' ? 'block':'none';
    document.getElementById('tab-calendario').style.display = tab==='calendario' ? 'block':'none';
    document.getElementById('tab-asistencia').style.display = tab==='asistencia' ? 'block':'none';
    document.getElementById('tab-pizarra').style.display = tab==='pizarra' ? 'block':'none';
    document.getElementById('tab-planificacion').style.display = tab==='planificacion' ? 'block':'none';
    document.getElementById('tab-rutinas').style.display = tab==='rutinas' ? 'block':'none';
    document.getElementById('tab-evolucion').style.display = tab==='evolucion' ? 'block':'none';
    document.getElementById('tab-estadisticas').style.display = tab==='estadisticas' ? 'block':'none';
    document.getElementById('tab-convocados').style.display = tab==='convocados' ? 'block':'none';
    document.getElementById('tab-objetivos').style.display = tab==='objetivos' ? 'block':'none';
    document.getElementById('tab-info').style.display = tab==='info' ? 'block':'none';
    document.getElementById('tab-foro').style.display = tab==='foro' ? 'block':'none';
    document.getElementById('tab-admin').style.display = tab==='admin' ? 'block':'none';
    document.getElementById('tab-apariencia').style.display = tab==='apariencia' ? 'block':'none';
    document.querySelectorAll('#tabsNav button[data-tab]').forEach(function(b){ b.classList.toggle('active', b.dataset.tab===tab); });
  }

  export function bindEventsOnce(){
    if(eventsBound) return; eventsBound = true;
    document.addEventListener('click', function(e){
      var img = e.target.closest && e.target.closest('.avatar-img, .photo-thumb');
      if(img && img.getAttribute('src')) openLightbox(img.getAttribute('src'));
    });
    document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
    document.querySelectorAll('#themePicker .theme-option').forEach(function(btn){
      btn.addEventListener('click', function(){ setThemePreference(btn.dataset.themePref); });
    });
    document.querySelectorAll('#clubPaletteSelector .theme-option').forEach(function(btn){
      btn.addEventListener('click', function(){ setClubPalette(btn.dataset.palettePref); });
    });
    ['paletteLightBgCourt','paletteLightAccentHardwood','paletteLightAccentScoreboard','paletteLightLineChalk'].forEach(function(id){
      document.getElementById(id).addEventListener('input', function(){ updatePalettePreview('light'); });
    });
    ['paletteDarkBgCourt','paletteDarkAccentHardwood','paletteDarkAccentScoreboard','paletteDarkLineChalk'].forEach(function(id){
      document.getElementById(id).addEventListener('input', function(){ updatePalettePreview('dark'); });
    });
    document.getElementById('saveClubPaletteBtn').addEventListener('click', saveClubPaletteFromEditor);
    document.getElementById('resetClubPaletteBtn').addEventListener('click', resetClubPaletteToDefault);
    document.getElementById('lightboxOverlay').addEventListener('click', function(e){
      if(e.target.id === 'lightboxOverlay') closeLightbox();
    });
    document.getElementById('calPrevBtn').addEventListener('click', function(){
      var m = state.calendarMonth || new Date();
      state.calendarMonth = new Date(m.getFullYear(), m.getMonth()-1, 1);
      renderCalendar();
    });
    document.getElementById('calNextBtn').addEventListener('click', function(){
      var m = state.calendarMonth || new Date();
      state.calendarMonth = new Date(m.getFullYear(), m.getMonth()+1, 1);
      renderCalendar();
    });
    document.getElementById('calTodayBtn').addEventListener('click', function(){
      var t = new Date();
      state.calendarMonth = new Date(t.getFullYear(), t.getMonth(), 1);
      renderCalendar();
    });
    document.getElementById('teamSelect').addEventListener('change', function(e){
      state.currentTeamId = e.target.value;
      loadTeamData(state.currentTeamId);
    });
    document.getElementById('shareTeamBtn').addEventListener('click', shareCurrentTeam);
    document.getElementById('addPlayerBtnInfo').addEventListener('click', function(){ addPlayer('newPlayerInputInfo'); });
    document.getElementById('newPlayerInputInfo').addEventListener('keydown', function(e){ if(e.key==='Enter') addPlayer('newPlayerInputInfo'); });
    document.getElementById('importPlayersBtn').addEventListener('click', function(){ document.getElementById('importPlayersFile').click(); });
    document.getElementById('importPlayersFile').addEventListener('change', function(e){
      var file = e.target.files[0];
      handleImportPlayersFile(file);
      e.target.value = '';
    });
    document.getElementById('confirmImportBtn').addEventListener('click', confirmPlayerImport);
    document.getElementById('cancelImportBtn').addEventListener('click', function(){
      document.getElementById('importPreviewBox').hidden = true;
      document.getElementById('importPreviewText').value = '';
    });
    document.getElementById('attDate').valueAsDate = new Date();
    document.getElementById('attDate').addEventListener('change', function(){
      loadAttendanceForDate(state.currentTeamId, document.getElementById('attDate').value).then(function(){
        renderAttendanceTables();
      });
    });
    document.getElementById('saveAttBtn-pelota').addEventListener('click', function(){ saveAttendanceKind('pelota'); });
    document.getElementById('saveAttBtn-fisico').addEventListener('click', function(){ saveAttendanceKind('fisico'); });
    document.getElementById('addAtt').addEventListener('click', function(){ addToken('att'); });
    document.getElementById('addDef').addEventListener('click', function(){ addToken('def'); });
    document.getElementById('addBall').addEventListener('click', function(){ addToken('ball'); });
    document.getElementById('addCone').addEventListener('click', function(){ addToken('cone'); });
    document.getElementById('addHoop').addEventListener('click', function(){ addToken('hoop'); });
    document.getElementById('addChair').addEventListener('click', function(){ addToken('chair'); });
    document.getElementById('addLadder').addEventListener('click', function(){ addToken('ladder'); });
    document.getElementById('addHurdle').addEventListener('click', function(){ addToken('hurdle'); });
    document.getElementById('rotateLeftBtn').addEventListener('click', function(){ rotateSelectedToken(-45); });
    document.getElementById('rotateRightBtn').addEventListener('click', function(){ rotateSelectedToken(45); });
    document.getElementById('arrowMode').addEventListener('click', toggleArrowModeBtn);
    document.getElementById('freehandMode').addEventListener('click', toggleFreehandModeBtn);
    document.getElementById('eraserMode').addEventListener('click', toggleEraserModeBtn);
    document.getElementById('clearBoard').addEventListener('click', clearBoard);
    document.getElementById('undoBtn').addEventListener('click', undo);
    document.getElementById('redoBtn').addEventListener('click', redo);
    document.getElementById('savePlayBtn').addEventListener('click', saveExercise);
    document.getElementById('sharePlayBtn').addEventListener('click', shareExercise);
    document.getElementById('forumAttachBtn').addEventListener('click', function(){ document.getElementById('forumFileInput').click(); });
    document.getElementById('forumFileInput').addEventListener('change', function(){
      var f = this.files[0];
      document.getElementById('forumAttachName').textContent = f ? f.name : '';
    });
    document.getElementById('forumSendBtn').addEventListener('click', sendForumMessage);
    document.getElementById('newPlayBtn').addEventListener('click', newExerciseForm);
    document.getElementById('exerciseSearch').addEventListener('input', renderExercises);
    document.getElementById('exerciseFilter').addEventListener('change', renderExercises);
    document.getElementById('exerciseTeamFilter').addEventListener('change', renderExercises);
    document.getElementById('exerciseFavFilterBtn').addEventListener('click', function(){ this.classList.toggle('active'); renderExercises(); });
    document.getElementById('publicExerciseSearch').addEventListener('input', renderPublicExercises);
    document.getElementById('publicExerciseFilter').addEventListener('change', renderPublicExercises);
    document.getElementById('publicExerciseTeamFilter').addEventListener('change', renderPublicExercises);
    document.querySelectorAll('#bibSubTabs button[data-subtab]').forEach(function(btn){
      btn.addEventListener('click', function(){ switchBibSubTab(btn.dataset.subtab); });
    });
    document.getElementById('newPlanBtn').addEventListener('click', newPlan);
    document.getElementById('closePlanBtn').addEventListener('click', closePlanEditor);
    document.getElementById('addManualActivityBtn').addEventListener('click', addManualActivity);
    document.getElementById('addLibraryActivityBtn').addEventListener('click', addLibraryActivity);
    document.getElementById('addPublicLibraryActivityBtn').addEventListener('click', addPublicLibraryActivity);
    document.getElementById('savePlanBtn').addEventListener('click', savePlan);
    document.getElementById('newRoutineBtn').addEventListener('click', newRoutine);
    document.getElementById('closeRoutineBtn').addEventListener('click', closeRoutineEditor);
    document.getElementById('addDayBtn').addEventListener('click', addDay);
    document.getElementById('saveRoutineBtn').addEventListener('click', saveRoutine);
    document.getElementById('routineSearch').addEventListener('input', renderRoutinesList);
    document.getElementById('routineFavFilterBtn').addEventListener('click', function(){ this.classList.toggle('active'); renderRoutinesList(); });
    document.getElementById('saveDisplayNameBtn').addEventListener('click', saveDisplayName);
    document.getElementById('evoSelectAllPlayersBtn').addEventListener('click', toggleSelectAllEvoPlayers);
    document.getElementById('evoNewEvalBtn').addEventListener('click', openEvoBuilder);
    document.getElementById('evoCustomTestBtn').addEventListener('click', openCustomTestModal);
    document.getElementById('evoCustomTestBtn2').addEventListener('click', openCustomTestModal);
    document.getElementById('evoTestSearch').addEventListener('input', renderEvoTestPicker);
    document.getElementById('evoAdhocBtn').addEventListener('click', addAdhocExercise);
    document.getElementById('evoSaveEvalBtn').addEventListener('click', saveEvaluation);
    document.getElementById('evoCancelEvalBtn').addEventListener('click', function(){
      if(confirm('¿Descartar esta evaluación? Se pierde lo que cargaste.')) closeEvoBuilder();
    });
    document.getElementById('statsPlayerSelect').addEventListener('change', renderStatsList);
    document.getElementById('statsAddBtn').addEventListener('click', addStatsEntry);
    document.getElementById('statsSelectAllPlayersBtn').addEventListener('click', toggleSelectAllStatsPlayers);
    document.querySelectorAll('#statsSectionTabs button').forEach(function(btn){
      btn.addEventListener('click', function(){ switchStatsSection(btn.dataset.section); });
    });
    document.getElementById('statsTestSearch').addEventListener('input', renderStatsTestPicker);
    document.getElementById('statsSaveBtn').addEventListener('click', saveStatsDraft);
    document.getElementById('newCallupBtn').addEventListener('click', newCallup);
    document.getElementById('closeCallupBtn').addEventListener('click', closeCallupEditor);
    document.getElementById('saveCallupBtn').addEventListener('click', saveCallup);
    document.getElementById('copyCallupBtn').addEventListener('click', copyCallupMessage);
    document.getElementById('adminAccordionToggle').addEventListener('click', function(){
      var body = document.getElementById('adminAccordionBody');
      var open = body.hidden;
      body.hidden = !open;
      document.getElementById('adminAccordionArrow').textContent = open ? '▲' : '▼';
    });
    document.querySelectorAll('.admin-subtab').forEach(function(btn){
      btn.addEventListener('click', function(){
        document.querySelectorAll('.admin-subtab').forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        var which = btn.dataset.adminTab;
        document.getElementById('adminTab-categorias').style.display = which==='categorias' ? '' : 'none';
        document.getElementById('adminTab-usuarios').style.display = which==='usuarios' ? '' : 'none';
      });
    });
    document.getElementById('planSearch').addEventListener('input', renderPlans);
    document.getElementById('planDateFilterFrom').addEventListener('change', renderPlans);
    document.getElementById('planDateFilterTo').addEventListener('change', renderPlans);
    document.getElementById('planFavFilterBtn').addEventListener('click', function(){ this.classList.toggle('active'); renderPlans(); });
    document.getElementById('prevFrame').addEventListener('click', prevFrame);
    document.getElementById('nextFrame').addEventListener('click', nextFrame);
    document.getElementById('addFrame').addEventListener('click', addFrame);
    document.getElementById('deleteFrame').addEventListener('click', deleteFrame);
    document.getElementById('playAnimBtn').addEventListener('click', playAnimation);
    document.getElementById('exportVideoBtn').addEventListener('click', exportVideo);
    document.getElementById('courtWrap').addEventListener('pointerdown', function(e){
      if(e.target.closest('.token')) return;
      if(state.mode==='arrow'){ handleArrowPointClick(viewboxPointFromEvent(e)); }
      else if(state.mode==='freehand'){ startFreehand(e); }
      else {
        if(e.target.closest('#arrowsSvg g')) return;
        if(state.selectedTokenId || state.selectedArrowId){ state.selectedTokenId=null; state.selectedArrowId=null; renderFrame(); }
      }
    });
    document.getElementById('createTeamBtn').addEventListener('click', createTeam);
    document.getElementById('migratePlayerInfoBtn').addEventListener('click', migratePlayerInfoToClubWide);
    document.getElementById('migrateToMultiClubBtn').addEventListener('click', migrateToMultiClub);
    document.getElementById('migrateClubLimitsBtn').addEventListener('click', migrateClubLimitsToPerSport);
    document.getElementById('ptCreateTeamBtn').addEventListener('click', createPtTeam);
    document.getElementById('createUserBtn').addEventListener('click', createUserAccount);
    document.getElementById('objAddBtn').addEventListener('click', addObjBlock);
    document.getElementById('objTextInput').addEventListener('keydown', function(e){ if(e.key==='Enter') addObjBlock(); });
    document.getElementById('saveCentralBtn').addEventListener('click', saveCentralGoals);
    document.getElementById('objList').addEventListener('click', function(e){
      var delBtn = e.target.closest('[data-action="delete"]');
      if(delBtn){ removeObjBlock(delBtn.dataset.id); return; }
      var toggle = e.target.closest('[data-action="toggle"]');
      if(toggle){ toggleObjCheckbox(toggle.dataset.id); return; }
    });
    document.querySelectorAll('#tabsNav button[data-tab]').forEach(function(btn){
      btn.addEventListener('click', function(){
        switchTab(btn.dataset.tab);
        if(btn.dataset.tab === 'foro') refreshForum();
      });
    });
    document.getElementById('logoutBtn').addEventListener('click', function(){ auth.signOut(); });
    // Vuelve al selector de club/deporte post-login (index.html), sin cerrar
    // sesión — la sesión de Firebase Auth persiste entre páginas (mismo
    // origen/deploy, ver ARCHITECTURE.md). resolveEntryContext() en index.html
    // re-evalúa memberships y muestra el selector si hay más de una categoría
    // accesible, o entra directo si solo hay una.
    document.getElementById('switchContextBtn').addEventListener('click', function(){ window.location.href = 'index.html'; });
  }

  // ============ BOOT de app.html ============
  // Reemplaza al viejo flujo de una sola página: acá ya asumimos que el login
  // pasó por index.html. Si no hay sesión (entrada directa a app.html sin
  // haber iniciado sesión, o sesión cerrada), volvemos a index.html.
  //
  // GUARD IMPORTANTE: este bloque solo corre si existe #appRoot (o sea, si esta
  // página es realmente app.html). js/auth.js importa loadTeamData desde este
  // mismo archivo (dependencia circular intencional, documentada desde la
  // Etapa 2) — eso hace que TODO este módulo, código de arranque incluido, se
  // cargue y ejecute también en index.html de forma transitiva. Sin este guard,
  // el auth.onAuthStateChanged de acá abajo se registra igual en index.html, ve
  // que no hay usuario, y hace location.href='index.html' aunque ya estemos ahí
  // — eso recarga la página, lo que vuelve a ejecutar este mismo código, que
  // vuelve a redirigir, en loop infinito (bug real encontrado en producción:
  // la página no dejaba escribir porque se recargaba sola cada pocos segundos).
  if(document.getElementById('appRoot')){
    try{
      var cachedThemePref = localStorage.getItem('ou_theme_pref');
      if(cachedThemePref) applyTheme(cachedThemePref);
    }catch(e){ /* localStorage puede no estar disponible, no pasa nada */ }

    if(fbBootError){
      fail(fbBootError);
    }

    var urlTeamId = new URLSearchParams(window.location.search).get('team');

    auth.onAuthStateChanged(function(user){
      if(!user){
        state.user = null; state.role = null;
        window.location.href = 'index.html';
        return;
      }
      state.user = user;
      ensureUserDoc(user).then(function(){
        document.getElementById('appRoot').style.display = 'block';
        var roleLabel = state.role==='admin' ? ' · admin' : (state.role==='fisico' ? ' · preparador físico' : (state.role==='personal' ? ' · personal trainer' : ' · entrenador'));
        document.getElementById('userEmailLabel').textContent = user.email + roleLabel;
        document.getElementById('welcomeUser').textContent = state.displayName || user.email;
        applyRoleVisibility();
        renderUserAvatar();
        loadAppearancePreference();
        return refreshExercises();
      }).then(function(){
        return refreshRoutines();
      }).then(function(){
        return refreshCustomTests();
      }).then(function(){
        if(urlTeamId) state.currentTeamId = urlTeamId;
        return loadTeamsForUser();
      }).then(function(){
        return loadPendingInvites();
      }).then(function(){
        bindEventsOnce();
      }).catch(function(e){ if(e.message !== 'sin-perfil') fail(e); });
    });
  }
