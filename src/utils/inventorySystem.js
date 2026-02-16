// Phase 4: Inventory System
// Gold management and item tracking

/**
 * Roll dice notation (e.g., "3d10", "2d6+5")
 * @param {string} notation - Dice notation
 * @returns {number} Total rolled
 */
export const rollDice = (notation) => {
  if (typeof notation === 'number') return notation;
  if (!notation || notation === '0') return 0;
  
  const match = notation.match(/^(\d+)d(\d+)(?:\+(\d+))?$/);
  if (!match) return parseInt(notation) || 0;
  
  const [, count, sides, bonus] = match;
  let total = parseInt(bonus) || 0;
  
  for (let i = 0; i < parseInt(count); i++) {
    total += Math.floor(Math.random() * parseInt(sides)) + 1;
  }
  
  return total;
};

/**
 * Parse item drop with chance (e.g., "healing_potion:50%")
 * @param {string} itemString - Item with chance notation
 * @returns {Object|null} { name, dropped } or null if not dropped
 */
export const rollItemDrop = (itemString) => {
  const match = itemString.match(/^(.+):(\d+)%$/);
  if (!match) {
    return { name: itemString, dropped: true };
  }
  
  const [, name, chance] = match;
  const roll = Math.random() * 100;
  
  return {
    name,
    chance: parseInt(chance),
    dropped: roll <= parseInt(chance)
  };
};

/**
 * Process encounter rewards
 * @param {Object} rewards - { xp, gold, items }
 * @param {string} outcome - 'criticalSuccess', 'success', 'failure', 'criticalFailure'
 * @returns {Object} { xp, gold, items }
 */
export const processRewards = (rewards, outcome) => {
  if (!rewards) return { xp: 0, gold: 0, items: [] };
  
  // Outcome affects rewards
  const outcomeMultipliers = {
    criticalSuccess: 1.5,
    success: 1.0,
    failure: 0.3,
    criticalFailure: 0
  };
  
  const multiplier = outcomeMultipliers[outcome] || 1.0;
  
  // XP
  const xp = Math.floor((rewards.xp || 0) * multiplier);
  
  // Gold
  let gold = 0;
  if (rewards.gold && multiplier > 0) {
    gold = Math.floor(rollDice(rewards.gold) * multiplier);
  }
  
  // Items (only on success or better)
  const items = [];
  if (rewards.items && multiplier >= 1.0) {
    for (const itemString of rewards.items) {
      const result = rollItemDrop(itemString);
      if (result.dropped) {
        items.push(result.name);
      }
    }
  }
  
  return { xp, gold, items };
};

// Item definitions with rarity and value
export const ITEM_CATALOG = {
  // Common items
  'healing_potion': { name: 'Healing Potion', rarity: 'common', value: 50, effect: 'heal', amount: '2d4+2' },
  'antidote': { name: 'Antidote', rarity: 'common', value: 25, effect: 'cure_poison' },
  'rations': { name: 'Trail Rations', rarity: 'common', value: 5, stackable: true },
  'torch': { name: 'Torch', rarity: 'common', value: 1, stackable: true },
  'rope': { name: 'Rope (50ft)', rarity: 'common', value: 10 },
  
  // Uncommon items
  'greater_healing_potion': { name: 'Greater Healing Potion', rarity: 'uncommon', value: 150, effect: 'heal', amount: '4d4+4' },
  'scroll_fireball': { name: 'Scroll of Fireball', rarity: 'uncommon', value: 200, effect: 'spell', spell: 'fireball' },
  'silver_dagger': { name: 'Silver Dagger', rarity: 'uncommon', value: 100, type: 'weapon' },
  
  // Rare items
  'magic_weapon': { name: 'Enchanted Blade', rarity: 'rare', value: 500, type: 'weapon', bonus: '+1' },
  'ring_protection': { name: 'Ring of Protection', rarity: 'rare', value: 750, type: 'ring', bonus: '+1 AC' },
  
  // Very Rare
  'legendary_weapon': { name: 'Legendary Weapon', rarity: 'very_rare', value: 2500, type: 'weapon', bonus: '+2' },
  'legendary_artifact': { name: 'Ancient Artifact', rarity: 'very_rare', value: 5000, type: 'artifact' },
  
  // POI-specific items
  'cave_mushrooms': { name: 'Glowing Cave Mushrooms', rarity: 'common', value: 15, stackable: true },
  'raw_gems': { name: 'Raw Gemstones', rarity: 'uncommon', value: 75 },
  'spider_silk': { name: 'Giant Spider Silk', rarity: 'uncommon', value: 50 },
  'bat_guano': { name: 'Bat Guano (Spell Component)', rarity: 'common', value: 10, stackable: true },
  'ancient_scroll': { name: 'Ancient Scroll', rarity: 'uncommon', value: 100 },
  'artifact_fragment': { name: 'Artifact Fragment', rarity: 'rare', value: 200 },
  'ectoplasm': { name: 'Ectoplasm', rarity: 'uncommon', value: 75 },
  'ritual_dagger': { name: 'Ritual Dagger', rarity: 'uncommon', value: 125, type: 'weapon' },
  'dark_tome': { name: 'Dark Tome', rarity: 'rare', value: 300 },
  'spell_scroll': { name: 'Spell Scroll', rarity: 'uncommon', value: 150 },
  'healing_herbs': { name: 'Healing Herbs', rarity: 'common', value: 20, stackable: true },
  'rare_flower': { name: 'Rare Flower', rarity: 'uncommon', value: 45 },
  'dryad_blessing': { name: 'Dryad\'s Blessing', rarity: 'rare', value: 0, type: 'blessing' },
  'fairy_dust': { name: 'Fairy Dust', rarity: 'uncommon', value: 100 },
  'fey_charm': { name: 'Fey Charm', rarity: 'rare', value: 250, type: 'charm' },
  'giant_feather': { name: 'Giant Eagle Feather', rarity: 'uncommon', value: 60 },
  'dragon_scale': { name: 'Dragon Scale', rarity: 'very_rare', value: 1000 },
  'mountain_crystal': { name: 'Mountain Crystal', rarity: 'uncommon', value: 80 },
  'storm_crystal': { name: 'Storm Crystal', rarity: 'rare', value: 200 },
  
  // Generic loot
  'gold_coins': { name: 'Gold Coins', rarity: 'common', value: 0, isGold: true },
  'gemstone': { name: 'Gemstone', rarity: 'uncommon', value: 100 },
  'pearl': { name: 'Pearl', rarity: 'uncommon', value: 100 },
  'old_coins': { name: 'Ancient Coins', rarity: 'common', value: 25 },
  'treasure_map': { name: 'Treasure Map', rarity: 'rare', value: 0, type: 'quest_item' },
  
  // Quest items
  'quest_clue': { name: 'Mysterious Clue', rarity: 'uncommon', value: 0, type: 'quest_item' },
  'quest_key': { name: 'Ornate Key', rarity: 'rare', value: 0, type: 'quest_item' },
  'quest_letter': { name: 'Sealed Letter', rarity: 'uncommon', value: 0, type: 'quest_item' }
};

/**
 * Add item to inventory
 * @param {Array} inventory - Current inventory
 * @param {string} itemKey - Item key from ITEM_CATALOG
 * @param {number} quantity - Amount to add (default 1)
 * @returns {Array} Updated inventory
 */
export const addItem = (inventory, itemKey, quantity = 1) => {
  const itemDef = ITEM_CATALOG[itemKey];
  const newInventory = [...inventory];
  
  // Check if stackable item already exists
  if (itemDef?.stackable) {
    const existing = newInventory.find(i => i.key === itemKey);
    if (existing) {
      existing.quantity += quantity;
      return newInventory;
    }
  }
  
  // Add new item
  newInventory.push({
    key: itemKey,
    name: itemDef?.name || itemKey,
    rarity: itemDef?.rarity || 'common',
    value: itemDef?.value || 0,
    quantity,
    ...(itemDef || {})
  });
  
  return newInventory;
};

/**
 * Remove item from inventory
 * @param {Array} inventory - Current inventory
 * @param {string} itemKey - Item key to remove
 * @param {number} quantity - Amount to remove (default 1)
 * @returns {Array} Updated inventory
 */
export const removeItem = (inventory, itemKey, quantity = 1) => {
  const newInventory = [...inventory];
  const index = newInventory.findIndex(i => i.key === itemKey);
  
  if (index === -1) return newInventory;
  
  if (newInventory[index].quantity > quantity) {
    newInventory[index].quantity -= quantity;
  } else {
    newInventory.splice(index, 1);
  }
  
  return newInventory;
};

/**
 * Add gold to character
 * @param {Object} character - Character object
 * @param {number} amount - Gold to add
 * @returns {Object} Updated character
 */
export const addGold = (character, amount) => {
  return {
    ...character,
    gold: (character.gold || 0) + amount
  };
};

/**
 * Remove gold from character
 * @param {Object} character - Character object
 * @param {number} amount - Gold to remove
 * @returns {Object|null} Updated character or null if insufficient funds
 */
export const removeGold = (character, amount) => {
  if ((character.gold || 0) < amount) return null;
  
  return {
    ...character,
    gold: character.gold - amount
  };
};

/**
 * Get inventory value
 * @param {Array} inventory - Inventory array
 * @returns {number} Total value in gold
 */
export const getInventoryValue = (inventory) => {
  return inventory.reduce((total, item) => {
    return total + (item.value * (item.quantity || 1));
  }, 0);
};

/**
 * Get rarity color for display
 * @param {string} rarity - Item rarity
 * @returns {string} CSS color
 */
export const getRarityColor = (rarity) => {
  const colors = {
    common: '#9d9d9d',
    uncommon: '#1eff00',
    rare: '#0070dd',
    very_rare: '#a335ee',
    legendary: '#ff8000'
  };
  return colors[rarity] || colors.common;
};
