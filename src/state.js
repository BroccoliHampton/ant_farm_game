// ================================================================
//  STATE — All mutable game state, imported and mutated by all modules
// ================================================================
import { W, H, T, POP_MAX, GDIRS } from './constants.js';

export const grid = new Array(W*H).fill(null);
export const lightGrid = new Float32Array(W*H);
export const pheroGrid = new Float32Array(W*H);

// Sun
export let sunX=Math.floor(W*0.5), sunY=10, sunActive=true;
export function setSun(x,y,a){ sunX=x; sunY=y; if(a!==undefined)sunActive=a; }

// Tick
export let tickCount=0;
export function incTick(){ tickCount++; }

// Mutation rate
export let mutRate=0.003;
export function setMutRate(v){ mutRate=v; }

// Population counters
export const POP={
  [T.PLANT]:0,[T.ANT]:0,[T.QUEEN]:0,[T.SPIDER]:0,
  [T.FUNGI]:0,[T.MITE]:0,[T.QUEEN_SPIDER]:0,[T.QUEEN_MITE]:0,
};
export const POP_HISTORY={
  [T.PLANT]:[]  ,[T.ANT]:[]   ,[T.QUEEN]:[] ,[T.SPIDER]:[],
  [T.FUNGI]:[]  ,[T.MITE]:[]  ,[T.QUEEN_SPIDER]:[]         ,[T.QUEEN_MITE]:[],
};
export let lastPopSample=0;
export function setLastPopSample(v){ lastPopSample=v; }

// Gravity
export let gv={x:0,y:1};
export let boxTurns=0, boxAngle=0;
export function setGv(v){ gv=v; }
export function setBox(t,a){ boxTurns=t; boxAngle=a; }

// Fridge zones
export const fridgeZones=[];

// Strains
export const strainRegistry=new Map();
export let nextStrain=1;
export function incNextStrain(){ return nextStrain++; }

// Held seed
export let heldMutagen=null;
export function setHeldMutagen(v){ heldMutagen=v; }

// Custom lab creatures
export const customCreatures=new Map();
export let nextCustomId=T.CUSTOM_BASE;
export function incNextCustomId(){ return nextCustomId++; }

// Image buffer
export let imageData=null, pixels=null;
export function setImageBuffer(id,px){ imageData=id; pixels=px; }

// UI
export let currentTool='draw', currentEl='sand', brushSize=3;
export let isDown=false, speedMult=1;
export let selectedCustom=null, selectedIsQueen=false;
export let historySelectedId=null;
export let observeMode=false, savedSpeedMult=1;
export let editingCreatureId=null;
export let labIcon='?';
export let labPreySet=new Set(), labAllySet=new Set();
export let labHuntedBySet=new Set(), labHarmfulSet=new Set();
export let labSpecialSet=new Set(), labToleranceSet=new Set();
export let labElemBehaviors={};
export function setTool(t){ currentTool=t; }
export function setEl(e){ currentEl=e; }
export function setBrush(v){ brushSize=v; }
export function setIsDown(v){ isDown=v; }
export function setSpeedMult(v){ speedMult=v; }
export function setSelectedCustom(id,q){ selectedCustom=id; selectedIsQueen=q; }
export function setHistorySelected(id){ historySelectedId=id; }
export function setObserveMode(v,sm){ observeMode=v; if(sm!==undefined)savedSpeedMult=sm; }
export function setEditingCreature(id){ editingCreatureId=id; }
export function setLabIcon(v){ labIcon=v; }
export function setLabElemBehaviors(v){ labElemBehaviors=v; }

// Weather station
export let ws_rain_active=false, ws_rain_rate=3, ws_rain_type_key='water';
export function setWsRain(a,r,k){ ws_rain_active=a; if(r!==undefined)ws_rain_rate=r; if(k!==undefined)ws_rain_type_key=k; }

// World events
export let nextEvent=800+Math.floor(Math.random()*800);
export let activeEvent=null, activeEventAge=0;
export let rainActive=false, rainTicks=0, rainDuration=0;
export let acidRainActive=false, acidRainTicks=0, acidRainDuration=0;
export function setNextEvent(v){ nextEvent=v; }
export function setActiveEvent(n,a){ activeEvent=n; activeEventAge=a; }
export function setRain(a,t,d){ rainActive=a; rainTicks=t; rainDuration=d; }
export function setAcidRain(a,t,d){ acidRainActive=a; acidRainTicks=t; acidRainDuration=d; }

// Box draw
export let boxDrawStart=null;
export function setBoxDrawStart(v){ boxDrawStart=v; }
