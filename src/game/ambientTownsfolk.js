// ambientTownsfolk.js
// PROTOTYPE (debug-only, /debug/town-3q): purely cosmetic townsfolk that wander a town's
// streets so the map feels inhabited. They are NOT game entities: nothing is persisted,
// they never block the player, and the AI never hears about them. Pure functions over
// the town grid, so the walk logic is testable and deterministic for a given rand().

export const NPC_WALKABLE = new Set(['dirt_path', 'stone_path', 'town_square', 'bridge']);

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const key = (x, y) => `${x},${y}`;

// Precomputes the street graph: every walkable tile, plus "doorsteps" (street tiles next
// to a building, where townsfolk pause and step inside) and the square.
export function buildStreetGraph(mapData) {
  const tiles = [];
  const doors = [];
  const square = [];
  const walk = new Set();
  const H = mapData.length;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < mapData[y].length; x++) {
      const t = mapData[y][x];
      if (!t || !NPC_WALKABLE.has(t.type)) continue;
      walk.add(key(x, y));
      tiles.push({ x, y });
      if (t.type === 'town_square') square.push({ x, y });
      const nextToBuilding = DIRS.some(([dx, dy]) => mapData[y + dy]?.[x + dx]?.type === 'building');
      if (nextToBuilding) doors.push({ x, y });
    }
  }
  return { tiles, doors, square, walk };
}

// Breadth-first route over the street graph; returns the steps after `from` (empty when
// unreachable or already there).
export function routeBetween(graph, from, to, maxNodes = 2000) {
  if (from.x === to.x && from.y === to.y) return [];
  const start = key(from.x, from.y);
  const goal = key(to.x, to.y);
  const prev = new Map([[start, null]]);
  const queue = [from];
  let seen = 0;
  while (queue.length && seen++ < maxNodes) {
    const cur = queue.shift();
    const ck = key(cur.x, cur.y);
    if (ck === goal) break;
    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx, ny = cur.y + dy, nk = key(nx, ny);
      if (!graph.walk.has(nk) || prev.has(nk)) continue;
      prev.set(nk, ck);
      queue.push({ x: nx, y: ny });
    }
  }
  if (!prev.has(goal)) return [];
  const path = [];
  for (let k = goal; k && k !== start; k = prev.get(k)) {
    const [x, y] = k.split(',').map(Number);
    path.push({ x, y });
  }
  return path.reverse();
}

const pickFrom = (arr, rand) => arr[Math.floor(rand() * arr.length) % arr.length];

const chooseErrand = (graph, rand) => {
  const roll = rand();
  if (roll < 0.5 && graph.doors.length) return { to: pickFrom(graph.doors, rand), wait: 4 + Math.floor(rand() * 8), enter: rand() < 0.6 };
  if (roll < 0.75 && graph.square.length) return { to: pickFrom(graph.square, rand), wait: 2 + Math.floor(rand() * 6), enter: false };
  return { to: pickFrom(graph.tiles, rand), wait: 1 + Math.floor(rand() * 3), enter: false };
};

// Spawns `count` townsfolk on random street tiles. `looks`/`skins` bound the appearance
// indices; offsets keep two people on one tile from standing in the same spot.
export function createTownsfolk(graph, count, rand, looks = 8, skins = 5) {
  if (!graph.tiles.length) return [];
  const out = [];
  for (let i = 0; i < count; i++) {
    const at = pickFrom(graph.tiles, rand);
    out.push({
      id: i,
      x: at.x,
      y: at.y,
      ox: (rand() - 0.5) * 0.45,
      oy: (rand() - 0.5) * 0.3,
      look: Math.floor(rand() * looks),
      skin: Math.floor(rand() * skins),
      facing: rand() < 0.5 ? -1 : 1,
      dir: 's',
      route: [],
      wait: Math.floor(rand() * 4),
      inside: false,
      pendingEnter: false,
      moving: false,
    });
  }
  return out;
}

// Advances every townsperson by one tick (one tile of movement at most). Returns a new
// array; inputs are not mutated.
export function stepTownsfolk(npcs, graph, rand) {
  return npcs.map((n) => {
    if (n.wait > 0) {
      const wait = n.wait - 1;
      // step back out of a building a couple of ticks before leaving the doorstep
      return { ...n, wait, moving: false, inside: n.inside && wait > 1 };
    }
    let route = n.route;
    let pendingEnter = n.pendingEnter;
    if (!route.length) {
      const errand = chooseErrand(graph, rand);
      route = routeBetween(graph, n, errand.to);
      pendingEnter = errand.enter;
      if (!route.length) return { ...n, wait: errand.wait, moving: false, inside: false };
      route = route.map((p) => ({ ...p, wait: errand.wait }));
    }
    const [next, ...rest] = route;
    const facing = next.x > n.x ? 1 : next.x < n.x ? -1 : n.facing;
    // sprite view: profile when walking east/west, back when walking north
    const dir = next.x > n.x ? 'e' : next.x < n.x ? 'w' : next.y < n.y ? 'n' : 's';
    const arrived = rest.length === 0;
    return {
      ...n,
      x: next.x,
      y: next.y,
      facing,
      dir,
      route: rest,
      moving: true,
      wait: arrived ? next.wait : 0,
      inside: arrived && pendingEnter,
      pendingEnter: arrived ? false : pendingEnter,
    };
  });
}
