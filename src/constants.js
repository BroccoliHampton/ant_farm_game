// ================================================================
//  CONSTANTS — Element types, world dimensions, densities, colors
//  Edit here to add new elements or adjust population caps.
// ================================================================

export const W = 120, H = 200;
export const POP_GRAPH_MAX = 80;
export const GDIRS = [{x:0,y:1},{x:1,y:0},{x:0,y:-1},{x:-1,y:0}];

// Element type IDs
export const T = {
  // Abiotic
  EMPTY:0, WALL:1, SAND:2, GOLD_SAND:3, WHITE_SAND:4,
  WATER:5, OIL:6, DETRITUS:7, FIRE:8, MUTAGEN:9,
  CLAY:10, CLAY_HARD:11, // clay: falls like sand, hardens when settled — ants tunnel through
  // Kingdom agents — each has a genome
  PLANT:20, ANT:21, QUEEN:22, SPIDER:23, FUNGI:24, MITE:25,
  // Derived states
  PLANT_WALL:26, WEB:27, SPORE:28, EGG:29,
  // New reproductive types
  SEED:30,         // plant seed — falls, germinates on surface
  QUEEN_SPIDER:31, // spider queen — sessile, spawns workers
  QUEEN_MITE:32,   // mite queen — sessile, spawns workers
  FROGSTONE:33,    // large stationary predator — sun-powered tongue, eats nearby creatures
  // Classic sand elements
  LAVA:40, STONE:41, STEAM:42, ICE:43, SMOKE:44,
  WOOD:45, ASH:46, ACID:47, GUNPOWDER:48, SALT:49,
  // Fridge
  FRIDGE_WALL:50,
  CLOUD:51,       // water spout — floats, spawns water droplets, recharges from moisture
  BLOOM_CLOUD:52, // incendiary substance — water contact triggers fire blooms
  BLOOM_FIRE:53,  // floating fireball launched by bloom cloud
  PROG_CLOUD:54,  // programmable cloud — emits any chosen element at set rate
  WEATHER_STATION:55, // programmable weather controller
  PROG_VOID:56,   // programmable void — destroys any chosen element on contact
  CUSTOM_BASE:100, // custom lab creatures start at 100+
};

// Fridge zones — {x1,y1,x2,y2} bounding boxes; mutagen inside = frozen

// Density table
// Abiotic density table (higher=heavier)
export const DENSITY={
  [T.WALL]:999,[T.FRIDGE_WALL]:999,[T.CLAY_HARD]:999,
  [T.GOLD_SAND]:8,[T.SAND]:5,[T.CLAY]:5,[T.DETRITUS]:4,
  [T.WHITE_SAND]:3,[T.WATER]:2,[T.MUTAGEN]:2,[T.OIL]:1,
  [T.FIRE]:0.5,[T.SPORE]:1,
  [T.PLANT]:3,[T.ANT]:3,[T.QUEEN]:5,[T.SPIDER]:3,[T.FUNGI]:2,
  [T.MITE]:2,[T.PLANT_WALL]:999,[T.WEB]:1,[T.EGG]:3,
  [T.SEED]:4,[T.QUEEN_SPIDER]:5,[T.QUEEN_MITE]:5,
  // Classic elements
  [T.LAVA]:8,[T.STONE]:7,[T.STEAM]:0.1,[T.ICE]:3,
  [T.SMOKE]:0.15,[T.WOOD]:4,[T.ASH]:0.8,[T.ACID]:2.1,[T.GUNPOWDER]:4.5,[T.SALT]:3,
};



// Genome layout
// Gene indices are the same across kingdoms but mean different things
// [0] size/density   [1] speed/mobility  [2] hunger/appetite
// [3] aggression     [4] resilience      [5] reproduction_rate

export const GENE_NAMES=[
  ['DENSITY','MOBILITY','APPETITE','AGGRESSION','RESILIENCE','REPRO'],
  ['DENSITY','MOBILITY','APPETITE','AGGRESSION','RESILIENCE','REPRO'],
  ['DENSITY','MOBILITY','APPETITE','AGGRESSION','RESILIENCE','REPRO'],
  ['DENSITY','MOBILITY','APPETITE','AGGRESSION','RESILIENCE','REPRO'],
  ['DENSITY','MOBILITY','APPETITE','AGGRESSION','RESILIENCE','REPRO'],
];

// Kingdom-specific default genome ranges (min,max per gene)
export const GENOME_DEFAULTS = {
  [T.PLANT]:   [[80,140],[10,40], [60,100],[0,30],  [100,180],[80,150]],
  [T.ANT]:     [[60,100],[120,200],[100,180],[80,150],[80,140],[100,180]],
  [T.QUEEN]:   [[100,160],[20,60],[80,140],[40,80],  [140,220],[180,255]],
  [T.SPIDER]:  [[80,140],[100,180],[80,160],[160,230],[120,200],[40,100]],
  [T.FUNGI]:   [[40,80], [10,40], [100,180],[20,60], [80,160],[120,200]],
  [T.MITE]:    [[40,80], [160,230],[120,200],[60,120],[60,120],[140,220]],
};


// Kingdom display
export const KINGDOM_HUE={[T.PLANT]:130,[T.ANT]:100,[T.QUEEN]:35,[T.SPIDER]:0,[T.FUNGI]:280,[T.MITE]:40,[T.QUEEN_SPIDER]:285,[T.QUEEN_MITE]:50};
export const K_COLORS={
  [T.PLANT]:'#2ecc40',[T.ANT]:'#01ff70',[T.QUEEN]:'#ffdc00',
  [T.SPIDER]:'#ff4136',[T.FUNGI]:'#b10dc9',[T.MITE]:'#ff851b',
  [T.QUEEN_SPIDER]:'#f012be',[T.QUEEN_MITE]:'#ffdc00',
};
export const K_NAMES={
  [T.PLANT]:'PLANT',[T.ANT]:'ANT',[T.QUEEN]:'QUEEN ANT',
  [T.SPIDER]:'SPIDER',[T.FUNGI]:'FUNGI',[T.MITE]:'MITE',
  [T.QUEEN_SPIDER]:'QUEEN SPIDER',[T.QUEEN_MITE]:'QUEEN MITE',
};

export const POP_MAX = {
  [T.PLANT]:800,[T.ANT]:300,[T.QUEEN]:20,[T.SPIDER]:80,
  [T.FUNGI]:300,[T.MITE]:200,[T.QUEEN_SPIDER]:10,[T.QUEEN_MITE]:10,
};


// ── Hover tooltip labels/colors ──────────────────────────────
export const TIP_LABELS={
  [T.WALL]:'WALL',[T.FRIDGE_WALL]:'FRIDGE WALL',[T.CLAY]:'CLAY (wet)',[T.CLAY_HARD]:'CLAY (set)',[T.SAND]:'SAND',[T.GOLD_SAND]:'GOLD SAND',
  [T.WHITE_SAND]:'WHITE SAND',[T.DETRITUS]:'DETRITUS',[T.WATER]:'WATER',
  [T.OIL]:'OIL',[T.FIRE]:'FIRE',[T.MUTAGEN]:'LIFE SEED',
  [T.PLANT]:'PLANT',[T.ANT]:'ANT',[T.QUEEN]:'QUEEN',
  [T.SPIDER]:'SPIDER',[T.FUNGI]:'FUNGI',[T.MITE]:'MITE',
  [T.PLANT_WALL]:'PLANT WALL',[T.WEB]:'WEB',[T.SPORE]:'SPORE',[T.EGG]:'EGG',
  [T.FROGSTONE]:'FROGSTONE',
};
export const TIP_COLORS={
  [T.WALL]:'#888',[T.FRIDGE_WALL]:'#44aaee',[T.CLAY]:'#7a8599',[T.CLAY_HARD]:'#5e6a7a',[T.SAND]:'#c4a35a',[T.GOLD_SAND]:'#ffc800',
  [T.WHITE_SAND]:'#dcdcd7',[T.DETRITUS]:'#7a6040',[T.WATER]:'#3c82c8',
  [T.OIL]:'#4a7a28',[T.FIRE]:'#ff6600',[T.MUTAGEN]:'#cc44ff',
  [T.PLANT]:K_COLORS[T.PLANT],[T.ANT]:K_COLORS[T.ANT],[T.QUEEN]:K_COLORS[T.QUEEN],
  [T.SPIDER]:K_COLORS[T.SPIDER],[T.FUNGI]:K_COLORS[T.FUNGI],[T.MITE]:K_COLORS[T.MITE],
  [T.PLANT_WALL]:'#226622',[T.WEB]:'#aaaaaa',[T.SPORE]:'#9955cc',[T.EGG]:'#ddcc88',
  [T.FROGSTONE]:'#88cc44',
};
