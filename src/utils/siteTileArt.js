// siteTileArt.js
// Programmatic SVG tiles for wilderness site sub-maps (caves, ruins, forests, hills,
// mountains), matching the data-URI approach of townTileArt / worldTileArt. Generic tile
// types ('wall','floor','rubble','entrance') are themed by the site type: caves/mountains
// render dark/grey rock; ruins render grey masonry + flagstone; forests render tree
// thickets over leafy clearings; hills render rocky outcrops over grassy slopes. Walls
// don't autotile into towers like town walls — instead floor tiles get ambient-occlusion
// shadows where they meet a wall, which reads as carved/sheltered space. Pure functions of
// (type, neighbour-mask, coord), so memoised.

// --- palettes ----------------------------------------------------------------
const THEMES = {
  cave: {
    wall: '#34323a', wallDark: '#242229', wallLight: '#474450',
    floor: '#5b554f', floorDark: '#4a443f', floorLight: '#6c655d',
    rubble: '#6f6760', accent: '#7fd0e0', // crystal/water glow
  },
  ruins: {
    wall: '#7e776b', wallDark: '#615b51', wallLight: '#988f81',
    floor: '#9a9082', floorDark: '#827a6d', floorLight: '#ada393',
    rubble: '#8a8275', accent: '#7faa5a', // overgrowth green
  },
  // forest: tree thickets (wall) over shaded leafy clearings (floor); woodland palette.
  forest: {
    wall: '#2f5a34', wallDark: '#1f3d23', wallLight: '#43764a',
    floor: '#6e8a4a', floorDark: '#566f3a', floorLight: '#88a35f',
    rubble: '#7c6a48', accent: '#c9d66b', // leaf litter / dappled light
  },
  // hills: rocky outcrops (wall) over rolling grassy slopes (floor).
  hills: {
    wall: '#8a8174', wallDark: '#6c6458', wallLight: '#a39a8b',
    floor: '#7fa055', floorDark: '#658043', floorLight: '#9bbb6f',
    rubble: '#9a8f7d', accent: '#b7c98a', // scree / grass
  },
  // mountain: enclosed rocky passes carved from grey stone (cave-like but lighter).
  mountain: {
    wall: '#6e6a66', wallDark: '#514e4b', wallLight: '#8b8782',
    floor: '#8a857e', floorDark: '#736e67', floorLight: '#9d978f',
    rubble: '#7e7972', accent: '#bcd6e6', // crystal / snow glow
  },
};
const themeOf = (t) => THEMES[t] || THEMES.cave;

// Open-air sites (a structure placed on biome ground) draw a worn dirt path as their exit
// and never an archway; enclosed sites (carved from rock) draw a lit archway.
const isOpenAir = (theme) => theme === 'ruins' || theme === 'forest' || theme === 'hills';

// --- helpers (shared conventions with townTileArt) ---------------------------
const wrap = (inner) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' preserveAspectRatio='none'>${inner}</svg>`
  )}")`;
const rng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const variantSeed = (x = 0, y = 0) => (((x * 73856093) ^ (y * 19349663)) >>> 0);

// --- tiles -------------------------------------------------------------------
// Solid rock / masonry. `mask` = which orthogonal neighbours are FLOOR (N1 E2 S4 W8); a
// lit lip is drawn on each floor-facing side so the rock edge catches light.
const wall = (theme, mask) => {
  const c = themeOf(theme);
  let marks = `<rect width='32' height='32' fill='${c.wall}'/>`;
  // a couple of static blocks/cracks/clusters for texture (theme-keyed, no seed -> small cache)
  if (theme === 'ruins') {
    marks += `<path d='M0 11 H32 M0 22 H32 M11 0 V11 M22 11 V22 M16 22 V32' stroke='${c.wallDark}' stroke-width='1' opacity='0.6'/>`;
  } else if (theme === 'forest') {
    // overlapping canopy blobs read as a dense thicket of trees
    marks += `<circle cx='9' cy='10' r='8' fill='${c.wallDark}' opacity='0.55'/>`;
    marks += `<circle cx='23' cy='13' r='9' fill='${c.wallLight}' opacity='0.45'/>`;
    marks += `<circle cx='15' cy='24' r='8' fill='${c.wallDark}' opacity='0.5'/>`;
    marks += `<circle cx='26' cy='26' r='6' fill='${c.wallLight}' opacity='0.4'/>`;
  } else if (theme === 'hills') {
    // rounded rocky outcrop lumps
    marks += `<path d='M2 30 q6 -16 14 -3 q4 -10 14 -1 V32 H2 Z' fill='${c.wallDark}' opacity='0.5'/>`;
    marks += `<path d='M4 12 q5 -8 11 -1 M19 9 q5 -6 10 1' stroke='${c.wallLight}' stroke-width='1.4' fill='none' opacity='0.5'/>`;
  } else {
    // cave + mountain: angular cracks in rock
    marks += `<path d='M6 5 l4 6 l-3 5 M24 7 l-4 7 M20 24 l5 4 M9 22 l3 6' stroke='${c.wallDark}' stroke-width='1.2' fill='none' opacity='0.55'/>`;
  }
  const lip = (d) => `<rect ${d} fill='${c.wallLight}' opacity='0.8'/>`;
  if (mask & 1) marks += lip("x='0' y='0' width='32' height='2.6'");      // N floor
  if (mask & 4) marks += lip("x='0' y='29.4' width='32' height='2.6'");   // S floor
  if (mask & 8) marks += lip("x='0' y='0' width='2.6' height='32'");      // W floor
  if (mask & 2) marks += lip("x='29.4' y='0' width='2.6' height='32'");   // E floor
  return wrap(marks);
};

// Walkable ground. `mask` = which orthogonal neighbours are WALL (N1 E2 S4 W8) -> ambient
// occlusion shadow on those sides, so carved floor reads with depth.
const floor = (theme, seed, mask, rough) => {
  const c = themeOf(theme);
  const r = rng(seed + 17);
  let marks = `<rect width='32' height='32' fill='${rough ? c.rubble : c.floor}'/>`;
  const dots = rough ? 10 : 6;
  for (let i = 0; i < dots; i++) {
    const x = (r() * 30 + 1).toFixed(1);
    const y = (r() * 30 + 1).toFixed(1);
    const col = r() > 0.5 ? c.floorDark : c.floorLight;
    marks += `<circle cx='${x}' cy='${y}' r='${(r() * (rough ? 1.6 : 1.0) + 0.4).toFixed(1)}' fill='${col}'/>`;
  }
  const ao = (d) => `<rect ${d} fill='${c.wallDark}' opacity='0.45'/>`;
  if (mask & 1) marks += ao("x='0' y='0' width='32' height='4'");
  if (mask & 4) marks += ao("x='0' y='28' width='32' height='4'");
  if (mask & 8) marks += ao("x='0' y='0' width='4' height='32'");
  if (mask & 2) marks += ao("x='28' y='0' width='4' height='32'");
  return wrap(marks);
};

// Open-air ground for ruins sitting in the landscape: grass field / desert sand / snow.
const GROUND = {
  grass: { base: '#6aa84f', d: '#4c8038', l: '#86c267' },
  sand: { base: '#dccfac', d: '#c6b78d', l: '#ece1c2' },
  snow: { base: '#eef3f7', d: '#d2dde6', l: '#ffffff' },
};
const ground = (kind, seed, mask) => {
  const g = GROUND[kind] || GROUND.grass;
  const r = rng(seed + 23);
  let marks = `<rect width='32' height='32' fill='${g.base}'/>`;
  for (let i = 0; i < 7; i++) {
    const x = Math.floor(r() * 28) + 2;
    const y = Math.floor(r() * 26) + 4;
    const col = r() > 0.5 ? g.d : g.l;
    marks += `<path d='M${x} ${y} q1.2 -3 2.4 0' stroke='${col}' stroke-width='1.1' fill='none' stroke-linecap='round'/>`;
  }
  // ambient occlusion where open ground meets a ruined wall (the building casts a shadow)
  const ao = (d) => `<rect ${d} fill='#000' opacity='0.18'/>`;
  if (mask & 1) marks += ao("x='0' y='0' width='32' height='4'");
  if (mask & 4) marks += ao("x='0' y='28' width='32' height='4'");
  if (mask & 8) marks += ao("x='0' y='0' width='4' height='32'");
  if (mask & 2) marks += ao("x='28' y='0' width='4' height='32'");
  return wrap(marks);
};

// The way back out to the world. Enclosed sites (cave / mountain): a lit archway carved in
// rock. Open-air sites (ruins / forest / hills): a worn dirt path leaving the map (it sits
// on open ground, not in a wall).
const entrance = (theme) => {
  if (isOpenAir(theme)) {
    return wrap(
      `<rect width='32' height='32' fill='#b07b46'/>` +
      `<rect width='32' height='32' fill='#8f5f31' opacity='0.25'/>` +
      `<circle cx='9' cy='10' r='1.4' fill='#8f5f31'/><circle cx='22' cy='20' r='1.6' fill='#8f5f31'/><circle cx='15' cy='25' r='1.2' fill='#c89a64'/>` +
      `<path d='M16 30 v-9 M16 21 l-4 4 M16 21 l4 4' stroke='#3a2a17' stroke-width='1.6' fill='none' opacity='0.7'/>`
    );
  }
  const c = themeOf(theme);
  return wrap(
    `<rect width='32' height='32' fill='${c.floor}'/>` +
    `<rect x='8' y='6' width='16' height='22' rx='7' fill='${c.wallDark}'/>` +
    `<rect x='10' y='9' width='12' height='19' rx='5' fill='#1b1a1f'/>` +
    `<rect x='9' y='26' width='14' height='3' fill='${c.floorLight}'/>` +
    `<path d='M16 28 v-9' stroke='${c.accent}' stroke-width='1.4' opacity='0.7'/>`
  );
};

// --- decoration / marker overlays --------------------------------------------
// Single source of truth for a site's scattered decorations: key (the tile.poi value the
// generator emits) + emoji (how it renders) + label (how the legend names it). The
// generator and the map legend both read THIS, so they can never drift. Note 'rubble' is
// a tile TYPE (rough floor), not a decoration, so it isn't here. Decorations are currently
// cosmetic atmosphere only — see WILDERNESS_SITES_PLAN.md Phase 3 for making some of them
// functional (harvestable resource nodes).
export const SITE_DECORATIONS = {
  cave: [
    { key: 'boulder', emoji: '🪨', label: 'Boulder' },
    { key: 'crystal', emoji: '💎', label: 'Crystals' },
    { key: 'mushroom', emoji: '🍄', label: 'Mushrooms' },
    { key: 'pool', emoji: '💧', label: 'Pool' },
  ],
  ruins: [
    { key: 'column', emoji: '🏛️', label: 'Column' },
    { key: 'statue', emoji: '🗿', label: 'Statue' },
    { key: 'overgrowth', emoji: '🌿', label: 'Overgrowth' },
  ],
  forest: [
    { key: 'tree', emoji: '🌲', label: 'Tree' },
    { key: 'bush', emoji: '🌳', label: 'Bush' },
    { key: 'flowers', emoji: '🌼', label: 'Flowers' },
    { key: 'mushroom', emoji: '🍄', label: 'Mushrooms' },
  ],
  hills: [
    { key: 'boulder', emoji: '🪨', label: 'Boulder' },
    { key: 'bush', emoji: '🌳', label: 'Bush' },
    { key: 'flowers', emoji: '🌼', label: 'Flowers' },
  ],
  mountain: [
    { key: 'boulder', emoji: '🪨', label: 'Boulder' },
    { key: 'crystal', emoji: '💎', label: 'Crystals' },
    { key: 'snow', emoji: '❄️', label: 'Snow' },
  ],
};

// Flat key->emoji map for the renderer (SiteMapTest / future SiteMapDisplay).
export const SITE_POI = Object.fromEntries(
  Object.values(SITE_DECORATIONS).flat().map((d) => [d.key, d.emoji])
);

const _cache = new Map();

/**
 * CSS background-image for a site tile. `neighbours` = { n,e,s,w } of neighbour tile
 * types. `theme` = 'cave' | 'ruins' | 'forest' | 'hills' | 'mountain' (unknown themes fall
 * back to the cave palette). Tolerant of unknown tile types (falls back to floor).
 */
export function tileBackground(tile, neighbours = {}, x = 0, y = 0, theme = 'cave') {
  const type = tile.type;
  const isWall = (t) => t === 'wall';
  const isFloorish = (t) => t === 'floor' || t === 'rubble' || t === 'entrance';
  // wall-adjacency mask, shared by floor/ground (AO) and inverted for walls.
  const wallMask = (isWall(neighbours.n) ? 1 : 0) | (isWall(neighbours.e) ? 2 : 0) |
                   (isWall(neighbours.s) ? 4 : 0) | (isWall(neighbours.w) ? 8 : 0);
  let key;
  let mask = wallMask;
  if (type === 'wall') {
    // mask = floor-facing sides (where the rock edge catches light)
    mask = (isFloorish(neighbours.n) ? 1 : 0) | (isFloorish(neighbours.e) ? 2 : 0) |
           (isFloorish(neighbours.s) ? 4 : 0) | (isFloorish(neighbours.w) ? 8 : 0);
    key = `wall|${mask}|${theme}`;
  } else if (type === 'entrance') {
    key = `entrance|${theme}`;
  } else if (type === 'ground') {
    const gk = tile.ground || 'grass';
    key = `ground|${gk}|${mask}|${variantSeed(x, y)}`;
  } else {
    // floor / rubble / unknown -> carved ground with wall-adjacency AO
    key = `${type === 'rubble' ? 'rubble' : 'floor'}|${mask}|${theme}|${variantSeed(x, y)}`;
  }
  let bg = _cache.get(key);
  if (bg === undefined) {
    if (type === 'wall') bg = wall(theme, mask);
    else if (type === 'entrance') bg = entrance(theme);
    else if (type === 'ground') bg = ground(tile.ground || 'grass', variantSeed(x, y), mask);
    else bg = floor(theme, variantSeed(x, y), mask, type === 'rubble');
    _cache.set(key, bg);
  }
  return bg;
}

// gallery accessors
export const sampleSiteTiles = {
  cave_wall: () => wall('cave', 6),
  cave_floor: () => floor('cave', variantSeed(1, 1), 0, false),
  cave_rubble: () => floor('cave', variantSeed(2, 1), 0, true),
  cave_entrance: () => entrance('cave'),
  ruins_wall: () => wall('ruins', 6),
  ruins_floor: () => floor('ruins', variantSeed(3, 1), 0, false),
  ruins_rubble: () => floor('ruins', variantSeed(4, 1), 0, true),
  ruins_entrance: () => entrance('ruins'),
  forest_wall: () => wall('forest', 6),
  forest_floor: () => floor('forest', variantSeed(6, 1), 0, false),
  forest_rubble: () => floor('forest', variantSeed(7, 1), 0, true),
  forest_entrance: () => entrance('forest'),
  hills_wall: () => wall('hills', 6),
  hills_floor: () => floor('hills', variantSeed(8, 1), 0, false),
  hills_rubble: () => floor('hills', variantSeed(9, 1), 0, true),
  hills_entrance: () => entrance('hills'),
  mountain_wall: () => wall('mountain', 6),
  mountain_floor: () => floor('mountain', variantSeed(10, 1), 0, false),
  mountain_rubble: () => floor('mountain', variantSeed(11, 1), 0, true),
  mountain_entrance: () => entrance('mountain'),
  ground_grass: () => ground('grass', variantSeed(5, 1), 0),
  ground_sand: () => ground('sand', variantSeed(5, 2), 0),
  ground_snow: () => ground('snow', variantSeed(5, 3), 0),
};

export default tileBackground;
