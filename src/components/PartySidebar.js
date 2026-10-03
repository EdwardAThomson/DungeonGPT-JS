import React from 'react';
import { getHPStatus } from '../utils/healthSystem';
import { resolveProfilePicture } from '../utils/assetHelper';

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
    <aside className={`gm-party ${className}`.trim()} aria-label="Party">
      <h2 className="gm-eyebrow">Party</h2>
      {selectedHeroes.length > 0 ? (
        <ul className="gm-party-list">
          {selectedHeroes.map((hero) => {
            // Support both legacy (character*) and new (hero*) field names
            const name = hero.heroName || hero.characterName || 'Unknown';
            const level = hero.level || hero.heroLevel || hero.characterLevel || 1;
            const charClass = hero.heroClass || hero.characterClass || '';
            const id = hero.heroId || name;
            const defeated = hero.currentHP === 0 || hero.isDefeated;
            const hp = hero.maxHP ? getHPStatus(hero.currentHP, hero.maxHP) : null;
            const lowHp = hero.maxHP && hero.currentHP > 0 && hero.currentHP <= hero.maxHP * 0.25;

            return (
              <li key={id} className={`gm-hero${defeated ? ' defeated' : ''}`}>
                <button type="button" className="gm-hero-main" onClick={() => onOpenCharacter(hero)} aria-label={`${name}: view details`}>
                  {hero.profilePicture && <img src={resolveProfilePicture(hero.profilePicture)} alt="" />}
                  <span className="gm-hero-id">
                    <b>{name}</b>
                    <small>Level {level} {charClass}</small>
                  </span>
                </button>

                {hero.maxHP && (
                  <div className="gm-bar-row">
                    <span className="gm-bar-label">HP</span>
                    <div className="gm-bar"><span style={{ width: `${(hero.currentHP / hero.maxHP) * 100}%`, background: hp.color }} /></div>
                    <span className="gm-bar-val" style={{ color: hp.color }}>{hero.currentHP}/{hero.maxHP}</span>
                  </div>
                )}
                {lowHp && <p className="gm-hero-warn">{hp.description}</p>}
                {defeated && <p className="gm-hero-warn">Defeated</p>}

                <div className="gm-bar-row xp">
                  <span className="gm-bar-label">XP</span>
                  <div className="gm-bar thin"><span style={{ width: `${getXpProgress(hero)}%` }} /></div>
                  <span className="gm-bar-val">{hero.xp || 0}</span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="gm-note">No heroes selected.</p>
      )}
    </aside>
  );
};

export default PartySidebar;
