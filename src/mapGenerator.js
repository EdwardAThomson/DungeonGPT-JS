// src/mapGenerator.js

// Random but sensible map generator
// Creates varied world maps with forests, mountains, and towns

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
  
  // Place starting town at (1,1) - always the same
  mapData[1][1].poi = 'town';
  mapData[1][1].descriptionSeed = "A small village";
  
  // Generate 2-4 forest clusters
  const numForestClusters = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < numForestClusters; i++) {
    placeForestCluster(mapData, width, height, rng);
  }
  
  // Generate 1-2 mountain ranges
  const numMountainRanges = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < numMountainRanges; i++) {
    placeMountainRange(mapData, width, height, rng);
  }
  
  // Place 1-2 additional towns (avoiding starting town)
  const numAdditionalTowns = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < numAdditionalTowns; i++) {
    placeTown(mapData, width, height, rng);
  }
  
  // Occasionally place a cave entrance near mountains
  if (rng() > 0.5) {
    placeCave(mapData, width, height, rng);
  }
  
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

// Place a town at a random empty location
function placeTown(mapData, width, height, rng) {
  const townNames = [
    "A trading post",
    "A farming hamlet",
    "A riverside settlement",
    "A crossroads inn"
  ];
  
  for (let attempt = 0; attempt < 20; attempt++) {
    const x = 1 + Math.floor(rng() * (width - 2));
    const y = 1 + Math.floor(rng() * (height - 2));
    
    if (isValidPlacement(mapData, x, y, width, height)) {
      mapData[y][x].poi = 'town';
      mapData[y][x].descriptionSeed = townNames[Math.floor(rng() * townNames.length)];
      return;
    }
  }
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

// Check if a tile is valid for placement
function isValidPlacement(mapData, x, y, width, height) {
  if (x < 0 || x >= width || y < 0 || y >= height) return false;
  if (!mapData[y] || !mapData[y][x]) return false;
  if (mapData[y][x].poi !== null) return false; // Already has something
  if (x === 1 && y === 1) return false; // Starting position
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
