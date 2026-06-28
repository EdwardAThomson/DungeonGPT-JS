# Feature: Equipment that matters

Let heroes **equip** a weapon / armour / accessory, and have that gear **affect combat**.
Items already exist in `ITEM_CATALOG` with `type` ('weapon','armor','ring','charm',
'artifact', …) and often a `bonus` string ('+1', '+1 defense', '+2'). Today nothing is
equipped and gear has no mechanical effect.

## Player-facing behaviour
- In the **Hero modal** (character sheet), three equip slots: **Weapon, Armour, Accessory**.
- A hero's inventory items of the matching type can be equipped/unequipped (one per slot).
- Equipped gear shows on the sheet with its bonus.
- In **combat**, equipment modifies outcomes:
  - **Weapon** → adds its bonus to the roll modifier on combat/physical actions
    (Athletics/attack-style skills).
  - **Armour** → reduces incoming HP damage (flat or %), i.e. a damage soak.
  - **Accessory** → a small bonus to a relevant stat/roll (keep simple: +1 to all checks, or
    a defined effect).

## Data model
- `hero.equipment = { weapon: itemKey|null, armor: itemKey|null, accessory: itemKey|null }`.
  Default `{}` for old heroes (back-compat → no bonus).
- Equipped items stay in `hero.inventory` (flagged via the equipment slots), so removing an
  equipped item also clears the slot.

## Files (owned by this stream)
- **NEW `src/game/equipment.js`** — pure helpers:
  - `parseBonus(bonusStr)` → number (e.g. '+1 defense' → 1).
  - `getEquippedBonuses(hero)` → `{ attack, defense, misc }` summed from equipped items.
  - `equipItem(hero, itemKey)` / `unequipSlot(hero, slot)` → return a new hero.
  - `SLOT_FOR_TYPE` map (weapon→weapon, armor→armor, ring/charm/artifact→accessory).
- **`src/components/HeroModal.js`** — equip slots UI (read `hero.equipment`, list equippable
  inventory items, equip/unequip via the existing hero-update path).
- **`src/utils/encounterResolver.js`** — apply `getEquippedBonuses(character)`:
  add `attack` to the modifier for combat actions; subtract `defense` (soak) from `hpDamage`.

## Coordinate (shared files — keep changes minimal)
- `encounterResolver.js` is the combat lane's core (this stream owns it for now).
- **Do NOT modify** `src/utils/inventorySystem.js` (use it read-only); put new logic in
  `equipment.js`. Avoid touching `Game.js` if possible — update heroes through HeroModal's
  existing update callback (`onHeroUpdate`/`setSelectedHeroes` prop). If a Game.js handler is
  unavoidable, keep it to one small addition.

## Tests (`src/game/equipment.test.js`)
- `parseBonus` variants; `getEquippedBonuses` sums equipped gear; equip/unequip round-trip;
  equipping clears the previous slot item; old hero (no `equipment`) → zero bonuses.
- An `encounterResolver` test: same action rolls higher with a +weapon, takes less damage
  with armour. (Mock the dice if needed.)

## Back-compat
Heroes without `equipment` behave exactly as today (no bonuses). Save shape: `equipment`
rides on the hero object (already persisted with the party).

## Non-goals
Durability, sockets/runes, set bonuses, two-handed/shield rules, stat requirements.

## Verify
`CI=true npx react-scripts test --watchAll=false` and `CI=false npx react-scripts build`
both green. Do NOT commit or push.
