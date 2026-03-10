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

  const multiplier = outcomeMultipliers[outcome] ?? 1.0;

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
  'healing_potion': { name: 'Healing Potion', rarity: 'common', value: 50, effect: 'heal', amount: '2d4+2', icon: 'assets/icons/items/healing_potion.webp' },
  'antidote': { name: 'Antidote', rarity: 'common', value: 25, effect: 'cure_poison', icon: 'assets/icons/items/antidote.webp' },
  'rations': { name: 'Trail Rations', rarity: 'common', value: 5, stackable: true, icon: 'assets/icons/items/rations.webp' },
  'torch': { name: 'Torch', rarity: 'common', value: 1, stackable: true, icon: 'assets/icons/items/torch.webp' },
  'rope': { name: 'Rope (50ft)', rarity: 'common', value: 10, icon: 'assets/icons/items/rope.webp' },

  // Uncommon items
  'greater_healing_potion': { name: 'Greater Healing Potion', rarity: 'uncommon', value: 150, effect: 'heal', amount: '4d4+4', icon: 'assets/icons/items/greater_healing_potion.webp' },
  'scroll_fireball': { name: 'Fire Scroll', rarity: 'uncommon', value: 200, effect: 'spell', spell: 'fireball', icon: 'assets/icons/items/scroll_fireball.webp' },
  'silver_dagger': { name: 'Silver Dagger', rarity: 'uncommon', value: 100, type: 'weapon', icon: 'assets/icons/items/silver_dagger.webp' },

  // Rare items
  'magic_weapon': { name: 'Enchanted Blade', rarity: 'rare', value: 500, type: 'weapon', bonus: '+1', icon: 'assets/icons/items/magic_weapon.webp' },
  'ring_protection': { name: 'Protective Ring', rarity: 'rare', value: 750, type: 'ring', bonus: '+1 defense', icon: 'assets/icons/items/ring_protection.webp' },

  // Very Rare
  'legendary_weapon': { name: 'Legendary Weapon', rarity: 'very_rare', value: 2500, type: 'weapon', bonus: '+2', icon: 'assets/icons/items/legendary_weapon.webp' },
  'legendary_artifact': { name: 'Mythic Ancient Artifact', rarity: 'very_rare', value: 5000, type: 'artifact', icon: 'assets/icons/items/legendary_artifact.webp' },
  'crown_of_sunfire': { name: 'Crown of Sunfire', rarity: 'very_rare', value: 7500, type: 'artifact', description: 'A radiant golden crown that blazes with inner fire. Said to grant its wearer dominion over light and shadow.', icon: `assets/icons/items/crown_of_sunfire.webp` },
  'seal_of_binding': { name: 'Seal of Binding', rarity: 'very_rare', value: 6000, type: 'artifact', description: 'An ancient seal inscribed with eldritch wards. It can imprison entities from beyond the veil.', icon: `assets/icons/items/seal_of_binding.webp` },
  'purified_heart_shard': { name: 'Purified Heart Shard', rarity: 'very_rare', value: 5000, type: 'artifact', description: 'A crystallized fragment of the Rot-Heart, cleansed of corruption. It pulses with faint, warm light.', icon: `assets/icons/items/purified_heart_shard.webp` },
  'magic_item': { name: 'Magic Item', rarity: 'uncommon', value: 200, icon: 'assets/icons/items/spell_scroll.webp' },
  'magic_scroll': { name: 'Enchanted Scroll', rarity: 'uncommon', value: 150, icon: 'assets/icons/items/spell_scroll.webp' },

  // POI-specific items
  'cave_mushrooms': { name: 'Glowing Cave Mushrooms', rarity: 'common', value: 15, stackable: true, icon: 'assets/icons/items/cave_mushrooms.webp' },
  'raw_gems': { name: 'Raw Gemstones', rarity: 'uncommon', value: 75, icon: 'assets/icons/items/raw_gems.webp' },
  'spider_silk': { name: 'Giant Spider Silk', rarity: 'uncommon', value: 50, icon: 'assets/icons/items/spider_silk.webp' },
  'bat_guano': { name: 'Alchemical Reagent', rarity: 'common', value: 10, stackable: true, icon: 'assets/icons/items/bat_guano.webp' },
  'ancient_scroll': { name: 'Ancient Scroll', rarity: 'uncommon', value: 100, icon: 'assets/icons/items/ancient_scroll.webp' },
  'pearl': { name: 'Pearl', rarity: 'uncommon', value: 100, icon: 'assets/icons/items/pearl.webp' },
  'ectoplasm': { name: 'Ectoplasm', rarity: 'uncommon', value: 75, icon: 'assets/icons/items/ectoplasm.webp' },
  'ritual_dagger': { name: 'Ritual Dagger', rarity: 'uncommon', value: 125, type: 'weapon', icon: 'assets/icons/items/ritual_dagger.webp' },
  'dark_tome': { name: 'Dark Tome', rarity: 'rare', value: 300, icon: 'assets/icons/items/dark_tome.webp' },
  'spell_scroll': { name: 'Spell Scroll', rarity: 'uncommon', value: 50, icon: 'assets/icons/items/spell_scroll.webp' },
  'healing_herbs': { name: 'Healing Herbs', rarity: 'common', value: 20, stackable: true, icon: 'assets/icons/items/healing_herbs.webp' },
  'rare_flower': { name: 'Rare Flower', rarity: 'uncommon', value: 45, icon: 'assets/icons/items/rare_flower.webp' },
  'dryad_blessing': { name: 'Dryad\'s Blessing', rarity: 'rare', value: 0, type: 'blessing', icon: 'assets/icons/items/dryad_blessing.webp' },
  'fairy_dust': { name: 'Fairy Dust', rarity: 'uncommon', value: 100, icon: 'assets/icons/items/fairy_dust.webp' },
  'fey_charm': { name: 'Fey Charm', rarity: 'rare', value: 250, type: 'charm', icon: 'assets/icons/items/fey_charm.webp' },
  'giant_feather': { name: 'Giant Eagle Feather', rarity: 'uncommon', value: 60, icon: 'assets/icons/items/giant_feather.webp' },
  'dragon_scale': { name: 'Dragon Scale', rarity: 'very_rare', value: 1000, icon: 'assets/icons/items/dragon_scale.webp' },
  'mountain_crystal': { name: 'Mountain Crystal', rarity: 'uncommon', value: 80, icon: 'assets/icons/items/mountain_crystal.webp' },
  'storm_crystal': { name: 'Storm Crystal', rarity: 'rare', value: 200, icon: 'assets/icons/items/storm_crystal.webp' },
  'magical_item': { name: 'Magical Artifact', rarity: 'rare', value: 150, icon: 'assets/icons/items/magical_item.webp' },
  'artifact_trinket': { name: 'Ancient Trinket', rarity: 'uncommon', value: 45, icon: 'assets/icons/items/artifact_trinket.webp' },
  'enchanted_trinket': { name: 'Enchanted Trinket', rarity: 'uncommon', value: 65, icon: 'assets/icons/items/enchanted_trinket.webp' },
  'ghostly_trinket': { name: 'Ghostly Trinket', rarity: 'uncommon', value: 60, icon: 'assets/icons/items/ghostly_trinket.webp' },
  'history_tome': { name: 'Ancient History Tome', rarity: 'uncommon', value: 150, icon: 'assets/icons/items/history_tome.webp' },
  'forbidden_knowledge': { name: 'Forbidden Knowledge', rarity: 'rare', value: 300, icon: 'assets/icons/items/forbidden_knowledge.webp' },
  'spirit_essence': { name: 'Spirit Essence', rarity: 'rare', value: 120, icon: 'assets/icons/items/spirit_essence.webp' },
  'primal_essence': { name: 'Primal Essence', rarity: 'rare', value: 150, icon: 'assets/icons/items/primal_essence.webp' },
  'journal_page': { name: 'Torn Journal Page', rarity: 'common', value: 5, icon: 'assets/icons/items/journal_page.webp' },
  'survivor_reward': { name: 'Survivor\'s Gift', rarity: 'common', value: 20, icon: 'assets/icons/items/survivor_reward.webp' },
  'salvaged_goods': { name: 'Salvaged Goods', rarity: 'common', value: 30, icon: 'assets/icons/items/salvaged_goods.webp' },
  'wrapped_corpse_loot': { name: 'Traveler\'s Belongings', rarity: 'common', value: 25, icon: 'assets/icons/items/wrapped_corpse_loot.webp' },
  'exposed_minerals': { name: 'Exposed Minerals', rarity: 'common', value: 20, icon: 'assets/icons/items/exposed_minerals.webp' },
  'hard_leather': { name: 'Hardened Leather', rarity: 'common', value: 15, icon: 'assets/icons/items/hard_leather.webp' },
  'poison_vial': { name: 'Poison Vial', rarity: 'uncommon', value: 45, icon: 'assets/icons/items/poison_vial.webp' },
  'glowing_fungi': { name: 'Glowing Cave Fungi', rarity: 'common', value: 10, stackable: true, icon: 'assets/icons/items/glowing_fungi.webp' },
  'rare_herb': { name: 'Rare Herb', rarity: 'uncommon', value: 40, icon: 'assets/icons/items/rare_herb.webp' },
  'mountain_herbs': { name: 'Mountain Herbs', rarity: 'common', value: 15, icon: 'assets/icons/items/mountain_herbs.webp' },
  'herbal_remedy': { name: 'Herbal Remedy', rarity: 'common', value: 15, effect: 'heal', amount: '1d4', icon: 'assets/icons/items/herbal_remedy.webp' },
  'elven_rations': { name: 'Elven Waybread', rarity: 'uncommon', value: 20, stackable: true, icon: 'assets/icons/items/elven_rations.webp' },
  'natures_blessing': { name: 'Nature\'s Blessing', rarity: 'uncommon', value: 0, type: 'blessing', icon: 'assets/icons/items/natures_blessing.webp' },
  'elven_blessing': { name: 'Elven Blessing', rarity: 'rare', value: 0, type: 'blessing', icon: 'assets/icons/items/elven_blessing.webp' },
  'eagle_blessing': { name: 'Eagle\'s Blessing', rarity: 'rare', value: 0, type: 'blessing', icon: 'assets/icons/items/eagle_blessing.webp' },
  'druid_token': { name: 'Druid Token', rarity: 'uncommon', value: 50, icon: 'assets/icons/items/druid_token.webp' },
  'nature_charm': { name: 'Nature Charm', rarity: 'uncommon', value: 75, icon: 'assets/icons/items/nature_charm.webp' },
  'ancient_gold': { name: 'Ancient Gold Coins', rarity: 'uncommon', value: 100, icon: 'assets/icons/items/ancient_gold.webp' },
  'pixie_gold': { name: 'Pixie Gold', rarity: 'uncommon', value: 50, icon: 'assets/icons/items/pixie_gold.webp' },
  'rare_gem': { name: 'Rare Gemstone', rarity: 'rare', value: 200, icon: 'assets/icons/items/rare_gem.webp' },
  'drowned_treasure': { name: 'Drowned Treasure', rarity: 'uncommon', value: 75, icon: 'assets/icons/items/drowned_treasure.webp' },
  'cult_treasure': { name: 'Cultist Treasure', rarity: 'uncommon', value: 80, icon: 'assets/icons/items/cult_treasure.webp' },
  'fallen_treasure': { name: 'Fallen Treasure', rarity: 'uncommon', value: 50, icon: 'assets/icons/items/fallen_treasure.webp' },
  'dragon_gold': { name: 'Dragon Hoard Gold', rarity: 'rare', value: 500, icon: 'assets/icons/items/dragon_gold.webp' },
  'dragon_egg': { name: 'Dragon Egg', rarity: 'legendary', value: 5000, icon: 'assets/icons/items/dragon_egg.webp' },
  'cave_map': { name: 'Rough Cave Map', rarity: 'uncommon', value: 30, icon: 'assets/icons/items/cave_map.webp' },
  'forest_map': { name: 'Forest Map', rarity: 'uncommon', value: 40, icon: 'assets/icons/items/forest_map.webp' },
  'traveler_map': { name: 'Traveler\'s Map', rarity: 'uncommon', value: 35, icon: 'assets/icons/items/traveler_map.webp' },
  'old_map': { name: 'Old Map', rarity: 'uncommon', value: 35, icon: 'assets/icons/items/old_map.webp' },
  'hermit_wisdom': { name: 'Hermit\'s Wisdom', rarity: 'uncommon', value: 100, icon: 'assets/icons/items/hermit_wisdom.webp' },
  'ancient_artifact': { name: 'Ancient Artifact', rarity: 'rare', value: 400, icon: 'assets/icons/items/ancient_artifact.webp' },
  'enchanted_seed': { name: 'Enchanted Seed', rarity: 'uncommon', value: 35, icon: 'assets/icons/items/enchanted_seed.webp' },
  'enchanted_mushroom': { name: 'Enchanted Mushroom', rarity: 'uncommon', value: 30, icon: 'assets/icons/items/enchanted_mushroom.webp' },
  'enchanted_staff': { name: 'Enchanted Staff', rarity: 'uncommon', value: 250, type: 'weapon', icon: 'assets/icons/items/enchanted_staff.webp' },
  'mountain_view': { name: 'Memory of a View', rarity: 'common', value: 0, icon: 'assets/icons/items/mountain_view.webp' },

  // Environmental / natural loot (used by environmental & POI encounters)
  'rainwater': { name: 'Collected Rainwater', rarity: 'common', value: 5, stackable: true, icon: 'assets/icons/items/rainwater.webp' },
  'fog_essence': { name: 'Fog Essence', rarity: 'uncommon', value: 60, icon: 'assets/icons/items/fog_essence.webp' },
  'desert_flower': { name: 'Desert Flower', rarity: 'uncommon', value: 35, icon: 'assets/icons/items/desert_flower.webp' },
  'wisp_essence': { name: 'Wisp Essence', rarity: 'rare', value: 120, icon: 'assets/icons/items/wisp_essence.webp' },
  'cave_fish': { name: 'Cave Fish', rarity: 'common', value: 8, stackable: true, icon: 'assets/icons/items/cave_fish.webp' },
  'beast_hide': { name: 'Beast Hide', rarity: 'common', value: 20, icon: 'assets/icons/items/beast_hide.webp' },
  'enchanted_tusk': { name: 'Enchanted Tusk', rarity: 'rare', value: 150, icon: 'assets/icons/items/enchanted_tusk.webp' },

  // Generic loot
  'gold_coins': { name: 'Gold Coins', rarity: 'common', value: 0, isGold: true, icon: 'assets/icons/items/gold_coins.webp' },
  'old_coins': { name: 'Ancient Coins', rarity: 'common', value: 25, icon: 'assets/icons/items/old_coins.webp' },
  'treasure_map': { name: 'Treasure Map', rarity: 'rare', value: 0, type: 'quest_item', icon: 'assets/icons/items/treasure_map.webp' },
  // Quest items
  'quest_clue': { name: 'Mysterious Clue', rarity: 'uncommon', value: 0, type: 'quest_item', icon: 'assets/icons/items/quest_clue.webp' },
  'quest_key': { name: 'Ornate Key', rarity: 'rare', value: 0, type: 'quest_item', icon: 'assets/icons/items/quest_key.webp' },
  'quest_letter': { name: 'Sealed Letter', rarity: 'uncommon', value: 0, type: 'quest_item', icon: 'assets/icons/items/quest_letter.webp' },
  'mysterious_letter': { name: 'Mysterious Letter', rarity: 'uncommon', value: 0, type: 'quest_item', icon: 'assets/icons/items/mysterious_letter.webp' },

  // Monster drops
  'wolf_pelt': { name: 'Wolf Pelt', rarity: 'common', value: 15, stackable: true, icon: 'assets/icons/items/wolf_pelt.webp' },
  'wolf_fang': { name: 'Wolf Fang', rarity: 'common', value: 10, stackable: true, icon: 'assets/icons/items/wolf_fang.webp' },
  'goblin_ear': { name: 'Goblin Ear', rarity: 'common', value: 5, stackable: true, icon: 'assets/icons/items/goblin_ear.webp' },
  'spider_venom': { name: 'Spider Venom', rarity: 'uncommon', value: 35, icon: 'assets/icons/items/spider_venom.webp' },
  'bandit_badge': { name: 'Bandit Badge', rarity: 'common', value: 20, icon: 'assets/icons/items/bandit_badge.webp' },
  'bear_claw': { name: 'Bear Claw', rarity: 'uncommon', value: 25, icon: 'assets/icons/items/bear_claw.webp' },
  'bear_pelt': { name: 'Bear Pelt', rarity: 'uncommon', value: 40, icon: 'assets/icons/items/bear_pelt.webp' },
  'venom_sac': { name: 'Venom Sac', rarity: 'uncommon', value: 45, icon: 'assets/icons/items/venom_sac.webp' },

  // Encounter loot
  'rusty_dagger': { name: 'Rusty Dagger', rarity: 'common', value: 5, type: 'weapon', icon: 'assets/icons/items/rusty_dagger.webp' },
  'shortsword': { name: 'Shortsword', rarity: 'common', value: 25, type: 'weapon', icon: 'assets/icons/items/shortsword.webp' },
  'leather_armor': { name: 'Leather Armor', rarity: 'common', value: 30, type: 'armor', icon: 'assets/icons/items/leather_armor.webp' },
  'artifact_fragment': { name: 'Artifact Fragment', rarity: 'uncommon', value: 0, type: 'quest_item', icon: 'assets/icons/items/artifact_fragment.webp' },
  'inspiration': { name: 'Minstrel\'s Blessing', rarity: 'uncommon', value: 0, type: 'buff', icon: 'assets/icons/items/inspiration.webp' },
  'divine_blessing': { name: 'Divine Blessing', rarity: 'rare', value: 0, type: 'blessing', icon: 'assets/icons/items/divine_blessing.webp' },
  'ancient_knowledge': { name: 'Ancient Knowledge', rarity: 'rare', value: 0, type: 'lore', icon: 'assets/icons/items/ancient_knowledge.webp' },
  'cursed_item': { name: 'Cursed Trinket', rarity: 'rare', value: 0, type: 'cursed', icon: 'assets/icons/items/cursed_item.webp' },
  'rare_ore': { name: 'Rare Ore', rarity: 'uncommon', value: 60, icon: 'assets/icons/items/rare_ore.webp' },
  'family_heirloom': { name: 'Family Heirloom', rarity: 'uncommon', value: 50, icon: 'assets/icons/items/family_heirloom.webp' },
  'ale_mug': { name: 'Ale Mug', rarity: 'common', value: 2, icon: 'assets/icons/items/ale_mug.webp' },
  'bar_stool_leg': { name: 'Bar Stool Leg', rarity: 'common', value: 1, type: 'weapon', icon: 'assets/icons/items/bar_stool_leg.webp' },
  'stolen_goods': { name: 'Stolen Goods', rarity: 'uncommon', value: 35, icon: 'assets/icons/items/stolen_goods.webp' },
  'poisoned_dagger': { name: 'Poisoned Dagger', rarity: 'uncommon', value: 75, type: 'weapon', icon: 'assets/icons/items/poisoned_dagger.webp' },
  'rare_ingredient': { name: 'Rare Ingredient', rarity: 'uncommon', value: 40, icon: 'assets/icons/items/rare_ingredient.webp' },

  // Encounter reward items
  'medical_journal': { name: 'Medical Journal', rarity: 'uncommon', value: 30, icon: 'assets/icons/items/medical_journal.webp' },
  'medicine_kit': { name: 'Medicine Kit', rarity: 'uncommon', value: 45, effect: 'heal', amount: '2d4', icon: 'assets/icons/items/medicine_kit.webp' },
  'uncovered_ruins': { name: 'Ruins Map Fragment', rarity: 'uncommon', value: 50, type: 'quest_item', icon: 'assets/icons/items/uncovered_ruins.webp' }
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
