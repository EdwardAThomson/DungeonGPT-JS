// roadArms: world roads must always join up (2026-10-04: ~1 in 5 drawn road ends led
// nowhere, at features generation skipped and at junctions whose shape was overwritten).

import { roadArms, roadPathD, roadBend } from './roadArms';
import { generateMapData } from './mapGenerator';

const OFFSET = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const OPPOSITE = { n: 's', s: 'n', e: 'w', w: 'e' };
const plain = (x, y) => ({ x, y, biome: 'plains', poi: null });

describe('roadArms', () => {
  it('draws the union of a junction, not just the last road through it', () => {
    const m = [[plain(0, 0), plain(1, 0), plain(2, 0)]];
    // Two roads crossed here; pathDirection only remembers the second one.
    m[0][1] = { ...m[0][1], hasPath: true, pathDirection: 'NORTH_SOUTH', pathConnections: ['west', 'east', 'south'] };
    expect(roadArms(m, 1, 0)).toEqual(['e', 's', 'w']);
  });

  it('carries a road through a feature tile that generation skipped (old saves)', () => {
    const m = [[plain(0, 0), { ...plain(1, 0), poi: 'forest' }, plain(2, 0)]];
    m[0][0] = { ...m[0][0], hasPath: true, pathDirection: 'EAST_WEST', pathConnections: ['east'] };
    m[0][2] = { ...m[0][2], hasPath: true, pathDirection: 'EAST_WEST', pathConnections: ['west'] };
    expect(roadArms(m, 1, 0)).toEqual(['e', 'w']);
  });

  it('draws nothing on towns or water, and falls back to pathDirection without connections', () => {
    const m = [[{ ...plain(0, 0), poi: 'town' }, { ...plain(1, 0), biome: 'water', hasPath: true }, { ...plain(2, 0), hasPath: true, pathDirection: 'SOUTH_EAST' }]];
    expect(roadArms(m, 0, 0)).toEqual([]);
    expect(roadArms(m, 1, 0)).toEqual([]);
    expect(roadArms(m, 2, 0)).toEqual(['e', 's']);
  });

  it('every drawn road end meets a road (or a town) on generated maps, with no dead-end stubs', () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const opts of [{}, { estuaryTown: true }]) {
        const m = generateMapData(10, 10, seed, { towns: ['A', 'B', 'C', 'D'], mountains: ['M'] }, 'grassland', opts);
        for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
          const arms = roadArms(m, x, y);
          expect(arms.length === 1 ? `stub at ${x},${y} seed ${seed}` : 'ok').toBe('ok');
          arms.forEach((a) => {
            const [dx, dy] = OFFSET[a];
            const n = m[y + dy]?.[x + dx];
            const joined = !!n && (n.poi === 'town' || roadArms(m, x + dx, y + dy).includes(OPPOSITE[a]));
            expect(joined ? 'ok' : `dangling ${a} at ${x},${y} seed ${seed}`).toBe('ok');
          });
        }
      }
    }
  });
});

describe('roadPathD', () => {
  it('draws straights, curved corners and spokes', () => {
    expect(roadPathD(['n', 's'])).toBe('M20,0 L20,40');
    expect(roadPathD(['e', 's'])).toBe('M40,20 Q20,20 20,40');
    expect(roadPathD(['e', 's', 'w'])).toBe('M20,20 L40,20 M20,20 L20,40 M20,20 L0,20');
    expect(roadPathD([])).toBeNull();
  });

  it('bends a beach road landward but keeps its ends on the shared tile-edge points', () => {
    const bend = roadBend({ biome: 'beach', beachDirection: 0 }); // water north, land south
    expect(bend.dx).toBe(0);
    expect(bend.dy).toBeGreaterThan(0);
    const straight = roadPathD(['e', 'w'], bend);
    expect(straight.startsWith('M40,20 ')).toBe(true);
    expect(straight.endsWith(' 0,20')).toBe(true);
    expect(roadPathD(['n', 'e'], bend)).toBe(`M20,0 Q20,${Math.round((20 + bend.dy) * 10) / 10} 40,20`);
    expect(roadBend({ biome: 'plains' })).toBeNull();
  });
});
