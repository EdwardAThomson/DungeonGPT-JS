import { planTravelRoute, isTravelPassable, isRoadTile, travelStepMs, TRAVEL_STEP_MS, ROAD_STEP_FACTOR } from './worldTravel';

const grid = (rows) => rows.map((r, y) => [...r].map((c, x) => ({ x, y, biome: c === '~' ? 'water' : 'plains' })));

describe('planTravelRoute', () => {
  it('walks a straight line, excluding the start and ending on the goal', () => {
    const map = grid(['.....']);
    expect(planTravelRoute(map, { x: 0, y: 0 }, { x: 3, y: 0 })).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }]);
  });

  it('uses diagonals like a manual move (8-way adjacency)', () => {
    const map = grid(['...', '...', '...']);
    expect(planTravelRoute(map, { x: 0, y: 0 }, { x: 2, y: 2 })).toHaveLength(2);
  });

  it('routes around water and never steps on it', () => {
    const map = grid(['.~.', '.~.', '...']);
    const path = planTravelRoute(map, { x: 0, y: 0 }, { x: 2, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 2, y: 0 });
    path.forEach(({ x, y }) => expect(map[y][x].biome).not.toBe('water'));
  });

  it('returns null for water or unreachable goals, [] for the current tile', () => {
    const map = grid(['.~.', '~~.', '...']);
    expect(planTravelRoute(map, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeNull();
    expect(planTravelRoute(map, { x: 0, y: 0 }, { x: 2, y: 2 })).toBeNull();
    expect(planTravelRoute(map, { x: 0, y: 0 }, { x: 0, y: 0 })).toEqual([]);
  });

  it('every step is adjacent to the previous one', () => {
    const map = grid(['....~....', '.~~.~.~~.', '.~.....~.', '.~~~~~~~.', '.........']);
    const path = planTravelRoute(map, { x: 0, y: 0 }, { x: 8, y: 0 });
    let cur = { x: 0, y: 0 };
    path.forEach((p) => { expect(Math.max(Math.abs(p.x - cur.x), Math.abs(p.y - cur.y))).toBe(1); cur = p; });
  });

  it('treats only water as impassable', () => {
    expect(isTravelPassable({ biome: 'beach' })).toBe(true);
    expect(isTravelPassable({ biome: 'water' })).toBe(false);
    expect(isTravelPassable(null)).toBe(false);
  });
});

describe('roads', () => {
  // '=' is a road tile, 'T' a town (road ends), '.' open plains.
  const roadGrid = (rows) => rows.map((r, y) => [...r].map((c, x) => ({
    x, y, biome: 'plains', hasPath: c === '=', poi: c === 'T' ? 'town' : null,
  })));

  it('prefers a slightly longer road over a cross-country shortcut', () => {
    // Straight across row 1 is 4 steps; the road dips through rows 2 and back (still 4
    // steps with diagonals but all on road) and must win.
    const map = roadGrid(['.....', 'T...T', '.===.']);
    const path = planTravelRoute(map, { x: 0, y: 1 }, { x: 4, y: 1 });
    expect(path.slice(0, -1).every(({ x, y }) => map[y][x].hasPath)).toBe(true);
  });

  it('does not take a road detour that is slower than going direct', () => {
    // Road route: down 3, across, up 3 = far more steps than the 4-step straight line.
    const map = roadGrid(['T...T', '.....', '.....', '.....', '=====']);
    expect(planTravelRoute(map, { x: 0, y: 0 }, { x: 4, y: 0 })).toHaveLength(4);
  });

  it('road and town steps are quicker than open ground', () => {
    expect(isRoadTile({ hasPath: true })).toBe(true);
    expect(isRoadTile({ poi: 'village' })).toBe(true);
    expect(isRoadTile({ biome: 'plains' })).toBe(false);
    expect(isRoadTile({ hasPath: true, poi: 'forest' })).toBe(false);
    expect(travelStepMs({ hasPath: true })).toBe(Math.round(TRAVEL_STEP_MS * ROAD_STEP_FACTOR));
    expect(travelStepMs({ biome: 'plains' })).toBe(TRAVEL_STEP_MS);
  });
});
