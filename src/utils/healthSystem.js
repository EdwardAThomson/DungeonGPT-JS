/**
 * Health/HP system for tracking character vitality
 * Integrates with narrative-first encounter system
 */

import { calculateModifier } from './rules';

/**
 * Hit dice per class, used for HP gained on level-up.
 */
export const HIT_DICE = {
  'Barbarian': 12,
  'Fighter': 10,
  'Paladin': 10,
  'Ranger': 10,
  'Cleric': 8,
  'Druid': 8,
  'Monk': 8,
  'Rogue': 8,
  'Warlock': 8,
  'Bard': 8,
  'Sorcerer': 6,
  'Wizard': 6
};

/**
 * SINGLE SOURCE OF TRUTH for max HP (issue #48).
 *
 * Level 1 preserves the original creation-time formula exactly
 * (10 + conMod * 5, clamped 5-30) so existing saves keep their HP on load.
 * Each level beyond 1 adds a class hit-die average (floor(hd/2) + 1 + conMod),
 * clamped to a minimum of +1 so max HP is monotonically non-decreasing.
 *
 * `progressionSystem.calculateMaxHP` delegates here; do not fork the formula.
 *
 * @param {string} characterClass - Class name (unknown/missing falls back to d8)
 * @param {number} constitutionMod - CON modifier
 * @param {number} level - Character level (missing/invalid treated as 1)
 * @returns {number} Max HP
 */
export const calculateMaxHPForLevel = (characterClass, constitutionMod, level = 1) => {
  const conMod = Number.isFinite(constitutionMod) ? constitutionMod : 0;

  // Level 1: original creation-time value, unchanged (min 5, max 30).
  const level1HP = Math.max(5, Math.min(30, 10 + conMod * 5));

  const lvl = Math.max(1, Math.floor(Number(level) || 1));
  if (lvl === 1) return level1HP;

  const hd = HIT_DICE[characterClass] || 8;
  // At least +1 HP per level so leveling never lowers max HP.
  const perLevelHP = Math.max(1, Math.floor(hd / 2) + 1 + conMod);

  return level1HP + perLevelHP * (lvl - 1);
};

/**
 * Calculate maximum HP based on character stats (level-aware).
 * Heroes store their class as `heroClass` (HeroCreation); debug/legacy
 * characters use `characterClass` — resolve both (HeroModal convention).
 */
export const calculateMaxHP = (character) => {
  const constitutionMod = calculateModifier(character?.stats?.Constitution || 10);
  const characterClass = character?.characterClass || character?.heroClass;
  return calculateMaxHPForLevel(characterClass, constitutionMod, character?.level || 1);
};

/**
 * Initialize HP for a character if not already set
 */
export const initializeHP = (character) => {
  if (character.currentHP === undefined || character.maxHP === undefined) {
    const maxHP = calculateMaxHP(character);
    return {
      ...character,
      maxHP,
      currentHP: maxHP
    };
  }
  return character;
};

/**
 * Calculate damage based on encounter outcome
 */
export const calculateDamage = (outcomeTier, maxHP, encounterDifficulty) => {
  const difficultyMultiplier = {
    'trivial': 0.5,
    'easy': 0.75,
    'medium': 1.0,
    'hard': 1.25,
    'deadly': 1.5
  };
  
  const multiplier = difficultyMultiplier[encounterDifficulty] || 1.0;
  
  let baseDamage = 0;
  
  switch (outcomeTier) {
    case 'criticalFailure':
      baseDamage = Math.floor(maxHP * 0.4 * multiplier); // 40% of max HP
      break;
    case 'failure':
      baseDamage = Math.floor(maxHP * 0.15 * multiplier); // 15% of max HP
      break;
    case 'success':
      baseDamage = Math.floor(maxHP * 0.05 * multiplier); // 5% of max HP (minor scrapes)
      break;
    case 'criticalSuccess':
      baseDamage = 0; // No damage on critical success
      break;
    default:
      baseDamage = 0;
  }
  
  // Add some randomness (±20%)
  const variance = Math.floor(baseDamage * 0.2);
  const randomVariance = Math.floor(Math.random() * (variance * 2 + 1)) - variance;
  
  return Math.max(0, baseDamage + randomVariance);
};

/**
 * Apply damage to a character
 */
export const applyDamage = (character, damage) => {
  const newHP = Math.max(0, character.currentHP - damage);
  
  return {
    ...character,
    currentHP: newHP,
    isDefeated: newHP === 0
  };
};

/**
 * Apply healing to a character
 */
export const applyHealing = (character, healing) => {
  const newHP = Math.min(character.maxHP, character.currentHP + healing);
  
  return {
    ...character,
    currentHP: newHP,
    isDefeated: false
  };
};

/**
 * Rest mechanics
 */
export const shortRest = (character) => {
  const healing = Math.floor(character.maxHP * 0.5);
  return applyHealing(character, healing);
};

export const longRest = (character) => {
  return {
    ...character,
    currentHP: character.maxHP,
    isDefeated: false
  };
};

/**
 * Get HP status description for narrative
 */
export const getHPStatus = (currentHP, maxHP) => {
  const percentage = (currentHP / maxHP) * 100;
  
  if (percentage === 0) return { status: 'defeated', color: '#e74c3c', description: 'Defeated' };
  if (percentage <= 25) return { status: 'critical', color: '#e74c3c', description: 'Critically Wounded' };
  if (percentage <= 50) return { status: 'wounded', color: '#f39c12', description: 'Wounded' };
  if (percentage <= 75) return { status: 'injured', color: '#f1c40f', description: 'Injured' };
  if (percentage < 100) return { status: 'healthy', color: '#27ae60', description: 'Healthy' };
  return { status: 'full', color: '#27ae60', description: 'Full Health' };
};

/**
 * Determine if encounter should deal damage (hostile encounters only)
 */
export const shouldDealDamage = (encounter) => {
  const hostileKeywords = ['goblin', 'wolf', 'bandit', 'spider', 'bear', 'ambush', 'attack'];
  const encounterName = encounter.name.toLowerCase();
  
  return hostileKeywords.some(keyword => encounterName.includes(keyword));
};

/**
 * Get damage description for narration
 */
export const getDamageDescription = (damage, maxHP) => {
  const percentage = (damage / maxHP) * 100;
  
  if (damage === 0) return 'You emerge unscathed.';
  if (percentage >= 30) return 'You suffer grievous wounds!';
  if (percentage >= 15) return 'You take significant damage.';
  if (percentage >= 5) return 'You sustain minor injuries.';
  return 'You barely feel a scratch.';
};
