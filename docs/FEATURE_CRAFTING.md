# Feature: Crafting & Alchemy

Give wilderness **material loot** a use beyond selling, and give the **blacksmith** and
**alchemist** buildings depth. Today the party hauls home beast hide, ore, crystals, herbs
and venom from cave/ruins/forest/hills/mountain sites (`sitePopulator.js` loot pools) and
the only thing to do with it is dump it at a shop for half value. Crafting lets the party
spend those materials (plus a small gold fee) to **make** gear and potions at the right
station, often cheaper than buying and sometimes producing items no shop sells at all.

This mirrors the shop stream (`docs/FEATURE_SHOPS.md`): a pure controller
(`craftingController.js`), a data file (`recipes.js`), a new section in `BuildingModal`,
and `onCraft` threaded the same way `onBuy`/`onSell` already are.

## Player-facing behaviour

- At **blacksmith** and **alchemist** buildings, the building modal shows a **"Crafting"**
  section below "Wares", listing the recipes for that station.
- Each recipe row shows: the **output** item (name + icon), its **ingredients** (material
  name x count), any **gold fee**, and a **Craft** button.
- A row is **craftable** only when the party holds every ingredient in the required count
  **and** can afford the gold fee **and** meets the recipe's `minLevel`. Otherwise the
  button is disabled and the row shows what is missing (greyed ingredients / "Requires
  level N").
- Clicking **Craft** removes the ingredients from the lead hero's inventory, deducts the
  gold fee from pooled party gold, and adds the output item to the lead hero's inventory.
  A trade-style message confirms ("Crafted Hide Armor.").
- The blacksmith crafts **gear** (weapons/armour); the alchemist crafts **potions/cures**.
  Stations never share a recipe list.
- Party gold is shown in the section header (same as Wares).

## Pricing / economy balance

The design rule: **crafting an item should cost less than buying it**, where "cost" is the
opportunity cost of the ingredients (what you would have got selling them at half value)
plus the recipe's gold fee. That makes crafting the rational way to use loot, without making
shops pointless (shops are instant, need no materials, and stock the buyable staples).

- **Buy price** of an output = `ITEM_CATALOG[output].value` (the same number shops charge).
- **Material sell value** = `round(value * 0.5)` (same `sellPrice` formula as shops).
- For each recipe below, `sum(material sell value) + goldFee` is kept **meaningfully under**
  the output's buy price (target ~40-60% of buy price), so crafting saves gold.
- Two outputs are **unbuyable anywhere** (`hide_armor` is wilderness-loot-only;
  `dragonscale_plate` has no source at all today, per `docs/EQUIPMENT_ITEMS.md` "Deferred").
  Crafting becomes their intended acquisition path, which is the single biggest reason to
  add the system.
- The gold fee exists so crafting is never strictly free (avoids "infinite value from junk
  loot") and gives the gold sink a second outlet besides shopping and resurrection.

Crafting is **not** a strict upgrade over shops: shops require no materials and no level,
so early on (no loot yet) you still buy; once the party is loot-rich, crafting wins.

## Recipe data model

A recipe is a plain object in `src/data/recipes.js`:

```js
{
  id: 'hide_armor',            // unique recipe id (usually == output key)
  output: 'hide_armor',        // ITEM_CATALOG key produced (must already exist — no new art)
  station: 'blacksmith',       // 'blacksmith' | 'alchemist'
  inputs: [                    // material keys + counts consumed
    { key: 'beast_hide', count: 2 },
    { key: 'hard_leather', count: 1 }
  ],
  goldCost: 0,                 // optional, default 0
  minLevel: 1                  // optional, default 1 (gates on effectivePartyLevel)
}
```

- `inputs` are **existing `ITEM_CATALOG` keys** (the wilderness materials). `count` defaults
  to 1 if omitted.
- `output` is an **existing `ITEM_CATALOG` key** (reuses its name/icon/value/effect/bonus —
  **no new images, no new catalog entries**).
- `station` decides which building shows the recipe.
- `goldCost` (optional) is the gold fee; `minLevel` (optional) gates by party level via
  `effectivePartyLevel(party)` from `questEngine` (same helper `BuildingModal` already uses
  for quest gating).

Data shape stays a flat array; `getRecipesForStation(station)` filters it. No new art, no
new items — every `output` and every `input` is a key that already exists in `ITEM_CATALOG`.

## The material catalogue (what's already there)

Wilderness materials the loot pools drop (`sitePopulator.js` LOOT/HOARD_BONUS + monster
drops), with catalog `value` / `sellPrice`:

| key | name | value | sell | typical source |
|---|---|---|---|---|
| `beast_hide` | Beast Hide | 20 | 10 | forest, hills |
| `wolf_pelt` | Wolf Pelt | 15 | 8 | forest, wolf drops |
| `bear_pelt` | Bear Pelt | 40 | 20 | mountain, bear drops |
| `hard_leather` | Hardened Leather | 15 | 8 | common loot |
| `exposed_minerals` | Exposed Minerals | 20 | 10 | cave, hills, mountain |
| `rare_ore` | Rare Ore | 60 | 30 | hills, mountain |
| `raw_gems` | Raw Gemstones | 75 | 38 | cave |
| `mountain_crystal` | Mountain Crystal | 80 | 40 | mountain, hills |
| `storm_crystal` | Storm Crystal | 200 | 100 | mountain |
| `dragon_scale` | Dragon Scale | 1000 | 500 | cave hoard / boss |
| `healing_herbs` | Healing Herbs | 20 | 10 | forest |
| `mountain_herbs` | Mountain Herbs | 15 | 8 | hills |
| `rare_herb` | Rare Herb | 40 | 20 | cave/forest |
| `rare_flower` | Rare Flower | 45 | 23 | forest |
| `bat_guano` | Alchemical Reagent | 10 | 5 | cave |
| `spider_venom` | Spider Venom | 35 | 18 | spider drops |
| `venom_sac` | Venom Sac | 45 | 23 | spider drops |
| `fairy_dust` | Fairy Dust | 100 | 50 | forest hoard |

Outputs (all existing keys; values/icons reused):

| output | name | value (buy) | station | sold in a shop today? |
|---|---|---|---|---|
| `shortsword` | Shortsword | 25 | blacksmith | yes |
| `silver_dagger` | Silver Dagger | 100 | blacksmith | yes |
| `poisoned_dagger` | Poisoned Dagger | 75 | blacksmith | no |
| `studded_leather` | Studded Leather | 90 | blacksmith | yes |
| `hide_armor` | Hide Armor | 80 | blacksmith | **no (loot-only)** |
| `scale_mail` | Scale Mail | 350 | blacksmith | yes |
| `magic_weapon` | Enchanted Blade | 500 | blacksmith | yes |
| `dragonscale_plate` | Dragonscale Plate | 1500 | blacksmith | **no (no source today)** |
| `herbal_remedy` | Herbal Remedy | 15 | alchemist | no |
| `healing_potion` | Healing Potion | 50 | alchemist | yes |
| `greater_healing_potion` | Greater Healing Potion | 150 | alchemist | yes |
| `antidote` | Antidote | 25 | alchemist | yes |
| `medicine_kit` | Medicine Kit | 45 | alchemist | no |
| `poison_vial` | Poison Vial | 45 | alchemist | yes |

## Example recipes (~14, all real keys)

`craft cost` below = `sum(ingredient sell value) + goldCost`, to compare against `buy`.

### Blacksmith (gear)

| output | inputs | gold | minLvl | craft cost | buy | save |
|---|---|---|---|---|---|---|
| `shortsword` | exposed_minerals x2 | 5 | 1 | 25 | 25 | ~0 (starter) |
| `silver_dagger` | rare_ore x1, exposed_minerals x1 | 20 | 1 | 60 | 100 | 40 |
| `poisoned_dagger` | rare_ore x1, venom_sac x1 | 10 | 2 | 63 | 75 | 12 |
| `studded_leather` | hard_leather x3, rare_ore x1 | 10 | 1 | 64 | 90 | 26 |
| `hide_armor` | beast_hide x2, hard_leather x1 | 0 | 1 | 28 | 80 (no shop) | use for hide |
| `scale_mail` | rare_ore x4, beast_hide x2 | 50 | 4 | 190 | 350 | 160 |
| `magic_weapon` | rare_ore x1, mountain_crystal x1, fairy_dust x1 | 100 | 4 | 220 | 500 | 280 |
| `dragonscale_plate` | dragon_scale x2, rare_ore x4, storm_crystal x1 | 200 | 7 | 1420 | 1500 (no source) | unlocks +4 |

### Alchemist (potions/cures)

| output | inputs | gold | minLvl | craft cost | buy | save |
|---|---|---|---|---|---|---|
| `herbal_remedy` | mountain_herbs x2 | 0 | 1 | 16 | 15 | ~0 (starter) |
| `healing_potion` | healing_herbs x2 | 5 | 1 | 25 | 50 | 25 |
| `greater_healing_potion` | healing_herbs x3, rare_herb x1 | 20 | 3 | 70 | 150 | 80 |
| `antidote` | mountain_herbs x2, bat_guano x1 | 5 | 1 | 26 | 25 | ~0 |
| `medicine_kit` | healing_herbs x1, rare_herb x1, hard_leather x1 | 5 | 2 | 43 | 45 | small |
| `poison_vial` | spider_venom x1, venom_sac x1 | 5 | 1 | 46 | 45 | ~0 (uses spider loot) |

Notes on intent:
- **`shortsword` / `herbal_remedy` / `antidote` / `poison_vial`** sit near break-even on
  purpose: they are early "tutorial" recipes that turn near-worthless loot
  (`exposed_minerals`, `mountain_herbs`, spider parts) into something usable, not a gold
  play. The win is the **use for the loot**, not the margin.
- **`hide_armor`** is the headline early recipe: `beast_hide` (sells for 10) is the most
  common forest/hills drop and otherwise dead weight; two of them plus scrap leather make
  an 80-value +2 armour the smith won't sell.
- **`scale_mail` / `magic_weapon` / `dragonscale_plate`** are the mid/late sinks for
  `rare_ore`, crystals, `fairy_dust` and especially `dragon_scale` (a very-rare drop that
  currently has no use at all). `dragonscale_plate` is the one piece of `EQUIPMENT_ITEMS.md`
  "Deferred" gear with no source: crafting is its intended unlock, gated to level 7.

Final input/count/gold values are a balancing pass for implementation; the table is the
starting point, not frozen.

## Files (owned by this stream)

- **NEW `src/data/recipes.js`** — `RECIPES` array (above) + `getRecipesForStation(station)`.
  Existing catalog keys only; no new items, no new art.
- **NEW `src/game/craftingController.js`** — PURE, testable transaction logic, mirroring
  `shopController.js` purity and signatures:
  - `getMaterialCount(party, key)` → total units of a material held across the lead hero's
    inventory (sum of `quantity`).
  - `canCraft(party, recipe)` → `{ ok, reason }` where `reason` is one of
    `missing_materials` | `insufficient_gold` | `level_too_low` | `unknown_recipe` | null.
  - `craftItem(party, recipe)` → `{ party, ok, reason }`: on success returns a **new** party
    with each input removed (`removeItem` per count), the gold fee spent from pooled gold
    (lead hero first, exactly like `shopController.buyItem`), and the output added to the
    lead hero (`addItem`). Never mutates the input party.
  - Helpers: `craftGoldCost(recipe)`, `recipeOutputName(recipe)`.
  - Reuse `addItem` / `removeItem` / `addGold` / `ITEM_CATALOG` from `inventorySystem`
    (read-only) and `effectivePartyLevel` from `questEngine` for the level check.
- **`src/components/BuildingModal.js`** — a **"Crafting"** `modal-section`, rendered for
  `blacksmith` / `alchemist` only, placed directly after the existing Wares section. Reuses
  the Wares row styling. Each row: output name/icon, ingredient list (greyed when the party
  lacks the count), gold fee, and a Craft button disabled via `canCraft`. A local
  `craftMessage` state mirrors the existing `tradeMessage` pattern.

## Coordinate (shared files — additive only)

The crafting handler threads **exactly** like `onBuy`/`onSell` (see `docs/FEATURE_SHOPS.md`
"Coordinate"):

- **`src/pages/Game.js`** — add an `onCraft(recipe)` handler next to the existing
  `onBuy`/`onSell` (Game.js ~line 1037):
  ```js
  onCraft={(recipe) => {
    const result = craftItem(selectedHeroes, recipe);
    if (result.ok) setSelectedHeroes(result.party);
    return result;
  }}
  ```
  Import `craftItem` from `../game/craftingController` next to the existing
  `import { buyItem, sellItem } from '../game/shopController'`. Also fire the existing
  milestone hook if relevant: `checkMilestoneEvent({ type: 'item_acquired', itemId: recipe.output }, selectedHeroes)` (item-milestones already trigger on acquisition; reuse, don't invent a new event).
- **`src/components/GameModals.js`** — accept `onCraft` in props and pass it to `MapModal`
  (alongside `onBuy`/`onSell`, lines ~58, ~152).
- **`src/components/MapModal.js`** — add `onCraft` to the prop list and forward to
  `TownMapDisplay` (lines ~9, ~89).
- **`src/components/TownMapDisplay.js`** — add `onCraft` to the prop list and forward to
  `BuildingModal` (lines ~25, ~191).
- **`src/components/BuildingModal.js`** — accept `onCraft`, render the Crafting section.

Use `inventorySystem` read-only (existing exports only); do not change its signatures. Do
not disturb the Inhabitants / Quest / Rest / Resurrection / Wares sections — add alongside.

## Tests (`src/game/craftingController.test.js`)

Mirror `shopController.test.js` (a `makeParty(gold, inventory)` helper, immutability
assertions):

- `getMaterialCount` sums `quantity` across stacked + unstacked inventory entries; 0 when
  absent.
- `canCraft`: true when materials + gold + level all satisfied; correct `reason` for each
  failure (missing one ingredient, short a count, broke, under `minLevel`, unknown recipe).
- `craftItem` success: removes **each** input by its count, deducts `goldCost` from pooled
  gold (lead-first), adds the output to the lead hero; original party object untouched.
- `craftItem` failure (missing material / broke / low level): returns the **same** party
  reference unchanged, `ok:false`, correct `reason`.
- Multi-count input (e.g. `healing_herbs x3`) is fully consumed only when ≥3 are held.
- Pooled-gold spend across a 2-hero party (assert lead drained first), matching the shop
  test.
- A data guard test (e.g. `src/data/recipes.test.js`): every `output` and every input `key`
  exists in `ITEM_CATALOG` (catches typos and enforces the "no new art" rule); every
  `station` is `blacksmith` or `alchemist`; `getRecipesForStation` partitions correctly.

## Back-compat

- New feature; **no save migration**. Recipes read `ITEM_CATALOG` and the live party; the
  crafting section only appears at blacksmith/alchemist buildings.
- Inventory shape is unchanged (crafting only calls existing `addItem`/`removeItem`), so old
  saves craft fine; heroes with no matching materials simply see disabled rows.
- `onCraft` is an **optional** prop throughout the chain: if it is absent (older render
  path), `BuildingModal` hides the Crafting section, exactly like Wares hides without
  `onBuy`/`onSell`. Tolerate missing `inventory` (default `[]`) and missing `level`
  (`effectivePartyLevel` already defaults).

## Non-goals

- No new items, no new icons, no new catalog entries (hard constraint).
- No crafting **skill / proficiency**, XP from crafting, quality tiers, or crit-crafts.
- No durability, salvage/disassembly (turning gear back into materials), or enchant slots.
- No recipe **discovery / unlocking** (all station recipes are visible from the start,
  gated only by `minLevel` + materials). Learned/blueprint recipes are a later pass.
- No batch crafting (craft one at a time), no timed crafting, no station tiers.
- No new building types: crafting lives only where `blacksmith` / `alchemist` already exist.

## Phased rollout

1. **Phase 1 (data + engine):** `recipes.js` (the ~14 recipes) + `craftingController.js`
   pure functions + both test files. No UI. Mergeable and fully tested in isolation, exactly
   like the shop controller landed before its UI.
2. **Phase 2 (UI):** Crafting section in `BuildingModal`; thread `onCraft` through
   Game.js → GameModals → MapModal → TownMapDisplay. Optionally surface it on a debug page
   (`/debug/*`) with a mock loot-rich party for quick iteration, like `ShopTest`.
3. **Phase 3 (balance + polish):** tune counts/gold/minLevel against real loot drop rates
   from `sitePopulator.js`; confirm `dragon_scale` → `dragonscale_plate` is reachable; add a
   couple more recipes if loot types are still dead-ends (e.g. `raw_gems`, `storm_crystal`,
   `bear_pelt`, `wolf_pelt` currently have thin or no recipe use).

## Verify

`CI=true npx react-scripts test --watchAll=false` and `CI=false npx react-scripts build`
both green. Do NOT commit or push.

## Open questions for the human

1. **Gold fee, yes/no?** Keeping a small `goldCost` makes crafting a gold sink and prevents
   free value from junk loot, but some players expect pure material crafting. Keep fees, or
   set them all to 0 and rely on material opportunity cost alone?
2. **`dragonscale_plate` unlock.** `EQUIPMENT_ITEMS.md` floats a "slay a wyrm" boss quest as
   its intended source. Is crafting (2x `dragon_scale` + level 7) an acceptable substitute,
   a complement, or should the +4 plate stay quest-only and be dropped from the recipe list?
3. **Where does the output go in a multi-hero party?** Shops credit the lead hero
   (`party[0]`). Crafting follows the same rule. Fine, or should the player pick the
   recipient?
4. **Should crafting consume materials from the whole party or just the lead hero?** Shops
   sell from the lead hero's inventory only; this plan reads materials from the lead hero to
   match. If loot is spread across heroes, do we want a pooled-inventory read instead (bigger
   change, would also affect the sell flow for consistency)?
5. **Recipe visibility vs. discovery.** All station recipes are shown from the start (gated
   by level/materials). Is an always-visible "cookbook" the right call for a first version,
   or do you want recipes hidden until learned (blueprints / NPC teaching)?
6. **Should the alchemist also accept the generic `bat_guano` "Alchemical Reagent" and
   `rare_ingredient` more widely?** They read as catch-all crafting mats; expanding their use
   would absorb more dead loot but needs more recipes.
