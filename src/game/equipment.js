// Equipment system: let heroes equip a weapon / armour / accessory and have that
// gear affect combat. Pure helpers only (no React, no I/O). Item definitions and
// inventory shape come from inventorySystem (read-only here).
import { ITEM_CATALOG, addItem, removeItem } from '../utils/inventorySystem';
import { heroUid } from '../utils/partyUtils';

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

// --- Party-wide (pooled) equip ------------------------------------------------
// Loot funnels to the lead hero, but any hero should be able to equip from the
// shared party stock. These helpers pool equippable items across the party and,
// on a cross-hero equip, MOVE one instance into the wearer, so the existing
// per-hero bonus resolution (findInventoryItem) keeps working unchanged and no
// item is ever duplicated (one instance out of the owner, one into the wearer).

// How many instances of each item key the whole party currently has equipped.
const countEquippedKeys = (party) => {
  const counts = {};
  for (const hero of party || []) {
    for (const key of Object.values(hero?.equipment || {})) {
      if (key) counts[key] = (counts[key] || 0) + 1;
    }
  }
  return counts;
};

// Total instances of `key` a hero carries in inventory (quantity-aware, string-tolerant).
const inventoryCount = (hero, key) =>
  (hero?.inventory || []).reduce((n, entry) => {
    const k = typeof entry === 'string' ? entry : entry?.key;
    if (k !== key) return n;
    return n + ((typeof entry === 'object' && entry && entry.quantity) || 1);
  }, 0);

// Instances of `key` this hero is currently wearing (0 or 1 in practice).
const equippedOnHero = (hero, key) =>
  Object.values(hero?.equipment || {}).filter((k) => k === key).length;

// Whether a hero holds a free (unequipped) instance of `key` it could give up.
const heroHasFreeInstance = (hero, key) => inventoryCount(hero, key) - equippedOnHero(hero, key) > 0;

// Resolve an item key to a merged definition using any party member that carries it
// (so inline-typed instances, not just catalog items, resolve their slot correctly).
const resolvePartyItemDef = (party, key) => {
  for (const hero of party || []) {
    for (const entry of hero?.inventory || []) {
      const k = typeof entry === 'string' ? entry : entry?.key;
      if (k === key) return { key, ...(ITEM_CATALOG[key] || {}), ...(typeof entry === 'object' ? entry : {}) };
    }
  }
  return { key, ...(ITEM_CATALOG[key] || {}) };
};

/**
 * List every equippable item available to a slot across the WHOLE party, deduped by
 * key. Each result carries an `available` count = total carried minus the instances
 * already worn by any hero, so an equipped item never shows as available to equip.
 * @param {Array} party
 * @param {string} slot - one of EQUIP_SLOTS
 * @returns {Array<Object>} merged item defs with an `available` count (> 0)
 */
export const getEquippablePartyItems = (party, slot) => {
  const equipped = countEquippedKeys(party);
  const byKey = new Map();
  for (const hero of party || []) {
    for (const entry of hero?.inventory || []) {
      const key = typeof entry === 'string' ? entry : entry?.key;
      if (!key || byKey.has(key)) continue;
      const def = { ...(ITEM_CATALOG[key] || {}), ...(typeof entry === 'object' ? entry : {}) };
      if (SLOT_FOR_TYPE[def.type] !== slot) continue;
      byKey.set(key, def);
    }
  }
  const items = [];
  for (const [key, def] of byKey) {
    let total = 0;
    for (const hero of party || []) total += inventoryCount(hero, key);
    const available = total - (equipped[key] || 0);
    if (available > 0) items.push({ key, ...def, available });
  }
  return items;
};

/**
 * Equip `itemKey` into the target hero's slot, drawing one instance from whichever
 * hero holds a free copy (preferring the target, so no needless transfer). When the
 * copy comes from another hero it is MOVED, never copied. Returns the heroes that
 * changed: `[]` if nothing could be equipped, `[target]` if the target already had
 * it, or `[owner, target]` when an instance was transferred. The caller applies each
 * returned hero via the normal per-hero update path.
 * @param {Array} party
 * @param {string} targetUid - heroUid of the hero to equip onto
 * @param {string} itemKey
 * @returns {Array<Object>} changed heroes (0, 1, or 2)
 */
export const equipItemFromParty = (party, targetUid, itemKey) => {
  if (!Array.isArray(party) || !targetUid || !itemKey) return [];
  const target = party.find((h) => heroUid(h) === targetUid);
  if (!target) return [];
  const slot = SLOT_FOR_TYPE[resolvePartyItemDef(party, itemKey).type];
  if (!slot) return []; // not an equippable type

  // Prefer the target if it already holds a free copy; otherwise the first party
  // member (in order) that does. If every copy is worn, there is nothing to equip.
  const owner = heroHasFreeInstance(target, itemKey)
    ? target
    : party.find((h) => heroHasFreeInstance(h, itemKey));
  if (!owner) return [];

  const equipOn = (hero) => ({
    ...hero,
    equipment: { ...(hero.equipment || {}), [slot]: itemKey }
  });

  // Target already carries it, so just fill the slot (no inventory change, no dup).
  if (heroUid(owner) === targetUid) return [equipOn(target)];

  // Cross-hero: move exactly one instance owner -> target, then equip on target.
  const updatedOwner = { ...owner, inventory: removeItem(owner.inventory || [], itemKey, 1) };
  const updatedTarget = equipOn({ ...target, inventory: addItem(target.inventory || [], itemKey, 1) });
  return [updatedOwner, updatedTarget];
};

/**
 * Whether a hero may sell/trade away an instance of `key` right now: true only if
 * they carry more copies than they have equipped. Guards the shop/trade paths so a
 * worn item can't be sold out from under the wearer (which would silently drop its
 * bonus). Non-equippable items are always sellable.
 * @param {Object} hero
 * @param {string} key
 * @returns {boolean}
 */
export const canSellItem = (hero, key) => inventoryCount(hero, key) - equippedOnHero(hero, key) > 0;
