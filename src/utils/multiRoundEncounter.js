import { resolveEncounter, clampPenaltyGold } from './encounterResolver';
import { calculateModifier } from './rules';
import { applyDamage } from './healthSystem';

/**
 * Multi-round encounter system for prolonged hostile encounters.
 * Each round is a narrative beat with player choices.
 *
 * #43 (combat depth):
 * - Enemy damage is FLAT per outcome tier (ENEMY_DAMAGE_BY_OUTCOME), not a percent
 *   of the enemy's max HP, so bigger monsters genuinely take more successes to kill.
 * - maxRounds scales with the enemy HP pool (computeMaxRounds) so big bosses are
 *   not unwinnable by timeout; the advantage-defeat floor scales alongside it.
 * - Boss fights are PARTY fights (ENCOUNTER_SYSTEM.md Phase 5, Lead + Support):
 *   one hero leads each round (full action, one d20), every other living hero adds
 *   a deterministic support bonus of max(1, floor(bestStatMod / 2)) to the roll.
 *   The lead takes the enemy's damage; on a critical failure each supporter takes
 *   25% splash (the Phase 5 "Others" row). A KO'd lead auto-swaps to the
 *   highest-HP living hero; when everyone is down the fight is lost.
 */

// --- #43 tuning constants (sim-validated via balanceSim / progressionLint) --------
// Flat damage dealt TO the enemy per outcome tier. Sim-tuned so a ~30 HP t1 boss
// dies in roughly the same number of rounds as the old percent model (~2 successes),
// while a 150-300 HP t2 boss needs 6-12 successes — party support and more rounds.
export const ENEMY_DAMAGE_BY_OUTCOME = {
  criticalSuccess: 50,
  success: 25,
  failure: 2,
  criticalFailure: 0
};

// How many reward-bearing rounds can pay out loot/XP. Multi-round rewards pay per
// successful round (historical quirk, T3_CAMPAIGNS_PLAN §2); with #43's scaled
// maxRounds an uncapped 20-round boss fight would become an XP fountain. Capping at
// 3 preserves the pre-#43 payout envelope exactly (maxRounds used to be 3).
export const REWARD_PAYING_ROUNDS_CAP = 3;

/**
 * Round cap scaled by the enemy's HP pool: roughly twice the successful rounds
 * needed to deplete it, floored at the classic 3.
 */
export const computeMaxRounds = (enemyHP) =>
  Math.max(3, Math.ceil((enemyHP || 20) / ENEMY_DAMAGE_BY_OUTCOME.success) * 2);

/**
 * Advantage floor that forces defeat. -3 for classic 3-round fights (unchanged);
 * longer boss fights get proportionally more room before the rout, otherwise a
 * 20-round fight would almost always random-walk into -3.
 */
export const computeAdvantageDefeatThreshold = (maxRounds) =>
  -(3 + Math.floor(Math.max(0, maxRounds - 3) / 4));

/**
 * A single hero's Phase 5 support contribution: max(1, floor(bestStatMod / 2)).
 * Deterministic, no extra dice.
 */
export const heroSupportContribution = (hero) => {
  const bestMod = Math.max(
    ...Object.values(hero?.stats || {}).map((v) => calculateModifier(v || 10)),
    calculateModifier(10)
  );
  return Math.max(1, Math.floor(bestMod / 2));
};

/**
 * Phase 5 support bonus: every LIVING party member other than the lead adds their
 * contribution to the lead's roll.
 */
export const getSupportBonus = (party, leadIndex) => {
  if (!Array.isArray(party) || party.length <= 1) return 0;
  return party.reduce((sum, hero, idx) => {
    if (idx === leadIndex || !hero) return sum;
    if (hero.currentHP <= 0 || hero.isDefeated) return sum; // KO'd heroes cannot support
    return sum + heroSupportContribution(hero);
  }, 0);
};

/**
 * Create the multi-round state.
 *
 * @param {Object} encounter - authored encounter block
 * @param {Object} character - the lead hero (kept for signature compatibility)
 * @param {Object} settings
 * @param {Object} llmConfig
 * @param {Array<Object>} party - optional full party (#43). When provided, the
 *   fight is a team encounter: `character` identifies the lead within it; heroes
 *   are shallow-copied so mid-fight damage never mutates caller state.
 */
export const createMultiRoundEncounter = (encounter, character, settings, llmConfig = {}, party = null) => {
  const sourceParty = Array.isArray(party) && party.length > 0 ? party : [character];
  const uid = (h) => (h && (h.heroId || h.characterId)) || null;
  let leadIndex = sourceParty.findIndex(
    (h) => h === character || (uid(h) !== null && uid(h) === uid(character))
  );
  if (leadIndex < 0) leadIndex = 0;
  const partyList = sourceParty.map((h) => ({ ...h }));
  const enemyHP = encounter.enemyHP || 20;
  const maxRounds = computeMaxRounds(enemyHP);

  return {
    encounter,
    character: partyList[leadIndex],
    settings,
    llmConfig,
    currentRound: 1,
    maxRounds,
    advantageDefeatThreshold: computeAdvantageDefeatThreshold(maxRounds),
    roundHistory: [],
    enemyMorale: 100, // Drops with successful player actions
    playerAdvantage: 0, // Builds with successful tactics
    enemyMaxHP: enemyHP,
    enemyCurrentHP: enemyHP,
    // --- Phase 5 team state ---
    party: partyList,
    leadIndex,
    isTeamEncounter: partyList.length > 1,
    supportBonus: getSupportBonus(partyList, leadIndex),
    teamDamageLog: [],
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

// Apply the round's incoming damage to the party (#43). Pure with respect to the
// incoming arrays: returns { party, damageEvents } with replaced hero objects.
// Lead takes the base damage; on a critical failure every living supporter takes
// 25% splash (Phase 5 damage-distribution "Others" row; support roles like Guard
// are future work, so the role-specific rows do not apply yet).
const distributeIncomingDamage = (party, leadIndex, hpDamage, outcomeTier) => {
  const damageEvents = [];
  if (!hpDamage || hpDamage <= 0) return { party, damageEvents };
  const updated = [...party];

  updated[leadIndex] = applyDamage(updated[leadIndex], hpDamage);
  damageEvents.push({ heroIndex: leadIndex, amount: hpDamage, role: 'lead' });

  if (outcomeTier === 'criticalFailure') {
    const splash = Math.floor(hpDamage * 0.25);
    if (splash > 0) {
      updated.forEach((hero, idx) => {
        if (idx === leadIndex || !hero) return;
        if (hero.currentHP <= 0 || hero.isDefeated) return;
        updated[idx] = applyDamage(hero, splash);
        damageEvents.push({ heroIndex: idx, amount: splash, role: 'support' });
      });
    }
  }
  return { party: updated, damageEvents };
};

/**
 * Resolve a single round of combat
 * @param {() => number} rng - optional 0..1 random source, forwarded to
 *   resolveEncounter's loot/penalty/damage-profile rolls (defaults to Math.random —
 *   no behavior change when omitted). Used by the balance-sim harness for seeded runs.
 */
export const resolveRound = async (roundState, playerAction, rng = Math.random) => {
  const lead = roundState.party
    ? roundState.party[roundState.leadIndex]
    : roundState.character;

  const result = await resolveEncounter(
    roundState.encounter,
    playerAction,
    lead,
    roundState.settings,
    roundState.llmConfig,
    rng,
    { supportBonus: roundState.supportBonus || 0 }
  );

  // Update state based on outcome
  const updatedState = { ...roundState };

  // Store current round in history BEFORE incrementing
  updatedState.roundHistory.push({
    round: roundState.currentRound,
    action: playerAction,
    leadIndex: roundState.leadIndex,
    result
  });

  // Now increment for next round
  updatedState.currentRound += 1;

  // Damage to the enemy: FLAT per outcome (#43), so the enemy HP pool is a real
  // difficulty knob — a 300 HP boss takes 6x the successes of a 50 HP one.
  let enemyDamage = 0;
  if (result.outcomeTier === 'criticalSuccess') {
    enemyDamage = ENEMY_DAMAGE_BY_OUTCOME.criticalSuccess;
    updatedState.playerAdvantage += 2;
  } else if (result.outcomeTier === 'success') {
    enemyDamage = ENEMY_DAMAGE_BY_OUTCOME.success;
    updatedState.playerAdvantage += 1;
  } else if (result.outcomeTier === 'failure') {
    enemyDamage = ENEMY_DAMAGE_BY_OUTCOME.failure;
    updatedState.enemyMorale += 10;
    updatedState.playerAdvantage -= 1;
  } else if (result.outcomeTier === 'criticalFailure') {
    enemyDamage = ENEMY_DAMAGE_BY_OUTCOME.criticalFailure;
    updatedState.enemyMorale += 20;
    updatedState.playerAdvantage -= 2;
  }

  // Apply damage to enemy
  updatedState.enemyCurrentHP = Math.max(0, updatedState.enemyCurrentHP - enemyDamage);

  // Morale loss tracks the HP fraction actually removed (a 300 HP horror does not
  // rout because of two lucky hits; a goblin band breaks when gutted). Failure
  // tiers still RESTORE morale (+10/+20 above).
  if (enemyDamage > 0 && updatedState.enemyMaxHP > 0) {
    updatedState.enemyMorale -= Math.round((enemyDamage / updatedState.enemyMaxHP) * 100);
  }
  updatedState.enemyMorale = Math.min(100, updatedState.enemyMorale);

  // Add enemy damage to result for display
  result.enemyDamage = enemyDamage;
  result.enemyCurrentHP = updatedState.enemyCurrentHP;
  result.enemyMaxHP = updatedState.enemyMaxHP;

  // --- Incoming damage lands on the party (#43) --------------------------------
  if (updatedState.party) {
    const { party, damageEvents } = distributeIncomingDamage(
      updatedState.party,
      updatedState.leadIndex,
      result.hpDamage || 0,
      result.outcomeTier
    );
    updatedState.party = party;
    updatedState.character = party[updatedState.leadIndex];
    if (damageEvents.length > 0) {
      updatedState.teamDamageLog = [
        ...(updatedState.teamDamageLog || []),
        { round: roundState.currentRound, events: damageEvents }
      ];
      result.partyDamage = damageEvents;
    }

    // Lead KO'd: auto-swap to the highest-HP living hero (Phase 5 edge case), or
    // lose the fight when nobody is left standing.
    if (party[updatedState.leadIndex].currentHP <= 0) {
      let bestIdx = -1;
      party.forEach((hero, idx) => {
        if (idx === updatedState.leadIndex || !hero) return;
        if (hero.currentHP <= 0 || hero.isDefeated) return;
        if (bestIdx < 0 || hero.currentHP > party[bestIdx].currentHP) bestIdx = idx;
      });
      if (bestIdx >= 0) {
        result.leadSwap = {
          fromIndex: updatedState.leadIndex,
          toIndex: bestIdx,
          downedHero: party[updatedState.leadIndex].heroName || party[updatedState.leadIndex].characterName,
          newLead: party[bestIdx].heroName || party[bestIdx].characterName
        };
        updatedState.leadIndex = bestIdx;
        updatedState.character = party[bestIdx];
      } else {
        updatedState.isResolved = true;
        updatedState.outcome = 'defeat';
        result.partyWiped = true;
      }
    }
    // Support shrinks as heroes fall (and excludes the new lead after a swap).
    updatedState.supportBonus = getSupportBonus(updatedState.party, updatedState.leadIndex);
  }

  // Check for resolution conditions (a party wipe above wins the tie)
  if (!updatedState.isResolved) {
    if (updatedState.enemyCurrentHP <= 0) {
      updatedState.isResolved = true;
      updatedState.outcome = 'victory';
    } else if (updatedState.enemyMorale <= 0) {
      updatedState.isResolved = true;
      updatedState.outcome = 'victory';
    } else if (updatedState.playerAdvantage <= (updatedState.advantageDefeatThreshold ?? -3)) {
      updatedState.isResolved = true;
      updatedState.outcome = 'defeat';
    } else if (updatedState.currentRound > updatedState.maxRounds) {
      // Timeout: a win requires momentum AND a nearly-depleted enemy — with flat
      // damage the HP pool must matter, so a 300 HP boss at half health is a
      // stalemate no matter the advantage score.
      const bloodied = updatedState.enemyCurrentHP <= updatedState.enemyMaxHP * 0.25;
      updatedState.isResolved = true;
      updatedState.outcome = (updatedState.playerAdvantage > 0 && bloodied) ? 'victory' : 'stalemate';
    } else if (playerAction === 'Tactical Retreat' && result.outcomeTier !== 'criticalFailure') {
      updatedState.isResolved = true;
      updatedState.outcome = 'escaped';
    }
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

  // Calculate total rewards/penalties. Rewards pay per reward-bearing round but
  // only the first REWARD_PAYING_ROUNDS_CAP such rounds count (#43: keeps long
  // scaled-maxRounds boss fights inside the classic 3-round payout envelope).
  let payingRounds = 0;
  const totalRewards = rounds.reduce((acc, r) => {
    if (!r.result.rewards) return acc;
    if (payingRounds >= REWARD_PAYING_ROUNDS_CAP) return acc;
    payingRounds += 1;
    return {
      xp: acc.xp + (r.result.rewards.xp || 0),
      gold: acc.gold + (r.result.rewards.gold || 0),
      items: [...acc.items, ...(r.result.rewards.items || [])]
    };
  }, { xp: 0, gold: 0, items: [] });

  // Aggregate penalties (penalties is an object with messages, goldLoss, itemsLost)
  // Deduplicate status messages and consolidate gold loss into a single message
  const rawPenalties = rounds.reduce((acc, r) => {
    if (!r.result.penalties) return acc;
    return {
      messages: [...acc.messages, ...(r.result.penalties.messages || [])],
      goldLoss: acc.goldLoss + (r.result.penalties.goldLoss || 0),
      itemsLost: [...acc.itemsLost, ...(r.result.penalties.itemsLost || [])]
    };
  }, { messages: [], goldLoss: 0, itemsLost: [] });

  // Deduplicate: keep unique status messages, replace per-round gold messages with one total
  const goldPattern = /^Lost \d+ gold/;
  const uniqueStatusMessages = [...new Set(
    rawPenalties.messages.filter(m => !goldPattern.test(m))
  )];
  if (rawPenalties.goldLoss > 0) {
    uniqueStatusMessages.push(`Lost ${rawPenalties.goldLoss} gold`);
  }
  const totalPenalties = {
    messages: uniqueStatusMessages,
    goldLoss: rawPenalties.goldLoss,
    itemsLost: rawPenalties.itemsLost
  };

  // Add outcome-based modifiers
  if (outcome === 'victory') {
    totalRewards.xp = Math.floor(totalRewards.xp * 1.2); // 20% bonus for victory
  } else if (outcome === 'defeat') {
    totalRewards.xp = Math.floor(totalRewards.xp * 0.5); // Half XP for defeat
    totalRewards.gold = Math.floor(totalRewards.gold * 0.3); // Lose most gold
    totalPenalties.messages.push('Defeated - serious injuries sustained');
  } else if (outcome === 'escaped') {
    totalRewards.xp = Math.floor(totalRewards.xp * 0.7); // Reduced XP for fleeing
    totalRewards.items = []; // No loot when fleeing
  }

  return {
    narration: fullNarration,
    outcome,
    rewards: totalRewards,
    // Clamp the SUMMED gold loss to the hero's available gold so a multi-round fight can't
    // display "Lost 44 gold" when the hero had less (the per-round sums are unbounded; the
    // actual party deduction is clamped separately).
    penalties: clampPenaltyGold(totalPenalties, roundState.character?.gold),
    roundCount: rounds.length,
    // --- Phase 5 team info for the reward distributor (#43) ---
    isTeamEncounter: !!roundState.isTeamEncounter,
    leadIndex: roundState.leadIndex || 0,
    supporterCount: roundState.isTeamEncounter
      ? Math.max(0, (roundState.party?.length || 1) - 1)
      : 0
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
