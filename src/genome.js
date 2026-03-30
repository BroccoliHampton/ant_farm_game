// ================================================================
//  GENOME — Strain registration, genome generation & mutation
// ================================================================
import { T, GENOME_DEFAULTS, KINGDOM_HUE, K_COLORS } from './constants.js';
import { strainRegistry, incNextStrain, mutRate } from './state.js';

export function randomGenome(type){
  const def=GENOME_DEFAULTS[type]||[[0,255],[0,255],[0,255],[0,255],[0,255],[0,255]];
  return def.map(([lo,hi])=>Math.floor(lo+Math.random()*(hi-lo)));
}

export function mutateGenome(g,rate){
  const ng=[...g];
  for(let i=0;i<6;i++){
    if(Math.random()<rate)
      ng[i]=Math.min(255,Math.max(0,ng[i]+Math.floor((Math.random()-0.5)*40)));
  }
  return ng;
}

// Strain registry — unique genome strains per kingdom

export function registerStrain(type,genome,parentId=null){
  const id=nextStrain++;
  const hue=KINGDOM_HUE[type]+(genome[3]/255)*40-20; // aggression shifts hue
  const [r,g2,b]=hslToRgb(hue,60+genome[4]/255*30,30+genome[5]/255*20);
  strainRegistry.set(id,{id,type,genome:[...genome],color:`rgb(${r},${g2},${b})`,pop:0,born:tickCount,peak:0,parentId});
  return id;
}

// Kingdom base hues (for color generation)
