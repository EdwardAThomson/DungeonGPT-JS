// siteMapGenerator.js
// Generic generator for explorable wilderness POI sub-maps, the wilderness analog of
// townMapGenerator. One framework, two layout strategies themed per POI type:
//
//   - CAVE  (subtractive / enclosed): the whole tile is solid rock and rooms + corridors
//     are CARVED out. You're underground, so rock surrounds everything.
//   - RUINS (additive / open-air): the tile is open biome ground (a field / desert / snow)
//     and a decrepit building (broken walls + rubble + flagstone floor) is PLACED on it,
//     with open countryside all around — a ruin sitting in the landscape.
//
// Deterministic per (type, coord) via the seed, mirroring the town generator. Phase 1
// produces layout + reserved `contentSlots`; a later populateSite() fills those with
// encounters / loot / milestone objectives.

import { createLogger } from './logger';
import { SITE_DECORATIONS } from './siteTileArt';

const logger = createLogger('site-map-generator');

const SITE_SIZE = 20;

const SITE_CONFIG = {
  cave: {
    theme: 'cave',
    style: 'organic',     // subtractive: carve rooms out of rock
    rooms: [4, 6],        // [min, max] room count
    roomSize: [2, 3],     // [min, max] room HALF-extent (radius); diameter ~4-7
    rubbleChance: 0.06,   // loose rock on the floor (a walkable 'rubble' tile)
  },
  ruins: {
    theme: 'ruins',
    style: 'structured',  // additive: place a broken building on open ground
    buildings: [2, 3],    // [min, max] ruined structures
    buildingSize: [2, 3], // [min, max] HALF-extent
    rubbleChance: 0.14,   // ruins are rubble-strewn (inside the structure)
  },
};

export const siteThemeFor = (type) => (SITE_CONFIG[type === 'cave_entrance' ? 'cave' : type] || SITE_CONFIG.cave).theme;

// Open-air sites take their surrounding ground from the world tile's biome.
export const groundKindFor = (biome) => (biome === 'desert' ? 'sand' : biome === 'snow' ? 'snow' : 'grass');

// Seeded RNG — same LCG the town generator uses, so sites are reproducible.
function seededRandom(seed) {
  let state = Number.isFinite(seed) ? seed : 42;
  return function () {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

const makeTile = (x, y, type, ground) => {
  const t = { x, y, type, walkable: type !== 'wall', poi: null, isExplored: false };
  if (type === 'ground' && ground) t.ground = ground; // grass | sand | snow (open-air sites)
  return t;
};

/**
 * @param {string} type - POI type ('cave' | 'cave_entrance' | 'ruins').
 * @param {string} name - display name.
 * @param {string} entryDir - edge entered from ('north'|'east'|'south'|'west').
 * @param {number} seed - reproducible seed.
 * @param {Object} opts - { width, height, biome } — biome themes open-air ground.
 * @returns {Object} site map: { mapData, width, height, type, theme, groundKind,
 *   entryPoint, contentSlots, siteVersion }.
 */
export function generateSiteMap(type, name, entryDir = 'south', seed = null, opts = {}) {
  const norm = type === 'cave_entrance' ? 'cave' : type;
  const cfg = SITE_CONFIG[norm] || SITE_CONFIG.cave;
  const W = opts.width || SITE_SIZE;
  const H = opts.height || SITE_SIZE;
  const rng = seed !== null ? seededRandom(seed) : Math.random;
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const groundKind = groundKindFor(opts.biome);
  const decoKeys = (SITE_DECORATIONS[norm] || []).map((d) => d.key);

  logger.debug(`[SITE] Generating ${norm} "${name}" (${cfg.style}) ${W}x${H} ground=${groundKind}`);

  const built = cfg.style === 'organic'
    ? buildCave(W, H, cfg, rng, ri, entryDir, decoKeys)
    : buildRuins(W, H, cfg, rng, ri, entryDir, decoKeys, groundKind);

  return {
    ...built,
    width: W,
    height: H,
    type: norm,
    theme: cfg.theme,
    groundKind,
    name,
    siteVersion: 1,
  };
}

// --- CAVE: carve rooms + corridors out of solid rock -------------------------
function buildCave(W, H, cfg, rng, ri, entryDir, decoKeys) {
  const mapData = [];
  for (let y = 0; y < H; y++) {
    const row = [];
    for (let x = 0; x < W; x++) row.push(makeTile(x, y, 'wall'));
    mapData.push(row);
  }
  const inBounds = (x, y) => x >= 1 && x < W - 1 && y >= 1 && y < H - 1;
  const carve = (x, y) => { if (inBounds(x, y)) { const t = mapData[y][x]; t.type = 'floor'; t.walkable = true; } };

  // rooms (organic blobs)
  const roomCount = ri(cfg.rooms[0], cfg.rooms[1]);
  const rooms = [];
  for (let attempt = 0; attempt < roomCount * 12 && rooms.length < roomCount; attempt++) {
    const rw = ri(cfg.roomSize[0], cfg.roomSize[1]);
    const rh = ri(cfg.roomSize[0], cfg.roomSize[1]);
    const cx = ri(rw + 1, W - 2 - rw);
    const cy = ri(rh + 1, H - 2 - rh);
    if (rooms.some((r) => Math.abs(r.cx - cx) < r.rw + rw + 1 && Math.abs(r.cy - cy) < r.rh + rh + 1)) continue;
    for (let y = cy - rh; y <= cy + rh; y++) {
      for (let x = cx - rw; x <= cx + rw; x++) {
        const dx = (x - cx) / (rw + 0.5);
        const dy = (y - cy) / (rh + 0.5);
        if (dx * dx + dy * dy <= 1 + (rng() - 0.5) * 0.4) carve(x, y);
      }
    }
    rooms.push({ cx, cy, rw, rh });
  }

  // corridors connect rooms in sequence (guarantees connectivity)
  const carveCorridor = (a, b) => {
    let x = a.cx, y = a.cy;
    carve(x, y);
    const stepX = () => { while (x !== b.cx) { x += x < b.cx ? 1 : -1; carve(x, y); } };
    const stepY = () => { while (y !== b.cy) { y += y < b.cy ? 1 : -1; carve(x, y); } };
    if (rng() < 0.5) { stepX(); stepY(); } else { stepY(); stepX(); }
  };
  for (let i = 1; i < rooms.length; i++) carveCorridor(rooms[i - 1], rooms[i]);

  // entrance: carve a passage from the room nearest the entry edge out to the border
  const edgeKey = { north: (r) => r.cy, south: (r) => H - 1 - r.cy, west: (r) => r.cx, east: (r) => W - 1 - r.cx };
  const keyFn = edgeKey[entryDir] || edgeKey.south;
  const mouth = rooms.reduce((best, r) => (keyFn(r) < keyFn(best) ? r : best), rooms[0] || { cx: Math.floor(W / 2), cy: Math.floor(H / 2) });
  let entryPoint;
  if (entryDir === 'north') { for (let y = mouth.cy; y >= 0; y--) carve(mouth.cx, y); mapData[0][mouth.cx] = makeTile(mouth.cx, 0, 'entrance'); entryPoint = { x: mouth.cx, y: 0 }; }
  else if (entryDir === 'west') { for (let x = mouth.cx; x >= 0; x--) carve(x, mouth.cy); mapData[mouth.cy][0] = makeTile(0, mouth.cy, 'entrance'); entryPoint = { x: 0, y: mouth.cy }; }
  else if (entryDir === 'east') { for (let x = mouth.cx; x < W; x++) carve(x, mouth.cy); mapData[mouth.cy][W - 1] = makeTile(W - 1, mouth.cy, 'entrance'); entryPoint = { x: W - 1, y: mouth.cy }; }
  else { for (let y = mouth.cy; y < H; y++) carve(mouth.cx, y); mapData[H - 1][mouth.cx] = makeTile(mouth.cx, H - 1, 'entrance'); entryPoint = { x: mouth.cx, y: H - 1 }; }

  scatter(mapData, W, H, rng, cfg.rubbleChance, decoKeys, (t) => t.type === 'floor');
  const contentSlots = reserveSlots(mapData, rooms.filter((r) => r !== mouth).map((r) => ({ x: r.cx, y: r.cy })), entryPoint);
  return { mapData, entryPoint, contentSlots };
}

// --- RUINS: place a broken building on open biome ground ----------------------
function buildRuins(W, H, cfg, rng, ri, entryDir, decoKeys, groundKind) {
  // open countryside base (grass / sand / snow)
  const mapData = [];
  for (let y = 0; y < H; y++) {
    const row = [];
    for (let x = 0; x < W; x++) row.push(makeTile(x, y, 'ground', groundKind));
    mapData.push(row);
  }
  const setType = (x, y, type) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const t = mapData[y][x];
    t.type = type;
    t.walkable = type !== 'wall';
    t.poi = null;
    if (type === 'ground') t.ground = groundKind; else delete t.ground;
  };

  // place ruined structures in the central area, surrounded by open ground
  const count = ri(cfg.buildings[0], cfg.buildings[1]);
  const buildings = [];
  for (let attempt = 0; attempt < count * 12 && buildings.length < count; attempt++) {
    const rw = ri(cfg.buildingSize[0], cfg.buildingSize[1]);
    const rh = ri(cfg.buildingSize[0], cfg.buildingSize[1]);
    const cx = ri(rw + 3, W - 4 - rw);
    const cy = ri(rh + 3, H - 4 - rh);
    if (buildings.some((b) => Math.abs(b.cx - cx) < b.rw + rw + 2 && Math.abs(b.cy - cy) < b.rh + rh + 2)) continue;
    buildings.push({ cx, cy, rw, rh });
  }
  if (buildings.length === 0) buildings.push({ cx: Math.floor(W / 2), cy: Math.floor(H / 2), rw: 2, rh: 2 });

  buildings.forEach((b) => {
    const x0 = b.cx - b.rw, x1 = b.cx + b.rw, y0 = b.cy - b.rh, y1 = b.cy + b.rh;
    // interior flagstone floor
    for (let y = y0 + 1; y <= y1 - 1; y++) for (let x = x0 + 1; x <= x1 - 1; x++) setType(x, y, 'floor');
    // broken perimeter: mostly standing wall, some collapsed (rubble) or gone (ground)
    const perim = [];
    for (let x = x0; x <= x1; x++) { perim.push([x, y0]); perim.push([x, y1]); }
    for (let y = y0 + 1; y <= y1 - 1; y++) { perim.push([x0, y]); perim.push([x1, y]); }
    perim.forEach(([x, y]) => {
      const r = rng();
      setType(x, y, r < 0.28 ? 'rubble' : r < 0.40 ? 'ground' : 'wall');
    });
    // guarantee at least one clear doorway so the interior is enterable
    const door = ri(0, 3);
    if (door === 0) setType(b.cx, y0, 'rubble');
    else if (door === 1) setType(x1, b.cy, 'rubble');
    else if (door === 2) setType(b.cx, y1, 'rubble');
    else setType(x0, b.cy, 'rubble');
  });

  // entrance marker on the entry edge (the way back out to the world)
  const mid = Math.floor(W / 2), midY = Math.floor(H / 2);
  let entryPoint;
  if (entryDir === 'north') { setType(mid, 0, 'entrance'); entryPoint = { x: mid, y: 0 }; }
  else if (entryDir === 'west') { setType(0, midY, 'entrance'); entryPoint = { x: 0, y: midY }; }
  else if (entryDir === 'east') { setType(W - 1, midY, 'entrance'); entryPoint = { x: W - 1, y: midY }; }
  else { setType(mid, H - 1, 'entrance'); entryPoint = { x: mid, y: H - 1 }; }

  // sparse decorations: overgrowth/columns/statues on the grounds + inside the floor
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = mapData[y][x];
      if (t.type === 'ground') { if (decoKeys.length && rng() < 0.05) t.poi = decoKeys[Math.floor(rng() * decoKeys.length)]; }
      else if (t.type === 'floor') {
        if (rng() < cfg.rubbleChance) t.type = 'rubble';
        else if (decoKeys.length && rng() < 0.10) t.poi = decoKeys[Math.floor(rng() * decoKeys.length)];
      }
    }
  }

  const contentSlots = reserveSlots(mapData, buildings.map((b) => ({ x: b.cx, y: b.cy })), entryPoint);
  return { mapData, entryPoint, contentSlots };
}

// scatter rubble + decorations over tiles matching `pred`
function scatter(mapData, W, H, rng, rubbleChance, decoKeys, pred) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = mapData[y][x];
      if (!pred(t)) continue;
      if (rng() < rubbleChance) { t.type = 'rubble'; t.walkable = true; }
      else if (decoKeys.length && rng() < 0.10) t.poi = decoKeys[Math.floor(rng() * decoKeys.length)];
    }
  }
}

// reserve walkable points as content slots (skip the entrance + clear any decoration)
function reserveSlots(mapData, points, entryPoint) {
  return points
    .filter((p) => mapData[p.y] && mapData[p.y][p.x] && mapData[p.y][p.x].walkable)
    .filter((p) => !(p.x === entryPoint.x && p.y === entryPoint.y))
    .map((p) => { const t = mapData[p.y][p.x]; t.contentSlot = true; t.poi = null; return p; });
}

export default generateSiteMap;
