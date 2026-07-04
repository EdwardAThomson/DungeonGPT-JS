# Larger Worlds Plan — chunked generation, flat storage, growable saves (#60)

Status: **design agreed 2026-07-05**; **step 3 prototype built** (chunk assembly behind
`/debug/large-world`, debug-only, scheme EXPERIMENTAL and **NOT frozen** — see §7a).
Prerequisite #59 (water cap) landed inside the generator first.
Related: `docs/private/` tier ladder ("bigger worlds" is a Premium benefit),
`TERRAIN_ROADMAP.md` (experimental noise terrain, debug-only, NOT this plan's
basis), CLAUDE.md map backwards-compatibility rules (binding here).

## 1. Product shape

- **Guests / Free: 10x10, unchanged.** Same generator, same code path, forever
  the baseline product.
- **Paid tiers: k x k chunk worlds.** A chunk is one 10x10 generation unit.
  First target: 2x2 (20x20 tiles) or 3x3 (30x30). Even 30x30 = 900 tiles:
  small enough to generate upfront at New Game and store flat.
- **Campaigns stay heart-anchored** (§4): bigger worlds add exploration
  territory, not longer mandatory treks.

## 2. Core architecture: chunked GENERATION, flat STORAGE

Chunking exists only inside the generator, for continuity control. The save
stores one flat grid exactly as today, just larger, so every downstream system
(movement, POI modals, milestone spawner, renderer, saves) keeps a single
coordinate space and no streaming/lazy-load infrastructure is built.

### Generation algorithm
1. **Heart chunk first, byte-identical to today.** Generate the center 10x10
   with `generateMapData(10, 10, worldSeed, customNames, theme)`: same seed,
   same code path, same output. The heart of a paid world IS a valid free
   world; quest authoring and `spawnWorldMapEntities` keep working unchanged.
2. **Neighbors outward, deterministic per chunk.** Chunk seed =
   `hash(worldSeed, chunkX, chunkY)` (heart = (0,0)). The whole world is
   reproducible regardless of generation order; a future "grow this save"
   upgrade generates the same chunks it would have at New Game.
3. **Edge constraints stitch the seams.** Each non-heart chunk receives the
   adjacent EDGE ROWS of its already-generated neighbors as a constraint
   input: biomes to continue (bias the first 2-3 rows toward the neighbor's
   edge biomes, blending inward), river exits to receive, road stubs to
   connect toward the nearest own road/town. No biome guillotines, no roads
   dead-ending at invisible lines, no half-lakes.
4. **Global caps distribute, not multiply.** Water fraction (#59), settlement
   counts, and POI density get per-chunk budgets derived from a world-level
   target, so a 3x3 world is not 9x the lakes and 9 cities. Named content
   (customNames, milestone POIs) resolves in the heart chunk only.

### Storage & versioning
- Save payload gains `mapVersion: 2`, `worldWidth`/`worldHeight`, and
  `worldOrigin: {x, y}` (tile offset of the stored grid's top-left in world
  space; existing saves implicitly `{0,0}`, 10x10, version 1).
- `worldOrigin` exists so a LATER extension can add chunks on any side
  without renumbering existing tiles: extend west = origin.x -= 10 and
  prepend columns. All persisted coordinates (playerPosition, milestone
  spawn stamps, town keys) stay valid because existing tiles never move
  in world space; only the grid's bounding box grows.
- Renderer-tolerance rule applies: version-1 saves lack the new fields and
  must behave exactly as today (defaults: origin 0,0, 10x10).

## 3. The upgrade path: growable saves (the conversion moment)

Because extension is purely additive, a player who subscribes can have their
CURRENT world grow: generate the missing chunks around the stored grid
(deterministic from worldSeed + chunk coords), append rows/columns, bump
mapVersion, never touching an existing tile. This respects the
never-mutate-loaded-maps rule (strictly additive) and is a far stronger
conversion moment than "start a new, bigger world": the world you already
care about gets bigger.

Consequence to hold ourselves to: the chunk-seed scheme and edge-constraint
inputs are FROZEN once shipped (they become save-affecting), so get them
right behind a debug page before release.

## 4. Quests & milestones

- `spawnWorldMapEntities` constrains milestone POIs to the heart chunk
  (radius 0), satisfying "milestones not too far apart" and "t1+t2 broadly
  in the same chunk" by construction. No authored template changes.
- Side quests MAY use outer chunks ("distant rumors"): exploration incentive
  and the reason a bigger map feels bigger. Gather-quest eligibility already
  checks source-site existence; it naturally benefits from more sites.
- In-save chaining (continueCampaignInSave) keeps working: it spawns into the
  live map and the heart chunk is unchanged geography.

## 5. Display

- **Scroll:** MapModal/WorldMapDisplay get a viewport over the grid (CSS
  overflow pan or windowed rendering). Current renderer draws every tile;
  fine at 900, but add viewport culling as cheap insurance.
- **Zoom:** two or three fixed zoom steps (tile px sizes) beat free zoom for
  a tile game; fit-whole-map is the zoomed-out step (30x30 at ~20px fits).
- Player-centered auto-scroll on open; milestone POI markers must remain
  discoverable off-viewport (edge arrows or the existing quest-location list
  in the Adventure Book).
- Preview harness first, per house rules: extend `/debug/world-map-art` (or a
  new `/debug/large-world`) before touching the live display.

## 6. Performance & caches

- 900 tiles: negligible for generation and pathfinding (A* on 30x30 is tiny).
- `sub_maps.townMapsCache` grows with settlement count: per-chunk settlement
  budgets (§2.4) keep it bounded (~2-3x today's, not 9x).
- Save payload size: world_map grows 9x (still small JSON); conversation and
  town caches dominate saves today, so no storage concern.

## 7. Sequencing

1. **#59 water cap + lake variation** inside the generator (all chunks
   benefit; do first so tuning happens on 10x10 where it is cheap).
2. **Scroll/zoom viewport** on the display, shipped dark for 10x10 (a 10x10
   world in a viewport that exactly fits = zero visible change).
3. **Edge-constraint generation + chunk assembly** behind `/debug/large-world`
   with side-by-side seam inspection; freeze the chunk-seed scheme.
   **PROTOTYPE BUILT (debug-only, scheme EXPERIMENTAL, not frozen)** — see §7a.
   The freeze happens only when real saves start depending on the scheme.
4. **Paid gate + New Game size option** via `entitlements.js` (world size is
   a clean `userTier` gate; #39/#40 dependency for real enforcement).
5. **Growable-save upgrade** last (needs 1-4 stable + mapVersion machinery).

## 7a. Step 3 prototype record (built; EXPERIMENTAL, not frozen)

Implementation: `src/utils/worldAssembler.js` (+ `worldAssembler.test.js`) and
`src/pages/LargeWorldTest.js` at **`/debug/large-world`**. Nothing touches the live
New Game flow or what saves store. `generateMapData` gained an optional final
`options` param (suppress/prescribe coast — uniform or per-tile depths, edge
constraints, lake border margin, lake count cap, town density); omitting it is
byte-identical to the legacy call, pinned by fixture tests
(`src/utils/__fixtures__/legacyMap_seed*.json`).

**Ocean-side decision.** The heart's placeCoast edge defines the WORLD's ocean side.
Chunks continuing the heart's row/column along that side carry the coastline through;
chunks fully beyond the coastline are open ocean (all water; small seeded islands are
allowed by this design but deliberately not generated in the prototype); all other
world sides get NO coast. Rationale: one coherent sea keeps the mental model of
"today's free world, extended inland" — the heart stays a valid free world and a
second random coast elsewhere would strand water mid-continent.

**World-level coast depth profile (refinement after maintainer seam review).** The
first cut wobbled the coast depth ±1 independently per chunk, which produced a visible
band-thickness STEP exactly at chunk seams (repro seed 61211). Replaced by ONE
deterministic 1D profile over the along-coast coordinate — `buildCoastProfile(worldSeed,
alongLen, anchorStart, anchorDepth)` — sampled identically by whichever chunk stamps
that column/row, so both sides of every seam compute the same depth by construction.
The profile is anchored on the heart: it equals the heart's own fixed coast depth
across the heart's span (the heart interior cannot change), then walks outward in runs
of 3-5 tiles (a run is extended by one when its step would otherwise land exactly on a
chunk boundary), stepping ±1 per run within [2,3] (placeCoast's own range; gate offsets
2..7 stay clear of the deepest rows). Result: the coastline still wobbles along its
length (depth variance > 0 on 40/40 surveyed seeds) but the band depth at every seam is
EQUAL (80/80 coast-crossing seams over 40 seeds; seam compatibility is now 1.0
everywhere). `stampCoast` gained an optional per-tile `depths` array for this.

**World-level lake allocation (refinement after maintainer seam review).** The first
cut let every outer land chunk roll its own lakes (generateMapData always places lake
#1), so a 3x3 world grew a lake in nearly every land chunk (repro seed 4242). Now the
heart keeps its legacy lakes untouched, and outer land chunks get lakes only on a
seeded per-chunk grant (world-level `hashRoll(worldSeed, 'lakes:cx,cy') < 0.32`); when
granted, the normal #59 budget applies inside that chunk. Implemented via a new
additive generator option `maxLakes` (0 = suppress entirely, 1 = primary lake only,
default undefined = legacy, byte-identical). Measured over 40 seeds x 5 outer land
chunks: mean 0.33 lakes per outer chunk (137 chunks with 0, 60 with 1, 3 with 2); seed
4242 dropped from a lake in nearly every land chunk to 2 lakes world-wide.

**Gate-point decision.** Every land-land shared chunk edge gets exactly ONE crossing
tile: `gatePoint(worldSeed, edgeId)` (offset 2..7 along the seam, off the corners so
gates never land in a coastal chunk's corner water band). Each chunk then road-connects
its nearest town to each of its gate tiles (A* avoiding water), and the pair is stitched
so the crossing renders continuously. The heart gets this connector at ASSEMBLY time
only, as an additive overlay over its untouched legacy interior. Rationale: one
deterministic gate per seam is the minimum that guarantees cross-chunk road
connectivity while staying reproducible regardless of generation order.

**Road representation (investigated).** World-map roads are NOT a `road` tile field:
they are `hasPath: true` + `pathConnections: ['north'…]` + `pathDirection:
'NORTH_SOUTH'|…` written by `markPathTiles` (`src/utils/pathfinding.js`), A*'d
town-to-town by `generateTownPaths`. Towns themselves are never marked; roads end on
the neighbouring tile, which is exactly what `getTownRoadEdges`
(`src/utils/townWater.js`) reads for town-entrance sides. Roads never reach the map
edge today simply because paths only connect interior towns. The gate post-pass reuses
these existing fields verbatim (no new tile field), so gate roads render with the
existing path overlay and feed town entrances for free.

**Seam quality (40-seed / 280-seam survey).** Exact cross-seam biome match avg 0.94
(≥0.6 on ~95% of seams; the exceptions are heart lake-shore rings touching the heart
border — beach meeting grass, same as inside any legacy map). Hard water/land edges:
none anywhere (seam compatibility 1.0 on land AND coast seams, since coast depths now
match exactly at seams). Lakes in non-heart chunks keep 2 tiles off chunk borders
(option `lakeBorderMargin: 2`), so no lake is ever bisected by a seam; walkable-land
connectivity (every town reaches the heart's starting town without crossing water)
held on every surveyed seed.

**FREEZE STATUS: NOT FROZEN.** `chunkSeed`, `gatePoint`, the edge-constraint inputs,
and the ocean-side model may all still change freely; they become save-affecting (and
frozen, per §3) only when growable saves or paid world sizes ship on top of them.

## 8. Open questions

- Chunk count per tier: 2x2 for Members, 3x3 for Premium? (Tier ladder says
  "bigger worlds" at Premium $10; Members could keep 10x10 or get 20x20.)
- POI density per outer chunk: same as heart, or sparser wilderness with
  occasional dense pockets? Leaning sparser (outer chunks are wilds).
- Fast travel (`FEATURE_FAST_TRAVEL.md`, horses/boats) likely becomes a
  practical need at 30x30: revisit its priority when this ships.
- Does the world map minimap (if any) need a distinct zoomed-out mode, or is
  zoom step 3 (fit-all) sufficient?
- Biome THEME per chunk (desert chunk stitched to grassland heart) vs one
  world theme: defer; premium biome worlds currently sell as separate
  templates and mixing themes complicates seam blending.
