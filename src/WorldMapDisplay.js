import React from 'react';

// Basic styling will be needed in App.css
const tileStyles = {
  plains: { backgroundColor: '#c3e6cb' }, // Light green
  forest: { backgroundColor: '#28a745' }, // Darker green
  water: { backgroundColor: '#007bff' }, // Blue
  mountains: { backgroundColor: '#6c757d' }, // Grey
  town: '🏡',
  cave_entrance: '🕳️',
  // Add more as needed
};

const WorldMapDisplay = ({ mapData, playerPosition, onTileClick }) => {
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

  return (
    <div className="world-map-container">
       <h4>World Map</h4>
      <div style={gridStyle} className="world-map-grid">
        {mapData.flat().map((tile) => { // Flatten the 2D array for easier mapping
          const isPlayerHere = playerPosition.x === tile.x && playerPosition.y === tile.y;
          const tileStyle = tileStyles[tile.biome] || {}; // Get biome background color
          const poiContent = tile.poi ? tileStyles[tile.poi] || tile.poi : null; // Get POI emoji

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
              {isPlayerHere && <span className="player-marker">🧙</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WorldMapDisplay;
