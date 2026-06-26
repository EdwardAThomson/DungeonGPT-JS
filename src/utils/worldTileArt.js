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
const beach = (dir) => {
  let waterRect = '';
  let shore = '';
  if (dir === 0) { waterRect = `<rect x='0' y='0' width='40' height='20' fill='${C.water}'/>`; shore = `<path d='M0 20 q10 -3 20 0 t20 0' stroke='${C.foam}' stroke-width='2' fill='none' opacity='0.7'/>`; }
  else if (dir === 1) { waterRect = `<rect x='20' y='0' width='20' height='40' fill='${C.water}'/>`; shore = `<path d='M20 0 q3 10 0 20 t0 20' stroke='${C.foam}' stroke-width='2' fill='none' opacity='0.7'/>`; }
  else if (dir === 2) { waterRect = `<rect x='0' y='20' width='40' height='20' fill='${C.water}'/>`; shore = `<path d='M0 20 q10 3 20 0 t20 0' stroke='${C.foam}' stroke-width='2' fill='none' opacity='0.7'/>`; }
  else { waterRect = `<rect x='0' y='0' width='20' height='40' fill='${C.water}'/>`; shore = `<path d='M20 0 q-3 10 0 20 t0 20' stroke='${C.foam}' stroke-width='2' fill='none' opacity='0.7'/>`; }
  return wrap(`<rect width='40' height='40' fill='${C.sand}'/>${sandNoise(dir)}${waterRect}${shore}`);
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
// mountains visually merge into a range.
const MOUNTAIN_VARIANTS = [
  // single peak
  `<polygon points='20,4 36,34 4,34' fill='${C.rock}'/>` +
  `<polygon points='20,4 36,34 24,34' fill='${C.rockDark}'/>` +
  `<polygon points='20,4 27,17 13,17' fill='${C.snow}'/>` +
  outline('20,4 36,34 4,34'),
  // twin peaks
  `<polygon points='13,9 24,34 2,34' fill='${C.rock}'/>` +
  `<polygon points='27,6 38,34 16,34' fill='${C.rockDark}'/>` +
  `<polygon points='27,6 33,18 21,18' fill='${C.snow}'/>` +
  `<polygon points='13,9 18,19 8,19' fill='${C.snow}'/>` +
  outline('13,9 24,34 2,34') + outline('27,6 38,34 16,34'),
  // wide ridge (edge-to-edge -> connects with neighbours)
  `<polygon points='0,35 10,16 20,27 30,13 40,35' fill='${C.rock}'/>` +
  `<polygon points='20,27 30,13 40,35' fill='${C.rockDark}'/>` +
  `<polygon points='10,16 14,23 6,23' fill='${C.snow}'/>` +
  `<polygon points='30,13 34,21 26,21' fill='${C.snow}'/>` +
  `<polyline points='0,35 10,16 20,27 30,13 40,35' fill='none' stroke='${EDGE}' stroke-width='1.1' stroke-linejoin='round'/>`,
  // peak with a foothill
  `<polygon points='23,6 38,34 8,34' fill='${C.rock}'/>` +
  `<polygon points='23,6 38,34 27,34' fill='${C.rockDark}'/>` +
  `<polygon points='23,6 29,18 17,18' fill='${C.snow}'/>` +
  `<polygon points='9,21 19,34 0,34' fill='${C.rock}'/>` +
  `<polygon points='9,21 19,34 12,34' fill='${C.rockDark}'/>` +
  outline('23,6 38,34 8,34') + outline('9,21 19,34 0,34'),
];
const mountain = (v = 0) => wrap(MOUNTAIN_VARIANTS[v % MOUNTAIN_VARIANTS.length]);

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
    if (tile.biome === 'desert') { key = `forest-d|${v}`; build = () => desertForest(v); }
    else if (tile.biome === 'snow') { key = `forest-s|${v}`; build = () => snowForest(v); }
    else { key = `forest|${v}`; build = () => forest(v); }
  }
  else if (tile.poi === 'mountain') { const v = variantSeed(tile.x || 0, tile.y || 0) % MOUNTAIN_VARIANTS.length; key = `mountain|${v}`; build = () => mountain(v); }
  else if (tile.poi === 'hills') {
    const v = variantSeed(tile.x || 0, tile.y || 0) % HILL_VARIANTS.length;
    if (tile.biome === 'desert') { key = `hills-d|${v}`; build = () => sandHills(v); }
    else if (tile.biome === 'snow') { key = `hills-s|${v}`; build = () => snowHills(v); }
    else { key = `hills|${v}`; build = () => hills(v); }
  }
  else if (tile.poi === 'cave_entrance') { key = 'cave'; build = cave; }
  else if (tile.poi === 'ruins') { key = 'ruins'; build = ruins; }
  else if (tile.milestonePoi) { key = 'milestone'; build = milestone; }
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
};
