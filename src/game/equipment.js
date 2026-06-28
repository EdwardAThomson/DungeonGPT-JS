// Equipment system: let heroes equip a weapon / armour / accessory and have that
// gear affect combat. Pure helpers only (no React, no I/O). Item definitions and
// inventory shape come from inventorySystem (read-only here).
import { ITEM_CATALOG } from '../utils/inventorySystem';

// The three equip slots a hero can fill (one item each).
export const EQUIP_SLOTS = ['weapon', 'armor', 'accessory'];

// Maps an item's `type` to the slot it occupies. Anything not listed here is
// not equippable (potions, quest items, blessings, …).
export const SLOT_FOR_TYPE = {
  weapon: 'weapon',
  armor: 'armor',
  ring: 'accessory',
  charm: 'accessory',
  artifact: 'accessory'
};

// An equipped accessory with no numeric bonus still grants a small all-round
// edge (a "+1 to all checks" style trinket).
const ACCESSORY_DEFAULT_BONUS = 1;

/**
 * Parse a bonus string into a signed number.
 * Examples: '+1' -> 1, '+1 defense' -> 1, '-2' -> -2, '+2 to hit' -> 2.
 * Already-numeric input is passed through; missing/garbage input -> 0.
 * @param {string|number} bonusStr
 * @returns {number}
 */
export const parseBonus = (bonusStr) => {
  if (typeof bonusStr === 'number') return Number.isFinite(bonusStr) ? bonusStr : 0;
  if (typeof bonusStr !== 'string') return 0;
  const match = bonusStr.match(/[+-]?\d+/);
  return match ? parseInt(match[0], 10) : 0;
};

/**
 * Resolve an item key the hero actually carries into a merged item definition
 * (catalog fields overlaid with any inventory-instance fields). Returns null
 * when the hero is not carrying that item, so removing an equipped item from
 * the inventory automatically drops its bonus.
 * @param {Object} hero
 * @param {string} itemKey
 * @returns {Object|null}
 */
const findInventoryItem = (hero, itemKey) => {
  if (!itemKey) return null;
  const inventory = hero?.inventory || [];
  const found = inventory.find((i) => (typeof i === 'string' ? i : i?.key) === itemKey);
  if (found === undefined || found === null) return null;
  if (typeof found === 'string') {
    return { key: found, ...(ITEM_CATALOG[found] || {}) };
  }
  return { ...(ITEM_CATALOG[found.key] || {}), ...found };
};

/**
 * Sum the mechanical bonuses from a hero's currently equipped gear.
 * - weapon  -> `attack`  (added to the roll modifier on combat actions)
 * - armour  -> `defense` (flat HP-damage soak)
 * - accessory -> `misc`  (small bonus applied to every check)
 * Old heroes without `equipment`, or with empty/removed slots, yield all zeros.
 * @param {Object} hero
 * @returns {{ attack: number, defense: number, misc: number }}
 */
export const getEquippedBonuses = (hero) => {
  const bonuses = { attack: 0, defense: 0, misc: 0 };
  const equipment = hero?.equipment;
  if (!equipment) return bonuses;

  const weapon = findInventoryItem(hero, equipment.weapon);
  if (weapon) bonuses.attack += parseBonus(weapon.bonus);

  const armor = findInventoryItem(hero, equipment.armor);
  if (armor) bonuses.defense += parseBonus(armor.bonus);

  const accessory = findInventoryItem(hero, equipment.accessory);
  if (accessory) bonuses.misc += parseBonus(accessory.bonus) || ACCESSORY_DEFAULT_BONUS;

  return bonuses;
};

/**
 * Determine which slot a given item key would occupy, based on its type.
 * @param {Object} hero
 * @param {string} itemKey
 * @returns {string|null} slot name, or null if the item is not equippable
 */
export const getSlotForItem = (hero, itemKey) => {
  const item = findInventoryItem(hero, itemKey);
  if (!item) return null;
  return SLOT_FOR_TYPE[item.type] || null;
};

/**
 * Equip an inventory item into its matching slot, returning a new hero. The item
 * stays in the inventory (the slot just references it). Equipping into an
 * occupied slot replaces whatever was there. No-ops (returns the same hero) when
 * the item is not carried or is not an equippable type.
 * @param {Object} hero
 * @param {string} itemKey
 * @returns {Object}
 */
export const equipItem = (hero, itemKey) => {
  if (!hero || !itemKey) return hero;
  const item = findInventoryItem(hero, itemKey);
  if (!item) return hero;
  const slot = SLOT_FOR_TYPE[item.type];
  if (!slot) return hero;
  return {
    ...hero,
    equipment: { ...(hero.equipment || {}), [slot]: itemKey }
  };
};

/**
 * Clear a single equip slot, returning a new hero.
 * @param {Object} hero
 * @param {string} slot - one of EQUIP_SLOTS
 * @returns {Object}
 */
export const unequipSlot = (hero, slot) => {
  if (!hero || !slot) return hero;
  if (!(hero.equipment && slot in hero.equipment)) return hero;
  return {
    ...hero,
    equipment: { ...hero.equipment, [slot]: null }
  };
};

/**
 * List the hero's inventory items that can be equipped into a given slot, as
 * merged item definitions (deduped by key). Helper for the equip UI.
 * @param {Object} hero
 * @param {string} slot - one of EQUIP_SLOTS
 * @returns {Array<Object>}
 */
export const getEquippableItemsForSlot = (hero, slot) => {
  const inventory = hero?.inventory || [];
  const seen = new Set();
  const items = [];
  for (const entry of inventory) {
    const key = typeof entry === 'string' ? entry : entry?.key;
    if (!key || seen.has(key)) continue;
    const item = findInventoryItem(hero, key);
    if (!item) continue;
    if (SLOT_FOR_TYPE[item.type] === slot) {
      seen.add(key);
      items.push({ key, ...item });
    }
  }
  return items;
};

/**
 * Resolve the item currently equipped in a slot to a merged definition, or null.
 * @param {Object} hero
 * @param {string} slot - one of EQUIP_SLOTS
 * @returns {Object|null}
 */
export const getEquippedItem = (hero, slot) => {
  const key = hero?.equipment?.[slot];
  if (!key) return null;
  const item = findInventoryItem(hero, key);
  return item ? { key, ...item } : null;
};
