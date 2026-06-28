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

  const entrances = entryDirs.map((dir) => ({ dir, pos: calculateEntryPosition(width, height, dir) }));
  const entryPos = entrances[0].pos; // primary spawn

  // Place river if it exists
  let riverInfo = null;
  if (hasRiver) {
    riverInfo = placeRiverInTown(mapData, riverDirection, width, height, rng);
  }

  // Place an approach road from every entrance gate to the centre. Walls only overwrite
  // grass, so each road tile already on the perimeter stays an open gate.
  entrances.forEach(({ dir, pos }) => placeMainRoad(mapData, pos, dir, width, height, townSize, riverInfo));

  // Place town square/center
  const centerPos = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
  logger.debug('[TOWN_MAP] centerPos:', centerPos);
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
  placeBuildings(mapData, buildingCount, townSize, rng, centerPos, !!waterInfo);

  // Generate paths connecting all buildings to the road network
  generateBuildingPaths(mapData, centerPos, rng);

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
    centerPoint: centerPos
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

// Place main road from entry to center
function placeMainRoad(mapData, entryPos, direction, width, height, townSize, riverInfo = null) {
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);

  // Single-width approach road for every town size (the 2-wide road read as a
  // gash through the gate; one tile looks cleaner with the new tileset).
  const isWideRoad = false;
  const roadType = townSize === 'city' ? 'stone_path' : 'dirt_path';

  // Create path from entry to center
  if (direction === 'north' || direction === 'south') {
    // Vertical road
    const startY = Math.min(entryPos.y, centerY);
    const endY = Math.max(entryPos.y, centerY);

    for (let y = startY; y <= endY; y++) {
      // Check for bridge
      if (riverInfo && !riverInfo.isHorizontal && centerX >= riverInfo.center && centerX < riverInfo.center + riverInfo.riverWidth) {
        mapData[y][centerX].type = 'bridge';
        mapData[y][centerX].walkable = true;
      } else if (riverInfo && riverInfo.isHorizontal && y >= riverInfo.center && y < riverInfo.center + riverInfo.riverWidth) {
        mapData[y][centerX].type = 'bridge';
        mapData[y][centerX].walkable = true;
      } else {
        mapData[y][centerX].type = roadType;
      }

      // Add road width for towns and cities (2 wide total)
      if (isWideRoad && centerX < width - 1) {
        const nextX = centerX + 1;
        if (riverInfo && !riverInfo.isHorizontal && nextX >= riverInfo.center && nextX < riverInfo.center + riverInfo.riverWidth) {
          mapData[y][nextX].type = 'bridge';
          mapData[y][nextX].walkable = true;
        } else if (riverInfo && riverInfo.isHorizontal && y >= riverInfo.center && y < riverInfo.center + riverInfo.riverWidth) {
          mapData[y][nextX].type = 'bridge';
          mapData[y][nextX].walkable = true;
        } else {
          mapData[y][nextX].type = roadType;
        }
      }
    }
  } else {
    // Horizontal road
    const startX = Math.min(entryPos.x, centerX);
    const endX = Math.max(entryPos.x, centerX);
    const roadY = Math.floor(height / 2);

    for (let x = startX; x <= endX; x++) {
      // Check for bridge
      if (riverInfo && riverInfo.isHorizontal && roadY >= riverInfo.center && roadY < riverInfo.center + riverInfo.riverWidth) {
        mapData[roadY][x].type = 'bridge';
        mapData[roadY][x].walkable = true;
      } else if (riverInfo && !riverInfo.isHorizontal && x >= riverInfo.center && x < riverInfo.center + riverInfo.riverWidth) {
        mapData[roadY][x].type = 'bridge';
        mapData[roadY][x].walkable = true;
      } else {
        mapData[roadY][x].type = roadType;
      }

      // Add road width for towns and cities (2 wide total)
      if (isWideRoad && roadY < height - 1) {
        const nextY = roadY + 1;
        if (riverInfo && riverInfo.isHorizontal && nextY >= riverInfo.center && nextY < riverInfo.center + riverInfo.riverWidth) {
          mapData[nextY][x].type = 'bridge';
          mapData[nextY][x].walkable = true;
        } else if (riverInfo && !riverInfo.isHorizontal && x >= riverInfo.center && x < riverInfo.center + riverInfo.riverWidth) {
          mapData[nextY][x].type = 'bridge';
          mapData[nextY][x].walkable = true;
        } else {
          mapData[nextY][x].type = roadType;
        }
      }
    }
  }
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
function placeBuildings(mapData, count, townSize, rng, centerPos, hasWater = false) {
  if (!centerPos) {
    logger.warn('[TOWN_MAP] placeBuildings called with undefined centerPos, using map defaults');
    centerPos = { x: Math.floor(mapData[0].length / 2), y: Math.floor(mapData.length / 2) };
  }

  const centerX = centerPos.x;
  const centerY = centerPos.y;

  // Per-size building roster (module-level so the water step reserves matching land).
  const config = BUILDING_CONFIG[townSize] || BUILDING_CONFIG.village;
  const { important, houses } = config;

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
  const blockedFor = (x, y, type) => isOccupied(x, y) || (SHORE_AVERSE.has(type) && isShore(x, y));

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
    const pathTo = (fromX, fromY, toX, toY) => {
      let x = fromX, y = fromY;
      const lay = () => { if (mapData[y][x].type === 'grass') { mapData[y][x].type = 'stone_path'; mapData[y][x].walkable = true; } };
      while (x !== toX) { x += x < toX ? 1 : -1; lay(); }
      while (y !== toY) { y += y < toY ? 1 : -1; lay(); }
    };

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
      let py = keepY + 2; // path from below the wall to the square
      while (py < centerY) { if (mapData[py][keepX].type === 'grass') { mapData[py][keepX].type = 'stone_path'; mapData[py][keepX].walkable = true; } py++; }
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
        if (![{ x: kx, y: ky }, wallE, wallS, wallC].every((p) => tileFree(p.x, p.y))) continue;
        keepX = kx; keepY = ky;
        placeKeep(kx, ky);
        // Fully enclose: the two city walls cover the outer sides; keep_wall covers the two
        // inner sides + the diagonal corner, so the keep is walled on all sides (like the
        // central keep). A path runs from just outside the wall to the square.
        keepWall(wallE.x, wallE.y);
        keepWall(wallS.x, wallS.y);
        keepWall(wallC.x, wallC.y);
        pathTo(c.cx + c.sx, c.cy + 3 * c.sy, centerX, centerY);
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
        for (const pos of adjacentCandidates) {
          if (!isOccupied(pos.x, pos.y)) {
            mapData[pos.y][pos.x].type = 'building';
            mapData[pos.y][pos.x].buildingType = manorType;
            mapData[pos.y][pos.x].buildingName = generateManorName(rng);
            mapData[pos.y][pos.x].walkable = false;
            mapData[pos.y][pos.x].poi = null;
            markOccupied(pos.x, pos.y);
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

  // Helper: place a building on a tile
  const placeBuilding = (x, y, buildingType) => {
    mapData[y][x].type = 'building';
    mapData[y][x].buildingType = buildingType;
    mapData[y][x].walkable = false;
    mapData[y][x].poi = null;
    assignBuildingName(mapData[y][x], buildingType);
    markOccupied(x, y);
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

              if (!blockedFor(x, y, buildingType)) {
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

    // Building types that should not be placed in the noble estate zone
    const estateExcluded = new Set(['warehouse', 'foundry']);
    const estateZone = config._estateZone || null;
    const isInEstateZone = (x, y) => {
      if (!estateZone) return false;
      return x >= estateZone.minX && x <= estateZone.maxX &&
             y >= estateZone.minY && y <= estateZone.maxY;
    };

    let secondaryPlaced = 0;
    for (const buildingType of secondary) {
      const peripheral = PERIPHERAL.has(buildingType);
      const bands = peripheral ? [outerRing, innerRing] : [innerRing, outerRing];
      let done = false;
      for (const band of bands) {
        for (const pos of band) {
          if (blockedFor(pos.x, pos.y, buildingType)) continue;
          if (estateExcluded.has(buildingType) && isInEstateZone(pos.x, pos.y)) continue;
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
      const isShoreLand = (x, y) => !isOccupied(x, y) && [[0, -1], [0, 1], [-1, 0], [1, 0]].some(([dx, dy]) => {
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
        placeBuilding(pos.x, pos.y, waterfront[wfIndex]);
        placedWF.push(pos);
        wfIndex++;
      }
      logger.debug(`[TOWN_MAP] Placed ${placedWF.length}/${waterfront.length} waterfront buildings`);
    }
  }

  // STEP 2: Place houses away from center (exclude rings based on town size)
  logger.debug(`[TOWN_MAP] Placing ${houses} houses...`);

  // Smaller exclusion zone for smaller towns
  const excludeRadius = {
    hamlet: 1,   // Only exclude 1 ring (just around the well)
    village: 2,  // Exclude 2 rings
    town: 3,     // Exclude 3 rings
    city: 3      // Exclude 3 rings
  };

  const exclusion = excludeRadius[townSize] || 2;
  let housesPlaced = 0;

  // Create list of valid positions for houses (outside exclusion zone)
  const housePositions = [];
  for (let y = 1; y < mapData.length - 1; y++) {
    for (let x = 1; x < mapData[0].length - 1; x++) {
      const distFromCenter = Math.max(Math.abs(x - centerX), Math.abs(y - centerY));
      if (distFromCenter > exclusion) {
        housePositions.push({ x, y });
      }
    }
  }

  // Shuffle house positions
  for (let i = housePositions.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [housePositions[i], housePositions[j]] = [housePositions[j], housePositions[i]];
  }

  // Place houses
  for (const pos of housePositions) {
    if (housesPlaced >= houses) break;

    if (!pos) continue;

    if (!isOccupied(pos.x, pos.y)) {
      mapData[pos.y][pos.x].type = 'building';
      mapData[pos.y][pos.x].buildingType = 'house';
      mapData[pos.y][pos.x].walkable = false;
      mapData[pos.y][pos.x].poi = null; // Clear any trees/decorations
      markOccupied(pos.x, pos.y);
      housesPlaced++;
    }
  }

  logger.debug(`[TOWN_MAP] Placed ${housesPlaced} houses`);
  logger.debug(`[TOWN_MAP] Total buildings: ${importantPlaced + housesPlaced}`);
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

// Generate paths connecting buildings organically
function generateBuildingPaths(mapData, centerPos, rng) {
  const width = mapData[0].length;
  const height = mapData.length;

  // Find all buildings, separating important buildings from houses
  const importantBuildings = [];
  const houses = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mapData[y][x].type === 'building') {
        if (mapData[y][x].buildingType === 'house') {
          houses.push({ x, y });
        } else {
          importantBuildings.push({ x, y });
        }
      }
    }
  }

  // Track all path tiles (roads and paths we create)
  const pathTiles = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const type = mapData[y][x].type;
      if (type === 'stone_path' || type === 'dirt_path') {
        pathTiles.push({ x, y });
      }
    }
  }

  // Helper to create path between two points
  const createPath = (from, to) => {
    let x = from.x;
    let y = from.y;

    while (x !== to.x || y !== to.y) {
      if (x < to.x) x++;
      else if (x > to.x) x--;
      else if (y < to.y) y++;
      else if (y > to.y) y--;

      if (mapData[y][x].type === 'grass' && mapData[y][x].poi === null) {
        const distFromCenter = Math.abs(x - centerPos.x) + Math.abs(y - centerPos.y);
        const centerRadius = Math.floor(Math.max(width, height) / 4);
        mapData[y][x].type = distFromCenter < centerRadius ? 'stone_path' : 'dirt_path';
        pathTiles.push({ x, y });
      }
    }
  };

  // STEP 0: Connect all important/secondary buildings to nearest road
  for (const building of importantBuildings) {
    let nearestRoad = null;
    let minDist = Infinity;

    pathTiles.forEach(road => {
      const dist = Math.abs(building.x - road.x) + Math.abs(building.y - road.y);
      if (dist < minDist) {
        minDist = dist;
        nearestRoad = road;
      }
    });

    if (nearestRoad && minDist > 1) {
      createPath(building, nearestRoad);
    }
  }

  // Track which houses are connected to the main network
  const connectedHouses = new Set();

  // STEP 1: Connect a few houses (30%) directly to the main road network
  const directConnections = Math.ceil(houses.length * 0.3);
  const shuffledHouses = [...houses];

  // Shuffle houses
  for (let i = shuffledHouses.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffledHouses[i], shuffledHouses[j]] = [shuffledHouses[j], shuffledHouses[i]];
  }

  // Connect first 30% directly to nearest road
  for (let i = 0; i < directConnections && i < shuffledHouses.length; i++) {
    const house = shuffledHouses[i];

    // Find nearest road tile
    let nearestRoad = null;
    let minDist = Infinity;

    pathTiles.forEach(road => {
      const dist = Math.abs(house.x - road.x) + Math.abs(house.y - road.y);
      if (dist < minDist) {
        minDist = dist;
        nearestRoad = road;
      }
    });

    if (nearestRoad && minDist > 1) {
      createPath(house, nearestRoad);
      connectedHouses.add(`${house.x},${house.y}`);
    }
  }

  // STEP 2: Connect remaining houses to nearest CONNECTED building or path
  // Keep trying until all houses are connected or we can't connect any more
  let unconnectedHouses = shuffledHouses.slice(directConnections);
  let maxIterations = 10;
  let iteration = 0;

  while (unconnectedHouses.length > 0 && iteration < maxIterations) {
    iteration++;
    const stillUnconnected = [];

    for (const house of unconnectedHouses) {
      // Find nearest path tile OR connected house
      let nearestTarget = null;
      let minDist = Infinity;

      // Check all path tiles
      pathTiles.forEach(target => {
        const dist = Math.abs(house.x - target.x) + Math.abs(house.y - target.y);
        if (dist < minDist && dist > 0) {
          minDist = dist;
          nearestTarget = target;
        }
      });

      // Check connected houses
      shuffledHouses.forEach(otherHouse => {
        if (connectedHouses.has(`${otherHouse.x},${otherHouse.y}`)) {
          const dist = Math.abs(house.x - otherHouse.x) + Math.abs(house.y - otherHouse.y);
          if (dist < minDist && dist > 0) {
            minDist = dist;
            nearestTarget = otherHouse;
          }
        }
      });

      if (nearestTarget && minDist > 1 && minDist < 10) {
        createPath(house, nearestTarget);
        connectedHouses.add(`${house.x},${house.y}`);
      } else {
        stillUnconnected.push(house);
      }
    }

    // If we didn't connect any houses this iteration, break
    if (stillUnconnected.length === unconnectedHouses.length) {
      break;
    }

    unconnectedHouses = stillUnconnected;
  }

  logger.debug(`[TOWN_MAP] Generated organic paths: ${directConnections} direct connections, ${houses.length - directConnections} house-to-house`);
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
