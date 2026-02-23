/**
 * Inventory System — Gold management and item tracking.
 * Ported from src/utils/inventorySystem.js — zero behavioral changes.
 */

// ── Types ────────────────────────────────────────────────────────────────────

/** Item rarity levels. */
export type ItemRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "very_rare"
  | "legendary";

/** Item catalog entry definition. */
export interface ItemDefinition {
  readonly name: string;
  readonly rarity: ItemRarity;
  readonly value: number;
  readonly effect?: string;
  readonly amount?: string;
  readonly type?: string;
  readonly bonus?: string;
  readonly spell?: string;
  readonly stackable?: boolean;
  readonly isGold?: boolean;
}

/** An item instance in a character's inventory. */
export interface InventoryItem {
  readonly key: string;
  readonly name: string;
  readonly rarity: string;
  readonly value: number;
  quantity: number;
  readonly effect?: string;
  readonly amount?: string;
  readonly type?: string;
  readonly bonus?: string;
  readonly spell?: string;
  readonly stackable?: boolean;
  readonly isGold?: boolean;
}

/** Encounter outcome tier. */
export type InventoryOutcome =
  | "criticalSuccess"
  | "success"
  | "failure"
  | "criticalFailure";

/** Processed rewards from an encounter. */
export interface ProcessedRewards {
  readonly xp: number;
  readonly gold: number;
  readonly items: readonly string[];
}

/** Raw rewards template from encounter data. */
export interface RawRewards {
  readonly xp?: number;
  readonly gold?: string | number;
  readonly items?: readonly string[];
}

/** Result from rolling an item drop. */
export interface ItemDropResult {
  readonly name: string;
  readonly chance?: number;
  readonly dropped: boolean;
}

/** Character shape used by gold functions. */
export interface GoldCharacter {
  readonly gold?: number;
}

// ── Dice helpers (internal, matching inventorySystem.js) ─────────────────────

/**
 * Roll dice notation (e.g., "3d10", "2d6+5")
 * NOTE: This is a separate dice roller from dice/index.ts because
 * the original inventorySystem.js had its own implementation.
 */
const rollDiceNotation = (notation: string | number): number => {
  if (typeof notation === "number") return notation;
  if (!notation || notation === "0") return 0;

  // NOTE: This regex is from the original codebase — ported as-is.
  // Split on '+' to handle optional bonus without complex regex.
  const plusIndex = notation.indexOf("+");
  const dicePartRaw = plusIndex === -1 ? notation : notation.slice(0, plusIndex);
  const bonusPart = plusIndex === -1 ? "" : notation.slice(plusIndex + 1);

  const match = /^(\d+)d(\d+)$/.exec(dicePartRaw);
  if (!match) return Number.parseInt(notation, 10) || 0;

  const count = Number.parseInt(match[1] ?? "1", 10);
  const sides = Number.parseInt(match[2] ?? "6", 10);
  const bonus = bonusPart ? Number.parseInt(bonusPart, 10) : 0;
  let total = bonus;

  for (let i = 0; i < count; i++) {
    total += Math.floor(Math.random() * sides) + 1;
  }

  return total;
};

// ── Item drop logic ──────────────────────────────────────────────────────────

/**
 * Parse item drop with chance (e.g., "healing_potion:50%")
 */
export const rollItemDrop = (itemString: string): ItemDropResult => {
  const match = /^(.+):(\d+)%$/.exec(itemString);
  if (!match) {
    return { name: itemString, dropped: true };
  }

  const name = match[1] ?? itemString;
  const chance = Number.parseInt(match[2] ?? "100", 10);
  const roll = Math.random() * 100;

  return {
    name,
    chance,
    dropped: roll <= chance,
  };
};

/**
 * Process encounter rewards.
 */
export const processRewards = (
  rewards: RawRewards | null | undefined,
  outcome: string,
): ProcessedRewards => {
  if (!rewards) return { xp: 0, gold: 0, items: [] };

  // Outcome affects rewards
  const outcomeMultipliers: Record<string, number> = {
    criticalSuccess: 1.5,
    success: 1,
    failure: 0.3,
    criticalFailure: 0,
  };

  const multiplier = outcomeMultipliers[outcome] ?? 1;

  // XP
  const xp = Math.floor((rewards.xp ?? 0) * multiplier);

  // Gold
  let gold = 0;
  if (rewards.gold && multiplier > 0) {
    gold = Math.floor(rollDiceNotation(rewards.gold) * multiplier);
  }

  // Items (only on success or better)
  const items: string[] = [];
  if (rewards.items && multiplier >= 1) {
    for (const itemString of rewards.items) {
      const result = rollItemDrop(itemString);
      if (result.dropped) {
        items.push(result.name);
      }
    }
  }

  return { xp, gold, items };
};

// ── Item catalog ─────────────────────────────────────────────────────────────

/** Item definitions with rarity and value. */
export const ITEM_CATALOG: Record<string, ItemDefinition> = {
  // Common items
  healing_potion: {
    name: "Healing Potion",
    rarity: "common",
    value: 50,
    effect: "heal",
    amount: "2d4+2",
  },
  antidote: { name: "Antidote", rarity: "common", value: 25, effect: "cure_poison" },
  rations: {
    name: "Trail Rations",
    rarity: "common",
    value: 5,
    stackable: true,
  },
  torch: { name: "Torch", rarity: "common", value: 1, stackable: true },
  rope: { name: "Rope (50ft)", rarity: "common", value: 10 },

  // Uncommon items
  greater_healing_potion: {
    name: "Greater Healing Potion",
    rarity: "uncommon",
    value: 150,
    effect: "heal",
    amount: "4d4+4",
  },
  scroll_fireball: {
    name: "Scroll of Fireball",
    rarity: "uncommon",
    value: 200,
    effect: "spell",
    spell: "fireball",
  },
  silver_dagger: {
    name: "Silver Dagger",
    rarity: "uncommon",
    value: 100,
    type: "weapon",
  },

  // Rare items
  magic_weapon: {
    name: "Enchanted Blade",
    rarity: "rare",
    value: 500,
    type: "weapon",
    bonus: "+1",
  },
  ring_protection: {
    name: "Ring of Protection",
    rarity: "rare",
    value: 750,
    type: "ring",
    bonus: "+1 AC",
  },

  // Very Rare
  legendary_weapon: {
    name: "Legendary Weapon",
    rarity: "very_rare",
    value: 2500,
    type: "weapon",
    bonus: "+2",
  },
  legendary_artifact: {
    name: "Ancient Artifact",
    rarity: "very_rare",
    value: 5000,
    type: "artifact",
  },

  // POI-specific items
  cave_mushrooms: {
    name: "Glowing Cave Mushrooms",
    rarity: "common",
    value: 15,
    stackable: true,
  },
  raw_gems: { name: "Raw Gemstones", rarity: "uncommon", value: 75 },
  spider_silk: { name: "Giant Spider Silk", rarity: "uncommon", value: 50 },
  bat_guano: {
    name: "Bat Guano (Spell Component)",
    rarity: "common",
    value: 10,
    stackable: true,
  },
  ancient_scroll: { name: "Ancient Scroll", rarity: "uncommon", value: 100 },
  artifact_fragment: {
    name: "Artifact Fragment",
    rarity: "rare",
    value: 200,
  },
  ectoplasm: { name: "Ectoplasm", rarity: "uncommon", value: 75 },
  ritual_dagger: {
    name: "Ritual Dagger",
    rarity: "uncommon",
    value: 125,
    type: "weapon",
  },
  dark_tome: { name: "Dark Tome", rarity: "rare", value: 300 },
  spell_scroll: { name: "Spell Scroll", rarity: "uncommon", value: 150 },
  healing_herbs: {
    name: "Healing Herbs",
    rarity: "common",
    value: 20,
    stackable: true,
  },
  rare_flower: { name: "Rare Flower", rarity: "uncommon", value: 45 },
  dryad_blessing: {
    name: "Dryad's Blessing",
    rarity: "rare",
    value: 0,
    type: "blessing",
  },
  fairy_dust: { name: "Fairy Dust", rarity: "uncommon", value: 100 },
  fey_charm: { name: "Fey Charm", rarity: "rare", value: 250, type: "charm" },
  giant_feather: {
    name: "Giant Eagle Feather",
    rarity: "uncommon",
    value: 60,
  },
  dragon_scale: { name: "Dragon Scale", rarity: "very_rare", value: 1000 },
  mountain_crystal: {
    name: "Mountain Crystal",
    rarity: "uncommon",
    value: 80,
  },
  storm_crystal: { name: "Storm Crystal", rarity: "rare", value: 200 },

  // Generic loot
  gold_coins: {
    name: "Gold Coins",
    rarity: "common",
    value: 0,
    isGold: true,
  },
  gemstone: { name: "Gemstone", rarity: "uncommon", value: 100 },
  pearl: { name: "Pearl", rarity: "uncommon", value: 100 },
  old_coins: { name: "Ancient Coins", rarity: "common", value: 25 },
  treasure_map: {
    name: "Treasure Map",
    rarity: "rare",
    value: 0,
    type: "quest_item",
  },

  // Quest items
  quest_clue: {
    name: "Mysterious Clue",
    rarity: "uncommon",
    value: 0,
    type: "quest_item",
  },
  quest_key: {
    name: "Ornate Key",
    rarity: "rare",
    value: 0,
    type: "quest_item",
  },
  quest_letter: {
    name: "Sealed Letter",
    rarity: "uncommon",
    value: 0,
    type: "quest_item",
  },
  mysterious_letter: {
    name: "Mysterious Letter",
    rarity: "uncommon",
    value: 0,
    type: "quest_item",
  },

  // Monster drops
  wolf_pelt: {
    name: "Wolf Pelt",
    rarity: "common",
    value: 15,
    stackable: true,
  },
  wolf_fang: {
    name: "Wolf Fang",
    rarity: "common",
    value: 10,
    stackable: true,
  },
  goblin_ear: {
    name: "Goblin Ear",
    rarity: "common",
    value: 5,
    stackable: true,
  },
  spider_venom: { name: "Spider Venom", rarity: "uncommon", value: 35 },
  bandit_badge: { name: "Bandit Badge", rarity: "common", value: 20 },
  bear_claw: { name: "Bear Claw", rarity: "uncommon", value: 25 },
  bear_pelt: { name: "Bear Pelt", rarity: "uncommon", value: 40 },
  venom_sac: { name: "Venom Sac", rarity: "uncommon", value: 45 },

  // Encounter loot
  rusty_dagger: {
    name: "Rusty Dagger",
    rarity: "common",
    value: 5,
    type: "weapon",
  },
  shortsword: {
    name: "Shortsword",
    rarity: "common",
    value: 25,
    type: "weapon",
  },
  leather_armor: {
    name: "Leather Armor",
    rarity: "common",
    value: 30,
    type: "armor",
  },
  map_fragment: {
    name: "Map Fragment",
    rarity: "uncommon",
    value: 0,
    type: "quest_item",
  },
  inspiration: {
    name: "Bardic Inspiration",
    rarity: "uncommon",
    value: 0,
    type: "buff",
  },
  divine_blessing: {
    name: "Divine Blessing",
    rarity: "rare",
    value: 0,
    type: "blessing",
  },
  ancient_knowledge: {
    name: "Ancient Knowledge",
    rarity: "rare",
    value: 0,
    type: "lore",
  },
  cursed_item: {
    name: "Cursed Trinket",
    rarity: "rare",
    value: 0,
    type: "cursed",
  },
  rare_ore: { name: "Rare Ore", rarity: "uncommon", value: 60 },
  family_heirloom: {
    name: "Family Heirloom",
    rarity: "uncommon",
    value: 50,
  },
  ale_mug: { name: "Tavern Mug", rarity: "common", value: 1 },
  bar_stool_leg: {
    name: "Bar Stool Leg",
    rarity: "common",
    value: 1,
    type: "weapon",
  },
  herbal_remedy: {
    name: "Herbal Remedy",
    rarity: "common",
    value: 15,
    effect: "heal",
    amount: "1d4",
  },
  stolen_goods: { name: "Stolen Goods", rarity: "uncommon", value: 35 },
  poisoned_dagger: {
    name: "Poisoned Dagger",
    rarity: "uncommon",
    value: 75,
    type: "weapon",
  },
  rare_ingredient: {
    name: "Rare Ingredient",
    rarity: "uncommon",
    value: 40,
  },
};

// ── Inventory management ─────────────────────────────────────────────────────

/**
 * Add item to inventory.
 * @param inventory - Current inventory
 * @param itemKey - Item key from ITEM_CATALOG
 * @param quantity - Amount to add (default 1)
 * @returns Updated inventory
 */
export const addItem = (
  inventory: readonly InventoryItem[],
  itemKey: string,
  quantity = 1,
): InventoryItem[] => {
  const itemDef = ITEM_CATALOG[itemKey];
  const newInventory = [...inventory];

  // Check if stackable item already exists
  if (itemDef?.stackable) {
    const existing = newInventory.find((i) => i.key === itemKey);
    if (existing) {
      existing.quantity += quantity;
      return newInventory;
    }
  }

  // Add new item
  newInventory.push({
    key: itemKey,
    name: itemDef?.name ?? itemKey,
    rarity: itemDef?.rarity ?? "common",
    value: itemDef?.value ?? 0,
    quantity,
    ...itemDef,
  });

  return newInventory;
};

/**
 * Remove item from inventory.
 * @param inventory - Current inventory
 * @param itemKey - Item key to remove
 * @param quantity - Amount to remove (default 1)
 * @returns Updated inventory
 */
export const removeItem = (
  inventory: readonly InventoryItem[],
  itemKey: string,
  quantity = 1,
): InventoryItem[] => {
  const newInventory = [...inventory];
  const index = newInventory.findIndex((i) => i.key === itemKey);

  if (index === -1) return newInventory;

  const item = newInventory[index];
  if (item && item.quantity > quantity) {
    item.quantity -= quantity;
  } else {
    newInventory.splice(index, 1);
  }

  return newInventory;
};

/**
 * Add gold to character.
 */
export const addGold = <T extends GoldCharacter>(
  character: T,
  amount: number,
): T => {
  return {
    ...character,
    gold: (character.gold ?? 0) + amount,
  };
};

/**
 * Remove gold from character.
 * @returns Updated character or null if insufficient funds
 */
export const removeGold = <T extends GoldCharacter>(
  character: T,
  amount: number,
): T | null => {
  if ((character.gold ?? 0) < amount) return null;

  return {
    ...character,
    gold: (character.gold ?? 0) - amount,
  };
};

/**
 * Get inventory value.
 * @param inventory - Inventory array
 * @returns Total value in gold
 */
export const getInventoryValue = (
  inventory: readonly InventoryItem[],
): number => {
  return inventory.reduce((total, item) => {
    return total + item.value * (item.quantity || 1);
  }, 0);
};

/**
 * Get rarity color for display.
 */
export const getRarityColor = (rarity: string): string => {
  const colors: Record<string, string> = {
    common: "#9d9d9d",
    uncommon: "#1eff00",
    rare: "#0070dd",
    very_rare: "#a335ee",
    legendary: "#ff8000",
  };
  return colors[rarity] ?? colors["common"] ?? "#9d9d9d";
};
