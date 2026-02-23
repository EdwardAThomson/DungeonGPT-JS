/**
 * MapModal — world/town map display in a dialog.
 *
 * Ported from src/components/MapModal.js (70 lines).
 * Renders WorldMapDisplay based on current map level.
 * Wired to useMapMovement for interactive tile clicks and keyboard navigation.
 */

import { useEffect } from "react";

import type { WorldTile } from "@/game/maps/world-generator";
import type { SubMaps } from "@dungeongpt/shared";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/design-system/ui/dialog";
import { useMapMovement } from "@/hooks/use-map-movement";
import { WorldMapDisplay } from "@/pages/game/components/world-map-display";
import { useGameStore } from "@/stores/game-store";
import { useUiStore } from "@/stores/ui-store";

export function MapModal() {
  const isOpen = useUiStore((s) => s.isMapModalOpen);
  const setOpen = useUiStore((s) => s.setMapModalOpen);
  const worldMap = useGameStore((s) => s.worldMap) as WorldTile[][] | null;
  const playerPosition = useGameStore((s) => s.playerPosition);
  const subMaps = useGameStore((s) => s.subMaps) as SubMaps | null;
  const selectedHeroes = useGameStore((s) => s.selectedHeroes);
  const { moveToTile, canMoveTo, handleKeyDown } = useMapMovement();

  const isInsideTown = subMaps?.isInsideTown ?? false;

  // Keyboard navigation when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const listener = (e: KeyboardEvent) => {
      handleKeyDown(e);
    };
    globalThis.addEventListener("keydown", listener);
    return () => {
      globalThis.removeEventListener("keydown", listener);
    };
  }, [isOpen, handleKeyDown]);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setOpen(open);
      }}
    >
      <DialogContent className="max-w-[800px]">
        <DialogHeader>
          <DialogTitle>
            {isInsideTown ? "Town Map" : "World Map"}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-[400px] flex items-center justify-center">
          {worldMap ? (
            <WorldMapDisplay
              mapData={worldMap}
              playerPosition={playerPosition}
              onTileClick={moveToTile}
              canMoveTo={canMoveTo}
              firstHero={selectedHeroes[0] ?? null}
            />
          ) : (
            <p className="text-[var(--text-secondary)]">
              No map data available. Generate a world map in Game Settings.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
