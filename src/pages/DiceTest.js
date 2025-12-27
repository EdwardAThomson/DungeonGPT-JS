import React, { useState } from 'react';
import DiceRoller from '../components/DiceRoller';
import { SKILLS, SUPPORTED_DICE, calculateModifier } from '../utils/rules';
import { rollDice, rollCheck } from '../utils/dice';

const DiceTest = () => {
    const [isModalOpen, setModalOpen] = useState(false);
    const [testMode, setTestMode] = useState('dice');
    const [preselectedSkill, setPreselectedSkill] = useState(null);
    const [diagnosticsReport, setDiagnosticsReport] = useState(null);

    // Mock Character
    const mockCharacter = {
        characterName: "Test Hero",
        stats: {
            Strength: 16,     // +3
            Dexterity: 14,    // +2
            Constitution: 12, // +1
            Intelligence: 10, // +0
            Wisdom: 8,        // -1
            Charisma: 18      // +4
        }
    };

    const openDice = () => {
        setTestMode('dice');
        setPreselectedSkill(null);
        setModalOpen(true);
    };

    const openSkill = (skill) => {
        setTestMode('skill');
        setPreselectedSkill(skill);
        setModalOpen(true);
    };

    const runDiagnostics = () => {
        const report = {
            dice: [],
            skills: [],
            timestamp: new Date().toLocaleTimeString()
        };

        // 1. Test All Dice Types (100 rolls each)
        SUPPORTED_DICE.forEach(die => {
            let min = Infinity;
            let max = -Infinity;
            let total = 0;
            const rolls = 100;

            for (let i = 0; i < rolls; i++) {
                const result = rollDice(1, die.value);
                const val = result.total;
                if (val < min) min = val;
                if (val > max) max = val;
                total += val;
            }

            const passed = min >= 1 && max <= die.value;
            report.dice.push({
                type: die.label,
                rolls,
                min,
                max,
                avg: (total / rolls).toFixed(2),
                passed
            });
        });

        // 2. Test All Skills (Verify Math)
        Object.keys(SKILLS).forEach(skillName => {
            const statName = SKILLS[skillName];
            const statVal = mockCharacter.stats[statName] || 10;
            const expectedMod = calculateModifier(statVal);

            // Perform a check
            const result = rollCheck(expectedMod);

            // Verify formula
            const mathCorrect = result.total === (result.naturalRoll + expectedMod);

            report.skills.push({
                skill: skillName,
                stat: statName,
                mod: expectedMod,
                natural: result.naturalRoll,
                total: result.total,
                passed: mathCorrect
            });
        });

        setDiagnosticsReport(report);
    };

    return (
        <div className="page-container" style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
            <h1>🎲 Dice Rolling System Diagnostics</h1>

            <section className="test-section" style={{ marginBottom: '30px' }}>
                <h2>Manual Testing</h2>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                    <button className="primary-button" onClick={openDice}>
                        Open Standard Dice Roller
                    </button>
                    <button className="secondary-button" onClick={() => openSkill('Perception')}>
                        Test Perception (Wisdom -1)
                    </button>
                    <button className="secondary-button" onClick={() => openSkill('Athletics')}>
                        Test Athletics (Strength +3)
                    </button>
                </div>
            </section>

            <section className="test-section" style={{ borderTop: '2px solid #333', paddingTop: '20px' }}>
                <h2>Automated Diagnostics</h2>
                <button
                    onClick={runDiagnostics}
                    className="primary-button"
                    style={{ backgroundColor: '#4CAF50', marginBottom: '20px' }}
                >
                    ▶ Run Comprehensive System Check
                </button>

                {diagnosticsReport && (
                    <div className="report-container">
                        <h3>Diagnostic Report - {diagnosticsReport.timestamp}</h3>

                        <h4>1. Dice Distribution Test (100 rolls each)</h4>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#2a2a2a', color: 'white', textAlign: 'left' }}>
                                    <th style={{ padding: '8px' }}>Die</th>
                                    <th style={{ padding: '8px' }}>Min (Exp 1)</th>
                                    <th style={{ padding: '8px' }}>Max (Exp Value)</th>
                                    <th style={{ padding: '8px' }}>Avg</th>
                                    <th style={{ padding: '8px' }}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {diagnosticsReport.dice.map(d => (
                                    <tr key={d.type} style={{ borderBottom: '1px solid #444' }}>
                                        <td style={{ padding: '8px' }}>{d.type}</td>
                                        <td style={{ padding: '8px', color: d.min < 1 ? 'red' : 'inherit' }}>{d.min}</td>
                                        <td style={{ padding: '8px' }}>{d.max}</td>
                                        <td style={{ padding: '8px' }}>{d.avg}</td>
                                        <td style={{ padding: '8px', fontWeight: 'bold', color: d.passed ? '#4CAF50' : '#f44336' }}>
                                            {d.passed ? 'PASS' : 'FAIL'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <h4>2. Skill Mod Calculation Verification</h4>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#2a2a2a', color: 'white', textAlign: 'left' }}>
                                    <th style={{ padding: '8px' }}>Skill</th>
                                    <th style={{ padding: '8px' }}>Stat</th>
                                    <th style={{ padding: '8px' }}>Expected Mod</th>
                                    <th style={{ padding: '8px' }}>Nat Roll + Mod = Total</th>
                                    <th style={{ padding: '8px' }}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {diagnosticsReport.skills.map(s => (
                                    <tr key={s.skill} style={{ borderBottom: '1px solid #444' }}>
                                        <td style={{ padding: '8px' }}>{s.skill}</td>
                                        <td style={{ padding: '8px' }}>{s.stat}</td>
                                        <td style={{ padding: '8px' }}>{s.mod >= 0 ? `+${s.mod}` : s.mod}</td>
                                        <td style={{ padding: '8px' }}>{s.natural} {s.mod >= 0 ? '+' : '-'} {Math.abs(s.mod)} = {s.total}</td>
                                        <td style={{ padding: '8px', fontWeight: 'bold', color: s.passed ? '#4CAF50' : '#f44336' }}>
                                            {s.passed ? 'Verified' : 'ERROR'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* The Modal Component */}
            <DiceRoller
                isOpen={isModalOpen}
                onClose={() => setModalOpen(false)}
                initialMode={testMode}
                preselectedSkill={preselectedSkill}
                character={mockCharacter}
                onRollComplete={(result) => console.log('Roll Completed:', result)}
            />
        </div>
    );
};

export default DiceTest;
