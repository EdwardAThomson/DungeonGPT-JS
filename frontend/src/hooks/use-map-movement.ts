/**
 * useMapMovement — handles player movement on the world map.
 *
 * Validates adjacency, terrain, and triggers encounters on movement.
 * Also handles town entry/exit transitions and keyboard navigation.
 */

import { useCallback } from "react";

import type { WorldMap, WorldTile } from "@/game/maps/world-generator";
import type { SubMaps } from "@dungeongpt/shared";

import { checkForEncounter } from "@/game/encounters/generator";
import { getTile } from "@/game/maps/world-generator";
import { useGameStore } from "@/stores/game-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useUiStore } from "@/stores/ui-store";

export function useMapMovement() {
  const worldMap = useGameStore((s) => s.worldMap) as WorldMap | null;
  const playerPosition = useGameStore((s) => s.playerPosition);
  const setPlayerPosition = useGameStore((s) => s.setPlayerPosition);
  const subMaps = useGameStore((s) => s.subMaps) as SubMaps | null;
  const setSubMaps = useGameStore((s) => s.setSubMaps);
  const movesSinceEncounter = useGameStore((s) => s.movesSinceEncounter);
  const incrementMovesSinceEncounter = useGameStore(
    (s) => s.incrementMovesSinceEncounter,
  );
  const resetMovesSinceEncounter = useGameStore(
    (s) => s.resetMovesSinceEncounter,
  );
  const setActiveEncounter = useGameStore((s) => s.setActiveEncounter);
  const addMessage = useGameStore((s) => s.addMessage);
  const settings = useSettingsStore((s) => s.settings);
  const setEncounterModalOpen = useUiStore((s) => s.setEncounterModalOpen);

  /** Check if a tile is reachable (adjacent + not water). */
  const canMoveTo = useCallback(
    (x: number, y: number): boolean => {
      if (!worldMap) return false;
      // Manhattan distance check (adjacent)
      const dx = Math.abs(x - playerPosition.x);
      const dy = Math.abs(y - playerPosition.y);
      if (dx + dy !== 1) return false;

      const tile = getTile(worldMap, x, y);
      if (!tile) return false;
      if (tile.biome === "water") return false;
      return true;
    },
    [worldMap, playerPosition],
  );

  /** Move player to target tile. */
  const moveToTile = useCallback(
    (x: number, y: number) => {
      if (!worldMap) return;
      if (!canMoveTo(x, y)) return;

      const tile = getTile(worldMap, x, y);
      if (!tile) return;

      const isFirstVisit = !tile.isExplored;

      // Mark tile as explored (mutate in-place like original code)
      tile.isExplored = true;

      // Update player position
      setPlayerPosition({ x, y });

      // Increment move counter
      incrementMovesSinceEncounter();

      // Handle town entry/exit transitions
      const wasInsideTown = subMaps?.isInsideTown ?? false;
      const isNowTown = tile.poi === "town" && !!tile.townName;

      if (isNowTown && !wasInsideTown) {
        // Entering town
        setSubMaps({
          ...subMaps,
          isInsideTown: true,
          currentTownTile: tile,
        });
        addMessage({
          role: "system",
          content: `The party arrives at ${tile.townName ?? "town"}.`,
        });
      } else if (!isNowTown && wasInsideTown) {
        // Leaving town
        const prevTownName = (subMaps?.currentTownTile as WorldTile | undefined)?.townName ?? "town";
        setSubMaps({
          ...subMaps,
          isInsideTown: false,
          currentTownTile: null,
        });
        addMessage({
          role: "system",
          content: `The party departs from ${prevTownName}.`,
        });
      }

      // Check for encounter (adapt WorldTile to EncounterTile — poi null→omit)
      const encounterTile = tile.poi
        ? { biome: tile.biome, poi: tile.poi }
        : { biome: tile.biome };
      const encounter = checkForEncounter(
        encounterTile,
        isFirstVisit,
        settings,
        movesSinceEncounter,
      );

      if (encounter) {
        setActiveEncounter(encounter);
        resetMovesSinceEncounter();
        setEncounterModalOpen(true);
      }
    },
    [
      worldMap,
      canMoveTo,
      setPlayerPosition,
      incrementMovesSinceEncounter,
      subMaps,
      setSubMaps,
      addMessage,
      settings,
      movesSinceEncounter,
      setActiveEncounter,
      resetMovesSinceEncounter,
      setEncounterModalOpen,
    ],
  );

  /** Handle keyboard arrow navigation. */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const { x, y } = playerPosition;
      switch (e.key) {
        case "ArrowUp": {
          e.preventDefault();
          moveToTile(x, y - 1);
          break;
        }
        case "ArrowDown": {
          e.preventDefault();
          moveToTile(x, y + 1);
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          moveToTile(x - 1, y);
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          moveToTile(x + 1, y);
          break;
        }
      }
    },
    [playerPosition, moveToTile],
  );

  return { moveToTile, canMoveTo, handleKeyDown };
}
