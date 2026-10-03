import { planTravelRoute, isTravelPassable } from './worldTravel';

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
