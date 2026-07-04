# Feature: Side-quest backfill on load

Status: SHIPPED 2026-07-04 (#45), extended beyond this spec: a load also tops the save up
to the cap when the quest pool has grown since the game was created, not only when it has
zero quests (`src/game/questEngine.js`, `backfillSideQuests` + the load-path wrapper).

Seed side quests for an **in-progress** campaign the first time it loads, **if and only if
it has none**. Side quests are currently chosen only at New Game (`selectSideQuests`, stored
in `settings.sideQuests`). Any save created before the side-quest feature shipped, or any
save whose `settings.sideQuests` is missing or empty, shows **zero quests** at inns/taverns
and **no exploration rumours / site reveals** for the rest of the campaign. This feature
backfills a map-fitting set of quests at load so existing campaigns gain side content without
a New Game and without rerolling anyone's existing quests.

## Current state (what exists today)

- **Selection happens once, at New Game only.** `src/pages/NewGame.js` (~lines 348-388)
  computes availability from the freshly generated world, calls
  `selectSideQuests({ sites, buildings }, sideQuestCount, sqRng)`, and stores the result on
  `settingsData.sideQuests`. There is **no load-time path** that ever calls `selectSideQuests`
  again.
- **How NewGame derives availability** (the thing the backfill must reproduce):
  - `const flatTiles = [].concat(...mapData);` flattens the world grid.
  - **Sites** come straight off world tiles:
    `availableSites = { cave: flatTiles.some(t => t.poi === 'cave_entrance'), ruins: flatTiles.some(t => t.poi === 'ruins') }`.
  - **Buildings** come from the **pre-generated town maps** (`townMapsCache`, built in the
    loop at NewGame ~313-336 that calls `generateTownMap` for every `tile.poi === 'town'`):
    it unions every `t.buildingType` where `t.type === 'building'` across all cached town
    maps into a `Set`.
  - **Count** scales to the map: `townCount = flatTiles.filter(t => t.poi === 'town').length;`
    then `sideQuestCount = Math.min(4, Math.max(2, townCount))`.
  - **Determinism**: `let sqSeed = parseInt(seedToUse) || 1;` with the LCG
    `sqRng = () => { sqSeed = (sqSeed * 9301 + 49297) % 233280; return sqSeed / 233280; }`,
    i.e. seeded off the **world seed** so a given world reproducibly offers the same quests.
- **Selection is map-validated.** `selectSideQuests` -> `isQuestEligible` (in
  `src/game/questEngine.js`) keeps only quests that are both startable and completable on
  the map: the giver building must exist, every objective step's `site.type` must exist in
  `sites`, and every turn-in `building` must exist. It also guarantees at least one low-tier
  (`minLevel <= 2`) quest, then fills the rest, and returns fresh `status: 'available'` copies
  with `completed: false, progress: 0` on each milestone.
- **Quest shape** (`src/data/sideQuests.js`): the `SIDE_QUESTS` pool is built from `Q(...)`
  (objective step + turn-in step) and `Courier(...)` (single deliver step). Givers are
  building types or arrays (`INN = ['inn','tavern']`, `['temple','shrine']`, etc.). Statuses
  are `'available'` -> `'active'` (via `acceptSideQuest`) -> `'completed'`.
- **How quests surface at runtime** (why "buildings actually placed" matters less than it
  looks): `BuildingModal.js` calls `getAvailableQuestsAt(sideQuests, { buildingType, townName, level })`
  and `getReadyTurnIns(...)` keyed on the building the player is **standing in**, and
  `GameModals.js` computes `getRevealedSiteTypes(settings.sideQuests)` for map reveals. So a
  quest only ever shows if the player physically reaches a building of its giver type.
- **Load path today** (`src/pages/Game.js`):
  - `useGameSession` (~line 40-44) restores settings on mount: it parses
    `loadedConversation.game_settings` and calls `setSettings(parsedSettings)` verbatim.
    Nothing augments side quests.
  - The `selectedHeroes` `useState` initializer (~87-107) is the **precedent for a
    load-time migration**: it runs `normalizeParty(...)` (from `src/utils/partyUtils.js`)
    then backfills missing progression fields, all inside the lazy initializer. This is the
    pattern to mirror.
  - World map at load is `loadedConversation.world_map` (alias `worldMap` -> `world_map`),
    surfaced as `mapHook.worldMap`. The seed is `settingsObj.worldSeed || stateSeed`.
- **Persistence** (`src/hooks/useGamePersistence.js`): `performSave` writes
  `gameSettings: settingsRef.current` (the live `settings`, including `sideQuests`) on the
  30s autosave + unmount. A fingerprint short-circuits no-op saves; `settings` is part of the
  fingerprint, so mutating `settings.sideQuests` once will be persisted on the next save.

`docs/OUTSTANDING_ISSUES.md` should gain a one-line entry; this is otherwise net-new.

## The core problem: building availability is only partially knowable at load

This is the one hard constraint, and it must be called out up front.

- **Sites are fully knowable.** `cave` / `ruins` live on the persisted world map
  (`loadedConversation.world_map`), so `availableSites` can be reproduced **exactly** at load
  with the same `flatTiles.some(...)` logic NewGame uses.
- **Buildings are NOT fully knowable at load.** NewGame reads building types from the
  `townMapsCache`, which at New Game contains **every** town (all pre-generated). On load
  that is not guaranteed:
  - Saves from before town pre-gen (and any older save) generate town maps **lazily on first
    visit** and cache them in `sub_maps.townMapsCache`. So at load only **visited** towns are
    in the cache; unvisited towns have no building roster yet.
  - Generating every town at load to learn its buildings would be expensive, would risk
    drift if the generator has since changed, and (per CLAUDE.md) maps are "generated once and
    never regenerated" — we must not regenerate a loaded map in place.

**Recommended resolution: derive building availability from the per-size rosters, not from
generated towns.** `townMapGenerator.js` exposes a deterministic, hoisted `BUILDING_CONFIG`
keyed by town size (`hamlet` / `village` / `town` / `city`), which is the source of truth for
what each size *can* contain:

```
hamlet : important [barn]                      secondary [shrine, mill]
village: important [inn, shop, blacksmith, tavern]
         secondary [alchemist, mill, stables, shrine]
town   : important [inn, shop, temple, blacksmith, tavern, tavern]
         secondary [alchemist, archives, warehouse, tailor, fletcher, apothecary, stables, mill]
         + civicHall (townhall)
city   : important [inn, temple, market, blacksmith, tavern, bank]
         secondary [guild, alchemist, archives, library, foundry, warehouse, magetower, tailor, apothecary, stables]
         + civicHall (townhall) + hasJail (jail) + nobleEstate (manor)
```

For backfill, take each `tile.poi === 'town'` on the world map, read its size
(`tile.townSize || tile.poiType || 'village'`), and union that size's
`important` + `secondary` + (`civicHall` ? `townhall`) + (`hasJail` ? `jail`) building types
into the available set. This reproduces "what buildings the world has" **without generating
any town**, is deterministic, and tolerates the generator changing later (it depends only on
the roster table, not on placement).

To make this reusable and drift-proof, expose a small helper from `townMapGenerator.js`
(e.g. `export const buildingTypesForSize = (size) => [...]`) that returns the roster types
for a size, and have both the (existing) generator and the backfill read it. Do **not**
duplicate the roster list in the backfill code.

**Caveats of the roster approach (and why they're safe):**
- **Over-estimate, not under-estimate.** A roster type may not actually get *placed* in a
  given town (space-constrained layouts can drop a secondary building). So the backfill could
  pick a quest whose giver type never physically exists in any town the player visits. The
  consequence is benign: `getAvailableQuestsAt` keys on the building the player stands in, so
  the quest simply never appears (it never corrupts state, never blocks anything). It is an
  *unreachable* quest, not a broken one.
- **Water-only buildings are excluded by design.** `harbormaster` and dockside `warehouse`
  are placed on the shore, not via the rosters, only for coastal towns. The only pool quest
  gated on `harbormaster` is `lost_cargo`. Leaving `harbormaster` out of the roster-derived
  set just means `lost_cargo` won't be backfilled, which is the safe choice (we can't know
  from the roster whether a coastal town exists). Optionally, detect coastal towns from the
  world map water context and add `harbormaster`, but treat this as a stretch, not Phase 1.
- **Union over actual cache when available.** If `sub_maps.townMapsCache` already has towns
  (visited / pre-generated), union their real `buildingType`s **in addition to** the
  roster-derived set. This only ever *adds* certainty; it never removes a roster type.

Net: **sites are reproduced exactly; buildings are reproduced from size rosters (a safe
superset).** The backfilled selection is therefore deterministic per save but may differ from
what a brand-new game on the same seed would have picked (because NewGame had the exact
placed-building set and the backfill has the roster superset). That divergence is acceptable
and is documented under Open questions.

## Trigger condition

Backfill runs **only** when **all** of these hold:
1. A save is being loaded (`loadedConversation` is present), not a brand-new game (New Game
   already seeds quests and must be left alone).
2. `settings.sideQuests` is **absent or empty** (`!Array.isArray(sq) || sq.length === 0`).
   If it has *any* entries (even all `completed`), **do nothing** — never overwrite, reroll,
   or top up existing quests.
3. The world map is available (`loadedConversation.world_map` is a non-empty grid). If the
   map can't be read, skip silently (see fallback).

It must be **idempotent**: once it writes a `sideQuests` array (even an empty one — see
below), the array is now "present" and the trigger won't fire again.

## Where the backfill runs

Mirror the `normalizeParty` precedent rather than inventing a new lifecycle hook.

**Option A (recommended): a settings-hydration effect in `Game.js`.** Add a single
`useEffect` that runs after `settings` is restored (depend on `settings` + `mapHook.worldMap`),
guards on the trigger condition, computes the backfill, and calls
`setSettings(prev => ({ ...prev, sideQuests: backfilled }))`. An effect (not the lazy
`useState` initializer) is correct here because `settings` is owned by `SettingsContext` and
is populated asynchronously by `useGameSession` *after* mount, and because the world map may
hydrate a tick later. Guard with a `useRef` "already attempted" flag so a re-render storm
can't re-run it, and re-check `!settings.sideQuests?.length` inside the effect (so a
concurrent New-Game value still wins).

**Option B: inside `useGameSession`'s restore** (where `setSettings(parsedSettings)` is
called). Cleaner conceptually (it's the hydration site) but `useGameSession` doesn't currently
receive the world map or seed, so it would need new params. Prefer A to keep the dependency
surface small; revisit B if more load-time migrations accumulate (then a shared
`migrateLoadedSettings(settings, worldMap)` pure function called from one place is ideal).

Either way the actual computation lives in a **pure function** (testable, no React), e.g.
`backfillSideQuests({ worldMap, settings })` in `src/game/questEngine.js`, returning the new
quest array. Game.js / useGameSession only wires it up.

## Algorithm (pure `backfillSideQuests`)

1. If `settings.sideQuests?.length` -> return `settings.sideQuests` unchanged (idempotent).
2. `flatTiles = [].concat(...worldMap)`.
3. `availableSites = { cave: flatTiles.some(t => t.poi === 'cave_entrance'), ruins: flatTiles.some(t => t.poi === 'ruins') }` — exact reproduction of NewGame.
4. `availableBuildings` = union of `buildingTypesForSize(tile.townSize || tile.poiType || 'village')`
   over every `tile.poi === 'town'`, PLUS (if present) every real `buildingType` from
   `sub_maps.townMapsCache` town maps.
5. `townCount = flatTiles.filter(t => t.poi === 'town').length;`
   `count = Math.min(4, Math.max(2, townCount))` — exact reproduction of NewGame.
6. Build the same LCG seeded off `parseInt(settings.worldSeed) || 1`.
7. `selected = selectSideQuests({ sites: availableSites, buildings: [...availableBuildings] }, count, rng)`.
8. Return `selected` (already fresh `status:'available'` copies). If `selected.length === 0`
   (a degenerate map with no eligible quests), still return `[]` and persist it, so the
   backfill doesn't re-run every load (idempotency over cosmetic perfection).

## Determinism

Seed source is the **same** `settings.worldSeed` NewGame used, fed through the **same** LCG.
Given identical availability inputs the pick is identical. Availability is deterministic too:
sites from the immutable persisted map, buildings from the immutable `BUILDING_CONFIG` table.
So the same save backfills the same quests every time, regardless of how many towns the player
has visited (because we use rosters, not visited-only caches, as the base). Reusing the world
seed (not a fresh random) is deliberate: re-running the backfill before persistence lands
yields the same result, so a crash between compute and save is harmless.

## Persistence

`setSettings(prev => ({ ...prev, sideQuests }))` mutates the live `settings`, which is already
captured by `useGamePersistence` (`gameSettings: settingsRef.current`) and is part of the save
fingerprint, so the backfilled quests persist on the next autosave / unmount and the trigger
won't fire on subsequent loads. **Do not** add a dedicated immediate save; let the normal save
cadence carry it. One caveat to verify: `performSave` early-returns until `hasAdventureStarted`
and a non-empty conversation exist, so a player who backfills and immediately quits *before
starting* won't persist — acceptable, since the deterministic backfill just recomputes the
same quests next load.

## Back-compat & idempotency

- **Never overwrites.** The empty/absent guard means active or completed quests are untouched;
  there is no reroll, no top-up.
- **Pure view / data separation respected.** Backfill writes only to `settings.sideQuests`
  (game data on `game_settings`); it never touches map grids, never regenerates a town, never
  mutates a loaded map in place (CLAUDE.md rule).
- **Tolerant of old/missing fields.** Reads `tile.poi`, `tile.townSize || tile.poiType ||
  'village'`; unknown size falls back to `village`'s roster; a missing/unparseable world map
  -> skip backfill (leave `sideQuests` absent so a later load with a good map can still try).
- **Idempotent.** Once `sideQuests` is set (even `[]`), the trigger is false forever after.
- **No effect on guests vs auth.** Side quests are mechanical and run for everyone; backfill
  is provider-agnostic.

## Files

Owned by this stream:
- `src/game/questEngine.js` — add pure `backfillSideQuests({ worldMap, settings, townMapsCache })`.
- `src/game/questEngine.test.js` — unit tests (below).
- `docs/OUTSTANDING_ISSUES.md` — one-line backlog entry.

Coordinate (shared files, additive only):
- `src/utils/townMapGenerator.js` — export `buildingTypesForSize(size)` reading the existing
  `BUILDING_CONFIG` (refactor the generator to consume it too, so the table has one reader).
- `src/pages/Game.js` — one `useEffect` + `useRef` guard wiring the pure helper to `setSettings`
  (or `src/hooks/useGameSession.js` if Option B is chosen later).

## Tests (`src/game/questEngine.test.js`)

- **No-op when present**: a save with one `active` quest is returned unchanged (no reroll).
- **No-op when present-but-completed**: array of all-`completed` quests untouched.
- **Backfills when empty/absent**: `undefined` and `[]` both produce a non-empty selection on
  a normal map (towns + cave + ruins).
- **Determinism**: same `{ worldMap, settings.worldSeed }` -> identical quest ids/order across
  two calls.
- **Site gating**: a map with no `ruins` tiles never backfills a ruins-only quest; a map with
  no `cave_entrance` never backfills a cave quest (assert via `isQuestEligible` invariants).
- **Roster-derived buildings**: a world of only `hamlet`s yields only quests whose giver is in
  the hamlet roster (`barn`/`shrine`/`mill`); a `city` present unlocks `magetower`/`library`
  quests.
- **Count scaling**: 1-town map -> 2 quests (clamped min), 5-town map -> 4 (clamped max).
- **Degenerate map**: empty/site-less map returns `[]` without throwing.
- **`buildingTypesForSize` parity**: unit test that it returns exactly the
  `important + secondary + civicHall + jail` types for each size, and the generator still uses
  the same table (guards against drift).

## Non-goals

- **Not** rerolling, topping up, or rebalancing existing quests (only the empty case).
- **Not** generating any town map at load to learn its real buildings (use rosters).
- **Not** matching a fresh New Game's exact pick byte-for-byte (availability is a superset).
- **Not** adding new quest content, new givers, or harbour/coastal detection (stretch only).
- **Not** a UI surface; quests appear through the existing `BuildingModal` / map-reveal paths.
- **Not** a server-side migration; this is a lazy, client-side, on-load backfill.

## Phased rollout

1. **Phase 1 — pure helper + roster export.** Add `buildingTypesForSize`, refactor the
   generator to read it, write `backfillSideQuests`, full unit coverage. No wiring yet.
2. **Phase 2 — wire load path.** Add the `Game.js` hydration effect + ref guard; verify it
   fires once, persists via the normal save, and never fires again. Manual check on a real
   pre-feature save (zero quests -> quests appear at an inn after load).
3. **Phase 3 (optional) — coastal harbour.** If `lost_cargo` is worth it, add water-context
   detection from the world map and conditionally include `harbormaster`.

## Open questions for the human

1. **Roster superset vs exact placement.** Accept that a backfilled quest's giver building
   might not physically exist in any town (quest silently unreachable), or invest in checking
   the actual `townMapsCache` and only offering quests whose giver is *confirmed* placed in at
   least one already-generated town (fewer quests for unexplored maps)? Recommendation: accept
   the superset for Phase 1.
2. **Divergence from New Game.** Backfilled picks may differ from a same-seed fresh game. Fine?
   (Recommendation: yes — determinism per save is what matters.)
3. **Count basis.** Keep `min(4, max(2, townCount))` exactly, or scale down for tiny/old maps?
4. **Empty-result persistence.** Persist `[]` to stop re-running (recommended) vs leave absent
   and retry each load (so a future map fix could seed quests)? Recommendation: persist `[]`.
5. **Where to wire (A vs B).** Single `Game.js` effect now, or invest in a shared
   `migrateLoadedSettings()` in `useGameSession` if more load-time migrations are coming?
