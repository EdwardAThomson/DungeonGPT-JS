# Equipment items and stats

Reference for the equippable-item pass that made gear mechanically matter. Companion to
`docs/FEATURE_EQUIPMENT.md` (the engine) and the `equipment.js` helpers.

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

Armour values run higher because soak is flat HP per hit; to-hit and all-checks are d20
modifiers where each point is strong, so they stay low.

## Changes made

All icons reuse existing art (no new images). New keys added; existing items buffed.

**Armour ladder** (the real gap: previously one item, no bonus)
- `leather_armor` buffed to `+1 defense` (common)
- `studded_leather` NEW `+2` uncommon, icon `hard_leather.webp`
- `hide_armor` NEW `+2` uncommon, icon `beast_hide.webp`
- `scale_mail` NEW `+3` rare, icon `dragon_scale.webp` (blacksmith)
- `dragonscale_plate` NEW `+4` very rare, icon `dragon_scale.webp` (reused) -- NOT yet
  obtainable; see Deferred.

Hide vs Studded are equal-power (+2) **sidegrades differentiated by source**: Studded is the
blacksmith buy; Hide drops only from `forest`/`hills` site hoards. Same power, different
acquisition, so neither is redundant. (Avoid putting both in one shop, or the cheaper wins.)

**Weapons** (bonuses assigned to existing; art is blade/dagger/staff only)
- `+1`: `shortsword`, `silver_dagger`, `ritual_dagger`, `poisoned_dagger`, `enchanted_staff`
- already `+1`/`+2`: `magic_weapon`, `legendary_weapon`
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

## Deferred / not done

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
