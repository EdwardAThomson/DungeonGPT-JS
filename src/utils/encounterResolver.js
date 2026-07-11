import { rollCheck } from './dice';
import { calculateModifier, SKILLS } from './rules';
import { DIFFICULTY_DC } from '../data/encounters';
import {
  calculateDamage,
  encounterDealsDamage,
  rollProfileDamage,
  getDamageDescription
} from './healthSystem';
import { getEquippedBonuses } from '../game/equipment';
import { filterDropsByTier } from './inventorySystem';
import { getLevelBonus } from './progressionSystem';

// Stats whose checks count as physical/combat (attack-style), so a weapon's
// attack bonus applies. Encounters that hit back (explicit `dealsDamage`, or the
// deprecated keyword fallback for old data) also count regardless of skill.
const PHYSICAL_STATS = ['Strength', 'Dexterity'];

const isCombatAction = (statName, encounter) =>
  PHYSICAL_STATS.includes(statName) || encounterDealsDamage(encounter);

/**
 * The DC an encounter resolves against. Authored encounters may pin an exact
 * numeric `dc` (the #43 boss retune uses this to hit the sim-validated 18-21
 * band without inventing new difficulty labels); otherwise the difficulty
 * label maps through DIFFICULTY_DC as before.
 */
export const encounterDC = (encounter) =>
  Number.isFinite(encounter?.dc) ? encounter.dc : DIFFICULTY_DC[encounter?.difficulty];

/**
 * Contextual actions that multiRoundEncounter.getRoundActions injects mid-fight
 * (Finish Them / Demand Surrender / Tactical Retreat). They are NOT part of an
 * encounter's authored `suggestedActions`, so resolveEncounter would otherwise
 * throw "Invalid action" when the player picked one; that throw was swallowed into
 * a generic "An error occurred" failure result (the Tactical Retreat / Finish Them
 * crash). Recognizing them here maps each to a real skill check so they resolve
 * cleanly. getRoundActions imports these so the two lists never drift.
 * (Tactical Retreat is also intercepted in the modal and routed to the flee handler;
 * this entry keeps resolveEncounter safe if it is ever resolved directly, e.g. tests
 * or the balance sim.)
 */
export const CONTEXTUAL_ACTIONS = {
  'Finish Them': {
    label: 'Finish Them',
    skill: 'Athletics',
    description: 'Press your advantage for a decisive victory'
  },
  'Demand Surrender': {
    label: 'Demand Surrender',
    skill: 'Intimidation',
    description: "Force them to yield while they're weakened"
  },
  'Tactical Retreat': {
    label: 'Tactical Retreat',
    skill: 'Acrobatics',
    description: 'Disengage and escape while you can'
  }
};

/**
 * Resolves an encounter based on player action and dice roll
 * Returns AI-narrated outcome with rewards/penalties
 *
 * @param {() => number} rng - optional 0..1 random source for loot/penalty rolls
 *   (defaults to Math.random, so behavior is unchanged when omitted). Note the d20
 *   check (dice.rollCheck) and HP damage variance (healthSystem.calculateDamage)
 *   still read the global Math.random; a fully seeded run (balanceSim) swaps the
 *   global for the duration of the simulation.
 * @param {Object} context - optional extras (#43 Lead+Support):
 *   context.supportBonus - deterministic party support added to the roll
 *   (multiRoundEncounter computes it; surfaced on the result for the roll
 *   breakdown so the UI can show "d20 + modifier + support").
 */
export const resolveEncounter = async (encounter, playerAction, character, settings, llmConfig = {}, rng = Math.random, context = {}) => {
  // 1. Determine relevant skill and modifier. Contextual mid-fight actions
  // (Finish Them / Demand Surrender / Tactical Retreat) are not in suggestedActions,
  // so fall back to the shared CONTEXTUAL_ACTIONS map. NEVER throw on an unknown
  // label: a thrown error here was swallowed into a generic "An error occurred"
  // failure that punished the player. An unrecognized action resolves as a harmless
  // no-op success instead.
  const action = encounter.suggestedActions.find(a => a.label === playerAction)
    || CONTEXTUAL_ACTIONS[playerAction];

  if (!action) {
    return {
      narration: `You ${String(playerAction || 'act').toLowerCase()}.`,
      rollResult: null,
      outcomeTier: 'success',
      rewards: null,
      penalties: null
    };
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
  // Level term (#47 Option A): +1 per 2 levels, capped +3, on every check —
  // levels previously granted ZERO roll power (stats freeze at creation).
  // Applies retroactively (derived from level, not stored in saves).
  modifier += getLevelBonus(character.level);

  // Lead + Support (#43): supporters add a deterministic bonus to the lead's roll.
  const supportBonus = Number.isFinite(context?.supportBonus) ? context.supportBonus : 0;

  // 2. Roll the check (rollResult.modifier includes the support bonus; the raw
  // hero modifier is preserved separately for the roll-breakdown display).
  const rollResult = rollCheck(modifier + supportBonus);

  // 3. Determine outcome tier
  let outcomeTier;
  if (rollResult.isCriticalSuccess) {
    outcomeTier = 'criticalSuccess';
  } else if (rollResult.isCriticalFailure) {
    outcomeTier = 'criticalFailure';
  } else if (rollResult.total >= encounterDC(encounter)) {
    outcomeTier = 'success';
  } else {
    outcomeTier = 'failure';
  }

  // 4. Get base consequence
  const baseConsequence = encounter.consequences[outcomeTier];

  // 5. Use base consequence for narration (fully local, no AI calls)
  // This makes combat instant and eliminates API costs/latency
  const aiNarration = baseConsequence;

  // 6. Calculate HP damage if the encounter hits back (#43: explicit `dealsDamage`
  // flag with authored `damage` dice profiles; keyword fallback for old data, and
  // the legacy percent-of-maxHP model for flagged encounters without a profile).
  let hpDamage = 0;
  let damageDescription = null;

  if (encounterDealsDamage(encounter) && character.maxHP) {
    hpDamage = encounter.damage
      ? rollProfileDamage(encounter.damage, outcomeTier, rng)
      : calculateDamage(outcomeTier, character.maxHP, encounter.difficulty);
    // Armour soaks a flat amount of incoming damage (never below zero).
    hpDamage = Math.max(0, hpDamage - equipBonuses.defense);
    damageDescription = getDamageDescription(hpDamage, character.maxHP);
  }

  // 7. Apply rewards/penalties
  // Loot rarity is gated by campaign tier (falls back to party level for older saves
  // that predate settings.tier). Prevents very_rare/legendary random drops at Tier 1.
  const lootCtx = { tier: settings?.tier, level: character?.level };
  const outcome = applyConsequences(outcomeTier, encounter.rewards, rollResult, encounter, lootCtx, rng);

  return {
    narration: aiNarration,
    rollResult,
    outcomeTier,
    rewards: outcome.rewards,
    penalties: clampPenaltyGold(outcome.penalties, character?.gold),
    affectedFactions: encounter.affectedFactions?.[outcomeTier] || null,
    hpDamage,
    damageDescription,
    // #43: surfaced for the roll-breakdown UI (0 when fighting solo).
    supportBonus
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

const applyConsequences = (outcomeTier, rewards, rollResult, encounter, lootCtx, rng = Math.random) => {
  const result = {
    rewards: null,
    penalties: null
  };

  // Success tiers grant rewards
  if (outcomeTier === 'success' || outcomeTier === 'criticalSuccess') {
    result.rewards = generateLoot(rewards, rollResult, outcomeTier, encounter, lootCtx, rng);
  }

  // Failure tiers may still get healing from healer encounters
  if ((outcomeTier === 'failure' || outcomeTier === 'criticalFailure') && encounter?.healingByTier) {
    result.rewards = generateLoot(rewards, rollResult, outcomeTier, encounter, lootCtx, rng);
  }

  // Failure tiers may have penalties (context-aware)
  if (outcomeTier === 'failure' || outcomeTier === 'criticalFailure') {
    result.penalties = determinePenalties(outcomeTier, encounter, rng);
  }

  return result;
};

/**
 * Determines appropriate penalties based on encounter type
 * Returns { messages: [], goldLoss: number, itemsLost: [] }
 */
const determinePenalties = (outcomeTier, encounter, rng = Math.random) => {
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
      penalties.goldLoss = rollDice(2, 10, rng) + 10; // 12-30 gold
      penalties.messages.push(`Lost ${penalties.goldLoss} gold in the chaos`);
    } else {
      penalties.messages.push('Minor injuries sustained');
      penalties.goldLoss = rollDice(1, 10, rng) + 5; // 6-15 gold
      penalties.messages.push(`Lost ${penalties.goldLoss} gold escaping`);
    }
  }

  // Social encounters: reputation/resource consequences
  else if (isSocial) {
    if (isCritical) {
      penalties.messages.push('Reputation damaged');
      penalties.goldLoss = rollDice(1, 6, rng) + 2; // 3-8 gold
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
      penalties.goldLoss = rollDice(1, 6, rng); // 1-6 gold (supplies damaged)
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
      penalties.goldLoss = rollDice(1, 8, rng) + 2; // 3-10 gold
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
const generateLoot = (rewards, rollResult, outcomeTier, encounter, lootCtx = {}, rng = Math.random) => {
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
    loot.gold = rollDice(goldRoll.count, goldRoll.sides, rng);
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

      if (rng() < adjustedChance) {
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
      loot.healing = rollDice(healRoll.count, healRoll.sides, rng) + healRoll.bonus;
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
 * @param {() => number} rng - optional 0..1 random source (defaults to Math.random)
 */
const rollDice = (count, sides, rng = Math.random) => {
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += Math.floor(rng() * sides) + 1;
  }
  return total;
};
