/**
 * Encounter resolver — resolves encounters based on player action and dice roll.
 * Ported from src/utils/encounterResolver.js — zero behavioral changes.
 *
 * NOTE: The original resolveEncounter() calls llmService.generateResponse()
 * for AI narration. Since this module must remain pure (no API calls),
 * the AI narration call is abstracted behind a callback parameter.
 * The calling code (React layer) provides the actual AI service.
 */

import { rollCheck } from "../dice/index.js";
import {
  calculateDamage,
  getDamageDescription,
  shouldDealDamage,
} from "../health/index.js";
import { calculateModifier, SKILLS } from "../rules/index.js";

import { DIFFICULTY_DC } from "./data/encounter-templates.js";

import type { CheckResult } from "../dice/index.js";
import type { OutcomeTier } from "../health/index.js";
import type {
  EncounterRewards,
  EncounterTemplate,
  SuggestedAction,
} from "./data/encounter-templates.js";

// ── Types ────────────────────────────────────────────────────────────────────

/** Minimal character shape needed by the resolver. */
export interface ResolverCharacter {
  readonly characterName?: string;
  readonly characterClass?: string;
  readonly stats: Readonly<Record<string, number | undefined>>;
  readonly maxHP?: number;
  readonly currentHP?: number;
}

/** Loot/rewards generated from an encounter outcome. */
export interface GeneratedLoot {
  xp: number;
  gold: number;
  items: string[];
  healing: number | "full";
}

/** Penalties from a failed encounter. */
export interface EncounterPenalties {
  messages: string[];
  goldLoss: number;
  itemsLost: string[];
}

/** Full result of resolving an encounter. */
export interface EncounterResolution {
  readonly narration: string;
  readonly rollResult: CheckResult | null;
  readonly outcomeTier: OutcomeTier | "success";
  readonly rewards: GeneratedLoot | null;
  readonly penalties: EncounterPenalties | null;
  readonly affectedFactions: Record<string, number> | null;
  readonly hpDamage: number;
  readonly damageDescription: string | null;
}

/** Settings shape needed by the resolver for prompt building. */
export interface ResolverSettings {
  readonly grimnessLevel?: string;
  readonly darknessLevel?: string;
  readonly responseVerbosity?: string;
}

/** Encounter shape as used by the resolver. */
export interface ResolverEncounter extends EncounterTemplate {
  readonly templateKey?: string;
}

/**
 * Callback type for generating AI narration.
 * The calling code provides the actual implementation that calls the LLM.
 */
export type NarrationGenerator = (
  prompt: string,
) => Promise<string>;

// ── Internal dice helper ─────────────────────────────────────────────────────

/**
 * Rolls multiple dice and returns total.
 * NOTE: This is a separate implementation from dice/index.ts because
 * the original encounterResolver.js had its own local rollDice function.
 */
const rollDice = (count: number, sides: number): number => {
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += Math.floor(Math.random() * sides) + 1;
  }
  return total;
};

// ── Dice formula parsers ─────────────────────────────────────────────────────

/** Parsed dice formula without bonus. */
interface DiceFormula {
  readonly count: number;
  readonly sides: number;
}

/** Parsed dice formula with optional bonus. */
interface DiceFormulaWithBonus {
  readonly count: number;
  readonly sides: number;
  readonly bonus: number;
}

/**
 * Parses dice formula like "2d10" into {count, sides}
 */
const parseDiceFormula = (formula: string): DiceFormula => {
  const match = /(\d+)d(\d+)/.exec(formula);
  if (!match) {
    return { count: 1, sides: 6 };
  }
  return {
    count: Number.parseInt(match[1] ?? "1", 10),
    sides: Number.parseInt(match[2] ?? "6", 10),
  };
};

/**
 * Parses dice formula with optional bonus like "2d8+4" into {count, sides, bonus}
 */
const parseDiceFormulaWithBonus = (formula: string): DiceFormulaWithBonus => {
  // Split on '+' first to handle the optional bonus separately
  const plusIndex = formula.indexOf("+");
  const dicePartRaw = plusIndex === -1 ? formula : formula.slice(0, plusIndex);
  const bonusPart = plusIndex === -1 ? "" : formula.slice(plusIndex + 1);

  const diceMatch = /(\d+)d(\d+)/.exec(dicePartRaw);
  if (!diceMatch) {
    return { count: 1, sides: 6, bonus: 0 };
  }
  return {
    count: Number.parseInt(diceMatch[1] ?? "1", 10),
    sides: Number.parseInt(diceMatch[2] ?? "6", 10),
    bonus: bonusPart ? Number.parseInt(bonusPart, 10) : 0,
  };
};

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Builds the AI prompt for encounter narration.
 */
export const buildEncounterPrompt = (
  encounter: ResolverEncounter,
  action: string,
  rollResult: CheckResult,
  tier: string,
  baseConsequence: string,
  settings: ResolverSettings | null | undefined,
  character: ResolverCharacter,
): string => {
  return `
You are the Dungeon Master for a ${settings?.grimnessLevel ?? "Gritty"} ${settings?.darknessLevel ?? "Standard"} fantasy adventure.

ENCOUNTER: ${encounter.description}
PLAYER ACTION: ${action}
CHARACTER: ${character.characterName ?? "Adventurer"} (${character.characterClass ?? "Fighter"})
DICE ROLL: ${String(rollResult.total)} (d20: ${String(rollResult.naturalRoll)} + modifier: ${String(rollResult.modifier)})
OUTCOME: ${tier.toUpperCase()}
${rollResult.isCriticalSuccess ? "CRITICAL SUCCESS!" : ""}
${rollResult.isCriticalFailure ? "CRITICAL FAILURE!" : ""}

Base Consequence: ${baseConsequence}

Narrate this outcome in 2-3 vivid sentences. Make it dramatic and fitting for the ${settings?.responseVerbosity ?? "balanced"} verbosity level. Include sensory details and emotional impact.
  `.trim();
};

/**
 * Roll item rewards based on percentage chances from the rewards template.
 */
function rollItemRewards(
  items: readonly string[],
  outcomeTier: string,
): string[] {
  const result: string[] = [];
  for (const itemEntry of items) {
    const parts = itemEntry.split(":");
    const itemName = parts[0] ?? itemEntry;
    const chanceStr = parts[1];
    const chance = chanceStr
      ? Number.parseInt(chanceStr, 10) / 100
      : 1;

    // Critical success increases loot chance by 50%
    const adjustedChance =
      outcomeTier === "criticalSuccess"
        ? Math.min(chance * 1.5, 1)
        : chance;

    if (Math.random() < adjustedChance) {
      result.push(itemName.replaceAll("_", " "));
    }
  }
  return result;
}

/**
 * Calculate healing from encounter healing-by-tier formula.
 */
function calculateHealing(
  healingByTier: Record<string, string> | undefined,
  outcomeTier: string,
): number | "full" {
  if (!healingByTier) return 0;
  const healingFormula = healingByTier[outcomeTier];
  if (healingFormula === "full") {
    return "full"; // Will be handled in Game.js to restore to max HP
  }
  if (healingFormula) {
    const healRoll = parseDiceFormulaWithBonus(healingFormula);
    return rollDice(healRoll.count, healRoll.sides) + healRoll.bonus;
  }
  return 0;
}

/**
 * Generates loot based on rewards template and roll result.
 */
const generateLoot = (
  rewards: EncounterRewards | null | undefined,
  _rollResult: CheckResult,
  outcomeTier: string,
  encounter: ResolverEncounter,
): GeneratedLoot | null => {
  if (!rewards) return null;

  const loot: GeneratedLoot = {
    xp: rewards.xp || 0,
    gold: 0,
    items: [],
    healing: 0,
  };

  // Gold rewards (roll dice formula)
  if (rewards.gold) {
    const goldRoll = parseDiceFormula(rewards.gold);
    loot.gold = rollDice(goldRoll.count, goldRoll.sides);
  }

  // Item rewards (percentage chance)
  if (rewards.items.length > 0) {
    loot.items = rollItemRewards(rewards.items, outcomeTier);
  }

  // Healing rewards (from healer encounters)
  loot.healing = calculateHealing(encounter.healingByTier, outcomeTier);

  return loot;
};
/**
 * Apply penalties for hostile encounter failures.
 */
function applyHostilePenalties(penalties: EncounterPenalties, isCritical: boolean): void {
  if (isCritical) {
    penalties.messages.push("Serious injuries sustained");
    penalties.goldLoss = rollDice(2, 10) + 10; // 12-30 gold
    penalties.messages.push(
      `Lost ${String(penalties.goldLoss)} gold in the chaos`,
    );
  } else {
    penalties.messages.push("Minor injuries sustained");
    penalties.goldLoss = rollDice(1, 10) + 5; // 6-15 gold
    penalties.messages.push(
      `Lost ${String(penalties.goldLoss)} gold escaping`,
    );
  }
}

/**
 * Apply penalties for social encounter failures.
 */
function applySocialPenalties(penalties: EncounterPenalties, isCritical: boolean): void {
  if (isCritical) {
    penalties.messages.push("Reputation damaged");
    penalties.goldLoss = rollDice(1, 6) + 2; // 3-8 gold
    penalties.messages.push(
      `Lost ${String(penalties.goldLoss)} gold in the exchange`,
    );
  } else {
    penalties.messages.push("Missed opportunity");
    // No gold loss for minor social failures
  }
}

/**
 * Apply penalties for environmental encounter failures.
 */
function applyEnvironmentalPenalties(penalties: EncounterPenalties, isCritical: boolean): void {
  if (isCritical) {
    penalties.messages.push("Injured by hazard");
    penalties.goldLoss = rollDice(1, 6); // 1-6 gold (supplies damaged)
    if (penalties.goldLoss > 0) {
      penalties.messages.push(
        `Lost ${String(penalties.goldLoss)} gold worth of supplies`,
      );
    }
  } else {
    penalties.messages.push("Minor setback");
    // No gold loss for minor environmental setbacks
  }
}

/**
 * Apply default/fallback penalties.
 */
function applyDefaultPenalties(penalties: EncounterPenalties, isCritical: boolean): void {
  if (isCritical) {
    penalties.messages.push("Significant setback");
    penalties.goldLoss = rollDice(1, 8) + 2; // 3-10 gold
    penalties.messages.push(`Lost ${String(penalties.goldLoss)} gold`);
  } else {
    penalties.messages.push("Minor setback");
  }
}

const HOSTILE_ENCOUNTERS = ["goblin", "wolf", "bandit", "spider", "bear"];
const SOCIAL_ENCOUNTERS = ["merchant", "minstrel", "child"];
const ENVIRONMENTAL_ENCOUNTERS = ["rockslide", "shrine"];

/**
 * Determines appropriate penalties based on encounter type.
 * Returns { messages: [], goldLoss: number, itemsLost: [] }
 */
const determinePenalties = (
  outcomeTier: string,
  encounter: ResolverEncounter,
): EncounterPenalties => {
  const isCritical = outcomeTier === "criticalFailure";
  const encounterName = encounter.name.toLowerCase();

  const penalties: EncounterPenalties = {
    messages: [],
    goldLoss: 0,
    itemsLost: [],
  };

  if (HOSTILE_ENCOUNTERS.some((keyword) => encounterName.includes(keyword))) {
    applyHostilePenalties(penalties, isCritical);
  } else if (SOCIAL_ENCOUNTERS.some((keyword) => encounterName.includes(keyword))) {
    applySocialPenalties(penalties, isCritical);
  } else if (ENVIRONMENTAL_ENCOUNTERS.some((keyword) => encounterName.includes(keyword))) {
    applyEnvironmentalPenalties(penalties, isCritical);
  } else {
    applyDefaultPenalties(penalties, isCritical);
  }

  return penalties;
};
/**
 * Applies consequences based on outcome tier.
 * Returns rewards and penalties.
 */
const applyConsequences = (
  outcomeTier: string,
  rewards: EncounterRewards | null | undefined,
  rollResult: CheckResult,
  encounter: ResolverEncounter,
): {
  rewards: GeneratedLoot | null;
  penalties: EncounterPenalties | null;
} => {
  const result: {
    rewards: GeneratedLoot | null;
    penalties: EncounterPenalties | null;
  } = {
    rewards: null,
    penalties: null,
  };

  // Success tiers grant rewards
  if (outcomeTier === "success" || outcomeTier === "criticalSuccess") {
    result.rewards = generateLoot(rewards, rollResult, outcomeTier, encounter);
  }

  // Failure tiers may still get healing from healer encounters
  if (
    (outcomeTier === "failure" || outcomeTier === "criticalFailure") &&
    encounter.healingByTier
  ) {
    result.rewards = generateLoot(rewards, rollResult, outcomeTier, encounter);
  }

  // Failure tiers may have penalties (context-aware)
  if (outcomeTier === "failure" || outcomeTier === "criticalFailure") {
    result.penalties = determinePenalties(outcomeTier, encounter);
  }

  return result;
};

// ── Main resolver ────────────────────────────────────────────────────────────

/**
 * Resolves an encounter based on player action and dice roll.
 * Returns AI-narrated outcome with rewards/penalties.
 *
 * @param encounter - The encounter template
 * @param playerAction - The label of the action chosen by the player
 * @param character - The player character
 * @param settings - Game settings
 * @param generateNarration - Callback that calls the AI service for narration
 * @returns The full encounter resolution
 */
export const resolveEncounter = async (
  encounter: ResolverEncounter,
  playerAction: string,
  character: ResolverCharacter,
  settings: ResolverSettings | null | undefined,
  generateNarration?: NarrationGenerator,
): Promise<EncounterResolution> => {
  // 1. Determine relevant skill and modifier
  const action = encounter.suggestedActions.find(
    (a: SuggestedAction) => a.label === playerAction,
  );

  if (!action) {
    throw new Error(`Invalid action: ${playerAction}`);
  }

  // Handle non-skill actions (like "Move On" or "Leave")
  if (!action.skill) {
    return {
      narration: `You ${action.description.toLowerCase()}.`,
      rollResult: null,
      outcomeTier: "success",
      rewards: null,
      penalties: null,
      affectedFactions: null,
      hpDamage: 0,
      damageDescription: null,
    };
  }

  const skill = action.skill;
  const statName = SKILLS[skill];
  const statValue = statName ? (character.stats[statName] ?? 10) : 10;
  const modifier = calculateModifier(statValue);

  // 2. Roll the check
  const rollResult = rollCheck(modifier);

  // 3. Determine outcome tier
  let outcomeTier: OutcomeTier;
  if (rollResult.isCriticalSuccess) {
    outcomeTier = "criticalSuccess";
  } else if (rollResult.isCriticalFailure) {
    outcomeTier = "criticalFailure";
  } else if (
    rollResult.total >= (DIFFICULTY_DC[encounter.difficulty] ?? 10)
  ) {
    outcomeTier = "success";
  } else {
    outcomeTier = "failure";
  }

  // 4. Get base consequence
  const baseConsequence = encounter.consequences[outcomeTier];

  // 5. Generate AI narration
  const prompt = buildEncounterPrompt(
    encounter,
    playerAction,
    rollResult,
    outcomeTier,
    baseConsequence,
    settings,
    character,
  );

  let aiNarration: string;
  try {
    // Fallback to base consequence if no narration generator provided
    aiNarration = generateNarration
      ? await generateNarration(prompt)
      : baseConsequence;
  } catch (error: unknown) {
     
    console.error(
      "[ENCOUNTER] AI narration failed, using base consequence:",
      error,
    );
    // Fallback to base consequence if AI fails
    aiNarration = baseConsequence;
  }

  // 6. Calculate HP damage if hostile encounter
  let hpDamage = 0;
  let damageDescription: string | null = null;

  if (shouldDealDamage(encounter) && character.maxHP) {
    hpDamage = calculateDamage(outcomeTier, character.maxHP, encounter.difficulty);
    damageDescription = getDamageDescription(hpDamage, character.maxHP);
  }

  // 7. Apply rewards/penalties
  const outcome = applyConsequences(
    outcomeTier,
    encounter.rewards,
    rollResult,
    encounter,
  );

  return {
    narration: aiNarration,
    rollResult,
    outcomeTier,
    rewards: outcome.rewards,
    penalties: outcome.penalties,
    affectedFactions:
      (encounter.affectedFactions?.[outcomeTier]) ?? null,
    hpDamage,
    damageDescription,
  };
};
