# Wilderness Sites (explorable POI sub-maps)

Extend the sub-map system beyond towns so the player can enter and explore wilderness
POIs. Towns already have interior sub-maps; this reuses that spine for `cave_entrance`,
`ruins` (first), then `forest` / `hills` / `mountain`.

## Decisions (2026-06)
- **Content**: combat encounters + loot/resource nodes + milestone objectives. (Not
  flavor-only — exploration must pay off.)
- **Scope/order**: caves + ruins first (the two enclosed, dungeon-like types), then the
  open types.
- **Architecture**: one **generic site generator** parameterized per type + one themed
  tile-art module. Cheaper, consistent, fast to extend.

## What we reuse (town sub-map spine)
- `canEnter` gating in `worldMoveController.js` (extend the allowed POI list).
- `sub_maps` persistence in `saveController.js` + `useGamePersistence.js` (extend payload).
- Lazy, seed-deterministic generation + caching on first visit; cache key by `type+coords`
  (sites have no name, unlike towns keyed by `townName`).
- In-map movement + leave-site handlers (mirror `handleEnterLocation` / `handleLeaveTown`).
- `EncounterModal` "Enter {name}" button.

## What we build
1. `src/utils/siteMapGenerator.js` — `generateSiteMap(type, name, entryDirs, seed, opts)`.
   Rooms + corridors on a 20×20 canvas; **organic** blob rooms for caves, **structured**
   rectangular rooms for ruins. Returns `{ mapData, width, height, type, theme,
   entryPoint, entrances, contentSlots, siteVersion }`. Walls block; floor/rubble/entrance
   walkable. `contentSlots` = reserved room centres tagged for later population.
2. `src/utils/siteTileArt.js` — programmatic SVG tiles (matches townTileArt/worldTileArt):
   cave = dark rock + ground + pools/crystals; ruins = broken masonry + flagstone +
   rubble/columns/overgrowth. Autotiled walls. Content markers (encounter/loot/objective).
3. `/debug/site-map` — preview page: type, seed, style toggles + tile-count readout.

## Phasing
- **Phase 1 (this pass): generator + art + debug page.** Iterate on the look. No save or
  content wiring yet — landlocked from the live game.
- **Phase 2: in-game entry + persistence.** Extend `canEnter`, add a site cache to
  `sub_maps`, mirror enter/leave, render via a site display component. Stamp `siteVersion`
  for back-compat (generation is going-forward-only, art is retroactive — see CLAUDE.md).
- **Phase 3: content population.** `populateSite(site, seed, ctx)` fills `contentSlots`
  with encounters (reuse encounter tables by `poiType`), loot/resource nodes (inventory
  system), and milestone objectives (reuse `milestoneSpawner` so a quest step can live in
  a cave/ruin, e.g. "find the rod in the Tinker-Row workshop" → a site objective).

## Back-compat
- New POI sub-maps only generate on first entry for existing saves; untouched POIs are
  unaffected. `siteVersion` on the cached site payload lets future gen changes branch.
- Renderers tolerate unknown tile fields (fall back to floor/wall) so older cached sites
  still render after art upgrades.
