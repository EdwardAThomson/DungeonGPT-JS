/**
 * Progression System — XP curves, leveling, and stat bonuses.
 * Ported from src/utils/progressionSystem.js — zero behavioral changes.
 */

// ── Types ────────────────────────────────────────────────────────────────────

/** XP progress toward next level. */
export interface LevelProgress {
  readonly current: number;
  readonly required: number;
  readonly percentage: number;
  readonly isMaxLevel: boolean;
}

/** Character shape used by the progression system. */
export interface ProgressionCharacter {
  readonly characterClass: string;
  readonly stats?: {
    readonly Constitution?: number;
    [key: string]: number | undefined;
  };
  readonly xp?: number;
  readonly level?: number;
  readonly maxHP?: number;
  readonly currentHP?: number;
  readonly gold?: number;
  readonly inventory?: readonly unknown[];
}

/** Result of awarding XP to a character. */
export interface XPAwardResult {
  readonly character: ProgressionCharacter;
  readonly leveledUp: boolean;
  readonly newLevel: number;
  readonly previousLevel: number;
  readonly xpGained: number;
}

/** Level-up summary for display. */
export interface LevelUpSummary {
  readonly levelsGained: number;
  readonly newLevel: number;
  readonly newMaxHP: number | undefined;
  readonly asiEarned: number;
  readonly message: string;
}

/** Encounter difficulty keys for XP rewards. */
export type XPDifficulty = "trivial" | "easy" | "medium" | "hard" | "deadly";

/** Outcome tier for encounter XP calculation. */
export type XPOutcome =
  | "criticalSuccess"
  | "success"
  | "failure"
  | "criticalFailure";

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * XP thresholds for each level (slow progression, narrative-focused).
 * Inspired by D&D 5e but scaled for encounter-based progression.
 * Expect ~20-30 encounters per level at early levels, scaling up.
 */
export const XP_THRESHOLDS: readonly number[] = [
  0, // Level 1 (starting)
  300, // Level 2
  900, // Level 3
  2700, // Level 4
  6500, // Level 5
  14_000, // Level 6
  23_000, // Level 7
  34_000, // Level 8
  48_000, // Level 9
  64_000, // Level 10
  85_000, // Level 11
  100_000, // Level 12
  120_000, // Level 13
  140_000, // Level 14
  165_000, // Level 15
  195_000, // Level 16
  225_000, // Level 17
  265_000, // Level 18
  305_000, // Level 19
  355_000, // Level 20 (max)
] as const;

export const MAX_LEVEL = 20;

/** XP rewards by encounter difficulty (base values). */
export const XP_REWARDS: Record<string, number> = {
  trivial: 10,
  easy: 25,
  medium: 50,
  hard: 100,
  deadly: 200,
};

/** Hit dice per character class. */
const HIT_DICE: Record<string, number> = {
  Barbarian: 12,
  Fighter: 10,
  Paladin: 10,
  Ranger: 10,
  Cleric: 8,
  Druid: 8,
  Monk: 8,
  Rogue: 8,
  Warlock: 8,
  Bard: 8,
  Sorcerer: 6,
  Wizard: 6,
};

// ── Functions ────────────────────────────────────────────────────────────────

/**
 * Calculate level from XP.
 * @param xp - Current XP
 * @returns Current level (1-20)
 */
export const calculateLevel = (xp: number): number => {
  for (let i = XP_THRESHOLDS.length - 1; i >= 0; i--) {
    const threshold = XP_THRESHOLDS[i];
    if (threshold !== undefined && xp >= threshold) {
      return i + 1;
    }
  }
  return 1;
};

/**
 * Get XP required for next level.
 * @param currentLevel - Current level
 * @returns XP needed for next level, or Infinity if max
 */
export const xpForNextLevel = (currentLevel: number): number => {
  if (currentLevel >= MAX_LEVEL) return Number.POSITIVE_INFINITY;
  return XP_THRESHOLDS[currentLevel] ?? Number.POSITIVE_INFINITY;
};

/**
 * Get XP progress towards next level.
 * @param xp - Current XP
 * @returns Progress object with current, required, percentage, isMaxLevel
 */
export const getLevelProgress = (xp: number): LevelProgress => {
  const level = calculateLevel(xp);

  if (level >= MAX_LEVEL) {
    return {
      current: xp,
      required: XP_THRESHOLDS[MAX_LEVEL - 1] ?? 0,
      percentage: 100,
      isMaxLevel: true,
    };
  }

  const currentThreshold = XP_THRESHOLDS[level - 1] ?? 0;
  const nextThreshold = XP_THRESHOLDS[level] ?? 0;
  const xpIntoLevel = xp - currentThreshold;
  const xpNeeded = nextThreshold - currentThreshold;

  return {
    current: xpIntoLevel,
    required: xpNeeded,
    percentage: Math.floor((xpIntoLevel / xpNeeded) * 100),
    isMaxLevel: false,
  };
};

/**
 * Calculate HP bonus from leveling.
 * Based on class and Constitution modifier.
 * @param characterClass - Character class
 * @param constitutionMod - CON modifier
 * @param level - Character level
 * @returns Total max HP
 */
export const calculateMaxHP = (
  characterClass: string,
  constitutionMod: number,
  level: number,
): number => {
  const hd = HIT_DICE[characterClass] ?? 8;

  // Level 1: Max hit die + CON mod
  // Each level after: Average roll (hd/2 + 1) + CON mod
  const level1HP = hd + constitutionMod;
  const perLevelHP = Math.floor(hd / 2) + 1 + constitutionMod;

  return Math.max(1, level1HP + perLevelHP * (level - 1));
};

/**
 * Get stat bonuses for a level.
 * Every 4 levels, player gets +2 to distribute.
 * @param level - Character level
 * @returns Total ability score improvements earned
 */
export const getAbilityScoreImprovements = (level: number): number => {
  // ASI at levels 4, 8, 12, 16, 19
  const asiLevels = [4, 8, 12, 16, 19];
  return asiLevels.filter((l) => level >= l).length;
};

/**
 * Check if a level grants an ability score improvement.
 * @param level - Level to check
 * @returns true if this level grants an ASI
 */
export const levelGrantsASI = (level: number): boolean => {
  return [4, 8, 12, 16, 19].includes(level);
};

/**
 * Award XP and check for level up.
 * @param character - Character object
 * @param xpGained - XP to award
 * @returns Object with updated character, whether they leveled up, and level info
 */
export const awardXP = (
  character: ProgressionCharacter,
  xpGained: number,
): XPAwardResult => {
  const previousLevel =
    character.level ?? calculateLevel(character.xp ?? 0);
  const newXP = (character.xp ?? 0) + xpGained;
  const newLevel = calculateLevel(newXP);
  const leveledUp = newLevel > previousLevel;

  let updatedCharacter: ProgressionCharacter = {
    ...character,
    xp: newXP,
    level: newLevel,
  };

  // If leveled up, recalculate max HP
  if (leveledUp) {
    const conMod = Math.floor(
      ((character.stats?.Constitution ?? 10) - 10) / 2,
    );
    const newMaxHP = calculateMaxHP(
      character.characterClass,
      conMod,
      newLevel,
    );
    updatedCharacter = {
      ...updatedCharacter,
      maxHP: newMaxHP,
      // Heal to full on level up
      currentHP: newMaxHP,
    };
  }

  return {
    character: updatedCharacter,
    leveledUp,
    newLevel,
    previousLevel,
    xpGained,
  };
};

/**
 * Initialize progression for a new character.
 * @param character - Base character object
 * @returns Character with progression fields
 */
export const initializeProgression = (
  character: ProgressionCharacter,
): ProgressionCharacter => {
  const conMod = Math.floor(
    ((character.stats?.Constitution ?? 10) - 10) / 2,
  );
  const level = 1;
  const maxHP = calculateMaxHP(character.characterClass, conMod, level);

  return {
    ...character,
    xp: 0,
    level: 1,
    maxHP,
    currentHP: maxHP,
    gold: 0,
    inventory: [],
  };
};

/**
 * Get level-up summary for display.
 * @param previousLevel - Previous level
 * @param newLevel - New level
 * @param character - Updated character
 * @returns Summary of what changed
 */
export const getLevelUpSummary = (
  previousLevel: number,
  newLevel: number,
  character: { readonly maxHP?: number },
): LevelUpSummary => {
  const levelsGained = newLevel - previousLevel;
  const asiEarned =
    getAbilityScoreImprovements(newLevel) -
    getAbilityScoreImprovements(previousLevel);

  return {
    levelsGained,
    newLevel,
    newMaxHP: character.maxHP,
    asiEarned,
    message:
      asiEarned > 0
        ? `Level ${String(newLevel)}! +${String(asiEarned * 2)} ability points to distribute!`
        : `Level ${String(newLevel)}! Your maximum HP has increased!`,
  };
};

/**
 * Calculate XP reward for an encounter.
 * @param difficulty - Encounter difficulty
 * @param outcome - Outcome tier
 * @param playerLevel - Current player level
 * @returns XP to award
 */
export const calculateEncounterXP = (
  difficulty: string,
  outcome: string,
  playerLevel = 1,
): number => {
  const baseXP = XP_REWARDS[difficulty] ?? 25;

  // Outcome modifiers
  const outcomeMultipliers: Record<string, number> = {
    criticalSuccess: 1.5,
    success: 1,
    failure: 0.5,
    criticalFailure: 0.25,
  };

  const outcomeMultiplier = outcomeMultipliers[outcome] ?? 1;

  // Level scaling: Encounters become less valuable as you out-level them
  // But never less than 25% of base
  const levelScaling = Math.max(0.25, 1 - (playerLevel - 1) * 0.05);

  return Math.floor(baseXP * outcomeMultiplier * levelScaling);
};
