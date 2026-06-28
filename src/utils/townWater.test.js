import { analyzeTownWater, getTownRoadEdges } from './townWater';
import { generateTownMap } from './townMapGenerator';

// Build a tiny world grid where the centre tile (1,1) is a town and we control its
// neighbours' biomes.
const world = (neighbours) => {
  const plains = () => ({ biome: 'plains' });
  const g = [
    [plains(), plains(), plains()],
    [plains(), { biome: 'plains', poi: 'town' }, plains()],
    [plains(), plains(), plains()],
  ];
  // neighbours: { N,E,S,W,NE,SE,SW,NW } -> tile override
  const pos = { N: [1, 0], E: [2, 1], S: [1, 2], W: [0, 1], NE: [2, 0], SE: [2, 2], SW: [0, 2], NW: [0, 0] };
  Object.entries(neighbours).forEach(([k, v]) => { const [x, y] = pos[k]; g[y][x] = v; });
  return g;
};

const countType = (map, type) => map.flat().filter((t) => t.type === type).length;

describe('analyzeTownWater', () => {
  test('landlocked town returns null', () => {
    expect(analyzeTownWater(world({}), 1, 1)).toBeNull();
  });

  test('lake neighbour -> lake town on that edge', () => {
    const r = analyzeTownWater(world({ E: { biome: 'water', isLake: true } }), 1, 1);
    expect(r).toEqual({ kind: 'lake', edges: { N: false, E: true, S: false, W: false } });
  });

  test('ocean (non-lake water) neighbour -> coast', () => {
    const r = analyzeTownWater(world({ S: { biome: 'water', isLake: false } }), 1, 1);
    expect(r.kind).toBe('coast');
    expect(r.edges.S).toBe(true);
  });

  test('beach neighbour -> coast', () => {
    const r = analyzeTownWater(world({ N: { biome: 'beach' } }), 1, 1);
    expect(r.kind).toBe('coast');
    expect(r.edges.N).toBe(true);
  });

  test('coast wins when both lake and ocean adjacent', () => {
    const r = analyzeTownWater(world({ W: { biome: 'water', isLake: true }, E: { biome: 'water', isLake: false } }), 1, 1);
    expect(r.kind).toBe('coast');
  });

  test('diagonal-only water bites the corner (two edges)', () => {
    const r = analyzeTownWater(world({ SE: { biome: 'water', isLake: true } }), 1, 1);
    expect(r.kind).toBe('lake');
    expect(r.edges.S && r.edges.E).toBe(true);
  });

  test('tolerates out-of-range / missing grid', () => {
    expect(analyzeTownWater(null, 0, 0)).toBeNull();
    expect(analyzeTownWater(world({}), 99, 99)).toBeNull();
  });
});

describe('getTownRoadEdges', () => {
  const roadWorld = (neigh) => {
    const plain = () => ({ biome: 'plains' });
    const g = [
      [plain(), plain(), plain()],
      [plain(), { biome: 'plains', poi: 'town' }, plain()],
      [plain(), plain(), plain()],
    ];
    const pos = { north: [1, 0], east: [2, 1], south: [1, 2], west: [0, 1] };
    Object.entries(neigh).forEach(([d, v]) => { const [x, y] = pos[d]; g[y][x] = v; });
    return g;
  };

  test('no roads -> empty (isolated town)', () => {
    expect(getTownRoadEdges(roadWorld({}), 1, 1)).toEqual([]);
  });

  test('a road that connects back toward the town is an entrance', () => {
    const g = roadWorld({ north: { biome: 'plains', hasPath: true, pathConnections: ['south'] } });
    expect(getTownRoadEdges(g, 1, 1)).toEqual(['north']);
  });

  test('a road merely passing by (not connecting toward the town) is ignored', () => {
    // east neighbour's road runs north, not toward the town (which lies to its west)
    const g = roadWorld({ east: { biome: 'plains', hasPath: true, pathConnections: ['north'] } });
    expect(getTownRoadEdges(g, 1, 1)).toEqual([]);
  });

  test('legacy save without pathConnections: any adjacent road counts', () => {
    const g = roadWorld({ west: { biome: 'plains', hasPath: true } });
    expect(getTownRoadEdges(g, 1, 1)).toEqual(['west']);
  });

  test('two connecting roads -> two entrances', () => {
    const g = roadWorld({
      north: { biome: 'plains', hasPath: true, pathConnections: ['south'] },
      south: { biome: 'plains', hasPath: true, pathConnections: ['north'] },
    });
    expect(getTownRoadEdges(g, 1, 1).sort()).toEqual(['north', 'south']);
  });
});

describe('generateTownMap entrances', () => {
  const onEdge = (pos, w, h) => pos.x === 0 || pos.y === 0 || pos.x === w - 1 || pos.y === h - 1;

  test('legacy single-string entry still works (one south gate)', () => {
    const town = generateTownMap('village', 'Oldtown', 'south', 5, false, 'NORTH_SOUTH', 'grassland', null);
    expect(town.entrances).toHaveLength(1);
    expect(town.entryPoint.y).toBe(town.height - 1);
  });

  test('multiple road edges produce multiple gates on the right borders', () => {
    const town = generateTownMap('town', 'Crossroads', ['north', 'east'], 9, false, 'NORTH_SOUTH', 'grassland', null);
    expect(town.entrances).toHaveLength(2);
    town.entrances.forEach((e) => expect(onEdge(e.pos, town.width, town.height)).toBe(true));
    // north gate on top row, east gate on right column
    expect(town.entrances.some((e) => e.pos.y === 0)).toBe(true);
    expect(town.entrances.some((e) => e.pos.x === town.width - 1)).toBe(true);
  });

  test('corner water does NOT block a road arriving at the dry middle of that edge', () => {
    // A lake biting the SE corner promotes both S and E edges to "wet", but a road still
    // arrives at the centre of the east edge, which is dry — that gate must survive.
    const town = generateTownMap('town', 'Capehold', ['east'], 17, false, 'NORTH_SOUTH', 'grassland',
      { kind: 'lake', edges: { N: false, E: true, S: true, W: false } });
    expect(town.entrances.some((e) => e.pos.x === town.width - 1)).toBe(true);
    expect(town.mapData[town.entryPoint.y][town.entryPoint.x].type).not.toBe('water');
  });

  test('entrances on a water edge are dropped (no spawning in the sea)', () => {
    // request a south entrance, but the south edge is coast -> entrance must move to a dry side
    const town = generateTownMap('village', 'Seagate', ['south'], 12, false, 'NORTH_SOUTH', 'grassland',
      { kind: 'coast', edges: { N: false, E: false, S: true, W: false } });
    expect(town.mapData[town.entryPoint.y][town.entryPoint.x].type).not.toBe('water');
    expect(town.entryPoint.y).not.toBe(town.height - 1); // not the flooded south border
  });
});

describe('generateTownMap with water', () => {
  const water = (kind, edges) => ({ kind, edges: { N: false, E: false, S: false, W: false, ...edges } });

  test('coast town carves water but keeps land for buildings', () => {
    const town = generateTownMap('town', 'Portside', 'south', 123, false, 'NORTH_SOUTH', 'grassland', water('coast', { S: true }));
    const total = town.width * town.height;
    const w = countType(town.mapData, 'water');
    const buildings = countType(town.mapData, 'building');
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThan(total * 0.5); // water never dominates
    expect(buildings).toBeGreaterThan(3); // buildings still placed
  });

  test('coast water reaches the canvas edge (no grass moat) for padded towns', () => {
    const town = generateTownMap('village', 'Bayhaven', 'north', 77, false, 'NORTH_SOUTH', 'grassland', water('coast', { S: true }));
    // bottom row should contain water once the coastline is extended through the ring
    const bottom = town.mapData[town.height - 1];
    expect(bottom.some((t) => t.type === 'water')).toBe(true);
  });

  test('lake town stays contained (no water on the far/opposite edge)', () => {
    const town = generateTownMap('town', 'Lakeside', 'south', 55, false, 'NORTH_SOUTH', 'grassland', water('lake', { W: true }));
    expect(countType(town.mapData, 'water')).toBeGreaterThan(0);
    // a west-anchored lake should not flood the east column
    const eastCol = town.mapData.map((row) => row[town.width - 1]);
    expect(eastCol.every((t) => t.type !== 'water')).toBe(true);
  });

  test('a sand shore lines the water', () => {
    const town = generateTownMap('town', 'Sandbar', 'south', 999, false, 'NORTH_SOUTH', 'grassland', water('coast', { S: true }));
    expect(countType(town.mapData, 'beach')).toBeGreaterThan(0);
  });

  test('entry point never lands on water', () => {
    const town = generateTownMap('village', 'Foamreach', 'south', 31, false, 'NORTH_SOUTH', 'grassland', water('coast', { S: true }));
    const e = town.entryPoint;
    expect(town.mapData[e.y][e.x].type).not.toBe('water');
  });

  const hasBuilding = (town, type) => town.mapData.flat().some((t) => t.type === 'building' && t.buildingType === type);

  test('city ALWAYS keeps its keep, even with a north coastline flooding the top', () => {
    for (const edge of ['N', 'S', 'E', 'W']) {
      const town = generateTownMap('city', 'Kingsport', 'south', 200 + edge.charCodeAt(0), false, 'NORTH_SOUTH', 'grassland', water('coast', { [edge]: true }));
      expect(hasBuilding(town, 'keep')).toBe(true);
    }
  });

  test('water never starves the building roster (city keeps enough land)', () => {
    const town = generateTownMap('city', 'Seawall', 'south', 808, false, 'NORTH_SOUTH', 'grassland', water('coast', { S: true, E: true }));
    const buildings = countType(town.mapData, 'building');
    // a city has ~80 building tiles in its roster; verify the bulk still places
    expect(buildings).toBeGreaterThan(50);
  });

  test('core water stays within the 20% budget (town)', () => {
    // measure water inside the native town core (exclude the cosmetic ring sea). The town
    // generates at 18x18 then pads to the 20x20 canvas, so the core sits at offset 1.
    const town = generateTownMap('town', 'Tideford', 'south', 404, false, 'NORTH_SOUTH', 'grassland', water('coast', { S: true }));
    const N = 18, off = (20 - N) / 2;
    let coreWater = 0;
    for (let y = off; y < off + N; y++) for (let x = off; x < off + N; x++) if (town.mapData[y][x].type === 'water') coreWater++;
    expect(coreWater).toBeLessThanOrEqual(Math.ceil(N * N * 0.20));
  });

  test('no water param = byte-identical landlocked town (no water tiles)', () => {
    const town = generateTownMap('town', 'Dryville', 'south', 42, false, 'NORTH_SOUTH', 'grassland', null);
    expect(countType(town.mapData, 'water')).toBe(0);
    expect(countType(town.mapData, 'beach')).toBe(0);
  });
});
