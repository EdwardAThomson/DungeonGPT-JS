// balanceSim.js — balance-simulation harness (#46).
// Design: docs/T3_CAMPAIGNS_PLAN.md §4 (API/implementation), §4.4 (party projection,
// XP-budget audit) and Part II §16 (the progression-lint guards that consume it).
//
// Pure module: no React, no LLM, no network, no persistence. It Monte-Carlos an
// authored `encounter` block by driving the REAL production resolution path —
// createMultiRoundEncounter / resolveRound / generateEncounterSummary for
// multi-round blocks, a single resolveEncounter otherwise — under a seeded PRNG,
// so the sim can never drift from the live combat rules.
//
// Randomness: dice.rollCheck (the d20) and healthSystem.calculateDamage (damage
// variance) read the global Math.random, so simulateEncounter swaps Math.random
// for a seeded generator for the duration of the run (try/finally restore; the
// doc-sanctioned zero-prod-change approach). The same generator is ALSO passed
// down the additive `rng` params of resolveRound/resolveEncounter (loot + penalty
// rolls), so every roll in a run comes from one deterministic stream.

import {
  createMultiRoundEncounter,
  resolveRound,
  generateEncounterSummary,
  getRoundActions,
  shouldUseMultiRound
} from '../utils/multiRoundEncounter';
import { resolveEncounter } from '../utils/encounterResolver';
import { calculateModifier, SKILLS } from '../utils/rules';
import { initializeHP, shouldDealDamage } from '../utils/healthSystem';
import { getEquippedBonuses, parseBonus, SLOT_FOR_TYPE } from './equipment';
import {
  ITEM_CATALOG,
  RARITY_RANK,
  maxRarityRankForTier
} from '../utils/inventorySystem';
import { heroTemplates, STAT_KEYS } from '../data/heroData';
import { XP_THRESHOLDS } from '../utils/progressionSystem';

// --- Seeded RNG (mulberry32) ------------------------------------------------------
// Same generator family as localNarrator's seeded prose RNG (reimplemented here so a
// combat-sim concern doesn't import from the narration module).
export const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// --- Gear loadouts ----------------------------------------------------------------
// Named presets (doc §4.1). 'best' is DERIVED from ITEM_CATALOG equippables at
// runtime, respecting the rarity-per-tier gate (maxRarityRankForTier), so it always
// means "the best gear a player could actually be handed at this campaign tier"
// (Part II §16c: never a hypothetical loadout).
export const LOADOUT_PRESETS = {
  none: { weapon: null, armor: null, accessory: null },
  mid: { weapon: 'magic_weapon', armor: 'studded_leather', accessory: 'enchanted_trinket' }
};

/** All ITEM_CATALOG entries that occupy an equip slot, as [key, def, slot]. */
export const equippableCatalogEntries = () =>
  Object.entries(ITEM_CATALOG)
    .filter(([, def]) => SLOT_FOR_TYPE[def.type])
    .map(([key, def]) => [key, def, SLOT_FOR_TYPE[def.type]]);

// Effective numeric bonus of an item in its slot. Accessories with no numeric bonus
// still grant +1 when equipped (equipment.js ACCESSORY_DEFAULT_BONUS).
const slotBonus = (def, slot) => {
  const parsed = parseBonus(def.bonus);
  return slot === 'accessory' ? (parsed || 1) : parsed;
};

/**
 * Best catalog gear per slot whose rarity is allowed at the given campaign tier.
 * @param {number} tier - campaign tier (1..3)
 * @returns {{ weapon: string|null, armor: string|null, accessory: string|null }}
 */
export const bestObtainableLoadout = (tier = 1) => {
  const maxRank = maxRarityRankForTier(tier);
  const best = { weapon: null, armor: null, accessory: null };
  const bestBonus = { weapon: -Infinity, armor: -Infinity, accessory: -Infinity };
  for (const [key, def, slot] of equippableCatalogEntries()) {
    if ((RARITY_RANK[def.rarity] ?? 0) > maxRank) continue;
    const bonus = slotBonus(def, slot);
    if (bonus > bestBonus[slot]) {
      bestBonus[slot] = bonus;
      best[slot] = key;
    }
  }
  return best;
};

/** Resolve a loadout name ('none' | 'mid' | 'best') or explicit slot map. */
export const resolveLoadout = (loadout = 'mid', tier = 1) => {
  if (loadout && typeof loadout === 'object') return loadout;
  if (loadout === 'best') return bestObtainableLoadout(tier);
  return LOADOUT_PRESETS[loadout] || LOADOUT_PRESETS.none;
};

// --- Sim heroes -------------------------------------------------------------------
/**
 * Build a canonical sim hero (doc §4.1). Stats come from the live class templates
 * (standard array, 15 cap — the real creation ceiling), HP from the live
 * healthSystem.calculateMaxHP via initializeHP (level-aware since #48).
 * @param {Object} spec
 * @param {number} spec.level
 * @param {string} spec.characterClass - class template name (default 'Fighter')
 * @param {'none'|'mid'|'best'|Object} spec.loadout - gear preset (default 'mid')
 * @param {number} spec.tier - campaign tier, gates the 'best' loadout (default 1)
 * @param {Object} spec.stats - optional explicit stat block override
 * @param {number} spec.gold - starting gold (default 100, so penalties register)
 */
export const buildSimHero = ({
  level = 1,
  characterClass = 'Fighter',
  loadout = 'mid',
  tier = 1,
  stats = null,
  gold = 100
} = {}) => {
  const template = heroTemplates[characterClass] || heroTemplates.Fighter;
  const equipment = resolveLoadout(loadout, tier);
  const inventory = Object.values(equipment).filter(Boolean);
  const hero = {
    heroName: `Sim ${characterClass} L${level}`,
    // Both spellings so every consumer (heroClass in saves, characterClass in
    // progression code) resolves the class the same way.
    heroClass: characterClass,
    characterClass,
    level,
    xp: XP_THRESHOLDS[Math.min(level, XP_THRESHOLDS.length) - 1] || 0,
    stats: { ...(stats || template.stats) },
    gold,
    inventory,
    equipment
  };
  return initializeHP(hero);
};

// --- Action policy ----------------------------------------------------------------
// Effective modifier of an action for a hero, mirroring encounterResolver's rules
// (stat mod + weapon attack when the stat is physical or the encounter is
// hostile-named + accessory misc always).
const PHYSICAL_STATS = ['Strength', 'Dexterity'];

export const effectiveActionModifier = (action, hero, encounter) => {
  const statName = SKILLS[action.skill];
  if (!statName) return -Infinity;
  let modifier = calculateModifier(hero.stats?.[statName] || 10);
  const equip = getEquippedBonuses(hero);
  if (PHYSICAL_STATS.includes(statName) || shouldDealDamage(encounter)) {
    modifier += equip.attack;
  }
  modifier += equip.misc;
  return modifier;
};

// Pick this round's action. Policies (doc §4.2):
//   'best-modifier' (default) — the competent player: highest effective modifier.
//   'random'                  — uniform over the eligible actions.
//   'fixed:<label>'           — always the named action.
// Only actions defined on the encounter block itself are eligible: the contextual
// actions getRoundActions() adds ('Finish Them', 'Demand Surrender', 'Tactical
// Retreat') are not resolvable by resolveEncounter (it looks the label up in
// encounter.suggestedActions), and Tactical Retreat is excluded from the default
// policy by design anyway.
const pickAction = (policy, roundState, hero, rng) => {
  const encounter = roundState.encounter;
  const offered = getRoundActions(roundState);
  const resolvable = offered.filter(
    (a) => a.skill && a.label !== 'Tactical Retreat' &&
      encounter.suggestedActions.some((s) => s.label === a.label)
  );
  const pool = resolvable.length > 0
    ? resolvable
    : encounter.suggestedActions.filter((a) => a.skill);
  if (pool.length === 0) return null;

  if (typeof policy === 'string' && policy.startsWith('fixed:')) {
    const label = policy.slice('fixed:'.length);
    return pool.find((a) => a.label === label) || pool[0];
  }
  if (policy === 'random') {
    return pool[Math.floor(rng() * pool.length)];
  }
  // 'best-modifier'
  return pool.reduce((best, a) =>
    effectiveActionModifier(a, hero, encounter) > effectiveActionModifier(best, hero, encounter) ? a : best
  );
};

// --- Party projection (doc §4.4) ---------------------------------------------------
/**
 * PROJECTION of the Phase 5 Lead + Support model (docs/ENCOUNTER_SYSTEM.md):
 * each supporting hero contributes a deterministic `max(1, floor(bestStatMod / 2))`
 * to the lead's roll. Phase 5 is NOT implemented in the live resolver; this models
 * the designed formula so party-size DC tuning can be done on numbers before the
 * mechanic ships. Treat multi-hero results as projections, not measurements.
 * @param {Array<Object>} party - sim heroes; party[0] is the lead
 * @returns {number} total support bonus added to the lead's modifier
 */
export const projectedSupportBonus = (party) =>
  (party || []).slice(1).reduce((sum, hero) => {
    const bestMod = Math.max(
      ...STAT_KEYS.map((s) => calculateModifier(hero.stats?.[s] || 10))
    );
    return sum + Math.max(1, Math.floor(bestMod / 2));
  }, 0);

// Fold the projected support bonus into the lead as a pure modifier adder:
// +2 to every stat per +1 of support bonus (= +1 modifier on every check), leaving
// the resolver code untouched.
const applySupportProjection = (party) => {
  const lead = party[0];
  if (party.length <= 1) return { lead, supportBonus: 0 };
  const supportBonus = projectedSupportBonus(party);
  const boosted = {};
  for (const key of STAT_KEYS) {
    boosted[key] = (lead.stats?.[key] || 10) + supportBonus * 2;
  }
  return { lead: { ...lead, stats: boosted }, supportBonus };
};

// --- The simulator ----------------------------------------------------------------
/**
 * Monte-Carlo one authored encounter block against a hero (or party) with a seeded
 * PRNG, driving the real resolution path.
 *
 * @param {Object} encounter - the authored `encounter` object (template/milestone)
 * @param {Object|Array<Object>} heroOrParty - a sim hero, or 1-4 heroes
 *   (party[0] leads; the rest add the projected Phase 5 support bonus)
 * @param {Object} opts
 * @param {number} opts.trials - Monte-Carlo runs (default 3000: ±~1.8pp at 95%)
 * @param {number} opts.seed - PRNG seed (default 1); same seed => identical result
 * @param {Object} opts.settings - game settings, at least { tier } for loot gating
 * @param {string} opts.policy - 'best-modifier' | 'random' | 'fixed:<label>'
 * @returns {Promise<Object>} aggregate stats (rates, rounds, HP loss, XP/gold)
 */
export const simulateEncounter = async (encounter, heroOrParty, {
  trials = 3000,
  seed = 1,
  settings = {},
  policy = 'best-modifier'
} = {}) => {
  const party = Array.isArray(heroOrParty) ? heroOrParty : [heroOrParty];
  const { lead, supportBonus } = applySupportProjection(party);
  const rng = mulberry32((seed >>> 0) || 1);

  const outcomes = { victory: 0, defeat: 0, stalemate: 0, escaped: 0 };
  let totalRounds = 0;
  let totalHpLoss = 0;
  let koCount = 0;
  let totalXp = 0;
  let xpOnWins = 0;
  let totalGoldDelta = 0;
  let actionLabel = null;

  const multiRound = encounter.multiRound === true || shouldUseMultiRound(encounter);
  const realRandom = Math.random;
  // eslint-disable-next-line no-global-assign
  Math.random = rng; // seed rollCheck (d20) + damage variance; restored in finally
  try {
    for (let i = 0; i < trials; i++) {
      const maxHP = lead.maxHP || 20;
      let currentHP = maxHP;
      let hpLoss = 0;
      let ko = false;
      let outcome;
      let rounds;
      let xp = 0;
      let goldDelta = 0;

      if (multiRound) {
        let state = createMultiRoundEncounter(encounter, lead, settings, {});
        while (!state.isResolved) {
          const action = pickAction(policy, state, lead, rng);
          if (!action) break;
          if (!actionLabel) actionLabel = action.label;
          const { roundResult, updatedState } = await resolveRound(state, action.label, rng);
          state = updatedState;
          if (roundResult.hpDamage > 0) {
            currentHP -= roundResult.hpDamage;
            hpLoss += roundResult.hpDamage;
            if (currentHP <= 0) {
              // Acting hero downed mid-fight forces defeat (EncounterActionModal rule).
              state.isResolved = true;
              state.outcome = 'defeat';
              ko = true;
            }
          }
        }
        const summary = await generateEncounterSummary(state);
        outcome = state.outcome || 'stalemate';
        rounds = state.roundHistory.length;
        xp = summary.rewards?.xp || 0;
        goldDelta = (summary.rewards?.gold || 0) - (summary.penalties?.goldLoss || 0);
      } else {
        const action = pickAction(policy, { encounter, currentRound: 1 }, lead, rng);
        if (!action) break;
        if (!actionLabel) actionLabel = action.label;
        const result = await resolveEncounter(encounter, action.label, lead, settings, {}, rng);
        rounds = 1;
        if (result.hpDamage > 0) {
          currentHP -= result.hpDamage;
          hpLoss += result.hpDamage;
          if (currentHP <= 0) ko = true;
        }
        const success = result.outcomeTier === 'success' || result.outcomeTier === 'criticalSuccess';
        outcome = ko ? 'defeat' : (success ? 'victory' : 'defeat');
        xp = result.rewards?.xp || 0;
        goldDelta = (result.rewards?.gold || 0) - (result.penalties?.goldLoss || 0);
      }

      outcomes[outcome] = (outcomes[outcome] || 0) + 1;
      totalRounds += rounds;
      totalHpLoss += hpLoss;
      if (ko) koCount += 1;
      totalXp += xp;
      if (outcome === 'victory') xpOnWins += xp;
      totalGoldDelta += goldDelta;
    }
  } finally {
    // eslint-disable-next-line no-global-assign
    Math.random = realRandom;
  }

  const winRate = outcomes.victory / trials;
  return {
    encounterName: encounter.name,
    trials,
    seed,
    policy,
    action: actionLabel,
    multiRound,
    winRate,
    defeatRate: outcomes.defeat / trials,
    stalemateRate: outcomes.stalemate / trials,
    escapeRate: outcomes.escaped / trials,
    outcomeDistribution: { ...outcomes },
    meanRounds: totalRounds / trials,
    meanHeroHpLoss: totalHpLoss / trials,
    // Single acting hero => a knockout IS the party-wipe proxy (doc §4.1 koRate).
    koRate: koCount / trials,
    tpkRisk: koCount / trials,
    meanXp: totalXp / trials,
    meanXpOnWin: outcomes.victory > 0 ? xpOnWins / outcomes.victory : 0,
    meanGoldDelta: totalGoldDelta / trials,
    expectedAttemptsToWin: winRate > 0 ? 1 / winRate : Infinity,
    partyProjection: party.length > 1
      ? {
          partySize: party.length,
          supportBonus,
          note: 'PROJECTION: Phase 5 Lead/Support bonus (ENCOUNTER_SYSTEM.md) modeled as a flat modifier adder; not yet implemented in the live resolver.'
        }
      : null
  };
};

/**
 * Authoring sweep: win-rate matrix across levels x loadouts (doc §4.1).
 * @returns {Promise<Object>} { [level]: { [loadoutName]: simResult } }
 */
export const sweepEncounter = async (encounter, {
  levels = [1, 2, 3, 4, 5, 6, 7],
  loadouts = ['none', 'mid', 'best'],
  characterClass = 'Fighter',
  tier = 1,
  trials = 3000,
  seed = 1,
  settings = null,
  policy = 'best-modifier'
} = {}) => {
  const matrix = {};
  for (const level of levels) {
    matrix[level] = {};
    for (const loadout of loadouts) {
      const hero = buildSimHero({ level, characterClass, loadout, tier });
      matrix[level][loadout] = await simulateEncounter(encounter, hero, {
        trials,
        seed,
        settings: settings || { tier },
        policy
      });
    }
  }
  return matrix;
};

// --- XP-budget audit (doc §4.4 / Part II §16d) --------------------------------------
/** Total XP a side quest can pay: objective/turn-in step rewards + quest reward. */
export const questTotalXp = (quest) =>
  (quest.milestones || []).reduce((sum, m) => sum + (m.rewards?.xp || 0), 0) +
  (quest.rewards?.xp || 0);

/**
 * Sum the authored XP a world can pay out and compare it to a target threshold.
 * Counts: milestone rewards, the boss encounter's simulated mean XP per victory
 * (which inherits the real per-round payout quirk), and the top `questCount` side
 * quests by total XP (an optimistic upper bound for the 2-4 selected per world).
 * Random-encounter grinding is deliberately excluded: it is unbounded and would
 * make every budget "reachable".
 *
 * @param {Object} template - a storyTemplates entry (needs settings.milestones)
 * @param {Object} opts - { sideQuests, questCount, trials, seed, characterClass }
 * @returns {Promise<Object>} breakdown + total
 */
export const auditWorldXpBudget = async (template, {
  sideQuests = [],
  questCount = 4,
  trials = 3000,
  seed = 1,
  characterClass = 'Fighter'
} = {}) => {
  const milestones = template?.settings?.milestones || [];
  const milestoneXp = milestones.reduce((sum, m) => sum + (m.rewards?.xp || 0), 0);

  let bossXp = 0;
  let bossName = null;
  const bossMilestone = milestones.find((m) => m.encounter);
  if (bossMilestone) {
    const level = bossMilestone.minLevel || (template.levelRange ? template.levelRange[0] : 1);
    const hero = buildSimHero({ level, characterClass, loadout: 'mid', tier: template.tier });
    const sim = await simulateEncounter(bossMilestone.encounter, hero, {
      trials,
      seed,
      settings: { tier: template.tier }
    });
    bossXp = sim.meanXpOnWin;
    bossName = bossMilestone.encounter.name;
  }

  const questXpTotals = sideQuests.map(questTotalXp).sort((a, b) => b - a).slice(0, questCount);
  const questXp = questXpTotals.reduce((a, b) => a + b, 0);

  return {
    templateId: template.id,
    tier: template.tier,
    milestoneXp,
    bossName,
    expectedBossXpOnVictory: bossXp,
    questCount: questXpTotals.length,
    questXp,
    totalXp: milestoneXp + bossXp + questXp
  };
};
