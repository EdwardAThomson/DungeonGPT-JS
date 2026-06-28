# Feature: Side-Quest Givers (wider, themed building set)

Make the world feel **populated** by letting side quests be offered from a broad, thematically
appropriate set of buildings instead of only the tavern/inn. Today every "patron" quest is
keyed to `INN = ['inn','tavern']` and the rest of the pool sprinkles a handful of other givers
(temple/shrine, blacksmith, mill, townhall, bank, jail, harbormaster, etc.). The plumbing for
varied givers **already exists** (`giver.building` is read by `getAvailableQuestsAt` and
gated by `isQuestEligible`); this feature is mostly a **data pass** over the ~28-quest pool to
spread givers across the building roster, plus a small set of NEW quests for buildings that
currently give nothing (guild, fletcher, tailor, warehouse, foundry, barn), all done **without
breaking the map-validation** that silently drops quests whose giver/site/turn-in don't exist.

This is the sibling of the side-quest backfill plan (`docs/archive/SIDE_QUEST_POOL.md`, the
pool-expansion doc): that one grows the *number* of quests; this one governs *who hands them
out* and how to keep every quest selectable. The two touch the same files (`sideQuests.js`,
`questEngine.js`) and the same authoring rules, so they must agree on the giver vocabulary
(the building-commonness table below is the shared contract).

## Audit: how giver assignment works today

- **Quest shape (`src/data/sideQuests.js`).** `Q(id, title, minLevel, description,
  giverBuilding, hook, objective, turnInBuilding, turnInText, rewards)` puts `giverBuilding`
  into `giver.building` (5th arg) and `turnInBuilding` into the trailing `turnin` step's
  `trigger.turnIn.building`. `Courier(...)` has only a deliver step (`deliverTo`), no giver
  turn-in. `giverBuilding`/`turnInBuilding`/`deliverTo` each accept a **string OR an array**
  of building types (e.g. `INN = ['inn','tavern']`, `['temple','shrine']`).
- **Giver != turn-in.** They are independent. Return-to-giver quests pass the SAME array for
  both, so they co-vary; couriers deliver to a DIFFERENT building (e.g. `sealed_letter` is
  given at the inn, delivered to `townhall`).
- **Where givers are read (`src/game/questEngine.js`).**
  - `getAvailableQuestsAt(sideQuests, ctx)` offers a quest at a building when
    `ctx.buildingType ∈ giver.building` (array membership), optional `giver.location` matches
    the town name, and `q.minLevel <= ctx.level` (tiered reveal via `effectivePartyLevel`).
  - `BuildingModal.js` renders that list as the "📜 Rumours & Tasks" section with Accept
    buttons (on the **Visit** tab; shops put Wares on a second tab). Any building type the
    player can open will show quests whose `giver.building` includes it.
- **The crux: map-validation in `selectSideQuests` / `isQuestEligible`.** At new-game time
  (`NewGame.js` ~L350-365) the game computes `availableSites` (cave/ruins from world tiles)
  and `availableBuildings` (the **union of `buildingType`s across every pre-generated town
  map**), then `selectSideQuests({ sites, buildings }, count, rng)` keeps only quests where
  **the giver building exists, every site objective's site type exists, AND every turn-in
  building exists**. A quest that names a building no town on the map happens to have is
  **silently dropped** from selection. So adding a giver building only helps if that building
  TYPE actually spawns, and often enough that the quest isn't perpetually dropped.

## Building roster reality (the load-bearing verification)

Verified against `BUILDING_CONFIG` in `src/utils/townMapGenerator.js`. `availableBuildings`
is the **union over all towns on the map**, so a building "exists" if ANY spawned town has it.
World maps place `targetTowns = max(requiredTowns, 3 + rng·0..3)` towns (≈3-6) and assign
sizes **round-robin over a shuffled `[hamlet, village, town, city]`** (`mapGenerator.js`
~L408-420). Consequences: with **4+ towns every size appears** (so a city, hence city-only
buildings, is guaranteed); with **exactly 3 towns one size is randomly missing** (~25% chance
it's the city → no city-only buildings that game).

| Building type | hamlet | village | town | city | Practical commonness |
|---|:--:|:--:|:--:|:--:|---|
| `inn` | - | ✓ | ✓ | ✓ | **Always** (any village+) |
| `tavern` | - | ✓ | ✓✓ | ✓✓✓ | **Always** |
| `blacksmith` | - | ✓ | ✓ | ✓ | **Always** |
| `alchemist` | - | ✓ | ✓ | ✓✓ | **Always** |
| `shop` | - | ✓ | ✓ | - | **Always** (village/town) |
| `mill` | ✓ | ✓ | ✓ | - | **Always** |
| `stables` | - | ✓ | ✓ | ✓ | **Always** |
| `shrine` | ✓ | ✓ | - | - | Common (hamlet/village) |
| `temple` | - | - | ✓ | ✓✓ | Common (needs town+) |
| `['temple','shrine']` | ✓ | ✓ | ✓ | ✓ | **Always** (pair spans all sizes) |
| `townhall` | - | - | ✓ | ✓ | Reliable (needs town OR city) |
| `apothecary` | - | - | ✓ | ✓ | Reliable (town+) |
| `archives` | - | - | ✓ | ✓ | Reliable (town+) |
| `tailor` | - | - | ✓ | ✓ | Reliable (town+) |
| `warehouse` | - | - | ✓ | ✓✓ | Reliable (town+) |
| `fletcher` | - | - | ✓ | - | Town-only |
| `barn` | ✓ | - | - | - | Hamlet-only |
| `market` | - | - | - | ✓ | **City-only** |
| `bank` | - | - | - | ✓✓✓ | **City-only** |
| `jail` | - | - | - | ✓ | **City-only** |
| `guild` | - | - | - | ✓✓✓ | **City-only** |
| `magetower` | - | - | - | ✓ | **City-only** |
| `library` | - | - | - | ✓ | **City-only** |
| `foundry` | - | - | - | ✓ | **City-only** |
| `harbormaster` | - | (✓) | (✓) | (✓) | **Coastal-only** (water town, village+) |
| `house`/`manor`/`keep` | ✓ | ✓ | ✓ | ✓ | Residential - NOT quest givers |

(✓✓/✓✓✓ = multiple instances; harbormaster is placed on the shore only when the town sits on
water, see the waterfront step in `placeBuildings`.)

**Three commonness tiers fall out of this, and they drive every assignment decision:**

1. **Universal givers** (present on essentially every map): `inn`, `tavern`, `shop`,
   `blacksmith`, `alchemist`, `mill`, `stables`, and the `['temple','shrine']` pair. Safe as a
   quest's SOLE giver/turn-in.
2. **Reliable givers** (present whenever a town or city exists, ~always but not guaranteed on a
   sparse 3-town all-small map): `townhall`, `apothecary`, `archives`, `tailor`, `warehouse`,
   `temple` (alone), `fletcher` (town-only). Safe as sole giver in practice; pair with a
   universal fallback if you want a hard guarantee.
3. **Rare givers** (city-only or coastal-only): `market`, `bank`, `jail`, `guild`, `magetower`,
   `library`, `foundry`, `harbormaster`. A quest gated SOLELY to one of these is selectable
   only on maps that rolled a city (or a coast). That is acceptable for *flavour* quests, but
   such a quest must never be something the pool *relies* on to fill its slots.

## Proposed theme → giver-building mapping

Only building types that actually spawn. Each theme lists its **primary** givers and a
**universal fallback** to fold into the `giver.building` array when we want the quest to remain
selectable on a city-less / coast-less map (see "Fallback givers").

| Theme | Primary givers | Fallback (for rare primaries) | Notes |
|---|---|---|---|
| Patrons & rumours | `inn`, `tavern` | - (universal) | The classic; keep several here. |
| Spiritual / healing / undead | `['temple','shrine']` | - (pair is universal) | Keep pairing temple+shrine. |
| Civic / bounty / law | `townhall`, `jail` | `jail`→`['jail','townhall']` | townhall reliable; jail city-only. |
| Banking / ledgers | `bank` | `['bank','townhall']` | bank city-only. |
| Trade errands / caravans | `shop`, `market`, `warehouse` | `market`→`['market','shop']` | shop universal; market city-only. |
| Coastal / harbour | `harbormaster` | none (intentionally coastal) | Author so it ONLY appears on a coast. |
| Smithing / ore / blades | `blacksmith`, `foundry` | `foundry`→`['foundry','blacksmith']` | blacksmith universal. |
| Hunting / fletching | `fletcher` | `['fletcher','blacksmith']` | fletcher town-only. |
| Cloth / hides | `tailor` | `['tailor','shop']` | tailor town+. |
| Arcane / reagents / rifts | `magetower` | `['magetower','alchemist']` | magetower city-only; alchemist universal. |
| Scholarship / relics / lore | `library`, `archives` | `library`→`['library','archives']` | both town+/city; keep paired. |
| Apothecary / cures | `alchemist`, `apothecary` | - (alchemist universal) | Keep pairing. |
| Rural / pests / livestock | `mill`, `stables`, `barn` | - (mill/stables universal) | barn gives hamlets something. |
| Guild work | `guild` | `['guild','townhall']` | guild city-only; NEW quests. |

## Re-giving the existing ~28 quests for variety

The current pool already uses a decent spread; the changes below are **pure data** (swap the
5th `giverBuilding` arg, and the matching `turnInBuilding` for return-to-giver quests so they
keep co-varying). Goal: every universal/reliable building type hands out at least one quest,
and the inn stops being the obvious hub. Keep `minLevel` and objectives untouched.

- **Keep at inn/tavern (patrons):** `lost_heirloom`, `prove_mettle`, `bards_songbook`,
  `singing_cavern`, `sealed_letter` (courier → townhall). Fine as-is.
- **Already varied, keep:** temple/shrine set (`ruin_menace`, `consecrated_relic`, `tend_sick`,
  `lay_to_rest`); alchemist/apothecary set; `rare_ore`/`stolen_blade` (blacksmith);
  `missing_miners` (`['mill','townhall']`), `vermin_stores` (mill), `spooked_mare` (stables);
  `clear_roads` (townhall), `stolen_ledger` (bank), `catch_cutpurse` (jail); `lost_cargo`
  (harbormaster).
- **Spread the scholar cluster:** `relic_hunt`, `sealed_vault`, `lost_codex`, `field_samples`
  are all `['library','archives','magetower']`/`['library','archives']`. Repoint
  `field_samples` → `archives` (keep), `sealed_vault` → `['archives','library']` (reliable),
  and leave only `relic_hunt` touching `magetower` so the city-flavour stays special.
- **Harden the two city-only arcane quests** (see Fallback): `arcane_reagents` →
  `['magetower','alchemist']` (giver + turn-in), `unstable_rift` keep `magetower` (flagship,
  OK to be city-rare).
- **Trade quests:** keep `caravan_refund`/`overdue_delivery` on `['shop','market']`; add a
  `warehouse` giver to `overdue_delivery`'s acceptable set is optional. `cave_beast` is on
  `['tavern','shop']` - leave it (gives shops a combat quest).

## New quests worth adding (one per under-served giver)

These fill the **giver gap** so opening any common building can surface a task. All are pure
data appended to `SIDE_QUESTS`, authored under the existing completability rules (site-bound
specifics injected into cave/ruins; overworld combat = `enemy:'any'` with `count`; gather only
items that drop: `spider_silk, raw_gems, exposed_minerals, cave_mushrooms, glowing_fungi,
rare_herb, healing_herbs, spirit_essence, pearl, salvaged_goods`).

| New quest (id) | Giver (with fallback) | Objective | Turn-in |
|---|---|---|---|
| `guild_contract` | `['guild','townhall']` | combat any ×4 (bounty board) | giver |
| `hunters_fletching` | `['fletcher','blacksmith']` | gather feathers/`rare_herb` ×3 overworld | giver |
| `tailors_silk` | `['tailor','shop']` | gather `spider_silk` ×3 | giver |
| `warehouse_theft` | `['warehouse','shop']` | item recover from **ruins** (site-bound) | giver |
| `foundry_fuel` | `['foundry','blacksmith']` | gather `exposed_minerals` ×3 (cave) | giver |
| `barn_pests` | `barn` (hamlet) + also accept `mill` → `['barn','mill']` | combat any ×3 (cull) | giver |
| `market_shortfall` | `['market','shop']` | courier deliver to `warehouse`/`shop` | deliver |

Authoring these as **arrays with a universal fallback first-or-second** means even a
small-town map offers them; on a city map they will preferentially read as the richer building
because `getAvailableQuestsAt` shows the quest in EVERY building in the array (so a `['guild',
'townhall']` quest shows at both - acceptable; if you want guild-exclusivity, drop the
fallback and accept city-gating).

## Fallback givers for rare buildings (the selection-safety rule)

The failure mode: a quest whose giver (and, for return-to-giver, turn-in) is a SINGLE
**rare** building (city/coast-only) is dropped by `isQuestEligible` on any map lacking that
building. Three policies, applied per quest:

1. **Flavour-rare (accept dropping):** leave a few marquee quests gated to a single rare
   building (`unstable_rift`@magetower, `catch_cutpurse`@jail, `stolen_ledger`@bank,
   `lost_cargo`@harbormaster). They only appear when the map earns them; that is a *feature*
   (city/port towns feel special). SAFE ONLY because the universal-giver quests guarantee the
   2-4 selection slots always fill (see Tests).
2. **Broaden with a universal/reliable fallback:** for quests we want common, make
   `giver.building` (and matching turn-in) an array led/backed by a universal type:
   `['magetower','alchemist']`, `['guild','townhall']`, `['foundry','blacksmith']`,
   `['market','shop']`, `['library','archives']`. Selection then passes whenever EITHER exists,
   and the quest shows at whichever building the map provides.
3. **Harbormaster stays coastal-only on purpose.** Do NOT give it a landlocked fallback - a
   harbour errand on an inland map reads wrong. Author harbour quests as intentionally
   conditional content (they simply don't appear without a coast).

**Hard guarantee** (the one invariant the whole feature rests on): the pool must always
contain **enough universal-giver, low-`minLevel` quests** that `selectSideQuests` can fill its
`sideQuestCount` (2-4) from universal/reliable givers alone. With the current pool that already
holds (inn, tavern, shop, blacksmith, alchemist, temple/shrine, mill, stables all carry
quests); this feature must not *reduce* universal coverage while spreading givers around.

## Data-only vs engine changes

- **Data-only (the bulk):** every re-giving and every new quest in `src/data/sideQuests.js`.
  No engine change needed - `giver.building`/turn-in already accept arrays, and
  `getAvailableQuestsAt`/`isQuestEligible` already do array membership.
- **No engine change required for MVP.** Optional, deferred niceties:
  - **Per-giver weighting** so selection doesn't over-pick one building's quests (open
    question D-C in the pool doc). Small tweak to `selectSideQuests`'s shuffle.
  - **One-per-giver cap** so a single building never shows 3 Rumours at once in `BuildingModal`
    (cosmetic; could cap in `getAvailableQuestsAt` or at selection).
  Neither is needed to ship wider givers.

## Back-compat

- **Existing saves keep their selected quests verbatim.** Selected side quests are persisted in
  `settings.sideQuests` (the save blob). `selectSideQuests` runs ONCE at new-game time; loaded
  games read the stored array and never re-select. So a save made before this change keeps its
  old givers; nothing migrates, nothing breaks.
- **Pool edits affect new games only**, mirroring the "generation changes are going-forward-
  only" rule for maps. Re-giving a pool quest does not touch any in-flight save's copy.
- **`getAvailableQuestsAt` tolerates the old data shape** (string OR array giver) already, so a
  save whose quest has a string `giver.building` still matches.
- **No new fields, no version stamp needed** - this is additive content within an existing
  schema (same situation as `sideQuests` itself arriving on older saves: absent → empty array,
  handled).

## Tests

Mostly extend `src/game/questEngine.test.js` (and a data sanity test):

- **Selection still fills under varied givers.** Given a realistic availability
  (`buildings` = a town+city union; `sites: {cave, ruins}`), `selectSideQuests(...,count)`
  returns `count` quests, every one passing `isQuestEligible` (giver, sites, turn-ins all in
  the availability set).
- **Startable + completable invariant.** For each selected quest: its `giver.building`
  intersects `availability.buildings`; every `site.type` is in `availability.sites`; every
  `trigger.turnIn.building` intersects `availability.buildings`. (Catches a re-giving that
  forgets to broaden the turn-in to match the giver.)
- **City-less map degrades gracefully.** With `buildings` = village/town set only (NO
  market/bank/jail/guild/magetower/library/foundry/harbormaster), `selectSideQuests` still
  returns a full `count` (proves universal-giver coverage holds and rare quests are merely
  skipped, not crashing).
- **Coastal-only quest is gated.** `lost_cargo` (harbormaster) is eligible WITH `harbormaster`
  in `buildings` and ineligible WITHOUT it.
- **Fallback givers widen eligibility.** A `['magetower','alchemist']` quest is eligible on a
  map with `alchemist` but no `magetower`.
- **Data lint (new `sideQuests.test.js`):** every quest's giver/turn-in building references a
  type that exists in some `BUILDING_CONFIG` roster (no typos like `townHall`); every gather
  `trigger.item` is in the approved drop list; every `site` objective uses `cave`|`ruins`.
- **`getAvailableQuestsAt`** offers a multi-giver quest at EACH building in its array and gates
  by `minLevel`/`effectivePartyLevel` (existing behaviour, add a multi-giver case).

## Non-goals

- **No new building TYPES** in `townMapGenerator.js`. We only assign givers to buildings that
  already spawn. (If a theme has no home - e.g. a "watch house" - it maps to `townhall`/`jail`,
  not a new building.)
- **No changes to combat, dice, site injection, or the milestone engine.** Quest objectives,
  rewards, and the main campaign chain are untouched.
- **No NPC-specific givers** (a named NPC standing in a building handing out a quest). Givers
  remain building-TYPE keyed, as today.
- **No giver-driven economy / reputation.** (Faction rewards on turn-in are the Factions doc's
  Phase 3, not this.)
- **No retroactive change to existing saves' quests** (back-compat: new games only).
- **Harbour/coastal quests are not made landlocked-available.**

## Phased rollout

- **Phase 1 (data spread, MVP):** re-give the existing ~28 quests per the mapping table so
  every universal/reliable building hands out ≥1 quest; broaden the city-only quests we want
  common with universal fallbacks; keep marquee rare quests city/coast-gated. Add the
  selection/lint tests. Pure data + tests. World immediately feels more populated.
- **Phase 2 (fill the giver gaps):** add the NEW quests (`guild_contract`, `hunters_fletching`,
  `tailors_silk`, `warehouse_theft`, `foundry_fuel`, `barn_pests`, `market_shortfall`) so guild,
  fletcher, tailor, warehouse, foundry, and barn all give work. Still pure data.
- **Phase 3 (polish, optional engine):** per-giver weighting + one-quest-per-building cap in
  `selectSideQuests`/`getAvailableQuestsAt` so variety reads well and no building dumps three
  rumours at once. Coordinate with the pool-expansion doc if it lands first.

## Coordinate (shared files - keep changes additive)

- **`src/data/sideQuests.js`** - the only file the pool-expansion (backfill) doc and this doc
  both edit heavily. Agree the giver vocabulary = the commonness table above. Re-givings here
  must not collide with new quests the backfill plan adds; do them in one combined data pass if
  both land together. `Q`/`Courier`/`INN` helpers unchanged.
- **`src/game/questEngine.js`** - **no change for MVP.** Only Phase 3 weighting/cap touches it;
  keep additive and default to today's behaviour so existing tests pass.
- **`src/pages/NewGame.js`** - **no change.** It already derives `availableBuildings` (union
  over towns) and calls `selectSideQuests`; wider givers ride that for free.
- **`src/components/BuildingModal.js`** - **no change.** It already renders Rumours & Tasks for
  any building whose type matches a giver; more giver types just light up more buildings.
- **`src/utils/townMapGenerator.js`** - **read-only reference** (the roster is the contract).
  Do not add buildings here for this feature.

## Open questions for the human

1. **Rare-giver policy:** OK to keep marquee quests (mage tower / jail / bank / harbour)
   city/coast-gated so those buildings feel special, or do you want a fallback on ALL of them so
   every quest can appear anywhere?
2. **Guild exclusivity:** should guild quests be `['guild','townhall']` (appear in any town) or
   pure `guild` (city-only, rarer but more distinctive)?
3. **Multi-giver display:** a `['a','b']` quest currently shows in BOTH buildings. Want a cap so
   each building shows at most N rumours, and should a quest "belong" to its first giver for
   display purposes?
4. **How many quests per map:** keep the current `min(4, max(2, townCount))`, or raise the cap
   now that more buildings can give (e.g. ≈1 per town, up to 5-6)?
5. **New-quest count:** author all seven new giver quests now, or just the highest-value
   (guild, warehouse) first?
6. **Barn/hamlet:** worth a hamlet-only barn quest at all, or do hamlets just rely on their
   shrine/mill givers?

## Verify

`CI=true npx react-scripts test --watchAll=false` and `CI=false npx react-scripts build` both
green. Do NOT commit or push.
</content>
</invoke>
