import { useState, useContext, useEffect, useRef } from 'react';
import { resolveEncounter } from '../utils/encounterResolver';
import { createMultiRoundEncounter, resolveRound, getRoundActions, generateEncounterSummary, getSupportBonus, applyItemDamageRound } from '../utils/multiRoundEncounter';
import { applyDamage } from '../utils/healthSystem';
import { consumeHealingItem, isConsumable, consumeSpellItem, ITEM_CATALOG } from '../utils/inventorySystem';
import { effectiveActionModifier } from '../game/balanceSim';
import SettingsContext from '../contexts/SettingsContext';
import { createLogger } from '../utils/logger';
import { effectivePartyLevel } from '../game/questEngine';
import { getRelativeThreat } from '../game/threat';

const logger = createLogger('use-encounter-fight');

// Headless fight-flow controller (#79 keystone, COMBAT_UX_PLAN.md §4). Owns the
// encounter phase machine (formation → initiative → action → resolving → roundResult →
// final) that previously lived as ~15 useState hooks inside EncounterActionModal.
// Presentation-free: the modal (or any future inline "open play" surface) renders the
// state this hook exposes and calls its handlers. Engine semantics live in
// encounterResolver/multiRoundEncounter and are untouched; this hook is ONLY the
// orchestration that used to be trapped in the component.
//
// Contract notes preserved from the modal (do not change casually):
// - Every fight exit MUST flush through resolveAndClose so onResolve always fires; a
//   bypassing close() left the map closed (reopenMapAfterEncounterRef stuck) and
//   skipped the reward/penalty + reposition flush.
// - Init is keyed by encounter identity (name+description) so mid-fight character
//   updates never reset a running fight; the key clears on close.
const useEncounterFight = ({
  isOpen,
  encounter,
  party,
  character,
  onResolve,
  onCharacterUpdate,
  onClose
}) => {
  const { settings, selectedProvider, selectedModel } = useContext(SettingsContext);
  const [selectedAction, setSelectedAction] = useState(null);
  const [isResolving, setIsResolving] = useState(false);
  const [result, setResult] = useState(null);

  // Hero selection state
  const [selectedHeroIndex, setSelectedHeroIndex] = useState(null);
  const [initiativeResult, setInitiativeResult] = useState(null);
  const [showHeroSelection, setShowHeroSelection] = useState(true);
  const [heroConfirmed, setHeroConfirmed] = useState(false);

  // Track which encounter we've initialized for (prevents re-init on character updates)
  const initializedEncounterRef = useRef(null);

  // Track character state locally to show HP changes
  const [currentCharacter, setCurrentCharacter] = useState(character);

  // Multi-round state
  const [isMultiRound, setIsMultiRound] = useState(false);
  const [roundState, setRoundState] = useState(null);
  const [roundResults, setRoundResults] = useState([]);
  const [currentRoundResult, setCurrentRoundResult] = useState(null);

  // In-combat item use (#: heal a hero mid-fight). `pendingItemKey` drives the
  // two-step picker (pick item -> pick target); `itemUseResult` is the transient
  // "restored N HP" banner shown until the next action/round.
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [pendingItemKey, setPendingItemKey] = useState(null);
  const [itemUseResult, setItemUseResult] = useState(null);

  // Suggest the hero with the highest effective modifier for this encounter as
  // the default lead (Phase 5 auto-assignment; the player can override).
  const suggestLeadIndex = (heroes, enc) => {
    if (!Array.isArray(heroes) || heroes.length === 0) return 0;
    let best = 0;
    let bestMod = -Infinity;
    heroes.forEach((hero, idx) => {
      if (hero.currentHP <= 0 || hero.isDefeated) return;
      const mod = Math.max(
        ...(enc.suggestedActions || [])
          .filter((a) => a.skill)
          .map((a) => effectiveActionModifier(a, hero, enc)),
        -Infinity
      );
      if (mod > bestMod) {
        bestMod = mod;
        best = idx;
      }
    });
    return best;
  };

  // Initialize state ONLY when the fight surface opens with a NEW encounter
  useEffect(() => {
    if (isOpen && encounter) {
      // Check if this is a new encounter (different from what we initialized)
      const encounterId = encounter.name + encounter.description;
      if (initializedEncounterRef.current !== encounterId) {
        // New encounter - reset everything
        initializedEncounterRef.current = encounterId;
        setCurrentCharacter(character);
        setSelectedHeroIndex(party && party.length > 1 ? suggestLeadIndex(party, encounter) : 0);
        setInitiativeResult(null);
        setResult(null);
        setSelectedAction(null);
        setRoundResults([]);
        setCurrentRoundResult(null);
        setShowItemPicker(false);
        setPendingItemKey(null);
        setItemUseResult(null);

        // Determine if we need hero selection
        const needsHeroSelection = party && party.length > 1;
        setShowHeroSelection(needsHeroSelection);
        setHeroConfirmed(!needsHeroSelection);

        // For single hero, initialize multi-round state immediately
        if (!needsHeroSelection && encounter.multiRound) {
          setIsMultiRound(true);
          setRoundState(
            createMultiRoundEncounter(encounter, character, settings, {
              provider: selectedProvider,
              model: selectedModel
            }, party && party.length > 0 ? party : [character])
          );
        } else if (!needsHeroSelection) {
          setIsMultiRound(false);
          setRoundState(null);
        } else {
          // Multi-hero: wait for lead selection (Formation phase) before initializing
          setIsMultiRound(false);
          setRoundState(null);
        }
      }
    } else if (!isOpen) {
      // Fight surface closed - clear the ref so next open is fresh
      initializedEncounterRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, encounter]);

  const handleHeroConfirm = () => {
    // Roll initiative check (15% chance of failure)
    const initiativeRoll = Math.random();
    const initiativeFailed = initiativeRoll < 0.15;

    let actualHeroIndex = selectedHeroIndex;
    let message = null;

    if (initiativeFailed && party && party.length > 1) {
      // Random hero is forced to act instead (exclude defeated heroes)
      const availableIndices = party.map((_, idx) => idx).filter(idx =>
        idx !== selectedHeroIndex && !(party[idx].currentHP <= 0 || party[idx].isDefeated)
      );
      if (availableIndices.length === 0) {
        // No other living heroes — initiative failure has no effect
        actualHeroIndex = selectedHeroIndex;
      } else {
        actualHeroIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
      }
      const forcedHero = party[actualHeroIndex];
      message = `⚡ Initiative failed! ${forcedHero.heroName || forcedHero.characterName} is forced to act instead!`;
    }

    setInitiativeResult({
      success: !initiativeFailed,
      actualHeroIndex,
      message
    });

    // Update current character to the one who will actually act
    const actingHero = party ? party[actualHeroIndex] : character;
    setCurrentCharacter(actingHero);

    // Mark hero as confirmed and hide selection
    setHeroConfirmed(true);
    setShowHeroSelection(false);

    // Initialize multi-round state if needed. #43: the WHOLE party enters the
    // fight (Phase 5 Lead + Support) — the acting hero leads, the rest support.
    if (encounter.multiRound) {
      setIsMultiRound(true);
      setRoundState(
        createMultiRoundEncounter(encounter, actingHero, settings, {
          provider: selectedProvider,
          model: selectedModel
        }, party && party.length > 0 ? party : [actingHero])
      );
    }
  };

  const handleAction = async (action) => {
    if (!currentCharacter) {
      console.error('[ENCOUNTER] Cannot perform action - no current character');
      return;
    }

    // 'Tactical Retreat' is a disengage, not a combat check. Route it to the working
    // flee handler (70% success + reposition via outcome:'fled') so it never reaches
    // resolveEncounter (where a non-suggestedActions label used to throw). The dedicated
    // "Attempt to Flee" button is the primary flee affordance; this guard just keeps any
    // stray Tactical Retreat action coherent with it.
    if (action?.label === 'Tactical Retreat') {
      handleFleeEncounter();
      return;
    }

    setSelectedAction(action);
    setItemUseResult(null);
    setIsResolving(true);

    try {
      if (isMultiRound && roundState) {
        // Multi-round resolution. #43: resolveRound owns ALL combat bookkeeping —
        // it applies incoming damage to the party (lead + crit-fail splash),
        // auto-swaps a KO'd lead to the highest-HP living hero, and resolves a
        // wipe as defeat — so the caller just syncs the resulting party state.
        const { roundResult, updatedState } = await resolveRound(roundState, action.label);

        // Push every damaged hero's new HP up to the game state
        if (roundResult.partyDamage && onCharacterUpdate) {
          roundResult.partyDamage.forEach(({ heroIndex }) => {
            onCharacterUpdate(updatedState.party[heroIndex]);
          });
        }
        // The displayed character follows the (possibly auto-swapped) lead
        setCurrentCharacter(updatedState.party[updatedState.leadIndex]);

        setCurrentRoundResult(roundResult);
        // Store the round number from the history that was just added
        const completedRound = updatedState.roundHistory[updatedState.roundHistory.length - 1];
        setRoundResults(prev => [...prev, { round: completedRound.round, result: roundResult }]);
        setRoundState(updatedState);

        // Check if encounter is resolved
        if (updatedState.isResolved) {
          const summary = await generateEncounterSummary(updatedState);
          setResult(summary);
        }
      } else {
        // Single-round resolution
        const outcome = await resolveEncounter(
          encounter,
          action.label,
          currentCharacter,
          settings,
          { provider: selectedProvider, model: selectedModel }
        );

        // Apply HP damage if any
        if (outcome.hpDamage > 0) {
          const updatedChar = applyDamage(currentCharacter, outcome.hpDamage);
          setCurrentCharacter(updatedChar);
          if (onCharacterUpdate) {
            onCharacterUpdate(updatedChar);
          }
        }

        setResult(outcome);
      }
    } catch (error) {
      logger.error('[ENCOUNTER] Resolution failed:', error);
      logger.error('[ENCOUNTER] Error details:', {
        message: error.message,
        stack: error.stack,
        encounter: encounter?.name,
        action: action?.label,
        character: currentCharacter?.characterName
      });
      setResult({
        narration: `An error occurred while resolving the encounter: ${error.message || 'Unknown error'}`,
        rollResult: null,
        outcomeTier: 'failure',
        rewards: null,
        penalties: {
          messages: ['Encounter resolution failed'],
          goldLoss: 0,
          itemsLost: []
        }
      });
    } finally {
      setIsResolving(false);
    }
  };

  const handleNextRound = () => {
    setCurrentRoundResult(null);
    setSelectedAction(null);
    setItemUseResult(null);
    // Don't reset hero selection - keep the same hero through all rounds
  };

  // "Fight!" fast path on the round-result card: advance the round AND immediately
  // re-run the Fight action. The 50ms defer is load-bearing: it lets the round-clear
  // state land before the next resolution starts (behavior preserved from the modal).
  const handleFightAgain = () => {
    handleNextRound();
    const fightAction = encounter.suggestedActions.find(a => a.label === 'Fight');
    if (fightAction) {
      setTimeout(() => handleAction(fightAction), 50);
    }
  };

  // "Claim Victory" on the enemy-dead banner: summarize the CURRENT round state.
  const handleClaimVictory = async () => {
    const summary = await generateEncounterSummary(roundState);
    setResult(summary);
  };

  // The live combat party: the multi-round team while a boss fight is running,
  // otherwise the passed party (or the lone acting hero for a solo single-round fight).
  const combatParty = isMultiRound && roundState
    ? roundState.party
    : (Array.isArray(party) && party.length > 0 ? party : (currentCharacter ? [currentCharacter] : []));

  const heroUidLocal = (h) => (h && (h.heroId || h.characterId)) || null;

  // A live, unresolved multi-round fight with an enemy HP pool: the ONLY context in which
  // an offensive spell scroll may be used (single-round encounters have no enemy HP pool,
  // so they never offer scrolls).
  const isMultiRoundLive = isMultiRound && !!roundState && !roundState.isResolved;
  const hasHealableHero = combatParty.some(
    (h) => h && !h.isDefeated && h.currentHP > 0 && h.currentHP < h.maxHP
  );
  const hasLiveEnemy = isMultiRoundLive && roundState.enemyCurrentHP > 0;

  // Consumables available across the (pooled) combat party, aggregated by key. Heals show
  // whenever a hero can be healed; offensive spell scrolls show ONLY in a live multi-round
  // fight with an enemy HP pool (the combat-only guard). isConsumable covers both families.
  const usableConsumables = (() => {
    const map = {};
    combatParty.forEach((h) => (h.inventory || []).forEach((item) => {
      const key = typeof item === 'string' ? item : (item && item.key);
      if (!key || !isConsumable(key)) return;
      const effect = ITEM_CATALOG[key]?.effect;
      // Combat-only gate: a damage scroll only appears when there is a live enemy to hit.
      if (effect === 'spell' && !hasLiveEnemy) return;
      // A heal only appears when someone can actually be healed.
      if (effect === 'heal' && !hasHealableHero) return;
      const qty = (typeof item === 'object' && item.quantity) ? item.quantity : 1;
      map[key] = (map[key] || 0) + qty;
    }));
    return Object.entries(map).map(([key, quantity]) => ({
      key, quantity, name: ITEM_CATALOG[key]?.name || key, effect: ITEM_CATALOG[key]?.effect
    }));
  })();

  const canUseItemInCombat = usableConsumables.length > 0;

  // Use one healing consumable on a chosen hero DURING the fight. Reuses the SHARED
  // consumeHealingItem path (identical roll/heal/decrement/pooled-owner handling as the
  // Party inventory picker). In a multi-round fight this SPENDS THE ROUND (the party's
  // action for the round is the heal, so no attack and no enemy-HP progress that turn);
  // a single-round encounter has no round to advance, so it just heals + consumes.
  const handleUseItemInCombat = (itemKey, targetIndex) => {
    const target = combatParty[targetIndex];
    if (!target) { setShowItemPicker(false); setPendingItemKey(null); return; }
    // Owner may differ from target (pooled party inventory); consumeHealingItem removes the
    // stack from the owner and heals the target.
    const owner = combatParty.find((h) =>
      (h.inventory || []).some((i) => (typeof i === 'string' ? i : i && i.key) === itemKey)
    ) || target;

    const res = consumeHealingItem(itemKey, target, owner);
    if (!res.ok) { setShowItemPicker(false); setPendingItemKey(null); return; }

    // Persist the healed target (and, if pooled, the owner whose stack shrank) up to
    // the game state through the existing hero-update path.
    if (onCharacterUpdate) {
      onCharacterUpdate(res.healedTarget);
      if (!res.sameOwner) onCharacterUpdate(res.updatedOwner);
    }

    if (isMultiRound && roundState) {
      // Reflect the heal into the live team, then advance the round: using an item is
      // the round's action (Lead + Support get no attack this turn).
      const newParty = roundState.party.map((h) => {
        if (heroUidLocal(h) === heroUidLocal(res.healedTarget)) return res.healedTarget;
        if (!res.sameOwner && heroUidLocal(h) === heroUidLocal(res.updatedOwner)) return res.updatedOwner;
        return h;
      });
      const nextRound = roundState.currentRound + 1;
      const advanced = {
        ...roundState,
        party: newParty,
        character: newParty[roundState.leadIndex],
        currentRound: nextRound,
        supportBonus: getSupportBonus(newParty, roundState.leadIndex),
        roundHistory: [
          ...roundState.roundHistory,
          {
            round: roundState.currentRound,
            action: `Use ${res.itemName}`,
            leadIndex: roundState.leadIndex,
            result: { outcomeTier: 'itemUse', narration: `Used ${res.itemName}.` }
          }
        ]
      };
      // Spending a round can run the fight past its cap -> resolve as a timeout.
      if (nextRound > advanced.maxRounds) {
        const bloodied = advanced.enemyCurrentHP <= advanced.enemyMaxHP * 0.25;
        advanced.isResolved = true;
        advanced.outcome = (advanced.playerAdvantage > 0 && bloodied) ? 'victory' : 'stalemate';
      }
      setRoundState(advanced);
      setCurrentCharacter(newParty[advanced.leadIndex]);
      setRoundResults((prev) => [...prev, { round: roundState.currentRound, result: { outcomeTier: `Used ${res.itemName}` } }]);
      if (advanced.isResolved) {
        generateEncounterSummary(advanced).then(setResult);
      }
    } else {
      // Single-round / solo fight: no round to spend; sync the acting hero if healed.
      if (currentCharacter && heroUidLocal(currentCharacter) === heroUidLocal(res.healedTarget)) {
        setCurrentCharacter(res.healedTarget);
      }
    }

    setItemUseResult({
      heroName: target.heroName || target.characterName || target.name,
      itemName: res.itemName,
      healed: res.actualHeal,
      rolled: res.rolled,
      spentRound: !!(isMultiRound && roundState)
    });
    setShowItemPicker(false);
    setPendingItemKey(null);
  };

  // Fire an offensive spell scroll (e.g. Fire Scroll) at the ENEMY during a multi-round
  // fight. Unlike the heal branch there is no target hero: the scroll's damage lands on
  // the enemy HP pool via applyItemDamageRound, which also SPENDS THE ROUND (the scroll is
  // the party's action this turn) and resolves victory / timeout. Scrolls are gated to a
  // live multi-round fight, so this path never runs in a single-round encounter.
  const handleUseSpellItemInCombat = (itemKey) => {
    if (!isMultiRound || !roundState || roundState.isResolved) {
      setShowItemPicker(false); setPendingItemKey(null); return;
    }
    // Owner: any hero in the (pooled) combat party carrying the scroll.
    const owner = combatParty.find((h) =>
      (h.inventory || []).some((i) => (typeof i === 'string' ? i : i && i.key) === itemKey)
    );
    if (!owner) { setShowItemPicker(false); setPendingItemKey(null); return; }

    const res = consumeSpellItem(itemKey, owner);
    if (!res.ok) { setShowItemPicker(false); setPendingItemKey(null); return; }

    // Persist the owner's shrunk stack up to game state.
    if (onCharacterUpdate) onCharacterUpdate(res.updatedOwner);

    // Reflect the consumed scroll into the live team, then apply the blast to the enemy
    // and advance the round (the scroll is this turn's action; no attack, no d20).
    const newParty = roundState.party.map((h) =>
      heroUidLocal(h) === heroUidLocal(res.updatedOwner) ? res.updatedOwner : h
    );
    const withParty = {
      ...roundState,
      party: newParty,
      character: newParty[roundState.leadIndex],
      supportBonus: getSupportBonus(newParty, roundState.leadIndex)
    };
    const advanced = applyItemDamageRound(withParty, res.rolled);

    setRoundState(advanced);
    setCurrentCharacter(advanced.party[advanced.leadIndex]);
    setRoundResults((prev) => [...prev, {
      round: roundState.currentRound,
      result: { outcomeTier: `${res.itemName} sears the enemy for ${res.rolled}` }
    }]);
    if (advanced.isResolved) {
      generateEncounterSummary(advanced).then(setResult);
    }

    setItemUseResult({
      itemName: res.itemName,
      damage: res.rolled,
      isSpell: true,
      spentRound: true
    });
    setShowItemPicker(false);
    setPendingItemKey(null);
  };

  const handleFleeEncounter = () => {
    if (!currentCharacter) {
      console.error('[ENCOUNTER] Cannot flee - no current character');
      return;
    }

    // Fleeing from combat has consequences
    const fleeRoll = Math.random();
    const fleeSuccess = fleeRoll > 0.3; // 70% chance to flee successfully

    if (fleeSuccess) {
      setResult({
        narration: `${currentCharacter.heroName || currentCharacter.characterName} successfully breaks away from combat and flees to safety.`,
        rollResult: null,
        outcomeTier: 'success',
        // `outcome: 'fled'` is the signal handleEncounterResolve (Game.js) branches on to
        // DISENGAGE: it repositions the party back to the pre-encounter tile and skips the
        // enemy/mob-defeat path (a fled foe is not defeated). outcomeTier stays 'success'
        // for the badge. A FAILED flee (below) deliberately omits this: the party was
        // caught, so it neither disengages nor repositions.
        outcome: 'fled',
        rewards: null,
        penalties: {
          messages: ['Fled from combat'],
          goldLoss: 0,
          itemsLost: []
        }
      });
    } else {
      // Failed flee - take damage and lose gold
      const fleeDamage = Math.floor(currentCharacter.maxHP * 0.15); // 15% max HP damage
      const goldLoss = Math.floor(Math.random() * 10) + 5; // 5-15 gold

      const updatedChar = applyDamage(currentCharacter, fleeDamage);
      setCurrentCharacter(updatedChar);
      if (onCharacterUpdate) {
        onCharacterUpdate(updatedChar);
      }

      setResult({
        narration: `${currentCharacter.heroName || currentCharacter.characterName} attempts to flee but is caught! They take ${fleeDamage} damage escaping.`,
        rollResult: null,
        outcomeTier: 'failure',
        rewards: null,
        penalties: {
          messages: ['Failed to flee cleanly', `Took ${fleeDamage} damage`, `Lost ${goldLoss} gold in the chaos`],
          goldLoss: goldLoss,
          itemsLost: []
        },
        hpDamage: fleeDamage
      });
    }
  };

  // Route a resolved outcome through onResolve, then tear the fight down. EVERY exit that
  // ends an encounter (Continue Journey, pre-combat flee, retreat-when-defeated) goes
  // through here so NONE of them bypass onResolve; a bypassing close() left the map closed
  // (reopenMapAfterEncounterRef stuck) and skipped the reward/penalty + reposition flush.
  const resolveAndClose = (finalResult) => {
    if (onResolve && finalResult) {
      // Include which hero led. Team summaries (#43) carry leadIndex /
      // isTeamEncounter / supporterCount from generateEncounterSummary; the final
      // lead may differ from the picked one after a KO auto-swap.
      const leadHeroIndex = finalResult?.isTeamEncounter
        ? finalResult.leadIndex
        : (initiativeResult ? initiativeResult.actualHeroIndex : (party ? selectedHeroIndex : 0));
      onResolve({ ...finalResult, heroIndex: leadHeroIndex });
    }
    // Reset all state - the ref will be cleared when the fight surface closes
    setSelectedAction(null);
    setResult(null);
    setIsMultiRound(false);
    setRoundState(null);
    setRoundResults([]);
    setCurrentRoundResult(null);
    setShowHeroSelection(true);
    setHeroConfirmed(false);
    setInitiativeResult(null);
    if (onClose) onClose();
  };

  const handleContinue = () => resolveAndClose(result);

  // Pre-combat flee (from the hero-selection / formation phase): the fight has not
  // started, so this is a clean guaranteed disengage. outcome:'fled' makes Game.js
  // reposition the party back to the pre-encounter tile and reopen the map.
  const handleFleeBeforeCombat = () => {
    const name = currentCharacter?.heroName || currentCharacter?.characterName || 'The party';
    resolveAndClose({
      narration: `${name} slips away before the fight begins, disengaging without a scratch.`,
      rollResult: null,
      outcomeTier: 'success',
      outcome: 'fled',
      rewards: null,
      penalties: null
    });
  };

  // Retreat when defeated mid-fight: the party lost, so this is NOT a clean flee (no
  // 'fled' reposition), but it must still flush through onResolve so the map reopens and
  // any live-applied damage is preserved. HP damage was already applied during the fight.
  const handleRetreatDefeated = () => {
    resolveAndClose({
      narration: `Too wounded to continue, the party breaks off and retreats from the ${encounter.name.toLowerCase()}.`,
      rollResult: null,
      outcomeTier: 'failure',
      rewards: null,
      penalties: null
    });
  };

  // Check if character is defeated
  const isDefeated = currentCharacter ? currentCharacter.currentHP <= 0 : false;

  // Relative-threat chip data: SAME helper/colors as the site-mob ring, so a fight's
  // danger reads consistently on both surfaces. Derived from the encounter's difficulty
  // vs the party's current level. Null when difficulty is unknown (legacy encounters).
  const encounterThreat = encounter
    ? getRelativeThreat(encounter.difficulty, effectivePartyLevel(party))
    : null;

  // Get available actions (base or contextual for multi-round)
  const availableActions = isMultiRound && roundState && !currentRoundResult
    ? getRoundActions(roundState)
    : encounter?.suggestedActions;

  return {
    // phase / result state
    selectedAction,
    isResolving,
    result,
    selectedHeroIndex,
    setSelectedHeroIndex,
    initiativeResult,
    showHeroSelection,
    heroConfirmed,
    currentCharacter,
    isMultiRound,
    roundState,
    roundResults,
    currentRoundResult,
    // item picker state
    showItemPicker,
    setShowItemPicker,
    pendingItemKey,
    setPendingItemKey,
    itemUseResult,
    // derived
    combatParty,
    usableConsumables,
    canUseItemInCombat,
    isMultiRoundLive,
    isDefeated,
    encounterThreat,
    availableActions,
    // handlers
    handleHeroConfirm,
    handleAction,
    handleNextRound,
    handleFightAgain,
    handleClaimVictory,
    handleUseItemInCombat,
    handleUseSpellItemInCombat,
    handleFleeEncounter,
    handleFleeBeforeCombat,
    handleRetreatDefeated,
    handleContinue
  };
};

export default useEncounterFight;
