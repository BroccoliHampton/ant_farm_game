// ================================================================
//  UI — HUD, drawing tools, stamps, inspector, narrator, events
// ================================================================
import { W, H, T, K_COLORS, TIP_LABELS, TIP_COLORS, POP_MAX, POP_GRAPH_MAX} from './constants.js';
import { getS } from './state.js';
import { grid, lightGrid, pheroGrid, POP, POP_HISTORY,  
         gv, sunX, sunY, sunActive, tickCount, speedMult, mutRate, brushSize,
         currentTool, currentEl, isDown, heldMutagen, customCreatures,
         selectedCustom, selectedIsQueen, observeMode, savedSpeedMult,
         ws_rain_active, ws_rain_rate, ws_rain_type_key,
         boxDrawStart, boxAngle, boxTurns, activeEvent, activeEventAge,
         rainActive, acidRainActive,
         setTool, setEl, setBrush, setIsDown, setSpeedMult,
         setSelectedCustom, setObserveMode, setBoxDrawStart,
         setWsRain, setSun, setGv, setBox, setHeldMutagen } from './state.js';
import { idx, inB, get, set, erase, abiotic, agentWithStrain,
         hslToRgb, makeBar, popIncr } from './utils.js';
import { randomGenome, mutateGenome, registerStrain } from './genome.js';

// canvasToGrid — converts client coords to grid coords using live S
function canvasToGrid(cx, cy) {
  const canvas = document.getElementById('c');
  if (!canvas) return [0, 0];
  const rect = canvas.getBoundingClientRect();
  const S = getS();
  return [Math.floor((cx - rect.left) / S), Math.floor((cy - rect.top) / S)];
}

// ── HUD & Population Graph ────────────────────────────────────
export function updateUI(){
  document.getElementById('tick').textContent=tickCount.toLocaleString();
  document.getElementById('era').textContent='ERA: '+getEra();

  // Stats
  const s=document.getElementById('estats');
  const totalPop=Object.values(POP).reduce((a,b)=>a+b,0);
  const strains=[...strainRegistry.values()].length;
  s.innerHTML=[
    ['TOTAL AGENTS',totalPop],['STRAINS',strains],
    ['PLANTS',POP[T.PLANT]],['ANTS',POP[T.ANT]],['QUEENS',POP[T.QUEEN]],
    ['SPIDERS',POP[T.SPIDER]],['FUNGI',POP[T.FUNGI]],['MITES',POP[T.MITE]],
  ].map(([n,v])=>`<div class="statrow"><span class="sname">${n}</span><span class="sval">${v}</span></div>`).join('');

  // Population bars
  const kbarsEl=document.getElementById('kbars');
  const kbarData=[
    [T.PLANT,'PLANT',K_COLORS[T.PLANT]],[T.ANT,'ANT',K_COLORS[T.ANT]],
    [T.QUEEN,'QUEEN',K_COLORS[T.QUEEN]],[T.SPIDER,'SPIDER',K_COLORS[T.SPIDER]],
    [T.FUNGI,'FUNGI',K_COLORS[T.FUNGI]],[T.MITE,'MITE',K_COLORS[T.MITE]],
  ];
  kbarsEl.innerHTML=kbarData.map(([type,name,col])=>{
    const pct=Math.min(100,Math.round(POP[type]/POP_MAX[type]*100));
    return `<div class="kbar-row"><div class="kbar-name" style="color:${col}">${name}</div><div class="kbar-wrap"><div class="kbar-fill" style="width:${pct}%;background:${col}"></div></div><div class="kbar-count">${POP[type]}</div></div>`;
  }).join('');

  // Kingdom ledger
  renderLedger();
  // Population history graph
  drawPopGraph();
  // Custom creature list
  updateCustomList();
}

// ================================================================
//  POPULATION GRAPH
// ================================================================
export function drawPopGraph(){
  const tracker=document.getElementById('pop-tracker');
  if(!tracker)return;

  const series=[
    {t:T.PLANT, name:'PLANT',  col:K_COLORS[T.PLANT]},
    {t:T.ANT,   name:'ANT',    col:K_COLORS[T.ANT]},
    {t:T.QUEEN, name:'QUEEN',  col:K_COLORS[T.QUEEN]},
    {t:T.SPIDER,name:'SPIDER', col:K_COLORS[T.SPIDER]},
    {t:T.FUNGI, name:'FUNGI',  col:K_COLORS[T.FUNGI]},
    {t:T.MITE,  name:'MITE',   col:K_COLORS[T.MITE]},
  ];

  const SW=169, SH=20; // sparkline dimensions

  let html='';
  for(const {t,name,col} of series){
    const hist=POP_HISTORY[t];
    const cur=POP[t];
    const max=POP_MAX[t];
    const pct=Math.min(100,Math.round(cur/max*100));

    // Build SVG polyline points
    let points='';
    if(hist.length>=2){
      const hmax=Math.max(1,...hist);
      for(let i=0;i<hist.length;i++){
        const px=Math.round(i/Math.max(1,hist.length-1)*(SW-2))+1;
        const py=Math.round((1-hist[i]/hmax)*(SH-3))+1;
        points+=`${px},${py} `;
      }
    } else {
      points=`0,${SH-1} ${SW},${SH-1}`;
    }

    html+=`<div style="display:flex;flex-direction:column;gap:2px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:7px;color:${col};letter-spacing:1px;">${name}</span>
        <span style="font-size:7px;color:${col};font-weight:bold;">${cur}</span>
      </div>
      <svg width="${SW}" height="${SH}" style="display:block;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.06);">
        <polyline points="${points}" fill="none" stroke="${col}" stroke-width="1.5" stroke-linejoin="round" opacity="0.9"/>
        <line x1="0" y1="${SH-1}" x2="${SW}" y2="${SH-1}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
      </svg>
    </div>`;
  }
  tracker.innerHTML=html;
} // end drawPopTracker (formerly drawPopGraph)

export function getEra(){
  const total=Object.values(POP).reduce((a,b)=>a+b,0);
  if(tickCount<300)return'PRIMORDIAL';
  if(total===0)return'EXTINCTION';
  if(POP[T.QUEEN]===0&&POP[T.ANT]>0)return'WORKER SWARM';
  if(POP[T.SPIDER]===0)return'ANT DOMINANCE';
  if(POP[T.PLANT]===0&&POP[T.FUNGI]===0)return'BARREN AGE';
  if(Object.values(POP).every(v=>v>5))return'BALANCED ECOSYSTEM';
  if(POP[T.ANT]>150)return'ANT EXPLOSION';
  if(POP[T.SPIDER]>50)return'SPIDER SURGE';
  if(POP[T.FUNGI]>150)return'FUNGAL BLOOM';
  return'DIVERSIFICATION';
}

export function renderLedger(){
  const klist=document.getElementById('klist');
  // Show top 8 most populous strains
  const active=[...strainRegistry.values()].filter(s=>s.pop>0).sort((a,b)=>b.pop-a.pop).slice(0,8);
  klist.innerHTML=active.map(s=>{
    const pct=Math.round(s.pop/Math.max(s.peak,1)*100);
    const kname=K_NAMES[s.type]||'?';
    const hue=KINGDOM_HUE[s.type]||180;
    const col=K_COLORS[s.type]||'#888';
    return `<div class="kl-entry" onclick="openMutPopup(${s.id})" title="Click to inspect genome">
      <div class="kl-name" style="color:${col}">${kname} STRAIN·${s.id}</div>
      <div class="kl-stats">POP:${s.pop} AGE:${tickCount-s.born}</div>
      <div class="kl-bar" style="width:${pct}%;background:${col}"></div>
    </div>`;
  }).join('');
}

// ================================================================
//  MUTATION / GENOME POPUP
// ================================================================

// ── Strain Mutation Popup ─────────────────────────────────────
export function openMutPopup(sid){
  const s=strainRegistry.get(sid);
  if(!s)return;
  const el=document.getElementById('mut-card-content');
  const kname=K_NAMES[s.type]||'?';
  const col=K_COLORS[s.type]||'#888';
  const gnames=['DENSITY','MOBILITY','APPETITE','AGGRESSION','RESILIENCE','REPRO'];
  const gcols=['#ffaa44','#44ffcc','#aaff44','#ff4444','#aaaaaa','#ff44ff'];

  // Gene bars
  const bars=s.genome.map((v,i)=>`
    <div class="gene-row">
      <div class="gene-lbl">${gnames[i]}</div>
      <div class="gene-bar"><div class="gene-fill" style="width:${Math.round(v/255*100)}%;background:${gcols[i]}"></div></div>
      <div class="gene-val">${v}</div>
    </div>`).join('');

  // Trait interpretations
  const g=s.genome;
  const traits=[];
  const interp=(lo,hi,v,labels)=>v<lo?labels[0]:v>hi?labels[2]:labels[1];

  if(s.type===T.PLANT){
    traits.push(`<div class="trait-line">${interp(80,160,g[0],'🌱 <b>Lightweight</b> — floats','🌿 <b>Grounded</b> — normal weight','🪨 <b>Heavy</b> — sinks in water')}</div>`);
    traits.push(`<div class="trait-line">${interp(60,150,g[1],'🐌 <b>Slow grower</b>','🌿 <b>Normal growth</b>','⚡ <b>Fast spreader</b> — colonises quickly')}</div>`);
    traits.push(`<div class="trait-line">${interp(40,140,g[2],'☁ <b>Low light need</b> — thrives in shade','☀ <b>Normal light need</b>','🔆 <b>High light need</b> — must be near sun')}</div>`);
    traits.push(`<div class="trait-line">${interp(50,180,g[5],'🪴 <b>Conservative spreader</b>','🌿 <b>Normal spread rate</b>','🌳 <b>Aggressive coloniser</b> — spreads rapidly')}</div>`);
  } else if(s.type===T.ANT||s.type===T.QUEEN){
    traits.push(`<div class="trait-line">${interp(80,150,g[1],'🐢 <b>Slow ant</b> — low energy cost','🐜 <b>Normal speed</b>','⚡ <b>Fast runner</b> — burns energy quickly')}</div>`);
    traits.push(`<div class="trait-line">${interp(80,160,g[2],'😐 <b>Low appetite</b> — efficient','🍃 <b>Normal hunger</b>','🍖 <b>Voracious</b> — eats plants aggressively')}</div>`);
    traits.push(`<div class="trait-line">${interp(60,150,g[3],'☮ <b>Passive</b> — avoids conflict','⚔ <b>Normal aggression</b>','💢 <b>Aggressive</b> — attacks anything edible')}</div>`);
    traits.push(`<div class="trait-line">${interp(80,180,g[5],'🐘 <b>Rare reproduction</b>','🐜 <b>Normal colony growth</b>','🐇 <b>Rapid breeders</b> — colony expands fast')}</div>`);
  } else if(s.type===T.SPIDER){
    traits.push(`<div class="trait-line">${interp(80,160,g[1],'🕷 <b>Ambush predator</b> — waits patiently','🕸 <b>Normal hunter</b>','🏃 <b>Active stalker</b> — chases prey')}</div>`);
    traits.push(`<div class="trait-line">${interp(60,150,g[3],'☮ <b>Passive</b> — hunts only when starving','🕷 <b>Normal aggression</b>','💀 <b>Deadly aggressor</b> — attacks on sight')}</div>`);
    traits.push(`<div class="trait-line">${interp(80,160,g[4],'💉 <b>Weak venom</b>','☠ <b>Normal venom</b>','🧪 <b>Powerful venom</b> — kills in fewer bites')}</div>`);
    traits.push(`<div class="trait-line">${interp(40,120,g[5],'🕸 <b>Heavy webber</b> — lays much web','🕸 <b>Normal web rate</b>','🦴 <b>Lean predator</b> — rarely webs')}</div>`);
  } else if(s.type===T.FUNGI){
    traits.push(`<div class="trait-line">${interp(60,150,g[1],'🍄 <b>Slow spreader</b>','🍄 <b>Normal spread</b>','🌫 <b>Rapid coloniser</b> — spreads fast in dark')}</div>`);
    traits.push(`<div class="trait-line">${interp(80,160,g[2],'😐 <b>Weak decomposer</b>','🍂 <b>Normal decomposer</b>','💀 <b>Voracious decomposer</b> — eats detritus fast')}</div>`);
    traits.push(`<div class="trait-line">${interp(60,150,g[3],'☀ <b>Light tolerant</b> — less sun damage','🌑 <b>Normal light sensitivity</b>','🌑 <b>Shade obligate</b> — dies quickly in light')}</div>`);
    traits.push(`<div class="trait-line">${interp(60,150,g[5],'💨 <b>Rare spores</b>','🌫 <b>Normal spore release</b>','☁ <b>Heavy sporulator</b> — spreads spores constantly')}</div>`);
  } else if(s.type===T.MITE){
    traits.push(`<div class="trait-line">${interp(80,170,g[1],'🐌 <b>Slow mite</b>','🐜 <b>Normal speed</b>','⚡ <b>Lightning fast</b> — very hard to catch')}</div>`);
    traits.push(`<div class="trait-line">${interp(80,160,g[2],'😐 <b>Low fungi appetite</b>','🍄 <b>Normal appetite</b>','🍄 <b>Fungus fanatic</b> — eats fungi extremely fast')}</div>`);
    traits.push(`<div class="trait-line">${interp(80,180,g[5],'🐘 <b>Slow reproducer</b>','🐜 <b>Normal reproduction</b>','🐇 <b>Rapid breeder</b> — swarm quickly')}</div>`);
  }

  el.innerHTML=`
    <div class="mc-title" style="color:${col}">${kname} STRAIN·${sid}</div>
    <div style="font-size:7px;color:var(--dim);margin-bottom:10px;">BORN T:${s.born} · POP:${s.pop} · PEAK:${s.peak}${s.parentId?` · PARENT:${s.parentId}`:' · PROGENITOR'}</div>
    <div class="mc-sec">GENOME</div>
    ${bars}
    <div class="mc-sec">BEHAVIORAL TRAITS</div>
    ${traits.join('')}
  `;
  document.getElementById('mut-popup').classList.add('open');
}
export function closeMutPopup(){document.getElementById('mut-popup').classList.remove('open');}
document.getElementById('mut-popup').addEventListener('click',e=>{if(e.target===document.getElementById('mut-popup'))closeMutPopup();});

// ================================================================
//  INSPECT
// ================================================================

// ── Cell Inspector & Hover Tip ────────────────────────────────
export function inspectCell(clientX,clientY){
  const [gx,gy]=canvasToGrid(clientX,clientY);
  const p=get(gx,gy);
  const el=document.getElementById('iinfo');
  if(!p){el.textContent=`(${gx},${gy}) — empty`;return;}
  const tname=Object.entries(T).find(([k,v])=>v===p.t)?.[0]||p.t;
  let html=`<b style="color:#fff">(${gx},${gy}) ${tname}</b><br>AGE:${p.age}`;
  if(p.g) html+=`<br>HP:${Math.round(p.hp||0)} E:${Math.round(p.energy||0)}<br>STRAIN:${p.sid}<br>G:[${p.g.join(',')}]`;
  if(p.t===T.WATER||p.t===T.OIL)html+=`<br>LIGHT:${lightGrid[idx(gx,gy)].toFixed(2)}`;
  el.innerHTML=html;
}

// ================================================================
//  HOVER TOOLTIP
// ================================================================

export function updateHoverTip(clientX, clientY){
  const tip=document.getElementById('hover-tip');
  const[gx,gy]=canvasToGrid(clientX,clientY);
  const p=get(gx,gy);

  let html='';
  if(!p){
    tip.style.display='none';
    return;
  }

  const label=TIP_LABELS[p.t]||`TYPE:${p.t}`;
  const col=TIP_COLORS[p.t]||'#888';

  html=`<div class="ht-type" style="color:${col}">${label}</div>`;

  if(p.g){
    // Kingdom agent
    const strain=strainRegistry.get(p.sid);
    const hp=Math.round(p.hp||0);
    const en=Math.round(p.energy||0);
    const hpBar=makeBar(hp,100,col);
    const enBar=makeBar(en,255,'#00ff88');
    html+=`<div class="ht-stat">HP ${hpBar} ${hp}  E ${enBar} ${en}</div>`;
    html+=`<div class="ht-stat">AGE: ${p.age}</div>`;
    if(strain) html+=`<div class="ht-strain">STRAIN·${p.sid}  POP:${strain.pop}</div>`;
  } else {
    // Abiotic
    if(p.t===T.FIRE)    html+=`<div class="ht-stat">TTL: ${p.ttl||0}</div>`;
    if(p.t===T.WEB)     html+=`<div class="ht-stat">DECAY: ${p.ttl||0}</div>`;
    if(p.t===T.MUTAGEN) html+=`<div class="ht-stat">ENERGY: ${Math.round(p.energy||0)}</div>`;
    if(p.t===T.WATER||p.t===T.OIL) html+=`<div class="ht-stat">LIGHT: ${(lightGrid[idx(gx,gy)]*100|0)}%</div>`;
    if(p.t===T.FROGSTONE){
      const hpBar=makeBar(p.hp||0,255,'#88cc44');
      html+=`<div class="ht-stat">HP ${hpBar} ${Math.round(p.hp||0)}</div>`;
      if(p.isHub){
        const sd=Math.sqrt(Math.pow(sunX-gx,2)+Math.pow(sunY-gy,2))||1;
        const sp=Math.max(0,Math.min(1,1-(sd/(W*0.45))));
        const range=Math.floor(8+sp*14);
        const reload=Math.floor(35-sp*26);
        html+=`<div class="ht-stat" style="color:#88cc44">🌞 ${(sp*100|0)}% · RANGE:${range} · RELOAD:${reload}t</div>`;
        if(p.tongue) html+=`<div class="ht-stat" style="color:#ff60aa">👅 TONGUE ACTIVE</div>`;
      } else {
        html+=`<div class="ht-stat" style="color:#556644">DOME CELL</div>`;
      }
    }
    html+=`<div class="ht-stat" style="color:#303050">(${gx},${gy})</div>`;
  }

  tip.innerHTML=html;
  tip.style.display='block';

  // Position tooltip: offset from cursor, keep inside viewport
  const tw=tip.offsetWidth+4, th=tip.offsetHeight+4;
  let tx=clientX+14, ty=clientY-6;
  if(tx+tw>window.innerWidth)  tx=clientX-tw-6;
  if(ty+th>window.innerHeight) ty=clientY-th-6;
  if(ty<0) ty=4;
  tip.style.left=tx+'px';
  tip.style.top=ty+'px';
}



// ── Draw Tool ────────────────────────────────────────────────
export function drawAt(cx,cy){
  const[gx,gy]=canvasToGrid(cx,cy);
  // Observe mode — show tooltip instead of drawing
  if(observeMode){ showObserveTooltip(cx,cy,get(gx,gy),gx,gy); return; }
  if(currentTool==='sun'){sunX=Math.max(0,Math.min(W-1,gx));sunY=Math.max(0,Math.min(H-1,gy));sunActive=true;return;}
  if(currentTool==='stamp'){
    const sel=document.getElementById('stamp-sel').value;
    if(sel!=='box_draw') placeStamp(gx,gy,sel);
    return;
  }
  if(currentTool==='observe'){inspectCell(cx,cy);return;}
  if(currentTool==='grab'){
    if(heldMutagen){
      // Place held mutagen at click position
      if(inB(gx,gy)&&!get(gx,gy)){
        grid[idx(gx,gy)]=heldMutagen;
        heldMutagen=null;
        document.getElementById('held-panel').style.display='none';
      }
    } else {
      // Pick up mutagen at click position
      const p=get(gx,gy);
      if(p&&p.t===T.MUTAGEN){
        heldMutagen=p;
        grid[idx(gx,gy)]=null;
        document.getElementById('held-panel').style.display='block';
        const r=p.recipe||[128,128,128,128,128,128];
        document.getElementById('held-info').textContent=`RECIPE: [${r.map(v=>v.toString(16).padStart(2,'0')).join(' ')}]\nFROZEN: ${p.frozen?'YES':'NO'}`;
      }
    }
    return;
  }

  for(let dy=-brushSize;dy<=brushSize;dy++){
    for(let dx=-brushSize;dx<=brushSize;dx++){
      if(dx*dx+dy*dy>brushSize*brushSize)continue;
      const px=gx+dx,py=gy+dy;
      if(!inB(px,py))continue;
      if(currentTool==='erase'){erase(px,py);continue;}

      const cur=grid[idx(px,py)];
      if(cur&&isWall(cur.t))continue;
      if(cur?.g){popDecr(cur);}

      switch(currentEl){
        case 'sand':       grid[idx(px,py)]=abiotic(T.SAND);break;
        case 'clay':       grid[idx(px,py)]={t:T.CLAY,age:0,settled:0};break;
        case 'goldSand':   grid[idx(px,py)]=abiotic(T.GOLD_SAND);break;
        case 'whiteSand':  grid[idx(px,py)]=abiotic(T.WHITE_SAND);break;
        case 'water':      grid[idx(px,py)]=abiotic(T.WATER);break;
        case 'oil':        grid[idx(px,py)]=abiotic(T.OIL);break;
        case 'detritus':   grid[idx(px,py)]=abiotic(T.DETRITUS);break;
        case 'wall':       grid[idx(px,py)]={t:T.WALL,age:0};break;
        case 'cloud':      grid[idx(px,py)]={t:T.CLOUD,age:0,charge:120,phase:0};break;
        case 'bloomCloud': grid[idx(px,py)]={t:T.BLOOM_CLOUD,age:0};break;
        case 'progCloud':  {const cfg=getProgCloudConfig();grid[idx(px,py)]={t:T.PROG_CLOUD,age:0,phase:0,emitType:cfg.type,emitRate:cfg.rate};break;}
        case 'progVoid':   {const vcfg=getProgVoidConfig();grid[idx(px,py)]={t:T.PROG_VOID,age:0,phase:0,destroyType:vcfg.type,radius:vcfg.radius};break;}
        case 'fire':       grid[idx(px,py)]={t:T.FIRE,age:0,ttl:30};break;
        case 'lava':       grid[idx(px,py)]={t:T.LAVA,age:0,ttl:500};break;
        case 'stone':      grid[idx(px,py)]={t:T.STONE,age:0};break;
        case 'ice':        grid[idx(px,py)]={t:T.ICE,age:0,ttl:800};break;
        case 'steam':      grid[idx(px,py)]={t:T.STEAM,age:0,ttl:80};break;
        case 'smoke':      grid[idx(px,py)]={t:T.SMOKE,age:0,ttl:60};break;
        case 'wood':       grid[idx(px,py)]={t:T.WOOD,age:0};break;
        case 'ash':        grid[idx(px,py)]={t:T.ASH,age:0};break;
        case 'acid':       grid[idx(px,py)]={t:T.ACID,age:0,ttl:300};break;
        case 'gunpowder':  grid[idx(px,py)]={t:T.GUNPOWDER,age:0};break;
        case 'salt':       grid[idx(px,py)]={t:T.SALT,age:0};break;
        case 'mutagen': {
          // Life Seed drops a burst of random organisms at cursor + scatter several seeds
          const seedTypes=[T.ANT,T.PLANT,T.SPIDER,T.FUNGI,T.MITE,T.QUEEN,T.QUEEN_SPIDER,T.QUEEN_MITE];
          const pick=arr=>arr[Math.floor(Math.random()*arr.length)];
          // Drop 3-6 random organisms scattered in radius
          const burstCount=3+Math.floor(Math.random()*4);
          for(let b=0;b<burstCount;b++){
            const ox=px+Math.floor((Math.random()-0.5)*10);
            const oy=py+Math.floor((Math.random()-0.5)*10);
            if(!inB(ox,oy)||get(ox,oy))continue;
            const t=pick(seedTypes);
            const g=randomGenome(t);
            const s=registerStrain(t,g);
            grid[idx(ox,oy)]=agentWithStrain(t,g,s,{energy:150});
            popIncr({t,sid:s});
          }
          // Also drop 2-3 life seeds nearby to keep mutating
          const seedCount=2+Math.floor(Math.random()*2);
          for(let b=0;b<seedCount;b++){
            const ox=px+Math.floor((Math.random()-0.5)*8);
            const oy=py+Math.floor((Math.random()-0.5)*8);
            if(inB(ox,oy)&&!get(ox,oy))
              grid[idx(ox,oy)]={t:T.MUTAGEN,age:0,energy:120,recipe:[128,128,128,128,128,128]};
          }
          break;
        }
        case 'seed':{const g=randomGenome(T.PLANT);const s=registerStrain(T.PLANT,g);grid[idx(px,py)]={t:T.SEED,age:0,g,sid:s,energy:120};break;}
        case 'plant':{const g=randomGenome(T.PLANT);const s=registerStrain(T.PLANT,g);grid[idx(px,py)]=agentWithStrain(T.PLANT,g,s,{energy:120});POP[T.PLANT]++;break;}
        case 'ant':{const g=randomGenome(T.ANT);const s=registerStrain(T.ANT,g);grid[idx(px,py)]=agentWithStrain(T.ANT,g,s,{energy:150});POP[T.ANT]++;break;}
        case 'queen':{const g=randomGenome(T.QUEEN);const s=registerStrain(T.QUEEN,g);grid[idx(px,py)]=agentWithStrain(T.QUEEN,g,s,{energy:200});POP[T.QUEEN]++;break;}
        case 'spider':{const g=randomGenome(T.SPIDER);const s=registerStrain(T.SPIDER,g);grid[idx(px,py)]=agentWithStrain(T.SPIDER,g,s,{energy:150});POP[T.SPIDER]++;break;}
        case 'queenSpider':{const g=randomGenome(T.QUEEN_SPIDER);const s=registerStrain(T.QUEEN_SPIDER,g);grid[idx(px,py)]=agentWithStrain(T.QUEEN_SPIDER,g,s,{energy:200});POP[T.QUEEN_SPIDER]++;break;}
        case 'fungi':{const g=randomGenome(T.FUNGI);const s=registerStrain(T.FUNGI,g);grid[idx(px,py)]=agentWithStrain(T.FUNGI,g,s,{energy:100});POP[T.FUNGI]++;break;}
        case 'mite':{const g=randomGenome(T.MITE);const s=registerStrain(T.MITE,g);grid[idx(px,py)]=agentWithStrain(T.MITE,g,s,{energy:120});POP[T.MITE]++;break;}
        case 'queenMite':{const g=randomGenome(T.QUEEN_MITE);const s=registerStrain(T.QUEEN_MITE,g);grid[idx(px,py)]=agentWithStrain(T.QUEEN_MITE,g,s,{energy:180});POP[T.QUEEN_MITE]++;break;}
        default:{
          // Custom lab creatures
          if(currentEl.startsWith('customqueen_')){
            const id=parseInt(currentEl.split('_')[1]);
            if(customCreatures.has(id)){
              const c=spawnCustomCell(id,px,py,true);
              if(c){grid[idx(px,py)]=c;POP[id+100]=(POP[id+100]||0)+1;}
            }
          } else if(currentEl.startsWith('custom_')){
            const id=parseInt(currentEl.split('_')[1]);
            if(customCreatures.has(id)){
              const c=spawnCustomCell(id,px,py,false);
              if(c){grid[idx(px,py)]=c;POP[id]=(POP[id]||0)+1;}
            }
          }
        }
      }
    }
  }
}

// ================================================================
//  BOX DRAW — drag to size a hollow box
// ================================================================


// ── Stamp Tool ───────────────────────────────────────────────
export function getStampMode(){ return document.getElementById('stamp-sel').value; }

export function updateBoxPreview(sx,sy,ex,ey){
  // sx,sy,ex,ey are pixel coords relative to canvas element
  const preview=document.getElementById('box-preview');
  const x1=Math.min(sx,ex),y1=Math.min(sy,ey);
  const x2=Math.max(sx,ex),y2=Math.max(sy,ey);
  preview.style.left=x1+'px'; preview.style.top=y1+'px';
  preview.style.width=(x2-x1)+'px'; preview.style.height=(y2-y1)+'px';
  preview.style.display='block';
}

export function placeBoxDraw(g1x,g1y,g2x,g2y){
  // Place hollow box walls between two grid corners
  const x1=Math.min(g1x,g2x),y1=Math.min(g1y,g2y);
  const x2=Math.max(g1x,g2x),y2=Math.max(g1y,g2y);
  for(let x=x1;x<=x2;x++){
    if(inB(x,y1)) grid[idx(x,y1)]={t:T.WALL,age:0};
    if(inB(x,y2)) grid[idx(x,y2)]={t:T.WALL,age:0};
  }
  for(let y=y1+1;y<y2;y++){
    if(inB(x1,y)) grid[idx(x1,y)]={t:T.WALL,age:0};
    if(inB(x2,y)) grid[idx(x2,y)]={t:T.WALL,age:0};
  }
}

export function clientToCanvasLocal(cx,cy){
  // Returns pixel position relative to canvas element (accounting for rotation)
  const rect=canvas.getBoundingClientRect();
  const dx=cx-rect.left-rect.width/2, dy=cy-rect.top-rect.height/2;
  const rad=-boxAngle*Math.PI/180;
  const rx=dx*Math.cos(rad)-dy*Math.sin(rad), ry=dx*Math.sin(rad)+dy*Math.cos(rad);
  return[rx+rect.width/2, ry+rect.height/2];
}

// Update stamp hint text
document.getElementById('stamp-sel').addEventListener('change',()=>{
  const isBox=getStampMode()==='box_draw';
  document.getElementById('stamp-hint').style.display=isBox?'block':'none';
  document.getElementById('box-preview').style.display='none';
  boxDrawStart=null;
});


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



// ================================================================
//  STAMPS
// ================================================================
export function buildRect(w,h){
  const c=[];
  for(let x=0;x<w;x++){c.push([x,0]);c.push([x,h-1]);}
  for(let y=1;y<h-1;y++){c.push([0,y]);c.push([w-1,y]);}
  return c.map(([x,y])=>[x-Math.floor(w/2),y-Math.floor(h/2)]);
}
const STAMPS={
  box:buildRect(20,14),
  bowl:(()=>{const c=[];for(let x=0;x<20;x++)c.push([x,9]);for(let y=0;y<9;y++){c.push([0,y]);c.push([19,y]);}return c.map(([x,y])=>[x-10,y-4]);})(),
  tube:buildRect(5,20),
  funnel:(()=>{const c=[];for(let y=0;y<12;y++){const o=Math.floor(y*4/12);c.push([-9+o,y]);c.push([9-o,y]);}for(let x=-9;x<=9;x++)if(x!==0)c.push([x,11]);return c;})(),
  divider:(()=>{const c=[];for(let x=-18;x<=18;x++)c.push([x,0]);return c;})(),
  cross:(()=>{const c=[];for(let x=-18;x<=18;x++)c.push([x,0]);for(let y=-18;y<=18;y++)c.push([0,y]);return c;})(),
};
// ================================================================
//  GRAB / HELD MUTAGEN
// ================================================================

export function dropHeld(){
  heldMutagen=null;
  document.getElementById('held-panel').style.display='none';
}

// ================================================================
//  NARRATOR ENGINE
// ================================================================
let narratorTick=0;
const NARRATOR_LINES=[];
let lastNarratorState={};


// ── Narrator ─────────────────────────────────────────────────
export function updateNarrator(){
  narratorTick++;
  if(narratorTick%150!==0) return; // update every ~150 ticks

  const total=Object.values(POP).reduce((a,b)=>a+b,0);
  const lines=[];
  const s=lastNarratorState;

  // Opening line if just starting
  if(tickCount<500&&total>0&&!s.introduced){
    lines.push('Life stirs in the terrarium. The first organisms test their new world.');
    s.introduced=true;
  }

  // Population events
  if(POP[T.ANT]>150&&!(s.antFlood)) {lines.push('The ants have exploded in number — their trails crisscross every surface.');s.antFlood=true;}
  if(POP[T.ANT]<5&&s.antFlood)     {lines.push('The ant population has collapsed. Silence spreads across the sand.');s.antFlood=false;}
  if(POP[T.SPIDER]>40&&!(s.spiderSurge)){lines.push('Spiders multiply, weaving their webs between the colonies.');s.spiderSurge=true;}
  if(POP[T.FUNGI]>120&&!(s.fungalBloom)){lines.push('Fungal networks spread through the dark, decomposing everything they touch.');s.fungalBloom=true;}
  if(POP[T.FUNGI]<5&&s.fungalBloom){lines.push('The fungal bloom recedes. The mites hunger.');s.fungalBloom=false;}
  if(POP[T.QUEEN]===0&&POP[T.ANT]>10&&!(s.queenless)){lines.push('No queen remains. The worker ants wander without purpose.');s.queenless=true;}
  if(POP[T.QUEEN]>0&&s.queenless){lines.push('A new queen has crowned herself. The colony finds direction again.');s.queenless=false;}
  if(POP[T.PLANT]>200&&!(s.plantOvergrowth)){lines.push('Plants have overtaken the ground — a green tide filling every gap.');s.plantOvergrowth=true;}
  if(POP[T.PLANT]<5&&total>20){lines.push('The plants are nearly gone. Without them, the food web frays.');}
  if(total===0){lines.push('The terrarium is silent. All life has perished.');}

  // Predator-prey tension
  if(POP[T.SPIDER]>20&&POP[T.ANT]>50){lines.push('Spiders stalk the ant corridors. The hunt is on.');}
  if(POP[T.MITE]>80&&POP[T.FUNGI]>60){lines.push('Mites swarm through the fungal fields, reducing them to nothing.');}

  // Balance observation
  if(Object.values(POP).filter(v=>v>5).length>=5){lines.push('Five kingdoms flourish together — a rare and fragile balance.');}

  // Random atmospheric lines
  const atm=[
    'Detritus accumulates in the deep zones, feeding tomorrow\'s growth.',
    'The light shifts across the board. Shadow and photosynthesis compete.',
    'A mutation ripples through one colony, changing it forever.',
    'Web strands catch the light between the walls.',
    'The sand settles. The living do not.',
  ];
  if(lines.length===0&&total>0) lines.push(atm[Math.floor(Math.random()*atm.length)]);

  if(lines.length){
    NARRATOR_LINES.unshift({tick:tickCount,text:lines[0]});
    if(NARRATOR_LINES.length>6)NARRATOR_LINES.length=6;
    const el=document.getElementById('narrator');
    if(el) el.innerHTML=NARRATOR_LINES.map((l,i)=>
      `<div style="opacity:${Math.max(0.3,1-i*0.15)};margin-bottom:4px;color:${i===0?'var(--text)':'var(--dim)'}">${i===0?'':'<span style="color:var(--border)">▸ </span>'}${l.text}</div>`
    ).join('');
  }
}


// ── Place Stamp ──────────────────────────────────────────────
export function placeStamp(cx,cy,name){
  if(name==='weatherstation'){
    if(inB(cx,cy)){
      grid[idx(cx,cy)]={t:T.WEATHER_STATION,age:0,phase:0};
      // Show the weather station panel
      document.getElementById('ws-panel').style.display='block';
    }
    return;
  }
  if(name==='frogstone'){
    // Place a 10×10 sphere of FROGSTONE cells. Hub = center cell.
    const R=5;
    const cx2=cx, cy2=cy;
    for(let dy=-R;dy<=R;dy++){
      for(let dx=-R;dx<=R;dx++){
        if(dx*dx+dy*dy<=R*R){
          const px=cx2+dx, py=cy2+dy;
          if(inB(px,py)){
            const isHub=(dx===0&&dy===0);
            grid[idx(px,py)]={
              t:T.FROGSTONE,age:0,phase:0,
              hp:200,tongue:null,
              isHub,
              hubX:cx2, hubY:cy2
            };
          }
        }
      }
    }
    return;
  }
  if(name==='fridge'){
    // Fridge: hollow 14×10 box of FRIDGE_WALL cells; registers zone inside
    const W2=14,H2=10;
    const cells=[];
    for(let x=0;x<W2;x++){cells.push([x,0]);cells.push([x,H2-1]);}
    for(let y=1;y<H2-1;y++){cells.push([0,y]);cells.push([W2-1,y]);}
    const ox=cx-Math.floor(W2/2),oy=cy-Math.floor(H2/2);
    for(const[dx,dy]of cells){
      const px=ox+dx,py=oy+dy;
      if(inB(px,py))grid[idx(px,py)]={t:T.FRIDGE_WALL,age:0};
    }
    // Register interior as fridge zone
    fridgeZones.push({x1:ox,y1:oy,x2:ox+W2-1,y2:oy+H2-1});
    return;
  }
  const cells=STAMPS[name];
  if(!cells)return;
  for(const[dx,dy]of cells){
    const px=cx+dx,py=cy+dy;
    if(inB(px,py))grid[idx(px,py)]={t:T.WALL,age:0};
  }
}

// ================================================================
//  SEED ECOSYSTEM & RESET
// ================================================================

// ── Weather Station UI ───────────────────────────────────────
export function wsSetRain(active){
  ws_rain_active=active;
  if(active){
    ws_rain_type_key=document.getElementById('ws-type').value;
    ws_rain_rate=parseInt(document.getElementById('ws-rate').value);
  }
  document.getElementById('ws-status').textContent=active?`ACTIVE — ${ws_rain_type_key.toUpperCase()} · ${ws_rain_rate}/tick`:'IDLE';
  document.getElementById('ws-start').textContent=active?'◉ RUNNING':'▶ START';
  document.getElementById('ws-start').style.background=active?'rgba(255,100,0,0.15)':'rgba(0,255,136,0.1)';
}

export function getProgVoidConfig(){
  const typeMap={water:T.WATER,acid:T.ACID,sand:T.SAND,lava:T.LAVA,ice:T.ICE,salt:T.SALT,smoke:T.SMOKE,steam:T.STEAM,ash:T.ASH,detritus:T.DETRITUS,gunpowder:T.GUNPOWDER,fire:T.FIRE,oil:T.OIL,gold_sand:T.GOLD_SAND,cloud:T.CLOUD,bloom_cloud:T.BLOOM_CLOUD,sand_all:'sand_all',agents:'agents'};
  const key=document.getElementById('pv-type')?.value||'water';
  const radius=parseInt(document.getElementById('pv-radius')?.value||2);
  return{type:typeMap[key]??T.WATER,radius};
}
export function getProgCloudConfig(){
  const typeMap={water:T.WATER,acid:T.ACID,sand:T.SAND,lava:T.LAVA,ice:T.ICE,salt:T.SALT,smoke:T.SMOKE,steam:T.STEAM,ash:T.ASH,detritus:T.DETRITUS,gunpowder:T.GUNPOWDER,fire:T.FIRE,oil:T.OIL,gold_sand:T.GOLD_SAND};
  const key=document.getElementById('pc-type')?.value||'water';
  const rate=parseInt(document.getElementById('pc-rate')?.value||30);
  return{type:typeMap[key]||T.WATER,rate};
}

document.addEventListener('DOMContentLoaded',()=>{
  const rateEl=document.getElementById('ws-rate');
  if(rateEl) rateEl.addEventListener('input',function(){
    document.getElementById('ws-rate-val').textContent=this.value;
    if(ws_rain_active){ws_rain_rate=parseInt(this.value);}
  });
  const pcRate=document.getElementById('pc-rate');
  if(pcRate) pcRate.addEventListener('input',function(){
    document.getElementById('pc-rate-val').textContent=this.value+' ticks';
  });
  const pvRadius=document.getElementById('pv-radius');
  if(pvRadius) pvRadius.addEventListener('input',function(){
    document.getElementById('pv-radius-val').textContent=this.value;
  });
});


// ── Docs + Toast ─────────────────────────────────────────────
// ================================================================
export function openDocs(){ document.getElementById('docs-overlay').classList.add('open'); }
export function closeDocs(){ document.getElementById('docs-overlay').classList.remove('open'); }
document.getElementById('docs-overlay').addEventListener('click',e=>{
  if(e.target===document.getElementById('docs-overlay'))closeDocs();
});

// ================================================================
//  EVENT TOAST
// ================================================================
let toastTimer=null;
export function showEventToast(name, desc){
  const toast=document.getElementById('event-toast');
  document.getElementById('et-name').textContent=name;
  document.getElementById('et-desc').textContent=desc;
  toast.classList.add('show');
  if(toastTimer) clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.classList.remove('show'), 4500);
}

// ── Random Events ────────────────────────────────────────────
// ================================================================
//  CREATURE LAB — Custom organisms with generated traits
// ================================================================


// Custom creature state
// Observe mode state

// ================================================================
//  PROCEDURAL CREATURE INTERACTION GENERATOR
//  Generates a unique interaction profile for every element and kingdom
//  based on the creature's traits. Used in stepCustom and observe.
// ================================================================

// ── Observe Mode ─────────────────────────────────────────────
export function enterObserveMode(){
  observeMode=true; savedSpeedMult=speedMult; speedMult=0;
  document.getElementById('sp').value=0;
  document.getElementById('spv').textContent='PAUSED';
  document.getElementById('pause-badge').style.display='none';
  document.getElementById('observe-badge').style.display='block';
  document.getElementById('canvas-wrap').classList.add('observe-mode');
  document.getElementById('btn-observe').classList.add('observe-active');
}

export function exitObserveMode(){
  if(!observeMode)return;
  observeMode=false; speedMult=savedSpeedMult;
  const v=Math.round(speedMult/0.2);
  document.getElementById('sp').value=v;
  document.getElementById('spv').textContent=speedMult===0?'PAUSED':speedMult.toFixed(1)+'x';
  document.getElementById('observe-badge').style.display='none';
  document.getElementById('canvas-wrap').classList.remove('observe-mode');
  document.getElementById('btn-observe').classList.remove('observe-active');
  document.getElementById('observe-tooltip').classList.remove('visible');
}

export function showObserveTooltip(mx,my,p,gx,gy){
  const tip=document.getElementById('observe-tooltip');
  let html='';

  if(!p){
    html=`<div class="ot-empty">Empty (${gx},${gy})<br>Light: ${(lightGrid[idx(gx,gy)]*100).toFixed(0)}%<br>Phero: ${(pheroGrid[idx(gx,gy)]*100).toFixed(0)}%</div>`;

  } else if(p.customType){
    const def=customCreatures.get(p.customType);
    if(def){
      const ix=def.interactions||{};
      const col=`hsl(${def.hue},${def.sat}%,65%)`;
      html=`<div class="ot-header"><span class="ot-icon" style="background:hsl(${def.hue},${def.sat}%,${def.lit}%);border-radius:4px;padding:3px;">${def.icon}</span><div><div class="ot-title" style="color:${col}">${def.name}</div><div class="ot-subtitle">${p.isQueen?'👑 QUEEN':'WORKER'} · ${def.movement.icon} ${def.movement.name.toUpperCase()}</div></div></div>`;

      // Vitals
      html+=`<div class="ot-section">VITALS</div>`;
      html+=`<div class="ot-bar"><span class="ot-bar-label">HP</span><div class="ot-bar-track"><div class="ot-bar-fill" style="width:${Math.round((p.hp||0)/(p.isQueen?def.size.hp*2:def.size.hp)*100)}%;background:#ff4455"></div></div><span class="ot-bar-val">${Math.round(p.hp||0)}</span></div>`;
      html+=`<div class="ot-bar"><span class="ot-bar-label">ENERGY</span><div class="ot-bar-track"><div class="ot-bar-fill" style="width:${Math.round((p.energy||0)/255*100)}%;background:#00ff88"></div></div><span class="ot-bar-val">${Math.round(p.energy||0)}</span></div>`;
      html+=`<div class="ot-row"><span class="otr-name">SIZE</span><span class="otr-val">${def.size.name}</span></div>`;
      html+=`<div class="ot-row"><span class="otr-name">DIET</span><span class="otr-val">${def.diet.icon} ${def.diet.name}</span></div>`;
      html+=`<div class="ot-row"><span class="otr-name">REPRO</span><span class="otr-val">${def.reproduction.name}</span></div>`;
      if(def.specials.length) html+=`<div class="ot-row"><span class="otr-name">TRAITS</span><span class="otr-val">${def.specials.map(s=>s.icon+' '+s.name).join(', ')}</span></div>`;

      // Elemental interactions
      html+=`<div class="ot-section">ELEMENT REACTIONS</div>`;
      const elemPairs=[
        ['🔥','fire',ix.fire],['🌋','lava',ix.lava],['💧','water',ix.water],['🧊','ice',ix.ice],
        ['🟢','acid',ix.acid],['🧂','salt',ix.salt],['💨','smoke',ix.smoke],['🌊','steam',ix.steam],
        ['🪨','stone',ix.stone],['🌱','clay',ix.clay],['🏜️','sand',ix.sand],
        ['🪵','wood',ix.wood],['🩶','ash',ix.ash],['💥','gunpowder',ix.gunpowder],
        ['🛢️','oil',ix.oil],
      ];
      const reactionColor=(r)=>r==='flee'||r==='die'||r==='die_fast'||r==='dissolve'||r==='drown'?'#ff4455':r==='feed'||r==='absorb'||r==='eat'||r==='mine'||r==='swim'||r==='drink'||r==='gnaw'?'#00ff88':'#aaaacc';
      html+=`<div style="display:flex;flex-wrap:wrap;gap:2px;">`;
      for(const[ico,name,reaction] of elemPairs){
        if(!reaction)continue;
        const rc=reactionColor(reaction);
        html+=`<div style="font-size:6px;padding:2px 4px;border:1px solid ${rc}33;color:${rc};background:${rc}11;">${ico} ${reaction}</div>`;
      }
      html+=`</div>`;

      // Kingdom interactions
      html+=`<div class="ot-section">KINGDOM RELATIONS</div>`;
      const kingdomPairs=[
        ['🐜','ants',ix.vs_ant],['🕷️','spiders',ix.vs_spider],
        ['🍄','fungi',ix.vs_fungi],['🪲','mites',ix.vs_mite],['🌿','plants',ix.vs_plant],
      ];
      html+=`<div style="display:flex;flex-direction:column;gap:2px;">`;
      for(const[ico,name,rel] of kingdomPairs){
        if(!rel)continue;
        const rc=rel==='hunt'||rel==='eat'?'#ff4455':rel==='flee'||rel==='avoid'?'#ffaa00':rel==='ally'||rel==='symbiotic'?'#00ff88':'#aaaacc';
        html+=`<div class="ot-row"><span class="otr-name">${ico} ${name}</span><span class="otr-val" style="color:${rc}">${rel}</span></div>`;
      }
      html+=`</div>`;

      // Mobility
      html+=`<div class="ot-section">MOBILITY</div>`;
      html+=`<div class="ot-row"><span class="otr-name">IN WATER</span><span class="otr-val">${ix.mob_water_desc||'—'}</span></div>`;
      html+=`<div class="ot-row"><span class="otr-name">IN CLAY</span><span class="otr-val">${ix.mob_clay_desc||'—'}</span></div>`;
      html+=`<div class="ot-row"><span class="otr-name">IN SAND</span><span class="otr-val">${ix.mob_sand_desc||'—'}</span></div>`;
      html+=`<div class="ot-row"><span class="otr-name">IN OIL</span><span class="otr-val">${ix.mob_oil_desc||'—'}</span></div>`;
    }

  } else {
    const tname=Object.entries(T).find(([k,v2])=>v2===p.t)?.[0]||`T${p.t}`;
    html=`<div class="ot-header"><span class="ot-icon">🔬</span><div><div class="ot-title">${tname}</div><div class="ot-subtitle">(${gx},${gy})</div></div></div>`;
    if(p.g){
      html+=`<div class="ot-section">VITALS</div>`;
      html+=`<div class="ot-bar"><span class="ot-bar-label">HP</span><div class="ot-bar-track"><div class="ot-bar-fill" style="width:${Math.round((p.hp||0)/100*100)}%;background:#ff4455"></div></div><span class="ot-bar-val">${Math.round(p.hp||0)}</span></div>`;
      html+=`<div class="ot-bar"><span class="ot-bar-label">ENERGY</span><div class="ot-bar-track"><div class="ot-bar-fill" style="width:${Math.round((p.energy||0)/255*100)}%;background:#00ff88"></div></div><span class="ot-bar-val">${Math.round(p.energy||0)}</span></div>`;
      if(p.sid)html+=`<div class="ot-row"><span class="otr-name">STRAIN</span><span class="otr-val">${p.sid}</span></div>`;
      if(p.alpha)html+=`<div class="ot-row"><span class="otr-name">ROLE</span><span class="otr-val" style="color:#ffdd44">⭐ ALPHA TUNNELER</span></div>`;
      // Genome bars
      const gnames=['DENSITY','MOBILITY','APPETITE','AGGRSSN','RESILNC','REPRO'];
      html+=`<div class="ot-section">GENOME</div>`;
      for(let i=0;i<6;i++){
        const pct=Math.round((p.g[i]/255)*100);
        html+=`<div class="ot-bar"><span class="ot-bar-label">${gnames[i]}</span><div class="ot-bar-track"><div class="ot-bar-fill" style="width:${pct}%;background:#4488ff"></div></div><span class="ot-bar-val">${p.g[i]}</span></div>`;
      }
    }
    html+=`<div class="ot-row"><span class="otr-name">LIGHT</span><span class="otr-val">${(lightGrid[idx(gx,gy)]*100).toFixed(0)}%</span></div>`;
    html+=`<div class="ot-row"><span class="otr-name">PHERO</span><span class="otr-val">${(pheroGrid[idx(gx,gy)]*100).toFixed(0)}%</span></div>`;
  }

  tip.innerHTML=html;
  tip.classList.add('visible');
  let tx=mx+18,ty=my-8;
  if(tx+tip.offsetWidth>window.innerWidth-10)tx=mx-tip.offsetWidth-10;
  if(ty+tip.offsetHeight>window.innerHeight-10)ty=window.innerHeight-tip.offsetHeight-10;
  if(ty<10)ty=10;
  tip.style.left=tx+'px'; tip.style.top=ty+'px';
}

// Wire up lab popup close on backdrop click
document.getElementById('lab-popup').addEventListener('click',e=>{if(e.target===document.getElementById('lab-popup'))closeLab();});

buildOrder();
resetSim();
requestAnimationFrame(loop);

// Listen for toast events dispatched by world.js (avoids circular import)
document.addEventListener('game:toast', e => showEventToast(e.detail.name, e.detail.desc));
