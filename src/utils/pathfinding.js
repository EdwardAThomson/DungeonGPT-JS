// pathfinding.js
// A* pathfinding algorithm for generating paths between towns

/**
 * A* pathfinding implementation
 * @param {Array} mapData - 2D array of map tiles
 * @param {Object} start - Starting position {x, y}
 * @param {Object} goal - Goal position {x, y}
 * @returns {Array} Array of positions forming the path, or null if no path found
 */
export const findPath = (mapData, start, goal) => {
  const width = mapData[0].length;
  const height = mapData.length;

  // Helper to get neighbors (4-directional)
  const getNeighbors = (pos) => {
    const neighbors = [];
    const directions = [
      { dx: 0, dy: -1 }, // North
      { dx: 1, dy: 0 },  // East
      { dx: 0, dy: 1 },  // South
      { dx: -1, dy: 0 }  // West
    ];

    directions.forEach(dir => {
      const newX = pos.x + dir.dx;
      const newY = pos.y + dir.dy;

      if (newX >= 0 && newX < width && newY >= 0 && newY < height) {
        neighbors.push({ x: newX, y: newY });
      }
    });

    return neighbors;
  };

  // Calculate movement cost for a tile
  const getCost = (tile) => {
    // Prefer plains, avoid water/beaches if possible
    if (tile.biome === 'water') return 100; // Very high cost, use only if no other way
    if (tile.biome === 'beach') return 5;   // Higher than land (1-3) to discourage surf roads
    if (tile.poi === 'forest') return 2;
    if (tile.poi === 'mountain') return 5;
    return 1; // Plains or empty tiles
  };

  // Manhattan distance heuristic
  const heuristic = (pos, goal) => {
    return Math.abs(pos.x - goal.x) + Math.abs(pos.y - goal.y);
  };

  // Key for position
  const posKey = (pos) => `${pos.x},${pos.y}`;

  // Initialize
  const openSet = [start];
  const cameFrom = new Map();
  const gScore = new Map();
  const fScore = new Map();

  gScore.set(posKey(start), 0);
  fScore.set(posKey(start), heuristic(start, goal));

  while (openSet.length > 0) {
    // Find node with lowest fScore
    let current = openSet[0];
    let currentIndex = 0;

    for (let i = 1; i < openSet.length; i++) {
      if (fScore.get(posKey(openSet[i])) < fScore.get(posKey(current))) {
        current = openSet[i];
        currentIndex = i;
      }
    }

    // Check if we reached the goal
    if (current.x === goal.x && current.y === goal.y) {
      // Reconstruct path
      const path = [];
      let temp = current;

      while (temp) {
        path.unshift(temp);
        temp = cameFrom.get(posKey(temp));
      }

      return path;
    }

    // Remove current from openSet
    openSet.splice(currentIndex, 1);

    // Check neighbors
    const neighbors = getNeighbors(current);

    for (const neighbor of neighbors) {
      const tile = mapData[neighbor.y][neighbor.x];
      const tentativeGScore = gScore.get(posKey(current)) + getCost(tile);

      if (!gScore.has(posKey(neighbor)) || tentativeGScore < gScore.get(posKey(neighbor))) {
        // This path is better
        cameFrom.set(posKey(neighbor), current);
        gScore.set(posKey(neighbor), tentativeGScore);
        fScore.set(posKey(neighbor), tentativeGScore + heuristic(neighbor, goal));

        // Add to openSet if not already there
        if (!openSet.some(pos => pos.x === neighbor.x && pos.y === neighbor.y)) {
          openSet.push(neighbor);
        }
      }
    }
  }

  // No path found
  return null;
};

/**
 * Find the N nearest towns to a given town
 * @param {Object} town - Town position {x, y}
 * @param {Array} townsList - Array of all towns
 * @param {number} count - Number of nearest towns to find
 * @returns {Array} Array of nearest towns
 */
export const findNearestTowns = (town, townsList, count = 2) => {
  // Calculate distances to all other towns
  const distances = townsList
    .filter(t => t.x !== town.x || t.y !== town.y) // Exclude self
    .map(t => ({
      town: t,
      distance: Math.abs(t.x - town.x) + Math.abs(t.y - town.y)
    }))
    .sort((a, b) => a.distance - b.distance);

  // Return the N nearest
  return distances.slice(0, count).map(d => d.town);
};

/**
 * Generate paths between all towns
 * @param {Array} mapData - 2D array of map tiles
 * @param {Array} townsList - Array of town positions
 * @returns {Array} Array of paths, where each path is an array of positions
 */
export const generateTownPaths = (mapData, townsList) => {
  console.log('[PATHFINDING] Generating paths between towns...');
  const allPaths = [];
  const connectedPairs = new Set();

  townsList.forEach((town, index) => {
    // Find 1-2 nearest towns
    const nearestCount = townsList.length <= 2 ? 1 : 2;
    const nearestTowns = findNearestTowns(town, townsList, nearestCount);

    nearestTowns.forEach(targetTown => {
      // Create a unique key for this pair (order-independent)
      const pairKey = [
        `${town.x},${town.y}`,
        `${targetTown.x},${targetTown.y}`
      ].sort().join('->');

      // Skip if we've already connected this pair
      if (connectedPairs.has(pairKey)) {
        return;
      }

      // Find path using A*
      const path = findPath(mapData, town, targetTown);

      if (path) {
        allPaths.push(path);
        connectedPairs.add(pairKey);
        console.log(`[PATHFINDING] Path created: (${town.x},${town.y}) -> (${targetTown.x},${targetTown.y}) [${path.length} tiles]`);
      } else {
        console.warn(`[PATHFINDING] No path found between (${town.x},${town.y}) and (${targetTown.x},${targetTown.y})`);
      }
    });
  });

  console.log(`[PATHFINDING] Generated ${allPaths.length} paths`);
  return allPaths;
};

/**
 * Calculate path direction for a tile based on its neighbors in the path
 * @param {Object} tile - Current tile position {x, y}
 * @param {Array} path - Full path array
 * @returns {string} Direction string (e.g., 'NORTH_SOUTH', 'NORTH_EAST')
 */
export const calculatePathDirection = (tile, path) => {
  const index = path.findIndex(p => p.x === tile.x && p.y === tile.y);

  if (index === -1) return 'NONE';

  const connections = [];

  // Check previous tile
  if (index > 0) {
    const prev = path[index - 1];
    if (prev.y < tile.y) connections.push('north');
    else if (prev.y > tile.y) connections.push('south');
    else if (prev.x < tile.x) connections.push('west');
    else if (prev.x > tile.x) connections.push('east');
  }

  // Check next tile
  if (index < path.length - 1) {
    const next = path[index + 1];
    if (next.y < tile.y) connections.push('north');
    else if (next.y > tile.y) connections.push('south');
    else if (next.x < tile.x) connections.push('west');
    else if (next.x > tile.x) connections.push('east');
  }

  // Determine direction based on connections
  connections.sort(); // Normalize order
  const dirKey = connections.join('_').toUpperCase();

  // Map to standard direction names
  const directionMap = {
    'NORTH_SOUTH': 'NORTH_SOUTH',
    'EAST_WEST': 'EAST_WEST',
    'EAST_NORTH': 'NORTH_EAST',
    'NORTH_WEST': 'NORTH_WEST',
    'EAST_SOUTH': 'SOUTH_EAST',
    'SOUTH_WEST': 'SOUTH_WEST',
    // Handle dead ends (starts/ends)
    'NORTH': index === 0 ? 'START_NORTH' : 'END_NORTH',
    'SOUTH': index === 0 ? 'START_SOUTH' : 'END_SOUTH',
    'EAST': index === 0 ? 'START_EAST' : 'END_EAST',
    'WEST': index === 0 ? 'START_WEST' : 'END_WEST'
  };

  return directionMap[dirKey] || 'INTERSECTION';
};

/**
 * Mark path tiles on the map
 * @param {Array} mapData - 2D array of map tiles
 * @param {Array} paths - Array of paths
 */
export const markPathTiles = (mapData, paths) => {
  console.log('[PATHFINDING] Marking path tiles...');
  let markedCount = 0;

  paths.forEach(path => {
    path.forEach((tile, index) => {
      const mapTile = mapData[tile.y][tile.x];

      // Don't overwrite towns or other POIs
      if (mapTile.poi !== null) {
        return;
      }

      // Mark as path
      if (!mapTile.hasPath) {
        mapTile.hasPath = true;
        mapTile.pathConnections = [];
        markedCount++;
      }

      // Calculate and store direction
      const direction = calculatePathDirection(tile, path);
      mapTile.pathDirection = direction;

      // Store connections for potential intersection handling
      if (index > 0) {
        const prev = path[index - 1];
        if (prev.y < tile.y) mapTile.pathConnections.push('north');
        else if (prev.y > tile.y) mapTile.pathConnections.push('south');
        else if (prev.x < tile.x) mapTile.pathConnections.push('west');
        else if (prev.x > tile.x) mapTile.pathConnections.push('east');
      }

      if (index < path.length - 1) {
        const next = path[index + 1];
        if (next.y < tile.y && !mapTile.pathConnections.includes('north')) mapTile.pathConnections.push('north');
        else if (next.y > tile.y && !mapTile.pathConnections.includes('south')) mapTile.pathConnections.push('south');
        else if (next.x < tile.x && !mapTile.pathConnections.includes('west')) mapTile.pathConnections.push('west');
        else if (next.x > tile.x && !mapTile.pathConnections.includes('east')) mapTile.pathConnections.push('east');
      }
    });
  });

  console.log(`[PATHFINDING] Marked ${markedCount} tiles with paths`);
};

/**
 * Mark river tiles on the map
 * @param {Array} mapData - 2D array of map tiles
 * @param {Array} rivers - Array of river paths
 */
export const markRiverTiles = (mapData, rivers) => {
  console.log('[PATHFINDING] Marking river tiles...');
  let markedCount = 0;

  rivers.forEach(river => {
    river.forEach((tile, index) => {
      const mapTile = mapData[tile.y][tile.x];

      // Don't mark paths/rivers on towns, but rivers can go through forests/mountains
      if (mapTile.poi === 'town') {
        return;
      }

      // Mark as river
      if (!mapTile.hasRiver) {
        mapTile.hasRiver = true;
        mapTile.riverConnections = [];
        markedCount++;
      }

      // Calculate and store direction (reusing path direction logic)
      let direction = calculatePathDirection(tile, river);

      // If river is ending on a beach, make sure it stops at the center
      if (mapTile.biome === 'beach' && index === river.length - 1) {
        // Find which direction the water is in
        const directions = [
          { dx: 0, dy: -1, dir: 'END_NORTH' }, // Water is North
          { dx: 1, dy: 0, dir: 'END_EAST' },   // Water is East
          { dx: 0, dy: 1, dir: 'END_SOUTH' },  // Water is South
          { dx: -1, dy: 0, dir: 'END_WEST' }   // Water is West
        ];

        for (const d of directions) {
          const checkX = tile.x + d.dx;
          const checkY = tile.y + d.dy;
          if (mapData[checkY] && mapData[checkY][checkX] && mapData[checkY][checkX].biome === 'water') {
            direction = d.dir;
            break;
          }
        }
      }

      mapTile.riverDirection = direction;

      // Store connections
      if (index > 0) {
        const prev = river[index - 1];
        if (prev.y < tile.y) mapTile.riverConnections.push('north');
        else if (prev.y > tile.y) mapTile.riverConnections.push('south');
        else if (prev.x < tile.x) mapTile.riverConnections.push('west');
        else if (prev.x > tile.x) mapTile.riverConnections.push('east');
      }

      if (index < river.length - 1) {
        const next = river[index + 1];
        if (next.y < tile.y && !mapTile.riverConnections.includes('north')) mapTile.riverConnections.push('north');
        else if (next.y > tile.y && !mapTile.riverConnections.includes('south')) mapTile.riverConnections.push('south');
        else if (next.x < tile.x && !mapTile.riverConnections.includes('west')) mapTile.riverConnections.push('west');
        else if (next.x > tile.x && !mapTile.riverConnections.includes('east')) mapTile.riverConnections.push('east');
      }
    });
  });

  console.log(`[PATHFINDING] Marked ${markedCount} tiles with rivers`);
};
