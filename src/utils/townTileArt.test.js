import { tileBackground, sampleTiles, wallVariant, buildingTile, canalTile, canalBridgeTile, quayVariant, waterwayMask, OFF_MAP, jettyTile, jettyInfo, POI_EMOJI, BUILDING_TYPES } from './townTileArt';
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
  const SNOW_CAP_D = "M8 12.2"; // the snow roof band's path signature (shrunk 2026-07-07)
  // strip every colour so only geometry remains; silhouettes must survive theming
  const geometry = (bg) => decode(bg)
    .replace(/<path d='M8 12\.2[^/]*\/>/, '')            // drop the snow cap overlay
    .replace(/<rect x='3\.1' y='16\.8'.*?stroke-linecap='round'\/>/, '') // drop the snow identity signboard
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

  // INTENTIONAL BREAK (backlog #64, tier 2): this test used to assert that EVERY themed
  // building kept the temperate silhouette exactly (tier 1 was palette-only). Tier 2
  // deliberately adds theme-gated shapes — desert flat roofs on house/shop/market, snow
  // smoke + icicles on an allowlisted subset — so the invariance now only holds for the
  // types OUTSIDE those allowlists. Temperate output stays pinned byte-identical above;
  // the tier-2 describe block below asserts the documented additions are present.
  test('themed buildings outside the tier-2 allowlists keep the exact silhouette', () => {
    ['keep', 'magetower', 'blacksmith', 'townhall', 'bank', 'library'].forEach((b) => {
      const base = geometry(buildingTile(b));
      expect(geometry(buildingTile(b, 'desert'))).toBe(base);
      expect(geometry(buildingTile(b, 'snow'))).toBe(base);
    });
    // desert types not in the flat-roof set keep their silhouette even when the snow
    // variant differs (inn gains smoke+icicles only in snow)
    ['inn', 'manor', 'temple'].forEach((b) => {
      expect(geometry(buildingTile(b, 'desert'))).toBe(geometry(buildingTile(b)));
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

// Tier-2 architecture flavour (backlog #64, tier 2): theme-gated SHAPE additions over
// the tier-1 palettes. Desert: flat-roof variants (parapet + awning) on house/shop/
// market. Snow: chimney smoke on dwellings (house/inn/tavern/manor) and an icicle
// fringe on house/shop/temple/inn. Temperate output stays pinned byte-identical.
describe('townTileArt tier-2 architecture flavour', () => {
  const GABLE = "points='7,14 16,6 25,14'"; // the temperate house's gable triangle
  const SMOKE = 'e6edf3';   // lowest smoke wisp tone
  const ICE = 'dceefc';     // icicle fill
  const PARAPET = "x='6.5' y='6.8' width='19'"; // the stall parapet band

  test('desert house trades the gable for a parapet band + awning stripe over the door', () => {
    const desert = decode(buildingTile('house', 'desert'));
    expect(desert).not.toContain(GABLE);
    expect(decode(buildingTile('house'))).toContain(GABLE);      // temperate keeps the gable
    expect(decode(buildingTile('house', 'snow'))).toContain(GABLE); // snow keeps it too
    expect(desert).toContain("x='8' y='8' width='16' height='3.2'"); // parapet band
    expect(desert).toContain('f2ead6'); // awning stripe over the door
  });

  test('desert shop and market stalls gain the parapet band; temperate and snow do not', () => {
    expect(decode(buildingTile('shop', 'desert'))).toContain(PARAPET);
    expect(decode(buildingTile('market', 'desert'))).toContain(PARAPET);
    expect(decode(buildingTile('shop'))).not.toContain(PARAPET);
    expect(decode(buildingTile('shop', 'snow'))).not.toContain(PARAPET);
    // shop and market still read apart (different roof colours under the same shape)
    expect(buildingTile('shop', 'desert')).not.toBe(buildingTile('market', 'desert'));
  });

  test('snow dwellings puff chimney smoke; temperate, desert, and non-dwellings do not', () => {
    ['house', 'inn', 'tavern', 'manor'].forEach((b) => {
      expect(decode(buildingTile(b, 'snow'))).toContain(SMOKE);
      expect(decode(buildingTile(b))).not.toContain(SMOKE);
      expect(decode(buildingTile(b, 'desert'))).not.toContain(SMOKE);
    });
    expect(decode(buildingTile('keep', 'snow'))).not.toContain(SMOKE);
  });

  test('snow icicle fringe hangs under the roof cap on the allowlisted types only', () => {
    ['house', 'shop', 'temple', 'inn'].forEach((b) => {
      expect(decode(buildingTile(b, 'snow'))).toContain(ICE);
      expect(decode(buildingTile(b))).not.toContain(ICE);
      expect(decode(buildingTile(b, 'desert'))).not.toContain(ICE);
    });
    expect(decode(buildingTile('keep', 'snow'))).not.toContain(ICE);
  });

  test('tier-2 additions are deterministic (seeded by type, no randomness)', () => {
    expect(buildingTile('house', 'desert')).toBe(buildingTile('house', 'desert'));
    expect(buildingTile('house', 'snow')).toBe(buildingTile('house', 'snow'));
    expect(buildingTile('inn', 'snow')).toBe(buildingTile('inn', 'snow'));
  });
});

// Snow legibility pass (playtest 2026-07-07: "the snow buildings are not readable with
// the snow caps... hard to tell one building from another"). Three art-layer fixes, no
// generation/tile-data change: the roof tint softened (0.35 -> 0.2) so per-type roof
// colours survive, the shared snow cap shrank to a crest patch so it no longer hides
// the roof, and every non-house building gains an identity signboard carrying its
// UNTINTED temperate roof colour, the one per-type colour snow never covers.
describe('townTileArt snow legibility pass', () => {
  const SIGN = "x='1.4' y='18.6'"; // the identity signboard's board rect
  // The venue types story templates use for quest buildings (storyTemplates.js:
  // trading-post warehouses, inns, taverns, temples, archives, guilds, barracks,
  // alchemists, workshops) plus shop as a commerce control; each must show its
  // untinted temperate roof colour (ROOFS) on the signboard.
  const QUEST_VENUE_ACCENTS = {
    warehouse: '7a5230', inn: 'b5762d', tavern: 'b3672f', temple: 'c9b04a',
    archives: '6a5a3a', guild: '5a6fae', barracks: '566069', alchemist: '7a5a9c',
    workshop: '4a8c8c', shop: '3f7d6e',
  };

  test('the shared snow cap is the shrunk crest patch, not the old full-width band', () => {
    const svg = decode(buildingTile('house', 'snow'));
    expect(svg).toContain('M8 12.2');
    expect(svg).not.toContain('M5 12.5');
  });

  test('every quest-venue type carries a signboard in its untinted identity colour', () => {
    Object.entries(QUEST_VENUE_ACCENTS).forEach(([b, hex]) => {
      const svg = decode(buildingTile(b, 'snow'));
      expect(svg).toContain(SIGN);
      expect(svg).toContain(hex); // the temperate roof colour, un-tinted, below the snow line
    });
  });

  test('every non-house type is signed; houses (the filler stock) are not', () => {
    BUILDING_TYPES.filter((b) => b !== 'house').forEach((b) => {
      expect(decode(buildingTile(b, 'snow'))).toContain(SIGN);
    });
    expect(decode(buildingTile('house', 'snow'))).not.toContain(SIGN);
  });

  test('temperate and desert buildings carry no signboard (snow-only dressing)', () => {
    ['inn', 'warehouse', 'temple'].forEach((b) => {
      expect(decode(buildingTile(b))).not.toContain(SIGN);
      expect(decode(buildingTile(b, 'desert'))).not.toContain(SIGN);
    });
  });

  test('all snow building types render pairwise-distinct art', () => {
    const svgs = BUILDING_TYPES.map((b) => buildingTile(b, 'snow'));
    expect(new Set(svgs).size).toBe(BUILDING_TYPES.length);
  });

  test('softened tint: the snow roof is closer to its temperate hue than the old mix', () => {
    // inn temperate roof #b5762d; at 0.2 toward #4a4038 the red channel stays > 0x9a,
    // where the old 0.35 mix dropped it to ~0x90: assert the tinted hex present now
    const svg = decode(buildingTile('inn', 'snow'));
    expect(svg).toContain('#a06b2f'); // mix('#b5762d', '#4a4038', 0.2)
  });

  test('signboards are deterministic and memo-safe (keyed by type + theme, not coords)', () => {
    expect(buildingTile('warehouse', 'snow')).toBe(buildingTile('warehouse', 'snow'));
    const a = tileBackground({ type: 'building', buildingType: 'warehouse' }, {}, 3, 3, 'snow');
    const b = tileBackground({ type: 'building', buildingType: 'warehouse' }, {}, 9, 9, 'snow');
    expect(a).toBe(b);
  });

  test('a building tile missing its buildingType renders as the keyed fallback (house)', () => {
    // the memo key already normalises a missing type to 'house'; the ART must match it
    // in every theme so cache-fill order can never change what a save renders.
    // buildingTile() bypasses the cache, so this compares the generated strings, not
    // one cache entry with itself.
    ['grassland', 'desert', 'snow'].forEach((theme) => {
      expect(buildingTile(undefined, theme)).toBe(buildingTile('house', theme));
    });
  });
});

// Jetty treatment (WATER_TOWNS_PLAN §1b, shipped as view-layer art): dock structures
// laid as 'bridge' tiles re-skin retroactively when render-time detection says the
// plank walk ends in water on exactly one axis end. Crossings stay byte-identical.
describe('townTileArt jetties (bridge tiles that end in water)', () => {
  const POST = "r='1.9'"; // the mooring post's signature radius
  const DOCK = { n: 'water', e: 'water', w: 'water', s: 'beach' };

  test('jettyInfo: a bridge whose walk axis ends in water on one side is a jetty', () => {
    expect(jettyInfo({ type: 'bridge' }, DOCK)).toEqual({ waterEnd: 'n' }); // dock stub off a beach
    expect(jettyInfo({ type: 'bridge' }, { n: 'water', s: 'bridge', e: 'water', w: 'water' })).toEqual({ waterEnd: 'n' }); // tip of a longer finger
    expect(jettyInfo({ type: 'bridge' }, { w: 'stone_path', n: 'water', s: 'water', e: 'water' })).toEqual({ waterEnd: 'e' }); // east-pointing off a quay
    expect(jettyInfo({ type: 'bridge' }, { n: 'dirt_path', s: 'water', e: 'grass', w: 'grass' })).toEqual({ waterEnd: 's' });
  });

  test('jettyInfo: crossings, bends, finger bodies, and no-info bridges are not jetties', () => {
    expect(jettyInfo({ type: 'bridge' }, { n: 'stone_path', s: 'dirt_path', e: 'water', w: 'water' })).toBeNull(); // land to land: crossing
    expect(jettyInfo({ type: 'bridge' }, { n: 'bridge', s: 'bridge', e: 'water', w: 'water' })).toBeNull();        // mid-span/finger body
    expect(jettyInfo({ type: 'bridge' }, { s: 'stone_path', e: 'bridge', n: 'water', w: 'water' })).toBeNull();    // bend: walk continues on both axes
    expect(jettyInfo({ type: 'bridge' }, {})).toBeNull();       // no neighbour info: historical art
    expect(jettyInfo({ type: 'stone_path' }, DOCK)).toBeNull(); // only bridges qualify
    expect(jettyInfo(null, DOCK)).toBeNull();
  });

  test('a jetty renders differently from a crossing bridge; crossings stay byte-identical', () => {
    const jetty = tileBackground({ type: 'bridge' }, DOCK, 2, 2);
    expect(jetty).not.toBe(sampleTiles.bridge());
    expect(decode(jetty)).toContain(POST);     // mooring post at the water end
    expect(decode(jetty)).toContain('3f7cc2'); // open water shows through the plank gaps
    // crossings (and neighbour-less callers) keep the classic plank tile byte-for-byte
    expect(tileBackground({ type: 'bridge' }, { n: 'stone_path', s: 'dirt_path', e: 'water', w: 'water' }, 2, 2)).toBe(sampleTiles.bridge());
    expect(tileBackground({ type: 'bridge' }, {}, 2, 2)).toBe(sampleTiles.bridge());
  });

  test('all four orientations render distinct art; canal-side jetties sit on canal water', () => {
    const dirs = ['n', 'e', 's', 'w'].map((d) => jettyTile(d, 9));
    expect(new Set(dirs).size).toBe(4);
    dirs.forEach((bg) => expect(decode(bg)).not.toMatch(/undefined|NaN/));
    expect(decode(jettyTile('n', 9, true))).toContain('386da8');  // canal-water base
    expect(decode(jettyTile('n', 9, false))).toContain('3f7cc2'); // sea-water base
    // a waterway bridge stub routed through tileBackground takes the canal-water jetty
    const canalJetty = tileBackground({ type: 'bridge', waterway: true }, DOCK, 3, 3, 'grassland', 14);
    expect(decode(canalJetty)).toContain(POST);
    expect(decode(canalJetty)).toContain('386da8');
  });

  test('memo keys: jetty vs crossing at the same coordinate never collide; repeats hit the cache', () => {
    const a = tileBackground({ type: 'bridge' }, DOCK, 5, 5);
    const a2 = tileBackground({ type: 'bridge' }, DOCK, 5, 5);
    const crossing = tileBackground({ type: 'bridge' }, { n: 'stone_path', s: 'stone_path' }, 5, 5);
    const east = tileBackground({ type: 'bridge' }, { w: 'stone_path', n: 'water', s: 'water', e: 'water' }, 5, 5);
    expect(a2).toBe(a);
    expect(new Set([a, crossing, east]).size).toBe(3);
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

describe('waterwayMask OFF_MAP (maintainer bug: river dammed at the map border)', () => {
  const canal = { type: 'water', waterway: true };

  test('off-map beyond a border channel tile counts as wet, so the mouth renders open', () => {
    // a N-S channel tile on the north border: water S, off-map N -> straight run (5),
    // not a dead end walled across the mouth (4)
    expect(waterwayMask(canal, { n: OFF_MAP, s: canal })).toBe(5);
    expect(waterwayMask(canal, { e: OFF_MAP, w: canal })).toBe(10);
    expect(waterwayMask(canal, { s: OFF_MAP })).toBe(4);
    expect(waterwayMask(canal, { w: OFF_MAP })).toBe(8);
  });

  test('off-map diagonals count too, so border junction hearts draw no stranded nib', () => {
    expect(waterwayMask(canal, { ne: OFF_MAP })).toBe(16);
    expect(waterwayMask(canal, { n: OFF_MAP, e: OFF_MAP, s: canal, w: canal, ne: OFF_MAP })).toBe(15 | 16);
  });

  test('merely-unprovided neighbours stay dry (gallery swatches and legacy callers unchanged)', () => {
    expect(waterwayMask(canal, {})).toBe(0);
    expect(waterwayMask(canal, { n: null, e: undefined })).toBe(0);
    // gallery swatches call canalTile with a fixed mask directly: mask in, same art out
    expect(canalTile(5, 'grassland', 1)).toBe(canalTile(5, 'grassland', 1));
  });

  test('OFF_MAP never wets sea/lake water, quay paths, or waterway bridges', () => {
    // plain sea water masks 0 regardless (renders exactly as before)
    expect(waterwayMask({ type: 'water' }, { n: OFF_MAP, s: OFF_MAP })).toBe(0);
    // a shore path at the border earns no quay lip from the void
    expect(waterwayMask({ type: 'stone_path' }, { s: OFF_MAP })).toBe(0);
    expect(waterwayMask({ type: 'dirt_path' }, { e: OFF_MAP, s: canal })).toBe(4);
    // a waterway bridge derives its channel axis from real water only
    expect(waterwayMask({ type: 'bridge', waterway: true }, { n: OFF_MAP, e: canal, w: canal })).toBe(10);
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
