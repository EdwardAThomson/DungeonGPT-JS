// src/mapGenerator.js

// Random but sensible map generator
// Creates varied world maps with forests, mountains, and towns

import { generateTownName } from './townNameGenerator';
import { generateTownPaths, markPathTiles } from './pathfinding';

/**
 * Generate a random world map with natural-looking feature placement
 * @param {number} width - Map width (default 10)
 * @param {number} height - Map height (default 10)
 * @param {number} seed - Optional seed for reproducible maps
 * @returns {Array} 2D array of map tiles
 */
export const generateMapData = (width = 10, height = 10, seed = null) => {
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
  
  // Generate 3-5 forest clusters (increased from 2-4)
  const numForestClusters = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < numForestClusters; i++) {
    placeForestCluster(mapData, width, height, rng);
  }
  
  // Generate 2-3 mountain ranges (increased from 1-2)
  const numMountainRanges = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < numMountainRanges; i++) {
    placeMountainRange(mapData, width, height, rng);
  }
  
  // Place 2-4 towns (including what will become the starting town)
  const numTowns = 2 + Math.floor(rng() * 3);
  console.log(`[MAP_GENERATION] Placing ${numTowns} towns...`);
  
  for (let i = 0; i < numTowns; i++) {
    const townPosition = placeTown(mapData, width, height, rng, townsList);
    if (townPosition) {
      townsList.push(townPosition);
    }
  }
  
  // Improve map distribution by adding features to sparse quadrants
  improveMapDistribution(mapData, width, height, rng);
  
  // Assign sizes and names to all towns
  if (townsList.length > 0) {
    assignTownSizesAndNames(mapData, townsList, rng);
    
    // Select one town randomly to be the starting town
    const startingTownIndex = Math.floor(rng() * townsList.length);
    const startingTown = townsList[startingTownIndex];
    
    // Mark it as the starting town
    mapData[startingTown.y][startingTown.x].isStartingTown = true;
    
    const startingTile = mapData[startingTown.y][startingTown.x];
    console.log(`[MAP_GENERATION] Selected starting town: ${startingTile.townName} (${startingTile.townSize}) at (${startingTown.x}, ${startingTown.y})`);
  } else {
    console.error('[MAP_GENERATION] No towns were placed! This should not happen.');
  }
  
  // Generate paths between towns
  if (townsList.length > 1) {
    console.log('[MAP_GENERATION] Generating paths between towns...');
    const paths = generateTownPaths(mapData, townsList);
    markPathTiles(mapData, paths);
  }
  
  // Debug: Log all towns on the map
  console.log('[MAP_GENERATION] Map generation complete. Towns on map:');
  townsList.forEach(town => {
    const tile = mapData[town.y][town.x];
    console.log(`  ${tile.townName} (${tile.townSize}) at (${town.x}, ${town.y})${tile.isStartingTown ? ' ⭐ STARTING TOWN' : ''}`);
  });
  
  return mapData;
};

// Seeded random number generator for reproducible maps
function seededRandom(seed) {
  let state = seed;
  return function() {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

// Place a cluster of 2-4 forest tiles
function placeForestCluster(mapData, width, height, rng) {
  const clusterSize = 2 + Math.floor(rng() * 3);
  const startX = 1 + Math.floor(rng() * (width - 2));
  const startY = 1 + Math.floor(rng() * (height - 2));
  
  const tiles = [{x: startX, y: startY}];
  
  // Grow cluster from starting point
  for (let i = 1; i < clusterSize; i++) {
    const base = tiles[Math.floor(rng() * tiles.length)];
    const directions = [
      {dx: 1, dy: 0}, {dx: -1, dy: 0},
      {dx: 0, dy: 1}, {dx: 0, dy: -1}
    ];
    
    // Try to place adjacent tile
    for (let attempt = 0; attempt < 4; attempt++) {
      const dir = directions[Math.floor(rng() * directions.length)];
      const newX = base.x + dir.dx;
      const newY = base.y + dir.dy;
      
      if (isValidPlacement(mapData, newX, newY, width, height)) {
        tiles.push({x: newX, y: newY});
        break;
      }
    }
  }
  
  // Place forest tiles
  tiles.forEach(tile => {
    if (mapData[tile.y] && mapData[tile.y][tile.x] && !mapData[tile.y][tile.x].poi) {
      mapData[tile.y][tile.x].poi = 'forest';
      mapData[tile.y][tile.x].descriptionSeed = "Dense woods";
    }
  });
}

// Place a mountain range of 2-3 tiles
function placeMountainRange(mapData, width, height, rng) {
  const rangeSize = 2 + Math.floor(rng() * 2);
  const startX = 1 + Math.floor(rng() * (width - 2));
  const startY = 1 + Math.floor(rng() * (height - 2));
  
  const tiles = [{x: startX, y: startY}];
  
  // Grow range in a line
  for (let i = 1; i < rangeSize; i++) {
    const base = tiles[tiles.length - 1];
    const directions = [
      {dx: 1, dy: 0}, {dx: -1, dy: 0},
      {dx: 0, dy: 1}, {dx: 0, dy: -1}
    ];
    
    for (let attempt = 0; attempt < 4; attempt++) {
      const dir = directions[Math.floor(rng() * directions.length)];
      const newX = base.x + dir.dx;
      const newY = base.y + dir.dy;
      
      if (isValidPlacement(mapData, newX, newY, width, height)) {
        tiles.push({x: newX, y: newY});
        break;
      }
    }
  }
  
  // Place mountain tiles
  tiles.forEach(tile => {
    if (mapData[tile.y] && mapData[tile.y][tile.x] && !mapData[tile.y][tile.x].poi) {
      mapData[tile.y][tile.x].poi = 'mountain';
      mapData[tile.y][tile.x].descriptionSeed = "Rocky peaks";
    }
  });
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
        console.log(`[PLACE_TOWN] Placed town at (${x}, ${y}): "${mapData[y][x].descriptionSeed}"`);
        return { x, y }; // Return the position
      }
    }
  }
  
  console.warn('[PLACE_TOWN] Failed to place town after 30 attempts');
  return null; // Return null if placement failed
}

// Place a cave entrance near mountains
function placeCave(mapData, width, height, rng) {
  // Find all mountain tiles
  const mountains = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mapData[y][x].poi === 'mountain') {
        mountains.push({x, y});
      }
    }
  }
  
  if (mountains.length === 0) return;
  
  // Pick a random mountain and try to place cave adjacent
  const mountain = mountains[Math.floor(rng() * mountains.length)];
  const directions = [
    {dx: 1, dy: 0}, {dx: -1, dy: 0},
    {dx: 0, dy: 1}, {dx: 0, dy: -1}
  ];
  
  for (const dir of directions) {
    const x = mountain.x + dir.dx;
    const y = mountain.y + dir.dy;
    
    if (isValidPlacement(mapData, x, y, width, height)) {
      mapData[y][x].poi = 'cave_entrance';
      mapData[y][x].descriptionSeed = "A dark cave entrance";
      return;
    }
  }
}

// Assign sizes and names to all towns on the map
function assignTownSizesAndNames(mapData, townsList, rng) {
  console.log(`[ASSIGN_TOWNS] Assigning sizes and names to ${townsList.length} towns...`);
  
  // Define size distribution based on number of towns
  // Ensure variety: hamlet, village, town, city
  const sizeDistribution = ['hamlet', 'village', 'town', 'city'];
  
  // Shuffle to randomize which town gets which size
  const shuffledSizes = [...sizeDistribution];
  for (let i = shuffledSizes.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffledSizes[i], shuffledSizes[j]] = [shuffledSizes[j], shuffledSizes[i]];
  }
  
  // Assign sizes and generate names
  townsList.forEach((town, index) => {
    const tile = mapData[town.y][town.x];
    const biome = tile.biome || 'plains';
    
    // Assign size (cycle through shuffled sizes if we have more towns than sizes)
    const size = shuffledSizes[index % shuffledSizes.length];
    tile.townSize = size;
    
    // Generate name based on size and biome
    tile.townName = generateTownName(size, biome, rng);
    
    // Update description seed based on size
    const sizeDescriptions = {
      hamlet: 'A small hamlet',
      village: 'A quiet village',
      town: 'A bustling town',
      city: 'A grand city'
    };
    tile.descriptionSeed = sizeDescriptions[size] || 'A settlement';
    
    console.log(`[ASSIGN_TOWNS] ${tile.townName} (${size}) at (${town.x}, ${town.y})`);
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
          } else {
            plainsTiles.push({ x, y });
          }
        }
      }
    }
    
    console.log(`${quadrant.name} quadrant: ${featureCount} features, ${plainsTiles.length} plains tiles`);
    
    // If this quadrant has too few features, add some deterministically
    const featuresNeeded = minFeaturesPerQuadrant - featureCount;
    if (featuresNeeded > 0 && plainsTiles.length > 0) {
      console.log(`Adding ${featuresNeeded} features to ${quadrant.name} quadrant`);
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
    console.log(`Placed ${featureType} at (${tile.x}, ${tile.y})`);
  }
}

// Check if a tile is valid for placement
function isValidPlacement(mapData, x, y, width, height) {
  if (x < 0 || x >= width || y < 0 || y >= height) return false;
  if (!mapData[y] || !mapData[y][x]) return false;
  if (mapData[y][x].poi !== null) return false; // Already has something
  return true;
}

// Helper function to get tile data (optional but helpful)
export const getTile = (mapData, x, y) => {
  if (mapData && y >= 0 && y < mapData.length && x >= 0 && x < mapData[y].length) {
    return mapData[y][x];
  }
  console.warn(`Attempted to get invalid tile coordinates: ${x}, ${y}`);
  return null; // Or return a default 'void' tile object
};

// Find the starting town position (for player starting location)
export const findStartingTown = (mapData) => {
  console.log('[FIND_STARTING_TOWN] Searching for starting town...');
  
  // Look for the town marked as starting town
  for (let y = 0; y < mapData.length; y++) {
    for (let x = 0; x < mapData[y].length; x++) {
      if (mapData[y][x].poi === 'town' && mapData[y][x].isStartingTown) {
        const townName = mapData[y][x].townName || 'Unknown';
        const townSize = mapData[y][x].townSize || 'unknown';
        console.log(`[FIND_STARTING_TOWN] Found starting town: ${townName} (${townSize}) at (${x}, ${y})`);
        return { x, y };
      }
    }
  }
  
  // Fallback: look for the specific starting town description (backward compatibility)
  console.log('[FIND_STARTING_TOWN] No marked starting town found, looking for "A small village"...');
  for (let y = 0; y < mapData.length; y++) {
    for (let x = 0; x < mapData[y].length; x++) {
      if (mapData[y][x].poi === 'town' && mapData[y][x].descriptionSeed === "A small village") {
        console.log('[FIND_STARTING_TOWN] Found starting town by description at:', { x, y });
        return { x, y };
      }
    }
  }
  
  // Final fallback: look for any town
  console.log('[FIND_STARTING_TOWN] No starting town found, looking for any town...');
  for (let y = 0; y < mapData.length; y++) {
    for (let x = 0; x < mapData[y].length; x++) {
      if (mapData[y][x].poi === 'town') {
        console.log('[FIND_STARTING_TOWN] Found any town at:', { x, y }, 'with description:', mapData[y][x].descriptionSeed);
        return { x, y };
      }
    }
  }
  
  // This should never happen with the new system
  console.error('[FIND_STARTING_TOWN] No towns found on map! This indicates a serious error in map generation.');
  throw new Error('No towns found on map - map generation failed');
};

// Test function to verify map generation and town finding
export const testMapGeneration = () => {
  console.log('=== TESTING MAP GENERATION ===');
  const testMap = generateMapData(10, 10, 12345); // Use fixed seed for reproducible results
  const foundTown = findStartingTown(testMap);
  console.log('Test result - Found starting town at:', foundTown);
  
  // Verify the town actually exists at that position
  const tileAtPosition = getTile(testMap, foundTown.x, foundTown.y);
  console.log('Tile at found position:', tileAtPosition);
  console.log('=== TEST COMPLETE ===');
  
  return { map: testMap, startingPosition: foundTown };
};
