/**
 * A* pathfinding algorithm for generating paths between towns.
 * Also handles river path marking on the world map.
 * Ported from src/utils/pathfinding.js — zero behavioral changes.
 */

// ── Types ────────────────────────────────────────────────────────────────────

/** A position on the map grid. */
export interface MapPosition {
  readonly x: number;
  readonly y: number;
}

/** Minimal tile shape needed by pathfinding. */
export interface PathfindingTile {
  biome?: string;
  poi?: string | null;
  hasPath?: boolean;
  pathConnections?: string[];
  pathDirection?: string;
  hasRiver?: boolean;
  riverConnections?: string[];
  riverDirection?: string;
}

/** 2D map grid type. */
export type MapGrid = PathfindingTile[][];

// ── Internal helpers ─────────────────────────────────────────────────────────

interface Direction {
  readonly dx: number;
  readonly dy: number;
}

const DIRECTIONS: readonly Direction[] = [
  { dx: 0, dy: -1 }, // North
  { dx: 1, dy: 0 }, // East
  { dx: 0, dy: 1 }, // South
  { dx: -1, dy: 0 }, // West
];

/**
 * Create a string key for a map position.
 */
function posKey(pos: MapPosition): string {
  return `${String(pos.x)},${String(pos.y)}`;
}

/**
 * Get the cardinal direction name from one position to another.
 */
function getCardinalDirection(from: MapPosition, to: MapPosition): string | null {
  if (from.y < to.y) return "north";
  if (from.y > to.y) return "south";
  if (from.x < to.x) return "west";
  if (from.x > to.x) return "east";
  return null;
}

/**
 * Add a connection direction to a connections array from a neighbor position.
 */
function addConnectionFromNeighbor(
  connections: string[],
  neighbor: MapPosition,
  tile: MapPosition,
): void {
  const dir = getCardinalDirection(neighbor, tile);
  if (dir) {
    connections.push(dir);
  }
}

/**
 * Add a connection direction from the next tile, only if not already present.
 */
function addUniqueConnectionFromNeighbor(
  connections: string[] | undefined,
  neighbor: MapPosition,
  tile: MapPosition,
): void {
  if (!connections) return;
  const dir = getCardinalDirection(neighbor, tile);
  if (dir && !connections.includes(dir)) {
    connections.push(dir);
  }
}

/**
 * Get the map tile at a given position, or undefined if out of bounds.
 */
function getMapTile(mapData: MapGrid, pos: MapPosition): PathfindingTile | undefined {
  const row = mapData[pos.y];
  if (!row) return undefined;
  return row[pos.x];
}

// ── A* pathfinding ──────────────────────────────────────────────────────────

/**
 * Calculate movement cost for a tile.
 * Prefer plains, avoid water/beaches if possible.
 */
const getCost = (tile: PathfindingTile): number => {
  if (tile.biome === "water") return 100; // Very high cost, use only if no other way
  if (tile.biome === "beach") return 5; // Higher than land (1-3) to discourage surf roads
  if (tile.poi === "forest") return 2;
  if (tile.poi === "mountain") return 5;
  return 1; // Plains or empty tiles
};

/**
 * Get valid 4-directional neighbors within map bounds.
 */
function getNeighbors(pos: MapPosition, width: number, height: number): MapPosition[] {
  const neighbors: MapPosition[] = [];
  for (const dir of DIRECTIONS) {
    const newX = pos.x + dir.dx;
    const newY = pos.y + dir.dy;
    if (newX >= 0 && newX < width && newY >= 0 && newY < height) {
      neighbors.push({ x: newX, y: newY });
    }
  }
  return neighbors;
}

/**
 * Find the node with the lowest fScore in the open set.
 */
function findLowestFScore(
  openSet: readonly MapPosition[],
  fScore: Map<string, number>,
): { node: MapPosition; index: number } | null {
  const firstNode = openSet[0];
  if (!firstNode) return null;

  let best = firstNode;
  let bestIndex = 0;

  for (let i = 1; i < openSet.length; i++) {
    const node = openSet[i];
    if (!node) continue;
    if (
      (fScore.get(posKey(node)) ?? Infinity) <
      (fScore.get(posKey(best)) ?? Infinity)
    ) {
      best = node;
      bestIndex = i;
    }
  }

  return { node: best, index: bestIndex };
}

/**
 * Reconstruct the path from the cameFrom map.
 */
function reconstructPath(
  cameFrom: Map<string, MapPosition>,
  current: MapPosition,
): MapPosition[] {
  const path: MapPosition[] = [];
  let temp: MapPosition | undefined = current;
  while (temp) {
    path.unshift(temp);
    temp = cameFrom.get(posKey(temp));
  }
  return path;
}

/**
 * Process a single neighbor during A* search.
 */
function processNeighbor(
  neighbor: MapPosition,
  current: MapPosition,
  goal: MapPosition,
  mapData: MapGrid,
  openSet: MapPosition[],
  cameFrom: Map<string, MapPosition>,
  gScore: Map<string, number>,
  fScore: Map<string, number>,
): void {
  const tile = getMapTile(mapData, neighbor);
  if (!tile) return;

  const tentativeGScore =
    (gScore.get(posKey(current)) ?? 0) + getCost(tile);
  const neighborKey = posKey(neighbor);

  if (
    !gScore.has(neighborKey) ||
    tentativeGScore < (gScore.get(neighborKey) ?? Infinity)
  ) {
    cameFrom.set(neighborKey, current);
    gScore.set(neighborKey, tentativeGScore);
    fScore.set(
      neighborKey,
      tentativeGScore + Math.abs(neighbor.x - goal.x) + Math.abs(neighbor.y - goal.y),
    );

    // Add to openSet if not already there
    if (!openSet.some((pos) => pos.x === neighbor.x && pos.y === neighbor.y)) {
      openSet.push(neighbor);
    }
  }
}

/**
 * A* pathfinding implementation.
 * @param mapData - 2D array of map tiles
 * @param start - Starting position
 * @param goal - Goal position
 * @returns Array of positions forming the path, or null if no path found
 */
export const findPath = (
  mapData: MapGrid,
  start: MapPosition,
  goal: MapPosition,
): MapPosition[] | null => {
  const firstRow = mapData[0];
  if (!firstRow) return null;
  const width = firstRow.length;
  const height = mapData.length;

  // Initialize
  const openSet: MapPosition[] = [start];
  const cameFrom = new Map<string, MapPosition>();
  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();

  const startKey = posKey(start);
  gScore.set(startKey, 0);
  fScore.set(startKey, Math.abs(start.x - goal.x) + Math.abs(start.y - goal.y));

  while (openSet.length > 0) {
    const best = findLowestFScore(openSet, fScore);
    if (!best) break;
    const { node: current, index: currentIndex } = best;

    // Check if we reached the goal
    if (current.x === goal.x && current.y === goal.y) {
      return reconstructPath(cameFrom, current);
    }

    // Remove current from openSet
    openSet.splice(currentIndex, 1);

    // Check neighbors
    const neighbors = getNeighbors(current, width, height);
    for (const neighbor of neighbors) {
      processNeighbor(neighbor, current, goal, mapData, openSet, cameFrom, gScore, fScore);
    }
  }

  // No path found
  return null;
};

/**
 * Find the N nearest towns to a given town.
 * @param town - Town position
 * @param townsList - Array of all towns
 * @param count - Number of nearest towns to find
 * @returns Array of nearest towns
 */
export const findNearestTowns = (
  town: MapPosition,
  townsList: readonly MapPosition[],
  count = 2,
): MapPosition[] => {
  // Calculate distances to all other towns
  const distances = townsList
    .filter((t) => t.x !== town.x || t.y !== town.y) // Exclude self
    .map((t) => ({
      town: t,
      distance: Math.abs(t.x - town.x) + Math.abs(t.y - town.y),
    }))
    .toSorted((a: { distance: number }, b: { distance: number }) => a.distance - b.distance);

  // Return the N nearest
  return distances.slice(0, count).map((d) => d.town);
};

/**
 * Generate paths between all towns.
 * @param mapData - 2D array of map tiles
 * @param townsList - Array of town positions
 * @returns Array of paths, where each path is an array of positions
 */
export const generateTownPaths = (
  mapData: MapGrid,
  townsList: readonly MapPosition[],
): MapPosition[][] => {

  console.log("[PATHFINDING] Generating paths between towns...");
  const allPaths: MapPosition[][] = [];
  const connectedPairs = new Set<string>();

  for (const town of townsList) {
    // Find 1-2 nearest towns
    const nearestCount = townsList.length <= 2 ? 1 : 2;
    const nearestTowns = findNearestTowns(town, townsList, nearestCount);

    for (const targetTown of nearestTowns) {
      // Create a unique key for this pair (order-independent)
      const pairKey = [
        `${String(town.x)},${String(town.y)}`,
        `${String(targetTown.x)},${String(targetTown.y)}`,
      ]
        .toSorted()
        .join("->");

      // Skip if we've already connected this pair
      if (connectedPairs.has(pairKey)) {
        continue;
      }

      // Find path using A*
      const path = findPath(mapData, town, targetTown);

      if (path) {
        allPaths.push(path);
        connectedPairs.add(pairKey);

        console.log(
          `[PATHFINDING] Path created: (${String(town.x)},${String(town.y)}) -> (${String(targetTown.x)},${String(targetTown.y)}) [${String(path.length)} tiles]`,
        );
      } else {

        console.warn(
          `[PATHFINDING] No path found between (${String(town.x)},${String(town.y)}) and (${String(targetTown.x)},${String(targetTown.y)})`,
        );
      }
    }
  }


  console.log(`[PATHFINDING] Generated ${String(allPaths.length)} paths`);
  return allPaths;
};

// ── Path direction calculation ──────────────────────────────────────────────

/**
 * Build connections list from the previous and next tiles in the path.
 */
function buildConnectionsList(
  tile: MapPosition,
  path: readonly MapPosition[],
  index: number,
): string[] {
  const connections: string[] = [];

  // Check previous tile
  if (index > 0) {
    const prev = path[index - 1];
    if (prev) {
      addConnectionFromNeighbor(connections, prev, tile);
    }
  }

  // Check next tile
  if (index < path.length - 1) {
    const next = path[index + 1];
    if (next) {
      addConnectionFromNeighbor(connections, next, tile);
    }
  }

  return connections;
}

/**
 * Build the direction map for path direction lookup, accounting for dead ends.
 */
function buildDirectionMap(index: number): Record<string, string> {
  return {
    NORTH_SOUTH: "NORTH_SOUTH",
    EAST_WEST: "EAST_WEST",
    EAST_NORTH: "NORTH_EAST",
    NORTH_WEST: "NORTH_WEST",
    EAST_SOUTH: "SOUTH_EAST",
    SOUTH_WEST: "SOUTH_WEST",
    // Handle dead ends (starts/ends)
    NORTH: index === 0 ? "START_NORTH" : "END_NORTH",
    SOUTH: index === 0 ? "START_SOUTH" : "END_SOUTH",
    EAST: index === 0 ? "START_EAST" : "END_EAST",
    WEST: index === 0 ? "START_WEST" : "END_WEST",
  };
}

/**
 * Calculate path direction for a tile based on its neighbors in the path.
 * @param tile - Current tile position
 * @param path - Full path array
 * @returns Direction string (e.g., 'NORTH_SOUTH', 'NORTH_EAST')
 */
export const calculatePathDirection = (
  tile: MapPosition,
  path: readonly MapPosition[],
): string => {
  const index = path.findIndex((p) => p.x === tile.x && p.y === tile.y);
  if (index === -1) return "NONE";

  const connections = buildConnectionsList(tile, path, index);

  // Determine direction based on connections
  const sorted = connections.toSorted();
  const dirKey = sorted.join("_").toUpperCase();

  const directionMap = buildDirectionMap(index);
  return directionMap[dirKey] ?? "INTERSECTION";
};

// ── Path and river tile marking ─────────────────────────────────────────────

/**
 * Store previous-tile connections for a path/river tile.
 */
function storePrevConnections(
  connections: string[] | undefined,
  prevPos: MapPosition | undefined,
  tilePos: MapPosition,
): void {
  if (!prevPos || !connections) return;
  addConnectionFromNeighbor(connections, prevPos, tilePos);
}

/**
 * Store next-tile connections for a path/river tile (only if not already present).
 */
function storeNextConnections(
  connections: string[] | undefined,
  nextPos: MapPosition | undefined,
  tilePos: MapPosition,
): void {
  if (!nextPos) return;
  addUniqueConnectionFromNeighbor(connections, nextPos, tilePos);
}

/**
 * Process a single tile for path marking.
 */
function processPathTile(
  mapData: MapGrid,
  path: readonly MapPosition[],
  index: number,
): boolean {
  const tile = path[index];
  if (!tile) return false;
  const mapTile = getMapTile(mapData, tile);
  if (!mapTile) return false;

  // Don't overwrite towns or other POIs
  if (mapTile.poi !== null && mapTile.poi !== undefined) {
    return false;
  }

  // Mark as path
  let newlyMarked = false;
  if (!mapTile.hasPath) {
    mapTile.hasPath = true;
    mapTile.pathConnections = [];
    newlyMarked = true;
  }

  // Calculate and store direction
  mapTile.pathDirection = calculatePathDirection(tile, path);

  // Store connections
  storePrevConnections(mapTile.pathConnections, path[index - 1], tile);
  storeNextConnections(mapTile.pathConnections, path[index + 1], tile);

  return newlyMarked;
}

/**
 * Mark path tiles on the map.
 * @param mapData - 2D array of map tiles
 * @param paths - Array of paths
 */
export const markPathTiles = (
  mapData: MapGrid,
  paths: readonly MapPosition[][],
): void => {

  console.log("[PATHFINDING] Marking path tiles...");
  let markedCount = 0;

  for (const path of paths) {
    for (let index = 0; index < path.length; index++) {
      if (processPathTile(mapData, path, index)) {
        markedCount++;
      }
    }
  }


  console.log(
    `[PATHFINDING] Marked ${String(markedCount)} tiles with paths`,
  );
};

/**
 * Determine the river end direction when ending on a beach tile.
 */
function findBeachEndDirection(
  mapData: MapGrid,
  tile: MapPosition,
): string | null {
  const beachDirections = [
    { dx: 0, dy: -1, dir: "END_NORTH" }, // Water is North
    { dx: 1, dy: 0, dir: "END_EAST" }, // Water is East
    { dx: 0, dy: 1, dir: "END_SOUTH" }, // Water is South
    { dx: -1, dy: 0, dir: "END_WEST" }, // Water is West
  ];

  for (const d of beachDirections) {
    const checkTile = getMapTile(mapData, { x: tile.x + d.dx, y: tile.y + d.dy });
    if (checkTile?.biome === "water") {
      return d.dir;
    }
  }
  return null;
}

/**
 * Process a single tile for river marking.
 */
function processRiverTile(
  mapData: MapGrid,
  river: readonly MapPosition[],
  index: number,
): boolean {
  const tile = river[index];
  if (!tile) return false;
  const mapTile = getMapTile(mapData, tile);
  if (!mapTile) return false;

  // Don't mark paths/rivers on towns, but rivers can go through forests/mountains
  if (mapTile.poi === "town") {
    return false;
  }

  // Mark as river
  let newlyMarked = false;
  if (!mapTile.hasRiver) {
    mapTile.hasRiver = true;
    mapTile.riverConnections = [];
    newlyMarked = true;
  }

  // Calculate and store direction (reusing path direction logic)
  let direction = calculatePathDirection(tile, river);

  // If river is ending on a beach, make sure it stops at the center
  if (mapTile.biome === "beach" && index === river.length - 1) {
    const beachDir = findBeachEndDirection(mapData, tile);
    if (beachDir) {
      direction = beachDir;
    }
  }

  mapTile.riverDirection = direction;

  // Store connections
  storePrevConnections(mapTile.riverConnections, river[index - 1], tile);
  storeNextConnections(mapTile.riverConnections, river[index + 1], tile);

  return newlyMarked;
}

/**
 * Mark river tiles on the map.
 * @param mapData - 2D array of map tiles
 * @param rivers - Array of river paths
 */
export const markRiverTiles = (
  mapData: MapGrid,
  rivers: readonly MapPosition[][],
): void => {

  console.log("[PATHFINDING] Marking river tiles...");
  let markedCount = 0;

  for (const river of rivers) {
    for (let index = 0; index < river.length; index++) {
      if (processRiverTile(mapData, river, index)) {
        markedCount++;
      }
    }
  }


  console.log(
    `[PATHFINDING] Marked ${String(markedCount)} tiles with rivers`,
  );
};
