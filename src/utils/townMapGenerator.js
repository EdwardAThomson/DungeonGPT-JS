// townMapGenerator.js
// Generates interior maps for towns based on their size

import { generateTavernName, generateGuildName, generateBankName, generateShopName, generateManorName, generateTempleName } from './townNameGenerator';
import { createLogger } from './logger';

const logger = createLogger('town-map-generator');

/**
 * Generate a town interior map based on town size
 * @param {string} townSize - Size of the town: 'hamlet', 'village', 'town', 'city'
 * @param {string} townName - Name of the town
 * @param {Object} entryPoint - Entry direction: 'north', 'south', 'east', 'west'
 * @param {number} seed - Optional seed for reproducible maps
 * @param {boolean} hasRiver - Whether the town has a river passing through it
 * @param {string} riverDirection - Direction of the river on the world map
 * @returns {Object} Town map data with tiles and metadata
 */
export const generateTownMap = (townSize, townName, entryPoint = 'south', seed = null, hasRiver = false, riverDirection = 'NORTH_SOUTH') => {
  logger.debug(`[TOWN_MAP] Generating ${townSize} map for ${townName}`);

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

  // Place river if it exists
  let riverInfo = null;
  if (hasRiver) {
    riverInfo = placeRiverInTown(mapData, riverDirection, width, height, rng);
  }

  // Place main road from entry to center
  placeMainRoad(mapData, entryPos, entryPoint, width, height, townSize, riverInfo);

  // Place town square/center
  const centerPos = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
  logger.debug('[TOWN_MAP] centerPos:', centerPos);
  placeTownCenter(mapData, centerPos, townSize);

  // Place city walls (cities only)
  if (townSize === 'city') {
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
  placeBuildings(mapData, buildingCount, townSize, rng, centerPos);

  // Generate paths connecting all buildings to the road network
  generateBuildingPaths(mapData, centerPos, rng);

  // Place farm fields (Hamlets, Villages, and Towns)
  if (townSize === 'hamlet' || townSize === 'village' || townSize === 'town') {
    placeFarmFields(mapData, townSize, rng);
  }

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

// Place main road from entry to center
function placeMainRoad(mapData, entryPos, direction, width, height, townSize, riverInfo = null) {
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

// Place city walls around perimeter (cities only)
function placeCityWalls(mapData) {
  const width = mapData[0].length;
  const height = mapData.length;

  // Place walls on all perimeter tiles
  for (let x = 0; x < width; x++) {
    // Top wall
    if (mapData[0][x].type === 'grass') {
      mapData[0][x].type = 'wall';
    }
    // Bottom wall
    if (mapData[height - 1][x].type === 'grass') {
      mapData[height - 1][x].type = 'wall';
    }
  }

  for (let y = 0; y < height; y++) {
    // Left wall
    if (mapData[y][0].type === 'grass') {
      mapData[y][0].type = 'wall';
    }
    // Right wall
    if (mapData[y][width - 1].type === 'grass') {
      mapData[y][width - 1].type = 'wall';
    }
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

        // Place fountain/well in the very center (on top of square)
        if (dx === 0 && dy === 0) {
          mapData[y][x].poi = townSize === 'city' ? 'fountain' : 'well';
        }
      }
    }
  }
}

// Place buildings around the town - COMPLETELY REWRITTEN
function placeBuildings(mapData, count, townSize, rng, centerPos) {
  if (!centerPos) {
    logger.warn('[TOWN_MAP] placeBuildings called with undefined centerPos, using map defaults');
    centerPos = { x: Math.floor(mapData[0].length / 2), y: Math.floor(mapData.length / 2) };
  }

  const centerX = centerPos.x;
  const centerY = centerPos.y;

  // Define important buildings for each town size
  const buildingConfig = {
    hamlet: {
      important: ['barn'],
      houses: 5
    },
    village: {
      important: ['inn', 'shop', 'blacksmith'],
      houses: 8
    },
    town: {
      important: ['inn', 'shop', 'temple', 'blacksmith', 'tavern', 'tavern'],
      houses: 20
    },
    city: {
      important: ['temple', 'market', 'manor', 'blacksmith', 'tavern', 'tavern', 'tavern', 'guild', 'guild', 'guild', 'bank', 'bank', 'bank'],
      houses: 40,
      hasKeep: true
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

  // STEP 0: Place keep at top of city (cities only)
  if (config.hasKeep) {
    logger.debug('[TOWN_MAP] Placing keep at top of city...');

    // Place keep at top center, inside the walls
    const keepX = centerX;
    const keepY = 3; // Inside the wall (y=0 is wall, y=1 is keep wall, y=2 might be road)

    if (!isOccupied(keepX, keepY)) {
      mapData[keepY][keepX].type = 'building';
      mapData[keepY][keepX].buildingType = 'keep';
      mapData[keepY][keepX].buildingName = generateManorName(rng); // Use Manor generator for Keep names
      mapData[keepY][keepX].walkable = false;
      mapData[keepY][keepX].poi = null;
      markOccupied(keepX, keepY);

      // Place thin wall around keep (3x3 area)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const wallX = keepX + dx;
          const wallY = keepY + dy;

          // Only place on perimeter of 3x3 area
          if ((Math.abs(dx) === 1 || Math.abs(dy) === 1) &&
            wallX >= 1 && wallX < mapData[0].length - 1 &&
            wallY >= 1 && wallY < mapData.length - 1) {

            // Don't overwrite the keep itself
            if (!(dx === 0 && dy === 0)) {
              if (mapData[wallY][wallX].type === 'grass') {
                mapData[wallY][wallX].type = 'keep_wall';
                markOccupied(wallX, wallY);
              }
            }
          }
        }
      }

      // Create stone path from keep wall to town square
      let pathY = keepY + 2; // Start after keep wall
      while (pathY < centerY) {
        if (mapData[pathY][keepX].type === 'grass') {
          mapData[pathY][keepX].type = 'stone_path';
        }
        pathY++;
      }

      logger.debug(`[TOWN_MAP] Placed keep at (${keepX}, ${keepY}) with keep wall and path to square`);
    }
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

      if (!isOccupied(pos.x, pos.y)) {
        mapData[pos.y][pos.x].type = 'building';
        mapData[pos.y][pos.x].buildingType = buildingType;
        mapData[pos.y][pos.x].walkable = false;
        mapData[pos.y][pos.x].poi = null; // Clear any trees/decorations

        // Generate names for special buildings
        // Generate names for special buildings
        if (buildingType === 'tavern' || buildingType === 'inn') {
          mapData[pos.y][pos.x].buildingName = generateTavernName(rng);
        } else if (buildingType === 'guild') {
          mapData[pos.y][pos.x].buildingName = generateGuildName(rng);
        } else if (buildingType === 'bank') {
          mapData[pos.y][pos.x].buildingName = generateBankName(rng);
        } else if (buildingType === 'shop' || buildingType === 'market') {
          mapData[pos.y][pos.x].buildingName = generateShopName(rng);
        } else if (buildingType === 'blacksmith') {
          const blacksmithNames = ["Iron Anvil", "Heavy Hammer", "Strong Forge", "Dragon Sunder", "Steel Strike", "The Hearth Forge"];
          mapData[pos.y][pos.x].buildingName = `${blacksmithNames[Math.floor(rng() * blacksmithNames.length)]}`;
        } else if (buildingType === 'manor' || buildingType === 'keep') {
          mapData[pos.y][pos.x].buildingName = generateManorName(rng);
        } else if (buildingType === 'temple') {
          mapData[pos.y][pos.x].buildingName = generateTempleName(rng);
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

                if (buildingType === 'tavern' || buildingType === 'inn') {
                  mapData[y][x].buildingName = generateTavernName(rng);
                } else if (buildingType === 'guild') {
                  mapData[y][x].buildingName = generateGuildName(rng);
                } else if (buildingType === 'bank') {
                  mapData[y][x].buildingName = generateBankName(rng);
                } else if (buildingType === 'shop' || buildingType === 'market') {
                  mapData[y][x].buildingName = generateShopName(rng);
                } else if (buildingType === 'blacksmith') {
                  const blacksmithNames = ["Iron Anvil", "Heavy Hammer", "Strong Forge", "Dragon Sunder", "Steel Strike", "The Hearth Forge"];
                  mapData[y][x].buildingName = `${blacksmithNames[Math.floor(rng() * blacksmithNames.length)]}`;
                } else if (buildingType === 'manor' || buildingType === 'keep') {
                  mapData[y][x].buildingName = generateManorName(rng);
                } else if (buildingType === 'temple') {
                  mapData[y][x].buildingName = generateTempleName(rng);
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

  logger.debug(`[TOWN_MAP] Placed ${importantPlaced} important buildings`);

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

// Place farm fields in clusters (Hamlets and Villages only)
function placeFarmFields(mapData, townSize, rng) {
  const width = mapData[0].length;
  const height = mapData.length;

  // Decide how many clusters to place
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
      keep: '🏰'  // Castle/keep for cities
    };
    return buildingEmojis[tile.buildingType] || '🏠';
  }

  // Terrain types - return empty string to show just the colored tile
  return '';
};

export default generateTownMap;
