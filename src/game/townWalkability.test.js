// Town movement walkability (regression for the tile-by-tile walk).
//
// The new town movement (Game.js handleTownTileClick) replaced the old teleport
// (jump up to 5 tiles, no path check) with a 4-neighbour BFS over walkable tiles.
// The teleport masked stale/missing `walkable` flags by hopping over water and
// bridges; the BFS requires a fully connected walkable path, so any bridge or shore
// tile wrongly flagged non-walkable becomes an impassable wall.
//
// The fix keys walkability off tile TYPE (isTownTileWalkable) rather than the stored
// `walkable` boolean, matching the generator invariant that ONLY water and building
// tiles are non-walkable. These tests prove:
//   1. Under the type-based predicate, the whole path network (paths, town square,
//      and every BRIDGE) is reachable from the entry point across water archetypes
//      and seeds, so bridges are crossable and no water-adjacent path tile is walled
//      off. (Grass/beach/farmland on far shores across open water are legitimately
//      unreachable, exactly as under the old movement, so only the path network is
//      asserted whole.)
//   2. The predicate is retroactive: a bridge tile carrying a STALE `walkable:false`
//      (as an old cached town map would) is still walkable, healing old saves without
//      regenerating the grid.

import { generateTownMap, isTownTileWalkable } from '../utils/townMapGenerator';

const SIZES = ['hamlet', 'village', 'town', 'city'];

// Directional water edges cycled across seeds so every shore orientation is exercised.
const EDGES = [
  { N: false, E: true, S: false, W: false },
  { N: false, E: false, S: true, W: false },
  { N: true, E: false, S: false, W: false },
  { N: false, E: false, S: false, W: true },
];

// Tiles that make up the walkable path network. These must always be reachable from
// the entry point: the party has to be able to walk every road and cross every bridge.
const PATH_TYPES = new Set(['dirt_path', 'stone_path', 'town_square', 'bridge']);

// 4-neighbour BFS from the entry point over the SAME predicate the movement code uses.
// Mirrors computeWalkPath's neighbour walk so the test proves what the game does.
function reachableSet(mapData, entry) {
  const height = mapData.length;
  const width = mapData[0].length;
  const seen = Array.from({ length: height }, () => new Array(width).fill(false));
  if (!entry) return seen;
  const stack = [[entry.x, entry.y]];
  seen[entry.y][entry.x] = true;
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || seen[ny][nx]) continue;
      if (!isTownTileWalkable(mapData[ny][nx])) continue;
      seen[ny][nx] = true;
      stack.push([nx, ny]);
    }
  }
  return seen;
}

// Every water archetype: plain river band, coast, lake, riverside, and the premium
// riverfork/canal variants. `[label, water, hasRiver]`.
function waterConfigs(seed) {
  const e = EDGES[seed % 4];
  return [
    ['river', null, true],
    ['coast', { kind: 'coast', edges: e }, false],
    ['lake', { kind: 'lake', edges: e }, false],
    ['riverside', { kind: 'riverside', edges: e }, false],
    ['riverfork', { archetype: 'riverfork' }, true],
    ['canal', { kind: 'coast', edges: e, archetype: 'canal' }, false],
  ];
}

describe('isTownTileWalkable (movement walkability by tile type)', () => {
  test('blocks water and every solid structure (building/wall/keep_wall); other ground is walkable', () => {
    expect(isTownTileWalkable({ type: 'water' })).toBe(false);
    expect(isTownTileWalkable({ type: 'building' })).toBe(false);
    // Structural walls are impassable barriers, not walkable ground (playtest 2026-07-18:
    // the party could walk THROUGH a city wall / keep ring).
    expect(isTownTileWalkable({ type: 'wall' })).toBe(false);
    expect(isTownTileWalkable({ type: 'keep_wall' })).toBe(false);
    expect(isTownTileWalkable({ type: 'bridge' })).toBe(true);
    expect(isTownTileWalkable({ type: 'beach' })).toBe(true);
    expect(isTownTileWalkable({ type: 'grass' })).toBe(true);
    expect(isTownTileWalkable({ type: 'dirt_path' })).toBe(true);
    expect(isTownTileWalkable({ type: 'stone_path' })).toBe(true);
    expect(isTownTileWalkable({ type: 'town_square' })).toBe(true);
    expect(isTownTileWalkable({ type: 'farm_field' })).toBe(true); // a crop field is passable
    expect(isTownTileWalkable(null)).toBe(false);
    expect(isTownTileWalkable(undefined)).toBe(false);
  });

  test('is derived from type, not the stored walkable flag (retroactive heal)', () => {
    // An old cached town map can carry a bridge tile flagged non-walkable from before
    // bridges were walkable. The type-based predicate steps onto it anyway.
    const staleBridge = { x: 5, y: 5, type: 'bridge', walkable: false };
    expect(staleBridge.walkable).toBe(false); // as an old save stored it
    expect(isTownTileWalkable(staleBridge)).toBe(true); // healed at movement time

    // A stale shore is likewise crossable again.
    const staleBeach = { x: 6, y: 6, type: 'beach', walkable: false };
    expect(isTownTileWalkable(staleBeach)).toBe(true);

    // And a water tile freshly (wrongly) flagged walkable is still blocked.
    const oddWater = { x: 7, y: 7, type: 'water', walkable: true };
    expect(isTownTileWalkable(oddWater)).toBe(false);
  });
});

describe('water-town path-network reachability from the entry point', () => {
  test('the whole path network (paths, town square, every bridge) is reachable', () => {
    const failures = [];
    let bridgesSeen = 0;
    let mapsWithBridges = 0;

    for (const size of SIZES) {
      for (let seed = 1; seed <= 12; seed++) {
        for (const [label, water, hasRiver] of waterConfigs(seed)) {
          const s = (seed * 733 + 7) ^ label.length;
          const town = generateTownMap(size, 'Reach', 'south', s, hasRiver, 'NORTH_SOUTH', 'grassland', water);
          const map = town.mapData;
          const seen = reachableSet(map, town.entryPoint);

          let bridgesHere = 0;
          for (const tile of map.flat()) {
            if (!PATH_TYPES.has(tile.type)) continue;
            if (tile.type === 'bridge') { bridgesSeen++; bridgesHere++; }
            if (!seen[tile.y][tile.x]) {
              failures.push(`${size}/${label}/seed${s}: unreachable ${tile.type} at (${tile.x},${tile.y})`);
            }
          }
          if (bridgesHere > 0) mapsWithBridges++;
        }
      }
    }

    // The core assertion: no path/bridge/town-square tile is ever walled off.
    expect(failures).toEqual([]);
    // Sanity: the survey actually exercised bridges (otherwise the crossing claim is empty).
    expect(bridgesSeen).toBeGreaterThan(0);
    expect(mapsWithBridges).toBeGreaterThan(0);
  });
});
