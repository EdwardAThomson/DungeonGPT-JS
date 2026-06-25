import { tileBackground, sampleTiles, wallVariant, buildingTile } from './townTileArt';

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
    // One per shape family — each should render different geometry.
    const families = ['house', 'inn', 'barn', 'blacksmith', 'temple', 'bank', 'keep', 'alchemist', 'market', 'guild'];
    const svgs = families.map((b) => decode(buildingTile(b)));
    expect(new Set(svgs).size).toBe(families.length);
  });

  test('gallery accessors produce valid SVG', () => {
    Object.values(sampleTiles).forEach((fn) => decode(fn()));
    decode(buildingTile('temple'));
    decode(wallVariant(15, true));
  });
});
