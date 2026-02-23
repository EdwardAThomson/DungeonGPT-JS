/**
 * World map generator — creates varied world maps with forests, mountains, and towns.
 * Ported from src/utils/mapGenerator.js — zero behavioral changes.
 *
 * NOTE: This file is intentionally large because the original mapGenerator.js
 * contained all world generation logic in one file. Splitting would break
 * the preservation directive.
 */
import {
  findPath,
  generateTownPaths,
  markPathTiles,
  markRiverTiles,
} from "../npcs/pathfinding.js";

import { generateMountainName, generateTownName } from "./name-generator.js";

import type { RngFunction } from "./name-generator.js";
import type { MapPosition } from "../npcs/pathfinding.js";

// ── Types ────────────────────────────────────────────────────────────────────

/** A single tile on the world map. Uses mutable properties to match original code. */
export interface WorldTile {
  x: number;
  y: number;
  biome: string;
  poi: string | null;
  descriptionSeed: string;
  isExplored: boolean;
  isStartingTown?: boolean;
  townName?: string;
  townSize?: string;
  mountainName?: string;
  isFirstMountainInRange?: boolean;
  beachDirection?: number;
  isLake?: boolean;
  hasPath?: boolean;
  pathConnections?: string[];
  pathDirection?: string;
  hasRiver?: boolean;
  riverConnections?: string[];
  riverDirection?: string;
}

/** 2D world map grid. */
export type WorldMap = WorldTile[][];

/** Custom names input for map generation. */
export interface CustomNames {
  readonly towns?: readonly string[];
  readonly mountains?: readonly string[];
}

// ── Seeded RNG ──────────────────────────────────────────────────────────────

/**
 * Seeded random number generator for reproducible maps.
 * Linear Congruential Generator (LCG).
 */
function seededRandom(seed: number): RngFunction {
  let state = seed;
  return function () {
    state = (state * 9301 + 49_297) % 233_280;
    return state / 233_280;
  };
}

// ── Internal helpers ─────────────────────────────────────────────────────────

interface Direction {
  readonly dx: number;
  readonly dy: number;
}

const FOUR_DIRECTIONS: readonly Direction[] = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

/** Pick a random element from a non-empty array using the given RNG. */
function pickRandom<T>(array: readonly T[], rng: RngFunction): T {
  const index = Math.floor(rng() * array.length);
  const value = array[index];
  if (value === undefined) {
    throw new Error("pickRandom called on empty array");
  }
  return value;
}

/** Safely get a tile from the map, returning undefined if out of bounds. */
function getTileAt(
  mapData: WorldMap,
  x: number,
  y: number,
): WorldTile | undefined {
  const row = mapData[y];
  if (!row) return undefined;
  return row[x];
}

/** Check if tile at (nx, ny) is a coastal biome. */
function isCoastalBiome(
  mapData: WorldMap,
  nx: number,
  ny: number,
): boolean {
  const tile = getTileAt(mapData, nx, ny);
  if (!tile) return false;
  return tile.biome === "water" || tile.biome === "beach";
}

/**
 * Check if a tile is valid for placement.
 */
function isValidPlacement(
  mapData: WorldMap,
  x: number,
  y: number,
  width: number,
  height: number,
  allowBeach = true,
): boolean {
  if (x < 0 || x >= width || y < 0 || y >= height) return false;
  const tile = getTileAt(mapData, x, y);
  if (!tile) return false;
  if (tile.poi !== null) return false; // Already has something
  if (tile.biome === "water") return false; // Don't place on water
  if (!allowBeach && tile.biome === "beach") return false; // Restricted from beaches
  return true;
}

/**
 * Check if a tile is near water or beach (for buffering).
 */
function isNearCoast(
  mapData: WorldMap,
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (
        nx >= 0 && nx < width && ny >= 0 && ny < height &&
        isCoastalBiome(mapData, nx, ny)
      ) {
        return true;
      }
    }
  }
  return false;
}

// ── Feature placement functions ─────────────────────────────────────────────

/** Calculate the tile coordinates for a given edge index, strip position, and depth. */
function coastTileCoords(
  edge: number,
  i: number,
  d: number,
  width: number,
  height: number,
): { x: number; y: number } {
  switch (edge) {
  case 0: {
    return { x: i, y: d };
  }
  case 1: {
    return { x: width - 1 - d, y: i };
  }
  case 2: {
    return { x: i, y: height - 1 - d };
  }
  default: {
    return { x: d, y: i };
  }
  }
}

/**
 * Place a coast on one random edge of the map.
 */
function placeCoast(
  mapData: WorldMap,
  width: number,
  height: number,
  rng: RngFunction,
): void {
  const edge = Math.floor(rng() * 4); // 0: North, 1: East, 2: South, 3: West
  const depth = 2 + Math.floor(rng() * 2); // At least 2 tiles deep

  for (let i = 0; i < width; i++) {
    for (let d = 0; d < depth; d++) {
      const { x, y } = coastTileCoords(edge, i, d, width, height);
      const tile = getTileAt(mapData, x, y);
      if (!tile) continue;
      if (d === depth - 1) {
        // Inner edge touching land becomes the beach
        tile.biome = "beach";
        tile.beachDirection = edge;
        tile.descriptionSeed = "A sandy beach";
      } else {
        tile.biome = "water";
        tile.descriptionSeed = "The coastal sea";
      }
    }
  }
}

/**
 * Place a single lake tile.
 */
function placeLakeCluster(
  mapData: WorldMap,
  width: number,
  height: number,
  rng: RngFunction,
): void {
  // Find a random spot not on the extreme edge and not on water/beach
  for (let attempt = 0; attempt < 50; attempt++) {
    const startX = 2 + Math.floor(rng() * (width - 4));
    const startY = 2 + Math.floor(rng() * (height - 4));
    const tile = getTileAt(mapData, startX, startY);
    if (!tile) continue;
    if (
      tile.biome === "plains" &&
      !isNearCoast(mapData, startX, startY, width, height)
    ) {
      tile.biome = "water";
      tile.descriptionSeed = "A clear lake";
      tile.isLake = true;
      break;
    }
  }
}

/** Find a starting position for a cluster, avoiding water. */
function findClusterStart(
  mapData: WorldMap,
  width: number,
  height: number,
  rng: RngFunction,
  avoidBiomes: readonly string[],
): MapPosition {
  let startX = 0;
  let startY = 0;
  for (let attempt = 0; attempt < 10; attempt++) {
    startX = 1 + Math.floor(rng() * (width - 2));
    startY = 1 + Math.floor(rng() * (height - 2));
    const tile = getTileAt(mapData, startX, startY);
    if (tile && !avoidBiomes.includes(tile.biome)) break;
  }
  return { x: startX, y: startY };
}

/** Grow a cluster of positions outward from seed tiles using random directions. */
function growCluster(
  tiles: MapPosition[],
  targetSize: number,
  mapData: WorldMap,
  width: number,
  height: number,
  rng: RngFunction,
  allowBeach: boolean,
): void {
  for (let i = tiles.length; i < targetSize; i++) {
    const base = pickRandom(tiles, rng);
    for (let attempt = 0; attempt < 4; attempt++) {
      const dir = pickRandom(FOUR_DIRECTIONS, rng);
      const newX = base.x + dir.dx;
      const newY = base.y + dir.dy;
      if (isValidPlacement(mapData, newX, newY, width, height, allowBeach)) {
        tiles.push({ x: newX, y: newY });
        break;
      }
    }
  }
}

/**
 * Place a cluster of 2-4 forest tiles.
 */
function placeForestCluster(
  mapData: WorldMap,
  width: number,
  height: number,
  rng: RngFunction,
): void {
  const clusterSize = 2 + Math.floor(rng() * 3);
  const start = findClusterStart(mapData, width, height, rng, ["water"]);
  const tiles: MapPosition[] = [start];

  // Grow cluster from starting point
  growCluster(tiles, clusterSize, mapData, width, height, rng, true);

  // Place forest tiles
  for (const t of tiles) {
    const tile = getTileAt(mapData, t.x, t.y);
    if (tile && !tile.poi && tile.biome !== "water") {
      tile.poi = "forest";
      tile.descriptionSeed = "Dense woods";
    }
  }
}

/** Grow a mountain range linearly from the last placed tile. */
function growMountainRange(
  tiles: MapPosition[],
  rangeSize: number,
  mapData: WorldMap,
  width: number,
  height: number,
  rng: RngFunction,
): void {
  for (let i = 1; i < rangeSize; i++) {
    const lastTile = tiles.at(-1);
    if (!lastTile) break;
    for (let attempt = 0; attempt < 4; attempt++) {
      const dir = pickRandom(FOUR_DIRECTIONS, rng);
      const newX = lastTile.x + dir.dx;
      const newY = lastTile.y + dir.dy;
      if (isValidPlacement(mapData, newX, newY, width, height, false)) {
        tiles.push({ x: newX, y: newY });
        break;
      }
    }
  }
}

/**
 * Place a mountain range of 2-3 tiles.
 */
function placeMountainRange(
  mapData: WorldMap,
  width: number,
  height: number,
  rng: RngFunction,
): MapPosition[] {
  const rangeSize = 2 + Math.floor(rng() * 2);
  const start = findClusterStart(mapData, width, height, rng, [
    "water",
    "beach",
  ]);
  const tiles: MapPosition[] = [start];

  // Grow range in a line
  growMountainRange(tiles, rangeSize, mapData, width, height, rng);

  // Place mountain tiles
  for (const t of tiles) {
    const tile = getTileAt(mapData, t.x, t.y);
    if (tile && !tile.poi && tile.biome !== "water") {
      tile.poi = "mountain";
      tile.descriptionSeed = "Rocky peaks";
    }
  }

  return tiles;
}

/** Check if a candidate town position is too close to existing towns. */
function isTooCloseToExistingTowns(
  x: number,
  y: number,
  existingTowns: readonly MapPosition[],
  minDistance: number,
): boolean {
  for (const existingTown of existingTowns) {
    const distance =
      Math.abs(x - existingTown.x) + Math.abs(y - existingTown.y);
    if (distance < minDistance) {
      return true;
    }
  }
  return false;
}

/**
 * Place a town at a random empty location with minimum distance from other towns.
 */
function placeTown(
  mapData: WorldMap,
  width: number,
  height: number,
  rng: RngFunction,
  existingTowns: MapPosition[] = [],
): MapPosition | null {
  const townNames = [
    "A trading post",
    "A farming hamlet",
    "A riverside settlement",
    "A crossroads inn",
  ];

  const minDistance = 3; // Minimum 3 tiles between towns (2 empty squares)

  for (let attempt = 0; attempt < 30; attempt++) {
    const x = 1 + Math.floor(rng() * (width - 2));
    const y = 1 + Math.floor(rng() * (height - 2));

    if (!isValidPlacement(mapData, x, y, width, height)) continue;
    if (isTooCloseToExistingTowns(x, y, existingTowns, minDistance)) continue;

    const tile = getTileAt(mapData, x, y);
    if (!tile) continue;

    tile.poi = "town";
    tile.descriptionSeed = pickRandom(townNames, rng);

    console.log(
      `[PLACE_TOWN] Placed town at (${String(x)}, ${String(y)}): "${tile.descriptionSeed}"`,
    );
    return { x, y }; // Return the position
  }


  console.warn("[PLACE_TOWN] Failed to place town after 30 attempts");
  return null; // Return null if placement failed
}

/**
 * Place a cave entrance near mountains.
 * NOTE: This function exists in the original but is never called from generateMapData.
 * Preserving for API compatibility.
 */
export function placeCave(
  mapData: WorldMap,
  width: number,
  height: number,
  rng: RngFunction,
): void {
  // Find all mountain tiles
  const mountains: MapPosition[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = getTileAt(mapData, x, y);
      if (tile?.poi === "mountain") {
        mountains.push({ x, y });
      }
    }
  }

  if (mountains.length === 0) return;

  // Pick a random mountain and try to place cave adjacent
  const mountain = pickRandom(mountains, rng);

  for (const dir of FOUR_DIRECTIONS) {
    const x = mountain.x + dir.dx;
    const y = mountain.y + dir.dy;

    if (isValidPlacement(mapData, x, y, width, height, false)) {
      const tile = getTileAt(mapData, x, y);
      if (tile) {
        tile.poi = "cave_entrance";
        tile.descriptionSeed = "A dark cave entrance";
        return;
      }
    }
  }
}

// ── Town naming and sizing ──────────────────────────────────────────────────

/** Shuffle an array in-place using Fisher-Yates with the provided RNG. */
function shuffleInPlace(array: unknown[], rng: RngFunction): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
}

/** Assign a size label to each town tile. */
function assignTownSizes(
  mapData: WorldMap,
  townsList: MapPosition[],
  shuffledSizes: string[],
): void {
  for (const [index, town] of townsList.entries()) {
    const tile = getTileAt(mapData, town.x, town.y);
    if (!tile) continue;
    const assignedSize = shuffledSizes[index % shuffledSizes.length];
    if (assignedSize) {
      tile.townSize = assignedSize;
    }
  }
}

/** Assign names to towns in sorted-importance order. */
function assignTownNames(
  mapData: WorldMap,
  sortedTowns: readonly MapPosition[],
  rng: RngFunction,
  customNames: readonly string[],
): void {
  const sizeDescriptions: Record<string, string> = {
    hamlet: "A small hamlet",
    village: "A quiet village",
    town: "A bustling town",
    city: "A grand city",
  };
  const remainingCustomNames = [...customNames];

  for (const town of sortedTowns) {
    const tile = getTileAt(mapData, town.x, town.y);
    if (!tile) continue;
    const biome = tile.biome;
    const size = tile.townSize ?? "village";

    const townName = remainingCustomNames.length > 0
      ? (remainingCustomNames.shift() ?? generateTownName(size, biome, rng))
      : generateTownName(size, biome, rng);

    tile.townName = townName;
    tile.descriptionSeed = sizeDescriptions[size] ?? "A settlement";

    console.log(
      `[ASSIGN_TOWNS] ${tile.townName} (${size}) at (${String(town.x)}, ${String(town.y)})`,
    );
  }
}

/**
 * Assign sizes and names to all towns on the map.
 */
function assignTownSizesAndNames(
  mapData: WorldMap,
  townsList: MapPosition[],
  rng: RngFunction,
  customNames: readonly string[] = [],
): void {

  console.log(
    `[ASSIGN_TOWNS] Assigning sizes and names to ${String(townsList.length)} towns (Custom names: ${String(customNames.length)})...`,
  );

  const sizeOrder: Record<string, number> = {
    city: 0,
    town: 1,
    village: 2,
    hamlet: 3,
  };
  const sizeDistribution = ["hamlet", "village", "town", "city"];

  // Shuffle size distribution to randomize which town gets which size
  const shuffledSizes = [...sizeDistribution];
  shuffleInPlace(shuffledSizes, rng);

  // 1. Assign SIZES first
  assignTownSizes(mapData, townsList, shuffledSizes);

  // 2. Sort towns by importance (City > Town > Village > Hamlet)
  const sortedTowns = townsList.toSorted((a, b) => {
    const sizeA = getTileAt(mapData, a.x, a.y)?.townSize ?? "hamlet";
    const sizeB = getTileAt(mapData, b.x, b.y)?.townSize ?? "hamlet";
    return (sizeOrder[sizeA] ?? 3) - (sizeOrder[sizeB] ?? 3);
  });

  // 3. Assign NAMES based on sorted importance
  assignTownNames(mapData, sortedTowns, rng, customNames);
}

// ── Mountain harmonization ──────────────────────────────────────────────────

/** Enqueue unvisited mountain neighbors of a position for BFS. */
function enqueueMountainNeighbors(
  mapData: WorldMap,
  visited: boolean[][],
  pos: MapPosition,
  width: number,
  height: number,
  queue: MapPosition[],
): void {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const nx = pos.x + dx;
    const ny = pos.y + dy;
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
    const nVisitedRow = visited[ny];
    if (!nVisitedRow || nVisitedRow[nx]) continue;
    const nTile = getTileAt(mapData, nx, ny);
    if (nTile?.poi === "mountain") {
      nVisitedRow[nx] = true;
      queue.push({ x: nx, y: ny });
    }
  }
}

/** BFS to collect a connected component of mountain tiles starting at (startX, startY). */
function floodFillMountainCluster(
  mapData: WorldMap,
  visited: boolean[][],
  startX: number,
  startY: number,
  width: number,
  height: number,
): WorldTile[] {
  const cluster: WorldTile[] = [];
  const queue: MapPosition[] = [{ x: startX, y: startY }];

  const visitedRow = visited[startY];
  if (visitedRow) {
    visitedRow[startX] = true;
  }

  while (queue.length > 0) {
    const pos = queue.shift();
    if (!pos) break;
    const cTile = getTileAt(mapData, pos.x, pos.y);
    if (!cTile) continue;
    cluster.push(cTile);
    enqueueMountainNeighbors(mapData, visited, pos, width, height, queue);
  }

  return cluster;
}

/** Find all connected mountain clusters on the map. */
function findMountainClusters(
  mapData: WorldMap,
): WorldTile[][] {
  const height = mapData.length;
  const firstRow = mapData[0];
  if (!firstRow) return [];
  const width = firstRow.length;
  const visited = Array.from({ length: height }, () =>
    Array.from<boolean>({ length: width }).fill(false),
  );
  const clusters: WorldTile[][] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const visitedRow = visited[y];
      if (!visitedRow || visitedRow[x]) continue;
      const tile = getTileAt(mapData, x, y);
      if (tile?.poi !== "mountain") continue;
      clusters.push(
        floodFillMountainCluster(mapData, visited, x, y, width, height),
      );
    }
  }

  return clusters;
}

/** Choose a name for a mountain cluster, prioritizing custom names. */
function chooseMountainClusterName(
  cluster: readonly WorldTile[],
  customNameSet: ReadonlySet<string>,
  remainingCustomNames: string[],
  rng: RngFunction,
): string {
  // First pass: look for a custom name already assigned to a tile in this cluster
  for (const tile of cluster) {
    if (
      tile.mountainName &&
      customNameSet.has(tile.mountainName.toLowerCase())
    ) {
      return tile.mountainName;
    }
  }

  // Second pass: try assigning one from the remaining custom name pool
  const fromPool = remainingCustomNames.shift();
  if (fromPool) return fromPool;

  // Third pass: use any existing generated name in the cluster
  for (const tile of cluster) {
    if (tile.mountainName) {
      return tile.mountainName;
    }
  }

  // Last resort: generate a new name
  return generateMountainName(rng);
}

/**
 * Harmonize mountain names across the map using flood-fill connected components.
 * Adjacent mountain tiles are grouped into clusters. Each cluster gets one name.
 * Custom names (from templates/milestones) are prioritized and never overwritten.
 */
function harmonizeMountainNames(
  mapData: WorldMap,
  rng: RngFunction,
  customMountainNames: readonly string[] = [],
): void {
  const clusters = findMountainClusters(mapData);

  console.log(
    `[HARMONIZE_MOUNTAINS] Found ${String(clusters.length)} mountain clusters`,
  );

  const customNameSet = new Set(
    customMountainNames.map((n) => n.toLowerCase()),
  );
  const remainingCustomNames = [...customMountainNames];

  for (const cluster of clusters) {
    const chosenName = chooseMountainClusterName(
      cluster,
      customNameSet,
      remainingCustomNames,
      rng,
    );

    // Apply the chosen name to every tile in the cluster
    for (const [j, tile] of cluster.entries()) {
      tile.mountainName = chosenName;
      tile.descriptionSeed = `The ${chosenName}`;
      tile.isFirstMountainInRange = j === 0;
    }

    const firstTile = cluster[0];
    if (firstTile) {
      console.log(
        `[HARMONIZE_MOUNTAINS] "${chosenName}" (${String(cluster.length)} tiles) near (${String(firstTile.x)}, ${String(firstTile.y)})`,
      );
    }
  }
}

// ── Map distribution improvement ────────────────────────────────────────────

/** Place a single feature on a tile. */
function placeFeatureOnTile(
  mapData: WorldMap,
  position: MapPosition,
  featureType: string,
): void {
  const tile = getTileAt(mapData, position.x, position.y);
  if (!tile) return;
  tile.poi = featureType;
  tile.descriptionSeed =
    featureType === "forest" ? "Dense woods" : "Rocky peaks";

  console.log(
    `Placed ${featureType} at (${String(position.x)}, ${String(position.y)})`,
  );
}

/**
 * Add features to a specific quadrant deterministically.
 */
function addFeaturesToQuadrant(
  mapData: WorldMap,
  plainsTiles: MapPosition[],
  featuresNeeded: number,
  rng: RngFunction,
): void {
  const featureTypes = ["forest", "mountain"];

  // Shuffle plains tiles for random placement
  shuffleInPlace(plainsTiles, rng);

  // Place features on the first N available plains tiles
  const count = Math.min(featuresNeeded, plainsTiles.length);
  for (let i = 0; i < count; i++) {
    const t = plainsTiles[i];
    if (!t) continue;
    placeFeatureOnTile(mapData, t, pickRandom(featureTypes, rng));
  }
}

/** Analyze a quadrant and return feature count and plains tiles. */
function analyzeQuadrant(
  mapData: WorldMap,
  startX: number,
  endX: number,
  startY: number,
  endY: number,
): { featureCount: number; plainsTiles: MapPosition[] } {
  let featureCount = 0;
  const plainsTiles: MapPosition[] = [];

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const tile = getTileAt(mapData, x, y);
      if (!tile) continue;
      if (tile.poi !== null) {
        featureCount++;
      } else if (tile.biome === "plains") {
        plainsTiles.push({ x, y });
      }
    }
  }

  return { featureCount, plainsTiles };
}

/**
 * Improve map distribution by adding features to sparse quadrants.
 */
function improveMapDistribution(
  mapData: WorldMap,
  _width: number,
  _height: number,
  rng: RngFunction,
): void {
  const minFeaturesPerQuadrant = 3;

  // Define quadrants without overlap - clean 5x5 sections
  const quadrants = [
    { startX: 0, endX: 5, startY: 0, endY: 5, name: "top-left" },
    { startX: 5, endX: 10, startY: 0, endY: 5, name: "top-right" },
    { startX: 0, endX: 5, startY: 5, endY: 10, name: "bottom-left" },
    { startX: 5, endX: 10, startY: 5, endY: 10, name: "bottom-right" },
  ];

  for (const quadrant of quadrants) {
    const { featureCount, plainsTiles } = analyzeQuadrant(
      mapData,
      quadrant.startX,
      quadrant.endX,
      quadrant.startY,
      quadrant.endY,
    );

    console.log(
      `${quadrant.name} quadrant: ${String(featureCount)} features, ${String(plainsTiles.length)} plains tiles`,
    );

    // If this quadrant has too few features, add some deterministically
    const featuresNeeded = minFeaturesPerQuadrant - featureCount;
    if (featuresNeeded > 0 && plainsTiles.length > 0) {

      console.log(
        `Adding ${String(featuresNeeded)} features to ${quadrant.name} quadrant`,
      );
      addFeaturesToQuadrant(mapData, plainsTiles, featuresNeeded, rng);
    }
  }
}

// ── River generation ────────────────────────────────────────────────────────

/** Find all water tiles on the map. */
function findWaterTiles(mapData: WorldMap): MapPosition[] {
  const waterTiles: MapPosition[] = [];
  for (const [y, row] of mapData.entries()) {
    for (const [x, tile] of row.entries()) {
      if (tile.biome === "water") {
        waterTiles.push({ x, y });
      }
    }
  }
  return waterTiles;
}

/** Find the nearest water tile to a source position. */
function findNearestWater(
  source: MapPosition,
  waterTiles: readonly MapPosition[],
  fallback: MapPosition,
): MapPosition {
  let target = fallback;
  let minDist = Infinity;
  for (const w of waterTiles) {
    const dist = Math.abs(w.x - source.x) + Math.abs(w.y - source.y);
    if (dist < minDist) {
      minDist = dist;
      target = w;
    }
  }
  return target;
}

/**
 * Generate rivers flowing from mountains to water.
 */
function generateRivers(
  mapData: WorldMap,
  mountainTiles: MapPosition[],
  rng: RngFunction,
): void {
  const waterTiles = findWaterTiles(mapData);
  if (waterTiles.length === 0) return;

  // Pick 1-2 source mountains
  const numRivers = Math.min(
    mountainTiles.length,
    1 + Math.floor(rng() * 2),
  );

  const shuffledMountains = mountainTiles.toSorted(() => 0.5 - rng());

  const firstWater = waterTiles[0];
  if (!firstWater) return;

  const rivers: MapPosition[][] = [];
  for (let i = 0; i < numRivers; i++) {
    const source = shuffledMountains[i];
    if (!source) continue;

    const target = findNearestWater(source, waterTiles, firstWater);

    // Use pathfinding to create river
    // NOTE: Original used require('./pathfinding'), converted to static import
    const path = findPath(mapData, source, target);
    if (path) {
      rivers.push(path);
    }
  }

  if (rivers.length > 0) {
    markRiverTiles(mapData, rivers);
  }
}

// ── Input normalization ──────────────────────────────────────────────────────

/** Type guard: is the customNames input a legacy flat array of town names? */
function isLegacyNameArray(
  names: CustomNames | readonly string[],
): names is readonly string[] {
  return Array.isArray(names);
}

/** Normalize customNames into a structured { towns, mountains } object. */
function normalizeCustomNames(
  customNames: CustomNames | readonly string[],
): { towns: string[]; mountains: string[] } {
  if (isLegacyNameArray(customNames)) {
    return { towns: [...customNames], mountains: [] };
  }
  return {
    towns: customNames.towns ? [...customNames.towns] : [],
    mountains: customNames.mountains ? [...customNames.mountains] : [],
  };
}

// ── Map initialization ──────────────────────────────────────────────────────

/** Create a fresh map grid initialized to plains tiles. */
function initializeMapGrid(width: number, height: number): WorldMap {
  const mapData: WorldMap = [];
  for (let y = 0; y < height; y++) {
    const row: WorldTile[] = [];
    for (let x = 0; x < width; x++) {
      row.push({
        x,
        y,
        biome: "plains",
        poi: null,
        descriptionSeed: "Open fields",
        isExplored: false,
      });
    }
    mapData.push(row);
  }
  return mapData;
}

/** Place natural features: coast, lakes, forests, mountains, rivers. */
function placeNaturalFeatures(
  mapData: WorldMap,
  width: number,
  height: number,
  rng: RngFunction,
): MapPosition[] {
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
  const mountainTiles: MapPosition[] = [];
  for (let i = 0; i < numMountainRanges; i++) {
    const range = placeMountainRange(mapData, width, height, rng);
    if (range.length > 0) {
      mountainTiles.push(...range);
    }
  }

  // 5. Generate Rivers (from mountains to lakes/coast)
  if (mountainTiles.length > 0) {
    generateRivers(mapData, mountainTiles, rng);
  }

  return mountainTiles;
}

/** Place towns and assign starting town, sizes, names, and paths. */
function placeTownsAndPaths(
  mapData: WorldMap,
  width: number,
  height: number,
  rng: RngFunction,
  normalizedNames: { towns: string[]; mountains: string[] },
): void {
  const townsList: MapPosition[] = [];

  // 6. Place 2-4 towns
  const numTowns = 2 + Math.floor(rng() * 3);
  console.log(`[MAP_GENERATION] Placing ${String(numTowns)} towns...`);

  for (let i = 0; i < numTowns; i++) {
    const townPosition = placeTown(mapData, width, height, rng, townsList);
    if (townPosition) {
      townsList.push(townPosition);
    }
  }

  // Improve map distribution by adding features to sparse quadrants
  improveMapDistribution(mapData, width, height, rng);

  // Select starting town
  selectAndNameTowns(mapData, townsList, rng, normalizedNames);

  // Generate paths between towns
  if (townsList.length > 1) {
    console.log("[MAP_GENERATION] Generating paths between towns...");
    const paths = generateTownPaths(mapData, townsList);
    markPathTiles(mapData, paths);
  }

  // Harmonize mountain names
  harmonizeMountainNames(mapData, rng, normalizedNames.mountains);

  // Debug: Log all towns on the map
  logTownSummary(mapData, townsList);
}

/** Select a starting town, assign sizes and names. */
function selectAndNameTowns(
  mapData: WorldMap,
  townsList: MapPosition[],
  rng: RngFunction,
  normalizedNames: { towns: string[]; mountains: string[] },
): void {
  if (townsList.length === 0) {
    console.error(
      "[MAP_GENERATION] No towns were placed! This should not happen.",
    );
    return;
  }

  const startingTownIndex = Math.floor(rng() * townsList.length);
  const startingTown = townsList[startingTownIndex];
  if (!startingTown) return;

  const stTile = getTileAt(mapData, startingTown.x, startingTown.y);
  if (stTile) {
    stTile.isStartingTown = true;
  }

  // Assign sizes and names to all towns
  assignTownSizesAndNames(mapData, townsList, rng, normalizedNames.towns);

  const startingTile = getTileAt(mapData, startingTown.x, startingTown.y);
  console.log(
    `[MAP_GENERATION] Selected starting town: ${startingTile?.townName ?? "Unknown"} (${startingTile?.townSize ?? "unknown"}) at (${String(startingTown.x)}, ${String(startingTown.y)})`,
  );
}

/** Log a summary of all towns on the map. */
function logTownSummary(
  mapData: WorldMap,
  townsList: readonly MapPosition[],
): void {
  console.log("[MAP_GENERATION] Map generation complete. Towns on map:");
  for (const town of townsList) {
    const tile = getTileAt(mapData, town.x, town.y);
    console.log(
      `  ${tile?.townName ?? "Unknown"} (${tile?.townSize ?? "unknown"}) at (${String(town.x)}, ${String(town.y)})${tile?.isStartingTown ? " STARTING TOWN" : ""}`,
    );
  }
}

// ── Main generator ──────────────────────────────────────────────────────────

/**
 * Generate a random world map with natural-looking feature placement.
 * @param width - Map width (default 10)
 * @param height - Map height (default 10)
 * @param seed - Optional seed for reproducible maps
 * @param customNames - Optional names: { towns: [...], mountains: [...] } or legacy array of town names
 * @returns 2D array of map tiles
 */
export const generateMapData = (
  width = 10,
  height = 10,
  seed: number | null = null,
  customNames: CustomNames | readonly string[] = {},
): WorldMap => {
  // Normalize customNames: support legacy flat array or new structured object
  const normalizedNames = normalizeCustomNames(customNames);

  // Use seed for reproducible maps, or random
  const rng = seed === null ? Math.random : seededRandom(seed);

  const mapData = initializeMapGrid(width, height);

  // Place all natural features (coast, lakes, forests, mountains, rivers)
  placeNaturalFeatures(mapData, width, height, rng);

  // Place towns, assign names/sizes, generate paths, harmonize mountains
  placeTownsAndPaths(mapData, width, height, rng, normalizedNames);

  return mapData;
};

// ── Utility exports ─────────────────────────────────────────────────────────

/**
 * Helper function to get tile data.
 */
export const getTile = (
  mapData: WorldMap,
  x: number,
  y: number,
): WorldTile | null => {
  if (y >= 0 && y < mapData.length) {
    const row = mapData[y];
    if (row && x >= 0 && x < row.length) {
      return row[x] ?? null;
    }
  }

  console.warn(
    `Attempted to get invalid tile coordinates: ${String(x)}, ${String(y)}`,
  );
  return null;
};

/** Search the map for the first tile matching a predicate. */
function findTilePosition(
  mapData: WorldMap,
  predicate: (tile: WorldTile) => boolean,
): MapPosition | null {
  for (const [y, row] of mapData.entries()) {
    for (const [x, tile] of row.entries()) {
      if (predicate(tile)) {
        return { x, y };
      }
    }
  }
  return null;
}

/**
 * Find the starting town position (for player starting location).
 */
export const findStartingTown = (mapData: WorldMap): MapPosition => {

  console.log("[FIND_STARTING_TOWN] Searching for starting town...");

  // Look for the town marked as starting town
  const marked = findTilePosition(
    mapData,
    (tile) => tile.poi === "town" && tile.isStartingTown === true,
  );
  if (marked) {
    const tile = getTileAt(mapData, marked.x, marked.y);
    console.log(
      `[FIND_STARTING_TOWN] Found starting town: ${tile?.townName ?? "Unknown"} (${tile?.townSize ?? "unknown"}) at (${String(marked.x)}, ${String(marked.y)})`,
    );
    return marked;
  }

  // Fallback: look for the specific starting town description (backward compatibility)
  console.log(
    '[FIND_STARTING_TOWN] No marked starting town found, looking for "A small village"...',
  );
  const byDescription = findTilePosition(
    mapData,
    (tile) =>
      tile.poi === "town" && tile.descriptionSeed === "A small village",
  );
  if (byDescription) {
    console.log(
      "[FIND_STARTING_TOWN] Found starting town by description at:",
      byDescription,
    );
    return byDescription;
  }

  // Final fallback: look for any town
  console.log(
    "[FIND_STARTING_TOWN] No starting town found, looking for any town...",
  );
  const anyTown = findTilePosition(
    mapData,
    (tile) => tile.poi === "town",
  );
  if (anyTown) {
    const tile = getTileAt(mapData, anyTown.x, anyTown.y);
    console.log(
      "[FIND_STARTING_TOWN] Found any town at:",
      anyTown,
      "with description:",
      tile?.descriptionSeed,
    );
    return anyTown;
  }

  // This should never happen with the new system

  console.error(
    "[FIND_STARTING_TOWN] No towns found on map! This indicates a serious error in map generation.",
  );
  throw new Error("No towns found on map - map generation failed");
};

/**
 * Test function to verify map generation and town finding.
 */
export const testMapGeneration = (): {
  map: WorldMap;
  startingPosition: MapPosition;
} => {

  console.log("=== TESTING MAP GENERATION ===");
  const testMap = generateMapData(10, 10, 12_345); // Use fixed seed for reproducible results
  const foundTown = findStartingTown(testMap);

  console.log("Test result - Found starting town at:", foundTown);

  // Verify the town actually exists at that position
  const tileAtPosition = getTile(testMap, foundTown.x, foundTown.y);

  console.log("Tile at found position:", tileAtPosition);

  console.log("=== TEST COMPLETE ===");

  return { map: testMap, startingPosition: foundTown };
};
