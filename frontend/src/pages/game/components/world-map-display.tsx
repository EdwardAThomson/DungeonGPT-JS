/**
 * WorldMapDisplay — renders the world map grid with biomes, POIs, rivers, paths.
 *
 * Ported from src/components/WorldMapDisplay.js (275 lines).
 * Converted inline styles to Tailwind where possible, kept dynamic styles inline.
 * Zero behavioral or visual changes.
 */

import type { WorldTile } from "@/game/maps/world-generator";
import type { Character } from "@dungeongpt/shared";

import { sanitizeImageUrl } from "@/lib/sanitize-url";
import { cn } from "@/lib/utils";


interface WorldMapDisplayProps {
  readonly mapData: WorldTile[][] | null;
  readonly playerPosition: { x: number; y: number };
  readonly onTileClick: (x: number, y: number) => void;
  readonly canMoveTo?: (x: number, y: number) => boolean;
  readonly firstHero?: Character | null;
}

// ── Constants ──────────────────────────────────────────────────────────────

const BIOME_COLORS: Record<string, React.CSSProperties> = {
  plains: { backgroundColor: "#c3e6cb" },
  water: { backgroundColor: "#007bff" },
  beach: { backgroundColor: "#f5deb3" },
};

const POI_EMOJIS: Record<string, string> = {
  forest: "\uD83C\uDF32",
  mountain: "\u26F0\uFE0F",
  cave_entrance: "\uD83D\uDD73\uFE0F",
  town_hamlet: "\uD83D\uDED6",
  town_village: "\uD83C\uDFE1",
  town_town: "\uD83C\uDFD8\uFE0F",
  town_city: "\uD83C\uDFF0",
};

/** SVG path definitions for path/river overlays. */
const PATH_SVGS: Record<string, string> = {
  NORTH_SOUTH: "M20,0 L20,40",
  EAST_WEST: "M0,20 L40,20",
  NORTH_EAST: "M20,0 Q20,20 40,20",
  NORTH_WEST: "M20,0 Q20,20 0,20",
  SOUTH_EAST: "M20,40 Q20,20 40,20",
  SOUTH_WEST: "M20,40 Q20,20 0,20",
  INTERSECTION: "M20,0 L20,40 M0,20 L40,20",
  START_NORTH: "M20,20 L20,0",
  START_SOUTH: "M20,20 L20,40",
  START_EAST: "M20,20 L40,20",
  START_WEST: "M20,20 L0,20",
  END_NORTH: "M20,40 L20,20",
  END_SOUTH: "M20,0 L20,20",
  END_EAST: "M0,20 L20,20",
  END_WEST: "M40,20 L20,20",
};

const BEACH_TRANSFORMS = [
  "translateY(10px)", // 0: North
  "translateX(-10px)", // 1: East
  "translateY(-10px)", // 2: South
  "translateX(10px)", // 3: West
] as const;

const BEACH_GRADIENTS = [
  "to top", // 0: North (water is north)
  "to right", // 1: East
  "to bottom", // 2: South
  "to left", // 3: West
] as const;

// ── Helpers ────────────────────────────────────────────────────────────────

function getTownEmoji(tile: WorldTile): string | null {
  if (tile.poi === "town") {
    if (tile.townSize) {
      return (
        POI_EMOJIS[`town_${tile.townSize}`] ?? POI_EMOJIS["town_village"] ?? null
      );
    }
    return POI_EMOJIS["town_village"] ?? null;
  }
  return null;
}

function getBeachTransform(tile: WorldTile): string {
  if (
    tile.biome === "beach" &&
    tile.beachDirection !== undefined &&
    tile.beachDirection >= 0 &&
    tile.beachDirection < 4
  ) {
    return BEACH_TRANSFORMS[tile.beachDirection] ?? "none";
  }
  return "none";
}

// ── Sub-components ─────────────────────────────────────────────────────────

function RiverOverlay({ tile }: { readonly tile: WorldTile }) {
  if (!tile.hasRiver || tile.biome === "water") return null;
  const pathD =
    PATH_SVGS[tile.riverDirection ?? "NORTH_SOUTH"] ??
    PATH_SVGS["NORTH_SOUTH"];

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none z-[1]"
      viewBox="0 0 40 40"
    >
      <path
        d={pathD}
        stroke="#4169E1"
        strokeWidth="4"
        fill="none"
        opacity="0.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PathOverlay({ tile }: { readonly tile: WorldTile }) {
  if (!tile.hasPath) return null;
  const pathD =
    PATH_SVGS[tile.pathDirection ?? "NORTH_SOUTH"] ??
    PATH_SVGS["NORTH_SOUTH"];
  const beachTransform = getBeachTransform(tile);

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none z-[1]"
      viewBox="0 0 40 40"
      style={{
        transform: beachTransform === "none" ? undefined : beachTransform,
      }}
    >
      <path
        d={pathD}
        stroke="#8B4513"
        strokeWidth="3"
        fill="none"
        opacity="0.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TileNameLabel({ tile }: { readonly tile: WorldTile }) {
  const showLabel =
    tile.townName ?? (tile.mountainName && tile.isFirstMountainInRange);
  if (!showLabel) return null;

  return (
    <span
      className="absolute bottom-[-6px] left-1/2 text-[7px] font-bold whitespace-nowrap z-[4] pointer-events-none leading-none"
      style={{
        transform: "translateX(-50%)",
        color: tile.townName ? "#2c1810" : "#4a3728",
        textShadow:
          "0 0 2px rgba(255,255,255,0.9), 0 0 4px rgba(255,255,255,0.7)",
      }}
    >
      {tile.townName ?? tile.mountainName}
    </span>
  );
}

function PlayerMarker({
  hero,
  tile,
}: {
  readonly hero: Character;
  readonly tile: WorldTile;
}) {
  const beachTransform = getBeachTransform(tile);

  return (
    <div
      className="player-marker-portrait z-[3]"
      style={{
        transform: beachTransform === "none" ? undefined : beachTransform,
      }}
    >
      <img
        src={sanitizeImageUrl(hero.profilePicture)}
        alt={hero.characterName}
        className="w-full h-full object-cover"
      />
      <div className="player-marker-pointer" />
    </div>
  );
}

// ── Tile rendering ─────────────────────────────────────────────────────────

function getTileStyle(tile: WorldTile): React.CSSProperties {
  // Beach gradients
  if (
    tile.biome === "beach" &&
    tile.beachDirection !== undefined &&
    tile.beachDirection >= 0 &&
    tile.beachDirection < 4
  ) {
    const direction = BEACH_GRADIENTS[tile.beachDirection] ?? "to top";
    return {
      background: `linear-gradient(${direction}, #f5deb3 0%, #f5deb3 50%, #007bff 50%, #007bff 100%)`,
    };
  }

  // Lakes
  if (tile.isLake) {
    return {
      backgroundColor: "#007bff",
      boxShadow: "inset 0 0 10px #f5deb3",
    };
  }

  // Old-system backward compat: biome was 'forest' or 'mountains'
  if ((tile.biome === "forest" || tile.biome === "mountains") && !tile.poi) {
    return BIOME_COLORS["plains"] ?? { backgroundColor: "#c3e6cb" };
  }

  return BIOME_COLORS[tile.biome] ?? BIOME_COLORS["plains"] ?? {};
}

function getPoiContent(tile: WorldTile): string | null {
  if (tile.poi === "town") {
    return getTownEmoji(tile);
  }
  if (tile.poi) {
    return POI_EMOJIS[tile.poi] ?? tile.poi;
  }
  // Old system compat
  if (tile.biome === "forest" && !tile.poi) {
    return POI_EMOJIS["forest"] ?? null;
  }
  if (tile.biome === "mountains" && !tile.poi) {
    return POI_EMOJIS["mountain"] ?? null;
  }
  return null;
}

// ── Main component ─────────────────────────────────────────────────────────

export function WorldMapDisplay({
  mapData,
  playerPosition,
  onTileClick,
  canMoveTo,
  firstHero = null,
}: WorldMapDisplayProps) {
  if (!mapData || mapData.length === 0) {
    return <div>Loading map...</div>;
  }

  const firstRow = mapData[0];
  if (!firstRow) return <div>Loading map...</div>;

  const mapHeight = mapData.length;
  const mapWidth = firstRow.length;

  return (
    <div className="world-map-container">
      <div
        className="bg-[#eee] border border-[#ccc]"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${String(mapWidth)}, 40px)`,
          gridTemplateRows: `repeat(${String(mapHeight)}, 40px)`,
          gap: "1px",
          width: `${String(mapWidth * 40 + (mapWidth - 1))}px`,
          margin: "20px auto",
        }}
      >
        {mapData.flat().map((tile) => {
          const isPlayerHere =
            playerPosition.x === tile.x && playerPosition.y === tile.y;
          const isMovable = canMoveTo ? canMoveTo(tile.x, tile.y) : false;
          const tileStyle = getTileStyle(tile);
          const poiContent = getPoiContent(tile);
          const beachTransform = getBeachTransform(tile);

          return (
            <div
              key={`${String(tile.x)}-${String(tile.y)}`}
              className={cn(
                "flex items-center justify-center text-[20px] cursor-pointer relative",
                isPlayerHere && "player-tile",
                !tile.isExplored && "unexplored",
                isMovable && "ring-2 ring-[var(--primary)] ring-inset opacity-100",
              )}
              role="button"
              tabIndex={0}
              style={{
                ...tileStyle,
              }}
              onClick={() => {
                onTileClick(tile.x, tile.y);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onTileClick(tile.x, tile.y);
                }
              }}
              aria-label={`${tile.townName ?? tile.mountainName ?? `Tile ${String(tile.x)}, ${String(tile.y)}`} - ${tile.biome}`}
              title={`${tile.townName ?? tile.mountainName ?? `(${String(tile.x)}, ${String(tile.y)})`} - ${tile.biome}${tile.poi ? ` (${tile.poi})` : ""}${tile.townSize ? ` [${tile.townSize}]` : ""}${tile.isExplored ? " (Explored)" : ""}`}
            >
              <RiverOverlay tile={tile} />
              <PathOverlay tile={tile} />

              {/* POI emoji */}
              <span
                className="relative z-[2]"
                style={{
                  opacity:
                    tile.poi === "mountain" && tile.hasPath ? 0.8 : 1,
                  transform: `${beachTransform === "none" ? "none" : beachTransform} ${tile.poi === "mountain" && tile.hasPath ? "scale(0.8)" : ""}`.trim(),
                }}
              >
                {poiContent}
              </span>

              <TileNameLabel tile={tile} />

              {isPlayerHere && firstHero ? (
                <PlayerMarker hero={firstHero} tile={tile} />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
