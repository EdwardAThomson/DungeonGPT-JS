import React, { useState, useCallback } from 'react';

// --- Milestone data with the new typed structure ---
const SAMPLE_CAMPAIGNS = {
  'heroic-fantasy': {
    name: 'Heroic Fantasy',
    campaignGoal: 'Recover the Crown of Sunfire and defeat the Shadow Overlord.',
    milestones: [
      {
        id: 1, text: 'Find the hidden map in the archives of Oakhaven',
        location: 'Oakhaven', type: 'item', completed: false,
        requires: [],
        trigger: { item: 'hidden_map', action: 'acquire' },
        spawn: { type: 'item', id: 'hidden_map', name: 'Hidden Map', location: 'Oakhaven', context: 'archives' }
      },
      {
        id: 2, text: 'Convince the Silver Guard to join the resistance',
        location: 'Silverton', type: 'narrative', completed: false,
        requires: [],
        trigger: null,
        spawn: { type: 'npc', id: 'silver_guard_captain', name: 'Captain Aldric', location: 'Silverton' }
      },
      {
        id: 3, text: 'Breach the Shadow Fortress in the Cinder Mountains',
        location: 'Cinder Mountains', type: 'location', completed: false,
        requires: [1, 2],
        trigger: { location: 'shadow_fortress', action: 'visit' },
        spawn: { type: 'poi', id: 'shadow_fortress', name: 'Shadow Fortress', location: 'Cinder Mountains' }
      },
      {
        id: 4, text: 'Defeat the Shadow Overlord',
        location: 'Cinder Mountains', type: 'combat', completed: false,
        requires: [3],
        trigger: { enemy: 'shadow_overlord', action: 'defeat' },
        spawn: { type: 'enemy', id: 'shadow_overlord', name: 'Shadow Overlord', location: 'Cinder Mountains', stats: { hp: 250 }, loot: ['crown_of_sunfire'] }
      }
    ]
  },
  'grimdark-survival': {
    name: 'Grimdark Survival',
    campaignGoal: 'Secure a safe haven and cleanse the spreading plague.',
    milestones: [
      {
        id: 1, text: 'Establish a fortified camp in the ruins of Ironhold',
        location: 'Ironhold', type: 'location', completed: false,
        requires: [],
        trigger: { location: 'ironhold_ruins', action: 'visit' },
        spawn: { type: 'poi', id: 'ironhold_ruins', name: 'Ironhold Ruins', location: 'Ironhold' }
      },
      {
        id: 2, text: 'Capture a mutated specimen for the alchemist',
        location: 'Pale-Reach', type: 'item', completed: false,
        requires: [1],
        trigger: { item: 'mutated_specimen', action: 'acquire' },
        spawn: { type: 'item', id: 'mutated_specimen', name: 'Mutated Specimen', location: 'Pale-Reach', context: 'wilderness' }
      },
      {
        id: 3, text: 'Destroy the Rot-Heart in the depths of Rotfall',
        location: 'Rotfall', type: 'combat', completed: false,
        requires: [1, 2],
        trigger: { enemy: 'rot_heart', action: 'defeat' },
        spawn: { type: 'enemy', id: 'rot_heart', name: 'The Rot-Heart', location: 'Rotfall', stats: { hp: 150 } }
      }
    ]
  }
};

// --- Dependency helpers ---
const areRequirementsMet = (milestone, allMilestones) => {
  if (!milestone.requires || milestone.requires.length === 0) return true;
  return milestone.requires.every(reqId =>
    allMilestones.find(m => m.id === reqId)?.completed
  );
};

const getMilestoneState = (milestone, allMilestones) => {
  if (milestone.completed) return 'completed';
  if (!areRequirementsMet(milestone, allMilestones)) return 'locked';
  return 'active';
};

// --- Core milestone checker (the engine logic we're prototyping) ---
const checkMilestones = (milestones, event) => {
  for (const milestone of milestones) {
    if (milestone.completed) continue;
    if (milestone.type === 'narrative') continue;
    if (!areRequirementsMet(milestone, milestones)) continue;

    const trigger = milestone.trigger;
    if (!trigger) continue;

    let completed = false;

    switch (milestone.type) {
      case 'item':
        completed = event.type === 'item_acquired' && event.id === trigger.item;
        break;
      case 'combat':
        completed = event.type === 'enemy_defeated' && event.id === trigger.enemy;
        break;
      case 'location':
        completed = event.type === 'location_visited' && event.id === trigger.location;
        break;
      default:
        break;
    }

    if (completed) {
      return milestone.id;
    }
  }
  // Check if event matched a locked milestone's trigger (for blocked feedback)
  for (const milestone of milestones) {
    if (milestone.completed || milestone.type === 'narrative') continue;
    if (areRequirementsMet(milestone, milestones)) continue;
    const trigger = milestone.trigger;
    if (!trigger) continue;
    const wouldMatch =
      (milestone.type === 'item' && event.type === 'item_acquired' && event.id === trigger.item) ||
      (milestone.type === 'combat' && event.type === 'enemy_defeated' && event.id === trigger.enemy) ||
      (milestone.type === 'location' && event.type === 'location_visited' && event.id === trigger.location);
    if (wouldMatch) return { blocked: true, milestoneId: milestone.id };
  }
  return null;
};

// --- Simulated game state for spawned entities ---
const buildSpawnedEntities = (milestones) => {
  const entities = [];
  for (const m of milestones) {
    if (m.spawn) {
      entities.push({
        ...m.spawn,
        milestoneId: m.id,
        milestoneText: m.text,
        active: !m.completed
      });
    }
  }
  return entities;
};

// --- Component ---
const CampaignMilestoneTest = () => {
  const [selectedCampaign, setSelectedCampaign] = useState('heroic-fantasy');
  const [milestones, setMilestones] = useState(SAMPLE_CAMPAIGNS['heroic-fantasy'].milestones);
  const [eventLog, setEventLog] = useState([]);
  const [lastResult, setLastResult] = useState(null);

  const campaign = SAMPLE_CAMPAIGNS[selectedCampaign];
  const spawnedEntities = buildSpawnedEntities(milestones);
  const allMechanicalComplete = milestones.filter(m => m.type !== 'narrative').every(m => m.completed);
  const allComplete = milestones.every(m => m.completed);

  const switchCampaign = useCallback((id) => {
    setSelectedCampaign(id);
    setMilestones(SAMPLE_CAMPAIGNS[id].milestones.map(m => ({ ...m, completed: false })));
    setEventLog([]);
    setLastResult(null);
  }, []);

  const simulateEvent = useCallback((event) => {
    const result = checkMilestones(milestones, event);
    let logResult;

    if (result && typeof result === 'object' && result.blocked) {
      const blockedMilestone = milestones.find(m => m.id === result.milestoneId);
      const unmetReqs = (blockedMilestone?.requires || [])
        .filter(reqId => !milestones.find(m => m.id === reqId)?.completed)
        .map(reqId => milestones.find(m => m.id === reqId)?.text || `#${reqId}`);
      logResult = `BLOCKED — Milestone #${result.milestoneId} requires: ${unmetReqs.join(', ')}`;
      setLastResult({ type: 'blocked', milestone: blockedMilestone, unmetReqs });
    } else if (result) {
      const updatedMilestones = milestones.map(m => m.id === result ? { ...m, completed: true } : m);
      const isCampaignComplete = updatedMilestones.every(m => m.completed);
      logResult = isCampaignComplete ? `Milestone #${result} completed! CAMPAIGN COMPLETE!` : `Milestone #${result} completed!`;
      setMilestones(updatedMilestones);
      const completedMilestone = milestones.find(m => m.id === result);
      setLastResult(isCampaignComplete
        ? { type: 'campaign_complete', milestone: completedMilestone }
        : { type: 'success', milestone: completedMilestone });
    } else {
      logResult = 'No milestone matched';
      setLastResult({ type: 'miss', event });
    }

    setEventLog(prev => [{
      timestamp: new Date().toLocaleTimeString(),
      event,
      result: logResult
    }, ...prev]);
  }, [milestones]);

  const manualNarrativeComplete = useCallback((milestoneId) => {
    const updatedMilestones = milestones.map(m => m.id === milestoneId ? { ...m, completed: true } : m);
    const isCampaignComplete = updatedMilestones.every(m => m.completed);
    setMilestones(updatedMilestones);
    const milestone = milestones.find(m => m.id === milestoneId);
    setEventLog(prev => [{
      timestamp: new Date().toLocaleTimeString(),
      event: { type: 'narrative_resolved', id: milestone?.spawn?.id },
      result: isCampaignComplete ? `Narrative milestone #${milestoneId} resolved! CAMPAIGN COMPLETE!` : `Narrative milestone #${milestoneId} manually resolved`
    }, ...prev]);
    setLastResult(isCampaignComplete
      ? { type: 'campaign_complete', milestone }
      : { type: 'narrative', milestone });
  }, [milestones]);

  const resetAll = () => {
    setMilestones(SAMPLE_CAMPAIGNS[selectedCampaign].milestones.map(m => ({ ...m, completed: false })));
    setEventLog([]);
    setLastResult(null);
  };

  const typeColors = {
    item: '#4fc3f7',
    combat: '#ef5350',
    location: '#66bb6a',
    narrative: '#ffa726'
  };

  const typeIcons = {
    item: '📦',
    combat: '⚔️',
    location: '📍',
    narrative: '💬'
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'var(--body-font)', color: 'var(--text)' }}>
      <h1 style={{ color: 'var(--primary)', fontFamily: 'var(--header-font)' }}>Campaign Milestone Test</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
        Prototype for the new typed milestone system. Simulate game events and watch milestones complete deterministically.
      </p>

      {/* Campaign Selector */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        {Object.entries(SAMPLE_CAMPAIGNS).map(([id, c]) => (
          <button
            key={id}
            onClick={() => switchCampaign(id)}
            style={{
              padding: '10px 20px', borderRadius: '6px', border: `2px solid ${selectedCampaign === id ? 'var(--primary)' : 'var(--border)'}`,
              background: selectedCampaign === id ? 'rgba(212,175,55,0.15)' : 'var(--surface)',
              color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--header-font)', fontSize: '14px', fontWeight: 600
            }}
          >
            {c.name}
          </button>
        ))}
        <button onClick={resetAll} style={{
          marginLeft: 'auto', padding: '10px 16px', borderRadius: '6px', border: '1px solid var(--border)',
          background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px'
        }}>
          Reset All
        </button>
      </div>

      {/* Campaign Goal */}
      <div style={{ padding: '12px 16px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '24px' }}>
        <strong>Campaign Goal:</strong> {campaign.campaignGoal}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Left Column: Milestones & Spawned Entities */}
        <div>
          {/* Milestone Status */}
          <div style={{ padding: '16px', background: 'var(--surface)', borderRadius: '8px', border: '2px solid var(--primary)', marginBottom: '20px' }}>
            <h2 style={{ marginTop: 0, color: 'var(--primary)', fontFamily: 'var(--header-font)', fontSize: '18px' }}>Milestones</h2>

            {allComplete && (
              <div style={{ margin: '0 0 12px 0', padding: '10px', background: 'rgba(76,175,80,0.15)', borderLeft: '4px solid #4caf50', borderRadius: '6px', textAlign: 'center' }}>
                <strong style={{ color: '#4caf50' }}>CAMPAIGN COMPLETE</strong>
              </div>
            )}

            {milestones.map((m) => {
              const state = getMilestoneState(m, milestones);
              const isLocked = state === 'locked';
              const borderColor = state === 'completed' ? '#4caf50' : isLocked ? '#666' : typeColors[m.type];
              const unmetReqs = isLocked
                ? (m.requires || []).filter(reqId => !milestones.find(r => r.id === reqId)?.completed)
                    .map(reqId => milestones.find(r => r.id === reqId))
                : [];

              return (
                <div key={m.id} style={{
                  padding: '10px 12px', marginBottom: '8px', borderRadius: '6px',
                  background: state === 'completed' ? 'rgba(76,175,80,0.1)' : isLocked ? 'rgba(100,100,100,0.08)' : 'var(--bg)',
                  borderLeft: `4px solid ${borderColor}`,
                  border: `1px solid ${state === 'completed' ? '#4caf50' : 'var(--border)'}`,
                  borderLeftWidth: '4px',
                  opacity: isLocked ? 0.6 : 1
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ marginRight: '8px' }}>
                        {state === 'completed' ? '✓' : isLocked ? '🔒' : typeIcons[m.type]}
                      </span>
                      <span style={{ textDecoration: state === 'completed' ? 'line-through' : 'none', opacity: state === 'completed' ? 0.6 : 1 }}>
                        {m.text}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {isLocked && (
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: '#66666622', color: '#999', fontWeight: 600, textTransform: 'uppercase' }}>
                          locked
                        </span>
                      )}
                      <span style={{
                        fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
                        background: `${typeColors[m.type]}22`, color: typeColors[m.type],
                        fontWeight: 600, textTransform: 'uppercase'
                      }}>
                        {m.type}
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Location: {m.location}
                    {m.trigger && <> | Trigger: <code style={{ fontSize: '11px' }}>{m.trigger.action}({Object.values(m.trigger)[0]})</code></>}
                  </div>
                  {isLocked && unmetReqs.length > 0 && (
                    <div style={{ fontSize: '11px', color: '#ef5350', marginTop: '4px' }}>
                      Requires: {unmetReqs.map(r => r?.text || '?').join(' + ')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Spawned Entities */}
          <div style={{ padding: '16px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <h2 style={{ marginTop: 0, color: 'var(--primary)', fontFamily: 'var(--header-font)', fontSize: '18px' }}>Spawned Entities</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: 0 }}>
              These would be placed in the world at map generation time.
            </p>
            {spawnedEntities.map((e, i) => (
              <div key={i} style={{
                padding: '8px 12px', marginBottom: '6px', borderRadius: '6px',
                background: e.active ? 'var(--bg)' : 'rgba(76,175,80,0.05)',
                border: `1px solid ${e.active ? 'var(--border)' : '#4caf5044'}`,
                opacity: e.active ? 1 : 0.5
              }}>
                <div style={{ fontSize: '13px' }}>
                  <strong>{e.name}</strong> <span style={{ color: 'var(--text-secondary)' }}>({e.type})</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  ID: <code>{e.id}</code> | Location: {e.location}
                  {e.stats && <> | HP: {e.stats.hp}</>}
                  {e.context && <> | Context: {e.context}</>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Event Simulation & Log */}
        <div>
          {/* Event Simulator */}
          <div style={{ padding: '16px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '20px' }}>
            <h2 style={{ marginTop: 0, color: 'var(--primary)', fontFamily: 'var(--header-font)', fontSize: '18px' }}>Simulate Game Events</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: 0 }}>
              Click to fire events as if the game engine detected them. Watch milestones complete automatically.
            </p>

            {milestones.filter(m => !m.completed).map((m) => {
              const state = getMilestoneState(m, milestones);
              const isLocked = state === 'locked';

              if (m.type === 'narrative') {
                return (
                  <div key={m.id} style={{ marginBottom: '8px' }}>
                    <button
                      onClick={() => !isLocked && manualNarrativeComplete(m.id)}
                      disabled={isLocked}
                      style={{
                        width: '100%', padding: '10px 14px', borderRadius: '6px',
                        cursor: isLocked ? 'not-allowed' : 'pointer',
                        border: `1px solid ${isLocked ? '#666' : typeColors.narrative}`,
                        background: isLocked ? 'rgba(100,100,100,0.05)' : `${typeColors.narrative}11`,
                        color: 'var(--text)', textAlign: 'left', fontSize: '13px',
                        opacity: isLocked ? 0.5 : 1
                      }}
                    >
                      <span style={{ marginRight: '6px' }}>{isLocked ? '🔒' : '💬'}</span>
                      <strong>{isLocked ? 'Locked' : 'Resolve Narrative'}:</strong> {m.text}
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {isLocked ? 'Prerequisites not met' : '(Would require NPC conversation system — manually resolved for now)'}
                      </div>
                    </button>
                  </div>
                );
              }

              const eventType = m.type === 'item' ? 'item_acquired' : m.type === 'combat' ? 'enemy_defeated' : 'location_visited';
              const eventId = m.type === 'item' ? m.trigger.item : m.type === 'combat' ? m.trigger.enemy : m.trigger.location;

              return (
                <div key={m.id} style={{ marginBottom: '8px' }}>
                  <button
                    onClick={() => simulateEvent({ type: eventType, id: eventId })}
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: '6px', cursor: 'pointer',
                      border: `1px solid ${isLocked ? '#ef535066' : typeColors[m.type]}`,
                      background: isLocked ? 'rgba(239,83,80,0.05)' : `${typeColors[m.type]}11`,
                      color: 'var(--text)', textAlign: 'left', fontSize: '13px'
                    }}
                  >
                    <span style={{ marginRight: '6px' }}>{isLocked ? '🔒' : typeIcons[m.type]}</span>
                    <strong>{isLocked ? 'Try (Blocked):' : 'Fire:'}</strong> <code style={{ fontSize: '12px' }}>{eventType}("{eventId}")</code>
                    <div style={{ fontSize: '11px', color: isLocked ? '#ef5350' : 'var(--text-secondary)', marginTop: '2px' }}>
                      {isLocked ? `BLOCKED — prerequisites not met` : `Should complete: ${m.text}`}
                    </div>
                  </button>
                </div>
              );
            })}

            {/* Wrong event button for testing misses */}
            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
              <button
                onClick={() => simulateEvent({ type: 'item_acquired', id: 'random_potion' })}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: '6px', cursor: 'pointer',
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text-secondary)', textAlign: 'left', fontSize: '13px'
                }}
              >
                <span style={{ marginRight: '6px' }}>❌</span>
                <strong>Fire irrelevant event:</strong> <code style={{ fontSize: '12px' }}>item_acquired("random_potion")</code>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Should NOT complete any milestone
                </div>
              </button>
            </div>
          </div>

          {/* Last Result */}
          {lastResult && (
            <div style={{
              padding: '12px 16px', marginBottom: '20px', borderRadius: '8px',
              background: lastResult.type === 'campaign_complete' ? 'rgba(212,175,55,0.2)' : lastResult.type === 'success' ? 'rgba(76,175,80,0.15)' : lastResult.type === 'narrative' ? 'rgba(255,167,38,0.15)' : lastResult.type === 'blocked' ? 'rgba(239,83,80,0.15)' : 'rgba(239,83,80,0.1)',
              border: `2px solid ${lastResult.type === 'campaign_complete' ? 'var(--primary)' : lastResult.type === 'success' ? '#4caf50' : lastResult.type === 'narrative' ? '#ffa726' : lastResult.type === 'blocked' ? '#ef5350' : '#ef535044'}`
            }}>
              {lastResult.type === 'campaign_complete' && (
                <>
                  <strong style={{ color: 'var(--primary)', fontSize: '16px' }}>CAMPAIGN COMPLETE!</strong>
                  <div style={{ fontSize: '13px', marginTop: '4px' }}>Final milestone achieved: {lastResult.milestone?.text}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    All milestones completed. The AI would narrate the victory and campaign epilogue.
                  </div>
                </>
              )}
              {lastResult.type === 'success' && (
                <>
                  <strong style={{ color: '#4caf50' }}>Milestone Completed!</strong>
                  <div style={{ fontSize: '13px', marginTop: '4px' }}>{lastResult.milestone.text}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    The AI would now narrate this achievement instead of deciding it happened.
                  </div>
                </>
              )}
              {lastResult.type === 'narrative' && (
                <>
                  <strong style={{ color: '#ffa726' }}>Narrative Milestone Resolved</strong>
                  <div style={{ fontSize: '13px', marginTop: '4px' }}>{lastResult.milestone.text}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    In the real game, this would require an NPC conversation with structured outcomes.
                  </div>
                </>
              )}
              {lastResult.type === 'blocked' && (
                <>
                  <strong style={{ color: '#ef5350' }}>Blocked — Prerequisites Not Met</strong>
                  <div style={{ fontSize: '13px', marginTop: '4px' }}>{lastResult.milestone?.text}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Requires completing first: {lastResult.unmetReqs?.join(', ')}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', fontStyle: 'italic' }}>
                    In the game, this entity wouldn't be spawned yet or the location would be inaccessible.
                  </div>
                </>
              )}
              {lastResult.type === 'miss' && (
                <>
                  <strong style={{ color: '#ef5350' }}>No Match</strong>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Event <code>{lastResult.event.type}("{lastResult.event.id}")</code> did not match any active milestone trigger.
                  </div>
                </>
              )}
            </div>
          )}

          {/* Event Log */}
          <div style={{ padding: '16px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <h2 style={{ marginTop: 0, color: 'var(--primary)', fontFamily: 'var(--header-font)', fontSize: '18px' }}>Event Log</h2>
            {eventLog.length === 0 && (
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                No events fired yet. Use the buttons above to simulate game events.
              </div>
            )}
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {eventLog.map((entry, i) => (
                <div key={i} style={{
                  padding: '8px 10px', marginBottom: '4px', borderRadius: '4px',
                  background: 'var(--bg)', border: '1px solid var(--border)', fontSize: '12px'
                }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{entry.timestamp}</span>
                  {' '}<code>{entry.event.type}("{entry.event.id}")</code>
                  {' '}<span style={{ color: entry.result.includes('CAMPAIGN COMPLETE') ? 'var(--primary)' : entry.result.includes('completed') || entry.result.includes('resolved') ? '#4caf50' : entry.result.includes('BLOCKED') ? '#ef5350' : 'var(--text-secondary)' }}>
                    → {entry.result}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Design Notes */}
      <div style={{ marginTop: '30px', padding: '16px', background: 'rgba(212,175,55,0.08)', border: '1px solid var(--primary)', borderRadius: '8px' }}>
        <h3 style={{ marginTop: 0, color: 'var(--primary)', fontFamily: 'var(--header-font)' }}>How This Differs from MilestoneTest</h3>
        <ul style={{ marginBottom: 0, fontSize: '14px', lineHeight: '1.8' }}>
          <li><strong>MilestoneTest:</strong> AI decides completion via text markers → regex detection → fuzzy match</li>
          <li><strong>This page:</strong> Game engine fires events → deterministic trigger check → exact ID match</li>
          <li>Mechanical milestones (item/combat/location) never depend on AI judgment</li>
          <li>Narrative milestones are acknowledged as a separate, harder problem</li>
          <li>Entities are spawned at map generation — the game world contains what the quest needs</li>
          <li>Milestones have a <code style={{ background: 'var(--bg)', padding: '2px 6px', borderRadius: '3px', border: '1px solid var(--border)' }}>requires</code> field — locked milestones can't complete until prerequisites are met</li>
          <li>Locked entities wouldn't be spawned (or would be inaccessible) until prerequisites unlock them</li>
        </ul>
      </div>
    </div>
  );
};

export default CampaignMilestoneTest;
