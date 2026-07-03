import { addGold, addItem } from '../utils/inventorySystem';
import { awardXP, getLevelUpSummary } from '../utils/progressionSystem';

const applyEncounterRewards = (hero, rewards) => {
  if (!rewards) {
    return { hero, messages: [] };
  }

  let updatedHero = { ...hero };
  const messages = [];

  if (rewards.xp > 0) {
    const xpResult = awardXP(updatedHero, rewards.xp);
    updatedHero = xpResult.character;
    messages.push(`+${rewards.xp} XP`);

    if (xpResult.leveledUp) {
      const summary = getLevelUpSummary(xpResult.previousLevel, xpResult.newLevel, updatedHero);
      messages.push(`🎉 LEVEL UP! Now level ${summary.newLevel}!`);
    }
  }

  if (rewards.gold > 0) {
    updatedHero = addGold(updatedHero, rewards.gold);
    messages.push(`+${rewards.gold} gold`);
  }

  if (Array.isArray(rewards.items) && rewards.items.length > 0) {
    for (const itemName of rewards.items) {
      const itemKey = itemName.replace(/ /g, '_').toLowerCase();
      updatedHero = {
        ...updatedHero,
        inventory: addItem(updatedHero.inventory || [], itemKey)
      };
    }
    messages.push(`Found: ${rewards.items.join(', ')}`);
  }

  if (rewards.healing) {
    const currentHP = updatedHero.currentHP || 0;
    const maxHP = updatedHero.maxHP || 20;

    if (rewards.healing === 'full') {
      updatedHero.currentHP = maxHP;
      messages.push(`💚 Fully healed to ${maxHP} HP!`);
    } else if (typeof rewards.healing === 'number' && rewards.healing > 0) {
      const newHP = Math.min(currentHP + rewards.healing, maxHP);
      const actualHeal = newHP - currentHP;
      updatedHero.currentHP = newHP;
      if (actualHeal > 0) {
        messages.push(`💚 Healed for ${actualHeal} HP (${currentHP} → ${newHP})`);
      }
    }
  }

  return { hero: updatedHero, messages };
};

const applyEncounterPenalties = (hero, penalties) => {
  if (!penalties || penalties.goldLoss <= 0) {
    return { hero, messages: [] };
  }

  const updatedHero = { ...hero };
  const currentGold = updatedHero.gold || 0;
  const actualLoss = Math.min(penalties.goldLoss, currentGold);
  updatedHero.gold = Math.max(0, currentGold - actualLoss);

  return {
    hero: updatedHero,
    messages: [`-${actualLoss} gold (${currentGold} → ${updatedHero.gold})`]
  };
};

export const applyEncounterOutcomeToParty = ({ party, result }) => {
  const heroIndex = result?.heroIndex !== undefined ? result.heroIndex : 0;
  if (!Array.isArray(party) || party.length === 0 || heroIndex >= party.length) {
    return {
      updatedParty: party || [],
      heroIndex,
      rewardMessages: [],
      penaltyMessages: []
    };
  }

  const updatedParty = [...party];
  let workingHero = { ...updatedParty[heroIndex] };

  const rewardsResult = applyEncounterRewards(workingHero, result?.rewards);
  workingHero = rewardsResult.hero;

  const penaltiesResult = applyEncounterPenalties(workingHero, result?.penalties);
  workingHero = penaltiesResult.hero;

  updatedParty[heroIndex] = workingHero;

  return {
    updatedParty,
    heroIndex,
    rewardMessages: rewardsResult.messages,
    penaltyMessages: penaltiesResult.messages
  };
};

/**
 * Team-encounter reward distribution (#43, ENCOUNTER_SYSTEM.md Phase 5):
 * - XP is split evenly across ALL party members (KO'd heroes fought too), with a
 *   +10% bonus to the pot per support hero to encourage full parties.
 * - Gold, items, healing and penalties go through the lead (heroIndex), matching
 *   the existing shared-pool conventions (gold/items are already de facto shared).
 * Falls back to the classic single-hero path for solo results.
 *
 * @param {Object} args
 * @param {Array} args.party - the full party
 * @param {Object} args.result - encounter summary; uses result.heroIndex (lead),
 *   result.isTeamEncounter and result.supporterCount
 * @returns {{ updatedParty, heroIndex, rewardMessages, penaltyMessages }}
 */
export const applyTeamEncounterOutcomeToParty = ({ party, result }) => {
  if (!result?.isTeamEncounter || !Array.isArray(party) || party.length <= 1) {
    return applyEncounterOutcomeToParty({ party, result });
  }

  const heroIndex = result?.heroIndex !== undefined ? result.heroIndex : 0;
  const supporterCount = result?.supporterCount || Math.max(0, party.length - 1);
  const rewards = result?.rewards || {};
  const xpPot = Math.floor((rewards.xp || 0) * (1 + 0.1 * supporterCount));
  const xpShare = Math.floor(xpPot / party.length);
  const xpRemainder = xpPot - xpShare * party.length;

  let updatedParty = [...party];
  const rewardMessages = [];

  updatedParty = updatedParty.map((hero, idx) => {
    const isLead = idx === heroIndex;
    const heroRewards = {
      ...(isLead ? rewards : {}),
      // Lead keeps the rounding remainder so the pot is fully paid out.
      xp: xpShare + (isLead ? xpRemainder : 0)
    };
    const { hero: updated, messages } = applyEncounterRewards(hero, heroRewards);
    const name = hero.heroName || hero.characterName || `Hero ${idx + 1}`;
    messages.forEach((msg) => rewardMessages.push(`${name}: ${msg}`));
    return updated;
  });

  const penaltiesResult = applyEncounterPenalties(updatedParty[heroIndex], result?.penalties);
  updatedParty[heroIndex] = penaltiesResult.hero;

  return {
    updatedParty,
    heroIndex,
    rewardMessages,
    penaltyMessages: penaltiesResult.messages
  };
};

export const formatEncounterRewardLog = (heroName, messages = []) => {
  if (!messages.length) return null;
  return `[PROGRESSION] Rewards applied to ${heroName}: ${messages.join(', ')}`;
};

export const formatEncounterPenaltyLog = (heroName, messages = []) => {
  if (!messages.length) return null;
  return `[PROGRESSION] Penalties applied to ${heroName}: ${messages.join(', ')}`;
};

export const planWorldTileEncounterFlow = ({
  randomEncounter,
  targetTile,
  aiNarrativeEnabled,
  pendingNarrativeTile
}) => {
  if (!randomEncounter) {
    return {
      flowType: 'none',
      shouldResetMoves: false,
      shouldIncrementMoves: true,
      openActionEncounter: false
    };
  }

  const delayMs = targetTile?.poi ? 800 : 0;

  if (randomEncounter.encounterTier === 'immediate') {
    return {
      flowType: 'immediate',
      shouldResetMoves: true,
      shouldIncrementMoves: false,
      openActionEncounter: true,
      delayMs,
      pendingNarrativeTile
    };
  }

  if (randomEncounter.encounterTier === 'narrative') {
    if (!aiNarrativeEnabled) {
      return {
        flowType: 'narrative_fallback_modal',
        shouldResetMoves: true,
        shouldIncrementMoves: false,
        openActionEncounter: true,
        delayMs
      };
    }

    return {
      flowType: 'narrative_context',
      shouldResetMoves: true,
      shouldIncrementMoves: false,
      openActionEncounter: false,
      narrativeEncounter: {
        type: 'narrative_encounter',
        encounter: randomEncounter,
        hook: randomEncounter.narrativeHook,
        aiContext: randomEncounter.aiContext
      }
    };
  }

  return {
    flowType: 'unknown',
    shouldResetMoves: false,
    shouldIncrementMoves: true,
    openActionEncounter: false
  };
};
