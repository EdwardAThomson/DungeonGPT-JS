// worldAssembler tests — the EXPERIMENTAL chunk-assembly prototype (issue #60, plan step 3).
// Connectivity definition used throughout: walkable-land BFS (4-directional over non-water
// tiles, beach walkable) from the heart's starting town, plus a per-seam ROAD guarantee
// (every land-land gate pair carries hasPath on both sides). See analyzeConnectivity.

import {
  assembleWorld,
  chunkSeed,
  gatePoint,
  detectCoast,
  analyzeConnectivity,
  CHUNK_SIZE,
} from './worldAssembler';
import { generateMapData } from './mapGenerator';
import legacy4242 from './__fixtures__/legacyMap_seed4242.json';
import legacy1337 from './__fixtures__/legacyMap_seed1337.json';

const EDGE_INDEX = { north: 0, east: 1, south: 2, west: 3 };

describe('legacy byte-identical guard', () => {
  // Fixtures were captured from the UNTOUCHED generator (before the options param landed).
  // A legacy-shaped call must still produce the exact same maps.
  it('generateMapData(10,10,4242) is unchanged by the generator modifications', () => {
    expect(generateMapData(10, 10, 4242)).toEqual(legacy4242);
  });

  it('generateMapData(10,10,1337) is unchanged by the generator modifications', () => {
    expect(generateMapData(10, 10, 1337)).toEqual(legacy1337);
  });

  it('an explicit empty options object is byte-identical to the legacy call', () => {
    expect(generateMapData(10, 10, 4242, {}, 'grassland', {})).toEqual(legacy4242);
  });
});

describe('generator options (chunk-assembly hooks)', () => {
  it('coast: null suppresses the coast entirely', () => {
    const map = generateMapData(10, 10, 4242, {}, 'grassland', { coast: null });
    const coastal = map.flat().filter((t) => t.descriptionSeed === 'The coastal sea' || t.descriptionSeed === 'A sandy beach');
    expect(coastal).toHaveLength(0);
    expect(detectCoast(map)).toBeNull();
  });

  it('coast: { edge, depth } stamps the prescribed band', () => {
    for (const edge of [0, 1, 2, 3]) {
      const map = generateMapData(10, 10, 999, {}, 'grassland', { coast: { edge, depth: 3 } });
      const detected = detectCoast(map);
      expect(detected).toEqual({ edge, depth: 3 });
    }
  });

  it('lakeBorderMargin: 2 keeps lake water AND its shore ring off the map border', () => {
    for (let s = 1; s <= 20; s++) {
      const map = generateMapData(10, 10, s * 31, {}, 'grassland', { coast: null, lakeBorderMargin: 2 });
      map.flat().forEach((t) => {
        const onBorder = t.x === 0 || t.x === 9 || t.y === 0 || t.y === 9;
        if (!onBorder) return;
        expect(t.descriptionSeed).not.toBe('A clear lake');
        expect(t.descriptionSeed).not.toBe('A sandy lakeshore');
      });
    }
  });

  it('townDensityFactor thins settlements on average', () => {
    let full = 0;
    let sparse = 0;
    for (let s = 1; s <= 15; s++) {
      full += generateMapData(10, 10, s * 41).flat().filter((t) => t.poi === 'town').length;
      sparse += generateMapData(10, 10, s * 41, {}, 'grassland', { townDensityFactor: 0.65 })
        .flat().filter((t) => t.poi === 'town').length;
    }
    expect(sparse).toBeLessThan(full);
    expect(sparse).toBeGreaterThan(full * 0.4); // sparser wilds, not empty ones
  });
});

describe('chunkSeed / gatePoint determinism', () => {
  it('chunkSeed is stable and varies with every input', () => {
    expect(chunkSeed(4242, 1, 2)).toBe(chunkSeed(4242, 1, 2));
    const seen = new Set();
    for (let cx = 0; cx < 5; cx++) {
      for (let cy = 0; cy < 5; cy++) {
        seen.add(chunkSeed(4242, cx, cy));
      }
    }
    expect(seen.size).toBe(25); // no collisions on a small grid
    expect(chunkSeed(4242, 1, 2)).not.toBe(chunkSeed(4243, 1, 2));
    expect(chunkSeed(4242, 1, 2)).not.toBe(chunkSeed(4242, 2, 1)); // not symmetric in cx/cy
  });

  it('gatePoint is stable, edge-specific, and clear of chunk corners (2..7)', () => {
    expect(gatePoint(4242, 'v:0,1')).toBe(gatePoint(4242, 'v:0,1'));
    for (let s = 1; s <= 30; s++) {
      for (const id of ['v:0,0', 'v:1,2', 'h:0,0', 'h:2,1']) {
        const g = gatePoint(s * 977, id);
        expect(g).toBeGreaterThanOrEqual(2);
        expect(g).toBeLessThanOrEqual(7);
      }
    }
  });
});

describe('assembleWorld', () => {
  const SEED = 4242;
  const build = (n = 3, seed = SEED) => assembleWorld({ worldSeed: seed, chunksX: n, chunksY: n });

  it('returns a flat grid of the right size with world coordinates on every tile', () => {
    const { mapData } = build(3);
    expect(mapData).toHaveLength(30);
    mapData.forEach((row, y) => {
      expect(row).toHaveLength(30);
      row.forEach((tile, x) => {
        expect(tile.x).toBe(x);
        expect(tile.y).toBe(y);
      });
    });
  });

  it('is deterministic: same worldSeed + size => identical assembled grids and reports', () => {
    const a = build(3);
    const b = build(3);
    expect(a.mapData).toEqual(b.mapData);
    expect(a.report).toEqual(b.report);
  });

  it('heart chunk interior matches the legacy 10x10 world (roads only ever added)', () => {
    const { mapData, report } = build(3);
    const legacy = generateMapData(10, 10, SEED);
    const { cx, cy } = report.heart;
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const a = mapData[cy * 10 + y][cx * 10 + x];
        const l = legacy[y][x];
        expect(a.biome).toBe(l.biome);
        expect(a.poi).toBe(l.poi);
        expect(a.townName).toBe(l.townName);
        expect(a.townSize).toBe(l.townSize);
        expect(a.beachDirection).toBe(l.beachDirection);
        expect(!!a.isStartingTown).toBe(!!l.isStartingTown);
        expect(!!a.hasRiver).toBe(!!l.hasRiver);
        if (l.hasPath) expect(a.hasPath).toBe(true); // gate overlay is strictly additive
      }
    }
  });

  it('a 1x1 world is just the heart: no gates, no seams', () => {
    const { mapData, report } = build(1);
    expect(mapData).toHaveLength(10);
    expect(report.gates).toEqual([]);
    expect(report.seams).toEqual([]);
    expect(report.chunks).toHaveLength(1);
    expect(report.chunks[0].kind).toBe('heart');
  });

  it('classifies chunks off the heart coast edge: coastline continues, beyond is ocean, elsewhere inland', () => {
    const { report } = build(3);
    const { heart, oceanEdge } = report;
    for (const c of report.chunks) {
      if (c.kind === 'heart') continue;
      const beyond = oceanEdge === 0 ? c.cy < heart.cy
        : oceanEdge === 1 ? c.cx > heart.cx
          : oceanEdge === 2 ? c.cy > heart.cy
            : c.cx < heart.cx;
      const inline = (oceanEdge === 0 || oceanEdge === 2) ? c.cy === heart.cy : c.cx === heart.cx;
      expect(c.kind).toBe(beyond ? 'ocean' : inline ? 'coastal' : 'inland');
      if (c.kind === 'ocean') expect(c.waterPct).toBe(1);
      if (c.kind === 'inland') expect(c.coastDepth).toBeNull();
      if (c.kind === 'coastal') {
        expect(c.coastDepth).toBeGreaterThanOrEqual(2);
        expect(c.coastDepth).toBeLessThanOrEqual(3);
        expect(Math.abs(c.coastDepth - report.heartCoastDepth)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('coast continuity: every seam the coastline crosses keeps its water band within ±1', () => {
    const { report } = build(3);
    const coastSeams = report.seams.filter((s) => s.crossesCoast);
    expect(coastSeams.length).toBeGreaterThan(0);
    coastSeams.forEach((s) => expect(s.coastBandOk).toBe(true));
  });

  it('non-ocean world edges carry no coast (land chunks never grow a second coastline)', () => {
    const { mapData, report } = build(3);
    // Every "coastal sea" tile must sit within 3 tiles of the ocean side of the world in
    // its own chunk's coast band; simplest global check: no coastal-sea water outside the
    // ocean-side band of each land chunk. Ocean chunks are 'The open sea'.
    const bandDepth = 3;
    mapData.flat().forEach((t) => {
      if (t.descriptionSeed !== 'The coastal sea') return;
      const local = report.oceanEdge === 0 ? t.y % CHUNK_SIZE
        : report.oceanEdge === 1 ? CHUNK_SIZE - 1 - (t.x % CHUNK_SIZE)
          : report.oceanEdge === 2 ? CHUNK_SIZE - 1 - (t.y % CHUNK_SIZE)
            : t.x % CHUNK_SIZE;
      expect(local).toBeLessThan(bandDepth);
    });
  });

  it('land-land seams: no water/land hard edges, and exact biome continuity stays high', () => {
    const { report } = build(3);
    expect(report.seams.length).toBeGreaterThan(0);
    report.seams.forEach((s) => {
      // The hard guarantee: no water-against-land guillotine pairs, except the single
      // +-1 wobble tile where the coast band crosses a seam.
      expect(s.compatiblePct).toBeGreaterThanOrEqual(s.crossesCoast ? 0.9 : 1);
    });
  });

  it('gates: every land-land seam has exactly one gate and roads reach both sides', () => {
    const { mapData, report } = build(3);
    expect(report.gates.length).toBe(report.seams.length);
    for (const g of report.gates) {
      const a = mapData[g.a.y][g.a.x];
      const b = mapData[g.b.y][g.b.x];
      expect(a.hasPath).toBe(true);
      expect(b.hasPath).toBe(true);
      // The crossing itself is stitched: each gate tile points at its partner.
      expect(a.pathConnections).toContain(g.dirAtoB);
      expect(b.pathConnections).toContain(g.dirAtoB === 'east' ? 'west' : 'north');
      // Gate tiles are never water.
      expect(a.biome).not.toBe('water');
      expect(b.biome).not.toBe('water');
    }
  });

  it('connectivity: every town reaches the heart starting town over walkable land', () => {
    const { report } = build(3);
    expect(report.connectivity.totalTowns).toBeGreaterThan(0);
    expect(report.connectivity.unreachable).toEqual([]);
    expect(report.connectivity.ok).toBe(true);
  });

  it('customNames resolve in the heart chunk only', () => {
    const names = ['Cogsworth', 'Tinker-Row', 'Brasswick'];
    const { mapData, report } = assembleWorld({ worldSeed: 7, chunksX: 3, chunksY: 3, customNames: { towns: names } });
    const { cx, cy } = report.heart;
    const named = mapData.flat().filter((t) => names.includes(t.townName));
    expect(named.length).toBe(names.length);
    named.forEach((t) => {
      expect(Math.floor(t.x / CHUNK_SIZE)).toBe(cx);
      expect(Math.floor(t.y / CHUNK_SIZE)).toBe(cy);
    });
  });

  it('outer land chunks are sparser than the heart on average (~65% settlement density)', () => {
    let heartTowns = 0;
    let outerTowns = 0;
    let outerChunks = 0;
    let worlds = 0;
    for (let s = 1; s <= 10; s++) {
      const { report } = build(3, s * 733);
      worlds++;
      for (const c of report.chunks) {
        if (c.kind === 'heart') heartTowns += c.towns;
        else if (c.kind !== 'ocean') { outerTowns += c.towns; outerChunks++; }
      }
    }
    const heartAvg = heartTowns / worlds;
    const outerAvg = outerTowns / outerChunks;
    expect(outerAvg).toBeLessThan(heartAvg);
    expect(outerAvg).toBeGreaterThan(heartAvg * 0.35);
  });
});

describe('3x3 seed survey (a few dozen seeds)', () => {
  const N = 30;
  const results = [];

  beforeAll(() => {
    for (let i = 1; i <= N; i++) {
      const worldSeed = i * 1013 + 7;
      results.push({ worldSeed, ...assembleWorld({ worldSeed, chunksX: 3, chunksY: 3 }) });
    }
  });

  it('never crashes and always produces a full 30x30 grid', () => {
    for (const { mapData } of results) {
      expect(mapData).toHaveLength(30);
      expect(mapData.every((row) => row.length === 30 && row.every(Boolean))).toBe(true);
    }
  });

  it('ocean side is consistent: ocean chunks all sit beyond the heart coast edge', () => {
    for (const { report } of results) {
      const { heart, oceanEdge } = report;
      for (const c of report.chunks) {
        if (c.kind !== 'ocean') continue;
        const beyond = oceanEdge === 0 ? c.cy < heart.cy
          : oceanEdge === 1 ? c.cx > heart.cx
            : oceanEdge === 2 ? c.cy > heart.cy
              : c.cx < heart.cx;
        expect(beyond).toBe(true);
      }
    }
  });

  it('no floating half-lakes at seams: lake water never touches a chunk border', () => {
    for (const { mapData } of results) {
      mapData.flat().forEach((t) => {
        if (t.descriptionSeed !== 'A clear lake') return;
        const lx = t.x % CHUNK_SIZE;
        const ly = t.y % CHUNK_SIZE;
        expect(lx).toBeGreaterThan(0);
        expect(lx).toBeLessThan(CHUNK_SIZE - 1);
        expect(ly).toBeGreaterThan(0);
        expect(ly).toBeLessThan(CHUNK_SIZE - 1);
      });
    }
  });

  it('outer-chunk lakes keep the full 2-tile seam margin (heart keeps its legacy 1)', () => {
    for (const { mapData, report } of results) {
      const { cx: hx, cy: hy } = report.heart;
      mapData.flat().forEach((t) => {
        if (t.descriptionSeed !== 'A clear lake') return;
        if (Math.floor(t.x / CHUNK_SIZE) === hx && Math.floor(t.y / CHUNK_SIZE) === hy) return;
        const lx = t.x % CHUNK_SIZE;
        const ly = t.y % CHUNK_SIZE;
        expect(lx).toBeGreaterThanOrEqual(2);
        expect(lx).toBeLessThanOrEqual(CHUNK_SIZE - 3);
        expect(ly).toBeGreaterThanOrEqual(2);
        expect(ly).toBeLessThanOrEqual(CHUNK_SIZE - 3);
      });
    }
  });

  it('coast bands stay within the ±1 wobble across every crossed seam', () => {
    const broken = [];
    for (const { worldSeed, report } of results) {
      for (const s of report.seams) {
        if (s.crossesCoast && !s.coastBandOk) broken.push({ worldSeed, seam: s.between });
      }
    }
    expect(broken).toEqual([]);
  });

  // Seam-quality floors, tuned to what the blend achieves (measured over 40 seeds / 280
  // seams: exact biome match avg 0.94; >= 0.6 on ~95% of seams — the exceptions are heart
  // lake-shore rings on the heart border, beach meeting grass exactly as inside any legacy
  // map; compatiblePct min 1.0 on land seams, 0.9 on coast-crossing seams).
  it('land seams: >= 60% exact biome continuity on at least 90% of seams, avg >= 0.85', () => {
    let total = 0;
    let above60 = 0;
    let sum = 0;
    for (const { report } of results) {
      for (const s of report.seams) {
        total++;
        sum += s.biomeMatchPct;
        if (s.biomeMatchPct >= 0.6) above60++;
      }
    }
    expect(total).toBeGreaterThan(0);
    expect(above60 / total).toBeGreaterThanOrEqual(0.9);
    expect(sum / total).toBeGreaterThanOrEqual(0.85);
  });

  it('land seams: never a water/land hard edge (coast seams get the single wobble tile)', () => {
    const violations = [];
    for (const { worldSeed, report } of results) {
      for (const s of report.seams) {
        const floor = s.crossesCoast ? 0.9 : 1;
        if (s.compatiblePct < floor) violations.push({ worldSeed, seam: s.between, pct: s.compatiblePct });
      }
    }
    expect(violations).toEqual([]);
  });

  it('walkable-land connectivity holds on every seed (all towns reach the starting town)', () => {
    const failures = [];
    for (const { worldSeed, mapData } of results) {
      const conn = analyzeConnectivity(mapData);
      if (!conn.ok) failures.push({ worldSeed, unreachable: conn.unreachable });
    }
    expect(failures).toEqual([]);
  });

  it('every land-land gate carries a road on both sides on every seed', () => {
    const failures = [];
    for (const { worldSeed, mapData, report } of results) {
      for (const g of report.gates) {
        const a = mapData[g.a.y][g.a.x];
        const b = mapData[g.b.y][g.b.x];
        if (!a.hasPath || !b.hasPath) failures.push({ worldSeed, gate: g.edgeId });
      }
    }
    expect(failures).toEqual([]);
  });
});
