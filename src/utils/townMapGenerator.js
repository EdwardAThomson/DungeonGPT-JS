// townMapGenerator.js
// Generates interior maps for towns based on their size

import { generateTavernName, generateGuildName, generateBankName, generateShopName, generateManorName, generateTempleName } from './townNameGenerator';
import { createLogger } from './logger';

const logger = createLogger('town-map-generator');

// Theme-aware decoration palettes. These are the POI values scattered as the town's
// natural cover — drawn as emoji overlays by townTileArt's POI_EMOJI map. Grassland is
// the historical set (unchanged, so existing towns regenerate byte-identically); desert
// and snow swap the green tree/bush/flowers for biome-appropriate decorations so themed
// towns read correctly on their sand/snow ground. `core` dresses the native settlement
// (placeDecorations); `ring` dresses the surrounding countryside (padTownToUniform).
const DECORATION_SETS = {
  grassland: {
    core: ['tree', 'tree', 'tree', 'tree', 'bush', 'flowers', 'tree', 'tree'],
    ring: ['tree', 'tree', 'tree', 'bush', 'flowers', 'tree'],
  },
  desert: {
    core: ['cactus', 'cactus', 'rock', 'dead_bush', 'cactus', 'rock', 'cactus', 'dead_bush'],
    ring: ['cactus', 'rock', 'dead_bush', 'cactus', 'rock', 'cactus'],
  },
  snow: {
    core: ['pine', 'pine', 'pine', 'rock', 'snowdrift', 'pine', 'pine', 'rock'],
    ring: ['pine', 'pine', 'rock', 'snowdrift', 'pine', 'rock'],
  },
};
const decorationSet = (theme) => DECORATION_SETS[theme] || DECORATION_SETS.grassland;

// Per-size building roster. Hoisted to module scope so the water step can reserve enough
// dry land for the buildings each size needs BEFORE any water is carved (see placeTownWater
// / buildingTileEstimate). placeBuildings reads the same object, so the two never drift.
const BUILDING_CONFIG = {
  hamlet: {
    important: ['barn'],
    secondary: ['shrine', 'mill'],    // a small rural shrine + a mill
    houses: 9,
  },
  village: {
    important: ['inn', 'shop', 'blacksmith', 'tavern'],
    secondary: ['alchemist', 'mill', 'stables', 'shrine'],
    houses: 18,
  },
  town: {
    important: ['inn', 'shop', 'temple', 'blacksmith', 'tavern', 'tavern'],
    secondary: ['alchemist', 'archives', 'warehouse', 'tailor', 'fletcher', 'apothecary', 'stables', 'mill'],
    civicHall: true, // townhall placed ON the square (see STEP 0.9), not in the outer ring
    houses: 42,
  },
  city: {
    important: ['inn', 'temple', 'temple', 'market', 'blacksmith', 'tavern', 'tavern', 'tavern', 'bank', 'bank', 'bank'],
    secondary: ['guild', 'guild', 'guild', 'alchemist', 'alchemist', 'archives', 'library', 'foundry', 'warehouse', 'warehouse', 'magetower', 'tailor', 'apothecary', 'stables'],
    civicHall: true, // townhall placed ON the square (see STEP 0.9), not in the outer ring
    houses: 55,
    hasKeep: true,
    hasJail: true, // the gaol is placed in the authority cluster by the keep (see placeBuildings)
    nobleEstate: ['manor', 'manor', 'manor', 'manor', 'manor'],
  },
};
// `harbormaster` + dockside `warehouse`s are placed on the shore (not via these rosters)
// only when the town sits on water — see the waterfront step in placeBuildings. A harbour
// office makes no sense inland.

// Total building tiles a size needs (important + secondary + houses + estate + keep). The
// water step keeps at least this many tiles (plus breathing room for the square + paths)
// dry, so adding a lakefront/coast never starves the settlement of buildable land.
function buildingTileEstimate(townSize) {
  const c = BUILDING_CONFIG[townSize] || BUILDING_CONFIG.village;
  return (c.important?.length || 0) + (c.secondary?.length || 0) +
    (c.houses || 0) + (c.nobleEstate?.length || 0) + (c.hasKeep ? 1 : 0) + (c.civicHall ? 1 : 0);
}

/**
 * Generate a town interior map based on town size
 * @param {string} townSize - Size of the town: 'hamlet', 'village', 'town', 'city'
 * @param {string} townName - Name of the town
 * @param {Object} entryPoint - Entry direction: 'north', 'south', 'east', 'west'
 * @param {number} seed - Optional seed for reproducible maps
 * @param {boolean} hasRiver - Whether the town has a river passing through it
 * @param {string} riverDirection - Direction of the river on the world map
 * @param {string} theme - Optional biome theme. Defaults to 'grassland' (byte-identical
 *   to historical output). 'desert' tags the town so the tileset renders a sand ground,
 *   and drops the green farm fields. The ground tile `type` stays 'grass' so all building/
 *   road/decoration placement is unchanged; the theme rides on the returned town object
 *   and is applied purely at render time (see townTileArt.tileBackground).
 * @param {Object|null} water - Optional water context derived from the WORLD map
 *   (see townWater.analyzeTownWater): `{ kind:'lake'|'coast', edges:{N,E,S,W} }`. When
 *   present, water is carved into the town BEFORE roads/buildings so the settlement sits
 *   on a real lakefront/coastline. Null (default) = landlocked, byte-identical to before.
 * @returns {Object} Town map data with tiles and metadata
 */
export const generateTownMap = (townSize, townName, entryPoint = 'south', seed = null, hasRiver = false, riverDirection = 'NORTH_SOUTH', theme = 'grassland', water = null) => {
  logger.debug(`[TOWN_MAP] Generating ${townSize} map for ${townName} (theme: ${theme}${water ? `, water: ${water.kind}` : ''})`);
  const isDesert = theme === 'desert';

  // Generate at the settlement's native size so the buildings stay huddled (the proven
  // layout), then frame it with surrounding countryside up to a uniform canvas — see
  // padTownToUniform below. Building counts unchanged.
  const UNIFORM_TOWN_SIZE = 20;
  const sizeConfig = {
    hamlet: { width: 10, height: 10, buildings: 3 },
    village: { width: 14, height: 14, buildings: 6 },
    town: { width: 18, height: 18, buildings: 10 },
    city: { width: 20, height: 20, buildings: 15 }
  };

  const config = sizeConfig[townSize] || sizeConfig.village;
  const { width, height, buildings: buildingCount } = config;

  // Use seed for reproducible maps, or random
  const rng = seed !== null ? seededRandom(seed) : Math.random;

  // Initialize map with grass tiles
  const mapData = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      row.push({
        x,
        y,
        type: 'grass',
        poi: null,
        walkable: true,
        isExplored: false
      });
    }
    mapData.push(row);
  }

  // Carve water FIRST (before roads/center/walls/buildings) so the lakefront/coastline
  // is the base the settlement is laid out around. Water tiles are never grass, so every
  // later placement step (which only writes onto grass) naturally avoids them.
  let waterInfo = null;
  if (water && (water.kind === 'lake' || water.kind === 'coast')) {
    waterInfo = placeTownWater(mapData, water, width, height, rng, townSize);
  }

  // Entrances follow the world-map roads: `entryPoint` may be a single direction (legacy)
  // or an array of directions (one per connecting road). The FIRST entrance is the party's
  // spawn/primary gate.
  let entryDirs = (Array.isArray(entryPoint) ? entryPoint : [entryPoint || 'south']).filter(Boolean);
  if (waterInfo) {
    // Drop a gate only when its ACTUAL gate tile is underwater — NOT merely because the
    // edge is flagged wet. A lake/sea in a corner promotes both adjacent edges to "wet",
    // but a road can still arrive at the dry middle of that edge, so we test the real tile
    // the gate would sit on (water is already carved at this point).
    const gateDry = (d) => {
      const p = calculateEntryPosition(width, height, d);
      return mapData[p.y] && mapData[p.y][p.x] && mapData[p.y][p.x].type !== 'water';
    };
    entryDirs = entryDirs.filter(gateDry);
    if (entryDirs.length === 0) entryDirs = [['south', 'north', 'east', 'west'].find(gateDry) || 'south'];
  }
  if (entryDirs.length === 0) entryDirs = ['south'];
  entryDirs = [...new Set(entryDirs)];

  // Gates get a seeded jitter along their edge so entrances are not always dead-centre
  // (and so gate roads are rarely axis-aligned with the hub, which reads as a straight
  // ray). Jitter keeps clear of corners and never lands on water.
  const entrances = entryDirs.map((dir) => ({ dir, pos: jitterGatePosition(calculateEntryPosition(width, height, dir), dir, width, height, rng, mapData) }));
  const entryPos = entrances[0].pos; // primary spawn

  // Place river if it exists
  let riverInfo = null;
  if (hasRiver) {
    riverInfo = placeRiverInTown(mapData, riverDirection, width, height, rng);
  }

  // The hub of the path network: the town square (placed just below). Every gate road
  // and building spoke anchors here — see the "Path network" section further down.
  const centerPos = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
  logger.debug('[TOWN_MAP] centerPos:', centerPos);

  // Seeded per-tile cost noise drives the windiness of every routed path; spokeStats
  // collects per-spoke shape metrics (length / straightness / bends) for tests + debug.
  const costNoise = makeCostNoise(rng);
  const spokeStats = [];

  // Windy approach road from every entrance gate to the hub. Walls only overwrite
  // grass, so each road tile already on the perimeter stays an open gate.
  entrances.forEach(({ pos }) => placeGateRoad(mapData, pos, centerPos, { noise: costNoise, riverInfo, townSize, stats: spokeStats, rng }));

  // Place town square/center
  placeTownCenter(mapData, centerPos, townSize);

  // Walls enclose the larger settlements (town + city); hamlets and villages stay
  // open clusters surrounded by countryside. (Walls only overwrite perimeter *grass*,
  // so the single-tile road gate punched earlier stays open.)
  if (townSize === 'city' || townSize === 'town') {
    placeCityWalls(mapData);
  }

  // Place buildings (including keep for cities)
  logger.debug('[TOWN_MAP] Calling placeBuildings with:', {
    mapDataSnapshot: mapData ? `${mapData.length}x${mapData[0].length}` : 'undefined',
    buildingCount,
    townSize,
    rngType: typeof rng,
    centerPos
  });
  // pathOpts feeds every routed lane: the keep spoke (laid inside placeBuildings right
  // after the keep, so the estate clusters around it), the building spokes/stubs, and
  // the house stubs. noPave collects protected sand (dock frontage) no route may pave.
  const pathOpts = { noise: costNoise, riverInfo, townSize, stats: spokeStats, noPave: new Set() };
  placeBuildings(mapData, buildingCount, townSize, rng, centerPos, !!waterInfo, pathOpts);

  // Generate paths connecting the placed buildings to the road network (hub-and-spoke,
  // windy). Runs BEFORE houses so no house can seal a civic building off its lane.
  generateBuildingPaths(mapData, centerPos, pathOpts);

  // Houses come after the lanes and prefer street-front tiles (they cannot build on a
  // path, so the network is never blocked); outlying houses then stub onto the nearest
  // lane, sharing stubs where they cluster.
  placeHouses(mapData, townSize, rng, centerPos);
  connectHouses(mapData, centerPos, pathOpts);

  // Safety net: any path tile that somehow ended up disconnected from the hub network
  // is demoted back to terrain, so the map NEVER ships orphan path fragments.
  pruneOrphanPaths(mapData);

  // Place farm fields (Hamlets, Villages, and Towns). Desert towns skip the green
  // fields — there's no farmland to render on sand.
  if (!isDesert && (townSize === 'hamlet' || townSize === 'village' || townSize === 'town')) {
    placeFarmFields(mapData, townSize, rng);
  }

  // Place decorations (trees, wells, etc.) LAST
  // This way they fill in empty spaces without blocking buildings or paths.
  // The theme picks the decoration palette (desert cacti/rocks, snow pines/drifts).
  placeDecorations(mapData, townSize, rng, theme);

  // Mark gates. Every entrance is a gate; the first is also the party's spawn entry.
  entrances.forEach(({ pos }) => { mapData[pos.y][pos.x].isGate = true; });
  mapData[entryPos.y][entryPos.x].isEntry = true;

  const result = {
    mapData,
    width,
    height,
    townName,
    townSize,
    theme,
    water: waterInfo,
    entrances,
    entryPoint: entryPos,
    centerPoint: centerPos,
    // Per-spoke shape metrics from the path router (kind/length/straight/bends).
    // Additive + optional: renderers ignore it, tests and /debug/tileset read it.
    pathStats: { windiness: PATH_WINDINESS, spokes: spokeStats }
  };

  // Frame the native layout with countryside so every town fills a uniform canvas
  // while its buildings stay huddled exactly as generated.
  return padTownToUniform(result, UNIFORM_TOWN_SIZE, UNIFORM_TOWN_SIZE, rng);
};

// Centre a natively-sized town in a larger uniform canvas, then dress the surrounding
// ring with grass, an entry road out to the map edge, scattered farm fields, and trees
// — so small settlements sit in open countryside instead of a cramped box. The core is
// copied verbatim (only its tile coords + entry/centre are re-indexed); randomness here
// touches the ring only.
export function padTownToUniform(town, targetW, targetH, rng) {
  const { mapData, width, height } = town;
  if (width >= targetW && height >= targetH) return town; // city is already full-size

  const offX = Math.floor((targetW - width) / 2);
  const offY = Math.floor((targetH - height) / 2);

  // fresh grass canvas
  const newMap = [];
  for (let y = 0; y < targetH; y++) {
    const row = [];
    for (let x = 0; x < targetW; x++) {
      row.push({ x, y, type: 'grass', poi: null, walkable: true, isExplored: false });
    }
    newMap.push(row);
  }

  // drop the native core into the centre, re-indexing each tile's coordinates
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = mapData[y][x];
      tile.x = x + offX;
      tile.y = y + offY;
      newMap[y + offY][x + offX] = tile;
    }
  }

  const inCore = (x, y) => x >= offX && x < offX + width && y >= offY && y < offY + height;

  // Carry a coastline out to the canvas edge so the sea reaches the border rather than
  // sitting in a grass moat. Lakes stay contained in the core. Done BEFORE the road/
  // fields/decoration passes (which only write onto grass, so they avoid the new water).
  if (town.water && town.water.kind === 'coast') {
    extendCoastWater(newMap, town.water.edges, offX, offY, width, height, targetW, targetH);
  }

  // Extend EVERY entrance road straight out through the ring to the map edge — BEFORE
  // fields so farmland frames the roads instead of blocking them. Each native gate sits on
  // a core edge; we carry its lane to the canvas border. The primary entrance (first) is
  // the party's spawn; the others are extra gates the player can also leave/enter by.
  const roadType = town.townSize === 'city' ? 'stone_path' : 'dirt_path';
  const layRoad = (x, y) => { newMap[y][x].type = roadType; newMap[y][x].walkable = true; };
  const nativeEntrances = (town.entrances && town.entrances.length)
    ? town.entrances.map((e) => e.pos)
    : [town.entryPoint || { x: Math.floor(width / 2), y: height - 1 }];

  const borderEntrances = nativeEntrances.map((ne) => {
    const gateX = ne.x + offX, gateY = ne.y + offY;
    let edge = { x: gateX, y: gateY };
    if (ne.y === 0) {                        // north edge
      for (let y = gateY - 1; y >= 0; y--) layRoad(gateX, y);
      edge = { x: gateX, y: 0 };
    } else if (ne.y === height - 1) {        // south edge
      for (let y = gateY + 1; y < targetH; y++) layRoad(gateX, y);
      edge = { x: gateX, y: targetH - 1 };
    } else if (ne.x === 0) {                 // west edge
      for (let x = gateX - 1; x >= 0; x--) layRoad(x, gateY);
      edge = { x: 0, y: gateY };
    } else if (ne.x === width - 1) {         // east edge
      for (let x = gateX + 1; x < targetW; x++) layRoad(x, gateY);
      edge = { x: targetW - 1, y: gateY };
    }
    newMap[gateY][gateX].isEntry = false;   // the native gate is now interior on the lane
    newMap[edge.y][edge.x].isGate = true;
    return edge;
  });

  const primary = borderEntrances[0];
  newMap[primary.y][primary.x].isEntry = true;
  town.entryPoint = primary;
  town.entrances = borderEntrances.map((pos, i) => ({ dir: (town.entrances?.[i]?.dir) || null, pos }));

  // scatter farm-field clusters in the countryside ring (never over the core or road).
  // Smaller settlements have a thicker ring, so they get more farmland. Desert towns
  // get none — there are no green fields on sand.
  const ringClusters = town.theme === 'desert' ? 0 : (town.townSize === 'hamlet' ? 12 : town.townSize === 'village' ? 8 : 5);
  for (let i = 0; i < ringClusters; i++) {
    let sx, sy, found = false;
    for (let a = 0; a < 15; a++) {
      sx = Math.floor(rng() * targetW);
      sy = Math.floor(rng() * targetH);
      if (!inCore(sx, sy) && newMap[sy][sx].type === 'grass') { found = true; break; }
    }
    if (!found) continue;
    const cw = 2 + Math.floor(rng() * 2);
    const ch = 2 + Math.floor(rng() * 2);
    for (let dy = 0; dy < ch; dy++) {
      for (let dx = 0; dx < cw; dx++) {
        const x = sx + dx, y = sy + dy;
        if (x < targetW && y < targetH && !inCore(x, y) && newMap[y][x].type === 'grass' && newMap[y][x].poi === null) {
          newMap[y][x].type = 'farm_field';
        }
      }
    }
  }

  // dress remaining ring grass with theme-appropriate cover (grassland trees/bushes/
  // flowers; desert cacti/rocks; snow pines/drifts)
  const deco = decorationSet(town.theme).ring;
  const decoCount = Math.floor((targetW * targetH - width * height) * 0.18);
  for (let i = 0; i < decoCount; i++) {
    const x = Math.floor(rng() * targetW);
    const y = Math.floor(rng() * targetH);
    if (!inCore(x, y) && newMap[y][x].type === 'grass' && newMap[y][x].poi === null) {
      newMap[y][x].poi = deco[Math.floor(rng() * deco.length)];
    }
  }

  town.mapData = newMap;
  town.width = targetW;
  town.height = targetH;
  // entryPoint was moved to the map edge during road extension above.
  if (town.centerPoint) town.centerPoint = { x: town.centerPoint.x + offX, y: town.centerPoint.y + offY };
  return town;
}

// Seeded random number generator
function seededRandom(seed) {
  let state = Number.isFinite(seed) ? seed : 42;
  return function () {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

// Slide a gate a few tiles along its edge (seeded). Skips corners (walls need them) and
// wet tiles; falls back to the unjittered position when no dry offset fits.
function jitterGatePosition(pos, direction, width, height, rng, mapData) {
  const vertical = direction === 'east' || direction === 'west'; // gate slides along y
  const span = vertical ? height : width;
  const base = vertical ? pos.y : pos.x;
  const offset = Math.floor(rng() * 5) - 2; // -2..2
  const candidates = [offset, 0, 1, -1, 2, -2].map((o) => Math.max(2, Math.min(span - 3, base + o)));
  for (const c of candidates) {
    const x = vertical ? pos.x : c;
    const y = vertical ? c : pos.y;
    if (mapData[y] && mapData[y][x] && mapData[y][x].type !== 'water') return { x, y };
  }
  return pos;
}

// Calculate entry position based on direction
function calculateEntryPosition(width, height, direction) {
  const center = Math.floor(width / 2);

  switch (direction) {
    case 'north':
      return { x: center, y: 0 };
    case 'south':
      return { x: center, y: height - 1 };
    case 'east':
      return { x: width - 1, y: Math.floor(height / 2) };
    case 'west':
      return { x: 0, y: Math.floor(height / 2) };
    default:
      return { x: center, y: height - 1 }; // Default to south
  }
}

// Place a river crossing the town
function placeRiverInTown(mapData, riverDirection, width, height, rng) {
  const isHorizontal = riverDirection === 'EAST_WEST';
  const riverWidth = 2;
  const offset = Math.floor(rng() * 3) - 1; // Slightly offset from perfect center
  const center = Math.floor((isHorizontal ? height : width) / 2) + offset;

  if (isHorizontal) {
    for (let y = center; y < center + riverWidth; y++) {
      for (let x = 0; x < width; x++) {
        if (mapData[y] && mapData[y][x]) {
          mapData[y][x].type = 'water';
          mapData[y][x].walkable = false;
        }
      }
    }
  } else {
    for (let x = center; x < center + riverWidth; x++) {
      for (let y = 0; y < height; y++) {
        if (mapData[y] && mapData[y][x]) {
          mapData[y][x].type = 'water';
          mapData[y][x].walkable = false;
        }
      }
    }
  }

  return { isHorizontal, center, riverWidth };
}

// --- world-driven water (lakefront / coastline) ------------------------------

// Carve a lakefront ('lake') or coastline ('coast') into the native town core. Water
// enters only from the flagged edges; a dry core around the square is always preserved
// and total water is capped, so buildings always have room. A sand shore (beach tiles,
// walkable) lines the land/water boundary. Returns the water descriptor for downstream
// steps (padTownToUniform extends a coastline out to the canvas edge).
function placeTownWater(mapData, water, width, height, rng, townSize) {
  const { kind, edges } = water;
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  // Keep the central settlement footprint dry (square + important-building ring).
  const coreR = Math.max(2, Math.round(Math.min(width, height) * 0.28));
  const inDryCore = (x, y) => Math.max(Math.abs(x - centerX), Math.abs(y - centerY)) <= coreR;

  // Water budget = the lower of a hard fraction of the core and "everything left after
  // reserving land for the buildings this size needs". Buildings are placed only in the
  // native core, so this guarantees the roster always fits no matter the coastline.
  const coreArea = width * height;
  const reserved = Math.ceil(buildingTileEstimate(townSize) * 1.8) + 9; // +square/fountain
  const maxWater = Math.max(0, Math.min(Math.floor(coreArea * 0.20), coreArea - reserved));

  let placed = 0;
  const setWater = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    if (inDryCore(x, y)) return;
    const t = mapData[y][x];
    if (t.type === 'water' || placed >= maxWater) return;
    t.type = 'water';
    t.walkable = false;
    t.poi = null;
    placed++;
  };
  const jitter = (n) => Math.floor(rng() * n);

  if (kind === 'coast') {
    // Open sea floods inward from each water edge with a slightly noisy depth.
    const depthV = Math.max(2, Math.round(height * 0.15));
    const depthH = Math.max(2, Math.round(width * 0.15));
    if (edges.N) for (let x = 0; x < width; x++) { const d = depthV + jitter(2); for (let y = 0; y < d; y++) setWater(x, y); }
    if (edges.S) for (let x = 0; x < width; x++) { const d = depthV + jitter(2); for (let y = 0; y < d; y++) setWater(x, height - 1 - y); }
    if (edges.W) for (let y = 0; y < height; y++) { const d = depthH + jitter(2); for (let x = 0; x < d; x++) setWater(x, y); }
    if (edges.E) for (let y = 0; y < height; y++) { const d = depthH + jitter(2); for (let x = 0; x < d; x++) setWater(width - 1 - x, y); }
  } else {
    // Lake: a single contained blob anchored against the water edge / corner.
    const anchorX = edges.W ? 1 + jitter(2) : edges.E ? width - 2 - jitter(2) : centerX + jitter(3) - 1;
    const anchorY = edges.N ? 1 + jitter(2) : edges.S ? height - 2 - jitter(2) : centerY + jitter(3) - 1;
    const radius = Math.max(2, Math.round(Math.min(width, height) * 0.16));
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x - anchorX, dy = y - anchorY;
        const wobble = radius + (rng() - 0.5) * 1.6;
        if (dx * dx + dy * dy <= wobble * wobble) setWater(x, y);
      }
    }
  }

  sandShorePass(mapData, width, height);
  return { kind, edges, coreR };
}

// Any grass tile orthogonally adjacent to water becomes a sand beach (walkable shore).
function sandShorePass(mapData, width, height) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mapData[y][x].type !== 'grass') continue;
      const touchesWater = [[0, -1], [0, 1], [-1, 0], [1, 0]].some(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        return nx >= 0 && nx < width && ny >= 0 && ny < height && mapData[ny][nx].type === 'water';
      });
      if (touchesWater) {
        mapData[y][x].type = 'beach';
        mapData[y][x].walkable = true;
      }
    }
  }
}

// Carry a coastline out from the core through the countryside ring to the canvas edge,
// so the sea reaches the border instead of sitting in a grass moat. For each watered
// edge, columns/rows whose core-boundary tile is wet (or the ring corners) extend to the
// border; dry central columns stay as a small headland the town sits on.
function extendCoastWater(newMap, edges, offX, offY, coreW, coreH, targetW, targetH) {
  const wet = (t) => t && (t.type === 'water' || t.type === 'beach');
  const fillWater = (x, y) => {
    const t = newMap[y] && newMap[y][x];
    if (!t || t.type === 'water') return;
    t.type = 'water'; t.walkable = false; t.poi = null;
  };
  const inCoreX = (x) => x >= offX && x < offX + coreW;
  const inCoreY = (y) => y >= offY && y < offY + coreH;

  if (edges.S) for (let x = 0; x < targetW; x++) {
    if (inCoreX(x) && !wet(newMap[offY + coreH - 1][x])) continue;
    for (let y = offY + coreH; y < targetH; y++) fillWater(x, y);
  }
  if (edges.N) for (let x = 0; x < targetW; x++) {
    if (inCoreX(x) && !wet(newMap[offY][x])) continue;
    for (let y = offY - 1; y >= 0; y--) fillWater(x, y);
  }
  if (edges.E) for (let y = 0; y < targetH; y++) {
    if (inCoreY(y) && !wet(newMap[y][offX + coreW - 1])) continue;
    for (let x = offX + coreW; x < targetW; x++) fillWater(x, y);
  }
  if (edges.W) for (let y = 0; y < targetH; y++) {
    if (inCoreY(y) && !wet(newMap[y][offX])) continue;
    for (let x = offX - 1; x >= 0; x--) fillWater(x, y);
  }

  sandShorePass(newMap, targetW, targetH);
}

// =============================================================================
// Path network — HUB AND SPOKE with WINDY spokes (redesigned 2026-07)
//
// Topology: the town square is the HUB. Every world-road entrance gets a GATE on its
// town edge, and every gate is routed to the hub. Major buildings (townhall, tavern,
// inn, temple, market, blacksmith — plus the keep) get SPOKES routed from the hub;
// minor service buildings and unserved houses attach via short STUBS to the NEAREST
// existing path, so lanes are shared instead of every building drawing its own ray
// (the old system's "path spaghetti").
//
// Windiness: routes come from a deterministic Dijkstra where every tile carries seeded
// cost noise (PATH_WINDINESS × [0,1) on top of the base step cost of 1). Cheapest
// routes meander gently around "expensive" tiles instead of running straight. Existing
// path tiles are heavily discounted (PATH_REUSE_COST), so later spokes merge into the
// trunks laid by earlier ones — the network grows as a tree rooted at the hub.
//
// Invariants (asserted by townMapGenerator.test.js across a seed survey):
//   • one connected path component containing the hub and every gate — zero orphans
//     (pruneOrphanPaths is a belt-and-braces sweep; routing alone should never orphan)
//   • every non-house building orthogonally adjacent to a path (keep: via its wall ring)
//   • no route through water: lake/coast water is impassable; the authored river band
//     may be crossed (laid as 'bridge'), and CAUSEWAY_WATER_COST is a fallback so a
//     gate/building cut off by water still gets the shortest possible causeway.
// Waterfront buildings route with discounted beach cost, so their lanes run along the
// shore as a quay before joining the network.
// =============================================================================

// Tile types that count as part of the walkable path network.
const isPathType = (t) => t === 'dirt_path' || t === 'stone_path' || t === 'town_square' || t === 'bridge';

// Windiness factor: amplitude of the seeded per-tile cost noise layered over the base
// step cost of 1. Higher = wigglier spokes; 0 = straight rays. Tuned on /debug/tileset.
export const PATH_WINDINESS = 2.2;
const PATH_REUSE_COST = 0.35;   // walking an existing path is cheap → spokes share trunks
const BEACH_STEP_COST = 1.6;    // roads prefer grass over sand…
const QUAY_BEACH_COST = 0.7;    // …except waterfront lanes, which hug the shore
const BORDER_STEP_PENALTY = 6;  // keep routes off the map border (one wall gate per road)
const RIVER_BRIDGE_COST = 5;    // crossing the authored river is allowed but dear
const CAUSEWAY_WATER_COST = 15; // fallback-only: shortest causeway when no land route exists

// Deterministic per-tile noise in [0,1), salted once per town from the seeded rng.
function makeCostNoise(rng) {
  const salt = Math.floor(rng() * 0x7fffffff);
  return (x, y) => {
    let h = (Math.imul(x + 1, 374761393) + Math.imul(y + 1, 668265263) + salt) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = (h ^ (h >>> 16)) >>> 0;
    return (h & 1023) / 1024;
  };
}

function inRiverBand(riverInfo, x, y) {
  if (!riverInfo) return false;
  return riverInfo.isHorizontal
    ? y >= riverInfo.center && y < riverInfo.center + riverInfo.riverWidth
    : x >= riverInfo.center && x < riverInfo.center + riverInfo.riverWidth;
}

// Multi-source Dijkstra over the town grid. Returns the cheapest route (array of
// {x,y}, sources first) from any of `starts` to the first tile where isTarget(x,y)
// holds, or null when unreachable. Fully deterministic: ties break on tile index.
function routeWindyPath(mapData, starts, isTarget, opts) {
  const width = mapData[0].length;
  const height = mapData.length;
  const {
    noise, riverInfo = null, beachCost = BEACH_STEP_COST,
    waterCost = null, windiness = PATH_WINDINESS,
    noPave = null, allowTiles = null,
  } = opts;

  const enterCost = (x, y) => {
    // protected tiles (e.g. the sand in front of a dock building) are never paved —
    // unless explicitly allowed for this route (a stub with no other landing)
    if (noPave && noPave.has(`${x},${y}`) && !(allowTiles && allowTiles.has(`${x},${y}`))) return Infinity;
    const t = mapData[y][x];
    let c;
    if (isPathType(t.type)) c = PATH_REUSE_COST;
    else if (t.type === 'grass') c = 1 + windiness * noise(x, y);
    else if (t.type === 'beach') c = beachCost + windiness * noise(x, y);
    else if (t.type === 'water') {
      if (inRiverBand(riverInfo, x, y)) c = RIVER_BRIDGE_COST;
      else if (waterCost !== null) c = waterCost;
      else return Infinity;
    } else return Infinity; // building / wall / keep_wall / farm_field / square-adjacent solids
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) c += BORDER_STEP_PENALTY;
    return c;
  };

  const idx = (x, y) => y * width + x;
  const dist = new Float64Array(width * height).fill(Infinity);
  const prev = new Int32Array(width * height).fill(-1);
  const done = new Uint8Array(width * height);
  const frontier = [];
  for (const s of starts) {
    const i = idx(s.x, s.y);
    if (dist[i] !== 0) { dist[i] = 0; frontier.push(i); }
  }

  while (frontier.length) {
    let bi = 0; // deterministic min: lowest cost, ties by tile index
    for (let k = 1; k < frontier.length; k++) {
      const a = frontier[k], b = frontier[bi];
      if (dist[a] < dist[b] || (dist[a] === dist[b] && a < b)) bi = k;
    }
    const cur = frontier.splice(bi, 1)[0];
    if (done[cur]) continue;
    done[cur] = 1;
    const cx = cur % width, cy = (cur - cx) / width;

    if (isTarget(cx, cy)) {
      const route = [];
      for (let i = cur; i !== -1; i = prev[i]) route.push({ x: i % width, y: (i - (i % width)) / width });
      return route.reverse();
    }

    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = idx(nx, ny);
      if (done[ni]) continue;
      const c = enterCost(nx, ny);
      if (c === Infinity) continue;
      const nd = dist[cur] + c;
      if (nd < dist[ni] - 1e-9) { dist[ni] = nd; prev[ni] = cur; frontier.push(ni); }
    }
  }
  return null;
}

// Stamp a route onto the map. Existing path tiles pass through untouched; water becomes
// a bridge; grass/beach becomes stone near the hub (paved core; cities fully paved) and
// dirt further out.
function layPathRoute(mapData, route, centerPos, townSize) {
  const width = mapData[0].length;
  const height = mapData.length;
  const paveRadius = Math.floor(Math.max(width, height) / 4);
  for (const { x, y } of route) {
    const t = mapData[y][x];
    if (isPathType(t.type)) continue;
    if (t.type === 'water') {
      t.type = 'bridge';
      t.walkable = true;
      t.poi = null;
      continue;
    }
    const distFromCenter = Math.abs(x - centerPos.x) + Math.abs(y - centerPos.y);
    t.type = (townSize === 'city' || distFromCenter < paveRadius) ? 'stone_path' : 'dirt_path';
    t.walkable = true;
    t.poi = null;
  }
}

// Record shape metrics for one spoke (used by the windiness tests + /debug/tileset).
function recordSpoke(stats, kind, route) {
  if (!stats || !route || route.length < 2) return;
  let bends = 0;
  for (let i = 2; i < route.length; i++) {
    const ax = route[i - 1].x - route[i - 2].x, ay = route[i - 1].y - route[i - 2].y;
    const bx = route[i].x - route[i - 1].x, by = route[i].y - route[i - 1].y;
    if (ax !== bx || ay !== by) bends++;
  }
  const a = route[0], b = route[route.length - 1];
  const straight = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  stats.push({ kind, length: route.length - 1, straight, bends });
}

// Route one gate to the hub. Water is impassable on the first attempt (routes go AROUND
// lakes/inlets); if that fails the retry may lay the shortest possible causeway, so a
// gate is never left unconnected.
//
// Windiness needs a nudge here: a gate roughly axis-aligned with the hub would route as
// a near-straight ray, because the cheapest possible deviation costs two extra steps and
// per-tile noise rarely repays that. So longer approaches are routed through a seeded
// midpoint WAYPOINT displaced perpendicular to the approach — that forces the S-bend,
// and the cost noise decorates each leg.
function placeGateRoad(mapData, gatePos, centerPos, { noise, riverInfo, townSize, stats, rng }) {
  const width = mapData[0].length;
  const height = mapData.length;
  const isHub = (x, y) => x === centerPos.x && y === centerPos.y;
  const base = { noise, riverInfo };

  let route = null;
  const dx = centerPos.x - gatePos.x;
  const dy = centerPos.y - gatePos.y;
  if (Math.abs(dx) + Math.abs(dy) >= 4 && rng) {
    const mag = (1 + Math.floor(rng() * 2)) * (rng() < 0.5 ? -1 : 1); // ±1..2 perpendicular
    let wx = Math.round((gatePos.x + centerPos.x) / 2);
    let wy = Math.round((gatePos.y + centerPos.y) / 2);
    if (Math.abs(dy) >= Math.abs(dx)) wx += mag; else wy += mag;
    wx = Math.max(1, Math.min(width - 2, wx));
    wy = Math.max(1, Math.min(height - 2, wy));
    const wTile = mapData[wy][wx];
    if (wTile.type === 'grass' || wTile.type === 'beach' || isPathType(wTile.type)) {
      const leg1 = routeWindyPath(mapData, [gatePos], (x, y) => x === wx && y === wy, base);
      const leg2 = leg1 && routeWindyPath(mapData, [{ x: wx, y: wy }], isHub, base);
      if (leg1 && leg2) route = [...leg1, ...leg2.slice(1)];
    }
  }

  if (!route) route = routeWindyPath(mapData, [gatePos], isHub, base);
  if (!route) route = routeWindyPath(mapData, [gatePos], isHub, { ...base, waterCost: CAUSEWAY_WATER_COST });
  if (!route) {
    logger.warn(`[TOWN_MAP] Could not route gate road from (${gatePos.x}, ${gatePos.y}) to the hub`);
    return;
  }
  layPathRoute(mapData, route, centerPos, townSize);
  recordSpoke(stats, 'gate', route);
}

// Connect a just-placed building to the network IMMEDIATELY (called from placeBuildings
// as each building lands). Because later buildings only ever build on grass — never on a
// path — a lane laid now can never be sealed off by anything placed afterwards. Majors
// get a windy spoke from the hub; everything else stubs to the NEAREST existing path
// (waterfront buildings with discounted beach cost, so their stubs run along the quay).
function connectBuildingToNetwork(mapData, pos, buildingType, centerPos, opts) {
  if (!opts) return;
  const { noise, riverInfo = null, townSize = 'village', stats = null, noPave = null } = opts;
  const width = mapData[0].length;
  const height = mapData.length;
  const inBounds = (x, y) => x >= 0 && x < width && y >= 0 && y < height;

  // already served?
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    if (inBounds(pos.x + dx, pos.y + dy) && isPathType(mapData[pos.y + dy][pos.x + dx].type)) return;
  }

  let front = [];
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    const nx = pos.x + dx, ny = pos.y + dy;
    if (!inBounds(nx, ny)) continue;
    const t = mapData[ny][nx].type;
    if (t === 'grass' || t === 'beach') front.push({ x: nx, y: ny });
  }
  if (!front.length) {
    logger.debug(`[TOWN_MAP] ${buildingType} at (${pos.x}, ${pos.y}) has no routable frontage`);
    return;
  }

  let touchesShore = false;
  for (let dy = -1; dy <= 1 && !touchesShore; dy++) {
    for (let dx = -1; dx <= 1 && !touchesShore; dx++) {
      const t = inBounds(pos.x + dx, pos.y + dy) && mapData[pos.y + dy][pos.x + dx];
      if (t && (t.type === 'water' || t.type === 'beach')) touchesShore = true;
    }
  }
  // A shore building's lane lands on GRASS when it can, so the building keeps its sand
  // frontage (a harbormaster paved off its own beach would stop reading as dockside).
  if (touchesShore) {
    const grassFront = front.filter((p) => mapData[p.y][p.x].type === 'grass');
    if (grassFront.length) front = grassFront;
  }
  // Respect protected sand (another dock's frontage) — but if that is this building's
  // ONLY frontage, the protection yields so the building still gets its lane.
  let allowTiles = null;
  if (noPave) {
    const open = front.filter((p) => !noPave.has(`${p.x},${p.y}`));
    if (open.length) front = open;
    else allowTiles = new Set(front.map((p) => `${p.x},${p.y}`));
  }
  const base = { noise, riverInfo, noPave, allowTiles, ...(touchesShore ? { beachCost: QUAY_BEACH_COST } : {}) };

  let route;
  if (MAJOR_SPOKE_TYPES.has(buildingType)) {
    const targets = new Set(front.map((p) => p.x * height + p.y));
    const isTarget = (x, y) => targets.has(x * height + y);
    route = routeWindyPath(mapData, [centerPos], isTarget, base)
      || routeWindyPath(mapData, [centerPos], isTarget, { ...base, waterCost: CAUSEWAY_WATER_COST });
  } else {
    const onNetwork = (x, y) => isPathType(mapData[y][x].type);
    route = routeWindyPath(mapData, front, onNetwork, base)
      || routeWindyPath(mapData, front, onNetwork, { ...base, waterCost: CAUSEWAY_WATER_COST });
  }
  if (!route) {
    logger.warn(`[TOWN_MAP] Could not connect ${buildingType} at (${pos.x}, ${pos.y}) to the path network`);
    return;
  }
  layPathRoute(mapData, route, centerPos, townSize);
  recordSpoke(stats, MAJOR_SPOKE_TYPES.has(buildingType) ? 'major' : 'minor', route);
}

// Route the keep's spoke from the hub to the open tiles just outside its curtain wall
// (or its own frontage where a wall segment is missing). Called at keep-placement time,
// BEFORE the noble estate / gaol are placed, so they cluster around the lane. If every
// approach tile is water (a coast-squeezed keep) the fallback lays a causeway to the
// wall, so the lord's seat is never left without an approach.
function routeKeepSpoke(mapData, keepPos, centerPos, { noise, riverInfo, townSize, stats }) {
  const width = mapData[0].length;
  const height = mapData.length;
  const inBounds = (x, y) => x >= 0 && x < width && y >= 0 && y < height;
  const targets = new Set();
  const wetTargets = new Set();
  const collect = (x, y) => {
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const t = mapData[ny][nx].type;
      if (t === 'grass' || t === 'beach' || isPathType(t)) targets.add(nx * height + ny);
      else if (t === 'water') wetTargets.add(nx * height + ny);
    }
  };
  collect(keepPos.x, keepPos.y);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = keepPos.x + dx, ny = keepPos.y + dy;
      if (inBounds(nx, ny) && mapData[ny][nx].type === 'keep_wall') collect(nx, ny);
    }
  }
  const lay = (route) => {
    if (!route) return false;
    layPathRoute(mapData, route, centerPos, townSize);
    recordSpoke(stats, 'keep', route);
    return true;
  };
  const base = { noise, riverInfo };
  let done = targets.size > 0 && (
    lay(routeWindyPath(mapData, [centerPos], (x, y) => targets.has(x * height + y), base)) ||
    lay(routeWindyPath(mapData, [centerPos], (x, y) => targets.has(x * height + y), { ...base, waterCost: CAUSEWAY_WATER_COST }))
  );
  if (!done && wetTargets.size > 0) {
    done = lay(routeWindyPath(mapData, [centerPos], (x, y) => wetTargets.has(x * height + y), { ...base, waterCost: CAUSEWAY_WATER_COST }));
  }
  if (!done) logger.warn(`[TOWN_MAP] Keep at (${keepPos.x}, ${keepPos.y}) has no routable approach`);
}

// Place city walls around perimeter (cities only).
// Walls run over grass AND along the sand shore (beach), but NEVER onto water — so a
// wall that reaches the waterline simply ends there. The autotiler (townTileArt) keys
// each wall tile off its wall neighbours, so the tile next to the gap renders as a clean
// end-cap: the wall terminates at the water instead of floating across it.
function placeCityWalls(mapData) {
  const width = mapData[0].length;
  const height = mapData.length;
  const wallable = (t) => t.type === 'grass' || t.type === 'beach';

  // Place walls on all perimeter tiles
  for (let x = 0; x < width; x++) {
    if (wallable(mapData[0][x])) mapData[0][x].type = 'wall';
    if (wallable(mapData[height - 1][x])) mapData[height - 1][x].type = 'wall';
  }
  for (let y = 0; y < height; y++) {
    if (wallable(mapData[y][0])) mapData[y][0].type = 'wall';
    if (wallable(mapData[y][width - 1])) mapData[y][width - 1].type = 'wall';
  }

  logger.debug('[TOWN_MAP] Placed city walls around perimeter');
}

// Place town center/square
function placeTownCenter(mapData, centerPos, townSize) {
  const sizeMap = {
    hamlet: 1,    // Smaller squares
    village: 2,
    town: 3,
    city: 3
  };

  const squareSize = sizeMap[townSize] || 2;
  const halfSize = Math.floor(squareSize / 2);

  for (let dy = -halfSize; dy <= halfSize; dy++) {
    for (let dx = -halfSize; dx <= halfSize; dx++) {
      const x = centerPos.x + dx;
      const y = centerPos.y + dy;

      if (x >= 0 && x < mapData[0].length && y >= 0 && y < mapData.length) {
        // Town square is a solid tile (not thin path)
        mapData[y][x].type = 'town_square';

        // Place a fountain in the very center (on top of square) for every town
        // size — the old bucket/well for smaller towns never looked great.
        if (dx === 0 && dy === 0) {
          mapData[y][x].poi = 'fountain';
        }
      }
    }
  }
}

// Place buildings around the town - COMPLETELY REWRITTEN
function placeBuildings(mapData, count, townSize, rng, centerPos, hasWater = false, pathOpts = null) {
  if (!centerPos) {
    logger.warn('[TOWN_MAP] placeBuildings called with undefined centerPos, using map defaults');
    centerPos = { x: Math.floor(mapData[0].length / 2), y: Math.floor(mapData.length / 2) };
  }

  const centerX = centerPos.x;
  const centerY = centerPos.y;

  // Per-size building roster (module-level so the water step reserves matching land).
  // Houses are placed separately in placeHouses, after the path network exists.
  const config = BUILDING_CONFIG[townSize] || BUILDING_CONFIG.village;
  const { important } = config;

  // Track occupied positions
  const occupied = new Set();

  // Helper to mark tile as occupied
  const markOccupied = (x, y) => {
    occupied.add(`${x},${y}`);
  };

  // Helper to check if occupied
  const isOccupied = (x, y) => {
    if (x === undefined || y === undefined) {
      logger.warn('[TOWN_MAP] isOccupied called with undefined coordinates:', { x, y });
      return true;
    }
    if (x < 0 || x >= mapData[0].length || y < 0 || y >= mapData.length) return true;
    if (occupied.has(`${x},${y}`)) return true;

    // Safety check mapData access
    if (!mapData[y] || !mapData[y][x]) {
      logger.warn('[TOWN_MAP] isOccupied: tile undefined at', { x, y });
      return true;
    }

    const tile = mapData[y][x];
    // Only place on empty grass (no paths, no buildings)
    return tile.type !== 'grass';
  };

  // Get square size
  const squareSize = townSize === 'hamlet' ? 1 : townSize === 'village' ? 2 : 3;
  const halfSize = Math.floor(squareSize / 2);

  // Shore-averse buildings: a stable (damp/footing), a barn (farmland, not docks) and a
  // bank (kept central/civic) should not sit on the waterfront. They avoid any tile within
  // one step of water/beach. Dock-appropriate buildings (harbormaster, warehouse) are
  // placed separately on the shore (STEP 1.7) and are NOT averse.
  const SHORE_AVERSE = new Set(['stables', 'barn', 'bank']);
  const isShore = (x, y) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const t = mapData[y + dy] && mapData[y + dy][x + dx];
        if (t && (t.type === 'water' || t.type === 'beach')) return true;
      }
    }
    return false;
  };
  // A building must keep at least one open orthogonal side (grass/beach/path) so a lane
  // can reach its door — never brick a civic building into a pocket with no frontage.
  const hasOpenSide = (x, y) => [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => {
    const t = mapData[y + dy] && mapData[y + dy][x + dx];
    return t && (t.type === 'grass' || t.type === 'beach' || isPathType(t.type));
  });
  const blockedFor = (x, y, type) => isOccupied(x, y) || !hasOpenSide(x, y) || (SHORE_AVERSE.has(type) && isShore(x, y));

  // The noble estate (STEP 0.5) is a deliberately tight manor cluster. Civic/commerce
  // buildings must NOT be wedged into it: a building sealed inside the manor block has
  // no frontage a lane can reach. Zone is set once the manors are placed.
  const inEstateZone = (x, y) => {
    const z = config._estateZone;
    return !!z && x >= z.minX && x <= z.maxX && y >= z.minY && y <= z.maxY;
  };

  // The keep's anchor row, shared with the noble-estate step below. Defaults to the
  // classic top-centre slot; relocated downward if a coastline floods the top of the city.
  let keepX = centerX;
  let keepY = 3;

  // STEP 0: Place the keep (cities only). REQUIRED.
  if (config.hasKeep) {
    const W = mapData[0].length, H = mapData.length;
    const tileFree = (x, y) => x > 0 && x < W - 1 && y > 0 && y < H - 1 && mapData[y][x].type === 'grass';
    const placeKeep = (x, y) => {
      const t = mapData[y][x];
      t.type = 'building'; t.buildingType = 'keep'; t.buildingName = generateManorName(rng);
      t.walkable = false; t.poi = null; markOccupied(x, y);
    };
    // keep_wall is placed only on FREE GRASS, so it stops at water (a clean terminus) and
    // never overwrites the city wall, a road, or another building — the walls are respected.
    const keepWall = (x, y) => { if (tileFree(x, y)) { mapData[y][x].type = 'keep_wall'; markOccupied(x, y); } };
    // (The keep's path to the square is routed later by generateBuildingPaths — the keep
    // gets a windy hub spoke to its curtain wall like every other major building.)

    // MAIN placement: classic top-centre slot. Search from the top for the first dry tile
    // near the centre column (dodges a coastline), then ring it with a TIGHT 3x3 keep_wall.
    const tryCentre = () => {
      let fx = -1, fy = -1;
      for (let y = 3; y <= centerY - 2 && fy < 0; y++) {
        for (let off = 0; off <= 4 && fy < 0; off++) {
          for (const xx of (off === 0 ? [centerX] : [centerX - off, centerX + off])) {
            if (tileFree(xx, y)) { fx = xx; fy = y; break; }
          }
        }
      }
      if (fy < 0) return false;
      keepX = fx; keepY = fy;
      placeKeep(fx, fy);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((Math.abs(dx) === 1 || Math.abs(dy) === 1) && !(dx === 0 && dy === 0)) keepWall(fx + dx, fy + dy);
        }
      }
      // Reserve the tile below the gate-side wall so later buildings (manors cluster
      // right here) can never brick the keep in — the hub spoke lands on this tile.
      if (fy + 2 < H) markOccupied(fx, fy + 2);
      return true;
    };

    // OPTIONAL placement: tuck the keep tight into a city corner, REUSING the two perimeter
    // walls as two of its own sides; keep_wall hugs the keep on the other two (an L) with a
    // gate toward the square. Used to free up the centre of busy/coastal cities — not the
    // default. The keep sits one tile in from the corner so its walls stay tight.
    const tryCorner = () => {
      const corners = [
        { cx: 0, cy: 0, sx: 1, sy: 1 },
        { cx: W - 1, cy: 0, sx: -1, sy: 1 },
        { cx: 0, cy: H - 1, sx: 1, sy: -1 },
        { cx: W - 1, cy: H - 1, sx: -1, sy: -1 },
      ];
      for (let i = corners.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [corners[i], corners[j]] = [corners[j], corners[i]]; }
      for (const c of corners) {
        const kx = c.cx + c.sx, ky = c.cy + c.sy;          // inset 1: keep hugs the corner walls
        const wallE = { x: c.cx + 2 * c.sx, y: c.cy + c.sy };       // inner wall, X side
        const wallS = { x: c.cx + c.sx, y: c.cy + 2 * c.sy };       // gate side, Y axis (toward centre)
        const wallC = { x: c.cx + 2 * c.sx, y: c.cy + 2 * c.sy };   // diagonal corner of the L
        const approach = { x: c.cx + c.sx, y: c.cy + 3 * c.sy };    // where the keep's lane will start
        // the approach tile must be dry land too, so the hub spoke can actually reach
        // the keep gate (a corner flooded by a coastline is skipped)
        if (![{ x: kx, y: ky }, wallE, wallS, wallC, approach].every((p) => tileFree(p.x, p.y))) continue;
        keepX = kx; keepY = ky;
        placeKeep(kx, ky);
        // Fully enclose: the two city walls cover the outer sides; keep_wall covers the two
        // inner sides + the diagonal corner, so the keep is walled on all sides (like the
        // central keep). A path runs from just outside the wall to the square.
        keepWall(wallE.x, wallE.y);
        keepWall(wallS.x, wallS.y);
        keepWall(wallC.x, wallC.y);
        // Reserve the approach tile beyond the gate-side wall (same reason as the
        // central keep: the estate cluster must not brick the keep in).
        markOccupied(approach.x, approach.y);
        logger.debug(`[TOWN_MAP] Placed corner keep at (${kx}, ${ky}) reusing city walls`);
        return true;
      }
      return false;
    };

    // The central keep is the default. A corner keep is an OPTION, used ~half the time on
    // coastal cities to keep the lord's seat out of the crowded waterfront centre — not
    // forced. Either way the keep falls back to the other strategy if the first can't
    // place. Keep + walls are placed here, before any other building, so the footprint is
    // reserved.
    const wantCorner = hasWater && rng() < 0.5;
    const placed = wantCorner
      ? (tryCorner() || tryCentre())
      : (tryCentre() || tryCorner());
    if (!placed) logger.warn('[TOWN_MAP] Could not place the city keep');

    // Route the keep's lane to the hub NOW, before the noble estate / gaol / everything
    // else fills the area — later placements only build on grass, so they cluster
    // around the lane instead of sealing the keep in.
    if (placed && pathOpts) routeKeepSpoke(mapData, { x: keepX, y: keepY }, centerPos, pathOpts);
  }

  // STEP 0.5: Place noble estate manors between keep and town square (cities only).
  // Anchored off the keep's ACTUAL row (which may have moved inland to dodge a coastline).
  if (config.nobleEstate) {
    const estateManors = config.nobleEstate;
    let manorsPlaced = 0;

    // The noble quarter clusters NEAR THE KEEP (nobles live by the lord's seat), a few
    // tiles toward the city interior — works whether the keep is central or in a corner.
    const estateSide = rng() < 0.5 ? -1 : 1;
    const towardCenterX = Math.sign(centerX - keepX) || 1;
    const towardCenterY = Math.sign(centerY - keepY) || 1;
    const estateStartX = keepX + towardCenterX * 2 + estateSide;
    const estateStartY = keepY + towardCenterY * 2;

    // Build cluster: place first manor at anchor, then grow outward from placed manors
    const placedManorPositions = [];

    for (const manorType of estateManors) {
      let placed = false;

      if (placedManorPositions.length === 0) {
        // First manor: place at anchor point, or find nearest valid spot
        for (let r = 0; r <= 3 && !placed; r++) {
          for (let dy = -r; dy <= r && !placed; dy++) {
            for (let dx = -r; dx <= r && !placed; dx++) {
              if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
              const x = estateStartX + dx;
              const y = estateStartY + dy;
              if (!isOccupied(x, y)) {
                mapData[y][x].type = 'building';
                mapData[y][x].buildingType = manorType;
                mapData[y][x].buildingName = generateManorName(rng);
                mapData[y][x].walkable = false;
                mapData[y][x].poi = null;
                markOccupied(x, y);
                connectBuildingToNetwork(mapData, { x, y }, manorType, centerPos, pathOpts);
                placedManorPositions.push({ x, y });
                manorsPlaced++;
                placed = true;
              }
            }
          }
        }
      } else {
        // Subsequent manors: find spots adjacent to already-placed manors
        const adjacentCandidates = [];
        for (const mp of placedManorPositions) {
          for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            adjacentCandidates.push({ x: mp.x + dx, y: mp.y + dy });
          }
        }
        // Shuffle adjacent candidates
        for (let i = adjacentCandidates.length - 1; i > 0; i--) {
          const j = Math.floor(rng() * (i + 1));
          [adjacentCandidates[i], adjacentCandidates[j]] = [adjacentCandidates[j], adjacentCandidates[i]];
        }
        // Escalating fallbacks (playtest 2026-07-05: a boxed-in cluster silently
        // dropped the fifth manor, one seed in ~60 shipping a lesser city).
        // Tier 2 loosens to a distance-2 ring around the cluster; tier 3 falls
        // back to the anchor spiral. The estate stays tight when it can and the
        // roster is guaranteed when it cannot.
        if (!placed) {
          for (const mp of placedManorPositions) {
            for (let dy = -2; dy <= 2; dy++) {
              for (let dx = -2; dx <= 2; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== 2) continue;
                adjacentCandidates.push({ x: mp.x + dx, y: mp.y + dy });
              }
            }
          }
          for (let r = 0; r <= 5; r++) {
            for (let dy = -r; dy <= r; dy++) {
              for (let dx = -r; dx <= r; dx++) {
                if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                adjacentCandidates.push({ x: estateStartX + dx, y: estateStartY + dy });
              }
            }
          }
        }
        for (const pos of adjacentCandidates) {
          if (!isOccupied(pos.x, pos.y)) {
            mapData[pos.y][pos.x].type = 'building';
            mapData[pos.y][pos.x].buildingType = manorType;
            mapData[pos.y][pos.x].buildingName = generateManorName(rng);
            mapData[pos.y][pos.x].walkable = false;
            mapData[pos.y][pos.x].poi = null;
            markOccupied(pos.x, pos.y);
            connectBuildingToNetwork(mapData, pos, manorType, centerPos, pathOpts);
            placedManorPositions.push(pos);
            manorsPlaced++;
            placed = true;
            break;
          }
        }
      }
    }

    // Record noble estate exclusion zone (bounding box of placed manors + 1 tile padding)
    if (placedManorPositions.length > 0) {
      const minX = Math.min(...placedManorPositions.map(p => p.x)) - 1;
      const maxX = Math.max(...placedManorPositions.map(p => p.x)) + 1;
      const minY = Math.min(...placedManorPositions.map(p => p.y)) - 1;
      const maxY = Math.max(...placedManorPositions.map(p => p.y)) + 1;
      config._estateZone = { minX, maxX, minY, maxY };
    }

    logger.debug(`[TOWN_MAP] Placed ${manorsPlaced} noble estate manors clustered near (${estateStartX}, ${estateStartY})`);
  }

  // Track used building names to prevent duplicates within a town
  const usedNames = new Set();

  // Generate a unique name using the given generator, retrying on collisions
  const uniqueName = (generator) => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const name = generator();
      if (!usedNames.has(name)) {
        usedNames.add(name);
        return name;
      }
    }
    // Fallback: accept the last generated name rather than looping forever
    return generator();
  };

  // Helper: assign a generated name to a building tile based on its type
  const assignBuildingName = (tile, buildingType) => {
    if (buildingType === 'tavern' || buildingType === 'inn') {
      tile.buildingName = uniqueName(() => generateTavernName(rng));
    } else if (buildingType === 'guild') {
      tile.buildingName = uniqueName(() => generateGuildName(rng));
    } else if (buildingType === 'bank') {
      tile.buildingName = uniqueName(() => generateBankName(rng));
    } else if (buildingType === 'shop' || buildingType === 'market') {
      tile.buildingName = uniqueName(() => generateShopName(rng));
    } else if (buildingType === 'blacksmith') {
      const blacksmithNames = ["Iron Anvil", "Heavy Hammer", "Strong Forge", "Dragon Sunder", "Steel Strike", "The Hearth Forge"];
      tile.buildingName = uniqueName(() => blacksmithNames[Math.floor(rng() * blacksmithNames.length)]);
    } else if (buildingType === 'manor' || buildingType === 'keep') {
      tile.buildingName = uniqueName(() => generateManorName(rng));
    } else if (buildingType === 'temple') {
      tile.buildingName = uniqueName(() => generateTempleName(rng));
    } else if (buildingType === 'archives' || buildingType === 'library') {
      const archiveNames = ["Hall of Records", "The Dusty Stacks", "Lorekeeper's Archive", "The Old Library", "Scholar's Rest", "The Athenaeum"];
      tile.buildingName = uniqueName(() => archiveNames[Math.floor(rng() * archiveNames.length)]);
    } else if (buildingType === 'alchemist') {
      const alchemistNames = ["The Bubbling Flask", "Elixir & Tonic", "The Green Vial", "Apothecary's Den", "The Alembic", "Mystic Brews"];
      tile.buildingName = uniqueName(() => alchemistNames[Math.floor(rng() * alchemistNames.length)]);
    } else if (buildingType === 'foundry') {
      const foundryNames = ["The Great Furnace", "Ironworks", "The Smeltery", "Crucible Foundry", "The Fire Pit", "Molten Works"];
      tile.buildingName = uniqueName(() => foundryNames[Math.floor(rng() * foundryNames.length)]);
    } else if (buildingType === 'warehouse') {
      const warehouseNames = ["The Storehouse", "Trade Depot", "The Granary", "Merchant's Cache", "The Vault", "Supply Hold"];
      tile.buildingName = uniqueName(() => warehouseNames[Math.floor(rng() * warehouseNames.length)]);
    }
  };

  // Helper: place a building on a tile, then connect it to the path network right away
  // (a lane laid now can never be sealed off by later placements — they avoid paths).
  const placeBuilding = (x, y, buildingType) => {
    mapData[y][x].type = 'building';
    mapData[y][x].buildingType = buildingType;
    mapData[y][x].walkable = false;
    mapData[y][x].poi = null;
    assignBuildingName(mapData[y][x], buildingType);
    markOccupied(x, y);
    connectBuildingToNetwork(mapData, { x, y }, buildingType, centerPos, pathOpts);
  };

  // STEP 0.6: The gaol sits in the authority cluster — historically the town gaol was part
  // of the castle, so we place it on the first free tile spiralling out from the keep
  // (which is already placed). Done before the market/house steps so it claims its spot.
  if (config.hasJail) {
    let jailPlaced = false;
    for (let r = 1; r <= 6 && !jailPlaced; r++) {
      for (let dy = -r; dy <= r && !jailPlaced; dy++) {
        for (let dx = -r; dx <= r && !jailPlaced; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // ring perimeter only
          const x = keepX + dx, y = keepY + dy;
          if (!blockedFor(x, y, 'jail')) { placeBuilding(x, y, 'jail'); jailPlaced = true; }
        }
      }
    }
    if (!jailPlaced) logger.warn('[TOWN_MAP] No free tile near the keep for the gaol');
  }

  // STEP 1: Place important buildings around town square clockwise
  logger.debug(`[TOWN_MAP] Placing ${important.length} important buildings around square...`);

  // Get positions around the square (clockwise from top)
  const squarePositions = [];

  // Top edge (left to right)
  for (let dx = -halfSize - 1; dx <= halfSize + 1; dx++) {
    squarePositions.push({ x: centerX + dx, y: centerY - halfSize - 1 });
  }

  // Right edge (top to bottom, skip corner)
  for (let dy = -halfSize; dy <= halfSize + 1; dy++) {
    squarePositions.push({ x: centerX + halfSize + 1, y: centerY + dy });
  }

  // Bottom edge (right to left, skip corner)
  for (let dx = halfSize; dx >= -halfSize - 1; dx--) {
    squarePositions.push({ x: centerX + dx, y: centerY + halfSize + 1 });
  }

  // Left edge (bottom to top, skip corners)
  for (let dy = halfSize; dy >= -halfSize; dy--) {
    squarePositions.push({ x: centerX - halfSize - 1, y: centerY + dy });
  }

  // STEP 0.9: The civic hall faces the square itself. Claim the prominent top-centre
  // frontage (middle of the square's top edge, looking down on the fountain) before the
  // other important buildings fill the ring; fall back to any free square slot.
  if (config.civicHall) {
    const prime = { x: centerX, y: centerY - halfSize - 1 };
    let hallPlaced = false;
    if (!blockedFor(prime.x, prime.y, 'townhall')) {
      placeBuilding(prime.x, prime.y, 'townhall');
      hallPlaced = true;
    }
    for (let i = 0; i < squarePositions.length && !hallPlaced; i++) {
      const pos = squarePositions[i];
      if (pos && !blockedFor(pos.x, pos.y, 'townhall')) {
        placeBuilding(pos.x, pos.y, 'townhall');
        hallPlaced = true;
      }
    }
    if (!hallPlaced) logger.warn('[TOWN_MAP] Could not place townhall on the square');
  }

  // Place important buildings
  let importantPlaced = 0;
  // Start at random position for first building
  let posIndex = Math.floor(rng() * squarePositions.length);

  for (const buildingType of important) {
    let placed = false;

    // Try positions around square
    for (let i = 0; i < squarePositions.length && !placed; i++) {
      const pos = squarePositions[(posIndex + i) % squarePositions.length];

      if (!pos) continue;

      if (!blockedFor(pos.x, pos.y, buildingType)) {
        placeBuilding(pos.x, pos.y, buildingType);
        importantPlaced++;
        placed = true;
        posIndex = (posIndex + 2) % squarePositions.length; // Skip one space
      }
    }

    // If couldn't place around square, try one ring out
    if (!placed) {
      for (let radius = 2; radius <= 6 && !placed; radius++) {
        for (let dy = -radius; dy <= radius && !placed; dy++) {
          for (let dx = -radius; dx <= radius && !placed; dx++) {
            if (Math.abs(dx) === radius || Math.abs(dy) === radius) {
              const x = centerX + dx;
              const y = centerY + dy;

              // never wedge an important building into the noble estate cluster
              if (!blockedFor(x, y, buildingType) && !inEstateZone(x, y)) {
                placeBuilding(x, y, buildingType);
                importantPlaced++;
                placed = true;
              }
            }
          }
        }
      }
    }
  }

  if (importantPlaced < important.length) {
    logger.warn(`[TOWN_MAP] Only placed ${importantPlaced}/${important.length} important buildings!`);
  }
  logger.debug(`[TOWN_MAP] Placed ${importantPlaced} important buildings`);

  // STEP 1.5: Place secondary buildings in a second ring around the square (shuffled for variety).
  // Waterfront buildings (harbormaster, dockside warehouses) are handled separately in
  // STEP 1.7 so they sit on the shore rather than the central ring.
  const secondary = config.secondary || [];
  if (secondary.length > 0) {
    logger.debug(`[TOWN_MAP] Placing ${secondary.length} secondary buildings in outer ring...`);

    // Two placement bands: an INNER ring just outside the square (the market/service
    // district) and an OUTER ring on the outskirts. Commerce/civic buildings cluster near
    // the square; rural/industrial buildings sit on the outskirts.
    const ringBand = (minR, maxR) => {
      const out = [];
      for (let radius = minR; radius <= maxR; radius++) {
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (Math.abs(dx) === radius || Math.abs(dy) === radius) {
              const x = centerX + dx, y = centerY + dy;
              if (x >= 1 && x < mapData[0].length - 1 && y >= 1 && y < mapData.length - 1) out.push({ x, y });
            }
          }
        }
      }
      for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
      return out;
    };
    const innerRing = ringBand(halfSize + 2, halfSize + 3);
    const outerRing = ringBand(halfSize + 4, halfSize + 7);

    // Rural / industrial buildings belong on the outskirts; everything else (alchemist,
    // apothecary, tailor, archives, library, guild, townhall, jail, magetower, shrine,
    // fletcher) clusters near the square.
    const PERIPHERAL = new Set(['warehouse', 'foundry', 'mill', 'stables', 'barn']);

    let secondaryPlaced = 0;
    for (const buildingType of secondary) {
      const peripheral = PERIPHERAL.has(buildingType);
      const bands = peripheral ? [outerRing, innerRing] : [innerRing, outerRing];
      let done = false;
      for (const band of bands) {
        for (const pos of band) {
          if (blockedFor(pos.x, pos.y, buildingType)) continue;
          // no service building inside the manor cluster (it would be sealed off the lanes)
          if (inEstateZone(pos.x, pos.y)) continue;
          placeBuilding(pos.x, pos.y, buildingType);
          secondaryPlaced++;
          done = true;
          break;
        }
        if (done) break;
      }
    }

    if (secondaryPlaced < secondary.length) {
      logger.warn(`[TOWN_MAP] Only placed ${secondaryPlaced}/${secondary.length} secondary buildings!`);
    }
    logger.debug(`[TOWN_MAP] Placed ${secondaryPlaced} secondary buildings`);
  }

  // STEP 1.7: Waterfront buildings. In a town on water, put the harbour office and a
  // couple of dockside warehouses on the SHORE (free land next to water/beach), claimed
  // before houses fill the front. Runs after the central buildings so it respects them,
  // and before houses so the waterfront isn't all cottages. Silent if there's no shore room.
  if (hasWater) {
    const waterfront = townSize === 'hamlet' ? []
      : townSize === 'village' ? ['harbormaster']
      : ['harbormaster', 'warehouse', 'warehouse'];
    if (waterfront.length > 0) {
      const isShoreLand = (x, y) => !isOccupied(x, y) && hasOpenSide(x, y) && [[0, -1], [0, 1], [-1, 0], [1, 0]].some(([dx, dy]) => {
        const t = mapData[y + dy] && mapData[y + dy][x + dx];
        return t && (t.type === 'water' || t.type === 'beach');
      });
      const shore = [];
      for (let y = 1; y < mapData.length - 1; y++) {
        for (let x = 1; x < mapData[0].length - 1; x++) {
          if (isShoreLand(x, y)) shore.push({ x, y });
        }
      }
      for (let i = shore.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [shore[i], shore[j]] = [shore[j], shore[i]]; }

      const placedWF = [];
      let wfIndex = 0;
      for (const pos of shore) {
        if (wfIndex >= waterfront.length) break;
        if (isOccupied(pos.x, pos.y)) continue;
        if (placedWF.some((p) => Math.abs(p.x - pos.x) + Math.abs(p.y - pos.y) < 3)) continue; // spacing
        // Protect this dock building's sand frontage BEFORE placing it, so no lane
        // (its own stub included) paves away the beach it opens onto.
        if (pathOpts && pathOpts.noPave) {
          for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            const n = mapData[pos.y + dy] && mapData[pos.y + dy][pos.x + dx];
            if (n && n.type === 'beach') pathOpts.noPave.add(`${pos.x + dx},${pos.y + dy}`);
          }
        }
        placeBuilding(pos.x, pos.y, waterfront[wfIndex]);
        placedWF.push(pos);
        wfIndex++;
      }
      logger.debug(`[TOWN_MAP] Placed ${placedWF.length}/${waterfront.length} waterfront buildings`);
    }
  }

  // Houses are placed later (placeHouses), AFTER the path network is routed, so they
  // line the lanes instead of sealing civic buildings away from them.
  logger.debug(`[TOWN_MAP] Placed ${importantPlaced} important buildings (houses follow the paths)`);
}

// STEP 2 (run after generateBuildingPaths): place houses away from the centre, outside
// the size-based exclusion ring. Houses PREFER street-front tiles (orthogonally adjacent
// to an existing lane) so neighbourhoods line the spokes; the remainder fill in behind
// and get stubs from connectHouses.
function placeHouses(mapData, townSize, rng, centerPos) {
  const config = BUILDING_CONFIG[townSize] || BUILDING_CONFIG.village;
  const houses = config.houses || 0;
  logger.debug(`[TOWN_MAP] Placing ${houses} houses...`);

  const excludeRadius = { hamlet: 1, village: 2, town: 3, city: 3 };
  const exclusion = excludeRadius[townSize] || 2;
  const width = mapData[0].length;
  const height = mapData.length;

  const streetFront = (x, y) => [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => {
    const t = mapData[y + dy] && mapData[y + dy][x + dx];
    return t && (t.type === 'dirt_path' || t.type === 'stone_path');
  });

  const housePositions = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const distFromCenter = Math.max(Math.abs(x - centerPos.x), Math.abs(y - centerPos.y));
      if (distFromCenter > exclusion) housePositions.push({ x, y });
    }
  }

  // Shuffle, then stable-sort street-front positions first: houses line the lanes,
  // with the shuffle still deciding order within each band.
  for (let i = housePositions.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [housePositions[i], housePositions[j]] = [housePositions[j], housePositions[i]];
  }
  const front = housePositions.filter((p) => streetFront(p.x, p.y));
  const back = housePositions.filter((p) => !streetFront(p.x, p.y));
  const ordered = [...front, ...back];

  let housesPlaced = 0;
  for (const pos of ordered) {
    if (housesPlaced >= houses) break;
    const tile = mapData[pos.y][pos.x];
    if (tile.type !== 'grass') continue; // paths/buildings/water/fields stay untouched
    tile.type = 'building';
    tile.buildingType = 'house';
    tile.walkable = false;
    tile.poi = null; // Clear any trees/decorations
    housesPlaced++;
  }

  logger.debug(`[TOWN_MAP] Placed ${housesPlaced} houses`);
}

// Place decorative elements
function placeDecorations(mapData, townSize, rng, theme = 'grassland') {
  // Core decoration (the countryside ring is dressed separately in padTownToUniform)
  const decorationCount = {
    hamlet: 36,   // Lots of trees in hamlets (tripled)
    village: 45,  // More trees in villages (tripled)
    town: 36,     // Some trees in towns (tripled)
    city: 24      // Fewer trees in cities (tripled)
  };

  const count = decorationCount[townSize] || 30;
  // Theme-weighted cover (grassland keeps the historical tree-heavy mix)
  const decorations = decorationSet(theme).core;

  for (let i = 0; i < count; i++) {
    const x = Math.floor(rng() * mapData[0].length);
    const y = Math.floor(rng() * mapData.length);

    const tile = mapData[y][x];

    // Only place on grass tiles without POIs
    if (tile.type === 'grass' && tile.poi === null) {
      tile.poi = decorations[Math.floor(rng() * decorations.length)];
    }
  }
}

// Place farm fields in clusters (Hamlets and Villages only)
function placeFarmFields(mapData, townSize, rng) {
  const width = mapData[0].length;
  const height = mapData.length;

  // Decide how many clusters to place (core only; the countryside ring adds more)
  const clusterCount = townSize === 'hamlet' ? 2 : (townSize === 'village' ? 4 : 6);

  for (let i = 0; i < clusterCount; i++) {
    // Pick a starting point for the cluster, preferably away from center
    // Try to find a grass tile
    let startX, startY;
    let found = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      startX = Math.floor(rng() * width);
      startY = Math.floor(rng() * height);

      const distFromCenter = Math.sqrt(Math.pow(startX - width / 2, 2) + Math.pow(startY - height / 2, 2));
      if (distFromCenter > width / 4 && mapData[startY][startX].type === 'grass') {
        found = true;
        break;
      }
    }

    if (!found) continue;

    // Create a small cluster (2x2 or 2x3)
    const cWidth = 2 + Math.floor(rng() * 2);
    const cHeight = 2 + Math.floor(rng() * 2);

    for (let dy = 0; dy < cHeight; dy++) {
      for (let dx = 0; dx < cWidth; dx++) {
        const x = startX + dx;
        const y = startY + dy;

        if (x >= 0 && x < width && y >= 0 && y < height) {
          if (mapData[y][x].type === 'grass' && mapData[y][x].poi === null) {
            mapData[y][x].type = 'farm_field';
          }
        }
      }
    }
  }
}

// Building types that earn a full windy spoke from the hub. Everything else non-house
// is a "minor" and stubs onto the nearest existing path instead (shared lanes, no
// per-building rays back to the hub). The keep is handled separately: its curtain wall
// blocks direct adjacency, so its spoke targets the tiles just outside the wall ring.
const MAJOR_SPOKE_TYPES = new Set(['townhall', 'tavern', 'inn', 'temple', 'market', 'blacksmith']);

// Safety sweep over the building side of the hub-and-spoke network. Buildings are
// normally connected the moment they are placed (connectBuildingToNetwork, called from
// placeBuildings), so this pass usually finds everything already served — it exists to
// catch any building that slipped through (and asserts nothing new can regress).
function generateBuildingPaths(mapData, centerPos, { noise, riverInfo = null, townSize = 'village', stats = null, noPave = null } = {}) {
  const width = mapData[0].length;
  const height = mapData.length;
  const inBounds = (x, y) => x >= 0 && x < width && y >= 0 && y < height;
  const onNetwork = (x, y) => isPathType(mapData[y][x].type);

  // Passable tiles orthogonally adjacent to (x,y) — a building's "frontage".
  const frontage = (x, y) => {
    const out = [];
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const t = mapData[ny][nx].type;
      if (t === 'grass' || t === 'beach' || isPathType(t)) out.push({ x: nx, y: ny });
    }
    return out;
  };
  const touchesShore = (x, y) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const t = inBounds(x + dx, y + dy) && mapData[y + dy][x + dx];
        if (t && (t.type === 'water' || t.type === 'beach')) return true;
      }
    }
    return false;
  };

  // Classify buildings in deterministic scan order. (Houses do not exist yet — they are
  // placed after this pass and handled by connectHouses. The keep already has its lane,
  // routed at placement time by routeKeepSpoke.)
  const majors = [], minors = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = mapData[y][x];
      if (t.type !== 'building' || t.buildingType === 'house' || t.buildingType === 'keep') continue;
      if (MAJOR_SPOKE_TYPES.has(t.buildingType)) majors.push({ x, y });
      else minors.push({ x, y });
    }
  }

  // Route + lay + record; falls back to a minimal causeway rather than leaving anything
  // unconnected (see placeGateRoad for the same land-first policy).
  const routeAndLay = (starts, isTarget, kind, extra = {}) => {
    if (noPave) starts = starts.filter((p) => !noPave.has(`${p.x},${p.y}`)); // never start (and pave) on protected sand
    if (!starts.length) return false;
    const base = { noise, riverInfo, noPave, ...extra };
    let route = routeWindyPath(mapData, starts, isTarget, base);
    if (!route) route = routeWindyPath(mapData, starts, isTarget, { ...base, waterCost: CAUSEWAY_WATER_COST });
    if (!route) return false;
    layPathRoute(mapData, route, centerPos, townSize);
    recordSpoke(stats, kind, route);
    return true;
  };
  const toKeySet = (tiles) => new Set(tiles.map((p) => p.x * height + p.y));

  // 1. SPOKES: hub → each major building's frontage (skipped when the building already
  //    fronts a lane, which is the normal case after placement-time connection).
  for (const b of majors) {
    const front = frontage(b.x, b.y);
    if (!front.length) { logger.warn(`[TOWN_MAP] Major building at (${b.x}, ${b.y}) has no routable frontage`); continue; }
    if (front.some((p) => onNetwork(p.x, p.y))) continue; // already served
    const targets = toKeySet(front);
    routeAndLay([centerPos], (x, y) => targets.has(x * height + y), 'major');
  }

  // (The keep's spoke is routed earlier, inside placeBuildings right after the keep is
  //  placed, so the noble estate clusters AROUND the lane instead of sealing it off —
  //  see routeKeepSpoke.)

  // 2. STUBS: minor service buildings attach to the NEAREST existing path. Waterfront
  //    buildings route with discounted beach cost so their lanes run along the shore
  //    (the quay) before joining the network.
  for (const b of minors) {
    const front = frontage(b.x, b.y);
    if (!front.length) { logger.warn(`[TOWN_MAP] Building at (${b.x}, ${b.y}) has no routable frontage`); continue; }
    if (front.some((p) => onNetwork(p.x, p.y))) continue; // already served
    routeAndLay(front, onNetwork, 'minor', touchesShore(b.x, b.y) ? { beachCost: QUAY_BEACH_COST } : {});
  }

  logger.debug(`[TOWN_MAP] Hub-and-spoke paths: ${majors.length} major spokes, ${minors.length} minor stubs`);
}

// Houses run last: one with a path anywhere in its 8-neighbourhood is served; the rest
// stub to the NEAREST path. Because each stub joins the network before the next house
// routes, outlying clusters share one lane instead of each house drawing its own.
function connectHouses(mapData, centerPos, { noise, riverInfo = null, townSize = 'village', stats = null, noPave = null } = {}) {
  const width = mapData[0].length;
  const height = mapData.length;
  const inBounds = (x, y) => x >= 0 && x < width && y >= 0 && y < height;
  const onNetwork = (x, y) => isPathType(mapData[y][x].type);
  const frontage = (x, y) => {
    const out = [];
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const t = mapData[ny][nx].type;
      if (t === 'grass' || t === 'beach' || isPathType(t)) out.push({ x: nx, y: ny });
    }
    return out;
  };

  let houseStubs = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = mapData[y][x];
      if (t.type !== 'building' || t.buildingType !== 'house') continue;
      let served = false;
      for (let dy = -1; dy <= 1 && !served; dy++) {
        for (let dx = -1; dx <= 1 && !served; dx++) {
          if (inBounds(x + dx, y + dy) && isPathType(mapData[y + dy][x + dx].type)) served = true;
        }
      }
      if (served) continue;
      const front = frontage(x, y).filter((p) => !noPave || !noPave.has(`${p.x},${p.y}`));
      if (!front.length) continue;
      let route = routeWindyPath(mapData, front, onNetwork, { noise, riverInfo, noPave });
      if (!route) route = routeWindyPath(mapData, front, onNetwork, { noise, riverInfo, noPave, waterCost: CAUSEWAY_WATER_COST });
      if (!route) continue;
      layPathRoute(mapData, route, centerPos, townSize);
      recordSpoke(stats, 'house', route);
      houseStubs++;
    }
  }
  if (houseStubs > 0) logger.debug(`[TOWN_MAP] Connected ${houseStubs} outlying houses with stubs`);
}

// Belt-and-braces: demote any path tile that is not connected to the hub (the town
// square) back to its underlying terrain. Routing alone should never orphan a tile —
// every route terminates on the network — but this guarantees the invariant.
function pruneOrphanPaths(mapData) {
  const width = mapData[0].length;
  const height = mapData.length;
  const seen = new Uint8Array(width * height);
  const stack = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mapData[y][x].type === 'town_square') { seen[y * width + x] = 1; stack.push([x, y]); }
    }
  }
  while (stack.length) {
    const [cx, cy] = stack.pop();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (seen[ny * width + nx] || !isPathType(mapData[ny][nx].type)) continue;
      seen[ny * width + nx] = 1;
      stack.push([nx, ny]);
    }
  }
  let pruned = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = mapData[y][x];
      if (!isPathType(t.type) || seen[y * width + x] || t.type === 'town_square') continue;
      if (t.type === 'bridge') { t.type = 'water'; t.walkable = false; }
      else { t.type = 'grass'; t.walkable = true; }
      pruned++;
    }
  }
  if (pruned > 0) logger.warn(`[TOWN_MAP] Pruned ${pruned} orphan path tiles`);
}

/**
 * Get emoji representation for town map tiles
 * @param {Object} tile - Tile object
 * @returns {string} Emoji to display
 */
export const getTownTileEmoji = (tile) => {
  // POI takes precedence
  if (tile.poi) {
    const poiEmojis = {
      fountain: '⛲',
      well: '🪣',
      tree: '🌳',
      bush: '🌿',
      flowers: '🌸',
      cactus: '🌵',     // desert
      rock: '🪨',       // desert / snow
      dead_bush: '🥀',  // desert
      pine: '🌲',       // snow
      snowdrift: '⛄',  // snow
      '🔲': '🔲'  // Wall emoji passes through
    };
    return poiEmojis[tile.poi] || tile.poi || '❓';  // Return the poi itself if not in map
  }

  // Terrain types
  if (tile.type === 'farm_field') {
    return '🌾';
  }

  // Building types
  if (tile.type === 'building') {
    const buildingEmojis = {
      house: '🏠',
      inn: '🏨',
      shop: '🏪',
      temple: '⛪',
      tavern: '🍺',
      guild: '🏛️',
      market: '🏬',
      bank: '🏦',
      barracks: '🏰',
      manor: '🏰',
      barn: '🏚️',
      blacksmith: '⚒️',
      keep: '🏰',  // Castle/keep for cities
      archives: '📚',
      alchemist: '⚗️',
      foundry: '🔥',
      warehouse: '📦',
      library: '📖',
      apothecary: '🧪',
      fletcher: '🏹',
      harbormaster: '⚓',
      jail: '⛓️',
      magetower: '🔮',
      mill: '🌾',
      shrine: '🛕',
      stables: '🐴',
      tailor: '🧵',
      townhall: '🏛️'
    };
    return buildingEmojis[tile.buildingType] || '🏠';
  }

  // Terrain types - return empty string to show just the colored tile
  return '';
};

export default generateTownMap;
