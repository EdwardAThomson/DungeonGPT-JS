// Shop stock lists, keyed by building type.
// Uses existing ITEM_CATALOG keys only (no new items, no new art).
// Stock is static per visit (no restock timer).

export const SHOP_STOCK = {
  // General store: everyday adventuring supplies and a basic potion.
  shop: ['rations', 'torch', 'rope', 'healing_potion'],
  // Market: same staples plus a curative.
  market: ['rations', 'torch', 'rope', 'healing_potion', 'antidote'],
  // Blacksmith: weapons and armour (light -> heavy). Hide Armor is wilderness loot only
  // (a sidegrade to Studded), and Dragonscale Plate is quest/loot-gated, so neither is sold.
  blacksmith: ['shortsword', 'silver_dagger', 'magic_weapon', 'leather_armor', 'studded_leather', 'scale_mail'],
  // Alchemist: potions, cures and reagents.
  alchemist: ['healing_potion', 'greater_healing_potion', 'antidote', 'poison_vial']
};

/**
 * Get the stock list for a building type.
 * @param {string} buildingType - e.g. 'shop', 'market', 'blacksmith', 'alchemist'
 * @returns {string[]} Array of ITEM_CATALOG keys (empty if the type has no shop).
 */
export const getShopStock = (buildingType) => {
  return SHOP_STOCK[buildingType] || [];
};
