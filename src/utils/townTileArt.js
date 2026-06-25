// townTileArt.js
// Programmatically-generated, seamless top-down tiles as inline SVG data-URIs — a
// "simple art" starter set inspired by painterly colony-sim maps. No raster assets,
// no external service: every tile is geometry we control, so edges line up by
// construction and the whole set shares one visual language. Returned as ready-to-use
// CSS `url("data:image/svg+xml,...")` strings for `style={{ backgroundImage }}`.
//
// Walls/keep autotile from a 4-bit neighbour mask (N=1, E=2, S=4, W=8); corners and
// endpoints grow a tower. Terrain picks a deterministic variant from tile coords so
// the field looks varied but is identical on reload.

// --- palette -----------------------------------------------------------------
const C = {
  grass: '#6aa84f', grassDark: '#4c8038', grassLight: '#86c267',
  dirt: '#b07b46', dirtDark: '#8f5f31', dirtLight: '#c89a64',
  water: '#3f7cc2', waterLight: '#5a93d6', foam: '#bcd8f5',
  soil: '#6f4a2a', soilDark: '#553820', crop: '#7fb04a', cropDark: '#5f8a34',
  stone: '#c2bba9', stoneDark: '#aaa292', mortar: '#8f8775',
  plank: '#8a5a32', plankGap: '#5d3a1c',
  wall: '#8f8f8f', wallLight: '#b0b0b0', wallDark: '#6c6c6c', wallMortar: '#585858',
  keep: '#76706a', keepLight: '#938c84', keepDark: '#564f49',
};

// roof colours keyed loosely by building purpose
const ROOFS = {
  house: '#9c4a3c', inn: '#b5762d', tavern: '#b5762d', shop: '#3f7d6e',
  market: '#3f7d6e', temple: '#c9b04a', guild: '#5a6fae', bank: '#c9b04a',
  barracks: '#6b6f76', manor: '#6b6f76', keep: '#6b6f76', blacksmith: '#5a5550',
  foundry: '#5a5550', barn: '#8a5a32', warehouse: '#8a5a32',
  archives: '#5a6fae', library: '#5a6fae', alchemist: '#3f7d6e',
};

// --- helpers -----------------------------------------------------------------
const wrap = (inner) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' preserveAspectRatio='none'>${inner}</svg>`
  )}")`;

// tiny deterministic PRNG (mulberry32) so decoration is varied but reproducible
const rng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const variantSeed = (x = 0, y = 0) => (((x * 73856093) ^ (y * 19349663)) >>> 0);

// --- terrain -----------------------------------------------------------------
const grass = (seed) => {
  const r = rng(seed + 1);
  let marks = '';
  for (let i = 0; i < 7; i++) {
    const x = Math.floor(r() * 28) + 2;
    const y = Math.floor(r() * 26) + 4;
    const c = r() > 0.5 ? C.grassDark : C.grassLight;
    marks += `<path d='M${x} ${y} q1.2 -3 2.4 0' stroke='${c}' stroke-width='1.1' fill='none' stroke-linecap='round'/>`;
  }
  return wrap(`<rect width='32' height='32' fill='${C.grass}'/>${marks}`);
};

const dirt = (seed) => {
  const r = rng(seed + 2);
  let marks = '';
  for (let i = 0; i < 9; i++) {
    const x = (r() * 30 + 1).toFixed(1);
    const y = (r() * 30 + 1).toFixed(1);
    const c = r() > 0.5 ? C.dirtDark : C.dirtLight;
    marks += `<circle cx='${x}' cy='${y}' r='${(r() * 1.1 + 0.5).toFixed(1)}' fill='${c}'/>`;
  }
  return wrap(`<rect width='32' height='32' fill='${C.dirt}'/>${marks}`);
};

const water = (seed) => {
  const r = rng(seed + 3);
  let waves = '';
  for (let i = 0; i < 3; i++) {
    const y = 7 + i * 9 + Math.floor(r() * 3);
    waves += `<path d='M0 ${y} q8 -3 16 0 t16 0' stroke='${C.waterLight}' stroke-width='1.4' fill='none' opacity='0.8'/>`;
  }
  return wrap(`<rect width='32' height='32' fill='${C.water}'/>${waves}<path d='M0 4 q8 -3 16 0 t16 0' stroke='${C.foam}' stroke-width='1' fill='none' opacity='0.5'/>`);
};

const field = (seed) => {
  const r = rng(seed + 4);
  let rows = '';
  for (let i = 0; i < 6; i++) {
    const y = 3 + i * 5;
    rows += `<rect x='0' y='${y}' width='32' height='2.4' fill='${C.soilDark}'/>`;
    // crop dashes along the furrow
    for (let x = 2; x < 30; x += 6) {
      const c = r() > 0.3 ? C.crop : C.cropDark;
      rows += `<rect x='${(x + r() * 1.5).toFixed(1)}' y='${(y - 1.4).toFixed(1)}' width='2.4' height='2.4' rx='1' fill='${c}'/>`;
    }
  }
  return wrap(`<rect width='32' height='32' fill='${C.soil}'/>${rows}`);
};

const stone = (seed, light) => {
  const r = rng(seed + 5);
  const base = light ? C.stone : C.stoneDark;
  let cobbles = '';
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      const x = gx * 8 + 0.8 + r() * 0.8;
      const y = gy * 8 + 0.8 + r() * 0.8;
      const c = r() > 0.5 ? C.stone : C.stoneDark;
      cobbles += `<rect x='${x.toFixed(1)}' y='${y.toFixed(1)}' width='6.4' height='6.4' rx='1.6' fill='${c}'/>`;
    }
  }
  return wrap(`<rect width='32' height='32' fill='${C.mortar}'/><rect width='32' height='32' fill='${base}' opacity='0.25'/>${cobbles}`);
};

const bridge = () => {
  let planks = '';
  for (let i = 0; i < 5; i++) {
    const y = i * 6.4;
    planks += `<rect x='0' y='${y}' width='32' height='6' fill='${C.plank}'/><rect x='0' y='${y + 6}' width='32' height='0.8' fill='${C.plankGap}'/>`;
  }
  return wrap(`${planks}<rect x='1' y='0' width='1.6' height='32' fill='${C.plankGap}' opacity='0.7'/><rect x='29.4' y='0' width='1.6' height='32' fill='${C.plankGap}' opacity='0.7'/>`);
};

// --- walls (autotiled) -------------------------------------------------------
// mask bits: N=1, E=2, S=4, W=8
const wall = (mask, keep) => {
  const col = keep ? { m: C.keep, l: C.keepLight, d: C.keepDark } : { m: C.wall, l: C.wallLight, d: C.wallDark };
  const half = 16;
  const t = keep ? 9 : 11; // arm thickness
  const o = half - t / 2;
  const arm = (x, y, w, h) =>
    `<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='${col.m}'/>` +
    `<rect x='${x}' y='${y}' width='${w}' height='1.6' fill='${col.l}' opacity='0.7'/>` +
    `<rect x='${x}' y='${y + h - 1.6}' width='${w}' height='1.6' fill='${col.d}' opacity='0.7'/>`;
  let body = '';
  if (mask & 1) body += arm(o, 0, t, half + 1);          // N
  if (mask & 4) body += arm(o, half - 1, t, half + 1);   // S
  if (mask & 8) body += arm(0, o, half + 1, t);          // W
  if (mask & 2) body += arm(half - 1, o, half + 1, t);   // E
  // centre block
  body += `<rect x='${o}' y='${o}' width='${t}' height='${t}' rx='1.5' fill='${col.m}'/>`;
  body += `<rect x='${o}' y='${o}' width='${t}' height='1.8' rx='1' fill='${col.l}' opacity='0.6'/>`;

  // tower on corners (two perpendicular arms) or endpoints (single arm)
  const count = (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + ((mask >> 3) & 1);
  const ns = (mask & 1) || (mask & 4);
  const ew = (mask & 2) || (mask & 8);
  const isCorner = count === 2 && ns && ew;
  if (count <= 1 || isCorner) {
    const r = keep ? 7.5 : 8.5;
    body += `<circle cx='16' cy='16' r='${r}' fill='${col.d}'/>`;
    body += `<circle cx='16' cy='16' r='${r - 1.6}' fill='${col.m}'/>`;
    body += `<circle cx='13.5' cy='13.5' r='${r - 5}' fill='${col.l}' opacity='0.6'/>`;
  }
  // grass shows through where there's no arm
  return wrap(`<rect width='32' height='32' fill='${C.grass}'/>${body}`);
};

// --- buildings ---------------------------------------------------------------
// Shade a hex colour by a factor (clamped); >1 lightens, <1 darkens.
const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
};
const door = (roof, x = 14, w = 4) => `<rect x='${x}' y='20' width='${w}' height='6' rx='0.5' fill='${shade(roof, 0.42)}'/>`;
const hi = "<rect x='8' y='12' width='16' height='2.4' fill='#ffffff' opacity='0.14'/>";

// Each shape returns the building body (drawn over a shared grass + shadow base).
const SHAPES = {
  // pitched-roof cottage with a chimney
  gable: (r) =>
    `<rect x='9' y='13' width='14' height='13' rx='1' fill='${shade(r, 0.8)}'/>` +
    `<polygon points='7,14 16,6 25,14' fill='${r}'/>` +
    `<polygon points='16,6 25,14 16,14' fill='${shade(r, 0.85)}'/>` +
    `<rect x='19' y='7' width='2.6' height='6' fill='${shade(r, 0.6)}'/>` +
    door(r, 14.5, 3),
  // long hall (inn/tavern) with ridge + chimney
  hall: (r) =>
    `<rect x='5' y='10' width='22' height='16' rx='1.5' fill='${r}'/>${hi}` +
    `<rect x='5' y='17' width='22' height='2' fill='${shade(r, 0.7)}'/>` +
    `<rect x='5' y='23' width='22' height='3' fill='${shade(r, 0.6)}'/>` +
    `<rect x='22' y='5' width='3' height='6' fill='${shade(r, 0.55)}'/>` +
    door(r, 13, 5),
  // wide barn with big cross-planked doors
  barn: (r) =>
    `<rect x='4' y='11' width='24' height='15' rx='1.5' fill='${r}'/>` +
    `<rect x='4' y='11' width='24' height='4' fill='${shade(r, 1.12)}'/>` +
    `<rect x='10' y='17' width='12' height='9' fill='${shade(r, 0.5)}'/>` +
    `<path d='M10 17 L22 26 M22 17 L10 26' stroke='${shade(r, 1.25)}' stroke-width='1'/>`,
  // smithy: tall smoking chimney
  smithy: (r) =>
    `<rect x='7' y='12' width='15' height='14' rx='1' fill='${r}'/>${hi}` +
    `<rect x='22' y='5' width='4' height='11' fill='${shade(r, 0.5)}'/>` +
    `<circle cx='24' cy='4' r='2.2' fill='#9a9a9a' opacity='0.7'/>` +
    `<circle cx='26.5' cy='1.5' r='1.6' fill='#aaaaaa' opacity='0.6'/>` +
    door(r, 11, 5),
  // temple: peaked roof topped with a cross
  temple: (r) =>
    `<rect x='9' y='13' width='14' height='13' rx='1' fill='${shade(r, 0.82)}'/>` +
    `<polygon points='6,14 16,6 26,14' fill='${r}'/>` +
    `<rect x='15.2' y='1' width='1.6' height='6' fill='${shade(r, 0.7)}'/>` +
    `<rect x='13' y='2.6' width='6' height='1.6' fill='${shade(r, 0.7)}'/>` +
    `<rect x='14.5' y='19' width='3' height='7' fill='${shade(r, 0.5)}'/>`,
  // bank: columned classical facade with pediment
  bank: (r) =>
    `<rect x='7' y='13' width='18' height='13' fill='${shade(r, 1.08)}'/>` +
    `<polygon points='6,13 16,6 26,13' fill='${r}'/>` +
    `<rect x='9' y='15' width='2' height='9' fill='${shade(r, 0.68)}'/>` +
    `<rect x='13' y='15' width='2' height='9' fill='${shade(r, 0.68)}'/>` +
    `<rect x='17' y='15' width='2' height='9' fill='${shade(r, 0.68)}'/>` +
    `<rect x='21' y='15' width='2' height='9' fill='${shade(r, 0.68)}'/>`,
  // fortified keep: crenellated top + corner tower
  keep: (r) =>
    `<rect x='8' y='10' width='3' height='3' fill='${r}'/>` +
    `<rect x='14.5' y='10' width='3' height='3' fill='${r}'/>` +
    `<rect x='21' y='10' width='3' height='3' fill='${r}'/>` +
    `<rect x='8' y='12' width='16' height='14' rx='1' fill='${r}'/>${hi}` +
    `<circle cx='23' cy='25' r='3.6' fill='${shade(r, 0.85)}'/>` +
    door(r, 14, 4),
  // alchemist: domed roof with a finial
  dome: (r) =>
    `<rect x='10' y='16' width='12' height='10' rx='1' fill='${shade(r, 0.82)}'/>` +
    `<path d='M9 17 a7 7 0 0 1 14 0 z' fill='${r}'/>` +
    `<rect x='15.4' y='6' width='1.5' height='4' fill='${shade(r, 0.7)}'/>` +
    `<circle cx='16.15' cy='6' r='1.4' fill='${shade(r, 0.7)}'/>`,
  // market/shop: striped awning over an open stall
  stall: (r) => {
    let aw = '';
    for (let i = 0; i < 6; i++) aw += `<rect x='${7 + i * 3}' y='9' width='3' height='6' fill='${i % 2 ? '#f2ead6' : r}'/>`;
    return `<rect x='7' y='15' width='18' height='11' rx='0.5' fill='${shade(r, 0.62)}'/>${aw}<rect x='7' y='15' width='18' height='1.6' fill='${shade(r, 0.45)}'/>`;
  },
  // guild/library: square hall flying a banner
  banner: (r) =>
    `<rect x='8' y='12' width='16' height='14' rx='1' fill='${r}'/>${hi}` +
    `<rect x='8' y='17.5' width='16' height='1.8' fill='${shade(r, 0.7)}'/>` +
    `<rect x='15.4' y='4' width='1.4' height='9' fill='${shade(r, 0.55)}'/>` +
    `<polygon points='16.8,4 23,5.6 16.8,8.4' fill='${shade(r, 1.15)}'/>` +
    door(r, 14, 4),
};

const BUILDING_SHAPE = {
  house: 'gable',
  inn: 'hall', tavern: 'hall',
  barn: 'barn', warehouse: 'barn',
  blacksmith: 'smithy', foundry: 'smithy',
  temple: 'temple',
  bank: 'bank',
  manor: 'keep', keep: 'keep', barracks: 'keep',
  alchemist: 'dome',
  shop: 'stall', market: 'stall',
  guild: 'banner', archives: 'banner', library: 'banner',
};

const building = (buildingType) => {
  const roof = ROOFS[buildingType] || ROOFS.house;
  const shape = SHAPES[BUILDING_SHAPE[buildingType] || 'gable'];
  return wrap(
    `<rect width='32' height='32' fill='${C.grass}'/>` +
    `<ellipse cx='16' cy='27' rx='12' ry='3' fill='#000000' opacity='0.16'/>` + // ground shadow
    shape(roof)
  );
};

// --- public API --------------------------------------------------------------
// Returns a CSS background-image string for a tile. `neighbours` is { n,e,s,w } of
// tile types, used for wall autotiling.
export function tileBackground(tile, neighbours = {}, x = 0, y = 0) {
  const seed = variantSeed(x, y);
  switch (tile.type) {
    case 'water': return water(seed);
    case 'bridge': return bridge();
    case 'farm_field': return field(seed);
    case 'town_square': return stone(seed, true);
    case 'stone_path': return stone(seed, true);
    case 'dirt_path': return dirt(seed);
    case 'building': return building(tile.buildingType);
    case 'wall':
    case 'keep_wall': {
      const keep = tile.type === 'keep_wall';
      const isW = (t) => t === tile.type;
      const mask = (isW(neighbours.n) ? 1 : 0) | (isW(neighbours.e) ? 2 : 0) | (isW(neighbours.s) ? 4 : 0) | (isW(neighbours.w) ? 8 : 0);
      return wall(mask, keep);
    }
    case 'grass':
    default: return grass(seed);
  }
}

// Direct accessors for the swatch gallery / docs.
export const sampleTiles = {
  grass: () => grass(variantSeed(1, 1)),
  dirt: () => dirt(variantSeed(2, 1)),
  water: () => water(variantSeed(3, 1)),
  farm_field: () => field(variantSeed(4, 1)),
  town_square: () => stone(variantSeed(5, 1), true),
  bridge: () => bridge(),
};
export const wallVariant = (mask, keep = false) => wall(mask, keep);
export const buildingTile = (buildingType) => building(buildingType);
export { hash };
