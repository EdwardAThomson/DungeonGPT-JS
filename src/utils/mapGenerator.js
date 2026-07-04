// src/mapGenerator.js

// Random but sensible map generator
// Creates varied world maps with forests, mountains, and towns

import { generateTownName, generateMountainName } from './townNameGenerator';
import { generateTownPaths, markPathTiles } from './pathfinding';
import { createLogger } from './logger';

const logger = createLogger('map-generator');

/**
 * Generate a random world map with natural-looking feature placement
 * @param {number} width - Map width (default 10)
 * @param {number} height - Map height (default 10)
 * @param {number} seed - Optional seed for reproducible maps
 * @param {Object|Array} customNames - Optional names: { towns: [...], mountains: [...] } or legacy array of town names
 * @param {string} theme - Optional biome theme for the whole map. Defaults to 'grassland'
 *   (base biome 'plains' — byte-identical to historical behaviour). 'desert' bases land
 *   tiles on the 'desert' biome instead; 'snow' bases them on the 'snow' biome. Themed-
 *   region maps (Phase 2b/2c): the whole map IS one biome theme; water/beach/coast/lake/POI
 *   logic is otherwise unchanged.
 * @param {Object} options - EXPERIMENTAL chunk-assembly hooks (worldAssembler.js, issue #60).
 *   All optional and additive: omitting them (or passing {}) is byte-identical to the legacy
 *   call for the same seed (guarded by a fixture test). Fields:
 *     coast: undefined = legacy random placeCoast (default);
 *            null/false = suppress the coast entirely (inland chunk);
 *            { edge: 0-3, depth: 2-3 } = stamp a prescribed coast band (coastal chunk).
 *     edgeConstraints: { north/east/south/west: [biome per tile] } — the adjacent edge rows
 *            of already-generated neighbour chunks; the first 2 rows on that side are biased
 *            toward continuing those biomes (exact-continuation probability decaying inward).
 *            Water/beach constraints are never stamped (they'd need direction data).
 *     lakeBorderMargin: min distance lake WATER keeps from the map border (default 1 = legacy;
 *            chunks use 2 so no lake is bisected by / crowds a chunk seam).
 *     townDensityFactor: scales the random settlement target (default 1; outer chunks ~0.65).
 * @returns {Array} 2D array of map tiles
 */
export const generateMapData = (width = 10, height = 10, seed = null, customNames = {}, theme = 'grassland', options = {}) => {
  // Normalize customNames: support legacy flat array or new structured object
  const normalizedNames = Array.isArray(customNames)
    ? { towns: customNames, mountains: [] }
    : { towns: customNames?.towns || [], mountains: customNames?.mountains || [] };
  // Use seed for reproducible maps, or random
  const rng = seed !== null ? seededRandom(seed) : Math.random;

  // The base biome of dry land. Grassland (default) keeps the historical 'plains' so
  // existing behaviour and tests stay byte-identical; a themed map (e.g. desert) bases
  // its land tiles on the theme biome instead. Water/beach/lake placement still keys off
  // this land biome so themed maps keep their coasts and (oasis-like) lakes.
  const landBiome = theme === 'desert' ? 'desert' : theme === 'snow' ? 'snow' : 'plains';
  const landDescription = landBiome === 'desert' ? 'Open desert' : landBiome === 'snow' ? 'Frozen tundra' : 'Open fields';

  const mapData = [];
  const townsList = []; // Keep track of all towns

  // Initialize all tiles to the land base biome
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      row.push({
        x,
        y,
        biome: landBiome,
        poi: null,
        descriptionSeed: landDescription,
        isExplored: false,
      });
    }
    mapData.push(row);
  }

  // 1. Generate Coast (one random edge). Chunk assembly (issue #60, experimental) may
  // suppress it (inland chunks) or prescribe the edge/depth (coastal chunks continuing the
  // heart chunk's coastline). Default (options.coast undefined) is the legacy random coast.
  if (options.coast === undefined) {
    placeCoast(mapData, width, height, rng);
  } else if (options.coast) {
    stampCoast(mapData, width, height, options.coast.edge, options.coast.depth);
  }

  // 1b. Edge constraints from already-generated neighbour chunks (issue #60, experimental):
  // bias the first 2 rows on a constrained side toward continuing the neighbour's edge
  // biomes, with exact-continuation probability decaying inward. No-op when absent.
  if (options.edgeConstraints) {
    applyEdgeConstraints(mapData, width, height, rng, options.edgeConstraints, landBiome);
  }

  // Lake water keeps this distance from the border (legacy 1; chunks pass 2 so a lake and
  // its shore ring never touch a chunk seam — no bisected half-lakes at seams).
  const lakeMargin = options.lakeBorderMargin || 1;

  // 2. Generate lakes (issue #59: two giant look-alike lakes could dominate a 10x10 map).
  // Rules: total lake water is budgeted to ~12% of the map; at most ONE large lake, and a
  // second lake is only placed when it fits the remaining budget while staying meaningfully
  // smaller (at most half the first lake's tile count). Each lake also draws its own shape
  // personality from the seed (see placeLakeCluster), so two lakes never grow as copies.
  const lakeBudget = Math.max(4, Math.floor(width * height * 0.12));
  const wantsSecondLake = rng() < 0.5; // same 1-or-2 odds as the old numLakes roll
  const firstLake = placeLakeCluster(mapData, width, height, rng, landBiome, lakeBudget, lakeMargin);
  if (wantsSecondLake && firstLake.length > 0) {
    const smallCap = Math.min(lakeBudget - firstLake.length, Math.floor(firstLake.length / 2));
    if (smallCap >= 3) {
      placeLakeCluster(mapData, width, height, rng, landBiome, smallCap, lakeMargin);
    }
  }

  // 3. Generate 3-5 forest clusters
  const numForestClusters = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < numForestClusters; i++) {
    placeForestCluster(mapData, width, height, rng);
  }

  // 4. Generate 2-3 mountain ranges (guarantee at least 1)
  const numMountainRanges = Math.max(1, 2 + Math.floor(rng() * 2));
  const mountainTiles = []; // Flat list for river sources
  for (let i = 0; i < numMountainRanges; i++) {
    const range = placeMountainRange(mapData, width, height, rng);
    if (range && range.length > 0) {
      mountainTiles.push(...range);
    }
  }

  // 5. Generate Rivers (from mountains to lakes/coast)
  if (mountainTiles.length > 0) {
    generateRivers(mapData, mountainTiles, rng);
  }

  // 5b. Rolling hills — foothills near mountains plus the odd standalone cluster (Phase 2a)
  placeHills(mapData, width, height, rng);

  // 5c. A cave entrance tucked against the mountains (Phase 2a — placeCave was never wired up)
  placeCave(mapData, width, height, rng);

  // 6. Place towns. Normally 3-6, but never fewer than the number of named towns
  // the campaign requires — each custom name is a milestone/quest location that
  // must exist on the map, otherwise its quest building/item/POI is silently lost.
  const requiredTowns = normalizedNames.towns.length;
  // townDensityFactor (issue #60, experimental): outer chunks are sparser wilds (~0.65).
  // Default 1 leaves the legacy 3-6 roll untouched (Math.round of an integer is identity).
  const densityFactor = options.townDensityFactor || 1;
  const targetTowns = Math.max(requiredTowns, Math.max(1, Math.round((3 + Math.floor(rng() * 4)) * densityFactor)));
  logger.debug(`[MAP_GENERATION] Placing ${targetTowns} towns (campaign requires ${requiredTowns})...`);

  let townSpacing = 3; // relaxed below if the map is too crowded to fit them all
  let safety = 0;
  while (townsList.length < targetTowns && safety < targetTowns + 10) {
    safety++;
    const townPosition = placeTown(mapData, width, height, rng, townsList, townSpacing);
    if (townPosition) {
      townsList.push(townPosition);
    } else if (townSpacing > 1) {
      // Couldn't fit a town at this spacing — relax and retry so required
      // quest towns still get placed on a crowded map.
      townSpacing -= 1;
      logger.debug(`[MAP_GENERATION] Relaxing town spacing to ${townSpacing} to fit required towns`);
    } else {
      // Even at minimum spacing there's no room — the map is genuinely full.
      break;
    }
  }

  if (townsList.length < requiredTowns) {
    logger.warn(`[MAP_GENERATION] Placed only ${townsList.length}/${requiredTowns} required towns — some quest locations may be missing.`);
  }

  // Improve map distribution by adding features to sparse quadrants
  improveMapDistribution(mapData, width, height, rng, landBiome);

  // Selected starting town first so the name assigner knows which one it is
  if (townsList.length > 0) {
    const startingTownIndex = Math.floor(rng() * townsList.length);
    const startingTown = townsList[startingTownIndex];
    mapData[startingTown.y][startingTown.x].isStartingTown = true;

    // Assign sizes and names to all towns
    assignTownSizesAndNames(mapData, townsList, rng, normalizedNames.towns);

    const startingTile = mapData[startingTown.y][startingTown.x];
    logger.debug(`[MAP_GENERATION] Selected starting town: ${startingTile.townName} (${startingTile.townSize}) at (${startingTown.x}, ${startingTown.y})`);
  } else {
    logger.error('[MAP_GENERATION] No towns were placed! This should not happen.');
  }

  // Generate paths between towns
  if (townsList.length > 1) {
    logger.debug('[MAP_GENERATION] Generating paths between towns...');
    const paths = generateTownPaths(mapData, townsList);
    markPathTiles(mapData, paths);
  }

  // Occasionally drop ancient ruins on open ground, clear of paths (Phase 2a)
  placeRuins(mapData, width, height, rng);

  // Harmonize mountain names: flood-fill adjacent tiles into clusters, assign one name per cluster
  harmonizeMountainNames(mapData, rng, normalizedNames.mountains);

  // Debug: Log all towns on the map
  logger.debug('[MAP_GENERATION] Map generation complete. Towns on map:');
  townsList.forEach(town => {
    const tile = mapData[town.y][town.x];
    logger.debug(`  ${tile.townName} (${tile.townSize}) at (${town.x}, ${town.y})${tile.isStartingTown ? ' ⭐ STARTING TOWN' : ''}`);
  });
  return mapData;
};

// Seeded random number generator for reproducible maps
function seededRandom(seed) {
  let state = Number.isFinite(seed) ? seed : 42;
  return function () {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

// Place a cluster of 2-4 forest tiles
function placeForestCluster(mapData, width, height, rng) {
  const clusterSize = 2 + Math.floor(rng() * 3);
  let startX, startY;
  for (let attempt = 0; attempt < 10; attempt++) {
    startX = 1 + Math.floor(rng() * (width - 2));
    startY = 1 + Math.floor(rng() * (height - 2));
    if (mapData[startY][startX].biome !== 'water') break;
  }

  const tiles = [{ x: startX, y: startY }];

  // Grow cluster from starting point
  for (let i = 1; i < clusterSize; i++) {
    const base = tiles[Math.floor(rng() * tiles.length)];
    const directions = [
      { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
      { dx: 0, dy: 1 }, { dx: 0, dy: -1 }
    ];

    // Try to place adjacent tile
    for (let attempt = 0; attempt < 4; attempt++) {
      const dir = directions[Math.floor(rng() * directions.length)];
      const newX = base.x + dir.dx;
      const newY = base.y + dir.dy;

      if (isValidPlacement(mapData, newX, newY, width, height)) {
        tiles.push({ x: newX, y: newY });
        break;
      }
    }
  }

  // Place forest tiles
  tiles.forEach(tile => {
    if (mapData[tile.y] && mapData[tile.y][tile.x] && !mapData[tile.y][tile.x].poi && mapData[tile.y][tile.x].biome !== 'water') {
      mapData[tile.y][tile.x].poi = 'forest';
      mapData[tile.y][tile.x].descriptionSeed = "Dense woods";
    }
  });
}

// Place a mountain range of 2-3 tiles
function placeMountainRange(mapData, width, height, rng) {
  const rangeSize = 2 + Math.floor(rng() * 2);
  let startX, startY;
  for (let attempt = 0; attempt < 10; attempt++) {
    startX = 1 + Math.floor(rng() * (width - 2));
    startY = 1 + Math.floor(rng() * (height - 2));
    if (mapData[startY][startX].biome !== 'water' && mapData[startY][startX].biome !== 'beach') break;
  }

  const tiles = [{ x: startX, y: startY }];

  // Grow range in a line
  for (let i = 1; i < rangeSize; i++) {
    const base = tiles[tiles.length - 1];
    const directions = [
      { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
      { dx: 0, dy: 1 }, { dx: 0, dy: -1 }
    ];

    for (let attempt = 0; attempt < 4; attempt++) {
      const dir = directions[Math.floor(rng() * directions.length)];
      const newX = base.x + dir.dx;
      const newY = base.y + dir.dy;

      if (isValidPlacement(mapData, newX, newY, width, height, false)) {
        tiles.push({ x: newX, y: newY });
        break;
      }
    }
  }

  // Place mountain tiles
  tiles.forEach(tile => {
    if (mapData[tile.y] && mapData[tile.y][tile.x] && !mapData[tile.y][tile.x].poi && mapData[tile.y][tile.x].biome !== 'water') {
      mapData[tile.y][tile.x].poi = 'mountain';
      mapData[tile.y][tile.x].descriptionSeed = "Rocky peaks";
    }
  });

  return tiles;
}

// Place a town at a random empty location with minimum distance from other towns.
// minDistance can be relaxed by the caller when the map is crowded so required
// quest towns aren't silently dropped.
function placeTown(mapData, width, height, rng, existingTowns = [], minDistance = 3) {
  const townNames = [
    "A trading post",
    "A farming hamlet",
    "A riverside settlement",
    "A crossroads inn"
  ];

  for (let attempt = 0; attempt < 30; attempt++) {
    const x = 1 + Math.floor(rng() * (width - 2));
    const y = 1 + Math.floor(rng() * (height - 2));

    if (isValidPlacement(mapData, x, y, width, height)) {
      // Check distance from existing towns using the towns list (more efficient)
      let tooClose = false;
      for (const existingTown of existingTowns) {
        const distance = Math.abs(x - existingTown.x) + Math.abs(y - existingTown.y); // Manhattan distance
        if (distance < minDistance) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        mapData[y][x].poi = 'town';
        mapData[y][x].descriptionSeed = townNames[Math.floor(rng() * townNames.length)];
        logger.debug(`[PLACE_TOWN] Placed town at (${x}, ${y}): "${mapData[y][x].descriptionSeed}"`);
        return { x, y }; // Return the position
      }
    }
  }

  logger.warn('[PLACE_TOWN] Failed to place town after 30 attempts');
  return null; // Return null if placement failed
}

// Place rolling hills: foothills hugging mountains, plus an occasional standalone cluster.
function placeHills(mapData, width, height, rng) {
  const dirs = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
  const shuffled = () => dirs.slice().sort(() => rng() - 0.5);
  const setHill = (x, y, seed) => {
    if (!isValidPlacement(mapData, x, y, width, height, false)) return false;
    mapData[y][x].poi = 'hills';
    mapData[y][x].descriptionSeed = seed;
    return true;
  };

  // Foothills: a couple of mountains get an adjacent hill tile.
  const mountains = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (mapData[y][x].poi === 'mountain') mountains.push({ x, y });
  }
  const foothills = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < foothills && mountains.length > 0; i++) {
    const m = mountains[Math.floor(rng() * mountains.length)];
    for (const d of shuffled()) {
      if (setHill(m.x + d.dx, m.y + d.dy, 'Rolling foothills')) break;
    }
  }

  // One standalone cluster of 1-3 hills on open plains.
  for (let attempt = 0; attempt < 20; attempt++) {
    const sx = Math.floor(rng() * width), sy = Math.floor(rng() * height);
    if (!setHill(sx, sy, 'Rolling hills')) continue;
    const extra = 1 + Math.floor(rng() * 2);
    let grown = 0;
    for (const d of shuffled()) {
      if (grown >= extra) break;
      if (setHill(sx + d.dx, sy + d.dy, 'Rolling hills')) grown++;
    }
    break;
  }
}

// Place ancient ruins on open ground, clear of paths (Phase 2a). One per map.
function placeRuins(mapData, width, height, rng) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = Math.floor(rng() * width), y = Math.floor(rng() * height);
    if (mapData[y][x].hasPath) continue;
    if (isValidPlacement(mapData, x, y, width, height, false)) {
      mapData[y][x].poi = 'ruins';
      mapData[y][x].descriptionSeed = 'Crumbling ancient ruins';
      return;
    }
  }
}

// Retroactively add the newer decorative POIs (hills, ruins, cave) to a world map that
// predates them — a deliberate, one-time legacy upgrade applied on load (see useGameMap),
// alongside the existing x/y patch. Idempotent: if the map already has any of these POIs
// (a new map, or one already upgraded) it's left untouched. Deterministic by seed.
export function enrichWorldMap(mapData, seed) {
  if (!Array.isArray(mapData) || mapData.length === 0 || !mapData[0]) return mapData;
  const alreadyEnriched = mapData.flat().some(
    (t) => t.poi === 'hills' || t.poi === 'ruins' || t.poi === 'cave_entrance'
  );
  if (alreadyEnriched) return mapData;

  const height = mapData.length;
  const width = mapData[0].length;
  const rng = seededRandom(Number.isFinite(seed) ? seed + 31 : 31);
  placeHills(mapData, width, height, rng);
  placeRuins(mapData, width, height, rng);
  placeCave(mapData, width, height, rng);
  logger.info('[MAP_GENERATION] Enriched a legacy world map with hills/ruins/cave');
  return mapData;
}

// Place a cave entrance near mountains
function placeCave(mapData, width, height, rng) {
  // Find all mountain tiles
  const mountains = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mapData[y][x].poi === 'mountain') {
        mountains.push({ x, y });
      }
    }
  }

  if (mountains.length === 0) return;

  const directions = [
    { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
    { dx: 0, dy: 1 }, { dx: 0, dy: -1 }
  ];

  // Try mountains in random order until one has a free neighbour for the cave — a single
  // random mountain often has all-occupied neighbours, which left maps with no cave at all.
  const shuffledMountains = mountains.slice().sort(() => rng() - 0.5);
  for (const mountain of shuffledMountains) {
    for (const dir of directions.slice().sort(() => rng() - 0.5)) {
      const x = mountain.x + dir.dx;
      const y = mountain.y + dir.dy;
      if (isValidPlacement(mapData, x, y, width, height, false)) {
        mapData[y][x].poi = 'cave_entrance';
        mapData[y][x].descriptionSeed = "A dark cave entrance";
        return;
      }
    }
  }
}

// Assign sizes and names to all towns on the map
function assignTownSizesAndNames(mapData, townsList, rng, customNames = []) {
  logger.debug(`[ASSIGN_TOWNS] Assigning sizes and names to ${townsList.length} towns (Custom names: ${customNames.length})...`);

  const sizeOrder = { 'city': 0, 'town': 1, 'village': 2, 'hamlet': 3 };
  const sizeDistribution = ['hamlet', 'village', 'town', 'city'];

  // Shuffle size distribution to randomize which town gets which size
  const shuffledSizes = [...sizeDistribution];
  for (let i = shuffledSizes.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffledSizes[i], shuffledSizes[j]] = [shuffledSizes[j], shuffledSizes[i]];
  }

  // 1. Assign SIZES first
  townsList.forEach((town, index) => {
    const tile = mapData[town.y][town.x];
    tile.townSize = shuffledSizes[index % shuffledSizes.length];
  });

  const sizeDescriptions = {
    hamlet: 'A small hamlet',
    village: 'A quiet village',
    town: 'A bustling town',
    city: 'A grand city'
  };
  const setName = (town, name) => {
    const tile = mapData[town.y][town.x];
    tile.townName = name;
    tile.descriptionSeed = sizeDescriptions[tile.townSize] || 'A settlement';
    logger.debug(`[ASSIGN_TOWNS] ${tile.townName} (${tile.townSize}) at (${town.x}, ${town.y})`);
  };

  // Normalize custom names: each entry is a plain string OR { name, size }. A declared size
  // pins that settlement's size (so "the village of Ashford" renders as a village) instead of
  // the first-listed name always landing on the biggest settlement by array order.
  const normalized = [...customNames]
    .map((c) => (typeof c === 'string' ? { name: c } : { name: c?.name, size: c?.size }))
    .filter((c) => c.name);
  const declared = normalized.filter((c) => sizeOrder[c.size] !== undefined);
  const plainNames = normalized.filter((c) => sizeOrder[c.size] === undefined).map((c) => c.name);

  const available = [...townsList];

  // Pass 1: honor declared sizes. Prefer a tile already of that size (keeps the overall size
  // mix, so e.g. a city still exists elsewhere); otherwise take the least-important remaining
  // tile and force its size to match.
  for (const { name, size } of declared) {
    let idx = available.findIndex((t) => mapData[t.y][t.x].townSize === size);
    if (idx === -1) {
      let rank = -1;
      available.forEach((t, i) => {
        const r = sizeOrder[mapData[t.y][t.x].townSize];
        if (r > rank) { rank = r; idx = i; }
      });
      if (idx === -1) break; // no tiles left to name
      mapData[available[idx].y][available[idx].x].townSize = size;
    }
    const [town] = available.splice(idx, 1);
    setName(town, name);
  }

  // Pass 2: remaining tiles get plain names by importance (biggest first), then the random
  // generator for any left over. With no declared sizes this reproduces the original order.
  available.sort((a, b) => sizeOrder[mapData[a.y][a.x].townSize] - sizeOrder[mapData[b.y][b.x].townSize]);
  for (const town of available) {
    const tile = mapData[town.y][town.x];
    const name = plainNames.length > 0 ? plainNames.shift() : generateTownName(tile.townSize, tile.biome || 'plains', rng);
    setName(town, name);
  }
}

// Harmonize mountain names across the map using flood-fill connected components.
// Adjacent mountain tiles are grouped into clusters. Each cluster gets one name.
// Custom names (from templates/milestones) are prioritized and never overwritten.
function harmonizeMountainNames(mapData, rng, customMountainNames = []) {
  const height = mapData.length;
  const width = mapData[0].length;
  const visited = Array.from({ length: height }, () => Array(width).fill(false));
  const clusters = [];

  // Flood-fill to find connected components of mountain tiles (4-directional)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (visited[y][x] || mapData[y][x].poi !== 'mountain') continue;

      const cluster = [];
      const queue = [{ x, y }];
      visited[y][x] = true;

      while (queue.length > 0) {
        const { x: cx, y: cy } = queue.shift();
        cluster.push(mapData[cy][cx]);

        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height
            && !visited[ny][nx] && mapData[ny][nx].poi === 'mountain') {
            visited[ny][nx] = true;
            queue.push({ x: nx, y: ny });
          }
        }
      }

      clusters.push(cluster);
    }
  }

  logger.debug(`[HARMONIZE_MOUNTAINS] Found ${clusters.length} mountain clusters`);

  // Build a set of custom names for priority detection
  const customNameSet = new Set(customMountainNames.map(n => n.toLowerCase()));
  const remainingCustomNames = [...customMountainNames];

  clusters.forEach((cluster, i) => {
    // Collect any existing names in this cluster, prioritizing custom names
    let chosenName = null;

    // First pass: look for a custom name already assigned to a tile in this cluster
    for (const tile of cluster) {
      if (tile.mountainName && customNameSet.has(tile.mountainName.toLowerCase())) {
        chosenName = tile.mountainName;
        break;
      }
    }

    // Second pass: if no custom name on tiles, try assigning one from the remaining pool
    if (!chosenName && remainingCustomNames.length > 0) {
      chosenName = remainingCustomNames.shift();
    }

    // Third pass: use any existing generated name in the cluster
    if (!chosenName) {
      for (const tile of cluster) {
        if (tile.mountainName) {
          chosenName = tile.mountainName;
          break;
        }
      }
    }

    // Last resort: generate a new name
    if (!chosenName) {
      chosenName = generateMountainName(rng);
    }

    // Apply the chosen name to every tile in the cluster
    cluster.forEach((tile, j) => {
      tile.mountainName = chosenName;
      tile.descriptionSeed = `The ${chosenName}`;
      tile.isFirstMountainInRange = (j === 0);
    });

    logger.debug(`[HARMONIZE_MOUNTAINS] "${chosenName}" (${cluster.length} tiles) near (${cluster[0].x}, ${cluster[0].y})`);
  });
}

// Improve map distribution by adding features to sparse quadrants. landBiome is the
// map's dry-land base biome — only open tiles of that biome are candidates for fill.
function improveMapDistribution(mapData, width, height, rng, landBiome = 'plains') {
  const minFeaturesPerQuadrant = 3;

  // Define quadrants without overlap - clean 5x5 sections
  const quadrants = [
    { startX: 0, endX: 5, startY: 0, endY: 5, name: 'top-left' },
    { startX: 5, endX: 10, startY: 0, endY: 5, name: 'top-right' },
    { startX: 0, endX: 5, startY: 5, endY: 10, name: 'bottom-left' },
    { startX: 5, endX: 10, startY: 5, endY: 10, name: 'bottom-right' }
  ];

  for (const quadrant of quadrants) {
    // Count existing features in this quadrant
    let featureCount = 0;
    const plainsTiles = [];

    for (let y = quadrant.startY; y < quadrant.endY; y++) {
      for (let x = quadrant.startX; x < quadrant.endX; x++) {
        if (mapData[y] && mapData[y][x]) {
          if (mapData[y][x].poi !== null) {
            featureCount++;
          } else if (mapData[y][x].biome === landBiome) {
            plainsTiles.push({ x, y });
          }
        }
      }
    }

    logger.debug(`${quadrant.name} quadrant: ${featureCount} features, ${plainsTiles.length} plains tiles`);

    // If this quadrant has too few features, add some deterministically
    const featuresNeeded = minFeaturesPerQuadrant - featureCount;
    if (featuresNeeded > 0 && plainsTiles.length > 0) {
      logger.debug(`Adding ${featuresNeeded} features to ${quadrant.name} quadrant`);
      addFeaturesToQuadrant(mapData, plainsTiles, featuresNeeded, rng);
    }
  }
}

// Add features to a specific quadrant deterministically
function addFeaturesToQuadrant(mapData, plainsTiles, featuresNeeded, rng) {
  const featureTypes = ['forest', 'mountain'];

  // Shuffle plains tiles for random placement
  for (let i = plainsTiles.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [plainsTiles[i], plainsTiles[j]] = [plainsTiles[j], plainsTiles[i]];
  }

  // Place features on the first N available plains tiles
  for (let i = 0; i < Math.min(featuresNeeded, plainsTiles.length); i++) {
    const tile = plainsTiles[i];
    const featureType = featureTypes[Math.floor(rng() * featureTypes.length)];

    mapData[tile.y][tile.x].poi = featureType;
    mapData[tile.y][tile.x].descriptionSeed = featureType === 'forest' ? 'Dense woods' : 'Rocky peaks';
    logger.debug(`Placed ${featureType} at (${tile.x}, ${tile.y})`);
  }
}

// Check if a tile is valid for placement
function isValidPlacement(mapData, x, y, width, height, allowBeach = true) {
  if (x < 0 || x >= width || y < 0 || y >= height) return false;
  if (!mapData[y] || !mapData[y][x]) return false;
  if (mapData[y][x].poi !== null) return false; // Already has something
  if (mapData[y][x].biome === 'water') return false; // Don't place on water
  if (!allowBeach && mapData[y][x].biome === 'beach') return false; // Restricted from beaches
  return true;
}

// Helper function to get tile data (optional but helpful)
export const getTile = (mapData, x, y) => {
  if (mapData && y >= 0 && y < mapData.length && x >= 0 && x < mapData[y].length) {
    return mapData[y][x];
  }
  logger.warn(`Attempted to get invalid tile coordinates: ${x}, ${y}`);
  return null; // Or return a default 'void' tile object
};

// Find the starting town position (for player starting location)
export const findStartingTown = (mapData) => {
  logger.debug('[FIND_STARTING_TOWN] Searching for starting town...');

  // Look for the town marked as starting town
  for (let y = 0; y < mapData.length; y++) {
    for (let x = 0; x < mapData[y].length; x++) {
      if (mapData[y][x].poi === 'town' && mapData[y][x].isStartingTown) {
        const townName = mapData[y][x].townName || 'Unknown';
        const townSize = mapData[y][x].townSize || 'unknown';
        logger.debug(`[FIND_STARTING_TOWN] Found starting town: ${townName} (${townSize}) at (${x}, ${y})`);
        return { x, y };
      }
    }
  }

  // Fallback: look for the specific starting town description (backward compatibility)
  logger.debug('[FIND_STARTING_TOWN] No marked starting town found, looking for "A small village"...');
  for (let y = 0; y < mapData.length; y++) {
    for (let x = 0; x < mapData[y].length; x++) {
      if (mapData[y][x].poi === 'town' && mapData[y][x].descriptionSeed === "A small village") {
        logger.debug('[FIND_STARTING_TOWN] Found starting town by description at:', { x, y });
        return { x, y };
      }
    }
  }

  // Final fallback: look for any town
  logger.debug('[FIND_STARTING_TOWN] No starting town found, looking for any town...');
  for (let y = 0; y < mapData.length; y++) {
    for (let x = 0; x < mapData[y].length; x++) {
      if (mapData[y][x].poi === 'town') {
        logger.debug('[FIND_STARTING_TOWN] Found any town at:', { x, y }, 'with description:', mapData[y][x].descriptionSeed);
        return { x, y };
      }
    }
  }

  // This should never happen with the new system
  logger.error('[FIND_STARTING_TOWN] No towns found on map! This indicates a serious error in map generation.');
  throw new Error('No towns found on map - map generation failed');
};

// Test function to verify map generation and town finding
export const testMapGeneration = () => {
  logger.debug('=== TESTING MAP GENERATION ===');
  const testMap = generateMapData(10, 10, 12345); // Use fixed seed for reproducible results
  const foundTown = findStartingTown(testMap);
  logger.debug('Test result - Found starting town at:', foundTown);

  // Verify the town actually exists at that position
  const tileAtPosition = getTile(testMap, foundTown.x, foundTown.y);
  logger.debug('Tile at found position:', tileAtPosition);
  logger.debug('=== TEST COMPLETE ===');

  return { map: testMap, startingPosition: foundTown };
};

// Place a coast on one random edge of the map
function placeCoast(mapData, width, height, rng) {
  const edge = Math.floor(rng() * 4); // 0: North, 1: East, 2: South, 3: West
  const depth = 2 + Math.floor(rng() * 2); // At least 2 tiles deep
  stampCoast(mapData, width, height, edge, depth);
}

// Stamp a coast band on the given edge at the given depth (outer strip water, inner strip
// beach). Extracted from placeCoast so chunk assembly (issue #60, experimental) can
// prescribe a coastal chunk's edge/depth to continue the heart chunk's coastline.
function stampCoast(mapData, width, height, edge, depth) {
  for (let i = 0; i < width; i++) {
    for (let d = 0; d < depth; d++) {
      let x, y;
      if (edge === 0) { x = i; y = d; }
      else if (edge === 1) { x = width - 1 - d; y = i; }
      else if (edge === 2) { x = i; y = height - 1 - d; }
      else { x = d; y = i; }

      if (mapData[y] && mapData[y][x]) {
        if (d === depth - 1) {
          // Inner edge touching land becomes the beach
          mapData[y][x].biome = 'beach';
          mapData[y][x].beachDirection = edge;
          mapData[y][x].descriptionSeed = "A sandy beach";
        } else {
          mapData[y][x].biome = 'water';
          mapData[y][x].descriptionSeed = "The coastal sea";
        }
      }
    }
  }
}

// Bias the first 2 rows on each constrained side toward continuing the neighbour chunk's
// edge biomes (issue #60, experimental). Simple exact-continuation with probability decaying
// inward (0.85 at the seam row, 0.4 one row in) — deliberately not interpolation. Only land
// biomes are stamped: water/beach need direction data the constraint doesn't carry, and
// stamping bare water would create unringed lakes; the assembler handles coasts separately.
function applyEdgeConstraints(mapData, width, height, rng, constraints, landBiome) {
  const CONTINUE_P = [0.85, 0.4];
  const LAND_BIOMES = new Set(['plains', 'desert', 'snow', 'woodland']);
  const DESCRIPTIONS = {
    plains: 'Open fields', desert: 'Open desert', snow: 'Frozen tundra', woodland: 'Deep woodland',
  };
  // For side S, coord(i, d) is the tile at position i along that edge, d rows inward.
  const SIDES = {
    north: { len: width, coord: (i, d) => [i, d] },
    south: { len: width, coord: (i, d) => [i, height - 1 - d] },
    west: { len: height, coord: (i, d) => [d, i] },
    east: { len: height, coord: (i, d) => [width - 1 - d, i] },
  };
  for (const [side, { len, coord }] of Object.entries(SIDES)) {
    const row = constraints[side];
    if (!Array.isArray(row)) continue;
    for (let i = 0; i < Math.min(row.length, len); i++) {
      const target = row[i];
      if (!LAND_BIOMES.has(target)) continue;
      for (let d = 0; d < CONTINUE_P.length; d++) {
        const [x, y] = coord(i, d);
        const t = mapData[y] && mapData[y][x];
        if (!t || t.poi || t.biome === target) continue;
        if (t.biome === 'water' || t.biome === 'beach') continue; // never overwrite the coast
        if (rng() < CONTINUE_P[d]) {
          t.biome = target;
          t.descriptionSeed = DESCRIPTIONS[target] || t.descriptionSeed;
        }
      }
    }
  }
}

// Helper to check if a tile is near water or beach (for buffering)
function isNearCoast(mapData, x, y, width, height) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        if (mapData[ny][nx].biome === 'water' || mapData[ny][nx].biome === 'beach') {
          return true;
        }
      }
    }
  }
  return false;
}

// Place a contiguous, natural-looking lake. landBiome is the map's dry-land base biome
// (plains for grassland, desert for desert) — lakes only carve into open land of that
// biome and never touch the coast/edges.
//
// Rendering model (see worldTileArt.biomeBackground + CLAUDE.md "Procedural maps"):
//   - The lake *body* is plain `biome: 'water'` tiles, so the renderer draws them with the
//     open-water sprite. A multi-tile blob therefore reads as ONE coherent water body
//     rather than a grid of separate ponds.
//   - The shore is the surrounding ring of `biome: 'beach'` tiles carrying a
//     `beachDirection` that points at the water — exactly the same convention placeCoast
//     uses — so worldTileArt renders a sandy shoreline instead of a hard water/grass edge.
//   We deliberately do NOT set the legacy single-tile `isLake` flag on new lakes: that flag
//   triggers the self-contained "pond" sprite (sand baked into the tile), which tiles badly
//   into a contiguous body. The `isLake` branch stays in the renderer so OLD saves keep
//   rendering their single-tile ponds (going-forward-only; no migration). Lakes stay marked
//   semantically via descriptionSeed ("A clear lake" / "A sandy lakeshore").
//
// capTiles (issue #59) is this lake's share of the map's total lake-water budget: the growth
// target never exceeds it. Returns the carved lake tiles ([] if no room was found) so the
// caller can size a second, strictly smaller lake against the first one's actual footprint.
// borderMargin (issue #60, experimental) is how close lake WATER may get to the map border:
// 1 = legacy (water at 1..w-2, shore ring may touch the border); chunk assembly passes 2 so
// neither the water nor its shore ring ever sits on a chunk seam.
function placeLakeCluster(mapData, width, height, rng, landBiome = 'plains', capTiles = Infinity, borderMargin = 1) {
  // Keep lakes apart: no other water/beach (another lake or the coast) within this many
  // tiles of any lake tile, so two lakes never crowd together (which produced ugly merged
  // corners and a confused path squeezing through the gap). Tiles of THIS lake are excluded.
  const SEPARATION = 2;
  const lakeSet = new Set();
  const clearOfOtherWater = (x, y) => {
    for (let dy = -SEPARATION; dy <= SEPARATION; dy++) {
      for (let dx = -SEPARATION; dx <= SEPARATION; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const b = mapData[ny][nx].biome;
        if ((b === 'water' || b === 'beach') && !lakeSet.has(`${nx},${ny}`)) return false;
      }
    }
    return true;
  };

  // 1. Find a seed tile away from the border, clear of the coast, and clear of other lakes.
  let seed = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    const sx = 2 + Math.floor(rng() * (width - 4));
    const sy = 2 + Math.floor(rng() * (height - 4));
    if (mapData[sy][sx].biome === landBiome && !isNearCoast(mapData, sx, sy, width, height) && clearOfOtherWater(sx, sy)) {
      seed = { x: sx, y: sy };
      break;
    }
  }
  if (!seed) return []; // no room for another well-separated lake, fine, fewer lakes

  // 2. Target a small multi-tile blob, scaled modestly with map size (~4-7 tiles on 10x10)
  //    and clamped to this lake's budget share (capTiles) so we never flood a small map.
  const maxTiles = Math.min(Math.max(3, Math.min(9, Math.floor((width * height) / 14))), capTiles);
  const minTiles = Math.min(4, maxTiles);
  const targetSize = minTiles + Math.floor(rng() * (maxTiles - minTiles + 1));

  // 2b. Per-lake shape personality (issue #59): a preferred growth axis and a wander factor,
  //     all drawn from the seeded rng, so two lakes on one map grow visibly different shapes
  //     (one stretched east-west and snaky, another compact and tall, etc.) instead of two
  //     near-identical isotropic blobs.
  const weightX = 0.5 + rng() * 2.0; // relative pull toward E/W growth
  const weightY = 0.5 + rng() * 2.0; // relative pull toward N/S growth
  const wander = 0.2 + rng() * 0.6;  // chance to grow from the newest tile (higher = snakier)

  // 3. Seeded flood-fill growth: repeatedly carve an open-land tile adjacent to the lake.
  const lakeTiles = [];
  const carve = (x, y) => {
    mapData[y][x].biome = 'water';
    mapData[y][x].descriptionSeed = 'A clear lake';
    lakeTiles.push({ x, y });
    lakeSet.add(`${x},${y}`);
  };
  carve(seed.x, seed.y);

  const dirs = [
    { dx: 0, dy: -1, w: weightY }, { dx: 1, dy: 0, w: weightX },
    { dx: 0, dy: 1, w: weightY }, { dx: -1, dy: 0, w: weightX },
  ];
  const totalWeight = 2 * (weightX + weightY);
  const pickDir = () => {
    let r = rng() * totalWeight;
    for (const d of dirs) {
      r -= d.w;
      if (r <= 0) return d;
    }
    return dirs[dirs.length - 1];
  };
  let guard = 0;
  while (lakeTiles.length < targetSize && guard < targetSize * 12) {
    guard++;
    const base = rng() < wander
      ? lakeTiles[lakeTiles.length - 1]
      : lakeTiles[Math.floor(rng() * lakeTiles.length)];
    const d = pickDir();
    const nx = base.x + d.dx;
    const ny = base.y + d.dy;
    // Keep at least borderMargin tiles inside the border so there's room for a shore ring
    // (and, for chunk assembly, so lakes never touch a chunk seam).
    if (nx < borderMargin || nx >= width - borderMargin || ny < borderMargin || ny >= height - borderMargin) continue;
    const t = mapData[ny][nx];
    // Don't grow toward another lake/coast either — preserve the separation gap.
    if (t.biome === landBiome && !t.poi && clearOfOtherWater(nx, ny)) {
      carve(nx, ny);
    }
  }

  // 3b. Smooth the blob so the shore has only clean corners (straight / concave / convex).
  //     Fill land tiles hugged by water on 3+ sides (peninsula notches/tips), 1-tile channel
  //     dividers (water on opposite sides), and diagonal saddles (no orthogonal water but two
  //     diagonal water) — the configurations the corner tiles can't render cleanly. The
  //     clearOfOtherWater guard keeps this from chewing into the coast or a neighbouring lake.
  const waterAt = (x, y) => x >= 0 && x < width && y >= 0 && y < height && mapData[y][x].biome === 'water';
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let cy = borderMargin; cy < height - borderMargin; cy++) {
      for (let cx = borderMargin; cx < width - borderMargin; cx++) {
        const t = mapData[cy][cx];
        if (t.biome !== landBiome || t.poi) continue;
        const n = waterAt(cx, cy - 1), e = waterAt(cx + 1, cy), s = waterAt(cx, cy + 1), w = waterAt(cx - 1, cy);
        const orth = n + e + s + w;
        const diag = waterAt(cx + 1, cy - 1) + waterAt(cx + 1, cy + 1) + waterAt(cx - 1, cy + 1) + waterAt(cx - 1, cy - 1);
        const fill = orth >= 3 || (n && s) || (e && w) || (orth === 0 && diag >= 2);
        if (fill && clearOfOtherWater(cx, cy)) {
          carve(cx, cy);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  // 4. Lay down the shore ring.
  addLakeShores(mapData, lakeTiles, width, height, landBiome);
  return lakeTiles;
}

// Turn each open-land tile orthogonally adjacent to a lake water tile into a beach, with
// beachDirection pointing at the nearest water (N=0, E=1, S=2, W=3 — the placeCoast
// convention). Only converts land of the map's base biome, so existing coast water/beach is
// left untouched.
export function addLakeShores(mapData, lakeTiles, width, height, landBiome) {
  const ORTH = [
    { dx: 0, dy: -1, dir: 0 }, // water North
    { dx: 1, dy: 0, dir: 1 },  // water East
    { dx: 0, dy: 1, dir: 2 },  // water South
    { dx: -1, dy: 0, dir: 3 }, // water West
  ];
  // diagonal-only neighbours -> convex outer-corner beaches (codes 8-11)
  const DIAG = [
    { dx: 1, dy: -1, code: 8 },  // water NE
    { dx: 1, dy: 1, code: 9 },   // water SE
    { dx: -1, dy: 1, code: 10 }, // water SW
    { dx: -1, dy: -1, code: 11 },// water NW
  ];
  const CORNER = { '0,1': 4, '1,2': 5, '2,3': 6, '0,3': 7 }; // concave: water on two adjacent sides
  const isWater = (x, y) => x >= 0 && x < width && y >= 0 && y < height && mapData[y][x].biome === 'water';
  const seen = new Set();
  // Visit ALL 8 neighbours of every lake tile so convex corners (touched only on a
  // diagonal) get shored too — those were the grass gaps between the straight/concave pieces.
  const candidates = [...ORTH, ...DIAG];
  for (const { x, y } of lakeTiles) {
    for (const n of candidates) {
      const sx = x + n.dx;
      const sy = y + n.dy;
      const key = `${sx},${sy}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (sx < 0 || sx >= width || sy < 0 || sy >= height) continue;
      const shore = mapData[sy][sx];
      if (shore.biome !== landBiome) continue; // skip the lake itself, coast, etc.

      const waterDirs = ORTH.filter((o) => isWater(sx + o.dx, sy + o.dy)).map((o) => o.dir);
      if (waterDirs.length >= 1) {
        // straight edge (1) or concave corner (2 adjacent)
        shore.biome = 'beach';
        shore.descriptionSeed = 'A sandy lakeshore';
        if (waterDirs.length >= 2) {
          const a = Math.min(waterDirs[0], waterDirs[1]);
          const b = Math.max(waterDirs[0], waterDirs[1]);
          shore.beachDirection = CORNER[`${a},${b}`] !== undefined ? CORNER[`${a},${b}`] : waterDirs[0];
        } else {
          shore.beachDirection = waterDirs[0];
        }
      } else {
        // no orthogonal water — convex outer corner if a diagonal is water
        const d = DIAG.find((dd) => isWater(sx + dd.dx, sy + dd.dy));
        if (d) {
          shore.biome = 'beach';
          shore.descriptionSeed = 'A sandy lakeshore';
          shore.beachDirection = d.code;
        }
      }
    }
  }
}

// Generate rivers flowing from mountains to water
function generateRivers(mapData, mountainTiles, rng) {
  // Find all water tiles
  const waterTiles = [];
  for (let y = 0; y < mapData.length; y++) {
    for (let x = 0; x < mapData[y].length; x++) {
      if (mapData[y][x].biome === 'water') {
        waterTiles.push({ x, y });
      }
    }
  }

  if (waterTiles.length === 0) return;

  // Pick 1-2 source mountains
  const numRivers = Math.min(mountainTiles.length, 1 + Math.floor(rng() * 2));
  const shuffledMountains = [...mountainTiles].sort(() => 0.5 - rng());

  const rivers = [];
  for (let i = 0; i < numRivers; i++) {
    const source = shuffledMountains[i];

    // Find nearest water tile
    let target = waterTiles[0];
    let minDist = Infinity;
    waterTiles.forEach(w => {
      const dist = Math.abs(w.x - source.x) + Math.abs(w.y - source.y);
      if (dist < minDist) {
        minDist = dist;
        target = w;
      }
    });

    // Use pathfinding to create river
    // We'll import these dynamically to avoid circular dependencies if any
    const { findPath, markRiverTiles } = require('./pathfinding');
    const path = findPath(mapData, source, target);
    if (path) {
      rivers.push(path);
    }
  }

  if (rivers.length > 0) {
    const { markRiverTiles } = require('./pathfinding');
    markRiverTiles(mapData, rivers);
  }
}
