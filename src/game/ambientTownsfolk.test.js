import { buildStreetGraph, routeBetween, createTownsfolk, stepTownsfolk } from './ambientTownsfolk';

const T = (type) => ({ type });
// . grass, - path, B building
const grid = (rows) => rows.map((r) => [...r].map((c) => T(c === '-' ? 'dirt_path' : c === 'B' ? 'building' : c === '#' ? 'town_square' : 'grass')));

const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('ambientTownsfolk', () => {
  const map = grid([
    '.B...',
    '.--#-',
    '.-...',
    '.---B',
  ]);

  it('builds the street graph with doorsteps and the square', () => {
    const g = buildStreetGraph(map);
    expect(g.tiles).toHaveLength(8);
    expect(g.square).toEqual([{ x: 3, y: 1 }]);
    expect(g.doors).toEqual(expect.arrayContaining([{ x: 1, y: 1 }, { x: 3, y: 3 }]));
  });

  it('routes only along streets', () => {
    const g = buildStreetGraph(map);
    const r = routeBetween(g, { x: 4, y: 1 }, { x: 3, y: 3 });
    expect(r[r.length - 1]).toEqual({ x: 3, y: 3 });
    for (const p of r) expect(g.walk.has(`${p.x},${p.y}`)).toBe(true);
    expect(routeBetween(g, { x: 1, y: 1 }, { x: 0, y: 0 })).toEqual([]);
  });

  it('moves at most one tile per tick and never leaves the streets', () => {
    const g = buildStreetGraph(map);
    const rand = seq([0.1, 0.7, 0.3, 0.9, 0.5, 0.2, 0.8, 0.4, 0.6]);
    let folk = createTownsfolk(g, 4, rand);
    for (let i = 0; i < 60; i++) {
      const next = stepTownsfolk(folk, g, rand);
      next.forEach((n, j) => {
        const p = folk[j];
        expect(Math.abs(n.x - p.x) + Math.abs(n.y - p.y)).toBeLessThanOrEqual(1);
        expect(g.walk.has(`${n.x},${n.y}`)).toBe(true);
      });
      folk = next;
    }
  });

  it('returns no townsfolk for a town with no streets', () => {
    const g = buildStreetGraph(grid(['..', '.B']));
    expect(createTownsfolk(g, 5, Math.random)).toEqual([]);
  });
});

describe('createTownsfolk with residents', () => {
  const map = grid([
    '.B...',
    '.--#-',
    '...B.',
  ]);
  const graph = buildStreetGraph(map);
  it('makes one walker per resident, spawned on one of their anchors', () => {
    const home = { x: 1, y: 1 }, work = { x: 3, y: 1 };
    const folk = createTownsfolk(graph, 99, seq([0.1, 0.7, 0.3, 0.5]), 8, 5, [
      { look: 3, anchors: [home, work], ref: 'a' },
      { look: 5, anchors: [work], ref: 'b' },
    ]);
    expect(folk).toHaveLength(2);
    expect(folk.map((f) => f.ref)).toEqual(['a', 'b']);
    expect(folk.map((f) => f.look)).toEqual([3, 5]);
    expect([home, work]).toContainEqual({ x: folk[0].x, y: folk[0].y });
    expect({ x: folk[1].x, y: folk[1].y }).toEqual(work);
  });
});
