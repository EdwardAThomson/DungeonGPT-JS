# Feature: Explorable forests / hills / mountains

Extend the wilderness-site system (caves/ruins) so **forest**, **hills**, and **mountain**
POIs are also enterable, explorable sub-maps with encounters + loot. The whole framework
(generator, art, entry, populate, render, leave) already exists — this adds three site types.

## Player-facing behaviour
- Walking onto a forest / hills / mountain POI offers **"Enter"** (like caves/ruins).
- Inside is a themed sub-map (open-air for forest/hills, rocky passes for mountain) with the
  same explore loop: move, fight encounters, grab loot, leave at the exit.
- These are **always explorable** (NOT quest-gated) — they're optional exploration content.
  (Quest-gating stays cave/ruins-only unless a quest targets them later.)

## Site types (themes)
- **forest**: open biome ground (grass) + dense tree clusters carved into clearings/paths;
  woodland palette. Decorations: trees, bushes, flowers, mushrooms.
- **hills**: open rolling ground + rocky outcrops; few obstacles, lots of room.
- **mountain**: semi-enclosed rocky passes (more wall/rock than cave but openings to sky);
  stone palette. Decorations: boulders, crystals, snow (if snow biome).

Reuse the existing generator strategies: forest/hills = `structured`/open-air style (like
ruins on ground); mountain = `organic` enclosed (like cave). Bias themes by the world
tile's biome where relevant (e.g. snow mountain).

## Files (owned by this stream — well isolated)
- **`src/utils/siteMapGenerator.js`** — add `forest`, `hills`, `mountain` to `SITE_CONFIG`
  (style + theme + room/decoration params); `generateSiteMap` should accept these `type`s
  (incl. the raw world POI value `mountain`). `siteThemeFor` covers them.
- **`src/utils/siteTileArt.js`** — add the new themes' palettes + decoration sets + sample
  accessors; ground rendering for open-air forest/hills.
- **`src/utils/mapLegend.js`** — `siteLegendGroups` handles the new themes.
- **`src/game/worldMoveController.js`** — add `forest`, `hills`, `mountain` to the `canEnter`
  POI list.
- **`src/hooks/useGameMap.js`** — extend the site branch of `handleEnterLocation` to accept
  `forest`/`hills`/`mountain` (cache key, seed, biome, a themed name per type).
- **`src/pages/SiteMapTest.js`** — add the new types to the debug page's type toggle.
- Reuse as-is: `sitePopulator` (generic content), `SiteMapDisplay`, `MapModal` site branch.

## Coordinate (shared files)
- `useGameMap.js` and `worldMoveController.js` are touched by other streams only lightly;
  keep additions localised to the site branch / canEnter list.
- These POIs are placed on the world map already (`mapGenerator` places forest/mountain/
  hills). No map-gen change needed.

## Tests
- Extend `src/utils/siteMapGenerator.test.js`: each new type yields a valid 20×20 grid,
  full connectivity from the entrance, ≥1 content slot, deterministic per seed, correct
  walkability.
- `worldMoveController` canEnter true for forest/hills/mountain.

## Back-compat
Going-forward + retroactive: any existing map already has these POIs, so they become
enterable on load — fine (the site is generated fresh and cached on first entry). New tile
fields are additive; renderers already tolerate unknown fields.

## Non-goals
Multi-level dungeons, biome-specific mechanics, quest-gating these types (caves/ruins only).

## Verify
`CI=true npx react-scripts test --watchAll=false` and `CI=false npx react-scripts build`
both green. Do NOT commit or push.
