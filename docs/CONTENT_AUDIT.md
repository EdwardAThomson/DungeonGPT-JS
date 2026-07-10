# Content Integrity Audit

A static audit that cross-checks the game's **authored data** (story templates,
item catalog, building / NPC / encounter / art tables) against the code's
**capability tables**, so silent content failures are caught at author time
instead of surfacing as a blank tooltip, a generic flag sprite, or a quest that
completes off a random loot drop.

It runs two ways:

- **`npm run audit`** — a friendly, always-green report that shows what is
  passing *and* what is failing / warning, grouped by domain. Exit code is always
  0; this is the human view. (`scripts/content-audit.mjs`)
- **Jest CI gate** — `src/audits/contentAudit.test.js` runs the same audit and
  **fails the build on any `error`-severity result**. Warnings are printed but do
  not fail CI.

```bash
npm run audit                                   # friendly report
CI=true npx react-scripts test --watchAll=false src/audits/contentAudit.test.js   # CI gate
```

## error vs warn

- **error** — a real defect that can break play or a reward (a missing item id, a
  quest item reused as a loot drop, a milestone pointing at a POI with no sprite).
  Fails the Jest gate.
- **warn** — a polish / completeness gap that degrades display but does not corrupt
  a save (a catalog entry missing an optional display field). Reported, never
  blocks CI.

The runner turns each check into a `CheckResult` whose `status` is `pass` (no
violations), else `fail` (severity `error`) or `warn` (severity `warn`). See
`src/audits/types.js` for the full contract.

## How it loads app modules

The audit modules live in `src/audits/` and use ESM `import`; the app data they
read (`storyTemplates.js`, `inventorySystem.js`, `data/encounters/*`) is authored
as CRA/Babel ESM `.js`, which plain Node cannot import (no `"type":"module"`, and
`storyTemplates.js` uses webpack's `require.context`). The report script therefore
lets **esbuild** (already a transitive dependency) bundle `src/audits/index.js` —
a pure, JSX-free, dependency-light subgraph — into a temp ESM file and dynamically
imports it. The guarded `require.context` is inert off webpack, so the load matches
what the app sees. Jest runs the same modules directly through its Babel pipeline.

## Check registry

| ID | Domain | Severity | Status | What it verifies |
|----|--------|----------|--------|------------------|
| ITEM-01 | items | error | implemented | Every item id referenced by a milestone `spawn` (item), `trigger.item`, milestone/encounter reward list, or encounter loot table exists in `ITEM_CATALOG`. |
| ITEM-02 | items | error | implemented | Every quest-item id (`trigger.item`) is unique across all templates (no two milestones share one). |
| ITEM-03 | items | error | implemented | No quest-item id appears in any encounter loot table (the "random drop completes the wrong milestone" bug). |
| ITEM-04 | items | warn | implemented | Every `ITEM_CATALOG` entry has the required display fields (`name`, `icon`, `rarity`, `value`, `type`) so nothing renders blank. |
| ITEM-05 | items | warn | implemented | Tracked list of every catalog item whose icon is a borrowed placeholder (`placeholderIcon: true`) so the art debt is visible instead of hidden behind an on-disk lookalike file. Informational; the flag is the opt-in, no allowlist. |
| ITEM-06 | items | error | implemented | No `quest_item` borrows another item's icon (icon file shared with a different id, and this item is not the icon's namesake owner) WITHOUT being tagged `placeholderIcon: true`. Catches a new quest item shipping silently on a sibling's art. Scoped to quest items so legitimately shared non-quest icons never trip it; the namesake owner (e.g. `treasure_map`) is exempt. Passes today (all 12 known borrows are tagged). |
| BLD-01 | buildings | error | implemented | Every milestone `building.type` is a known building type (placed by the generator or in `townTileArt`'s `BUILDING_TYPES`; covers inject-only venues like `barracks`/`workshop`). |
| BLD-02 | buildings | error | implemented | Every milestone `building.location` names a town the campaign generates (its `customNames.towns` or a milestone `location`). |
| BLD-03 | buildings | error | implemented | Every placeable building type has a name generator branch in `assignBuildingName` (else it renders a bare type label). All placeable types are now covered directly; the allowlist is empty and it fails on any NEW gap. |
| BLD-04 | buildings | warn | implemented | Every placeable building type has town tile art (a silhouette in `townTileArt`'s `BUILDING_TYPES`), so it never renders the gable fallback. Currently passes. |
| BLD-05 | buildings | error | implemented | Every shop building type (`BuildingModal`'s `SHOP_BUILDING_TYPES`) has stock in `shopStock.js` (an empty store fails silently). Currently passes. |
| BLD-06 | buildings | warn | implemented | Name-generator coverage debt: lists any placeable type that would render a bare type label. Currently empty (every placeable type has a name-generator branch). |
| NPC-01 | npcs | error | implemented | Every milestone NPC spawn has a non-blank `name` and a resolvable venue (`spawn.location` or `building.location`) — the fields `getMilestoneNpcsForTown` needs, or the NPC is silently skipped. |
| NPC-02 | npcs | error | implemented | Every `talk`-type milestone's `trigger.npc` matches an npc `spawn.id` in the same template (pairs with the Talk-button `npc_talked` mechanic). |
| NPC-03 | npcs | warn | implemented | NPC completeness: `role`/`personality` present, and no raw underscored id leaks into the display `name`. |
| NPC-04 | npcs | warn | implemented | Every milestone NPC venue is a town the campaign generates (else its town is never created and the NPC never matches). |
| NPC-05 | npcs | error | implemented | Talk-button completability: every `talk` milestone's full click-to-complete path is wired — `trigger.npc` set, matching an npc `spawn.id`, and that spawn placed in a venue town the campaign generates. The authoritative Talk-button check; intentionally ties NPC-01/02/04 together and reports only the missing link. |
| NPC-06 | npcs | warn | implemented | Sigrun-class detector: flags a NON-talk milestone that spawns an NPC and whose `text` reads like a conversation objective (talk/speak/win the trust/convince/persuade/ask/meet/seek out), so it will not get a Talk button. Advisory (some are legitimately narrative). |
| MS-01 | milestones | error | implemented | Every milestone has a valid `type` (`item`/`combat`/`location`/`talk`/`narrative`). |
| MS-02 | milestones | error | implemented | Type/trigger agreement: `item`→`trigger.item` matches an item spawn.id; `talk`→`trigger.npc` an npc spawn.id; `location`→`trigger.location` a poi spawn.id; `combat`→`trigger.enemy` an enemy spawn.id. Combat is verified structurally only (see Approximations). |
| MS-03 | milestones | error | implemented | `requires` references exist in the same template and form a DAG (no cycles, no dangling ids). |
| MS-04 | milestones | error | implemented | Campaign is completable: every milestone reachable through `requires`, final milestone in particular reachable, no orphans. |
| MS-05 | milestones | error | implemented | No null/undefined in required milestone fields (`id`/`text`/`type` always; type-appropriate `trigger` field + `spawn` for mechanical types). |
| MS-06 | milestones | warn | implemented | Flags a non-first milestone with empty `requires` (co-active from turn 1) — usually intentional parallel design, so advisory. |
| MS-07 | milestones | error | implemented | A `minLevel` gate must be reachable on the main-quest path: the XP a party is guaranteed at the gate (cumulative completion XP of every `requires` ancestor, plus the milestone's own boss `encounter.rewards.xp` granted before the gate fires) must meet `XP_THRESHOLDS[minLevel-1]`. Scoped to fresh-start campaigns (`levelRange[0] <= 1`, where the 0-XP baseline is provable); continuation chapters carry unbounded prior XP and are skipped. Side-quest XP is optional and not counted. Catches a finale gated above its own reachable level, which returns `level_blocked` and silently soft-locks the campaign. |
| ENC-01 | encounters | error | implemented | Every encounter reward item id (in any encounter template's `rewards.items`) exists in `ITEM_CATALOG`. (Encounters-domain restatement of the encounter half of ITEM-01.) |
| ENC-02 | encounters | error | implemented | Every `template` key in every weighted encounter table (`encounterTables.js`) resolves to a defined `encounterTemplates` entry (`none` exempt); no dangling table keys. |
| ENC-03 | encounters | warn | implemented | Every encounter has `name`, a visual (`image` OR `icon`), and a valid `difficulty`; environmental encounters carry a `climate` tag (climate-neutral ones allowlisted). |
| ENC-04 | encounters | error | implemented | Rewards are always STATED: a fully-absent `rewards` field renders a blank reward area (`result.rewards` gate + `generateLoot` returns null), so absence is a violation; an explicit object (even `{}`) is a stated "none" and passes. |
| ENC-05 | encounters | error | implemented | When an encounter defines a `consequences` block, every roll tier (criticalSuccess/success/failure/criticalFailure) has non-blank outcome text. |
| ENC-06 | encounters | warn | implemented | Any `climate` tag is from the valid `hot`/`cold`/`any` vocabulary (a typo never matches the selector), and `suggestedActions` is a non-empty list. |
| MAP-01 | map | error | implemented | Every milestone POI id (every `type:'poi'` spawn) has an ARRIVAL image in `POI_IMAGES` (`worldMoveController.js`). Passes via real coverage (all 16 milestone POIs now ship arrival art); the debt allowlist is empty and it fails on any NEW POI shipped without arrival art. |
| MAP-02 | map | warn | implemented | Every milestone POI id has a DISTINCTIVE world sprite in `poiSprite` (`worldTileArt.js`) rather than the generic milestone flag. Passes via real coverage (all 17 milestone POIs now ship a dedicated sprite); it warns on any NEW POI added without a `poiSprite` case, and the generic flag stays as the fallback for unknown ids. |
| MAP-03 | map | error | implemented | Every biome the production generator can stamp (`plains`/`desert`/`snow`/`water`/`beach`) has a `getEncounterBiome` case (else it collapses to the plains table) AND `biomeBackground` tile art. Theme parity across plains/desert/snow. |
| MAP-04 | map | warn | implemented | Every milestone POI has an authored display `name`, so arrival never falls back to a title-cased raw id. Complements DISP-01. |
| DISP-01 | display | error | implemented | No player-facing authored label is blank/null/undefined or a raw underscored id: encounter `name`s, and the raw-id angle on milestone POI display names. (NPC names → NPC-03; item names → ITEM-01/04; POI-name absence → MAP-04.) |
| DISP-02 | display | warn | implemented | Display-side companion to ENC-04/ENC-05: flags an encounter whose `rewards` object is present but has nothing to grant (no xp/gold/items/healing), so the reward section can render an empty area. |

### Current findings

- **ITEM-04** surfaces **87 warnings**, every one of them the single field `type`.
  All 87 items have `name`/`icon`/`rarity`/`value`; `type` is absent on typeless
  consumable / loot / lore entries by design (it drives equip behavior, not
  rendering). This is the intended demonstration of the non-blocking warn path. If
  the maintainer treats typeless items as acceptable, narrow `REQUIRED_DISPLAY_FIELDS`
  in `src/audits/items.js` to `name`/`icon`/`rarity`/`value` (all of which pass) —
  no other change needed.
- **ITEM-05** surfaces **12 warnings**, one per campaign quest item that borrows a
  lookalike sibling's icon until dedicated art ships (`goblin_scouts_map`,
  `hidden_map`, `caravan_ledger`, `sun_kings_star_chart`, `frostbound_ledger`,
  `famine_winter_saga`, `moorland_herbs`, `mutated_specimen`, `automaton_control_rod`,
  `stolen_aether_blueprints`, `cult_journal`, `forbidden_ritual_text`). This is the
  point of the check: the borrowed files exist on disk, so ITEM-01/04 and
  `artIntegrity` stay green and the debt was previously invisible. The list clears as
  each dedicated `.webp` from docs/IMAGE_GENERATION_PROMPTS.md lands (generate art,
  repoint `icon`, drop the `placeholderIcon` flag). Non-blocking.
- **ITEM-06** surfaces **0 violations** every one of those 12 borrows is tagged
  `placeholderIcon: true`, so the error-severity untagged-borrow gate is green. It
  fails the moment a NEW quest item is added pointing at a sibling's icon without the
  flag, forcing the author to either ship dedicated art or explicitly tag the debt
  (which moves it to the ITEM-05 list).
- **buildings / npcs / milestones**: every `error`-severity check passes today
  (0 failures) with no remaining building debt: every placeable building type now
  has a name-generator branch, so BLD-03 passes via real coverage (empty allowlist)
  and BLD-06 warns nothing. All milestone `requires` graphs are sound DAGs and every
  campaign is completable; all NPC spawns and talk-milestone references resolve.
  **NPC-05** passes: every `talk` milestone (including the fixed Warden Sigrun
  objective in `frozen-frontier-t1`, plus the two retyped talk beats below) is fully
  click-completable — its `trigger.npc` matches a placed npc spawn in a generated
  town, so the Talk button renders.
- **NPC-06** surfaces **0 warnings**. The two former mis-typed-talk candidates were
  retyped from `type: 'narrative'` (null trigger) to `type: 'talk'` with a
  `trigger.npc` matching their spawn id, so they now render a Talk button and are
  guarded by NPC-05: `heroic-fantasy-t2` milestone 2 (*Convince the Thornfield
  Guard*, Captain Aldric) and `desert-expedition-t1` milestone 2 (*Win the trust of
  the well-keeper*, Keeper Najwa).
- **BLD-06** surfaces **0 warnings** — every placeable building type has a
  name-generator branch, so nothing renders a bare type label.
- **MS-06** surfaces **12 warnings** — non-first milestones with empty `requires`
  that are co-active from turn 1. These are the templates' intended parallel opening
  objectives (e.g. find-the-map AND meet-the-captain). `frozen-frontier-t2` was
  brought to house style (two co-active openers, ids 1 and 2, then id 3 gates on
  `[1, 2]`), so it no longer opens with three co-active milestones. All are advisory.
- **encounters**: every `error`-severity check passes (0 failures). All 48 encounter
  templates have `name`/`image`/`icon`/`difficulty`/`rewards`/`consequences`/
  `suggestedActions`; all 108 reward item ids resolve in `ITEM_CATALOG`; no encounter
  table has a dangling `template` key; every `consequences` block fills all four
  tiers; the only `climate` tags (`heat_wave`→`hot`, `cold_snap`→`cold`) are valid.
  ENC-03 surfaces **0 warnings** after the climate-neutral allowlist (the four
  intentionally-untagged environmental hazards).
- **map / display**: every `error`-severity check passes (0 failures). MAP-01 passes
  via REAL coverage: all 16 milestone POIs now ship a dedicated arrival `.webp` in
  `POI_IMAGES` (`worldMoveController.js`), so the debt allowlist is empty and MAP-01
  fails on any NEW art-less POI; MAP-03 confirms all five producible biomes have both a
  `getEncounterBiome` case and tile art (the snow/desert cases are present, closing the
  collapse-to-plains gap); MAP-04 and DISP-01 pass because every milestone POI carries an
  authored `name` and every encounter `name` is a human-readable label. MAP-02 now
  passes via REAL coverage: all 17 milestone POIs ship a dedicated `poiSprite` builder
  keyed to their spawn id (`MILESTONE_POI_SPRITES` in `worldTileArt.js`), so none fall
  through to the generic flag; it warns only if a NEW POI is added without a sprite.

### Known accepted gaps / debt

Pre-existing content gaps that `error`-class checks explicitly allowlist so the CI
gate stays green on today's debt while still failing on any NEW regression. Burn
these down and shrink the allowlist.

- **MAP-01 POI arrival-art debt: RESOLVED.** All **16** milestone POIs now ship a
  dedicated arrival `.webp` in `POI_IMAGES` (`worldMoveController.js`), so MAP-01 passes
  via real coverage and `POI_ARRIVAL_IMAGE_DEBT_ALLOWLIST` (`src/audits/map.js`) is now
  an empty frozen ratchet. It fails the moment a NEW milestone POI ships without arrival
  art (the single most important guard: no new location may silently ship art-less). POI
  arrival art is generated externally (a Gemini image pipeline; prompts in
  `docs/IMAGE_GENERATION_PROMPTS.md`); to add a new POI, drop its `.webp` into
  `POI_IMAGES` and mirror the key in `POI_ARRIVAL_IMAGE_KEYS` (`src/audits/context.js`).

- **MAP-02 POI world-sprite debt: RESOLVED.** `poiSprite` (`worldTileArt.js`) now
  draws a distinctive world-map sprite for every authored milestone spawn id via a
  per-id builder in `MILESTONE_POI_SPRITES` (all **17**: the 16 above plus
  `goblin_hideout`), in addition to the generic tile kinds
  (`town`/`forest`/`mountain`/`hills`/`cave_entrance`/`ruins`). The generic red
  milestone flag is kept as the fallback for any unknown/absent milestone POI id
  (renderer-tolerance), so MAP-02 now passes via real coverage and warns only when a
  NEW milestone POI ships without a sprite. Coverage is mirrored by `POI_SPRITE_TYPES`
  (`src/audits/context.js`); to add a new POI, add a builder + `MILESTONE_POI_SPRITES`
  entry and mirror the id there.

- **NPC-06 mis-typed-talk candidates** (advisory, no allowlist — it is a `warn`).
  Resolved: the two authored milestones that spawned an NPC and read like a
  conversation objective but were `type: 'narrative'` with a null trigger have been
  retyped to `type: 'talk'` with a `trigger.npc` matching the spawn.id, so they now
  render a Talk button (button-only completion, the Warden Sigrun precedent) and are
  guarded by NPC-05: `heroic-fantasy-t2` milestone 2 (*Convince the Thornfield Guard*,
  Captain Aldric) and `desert-expedition-t1` milestone 2 (*Win the trust of the
  well-keeper*, Keeper Najwa). NPC-06 stays as the advisory surface for any FUTURE
  narrative-typed milestone that reads like a click-to-talk objective.

- **ENC-03 climate-neutral env. encounters** (`CLIMATE_NEUTRAL_ALLOWLIST` in
  `src/audits/encounters.js`). Four environmental encounters are intentionally
  climate-neutral (fire in every climate) and so are deliberately untagged:
  `sudden_storm`, `thick_fog`, `earthquake`, `strange_lights`. They are allowlisted
  so the ENC-03 climate advisory only surfaces a NEW environmental encounter that
  forgot to consider climate. This is a `warn`, so it never blocks CI regardless.

### Approximations / introspection limits

- **MS-07 reachability is main-quest-only, fresh-start-only**: side-quest and random-
  encounter XP are optional, so MS-07 counts ONLY the main-quest milestone chain
  (`requires` ancestors + the milestone's own pre-gate boss XP). It also asserts a gate
  unreachable ONLY for fresh-start campaigns (`levelRange[0] <= 1`), where the party's
  starting XP is provably 0. Continuation chapters (tier 2+) enter with unbounded
  carried XP, so main-quest data alone cannot prove their gates unreachable; those
  gates are skipped rather than flagged. Consequence: a tier-2+ finale gated above its
  own main-quest reachable level is NOT caught here (it is covered by the balance-sim
  world-XP-budget lint, `progressionLint.test.js` guard (d)); a fresh-start finale gated
  above level 1 with too little main-quest XP IS caught.
- **MS-02 combat bosses**: there is no global boss/enemy registry to validate a
  combat milestone against — a boss is authored inline in the milestone's `spawn`
  (+ its `encounter` block). MS-02 therefore checks combat coherence *structurally*
  (`trigger.enemy` resolves to an enemy `spawn.id` in the same template), not against
  a canonical bestiary. A boss id misspelled *consistently* in both `trigger` and
  `spawn` would pass; catching that needs a boss catalog the audit does not yet have.
- **Maintained mirrors** (`src/audits/context.js`): `BUILDING_CONFIG`, the
  `assignBuildingName` if-chain, and `BuildingModal`'s `SHOP_BUILDING_TYPES` are
  module-private (or JSX-bound), so the audit mirrors the three small lists
  (`PLACEABLE_BUILDING_TYPES`, `BUILDING_NAME_GENERATOR_TYPES`, `SHOP_BUILDING_TYPES`)
  with a comment pointing at each source, rather than importing them (which would
  either not export the data or pull JSX into the esbuild bundle). Keep them in sync
  when those tables change.
- **Map/display maintained mirrors** (`src/audits/context.js`): the world-render
  capability keys are equally un-importable — `getEncounterBiome`'s if-chain is
  module-private (`encounterGenerator.js`), `POI_IMAGES`/`NICE_NAMES` are
  function-local consts inside `buildPoiEncounter` (`worldMoveController.js`), and
  `biomeBackground`/`poiSprite` are exported render FUNCTIONS whose branch keys
  cannot be read by importing the function. So the audit mirrors five small key
  lists (`PRODUCIBLE_BIOMES`, `ENCOUNTER_BIOME_CASES`, `BIOME_ART_CASES`,
  `POI_SPRITE_TYPES`, `POI_ARRIVAL_IMAGE_KEYS`) with a source-pointing comment
  each. Keep them in sync when those tables change. (`encounterTables.js` is pure
  data and IS imported directly for ENC-02.)
- **Producible biomes = production generator only** (MAP-03). `PRODUCIBLE_BIOMES`
  lists what `generateMapData` (fixed 10x10, no edge constraints) can stamp:
  `plains`/`desert`/`snow`/`water`/`beach`. `woodland` is a latent land biome (it
  appears in `applyEdgeConstraints`' `LAND_BIOMES` set) but no generator sets
  `landBiome` to it today, and edge constraints are debug-only
  (`worldAssembler.js`, `/debug/large-world`), so it is treated as not currently
  producible. NOTE the latent gap: `biomeBackground` already renders `woodland`
  but `getEncounterBiome` has no `woodland` case, so if it ever becomes producible
  its encounters would collapse to the plains table — add it to `PRODUCIBLE_BIOMES`
  when that day comes and MAP-03 will flag the missing case.

## How to add a check

1. Pick the domain module in `src/audits/` (or add a new one and register it in
   `src/audits/index.js`'s `DOMAIN_CHECKS`). Follow the fully-worked pattern in
   `src/audits/items.js`.
2. Author a `Check` object — `{ id, domain, title, severity, run(ctx) }` — and push
   it onto the module's default-exported array. `run(ctx)` returns `Violation[]`
   (`{ message, location }`); an empty array is a pass. Give every violation a
   message that names the offending id and a `location` that points at the source.
3. If the check needs data not yet on the context, add it in
   `src/audits/context.js` (keep it pure — data only, no React/DOM/network).
4. Add a row to the table above (flip the domain's rows from `planned` to
   `implemented`).

The check then auto-appears in `npm run audit` and is enforced by the Jest gate
if its severity is `error`. Nothing else needs wiring.
