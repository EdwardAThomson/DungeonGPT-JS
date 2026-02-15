// Biome-specific encounter tables with weighted random selection
// Each entry: { template: key from encounterTemplates, weight: likelihood, hostile: bool }
// Higher weight = more likely. 'none' = no encounter occurs.

export const encounterTables = {
  'plains': [
    { template: 'goblin_ambush', weight: 15, hostile: true },
    { template: 'wolf_pack', weight: 12, hostile: true },
    { template: 'bandit_roadblock', weight: 12, hostile: true },
    { template: 'traveling_merchant', weight: 15, hostile: false },
    { template: 'wandering_minstrel', weight: 10, hostile: false },
    { template: 'lost_child', weight: 8, hostile: false },
    { template: 'herb_gathering', weight: 8, hostile: false },
    { template: 'abandoned_campsite', weight: 10, hostile: false },
    { template: 'none', weight: 10 }
  ],

  'forest': [
    { template: 'giant_spiders', weight: 18, hostile: true },
    { template: 'bear_encounter', weight: 12, hostile: true },
    { template: 'wolf_pack', weight: 10, hostile: true },
    { template: 'elf_patrol', weight: 12, hostile: false },
    { template: 'mysterious_shrine', weight: 8, hostile: false },
    { template: 'herb_gathering', weight: 12, hostile: false },
    { template: 'abandoned_campsite', weight: 8, hostile: false },
    { template: 'none', weight: 20 }
  ],

  'mountain': [
    { template: 'rockslide', weight: 18, hostile: true },
    { template: 'bandit_roadblock', weight: 14, hostile: true },
    { template: 'bear_encounter', weight: 10, hostile: true },
    { template: 'mountain_hermit', weight: 15, hostile: false },
    { template: 'mysterious_shrine', weight: 10, hostile: false },
    { template: 'abandoned_campsite', weight: 8, hostile: false },
    { template: 'none', weight: 25 }
  ],

  'town': [
    { template: 'town_market', weight: 25, hostile: false },
    { template: 'tavern_brawl', weight: 15, hostile: false },
    { template: 'town_quest_board', weight: 20, hostile: false },
    { template: 'town_healer', weight: 15, hostile: false },
    { template: 'suspicious_stranger', weight: 10, hostile: false },
    { template: 'wandering_minstrel', weight: 5, hostile: false },
    { template: 'none', weight: 10 }
  ],

  'beach': [
    { template: 'traveling_merchant', weight: 15, hostile: false },
    { template: 'abandoned_campsite', weight: 15, hostile: false },
    { template: 'lost_child', weight: 10, hostile: false },
    { template: 'bandit_roadblock', weight: 10, hostile: true },
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
