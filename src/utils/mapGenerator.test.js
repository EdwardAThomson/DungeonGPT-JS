import { generateMapData } from './mapGenerator';

describe('generateMapData', () => {
  it('produces identical maps for the same seed and dimensions', () => {
    const mapA = generateMapData(10, 10, 4242);
    const mapB = generateMapData(10, 10, 4242);

    expect(mapA).toEqual(mapB);
  });

  it('produces different maps for different seeds', () => {
    const mapA = generateMapData(10, 10, 1111);
    const mapB = generateMapData(10, 10, 2222);

    expect(mapA).not.toEqual(mapB);
  });

  it('returns a valid grid with coordinates and exactly one starting town', () => {
    const width = 12;
    const height = 9;
    const map = generateMapData(width, height, 9001);

    expect(map).toHaveLength(height);
    map.forEach((row, y) => {
      expect(row).toHaveLength(width);
      row.forEach((tile, x) => {
        expect(tile.x).toBe(x);
        expect(tile.y).toBe(y);
        expect(typeof tile.biome).toBe('string');
        expect(tile).toHaveProperty('poi');
      });
    });

    const startingTowns = map
      .flat()
      .filter((tile) => tile.poi === 'town' && tile.isStartingTown);

    expect(startingTowns).toHaveLength(1);
  });

  it('places every campaign-required named town, regardless of the random count', () => {
    const requiredTowns = ['Cogsworth', 'Tinker-Row', 'Brasswick', 'Gear-End'];

    // The base town count is random (2-4); without the guarantee a milestone
    // town like Tinker-Row would be dropped on some seeds. Check several seeds.
    for (const seed of [1, 7, 42, 1234, 99999]) {
      const map = generateMapData(10, 10, seed, { towns: requiredTowns });
      const placedNames = map
        .flat()
        .filter((tile) => tile.poi === 'town')
        .map((tile) => tile.townName);

      requiredTowns.forEach((name) => {
        expect(placedNames).toContain(name);
      });
    }
  });
});
