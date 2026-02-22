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
