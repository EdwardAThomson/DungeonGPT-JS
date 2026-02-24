// Phase 4: Progression System
// XP curves, leveling, and stat bonuses

// XP thresholds for each level (slow progression, narrative-focused)
// Scaled for encounter-based progression
// Expect ~20-30 encounters per level at early levels, scaling up
export const XP_THRESHOLDS = [
  0,       // Level 1 (starting)
  300,     // Level 2
  900,     // Level 3
  2700,    // Level 4
  6500,    // Level 5
  14000,   // Level 6
  23000,   // Level 7
  34000,   // Level 8
  48000,   // Level 9
  64000,   // Level 10
  85000,   // Level 11
  100000,  // Level 12
  120000,  // Level 13
  140000,  // Level 14
  165000,  // Level 15
  195000,  // Level 16
  225000,  // Level 17
  265000,  // Level 18
  305000,  // Level 19
  355000   // Level 20 (max)
];

export const MAX_LEVEL = 20;

/**
 * Calculate level from XP
 * @param {number} xp - Current XP
 * @returns {number} Current level (1-20)
 */
export const calculateLevel = (xp) => {
  for (let i = XP_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= XP_THRESHOLDS[i]) {
      return i + 1;
    }
  }
  return 1;
};

/**
 * Get XP required for next level
 * @param {number} currentLevel - Current level
 * @returns {number} XP needed for next level, or Infinity if max
 */
export const xpForNextLevel = (currentLevel) => {
  if (currentLevel >= MAX_LEVEL) return Infinity;
  return XP_THRESHOLDS[currentLevel];
};

/**
 * Get XP progress towards next level
 * @param {number} xp - Current XP
 * @returns {Object} { current, required, percentage, isMaxLevel }
 */
export const getLevelProgress = (xp) => {
  const level = calculateLevel(xp);
  
  if (level >= MAX_LEVEL) {
    return {
      current: xp,
      required: XP_THRESHOLDS[MAX_LEVEL - 1],
      percentage: 100,
      isMaxLevel: true
    };
  }
  
  const currentThreshold = XP_THRESHOLDS[level - 1];
  const nextThreshold = XP_THRESHOLDS[level];
  const xpIntoLevel = xp - currentThreshold;
  const xpNeeded = nextThreshold - currentThreshold;
  
  return {
    current: xpIntoLevel,
    required: xpNeeded,
    percentage: Math.floor((xpIntoLevel / xpNeeded) * 100),
    isMaxLevel: false
  };
};

/**
 * Calculate HP bonus from leveling
 * Based on class and Constitution modifier
 * @param {string} characterClass - Character class
 * @param {number} constitutionMod - CON modifier
 * @param {number} level - Character level
 * @returns {number} Total max HP
 */
export const calculateMaxHP = (characterClass, constitutionMod, level) => {
  const hitDice = {
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
  
  const hd = hitDice[characterClass] || 8;
  
  // Level 1: Max hit die + CON mod
  // Each level after: Average roll (hd/2 + 1) + CON mod
  const level1HP = hd + constitutionMod;
  const perLevelHP = Math.floor(hd / 2) + 1 + constitutionMod;
  
  return Math.max(1, level1HP + (perLevelHP * (level - 1)));
};

/**
 * Get stat bonuses for a level
 * Every 4 levels, player gets +2 to distribute
 * @param {number} level - Character level
 * @returns {number} Total ability score improvements earned
 */
export const getAbilityScoreImprovements = (level) => {
  // ASI at levels 4, 8, 12, 16, 19
  const asiLevels = [4, 8, 12, 16, 19];
  return asiLevels.filter(l => level >= l).length;
};

/**
 * Check if a level grants an ability score improvement
 * @param {number} level - Level to check
 * @returns {boolean}
 */
export const levelGrantsASI = (level) => {
  return [4, 8, 12, 16, 19].includes(level);
};

/**
 * Award XP and check for level up
 * @param {Object} character - Character object
 * @param {number} xpGained - XP to award
 * @returns {Object} { character, leveledUp, newLevel, previousLevel }
 */
export const awardXP = (character, xpGained) => {
  const previousLevel = character.level || calculateLevel(character.xp || 0);
  const newXP = (character.xp || 0) + xpGained;
  const newLevel = calculateLevel(newXP);
  const leveledUp = newLevel > previousLevel;
  
  const updatedCharacter = {
    ...character,
    xp: newXP,
    level: newLevel
  };
  
  // If leveled up, recalculate max HP
  if (leveledUp) {
    const conMod = Math.floor(((character.stats?.Constitution || 10) - 10) / 2);
    updatedCharacter.maxHP = calculateMaxHP(character.characterClass, conMod, newLevel);
    // Heal to full on level up
    updatedCharacter.currentHP = updatedCharacter.maxHP;
  }
  
  return {
    character: updatedCharacter,
    leveledUp,
    newLevel,
    previousLevel,
    xpGained
  };
};

/**
 * Initialize progression for a new character
 * @param {Object} character - Base character object
 * @returns {Object} Character with progression fields
 */
export const initializeProgression = (character) => {
  const conMod = Math.floor(((character.stats?.Constitution || 10) - 10) / 2);
  const level = 1;
  const maxHP = calculateMaxHP(character.characterClass, conMod, level);
  
  return {
    ...character,
    xp: 0,
    level: 1,
    maxHP,
    currentHP: maxHP,
    gold: 0,
    inventory: []
  };
};

/**
 * Get level-up summary for display
 * @param {number} previousLevel - Previous level
 * @param {number} newLevel - New level
 * @param {Object} character - Updated character
 * @returns {Object} Summary of what changed
 */
export const getLevelUpSummary = (previousLevel, newLevel, character) => {
  const levelsGained = newLevel - previousLevel;
  const asiEarned = getAbilityScoreImprovements(newLevel) - getAbilityScoreImprovements(previousLevel);
  
  return {
    levelsGained,
    newLevel,
    newMaxHP: character.maxHP,
    asiEarned,
    message: asiEarned > 0 
      ? `Level ${newLevel}! +${asiEarned * 2} ability points to distribute!`
      : `Level ${newLevel}! Your maximum HP has increased!`
  };
};

// XP rewards by encounter difficulty (base values)
export const XP_REWARDS = {
  trivial: 10,
  easy: 25,
  medium: 50,
  hard: 100,
  deadly: 200
};

/**
 * Calculate XP reward for an encounter
 * @param {string} difficulty - Encounter difficulty
 * @param {string} outcome - 'criticalSuccess', 'success', 'failure', 'criticalFailure'
 * @param {number} playerLevel - Current player level
 * @returns {number} XP to award
 */
export const calculateEncounterXP = (difficulty, outcome, playerLevel = 1) => {
  const baseXP = XP_REWARDS[difficulty] || 25;
  
  // Outcome modifiers
  const outcomeMultipliers = {
    criticalSuccess: 1.5,
    success: 1.0,
    failure: 0.5,
    criticalFailure: 0.25
  };
  
  const outcomeMultiplier = outcomeMultipliers[outcome] || 1.0;
  
  // Level scaling: Encounters become less valuable as you out-level them
  // But never less than 25% of base
  const levelScaling = Math.max(0.25, 1 - (playerLevel - 1) * 0.05);
  
  return Math.floor(baseXP * outcomeMultiplier * levelScaling);
};
