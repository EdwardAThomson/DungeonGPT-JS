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
        // Issue #59 budgets total lake water to ~12% of tiles (see the seed-survey block
        // below for the tight assertions); this older guard stays as a coarse sanity check.
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
      const concaveDirs = { 4: [0, 1], 5: [1, 2], 6: [2, 3], 7: [0, 3] }; // two adjacent orthogonals
      const convexDiag = { 8: [1, -1], 9: [1, 1], 10: [-1, 1], 11: [-1, -1] }; // single diagonal
      const isWater = (map, x, y) => !!(map[y] && map[y][x] && map[y][x].biome === 'water');
      let sawShore = false;
      for (let s = 1; s <= 12; s++) {
        const map = generateMapData(10, 10, s * 7);
        for (const shore of lakeShores(map)) {
          sawShore = true;
          expect(shore.beachDirection).toBeGreaterThanOrEqual(0);
          expect(shore.beachDirection).toBeLessThanOrEqual(11);
          if (shore.beachDirection <= 3) {
            const [dx, dy] = offsets[shore.beachDirection];
            expect(isWater(map, shore.x + dx, shore.y + dy)).toBe(true);
          } else if (shore.beachDirection <= 7) {
            // concave corner: both implied adjacent sides must be water
            for (const d of concaveDirs[shore.beachDirection]) {
              const [dx, dy] = offsets[d];
              expect(isWater(map, shore.x + dx, shore.y + dy)).toBe(true);
            }
          } else {
            // convex outer corner: the diagonal is water and there's NO orthogonal water.
            // (With lake separation enforced, a convex corner never abuts another water body.)
            const [dx, dy] = convexDiag[shore.beachDirection];
            expect(isWater(map, shore.x + dx, shore.y + dy)).toBe(true);
            for (const o of Object.values(offsets)) {
              expect(isWater(map, shore.x + o[0], shore.y + o[1])).toBe(false);
            }
          }
        }
      }
      expect(sawShore).toBe(true);
    });

    it('separate lakes never crowd together (>= 2 land tiles apart)', () => {
      for (let s = 1; s <= 12; s++) {
        const map = generateMapData(12, 12, s * 5);
        const H = map.length, W = map[0].length;
        const isLakeWater = (x, y) => x >= 0 && x < W && y >= 0 && y < H
          && map[y][x].biome === 'water' && map[y][x].descriptionSeed === 'A clear lake';
        // label connected lake-water components
        const comp = Array.from({ length: H }, () => new Array(W).fill(-1));
        let id = 0;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            if (isLakeWater(x, y) && comp[y][x] === -1) {
              const stack = [[x, y]];
              comp[y][x] = id;
              while (stack.length) {
                const [cx, cy] = stack.pop();
                for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
                  const nx = cx + dx, ny = cy + dy;
                  if (isLakeWater(nx, ny) && comp[ny][nx] === -1) { comp[ny][nx] = id; stack.push([nx, ny]); }
                }
              }
              id++;
            }
          }
        }
        if (id < 2) continue; // only one lake this seed
        const cells = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (comp[y][x] >= 0) cells.push([x, y, comp[y][x]]);
        for (let i = 0; i < cells.length; i++) {
          for (let j = i + 1; j < cells.length; j++) {
            if (cells[i][2] !== cells[j][2]) {
              const cheb = Math.max(Math.abs(cells[i][0] - cells[j][0]), Math.abs(cells[i][1] - cells[j][1]));
              expect(cheb).toBeGreaterThanOrEqual(3); // >=2 land tiles between bodies
            }
          }
        }
      }
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

  describe('Issue #59: lake caps, one-large-one-small rule, shape variety (300-seed survey)', () => {
    // Lake water carries descriptionSeed 'A clear lake'; coast water is 'The coastal sea'.
    // Connected (4-directional) components of lake water, largest first.
    const lakeComponents = (map) => {
      const H = map.length, W = map[0].length;
      const isLake = (x, y) => x >= 0 && x < W && y >= 0 && y < H
        && map[y][x].biome === 'water' && map[y][x].descriptionSeed === 'A clear lake';
      const seen = Array.from({ length: H }, () => new Array(W).fill(false));
      const comps = [];
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (!isLake(x, y) || seen[y][x]) continue;
          const tiles = [];
          const stack = [[x, y]];
          seen[y][x] = true;
          while (stack.length) {
            const [cx, cy] = stack.pop();
            tiles.push({ x: cx, y: cy });
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = cx + dx, ny = cy + dy;
              if (isLake(nx, ny) && !seen[ny][nx]) { seen[ny][nx] = true; stack.push([nx, ny]); }
            }
          }
          comps.push(tiles);
        }
      }
      return comps.sort((a, b) => b.length - a.length);
    };
    const bboxAspect = (tiles) => {
      const xs = tiles.map((t) => t.x), ys = tiles.map((t) => t.y);
      const w = Math.max(...xs) - Math.min(...xs) + 1;
      const h = Math.max(...ys) - Math.min(...ys) + 1;
      return w / h;
    };

    const N = 300;
    const surveys = [];
    beforeAll(() => {
      for (let s = 1; s <= N; s++) {
        const map = generateMapData(10, 10, s * 101 + 7);
        surveys.push({ seed: s * 101 + 7, map, comps: lakeComponents(map) });
      }
    });

    it('caps total lake water on every map (budget 8% minus coast share, smoothing slack)', () => {
      // Generation budgets lake targets to floor(100 * 0.08) = 8 tiles minus a
      // quarter of the coast's water tiles (2026-07-06 sizing); smoothing may add
      // the odd fill tile, so allow a small margin before failing.
      const violations = surveys
        .map(({ seed, comps }) => ({ seed, water: comps.reduce((n, c) => n + c.length, 0) }))
        .filter((v) => v.water > 15);
      expect(violations).toEqual([]);
    });

    it('never places two lakes that are both large: the second is at most ~half the first', () => {
      const violations = surveys
        .filter(({ comps }) => comps.length >= 2)
        .map(({ seed, comps }) => ({ seed, large: comps[0].length, small: comps[1].length }))
        .filter((v) =>
          // Both-large is the twin-giants bug (pre-fix: 15 of 47 two-lake maps had both >= 6);
          // "meaningfully smaller" means at most half, with a one-tile smoothing allowance.
          (v.small >= 6 && v.large >= 6) || v.small * 2 > v.large + 2
        );
      expect(violations).toEqual([]);
    });

    it('keeps a sane lake-count distribution: coastal default maps get exactly one lake', () => {
      // Coast-aware sizing (maintainer 2026-07-06: "reduce the size of the lakes,
      // they can generate with coast and it is a lot of water"): default worlds
      // always carry a coast, so the companion lake is reserved for coastless
      // maps (chunk interiors) and every default map gets a single modest lake.
      const counts = { 0: 0, 1: 0, 2: 0, more: 0 };
      for (const { comps } of surveys) {
        counts[comps.length > 2 ? 'more' : comps.length]++;
      }
      expect(counts.more).toBe(0);
      expect(counts[2]).toBe(0);
      expect(counts[1]).toBe(N); // every coastal map: exactly one lake
    });

    it('the companion lake is extinct under the 8% budget (single lake everywhere)', () => {
      // min(budget - first, floor(first / 2)) can never reach the 3-tile floor
      // once the budget is 8, so every map (coastal or not) gets exactly one
      // lake. Deliberate (maintainer 2026-07-06): less standing water overall.
      for (let seed = 500; seed < 540; seed++) {
        const map = generateMapData(10, 10, seed, undefined, undefined, { coast: false });
        expect(lakeComponents(map).length).toBe(1);
      }
    });

    it('keeps two lakes well separated (Chebyshev distance >= 3, i.e. 2 land tiles between)', () => {
      const violations = surveys
        .filter(({ comps }) => comps.length >= 2)
        .map(({ seed, comps }) => {
          let minCheb = Infinity;
          for (const a of comps[0]) {
            for (const b of comps[1]) {
              minCheb = Math.min(minCheb, Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)));
            }
          }
          return { seed, minCheb };
        })
        .filter((v) => v.minCheb < 3);
      expect(violations).toEqual([]);
    });

    it('two-lake maps no longer occur (look-alike rule kept for the record)', () => {
      // The 2026-07-06 sizing retired companion lakes entirely; if a future
      // budget increase revives them, restore the aspect/size look-alike survey
      // from git history (it measured 0 look-alikes over 300 seeds).
      expect(surveys.filter(({ comps }) => comps.length >= 2)).toEqual([]);
    });

    it('settlement placement still succeeds on every surveyed seed (no seed crashes)', () => {
      const violations = surveys
        .map(({ seed, map }) => {
          const towns = map.flat().filter((t) => t.poi === 'town');
          return { seed, towns: towns.length, starting: towns.filter((t) => t.isStartingTown).length };
        })
        .filter((v) => v.towns < 3 || v.starting !== 1);
      expect(violations).toEqual([]);
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

describe('Water-town world-gen shims (#65 Phase 3): riverToSea + estuaryTown', () => {
  const tiles = (map) => map.flat();
  const seaWithRiver = (map) => tiles(map).some(
    (t) => t.biome === 'water' && t.hasRiver && t.descriptionSeed !== 'A clear lake'
  );
  // Coastal context as the town generator will see it (estuary = this + hasRiver).
  const coastFn = (map, t) => {
    const w = require('./townWater').analyzeTownWater(map, t.x, t.y);
    return w && w.kind === 'coast';
  };

  const N = 60;
  const seeds = Array.from({ length: N }, (_, i) => i * 101 + 7);

  it('shims OFF (absent or false) are byte-identical to the legacy map', () => {
    const legacy = generateMapData(10, 10, 4242);
    expect(generateMapData(10, 10, 4242, {}, 'grassland', {})).toEqual(legacy);
    expect(generateMapData(10, 10, 4242, {}, 'grassland', { riverToSea: false, estuaryTown: false })).toEqual(legacy);
  });

  it('riverToSea makes the river reach the coast on essentially every seed', () => {
    let baseline = 0;
    let withShim = 0;
    for (const s of seeds) {
      if (seaWithRiver(generateMapData(10, 10, s))) baseline++;
      if (seaWithRiver(generateMapData(10, 10, s, {}, 'grassland', { riverToSea: true }))) withShim++;
    }
    // Legacy routing goes to the NEAREST water (often a lake): the shim must beat it
    // decisively and land near-universal (findPath always succeeds; the only miss is
    // a degenerate map). Measured: baseline 34/60, shim 60/60.
    expect(withShim).toBeGreaterThanOrEqual(Math.floor(N * 0.95));
    expect(withShim).toBeGreaterThan(baseline);
  });

  it('estuaryTown yields a coastal city, usually a true river-mouth estuary', () => {
    let estuaryCity = 0;
    let coastalCity = 0;
    for (const s of seeds) {
      const map = generateMapData(10, 10, s, {}, 'grassland', { riverToSea: true, estuaryTown: true });
      const cities = tiles(map).filter((t) => t.poi === 'town' && t.townSize === 'city');
      if (cities.some((t) => t.hasRiver && coastFn(map, t))) estuaryCity++;
      if (cities.some((t) => coastFn(map, t))) coastalCity++;
    }
    // Measured over 150 seeds: coastal city 100%, true estuary city 88.7% (the mouth
    // tile is occasionally occupied, so the city settles beside the band: the canal
    // stamp's lagoon fallback covers those). Assert with slack for seed drift.
    expect(coastalCity).toBeGreaterThanOrEqual(Math.floor(N * 0.95));
    expect(estuaryCity).toBeGreaterThanOrEqual(Math.floor(N * 0.8));
  });

  it('the estuary city is never the starting town, and the map stays playable', () => {
    for (const s of seeds) {
      const map = generateMapData(10, 10, s, {}, 'grassland', { riverToSea: true, estuaryTown: true });
      const towns = tiles(map).filter((t) => t.poi === 'town');
      const starting = towns.filter((t) => t.isStartingTown);
      expect(starting).toHaveLength(1);
      // The canal-eligible settlement (coastal city) must be free for the stamp:
      // whenever coastal cities exist, at least one is NOT the starting town (the
      // pinned estuary town is excluded from starting-town selection by the shim).
      const coastalCities = tiles(map).filter(
        (t) => t.poi === 'town' && t.townSize === 'city' && coastFn(map, t)
      );
      if (coastalCities.length > 0) {
        expect(coastalCities.some((t) => !t.isStartingTown)).toBe(true);
      }
      // budget unchanged: the estuary town spends a normal slot (3-6 towns)
      expect(towns.length).toBeGreaterThanOrEqual(3);
      expect(towns.length).toBeLessThanOrEqual(6);
    }
  });

  it('estuaryTown still honors custom quest-town names and declared sizes', () => {
    for (const s of [1, 77, 9001]) {
      const map = generateMapData(10, 10, s, {
        towns: [{ name: 'Ashford', size: 'village' }, 'Mudhollow', 'Grimstead'],
        mountains: [],
      }, 'grassland', { riverToSea: true, estuaryTown: true });
      const find = (name) => map.flat().find((t) => t.townName === name);
      expect(find('Ashford')?.townSize).toBe('village');
      ['Mudhollow', 'Grimstead'].forEach((n) => expect(find(n)).toBeTruthy());
    }
  });
});

describe('generateMapData — size-tagged custom town names', () => {
  const townsOf = (map) => map.flat().filter((t) => t.townName);
  const find = (map, name) => map.flat().find((t) => t.townName === name);

  it('renders a { name, size } entry at the declared size (the village of Ashford)', () => {
    const map = generateMapData(10, 10, 12345, {
      towns: [{ name: 'Ashford', size: 'village' }, 'Mudhollow', 'Grimstead', 'Duskwell'],
      mountains: []
    });
    const ashford = find(map, 'Ashford');
    expect(ashford).toBeTruthy();
    expect(ashford.townSize).toBe('village');
    // the plain names are still placed
    ['Mudhollow', 'Grimstead', 'Duskwell'].forEach((n) => expect(find(map, n)).toBeTruthy());
    // a city still exists (declaring Ashford a village doesn't remove the campaign's city)
    expect(townsOf(map).some((t) => t.townSize === 'city')).toBe(true);
  });

  it('honors the declared size across multiple seeds', () => {
    for (const seed of [1, 77, 9001, 33333]) {
      const map = generateMapData(10, 10, seed, {
        towns: [{ name: 'Ashford', size: 'village' }, 'Aye', 'Bee', 'Cee'],
        mountains: []
      });
      const ashford = find(map, 'Ashford');
      expect(ashford).toBeTruthy();
      expect(ashford.townSize).toBe('village');
    }
  });

  it('plain-string custom names still work (backwards compatible)', () => {
    const map = generateMapData(10, 10, 4242, { towns: ['Alpha', 'Beta', 'Gamma', 'Delta'], mountains: [] });
    ['Alpha', 'Beta', 'Gamma', 'Delta'].forEach((n) => expect(find(map, n)).toBeTruthy());
  });
});

// =============================================================================
// #67: water-adjacent settlement placement bias (river-settlement doctrine,
// WATER_TOWNS_PLAN.md section 1c). Placement prefers river/coast/lake-adjacent
// sites, scaled by the slot's dealt size (city 0.8 .. hamlet 0.2, never 100%),
// with a river-band pull on town/city slots so riverfork/estuary eligibility
// rises. UNIVERSAL (no entitlement gate) and going-forward-only: the legacy
// world fixtures were deliberately re-captured (see worldAssembler.test.js).
// =============================================================================
describe('#67: water-adjacent settlement placement bias (120-seed survey)', () => {
  const waterAdjacent = (map, t) => {
    if (t.hasRiver || t.biome === 'beach') return true;
    return [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => {
      const n = map[t.y + dy] && map[t.y + dy][t.x + dx];
      if (!n) return false;
      return n.biome === 'water' || n.biome === 'beach' || (n.hasRiver === true && n.biome !== 'water');
    });
  };

  test('adjacency fraction rises materially over the old placement, but never to 100%', () => {
    // Pre-bias baseline, measured on this exact predicate over the same 120 seeds
    // before #67 landed: 430/544 settlements water-adjacent (0.790), and 81 of the
    // 120 worlds carried at least one dry inland settlement.
    const OLD_FRACTION = 0.790;

    let towns = 0;
    let adjacent = 0;
    let dryTowns = 0;
    for (let s = 1; s <= 120; s++) {
      const map = generateMapData(10, 10, s * 977 + 3);
      const list = map.flat().filter((t) => t.poi === 'town');
      towns += list.length;
      for (const t of list) {
        if (waterAdjacent(map, t)) adjacent++; else dryTowns++;
      }
    }
    const fraction = adjacent / towns;

    // materially above the old placement, inside a sane band (measured 0.892)
    expect(fraction).toBeGreaterThanOrEqual(OLD_FRACTION + 0.05);
    expect(fraction).toBeLessThanOrEqual(0.97);
    // never-100% guard: dry inland settlements (crossroads towns) still exist
    expect(dryTowns).toBeGreaterThan(0);
  });

  test('member worlds: riverfork eligibility (on the river band, size town+) >= 1 on a strong majority of worlds', () => {
    // Pre-bias baseline over the same seeds/options: 105/120 eligible worlds (0.875),
    // 109 eligible settlements. Measured after #67: 109/120 (0.908), 128 settlements.
    let eligibleWorlds = 0;
    const WORLDS = 120;
    for (let s = 1; s <= WORLDS; s++) {
      const map = generateMapData(10, 10, s * 977 + 3, {}, 'grassland', { riverToSea: true, estuaryTown: true });
      const eligible = map.flat().filter(
        (t) => t.poi === 'town' && t.hasRiver && (t.townSize === 'town' || t.townSize === 'city')
      );
      if (eligible.length >= 1) eligibleWorlds++;
    }
    expect(eligibleWorlds / WORLDS).toBeGreaterThanOrEqual(0.85);
  });

  test('every world still places its towns and exactly one starting town (bias never starves placement)', () => {
    for (let s = 1; s <= 40; s++) {
      const map = generateMapData(10, 10, s * 3301 + 7);
      const list = map.flat().filter((t) => t.poi === 'town');
      expect(list.length).toBeGreaterThanOrEqual(3);
      expect(list.filter((t) => t.isStartingTown)).toHaveLength(1);
      // dealt sizes still follow the shuffled cycle: all four sizes appear on a 4+ town map
      if (list.length >= 4) {
        expect(new Set(list.map((t) => t.townSize)).size).toBe(4);
      }
    }
  });
});
