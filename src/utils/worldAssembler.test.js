// worldAssembler tests — the EXPERIMENTAL chunk-assembly prototype (issue #60, plan step 3).
// Connectivity definition used throughout: walkable-land BFS (4-directional over non-water
// tiles, beach walkable) from the heart's starting town, plus a per-seam ROAD guarantee
// (every land-land gate pair carries hasPath on both sides). See analyzeConnectivity.

import {
  assembleWorld,
  chunkSeed,
  gatePoint,
  detectCoast,
  buildCoastProfile,
  analyzeConnectivity,
  CHUNK_SIZE,
} from './worldAssembler';
import { generateMapData } from './mapGenerator';
import legacy4242 from './__fixtures__/legacyMap_seed4242.json';
import legacy1337 from './__fixtures__/legacyMap_seed1337.json';

const EDGE_INDEX = { north: 0, east: 1, south: 2, west: 3 };

describe('legacy byte-identical guard', () => {
  // Fixtures pin the DEFAULT no-options generator output. Originally captured before
  // the options param landed; deliberately RE-CAPTURED 2026-07 when the universal
  // water-adjacent settlement bias (#67) landed: the bias applies to all new worlds
  // (the doctrine: the premium boundary is the archetype, not the river), and the
  // chunk assembler's scheme is EXPERIMENTAL/not frozen (LARGER_WORLDS_PLAN section 7a),
  // so no shipped heart-chunk continuity promise pinned the old placement.
  // A legacy-shaped call must still produce the exact same maps as an options call.
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

  it('coast: { edge, depths } stamps a variable-depth band that follows the array', () => {
    const depths = [2, 2, 2, 3, 3, 3, 3, 2, 2, 2];
    const map = generateMapData(10, 10, 999, {}, 'grassland', { coast: { edge: 0, depths } });
    for (let i = 0; i < 10; i++) {
      for (let d = 0; d < 4; d++) {
        const t = map[d][i];
        if (d < depths[i] - 1) expect(t.biome).toBe('water');
        else if (d === depths[i] - 1) expect(t.biome).toBe('beach');
        // Beyond the band: never water. Beach IS allowed one row past it right at a depth
        // step (the convex diagonal corner wedge — see the corner-treatment test below).
        else expect(t.biome).not.toBe('water');
      }
    }
  });

  it('coast depth steps get the lake-style diagonal corner treatment (beachDirection 4-11)', () => {
    // North coast, deepening 2->3 between i=2/3 and shallowing 3->2 between i=6/7.
    // maxLakes: 0 so every shore on the map belongs to the coast (unambiguous labels).
    const depths = [2, 2, 2, 3, 3, 3, 3, 2, 2, 2];
    const map = generateMapData(10, 10, 999, {}, 'grassland', { coast: { edge: 0, depths }, maxLakes: 0 });
    // Deepening step: the inner corner beach is a CONCAVE chamfer (water N+E -> code 4)
    // and the outer land corner becomes a CONVEX wedge (water only at NE diagonal -> 8).
    expect(map[1][2].biome).toBe('beach');
    expect(map[1][2].beachDirection).toBe(4);
    expect(map[2][2].biome).toBe('beach');
    expect(map[2][2].beachDirection).toBe(8);
    // Shallowing step, mirrored: concave water N+W -> 7; convex water at NW diagonal -> 11.
    expect(map[1][7].biome).toBe('beach');
    expect(map[1][7].beachDirection).toBe(7);
    expect(map[2][7].biome).toBe('beach');
    expect(map[2][7].beachDirection).toBe(11);
    // Straight sections are unchanged: plain edge-facing beach (code 0 for a north coast).
    expect(map[1][0].beachDirection).toBe(0);
    expect(map[1][1].beachDirection).toBe(0);
    expect(map[2][4].beachDirection).toBe(0);
    expect(map[2][5].beachDirection).toBe(0);
    // Coast shores are labeled as sea beaches, never lakeshores (later placements — a
    // town may legitimately sit on a beach tile — can overwrite the description, so
    // assert the positive label only where nothing was placed on top).
    expect(map.flat().some((t) => t.descriptionSeed === 'A sandy lakeshore')).toBe(false);
    [map[1][2], map[2][2], map[1][7], map[2][7]].forEach((t) => {
      if (!t.poi) expect(t.descriptionSeed).toBe('A sandy beach');
    });
    // And the smoothing leaves no bare land touching coast water, even diagonally.
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        if (map[y][x].biome !== 'plains') continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const n = map[y + dy] && map[y + dy][x + dx];
          if (n) expect(n.biome).not.toBe('water');
        }
      }
    }
  });

  it('maxLakes: 0 suppresses lakes entirely; maxLakes: 1 never places the companion lake', () => {
    for (let s = 1; s <= 15; s++) {
      const none = generateMapData(10, 10, s * 53, {}, 'grassland', { maxLakes: 0 });
      expect(none.flat().some((t) => t.descriptionSeed === 'A clear lake')).toBe(false);
      expect(none.flat().some((t) => t.descriptionSeed === 'A sandy lakeshore')).toBe(false);
    }
    // maxLakes: 1 — count connected lake components; never more than one.
    const components = (map) => {
      const seen = new Set();
      let count = 0;
      const isLake = (x, y) => map[y] && map[y][x]
        && map[y][x].biome === 'water' && map[y][x].descriptionSeed === 'A clear lake';
      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
          if (!isLake(x, y) || seen.has(`${x},${y}`)) continue;
          count++;
          const stack = [[x, y]];
          seen.add(`${x},${y}`);
          while (stack.length) {
            const [cx, cy] = stack.pop();
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              if (isLake(cx + dx, cy + dy) && !seen.has(`${cx + dx},${cy + dy}`)) {
                seen.add(`${cx + dx},${cy + dy}`);
                stack.push([cx + dx, cy + dy]);
              }
            }
          }
        }
      }
      return count;
    };
    for (let s = 1; s <= 15; s++) {
      expect(components(generateMapData(10, 10, s * 53, {}, 'grassland', { maxLakes: 1 }))).toBeLessThanOrEqual(1);
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

describe('buildCoastProfile (world-level coast depth profile)', () => {
  // 3x3-like shape: 30 tiles along the coast, heart span at 10..19.
  const LEN = 30;
  const ANCHOR = 10;

  it('is deterministic and anchored: heart span exactly equals the heart depth', () => {
    for (const anchorDepth of [2, 3]) {
      for (let s = 1; s <= 20; s++) {
        const a = buildCoastProfile(s * 617, LEN, ANCHOR, anchorDepth);
        const b = buildCoastProfile(s * 617, LEN, ANCHOR, anchorDepth);
        expect(a).toEqual(b);
        expect(a).toHaveLength(LEN);
        for (let i = ANCHOR; i < ANCHOR + CHUNK_SIZE; i++) expect(a[i]).toBe(anchorDepth);
      }
    }
  });

  it('stays within [2,3], steps by at most 1, holds interior runs of >= 3 tiles', () => {
    for (let s = 1; s <= 20; s++) {
      const p = buildCoastProfile(s * 617, LEN, ANCHOR, 2 + (s % 2));
      p.forEach((d) => {
        expect(d).toBeGreaterThanOrEqual(2);
        expect(d).toBeLessThanOrEqual(3);
      });
      // Collect runs (start index + length); runs truncated by the world edge (touching
      // index 0 or LEN-1) may legitimately be shorter than the 3-tile hold.
      const runs = [];
      let start = 0;
      for (let i = 1; i <= LEN; i++) {
        if (i === LEN || p[i] !== p[i - 1]) {
          if (i < LEN) expect(Math.abs(p[i] - p[i - 1])).toBe(1);
          runs.push({ start, len: i - start });
          start = i;
        }
      }
      runs.forEach((r) => {
        if (r.start === 0 || r.start + r.len === LEN) return; // world-edge truncation
        expect(r.len).toBeGreaterThanOrEqual(3);
      });
    }
  });

  it('never steps exactly at a chunk boundary (both sides of every seam share a depth)', () => {
    for (let s = 1; s <= 40; s++) {
      const p = buildCoastProfile(s * 617, LEN, ANCHOR, 2 + (s % 2));
      for (let seam = CHUNK_SIZE; seam < LEN; seam += CHUNK_SIZE) {
        expect(p[seam]).toBe(p[seam - 1]);
      }
    }
  });

  it('the wobble exists: depth varies along the coastline on every 3x3-shaped profile', () => {
    for (let s = 1; s <= 40; s++) {
      const p = buildCoastProfile(s * 617, LEN, ANCHOR, 2 + (s % 2));
      expect(new Set(p).size).toBeGreaterThan(1);
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
      if (c.kind === 'inland') expect(c.coastDepths).toBeNull();
      if (c.kind === 'coastal') {
        // The chunk's slice of the world-level profile: every depth in placeCoast's own
        // range, and equal to the profile slice for this chunk's span.
        expect(c.coastDepths).toHaveLength(CHUNK_SIZE);
        c.coastDepths.forEach((d) => {
          expect(d).toBeGreaterThanOrEqual(2);
          expect(d).toBeLessThanOrEqual(3);
        });
        const alongIsY = oceanEdge === 1 || oceanEdge === 3;
        const sliceStart = (alongIsY ? c.cy : c.cx) * CHUNK_SIZE;
        expect(c.coastDepths).toEqual(report.coastProfile.slice(sliceStart, sliceStart + CHUNK_SIZE));
      }
    }
  });

  it('coast continuity: the water band is EQUAL on both sides of every crossed seam', () => {
    const { report } = build(3);
    const coastSeams = report.seams.filter((s) => s.crossesCoast);
    expect(coastSeams.length).toBeGreaterThan(0);
    coastSeams.forEach((s) => expect(s.coastBandOk).toBe(true)); // strict equality now
  });

  it('the world coast profile is anchored on the heart and wobbles beyond it', () => {
    const { report } = build(3);
    const { coastProfile, heart, oceanEdge, heartCoastDepth } = report;
    const anchorStart = ((oceanEdge === 1 || oceanEdge === 3) ? heart.cy : heart.cx) * CHUNK_SIZE;
    for (let i = anchorStart; i < anchorStart + CHUNK_SIZE; i++) {
      expect(coastProfile[i]).toBe(heartCoastDepth); // heart interior cannot change
    }
    expect(new Set(coastProfile).size).toBeGreaterThan(1); // the wobble exists
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

  it('land-land seams: no water/land hard edges anywhere', () => {
    const { report } = build(3);
    expect(report.seams.length).toBeGreaterThan(0);
    report.seams.forEach((s) => {
      // The hard guarantee: no water-against-land guillotine pairs. With the world-level
      // coast profile the band matches exactly at seams, so this holds on coast seams too.
      expect(s.compatiblePct).toBe(1);
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

  it('coast bands are EQUAL on both sides of every crossed seam (no depth step)', () => {
    const broken = [];
    for (const { worldSeed, report } of results) {
      for (const s of report.seams) {
        if (s.crossesCoast && !s.coastBandOk) broken.push({ worldSeed, seam: s.between });
      }
    }
    expect(broken).toEqual([]);
  });

  it('the coastline wobbles on every seed (along-coast depth variance > 0)', () => {
    for (const { report } of results) {
      expect(new Set(report.coastProfile).size).toBeGreaterThan(1);
    }
  });

  it('zero unsmoothed right-angle water corners: no bare land tile touches water, even diagonally', () => {
    // Every water body (coast band incl. its depth steps, lakes, ocean) must be fully
    // ringed by beach — a bare land tile diagonally against water is exactly the hard
    // stair corner the lake-style diagonal treatment eliminates.
    const violations = [];
    for (const { worldSeed, mapData } of results) {
      const H = mapData.length;
      const W = mapData[0].length;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const t = mapData[y][x];
          if (t.biome === 'water' || t.biome === 'beach') continue;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            const n = mapData[y + dy] && mapData[y + dy][x + dx];
            if (n && n.biome === 'water') violations.push({ worldSeed, x, y, biome: t.biome });
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('no diagonal corner piece ever straddles a seam (depth equal across every boundary)', () => {
    // Corner pieces only exist AT depth steps; the profile never steps on a chunk
    // boundary, so the tiles facing each other across a seam always share a depth and a
    // diagonal transition is always fully contained within one chunk.
    for (const { report } of results) {
      const p = report.coastProfile;
      for (let seam = CHUNK_SIZE; seam < p.length; seam += CHUNK_SIZE) {
        expect(p[seam]).toBe(p[seam - 1]);
      }
    }
  });

  it('world-level lake allocation: outer land chunks average well below one lake each', () => {
    let outerChunks = 0;
    let outerLakes = 0;
    let outerChunksWithLakes = 0;
    let worldsWithOuterLakes = 0;
    for (const { report } of results) {
      let thisWorld = 0;
      for (const c of report.chunks) {
        if (c.kind !== 'coastal' && c.kind !== 'inland') continue;
        outerChunks++;
        outerLakes += c.lakes;
        if (c.lakes > 0) { outerChunksWithLakes++; thisWorld++; }
        if (!c.lakesGranted) expect(c.lakes).toBe(0); // suppression actually suppresses
      }
      if (thisWorld > 0) worldsWithOuterLakes++;
    }
    const mean = outerLakes / outerChunks;
    // Target band: sparse wilds, not a lake district — but lakes still exist out there.
    expect(mean).toBeGreaterThanOrEqual(0.15);
    expect(mean).toBeLessThanOrEqual(0.55);
    expect(outerChunksWithLakes / outerChunks).toBeLessThan(0.5); // most outer chunks are lakeless
    expect(worldsWithOuterLakes).toBeGreaterThan(results.length / 2); // but not a dry world
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

  it('land seams: never a water/land hard edge (coast depths now match at seams)', () => {
    const violations = [];
    for (const { worldSeed, report } of results) {
      for (const s of report.seams) {
        if (s.compatiblePct < 1) violations.push({ worldSeed, seam: s.between, pct: s.compatiblePct });
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

describe('world lake cap (#63: a 3x3 world rolled 5 lakes under independent per-chunk odds)', () => {
  it('no world exceeds the cap, heart lakes included', () => {
    for (let seed = 500; seed < 530; seed++) {
      const { report } = assembleWorld({ worldSeed: seed, chunksX: 3, chunksY: 3 });
      const total = report.chunks.reduce((n, c) => n + (c.lakes || 0), 0);
      expect(total).toBeLessThanOrEqual(3);
    }
  });
});
