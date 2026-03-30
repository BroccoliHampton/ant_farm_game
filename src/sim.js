// Canvas context — set by main.js at boot
let _ctx=null,_canvas=null,_S=4;
export function initRenderer(canvas,ctx,s){ _canvas=canvas; _ctx=ctx; if(s)_S=s; }

// ================================================================
//  SIM — Particle dispatch, renderer, simulation loop
//  Adjust buildOrder() to change update priority between elements.
// ================================================================
import { W, H, T, KINGDOM_HUE, K_COLORS } from './constants.js';
import { grid, lightGrid, pheroGrid, POP, POP_MAX, POP_HISTORY, POP_GRAPH_MAX,
         gv, sunX, sunY, sunActive, tickCount, incTick, speedMult, mutRate,
         lastPopSample, setLastPopSample, imageData, pixels, setImageBuffer,
         activeEvent, activeEventAge, setActiveEvent, setNextEvent, nextEvent,
         rainActive, rainTicks, rainDuration, acidRainActive, acidRainTicks, acidRainDuration,
         setRain, setAcidRain, ws_rain_active, customCreatures } from './state.js';
import { idx, inB, get, getDens, getNeighbors, swap, hslToRgb, popDecr } from './utils.js';
import { mutateGenome, registerStrain } from './genome.js';
import { updateLight } from './physics.js';
import { stepClay, stepFire, stepLava, stepStone, stepSteam, stepIce, stepSmoke,
         stepWood, stepAsh, stepAcid, stepGunpowder, stepSalt, stepCloud,
         stepBloomCloud, stepBloomFire, stepProgCloud, stepProgVoid,
         stepWeatherStation, stepMutagen, weatherTick } from './elements.js';
import { stepPlant, stepAnt, stepQueen, stepEgg, stepSpider, stepFungi, stepSpore,
         stepMite, stepSeed, stepFrogstone, stepQueenSpider, stepQueenMite,
         stepWeb, stepCustom } from './kingdoms.js';

export function stepParticle(x,y){
  const p=grid[idx(x,y)];
  if(!p)return;
  p.age++;
  // PROG_VOID and FROGSTONE run before immovable check (they self-anchor)
  if(p.t===T.PROG_VOID){stepProgVoid(x,y,p);return;}
  if(p.t===T.FROGSTONE){
    // Anchor all frogstone cells in place — they never move
    if(grid[idx(x,y)]!==p) grid[idx(x,y)]=p;
    stepFrogstone(x,y,p);
    return;
  }
  if(isImmovable(p.t))return;
  if(p.t===T.CLAY_HARD)return;
  if(p.t===T.STONE&&(p.settled||0)>=3)return; // settled stone = static

  // Custom lab creatures
  if(p.t===T.CUSTOM_BASE){stepCustom(x,y,p);return;}

  // Special mechanical/environmental objects
  if(p.t===T.CLOUD){stepCloud(x,y,p);return;}
  if(p.t===T.BLOOM_CLOUD){stepBloomCloud(x,y,p);return;}
  if(p.t===T.BLOOM_FIRE){stepBloomFire(x,y,p);return;}
  if(p.t===T.PROG_CLOUD){stepProgCloud(x,y,p);return;}
  if(p.t===T.WEATHER_STATION){stepWeatherStation(x,y,p);return;}
  if(p.t===T.PROG_VOID){stepProgVoid(x,y,p);return;}

  // Classic sand elements — special step logic
  if(p.t===T.LAVA){stepLava(x,y,p);return;}
  if(p.t===T.STEAM){stepSteam(x,y,p);return;}
  if(p.t===T.ICE){stepIce(x,y,p);return;}
  if(p.t===T.SMOKE){stepSmoke(x,y,p);return;}
  if(p.t===T.WOOD){stepWood(x,y,p);return;}
  if(p.t===T.ASH){stepAsh(x,y,p);return;}
  if(p.t===T.ACID){stepAcid(x,y,p);return;}
  if(p.t===T.GUNPOWDER){stepGunpowder(x,y,p);return;}
  if(p.t===T.SALT){stepSalt(x,y,p);return;}
  if(p.t===T.STONE){stepStone(x,y,p);return;}

  // Plant wall — biological, needs its own step (decay, detritus)

  // Passive gravity for abiotic
  if(!p.g&&p.t!==T.WEB&&p.t!==T.FIRE&&p.t!==T.MUTAGEN&&p.t!==T.SPORE&&p.t!==T.FROGSTONE
      &&p.t!==T.LAVA&&p.t!==T.STEAM&&p.t!==T.ICE&&p.t!==T.SMOKE
      &&p.t!==T.WOOD&&p.t!==T.ASH&&p.t!==T.ACID&&p.t!==T.GUNPOWDER
      &&p.t!==T.SALT&&p.t!==T.STONE&&p.t!==T.CLOUD&&p.t!==T.BLOOM_CLOUD&&p.t!==T.BLOOM_FIRE
      &&p.t!==T.PROG_CLOUD&&p.t!==T.WEATHER_STATION&&p.t!==T.PROG_VOID){
    if(p.t===T.WATER||p.t===T.OIL)tryFlow(x,y);
    else if(p.t===T.CLAY) stepClay(x,y,p);
    else tryFall(x,y,p);
    return;
  }
  if(p.t===T.WEB){stepWeb(x,y,p);return;}
  if(p.t===T.FIRE){stepFire(x,y,p);return;}
  if(p.t===T.MUTAGEN){stepMutagen(x,y,p);return;}
  if(p.t===T.SPORE){stepSpore(x,y,p);return;}
  if(p.t===T.EGG){stepEgg(x,y,p);return;}
  if(p.t===T.SEED){stepSeed(x,y,p);return;}
  if(p.t===T.QUEEN_SPIDER){stepQueenSpider(x,y,p);return;}
  if(p.t===T.QUEEN_MITE){stepQueenMite(x,y,p);return;}

  // Passive gravity — only mites (fast, skittery) among agents obey simple density physics
  // Ants and spiders handle gravity inside their own step functions
  const mobile=(p.t===T.MITE);
  if(mobile&&p.g){
    const dens=getDens(p);
    const below=get(x+gv.x,y+gv.y);
    const belD=getDens(below);
    if(dens>3.5&&(!below||belD<dens-0.5)&&Math.random()<0.4){
      swap(x,y,x+gv.x,y+gv.y);
    } else if(dens<2&&Math.random()<0.2){
      tryRise(x,y);
    }
  }

  if(!p.g)return;

  // Kingdom-specific behavior
  switch(p.t){
    case T.PLANT:   stepPlant(x,y,p);   break;
    case T.ANT:     stepAnt(x,y,p);     break;
    case T.QUEEN:   stepQueen(x,y,p);   break;
    case T.SPIDER:  stepSpider(x,y,p);  break;
    case T.FUNGI:   stepFungi(x,y,p);   break;
    case T.MITE:    stepMite(x,y,p);    break;
  }
}

// ================================================================
//  SPONTANEOUS EVENTS
// ================================================================
let nextEvent=800+Math.floor(Math.random()*800);
const EVENTS=[
  {name:'DROUGHT',desc:'Water levels drop sharply across the board. Aquatic zones shrink and moisture-dependent organisms struggle.',fn:()=>{
    for(let i=0;i<W*H;i++){const p=grid[i];if(p?.t===T.WATER&&Math.random()<0.3)grid[i]=null;}
  }},
  {name:'BLOOM',desc:'A mineral upwelling scatters gold sand across the substrate. Nutrients surge — plant growth will accelerate.',fn:()=>{
    for(let n=0;n<80;n++){const x=Math.floor(Math.random()*W),y=Math.floor(Math.random()*H);if(!get(x,y))set(x,y,abiotic(T.GOLD_SAND));}
  }},
  {name:'WILDFIRE',desc:'Fires ignite in the plant matter. Organic material burns to detritus — a cycle of destruction and renewal.',fn:()=>{
    for(let n=0;n<8;n++){const x=Math.floor(Math.random()*W),y=Math.floor(Math.random()*H);const p=get(x,y);if(p?.t===T.PLANT||p?.t===T.PLANT_WALL)grid[idx(x,y)]={t:T.FIRE,age:0,ttl:30};}
  }},
  {name:'PLAGUE',desc:'A virulent pathogen sweeps through all kingdoms. 30% of agents take heavy damage — the weak die first.',fn:()=>{
    for(let i=0;i<W*H;i++){const p=grid[i];if(p?.g&&Math.random()<0.3){p.hp-=40;if(p.hp<=0){grid[i]=null;popDecr(p);}}}
  }},
  {name:'SPORE STORM',desc:'A cloud of fungal spores blankets the board. New fungi colonies establish in dark zones across the terrarium.',fn:()=>{
    for(let n=0;n<30;n++){const x=Math.floor(Math.random()*W),y=Math.floor(Math.random()*H);if(!get(x,y)){const g=[128,180,200,40,120,180];set(x,y,agentWithStrain(T.FUNGI,g,registerStrain(T.FUNGI,g),{energy:80}));POP[T.FUNGI]++;}}
  }},
  {name:'RAINSTORM',desc:'Rain falls across the terrarium. Plants bloom, seeds germinate, and water pools on every surface.',fn:()=>{
    rainActive=true; rainTicks=0; rainDuration=200+Math.floor(Math.random()*200);
  }},
  {name:'ACID RAIN',desc:'Corrosive precipitation falls from above. Organic matter takes damage — only the resilient survive.',fn:()=>{
    acidRainActive=true; acidRainTicks=0; acidRainDuration=80+Math.floor(Math.random()*80);
  }},
];

let activeEvent=null,activeEventAge=0;
// Rain state
let rainActive=false,rainTicks=0,rainDuration=0;
let acidRainActive=false,acidRainTicks=0,acidRainDuration=0;

// ================================================================
//  RENDER
// ================================================================
export function render(){
  if(!imageData){imageData=ctx.createImageData(canvas.width,canvas.height);pixels=new Uint32Array(imageData.data.buffer);}
  pixels.fill(0xFF080810);

  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const p=grid[idx(x,y)];
    if(!p){continue;}
    let col=getColor(p,x,y);
    for(let dy=0;dy<_S;dy++)for(let dx=0;dx<_S;dx++)pixels[(y*_S+dy)*canvas.width+(x*_S+dx)]=col;
  }

  // Sun dot
  if(sunActive){
    const sx=Math.round(sunX*_S),sy=Math.round(sunY*_S);
    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){if(dx*dx+dy*dy<=16){const px=sx+dx,py=sy+dy;if(px>=0&&px<canvas.width&&py>=0&&py<canvas.height)pixels[py*canvas.width+px]=0xFF32F0FF;}}
  }

  _ctx.putImageData(imageData,0,0);

  // Draw Frogstone tongues as canvas overlay — only hub cells with active tongue
  _ctx.save();
  for(let i=0;i<W*H;i++){
    const p=grid[i];
    if(p?.t!==T.FROGSTONE||!p.isHub||!p.tongue) continue;
    const bx=(i%W)*_S+Math.floor(_S/2);
    const by=Math.floor(i/W)*_S+Math.floor(_S/2);
    const {tx,ty,hold,maxHold}=p.tongue;
    const tipX=tx*_S+Math.floor(_S/2);
    const tipY=ty*_S+Math.floor(_S/2);
    // Fade out as hold expires
    const alpha=0.95-0.15*(hold/maxHold);
    // Tongue body — hot pink
    _ctx.beginPath();
    _ctx.moveTo(bx,by);
    _ctx.lineTo(tipX,tipY);
    _ctx.strokeStyle=`rgba(255,60,170,${alpha})`;
    _ctx.lineWidth=Math.max(2,Math.floor(_S*0.5));
    _ctx.lineCap='round';
    _ctx.stroke();
    // Bright forked tip
    _ctx.beginPath();
    _ctx.arc(tipX,tipY,Math.max(2,_S*0.7),0,Math.PI*2);
    _ctx.fillStyle=`rgba(255,160,220,${alpha})`;
    _ctx.fill();
    // Glow
    _ctx.beginPath();
    _ctx.arc(tipX,tipY,Math.max(4,_S*1.2),0,Math.PI*2);
    _ctx.fillStyle=`rgba(255,80,160,${alpha*0.3})`;
    _ctx.fill();
  }
  _ctx.restore();
}
export function getColor(p,x,y){
  if(!p)return 0;
  // Custom lab creatures
  if(p.t===T.CUSTOM_BASE&&p.customType){
    const def=customCreatures.get(p.customType);
    if(def){
      const lv=lightGrid[idx(x,y)];
      let lit=def.lit+lv*15+((p.hp||100)/100)*10;
      if((def.specials||[]).some(s=>s.id==='bioluminescent')&&lv<0.2)lit+=25;
      if(p.isQueen)lit+=12;
      const[cr,cg,cb]=hslToRgb(def.hue,def.sat,lit);
      return 0xFF000000|(cb<<16)|(cg<<8)|cr;
    }
  }
  const lv=lightGrid[idx(x,y)];
  let r=0,g=0,b=0;

  switch(p.t){
    case T.WALL:       r=60;g=60;b=60;break;
    case T.CLAY:       {const v=Math.floor(Math.random()*10);r=120+v;g=130+v;b=155+v;break;} // blue-grey wet clay
    case T.CLAY_HARD:  {const v=Math.floor(Math.random()*8);
      if(p.reinforced){r=70+v;g=78+v;b=100+v;} // darker blue-grey — reinforced, ant-proof
      else{r=95+v;g=105+v;b=130+v;}              // normal diggable clay
      break;}
    case T.FRIDGE_WALL:{const fl=Math.random()<0.1;r=fl?80:50;g=fl?160:130;b=fl?220:200;break;}
    case T.PLANT_WALL: r=20;g=80;b=25;break;
    case T.SAND:       r=185+Math.floor(Math.random()*10);g=155;b=80;break;
    case T.GOLD_SAND:  r=220+Math.floor(Math.random()*20);g=180;b=0;break;
    case T.WHITE_SAND: r=210;g=210;b=205;break;
    case T.DETRITUS:   r=80;g=65;b=45;break;
    case T.WATER:      r=50+(lv*30)|0;g=120+(lv*20)|0;b=200;break;
    case T.OIL:        r=25;g=55;b=20;break;
    case T.MUTAGEN:    {const v=(40+Math.random()*80)|0;r=200+v*0.3|0;g=0;b=220;break;}
    case T.WEB:        {const f=Math.min(1,(p.ttl||100)/200);r=g=b=160+f*60;break;}
    case T.EGG:        r=220;g=200;b=120;break;
    case T.SPORE:      r=160;g=80;b=220;break;
    case T.CLOUD: {
      // White-grey puff, brighter when more charged, flickers at edges
      const charge=(p.charge||120)/255;
      const fl=Math.random()<0.3;
      r=fl?255:Math.floor(180+charge*60);
      g=fl?255:Math.floor(200+charge*40);
      b=fl?255:Math.floor(210+charge*40);
      break;
    }
    case T.BLOOM_CLOUD: {const f=Math.random()<0.2;r=f?200:120;g=f?60:20;b=f?80:30;break;}
    case T.BLOOM_FIRE: {const f=Math.random();r=255;g=f<0.3?200:f<0.7?120:60;b=f<0.2?180:0;break;}
    case T.PROG_CLOUD: {
      const et=p.emitType||T.WATER;
      const cols={[T.WATER]:[80,160,240],[T.ACID]:[200,220,0],[T.LAVA]:[255,80,0],[T.ICE]:[160,220,255],[T.FIRE]:[255,160,20],[T.SALT]:[220,220,220],[T.SAND]:[185,155,80],[T.OIL]:[40,80,30],[T.STEAM]:[200,200,220],[T.SMOKE]:[100,100,100],[T.ASH]:[90,88,85],[T.GUNPOWDER]:[70,65,60],[T.DETRITUS]:[90,75,55],[T.GOLD_SAND]:[220,180,0]}[et]||[160,200,240];
      const fl2=Math.random()<0.25;r=fl2?255:cols[0];g=fl2?255:cols[1];b=fl2?255:cols[2];
      break;
    }
    case T.WEATHER_STATION: {
      const ph=(p.phase||0);const pulse=Math.sin(ph*0.1)*0.5+0.5;
      r=Math.floor(40+pulse*30);g=Math.floor(80+pulse*60+(ws_rain_active?80:0));b=Math.floor(100+pulse*80);
      break;
    }
    case T.PROG_VOID: {
      const pulse2=p.pulse||0;
      r=Math.floor(20+pulse2*10);g=0;b=Math.floor(30+pulse2*15);
      if(pulse2>4&&Math.random()<0.5){r=120;g=0;b=180;}
      break;
    }
    case T.LAVA: {const fl=Math.random();r=255;g=fl<0.4?40:fl<0.7?80:140;b=0;break;}
    case T.STONE: {const v=Math.floor(Math.random()*12);r=100+v;g=100+v;b=100+v;break;}
    case T.STEAM: {const a=(p.ttl||80)/80;r=g=b=180+(a*40)|0;break;}
    case T.ICE:   {const s=Math.random()<0.1;r=s?240:180;g=s?250:220;b=s?255:240;break;}
    case T.SMOKE: {const a=Math.min(1,(p.ttl||60)/60);r=g=b=60+(a*50)|0;break;}
    case T.WOOD:  {const v=Math.floor(Math.random()*15);r=100+v;g=65+v;b=30;break;}
    case T.ASH:   {const v=Math.floor(Math.random()*20);r=70+v;g=68+v;b=65+v;break;}
    case T.ACID:  {const fl=Math.random()<0.2;r=fl?255:210;g=fl?220:170;b=fl?0:0;break;} // toxic yellow-orange
    case T.GUNPOWDER:{const v=Math.floor(Math.random()*8);r=60+v;g=55+v;b=50+v;break;}
    case T.SALT:  {const v=Math.floor(Math.random()*20);r=220+v;g=220+v;b=220+v;break;}
    case T.QUEEN_SPIDER:{const f=Math.random()<0.15;r=f?220:170;g=f?80:50;b=f?255:210;break;} // vivid purple
    case T.FROGSTONE: {
      const hubX=p.hubX||x, hubY=p.hubY||y;
      const sunPow2=Math.max(0,Math.min(1,1-(Math.sqrt(Math.pow(sunX-hubX,2)+Math.pow(sunY-hubY,2))/(W*0.45))));
      const isHub=p.isHub||false;
      if(isHub){
        // Hub = bright eye, pulses with sun power
        const pulse=Math.sin((p.phase||0)*0.2)*0.5+0.5;
        r=Math.floor(80+sunPow2*120+pulse*50);
        g=Math.floor(180+sunPow2*60+pulse*15);
        b=Math.floor(40);
        if(p.tongue){r=255;g=80;b=180;} // pink flash when tongue out
      } else {
        // Dome body — mossy stone green, darker at top
        const distFromHub=Math.abs(y-hubY);
        const shade=1-distFromHub*0.18;
        r=Math.floor((45+sunPow2*20)*shade);
        g=Math.floor((70+sunPow2*30)*shade);
        b=Math.floor((30)*shade);
      }
      break;
    }
    case T.FIRE: {
      const fl=Math.random();
      if(fl<0.3){r=255;g=0;b=0;}else if(fl<0.6){r=255;g=120;b=0;}else if(fl<0.85){r=255;g=200;b=0;}else{r=255;g=240;b=180;}
      break;
    }
    default:
      if(p.g){
        const baseHue=KINGDOM_HUE[p.t]||180;
        const hue=baseHue+(p.g[3]/255)*30-15;
        let sat=50+p.g[4]/255*30;
        let lit=25+((p.hp||100)/100)*20+(lv*8);
        // Neon green ants — high saturation, high lightness
        if(p.t===T.ANT){
          if(p.alpha){r=255;g=200;b=30;break;} // alpha = bright gold
          sat=95;lit=48+((p.hp||100)/100)*12;
        }
        // Deep forest green plants — lower lightness, more saturated
        if(p.t===T.PLANT){sat=70;lit=18+((p.hp||100)/100)*12+(lv*5);}
        // Bioluminescence for fungi in dark
        const glit=(p.t===T.FUNGI&&lv<0.1)?lit+30:lit;
        [r,g,b]=hslToRgb(hue,sat,glit);
      } else {r=g=b=80;}
  }
  return 0xFF000000|(b<<16)|(g<<8)|r;
}

// ================================================================
//  SIMULATION LOOP
// ================================================================
let lastTime=0,stepAccum=0,updateOrder=[],stepsSince=0,uiFrame=0;

export function buildOrder(){
  updateOrder=[];
  for(let i=0;i<W*H;i++)updateOrder.push(i);
  for(let i=updateOrder.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[updateOrder[i],updateOrder[j]]=[updateOrder[j],updateOrder[i]];}
}

export function simStep(){
  if(++stepsSince>40){buildOrder();stepsSince=0;}
  for(const i of updateOrder)if(grid[i])stepParticle(i%W,Math.floor(i/W));
  updateLight();

  // Spontaneous fire from oil/detritus
  if(tickCount%300===0){
    for(let a=0;a<30;a++){
      const i=Math.floor(Math.random()*W*H);
      const p=grid[i];
      if(!p||!(p.t===T.OIL||p.t===T.DETRITUS))continue;
      const x=i%W,y=Math.floor(i/W);
      const hasWater=getNeighbors(x,y).some(([nx,ny])=>get(nx,ny)?.t===T.WATER);
      if(!hasWater&&Math.random()<0.004)grid[i]={t:T.FIRE,age:0,ttl:25};
    }
  }

  updateNarrator();
  weatherTick();

  // RAIN: drop water particles along top edge each tick while active
  if(rainActive){
    rainTicks++;
    const drops=3+Math.floor(Math.random()*4);
    for(let d=0;d<drops;d++){
      const rx=Math.floor(Math.random()*W);
      // Find the top row (against gravity direction)
      const ty2=gv.y>0?0:(gv.y<0?H-1:gv.x>0?0:W-1);
      const tx2=gv.x===0?rx:(gv.x>0?0:W-1);
      const ry2=gv.y===0?rx:ty2;
      const finalX=gv.y!==0?rx:tx2;
      const finalY=gv.y!==0?ty2:ry2;
      if(inB(finalX,finalY)&&!grid[idx(finalX,finalY)])
        grid[idx(finalX,finalY)]={t:T.WATER,age:0};
    }
    if(rainTicks>=rainDuration)rainActive=false;
  }

  // ACID RAIN: drop acid from top
  if(acidRainActive){
    acidRainTicks++;
    for(let d=0;d<2;d++){
      const rx=Math.floor(Math.random()*W);
      const ty2=gv.y>0?0:H-1;
      if(inB(rx,ty2)&&!grid[idx(rx,ty2)])
        grid[idx(rx,ty2)]={t:T.ACID,age:0,ttl:120};
    }
    if(acidRainTicks>=acidRainDuration)acidRainActive=false;
  }

  // Pheromone decay
  for(let i=0;i<W*H;i++)if(pheroGrid[i]>0)pheroGrid[i]=Math.max(0,pheroGrid[i]-0.004);

  // Sample population history every 100 ticks
  if(tickCount-lastPopSample>=100){
    lastPopSample=tickCount;
    for(const t of [T.PLANT,T.ANT,T.QUEEN,T.SPIDER,T.FUNGI,T.MITE,T.QUEEN_SPIDER,T.QUEEN_MITE]){
      POP_HISTORY[t].push(POP[t]);
      if(POP_HISTORY[t].length>POP_GRAPH_MAX) POP_HISTORY[t].shift();
    }
  }

  // Recount populations every 20 ticks
  if(tickCount%20===0){
    for(const k of Object.keys(POP))POP[k]=0;
    for(const p of grid){if(p?.g&&POP[p.t]!==undefined)POP[p.t]++;}
    for(const[id,s]of strainRegistry){s.pop=0;}
    for(const p of grid){if(p?.sid){const s=strainRegistry.get(p.sid);if(s){s.pop++;s.peak=Math.max(s.peak,s.pop);}}}
  }

  tickCount++;
}

export function loop(t){
  requestAnimationFrame(loop);
  const dt=t-lastTime;lastTime=t;
  if(speedMult>0){
    stepAccum+=dt;
    const stepMs=50/speedMult;
    let steps=0;
    while(stepAccum>=stepMs&&steps<Math.ceil(speedMult)*3){simStep();stepAccum-=stepMs;steps++;}
  } else { stepAccum=0; }
  render();
  if(uiFrame++%8===0)updateUI();
}
