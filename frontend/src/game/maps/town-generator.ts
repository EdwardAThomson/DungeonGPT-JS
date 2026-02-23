/**
 * Town interior map generator — generates detailed maps for towns based on their size.
 * Ported from src/utils/townMapGenerator.js — zero behavioral changes.
 *
 * NOTE: This file is intentionally large because the original townMapGenerator.js
 * contained all town generation logic in one file. Splitting would break
 * the preservation directive.
 */
import {
  generateBankName,
  generateGuildName,
  generateManorName,
  generateShopName,
  generateTavernName,
  generateTempleName,
} from "./name-generator.js";

import type { RngFunction } from "./name-generator.js";

// ── Types ────────────────────────────────────────────────────────────────────

/** A single tile on the town map. Uses mutable properties to match original code. */
export interface TownTile {
  x: number;
  y: number;
  type: string;
  poi: string | null;
  walkable: boolean;
  isExplored: boolean;
  isEntry?: boolean;
  buildingType?: string;
  buildingName?: string;
}

/** Position on the town grid. */
interface TownPosition {
  x: number;
  y: number;
}

/** River info from placement. */
interface RiverInfo {
  isHorizontal: boolean;
  center: number;
  riverWidth: number;
}

/** Town map data result. */
export interface TownMapData {
  readonly mapData: TownTile[][];
  readonly width: number;
  readonly height: number;
  readonly townName: string;
  readonly townSize: string;
  readonly entryPoint: TownPosition;
  readonly centerPoint: TownPosition;
}

/** Town size configuration. */
interface TownSizeConfig {
  width: number;
  height: number;
  buildings: number;
}

/** Building configuration for town size. */
interface BuildingConfig {
  important: readonly string[];
  houses: number;
  hasKeep?: boolean;
}

// ── Seeded RNG ──────────────────────────────────────────────────────────────

/**
 * Seeded random number generator.
 */
function seededRandom(seed: number): RngFunction {
  let state = seed;
  return function () {
    state = (state * 9301 + 49_297) % 233_280;
    return state / 233_280;
  };
}

// ── Tile access helpers ─────────────────────────────────────────────────────

/** Safely get a tile from the town map grid. */
function getTownTileAt(
  mapData: TownTile[][],
  x: number,
  y: number,
): TownTile | undefined {
  const row = mapData[y];
  if (!row) return undefined;
  return row[x];
}

/** Set a tile to water (non-walkable). */
function setTileWater(tile: TownTile): void {
  tile.type = "water";
  tile.walkable = false;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Calculate entry position based on direction.
 */
function calculateEntryPosition(
  width: number,
  height: number,
  direction: string,
): TownPosition {
  const center = Math.floor(width / 2);

  switch (direction) {
    case "north": {
      return { x: center, y: 0 };
    }
    case "south": {
      return { x: center, y: height - 1 };
    }
    case "east": {
      return { x: width - 1, y: Math.floor(height / 2) };
    }
    case "west": {
      return { x: 0, y: Math.floor(height / 2) };
    }
    default: {
      return { x: center, y: height - 1 };
    } // Default to south
  }
}

/** Place river tiles along a horizontal band. */
function placeHorizontalRiver(
  mapData: TownTile[][],
  center: number,
  riverWidth: number,
  width: number,
): void {
  for (let y = center; y < center + riverWidth; y++) {
    for (let x = 0; x < width; x++) {
      const tile = getTownTileAt(mapData, x, y);
      if (tile) setTileWater(tile);
    }
  }
}

/** Place river tiles along a vertical band. */
function placeVerticalRiver(
  mapData: TownTile[][],
  center: number,
  riverWidth: number,
  height: number,
): void {
  for (let x = center; x < center + riverWidth; x++) {
    for (let y = 0; y < height; y++) {
      const tile = getTownTileAt(mapData, x, y);
      if (tile) setTileWater(tile);
    }
  }
}

/**
 * Place a river crossing the town.
 */
function placeRiverInTown(
  mapData: TownTile[][],
  riverDirection: string,
  width: number,
  height: number,
  rng: RngFunction,
): RiverInfo {
  const isHorizontal = riverDirection === "EAST_WEST";
  const riverWidth = 2;
  const offset = Math.floor(rng() * 3) - 1;
  const center =
    Math.floor((isHorizontal ? height : width) / 2) + offset;

  if (isHorizontal) {
    placeHorizontalRiver(mapData, center, riverWidth, width);
  } else {
    placeVerticalRiver(mapData, center, riverWidth, height);
  }

  return { isHorizontal, center, riverWidth };
}

// ── Road placement ──────────────────────────────────────────────────────────

/** Check if position is on river and set bridge. Returns true if bridge was placed. */
function handleRiverCheck(
  mapData: TownTile[][],
  x: number,
  y: number,
  ri: RiverInfo | null,
): boolean {
  if (!ri) return false;
  const tile = getTownTileAt(mapData, x, y);
  if (!tile) return false;

  if (!ri.isHorizontal && x >= ri.center && x < ri.center + ri.riverWidth) {
    tile.type = "bridge";
    tile.walkable = true;
    return true;
  }
  if (ri.isHorizontal && y >= ri.center && y < ri.center + ri.riverWidth) {
    tile.type = "bridge";
    tile.walkable = true;
    return true;
  }
  return false;
}

/** Place a single road tile at (x, y) if not on a river. */
function placeRoadTile(
  mapData: TownTile[][],
  x: number,
  y: number,
  roadType: string,
  riverInfo: RiverInfo | null,
): void {
  if (handleRiverCheck(mapData, x, y, riverInfo)) return;
  const tile = getTownTileAt(mapData, x, y);
  if (tile) tile.type = roadType;
}

/** Place a vertical road from entry to center. */
function placeVerticalRoad(
  mapData: TownTile[][],
  entryPos: TownPosition,
  centerX: number,
  centerY: number,
  width: number,
  isWideRoad: boolean,
  roadType: string,
  riverInfo: RiverInfo | null,
): void {
  const startY = Math.min(entryPos.y, centerY);
  const endY = Math.max(entryPos.y, centerY);
  for (let y = startY; y <= endY; y++) {
    placeRoadTile(mapData, centerX, y, roadType, riverInfo);
    if (isWideRoad && centerX < width - 1) {
      placeRoadTile(mapData, centerX + 1, y, roadType, riverInfo);
    }
  }
}

/** Place a horizontal road from entry to center. */
function placeHorizontalRoad(
  mapData: TownTile[][],
  entryPos: TownPosition,
  centerX: number,
  height: number,
  isWideRoad: boolean,
  roadType: string,
  riverInfo: RiverInfo | null,
): void {
  const startX = Math.min(entryPos.x, centerX);
  const endX = Math.max(entryPos.x, centerX);
  const roadY = Math.floor(height / 2);
  for (let x = startX; x <= endX; x++) {
    placeRoadTile(mapData, x, roadY, roadType, riverInfo);
    if (isWideRoad && roadY < height - 1) {
      placeRoadTile(mapData, x, roadY + 1, roadType, riverInfo);
    }
  }
}

/**
 * Place main road from entry to center.
 */
function placeMainRoad(
  mapData: TownTile[][],
  entryPos: TownPosition,
  direction: string,
  width: number,
  height: number,
  townSize: string,
  riverInfo: RiverInfo | null = null,
): void {
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  const isWideRoad = townSize === "town" || townSize === "city";
  const roadType = townSize === "city" ? "stone_path" : "dirt_path";

  if (direction === "north" || direction === "south") {
    placeVerticalRoad(mapData, entryPos, centerX, centerY, width, isWideRoad, roadType, riverInfo);
  } else {
    placeHorizontalRoad(mapData, entryPos, centerX, height, isWideRoad, roadType, riverInfo);
  }
}

// ── Walls and center ────────────────────────────────────────────────────────

/** Set a grass tile to wall type. */
function setWallIfGrass(tile: TownTile | undefined): void {
  if (tile?.type === "grass") {
    tile.type = "wall";
  }
}

/**
 * Place city walls around perimeter (cities only).
 */
function placeCityWalls(mapData: TownTile[][]): void {
  const firstRow = mapData[0];
  if (!firstRow) return;
  const width = firstRow.length;
  const height = mapData.length;

  for (let x = 0; x < width; x++) {
    setWallIfGrass(getTownTileAt(mapData, x, 0));
    setWallIfGrass(getTownTileAt(mapData, x, height - 1));
  }

  for (let y = 0; y < height; y++) {
    setWallIfGrass(getTownTileAt(mapData, 0, y));
    setWallIfGrass(getTownTileAt(mapData, width - 1, y));
  }

  console.log("[TOWN_MAP] Placed city walls around perimeter");
}

/**
 * Set a single tile as part of the town square, optionally placing a POI at the center.
 */
function setTownSquareTile(
  mapData: TownTile[][],
  x: number,
  y: number,
  isCenter: boolean,
  townSize: string,
  width: number,
  height: number,
): void {
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  const tile = getTownTileAt(mapData, x, y);
  if (!tile) return;
  tile.type = "town_square";
  if (isCenter) {
    tile.poi = townSize === "city" ? "fountain" : "well";
  }
}

/**
 * Place town center/square.
 */
function placeTownCenter(
  mapData: TownTile[][],
  centerPos: TownPosition,
  townSize: string,
): void {
  const sizeMap: Record<string, number> = {
    hamlet: 1,
    village: 2,
    town: 3,
    city: 3,
  };

  const squareSize = sizeMap[townSize] ?? 2;
  const halfSize = Math.floor(squareSize / 2);
  const firstRow = mapData[0];
  if (!firstRow) return;

  const width = firstRow.length;
  const height = mapData.length;

  for (let dy = -halfSize; dy <= halfSize; dy++) {
    for (let dx = -halfSize; dx <= halfSize; dx++) {
      setTownSquareTile(
        mapData,
        centerPos.x + dx,
        centerPos.y + dy,
        dx === 0 && dy === 0,
        townSize,
        width,
        height,
      );
    }
  }
}

/**
 * Assign a generated name to a building tile based on its type.
 */
function assignBuildingName(
  tile: TownTile,
  buildingType: string,
  rng: RngFunction,
): void {
  switch (buildingType) {
  case "tavern":
  case "inn": {
    tile.buildingName = generateTavernName(rng);

  break;
  }
  case "guild": {
    tile.buildingName = generateGuildName(rng);

  break;
  }
  case "bank": {
    tile.buildingName = generateBankName(rng);

  break;
  }
  case "shop":
  case "market": {
    tile.buildingName = generateShopName(rng);

  break;
  }
  case "blacksmith": {
    const blacksmithNames = [
      "Iron Anvil",
      "Heavy Hammer",
      "Strong Forge",
      "Dragon Sunder",
      "Steel Strike",
      "The Hearth Forge",
    ];
    tile.buildingName =
      blacksmithNames[
        Math.floor(rng() * blacksmithNames.length)
      ] ?? "Iron Anvil";

  break;
  }
  case "manor":
  case "keep": {
    tile.buildingName = generateManorName(rng);

  break;
  }
  case "temple": {
    tile.buildingName = generateTempleName(rng);

  break;
  }
  // No default
  }
}

// ── Building placement helpers ──────────────────────────────────────────────

/** State shared across building placement sub-functions. */
interface BuildingPlacementState {
  mapData: TownTile[][];
  occupied: Set<string>;
  firstRow: TownTile[];
  rng: RngFunction;
  centerX: number;
  centerY: number;
}

/** Check if a tile position is occupied or unavailable. */
function isOccupied(state: BuildingPlacementState, x: number, y: number): boolean {
  if (x < 0 || x >= state.firstRow.length || y < 0 || y >= state.mapData.length)
    return true;
  if (state.occupied.has(`${String(x)},${String(y)}`)) return true;
  const tile = getTownTileAt(state.mapData, x, y);
  if (!tile) return true;
  return tile.type !== "grass";
}

/** Mark a tile as occupied. */
function markOccupied(state: BuildingPlacementState, x: number, y: number): void {
  state.occupied.add(`${String(x)},${String(y)}`);
}

/** Place a building tile at the given position. */
function placeBuildingTile(
  state: BuildingPlacementState,
  x: number,
  y: number,
  buildingType: string,
): boolean {
  const tile = getTownTileAt(state.mapData, x, y);
  if (!tile) return false;
  tile.type = "building";
  tile.buildingType = buildingType;
  tile.walkable = false;
  tile.poi = null;
  assignBuildingName(tile, buildingType, state.rng);
  markOccupied(state, x, y);
  return true;
}

/** Place the keep and its walls at the top of a city. */
function placeKeep(
  state: BuildingPlacementState,
): void {
  console.log("[TOWN_MAP] Placing keep at top of city...");
  const keepX = state.centerX;
  const keepY = 3;

  if (isOccupied(state, keepX, keepY)) return;

  const keepTile = getTownTileAt(state.mapData, keepX, keepY);
  if (!keepTile) return;

  keepTile.type = "building";
  keepTile.buildingType = "keep";
  keepTile.buildingName = generateManorName(state.rng);
  keepTile.walkable = false;
  keepTile.poi = null;
  markOccupied(state, keepX, keepY);

  placeKeepWalls(state, keepX, keepY);
  placeKeepPath(state, keepX, keepY);

  console.log(
    `[TOWN_MAP] Placed keep at (${String(keepX)}, ${String(keepY)}) with keep wall and path to square`,
  );
}

/** Place thin walls around the keep (3x3 area). */
function placeKeepWalls(
  state: BuildingPlacementState,
  keepX: number,
  keepY: number,
): void {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const wallX = keepX + dx;
      const wallY = keepY + dy;
      if (
        wallX < 1 || wallX >= state.firstRow.length - 1 ||
        wallY < 1 || wallY >= state.mapData.length - 1
      ) continue;
      const wallTile = getTownTileAt(state.mapData, wallX, wallY);
      if (wallTile?.type === "grass") {
        wallTile.type = "keep_wall";
        markOccupied(state, wallX, wallY);
      }
    }
  }
}

/** Create stone path from keep wall to town square. */
function placeKeepPath(
  state: BuildingPlacementState,
  keepX: number,
  keepY: number,
): void {
  let pathY = keepY + 2;
  while (pathY < state.centerY) {
    const pathTile = getTownTileAt(state.mapData, keepX, pathY);
    if (pathTile?.type === "grass") {
      pathTile.type = "stone_path";
    }
    pathY++;
  }
}

/** Get positions around the town square (clockwise from top). */
function getSquarePositions(
  centerX: number,
  centerY: number,
  halfSize: number,
): TownPosition[] {
  const positions: TownPosition[] = [];

  // Top edge (left to right)
  for (let dx = -halfSize - 1; dx <= halfSize + 1; dx++) {
    positions.push({ x: centerX + dx, y: centerY - halfSize - 1 });
  }
  // Right edge (top to bottom, skip corner)
  for (let dy = -halfSize; dy <= halfSize + 1; dy++) {
    positions.push({ x: centerX + halfSize + 1, y: centerY + dy });
  }
  // Bottom edge (right to left, skip corner)
  for (let dx = halfSize; dx >= -halfSize - 1; dx--) {
    positions.push({ x: centerX + dx, y: centerY + halfSize + 1 });
  }
  // Left edge (bottom to top, skip corners)
  for (let dy = halfSize; dy >= -halfSize; dy--) {
    positions.push({ x: centerX - halfSize - 1, y: centerY + dy });
  }

  return positions;
}

/** Try to place a building around the town square. Returns true if placed. */
function tryPlaceAroundSquare(
  state: BuildingPlacementState,
  buildingType: string,
  squarePositions: TownPosition[],
  posIndex: number,
): { placed: boolean; nextIndex: number } {
  for (let i = 0; i < squarePositions.length; i++) {
    const pos = squarePositions[(posIndex + i) % squarePositions.length];
    if (!pos) continue;
    if (!isOccupied(state, pos.x, pos.y)) {
      placeBuildingTile(state, pos.x, pos.y, buildingType);
      return { placed: true, nextIndex: (posIndex + i + 2) % squarePositions.length };
    }
  }
  return { placed: false, nextIndex: posIndex };
}

/** Try to place a building in expanding rings outward from center. Returns true if placed. */
function tryPlaceInRings(
  state: BuildingPlacementState,
  buildingType: string,
): boolean {
  for (let radius = 2; radius <= 4; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const x = state.centerX + dx;
        const y = state.centerY + dy;
        if (!isOccupied(state, x, y)) {
          placeBuildingTile(state, x, y, buildingType);
          return true;
        }
      }
    }
  }
  return false;
}

/** Place important buildings around the town square. */
function placeImportantBuildings(
  state: BuildingPlacementState,
  important: readonly string[],
  squarePositions: TownPosition[],
): number {
  let importantPlaced = 0;
  let posIndex = Math.floor(state.rng() * squarePositions.length);

  for (const buildingType of important) {
    const result = tryPlaceAroundSquare(state, buildingType, squarePositions, posIndex);
    if (result.placed) {
      importantPlaced++;
      posIndex = result.nextIndex;
    } else if (tryPlaceInRings(state, buildingType)) {
      importantPlaced++;
    }
  }

  return importantPlaced;
}

/** Shuffle an array in-place using Fisher-Yates. */
function shuffleTownPositions(array: TownPosition[], rng: RngFunction): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = array[i];
    const swap = array[j];
    if (temp && swap) {
      array[i] = swap;
      array[j] = temp;
    }
  }
}

/** Place houses away from center, outside exclusion zone. */
function placeHouses(
  state: BuildingPlacementState,
  houses: number,
  townSize: string,
): number {
  const excludeRadius: Record<string, number> = {
    hamlet: 1,
    village: 2,
    town: 3,
    city: 3,
  };
  const exclusion = excludeRadius[townSize] ?? 2;
  const housePositions: TownPosition[] = [];

  for (let y = 1; y < state.mapData.length - 1; y++) {
    for (let x = 1; x < state.firstRow.length - 1; x++) {
      const distFromCenter = Math.max(
        Math.abs(x - state.centerX),
        Math.abs(y - state.centerY),
      );
      if (distFromCenter > exclusion) {
        housePositions.push({ x, y });
      }
    }
  }

  shuffleTownPositions(housePositions, state.rng);

  let housesPlaced = 0;
  for (const pos of housePositions) {
    if (housesPlaced >= houses) break;
    if (!isOccupied(state, pos.x, pos.y)) {
      const tile = getTownTileAt(state.mapData, pos.x, pos.y);
      if (!tile) continue;
      tile.type = "building";
      tile.buildingType = "house";
      tile.walkable = false;
      tile.poi = null;
      markOccupied(state, pos.x, pos.y);
      housesPlaced++;
    }
  }

  return housesPlaced;
}

/**
 * Place buildings around the town.
 */
function placeBuildings(
  mapData: TownTile[][],
  _count: number,
  townSize: string,
  rng: RngFunction,
  centerPos: TownPosition,
): void {
  const firstRow = mapData[0];
  if (!firstRow) return;

  const buildingConfig: Record<string, BuildingConfig> = {
    hamlet: { important: ["barn"], houses: 5 },
    village: { important: ["inn", "shop", "blacksmith"], houses: 8 },
    town: {
      important: ["inn", "shop", "temple", "blacksmith", "tavern", "tavern"],
      houses: 20,
    },
    city: {
      important: [
        "temple", "market", "manor", "blacksmith",
        "tavern", "tavern", "tavern",
        "guild", "guild", "guild",
        "bank", "bank", "bank",
      ],
      houses: 40,
      hasKeep: true,
    },
  };

  const defaultConfig: BuildingConfig = {
    important: ["inn", "shop", "blacksmith"],
    houses: 8,
  };
  const config = buildingConfig[townSize] ?? defaultConfig;

  const state: BuildingPlacementState = {
    mapData,
    occupied: new Set<string>(),
    firstRow,
    rng,
    centerX: centerPos.x,
    centerY: centerPos.y,
  };

  // STEP 0: Place keep at top of city (cities only)
  if (config.hasKeep) {
    placeKeep(state);
  }

  // STEP 1: Place important buildings around town square clockwise
  console.log(
    `[TOWN_MAP] Placing ${String(config.important.length)} important buildings around square...`,
  );
  const squareSize =
    townSize === "hamlet" ? 1 : townSize === "village" ? 2 : 3;
  const halfSize = Math.floor(squareSize / 2);
  const squarePositions = getSquarePositions(state.centerX, state.centerY, halfSize);
  const importantPlaced = placeImportantBuildings(state, config.important, squarePositions);

  console.log(
    `[TOWN_MAP] Placed ${String(importantPlaced)} important buildings`,
  );

  // STEP 2: Place houses
  console.log(`[TOWN_MAP] Placing ${String(config.houses)} houses...`);
  const housesPlaced = placeHouses(state, config.houses, townSize);

  console.log(`[TOWN_MAP] Placed ${String(housesPlaced)} houses`);
  console.log(
    `[TOWN_MAP] Total buildings: ${String(importantPlaced + housesPlaced)}`,
  );
}

/**
 * Place decorative elements.
 */
function placeDecorations(
  mapData: TownTile[][],
  townSize: string,
  rng: RngFunction,
): void {
  const decorationCount: Record<string, number> = {
    hamlet: 36,
    village: 45,
    town: 36,
    city: 24,
  };

  const count = decorationCount[townSize] ?? 30;
  const decorations = [
    "tree", "tree", "tree", "tree",
    "bush", "flowers", "tree", "tree",
  ];
  const firstRow = mapData[0];
  if (!firstRow) return;

  for (let i = 0; i < count; i++) {
    const x = Math.floor(rng() * firstRow.length);
    const y = Math.floor(rng() * mapData.length);
    const tile = getTownTileAt(mapData, x, y);
    if (!tile) continue;
    if (tile.type === "grass" && tile.poi === null) {
      tile.poi = decorations[
        Math.floor(rng() * decorations.length)
      ] ?? "tree";
    }
  }
}

// ── Farm fields ─────────────────────────────────────────────────────────────

/** Find a suitable starting position for a farm cluster. */
function findFarmClusterStart(
  mapData: TownTile[][],
  width: number,
  height: number,
  rng: RngFunction,
): { x: number; y: number; found: boolean } {
  for (let attempt = 0; attempt < 10; attempt++) {
    const startX = Math.floor(rng() * width);
    const startY = Math.floor(rng() * height);
    const distFromCenter = Math.hypot(
      startX - width / 2,
      startY - height / 2,
    );
    const tile = getTownTileAt(mapData, startX, startY);
    if (distFromCenter > width / 4 && tile?.type === "grass") {
      return { x: startX, y: startY, found: true };
    }
  }
  return { x: 0, y: 0, found: false };
}

/** Place a rectangular cluster of farm fields. */
function placeFarmCluster(
  mapData: TownTile[][],
  startX: number,
  startY: number,
  cWidth: number,
  cHeight: number,
  width: number,
  height: number,
): void {
  for (let dy = 0; dy < cHeight; dy++) {
    for (let dx = 0; dx < cWidth; dx++) {
      const x = startX + dx;
      const y = startY + dy;
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      const tile = getTownTileAt(mapData, x, y);
      if (tile?.type === "grass" && tile.poi === null) {
        tile.type = "farm_field";
      }
    }
  }
}

/**
 * Place farm fields in clusters (Hamlets, Villages, and Towns).
 */
function placeFarmFields(
  mapData: TownTile[][],
  townSize: string,
  rng: RngFunction,
): void {
  const firstRow = mapData[0];
  if (!firstRow) return;
  const width = firstRow.length;
  const height = mapData.length;

  const clusterCount =
    townSize === "hamlet" ? 2 : townSize === "village" ? 4 : 6;

  for (let i = 0; i < clusterCount; i++) {
    const start = findFarmClusterStart(mapData, width, height, rng);
    if (!start.found) continue;
    const cWidth = 2 + Math.floor(rng() * 2);
    const cHeight = 2 + Math.floor(rng() * 2);
    placeFarmCluster(mapData, start.x, start.y, cWidth, cHeight, width, height);
  }
}

// ── Building path generation ────────────────────────────────────────────────

/** Find all house positions and all path tile positions on the map. */
function findHousesAndPaths(
  mapData: TownTile[][],
  width: number,
  height: number,
): { houses: TownPosition[]; pathTiles: TownPosition[] } {
  const houses: TownPosition[] = [];
  const pathTiles: TownPosition[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = getTownTileAt(mapData, x, y);
      if (!tile) continue;
      if (tile.type === "building" && tile.buildingType === "house") {
        houses.push({ x, y });
      }
      if (tile.type === "stone_path" || tile.type === "dirt_path") {
        pathTiles.push({ x, y });
      }
    }
  }

  return { houses, pathTiles };
}

/** Create a path between two points, placing path tiles on grass. */
function createTownPath(
  mapData: TownTile[][],
  from: TownPosition,
  to: TownPosition,
  centerPos: TownPosition,
  width: number,
  height: number,
  pathTiles: TownPosition[],
): void {
  let x = from.x;
  let y = from.y;
  const centerRadius = Math.floor(Math.max(width, height) / 4);

  while (x !== to.x || y !== to.y) {
    if (x < to.x) x++;
    else if (x > to.x) x--;
    else if (y < to.y) y++;
    else if (y > to.y) y--;

    const tile = getTownTileAt(mapData, x, y);
    if (tile?.type === "grass" && tile.poi === null) {
      const distFromCenter =
        Math.abs(x - centerPos.x) + Math.abs(y - centerPos.y);
      tile.type =
        distFromCenter < centerRadius ? "stone_path" : "dirt_path";
      pathTiles.push({ x, y });
    }
  }
}

/** Find the nearest position from a list to a given house. */
function findNearestPosition(
  house: TownPosition,
  targets: readonly TownPosition[],
  minDistFilter = 0,
): { target: TownPosition | null; dist: number } {
  let nearest: TownPosition | null = null;
  let minDist = Infinity;
  for (const t of targets) {
    const dist = Math.abs(house.x - t.x) + Math.abs(house.y - t.y);
    if (dist < minDist && dist > minDistFilter) {
      minDist = dist;
      nearest = t;
    }
  }
  return { target: nearest, dist: minDist };
}

/** Connect direct houses to the nearest road tile. */
function connectDirectHouses(
  mapData: TownTile[][],
  shuffledHouses: TownPosition[],
  directConnections: number,
  pathTiles: TownPosition[],
  connectedHouses: Set<string>,
  centerPos: TownPosition,
  width: number,
  height: number,
): void {
  for (let i = 0; i < directConnections && i < shuffledHouses.length; i++) {
    const house = shuffledHouses[i];
    if (!house) continue;
    const { target: nearestRoad, dist: minDist } = findNearestPosition(house, pathTiles);
    if (nearestRoad && minDist > 1) {
      createTownPath(mapData, house, nearestRoad, centerPos, width, height, pathTiles);
      connectedHouses.add(`${String(house.x)},${String(house.y)}`);
    }
  }
}

/** Iteratively connect remaining houses to existing paths or connected houses. */
function connectRemainingHouses(
  mapData: TownTile[][],
  shuffledHouses: TownPosition[],
  directConnections: number,
  pathTiles: TownPosition[],
  connectedHouses: Set<string>,
  centerPos: TownPosition,
  width: number,
  height: number,
): void {
  let unconnectedHouses = shuffledHouses.slice(directConnections);
  const maxIterations = 10;

  for (let iteration = 0; iteration < maxIterations && unconnectedHouses.length > 0; iteration++) {
    const stillUnconnected: TownPosition[] = [];

    for (const house of unconnectedHouses) {
      const nearestTarget = findBestConnectionTarget(
        house,
        pathTiles,
        shuffledHouses,
        connectedHouses,
      );

      if (nearestTarget.target && nearestTarget.dist > 1 && nearestTarget.dist < 10) {
        createTownPath(mapData, house, nearestTarget.target, centerPos, width, height, pathTiles);
        connectedHouses.add(`${String(house.x)},${String(house.y)}`);
      } else {
        stillUnconnected.push(house);
      }
    }

    if (stillUnconnected.length === unconnectedHouses.length) break;
    unconnectedHouses = stillUnconnected;
  }
}

/** Find best connection target: nearest path tile or connected house. */
function findBestConnectionTarget(
  house: TownPosition,
  pathTiles: readonly TownPosition[],
  allHouses: readonly TownPosition[],
  connectedHouses: ReadonlySet<string>,
): { target: TownPosition | null; dist: number } {
  let nearest: TownPosition | null = null;
  let minDist = Infinity;

  // Check path tiles
  for (const target of pathTiles) {
    const dist = Math.abs(house.x - target.x) + Math.abs(house.y - target.y);
    if (dist < minDist && dist > 0) {
      minDist = dist;
      nearest = target;
    }
  }

  // Check connected houses
  for (const otherHouse of allHouses) {
    if (!connectedHouses.has(`${String(otherHouse.x)},${String(otherHouse.y)}`)) continue;
    const dist = Math.abs(house.x - otherHouse.x) + Math.abs(house.y - otherHouse.y);
    if (dist < minDist && dist > 0) {
      minDist = dist;
      nearest = otherHouse;
    }
  }

  return { target: nearest, dist: minDist };
}

/**
 * Generate paths connecting buildings organically.
 */
function generateBuildingPaths(
  mapData: TownTile[][],
  centerPos: TownPosition,
  rng: RngFunction,
): void {
  const firstRow = mapData[0];
  if (!firstRow) return;
  const width = firstRow.length;
  const height = mapData.length;

  const { houses, pathTiles } = findHousesAndPaths(mapData, width, height);
  const connectedHouses = new Set<string>();
  const directConnections = Math.ceil(houses.length * 0.3);
  const shuffledHouses = [...houses];
  shuffleTownPositions(shuffledHouses, rng);

  connectDirectHouses(
    mapData, shuffledHouses, directConnections, pathTiles,
    connectedHouses, centerPos, width, height,
  );

  connectRemainingHouses(
    mapData, shuffledHouses, directConnections, pathTiles,
    connectedHouses, centerPos, width, height,
  );

  console.log(
    `[TOWN_MAP] Generated organic paths: ${String(directConnections)} direct connections, ${String(houses.length - directConnections)} house-to-house`,
  );
}

// ── Main generator ──────────────────────────────────────────────────────────

/**
 * Generate a town interior map based on town size.
 * @param townSize - Size of the town: 'hamlet', 'village', 'town', 'city'
 * @param townName - Name of the town
 * @param entryPoint - Entry direction: 'north', 'south', 'east', 'west'
 * @param seed - Optional seed for reproducible maps
 * @param hasRiver - Whether the town has a river passing through it
 * @param riverDirection - Direction of the river on the world map
 * @returns Town map data with tiles and metadata
 */
export const generateTownMap = (
  townSize: string,
  townName: string,
  entryPoint = "south",
  seed: number | null = null,
  hasRiver = false,
  riverDirection = "NORTH_SOUTH",
): TownMapData => {

  console.log(`[TOWN_MAP] Generating ${townSize} map for ${townName}`);

  // Determine map size based on town size
  const sizeConfig: Record<string, TownSizeConfig> = {
    hamlet: { width: 8, height: 8, buildings: 3 },
    village: { width: 12, height: 12, buildings: 6 },
    town: { width: 16, height: 16, buildings: 10 },
    city: { width: 20, height: 20, buildings: 15 },
  };

  const defaultTownConfig: TownSizeConfig = { width: 12, height: 12, buildings: 6 };
  const config = sizeConfig[townSize] ?? defaultTownConfig;
  const { width, height, buildings: buildingCount } = config;

  // Use seed for reproducible maps, or random
  const rng = seed === null ? Math.random : seededRandom(seed);

  // Initialize map with grass tiles
  const mapData: TownTile[][] = [];
  for (let y = 0; y < height; y++) {
    const row: TownTile[] = [];
    for (let x = 0; x < width; x++) {
      row.push({
        x,
        y,
        type: "grass",
        poi: null,
        walkable: true,
        isExplored: false,
      });
    }
    mapData.push(row);
  }

  // Calculate entry point position
  const entryPos = calculateEntryPosition(width, height, entryPoint);

  // Place river if it exists
  let riverInfo: RiverInfo | null = null;
  if (hasRiver) {
    riverInfo = placeRiverInTown(mapData, riverDirection, width, height, rng);
  }

  // Place main road from entry to center
  placeMainRoad(mapData, entryPos, entryPoint, width, height, townSize, riverInfo);

  // Place town square/center
  const centerPos = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
  console.log("[TOWN_MAP] centerPos:", centerPos);
  placeTownCenter(mapData, centerPos, townSize);

  // Place city walls (cities only)
  if (townSize === "city") {
    placeCityWalls(mapData);
  }

  // Place buildings (including keep for cities)
  console.log("[TOWN_MAP] Calling placeBuildings with:", {
    mapDataSnapshot: `${String(mapData.length)}x${String(mapData[0]?.length ?? 0)}`,
    buildingCount,
    townSize,
    rngType: typeof rng,
    centerPos,
  });
  placeBuildings(mapData, buildingCount, townSize, rng, centerPos);

  // Generate paths connecting all buildings to the road network
  generateBuildingPaths(mapData, centerPos, rng);

  // Place farm fields (Hamlets, Villages, and Towns)
  if (
    townSize === "hamlet" ||
    townSize === "village" ||
    townSize === "town"
  ) {
    placeFarmFields(mapData, townSize, rng);
  }

  // Place decorations (trees, wells, etc.) LAST
  placeDecorations(mapData, townSize, rng);

  // Mark entry point
  const entryTile = getTownTileAt(mapData, entryPos.x, entryPos.y);
  if (entryTile) {
    entryTile.isEntry = true;
  }

  return {
    mapData,
    width,
    height,
    townName,
    townSize,
    entryPoint: entryPos,
    centerPoint: centerPos,
  };
};

/**
 * Get emoji representation for town map tiles.
 * @param tile - Tile object
 * @returns Emoji to display
 */
export const getTownTileEmoji = (tile: TownTile): string => {
  // POI takes precedence
  if (tile.poi) {
    const poiEmojis: Record<string, string> = {
      fountain: "\u26F2", // fountain
      well: "\u{1FAA3}", // bucket
      tree: "\u{1F333}", // tree
      bush: "\u{1F33F}", // herb
      flowers: "\u{1F338}", // blossom
    };
    return poiEmojis[tile.poi] ?? tile.poi;
  }

  // Terrain types
  if (tile.type === "farm_field") {
    return "\u{1F33E}"; // sheaf of rice
  }

  // Building types
  if (tile.type === "building") {
    const buildingEmojis: Record<string, string> = {
      house: "\u{1F3E0}",
      inn: "\u{1F3E8}",
      shop: "\u{1F3EA}",
      temple: "\u26EA",
      tavern: "\u{1F37A}",
      guild: "\u{1F3DB}\uFE0F",
      market: "\u{1F3EC}",
      bank: "\u{1F3E6}",
      barracks: "\u{1F3F0}",
      manor: "\u{1F3F0}",
      barn: "\u{1F3DA}\uFE0F",
      blacksmith: "\u2692\uFE0F",
      keep: "\u{1F3F0}",
    };
    return buildingEmojis[tile.buildingType ?? ""] ?? "\u{1F3E0}";
  }

  // Terrain types - return empty string to show just the colored tile
  return "";
};
