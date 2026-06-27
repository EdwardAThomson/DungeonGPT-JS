import { tileBackground, sampleTiles, wallVariant, buildingTile, POI_EMOJI } from './townTileArt';

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
