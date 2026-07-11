// tileWalk.js
// Pure, headless-testable movement helpers for town and site (POI) sub-maps.
//
// Two pieces, both free of React and of any hard dependency on real timers:
//   1. computeWalkPath: a 4-neighbour BFS that returns the shortest tile path
//      from `start` to `goal` over tiles the caller deems walkable.
//   2. runTileWalk: a stepping driver that enters the path one tile at a time at
//      a fixed cadence, letting the per-tile callback HALT the walk (used to stop
//      the party on the tile where a random encounter fires).
//
// Keeping the path search and the halt decision pure means the encounter-halt
// behaviour can be proven in a unit test with an injected fake scheduler, no DOM.

// Milliseconds between entering successive tiles. 2000ms / 5 tiles = 400ms/tile,
// so the party crosses 5 tiles in ~2 seconds. Single knob for town and site walks;
// import it wherever a walk is driven so the pace stays tunable in one place.
export const TILE_STEP_MS = 400;

// Stable 4-neighbour order (North, East, South, West). Deterministic so the same
// click always yields the same path.
const NEIGHBOUR_DELTAS = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
];

/**
 * Shortest 4-neighbour path from `start` to `goal` over walkable tiles.
 *
 * @param {Array<Array<Object>>} mapData 2D grid of tiles (mapData[y][x]).
 * @param {{x:number,y:number}} start starting coordinate.
 * @param {{x:number,y:number}} goal destination coordinate.
 * @param {(tile:Object)=>boolean} isWalkable predicate deciding if a tile can be
 *        stepped onto. Injected so town (walkable ground) and site (walkable floor)
 *        can differ.
 * @returns {Array<{x:number,y:number}>} ordered steps from the tile AFTER `start`
 *          through `goal` inclusive. Empty when start === goal or goal unreachable.
 */
export function computeWalkPath(mapData, start, goal, isWalkable) {
  if (!mapData || !mapData.length || !start || !goal) return [];
  const height = mapData.length;
  const width = mapData[0].length;

  const inBounds = (x, y) => x >= 0 && x < width && y >= 0 && y < height;
  if (!inBounds(start.x, start.y) || !inBounds(goal.x, goal.y)) return [];
  if (start.x === goal.x && start.y === goal.y) return [];

  const goalTile = mapData[goal.y][goal.x];
  if (!goalTile || !isWalkable(goalTile)) return [];

  const key = (x, y) => `${x},${y}`;
  const cameFrom = new Map();
  const visited = new Set([key(start.x, start.y)]);
  const queue = [{ x: start.x, y: start.y }];

  while (queue.length > 0) {
    const current = queue.shift();

    if (current.x === goal.x && current.y === goal.y) {
      // Reconstruct, then drop the start node so the result begins at the first step.
      const path = [];
      let node = current;
      while (node) {
        path.unshift({ x: node.x, y: node.y });
        node = cameFrom.get(key(node.x, node.y));
      }
      return path.slice(1);
    }

    for (const { dx, dy } of NEIGHBOUR_DELTAS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (!inBounds(nx, ny)) continue;
      const nk = key(nx, ny);
      if (visited.has(nk)) continue;
      const tile = mapData[ny][nx];
      if (!tile || !isWalkable(tile)) continue;
      visited.add(nk);
      cameFrom.set(nk, current);
      queue.push({ x: nx, y: ny });
    }
  }

  return [];
}

/**
 * Drive a tile-by-tile walk along `path`, entering one tile every `stepIntervalMs`.
 *
 * The scheduler is injected (`schedule`, defaults to setTimeout) so tests can run
 * synchronously / with fake timers. `onEnterTile(pos, index)` runs each time a tile
 * is entered; returning the string 'halt' stops the walk immediately (later tiles are
 * never entered), anything else continues.
 *
 * @param {Object} args
 * @param {Array<{x:number,y:number}>} args.path steps to walk (from computeWalkPath).
 * @param {number} args.stepIntervalMs delay between successive tiles.
 * @param {(pos:{x:number,y:number}, index:number)=>('halt'|'continue'|any)} args.onEnterTile
 * @param {(fn:Function, ms:number)=>any} [args.schedule] timer factory; defaults to setTimeout.
 * @returns {() => void} cancel function that stops any pending step.
 */
export function runTileWalk({ path, stepIntervalMs, onEnterTile, schedule = setTimeout }) {
  let cancelled = false;
  let timerId = null;
  let index = 0;

  const cancel = () => {
    cancelled = true;
    if (timerId != null) {
      // Real setTimeout ids clear cleanly; custom schedulers rely on the cancelled
      // flag guarding the callback body below.
      try { clearTimeout(timerId); } catch (e) { /* non-timer id: flag handles it */ }
      timerId = null;
    }
  };

  const scheduleNext = () => {
    if (cancelled || index >= (path ? path.length : 0)) return;
    timerId = schedule(() => {
      timerId = null;
      if (cancelled) return;
      const pos = path[index];
      const currentIndex = index;
      index += 1;
      const result = onEnterTile(pos, currentIndex);
      if (result === 'halt' || cancelled) return;
      scheduleNext();
    }, stepIntervalMs);
  };

  scheduleNext();
  return cancel;
}
