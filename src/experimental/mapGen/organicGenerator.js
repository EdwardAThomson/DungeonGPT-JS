import { generateHeightMap } from '../utils/noise.js';

/**
 * Experimental Organic Terrain Generator
 * Focuses on creating large landmasses and realistic biomes
 */
export const generateOrganicMap = (width = 50, height = 50, seed = null, options = {}) => {
    const {
        mountainThreshold = 0.8,
        forestThreshold = 0.3,
        hillDensity = 50,    // 0-100
        waterLevel = 50      // 0-100
    } = options;
    const generationSeed = seed !== null ? seed : Math.floor(Math.random() * 1000000);

    // 1. Generate primary heightmap (continent shape)
    const continentMap = generateHeightMap(width, height, generationSeed, {
        octaves: 4,
        persistence: 0.55,
        scale: 0.05
    });

    // 2. Generate medium-scale noise for rolling hills
    const hillsMap = generateHeightMap(width, height, generationSeed + 2, {
        octaves: 3,
        persistence: 0.5,
        scale: 0.12
    });

    // 3. Generate fine noise for surface detail
    const detailMap = generateHeightMap(width, height, generationSeed + 1, {
        octaves: 2,
        persistence: 0.5,
        scale: 0.25
    });

    const mapData = [];

    for (let y = 0; y < height; y++) {
        const row = [];
        for (let x = 0; x < width; x++) {
            // 1. Biome Height: Large scale shape
            const biomeH = (continentMap[y][x] * 0.8) + (hillsMap[y][x] * 0.2);

            // 2. Relief Height: Local topographical variation
            // Map hillDensity (0-100) to a sensible multiplier (0 to 1.5)
            const reliefMultiplier = (hillDensity / 100) * 1.5;
            const reliefH = ((hillsMap[y][x] * 0.6) + (detailMap[y][x] * 0.4)) * reliefMultiplier;

            // 3. Combined Base Height
            let h = biomeH + (reliefH * 0.1);

            // Adjust contrast
            h *= 1.2;

            // Apply exponential "drama" to land
            if (h > 0) {
                h = Math.pow(h, 1.1);
                // Add extra "Hill Relief" boost to land only based on density
                h += reliefH * 0.35;
            }

            let biome = 'plains';
            let poi = null;

            // Integrated mountain logic: gradual transition
            const mountainStart = mountainThreshold - 0.25;
            if (h > mountainStart) {
                const t = (h - mountainStart) / 0.25;
                h += Math.pow(t, 2) * 0.6;
            }

            // Sea Level Adjustment: Map waterLevel (0-100) to a threshold offset (-0.3 to 0.3)
            // 50 = neutral, 100 = high water, 0 = dry land
            const seaOffset = (waterLevel - 50) * 0.008;

            // Organic thresholds with sea-level offset
            if (h < -0.4 + seaOffset) {
                biome = 'deep_water';
            } else if (h < -0.1 + seaOffset) {
                biome = 'water';
            } else if (h < 0.0 + seaOffset) {
                biome = 'beach';
                if (detailMap[y][x] > (0.85 - (forestThreshold * 0.2))) poi = 'forest';
            } else if (h < mountainThreshold) {
                biome = 'plains';
                if (detailMap[y][x] > (0.85 - forestThreshold)) poi = 'forest';
            } else {
                biome = 'mountain';

                // Central Peak Logic: pyramid only on highest cores
                const peakThreshold = mountainThreshold + 0.18;
                if (h > peakThreshold) {
                    poi = 'mountain';
                }

                if (h < peakThreshold && detailMap[y][x] > (0.95 - (forestThreshold * 0.1))) {
                    poi = 'forest';
                }
            }

            row.push({
                x,
                y,
                height: h,
                elevation: (h + 0.5), // Use final height for feature scaling
                biome,
                poi,
                isExplored: true
            });
        }
        mapData.push(row);
    }

    return mapData;
};
