import fs from 'fs';
import path from 'path';
import { generateTownMap } from './townMapGenerator';
import { buildingTile, BUILDING_TYPES } from './townTileArt';

const ASSET_DIR = path.resolve(__dirname, '../../public/assets/buildings');
// house + manor use coordinate-keyed interior variants, not a {type}.webp file.
const hasInteriorImage = (type) =>
  type === 'house' || type === 'manor' || fs.existsSync(path.join(ASSET_DIR, `${type}.webp`));

const collectPlacedTypes = (sizes, seeds, water = null) => {
  const set = new Set();
  sizes.forEach((size) => {
    for (let s = 0; s < seeds; s++) {
      const t = generateTownMap(size, size, 'south', s, false, 'NORTH_SOUTH', 'grassland', water);
      t.mapData.flat().forEach((tile) => {
        if (tile.type === 'building' && tile.buildingType) set.add(tile.buildingType);
      });
    }
  });
  return set;
};

describe('building art + placement wiring', () => {
  test('every placed building type has a map icon (SVG) AND an interior image', () => {
    const types = collectPlacedTypes(['hamlet', 'village', 'town', 'city'], 30);
    expect(types.size).toBeGreaterThan(10);
    types.forEach((type) => {
      expect(buildingTile(type).startsWith('url("data:image/svg+xml,')).toBe(true);
      expect(hasInteriorImage(type)).toBe(true); // no placed building shows the placeholder
    });
  });

  test('BUILDING_TYPES (the gallery source) covers every type and renders valid SVG', () => {
    ['apothecary', 'fletcher', 'harbormaster', 'jail', 'magetower', 'mill', 'shrine', 'stables', 'tailor', 'townhall',
     'house', 'keep', 'manor', 'market', 'temple', 'bank', 'guild']
      .forEach((t) => expect(BUILDING_TYPES).toContain(t));
    BUILDING_TYPES.forEach((t) => expect(buildingTile(t).startsWith('url("data:image/svg+xml,')).toBe(true));
  });

  test('each new building type has its OWN distinct icon (no reused silhouettes)', () => {
    const newTypes = ['apothecary', 'fletcher', 'harbormaster', 'jail', 'magetower', 'mill', 'shrine', 'stables', 'tailor', 'townhall'];
    const svgs = newTypes.map((t) => buildingTile(t));
    expect(new Set(svgs).size).toBe(newTypes.length);          // all distinct from each other
    const house = buildingTile('house');
    svgs.forEach((s) => expect(s).not.toBe(house));            // and not the default fallback
  });

  test('the newly-wired building types actually get placed', () => {
    const types = collectPlacedTypes(['hamlet', 'village', 'town', 'city'], 60);
    ['mill', 'stables', 'shrine', 'tailor', 'fletcher', 'apothecary', 'townhall', 'jail', 'magetower']
      .forEach((t) => expect(types.has(t)).toBe(true));
  });

  test('harbormaster appears only in waterside towns/cities', () => {
    const dry = collectPlacedTypes(['town', 'city'], 40, null);
    expect(dry.has('harbormaster')).toBe(false);
    const wet = collectPlacedTypes(['town', 'city'], 40, { kind: 'coast', edges: { N: false, E: false, S: true, W: false } });
    expect(wet.has('harbormaster')).toBe(true);
  });

  test('waterfront buildings sit ON the shore (next to water/beach)', () => {
    const water = { kind: 'coast', edges: { N: false, E: false, S: true, W: false } };
    const nextToWater = (mapData, x, y) => [[0, -1], [0, 1], [-1, 0], [1, 0]].some(([dx, dy]) => {
      const t = mapData[y + dy] && mapData[y + dy][x + dx];
      return t && (t.type === 'water' || t.type === 'beach');
    });
    let harbours = 0;
    let dockWarehouses = 0;
    let inlandWarehouses = 0;
    for (let s = 0; s < 40; s++) {
      const town = generateTownMap('city', 'Port', 'south', s, false, 'NORTH_SOUTH', 'grassland', water);
      town.mapData.flat().forEach((tile) => {
        if (tile.type !== 'building') return;
        const shore = nextToWater(town.mapData, tile.x, tile.y);
        if (tile.buildingType === 'harbormaster') { harbours++; expect(shore).toBe(true); }
        if (tile.buildingType === 'warehouse') { shore ? dockWarehouses++ : inlandWarehouses++; }
      });
    }
    expect(harbours).toBeGreaterThan(0);        // harbours got placed
    expect(dockWarehouses).toBeGreaterThan(0);  // some warehouses are dockside
  });

  test('shore-averse buildings (stables/barn/bank) never sit on the waterfront', () => {
    const water = { kind: 'coast', edges: { N: false, E: false, S: true, W: false } };
    const nextToWater = (md, x, y) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const t = md[y + dy] && md[y + dy][x + dx];
        if (t && (t.type === 'water' || t.type === 'beach')) return true;
      }
      return false;
    };
    for (let s = 0; s < 40; s++) {
      ['village', 'town', 'city'].forEach((size) => {
        const t = generateTownMap(size, size, 'south', s, false, 'NORTH_SOUTH', 'grassland', water);
        t.mapData.flat().forEach((tile) => {
          if (tile.type === 'building' && ['stables', 'barn', 'bank'].includes(tile.buildingType)) {
            expect(nextToWater(t.mapData, tile.x, tile.y)).toBe(false);
          }
        });
      });
    }
  });

  const keepInfo = (town) => {
    let keep = null;
    let cornerKeep = false;
    const corners = new Set(['1,1', '18,1', '1,18', '18,18']); // inset-1 from each 20x20 corner
    town.mapData.flat().forEach((tile) => {
      if (tile.type === 'building' && tile.buildingType === 'keep') {
        keep = tile;
        if (corners.has(`${tile.x},${tile.y}`)) cornerKeep = true;
      }
    });
    return { keep, cornerKeep };
  };

  test('every city has a keep; inland cities use the central keep (not a corner)', () => {
    let cornerKeeps = 0;
    for (let s = 0; s < 60; s++) {
      const { keep, cornerKeep } = keepInfo(generateTownMap('city', 'C', 'south', s, false, 'NORTH_SOUTH', 'grassland', null));
      expect(keep).not.toBeNull();
      if (cornerKeep) cornerKeeps++;
    }
    expect(cornerKeeps).toBe(0); // corner placement is NOT the default for inland cities
  });

  test('coastal cities still get a keep, and tuck it into a corner reusing the city walls', () => {
    const water = { kind: 'coast', edges: { N: false, E: false, S: true, W: false } };
    let total = 0;
    let cornerKeeps = 0;
    for (let s = 0; s < 60; s++) {
      const { keep, cornerKeep } = keepInfo(generateTownMap('city', 'C', 'south', s, false, 'NORTH_SOUTH', 'grassland', water));
      if (keep) total++;
      if (cornerKeep) cornerKeeps++;
    }
    expect(total).toBe(60);                  // never lose the keep on the coast
    expect(cornerKeeps).toBeGreaterThan(0);  // corner placement kicks in for coastal cities
  });

  test('the gaol is placed in the authority cluster, near the keep', () => {
    [null, { kind: 'coast', edges: { N: false, E: false, S: true, W: false } }].forEach((w) => {
      for (let s = 0; s < 30; s++) {
        const t = generateTownMap('city', 'C', 'south', s, false, 'NORTH_SOUTH', 'grassland', w);
        let keep = null;
        let jail = null;
        t.mapData.flat().forEach((tile) => {
          if (tile.type === 'building' && tile.buildingType === 'keep') keep = tile;
          if (tile.type === 'building' && tile.buildingType === 'jail') jail = tile;
        });
        expect(keep).not.toBeNull();
        expect(jail).not.toBeNull();
        const dist = Math.max(Math.abs(keep.x - jail.x), Math.abs(keep.y - jail.y));
        expect(dist).toBeLessThanOrEqual(6); // within the keep's spiral search radius
      }
    });
  });

  test('keep walls are tight (adjacent to the keep), never floating in a courtyard', () => {
    // every keep_wall tile must be orthogonally adjacent to the keep building
    const water = { kind: 'coast', edges: { N: false, E: false, S: true, W: false } };
    [null, water].forEach((w) => {
      for (let s = 0; s < 30; s++) {
        const t = generateTownMap('city', 'C', 'south', s, false, 'NORTH_SOUTH', 'grassland', w);
        const { keep } = keepInfo(t);
        if (!keep) continue;
        t.mapData.flat().forEach((tile) => {
          if (tile.type === 'keep_wall') {
            const adj = Math.abs(tile.x - keep.x) <= 1 && Math.abs(tile.y - keep.y) <= 1;
            expect(adj).toBe(true);
          }
        });
      }
    });
  });
});
