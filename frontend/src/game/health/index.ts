/**
 * Health/HP system for tracking character vitality.
 * Integrates with narrative-first encounter system.
 * Ported from src/utils/healthSystem.js — zero behavioral changes.
 */

import { calculateModifier } from "../rules/index.js";

// ── Types ────────────────────────────────────────────────────────────────────

/** Minimal character shape needed by the health system. */
export interface HealthCharacter {
  readonly stats: {
    readonly Constitution?: number;
    [key: string]: number | undefined;
  };
  readonly currentHP: number;
  readonly maxHP: number;
  readonly isDefeated?: boolean;
}

/** Encounter difficulty tiers that affect damage. */
export type EncounterDifficulty =
  | "trivial"
  | "easy"
  | "medium"
  | "hard"
  | "deadly";

/** Outcome tiers from an encounter resolution. */
export type OutcomeTier =
  | "criticalFailure"
  | "failure"
  | "success"
  | "criticalSuccess";

/** HP status descriptor for narrative display. */
export interface HPStatus {
  readonly status: string;
  readonly color: string;
  readonly description: string;
}

/** Minimal encounter shape for hostile-check. */
export interface EncounterForDamageCheck {
  readonly name: string;
}

// ── Functions ────────────────────────────────────────────────────────────────

/**
 * Calculate maximum HP based on character stats.
 */
export const calculateMaxHP = (character: {
  readonly stats: { readonly Constitution?: number };
}): number => {
  const constitutionMod = calculateModifier(
    character.stats.Constitution ?? 10,
  );
  const baseHP = 10;
  const maxHP = baseHP + constitutionMod * 5;

  // Minimum 5 HP, maximum 30 HP
  return Math.max(5, Math.min(30, maxHP));
};

/**
 * Initialize HP for a character if not already set.
 */
export const initializeHP = <
  T extends {
    readonly stats: { readonly Constitution?: number };
    readonly currentHP?: number;
    readonly maxHP?: number;
  },
>(
  character: T,
): T & { readonly currentHP: number; readonly maxHP: number } => {
  if (character.currentHP === undefined || character.maxHP === undefined) {
    const maxHP = calculateMaxHP(character);
    return {
      ...character,
      maxHP,
      currentHP: maxHP,
    };
  }
  return character as T & {
    readonly currentHP: number;
    readonly maxHP: number;
  };
};

/**
 * Calculate damage based on encounter outcome.
 */
export const calculateDamage = (
  outcomeTier: OutcomeTier,
  maxHP: number,
  encounterDifficulty: string,
): number => {
  const difficultyMultiplier: Record<string, number> = {
    trivial: 0.5,
    easy: 0.75,
    medium: 1,
    hard: 1.25,
    deadly: 1.5,
  };

  const multiplier = difficultyMultiplier[encounterDifficulty] ?? 1;

  let baseDamage = 0;

  switch (outcomeTier) {
    case "criticalFailure": {
      baseDamage = Math.floor(maxHP * 0.4 * multiplier); // 40% of max HP
      break;
    }
    case "failure": {
      baseDamage = Math.floor(maxHP * 0.15 * multiplier); // 15% of max HP
      break;
    }
    case "success": {
      baseDamage = Math.floor(maxHP * 0.05 * multiplier); // 5% of max HP (minor scrapes)
      break;
    }
    case "criticalSuccess": {
      baseDamage = 0; // No damage on critical success
      break;
    }
  }

  // Add some randomness (+-20%)
  const variance = Math.floor(baseDamage * 0.2);
  const randomVariance =
    Math.floor(Math.random() * (variance * 2 + 1)) - variance;

  return Math.max(0, baseDamage + randomVariance);
};

/**
 * Apply damage to a character.
 */
export const applyDamage = <
  T extends { readonly currentHP: number },
>(
  character: T,
  damage: number,
): T & { readonly currentHP: number; readonly isDefeated: boolean } => {
  const newHP = Math.max(0, character.currentHP - damage);

  return {
    ...character,
    currentHP: newHP,
    isDefeated: newHP === 0,
  };
};

/**
 * Apply healing to a character.
 */
export const applyHealing = <
  T extends { readonly currentHP: number; readonly maxHP: number },
>(
  character: T,
  healing: number,
): T & { readonly currentHP: number; readonly isDefeated: boolean } => {
  const newHP = Math.min(character.maxHP, character.currentHP + healing);

  return {
    ...character,
    currentHP: newHP,
    isDefeated: false,
  };
};

/**
 * Short rest mechanics — restore 50% of max HP.
 */
export const shortRest = <
  T extends { readonly currentHP: number; readonly maxHP: number },
>(
  character: T,
): T & { readonly currentHP: number; readonly isDefeated: boolean } => {
  const healing = Math.floor(character.maxHP * 0.5);
  return applyHealing(character, healing);
};

/**
 * Long rest mechanics — restore to full HP.
 */
export const longRest = <
  T extends { readonly currentHP: number; readonly maxHP: number },
>(
  character: T,
): T & { readonly currentHP: number; readonly isDefeated: boolean } => {
  return {
    ...character,
    currentHP: character.maxHP,
    isDefeated: false,
  };
};

/**
 * Get HP status description for narrative.
 */
export const getHPStatus = (currentHP: number, maxHP: number): HPStatus => {
  const percentage = (currentHP / maxHP) * 100;

  if (percentage === 0)
    return { status: "defeated", color: "#e74c3c", description: "Defeated" };
  if (percentage <= 25)
    return {
      status: "critical",
      color: "#e74c3c",
      description: "Critically Wounded",
    };
  if (percentage <= 50)
    return { status: "wounded", color: "#f39c12", description: "Wounded" };
  if (percentage <= 75)
    return { status: "injured", color: "#f1c40f", description: "Injured" };
  if (percentage < 100)
    return { status: "healthy", color: "#27ae60", description: "Healthy" };
  return { status: "full", color: "#27ae60", description: "Full Health" };
};

/**
 * Determine if encounter should deal damage (hostile encounters only).
 */
export const shouldDealDamage = (encounter: EncounterForDamageCheck): boolean => {
  const hostileKeywords = [
    "goblin",
    "wolf",
    "bandit",
    "spider",
    "bear",
    "ambush",
    "attack",
  ];
  const encounterName = encounter.name.toLowerCase();

  return hostileKeywords.some((keyword) => encounterName.includes(keyword));
};

/**
 * Get damage description for narration.
 */
export const getDamageDescription = (damage: number, maxHP: number): string => {
  const percentage = (damage / maxHP) * 100;

  if (damage === 0) return "You emerge unscathed.";
  if (percentage >= 30) return "You suffer grievous wounds!";
  if (percentage >= 15) return "You take significant damage.";
  if (percentage >= 5) return "You sustain minor injuries.";
  return "You barely feel a scratch.";
};
