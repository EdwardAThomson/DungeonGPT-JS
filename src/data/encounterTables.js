// Biome-specific encounter tables with weighted random selection
// Each entry: { template: key from encounterTemplates, weight: likelihood, hostile: bool }
// Higher weight = more likely. 'none' = no encounter occurs.

export const encounterTables = {
  'plains': [
    // Immediate encounters (combat/urgent)
    { template: 'goblin_ambush', weight: 12, hostile: true },
    { template: 'wolf_pack', weight: 10, hostile: true },
    { template: 'bandit_roadblock', weight: 10, hostile: true },
    
    // Narrative encounters (discovered through conversation)
    { template: 'traveling_merchant', weight: 12, hostile: false },
    { template: 'wandering_minstrel', weight: 8, hostile: false },
    { template: 'lost_child', weight: 7, hostile: false },
    { template: 'herb_gathering', weight: 7, hostile: false },
    { template: 'abandoned_campsite', weight: 8, hostile: false },
    { template: 'mysterious_stranger', weight: 8, hostile: false },
    { template: 'wounded_traveler', weight: 7, hostile: false },
    { template: 'distant_smoke', weight: 6, hostile: false },
    
    { template: 'none', weight: 5 }
  ],

  'forest': [
    // Immediate encounters
    { template: 'giant_spiders', weight: 15, hostile: true },
    { template: 'bear_encounter', weight: 10, hostile: true },
    { template: 'wolf_pack', weight: 8, hostile: true },
    
    // Narrative encounters
    { template: 'elf_patrol', weight: 10, hostile: false },
    { template: 'mysterious_shrine', weight: 7, hostile: false },
    { template: 'herb_gathering', weight: 10, hostile: false },
    { template: 'abandoned_campsite', weight: 7, hostile: false },
    { template: 'hidden_treasure', weight: 6, hostile: false },
    { template: 'distant_smoke', weight: 5, hostile: false },
    
    { template: 'none', weight: 22 }
  ],

  'mountain': [
    // Immediate encounters
    { template: 'rockslide', weight: 15, hostile: true },
    { template: 'bandit_roadblock', weight: 12, hostile: true },
    { template: 'bear_encounter', weight: 8, hostile: true },
    
    // Narrative encounters
    { template: 'mountain_hermit', weight: 12, hostile: false },
    { template: 'mysterious_shrine', weight: 8, hostile: false },
    { template: 'abandoned_campsite', weight: 7, hostile: false },
    { template: 'hidden_treasure', weight: 7, hostile: false },
    { template: 'distant_smoke', weight: 6, hostile: false },
    
    { template: 'none', weight: 25 }
  ],

  'town': [
    // Immediate encounters (rare in towns)
    { template: 'tavern_brawl', weight: 8, hostile: false },
    
    // Narrative encounters (common in towns)
    { template: 'town_market', weight: 20, hostile: false },
    { template: 'town_quest_board', weight: 18, hostile: false },
    { template: 'town_healer', weight: 15, hostile: false },
    { template: 'suspicious_stranger', weight: 12, hostile: false },
    { template: 'wandering_minstrel', weight: 8, hostile: false },
    { template: 'mysterious_stranger', weight: 10, hostile: false },
    
    { template: 'none', weight: 9 }
  ],

  'beach': [
    // Immediate encounters
    { template: 'bandit_roadblock', weight: 8, hostile: true },
    
    // Narrative encounters
    { template: 'traveling_merchant', weight: 12, hostile: false },
    { template: 'abandoned_campsite', weight: 12, hostile: false },
    { template: 'lost_child', weight: 8, hostile: false },
    { template: 'hidden_treasure', weight: 10, hostile: false },
    
    { template: 'none', weight: 50 }
  ]
};

// Base encounter chance per biome (percentage as 0-1)
// Towns are safest, wilderness varies
export const biomeEncounterChance = {
  'plains': 0.30,
  'forest': 0.35,
  'mountain': 0.30,
  'town': 0.40,     // High chance but encounters are non-hostile
  'beach': 0.15,
  'water': 0.0      // No encounters on water
};

// How much the encounter chance drops on revisited tiles (multiplier)
// e.g., 0.3 means 30% of base chance on revisited tiles
export const revisitEncounterMultiplier = {
  'plains': 0.3,
  'forest': 0.4,    // Forests stay a bit more dangerous
  'mountain': 0.35,
  'town': 0.5,      // Towns always have some activity
  'beach': 0.2,
  'water': 0.0
};

// Encounter frequency by tier (Phase 2.4)
// Immediate encounters are rarer but always pop up modal
// Narrative encounters are more common but woven into AI descriptions
export const encounterFrequency = {
  immediate: {
    baseChance: 0.25,      // 25% base for combat encounters
    revisitMultiplier: 0.3  // Much lower on revisited tiles
  },
  narrative: {
    baseChance: 0.35,      // 35% base for narrative encounters
    revisitMultiplier: 0.5  // Still fairly common on revisits
  }
};
