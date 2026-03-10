import React, { useState } from 'react';
import EncounterActionModal from '../components/EncounterActionModal';
import { createLogger } from '../utils/logger';

const logger = createLogger('encounter-debug');

const EncounterModalDebug = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [testEncounter, setTestEncounter] = useState(null);
  const [testHero, setTestHero] = useState(null);
  const [testParty, setTestParty] = useState([]);
  const [logs, setLogs] = useState([]);
  const [encounterResult, setEncounterResult] = useState(null);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, message, type }]);
    logger[type](message);
  };

  // Sample encounters
  const sampleEncounters = {
    simple: {
      name: 'Lone Wolf',
      description: 'A hungry wolf blocks your path, growling menacingly.',
      icon: '🐺',
      image: '/assets/encounters/wolf_pack.webp',
      difficulty: 'easy',
      suggestedActions: [
        { label: 'Attack', skill: 'Athletics', description: 'Fight the wolf head-on' },
        { label: 'Intimidate', skill: 'Intimidation', description: 'Scare it away' },
        { label: 'Sneak Past', skill: 'Stealth', description: 'Quietly move around it' }
      ],
      consequences: {
        criticalSuccess: 'You defeat the wolf with ease, barely breaking a sweat.',
        success: 'You manage to overcome the wolf after a brief struggle.',
        failure: 'The wolf bites you before retreating.',
        criticalFailure: 'The wolf mauls you badly before you escape.'
      },
      rewards: {
        xp: 50,
        gold: '1d6',
        items: ['wolf_pelt:30']
      },
      multiRound: false
    },
    multiRound: {
      name: 'Goblin Ambush',
      description: 'Three goblins leap from the bushes, weapons drawn!',
      icon: '👺',
      image: '/assets/encounters/goblin_ambush.webp',
      difficulty: 'hard',
      suggestedActions: [
        { label: 'Attack', skill: 'Athletics', description: 'Fight them directly' },
        { label: 'Defend', skill: 'Athletics', description: 'Take a defensive stance' },
        { label: 'Taunt', skill: 'Intimidation', description: 'Try to demoralize them' }
      ],
      consequences: {
        criticalSuccess: 'You strike with devastating force!',
        success: 'You land a solid hit.',
        failure: 'They dodge and counter-attack.',
        criticalFailure: 'You stumble and take a heavy blow!'
      },
      rewards: {
        xp: 100,
        gold: '2d10',
        items: ['rusty_dagger:50', 'healing_potion:20']
      },
      multiRound: true,
      enemyHP: 30
    },
    boss: {
      name: 'Goblin Chieftain',
      description: 'The goblin chieftain rises from his throne, a crude iron crown on his head. He snarls and draws a jagged blade.',
      icon: '👹',
      image: '/assets/encounters/bosses/goblin_chieftain.webp',
      difficulty: 'deadly',
      encounterTier: 'boss',
      suggestedActions: [
        { label: 'Attack', skill: 'Athletics', description: 'Charge the chieftain head-on' },
        { label: 'Tactical Strike', skill: 'Dexterity', description: 'Look for an opening in his guard' },
        { label: 'Rally Party', skill: 'Charisma', description: 'Inspire your allies for a coordinated assault' }
      ],
      consequences: {
        criticalSuccess: 'Your blow sends the chieftain reeling, his crown clattering to the floor!',
        success: 'You land a solid strike against the chieftain.',
        failure: 'The chieftain parries and slashes back at you.',
        criticalFailure: 'The chieftain knocks you to the ground with a brutal swing!'
      },
      rewards: {
        xp: 250,
        gold: '5d10',
        items: ['goblin_crown:100']
      },
      multiRound: true,
      enemyHP: 50
    },
    bandit: {
      name: 'Bandit Roadblock',
      description: 'A gang of bandits has set up a barricade across the road. Their leader steps forward, hand on sword.',
      icon: '🗡️',
      image: '/assets/encounters/bandit_roadblock.webp',
      difficulty: 'medium',
      suggestedActions: [
        { label: 'Fight', skill: 'Athletics', description: 'Draw your weapon and attack' },
        { label: 'Negotiate', skill: 'Persuasion', description: 'Try to talk your way through' },
        { label: 'Sneak Around', skill: 'Stealth', description: 'Find a way past the barricade' }
      ],
      consequences: {
        criticalSuccess: 'The bandits scatter before your fury.',
        success: 'You push through after a brief skirmish.',
        failure: 'The bandits rough you up and take some gold.',
        criticalFailure: 'The bandits overwhelm you and steal your valuables.'
      },
      rewards: {
        xp: 75,
        gold: '2d8',
        items: ['rusty_dagger:40', 'bandit_cloak:20']
      },
      multiRound: false
    }
  };

  // Sample heroes
  const sampleHeroes = [
    {
      characterId: 'hero-1',
      characterName: 'Thorin',
      heroName: 'Thorin',
      characterClass: 'Fighter',
      heroClass: 'Fighter',
      characterRace: 'Dwarf',
      level: 3,
      currentHP: 28,
      maxHP: 30,
      stats: {
        strength: 16,
        dexterity: 12,
        constitution: 14,
        intelligence: 10,
        wisdom: 11,
        charisma: 8
      },
      gold: 50,
      inventory: [],
      profilePicture: '/assets/characters/fighter.webp'
    },
    {
      characterId: 'hero-2',
      characterName: 'Lyra',
      heroName: 'Lyra',
      characterClass: 'Rogue',
      heroClass: 'Rogue',
      characterRace: 'Elf',
      level: 3,
      currentHP: 22,
      maxHP: 24,
      stats: {
        strength: 10,
        dexterity: 18,
        constitution: 12,
        intelligence: 14,
        wisdom: 13,
        charisma: 15
      },
      gold: 75,
      inventory: [],
      profilePicture: '/assets/characters/ranger.webp'
    }
  ];

  const startTest = (encounterType, partySize) => {
    addLog(`Starting ${encounterType} encounter with ${partySize} hero(es)`, 'info');

    const encounter = sampleEncounters[encounterType];
    const party = partySize === 1 ? [sampleHeroes[0]] : sampleHeroes;

    setTestEncounter(encounter);
    setTestHero(party[0]);
    setTestParty(party);
    setEncounterResult(null);
    setIsModalOpen(true);

    addLog('Modal opened', 'info');
  };

  const handleEncounterResolve = (result) => {
    addLog('Encounter resolved', 'info');
    addLog(`Outcome: ${result.outcomeTier}`, 'info');
    addLog(`Narration: ${result.narration}`, 'info');

    if (result.rewards) {
      addLog(`Rewards: XP=${result.rewards.xp}, Gold=${result.rewards.gold}, Items=${result.rewards.items?.join(', ') || 'none'}`, 'info');
    }

    if (result.penalties) {
      addLog(`Penalties: ${result.penalties.messages?.join(', ') || 'none'}`, 'warn');
    }

    if (result.hpDamage) {
      addLog(`HP Damage: ${result.hpDamage}`, 'warn');
    }

    setEncounterResult(result);
    setIsModalOpen(false);
  };

  const handleHeroUpdate = (updatedHero) => {
    addLog(`Hero updated: ${updatedHero.characterName} HP=${updatedHero.currentHP}/${updatedHero.maxHP}`, 'info');
    setTestHero(updatedHero);

    // Update in party too
    setTestParty(prev => prev.map(h =>
      h.characterId === updatedHero.characterId ? updatedHero : h
    ));
  };

  const clearLogs = () => {
    setLogs([]);
    addLog('Logs cleared', 'info');
  };

  return (
    <div style={{
      padding: '20px',
      maxWidth: '1200px',
      margin: '0 auto',
      fontFamily: 'var(--body-font)',
      color: 'var(--text)',
      background: 'var(--bg)',
      minHeight: '100vh'
    }}>
      <h1 style={{ color: 'var(--primary)' }}>⚔️ Encounter Modal Debug</h1>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '20px',
        marginBottom: '20px'
      }}>
        {/* Test Controls */}
        <div style={{
          background: 'var(--surface)',
          padding: '20px',
          borderRadius: '8px',
          border: '1px solid var(--border)'
        }}>
          <h2>Test Controls</h2>

          <div style={{ marginBottom: '20px' }}>
            <h3>Simple Encounter (Single Round)</h3>
            <button
              onClick={() => startTest('simple', 1)}
              style={{ marginRight: '10px' }}
              className="primary-button"
            >
              1 Hero
            </button>
            <button
              onClick={() => startTest('simple', 2)}
              className="primary-button"
            >
              2 Heroes (Selection)
            </button>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <h3>Multi-Round Encounter</h3>
            <button
              onClick={() => startTest('multiRound', 1)}
              style={{ marginRight: '10px' }}
              className="primary-button"
            >
              1 Hero
            </button>
            <button
              onClick={() => startTest('multiRound', 2)}
              className="primary-button"
            >
              2 Heroes (Selection)
            </button>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <h3>Boss Encounter</h3>
            <button
              onClick={() => startTest('boss', 1)}
              style={{ marginRight: '10px' }}
              className="primary-button"
            >
              1 Hero
            </button>
            <button
              onClick={() => startTest('boss', 2)}
              className="primary-button"
            >
              2 Heroes (Selection)
            </button>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <h3>Bandit Roadblock</h3>
            <button
              onClick={() => startTest('bandit', 1)}
              style={{ marginRight: '10px' }}
              className="primary-button"
            >
              1 Hero
            </button>
            <button
              onClick={() => startTest('bandit', 2)}
              className="primary-button"
            >
              2 Heroes (Selection)
            </button>
          </div>

          <div>
            <h3>Current Test State</h3>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              <p>Modal Open: {isModalOpen ? '✅' : '❌'}</p>
              <p>Encounter: {testEncounter?.name || 'None'}</p>
              <p>Party Size: {testParty.length}</p>
              {testHero && (
                <p>Active Hero: {testHero.characterName} ({testHero.currentHP}/{testHero.maxHP} HP)</p>
              )}
            </div>
          </div>
        </div>

        {/* Last Result */}
        <div style={{
          background: 'var(--surface)',
          padding: '20px',
          borderRadius: '8px',
          border: '1px solid var(--border)'
        }}>
          <h2>Last Result</h2>
          {encounterResult ? (
            <div style={{ fontSize: '14px' }}>
              <p><strong>Outcome:</strong> <span style={{
                color: encounterResult.outcomeTier?.includes('Success') ? 'var(--state-success)' : 'var(--state-danger)'
              }}>{encounterResult.outcomeTier}</span></p>
              <p><strong>Narration:</strong> {encounterResult.narration}</p>
              {encounterResult.rollResult && (
                <p><strong>Roll:</strong> {encounterResult.rollResult.total} (d20: {encounterResult.rollResult.naturalRoll} + {encounterResult.rollResult.modifier})</p>
              )}
              {encounterResult.rewards && (
                <div>
                  <p><strong>Rewards:</strong></p>
                  <ul style={{ marginLeft: '20px' }}>
                    <li>XP: {encounterResult.rewards.xp}</li>
                    <li>Gold: {encounterResult.rewards.gold}</li>
                    {encounterResult.rewards.items?.length > 0 && (
                      <li>Items: {encounterResult.rewards.items.join(', ')}</li>
                    )}
                  </ul>
                </div>
              )}
              {encounterResult.hpDamage > 0 && (
                <p style={{ color: 'var(--state-danger)' }}>
                  <strong>HP Damage:</strong> {encounterResult.hpDamage} ({encounterResult.damageDescription})
                </p>
              )}
            </div>
          ) : (
            <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              No results yet. Run a test encounter.
            </p>
          )}
        </div>
      </div>

      {/* Logs */}
      <div style={{
        background: 'var(--surface)',
        padding: '20px',
        borderRadius: '8px',
        border: '1px solid var(--border)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h2>Event Logs</h2>
          <button onClick={clearLogs} className="primary-button">Clear Logs</button>
        </div>
        <div style={{
          background: 'var(--bg)',
          padding: '15px',
          borderRadius: '4px',
          maxHeight: '400px',
          overflowY: 'auto',
          fontFamily: 'monospace',
          fontSize: '12px'
        }}>
          {logs.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No logs yet</p>
          ) : (
            logs.map((log, idx) => (
              <div key={idx} style={{
                marginBottom: '5px',
                color: log.type === 'error' ? 'var(--state-danger)' :
                  log.type === 'warn' ? 'var(--state-warning)' :
                    'var(--text)'
              }}>
                <span style={{ color: 'var(--text-secondary)' }}>[{log.timestamp}]</span> {log.message}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal */}
      <EncounterActionModal
        isOpen={isModalOpen}
        onClose={() => {
          addLog('Modal closed by user', 'info');
          setIsModalOpen(false);
        }}
        encounter={testEncounter}
        character={testHero}
        fullSizeImage
        party={testParty}
        onResolve={handleEncounterResolve}
        onCharacterUpdate={handleHeroUpdate}
      />
    </div>
  );
};

export default EncounterModalDebug;
