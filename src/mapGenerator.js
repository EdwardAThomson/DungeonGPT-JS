// src/mapGenerator.js

// Deterministic Map Generator
// Creates a varied world map with forests, mountains, and towns

export const generateMapData = (width = 10, height = 10) => {
  const mapData = [];

  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      let biome = 'plains';
      let poi = null;
      let descriptionSeed = "Open fields";

      // Scattered forest tiles (trees on plains-colored background)
      // Top-left forest cluster
      if ((x === 2 && y === 0) || (x === 3 && y === 1) || (x === 1 && y === 2)) {
        poi = 'forest';
        descriptionSeed = "Dense woods";
      }
      
      // Middle forest cluster
      if ((x === 5 && y === 4) || (x === 6 && y === 5) || (x === 4 && y === 5)) {
        poi = 'forest';
        descriptionSeed = "Ancient forest";
      }
      
      // Bottom-right forest cluster
      if ((x === 8 && y === 7) || (x === 7 && y === 8) || (x === 9 && y === 8)) {
        poi = 'forest';
        descriptionSeed = "Wild woods";
      }

      // Mountain tiles scattered across the map
      if ((x === 7 && y === 2) || (x === 8 && y === 3)) {
        poi = 'mountain';
        descriptionSeed = "Rocky peaks";
      }
      
      if ((x === 2 && y === 6) || (x === 3 && y === 7)) {
        poi = 'mountain';
        descriptionSeed = "Mountain range";
      }

      // Towns - multiple settlements across the map
      // Starting town
      if (x === 1 && y === 1) {
        poi = 'town';
        descriptionSeed = "A small village";
      }
      
      // Eastern town
      if (x === 8 && y === 1) {
        poi = 'town';
        descriptionSeed = "A trading post";
      }
      
      // Southern town
      if (x === 4 && y === 8) {
        poi = 'town';
        descriptionSeed = "A farming hamlet";
      }

      // Cave entrance in the mountains
      if (x === 7 && y === 3) {
        poi = 'cave_entrance';
        descriptionSeed = "A dark cave entrance";
      }

      row.push({
        x,
        y,
        biome,
        poi,
        descriptionSeed,
        isExplored: false, // Start unexplored
      });
    }
    mapData.push(row);
  }

  return mapData;
};

// Helper function to get tile data (optional but helpful)
export const getTile = (mapData, x, y) => {
  if (mapData && y >= 0 && y < mapData.length && x >= 0 && x < mapData[y].length) {
    return mapData[y][x];
  }
  console.warn(`Attempted to get invalid tile coordinates: ${x}, ${y}`);
  return null; // Or return a default 'void' tile object
};
