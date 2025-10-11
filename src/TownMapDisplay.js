import React from 'react';
import { getTownTileEmoji } from './townMapGenerator';

/**
 * TownMapDisplay - Renders a town map with paths, buildings, and player position
 * @param {Object} townMapData - Town map data from generateTownMap()
 * @param {Object} playerPosition - Player position {x, y} within town
 * @param {Function} onTileClick - Optional callback for tile clicks
 * @param {Function} onLeaveTown - Optional callback for leave town button
 * @param {boolean} showLeaveButton - Whether to show the leave town button
 * @param {Object} firstHero - First hero for player portrait display
 * @param {string} townError - Error message to display in town map
 */
const TownMapDisplay = ({ townMapData, playerPosition, onTileClick, onLeaveTown, showLeaveButton = true, firstHero, townError }) => {
  if (!townMapData) return null;

  return (
    <div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${townMapData.width}, 30px)`,
        gap: '1px',
        border: '1px solid #ccc',
        width: `${townMapData.width * 30 + (townMapData.width - 1)}px`,
        margin: '20px auto',
        backgroundColor: '#eee',
        fontSize: '16px'
      }}>
        {townMapData.mapData.flat().map((tile, index) => {
          const row = Math.floor(index / townMapData.width);
          const col = index % townMapData.width;
          const isPlayer = playerPosition && playerPosition.x === col && playerPosition.y === row;
          const isPath = tile.type === 'dirt_path' || tile.type === 'stone_path';
          const isWall = tile.type === 'wall';
          const isKeepWall = tile.type === 'keep_wall';
          const pathColor = tile.type === 'dirt_path' ? '#8B4513' : '#808080';
          const wallColor = '#A9A9A9';
          const keepWallColor = '#696969';
          
          // Calculate if tile is clickable
          const distance = playerPosition ? Math.abs(col - playerPosition.x) + Math.abs(row - playerPosition.y) : 999;
          const isInRange = distance > 0 && distance <= 5;
          const isClickable = onTileClick && isInRange && tile.walkable && !isPlayer;
          
          // Check adjacent tiles for path/wall connections
          let hasPathNorth = false, hasPathSouth = false, hasPathEast = false, hasPathWest = false;
          let hasWallNorth = false, hasWallSouth = false, hasWallEast = false, hasWallWest = false;
          let hasKeepWallNorth = false, hasKeepWallSouth = false, hasKeepWallEast = false, hasKeepWallWest = false;
          
          if (isPath) {
            const north = row > 0 ? townMapData.mapData[row - 1][col] : null;
            const south = row < townMapData.height - 1 ? townMapData.mapData[row + 1][col] : null;
            const east = col < townMapData.width - 1 ? townMapData.mapData[row][col + 1] : null;
            const west = col > 0 ? townMapData.mapData[row][col - 1] : null;
            
            hasPathNorth = north && (north.type === 'dirt_path' || north.type === 'stone_path' || north.type === 'building' || north.type === 'town_square' || north.type === 'keep');
            hasPathSouth = south && (south.type === 'dirt_path' || south.type === 'stone_path' || south.type === 'building' || south.type === 'town_square' || south.type === 'keep');
            hasPathEast = east && (east.type === 'dirt_path' || east.type === 'stone_path' || east.type === 'building' || east.type === 'town_square' || east.type === 'keep');
            hasPathWest = west && (west.type === 'dirt_path' || west.type === 'stone_path' || west.type === 'building' || west.type === 'town_square' || west.type === 'keep');
          }
          
          if (isWall) {
            const north = row > 0 ? townMapData.mapData[row - 1][col] : null;
            const south = row < townMapData.height - 1 ? townMapData.mapData[row + 1][col] : null;
            const east = col < townMapData.width - 1 ? townMapData.mapData[row][col + 1] : null;
            const west = col > 0 ? townMapData.mapData[row][col - 1] : null;
            
            hasWallNorth = north && north.type === 'wall';
            hasWallSouth = south && south.type === 'wall';
            hasWallEast = east && east.type === 'wall';
            hasWallWest = west && west.type === 'wall';
          }
          
          if (isKeepWall) {
            const north = row > 0 ? townMapData.mapData[row - 1][col] : null;
            const south = row < townMapData.height - 1 ? townMapData.mapData[row + 1][col] : null;
            const east = col < townMapData.width - 1 ? townMapData.mapData[row][col + 1] : null;
            const west = col > 0 ? townMapData.mapData[row][col - 1] : null;
            
            hasKeepWallNorth = north && north.type === 'keep_wall';
            hasKeepWallSouth = south && south.type === 'keep_wall';
            hasKeepWallEast = east && east.type === 'keep_wall';
            hasKeepWallWest = west && west.type === 'keep_wall';
          }

          return (
            <div
              key={index}
              style={{
                backgroundColor: tile.type === 'grass' ? '#90EE90' : 
                               tile.type === 'stone_path' ? '#90EE90' :
                               tile.type === 'dirt_path' ? '#90EE90' :
                               tile.type === 'wall' ? '#90EE90' :
                               tile.type === 'keep_wall' ? '#90EE90' :
                               tile.type === 'town_square' ? '#E0E0E0' :
                               tile.type === 'building' ? '#90EE90' : '#FFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                outline: isPlayer ? '2px solid yellow' : 
                         tile.isEntry ? '2px solid yellow' : 'none',
                outlineOffset: '-2px',
                position: 'relative',
                width: '30px',
                height: '30px',
                cursor: isClickable ? 'pointer' : 'default'
              }}
              onClick={() => isClickable && onTileClick(col, row)}
              title={`(${tile.x}, ${tile.y}) - ${tile.type}${tile.buildingType ? ` (${tile.buildingType})` : ''}${isInRange ? ` [${distance} tiles away]` : ''}`}
            >
              {/* Path rendering */}
              {isPath && (
                <>
                  {/* North segment - only if there's a path north */}
                  {hasPathNorth && (
                    <div style={{
                      position: 'absolute',
                      width: '4px',
                      height: '50%',
                      backgroundColor: pathColor,
                      left: '50%',
                      top: '0',
                      transform: 'translateX(-50%)'
                    }} />
                  )}
                  {/* South segment - only if there's a path south */}
                  {hasPathSouth && (
                    <div style={{
                      position: 'absolute',
                      width: '4px',
                      height: '50%',
                      backgroundColor: pathColor,
                      left: '50%',
                      bottom: '0',
                      transform: 'translateX(-50%)'
                    }} />
                  )}
                  {/* East segment - only if there's a path east */}
                  {hasPathEast && (
                    <div style={{
                      position: 'absolute',
                      height: '4px',
                      width: '50%',
                      backgroundColor: pathColor,
                      top: '50%',
                      right: '0',
                      transform: 'translateY(-50%)'
                    }} />
                  )}
                  {/* West segment - only if there's a path west */}
                  {hasPathWest && (
                    <div style={{
                      position: 'absolute',
                      height: '4px',
                      width: '50%',
                      backgroundColor: pathColor,
                      top: '50%',
                      left: '0',
                      transform: 'translateY(-50%)'
                    }} />
                  )}
                  {/* Center dot only for corners/intersections (2+ connections) */}
                  {(hasPathNorth || hasPathSouth) && (hasPathEast || hasPathWest) && (
                    <div style={{
                      position: 'absolute',
                      width: '6px',
                      height: '6px',
                      backgroundColor: pathColor,
                      borderRadius: '50%'
                    }} />
                  )}
                </>
              )}
              {/* Wall rendering */}
              {isWall && (
                <>
                  {hasWallNorth && (
                    <div style={{ position: 'absolute', width: '12px', height: '50%', backgroundColor: wallColor, left: '50%', top: '0', transform: 'translateX(-50%)' }} />
                  )}
                  {hasWallSouth && (
                    <div style={{ position: 'absolute', width: '12px', height: '50%', backgroundColor: wallColor, left: '50%', bottom: '0', transform: 'translateX(-50%)' }} />
                  )}
                  {hasWallEast && (
                    <div style={{ position: 'absolute', height: '12px', width: '50%', backgroundColor: wallColor, top: '50%', right: '0', transform: 'translateY(-50%)' }} />
                  )}
                  {hasWallWest && (
                    <div style={{ position: 'absolute', height: '12px', width: '50%', backgroundColor: wallColor, top: '50%', left: '0', transform: 'translateY(-50%)' }} />
                  )}
                  {(hasWallNorth || hasWallSouth) && (hasWallEast || hasWallWest) && (
                    <div style={{ position: 'absolute', width: '14px', height: '14px', backgroundColor: wallColor, borderRadius: '2px' }} />
                  )}
                </>
              )}
              {/* Keep wall rendering */}
              {isKeepWall && (
                <>
                  {hasKeepWallNorth && (
                    <div style={{ position: 'absolute', width: '4px', height: '50%', backgroundColor: keepWallColor, left: '50%', top: '0', transform: 'translateX(-50%)' }} />
                  )}
                  {hasKeepWallSouth && (
                    <div style={{ position: 'absolute', width: '4px', height: '50%', backgroundColor: keepWallColor, left: '50%', bottom: '0', transform: 'translateX(-50%)' }} />
                  )}
                  {hasKeepWallEast && (
                    <div style={{ position: 'absolute', height: '4px', width: '50%', backgroundColor: keepWallColor, top: '50%', right: '0', transform: 'translateY(-50%)' }} />
                  )}
                  {hasKeepWallWest && (
                    <div style={{ position: 'absolute', height: '4px', width: '50%', backgroundColor: keepWallColor, top: '50%', left: '0', transform: 'translateY(-50%)' }} />
                  )}
                  {(hasKeepWallNorth || hasKeepWallSouth) && (hasKeepWallEast || hasKeepWallWest) && (
                    <div style={{ position: 'absolute', width: '6px', height: '6px', backgroundColor: keepWallColor, borderRadius: '50%' }} />
                  )}
                </>
              )}
              {/* Emoji/POI */}
              {!isPlayer && (
                <span style={{ position: 'relative', zIndex: 2 }}>
                  {getTownTileEmoji(tile)}
                </span>
              )}
              {/* Player portrait marker */}
              {isPlayer && firstHero && (
                <div className="player-marker-portrait" style={{ zIndex: 3 }}>
                  <img src={firstHero.profilePicture} alt={firstHero.characterName} />
                  <div className="player-marker-pointer"></div>
                </div>
              )}
              {/* Fallback star if no hero */}
              {isPlayer && !firstHero && (
                <span style={{ position: 'relative', zIndex: 2 }}>⭐</span>
              )}
            </div>
          );
        })}
      </div>
      {townError && (
        <div style={{ 
          textAlign: 'center', 
          marginTop: '10px', 
          padding: '10px', 
          backgroundColor: '#fee', 
          border: '1px solid #fcc',
          borderRadius: '4px',
          color: '#c00',
          fontSize: '14px'
        }}>
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
    </div>
  );
};

export default TownMapDisplay;
