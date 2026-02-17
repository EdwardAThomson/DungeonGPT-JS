import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  shouldTriggerEncounter, 
  rollRandomEncounter, 
  checkForEncounter,
  rollEnvironmentalEncounter,
  checkForPoiEncounter
} from '../utils/encounterGenerator';
import { biomeEncounterChance, revisitEncounterMultiplier } from '../data/encounterTables';

const EncounterDebug = () => {
  const navigate = useNavigate();
  const [testResults, setTestResults] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [gameFlowResults, setGameFlowResults] = useState(null);
  
  // Test parameters
  const [biome, setBiome] = useState('plains');
  const [isFirstVisit, setIsFirstVisit] = useState(true);
  const [grimnessLevel, setGrimnessLevel] = useState('Gritty');
  const [movesSince, setMovesSince] = useState(0);
  const [numTrials, setNumTrials] = useState(100);
  const [numMoves, setNumMoves] = useState(20);
  
  const biomes = ['plains', 'forest', 'mountain', 'beach', 'town', 'water'];
  const grimnessLevels = ['Noble', 'Gritty', 'Dark', 'Grimdark'];

  const runEncounterTest = () => {
    setIsRunning(true);
    setTestResults([]);
    
    const tile = { 
      biome: biome === 'town' ? 'plains' : biome,
      poi: biome === 'town' ? 'town' : null,
      x: 5,
      y: 5
    };
    
    const settings = { grimnessLevel };
    
    let triggered = 0;
    let encounterTypes = {};
    const results = [];
    
    for (let i = 0; i < numTrials; i++) {
      const encounter = checkForEncounter(tile, isFirstVisit, settings, movesSince);
      
      if (encounter) {
        triggered++;
        const type = encounter.templateKey || 'unknown';
        encounterTypes[type] = (encounterTypes[type] || 0) + 1;
        
        results.push({
          trial: i + 1,
          triggered: true,
          name: encounter.name,
          type: type,
          tier: encounter.encounterTier,
          hostile: encounter.isHostile
        });
      } else {
        results.push({
          trial: i + 1,
          triggered: false
        });
      }
    }
    
    const triggerRate = (triggered / numTrials * 100).toFixed(1);
    
    setTestResults({
      summary: {
        totalTrials: numTrials,
        triggered,
        triggerRate,
        encounterTypes
      },
      details: results,
      expectedChance: calculateExpectedChance()
    });
    
    setIsRunning(false);
  };
  
  const calculateExpectedChance = () => {
    const biomeKey = biome === 'town' ? 'town' : biome;
    let chance = biomeEncounterChance[biomeKey] || 0.25;
    
    if (!isFirstVisit) {
      const multiplier = revisitEncounterMultiplier[biomeKey] || 0.3;
      chance *= multiplier;
    }
    
    const grimnessModifier = {
      'Noble': 0.8,
      'Gritty': 1.0,
      'Dark': 1.2,
      'Grimdark': 1.4
    };
    chance *= grimnessModifier[grimnessLevel] || 1.0;
    
    if (movesSince >= 3) chance += 0.10;
    if (movesSince >= 5) chance += 0.15;
    
    chance = Math.min(chance, 0.70);
    
    return (chance * 100).toFixed(1);
  };

  const runGameFlowSimulation = () => {
    setIsRunning(true);
    setGameFlowResults(null);
    
    const settings = { grimnessLevel };
    const moveLog = [];
    let currentMovesSinceEncounter = 0;
    let totalEncounters = 0;
    let immediateEncounters = 0;
    let narrativeEncounters = 0;
    let visitedTiles = new Set();
    
    // Simulate a series of moves
    for (let moveNum = 1; moveNum <= numMoves; moveNum++) {
      // Randomly pick a biome for this move
      const randomBiome = biomes[Math.floor(Math.random() * biomes.length)];
      const tileKey = `${moveNum % 10},${Math.floor(moveNum / 10)}`;
      const isFirstVisitToTile = !visitedTiles.has(tileKey);
      visitedTiles.add(tileKey);
      
      const tile = { 
        biome: randomBiome === 'town' ? 'plains' : randomBiome,
        poi: randomBiome === 'town' ? 'town' : null,
        x: moveNum % 10,
        y: Math.floor(moveNum / 10)
      };
      
      // Check for encounter (mimics Game.js logic)
      const encounter = checkForEncounter(tile, isFirstVisitToTile, settings, currentMovesSinceEncounter);
      
      const moveData = {
        moveNum,
        biome: randomBiome,
        isFirstVisit: isFirstVisitToTile,
        movesSinceLastEncounter: currentMovesSinceEncounter,
        encounterTriggered: !!encounter,
        encounterName: encounter?.name,
        encounterTier: encounter?.encounterTier,
        encounterType: encounter?.templateKey
      };
      
      if (encounter) {
        totalEncounters++;
        if (encounter.encounterTier === 'immediate') {
          immediateEncounters++;
          moveData.flow = 'IMMEDIATE → Modal shown, AI narrative deferred';
        } else if (encounter.encounterTier === 'narrative') {
          narrativeEncounters++;
          moveData.flow = 'NARRATIVE → Injected into AI prompt';
        }
        currentMovesSinceEncounter = 0;
      } else {
        currentMovesSinceEncounter++;
        moveData.flow = 'No encounter → AI narrative generated normally';
      }
      
      moveLog.push(moveData);
    }
    
    setGameFlowResults({
      totalMoves: numMoves,
      totalEncounters,
      immediateEncounters,
      narrativeEncounters,
      encounterRate: (totalEncounters / numMoves * 100).toFixed(1),
      moveLog
    });
    
    setIsRunning(false);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <button onClick={() => navigate('/')} style={{ marginRight: '10px' }}>
          ← Back to Home
        </button>
        <h1 style={{ display: 'inline' }}>Encounter System Debug</h1>
      </div>

      <div style={{ 
        background: '#2a2a2a', 
        padding: '20px', 
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <h2>Test Parameters</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px' }}>Biome:</label>
            <select 
              value={biome} 
              onChange={(e) => setBiome(e.target.value)}
              style={{ width: '100%', padding: '8px' }}
            >
              {biomes.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '5px' }}>Grimness Level:</label>
            <select 
              value={grimnessLevel} 
              onChange={(e) => setGrimnessLevel(e.target.value)}
              style={{ width: '100%', padding: '8px' }}
            >
              {grimnessLevels.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '5px' }}>First Visit:</label>
            <input 
              type="checkbox" 
              checked={isFirstVisit}
              onChange={(e) => setIsFirstVisit(e.target.checked)}
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '5px' }}>Moves Since Last Encounter:</label>
            <input 
              type="number" 
              value={movesSince}
              onChange={(e) => setMovesSince(parseInt(e.target.value) || 0)}
              style={{ width: '100%', padding: '8px' }}
              min="0"
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '5px' }}>Number of Trials:</label>
            <input 
              type="number" 
              value={numTrials}
              onChange={(e) => setNumTrials(parseInt(e.target.value) || 100)}
              style={{ width: '100%', padding: '8px' }}
              min="10"
              max="1000"
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '5px' }}>Number of Moves (for game flow):</label>
            <input 
              type="number" 
              value={numMoves}
              onChange={(e) => setNumMoves(parseInt(e.target.value) || 20)}
              style={{ width: '100%', padding: '8px' }}
              min="5"
              max="100"
            />
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
          <button 
            onClick={runEncounterTest}
            disabled={isRunning}
            style={{ 
              padding: '10px 20px',
              fontSize: '16px',
              cursor: isRunning ? 'not-allowed' : 'pointer',
              flex: 1
            }}
          >
            {isRunning ? 'Running...' : 'Run Encounter Test'}
          </button>
          
          <button 
            onClick={runGameFlowSimulation}
            disabled={isRunning}
            style={{ 
              padding: '10px 20px',
              fontSize: '16px',
              cursor: isRunning ? 'not-allowed' : 'pointer',
              flex: 1,
              background: '#4CAF50'
            }}
          >
            {isRunning ? 'Running...' : 'Simulate Game Flow'}
          </button>
        </div>
      </div>

      {testResults.summary && (
        <>
          <div style={{ 
            background: '#2a2a2a', 
            padding: '20px', 
            borderRadius: '8px',
            marginBottom: '20px'
          }}>
            <h2>Test Results</h2>
            
            <div style={{ marginBottom: '15px' }}>
              <p><strong>Expected Trigger Chance:</strong> {testResults.expectedChance}%</p>
              <p><strong>Actual Trigger Rate:</strong> {testResults.summary.triggerRate}% 
                ({testResults.summary.triggered} / {testResults.summary.totalTrials})
              </p>
            </div>
            
            <h3>Encounter Types Rolled:</h3>
            {Object.keys(testResults.summary.encounterTypes).length > 0 ? (
              <ul>
                {Object.entries(testResults.summary.encounterTypes).map(([type, count]) => (
                  <li key={type}>
                    <strong>{type}:</strong> {count} times 
                    ({(count / testResults.summary.triggered * 100).toFixed(1)}% of encounters)
                  </li>
                ))}
              </ul>
            ) : (
              <p>No encounters triggered</p>
            )}
          </div>

          <div style={{ 
            background: '#2a2a2a', 
            padding: '20px', 
            borderRadius: '8px'
          }}>
            <h3>Detailed Results (showing first 20):</h3>
            <div style={{ 
              maxHeight: '400px', 
              overflowY: 'auto',
              fontSize: '14px'
            }}>
              {testResults.details.slice(0, 20).map((result, idx) => (
                <div 
                  key={idx}
                  style={{ 
                    padding: '8px',
                    marginBottom: '5px',
                    background: result.triggered ? '#1a4d1a' : '#1a1a1a',
                    borderRadius: '4px'
                  }}
                >
                  <strong>Trial {result.trial}:</strong> {result.triggered ? (
                    <>
                      ✓ <strong>{result.name}</strong> ({result.type}) - 
                      Tier: {result.tier}, Hostile: {result.hostile ? 'Yes' : 'No'}
                    </>
                  ) : (
                    '✗ No encounter'
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      
      {gameFlowResults && (
        <>
          <div style={{ 
            background: '#2a2a2a', 
            padding: '20px', 
            borderRadius: '8px',
            marginBottom: '20px'
          }}>
            <h2>Game Flow Simulation Results</h2>
            
            <div style={{ marginBottom: '15px' }}>
              <p><strong>Total Moves:</strong> {gameFlowResults.totalMoves}</p>
              <p><strong>Total Encounters:</strong> {gameFlowResults.totalEncounters} ({gameFlowResults.encounterRate}%)</p>
              <p><strong>Immediate Encounters:</strong> {gameFlowResults.immediateEncounters} (show modal, defer AI)</p>
              <p><strong>Narrative Encounters:</strong> {gameFlowResults.narrativeEncounters} (inject into AI prompt)</p>
            </div>
          </div>

          <div style={{ 
            background: '#2a2a2a', 
            padding: '20px', 
            borderRadius: '8px',
            marginBottom: '20px'
          }}>
            <h3>Move-by-Move Log:</h3>
            <div style={{ 
              maxHeight: '500px', 
              overflowY: 'auto',
              fontSize: '13px'
            }}>
              {gameFlowResults.moveLog.map((move, idx) => (
                <div 
                  key={idx}
                  style={{ 
                    padding: '10px',
                    marginBottom: '5px',
                    background: move.encounterTriggered ? '#1a4d1a' : '#1a1a1a',
                    borderRadius: '4px',
                    borderLeft: move.encounterTriggered ? '4px solid #4CAF50' : '4px solid #666'
                  }}
                >
                  <div style={{ marginBottom: '5px' }}>
                    <strong>Move {move.moveNum}:</strong> {move.biome} 
                    {move.isFirstVisit && <span style={{ color: '#64b5f6' }}> (first visit)</span>}
                    <span style={{ color: '#999', marginLeft: '10px' }}>
                      Moves since last: {move.movesSinceLastEncounter}
                    </span>
                  </div>
                  
                  {move.encounterTriggered ? (
                    <div style={{ marginLeft: '15px' }}>
                      <div style={{ color: '#4CAF50' }}>
                        ✓ <strong>{move.encounterName}</strong> ({move.encounterType})
                      </div>
                      <div style={{ color: '#FFA726', fontSize: '12px', marginTop: '3px' }}>
                        Tier: {move.encounterTier} → {move.flow}
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginLeft: '15px', color: '#999' }}>
                      ✗ {move.flow}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div style={{ 
        background: '#2a2a2a', 
        padding: '20px', 
        borderRadius: '8px',
        marginTop: '20px'
      }}>
        <h3>Base Encounter Chances (before modifiers):</h3>
        <ul>
          <li><strong>Plains:</strong> {(biomeEncounterChance.plains * 100).toFixed(0)}%</li>
          <li><strong>Forest:</strong> {(biomeEncounterChance.forest * 100).toFixed(0)}%</li>
          <li><strong>Mountain:</strong> {(biomeEncounterChance.mountain * 100).toFixed(0)}%</li>
          <li><strong>Beach:</strong> {(biomeEncounterChance.beach * 100).toFixed(0)}%</li>
          <li><strong>Town:</strong> {(biomeEncounterChance.town * 100).toFixed(0)}%</li>
          <li><strong>Water:</strong> 0% (no encounters)</li>
        </ul>
        
        <h3>Revisit Multipliers:</h3>
        <ul>
          <li><strong>Plains:</strong> {revisitEncounterMultiplier.plains}x</li>
          <li><strong>Forest:</strong> {revisitEncounterMultiplier.forest}x</li>
          <li><strong>Mountain:</strong> {revisitEncounterMultiplier.mountain}x</li>
          <li><strong>Beach:</strong> {revisitEncounterMultiplier.beach}x</li>
          <li><strong>Town:</strong> {revisitEncounterMultiplier.town}x</li>
        </ul>
        
        <h3>Game Flow Logic:</h3>
        <ul>
          <li><strong>Immediate encounters:</strong> Modal shown first, AI narrative deferred until after resolution</li>
          <li><strong>Narrative encounters:</strong> Context injected into AI prompt, no modal interruption</li>
          <li><strong>No encounter:</strong> AI narrative generated normally with surrounding terrain</li>
          <li><strong>movesSinceEncounter:</strong> Resets to 0 on any encounter, increments on peaceful moves</li>
        </ul>
      </div>
    </div>
  );
};

export default EncounterDebug;
