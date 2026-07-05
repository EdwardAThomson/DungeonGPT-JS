import { generateTownMap, padTownToUniform, PATH_WINDINESS, WATERWAY_BRIDGE_COST, CANAL_BANK_COST } from './townMapGenerator';
import legacyVillage777 from './__fixtures__/legacyTown_village_seed777.json';
import legacyCity12345 from './__fixtures__/legacyTown_city_seed12345.json';
import legacyRiverTown4242 from './__fixtures__/legacyTown_riverTown_seed4242.json';
import legacyCoastTown9001 from './__fixtures__/legacyTown_coastTown_seed9001.json';
import legacyCoastCity3131 from './__fixtures__/legacyTown_coastCity_seed3131.json';

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

// =============================================================================
// River city archetype (water towns Phase 1, #65): a windy river enters one edge,
// forks around an island district, rejoins, and exits. Fork water carries the
// additive `waterway: true` flag, foot routes cross it on bridges, the island
// hosts the distinctive venues, and every #62 walkability invariant still holds.
// =============================================================================
describe('river city archetype (riverfork, water towns Phase 1)', () => {
  const RIVER_CITY_SIZES = ['town', 'city'];
  const isPathType = (t) => t === 'dirt_path' || t === 'stone_path' || t === 'town_square' || t === 'bridge';
  const genFork = (size, seed, dir = 'NORTH_SOUTH', entry = 'south') =>
    generateTownMap(size, 'Forkford', entry, seed, true, dir, 'grassland', { archetype: 'riverfork' });

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

  const adjacentToPath = (town, x, y) => [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => {
    const n = town.mapData[y + dy] && town.mapData[y + dy][x + dx];
    return n && isPathType(n.type);
  });

  // Distinct crossings: connected components of bridge tiles orthogonally adjacent
  // to island land (two bridges is the Konigsberg minimum, plan decision 8).
  const islandBridgeGroups = (town) => {
    const islandKeys = new Set(town.riverFork.islandTiles.map((p) => `${p.x},${p.y}`));
    const seen = new Set();
    let groups = 0;
    for (let y = 0; y < town.height; y++) {
      for (let x = 0; x < town.width; x++) {
        if (town.mapData[y][x].type !== 'bridge' || seen.has(`${x},${y}`)) continue;
        const comp = [];
        const st = [{ x, y }];
        seen.add(`${x},${y}`);
        while (st.length) {
          const c = st.pop();
          comp.push(c);
          for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
            const nx = c.x + dx, ny = c.y + dy;
            const n = town.mapData[ny] && town.mapData[ny][nx];
            if (!n || n.type !== 'bridge' || seen.has(`${nx},${ny}`)) continue;
            seen.add(`${nx},${ny}`);
            st.push({ x: nx, y: ny });
          }
        }
        const touchesIsland = comp.some((c) =>
          [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => islandKeys.has(`${c.x + dx},${c.y + dy}`)));
        if (touchesIsland) groups++;
      }
    }
    return groups;
  };

  test('the waterway bridging cost matches the river band cost from the plan', () => {
    expect(WATERWAY_BRIDGE_COST).toBe(5);
  });

  test('seed survey (40 seeds x town/city x both directions): fork, island, bridges, floors, one network', () => {
    const channelSpokes = [];

    RIVER_CITY_SIZES.forEach((size) => {
      for (let s = 1; s <= 40; s++) {
        const seed = s * 613 + 11;
        const dir = s % 2 ? 'NORTH_SOUTH' : 'EAST_WEST';
        const entry = s % 3 === 0 ? ['south', 'east'] : 'south';
        const town = genFork(size, seed, dir, entry);
        const ctx = `${size} seed ${seed} ${dir}`;

        // the fork carved and is described (island district exists)
        expect({ ctx, hasFork: !!town.riverFork }).toEqual({ ctx, hasFork: true });
        const islandKeys = new Set(town.riverFork.islandTiles.map((p) => `${p.x},${p.y}`));
        expect(town.riverFork.islandTiles.length).toBeGreaterThanOrEqual(4);

        // fork water carries the additive waterway flag (absent = plain water elsewhere)
        const waterwayTiles = town.mapData.flat().filter((t) => t.type === 'water' && t.waterway === true).length;
        expect({ ctx, hasWaterway: waterwayTiles > 0 }).toEqual({ ctx, hasWaterway: true });

        // walkability invariant: ONE network containing the hub and every gate,
        // zero orphans (pruneOrphanPaths never fires on shipped output)
        const comps = pathComponents(town);
        expect({ ctx, components: comps.length }).toEqual({ ctx, components: 1 });
        const net = comps[0];
        expect(net.has(`${town.centerPoint.x},${town.centerPoint.y}`)).toBe(true);
        town.entrances.forEach(({ pos }) => {
          expect({ ctx, gate: net.has(`${pos.x},${pos.y}`) }).toEqual({ ctx, gate: true });
        });

        // island venues: cathedral quarter on cities (temple + archives), market
        // isle on towns; each on the island and fronting a lane (reachable)
        const wantVenues = size === 'city' ? ['temple', 'archives'] : ['market'];
        for (const venue of wantVenues) {
          const hit = town.mapData.flat().find((t) =>
            t.type === 'building' && t.buildingType === venue && islandKeys.has(`${t.x},${t.y}`));
          expect({ ctx, venue, onIsland: !!hit }).toEqual({ ctx, venue, onIsland: true });
          expect({ ctx, venue, served: adjacentToPath(town, hit.x, hit.y) }).toEqual({ ctx, venue, served: true });
        }

        // every non-house/manor/keep building still fronts a lane (island included)
        const misses = [];
        town.mapData.flat().forEach((t) => {
          if (t.type !== 'building') return;
          if (t.buildingType === 'house' || t.buildingType === 'manor' || t.buildingType === 'keep') return;
          if (!adjacentToPath(town, t.x, t.y)) misses.push(t.buildingType);
        });
        expect({ ctx, misses }).toEqual({ ctx, misses: [] });

        // at least two distinct bridge crossings knit the island to the town
        const groups = islandBridgeGroups(town);
        expect({ ctx, twoBridges: groups >= 2, groups }).toEqual({ ctx, twoBridges: true, groups });

        // quest-injection floor: >= 4 free grass tiles ON the island
        const freeGrass = town.riverFork.islandTiles.filter((p) => {
          const t = town.mapData[p.y][p.x];
          return t.type === 'grass' && !t.poi;
        }).length;
        expect({ ctx, floorMet: freeGrass >= 4, freeGrass }).toEqual({ ctx, floorMet: true, freeGrass });

        // collect fork-arm windiness (asserted in aggregate below)
        (town.pathStats?.spokes || []).forEach((sp) => {
          if (sp.kind === 'channel' && sp.straight >= 4) channelSpokes.push(sp);
        });
      }
    });

    // the fork's arms meander like the foot paths do (same seeded technique)
    const avg = (arr, f) => arr.reduce((a, sp) => a + f(sp), 0) / arr.length;
    expect(channelSpokes.length).toBeGreaterThan(100);
    expect(avg(channelSpokes, (sp) => sp.bends)).toBeGreaterThanOrEqual(2);
    const avgRatio = avg(channelSpokes, (sp) => sp.length / sp.straight);
    expect(avgRatio).toBeGreaterThanOrEqual(1.05);
    expect(avgRatio).toBeLessThanOrEqual(2.5);
  });

  it.each(RIVER_CITY_SIZES)('%s river city places the same building count on every seed', (size) => {
    const totals = new Set();
    for (let seed = 100; seed < 140; seed++) {
      const town = genFork(size, seed);
      let n = 0;
      town.mapData.forEach((row) => row.forEach((t) => { if (t.type === 'building') n++; }));
      totals.add(n);
    }
    expect([...totals]).toHaveLength(1);
  });

  test('same seed twice is identical (map, path stats, fork descriptor)', () => {
    const a = genFork('city', 90210, 'EAST_WEST', ['south', 'west']);
    const b = genFork('city', 90210, 'EAST_WEST', ['south', 'west']);
    expect(JSON.stringify(a.mapData)).toBe(JSON.stringify(b.mapData));
    expect(JSON.stringify(a.pathStats)).toBe(JSON.stringify(b.pathStats));
    expect(JSON.stringify(a.riverFork)).toBe(JSON.stringify(b.riverFork));
  });

  test('riverfork on small sizes falls back to the plain river band (no fork, no island)', () => {
    ['hamlet', 'village'].forEach((size) => {
      const town = genFork(size, 777);
      expect(town.riverFork).toBeUndefined();
      const waterway = town.mapData.flat().filter((t) => t.waterway).length;
      expect(waterway).toBe(0);
      expect(town.mapData.flat().some((t) => t.type === 'water')).toBe(true); // the band
    });
  });

  // The archetype is strictly additive: ordinary towns (landlocked, river band,
  // coast) must come out BYTE-IDENTICAL to the pre-fork generator. Fixtures were
  // captured from the generator immediately before this feature landed.
  describe('ordinary towns are unchanged (fixture pins)', () => {
    const normalize = (town) => JSON.parse(JSON.stringify(town));

    test('landlocked village, seed 777', () => {
      expect(normalize(generateTownMap('village', 'Fixture', 'south', 777))).toEqual(legacyVillage777);
    });
    test('two-gate city, seed 12345', () => {
      expect(normalize(generateTownMap('city', 'Fixture', ['south', 'east'], 12345))).toEqual(legacyCity12345);
    });
    test('river-band town, seed 4242', () => {
      expect(normalize(generateTownMap('town', 'Fixture', 'south', 4242, true, 'EAST_WEST'))).toEqual(legacyRiverTown4242);
    });
    test('coastal town, seed 9001', () => {
      const water = { kind: 'coast', edges: { N: false, E: true, S: false, W: false } };
      expect(normalize(generateTownMap('town', 'Fixture', 'south', 9001, false, 'NORTH_SOUTH', 'grassland', water))).toEqual(legacyCoastTown9001);
    });
  });
});

// =============================================================================
// Canal city archetype (water towns Phase 2, #65): a harbour basin off the town
// square, one guaranteed channel to the open sea (plus a seeded second outlet
// that fences off a district), and windy 1-wide canal spokes threading the
// quarters. Canal water carries the additive `waterway: true` flag, foot lanes
// hug the banks (CANAL_BANK_COST quays) and cross on bridges, the reduced
// CANAL_BUILDING_CONFIG roster fits the wetter grid, and every #62 walkability
// invariant still holds. Debug-only in this cut (preset on /debug/tileset).
// =============================================================================
describe('canal city archetype (canal, water towns Phase 2)', () => {
  const isPathType = (t) => t === 'dirt_path' || t === 'stone_path' || t === 'town_square' || t === 'bridge';
  const COASTS = [
    { kind: 'coast', edges: { N: false, E: true, S: false, W: false }, archetype: 'canal' },
    { kind: 'coast', edges: { N: false, E: false, S: true, W: false }, archetype: 'canal' },
    { kind: 'coast', edges: { N: true, E: false, S: false, W: false }, archetype: 'canal' },
    { kind: 'coast', edges: { N: false, E: false, S: false, W: true }, archetype: 'canal' },
  ];
  const genCanal = (seed, water = COASTS[0], entry = 'south', size = 'city') =>
    generateTownMap(size, 'Lagoona', entry, seed, false, 'NORTH_SOUTH', 'grassland', water);

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

  const adjacentToPath = (town, x, y) => [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => {
    const n = town.mapData[y + dy] && town.mapData[y + dy][x + dx];
    return n && isPathType(n.type);
  });

  test('the quay bank discount is exposed and sits between free and a grass step', () => {
    expect(CANAL_BANK_COST).toBeGreaterThan(0);
    expect(CANAL_BANK_COST).toBeLessThan(1);
  });

  test('seed survey (40 seeds x 4 coasts): basin, connected water, spokes, quays, bridges, floors, one network', () => {
    const canalSpokes = [];
    let totalBridges = 0;
    let townsWithDistricts = 0;

    COASTS.forEach((water, wi) => {
      for (let s = 1; s <= 10; s++) {
        const seed = s * 419 + wi * 7 + 3;
        const entry = s % 3 === 0 ? ['south', 'west'] : 'south';
        const town = genCanal(seed, water, entry);
        const ctx = `coast ${['E', 'S', 'N', 'W'][wi]} seed ${seed}`;
        const flat = town.mapData.flat();

        // the archetype carved and is described
        expect({ ctx, hasCanal: !!town.canal }).toEqual({ ctx, hasCanal: true });

        // BASIN: a 2x2 open-water pool, every tile waterway-flagged water
        expect(town.canal.basin).toHaveLength(4);
        town.canal.basin.forEach((p) => {
          const t = town.mapData[p.y][p.x];
          expect({ ctx, basinTile: `${t.type}/${!!t.waterway}` }).toEqual({ ctx, basinTile: 'water/true' });
        });

        // every remaining waterway WATER tile is connected to the basin AND the
        // basin drains to the open sea — water flows under bridges, so the flood
        // runs over water + bridge tiles (bridges keep the waterway flag)
        const wseen = new Set();
        const st = town.canal.basin.map((p) => [p.x, p.y]);
        st.forEach(([x, y]) => wseen.add(`${x},${y}`));
        let reachesSea = false;
        while (st.length) {
          const [cx, cy] = st.pop();
          for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const nx = cx + dx, ny = cy + dy;
            const t = town.mapData[ny] && town.mapData[ny][nx];
            if (!t || (t.type !== 'water' && t.type !== 'bridge') || wseen.has(`${nx},${ny}`)) continue;
            if (t.type === 'water' && !t.waterway) reachesSea = true;
            wseen.add(`${nx},${ny}`);
            st.push([nx, ny]);
          }
        }
        expect({ ctx, reachesSea }).toEqual({ ctx, reachesSea: true });
        const strandedCanal = flat.filter((t) => t.type === 'water' && t.waterway && !wseen.has(`${t.x},${t.y}`)).length;
        expect({ ctx, strandedCanal }).toEqual({ ctx, strandedCanal: 0 });

        // 3-5 windy canal spokes, and the carve stayed inside its tile budget's realm
        const spokes = (town.pathStats?.spokes || []).filter((sp) => sp.kind === 'canal');
        expect({ ctx, spokesOk: spokes.length >= 3 && spokes.length <= 5, n: spokes.length })
          .toEqual({ ctx, spokesOk: true, n: spokes.length });
        expect(town.canal.spokes).toBe(spokes.length);
        expect(town.canal.canalTileCount).toBeGreaterThan(4); // basin + at least a channel

        // walkability invariant (#62): ONE network containing the hub and every gate
        const comps = pathComponents(town);
        expect({ ctx, components: comps.length }).toEqual({ ctx, components: 1 });
        const net = comps[0];
        expect(net.has(`${town.centerPoint.x},${town.centerPoint.y}`)).toBe(true);
        town.entrances.forEach(({ pos }) => {
          expect({ ctx, gate: net.has(`${pos.x},${pos.y}`) }).toEqual({ ctx, gate: true });
        });

        // every building reachable from the hub on foot: non-house/manor/keep
        // buildings front a lane on the single hub network
        const misses = [];
        flat.forEach((t) => {
          if (t.type !== 'building') return;
          if (t.buildingType === 'house' || t.buildingType === 'manor' || t.buildingType === 'keep') return;
          if (!adjacentToPath(town, t.x, t.y)) misses.push(t.buildingType);
        });
        expect({ ctx, misses }).toEqual({ ctx, misses: [] });

        // density variant: no stables/mill in the lagoon city; exactly one boathouse,
        // moored on a canal/basin bank (waterway water, or a bridge laid over it)
        expect(flat.some((t) => t.buildingType === 'stables' || t.buildingType === 'mill')).toBe(false);
        const boathouses = flat.filter((t) => t.type === 'building' && t.buildingType === 'boathouse');
        expect({ ctx, boathouses: boathouses.length }).toEqual({ ctx, boathouses: 1 });
        const onBank = [[0, -1], [0, 1], [-1, 0], [1, 0]].some(([dx, dy]) => {
          const n = town.mapData[boathouses[0].y + dy] && town.mapData[boathouses[0].y + dy][boathouses[0].x + dx];
          return n && n.waterway;
        });
        expect({ ctx, onBank }).toEqual({ ctx, onBank: true });
        // the harbour roster still ships
        expect(flat.some((t) => t.buildingType === 'harbormaster')).toBe(true);

        // grass floors (quest-injection supply): >= 10 free grass in the core, every
        // reserved tile still free grass, >= 4 free grass in each fenced-off district
        const freeGrass = flat.filter((t) => t.type === 'grass' && !t.poi).length;
        expect({ ctx, floor10: freeGrass >= 10, freeGrass }).toEqual({ ctx, floor10: true, freeGrass });
        town.canal.reservedTiles.forEach((p) => {
          const t = town.mapData[p.y][p.x];
          expect({ ctx, reserved: `${t.type}/${t.poi || ''}` }).toEqual({ ctx, reserved: 'grass/' });
        });
        town.canal.districts.forEach((district, di) => {
          const dGrass = district.filter((p) => {
            const t = town.mapData[p.y][p.x];
            return t.type === 'grass' && !t.poi;
          }).length;
          expect({ ctx, di, districtFloor: dGrass >= 4, dGrass }).toEqual({ ctx, di, districtFloor: true, dGrass });
        });

        // bridges knit the quarters: whenever a district was fenced off, at least one
        // crossing exists (the single-component assert above is the general guarantee
        // that every lane-crossed canal got its bridge)
        const bridges = flat.filter((t) => t.type === 'bridge').length;
        totalBridges += bridges;
        if (town.canal.districts.length > 0) {
          townsWithDistricts++;
          expect({ ctx, bridgedDistrict: bridges >= 1 }).toEqual({ ctx, bridgedDistrict: true });
        }

        // collect canal-spoke windiness (asserted in aggregate below)
        spokes.forEach((sp) => { if (sp.straight >= 4) canalSpokes.push(sp); });
      }
    });

    // the canals meander like the foot paths do (same seeded cost-noise technique)
    const avg = (arr, f) => arr.reduce((a, sp) => a + f(sp), 0) / arr.length;
    expect(canalSpokes.length).toBeGreaterThan(60);
    expect(avg(canalSpokes, (sp) => sp.bends)).toBeGreaterThanOrEqual(1.5);
    const avgRatio = avg(canalSpokes, (sp) => sp.length / sp.straight);
    expect(avgRatio).toBeGreaterThanOrEqual(1.05);
    expect(avgRatio).toBeLessThanOrEqual(2.5);
    // lanes do cross the canals across the survey (individual seeds may not need to)
    expect(totalBridges).toBeGreaterThan(100);
    // the seeded second outlet produces real fenced-off districts somewhere
    expect(townsWithDistricts).toBeGreaterThan(0);
  });

  test('canal city places the same building count on every seed (roster fits the density variant)', () => {
    const totals = new Set();
    let boathouses = 0;
    for (let seed = 100; seed < 140; seed++) {
      const town = genCanal(seed, COASTS[seed % COASTS.length]);
      let n = 0;
      town.mapData.forEach((row) => row.forEach((t) => {
        if (t.type === 'building') n++;
        if (t.buildingType === 'boathouse') boathouses++;
      }));
      totals.add(n);
    }
    expect([...totals]).toHaveLength(1);
    expect(boathouses).toBe(40); // exactly one per city, every seed
  });

  test('same seed twice is identical (map, path stats, canal descriptor)', () => {
    const a = genCanal(90210, COASTS[1], ['south', 'west']);
    const b = genCanal(90210, COASTS[1], ['south', 'west']);
    expect(JSON.stringify(a.mapData)).toBe(JSON.stringify(b.mapData));
    expect(JSON.stringify(a.pathStats)).toBe(JSON.stringify(b.pathStats));
    expect(JSON.stringify(a.canal)).toBe(JSON.stringify(b.canal));
  });

  test('canal on smaller sizes falls back to the plain coastal town (no basin, no waterway)', () => {
    ['hamlet', 'village', 'town'].forEach((size) => {
      const town = genCanal(777, COASTS[0], 'south', size);
      expect(town.canal).toBeUndefined();
      expect(town.mapData.flat().filter((t) => t.waterway).length).toBe(0);
      expect(town.mapData.flat().some((t) => t.type === 'water')).toBe(true); // the sea stays
    });
  });

  test('canal requires a coastal context: a lake city falls back to the plain lake town', () => {
    const lake = { kind: 'lake', edges: { N: true, E: false, S: false, W: false }, archetype: 'canal' };
    const town = generateTownMap('city', 'L', 'south', 777, false, 'NORTH_SOUTH', 'grassland', lake);
    expect(town.canal).toBeUndefined();
    expect(town.mapData.flat().filter((t) => t.waterway).length).toBe(0);
  });

  // The archetype is strictly additive: the nearest non-canal cousin (a coastal CITY
  // without the archetype, exercising keep/waterfront/wall paths) must come out
  // BYTE-IDENTICAL to the pre-Phase-2 generator. Captured immediately before this
  // feature landed, extending the Phase 1 fixture pins.
  test('coastal city without the archetype is unchanged (fixture pin, seed 3131)', () => {
    const water = { kind: 'coast', edges: { N: false, E: true, S: false, W: false } };
    const town = JSON.parse(JSON.stringify(generateTownMap('city', 'Fixture', ['south', 'west'], 3131, false, 'NORTH_SOUTH', 'grassland', water)));
    expect(town).toEqual(legacyCoastCity3131);
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
