/**
 * useTownMap — town map generation, navigation, building discovery.
 *
 * Ported from src/hooks/useGameMap.js (lines 53-85, 109-385).
 * Manages town map state, entering/leaving towns, tile clicks, NPC population.
 */

import { useCallback, useEffect, useState } from "react";

import type { TownMapData } from "@/game/maps/town-generator";
import type { WorldMap, WorldTile } from "@/game/maps/world-generator";
import type { ConversationMessage } from "@dungeongpt/shared";

import { generateTownMap } from "@/game/maps/town-generator";
import { getTile } from "@/game/maps/world-generator";
import { populateTown } from "@/game/npcs/generator";
import { useGameStore } from "@/stores/game-store";


/** Position on a map grid. */
interface MapPosition {
  x: number;
  y: number;
}

/** Loaded sub-map data from a save. */
interface SubMapsData {
  readonly currentMapLevel?: string;
  readonly currentTownMap?: TownMapData | null;
  readonly townPlayerPosition?: MapPosition | null;
  readonly currentTownTile?: WorldTile | null;
  readonly isInsideTown?: boolean;
  readonly townMapsCache?: Record<string, TownMapData>;
  [key: string]: unknown;
}

/** Loaded conversation data relevant to town map initialization. */
export interface LoadedTownData {
  readonly sub_maps?: SubMapsData | null;
  readonly subMaps?: SubMapsData | null;
  readonly sessionId?: string;
  readonly timestamp?: string;
  readonly selected_heroes?: readonly { characterName: string }[];
}

/**
 * Generate a deterministic seed for legacy saves missing worldSeed.
 * Ported as-is from useGameMap.js lines 271-283.
 */
function getLegacySeed(conv: LoadedTownData | null): number {
  const sid = conv?.sessionId ?? "";
  const ts = conv?.timestamp ?? "";
  const heroes = (conv?.selected_heroes ?? [])
    .map((h) => h.characterName)
    .toSorted()
    .join("");
  const signature = `${sid}-${ts}-${heroes}`;

  let hash = 0;
  for (let i = 0; i < signature.length; i++) {
    const char = signature.codePointAt(i) ?? 0;
    hash = (hash << 5) - hash + char;
    hash = Math.trunc(hash); // Convert to 32bit integer
  }
  return Math.abs(hash);
}

export function useTownMap(
  loadedConversation: LoadedTownData | null,
  worldMap: WorldMap | null,
  playerPosition: MapPosition,
  hasAdventureStarted: boolean,
  isLoading: boolean,
  worldSeed: number | string | null | undefined,
  setError: (error: string | null) => void,
  trackTownVisit: (town: string) => void,
) {
  const addMessage = useGameStore((s) => s.addMessage);

  const subMapsData =
    loadedConversation?.sub_maps ?? loadedConversation?.subMaps;

  // Multi-level map system
  const [currentMapLevel, setCurrentMapLevel] = useState<string>(
    subMapsData?.currentMapLevel ?? "world",
  );
  const [currentTownMap, setCurrentTownMap] = useState<TownMapData | null>(
    (subMapsData?.currentTownMap as TownMapData | null) ?? null,
  );
  const [townPlayerPosition, setTownPlayerPosition] =
    useState<MapPosition | null>(subMapsData?.townPlayerPosition ?? null);
  const [currentTownTile, setCurrentTownTile] = useState<WorldTile | null>(
    (subMapsData?.currentTownTile as WorldTile | null) ?? null,
  );
  const [isInsideTown, setIsInsideTown] = useState<boolean>(
    subMapsData?.isInsideTown ?? false,
  );
  const [townMapsCache, setTownMapsCache] = useState<
    Record<string, TownMapData>
  >(subMapsData?.townMapsCache ?? {});

  const [townError, setTownError] = useState<string | null>(null);

  // On mount: sync currentTownMap with cache to ensure discoveredBuildings is up to date
   
  useEffect(() => {
    if (
      currentTownMap?.townName &&
      townMapsCache[currentTownMap.townName]
    ) {
      const cached = townMapsCache[currentTownMap.townName];
      const cachedDiscovered =
        (cached as TownMapData & { discoveredBuildings?: string[] })
          .discoveredBuildings ?? [];
      const currentDiscovered =
        (currentTownMap as TownMapData & { discoveredBuildings?: string[] })
          .discoveredBuildings ?? [];

      if (
        cachedDiscovered.length > 0 &&
        cachedDiscovered.length !== currentDiscovered.length
      ) {
        setCurrentTownMap(
          (prev) =>
            ({
              ...prev,
              discoveredBuildings: cachedDiscovered,
            }) as TownMapData,
        );
      }
    }
  }, [currentTownMap, townMapsCache]);

  // Keep currentTownMap in sync with townMapsCache
  useEffect(() => {
    if (currentTownMap?.townName) {
      const cachedData = townMapsCache[currentTownMap.townName];
      const currentDiscovered =
        (currentTownMap as TownMapData & { discoveredBuildings?: string[] })
          .discoveredBuildings ?? [];
      const cachedDiscovered =
        (cachedData as (TownMapData & { discoveredBuildings?: string[] }) | undefined)
          ?.discoveredBuildings ?? [];

      if (cachedDiscovered.length > currentDiscovered.length) {
        setCurrentTownMap(
          (prev) =>
            ({
              ...prev,
              discoveredBuildings: cachedDiscovered,
            }) as TownMapData,
        );
      }
    }
  }, [townMapsCache, currentTownMap]);

  // Validate and regenerate town map if needed
   
  useEffect(() => {
    if (currentTownMap && currentTownTile) {
      const isValid =
        currentTownMap.mapData.length > 0 &&
        currentTownMap.width > 0 &&
        currentTownMap.height > 0 &&
        currentTownMap.entryPoint.x >= 0 &&
        typeof currentTownMap.townName === "string";

      if (!isValid) {
        const townSize = currentTownTile.townSize ?? "village";
        const townName = currentTownTile.townName ?? "Town";

        if (!worldSeed) {
          setTownError(
            "This save file is missing its World Seed and cannot be repaired.",
          );
          return;
        }

        const seed =
          Number(worldSeed) +
          currentTownTile.x * 1000 +
          currentTownTile.y * 10_000;
        const newTownMap = generateTownMap(
          townSize,
          townName,
          "south",
          seed,
          currentTownTile.hasRiver,
          currentTownTile.riverDirection,
        );

        const npcs = populateTown(newTownMap, seed);
        (newTownMap as TownMapData & { npcs?: unknown }).npcs = npcs;

        setCurrentTownMap(newTownMap);
        setTownPlayerPosition({
          x: newTownMap.entryPoint.x,
          y: newTownMap.entryPoint.y,
        });
      }
    }
  }, [currentTownMap, currentTownTile, worldSeed]);

  const markBuildingDiscovered = useCallback(
    (townName: string, x: number, y: number) => {
      if (!townName) return;
      const coord = `${String(x)},${String(y)}`;

      setTownMapsCache((prev) => {
        const townData = prev[townName];
        if (!townData) return prev;

        const discovered =
          (townData as TownMapData & { discoveredBuildings?: string[] })
            .discoveredBuildings ?? [];
        if (discovered.includes(coord)) return prev;

        return {
          ...prev,
          [townName]: {
            ...townData,
            discoveredBuildings: [...discovered, coord],
          } as TownMapData,
        };
      });
    },
    [],
  );

  /**
   * Generate or load a town map for a given tile.
   * Shared logic used by both handleEnterCurrentTown and handleEnterLocation.
   */
  const getOrGenerateTownMap = useCallback(
    (
      townName: string,
      townSize: string,
      tileX: number,
      tileY: number,
      hasRiver: boolean | undefined,
      riverDirection: string | undefined,
    ): TownMapData => {
      const cached = townMapsCache[townName];
      if (cached) return cached;

      const effectiveSeed =
        worldSeed != null && worldSeed !== ""
          ? Number(worldSeed)
          : getLegacySeed(loadedConversation);

      const seed = effectiveSeed + tileX * 1000 + tileY * 10_000;

      if (Number.isNaN(seed)) {
        throw new TypeError(
          "Could not generate a valid town seed from this save file.",
        );
      }

      const townMapData = generateTownMap(
        townSize,
        townName,
        "south",
        seed,
        hasRiver,
        riverDirection,
      );

      const npcs = populateTown(townMapData, seed);
      (townMapData as TownMapData & { npcs?: unknown }).npcs = npcs;

      setTownMapsCache((prev) => ({ ...prev, [townName]: townMapData }));
      return townMapData;
    },
    [townMapsCache, worldSeed, loadedConversation],
  );

  /** Enter the town at the current player world position. */
  const handleEnterCurrentTown = useCallback(() => {
    if (!hasAdventureStarted) return;
    if (!worldMap) return;

    const currentTile = getTile(worldMap, playerPosition.x, playerPosition.y);
    if (currentTile?.poi !== "town") return;

    const townSize = currentTile.townSize ?? "village";
    const townName = currentTile.townName ?? "Town";

    // If already inside this town, just switch to town view
    if (isInsideTown && currentTownTile?.townName === townName) {
      setCurrentMapLevel("town");
      return;
    }

    try {
      const townMapData = getOrGenerateTownMap(
        townName,
        townSize,
        currentTile.x,
        currentTile.y,
        currentTile.hasRiver,
        currentTile.riverDirection,
      );

      setCurrentTownMap(townMapData);
      setCurrentTownTile(currentTile);
      setTownPlayerPosition({
        x: townMapData.entryPoint.x,
        y: townMapData.entryPoint.y,
      });
      setCurrentMapLevel("town");
      setIsInsideTown(true);
      trackTownVisit(townName);

      const enterMessage: ConversationMessage = {
        role: "system",
        content: `You have entered ${townName}.`,
      };
      addMessage(enterMessage);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setTownError(message);
    }
  }, [
    hasAdventureStarted,
    worldMap,
    playerPosition,
    isInsideTown,
    currentTownTile,
    getOrGenerateTownMap,
    trackTownVisit,
    addMessage,
  ]);

  /** Leave the current town and return to the world map. */
  const handleLeaveTown = useCallback(() => {
    if (!currentTownMap || !townPlayerPosition) return;

    const entryPoint = currentTownMap.entryPoint;
    const playerX = townPlayerPosition.x;
    const playerY = townPlayerPosition.y;

    const isAtEntry = playerX === entryPoint.x && playerY === entryPoint.y;
    const isAdjacentRight =
      playerX === entryPoint.x + 1 && playerY === entryPoint.y;

    if (!isAtEntry && !isAdjacentRight) {
      setTownError(
        "You must be at the town entrance (marked with yellow outline) to leave.",
      );
      return;
    }

    setTownError(null);
    setCurrentMapLevel("world");
    setCurrentTownMap(null);
    setTownPlayerPosition(null);
    setCurrentTownTile(null);
    setIsInsideTown(false);

    const exitMessage: ConversationMessage = {
      role: "system",
      content: "You have left the town and returned to the world map.",
    };
    addMessage(exitMessage);
  }, [currentTownMap, townPlayerPosition, addMessage]);

  /** Handle click on a town tile — movement within town. */
  const handleTownTileClick = useCallback(
    (clickedX: number, clickedY: number) => {
      if (!townPlayerPosition || !currentTownMap || isLoading) return;

      const currentX = townPlayerPosition.x;
      const currentY = townPlayerPosition.y;
      const distance =
        Math.abs(clickedX - currentX) + Math.abs(clickedY - currentY);

      if (distance === 0) return;

      if (distance > 5) {
        setError("You can move up to 5 tiles at a time in town.");
        return;
      }

      const targetRow = currentTownMap.mapData[clickedY];
      const targetTile = targetRow?.[clickedX];
      if (!targetTile) return;

      if (!targetTile.walkable && targetTile.type !== "building") {
        setError("You cannot move to that location.");
        return;
      }

      setTownError(null);
      setTownPlayerPosition({ x: clickedX, y: clickedY });
    },
    [townPlayerPosition, currentTownMap, isLoading, setError],
  );

  return {
    currentMapLevel,
    setCurrentMapLevel,
    currentTownMap,
    townPlayerPosition,
    currentTownTile,
    isInsideTown,
    townMapsCache,
    townError,

    handleEnterCurrentTown,
    handleLeaveTown,
    handleTownTileClick,
    markBuildingDiscovered,
  };
}
