import React from 'react';
import { calculateMaxHP, getHPStatus } from '../utils/healthSystem';
import { getLevelProgress, calculateLevel } from '../utils/progressionSystem';

const HeroModal = ({ isOpen, onClose, hero }) => {
    if (!isOpen || !hero) return null;

    // Gender emoji - Male or Female only
    const getGenderEmoji = (gender) => {
        const g = (gender || '').toLowerCase();
        if (g === 'female' || g.includes('female')) return '♀️';
        return '♂️'; // Default to male
    };

    const heroRace = hero.characterRace || hero.race || hero.heroRace || '';
    const heroClass = hero.characterClass || hero.heroClass || '';
    const heroLevel = hero.level || hero.heroLevel || hero.characterLevel || 1;
    const heroGender = hero.heroGender || hero.characterGender || hero.gender || 'Male';

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal-content hero-details-modal"
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: '700px', width: '90%' }}
            >
                <div className="modal-header-with-image">
                    {hero.profilePicture && (
                        <div className="modal-profile-pic-container">
                            <img
                                src={hero.profilePicture}
                                alt={`${hero.heroName}'s profile`}
                                className="modal-profile-pic"
                            />
                        </div>
                    )}
                    <div className="modal-header-text">
                        <h2>{hero.characterName || hero.heroName}</h2>
                        <p className="hero-subtitle">
                            {getGenderEmoji(heroGender)} Level {heroLevel} {heroRace} {heroClass}
                        </p>
                    </div>
                </div>

                <div className="modal-section scrollable-modal-section">
                    <h4>Hero Stats</h4>
                    {hero.stats && (
                        <div className="stats-grid-modal">
                            {Object.entries(hero.stats).map(([stat, value]) => (
                                <div key={stat} className="stat-item-modal">
                                    <span className="stat-label">{stat.substring(0, 3).toUpperCase()}</span>
                                    <span className="stat-value">{value}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {hero.heroBackground && (
                    <div className="modal-section scrollable-modal-section">
                        <h4>Background</h4>
                        <div className="hero-background-text">
                            {hero.heroBackground}
                        </div>
                    </div>
                )}

                {hero.stats && (() => {
                    const maxHP = hero.maxHP || calculateMaxHP(hero);
                    const currentHP = hero.currentHP ?? maxHP;
                    const status = getHPStatus(currentHP, maxHP);
                    return (
                        <div className="modal-section">
                            <h4>Health</h4>
                            <div className="hero-hp-display">
                                <div className="hero-hp-label">
                                    <span>HP </span>
                                    <span style={{ color: status.color, fontWeight: 'bold' }}>{currentHP}/{maxHP}</span>
                                </div>
                                <div className="hero-hp-bar">
                                    <div className="hero-hp-fill" style={{ 
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
                    const xp = hero.xp || 0;
                    const level = hero.level || calculateLevel(xp);
                    const progress = getLevelProgress(xp);
                    return (
                        <div className="modal-section">
                            <h4>Experience</h4>
                            <div className="hero-xp-display">
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <span><strong>Level {level}</strong></span>
                                    <span style={{ color: 'var(--state-highlight)', fontWeight: 'bold' }}>{xp} XP</span>
                                </div>
                                {!progress.isMaxLevel ? (
                                    <>
                                        <div className="hero-hp-bar" style={{ background: 'var(--ink-strong)' }}>
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

                {hero.heroAlignment && (
                    <div className="modal-section">
                        <p><strong>Alignment:</strong> {hero.heroAlignment}</p>
                    </div>
                )}

                <button className="modal-close-button" onClick={onClose} style={{ marginTop: '20px' }}>
                    Close
                </button>
            </div>
        </div>
    );
};

export default HeroModal;
