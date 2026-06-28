# Feature: Inventory and gear (ranged weapons, equipment UI, starter kits)

Three interlocking gear threads, planned together because they share the same data model
(`src/game/equipment.js` single-bonus items) and the same surfaces (`HeroModal`,
`PartyInventoryModal`, the hero creation flow):

1. **Ranged weapons / bows** — a new weapon sub-type plus a deterministic combat mechanic.
2. **Inventory & equipment UI** — make equipping discoverable (a user reported not knowing
   how to equip gear).
3. **Starter equipment** — class-based starting weapons (weapon only, no armour for now).

How they depend on each other:
- The **Ranger** starter kit (Thread 3) needs the bow item from **Thread 1**. If Thread 1
  slips, the Ranger falls back to a shortsword and the bow is added later.
- The **inventory/equipment UI** (Thread 2) is where the starter weapon (Thread 3) becomes
  visible and where the ranged weapon (Thread 1) shows its tag, so Thread 2 should land
  alongside or just after the other two.

This doc follows the existing `FEATURE_*.md` shape (player-facing, data model, files owned vs
shared, integration points, tests, back-compat, non-goals, phased rollout). Companion docs:
`docs/FEATURE_EQUIPMENT.md` (the equip engine), `docs/EQUIPMENT_ITEMS.md` (the stat model and
the no-new-art rule), `docs/FEATURE_SHOPS.md` (how new items reach the player).

---

## Current state (what exists today)

- **Item model** (`src/utils/inventorySystem.js` -> `ITEM_CATALOG`): every item is a flat
  record. Weapons carry `type: 'weapon'` and a `bonus` string (`'+1'`). The only weapon art
  is blades, daggers, and one staff: `shortsword` (+1, common, value 25),
  `silver_dagger`/`ritual_dagger`/`poisoned_dagger` (+1), `enchanted_staff` (+1, uncommon,
  value 250), `magic_weapon`/`legendary_weapon`, plus 0-bonus junk (`rusty_dagger`,
  `bar_stool_leg`). **There is no bow item.**
- **Icons** (`public/assets/icons/items/`, 122 files): **no bow / arrow / quiver / sling /
  crossbow art exists** (verified). The repo rule (see `EQUIPMENT_ITEMS.md`) is *reuse
  existing art, add no new images*.
- **Equip engine** (`src/game/equipment.js`): one item per slot, three slots
  (`EQUIP_SLOTS = ['weapon','armor','accessory']`). `SLOT_FOR_TYPE` maps item `type` to slot
  (`weapon->weapon`, `armor->armor`, `ring/charm/artifact->accessory`).
  `getEquippedBonuses(hero)` returns `{ attack, defense, misc }`. `hero.equipment` is
  `{ weapon, armor, accessory }`; old heroes without it yield all-zero bonuses.
- **Combat is deterministic** (code rolls, AI only narrates):
  - `src/utils/encounterResolver.js` -> `resolveEncounter()` builds `modifier` from the
    relevant stat, adds `equipBonuses.attack` on combat/physical actions and
    `equipBonuses.misc` always, rolls `rollCheck(modifier)` (d20), picks an `outcomeTier`,
    then for hostile encounters computes `hpDamage = calculateDamage(...) - equipBonuses.defense`
    (armour soak, clamped >= 0).
  - `src/utils/multiRoundEncounter.js` wraps `resolveEncounter` per round and derives
    `enemyDamage`, `enemyMorale`, `playerAdvantage` from the `outcomeTier`.
  - `src/utils/healthSystem.js` -> `calculateDamage()` (incoming damage by tier/difficulty),
    `shouldDealDamage()` (hostile detection).
- **Equip UI today** lives in `src/components/HeroModal.js`, an "Equipment" section with a
  per-slot row: if filled, item name + bonus + an **Unequip** button; if empty, an
  `Equip...` `<select>` of matching inventory items. It is opened from the party sidebar
  (`Game.js` line ~931, `openHero({ hero, onHeroUpdate: handleHeroUpdate })`). **This is the
  discoverability problem**: equipping is buried inside the character modal, which players
  reach only by clicking a party portrait, and it is a plain dropdown with no visual slots.
- **Inventory UI today** (`src/components/PartyInventoryModal.js`, modal id `inventory`,
  opened from the toolbar via `onOpenInventory`): shows pooled party gold + a flat grid of
  all collected items with rarity borders and a "Use" button for healing potions. **It does
  not show equipped gear and has no equip controls at all.**
- **Modal system** (`src/contexts/ModalContext.js`): registry-driven. `hero` is in the `info`
  group (layer 0); `inventory` is its own group (layer 2). `useModal(id)` gives
  `open/close/isOpen/data`.
- **Heroes carry no gear at creation.** `HeroCreation.handleSubmit` (`src/pages/HeroCreation.js`)
  builds `newHero` with identity + `stats` only — **no `inventory`, `equipment`, or `gold`**.
  It navigates to `/hero-summary` (`src/components/HeroSummary.js`), which persists via
  `heroesApi.create`. HP is stamped later, at game start, in `HeroSelection.handleNext`
  (`initializeHP`). The 12 classes live in `src/data/heroData.js` (`heroClasses`,
  `heroTemplates`); **Ranger** exists.

---

# THREAD 1 — Ranged weapons / bows

## Player-facing behaviour
- A new weapon item, a **bow**, can be looted/bought and equipped in the existing **Weapon**
  slot like any other weapon. It contributes its `bonus` to the attack modifier exactly as a
  sword does (no change to the single-bonus model).
- In combat, a bow plays differently from a blade: **attacking at range means the enemy
  rarely gets to hit back in the same exchange.** Mechanically (see below) a successful
  ranged action avoids the melee retaliation damage the player would otherwise take, trading
  a small amount of staying power for safety. The AI narrates the loosed arrow; the code
  decides the numbers.
- The character sheet / inventory UI (Thread 2) shows the weapon as **Ranged** so the
  difference is legible.

## Data model
Add a boolean sub-type flag on the catalog weapon record — **no new slot, no new bonus
mechanic**:

```js
// src/utils/inventorySystem.js -> ITEM_CATALOG
'hunting_bow':   { name: 'Hunting Bow',  rarity: 'common',   value: 30,  type: 'weapon', ranged: true, bonus: '+1', icon: 'assets/icons/items/hunting_bow.webp' },
// optional later tier:
'longbow':       { name: 'Longbow',      rarity: 'uncommon', value: 110, type: 'weapon', ranged: true, bonus: '+2', icon: 'assets/icons/items/hunting_bow.webp' },
```

- `type: 'weapon'` keeps it routing through `SLOT_FOR_TYPE` into the weapon slot and through
  `getEquippedBonuses` into `attack`. **Renderers and the engine that don't know about
  `ranged` keep working** (it is an additive optional field — consistent with the
  back-compat rules in `CLAUDE.md`).
- Extend `getEquippedBonuses(hero)` to also surface the equipped weapon's flag so combat can
  branch without re-reading the inventory:
  ```js
  // returns { attack, defense, misc, ranged }
  ```
  `ranged` defaults to `false` (old heroes, no weapon, melee weapon).

## Combat mechanic (deterministic, resolved in code)

**Recommended rule — "Standoff" (avoid melee retaliation on a hit):**
In `encounterResolver.resolveEncounter`, inside the existing hostile-damage block (where
`hpDamage` is computed), when the equipped weapon is `ranged` **and** the outcome is a hit
(`success` or `criticalSuccess`), set the player's incoming `hpDamage` to `0` (or a large
reduction, e.g. `Math.floor(hpDamage * 0.25)`). On `failure`/`criticalFailure` the enemy
closed the distance, so the bow gives no protection and full damage applies.

```js
if (shouldDealDamage(encounter) && character.maxHP) {
  hpDamage = calculateDamage(outcomeTier, character.maxHP, encounter.difficulty);
  hpDamage = Math.max(0, hpDamage - equipBonuses.defense);   // existing armour soak
  const hit = outcomeTier === 'success' || outcomeTier === 'criticalSuccess';
  if (equipBonuses.ranged && hit) hpDamage = 0;              // NEW: standoff
  damageDescription = getDamageDescription(hpDamage, character.maxHP);
}
```

Why this rule:
- It slots into the **one** place incoming damage is already calculated, right next to the
  armour soak, so the multi-round path inherits it for free (`multiRoundEncounter` calls
  `resolveEncounter`, then derives `enemyDamage`/morale from `outcomeTier` — unchanged, so a
  bow's offence stays identical to a sword's; only the player's risk changes).
- It is fully deterministic and needs no new dice, no ammo, no turn-order model.
- It reads naturally in narration ("you loose from cover and the goblins never reach you").

**Options considered (and why not):**
- **First-strike / flat advantage** (e.g. `+2` to the first round's roll, or roll twice take
  higher): touches the roll path, would need a "first round" concept the single-shot resolver
  doesn't have, and overlaps with the attack bonus already on the item. More invasive.
- **Ranged deals bonus damage to the enemy**: would mean reaching into
  `multiRoundEncounter`'s `enemyDamage` tiers (a second file) and risks making bows a pure
  upgrade over blades. The standoff rule keeps bows a sidegrade (safer, not stronger).
- **Reduce retaliation by a flat amount instead of zeroing**: viable and gentler; pick
  `*0.25` if playtesting shows full immunity is too strong. Left as a tuning knob.

## Ammo — non-goal for v1
No arrows/quiver/ammo tracking. It would need a consumable model, a depletion check in the
resolver, and UI, for little narrative payoff at this stage. Revisit only if bows prove
dominant. Stated as a non-goal so the standoff rule isn't "balanced" against imaginary ammo.

## THE ART PROBLEM (decision required)
There is **no bow icon**, and the repo rule is **no new images**. A bow cannot be faked
convincingly with the existing art (every weapon icon is a blade, dagger, or staff — reusing
one for a bow actively misleads the player). Options:

- **(A) Stopgap: reuse an existing weapon icon** (e.g. `legendary_weapon.webp` or
  `enchanted_staff.webp`) for the bow, with a `// TODO bow art` note. Pro: honours the
  no-new-art rule, unblocks Threads 1+3 immediately. Con: the icon shows a sword/staff for a
  bow, which is exactly the kind of confusion the UI work in Thread 2 is trying to fix.
- **(B) Recommended: one explicit, human-approved new icon** — add a single
  `hunting_bow.webp` (and reuse it for `longbow` if/when added) as a deliberate, documented
  exception to the no-new-art rule. A new weapon **sub-type** plus the Ranger's signature
  starter weapon is a strong enough case to warrant exactly one asset. This is the one
  open decision that needs a human yes/no before Thread 1 ships (see Open Questions).

**Recommendation: B**, with **A as the fallback** if new art is declined (ship the mechanic
on a reused icon, swap the art in later — art changes are retroactive and safe per the
`CLAUDE.md` view-layer rules, so no save migration is needed when the real icon arrives).

## Files (Thread 1)
- **`src/utils/inventorySystem.js`** (shared, additive) — new `hunting_bow` (and optional
  `longbow`) catalog entries with `ranged: true`.
- **`src/game/equipment.js`** (owned) — add `ranged` to `getEquippedBonuses` output.
- **`src/utils/encounterResolver.js`** (shared, combat lane) — the standoff branch.
- **`src/data/shopStock.js`** (shared, optional) — add `hunting_bow` to a fletcher/market or
  blacksmith list so it's buyable; and/or a forest/hills loot hoard via `sitePopulator`.
- **Art**: `public/assets/icons/items/hunting_bow.webp` (option B) **or** an icon path reuse
  (option A).

---

# THREAD 2 — Inventory & equipment UI

## Problem
Equipping is hidden. The only equip controls live in `HeroModal`'s Equipment section (a
dropdown per slot), reached only by clicking a party portrait. The toolbar's
**Inventory** button opens `PartyInventoryModal`, which shows loot but **no equipped gear and
no equip action** — so a player who opens "Inventory" looking to equip a weapon finds nothing.

## Player-facing behaviour (recommended redesign)
Make the character sheet the single, obvious home for "what am I wearing and what can I
wear", organised as a **tabbed sheet** in `HeroModal`:

- **Stats** tab — the existing stats grid, HP, XP, alignment, background (what `HeroModal`
  already renders).
- **Equipment** tab — promote the existing equip section to first-class **visual slots**
  (Weapon / Armour / Accessory) each showing the equipped item icon + name + bonus, an
  **Unequip** action, and an inline list/picker of equippable inventory items for that slot
  (reuse `getEquippableItemsForSlot`, `equipItem`, `unequipSlot`). Weapon slot shows a
  **Ranged** badge when the equipped weapon has `ranged: true` (Thread 1). Keep the
  `equipBonuses` summary line.
- **Inventory** tab — this hero's carried items (the per-hero view), so equipping happens
  right next to the items being equipped.

Keep `PartyInventoryModal` as the **party-wide pooled** view (gold + all loot + potion use),
but add discoverability links both ways:
- In `PartyInventoryModal`, show a small **"Equipped"** read-out per hero (or a single line:
  weapon/armour/accessory names) and a **"Manage on character sheet"** affordance that opens
  `HeroModal` on its Equipment tab.
- In the toolbar / party sidebar, make "Equip" reachable in one obvious click (the portrait
  already opens `HeroModal`; deep-link it to the Equipment tab when entered that way).

This is deliberately incremental: the engine (`equipment.js`) and the equip handlers already
exist and work; Thread 2 is **presentation + navigation**, not new mechanics.

## Alternative considered
A brand-new dedicated full-screen "Character" screen with a paper-doll. Rejected for v1 as
heavier than needed: the tabbed `HeroModal` reuses all existing equip plumbing and the modal
system, and avoids a new route.

## Data model
None. Reads `hero.equipment` / `hero.inventory` and the `equipment.js` helpers as they are.
Tab state is local component state in `HeroModal`.

## Files (Thread 2)
- **`src/components/HeroModal.js`** (owned) — introduce tabs (Stats | Equipment | Inventory);
  move the existing equip section under the Equipment tab and render it as visual slots; add
  the Ranged badge. Accept an optional `initialTab` in modal `data` for deep-linking.
- **`src/components/PartyInventoryModal.js`** (owned) — add a compact per-hero "Equipped"
  read-out and a link to open `HeroModal` on the Equipment tab.
- **`src/pages/Game.js`** (shared, minimal) — `openHero` already passes
  `{ hero, onHeroUpdate }`; optionally pass `initialTab: 'equipment'` from the relevant entry
  points. No prop-chain changes beyond that.
- **`src/styles/`** — feature CSS for tabs and slot cards (modular, per `CLAUDE.md`
  conventions). Preview iterate as usual; no debug route strictly required.
- **`src/contexts/ModalContext.js`** — no change (reuses `hero` and `inventory` ids).

## Back-compat
Pure view change. Heroes with `equipment: undefined` render empty slots (already handled by
`getEquippedItem`/`getEquippableItemsForSlot`). Renderers must tolerate missing `ranged`
(treat as melee) and missing item fields (fall back to key/name), per the back-compat rules.

---

# THREAD 3 — Starter equipment (class-based, weapon only)

## Player-facing behaviour
A newly created hero **starts with one weapon suited to their class, already equipped**:
- **Martial / melee classes** start with a **Shortsword** (`shortsword`, +1, common).
- **Caster classes** start with a **Staff** (`enchanted_staff`, +1, uncommon).
- **Ranger** starts with a **Bow** (`hunting_bow`, Thread 1).

**Per the human's decision: a starter WEAPON only — no starter armour for now.** The starter
weapon is **auto-equipped** so a brand-new player immediately sees a filled Weapon slot
(reinforcing the Thread 2 discoverability goal) and gets the +1 in their first fight.

## Class -> weapon mapping (recommended; existing items only, plus the bow)
```js
// src/game/starterEquipment.js  (NEW, pure)
const STARTER_WEAPON = {
  Barbarian: 'shortsword',
  Fighter:   'shortsword',
  Paladin:   'shortsword',
  Cleric:    'shortsword',
  Monk:      'shortsword',
  Rogue:     'shortsword',   // (dagger is thematic; sword keeps it to +1 and one item set — see Open Qs)
  Wizard:    'enchanted_staff',
  Sorcerer:  'enchanted_staff',
  Warlock:   'enchanted_staff',
  Druid:     'enchanted_staff',
  Bard:      'enchanted_staff',
  Ranger:    'hunting_bow',   // Thread 1 dependency; fall back to 'shortsword' if bow not yet added
};
```
- All three weapons are **+1**, so the kits are mechanically balanced; only flavour/value
  differs (`enchanted_staff` value 250 vs `shortsword` 25 — cosmetic, since starter gear
  isn't bought). If the staff's value feels too rich for a freebie, a cheaper
  `wooden_staff`/`quarterstaff` (+1, low value) could be added later; out of scope here.
- `getStarterKit(heroClass)` returns `{ weaponKey }` (object form leaves room to add armour
  or multiple items later without changing call sites).

## Where it is initialized (creation flow)
Stamp the kit **once, at hero creation**, so it persists with the saved hero — **not** at
game start (that would re-apply every game and never reach the roster). Concretely in
`src/pages/HeroCreation.js -> handleSubmit`, when building `newHero` and **only for brand-new
heroes** (`!state?.editing`):

```js
import { getStarterKit } from '../game/starterEquipment';
import { addItem } from '../utils/inventorySystem';
// ...
const newHero = { /* identity + stats as today */ };
if (!state?.editing) {
  const { weaponKey } = getStarterKit(selectedClass);
  if (weaponKey) {
    newHero.inventory = addItem([], weaponKey, 1);     // object-shape entry, matches equip engine
    newHero.equipment = { weapon: weaponKey };          // auto-equip
  }
}
```
- Use `addItem` so the inventory entry is the `{ key, name, ... }` object shape that
  `equipment.js -> findInventoryItem` expects.
- Guard on `!state?.editing` so **editing an existing hero never duplicates or overwrites**
  gear. (Optionally also guard `if (!newHero.inventory?.length)` for safety.)
- This is the same "stamp at the creation chokepoint" pattern as `initializeHP` (which runs
  later, at selection); the two are complementary and don't conflict.

## Back-compat
Existing saved heroes have **no `inventory`/`equipment`** and are **untouched** — they keep
behaving exactly as today (no bonus, empty slots), since nothing migrates old heroes and the
stamp only runs for newly created ones. A player who wants gear on an old hero loots/buys it
as before.

## Files (Thread 3)
- **`src/game/starterEquipment.js`** (NEW, owned) — `STARTER_WEAPON` map + `getStarterKit`.
- **`src/pages/HeroCreation.js`** (shared, minimal) — call `getStarterKit` + `addItem` in
  `handleSubmit` for new heroes only.
- Depends on **`hunting_bow`** existing (Thread 1) for the Ranger; otherwise Ranger falls back
  to `shortsword` until the bow lands.

---

## Cross-thread integration points
- **Ranger starter (Thread 3) requires the bow (Thread 1).** Sequence Thread 1 first, or ship
  Thread 3 with a `shortsword` fallback for Ranger and flip it to `hunting_bow` when Thread 1
  merges.
- **Equipment UI (Thread 2) surfaces both** the auto-equipped starter weapon (immediate
  payoff for the discoverability fix) and the **Ranged** badge for bows.
- **Shops/loot (`docs/FEATURE_SHOPS.md`, `shopStock.js`, `sitePopulator`)** are how non-Ranger
  players obtain a bow after creation; add `hunting_bow` to a buy list and/or a forest/hills
  hoard.

## Tests
- **Thread 1**
  - `src/game/equipment.test.js`: `getEquippedBonuses` reports `ranged: true` for an equipped
    bow, `false`/absent otherwise; bow still contributes its `attack` bonus.
  - `src/utils/encounterResolver.test.js`: with a bow equipped, a `success`/`criticalSuccess`
    on a hostile encounter yields `hpDamage === 0`; a `failure` still takes damage; a melee
    weapon is unaffected (mock the dice to force tiers).
  - Catalog guard (extend `src/utils/itemCatalogEquipment.test.js`): `hunting_bow` resolves to
    the weapon slot and a positive attack bonus through the real engine.
- **Thread 2**: component/interaction test that the Equipment tab lists equippable items,
  equip/unequip round-trips via the existing handlers, and the Ranged badge shows for a bow.
- **Thread 3**: `src/game/starterEquipment.test.js` — each class maps to the expected weapon;
  unknown class -> no kit (no throw). A `HeroCreation` test (or pure check) that a new hero
  gets `inventory` + auto-equipped `equipment.weapon`, and that **editing** an existing hero
  does **not** add/duplicate gear.

## Back-compat (consolidated)
- Old heroes: no `equipment`/`inventory`/`ranged` -> zero bonuses, empty slots, melee
  treatment. Nothing migrates.
- New optional fields only (`ranged` on items, `inventory`/`equipment` on new heroes). Save
  shape unchanged structurally (gear already rides on the hero object).
- Art is a pure view layer: a reused stopgap bow icon can be swapped for real art later with
  no data migration.

## Non-goals
Ammo/quivers; two-handed or off-hand/shield rules; thrown weapons; a paper-doll character
screen; starter **armour** (explicitly deferred by decision); starter consumables/gold;
multi-stat items; per-class weapon proficiency restrictions (any class can still equip any
weapon — the kit is just the default).

## Phased rollout
1. **Thread 1 mechanic + item** on a stopgap icon (engine + resolver + catalog + tests).
   Get the bow-art decision (Open Questions) in parallel.
2. **Thread 3 starter kits** (creation-flow stamp), Ranger using the bow from step 1.
3. **Thread 2 UI** (tabbed `HeroModal`, slot cards, Ranged badge, inventory cross-links).
4. **Polish**: real bow art if approved (retroactive), `longbow` tier + shop/loot placement,
   optional `*0.25` retaliation tuning.

## Open questions for the human
1. **Bow art (the blocking one):** approve **one new** `hunting_bow.webp` as an explicit
   exception to the no-new-art rule (recommended), or ship on a **reused** existing weapon
   icon as a stopgap? Everything else in Thread 1 is ready either way.
2. **Standoff strength:** zero out melee retaliation on a ranged hit (recommended), or only
   reduce it (e.g. `*0.25`)? Is "no retaliation on a hit" too strong vs. melee?
3. **Rogue starter weapon:** `shortsword` (current proposal) or a dagger (`silver_dagger`,
   also +1) for flavour?
4. **Caster staff value:** is reusing `enchanted_staff` (value 250) as a freebie acceptable,
   or should a cheap `quarterstaff`/`wooden_staff` (+1, low value) be added for starters?
5. **Inventory UI scope:** is the tabbed `HeroModal` (Stats | Equipment | Inventory) the right
   home, or do you want a dedicated character screen later?
6. **Bow availability after creation:** which shop type sells it (fletcher? blacksmith?
   market?) and/or which loot biome (forest/hills) drops it?
</content>
</invoke>
