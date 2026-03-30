// ================================================================
//  UTILS — Grid helpers, type checks, entity factories, pop tracking
// ================================================================
import { W, H, T, DENSITY, KINGDOM_HUE, K_COLORS } from './constants.js';
import { grid, gv, fridgeZones, POP, strainRegistry, incNextStrain, getS } from './state.js';

export const idx=(x,y)=>y*W+x;
export const inB=(x,y)=>x>=0&&x<W&&y>=0&&y<H;
export const get=(x,y)=>inB(x,y)?grid[idx(x,y)]:null;
export const inFridge=(x,y)=>fridgeZones.some(f=>x>f.x1&&x<f.x2&&y>f.y1&&y<f.y2);

export function getDens(p){
  if(!p) return 0;
  if(p.g) return 2+(p.g[0]/255)*4; // genome density gene maps 2–6
  return DENSITY[p.t]??2;
}


export function isImmovable(t){ return t===T.WALL||t===T.FRIDGE_WALL||t===T.WOOD||t===T.WEATHER_STATION; }
// Stone is immovable only once age>1 (after it has had one tick to fall)
export function isStoneStatic(p){ return p&&p.t===T.STONE&&(p.settled||0)>=3; }
export function isWall(t){ return t===T.WALL||t===T.FRIDGE_WALL||t===T.CLAY_HARD; }
export function isSolid(t){
  return t===T.WALL||t===T.FRIDGE_WALL||t===T.CLAY_HARD||
         t===T.SAND||t===T.GOLD_SAND||t===T.WHITE_SAND||t===T.CLAY||
         t===T.QUEEN;
}

export function set(x,y,v){
  if(!inB(x,y))return;
  const c=grid[idx(x,y)];
  if(c&&isWall(c.t))return; // walls immovable except erase
  grid[idx(x,y)]=v;
}

export function erase(x,y){ if(inB(x,y)) grid[idx(x,y)]=null; }

export function swap(x1,y1,x2,y2){
  const a=grid[idx(x1,y1)],b=grid[idx(x2,y2)];
  if((a&&(isWall(a.t)||isImmovable(a.t)||isStoneStatic(a)))||
     (b&&(isWall(b.t)||isImmovable(b.t)||isStoneStatic(b))))return;
  grid[idx(x1,y1)]=b; grid[idx(x2,y2)]=a;
}

export function getNeighbors(x,y){
  return [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]
    .map(([dx,dy])=>[x+dx,y+dy]).filter(([a,b])=>inB(a,b));
}
export function getCardinals(x,y){
  return [[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>[x+dx,y+dy]).filter(([a,b])=>inB(a,b));
}
export function getPerp(){ return gv.y!==0?[{x:-1,y:0},{x:1,y:0}]:[{x:0,y:-1},{x:0,y:1}]; }


export function abiotic(t,extra={}){ return {t,age:0,...extra}; }
export function agent(type,genome,extra={}){
  const sid=registerStrain(type,genome);
  const p={t:type,g:genome,sid,age:0,hp:100,energy:150,...extra};
  return p;
}
export function agentWithStrain(type,genome,sid,extra={}){
  return {t:type,g:genome,sid,age:0,hp:100,energy:150,...extra};
}

export function hslToRgb(h,s,l){
  h=((h%360)+360)%360;s/=100;l/=100;
  const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;
  let r=0,g=0,b=0;
  if(h<60){r=c;g=x;}else if(h<120){r=x;g=c;}
  else if(h<180){g=c;b=x;}else if(h<240){g=x;b=c;}
  else if(h<300){r=x;b=c;}else{r=c;b=x;}
  return[Math.round((r+m)*255),Math.round((g+m)*255),Math.round((b+m)*255)];
}


export function makeBar(val,max,col){
  const pct=Math.min(100,Math.round(val/max*100));
  return `<span style="display:inline-block;width:30px;height:4px;background:#1a1a30;border-radius:2px;vertical-align:middle;position:relative;"><span style="display:block;width:${pct}%;height:100%;background:${col};border-radius:2px;"></span></span>`;
}

// Population tracking
export function popIncr(p){ if(POP[p.t]!==undefined)POP[p.t]++; }
export function popDecr(p){
  if(p.customType!==undefined){
    // Custom creatures track POP by their specific ID, not T.CUSTOM_BASE
    if(POP[p.customType]!==undefined) POP[p.customType]=Math.max(0,POP[p.customType]-1);
  } else {
    if(POP[p.t]!==undefined) POP[p.t]=Math.max(0,POP[p.t]-1);
  }
}

export function maybeMutateStrain(p,ng){
  const parent=strainRegistry.get(p.sid);
  if(!parent)return;
  let drift=0;for(let i=0;i<6;i++)drift+=Math.abs(ng[i]-parent.genome[i]);
  if(drift>80){registerStrain(p.t,ng,p.sid);}
}

// ================================================================
//  CLAY PHYSICS

export function canvasToGrid(cx,cy){
  const canvas=document.getElementById('c');
  const rect=canvas.getBoundingClientRect();
  const S=getS();
  const lx=cx-rect.left, ly=cy-rect.top;
  return [Math.floor(lx/S), Math.floor(ly/S)];
}
