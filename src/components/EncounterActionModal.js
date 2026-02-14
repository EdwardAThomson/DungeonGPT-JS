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
  
  // Initialize multi-round state when encounter opens
  useEffect(() => {
    if (isOpen && encounter && encounter.multiRound) {
      setIsMultiRound(true);
      setRoundState(createMultiRoundEncounter(encounter, currentCharacter, settings));
    } else {
      setIsMultiRound(false);
      setRoundState(null);
    }
  }, [isOpen, encounter, currentCharacter, settings]);

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
        setRoundResults(prev => [...prev, { round: roundState.currentRound, result: roundResult }]);
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
              
              {/* HP Bar */}
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
            </div>
            
            {currentRoundResult ? (
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
                
                <button className="primary-button" onClick={handleNextRound}>
                  Continue Fighting →
                </button>
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
