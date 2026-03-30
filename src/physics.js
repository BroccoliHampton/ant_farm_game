// ================================================================
//  PHYSICS — Gravity, flow, rise, light propagation, env damage
// ================================================================
import { W, H, T } from './constants.js';
import { grid, lightGrid, gv, sunX, sunY, sunActive, pheroGrid } from './state.js';
import { idx, inB, get, getDens, getPerp, getNeighbors, swap } from './utils.js';

export function tryFall(x,y,p){
  const nx=x+gv.x,ny=y+gv.y;
  if(!inB(nx,ny))return false;
  const below=get(nx,ny);
  if(below&&isWall(below.t))return false;
  const myD=getDens(p),belD=getDens(below);
  if(!below||belD<myD-0.3){
    swap(x,y,nx,ny);return true;
  }
  const perp=getPerp();
  const order=Math.random()<0.5?perp:[...perp].reverse();
  for(const d of order){const dx=nx+d.x,dy=ny+d.y;if(inB(dx,dy)&&!get(dx,dy)){swap(x,y,dx,dy);return true;}}
  return false;
}
export function tryFlow(x,y){
  const nx=x+gv.x,ny=y+gv.y;
  if(inB(nx,ny)&&!get(nx,ny)){swap(x,y,nx,ny);return;}
  const perp=getPerp();
  const order=Math.random()<0.5?perp:[...perp].reverse();
  for(const d of order){const sx=x+d.x,sy=y+d.y;if(inB(sx,sy)&&!get(sx,sy)){swap(x,y,sx,sy);return;}}
}
export function tryRise(x,y){
  const nx=x-gv.x,ny=y-gv.y;
  if(inB(nx,ny)&&!get(nx,ny)){swap(x,y,nx,ny);return;}
  const perp=getPerp();
  const order=Math.random()<0.5?perp:[...perp].reverse();
  for(const d of order){const sx=x+d.x,sy=y+d.y;if(inB(sx,sy)&&!get(sx,sy)){swap(x,y,sx,sy);return;}}
}

// ================================================================
//  LIGHT SYSTEM
// ================================================================
export function updateLight(){
  for(let i=0;i<lightGrid.length;i++)lightGrid[i]*=0.85;
  if(!sunActive)return;
  for(let r=0;r<60;r++){
    const a=(r/60)*Math.PI*2;
    let rx=sunX,ry=sunY,dx=Math.cos(a),dy=Math.sin(a),iv=1.0;
    for(let s=0;s<100;s++){
      rx+=dx;ry+=dy;
      const gx=Math.floor(rx),gy=Math.floor(ry);
      if(!inB(gx,gy))break;
      const i=idx(gx,gy);
      lightGrid[i]=Math.max(lightGrid[i],iv);
      const p=grid[i];
      if(p){if(isWall(p.t))break;iv*=0.82;if(iv<0.04)break;}
    }
  }
}

// ================================================================
//  KINGDOM BEHAVIORS
// ================================================================

// ---- PLANT ----
// Plants grow toward sun, harden into woody stems. Nearly immortal — only
// ants eating them or fire destroys them. Plants kill mites on contact (root toxins).
// Gene [1]=growth_rate [5]=branching
// ---- PLANT ----
// Persistent, photosynthetic. Grows toward sun. Edible by ants, burns in fire.
// Never hardens — stays as soft plant cells. Kills mites on contact.
// ================================================================
//  ELEMENTAL INTERACTION SYSTEM
// ================================================================
export function nearType(x,y,...types){
  for(const[nx,ny] of getNeighbors(x,y)){const t=get(nx,ny)?.t;if(t!==undefined&&types.includes(t))return true;}
  return false;
}
export function hazardPenalty(nx,ny,resilience){
  const t=get(nx,ny)?.t;
  if(t===T.FIRE||t===T.LAVA)return -8+resilience*4;
  if(t===T.ACID)return -6+resilience*3;
  if(t===T.SALT)return -2;
  if(t===T.WATER)return -1;
  return 0;
}
export function envDamage(x,y,p){
  const res=p.g[4]/255;let hp=0,en=0;
  for(const[nx,ny] of getNeighbors(x,y)){
    const np=get(nx,ny);if(!np)continue;
    switch(np.t){
      case T.FIRE:hp-=Math.max(2,15*(1-res*0.7));break;
      case T.LAVA:hp-=Math.max(4,25*(1-res*0.6));break;
      case T.ACID:hp-=Math.max(3,20*(1-res*0.5));en-=5;break;
      case T.SALT:hp-=Math.max(1,4*(1-res*0.4));en-=3;break;
      case T.SMOKE:en-=0.5;break;
      case T.ICE:en-=1;break;
      case T.GOLD_SAND:en+=0.5;break;
      case T.ASH:en+=0.2;break;
      case T.STEAM:hp-=0.5;break;
    }
  }
  p.hp+=hp;p.energy=Math.min(255,p.energy+en);
  if(p.hp<=0||p.energy<=0){set(x,y,null);popDecr(p);return true;}
  return false;
}
