import React, { useState } from 'react';
import { tileBackground } from '../utils/townTileArt';
import BuildingModal from './BuildingModal';
import { createLogger } from '../utils/logger';
import { resolveProfilePicture } from '../utils/assetHelper';

const logger = createLogger('town-map-display');

const TILE = 30;

// Decorations the tileset doesn't draw itself are overlaid as emoji (buildings/terrain
// are fully rendered by the tileset, so only POI markers ride on top). 'well' is kept
// for backwards-compatibility with old saves generated before the fountain change.
const POI_EMOJI = { fountain: '⛲', well: '🪣', tree: '🌳', bush: '🌿', flowers: '🌸' };

/**
 * TownMapDisplay - Renders a town map with the SVG tileset, buildings, and player.
 * @param {Object} townMapData - Town map data from generateTownMap()
 * @param {Object} playerPosition - Player position {x, y} within town
 * @param {Function} onTileClick - Optional callback for tile clicks
 * @param {Function} onLeaveTown - Optional callback for leave town button
 * @param {boolean} showLeaveButton - Whether to show the leave town button
 * @param {Object} firstHero - First hero for player portrait display
 * @param {string} townError - Error message to display in town map
 * @param {Function} markBuildingDiscovered - Callback to mark a building as seen
 */
const TownMapDisplay = ({ townMapData, playerPosition, onTileClick, onLeaveTown, showLeaveButton = true, firstHero, townError, markBuildingDiscovered, onQuestItemFound, onRest, onResurrect, party }) => {
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [distanceWarning, setDistanceWarning] = useState(false);

  if (!townMapData) return null;

  const discoveredBuildings = townMapData.discoveredBuildings || [];
  const { width, height, mapData } = townMapData;
  // Biome theme drives the ground palette (sand for desert). Older cached town maps
  // lack this field and fall back to grassland — unchanged rendering.
  const townTheme = townMapData.theme || 'grassland';

  const typeAt = (c, r) => (r >= 0 && r < height && c >= 0 && c < width && mapData[r][c]) ? mapData[r][c].type : null;

  const handleBuildingClick = (tile) => {
    if (!playerPosition) return;

    // Calculate distance
    const distance = Math.abs(tile.x - playerPosition.x) + Math.abs(tile.y - playerPosition.y);
    const coordString = `${tile.x},${tile.y}`;
    const isDiscovered = discoveredBuildings.includes(coordString);

    logger.debug('Building click debug:', { tileCoords: coordString, discoveredBuildings, isDiscovered, distance });

    // Allow seeing info if close enough (within 2 tiles) OR if already discovered
    if (distance <= 2 || isDiscovered) {
      // Find NPCs in this building (workers here OR residents whose home is here)
      const buildingNpcs = (townMapData.npcs || []).filter(npc => {
        if (!npc.location) return false;
        const isWorkingHere = npc.location.x === tile.x && npc.location.y === tile.y;
        const livesHere = npc.location.homeCoords &&
          npc.location.homeCoords.x === tile.x && npc.location.homeCoords.y === tile.y;
        return isWorkingHere || livesHere;
      });

      setSelectedBuilding({ ...tile, npcs: buildingNpcs });

      // Mark as discovered if not already and within range
      if (!isDiscovered && distance <= 2 && markBuildingDiscovered) {
        markBuildingDiscovered(townMapData.townName, tile.x, tile.y);
      }
    } else {
      // Too far and not discovered - show modal warning
      setDistanceWarning(true);
    }
  };

  return (
    <div>
      <div style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: `repeat(${width}, ${TILE}px)`,
        gap: 0,
        border: '2px solid #5d4530',
        borderRadius: 4,
        width: `${width * TILE}px`,
        margin: '20px auto',
        boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
        fontSize: '16px',
      }}>
        {mapData.flat().map((tile, index) => {
          const row = Math.floor(index / width);
          const col = index % width;
          const isPlayer = playerPosition && playerPosition.x === col && playerPosition.y === row;
          const isBuilding = tile.type === 'building';

          const distance = playerPosition ? Math.abs(col - playerPosition.x) + Math.abs(row - playerPosition.y) : 999;
          const isInRange = distance > 0 && distance <= 5;
          const isDiscovered = discoveredBuildings.includes(`${tile.x},${tile.y}`);
          const canSeeName = distance <= 2 || isDiscovered;
          const displayName = canSeeName && tile.buildingName ? tile.buildingName : (tile.buildingType || tile.type);
          const isClickable = onTileClick && isInRange && (tile.walkable || isBuilding) && !isPlayer;

          const neighbours = { n: typeAt(col, row - 1), e: typeAt(col + 1, row), s: typeAt(col, row + 1), w: typeAt(col - 1, row) };
          const poiEmoji = tile.poi ? (POI_EMOJI[tile.poi] || null) : null;

          return (
            <div
              key={index}
              style={{
                width: TILE,
                height: TILE,
                backgroundImage: tileBackground(tile, neighbours, col, row, townTheme),
                backgroundSize: 'cover',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                outline: (isPlayer || tile.isEntry) ? '2px solid yellow' : 'none',
                outlineOffset: '-2px',
                cursor: isClickable ? 'pointer' : 'default',
              }}
              onClick={() => {
                if (isBuilding) {
                  handleBuildingClick(tile);
                } else if (isClickable) {
                  onTileClick(col, row);
                }
              }}
              title={`(${tile.x}, ${tile.y}) - ${displayName}${isInRange ? ` [${distance} tiles away]` : ''}${isDiscovered ? ' (Discovered)' : ''}`}
            >
              {poiEmoji && (
                <span style={{ position: 'relative', zIndex: 2, fontSize: 18, filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.45))' }}>
                  {poiEmoji}
                </span>
              )}
            </div>
          );
        })}
        {/* Animated player marker overlay */}
        {playerPosition && (
          <div
            style={{
              position: 'absolute',
              left: `${playerPosition.x * TILE}px`,
              top: `${playerPosition.y * TILE}px`,
              width: TILE,
              height: TILE,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 10,
              transition: 'left 0.6s ease-in-out, top 0.6s ease-in-out',
            }}
          >
            {firstHero ? (
              <div className="player-marker-portrait">
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
              <span style={{ fontSize: '16px' }}>⭐</span>
            )}
          </div>
        )}
      </div>
      {townError && (
        <div className="message system error" style={{ margin: '10px auto', display: 'block', maxWidth: '400px' }}>
          ⚠️ {townError}
        </div>
      )}
      {showLeaveButton && onLeaveTown && (
        <div style={{ textAlign: 'center', marginTop: '10px' }}>
          <button onClick={onLeaveTown} className="secondary-button">
            Leave Town
          </button>
        </div>
      )}

      {selectedBuilding && (
        <BuildingModal
          building={selectedBuilding}
          npcs={selectedBuilding.npcs}
          onClose={() => setSelectedBuilding(null)}
          firstHero={firstHero}
          onQuestItemFound={onQuestItemFound}
          onRest={onRest}
          onResurrect={onResurrect}
          party={party}
        />
      )}

      {distanceWarning && (
        <div className="modal-overlay" onClick={() => setDistanceWarning(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <h2>Too Far Away</h2>
            <p>You are too far away to identify this building clearly. Move closer to discover what it is.</p>
            <div style={{ textAlign: 'center', marginTop: '20px' }}>
              <button onClick={() => setDistanceWarning(false)} className="primary-button">
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TownMapDisplay;
