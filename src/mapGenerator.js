// src/mapGenerator.js

// Simple Placeholder Map Generator

export const generateMapData = (width = 10, height = 10) => {
  const mapData = [];

  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      let biome = 'plains';
      let poi = null;
      let descriptionSeed = "Open fields";

      // Simple pattern: Add a patch of forest in the middle
      if (x >= 3 && x < 7 && y >= 3 && y < 7) {
        biome = 'forest';
        descriptionSeed = "Dense woods";
      }

      // Add a 'starting town' POI
      if (x === 1 && y === 1) {
        poi = 'town';
        biome = 'plains'; // Ensure town is on plains
        descriptionSeed = "A small village";
      }

      // Add a 'cave' POI
       if (x === 6 && y === 6) {
         poi = 'cave_entrance';
         biome = 'forest'; // Ensure cave is in forest
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
