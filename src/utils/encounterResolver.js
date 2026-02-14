import { llmService } from '../services/llmService';
import { rollCheck } from './dice';
import { calculateModifier, SKILLS } from './rules';
import { DIFFICULTY_DC } from '../data/encounters';
import { calculateDamage, shouldDealDamage, getDamageDescription } from './healthSystem';

/**
 * Resolves an encounter based on player action and dice roll
 * Returns AI-narrated outcome with rewards/penalties
 */
export const resolveEncounter = async (encounter, playerAction, character, settings) => {
  // 1. Determine relevant skill and modifier
  const action = encounter.suggestedActions.find(a => a.label === playerAction);
  
  if (!action) {
    throw new Error(`Invalid action: ${playerAction}`);
  }

  // Handle non-skill actions (like "Move On" or "Leave")
  if (!action.skill) {
    return {
      narration: `You ${action.description.toLowerCase()}.`,
      rollResult: null,
      outcomeTier: 'success',
      rewards: null,
      penalties: null
    };
  }

  const skill = action.skill;
  const statName = SKILLS[skill];
  const statValue = character.stats[statName] || 10;
  const modifier = calculateModifier(statValue);
  
  // 2. Roll the check
  const rollResult = rollCheck(modifier);
  
  // 3. Determine outcome tier
  let outcomeTier;
  if (rollResult.isCriticalSuccess) {
    outcomeTier = 'criticalSuccess';
  } else if (rollResult.isCriticalFailure) {
    outcomeTier = 'criticalFailure';
  } else if (rollResult.total >= DIFFICULTY_DC[encounter.difficulty]) {
    outcomeTier = 'success';
  } else {
    outcomeTier = 'failure';
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
    character
  );
  
  let aiNarration;
  try {
    aiNarration = await llmService.generateResponse(prompt, {
      temperature: 0.8,
      maxTokens: 200
    });
  } catch (error) {
    console.error('[ENCOUNTER] AI narration failed, using base consequence:', error);
    // Fallback to base consequence if AI fails
    aiNarration = baseConsequence;
  }
  
  // 6. Calculate HP damage if hostile encounter
  let hpDamage = 0;
  let damageDescription = null;
  
  if (shouldDealDamage(encounter) && character.maxHP) {
    hpDamage = calculateDamage(outcomeTier, character.maxHP, encounter.difficulty);
    damageDescription = getDamageDescription(hpDamage, character.maxHP);
  }
  
  // 7. Apply rewards/penalties
  const outcome = applyConsequences(outcomeTier, encounter.rewards, rollResult, encounter);
  
  return {
    narration: aiNarration,
    rollResult,
    outcomeTier,
    rewards: outcome.rewards,
    penalties: outcome.penalties,
    affectedFactions: encounter.affectedFactions?.[outcomeTier] || null,
    hpDamage,
    damageDescription
  };
};

/**
 * Builds the AI prompt for encounter narration
 */
const buildEncounterPrompt = (encounter, action, rollResult, tier, baseConsequence, settings, character) => {
  return `
You are the Dungeon Master for a ${settings.grimnessLevel} ${settings.darknessLevel} fantasy adventure.

ENCOUNTER: ${encounter.description}
PLAYER ACTION: ${action}
CHARACTER: ${character.characterName} (${character.characterClass})
DICE ROLL: ${rollResult.total} (d20: ${rollResult.naturalRoll} + modifier: ${rollResult.modifier})
OUTCOME: ${tier.toUpperCase()}
${rollResult.isCriticalSuccess ? '⚡ CRITICAL SUCCESS!' : ''}
${rollResult.isCriticalFailure ? '💀 CRITICAL FAILURE!' : ''}

Base Consequence: ${baseConsequence}

Narrate this outcome in 2-3 vivid sentences. Make it dramatic and fitting for the ${settings.responseVerbosity} verbosity level. Include sensory details and emotional impact.
  `.trim();
};

/**
 * Applies consequences based on outcome tier
 * Returns rewards and penalties
 */
const applyConsequences = (outcomeTier, rewards, rollResult, encounter) => {
  const result = {
    rewards: null,
    penalties: null
  };

  // Success tiers grant rewards
  if (outcomeTier === 'success' || outcomeTier === 'criticalSuccess') {
    result.rewards = generateLoot(rewards, rollResult, outcomeTier);
  }

  // Failure tiers may have penalties (context-aware)
  if (outcomeTier === 'failure' || outcomeTier === 'criticalFailure') {
    result.penalties = determinePenalties(outcomeTier, encounter);
  }

  return result;
};

/**
 * Determines appropriate penalties based on encounter type
 */
const determinePenalties = (outcomeTier, encounter) => {
  const isCritical = outcomeTier === 'criticalFailure';
  
  // Categorize encounters
  const hostileEncounters = ['goblin', 'wolf', 'bandit', 'spider', 'bear'];
  const socialEncounters = ['merchant', 'minstrel', 'child'];
  const environmentalEncounters = ['rockslide', 'shrine'];
  
  const encounterName = encounter.name.toLowerCase();
  const isHostile = hostileEncounters.some(keyword => encounterName.includes(keyword));
  const isSocial = socialEncounters.some(keyword => encounterName.includes(keyword));
  const isEnvironmental = environmentalEncounters.some(keyword => encounterName.includes(keyword));
  
  // Hostile encounters: physical consequences
  if (isHostile) {
    if (isCritical) {
      return ['Serious injuries sustained', 'Lost some supplies'];
    } else {
      return ['Minor injuries sustained'];
    }
  }
  
  // Social encounters: reputation/resource consequences
  if (isSocial) {
    if (isCritical) {
      return ['Reputation damaged', 'Lost opportunity for trade'];
    } else {
      return ['Missed opportunity'];
    }
  }
  
  // Environmental encounters: situational consequences
  if (isEnvironmental) {
    if (isCritical) {
      return ['Injured by hazard', 'Lost time recovering'];
    } else {
      return ['Minor setback'];
    }
  }
  
  // Default fallback
  if (isCritical) {
    return ['Significant setback'];
  } else {
    return ['Minor setback'];
  }
};

/**
 * Generates loot based on rewards template and roll result
 */
const generateLoot = (rewards, rollResult, outcomeTier) => {
  if (!rewards) return null;

  const loot = {
    xp: rewards.xp || 0,
    gold: 0,
    items: []
  };

  // Gold rewards (roll dice formula)
  if (rewards.gold) {
    const goldRoll = parseDiceFormula(rewards.gold);
    loot.gold = rollDice(goldRoll.count, goldRoll.sides);
  }

  // Item rewards (percentage chance)
  if (rewards.items) {
    for (const itemEntry of rewards.items) {
      const [itemName, chanceStr] = itemEntry.split(':');
      const chance = parseInt(chanceStr) / 100;
      
      // Critical success increases loot chance by 50%
      const adjustedChance = outcomeTier === 'criticalSuccess' 
        ? Math.min(chance * 1.5, 1.0) 
        : chance;
      
      if (Math.random() < adjustedChance) {
        loot.items.push(itemName.replace(/_/g, ' '));
      }
    }
  }

  return loot;
};

/**
 * Parses dice formula like "2d10" into {count, sides}
 */
const parseDiceFormula = (formula) => {
  const match = formula.match(/(\d+)d(\d+)/);
  if (!match) {
    return { count: 1, sides: 6 };
  }
  return {
    count: parseInt(match[1]),
    sides: parseInt(match[2])
  };
};

/**
 * Rolls multiple dice and returns total
 */
const rollDice = (count, sides) => {
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += Math.floor(Math.random() * sides) + 1;
  }
  return total;
};
