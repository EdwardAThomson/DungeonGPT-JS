import React, { useState } from 'react';
import {
  XP_THRESHOLDS,
  calculateLevel,
  getLevelProgress,
  awardXP,
  initializeProgression,
  calculateEncounterXP,
  XP_REWARDS,
  calculateMaxHP,
  levelGrantsASI,
  getLevelUpSummary
} from '../utils/progressionSystem';
import {
  processRewards,
  addItem,
  addGold,
  getInventoryValue,
  getRarityColor,
  ITEM_CATALOG
} from '../utils/inventorySystem';

const ProgressionTest = () => {
  // Test character with progression
  const [character, setCharacter] = useState(() => {
    const baseChar = {
      characterName: 'Test Hero',
      characterClass: 'Fighter',
      stats: {
        Strength: 16,
        Dexterity: 14,
        Constitution: 15,
        Intelligence: 10,
        Wisdom: 12,
        Charisma: 8
      }
    };
    return initializeProgression(baseChar);
  });

  const [levelUpMessage, setLevelUpMessage] = useState(null);
  const [lastReward, setLastReward] = useState(null);

  // Award XP with visual feedback
  const handleAwardXP = (amount) => {
    const result = awardXP(character, amount);
    setCharacter(result.character);
    
    if (result.leveledUp) {
      const summary = getLevelUpSummary(result.previousLevel, result.newLevel, result.character);
      setLevelUpMessage(summary);
      setTimeout(() => setLevelUpMessage(null), 5000);
    }
  };

  // Simulate encounter reward
  const handleSimulateEncounter = (difficulty, outcome) => {
    const xp = calculateEncounterXP(difficulty, outcome, character.level);
    const mockRewards = {
      xp,
      gold: difficulty === 'easy' ? '2d6' : difficulty === 'medium' ? '3d10' : '5d12',
      items: ['healing_potion:30%', 'gemstone:20%', 'magic_weapon:5%']
    };
    
    const rewards = processRewards(mockRewards, outcome);
    
    // Apply rewards
    let updatedChar = { ...character };
    const xpResult = awardXP(updatedChar, rewards.xp);
    updatedChar = addGold(xpResult.character, rewards.gold);
    
    for (const itemKey of rewards.items) {
      updatedChar = {
        ...updatedChar,
        inventory: addItem(updatedChar.inventory, itemKey)
      };
    }
    
    setCharacter(updatedChar);
    setLastReward(rewards);
    
    if (xpResult.leveledUp) {
      const summary = getLevelUpSummary(xpResult.previousLevel, xpResult.newLevel, xpResult.character);
      setLevelUpMessage(summary);
      setTimeout(() => setLevelUpMessage(null), 5000);
    }
  };

  // Reset character
  const handleReset = () => {
    const baseChar = {
      characterName: 'Test Hero',
      characterClass: character.characterClass,
      stats: character.stats
    };
    setCharacter(initializeProgression(baseChar));
    setLevelUpMessage(null);
    setLastReward(null);
  };

  const progress = getLevelProgress(character.xp);

  return (
    <div className="page-container" style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>📈 Progression System Test</h1>
      <p style={{ marginBottom: '30px', color: 'var(--text-secondary)' }}>
        Test XP curves, leveling, and inventory systems. This is a slow-progression game.
      </p>

      {/* Level Up Notification */}
      {levelUpMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg, #f1c40f, #e67e22)',
          color: 'black',
          padding: '20px 40px',
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(241, 196, 15, 0.5)',
          zIndex: 1000,
          animation: 'pulse 0.5s ease-in-out',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>🎉 LEVEL UP!</div>
          <div style={{ fontSize: '18px', marginTop: '10px' }}>{levelUpMessage.message}</div>
          <div style={{ fontSize: '14px', marginTop: '5px' }}>Max HP: {levelUpMessage.newMaxHP}</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
        {/* Character Panel */}
        <div style={{ background: 'var(--surface)', padding: '25px', borderRadius: '12px', border: '2px solid var(--border)' }}>
          <h2 style={{ marginBottom: '20px' }}>⚔️ {character.characterName}</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
            <div style={{ background: 'var(--surface-light)', padding: '15px', borderRadius: '8px' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>CLASS</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{character.characterClass}</div>
            </div>
            <div style={{ background: 'var(--surface-light)', padding: '15px', borderRadius: '8px' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>LEVEL</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--primary)' }}>{character.level}</div>
            </div>
          </div>

          {/* XP Bar */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontWeight: 'bold' }}>Experience</span>
              <span>{character.xp.toLocaleString()} XP</span>
            </div>
            <div style={{ 
              width: '100%', 
              height: '24px', 
              background: 'var(--border)', 
              borderRadius: '12px',
              overflow: 'hidden'
            }}>
              <div style={{ 
                width: `${progress.percentage}%`, 
                height: '100%', 
                background: 'linear-gradient(90deg, #9b59b6, #3498db)',
                transition: 'width 0.5s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '12px',
                fontWeight: 'bold'
              }}>
                {progress.percentage}%
              </div>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '5px' }}>
              {progress.isMaxLevel ? 'MAX LEVEL' : `${progress.current.toLocaleString()} / ${progress.required.toLocaleString()} to next level`}
            </div>
          </div>

          {/* HP */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontWeight: 'bold' }}>Health</span>
              <span>{character.currentHP} / {character.maxHP} HP</span>
            </div>
            <div style={{ 
              width: '100%', 
              height: '20px', 
              background: 'var(--border)', 
              borderRadius: '10px',
              overflow: 'hidden'
            }}>
              <div style={{ 
                width: `${(character.currentHP / character.maxHP) * 100}%`, 
                height: '100%', 
                background: '#27ae60',
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>

          {/* Gold */}
          <div style={{ 
            background: 'linear-gradient(135deg, #f39c12, #d35400)', 
            padding: '15px', 
            borderRadius: '8px',
            color: 'white',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ fontSize: '18px' }}>💰 Gold</span>
            <span style={{ fontSize: '24px', fontWeight: 'bold' }}>{character.gold.toLocaleString()}</span>
          </div>
        </div>

        {/* XP Testing Panel */}
        <div style={{ background: 'var(--surface)', padding: '25px', borderRadius: '12px', border: '2px solid var(--border)' }}>
          <h2 style={{ marginBottom: '20px' }}>🎯 Award XP</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' }}>
            {[10, 25, 50, 100, 250, 500].map(xp => (
              <button
                key={xp}
                onClick={() => handleAwardXP(xp)}
                style={{
                  padding: '12px',
                  background: 'var(--surface-light)',
                  border: '2px solid var(--primary)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  color: 'var(--text)',
                  fontWeight: 'bold',
                  transition: 'all 0.2s ease'
                }}
              >
                +{xp} XP
              </button>
            ))}
          </div>

          <h3 style={{ marginTop: '25px', marginBottom: '15px' }}>⚔️ Simulate Encounter</h3>
          
          {Object.entries(XP_REWARDS).map(([diff, baseXP]) => (
            <div key={diff} style={{ marginBottom: '15px' }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '8px'
              }}>
                <span style={{ textTransform: 'capitalize', fontWeight: 'bold' }}>
                  {diff} (Base: {baseXP} XP)
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['criticalSuccess', 'success', 'failure'].map(outcome => (
                  <button
                    key={outcome}
                    onClick={() => handleSimulateEncounter(diff, outcome)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      background: outcome === 'criticalSuccess' ? '#27ae60' : outcome === 'success' ? '#3498db' : '#e74c3c',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: 'bold'
                    }}
                  >
                    {outcome === 'criticalSuccess' ? 'Crit!' : outcome === 'success' ? 'Success' : 'Fail'}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {lastReward && (
            <div style={{ 
              marginTop: '20px', 
              padding: '15px', 
              background: 'var(--surface-light)', 
              borderRadius: '8px',
              border: '2px solid var(--primary)'
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>Last Reward:</div>
              <div>+{lastReward.xp} XP</div>
              <div>+{lastReward.gold} Gold</div>
              {lastReward.items.length > 0 && (
                <div>Items: {lastReward.items.join(', ')}</div>
              )}
            </div>
          )}

          <button
            onClick={handleReset}
            style={{
              marginTop: '20px',
              width: '100%',
              padding: '12px',
              background: '#e74c3c',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            🔄 Reset Character
          </button>
        </div>
      </div>

      {/* Inventory Panel */}
      <div style={{ 
        marginTop: '30px', 
        background: 'var(--surface)', 
        padding: '25px', 
        borderRadius: '12px', 
        border: '2px solid var(--border)' 
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2>🎒 Inventory</h2>
          <span style={{ color: 'var(--text-secondary)' }}>
            Value: {getInventoryValue(character.inventory).toLocaleString()} gold
          </span>
        </div>
        
        {character.inventory.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            No items yet. Complete encounters to earn loot!
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
            {character.inventory.map((item, idx) => (
              <div 
                key={idx}
                style={{
                  padding: '12px',
                  background: 'var(--surface-light)',
                  borderRadius: '8px',
                  borderLeft: `4px solid ${getRarityColor(item.rarity)}`
                }}
              >
                <div style={{ fontWeight: 'bold', color: getRarityColor(item.rarity) }}>
                  {item.name}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {item.quantity > 1 && `x${item.quantity} • `}
                  {item.value > 0 && `${item.value}g`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* XP Curve Reference */}
      <div style={{ 
        marginTop: '30px', 
        background: 'var(--surface)', 
        padding: '25px', 
        borderRadius: '12px', 
        border: '2px solid var(--border)' 
      }}>
        <h2 style={{ marginBottom: '20px' }}>📊 XP Curve Reference</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '15px' }}>
          This is a slow progression game. Expect ~20-30 encounters per level early on.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
          {XP_THRESHOLDS.map((xp, idx) => (
            <div 
              key={idx}
              style={{
                padding: '10px',
                background: idx + 1 === character.level ? 'var(--primary)' : 'var(--surface-light)',
                color: idx + 1 === character.level ? 'white' : 'var(--text)',
                borderRadius: '8px',
                textAlign: 'center',
                border: levelGrantsASI(idx + 1) ? '2px solid #f1c40f' : 'none'
              }}
            >
              <div style={{ fontWeight: 'bold' }}>Lvl {idx + 1}</div>
              <div style={{ fontSize: '12px' }}>{xp.toLocaleString()} XP</div>
              {levelGrantsASI(idx + 1) && <div style={{ fontSize: '10px', color: '#f1c40f' }}>+2 Stats</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ProgressionTest;
