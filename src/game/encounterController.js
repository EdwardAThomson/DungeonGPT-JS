import { addGold, addItem, ITEM_CATALOG } from '../utils/inventorySystem';
import { awardXP, getLevelUpSummary } from '../utils/progressionSystem';
import { heroUid } from '../utils/partyUtils';

// --- Flee / disengage outcome helpers (pure; shared by Game.js handleEncounterResolve) ---

// A flee/disengage outcome: the party broke away rather than winning or losing. A single-
// round flee sets outcome:'fled' (EncounterActionModal); the multi-round Tactical Retreat
// path sets 'escaped'. Used to reposition the party to their pre-encounter tile AND to skip
// the enemy/mob-defeat path (a fled foe is not defeated).
export const isFleeOutcome = (result) =>
  result?.outcome === 'fled' || result?.outcome === 'escaped';

// A win: victory (enemy dead / routed) or a single-round success. The enemy_defeated
// milestone check and the site-mob defeat gate on this; a flee is deliberately excluded so
// breaking away never counts the foe as slain.
export const isEncounterVictory = (result) =>
  result?.outcome === 'victory' || result?.outcome === 'success';

// The tile to send the party back to on a flee, or null when there is nothing to restore:
// a FAILED flee (never sets 'fled', so the caught party stays put), or a stationary/legacy
// encounter with no captured pre-encounter position. Pure: the caller applies the
// level-appropriate position setter.
export const getFleeReposition = (result, preEncounterPos) =>
  (isFleeOutcome(result) && preEncounterPos) ? preEncounterPos : null;

// Grant-ledger note (SAVE_SYNC_PLAN.md 9.2): the reward/penalty helpers below
// ALSO return the ledger `events` they imply ({ heroId, kind, amount?|key? },
// no source/timestamp: the Game.js call site stamps the source and
// appendLedgerEvents stamps the time). Additive return fields only, so
// existing callers that destructure { hero, messages } are untouched.

const applyEncounterRewards = (hero, rewards) => {
  if (!rewards) {
    return { hero, messages: [], events: [] };
  }

  let updatedHero = { ...hero };
  const messages = [];
  const events = [];
  const heroId = heroUid(hero);
  const pushEvent = (event) => { if (heroId) events.push({ heroId, ...event }); };

  if (rewards.xp > 0) {
    const xpResult = awardXP(updatedHero, rewards.xp);
    updatedHero = xpResult.character;
    messages.push(`+${rewards.xp} XP`);
    pushEvent({ kind: 'xp', amount: rewards.xp });

    if (xpResult.leveledUp) {
      const summary = getLevelUpSummary(xpResult.previousLevel, xpResult.newLevel, updatedHero);
      messages.push(`🎉 LEVEL UP! Now level ${summary.newLevel}!`);
      pushEvent({ kind: 'level', amount: xpResult.newLevel });
    }
  }

  if (rewards.gold > 0) {
    updatedHero = addGold(updatedHero, rewards.gold);
    messages.push(`+${rewards.gold} gold`);
    pushEvent({ kind: 'gold', amount: rewards.gold });
  }

  if (Array.isArray(rewards.items) && rewards.items.length > 0) {
    // The "Found:" line is player-facing (side-quest completions surface it via the
    // reward narrator), so show the catalog display name, not the raw id
    // ("silver_dagger" -> "Silver Dagger"); fall back to the raw value if unknown.
    const displayNames = [];
    for (const itemName of rewards.items) {
      const itemKey = itemName.replace(/ /g, '_').toLowerCase();
      updatedHero = {
        ...updatedHero,
        inventory: addItem(updatedHero.inventory || [], itemKey)
      };
      pushEvent({ kind: 'item', key: itemKey });
      displayNames.push(ITEM_CATALOG[itemKey]?.name || itemName);
    }
    messages.push(`Found: ${displayNames.join(', ')}`);
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

  return { hero: updatedHero, messages, events };
};

const applyEncounterPenalties = (hero, penalties) => {
  if (!penalties || penalties.goldLoss <= 0) {
    return { hero, messages: [], events: [] };
  }

  const updatedHero = { ...hero };
  const currentGold = updatedHero.gold || 0;
  const actualLoss = Math.min(penalties.goldLoss, currentGold);
  updatedHero.gold = Math.max(0, currentGold - actualLoss);

  // Gold losses are ledgered as negative grants so the ledger gold sum keeps
  // tracking real gold (reconciliation raises gold to the sum; without this,
  // a penalty would look like a regression and get "healed" back).
  const heroId = heroUid(hero);
  const events = heroId && actualLoss > 0
    ? [{ heroId, kind: 'gold', amount: -actualLoss }]
    : [];

  return {
    hero: updatedHero,
    messages: [`-${actualLoss} gold (${currentGold} → ${updatedHero.gold})`],
    events
  };
};

export const applyEncounterOutcomeToParty = ({ party, result }) => {
  const heroIndex = result?.heroIndex !== undefined ? result.heroIndex : 0;
  if (!Array.isArray(party) || party.length === 0 || heroIndex >= party.length) {
    return {
      updatedParty: party || [],
      heroIndex,
      rewardMessages: [],
      penaltyMessages: [],
      ledgerEvents: []
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
    penaltyMessages: penaltiesResult.messages,
    ledgerEvents: [...rewardsResult.events, ...penaltiesResult.events]
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
/**
 * Party-wide MILESTONE / QUEST reward distribution (#55): every party member
 * receives the FULL XP amount, not a split. The authored reward values are
 * tuned against the per-hero XP_THRESHOLDS curve (and the progression lint's
 * XP-budget guard compares each world's pot against per-hero thresholds), so
 * splitting would strand everyone but the lead below the validated curve.
 * Gold, items and healing still route through the lead (shared-pool
 * convention), and KO'd heroes are paid too: a campaign step is the whole
 * party's achievement. Combat XP keeps its own split rules in
 * applyTeamEncounterOutcomeToParty above.
 */
export const applyPartyRewardsToAll = ({ party, rewards, leadIndex = 0 }) => {
  if (!Array.isArray(party) || party.length === 0) {
    return { updatedParty: party || [], rewardMessages: [], ledgerEvents: [] };
  }
  const lead = Math.min(Math.max(leadIndex, 0), party.length - 1);
  const rewardMessages = [];
  const ledgerEvents = [];
  const updatedParty = party.map((hero, i) => {
    const slice = i === lead ? rewards : { xp: rewards?.xp || 0 };
    const { hero: updated, messages, events } = applyEncounterRewards({ ...hero }, slice);
    ledgerEvents.push(...events);
    messages.forEach((m) => {
      if (/^\+\d+ XP$/.test(m)) return; // announced once, party-wide, below
      if (m.includes('LEVEL UP')) {
        rewardMessages.push(`${hero.characterName || `Hero ${i + 1}`} ${m}`);
      } else if (i === lead) {
        rewardMessages.push(m);
      }
    });
    return updated;
  });
  if ((rewards?.xp || 0) > 0) {
    rewardMessages.unshift(`+${rewards.xp} XP to each party member`);
  }
  return { updatedParty, rewardMessages, ledgerEvents };
};

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
  const ledgerEvents = [];

  updatedParty = updatedParty.map((hero, idx) => {
    const isLead = idx === heroIndex;
    const heroRewards = {
      ...(isLead ? rewards : {}),
      // Lead keeps the rounding remainder so the pot is fully paid out.
      xp: xpShare + (isLead ? xpRemainder : 0)
    };
    const { hero: updated, messages, events } = applyEncounterRewards(hero, heroRewards);
    ledgerEvents.push(...events);
    const name = hero.heroName || hero.characterName || `Hero ${idx + 1}`;
    messages.forEach((msg) => rewardMessages.push(`${name}: ${msg}`));
    return updated;
  });

  const penaltiesResult = applyEncounterPenalties(updatedParty[heroIndex], result?.penalties);
  updatedParty[heroIndex] = penaltiesResult.hero;
  ledgerEvents.push(...penaltiesResult.events);

  return {
    updatedParty,
    heroIndex,
    rewardMessages,
    penaltyMessages: penaltiesResult.messages,
    ledgerEvents
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

// How many world-map moves a narrative-tier hook stays actionable after it is
// parked (pendingLookEncounter) or offered as chips under a Look-around narration.
// Beyond this the hook expires silently: a cave glint shouldn't be actionable
// ten tiles later (#36).
export const NARRATIVE_HOOK_PERSIST_MOVES = 3;

/**
 * Ages a narrative-tier hook state by one world-map move (#36).
 *
 * Works for both lifecycle phases, which share the optional `hookMoves` counter:
 * - the parked hook (`pendingLookEncounter`, pass `remind: true` so the player
 *   gets one subtle nudge toward the Look-around button on the first move away)
 * - the offered action chips under a Look-around narration (no reminder; the
 *   chips themselves are the visible affordance).
 *
 * Pure: never mutates. Returns `{ hookState, reminderText }` where `hookState`
 * is null once the hook has outlived NARRATIVE_HOOK_PERSIST_MOVES (expired
 * silently) and `reminderText` is a ready-to-append conversation line or null.
 *
 * @param {Object|null} hookState - `{ hook?, encounter?, hookMoves?, ... }`
 * @param {Object} [options]
 * @param {boolean} [options.remind=false] - emit the one-time reminder line
 */
export const ageNarrativeHook = (hookState, { remind = false } = {}) => {
  if (!hookState) {
    return { hookState: null, reminderText: null };
  }

  const hookMoves = (hookState.hookMoves || 0) + 1;
  if (hookMoves > NARRATIVE_HOOK_PERSIST_MOVES) {
    return { hookState: null, reminderText: null }; // expired, clear silently
  }

  const hook = hookState.hook || hookState.encounter?.narrativeHook || null;
  const reminderText = remind && hookMoves === 1 && hook
    ? `*You think back to ${hook}, just a short way behind you. It may be worth a Look around before you press on.*`
    : null;

  return { hookState: { ...hookState, hookMoves }, reminderText };
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
