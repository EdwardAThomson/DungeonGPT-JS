/**
 * D&D 5e rule calculations.
 * Ported from src/utils/rules.js — zero behavioral changes.
 */

/**
 * Calculates the ability score modifier based on the standard D&D 5e formula.
 * Formula: floor((score - 10) / 2)
 */
export const calculateModifier = (score: number): number => {
  return Math.floor((score - 10) / 2);
};

/** Mapping of ability score names. */
type AbilityScore =
  | "Strength"
  | "Dexterity"
  | "Constitution"
  | "Intelligence"
  | "Wisdom"
  | "Charisma";

/**
 * Mapping of standard skills to their associated ability scores.
 */
export const SKILLS: Record<string, AbilityScore> = {
  Acrobatics: "Dexterity",
  "Animal Handling": "Wisdom",
  Arcana: "Intelligence",
  Athletics: "Strength",
  Deception: "Charisma",
  History: "Intelligence",
  Insight: "Wisdom",
  Intimidation: "Charisma",
  Investigation: "Intelligence",
  Medicine: "Wisdom",
  Nature: "Intelligence",
  Perception: "Wisdom",
  Performance: "Charisma",
  Persuasion: "Charisma",
  Religion: "Intelligence",
  "Sleight of Hand": "Dexterity",
  Stealth: "Dexterity",
  Survival: "Wisdom",
  Initiative: "Dexterity", // Explicitly treated as a skill for convenience
};

/** A single die type descriptor. */
export interface DieDescriptor {
  readonly label: string;
  readonly value: number;
}

/**
 * List of standard supported dice.
 */
export const SUPPORTED_DICE: readonly DieDescriptor[] = [
  { label: "d3", value: 3 }, // Often used for small effects
  { label: "d4", value: 4 },
  { label: "d6", value: 6 },
  { label: "d8", value: 8 },
  { label: "d10", value: 10 },
  { label: "d12", value: 12 },
  { label: "d20", value: 20 },
  { label: "d100", value: 100 },
] as const;
