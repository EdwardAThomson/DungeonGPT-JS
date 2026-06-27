// localNarrator.js
// Pure, deterministic, seeded local movement/location narration for guests (no LLM).
//
// This is Phase B3a of TIERED_NARRATION_PLAN.md: logged-out players currently get
// nothing when they move on the world map (the AI narration is gated behind sign-in).
// Combat is already narrated locally/templated, and introComposer.js is the working
// guest-intro precedent; this module generalizes that pattern to movement/location.
//
// Conventions (kept in sync with introComposer.js + SafeMarkdownMessage):
//   - Markdown uses *italics* and **bold** only. NEVER _underscores_ (the renderer
//     only supports `*`).
//   - Fully deterministic: every selection is seeded from worldSeed + tile x/y, so
//     reloading a save reproduces byte-identical prose. No Math.random()/Date.now().
//   - No AI/prompt markers leak into output — these are plain, DM-flavoured fragments.

// --- Seeded RNG (xfnv1a hash -> mulberry32) -------------------------------------
// Deterministic per (worldSeed, x, y). Returns a stateful generator so each fragment
// category draws from a distinct point in the sequence (variety between tiles) while
// the same tile always yields the same draws (variety is stable across reloads).
const hashSeed = (parts) => {
  const str = parts.map((p) => String(p)).join('|');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// --- Terrain resolution ----------------------------------------------------------
// Collapse a tile's biome + poi into a single template key. Biomes the generator can
// produce today are plains/desert/water/beach; forest/mountain/hills/ruins/cave are
// POIs laid over land. snow/swamp/woodland keys are included for themed maps (Phase 2b)
// and degrade to a sensible default if the data never produces them.
const resolveTerrainKey = (tile) => {
  if (!tile) return 'plains';
  switch (tile.poi) {
    case 'town':
      return 'town';
    case 'forest':
      return 'woodland';
    case 'mountain':
      return 'mountain';
    case 'hills':
      return 'hills';
    case 'ruins':
      return 'ruins';
    case 'cave':
    case 'cave_entrance':
      return 'cave';
    default:
      break;
  }
  switch (tile.biome) {
    case 'desert':
      return 'desert';
    case 'water':
      return 'water';
    case 'beach':
      return 'beach';
    case 'snow':
      return 'snow';
    case 'swamp':
      return 'swamp';
    case 'forest':
    case 'woodland':
      return 'woodland';
    case 'plains':
    default:
      return 'plains';
  }
};

// --- Template pools --------------------------------------------------------------
// Each terrain has a pool of first-visit arrivals, terser revisit lines, and ambient
// sensory details. Pools are intentionally several deep so a session doesn't read
// "You enter the forest. You enter the forest." Keep fragments terse and DM-voiced.
const TEMPLATES = {
  plains: {
    arrival: [
      'The party crests a low rise into open grassland that rolls away in every direction.',
      'Wide fields of windblown grass stretch out before the party, broken only by the odd lonely tree.',
      'The land opens into gentle plains, the horizon a long pale line under an enormous sky.',
      'Tall grass whispers around the party as they step out onto the open flatlands.'
    ],
    revisit: [
      'Familiar grassland spreads around the party again, the wind never quite still.',
      'The party moves on across more open fields, the grass tugging at their boots.',
      'More rolling plains, the same restless grass bending in the breeze.',
      'The open country goes on, one field much like the last under the wide sky.',
      'The party tramps on through the grass, the horizon no nearer than before.'
    ],
    ambient: [
      'A hawk wheels somewhere high overhead.',
      'Insects drone in the warm, swaying grass.',
      'The wind carries the dry, green smell of summer hay.',
      'Cloud shadows drift slowly across the open ground.'
    ]
  },
  desert: {
    arrival: [
      'The party trudges out onto cracked, sun-baked sand where heat shimmers off every dune.',
      'A sea of windswept dunes opens ahead, the sun hammering down without mercy.',
      'The ground turns to scorching sand, and a dry wind throws grit against the party.',
      'Endless desert stretches before the party, pale and merciless under a white sun.'
    ],
    revisit: [
      'More burning sand, the dunes blurring together in the haze.',
      'The party pushes on across the parched desert, throats already dry.',
      'Another stretch of shadeless sand, the heat pressing down like a hand.',
      'The dunes roll on without end, every crest the same as the last.',
      'The party trudges deeper into the waste, sand grinding in every seam.'
    ],
    ambient: [
      'Sand hisses across the dunes on a hot, gritty wind.',
      'The air ripples with heat, distorting the horizon.',
      'Nothing moves but the slow march of the dunes.',
      'A vulture turns lazily in the blinding sky.'
    ]
  },
  snow: {
    arrival: [
      'The party crunches out onto a frozen waste where snow swallows every sound.',
      'A bitter wind cuts across an unbroken field of white as the party presses on.',
      'Snow lies deep and silent here, the cold biting at every exposed inch of skin.',
      'The land turns to ice and drifting snow, breath clouding in the frigid air.'
    ],
    revisit: [
      'More frozen ground, the snow squeaking underfoot.',
      'The party trudges on through the cold, fingers numb in the wind.',
      'Another white expanse, the chill working deeper into their bones.',
      'The snow stretches on, every drift the twin of the last.',
      'The party presses deeper into the cold, breath freezing on their scarves.'
    ],
    ambient: [
      'Fine snow sifts down from a low grey sky.',
      'The cold is so complete it seems to hum in the silence.',
      'Wind moans across the drifts and dies away.',
      'Frost glitters where a thin sun breaks through.'
    ]
  },
  water: {
    arrival: [
      'The party halts at the water\'s edge, dark waves lapping cold against the shore.',
      'Open water spreads ahead, restless and grey to the far horizon.',
      'The ground gives way to a broad expanse of water, its surface broken by slow swells.',
      'A wide stretch of water bars the way, gulls crying somewhere out over the swell.'
    ],
    revisit: [
      'The water laps at the shore again, cold and patient.',
      'The party skirts the edge of the water once more, spray on the wind.',
      'Familiar waves roll in, hissing back over wet stones.'
    ],
    ambient: [
      'Salt spray drifts on the breeze.',
      'Waves break and draw back in a slow, endless rhythm.',
      'Sunlight scatters in bright shards across the water.',
      'Somewhere a gull calls and is answered.'
    ]
  },
  beach: {
    arrival: [
      'The party steps out onto pale sand where the tide draws long lines along the shore.',
      'A ribbon of sandy beach opens up, the surf hissing in and out a few paces away.',
      'Soft sand shifts underfoot as the party reaches the open shoreline.',
      'The shore stretches away in both directions, strewn with weed and bleached driftwood.'
    ],
    revisit: [
      'More sand and surf, the tide tracing the same old lines.',
      'The party walks on along the beach, footprints filling with seawater.',
      'Another stretch of shoreline, gulls scattering ahead of them.'
    ],
    ambient: [
      'The surf hisses up the sand and slides back.',
      'A briny wind tugs at hair and cloaks.',
      'Tiny crabs scuttle for cover among the weed.',
      'Driftwood lies half-buried where the tide left it.'
    ]
  },
  woodland: {
    arrival: [
      'The party passes beneath a canopy of crowding trees, the light going green and dim.',
      'Dense woodland closes in around the party, the air cool and heavy with leaf-mould.',
      'Trees rise tall on every side as the party threads into the forest shade.',
      'The path narrows into thick woods where branches knit overhead.'
    ],
    revisit: [
      'More close-grown trees, the same hush settling over the party.',
      'The party moves deeper among the trunks, twigs snapping underfoot.',
      'Familiar woodland shadow folds around them again.',
      'The trees crowd on, the green gloom unbroken ahead.',
      'The party threads further into the woods, roots catching at their boots.'
    ],
    ambient: [
      'Birdsong filters down through the leaves.',
      'Something small rustles away through the undergrowth.',
      'Shafts of light fall through the canopy in dusty bars.',
      'The damp smell of bark and rotting leaves hangs in the air.'
    ]
  },
  swamp: {
    arrival: [
      'The party wades into a sodden marsh where every step sucks at their boots.',
      'Stagnant water and reeking mud spread out beneath a tangle of dead trees.',
      'The ground turns to bog, mist curling low over black, still water.',
      'A fetid swamp opens before the party, alive with the drone of insects.'
    ],
    revisit: [
      'More black water and clinging mud, the stench no kinder than before.',
      'The party slogs on through the mire, midges thick around their heads.',
      'Another stretch of bog, the reeds whispering wetly.'
    ],
    ambient: [
      'Bubbles rise and burst in the dark water.',
      'Clouds of midges hang in the heavy air.',
      'Something unseen slips beneath the surface.',
      'A low mist drifts between the dead trees.'
    ]
  },
  mountain: {
    arrival: [
      'The party climbs onto bare, rocky ground where stone teeth claw at the sky.',
      'Steep slopes of broken rock rise around the party as the air grows thin and cold.',
      'The way turns to a hard scramble over scree, peaks looming grey above.',
      'Jagged mountains hem the party in, the wind keening between the crags.'
    ],
    revisit: [
      'More loose rock and steep ground, the climb no gentler than before.',
      'The party picks its way on across the stony heights.',
      'Familiar crags rise around them, cold wind pouring down the slopes.',
      'The broken rock goes on, the path picking endlessly up and over.',
      'The party scrambles higher, scree shifting away beneath their boots.'
    ],
    ambient: [
      'Loose stones clatter away down the slope.',
      'The thin wind whistles between the rocks.',
      'An eagle drifts on the updrafts far above.',
      'Snow clings in the high shaded clefts.'
    ]
  },
  hills: {
    arrival: [
      'The party climbs into rolling hill country, the land rising and falling in long green waves.',
      'Low hills spread out ahead, their crests catching the light and their hollows in shade.',
      'The ground swells into grassy hills that hide the horizon at every rise.',
      'The party crests one hill only to find another rolling away beyond it.'
    ],
    revisit: [
      'More rolling hills, the climbs and descents blurring together.',
      'The party tops another rise and starts down the far side.',
      'Familiar green slopes rise and fall around them.',
      'The hills go on, each crest hiding another fold of land beyond.',
      'The party labours up yet another slope, legs aching from the last.'
    ],
    ambient: [
      'Wind combs through the long hilltop grass.',
      'Sheep tracks wind away over the nearest crest.',
      'A skylark sings, unseen, somewhere above.',
      'Cloud shadow slides over the folded land.'
    ]
  },
  ruins: {
    arrival: [
      'The party comes upon crumbling ruins, broken walls jutting from the earth like old bones.',
      'Toppled columns and shattered stone mark some long-dead place the party now enters.',
      'Ancient ruins sprawl ahead, half-swallowed by creeping vine and drifted soil.',
      'The party steps among fallen archways and weathered carvings worn past reading.'
    ],
    revisit: [
      'The familiar ruins loom again, silent and patient in their decay.',
      'The party picks back through the broken stones they passed before.',
      'More tumbled walls, the same heavy stillness hanging over them.'
    ],
    ambient: [
      'Wind sighs through empty window-holes.',
      'Lizards bask and dart along the warm fallen stone.',
      'Faded carvings hint at some forgotten purpose.',
      'Dust lies thick in the shadow of the old walls.'
    ]
  },
  cave: {
    arrival: [
      'The party reaches a dark cave mouth that breathes cold, damp air into the daylight.',
      'A jagged opening yawns in the rock ahead, swallowing all light a few paces in.',
      'The way leads to a cave entrance, its throat black and silent before the party.',
      'A low, dark cavern mouth gapes in the hillside as the party draws near.'
    ],
    revisit: [
      'The cave mouth waits as before, dark and exhaling cold.',
      'The party returns to the familiar black opening in the rock.',
      'The same damp breath of the cave meets them again.'
    ],
    ambient: [
      'Water drips somewhere deep in the dark.',
      'Cold, stale air seeps out of the opening.',
      'The sounds of the world seem to stop at the cave mouth.',
      'Pale roots dangle over the dark entrance.'
    ]
  }
};

const fallbackPool = TEMPLATES.plains;
const poolFor = (key) => TEMPLATES[key] || fallbackPool;

// --- Neighbour landmark clause ---------------------------------------------------
// Mirror the AI path's "surrounding terrain" context (promptBuilder.getSurroundingTerrain)
// but as prose: pick at most one notable neighbour so the line reads "Mountains rise to
// the east." Selection is seeded, so it's stable across reloads.
const DIRS = [
  { dx: 0, dy: -1, name: 'north' },
  { dx: 1, dy: 0, name: 'east' },
  { dx: 0, dy: 1, name: 'south' },
  { dx: -1, dy: 0, name: 'west' }
];

const describeNeighbour = (tile, name) => {
  if (!tile) return null;
  if (tile.poi === 'town' && tile.townName) return `the rooftops of **${tile.townName}** rise to the ${name}`;
  if (tile.poi === 'town') return `a settlement sits to the ${name}`;
  if (tile.poi === 'mountain') return `mountains rise to the ${name}`;
  if (tile.poi === 'hills') return `low hills roll away to the ${name}`;
  if (tile.poi === 'forest') return `dark woods crowd the ${name}`;
  if (tile.poi === 'ruins') return `broken ruins lie to the ${name}`;
  if (tile.poi === 'cave' || tile.poi === 'cave_entrance') return `a cave mouth gapes to the ${name}`;
  if (tile.biome === 'water') return `water glints to the ${name}`;
  if (tile.biome === 'beach') return `a pale shoreline runs to the ${name}`;
  if (tile.biome === 'desert') return `dunes roll away to the ${name}`;
  if (tile.biome === 'swamp') return `the bog stretches to the ${name}`;
  return null;
};

const buildNeighbourClause = (coords, worldMap, rng) => {
  if (!worldMap || !worldMap.length || !coords) return null;
  const { x, y } = coords;
  const found = [];
  for (const { dx, dy, name } of DIRS) {
    const ny = y + dy;
    const nx = x + dx;
    if (ny >= 0 && ny < worldMap.length && worldMap[ny] && nx >= 0 && nx < worldMap[ny].length) {
      const desc = describeNeighbour(worldMap[ny][nx], name);
      if (desc) found.push(desc);
    }
  }
  if (found.length === 0) return null;
  const pick = found[Math.floor(rng() * found.length)];
  return pick.charAt(0).toUpperCase() + pick.slice(1) + '.';
};

// --- Party-state clause ----------------------------------------------------------
// Surface a coarse wounded band (matching promptComposer's WOUNDED tags) so the prose
// reflects a battered party rather than always reading as fresh.
const buildPartyClause = (selectedHeroes = [], rng) => {
  let worst = null; // 'defeated' | 'critical' | 'wounded'
  const rank = { defeated: 3, critical: 2, wounded: 1 };
  for (const hero of selectedHeroes) {
    const defeated = (hero.currentHP != null && hero.currentHP <= 0) || hero.isDefeated;
    let band = null;
    if (defeated) band = 'defeated';
    else if (hero.currentHP != null && hero.maxHP) {
      const pct = (hero.currentHP / hero.maxHP) * 100;
      if (pct <= 25) band = 'critical';
      else if (pct <= 50) band = 'wounded';
    }
    if (band && (!worst || rank[band] > rank[worst])) worst = band;
  }
  if (!worst) return null;
  const lines = {
    defeated: [
      'They move slowly, a fallen companion carried among them.',
      'The party presses on grimly, one of their own unable to stand.'
    ],
    critical: [
      'The wounded among them can barely keep their feet.',
      'Blood and exhaustion weigh on the party with every step.'
    ],
    wounded: [
      'Fresh wounds slow the party\'s pace.',
      'The party moves carefully, nursing their hurts.'
    ]
  };
  const pool = lines[worst];
  return pool[Math.floor(rng() * pool.length)];
};

// --- Public composer -------------------------------------------------------------
/**
 * Compose deterministic, templated movement/location prose for the no-AI (guest) path.
 * Same inputs the AI path assembles via composeMovementNarrativePrompt, minus the LLM.
 *
 * @param {Object} args
 * @param {Object} args.tile - The tile moved to (biome, poi, townName, descriptionSeed).
 * @param {Object} args.coords - { x, y } of the tile.
 * @param {string|number} [args.worldSeed] - World seed; combined with coords for determinism.
 * @param {Array} [args.worldMap] - Full world map grid, for neighbour landmark prose.
 * @param {Object} [args.settings] - Game settings (theme reserved for future use).
 * @param {Array} [args.selectedHeroes] - Party, for a coarse wounded-state clause.
 * @param {boolean} [args.isNewArea] - First visit to this biome/town -> richer arrival.
 * @returns {string} Markdown prose (uses *italics* / **bold**, never _underscores_).
 */
export const composeLocalMovementNarrative = ({
  tile,
  coords = {},
  worldSeed = null,
  worldMap = null,
  settings = {}, // eslint-disable-line no-unused-vars
  selectedHeroes = [],
  isNewArea = true
} = {}) => {
  if (!tile) return '';
  const x = coords.x != null ? coords.x : tile.x;
  const y = coords.y != null ? coords.y : tile.y;
  const rng = mulberry32(hashSeed([worldSeed == null ? 'noseed' : worldSeed, x, y]));

  const key = resolveTerrainKey(tile);
  const pool = poolFor(key);

  // Town tiles get a dedicated opening that names the settlement.
  let opening;
  if (tile.poi === 'town' && tile.townName) {
    const size = tile.townSize || 'settlement';
    const townOpenings = [
      `The party arrives at the edge of **${tile.townName}**, a ${size} of timber and stone.`,
      `The road brings the party to **${tile.townName}**, a ${size} stirring with life.`,
      `**${tile.townName}** opens up ahead, a ${size} where smoke rises from clustered roofs.`,
      `The party reaches **${tile.townName}**, a ${size} hard against the open country.`
    ];
    const revisitOpenings = [
      `The party returns to the edge of **${tile.townName}**, its streets familiar now.`,
      `**${tile.townName}** comes into view again, a known face in the wilds.`
    ];
    const set = isNewArea ? townOpenings : revisitOpenings;
    opening = set[Math.floor(rng() * set.length)];
  } else {
    const set = isNewArea ? pool.arrival : pool.revisit;
    opening = set[Math.floor(rng() * set.length)];
  }

  const ambient = pool.ambient[Math.floor(rng() * pool.ambient.length)];
  const neighbourClause = buildNeighbourClause({ x, y }, worldMap, rng);
  const partyClause = buildPartyClause(selectedHeroes, rng);

  // Assemble: opening sentence, then an italicised ambient detail, an optional
  // landmark line, and an optional party-state line. Italics mark the ambient flavour
  // (mirrors introComposer's closing italic line) without a heavy visual marker.
  const sentences = [opening];
  const tail = [];
  if (ambient) tail.push(ambient);
  if (neighbourClause) tail.push(neighbourClause);
  if (tail.length) sentences.push(`*${tail.join(' ')}*`);
  if (partyClause) sentences.push(partyClause);

  return sentences.join(' ');
};

// --- Ambient "look around" composer ---------------------------------------------
// On-demand observation of the CURRENT tile, used by the Look-around button for the
// no-AI (guest / master-off) path. Reuses the per-terrain ambient pools but frames
// them as the party deliberately taking stock, and stacks two sensory details for a
// richer beat than a passing movement line. A `nonce` lets the caller (e.g. a click
// counter) vary repeated looks at the same tile; with the default nonce it stays
// deterministic per (worldSeed, coords) like the movement composer.
const LOOK_OPENERS = [
  'The party pauses to take in their surroundings.',
  'You stop and look around, letting your eyes settle on the place.',
  'The party halts a moment, taking stock of the land about them.',
  'You take a slow look around, marking what stands out.',
  'The party stands still and lets the place reveal itself.'
];

export const composeLocalAmbientNarrative = ({
  tile,
  coords = {},
  worldSeed = null,
  worldMap = null,
  settings = {}, // eslint-disable-line no-unused-vars
  nonce = 0
} = {}) => {
  if (!tile) return '';
  const x = coords.x != null ? coords.x : tile.x;
  const y = coords.y != null ? coords.y : tile.y;
  const rng = mulberry32(hashSeed([worldSeed == null ? 'noseed' : worldSeed, x, y, 'look', nonce]));

  const key = resolveTerrainKey(tile);
  const pool = poolFor(key);

  const opener = LOOK_OPENERS[Math.floor(rng() * LOOK_OPENERS.length)];

  // Two distinct sensory details (avoid an immediate duplicate) for a fuller look.
  const a1 = pool.ambient[Math.floor(rng() * pool.ambient.length)];
  let a2 = pool.ambient[Math.floor(rng() * pool.ambient.length)];
  if (a2 === a1 && pool.ambient.length > 1) {
    a2 = pool.ambient[(pool.ambient.indexOf(a1) + 1) % pool.ambient.length];
  }

  const neighbourClause = buildNeighbourClause({ x, y }, worldMap, rng);

  const tail = [a1];
  if (a2 && a2 !== a1) tail.push(a2);

  const sentences = [opener, `*${tail.join(' ')}*`];
  if (neighbourClause) sentences.push(neighbourClause);

  return sentences.join(' ');
};

// Exported for unit testing of the deterministic core.
export const __test__ = { hashSeed, mulberry32, resolveTerrainKey };
