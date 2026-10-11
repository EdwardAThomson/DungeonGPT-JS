import { generateLayeredTerrain } from './layeredGenerator';

// Same parameter shape Terrain Studio V2 builds from its sliders (buildParams).
const params = (seed, seaLevelSlider) => ({
  seed,
  terrain: { octaves: 6, persistence: 0.5, lacunarity: 2.0, baseFreq: 0.01 },
  continent: { freq: 0.005, seaLevel: (seaLevelSlider - 50) * 0.008 },
  warp: { strength: 0.6, freq: 0.008 },
  exponent: 1.5,
  maxTowns: 0,
  erosion: null,
});

const waterShare = ({ heightmap, waterThreshold }) => {
  let water = 0;
  for (let i = 0; i < heightmap.length; i++) if (heightmap[i] <= waterThreshold) water++;
  return water / heightmap.length;
};

describe('generateLayeredTerrain sea level', () => {
  it.each([421, 7, 99])('raises the water share steadily with the Sea Level slider (seed %i)', (seed) => {
    const shares = [0, 25, 50, 75, 100].map((s) => waterShare(generateLayeredTerrain(64, 64, params(seed, s))));
    for (let i = 1; i < shares.length; i++) expect(shares[i]).toBeGreaterThanOrEqual(shares[i - 1]);
    expect(shares[0]).toBeLessThan(0.3);
    expect(shares[shares.length - 1]).toBeGreaterThan(0.7);
    expect(shares[shares.length - 1] - shares[0]).toBeGreaterThan(0.45);
  });

  it('moves the coast at low settings (previously fixed at 30% water up to about 50)', () => {
    const low = waterShare(generateLayeredTerrain(64, 64, params(421, 0)));
    const mid = waterShare(generateLayeredTerrain(64, 64, params(421, 40)));
    expect(mid - low).toBeGreaterThan(0.15);
  });

  it('is reproducible for the same seed', () => {
    const a = generateLayeredTerrain(64, 64, params(5, 30));
    const b = generateLayeredTerrain(64, 64, params(5, 30));
    expect(Array.from(a.heightmap)).toEqual(Array.from(b.heightmap));
  });
});
