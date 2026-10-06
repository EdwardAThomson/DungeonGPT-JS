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
      'Gentle plains open out, the horizon a long pale line under an enormous sky.',
      'Tall grass whispers around the party as they step out onto the open flatlands.',
      'A lark bursts up singing as the party wades out into the open flatland.',
      'Behind the last of the cover, grassland spreads to every edge of sight.',
      'Open grass, and a long way to go before the next shade.',
      'Behind the last hedge the fields open out, wide as a sea and nearly as empty.',
      'Grassland. Wind. A sky that takes up most of what there is to see.',
      'Road becomes cart-track, cart-track becomes nothing, and the party walks on through knee-high grass.',
      'A rise, then another, and beyond them the plain runs out flat to a far blue line of hills.',
      'Sheep have grazed this grass short, and a broken hurdle says the flock passed through not long ago.',
      'Out from under cover, the light comes down hard and the wind has room to push.',
      'Open country, where the only landmarks are a stone and a dead tree, and both are far away.',
      'Somewhere a dog barks at nothing. The fields go on.',
      'Grass bends in long waves ahead of the party, each gust running the whole width of the plain before it dies.',
      'A plough has been here, once; the old furrows still ridge the turf underfoot.',
      'The party steps out onto the flat, and the horizon swings wide around them.',
      'Wide skies, a cold wind, and grass to the edge of sight.',
      'The land levels and empties, and the party\'s shadows stretch out long across the stubble.'
    ],
    revisit: [
      'Grassland again, spreading around the party, the wind never quite still.',
      'The party moves on across more open fields, the grass tugging at their boots.',
      'More rolling plains, the same restless grass bending in the breeze.',
      'Open country goes on, one field much like the last under the wide sky.',
      'On through the grass the party tramps, the horizon no nearer than before.',
      'Grass parts and closes behind the party, mile after unhurried mile.',
      'More of the same open ground.',
      'The grass goes on, and the party goes on through it.',
      'Field after field, hedge after hedge, and the wind at the party\'s back the whole way.',
      'Same plain, a little further along; a stone they passed earlier is behind them now.',
      'Open country again. The wind has not dropped.',
      'Lower ground is softer and the walking easier, so the party keeps to it.',
      'Nothing changes but the angle of the light.',
      'Another long mile of grass, and the hills no closer than they were this morning.',
      'Their track peters out, and the party takes a line across the open.',
      'Grassland, as before, though the ground is wetter here and the boots say so.',
      'Country the party knows by now; it has walked this kind of ground all day.',
      'Long grass, a straight course, and little to say about either.',
      'The plain rolls on under them, patient as ever.',
      'One field much like the last, and the next will be much like this.'
    ],
    ambient: [
      'A hawk wheels somewhere high overhead.',
      'Insects drone in the warm, swaying grass.',
      'The wind carries the dry, green smell of summer hay.',
      'Cloud shadows drift slowly across the open ground.',
      'A lone tree stands far off, bent by years of one-way wind.',
      'Grasshoppers spring away from the party in little clattering arcs.',
      'A hare starts up and is gone before anyone can point.',
      'The grass smells of sun and dust.',
      'Larks, somewhere high, out of sight.',
      'A kestrel hangs over the field, dead still against the wind.',
      'Far off, a line of smoke marks a hearth or a charcoal burner.',
      'The wind drops for a moment and the whole plain goes quiet.',
      'Thistle-down drifts past at head height.',
      'Cattle have been through: the ground is pocked and the flies know it.',
      'A cloud shadow races the party across the grass and wins.',
      'Bees work the clover in the lee of a bank.',
      'Dew has not yet burned off the shaded side of the tussocks.',
      'A crow walks the furrow ahead, unhurried, keeping its distance.',
      'The grass hisses.',
      'Somewhere a church bell, too far to count the strokes.'
    ]
  },
  desert: {
    arrival: [
      'The party trudges out onto cracked, sun-baked sand where heat shimmers off every dune.',
      'A sea of windswept dunes opens ahead, the sun hammering down without mercy.',
      'Scorching sand underfoot, and a dry wind throwing grit against the party.',
      'Endless desert stretches before the party, pale and merciless under a white sun.',
      'Heat rolls up off the sand in waves as the party steps out into the open waste.',
      'Past the last scrub there is only bare dune, and the sun bears down like a weight.'
    ],
    revisit: [
      'More burning sand, the dunes blurring together in the haze.',
      'The party pushes on across the parched desert, throats already dry.',
      'Another stretch of shadeless sand, the heat pressing down like a hand.',
      'Dunes roll on without end, every crest the same as the last.',
      'Deeper into the waste, sand grinding in every seam.',
      'Overhead the sun wheels, and still the sand runs on to the horizon.'
    ],
    ambient: [
      'Sand hisses across the dunes on a hot, gritty wind.',
      'The air ripples with heat, distorting the horizon.',
      'Nothing moves but the slow march of the dunes.',
      'A vulture turns lazily in the blinding sky.',
      'Bleached bones jut from a dune, half-scoured by the wind.',
      'The wind dies, and the silence of the waste presses close.'
    ]
  },
  snow: {
    arrival: [
      'The party crunches out onto a frozen waste where snow swallows every sound.',
      'A bitter wind cuts across an unbroken field of white as the party presses on.',
      'Snow lies deep and silent here, the cold biting at every exposed inch of skin.',
      'Ice and drifting snow now, breath clouding in the frigid air.',
      'Knee-deep drifts, each step a small cold labour.',
      'A pale glare of snow opens ahead, so bright it aches to look at.'
    ],
    revisit: [
      'More frozen ground, the snow squeaking underfoot.',
      'The party trudges on through the cold, fingers numb in the wind.',
      'Another white expanse, the chill working deeper into their bones.',
      'Snow stretches on, every drift the twin of the last.',
      'Deeper into the cold, breath freezing on their scarves.',
      'White on and on, and the cold never once relents.'
    ],
    ambient: [
      'Fine snow sifts down from a low grey sky.',
      'The cold is so complete it seems to hum in the silence.',
      'Wind moans across the drifts and dies away.',
      'Frost glitters where a thin sun breaks through.',
      'A single line of animal tracks crosses the snow and vanishes.',
      'Ice cracks somewhere with a sound like a snapped branch.'
    ]
  },
  water: {
    arrival: [
      'The party halts at the water\'s edge, dark waves lapping cold against the shore.',
      'Open water spreads ahead, restless and grey to the far horizon.',
      'Solid ground gives way to a broad expanse of water, its surface broken by slow swells.',
      'A wide stretch of water bars the way, gulls crying somewhere out over the swell.',
      'Land runs out at a cold grey shore, and the water stretches beyond sight.',
      'Wind comes off the open water in gusts, carrying the smell of deep cold.'
    ],
    revisit: [
      'The water laps at the shore again, cold and patient.',
      'Along the water\'s edge once more, spray on the wind.',
      'Waves roll in as before, hissing back over wet stones.',
      'Same grey swell, heaving and settling along the shore.'
    ],
    ambient: [
      'Salt spray drifts on the breeze.',
      'Waves break and draw back in a slow, endless rhythm.',
      'Sunlight scatters in bright shards across the water.',
      'Somewhere a gull calls and is answered.',
      'A dark shape rolls once beneath the surface and is gone.',
      'The water heaves in a long slow swell that never quite breaks.'
    ]
  },
  beach: {
    arrival: [
      'The party steps out onto pale sand where the tide draws long lines along the shore.',
      'A ribbon of sandy beach opens up, the surf hissing in and out a few paces away.',
      'Soft sand shifts underfoot as the party reaches the open shoreline.',
      'Shore stretches away in both directions, strewn with weed and bleached driftwood.',
      'Down onto a wide beach, where the sand is packed hard and wet by the tide.',
      'Waves fold onto the sand ahead, leaving a bright lace of foam behind.',
      'Sand. The sea. Gulls, loud about something.',
      'Ground softens underfoot, and the party comes down onto the strand, where the tide has left its wrack in a long dark line.',
      'Ahead the sea opens out, grey-green and restless, and the wind off it has salt in it.',
      'Dune grass gives way to packed wet sand, and the surf\'s noise comes up to meet the party.',
      'A beach, broad and empty, curving away under the cliff.',
      'The party walks out onto the shore, boots sinking, the sound of the waves filling everything.',
      'Shingle first, rattling underfoot, then sand that firms as it nears the water.',
      'The land stops. Beyond it there is only the sea and the sky, and the line where they meet.',
      'Low water: a great flat of wet sand shines out toward the waves, and the party crosses onto it.',
      'Tide in, so the party keeps to the dry sand above the reach of the surf.',
      'Salt on the wind, sand in the boots, and the sea the colour of slate.',
      'Seaweed and driftwood mark the high-water line; past it, the sand is smooth as a tabletop.',
      'Sound first, then the smell, and then the party is on the beach itself.',
      'Down off the dunes onto hard-packed sand that rings faintly underfoot.'
    ],
    revisit: [
      'More sand and surf, the tide tracing the same old lines.',
      'The party walks on along the beach, footprints filling with seawater.',
      'Another stretch of shoreline, gulls scattering ahead of them.',
      'Shore curving on, the surf keeping its slow steady time.',
      'More sand, more surf.',
      'Ahead the shore bends away, and the party bends with it.',
      'The tide has crept up since they passed this way, and the beach is the narrower for it.',
      'Sand again. The gulls have followed them.',
      'Between the wrack-line and the water is a firm strip, and the party walks it.',
      'Another stretch of shore, the cliff on one hand and the sea on the other.',
      'Nothing on the sand but the party\'s own tracks and the birds\'.',
      'Tide on the turn; the wet sand is wider than it was.',
      'The beach runs on as it did, grey and open under the wind.',
      'Easiest walking is at the water\'s edge, so that is where the party goes.',
      'Surf, sand, wind. The party has had an hour of each.',
      'Same shore, same gulls complaining about it.',
      'A long beach, and the party is a long way down it.',
      'Paler sand here, and the waves come in smaller.'
    ],
    ambient: [
      'The surf hisses up the sand and slides back.',
      'A briny wind tugs at hair and cloaks.',
      'Tiny crabs scuttle for cover among the weed.',
      'Driftwood lies half-buried where the tide left it.',
      'A broken shell gleams wet where the last wave withdrew.',
      'Seabirds pick along the tide-line, quick and wary.',
      'A gull drops a shell on the rocks and goes down after it.',
      'The wind flattens the dune grass in sudden silver stripes.',
      'Foam races up the sand and sinks away into nothing.',
      'A rotten hull lies half-buried above the tide-line, ribs showing.',
      'Sandpipers run ahead of the surf and back again, never once wet.',
      'Salt crusts the party\'s lips.',
      'The sea heaves and settles, heaves and settles.',
      'A cold wind comes straight off the water.',
      'Far out, a sail; nearer in, nothing.',
      'Wet sand holds every footprint for a few paces, then gives it back to the sea.',
      'Something dead and large has washed up further along; the birds have found it.',
      'Spray hangs in the air and the light comes through it broken.',
      'Weed pops underfoot.',
      'The tide is talking to the shingle, a long slow rattle on every wave.'
    ]
  },
  woodland: {
    arrival: [
      'The party passes beneath a canopy of crowding trees, the light going green and dim.',
      'Dense woodland closes in around the party, the air cool and heavy with leaf-mould.',
      'Trees rise tall on every side as the party threads into the forest shade.',
      'Thick woods swallow the path, branches knitting overhead.',
      'Ducking under low boughs, the party enters a wood where the daylight comes apart into green.',
      'Trees close ranks around the party, and the noise of the open land falls away.',
      'Trees. Then more trees, and the light goes green.',
      'Under the first boughs the wind drops away as if a door had shut.',
      'The wood closes over the track and the party goes in under it, single file.',
      'Oak and ash stand close here, and the ground between them is deep in last year\'s leaves.',
      'Daylight falls apart into patches, and the party picks its way from one to the next.',
      'In among the trees the air is cool and still and smells of rot and growing things.',
      'Woodland, thick and old, with no path through it that anyone can see.',
      'Into the trees, and the noise of the open country stops at the edge behind them.',
      'Hazel and bramble crowd the way in, and the party pushes through with sleeves over faces.',
      'Under the canopy the ground is soft and gives no sound back.',
      'Trees take the party in; the sky becomes a thing glimpsed between branches.',
      'Dark trunks, a green roof, and roots everywhere underfoot.',
      'Trunks stand so close that the party must turn sideways between some of them.',
      'The track dives into the wood and the party goes with it, down into shade.'
    ],
    revisit: [
      'More close-grown trees, the same hush settling over the party.',
      'The party moves deeper among the trunks, twigs snapping underfoot.',
      'Woodland shadow folds around them again.',
      'Trees crowd on, the green gloom unbroken ahead.',
      'Further into the woods, roots catching at their boots.',
      'Another stand of close timber, the light no stronger than before.',
      'More trees.',
      'The wood goes on, trunk after trunk, in the same green dusk.',
      'However far the party pushes in, the trees do not thin.',
      'Another stretch of woodland, close and quiet.',
      'Same trees, or ones just like them, on every side.',
      'A deer-track, and the party follows it, since it may lead somewhere.',
      'Overhead the canopy thins for a moment and closes again.',
      'Roots, leaf-mould, and the shade that never lifts.',
      'The wood has not changed; the party has only gone further into it.',
      'Still under the trees. Still no sky to speak of.',
      'On through timber, the way ahead as dim as the way behind.',
      'Same gloom, same hush.',
      'Trees thin, then thicken again, as though they had been thinking about it.',
      'Deeper in. The light is no better for it.'
    ],
    ambient: [
      'Birdsong filters down through the leaves.',
      'Something small rustles away through the undergrowth.',
      'Shafts of light fall through the canopy in dusty bars.',
      'The damp smell of bark and rotting leaves hangs in the air.',
      'A branch creaks overhead, though there is barely a breeze.',
      'Mushrooms cluster pale on a fallen, moss-furred log.',
      'A woodpecker, somewhere close, and then not.',
      'Leaves drip, though it has not rained.',
      'Something heavy moves off through the undergrowth and does not come back.',
      'A shaft of sun finds a patch of moss and makes it blaze.',
      'The smell of fungus and wet bark.',
      'Jays scold the party from tree to tree.',
      'An old charcoal hearth, long cold, lies off to one side of the track.',
      'Spider silk catches on faces and will not brush off.',
      'A fallen trunk, furred green, bars the way and must be climbed.',
      'Nothing moves. Then a leaf falls, and nothing moves again.',
      'The light goes from green to grey as the canopy thickens.',
      'Pigeons clatter up out of the branches overhead.',
      'Deer slots in the soft ground, fresh.',
      'Somewhere ahead, an axe. Then silence.'
    ]
  },
  swamp: {
    arrival: [
      'The party wades into a sodden marsh where every step sucks at their boots.',
      'Stagnant water and reeking mud spread out beneath a tangle of dead trees.',
      'Bog now, mist curling low over black, still water.',
      'A fetid swamp opens before the party, alive with the drone of insects.',
      'Firm ground fails, and the party sinks ankle-deep into cold black mud.',
      'A reek of rot rolls up as the party pushes into the standing water and reeds.'
    ],
    revisit: [
      'More black water and clinging mud, the stench no kinder than before.',
      'The party slogs on through the mire, midges thick around their heads.',
      'Another stretch of bog, the reeds whispering wetly.',
      'Mire still, every step won back from the sucking mud.'
    ],
    ambient: [
      'Bubbles rise and burst in the dark water.',
      'Clouds of midges hang in the heavy air.',
      'Something unseen slips beneath the surface.',
      'A low mist drifts between the dead trees.',
      'A frog stops mid-croak, and the silence leans in.',
      'Pale gas glimmers for a moment over the still water.'
    ]
  },
  mountain: {
    arrival: [
      'The party climbs onto bare, rocky ground where stone teeth claw at the sky.',
      'Steep slopes of broken rock rise around the party as the air grows thin and cold.',
      'A hard scramble over scree now, peaks looming grey above.',
      'Jagged mountains hem the party in, the wind keening between the crags.',
      'Steepening to a ladder of rock, the trail has the party climbing with hands as much as feet.',
      'Grey peaks close overhead, and the air turns thin and knife-sharp with cold.'
    ],
    revisit: [
      'More loose rock and steep ground, the climb no gentler than before.',
      'The party picks its way on across the stony heights.',
      'Crags again on every side, cold wind pouring down the slopes.',
      'Broken rock goes on, the path picking endlessly up and over.',
      'Higher, scree shifting away beneath their boots.',
      'Another ridge, another cold saddle of stone to cross.'
    ],
    ambient: [
      'Loose stones clatter away down the slope.',
      'The thin wind whistles between the rocks.',
      'An eagle drifts on the updrafts far above.',
      'Snow clings in the high shaded clefts.',
      'A distant rockfall rumbles and fades among the peaks.',
      'The party\'s breath comes short in the thin, cold air.'
    ]
  },
  hills: {
    arrival: [
      'The party climbs into rolling hill country, the land rising and falling in long green waves.',
      'Low hills spread out ahead, their crests catching the light and their hollows in shade.',
      'Grassy hills swell up and hide the horizon at every rise.',
      'One hill crested, and another rolls away beyond it.',
      'Up bends the path into a country of green humps and shadowed dells.',
      'Toiling up onto a broad ridge, the party sees the land unfold in slow swells below.'
    ],
    revisit: [
      'More rolling hills, the climbs and descents blurring together.',
      'The party tops another rise and starts down the far side.',
      'Green slopes rise and fall around them as before.',
      'Hills go on, each crest hiding another fold of land beyond.',
      'Yet another slope, legs aching from the last.',
      'Up and down the party goes, the hills passing them from one to the next.'
    ],
    ambient: [
      'Wind combs through the long hilltop grass.',
      'Sheep tracks wind away over the nearest crest.',
      'A skylark sings, unseen, somewhere above.',
      'Cloud shadow slides over the folded land.',
      'A tumbled drystone wall runs off along a distant ridge.',
      'The bleat of sheep drifts up from a hidden hollow.'
    ]
  },
  ruins: {
    arrival: [
      'The party comes upon crumbling ruins, broken walls jutting from the earth like old bones.',
      'Toppled columns and shattered stone mark some long-dead place the party now enters.',
      'Ancient ruins sprawl ahead, half-swallowed by creeping vine and drifted soil.',
      'Fallen archways and weathered carvings worn past reading, and the party steps among them.',
      'Roofless halls open around the party, the sky showing through where beams once ran.',
      'Between leaning walls, every stone furred with lichen and age.'
    ],
    revisit: [
      'Ruins again, silent and patient in their decay.',
      'The party picks back through the broken stones they passed before.',
      'More tumbled walls, the same heavy stillness hanging over them.',
      'Old stones, standing as they left them, indifferent and grey.'
    ],
    ambient: [
      'Wind sighs through empty window-holes.',
      'Lizards bask and dart along the warm fallen stone.',
      'Faded carvings hint at some forgotten purpose.',
      'Dust lies thick in the shadow of the old walls.',
      'A fallen keystone lies where it dropped a hundred years ago.',
      'Ivy has pried a doorway apart, stone by patient stone.'
    ]
  },
  cave: {
    arrival: [
      'The party reaches a dark cave mouth that breathes cold, damp air into the daylight.',
      'A jagged opening yawns in the rock ahead, swallowing all light a few paces in.',
      'A cave entrance, its throat black and silent before the party.',
      'A low, dark cavern mouth gapes in the hillside as the party draws near.',
      'Ahead the rock splits open into a black slot the daylight cannot follow.',
      'The party halts at a cave mouth, cold and dark, that seems to swallow sound as well as light.'
    ],
    revisit: [
      'The cave mouth waits as before, dark and exhaling cold.',
      'Back to the black opening in the rock.',
      'Same damp breath of the cave, meeting them again.',
      'Dark entrance gaping as it did before, patient and cold.'
    ],
    ambient: [
      'Water drips somewhere deep in the dark.',
      'Cold, stale air seeps out of the opening.',
      'The sounds of the world seem to stop at the cave mouth.',
      'Pale roots dangle over the dark entrance.',
      'An echo answers from somewhere far back in the black.',
      'The stone underfoot is slick and cold with old damp.'
    ]
  }
};

const fallbackPool = TEMPLATES.plains;
const poolFor = (key) => TEMPLATES[key] || fallbackPool;

// How many recently-shown lines the callers keep in the avoid-window. One move
// records up to three lines (opening, ambient, landmark), so this is about ten
// moves of history: enough that a six-line ambient pool cycles fully before any
// line comes back.
export const RECENT_WINDOW = 30;

// Pick a line from `set`, starting at the rng-chosen index and skipping any line
// in `recent` (the recently-shown lines) so movement prose doesn't repeat back to
// back or too soon. With an empty `recent` this is exactly the old
// `set[floor(rng()*len)]`, so determinism per (worldSeed, coords) is preserved.
// When the whole pool is in the window, the least recently shown line wins (it
// used to fall back to the rng pick, which could be the line shown last move).
// `avoidFirstWord` is the first word of the previous paragraph's opening: a fresh
// candidate that starts with the same word is passed over when another fresh one
// exists, so consecutive paragraphs don't all open "The ...".
const firstWord = (line) => (typeof line === 'string' ? line.replace(/^[*_]+/, '').split(/\s+/)[0] : '');

const pickLine = (set, rng, recent = [], avoidFirstWord = '') => {
  if (!set || !set.length) return undefined;
  const start = Math.floor(rng() * set.length);
  if (!recent.length && !avoidFirstWord) return set[start];
  let sameOpener;
  for (let n = 0; n < set.length; n++) {
    const cand = set[(start + n) % set.length];
    if (recent.includes(cand)) continue;
    if (avoidFirstWord && firstWord(cand) === avoidFirstWord) {
      if (sameOpener === undefined) sameOpener = cand;
      continue;
    }
    return cand;
  }
  if (sameOpener !== undefined) return sameOpener;
  let oldest = set[start];
  let oldestAt = Infinity;
  for (const cand of set) {
    const at = recent.lastIndexOf(cand);
    if (at < oldestAt) { oldestAt = at; oldest = cand; }
  }
  return oldest;
};

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

// A few phrasings per landmark. The first is the plain one and is always tried
// first, so a tile's landmark line is unchanged until it has just been shown;
// walking along a coast then rotates through the others instead of printing the
// same shoreline sentence on every move, and once all have been shown recently
// the clause is dropped for that move (the landmark hasn't changed; saying so
// again adds nothing).
const NEIGHBOUR_PHRASES = {
  namedTown: (n, t) => [`the rooftops of **${t}** rise to the ${n}`, `smoke from **${t}** drifts up to the ${n}`, `**${t}** lies to the ${n}`],
  town: (n) => [`a settlement sits to the ${n}`, `roofs cluster together to the ${n}`],
  mountain: (n) => [`mountains rise to the ${n}`, `grey peaks stand to the ${n}`, `the ground climbs toward mountains to the ${n}`],
  hills: (n) => [`low hills roll away to the ${n}`, `the land swells into hills to the ${n}`, `hills hump the skyline to the ${n}`],
  forest: (n) => [`dark woods crowd the ${n}`, `a wall of trees stands to the ${n}`, `the treeline darkens the ${n}`],
  ruins: (n) => [`broken ruins lie to the ${n}`, `old stones jut from the ground to the ${n}`, `the broken outline of a ruin shows to the ${n}`],
  cave: (n) => [`a cave mouth gapes to the ${n}`, `a black opening shows in the rock to the ${n}`, `the ground splits open into a cave to the ${n}`],
  water: (n) => [`water glints to the ${n}`, `open water lies to the ${n}`, `the light changes over water to the ${n}`],
  beach: (n) => [`a pale shoreline runs to the ${n}`, `the land ends in sand to the ${n}`, `surf sounds faintly from the ${n}`],
  desert: (n) => [`dunes roll away to the ${n}`, `the sand rises in dunes to the ${n}`, `heat shimmers over dunes to the ${n}`],
  swamp: (n) => [`the bog stretches to the ${n}`, `reeds and standing water lie to the ${n}`, `mist hangs over the marsh to the ${n}`]
};

const neighbourPhrases = (tile, name) => {
  if (!tile) return null;
  if (tile.poi === 'town' && tile.townName) return NEIGHBOUR_PHRASES.namedTown(name, tile.townName);
  if (tile.poi === 'town') return NEIGHBOUR_PHRASES.town(name);
  if (tile.poi === 'cave' || tile.poi === 'cave_entrance') return NEIGHBOUR_PHRASES.cave(name);
  if (NEIGHBOUR_PHRASES[tile.poi]) return NEIGHBOUR_PHRASES[tile.poi](name);
  if (NEIGHBOUR_PHRASES[tile.biome] && tile.biome !== 'mountain' && tile.biome !== 'forest') return NEIGHBOUR_PHRASES[tile.biome](name);
  return null;
};

const buildNeighbourClause = (coords, worldMap, rng, recent = []) => {
  if (!worldMap || !worldMap.length || !coords) return null;
  const { x, y } = coords;
  const found = [];
  for (const { dx, dy, name } of DIRS) {
    const ny = y + dy;
    const nx = x + dx;
    if (ny >= 0 && ny < worldMap.length && worldMap[ny] && nx >= 0 && nx < worldMap[ny].length) {
      const phrases = neighbourPhrases(worldMap[ny][nx], name);
      if (phrases) found.push(phrases);
    }
  }
  if (found.length === 0) return null;
  const phrases = found[Math.floor(rng() * found.length)];
  const fresh = phrases.find((p) => !recent.includes(p));
  if (!fresh) return null; // every phrasing shown lately: skip the clause this move
  recent.push(fresh);
  return fresh.charAt(0).toUpperCase() + fresh.slice(1) + '.';
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
 * @param {string[]} [args.recent] - Recently-shown lines to avoid (anti-repetition). The
 *   composer skips these when picking, then appends the lines it used. Callers pass a
 *   mutable, trimmed rolling window; with the default (empty) it stays deterministic.
 * @returns {string} Markdown prose (uses *italics* / **bold**, never _underscores_).
 */
export const composeLocalMovementNarrative = ({
  tile,
  coords = {},
  worldSeed = null,
  worldMap = null,
  settings = {}, // eslint-disable-line no-unused-vars
  selectedHeroes = [],
  isNewArea = true,
  recent = []
} = {}) => {
  if (!tile) return '';
  const x = coords.x != null ? coords.x : tile.x;
  const y = coords.y != null ? coords.y : tile.y;
  const rng = mulberry32(hashSeed([worldSeed == null ? 'noseed' : worldSeed, x, y]));

  const key = resolveTerrainKey(tile);
  const pool = poolFor(key);

  // The previous paragraph's opening is the last line recorded (openings are
  // pushed after the ambient/landmark lines), so its first word is what to avoid.
  const prevOpener = firstWord(recent[recent.length - 1]);

  // Town tiles get a dedicated opening that names the settlement.
  let opening;
  if (tile.poi === 'town' && tile.townName) {
    const size = tile.townSize || 'settlement';
    const townOpenings = [
      `The party arrives at the edge of **${tile.townName}**, a ${size} of timber and stone.`,
      `A road brings the party to **${tile.townName}**, a ${size} stirring with life.`,
      `**${tile.townName}** opens up ahead, a ${size} where smoke rises from clustered roofs.`,
      `**${tile.townName}** at last, a ${size} hard against the open country.`
    ];
    const revisitOpenings = [
      `Back at the edge of **${tile.townName}**, its streets known now.`,
      `**${tile.townName}** comes into view again, a known face in the wilds.`
    ];
    const set = isNewArea ? townOpenings : revisitOpenings;
    opening = pickLine(set, rng, recent, prevOpener);
  } else {
    const set = isNewArea ? pool.arrival : pool.revisit;
    opening = pickLine(set, rng, recent, prevOpener);
  }

  const ambient = pickLine(pool.ambient, rng, recent);
  const neighbourClause = buildNeighbourClause({ x, y }, worldMap, rng, recent);
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

  // Record the picked ambient + opening so the next few moves avoid them, opening
  // last so the next composer can read the paragraph's first word off the tail.
  // Harmless when `recent` is the default throwaway array (keeps the pure path).
  if (ambient) recent.push(ambient);
  if (opening) recent.push(opening);

  return sentences.join(' ');
};

// --- Ambient "look around" composer ---------------------------------------------
// On-demand observation of the CURRENT tile, used by the Look-around button for the
// no-AI (guest / master-off) path. Reuses the per-terrain ambient pools but frames
// them as the party deliberately taking stock, and stacks two sensory details for a
// richer beat than a passing movement line. A `nonce` lets the caller (e.g. a click
// counter) vary repeated looks at the same tile; with the default nonce it stays
// deterministic per (worldSeed, coords) like the movement composer. `recent` is
// the same avoid-window the movement composer uses, so a look never repeats the
// detail the last move just gave (it used to draw from the pool blind).
const LOOK_OPENERS = [
  'The party pauses to take in their surroundings.',
  'You stop and look around, letting your eyes settle on the place.',
  'Halting a moment, the party takes stock of the land about them.',
  'You take a slow look around, marking what stands out.',
  'Standing still, the party lets the place reveal itself.'
];

export const composeLocalAmbientNarrative = ({
  tile,
  coords = {},
  worldSeed = null,
  worldMap = null,
  settings = {}, // eslint-disable-line no-unused-vars
  nonce = 0,
  recent = []
} = {}) => {
  if (!tile) return '';
  const x = coords.x != null ? coords.x : tile.x;
  const y = coords.y != null ? coords.y : tile.y;
  const rng = mulberry32(hashSeed([worldSeed == null ? 'noseed' : worldSeed, x, y, 'look', nonce]));

  const key = resolveTerrainKey(tile);
  const pool = poolFor(key);

  const opener = pickLine(LOOK_OPENERS, rng, recent, firstWord(recent[recent.length - 1]));

  // Two distinct sensory details (avoid an immediate duplicate) for a fuller look.
  const a1 = pickLine(pool.ambient, rng, recent);
  let a2 = pickLine(pool.ambient, rng, [...recent, a1]);
  if (a2 === a1 && pool.ambient.length > 1) {
    a2 = pool.ambient[(pool.ambient.indexOf(a1) + 1) % pool.ambient.length];
  }

  const neighbourClause = buildNeighbourClause({ x, y }, worldMap, rng, recent);

  const tail = [a1];
  if (a2 && a2 !== a1) tail.push(a2);

  const sentences = [opener, `*${tail.join(' ')}*`];
  if (neighbourClause) sentences.push(neighbourClause);

  recent.push(...tail);
  if (opener) recent.push(opener);

  return sentences.join(' ');
};

// --- NPC meeting composer ---------------------------------------------------------
// Local, templated beat for talking to a milestone NPC (the building "Talk" button)
// on the no-AI (guest) path, so the click isn't mute. Deterministic per
// (worldSeed, npc name) like the other composers; markdown-friendly (*italics* /
// **bold** only, matching introComposer/SafeMarkdownMessage conventions).
const NPC_MEETING_OPENERS = [
  '{who} looks up as the party enters {where} and beckons them closer.',
  'The party finds {who} within {where}, already sizing them up.',
  '{who} sets aside their work as the party steps into {where}.',
  'Inside {where}, {who} greets the party with a curt nod.'
];

const NPC_MEETING_CLOSERS = [
  'Introductions made, the party lays out what brings them here, and is heard out in full.',
  'The party states their business plainly, and it is taken in with a measuring look.',
  'What the party has come to say is listened to, word for word.'
];

export const composeNpcMeeting = ({
  name,
  role = null,
  building = null,
  townName = null,
  personality = null,
  worldSeed = null,
  // Authored scene for this meeting (story template meetingText); replaces the
  // generic closer so the beat says something specific.
  meetingText = null
} = {}) => {
  if (!name) return '';
  const rng = mulberry32(hashSeed([worldSeed == null ? 'noseed' : worldSeed, 'npc-meeting', name]));

  // The role is an appositive, so it closes with a comma too ("Ulric, the militia
  // captain, looks up"); every opener puts {who} mid-sentence.
  const who = role ? `**${name}**, the ${String(role).toLowerCase()},` : `**${name}**`;
  // "the Briarwood Militia Hall" (but never "the The Crooked Pint"); fall back to the
  // town name, then a generic hall, so the sentence always reads whole.
  const where = building
    ? (/^the\s/i.test(building) ? building : `the ${building}`)
    : (townName || 'the hall');

  const opener = NPC_MEETING_OPENERS[Math.floor(rng() * NPC_MEETING_OPENERS.length)]
    .replace('{who}', who)
    .replace('{where}', where);
  const closer = NPC_MEETING_CLOSERS[Math.floor(rng() * NPC_MEETING_CLOSERS.length)];

  const sentences = [opener.charAt(0).toUpperCase() + opener.slice(1)];
  if (personality) {
    const trait = personality.charAt(0).toUpperCase() + personality.slice(1);
    sentences.push(`*${trait}.*`);
  }
  sentences.push(meetingText || closer);

  return sentences.join(' ');
};

// Exported for unit testing of the deterministic core.
export const __test__ = { hashSeed, mulberry32, resolveTerrainKey };
