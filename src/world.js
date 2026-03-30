// ================================================================
//  WORLD — Seed ecosystem, reset, procedural world generation
//  Edit randomMap() to change the generated cave/terrain layout.
// ================================================================
import { W, H, T } from './constants.js';
import { grid, lightGrid, pheroGrid, POP, POP_HISTORY, gv, sunX, sunY, sunActive,
         fridgeZones, strainRegistry, customCreatures, nextCustomId,
         rainActive, acidRainActive, setSun, setRain, setAcidRain,
         setNextEvent, setActiveEvent, mutRate } from './state.js';
import { idx, inB, get, abiotic, agentWithStrain, popIncr } from './utils.js';
import { randomGenome, mutateGenome, registerStrain } from './genome.js';

export function seedLife(){
  // Place a balanced starter ecosystem
  const W2=W,H2=H;

  // Plants (needs sand to root)
  for(let n=0;n<25;n++){
    const x=Math.floor(Math.random()*W2),y=Math.floor(Math.random()*H2*0.7);
    if(!get(x,y)&&get(x+gv.x,y+gv.y)?.t===T.SAND){
      const g=randomGenome(T.PLANT);
      grid[idx(x,y)]=agentWithStrain(T.PLANT,g,registerStrain(T.PLANT,g),{energy:120});
      POP[T.PLANT]++;
    }
  }
  // Ants
  for(let n=0;n<20;n++){
    const x=Math.floor(Math.random()*W2),y=Math.floor(Math.random()*H2);
    if(!get(x,y)){const g=randomGenome(T.ANT);grid[idx(x,y)]=agentWithStrain(T.ANT,g,registerStrain(T.ANT,g),{energy:150});POP[T.ANT]++;}
  }
  // 2 Queens
  for(let n=0;n<2;n++){
    for(let att=0;att<20;att++){const x=Math.floor(Math.random()*W2),y=Math.floor(Math.random()*H2);if(!get(x,y)){const g=randomGenome(T.QUEEN);grid[idx(x,y)]=agentWithStrain(T.QUEEN,g,registerStrain(T.QUEEN,g),{energy:200});POP[T.QUEEN]++;break;}}
  }
  // Spiders
  for(let n=0;n<5;n++){
    const x=Math.floor(Math.random()*W2),y=Math.floor(Math.random()*H2);
    if(!get(x,y)){const g=randomGenome(T.SPIDER);grid[idx(x,y)]=agentWithStrain(T.SPIDER,g,registerStrain(T.SPIDER,g),{energy:150});POP[T.SPIDER]++;}
  }
  // Fungi (in lower, darker zones)
  for(let n=0;n<20;n++){
    const x=Math.floor(Math.random()*W2),y=Math.floor(H2*0.6+Math.random()*H2*0.4);
    if(!get(x,y)){const g=randomGenome(T.FUNGI);grid[idx(x,y)]=agentWithStrain(T.FUNGI,g,registerStrain(T.FUNGI,g),{energy:100});POP[T.FUNGI]++;}
  }
  // Mites
  for(let n=0;n<15;n++){
    const x=Math.floor(Math.random()*W2),y=Math.floor(Math.random()*H2);
    if(!get(x,y)){const g=randomGenome(T.MITE);grid[idx(x,y)]=agentWithStrain(T.MITE,g,registerStrain(T.MITE,g),{energy:120});POP[T.MITE]++;}
  }
  // Life seed mutagens
  for(let n=0;n<8;n++){
    const x=Math.floor(Math.random()*W2),y=Math.floor(Math.random()*H2);
    if(!get(x,y))grid[idx(x,y)]={t:T.MUTAGEN,age:0,energy:100};
  }
}

export function resetSim(){
  grid.fill(null);lightGrid.fill(0);pheroGrid.fill(0);
  rainActive=false;acidRainActive=false;
  strainRegistry.clear();nextStrain=1;
  tickCount=0;
  Object.keys(POP).forEach(k=>POP[k]=0);
  sunActive=true;sunX=Math.floor(W*0.5);sunY=10;
  boxTurns=0;boxAngle=0;gv={x:0,y:1};
  wrap.style.transform='rotate(0deg)';
  document.getElementById('ang').textContent='0°';
  document.getElementById('hint-text').style.transform='rotate(0deg)';
  nextEvent=800+Math.floor(Math.random()*800);
  activeEvent=null;
  document.getElementById('klist').innerHTML='';
  fridgeZones=[];
  heldMutagen=null;
  for(const t of [T.PLANT,T.ANT,T.QUEEN,T.SPIDER,T.FUNGI,T.MITE,T.QUEEN_SPIDER,T.QUEEN_MITE]) POP_HISTORY[t]=[];
  for(const id of customCreatures.keys()){POP[id]=0;POP[id+100]=0;}
  exitObserveMode();
  document.getElementById('held-panel').style.display='none';
  NARRATOR_LINES.length=0;
  Object.keys(lastNarratorState).forEach(k=>delete lastNarratorState[k]);
  const narEl=document.getElementById('narrator');
  if(narEl) narEl.innerHTML='<span style="color:var(--dim)">Awaiting life...</span>';

  // Build blank world: sand floor + water pool + gold sand + detritus
  // No life — player seeds it manually
  for(let x=0;x<W;x++) for(let d=0;d<12;d++) grid[idx(x,H-1-d)]=abiotic(T.SAND);
  for(let n=0;n<100;n++){const x=Math.floor(Math.random()*W);grid[idx(x,H-2-Math.floor(Math.random()*8))]=abiotic(T.GOLD_SAND);}
  for(let x=0;x<Math.floor(W*0.25);x++) for(let y=H-8;y<H-1;y++) if(Math.random()<0.7)grid[idx(x,y)]=abiotic(T.WATER);
}

// ================================================================
//  RANDOM MAP GENERATOR
//  Cave-system terrain: clay + water pockets + sand floor
//  Auto-generates 5 random creatures and seeds base life
// ================================================================
export function randomMap(){
  resetSim();
  grid.fill(null);
  Object.keys(POP).forEach(k=>POP[k]=0);
  customCreatures.forEach((_,id)=>{
    delete POP[id]; delete POP[id+100]; delete POP_MAX[id]; delete POP_MAX[id+100];
    if(POP_HISTORY[id]) delete POP_HISTORY[id];
  });
  customCreatures.clear(); nextCustomId=T.CUSTOM_BASE;
  selectedCustom=null;

  const rnd=(lo,hi)=>lo+Math.floor(Math.random()*(hi-lo));
  const shuffle=(a)=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};

  // ── CAVE CARVING ──────────────────────────────────────────────────
  // Goal: dense clay (~80%), large open chambers, branching tunnels, no speckle.
  // Approach: start mostly solid, carve large rooms + drunkard-walk tunnels.
  const solid=new Uint8Array(W*H); // 1=clay, 0=empty

  // Helper: run CA smoothing (cleans up jagged edges)
  const caSmooth=(map,passes,fillThresh,emptyThresh)=>{
    const tmp=new Uint8Array(W*H);
    for(let p=0;p<passes;p++){
      for(let y=0;y<H;y++) for(let x=0;x<W;x++){
        let solidNbrs=0;
        for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
          if(dx===0&&dy===0) continue;
          const nx2=x+dx,ny2=y+dy;
          if(!inB(nx2,ny2)||map[ny2*W+nx2]) solidNbrs++;
        }
        tmp[y*W+x]=solidNbrs>=fillThresh?1:(solidNbrs<=emptyThresh?0:map[y*W+x]);
      }
      map.set(tmp);
    }
  };

  // STEP 1: Start nearly all solid — just light noise so CA has texture to work with
  for(let i=0;i<W*H;i++) solid[i]=Math.random()<0.88?1:0; // 88% solid base
  // Force top 15% open (air zone)
  for(let y=0;y<Math.floor(H*0.15);y++) for(let x=0;x<W;x++) solid[y*W+x]=0;
  // Force bottom 10 rows solid (will become sand)
  for(let y=H-10;y<H;y++) for(let x=0;x<W;x++) solid[y*W+x]=1;

  // One CA pass to clean up any isolated specks from the noise
  caSmooth(solid,3,5,0);

  // STEP 2: Carve 5-9 large organic chambers using ellipse + CA blur
  const chamberCount=rnd(5,10);
  for(let c=0;c<chamberCount;c++){
    const cx2=rnd(8,W-8);
    const cy2=rnd(Math.floor(H*0.18),H-18);
    const rx=rnd(6,18);
    const ry=rnd(5,14);
    // Carve ellipse
    for(let dy=-ry;dy<=ry;dy++) for(let dx=-rx;dx<=rx;dx++){
      if((dx*dx)/(rx*rx)+(dy*dy)/(ry*ry)<=1){
        const px=cx2+dx, py=cy2+dy;
        if(inB(px,py)&&py>Math.floor(H*0.13)&&py<H-9) solid[py*W+px]=0;
      }
    }
  }

  // STEP 3: Drunkard-walk tunnels branching off from each chamber
  // This creates the organic winding passages with branches
  const drunkWalk=(sx,sy,steps,width,branchProb)=>{
    let cx2=sx,cy2=sy;
    // Cardinal dirs weighted toward horizontal for cave feel
    const dirs=[[1,0],[1,0],[-1,0],[-1,0],[0,1],[0,-1]];
    let dir=dirs[Math.floor(Math.random()*dirs.length)];
    for(let s=0;s<steps;s++){
      // Occasionally turn
      if(Math.random()<0.18) dir=dirs[Math.floor(Math.random()*dirs.length)];
      // Carve around current pos
      for(let dy=-width;dy<=width;dy++) for(let dx=-width;dx<=width;dx++){
        const px=cx2+dx,py=cy2+dy;
        if(inB(px,py)&&py>Math.floor(H*0.13)&&py<H-9) solid[py*W+px]=0;
      }
      cx2+=dir[0]; cy2+=dir[1];
      if(!inB(cx2,cy2)||cy2<Math.floor(H*0.13)||cy2>=H-9){
        cx2=Math.max(2,Math.min(W-3,cx2));
        cy2=Math.max(Math.floor(H*0.14),Math.min(H-10,cy2));
        dir=dirs[Math.floor(Math.random()*dirs.length)];
      }
      // Spawn branch
      if(Math.random()<branchProb){
        const bDir=dirs[Math.floor(Math.random()*dirs.length)];
        const bLen=rnd(15,50);
        let bx=cx2,by=cy2;
        for(let b=0;b<bLen;b++){
          for(let dy=-Math.max(1,width-1);dy<=Math.max(1,width-1);dy++) for(let dx=-Math.max(1,width-1);dx<=Math.max(1,width-1);dx++){
            const px=bx+dx,py=by+dy;
            if(inB(px,py)&&py>Math.floor(H*0.13)&&py<H-9) solid[py*W+px]=0;
          }
          bx+=bDir[0]; by+=bDir[1];
          if(!inB(bx,by)||by<Math.floor(H*0.14)||by>=H-9) break;
        }
      }
    }
  };

  // Walk tunnels between chambers to ensure connectivity
  const tunnelCount=rnd(8,14);
  for(let t=0;t<tunnelCount;t++){
    const sx=rnd(5,W-5), sy=rnd(Math.floor(H*0.18),H-18);
    drunkWalk(sx,sy,rnd(60,140),rnd(1,2),0.08);
  }

  // STEP 4: Stamp 3-6 large dense clay masses (geological intrusions)
  const massCount=rnd(3,7);
  for(let m=0;m<massCount;m++){
    const cx2=rnd(10,W-10);
    const cy2=rnd(Math.floor(H*0.2),H-15);
    const rx=rnd(10,26);
    const ry=rnd(8,18);
    for(let dy=-ry;dy<=ry;dy++) for(let dx=-rx;dx<=rx;dx++){
      if((dx*dx)/(rx*rx)+(dy*dy)/(ry*ry)<=1){
        const px=cx2+dx, py=cy2+dy;
        if(inB(px,py)&&py<H-9) solid[py*W+px]=1;
      }
    }
  }

  // STEP 5: Final CA smoothing — removes any remaining single-cell speckle
  // Strong fill threshold so isolated open specks fill in, but doesn't close large voids
  caSmooth(solid,2,7,1);

  // Apply to grid as CLAY_HARD (30% reinforced)
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    if(solid[y*W+x]) grid[idx(x,y)]={t:T.CLAY_HARD,age:0,reinforced:Math.random()<0.3};
  }

  // ── SAND FLOOR ───────────────────────────────────────────────────
  for(let x=0;x<W;x++) for(let d=0;d<8;d++) grid[idx(x,H-1-d)]=abiotic(T.SAND);
  // Gold sand vein along bottom — clustered, not random
  const veinX=rnd(10,W-30);
  for(let n=0;n<80;n++){
    const x=veinX+rnd(-15,15), y=H-2-rnd(0,12);
    if(inB(x,y)) grid[idx(x,y)]=abiotic(T.GOLD_SAND);
  }
  // White sand patches elsewhere
  for(let n=0;n<30;n++){
    const x=rnd(0,W), y=H-2-rnd(0,6);
    if(inB(x,y)&&grid[idx(x,y)]?.t===T.SAND) grid[idx(x,y)]=abiotic(T.WHITE_SAND);
  }

  // ── ELEMENT POCKETS ──────────────────────────────────────────────
  // Helper: flood-fill empty cells from seed point up to maxSize, bias direction
  const floodFill=(sx,sy,maxSize,downBias=0.6)=>{
    const cells=[];const vis=new Set();const stk=[[sx,sy]];
    while(stk.length&&cells.length<maxSize){
      const[cx2,cy2]=stk.pop();const ci2=cy2*W+cx2;
      if(vis.has(ci2)||!inB(cx2,cy2)||grid[idx(cx2,cy2)]) continue;
      vis.add(ci2);cells.push([cx2,cy2]);
      if(Math.random()<downBias) stk.push([cx2,cy2+1]);
      stk.push([cx2-1,cy2],[cx2+1,cy2]);
      if(Math.random()<0.25) stk.push([cx2,cy2-1]);
    }
    return cells;
  };

  const pickEmpty=(yMin,yMax,attempts=300)=>{
    for(let a=0;a<attempts;a++){
      const x=rnd(0,W), y=rnd(yMin,yMax);
      if(inB(x,y)&&!grid[idx(x,y)]) return[x,y];
    }
    return null;
  };

  // WATER: 4-7 pools, varied sizes (small 20-40, medium 50-100, large 100-200)
  const waterCount=rnd(4,8);
  for(let i=0;i<waterCount;i++){
    const seed=pickEmpty(Math.floor(H*0.3),H-12);
    if(!seed) continue;
    const size=Math.random()<0.3?rnd(20,50):Math.random()<0.5?rnd(50,120):rnd(120,220);
    for(const[fx,fy] of floodFill(...seed,size,0.75)) grid[idx(fx,fy)]=abiotic(T.WATER);
  }

  // OIL: 2-4 small slicks, tends to appear mid-depth
  const oilCount=rnd(2,5);
  for(let i=0;i<oilCount;i++){
    const seed=pickEmpty(Math.floor(H*0.25),Math.floor(H*0.75));
    if(!seed) continue;
    for(const[fx,fy] of floodFill(...seed,rnd(15,50),0.3)) grid[idx(fx,fy)]=abiotic(T.OIL);
  }

  // ICE: 1-3 frozen pockets in upper zone (cold at height)
  const iceCount=rnd(1,4);
  for(let i=0;i<iceCount;i++){
    const seed=pickEmpty(Math.floor(H*0.1),Math.floor(H*0.45));
    if(!seed) continue;
    for(const[fx,fy] of floodFill(...seed,rnd(10,40),0.4))
      grid[idx(fx,fy)]={t:T.ICE,age:0,ttl:800+rnd(0,400)};
  }

  // LAVA: 1-3 vents in deep zone, very small pockets
  const lavaCount=rnd(1,4);
  for(let i=0;i<lavaCount;i++){
    const seed=pickEmpty(Math.floor(H*0.6),H-12);
    if(!seed) continue;
    for(const[fx,fy] of floodFill(...seed,rnd(5,25),0.5))
      grid[idx(fx,fy)]={t:T.LAVA,age:0,ttl:500+rnd(0,300)};
  }

  // ACID: 0-2 rare corrosive pools, mid zone
  if(Math.random()<0.55){
    const aCount=rnd(1,3);
    for(let i=0;i<aCount;i++){
      const seed=pickEmpty(Math.floor(H*0.35),Math.floor(H*0.7));
      if(!seed) continue;
      for(const[fx,fy] of floodFill(...seed,rnd(8,30),0.6))
        grid[idx(fx,fy)]={t:T.ACID,age:0,ttl:300};
    }
  }

  // Collect remaining empty spots for scatter elements
  const allEmpty=[];
  for(let y=Math.floor(H*0.12);y<H-9;y++) for(let x=0;x<W;x++)
    if(!grid[idx(x,y)]) allEmpty.push([x,y]);
  const spots=shuffle([...allEmpty]);
  let si=0;
  const scatter=(t,count,extra={})=>{
    for(let n=0;n<count&&si<spots.length;n++,si++){
      const[x,y]=spots[si];grid[idx(x,y)]={t,age:0,...extra};
    }
  };

  // STONE: clustered formations, scattered across all depths
  scatter(T.STONE, rnd(20,40), {settled:5});
  // WOOD: mid-to-upper zone (buried forest)
  scatter(T.WOOD, rnd(20,35));
  // DETRITUS: organic matter everywhere
  scatter(T.DETRITUS, rnd(40,70));
  // SALT: mid zone deposits
  scatter(T.SALT, rnd(10,20));
  // GUNPOWDER: rare pockets
  if(Math.random()<0.5) scatter(T.GUNPOWDER, rnd(5,12));
  // ASH: near bottom and mid (old burn zones)
  scatter(T.ASH, rnd(15,30));
  // STEAM vents: a few near lava zones (placed as steam particles rising)
  if(Math.random()<0.4) scatter(T.STEAM, rnd(3,8), {ttl:60});
  // WHITE SAND patches mid-cave
  scatter(T.WHITE_SAND, rnd(15,25));
  // MUTAGEN: 1-3 life seeds near gold sand
  scatter(T.MUTAGEN, rnd(1,4), {energy:120, recipe:[128,128,128,128,128,128]});

  // ── 5 RANDOM CREATURES ───────────────────────────────────────────
  const _archetypes=['creature','creature','creature','plant','fungi'];
  const _sizes=[{id:'tiny',name:'Tiny',hp:30,energy:80,speed:2.0},{id:'small',name:'Small',hp:60,energy:120,speed:1.5},{id:'medium',name:'Medium',hp:100,energy:150,speed:1.0},{id:'large',name:'Large',hp:180,energy:200,speed:0.6}];
  const _movs=[{id:'walker',name:'Walker',icon:'🚶'},{id:'flyer',name:'Flyer',icon:'🦋'},{id:'swimmer',name:'Swimmer',icon:'🐟'},{id:'burrower',name:'Burrower',icon:'🐛'},{id:'climber',name:'Climber',icon:'🦎'},{id:'swarmer',name:'Swarmer',icon:'🐝'}];
  const _diets=[{id:'omnivore',name:'Omnivore',targets:[T.PLANT,T.FUNGI,T.DETRITUS,T.ASH],icon:'🍽️'},{id:'herbivore',name:'Herbivore',targets:[T.PLANT,T.SEED],icon:'🌿'},{id:'fungivore',name:'Fungivore',targets:[T.FUNGI,T.SPORE],icon:'🍄'},{id:'detritivore',name:'Detritivore',targets:[T.DETRITUS,T.ASH],icon:'🍂'},{id:'photosynthetic',name:'Photosynthetic',targets:[],icon:'☀️'},{id:'pyrotroph',name:'Pyrotroph',targets:[T.LAVA,T.FIRE],icon:'🔥'},{id:'cryotroph',name:'Cryotroph',targets:[T.ICE,T.WATER],icon:'❄️'}];
  const _repros=[{id:'budding',name:'Budding',rate:0.02},{id:'spore',name:'Spore',rate:0.008},{id:'cloning',name:'Cloning',rate:0.015},{id:'flowering',name:'Flowering',rate:0.005}];
  const _icons=['🐜','🐛','🦗','🦟','🐞','🦂','🦀','🐙','🦑','🌸','🌺','🍄','👾','👽','🤖','💀','🔮','💎','⭐','❄️'];
  const _rndpick=a=>a[Math.floor(Math.random()*a.length)];
  const _elemDefault={fire:'die',lava:'die',water:'ignore',ice:'ignore',acid:'die',salt:'ignore',smoke:'ignore',steam:'ignore',sand:'ignore',clay:'ignore',wood:'ignore',detritus:'ignore',oil:'ignore',gunpowder:'ignore'};

  for(let n=0;n<5;n++){
    const arch=_archetypes[n];
    const aggr=arch==='creature'?Math.random():0;
    const reproRate=0.2+Math.random()*0.6;
    const hue=Math.floor(Math.random()*360);
    const size=_rndpick(_sizes);
    const mov=arch==='creature'?_rndpick(_movs):{id:'sessile',name:'Sessile',icon:'🌿'};
    const diet=arch==='plant'?{id:'photosynthetic',name:'Photosynthetic',targets:[],icon:'☀️'}:arch==='fungi'?{id:'detritivore',name:'Detritivore',targets:[T.DETRITUS,T.ASH],icon:'🍂'}:_rndpick(_diets);
    const repro=arch==='plant'?_rndpick([_repros[0],_repros[3]]):arch==='fungi'?_repros[1]:_rndpick(_repros);
    const preyTypes=arch==='creature'&&aggr>0.3?[_rndpick([T.ANT,T.SPIDER,T.MITE,T.FUNGI,T.PLANT])]:[];
    const specials=Math.random()<0.5?[_rndpick(SPECIAL_OPTIONS||[])]:[];
    const c={
      id:nextCustomId,
      name:`Creature ${n+1}`,
      icon:_rndpick(_icons),
      hue, sat:65, lit:35,
      archetype:arch,
      movement:mov,
      diet,
      reproduction:{...repro,rate:0.004+reproRate*0.02},
      size,
      specials:specials.filter(Boolean),
      tolerances:[],
      elemBehaviors:{..._elemDefault},
      preyTypes,
      includesCustomPrey:false,
      allyTypes:[],
      huntedByTypes:[],
      aggression:aggr,
      fear:Math.random()*0.5,
      attackId:_rndpick(['bite','venom','acid_spit','fire_breath','crush']),
      lightReq:arch==='fungi'?0.1:0.3,
      spreadSpeed:arch==='plant'||arch==='fungi'?0.3+Math.random()*0.4:0.1,
      flowerEmit:arch==='plant'?_rndpick(['none','spore','seed','smoke']):'none',
      genome:Array(6).fill(0).map((_,i)=>i===3?Math.floor(aggr*255):i===5?Math.floor(reproRate*255):Math.floor(100+Math.random()*100)),
      created:tickCount,
    };
    c.interactions=generateInteractions(c);
    customCreatures.set(c.id,c);
    nextCustomId++;
    POP[c.id]=0; POP[c.id+100]=0;
    POP_MAX[c.id]=800; POP_MAX[c.id+100]=10;
    POP_HISTORY[c.id]=[];
  }
  updateCustomList(); updateLabHistory();

  document.dispatchEvent(new CustomEvent('game:toast',{detail:{name:'RANDOM WORLD GENERATED',desc:'5 creatures ready · Paint life to begin · Explore the caves'}}));
}

// ================================================================
//  CREATURE LAB HOVER CARD
// ================================================================
