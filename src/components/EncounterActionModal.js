import React, { useState, useContext, useEffect, useRef } from 'react';
import { resolveEncounter } from '../utils/encounterResolver';
import { createMultiRoundEncounter, resolveRound, getRoundActions, generateEncounterSummary, heroSupportContribution, getSupportBonus } from '../utils/multiRoundEncounter';
import { applyDamage, getHPStatus } from '../utils/healthSystem';
import { consumeHealingItem, isHealingConsumable } from '../utils/inventorySystem';
import { effectiveActionModifier } from '../game/balanceSim';
import SettingsContext from '../contexts/SettingsContext';
import ClickableImage from './ClickableImage';
import { useModal } from '../contexts/ModalContext';
import ModalShell from './ModalShell';
import { createLogger } from '../utils/logger';
import { ITEM_CATALOG } from '../utils/inventorySystem';
import { effectivePartyLevel } from '../game/questEngine';
import { getRelativeThreat } from '../game/threat';

const logger = createLogger('encounter-action-modal');

const EncounterActionModal = ({ party, character, onResolve, onCharacterUpdate, fullSizeImage = false }) => {
  const { isOpen, data, close } = useModal('encounterAction');
  const encounter = data?.encounter;
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

  // Initialize state ONLY when modal opens with a NEW encounter
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
      // Modal closed - clear the ref so next open is fresh
      initializedEncounterRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, encounter]);

  if (!isOpen || !encounter) return null;

  // Early return if no character - prevents crashes during initialization
  if (!currentCharacter && !showHeroSelection) {
    console.warn('[ENCOUNTER] No character available and not in hero selection mode');
    return null;
  }

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
        // wipe as defeat — so the modal just syncs the resulting party state.
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

  // The live combat party: the multi-round team while a boss fight is running,
  // otherwise the passed party (or the lone acting hero for a solo single-round fight).
  const combatParty = isMultiRound && roundState
    ? roundState.party
    : (Array.isArray(party) && party.length > 0 ? party : (currentCharacter ? [currentCharacter] : []));

  const heroUidLocal = (h) => (h && (h.heroId || h.characterId)) || null;

  // Healing consumables available across the (pooled) combat party, aggregated by key.
  const usableConsumables = (() => {
    const map = {};
    combatParty.forEach((h) => (h.inventory || []).forEach((item) => {
      const key = typeof item === 'string' ? item : (item && item.key);
      if (!key || !isHealingConsumable(key)) return;
      const qty = (typeof item === 'object' && item.quantity) ? item.quantity : 1;
      map[key] = (map[key] || 0) + qty;
    }));
    return Object.entries(map).map(([key, quantity]) => ({
      key, quantity, name: ITEM_CATALOG[key]?.name || key
    }));
  })();

  const hasHealableHero = combatParty.some(
    (h) => h && !h.isDefeated && h.currentHP > 0 && h.currentHP < h.maxHP
  );
  const canUseItemInCombat = usableConsumables.length > 0 && hasHealableHero;

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
    // the game state through the modal's existing hero-update path.
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

  // Route a resolved outcome through onResolve, then tear the modal down. EVERY exit that
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
    // Reset all state - the ref will be cleared when modal closes via useEffect
    setSelectedAction(null);
    setResult(null);
    setIsMultiRound(false);
    setRoundState(null);
    setRoundResults([]);
    setCurrentRoundResult(null);
    setShowHeroSelection(true);
    setHeroConfirmed(false);
    setInitiativeResult(null);
    close();
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

  const getOutcomeBadgeClass = (tier) => {
    const classes = {
      'criticalSuccess': 'outcome-badge critical-success',
      'success': 'outcome-badge success',
      'failure': 'outcome-badge failure',
      'criticalFailure': 'outcome-badge critical-failure'
    };
    return classes[tier] || 'outcome-badge';
  };

  const getOutcomeLabel = (tier) => {
    const labels = {
      'criticalSuccess': 'Critical Success!',
      'success': 'Success',
      'failure': 'Failure',
      'criticalFailure': 'Critical Failure!'
    };
    return labels[tier] || tier;
  };

  // Friendly label for the FINAL encounter outcome (victory/defeat/escaped/stalemate/
  // fled), so a draw reads as a titlecased "Stalemate" instead of a raw shouted
  // "STALEMATE". Unknown values fall back to a titlecased form so nothing crashes.
  const getFinalOutcomeLabel = (outcome) => {
    const labels = {
      'victory': 'Victory',
      'defeat': 'Defeat',
      'escaped': 'Escaped',
      'fled': 'Fled',
      'stalemate': 'Stalemate'
    };
    return labels[outcome] || (outcome ? outcome.charAt(0).toUpperCase() + outcome.slice(1) : outcome);
  };

  // Relative-threat chip: SAME helper/colors as the site-mob ring, so a fight's danger
  // reads consistently on both surfaces. Covers ALL encounters (world POI, town, site),
  // derived from the encounter's difficulty vs the party's current level. Renders
  // nothing when difficulty is unknown (legacy encounters), never crashes.
  const encounterThreat = getRelativeThreat(encounter.difficulty, effectivePartyLevel(party));
  const renderThreatBadge = () => encounterThreat && (
    <span
      className="encounter-threat-badge"
      style={{
        display: 'inline-block', padding: '2px 10px', borderRadius: '10px',
        fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px',
        color: encounterThreat.color, border: `1px solid ${encounterThreat.color}`,
        background: 'rgba(20,18,24,0.35)', textTransform: 'uppercase',
      }}
      title={`This fight is rated ${encounterThreat.label} for your party's current level`}
    >
      Threat: {encounterThreat.label}
    </span>
  );

  // Get available actions (base or contextual for multi-round)
  const availableActions = isMultiRound && roundState && !currentRoundResult
    ? getRoundActions(roundState)
    : encounter.suggestedActions;

  // Enemy Morale + Your Advantage read-out. Shown both at the START of the fight
  // (round 0 / before the first action) and inside each round result, so the player
  // sees the computed STARTING lean (usually near zero, sometimes +/-) rather than
  // first meeting it already reflecting a lost round 1.
  const renderCombatStatus = () => roundState && (
    <div className="combat-status">
      <div className="status-bar">
        <div className="status-label">Enemy Morale</div>
        <div className="status-bar-container">
          <div
            className="status-bar-fill morale"
            style={{ width: `${Math.max(0, roundState.enemyMorale)}%` }}
          />
        </div>
        <span className="status-value">{Math.max(0, roundState.enemyMorale)}%</span>
      </div>
      <div className="status-bar">
        <div className="status-label">Your Advantage</div>
        <div className="advantage-indicator">
          {roundState.playerAdvantage > 0 ? '+' : ''}{roundState.playerAdvantage}
        </div>
      </div>
    </div>
  );

  // Helper to ensure profile picture path is correct (legacy data support)
  const getProfilePicture = (path) => {
    if (!path) return '';
    if (path.startsWith('/assets/characters/')) return path;

    // Extract filename and replace extension with .webp
    const filename = path.split('/').pop().split('.')[0];
    return `/assets/characters/${filename}.webp`;
  };

  return (
    <ModalShell modalId="encounterAction" className="encounter-action-modal" ariaLabel="Encounter" usePortal style={{ maxWidth: '800px', width: '95%', padding: '20px 24px' }}>
        {showHeroSelection && !heroConfirmed && party && party.length > 1 ? (
          // Hero selection phase
          <>
            <h2 style={{ marginBottom: '2px', paddingBottom: '6px' }}>⚔️ {encounter.name}</h2>
            <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--state-muted-strong)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '8px' }}>
              Random Encounter
            </div>
            {encounterThreat && (
              <div style={{ textAlign: 'center', marginBottom: '8px' }}>{renderThreatBadge()}</div>
            )}
            {encounter.image && (
              <ClickableImage
                src={encounter.image}
                alt={encounter.name}
                height={fullSizeImage ? '360px' : '240px'}
                maxHeight={fullSizeImage ? '360px' : '240px'}
                objectPosition={fullSizeImage ? 'center 60%' : 'center 30%'}
              />
            )}
            <div className="encounter-description" style={{ marginBottom: '10px', fontSize: '14px' }}>
              <p style={{ marginBottom: '0' }}>{encounter.description}</p>
            </div>

            <div className="hero-selection-section" style={{ marginTop: '10px' }}>
              <h3 style={{ marginBottom: '8px' }}>Choose Your Lead</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '10px' }}>
                {encounter.multiRound
                  ? 'The lead acts and rolls each round; everyone else supports, adding their bonus to the roll. If the lead falls, the healthiest hero steps in. (15% chance initiative fails)'
                  : 'Select hero to lead. (15% chance initiative fails)'}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {party.map((hero, idx) => {
                  const defeated = hero.currentHP <= 0 || hero.isDefeated;
                  const heroSupport = encounter.multiRound && !defeated
                    ? heroSupportContribution(hero)
                    : 0;
                  return (
                  <div
                    key={idx}
                    onClick={defeated ? undefined : () => setSelectedHeroIndex(idx)}
                    style={{
                      padding: '10px 15px',
                      border: selectedHeroIndex === idx ? '2px solid var(--primary)' : '1px solid var(--border)',
                      borderRadius: '8px',
                      cursor: defeated ? 'not-allowed' : 'pointer',
                      background: selectedHeroIndex === idx ? 'var(--primary-tint-10)' : 'var(--surface)',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      ...(defeated ? { opacity: 0.4, filter: 'grayscale(70%)' } : {})
                    }}
                  >
                    {hero.profilePicture && (
                      <img
                        src={getProfilePicture(hero.profilePicture)}
                        alt={hero.heroName || hero.characterName}
                        loading="lazy"
                        width="44"
                        height="44"
                        style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '50%',
                          objectFit: 'cover',
                          border: defeated ? '2px solid var(--border)' : '2px solid var(--primary)'
                        }}
                      />
                    )}
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '15px' }}>{hero.heroName || hero.characterName || 'Unknown'}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {defeated ? '💀 Defeated' : (hero.heroClass || hero.characterClass || '')}
                        </div>
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'right' }}>
                        <div>HP: {Math.floor(hero.currentHP)}/{hero.maxHP} | Lvl {hero.level || hero.heroLevel || hero.characterLevel || 1}</div>
                        {heroSupport > 0 && selectedHeroIndex !== idx && (
                          <div style={{ fontSize: '12px', color: 'var(--state-success-strong)' }}>
                            Supports: +{heroSupport} to the lead's roll
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>

              <button
                onClick={() => handleHeroConfirm()}
                disabled={selectedHeroIndex == null}
                style={{
                  marginTop: '20px',
                  padding: '12px 24px',
                  fontSize: '16px',
                  width: '100%'
                }}
                className="primary-button"
              >
                Confirm Hero
              </button>
            </div>

            <button className="modal-close-button" onClick={handleFleeBeforeCombat}>
              Flee Encounter
            </button>
          </>
        ) : isDefeated && result ? (
          // Defeat state
          <>
            <div className="defeat-header">
              <span className="defeat-icon">💀</span>
              <h2>Defeated!</h2>
            </div>

            <div className="defeat-message">
              <p>Your wounds have overcome you. You collapse, unable to continue the fight.</p>
              <p style={{ marginTop: '15px', fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                You need rest and healing before you can face more dangers.
              </p>
            </div>

            <div className="defeat-consequences">
              <h4>⚠️ Consequences of Defeat</h4>
              <ul>
                <li>Cannot engage in combat encounters</li>
                <li>Must find a safe place to rest</li>
                <li>Need healing or medical attention</li>
              </ul>
            </div>

            <button className="primary-button" onClick={handleContinue}>
              Retreat to Safety
            </button>
          </>
        ) : !result ? (
          <>
            <div className="encounter-header">
              <h2 style={{ marginBottom: '2px' }}>{encounter.name}</h2>
              <div style={{ fontSize: '11px', color: 'var(--state-muted-strong)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>
                Random Encounter
              </div>
              {encounterThreat && (
                <div style={{ marginBottom: '8px' }}>{renderThreatBadge()}</div>
              )}
              {encounter.image && !result && (
                <ClickableImage
                  src={encounter.image}
                  alt={encounter.name}
                  height={fullSizeImage ? '300px' : '200px'}
                  maxHeight={fullSizeImage ? '300px' : '200px'}
                  objectPosition={fullSizeImage ? 'center 60%' : 'center 30%'}
                />
              )}
              {!encounter.image && <span className="encounter-icon">{encounter.icon}</span>}
              {isMultiRound && roundState && (
                <div className="round-indicator">
                  Round {roundState.currentRound} of {roundState.maxRounds}
                </div>
              )}

              {/* Initiative result notification */}
              {initiativeResult && initiativeResult.message && (
                <div style={{
                  padding: '10px',
                  margin: '10px 0',
                  background: '#ff9800',
                  color: '#000',
                  borderRadius: '4px',
                  fontWeight: 'bold',
                  textAlign: 'center'
                }}>
                  {initiativeResult.message}
                </div>
              )}

              {/* Player HP Bar */}
              {currentCharacter && currentCharacter.maxHP && (
                <div className="encounter-hp-bar">
                  <div className="hp-label">
                    <span>
                      {currentCharacter.heroName || currentCharacter.characterName}
                      {(currentCharacter.heroClass || currentCharacter.characterClass) && (
                        <span style={{ marginLeft: '8px', color: 'var(--text-secondary)', fontSize: '0.9em' }}>
                          Level {currentCharacter.level || currentCharacter.heroLevel || currentCharacter.characterLevel || 1} {currentCharacter.heroClass || currentCharacter.characterClass}
                        </span>
                      )}
                    </span>
                    <span style={{ color: getHPStatus(currentCharacter.currentHP, currentCharacter.maxHP).color }}>
                      HP: {currentCharacter.currentHP}/{currentCharacter.maxHP}
                    </span>
                  </div>
                  <div className="hp-bar-container">
                    <div
                      className="hp-bar-fill"
                      style={{
                        width: `${(currentCharacter.currentHP / currentCharacter.maxHP) * 100}%`,
                        background: getHPStatus(currentCharacter.currentHP, currentCharacter.maxHP).color
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Party support strip (#43 Lead + Support) */}
              {isMultiRound && roundState && roundState.isTeamEncounter && (
                <div className="encounter-party-strip" style={{
                  display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center',
                  margin: '6px 0', fontSize: '12px'
                }}>
                  {roundState.party.map((hero, idx) => {
                    if (idx === roundState.leadIndex) return null;
                    const down = hero.currentHP <= 0 || hero.isDefeated;
                    return (
                      <span key={idx} style={{
                        padding: '2px 8px', borderRadius: '10px',
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        opacity: down ? 0.5 : 1
                      }}>
                        {hero.heroName || hero.characterName}{' '}
                        {down
                          ? '💀 down'
                          : <>({Math.floor(hero.currentHP)}/{hero.maxHP} HP) supports +{heroSupportContribution(hero)}</>}
                      </span>
                    );
                  })}
                  {roundState.supportBonus > 0 && (
                    <span style={{ color: 'var(--state-success-strong)', fontWeight: 'bold' }}>
                      Party support: +{roundState.supportBonus} to every roll
                    </span>
                  )}
                </div>
              )}

              {/* Enemy HP Bar */}
              {isMultiRound && roundState && roundState.enemyMaxHP && (
                <div className="encounter-hp-bar enemy-hp-bar">
                  <div className="hp-label">
                    <span>{encounter.name}</span>
                    <span style={{ color: roundState.enemyCurrentHP <= roundState.enemyMaxHP * 0.3 ? 'var(--state-danger)' : 'var(--state-warning)' }}>
                      {roundState.enemyCurrentHP} / {roundState.enemyMaxHP} HP
                    </span>
                  </div>
                  <div className="hp-bar-container">
                    <div
                      className="hp-bar-fill"
                      style={{
                        width: `${(roundState.enemyCurrentHP / roundState.enemyMaxHP) * 100}%`,
                        background: roundState.enemyCurrentHP <= roundState.enemyMaxHP * 0.3 ? 'var(--state-danger)' : 'var(--state-warning)'
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {isDefeated && !result ? (
              // Character is defeated mid-encounter
              <>
                <div className="defeat-warning">
                  <h3 style={{ color: 'var(--state-danger)', margin: '0 0 10px 0' }}>💀 You are defeated!</h3>
                  <p>You cannot continue fighting in your current condition.</p>
                  <button className="primary-button" onClick={handleRetreatDefeated} style={{ marginTop: '15px' }}>
                    Retreat from Combat
                  </button>
                </div>
              </>
            ) : roundState && roundState.enemyCurrentHP <= 0 && !result ? (
              // Enemy is defeated
              <>
                <div className="victory-banner">
                  <h3 style={{ color: 'var(--state-success-strong)', margin: '0 0 10px 0' }}>⚔️ Victory!</h3>
                  <p>The {encounter.name.toLowerCase()} has been defeated!</p>
                  <button className="primary-button" onClick={async () => {
                    const summary = await generateEncounterSummary(roundState);
                    setResult(summary);
                  }} style={{ marginTop: '15px' }}>
                    Claim Victory
                  </button>
                </div>
              </>
            ) : currentRoundResult ? (
              // Show current round result before continuing
              <>
                {currentRoundResult.rollResult && (
                  <div className="dice-result">
                    <span className="dice-icon">🎲</span>
                    <span className="roll-total">{currentRoundResult.rollResult.total}</span>
                    <span className="roll-breakdown">
                      (d20: {currentRoundResult.rollResult.naturalRoll}
                      {' + modifier: '}{currentRoundResult.rollResult.modifier - (currentRoundResult.supportBonus || 0)}
                      {currentRoundResult.supportBonus > 0 && <> + support: {currentRoundResult.supportBonus}</>})
                    </span>
                    <span className={getOutcomeBadgeClass(currentRoundResult.outcomeTier)} style={{ marginLeft: 'auto', marginBottom: '0' }}>
                      {getOutcomeLabel(currentRoundResult.outcomeTier)}
                    </span>
                  </div>
                )}

                {currentRoundResult.leadSwap && (
                  <div style={{
                    padding: '10px', margin: '10px 0', background: 'var(--state-warning)',
                    color: '#000', borderRadius: '4px', fontWeight: 'bold', textAlign: 'center'
                  }}>
                    💀 {currentRoundResult.leadSwap.downedHero} is down! {currentRoundResult.leadSwap.newLead} takes the lead!
                  </div>
                )}

                {!currentRoundResult.rollResult && (
                  <div className={getOutcomeBadgeClass(currentRoundResult.outcomeTier)}>
                    {getOutcomeLabel(currentRoundResult.outcomeTier)}
                  </div>
                )}

                <div className="ai-narration">
                  {currentRoundResult.narration}
                </div>

                <div className="combat-damage-summary">
                  {currentRoundResult.enemyDamage > 0 && (
                    <div className="enemy-damage-section">
                      <h4>⚔️ Damage Dealt</h4>
                      <div className="damage-amount" style={{ color: 'var(--state-warning)' }}>{currentRoundResult.enemyDamage} HP</div>
                      <p className="damage-description">You strike the {encounter.name.toLowerCase()}!</p>
                    </div>
                  )}

                  {currentRoundResult.hpDamage > 0 && (
                    <div className="player-damage-section">
                      <h4>🩸 Damage Taken</h4>
                      <div className="damage-amount" style={{ color: 'var(--state-danger)' }}>{currentRoundResult.hpDamage} HP</div>
                      <p className="damage-description">The {encounter.name.toLowerCase()} strikes back!</p>
                      {(currentRoundResult.partyDamage || []).some((d) => d.role === 'support') && (
                        <p className="damage-description">
                          The blow splashes into the party:{' '}
                          {currentRoundResult.partyDamage
                            .filter((d) => d.role === 'support')
                            .map((d) => `${roundState.party[d.heroIndex]?.heroName || roundState.party[d.heroIndex]?.characterName || 'ally'} -${d.amount} HP`)
                            .join(', ')}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {renderCombatStatus()}

                <div className="round-action-buttons">
                  <button className="primary-button fight-button" onClick={() => {
                    handleNextRound();
                    const fightAction = encounter.suggestedActions.find(a => a.label === 'Fight');
                    if (fightAction) {
                      setTimeout(() => handleAction(fightAction), 50);
                    }
                  }}>
                    ⚔️ Fight!
                  </button>
                  <button className="secondary-button" onClick={handleNextRound}>
                    Choose Action →
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="encounter-description">{encounter.description}</p>

                {/* In-combat item-use result banner (persists until the next action/round). */}
                {itemUseResult && (
                  <div style={{
                    padding: '10px 14px',
                    margin: '10px 0',
                    background: 'rgba(39, 174, 96, 0.12)',
                    border: '1px solid #27ae60',
                    borderRadius: '6px',
                    textAlign: 'center'
                  }}>
                    <span>
                      {itemUseResult.itemName} restored{' '}
                      <strong style={{ color: '#27ae60' }}>{itemUseResult.healed} HP</strong>{' '}
                      to {itemUseResult.heroName} (rolled {itemUseResult.rolled}).
                    </span>
                    {itemUseResult.spentRound && (
                      <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        Tending wounds spent the party's action this round.
                      </span>
                    )}
                  </div>
                )}

                {isMultiRound && renderCombatStatus()}

                {roundResults.length > 0 && (
                  <div className="round-history">
                    <h4>Previous Rounds:</h4>
                    {roundResults.map((r, idx) => (
                      <div key={idx} className="round-summary">
                        <strong>Round {r.round}:</strong> {r.result.outcomeTier}
                      </div>
                    ))}
                  </div>
                )}

                <div className="encounter-actions">
                  <h3>What do you do?</h3>
                  <div className="action-buttons">
                    {availableActions.map((action) => (
                      <button
                        key={action.label}
                        className="action-button"
                        onClick={() => handleAction(action)}
                        disabled={isResolving}
                      >
                        <div className="action-header">
                          <strong>{action.label}</strong>
                          {action.skill && (
                            <span className="action-skill">({action.skill})</span>
                          )}
                        </div>
                        <p className="action-description">{action.description}</p>
                      </button>
                    ))}
                  </div>

                  {/* Flee button: the single flee affordance for BOTH single-round and
                      multi-round encounters. Single-round fights previously offered no flee
                      at all (only fight actions). Both route through handleFleeEncounter, so
                      a successful flee sets outcome:'fled' and disengages via onResolve. */}
                  {/* Use a healing consumable mid-fight. In a multi-round fight this
                      spends the round (the heal is the party's action, no attack); a
                      single-round fight just heals + consumes the item. Shown only when
                      the party carries a usable consumable AND someone can be healed. */}
                  {canUseItemInCombat && (
                    <button
                      className="secondary-button"
                      onClick={() => { setPendingItemKey(null); setShowItemPicker(true); }}
                      disabled={isResolving}
                      style={{ marginTop: '12px', width: '100%' }}
                    >
                      🎒 Use Item{isMultiRound ? ' (uses your action this round)' : ''}
                    </button>
                  )}

                  {(!isMultiRound || (roundState && !roundState.isResolved)) && (
                    <button
                      className="secondary-button"
                      onClick={handleFleeEncounter}
                      disabled={isResolving}
                      style={{
                        marginTop: '15px',
                        width: '100%'
                      }}
                    >
                      🏃 Attempt to Flee (70% success, risks damage/gold loss)
                    </button>
                  )}
                </div>
              </>
            )}

            {isResolving && (
              <div className="resolving-indicator">
                <div className="spinner"></div>
                <p>Resolving encounter...</p>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="encounter-result">
              <div className="result-header">
                {/* Show the real encounter art (as a small thumbnail) in the result view too,
                    not just the intro. The emoji icon is only a fallback for encounters that
                    have no image, so an encounter like Earthquake (which has earthquake.webp)
                    no longer drops to its emoji once the outcome is shown. */}
                {encounter.image ? (
                  <img
                    src={encounter.image}
                    alt={encounter.name}
                    style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }}
                  />
                ) : (
                  <span className="encounter-icon">{encounter.icon}</span>
                )}
                <h2>{encounter.name}</h2>
              </div>

              {result.rollResult && (
                <div className="dice-result">
                  <span className="dice-icon">🎲</span>
                  <span className="roll-total">{result.rollResult.total}</span>
                  <span className="roll-breakdown">
                    (d20: {result.rollResult.naturalRoll}
                    {' + modifier: '}{result.rollResult.modifier - (result.supportBonus || 0)}
                    {result.supportBonus > 0 && <> + support: {result.supportBonus}</>})
                  </span>
                  <span className={getOutcomeBadgeClass(result.outcomeTier)} style={{ marginLeft: 'auto', marginBottom: '0' }}>
                    {getOutcomeLabel(result.outcomeTier)}
                  </span>
                </div>
              )}

              {!result.rollResult && (
                <div className={getOutcomeBadgeClass(result.outcomeTier)}>
                  {getOutcomeLabel(result.outcomeTier)}
                </div>
              )}

              <div className="ai-narration" style={{ whiteSpace: 'pre-line' }}>
                {result.narration}
              </div>

              {result.outcome && (
                <div className="outcome-summary">
                  <strong>Final Outcome:</strong> {getFinalOutcomeLabel(result.outcome)}
                </div>
              )}

              {/* Make a loss legible: on a defeat or stalemate, say WHY the fight did not
                  end in victory (the enemy was still standing) rather than leaving a bare
                  "DEFEAT" badge. Only shown for combats that tracked enemy HP. */}
              {(result.outcome === 'defeat' || result.outcome === 'stalemate') &&
                result.enemyMaxHP > 0 && (
                <div className="outcome-reason" style={{ marginTop: '6px', opacity: 0.85, fontSize: '0.92em' }}>
                  {result.outcome === 'defeat'
                    ? `Your momentum broke before you could finish it. ${encounter.name} still held the field (${result.enemyCurrentHP}/${result.enemyMaxHP} HP).`
                    : `Neither side could force the end. ${encounter.name} was still standing (${result.enemyCurrentHP}/${result.enemyMaxHP} HP). No spoils, but you keep your gear.`}
                </div>
              )}

              {result.hpDamage > 0 && (
                <div className="hp-damage-section">
                  <h4>💔 Health Impact</h4>
                  <div className="damage-amount">-{result.hpDamage} HP</div>
                  {result.damageDescription && (
                    <p className="damage-description">{result.damageDescription}</p>
                  )}
                </div>
              )}

              {result.rewards && (
                <div className="rewards-section">
                  <h4>⭐ Rewards</h4>
                  <ul>
                    {result.rewards.xp > 0 && <li>+{result.rewards.xp} XP</li>}
                    {result.rewards.gold > 0 && <li>+{result.rewards.gold} gold</li>}
                    {result.rewards.items && result.rewards.items.map((item, idx) => (
                      <li key={idx}>{ITEM_CATALOG[item]?.name || item.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.penalties && (
                (() => {
                  // Handle both array and object formats for penalties
                  const penaltyMessages = Array.isArray(result.penalties)
                    ? result.penalties
                    : (result.penalties.messages || []);
                  return penaltyMessages.length > 0 ? (
                    <div className="penalties-section">
                      <h4>⚠️ Consequences</h4>
                      <ul>
                        {penaltyMessages.map((penalty, idx) => (
                          <li key={idx}>{penalty}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null;
                })()
              )}

              {result.affectedFactions && (
                <div className="faction-changes">
                  <h4>📜 Reputation Changes</h4>
                  <ul>
                    {Object.entries(result.affectedFactions).map(([faction, change]) => (
                      <li key={faction}>
                        {faction}: {change > 0 ? '+' : ''}{change}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <button className="primary-button" onClick={handleContinue}>
              Continue Journey
            </button>
          </>
        )}

        {/* In-combat item picker: a FIXED, centered overlay above the encounter modal
            (always on screen). Two steps: choose a healing consumable, then a target hero
            (full-HP / defeated heroes disabled). Reuses the shared consumeHealingItem path. */}
        {showItemPicker && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Use an item"
            onClick={() => { setShowItemPicker(false); setPendingItemKey(null); }}
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 4000,
              padding: '20px'
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: '380px',
                maxHeight: '80vh',
                overflowY: 'auto',
                padding: '20px',
                background: 'var(--surface)',
                border: '1px solid #27ae60',
                borderRadius: '10px',
                boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
              }}
            >
              {!pendingItemKey ? (
                <>
                  <h3 style={{ margin: '0 0 12px 0', color: '#27ae60' }}>Use which item?</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {usableConsumables.map((it) => (
                      <button
                        key={it.key}
                        className="secondary-button"
                        onClick={() => setPendingItemKey(it.key)}
                        style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}
                      >
                        <span>{it.name}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>x{it.quantity}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <h3 style={{ margin: '0 0 12px 0', color: '#27ae60' }}>
                    Use {ITEM_CATALOG[pendingItemKey]?.name || 'item'} on...
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {combatParty.map((hero, idx) => {
                      const defeated = hero.isDefeated || hero.currentHP <= 0;
                      const atFull = hero.currentHP >= hero.maxHP;
                      const disabled = defeated || atFull;
                      const hpStatus = getHPStatus(hero.currentHP, hero.maxHP);
                      return (
                        <button
                          key={heroUidLocal(hero) || idx}
                          onClick={() => { if (!disabled) handleUseItemInCombat(pendingItemKey, idx); }}
                          disabled={disabled}
                          title={defeated ? 'Defeated' : (atFull ? 'Already at full health' : `Heal ${hero.heroName || hero.characterName}`)}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '10px 14px',
                            background: 'rgba(0,0,0,0.2)',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            color: 'var(--text)',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            opacity: disabled ? 0.5 : 1
                          }}
                        >
                          <span style={{ fontWeight: 'bold' }}>{hero.heroName || hero.characterName || 'Unknown'}</span>
                          <span style={{ color: hpStatus.color, fontSize: '0.85rem' }}>
                            {Math.floor(hero.currentHP)} / {hero.maxHP} HP
                            {defeated ? ' · Defeated' : (atFull ? ' · Already at full health' : '')}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    className="secondary-button"
                    onClick={() => setPendingItemKey(null)}
                    style={{ marginTop: '10px', width: '100%' }}
                  >
                    ← Back
                  </button>
                </>
              )}
              <button
                onClick={() => { setShowItemPicker(false); setPendingItemKey(null); }}
                style={{
                  marginTop: '10px',
                  padding: '8px 14px',
                  width: '100%',
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
    </ModalShell>
  );
};

export default EncounterActionModal;
