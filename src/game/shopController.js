// Shop transaction logic (pure, testable).
// Operates on the party array: gold is pooled across the party for affordability and
// spending, items are added to / removed from the lead hero (party[0]).
// Reuses addGold / addItem / removeItem / ITEM_CATALOG from inventorySystem (read-only).

import { addGold, addItem, removeItem, ITEM_CATALOG } from '../utils/inventorySystem';
import { canSellItem } from './equipment';

/**
 * Buy price for an item key.
 * @param {string} key - ITEM_CATALOG key
 * @returns {number} Gold cost (0 for unknown items)
 */
export const buyPrice = (key) => {
  const item = ITEM_CATALOG[key];
  return item ? (item.value || 0) : 0;
};

/**
 * Sell price for an item key (half value, rounded).
 * @param {string} key - ITEM_CATALOG key
 * @returns {number} Gold received (0 for unknown items)
 */
export const sellPrice = (key) => {
  const item = ITEM_CATALOG[key];
  if (!item) return 0;
  return Math.round((item.value || 0) * 0.5);
};

/**
 * Total gold pooled across the whole party.
 * @param {Array} party - Party array
 * @returns {number} Combined gold
 */
export const partyGold = (party) => {
  if (!Array.isArray(party)) return 0;
  return party.reduce((sum, hero) => sum + (hero.gold || 0), 0);
};

/**
 * Whether an item can be sold. Quest items have no resale value.
 * @param {string} key - ITEM_CATALOG key
 * @returns {boolean}
 */
export const isSellable = (key) => {
  const item = ITEM_CATALOG[key];
  if (!item) return false;
  return item.type !== 'quest_item';
};

/**
 * Whether the party can afford to buy an item.
 * @param {Array} party - Party array
 * @param {string} key - ITEM_CATALOG key
 * @returns {boolean}
 */
export const canAfford = (party, key) => {
  if (!ITEM_CATALOG[key]) return false;
  return partyGold(party) >= buyPrice(key);
};

/**
 * Buy an item: deduct its cost from pooled party gold (lead hero first) and add the
 * item to the lead hero's inventory.
 * @param {Array} party - Party array
 * @param {string} key - ITEM_CATALOG key
 * @returns {{ party: Array, ok: boolean, reason: string|null }}
 */
export const buyItem = (party, key) => {
  if (!Array.isArray(party) || party.length === 0) {
    return { party, ok: false, reason: 'no_party' };
  }
  if (!ITEM_CATALOG[key]) {
    return { party, ok: false, reason: 'unknown_item' };
  }
  const price = buyPrice(key);
  if (partyGold(party) < price) {
    return { party, ok: false, reason: 'insufficient_gold' };
  }

  // Spend from pooled gold, starting with the lead hero.
  let remaining = price;
  const afterGold = party.map((hero) => {
    if (remaining <= 0) return hero;
    const available = hero.gold || 0;
    const deducted = Math.min(available, remaining);
    remaining -= deducted;
    return addGold(hero, -deducted);
  });

  // Credit the item to the lead hero.
  const newParty = afterGold.map((hero, idx) => {
    if (idx !== 0) return hero;
    return { ...hero, inventory: addItem(hero.inventory || [], key) };
  });

  return { party: newParty, ok: true, reason: null };
};

/**
 * Sell an item from the lead hero's inventory: remove one and credit the sale price.
 * @param {Array} party - Party array
 * @param {string} key - ITEM_CATALOG key
 * @returns {{ party: Array, ok: boolean, gold: number, reason: string|null }}
 */
export const sellItem = (party, key) => {
  if (!Array.isArray(party) || party.length === 0) {
    return { party, ok: false, gold: 0, reason: 'no_party' };
  }
  if (!ITEM_CATALOG[key]) {
    return { party, ok: false, gold: 0, reason: 'unknown_item' };
  }
  if (!isSellable(key)) {
    return { party, ok: false, gold: 0, reason: 'not_sellable' };
  }

  const lead = party[0];
  const inventory = lead.inventory || [];
  if (!inventory.some((i) => i.key === key)) {
    return { party, ok: false, gold: 0, reason: 'not_in_inventory' };
  }
  // A worn item can't be sold out from under its wearer (that would silently drop its
  // bonus). Spare, unequipped copies of the same item stay sellable.
  if (!canSellItem(lead, key)) {
    return { party, ok: false, gold: 0, reason: 'equipped' };
  }

  const price = sellPrice(key);
  const newParty = party.map((hero, idx) => {
    if (idx !== 0) return hero;
    const credited = addGold(hero, price);
    return { ...credited, inventory: removeItem(hero.inventory || [], key) };
  });

  return { party: newParty, ok: true, gold: price, reason: null };
};
