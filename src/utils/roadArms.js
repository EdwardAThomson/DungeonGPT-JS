// roadArms: which edges of a world tile its road should be drawn to (view layer only).
//
// Two generation-time quirks left roads visibly broken (2026-10-04 census: ~1 in 5 drawn
// road ends led nowhere):
//  1. markPathTiles never marks a tile that has a POI (forest, hills, mountain, cave...),
//     so a road that passes through one simply stopped at its edge.
//  2. Where two roads share a tile, pathDirection keeps only the LAST road's shape, so
//     the first road's branch lost its arm. pathConnections holds the full union.
// Both are fixed here at render time from fields every save already has, so existing
// maps heal with no migration (art changes are retroactive; see CLAUDE.md).

const LONG_TO_ARM = { north: 'n', south: 's', east: 'e', west: 'w' };
const OFFSET = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const OPPOSITE = { n: 's', s: 'n', e: 'w', w: 'e' };
const DIRECTION_ARMS = {
  NORTH_SOUTH: ['n', 's'], EAST_WEST: ['e', 'w'],
  NORTH_EAST: ['n', 'e'], NORTH_WEST: ['n', 'w'], SOUTH_EAST: ['s', 'e'], SOUTH_WEST: ['s', 'w'],
  INTERSECTION: ['n', 's', 'e', 'w'],
  START_NORTH: ['n'], START_SOUTH: ['s'], START_EAST: ['e'], START_WEST: ['w'],
  END_NORTH: ['n'], END_SOUTH: ['s'], END_EAST: ['e'], END_WEST: ['w'],
};
const ORDER = ['n', 'e', 's', 'w'];

// The arms a road tile itself declares: the union of its connections, falling back to
// its stored shape for maps that predate pathConnections.
const ownArms = (tile) => {
  if (!tile?.hasPath || tile.biome === 'water') return [];
  const conns = Array.isArray(tile.pathConnections) ? tile.pathConnections.map((c) => LONG_TO_ARM[c]).filter(Boolean) : [];
  if (conns.length) return [...new Set(conns)];
  return DIRECTION_ARMS[tile.pathDirection] || [];
};

/**
 * @returns {string[]} arms among 'n' | 'e' | 's' | 'w', in that order ([] = no road)
 */
export const roadArms = (mapData, x, y) => {
  const tile = mapData?.[y]?.[x];
  if (!tile || tile.biome === 'water' || tile.poi === 'town') return [];
  const arms = new Set(ownArms(tile));
  // A road that runs INTO this tile from a neighbour continues here, even when this
  // tile was skipped at generation (a forest or hill the road passes through).
  ORDER.forEach((arm) => {
    const [dx, dy] = OFFSET[arm];
    if (ownArms(mapData[y + dy]?.[x + dx]).includes(OPPOSITE[arm])) arms.add(arm);
  });
  return ORDER.filter((a) => arms.has(a));
};

const EDGE = { n: '20,0', s: '20,40', e: '40,20', w: '0,20' };

// Beach tiles nudge their art toward the land (WorldMapDisplay BEACH_SHIFT_XY, px at a
// 56px tile). Translating the whole road broke it at the tile edge, where the next tile's
// road is not shifted, so instead the road BENDS: its ends stay on the shared edge
// points and only its middle moves landward. Same vectors, in 40-unit viewBox space.
const BEACH_SHIFT_XY = [
  [0, 10], [-10, 0], [0, -10], [10, 0],
  [-7, 7], [-7, -7], [7, -7], [7, 7],
  [-5, 5], [-5, -5], [5, -5], [5, 5],
];
export const roadBend = (tile) => {
  if (tile?.biome !== 'beach' || tile.beachDirection == null) return null;
  const v = BEACH_SHIFT_XY[tile.beachDirection];
  return v ? { dx: (v[0] * 40) / 56, dy: (v[1] * 40) / 56 } : null;
};

const r1 = (v) => Math.round(v * 10) / 10;

/**
 * SVG path (40x40 viewBox) for a set of arms: straight, a curved corner, or spokes.
 * With a bend {dx, dy} the middle of the road moves landward and the ends stay put.
 */
export const roadPathD = (arms, bend = null) => {
  if (!arms || arms.length === 0) return null;
  const dx = bend?.dx || 0;
  const dy = bend?.dy || 0;
  const cx = r1(20 + dx);
  const cy = r1(20 + dy);
  if (arms.length === 2) {
    const [a, b] = arms;
    if (OPPOSITE[a] === b) {
      if (!dx && !dy) return `M${EDGE[a]} L${EDGE[b]}`;
      // A quadratic's midpoint sits halfway to its control, so double the offset.
      return `M${EDGE[a]} Q${r1(20 + 2 * dx)},${r1(20 + 2 * dy)} ${EDGE[b]}`;
    }
    return `M${EDGE[a]} Q${cx},${cy} ${EDGE[b]}`;
  }
  return arms.map((a) => `M${cx},${cy} L${EDGE[a]}`).join(' ');
};
