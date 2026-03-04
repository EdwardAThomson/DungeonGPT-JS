import React, { useState } from 'react';
import { encounterTemplates } from '../data/encounters';
import '../styles/encounters.css';

// ─── Mock Data ───────────────────────────────────────────────────────────────

const MOCK_PARTY = [
    {
        characterId: 'hero-1',
        heroName: 'Aelindra Moonwhisper',
        heroClass: 'Ranger',
        level: 5,
        currentHP: 42,
        maxHP: 50,
        profilePicture: '/assets/characters/ranger.webp',
        stats: { strength: 12, dexterity: 18, constitution: 14, intelligence: 10, wisdom: 16, charisma: 10 }
    },
    {
        characterId: 'hero-2',
        heroName: 'Thorin Ironforge',
        heroClass: 'Fighter',
        level: 6,
        currentHP: 55,
        maxHP: 60,
        profilePicture: '/assets/characters/fighter.webp',
        stats: { strength: 18, dexterity: 10, constitution: 16, intelligence: 8, wisdom: 12, charisma: 10 }
    },
    {
        characterId: 'hero-3',
        heroName: 'Lyra Starweave',
        heroClass: 'Mage',
        level: 4,
        currentHP: 28,
        maxHP: 35,
        profilePicture: '/assets/characters/female_wizard.webp',
        stats: { strength: 8, dexterity: 12, constitution: 10, intelligence: 20, wisdom: 14, charisma: 14 }
    }
];

const MOCK_ROUND_RESULT = {
    outcomeTier: 'success',
    narration: 'Your blade finds its mark, slicing through the goblin\'s crude armor. The creature staggers back with a shriek of pain, clutching its wounded side.',
    rollResult: { total: 17, naturalRoll: 14, modifier: 3 },
    hpDamage: 3,
    enemyDamage: 8
};

const MOCK_ROUND_STATE = {
    currentRound: 2,
    maxRounds: 5,
    enemyCurrentHP: 7,
    enemyMaxHP: 15,
    enemyMorale: 45,
    playerAdvantage: 2,
    isResolved: false
};

const MOCK_FINAL_RESULT = {
    outcomeTier: 'success',
    narration: 'With a final decisive blow, you drive the goblins back into the undergrowth. They scatter, leaving behind a trail of dropped weapons and coins.',
    rollResult: { total: 19, naturalRoll: 16, modifier: 3 },
    roundCount: 3,
    outcome: 'victory',
    hpDamage: 8,
    damageDescription: 'Several cuts and bruises from the skirmish.',
    rewards: { xp: 50, gold: 14, items: ['Rusty Dagger', 'Healing Potion'] },
    penalties: null,
    affectedFactions: { 'Merchant Guild': 1, 'Bandit Clans': -1 }
};

// ─── State Tab Definitions ───────────────────────────────────────────────────

const STATES = [
    { id: 'hero-selection', label: '1. Hero Select', icon: '👥' },
    { id: 'action-selection', label: '2. Actions', icon: '⚔️' },
    { id: 'round-result', label: '3. Round Result', icon: '🎲' },
    { id: 'victory', label: '4. Victory', icon: '🏆' },
    { id: 'defeat', label: '5. Defeat', icon: '💀' },
    { id: 'final-result', label: '6. Final Result', icon: '📜' },
];

// ─── Helper ──────────────────────────────────────────────────────────────────

const getProfilePicture = (path) => {
    if (!path) return '';
    if (path.startsWith('/assets/characters/')) return path;
    const filename = path.split('/').pop().split('.')[0];
    return `/assets/characters/${filename}.webp`;
};

const getOutcomeBadgeClass = (tier) => {
    const classes = {
        criticalSuccess: 'outcome-badge critical-success',
        success: 'outcome-badge success',
        failure: 'outcome-badge failure',
        criticalFailure: 'outcome-badge critical-failure'
    };
    return classes[tier] || 'outcome-badge';
};

const getOutcomeLabel = (tier) => {
    const labels = {
        criticalSuccess: 'Critical Success!',
        success: 'Success',
        failure: 'Failure',
        criticalFailure: 'Critical Failure!'
    };
    return labels[tier] || tier;
};

// ─── Component ───────────────────────────────────────────────────────────────

const EncounterModalStates = () => {
    const [activeState, setActiveState] = useState('hero-selection');
    const [selectedHeroIndex, setSelectedHeroIndex] = useState(0);
    const [selectedEncounterKey, setSelectedEncounterKey] = useState('goblin_ambush');
    const [imageHeight, setImageHeight] = useState(240);

    const encounter = {
        ...encounterTemplates[selectedEncounterKey],
        image: encounterTemplates[selectedEncounterKey]?.image || '/assets/encounters/goblin_ambush.webp'
    };

    const currentCharacter = MOCK_PARTY[selectedHeroIndex];

    // ─── Render Each State ───────────────────────────────────────────────────

    const renderHeroSelection = () => (
        <>
            <h2 style={{ marginBottom: '2px', paddingBottom: '6px' }}>⚔️ {encounter.name}</h2>
            <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--state-muted-strong)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '8px' }}>
                Random Encounter
            </div>
            {encounter.image && (
                <div style={{
                    width: '100%',
                    height: `${imageHeight}px`,
                    marginBottom: '10px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    border: '2px solid var(--border)'
                }}>
                    <img src={encounter.image} alt={encounter.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%', display: 'block' }} />
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
                    {MOCK_PARTY.map((hero, idx) => (
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
                                    alt={hero.heroName}
                                    loading="lazy"
                                    width="44" height="44"
                                    style={{
                                        width: '44px', height: '44px',
                                        borderRadius: '50%', objectFit: 'cover',
                                        border: '2px solid var(--primary)'
                                    }}
                                />
                            )}
                            <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ textAlign: 'left' }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '15px' }}>{hero.heroName}</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{hero.heroClass}</div>
                                </div>
                                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                    HP: {hero.currentHP}/{hero.maxHP} | Lvl {hero.level}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <button className="primary-button" style={{ marginTop: '15px', padding: '12px 24px', fontSize: '16px', width: '100%' }}>
                    Confirm Hero
                </button>
            </div>

            <button className="modal-close-button" style={{ marginTop: '10px' }}>
                Flee Encounter
            </button>
        </>
    );

    const renderActionSelection = () => (
        <>
            <div className="encounter-header">
                <h2 style={{ marginBottom: '2px' }}>{encounter.name}</h2>
                <div style={{ fontSize: '11px', color: 'var(--state-muted-strong)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>
                    Random Encounter
                </div>
                {encounter.image && (
                    <div style={{
                        width: '100%',
                        height: `${imageHeight}px`,
                        marginBottom: '10px',
                        borderRadius: '8px', overflow: 'hidden',
                        border: '2px solid var(--border)'
                    }}>
                        <img src={encounter.image} alt={encounter.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%', display: 'block' }} />
                    </div>
                )}
                {!encounter.image && <span className="encounter-icon">{encounter.icon}</span>}

                {/* Player HP Bar */}
                <div className="encounter-hp-bar">
                    <div className="hp-label">
                        <span>
                            {currentCharacter.heroName}
                            <span style={{ marginLeft: '8px', color: 'var(--text-secondary)', fontSize: '0.9em' }}>
                                Level {currentCharacter.level} {currentCharacter.heroClass}
                            </span>
                        </span>
                        <span style={{ color: 'var(--state-success-strong)' }}>
                            HP: {currentCharacter.currentHP}/{currentCharacter.maxHP}
                        </span>
                    </div>
                    <div className="hp-bar-container">
                        <div className="hp-bar-fill" style={{
                            width: `${(currentCharacter.currentHP / currentCharacter.maxHP) * 100}%`,
                            background: 'var(--state-success-strong)'
                        }} />
                    </div>
                </div>

                {/* Enemy HP Bar */}
                <div className="encounter-hp-bar enemy-hp-bar">
                    <div className="hp-label">
                        <span>{encounter.name}</span>
                        <span style={{ color: 'var(--state-warning)' }}>
                            {MOCK_ROUND_STATE.enemyCurrentHP} / {MOCK_ROUND_STATE.enemyMaxHP} HP
                        </span>
                    </div>
                    <div className="hp-bar-container">
                        <div className="hp-bar-fill" style={{
                            width: `${(MOCK_ROUND_STATE.enemyCurrentHP / MOCK_ROUND_STATE.enemyMaxHP) * 100}%`,
                            background: 'var(--state-warning)'
                        }} />
                    </div>
                </div>
            </div>

            <p className="encounter-description">{encounter.description}</p>

            <div className="encounter-actions">
                <h3>What do you do?</h3>
                <div className="action-buttons">
                    {encounter.suggestedActions.map((action) => (
                        <button key={action.label} className="action-button">
                            <div className="action-header">
                                <strong>{action.label}</strong>
                                {action.skill && <span className="action-skill">({action.skill})</span>}
                            </div>
                            <p className="action-description">{action.description}</p>
                        </button>
                    ))}
                </div>

                <button className="secondary-button" style={{
                    marginTop: '15px', width: '100%'
                }}>
                    🏃 Attempt to Flee (70% success, risks damage/gold loss)
                </button>
            </div>
        </>
    );

    const renderRoundResult = () => (
        <>
            <div className="encounter-header">
                <h2 style={{ marginBottom: '2px' }}>{encounter.name}</h2>
                <div style={{ fontSize: '11px', color: 'var(--state-muted-strong)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>
                    Random Encounter
                </div>
                {encounter.image && (
                    <div style={{
                        width: '100%',
                        height: `${imageHeight}px`,
                        marginBottom: '10px',
                        borderRadius: '8px', overflow: 'hidden',
                        border: '2px solid var(--border)'
                    }}>
                        <img src={encounter.image} alt={encounter.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%', display: 'block' }} />
                    </div>
                )}

                <div className="round-indicator">
                    Round {MOCK_ROUND_STATE.currentRound} of {MOCK_ROUND_STATE.maxRounds}
                </div>

                {/* HP Bars */}
                <div className="encounter-hp-bar">
                    <div className="hp-label">
                        <span>{currentCharacter.heroName}</span>
                        <span style={{ color: 'var(--state-success-strong)' }}>
                            HP: {currentCharacter.currentHP - MOCK_ROUND_RESULT.hpDamage}/{currentCharacter.maxHP}
                        </span>
                    </div>
                    <div className="hp-bar-container">
                        <div className="hp-bar-fill" style={{
                            width: `${((currentCharacter.currentHP - MOCK_ROUND_RESULT.hpDamage) / currentCharacter.maxHP) * 100}%`,
                            background: 'var(--state-success-strong)'
                        }} />
                    </div>
                </div>

                <div className="encounter-hp-bar enemy-hp-bar">
                    <div className="hp-label">
                        <span>{encounter.name}</span>
                        <span style={{ color: 'var(--state-warning)' }}>
                            {MOCK_ROUND_STATE.enemyCurrentHP} / {MOCK_ROUND_STATE.enemyMaxHP} HP
                        </span>
                    </div>
                    <div className="hp-bar-container">
                        <div className="hp-bar-fill" style={{
                            width: `${(MOCK_ROUND_STATE.enemyCurrentHP / MOCK_ROUND_STATE.enemyMaxHP) * 100}%`,
                            background: 'var(--state-warning)'
                        }} />
                    </div>
                </div>
            </div>

            <div className="dice-result">
                <span className="dice-icon">🎲</span>
                <span className="roll-total">{MOCK_ROUND_RESULT.rollResult.total}</span>
                <span className="roll-breakdown">
                    (d20: {MOCK_ROUND_RESULT.rollResult.naturalRoll} + modifier: {MOCK_ROUND_RESULT.rollResult.modifier})
                </span>
                <span className={getOutcomeBadgeClass(MOCK_ROUND_RESULT.outcomeTier)} style={{ marginLeft: 'auto', marginBottom: '0' }}>
                    {getOutcomeLabel(MOCK_ROUND_RESULT.outcomeTier)}
                </span>
            </div>

            <div className="ai-narration">{MOCK_ROUND_RESULT.narration}</div>

            <div className="combat-damage-summary">
                {MOCK_ROUND_RESULT.enemyDamage > 0 && (
                    <div className="enemy-damage-section">
                        <h4>⚔️ Damage Dealt</h4>
                        <div className="damage-amount" style={{ color: 'var(--state-warning)' }}>{MOCK_ROUND_RESULT.enemyDamage} HP</div>
                        <p className="damage-description">You strike the {encounter.name.toLowerCase()}!</p>
                    </div>
                )}
                {MOCK_ROUND_RESULT.hpDamage > 0 && (
                    <div className="player-damage-section">
                        <h4>🩸 Damage Taken</h4>
                        <div className="damage-amount" style={{ color: 'var(--state-danger)' }}>{MOCK_ROUND_RESULT.hpDamage} HP</div>
                        <p className="damage-description">The {encounter.name.toLowerCase()} strikes back!</p>
                    </div>
                )}
            </div>

            <div className="round-action-buttons">
                <button className="primary-button fight-button">⚔️ Fight!</button>
                <button className="secondary-button">Choose Action →</button>
            </div>
        </>
    );

    const renderVictory = () => (
        <>
            <div className="encounter-header">
                <h2 style={{ marginBottom: '2px' }}>{encounter.name}</h2>
                {encounter.image && (
                    <div style={{
                        width: '100%',
                        height: `${imageHeight}px`,
                        marginBottom: '10px',
                        borderRadius: '8px', overflow: 'hidden',
                        border: '2px solid var(--border)'
                    }}>
                        <img src={encounter.image} alt={encounter.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%', display: 'block' }} />
                    </div>
                )}
            </div>

            <div className="victory-banner">
                <h3 style={{ color: 'var(--state-success-strong)', margin: '0 0 10px 0' }}>⚔️ Victory!</h3>
                <p>The {encounter.name.toLowerCase()} has been defeated!</p>
                <button className="primary-button" style={{ marginTop: '15px' }}>
                    Claim Victory
                </button>
            </div>
        </>
    );

    const renderDefeat = () => (
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

            <button className="primary-button" style={{ width: '100%' }}>
                Retreat to Safety
            </button>
        </>
    );

    const renderFinalResult = () => (
        <>
            <div className="encounter-result">
                <div className="result-header">
                    <span className="encounter-icon">{encounter.icon}</span>
                    <h2>{encounter.name}</h2>
                </div>

                <div className="dice-result">
                    <span className="dice-icon">🎲</span>
                    <span className="roll-total">{MOCK_FINAL_RESULT.rollResult.total}</span>
                    <span className="roll-breakdown">
                        (d20: {MOCK_FINAL_RESULT.rollResult.naturalRoll} + modifier: {MOCK_FINAL_RESULT.rollResult.modifier})
                    </span>
                    <span className={getOutcomeBadgeClass(MOCK_FINAL_RESULT.outcomeTier)} style={{ marginLeft: 'auto', marginBottom: '0' }}>
                        {getOutcomeLabel(MOCK_FINAL_RESULT.outcomeTier)}
                    </span>
                </div>

                <div className="ai-narration" style={{ whiteSpace: 'pre-line' }}>
                    {MOCK_FINAL_RESULT.narration}
                </div>

                <div className="outcome-summary">
                    <strong>Final Outcome:</strong> {MOCK_FINAL_RESULT.outcome.toUpperCase()}
                </div>

                {MOCK_FINAL_RESULT.hpDamage > 0 && (
                    <div className="hp-damage-section">
                        <h4>💔 Health Impact</h4>
                        <div className="damage-amount">-{MOCK_FINAL_RESULT.hpDamage} HP</div>
                        <p className="damage-description">{MOCK_FINAL_RESULT.damageDescription}</p>
                    </div>
                )}

                {MOCK_FINAL_RESULT.rewards && (
                    <div className="rewards-section">
                        <h4>⭐ Rewards</h4>
                        <ul>
                            {MOCK_FINAL_RESULT.rewards.xp > 0 && <li>+{MOCK_FINAL_RESULT.rewards.xp} XP</li>}
                            {MOCK_FINAL_RESULT.rewards.gold > 0 && <li>+{MOCK_FINAL_RESULT.rewards.gold} gold</li>}
                            {MOCK_FINAL_RESULT.rewards.items && MOCK_FINAL_RESULT.rewards.items.map((item, idx) => (
                                <li key={idx}>{item}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {MOCK_FINAL_RESULT.affectedFactions && (
                    <div className="faction-changes">
                        <h4>📜 Reputation Changes</h4>
                        <ul>
                            {Object.entries(MOCK_FINAL_RESULT.affectedFactions).map(([faction, change]) => (
                                <li key={faction}>{faction}: {change > 0 ? '+' : ''}{change}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            <button className="primary-button" style={{ width: '100%', marginTop: '15px' }}>
                Continue Journey
            </button>
        </>
    );

    // ─── State Renderers Map ───────────────────────────────────────────────────

    const renderers = {
        'hero-selection': renderHeroSelection,
        'action-selection': renderActionSelection,
        'round-result': renderRoundResult,
        'victory': renderVictory,
        'defeat': renderDefeat,
        'final-result': renderFinalResult,
    };

    return (
        <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
            <h1>🎭 Encounter Modal States</h1>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
                Each tab renders a different state of the encounter modal using the real CSS classes.
            </p>

            {/* Controls */}
            <div style={{
                display: 'flex', gap: '15px', marginBottom: '20px',
                alignItems: 'center', flexWrap: 'wrap'
            }}>
                <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Encounter:</label>
                    <select
                        value={selectedEncounterKey}
                        onChange={(e) => setSelectedEncounterKey(e.target.value)}
                        style={{ padding: '6px 10px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '4px' }}
                    >
                        {Object.keys(encounterTemplates).map(key => (
                            <option key={key} value={key}>{encounterTemplates[key].name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                        Image Height: {imageHeight}px
                    </label>
                    <input
                        type="range" min="120" max="400" value={imageHeight}
                        onChange={(e) => setImageHeight(Number(e.target.value))}
                        style={{ width: '200px' }}
                    />
                </div>
            </div>

            {/* State Tabs */}
            <div style={{
                display: 'flex', gap: '4px', marginBottom: '20px',
                flexWrap: 'wrap', borderBottom: '2px solid var(--border)', paddingBottom: '8px'
            }}>
                {STATES.map((state) => (
                    <button
                        key={state.id}
                        onClick={() => setActiveState(state.id)}
                        style={{
                            padding: '8px 14px',
                            background: activeState === state.id ? 'var(--primary)' : 'var(--surface)',
                            color: activeState === state.id ? 'var(--bg)' : 'var(--text)',
                            border: activeState === state.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                            borderRadius: '6px 6px 0 0',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: activeState === state.id ? 'bold' : 'normal',
                            transition: 'all 0.2s'
                        }}
                    >
                        {state.icon} {state.label}
                    </button>
                ))}
            </div>

            {/* Modal Shell — uses the real CSS classes */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div
                    className="modal-content encounter-action-modal"
                    style={{
                        maxWidth: '800px',
                        width: '95%',
                        padding: '20px 24px',
                        position: 'relative',
                        maxHeight: 'none',
                        overflow: 'visible'
                    }}
                >
                    {renderers[activeState]()}
                </div>
            </div>

            {/* Viewport Size Indicator */}
            <div style={{
                marginTop: '20px', padding: '10px', background: 'var(--surface)',
                border: '1px solid var(--border)', borderRadius: '8px',
                fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center'
            }}>
                Modal shell rendered inline (no portal). Content height is unclamped for testing.
                The real modal uses <code>max-height: 85vh</code> — content taller than that would scroll.
            </div>
        </div>
    );
};

export default EncounterModalStates;
