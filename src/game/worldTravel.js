// worldTravel: auto-travel on the world map (#84 workspace spike). The player clicks a
// destination and the party walks there one tile at a time; each step is an ordinary
// world move (encounters roll per tile exactly as for a manual click), so batching the
// clicks never batches away the risk. This module only plans the route.

// Time per tile while auto-travelling. The marker glides over the same duration, so the
// party walks continuously. 750ms with a jumping marker read as too fast (maintainer
// 2026-10-03); the workspace offers a 2x control on top.
export const TRAVEL_STEP_MS = 1100;

// Same adjacency as a manual move (isAdjacentWorldMove): 8 directions.
const STEPS = [
  [0, -1], [1, 0], [0, 1], [-1, 0],
  [1, -1], [1, 1], [-1, 1], [-1, -1],
];

// Land only: the party cannot walk on water (a manual click there is just as invalid).
export const isTravelPassable = (tile) => !!tile && tile.biome !== 'water';

/**
 * Shortest route (fewest steps) from start to goal over passable tiles, or null if the
 * goal is unreachable or impassable. The returned path EXCLUDES the start tile and ends
 * on the goal, so walking it means one move per element. Orthogonal steps are tried
 * before diagonals at each tile, which keeps routes along straight lines where possible.
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
  const prev = new Map([[key(start.x, start.y), null]]);
  const queue = [[start.x, start.y]];
  for (let head = 0; head < queue.length; head++) {
    const [cx, cy] = queue[head];
    if (cx === goal.x && cy === goal.y) break;
    for (const [dx, dy] of STEPS) {
      const nx = cx + dx;
      const ny = cy + dy;
      const k = key(nx, ny);
      if (!inBounds(nx, ny) || prev.has(k) || !isTravelPassable(map[ny][nx])) continue;
      prev.set(k, key(cx, cy));
      queue.push([nx, ny]);
    }
  }
  if (!prev.has(key(goal.x, goal.y))) return null;

  const path = [];
  for (let k = key(goal.x, goal.y); k !== key(start.x, start.y); k = prev.get(k)) {
    path.push({ x: k % w, y: Math.floor(k / w) });
  }
  return path.reverse();
};
