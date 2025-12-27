import React, { useState, useEffect } from 'react';
import { rollDice, rollCheck } from '../utils/dice';
import { SKILLS, calculateModifier, SUPPORTED_DICE } from '../utils/rules';

const DiceRoller = ({ isOpen, onClose, initialMode = 'dice', preselectedSkill = null, character = null, onRollComplete }) => {
    const [mode, setMode] = useState(initialMode); // 'dice' or 'skill'
    const [selectedDie, setSelectedDie] = useState(20);
    const [diceCount, setDiceCount] = useState(1);
    const [selectedSkill, setSelectedSkill] = useState(preselectedSkill || 'Perception');
    const [rollResult, setRollResult] = useState(null);

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setMode(initialMode);
            setRollResult(null);
            if (preselectedSkill) {
                setSelectedSkill(preselectedSkill);
                setMode('skill');
            }
        }
    }, [isOpen, initialMode, preselectedSkill]);

    if (!isOpen) return null;

    const handleRollDice = () => {
        const result = rollDice(diceCount, selectedDie);
        setRollResult({ type: 'dice', ...result, dieType: `d${selectedDie}` });
        if (onRollComplete) onRollComplete(result);
    };

    const handleSkillCheck = () => {
        // 1. Get Stat from Skill
        const statName = SKILLS[selectedSkill];
        let modifier = 0;

        // 2. Calculate Modifier from Character
        if (character && character.stats) {
            const statValue = character.stats[statName] || 10;
            modifier = calculateModifier(statValue);
        }

        // 3. Roll
        const result = rollCheck(modifier);
        setRollResult({
            type: 'skill',
            ...result,
            skillName: selectedSkill,
            statName: statName
        });

        if (onRollComplete) onRollComplete(result);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content dice-modal" onClick={e => e.stopPropagation()}>
                <h2>🎲 Dice Roller</h2>

                {/* Mode Toggles */}
                <div className="dice-mode-toggle">
                    <button
                        className={mode === 'dice' ? 'active' : ''}
                        onClick={() => setMode('dice')}
                    >
                        Simple Dice
                    </button>
                    <button
                        className={mode === 'skill' ? 'active' : ''}
                        onClick={() => setMode('skill')}
                    >
                        Skill Check
                    </button>
                </div>

                <div className="dice-controls">
                    {mode === 'dice' && (
                        <>
                            <div className="control-group">
                                <label>Die Type:</label>
                                <select value={selectedDie} onChange={(e) => setSelectedDie(Number(e.target.value))}>
                                    {SUPPORTED_DICE.map(d => (
                                        <option key={d.value} value={d.value}>{d.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="control-group">
                                <label>Count:</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="10"
                                    value={diceCount}
                                    onChange={(e) => setDiceCount(Number(e.target.value))}
                                />
                            </div>
                            <button className="primary-button roll-button" onClick={handleRollDice}>
                                Roll {diceCount}d{selectedDie}
                            </button>
                        </>
                    )}

                    {mode === 'skill' && (
                        <>
                            <div className="control-group">
                                <label>Skill:</label>
                                <select value={selectedSkill} onChange={(e) => setSelectedSkill(e.target.value)}>
                                    {Object.keys(SKILLS).sort().map(skill => (
                                        <option key={skill} value={skill}>{skill} ({SKILLS[skill]})</option>
                                    ))}
                                </select>
                            </div>
                            {character ? (
                                <div className="character-stats-preview">
                                    <small>Rolling as <strong>{character.characterName}</strong></small>
                                    <br />
                                    <small>{SKILLS[selectedSkill]}: {character.stats[SKILLS[selectedSkill]]} ({calculateModifier(character.stats[SKILLS[selectedSkill]]) >= 0 ? '+' : ''}{calculateModifier(character.stats[SKILLS[selectedSkill]])})</small>
                                </div>
                            ) : (
                                <div className="warning-text">No character selected. Rolling with +0.</div>
                            )}
                            <button className="primary-button roll-button" onClick={handleSkillCheck}>
                                Roll {selectedSkill} Check
                            </button>
                        </>
                    )}
                </div>

                {/* Results Display */}
                {rollResult && (
                    <div className="roll-result">
                        {rollResult.type === 'dice' && (
                            <div className="dice-result-display">
                                <span className="roll-value">{rollResult.total}</span>
                                <div className="roll-details">
                                    Results: [{rollResult.results.join(', ')}]
                                </div>
                            </div>
                        )}
                        {rollResult.type === 'skill' && (
                            <div className="skill-result-display">
                                <span className={`roll-value ${rollResult.isCriticalSuccess ? 'crit-success' : ''} ${rollResult.isCriticalFailure ? 'crit-fail' : ''}`}>
                                    {rollResult.total}
                                </span>
                                <div className="roll-details">
                                    Roll: {rollResult.naturalRoll} {rollResult.modifier >= 0 ? '+' : '-'} {Math.abs(rollResult.modifier)}
                                    {rollResult.isCriticalSuccess && <span className="crit-text">CRITICAL SUCCESS!</span>}
                                    {rollResult.isCriticalFailure && <span className="crit-text">CRITICAL FAIL!</span>}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <button className="modal-close-button" onClick={onClose}>Close</button>
            </div>
        </div>
    );
};

export default DiceRoller;
