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

  test('forest and hills POIs are biome-aware (desert / snow differ from temperate)', () => {
    const at = (poi, biome) => poiSprite({ poi, biome, x: 3, y: 4 });
    // forest: temperate vs desert (cacti) vs snow (snow-laden) all differ
    expect(new Set([at('forest', 'plains'), at('forest', 'desert'), at('forest', 'snow')]).size).toBe(3);
    // hills: temperate vs desert (sand) vs snow (snow-capped) all differ
    expect(new Set([at('hills', 'plains'), at('hills', 'desert'), at('hills', 'snow')]).size).toBe(3);
  });

  test('beach direction changes the geometry', () => {
    const n = decode(biomeBackground({ biome: 'beach', beachDirection: 0 }));
    const e = decode(biomeBackground({ biome: 'beach', beachDirection: 1 }));
    expect(n).not.toBe(e);
  });

  test('corner beach shores (concave 4-7 + convex 8-11) render valid, distinct from straight', () => {
    const straight = decode(biomeBackground({ biome: 'beach', beachDirection: 2 }));
    const seen = new Set();
    [4, 5, 6, 7, 8, 9, 10, 11].forEach((dir) => {
      const svg = decode(biomeBackground({ biome: 'beach', beachDirection: dir }));
      expect(svg).toContain('<polygon'); // diagonal sand/water boundary
      expect(svg).not.toBe(straight);
      seen.add(svg);
    });
    expect(seen.size).toBe(8); // all eight corner variants are distinct
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

  const MILESTONE_POI_IDS = [
    'goblin_hideout', 'shadow_fortress', 'sandstorm_hideout', 'sunken_spire',
    'glacier_hollow', 'silent_steading', 'famine_barrow', 'abandoned_well',
    'grimstead_cellar', 'ironhold_ruins', 'rot_tunnels', 'gear_end_sewers',
    'coghill_foundry', 'desecrated_shrine', 'cult_meeting_place',
    'corrupted_lighthouse', 'mourn_peak_summit',
  ];

  test('every authored milestone POI id renders a distinctive, well-formed sprite', () => {
    const generic = poiSprite({ milestonePoi: true });
    const seen = new Set();
    MILESTONE_POI_IDS.forEach((poi) => {
      const svg = decode(poiSprite({ poi, milestonePoi: true })); // non-null + valid data-URI
      const s = poiSprite({ poi, milestonePoi: true });
      expect(s).not.toBe(generic);   // distinct from the generic flag
      expect(svg.length).toBeGreaterThan(20);
      seen.add(s);
    });
    expect(seen.size).toBe(MILESTONE_POI_IDS.length); // all 17 distinct from each other
  });

  test('milestone POI sprites are deterministic (memoised per id)', () => {
    MILESTONE_POI_IDS.forEach((poi) => {
      expect(poiSprite({ poi, milestonePoi: true })).toBe(poiSprite({ poi, milestonePoi: true }));
    });
  });

  test('unknown milestone POI id falls back to the generic flag (backward-compat)', () => {
    const generic = poiSprite({ milestonePoi: true });
    const unknown = poiSprite({ poi: 'totally_new_milestone_poi', milestonePoi: true });
    decode(unknown);
    expect(unknown).toBe(generic);
  });
});
