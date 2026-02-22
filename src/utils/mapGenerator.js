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
 * @returns {Array} 2D array of map tiles
 */
export const generateMapData = (width = 10, height = 10, seed = null, customNames = {}) => {
  // Normalize customNames: support legacy flat array or new structured object
  const normalizedNames = Array.isArray(customNames)
    ? { towns: customNames, mountains: [] }
    : { towns: customNames?.towns || [], mountains: customNames?.mountains || [] };
  // Use seed for reproducible maps, or random
  const rng = seed !== null ? seededRandom(seed) : Math.random;

  const mapData = [];
  const townsList = []; // Keep track of all towns

  // Initialize all tiles as plains
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      row.push({
        x,
        y,
        biome: 'plains',
        poi: null,
        descriptionSeed: "Open fields",
        isExplored: false,
      });
    }
    mapData.push(row);
  }

  // 1. Generate Coast (one random edge)
  placeCoast(mapData, width, height, rng);

  // 2. Generate 1-2 Lake clusters
  const numLakes = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < numLakes; i++) {
    placeLakeCluster(mapData, width, height, rng);
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

  // 6. Place 2-4 towns
  const numTowns = 2 + Math.floor(rng() * 3);
  logger.debug(`[MAP_GENERATION] Placing ${numTowns} towns...`);

  for (let i = 0; i < numTowns; i++) {
    const townPosition = placeTown(mapData, width, height, rng, townsList);
    if (townPosition) {
      townsList.push(townPosition);
    }
  }

  // Improve map distribution by adding features to sparse quadrants
  improveMapDistribution(mapData, width, height, rng);

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
  let state = seed;
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

// Place a town at a random empty location with minimum distance from other towns
function placeTown(mapData, width, height, rng, existingTowns = []) {
  const townNames = [
    "A trading post",
    "A farming hamlet",
    "A riverside settlement",
    "A crossroads inn"
  ];

  const minDistance = 3; // Minimum 3 tiles between towns (2 empty squares)

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

  // Pick a random mountain and try to place cave adjacent
  const mountain = mountains[Math.floor(rng() * mountains.length)];
  const directions = [
    { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
    { dx: 0, dy: 1 }, { dx: 0, dy: -1 }
  ];

  for (const dir of directions) {
    const x = mountain.x + dir.dx;
    const y = mountain.y + dir.dy;

    if (isValidPlacement(mapData, x, y, width, height, false)) {
      mapData[y][x].poi = 'cave_entrance';
      mapData[y][x].descriptionSeed = "A dark cave entrance";
      return;
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

  // 2. Sort towns by importance (City > Town > Village > Hamlet)
  const sortedTowns = [...townsList].sort((a, b) => {
    const sizeA = mapData[a.y][a.x].townSize;
    const sizeB = mapData[b.y][b.x].townSize;
    return sizeOrder[sizeA] - sizeOrder[sizeB];
  });

  // 3. Assign NAMES based on sorted importance
  const remainingCustomNames = [...customNames];

  sortedTowns.forEach((town) => {
    const tile = mapData[town.y][town.x];
    const biome = tile.biome || 'plains';
    const size = tile.townSize;

    let townName;
    if (remainingCustomNames.length > 0) {
      // Use the next custom name in order (Capital first)
      townName = remainingCustomNames.shift();
    } else {
      // Fallback to random generator
      townName = generateTownName(size, biome, rng);
    }

    tile.townName = townName;

    // Update description seed based on size
    const sizeDescriptions = {
      hamlet: 'A small hamlet',
      village: 'A quiet village',
      town: 'A bustling town',
      city: 'A grand city'
    };
    tile.descriptionSeed = sizeDescriptions[size] || 'A settlement';

    logger.debug(`[ASSIGN_TOWNS] ${tile.townName} (${size}) at (${town.x}, ${town.y})`);
  });
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

// Improve map distribution by adding features to sparse quadrants
function improveMapDistribution(mapData, width, height, rng) {
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
          } else if (mapData[y][x].biome === 'plains') {
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

// Place a single lake tile
function placeLakeCluster(mapData, width, height, rng) {
  // Find a random spot not on the extreme edge and not on water/beach
  let startX, startY;
  for (let attempt = 0; attempt < 50; attempt++) {
    startX = 2 + Math.floor(rng() * (width - 4));
    startY = 2 + Math.floor(rng() * (height - 4));
    if (mapData[startY][startX].biome === 'plains' && !isNearCoast(mapData, startX, startY, width, height)) {
      mapData[startY][startX].biome = 'water';
      mapData[startY][startX].descriptionSeed = "A clear lake";
      mapData[startY][startX].isLake = true;
      break;
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
