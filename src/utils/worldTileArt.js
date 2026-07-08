// worldTileArt.js
// Programmatic SVG tiles for the WORLD map, matching the town tileset's "simple art"
// style (src/utils/townTileArt.js) but at world scale. Two layers per tile:
//   biomeBackground(tile, x, y) -> the ground (plains / water / beach / lake)
//   poiSprite(tile)            -> an overlay motif (forest / mountain / cave / town / milestone)
// Both return ready-to-use CSS `url("data:image/svg+xml,...")` strings. POI sprites are
// drawn on a transparent canvas so the biome shows through around them.

const C = {
  plains: '#7fb86a', plainsDark: '#5f9a4c', plainsLight: '#9bcf82',
  water: '#3f7cc2', waterLight: '#5a93d6', foam: '#bcd8f5',
  sand: '#dccfac', sandDark: '#c5b78f',
  rock: '#8a8278', rockDark: '#6f685f', snow: '#f2f2f2',
  trunk: '#6b4a2b', leafLo: '#2f7d3f', leafHi: '#3a924c',
  desert: '#e0c178', desertDark: '#cda85f',
  swamp: '#5a6b4c', swampLite: '#74855c', reed: '#8a7a3a',
  snowShade: '#d7dee6',
};

// roof colours reused for town clusters (kept loosely in sync with townTileArt)
const ROOF = { red: '#9c4a3c', amber: '#b5762d', teal: '#3f7d6e', stone: '#bdb39a', slate: '#6b6f76' };

// --- helpers -----------------------------------------------------------------
const wrap = (inner) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40' preserveAspectRatio='none'>${inner}</svg>`
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
const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
};

// speckle texture so sandy areas aren't a flat fill
const sandNoise = (seed) => {
  const r = rng(seed + 9);
  let s = '';
  for (let i = 0; i < 16; i++) {
    const x = (r() * 40).toFixed(1), y = (r() * 40).toFixed(1);
    const c = r() > 0.5 ? C.sandDark : shade(C.sand, 1.08);
    s += `<circle cx='${x}' cy='${y}' r='${(r() * 0.9 + 0.4).toFixed(1)}' fill='${c}' opacity='0.7'/>`;
  }
  return s;
};

// --- biomes ------------------------------------------------------------------
const plains = (seed) => {
  const r = rng(seed + 1);
  let m = '';
  for (let i = 0; i < 8; i++) {
    const x = Math.floor(r() * 34) + 3;
    const y = Math.floor(r() * 32) + 5;
    const c = r() > 0.5 ? C.plainsDark : C.plainsLight;
    m += `<path d='M${x} ${y} q1.4 -3.4 2.8 0' stroke='${c}' stroke-width='1.2' fill='none' stroke-linecap='round'/>`;
  }
  // occasional scatter (flowers / a rock) so open plains feel less bare
  const dx = Math.floor(r() * 24) + 8, dy = Math.floor(r() * 24) + 8;
  if (r() > 0.6) {
    // a small cluster of detailed flowers: four petals around a golden centre
    const pc = ['#e8d24a', '#d96a8f', '#e6843a', '#b884d6', '#e8e8ee'][Math.floor(r() * 5)];
    const flower = (cx, cy) =>
      `<circle cx='${cx}' cy='${(cy - 1.7).toFixed(1)}' r='1.1' fill='${pc}'/>` +
      `<circle cx='${cx}' cy='${(cy + 1.7).toFixed(1)}' r='1.1' fill='${pc}'/>` +
      `<circle cx='${(cx - 1.7).toFixed(1)}' cy='${cy}' r='1.1' fill='${pc}'/>` +
      `<circle cx='${(cx + 1.7).toFixed(1)}' cy='${cy}' r='1.1' fill='${pc}'/>` +
      `<circle cx='${cx}' cy='${cy}' r='1' fill='#ffd23f'/>` +
      `<rect x='${(cx - 0.3).toFixed(1)}' y='${(cy + 1).toFixed(1)}' width='0.6' height='3' fill='${C.plainsDark}'/>`;
    m += flower(dx, dy) + flower(dx + 5, dy + 3);
  } else if (r() > 0.5) {
    m += `<ellipse cx='${dx}' cy='${dy}' rx='2.6' ry='1.7' fill='#9a9486'/><ellipse cx='${dx}' cy='${dy - 0.6}' rx='2.6' ry='1.2' fill='#aaa49a'/>`;
  }
  return wrap(`<rect width='40' height='40' fill='${C.plains}'/>${m}`);
};

const water = (seed) => {
  const r = rng(seed + 2);
  let w = '';
  for (let i = 0; i < 3; i++) {
    const y = 9 + i * 11 + Math.floor(r() * 3);
    w += `<path d='M0 ${y} q10 -3.5 20 0 t20 0' stroke='${C.waterLight}' stroke-width='1.6' fill='none' opacity='0.8'/>`;
  }
  return wrap(`<rect width='40' height='40' fill='${C.water}'/>${w}`);
};

const lake = (seed) => {
  const r = rng(seed + 7);
  // a pond: sandy shore base, rounded water body, ripples, a couple of lily pads
  const padX = 11 + Math.floor(r() * 6), padY = 12 + Math.floor(r() * 6);
  return wrap(
    `<rect width='40' height='40' fill='${C.sand}'/>${sandNoise(seed)}` +
    `<ellipse cx='20' cy='20' rx='19.5' ry='18' fill='${shade(C.sand, 0.92)}'/>` +
    `<ellipse cx='20' cy='20' rx='18.5' ry='17' fill='${C.water}'/>` +
    `<path d='M8 16 q7 -2.5 14 0' stroke='${C.waterLight}' stroke-width='1.4' fill='none' opacity='0.75'/>` +
    `<path d='M11 27 q7 -2.5 14 0' stroke='${C.waterLight}' stroke-width='1.4' fill='none' opacity='0.75'/>` +
    `<ellipse cx='${padX}' cy='${padY}' rx='2.3' ry='1.5' fill='${C.leafLo}' opacity='0.85'/>` +
    `<ellipse cx='${padX + 11}' cy='${padY + 9}' rx='2' ry='1.3' fill='${C.leafLo}' opacity='0.85'/>`
  );
};

// beachDirection: 0 = water North, 1 = East, 2 = South, 3 = West
// Straight edges use dir 0-3 (water N/E/S/W). Corner shores use 4-7 (water wraps two
// adjacent sides) and render a diagonal sand/water boundary so lake corners aren't a hard
// 90 degrees: 4 = water NE, 5 = SE, 6 = SW, 7 = NW.
// Chamfer through the edge MIDPOINTS (20) so corner tiles meet the half-water straight
// tiles exactly at the shared borders (no notches at the seams).
const BEACH_CORNERS = {
  // 4-7: concave corners (water on two adjacent sides) — water fills most of the tile
  4: { poly: '0,0 40,0 40,40 20,40 0,20', foam: 'M20 40 L0 20' }, // water NE, sand SW
  5: { poly: '20,0 40,0 40,40 0,40 0,20', foam: 'M20 0 L0 20' },  // water SE, sand NW
  6: { poly: '0,0 20,0 40,20 40,40 0,40', foam: 'M20 0 L40 20' }, // water SW, sand NE
  7: { poly: '0,0 40,0 40,20 20,40 0,40', foam: 'M40 20 L20 40' }, // water NW, sand SE
  // 8-11: convex outer corners (lake touches only this diagonal) — small water bite in the corner
  8: { poly: '40,0 20,0 40,20', foam: 'M20 0 L40 20' },   // water NE corner
  9: { poly: '40,40 20,40 40,20', foam: 'M20 40 L40 20' }, // water SE corner
  10: { poly: '0,40 20,40 0,20', foam: 'M20 40 L0 20' },   // water SW corner
  11: { poly: '0,0 20,0 0,20', foam: 'M20 0 L0 20' },      // water NW corner
};
const beach = (dir) => {
  const base = `<rect width='40' height='40' fill='${C.sand}'/>${sandNoise(dir)}`;
  const corner = BEACH_CORNERS[dir];
  if (corner) {
    return wrap(`${base}<polygon points='${corner.poly}' fill='${C.water}'/>` +
      `<path d='${corner.foam}' stroke='${C.foam}' stroke-width='2' fill='none' opacity='0.7'/>`);
  }
  let waterRect = '';
  let shore = '';
  if (dir === 0) { waterRect = `<rect x='0' y='0' width='40' height='20' fill='${C.water}'/>`; shore = `<path d='M0 20 q10 -3 20 0 t20 0' stroke='${C.foam}' stroke-width='2' fill='none' opacity='0.7'/>`; }
  else if (dir === 1) { waterRect = `<rect x='20' y='0' width='20' height='40' fill='${C.water}'/>`; shore = `<path d='M20 0 q3 10 0 20 t0 20' stroke='${C.foam}' stroke-width='2' fill='none' opacity='0.7'/>`; }
  else if (dir === 2) { waterRect = `<rect x='0' y='20' width='40' height='20' fill='${C.water}'/>`; shore = `<path d='M0 20 q10 3 20 0 t20 0' stroke='${C.foam}' stroke-width='2' fill='none' opacity='0.7'/>`; }
  else { waterRect = `<rect x='0' y='0' width='20' height='40' fill='${C.water}'/>`; shore = `<path d='M20 0 q-3 10 0 20 t0 20' stroke='${C.foam}' stroke-width='2' fill='none' opacity='0.7'/>`; }
  return wrap(`${base}${waterRect}${shore}`);
};

const desert = (seed) => {
  const r = rng(seed + 11);
  let d = '';
  for (let i = 0; i < 3; i++) {
    const y = 11 + i * 10 + Math.floor(r() * 3);
    d += `<path d='M0 ${y} q12 -5 20 0 t20 0' stroke='${C.desertDark}' stroke-width='2' fill='none' opacity='0.55'/>`;
  }
  for (let i = 0; i < 5; i++) {
    const x = (r() * 40).toFixed(1), y = (r() * 40).toFixed(1);
    d += `<circle cx='${x}' cy='${y}' r='${(r() * 0.8 + 0.4).toFixed(1)}' fill='${C.desertDark}' opacity='0.4'/>`;
  }
  return wrap(`<rect width='40' height='40' fill='${C.desert}'/>${d}`);
};

const swamp = (seed) => {
  const r = rng(seed + 12);
  let s = `<rect width='40' height='40' fill='${C.swamp}'/>`;
  s += `<ellipse cx='13' cy='15' rx='8' ry='5' fill='${C.swampLite}' opacity='0.55'/>`;
  s += `<ellipse cx='28' cy='27' rx='9' ry='5' fill='${C.swampLite}' opacity='0.45'/>`;
  for (let i = 0; i < 7; i++) {
    const x = Math.floor(r() * 36) + 2, by = Math.floor(r() * 18) + 18, h = Math.floor(r() * 6) + 5;
    s += `<rect x='${x}' y='${by - h}' width='1' height='${h}' fill='${C.reed}'/>`;
  }
  return wrap(s);
};

const snow = (seed) => {
  const r = rng(seed + 13);
  let s = `<rect width='40' height='40' fill='${C.snow}'/>`;
  for (let i = 0; i < 6; i++) {
    const x = (r() * 40).toFixed(1), y = (r() * 40).toFixed(1);
    s += `<circle cx='${x}' cy='${y}' r='${(r() * 1.3 + 0.6).toFixed(1)}' fill='${C.snowShade}' opacity='0.55'/>`;
  }
  return wrap(s);
};

// --- POI sprites (transparent background) ------------------------------------
// green palettes so trees aren't all the same shade
const GREENS = [[C.leafLo, C.leafHi], ['#357a3a', '#46a052'], ['#2b6e46', '#3a8a58'], ['#4a8a3a', '#5fa84a']];

// Dark outline so tree/mountain peaks read against pale (snow) biomes.
const EDGE = '#2b2b2b';
const outline = (pts) => `<polygon points='${pts}' fill='none' stroke='${EDGE}' stroke-width='1.1' stroke-linejoin='round'/>`;
const ES = `stroke='${EDGE}' stroke-width='0.7' stroke-linejoin='round'`;

const pineT = (cx, cy, s, lo = C.leafLo, hi = C.leafHi) =>
  `<rect x='${(cx - 1).toFixed(1)}' y='${(cy + s * 0.5).toFixed(1)}' width='2' height='${(s * 0.5).toFixed(1)}' fill='${C.trunk}'/>` +
  `<polygon points='${cx},${(cy - s).toFixed(1)} ${(cx - s * 0.72).toFixed(1)},${(cy + s * 0.45).toFixed(1)} ${(cx + s * 0.72).toFixed(1)},${(cy + s * 0.45).toFixed(1)}' fill='${lo}' ${ES}/>` +
  `<polygon points='${cx},${(cy - s * 1.35).toFixed(1)} ${(cx - s * 0.55).toFixed(1)},${cy} ${(cx + s * 0.55).toFixed(1)},${cy}' fill='${hi}' ${ES}/>`;

const roundT = (cx, cy, s, lo = C.leafLo, hi = C.leafHi) =>
  `<rect x='${(cx - 1).toFixed(1)}' y='${(cy + s * 0.3).toFixed(1)}' width='2' height='${(s * 0.6).toFixed(1)}' fill='${C.trunk}'/>` +
  `<circle cx='${cx}' cy='${(cy - s * 0.1).toFixed(1)}' r='${(s * 0.72).toFixed(1)}' fill='${lo}' ${ES}/>` +
  `<circle cx='${(cx - s * 0.28).toFixed(1)}' cy='${(cy - s * 0.38).toFixed(1)}' r='${(s * 0.42).toFixed(1)}' fill='${hi}'/>`;

// single tree (pine) for town clusters
const tree = (cx, cy, s) => pineT(cx, cy, s);

// a varied forest cluster: 2-4 trees, mixed pine/round, varied size + green, drawn
// back-to-front so lower trees overlap correctly
const forest = (v = 0) => {
  const r = rng(v + 11);
  const slots = [[12, 18], [28, 20], [19, 24], [9, 28], [30, 29], [20, 31]];
  const n = 2 + Math.floor(r() * 3);
  let s = '';
  for (let i = 0; i < n; i++) {
    const [bx, by] = slots[i];
    const cx = bx + (Math.floor(r() * 5) - 2);
    const cy = by + (Math.floor(r() * 5) - 2);
    const sz = 6 + Math.floor(r() * 4);
    const [lo, hi] = GREENS[Math.floor(r() * GREENS.length)];
    s += (r() > 0.45 ? pineT : roundT)(cx, cy, sz, lo, hi);
  }
  return wrap(s);
};

// forest POI stranded on a beach tile (legacy saves): 2-3 slightly smaller trees
// confined to the SAND half for the tile's beachDirection (0 = water North, so
// trees south; 1 = water East -> trees west; 2 = water South -> north; 3 -> east).
const beachForest = (v = 0, dir = 2) => {
  const r = rng(v * 7 + dir + 23);
  // slot boxes [minX, maxX, minY, maxY] on the sand side, margin off the shoreline
  const SAND = {
    0: [6, 32, 26, 34], // water N -> lower band
    1: [4, 14, 8, 32],  // water E -> left band
    2: [6, 32, 8, 16],  // water S -> upper band
    3: [24, 34, 8, 32], // water W -> right band
  };
  const [x0, x1, y0, y1] = SAND[dir] || SAND[2];
  const n = 2 + Math.floor(r() * 2);
  let s = '';
  for (let i = 0; i < n; i++) {
    const cx = x0 + Math.floor(r() * (x1 - x0 + 1));
    const cy = y0 + Math.floor(r() * (y1 - y0 + 1));
    const sz = 5 + Math.floor(r() * 3);
    const [lo, hi] = GREENS[Math.floor(r() * GREENS.length)];
    s += (r() > 0.45 ? pineT : roundT)(cx, cy, sz, lo, hi);
  }
  return wrap(s);
};

// woodland biome: a grass floor densely filled with mixed trees (a forest *region*,
// vs the single-cluster forest POI)
const woodland = (seed) => {
  const r = rng(seed + 14);
  let s = `<rect width='40' height='40' fill='${shade(C.plains, 0.9)}'/>`;
  const slots = [[8, 13], [21, 11], [33, 14], [14, 22], [27, 22], [7, 30], [20, 31], [33, 30]];
  for (const [bx, by] of slots) {
    const sz = 6 + Math.floor(r() * 3);
    const [lo, hi] = GREENS[Math.floor(r() * GREENS.length)];
    s += (r() > 0.5 ? pineT : roundT)(bx + (Math.floor(r() * 3) - 1), by, sz, lo, hi);
  }
  return wrap(s);
};

// Several mountain silhouettes; the wide ridge (v2) reaches the tile edges so adjacent
// mountains visually merge into a range. Parameterized by palette so biomes can
// re-skin the same silhouettes: temperate/snow keep grey rock with snow caps,
// desert gets sandstone with sun-bleached summits (no snow over the dunes).
const mountainVariantsFor = ({ base, shade, cap }) => [
  // single peak
  `<polygon points='20,4 36,34 4,34' fill='${base}'/>` +
  `<polygon points='20,4 36,34 24,34' fill='${shade}'/>` +
  `<polygon points='20,4 27,17 13,17' fill='${cap}'/>` +
  outline('20,4 36,34 4,34'),
  // twin peaks
  `<polygon points='13,9 24,34 2,34' fill='${base}'/>` +
  `<polygon points='27,6 38,34 16,34' fill='${shade}'/>` +
  `<polygon points='27,6 33,18 21,18' fill='${cap}'/>` +
  `<polygon points='13,9 18,19 8,19' fill='${cap}'/>` +
  outline('13,9 24,34 2,34') + outline('27,6 38,34 16,34'),
  // wide ridge (edge-to-edge -> connects with neighbours)
  `<polygon points='0,35 10,16 20,27 30,13 40,35' fill='${base}'/>` +
  `<polygon points='20,27 30,13 40,35' fill='${shade}'/>` +
  `<polygon points='10,16 14,23 6,23' fill='${cap}'/>` +
  `<polygon points='30,13 34,21 26,21' fill='${cap}'/>` +
  `<polyline points='0,35 10,16 20,27 30,13 40,35' fill='none' stroke='${EDGE}' stroke-width='1.1' stroke-linejoin='round'/>`,
  // peak with a foothill
  `<polygon points='23,6 38,34 8,34' fill='${base}'/>` +
  `<polygon points='23,6 38,34 27,34' fill='${shade}'/>` +
  `<polygon points='23,6 29,18 17,18' fill='${cap}'/>` +
  `<polygon points='9,21 19,34 0,34' fill='${base}'/>` +
  `<polygon points='9,21 19,34 12,34' fill='${shade}'/>` +
  outline('23,6 38,34 8,34') + outline('9,21 19,34 0,34'),
];
const MOUNTAIN_VARIANTS = mountainVariantsFor({ base: C.rock, shade: C.rockDark, cap: C.snow });
// Sandstone mesa palette; the "cap" is sun-bleached rock, not snow.
const DESERT_MOUNTAIN_VARIANTS = mountainVariantsFor({ base: '#c19a6b', shade: '#96714a', cap: '#ecdcb8' });
const mountain = (v = 0) => wrap(MOUNTAIN_VARIANTS[v % MOUNTAIN_VARIANTS.length]);
const desertMountain = (v = 0) => wrap(DESERT_MOUNTAIN_VARIANTS[v % DESERT_MOUNTAIN_VARIANTS.length]);

// rolling green hills — shaded mounds (dark base, mid body, sunlit top-left) so they read
// as raised humps, not flat blobs. Several variants for variety.
const HILL = { lo: '#4f7d3c', mid: '#6aa84f', hi: '#88c468' };
const hump = (cx, by, rx, ry) =>
  `<ellipse cx='${cx}' cy='${by}' rx='${rx}' ry='${ry}' fill='${HILL.lo}'/>` +
  `<ellipse cx='${cx}' cy='${(by - ry * 0.2).toFixed(1)}' rx='${(rx * 0.9).toFixed(1)}' ry='${(ry * 0.8).toFixed(1)}' fill='${HILL.mid}'/>` +
  `<ellipse cx='${(cx - rx * 0.32).toFixed(1)}' cy='${(by - ry * 0.55).toFixed(1)}' rx='${(rx * 0.4).toFixed(1)}' ry='${(ry * 0.3).toFixed(1)}' fill='${HILL.hi}'/>`;
const tuft = (x, y) => `<path d='M${x} ${y} q1 -2.4 2 0' stroke='${HILL.lo}' stroke-width='1' fill='none' stroke-linecap='round'/>`;
const HILL_VARIANTS = [
  hump(20, 31, 16, 12) + tuft(15, 24) + tuft(24, 23),                                   // one broad hill
  hump(12, 32, 11, 9) + hump(28, 31, 12, 10) + tuft(25, 24),                            // twin hills
  hump(9, 33, 8, 6) + hump(20, 31, 10, 8) + hump(31, 33, 8, 6) + tuft(18, 25),          // three low hills
  hump(25, 31, 14, 12) + hump(9, 34, 7, 5) + tuft(22, 23),                              // big + foothill
];
const hills = (v = 0) => wrap(HILL_VARIANTS[v % HILL_VARIANTS.length]);

// --- theme-aware POI variants -------------------------------------------------
// poiSprite picks these by tile.biome: desert → sand dunes + cacti, snow → snow-capped
// hills + snow-laden pines. (Temperate keeps the green forest/hills above.)
const shadedHump = (cx, by, rx, ry, pal) =>
  `<ellipse cx='${cx}' cy='${by}' rx='${rx}' ry='${ry}' fill='${pal.lo}'/>` +
  `<ellipse cx='${cx}' cy='${(by - ry * 0.2).toFixed(1)}' rx='${(rx * 0.9).toFixed(1)}' ry='${(ry * 0.8).toFixed(1)}' fill='${pal.mid}'/>` +
  `<ellipse cx='${(cx - rx * 0.32).toFixed(1)}' cy='${(by - ry * 0.55).toFixed(1)}' rx='${(rx * 0.4).toFixed(1)}' ry='${(ry * 0.3).toFixed(1)}' fill='${pal.hi}'/>`;
const hillVariantsFor = (pal) => [
  shadedHump(20, 31, 16, 12, pal),
  shadedHump(12, 32, 11, 9, pal) + shadedHump(28, 31, 12, 10, pal),
  shadedHump(9, 33, 8, 6, pal) + shadedHump(20, 31, 10, 8, pal) + shadedHump(31, 33, 8, 6, pal),
  shadedHump(25, 31, 14, 12, pal) + shadedHump(9, 34, 7, 5, pal),
];
const SAND_HILL_VARIANTS = hillVariantsFor({ lo: '#c5b78f', mid: '#dccfac', hi: '#ece1c2' });
const SNOW_HILL_VARIANTS = hillVariantsFor({ lo: '#bcc7d2', mid: '#dde6ec', hi: '#ffffff' });
const sandHills = (v = 0) => wrap(SAND_HILL_VARIANTS[v % SAND_HILL_VARIANTS.length]);
const snowHills = (v = 0) => wrap(SNOW_HILL_VARIANTS[v % SNOW_HILL_VARIANTS.length]);

// snow-laden pine (darker green with snow on the boughs)
const snowPine = (cx, cy, s) =>
  `<rect x='${(cx - 1).toFixed(1)}' y='${(cy + s * 0.5).toFixed(1)}' width='2' height='${(s * 0.5).toFixed(1)}' fill='${C.trunk}'/>` +
  `<polygon points='${cx},${(cy - s).toFixed(1)} ${(cx - s * 0.72).toFixed(1)},${(cy + s * 0.45).toFixed(1)} ${(cx + s * 0.72).toFixed(1)},${(cy + s * 0.45).toFixed(1)}' fill='#3f6e52' ${ES}/>` +
  `<polygon points='${cx},${(cy - s * 1.35).toFixed(1)} ${(cx - s * 0.55).toFixed(1)},${cy} ${(cx + s * 0.55).toFixed(1)},${cy}' fill='#4a805f' ${ES}/>` +
  `<polygon points='${cx},${(cy - s * 1.35).toFixed(1)} ${(cx - s * 0.34).toFixed(1)},${(cy - s * 0.55).toFixed(1)} ${(cx + s * 0.34).toFixed(1)},${(cy - s * 0.55).toFixed(1)}' fill='#ffffff'/>` +
  `<polygon points='${cx},${(cy - s * 0.62).toFixed(1)} ${(cx - s * 0.5).toFixed(1)},${(cy + s * 0.32).toFixed(1)} ${(cx + s * 0.5).toFixed(1)},${(cy + s * 0.32).toFixed(1)}' fill='#ffffff' opacity='0.7'/>`;
const snowForest = (v = 0) => {
  const r = rng(v + 21);
  const slots = [[12, 18], [28, 20], [19, 24], [9, 28], [30, 29], [20, 31]];
  const n = 2 + Math.floor(r() * 3);
  let s = '';
  for (let i = 0; i < n; i++) { const [bx, by] = slots[i]; s += snowPine(bx + (Math.floor(r() * 5) - 2), by, 6 + Math.floor(r() * 4)); }
  return wrap(s);
};

// desert saguaro cactus
const cactus = (cx, by, h) =>
  `<rect x='${(cx - 1.7).toFixed(1)}' y='${(by - h).toFixed(1)}' width='3.4' height='${h.toFixed(1)}' rx='1.7' fill='#4e8b4a'/>` +
  `<rect x='${(cx - 1.7).toFixed(1)}' y='${(by - h).toFixed(1)}' width='1.3' height='${h.toFixed(1)}' rx='0.6' fill='#5fa05a'/>` +
  `<path d='M${(cx - 1.7).toFixed(1)} ${(by - h * 0.55).toFixed(1)} h-3 v-${(h * 0.32).toFixed(1)}' stroke='#4e8b4a' stroke-width='2.8' fill='none' stroke-linecap='round'/>` +
  `<path d='M${(cx + 1.7).toFixed(1)} ${(by - h * 0.42).toFixed(1)} h3 v-${(h * 0.26).toFixed(1)}' stroke='#4e8b4a' stroke-width='2.8' fill='none' stroke-linecap='round'/>`;
const desertForest = (v = 0) => {
  const r = rng(v + 22);
  const slots = [[13, 31], [26, 32], [20, 29], [9, 30]];
  const n = 2 + Math.floor(r() * 2);
  let s = '';
  for (let i = 0; i < n; i++) { const [bx, by] = slots[i]; s += cactus(bx + (Math.floor(r() * 4) - 2), by, 12 + Math.floor(r() * 6)); }
  return wrap(s);
};

// a craggy rock outcrop with a dark cave mouth (inner depth) and a couple of boulders
const cave = () => wrap(
  `<path d='M4 34 L8 17 Q20 8 32 17 L36 34 Z' fill='${C.rock}'/>` +                    // rock face
  `<path d='M20 11 Q32 17 36 34 L23 34 Z' fill='${C.rockDark}'/>` +                    // shaded right side
  `<path d='M8 17 Q20 8 32 17' fill='none' stroke='${shade(C.rock, 1.14)}' stroke-width='1.4' opacity='0.7'/>` + // lit ridge
  `<path d='M14 24 l3 4 M29 22 l-3 5' stroke='${C.rockDark}' stroke-width='1' opacity='0.6'/>` + // cracks
  `<path d='M13 34 Q13 21 20 21 Q27 21 27 34 Z' fill='#1b1713'/>` +                    // cave mouth
  `<path d='M16 34 Q16 26 20 26 Q24 26 24 34 Z' fill='#000000'/>` +                    // inner depth
  `<ellipse cx='9' cy='34' rx='3.2' ry='2' fill='${C.rockDark}'/>` +                   // boulders
  `<ellipse cx='31' cy='34' rx='2.6' ry='1.8' fill='${shade(C.rock, 0.9)}'/>`
);

// ruins: broken walls + toppled columns with a fallen lintel and rubble. Each stone piece
// gets a dark outline + top highlight so it reads against grass (the stone/grass values are
// otherwise too close).
const ruins = () => {
  const stone = ROOF.stone;
  const edge = shade(stone, 0.45);   // dark outline / mortar shadow
  const lite = shade(stone, 1.15);   // sunlit top
  const block = (x, y, w, h) =>
    `<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='${stone}' stroke='${edge}' stroke-width='1' rx='0.5'/>` +
    `<rect x='${x + 0.6}' y='${y + 0.6}' width='${w - 1.2}' height='1.4' fill='${lite}'/>`;
  return wrap(
    `<ellipse cx='20' cy='33' rx='15' ry='3.4' fill='#000000' opacity='0.18'/>` + // ground shadow
    block(6, 22, 12, 10) +                                  // broken wall chunk
    block(6, 18, 4, 14) +                                   // standing jamb
    block(22, 15, 3.8, 17) +                                // column
    block(29, 13, 3.8, 19) +                                // column
    block(21, 11.5, 13, 3) +                                // fallen lintel across the columns
    `<circle cx='17' cy='32' r='1.9' fill='${stone}' stroke='${edge}' stroke-width='0.7'/>` + // rubble
    `<circle cx='26' cy='32' r='1.5' fill='${stone}' stroke='${edge}' stroke-width='0.7'/>`
  );
};

// a little pitched-roof house: wall + gable roof + door (footprint ~s)
const house = (x, y, s, c) =>
  `<rect x='${x}' y='${(y + s * 0.42).toFixed(1)}' width='${s}' height='${(s * 0.58).toFixed(1)}' rx='0.5' fill='${shade(c, 0.8)}'/>` +
  `<polygon points='${x - 1},${(y + s * 0.48).toFixed(1)} ${x + s / 2},${y} ${x + s + 1},${(y + s * 0.48).toFixed(1)}' fill='${c}'/>` +
  `<rect x='${(x + s * 0.38).toFixed(1)}' y='${(y + s * 0.62).toFixed(1)}' width='${(s * 0.24).toFixed(1)}' height='${(s * 0.38).toFixed(1)}' fill='${shade(c, 0.5)}'/>`;

const townSprite = (size) => {
  if (size === 'hamlet') return wrap(house(13, 16, 13, ROOF.red) + tree(31, 28, 5));
  if (size === 'village') return wrap(house(7, 17, 11, ROOF.red) + house(20, 19, 12, ROOF.amber) + tree(34, 30, 4));
  if (size === 'town') return wrap(house(5, 18, 9, ROOF.red) + house(14, 13, 12, ROOF.amber) + house(25, 19, 10, ROOF.teal) + tree(35, 31, 4));
  // city: a clearly crenellated curtain wall enclosing roofs, with corner towers,
  // a central keep, and a gate.
  const wallD = '#867d6a', wallL = '#b3a98f', court = '#c2ad84';
  let merlons = '';
  for (let mx = 5; mx <= 31; mx += 5) merlons += `<rect x='${mx}' y='6' width='3' height='4' fill='${wallD}'/>`;
  const tower = (x, y, h) => `<rect x='${x}' y='${y}' width='7' height='${h}' rx='1' fill='${wallD}'/><rect x='${x}' y='${y}' width='7' height='2' fill='${wallL}' opacity='0.7'/>`;
  return wrap(
    `<rect x='3' y='9' width='34' height='28' rx='2' fill='${wallD}'/>` +       // curtain wall
    `<rect x='8' y='14' width='24' height='20' rx='1' fill='${court}'/>` +       // courtyard (inside the wall)
    merlons +                                                                     // battlements along the top
    tower(2, 6, 11) + tower(31, 6, 11) + tower(2, 28, 9) + tower(31, 28, 9) +     // corner towers
    house(10, 23, 7, ROOF.red) + house(24, 24, 6, ROOF.amber) +                  // a couple of roofs inside
    `<rect x='15.5' y='11' width='9' height='15' rx='1' fill='${ROOF.slate}'/>` + // central keep
    `<rect x='15.5' y='11' width='9' height='2' fill='#9aa0a6' opacity='0.6'/>` +
    `<rect x='15.5' y='9' width='2.6' height='2.6' fill='${ROOF.slate}'/><rect x='21.9' y='9' width='2.6' height='2.6' fill='${ROOF.slate}'/>` + // keep merlons
    `<rect x='17.8' y='14.5' width='0.9' height='3' fill='${shade(ROOF.slate, 0.4)}'/>` + // dark arrow-slit windows
    `<rect x='21.3' y='14.5' width='0.9' height='3' fill='${shade(ROOF.slate, 0.4)}'/>` +
    `<rect x='17.8' y='19.5' width='0.9' height='3' fill='${shade(ROOF.slate, 0.4)}'/>` +
    `<rect x='21.3' y='19.5' width='0.9' height='3' fill='${shade(ROOF.slate, 0.4)}'/>` +
    `<rect x='17' y='32' width='6' height='5' rx='0.5' fill='#352f27'/>`          // gate
  );
};

const milestone = () => wrap(
  `<rect x='19' y='7' width='1.8' height='24' rx='0.6' fill='#5a4a3a'/>` +
  `<polygon points='20.8,7 32,11.5 20.8,16' fill='#b23b3b'/>`
);

// --- distinctive milestone-POI sprites ---------------------------------------
// One builder per authored milestone spawn id, so each named location gets its
// own world-map motif instead of the shared generic red flag. Same idiom as the
// biome/POI builders above: transparent 40x40 canvas (the biome shows through),
// deterministic, ground near y=34. Reuse the module's own wrap/shade/C/ROOF.

// gear ring helper (brass cog): teeth + hub — used by the Arcane-Renaissance POIs
const gear = (cx, cy, r, teeth = 8, face = '#b5843a', hub = '#8a5f22') => {
  let g = '';
  for (let k = 0; k < teeth; k++) {
    g += `<rect x='${(cx - 1.1).toFixed(1)}' y='${(cy - r - 1.8).toFixed(1)}' width='2.2' height='2.8' fill='${face}' transform='rotate(${(k * 360 / teeth).toFixed(1)} ${cx} ${cy})'/>`;
  }
  g += `<circle cx='${cx}' cy='${cy}' r='${r}' fill='${face}'/>`;
  g += `<circle cx='${cx}' cy='${cy}' r='${(r * 0.42).toFixed(1)}' fill='${hub}'/>`;
  return g;
};

// goblin_hideout — palisade of pointed stakes + a skull totem + a cookfire.
const goblin_hideout = () => {
  const wood = C.trunk, woodD = '#4f3620', woodL = '#7d5836';
  const totem =
    `<rect x='19.2' y='8' width='1.6' height='15' fill='${woodD}'/>` +
    `<circle cx='20' cy='8' r='3.2' fill='#e8e4d6'/>` +
    `<circle cx='18.7' cy='8' r='0.8' fill='#241a10'/><circle cx='21.3' cy='8' r='0.8' fill='#241a10'/>` +
    `<rect x='18.6' y='9.8' width='2.8' height='1.3' fill='#241a10'/>`;
  let stakes = '';
  for (let i = 0; i < 6; i++) {
    const x = 5 + i * 5;
    stakes += `<rect x='${x}' y='22' width='3.4' height='12' fill='${wood}'/>` +
      `<polygon points='${x},22 ${(x + 1.7).toFixed(1)},18 ${x + 3.4},22' fill='${woodL}'/>` +
      `<rect x='${x}' y='22' width='1.2' height='12' fill='${woodL}' opacity='0.55'/>`;
  }
  const fire = `<polygon points='30,32 32,26 34,32' fill='#e6843a'/>` +
    `<polygon points='31,32 32,28.5 33,32' fill='#f2c23a'/>`;
  return wrap(totem + stakes + fire);
};

// shadow_fortress — dark crenellated keep wreathed in a violet shadow aura.
const shadow_fortress = () => {
  const stone = '#3a3242', stoneD = '#241d2e', stoneL = '#4d4358', glow = '#7b57a6';
  let s = `<ellipse cx='20' cy='23' rx='17' ry='15' fill='${glow}' opacity='0.20'/>`;
  s += `<rect x='7' y='18' width='6' height='16' fill='${stoneD}'/>`;
  s += `<rect x='27' y='18' width='6' height='16' fill='${stoneD}'/>`;
  s += `<rect x='7' y='15' width='2' height='3' fill='${stoneD}'/><rect x='11' y='15' width='2' height='3' fill='${stoneD}'/>`;
  s += `<rect x='27' y='15' width='2' height='3' fill='${stoneD}'/><rect x='31' y='15' width='2' height='3' fill='${stoneD}'/>`;
  s += `<rect x='11' y='14' width='18' height='20' fill='${stone}'/>`;
  s += `<rect x='11' y='14' width='18' height='2' fill='${stoneL}' opacity='0.6'/>`;
  for (let mx = 11; mx <= 26; mx += 5) s += `<rect x='${mx}' y='11' width='3' height='4' fill='${stone}'/>`;
  s += `<rect x='17' y='25' width='6' height='9' fill='#0d0a12'/>`;
  s += `<rect x='13.5' y='18' width='2' height='3' fill='${glow}'/><rect x='24.5' y='18' width='2' height='3' fill='${glow}'/>`;
  return wrap(s);
};

// sandstorm_hideout — red-rock cleft with a dark entrance, tattered awning, blowing sand.
const sandstorm_hideout = () => {
  const rock = '#b5603a', rockD = '#8a4326', rockL = '#cd7a4a';
  let s = `<path d='M4 34 L7 16 Q20 9 33 16 L36 34 Z' fill='${rock}'/>`;
  s += `<path d='M20 12 Q33 16 36 34 L24 34 Z' fill='${rockD}'/>`;
  s += `<path d='M7 16 Q20 9 33 16' fill='none' stroke='${rockL}' stroke-width='1.3' opacity='0.7'/>`;
  s += `<path d='M14 34 Q14 22 20 22 Q26 22 26 34 Z' fill='#1a0f0a'/>`;
  s += `<rect x='12' y='19.4' width='16' height='1.4' fill='#8a7a58'/>`;
  s += `<path d='M12 20.8 L16 24 L18 20.8 L22 24 L24 20.8 L28 24 L28 20.8 Z' fill='#c9b48a'/>`;
  s += `<path d='M2 12 q8 -1.5 14 0' stroke='#e6c98a' stroke-width='1.2' fill='none' opacity='0.6'/>`;
  s += `<path d='M24 9 q8 -1.5 13 0' stroke='#e6c98a' stroke-width='1.2' fill='none' opacity='0.55'/>`;
  return wrap(s);
};

// sunken_spire — the tip of a tapered stone tower jutting from burying dunes.
const sunken_spire = () => {
  const stone = '#c9b98f', stoneD = '#a08a5c', stoneL = '#e2d3aa', dune = '#d9c58f', duneD = '#c2ad78';
  let s = `<polygon points='16,10 24,10 22,32 18,32' fill='${stone}'/>`;
  s += `<polygon points='20,10 24,10 22,32 20,32' fill='${stoneD}'/>`;
  s += `<rect x='16.5' y='15' width='7' height='1.4' fill='${stoneD}'/>`;
  s += `<rect x='16.9' y='20' width='6.2' height='1.4' fill='${stoneD}'/>`;
  s += `<rect x='18' y='11' width='4' height='4' fill='#2a2313'/>`;
  s += `<rect x='16' y='8.6' width='1.8' height='2.4' fill='${stoneL}'/><rect x='22.2' y='8.6' width='1.8' height='2.4' fill='${stoneL}'/>`;
  s += `<path d='M0 34 Q10 24 20 28 Q30 24 40 34 Z' fill='${dune}'/>`;
  s += `<path d='M0 34 Q12 28 24 30 Q32 28 40 34 Z' fill='${duneD}' opacity='0.7'/>`;
  return wrap(s);
};

// glacier_hollow — blue ice cave, glowing cyan mouth, hanging icicles.
const glacier_hollow = () => {
  const ice = '#a9dcf0', iceD = '#6fbfe0', iceL = '#d6f1fb', glow = '#9af0ff';
  let s = `<path d='M4 34 L8 16 Q20 8 32 16 L36 34 Z' fill='${ice}'/>`;
  s += `<path d='M20 11 Q32 16 36 34 L24 34 Z' fill='${iceD}'/>`;
  s += `<path d='M8 16 Q20 8 32 16' fill='none' stroke='${iceL}' stroke-width='1.4' opacity='0.85'/>`;
  s += `<path d='M13 34 Q13 20 20 20 Q27 20 27 34 Z' fill='${glow}' opacity='0.55'/>`;
  s += `<path d='M15 34 Q15 24 20 24 Q25 24 25 34 Z' fill='#3a86b0'/>`;
  for (const [x, h] of [[15, 4], [18, 5.5], [21, 4.5], [24, 5]])
    s += `<polygon points='${x},20.5 ${x + 1.4},20.5 ${(x + 0.7).toFixed(1)},${(20.5 + h).toFixed(1)}' fill='${iceL}'/>`;
  s += `<path d='M11 20 l2 3 M28 19 l-2 3' stroke='${iceL}' stroke-width='1' opacity='0.7'/>`;
  return wrap(s);
};

// silent_steading — snow-laden longhouse, dark door ajar, no smoke, empty windows.
const silent_steading = () => {
  const wall = '#8a7256', wallD = '#6b573f', roof = '#cfe0ec', roofSnow = '#ffffff', door = '#241a12';
  let s = `<rect x='9' y='20' width='22' height='14' fill='${wall}'/>`;
  s += `<rect x='9' y='20' width='22' height='2' fill='${wallD}'/>`;
  s += `<polygon points='6,21 20,10 34,21' fill='${roofSnow}'/>`;
  s += `<polygon points='8,20 20,13 32,20' fill='${roof}' opacity='0.6'/>`;
  s += `<rect x='17' y='24' width='6' height='10' fill='${door}'/>`;
  s += `<rect x='20' y='24' width='3' height='10' fill='#3a2c1e'/>`;
  s += `<rect x='11.5' y='24' width='3' height='3' fill='${door}'/><rect x='25.5' y='24' width='3' height='3' fill='${door}'/>`;
  s += `<path d='M4 34 Q20 31 36 34 Z' fill='#ffffff' opacity='0.85'/>`;
  return wrap(s);
};

// famine_barrow — grassy/snow burial mound with a bold megalithic trilithon door.
// (Bolder trilithon-doorway version approved by the maintainer over the draft.)
const famine_barrow = () => wrap(
  "<path d='M2 34 Q20 10 38 34 Z' fill='#9aa58c'/>" +
  "<path d='M20 12 Q38 24 38 34 L22 34 Z' fill='#7a856e' opacity='0.6'/>" +
  "<path d='M9 23 q11 -6 22 0' stroke='#eef2f4' stroke-width='2.2' fill='none' opacity='0.5'/>" +
  // left post
  "<rect x='12' y='21' width='4.2' height='13' fill='#a49e94'/>" +
  "<rect x='12' y='21' width='1.4' height='13' fill='#c8c2b8'/>" +
  // right post
  "<rect x='23.8' y='21' width='4.2' height='13' fill='#a49e94'/>" +
  "<rect x='23.8' y='21' width='1.4' height='13' fill='#c8c2b8'/>" +
  // lintel
  "<rect x='10.5' y='17' width='19' height='4.6' fill='#a49e94'/>" +
  "<rect x='10.5' y='17' width='19' height='1.3' fill='#c8c2b8'/>" +
  // doorway: stone jamb framing a near-black opening
  "<rect x='15.6' y='21.4' width='8.8' height='12.6' fill='#5a554c'/>" +
  "<rect x='16.6' y='22.4' width='6.8' height='11.6' fill='#0a0806'/>"
);

// abandoned_well (The Poisoned Well) — stone well, wooden roof, black/green foul water.
const abandoned_well = () => {
  const stone = '#a9a08c', stoneD = '#7d7460', stoneL = '#c2b9a2', wood = C.trunk, foul = '#3a5a2a', foulL = '#5f8a34';
  let s = `<rect x='12' y='22' width='16' height='12' rx='1' fill='${stone}'/>`;
  s += `<line x1='12' y1='26' x2='28' y2='26' stroke='${stoneD}' stroke-width='0.8'/>`;
  s += `<line x1='12' y1='30' x2='28' y2='30' stroke='${stoneD}' stroke-width='0.8'/>`;
  s += `<line x1='20' y1='22' x2='20' y2='34' stroke='${stoneD}' stroke-width='0.6' opacity='0.5'/>`;
  s += `<rect x='12' y='22' width='16' height='12' rx='1' fill='none' stroke='${stoneD}' stroke-width='1'/>`;
  s += `<ellipse cx='20' cy='22' rx='9' ry='3' fill='${stoneL}'/>`;
  s += `<ellipse cx='20' cy='22' rx='6.5' ry='2' fill='${foul}'/>`;
  s += `<ellipse cx='20' cy='21.7' rx='4' ry='1.1' fill='${foulL}' opacity='0.7'/>`;
  s += `<rect x='12.5' y='10' width='1.6' height='12' fill='${wood}'/>`;
  s += `<rect x='25.9' y='10' width='1.6' height='12' fill='${wood}'/>`;
  s += `<polygon points='10,12 20,5 30,12' fill='#7a3a2a'/>`;
  s += `<polygon points='11,12 20,7 29,12' fill='#8a4a34' opacity='0.6'/>`;
  return wrap(s);
};

// grimstead_cellar — sunken arched cellar doorway with descending steps + fungus.
const grimstead_cellar = () => {
  const stone = '#7d7466', stoneD = '#554f45', stoneL = '#9a9182', dark = '#0d0b09', step = '#6b6357', fungus = '#b9c8a0';
  let s = `<path d='M6 34 L9 18 L31 18 L34 34 Z' fill='${stone}'/>`;
  s += `<path d='M9 18 L31 18 L34 34 L20 34 Z' fill='${stoneD}' opacity='0.5'/>`;
  s += `<path d='M10 22 Q20 14 30 22 L30 20 Q20 12 10 20 Z' fill='${stoneL}'/>`;
  s += `<path d='M13 34 L13 21 Q20 15.5 27 21 L27 34 Z' fill='${dark}'/>`;
  for (let i = 0; i < 3; i++) {
    const y = 26 + i * 2.6;
    s += `<rect x='${(15 + i * 1.2).toFixed(1)}' y='${y}' width='${(10 - i * 2.4).toFixed(1)}' height='1.3' fill='${step}' opacity='${(0.85 - i * 0.2).toFixed(2)}'/>`;
  }
  s += `<circle cx='11' cy='24' r='1.1' fill='${fungus}'/><circle cx='29' cy='25' r='0.9' fill='${fungus}'/><circle cx='12.5' cy='29' r='0.8' fill='${fungus}'/>`;
  return wrap(s);
};

// ironhold_ruins — broken crenellated fortress wall + jagged tower stump, rust streaks.
const ironhold_ruins = () => {
  const stone = '#8a8175', stoneD = '#5f594e', stoneL = '#a39a89', rust = '#7a4a34', dark = '#1c1814';
  let s = `<ellipse cx='20' cy='33' rx='16' ry='3' fill='#000' opacity='0.15'/>`;
  s += `<path d='M5 34 L5 20 L9 20 L9 16 L14 16 L14 22 L19 22 L19 18 L24 18 L24 34 Z' fill='${stone}' stroke='${stoneD}' stroke-width='0.8'/>`;
  s += `<path d='M5 20 L9 20 L9 16 L14 16 L14 22 L19 22 L19 18 L24 18' fill='none' stroke='${stoneL}' stroke-width='0.9' opacity='0.6'/>`;
  s += `<rect x='26' y='14' width='9' height='20' fill='${stone}' stroke='${stoneD}' stroke-width='0.8'/>`;
  s += `<polygon points='26,14 30,10 35,14' fill='${stone}' stroke='${stoneD}' stroke-width='0.8'/>`;
  s += `<rect x='9' y='26' width='6' height='8' fill='${dark}'/>`;
  s += `<rect x='27.5' y='22' width='1.6' height='6' fill='${rust}' opacity='0.7'/>`;
  s += `<circle cx='20' cy='32' r='2' fill='${stone}' stroke='${stoneD}' stroke-width='0.6'/>`;
  return wrap(s);
};

// rot_tunnels — dark tunnel mouth in a rotting mound, slime drips, pale fungus, glow.
const rot_tunnels = () => {
  const soil = '#4f4636', soilD = '#372f22', dark = '#0a0906', slime = '#5f7a2a', fung = '#c8d6a8', fungP = '#d9b9e0';
  let s = `<path d='M3 34 Q20 14 37 34 Z' fill='${soil}'/>`;
  s += `<path d='M20 16 Q37 24 37 34 L22 34 Z' fill='${soilD}' opacity='0.6'/>`;
  s += `<path d='M12 34 Q12 22 20 22 Q28 22 28 34 Z' fill='${dark}'/>`;
  s += `<ellipse cx='20' cy='31' rx='2.6' ry='2' fill='${slime}' opacity='0.5'/>`;
  s += `<path d='M13.5 24 q1 4 0 6 M20 22.5 q1 5 0 8 M26.5 24 q-1 4 0 6' stroke='${slime}' stroke-width='1.4' fill='none' opacity='0.85'/>`;
  s += `<circle cx='9' cy='27' r='1.4' fill='${fung}'/><circle cx='31' cy='26' r='1.2' fill='${fung}'/>`;
  s += `<circle cx='7' cy='31' r='1' fill='${fungP}'/><circle cx='33' cy='30' r='1.1' fill='${fungP}'/>`;
  return wrap(s);
};

// gear_end_sewers — brick sewer arch with a barred grate, a brass cog, a spilling pipe.
const gear_end_sewers = () => {
  const brick = '#6b5f52', brickD = '#4a4136', dark = '#0d0d10', bar = '#3a3a40', water = '#3a5a4a', brassD = '#8a5f22';
  let s = `<path d='M8 34 L8 20 Q20 12 32 20 L32 34 Z' fill='${brick}'/>`;
  s += `<path d='M8 20 Q20 12 32 20' fill='none' stroke='${brickD}' stroke-width='1.4'/>`;
  s += `<path d='M12 34 L12 22 Q20 16 28 22 L28 34 Z' fill='${dark}'/>`;
  for (let i = 0; i < 4; i++) s += `<rect x='${14 + i * 3.4}' y='20' width='1.5' height='14' fill='${bar}'/>`;
  s += `<rect x='12' y='24' width='16' height='1.6' fill='${bar}'/>`;
  s += gear(9, 10, 4);
  s += `<rect x='27' y='7' width='6' height='4' rx='1' fill='${brassD}'/>`;
  s += `<rect x='29.5' y='10.5' width='2' height='6' fill='${water}' opacity='0.75'/>`;
  return wrap(s);
};

// coghill_foundry (Destroyed Foundry) — brick works, blown-open roof, smokestack + smoke, big cog, embers.
const coghill_foundry = () => {
  const brick = '#8a4a34', brickD = '#5f3020', roof = '#4a4036', smoke = '#8a8a8a', spark = '#f2a83a';
  let s = `<rect x='7' y='22' width='22' height='12' fill='${brick}'/>`;
  s += `<rect x='7' y='22' width='22' height='12' fill='none' stroke='${brickD}' stroke-width='0.8'/>`;
  s += `<polygon points='7,22 12,17 16,21 21,15 25,20 29,22' fill='${roof}'/>`;
  s += `<rect x='23' y='8' width='6' height='16' fill='${brickD}'/>`;
  s += `<rect x='22.5' y='7' width='7' height='2.4' fill='${brick}'/>`;
  s += `<circle cx='26' cy='5' r='3' fill='${smoke}' opacity='0.5'/><circle cx='29' cy='2.5' r='2.2' fill='${smoke}' opacity='0.4'/><circle cx='23' cy='2.4' r='2' fill='${smoke}' opacity='0.35'/>`;
  s += gear(14, 28, 5);
  s += `<circle cx='19' cy='30' r='0.8' fill='${spark}'/><circle cx='11' cy='21' r='0.7' fill='${spark}'/>`;
  return wrap(s);
};

// desecrated_shrine — cracked stone altar, guttering candles, a floating sickly-green sigil.
const desecrated_shrine = () => {
  const stone = '#8a8578', stoneD = '#5f5b50', stoneL = '#a39d8e', dark = '#2a2620', sigil = '#7fd94a', candle = '#e8d98a', flame = '#bfe86a';
  let s = `<ellipse cx='20' cy='32' rx='14' ry='3' fill='#000' opacity='0.18'/>`;
  s += `<ellipse cx='20' cy='14.5' rx='6.5' ry='5' fill='${sigil}' opacity='0.14'/>`;
  s += `<rect x='11' y='22' width='18' height='10' fill='${stone}'/>`;
  s += `<rect x='11' y='22' width='18' height='2' fill='${stoneL}'/>`;
  s += `<polygon points='19,22 21,22 20.5,32 19.5,32' fill='${dark}'/>`;
  s += `<rect x='11' y='22' width='18' height='10' fill='none' stroke='${stoneD}' stroke-width='0.8'/>`;
  s += `<polygon points='20,10 25,18 15,18' fill='none' stroke='${sigil}' stroke-width='1.4'/>`;
  s += `<circle cx='20' cy='15.3' r='1.6' fill='${sigil}' opacity='0.85'/>`;
  s += `<rect x='12.5' y='18.5' width='1.6' height='4' fill='${candle}'/><polygon points='13.3,15.5 12.3,18.5 14.3,18.5' fill='${flame}'/>`;
  s += `<rect x='25.9' y='18.5' width='1.6' height='4' fill='${candle}'/><polygon points='26.7,15.5 25.7,18.5 27.7,18.5' fill='${flame}'/>`;
  return wrap(s);
};

// cult_meeting_place (The Barrow Circle) — a ring of standing stones on a misty grassy barrow.
const cult_meeting_place = () => {
  const stone = '#8f8a80', stoneD = '#5f5b52', stoneL = '#a8a294', grass = '#6f8a5a', mist = '#9ac0d6';
  const megalith = (x, y, w, h, f) =>
    `<rect x='${x}' y='${y}' width='${w}' height='${h}' rx='1.4' fill='${f}'/>` +
    `<rect x='${x}' y='${y}' width='${(w * 0.4).toFixed(1)}' height='${h}' rx='1.4' fill='${stoneL}' opacity='0.5'/>`;
  let s = `<ellipse cx='20' cy='31' rx='18' ry='7' fill='${grass}'/>`;
  s += `<ellipse cx='20' cy='31' rx='18' ry='7' fill='none' stroke='#5a7248' stroke-width='0.8' opacity='0.5'/>`;
  s += `<ellipse cx='20' cy='28' rx='12' ry='4' fill='${mist}' opacity='0.25'/>`;
  s += megalith(14, 9, 4, 12, stone) + megalith(22, 9, 4, 12, stone);
  s += megalith(7, 15, 4, 11, stoneD) + megalith(29, 15, 4, 11, stoneD);
  s += megalith(11, 22, 4, 9, stone) + megalith(25, 22, 4, 9, stone);
  return wrap(s);
};

// corrupted_lighthouse — banded lighthouse on sea rocks, lantern room + sickly green twin beams.
const corrupted_lighthouse = () => {
  const tower = '#c9c2b4', towerD = '#8f887a', band = '#7a3a3a', dark = '#241f1a', beam = '#7fe0a0', lantern = '#8fffb0', rock = '#5f5a52';
  let s = `<polygon points='23,10 40,4 40,14' fill='${beam}' opacity='0.32'/>`;
  s += `<polygon points='17,10 0,4 0,14' fill='${beam}' opacity='0.26'/>`;
  s += `<path d='M4 34 L9 28 L16 31 L24 28 L31 31 L36 34 Z' fill='${rock}'/>`;
  s += `<polygon points='16,12 24,12 26,32 14,32' fill='${tower}'/>`;
  s += `<polygon points='20,12 24,12 26,32 20,32' fill='${towerD}' opacity='0.5'/>`;
  s += `<polygon points='15.2,18 24.8,18 25.1,21 14.9,21' fill='${band}'/>`;
  s += `<polygon points='14.6,25 25.4,25 25.7,28 14.3,28' fill='${band}'/>`;
  s += `<rect x='16' y='7' width='8' height='6' fill='${dark}'/>`;
  s += `<rect x='16.5' y='8' width='7' height='4' fill='${lantern}'/>`;
  s += `<polygon points='15,7 25,7 20,3' fill='${towerD}'/>`;
  return wrap(s);
};

// mourn_peak_summit — a jagged dark peak with a violet cosmic rift tearing the sky above.
const mourn_peak_summit = () => {
  const rock = '#4a4652', rockD = '#2f2b38', snowCap = '#d6d2df', rift = '#8a5fd0', star = '#e0d0ff';
  let s = `<ellipse cx='21' cy='9' rx='8' ry='6' fill='${rift}' opacity='0.16'/>`;
  s += `<polygon points='20,4 34,34 6,34' fill='${rock}'/>`;
  s += `<polygon points='20,4 34,34 22,34' fill='${rockD}'/>`;
  s += `<polygon points='20,4 26,15 22,13 20,17 17,12 14,15' fill='${snowCap}'/>`;
  s += `<polygon points='9,20 17,34 1,34' fill='${rockD}'/>`;
  s += `<polygon points='20,4 34,34 6,34' fill='none' stroke='#1a1720' stroke-width='1'/>`;
  s += `<polygon points='20,3 24,9 21,12 25,15 19,14 17,9' fill='${rift}' opacity='0.85'/>`;
  s += `<circle cx='20' cy='6' r='0.7' fill='${star}'/><circle cx='23' cy='10' r='0.6' fill='${star}'/><circle cx='19' cy='11' r='0.5' fill='${star}'/>`;
  return wrap(s);
};

// Every milestone-POI spawn id that has a distinctive builder above. A milestone
// POI whose tile.poi is NOT one of these keys still renders the generic flag
// (renderer-tolerance / backward-compat: unknown ids must keep working). Mirrored
// by POI_SPRITE_TYPES in src/audits/context.js (MAP-02 coverage check).
const MILESTONE_POI_SPRITES = {
  goblin_hideout, shadow_fortress, sandstorm_hideout, sunken_spire, glacier_hollow,
  silent_steading, famine_barrow, abandoned_well, grimstead_cellar, ironhold_ruins,
  rot_tunnels, gear_end_sewers, coghill_foundry, desecrated_shrine, cult_meeting_place,
  corrupted_lighthouse, mourn_peak_summit,
};

// --- public API (memoised) ---------------------------------------------------
const _bgCache = new Map();
const _poiCache = new Map();

export function biomeBackground(tile, x = 0, y = 0) {
  const seed = variantSeed(x, y);
  let key, build;
  if (tile.isLake) { key = `lake|${seed}`; build = () => lake(seed); }
  else if (tile.biome === 'water') { key = `water|${seed}`; build = () => water(seed); }
  else if (tile.biome === 'beach' && tile.beachDirection != null) { key = `beach|${tile.beachDirection}`; build = () => beach(tile.beachDirection); }
  else if (tile.biome === 'desert') { key = `desert|${seed}`; build = () => desert(seed); }
  else if (tile.biome === 'swamp') { key = `swamp|${seed}`; build = () => swamp(seed); }
  else if (tile.biome === 'snow') { key = `snow|${seed}`; build = () => snow(seed); }
  else if (tile.biome === 'woodland') { key = `woodland|${seed}`; build = () => woodland(seed); }
  else { key = `plains|${seed}`; build = () => plains(seed); }
  let bg = _bgCache.get(key);
  if (bg === undefined) { bg = build(); _bgCache.set(key, bg); }
  return bg;
}

export function poiSprite(tile) {
  let key, build;
  if (tile.poi === 'town') { key = `town|${tile.townSize || 'village'}`; build = () => townSprite(tile.townSize || 'village'); }
  else if (tile.poi === 'forest') {
    const v = variantSeed(tile.x || 0, tile.y || 0) % 8;
    if (tile.biome === 'beach') {
      // Retroactive heal (playtest 2026-07-06): old saves have forest POIs on
      // beach tiles; clamp the trees to the sand half so none stand in the sea.
      // New maps no longer place forests on beach at all.
      const dir = tile.beachDirection != null ? tile.beachDirection : 2;
      key = `forest-b|${dir}|${v}`; build = () => beachForest(v, dir);
    }
    else if (tile.biome === 'desert') { key = `forest-d|${v}`; build = () => desertForest(v); }
    else if (tile.biome === 'snow') { key = `forest-s|${v}`; build = () => snowForest(v); }
    else { key = `forest|${v}`; build = () => forest(v); }
  }
  else if (tile.poi === 'mountain') {
    const v = variantSeed(tile.x || 0, tile.y || 0) % MOUNTAIN_VARIANTS.length;
    // Desert mountains are sandstone mesas (playtest 2026-07-05: snow caps over
    // the dunes looked wrong); snow/temperate keep the classic snow-capped rock.
    if (tile.biome === 'desert') { key = `mountain-d|${v}`; build = () => desertMountain(v); }
    else { key = `mountain|${v}`; build = () => mountain(v); }
  }
  else if (tile.poi === 'hills') {
    const v = variantSeed(tile.x || 0, tile.y || 0) % HILL_VARIANTS.length;
    if (tile.biome === 'desert') { key = `hills-d|${v}`; build = () => sandHills(v); }
    else if (tile.biome === 'snow') { key = `hills-s|${v}`; build = () => snowHills(v); }
    else { key = `hills|${v}`; build = () => hills(v); }
  }
  else if (tile.poi === 'cave_entrance') { key = 'cave'; build = cave; }
  else if (tile.poi === 'ruins') { key = 'ruins'; build = ruins; }
  else if (MILESTONE_POI_SPRITES[tile.poi]) {
    // Distinctive per-location sprite for an authored milestone POI (keyed on the
    // spawn id stamped into tile.poi). Cache key is the id — each builder is
    // parameterless and deterministic.
    key = `mpoi|${tile.poi}`; build = MILESTONE_POI_SPRITES[tile.poi];
  }
  else if (tile.milestonePoi) { key = 'milestone'; build = milestone; } // fallback: unknown milestone POI id -> generic flag
  else return null;
  let s = _poiCache.get(key);
  if (s === undefined) { s = build(); _poiCache.set(key, s); }
  return s;
}

// gallery accessors for the preview
export const sampleBiomes = {
  plains: () => plains(variantSeed(1, 1)),
  woodland: () => woodland(variantSeed(8, 2)),
  water: () => water(variantSeed(2, 1)),
  lake: () => lake(variantSeed(3, 1)),
  desert: () => desert(variantSeed(5, 2)),
  swamp: () => swamp(variantSeed(6, 2)),
  snow: () => snow(variantSeed(7, 2)),
  'beach N': () => beach(0),
  'beach E': () => beach(1),
  'beach S': () => beach(2),
  'beach W': () => beach(3),
};
export const samplePois = {
  forest: () => forest(0),
  'forest 2': () => forest(3),
  mountain: () => mountain(0),
  'mtn twin': () => mountain(1),
  'mtn ridge': () => mountain(2),
  hills: () => hills(0),
  'hills 2': () => hills(1),
  'hills 3': () => hills(2),
  cave: () => cave(),
  ruins: () => ruins(),
  hamlet: () => townSprite('hamlet'),
  village: () => townSprite('village'),
  town: () => townSprite('town'),
  city: () => townSprite('city'),
  milestone: () => milestone(),
  // distinctive milestone-POI sprites (one per authored spawn id)
  goblin_hideout: () => goblin_hideout(),
  shadow_fortress: () => shadow_fortress(),
  sandstorm_hideout: () => sandstorm_hideout(),
  sunken_spire: () => sunken_spire(),
  glacier_hollow: () => glacier_hollow(),
  silent_steading: () => silent_steading(),
  famine_barrow: () => famine_barrow(),
  abandoned_well: () => abandoned_well(),
  grimstead_cellar: () => grimstead_cellar(),
  ironhold_ruins: () => ironhold_ruins(),
  rot_tunnels: () => rot_tunnels(),
  gear_end_sewers: () => gear_end_sewers(),
  coghill_foundry: () => coghill_foundry(),
  desecrated_shrine: () => desecrated_shrine(),
  cult_meeting_place: () => cult_meeting_place(),
  corrupted_lighthouse: () => corrupted_lighthouse(),
  mourn_peak_summit: () => mourn_peak_summit(),
};
