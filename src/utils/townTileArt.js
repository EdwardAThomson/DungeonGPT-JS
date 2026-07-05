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
  // canal water: slightly darker and calmer than open sea/lake water so channels
  // read as engineered waterways (water towns #65, Phase 4)
  canal: '#386da8',
  // shore sand — softer than the desert ground so coastlines don't read as a harsh
  // yellow border (mirrors worldTileArt's toned-down beach sand).
  beach: '#dccfac', beachDark: '#c6b78d', beachLight: '#ece1c2',
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
  inn: '#b5762d', tavern: '#b3672f',  // amber / warm ale-brown
  shop: '#3f7d6e',       // teal
  market: '#cf8a3a',     // market orange
  temple: '#c9b04a',     // temple gold
  bank: '#bdb39a',       // pale stone
  guild: '#5a6fae', library: '#4f63a0', // guild + library blues
  archives: '#6a5a3a', // records/scrolls umber (kept off the blues so it reads apart from the guild)
  blacksmith: '#5a5550', foundry: '#4f4a45',                 // dark forge
  barn: '#8a5a32', warehouse: '#7a5230',                     // timber browns
  alchemist: '#7a5a9c',  // arcane purple
  // new building types (generated art) — distinct roof colours so each reads apart
  apothecary: '#5a8c5a',   // herbal green
  fletcher: '#6f7a3a',     // bowyer olive
  harbormaster: '#3f6f9c', // nautical blue
  boathouse: '#4a7d8f',    // weathered slipway blue-grey (canal city, water towns #65)
  jail: '#4a4a4a',         // iron grey
  magetower: '#6a4fae',    // arcane violet
  mill: '#b08a4a',         // wheat tan
  shrine: '#b59a3a',       // pale gold (smaller than a temple)
  stables: '#8a6a3a',      // stable brown
  tailor: '#9c6a8a',       // cloth mauve
  townhall: '#9a8a5a',     // civic stone
  workshop: '#4a8c8c',     // patina copper (tinker's workshop, deliberately un-medieval)
};

// --- theme materials (backlog #64, tier 1) ------------------------------------
// Palette-only theming for buildings: every silhouette stays byte-for-byte identical;
// only the material colours shift. Each themed roof is the temperate roof mixed toward
// a biome tint, and since walls/doors derive from the roof via shade(), the whole
// building follows. Per-building colour identity survives the mix, so the legend still
// reads. Unknown/missing themes take the temperate branch (no material entry), which
// keeps old cached town maps rendering exactly as before.
const THEME_MATERIALS = {
  // pale clay tint, mixed hard: most roofs are already warm browns/reds, so a
  // dark terracotta tint moved them a few RGB points and desert towns looked
  // identical to grassland (playtest 2026-07-05). Mixing 60% toward pale clay
  // lands every building in an unmistakable adobe/tan family (walls follow,
  // they are shaded from the roof) while lightness still separates the types.
  desert: { tint: '#c47a4a', amount: 0.55, outline: '#4a3626' },
  // dark timber tint so buildings sit as darker wood against the white ground; the
  // cap flag adds a white snow band across the roofline (palette-level dressing, not
  // a new shape: it is invisible where it overhangs the already-white snow ground)
  snow: { tint: '#4a4038', amount: 0.35, cap: true, outline: '#33404c' },
};
// One shared roofline band for snow towns, drawn over the finished building body.
const SNOW_CAP = `<path d='M5 12.5 q11 -5 22 0 l0 2.8 q-11 -5 -22 0 z' fill='#ffffff' opacity='0.75'/>`;

// Mix two '#rrggbb' colours; t is the weight of the tint (t=0 returns the base).
const mix = (base, tint, t) => {
  const a = parseInt(base.slice(1), 16);
  const b = parseInt(tint.slice(1), 16);
  const ch = (sh) => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t);
  const hex = (v) => v.toString(16).padStart(2, '0');
  return `#${hex(ch(16))}${hex(ch(8))}${hex(ch(0))}`;
};

// Ground fill colour for a theme (used under buildings and walls).
const themeGroundFill = (theme) => theme === 'desert' ? C.sand : theme === 'snow' ? C.snow : C.grass;

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

// dirt/stone are split into inner (unwrapped SVG) + wrapped forms so the quay-edge
// overlay (water towns #65, Phase 4) can compose on the identical base markup: a path
// with no waterway neighbour still emits byte-for-byte the pre-canal string.
const dirtInner = (seed) => {
  const r = rng(seed + 2);
  let marks = '';
  for (let i = 0; i < 9; i++) {
    const x = (r() * 30 + 1).toFixed(1);
    const y = (r() * 30 + 1).toFixed(1);
    const c = r() > 0.5 ? C.dirtDark : C.dirtLight;
    marks += `<circle cx='${x}' cy='${y}' r='${(r() * 1.1 + 0.5).toFixed(1)}' fill='${c}'/>`;
  }
  return `<rect width='32' height='32' fill='${C.dirt}'/>${marks}`;
};
const dirt = (seed) => wrap(dirtInner(seed));

// shore sand: the walkable land/water transition for lakefront + coastal towns. Soft
// sand base with a few pebbles and faint tide lines, deliberately calmer than the desert
// ground tile so the coastline reads as a gentle beach rather than a bright border.
const beach = (seed) => {
  const r = rng(seed + 9);
  let marks = '';
  for (let i = 0; i < 7; i++) {
    const x = (r() * 30 + 1).toFixed(1);
    const y = (r() * 30 + 1).toFixed(1);
    const c = r() > 0.5 ? C.beachDark : C.beachLight;
    marks += `<circle cx='${x}' cy='${y}' r='${(r() * 0.9 + 0.4).toFixed(1)}' fill='${c}'/>`;
  }
  for (let i = 0; i < 2; i++) {
    const y = 10 + i * 11 + Math.floor(r() * 3);
    marks += `<path d='M0 ${y} q8 -2 16 0 t16 0' stroke='${C.beachDark}' stroke-width='1' fill='none' opacity='0.45'/>`;
  }
  return wrap(`<rect width='32' height='32' fill='${C.beach}'/>${marks}`);
};

// water is split into inner + wrapped forms (like dirt/stone) so the jetty tile can
// compose its plank finger over the identical open-water base: a plain water tile
// still emits byte-for-byte the pre-jetty string.
const waterInner = (seed) => {
  const r = rng(seed + 3);
  let waves = '';
  for (let i = 0; i < 3; i++) {
    const y = 7 + i * 9 + Math.floor(r() * 3);
    waves += `<path d='M0 ${y} q8 -3 16 0 t16 0' stroke='${C.waterLight}' stroke-width='1.4' fill='none' opacity='0.8'/>`;
  }
  return `<rect width='32' height='32' fill='${C.water}'/>${waves}<path d='M0 4 q8 -3 16 0 t16 0' stroke='${C.foam}' stroke-width='1' fill='none' opacity='0.5'/>`;
};
const water = (seed) => wrap(waterInner(seed));

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

const stoneInner = (seed, light) => {
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
  return `<rect width='32' height='32' fill='${C.mortar}'/><rect width='32' height='32' fill='${base}' opacity='0.25'/>${cobbles}`;
};
const stone = (seed, light) => wrap(stoneInner(seed, light));

const bridge = () => {
  let planks = '';
  for (let i = 0; i < 5; i++) {
    const y = i * 6.4;
    planks += `<rect x='0' y='${y}' width='32' height='6' fill='${C.plank}'/><rect x='0' y='${y + 6}' width='32' height='0.8' fill='${C.plankGap}'/>`;
  }
  return wrap(`${planks}<rect x='1' y='0' width='1.6' height='32' fill='${C.plankGap}' opacity='0.7'/><rect x='29.4' y='0' width='1.6' height='32' fill='${C.plankGap}' opacity='0.7'/>`);
};

// --- jetties (water towns plan §1b) --------------------------------------------
// A jetty is a wooden finger over the water, not a crossing: dock structures near
// harbormasters (and canal-side stubs) are laid as 'bridge' tiles by the generator, so
// the distinction is made at RENDER TIME from the neighbour types the wall autotiler
// already receives (view-layer only: every existing dock re-skins retroactively, no
// map data changes). See jettyInfo() below for the detection rule.
//
// Art: a weathered plank finger, slightly narrower than a bridge deck (13px vs the
// bridge's full 32 / the canal bridge's 23), with gaps between planks showing the
// water beneath, side beams, a mooring post standing in the water at the open end,
// and a rope coil near the landward end. Drawn canonically with the water end at N
// and rotated for the other orientations. `waterway` picks the calmer canal-water
// base so canal-side jetties sit on canal colour, sea jetties on open water.
const JETTY = {
  plankA: '#9c8a6a', plankB: '#8a795e', // sun-bleached, weathered wood
  beam: '#5d4a30', post: '#4a3a26', postTop: '#7a6448', rope: '#c9b088',
};
export const jettyTile = (dir = 'n', seed = 0, waterway = false) => {
  const base = waterway ? canalWaterInner(seed) : waterInner(seed);
  const rot = { e: 'rotate(90 16 16)', s: 'rotate(180 16 16)', w: 'rotate(270 16 16)' }[dir] || '';
  // side beams under the deck edges
  let deck = `<rect x='9.1' y='5' width='0.9' height='27' fill='${JETTY.beam}' opacity='0.85'/>` +
    `<rect x='22' y='5' width='0.9' height='27' fill='${JETTY.beam}' opacity='0.85'/>`;
  // planks from the tip (water shows past y=5) back to the landward tile edge, with
  // gaps between them so the water reads through the boards
  for (let i = 0; i < 9; i++) {
    const y = (5 + i * 3.1).toFixed(1);
    deck += `<rect x='9.5' y='${y}' width='13' height='2.3' rx='0.4' fill='${i % 2 ? JETTY.plankB : JETTY.plankA}'/>`;
  }
  // mooring post standing in the water beside the open end, plus a rope coil on deck
  deck += `<circle cx='24.6' cy='6.6' r='1.9' fill='${JETTY.post}'/><circle cx='24.1' cy='6.1' r='0.8' fill='${JETTY.postTop}'/>` +
    `<path d='M22.8 7.4 q-1.6 1.2 -3.3 0.6' stroke='${JETTY.rope}' stroke-width='0.8' fill='none'/>` +
    `<circle cx='12.6' cy='26.5' r='1.7' fill='none' stroke='${JETTY.rope}' stroke-width='1'/>` +
    `<circle cx='12.6' cy='26.5' r='0.4' fill='${JETTY.rope}'/>`;
  return wrap(base + (rot ? `<g transform='${rot}'>${deck}</g>` : deck));
};

// Render-time jetty detection for a plain 'bridge' tile, from the SAME neighbour-type
// object ({ n, e, s, w } of tile types) the wall autotiler already receives — no new
// plumbing, so every existing caller (live TownMapDisplay included) gets jetties for
// free and callers passing no neighbours keep the historical bridge art.
//
// Rule (maintainer, WATER_TOWNS_PLAN §1b): a bridge is a CROSSING when walkable land
// or path sits at both ends of its walk axis (or when the walk continues on both axes:
// a bend/junction); it is a JETTY when its walk axis ends in water (or nothing, at a
// map edge) on exactly ONE side and land on the other — a finger over the water. The
// walk axis is where path/bridge neighbours continue; failing that, the axis
// perpendicular to flanking water; failing that, N-S (the classic bridge reading).
// Returns { waterEnd: 'n'|'e'|'s'|'w' } for a jetty, null for a crossing/no-info.
export function jettyInfo(tile, neighbours = {}) {
  if (!tile || tile.type !== 'bridge') return null;
  const conn = (t) => t === 'bridge' || t === 'dirt_path' || t === 'stone_path' || t === 'town_square';
  const wat = (t) => !t || t === 'water';
  const { n, e, s, w } = neighbours;
  const nsConn = conn(n) || conn(s);
  const ewConn = conn(e) || conn(w);
  if (nsConn && ewConn) return null; // the walk continues on both axes: a bend/junction, not a finger
  let axis;
  if (nsConn) axis = 'ns';
  else if (ewConn) axis = 'ew';
  else if (wat(e) && wat(w) && !(wat(n) && wat(s))) axis = 'ns'; // flanked by water: the walk runs the dry axis
  else if (wat(n) && wat(s) && !(wat(e) && wat(w))) axis = 'ew';
  else axis = 'ns';
  const [a, b, sideA, sideB] = axis === 'ns' ? [n, s, 'n', 's'] : [e, w, 'e', 'w'];
  if (wat(a) && !wat(b)) return { waterEnd: sideA };
  if (wat(b) && !wat(a)) return { waterEnd: sideB };
  // land at both ends = crossing; water/nothing at both ends = no info (an orphan or a
  // caller with no neighbours) — both keep the historical bridge art
  return null;
}

// --- canals (autotiled) --------------------------------------------------------
// Water towns #65, Phase 4. Canal/fork water carries `waterway: true`; the renderer
// derives everything below at render time from a 4-bit waterway-neighbour mask
// (N=1, E=2, S=4, W=8, the wall autotiler's technique), so channels read as CHANNELS
// (stone banks, bends, junctions, mouths), not ponds, and junction shapes follow any
// future generation change for free. Neighbouring basin/sea water and bridge tiles
// count as waterway neighbours (a canal mouth renders open, and the channel continues
// under a bridge); the masking itself lives in waterwayMask() below.

// Masonry tone of the banks per town theme: default stone, desert sandstone, snow
// icy grey. Unknown/missing themes take the temperate stone, mirroring THEME_MATERIALS.
const CANAL_BANKS = {
  grassland: { m: '#c2bba9', d: '#a29a88', lip: '#8f8775' },
  desert: { m: '#d9bc82', d: '#bf9f60', lip: '#a5854a' },
  snow: { m: '#ccd6de', d: '#aebac5', lip: '#8fa0ac' },
};
const canalBankPalette = (theme) => CANAL_BANKS[theme] || CANAL_BANKS.grassland;

// Calmer canal-water base: narrower wave strokes on a slightly darker blue, so canal
// water reads distinct from open sea/lake water even before the banks are drawn.
const canalWaterInner = (seed) => {
  const r = rng(seed + 11);
  let waves = '';
  for (let i = 0; i < 3; i++) {
    const y = 8 + i * 8 + Math.floor(r() * 3);
    waves += `<path d='M0 ${y} q8 -2 16 0 t16 0' stroke='${C.waterLight}' stroke-width='0.8' fill='none' opacity='0.55'/>`;
  }
  return `<rect width='32' height='32' fill='${C.canal}'/>${waves}`;
};

const BANK_T = 4.5;   // bank strip thickness
const BANK_LIP = 1.3; // darker lip line on the water-facing edge

// Directional canal tile. Dry sides (mask bit unset) get a stone bank strip with a
// darker lip on the waterside and two mortar joints; the 16 masks cover straight runs
// (5, 10), bends (3/6/9/12), T-junctions (7/11/13/14), the 4-way cross (15), dead
// ends/mouth stubs (1/2/4/8) and a fully enclosed pool (0). Basin treatment falls out
// of the same rule: a tile with 3-4 waterway neighbours renders as open harbour water
// with a bank only on its dry edge plus small corner nibs where two wet edges meet
// (the masonry ring continuing past the tile).
export const canalTile = (mask, theme = 'grassland', seed = 0) => {
  const pal = canalBankPalette(theme);
  const t = BANK_T;
  const lw = BANK_LIP;
  const wet = { n: !!(mask & 1), e: !!(mask & 2), s: !!(mask & 4), w: !!(mask & 8) };
  let banks = '';
  // two mortar joints per strip so the banks read as laid masonry, not a flat border
  const jointsH = (y) => `<rect x='10' y='${y}' width='1' height='2.5' fill='${pal.d}'/><rect x='21' y='${y}' width='1' height='2.5' fill='${pal.d}'/>`;
  const jointsV = (x) => `<rect x='${x}' y='10' width='2.5' height='1' fill='${pal.d}'/><rect x='${x}' y='21' width='2.5' height='1' fill='${pal.d}'/>`;
  if (!wet.n) banks += `<rect x='0' y='0' width='32' height='${t}' fill='${pal.m}'/><rect x='0' y='${t - lw}' width='32' height='${lw}' fill='${pal.lip}'/>` + jointsH(0.7);
  if (!wet.s) banks += `<rect x='0' y='${32 - t}' width='32' height='${t}' fill='${pal.m}'/><rect x='0' y='${32 - t}' width='32' height='${lw}' fill='${pal.lip}'/>` + jointsH(28.8);
  if (!wet.w) banks += `<rect x='0' y='0' width='${t}' height='32' fill='${pal.m}'/><rect x='${t - lw}' y='0' width='${lw}' height='32' fill='${pal.lip}'/>` + jointsV(0.7);
  if (!wet.e) banks += `<rect x='${32 - t}' y='0' width='${t}' height='32' fill='${pal.m}'/><rect x='${32 - t}' y='0' width='${lw}' height='32' fill='${pal.lip}'/>` + jointsV(28.8);
  // corner nibs: only mostly-open tiles (3-4 wet neighbours: basin water, junction
  // hearts) get them, at corners where two wet edges meet
  let nibs = '';
  const count = wet.n + wet.e + wet.s + wet.w;
  if (count >= 3) {
    const nib = (x, y) => `<rect x='${x}' y='${y}' width='3.2' height='3.2' rx='1' fill='${pal.m}' stroke='${pal.lip}' stroke-width='0.6'/>`;
    // A nib is the CORNER OF A BANK poking into the pool, so it only exists when the
    // diagonal behind it is dry land; when the diagonal is also water (mid-channel
    // junctions in 2-wide fork rivers) drawing one strands a stone dot in open water.
    if (wet.w && wet.n && !(mask & 128)) nibs += nib(0.6, 0.6);
    if (wet.n && wet.e && !(mask & 16)) nibs += nib(28.2, 0.6);
    if (wet.e && wet.s && !(mask & 32)) nibs += nib(28.2, 28.2);
    if (wet.s && wet.w && !(mask & 64)) nibs += nib(0.6, 28.2);
  }
  return wrap(canalWaterInner(seed) + banks + nibs);
};

// Bridge over a canal: the channel continues beneath the plank span. Orientation is
// derived from which neighbours are waterway water: a N-S channel gets a horizontal
// deck band (walk E-W) with water showing at the top and bottom edges; an E-W channel
// gets a vertical deck (walk N-S, the classic bridge's reading) with water at the
// left and right edges. Ties/no-water default to the E-W channel so the deck matches
// the classic bridge tile's walk axis.
export const canalBridgeTile = (wetMask, seed = 0) => {
  const ns = (wetMask & 1 ? 1 : 0) + (wetMask & 4 ? 1 : 0);
  const ew = (wetMask & 2 ? 1 : 0) + (wetMask & 8 ? 1 : 0);
  let deck = '';
  if (ns > ew) {
    // channel runs N-S under an E-W walk: horizontal deck band, vertical planks
    const y0 = 4.5, h = 23;
    for (let i = 0; i < 5; i++) {
      const x = i * 6.4;
      deck += `<rect x='${x}' y='${y0}' width='6' height='${h}' fill='${C.plank}'/><rect x='${x + 6}' y='${y0}' width='0.8' height='${h}' fill='${C.plankGap}'/>`;
    }
    deck += `<rect x='0' y='${y0 + 0.5}' width='32' height='1.6' fill='${C.plankGap}' opacity='0.7'/><rect x='0' y='${y0 + h - 2.1}' width='32' height='1.6' fill='${C.plankGap}' opacity='0.7'/>`;
  } else {
    // channel runs E-W under a N-S walk: vertical deck band, horizontal planks
    const x0 = 4.5, w = 23;
    for (let i = 0; i < 5; i++) {
      const y = i * 6.4;
      deck += `<rect x='${x0}' y='${y}' width='${w}' height='6' fill='${C.plank}'/><rect x='${x0}' y='${y + 6}' width='${w}' height='0.8' fill='${C.plankGap}'/>`;
    }
    deck += `<rect x='${x0 + 0.5}' y='0' width='1.6' height='32' fill='${C.plankGap}' opacity='0.7'/><rect x='${x0 + w - 2.1}' y='0' width='1.6' height='32' fill='${C.plankGap}' opacity='0.7'/>`;
  }
  return wrap(canalWaterInner(seed) + deck);
};

// Quay edge treatment: a subtle stone lip (2.6px band in the theme's masonry lip tone,
// with a couple of bollard dots) drawn on each wet side of a path tile that borders
// waterway water. Composes over the untouched path base, so paths away from canals
// stay byte-identical.
const quayOverlay = (qmask, theme) => {
  const pal = canalBankPalette(theme);
  const b = 2.6;
  const post = (cx, cy) => `<circle cx='${cx}' cy='${cy}' r='0.9' fill='#4d4738'/>`;
  let out = '';
  if (qmask & 1) out += `<rect x='0' y='0' width='32' height='${b}' fill='${pal.lip}'/>` + post(9, 1.3) + post(23, 1.3);
  if (qmask & 2) out += `<rect x='${32 - b}' y='0' width='${b}' height='32' fill='${pal.lip}'/>` + post(30.7, 9) + post(30.7, 23);
  if (qmask & 4) out += `<rect x='0' y='${32 - b}' width='32' height='${b}' fill='${pal.lip}'/>` + post(9, 30.7) + post(23, 30.7);
  if (qmask & 8) out += `<rect x='0' y='0' width='${b}' height='32' fill='${pal.lip}'/>` + post(1.3, 9) + post(1.3, 23);
  return out;
};

// Gallery/test accessor: a path tile with the quay lip applied (stone by default).
export const quayVariant = (qmask, theme = 'grassland', pathType = 'stone_path') =>
  wrap((pathType === 'dirt_path' ? dirtInner(variantSeed(2, 1)) : stoneInner(variantSeed(5, 1), true)) + quayOverlay(qmask, theme));

// Compute the 4-bit waterway-neighbour mask (N=1, E=2, S=4, W=8) for a tile from its
// four orthogonal neighbour TILES (types alone are not enough: the waterway flag is
// what distinguishes a canal from the sea). What counts as a wet neighbour depends on
// the tile itself:
// - canal/fork water (water + waterway): any water (sea, lake, basin) keeps the
//   channel open at a mouth, and bridge tiles continue the channel underneath;
// - a bridge with the waterway flag: waterway/basin/sea WATER neighbours give the
//   channel axis (adjacent bridges sit along the walk axis and must not count);
// - path tiles: only true waterway water earns a quay lip (a plain lake/sea shore
//   path stays a shore);
// - everything else: 0. Sea/lake water without the flag always returns 0, so plain
//   water tiles render exactly as before.
export function waterwayMask(tile, tiles = {}) {
  if (!tile) return 0;
  const isWater = (t) => !!t && t.type === 'water';
  let counts;
  if (tile.type === 'water' && tile.waterway) {
    counts = (t) => isWater(t) || (!!t && t.type === 'bridge');
  } else if (tile.type === 'bridge' && tile.waterway) {
    counts = isWater;
  } else if (tile.type === 'stone_path' || tile.type === 'dirt_path') {
    counts = (t) => isWater(t) && !!t.waterway;
  } else {
    return 0;
  }
  const ortho = (counts(tiles.n) ? 1 : 0) | (counts(tiles.e) ? 2 : 0) | (counts(tiles.s) ? 4 : 0) | (counts(tiles.w) ? 8 : 0);
  // Diagonal bits (16 NE, 32 SE, 64 SW, 128 NW) exist so junction hearts can tell a
  // bank corner (dry diagonal: draw the nib) from open water (wet diagonal: no nib).
  // A mid-channel nib reads as a bollard floating in the river (playtest 2026-07-06).
  const diag = (counts(tiles.ne) ? 16 : 0) | (counts(tiles.se) ? 32 : 0) | (counts(tiles.sw) ? 64 : 0) | (counts(tiles.nw) ? 128 : 0);
  return ortho | diag;
}

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
  // mill: a windmill — tapered tower, conical cap, four sails
  mill: (r) =>
    `<polygon points='11,27 13,12 19,12 21,27' fill='${shade(r, 0.85)}'/>` +
    `<polygon points='12,12 16,7 20,12' fill='${r}'/>` +
    `<rect x='14.5' y='21' width='3' height='6' fill='${shade(r, 0.5)}'/>` +
    `<g stroke='${shade(r, 0.5)}' stroke-width='1.4' stroke-linecap='round'>` +
    `<line x1='16' y1='13' x2='7' y2='6'/><line x1='16' y1='13' x2='25' y2='6'/>` +
    `<line x1='16' y1='13' x2='7' y2='20'/><line x1='16' y1='13' x2='25' y2='20'/></g>` +
    `<circle cx='16' cy='13' r='1.7' fill='${shade(r, 0.4)}'/>`,
  // apothecary: a shopfront with an awning and a hanging green potion-bottle sign
  apothecary: (r) =>
    `<rect x='8' y='13' width='16' height='13' rx='1' fill='${shade(r, 0.82)}'/>` +
    `<rect x='7' y='10' width='18' height='4' rx='1' fill='${r}'/>` +
    `<rect x='7' y='13' width='18' height='1.6' fill='#ffffff' opacity='0.12'/>` +
    `<rect x='10' y='16' width='4' height='4' fill='${shade(r, 1.15)}'/>` +
    door(r, 16, 3) +
    `<circle cx='22' cy='9' r='3' fill='#6fcf97'/><rect x='21.2' y='5.5' width='1.6' height='2' fill='#4a8c5a'/>`,
  // fletcher: a craft cottage with a bow + arrow sign
  fletcher: (r) =>
    `<rect x='8' y='12' width='16' height='14' rx='1' fill='${shade(r, 0.82)}'/>` +
    `<polygon points='6,13 16,7 26,13' fill='${r}'/>` +
    door(r, 10, 3) +
    `<path d='M21 9 q4 5 0 10' stroke='#caa15a' stroke-width='1.4' fill='none'/>` +
    `<line x1='21' y1='9' x2='21' y2='19' stroke='#8a6a3a' stroke-width='0.8'/>` +
    `<line x1='9' y1='22' x2='15' y2='22' stroke='#8a6a3a' stroke-width='1.2'/><polygon points='15,22 13,21 13,23' fill='#8a6a3a'/>`,
  // harbormaster: a quayside office with a lookout tower, flag and an anchor motif
  harbormaster: (r) =>
    `<rect x='6' y='14' width='14' height='12' rx='1' fill='${shade(r, 0.82)}'/>` +
    `<rect x='6' y='14' width='14' height='2' fill='#ffffff' opacity='0.14'/>` +
    `<rect x='19' y='8' width='7' height='18' fill='${shade(r, 0.7)}'/>` +
    `<rect x='19' y='8' width='7' height='2' fill='#ffffff' opacity='0.14'/>` +
    `<rect x='21' y='3' width='1.4' height='5' fill='#555'/><polygon points='22.4,3 27,4.5 22.4,6' fill='#c0504d'/>` +
    door(r, 11, 3) +
    `<circle cx='12' cy='20' r='2.2' fill='none' stroke='#cfd8dc' stroke-width='1'/><line x1='12' y1='17.3' x2='12' y2='22.4' stroke='#cfd8dc' stroke-width='1'/>`,
  // boathouse: a broad waterside shed — a wide slipway bay with plank doors and an
  // upturned hull drying beside it (nautical sibling of the harbormaster's office)
  boathouse: (r) =>
    `<rect x='5' y='12' width='22' height='14' rx='1' fill='${r}'/>` +
    `<rect x='5' y='12' width='22' height='2.2' fill='#ffffff' opacity='0.12'/>` +
    `<rect x='5' y='17' width='22' height='1.4' fill='${shade(r, 0.7)}'/>` +
    `<rect x='7.5' y='18.5' width='9' height='7.5' rx='0.8' fill='${shade(r, 0.45)}'/>` +
    `<line x1='12' y1='18.5' x2='12' y2='26' stroke='${shade(r, 0.7)}' stroke-width='0.8'/>` +
    `<path d='M18.5 23.5 q4 -3.2 8 0 l0 1.6 q-4 -3.2 -8 0 z' fill='#8a5a32'/>` +
    `<line x1='18.5' y1='24.6' x2='26.5' y2='24.6' stroke='#5d3a1c' stroke-width='0.7'/>` +
    `<circle cx='22' cy='14.6' r='1.7' fill='none' stroke='#e8e2d2' stroke-width='1'/>` +
    `<circle cx='22' cy='14.6' r='1.7' fill='none' stroke='#c0504d' stroke-width='1' stroke-dasharray='1.3 1.3'/>`,
  // jail: a stout stone block with two barred windows
  jail: (r) =>
    `<rect x='6' y='11' width='20' height='15' rx='1' fill='${r}'/>` +
    `<rect x='6' y='11' width='20' height='2.2' fill='#ffffff' opacity='0.1'/>` +
    `<rect x='9' y='15' width='5' height='6' fill='#2b2b2e'/><rect x='18' y='15' width='5' height='6' fill='#2b2b2e'/>` +
    `<g stroke='#8a8a8a' stroke-width='0.8'><line x1='10.2' y1='15' x2='10.2' y2='21'/><line x1='11.6' y1='15' x2='11.6' y2='21'/><line x1='13' y1='15' x2='13' y2='21'/><line x1='19.2' y1='15' x2='19.2' y2='21'/><line x1='20.6' y1='15' x2='20.6' y2='21'/><line x1='22' y1='15' x2='22' y2='21'/></g>` +
    door(shade(r, 0.6), 14.5, 3),
  // magetower: a slim tower with a pointed cap, a glowing orb finial and an arcane window
  magetower: (r) =>
    `<rect x='20' y='8' width='5' height='20' fill='#000000' opacity='0.13'/>` +
    `<polygon points='11,9 16,1 21,9' fill='${shade(r, 0.8)}'/>` +
    `<circle cx='16' cy='2.4' r='1.6' fill='#bfa3ff'/>` +
    `<rect x='11.5' y='9' width='9' height='18' rx='1' fill='${r}'/>` +
    `<rect x='11.5' y='9' width='9' height='2.2' fill='#ffffff' opacity='0.16'/>` +
    `<circle cx='16' cy='15' r='2' fill='#bfa3ff' opacity='0.9'/>` +
    `<rect x='14.5' y='21' width='3' height='6' fill='${shade(r, 0.5)}'/>`,
  // shrine: a small post-and-beam shelter over an idol (smaller than a temple)
  shrine: (r) =>
    `<polygon points='9,16 16,10 23,16' fill='${r}'/>` +
    `<rect x='8' y='15' width='16' height='2' fill='${shade(r, 0.7)}'/>` +
    `<rect x='10' y='17' width='2' height='9' fill='${shade(r, 0.6)}'/>` +
    `<rect x='20' y='17' width='2' height='9' fill='${shade(r, 0.6)}'/>` +
    `<rect x='14.5' y='19' width='3' height='5' fill='${shade(r, 0.85)}'/>` +
    `<circle cx='16' cy='20.5' r='1.2' fill='${shade(r, 0.5)}'/>`,
  // stables: an open-fronted shelter with stall dividers and a fence rail
  stables: (r) =>
    `<rect x='5' y='12' width='22' height='14' rx='1' fill='${shade(r, 0.82)}'/>` +
    `<rect x='4' y='10' width='24' height='4' fill='${r}'/>` +
    `<rect x='9' y='16' width='1.6' height='10' fill='${shade(r, 0.5)}'/>` +
    `<rect x='15.2' y='16' width='1.6' height='10' fill='${shade(r, 0.5)}'/>` +
    `<rect x='21.4' y='16' width='1.6' height='10' fill='${shade(r, 0.5)}'/>` +
    `<rect x='6' y='23' width='20' height='1.4' fill='${shade(r, 0.55)}'/>`,
  // tailor: a shopfront with a draped-cloth window and a hanging spool sign
  tailor: (r) =>
    `<rect x='8' y='13' width='16' height='13' rx='1' fill='${shade(r, 0.82)}'/>` +
    `<polygon points='6,14 16,7 26,14' fill='${r}'/>` +
    door(r, 14.5, 3) +
    `<rect x='10' y='16' width='5' height='6' fill='${shade(r, 1.15)}'/>` +
    `<path d='M10 16 q2.5 3 5 0' stroke='#c98ab0' stroke-width='1' fill='none'/>` +
    `<rect x='20' y='9' width='4' height='3' rx='0.5' fill='#d9c089'/><line x1='20' y1='10.5' x2='24' y2='10.5' stroke='#8a6a3a' stroke-width='0.6'/>`,
  // townhall: a grand civic facade — big pediment, a clock, a flag and columns
  townhall: (r) =>
    `<rect x='5' y='13' width='22' height='13' fill='${shade(r, 1.05)}'/>` +
    `<polygon points='4,13 16,5 28,13' fill='${r}'/>` +
    `<rect x='15' y='2' width='2' height='5' fill='${shade(r, 0.6)}'/><polygon points='17,2.5 21,3.8 17,5' fill='#5a6fae'/>` +
    `<circle cx='16' cy='10' r='2.2' fill='#f0e6c0'/><line x1='16' y1='10' x2='16' y2='8.4' stroke='#5a4a2a' stroke-width='0.7'/><line x1='16' y1='10' x2='17.2' y2='10' stroke='#5a4a2a' stroke-width='0.7'/>` +
    `<rect x='8' y='16' width='2' height='8' fill='${shade(r, 0.68)}'/><rect x='12' y='16' width='2' height='8' fill='${shade(r, 0.68)}'/><rect x='18' y='16' width='2' height='8' fill='${shade(r, 0.68)}'/><rect x='22' y='16' width='2' height='8' fill='${shade(r, 0.68)}'/>` +
    `<rect x='14.5' y='20' width='3' height='6' fill='${shade(r, 0.5)}'/>`,
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
  // tavern: timber-framed alehouse with exposed cross-beams, warm lit windows, and a
  // hanging green sign board with a mug — clearly a public house, not a plain cottage.
  tavern: (r) =>
    `<rect x='5' y='11' width='22' height='15' rx='1.5' fill='${r}'/>` +
    `<rect x='5' y='11' width='22' height='2.2' fill='#ffffff' opacity='0.14'/>` +
    `<rect x='5' y='18.4' width='22' height='1.6' fill='${shade(r, 0.6)}'/>` +
    `<rect x='9.6' y='13' width='1.3' height='13' fill='${shade(r, 0.6)}'/>` +
    `<rect x='21' y='13' width='1.3' height='13' fill='${shade(r, 0.6)}'/>` +
    `<rect x='22' y='5' width='3' height='6' fill='${shade(r, 0.55)}'/>` +
    `<rect x='12.4' y='14.2' width='3' height='3' rx='0.4' fill='#ffd27a'/>` +
    `<rect x='16.6' y='14.2' width='3' height='3' rx='0.4' fill='#ffd27a'/>` +
    `<rect x='2.4' y='12.6' width='5' height='1' fill='${shade(r, 0.5)}'/>` +
    `<rect x='3' y='13.6' width='4.4' height='4.4' rx='0.6' fill='#3f6f4a'/>` +
    `<rect x='4.5' y='14.6' width='1.6' height='2.4' rx='0.3' fill='#f2ead6'/>` +
    `<rect x='4.3' y='14.4' width='2' height='0.7' rx='0.3' fill='#f2ead6'/>` +
    door(r, 13, 5),
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
  // archives: records house — a row of scroll cubbies across the facade, no flag (that's
  // the guild's mark), so it no longer shares the guild's banner silhouette.
  archives: (r) =>
    `<rect x='7' y='12' width='18' height='15' rx='1' fill='${r}'/>` +
    `<rect x='7' y='12' width='18' height='2.2' fill='#ffffff' opacity='0.14'/>` +
    `<rect x='9' y='15.4' width='3.6' height='3.6' rx='0.4' fill='${shade(r, 0.5)}'/>` +
    `<rect x='14.2' y='15.4' width='3.6' height='3.6' rx='0.4' fill='${shade(r, 0.5)}'/>` +
    `<rect x='19.4' y='15.4' width='3.6' height='3.6' rx='0.4' fill='${shade(r, 0.5)}'/>` +
    `<rect x='10.3' y='16.1' width='1.2' height='2.2' rx='0.6' fill='#f2ead6'/>` +
    `<rect x='15.5' y='16.1' width='1.2' height='2.2' rx='0.6' fill='#f2ead6'/>` +
    `<rect x='20.7' y='16.1' width='1.2' height='2.2' rx='0.6' fill='#f2ead6'/>` +
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
  // workshop: a tinker's/artificer's shop — flat industrial roof, a big brass cog on the
  // wall, a small secondary gear, and a slim vent puffing pale steam (deliberately a touch
  // un-medieval). Distinct from the forge silhouettes (smithy/foundry).
  workshop: (r) =>
    `<rect x='7' y='13' width='18' height='13' rx='1' fill='${r}'/>${hi}` +
    `<rect x='6' y='10.5' width='20' height='3.2' rx='0.8' fill='${shade(r, 1.12)}'/>` +
    `<rect x='21' y='5' width='2.4' height='6' fill='${shade(r, 0.5)}'/>` +
    `<circle cx='22.2' cy='4' r='1.7' fill='#dfe6ea' opacity='0.5'/>` +
    `<circle cx='24' cy='2.4' r='1.2' fill='#dfe6ea' opacity='0.4'/>` +
    `<g fill='#c89b3c'>` +
      `<rect x='15.1' y='13.4' width='1.8' height='1.8'/>` +
      `<rect x='15.1' y='21.8' width='1.8' height='1.8'/>` +
      `<rect x='11.0' y='17.6' width='1.8' height='1.8'/>` +
      `<rect x='19.2' y='17.6' width='1.8' height='1.8'/>` +
      `<rect x='12.1' y='14.5' width='1.7' height='1.7'/>` +
      `<rect x='18.2' y='14.5' width='1.7' height='1.7'/>` +
      `<rect x='12.1' y='20.6' width='1.7' height='1.7'/>` +
      `<rect x='18.2' y='20.6' width='1.7' height='1.7'/>` +
    `</g>` +
    `<circle cx='16' cy='18.5' r='4' fill='#d8a93f'/>` +
    `<circle cx='16' cy='18.5' r='1.5' fill='${shade(r, 0.4)}'/>` +
    `<circle cx='21' cy='15.5' r='2.2' fill='#b8860b'/>` +
    `<circle cx='21' cy='15.5' r='0.8' fill='${shade(r, 0.4)}'/>` +
    door(r, 8, 3),
};

const BUILDING_SHAPE = {
  house: 'gable',
  inn: 'inn', tavern: 'tavern',
  barn: 'barn', warehouse: 'warehouse',
  blacksmith: 'smithy', foundry: 'foundry',
  temple: 'temple',
  bank: 'bank',
  manor: 'manor', keep: 'tower', barracks: 'fortified',
  alchemist: 'dome',
  shop: 'stall', market: 'stall',
  guild: 'banner', archives: 'archives', library: 'library',
  // new building types — each has its own bespoke silhouette
  apothecary: 'apothecary',
  fletcher: 'fletcher',
  harbormaster: 'harbormaster',
  boathouse: 'boathouse',
  jail: 'jail',
  magetower: 'magetower',
  mill: 'mill',
  shrine: 'shrine',
  stables: 'stables',
  tailor: 'tailor',
  townhall: 'townhall',
  workshop: 'workshop',
};

// Canonical list of every building type the renderer knows (single source of truth for
// galleries/legends so they never miss a type). Order = roughly civic → commerce → craft.
export const BUILDING_TYPES = Object.keys(BUILDING_SHAPE);

// --- tier-2 architecture flavour (backlog #64, tier 2) --------------------------
// Small theme-gated SHAPE additions on top of the tier-1 material palettes. Strictly
// per-theme: the temperate branch never touches any of this, so temperate output stays
// byte-identical to the pins. Everything is deterministic (seeded by building type via
// hash(); no Math.random), so a themed town renders identically on every load.
//
// Desert: flat-roof variants where they read well — the house trades its gable for a
// parapet band + an awning stripe over the door; shop/market stalls gain a parapet
// band over the awning. Civic landmarks (temple, keep, townhall, ...) keep their
// distinctive silhouettes.
const awningStripe = (r, x, y) => {
  let s = '';
  for (let i = 0; i < 4; i++) s += `<rect x='${(x + i * 2.5).toFixed(1)}' y='${y}' width='2.5' height='2.2' fill='${i % 2 ? '#f2ead6' : shade(r, 0.7)}'/>`;
  return s;
};
const DESERT_FLAT = {
  // flat-roofed adobe cottage: parapet band instead of the gable triangle
  house: (r) =>
    `<rect x='9' y='10' width='14' height='16' rx='1' fill='${shade(r, 0.82)}'/>` +
    `<rect x='8' y='8' width='16' height='3.2' rx='0.8' fill='${r}'/>` +
    `<rect x='8' y='10.6' width='16' height='0.9' fill='${shade(r, 0.6)}'/>` +
    `<rect x='19' y='13.5' width='3' height='3' fill='${shade(r, 1.15)}'/>` +
    awningStripe(r, 10, 17.6) +
    door(r, 13.5, 3),
};
// shop/market: the stall keeps its counter awning and gains a flat parapet above it
const desertStall = (r) =>
  `<rect x='6.5' y='6.8' width='19' height='2.6' rx='0.7' fill='${shade(r, 0.85)}'/>` +
  `<rect x='6.5' y='8.9' width='19' height='0.7' fill='${shade(r, 0.55)}'/>` +
  SHAPES.stall(r);
DESERT_FLAT.shop = desertStall;
DESERT_FLAT.market = desertStall;

// Snow: chimney smoke curls on the dwelling shapes that have a chimney, and an icicle
// fringe hanging from the SNOW_CAP roof band on a subset of types. Drawn OUTSIDE the
// outline halo (see building() below) so the smoke stays wispy and the ice stays pale.
const smokeWisps = (cx, cy, type) => {
  const h = hash(type);
  const dx = ((h & 3) - 1.5) * 0.6; // deterministic per-type drift
  return `<circle cx='${cx}' cy='${cy}' r='1.5' fill='#e6edf3' opacity='0.85'/>` +
    `<circle cx='${(cx + 1.6 + dx).toFixed(1)}' cy='${(cy - 2.4).toFixed(1)}' r='1.2' fill='#eff4f8' opacity='0.7'/>` +
    `<circle cx='${(cx + 3 + dx * 2).toFixed(1)}' cy='${(cy - 4.6).toFixed(1)}' r='0.9' fill='#f7fafc' opacity='0.55'/>`;
};
const SNOW_SMOKE = {
  house: () => smokeWisps(20.8, 6, 'house'),   // gable chimney
  manor: () => smokeWisps(21.8, 5, 'manor'),   // the right of the twin chimneys
  inn: () => smokeWisps(23.3, 2.5, 'inn'),     // rooftop chimney (top wisp drifts out of frame)
  tavern: () => smokeWisps(23.5, 4, 'tavern'), // alehouse chimney
};
const icicleFringe = (type) => {
  const h = hash(type);
  let out = '';
  for (let i = 0; i < 5; i++) {
    const x = 7.5 + i * 4.4 + ((h >> (i * 3)) & 3) * 0.4; // per-type jitter, deterministic
    const t = (x - 16) / 11;
    const y = 12.9 + 2.4 * t * t; // follows the SNOW_CAP band's lower curve
    const len = 2 + ((h >> (i * 2)) & 3) * 0.5;
    out += `<polygon points='${(x - 0.8).toFixed(1)},${y.toFixed(1)} ${(x + 0.8).toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${(y + len).toFixed(1)}' fill='#dceefc' opacity='0.9'/>`;
  }
  return out;
};
const SNOW_ICICLES = new Set(['house', 'shop', 'temple', 'inn']);

const building = (buildingType, ground = C.grass, theme = 'grassland') => {
  const mat = THEME_MATERIALS[theme];
  const baseRoof = ROOFS[buildingType] || ROOFS.house;
  // themed towns re-tint the material palette; temperate (or any unknown theme) uses
  // the roof colour untouched so existing saves render byte-identically
  const roof = mat ? mix(baseRoof, mat.tint, mat.amount) : baseRoof;
  // tier-2 desert flat-roof variants replace the shape for the allowlisted types only
  const shape = (theme === 'desert' && DESERT_FLAT[buildingType]) || SHAPES[BUILDING_SHAPE[buildingType] || 'gable'];
  const body = shape(roof) + (mat && mat.cap ? SNOW_CAP : '');
  // Themed grounds are pale (sand/snow), which washes out building silhouettes
  // (maintainer 2026-07-05). A zero-offset drop-shadow halo re-cuts the outline
  // around ANY compound shape without touching the shape functions: same idea
  // as worldTileArt's dark peak/tree outlines against pale biomes. Temperate
  // gets no filter: its output stays byte-identical.
  // feMorphology dilate makes a CRISP contour (a soft zero-offset drop shadow
  // was invisible at tile scale, maintainer 2026-07-05): the silhouette's alpha
  // is expanded ~0.8px, filled with the theme's outline colour, and merged
  // under the original artwork.
  const outlined = mat && mat.outline
    ? `<defs><filter id='bo' x='-20%' y='-20%' width='140%' height='140%'>` +
      `<feMorphology in='SourceAlpha' operator='dilate' radius='0.8' result='d'/>` +
      `<feFlood flood-color='${mat.outline}' flood-opacity='0.95'/>` +
      `<feComposite in2='d' operator='in' result='o'/>` +
      `<feMerge><feMergeNode in='o'/><feMergeNode in='SourceGraphic'/></feMerge>` +
      `</filter></defs><g filter='url(#bo)'>${body}</g>`
    : body;
  // tier-2 snow overlays ride OUTSIDE the halo group: a dark contour around pale
  // smoke/ice would read as dirt, and temperate/desert never reach this branch
  let extras = '';
  if (theme === 'snow') {
    if (SNOW_ICICLES.has(buildingType)) extras += icicleFringe(buildingType);
    const smoke = SNOW_SMOKE[buildingType];
    if (smoke) extras += smoke();
  }
  return wrap(
    `<rect width='32' height='32' fill='${ground}'/>` +
    `<ellipse cx='16' cy='27' rx='12' ry='3' fill='#000000' opacity='0.16'/>` + // ground shadow
    outlined + extras
  );
};

// --- public API --------------------------------------------------------------
// `wet` is the waterway-neighbour mask (waterwayMask above); 0 for every tile that has
// nothing to do with canals, in which case each branch takes its historical path.
// `jetty` is jettyInfo()'s verdict for bridge tiles (null = crossing/historical art).
const _generate = (type, tile, mask, seed, theme, wet = 0, jetty = null) => {
  // ground fill + open-tile texture follow the theme (desert→sand, snow→snow, else grass)
  const ground = themeGroundFill(theme);
  const groundTile = (s) => theme === 'desert' ? sand(s) : theme === 'snow' ? snow(s) : grass(s);
  switch (type) {
    case 'water': return tile.waterway ? canalTile(wet, theme, seed) : water(seed);
    case 'beach': return beach(seed);
    case 'bridge':
      if (jetty) return jettyTile(jetty.waterEnd, seed, !!tile.waterway);
      return tile.waterway ? canalBridgeTile(wet, seed) : bridge();
    case 'farm_field': return field(seed);
    case 'town_square': return stone(seed, true);
    case 'stone_path': return wet ? wrap(stoneInner(seed, true) + quayOverlay(wet, theme)) : stone(seed, true);
    case 'dirt_path': return wet ? wrap(dirtInner(seed) + quayOverlay(wet, theme)) : dirt(seed);
    case 'building': return building(tile.buildingType, ground, theme);
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
// renders a pale snow base). `waterMask` is the 4-bit waterway-neighbour mask from
// waterwayMask() (additive, default 0 = the historical rendering for every caller
// that does not compute it).
export function tileBackground(tile, neighbours = {}, x = 0, y = 0, theme = 'grassland', waterMask = 0) {
  const type = tile.type;
  // Theme tag in the cache key so each theme's tiles never collide. Grassland is the
  // default, so its keys/output are unchanged from before ('g').
  const tt = theme === 'desert' ? 'd' : theme === 'snow' ? 's' : 'g';
  const wet = waterMask | 0;
  let mask = 0;
  let jetty = null;
  let key;
  if (type === 'wall' || type === 'keep_wall') {
    mask = (neighbours.n === type ? 1 : 0) | (neighbours.e === type ? 2 : 0) | (neighbours.s === type ? 4 : 0) | (neighbours.w === type ? 8 : 0);
    key = `${type}|${mask}|${tt}`;
  } else if (type === 'building') {
    key = `building|${tile.buildingType || 'house'}|${tt}`;
  } else {
    key = `${type}|${variantSeed(x, y)}|${tt}`;
    // Canal dressing folds into the key additively: pre-canal tiles (wet 0, no
    // waterway flag) keep their historical keys, and a waterway tile can never
    // collide with plain water/bridge art at the same coordinate.
    if (wet || tile.waterway) key += `|w${wet}${tile.waterway ? 'c' : ''}`;
    // Jetty detection (water towns plan §1b) reuses the neighbour-type object the
    // wall autotiler already gets. Additive: crossings and callers passing no
    // neighbours yield null, keeping the historical key and bridge art.
    if (type === 'bridge') {
      jetty = jettyInfo(tile, neighbours);
      if (jetty) key += `|j${jetty.waterEnd}`;
    }
  }
  let bg = _cache.get(key);
  if (bg === undefined) {
    bg = _generate(type, tile, mask, variantSeed(x, y), theme, wet, jetty);
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
  beach: () => beach(variantSeed(3, 2)),
  farm_field: () => field(variantSeed(4, 1)),
  town_square: () => stone(variantSeed(5, 1), true),
  bridge: () => bridge(),
  canal: () => canalTile(10, 'grassland', variantSeed(3, 3)),
  jetty: () => jettyTile('n', variantSeed(3, 4)),
};
export const wallVariant = (mask, keep = false) => wall(mask, keep);
// `theme` is optional: the default renders the historical temperate building so every
// existing gallery/legend caller is unchanged; 'desert'/'snow' return the themed
// materials on the matching ground.
export const buildingTile = (buildingType, theme = 'grassland') =>
  building(buildingType, themeGroundFill(theme), theme);
export { hash };
