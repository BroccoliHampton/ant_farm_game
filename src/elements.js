// ================================================================
//  ELEMENTS — Abiotic step functions (fire, water, clay, clouds…)
//  Each function is called once per tick per cell of that type.
// ================================================================
import { W, H, T } from './constants.js';
import { grid, lightGrid, pheroGrid, gv, sunX, sunY, sunActive,
         fridgeZones, mutRate,
         ws_rain_active, ws_rain_rate, ws_rain_type_key,
         rainActive, rainTicks, rainDuration,
         acidRainActive, acidRainTicks, acidRainDuration,
         setRain, setAcidRain } from './state.js';
import { idx, inB, get, getDens, getNeighbors, getCardinals, getPerp, swap,
         abiotic, popIncr, popDecr, maybeMutateStrain } from './utils.js';
import { tryFall, tryFlow, tryRise, nearType } from './physics.js';

// ── Clay ─────────────────────────────────────────────────────
export function stepClay(x,y,p){
  // Try to fall — if we moved, reset settle counter
  const bx=x+gv.x, by=y+gv.y;
  const below=inB(bx,by)?grid[idx(bx,by)]:null;
  const myD=getDens(p), belD=getDens(below);

  let moved=false;
  if(!below||belD<myD-0.3){
    swap(x,y,bx,by);
    moved=true;
  } else {
    // Try lateral slide
    const perp=getPerp();
    const order=Math.random()<0.5?perp:[...perp].reverse();
    for(const d of order){
      const dx2=bx+d.x, dy2=by+d.y;
      if(inB(dx2,dy2)&&!get(dx2,dy2)){swap(x,y,dx2,dy2);moved=true;break;}
    }
  }

  if(moved){
    p.settled=0; // reset on any movement
  } else {
    // Stationary — count up settle timer
    p.settled=(p.settled||0)+1;
    if(p.settled>=25){
      // Harden — 30% become reinforced (ant-proof), 70% remain diggable
      grid[idx(x,y)]={t:T.CLAY_HARD,age:0,reinforced:Math.random()<0.3};
    }
  }
}

// ================================================================

// ── Lava, Stone, Steam, Ice, Smoke, Wood, Ash, Acid, Gunpowder, Salt ─
export function stepLava(x,y,p){
  p.ttl=(p.ttl||500)-1;
  if(p.ttl<=0){grid[idx(x,y)]={t:T.STONE,age:0};return;}
  const ux=x-gv.x,uy=y-gv.y;
  if(Math.random()<0.06&&inB(ux,uy)&&!get(ux,uy))
    grid[idx(ux,uy)]={t:T.SMOKE,age:0,ttl:40+Math.floor(Math.random()*60)};
  const nbrs=getNeighbors(x,y);
  for(const[nx,ny] of nbrs){
    const np=get(nx,ny);if(!np)continue;
    if(np.t===T.WATER){grid[idx(x,y)]={t:T.STONE,age:0};grid[idx(nx,ny)]={t:T.STEAM,age:0,ttl:80};return;}
    if(np.t===T.ICE){grid[idx(nx,ny)]={t:T.WATER,age:0};continue;}
    const fl={[T.WOOD]:0.9,[T.PLANT]:0.8,[T.FUNGI]:0.7,[T.OIL]:0.95,[T.DETRITUS]:0.5,[T.WEB]:0.9,[T.GUNPOWDER]:1.0}[np.t]??0;
    if(fl>0&&Math.random()<fl*0.25){
      if(np.t===T.GUNPOWDER){
        for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){if(dx*dx+dy*dy<=16){const ex=nx+dx,ey=ny+dy;if(inB(ex,ey)&&!isImmovable(get(ex,ey)?.t))grid[idx(ex,ey)]=Math.random()<0.4?{t:T.FIRE,age:0,ttl:20}:null;}}
      } else if(np.g){np.hp-=30;if(np.hp<=0){popDecr(np);grid[idx(nx,ny)]={t:T.ASH,age:0};}}
      else grid[idx(nx,ny)]={t:np.t===T.WOOD?T.FIRE:{t:T.ASH,age:0}.t,age:0,ttl:np.t===T.WOOD?50:undefined};
    }
  }
  tryFlow(x,y);
}

export function stepStone(x,y,p){
  if((p.settled||0)>=3) return; // fully settled — static
  const bx=x+gv.x,by=y+gv.y;
  const below=inB(bx,by)?grid[idx(bx,by)]:null;
  const myD=getDens(p);
  if(!below||getDens(below)<myD-0.5){p.settled=0;swap(x,y,bx,by);}
  else{p.settled=(p.settled||0)+1;}
}

export function stepSteam(x,y,p){
  p.ttl=(p.ttl||80)-1;
  if(p.ttl<=0){grid[idx(x,y)]={t:T.WATER,age:0};return;}
  tryRise(x,y);
  if(Math.random()<0.3){const perp=getPerp();const d=perp[Math.floor(Math.random()*perp.length)];const sx=x+d.x,sy=y+d.y;if(inB(sx,sy)&&!get(sx,sy))swap(x,y,sx,sy);}
}

export function stepIce(x,y,p){
  p.ttl=(p.ttl||800)-1;
  if(p.ttl<=0){grid[idx(x,y)]={t:T.WATER,age:0};return;}
  for(const[nx,ny] of getNeighbors(x,y)){const np=get(nx,ny);if(np?.t===T.FIRE||np?.t===T.LAVA||np?.t===T.STEAM){grid[idx(x,y)]={t:T.WATER,age:0};return;}}
}

export function stepSmoke(x,y,p){
  p.ttl=(p.ttl||60)-1;
  if(p.ttl<=0){grid[idx(x,y)]=null;return;}
  tryRise(x,y);
  if(Math.random()<0.4){const perp=getPerp();const d=perp[Math.floor(Math.random()*perp.length)];const sx=x+d.x,sy=y+d.y;if(inB(sx,sy)&&!get(sx,sy))swap(x,y,sx,sy);}
}

export function stepWood(x,y,p){
  for(const[nx,ny] of getNeighbors(x,y)){const np=get(nx,ny);if((np?.t===T.FIRE||np?.t===T.LAVA)&&Math.random()<0.004){grid[idx(x,y)]={t:T.FIRE,age:0,ttl:80+Math.floor(Math.random()*80)};return;}}
}

export function stepAsh(x,y,p){
  const bx=x+gv.x,by=y+gv.y;const below=inB(bx,by)?grid[idx(bx,by)]:null;
  if(!below&&Math.random()<0.25){swap(x,y,bx,by);return;}
  if(Math.random()<0.08){const perp=getPerp();const d=perp[Math.floor(Math.random()*perp.length)];const sx=x+d.x,sy=y+d.y;if(inB(sx,sy)&&!get(sx,sy))swap(x,y,sx,sy);}
}

export function stepAcid(x,y,p){
  p.ttl=(p.ttl||300)-1;
  if(p.ttl<=0){grid[idx(x,y)]=null;return;}
  for(const[nx,ny] of getNeighbors(x,y)){
    const np=get(nx,ny);
    if(!np||isImmovable(np.t)||np.t===T.ACID||np.t===T.WATER)continue;
    if(Math.random()<0.04){grid[idx(nx,ny)]=null;if(np.g)popDecr(np);p.ttl-=8;if(p.ttl<=0){grid[idx(x,y)]=null;return;}}
  }
  tryFlow(x,y);
}

export function stepGunpowder(x,y,p){
  for(const[nx,ny] of getNeighbors(x,y)){
    const np=get(nx,ny);
    if(np?.t===T.FIRE||np?.t===T.LAVA){
      for(let dy=-5;dy<=5;dy++)for(let dx=-5;dx<=5;dx++){if(dx*dx+dy*dy<=25){const ex=x+dx,ey=y+dy;if(inB(ex,ey)&&!isImmovable(get(ex,ey)?.t))grid[idx(ex,ey)]=Math.random()<0.5?{t:T.FIRE,age:0,ttl:25}:null;}}
      return;
    }
  }
  tryFall(x,y,p);
}

export function stepSalt(x,y,p){
  for(const[nx,ny] of getNeighbors(x,y)){
    const np=get(nx,ny);
    if(np?.t===T.WATER&&Math.random()<0.06){grid[idx(x,y)]=null;grid[idx(nx,ny)]=null;return;}
    if(np?.g&&Math.random()<0.008){np.energy-=4;np.hp-=1;}
  }
  tryFall(x,y,p);
}


// ── Clouds, Bloom, Prog, Weather ────────────────────────────
export function stepCloud(x,y,p){
  p.charge=(p.charge||120);
  p.phase=(p.phase||0)+1;

  // Fire, lava, acid destroy the cloud
  for(const[nx2,ny2] of getNeighbors(x,y)){
    const np=get(nx2,ny2);
    if(np?.t===T.FIRE||np?.t===T.LAVA||np?.t===T.ACID){
      grid[idx(x,y)]=null;return; // cloud destroyed by heat/acid
    }
  }

  // Clouds gently drift sideways — oscillate left/right over time
  if(p.phase%12===0&&Math.random()<0.6){
    const perp=getPerp();
    const d=perp[Math.random()<0.5?0:1];
    const nx2=x+d.x, ny2=y+d.y;
    if(inB(nx2,ny2)&&!grid[idx(nx2,ny2)])swap(x,y,nx2,ny2);
  }

  // Float upward against gravity
  if(p.phase%8===0&&Math.random()<0.4){
    const ux=x-gv.x, uy=y-gv.y;
    if(inB(ux,uy)&&!grid[idx(ux,uy)])swap(x,y,ux,uy);
  }

  // Absorb moisture — recharges from steam and water
  for(const[nx2,ny2] of getNeighbors(x,y)){
    const np=get(nx2,ny2);
    if(np?.t===T.STEAM){p.charge=Math.min(255,p.charge+20);grid[idx(nx2,ny2)]=null;break;}
    if(np?.t===T.WATER&&Math.random()<0.05){p.charge=Math.min(255,p.charge+5);break;}
  }

  // Passive recharge — cloud always regenerates (atmospheric moisture)
  p.charge=Math.min(255,p.charge+0.15);
  // NEVER depletes below 30 — cloud is always active
  if(p.charge<30) p.charge=30;

  // RAIN DROP: fire water droplets downward
  const rainRate=Math.floor(80-(p.charge/255)*60);
  if(p.phase%Math.max(1,rainRate)===0){
    const spread=Math.random()<0.5?0:(Math.random()<0.5?-1:1);
    const perp=getPerp();
    const dropX=x+gv.x+(spread>0?perp[0].x:(spread<0?perp[1].x:0));
    const dropY=y+gv.y+(spread>0?perp[0].y:(spread<0?perp[1].y:0));
    if(inB(dropX,dropY)&&!grid[idx(dropX,dropY)]){
      grid[idx(dropX,dropY)]=abiotic(T.WATER);
      p.charge=Math.max(30,p.charge-6); // never drain below 30
    }
  }

  // Heavy downpour burst
  if(p.charge>220&&Math.random()<0.02){
    for(let b=0;b<3;b++){
      const ox=x+gv.x+(b-1), oy=y+gv.y;
      if(inB(ox,oy)&&!grid[idx(ox,oy)])grid[idx(ox,oy)]=abiotic(T.WATER);
    }
    p.charge=Math.max(30,p.charge-30);
  }

  // Lightning strike (rare, only when overcharged)
  if(p.charge>240&&Math.random()<0.003){
    for(let dist=1;dist<15;dist++){
      const lx=x+gv.x*dist, ly=y+gv.y*dist;
      if(!inB(lx,ly)) break;
      const target=get(lx,ly);
      if(target){
        if(target.t===T.WATER||isWall(target.t))break;
        if(target.g){target.hp-=60;if(target.hp<=0){popDecr(target);grid[idx(lx,ly)]={t:T.FIRE,age:0,ttl:20};}}
        else if(target.t===T.WOOD||target.t===T.OIL||target.t===T.PLANT){grid[idx(lx,ly)]={t:T.FIRE,age:0,ttl:40};}
        p.charge=Math.max(30,p.charge-80);break;
      }
    }
  }
}

// ================================================================
//  BLOOM CLOUD — incendiary substance
//  Sits inert as dark crimson powder. Water contact ignites fire blooms
//  that float upward, burning everything they pass.
// ================================================================
export function stepBloomCloud(x,y,p){
  p.age++;
  // Cooldown between blooms so it doesn't fire every tick
  if(p.cooldown>0){p.cooldown--;return;}

  const nbrs=getNeighbors(x,y);
  for(const[nx,ny] of nbrs){
    const np=get(nx,ny);if(!np)continue;
    if(np.t===T.WATER||np.t===T.STEAM){
      // Spawn a fire bloom above — bloom cloud STAYS, it's the reactive surface
      const bx=x-gv.x,by=y-gv.y;
      const target=(inB(bx,by)&&!get(bx,by))?[bx,by]:null;
      if(target) grid[idx(target[0],target[1])]={t:T.BLOOM_FIRE,age:0,ttl:60+Math.floor(Math.random()*80)};
      // Consume the triggering water
      if(np.t===T.WATER) grid[idx(nx,ny)]=null;
      p.cooldown=8; // brief cooldown before next bloom fires
      return; // one bloom per check
    }
    // Fire/lava/acid can destroy the bloom cloud (it's not indestructible)
    if(np.t===T.FIRE||np.t===T.LAVA||np.t===T.ACID){
      grid[idx(x,y)]=null;return;
    }
  }
  // Settles slowly downward like heavy gas
  if(p.age%8===0){
    const bx=x+gv.x,by=y+gv.y;
    if(inB(bx,by)&&!grid[idx(bx,by)]) swap(x,y,bx,by);
  }
}

// BLOOM_FIRE: floating fireball, rises and burns everything nearby
export function stepBloomFire(x,y,p){
  p.ttl--;
  if(p.ttl<=0){grid[idx(x,y)]=null;return;}

  // Rise against gravity
  const ux=x-gv.x,uy=y-gv.y;
  if(inB(ux,uy)){
    const above=grid[idx(ux,uy)];
    if(!above){swap(x,y,ux,uy);[x,y]=[ux,uy];}
    else if(above.t===T.WATER){grid[idx(ux,uy)]=null;grid[idx(x,y)]=null;return;}
  }

  // Drift sideways for organic float
  if(Math.random()<0.35){
    const perp=getPerp();const d=perp[Math.random()<0.5?0:1];
    const sx=x+d.x,sy=y+d.y;
    if(inB(sx,sy)&&!grid[idx(sx,sy)]) swap(x,y,sx,sy);
  }

  // Burn neighbors
  for(const[nx,ny] of getNeighbors(x,y)){
    const np=get(nx,ny);if(!np)continue;
    if(np.t===T.WATER){grid[idx(x,y)]=null;return;}
    const fl={[T.PLANT]:0.6,[T.WOOD]:0.4,[T.OIL]:0.8,[T.DETRITUS]:0.3,[T.FUNGI]:0.5,[T.WEB]:0.7}[np.t]??0;
    if(fl>0&&Math.random()<fl*0.4) grid[idx(nx,ny)]={t:T.FIRE,age:0,ttl:25+Math.floor(Math.random()*25)};
    if(np.g&&Math.random()<0.35){np.hp-=12;if(np.hp<=0){popDecr(np);grid[idx(nx,ny)]=null;}}
  }

  // Trailing sparks
  if(Math.random()<0.3){
    const sx=x+gv.x,sy=y+gv.y;
    if(inB(sx,sy)&&!grid[idx(sx,sy)]) grid[idx(sx,sy)]={t:T.FIRE,age:0,ttl:6+Math.floor(Math.random()*8)};
  }
}

// ================================================================
//  PROGRAMMABLE CLOUD — user-configurable element emitter
// ================================================================
export function stepProgCloud(x,y,p){
  p.phase=(p.phase||0)+1;
  for(const[nx2,ny2] of getNeighbors(x,y)){
    const np=get(nx2,ny2);
    if(np?.t===T.FIRE||np?.t===T.LAVA||np?.t===T.ACID){grid[idx(x,y)]=null;return;}
  }
  if(p.phase%10===0&&Math.random()<0.5){
    const perp=getPerp();const d=perp[Math.random()<0.5?0:1];
    const nx2=x+d.x,ny2=y+d.y;if(inB(nx2,ny2)&&!grid[idx(nx2,ny2)])swap(x,y,nx2,ny2);
  }
  if(p.phase%7===0&&Math.random()<0.35){
    const ux=x-gv.x,uy=y-gv.y;if(inB(ux,uy)&&!grid[idx(ux,uy)])swap(x,y,ux,uy);
  }
  const rate=Math.max(1,p.emitRate||30);
  if(p.phase%rate===0){
    const spread=Math.random()<0.5?0:(Math.random()<0.5?-1:1);
    const perp=getPerp();
    const dropX=x+gv.x+(spread>0?perp[0].x:spread<0?perp[1].x:0);
    const dropY=y+gv.y+(spread>0?perp[0].y:spread<0?perp[1].y:0);
    if(inB(dropX,dropY)&&!grid[idx(dropX,dropY)]){
      const cell=makeProgCloudParticle(p.emitType||T.WATER);
      if(cell) grid[idx(dropX,dropY)]=cell;
    }
  }
}

export function makeProgCloudParticle(t){
  switch(t){
    case T.WATER:return abiotic(T.WATER);case T.SAND:return abiotic(T.SAND);
    case T.GOLD_SAND:return abiotic(T.GOLD_SAND);case T.ACID:return{t:T.ACID,age:0,ttl:300};
    case T.LAVA:return{t:T.LAVA,age:0,ttl:500};case T.OIL:return abiotic(T.OIL);
    case T.SALT:return abiotic(T.SALT);case T.ICE:return{t:T.ICE,age:0,ttl:800};
    case T.FIRE:return{t:T.FIRE,age:0,ttl:30};case T.STEAM:return{t:T.STEAM,age:0,ttl:80};
    case T.ASH:return abiotic(T.ASH);case T.SMOKE:return{t:T.SMOKE,age:0,ttl:60};
    case T.GUNPOWDER:return abiotic(T.GUNPOWDER);case T.DETRITUS:return abiotic(T.DETRITUS);
    default:return null;
  }
}

export function stepWeatherStation(x,y,p){ p.phase=(p.phase||0)+1; }

export function stepProgVoid(x,y,p){
  // Anchor — if something pushed us out, reclaim this cell
  if(grid[idx(x,y)]!==p) grid[idx(x,y)]=p;
  p.phase=(p.phase||0)+1;
  const destroyType=p.destroyType;
  const radius=p.radius||2;
  let absorbed=false;
  for(let dy=-radius;dy<=radius;dy++){
    for(let dx=-radius;dx<=radius;dx++){
      if(dx===0&&dy===0)continue;
      const nx=x+dx,ny=y+dy;
      if(!inB(nx,ny))continue;
      const np=grid[idx(nx,ny)];
      if(!np)continue;
      // Match logic
      let match=false;
      if(destroyType==='sand_all') match=(np.t===T.SAND||np.t===T.GOLD_SAND||np.t===T.WHITE_SAND);
      else if(destroyType==='agents') match=!!np.g;
      else match=(np.t===destroyType);
      if(match){
        if(np.g) POP[np.t]=Math.max(0,(POP[np.t]||0)-1);
        grid[idx(nx,ny)]=null;
        absorbed=true;
      }
    }
  }
  if(absorbed) p.pulse=8;
  if(p.pulse>0) p.pulse--;
}

// Weather station state
let ws_rain_type_key='water'; // key for element
export function wsRainType(){ return ({water:T.WATER,acid:T.ACID,sand:T.SAND,lava:T.LAVA,oil:T.OIL,salt:T.SALT,ice:T.ICE,fire:T.FIRE,steam:T.STEAM,ash:T.ASH,smoke:T.SMOKE,gunpowder:T.GUNPOWDER,detritus:T.DETRITUS})[ws_rain_type_key]||T.WATER; }

export


// ── Fire ────────────────────────────────────────────────────
export function stepFire(x,y,p){
  p.ttl=(p.ttl||25)-1;
  if(p.ttl<=0){
    // Leave ash below when fire dies
    const bx=x+gv.x,by=y+gv.y;
    if(inB(bx,by)&&!get(bx,by)&&Math.random()<0.2)grid[idx(bx,by)]={t:T.ASH,age:0};
    grid[idx(x,y)]=null;return;
  }

  const nbrs=getNeighbors(x,y);

  // Emit smoke upward
  const ux=x-gv.x,uy=y-gv.y;
  if(Math.random()<0.12&&inB(ux,uy)&&!get(ux,uy))
    grid[idx(ux,uy)]={t:T.SMOKE,age:0,ttl:30+Math.floor(Math.random()*50)};

  // Water extinguishes fire, ice melts
  for(const[nx,ny] of nbrs){
    const np=get(nx,ny);
    if(np?.t===T.WATER){grid[idx(x,y)]=null;return;}
    if(np?.t===T.ICE){grid[idx(nx,ny)]={t:T.WATER,age:0};grid[idx(x,y)]=null;return;}
  }

  // Fire rises
  if(inB(ux,uy)&&!get(ux,uy)&&Math.random()<0.3)
    grid[idx(ux,uy)]={t:T.FIRE,age:0,ttl:Math.floor(p.ttl*0.8)};

  // Spread to ALL flammable neighbors
  for(const[nx,ny] of nbrs){
    const np=get(nx,ny);
    if(!np) continue;
    const fl={
      [T.OIL]:1.0,[T.WEB]:0.95,[T.PLANT]:0.85,[T.PLANT_WALL]:0.7,
      [T.FUNGI]:0.8,[T.SPORE]:0.9,[T.WOOD]:0.5,[T.ASH]:0.1,
      [T.GUNPOWDER]:1.0,[T.DETRITUS]:0.3,
    }[np.t]??0;

    if(np.t===T.WATER){grid[idx(x,y)]=null;return;}
    if(np.t===T.GUNPOWDER){
      // Explosion!
      for(let dy=-5;dy<=5;dy++)for(let dx=-5;dx<=5;dx++){if(dx*dx+dy*dy<=25){const ex=nx+dx,ey=ny+dy;if(inB(ex,ey)&&!isImmovable(get(ex,ey)?.t))grid[idx(ex,ey)]=Math.random()<0.5?{t:T.FIRE,age:0,ttl:25}:null;}}
      grid[idx(x,y)]=null;return;
    }
    if(np.t===T.LAVA)continue; // fire can't burn lava

    if(fl>0&&Math.random()<fl*0.6){
      if(np.t===T.PLANT||np.t===T.PLANT_WALL){const pop=np.t===T.PLANT;if(pop)popDecr(np);grid[idx(nx,ny)]={t:T.FIRE,age:0,ttl:30+Math.floor(Math.random()*20)};}
      else if(np.t===T.FUNGI){popDecr(np);grid[idx(nx,ny)]={t:T.FIRE,age:0,ttl:20+Math.floor(Math.random()*15)};}
      else if(np.t===T.WOOD){grid[idx(nx,ny)]={t:T.FIRE,age:0,ttl:80+Math.floor(Math.random()*80)};}
      else{grid[idx(nx,ny)]={t:T.FIRE,age:0,ttl:Math.floor(p.ttl*0.75)+5};}
    }
    if(np.g&&Math.random()<0.7){
      const armor=np.g[4]||0;const dmg=Math.max(8,40*(1-armor/255*0.6));
      np.hp-=dmg;
      if(np.hp<=0){set(nx,ny,null);popDecr(np);if(Math.random()<0.5)grid[idx(nx,ny)]={t:T.ASH,age:0};}
    }
  }
}

// ---- MUTAGEN (Life Seed) ----
// Self-replicating mutagen particle. Drifts, occasionally mutates adjacent
// agents (1 gene, shared direction), and reproduces near nutrients.

// ── Mutagen ─────────────────────────────────────────────────
export function stepMutagen(x,y,p){
  // If inside a fridge zone — fully frozen, no activity
  if(inFridge(x,y)){p.frozen=true;return;}
  p.frozen=false;

  p.energy=(p.energy||120)-0.25;
  if(p.energy<=0){grid[idx(x,y)]=null;return;}

  // Initialise recipe genome if missing (6-gene mutation signature)
  if(!p.recipe) p.recipe=[128,128,128,128,128,128];

  // RAPID self-mutation of recipe every tick
  if(Math.random()<0.15){
    const gene=Math.floor(Math.random()*6);
    p.recipe[gene]=Math.min(255,Math.max(0,p.recipe[gene]+Math.floor((Math.random()-0.5)*60)));
  }

  // Drift — random walk
  tryFlow(x,y);
  // Re-read position in case we moved
  const cur=grid[idx(x,y)];
  if(!cur||cur!==p)return; // moved

  // Mutate adjacent agents using current recipe as bias
  if(Math.random()<0.08){
    const nbrs=getNeighbors(x,y);
    for(const[nx,ny] of nbrs){
      const ap=get(nx,ny);
      if(!ap?.g)continue;
      const gene=Math.floor(Math.random()*6);
      const delta=Math.floor((p.recipe[gene]/255-0.5)*60);
      ap.g[gene]=Math.min(255,Math.max(0,(ap.g[gene]||128)+delta));
    }
  }

  // Reproduce near nutrients — child inherits mutated recipe
  if(p.energy>80&&Math.random()<0.012){
    const nbrs=getNeighbors(x,y);
    const nearNutrient=nbrs.some(([nx,ny])=>{const np=get(nx,ny);return np&&(np.t===T.GOLD_SAND||np.t===T.DETRITUS);});
    if(nearNutrient){
      const empty=nbrs.filter(([nx,ny])=>!get(nx,ny));
      if(empty.length){
        const[ex,ey]=empty[Math.floor(Math.random()*empty.length)];
        const childRecipe=p.recipe.map(v=>Math.min(255,Math.max(0,v+Math.floor((Math.random()-0.5)*20))));
        grid[idx(ex,ey)]={t:T.MUTAGEN,age:0,energy:80+Math.floor(Math.random()*40),recipe:childRecipe};
      }
    }
  }
}

// ================================================================
//  POPULATION TRACKING
// ================================================================

// ── Population utils ─────────────────────────────────────────
}

}

// ================================================================
//  CLAY PHYSICS
//  Clay falls like sand but counts ticks without moving.
//  Once settled (no movement for ~25 ticks) it hardens to CLAY_HARD.
//  CLAY_HARD is immovable like a wall — but ants can dig through it.

// ── Weather tick (rain events) ────────────────────────────────
function weatherTick(){
  if(!ws_rain_active) return;
  for(let d=0;d<ws_rain_rate;d++){
    const rx=Math.floor(Math.random()*W);
    const finalX=gv.y!==0?rx:(gv.x>0?0:W-1);
    const finalY=gv.y>0?0:(gv.y<0?H-1:rx);
    if(inB(finalX,finalY)&&!grid[idx(finalX,finalY)]){
      const cell=makeProgCloudParticle(wsRainType());
      if(cell) grid[idx(finalX,finalY)]=cell;
    }
  }
}
