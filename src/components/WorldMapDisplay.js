import React from 'react';

// Biome background colors
const biomeColors = {
  plains: { backgroundColor: '#c3e6cb' }, // Light green
  water: { backgroundColor: '#007bff' }, // Blue
};

// POI emojis - displayed on top of biome tiles
const poiEmojis = {
  forest: '🌲',      // Tree emoji on plains-colored tile
  mountain: '⛰️',    // Mountain emoji on plains-colored tile
  cave_entrance: '🕳️', // Cave entrance
  // Town emojis by size
  town_hamlet: '🛖',   // Hamlet
  town_village: '🏡',  // Village
  town_town: '🏘️',    // Town
  town_city: '🏰',     // City
};

// Helper function to get the appropriate town emoji
const getTownEmoji = (tile) => {
  if (tile.poi === 'town') {
    if (tile.townSize) {
      return poiEmojis[`town_${tile.townSize}`] || poiEmojis.town_village;
    }
    // Backward compatibility: if no townSize, default to village emoji
    return poiEmojis.town_village;
  }
  return null;
};

// SVG path definitions for different path directions
const pathSVGs = {
  NORTH_SOUTH: 'M20,0 L20,40',           // Straight vertical
  EAST_WEST: 'M0,20 L40,20',             // Straight horizontal
  NORTH_EAST: 'M20,0 Q20,20 40,20',      // Curved from north to east
  NORTH_WEST: 'M20,0 Q20,20 0,20',       // Curved from north to west
  SOUTH_EAST: 'M20,40 Q20,20 40,20',     // Curved from south to east
  SOUTH_WEST: 'M20,40 Q20,20 0,20',      // Curved from south to west
  INTERSECTION: 'M20,0 L20,40 M0,20 L40,20' // Cross intersection
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
        zIndex: 1
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

const WorldMapDisplay = ({ mapData, playerPosition, onTileClick, firstHero }) => {
  if (!mapData || mapData.length === 0) {
    return <div>Loading map...</div>;
  }

  const mapHeight = mapData.length;
  const mapWidth = mapData[0].length;

  // Calculate grid template styles dynamically
  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(${mapWidth}, 40px)`, // Example: 40px wide tiles
    gridTemplateRows: `repeat(${mapHeight}, 40px)`, // Example: 40px high tiles
    gap: '1px', // Small gap for grid lines effect
    border: '1px solid #ccc',
    width: `${mapWidth * 40 + (mapWidth -1)}px`, // Adjust width based on tile size + gaps
    margin: '20px auto', // Center the map
    backgroundColor: '#eee' // Background for gaps
  };

  // <h4>World Map</h4> // don't need this
  return (
    <div className="world-map-container">
       
      <div style={gridStyle} className="world-map-grid">
        {mapData.flat().map((tile) => { // Flatten the 2D array for easier mapping
          const isPlayerHere = playerPosition.x === tile.x && playerPosition.y === tile.y;
          
          // Handle backward compatibility: old maps had 'forest' as biome, new maps have it as poi
          let tileStyle = biomeColors[tile.biome] || biomeColors.plains;
          let poiContent = null;
          
          // Check if it's a town with size information
          if (tile.poi === 'town') {
            poiContent = getTownEmoji(tile);
          } else if (tile.poi) {
            poiContent = poiEmojis[tile.poi] || tile.poi;
          }
          
          // If biome is 'forest' or 'mountains' (old system), convert to POI emoji
          if (tile.biome === 'forest' && !tile.poi) {
            tileStyle = biomeColors.plains; // Use plains color
            poiContent = poiEmojis.forest; // Show tree emoji
          } else if (tile.biome === 'mountains' && !tile.poi) {
            tileStyle = biomeColors.plains; // Use plains color
            poiContent = poiEmojis.mountain; // Show mountain emoji
          }

          return (
            <div
              key={`${tile.x}-${tile.y}`}
              className={`map-tile ${isPlayerHere ? 'player-tile' : ''} ${!tile.isExplored ? 'unexplored' : ''}`}
              style={{
                  ...tileStyle,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px', // Emoji size
                  cursor: 'pointer', // Indicate clickable
                  position: 'relative', // For player marker positioning
              }}
              onClick={() => onTileClick(tile.x, tile.y)}
              title={`${tile.townName || `(${tile.x}, ${tile.y})`} - ${tile.biome}${tile.poi ? ` (${tile.poi})` : ''}${tile.townSize ? ` [${tile.townSize}]` : ''}${tile.isExplored ? ' (Explored)' : ''}`} // Tooltip
            >
              {/* Render path overlay (below POI) */}
              {renderPathOverlay(tile)}
              
              {/* Display POI emoji if it exists */}
              <span style={{ position: 'relative', zIndex: 2 }}>
                {poiContent}
              </span>
              
              {/* Display player marker when on this tile */}
              {isPlayerHere && firstHero && (
                <div className="player-marker-portrait" style={{ zIndex: 3 }}>
                  <img src={firstHero.profilePicture} alt={firstHero.characterName} />
                  <div className="player-marker-pointer"></div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WorldMapDisplay;
