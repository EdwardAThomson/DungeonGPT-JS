import { generateTownMap, padTownToUniform, PATH_WINDINESS } from './townMapGenerator';

const SIZES = ['hamlet', 'village', 'town', 'city'];
const countType = (town, type) => town.mapData.flat().filter((t) => t.type === type).length;
const countPoi = (town, poi) => town.mapData.flat().filter((t) => t.poi === poi).length;

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

  describe('Phase 2c — theme-aware town decorations', () => {
    test('grassland places green decorations (trees/bushes/flowers), no desert cover', () => {
      const grass = generateTownMap('village', 'G', 'south', 777);
      expect(countPoi(grass, 'tree')).toBeGreaterThan(0);
      // none of the themed decorations leak into a grassland town
      ['cactus', 'rock', 'dead_bush', 'pine', 'snowdrift'].forEach((d) =>
        expect(countPoi(grass, d)).toBe(0)
      );
    });

    test('desert town places desert decorations (cacti/rocks), never trees', () => {
      const desert = generateTownMap('village', 'D', 'south', 777, false, 'NORTH_SOUTH', 'desert');
      expect(countPoi(desert, 'tree')).toBe(0);
      expect(countPoi(desert, 'bush')).toBe(0);
      expect(countPoi(desert, 'flowers')).toBe(0);
      const desertCover = countPoi(desert, 'cactus') + countPoi(desert, 'rock') + countPoi(desert, 'dead_bush');
      expect(desertCover).toBeGreaterThan(0);
    });

    test('snow town places snowy decorations (pines/drifts), never trees', () => {
      const snowTown = generateTownMap('village', 'S', 'south', 777, false, 'NORTH_SOUTH', 'snow');
      expect(snowTown.theme).toBe('snow');
      expect(countPoi(snowTown, 'tree')).toBe(0);
      const snowCover = countPoi(snowTown, 'pine') + countPoi(snowTown, 'rock') + countPoi(snowTown, 'snowdrift');
      expect(snowCover).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// Hub-and-spoke path network (2026-07 redesign): the town square is the hub,
// every gate and every major building connects to it via windy routed lanes,
// and the whole network is ONE connected component — zero orphan path tiles.
// =============================================================================
describe('hub-and-spoke path network', () => {
  const isPathType = (t) => t === 'dirt_path' || t === 'stone_path' || t === 'town_square' || t === 'bridge';
  const MAJORS = new Set(['townhall', 'tavern', 'inn', 'temple', 'market', 'blacksmith']);

  // All orthogonally-connected components of path tiles.
  const pathComponents = (town) => {
    const { mapData, width, height } = town;
    const seen = new Set();
    const comps = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!isPathType(mapData[y][x].type) || seen.has(`${x},${y}`)) continue;
        const comp = new Set();
        const stack = [[x, y]];
        seen.add(`${x},${y}`);
        while (stack.length) {
          const [cx, cy] = stack.pop();
          comp.add(`${cx},${cy}`);
          for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            if (!isPathType(mapData[ny][nx].type) || seen.has(`${nx},${ny}`)) continue;
            seen.add(`${nx},${ny}`);
            stack.push([nx, ny]);
          }
        }
        comps.push(comp);
      }
    }
    return comps;
  };

  const adjacentToPath = (town, x, y, chebyshev = 1) => {
    for (let dy = -chebyshev; dy <= chebyshev; dy++) {
      for (let dx = -chebyshev; dx <= chebyshev; dx++) {
        if (chebyshev === 1 && Math.abs(dx) + Math.abs(dy) !== 1) continue; // orthogonal only
        const n = town.mapData[y + dy] && town.mapData[y + dy][x + dx];
        if (n && isPathType(n.type)) return true;
      }
    }
    return false;
  };

  // Free grass tiles (no poi) orthogonally adjacent to a building — what
  // injectQuestBuildings needs to place new quest venues near the built-up area.
  const questGrassSupply = (town) => {
    let count = 0;
    for (let y = 1; y < town.height - 1; y++) {
      for (let x = 1; x < town.width - 1; x++) {
        const t = town.mapData[y][x];
        if (t.type !== 'grass' || t.poi) continue;
        const nearBuilding = [[0, -1], [0, 1], [-1, 0], [1, 0]].some(([dx, dy]) => {
          const n = town.mapData[y + dy] && town.mapData[y + dy][x + dx];
          return n && n.type === 'building';
        });
        if (nearBuilding) count++;
      }
    }
    return count;
  };

  test('seed survey (100 seeds × 4 sizes): one component with hub + all gates, buildings served, grass supply intact', () => {
    const allSpokes = [];
    const gateSpokes = [];

    SIZES.forEach((size) => {
      for (let seed = 1; seed <= 100; seed++) {
        // every third town gets a second gate, like a world crossroads tile would
        const entry = seed % 3 === 0 ? ['south', 'east'] : 'south';
        const town = generateTownMap(size, `Survey ${size}`, entry, seed * 137 + 1);
        const comps = pathComponents(town);
        const ctx = `${size} seed ${seed * 137 + 1}`;

        // ONE connected network — zero orphan path tiles, ever
        expect({ ctx, components: comps.length }).toEqual({ ctx, components: 1 });
        const net = comps[0];

        // the hub (town square / centre) is on the network
        expect(net.has(`${town.centerPoint.x},${town.centerPoint.y}`)).toBe(true);

        // every gate is a path tile on the same network
        town.entrances.forEach(({ pos }) => {
          expect({ ctx, gate: net.has(`${pos.x},${pos.y}`) }).toEqual({ ctx, gate: true });
        });

        // every major building fronts a lane; the keep's lane reaches its curtain wall
        for (let y = 0; y < town.height; y++) {
          for (let x = 0; x < town.width; x++) {
            const t = town.mapData[y][x];
            if (t.type !== 'building') continue;
            if (t.buildingType === 'keep') {
              expect({ ctx, keepServed: adjacentToPath(town, x, y, 2) }).toEqual({ ctx, keepServed: true });
            } else if (MAJORS.has(t.buildingType)) {
              expect({ ctx, b: t.buildingType, served: adjacentToPath(town, x, y) })
                .toEqual({ ctx, b: t.buildingType, served: true });
            }
          }
        }

        // minor service buildings: everything except houses and manors (a manor may
        // legitimately face the estate's inner courtyard) fronts a lane too
        const minorMisses = [];
        for (let y = 0; y < town.height; y++) {
          for (let x = 0; x < town.width; x++) {
            const t = town.mapData[y][x];
            if (t.type !== 'building') continue;
            if (t.buildingType === 'house' || t.buildingType === 'manor' || t.buildingType === 'keep') continue;
            if (MAJORS.has(t.buildingType)) continue; // already asserted above
            if (!adjacentToPath(town, x, y)) minorMisses.push(t.buildingType);
          }
        }
        expect({ ctx, minorMisses }).toEqual({ ctx, minorMisses: [] });

        // quest-building injection keeps a healthy supply of free grass near buildings
        expect(questGrassSupply(town)).toBeGreaterThanOrEqual(3);

        // collect windiness metrics (asserted in aggregate below)
        (town.pathStats?.spokes || []).forEach((s) => {
          if (s.straight < 4) return; // too short to meaningfully bend
          allSpokes.push(s);
          if (s.kind === 'gate') gateSpokes.push(s);
        });
      }
    });

    // Windiness: spokes meander (bends) without absurd doubling back (ratio band).
    // The floors guarantee the network can never regress to straight rays.
    const avg = (arr, f) => arr.reduce((a, s) => a + f(s), 0) / arr.length;
    expect(allSpokes.length).toBeGreaterThan(300);
    expect(avg(allSpokes, (s) => s.bends)).toBeGreaterThanOrEqual(2);
    expect(avg(gateSpokes, (s) => s.bends)).toBeGreaterThanOrEqual(2);
    const avgRatio = avg(allSpokes, (s) => s.length / s.straight);
    expect(avgRatio).toBeGreaterThanOrEqual(1.05);
    expect(avgRatio).toBeLessThanOrEqual(2.0);
  });

  test('windiness factor is exposed and positive', () => {
    expect(PATH_WINDINESS).toBeGreaterThan(0);
  });

  test('a town with no road edges still gets a connected gate', () => {
    const town = generateTownMap('village', 'Lonely', undefined, 4242);
    expect(town.entrances.length).toBeGreaterThanOrEqual(1);
    const comps = pathComponents(town);
    expect(comps.length).toBe(1);
    town.entrances.forEach(({ pos }) => expect(comps[0].has(`${pos.x},${pos.y}`)).toBe(true));
  });

  test('water towns: network stays connected, waterfront buildings placed, at most a short jetty causeway', () => {
    const waters = [
      { kind: 'coast', edges: { N: false, E: true, S: false, W: false } },
      { kind: 'coast', edges: { N: false, E: false, S: true, W: false } },
      { kind: 'lake', edges: { N: true, E: false, S: false, W: false } },
    ];
    SIZES.forEach((size) => {
      for (let seed = 1; seed <= 15; seed++) {
        const town = generateTownMap(size, 'Port', 'south', seed * 733 + 7, false, 'NORTH_SOUTH', 'grassland', waters[seed % 3]);
        const comps = pathComponents(town);
        expect({ size, seed, components: comps.length }).toEqual({ size, seed, components: 1 });
        // no route ploughs through open water: land routing is tried first, so at most
        // a handful of tiles of dockside jetty/causeway ever appear
        const bridges = town.mapData.flat().filter((t) => t.type === 'bridge').length;
        expect(bridges).toBeLessThanOrEqual(10);
        // village+ water towns still get their harbour office on the shore
        if (size !== 'hamlet') {
          const hasHarbor = town.mapData.flat().some((t) => t.type === 'building' && t.buildingType === 'harbormaster');
          expect({ size, seed, hasHarbor }).toEqual({ size, seed, hasHarbor: true });
        }
      }
    });
  });

  test('river towns: the river is crossed on bridges and the network stays whole', () => {
    SIZES.forEach((size) => {
      for (let seed = 1; seed <= 10; seed++) {
        const town = generateTownMap(size, 'Ford', 'south', seed * 991 + 3, true, seed % 2 ? 'EAST_WEST' : 'NORTH_SOUTH');
        const comps = pathComponents(town);
        expect({ size, seed, components: comps.length }).toEqual({ size, seed, components: 1 });
      }
    });
  });

  test('same seed → identical network and spoke stats (determinism)', () => {
    const a = generateTownMap('town', 'Det', ['south', 'west'], 90210);
    const b = generateTownMap('town', 'Det', ['south', 'west'], 90210);
    expect(JSON.stringify(a.mapData)).toBe(JSON.stringify(b.mapData));
    expect(JSON.stringify(a.pathStats)).toBe(JSON.stringify(b.pathStats));
    expect(JSON.stringify(a.entrances)).toBe(JSON.stringify(b.entrances));
  });
});

describe('building roster is seed-invariant (playtest 2026-07-05: reported count drift)', () => {
  // Whatever the configured roster produces for a size must not depend on the
  // seed: a seed that quietly drops a building means placement starved and the
  // player gets a lesser town. Pin totals across a seed sweep per size/theme.
  it.each(['hamlet', 'village', 'town', 'city'])('%s places the same building count on every seed', (size) => {
    const totals = new Set();
    for (let seed = 100; seed < 160; seed++) {
      const town = generateTownMap(size, `T${seed}`, 'south', seed, false, 'NORTH_SOUTH', 'grassland');
      let n = 0;
      town.mapData.forEach((row) => row.forEach((t) => { if (t.type === 'building') n++; }));
      totals.add(n);
    }
    expect([...totals]).toHaveLength(1);
  });
});
