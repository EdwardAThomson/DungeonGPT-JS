import { generateMapData } from './mapGenerator';
import { riverNetwork, waterwaysLayout, waterwaysSvg } from './worldWaterways';

const grid = (w, h) => Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => ({ x, y, biome: 'plains' })));

describe('worldWaterways', () => {
  test('a river is one line from source to mouth, widening downstream', () => {
    const m = grid(3, 5);
    m[4].forEach((t) => { t.biome = 'water'; });
    for (let y = 0; y < 4; y++) m[y][1].hasRiver = true;
    m[0][1].riverConnections = ['south'];
    for (let y = 1; y < 4; y++) m[y][1].riverConnections = ['north', 'south'];
    m[4][1].hasRiver = true;
    const { chains } = riverNetwork(m);
    expect(chains).toEqual([['1,0', '1,1', '1,2', '1,3', '1,4']]);
    const { rivers } = waterwaysLayout(m);
    expect(rivers).toHaveLength(1);
    expect(rivers[0].mouth).toBe(true);
    const pts = rivers[0].pts;
    expect(pts[pts.length - 1].w).toBeGreaterThan(pts[0].w);
  });

  test('a road across a river gets a bridge', () => {
    const m = grid(3, 3);
    for (let y = 0; y < 3; y++) { m[y][1].hasRiver = true; m[y][1].riverConnections = y === 0 ? ['south'] : y === 2 ? ['north'] : ['north', 'south']; }
    for (let x = 0; x < 3; x++) { m[1][x].hasPath = true; m[1][x].pathConnections = x === 0 ? ['east'] : x === 2 ? ['west'] : ['east', 'west']; }
    const { bridges } = waterwaysLayout(m);
    expect(bridges).toHaveLength(1);
    expect(Math.abs(bridges[0].x - 1.5)).toBeLessThan(0.2);
  });

  test('a road along a river is drawn beside it, not on it', () => {
    const m = grid(3, 5);
    m[4].forEach((t) => { t.biome = 'water'; });
    m[4][1].hasRiver = true;
    for (let y = 0; y < 4; y++) {
      const c = y === 0 ? ['south'] : y === 3 ? ['north'] : ['north', 'south'];
      Object.assign(m[y][1], { hasRiver: true, riverConnections: y === 0 ? c : ['north', 'south'], hasPath: true, pathConnections: c });
    }
    const { roads, bridges } = waterwaysLayout(m);
    expect(bridges).toHaveLength(0);
    roads[0].pts.forEach((p) => expect(Math.abs(p.x - 1.5)).toBeGreaterThan(0.15));
  });

  test('draws generated worlds without throwing', () => {
    for (let s = 1; s <= 20; s++) {
      const svg = waterwaysSvg(generateMapData(20, 14, s, {}, 'grassland'));
      expect(svg).not.toMatch(/NaN/);
    }
    expect(waterwaysSvg([])).toBe('');
  });
});
