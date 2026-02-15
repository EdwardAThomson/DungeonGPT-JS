import { encounterTables, biomeEncounterChance, revisitEncounterMultiplier } from '../data/encounterTables';
import { encounterTemplates } from '../data/encounters';

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

  // Fall back to tile biome
  if (tile.biome === 'water') return 'water';
  if (tile.biome === 'beach') return 'beach';

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

  return Math.random() < chance;
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
  const table = encounterTables[biome] || encounterTables['plains'];

  const roll = weightedRandom(table);

  if (roll.template === 'none') return null;

  const template = encounterTemplates[roll.template];
  if (!template) {
    console.warn(`[ENCOUNTER] Template not found: ${roll.template}`);
    return null;
  }

  return {
    ...template,
    templateKey: roll.template,
    isHostile: roll.hostile !== false,
    sourceBiome: biome
  };
};

/**
 * Convenience function: check + roll in one call.
 * Returns an encounter object or null.
 * 
 * @param {Object} tile - The map tile
 * @param {boolean} isFirstVisit - First time visiting this tile
 * @param {Object} settings - Game settings
 * @param {number} movesSinceLastEncounter - Moves since last encounter
 * @returns {Object|null} The encounter or null
 */
export const checkForEncounter = (tile, isFirstVisit, settings, movesSinceLastEncounter = 0) => {
  if (!shouldTriggerEncounter(tile, isFirstVisit, settings, movesSinceLastEncounter)) {
    return null;
  }

  return rollRandomEncounter(tile, settings);
};
