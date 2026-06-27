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
  // desert town ground — sandy palette (kept loosely in sync with worldTileArt's desert)
  sand: '#e0c178', sandDark: '#cda85f', sandLight: '#efd9a0',
  // snow town ground — pale palette (kept loosely in sync with worldTileArt's snow)
  snow: '#eef3f7', snowDark: '#d2dde6', snowLight: '#ffffff',
  dirt: '#b07b46', dirtDark: '#8f5f31', dirtLight: '#c89a64',
  water: '#3f7cc2', waterLight: '#5a93d6', foam: '#bcd8f5',
  soil: '#6f4a2a', soilDark: '#553820', crop: '#7fb04a', cropDark: '#5f8a34',
  stone: '#c2bba9', stoneDark: '#aaa292', mortar: '#8f8775',
  plank: '#8a5a32', plankGap: '#5d3a1c',
  wall: '#8f8f8f', wallLight: '#b0b0b0', wallDark: '#6c6c6c', wallMortar: '#585858',
  keep: '#76706a', keepLight: '#938c84', keepDark: '#564f49',
};

// roof colours keyed loosely by building purpose — kept distinct for readability
const ROOFS = {
  house: '#9c4a3c',      // brick red
  manor: '#8a5273',      // noble plum
  keep: '#6b6f76',       // slate (tall tower)
  barracks: '#566069',   // darker military slate
  inn: '#b5762d', tavern: '#a05a36',  // amber / brown
  shop: '#3f7d6e',       // teal
  market: '#cf8a3a',     // market orange
  temple: '#c9b04a',     // temple gold
  bank: '#bdb39a',       // pale stone
  guild: '#5a6fae', archives: '#4f63a0', library: '#4f63a0', // blues
  blacksmith: '#5a5550', foundry: '#4f4a45',                 // dark forge
  barn: '#8a5a32', warehouse: '#7a5230',                     // timber browns
  alchemist: '#7a5a9c',  // arcane purple
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

// desert town ground: a sandy base with scattered grains and the odd ripple, mirroring
// the grass tile's role for desert-themed towns (Phase 2b)
const sand = (seed) => {
  const r = rng(seed + 6);
  let marks = '';
  for (let i = 0; i < 9; i++) {
    const x = (r() * 30 + 1).toFixed(1);
    const y = (r() * 30 + 1).toFixed(1);
    const c = r() > 0.5 ? C.sandDark : C.sandLight;
    marks += `<circle cx='${x}' cy='${y}' r='${(r() * 1.0 + 0.4).toFixed(1)}' fill='${c}'/>`;
  }
  for (let i = 0; i < 2; i++) {
    const y = 9 + i * 12 + Math.floor(r() * 4);
    marks += `<path d='M0 ${y} q8 -2.5 16 0 t16 0' stroke='${C.sandDark}' stroke-width='1' fill='none' opacity='0.5'/>`;
  }
  return wrap(`<rect width='32' height='32' fill='${C.sand}'/>${marks}`);
};

// snow town ground: a pale base with soft drifts and a few sparkles, mirroring the grass
// tile's role for snow-themed towns (Phase 2c)
const snow = (seed) => {
  const r = rng(seed + 7);
  let marks = '';
  for (let i = 0; i < 2; i++) {
    const y = 10 + i * 12 + Math.floor(r() * 4);
    marks += `<path d='M0 ${y} q8 -2.5 16 0 t16 0' stroke='${C.snowDark}' stroke-width='1.2' fill='none' opacity='0.5'/>`;
  }
  for (let i = 0; i < 7; i++) {
    const x = (r() * 30 + 1).toFixed(1);
    const y = (r() * 30 + 1).toFixed(1);
    marks += `<circle cx='${x}' cy='${y}' r='${(r() * 0.8 + 0.4).toFixed(1)}' fill='${C.snowLight}'/>`;
  }
  return wrap(`<rect width='32' height='32' fill='${C.snow}'/>${marks}`);
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
const wall = (mask, keep, ground = C.grass) => {
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
  // ground (grass / desert sand) shows through where there's no arm
  return wrap(`<rect width='32' height='32' fill='${ground}'/>${body}`);
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
  // blacksmith: single tall smoking chimney + an anvil out front
  smithy: (r) =>
    `<rect x='7' y='12' width='15' height='14' rx='1' fill='${r}'/>${hi}` +
    `<rect x='22' y='5' width='4' height='11' fill='${shade(r, 0.5)}'/>` +
    `<circle cx='24' cy='4' r='2.2' fill='#9a9a9a' opacity='0.7'/>` +
    `<circle cx='26.5' cy='1.5' r='1.6' fill='#aaaaaa' opacity='0.6'/>` +
    door(r, 8, 4) +
    `<rect x='15' y='20' width='6' height='1.8' rx='0.4' fill='#37343a'/>` +
    `<rect x='17' y='21.8' width='2' height='2.4' fill='#37343a'/>`,
  // foundry: wide industrial hall, twin chimneys, more smoke, a molten furnace glow
  foundry: (r) =>
    `<rect x='5' y='13' width='22' height='14' rx='1' fill='${r}'/>` +
    `<rect x='5' y='13' width='22' height='2.2' fill='#ffffff' opacity='0.12'/>` +
    `<rect x='7' y='4' width='4' height='10' fill='${shade(r, 0.5)}'/>` +
    `<rect x='21' y='4' width='4' height='10' fill='${shade(r, 0.5)}'/>` +
    `<circle cx='9' cy='3' r='2.1' fill='#9a9a9a' opacity='0.7'/>` +
    `<circle cx='23' cy='3' r='2.1' fill='#9a9a9a' opacity='0.7'/>` +
    `<circle cx='11' cy='1' r='1.5' fill='#aaaaaa' opacity='0.55'/>` +
    `<rect x='13' y='20' width='6' height='6' rx='0.5' fill='#e8923a'/>` +
    `<rect x='14.5' y='22' width='3' height='4' fill='#ffd27a'/>`,
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
  // barracks: low, wide, crenellated military block
  fortified: (r) =>
    `<rect x='6' y='10' width='3' height='3' fill='${r}'/>` +
    `<rect x='11.5' y='10' width='3' height='3' fill='${r}'/>` +
    `<rect x='17.5' y='10' width='3' height='3' fill='${r}'/>` +
    `<rect x='23' y='10' width='3' height='3' fill='${r}'/>` +
    `<rect x='6' y='12' width='20' height='14' rx='1' fill='${r}'/>` +
    `<rect x='6' y='12' width='20' height='2.2' fill='#ffffff' opacity='0.12'/>` +
    `<rect x='6' y='18' width='20' height='1.6' fill='${shade(r, 0.7)}'/>` +
    `<rect x='10' y='20' width='3' height='6' fill='${shade(r, 0.45)}'/>` +
    `<rect x='19' y='20' width='3' height='6' fill='${shade(r, 0.45)}'/>`,
  // keep: a single tall crenellated tower (reads taller via side shadow + height)
  tower: (r) =>
    `<rect x='21' y='9' width='6' height='19' fill='#000000' opacity='0.13'/>` +
    `<rect x='10' y='5' width='2.6' height='3' fill='${r}'/>` +
    `<rect x='14.7' y='5' width='2.6' height='3' fill='${r}'/>` +
    `<rect x='19.4' y='5' width='2.6' height='3' fill='${r}'/>` +
    `<rect x='10' y='7' width='12' height='20' rx='1' fill='${r}'/>` +
    `<rect x='10' y='7' width='12' height='2.4' fill='#ffffff' opacity='0.16'/>` +
    `<rect x='20.6' y='7' width='1.4' height='20' fill='#000000' opacity='0.12'/>` +
    `<rect x='13' y='12' width='2.6' height='4' fill='${shade(r, 0.55)}'/>` +
    `<rect x='13' y='18' width='2.6' height='4' fill='${shade(r, 0.55)}'/>` +
    `<rect x='13.5' y='23' width='5' height='4' fill='${shade(r, 0.42)}'/>`,
  // manor: a grand, taller, house-like estate (big gable, twin chimneys, windows)
  manor: (r) =>
    `<rect x='13' y='25' width='13' height='3' fill='#000000' opacity='0.14'/>` +
    `<rect x='6' y='13' width='20' height='14' rx='1' fill='${shade(r, 0.82)}'/>` +
    `<polygon points='4,15 16,5 28,15' fill='${r}'/>` +
    `<polygon points='16,5 28,15 16,15' fill='${shade(r, 0.86)}'/>` +
    `<rect x='9' y='6' width='2.6' height='6' fill='${shade(r, 0.6)}'/>` +
    `<rect x='20.5' y='6' width='2.6' height='6' fill='${shade(r, 0.6)}'/>` +
    `<rect x='8' y='17' width='3' height='3' fill='${shade(r, 1.12)}'/>` +
    `<rect x='21' y='17' width='3' height='3' fill='${shade(r, 1.12)}'/>` +
    `<rect x='14' y='20' width='4' height='7' rx='0.5' fill='${shade(r, 0.45)}'/>`,
  // inn: two storeys — wider ground floor with a smaller floor stacked on top + sign
  inn: (r) =>
    `<rect x='5' y='13' width='22' height='14' rx='1.5' fill='${shade(r, 0.8)}'/>` +
    `<rect x='5' y='13' width='22' height='2.2' fill='#ffffff' opacity='0.12'/>` +
    `<rect x='7' y='18' width='3' height='3' fill='${shade(r, 1.1)}'/>` +
    `<rect x='22' y='18' width='3' height='3' fill='${shade(r, 1.1)}'/>` +
    door(r, 14, 4) +
    `<rect x='8' y='5' width='16' height='9' rx='1.5' fill='${r}'/>` +
    `<rect x='8' y='5' width='16' height='2' fill='#ffffff' opacity='0.16'/>` +
    `<rect x='10' y='8' width='3' height='3' fill='${shade(r, 1.1)}'/>` +
    `<rect x='19' y='8' width='3' height='3' fill='${shade(r, 1.1)}'/>` +
    `<rect x='22' y='2' width='2.6' height='4' fill='${shade(r, 0.55)}'/>` +
    `<rect x='3' y='17' width='4' height='3' rx='0.5' fill='${shade(r, 1.05)}'/>`,
  // alchemist: domed roof with a finial + a door
  dome: (r) =>
    `<rect x='10' y='16' width='12' height='10' rx='1' fill='${shade(r, 0.82)}'/>` +
    `<path d='M9 17 a7 7 0 0 1 14 0 z' fill='${r}'/>` +
    `<rect x='15.4' y='6' width='1.5' height='4' fill='${shade(r, 0.7)}'/>` +
    `<circle cx='16.15' cy='6' r='1.4' fill='${shade(r, 0.7)}'/>` +
    door(r, 14, 4),
  // market/shop: striped awning over a stall, with a doorway behind the counter
  stall: (r) => {
    let aw = '';
    for (let i = 0; i < 6; i++) aw += `<rect x='${7 + i * 3}' y='9' width='3' height='6' fill='${i % 2 ? '#f2ead6' : r}'/>`;
    return `<rect x='7' y='15' width='18' height='11' rx='0.5' fill='${shade(r, 0.62)}'/>${aw}` +
      `<rect x='7' y='15' width='18' height='1.6' fill='${shade(r, 0.45)}'/>` +
      door(r, 13.5, 5);
  },
  // guild/archives: square hall flying a banner
  banner: (r) =>
    `<rect x='8' y='12' width='16' height='14' rx='1' fill='${r}'/>${hi}` +
    `<rect x='8' y='17.5' width='16' height='1.8' fill='${shade(r, 0.7)}'/>` +
    `<rect x='15.4' y='4' width='1.4' height='9' fill='${shade(r, 0.55)}'/>` +
    `<polygon points='16.8,4 23,5.6 16.8,8.4' fill='${shade(r, 1.15)}'/>` +
    door(r, 14, 4),
  // library: scholarly hall with columns and an open-book emblem on the roof
  library: (r) =>
    `<rect x='7' y='12' width='18' height='15' rx='1' fill='${r}'/>` +
    `<rect x='7' y='12' width='18' height='2.2' fill='#ffffff' opacity='0.14'/>` +
    `<rect x='9' y='16' width='2' height='8' fill='${shade(r, 0.7)}'/>` +
    `<rect x='21' y='16' width='2' height='8' fill='${shade(r, 0.7)}'/>` +
    `<polygon points='12,9 16,7.2 16,11 12,11' fill='#f2ead6'/>` +
    `<polygon points='20,9 16,7.2 16,11 20,11' fill='#e0d6bd'/>` +
    `<rect x='15.6' y='7.2' width='0.8' height='3.8' fill='${shade(r, 0.5)}'/>` +
    door(r, 14, 4),
  // warehouse: flat-roofed storage with twin bay doors and a stacked crate
  warehouse: (r) =>
    `<rect x='4' y='12' width='24' height='15' rx='0.5' fill='${r}'/>` +
    `<rect x='4' y='12' width='24' height='3' fill='${shade(r, 1.12)}'/>` +
    `<rect x='4' y='17.5' width='24' height='1' fill='${shade(r, 0.7)}'/>` +
    `<rect x='8' y='19' width='6' height='8' fill='${shade(r, 0.45)}'/>` +
    `<rect x='18' y='19' width='6' height='8' fill='${shade(r, 0.45)}'/>` +
    `<rect x='14.5' y='21' width='3' height='3' fill='${shade(r, 0.78)}'/>` +
    `<rect x='14.5' y='23.5' width='3' height='3' fill='${shade(r, 0.68)}'/>`,
};

const BUILDING_SHAPE = {
  house: 'gable',
  inn: 'inn', tavern: 'hall',
  barn: 'barn', warehouse: 'warehouse',
  blacksmith: 'smithy', foundry: 'foundry',
  temple: 'temple',
  bank: 'bank',
  manor: 'manor', keep: 'tower', barracks: 'fortified',
  alchemist: 'dome',
  shop: 'stall', market: 'stall',
  guild: 'banner', archives: 'banner', library: 'library',
};

const building = (buildingType, ground = C.grass) => {
  const roof = ROOFS[buildingType] || ROOFS.house;
  const shape = SHAPES[BUILDING_SHAPE[buildingType] || 'gable'];
  return wrap(
    `<rect width='32' height='32' fill='${ground}'/>` +
    `<ellipse cx='16' cy='27' rx='12' ry='3' fill='#000000' opacity='0.16'/>` + // ground shadow
    shape(roof)
  );
};

// --- public API --------------------------------------------------------------
const _generate = (type, tile, mask, seed, theme) => {
  // ground fill + open-tile texture follow the theme (desert→sand, snow→snow, else grass)
  const ground = theme === 'desert' ? C.sand : theme === 'snow' ? C.snow : C.grass;
  const groundTile = (s) => theme === 'desert' ? sand(s) : theme === 'snow' ? snow(s) : grass(s);
  switch (type) {
    case 'water': return water(seed);
    case 'bridge': return bridge();
    case 'farm_field': return field(seed);
    case 'town_square': return stone(seed, true);
    case 'stone_path': return stone(seed, true);
    case 'dirt_path': return dirt(seed);
    case 'building': return building(tile.buildingType, ground);
    case 'wall': return wall(mask, false, ground);
    case 'keep_wall': return wall(mask, true, ground);
    case 'grass':
    default: return groundTile(seed);
  }
};

// data-URIs are pure functions of (type, wall-mask, buildingType, coord-variant), so
// we memoise — the live town re-renders on every move and would otherwise rebuild
// every tile's SVG each time. Bounded: ~32 wall variants + ~18 buildings + one entry
// per terrain coordinate.
const _cache = new Map();

// Returns a CSS background-image string for a tile. `neighbours` is { n,e,s,w } of
// tile types, used for wall autotiling. `theme` selects the town's ground palette
// (default 'grassland' renders exactly as before; 'desert' renders a sand base; 'snow'
// renders a pale snow base).
export function tileBackground(tile, neighbours = {}, x = 0, y = 0, theme = 'grassland') {
  const type = tile.type;
  // Theme tag in the cache key so each theme's tiles never collide. Grassland is the
  // default, so its keys/output are unchanged from before ('g').
  const tt = theme === 'desert' ? 'd' : theme === 'snow' ? 's' : 'g';
  let mask = 0;
  let key;
  if (type === 'wall' || type === 'keep_wall') {
    mask = (neighbours.n === type ? 1 : 0) | (neighbours.e === type ? 2 : 0) | (neighbours.s === type ? 4 : 0) | (neighbours.w === type ? 8 : 0);
    key = `${type}|${mask}|${tt}`;
  } else if (type === 'building') {
    key = `building|${tile.buildingType || 'house'}|${tt}`;
  } else {
    key = `${type}|${variantSeed(x, y)}|${tt}`;
  }
  let bg = _cache.get(key);
  if (bg === undefined) {
    bg = _generate(type, tile, mask, variantSeed(x, y), theme);
    _cache.set(key, bg);
  }
  return bg;
}

// POI / decoration overlay emoji. The SVG tileset fully renders terrain, walls and
// buildings; small decorations and markers ride on top as emoji (matching the existing
// decoration layer rather than baking them into the ground tile). Grassland
// (tree/bush/flowers) is unchanged; desert and snow add biome-appropriate cover so a
// sand/snow town reads correctly. 'well' is kept for old saves predating the fountain.
export const POI_EMOJI = {
  fountain: '⛲', well: '🪣',
  tree: '🌳', bush: '🌿', flowers: '🌸',      // grassland
  cactus: '🌵', rock: '🪨', dead_bush: '🥀',  // desert
  pine: '🌲', snowdrift: '⛄',                // snow (rock shared with desert)
};

// Direct accessors for the swatch gallery / docs.
export const sampleTiles = {
  grass: () => grass(variantSeed(1, 1)),
  sand: () => sand(variantSeed(1, 2)),
  snow: () => snow(variantSeed(1, 3)),
  dirt: () => dirt(variantSeed(2, 1)),
  water: () => water(variantSeed(3, 1)),
  farm_field: () => field(variantSeed(4, 1)),
  town_square: () => stone(variantSeed(5, 1), true),
  bridge: () => bridge(),
};
export const wallVariant = (mask, keep = false) => wall(mask, keep);
export const buildingTile = (buildingType) => building(buildingType);
export { hash };
