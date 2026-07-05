# Water Towns Plan: canal city + river city (#65)

Status: **design proposal, 2026-07-05. No code yet; design before code per #65.**
Related: `OUTSTANDING_ISSUES.md` #65 (this), #66 (hydrology fields, long-term successor to
the world-gen shim in §2), #60/`LARGER_WORLDS_PLAN.md` (ocean-side model, options-param
precedent), the tier ladder in `docs/private/` (water towns are listed under premium),
`FEATURE_FAST_TRAVEL.md` (boats; ferries defer there). CLAUDE.md map backwards-compatibility
rules are binding: town maps are cached in saves and never regenerated, so everything here
is going-forward-only, and renderers must tolerate maps that lack every new field.

Core stance: **both archetypes are water-typed variants of the existing hub-and-spoke
path system** (`townMapGenerator.js`, merged 2026-07-05, #62), not a new generator. The
foot network machinery (`placeGateRoad`, `connectBuildingToNetwork`, `routeWindyPath`,
`layPathRoute`, `pruneOrphanPaths`) is reused untouched; water lanes are carved first and
the existing router then works around and across them.

## 1. Product shape

Two archetypes, decided by the town's world tile (§2), generated once and cached like any
town:

- **Canal city (Venice).** City size ONLY. The sea floods one or two edges as today
  (`placeTownWater` coast), plus a small basin near the centre and 3-5 winding canals
  connecting basin to sea and threading the quarters. Foot lanes hug the canal banks
  (quays), cross on bridge tiles, and still form the one hub-rooted network the player
  walks today. Waterfront buildings (harbormaster, warehouses, new boathouse) line the
  water. Gondola/ferry rides are explicitly future flavor (boats, `FEATURE_FAST_TRAVEL.md`).
- **River city (Konigsberg).** Town AND city sizes. Instead of today's straight 2-wide
  band (`placeRiverInTown`), the river enters one edge, forks around one island district
  (two on cities when space allows), rejoins, and exits. Bridges knit the districts; the
  island is a distinctive quarter: on cities the cathedral quarter (temple + archives,
  the Kneiphof read), on towns the market isle. Everything else is the standard town.

Frequency (all seeded, deterministic per world): at most ONE canal city per world (it is
the flagship set piece); river city on roughly half of eligible river settlements
(seeded roll, §2). Free tier: neither generates (§6).

### 1b. Follow-on archetype notes (maintainer, 2026-07-05)

- **Fishing village (future, small-settlement water flavor).** The fork archetype
  is town+city by design (island districts need room and venues); the natural
  water shape for hamlets/villages is a FISHING VILLAGE: docks, a boathouse, and
  a quay lane along one bank of a lake, coast, or river. No fork, no island:
  it reuses the existing waterfront machinery (shore placement, quay-stub
  routing, dock-sand protection), so it is cheap (S). Tier suggestion: free or
  Members, the tease below the canal flagship. Not scheduled; add to phasing
  when picked up.
- **Jetty tiles for coastal towns (any size).** Dock structures currently reuse
  the `bridge` tile: close, but not quite the right feel (a bridge reads as a
  crossing, a jetty reads as a wooden finger over the water). Consider a
  dedicated jetty treatment: either a `jetty` tile type or a flag on bridge
  tiles that the art keys off (planks along the walk axis, mooring posts, open
  water end). View-layer-first approach preferred so existing docks re-skin
  retroactively; pairs naturally with the fishing village and Phase 4 canal art.

## 2. Eligibility & world integration

**Estuary definition:** the town's world tile has `analyzeTownWater(worldMap, x, y)`
returning `kind: 'coast'` AND the tile itself carries `hasRiver` (both fields exist
today: `src/utils/townWater.js:25-66`, `src/utils/pathfinding.js:297-341`).

**What world-gen already produces (evidence):**
- A coast always exists by default: `placeCoast` stamps one random edge
  (`mapGenerator.js:83-84`, `:762-765`).
- Rivers route 1-2 sources from mountains to the NEAREST water tile by Manhattan
  distance (`mapGenerator.js:1104-1120`), which is often a lake, so a river reaching the
  sea is luck, not law.
- When a river does reach the sea, the data model already records a true river mouth:
  the final beach tile gets `riverDirection: 'END_NORTH'|...` pointing at the water
  (`pathfinding.js:321-338`).
- Rivers are marked (step 5, `mapGenerator.js:141-143`) before towns are placed (step 6,
  `:152+`), and `isValidPlacement` only rejects POI/water tiles (`:685-691`), so a town
  CAN land on a river tile and inherit `hasRiver`. But `placeTown` is a blind random
  roll with no water affinity (`:329-350`), so an estuary town today is a coincidence.

**Decision: add a small, options-gated world-gen shim so estuaries exist on demand.**
Two additive behaviors on `generateMapData`'s existing `options` param (the #60
precedent; legacy calls stay byte-identical, protected by the existing fixture pins
`src/utils/__fixtures__/legacyMap_seed*.json`):
1. `options.riverToSea: true`: the first river targets the nearest NON-lake water tile,
   guaranteeing a river mouth on the coast band.
2. `options.estuaryTown: true`: after `generateRivers`, place the FIRST town on the
   nearest valid dry tile adjacent to the river mouth (reuse `isValidPlacement` +
   spacing), before the random `placeTown` loop fills the rest.

This shim is deliberately tiny; #66 (world hydrology fields) supersedes it when it
lands. Alternative rejected: always-on river-to-sea bias without the option flag (breaks
the byte-identical fixture pins and changes free worlds for no player-visible benefit).

**How a qualifying town DECIDES to be a water town:** stamped once at New Game
world-gen time, not rolled at lazy town gen. NewGame (where `spawnWorldMapEntities`
already runs) checks entitlement (§6) and, when allowed, stamps the world tile with an
additive field `waterTown: 'canal' | 'riverfork'`:
- estuary tile + size city (size pinned via the existing size-tagged `customNames`
  entry when template-driven) -> `'canal'`;
- other `hasRiver` towns/cities -> `'riverfork'` on a seeded ~50% roll.

`useGameMap.js` (the two `generateTownMap` call sites, `:274` and `:463`) reads the
stamp and passes it through as `water.archetype` on the existing water-context object
(additive; `generateTownMap`'s signature is unchanged). Rationale for stamping at New
Game: the save carries the decision, so entitlement is checked exactly once, lapsed
subscribers keep their existing water towns (same grandfathering as premium themes),
and lazy town gen stays pure. Alternative rejected: player picks water towns per-town
at New Game (too fiddly; the template/world decides, like biome themes).

## 3. Generation algorithm (deltas on the current generator)

Both archetypes run the standard `generateTownMap` pipeline with a water-lane step
inserted between the water carve and the road/building phases. **Order is the whole
trick:** water lanes are carved BEFORE gates/roads/buildings, so every existing
placement rule ("only build on grass", "walls stop at water", entry gates dodge wet
tiles via `jitterGatePosition`) works unmodified.

**Shared plumbing (one new tile field, no new tile type):**
- Channel/canal water tiles are `type: 'water'`, `walkable: false`, plus additive
  `waterway: true`. Renderer default: absent field = plain water (old maps unaffected).
- `routeWindyPath`'s `enterCost` gains one branch: water with `waterway` costs
  `WATERWAY_BRIDGE_COST` (5, same value as `RIVER_BRIDGE_COST`), exactly as the
  authored river band does via `inRiverBand` today. `layPathRoute` already converts
  water on a route to `'bridge'`, so foot routes cross canals on bridges automatically,
  and the per-wet-tile cost keeps crossings short and roughly perpendicular.
- Canal-bank pull: grass orthogonally adjacent to a `waterway` tile gets a discounted
  step cost (`CANAL_BANK_COST` ~0.8, sibling of `QUAY_BEACH_COST` 0.7), so foot spokes
  prefer running ALONGSIDE canals. That is the quay walk network: ordinary
  `stone_path`/`dirt_path` tiles that happen to hug water; rendering dresses them (§5).
- Water lanes are routed with the same windy Dijkstra (`routeWindyPath`) using
  water-typed costs: grass cheap, existing `waterway` heavily discounted (channels
  merge like path trunks via the `PATH_REUSE_COST` idea), buildings/walls/square
  Infinity, existing paths expensive-but-finite early (nothing exists yet at carve
  time, so this barely triggers). `pathStats` gains spoke kinds `'canal'`/`'channel'`
  for the debug page and tests.

**Canal city (`water.archetype === 'canal'`):**
1. Sea carve as today (`placeTownWater` coast + `sandShorePass`; `extendCoastWater`
   still carries the sea to the canvas edge in `padTownToUniform`).
2. Basin: a 2x2 water blob (`waterway: true`) placed 3-4 tiles off the town square on
   the seaward side, outside the square's dry core.
3. Canal spokes: one basin-to-sea channel (guaranteed), plus 2-4 channels from the
   basin to seeded interior waypoints, all 1 tile wide, routed windy. Total canal tiles
   are budgeted (see density below).
4. Everything else runs unchanged: gates (`jitterGatePosition` already dodges water),
   `placeGateRoad`, square, walls (already terminate at water), `placeBuildings` with
   `connectBuildingToNetwork` at placement time, `placeHouses` street-front,
   `connectHouses`, `pruneOrphanPaths`.
5. Waterfront roster: the existing STEP 1.7 shore placement gains `boathouse` (§7) next
   to a `waterway` tile where possible; the `noPave` dock-frontage protection applies
   to canal banks exactly as it does to beach.

**Density and the grass-supply guarantee (canal city):** canals eat buildable land, so
the canal city uses a dedicated `BUILDING_CONFIG` variant: houses 55 -> 42, secondary
roster drops `stables` and `mill` (both `SHORE_AVERSE`/peripheral; a lagoon city keeps
neither gracefully). The water budget is unified: `placeTownWater`'s existing reserve
(`buildingTileEstimate(townSize) * 1.8 + 9`) already caps sea water; basin + canal
tiles draw from the SAME budget (sea + basin + canals <= min(~25% of core, area -
reserve)), so the roster always fits. A new invariant test asserts >= 10 free grass
tiles remain post-generation (quest injection supply, §7). Grid stays 20x20
(`UNIFORM_TOWN_SIZE`); enlarging the canvas for one archetype was rejected: display and
save shape stay uniform, and the density variant is enough.

**River city (`water.archetype === 'riverfork'`):**
1. Replaces `placeRiverInTown` (kept verbatim for non-water towns) with a fork carve:
   main channel routed windy edge-to-edge (entry/exit edges from `riverDirection` as
   today, width 2 on cities, 1-2 on towns), branch channel diverging at ~1/3, displaced
   3-5 tiles perpendicular, rejoining at ~2/3. Enclosed land = the island district.
   All fork tiles get `waterway: true` (the band test `inRiverBand` cannot describe a
   fork, hence the flag).
2. Island venue bias: after the carve, the island's tiles are computed (flood fill);
   `placeBuildings` places temple + archives there on cities (market on towns) by
   restricting those types' candidate rings to island tiles first, normal fallback
   after. Minimal delta: two types get a preferred zone, nothing else changes.
3. Bridge guarantee: routing usually yields 2+ crossings (the island venue's spoke plus
   any gate road that crosses). A post-pass counts distinct bridge groups linking the
   island; if < 2, one extra hub-to-island foot route is laid with slightly discounted
   waterway cost. Two bridges is the Konigsberg minimum for the district to read as
   knitted, and it de-risks a single chokepoint bridge.
4. Density: standard rosters; a fork costs ~2x the old river band's tiles, which the
   town/city sizes absorb without a variant config. The same >= 10 free grass floor is
   asserted, plus >= 4 free grass tiles ON the island (quest injection can target it).

**The walkability invariant (#62) holds by construction.** Exactly as today: one
connected path component containing the hub, every gate, and every building frontage;
zero orphans. Nothing about the foot machinery changes: buildings still connect at
placement time (`connectBuildingToNetwork`), houses still come after routing, the
causeway fallback (`CAUSEWAY_WATER_COST`) still exists, and `pruneOrphanPaths` still
sweeps last. Canals only ADD finite-cost crossings (they are strictly easier for the
router than the impassable lake/coast water it already handles). The existing
seed-survey invariant tests in `townMapGenerator.test.js` are extended with canal-city
and river-city presets so this is asserted, not assumed.

## 4. Movement & mechanics

- **Canals are not walkable.** They are `walkable: false` water; the existing
  walkable-flag check in `TownMapDisplay` (`:97`) blocks them with zero code changes.
- **Bridges are the existing `'bridge'` tile** (walkable, already rendered by
  `townTileArt`, already in `mapLegend.js:71`). No new crossing mechanic.
- **New tile types: none. New fields: two, both additive and renderer-tolerant.**
  `tile.waterway` on town water (absent = plain water) and `worldTile.waterTown` on the
  world map (absent = normal town). Old saves never contain either and render
  identically.
- **Pathfinding/NPCs:** town NPCs are stationed in buildings by `populateTown`
  (no wandering pathfinding), and click-to-move is adjacent-range walkable clicks, so
  nothing needs teaching. Bridges just make some walks longer, which is the point.
- Ferry/gondola travel across the basin: deferred to `FEATURE_FAST_TRAVEL.md` boats.

## 5. Art (`townTileArt.js`)

Pure view layer, retroactive and safe per house rules:
- **Reuse:** `water(seed)`, `beach(seed)`, `bridge()` (`townTileArt.js:579-581`) cover
  sea, shore, and crossings as-is. Ship the first debug cut with zero art changes.
- **Add (small):** a calmer canal-water variant keyed off `tile.waterway` (narrower
  wave strokes, slightly darker), so canals read distinct from open sea. Falls back to
  plain water when the field is absent.
- **Add (medium, maintainer 2026-07-05): directional canal shapes.** A canal tile must
  read as a CHANNEL, not a pond: stone banks along straight runs (N-S and E-W), bends
  at corners, openings at T-junctions where a spoke branches, a cross at intersections,
  and mouth pieces where a canal meets the basin or the sea. All derived at render time
  from a 4-bit waterway-neighbor mask (N=1, E=2, S=4, W=8, up to 16 shapes), exactly the
  wall autotiler's technique: no stored direction field, so art stays retroactive and
  junction shapes follow generation changes for free. Neighboring basin/sea water counts
  as a waterway neighbor for masking (a canal mouth is open, not walled).
- **Add (medium):** quay edge treatment on path tiles orthogonally adjacent to water:
  a stone lip on the wet side, autotile-style neighbor keying exactly like the existing
  wall autotiler. This is what makes the quays read; the walls prove the technique.
- **Building art:** boathouse shape + emoji (`getTownTileEmoji` map,
  `townMapGenerator.js:1833`) following the harbormaster precedent
  (`townTileArt.js:320`); legend swatches for Canal and Boathouse in `mapLegend.js`.
- **Image-gen queue:** canal-city arrival art and river-city arrival art into
  `IMAGE_GENERATION_PROMPTS.md`; boathouse interior into `BUILDING_IMAGE_PROMPTS.md`.

## 6. Premium packaging

**Recommendation (committed): canal city is the Premium flagship; river city ships to
Members (the lower paid tier) as the tease.** Until real tiers exist, BOTH gate behind
the placeholder `isPremium()` (`src/game/entitlements.js:30`), with the split encoded
now so the tier field drops in later:

- `entitlements.js` gains `WATER_TOWN_ARCHETYPES = Object.freeze({ riverfork:
  'members', canal: 'premium' })` and `canUseWaterTown(archetype)`, following the
  `PREMIUM_THEMES`/`canUseTheme` pattern exactly. NewGame calls it when stamping
  `waterTown` (§2); nothing downstream ever re-checks (saves carry the stamp,
  grandfathering lapsed subscribers like premium themes do).
- The flagship canal campaign ships as a premium story template in
  `premiumTemplates.local.js` (merged by `storyTemplates.js:1326`), with a size-tagged
  `customNames` entry pinning the estuary town to `city`, and `premium: true` so
  `isTemplatePremium` gates it with no new logic.
- **Free-tier tease: visible-but-locked in NewGame, absent in-world.** The template
  card shows with the existing COMING SOON/locked treatment (`NewGame.js:557-597`);
  free worlds simply never stamp `waterTown`, so no locked content haunts the world map
  mid-game. Alternative rejected: visible-but-locked water towns on the world map
  (immersion-breaking, and the never-regenerate rule would freeze the locked state into
  the save).

### 6b. Where the code lives (maintainer question 2026-07-05)

**Generator, art, and gating: PUBLIC repo.** The client must render cached canal
towns on any device, so the autotiler, waterway handling, and building art ship
in the public bundle regardless; keeping only the layout algorithm private would
protect the least valuable part. Precedent: desert/snow premium themes (public
code, in-product gate, accepted by the licensing memo).

**Authored canal-city CAMPAIGN: PRIVATE repo** (dungeongpt-premium-content),
server-delivered like the heroic-t3 flagship. Authored content is the defensible
paid artifact; the algorithm is engine.

**Enforcement: server-side access, not code secrecy.** The Worker checks the
entitlement before serving premium content or persisting premium-stamped saves
(#39/#40, post-cutover). Client-side gates are UX, not security.

## 7. Quests & NPCs

- **Staffing:** one new `populateTown` branch: boathouse -> Boatwright (proprietor
  pattern, sibling of the harbormaster branch at `npcGenerator.js:790`). Canal-city
  harbormaster/warehouse staffing already exists. No other roster changes.
- **Side quests keep working unchanged:** deliveries and turn-ins (`questEngine.js`,
  `sideQuests.js`) target buildings by type/name; bridges only lengthen the walk, which
  actively improves courier quests (a delivery across two bridges is the archetype
  fantasy for free). New flavor to add to the side-quest pool once generation ships:
  smuggling (boathouse/warehouse cache), ferry-dispute mediation (harbormaster), bridge
  toll trouble (townhall/constable). Flavor only; no new quest mechanics.
- **Milestone quest-building injection still works:** `injectQuestBuildings`
  (`milestoneSpawner.js:216`) places new venues on free grass near buildings
  (`:270-282`). The §3 grass floors (>= 10 core, >= 4 on each island) exist precisely
  to guarantee its supply, asserted by test on the water-town presets. Authored
  milestone NPCs via `getMilestoneNpcsForTown` ride on `populateTown` and need nothing.

## 8. Phasing & effort

Debug-first throughout: extend `/debug/tileset` (`TilesetTest.js`) with canal-city and
river-city presets + seed survey (it already previews towns and reads `pathStats`); a
separate `/debug/water-town` page is not needed.

| Phase | What | Size | Depends on |
|---|---|---|---|
| 1 | River-fork carve + `waterway` field + bridging cost + island venue bias + invariant tests, behind `/debug/tileset` | M | nothing |
| 2 | Canal city: basin + canal spokes + bank-hug cost + density variant + grass-floor tests, behind `/debug/tileset` | L | 1 (shares plumbing) |
| 3 | World-gen shim (`riverToSea`, `estuaryTown` options) + `waterTown` stamp in NewGame + `useGameMap` pass-through | M | 1-2 |
| 4 | Art polish: canal water variant, quay autotiling, boathouse art/emoji/legend + Boatwright staffing | S-M | 1-2 |
| 5 | Premium packaging: `canUseWaterTown`, flagship template in `premiumTemplates.local.js`, locked NewGame card | S | 3 |
| 6 | Side-quest flavor (smuggling/ferry/toll) + end-to-end verification on live saves | S | 3-5 |

**Hetzner cutover dependency: only real entitlement enforcement** (the `userTier`
field, #39/#40, same as `LARGER_WORLDS_PLAN.md` §7.4). Everything above builds and
ships dark now behind the `dungeongpt:premium` dev override.

## 9. Open questions for the maintainer (each with a recommendation)

1. **Must the canal city sit on a true estuary, or is pure coast enough?**
   Recommend: estuary preferred; pure coast allowed as a fallback lagoon city so the
   flagship template never fails to place. The stamp logic tries estuary first.
2. **River city on hamlets/villages too?** Recommend no: town + city only. A fork
   plus an island district needs the 18-20 native grids to breathe.
3. **Members vs Premium split as proposed (river = Members, canal = Premium)?**
   Recommend yes; it gives the lower tier a real water toy while keeping the set piece
   at the top. Fallback if tiers simplify to one paid tier: both premium, no code change
   (the archetype->tier map collapses).
4. **One new building type (boathouse) or zero?** Recommend one. Fish market and ferry
   dock are cut: `market` already exists, and ferry dock belongs to
   `FEATURE_FAST_TRAVEL.md` boats.
5. **Do canals get distinct art from sea water?** Recommend yes (the small `waterway`
   variant); it is the cheapest way to make the archetype legible. Quay autotiling is
   the bigger visual win but can trail in Phase 4.
6. **Seeded ~50% river-city roll, or always-on for eligible towns?** Recommend the
   roll: variety across a world's several river towns beats uniformity, and the roll is
   seeded so saves are deterministic.
7. **Should the §2 world-gen shim wait for #66 hydrology?** Recommend no: build the
   two-option shim now (it is small and options-gated), and let #66 replace it
   wholesale later. Water towns should not be blocked on an XL terrain rework.
