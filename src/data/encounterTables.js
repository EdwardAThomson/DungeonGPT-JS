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

// === PHASE 3: POI-SPECIFIC ENCOUNTER TABLES ===

// Cave POI encounters
export const caveEncounterTable = [
  // Immediate encounters
  { template: 'cave_bats', weight: 15, hostile: false },
  { template: 'cave_spider_nest', weight: 12, hostile: true },
  { template: 'cave_treasure_guardian', weight: 5, hostile: true },

  // Narrative encounters
  { template: 'cave_entrance', weight: 20, hostile: false },
  { template: 'cave_underground_lake', weight: 15, hostile: false },

  { template: 'none', weight: 33 }
];

// Ruins POI encounters
export const ruinsEncounterTable = [
  // Immediate encounters
  { template: 'ruin_ghost', weight: 12, hostile: true },
  { template: 'ruin_cultists', weight: 8, hostile: true },

  // Narrative encounters
  { template: 'ruin_entrance', weight: 20, hostile: false },
  { template: 'ruin_treasure_vault', weight: 12, hostile: false },
  { template: 'ruin_ancient_library', weight: 15, hostile: false },

  { template: 'none', weight: 33 }
];

// Grove/Forest POI encounters
export const groveEncounterTable = [
  // Immediate encounters
  { template: 'forest_beast', weight: 10, hostile: true },

  // Narrative encounters
  { template: 'sacred_grove', weight: 20, hostile: false },
  { template: 'dryad_encounter', weight: 15, hostile: false },
  { template: 'fairy_ring', weight: 12, hostile: false },

  { template: 'none', weight: 43 }
];

// Mountain POI encounters
export const mountainEncounterTable = [
  // Immediate encounters
  { template: 'mountain_dragon', weight: 5, hostile: true },

  // Narrative encounters
  { template: 'mountain_pass', weight: 20, hostile: false },
  { template: 'mountain_hermit', weight: 18, hostile: false },
  { template: 'mountain_eagle_nest', weight: 15, hostile: false },

  { template: 'none', weight: 42 }
];

// Environmental encounters (can occur in any biome)
export const environmentalEncounterTable = [
  // Immediate
  { template: 'sudden_storm', weight: 15, hostile: false },
  { template: 'earthquake', weight: 5, hostile: false },

  // Narrative
  { template: 'thick_fog', weight: 20, hostile: false },
  { template: 'heat_wave', weight: 12, hostile: false },
  { template: 'strange_lights', weight: 15, hostile: false },

  { template: 'none', weight: 33 }
];

// Map POI types to their encounter tables
export const poiEncounterTables = {
  'cave': caveEncounterTable,
  'ruins': ruinsEncounterTable,
  'grove': groveEncounterTable,
  'forest': groveEncounterTable,  // forests use grove table
  'mountain': mountainEncounterTable,
  'peak': mountainEncounterTable  // peaks use mountain table
};

// Environmental encounter chance by biome
export const environmentalEncounterChance = {
  'plains': 0.15,
  'forest': 0.10,
  'mountain': 0.20,
  'beach': 0.12,
  'desert': 0.25,   // deserts have more environmental hazards
  'swamp': 0.18,
  'town': 0.05      // minimal environmental encounters in towns
};

// POI encounter chance (when player is at a POI tile)
export const poiEncounterChance = {
  'cave': 0.50,     // caves almost always have something
  'ruins': 0.45,
  'grove': 0.35,
  'mountain': 0.40,
  'peak': 0.35
};
