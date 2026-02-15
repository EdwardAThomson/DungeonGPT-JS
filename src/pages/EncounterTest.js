import React, { useState } from 'react';
import EncounterActionModal from '../components/EncounterActionModal';
import { encounterTemplates } from '../data/encounters';
import { initializeHP, applyDamage, getHPStatus } from '../utils/healthSystem';

const EncounterTest = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEncounter, setSelectedEncounter] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Categorize encounters
  const categorizeEncounter = (key, encounter) => {
    if (encounter.environmental) return 'environmental';
    if (encounter.poiType === 'cave') return 'cave';
    if (encounter.poiType === 'ruins') return 'ruins';
    if (encounter.poiType === 'grove') return 'grove';
    if (encounter.poiType === 'mountain') return 'mountain';
    if (encounter.encounterTier === 'narrative') return 'narrative';
    if (encounter.encounterTier === 'immediate') return 'immediate';
    return 'other';
  };

  const categories = [
    { id: 'all', label: '🎲 All', color: '#9b59b6' },
    { id: 'immediate', label: '⚔️ Immediate', color: '#e74c3c' },
    { id: 'narrative', label: '📖 Narrative', color: '#3498db' },
    { id: 'cave', label: '🕳️ Caves', color: '#7f8c8d' },
    { id: 'ruins', label: '🏛️ Ruins', color: '#d35400' },
    { id: 'grove', label: '🌳 Groves', color: '#27ae60' },
    { id: 'mountain', label: '🏔️ Mountains', color: '#2c3e50' },
    { id: 'environmental', label: '🌦️ Environmental', color: '#1abc9c' }
  ];

  const filteredEncounters = Object.entries(encounterTemplates).filter(([key, enc]) => {
    if (categoryFilter === 'all') return true;
    return categorizeEncounter(key, enc) === categoryFilter;
  });

  // Mock character for testing with HP
  const [testCharacter, setTestCharacter] = useState(() => {
    const baseCharacter = {
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
    return initializeHP(baseCharacter);
  });

  const handleEncounterSelect = (encounterKey) => {
    // Check if character is defeated
    if (testCharacter.currentHP <= 0) {
      alert('Your character is defeated and cannot engage in combat! Use the Full Heal button to recover.');
      return;
    }
    
    setSelectedEncounter(encounterTemplates[encounterKey]);
    setIsModalOpen(true);
  };

  const handleResolve = (result) => {
    console.log('[ENCOUNTER TEST] Result:', result);
  };
  
  const handleCharacterUpdate = (updatedCharacter) => {
    setTestCharacter(updatedCharacter);
  };

  return (
    <div className="page-container" style={{ padding: '40px' }}>
      <h1>🎲 Encounter System Test</h1>
      <p style={{ marginBottom: '30px', color: 'var(--text-secondary)' }}>
        Click an encounter below to test the narrative-first encounter resolution system.
      </p>

      {/* Category Filter */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setCategoryFilter(cat.id)}
            style={{
              padding: '8px 16px',
              background: categoryFilter === cat.id ? cat.color : 'var(--surface)',
              color: categoryFilter === cat.id ? 'white' : 'var(--text)',
              border: `2px solid ${cat.color}`,
              borderRadius: '20px',
              cursor: 'pointer',
              fontWeight: categoryFilter === cat.id ? 'bold' : 'normal',
              transition: 'all 0.2s ease'
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <p style={{ marginBottom: '15px', color: 'var(--text-secondary)' }}>
        Showing {filteredEncounters.length} encounters
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px' }}>
        {filteredEncounters.map(([key, encounter]) => (
          <button
            key={key}
            onClick={() => handleEncounterSelect(key)}
            style={{
              background: 'var(--surface)',
              border: '2px solid var(--border)',
              borderRadius: '8px',
              padding: '20px',
              cursor: 'pointer',
              textAlign: 'center',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--primary)';
              e.currentTarget.style.transform = 'translateY(-5px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{ fontSize: '48px', marginBottom: '10px' }}>{encounter.icon}</div>
            <h3 style={{ margin: '10px 0', color: 'var(--primary)' }}>{encounter.name}</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '5px 0' }}>
              Difficulty: {encounter.difficulty}
            </p>
            <p style={{ fontSize: '14px', color: 'var(--text)', marginTop: '10px', lineHeight: '1.4' }}>
              {encounter.description.substring(0, 80)}...
            </p>
          </button>
        ))}
      </div>

      <div style={{ marginTop: '40px', padding: '20px', background: 'var(--surface-light)', borderRadius: '8px' }}>
        <h3>Test Character Stats</h3>
        
        {/* HP Bar */}
        <div style={{ marginBottom: '20px', padding: '15px', background: 'var(--surface)', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <strong style={{ fontSize: '18px' }}>Health:</strong>
            <span style={{ fontSize: '18px', fontWeight: 'bold', color: getHPStatus(testCharacter.currentHP, testCharacter.maxHP).color }}>
              {testCharacter.currentHP} / {testCharacter.maxHP} HP
            </span>
          </div>
          <div style={{ 
            width: '100%', 
            height: '30px', 
            background: 'var(--border)', 
            borderRadius: '15px', 
            overflow: 'hidden',
            border: '2px solid var(--border)'
          }}>
            <div style={{ 
              width: `${(testCharacter.currentHP / testCharacter.maxHP) * 100}%`, 
              height: '100%', 
              background: `linear-gradient(90deg, ${getHPStatus(testCharacter.currentHP, testCharacter.maxHP).color}, ${getHPStatus(testCharacter.currentHP, testCharacter.maxHP).color})`,
              transition: 'width 0.5s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 'bold',
              fontSize: '12px'
            }}>
              {testCharacter.currentHP > 0 && `${Math.round((testCharacter.currentHP / testCharacter.maxHP) * 100)}%`}
            </div>
          </div>
          <div style={{ marginTop: '8px', textAlign: 'center', fontSize: '14px', fontStyle: 'italic', color: getHPStatus(testCharacter.currentHP, testCharacter.maxHP).color }}>
            {getHPStatus(testCharacter.currentHP, testCharacter.maxHP).description}
          </div>
          {testCharacter.currentHP < testCharacter.maxHP && (
            <button 
              onClick={() => setTestCharacter(prev => ({ ...prev, currentHP: prev.maxHP }))}
              style={{
                marginTop: '10px',
                padding: '8px 16px',
                background: '#27ae60',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                width: '100%',
                fontWeight: 'bold'
              }}
            >
              ✨ Full Heal (Test)
            </button>
          )}
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '15px' }}>
          {Object.entries(testCharacter.stats).map(([stat, value]) => (
            <div key={stat} style={{ padding: '10px', background: 'var(--surface)', borderRadius: '4px' }}>
              <strong>{stat}:</strong> {value} (modifier: {Math.floor((value - 10) / 2) >= 0 ? '+' : ''}{Math.floor((value - 10) / 2)})
            </div>
          ))}
        </div>
      </div>

      <EncounterActionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        encounter={selectedEncounter}
        character={testCharacter}
        onResolve={handleResolve}
        onCharacterUpdate={handleCharacterUpdate}
      />
    </div>
  );
};

export default EncounterTest;
