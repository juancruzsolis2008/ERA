// ============ Perfil visual por deporte: cancha/campo de la Pizarra y posiciones de jugador. ============
// Única fuente de verdad de "qué cambia entre deportes" en toda la app (ver
// .agents/rules/contexto ERAM.md — antes esto estaba hardcodeado a básquet en
// biblioteca.js y jugadores.js). sportsCatalog/{sportId}.courtType elige cuál
// de estos perfiles usar; si un deporte no tiene courtType seteado (deportes
// creados antes de este cambio, o valor desconocido), se cae a 'basquet' —
// mismo comportamiento de siempre, cero regresión visual.

export var DEFAULT_COURT_TYPE = 'basquet';

export var COURT_TYPE_OPTIONS = [
  { value: 'basquet', label: 'Básquet' },
  { value: 'futbol', label: 'Fútbol' },
  { value: 'voley', label: 'Vóley' },
  { value: 'generico', label: 'Genérico (cancha rectangular, sin marcas)' }
];

// Posiciones que aparecen en la ficha del jugador (Info → Posición). 'generico'
// deja el campo con una sola opción neutra en vez de forzar posiciones que no
// aplican.
export var COURT_POSITIONS = {
  basquet: ['Base', 'Escolta', 'Alero', 'Ala-pívot', 'Pívot'],
  futbol: ['Arquero', 'Defensor', 'Mediocampista', 'Delantero'],
  voley: ['Armador', 'Punta', 'Central', 'Líbero', 'Opuesto'],
  generico: ['Jugador/a']
};

export function positionsForCourtType(courtType){
  return COURT_POSITIONS[courtType] || COURT_POSITIONS[DEFAULT_COURT_TYPE];
}

// Emoji de la ficha "pelota" en la Pizarra, según el mismo courtType que ya
// elige la cancha. 'generico' no tiene pelota de ningún deporte puntual — se
// deja vacío a propósito, la ficha queda como círculo neutro (mismo estilo
// .token.ball, sin emoji adentro).
var BALL_EMOJI = {
  basquet: '🏀',
  futbol: '⚽',
  voley: '🏐',
  generico: ''
};

export function ballEmojiForCourtType(courtType){
  var emoji = BALL_EMOJI[courtType];
  return emoji != null ? emoji : BALL_EMOJI[DEFAULT_COURT_TYPE];
}

// SVG interno (viewBox 0 0 580 348, mismo sistema de coordenadas que ya usan
// fichas/flechas guardadas en % de la cancha — no cambia con el deporte) para
// el editor interactivo de la Pizarra (#courtWrap > svg.lines).
var COURT_SVG_INNER = {
  basquet:
    '<rect x="0" y="0" width="580" height="348" fill="#8C6339"/>'
    + '<rect x="42" y="42" width="496" height="264" fill="#BE8C41"/>'
    + '<rect x="42" y="42" width="496" height="264" fill="none" stroke="#F3EEE3" stroke-width="2.5"/>'
    + '<line x1="290" y1="42" x2="290" y2="306" stroke="#F3EEE3" stroke-width="2"/>'
    + '<circle cx="290" cy="174" r="42" fill="none" stroke="#F3EEE3" stroke-width="2"/>'
    + '<rect x="42" y="132" width="100" height="84" fill="none" stroke="#F3EEE3" stroke-width="2"/>'
    + '<circle cx="142" cy="174" r="32" fill="none" stroke="#F3EEE3" stroke-width="2"/>'
    + '<path d="M 42,58 L 116,58 A 125,125 0 0 1 116,290 L 42,290" fill="none" stroke="#F3EEE3" stroke-width="2"/>'
    + '<circle cx="70" cy="174" r="3" fill="#F3EEE3"/>'
    + '<rect x="438" y="132" width="100" height="84" fill="none" stroke="#F3EEE3" stroke-width="2"/>'
    + '<circle cx="438" cy="174" r="32" fill="none" stroke="#F3EEE3" stroke-width="2"/>'
    + '<path d="M 538,58 L 464,58 A 125,125 0 0 0 464,290 L 538,290" fill="none" stroke="#F3EEE3" stroke-width="2"/>'
    + '<circle cx="510" cy="174" r="3" fill="#F3EEE3"/>',
  futbol:
    '<rect x="0" y="0" width="580" height="348" fill="#1E6B3E"/>'
    + '<rect x="20" y="20" width="540" height="308" fill="none" stroke="#F3EEE3" stroke-width="2.5"/>'
    + '<line x1="290" y1="20" x2="290" y2="328" stroke="#F3EEE3" stroke-width="2"/>'
    + '<circle cx="290" cy="174" r="45" fill="none" stroke="#F3EEE3" stroke-width="2"/>'
    + '<circle cx="290" cy="174" r="3" fill="#F3EEE3"/>'
    + '<rect x="20" y="94" width="88" height="160" fill="none" stroke="#F3EEE3" stroke-width="2"/>'
    + '<rect x="20" y="134" width="36" height="80" fill="none" stroke="#F3EEE3" stroke-width="2"/>'
    + '<circle cx="86" cy="174" r="3" fill="#F3EEE3"/>'
    + '<path d="M 108,140 A 45,45 0 0 1 108,208" fill="none" stroke="#F3EEE3" stroke-width="2"/>'
    + '<rect x="12" y="150" width="8" height="48" fill="none" stroke="#F3EEE3" stroke-width="2"/>'
    + '<rect x="472" y="94" width="88" height="160" fill="none" stroke="#F3EEE3" stroke-width="2"/>'
    + '<rect x="524" y="134" width="36" height="80" fill="none" stroke="#F3EEE3" stroke-width="2"/>'
    + '<circle cx="494" cy="174" r="3" fill="#F3EEE3"/>'
    + '<path d="M 472,140 A 45,45 0 0 0 472,208" fill="none" stroke="#F3EEE3" stroke-width="2"/>'
    + '<rect x="560" y="150" width="8" height="48" fill="none" stroke="#F3EEE3" stroke-width="2"/>',
  voley:
    '<rect x="0" y="0" width="580" height="348" fill="#A85C32"/>'
    + '<rect x="30" y="24" width="520" height="300" fill="none" stroke="#F3EEE3" stroke-width="2.5"/>'
    + '<line x1="203" y1="24" x2="203" y2="324" stroke="#F3EEE3" stroke-width="1.5" stroke-dasharray="4,4"/>'
    + '<line x1="377" y1="24" x2="377" y2="324" stroke="#F3EEE3" stroke-width="1.5" stroke-dasharray="4,4"/>'
    + '<line x1="290" y1="10" x2="290" y2="338" stroke="#F3EEE3" stroke-width="4"/>',
  generico:
    '<rect x="0" y="0" width="580" height="348" fill="#3A5568"/>'
    + '<rect x="20" y="20" width="540" height="308" fill="none" stroke="#F3EEE3" stroke-width="2.5"/>'
};

export function courtSvgInner(courtType){
  return COURT_SVG_INNER[courtType] || COURT_SVG_INNER[DEFAULT_COURT_TYPE];
}

// Equivalente en <canvas> de lo de arriba, para exportar la animación como
// video (biblioteca.js drawCourtBg). sx/sy escalan del viewBox (580x348) al
// tamaño real del canvas de export (VIDEO_W/VIDEO_H).
var COURT_CANVAS_DRAW = {
  basquet: function(ctx, sx, sy){
    ctx.fillStyle = '#8C6339'; ctx.fillRect(0,0,580*sx,348*sy);
    ctx.fillStyle = '#BE8C41'; ctx.fillRect(42*sx,42*sy,496*sx,264*sy);
    ctx.strokeStyle = '#F3EEE3'; ctx.lineWidth = 2.5;
    ctx.strokeRect(42*sx,42*sy,496*sx,264*sy);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(290*sx,42*sy); ctx.lineTo(290*sx,306*sy); ctx.stroke();
    ctx.beginPath(); ctx.arc(290*sx,174*sy,42*sx,0,Math.PI*2); ctx.stroke();
    ctx.strokeRect(42*sx,132*sy,100*sx,84*sy);
    ctx.beginPath(); ctx.arc(142*sx,174*sy,32*sx,0,Math.PI*2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(42*sx,58*sy); ctx.lineTo(116*sx,58*sy);
    ctx.arc(69.4*sx,174*sy,125*sx,-1.189,1.189);
    ctx.lineTo(42*sx,290*sy);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(70*sx,174*sy,3*sx,0,Math.PI*2); ctx.fillStyle='#F3EEE3'; ctx.fill();
    ctx.strokeRect(438*sx,132*sy,100*sx,84*sy);
    ctx.beginPath(); ctx.arc(438*sx,174*sy,32*sx,0,Math.PI*2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(538*sx,58*sy); ctx.lineTo(464*sx,58*sy);
    ctx.arc(510.6*sx,174*sy,125*sx,Math.PI+1.189,Math.PI-1.189,true);
    ctx.lineTo(538*sx,290*sy);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(510*sx,174*sy,3*sx,0,Math.PI*2); ctx.fillStyle='#F3EEE3'; ctx.fill();
  },
  futbol: function(ctx, sx, sy){
    ctx.fillStyle = '#1E6B3E'; ctx.fillRect(0,0,580*sx,348*sy);
    ctx.strokeStyle = '#F3EEE3'; ctx.lineWidth = 2.5;
    ctx.strokeRect(20*sx,20*sy,540*sx,308*sy);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(290*sx,20*sy); ctx.lineTo(290*sx,328*sy); ctx.stroke();
    ctx.beginPath(); ctx.arc(290*sx,174*sy,45*sx,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(290*sx,174*sy,3*sx,0,Math.PI*2); ctx.fillStyle='#F3EEE3'; ctx.fill();
    ctx.strokeRect(20*sx,94*sy,88*sx,160*sy);
    ctx.strokeRect(20*sx,134*sy,36*sx,80*sy);
    ctx.strokeRect(472*sx,94*sy,88*sx,160*sy);
    ctx.strokeRect(524*sx,134*sy,36*sx,80*sy);
  },
  voley: function(ctx, sx, sy){
    ctx.fillStyle = '#A85C32'; ctx.fillRect(0,0,580*sx,348*sy);
    ctx.strokeStyle = '#F3EEE3'; ctx.lineWidth = 2.5;
    ctx.strokeRect(30*sx,24*sy,520*sx,300*sy);
    ctx.lineWidth = 1.5; ctx.setLineDash([4*sx,4*sy]);
    ctx.beginPath(); ctx.moveTo(203*sx,24*sy); ctx.lineTo(203*sx,324*sy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(377*sx,24*sy); ctx.lineTo(377*sx,324*sy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(290*sx,10*sy); ctx.lineTo(290*sx,338*sy); ctx.stroke();
  },
  generico: function(ctx, sx, sy){
    ctx.fillStyle = '#3A5568'; ctx.fillRect(0,0,580*sx,348*sy);
    ctx.strokeStyle = '#F3EEE3'; ctx.lineWidth = 2.5;
    ctx.strokeRect(20*sx,20*sy,540*sx,308*sy);
  }
};

export function drawCourtForType(ctx, courtType, sx, sy){
  (COURT_CANVAS_DRAW[courtType] || COURT_CANVAS_DRAW[DEFAULT_COURT_TYPE])(ctx, sx, sy);
}
