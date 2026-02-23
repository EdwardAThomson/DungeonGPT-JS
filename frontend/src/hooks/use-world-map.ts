/**
 * useWorldMap — world map state, exploration, migration.
 *
 * Ported from src/hooks/useGameMap.js (lines 1-51, 86-108, 156-157, 387-411).
 * Manages world map data, player position, explored tiles, visited tracking.
 */

import { useCallback, useState } from "react";

import type { WorldMap, WorldTile } from "@/game/maps/world-generator";

import {
  findStartingTown,
  generateMapData,
  getTile,
} from "@/game/maps/world-generator";
import { useGameStore } from "@/stores/game-store";


/** Position on the world grid. */
interface MapPosition {
  x: number;
  y: number;
}

/** Loaded conversation data relevant to world map initialization. */
export interface LoadedMapData {
  readonly world_map?: WorldMap | null;
  readonly player_position?: MapPosition | null;
  readonly generatedMap?: WorldMap | null;
  readonly sub_maps?: SubMapsData | null;
  readonly subMaps?: SubMapsData | null;
}

/** Sub-map data that may come from a loaded save. */
interface SubMapsData {
  readonly currentMapLevel?: string;
  readonly visitedBiomes?: readonly string[];
  readonly visitedTowns?: readonly string[];
  [key: string]: unknown;
}

/**
 * Migrate old saves missing x/y on tiles.
 * Ported as-is from useGameMap.js lines 15-25.
 */
function migrateMapTiles(map: WorldMap): void {
  let migrationCount = 0;
  for (const [y, row] of map.entries()) {
    for (const [x, tile] of row.entries()) {
      // Legacy saves may lack x/y on tiles — cast to partial for the check
      const maybeTile = tile as Partial<WorldTile>;
      if (maybeTile.x === undefined || maybeTile.y === undefined) {
        tile.x = x;
        tile.y = y;
        migrationCount++;
      }
    }
  }
  if (migrationCount > 0) {
     
    console.log(
      `[MIGRATION] Patched ${String(migrationCount)} tiles with coordinates.`,
    );
  }
}

/**
 * Initialize map and position from loaded conversation or fresh generation.
 * Ported as-is from useGameMap.js useState initializer (lines 8-48).
 */
function initializeMapAndPosition(
  loadedConversation: LoadedMapData | null,
  generatedMap: WorldMap | null,
  worldSeed: number | string | null | undefined,
): { map: WorldMap; position: MapPosition } {
  if (loadedConversation?.world_map && loadedConversation.player_position) {
    const map = loadedConversation.world_map;
    migrateMapTiles(map);
    return {
      map,
      position: loadedConversation.player_position,
    };
  }

  // Generate new map
  const seedNumber =
    worldSeed != null && worldSeed !== "" ? Number(worldSeed) : null;
  const newMap = generatedMap ?? generateMapData(10, 10, seedNumber);
  const startingPos = findStartingTown(newMap);

  // Mark starting position as explored
  const startRow = newMap[startingPos.y];
  const startTile = startRow?.[startingPos.x];
  if (startTile) {
    startTile.isExplored = true;
  }

  return { map: newMap, position: startingPos };
}

export function useWorldMap(
  loadedConversation: LoadedMapData | null,
  worldSeed: number | string | null | undefined,
  generatedMap: WorldMap | null = null,
) {
  const setWorldMapStore = useGameStore((s) => s.setWorldMap);
  const setPlayerPositionStore = useGameStore((s) => s.setPlayerPosition);

  // Initialize once on first render
  const [{ map: initialMap, position: initialPosition }] = useState(() =>
    initializeMapAndPosition(loadedConversation, generatedMap, worldSeed),
  );

  const [worldMap, setWorldMap] = useState<WorldMap>(initialMap);
  const [playerPosition, setPlayerPosition] =
    useState<MapPosition>(initialPosition);

  // Visited biome/town tracking
  const subMapsData =
    loadedConversation?.sub_maps ?? loadedConversation?.subMaps;

  const [visitedBiomes, setVisitedBiomes] = useState<Set<string>>(
    () => new Set(subMapsData?.visitedBiomes),
  );
  const [visitedTowns, setVisitedTowns] = useState<Set<string>>(
    () => new Set(subMapsData?.visitedTowns),
  );

  // Sync to Zustand store
  const updateWorldMap = useCallback(
    (map: WorldMap) => {
      setWorldMap(map);
      setWorldMapStore(map);
    },
    [setWorldMapStore],
  );

  const updatePlayerPosition = useCallback(
    (pos: MapPosition) => {
      setPlayerPosition(pos);
      setPlayerPositionStore(pos);
    },
    [setPlayerPositionStore],
  );

  const trackBiomeVisit = useCallback((biome: string) => {
    if (!biome) return;
    setVisitedBiomes((prev) => {
      if (prev.has(biome)) return prev;
      const next = new Set(prev);
      next.add(biome);
      return next;
    });
  }, []);

  const trackTownVisit = useCallback((town: string) => {
    if (!town) return;
    setVisitedTowns((prev) => {
      if (prev.has(town)) return prev;
      const next = new Set(prev);
      next.add(town);
      return next;
    });
  }, []);

  /** Get the tile at the current player position. */
  const getCurrentTile = useCallback((): WorldTile | null => {
    return getTile(worldMap, playerPosition.x, playerPosition.y);
  }, [worldMap, playerPosition]);

  return {
    worldMap,
    setWorldMap: updateWorldMap,
    playerPosition,
    setPlayerPosition: updatePlayerPosition,
    visitedBiomes,
    visitedTowns,
    trackBiomeVisit,
    trackTownVisit,
    getCurrentTile,
  };
}
