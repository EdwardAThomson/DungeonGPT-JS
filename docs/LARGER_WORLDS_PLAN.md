# Larger Worlds Plan — chunked generation, flat storage, growable saves (#60)

Status: **design agreed 2026-07-05** (this doc); no code yet. Prerequisite: #59
(water cap) lands inside the generator first.
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
4. **Paid gate + New Game size option** via `entitlements.js` (world size is
   a clean `userTier` gate; #39/#40 dependency for real enforcement).
5. **Growable-save upgrade** last (needs 1-4 stable + mapVersion machinery).

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
