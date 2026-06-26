import { biomeBackground, poiSprite, sampleBiomes, samplePois } from './worldTileArt';

const decode = (bg) => {
  expect(bg.startsWith('url("data:image/svg+xml,')).toBe(true);
  const svg = decodeURIComponent(bg.slice('url("data:image/svg+xml,'.length, -2));
  expect(svg.startsWith('<svg')).toBe(true);
  expect(svg.endsWith('</svg>')).toBe(true);
  expect(svg).not.toMatch(/undefined|NaN|\[object/);
  return svg;
};

describe('worldTileArt', () => {
  test('biomes yield well-formed SVG data-URIs', () => {
    ['plains', 'water', 'desert', 'swamp', 'snow', 'woodland'].forEach((b, i) => decode(biomeBackground({ biome: b }, i + 1, 1)));
    decode(biomeBackground({ biome: 'beach', beachDirection: 0 }, 3, 1));
    decode(biomeBackground({ biome: 'water', isLake: true }, 4, 1));
  });

  test('unknown biome falls back to a valid tile (old saves)', () => {
    decode(biomeBackground({ biome: 'totally-new-biome' }, 1, 1));
  });

  test('hills and ruins POIs render', () => {
    decode(poiSprite({ poi: 'hills' }));
    decode(poiSprite({ poi: 'ruins' }));
  });

  test('hills have multiple variants across coordinates', () => {
    const set = new Set();
    for (let i = 0; i < 16; i++) set.add(poiSprite({ poi: 'hills', x: i, y: i * 2 + 1 }));
    expect(set.size).toBeGreaterThan(1);
  });

  test('beach direction changes the geometry', () => {
    const n = decode(biomeBackground({ biome: 'beach', beachDirection: 0 }));
    const e = decode(biomeBackground({ biome: 'beach', beachDirection: 1 }));
    expect(n).not.toBe(e);
  });

  test('plains variant is deterministic per coordinate', () => {
    expect(biomeBackground({ biome: 'plains' }, 5, 6)).toBe(biomeBackground({ biome: 'plains' }, 5, 6));
    expect(biomeBackground({ biome: 'plains' }, 5, 6)).not.toBe(biomeBackground({ biome: 'plains' }, 9, 2));
  });

  test('POI sprites: distinct per type, null when none', () => {
    expect(poiSprite({})).toBeNull();
    const types = [
      poiSprite({ poi: 'forest' }), poiSprite({ poi: 'mountain' }), poiSprite({ poi: 'cave_entrance' }),
      poiSprite({ poi: 'town', townSize: 'hamlet' }), poiSprite({ poi: 'town', townSize: 'city' }),
      poiSprite({ milestonePoi: true }),
    ];
    types.forEach((s) => decode(s));
    expect(new Set(types).size).toBe(types.length);
  });

  test('town sprite scales by size (hamlet != city)', () => {
    expect(poiSprite({ poi: 'town', townSize: 'hamlet' })).not.toBe(poiSprite({ poi: 'town', townSize: 'city' }));
  });

  test('mountains and forests have multiple variants across coordinates', () => {
    const mtn = new Set(), forest = new Set();
    for (let i = 0; i < 16; i++) {
      mtn.add(poiSprite({ poi: 'mountain', x: i, y: i * 3 + 1 }));
      forest.add(poiSprite({ poi: 'forest', x: i * 2, y: i + 5 }));
    }
    expect(mtn.size).toBeGreaterThan(1);
    expect(forest.size).toBeGreaterThan(1);
  });

  test('gallery accessors are valid', () => {
    Object.values(sampleBiomes).forEach((fn) => decode(fn()));
    Object.values(samplePois).forEach((fn) => decode(fn()));
  });
});
