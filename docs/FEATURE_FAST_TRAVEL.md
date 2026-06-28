# Feature: Fast travel (horses on land, boats on water)

Give the world map two traversal upgrades the party can acquire in town: a **horse**
(land) that lets you **fast-travel between towns you have already discovered**, and a
**boat** (water) that lets you **cross water tiles** you cannot enter on foot. Today the
world map is pure adjacent stepping and water has nothing to offer, so a discovered map
gets tedious to re-cross and lakes/coastline are dead space.

## Current state (what exists today)

- World movement is **one adjacent tile per click**: `isAdjacentWorldMove` (dx<=1, dy<=1)
  in `worldMoveController.js`, applied by `handleMoveOnWorldMap` in `Game.js`, which marks
  the tile explored via `applyWorldMapMove`.
- **There is no terrain passability gate on the world map.** `handleMoveOnWorldMap` checks
  adjacency only, then sets `playerPosition`; `WorldMapDisplay` fires `onTileClick(x,y)` on
  every tile unconditionally. Water (`biome === 'water'`, i.e. coastal sea and lakes from
  `mapGenerator.js`) is effectively walkable today, it just contains nothing (encounters
  are explicitly suppressed on water in `encounterGenerator.js`). So the boat feature must
  **add** a water gate, not loosen an existing one.
- Discovery is already tracked and persisted: `visitedTowns` / `visitedBiomes` Sets live in
  `useGameMap.js` and are saved in `sub_maps` (`buildSubMapsPayload`). Fast travel can reuse
  `visitedTowns` directly for "discovered towns".
- Acquisition buildings already exist in town generation (`townMapGenerator.js`):
  `stables` (village+ rosters) and `harbormaster` (placed on the shore **only when the town
  sits on water**, STEP 1.7). Both already have SVG tile art in `townTileArt.js`. No
  acquisition flow is wired to either.
- Encounter frequency lives in `shouldTriggerEncounter(tile, isFirstVisit, settings,
  movesSinceEncounter)` in `encounterGenerator.js` (biome base chance, grimness modifier,
  staleness ramp). Combat is deterministic (`encounterResolver.js`); travel must never
  bypass it.

`docs/OUTSTANDING_ISSUES.md` does not list travel, so this is a net-new feature.

## Player-facing behaviour

### Horses (land) — fast travel between discovered towns
- Buy a horse at the **stables** building (village and larger). One-time purchase; the
  party then "owns a horse".
- Once owned, the world map offers a **Travel** action listing every town the party has
  **already visited** (fog-of-war respected: undiscovered towns never appear). Picking one
  moves the party there instantly, with a short summary line in the log
  (`role: 'system'`, e.g. "You ride hard for two days and reach Greenhollow.").
- The current town is excluded from the list. Fast travel is only available from the world
  map (not inside a town/site sub-map; leave town first).

### Boats (water) — cross otherwise-impassable water
- Buy a boat at the **harbormaster** building, which only exists in **coastal/lakeside
  towns**, so boats are naturally gated to where they make sense.
- Once owned, **water tiles become enterable** by normal adjacent stepping, so the party
  can cross a lake or hug the coast to reach land (an island, a far shore, a POI) that was
  unreachable on foot. Water still reveals tile-by-tile through the normal explore path.
- Without a boat, clicking a water tile is rejected with "You cannot cross open water
  without a boat."

## Mechanic choice (horses): options weighed

Three candidate horse mechanics were considered:

1. **Instant fast-travel between discovered towns.** Highest player value (kills backtrack
   tedium), reuses the already-persisted `visitedTowns` set, and respects fog-of-war for
   free. Needs a small destination-picker UI and a "jump" handler.
2. **Faster per-step movement (move >1 tile per click).** Modest payoff, requires relaxing
   `isAdjacentWorldMove` and a multi-tile pathfind/encounter loop. Mostly subsumed by
   option 1 for the common "get back to town" case.
3. **Reduced random-encounter frequency while mounted.** Cheap (one multiplier in
   `shouldTriggerEncounter`) but only meaningful while manually stepping, which fast travel
   makes rare. Passive and low-visibility on its own.

**v1 pick: option 1 (instant fast-travel between discovered towns).** It is the strongest,
self-contained win and leans on existing state. Options 2 and 3 are deferred (see Phased
rollout); they only matter for manual stepping, which option 1 reduces anyway. v1 fast
travel is **safe** (no en-route encounter) to keep the slice small; adding a single
en-route encounter roll for danger/grimness is an explicit Phase 2 refinement so it can go
through the deterministic encounter path rather than a bespoke one.

## Data model & persistence

- **Party-level ownership rides on `settings`**, exactly like `sideQuests` already does
  (set via `setSettings`, persisted through `useGamePersistence` as `gameSettings`):
  ```
  settings.mounts = { horse: boolean, boat: boolean }
  ```
- Default `undefined`/`{}` for existing saves and new games until purchased. All reads go
  through helpers that treat missing as `false` (`mounts?.horse`, `mounts?.boat`).
- Purchases deduct gold from the lead hero, matching the shop convention
  (`inventorySystem.addGold` / spend, party-pooled-via-lead-hero like `shopController`).
- No new persisted map fields. Boat traversal uses the existing `isExplored` flag; fast
  travel only writes `playerPosition` (already saved) and reuses `visitedTowns` (already in
  `sub_maps`).

## The art question

- **No new art for v1.** Building art already exists (`stables` and `harbormaster` SVG
  sprites in `townTileArt.js`, the `⚓` harbormaster glyph), so acquisition needs nothing
  new.
- Ownership is shown as **status text/emoji** (reuse the project's existing emoji idiom,
  e.g. `🐴`/`⛵` in the world-map HUD or the Travel panel), not a new asset. Water tiles
  the party cannot enter get a CSS cursor/affordance change only (no sprite).
- The world-map player marker stays as-is (no mounted/boat-on-water player sprite). A
  mounted-player or boat-on-water world sprite would be a **new-art exception** and is
  flagged as future/Phase 2, not part of this feature.
- This keeps the no-raster, programmatic-SVG rule (CLAUDE.md) intact: art changes here are
  zero.

## Interaction with other systems

- **Encounters.** v1 fast travel rolls **no** encounter (safe ride). Boat water tiles stay
  encounter-free (matches the current `biome === 'water'` suppression in
  `encounterGenerator.js`). Future hooks (Phase 2): one en-route encounter roll for fast
  travel, a dedicated sea/lake encounter table, and the mounted encounter-frequency
  multiplier for manual stepping (option 3).
- **Deterministic combat.** Travel touches movement only. Any future en-route or sea
  encounter must flow through the existing `encounterController` / `encounterResolver`
  (d20-in-code) path, never a shortcut. Fast travel must not skip or auto-resolve combat.
- **Fog-of-war / discovery.** Fast-travel destinations are strictly the **discovered**
  towns (`visitedTowns`); undiscovered towns are unreachable by fast travel. Boat crossing
  reveals water/land tiles step-by-step exactly like walking, so it never teleports past fog.
- **Milestones.** Arriving via fast travel still fires the normal `location_visited` /
  arrival checks (`checkMilestoneEvent`) so a town reached by horse counts the same as one
  reached on foot. Hidden milestone POIs across water become reachable only once a boat is
  owned, which is the intended gating, not a bug.

## Files (owned by this stream)

- **NEW `src/game/travelController.js`** — PURE, testable:
  - `canEnterWorldTile(tile, mounts)` -> bool (water requires `mounts?.boat`; land always
    true; tolerate missing biome -> treat as land).
  - `getFastTravelDestinations(visitedTowns, worldMap, currentPosition)` -> list of
    `{ townName, x, y }` for visited towns excluding the current tile.
  - `isPortTown(townTile, worldMap)` / `buildingOffersMount(buildingType)` helper
    (`stables -> 'horse'`, `harbormaster -> 'boat'`).
  - `MOUNT_PRICES` + `mountPrice(kind)`, `buyMount(party, kind, mounts)` ->
    `{ party, mounts, ok, reason }` (reuse `addGold`/spend from `inventorySystem`,
    read-only; do not change its signatures).
- **(Optional) fast-travel destination picker** registered through `ModalContext`
  (`MODAL_REGISTRY`), or a lightweight panel inside the existing world-map `MapModal`.
  Prefer the panel to avoid a new modal if it fits.

## Coordinate (shared files — additive only)

- **`src/pages/Game.js`**:
  - In `handleMoveOnWorldMap`, after the adjacency check, gate on
    `canEnterWorldTile(targetTile, settings?.mounts)` and reject water without a boat
    (one small addition, mirrors the town `walkable` rejection).
  - Add `handleBuyMount(kind)` (calls `travelController.buyMount`, `setSelectedHeroes` +
    `setSettings(prev => ({ ...prev, mounts }))`) and `handleFastTravel(destination)`
    (sets `playerPosition`, marks explored, pushes the summary message, runs the existing
    arrival/milestone checks). Thread `onBuyMount` to `BuildingModal` and the Travel action
    to the world-map view.
- **`src/components/BuildingModal.js`**: add a small **"Stables"/"Harbour"** acquisition
  section (price + Buy button, disabled when unaffordable or already owned) for
  `buildingType === 'stables'` and `=== 'harbormaster'`, alongside the existing Wares/Rest
  sections. Do not disturb those.
- **Prop chain** `Game.js -> GameModals -> MapModal -> TownMapDisplay -> BuildingModal`:
  add `onBuyMount` and a `mounts` read the SAME additive way `onBuy`/`onSell`/`party` are
  threaded today.
- **`src/components/WorldMapDisplay.js`**: optional CSS cursor/affordance for water tiles
  that are not enterable (no boat). No data or generator changes.
- **`SettingsContext`**: default `mounts` to `{}` when absent (back-compat read path).
- `useGamePersistence.js` needs **no change**: `mounts` rides on `gameSettings` for free.

## Tests (`src/game/travelController.test.js`)

- `canEnterWorldTile`: water blocked with no/empty mounts, water allowed with
  `{ boat: true }`, land always allowed, unknown/missing biome treated as land.
- `getFastTravelDestinations`: returns only visited towns, excludes the current tile,
  empty when none visited.
- `buyMount`: deducts gold + sets the flag; blocked when broke (party + mounts unchanged);
  blocked when already owned; `harbormaster -> boat`, `stables -> horse` mapping.
- Back-compat: a save with no `settings.mounts` -> `canEnterWorldTile` blocks water and
  `getFastTravelDestinations` works (no crash on missing flag).

## Back-compat

- New, additive feature. Old saves have no `settings.mounts`, so both flags read false:
  no fast travel, water blocked, identical to today's intended behaviour.
- **One behaviour change to call out:** today water is technically steppable (it just does
  nothing). Adding the water gate means old saves can no longer walk onto water without a
  boat. Since water has no content, this only removes a pointless move and is acceptable;
  it is a control-layer (movement-rule) change, retroactive like art per CLAUDE.md, not a
  map-data migration.
- No `mapVersion` bump required: no generator or tile-field changes.

## Non-goals

Mounted combat, naval/sea combat, mount or boat **stats** (HP, speed, stamina, feed/fuel),
multiple mount tiers/breeds, per-hero mounts, fast travel to arbitrary (non-town) tiles,
river-specific boats, losing/stealing mounts, mount art / mounted-player or boat world
sprites, and coastal port-to-port fast travel (see Phase 2).

## Phased rollout

- **Phase 1 (this slice):** `settings.mounts` data model; acquisition at stables
  (horse) and harbormaster (boat); world-map water gate + boat traversal; horse
  fast-travel between discovered towns (safe); status text; `travelController` + tests.
- **Phase 2:** single en-route encounter roll for fast travel (deterministic path);
  coastal **port-to-port** fast travel by boat (reuse the picker, restrict to towns with a
  harbormaster); a sea/lake encounter table; mounted encounter-frequency reduction for
  manual stepping; gold-cost tuning (per-trip stable fee vs one-time).
- **Phase 3 (future):** mounted-player / boat-on-water world sprite (new-art exception),
  any mount stats — only if the design calls for it.

## Open questions for the human

1. **Cost model:** one-time mount purchase only, or a per-trip stable fee for fast travel
   (and a harbour fee for boats)? Suggested v1: one-time purchase, free thereafter.
2. **Prices:** what gold values for horse and boat relative to the shop economy?
3. **Danger on fast travel:** keep v1 safe, or roll one en-route encounter from the start?
4. **Boat abstraction:** does owning a boat let the party cross any water anywhere
   (carry-a-rowboat abstraction), or only when starting adjacent to water / from a port?
   v1 assumes the simple abstraction (own boat -> any water passable).
5. **Coastal fast travel:** define "port town" by harbormaster presence (precise, ties to
   the building) or by coastal adjacency (looser)? Affects Phase 2.
6. **Ownership scope:** confirm party-level (on `settings`) rather than per-hero.
7. **Retroactive water gate:** OK to block water for existing saves (Back-compat note), or
   should the gate apply only to maps stamped after this ships?
</content>
</invoke>
