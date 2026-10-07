// worldTravel: auto-travel on the world map (#84 workspace spike). The player clicks a
// destination and the party walks there one tile at a time; each step is an ordinary
// world move (encounters roll per tile exactly as for a manual click), so batching the
// clicks never batches away the risk. This module only plans the route.

import { hasPoiEncounter } from '../utils/encounterGenerator';

// Time per tile while auto-travelling. The marker glides over the same duration, so the
// party walks continuously. 750ms with a jumping marker read as too fast (maintainer
// 2026-10-03); the workspace offers a 2x control on top.
export const TRAVEL_STEP_MS = 1100;

// A step onto a road tile takes this fraction of TRAVEL_STEP_MS (no undergrowth or
// rocks to pick through). The route planner uses the same factor as the step cost, so
// it picks the quickest route, which follows roads where they help.
export const ROAD_STEP_FACTOR = 0.7;

const SETTLEMENT_POIS = new Set(['town', 'city', 'village', 'hamlet']);

// Route-planning surcharge on tiles with their own POI encounter roll (forest, mountain,
// cave), rolled on top of the biome roll, so a quicker road past one is only worth taking
// when it saves more than this. Planning only; the step itself is not slower.
const FEATURE_ROUTE_PENALTY = 0.4;
const isFeatureTile = (tile) => hasPoiEncounter(tile);

// Roads are the hasPath tiles laid between towns (markPathTiles). Settlement tiles keep
// no road state but every road ends in one, so they count as road too. A road through a
// tile with its own POI encounter roll (forest, mountain, cave) does not: treating it as
// road would steer routes into extra fights.
export const isRoadTile = (tile) => !!tile
  && (SETTLEMENT_POIS.has(tile.poi) || (!!tile.hasPath && !hasPoiEncounter(tile)));

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
 * plus FEATURE_ROUTE_PENALTY onto a tile with its own POI encounter roll, so a slightly
 * longer road route beats a cross-country shortcut and routes skirt woods and mountains
 * where it costs little. The returned path
 * EXCLUDES the start tile and ends on the goal, so walking it means one move per element.
 * On equal cost, fewer steps win, then fewer POI-roll tiles, then orthogonal steps before
 * diagonals.
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
  const best = new Map([[startKey, { cost: 0, steps: 0, features: 0 }]]);
  const prev = new Map([[startKey, null]]);
  const done = new Set();
  const better = (a, b) => {
    if (Math.abs(a.cost - b.cost) > 1e-9) return a.cost < b.cost;
    return a.steps !== b.steps ? a.steps < b.steps : a.features < b.features;
  };
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
      const tile = map[ny][nx];
      const cand = {
        cost: here.cost + (isRoadTile(tile) ? ROAD_STEP_FACTOR : 1) + (isFeatureTile(tile) ? FEATURE_ROUTE_PENALTY : 0),
        steps: here.steps + 1,
        features: here.features + (isFeatureTile(tile) ? 1 : 0),
      };
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
