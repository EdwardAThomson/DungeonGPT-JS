/**
 * TownMapDisplay — renders a town interior map with paths, buildings, NPCs.
 *
 * Ported from src/components/TownMapDisplay.js (330 lines).
 * Split rendering into sub-components to stay under 200 lines.
 * Uses inline styles for grid layout (matches original exactly).
 */

import { useCallback, useMemo, useState } from "react";

import type { TownMapData, TownTile } from "@/game/maps/town-generator";
import type { NPC } from "@/game/npcs/generator";
import type { Character } from "@dungeongpt/shared";

import { Button } from "@/design-system/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/design-system/ui/dialog";
import { getTownTileEmoji } from "@/game/maps/town-generator";
import { sanitizeImageUrl } from "@/lib/sanitize-url";


interface TownMapDisplayProps {
  readonly townMapData: TownMapData | null;
  readonly playerPosition: { x: number; y: number } | null;
  readonly onTileClick?: (x: number, y: number) => void;
  readonly onLeaveTown?: () => void;
  readonly showLeaveButton?: boolean;
  readonly firstHero?: Character | null;
  readonly townError?: string | null;
  readonly markBuildingDiscovered?: (
    townName: string,
    x: number,
    y: number,
  ) => void;
}

/** Extended town map data with optional runtime fields. */
type ExtendedTownMapData = TownMapData & {
  discoveredBuildings?: string[];
  npcs?: NPC[];
};

// ── Tile color helper ──────────────────────────────────────────────────────

function getTileBackground(type: string): string {
  const colors: Record<string, string> = {
    grass: "#90EE90",
    stone_path: "#90EE90",
    dirt_path: "#90EE90",
    wall: "#90EE90",
    keep_wall: "#90EE90",
    town_square: "#E0E0E0",
    farm_field: "#D2B48C",
    water: "#007bff",
    bridge: "#5d4037",
    building: "#90EE90",
  };
  return colors[type] ?? "#FFF";
}

// ── Building modal sub-component ───────────────────────────────────────────

interface BuildingModalProps {
  readonly building: TownTile & { npcs?: NPC[] };
  readonly onClose: () => void;
}

function BuildingModal({ building, onClose }: BuildingModalProps) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {building.buildingName ?? building.buildingType ?? "Building"}
          </DialogTitle>
        </DialogHeader>
        <p className="text-[0.9rem] text-[var(--text-secondary)]">
          {building.buildingType
            ? `Type: ${building.buildingType}`
            : "A building in town."}
        </p>
        {building.npcs && building.npcs.length > 0 ? (
          <div className="mt-3">
            <h4 className="text-[0.85rem] font-bold mb-2">NPCs Present:</h4>
            <ul className="text-[0.85rem] text-[var(--text)]">
              {building.npcs.map((npc, idx) => (
                <li key={`npc-${String(idx)}`} className="mb-1">
                  <strong>{npc.name}</strong>
                  {npc.role ? ` - ${npc.role}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function TownMapDisplay({
  townMapData,
  playerPosition,
  onTileClick,
  onLeaveTown,
  showLeaveButton = true,
  firstHero = null,
  townError = null,
  markBuildingDiscovered,
}: TownMapDisplayProps) {
  const [selectedBuilding, setSelectedBuilding] = useState<
    (TownTile & { npcs?: NPC[] }) | null
  >(null);
  const [distanceWarning, setDistanceWarning] = useState(false);

  const extData = townMapData as ExtendedTownMapData | null;
  const discoveredBuildings = useMemo(
    () => extData?.discoveredBuildings ?? [],
    [extData?.discoveredBuildings],
  );

  const handleBuildingClick = useCallback(
    (tile: TownTile) => {
      if (!playerPosition || !extData) return;
      const distance =
        Math.abs(tile.x - playerPosition.x) +
        Math.abs(tile.y - playerPosition.y);
      const coordString = `${String(tile.x)},${String(tile.y)}`;
      const isDiscovered = discoveredBuildings.includes(coordString);

      if (distance <= 2 || isDiscovered) {
        const buildingNpcs = (extData.npcs ?? []).filter(
          (npc) =>
            npc.location?.x === tile.x &&
            npc.location.y === tile.y,
        );
        setSelectedBuilding({ ...tile, npcs: buildingNpcs });

        if (!isDiscovered && distance <= 2 && markBuildingDiscovered) {
          markBuildingDiscovered(extData.townName, tile.x, tile.y);
        }
      } else {
        setDistanceWarning(true);
      }
    },
    [playerPosition, extData, discoveredBuildings, markBuildingDiscovered],
  );

  if (!townMapData) return null;

  return (
    <div>
      <TownGrid
        townMapData={townMapData}
        playerPosition={playerPosition}
        discoveredBuildings={discoveredBuildings}
        onTileClick={onTileClick}
        onBuildingClick={handleBuildingClick}
        firstHero={firstHero}
      />

      {townError ? (
        <div className="mx-auto my-[10px] block max-w-[400px] p-3 text-center text-[var(--warning)] bg-[var(--surface)] border border-[var(--border)] rounded">
          {townError}
        </div>
      ) : null}

      {showLeaveButton && onLeaveTown ? (
        <div className="text-center mt-[10px]">
          <Button variant="secondary" onClick={onLeaveTown}>
            Leave Town
          </Button>
        </div>
      ) : null}

      {selectedBuilding ? (
        <BuildingModal
          building={selectedBuilding}
          onClose={() => { setSelectedBuilding(null); }}
        />
      ) : null}

      {distanceWarning ? (
        <Dialog open onOpenChange={(open) => { if (!open) setDistanceWarning(false); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Too Far Away</DialogTitle>
            </DialogHeader>
            <p>
              You are too far away to identify this building clearly. Move
              closer to discover what it is.
            </p>
            <div className="text-center mt-5">
              <Button onClick={() => { setDistanceWarning(false); }}>OK</Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

// ── TownGrid sub-component ─────────────────────────────────────────────────

interface TownGridProps {
  readonly townMapData: TownMapData;
  readonly playerPosition: { x: number; y: number } | null;
  readonly discoveredBuildings: readonly string[];
  readonly onTileClick: ((x: number, y: number) => void) | undefined;
  readonly onBuildingClick: (tile: TownTile) => void;
  readonly firstHero: Character | null | undefined;
}

function TownGrid({
  townMapData,
  playerPosition,
  discoveredBuildings,
  onTileClick,
  onBuildingClick,
  firstHero,
}: TownGridProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${String(townMapData.width)}, 30px)`,
        gap: "1px",
        border: "1px solid #ccc",
        width: `${String(townMapData.width * 30 + (townMapData.width - 1))}px`,
        margin: "20px auto",
        backgroundColor: "#eee",
        fontSize: "16px",
      }}
    >
      {townMapData.mapData.flat().map((tile, index) => (
        <TownTileCell
          key={`town-${String(index)}`}
          tile={tile}
          index={index}
          townMapData={townMapData}
          playerPosition={playerPosition}
          discoveredBuildings={discoveredBuildings}
          onTileClick={onTileClick}
          onBuildingClick={onBuildingClick}
          firstHero={firstHero}
        />
      ))}
    </div>
  );
}

// ── TownTileCell sub-component ────────────────────────────────────────────

interface TownTileCellProps {
  readonly tile: TownTile;
  readonly index: number;
  readonly townMapData: TownMapData;
  readonly playerPosition: { x: number; y: number } | null;
  readonly discoveredBuildings: readonly string[];
  readonly onTileClick: ((x: number, y: number) => void) | undefined;
  readonly onBuildingClick: (tile: TownTile) => void;
  readonly firstHero: Character | null | undefined;
}

/** Compute derived tile state for rendering. */
function computeTileState(
  tile: TownTile,
  index: number,
  width: number,
  playerPosition: { x: number; y: number } | null,
  discoveredBuildings: readonly string[],
  onTileClick: ((x: number, y: number) => void) | undefined,
) {
  const row = Math.floor(index / width);
  const col = index % width;
  const isPlayer = playerPosition?.x === col && playerPosition.y === row;
  const isBuilding = tile.type === "building";
  const distance = playerPosition
    ? Math.abs(col - playerPosition.x) + Math.abs(row - playerPosition.y)
    : 999;
  const isInRange = distance > 0 && distance <= 5;
  const isDiscovered = discoveredBuildings.includes(
    `${String(tile.x)},${String(tile.y)}`,
  );
  const canSeeName = distance <= 2 || isDiscovered;
  const displayName =
    canSeeName && tile.buildingName
      ? tile.buildingName
      : (tile.buildingType ?? tile.type);
  const isClickable =
    onTileClick && isInRange && (tile.walkable || isBuilding) && !isPlayer;

  return { row, col, isPlayer, isBuilding, distance, isInRange, isDiscovered, displayName, isClickable };
}

/** Render player portrait or fallback star. */
function TownPlayerMarker({ firstHero }: { readonly firstHero: Character | null | undefined }) {
  if (firstHero) {
    return (
      <div className="player-marker-portrait z-[3]">
        <img
          src={sanitizeImageUrl(firstHero.profilePicture)}
          alt={firstHero.characterName}
          className="w-full h-full object-cover"
        />
        <div className="player-marker-pointer" />
      </div>
    );
  }
  return (
    <span className="relative z-[2]">
      {"\u2B50"}
    </span>
  );
}

function TownTileCell({
  tile,
  index,
  townMapData,
  playerPosition,
  discoveredBuildings,
  onTileClick,
  onBuildingClick,
  firstHero,
}: TownTileCellProps) {
  const { row, col, isPlayer, isBuilding, distance, isInRange, isDiscovered, displayName, isClickable } =
    computeTileState(tile, index, townMapData.width, playerPosition, discoveredBuildings, onTileClick);

  const handleClick = () => {
    if (isBuilding) {
      onBuildingClick(tile);
    } else if (isClickable) {
      onTileClick?.(col, row);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  const outline = isPlayer || tile.isEntry ? "2px solid yellow" : "none";

  return (
    <div
      className="flex items-center justify-center relative"
      role="button"
      tabIndex={isClickable || isBuilding ? 0 : -1}
      style={{
        backgroundColor: getTileBackground(tile.type),
        outline,
        outlineOffset: "-2px",
        width: "30px",
        height: "30px",
        cursor: isClickable ? "pointer" : "default",
      }}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`Tile ${displayName} at ${String(tile.x)}, ${String(tile.y)}`}
      title={`(${String(tile.x)}, ${String(tile.y)}) - ${displayName}${isInRange ? ` [${String(distance)} tiles away]` : ""}${isDiscovered ? " (Discovered)" : ""}`}
    >
      <TileOverlays tile={tile} townMapData={townMapData} row={row} col={col} />

      {isPlayer ? null : (
        <span className="relative z-[2]">{getTownTileEmoji(tile)}</span>
      )}

      {isPlayer ? <TownPlayerMarker firstHero={firstHero} /> : null}
    </div>
  );
}

// ── TileOverlays sub-component ─────────────────────────────────────────────

interface TileOverlaysProps {
  readonly tile: TownTile;
  readonly townMapData: TownMapData;
  readonly row: number;
  readonly col: number;
}

/** Render path, wall, and keep_wall segments based on adjacent tiles. */
function TileOverlays({ tile, townMapData, row, col }: TileOverlaysProps) {
  const isPath = tile.type === "dirt_path" || tile.type === "stone_path";
  const isWall = tile.type === "wall";
  const isKeepWall = tile.type === "keep_wall";

  if (!isPath && !isWall && !isKeepWall) return null;

  const getAdjacentTile = (dy: number, dx: number): TownTile | null => {
    const ny = row + dy;
    const nx = col + dx;
    if (ny < 0 || ny >= townMapData.height || nx < 0 || nx >= townMapData.width) {
      return null;
    }
    const tileRow = townMapData.mapData[ny];
    return tileRow?.[nx] ?? null;
  };

  if (isPath) {
    return (
      <PathSegments
        tile={tile}
        getAdjacentTile={getAdjacentTile}
      />
    );
  }

  if (isWall) {
    return (
      <WallSegments
        getAdjacentTile={getAdjacentTile}
        color="#A9A9A9"
        width={12}
        matchType="wall"
      />
    );
  }

  // isKeepWall
  return (
    <WallSegments
      getAdjacentTile={getAdjacentTile}
      color="#696969"
      width={4}
      matchType="keep_wall"
    />
  );
}

// ── PathSegments ───────────────────────────────────────────────────────────

interface PathSegmentsProps {
  readonly tile: TownTile;
  readonly getAdjacentTile: (dy: number, dx: number) => TownTile | null;
}

const PATH_CONNECTABLE_TYPES = new Set([
  "dirt_path",
  "stone_path",
  "building",
  "town_square",
  "keep",
]);

function PathSegments({ tile, getAdjacentTile }: PathSegmentsProps) {
  const pathColor = tile.type === "dirt_path" ? "#8B4513" : "#808080";
  const north = getAdjacentTile(-1, 0);
  const south = getAdjacentTile(1, 0);
  const east = getAdjacentTile(0, 1);
  const west = getAdjacentTile(0, -1);

  const hasNorth = north ? PATH_CONNECTABLE_TYPES.has(north.type) : false;
  const hasSouth = south ? PATH_CONNECTABLE_TYPES.has(south.type) : false;
  const hasEast = east ? PATH_CONNECTABLE_TYPES.has(east.type) : false;
  const hasWest = west ? PATH_CONNECTABLE_TYPES.has(west.type) : false;

  return (
    <>
      {hasNorth ? (
        <div
          className="absolute left-1/2 top-0 -translate-x-1/2"
          style={{ width: "4px", height: "50%", backgroundColor: pathColor }}
        />
      ) : null}
      {hasSouth ? (
        <div
          className="absolute left-1/2 bottom-0 -translate-x-1/2"
          style={{ width: "4px", height: "50%", backgroundColor: pathColor }}
        />
      ) : null}
      {hasEast ? (
        <div
          className="absolute top-1/2 right-0 -translate-y-1/2"
          style={{ height: "4px", width: "50%", backgroundColor: pathColor }}
        />
      ) : null}
      {hasWest ? (
        <div
          className="absolute top-1/2 left-0 -translate-y-1/2"
          style={{ height: "4px", width: "50%", backgroundColor: pathColor }}
        />
      ) : null}
      {(hasNorth || hasSouth) && (hasEast || hasWest) ? (
        <div
          className="absolute rounded-full"
          style={{
            width: "6px",
            height: "6px",
            backgroundColor: pathColor,
          }}
        />
      ) : null}
    </>
  );
}

// ── WallSegments ───────────────────────────────────────────────────────────

interface WallSegmentsProps {
  readonly getAdjacentTile: (dy: number, dx: number) => TownTile | null;
  readonly color: string;
  readonly width: number;
  readonly matchType: string;
}

function WallSegments({
  getAdjacentTile,
  color,
  width,
  matchType,
}: WallSegmentsProps) {
  const north = getAdjacentTile(-1, 0);
  const south = getAdjacentTile(1, 0);
  const east = getAdjacentTile(0, 1);
  const west = getAdjacentTile(0, -1);

  const hasNorth = north?.type === matchType;
  const hasSouth = south?.type === matchType;
  const hasEast = east?.type === matchType;
  const hasWest = west?.type === matchType;

  const cornerSize = matchType === "wall" ? 14 : 6;

  return (
    <>
      {hasNorth ? (
        <div
          className="absolute left-1/2 top-0 -translate-x-1/2"
          style={{
            width: `${String(width)}px`,
            height: "50%",
            backgroundColor: color,
          }}
        />
      ) : null}
      {hasSouth ? (
        <div
          className="absolute left-1/2 bottom-0 -translate-x-1/2"
          style={{
            width: `${String(width)}px`,
            height: "50%",
            backgroundColor: color,
          }}
        />
      ) : null}
      {hasEast ? (
        <div
          className="absolute top-1/2 right-0 -translate-y-1/2"
          style={{
            height: `${String(width)}px`,
            width: "50%",
            backgroundColor: color,
          }}
        />
      ) : null}
      {hasWest ? (
        <div
          className="absolute top-1/2 left-0 -translate-y-1/2"
          style={{
            height: `${String(width)}px`,
            width: "50%",
            backgroundColor: color,
          }}
        />
      ) : null}
      {(hasNorth || hasSouth) && (hasEast || hasWest) ? (
        <div
          className="absolute"
          style={{
            width: `${String(cornerSize)}px`,
            height: `${String(cornerSize)}px`,
            backgroundColor: color,
            borderRadius: matchType === "wall" ? "2px" : "50%",
          }}
        />
      ) : null}
    </>
  );
}
