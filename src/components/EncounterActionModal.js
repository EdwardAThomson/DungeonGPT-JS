import React, { useState, useContext, useEffect } from 'react';
import { resolveEncounter } from '../utils/encounterResolver';
import { createMultiRoundEncounter, resolveRound, getRoundActions, generateEncounterSummary } from '../utils/multiRoundEncounter';
import { applyDamage, getHPStatus } from '../utils/healthSystem';
import SettingsContext from '../contexts/SettingsContext';

const EncounterActionModal = ({ isOpen, onClose, encounter, character, onResolve, onCharacterUpdate }) => {
  const { settings } = useContext(SettingsContext);
  const [selectedAction, setSelectedAction] = useState(null);
  const [isResolving, setIsResolving] = useState(false);
  const [result, setResult] = useState(null);
  
  // Track character state locally to show HP changes
  const [currentCharacter, setCurrentCharacter] = useState(character);
  
  // Multi-round state
  const [isMultiRound, setIsMultiRound] = useState(false);
  const [roundState, setRoundState] = useState(null);
  const [roundResults, setRoundResults] = useState([]);
  const [currentRoundResult, setCurrentRoundResult] = useState(null);
  
  // Sync character state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentCharacter(character);
    }
  }, [isOpen, character]);
  
  // Initialize multi-round state ONLY when modal first opens with a new encounter
  useEffect(() => {
    if (isOpen && encounter && encounter.multiRound) {
      setIsMultiRound(true);
      setRoundState(createMultiRoundEncounter(encounter, character, settings));
    } else {
      setIsMultiRound(false);
      setRoundState(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, encounter]);

  if (!isOpen || !encounter) return null;

  const handleAction = async (action) => {
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
        const outcome = await resolveEncounter(encounter, action.label, currentCharacter, settings);
        
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
      console.error('[ENCOUNTER] Resolution failed:', error);
      setResult({
        narration: 'An error occurred while resolving the encounter.',
        rollResult: null,
        outcomeTier: 'failure',
        rewards: null,
        penalties: ['Encounter resolution failed']
      });
    } finally {
      setIsResolving(false);
    }
  };
  
  const handleNextRound = () => {
    setCurrentRoundResult(null);
    setSelectedAction(null);
  };

  const handleContinue = () => {
    if (onResolve) {
      onResolve(result);
    }
    // Reset all state
    setSelectedAction(null);
    setResult(null);
    setIsMultiRound(false);
    setRoundState(null);
    setRoundResults([]);
    setCurrentRoundResult(null);
    onClose();
  };
  
  // Check if character is defeated
  const isDefeated = currentCharacter.currentHP <= 0;

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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content encounter-action-modal" onClick={(e) => e.stopPropagation()}>
        {isDefeated && result ? (
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
            
            <button className="primary-button" onClick={handleContinue} style={{ background: '#e74c3c' }}>
              Retreat to Safety
            </button>
          </>
        ) : !result ? (
          <>
            <div className="encounter-header">
              <span className="encounter-icon">{encounter.icon}</span>
              <h2>{encounter.name}</h2>
              {isMultiRound && roundState && (
                <div className="round-indicator">
                  Round {roundState.currentRound} of {roundState.maxRounds}
                </div>
              )}
              
              {/* Player HP Bar */}
              {currentCharacter.maxHP && (
                <div className="encounter-hp-bar">
                  <div className="hp-label">
                    <span>{currentCharacter.characterName}</span>
                    <span style={{ color: getHPStatus(currentCharacter.currentHP, currentCharacter.maxHP).color }}>
                      {currentCharacter.currentHP} / {currentCharacter.maxHP} HP
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
                    <span style={{ color: roundState.enemyCurrentHP <= roundState.enemyMaxHP * 0.3 ? '#e74c3c' : '#f39c12' }}>
                      {roundState.enemyCurrentHP} / {roundState.enemyMaxHP} HP
                    </span>
                  </div>
                  <div className="hp-bar-container">
                    <div 
                      className="hp-bar-fill" 
                      style={{ 
                        width: `${(roundState.enemyCurrentHP / roundState.enemyMaxHP) * 100}%`,
                        background: roundState.enemyCurrentHP <= roundState.enemyMaxHP * 0.3 ? '#e74c3c' : '#f39c12'
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
                  <h3 style={{ color: '#e74c3c', margin: '0 0 10px 0' }}>💀 You are defeated!</h3>
                  <p>You cannot continue fighting in your current condition.</p>
                  <button className="primary-button" onClick={onClose} style={{ background: '#e74c3c', marginTop: '15px' }}>
                    Retreat from Combat
                  </button>
                </div>
              </>
            ) : roundState && roundState.enemyCurrentHP <= 0 && !result ? (
              // Enemy is defeated
              <>
                <div className="victory-banner">
                  <h3 style={{ color: '#27ae60', margin: '0 0 10px 0' }}>⚔️ Victory!</h3>
                  <p>The {encounter.name.toLowerCase()} has been defeated!</p>
                  <button className="primary-button" onClick={async () => {
                    const summary = await generateEncounterSummary(roundState);
                    setResult(summary);
                  }} style={{ background: '#27ae60', marginTop: '15px' }}>
                    Claim Victory
                  </button>
                </div>
              </>
            ) : currentRoundResult ? (
              // Show current round result before continuing
              <>
                <div className={getOutcomeBadgeClass(currentRoundResult.outcomeTier)}>
                  {getOutcomeLabel(currentRoundResult.outcomeTier)}
                </div>
                
                {currentRoundResult.rollResult && (
                  <div className="dice-result">
                    <span className="dice-icon">🎲</span>
                    <span className="roll-total">{currentRoundResult.rollResult.total}</span>
                    <span className="roll-breakdown">
                      (d20: {currentRoundResult.rollResult.naturalRoll} + modifier: {currentRoundResult.rollResult.modifier})
                    </span>
                  </div>
                )}
                
                <div className="ai-narration">
                  {currentRoundResult.narration}
                </div>
                
                <div className="combat-damage-summary">
                  {currentRoundResult.enemyDamage > 0 && (
                    <div className="enemy-damage-section">
                      <h4>⚔️ Damage Dealt</h4>
                      <div className="damage-amount" style={{ color: '#f39c12' }}>{currentRoundResult.enemyDamage} HP</div>
                      <p className="damage-description">You strike the {encounter.name.toLowerCase()}!</p>
                    </div>
                  )}
                  
                  {currentRoundResult.hpDamage > 0 && (
                    <div className="player-damage-section">
                      <h4>🩸 Damage Taken</h4>
                      <div className="damage-amount" style={{ color: '#e74c3c' }}>{currentRoundResult.hpDamage} HP</div>
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

              <div className={getOutcomeBadgeClass(result.outcomeTier)}>
                {getOutcomeLabel(result.outcomeTier)}
              </div>

              {result.rollResult && (
                <div className="dice-result">
                  <span className="dice-icon">🎲</span>
                  <span className="roll-total">{result.rollResult.total}</span>
                  <span className="roll-breakdown">
                    (d20: {result.rollResult.naturalRoll} + modifier: {result.rollResult.modifier})
                  </span>
                </div>
              )}

              {result.roundCount && (
                <div className="round-count-badge">
                  Resolved in {result.roundCount} round{result.roundCount > 1 ? 's' : ''}
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

              {result.penalties && result.penalties.length > 0 && (
                <div className="penalties-section">
                  <h4>⚠️ Consequences</h4>
                  <ul>
                    {result.penalties.map((penalty, idx) => (
                      <li key={idx}>{penalty}</li>
                    ))}
                  </ul>
                </div>
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
    </div>
  );
};

export default EncounterActionModal;
