// ================================================================
//  LAB — Creature Lab: define, edit, and manage custom organisms
//  Edit SPECIAL_OPTIONS or KINGDOM_TARGETS to extend lab capabilities.
// ================================================================
import { T } from './constants.js';
import { grid, POP, POP_MAX, POP_HISTORY, customCreatures, nextCustomId, incNextCustomId,
         mutRate, currentEl, selectedCustom, selectedIsQueen, historySelectedId,
         editingCreatureId, labIcon, labPreySet, labAllySet, labHuntedBySet,
         labHarmfulSet, labSpecialSet, labToleranceSet, labElemBehaviors,
         setSelectedCustom, setHistorySelected, setEditingCreature,
         setLabIcon, setLabElemBehaviors, setEl, setTool } from './state.js';
import { idx, inB } from './utils.js';
import { mutateGenome, randomGenome, registerStrain } from './genome.js';
import { showEventToast } from './ui.js';
import { spawnCustomCell, stepCustom } from './kingdoms.js';

export function buildCreatureCardHTML(c){
  const ix=c.interactions||{};
  const col=`hsl(${c.hue},${c.sat}%,65%)`;
  const movLabel=(c.movement?.icon||'')+' '+(c.movement?.name||'').toUpperCase();
  const sizeLabel=(c.size?.name||'').toUpperCase();
  const arch=c.archetype||'creature';
  let html=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border);">`;
  html+=`<span style="font-size:24px;background:hsl(${c.hue},${c.sat}%,${c.lit}%);border-radius:4px;padding:4px;">${c.icon}</span>`;
  html+=`<div><div style="font-family:var(--display);font-size:14px;letter-spacing:2px;color:${col}">${c.name||'Unnamed'}</div>`;
  html+=`<div style="font-size:7px;color:var(--dim);letter-spacing:1px;">${arch==='plant'?'🌿 PLANT':arch==='fungi'?'🍄 FUNGI':movLabel} · ${sizeLabel}</div></div></div>`;
  html+=`<div style="display:flex;flex-direction:column;gap:3px;margin-bottom:8px;">`;
  html+=`<div style="display:flex;justify-content:space-between;"><span style="color:var(--dim)">Diet</span><span>${c.diet?.icon||''} ${c.diet?.name||''}</span></div>`;
  html+=`<div style="display:flex;justify-content:space-between;"><span style="color:var(--dim)">Repro</span><span>${c.reproduction?.name||''}</span></div>`;
  const preyList=[...(c.preyTypes||[]).map(t=>{const kt=KINGDOM_TARGETS.find(k=>k.type===t);return kt?kt.icon+' '+kt.label:'';}),(c.preyCustomIds||[]).map(id=>{const cc=customCreatures.get(id);return cc?cc.icon+' '+cc.name:'';})].flat().filter(Boolean);
  if(preyList.length) html+=`<div style="display:flex;justify-content:space-between;"><span style="color:var(--dim)">Hunts</span><span style="color:#ff8888">${preyList.join(', ')}</span></div>`;
  const harmList=[...(c.harmfulTypes||[]).map(t=>{const kt=KINGDOM_TARGETS.find(k=>k.type===t);return kt?kt.icon+' '+kt.label:'';}),(c.harmfulCustomIds||[]).map(id=>{const cc=customCreatures.get(id);return cc?cc.icon+' '+cc.name:'';})].flat().filter(Boolean);
  if(harmList.length) html+=`<div style="display:flex;justify-content:space-between;"><span style="color:var(--dim)">Harms</span><span style="color:#ff8888">${harmList.join(', ')}</span></div>`;
  html+=`<div style="display:flex;justify-content:space-between;"><span style="color:var(--dim)">Traits</span><span>${(c.specials||[]).map(s=>s.icon+' '+s.name).join(', ')||'—'}</span></div>`;
  html+=`</div>`;
  if(Object.keys(ix).length){
    html+=`<div style="font-size:7px;letter-spacing:2px;color:var(--accent4);border-bottom:1px solid var(--border);padding-bottom:2px;margin-bottom:5px;">ELEMENT REACTIONS</div>`;
    html+=`<div style="display:flex;flex-wrap:wrap;gap:2px;margin-bottom:6px;">`;
    const elemPairs=[['🔥',ix.fire],['🌋',ix.lava],['💧',ix.water],['🧊',ix.ice],['🟢',ix.acid],['🧂',ix.salt],['💨',ix.smoke],['🌊',ix.steam],['🪵',ix.wood],['🌱',ix.clay],['🏜️',ix.sand],['🛢️',ix.oil]];
    const rc=(r)=>!r?'#555':r==='flee'||r==='die'||r==='die_fast'||r==='dissolve'||r==='drown'?'#ff4455':r==='feed'||r==='absorb'||r==='eat'||r==='mine'||r==='swim'||r==='drink'||r==='gnaw'?'#00ff88':'#aaaacc';
    for(const[ico,reaction] of elemPairs){if(!reaction)continue;const c2=rc(reaction);html+=`<div style="font-size:6px;padding:2px 4px;border:1px solid ${c2}44;color:${c2};background:${c2}11;">${ico} ${reaction}</div>`;}
    html+=`</div>`;
    html+=`<div style="font-size:7px;letter-spacing:2px;color:var(--accent4);border-bottom:1px solid var(--border);padding-bottom:2px;margin-bottom:5px;">MOBILITY</div>`;
    html+=`<div style="display:flex;flex-direction:column;gap:2px;">`;
    if(ix.mob_water_desc) html+=`<div style="display:flex;justify-content:space-between;"><span style="color:var(--dim)">💧 water</span><span>${ix.mob_water_desc}</span></div>`;
    if(ix.mob_clay_desc)  html+=`<div style="display:flex;justify-content:space-between;"><span style="color:var(--dim)">🟫 clay</span><span>${ix.mob_clay_desc}</span></div>`;
    if(ix.mob_sand_desc)  html+=`<div style="display:flex;justify-content:space-between;"><span style="color:var(--dim)">🏜️ sand</span><span>${ix.mob_sand_desc}</span></div>`;
    if(ix.mob_oil_desc)   html+=`<div style="display:flex;justify-content:space-between;"><span style="color:var(--dim)">🛢️ oil</span><span>${ix.mob_oil_desc}</span></div>`;
    html+=`</div>`;
  }
  return html;
}

export function showCreatureCard(id,mx,my){
  const c=customCreatures.get(id);const card=document.getElementById('lab-creature-card');
  if(!c||!card)return;
  card.innerHTML=buildCreatureCardHTML(c);
  card.style.display='block';
  let tx=mx+16,ty=my-10;
  // Position safely within viewport
  setTimeout(()=>{
    if(tx+card.offsetWidth>window.innerWidth-10) tx=mx-card.offsetWidth-10;
    if(ty+card.offsetHeight>window.innerHeight-10) ty=window.innerHeight-card.offsetHeight-10;
    if(ty<10) ty=10; if(tx<10) tx=10;
    card.style.left=tx+'px'; card.style.top=ty+'px';
  },0);
}

export function hideCreatureCard(){
  const card=document.getElementById('lab-creature-card');
  if(card) card.style.display='none';
}

// Hide card on lab popup close
document.getElementById('lab-popup').addEventListener('mouseleave',()=>hideCreatureCard());
// ================================================================

// ================================================================
//  CREATURE LAB — Custom organisms with generated traits
// ================================================================
const TRAIT_OPTIONS = {
  movement:[
    {id:'walker',name:'Walker',desc:'Walks on surfaces',icon:'🚶'},
    {id:'flyer',name:'Flyer',desc:'Floats through air',icon:'🦋'},
    {id:'swimmer',name:'Swimmer',desc:'Moves through water',icon:'🐟'},
    {id:'burrower',name:'Burrower',desc:'Tunnels through sand',icon:'🐛'},
    {id:'climber',name:'Climber',desc:'Clings to walls',icon:'🦎'},
    {id:'swarmer',name:'Swarmer',desc:'Moves toward others',icon:'🐝'},
  ],
  diet:[
    {id:'herbivore',name:'Herbivore',targets:[T.PLANT,T.SEED],icon:'🌿'},
    {id:'carnivore',name:'Carnivore',targets:['agents'],icon:'🥩'},
    {id:'fungivore',name:'Fungivore',targets:[T.FUNGI,T.SPORE],icon:'🍄'},
    {id:'detritivore',name:'Detritivore',targets:[T.DETRITUS,T.ASH],icon:'🍂',desc:'Eats ash and detritus'},
    {id:'lithivore',name:'Lithivore',targets:[T.STONE,T.SAND,T.GOLD_SAND],icon:'🪨',desc:'Eats minerals'},
    {id:'photosynthetic',name:'Photosynthetic',targets:[],icon:'☀️'},
    {id:'parasitic',name:'Parasitic',targets:['agents'],icon:'🦠'},
    {id:'omnivore',name:'Omnivore',targets:[T.PLANT,T.FUNGI,T.DETRITUS,T.ASH],icon:'🍽️'},
    {id:'pyrotroph',name:'Pyrotroph',targets:[T.LAVA,T.FIRE],icon:'🔥',desc:'Feeds on heat — immune to fire'},
    {id:'cryotroph',name:'Cryotroph',targets:[T.ICE,T.WATER],icon:'❄️',desc:'Feeds on cold — thrives near ice'},
  ],
  reproduction:[
    {id:'budding',name:'Budding',rate:0.02},
    {id:'egg_layer',name:'Egg Layer',rate:0.01},
    {id:'spore',name:'Spore Release',rate:0.008},
    {id:'cloning',name:'Cloning',rate:0.015},
  ],
  special:[
    {id:'bioluminescent',name:'Bioluminescent',icon:'💡'},
    {id:'venomous',name:'Venomous',icon:'☠️'},
    {id:'armored',name:'Armored',icon:'🛡️'},
    {id:'regenerating',name:'Regenerating',icon:'💚'},
    {id:'fire_immune',name:'Fire Immune',icon:'🔥'},
    {id:'acid_immune',name:'Acid Resistant',icon:'🧪'},
    {id:'pyro',name:'Pyromaniac',icon:'💥',desc:'Ignites nearby flammables'},
    {id:'crystalline',name:'Crystalline',icon:'💎',desc:'Slowly converts neighbors to stone'},
    {id:'smokescreen',name:'Smokescreen',icon:'💨',desc:'Emits smoke when threatened'},
  ],
  size:[
    {id:'tiny',name:'Tiny',hp:30,energy:80,speed:2.0},
    {id:'small',name:'Small',hp:60,energy:120,speed:1.5},
    {id:'medium',name:'Medium',hp:100,energy:150,speed:1.0},
    {id:'large',name:'Large',hp:180,energy:200,speed:0.6},
  ],
};

const CREATURE_ICONS=['🐜','🐛','🦗','🦟','🐞','🦂','🦀','🐙','🦑','🐚','🐌','🦋','🐝','🪲','🪳','🦠','👾','👽','🤖','💀','👻','🔮','💎','⭐','🌟','✨','🌀','❄️','⚡','🌊','🍄','🌸','🌺','💜','💙','💚','💛','🧡','❤️'];

// Custom creature state

let pendingCreature = null;
// Observe mode state
let savedSpeedMult = 1;

// ================================================================
//  PROCEDURAL CREATURE INTERACTION GENERATOR
//  Generates a unique interaction profile for every element and kingdom
//  based on the creature's traits. Used in stepCustom and observe.
// ================================================================
export function generateInteractions(c){
  const m=(c.movement?.id)||'walker', d=(c.diet?.id)||'omnivore';
  const specIds=(c.specials||[]).map(s=>s.id);
  const isSmall=c.size.id==='tiny'||c.size.id==='small';
  const isLarge=c.size.id==='large';
  const fireImmune=specIds.includes('fire_immune')||d==='pyrotroph';
  const acidResist=specIds.includes('acid_immune');
  const armorOf=specIds.includes('armored');

  // Helper: pick weighted random from array
  const pw=(opts)=>opts[Math.floor(Math.random()*opts.length)];

  return {
    // ── ELEMENT INTERACTIONS ──
    water:   m==='swimmer'?'swim':m==='flyer'?'float':isSmall?'drown':pw(['avoid','wade','drink']),
    oil:     m==='swimmer'?'swim_slow':m==='flyer'?'avoid':pw(['coat','avoid','drown_slow']),
    sand:    m==='burrower'?'burrow':pw(['walk','slow','avoid']),
    clay:    m==='burrower'?'tunnel':isLarge?'push_through':pw(['avoid','slow','stuck']),
    stone:   m==='burrower'&&isLarge?'drill':pw(['climb','avoid','stuck']),
    lava:    fireImmune?'feed':armorOf?'resist':pw(['flee','die_fast','die_slow']),
    fire:    fireImmune?'absorb':armorOf?'resist':pw(['flee','singe','die']),
    acid:    acidResist?'resist':isSmall?'dissolve':pw(['flee','corrode','die']),
    ice:     d==='cryotroph'?'feed':m==='swimmer'?'slide':pw(['slow','freeze','avoid']),
    steam:   m==='flyer'?'ride':pw(['avoid','scald','ignore']),
    smoke:   m==='flyer'?'navigate':pw(['blind','ignore','choke']),
    salt:    d==='lithivore'?'mine':isSmall?'irritate':pw(['avoid','crystallize','die_slow']),
    wood:    d==='herbivore'||d==='omnivore'?'gnaw':pw(['nest','perch','ignore']),
    ash:     d==='detritivore'||d==='omnivore'?'eat':pw(['dust','ignore','avoid']),
    gunpowder: specIds.includes('pyro')?'ignite':pw(['flee','avoid','collect']),
    detritus:  d==='detritivore'||d==='omnivore'?'eat':pw(['avoid','burrow_in','ignore']),
    // ── KINGDOM INTERACTIONS ──
    vs_ant:    d==='carnivore'?'hunt':d==='parasitic'?'infect':pw(['flee','ignore','compete','ally']),
    vs_spider: d==='carnivore'&&isLarge?'hunt':pw(['flee','avoid','ignore','prey']),
    vs_fungi:  d==='fungivore'?'eat':d==='parasitic'?'infect':pw(['ignore','spread_with','avoid']),
    vs_mite:   d==='carnivore'?'hunt':isSmall?'compete':pw(['ignore','flee','ally']),
    vs_plant:  d==='herbivore'||d==='omnivore'?'eat':m==='climber'?'nest_on':pw(['ignore','shelter_in','avoid']),
    // ── MOBILITY RATINGS (0-3) ──
    mob_water: m==='swimmer'?3:m==='flyer'?2:isSmall?0:1,
    mob_oil:   m==='swimmer'?2:m==='flyer'?1:0,
    mob_clay:  m==='burrower'?3:isLarge?2:1,
    mob_sand:  m==='burrower'?3:2,
    mob_air:   m==='flyer'?3:m==='climber'?2:1,
    mob_water_desc: m==='swimmer'?'expert swimmer':m==='flyer'?'skims surface':isSmall?'drowns quickly':'wades slowly',
    mob_oil_desc:   m==='swimmer'?'swims through oil':m==='flyer'?'avoids contact':'gets coated, moves slowly',
    mob_clay_desc:  m==='burrower'?'tunnels freely':isLarge?'forces through slowly':'cannot enter',
    mob_sand_desc:  m==='burrower'?'burrows rapidly':'walks on surface',
  };
}

// ================================================================
//  CREATURE LAB — Manual Builder
// ================================================================

const KINGDOM_TARGETS=[
  {id:'ant',   label:'ANT',   icon:'🐜', type:T.ANT},
  {id:'queen', label:'QUEEN ANT', icon:'👑', type:T.QUEEN},
  {id:'spider',label:'SPIDER',icon:'🕷️', type:T.SPIDER},
  {id:'qspider',label:'Q.SPIDER',icon:'🕸️', type:T.QUEEN_SPIDER},
  {id:'fungi', label:'FUNGI', icon:'🍄', type:T.FUNGI},
  {id:'mite',  label:'MITE',  icon:'🪲', type:T.MITE},
  {id:'qmite', label:'Q.MITE', icon:'🪲👑', type:T.QUEEN_MITE},
  {id:'plant', label:'PLANT', icon:'🌿', type:T.PLANT},
  {id:'custom',label:'CUSTOM',icon:'👾', type:'custom'}, // all custom creatures
];

const SPECIAL_OPTIONS=[
  {id:'bioluminescent',name:'Bioluminescent',icon:'💡'},
  {id:'venomous',name:'Venomous',icon:'☠️'},
  {id:'armored',name:'Armored',icon:'🛡️'},
  {id:'regenerating',name:'Regenerating',icon:'💚'},
  {id:'fire_immune',name:'Fire Immune',icon:'🔥'},
  {id:'acid_immune',name:'Acid Resist',icon:'🧪'},
  {id:'pyro',name:'Pyromaniac',icon:'💥'},
  {id:'crystalline',name:'Crystalline',icon:'💎'},
  {id:'smokescreen',name:'Smokescreen',icon:'💨'},
  {id:'frogstone_immune',name:'Frogstone Immune',icon:'🐸🛡️'},
];

const TOLERANCE_OPTIONS=[
  {id:'water',icon:'💧',label:'Water'},
  {id:'lava', icon:'🌋',label:'Lava'},
  {id:'acid', icon:'🟢',label:'Acid'},
  {id:'ice',  icon:'🧊',label:'Ice'},
  {id:'smoke',icon:'💨',label:'Smoke'},
  {id:'salt', icon:'🧂',label:'Salt'},
];

// State of current toggles in builder








// Per-element behavior state: maps elementId -> reaction string


const ELEM_BEHAVIOR_DEFS=[
  {id:'fire',  icon:'🔥', label:'Fire',    opts:['die','flee','resist','feed on','ignore']},
  {id:'lava',  icon:'🌋', label:'Lava',    opts:['die','flee','resist','feed on','ignore']},
  {id:'water', icon:'💧', label:'Water',   opts:['die','drink','swim in','flee','ignore']},
  {id:'ice',   icon:'🧊', label:'Ice',     opts:['freeze','slow','skate on','feed on','ignore']},
  {id:'acid',  icon:'🟢', label:'Acid',    opts:['die','flee','resist','ignore']},
  {id:'salt',  icon:'🧂', label:'Salt',    opts:['die','mine','repelled','ignore']},
  {id:'smoke', icon:'💨', label:'Smoke',   opts:['choke','blind','ignore']},
  {id:'steam', icon:'🌊', label:'Steam',   opts:['scald','absorb','ignore']},
  {id:'sand',  icon:'🏜️', label:'Sand',   opts:['burrow','walk on','ignore']},
  {id:'clay',  icon:'🟫', label:'Clay',    opts:['dig','tunnels','blocked','ignore']},
  {id:'wood',  icon:'🪵', label:'Wood',    opts:['eat','nest in','blocked','ignore']},
  {id:'detritus',icon:'🍂',label:'Detritus',opts:['eat','nest in','ignore']},
  {id:'oil',   icon:'🛢️', label:'Oil',    opts:['swim in','coated','drink','ignore']},
  {id:'gunpowder',icon:'💥',label:'Gunpowder',opts:['explode on','eat','ignore']},
];

export function buildElemBehaviorTable(){
  const el=document.getElementById('lab-elem-behaviors');
  if(!el) return;
  el.innerHTML='';
  for(const def of ELEM_BEHAVIOR_DEFS){
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:6px;';
    const lbl=document.createElement('span');
    lbl.style.cssText='font-size:9px;width:80px;color:var(--text);flex-shrink:0;';
    lbl.textContent=`${def.icon} ${def.label}`;
    const sel=document.createElement('select');
    sel.style.cssText='background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:var(--mono);font-size:7px;padding:2px 4px;flex:1;';
    sel.dataset.elemId=def.id;
    for(const opt of def.opts){
      const o=document.createElement('option');
      o.value=opt; o.textContent=opt;
      if(labElemBehaviors[def.id]===opt) o.selected=true;
      sel.appendChild(o);
    }
    sel.addEventListener('change',()=>{labElemBehaviors[def.id]=sel.value;});
    row.appendChild(lbl); row.appendChild(sel);
    el.appendChild(row);
    // Init default
    if(!labElemBehaviors[def.id]) labElemBehaviors[def.id]=def.opts[def.opts.length-1]; // 'ignore' is always last
  }
}

export function buildKingdomToggleListWithCustom(containerId, stateSet, activeClass){
  const el=document.getElementById(containerId);
  el.innerHTML='';
  const allTargets=[...KINGDOM_TARGETS];
  // Add current lab creatures
  customCreatures.forEach(c=>{allTargets.push({id:'custom_'+c.id,label:c.name,icon:c.icon,type:'custom',customId:c.id});});
  for(const item of allTargets){
    const btn=document.createElement('div');
    btn.className='lab-toggle'+(stateSet.has(item.id)?` ${activeClass}`:'');
    btn.textContent=`${item.icon||''} ${item.label}`;
    btn.onclick=()=>{
      if(stateSet.has(item.id)) stateSet.delete(item.id);
      else stateSet.add(item.id);
      btn.className='lab-toggle'+(stateSet.has(item.id)?` ${activeClass}`:'');
    };
    el.appendChild(btn);
  }
}

export function onArchetypeChange(){
  const arch=document.getElementById('lab-archetype').value;
  const isPlantFungi=arch==='plant'||arch==='fungi';
  document.getElementById('lab-plant-opts').style.display=isPlantFungi?'block':'none';
  document.getElementById('lab-movement-field').style.display=isPlantFungi?'none':'block';
  document.getElementById('lab-section-prey').style.display=isPlantFungi?'none':'block';
  document.getElementById('lab-prey-list').style.display=isPlantFungi?'none':'block';
  document.getElementById('lab-attack-field').style.display=isPlantFungi?'none':'block';
  // Set default diet for archetype
  if(arch==='plant') document.getElementById('lab-diet').value='photosynthetic';
  if(arch==='fungi') { document.getElementById('lab-diet').value='detritivore'; document.getElementById('lab-light-req').value=10; document.getElementById('lab-light-val').textContent='10%'; }
  if(arch==='creature') document.getElementById('lab-diet').value='omnivore';
}

export function initLabBuilder(){
  updateLabColorPreview();
  const picker=document.getElementById('lab-icon-picker');
  picker.innerHTML=CREATURE_ICONS.map(ic=>`<span style="cursor:pointer;padding:2px;" onclick="selectLabIcon('${ic}')">${ic}</span>`).join('');
  picker.style.display='none';

  buildKingdomToggleListWithCustom('lab-prey-list', labPreySet, 'active-prey');
  buildKingdomToggleListWithCustom('lab-ally-list', labAllySet, 'active-ally');
  buildKingdomToggleListWithCustom('lab-hunted-list', labHuntedBySet, 'active-prey');
  buildKingdomToggleListWithCustom('lab-harmful-list', labHarmfulSet, 'active-prey');
  buildToggleList('lab-specials-list', SPECIAL_OPTIONS.map(s=>({id:s.id,label:s.name,icon:s.icon})), labSpecialSet, 'active-special');
  buildToggleList('lab-tolerances', TOLERANCE_OPTIONS.map(t=>({id:t.id,label:t.label,icon:t.icon})), labToleranceSet, 'active-tol');
  buildElemBehaviorTable();
  onArchetypeChange();
}

export function buildToggleList(containerId, items, stateSet, activeClass){
  const el=document.getElementById(containerId);
  if(!el) return;
  el.innerHTML='';
  for(const item of items){
    const btn=document.createElement('div');
    btn.className='lab-toggle'+(stateSet.has(item.id)?` ${activeClass}`:'');
    btn.textContent=`${item.icon||''} ${item.label}`;
    btn.onclick=()=>{
      if(stateSet.has(item.id)) stateSet.delete(item.id);
      else stateSet.add(item.id);
      btn.className='lab-toggle'+(stateSet.has(item.id)?` ${activeClass}`:'');
    };
    el.appendChild(btn);
  }
}

export function updateLabColorPreview(){
  const hue=document.getElementById('lab-hue')?.value||180;
  const cp=document.getElementById('lab-color-preview');
  const id=document.getElementById('lab-icon-display');
  if(cp) cp.style.background=`hsl(${hue},70%,45%)`;
  if(id) id.style.background=`hsl(${hue},60%,25%)`;
}

export function toggleIconPicker(){
  const p=document.getElementById('lab-icon-picker');
  p.style.display=p.style.display==='flex'?'none':'flex';
  if(p.style.display==='flex') p.style.flexWrap='wrap';
}

export function selectLabIcon(icon){
  labIcon=icon;
  document.getElementById('lab-icon-display').textContent=icon;
  document.getElementById('lab-icon-picker').style.display='none';
}

export function readLabForm(){
  const sizeMap={tiny:{id:'tiny',name:'Tiny',hp:30,energy:80,speed:2.0},small:{id:'small',name:'Small',hp:60,energy:120,speed:1.5},medium:{id:'medium',name:'Medium',hp:100,energy:150,speed:1.0},large:{id:'large',name:'Large',hp:180,energy:200,speed:0.6}};
  const movMap={walker:{id:'walker',name:'Walker',icon:'🚶'},flyer:{id:'flyer',name:'Flyer',icon:'🦋'},swimmer:{id:'swimmer',name:'Swimmer',icon:'🐟'},burrower:{id:'burrower',name:'Burrower',icon:'🐛'},climber:{id:'climber',name:'Climber',icon:'🦎'},swarmer:{id:'swarmer',name:'Swarmer',icon:'🐝'}};
  const reproMap={budding:{id:'budding',name:'Budding',rate:0.02},egg_layer:{id:'egg_layer',name:'Egg Layer',rate:0.01},spore:{id:'spore',name:'Spore',rate:0.008},cloning:{id:'cloning',name:'Cloning',rate:0.015},flowering:{id:'flowering',name:'Flowering',rate:0.005}};
  const dietTargetMap={herbivore:{id:'herbivore',name:'Herbivore',targets:[T.PLANT,T.SEED],icon:'🌿'},fungivore:{id:'fungivore',name:'Fungivore',targets:[T.FUNGI,T.SPORE],icon:'🍄'},detritivore:{id:'detritivore',name:'Detritivore',targets:[T.DETRITUS,T.ASH],icon:'🍂'},lithivore:{id:'lithivore',name:'Lithivore',targets:[T.STONE,T.SAND,T.GOLD_SAND],icon:'🪨'},omnivore:{id:'omnivore',name:'Omnivore',targets:[T.PLANT,T.FUNGI,T.DETRITUS,T.ASH],icon:'🍽️'},photosynthetic:{id:'photosynthetic',name:'Photosynthetic',targets:[],icon:'☀️'},parasitic:{id:'parasitic',name:'Parasitic',targets:['agents'],icon:'🦠'},pyrotroph:{id:'pyrotroph',name:'Pyrotroph',targets:[T.LAVA,T.FIRE],icon:'🔥'},cryotroph:{id:'cryotroph',name:'Cryotroph',targets:[T.ICE,T.WATER],icon:'❄️'}};

  const arch=document.getElementById('lab-archetype').value;
  const hue=parseInt(document.getElementById('lab-hue').value);
  const sizeId=document.getElementById('lab-size').value;
  const movId=document.getElementById('lab-movement').value;
  const reprTypeId=document.getElementById('lab-repro-type').value;
  const dietId=document.getElementById('lab-diet').value;
  const attackId=document.getElementById('lab-attack').value;
  const aggr=parseInt(document.getElementById('lab-aggression').value)/100;
  const reproRate=parseInt(document.getElementById('lab-repro').value)/100;
  const fear=parseInt(document.getElementById('lab-fear').value)/100;
  const lightReq=parseInt(document.getElementById('lab-light-req')?.value||40)/100;
  const spreadSpeed=parseInt(document.getElementById('lab-spread')?.value||40)/100;
  const flowerEmit=document.getElementById('lab-flower-emit')?.value||'none';

  const preyTypes=[];
  const preyCustomIds=[];
  for(const id of labPreySet){
    if(id.startsWith('custom_')){preyCustomIds.push(parseInt(id.split('_')[1]));}
    else{const kt=KINGDOM_TARGETS.find(k=>k.id===id);if(kt&&kt.type!=='custom')preyTypes.push(kt.type);}
  }
  const includesCustomPrey=labPreySet.has('custom'); // still keep: "all other custom"

  const allyTypes=[];
  const allyCustomIds=[];
  for(const id of labAllySet){
    if(id.startsWith('custom_')){allyCustomIds.push(parseInt(id.split('_')[1]));}
    else{const kt=KINGDOM_TARGETS.find(k=>k.id===id);if(kt&&kt.type!=='custom')allyTypes.push(kt.type);}
  }

  const huntedByTypes=[];
  for(const id of labHuntedBySet){
    if(id.startsWith('custom_')){huntedByTypes.push({customId:parseInt(id.split('_')[1])});}
    else{const kt=KINGDOM_TARGETS.find(k=>k.id===id);if(kt&&kt.type!=='custom')huntedByTypes.push({type:kt.type});}
  }

  // Plant/fungi: harmfulTypes = organisms damaged on contact
  const harmfulTypes=[];
  const harmfulCustomIds=[];
  for(const id of labHarmfulSet){
    if(id.startsWith('custom_')){harmfulCustomIds.push(parseInt(id.split('_')[1]));}
    else{const kt=KINGDOM_TARGETS.find(k=>k.id===id);if(kt&&kt.type!=='custom')harmfulTypes.push(kt.type);}
  }

  const specials=SPECIAL_OPTIONS.filter(s=>labSpecialSet.has(s.id));
  const tolerances=[...labToleranceSet];
  const elemBehaviors={...labElemBehaviors};

  return {
    id:nextCustomId, name:'',
    icon:labIcon, hue, sat:70, lit:35,
    archetype:arch,
    movement:movMap[movId]||movMap.walker,
    diet:dietTargetMap[dietId]||dietTargetMap.omnivore,
    reproduction:{...(reproMap[reprTypeId]||reproMap.budding), rate:0.004+reproRate*0.02},
    size:sizeMap[sizeId]||sizeMap.medium,
    specials, tolerances, elemBehaviors,
    preyTypes, preyCustomIds, includesCustomPrey, allyTypes, allyCustomIds, huntedByTypes,
    harmfulTypes, harmfulCustomIds,
    aggression:aggr, fear, attackId,
    lightReq, spreadSpeed, flowerEmit,
    genome:Array(6).fill(0).map((_,i)=>{
      if(i===3)return Math.floor(aggr*255);
      if(i===5)return Math.floor(reproRate*255);
      return Math.floor(100+Math.random()*100);
    }),
    created:tickCount,
  };
}

export function openLab(){
  // Reset edit state if opened from scratch (not via editCreature)
  editingCreatureId=null;
  const banner=document.getElementById('lab-editing-banner');
  if(banner) banner.remove();
  const saveBtn=document.querySelector('.lab-btn-row button.primary');
  if(saveBtn) saveBtn.textContent='✓ SAVE CREATURE';

  document.getElementById('lab-popup').classList.add('open');
  initLabBuilder();
  updateLabHistory();
  document.getElementById('lab-icon-display').textContent=labIcon;
  updateLabColorPreview();
}
export function closeLab(){
  document.getElementById('lab-popup').classList.remove('open');
  const banner=document.getElementById('lab-editing-banner');
  if(banner) banner.remove();
  const saveBtn=document.querySelector('.lab-btn-row button.primary');
  if(saveBtn) saveBtn.textContent='✓ SAVE CREATURE';
}

export function generateCreature(){
  const pick=arr=>arr[Math.floor(Math.random()*arr.length)];
  const archetypes=['creature','plant','fungi'];
  const arch=pick(archetypes);
  document.getElementById('lab-archetype').value=arch;
  onArchetypeChange();
  document.getElementById('lab-hue').value=Math.floor(Math.random()*360);
  document.getElementById('lab-size').value=pick(['tiny','small','medium','large']);
  if(arch==='creature') document.getElementById('lab-movement').value=pick(['walker','flyer','swimmer','burrower','climber','swarmer']);
  document.getElementById('lab-diet').value=arch==='plant'?'photosynthetic':arch==='fungi'?pick(['detritivore','fungivore']):pick(['omnivore','herbivore','fungivore','detritivore','photosynthetic','parasitic','pyrotroph','cryotroph']);
  document.getElementById('lab-attack').value=pick(['bite','venom','acid_spit','fire_breath','crush']);
  document.getElementById('lab-repro-type').value=arch==='plant'?pick(['flowering','spore']):arch==='fungi'?'spore':pick(['budding','egg_layer','spore','cloning']);
  document.getElementById('lab-aggression').value=arch==='creature'?Math.floor(Math.random()*100):0;
  document.getElementById('lab-repro').value=20+Math.floor(Math.random()*60);
  document.getElementById('lab-fear').value=Math.floor(Math.random()*70);
  ['aggression','repro','fear','light','spread'].forEach(id=>{const el=document.getElementById('lab-'+id+'-val')||document.getElementById('lab-'+id+'read-val');const src=document.getElementById('lab-'+id);if(el&&src)el.textContent=src.value+'%';});
  document.getElementById('lab-aggression-val').textContent=document.getElementById('lab-aggression').value+'%';
  document.getElementById('lab-repro-val').textContent=document.getElementById('lab-repro').value+'%';
  document.getElementById('lab-fear-val').textContent=document.getElementById('lab-fear').value+'%';
  labIcon=pick(CREATURE_ICONS);
  document.getElementById('lab-icon-display').textContent=labIcon;
  updateLabColorPreview();
  labPreySet.clear();labAllySet.clear();labHuntedBySet.clear();labHarmfulSet.clear();labSpecialSet.clear();labToleranceSet.clear();
  if(arch==='creature'){
    const kingdoms=KINGDOM_TARGETS.map(k=>k.id);
    for(let i=0;i<1+Math.floor(Math.random()*3);i++) labPreySet.add(pick(kingdoms));
  }
  const specs=SPECIAL_OPTIONS.map(s=>s.id);
  for(let i=0;i<1+Math.floor(Math.random()*2);i++) labSpecialSet.add(pick(specs));
  if(Math.random()<0.5) labToleranceSet.add(pick(TOLERANCE_OPTIONS.map(t=>t.id)));
  // Random element behaviors
  for(const def of ELEM_BEHAVIOR_DEFS) labElemBehaviors[def.id]=def.opts[Math.floor(Math.random()*def.opts.length)];
  buildKingdomToggleListWithCustom('lab-prey-list',labPreySet,'active-prey');
  buildKingdomToggleListWithCustom('lab-ally-list',labAllySet,'active-ally');
  buildKingdomToggleListWithCustom('lab-hunted-list',labHuntedBySet,'active-prey');
  buildKingdomToggleListWithCustom('lab-harmful-list',labHarmfulSet,'active-prey');
  buildToggleList('lab-specials-list',SPECIAL_OPTIONS.map(s=>({id:s.id,label:s.name,icon:s.icon})),labSpecialSet,'active-special');
  buildToggleList('lab-tolerances',TOLERANCE_OPTIONS.map(t=>({id:t.id,label:t.label,icon:t.icon})),labToleranceSet,'active-tol');
  buildElemBehaviorTable();
}

export function loadCreatureIntoForm(id){
  const c=customCreatures.get(id);
  if(!c) return;
  editingCreatureId=id;

  // Identity
  labIcon=c.icon;
  document.getElementById('lab-icon-display').textContent=c.icon;
  document.getElementById('lab-icon-display').style.background=`hsl(${c.hue},60%,25%)`;
  document.getElementById('lab-name').value=c.name||'';
  document.getElementById('lab-hue').value=c.hue;
  updateLabColorPreview();

  // Archetype
  const arch=c.archetype||'creature';
  document.getElementById('lab-archetype').value=arch;
  onArchetypeChange();

  // Physical
  document.getElementById('lab-size').value=c.size?.id||'medium';
  document.getElementById('lab-movement').value=c.movement?.id||'walker';

  // Behavior
  const aggrPct=Math.round((c.aggression||0.5)*100);
  const reproPct=Math.round(((c.reproduction?.rate||0.01)-0.004)/0.02*100);
  const fearPct=Math.round((c.fear||0.3)*100);
  document.getElementById('lab-aggression').value=aggrPct;
  document.getElementById('lab-aggression-val').textContent=aggrPct+'%';
  document.getElementById('lab-repro').value=Math.max(0,Math.min(100,reproPct));
  document.getElementById('lab-repro-val').textContent=Math.max(0,Math.min(100,reproPct))+'%';
  document.getElementById('lab-fear').value=fearPct;
  document.getElementById('lab-fear-val').textContent=fearPct+'%';
  document.getElementById('lab-repro-type').value=c.reproduction?.id||'budding';
  document.getElementById('lab-diet').value=c.diet?.id||'omnivore';
  document.getElementById('lab-attack').value=c.attackId||'bite';

  // Plant/fungi opts
  if(arch==='plant'||arch==='fungi'){
    const lightPct=Math.round((c.lightReq||0.3)*100);
    const spreadPct=Math.round((c.spreadSpeed||0.4)*100);
    document.getElementById('lab-light-req').value=lightPct;
    document.getElementById('lab-light-val').textContent=lightPct+'%';
    document.getElementById('lab-spread').value=spreadPct;
    document.getElementById('lab-spread-val').textContent=spreadPct+'%';
    document.getElementById('lab-flower-emit').value=c.flowerEmit||'none';
  }

  // Rebuild toggle sets from creature data
  labPreySet.clear(); labAllySet.clear(); labHuntedBySet.clear();
  labHarmfulSet.clear(); labSpecialSet.clear(); labToleranceSet.clear();
  labElemBehaviors={};

  // Prey — kingdoms
  (c.preyTypes||[]).forEach(t=>{const kt=KINGDOM_TARGETS.find(k=>k.type===t);if(kt)labPreySet.add(kt.id);});
  // Prey — specific custom creatures
  (c.preyCustomIds||[]).forEach(cid=>labPreySet.add('custom_'+cid));
  if(c.includesCustomPrey) labPreySet.add('custom');
  // Allies
  (c.allyTypes||[]).forEach(t=>{const kt=KINGDOM_TARGETS.find(k=>k.type===t);if(kt)labAllySet.add(kt.id);});
  (c.allyCustomIds||[]).forEach(cid=>labAllySet.add('custom_'+cid));
  // Hunted by
  (c.huntedByTypes||[]).forEach(h=>{
    if(h.customId!=null){labHuntedBySet.add('custom_'+h.customId);}
    else{const kt=KINGDOM_TARGETS.find(k=>k.type===h.type);if(kt)labHuntedBySet.add(kt.id);}
  });
  // Harmful to
  (c.harmfulTypes||[]).forEach(t=>{const kt=KINGDOM_TARGETS.find(k=>k.type===t);if(kt)labHarmfulSet.add(kt.id);});
  (c.harmfulCustomIds||[]).forEach(cid=>labHarmfulSet.add('custom_'+cid));
  // Specials
  (c.specials||[]).forEach(s=>labSpecialSet.add(s.id));
  // Tolerances
  (c.tolerances||[]).forEach(t=>labToleranceSet.add(t));
  // Element behaviors
  Object.assign(labElemBehaviors, c.elemBehaviors||{});

  // Rebuild all toggle UIs
  buildKingdomToggleListWithCustom('lab-prey-list', labPreySet, 'active-prey');
  buildKingdomToggleListWithCustom('lab-ally-list', labAllySet, 'active-ally');
  buildKingdomToggleListWithCustom('lab-hunted-list', labHuntedBySet, 'active-prey');
  buildKingdomToggleListWithCustom('lab-harmful-list', labHarmfulSet, 'active-prey');
  buildToggleList('lab-specials-list', SPECIAL_OPTIONS.map(s=>({id:s.id,label:s.name,icon:s.icon})), labSpecialSet, 'active-special');
  buildToggleList('lab-tolerances', TOLERANCE_OPTIONS.map(t=>({id:t.id,label:t.label,icon:t.icon})), labToleranceSet, 'active-tol');
  buildElemBehaviorTable();

  // Update save button label and show editing banner
  updateEditingBanner();
}

export function updateEditingBanner(){
  const existing=document.getElementById('lab-editing-banner');
  if(existing) existing.remove();
  if(!editingCreatureId) return;
  const c=customCreatures.get(editingCreatureId);
  if(!c) return;
  const banner=document.createElement('div');
  banner.id='lab-editing-banner';
  banner.className='lab-editing-banner';
  banner.innerHTML=`<span>✏️ EDITING: ${c.icon} ${c.name}</span><button onclick="cancelEdit()" style="background:transparent;border:1px solid var(--border);color:var(--dim);font-family:var(--mono);font-size:7px;padding:1px 6px;cursor:pointer;">CANCEL</button>`;
  // Insert before save button
  const btnRow=document.querySelector('.lab-btn-row');
  if(btnRow) btnRow.parentNode.insertBefore(banner,btnRow);
  document.querySelector('.lab-btn-row button.primary').textContent='✓ SAVE CHANGES';
}

export function cancelEdit(){
  editingCreatureId=null;
  const banner=document.getElementById('lab-editing-banner');
  if(banner) banner.remove();
  const saveBtn=document.querySelector('.lab-btn-row button.primary');
  if(saveBtn) saveBtn.textContent='✓ SAVE CREATURE';
  // Reset form
  labPreySet.clear();labAllySet.clear();labHuntedBySet.clear();labHarmfulSet.clear();labSpecialSet.clear();labToleranceSet.clear();
  labElemBehaviors={};labIcon=CREATURE_ICONS[0];
  document.getElementById('lab-name').value='';
  document.getElementById('lab-icon-display').textContent='?';
  updateLabColorPreview();
  initLabBuilder();
}

export function editCreature(id){
  hideCreatureCard();
  // Open lab if not already open
  document.getElementById('lab-popup').classList.add('open');
  // Small delay so DOM is ready
  setTimeout(()=>{
    initLabBuilder();
    loadCreatureIntoForm(id);
    updateLabHistory();
  },10);
}

export function saveCreature(){
  if(editingCreatureId){
    const c=readLabForm();
    c.name=document.getElementById('lab-name').value.trim()||customCreatures.get(editingCreatureId)?.name||'Creature';
    c.id=editingCreatureId;
    c.interactions=generateInteractions(c);
    customCreatures.set(editingCreatureId,c);
    for(let i=0;i<W*H;i++){const p=grid[i];if(p?.customType===editingCreatureId)p.hp=Math.min(p.hp,p.isQueen?c.size.hp*2:c.size.hp);}
    updateCustomList();updateLabHistory();closeLab();
    showEventToast('CREATURE UPDATED',`${c.icon} ${c.name} updated`);
    editingCreatureId=null;
    labPreySet.clear();labAllySet.clear();labHuntedBySet.clear();labHarmfulSet.clear();labSpecialSet.clear();labToleranceSet.clear();
    labElemBehaviors={};
    return;
  }
  if(customCreatures.size>=5){showEventToast('LAB FULL','Delete a creature to make room (max 5)');return;}
  const c=readLabForm();
  c.name=document.getElementById('lab-name').value.trim()||`Creature ${nextCustomId-T.CUSTOM_BASE+1}`;
  c.id=nextCustomId++;
  c.interactions=generateInteractions(c);
  customCreatures.set(c.id,c);
  POP[c.id]=0;POP[c.id+100]=0;POP_MAX[c.id]=800;POP_MAX[c.id+100]=10;POP_HISTORY[c.id]=[];
  selectedCustom=c.id;selectedIsQueen=false;
  currentEl='custom_'+c.id;currentTool='draw';
  updateCustomList();updateLabHistory();closeLab();
  showEventToast('CREATURE CREATED',`${c.icon} ${c.name} ready to place`);
  labIcon=CREATURE_ICONS[0];
  labPreySet.clear();labAllySet.clear();labHuntedBySet.clear();labHarmfulSet.clear();labSpecialSet.clear();labToleranceSet.clear();
  labElemBehaviors={};
}

export function updateLabHistory(){
  const el=document.getElementById('lab-history');
  const count=customCreatures.size;
  const full=count>=5;
  // Show slot counter
  const slots=`<div style="font-size:7px;color:${full?'var(--accent2)':'var(--dim)'};margin-bottom:8px;letter-spacing:1px;">SLOTS: ${count}/5${full?' — DELETE ONE TO CREATE MORE':''}</div>`;
  if(count===0){el.innerHTML=slots+'<div class="history-empty">No creatures yet.</div>';return;}
  el.innerHTML=slots+[...customCreatures.values()].map(c=>`
    <div class="history-item ${historySelectedId===c.id?'active':''}"
      onclick="selectLabHistoryCreature(${c.id})"
      onmouseenter="showCreatureCard(${c.id},event.clientX,event.clientY)"
      onmousemove="showCreatureCard(${c.id},event.clientX,event.clientY)"
      onmouseleave="hideCreatureCard()"
      style="border-left:3px solid hsl(${c.hue},${c.sat}%,${c.lit}%);cursor:pointer;">
      <button class="hi-delete" onclick="event.stopPropagation();deleteCreature(${c.id})" title="Delete">✕</button>
      <button class="hi-edit" onclick="event.stopPropagation();editCreature(${c.id})" title="Edit">✏️</button>
      <div class="hi-header">
        <span class="hi-icon">${c.icon}</span>
        <span class="hi-name" style="color:hsl(${c.hue},${c.sat}%,65%)">${c.name}</span>
        <span class="hi-pop">${(POP[c.id]||0)+(POP[c.id+100]||0)}</span>
      </div>
      <div style="font-size:6px;color:var(--dim);margin-top:2px;">${c.movement?.icon||''} ${c.movement?.name||''} · ${c.diet?.icon||''} ${c.diet?.name||''}</div>
    </div>
  `).join('')+(historySelectedId?`<div class="history-actions"><button onclick="spawnFromHistory(false)">🐜 WORKER</button><button class="queen" onclick="spawnFromHistory(true)">👑 QUEEN</button></div>`:'')+`<button onclick="editingCreatureId=null;openLab()" style="display:block;width:100%;margin-top:8px;background:transparent;border:1px dashed var(--border);color:var(--dim);font-family:var(--mono);font-size:7px;padding:5px;cursor:pointer;letter-spacing:1px;" ${customCreatures.size>=5?'disabled title="Lab full"':''}>+ NEW CREATURE</button>`;
}

export function selectLabHistoryCreature(id){ historySelectedId=id; updateLabHistory(); }

export function spawnFromHistory(isQueen){
  if(!historySelectedId)return;
  selectedCustom=historySelectedId; selectedIsQueen=isQueen;
  currentEl=(isQueen?'customqueen_':'custom_')+historySelectedId;
  currentTool='draw'; closeLab();
  document.querySelectorAll('.tbtn[data-tool]').forEach(b=>b.classList.remove('active'));
  document.getElementById('btn-draw').classList.add('active');
  updateCustomList();
}

export function deleteCreature(id){
  customCreatures.delete(id); delete POP[id]; delete POP[id+100]; delete POP_MAX[id]; delete POP_HISTORY[id];
  if(selectedCustom===id)selectedCustom=null;
  if(historySelectedId===id)historySelectedId=null;
  for(let i=0;i<W*H;i++) if(grid[i]?.customType===id) grid[i]=null;
  updateCustomList(); updateLabHistory();
}

export function updateCustomList(){
  const list=document.getElementById('custom-list');
  if(customCreatures.size===0){list.innerHTML='<div style="font-size:7px;color:var(--dim);padding:6px;text-align:center;">No custom creatures. Open lab to create.</div>';return;}
  list.innerHTML=[...customCreatures.values()].map(c=>{
    const isActive=selectedCustom===c.id;
    const col=`hsl(${c.hue},${c.sat}%,65%)`;
    const movLabel=c.movement?.icon&&c.movement?.name?`${c.movement.icon} ${c.movement.name}`:'';
    const dietLabel=c.diet?.icon&&c.diet?.name?`${c.diet.icon} ${c.diet.name}`:'';
    return `<div class="custom-entry ${isActive?'active':''}"
      style="border-left:3px solid hsl(${c.hue},${c.sat}%,${c.lit}%);position:relative;"
      onmouseenter="showCreatureCard(${c.id},event.clientX,event.clientY)"
      onmousemove="showCreatureCard(${c.id},event.clientX,event.clientY)"
      onmouseleave="hideCreatureCard()">
      <button onclick="event.stopPropagation();editCreature(${c.id})" title="Edit creature" style="position:absolute;top:3px;right:3px;background:none;border:none;color:var(--dim);font-size:9px;cursor:pointer;opacity:0;padding:0;" onmouseenter="this.style.opacity=1;this.style.color='var(--accent3)'" onmouseleave="this.style.opacity=0">✏️</button>
      <div class="ce-name"><span class="ce-icon">${c.icon}</span> <span style="color:${col}">${c.name}</span></div>
      <div style="font-size:6px;color:var(--dim);margin-top:1px;">${movLabel}${movLabel&&dietLabel?' · ':''}${dietLabel}</div>
      <div style="display:flex;gap:4px;margin-top:3px;">
        <button onclick="selectCustomCreature(${c.id},false)" style="flex:1;background:${!selectedIsQueen&&isActive?'rgba(0,255,136,0.1)':'transparent'};border:1px solid ${!selectedIsQueen&&isActive?'var(--accent)':'var(--border)'};color:var(--dim);font-family:var(--mono);font-size:6px;padding:2px;cursor:pointer;">🐜${POP[c.id]||0}</button>
        <button onclick="selectCustomCreature(${c.id},true)" style="flex:1;background:${selectedIsQueen&&isActive?'rgba(255,170,0,0.1)':'transparent'};border:1px solid ${selectedIsQueen&&isActive?'var(--accent4)':'var(--border)'};color:var(--dim);font-family:var(--mono);font-size:6px;padding:2px;cursor:pointer;">👑${POP[c.id+100]||0}</button>
      </div>
    </div>`;
  }).join('');
}

export function selectCustomCreature(id,isQueen){
  selectedCustom=id; selectedIsQueen=isQueen;
  currentEl=(isQueen?'customqueen_':'custom_')+id;
  currentTool='draw';
  document.querySelectorAll('.tbtn[data-tool]').forEach(b=>b.classList.remove('active'));
  document.getElementById('btn-draw').classList.add('active');
  updateCustomList();
}

// ---- Custom creature placement factory ----function spawnCustomCell(typeId,x,y,isQueen){
  const def=customCreatures.get(typeId); if(!def)return null;
