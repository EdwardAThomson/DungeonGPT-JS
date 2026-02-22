import { 
  encounterTables, 
  biomeEncounterChance, 
  revisitEncounterMultiplier,
  poiEncounterTables,
  poiEncounterChance,
  environmentalEncounterTable,
  environmentalEncounterChance
} from '../data/encounterTables';
import { encounterTemplates } from '../data/encounters';
import { createLogger } from './logger';

const logger = createLogger('encounter-generator');

/**
 * Determines the effective biome for encounter purposes.
 * Maps tile properties to encounter table keys.
 */
const getEncounterBiome = (tile) => {
  if (!tile) return 'plains';

  // Towns get their own encounter table
  if (tile.poi === 'town' || tile.poi === 'city' || tile.poi === 'village' || tile.poi === 'hamlet') {
    return 'town';
  }

  // Map poi types to biomes for encounter purposes
  if (tile.poi === 'forest') return 'forest';
  if (tile.poi === 'mountain') return 'mountain';

  // Check tile biome property
  if (tile.biome === 'water') return 'water';
  if (tile.biome === 'beach') return 'beach';
  if (tile.biome === 'forest') return 'forest';
  if (tile.biome === 'mountain') return 'mountain';
  if (tile.biome === 'plains') return 'plains';

  // Default fallback
  return 'plains';
};

/**
 * Weighted random selection from an encounter table.
 * Returns the selected entry.
 */
const weightedRandom = (table) => {
  const totalWeight = table.reduce((sum, entry) => sum + entry.weight, 0);
  let random = Math.random() * totalWeight;

  for (const entry of table) {
    random -= entry.weight;
    if (random <= 0) return entry;
  }

  return table[table.length - 1];
};

/**
 * Check if an encounter should happen on this tile.
 * 
 * @param {Object} tile - The map tile the player moved to
 * @param {boolean} isFirstVisit - Whether this is the first time visiting this tile
 * @param {Object} settings - Game settings (for grimness modifier)
 * @param {number} movesSinceLastEncounter - Moves since last encounter occurred
 * @returns {boolean} Whether an encounter should trigger
 */
export const shouldTriggerEncounter = (tile, isFirstVisit, settings, movesSinceLastEncounter = 0) => {
  const biome = getEncounterBiome(tile);

  // No encounters on water
  if (biome === 'water') return false;

  // Get base chance for this biome
  let chance = biomeEncounterChance[biome] || 0.25;
  const baseChance = chance;

  // Reduce chance on revisited tiles
  if (!isFirstVisit) {
    const multiplier = revisitEncounterMultiplier[biome] || 0.3;
    chance *= multiplier;
  }

  // Grimness modifier: darker campaigns have more encounters
  const grimnessModifier = {
    'Noble': 0.8,
    'Gritty': 1.0,
    'Dark': 1.2,
    'Grimdark': 1.4
  };
  chance *= grimnessModifier[settings?.grimnessLevel] || 1.0;

  // Increase chance slightly if it's been a while since last encounter
  // (prevents long stretches of nothing happening)
  if (movesSinceLastEncounter >= 3) {
    chance += 0.10;
  }
  if (movesSinceLastEncounter >= 5) {
    chance += 0.15;
  }

  // Cap at 70% — always some chance of peaceful travel
  chance = Math.min(chance, 0.70);

  const roll = Math.random();
  logger.debug('[ENCOUNTER DEBUG] shouldTriggerEncounter calc:', {
    baseChance,
    isFirstVisit,
    revisitMultiplier: !isFirstVisit ? (revisitEncounterMultiplier[biome] || 0.3) : 1,
    grimness: settings?.grimnessLevel,
    moveBonus: movesSinceLastEncounter >= 5 ? 0.25 : (movesSinceLastEncounter >= 3 ? 0.10 : 0),
    finalChance: chance,
    roll,
    triggered: roll < chance
  });

  return roll < chance;
};

/**
 * Get the POI type for a tile if applicable.
 * Returns null if the tile doesn't have a POI with special encounters.
 */
const getPoiType = (tile) => {
  if (!tile || !tile.poi) return null;
  
  const poiTypes = ['cave', 'ruins', 'grove', 'forest', 'mountain', 'peak'];
  return poiTypes.includes(tile.poi) ? tile.poi : null;
};

/**
 * Roll a random encounter for a given tile.
 * Returns an encounter template or null if 'none' is rolled.
 * 
 * @param {Object} tile - The map tile
 * @param {Object} settings - Game settings
 * @returns {Object|null} The encounter object or null
 */
export const rollRandomEncounter = (tile, settings) => {
  const biome = getEncounterBiome(tile);
  const poiType = getPoiType(tile);
  
  // Use POI-specific table if available, otherwise biome table
  let table;
  if (poiType && poiEncounterTables[poiType]) {
    table = poiEncounterTables[poiType];
  } else {
    table = encounterTables[biome] || encounterTables['plains'];
  }

  const roll = weightedRandom(table);

  if (roll.template === 'none') return null;

  const template = encounterTemplates[roll.template];
  if (!template) {
    logger.warn(`[ENCOUNTER] Template not found: ${roll.template}`);
    return null;
  }

  return {
    ...template,
    templateKey: roll.template,
    isHostile: roll.hostile !== false,
    encounterTier: roll.hostile !== false ? 'immediate' : 'narrative',
    sourceBiome: biome,
    sourcePoiType: poiType
  };
};

/**
 * Roll for an environmental encounter.
 * These can occur in any biome based on weather/hazard conditions.
 * 
 * @param {Object} tile - The map tile
 * @param {Object} settings - Game settings
 * @returns {Object|null} The environmental encounter or null
 */
export const rollEnvironmentalEncounter = (tile, settings) => {
  const biome = getEncounterBiome(tile);
  const chance = environmentalEncounterChance[biome] || 0.10;
  
  // Apply grimness modifier
  const grimnessModifier = {
    'Noble': 0.7,
    'Gritty': 1.0,
    'Dark': 1.3,
    'Grimdark': 1.5
  };
  const adjustedChance = chance * (grimnessModifier[settings?.grimnessLevel] || 1.0);
  
  if (Math.random() > adjustedChance) return null;
  
  const roll = weightedRandom(environmentalEncounterTable);
  
  if (roll.template === 'none') return null;
  
  const template = encounterTemplates[roll.template];
  if (!template) {
    logger.warn(`[ENCOUNTER] Environmental template not found: ${roll.template}`);
    return null;
  }
  
  return {
    ...template,
    templateKey: roll.template,
    isHostile: false,
    isEnvironmental: true,
    encounterTier: 'immediate',  // Environmental encounters show modal immediately
    sourceBiome: biome
  };
};

/**
 * Check specifically for POI encounters.
 * Higher chance than regular encounters when at a POI.
 * 
 * @param {Object} tile - The map tile
 * @param {boolean} isFirstVisit - First time visiting
 * @param {Object} settings - Game settings
 * @returns {Object|null} The POI encounter or null
 */
export const checkForPoiEncounter = (tile, isFirstVisit, settings) => {
  const poiType = getPoiType(tile);
  if (!poiType) return null;
  
  let chance = poiEncounterChance[poiType] || 0.35;
  
  // Lower chance on revisits
  if (!isFirstVisit) {
    chance *= 0.4;
  }
  
  // Grimness modifier
  const grimnessModifier = {
    'Noble': 0.8,
    'Gritty': 1.0,
    'Dark': 1.15,
    'Grimdark': 1.3
  };
  chance *= grimnessModifier[settings?.grimnessLevel] || 1.0;
  
  if (Math.random() > chance) return null;
  
  const table = poiEncounterTables[poiType];
  const roll = weightedRandom(table);
  
  if (roll.template === 'none') return null;
  
  const template = encounterTemplates[roll.template];
  if (!template) {
    logger.warn(`[ENCOUNTER] POI template not found: ${roll.template}`);
    return null;
  }
  
  return {
    ...template,
    templateKey: roll.template,
    isHostile: roll.hostile !== false,
    encounterTier: roll.hostile !== false ? 'immediate' : 'narrative',
    sourcePoiType: poiType
  };
};

/**
 * Convenience function: check + roll in one call.
 * Now includes POI and environmental encounter checks.
 * Priority: POI encounters > Environmental > Regular biome encounters
 * 
 * @param {Object} tile - The map tile
 * @param {boolean} isFirstVisit - First time visiting this tile
 * @param {Object} settings - Game settings
 * @param {number} movesSinceLastEncounter - Moves since last encounter
 * @returns {Object|null} The encounter or null
 */
export const checkForEncounter = (tile, isFirstVisit, settings, movesSinceLastEncounter = 0) => {
  const biome = getEncounterBiome(tile);
  logger.debug('[ENCOUNTER DEBUG] checkForEncounter called:', {
    tile: { biome: tile?.biome, poi: tile?.poi },
    effectiveBiome: biome,
    isFirstVisit,
    movesSinceLastEncounter,
    baseChance: biomeEncounterChance[biome]
  });
  
  // First check for POI-specific encounters (higher priority)
  const poiEncounter = checkForPoiEncounter(tile, isFirstVisit, settings);
  if (poiEncounter) {
    logger.debug('[ENCOUNTER] POI encounter triggered:', poiEncounter.name);
    return poiEncounter;
  }
  
  // Then check for environmental encounters
  const envEncounter = rollEnvironmentalEncounter(tile, settings);
  if (envEncounter) {
    logger.debug('[ENCOUNTER] Environmental encounter triggered:', envEncounter.name);
    return envEncounter;
  }
  
  // Fall back to regular biome encounters
  const willTrigger = shouldTriggerEncounter(tile, isFirstVisit, settings, movesSinceLastEncounter);
  logger.debug('[ENCOUNTER DEBUG] shouldTriggerEncounter result:', willTrigger);
  
  if (!willTrigger) {
    return null;
  }

  const encounter = rollRandomEncounter(tile, settings);
  if (encounter) {
    logger.debug('[ENCOUNTER] Biome encounter triggered:', encounter.name);
  } else {
    logger.debug('[ENCOUNTER DEBUG] rollRandomEncounter returned null (rolled "none")');
  }
  return encounter;
};
