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
  town: '🏡',        // Town/house emoji
  cave_entrance: '🕳️', // Cave entrance
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
          let poiContent = tile.poi ? poiEmojis[tile.poi] || tile.poi : null;
          
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
              title={`(${tile.x}, ${tile.y}) - ${tile.biome}${tile.poi ? ` (${tile.poi})` : ''}${tile.isExplored ? ' (Explored)' : ''}`} // Tooltip
            >
              {/* Display POI emoji if it exists */}
              {poiContent}
              {/* Display player marker when on this tile */}
              {isPlayerHere && firstHero && (
                <div className="player-marker-portrait">
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
