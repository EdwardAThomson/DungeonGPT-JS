import { generateTownMap, padTownToUniform } from './townMapGenerator';

const SIZES = ['hamlet', 'village', 'town', 'city'];
const countType = (town, type) => town.mapData.flat().filter((t) => t.type === type).length;

// deterministic rng for the isolated pad test
const makeRng = () => { let s = 12345; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };

// a small native town with marker tiles, entry on the south edge
const fakeNativeTown = (w, h) => {
  const mapData = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) row.push({ x, y, type: 'grass', poi: null, walkable: true });
    mapData.push(row);
  }
  mapData[1][1].type = 'building'; mapData[1][1].buildingType = 'temple';
  mapData[2][2].type = 'town_square'; mapData[2][2].poi = 'fountain';
  mapData[3][1].type = 'wall';
  return { mapData, width: w, height: h, townName: 'Fake', townSize: 'village', entryPoint: { x: Math.floor(w / 2), y: h - 1 }, centerPoint: { x: 2, y: 2 } };
};

describe('padTownToUniform — core is preserved verbatim (#1)', () => {
  test('the native core is copied unchanged (content identical, only coords offset)', () => {
    const town = fakeNativeTown(6, 6);
    const snap = town.mapData.map((row) => row.map((t) => ({ type: t.type, buildingType: t.buildingType, poi: t.poi })));
    const padded = padTownToUniform(town, 20, 20, makeRng());

    expect(padded.width).toBe(20);
    expect(padded.height).toBe(20);
    const off = (20 - 6) / 2; // 7
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 6; x++) {
        const t = padded.mapData[y + off][x + off];
        expect(t.type).toBe(snap[y][x].type);
        expect(t.buildingType).toBe(snap[y][x].buildingType);
        expect(t.poi).toBe(snap[y][x].poi);
        expect(t.x).toBe(x + off);
        expect(t.y).toBe(y + off);
      }
    }
  });

  test('the entry road is carried out to the map edge and the spawn moves there', () => {
    const town = fakeNativeTown(6, 6);
    const padded = padTownToUniform(town, 20, 20, makeRng());
    // south entry -> spawn on the bottom edge, a continuous road lane up to the core
    expect(padded.entryPoint.y).toBe(19);
    expect(padded.mapData[19][padded.entryPoint.x].isEntry).toBe(true);
    for (let y = 13; y <= 19; y++) {
      expect(['dirt_path', 'stone_path']).toContain(padded.mapData[y][padded.entryPoint.x].type);
    }
  });
});

describe('generateTownMap — uniform canvas + countryside padding', () => {
  test('every size produces a uniform 20x20 canvas', () => {
    SIZES.forEach((size) => {
      const town = generateTownMap(size, `Test ${size}`, 'south', 42);
      expect(town.width).toBe(20);
      expect(town.height).toBe(20);
      expect(town.mapData.length).toBe(20);
      expect(town.mapData[0].length).toBe(20);
    });
  });

  test('same seed is deterministic', () => {
    const a = generateTownMap('village', 'Twin', 'south', 777);
    const b = generateTownMap('village', 'Twin', 'south', 777);
    expect(JSON.stringify(a.mapData)).toBe(JSON.stringify(b.mapData));
  });

  test('tile coordinates stay consistent with grid position after padding', () => {
    const town = generateTownMap('hamlet', 'Coords', 'south', 5);
    for (let y = 0; y < town.height; y++) {
      for (let x = 0; x < town.width; x++) {
        expect(town.mapData[y][x].x).toBe(x);
        expect(town.mapData[y][x].y).toBe(y);
      }
    }
  });

  test('entry point is in-bounds and flagged', () => {
    SIZES.forEach((size) => {
      const town = generateTownMap(size, `Entry ${size}`, 'south', 99);
      const { x, y } = town.entryPoint;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(20);
      expect(town.mapData[y][x].isEntry).toBe(true);
    });
  });

  test('small towns gain a countryside ring (buildings huddled, fields around)', () => {
    const hamlet = generateTownMap('hamlet', 'Rural', 'south', 31);
    expect(countType(hamlet, 'building')).toBeGreaterThan(0);
    expect(countType(hamlet, 'farm_field')).toBeGreaterThan(0);
    // buildings should be clustered centrally, not out on the padded border
    const buildings = hamlet.mapData.flat().filter((t) => t.type === 'building');
    buildings.forEach((b) => {
      expect(b.x).toBeGreaterThanOrEqual(4);
      expect(b.x).toBeLessThan(16);
      expect(b.y).toBeGreaterThanOrEqual(4);
      expect(b.y).toBeLessThan(16);
    });
  });

  test('hamlet/village have no walls; town/city are walled', () => {
    expect(countType(generateTownMap('hamlet', 'H', 'south', 1), 'wall')).toBe(0);
    expect(countType(generateTownMap('village', 'V', 'south', 1), 'wall')).toBe(0);
    expect(countType(generateTownMap('town', 'T', 'south', 1), 'wall')).toBeGreaterThan(0);
    expect(countType(generateTownMap('city', 'C', 'south', 1), 'wall')).toBeGreaterThan(0);
  });

  describe('Phase 2b — desert town theming', () => {
    test('grassland default is unchanged and carries the grassland theme', () => {
      const a = generateTownMap('village', 'G', 'south', 777);
      const b = generateTownMap('village', 'G', 'south', 777, false, 'NORTH_SOUTH', 'grassland');
      expect(JSON.stringify(a.mapData)).toBe(JSON.stringify(b.mapData));
      expect(a.theme).toBe('grassland');
      expect(countType(a, 'farm_field')).toBeGreaterThan(0); // grassland villages still farm
    });

    test('desert town carries the theme, grows no farm fields, keeps buildings/ground', () => {
      const desert = generateTownMap('village', 'D', 'south', 777, false, 'NORTH_SOUTH', 'desert');
      expect(desert.theme).toBe('desert');
      expect(countType(desert, 'farm_field')).toBe(0); // sand ground -> no green fields
      // ground tiles stay type 'grass' so building/road placement logic is untouched
      expect(countType(desert, 'building')).toBeGreaterThan(0);
      expect(countType(desert, 'grass')).toBeGreaterThan(0);
    });
  });
});
