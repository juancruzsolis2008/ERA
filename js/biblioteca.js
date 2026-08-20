// ============ Pizarra táctica + biblioteca de ejercicios (personal y pública). ============
import { db } from './firebase-config.js';
import { setPositionOptions, setStrongFootFieldVisible } from './jugadores.js';
import { switchTab } from './main-app.js';
import { renderActivityPreview } from './planificacion.js';
import { DEFAULT_COURT_TYPE, ballEmojiForCourtType, courtSvgInner, drawCourtForType, positionsForCourtType } from './sport-profiles.js';
import { VB_H, VB_W, avatarHtml, currentTeam, escapeAttr, escapeHtml, fail, genId, pdfDoc, pdfFileName, pdfWrapped, showToast, state } from './state.js';

  export var VIDEO_W = 900, VIDEO_H = 540; // mantiene la proporción 580:348 de la cancha real

  export var ARROW_COLOR = '#151515';


  export function canvasRoundRect(ctx,x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }

  // Dibuja la cancha/campo del deporte de la categoría actual (state.currentCourtType,
  // seteado por applySportProfileForTeam() al cambiar de categoría). Antes esto
  // dibujaba básquet fijo — ver js/sport-profiles.js para el resto de los deportes.
  export function drawCourtBg(ctx){
    var sx = VIDEO_W/580, sy = VIDEO_H/348;
    drawCourtForType(ctx, state.currentCourtType || DEFAULT_COURT_TYPE, sx, sy);
  }

  // Reemplaza las líneas del editor interactivo (#courtWrap svg.lines) según
  // el tipo de cancha — llamado desde applySportProfileForTeam().
  function renderInteractiveCourt(courtType){
    var svg = document.querySelector('#courtWrap svg.lines');
    if(svg) svg.innerHTML = courtSvgInner(courtType);
  }

  // Aplica el perfil visual del deporte de esta categoría (cancha de la
  // Pizarra + posiciones de jugador) — llamado desde loadTeamData() en
  // main-app.js al cambiar de categoría, igual que loadAndApplyClubForTeam()
  // para el tema visual del club. Sin sportId (categoría de Personal Trainer
  // sin deporte) o sin courtType seteado en el deporte: cae a básquet, mismo
  // comportamiento de siempre.
  export function applySportProfileForTeam(teamId){
    var team = state.teams.find(function(t){ return t.id === teamId; });
    function apply(courtType){
      state.currentCourtType = courtType;
      renderInteractiveCourt(courtType);
      setPositionOptions(positionsForCourtType(courtType));
      setStrongFootFieldVisible(courtType === 'futbol');
    }
    // Personal Trainer (clubId null, sin sportsCatalog real): el courtType
    // vive directo en el team (elegido al crear/editar la categoría en el
    // mini-panel de Administración), no hay deporte de plataforma que buscar.
    if(team && team.clubId == null){ apply(team.courtType || DEFAULT_COURT_TYPE); return Promise.resolve(); }
    var sportId = team && team.sportId;
    if(!sportId){ apply(DEFAULT_COURT_TYPE); return Promise.resolve(); }
    return db.collection('sportsCatalog').doc(sportId).get().then(function(snap){
      apply((snap.exists && snap.data().courtType) || DEFAULT_COURT_TYPE);
    }).catch(function(){ apply(DEFAULT_COURT_TYPE); });
  }

  export function drawTokenOnCanvas(ctx, tok, k){
    var px = tok.x/100*VIDEO_W, py = tok.y/100*VIDEO_H;
    ctx.save();
    ctx.translate(px, py);
    if(tok.rotation) ctx.rotate(tok.rotation*Math.PI/180);
    if(tok.type === 'att'){
      var r = 15*k; // base .token: 30x30
      var grad = ctx.createRadialGradient(-r*0.3,-r*0.4,r*0.1, 0,0,r);
      grad.addColorStop(0,'#6FE3A6'); grad.addColorStop(1,'#34C77E');
      ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2);
      ctx.fillStyle = grad; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle='rgba(0,0,0,.25)'; ctx.stroke();
      ctx.fillStyle = '#201000'; ctx.font = 'bold '+Math.round(11*k)+'px sans-serif';
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(tok.label||'', 0, 1);
    } else if(tok.type === 'def'){
      // Reproduce el mismo SVG (viewBox 0 0 50 40) que usa .token.def, escalado a su
      // tamaño real (42x34px). El arco pedido (radio 21 con cuerda de 46) es geométricamente
      // imposible con ese radio, así que el navegador lo agranda automáticamente al mínimo
      // válido: radio = mitad de la cuerda = 23 (queda un semicírculo perfecto).
      var boxW = 42*k, boxH = 34*k, sc = boxW/50;
      ctx.save();
      ctx.translate(-boxW/2, -boxH/2);
      ctx.scale(boxW/50, boxH/40);
      ctx.beginPath(); ctx.arc(25,24,23,Math.PI,0,false); ctx.closePath();
      ctx.fillStyle = '#B23A32'; ctx.fill();
      ctx.lineWidth = 1.6/sc; ctx.strokeStyle = '#000'; ctx.stroke();
      ctx.beginPath(); ctx.arc(25,28,9,0,Math.PI*2);
      ctx.fillStyle = '#B23A32'; ctx.fill(); ctx.lineWidth = 1.6/sc; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold '+Math.round(10/sc)+'px sans-serif';
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(tok.label||'', 25, 28);
      ctx.restore();
    } else if(tok.type === 'ball'){
      if(tok.label){
        ctx.font = Math.round(19*k)+'px sans-serif'; // .token.ball: font-size 19px
        ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(tok.label, 0, 0);
      } else {
        // Cancha genérica: sin emoji de ningún deporte, círculo neutro (mismo
        // criterio que .token.ball:empty en el editor interactivo).
        ctx.beginPath(); ctx.arc(0,0,10*k,0,Math.PI*2);
        ctx.fillStyle = 'rgba(237,238,238,.75)'; ctx.fill();
      }
    } else if(tok.type === 'cone'){
      // .token.cone: 26x26, clip-path polygon(50% 6%, 88% 94%, 12% 94%)
      ctx.beginPath();
      ctx.moveTo(0,-11.44*k); ctx.lineTo(9.88*k,11.44*k); ctx.lineTo(-9.88*k,11.44*k); ctx.closePath();
      ctx.fillStyle='#b8ff3d'; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle='#17210c'; ctx.stroke();
    } else if(tok.type === 'hoop'){
      // .token.hoop: 24x24 (box-sizing:border-box), borde 5px -> radio exterior 12, trazo
      // centrado en radio 9.5 para que el anillo quede entre radio 7 y 12.
      ctx.beginPath(); ctx.arc(0,0,9.5*k,0,Math.PI*2);
      ctx.lineWidth = 5*k; ctx.strokeStyle = '#e64b4b'; ctx.stroke();
    } else if(tok.type === 'ladder'){
      var w=190*k, h=32*k;
      ctx.fillStyle='#fff'; ctx.fillRect(-w/2,-h/2,w,h);
      ctx.strokeStyle='#000'; ctx.lineWidth=3*(190/240)*k; ctx.strokeRect(-w/2,-h/2,w,h);
      for(var c=1;c<6;c++){ var lx=-w/2+w*c/6; ctx.beginPath(); ctx.moveTo(lx,-h/2); ctx.lineTo(lx,h/2); ctx.stroke(); }
    } else {
      // chair (30x30, sin override de tamaño), mat (38x30), hurdle (30x24)
      var sizes = { chair:{w:30,h:30}, mat:{w:38,h:30}, hurdle:{w:30,h:24} };
      var colors = { chair:'#8f6548', mat:'#6fb3cf', hurdle:'#e0932e' };
      var sz = sizes[tok.type] || {w:30,h:30};
      var w = sz.w*k, h = sz.h*k;
      ctx.fillStyle = colors[tok.type] || '#999';
      canvasRoundRect(ctx,-w/2,-h/2,w,h,4*k); ctx.fill();
      if(tok.label){ ctx.font=Math.round(13*k)+'px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle='#171717'; ctx.fillText(tok.label,0,0); }
    }
    ctx.restore();
  }

  export function drawArrowheadOnCanvas(ctx, fromX, fromY, toX, toY){
    var ang = Math.atan2(toY-fromY, toX-fromX), size = 8;
    ctx.beginPath(); ctx.moveTo(toX,toY);
    ctx.lineTo(toX-size*Math.cos(ang-Math.PI/6), toY-size*Math.sin(ang-Math.PI/6));
    ctx.lineTo(toX-size*Math.cos(ang+Math.PI/6), toY-size*Math.sin(ang+Math.PI/6));
    ctx.closePath(); ctx.fillStyle = ARROW_COLOR; ctx.fill();
  }

  export function drawArrowOnCanvas(ctx, a){
    var sx = VIDEO_W/580, sy = VIDEO_H/348;
    ctx.strokeStyle = ARROW_COLOR; ctx.lineWidth = 2.5; ctx.setLineDash([]);
    if(a.type === 'freehand'){
      if(!a.points || a.points.length<2) return;
      ctx.beginPath();
      a.points.forEach(function(p,i){ var px=(Array.isArray(p)?p[0]:p.x)*sx, py=(Array.isArray(p)?p[1]:p.y)*sy; if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py); });
      ctx.stroke();
      return;
    }
    var x1=a.x1*sx, y1=a.y1*sy, x2=a.x2*sx, y2=a.y2*sy;
    if(a.type === 'dashed') ctx.setLineDash([7,6]);
    if(a.type === 'zigzag'){
      var pts = zigzagPointsArr(a.x1,a.y1,a.x2,a.y2);
      ctx.beginPath();
      pts.forEach(function(p,i){ var px=p[0]*sx, py=p[1]*sy; if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py); });
      ctx.stroke();
      var last = pts[pts.length-1], prev = pts[pts.length-2];
      drawArrowheadOnCanvas(ctx, prev[0]*sx, prev[1]*sy, last[0]*sx, last[1]*sy);
    } else {
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      if(a.type === 'screen'){
        var dx=a.x2-a.x1, dy=a.y2-a.y1, len=Math.sqrt(dx*dx+dy*dy)||1, ux=dx/len, uy=dy/len, px=-uy, py=ux, barLen=11;
        ctx.beginPath();
        ctx.moveTo((a.x2+px*barLen)*sx,(a.y2+py*barLen)*sy);
        ctx.lineTo((a.x2-px*barLen)*sx,(a.y2-py*barLen)*sy);
        ctx.stroke();
      } else if(a.type === 'shot'){
        var sdx2=a.x2-a.x1, sdy2=a.y2-a.y1, slen2=Math.sqrt(sdx2*sdx2+sdy2*sdy2)||1, sux2=sdx2/slen2, suy2=sdy2/slen2, spx2=-suy2, spy2=sux2, soff2=3.2;
        ctx.beginPath();
        ctx.moveTo((a.x1+spx2*soff2)*sx,(a.y1+spy2*soff2)*sy);
        ctx.lineTo((a.x2+spx2*soff2)*sx,(a.y2+spy2*soff2)*sy);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo((a.x1-spx2*soff2)*sx,(a.y1-spy2*soff2)*sy);
        ctx.lineTo((a.x2-spx2*soff2)*sx,(a.y2-spy2*soff2)*sy);
        ctx.stroke();
        drawArrowheadOnCanvas(ctx, x1, y1, x2, y2);
      } else {
        drawArrowheadOnCanvas(ctx, x1, y1, x2, y2);
      }
    }
    ctx.setLineDash([]);
  }

  export function zigzagPointsArr(x1,y1,x2,y2){
    var dx=x2-x1, dy=y2-y1, len=Math.sqrt(dx*dx+dy*dy)||1;
    var segments = Math.max(4, Math.round(len/22));
    var ux=dx/len, uy=dy/len, px=-uy, py=ux, amp=8;
    var pts=[[x1,y1]];
    for(var i=1;i<segments;i++){ var t=i/segments, bx=x1+dx*t, by=y1+dy*t, side=(i%2===0)?1:-1; pts.push([bx+px*amp*side, by+py*amp*side]); }
    pts.push([x2,y2]);
    return pts;
  }

  export function exportVideo(){
    if(!window.MediaRecorder){ showToast('Tu navegador no soporta grabar video. Probá con Chrome o Firefox actualizado.'); return; }
    var frames = state.editFrames;
    if(!frames || frames.length < 2){ showToast('Necesitás al menos 2 páginas para generar un video'); return; }
    var btn = document.getElementById('exportVideoBtn');
    btn.disabled = true; btn.textContent = 'Generando video…';

    var canvas = document.createElement('canvas');
    canvas.width = VIDEO_W; canvas.height = VIDEO_H;
    var ctx = canvas.getContext('2d');
    var stream = canvas.captureStream(30);
    var chunks = [];
    var mimeType = (window.MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) ? 'video/webm;codecs=vp9' : 'video/webm';
    var recorder;
    try{ recorder = new MediaRecorder(stream, { mimeType: mimeType }); }
    catch(e){ showToast('No se pudo iniciar la grabación en este navegador.'); btn.disabled=false; btn.textContent='🎥 Generar video'; return; }
    recorder.ondataavailable = function(e){ if(e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = function(){
      var blob = new Blob(chunks, { type: mimeType });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url; link.download = pdfFileName(document.getElementById('playNameInput').value || 'jugada') + '.webm';
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
      btn.disabled = false; btn.textContent = '🎥 Generar video';
      showToast('Video generado y descargado');
    };

    var HOLD_MS = 900, TRANS_MS = 900, FPS = 30, k = VIDEO_W/660;

    function drawStatic(frame){
      ctx.clearRect(0,0,VIDEO_W,VIDEO_H);
      drawCourtBg(ctx);
      (frame.arrows||[]).forEach(function(a){ drawArrowOnCanvas(ctx,a); });
      (frame.tokens||[]).forEach(function(t){ drawTokenOnCanvas(ctx,t,k); });
    }
    function drawInterp(fromFrame, toFrame, t){
      ctx.clearRect(0,0,VIDEO_W,VIDEO_H);
      drawCourtBg(ctx);
      var fromMap = {}; (fromFrame.tokens||[]).forEach(function(tk){ fromMap[tk.id]=tk; });
      (toFrame.tokens||[]).forEach(function(toTok){
        var fromTok = fromMap[toTok.id] || toTok;
        var interpTok = { id:toTok.id, type:toTok.type, label:toTok.label, rotation:toTok.rotation,
          x: fromTok.x + (toTok.x-fromTok.x)*t, y: fromTok.y + (toTok.y-fromTok.y)*t };
        drawTokenOnCanvas(ctx, interpTok, k);
      });
    }

    recorder.start();
    var frameIdx = 0;
    function playHold(){
      if(frameIdx >= frames.length){ recorder.stop(); return; }
      drawStatic(frames[frameIdx]);
      setTimeout(function(){
        if(frameIdx < frames.length-1) playTransition();
        else recorder.stop();
      }, HOLD_MS);
    }
    function playTransition(){
      var fromFrame = frames[frameIdx], toFrame = frames[frameIdx+1];
      var steps = Math.round(TRANS_MS/1000*FPS), step = 0;
      function tick(){
        if(step > steps){ frameIdx++; playHold(); return; }
        drawInterp(fromFrame, toFrame, step/steps);
        step++;
        setTimeout(tick, 1000/FPS);
      }
      tick();
    }
    playHold();
  }

  export function captureSingleFrame(activity, frameIndex){
    var holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-9999px;top:0;width:400px;';
    holder.innerHTML = renderActivityPreview(Object.assign({}, activity, { previewPage: frameIndex }));
    document.body.appendChild(holder);
    var courtEl = holder.querySelector('.diagram-preview-court');
    if(!courtEl){ document.body.removeChild(holder); return Promise.resolve(null); }
    return new Promise(function(resolve){ requestAnimationFrame(function(){ requestAnimationFrame(resolve); }); })
      .then(function(){ return html2canvas(courtEl, { backgroundColor: null, scale: 2 }); })
      .then(function(canvas){ document.body.removeChild(holder); return { dataUrl: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height }; })
      .catch(function(){ if(holder.parentNode) document.body.removeChild(holder); return null; });
  }

  export function captureDiagramImages(activity){
    if(!activity.diagram || !activity.diagram.frames || !activity.diagram.frames.length) return Promise.resolve([]);
    var frameCount = activity.diagram.frames.length, chain = Promise.resolve(), results = [];
    for(var idx = 0; idx < frameCount; idx++){
      (function(idx){
        chain = chain.then(function(){ return captureSingleFrame(activity, idx); }).then(function(img){ results.push(img); });
      })(idx);
    }
    return chain.then(function(){ return results; });
  }

  export function getCurrentFrame(){ return state.editFrames[state.currentFrameIndex]; }

  export function renderFrameIndicator(){ document.getElementById('frameIndicator').textContent = (state.currentFrameIndex+1) + ' / ' + state.editFrames.length; }

  export function setMode(newMode){
    state.mode = newMode; state.arrowPending = null;
    document.getElementById('arrowMode').classList.toggle('mode-active', newMode==='arrow');
    document.getElementById('freehandMode').classList.toggle('mode-active', newMode==='freehand');
    document.getElementById('eraserMode').classList.toggle('mode-active', newMode==='eraser');
    var help = document.getElementById('modeHelp');
    if(newMode==='arrow') help.textContent = 'Modo flecha: tocá un punto o jugador de inicio y después el punto final. Podés tocar cualquier lugar de la cancha.';
    else if(newMode==='freehand') help.textContent = 'Lápiz libre: mantené presionado y arrastrá para dibujar una línea libre.';
    else if(newMode==='eraser') help.textContent = 'Modo borrador: tocá cualquier jugador o línea y se borra al instante.';
    else help.textContent = 'Modo mover: arrastrá jugadores para reubicarlos.';
  }

  export function pushUndo(){
    state.undoStack.push(JSON.stringify({frames: state.editFrames, idx: state.currentFrameIndex}));
    if(state.undoStack.length > 60) state.undoStack.shift();
    state.redoStack = [];
  }

  export function undo(){
    if(state.undoStack.length === 0){ showToast('Nada para deshacer'); return; }
    state.redoStack.push(JSON.stringify({frames: state.editFrames, idx: state.currentFrameIndex}));
    var prev = JSON.parse(state.undoStack.pop());
    state.editFrames = prev.frames; state.currentFrameIndex = prev.idx;
    state.selectedTokenId = null; state.selectedArrowId = null;
    renderFrame();
  }

  export function redo(){
    if(state.redoStack.length === 0){ showToast('Nada para rehacer'); return; }
    state.undoStack.push(JSON.stringify({frames: state.editFrames, idx: state.currentFrameIndex}));
    var next = JSON.parse(state.redoStack.pop());
    state.editFrames = next.frames; state.currentFrameIndex = next.idx;
    state.selectedTokenId = null; state.selectedArrowId = null;
    renderFrame();
  }

  export function renderFrame(){
    renderFrameIndicator();
    var layer = document.getElementById('tokensLayer');
    var frame = getCurrentFrame();
    var seenIds = {};
    frame.tokens.forEach(function(tok){
      seenIds[tok.id] = true;
      var el = layer.querySelector('[data-id="'+tok.id+'"]');
      if(!el){
        el = document.createElement('div');
        el.dataset.id = tok.id;
        el.setAttribute('tabindex','0');
        el.addEventListener('pointerdown', function(e){ onTokenPointerDown(e, tok.id); });
        layer.appendChild(el);
      }
      el.className = 'token ' + tok.type + (tok.id === state.selectedTokenId ? ' selected' : '');
      el.style.left = tok.x + '%'; el.style.top = tok.y + '%';
      el.style.setProperty('--rot', (tok.rotation||0)+'deg');
      el.textContent = tok.label;
    });
    Array.prototype.slice.call(layer.children).forEach(function(el){
      if(!seenIds[el.dataset.id]) layer.removeChild(el);
    });
    renderArrows();
  }

  export function zigzagPathD(x1,y1,x2,y2){
    var dx=x2-x1, dy=y2-y1, len=Math.sqrt(dx*dx+dy*dy)||1;
    var segments = Math.max(4, Math.round(len/22));
    var ux=dx/len, uy=dy/len, px=-uy, py=ux, amp=8;
    var pts=[[x1,y1]];
    for(var i=1;i<segments;i++){ var t=i/segments, bx=x1+dx*t, by=y1+dy*t, side=(i%2===0)?1:-1; pts.push([bx+px*amp*side, by+py*amp*side]); }
    pts.push([x2,y2]);
    return 'M'+pts.map(function(p){return p[0].toFixed(1)+','+p[1].toFixed(1);}).join(' L ');
  }

  export function freehandPathD(points){ if(points.length===0) return ''; return 'M'+points.map(function(p){ var px=Array.isArray(p)?p[0]:p.x, py=Array.isArray(p)?p[1]:p.y; return px.toFixed(1)+','+py.toFixed(1);}).join(' L '); }

  export function selectArrow(id){
    var prev = state.selectedTokenId; state.selectedTokenId = null;
    if(prev){ var el = document.getElementById('tokensLayer').querySelector('[data-id="'+prev+'"]'); if(el) el.classList.remove('selected'); }
    state.selectedArrowId = (state.selectedArrowId === id) ? null : id;
    renderArrows();
  }

  export function renderArrows(){
    var svg = document.getElementById('arrowsSvg');
    while(svg.children.length > 1){ svg.removeChild(svg.lastChild); }
    var ns = 'http://www.w3.org/2000/svg';
    getCurrentFrame().arrows.forEach(function(a){
      var type = a.type || 'line';
      var isSel = a.id === state.selectedArrowId;
      var strokeColor = isSel ? '#3FA796' : ARROW_COLOR;
      var strokeW = isSel ? '3.5' : '2.5';
      var g = document.createElementNS(ns,'g');
      g.style.pointerEvents = 'auto'; g.style.cursor = 'pointer';
      g.addEventListener('pointerdown', function(e){
        if(state.mode==='eraser'){
          e.stopPropagation();
          pushUndo();
          var fr = getCurrentFrame();
          fr.arrows = fr.arrows.filter(function(x){ return x.id!==a.id; });
          renderArrows();
          return;
        }
        if(state.mode!=='move') return;
        e.stopPropagation(); selectArrow(a.id);
      });
      if(type==='dashed'){
        var hitD=document.createElementNS(ns,'line'); hitD.setAttribute('x1',a.x1); hitD.setAttribute('y1',a.y1); hitD.setAttribute('x2',a.x2); hitD.setAttribute('y2',a.y2); hitD.setAttribute('stroke','transparent'); hitD.setAttribute('stroke-width','18'); g.appendChild(hitD);
        var lineD=document.createElementNS(ns,'line'); lineD.setAttribute('x1',a.x1); lineD.setAttribute('y1',a.y1); lineD.setAttribute('x2',a.x2); lineD.setAttribute('y2',a.y2); lineD.setAttribute('stroke',strokeColor); lineD.setAttribute('stroke-width',strokeW); lineD.setAttribute('stroke-dasharray','7,6'); lineD.setAttribute('marker-end', isSel?'':'url(#arrowhead)'); g.appendChild(lineD);
      } else if(type==='freehand'){
        var hit=document.createElementNS(ns,'path'); hit.setAttribute('d',freehandPathD(a.points)); hit.setAttribute('fill','none'); hit.setAttribute('stroke','transparent'); hit.setAttribute('stroke-width','18'); g.appendChild(hit);
        var path=document.createElementNS(ns,'path'); path.setAttribute('d',freehandPathD(a.points)); path.setAttribute('fill','none'); path.setAttribute('stroke',strokeColor); path.setAttribute('stroke-width',strokeW); path.setAttribute('stroke-linecap','round'); path.setAttribute('stroke-linejoin','round'); g.appendChild(path);
      } else if(type==='zigzag'){
        var d=zigzagPathD(a.x1,a.y1,a.x2,a.y2);
        var hit2=document.createElementNS(ns,'path'); hit2.setAttribute('d',d); hit2.setAttribute('fill','none'); hit2.setAttribute('stroke','transparent'); hit2.setAttribute('stroke-width','18'); g.appendChild(hit2);
        var path2=document.createElementNS(ns,'path'); path2.setAttribute('d',d); path2.setAttribute('fill','none'); path2.setAttribute('stroke',strokeColor); path2.setAttribute('stroke-width',strokeW); path2.setAttribute('marker-end', isSel?'':'url(#arrowhead)'); g.appendChild(path2);
      } else if(type==='screen'){
        var dx=a.x2-a.x1, dy=a.y2-a.y1, len=Math.sqrt(dx*dx+dy*dy)||1, ux=dx/len, uy=dy/len, px=-uy, py=ux, barLen=11;
        var hit3=document.createElementNS(ns,'line'); hit3.setAttribute('x1',a.x1); hit3.setAttribute('y1',a.y1); hit3.setAttribute('x2',a.x2); hit3.setAttribute('y2',a.y2); hit3.setAttribute('stroke','transparent'); hit3.setAttribute('stroke-width','18'); g.appendChild(hit3);
        var mainLine=document.createElementNS(ns,'line'); mainLine.setAttribute('x1',a.x1); mainLine.setAttribute('y1',a.y1); mainLine.setAttribute('x2',a.x2); mainLine.setAttribute('y2',a.y2); mainLine.setAttribute('stroke',strokeColor); mainLine.setAttribute('stroke-width',strokeW); g.appendChild(mainLine);
        var barLine=document.createElementNS(ns,'line'); barLine.setAttribute('x1',a.x2+px*barLen); barLine.setAttribute('y1',a.y2+py*barLen); barLine.setAttribute('x2',a.x2-px*barLen); barLine.setAttribute('y2',a.y2-py*barLen); barLine.setAttribute('stroke',strokeColor); barLine.setAttribute('stroke-width',strokeW); g.appendChild(barLine);
      } else if(type==='shot'){
        var sdx=a.x2-a.x1, sdy=a.y2-a.y1, slen=Math.sqrt(sdx*sdx+sdy*sdy)||1, sux=sdx/slen, suy=sdy/slen, spx=-suy, spy=sux, soff=3.2;
        var hitS=document.createElementNS(ns,'line'); hitS.setAttribute('x1',a.x1); hitS.setAttribute('y1',a.y1); hitS.setAttribute('x2',a.x2); hitS.setAttribute('y2',a.y2); hitS.setAttribute('stroke','transparent'); hitS.setAttribute('stroke-width','18'); g.appendChild(hitS);
        var lineS1=document.createElementNS(ns,'line'); lineS1.setAttribute('x1',a.x1+spx*soff); lineS1.setAttribute('y1',a.y1+spy*soff); lineS1.setAttribute('x2',a.x2+spx*soff); lineS1.setAttribute('y2',a.y2+spy*soff); lineS1.setAttribute('stroke',strokeColor); lineS1.setAttribute('stroke-width',strokeW); g.appendChild(lineS1);
        var lineS2=document.createElementNS(ns,'line'); lineS2.setAttribute('x1',a.x1-spx*soff); lineS2.setAttribute('y1',a.y1-spy*soff); lineS2.setAttribute('x2',a.x2-spx*soff); lineS2.setAttribute('y2',a.y2-spy*soff); lineS2.setAttribute('stroke',strokeColor); lineS2.setAttribute('stroke-width',strokeW); g.appendChild(lineS2);
        var tipS=document.createElementNS(ns,'line'); tipS.setAttribute('x1',a.x1); tipS.setAttribute('y1',a.y1); tipS.setAttribute('x2',a.x2); tipS.setAttribute('y2',a.y2); tipS.setAttribute('stroke','transparent'); tipS.setAttribute('stroke-width','1'); tipS.setAttribute('marker-end', isSel?'':'url(#arrowheadShot)'); g.appendChild(tipS);
      } else {
        var hit4=document.createElementNS(ns,'line'); hit4.setAttribute('x1',a.x1); hit4.setAttribute('y1',a.y1); hit4.setAttribute('x2',a.x2); hit4.setAttribute('y2',a.y2); hit4.setAttribute('stroke','transparent'); hit4.setAttribute('stroke-width','18'); g.appendChild(hit4);
        var line=document.createElementNS(ns,'line'); line.setAttribute('x1',a.x1); line.setAttribute('y1',a.y1); line.setAttribute('x2',a.x2); line.setAttribute('y2',a.y2); line.setAttribute('stroke',strokeColor); line.setAttribute('stroke-width',strokeW); line.setAttribute('marker-end', isSel?'':'url(#arrowhead)'); g.appendChild(line);
      }
      svg.appendChild(g);
    });
  }

  export function addToken(type){
    pushUndo();
    var frame = getCurrentFrame();
    var id = 't' + (state.tokenSeq++);
    var label = '';
    if(type==='att') label = String(frame.tokens.filter(function(t){return t.type==='att';}).length+1);
    else if(type==='def') label = 'X'+(frame.tokens.filter(function(t){return t.type==='def';}).length+1);
    else if(type==='ball') label = ballEmojiForCourtType(state.currentCourtType || DEFAULT_COURT_TYPE);
    else if({cone:1,hoop:1,chair:1,mat:1,ladder:1,hurdle:1}[type]) label = {cone:'',hoop:'',chair:'🪑',mat:'▰',ladder:'',hurdle:'🚧'}[type];
    frame.tokens.push({id:id, type:type, x:50, y: type==='ball'?50:30, label:label, rotation:0});
    renderFrame();
  }

  export function rotateSelectedToken(delta){
    if(!state.selectedTokenId){ showToast('Primero tocá una ficha para seleccionarla'); return; }
    var frame = getCurrentFrame();
    var tok = (frame.tokens||[]).find(function(t){ return t.id === state.selectedTokenId; });
    if(!tok){ showToast('Primero tocá una ficha para seleccionarla'); return; }
    pushUndo();
    tok.rotation = ((tok.rotation||0) + delta + 360) % 360;
    renderFrame();
  }

  export function viewboxPointFromEvent(e){
    var rect = document.getElementById('courtWrap').getBoundingClientRect();
    return { x: ((e.clientX-rect.left)/rect.width)*VB_W, y: ((e.clientY-rect.top)/rect.height)*VB_H };
  }

  export function onTokenPointerDown(e, id){
    e.preventDefault(); e.stopPropagation();
    if(state.mode==='eraser'){
      pushUndo();
      var fr = getCurrentFrame();
      fr.tokens = fr.tokens.filter(function(t){ return t.id!==id; });
      if(state.selectedTokenId===id) state.selectedTokenId=null;
      renderFrame();
      return;
    }
    if(state.mode==='arrow'){
      var tok = getCurrentFrame().tokens.find(function(t){ return t.id===id; });
      if(tok) handleArrowPointClick({x: tok.x/100*VB_W, y: tok.y/100*VB_H});
      return;
    }
    if(state.mode==='freehand') return;
    pushUndo();
    var prevSelected = state.selectedTokenId, prevArrow = state.selectedArrowId;
    state.selectedTokenId = id; state.selectedArrowId = null;
    var layer = document.getElementById('tokensLayer');
    if(prevSelected){ var p = layer.querySelector('[data-id="'+prevSelected+'"]'); if(p) p.classList.remove('selected'); }
    if(prevArrow) renderArrows();
    var el = e.currentTarget;
    el.classList.add('selected');
    el.style.transition = 'none';
    var rect = document.getElementById('courtWrap').getBoundingClientRect();
    try{ el.setPointerCapture(e.pointerId); }catch(err){}
    function move(ev){
      var x=((ev.clientX-rect.left)/rect.width)*100, y=((ev.clientY-rect.top)/rect.height)*100;
      var tok = getCurrentFrame().tokens.find(function(t){ return t.id===id; });
      if(tok){ tok.x=Math.max(1,Math.min(99,x)); tok.y=Math.max(1,Math.min(99,y)); el.style.left=tok.x+'%'; el.style.top=tok.y+'%'; }
    }
    function up(ev){ try{ el.releasePointerCapture(e.pointerId); }catch(err){} el.style.transition=''; window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up); }
    window.addEventListener('pointermove',move); window.addEventListener('pointerup',up);
  }

  export function findTokenNear(vbX, vbY){
    // vbX/vbY llegan en coordenadas del viewBox del SVG (0-580 / 0-348) — las fichas
    // se guardan en % de la cancha (0-100), hay que convertir antes de comparar.
    var xPercent = (vbX / VB_W) * 100, yPercent = (vbY / VB_H) * 100;
    var tolerance = 5; // % de la cancha
    var best = null, bestDist = tolerance;
    (getCurrentFrame().tokens||[]).forEach(function(t){
      var d = Math.hypot(t.x-xPercent, t.y-yPercent);
      if(d <= bestDist){ bestDist = d; best = t; }
    });
    return best;
  }

  export function handleArrowPointClick(vb){
    if(!state.arrowPending){ state.arrowPending = vb; showToast('Ahora tocá el punto final de la flecha'); }
    else {
      var arrowType = document.getElementById('arrowTypeSelect').value;
      pushUndo();
      var fromToken = findTokenNear(state.arrowPending.x, state.arrowPending.y);
      getCurrentFrame().arrows.push({id:genId('a'), x1:state.arrowPending.x, y1:state.arrowPending.y, x2:vb.x, y2:vb.y, type:arrowType, fromTokenId: fromToken ? fromToken.id : null});
      state.arrowPending = null; renderArrows();
    }
  }

  export function startFreehand(e){
    e.preventDefault();
    var rect = document.getElementById('courtWrap').getBoundingClientRect();
    var points = [];
    function toVb(ev){ return {x:((ev.clientX-rect.left)/rect.width)*VB_W, y:((ev.clientY-rect.top)/rect.height)*VB_H}; }
    points.push(toVb(e));
    var svg = document.getElementById('arrowsSvg');
    var ns = 'http://www.w3.org/2000/svg';
    var tempPath = document.createElementNS(ns,'path');
    tempPath.setAttribute('fill','none'); tempPath.setAttribute('stroke','#3FA796'); tempPath.setAttribute('stroke-width','2.5');
    tempPath.setAttribute('stroke-linecap','round'); tempPath.setAttribute('stroke-linejoin','round');
    svg.appendChild(tempPath);
    function move(ev){ points.push(toVb(ev)); tempPath.setAttribute('d', freehandPathD(points)); }
    function up(){
      window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up);
      svg.removeChild(tempPath);
      if(points.length>=2){
        pushUndo();
        // Si el trazo arranca cerca de una ficha, queda "pegado" a ella igual que las
        // flechas (fromTokenId) — así sirve como línea guía de movimiento (ver addFrame()
        // y playAnimation()) sin cambiar el dibujo libre suelto, que sigue igual que siempre.
        var fromTok = findTokenNear(points[0].x, points[0].y);
        getCurrentFrame().arrows.push({id:genId('a'), type:'freehand', points:points, fromTokenId: fromTok ? fromTok.id : null});
        renderArrows();
      }
    }
    window.addEventListener('pointermove',move); window.addEventListener('pointerup',up);
  }

  export function toggleArrowModeBtn(){ setMode(state.mode==='arrow' ? 'move' : 'arrow'); }

  export function toggleFreehandModeBtn(){ setMode(state.mode==='freehand' ? 'move' : 'freehand'); }

  export function toggleEraserModeBtn(){ setMode(state.mode==='eraser' ? 'move' : 'eraser'); }

  export function clearBoard(){
    pushUndo();
    var f=getCurrentFrame(); f.tokens=[]; f.arrows=[]; state.selectedTokenId=null; state.selectedArrowId=null; renderFrame();
  }

  // Tolerancia (en unidades del viewBox 580x348) para considerar que el destino de una
  // flecha "coincide" con el origen de la siguiente y arma una cadena — los clicks no
  // caen nunca en el mismo píxel exacto, por eso hace falta este margen.
  var CHAIN_TOLERANCE = 20;

  // Recorre la cadena de flechas conectadas (destino de una = origen de la siguiente,
  // dentro de CHAIN_TOLERANCE) empezando en startArrow y devuelve el punto final de la
  // ÚLTIMA flecha de la cadena. No sigue flechas de tipo 'freehand' (esas se resuelven
  // aparte, con su propio último punto — ver addFrame()).
  export function chainEndPoint(startArrow, allArrows){
    var visited = {}, current = startArrow;
    while(current){
      visited[current.id] = true;
      var ex = current.x2, ey = current.y2;
      var next = (allArrows||[]).find(function(a){
        return !visited[a.id] && a.type !== 'freehand' && Math.hypot(a.x1-ex, a.y1-ey) <= CHAIN_TOLERANCE;
      });
      if(!next) return { x: ex, y: ey };
      current = next;
    }
  }

  export function addFrame(){
    pushUndo();
    var current = getCurrentFrame();
    var copy = JSON.parse(JSON.stringify(current));
    // Cada ficha con una flecha propia salta directo al destino final en la página nueva:
    // si es line/dashed/zigzag/screen/shot, sigue toda la cadena de flechas conectadas
    // (chainEndPoint); si es lápiz libre, usa el último punto de su propio trazo.
    var moved = 0;
    copy.tokens.forEach(function(tok){
      var arrow = (current.arrows||[]).find(function(a){ return a.fromTokenId === tok.id; });
      if(!arrow) return;
      var end = null;
      if(arrow.type === 'freehand'){
        var pts = arrow.points || [];
        if(pts.length){ var last = pts[pts.length-1]; end = { x: Array.isArray(last)?last[0]:last.x, y: Array.isArray(last)?last[1]:last.y }; }
      } else {
        end = chainEndPoint(arrow, current.arrows || []);
      }
      // end.x/y están en coordenadas del viewBox del SVG (0-580 / 0-348), hay que
      // convertirlas a % de la cancha (0-100) antes de asignarlas a tok.x/tok.y.
      if(end){ tok.x = Math.max(1,Math.min(99,(end.x/VB_W)*100)); tok.y = Math.max(1,Math.min(99,(end.y/VB_H)*100)); moved++; }
    });
    // Si un jugador hace un pique (flecha zigzag) y la pelota está pegada a él (sin flecha
    // propia), la pelota lo acompaña manteniendo la misma posición relativa (offset).
    current.tokens.forEach(function(origTok){
      var pierceArrow = (current.arrows||[]).find(function(a){ return a.fromTokenId === origTok.id && a.type === 'zigzag'; });
      if(!pierceArrow) return;
      var tolerance = 8, ballOrig = null, bestDist = tolerance;
      (current.tokens||[]).forEach(function(t){
        if(t.type !== 'ball' || t.id === origTok.id) return;
        var hasOwnArrow = (current.arrows||[]).some(function(a){ return a.fromTokenId === t.id; });
        if(hasOwnArrow) return;
        var d = Math.hypot(t.x-origTok.x, t.y-origTok.y);
        if(d <= bestDist){ bestDist = d; ballOrig = t; }
      });
      if(!ballOrig) return;
      var offsetX = ballOrig.x - origTok.x, offsetY = ballOrig.y - origTok.y;
      var newPlayer = copy.tokens.find(function(t){ return t.id === origTok.id; });
      var newBall = copy.tokens.find(function(t){ return t.id === ballOrig.id; });
      if(newPlayer && newBall){
        newBall.x = Math.max(1,Math.min(99, newPlayer.x + offsetX));
        newBall.y = Math.max(1,Math.min(99, newPlayer.y + offsetY));
      }
    });
    copy.arrows = []; // la página nueva arranca limpia, lista para el próximo movimiento
    state.editFrames.splice(state.currentFrameIndex+1, 0, copy);
    state.currentFrameIndex++; state.selectedTokenId=null; state.selectedArrowId=null; renderFrame();
    showToast(moved ? ('Página nueva — '+moved+' ficha'+(moved===1?'':'s')+' se movieron a destino') : 'Página nueva creada');
  }

  export function deleteFrame(){
    if(state.editFrames.length<=1){ showToast('Tiene que quedar al menos una página'); return; }
    pushUndo();
    state.editFrames.splice(state.currentFrameIndex,1);
    if(state.currentFrameIndex>=state.editFrames.length) state.currentFrameIndex=state.editFrames.length-1;
    state.selectedTokenId=null; state.selectedArrowId=null; renderFrame();
  }

  export function prevFrame(){ if(state.currentFrameIndex>0){ state.currentFrameIndex--; state.selectedTokenId=null; state.selectedArrowId=null; renderFrame(); } }

  export function nextFrame(){ if(state.currentFrameIndex<state.editFrames.length-1){ state.currentFrameIndex++; state.selectedTokenId=null; state.selectedArrowId=null; renderFrame(); } }

  var FRAME_ANIM_MS = 1400;

  // Anima una ficha siguiendo TODO el recorrido de una línea de lápiz libre (punto por
  // punto), en vez de saltar directo al destino — usado cuando esa ficha está "pegada"
  // (fromTokenId) a un trazo de lápiz libre. onDone() se llama al terminar el recorrido.
  function animateTokenAlongPath(tokenId, points, duration, onDone){
    var el = document.getElementById('tokensLayer').querySelector('[data-id="'+tokenId+'"]');
    if(!el || !points || points.length < 2){ onDone(); return; }
    var pct = points.map(function(p){
      var px = Array.isArray(p) ? p[0] : p.x, py = Array.isArray(p) ? p[1] : p.y;
      return { x: (px/VB_W)*100, y: (py/VB_H)*100 };
    });
    var segLens = [], total = 0;
    for(var k=1;k<pct.length;k++){ var dx=pct[k].x-pct[k-1].x, dy=pct[k].y-pct[k-1].y; var l=Math.hypot(dx,dy); segLens.push(l); total += l; }
    if(total <= 0){ onDone(); return; }
    var start = null;
    function frameStep(ts){
      if(!state.playingAnimation){ onDone(); return; }
      if(start === null) start = ts;
      var t = Math.min(1, (ts-start)/duration);
      var target = t*total, acc = 0, idx = 0;
      while(idx < segLens.length-1 && acc+segLens[idx] < target){ acc += segLens[idx]; idx++; }
      var p0 = pct[idx], p1 = pct[Math.min(idx+1, pct.length-1)];
      var segT = segLens[idx] ? Math.min(1,(target-acc)/segLens[idx]) : 1;
      var x = p0.x + (p1.x-p0.x)*segT, y = p0.y + (p1.y-p0.y)*segT;
      el.style.left = x+'%'; el.style.top = y+'%';
      if(t < 1) requestAnimationFrame(frameStep); else onDone();
    }
    requestAnimationFrame(frameStep);
  }

  export function playAnimation(){
    if(state.playingAnimation){ stopAnimation(); return; }
    if(state.editFrames.length < 2){ showToast('Necesitás al menos 2 páginas para reproducir la jugada'); return; }
    state.playingAnimation = true;
    document.getElementById('playAnimBtn').textContent = '⏸ Detener';
    state.currentFrameIndex = 0; state.selectedTokenId = null; state.selectedArrowId = null;
    renderFrame();
    var i = 0;
    function step(){
      if(!state.playingAnimation) return;
      if(i >= state.editFrames.length - 1){ stopAnimation(); return; }
      // Las fichas pegadas a una línea de lápiz libre en la página de ORIGEN recorren
      // todo el trazo animadas; el resto de las fichas simplemente aparece en su lugar
      // en la página siguiente (comportamiento de siempre, sin cambios).
      var sourceFrame = state.editFrames[i];
      var guides = (sourceFrame.arrows||[]).filter(function(a){ return a.type==='freehand' && a.fromTokenId; });
      state.animTimer = setTimeout(function(){
        if(!state.playingAnimation) return;
        i++; state.currentFrameIndex = i; renderFrame();
        if(guides.length){
          var pending = guides.length;
          guides.forEach(function(g){
            animateTokenAlongPath(g.fromTokenId, g.points, FRAME_ANIM_MS, function(){
              pending--; if(pending<=0) step();
            });
          });
        } else {
          step();
        }
      }, guides.length ? 0 : FRAME_ANIM_MS);
    }
    step();
  }

  export function stopAnimation(){
    state.playingAnimation = false;
    if(state.animTimer){ clearTimeout(state.animTimer); state.animTimer = null; }
    var btn = document.getElementById('playAnimBtn');
    if(btn) btn.textContent = '▶ Reproducir jugada';
  }

  export function savePlay(){
    var nameInput = document.getElementById('playNameInput');
    var name = nameInput.value.trim();
    if(!name){ showToast('Ponele un nombre a la jugada'); return; }
    var category = document.getElementById('playCategorySelect').value;
    var teamId = state.currentTeamId;
    var play = { id:'p'+Date.now(), name:name, category:category, frames: JSON.parse(JSON.stringify(state.editFrames)) };
    if(!state.plays[teamId]) state.plays[teamId] = [];
    state.plays[teamId].push(play);
    db.collection('teams').doc(teamId).collection('data').doc('plays').set({ plays: state.plays[teamId] })
      .then(function(){ nameInput.value = ''; showToast('Jugada guardada con '+play.frames.length+' página(s)'); renderPlaysList(); })
      .catch(function(e){ fail(e); showToast('No se pudo guardar. Reintentá.'); });
  }

  export function renderPlaysList(){
    var wrap = document.getElementById('playsList');
    var list = state.plays[state.currentTeamId] || [];
    if(list.length===0){ wrap.innerHTML = '<div class="empty">Todavía no guardaste jugadas para esta categoría.</div>'; return; }
    wrap.innerHTML = '';
    list.forEach(function(play){
      var item = document.createElement('div');
      item.className = 'play-item';
      var frameCount = play.frames ? play.frames.length : 1;
      item.innerHTML = '<div class="meta"><span class="cat">'+escapeHtml(play.category)+' · '+frameCount+' pág.</span>'+escapeHtml(play.name)+'</div><div class="play-actions"><button class="btn secondary small" data-action="load">Cargar</button><button class="btn danger small" data-action="delete">Borrar</button></div>';
      item.querySelector('[data-action="load"]').addEventListener('click', function(){ loadPlay(play); });
      item.querySelector('[data-action="delete"]').addEventListener('click', function(){ deletePlay(play.id); });
      wrap.appendChild(item);
    });
  }

  export function loadPlay(play){
    var frames = play.frames ? play.frames : [{tokens:play.tokens||[], arrows:play.arrows||[]}];
    state.editFrames = JSON.parse(JSON.stringify(frames));
    state.editFrames.forEach(function(f){ f.arrows.forEach(function(a){ if(!a.id) a.id = genId('a'); }); });
    state.currentFrameIndex = 0;
    var maxSeq = 0;
    state.editFrames.forEach(function(f){ f.tokens.forEach(function(t){ maxSeq = Math.max(maxSeq, parseInt(t.id.replace('t',''))||0); }); });
    state.tokenSeq = maxSeq+1; state.selectedTokenId=null; state.selectedArrowId=null;
    state.undoStack = []; state.redoStack = [];
    setMode('move'); renderFrame(); showToast('Jugada "'+play.name+'" cargada');
  }

  export function deletePlay(id){
    var teamId = state.currentTeamId;
    state.plays[teamId] = (state.plays[teamId]||[]).filter(function(p){ return p.id!==id; });
    db.collection('teams').doc(teamId).collection('data').doc('plays').set({ plays: state.plays[teamId] }).catch(function(e){ fail(e); });
    renderPlaysList();
  }

  export function exerciseCollection(){ return db.collection('users').doc(state.user.uid).collection('exercises'); }

  export function publicExerciseCollection(){ return db.collection('publicExerciseLibrary'); }

  export function switchBibSubTab(name){
    ['crear','personal','publica'].forEach(function(k){
      var el = document.getElementById('bibSub-'+k);
      if(el) el.style.display = (k===name) ? '' : 'none';
    });
    document.querySelectorAll('#bibSubTabs button[data-subtab]').forEach(function(b){
      b.classList.toggle('active', b.dataset.subtab===name);
    });
    if(name==='personal') renderExercises();
    if(name==='publica') refreshPublicExercises();
  }

  // Todo separado por club+deporte: ambas listas de acá abajo solo ofrecen
  // categorías del MISMO club+deporte que la categoría actual, no cualquiera
  // de las que la cuenta tenga en otro club/deporte.
  function sameSportTeams(){
    var current = currentTeam();
    var teams = state.teams || [];
    return current ? teams.filter(function(t){ return t.clubId === current.clubId && t.sportId === current.sportId; }) : teams;
  }

  export function renderPlayTeamCategoryPicker(selected){
    var wrap = document.getElementById('playTeamCategories');
    if(!wrap) return;
    if(selected === undefined){
      selected = Array.prototype.map.call(wrap.querySelectorAll('input[data-team-cat]:checked'), function(cb){ return cb.dataset.teamCat; });
    }
    var teams = sameSportTeams();
    if(!teams.length){ wrap.innerHTML = ''; return; }
    wrap.innerHTML = '<span class="helper-text" style="width:100%;margin-bottom:4px;">Categorías de equipo (opcional, para filtrar después):</span>'
      + teams.map(function(t){
          var checked = selected.indexOf(t.name) !== -1 ? ' checked' : '';
          return '<label class="member-chip" style="cursor:pointer;"><input type="checkbox" data-team-cat="'+escapeAttr(t.name)+'"'+checked+'> '+escapeHtml(t.name)+'</label>';
        }).join(' ');
  }

  export function ensureTeamCategoryFilterOptions(selectId){
    var sel = document.getElementById(selectId);
    if(!sel) return;
    var current = sel.value;
    var optionsHtml = '<option value="">Todas las categorías</option>' + sameSportTeams().map(function(t){
      return '<option value="'+escapeAttr(t.name)+'">'+escapeHtml(t.name)+'</option>';
    }).join('');
    if(sel.innerHTML !== optionsHtml){ sel.innerHTML = optionsHtml; sel.value = current; }
  }

  export function buildExerciseFromForm(){
    var team = currentTeam();
    return {
      name: document.getElementById('playNameInput').value.trim(),
      category: document.getElementById('playCategorySelect').value,
      teamCategories: Array.prototype.map.call(document.querySelectorAll('#playTeamCategories input[data-team-cat]:checked'), function(cb){ return cb.dataset.teamCat; }),
      description: document.getElementById('exerciseDescription').value.trim(),
      objective: document.getElementById('exerciseObjective').value.trim(),
      materials: document.getElementById('exerciseMaterials').value.split(',').map(function(x){ return x.trim(); }).filter(Boolean),
      suggestedDurationMinutes: parseInt(document.getElementById('exerciseDuration').value,10) || null,
      diagram: { version:1, frames: JSON.parse(JSON.stringify(state.editFrames)) },
      // Todo separado por club+deporte (ver refreshExercises) — se etiqueta con
      // el club/deporte de la categoría desde la que se guarda.
      clubId: (team && team.clubId) || null,
      sportId: (team && team.sportId) || null
    };
  }

  export function clearExerciseForm(){ ['playNameInput','exerciseDescription','exerciseObjective','exerciseMaterials','exerciseDuration'].forEach(function(id){document.getElementById(id).value='';}); }

  export function newExerciseForm(){
    stopAnimation();
    state.editFrames = [{tokens:[],arrows:[]}];
    state.currentFrameIndex = 0; state.selectedTokenId=null; state.selectedArrowId=null;
    state.undoStack=[]; state.redoStack=[];
    state.editingExerciseId = null; state.editingExerciseSharedId = null;
    clearExerciseForm();
    document.getElementById('playCategorySelect').value = 'Ataque';
    renderPlayTeamCategoryPicker([]);
    setMode('move'); renderFrame();
    showToast('Pizarra en blanco para una jugada nueva');
  }

  export function saveExercise(){
    var name = document.getElementById('playNameInput').value.trim();
    if(!name){ showToast('Ponele un nombre al ejercicio'); return; }
    var data = buildExerciseFromForm();
    var isUpdate = !!state.editingExerciseId;
    var writePromise;
    if(isUpdate){
      data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
      writePromise = exerciseCollection().doc(state.editingExerciseId).update(data);
    } else {
      data.createdBy = { uid: state.user.uid, email: state.user.email };
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
      data.archived = false; data.sharedId = null;
      writePromise = exerciseCollection().add(data).then(function(ref){ state.editingExerciseId = ref.id; });
    }
    writePromise.then(function(){
      if(state.editingExerciseSharedId){
        return publicExerciseCollection().doc(state.editingExerciseSharedId).update(
          Object.assign({}, data, { updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
        ).catch(function(){ /* pudo haber sido borrada aparte; no cortar el guardado personal */ });
      }
    }).then(function(){
      showToast(isUpdate ? 'Ejercicio actualizado' : 'Ejercicio guardado en tu biblioteca');
      return refreshExercises();
    }).then(function(){
      if(state.editingExerciseSharedId) return refreshPublicExercises();
    }).catch(function(e){ fail(e); showToast('No se pudo guardar el ejercicio'); });
  }

  export function shareExercise(){
    var name = document.getElementById('playNameInput').value.trim();
    if(!name){ showToast('Ponele un nombre al ejercicio'); return; }
    if(!confirm('"'+name+'" va a quedar visible en la biblioteca pública para todos los entrenadores del club. ¿Confirmás?')) return;
    var data = buildExerciseFromForm();
    var isNewPersonal = !state.editingExerciseId;
    var personalPromise;
    if(isNewPersonal){
      var newDoc = Object.assign({}, data, {
        createdBy: { uid: state.user.uid, email: state.user.email, photoUrl: state.profilePhotoUrl || null },
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        archived: false
      });
      personalPromise = exerciseCollection().add(newDoc).then(function(ref){ state.editingExerciseId = ref.id; });
    } else {
      personalPromise = exerciseCollection().doc(state.editingExerciseId).update(
        Object.assign({}, data, { updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
      );
    }
    personalPromise.then(function(){
      var team = currentTeam();
      var publicData = Object.assign({}, data, {
        createdBy: { uid: state.user.uid, email: state.user.email, photoUrl: state.profilePhotoUrl || null },
        clubId: (team && team.clubId) || null, sportId: (team && team.sportId) || null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      if(state.editingExerciseSharedId){
        return publicExerciseCollection().doc(state.editingExerciseSharedId).update(publicData);
      }
      publicData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      return publicExerciseCollection().add(publicData).then(function(ref){
        state.editingExerciseSharedId = ref.id;
        return exerciseCollection().doc(state.editingExerciseId).update({ sharedId: ref.id });
      });
    }).then(function(){
      showToast('Compartido en la biblioteca pública');
      return refreshExercises();
    }).then(refreshPublicExercises)
      .catch(function(e){ fail(e); showToast('No se pudo compartir'); });
  }

  export function shareExistingExercise(x){
    if(!confirm('"'+x.name+'" va a quedar visible en la biblioteca pública para todos los entrenadores del club. ¿Confirmás?')) return;
    var team = currentTeam();
    var publicData = {
      name: x.name, category: x.category || 'Ataque', teamCategories: x.teamCategories || [],
      description: x.description || '', objective: x.objective || '', materials: x.materials || [],
      suggestedDurationMinutes: x.suggestedDurationMinutes || null, diagram: x.diagram || { frames: [] },
      createdBy: { uid: state.user.uid, email: state.user.email, photoUrl: state.profilePhotoUrl || null },
      clubId: (team && team.clubId) || null, sportId: (team && team.sportId) || null,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    var pub;
    if(x.sharedId){
      pub = publicExerciseCollection().doc(x.sharedId).update(publicData);
    } else {
      publicData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      pub = publicExerciseCollection().add(publicData).then(function(ref){
        return exerciseCollection().doc(x.id).update({ sharedId: ref.id });
      });
    }
    pub.then(function(){
      showToast('Compartido en la biblioteca pública');
      return refreshExercises();
    }).then(refreshPublicExercises)
      .catch(function(e){ fail(e); showToast('No se pudo compartir'); });
  }

  export function deleteExerciseFully(x){
    var msg = x.sharedId
      ? '¿Borrar "'+x.name+'"? Se va a borrar de tu biblioteca personal y también de la biblioteca pública, porque la habías compartido.'
      : '¿Borrar "'+x.name+'" de tu biblioteca?';
    if(!confirm(msg)) return;
    var p = exerciseCollection().doc(x.id).delete();
    if(x.sharedId){ p = p.then(function(){ return publicExerciseCollection().doc(x.sharedId).delete().catch(function(){}); }); }
    p.then(function(){
      if(state.editingExerciseId === x.id){ state.editingExerciseId = null; state.editingExerciseSharedId = null; }
      showToast('Jugada eliminada');
      return refreshExercises();
    }).then(function(){ if(x.sharedId) return refreshPublicExercises(); })
      .catch(function(e){ fail(e); });
  }

  export function exportExercisePdf(x){
    showToast('Generando PDF...');
    captureDiagramImages(x).then(function(imgs){
      var doc = pdfDoc(), xPos = 40, w = 515, y = 50;
      doc.setFont('helvetica','bold'); doc.setFontSize(16);
      y = pdfWrapped(doc, x.name || 'Ejercicio', xPos, y, w, 20);
      doc.setFont('helvetica','normal'); doc.setFontSize(10.5);
      var metaParts = [
        x.category ? ('Tipo: '+x.category) : '',
        (x.teamCategories && x.teamCategories.length) ? ('Categorías: '+x.teamCategories.join(', ')) : '',
        x.suggestedDurationMinutes ? ('Duración: '+x.suggestedDurationMinutes+' min') : ''
      ].filter(Boolean).join(' · ');
      if(metaParts) y = pdfWrapped(doc, metaParts, xPos, y+2, w, 14);
      if(x.objective) y = pdfWrapped(doc, 'Objetivo: '+x.objective, xPos, y+6, w, 14);
      if(x.materials && x.materials.length) y = pdfWrapped(doc, 'Materiales: '+x.materials.join(', '), xPos, y+2, w, 14);
      if(x.description) y = pdfWrapped(doc, x.description, xPos, y+6, w, 14);
      imgs.forEach(function(img, idx){
        if(!img) return;
        var maxW = 400, ratio = img.h/img.w, imgW = maxW, imgH = maxW*ratio;
        if(y + imgH + 20 > 790){ doc.addPage(); y = 40; }
        if(imgs.length > 1){ doc.setFontSize(9); y = pdfWrapped(doc, 'Página '+(idx+1)+'/'+imgs.length, xPos, y+12, w, 11); doc.setFontSize(10); }
        try{ doc.addImage(img.dataUrl, 'PNG', xPos, y+4, imgW, imgH); }catch(err){}
        y += imgH + 16;
      });
      doc.save(pdfFileName(x.name)+'.pdf');
    });
  }

  // Todo separado por club+deporte, igual que refreshPublicExercises() más
  // abajo: filtro del lado del cliente (agregar un .where() exigiría un
  // índice compuesto junto al orderBy(updatedAt) que ya tiene). Ejercicios
  // viejos sin clubId/sportId (creados antes de este cambio) quedan visibles
  // en cualquier categoría hasta que se vuelvan a guardar — no se pierden,
  // pero de acá en adelante lo nuevo queda separado de verdad.
  export function refreshExercises(){
    return exerciseCollection().orderBy('updatedAt','desc').get().then(function(s){
      var all = s.docs.map(function(d){ var x=d.data(); x.id=d.id; return x; });
      var team = currentTeam();
      state.exercises = (team && team.clubId)
        ? all.filter(function(x){ return (x.clubId===team.clubId && x.sportId===team.sportId) || (!x.clubId && !x.sportId); })
        : all;
      renderPlayTeamCategoryPicker();
      renderExercises();
    }).catch(function(e){ console.error('refreshExercises error:', e); fail(e); });
  }

  // Filtra del lado del cliente por club+deporte de la categoría actual (Etapa 8)
  // en vez de agregar un .where() a la consulta: combinar un where con el
  // orderBy(updatedAt) que ya tenía exigiría un índice compuesto nuevo en
  // Firestore que no se puede crear desde acá. Si la categoría actual todavía no
  // tiene clubId (no se corrió la migración de la Etapa 3), no filtra nada — se
  // ve exactamente igual que antes.
  export function refreshPublicExercises(){
    return publicExerciseCollection().orderBy('updatedAt','desc').get().then(function(s){
      var all = s.docs.map(function(d){ var x=d.data(); x.id=d.id; return x; });
      var team = currentTeam();
      state.publicExercises = (team && team.clubId)
        ? all.filter(function(x){ return x.clubId === team.clubId && x.sportId === team.sportId; })
        : all;
      renderPublicExercises();
    }).catch(function(e){ console.error('refreshPublicExercises error:', e); fail(e); });
  }

  export function exerciseCardHtml(x, opts){
    opts = opts || {};
    var actions = '<button class="btn secondary small" data-a="load">Cargar en pizarra</button>';
    if(opts.pdf) actions += '<button class="btn secondary small" data-a="pdf">PDF</button>';
    if(opts.share) actions += '<button class="btn secondary small" data-a="share">Compartir</button>';
    if(opts.remove) actions += '<button class="btn danger small" data-a="delete">Borrar</button>';
    var cats = (x.teamCategories && x.teamCategories.length) ? x.teamCategories.join(', ') : '';
    var meta = [x.category || 'Sin tipo', cats, (x.suggestedDurationMinutes ? x.suggestedDurationMinutes+' min' : '')].filter(Boolean).join(' · ');
    var byline = (opts.showAuthor && x.createdBy && x.createdBy.email) ? '<div class="meta-line" style="opacity:.7;display:flex;align-items:center;gap:6px;">'+avatarHtml(x.createdBy.email, x.createdBy.photoUrl||null, 18)+'Compartido por '+escapeHtml(x.createdBy.email)+'</div>' : '';
    var desc = x.description ? '<div class="meta-line">'+escapeHtml(x.description)+'</div>' : '';
    var favBtn = opts.favorite ? '<button class="fav-star'+(x.isFavorite?' active':'')+'" data-a="fav" title="'+(x.isFavorite?'Quitar de favoritas':'Marcar como favorita')+'">'+(x.isFavorite?'★':'☆')+'</button>' : '';
    return favBtn+'<div><h3>'+escapeHtml(x.name)+'</h3><div class="meta-line">'+escapeHtml(meta)+'</div>'+byline+desc+'</div><div class="play-actions">'+actions+'</div>';
  }

  export function toggleExerciseFavorite(x){
    x.isFavorite = !x.isFavorite;
    exerciseCollection().doc(x.id).update({ isFavorite: x.isFavorite }).catch(function(e){ fail(e); });
    renderExercises();
  }

  export function renderExercises(){
    var wrap = document.getElementById('playsList');
    if(!wrap) return;
    ensureTeamCategoryFilterOptions('exerciseTeamFilter');
    var list = (state.exercises || []);
    var q = (document.getElementById('exerciseSearch').value || '').toLowerCase();
    var typeCat = document.getElementById('exerciseFilter').value;
    var teamCat = document.getElementById('exerciseTeamFilter').value;
    var favBtn = document.getElementById('exerciseFavFilterBtn');
    var favOnly = favBtn && favBtn.classList.contains('active');
    var visible = list.filter(function(x){
      return (!q || [x.name,x.description,x.objective].join(' ').toLowerCase().indexOf(q)!==-1)
        && (!typeCat || x.category===typeCat)
        && (!teamCat || (x.teamCategories||[]).indexOf(teamCat)!==-1)
        && (!favOnly || x.isFavorite);
    });
    wrap.innerHTML = '';
    visible.forEach(function(x){
      var el = document.createElement('div'); el.className = 'exercise-card';
      el.innerHTML = exerciseCardHtml(x, { pdf:true, share:true, remove:true, favorite:true });
      el.querySelector('[data-a="load"]').onclick = function(){ loadOwnExercise(x); };
      el.querySelector('[data-a="pdf"]').onclick = function(){ exportExercisePdf(x); };
      el.querySelector('[data-a="share"]').onclick = function(){ shareExistingExercise(x); };
      el.querySelector('[data-a="delete"]').onclick = function(){ deleteExerciseFully(x); };
      el.querySelector('[data-a="fav"]').onclick = function(){ toggleExerciseFavorite(x); };
      wrap.appendChild(el);
    });
    var legacy = (state.plays[state.currentTeamId]||[]).filter(function(x){ return !q || String(x.name||'').toLowerCase().indexOf(q)!==-1; });
    if(legacy.length){
      var title = document.createElement('div'); title.className='empty-inline'; title.textContent='Jugadas guardadas anteriormente'; wrap.appendChild(title);
      legacy.forEach(function(x){
        var el = document.createElement('div'); el.className='exercise-card';
        el.innerHTML = '<div><h3>'+escapeHtml(x.name)+'</h3><div class="meta-line">'+escapeHtml(x.category||'Sin categoría')+' · jugada anterior</div></div><div class="play-actions"><button class="btn secondary small" data-a="load">Cargar en pizarra</button></div>';
        el.querySelector('[data-a="load"]').onclick = function(){ loadBoardDiagram(x,false); state.editingExerciseId=null; state.editingExerciseSharedId=null; };
        wrap.appendChild(el);
      });
    }
    if(!visible.length && !legacy.length) wrap.innerHTML = '<div class="empty-inline">Todavía no hay ejercicios o jugadas que coincidan.</div>';
  }

  export function renderPublicExercises(){
    var wrap = document.getElementById('publicPlaysList');
    if(!wrap) return;
    ensureTeamCategoryFilterOptions('publicExerciseTeamFilter');
    var list = (state.publicExercises || []);
    var q = (document.getElementById('publicExerciseSearch').value || '').toLowerCase();
    var typeCat = document.getElementById('publicExerciseFilter').value;
    var teamCat = document.getElementById('publicExerciseTeamFilter').value;
    var visible = list.filter(function(x){
      return (!q || [x.name,x.description,x.objective].join(' ').toLowerCase().indexOf(q)!==-1)
        && (!typeCat || x.category===typeCat)
        && (!teamCat || (x.teamCategories||[]).indexOf(teamCat)!==-1);
    });
    if(!visible.length){ wrap.innerHTML = '<div class="empty-inline">Todavía no hay jugadas compartidas que coincidan.</div>'; return; }
    wrap.innerHTML = '';
    visible.forEach(function(x){
      var el = document.createElement('div'); el.className = 'exercise-card';
      el.innerHTML = exerciseCardHtml(x, { showAuthor:true });
      el.querySelector('[data-a="load"]').onclick = function(){ loadPublicExercise(x); };
      wrap.appendChild(el);
    });
  }

  export function loadOwnExercise(x){
    state.editingExerciseId = x.id;
    state.editingExerciseSharedId = x.sharedId || null;
    loadBoardDiagram(x, true, 'Ejercicio cargado. Al guardar se actualiza (no se duplica).');
    renderPlayTeamCategoryPicker(x.teamCategories || []);
  }

  export function loadPublicExercise(x){
    state.editingExerciseId = null;
    state.editingExerciseSharedId = null;
    var author = (x.createdBy && x.createdBy.email) ? x.createdBy.email : 'otro entrenador';
    loadBoardDiagram(x, true, 'Jugada de '+author+' cargada. Al guardar se crea una copia en tu biblioteca.');
    renderPlayTeamCategoryPicker(x.teamCategories || []);
  }

  export function loadBoardDiagram(source, isExercise, customToast){
    stopAnimation();
    try{
      var diagram = isExercise ? (source.diagram||{}) : source;
      var frames = diagram.frames || (diagram.tokens || diagram.arrows ? [{tokens:diagram.tokens||[],arrows:diagram.arrows||[]}] : []);
      if(!frames.length) throw new Error('El ejercicio no tiene páginas de pizarra guardadas');
      state.editFrames = JSON.parse(JSON.stringify(frames));
      state.currentFrameIndex = 0; state.selectedTokenId = null; state.selectedArrowId = null;
      state.undoStack = []; state.redoStack = [];
      var maxSeq = 0;
      state.editFrames.forEach(function(frame){ (frame.tokens||[]).forEach(function(token){ maxSeq = Math.max(maxSeq, parseInt(String(token.id||'').replace('t',''),10)||0); }); });
      state.tokenSeq = maxSeq+1;
      document.getElementById('playNameInput').value = source.name || '';
      document.getElementById('playCategorySelect').value = source.category || 'Ataque';
      document.getElementById('exerciseDescription').value = isExercise ? (source.description||'') : '';
      document.getElementById('exerciseObjective').value = isExercise ? (source.objective||'') : '';
      document.getElementById('exerciseMaterials').value = isExercise ? (source.materials||[]).join(', ') : '';
      document.getElementById('exerciseDuration').value = isExercise ? (source.suggestedDurationMinutes||'') : '';
      setMode('move'); renderFrame(); switchTab('pizarra'); switchBibSubTab('crear');
      showToast(customToast || ('Pizarra cargada: '+(source.name||'ejercicio')));
    }catch(error){ fail(error); showToast('No se pudo cargar la pizarra.'); }
  }
