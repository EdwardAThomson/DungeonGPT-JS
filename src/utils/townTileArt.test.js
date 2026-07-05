import { tileBackground, sampleTiles, wallVariant, buildingTile, canalTile, canalBridgeTile, quayVariant, waterwayMask, POI_EMOJI } from './townTileArt';
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

// Water towns #65, Phase 4: directional canal tiles, basin treatment, quay lips, and
// bridge-over-canal, all derived at render time from the 4-bit waterway-neighbour mask
// (N=1, E=2, S=4, W=8). Sea/lake water without the waterway flag, and every path away
// from a canal, must keep the pre-canal pinned output byte-for-byte.
describe('townTileArt canal dressing (waterway mask)', () => {
  const NIB = "rx='1' fill="; // corner-nib signature (banks carry no rx; cobbles use rx='1.6')

  test('all 16 waterway masks produce distinct, well-formed channel shapes', () => {
    const all = Array.from({ length: 16 }, (_, m) => canalTile(m, 'grassland', 7));
    all.forEach((bg) => expect(decode(bg)).toContain('386da8')); // calmer, darker canal water base
    expect(new Set(all).size).toBe(16);
  });

  test('straight runs carry stone banks along both dry sides only', () => {
    const ns = decode(canalTile(5, 'grassland', 1)); // wet N+S: banks W and E
    expect(ns).toContain("x='0' y='0' width='4.5' height='32'");    // W bank
    expect(ns).toContain("x='27.5' y='0' width='4.5' height='32'"); // E bank
    expect(ns).not.toContain("width='32' height='4.5'");            // no N/S bank
    const ew = decode(canalTile(10, 'grassland', 1)); // wet E+W: banks N and S
    expect(ew).toContain("x='0' y='0' width='32' height='4.5'");
    expect(ew).not.toContain("height='32' fill='#c2bba9'");
  });

  test('basin threshold: 3-4 wet neighbours render open with corner nibs, 2 or fewer do not', () => {
    expect(decode(canalTile(15, 'grassland', 1))).toContain(NIB); // 4-way cross / basin interior
    expect(decode(canalTile(7, 'grassland', 1))).toContain(NIB);  // T-junction / basin edge
    expect(decode(canalTile(5, 'grassland', 1))).not.toContain(NIB);  // straight
    expect(decode(canalTile(3, 'grassland', 1))).not.toContain(NIB);  // bend
    expect(decode(canalTile(1, 'grassland', 1))).not.toContain(NIB);  // dead end
  });

  test('sea/lake water without the waterway flag renders exactly the pinned pre-canal tile', () => {
    expect(tileBackground({ type: 'water' }, {}, 1, 1)).toBe(PINS.water_1_1);
    // even a (spurious) nonzero mask never restyles plain water
    expect(tileBackground({ type: 'water' }, {}, 1, 1, 'grassland', 10)).toBe(PINS.water_1_1);
    // waterway water at the same coordinate is the canal treatment, not plain water
    expect(tileBackground({ type: 'water', waterway: true }, {}, 1, 1, 'grassland', 10)).not.toBe(PINS.water_1_1);
  });

  test('memo keys are distinct per mask and theme (no cache collisions)', () => {
    const canal = { type: 'water', waterway: true };
    const a = tileBackground(canal, {}, 4, 4, 'grassland', 5);
    const b = tileBackground(canal, {}, 4, 4, 'grassland', 10);
    const c = tileBackground(canal, {}, 4, 4, 'desert', 5);
    const a2 = tileBackground(canal, {}, 4, 4, 'grassland', 5);
    expect(a2).toBe(a); // repeat hits the cache
    expect(new Set([a, b, c]).size).toBe(3);
    // quay variants never collide with the plain path at the same coordinate
    const plain = tileBackground({ type: 'stone_path' }, {}, 6, 7);
    const quay = tileBackground({ type: 'stone_path' }, {}, 6, 7, 'grassland', 4);
    expect(quay).not.toBe(plain);
  });

  test('waterwayMask: canal water counts sea/basin water and bridges as open channel', () => {
    const canal = { type: 'water', waterway: true };
    expect(waterwayMask(canal, { n: { type: 'water' } })).toBe(1); // sea/lake/basin mouth stays open
    expect(waterwayMask(canal, { e: { type: 'water', waterway: true } })).toBe(2);
    expect(waterwayMask(canal, { s: { type: 'bridge', waterway: true } })).toBe(4); // channel continues under
    expect(waterwayMask(canal, { w: { type: 'grass' } })).toBe(0);
    expect(waterwayMask(canal, { n: { type: 'water' }, e: { type: 'water' }, s: { type: 'water' }, w: { type: 'water' } })).toBe(15);
    // plain water never masks (renders as before regardless of neighbours)
    expect(waterwayMask({ type: 'water' }, { n: canal, e: canal, s: canal, w: canal })).toBe(0);
    expect(waterwayMask(null, { n: canal })).toBe(0);
  });

  test('quay lip appears only beside waterway water', () => {
    const canal = { type: 'water', waterway: true };
    expect(waterwayMask({ type: 'stone_path' }, { s: canal })).toBe(4);
    expect(waterwayMask({ type: 'dirt_path' }, { e: canal })).toBe(2);
    expect(waterwayMask({ type: 'stone_path' }, { s: { type: 'water' } })).toBe(0);          // plain sea shore: no lip
    expect(waterwayMask({ type: 'stone_path' }, { s: { type: 'bridge', waterway: true } })).toBe(0); // bridges earn none
    expect(waterwayMask({ type: 'town_square' }, { s: canal })).toBe(0);
    // mask 0 renders byte-identical to the pinned pre-canal path
    expect(tileBackground({ type: 'dirt_path' }, {}, 4, 5)).toBe(PINS.dirt_path_4_5);
    // a lipped path keeps the full path base underneath and adds the band + bollards
    const quay = decode(quayVariant(4, 'grassland'));
    const base = decode(sampleTiles.town_square()); // same stoneInner seed as quayVariant's stone base
    expect(quay).toContain(base.slice(base.indexOf('<rect'), base.indexOf('</svg>')));
    expect(quay).toContain('<circle');
  });

  test('theme bank palettes: temperate stone, desert sandstone, snow icy grey', () => {
    const g = canalTile(5, 'grassland', 3);
    const d = canalTile(5, 'desert', 3);
    const s = canalTile(5, 'snow', 3);
    expect(new Set([g, d, s]).size).toBe(3);
    expect(decode(g)).toContain('c2bba9');
    expect(decode(d)).toContain('d9bc82');
    expect(decode(s)).toContain('ccd6de');
    // unknown/missing themes fall back to temperate stone
    expect(canalTile(5, 'jungle', 3)).toBe(g);
    // quay lips follow the same palettes
    expect(decode(quayVariant(4, 'desert'))).toContain('a5854a');
    expect(decode(quayVariant(4, 'snow'))).toContain('8fa0ac');
  });

  test('bridge over a canal orients the deck across the channel; plain bridges unchanged', () => {
    const nsChannel = decode(canalBridgeTile(5, 2));  // water N+S: horizontal deck band
    const ewChannel = decode(canalBridgeTile(10, 2)); // water E+W: vertical deck band
    expect(nsChannel).not.toBe(ewChannel);
    expect(nsChannel).toContain("y='4.5'"); // deck band inset top/bottom, water shows N and S
    expect(nsChannel).not.toContain("x='4.5'");
    expect(ewChannel).toContain("x='4.5'"); // deck band inset left/right, water shows E and W
    expect(ewChannel).not.toContain("y='4.5'");
    // both show canal water beneath the span
    expect(nsChannel).toContain('386da8');
    // a tie (no clear channel axis) defaults to the classic walk axis, never throws
    expect(decode(canalBridgeTile(0, 2))).toContain('386da8');
    // ordinary bridges (no waterway flag) are byte-identical to the classic plank tile
    expect(tileBackground({ type: 'bridge' }, {}, 2, 2)).toBe(sampleTiles.bridge());
    // a waterway bridge routed through tileBackground takes the canal variant
    expect(tileBackground({ type: 'bridge', waterway: true }, {}, 2, 2, 'grassland', 5)).not.toBe(sampleTiles.bridge());
  });
});

describe('junction nibs need a dry diagonal (playtest 2026-07-06: bollard floating in the river)', () => {
  const decode = (bg) => decodeURIComponent(bg.replace(/^url\("data:image\/svg\+xml,/, '').replace(/"\)$/, ''));
  const NIB = "width='3.2' height='3.2'";

  it('a basin corner with dry diagonals keeps its nibs', () => {
    expect(decode(canalTile(15, 'grassland', 1))).toContain(NIB);
  });

  it('a mid-channel junction (all diagonals wet) draws no nibs', () => {
    expect(decode(canalTile(15 | 16 | 32 | 64 | 128, 'grassland', 1))).not.toContain(NIB);
  });

  it('mixed: only the dry-diagonal corner gets a nib', () => {
    const svg = decode(canalTile(15 | 16 | 32 | 64, 'grassland', 1)); // NW dry only
    expect((svg.match(/width='3\.2' height='3\.2'/g) || []).length).toBe(1);
  });
});
