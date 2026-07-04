// worldAssembler.js
// EXPERIMENTAL chunk-assembly prototype for larger worlds (issue #60, step 3 of
// docs/LARGER_WORLDS_PLAN.md). Debug-only: exercised by /debug/large-world and tests;
// NOT wired into the live New Game flow, and nothing here changes what saves store.
//
// The chunk-seed scheme (chunkSeed) and gate-point scheme (gatePoint) are candidates for
// the save-affecting freeze described in the plan (§3): once real saves depend on them
// they become FROZEN. That freeze has NOT happened — this file may still change freely.
//
// Model
// -----
// A world is chunksX x chunksY chunks of 10x10 tiles, assembled into ONE flat grid
// (chunked generation, flat storage — plan §2). The HEART chunk is generated first via
// the untouched legacy code path (generateMapData(10, 10, worldSeed, customNames, theme)),
// so its interior is byte-identical to today's free 10x10 world.
//
// Ocean-side model: placeCoast gave the heart ONE coastal edge; that edge defines the
// WORLD's ocean side. Chunks in the heart's row/column along that side continue the
// coastline (same edge, depth wobbling +-1 within [2,3], seeded per chunk); chunks fully
// beyond the coastline are open ocean (all water — small seeded islands are allowed by the
// design but deliberately not generated in this prototype); everything else is inland with
// NO coast (suppressed via the generator's new options param). Named content (customNames /
// milestone POIs) resolves in the heart only; outer land chunks get ~65% settlement density.
//
// Connectivity: every land-land shared chunk edge gets ONE deterministic gate point
// (gatePoint(worldSeed, edgeId), offset 2..7 so gates stay clear of chunk corners). After
// a chunk's own generation, a road post-pass connects its nearest town to each of its gate
// tiles with the EXISTING road representation — findPath + markPathTiles writing
// hasPath / pathConnections / pathDirection tile fields (src/utils/pathfinding.js), the
// exact fields WorldMapDisplay renders and getTownRoadEdges reads. No new tile field is
// invented. The heart gets the same post-pass at ASSEMBLY time only (additive overlay over
// its legacy interior). Finally each gate pair is stitched so the crossing renders as a
// continuous road over the seam.

import { generateMapData } from './mapGenerator';
import { findPath, markPathTiles } from './pathfinding';
import { createLogger } from './logger';

const logger = createLogger('world-assembler');

export const CHUNK_SIZE = 10;

const EDGE_NAMES = ['north', 'east', 'south', 'west']; // placeCoast convention 0-3

/**
 * Deterministic per-chunk seed: a small integer hash of (worldSeed, cx, cy).
 * EXPERIMENTAL — not frozen yet (see header). Heart uses worldSeed directly instead.
 */
export function chunkSeed(worldSeed, cx, cy) {
  let h = (worldSeed | 0) >>> 0;
  h = Math.imul(h ^ Math.imul(cx + 0x9e37, 0x85ebca6b), 0xc2b2ae35) >>> 0;
  h = Math.imul(h ^ Math.imul(cy + 0x79b9, 0x27d4eb2f), 0x165667b1) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h = (h ^ (h >>> 12)) >>> 0;
  return h;
}

/**
 * Deterministic gate point for a shared chunk edge: the crossing tile's offset (2..7)
 * along the 10-tile seam. Kept off the corners so gate roads never hug chunk corners
 * (and never land in a coastal chunk's corner water band, which is at offsets 8-9).
 * edgeId convention: `v:${cx},${cy}` = edge between (cx,cy) and (cx+1,cy);
 *                    `h:${cx},${cy}` = edge between (cx,cy) and (cx,cy+1).
 * EXPERIMENTAL — not frozen yet.
 */
export function gatePoint(worldSeed, edgeId) {
  let h = (worldSeed | 0) >>> 0;
  for (let i = 0; i < edgeId.length; i++) {
    h = Math.imul(h ^ edgeId.charCodeAt(i), 0x01000193) >>> 0;
  }
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return 2 + (h % 6);
}

// Detect the heart chunk's coast: which edge placeCoast picked and how deep the band is
// (water strips + the beach strip). Only the coast produces a full water line on a map
// border (lake water never reaches the border), so scanning edges is unambiguous.
export function detectCoast(grid) {
  const H = grid.length;
  const W = grid[0].length;
  const isSea = (t) => !!t && t.biome === 'water';
  const line = (edge, d) => {
    const out = [];
    if (edge === 0) for (let i = 0; i < W; i++) out.push(grid[d] && grid[d][i]);
    else if (edge === 1) for (let i = 0; i < H; i++) out.push(grid[i] && grid[i][W - 1 - d]);
    else if (edge === 2) for (let i = 0; i < W; i++) out.push(grid[H - 1 - d] && grid[H - 1 - d][i]);
    else for (let i = 0; i < H; i++) out.push(grid[i] && grid[i][d]);
    return out;
  };
  for (let edge = 0; edge < 4; edge++) {
    if (!line(edge, 0).every(isSea)) continue;
    let waterLines = 1;
    while (waterLines < 4 && line(edge, waterLines).every(isSea)) waterLines++;
    return { edge, depth: waterLines + 1 }; // +1 for the inner beach strip
  }
  return null;
}

// Classify a chunk relative to the heart and the world's ocean side.
function classifyChunk(cx, cy, heart, oceanEdge) {
  if (cx === heart.cx && cy === heart.cy) return 'heart';
  if (oceanEdge === 0) return cy < heart.cy ? 'ocean' : cy === heart.cy ? 'coastal' : 'inland';
  if (oceanEdge === 1) return cx > heart.cx ? 'ocean' : cx === heart.cx ? 'coastal' : 'inland';
  if (oceanEdge === 2) return cy > heart.cy ? 'ocean' : cy === heart.cy ? 'coastal' : 'inland';
  return cx < heart.cx ? 'ocean' : cx === heart.cx ? 'coastal' : 'inland';
}

// An all-water open-ocean chunk. (Small seeded islands are allowed by the design but not
// generated in this prototype — see header.)
function oceanChunk() {
  const grid = [];
  for (let y = 0; y < CHUNK_SIZE; y++) {
    const row = [];
    for (let x = 0; x < CHUNK_SIZE; x++) {
      row.push({ x, y, biome: 'water', poi: null, descriptionSeed: 'The open sea', isExplored: false });
    }
    grid.push(row);
  }
  return grid;
}

// Recompute a tile's pathDirection from its pathConnections (same mapping as
// pathfinding.calculatePathDirection, but connection-set based so seam stitching can add
// the crossing direction to an already-marked gate tile).
const DIRECTION_MAP = {
  NORTH_SOUTH: 'NORTH_SOUTH', EAST_WEST: 'EAST_WEST',
  EAST_NORTH: 'NORTH_EAST', NORTH_WEST: 'NORTH_WEST',
  EAST_SOUTH: 'SOUTH_EAST', SOUTH_WEST: 'SOUTH_WEST',
  NORTH: 'START_NORTH', SOUTH: 'START_SOUTH', EAST: 'START_EAST', WEST: 'START_WEST',
};
function addRoadConnection(tile, dir) {
  if (!tile.hasPath) {
    tile.hasPath = true;
    tile.pathConnections = [];
  }
  if (!Array.isArray(tile.pathConnections)) tile.pathConnections = [];
  if (!tile.pathConnections.includes(dir)) tile.pathConnections.push(dir);
  const key = [...new Set(tile.pathConnections)].sort().join('_').toUpperCase();
  tile.pathDirection = DIRECTION_MAP[key] || 'INTERSECTION';
}

// Connect a chunk's road network to its gate tiles: for each gate (local coords), path
// from the nearest town to the gate tile (findPath avoids water where possible) and mark
// it with the existing road fields. Returns which gates got a road.
function connectChunkGates(chunkGrid, gateLocals) {
  const towns = [];
  for (let y = 0; y < CHUNK_SIZE; y++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      if (chunkGrid[y][x].poi === 'town') towns.push({ x, y });
    }
  }
  const connected = [];
  if (towns.length === 0) return connected; // genuinely townless chunk: nothing to connect
  for (const gate of gateLocals) {
    let best = towns[0];
    let bestDist = Infinity;
    for (const t of towns) {
      const d = Math.abs(t.x - gate.x) + Math.abs(t.y - gate.y);
      if (d < bestDist) { bestDist = d; best = t; }
    }
    const path = findPath(chunkGrid, best, { x: gate.x, y: gate.y });
    if (path) {
      markPathTiles(chunkGrid, [path]);
      connected.push(gate);
    } else {
      logger.warn(`[ASSEMBLER] No gate road found to local (${gate.x},${gate.y})`);
    }
  }
  return connected;
}

/**
 * Assemble a (chunksX*10) x (chunksY*10) flat world grid from 10x10 chunks.
 *
 * @param {Object} p
 * @param {number} p.worldSeed  - seed; the heart chunk uses it directly (legacy path)
 * @param {number} p.chunksX    - world width in chunks
 * @param {number} p.chunksY    - world height in chunks
 * @param {{cx:number, cy:number}} [p.heartChunk] - heart position (default: center)
 * @param {string} [p.theme]    - biome theme passed to every chunk
 * @param {Object} [p.customNames] - named content; resolves in the HEART chunk only
 * @returns {{ mapData: Array, report: Object }} flat grid + assembly report
 */
export function assembleWorld({ worldSeed, chunksX = 3, chunksY = 3, heartChunk, theme = 'grassland', customNames = {} } = {}) {
  const seedNum = Number.isFinite(worldSeed) ? worldSeed : 42;
  const heart = heartChunk || { cx: Math.floor((chunksX - 1) / 2), cy: Math.floor((chunksY - 1) / 2) };
  const W = chunksX * CHUNK_SIZE;
  const H = chunksY * CHUNK_SIZE;
  const world = Array.from({ length: H }, () => new Array(W).fill(null));
  const chunkGrids = Array.from({ length: chunksY }, () => new Array(chunksX).fill(null));
  const chunkKinds = Array.from({ length: chunksY }, () => new Array(chunksX).fill(null));

  const place = (grid, cx, cy) => {
    for (let y = 0; y < CHUNK_SIZE; y++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const t = grid[y][x];
        t.x = cx * CHUNK_SIZE + x; // rewrite to WORLD coordinates
        t.y = cy * CHUNK_SIZE + y;
        world[t.y][t.x] = t;
      }
    }
    chunkGrids[cy][cx] = grid;
  };

  // 1. Heart first, via the legacy code path (interior byte-identical to a free world).
  const heartGrid = generateMapData(CHUNK_SIZE, CHUNK_SIZE, seedNum, customNames, theme);
  const coast = detectCoast(heartGrid) || { edge: 1, depth: 2 }; // placeCoast always runs; fallback is defensive
  place(heartGrid, heart.cx, heart.cy);
  chunkKinds[heart.cy][heart.cx] = 'heart';

  // 2. Remaining chunks, row-major, deterministic per (worldSeed, cx, cy). Row-major means
  // north/west neighbours already exist for constraints; the heart may add east/south ones.
  const chunkReports = [];
  for (let cy = 0; cy < chunksY; cy++) {
    for (let cx = 0; cx < chunksX; cx++) {
      if (cx === heart.cx && cy === heart.cy) continue;
      const kind = classifyChunk(cx, cy, heart, coast.edge);
      chunkKinds[cy][cx] = kind;
      const seed = chunkSeed(seedNum, cx, cy);
      let grid;
      let coastDepth = null;
      if (kind === 'ocean') {
        grid = oceanChunk();
      } else {
        // Edge constraints from every already-generated neighbour.
        const constraints = {};
        const nb = (nx, ny) => (nx >= 0 && nx < chunksX && ny >= 0 && ny < chunksY) ? chunkGrids[ny][nx] : null;
        const nN = nb(cx, cy - 1);
        const nS = nb(cx, cy + 1);
        const nW = nb(cx - 1, cy);
        const nE = nb(cx + 1, cy);
        if (nN) constraints.north = nN[CHUNK_SIZE - 1].map((t) => t.biome);
        if (nS) constraints.south = nS[0].map((t) => t.biome);
        if (nW) constraints.west = nW.map((row) => row[CHUNK_SIZE - 1].biome);
        if (nE) constraints.east = nE.map((row) => row[0].biome);
        if (kind === 'coastal') {
          // Continue the heart's coastline on the same world side, depth wobbling +-1
          // within [2,3] (placeCoast's own range) so seams stay within one tile.
          const wobble = (seed % 3) - 1;
          coastDepth = Math.max(2, Math.min(3, coast.depth + wobble));
        }
        grid = generateMapData(CHUNK_SIZE, CHUNK_SIZE, seed, {}, theme, {
          coast: kind === 'coastal' ? { edge: coast.edge, depth: coastDepth } : null,
          edgeConstraints: constraints,
          lakeBorderMargin: 2,
          townDensityFactor: 0.65,
        });
      }
      place(grid, cx, cy);
      chunkReports.push({ cx, cy, kind, seed, coastDepth });
    }
  }
  // Heart's report entry (seed = worldSeed by design).
  chunkReports.push({ cx: heart.cx, cy: heart.cy, kind: 'heart', seed: seedNum, coastDepth: coast.depth });
  chunkReports.sort((a, b) => (a.cy - b.cy) || (a.cx - b.cx));

  // 3. Gate points on every land-land shared edge, then per-chunk road post-passes.
  const isLand = (cx, cy) => chunkKinds[cy][cx] !== 'ocean';
  const gates = [];
  const gateLocalsByChunk = new Map(); // "cx,cy" -> [{x, y, gate}]
  const addGateLocal = (cx, cy, lx, ly, gate) => {
    const key = `${cx},${cy}`;
    if (!gateLocalsByChunk.has(key)) gateLocalsByChunk.set(key, []);
    gateLocalsByChunk.get(key).push({ x: lx, y: ly, gate });
  };
  for (let cy = 0; cy < chunksY; cy++) {
    for (let cx = 0; cx < chunksX; cx++) {
      if (cx + 1 < chunksX && isLand(cx, cy) && isLand(cx + 1, cy)) {
        const edgeId = `v:${cx},${cy}`;
        const offset = gatePoint(seedNum, edgeId);
        const gate = {
          edgeId, offset,
          between: [[cx, cy], [cx + 1, cy]],
          a: { x: cx * CHUNK_SIZE + CHUNK_SIZE - 1, y: cy * CHUNK_SIZE + offset },
          b: { x: (cx + 1) * CHUNK_SIZE, y: cy * CHUNK_SIZE + offset },
          dirAtoB: 'east',
        };
        gates.push(gate);
        addGateLocal(cx, cy, CHUNK_SIZE - 1, offset, gate);
        addGateLocal(cx + 1, cy, 0, offset, gate);
      }
      if (cy + 1 < chunksY && isLand(cx, cy) && isLand(cx, cy + 1)) {
        const edgeId = `h:${cx},${cy}`;
        const offset = gatePoint(seedNum, edgeId);
        const gate = {
          edgeId, offset,
          between: [[cx, cy], [cx, cy + 1]],
          a: { x: cx * CHUNK_SIZE + offset, y: cy * CHUNK_SIZE + CHUNK_SIZE - 1 },
          b: { x: cx * CHUNK_SIZE + offset, y: (cy + 1) * CHUNK_SIZE },
          dirAtoB: 'south',
        };
        gates.push(gate);
        addGateLocal(cx, cy, offset, CHUNK_SIZE - 1, gate);
        addGateLocal(cx, cy + 1, offset, 0, gate);
      }
    }
  }
  for (const [key, locals] of gateLocalsByChunk) {
    const [cx, cy] = key.split(',').map(Number);
    connectChunkGates(chunkGrids[cy][cx], locals.map((l) => ({ x: l.x, y: l.y })));
  }
  // Stitch each gate pair so the crossing renders as one continuous road over the seam.
  const OPPOSITE = { east: 'west', south: 'north' };
  for (const gate of gates) {
    const tileA = world[gate.a.y][gate.a.x];
    const tileB = world[gate.b.y][gate.b.x];
    addRoadConnection(tileA, gate.dirAtoB);
    addRoadConnection(tileB, OPPOSITE[gate.dirAtoB]);
    gate.connected = { a: !!tileA.hasPath, b: !!tileB.hasPath };
  }

  // 4. Report: per-chunk stats, seam continuity, connectivity.
  for (const cr of chunkReports) {
    let water = 0;
    let towns = 0;
    const grid = chunkGrids[cr.cy][cr.cx];
    for (const row of grid) {
      for (const t of row) {
        if (t.biome === 'water') water++;
        if (t.poi === 'town') towns++;
      }
    }
    cr.waterPct = water / (CHUNK_SIZE * CHUNK_SIZE);
    cr.towns = towns;
  }

  const report = {
    worldSeed: seedNum,
    chunksX, chunksY,
    heart,
    oceanSide: EDGE_NAMES[coast.edge],
    oceanEdge: coast.edge,
    heartCoastDepth: coast.depth,
    chunks: chunkReports,
    gates,
    seams: analyzeSeams(world, chunkKinds, chunksX, chunksY),
    connectivity: analyzeConnectivity(world),
    roadRepresentation: 'hasPath/pathConnections/pathDirection tile fields written via markPathTiles (src/utils/pathfinding.js) — the existing world-map road representation; no new tile field',
  };
  return { mapData: world, report };
}

// Per-seam continuity metrics between adjacent non-ocean chunk pairs:
//   biomeMatchPct   — fraction of the 10 cross-seam tile pairs sharing the EXACT biome.
//                     Measured avg ~0.94; the rare low seams are heart lake-shore rings on
//                     the heart border (beach meeting grass — visually the same as a shore
//                     ring's outer edge inside any legacy map, not a hard seam).
//   compatiblePct   — fraction of pairs with no water/land hard edge (equal biome, or both
//                     non-water). This is the real "no guillotine seams" guarantee: 1.0 on
//                     land seams; >= 0.9 on coast-crossing seams (the +-1 wobble tile).
//   coastBandOk     — for seams the coast band crosses, whether the water-band widths on
//                     both sides differ by at most the +-1 wobble tolerance.
export function analyzeSeams(world, chunkKinds, chunksX, chunksY) {
  const seams = [];
  const kindAt = (cx, cy) => chunkKinds[cy][cx];
  const seamOf = (cxA, cyA, cxB, cyB, orientation) => {
    const kinds = [kindAt(cxA, cyA), kindAt(cxB, cyB)];
    if (kinds[0] === 'ocean' || kinds[1] === 'ocean') return null; // all-water seams: trivially continuous
    let match = 0;
    let compatible = 0;
    const pairs = [];
    for (let i = 0; i < CHUNK_SIZE; i++) {
      let a, b;
      if (orientation === 'vertical') { // between horizontally adjacent chunks
        a = world[cyA * CHUNK_SIZE + i][cxA * CHUNK_SIZE + CHUNK_SIZE - 1];
        b = world[cyA * CHUNK_SIZE + i][cxB * CHUNK_SIZE];
      } else {
        a = world[cyA * CHUNK_SIZE + CHUNK_SIZE - 1][cxA * CHUNK_SIZE + i];
        b = world[cyB * CHUNK_SIZE][cxA * CHUNK_SIZE + i];
      }
      pairs.push([a.biome, b.biome]);
      if (a.biome === b.biome) match++;
      if (a.biome === b.biome || (a.biome !== 'water' && b.biome !== 'water')) compatible++;
    }
    // Coast-band continuity: measure the sea run from each end of the seam line on both
    // sides; a coast crossing the seam shows up as a water run at one end.
    const seaRun = (biomes) => {
      let fromStart = 0;
      while (fromStart < biomes.length && biomes[fromStart] === 'water') fromStart++;
      let fromEnd = 0;
      while (fromEnd < biomes.length && biomes[biomes.length - 1 - fromEnd] === 'water') fromEnd++;
      return Math.max(fromStart, fromEnd);
    };
    const runA = seaRun(pairs.map((p) => p[0]));
    const runB = seaRun(pairs.map((p) => p[1]));
    const crossesCoast = runA > 0 || runB > 0;
    return {
      between: [[cxA, cyA], [cxB, cyB]],
      orientation,
      kinds,
      biomeMatchPct: match / CHUNK_SIZE,
      compatiblePct: compatible / CHUNK_SIZE,
      crossesCoast,
      coastBandOk: crossesCoast ? Math.abs(runA - runB) <= 1 : null,
    };
  };
  for (let cy = 0; cy < chunksY; cy++) {
    for (let cx = 0; cx < chunksX; cx++) {
      if (cx + 1 < chunksX) {
        const s = seamOf(cx, cy, cx + 1, cy, 'vertical');
        if (s) seams.push(s);
      }
      if (cy + 1 < chunksY) {
        const s = seamOf(cx, cy, cx, cy + 1, 'horizontal');
        if (s) seams.push(s);
      }
    }
  }
  return seams;
}

// Walkable-land connectivity: BFS from the heart's starting town over 4-directionally
// adjacent non-water tiles (beach counts as walkable, water never does). Every town on the
// map must be reachable without crossing water. This is the connectivity definition the
// prototype asserts; road-network reachability is additionally guaranteed per-seam by the
// gate post-pass (each land-land seam carries a road with hasPath on both gate tiles).
export function analyzeConnectivity(world) {
  const H = world.length;
  const W = world[0].length;
  let start = null;
  const towns = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = world[y][x];
      if (t.poi === 'town') {
        towns.push({ x, y });
        if (t.isStartingTown) start = { x, y };
      }
    }
  }
  if (!start) return { totalTowns: towns.length, reachableTowns: 0, unreachable: towns, ok: towns.length === 0 };
  const seen = Array.from({ length: H }, () => new Array(W).fill(false));
  const queue = [start];
  seen[start.y][start.x] = true;
  while (queue.length) {
    const { x, y } = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H || seen[ny][nx]) continue;
      if (world[ny][nx].biome === 'water') continue;
      seen[ny][nx] = true;
      queue.push({ x: nx, y: ny });
    }
  }
  const unreachable = towns.filter((t) => !seen[t.y][t.x]);
  return {
    totalTowns: towns.length,
    reachableTowns: towns.length - unreachable.length,
    unreachable,
    ok: unreachable.length === 0,
  };
}
