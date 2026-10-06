// worldTravel: auto-travel on the world map (#84 workspace spike). The player clicks a
// destination and the party walks there one tile at a time; each step is an ordinary
// world move (encounters roll per tile exactly as for a manual click), so batching the
// clicks never batches away the risk. This module only plans the route.

// Time per tile while auto-travelling. The marker glides over the same duration, so the
// party walks continuously. 750ms with a jumping marker read as too fast (maintainer
// 2026-10-03); the workspace offers a 2x control on top.
export const TRAVEL_STEP_MS = 1100;

// A step onto a road tile takes this fraction of TRAVEL_STEP_MS (no undergrowth or
// rocks to pick through). The route planner uses the same factor as the step cost, so
// it picks the quickest route, which follows roads where they help.
export const ROAD_STEP_FACTOR = 0.7;

const SETTLEMENT_POIS = new Set(['town', 'city', 'village', 'hamlet']);

// Roads are the hasPath tiles laid between towns (markPathTiles). Settlement tiles keep
// no road state but every road ends in one, so they count as road too.
export const isRoadTile = (tile) => !!tile && (!!tile.hasPath || SETTLEMENT_POIS.has(tile.poi));

/** Duration (ms, before the speed control) of a travel step that enters `tile`. */
export const travelStepMs = (tile) => Math.round(TRAVEL_STEP_MS * (isRoadTile(tile) ? ROAD_STEP_FACTOR : 1));

// Same adjacency as a manual move (isAdjacentWorldMove): 8 directions.
const STEPS = [
  [0, -1], [1, 0], [0, 1], [-1, 0],
  [1, -1], [1, 1], [-1, 1], [-1, -1],
];

// Land only: the party cannot walk on water (a manual click there is just as invalid).
export const isTravelPassable = (tile) => !!tile && tile.biome !== 'water';

/**
 * Quickest route from start to goal over passable tiles, or null if the goal is
 * unreachable or impassable. A step costs ROAD_STEP_FACTOR onto a road tile, 1 elsewhere,
 * so a slightly longer road route beats a cross-country shortcut. The returned path
 * EXCLUDES the start tile and ends on the goal, so walking it means one move per element.
 * On equal cost, fewer steps win, then orthogonal steps before diagonals, which keeps
 * routes along straight lines where possible.
 * @param {Array<Array<Object>>} map world map grid [y][x]
 * @param {{x:number,y:number}} start
 * @param {{x:number,y:number}} goal
 * @returns {Array<{x:number,y:number}>|null}
 */
export const planTravelRoute = (map, start, goal) => {
  if (!Array.isArray(map) || !map.length || !start || !goal) return null;
  const h = map.length;
  const w = map[0].length;
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  if (!inBounds(goal.x, goal.y) || !isTravelPassable(map[goal.y][goal.x])) return null;
  if (start.x === goal.x && start.y === goal.y) return [];

  const key = (x, y) => y * w + x;
  const startKey = key(start.x, start.y);
  const goalKey = key(goal.x, goal.y);
  // Dijkstra over [cost, steps]; the grid is small, so a linear scan for the next node is fine.
  const best = new Map([[startKey, { cost: 0, steps: 0 }]]);
  const prev = new Map([[startKey, null]]);
  const done = new Set();
  const better = (a, b) => a.cost < b.cost - 1e-9 || (Math.abs(a.cost - b.cost) <= 1e-9 && a.steps < b.steps);
  for (;;) {
    let cur = null;
    best.forEach((v, k) => { if (!done.has(k) && (cur === null || better(v, best.get(cur)))) cur = k; });
    if (cur === null || cur === goalKey) break;
    done.add(cur);
    const cx = cur % w;
    const cy = Math.floor(cur / w);
    const here = best.get(cur);
    for (const [dx, dy] of STEPS) {
      const nx = cx + dx;
      const ny = cy + dy;
      const k = key(nx, ny);
      if (!inBounds(nx, ny) || done.has(k) || !isTravelPassable(map[ny][nx])) continue;
      const cand = { cost: here.cost + (isRoadTile(map[ny][nx]) ? ROAD_STEP_FACTOR : 1), steps: here.steps + 1 };
      if (!best.has(k) || better(cand, best.get(k))) {
        best.set(k, cand);
        prev.set(k, cur);
      }
    }
  }
  if (!prev.has(goalKey)) return null;

  const path = [];
  for (let k = goalKey; k !== startKey; k = prev.get(k)) {
    path.push({ x: k % w, y: Math.floor(k / w) });
  }
  return path.reverse();
};
