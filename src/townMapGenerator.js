// townMapGenerator.js
// Generates interior maps for towns based on their size

import { generateTavernName, generateGuildName, generateBankName } from './townNameGenerator';

/**
 * Generate a town interior map based on town size
 * @param {string} townSize - Size of the town: 'hamlet', 'village', 'town', 'city'
 * @param {string} townName - Name of the town
 * @param {Object} entryPoint - Entry direction: 'north', 'south', 'east', 'west'
 * @param {number} seed - Optional seed for reproducible maps
 * @returns {Object} Town map data with tiles and metadata
 */
export const generateTownMap = (townSize, townName, entryPoint = 'south', seed = null) => {
  console.log(`[TOWN_MAP] Generating ${townSize} map for ${townName}`);
  
  // Determine map size based on town size
  const sizeConfig = {
    hamlet: { width: 8, height: 8, buildings: 3 },
    village: { width: 12, height: 12, buildings: 6 },
    town: { width: 16, height: 16, buildings: 10 },
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
  
  // Calculate entry point position
  const entryPos = calculateEntryPosition(width, height, entryPoint);
  
  // Place main road from entry to center
  placeMainRoad(mapData, entryPos, entryPoint, width, height, townSize);
  
  // Place town square/center
  const centerPos = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
  placeTownCenter(mapData, centerPos, townSize);
  
  // Place buildings
  placeBuildings(mapData, buildingCount, townSize, rng);
  
  // Generate paths connecting all buildings to the road network
  generateBuildingPaths(mapData, centerPos, rng);
  
  // Place decorations (trees, wells, etc.) LAST
  // This way they fill in empty spaces without blocking buildings or paths
  placeDecorations(mapData, townSize, rng);
  
  // Mark entry point
  mapData[entryPos.y][entryPos.x].isEntry = true;
  
  return {
    mapData,
    width,
    height,
    townName,
    townSize,
    entryPoint: entryPos,
    centerPoint: centerPos
  };
};

// Seeded random number generator
function seededRandom(seed) {
  let state = seed;
  return function() {
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

// Place main road from entry to center
function placeMainRoad(mapData, entryPos, direction, width, height, townSize) {
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  
  // Determine road width and type based on town size
  const isWideRoad = (townSize === 'town' || townSize === 'city');
  const roadType = townSize === 'city' ? 'stone_path' : 'dirt_path';
  
  // Create path from entry to center
  if (direction === 'north' || direction === 'south') {
    // Vertical road
    const startY = Math.min(entryPos.y, centerY);
    const endY = Math.max(entryPos.y, centerY);
    
    for (let y = startY; y <= endY; y++) {
      mapData[y][centerX].type = roadType;
      
      // Add road width for towns and cities (2 wide total)
      if (isWideRoad && centerX < width - 1) {
        mapData[y][centerX + 1].type = roadType;
      }
    }
  } else {
    // Horizontal road
    const startX = Math.min(entryPos.x, centerX);
    const endX = Math.max(entryPos.x, centerX);
    const roadY = Math.floor(height / 2);
    
    for (let x = startX; x <= endX; x++) {
      mapData[roadY][x].type = roadType;
      
      // Add road width for towns and cities (2 wide total)
      if (isWideRoad && roadY < height - 1) {
        mapData[roadY + 1][x].type = roadType;
      }
    }
  }
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
        // Hamlets and villages use dirt paths, towns and cities use stone
        if (townSize === 'hamlet' || townSize === 'village') {
          mapData[y][x].type = 'dirt_path';
        } else {
          mapData[y][x].type = 'stone_path';
        }
        
        // Place fountain/well in the very center
        if (dx === 0 && dy === 0) {
          mapData[y][x].poi = townSize === 'city' ? 'fountain' : 'well';
        }
      }
    }
  }
}

// Place buildings around the town - COMPLETELY REWRITTEN
function placeBuildings(mapData, count, townSize, rng) {
  const centerX = Math.floor(mapData[0].length / 2);
  const centerY = Math.floor(mapData.length / 2);
  
  // Define important buildings for each town size
  const buildingConfig = {
    hamlet: {
      important: ['barn'],
      houses: 5
    },
    village: {
      important: ['inn', 'shop'],
      houses: 8
    },
    town: {
      important: ['inn', 'shop', 'temple', 'tavern', 'tavern'],
      houses: 20  // Reduced from 40
    },
    city: {
      important: ['temple', 'market', 'manor', 'tavern', 'tavern', 'tavern', 'guild', 'guild', 'guild', 'bank', 'bank', 'bank'],
      houses: 40  // Reduced from 80
    }
  };
  
  const config = buildingConfig[townSize] || buildingConfig.village;
  const { important, houses } = config;
  
  // Track occupied positions
  const occupied = new Set();
  
  // Helper to mark tile as occupied
  const markOccupied = (x, y) => {
    occupied.add(`${x},${y}`);
  };
  
  // Helper to check if occupied
  const isOccupied = (x, y) => {
    if (x < 0 || x >= mapData[0].length || y < 0 || y >= mapData.length) return true;
    if (occupied.has(`${x},${y}`)) return true;
    const tile = mapData[y][x];
    // Only place on empty grass (no paths, no buildings)
    return tile.type !== 'grass';
  };
  
  // Get square size
  const squareSize = townSize === 'hamlet' ? 1 : townSize === 'village' ? 2 : 3;
  const halfSize = Math.floor(squareSize / 2);
  
  // STEP 1: Place important buildings around town square clockwise
  console.log(`[TOWN_MAP] Placing ${important.length} important buildings around square...`);
  
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
  
  // Place important buildings
  let importantPlaced = 0;
  // Start at random position for first building
  let posIndex = Math.floor(rng() * squarePositions.length);
  
  for (const buildingType of important) {
    let placed = false;
    
    // Try positions around square
    for (let i = 0; i < squarePositions.length && !placed; i++) {
      const pos = squarePositions[(posIndex + i) % squarePositions.length];
      
      if (!isOccupied(pos.x, pos.y)) {
        mapData[pos.y][pos.x].type = 'building';
        mapData[pos.y][pos.x].buildingType = buildingType;
        mapData[pos.y][pos.x].walkable = false;
        mapData[pos.y][pos.x].poi = null; // Clear any trees/decorations
        
        // Generate names for special buildings
        if (buildingType === 'tavern') {
          mapData[pos.y][pos.x].buildingName = generateTavernName(rng);
        } else if (buildingType === 'guild') {
          mapData[pos.y][pos.x].buildingName = generateGuildName(rng);
        } else if (buildingType === 'bank') {
          mapData[pos.y][pos.x].buildingName = generateBankName(rng);
        }
        
        markOccupied(pos.x, pos.y);
        importantPlaced++;
        placed = true;
        posIndex = (posIndex + 2) % squarePositions.length; // Skip one space
      }
    }
    
    // If couldn't place around square, try one ring out
    if (!placed) {
      for (let radius = 2; radius <= 4 && !placed; radius++) {
        for (let dy = -radius; dy <= radius && !placed; dy++) {
          for (let dx = -radius; dx <= radius && !placed; dx++) {
            if (Math.abs(dx) === radius || Math.abs(dy) === radius) {
              const x = centerX + dx;
              const y = centerY + dy;
              
              if (!isOccupied(x, y)) {
                mapData[y][x].type = 'building';
                mapData[y][x].buildingType = buildingType;
                mapData[y][x].walkable = false;
                mapData[y][x].poi = null; // Clear any trees/decorations
                
                if (buildingType === 'tavern') {
                  mapData[y][x].buildingName = generateTavernName(rng);
                } else if (buildingType === 'guild') {
                  mapData[y][x].buildingName = generateGuildName(rng);
                } else if (buildingType === 'bank') {
                  mapData[y][x].buildingName = generateBankName(rng);
                }
                
                markOccupied(x, y);
                importantPlaced++;
                placed = true;
              }
            }
          }
        }
      }
    }
  }
  
  console.log(`[TOWN_MAP] Placed ${importantPlaced} important buildings`);
  
  // STEP 2: Place houses away from center (exclude rings based on town size)
  console.log(`[TOWN_MAP] Placing ${houses} houses...`);
  
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
    
    if (!isOccupied(pos.x, pos.y)) {
      mapData[pos.y][pos.x].type = 'building';
      mapData[pos.y][pos.x].buildingType = 'house';
      mapData[pos.y][pos.x].walkable = false;
      mapData[pos.y][pos.x].poi = null; // Clear any trees/decorations
      markOccupied(pos.x, pos.y);
      housesPlaced++;
    }
  }
  
  console.log(`[TOWN_MAP] Placed ${housesPlaced} houses`);
  console.log(`[TOWN_MAP] Total buildings: ${importantPlaced + housesPlaced}`);
}

// Place decorative elements
function placeDecorations(mapData, townSize, rng) {
  const decorationCount = {
    hamlet: 36,   // Lots of trees in hamlets (tripled)
    village: 45,  // More trees in villages (tripled)
    town: 36,     // Some trees in towns (tripled)
    city: 24      // Fewer trees in cities (tripled)
  };
  
  const count = decorationCount[townSize] || 30;
  // More trees, fewer other decorations
  const decorations = ['tree', 'tree', 'tree', 'tree', 'bush', 'flowers', 'tree', 'tree'];
  
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
  
  // STEP 1: Connect a few houses (20%) directly to the main road network
  const directConnections = Math.ceil(houses.length * 0.2);
  const shuffledHouses = [...houses];
  
  // Shuffle houses
  for (let i = shuffledHouses.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffledHouses[i], shuffledHouses[j]] = [shuffledHouses[j], shuffledHouses[i]];
  }
  
  // Connect first 20% directly to nearest road
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
    }
  }
  
  // STEP 2: Connect remaining houses to nearest building (house or path)
  for (let i = directConnections; i < shuffledHouses.length; i++) {
    const house = shuffledHouses[i];
    
    // Find nearest path tile OR other building
    let nearestTarget = null;
    let minDist = Infinity;
    
    // Check all path tiles and already-placed buildings
    [...pathTiles, ...shuffledHouses.slice(0, i)].forEach(target => {
      const dist = Math.abs(house.x - target.x) + Math.abs(house.y - target.y);
      if (dist < minDist && dist > 0) {
        minDist = dist;
        nearestTarget = target;
      }
    });
    
    if (nearestTarget && minDist > 1 && minDist < 8) {
      createPath(house, nearestTarget);
    }
  }
  
  console.log(`[TOWN_MAP] Generated organic paths: ${directConnections} direct connections, ${houses.length - directConnections} house-to-house`);
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
      flowers: '🌸'
    };
    return poiEmojis[tile.poi] || '❓';
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
      barn: '🏚️'
    };
    return buildingEmojis[tile.buildingType] || '🏠';
  }
  
  // Terrain types - return empty string to show just the colored tile
  return '';
};

export default generateTownMap;
