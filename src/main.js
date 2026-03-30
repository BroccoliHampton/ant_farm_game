// ================================================================
//  MAIN — Entry point: canvas setup, input events, game boot
// ================================================================
import { W, H, GDIRS, K_COLORS, T } from './constants.js';
import { grid, gv, sunX, sunY, sunActive, speedMult, brushSize, currentTool,
         currentEl, isDown, observeMode, savedSpeedMult, boxDrawStart,
         boxTurns, boxAngle,
         setTool, setEl, setBrush, setIsDown, setSpeedMult, setSun,
         setGv, setBox, setObserveMode, setBoxDrawStart, setImageBuffer,
         mutRate, setMutRate, setS } from './state.js';
import { idx, inB, get, erase } from './utils.js';
import { loop, initRenderer } from './sim.js';
import { resetSim, seedLife, randomMap } from './world.js';
import { drawAt, updateUI, updateHoverTip, inspectCell,
         enterObserveMode, exitObserveMode, updateBoxPreview, placeBoxDraw,
         getStampMode, placeStamp, dropHeld,
         showEventToast, openDocs, closeDocs,
         wsSetRain, getProgVoidConfig, getProgCloudConfig } from './ui.js';
import { openLab, closeLab, saveCreature, generateCreature, updateLabHistory,
         updateCustomList, deleteCreature, selectCustomCreature, spawnFromHistory,
         selectLabHistoryCreature, editCreature, toggleIconPicker, selectLabIcon,
         buildElemBehaviorTable, onArchetypeChange, updateLabColorPreview,
         cancelEdit } from './lab.js';

// ── Canvas setup (deferred to DOMContentLoaded for correct measurements) ──
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const wrap = document.getElementById('canvas-wrap');

// Compute S using actual measured available width rather than window.innerWidth - 300
// Defer to after DOM layout so panel widths are resolved
function computeS() {
  const left = document.getElementById('left');
  const right = document.getElementById('right');
  const lw = left ? left.offsetWidth : 130;
  const rw = right ? right.offsetWidth : 150;
  const availW = Math.min(
    window.innerWidth - lw - rw - 20,
    window.innerHeight * 0.88
  );
  return Math.max(2, Math.floor(availW / W));
}

export let S = 4; // sensible default while DOM loads

function initCanvas() {
  S = computeS();
  canvas.width  = W * S;
  canvas.height = H * S;
  wrap.style.width  = (W * S) + 'px';
  wrap.style.height = (H * S) + 'px';
  const id = ctx.createImageData(W * S, H * S);
  const px = new Uint32Array(id.data.buffer);
  setImageBuffer(id, px);
  setS(S);
  initRenderer(canvas, ctx, S);
}

// ── Gravity & rotation ────────────────────────────────────────
function applyRot(d){
  const newTurns = (((boxTurns + d) % 4) + 4) % 4;
  const newAngle = newTurns * 90;
  setBox(newTurns, newAngle);
  setGv(GDIRS[newTurns]);
  wrap.style.transform = `rotate(${newAngle}deg)`;
  document.getElementById('ang').textContent = `${newAngle}°`;
  document.getElementById('hint-text').style.transform = `rotate(${-newAngle}deg)`;
}

// ── canvasToGrid — uses live S value ─────────────────────────
function canvasToGrid(cx, cy) {
  const rect = canvas.getBoundingClientRect();
  return [Math.floor((cx - rect.left) / S), Math.floor((cy - rect.top) / S)];
}
document.getElementById('rcw').addEventListener('click',()=>applyRot(2));
document.getElementById('rccw').addEventListener('click',()=>applyRot(2));

// ================================================================
//  CELL TYPES
//  0-19: abiotic   20-99: kingdom agents   100+: special

// Expose globals needed by inline HTML event handlers
// (onclick="openLab()" etc. defined in index.html)
Object.assign(window, {
  openLab, closeLab, saveCreature, generateCreature, updateLabHistory,
  updateCustomList, deleteCreature, selectCustomCreature, spawnFromHistory,
  selectLabHistoryCreature, editCreature, toggleIconPicker, selectLabIcon,
  buildElemBehaviorTable, onArchetypeChange, updateLabColorPreview, cancelEdit,
  wsSetRain, getProgVoidConfig, getProgCloudConfig,
  openDocs, closeDocs, dropHeld, showEventToast,
  resetSim, seedLife, randomMap,
  // Event handlers called from HTML buttons:
  rotLeft:()=>applyRot(-1), rotRight:()=>applyRot(1),
});

// ── Tool bar ──────────────────────────────────────────────────
document.querySelectorAll('.tbtn[data-tool]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const t=btn.dataset.tool;
    if(t==='observe'){ enterObserveMode(); return; }
    if(observeMode){ exitObserveMode(); }
    document.querySelectorAll('.tbtn[data-tool]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    setTool(t);
    document.getElementById('stamp-picker').style.display=(t==='stamp')?'block':'none';
  });
});

// ── Element picker ────────────────────────────────────────────
// ================================================================
//  TOOL / ELEMENT BUTTONS
// ================================================================
document.querySelectorAll('.tbtn[data-tool]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const tool=btn.dataset.tool;
    if(tool==='observe'){
      if(observeMode)exitObserveMode();
      else enterObserveMode();
      return;
    }
    exitObserveMode();
    currentTool=tool;
    document.querySelectorAll('.tbtn[data-tool]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('stamp-picker').style.display=tool==='stamp'?'block':'none';
  });
});
document.getElementById('bs').addEventListener('input',e=>{brushSize=+e.target.value;document.getElementById('bsv').textContent=brushSize;});
document.getElementById('sp').addEventListener('input',e=>{
  const v=+e.target.value;speedMult=v===0?0:v*0.2;
  document.getElementById('spv').textContent=v===0?'PAUSED':speedMult.toFixed(1)+'x';
  document.getElementById('pause-badge').style.display=v===0?'block':'none';
});
document.getElementById('mu').addEventListener('input',e=>{mutRate=+e.target.value/10000;document.getElementById('muv').textContent=(mutRate*100).toFixed(2)+'%';});

// Element buttons
const ELEMENTS=[
  {cat:'KINGDOMS',key:'seed',        label:'PLANT SEED',   col:'#4aaa22',          tag:'🌱'},
  {cat:null,      key:'ant',         label:'ANT',          col:K_COLORS[T.ANT],          tag:'🐜'},
  {cat:null,      key:'queen',       label:'QUEEN ANT',    col:K_COLORS[T.QUEEN],        tag:'👑'},
  {cat:null,      key:'spider',      label:'SPIDER',       col:K_COLORS[T.SPIDER],       tag:'🕷'},
  {cat:null,      key:'queenSpider', label:'QUEEN SPIDER', col:K_COLORS[T.QUEEN_SPIDER], tag:'🕸👑'},
  {cat:null,      key:'fungi',       label:'FUNGI',        col:K_COLORS[T.FUNGI],        tag:'🍄'},
  {cat:null,      key:'mite',        label:'MITE',         col:K_COLORS[T.MITE],         tag:'🪲'},
  {cat:null,      key:'queenMite',   label:'QUEEN MITE',   col:K_COLORS[T.QUEEN_MITE],   tag:'🪲👑'},
  {cat:'SPECIAL', key:'mutagen', label:'LIFE SEED',  col:'#cc00ee',  tag:'⚛'},
  {cat:null,      key:'cloud',       label:'CLOUD',        col:'#aaccee',  tag:'☁'},
  {cat:null,      key:'bloomCloud',  label:'BLOOM CLOUD',  col:'#881020',  tag:'💥'},
  {cat:null,      key:'progCloud',   label:'PROG CLOUD',   col:'#44aaff',  tag:'⚙☁'},
  {cat:null,      key:'progVoid',    label:'PROG VOID',    col:'#220033',  tag:'⚙▼'},
  {cat:null,      key:'fire',    label:'FIRE',       col:'#ff4400',  tag:'🔥'},
  {cat:null,      key:'lava',    label:'LAVA',       col:'#ff5500',  tag:'ρ8'},
  {cat:'ABIOTIC', key:'sand',    label:'SAND',       col:'#c4a35a',  tag:'ρ5'},
  {cat:null,      key:'clay',    label:'CLAY',       col:'#7a8599',  tag:'ρ5'},
  {cat:null,      key:'stone',   label:'STONE',      col:'#787878',  tag:'ρ7'},
  {cat:null,      key:'wood',    label:'WOOD',       col:'#6e4020',  tag:'ρ4'},
  {cat:null,      key:'ice',     label:'ICE',        col:'#b4e0f0',  tag:'ρ3'},
  {cat:null,      key:'goldSand',label:'GOLD SAND',  col:'#ffc800',  tag:'ρ8'},
  {cat:null,      key:'whiteSand',label:'WHT SAND',  col:'#dcdcd7', tag:'ρ3'},
  {cat:null,      key:'salt',    label:'SALT',       col:'#e0e0e0',  tag:'ρ3'},
  {cat:null,      key:'water',   label:'WATER',      col:'#3c82c8',  tag:'ρ2'},
  {cat:null,      key:'acid',    label:'ACID',       col:'#ddaa00',  tag:'ρ2'},
  {cat:null,      key:'oil',     label:'OIL',        col:'#4a7a28',  tag:'ρ1'},
  {cat:null,      key:'ash',     label:'ASH',        col:'#888880',  tag:'ρ1'},
  {cat:null,      key:'smoke',   label:'SMOKE',      col:'#505050',  tag:'↑'},
  {cat:null,      key:'steam',   label:'STEAM',      col:'#c0d8e8',  tag:'↑'},
  {cat:null,      key:'gunpowder',label:'GUNPOWDER', col:'#504840',  tag:'💥'},
  {cat:null,      key:'wall',    label:'WALL',       col:'#3c3c3c',  tag:'ρ∞'},
];
const el=document.getElementById('elist');
ELEMENTS.forEach(e=>{
  if(e.cat){const c=document.createElement('div');c.className='ecat';c.textContent='— '+e.cat+' —';el.appendChild(c);}
  const btn=document.createElement('button');
  btn.className='ebtn'+(e.key==='sand'?' active':'');
  btn.dataset.el=e.key;
  btn.innerHTML=`<span class="sw" style="background:${e.col}"></span><span class="en">${e.label}</span><span class="et">${e.tag}</span>`;
  btn.addEventListener('click',()=>{
    currentEl=e.key;currentTool='draw';
    document.querySelectorAll('.ebtn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');
    document.querySelectorAll('.tbtn[data-tool]').forEach(b=>b.classList.remove('active'));
    document.getElementById('btn-draw').classList.add('active');
    // Show/hide config panels for special elements
    document.getElementById('pc-panel').style.display=e.key==='progCloud'?'block':'none';
    document.getElementById('pv-panel').style.display=e.key==='progVoid'?'block':'none';
  });
  el.appendChild(btn);
});


// ── Brush size slider ─────────────────────────────────────────
document.getElementById('bs').addEventListener('input',e=>{
  setBrush(parseInt(e.target.value));
  document.getElementById('bsv').textContent=e.target.value;
});

// ── Speed slider ──────────────────────────────────────────────
document.getElementById('sp').addEventListener('input',e=>{
  const v=parseInt(e.target.value);
  const sm=v===0?0:Math.pow(2,(v-5)/2.5);
  setSpeedMult(sm);
  document.getElementById('spv').textContent=sm===0?'PAUSE':sm.toFixed(1)+'x';
});

// ── Mutation slider ───────────────────────────────────────────
document.getElementById('mu').addEventListener('input',e=>{
  const v=parseInt(e.target.value);
  setMutRate(v/10000);
  document.getElementById('muv').textContent=(v/100).toFixed(1)+'%';
});

// ── Canvas pointer events ─────────────────────────────────────
canvas.addEventListener('pointerdown',e=>{
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  setIsDown(true);
  if(e.button===2){ inspectCell(e.clientX,e.clientY); return; }
  if(currentTool==='stamp'){
    const mode=getStampMode();
    if(mode==='box_draw'){
      const [gx,gy]=canvasToGrid(e.clientX,e.clientY);
      setBoxDrawStart({x:gx,y:gy});
      return;
    }
    const[cx,cy]=canvasToGrid(e.clientX,e.clientY);
    placeStamp(cx,cy,mode);
    return;
  }
  drawAt(e.clientX,e.clientY);
});

canvas.addEventListener('pointermove',e=>{
  e.preventDefault();
  updateHoverTip(e.clientX,e.clientY);
  if(!isDown) return;
  if(currentTool==='stamp'){
    const mode=getStampMode();
    if(mode==='box_draw' && boxDrawStart){
      const[gx,gy]=canvasToGrid(e.clientX,e.clientY);
      updateBoxPreview(boxDrawStart.x,boxDrawStart.y,gx,gy);
    }
    return;
  }
  drawAt(e.clientX,e.clientY);
});

canvas.addEventListener('pointerup',e=>{
  if(currentTool==='stamp' && getStampMode()==='box_draw' && boxDrawStart){
    const[gx,gy]=canvasToGrid(e.clientX,e.clientY);
    placeBoxDraw(boxDrawStart.x,boxDrawStart.y,gx,gy);
    setBoxDrawStart(null);
    document.getElementById('box-preview').style.display='none';
  }
  setIsDown(false);
});

canvas.addEventListener('contextmenu',e=>e.preventDefault());

canvas.addEventListener('wheel',e=>{
  e.preventDefault();
  const delta=e.deltaY>0?-1:1;
  const el=document.getElementById('bs');
  el.value=Math.max(1,Math.min(10,parseInt(el.value)+delta));
  setBrush(parseInt(el.value));
  document.getElementById('bsv').textContent=el.value;
},{passive:false});

// ── Sun tool drag ─────────────────────────────────────────────
canvas.addEventListener('pointermove',e=>{
  if(!isDown||currentTool!=='sun') return;
  const[gx,gy]=canvasToGrid(e.clientX,e.clientY);
  setSun(gx,gy);
});

// ── Window resize — reinit canvas on resize ───────────────────
window.addEventListener('resize', ()=>{
  const newS = computeS();
  if(newS !== S){
    S = newS;
    canvas.width  = W * S;
    canvas.height = H * S;
    wrap.style.width  = (W * S) + 'px';
    wrap.style.height = (H * S) + 'px';
    const id2 = ctx.createImageData(W * S, H * S);
    const px2 = new Uint32Array(id2.data.buffer);
    setImageBuffer(id2, px2);
    initRenderer(canvas, ctx, S);
  }
});

// ── Keyboard shortcuts ────────────────────────────────────────
document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return;
  if(e.key==='Escape'){ closeLab(); exitObserveMode(); }
  if(e.key==='r'||e.key==='R'){ resetSim(); seedLife(); }
  if(e.key===' '){
    e.preventDefault();
    const sp=document.getElementById('sp');
    const cur=parseInt(sp.value);
    sp.value=cur===0?5:0;
    sp.dispatchEvent(new Event('input'));
  }
});

// ── Boot — wait for DOM layout so panel sizes are correct ─────
document.addEventListener('DOMContentLoaded', ()=>{
  initCanvas();
  resetSim();
  seedLife();
  requestAnimationFrame(loop);
});
// Fallback if DOMContentLoaded already fired (module may load after)
if(document.readyState==='complete'||document.readyState==='interactive'){
  initCanvas();
  resetSim();
  seedLife();
  requestAnimationFrame(loop);
}
