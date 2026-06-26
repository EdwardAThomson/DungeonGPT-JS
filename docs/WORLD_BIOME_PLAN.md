# World Biome Plan — themed-region maps

Status: **Planned.** Phase 2a (POI sprinkle) in progress; 2b/2c not started. Builds on the
world-map art layer (`src/utils/worldTileArt.js`) shipped earlier. See also the maps /
backwards-compatibility rules in `CLAUDE.md`.

## The constraint
A world today is a **10×10 snippet** — one small local region around a starting town
(`generateMapData(10, 10, seed)` in `mapGenerator.js`), base biome `plains`, with
`forest` / `mountain` / `cave_entrance` / `town` as POIs. Because the map is so small,
the coherent unit of biome clustering is **the whole map** — a lone desert tile ringed by
grass reads as a bug.

## Chosen model — themed-region maps (decision B)
Each map **is one biome theme**: grassland (today), desert, snow, woodland, marsh, … The
base biome = the theme; features are theme-appropriate. No "desert-next-to-grass" problem
because there's no grass to abut — only coast transitions at water. (In-map multi-biome
zoning was considered and rejected for now: too much transition logic for a 10×10 snippet.
Minority clusters — e.g. a forest belt inside a grassland map — can be added later as a
refinement.)

A **theme** is a small descriptor that drives several systems:
- **World base biome** (`plains` → `desert` / `snow` / `swamp` / `woodland` / …).
- **Feature palette** — which POIs appear and as what (desert: dunes + rocky outcrops +
  an **oasis** instead of a lake; snow: pine woodland + a peak; etc.).
- **Town palette** (see cascade below).
- **Narration flavor** (passed into prompt context; tone already setting-driven).

## Theme source — the story template (decision)
Each entry in `src/data/storyTemplates.js` gets an optional **`theme`** field; absent →
`'grassland'`, so **all existing templates are unchanged** (back-compat). A desert
adventure ships a desert-themed template. Custom/Freeform games may pick or randomize a
theme. The theme rides along with the settings the game is created from.

## The cascade (what a theme pulls with it)
1. **World generation** — `generateMapData` takes the theme, sets the base biome, and
   picks features from the theme's palette. Going-forward-only + `mapVersion` (below).
2. **Town generation** — the biggest lift. `townMapGenerator` + `townTileArt` must become
   **theme-aware**: ground fill (grass → sand/snow), roof/wall palette, and farmland
   (green fields → oasis/palms, or none). Contained to code we own; going-forward-only.
3. **Story / quests — engine unchanged.** The milestone engine is **theme-agnostic**:
   milestones are typed `item / combat / location / narrative`, none biome-dependent. What
   matches the theme is **flavor** — milestone POI **names/types** and narrative text —
   and those already come from the story template (`customNames` + `milestones`). So we
   author theme-appropriate templates; we do **not** modify `milestoneEngine` /
   `milestoneSpawner`. Narrative milestones' text is template-authored, so desert flavor =
   desert template.

## Backwards compatibility
- **Art** changes are retroactive (pure view) — already true.
- **Generation** changes are going-forward-only: existing saves keep their stored
  `world_map` / cached town maps; never regenerate a loaded map.
- **Renderers tolerate unknown values** — already guarded (unknown biome → plains, unknown
  POI → null), so old saves keep rendering.
- **`mapVersion`** — when theming lands (2b), stamp new maps with a version. The map itself
  is a bare 2D array (JSON-serialized into the save, so array properties don't survive), so
  the version lives on **`game_settings`** (already-persisted JSON), e.g. `mapVersion: 2`.
  Future code can branch-render or migrate from there. *(2a adds no new tile field — only
  new `poi` values the renderer already handles — so it needs no version gate.)*

## Phasing
- **2a — POI sprinkle, no theming (in progress):** place **hills** (clustered, near
  mountains like caves already are) and **ruins** (rare, standalone) on today's grassland
  maps. Additive `poi` values; renderer already handles them; old saves simply lack them.
  Smallest safe step, immediate payoff, no cascade.
- **2b — one themed region end-to-end:** add `theme` to `generateMapData` + `mapVersion`
  on settings; pick **one** theme (likely **desert** or **woodland**) and wire it through
  world gen → theme-aware town gen → art. Prove the whole pipeline on one theme first.
- **2c — theme-tag templates + author themed adventures**, pass theme into narration, then
  fan out to the remaining themes (snow, swamp, …).

## Open questions
- Desert/snow towns: keep farmland (oasis/greenhouse) or drop it? Adobe vs stone palette?
- Do themed maps need theme-appropriate **encounter tables**, or is that purely narration?
- Minority biome clusters within a themed map — worth it later, or keep maps single-theme?
- Should water/coast appear in every theme, or are some landlocked (desert with only an
  oasis)?
