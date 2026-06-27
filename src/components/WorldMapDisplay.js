import React from 'react';
import { resolveProfilePicture } from '../utils/assetHelper';
import { biomeBackground, poiSprite } from '../utils/worldTileArt';
import WorldMapLabels from './WorldMapLabels';

const TILE = 56; // larger tiles for readability (was 40 originally)

// Beach offset: water sits on one edge of the tile, so overlays/sprites/marker are
// nudged toward the land side. beachDirection: 0 = water North, 1 = East, 2 = South, 3 = West.
// 0-3 = water N/E/S/W (shift toward land); 4-7 = corner shores (shift diagonally toward sand).
const BEACH_SHIFT = [
  'translateY(10px)', 'translateX(-10px)', 'translateY(-10px)', 'translateX(10px)',     // 0-3 straight
  'translate(-7px, 7px)', 'translate(-7px, -7px)', 'translate(7px, -7px)', 'translate(7px, 7px)', // 4-7 concave
  'translate(-5px, 5px)', 'translate(-5px, -5px)', 'translate(5px, -5px)', 'translate(5px, 5px)',  // 8-11 convex
];

// SVG path definitions for different path/river directions (viewBox 40x40)
const pathSVGs = {
  NORTH_SOUTH: 'M20,0 L20,40',           // Straight vertical
  EAST_WEST: 'M0,20 L40,20',             // Straight horizontal
  NORTH_EAST: 'M20,0 Q20,20 40,20',      // Curved from north to east
  NORTH_WEST: 'M20,0 Q20,20 0,20',       // Curved from north to west
  SOUTH_EAST: 'M20,40 Q20,20 40,20',     // Curved from south to east
  SOUTH_WEST: 'M20,40 Q20,20 0,20',      // Curved from south to west
  INTERSECTION: 'M20,0 L20,40 M0,20 L40,20', // Cross intersection
  // Partial paths for starts/ends (mountain sources / lake mouths)
  START_NORTH: 'M20,20 L20,0',
  START_SOUTH: 'M20,20 L20,40',
  START_EAST: 'M20,20 L40,20',
  START_WEST: 'M20,20 L0,20',
  END_NORTH: 'M20,40 L20,20',
  END_SOUTH: 'M20,0 L20,20',
  END_EAST: 'M0,20 L20,20',
  END_WEST: 'M40,20 L20,20'
};

// Helper function to render river overlay
const renderRiverOverlay = (tile) => {
  if (!tile.hasRiver || tile.biome === 'water') return null;

  const pathD = pathSVGs[tile.riverDirection] || pathSVGs.NORTH_SOUTH;

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1
      }}
      viewBox="0 0 40 40"
    >
      <path
        d={pathD}
        stroke="#4169E1" // Royal Blue for rivers
        strokeWidth="4"   // Slightly thicker than paths
        fill="none"
        opacity="0.8"
        strokeLinecap="round"
      />
    </svg>
  );
};

// Helper function to render path overlay
const renderPathOverlay = (tile) => {
  if (!tile.hasPath) return null;

  const pathD = pathSVGs[tile.pathDirection] || pathSVGs.NORTH_SOUTH;

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1,
        transform: (tile.biome === 'beach' && tile.beachDirection !== undefined)
          ? BEACH_SHIFT[tile.beachDirection]
          : 'none'
      }}
      viewBox="0 0 40 40"
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
};

const WorldMapDisplay = ({ mapData, playerPosition, onTileClick, firstHero, visibleMilestonePois }) => {
  if (!mapData || mapData.length === 0) {
    return <div>Loading map...</div>;
  }

  const mapHeight = mapData.length;
  const mapWidth = mapData[0].length;

  // No grid gap so the WorldMapLabels overlay (which positions names at x*TILE) aligns
  // exactly with the tiles; the container is position:relative so that overlay anchors here.
  const gridStyle = {
    position: 'relative',
    display: 'grid',
    gridTemplateColumns: `repeat(${mapWidth}, ${TILE}px)`,
    gridTemplateRows: `repeat(${mapHeight}, ${TILE}px)`,
    border: '1px solid #ccc',
    width: `${mapWidth * TILE}px`,
    margin: '20px auto', // Center the map
  };

  // Place names for the scroll-label overlay: towns, named mountains (first in range),
  // and visible milestone POIs.
  const labels = [];

  return (
    <div className="world-map-container">

      <div style={gridStyle} className="world-map-grid">
        {mapData.flat().map((tile) => { // Flatten the 2D array for easier mapping
          const isPlayerHere = playerPosition.x === tile.x && playerPosition.y === tile.y;

          // Hide milestone POIs (sprite + name) that aren't unlocked yet
          const isMilestoneHidden = tile.milestonePoi && visibleMilestonePois && !visibleMilestonePois.has(tile.poi);

          const beachShift = (tile.biome === 'beach' && tile.beachDirection !== undefined)
            ? BEACH_SHIFT[tile.beachDirection]
            : 'none';

          // POI sprite overlay (town/forest/mountain/hills/cave_entrance/ruins/milestone)
          const poi = isMilestoneHidden ? null : poiSprite(tile);

          // Collect a name label for this tile if applicable
          const labelText = tile.townName
            || (tile.mountainName && tile.isFirstMountainInRange ? tile.mountainName : null)
            || (tile.milestonePoi && tile.poiName && !isMilestoneHidden ? tile.poiName : null);
          if (labelText) {
            labels.push({
              x: tile.x,
              y: tile.y,
              text: labelText,
              kind: tile.milestonePoi ? 'milestone' : tile.townName ? 'town' : 'mountain',
            });
          }

          return (
            <div
              key={`${tile.x}-${tile.y}`}
              className={`map-tile ${isPlayerHere ? 'player-tile' : ''} ${!tile.isExplored ? 'unexplored' : ''}`}
              style={{
                backgroundImage: biomeBackground(tile, tile.x, tile.y),
                backgroundSize: 'cover',
                cursor: 'pointer', // Indicate clickable
                position: 'relative', // For overlays / player marker positioning
              }}
              onClick={() => onTileClick(tile.x, tile.y)}
              title={`${tile.townName || tile.mountainName || `(${tile.x}, ${tile.y})`} - ${tile.biome}${tile.poi ? ` (${tile.poi})` : ''}${tile.townSize ? ` [${tile.townSize}]` : ''}${tile.isExplored ? ' (Explored)' : ''}`} // Tooltip
            >
              {/* Render river overlay (below POI) */}
              {renderRiverOverlay(tile)}

              {/* Render path overlay (below POI) */}
              {renderPathOverlay(tile)}

              {/* POI sprite overlay */}
              {poi && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 2,
                    backgroundImage: poi,
                    backgroundSize: 'contain',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center',
                    pointerEvents: 'none',
                    transform: beachShift,
                  }}
                />
              )}

              {/* Display player marker when on this tile */}
              {isPlayerHere && (
                firstHero ? (
                  <div
                    className="player-marker-portrait"
                    style={{
                      zIndex: 3,
                      transform: beachShift
                    }}
                  >
                    <img
                      src={resolveProfilePicture(firstHero.profilePicture)}
                      alt={firstHero.characterName}
                      loading="lazy"
                      width="40"
                      height="40"
                    />
                    <div className="player-marker-pointer"></div>
                  </div>
                ) : (
                  <span style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: `translate(-50%, -50%) ${beachShift === 'none' ? '' : beachShift}`.trim(),
                    fontSize: '20px',
                    zIndex: 3,
                    pointerEvents: 'none',
                  }}>⭐</span>
                )
              )}
            </div>
          );
        })}

        {/* Name labels drawn as parchment scrolls over the (position:relative) grid */}
        <WorldMapLabels labels={labels} tile={TILE} />
      </div>
    </div>
  );
};

export default WorldMapDisplay;
