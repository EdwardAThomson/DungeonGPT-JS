import React, { useState, useContext, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { resolveEncounter } from '../utils/encounterResolver';
import { createMultiRoundEncounter, resolveRound, getRoundActions, generateEncounterSummary } from '../utils/multiRoundEncounter';
import { applyDamage, getHPStatus } from '../utils/healthSystem';
import SettingsContext from '../contexts/SettingsContext';
import { createLogger } from '../utils/logger';

const logger = createLogger('encounter-action-modal');

const EncounterActionModal = ({ isOpen, onClose, encounter, character, party, onResolve, onCharacterUpdate, fullSizeImage = false }) => {
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

  // Initialize state ONLY when modal opens with a NEW encounter
  useEffect(() => {
    if (isOpen && encounter) {
      // Check if this is a new encounter (different from what we initialized)
      const encounterId = encounter.name + encounter.description;
      if (initializedEncounterRef.current !== encounterId) {
        // New encounter - reset everything
        initializedEncounterRef.current = encounterId;
        setCurrentCharacter(character);
        setSelectedHeroIndex(0);
        setInitiativeResult(null);
        setResult(null);
        setSelectedAction(null);
        setRoundResults([]);
        setCurrentRoundResult(null);

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
            })
          );
        } else if (!needsHeroSelection) {
          setIsMultiRound(false);
          setRoundState(null);
        } else {
          // Multi-hero: wait for hero selection before initializing
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
      // Random hero is forced to act instead
      const availableIndices = party.map((_, idx) => idx).filter(idx => idx !== selectedHeroIndex);
      actualHeroIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
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

    // Initialize multi-round state if needed
    if (encounter.multiRound) {
      setIsMultiRound(true);
      setRoundState(
        createMultiRoundEncounter(encounter, actingHero, settings, {
          provider: selectedProvider,
          model: selectedModel
        })
      );
    }
  };

  const handleAction = async (action) => {
    if (!currentCharacter) {
      console.error('[ENCOUNTER] Cannot perform action - no current character');
      return;
    }

    setSelectedAction(action);
    setIsResolving(true);

    try {
      if (isMultiRound && roundState) {
        // Multi-round resolution
        const { roundResult, updatedState } = await resolveRound(roundState, action.label);

        // Apply HP damage if any
        if (roundResult.hpDamage > 0) {
          const updatedChar = applyDamage(currentCharacter, roundResult.hpDamage);
          setCurrentCharacter(updatedChar);
          if (onCharacterUpdate) {
            onCharacterUpdate(updatedChar);
          }
        }

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
    // Don't reset hero selection - keep the same hero through all rounds
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

  const handleContinue = () => {
    if (onResolve) {
      // Include which hero actually participated
      const resultWithHero = {
        ...result,
        heroIndex: initiativeResult ? initiativeResult.actualHeroIndex : (party ? selectedHeroIndex : 0)
      };
      onResolve(resultWithHero);
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
    onClose();
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

  // Get available actions (base or contextual for multi-round)
  const availableActions = isMultiRound && roundState && !currentRoundResult
    ? getRoundActions(roundState)
    : encounter.suggestedActions;

  // Helper to ensure profile picture path is correct (legacy data support)
  const getProfilePicture = (path) => {
    if (!path) return '';
    if (path.startsWith('/assets/characters/')) return path;

    // Extract filename and replace extension with .webp
    const filename = path.split('/').pop().split('.')[0];
    return `/assets/characters/${filename}.webp`;
  };

  return createPortal(
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content encounter-action-modal" style={{ maxWidth: '800px', width: '95%', padding: '20px 24px' }}>
        {showHeroSelection && !heroConfirmed && party && party.length > 1 ? (
          // Hero selection phase
          <>
            <h2 style={{ marginBottom: '2px', paddingBottom: '6px' }}>⚔️ {encounter.name}</h2>
            <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--state-muted-strong)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '8px' }}>
              Random Encounter
            </div>
            {encounter.image && (
              <div style={{
                width: '100%',
                height: fullSizeImage ? 'auto' : '240px',
                maxHeight: fullSizeImage ? '500px' : '240px',
                marginBottom: '10px',
                borderRadius: '8px',
                overflow: 'hidden',
                border: '2px solid var(--border)'
              }}>
                <img
                  src={encounter.image}
                  alt={encounter.name}
                  style={{
                    width: '100%',
                    height: fullSizeImage ? 'auto' : '100%',
                    objectFit: fullSizeImage ? 'contain' : 'cover',
                    objectPosition: fullSizeImage ? 'center' : 'center 30%',
                    display: 'block'
                  }}
                />
              </div>
            )}
            <div className="encounter-description" style={{ marginBottom: '10px', fontSize: '14px' }}>
              <p style={{ marginBottom: '0' }}>{encounter.description}</p>
            </div>

            <div className="hero-selection-section" style={{ marginTop: '10px' }}>
              <h3 style={{ marginBottom: '8px' }}>Choose Your Champion</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '10px' }}>
                Select hero to lead. (15% chance initiative fails)
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {party.map((hero, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedHeroIndex(idx)}
                    style={{
                      padding: '10px 15px',
                      border: selectedHeroIndex === idx ? '2px solid var(--primary)' : '1px solid var(--border)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: selectedHeroIndex === idx ? 'var(--primary-tint-10)' : 'var(--surface)',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px'
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
                          border: '2px solid var(--primary)'
                        }}
                      />
                    )}
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '15px' }}>{hero.heroName || hero.characterName || 'Unknown'}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {hero.heroClass || hero.characterClass || ''}
                        </div>
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        HP: {Math.floor(hero.currentHP)}/{hero.maxHP} | Lvl {hero.level || hero.heroLevel || hero.characterLevel || 1}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => handleHeroConfirm()}
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

            <button className="modal-close-button" onClick={() => onClose()}>
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
              {encounter.image && !result && (
                <div style={{
                  width: '100%',
                  height: fullSizeImage ? 'auto' : '200px',
                  maxHeight: fullSizeImage ? '400px' : '200px',
                  marginBottom: '10px',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  border: '2px solid var(--border)'
                }}>
                  <img
                    src={encounter.image}
                    alt={encounter.name}
                    style={{
                      width: '100%',
                      height: fullSizeImage ? 'auto' : '100%',
                      objectFit: fullSizeImage ? 'contain' : 'cover',
                      objectPosition: fullSizeImage ? 'center' : 'center 30%',
                      display: 'block'
                    }}
                  />
                </div>
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
                  <button className="primary-button" onClick={onClose} style={{ marginTop: '15px' }}>
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
                      (d20: {currentRoundResult.rollResult.naturalRoll} + modifier: {currentRoundResult.rollResult.modifier})
                    </span>
                    <span className={getOutcomeBadgeClass(currentRoundResult.outcomeTier)} style={{ marginLeft: 'auto', marginBottom: '0' }}>
                      {getOutcomeLabel(currentRoundResult.outcomeTier)}
                    </span>
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
                    </div>
                  )}
                </div>

                {roundState && (
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
                )}

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

                  {/* Flee button for multi-round encounters */}
                  {isMultiRound && roundState && !roundState.isResolved && (
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
                <span className="encounter-icon">{encounter.icon}</span>
                <h2>{encounter.name}</h2>
              </div>

              {result.rollResult && (
                <div className="dice-result">
                  <span className="dice-icon">🎲</span>
                  <span className="roll-total">{result.rollResult.total}</span>
                  <span className="roll-breakdown">
                    (d20: {result.rollResult.naturalRoll} + modifier: {result.rollResult.modifier})
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
                  <strong>Final Outcome:</strong> {result.outcome.toUpperCase()}
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
                      <li key={idx}>{item}</li>
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
      </div>
    </div>,
    document.body
  );
};

export default EncounterActionModal;
