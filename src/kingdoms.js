// ================================================================
//  KINGDOMS — All creature & organism step functions
//  Edit this file to change creature behavior, add new kingdoms, etc.
// ================================================================
import { W, H, T } from './constants.js';
import { grid, lightGrid, pheroGrid, POP, POP_MAX, gv, sunX, sunY, sunActive,
         mutRate, customCreatures } from './state.js';
import { idx, inB, get, getDens, getNeighbors, getPerp, swap,
         abiotic, agent, agentWithStrain, popIncr, popDecr, maybeMutateStrain,
         hslToRgb } from './utils.js';
import { randomGenome, mutateGenome, registerStrain } from './genome.js';
import { tryFall, nearType, hazardPenalty, envDamage } from './physics.js';
import { makeProgCloudParticle } from './elements.js';

// ── Plant ────────────────────────────────────────────────────
export function stepPlant(x,y,p){
  p.age++;
  const lv=lightGrid[idx(x,y)];
  const smokeNear=nearType(x,y,T.SMOKE);
  p.energy+=((smokeNear?lv*0.4:lv)*3)+0.3;
  p.energy=Math.min(255,p.energy);
  if(p.hp<=0){set(x,y,null);popDecr(p);return;}
  const nbrs=getNeighbors(x,y);
  for(const[nx,ny] of nbrs){
    const np=get(nx,ny);if(!np)continue;
    if(np.t===T.ACID||np.t===T.LAVA){p.hp-=40;if(p.hp<=0){set(x,y,null);popDecr(p);return;}}
    if(np.t===T.SALT)p.energy=Math.max(0,p.energy-1);
    if(np.t===T.ASH)p.energy=Math.min(255,p.energy+0.5);
    if(np.t===T.MITE&&Math.random()<0.12){set(nx,ny,null);popDecr(np);}
  }
  // Water turbo-charges plant: consumes adjacent water cells, spends them for growth
  const waterNear=nearType(x,y,T.WATER);
  let waterBoost=0;
  if(waterNear){
    p.energy=Math.min(255,p.energy+2.5);
    waterBoost=6.0; // grow timer drains ~6x faster near water
    // Consume adjacent water (plant drinks it)
    for(const[wx,wy] of nbrs){
      if(get(wx,wy)?.t===T.WATER&&Math.random()<0.15){grid[idx(wx,wy)]=null;break;}
    }
  }
  // Seeds drop SIDEWAYS or DOWN only — never into the growth direction above the plant
  // This prevents seeds from blocking the plant's upward spread
  const seedChance=waterNear?0.008:0.002;
  if(p.age>20&&Math.random()<seedChance){
    const perp=getPerp(); // perpendicular to gravity = sideways
    const dropCandidates=[];
    // Sideways cells
    for(const d of perp){
      const sx=x+d.x,sy=y+d.y;
      if(inB(sx,sy)&&!get(sx,sy)) dropCandidates.push([sx,sy]);
    }
    // Below cell (gravity direction) — seeds fall away from growth
    const downX=x+gv.x,downY=y+gv.y;
    if(inB(downX,downY)&&!get(downX,downY)) dropCandidates.push([downX,downY]);
    if(dropCandidates.length){
      const[sx,sy]=dropCandidates[Math.floor(Math.random()*dropCandidates.length)];
      grid[idx(sx,sy)]={t:T.SEED,age:0,g:[...p.g],sid:p.sid,energy:100};
    }
  }
  if(p.growTimer===undefined)p.growTimer=Math.floor(8+Math.random()*12); // start fast
  p.growTimer-=(1+waterBoost);
  if(nearType(x,y,T.ICE))p.growTimer+=1;
  if(p.growTimer<=0&&POP[T.PLANT]<POP_MAX[T.PLANT]){
    p.growTimer=Math.floor(15+Math.random()*25+(1-p.g[1]/255)*20); // fast reset
    let dx=0,dy=-1;
    if(sunActive){const ddx=sunX-x,ddy=sunY-y,len=Math.sqrt(ddx*ddx+ddy*ddy)||1;dx=ddx/len;dy=ddy/len;}
    const primary=[Math.round(dx),Math.round(dy)];const candidates=[primary];
    if(primary[0]!==0&&primary[1]!==0)candidates.push([primary[0],0],[0,primary[1]]);
    else if(primary[0]===0){candidates.push([-1,primary[1]],[1,primary[1]]);if(Math.random()<p.g[5]/255*0.3)candidates.push([-1,0],[1,0]);}
    else candidates.push([primary[0],-1],[primary[0],1]);
    for(const[cdx,cdy] of candidates){
      const tx=x+cdx,ty=y+cdy;if(!inB(tx,ty))continue;
      const target=get(tx,ty);
      // Can grow into: empty, ash, detritus, or seeds (seeds get displaced/replaced)
      if(target&&target.t!==T.ASH&&target.t!==T.DETRITUS&&target.t!==T.SEED)continue;
      const ng=mutateGenome(p.g,mutRate);
      grid[idx(tx,ty)]=agentWithStrain(T.PLANT,ng,p.sid,{energy:120,growTimer:Math.floor(12+Math.random()*18)});
      popIncr({t:T.PLANT,sid:p.sid});maybeMutateStrain(p,ng);break;
    }
  }
}
// stepPlantWall is a no-op

// ================================================================
//  ANT — terrain-smart tunneler, alpha system, pheromone following
// ================================================================
// ALPHA PROMOTION: ants with aggression>0.7, energy>200, near clay, no other alpha
// within radius 15 become alpha tunnelers. Alpha ants dig harder, faster, deeper,
// and leave pheromone trails. Non-alpha ants score pheromone in movement candidates.

// ── Ant ──────────────────────────────────────────────────────
export function stepAnt(x,y,p){
  p.age++;
  const speed=p.g[1]/255,appetite=p.g[2]/255,aggression=p.g[3]/255;
  p.energy-=0.10+speed*0.10;
  if(p.hp<=0||p.energy<=0){set(x,y,null);popDecr(p);return;}
  if(envDamage(x,y,p))return;
  const gx2=gv.x,gy2=gv.y,bx=x+gx2,by=y+gy2;
  const belowCell=inB(bx,by)?grid[idx(bx,by)]:null;
  // Drown in water
  if(belowCell?.t===T.WATER){p.hp-=(5*(1-p.g[4]/255*0.5));if(p.hp<=0){set(x,y,null);popDecr(p);return;}}
  const touchingSolid=getNeighbors(x,y).some(([nx,ny])=>{const np=grid[idx(nx,ny)];return np&&isSolid(np.t);});
  if(!touchingSolid&&!belowCell){if(inB(bx,by)){swap(x,y,bx,by);return;}}
  const nbrs=getNeighbors(x,y);

  // EATING
  for(const[nx,ny] of nbrs){
    const np=get(nx,ny);if(!np)continue;
    if((np.t===T.PLANT||np.t===T.PLANT_WALL)&&Math.random()<appetite*0.3){
      p.energy+=40;
      if(np.t===T.PLANT)popDecr(np);
      grid[idx(nx,ny)]=null;
      // Rich plant meal — chance to immediately drop a queen on the spot
      if(p.energy>=200&&Math.random()<0.04&&POP[T.QUEEN]<POP_MAX[T.QUEEN]){
        const qSpot=nbrs.filter(([qx,qy])=>{
          if(get(qx,qy))return false;
          return getNeighbors(qx,qy).some(([ax,ay])=>{const ap=get(ax,ay);return ap&&isSolid(ap.t);});
        });
        if(qSpot.length){
          const[qx,qy]=qSpot[Math.floor(Math.random()*qSpot.length)];
          const ng=mutateGenome(p.g,mutRate);
          grid[idx(qx,qy)]=agentWithStrain(T.QUEEN,ng,p.sid,{energy:180});
          popIncr({t:T.QUEEN,sid:p.sid});
          p.energy-=120; // laying a queen is costly
        }
      }
      break;
    }
    if(np.t===T.FUNGI&&Math.random()<appetite*0.25){
      p.energy+=30;
      popDecr(np);
      grid[idx(nx,ny)]=null;
      // Fungi meal is intoxicating — higher queen-drop chance than plant
      if(p.energy>=180&&Math.random()<0.06&&POP[T.QUEEN]<POP_MAX[T.QUEEN]){
        const qSpot=nbrs.filter(([qx,qy])=>{
          if(get(qx,qy))return false;
          return getNeighbors(qx,qy).some(([ax,ay])=>{const ap=get(ax,ay);return ap&&isSolid(ap.t);});
        });
        if(qSpot.length){
          const[qx,qy]=qSpot[Math.floor(Math.random()*qSpot.length)];
          const ng=mutateGenome(p.g,mutRate);
          grid[idx(qx,qy)]=agentWithStrain(T.QUEEN,ng,p.sid,{energy:180});
          popIncr({t:T.QUEEN,sid:p.sid});
          p.energy-=100;
        }
      }
      break;
    }
    if(np.t===T.MITE&&Math.random()<appetite*0.5){p.energy+=15;grid[idx(nx,ny)]=null;break;}
    if((np.t===T.DETRITUS||np.t===T.ASH)&&Math.random()<appetite*0.15){p.energy+=8;grid[idx(nx,ny)]=null;break;}
  }
  p.energy=Math.min(255,p.energy);

  // OFFENSE: high-aggression ants throw salt/ash at spiders
  if(aggression>0.6&&Math.random()<aggression*0.04){
    for(const[nx,ny] of nbrs){
      const np=get(nx,ny);
      if(np?.t===T.SPIDER||np?.t===T.QUEEN_SPIDER){
        for(const[sx,sy] of nbrs){const sp=get(sx,sy);if(sp?.t===T.SALT||sp?.t===T.ASH||sp?.t===T.GUNPOWDER){np.hp-=sp.t===T.GUNPOWDER?50:12;grid[idx(sx,sy)]=null;break;}}
        break;
      }
    }
  }

  // ALPHA PROMOTION
  if(!p.alpha&&aggression>0.7&&p.energy>200){
    const nearClay=nbrs.some(([nx,ny])=>get(nx,ny)?.t===T.CLAY_HARD);
    if(nearClay){
      let alphaFound=false;
      for(let dy=-15;dy<=15&&!alphaFound;dy++)for(let dx=-15;dx<=15&&!alphaFound;dx++){
        const tp=get(x+dx,y+dy);if(tp?.t===T.ANT&&tp.alpha)alphaFound=true;
      }
      if(!alphaFound&&Math.random()<0.04)p.alpha=true;
    }
  }
  // Alpha loses status if energy drops low
  if(p.alpha&&p.energy<80)p.alpha=false;

  // PHEROMONE DEPOSIT — ants leave trail whenever adjacent to clay walls (inside tunnels)
  {
    let wallCount=0;
    for(const[nx,ny] of nbrs){const ap=get(nx,ny);if(ap&&(isWall(ap.t)||ap.t===T.CLAY_HARD))wallCount++;}
    if(p.alpha){
      pheroGrid[idx(x,y)]=Math.min(1,pheroGrid[idx(x,y)]+0.35);
      p.energy-=0.05;
    } else if(wallCount>=2){
      pheroGrid[idx(x,y)]=Math.min(1,pheroGrid[idx(x,y)]+0.12);
    }
  }

  // QUEEN SPAWNING
  if(p.energy>=220&&POP[T.QUEEN]<POP_MAX[T.QUEEN]){
    let queenNear=false;
    for(let dy=-20;dy<=20&&!queenNear;dy++)for(let dx=-20;dx<=20&&!queenNear;dx++){if(get(x+dx,y+dy)?.t===T.QUEEN)queenNear=true;}
    if(!queenNear&&Math.random()<0.008){
      const spawnCells=nbrs.filter(([nx,ny])=>{if(get(nx,ny))return false;return getNeighbors(nx,ny).some(([ax,ay])=>{const ap=get(ax,ay);return ap&&isSolid(ap.t);});});
      if(spawnCells.length){const[qx2,qy2]=spawnCells[Math.floor(Math.random()*spawnCells.length)];const ng=mutateGenome(p.g,mutRate);grid[idx(qx2,qy2)]=agentWithStrain(T.QUEEN,ng,p.sid,{energy:180});popIncr({t:T.QUEEN,sid:p.sid});p.energy-=100;}
    }
  }
  if(p.energy>160){for(const[nx,ny] of nbrs){const np=get(nx,ny);if(np?.t===T.QUEEN&&p.energy>80){np.energy=Math.min(255,np.energy+15);p.energy-=15;break;}}}

  // MOVEMENT — heavy tunnel preference + pheromone following; dig only when truly stuck
  if(Math.random()<0.55+speed*0.35){
    const moveCandidates=[],digCandidates=[];
    for(const[nx,ny] of nbrs){
      const np=get(nx,ny);
      if(!np){
        let wc=0;
        for(const[ax,ay] of getNeighbors(nx,ny)){
          if(ax===x&&ay===y)continue;
          const ap=get(ax,ay);
          if(ap&&(isWall(ap.t)||ap.t===T.CLAY_HARD))wc++;
        }
        let score=wc>=3?20:wc>=1?8:1;
        const phero=pheroGrid[idx(nx,ny)];
        if(!p.alpha){
          if(phero>0.05) score+=Math.floor(phero*30);
        } else {
          if(phero<0.15) score+=3;
        }
        score+=hazardPenalty(nx,ny,p.g[4]/255);
        const db=get(nx+gx2,ny+gy2);if(db?.t===T.WATER||db?.t===T.LAVA||db?.t===T.ACID)score-=5;
        moveCandidates.push([nx,ny,score]);
      } else if(np.t===T.CLAY_HARD&&!np.reinforced){
        const ddx=nx-x,ddy=ny-y;
        const isDown=(ddx===gx2&&ddy===gy2),isUp=(ddx===-gx2&&ddy===-gy2);
        const weight=p.alpha?(isDown?1:isUp?8:5):(isDown?1:isUp?4:2);
        digCandidates.push([nx,ny,weight]);
      }
    }
    if(moveCandidates.length){
      moveCandidates.sort((a,b)=>b[2]-a[2]);
      const best=moveCandidates[0][2];
      const bestCells=moveCandidates.filter(c=>c[2]===best);
      const[mx,my]=bestCells[Math.floor(Math.random()*bestCells.length)];
      const trulySurrounded=best<=1&&moveCandidates.every(c=>c[2]<=1);
      if(trulySurrounded&&digCandidates.length){
        // fall through to dig
      } else {
        swap(x,y,mx,my);
      }
    }
    if(!moveCandidates.length||(moveCandidates[0][2]<=1&&moveCandidates.every(c=>c[2]<=1)&&digCandidates.length)){
      if(digCandidates.length){
        const total=digCandidates.reduce((s,c)=>s+c[2],0);
        let r2=Math.random()*total;
        let chosen=digCandidates[digCandidates.length-1];
        for(const c of digCandidates){r2-=c[2];if(r2<=0){chosen=c;break;}}
        const digChance=p.alpha?0.50:0.18;
        if(Math.random()<digChance){
          grid[idx(chosen[0],chosen[1])]=null;
          pheroGrid[idx(chosen[0],chosen[1])]=p.alpha?1.0:0.6;
          pheroGrid[idx(x,y)]=Math.min(1,pheroGrid[idx(x,y)]+0.4);
        }
      }
    }
  }
}

// ================================================================
//  QUEEN ANT
// ================================================================

// ── Queen Ant ────────────────────────────────────────────────
export function stepQueen(x,y,p){
  p.age++;
  const lv=lightGrid[idx(x,y)];
  const smokeNear=nearType(x,y,T.SMOKE);
  p.energy=Math.min(255,p.energy+(smokeNear?lv*0.5:lv*2)+0.5);
  if(p.hp<=0){set(x,y,null);popDecr(p);return;}
  if(envDamage(x,y,p))return;
  const spawnRate=20+Math.floor((1-p.g[5]/255)*80);
  if(p.age%spawnRate===0&&POP[T.ANT]<POP_MAX[T.ANT]){
    const nbrs=getNeighbors(x,y).filter(([nx,ny])=>!get(nx,ny));
    if(nbrs.length){const[nx,ny]=nbrs[Math.floor(Math.random()*nbrs.length)];const ng=mutateGenome(p.g,mutRate);set(nx,ny,agentWithStrain(T.ANT,ng,p.sid,{energy:120}));popIncr({t:T.ANT,sid:p.sid});}
  }
  if(p.age%100===0&&Math.random()<0.4){
    const nbrs=getNeighbors(x,y).filter(([nx,ny])=>!get(nx,ny));
    if(nbrs.length){const[ex,ey]=nbrs[Math.floor(Math.random()*nbrs.length)];set(ex,ey,{t:T.EGG,age:0,g:p.g,sid:p.sid,hp:20,energy:80});}
  }
}

// ================================================================
//  EGG
// ================================================================

// ── Egg ──────────────────────────────────────────────────────
export function stepEgg(x,y,p){
  p.age++;
  for(const[nx,ny] of getNeighbors(x,y)){const np=get(nx,ny);if(np?.t===T.FIRE||np?.t===T.LAVA||np?.t===T.ACID){grid[idx(x,y)]=null;return;}}
  if(p.age>60){const ng=mutateGenome(p.g,mutRate);set(x,y,agentWithStrain(T.ANT,ng,p.sid,{energy:100}));popIncr({t:T.ANT,sid:p.sid});}
}

// ================================================================
//  SPIDER — acid-spit offense, surface tension water-walking
// ================================================================

// ── Spider ───────────────────────────────────────────────────
export function isSpiderSurface(t){return t===T.WALL||t===T.PLANT_WALL||t===T.FRIDGE_WALL||t===T.WEB||t===T.ICE||t===T.STONE;}

export function stepSpider(x,y,p){
  p.age++;
  const aggression=p.g[3]/255,resilience=p.g[4]/255;
  p.energy-=0.05+p.g[1]/255*0.06;
  if(envDamage(x,y,p))return;
  const gx2=gv.x,gy2=gv.y,bx=x+gx2,by=y+gy2;
  const belowCell=inB(bx,by)?grid[idx(bx,by)]:null;
  const onSurface=belowCell&&(isSpiderSurface(belowCell.t)||belowCell.t===T.WATER);
  const canCling=getCardinals(x,y).some(([nx,ny])=>{const np=get(nx,ny);return np&&isSpiderSurface(np.t);});
  if(!onSurface&&!canCling&&!belowCell){if(inB(bx,by)){swap(x,y,bx,by);return;}}
  const nbrs=getNeighbors(x,y);
  // Lay web — avoid hazard zones
  if(Math.random()<p.g[5]/255*0.08){
    const wc=nbrs.filter(([nx,ny])=>!get(nx,ny)&&!nearType(nx,ny,T.ACID,T.LAVA));
    if(wc.length){const[wx,wy]=wc[Math.floor(Math.random()*wc.length)];grid[idx(wx,wy)]={t:T.WEB,age:0,ttl:200+Math.floor(Math.random()*150)};}
  }
  const smokeBlind=nearType(x,y,T.SMOKE);
  const radius=smokeBlind?2:5+Math.floor(aggression*5);
  let tx2=-1,ty2=-1,bd=999;
  for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
    const tp=get(x+dx,y+dy);
    if(tp&&(tp.t===T.ANT||tp.t===T.MITE||tp.t===T.EGG)){const d=Math.abs(dx)+Math.abs(dy);if(d<bd){bd=d;tx2=x+dx;ty2=y+dy;}}
  }
  if(tx2>=0){
    const ddx=Math.sign(tx2-x),ddy=Math.sign(ty2-y),nx=x+ddx,ny=y+ddy,np=get(nx,ny);
    // Fire herding
    if(aggression>0.7&&Math.random()<aggression*0.15){
      const bx2=tx2+ddx,by2=ty2+ddy;const beyond=inB(bx2,by2)?get(bx2,by2):null;
      if(beyond?.t===T.FIRE||beyond?.t===T.LAVA){if(np?.t===T.ANT||np?.t===T.MITE){np.hp-=30;p.energy+=15;}}
    }
    if(!np||np.t===T.WEB){swap(x,y,nx,ny);}
    else if(np?.t===T.ANT||np?.t===T.MITE||np?.t===T.EGG){
      const dmg=15+Math.floor(aggression*35);np.hp-=dmg;p.energy+=20;
      if(np.hp<=0){
        grid[idx(nx,ny)]=null;if(np.t===T.ANT||np.t===T.MITE)popDecr(np);
        // Successful kill while well-fed → chance to drop a queen spider
        if(p.energy>=190&&Math.random()<0.05&&POP[T.QUEEN_SPIDER]<POP_MAX[T.QUEEN_SPIDER]){
          let qNear2=false;
          for(let dy2=-20;dy2<=20&&!qNear2;dy2++)for(let dx2=-20;dx2<=20&&!qNear2;dx2++){if(get(x+dx2,y+dy2)?.t===T.QUEEN_SPIDER)qNear2=true;}
          if(!qNear2){
            const qSpot=getNeighbors(x,y).filter(([qx,qy])=>!get(qx,qy));
            if(qSpot.length){
              const[qx,qy]=qSpot[Math.floor(Math.random()*qSpot.length)];
              const ng=mutateGenome(p.g,mutRate);
              grid[idx(qx,qy)]=agentWithStrain(T.QUEEN_SPIDER,ng,p.sid,{energy:180});
              popIncr({t:T.QUEEN_SPIDER,sid:p.sid});p.energy-=110;
            }
          }
        }
      }
    }
    // ACID SAC: very aggressive spiders spit acid
    if(aggression>0.75&&p.energy>180&&Math.random()<aggression*0.02){
      const midX=x+Math.sign(tx2-x),midY=y+Math.sign(ty2-y);
      if(inB(midX,midY)&&!get(midX,midY)){grid[idx(midX,midY)]={t:T.ACID,age:0,ttl:60};p.energy-=15;}
    }
  } else {
    if(Math.random()<0.15){
      const scored=nbrs.map(([nx,ny])=>{
        const np=get(nx,ny);
        if(!np){const ss=getNeighbors(nx,ny).some(([ax,ay])=>{const ap=get(ax,ay);return ap&&isSpiderSurface(ap.t);})?2:1;return[nx,ny,ss+hazardPenalty(nx,ny,resilience)];}
        if(np.t===T.WEB)return[nx,ny,3];return null;
      }).filter(Boolean);
      scored.sort((a,b)=>b[2]-a[2]);const best=scored[0];
      if(best&&best[2]>0)swap(x,y,best[0],best[1]);
    }
  }
  for(const[nx,ny] of nbrs){if(get(nx,ny)?.t===T.FUNGI&&Math.random()<0.06){p.hp-=5;break;}}
  if(p.energy>=220&&POP[T.QUEEN_SPIDER]<POP_MAX[T.QUEEN_SPIDER]){
    let qNear=false;for(let dy=-20;dy<=20&&!qNear;dy++)for(let dx=-20;dx<=20&&!qNear;dx++){if(get(x+dx,y+dy)?.t===T.QUEEN_SPIDER)qNear=true;}
    if(!qNear&&Math.random()<0.006){
      const on=nbrs.filter(([nx,ny])=>!get(nx,ny));
      if(on.length){const[qx,qy]=on[Math.floor(Math.random()*on.length)];const ng=mutateGenome(p.g,mutRate);grid[idx(qx,qy)]=agentWithStrain(T.QUEEN_SPIDER,ng,p.sid,{energy:180});popIncr({t:T.QUEEN_SPIDER,sid:p.sid});p.energy-=100;}
    }
  }
  if(p.energy>220&&Math.random()<p.g[5]/255*0.003&&POP[T.SPIDER]<POP_MAX[T.SPIDER]){
    const on=nbrs.filter(([nx,ny])=>!get(nx,ny));
    if(on.length){const[nx,ny]=on[Math.floor(Math.random()*on.length)];const ng=mutateGenome(p.g,mutRate);set(nx,ny,agentWithStrain(T.SPIDER,ng,p.sid,{energy:80}));popIncr({t:T.SPIDER,sid:p.sid});p.energy-=80;}
  }
}

// ================================================================
//  QUEEN SPIDER
// ================================================================

// ================================================================
//  FUNGI — wood rot, moisture boost, salt death, acid spore offense
// ================================================================

// ── Fungi ────────────────────────────────────────────────────
export function stepFungi(x,y,p){
  p.age++;
  const lv=lightGrid[idx(x,y)],lightSens=p.g[3]/255,spreadSpeed=p.g[1]/255,resilience=p.g[4]/255;
  if(lv>0.6){p.hp-=lv*4*lightSens*(1-resilience*0.4);if(p.hp<=0){set(x,y,null);popDecr(p);return;}}
  const nbrs=getNeighbors(x,y);
  let moistureBoost=0;
  for(const[nx,ny] of nbrs){
    const np=get(nx,ny);if(!np)continue;
    if(np.t===T.SALT){p.hp-=40;if(p.hp<=0){set(x,y,null);popDecr(p);return;}}
    if(np.t===T.LAVA||np.t===T.ACID){p.hp-=50;if(p.hp<=0){set(x,y,null);popDecr(p);return;}}
    if(np.t===T.WOOD&&Math.random()<spreadSpeed*0.008){grid[idx(nx,ny)]=abiotic(T.DETRITUS);p.energy=Math.min(255,p.energy+15);}
    if(np.t===T.SPIDER&&Math.random()<p.g[2]/255*0.08){
      const drain=8+Math.floor(p.g[2]/255*12);np.energy=Math.max(0,np.energy-drain);np.hp-=3;p.energy+=drain*0.7;
      if(np.hp<=0){
        set(nx,ny,null);popDecr(np);
        // Spider death feeds a fruiting burst — bloom 3-5 new fungi nearby if well-fed
        if(p.energy>=160&&POP[T.FUNGI]<POP_MAX[T.FUNGI]){
          const richNear=nearType(x,y,T.DETRITUS,T.ASH,T.GOLD_SAND,T.WATER);
          const burstCount=richNear?3+Math.floor(Math.random()*3):1+Math.floor(Math.random()*2);
          const empties=getNeighbors(x,y).filter(([bx2,by2])=>!get(bx2,by2)&&lightGrid[idx(bx2,by2)]<0.4);
          for(let b=0;b<burstCount&&b<empties.length;b++){
            const[bx2,by2]=empties[b];
            const ng=mutateGenome(p.g,mutRate);
            set(bx2,by2,agentWithStrain(T.FUNGI,ng,p.sid,{energy:80}));
            popIncr({t:T.FUNGI,sid:p.sid});
          }
          p.energy-=30;
        }
      }
      break;
    }
    if(np.t===T.ASH)p.energy=Math.min(255,p.energy+2);
    if(np.t===T.GOLD_SAND&&Math.random()<0.04)p.energy=Math.min(255,p.energy+10);
    if(np.t===T.WATER)moistureBoost+=0.015;
  }
  if(nearType(x,y,T.ICE)){p.energy=Math.min(255,p.energy+0.1);return;}
  p.energy-=0.04;if(p.energy<=0||p.hp<=0){set(x,y,null);popDecr(p);return;}
  // Network sharing
  for(const[nx,ny] of nbrs){const np=get(nx,ny);if(np?.t===T.FUNGI&&np.energy<p.energy-20){const share=Math.min(5,(p.energy-np.energy)*0.3);p.energy-=share;np.energy+=share;}}
  const spreadChance=spreadSpeed*0.02+moistureBoost;
  if(Math.random()<spreadChance&&POP[T.FUNGI]<POP_MAX[T.FUNGI]){
    const targets=nbrs.filter(([nx,ny])=>{const np=get(nx,ny);if(!np)return lightGrid[idx(nx,ny)]<0.35;return np.t===T.STONE&&Math.random()<0.3;});
    if(targets.length){
      const[nx,ny]=targets[Math.floor(Math.random()*targets.length)];
      if(get(nx,ny)?.t===T.STONE)grid[idx(nx,ny)]=abiotic(T.DETRITUS);
      const ng=mutateGenome(p.g,mutRate);set(nx,ny,agentWithStrain(T.FUNGI,ng,p.sid,{energy:80}));popIncr({t:T.FUNGI,sid:p.sid});
    }
  }
  // ACID SPORE offense
  if(p.g[3]>180&&p.energy>150&&Math.random()<0.003){
    const above=y-gv.y,ax=x-gv.x;
    if(inB(ax,above)&&!get(ax,above)){set(ax,above,{t:T.ACID,age:0,ttl:25});p.energy-=20;}
  }
  if(Math.random()<p.g[5]/255*0.005){const above=y-gv.y,ax=x-gv.x;if(inB(ax,above)&&!get(ax,above))set(ax,above,{t:T.SPORE,age:0,g:p.g,sid:p.sid,energy:60});}
}

// ================================================================
//  SPORE
// ================================================================

// ── Spore ────────────────────────────────────────────────────
export function stepSpore(x,y,p){
  tryRise(x,y);p.energy--;
  if(p.energy<=0){
    const np=get(x+gv.x,y+gv.y);
    if(np&&np.t!==T.WALL&&np.t!==T.PLANT_WALL&&lightGrid[idx(x,y)]<0.4&&POP[T.FUNGI]<POP_MAX[T.FUNGI]){
      set(x,y,agentWithStrain(T.FUNGI,mutateGenome(p.g,mutRate),p.sid,{energy:60}));popIncr({t:T.FUNGI,sid:p.sid});
    } else{set(x,y,null);}
  }
}

// ================================================================
//  MITE — ice-skater, salt-tolerant, fire-fleer, salt/acid offense
// ================================================================

// ── Mite ─────────────────────────────────────────────────────
export function stepMite(x,y,p){
  p.age++;
  const speed=p.g[1]/255,aggression=p.g[3]/255,resilience=p.g[4]/255;
  p.energy-=0.1+speed*0.1;
  if(p.hp<=0||p.energy<=0){set(x,y,null);popDecr(p);return;}
  for(const[nx,ny] of getNeighbors(x,y)){
    const np=get(nx,ny);if(!np)continue;
    if(np.t===T.FIRE||np.t===T.LAVA){p.hp-=Math.max(3,18*(1-resilience*0.6));if(p.hp<=0){set(x,y,null);popDecr(p);return;}}
    if(np.t===T.ACID){p.hp-=Math.max(4,22*(1-resilience*0.5));if(p.hp<=0){set(x,y,null);popDecr(p);return;}}
    if(np.t===T.SALT&&Math.random()<0.08){p.energy=Math.min(255,p.energy+5);grid[idx(nx,ny)]=null;}
  }
  const nbrs=getNeighbors(x,y);
  for(const[nx,ny] of nbrs){
    const np=get(nx,ny);
    if(np?.t===T.FUNGI&&Math.random()<p.g[2]/255*0.3){
      p.energy+=25;set(nx,ny,null);popDecr(np);
      // Gorging on fungi while well-fed → chance to drop a queen mite
      if(p.energy>=185&&Math.random()<0.05&&POP[T.QUEEN_MITE]<POP_MAX[T.QUEEN_MITE]){
        let qNear2=false;
        for(let dy2=-20;dy2<=20&&!qNear2;dy2++)for(let dx2=-20;dx2<=20&&!qNear2;dx2++){if(get(x+dx2,y+dy2)?.t===T.QUEEN_MITE)qNear2=true;}
        if(!qNear2){
          const qSpot2=getNeighbors(x,y).filter(([qx,qy])=>!get(qx,qy));
          if(qSpot2.length){
            const[qx,qy]=qSpot2[Math.floor(Math.random()*qSpot2.length)];
            const ng=mutateGenome(p.g,mutRate);
            grid[idx(qx,qy)]=agentWithStrain(T.QUEEN_MITE,ng,p.sid,{energy:160});
            popIncr({t:T.QUEEN_MITE,sid:p.sid});p.energy-=100;
          }
        }
      }
      break;
    }
    if(np?.t===T.SPORE&&Math.random()<0.5){p.energy+=8;set(nx,ny,null);break;}
    if(np?.t===T.ASH&&Math.random()<0.15){p.energy+=4;set(nx,ny,null);break;}
  }
  p.energy=Math.min(255,p.energy);
  if(aggression>0.6&&Math.random()<aggression*0.04){
    for(const[nx,ny] of nbrs){const np=get(nx,ny);if(np?.t===T.SPIDER||np?.t===T.QUEEN_SPIDER){for(const[sx,sy] of nbrs){const sp=get(sx,sy);if(sp?.t===T.SALT||sp?.t===T.ACID){np.hp-=sp.t===T.ACID?20:8;if(sp.t===T.SALT)grid[idx(sx,sy)]=null;break;}}break;}}
  }
  const onIce=nearType(x,y,T.ICE);
  const nearFire=nearType(x,y,T.FIRE,T.LAVA);
  const nearAcid=nearType(x,y,T.ACID);
  if(nearFire||nearAcid){
    const fleeDir=nbrs.filter(([nx,ny])=>{const np=get(nx,ny);if(np&&np.t!==T.FUNGI)return false;return!nearType(nx,ny,T.FIRE,T.LAVA,T.ACID);});
    if(fleeDir.length){const[mx,my]=fleeDir[Math.floor(Math.random()*fleeDir.length)];swap(x,y,mx,my);[x,y]=[mx,my];}
    return;
  }
  const steps=onIce?3+Math.floor(speed*2):1+Math.floor(speed*1.5);
  for(let s=0;s<steps;s++){
    const dirs=getNeighbors(x,y).filter(([nx,ny])=>{const np=get(nx,ny);if(np&&np.t!==T.FUNGI)return false;const db=get(nx+gv.x,ny+gv.y);return!(db?.t===T.WATER||db?.t===T.ACID);});
    if(!dirs.length)break;const[mx,my]=dirs[Math.floor(Math.random()*dirs.length)];swap(x,y,mx,my);[x,y]=[mx,my];
  }
  if(p.energy>=220&&POP[T.QUEEN_MITE]<POP_MAX[T.QUEEN_MITE]){
    let qNear=false;for(let dy=-20;dy<=20&&!qNear;dy++)for(let dx=-20;dx<=20&&!qNear;dx++){if(get(x+dx,y+dy)?.t===T.QUEEN_MITE)qNear=true;}
    if(!qNear&&Math.random()<0.008){const nbrs2=getNeighbors(x,y).filter(([nx,ny])=>!get(nx,ny));if(nbrs2.length){const[qx,qy]=nbrs2[Math.floor(Math.random()*nbrs2.length)];const ng=mutateGenome(p.g,mutRate);grid[idx(qx,qy)]=agentWithStrain(T.QUEEN_MITE,ng,p.sid,{energy:160});popIncr({t:T.QUEEN_MITE,sid:p.sid});p.energy-=100;}}
  }
  if(p.energy>200&&Math.random()<p.g[5]/255*0.015&&POP[T.MITE]<POP_MAX[T.MITE]){
    const nbrs2=getNeighbors(x,y).filter(([nx,ny])=>!get(nx,ny));
    if(nbrs2.length){const[nx,ny]=nbrs2[Math.floor(Math.random()*nbrs2.length)];const ng=mutateGenome(p.g,mutRate);set(nx,ny,agentWithStrain(T.MITE,ng,p.sid,{energy:80}));popIncr({t:T.MITE,sid:p.sid});p.energy-=60;}
  }
}

// ================================================================
//  QUEEN MITE
// ================================================================
// ---- SEED ----
// Plant seed — falls with gravity until it lands on a solid surface,
// then germinates into a new plant. Carries parent genome.
// ---- SEED ----
// Falls with gravity. Drifts slightly sideways like a real seed.
// Germinates when it rests against any solid surface (sand, wall, clay).
// Seeds can stick to wall surfaces — plants grow from the side too.

// ── Seed ─────────────────────────────────────────────────────
export function stepSeed(x,y,p){
  p.energy-=0.2; // slower drain so seeds don't die before landing
  if(p.energy<=0){grid[idx(x,y)]=null;return;}

  const bx=x+gv.x, by=y+gv.y;
  const below=inB(bx,by)?grid[idx(bx,by)]:null;

  // Fall straight down — no sideways drift so seeds pile into towers
  if(!below||getDens(below)<2){
    swap(x,y,bx,by);
    return;
  }

  // Landed — germinate immediately on any solid surface (no RNG gate)
  const rootable=getNeighbors(x,y).some(([nx,ny])=>{
    const np=get(nx,ny);
    return np&&(np.t===T.SAND||np.t===T.GOLD_SAND||np.t===T.WHITE_SAND||
                np.t===T.WALL||np.t===T.FRIDGE_WALL||np.t===T.CLAY_HARD||
                np.t===T.CLAY||np.t===T.STONE||np.t===T.DETRITUS||np.t===T.ASH||
                np.t===T.PLANT||np.t===T.PLANT_WALL);
  });

  if(rootable){
    // Always germinate when landed on a valid surface — no population cap gate
    // (natural cap is just available empty cells in the world)
    const ng=mutateGenome(p.g,mutRate);
    grid[idx(x,y)]=agentWithStrain(T.PLANT,ng,p.sid,{energy:140,growTimer:5+Math.floor(Math.random()*10)});
    if(POP[T.PLANT]!==undefined) popIncr({t:T.PLANT,sid:p.sid});
  } else {
    // No rootable surface — keep waiting but die quickly if no energy
    if(p.energy<=5) grid[idx(x,y)]=null;
  }
}

// ================================================================
//  FROGSTONE — stationary dome predator, placed as a stamp
//  A 10×5 cell dome. The HUB cell (bottom-center) runs the logic.
//  Tongue SNAPS out instantly to full range, holds 3 ticks, retracts.
//  Sun proximity = longer range + faster reload.
//  Eats any living creature (g flag) that the tongue tip lands on.
// ================================================================

// ── Frogstone ────────────────────────────────────────────────
export function stepFrogstone(x,y,p){
  // Only the hub cell (bottom-center of dome) runs logic
  if(!p.isHub) return;

  p.phase=(p.phase||0)+1;
  p.hp=Math.min(255,(p.hp||200)+0.04);

  // Sun power: 0 (far) → 1 (close). Full range at ~1/4 world width
  const dx=sunX-x, dy=sunY-y;
  const sunDist=Math.sqrt(dx*dx+dy*dy)||1;
  // Always at least 0.15 power so frogstone fires even away from sun
  const sunPower=Math.max(0.15,Math.min(1,1-(sunDist/(W*0.45))));
  const tongueRange=Math.floor(6+sunPower*12);  // 7–18 cells
  const reloadTime=Math.max(1,Math.floor((28-sunPower*20)/10));  // 2–8 ticks (10x faster)

  // TONGUE STATE
  // null = idle
  // {tx,ty, hold, maxHold} = tongue extended (visible, killing)
  if(p.tongue){
    // Tongue is extended — hold for maxHold ticks then retract
    p.tongue.hold++;
    if(p.tongue.hold>=p.tongue.maxHold){
      p.tongue=null; // retract
    }
    return;
  }

  // Idle — check reload timer
  if(p.phase%reloadTime!==0) return;

  // Scan for nearest prey within tongueRange
  let bestPrey=null, bestDist=999;
  for(let sy2=-tongueRange;sy2<=tongueRange;sy2++){
    for(let sx2=-tongueRange;sx2<=tongueRange;sx2++){
      const px2=x+sx2, py2=y+sy2;
      if(!inB(px2,py2)) continue;
      const tp=get(px2,py2);
      if(!tp?.g) continue; // must be alive
      if(tp.t===T.FROGSTONE) continue; // don't eat siblings
      // Skip creatures immune to frogstone
      if(tp.customType!==undefined){
        const tdef=customCreatures.get(tp.customType);
        if(tdef&&(tdef.specials||[]).some(s=>s.id==='frogstone_immune')) continue;
      }
      const d=Math.sqrt(sx2*sx2+sy2*sy2);
      if(d<=tongueRange&&d<bestDist){bestDist=d;bestPrey={px:px2,py:py2,tp};}
    }
  }

  if(!bestPrey) return;

  // SNAP tongue — instant, kills prey immediately, stays visible for 4 ticks
  const {px:tx,py:ty,tp}=bestPrey;
  if(POP[tp.t]!==undefined) POP[tp.t]=Math.max(0,(POP[tp.t]||0)-1);
  if(tp.customType!==undefined&&POP[tp.customType]!==undefined)
    POP[tp.customType]=Math.max(0,(POP[tp.customType]||0)-1);
  grid[idx(tx,ty)]=null;
  p.hp=Math.min(255,(p.hp||200)+40);

  // Create visible tongue state (the kill already happened)
  p.tongue={tx, ty, hold:0, maxHold:4, originX:x, originY:y};
}
// Sun-powered, sessile. Spawns worker spiders continuously.
// Immune to fungi. Only dies from direct HP damage (fire, events).

// ── Queen Spider ─────────────────────────────────────────────
export function stepQueenSpider(x,y,p){
  p.age++;
  const lv=lightGrid[idx(x,y)];
  p.energy=Math.min(255,p.energy+lv*2+0.4);
  if(p.hp<=0){set(x,y,null);popDecr(p);return;}

  const spawnRate=25+Math.floor((1-p.g[5]/255)*90);
  if(p.age%spawnRate===0&&POP[T.SPIDER]<POP_MAX[T.SPIDER]){
    const nbrs=getNeighbors(x,y).filter(([nx,ny])=>!get(nx,ny));
    if(nbrs.length){
      const[nx,ny]=nbrs[Math.floor(Math.random()*nbrs.length)];
      const ng=mutateGenome(p.g,mutRate);
      set(nx,ny,agentWithStrain(T.SPIDER,ng,p.sid,{energy:120}));
      popIncr({t:T.SPIDER,sid:p.sid});
    }
  }
  // Also lay web nearby to give workers a starting surface
  if(p.age%40===0&&Math.random()<0.4){
    const nbrs=getNeighbors(x,y).filter(([nx,ny])=>!get(nx,ny));
    if(nbrs.length){const[wx,wy]=nbrs[Math.floor(Math.random()*nbrs.length)];grid[idx(wx,wy)]={t:T.WEB,age:0,ttl:300};}
  }
}

// ---- QUEEN MITE ----
// Sun-powered, sessile. Spawns worker mites continuously.
// Only dies from direct HP damage.

// ── Queen Mite ───────────────────────────────────────────────
export function stepQueenMite(x,y,p){
  p.age++;
  const lv=lightGrid[idx(x,y)];
  p.energy=Math.min(255,p.energy+lv*2+0.4);
  if(p.hp<=0){set(x,y,null);popDecr(p);return;}

  const spawnRate=20+Math.floor((1-p.g[5]/255)*80);
  if(p.age%spawnRate===0&&POP[T.MITE]<POP_MAX[T.MITE]){
    const nbrs=getNeighbors(x,y).filter(([nx,ny])=>!get(nx,ny));
    if(nbrs.length){
      const[nx,ny]=nbrs[Math.floor(Math.random()*nbrs.length)];
      const ng=mutateGenome(p.g,mutRate);
      set(nx,ny,agentWithStrain(T.MITE,ng,p.sid,{energy:100}));
      popIncr({t:T.MITE,sid:p.sid});
    }
  }
}

// ---- WEB decay ----

// ── Web ──────────────────────────────────────────────────────
export function stepWeb(x,y,p){
  p.ttl--;
  if(p.ttl<=0)set(x,y,null);
}

// ================================================================
//  CLASSIC SAND ELEMENTS
// ================================================================


// ── Custom Lab Creatures ─────────────────────────────────────
export function spawnCustomCell(typeId,x,y,isQueen){
  const def=customCreatures.get(typeId); if(!def)return null;
  const g=mutateGenome(def.genome,mutRate);
  return{t:T.CUSTOM_BASE,customType:typeId,isQueen,g,age:0,
    hp:isQueen?def.size.hp*2:def.size.hp,
    energy:isQueen?255:def.size.energy};
}

// ---- Custom creature step ----
export function stepCustom(x,y,p){
  const def=customCreatures.get(p.customType);
  if(!def){grid[idx(x,y)]=null;return;}
  p.age++;
  const arch=def.archetype||'creature';
  const eb=def.elemBehaviors||{};

  // ── PLANT / FUNGI archetype ──
  if(arch==='plant'||arch==='fungi'){
    const lv=lightGrid[idx(x,y)];
    const lightReq=def.lightReq??0.3;
    const spreadSpeed=def.spreadSpeed??0.4;
    if(arch==='fungi'){
      if(lv>lightReq+0.3){p.hp-=lv*4;if(p.hp<=0){grid[idx(x,y)]=null;POP[p.customType]=Math.max(0,(POP[p.customType]||0)-1);return;}}
      p.energy=Math.min(255,p.energy+0.3);
    } else {
      // Plants gain energy from any light, just less when light is low
      const lightGain=Math.max(0,lv)*2.5;
      if(lightGain>0) p.energy=Math.min(255,p.energy+lightGain);
      else p.energy=Math.max(10,p.energy-0.02); // very slow drain in total dark, but floor at 10 so they don't die
    }
    const nbrs=getNeighbors(x,y);
    for(const[nx,ny] of nbrs){
      const np=get(nx,ny);if(!np)continue;
      const wb=eb.water||'ignore';
      if(np.t===T.WATER){if(wb==='drink'){p.energy=Math.min(255,p.energy+3);if(Math.random()<0.1)grid[idx(nx,ny)]=null;}else if(wb==='die'){p.hp-=10;}}
      if((np.t===T.FIRE||np.t===T.LAVA)){const fb=eb.fire||'die';if(fb==='die'||fb==='flee'){p.hp-=20;}else if(fb==='feed on'){p.energy=Math.min(255,p.energy+10);}}
      if(np.t===T.ACID){const ab=eb.acid||'die';if(ab==='die'){p.hp-=25;}else if(ab==='resist'){p.hp-=3;}}
      if(np.t===T.SALT){const sb=eb.salt||'ignore';if(sb==='die'){p.hp-=20;}else if(sb==='mine'){p.energy=Math.min(255,p.energy+5);grid[idx(nx,ny)]=null;}}
      if(np.t===T.DETRITUS&&(eb.detritus==='eat'||arch==='fungi')){p.energy=Math.min(255,p.energy+5);if(Math.random()<0.05)grid[idx(nx,ny)]=null;}
      if(np.t===T.WOOD&&eb.wood==='eat'&&Math.random()<0.008){p.energy=Math.min(255,p.energy+12);grid[idx(nx,ny)]={t:T.DETRITUS,age:0};}

      // CONTACT DAMAGE
      if(np.g&&Math.random()<0.08){
        const harmfulTypes=def.harmfulTypes||[];
        const harmfulCustomIds=def.harmfulCustomIds||[];
        const isHarmTarget=harmfulTypes.includes(np.t)||(harmfulCustomIds.includes(np.customType));
        if(isHarmTarget){
          const contactDmg=Math.floor(4+p.energy/60);
          np.hp-=contactDmg;
          p.energy=Math.min(255,p.energy+2);
          if(np.hp<=0){
            if(POP[np.t]!==undefined)POP[np.t]=Math.max(0,(POP[np.t]||0)-1);
            if(np.customType!==undefined&&POP[np.customType]!==undefined)POP[np.customType]=Math.max(0,(POP[np.customType]||0)-1);
            grid[idx(nx,ny)]=null;
          }
        }
      }
    }
    if(p.hp<=0){grid[idx(x,y)]=null;POP[p.customType]=Math.max(0,(POP[p.customType]||0)-1);return;}

    // SPREAD — natural cap is available space, not a counter
    // (POP tracking for custom creatures is unreliable when external kills happen)
    const spreadChance=spreadSpeed*0.015*(p.energy/200);
    if(Math.random()<spreadChance){
      // Valid spread targets: empty cells, or detritus/ash (replaced)
      // Plants should NOT spread back onto their own type (avoid cycling)
      const targets=nbrs.filter(([nx,ny])=>{
        const np=get(nx,ny);
        if(!np){
          // For fungi: only spread to dark cells
          if(arch==='fungi') return lightGrid[idx(nx,ny)]<lightReq+0.2;
          return true; // plant: any empty cell
        }
        // Can overgrow detritus and ash
        return np.t===T.DETRITUS||np.t===T.ASH;
      });
      if(targets.length){
        const[nx,ny]=targets[Math.floor(Math.random()*targets.length)];
        const existing=get(nx,ny);
        if(existing?.t===T.DETRITUS||existing?.t===T.ASH) grid[idx(nx,ny)]=null;
        if(!get(nx,ny)){ // double-check still empty after clear
          grid[idx(nx,ny)]=spawnCustomCell(p.customType,nx,ny,false);
          POP[p.customType]=(POP[p.customType]||0)+1;
        }
      }
    }
    const repType=def.reproduction?.id||'budding';
    if((repType==='flowering'||repType==='spore')&&p.energy>160&&Math.random()<0.005){
      const emit=def.flowerEmit||'none';const ux=x-gv.x,uy=y-gv.y;
      if(inB(ux,uy)&&!get(ux,uy)){
        if(emit==='spore')grid[idx(ux,uy)]={t:T.SPORE,age:0,g:p.g,sid:p.sid||0,energy:50};
        else if(emit==='seed')grid[idx(ux,uy)]={t:T.SEED,age:0,g:p.g,sid:p.sid||0,energy:60};
        else if(emit==='water')grid[idx(ux,uy)]=abiotic(T.WATER);
        else if(emit==='detritus')grid[idx(ux,uy)]=abiotic(T.DETRITUS);
        else if(emit==='fire')grid[idx(ux,uy)]={t:T.BLOOM_FIRE,age:0,ttl:40+Math.floor(Math.random()*40)};
        else if(emit==='acid')grid[idx(ux,uy)]={t:T.ACID,age:0,ttl:60};
        else if(emit==='smoke')grid[idx(ux,uy)]={t:T.SMOKE,age:0,ttl:40};
        p.energy-=15;
      }
    }
    p.energy=Math.min(255,p.energy);
    return;
  }

  // ── CREATURE archetype ──
  p.energy-=p.isQueen?0.02:(0.06+def.size.speed*(p.g[1]/128)*0.05);
  if(def.specials.some(s=>s.id==='regenerating')) p.hp=Math.min(p.isQueen?def.size.hp*2:def.size.hp,p.hp+0.15);
  if(p.hp<=0||p.energy<=0){grid[idx(x,y)]=null;POP[p.customType]=Math.max(0,(POP[p.customType]||0)-1);return;}
  const nbrs=getNeighbors(x,y);
  const aggression=def.aggression||0.5;const fear=def.fear||0.3;
  const preyTypes=def.preyTypes||[];const allyTypes=def.allyTypes||[];
  const huntedByTypes=def.huntedByTypes||[];

  // ── GRAVITY: walker and crawler must be on a surface ──
  const movId=def.movement?.id||'walker';
  const needsSurface=movId==='walker'||movId==='crawler';
  if(needsSurface){
    const belowX=x+gv.x, belowY=y+gv.y;
    const below=inB(belowX,belowY)?grid[idx(belowX,belowY)]:null;
    const onSurface=getNeighbors(x,y).some(([nx,ny])=>{
      const np=get(nx,ny);
      return np&&(isSolid(np.t)||np.t===T.CLAY_HARD||np.t===T.CLAY||np.t===T.STONE);
    });
    if(!onSurface){
      // Fall in gravity direction
      if(inB(belowX,belowY)&&!below){
        swap(x,y,belowX,belowY);
      } else if(inB(belowX,belowY)&&below&&getDens(below)<3){
        swap(x,y,belowX,belowY);
      }
      return; // don't do other movement this tick while falling
    }
  }

  if(p.isQueen){
    p.energy=Math.min(255,p.energy+lightGrid[idx(x,y)]*2+0.4);
    const spawnRate=25+Math.floor((1-def.genome[5]/255)*50);
    if(p.age%spawnRate===0&&(POP[p.customType]||0)<(POP_MAX[p.customType]||200)){
      const empty=nbrs.filter(([nx,ny])=>!get(nx,ny));
      if(empty.length){const[nx,ny]=empty[Math.floor(Math.random()*empty.length)];grid[idx(nx,ny)]=spawnCustomCell(p.customType,nx,ny,false);POP[p.customType]=(POP[p.customType]||0)+1;}
    }
    return;
  }

  // Element behaviors
  for(const[nx,ny] of nbrs){
    const np=get(nx,ny);if(!np)continue;
    const applyEB=(key,type,dmg,gain)=>{
      if(np.t!==type)return;
      const b=eb[key]||'ignore';
      if(b==='die'||b==='freeze'){p.hp-=b==='freeze'?2:dmg||15;}
      else if(b==='flee'){}
      else if(b==='resist'){p.hp-=Math.floor((dmg||15)*0.15);}
      else if(b==='feed on'||b==='absorb'||b==='drink'||b==='swim in'){p.energy=Math.min(255,p.energy+(gain||6));}
      else if(b==='mine'||b==='eat'){p.energy=Math.min(255,p.energy+(gain||8));grid[idx(nx,ny)]=null;}
      else if(b==='choke'||b==='scald'||b==='coated'||b==='slow'){p.energy=Math.max(0,p.energy-2);}
      else if(b==='explode on'){p.hp-=40;grid[idx(nx,ny)]={t:T.FIRE,age:0,ttl:30};}
    };
    applyEB('fire',T.FIRE,20);applyEB('lava',T.LAVA,25);applyEB('water',T.WATER,0,5);
    applyEB('ice',T.ICE,2,4);applyEB('acid',T.ACID,22);applyEB('salt',T.SALT,5,6);
    applyEB('smoke',T.SMOKE,0,0);applyEB('steam',T.STEAM,3,0);
    applyEB('detritus',T.DETRITUS,0,8);applyEB('wood',T.WOOD,0,12);
    applyEB('oil',T.OIL,0,0);applyEB('gunpowder',T.GUNPOWDER,0,0);
  }
  if(p.hp<=0){grid[idx(x,y)]=null;POP[p.customType]=Math.max(0,(POP[p.customType]||0)-1);return;}

  // Passive diet
  if(def.diet.id==='photosynthetic') p.energy=Math.min(255,p.energy+lightGrid[idx(x,y)]*3);
  else if(def.diet.id==='pyrotroph'){p.energy=Math.min(255,p.energy+lightGrid[idx(x,y)]*1.5);for(const[nx,ny]of nbrs){const np=get(nx,ny);if((np?.t===T.FIRE||np?.t===T.LAVA)&&Math.random()<0.3){p.energy=Math.min(255,p.energy+15);break;}}}
  else if(def.diet.id==='cryotroph'){for(const[nx,ny]of nbrs){const np=get(nx,ny);if((np?.t===T.ICE||np?.t===T.WATER)&&Math.random()<0.2){p.energy=Math.min(255,p.energy+8);break;}}}
  else{for(const[nx,ny]of nbrs){const np=get(nx,ny);if(!np)continue;if(def.diet.targets&&def.diet.targets.includes(np.t)&&Math.random()<0.2){p.energy=Math.min(255,p.energy+20);if(np.g)POP[np.t]=Math.max(0,(POP[np.t]||0)-1);grid[idx(nx,ny)]=null;break;}}}

  // Hunt prey
  let hunted=false;
  const preyCustomIds=def.preyCustomIds||[];
  const allyCustomIds=def.allyCustomIds||[];

  // Helper: is this particle a prey target?
  const isPrey=(tp)=>{
    if(!tp?.g) return false;
    // Specific custom creature targeted by ID
    if(preyCustomIds.includes(tp.customType)) return true;
    // Blanket "all other custom" flag
    if(def.includesCustomPrey && tp.customType!==undefined && tp.customType!==p.customType) return true;
    // Kingdom types
    if(preyTypes.includes(tp.t)) return true;
    return false;
  };

  // Helper: is this particle an ally?
  const isAlly=(tp)=>{
    if(!tp?.g) return false;
    if(tp.customType===p.customType) return true; // same creature type = always ally
    if(allyCustomIds.includes(tp.customType)) return true;
    if(allyTypes.includes(tp.t)) return true;
    return false;
  };

  if(aggression>0.05){
    const hr=2+Math.floor(aggression*8);
    let bt=null,bd=999;
    for(let dy=-hr;dy<=hr;dy++)for(let dx=-hr;dx<=hr;dx++){
      const tx=x+dx,ty=y+dy;
      const tp=get(tx,ty);
      if(!tp||!tp.g)continue;
      if(!isPrey(tp))continue;
      if(isAlly(tp))continue;
      const d=Math.abs(dx)+Math.abs(dy);
      if(d<bd){bd=d;bt={tx,ty,tp};}
    }
    if(bt){
      const{tx,ty,tp}=bt;
      if(bd<=1){
        // Adjacent — attack directly
        const dmg=attackDamage(def,aggression);
        tp.hp-=dmg;
        p.energy=Math.min(255,p.energy+15);
        applyAttackEffect(def,tx,ty,tp);
        if(tp.hp<=0){
          if(POP[tp.t]!==undefined)POP[tp.t]=Math.max(0,(POP[tp.t]||0)-1);
          if(tp.customType!==undefined&&POP[tp.customType]!==undefined)POP[tp.customType]=Math.max(0,(POP[tp.customType]||0)-1);
          grid[idx(tx,ty)]=null;
          p.energy=Math.min(255,p.energy+30);
        }
        hunted=true;
      } else if(Math.random()<aggression){
        // Chase — move toward prey; can step into empty or push past non-ally non-prey
        const ddx=Math.sign(tx-x),ddy=Math.sign(ty-y);
        // Try direct step first, then diagonal alternatives
        const candidates=[[x+ddx,y+ddy],[x+ddx,y],[x,y+ddy]];
        for(const[nx2,ny2] of candidates){
          if(!inB(nx2,ny2))continue;
          const nc=get(nx2,ny2);
          // Can enter: empty, web, or non-ally non-prey abiotic
          if(!nc||nc.t===T.WEB||(!nc.g&&nc.t!==T.WALL&&nc.t!==T.CLAY_HARD)){
            swap(x,y,nx2,ny2);hunted=true;break;
          }
        }
      }
    }
  }

  // Flee from huntedBy predators (or general threats when low hp)
  if(!hunted&&fear>0&&p.hp<(def.size.hp*0.6)&&Math.random()<fear){
    let td={x:0,y:0};
    for(const[nx,ny] of nbrs){
      const np=get(nx,ny);if(!np?.g)continue;
      const isHunter=huntedByTypes.some(h=>(h.type!==undefined&&h.type===np.t)||(h.customId!==undefined&&np.customType===h.customId));
      const isThreat=isHunter||(isPrey(p)&&np.g&&!isAlly(np)); // also flee from anything that would hunt us
      if(isThreat){td.x-=Math.sign(nx-x);td.y-=Math.sign(ny-y);}
    }
    if(td.x||td.y){
      const fx=x+Math.sign(td.x),fy=y+Math.sign(td.y);
      if(inB(fx,fy)&&!get(fx,fy)){swap(x,y,fx,fy);hunted=true;}
    }
  }

  // Specials
  for(const sp of def.specials){
    if(sp.id==='pyro'&&Math.random()<0.005){const f=nbrs.filter(([nx,ny])=>{const t=get(nx,ny)?.t;return t===T.WOOD||t===T.PLANT||t===T.OIL;});if(f.length){const[fx,fy]=f[0];grid[idx(fx,fy)]={t:T.FIRE,age:0,ttl:40};}}
    if(sp.id==='crystalline'&&Math.random()<0.002){const c2=nbrs.filter(([nx,ny])=>{const t=get(nx,ny)?.t;return t===T.SAND||t===T.DETRITUS;});if(c2.length){const[cx2,cy2]=c2[0];grid[idx(cx2,cy2)]={t:T.STONE,age:0,settled:5};}}
    if(sp.id==='smokescreen'&&p.hp<def.size.hp*0.4&&Math.random()<0.08){const em=nbrs.filter(([nx,ny])=>!get(nx,ny));if(em.length){const[sx2,sy2]=em[0];grid[idx(sx2,sy2)]={t:T.SMOKE,age:0,ttl:50};}}
  }

  // Movement
  if(!hunted){
    const sp=def.size.speed*(p.g[1]/128);
    const onIce=nearType(x,y,T.ICE)&&eb.ice==='skate on';
    const steps=onIce?3:1;
    for(let s=0;s<steps;s++){
      if(Math.random()>0.4*sp)break;
      const allNbrs=getNeighbors(x,y);
      const dirs=allNbrs.map(([nx2,ny2])=>{
        const np2=get(nx2,ny2);
        // Walker/crawler: only move to cells that are adjacent to a solid (surface-hugging)
        if(needsSurface){
          if(!np2){
            const hasSurface=getNeighbors(nx2,ny2).some(([ax,ay])=>{
              if(ax===x&&ay===y)return false;
              const ap=get(ax,ay);
              return ap&&(isSolid(ap.t)||ap.t===T.CLAY_HARD||ap.t===T.STONE);
            });
            if(!hasSurface)return null; // don't step into mid-air
            return[nx2,ny2,1];
          }
          // Can enter water if swimmer behavior set
          if(np2.t===T.WATER&&eb.water==='swim in')return[nx2,ny2,2];
          return null;
        }
        // Non-surface movers: original logic
        if(!np2)return[nx2,ny2,1];
        if(np2.t===T.CLAY_HARD&&(movId==='burrower'||eb.clay==='tunnels'||eb.clay==='dig'))return[nx2,ny2,2];
        if(np2.t===T.WATER&&(movId==='swimmer'||eb.water==='swim in'))return[nx2,ny2,2];
        if(np2.t===T.WEB&&movId==='climber')return[nx2,ny2,1];
        if(np2.t===T.SAND&&eb.sand==='burrow')return[nx2,ny2,2];
        return null;
      }).filter(Boolean);
      if(dirs.length){const[mx,my]=dirs[Math.floor(Math.random()*dirs.length)];swap(x,y,mx,my);[x,y]=[mx,my];}
    }
  }

  if((def.movement?.id==='burrower'||eb.clay==='dig')&&Math.random()<0.05){
    const cn=nbrs.filter(([nx2,ny2])=>get(nx2,ny2)?.t===T.CLAY_HARD&&!get(nx2,ny2)?.reinforced);
    if(cn.length){const[cx2,cy2]=cn[Math.floor(Math.random()*cn.length)];grid[idx(cx2,cy2)]=null;}
  }

  if(p.energy>180&&(POP[p.customType]||0)<(POP_MAX[p.customType]||200)&&Math.random()<def.reproduction.rate*(def.genome[5]/128)){
    const empty=nbrs.filter(([nx,ny])=>!get(nx,ny));
    if(empty.length){const[nx,ny]=empty[Math.floor(Math.random()*empty.length)];grid[idx(nx,ny)]=spawnCustomCell(p.customType,nx,ny,false);POP[p.customType]=(POP[p.customType]||0)+1;p.energy-=80;}
  }
}

// Attack damage by attack type
export function attackDamage(def,aggression){
  const base={bite:12,venom:8,acid_spit:18,fire_breath:20,crush:15}[def.attackId||'bite']||12;
  return Math.floor(base*(0.5+aggression));
}

// Apply special attack effects
export function applyAttackEffect(def,tx,ty,tp){
  switch(def.attackId){
    case 'venom': tp.energy=Math.max(0,(tp.energy||0)-15); break;
    case 'acid_spit': {const a={t:T.ACID,age:0,ttl:20};const ax2=tx+gv.x,ay2=ty+gv.y;if(inB(ax2,ay2)&&!get(ax2,ay2))grid[idx(ax2,ay2)]=a;break;}
    case 'fire_breath': {if(Math.random()<0.3){const fx2=tx-gv.x,fy2=ty-gv.y;if(inB(fx2,fy2)&&!get(fx2,fy2))grid[idx(fx2,fy2)]={t:T.FIRE,age:0,ttl:15};}break;}
    case 'crush': tp.energy=Math.max(0,(tp.energy||0)-8); tp.hp-=5; break;
  }
}

// ---- Observe mode ----
