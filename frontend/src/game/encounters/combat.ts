/**
 * Multi-round encounter / combat system.
 * Ported from src/utils/multiRoundEncounter.js — zero behavioral changes.
 *
 * NOTE: resolveRound() and generateEncounterSummary() are async because
 * they delegate to resolveEncounter() which calls the AI narration service.
 */

import { resolveEncounter } from "./resolver.js";

import type { SuggestedAction } from "./data/encounter-templates.js";
import type {
  EncounterPenalties,
  EncounterResolution,
  NarrationGenerator,
  ResolverCharacter,
  ResolverEncounter,
  ResolverSettings,
} from "./resolver.js";

// ── Types ────────────────────────────────────────────────────────────────────

/** A record of one round of combat. */
export interface RoundRecord {
  readonly round: number;
  readonly action: string;
  readonly result: EncounterResolution & {
    enemyDamage?: number;
    enemyCurrentHP?: number;
    enemyMaxHP?: number;
  };
}

/** Outcome of the multi-round encounter. */
export type CombatOutcome =
  | "victory"
  | "defeat"
  | "stalemate"
  | "escaped"
  | null;

/** State of an ongoing multi-round encounter. */
export interface MultiRoundState {
  readonly encounter: ResolverEncounter;
  readonly character: ResolverCharacter;
  readonly settings: ResolverSettings | null | undefined;
  currentRound: number;
  maxRounds: number;
  roundHistory: RoundRecord[];
  enemyMorale: number;
  playerAdvantage: number;
  enemyMaxHP: number;
  enemyCurrentHP: number;
  isResolved: boolean;
  outcome: CombatOutcome;
}

/** Summary of a completed multi-round encounter. */
export interface EncounterSummary {
  readonly narration: string;
  readonly outcome: CombatOutcome;
  readonly rewards: {
    xp: number;
    gold: number;
    items: string[];
  };
  readonly penalties: (EncounterPenalties | string)[];
  readonly roundCount: number;
}

/** Result of resolving a single round. */
export interface RoundResolution {
  readonly roundResult: EncounterResolution & {
    enemyDamage?: number;
    enemyCurrentHP?: number;
    enemyMaxHP?: number;
  };
  readonly updatedState: MultiRoundState;
}

// ── Functions ────────────────────────────────────────────────────────────────

/**
 * Create initial state for a multi-round encounter.
 */
export const createMultiRoundEncounter = (
  encounter: ResolverEncounter,
  character: ResolverCharacter,
  settings: ResolverSettings | null | undefined,
): MultiRoundState => {
  return {
    encounter,
    character,
    settings,
    currentRound: 1,
    maxRounds: 3, // Most encounters resolve in 3 rounds
    roundHistory: [],
    enemyMorale: 100, // Drops with successful player actions
    playerAdvantage: 0, // Builds with successful tactics
    enemyMaxHP: encounter.enemyHP ?? 20, // Enemy starting HP
    enemyCurrentHP: encounter.enemyHP ?? 20, // Enemy current HP
    isResolved: false,
    outcome: null,
  };
};

/**
 * Get available actions for current round based on context.
 */
export const getRoundActions = (
  roundState: MultiRoundState,
): readonly SuggestedAction[] => {
  const baseActions = roundState.encounter.suggestedActions;
  const round = roundState.currentRound;

  // First round: all base actions available
  if (round === 1) {
    return baseActions;
  }

  // Later rounds: add contextual actions based on previous results
  const contextualActions: SuggestedAction[] = [];

  // If player has advantage, offer finishing moves
  if (roundState.playerAdvantage >= 2) {
    contextualActions.push({
      label: "Finish Them",
      skill: "Athletics",
      description: "Press your advantage for a decisive victory",
    });
  }

  // If enemy morale is low, offer intimidation
  if (roundState.enemyMorale < 50) {
    contextualActions.push({
      label: "Demand Surrender",
      skill: "Intimidation",
      description: "Force them to yield while they're weakened",
    });
  }

  // Always allow tactical retreat
  if (round > 1) {
    contextualActions.push({
      label: "Tactical Retreat",
      skill: "Acrobatics",
      description: "Disengage and escape while you can",
    });
  }

  return [...baseActions, ...contextualActions];
};

/**
 * Resolve a single round of combat.
 */
export const resolveRound = async (
  roundState: MultiRoundState,
  playerAction: string,
  generateNarration?: NarrationGenerator,
): Promise<RoundResolution> => {
  const result = await resolveEncounter(
    roundState.encounter,
    playerAction,
    roundState.character,
    roundState.settings,
    generateNarration,
  );

  // Update state based on outcome
  const updatedState: MultiRoundState = { ...roundState , roundHistory: [
    ...roundState.roundHistory,
    {
      round: roundState.currentRound,
      action: playerAction,
      result,
    },
  ], currentRound: roundState.currentRound + 1,};

  // Store current round in history BEFORE incrementing

  // Now increment for next round

  // Calculate damage to enemy based on outcome
  let enemyDamage = 0;
  switch (result.outcomeTier) {
  case "criticalSuccess": {
    enemyDamage = Math.floor(updatedState.enemyMaxHP * 0.4); // 40% damage
    updatedState.enemyMorale = roundState.enemyMorale - 40;
    updatedState.playerAdvantage = roundState.playerAdvantage + 2;
  
  break;
  }
  case "success": {
    enemyDamage = Math.floor(updatedState.enemyMaxHP * 0.2); // 20% damage
    updatedState.enemyMorale = roundState.enemyMorale - 20;
    updatedState.playerAdvantage = roundState.playerAdvantage + 1;
  
  break;
  }
  case "failure": {
    enemyDamage = Math.floor(updatedState.enemyMaxHP * 0.05); // 5% damage
    updatedState.enemyMorale = roundState.enemyMorale + 10;
    updatedState.playerAdvantage = roundState.playerAdvantage - 1;
  
  break;
  }
  case "criticalFailure": {
    enemyDamage = 0; // No damage on critical failure
    updatedState.enemyMorale = roundState.enemyMorale + 20;
    updatedState.playerAdvantage = roundState.playerAdvantage - 2;
  
  break;
  }
  // No default
  }

  // Apply damage to enemy
  updatedState.enemyCurrentHP = Math.max(
    0,
    roundState.enemyCurrentHP - enemyDamage,
  );

  // Add enemy damage to result for display
  const augmentedResult = {
    ...result,
    enemyDamage,
    enemyCurrentHP: updatedState.enemyCurrentHP,
    enemyMaxHP: updatedState.enemyMaxHP,
  };

  // Update the last round history entry with augmented result
  updatedState.roundHistory = [
    ...updatedState.roundHistory.slice(0, -1),
    {
      round: roundState.currentRound,
      action: playerAction,
      result: augmentedResult,
    },
  ];

  // Check for resolution conditions
  if (updatedState.enemyCurrentHP <= 0) {
    updatedState.isResolved = true;
    updatedState.outcome = "victory";
  } else if (updatedState.enemyMorale <= 0) {
    updatedState.isResolved = true;
    updatedState.outcome = "victory";
  } else if (updatedState.playerAdvantage <= -3) {
    updatedState.isResolved = true;
    updatedState.outcome = "defeat";
  } else if (updatedState.currentRound > updatedState.maxRounds) {
    updatedState.isResolved = true;
    updatedState.outcome =
      updatedState.playerAdvantage > 0 ? "victory" : "stalemate";
  } else if (
    playerAction === "Tactical Retreat" &&
    result.outcomeTier !== "criticalFailure"
  ) {
    updatedState.isResolved = true;
    updatedState.outcome = "escaped";
  }

  return {
    roundResult: augmentedResult,
    updatedState,
  };
};

/**
 * Generate final encounter summary from all rounds.
 */
export const generateEncounterSummary = (
  roundState: MultiRoundState,
): EncounterSummary => {
  const rounds = roundState.roundHistory;
  const outcome = roundState.outcome;

  // Combine all round narrations
  const fullNarration = rounds
    .map(
      (r, idx) => `Round ${String(idx + 1)}: ${r.result.narration}`,
    )
    .join("\n\n");

  // Calculate total rewards/penalties
  const totalRewards = { xp: 0, gold: 0, items: [] as string[] };
  for (const r of rounds) {
    if (!r.result.rewards) continue;
    const rewards = r.result.rewards;
    totalRewards.xp += rewards.xp || 0;
    totalRewards.gold += rewards.gold || 0;
    totalRewards.items.push(...rewards.items);
  }

  const totalPenalties: (EncounterPenalties | string)[] = [];
  for (const r of rounds) {
    if (r.result.penalties) {
      totalPenalties.push(r.result.penalties);
    }
  }

  // Add outcome-based modifiers
  switch (outcome) {
  case "victory": {
    totalRewards.xp = Math.floor(totalRewards.xp * 1.2); // 20% bonus for victory
  
  break;
  }
  case "defeat": {
    totalRewards.xp = Math.floor(totalRewards.xp * 0.5); // Half XP for defeat
    totalRewards.gold = Math.floor(totalRewards.gold * 0.3); // Lose most gold
    totalPenalties.push("Defeated - serious injuries sustained");
  
  break;
  }
  case "escaped": {
    totalRewards.xp = Math.floor(totalRewards.xp * 0.7); // Reduced XP for fleeing
    totalRewards.items = []; // No loot when fleeing
  
  break;
  }
  // No default
  }

  return {
    narration: fullNarration,
    outcome,
    rewards: totalRewards,
    penalties: totalPenalties,
    roundCount: rounds.length,
  };
};

/**
 * Determines if an encounter should use multi-round system.
 */
export const shouldUseMultiRound = (encounter: {
  readonly name: string;
  readonly difficulty?: string;
}): boolean => {
  // Use multi-round for:
  // - Hostile combat encounters
  // - Hard or deadly difficulty
  // - Boss encounters

  const hostileEncounters = [
    "goblin_ambush",
    "wolf_pack",
    "bandit_roadblock",
    "giant_spiders",
    "bear_encounter",
  ];

  const isHostile = hostileEncounters.some((key) =>
    encounter.name.toLowerCase().includes(key.replaceAll("_", " ")),
  );

  const isHardOrDeadly = ["hard", "deadly"].includes(
    encounter.difficulty ?? "",
  );

  return isHostile || isHardOrDeadly;
};
