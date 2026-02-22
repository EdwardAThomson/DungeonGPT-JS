import React from 'react';
import { calculateMaxHP, getHPStatus } from '../utils/healthSystem';
import { getLevelProgress, calculateLevel } from '../utils/progressionSystem';

const CharacterModal = ({ isOpen, onClose, character }) => {
    if (!isOpen || !character) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal-content character-details-modal"
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: '500px', width: '90%' }}
            >
                <div className="modal-header-with-image">
                    {character.profilePicture && (
                        <div className="modal-profile-pic-container">
                            <img
                                src={character.profilePicture}
                                alt={`${character.characterName}'s profile`}
                                className="modal-profile-pic"
                            />
                        </div>
                    )}
                    <div className="modal-header-text">
                        <h2>{character.characterName}</h2>
                        <p className="character-subtitle">
                            Level {character.characterLevel} {character.characterGender} {character.characterRace} {character.characterClass}
                        </p>
                    </div>
                </div>

                <div className="modal-section scrollable-modal-section">
                    <h4>Character Stats</h4>
                    {character.stats && (
                        <div className="stats-grid-modal">
                            {Object.entries(character.stats).map(([stat, value]) => (
                                <div key={stat} className="stat-item-modal">
                                    <span className="stat-label">{stat.substring(0, 3).toUpperCase()}</span>
                                    <span className="stat-value">{value}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {character.characterBackground && (
                    <div className="modal-section scrollable-modal-section">
                        <h4>Background</h4>
                        <div className="character-background-text">
                            {character.characterBackground}
                        </div>
                    </div>
                )}

                {character.stats && (() => {
                    const maxHP = character.maxHP || calculateMaxHP(character);
                    const currentHP = character.currentHP ?? maxHP;
                    const status = getHPStatus(currentHP, maxHP);
                    return (
                        <div className="modal-section">
                            <h4>Health</h4>
                            <div className="character-hp-display">
                                <div className="character-hp-label">
                                    <span>HP</span>
                                    <span style={{ color: status.color, fontWeight: 'bold' }}>{currentHP}/{maxHP}</span>
                                </div>
                                <div className="character-hp-bar">
                                    <div className="character-hp-fill" style={{ 
                                        width: `${(currentHP / maxHP) * 100}%`,
                                        background: status.color
                                    }} />
                                </div>
                                <p style={{ fontSize: '12px', color: status.color, margin: '6px 0 0', fontStyle: 'italic' }}>
                                    {status.description}
                                </p>
                            </div>
                        </div>
                    );
                })()}

                {(() => {
                    const xp = character.xp || 0;
                    const level = character.level || calculateLevel(xp);
                    const progress = getLevelProgress(xp);
                    return (
                        <div className="modal-section">
                            <h4>Experience</h4>
                            <div className="character-xp-display">
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <span><strong>Level {level}</strong></span>
                                    <span style={{ color: 'var(--state-highlight)', fontWeight: 'bold' }}>{xp} XP</span>
                                </div>
                                {!progress.isMaxLevel ? (
                                    <>
                                        <div className="character-hp-bar" style={{ background: 'var(--ink-strong)' }}>
                                            <div style={{ 
                                                width: `${progress.percentage}%`,
                                                height: '100%',
                                                background: 'linear-gradient(90deg, var(--state-warning), var(--state-highlight))',
                                                borderRadius: '4px',
                                                transition: 'width 0.5s ease'
                                            }} />
                                        </div>
                                        <p style={{ fontSize: '12px', color: 'var(--state-muted)', margin: '6px 0 0' }}>
                                            {progress.current} / {progress.required} XP to next level ({progress.percentage}%)
                                        </p>
                                    </>
                                ) : (
                                    <p style={{ fontSize: '12px', color: 'var(--state-highlight)', margin: '6px 0 0', fontStyle: 'italic' }}>
                                        ⭐ Maximum Level Reached!
                                    </p>
                                )}
                            </div>
                        </div>
                    );
                })()}

                {character.characterAlignment && (
                    <div className="modal-section">
                        <p><strong>Alignment:</strong> {character.characterAlignment}</p>
                    </div>
                )}

                <button className="modal-close-button" onClick={onClose} style={{ marginTop: '20px' }}>
                    Close
                </button>
            </div>
        </div>
    );
};

export default CharacterModal;
