import { generateMapData, enrichWorldMap } from './mapGenerator';

describe('generateMapData', () => {
  it('produces identical maps for the same seed and dimensions', () => {
    const mapA = generateMapData(10, 10, 4242);
    const mapB = generateMapData(10, 10, 4242);

    expect(mapA).toEqual(mapB);
  });

  it('produces different maps for different seeds', () => {
    const mapA = generateMapData(10, 10, 1111);
    const mapB = generateMapData(10, 10, 2222);

    expect(mapA).not.toEqual(mapB);
  });

  it('returns a valid grid with coordinates and exactly one starting town', () => {
    const width = 12;
    const height = 9;
    const map = generateMapData(width, height, 9001);

    expect(map).toHaveLength(height);
    map.forEach((row, y) => {
      expect(row).toHaveLength(width);
      row.forEach((tile, x) => {
        expect(tile.x).toBe(x);
        expect(tile.y).toBe(y);
        expect(typeof tile.biome).toBe('string');
        expect(tile).toHaveProperty('poi');
      });
    });

    const startingTowns = map
      .flat()
      .filter((tile) => tile.poi === 'town' && tile.isStartingTown);

    expect(startingTowns).toHaveLength(1);
  });

  describe('Phase 2a POI sprinkle (hills / ruins)', () => {
    const tiles = (map) => map.flat();

    it('places hills on at least some maps', () => {
      let withHills = 0;
      for (let s = 1; s <= 12; s++) {
        if (tiles(generateMapData(10, 10, s * 7)).some((t) => t.poi === 'hills')) withHills++;
      }
      expect(withHills).toBeGreaterThan(0);
    });

    it('never places hills or ruins on water or beach, or over a town', () => {
      for (let s = 1; s <= 12; s++) {
        tiles(generateMapData(10, 10, s * 13))
          .filter((t) => t.poi === 'hills' || t.poi === 'ruins')
          .forEach((t) => {
            expect(t.biome).not.toBe('water');
            expect(t.biome).not.toBe('beach');
            expect(t.townName).toBeUndefined();
          });
      }
    });

    it('ruins appear on essentially every map', () => {
      let withRuins = 0;
      const N = 12;
      for (let s = 1; s <= N; s++) {
        if (tiles(generateMapData(20, 14, s * 17)).some((t) => t.poi === 'ruins')) withRuins++;
      }
      expect(withRuins).toBeGreaterThanOrEqual(N - 1);
    });

    it('caves are wired into generation and appear reliably (mountains are guaranteed)', () => {
      let withCaves = 0;
      const N = 12;
      for (let s = 1; s <= N; s++) {
        if (tiles(generateMapData(20, 14, s * 11)).some((t) => t.poi === 'cave_entrance')) withCaves++;
      }
      // mountains are guaranteed and placeCave now tries them all, so most maps get a cave
      expect(withCaves).toBeGreaterThanOrEqual(N - 2);
    });
  });

  describe('enrichWorldMap — legacy upgrade for old saves', () => {
    // a pre-feature map: plains everywhere with a single mountain, no hills/ruins/cave
    const legacyMap = () => {
      const m = [];
      for (let y = 0; y < 10; y++) {
        const row = [];
        for (let x = 0; x < 10; x++) row.push({ x, y, biome: 'plains', poi: null });
        m.push(row);
      }
      m[5][5].poi = 'mountain';
      return m;
    };

    it('adds hills/ruins/cave POIs to an old map', () => {
      const map = enrichWorldMap(legacyMap(), 42);
      const pois = new Set(map.flat().map((t) => t.poi).filter(Boolean));
      expect(pois.has('hills')).toBe(true);
      expect(pois.has('cave_entrance')).toBe(true); // mountain present -> cave placed
    });

    it('is idempotent — re-running adds nothing new', () => {
      const map = enrichWorldMap(legacyMap(), 42);
      const before = JSON.stringify(map);
      enrichWorldMap(map, 42);
      expect(JSON.stringify(map)).toBe(before);
    });

    it('leaves an already-populated (new) map untouched', () => {
      const fresh = generateMapData(10, 10, 4242);
      const before = JSON.stringify(fresh);
      enrichWorldMap(fresh, 4242);
      expect(JSON.stringify(fresh)).toBe(before);
    });
  });

  it('places every campaign-required named town, regardless of the random count', () => {
    const requiredTowns = ['Cogsworth', 'Tinker-Row', 'Brasswick', 'Gear-End'];

    // The base town count is random (2-4); without the guarantee a milestone
    // town like Tinker-Row would be dropped on some seeds. Check several seeds.
    for (const seed of [1, 7, 42, 1234, 99999]) {
      const map = generateMapData(10, 10, seed, { towns: requiredTowns });
      const placedNames = map
        .flat()
        .filter((tile) => tile.poi === 'town')
        .map((tile) => tile.townName);

      requiredTowns.forEach((name) => {
        expect(placedNames).toContain(name);
      });
    }
  });

  describe('Bigger, natural lakes', () => {
    const tiles = (map) => map.flat();
    // Lake water carries descriptionSeed 'A clear lake'; coast water is 'The coastal sea'.
    const lakeTiles = (map) => tiles(map).filter((t) => t.biome === 'water' && t.descriptionSeed === 'A clear lake');
    const lakeShores = (map) => tiles(map).filter((t) => t.biome === 'beach' && t.descriptionSeed === 'A sandy lakeshore');

    // Largest connected (4-directional) component among a set of {x,y} tiles.
    const largestComponent = (set) => {
      const key = (t) => `${t.x},${t.y}`;
      const remaining = new Map(set.map((t) => [key(t), t]));
      let best = 0;
      for (const start of set) {
        if (!remaining.has(key(start))) continue;
        let size = 0;
        const stack = [start];
        remaining.delete(key(start));
        while (stack.length) {
          const t = stack.pop();
          size++;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nk = `${t.x + dx},${t.y + dy}`;
            if (remaining.has(nk)) { stack.push(remaining.get(nk)); remaining.delete(nk); }
          }
        }
        best = Math.max(best, size);
      }
      return best;
    };

    it('grows lakes into contiguous multi-tile water bodies', () => {
      let maxBlob = 0;
      let anyMultiTile = false;
      for (let s = 1; s <= 12; s++) {
        const map = generateMapData(10, 10, s * 7);
        const lake = lakeTiles(map);
        if (lake.length > 1) anyMultiTile = true;
        maxBlob = Math.max(maxBlob, largestComponent(lake));
      }
      // Lakes are no longer single tiles: at least one seed yields a blob of several tiles.
      expect(anyMultiTile).toBe(true);
      expect(maxBlob).toBeGreaterThanOrEqual(3);
    });

    it('does not flood the map — lakes stay a modest fraction of tiles', () => {
      for (let s = 1; s <= 12; s++) {
        const map = generateMapData(10, 10, s * 7);
        // 1-2 lakes of ~4-9 tiles each on a 100-tile map; well under a third.
        expect(lakeTiles(map).length).toBeLessThan(33);
      }
    });

    it('rings every lake with beach shores — no lake tile borders bare land', () => {
      for (let s = 1; s <= 12; s++) {
        const map = generateMapData(10, 10, s * 7);
        const lake = lakeTiles(map);
        for (const t of lake) {
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const n = map[t.y + dy] && map[t.y + dy][t.x + dx];
            if (!n) continue;
            // A land tile touching the lake must have been converted to beach, never left
            // as bare plains (which would render as a hard water/grass edge).
            expect(n.biome).not.toBe('plains');
          }
        }
      }
    });

    it('lakeshore beaches point their beachDirection at adjacent water', () => {
      const offsets = { 0: [0, -1], 1: [1, 0], 2: [0, 1], 3: [-1, 0] };
      let sawShore = false;
      for (let s = 1; s <= 12; s++) {
        const map = generateMapData(10, 10, s * 7);
        for (const shore of lakeShores(map)) {
          sawShore = true;
          expect([0, 1, 2, 3]).toContain(shore.beachDirection);
          const [dx, dy] = offsets[shore.beachDirection];
          const water = map[shore.y + dy] && map[shore.y + dy][shore.x + dx];
          expect(water && water.biome).toBe('water');
        }
      }
      expect(sawShore).toBe(true);
    });

    it('keeps the map playable with lakes present (towns + a starting town)', () => {
      for (let s = 1; s <= 8; s++) {
        const map = generateMapData(10, 10, s * 7);
        const towns = tiles(map).filter((t) => t.poi === 'town');
        const starting = towns.filter((t) => t.isStartingTown);
        expect(towns.length).toBeGreaterThanOrEqual(2);
        expect(starting).toHaveLength(1);
        // The starting town is never underwater.
        expect(starting[0].biome).not.toBe('water');
      }
    });

    it('rivers can still reach lake water (mountains drain to a lake or coast)', () => {
      // With mountains guaranteed and lakes present, at least some maps grow a river that
      // terminates next to lake water — proving generateRivers still finds lakes as targets.
      let connected = 0;
      for (let s = 1; s <= 12; s++) {
        const map = generateMapData(10, 10, s * 7);
        const hasRiverByLake = tiles(map).some((t) =>
          t.hasRiver &&
          [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
            const n = map[t.y + dy] && map[t.y + dy][t.x + dx];
            return n && n.biome === 'water' && n.descriptionSeed === 'A clear lake';
          })
        );
        if (hasRiverByLake) connected++;
      }
      expect(connected).toBeGreaterThan(0);
    });
  });

  describe('Phase 2b themed regions (desert)', () => {
    it('grassland default/explicit is byte-identical to the legacy plains map', () => {
      const legacy = generateMapData(10, 10, 4242);
      const explicit = generateMapData(10, 10, 4242, {}, 'grassland');
      expect(explicit).toEqual(legacy);
    });

    it('desert theme bases all dry land on the desert biome (never plains)', () => {
      const tiles = generateMapData(10, 10, 4242, {}, 'desert').flat();
      const land = tiles.filter((t) => t.biome !== 'water' && t.biome !== 'beach');
      expect(land.length).toBeGreaterThan(0);
      expect(land.every((t) => t.biome === 'desert')).toBe(true);
      expect(tiles.some((t) => t.biome === 'plains')).toBe(false);
    });

    it('desert maps keep coast/beach, lakes, and a starting town', () => {
      const tiles = generateMapData(10, 10, 4242, {}, 'desert').flat();
      expect(tiles.some((t) => t.biome === 'water' || t.biome === 'beach')).toBe(true);
      expect(tiles.some((t) => t.poi === 'town' && t.isStartingTown)).toBe(true);
    });
  });
});
