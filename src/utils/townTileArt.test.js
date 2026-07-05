import { tileBackground, sampleTiles, wallVariant, buildingTile, POI_EMOJI } from './townTileArt';
import PINS from './townTileArt.pins.json';

const TYPES = ['grass', 'dirt_path', 'stone_path', 'town_square', 'farm_field', 'water', 'bridge', 'wall', 'keep_wall', 'building'];

const decode = (bg) => {
  expect(bg.startsWith('url("data:image/svg+xml,')).toBe(true);
  const svg = decodeURIComponent(bg.slice('url("data:image/svg+xml,'.length, -2));
  expect(svg.startsWith('<svg')).toBe(true);
  expect(svg.endsWith('</svg>')).toBe(true);
  return svg;
};

describe('townTileArt', () => {
  test('every tile type yields a well-formed SVG data-URI', () => {
    TYPES.forEach((type) => {
      const svg = decode(tileBackground({ type, buildingType: 'house' }, { n: 'wall', e: 'wall', s: 'wall', w: 'wall' }, 1, 1));
      // no unresolved template values leaked into the markup
      expect(svg).not.toMatch(/undefined|NaN|\[object/);
    });
  });

  test('terrain variant is deterministic per coordinate', () => {
    const a = tileBackground({ type: 'grass' }, {}, 3, 4);
    const b = tileBackground({ type: 'grass' }, {}, 3, 4);
    const c = tileBackground({ type: 'grass' }, {}, 5, 9);
    expect(a).toBe(b);
    expect(a).not.toBe(c); // different coords -> different decoration
  });

  test('walls autotile: mask changes the geometry; corners/endpoints add a tower', () => {
    const straight = decode(wallVariant(5, false)); // N-S, no tower
    const corner = decode(wallVariant(3, false));   // N+E, tower
    const endpoint = decode(wallVariant(1, false)); // single arm, tower
    expect(straight).not.toBe(corner);
    expect(corner).toContain('<circle');
    expect(endpoint).toContain('<circle');
    expect(straight).not.toContain('<circle');
  });

  test('building archetypes have distinct shapes (not just recoloured)', () => {
    // One per shape family — each should render different geometry. Includes the
    // manor/keep/barracks trio that used to share one shape.
    const families = ['house', 'inn', 'barn', 'blacksmith', 'temple', 'bank', 'manor', 'keep', 'barracks', 'alchemist', 'market', 'guild'];
    const svgs = families.map((b) => decode(buildingTile(b)));
    expect(new Set(svgs).size).toBe(families.length);
  });

  test('shop and market are visually distinct (different colour)', () => {
    expect(decode(buildingTile('shop'))).not.toBe(decode(buildingTile('market')));
  });

  test('previously-shared shapes are now differentiated', () => {
    const pairs = [['blacksmith', 'foundry'], ['library', 'archives'], ['barn', 'warehouse']];
    pairs.forEach(([a, b]) => expect(decode(buildingTile(a))).not.toBe(decode(buildingTile(b))));
  });

  test('stall and dome buildings have a door (door rect at y=20)', () => {
    ['shop', 'market', 'alchemist'].forEach((b) => expect(decode(buildingTile(b))).toContain("y='20'"));
  });

  test('gallery accessors produce valid SVG', () => {
    Object.values(sampleTiles).forEach((fn) => decode(fn()));
    decode(buildingTile('temple'));
    decode(wallVariant(15, true));
  });

  test('desert theme renders a sand ground; grassland default is unchanged', () => {
    const grassDefault = tileBackground({ type: 'grass' }, {}, 2, 2);
    const grassExplicit = tileBackground({ type: 'grass' }, {}, 2, 2, 'grassland');
    const desertGround = tileBackground({ type: 'grass' }, {}, 2, 2, 'desert');
    expect(grassExplicit).toBe(grassDefault);     // passing the default changes nothing
    expect(desertGround).not.toBe(grassDefault);  // desert is visually distinct
    expect(decode(desertGround)).toContain('e0c178'); // sand base colour
    // buildings/walls sit on a sand base too for desert towns
    expect(decode(tileBackground({ type: 'building', buildingType: 'house' }, {}, 1, 1, 'desert'))).toContain('e0c178');
  });

  test('snow theme renders a pale snow ground distinct from grassland and desert', () => {
    const grassDefault = tileBackground({ type: 'grass' }, {}, 2, 2);
    const desertGround = tileBackground({ type: 'grass' }, {}, 2, 2, 'desert');
    const snowGround = tileBackground({ type: 'grass' }, {}, 2, 2, 'snow');
    expect(snowGround).not.toBe(grassDefault);
    expect(snowGround).not.toBe(desertGround);
    expect(decode(snowGround)).toContain('eef3f7'); // snow base colour
    // buildings sit on a snow base too for snow towns
    expect(decode(tileBackground({ type: 'building', buildingType: 'house' }, {}, 1, 1, 'snow'))).toContain('eef3f7');
  });

  test('POI_EMOJI maps grassland + desert + snow decorations to renderable glyphs', () => {
    // grassland (unchanged)
    expect(POI_EMOJI.tree).toBe('🌳');
    expect(POI_EMOJI.bush).toBe('🌿');
    expect(POI_EMOJI.flowers).toBe('🌸');
    // desert / snow decorations placed by the generator must render
    ['cactus', 'rock', 'dead_bush', 'pine', 'snowdrift'].forEach((d) => {
      expect(typeof POI_EMOJI[d]).toBe('string');
      expect(POI_EMOJI[d].length).toBeGreaterThan(0);
    });
    // desert cover is visually distinct from the grassland tree
    expect(POI_EMOJI.cactus).not.toBe(POI_EMOJI.tree);
  });
});

// Tier-1 themed tilesets (backlog #64): palette-only desert/snow variants. The pins in
// townTileArt.pins.json were captured from the renderer BEFORE the building-material
// theming landed, so exact string equality here proves temperate output is untouched
// (cache keys and data-URIs both) and that old saves with no theme marker re-render
// byte-identically.
describe('townTileArt theme palettes', () => {
  const SNOW_CAP_D = "M5 12.5"; // the snow roof band's path signature
  // strip every colour so only geometry remains; silhouettes must survive theming
  const geometry = (bg) => decode(bg)
    .replace(/<path d='M5 12\.5[^/]*\/>/, '')            // drop the snow cap overlay
    .replace(/<defs><filter[\s\S]*?<\/filter><\/defs>/, '') // drop the outline-halo filter
    .replace(/<g filter='url\(#bo\)'>/, '').replace(/<\/g>/, '') // unwrap the halo group
    .replace(/(fill|stroke)='[^']*'/g, "$1=''");

  test('temperate tiles are byte-identical to the pre-theme captures', () => {
    expect(tileBackground({ type: 'grass' }, {}, 2, 3)).toBe(PINS.grass_2_3);
    expect(tileBackground({ type: 'dirt_path' }, {}, 4, 5)).toBe(PINS.dirt_path_4_5);
    expect(tileBackground({ type: 'water' }, {}, 1, 1)).toBe(PINS.water_1_1);
    expect(tileBackground({ type: 'town_square' }, {}, 6, 6)).toBe(PINS.town_square_6_6);
    expect(wallVariant(5, false)).toBe(PINS.wall_mask5);
    expect(wallVariant(3, true)).toBe(PINS.keep_wall_mask3);
  });

  test('temperate buildings are byte-identical to the pre-theme captures', () => {
    expect(buildingTile('house')).toBe(PINS.building_house);
    expect(buildingTile('temple')).toBe(PINS.building_temple);
    expect(buildingTile('inn')).toBe(PINS.building_inn);
    // explicit default theme takes the same path
    expect(buildingTile('house', 'grassland')).toBe(PINS.building_house);
    expect(tileBackground({ type: 'building', buildingType: 'house' }, {}, 0, 0, 'grassland')).toBe(PINS.building_house);
  });

  test('missing or unknown theme falls back to temperate', () => {
    expect(tileBackground({ type: 'grass' }, {}, 2, 3, undefined)).toBe(PINS.grass_2_3);
    expect(tileBackground({ type: 'grass' }, {}, 2, 3, 'jungle')).toBe(PINS.grass_2_3);
    expect(buildingTile('house', 'volcanic')).toBe(PINS.building_house);
    expect(tileBackground({ type: 'building', buildingType: 'temple' }, {}, 0, 0, 'not-a-theme')).toBe(PINS.building_temple);
  });

  test('building materials differ per theme: temperate, desert, and snow are three palettes', () => {
    ['house', 'inn', 'temple', 'keep', 'market'].forEach((b) => {
      const temperate = buildingTile(b);
      const desert = buildingTile(b, 'desert');
      const snowy = buildingTile(b, 'snow');
      expect(new Set([temperate, desert, snowy]).size).toBe(3);
    });
    // the temperate roof hex is fully re-tinted away in the desert variant
    expect(decode(buildingTile('house'))).toContain('9c4a3c');
    expect(decode(buildingTile('house', 'desert'))).not.toContain('9c4a3c');
  });

  test('themed buildings keep the exact silhouette: geometry identical once colour is stripped', () => {
    ['house', 'inn', 'market', 'keep', 'magetower', 'blacksmith'].forEach((b) => {
      const base = geometry(buildingTile(b));
      expect(geometry(buildingTile(b, 'desert'))).toBe(base);
      expect(geometry(buildingTile(b, 'snow'))).toBe(base);
    });
  });

  test('snow buildings carry the white roof band; desert and temperate do not', () => {
    expect(decode(buildingTile('house', 'snow'))).toContain(SNOW_CAP_D);
    expect(decode(buildingTile('house', 'desert'))).not.toContain(SNOW_CAP_D);
    expect(decode(buildingTile('house'))).not.toContain(SNOW_CAP_D);
  });

  test('memoisation caches per theme: repeats hit the cache, themes never collide', () => {
    const tileArgs = { type: 'building', buildingType: 'inn' };
    const desert1 = tileBackground(tileArgs, {}, 0, 0, 'desert');
    const desert2 = tileBackground(tileArgs, {}, 0, 0, 'desert');
    const snowy = tileBackground(tileArgs, {}, 0, 0, 'snow');
    const temperate = tileBackground(tileArgs, {}, 0, 0);
    expect(desert1).toBe(desert2); // same key -> same cached string
    expect(new Set([desert1, snowy, temperate]).size).toBe(3);
    // walls: ground under masonry follows the theme, one cache entry per theme
    const wallGrass = tileBackground({ type: 'wall' }, { n: 'wall', s: 'wall' }, 0, 0);
    const wallSnow = tileBackground({ type: 'wall' }, { n: 'wall', s: 'wall' }, 0, 0, 'snow');
    expect(wallGrass).not.toBe(wallSnow);
    expect(decode(wallSnow)).toContain('eef3f7');
  });

  test('path and ground contrast: dirt path stays legible on sand and snow grounds', () => {
    // the dirt path tile itself is theme-independent (stone/dirt everywhere), so the
    // same tile string is reused across themes; contrast comes from the distinct bases
    const dirtTile = tileBackground({ type: 'dirt_path' }, {}, 4, 5, 'desert');
    expect(dirtTile).toBe(PINS.dirt_path_4_5);
    expect(tileBackground({ type: 'dirt_path' }, {}, 4, 5, 'snow')).toBe(PINS.dirt_path_4_5);
  });
});
