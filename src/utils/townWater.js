// townWater.js
// Derive a town's water context from its position on the WORLD map, so the town
// interior generator can add a lakefront or a coastline that matches the overworld.
//
// The town tile itself is dry land (towns never spawn on water). What matters is its
// neighbours: a `water` neighbour flagged `isLake` means an inland lake; a non-lake
// `water` neighbour or a `beach` neighbour means open sea (coast). Coast wins when both
// are present (the sea is the dominant feature). The returned `edges` say which side(s)
// of the town the water sits on, so the generator floods inward from those edges only.
//
// Riverside (#68, river-settlement doctrine 1c): a town orthogonally ADJACENT to a
// land river tile (hasRiver, not water) gets `kind: 'riverside'` with the river edges
// flagged: the historically common one-bank case, rendered as a river band along that
// town-map edge. Precedence, weakest to strongest: riverside < lake < coast (a real
// water body flooding an edge beats a neighbouring stream) < the town's OWN river
// (`hasRiver` on the tile itself; the caller carves the band/fork through town and
// ignores an adjacent-river context) < a `waterTown` archetype stamp (riverfork/canal,
// merged over all of this by getTownWaterContext).
//
// Pure + tolerant of old saves: returns null when there's no adjacent water, and never
// throws on missing tiles / unknown biomes.

const ORTHO = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const DIAG = { NE: [1, -1], SE: [1, 1], SW: [-1, 1], NW: [-1, -1] };
// Which two orthogonal edges a diagonal-only water tile should "bite" into.
const DIAG_EDGES = { NE: ['N', 'E'], SE: ['S', 'E'], SW: ['S', 'W'], NW: ['N', 'W'] };

/**
 * @param {Array<Array<Object>>} worldMap - 2D world grid (rows of tiles).
 * @param {number} x - town tile column on the world map.
 * @param {number} y - town tile row on the world map.
 * @returns {{kind:'lake'|'coast'|'riverside', edges:{N:boolean,E:boolean,S:boolean,W:boolean}}|null}
 */
export function analyzeTownWater(worldMap, x, y) {
  if (!Array.isArray(worldMap) || !worldMap[y] || !worldMap[y][x]) return null;
  const at = (xx, yy) => (worldMap[yy] && worldMap[yy][xx]) ? worldMap[yy][xx] : null;

  const isWater = (t) => t && t.biome === 'water';
  const isBeach = (t) => t && t.biome === 'beach';

  const edges = { N: false, E: false, S: false, W: false };
  let lake = false;
  let ocean = false;

  // Orthogonal neighbours define which edge the water enters from.
  for (const [dir, [dx, dy]] of Object.entries(ORTHO)) {
    const t = at(x + dx, y + dy);
    if (isWater(t)) {
      edges[dir] = true;
      if (t.isLake) lake = true; else ocean = true;
    } else if (isBeach(t)) {
      edges[dir] = true;
      ocean = true; // a beach means the open coast is just beyond it
    }
  }

  // Diagonal-only water: no clean edge, so let it bite the corner (both adjacent edges).
  for (const [dir, [dx, dy]] of Object.entries(DIAG)) {
    const t = at(x + dx, y + dy);
    const water = isWater(t);
    const beach = isBeach(t);
    if (!water && !beach) continue;
    if (water && t.isLake) lake = true; else ocean = true;
    // Only promote to edges if that corner has no orthogonal edge already.
    const [a, b] = DIAG_EDGES[dir];
    if (!edges[a] && !edges[b]) { edges[a] = true; edges[b] = true; }
  }

  const anyEdge = edges.N || edges.E || edges.S || edges.W;
  if (anyEdge) {
    const kind = ocean ? 'coast' : (lake ? 'lake' : null);
    if (kind) return { kind, edges };
  }

  // Riverside (#68): no adjacent water body, but a land river tile orthogonally
  // beside the town, the one-bank case. Weakest kind: only reached when neither
  // coast nor lake claimed an edge, so those return byte-identically to before.
  const isLandRiver = (t) => t && t.hasRiver === true && t.biome !== 'water';
  const riverEdges = { N: false, E: false, S: false, W: false };
  let anyRiver = false;
  for (const [dir, [dx, dy]] of Object.entries(ORTHO)) {
    if (isLandRiver(at(x + dx, y + dy))) {
      riverEdges[dir] = true;
      anyRiver = true;
    }
  }
  if (anyRiver) return { kind: 'riverside', edges: riverEdges };

  return null;
}

/**
 * The full water context a town generator call site should pass to generateTownMap:
 * the adjacency-derived water info PLUS the world tile's `waterTown` stamp (water
 * towns #65, stamped once at New Game by the launch pipeline) as `water.archetype`.
 * Old saves and free-tier worlds never carry the stamp, so this returns exactly
 * analyzeTownWater's result for them, byte-identical town generation included.
 *
 * @param {Array<Array<Object>>} worldMap - 2D world grid (rows of tiles).
 * @param {number} x - town tile column on the world map.
 * @param {number} y - town tile row on the world map.
 * @returns {{kind?:string, edges?:Object, archetype?:string}|null}
 */
export function getTownWaterContext(worldMap, x, y) {
  const info = analyzeTownWater(worldMap, x, y);
  const tile = (Array.isArray(worldMap) && worldMap[y] && worldMap[y][x]) ? worldMap[y][x] : null;
  const archetype = tile && typeof tile.waterTown === 'string' ? tile.waterTown : null;
  if (!archetype) return info;
  return { ...(info || {}), archetype };
}

// Direction (town -> neighbour) and its opposite, as the lowercase strings the town
// generator's entry logic uses.
const ROAD_NEI = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };
const ROAD_OPP = { north: 'south', east: 'west', south: 'north', west: 'east' };

/**
 * Which sides of a town a world-map road connects to. Paths are A*'d town-to-town and
 * `markPathTiles` skips POI tiles, so the town tile itself is never flagged — the road's
 * final segment lives on the adjacent tile, whose `pathConnections` point back toward the
 * town. So an entrance exists on side `dir` when the neighbour in that direction has a
 * road connecting back ('south' for a north neighbour, etc.). Falls back to "any adjacent
 * path tile" when older saves lack `pathConnections`.
 *
 * @returns {string[]} entrance directions, e.g. ['south','east'] (empty = isolated town).
 */
export function getTownRoadEdges(worldMap, x, y) {
  if (!Array.isArray(worldMap) || !worldMap[y] || !worldMap[y][x]) return [];
  const at = (xx, yy) => (worldMap[yy] && worldMap[yy][xx]) ? worldMap[yy][xx] : null;

  const edges = [];
  for (const [dir, [dx, dy]] of Object.entries(ROAD_NEI)) {
    const t = at(x + dx, y + dy);
    if (!t || !t.hasPath) continue;
    const conns = t.pathConnections;
    if (Array.isArray(conns) && conns.length) {
      if (conns.includes(ROAD_OPP[dir])) edges.push(dir);
    } else {
      edges.push(dir); // legacy save without connection data: any adjacent road counts
    }
  }
  return edges;
}

export default analyzeTownWater;
