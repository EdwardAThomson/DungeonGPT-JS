import { rollCheck } from './dice';
import { calculateModifier, SKILLS } from './rules';
import { DIFFICULTY_DC } from '../data/encounters';
import { calculateDamage, shouldDealDamage, getDamageDescription } from './healthSystem';
import { getEquippedBonuses } from '../game/equipment';
import { filterDropsByTier } from './inventorySystem';

// Stats whose checks count as physical/combat (attack-style), so a weapon's
// attack bonus applies. Hostile encounters also count regardless of skill.
const PHYSICAL_STATS = ['Strength', 'Dexterity'];

const isCombatAction = (statName, encounter) =>
  PHYSICAL_STATS.includes(statName) || shouldDealDamage(encounter);

/**
 * Resolves an encounter based on player action and dice roll
 * Returns AI-narrated outcome with rewards/penalties
 */
export const resolveEncounter = async (encounter, playerAction, character, settings, llmConfig = {}) => {
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
  let modifier = calculateModifier(statValue);

  // Apply equipped gear: a weapon's attack bonus boosts combat/physical checks,
  // an accessory's misc bonus applies to every check. Old heroes without
  // equipment get { attack: 0, defense: 0, misc: 0 } (no change).
  const equipBonuses = getEquippedBonuses(character);
  if (isCombatAction(statName, encounter)) {
    modifier += equipBonuses.attack;
  }
  modifier += equipBonuses.misc;

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

  // 5. Use base consequence for narration (fully local, no AI calls)
  // This makes combat instant and eliminates API costs/latency
  const aiNarration = baseConsequence;

  // 6. Calculate HP damage if hostile encounter
  let hpDamage = 0;
  let damageDescription = null;

  if (shouldDealDamage(encounter) && character.maxHP) {
    hpDamage = calculateDamage(outcomeTier, character.maxHP, encounter.difficulty);
    // Armour soaks a flat amount of incoming damage (never below zero).
    hpDamage = Math.max(0, hpDamage - equipBonuses.defense);
    damageDescription = getDamageDescription(hpDamage, character.maxHP);
  }

  // 7. Apply rewards/penalties
  // Loot rarity is gated by campaign tier (falls back to party level for older saves
  // that predate settings.tier). Prevents very_rare/legendary random drops at Tier 1.
  const lootCtx = { tier: settings?.tier, level: character?.level };
  const outcome = applyConsequences(outcomeTier, encounter.rewards, rollResult, encounter, lootCtx);

  return {
    narration: aiNarration,
    rollResult,
    outcomeTier,
    rewards: outcome.rewards,
    penalties: clampPenaltyGold(outcome.penalties, character?.gold),
    affectedFactions: encounter.affectedFactions?.[outcomeTier] || null,
    hpDamage,
    damageDescription
  };
};

/**
 * Applies consequences based on outcome tier
 * Returns rewards and penalties
 */
/**
 * Clamp a penalty's gold loss to the gold actually available, and rewrite its gold message
 * so the displayed consequence never overstates what was (or can be) taken. The actual party
 * deduction is clamped separately too; this keeps the on-screen text honest. When the
 * available gold is unknown (not a number), the penalty is returned unchanged.
 */
export const clampPenaltyGold = (penalties, availableGold) => {
  if (!penalties) return penalties;
  if (typeof availableGold !== 'number') return penalties;
  const original = penalties.goldLoss || 0;
  const clamped = Math.min(original, Math.max(0, availableGold));
  if (clamped === original) return penalties;
  const messages = (penalties.messages || []).filter((m) => !/lost \d+ gold/i.test(m));
  if (clamped > 0) messages.push(`Lost ${clamped} gold`);
  return { ...penalties, goldLoss: clamped, messages };
};

const applyConsequences = (outcomeTier, rewards, rollResult, encounter, lootCtx) => {
  const result = {
    rewards: null,
    penalties: null
  };

  // Success tiers grant rewards
  if (outcomeTier === 'success' || outcomeTier === 'criticalSuccess') {
    result.rewards = generateLoot(rewards, rollResult, outcomeTier, encounter, lootCtx);
  }

  // Failure tiers may still get healing from healer encounters
  if ((outcomeTier === 'failure' || outcomeTier === 'criticalFailure') && encounter?.healingByTier) {
    result.rewards = generateLoot(rewards, rollResult, outcomeTier, encounter, lootCtx);
  }

  // Failure tiers may have penalties (context-aware)
  if (outcomeTier === 'failure' || outcomeTier === 'criticalFailure') {
    result.penalties = determinePenalties(outcomeTier, encounter);
  }

  return result;
};

/**
 * Determines appropriate penalties based on encounter type
 * Returns { messages: [], goldLoss: number, itemsLost: [] }
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

  const penalties = {
    messages: [],
    goldLoss: 0,
    itemsLost: []
  };

  // Hostile encounters: physical consequences + gold loss
  if (isHostile) {
    if (isCritical) {
      penalties.messages.push('Serious injuries sustained');
      penalties.goldLoss = rollDice(2, 10) + 10; // 12-30 gold
      penalties.messages.push(`Lost ${penalties.goldLoss} gold in the chaos`);
    } else {
      penalties.messages.push('Minor injuries sustained');
      penalties.goldLoss = rollDice(1, 10) + 5; // 6-15 gold
      penalties.messages.push(`Lost ${penalties.goldLoss} gold escaping`);
    }
  }

  // Social encounters: reputation/resource consequences
  else if (isSocial) {
    if (isCritical) {
      penalties.messages.push('Reputation damaged');
      penalties.goldLoss = rollDice(1, 6) + 2; // 3-8 gold
      penalties.messages.push(`Lost ${penalties.goldLoss} gold in the exchange`);
    } else {
      penalties.messages.push('Missed opportunity');
      // No gold loss for minor social failures
    }
  }

  // Environmental encounters: situational consequences
  else if (isEnvironmental) {
    if (isCritical) {
      penalties.messages.push('Injured by hazard');
      penalties.goldLoss = rollDice(1, 6); // 1-6 gold (supplies damaged)
      if (penalties.goldLoss > 0) {
        penalties.messages.push(`Lost ${penalties.goldLoss} gold worth of supplies`);
      }
    } else {
      penalties.messages.push('Minor setback');
      // No gold loss for minor environmental setbacks
    }
  }

  // Default fallback
  else {
    if (isCritical) {
      penalties.messages.push('Significant setback');
      penalties.goldLoss = rollDice(1, 8) + 2; // 3-10 gold
      penalties.messages.push(`Lost ${penalties.goldLoss} gold`);
    } else {
      penalties.messages.push('Minor setback');
    }
  }

  return penalties;
};

/**
 * Generates loot based on rewards template and roll result
 */
const generateLoot = (rewards, rollResult, outcomeTier, encounter, lootCtx = {}) => {
  if (!rewards) return null;

  // Positive rewards (XP / gold / items) are granted ONLY on success tiers. Failure tiers
  // never pay out, even for healer encounters — they may still grant HEALING (below), but
  // not loot. This prevents the "rewarded on a critical failure" bug.
  const isSuccess = outcomeTier === 'success' || outcomeTier === 'criticalSuccess';

  const loot = {
    xp: isSuccess ? (rewards.xp || 0) : 0,
    gold: 0,
    items: [],
    healing: 0
  };

  // Gold rewards (roll dice formula)
  if (isSuccess && rewards.gold) {
    const goldRoll = parseDiceFormula(rewards.gold);
    loot.gold = rollDice(goldRoll.count, goldRoll.sides);
  }

  // Item rewards (percentage chance)
  if (isSuccess && rewards.items) {
    for (const itemEntry of rewards.items) {
      const [itemName, chanceStr] = itemEntry.split(':');
      const chance = parseInt(chanceStr) / 100;

      // Critical success increases loot chance by 50%
      const adjustedChance = outcomeTier === 'criticalSuccess'
        ? Math.min(chance * 1.5, 1.0)
        : chance;

      if (Math.random() < adjustedChance) {
        loot.items.push(itemName);
      }
    }

    // Gate high-rarity random drops by campaign tier / party level. Tier 1 (Lv 1-2)
    // caps at `rare`, so very_rare/legendary rolls are dropped even if the roll hit.
    loot.items = filterDropsByTier(loot.items, {
      tier: lootCtx.tier,
      level: lootCtx.level
    });
  }

  // Healing rewards (from healer encounters)
  if (encounter?.healingByTier) {
    const healingFormula = encounter.healingByTier[outcomeTier];
    if (healingFormula === 'full') {
      loot.healing = 'full';  // Will be handled in Game.js to restore to max HP
    } else if (healingFormula) {
      const healRoll = parseDiceFormulaWithBonus(healingFormula);
      loot.healing = rollDice(healRoll.count, healRoll.sides) + healRoll.bonus;
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
 * Parses dice formula with optional bonus like "2d8+4" into {count, sides, bonus}
 */
const parseDiceFormulaWithBonus = (formula) => {
  const match = formula.match(/(\d+)d(\d+)(?:\+(\d+))?/);
  if (!match) {
    return { count: 1, sides: 6, bonus: 0 };
  }
  return {
    count: parseInt(match[1]),
    sides: parseInt(match[2]),
    bonus: match[3] ? parseInt(match[3]) : 0
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
