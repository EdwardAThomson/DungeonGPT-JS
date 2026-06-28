import React, { useState } from 'react';
import { SIDE_QUESTS, initialSideQuests } from '../data/sideQuests';
import {
  acceptSideQuest, checkSideQuestEvent, turnInQuest, getActiveSideQuests, getAvailableSideQuests,
  getCompletedSideQuests, getSideQuestProgress, getActiveSiteObjectives,
} from '../game/questEngine';

// Debug harness for the side-quest loop: accept quests, simulate the completion event for
// each step, and watch steps/quests complete with their rewards. Exercises questEngine
// without needing a full campaign. The in-game flow is: village inn -> Journal -> site.

const card = { border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', padding: '12px 14px', marginBottom: 10 };
const btn = (primary) => ({
  padding: '6px 12px', border: `1px solid ${primary ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 6,
  background: primary ? 'var(--primary)' : 'var(--surface)', color: primary ? '#fff' : 'var(--text)', cursor: 'pointer', fontSize: 13,
});

const eventForStep = (step) => {
  if (step.trigger?.item) return { type: 'item_acquired', itemId: step.trigger.item };
  if (step.trigger?.enemy) return { type: 'enemy_defeated', enemyId: step.trigger.enemy };
  if (step.trigger?.location) return { type: 'location_visited', locationId: step.trigger.location };
  return null;
};

const QuestTest = () => {
  const [sideQuests, setSideQuests] = useState(initialSideQuests);
  const [log, setLog] = useState([]);

  const addLog = (lines) => setLog((prev) => [...lines, ...prev].slice(0, 30));

  const accept = (id) => {
    setSideQuests((prev) => acceptSideQuest(prev, id));
    addLog([`📜 Accepted: ${SIDE_QUESTS.find((q) => q.id === id)?.title}`]);
  };

  const completeStep = (step) => {
    const event = eventForStep(step);
    if (!event) return;
    const { updatedSideQuests, completions } = checkSideQuestEvent(sideQuests, event, 99);
    setSideQuests(updatedSideQuests);
    addLog([
      `⚙️ Event: ${event.type} (${event.itemId || event.enemyId || event.locationId})`,
      ...completions.map((c) => (c.questCompleted
        ? `🎉 Completed quest "${c.title}" — rewards ${JSON.stringify(c.questRewards)}`
        : `✓ Step "${c.milestone.text}" — rewards ${JSON.stringify(c.rewards)}`)),
    ]);
  };

  const turnIn = (step) => {
    const ti = step.trigger.turnIn;
    const buildingType = Array.isArray(ti.building) ? ti.building[0] : ti.building;
    const { updatedSideQuests, completions } = turnInQuest(sideQuests, { buildingType, townName: ti.location });
    setSideQuests(updatedSideQuests);
    addLog(completions.length
      ? [`🏛️ Turned in at ${buildingType}`, ...completions.map((c) => (c.questCompleted
        ? `🎉 Completed quest "${c.title}" — rewards ${JSON.stringify(c.questRewards)}`
        : `✓ Step "${c.milestone.text}"`))]
      : [`🏛️ Nothing to turn in at ${buildingType} (finish the objective first)`]);
  };

  const reset = () => { setSideQuests(initialSideQuests()); setLog([]); };

  const active = getActiveSideQuests(sideQuests);
  const available = getAvailableSideQuests(sideQuests);
  const completed = getCompletedSideQuests(sideQuests);
  const siteObjectives = getActiveSiteObjectives(sideQuests);

  return (
    <div>
      <h2 style={{ marginTop: 0, fontFamily: 'var(--header-font)' }}>Quest Test <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>— side-quest accept / complete loop</span></h2>
      <p style={{ color: 'var(--text-muted,#888)', fontSize: 13 }}>
        Accept a quest (as if from an inn), then "Complete step" to simulate reaching its
        objective in a site. Watch steps/quests complete with rewards in the log.
      </p>
      <button style={btn(false)} onClick={reset}>Reset</button>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap', marginTop: 14 }}>
        <div style={{ flex: '1 1 360px', minWidth: 320 }}>
          <h3>Available ({available.length})</h3>
          {available.map((q) => (
            <div key={q.id} style={card}>
              <div style={{ fontWeight: 700 }}>{q.title}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic', margin: '4px 0 8px' }}>"{q.giver?.hook || q.description}"</div>
              <button style={btn(true)} onClick={() => accept(q.id)}>Accept</button>
            </div>
          ))}

          <h3>Active ({active.length})</h3>
          {active.map((q) => {
            const { done, total } = getSideQuestProgress(q);
            return (
              <div key={q.id} style={card}>
                <div style={{ fontWeight: 700 }}>{q.title} <span style={{ fontWeight: 400, color: 'var(--text-secondary)', fontSize: 13 }}>({done}/{total})</span></div>
                {q.milestones.map((m) => {
                  const isTurnIn = !!m.trigger?.turnIn;
                  const need = m.trigger?.count;
                  return (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <span style={{ flex: 1, textDecoration: m.completed ? 'line-through' : 'none', color: m.completed ? 'var(--text-secondary)' : 'var(--text)' }}>
                        {m.completed ? '✓' : '•'} {m.text}
                        {need ? ` (${m.progress || 0}/${need})` : ''}
                        {m.site && <em style={{ color: 'var(--text-secondary)' }}> [{m.site.type}: {m.site.objectiveType}]</em>}
                        {isTurnIn && <em style={{ color: 'var(--text-secondary)' }}> [turn-in]</em>}
                      </span>
                      {!m.completed && (isTurnIn
                        ? <button style={btn(true)} onClick={() => turnIn(m)}>Turn in</button>
                        : <button style={btn(false)} onClick={() => completeStep(m)}>{need ? '+1' : 'Complete step'}</button>)}
                    </div>
                  );
                })}
              </div>
            );
          })}

          <h3>Completed ({completed.length})</h3>
          {completed.map((q) => <div key={q.id} style={{ ...card, opacity: 0.7 }}>✓ {q.title}</div>)}
        </div>

        <div style={{ flex: '1 1 300px', minWidth: 280 }}>
          <h3>Active site objectives</h3>
          <pre style={{ ...card, fontSize: 12, whiteSpace: 'pre-wrap' }}>{JSON.stringify(siteObjectives, null, 2)}</pre>
          <h3>Log</h3>
          <div style={card}>
            {log.length === 0 ? <span style={{ color: 'var(--text-secondary)' }}>No events yet.</span>
              : log.map((l, i) => <div key={i} style={{ fontSize: 13, marginBottom: 4 }}>{l}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuestTest;
