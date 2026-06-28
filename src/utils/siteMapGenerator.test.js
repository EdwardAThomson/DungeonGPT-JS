import { generateSiteMap, siteThemeFor } from './siteMapGenerator';

const flat = (s) => s.mapData.flat();
const count = (s, type) => flat(s).filter((t) => t.type === type).length;

// Flood-fill walkable tiles from the entrance to confirm the whole site is reachable.
const reachableFloor = (s) => {
  const { mapData, width, height, entryPoint } = s;
  const seen = new Set();
  const stack = [[entryPoint.x, entryPoint.y]];
  while (stack.length) {
    const [x, y] = stack.pop();
    const k = `${x},${y}`;
    if (seen.has(k)) continue;
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    if (!mapData[y][x].walkable) continue;
    seen.add(k);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return seen;
};

describe('generateSiteMap', () => {
  test('caves and ruins both generate a valid grid', () => {
    ['cave', 'ruins'].forEach((type) => {
      const s = generateSiteMap(type, 'Test', 'south', 1);
      expect(s.width).toBe(20);
      expect(s.height).toBe(20);
      expect(s.mapData).toHaveLength(20);
      expect(count(s, 'floor')).toBeGreaterThan(0);
      expect(count(s, 'wall')).toBeGreaterThan(0);
    });
  });

  test('cave_entrance poi value is normalised to a cave site', () => {
    expect(generateSiteMap('cave_entrance', 'C', 'south', 5).type).toBe('cave');
    expect(siteThemeFor('cave_entrance')).toBe('cave');
  });

  test('has exactly one entrance tile on the requested edge', () => {
    const onEdge = { north: (p, w, h) => p.y === 0, south: (p, w, h) => p.y === h - 1, west: (p) => p.x === 0, east: (p, w) => p.x === w - 1 };
    ['north', 'south', 'east', 'west'].forEach((dir) => {
      const s = generateSiteMap('cave', 'C', dir, 9);
      expect(count(s, 'entrance')).toBe(1);
      expect(onEdge[dir](s.entryPoint, s.width, s.height)).toBe(true);
      expect(s.mapData[s.entryPoint.y][s.entryPoint.x].type).toBe('entrance');
    });
  });

  test('every floor tile is reachable from the entrance (connected)', () => {
    const s = generateSiteMap('ruins', 'R', 'south', 42);
    const reachable = reachableFloor(s);
    const walkable = flat(s).filter((t) => t.walkable).length;
    expect(reachable.size).toBe(walkable);
  });

  test('content slots are reserved on walkable tiles, away from the entrance', () => {
    const s = generateSiteMap('cave', 'C', 'south', 7);
    expect(s.contentSlots.length).toBeGreaterThan(0);
    s.contentSlots.forEach((p) => {
      expect(s.mapData[p.y][p.x].walkable).toBe(true);
      expect(s.mapData[p.y][p.x].contentSlot).toBe(true);
      expect(p.x === s.entryPoint.x && p.y === s.entryPoint.y).toBe(false);
    });
  });

  test('deterministic per (type, seed)', () => {
    const a = generateSiteMap('cave', 'C', 'south', 314);
    const b = generateSiteMap('cave', 'C', 'south', 314);
    expect(JSON.stringify(a.mapData)).toBe(JSON.stringify(b.mapData));
    const c = generateSiteMap('cave', 'C', 'south', 315);
    expect(JSON.stringify(a.mapData)).not.toBe(JSON.stringify(c.mapData));
  });

  test('robust across many seeds: always connected with >=1 content slot', () => {
    ['cave', 'ruins'].forEach((type) => {
      for (let seed = 1; seed <= 60; seed++) {
        const s = generateSiteMap(type, type, 'south', seed);
        expect(s.contentSlots.length).toBeGreaterThan(0);
        const reachable = reachableFloor(s);
        const walkable = flat(s).filter((t) => t.walkable).length;
        expect(reachable.size).toBe(walkable); // no orphaned floor pockets
      }
    });
  });

  test('walls block, floor/rubble/entrance are walkable', () => {
    const s = generateSiteMap('ruins', 'R', 'south', 11);
    flat(s).forEach((t) => {
      if (t.type === 'wall') expect(t.walkable).toBe(false);
      if (['floor', 'rubble', 'entrance'].includes(t.type)) expect(t.walkable).toBe(true);
    });
  });
});
