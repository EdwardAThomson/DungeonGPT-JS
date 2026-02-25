import React from 'react';
import { getHPStatus } from '../utils/healthSystem';

const XP_THRESHOLDS = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000];

const getXpProgress = (hero) => {
  const xp = hero.xp || 0;
  const level = hero.level || 1;
  const currentThreshold = XP_THRESHOLDS[level - 1] || 0;
  const nextThreshold = XP_THRESHOLDS[level] || XP_THRESHOLDS[level - 1];
  if (nextThreshold <= currentThreshold) return 100;
  return Math.min(100, ((xp - currentThreshold) / (nextThreshold - currentThreshold)) * 100);
};

const PartySidebar = ({ selectedHeroes = [], onOpenCharacter, className = '' }) => {
  return (
    <div className={`party-bar ${className}`.trim()}>
      <h2>Party Members</h2>
      {selectedHeroes.length > 0 ? (
        selectedHeroes.map((hero) => (
          <div key={hero.characterId || hero.characterName} className="party-member">
            {hero.profilePicture && (
              <img
                src={hero.profilePicture}
                alt={`${hero.characterName}'s profile`}
                onClick={() => onOpenCharacter(hero)}
              />
            )}
            <h3>{hero.characterName}</h3>
            <p>Level {hero.characterLevel} {hero.characterRace} {hero.characterClass}</p>

            {hero.maxHP && (
              <div style={{ margin: '10px 0', padding: '8px', background: 'var(--surface-light)', borderRadius: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 'bold' }}>HP:</span>
                  <span style={{ color: getHPStatus(hero.currentHP, hero.maxHP).color, fontWeight: 'bold' }}>
                    {hero.currentHP}/{hero.maxHP}
                  </span>
                </div>
                <div style={{
                  width: '100%',
                  height: '12px',
                  background: 'var(--border)',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  border: '1px solid var(--border)'
                }}>
                  <div style={{
                    width: `${(hero.currentHP / hero.maxHP) * 100}%`,
                    height: '100%',
                    background: getHPStatus(hero.currentHP, hero.maxHP).color,
                    transition: 'width 0.5s ease'
                  }} />
                </div>
                {hero.currentHP <= hero.maxHP * 0.25 && hero.currentHP > 0 && (
                  <div style={{ fontSize: '10px', color: 'var(--state-danger)', marginTop: '4px', fontStyle: 'italic' }}>
                    {getHPStatus(hero.currentHP, hero.maxHP).description}
                  </div>
                )}
                {hero.currentHP === 0 && (
                  <div style={{ fontSize: '10px', color: 'var(--state-danger)', marginTop: '4px', fontWeight: 'bold' }}>
                    💀 DEFEATED
                  </div>
                )}
              </div>
            )}

            <div style={{ margin: '8px 0', padding: '8px', background: 'var(--surface-light)', borderRadius: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                <span style={{ fontWeight: 'bold' }}>XP:</span>
                <span style={{ color: 'var(--state-highlight)', fontWeight: 'bold' }}>
                  {hero.xp || 0} (Lvl {hero.level || 1})
                </span>
              </div>
              <div style={{
                width: '100%',
                height: '8px',
                background: 'var(--ink-strong)',
                borderRadius: '4px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${getXpProgress(hero)}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, var(--state-warning), var(--state-highlight))',
                  transition: 'width 0.5s ease'
                }} />
              </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: '5px' }}>
              <button className="view-details-btn" onClick={() => onOpenCharacter(hero)}>
                View Details
              </button>
            </div>
          </div>
        ))
      ) : (
        <p>No heroes selected.</p>
      )}
    </div>
  );
};

export default PartySidebar;
