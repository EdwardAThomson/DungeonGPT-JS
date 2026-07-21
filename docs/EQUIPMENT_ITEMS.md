# Equipment items and stats

Reference for the equippable-item pass that made gear mechanically matter. Companion to
the `src/game/equipment.js` helpers (the equip engine's design doc, `FEATURE_EQUIPMENT.md`,
is retired to the local `docs/archive/`).

## Stat model (kept simple, by decision)

Every equippable item carries a **single `bonus` integer** in `ITEM_CATALOG`. The slot it
occupies decides what that number does (`src/game/equipment.js` -> `getEquippedBonuses`):

| slot (from item `type`) | bonus routes to | effect in combat (`encounterResolver.js`) |
|---|---|---|
| `weapon` | `attack` | added to the roll modifier on combat/physical checks |
| `armor` | `defense` | flat HP-damage soak per hostile hit |
| `ring` / `charm` / `artifact` -> accessory | `misc` | added to every check; a bonus-less accessory still grants +1 |

`parseBonus` reads the first signed integer out of the string, so `'+2 defense'`, `'+2'`,
`'+2 to hit'` all parse to `2`. The trailing word is cosmetic.

## Tier -> magnitude guideline

| rarity | weapon (to-hit) | armour (soak) | accessory (all checks) |
|---|---|---|---|
| common | 0-1 | +1 | +1 |
| uncommon | +1 | +2 | +1 |
| rare | +2 | +3 | +2 |
| very rare | +3 | +4 | +2-3 |
| legendary (t3-gated) | +4 | +5 | +3 |

Armour values run higher because soak is flat HP per hit; to-hit and all-checks are d20
modifiers where each point is strong, so they stay low.

**Weapon curve rescaled 2026-07-20 ("Minimal" curve):** common +1, uncommon +1, rare +2,
very rare +3, legendary +4, so rarity now matters mechanically (uncommon != rare). Uncommon
deliberately stays at +1 so the balance-sim "mid" loadout (now `silver_dagger`) and every
`progressionLint` band are unchanged; only rare+ gear got stronger. A "Gentle" curve
(uncommon +2) was tried and reverted because it trivialised the tier-1 bosses. Differentiating
common from uncommon (both +1) is deferred to a baseline-buff + boss-retune session.
Catalog weapon `bonus` strings are now labelled (`'+1 attack'`); `parseBonus` is unchanged.

## Changes made

All icons reuse existing art (no new images). New keys added; existing items buffed.

**Armour ladder** (the real gap: previously one item, no bonus)
- `leather_armor` buffed to `+1 defense` (common)
- `studded_leather` NEW `+2` uncommon, icon `hard_leather.webp`
- `hide_armor` NEW `+2` uncommon, icon `beast_hide.webp`
- `scale_mail` NEW `+3` rare, icon `dragon_scale.webp` (blacksmith)
- `dragonscale_plate` NEW `+4` very rare, icon `dragon_scale.webp` (reused) -- initially
  unobtainable; sourced later by #44/#49 (see the #44 section below).

Hide vs Studded are equal-power (+2) **sidegrades differentiated by source**: Studded is the
blacksmith buy; Hide drops only from `forest`/`hills` site hoards. Same power, different
acquisition, so neither is redundant. (Avoid putting both in one shop, or the cheaper wins.)

**Weapons** (bonuses assigned to existing; art is blade/dagger/staff only)
- `+1`: `shortsword`, `silver_dagger`, `ritual_dagger`, `poisoned_dagger`, `enchanted_staff`
- already `+1`/`+2`: `magic_weapon` (since raised to `+2` by the 2026-07-20 rarity
  curve), `legendary_weapon` (since moved to the legendary shelf, now `+4`, see the
  #44 section below)
- left at 0 (starters/junk): `rusty_dagger`, `bar_stool_leg`

**Accessories** (buffed existing; gave the inert very-rare artifacts teeth)
- `ring_protection` +1 (already), `fey_charm` +1, `nature_charm` +1
- trinkets made `charm` type, +1: `artifact_trinket`, `enchanted_trinket`, `ghostly_trinket`
- artifacts: `legendary_artifact` +2, `seal_of_binding` +2, `purified_heart_shard` +2,
  `crown_of_sunfire` +3

**Supporting**
- `shopStock.blacksmith` sells the buyable armour (leather, studded, scale) plus weapons.
- `sitePopulator` LOOT/HOARD_BONUS now themed for `forest`/`hills`/`mountain` (they
  previously fell back to cave loot). Hide Armor sits in the forest/hills hoards.
- `medical_journal` now has its own art (`medical_journal.webp`), the last missing item icon.
- Debug pages: `EquipmentTest` mock uses real bonused gear; `ShopTest`/`BuildingModal`
  sell lists aggregate by key and sort stably.
- Guard test `src/utils/itemCatalogEquipment.test.js`: no dead armour, ladder values,
  weapon/accessory bonuses resolve through the real engine.

## #44 gear-ladder expansion (2026-07-03, wave 3)

The #44 pass filled the gaps this doc left open (design rationale in
`T3_CAMPAIGNS_PLAN.md` §5 and `OUTSTANDING_ISSUES.md` #44):

- **Findable +2 rung**: `runic_greatsword` (very_rare weapon, +2 then; +3 since the
  2026-07-20 rarity curve) and `stormbound_ring` (very_rare ring, +2) drop from encounter
  tables, so tier-2 play reaches the upper weapon rungs without a bespoke quest artifact.
  `hunters_longbow` (rare weapon, +1 then; now +2) joined the catalogue. New
  icon art landed for these (the "no new images" constraint no longer holds).
- **`dragonscale_plate` is now obtainable**: it drops from the mountain dragon-lair
  encounter hoard (20%) and is authored as a story-template milestone reward, resolving
  the "no source yet" deferral below.
- **t3 legendary shelf**: a `legendary` rarity above very_rare (`legendary_weapon` +4,
  `blade_of_the_shattered_throne` +4, `aegis_of_dawn` +5 defense, and the +3 artifacts
  `heart_of_the_last_winter`, `clockwork_god_core`, `crown_of_the_drowned_city`).
  Legendary is tier-gated to t3+ (`maxRarityRankForTier`); until a playable t3 campaign
  exists these are unobtainable by design, pinned in the `progressionLint` KNOWN_GAPS
  guard. Do not put them in shops, hoards, or tiered drop tables; t3 authoring assigns
  them to milestones.

## Deferred / not done

*(Historical record of the original pass. The `dragonscale_plate` deferral was resolved
by #44 above.)*

- **`dragonscale_plate` has no source yet** (not in any shop, loot pool, or quest). It is
  defined and balanced (+4) but currently unobtainable by design, pending a decision on its
  source. Intended path: a high-`minLevel` boss quest (slay a wyrm in a mountain site) that
  rewards it. Decided to leave for a later pass.
- **Equip level-gating** (a `minLevel` to *wear* an item, refused below it, shown locked in
  HeroModal): deferred. Would apply to all gear (e.g. scale_mail Lv4, plate Lv7) and touches
  `equipment.js` + `HeroModal` + tests.
- **Flat soak vs HP**: armour soak is flat while damage is a % of maxHP (clamped 5-30), so
  high soak (+3/+4) is strong and does not scale down lategame. Left as-is for now; revisit
  with either compressed values or percentage reduction.
- **Shields**: `leather_shield.webp` exists but there is no off-hand slot. Deferred (would
  need a 4th equip slot: engine + HeroModal + save shape + tests).
- **Richer stats**: kept the one-number model. Multi-stat items (attack AND defense),
  weight classes, per-ability bonuses would all require engine changes.
- **Metal/plate/helmet/boots**: no art, so the armour ladder stays leather + scale themed.
