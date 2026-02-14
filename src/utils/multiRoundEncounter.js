import { resolveEncounter } from './encounterResolver';

/**
 * Multi-round encounter system for prolonged hostile encounters
 * Each round is a narrative beat with player choices
 */

export const createMultiRoundEncounter = (encounter, character, settings) => {
  return {
    encounter,
    character,
    settings,
    currentRound: 1,
    maxRounds: 3, // Most encounters resolve in 3 rounds
    roundHistory: [],
    enemyMorale: 100, // Drops with successful player actions
    playerAdvantage: 0, // Builds with successful tactics
    isResolved: false,
    outcome: null
  };
};

/**
 * Get available actions for current round based on context
 */
export const getRoundActions = (roundState) => {
  const baseActions = roundState.encounter.suggestedActions;
  const round = roundState.currentRound;
  
  // First round: all base actions available
  if (round === 1) {
    return baseActions;
  }
  
  // Later rounds: add contextual actions based on previous results
  const contextualActions = [];
  
  // If player has advantage, offer finishing moves
  if (roundState.playerAdvantage >= 2) {
    contextualActions.push({
      label: 'Finish Them',
      skill: 'Athletics',
      description: 'Press your advantage for a decisive victory'
    });
  }
  
  // If enemy morale is low, offer intimidation
  if (roundState.enemyMorale < 50) {
    contextualActions.push({
      label: 'Demand Surrender',
      skill: 'Intimidation',
      description: 'Force them to yield while they\'re weakened'
    });
  }
  
  // Always allow tactical retreat
  if (round > 1) {
    contextualActions.push({
      label: 'Tactical Retreat',
      skill: 'Acrobatics',
      description: 'Disengage and escape while you can'
    });
  }
  
  return [...baseActions, ...contextualActions];
};

/**
 * Resolve a single round of combat
 */
export const resolveRound = async (roundState, playerAction) => {
  const result = await resolveEncounter(
    roundState.encounter,
    playerAction,
    roundState.character,
    roundState.settings
  );
  
  // Update state based on outcome
  const updatedState = { ...roundState };
  updatedState.currentRound += 1;
  updatedState.roundHistory.push({
    round: roundState.currentRound,
    action: playerAction,
    result
  });
  
  // Adjust enemy morale and player advantage
  if (result.outcomeTier === 'criticalSuccess') {
    updatedState.enemyMorale -= 40;
    updatedState.playerAdvantage += 2;
  } else if (result.outcomeTier === 'success') {
    updatedState.enemyMorale -= 20;
    updatedState.playerAdvantage += 1;
  } else if (result.outcomeTier === 'failure') {
    updatedState.enemyMorale += 10;
    updatedState.playerAdvantage -= 1;
  } else if (result.outcomeTier === 'criticalFailure') {
    updatedState.enemyMorale += 20;
    updatedState.playerAdvantage -= 2;
  }
  
  // Check for resolution conditions
  if (updatedState.enemyMorale <= 0) {
    updatedState.isResolved = true;
    updatedState.outcome = 'victory';
  } else if (updatedState.playerAdvantage <= -3) {
    updatedState.isResolved = true;
    updatedState.outcome = 'defeat';
  } else if (updatedState.currentRound > updatedState.maxRounds) {
    updatedState.isResolved = true;
    updatedState.outcome = updatedState.playerAdvantage > 0 ? 'victory' : 'stalemate';
  } else if (playerAction === 'Tactical Retreat' && result.outcomeTier !== 'criticalFailure') {
    updatedState.isResolved = true;
    updatedState.outcome = 'escaped';
  }
  
  return {
    roundResult: result,
    updatedState
  };
};

/**
 * Generate final encounter summary from all rounds
 */
export const generateEncounterSummary = async (roundState) => {
  const rounds = roundState.roundHistory;
  const outcome = roundState.outcome;
  
  // Combine all round narrations
  const fullNarration = rounds.map((r, idx) => 
    `Round ${idx + 1}: ${r.result.narration}`
  ).join('\n\n');
  
  // Calculate total rewards/penalties
  const totalRewards = rounds.reduce((acc, r) => {
    if (!r.result.rewards) return acc;
    return {
      xp: acc.xp + (r.result.rewards.xp || 0),
      gold: acc.gold + (r.result.rewards.gold || 0),
      items: [...acc.items, ...(r.result.rewards.items || [])]
    };
  }, { xp: 0, gold: 0, items: [] });
  
  const totalPenalties = rounds.reduce((acc, r) => {
    if (!r.result.penalties) return acc;
    return [...acc, ...r.result.penalties];
  }, []);
  
  // Add outcome-based modifiers
  if (outcome === 'victory') {
    totalRewards.xp = Math.floor(totalRewards.xp * 1.2); // 20% bonus for victory
  } else if (outcome === 'defeat') {
    totalRewards.xp = Math.floor(totalRewards.xp * 0.5); // Half XP for defeat
    totalRewards.gold = Math.floor(totalRewards.gold * 0.3); // Lose most gold
    totalPenalties.push('Defeated - serious injuries sustained');
  } else if (outcome === 'escaped') {
    totalRewards.xp = Math.floor(totalRewards.xp * 0.7); // Reduced XP for fleeing
    totalRewards.items = []; // No loot when fleeing
  }
  
  return {
    narration: fullNarration,
    outcome,
    rewards: totalRewards,
    penalties: totalPenalties,
    roundCount: rounds.length
  };
};

/**
 * Determines if an encounter should use multi-round system
 */
export const shouldUseMultiRound = (encounter) => {
  // Use multi-round for:
  // - Hostile combat encounters
  // - Hard or deadly difficulty
  // - Boss encounters
  
  const hostileEncounters = [
    'goblin_ambush',
    'wolf_pack',
    'bandit_roadblock',
    'giant_spiders',
    'bear_encounter'
  ];
  
  const isHostile = hostileEncounters.some(key => 
    encounter.name.toLowerCase().includes(key.replace(/_/g, ' '))
  );
  
  const isHardOrDeadly = ['hard', 'deadly'].includes(encounter.difficulty);
  
  return isHostile || isHardOrDeadly;
};
