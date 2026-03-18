import React, { useState, useCallback } from 'react';
import {
  areRequirementsMet,
  getMilestoneState,
  checkMilestoneCompletion,
  completeNarrativeMilestone,
  getCampaignProgress,
  getMilestoneRewards,
  getSpawnRequirements
} from '../game/milestoneEngine';
import { spawnWorldMapEntities } from '../game/milestoneSpawner';
import { generateMapData } from '../utils/mapGenerator';
import { getMilestoneLocationNames } from '../game/milestoneEngine';
import WorldMapDisplay from '../components/WorldMapDisplay';
import SafeMarkdownMessage from '../components/SafeMarkdownMessage';
import { llmService } from '../services/llmService';
import { DM_PROTOCOL } from '../data/prompts';
import { buildModelOptions, resolveProviderAndModel } from '../llm/modelResolver';
import { getDefaultProvider } from '../llm/modelResolver';

// --- Milestone data with the full structure ---
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
        spawn: { type: 'item', id: 'hidden_map', name: 'Hidden Map', location: 'Oakhaven' },
        building: { type: 'archives', name: 'The Great Archives', location: 'Oakhaven' },
        rewards: { xp: 100, gold: '2d10', items: [] },
        minLevel: null
      },
      {
        id: 2, text: 'Convince the Silver Guard to join the resistance',
        location: 'Silverton', type: 'narrative', completed: false,
        requires: [],
        trigger: null,
        spawn: { type: 'npc', id: 'silver_guard_captain', name: 'Captain Aldric', location: 'Silverton', role: 'Guard', personality: 'proud, honorable, skeptical of outsiders' },
        building: { type: 'barracks', name: 'Silver Guard Barracks', location: 'Silverton' },
        rewards: { xp: 150, gold: '1d20', items: ['silver_guard_seal'] },
        minLevel: null
      },
      {
        id: 3, text: 'Breach the Shadow Fortress in the Cinder Mountains',
        location: 'Cinder Mountains', type: 'location', completed: false,
        requires: [1, 2],
        trigger: { location: 'shadow_fortress', action: 'visit' },
        spawn: { type: 'poi', id: 'shadow_fortress', name: 'Shadow Fortress', location: 'Cinder Mountains' },
        building: null,
        rewards: { xp: 200, gold: '3d20', items: ['fortress_key'] },
        minLevel: 3
      },
      {
        id: 4, text: 'Defeat the Shadow Overlord',
        location: 'Cinder Mountains', type: 'combat', completed: false,
        requires: [3],
        trigger: { enemy: 'shadow_overlord', action: 'defeat' },
        spawn: { type: 'enemy', id: 'shadow_overlord', name: 'Shadow Overlord', location: 'Cinder Mountains' },
        building: null,
        encounter: {
          name: 'Shadow Overlord', icon: '👑', encounterTier: 'boss',
          difficulty: 'deadly', multiRound: true, enemyHP: 250,
          suggestedActions: [
            { label: 'Fight', skill: 'Athletics', description: 'Engage in direct combat' },
            { label: 'Use the Map', skill: 'Investigation', description: 'Exploit weaknesses from the hidden map' },
            { label: 'Rally the Guard', skill: 'Persuasion', description: 'Command the Silver Guard to flank' }
          ],
          rewards: { xp: 500, gold: '5d20', items: ['crown_of_sunfire'] }
        },
        rewards: { xp: 300, gold: '3d20', items: [] },
        minLevel: 5
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
        spawn: { type: 'poi', id: 'ironhold_ruins', name: 'Ironhold Ruins', location: 'Ironhold' },
        building: null,
        rewards: { xp: 75, gold: '1d10', items: ['camp_supplies'] },
        minLevel: null
      },
      {
        id: 2, text: 'Capture a mutated specimen for the alchemist',
        location: 'Pale-Reach', type: 'item', completed: false,
        requires: [1],
        trigger: { item: 'mutated_specimen', action: 'acquire' },
        spawn: { type: 'item', id: 'mutated_specimen', name: 'Mutated Specimen', location: 'Pale-Reach' },
        building: { type: 'alchemist_lab', name: 'The Blighted Laboratory', location: 'Pale-Reach' },
        rewards: { xp: 125, gold: '2d10', items: ['antiplague_vial'] },
        minLevel: 2
      },
      {
        id: 3, text: 'Destroy the Rot-Heart in the depths of Rotfall',
        location: 'Rotfall', type: 'combat', completed: false,
        requires: [1, 2],
        trigger: { enemy: 'rot_heart', action: 'defeat' },
        spawn: { type: 'enemy', id: 'rot_heart', name: 'The Rot-Heart', location: 'Rotfall' },
        building: null,
        encounter: {
          name: 'The Rot-Heart', icon: '🫀', encounterTier: 'boss',
          difficulty: 'hard', multiRound: true, enemyHP: 150,
          suggestedActions: [
            { label: 'Strike', skill: 'Athletics', description: 'Attack the pulsing core directly' },
            { label: 'Apply Antiplague', skill: 'Medicine', description: 'Use the vial to weaken it' },
            { label: 'Burn It', skill: 'Survival', description: 'Set fire to the rot tendrils' }
          ],
          rewards: { xp: 350, gold: '3d20', items: ['purified_heart_shard'] }
        },
        rewards: { xp: 200, gold: '2d20', items: [] },
        minLevel: 4
      }
    ]
  }
};

// --- Styles ---
const typeColors = { item: '#4fc3f7', combat: '#ef5350', location: '#66bb6a', narrative: '#ffa726' };
const typeIcons = { item: '📦', combat: '⚔️', location: '📍', narrative: '💬' };
const pillStyle = (bg, color) => ({ fontSize: '10px', padding: '1px 6px', borderRadius: '8px', background: bg, color, fontWeight: 600, display: 'inline-block' });
const sectionBox = (extra = {}) => ({ padding: '14px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)', ...extra });
const sectionTitle = { marginTop: 0, marginBottom: '10px', color: 'var(--primary)', fontFamily: 'var(--header-font)', fontSize: '15px' };
const labelStyle = { fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', marginBottom: '2px' };
const codeStyle = { fontSize: '11px', background: 'rgba(0,0,0,0.3)', padding: '1px 4px', borderRadius: '3px', color: '#ddd' };

const MILESTONE_COMPLETE_REGEX = /\[COMPLETE_MILESTONE:\s*([\s\S]+?)\]/i;
const CAMPAIGN_COMPLETE_REGEX = /\[COMPLETE_CAMPAIGN\]/i;

// --- Milestone card (left column) ---
const MilestoneCard = ({ m, milestones, selected, onSelect }) => {
  const state = getMilestoneState(m, milestones);
  const isLocked = state === 'locked';
  const borderColor = state === 'completed' ? '#4caf50' : isLocked ? '#555' : typeColors[m.type];
  const unmetReqs = isLocked
    ? (m.requires || []).filter(rid => !milestones.find(r => r.id === rid)?.completed).map(rid => milestones.find(r => r.id === rid))
    : [];

  return (
    <div onClick={() => onSelect(m.id)} style={{
      padding: '8px 10px', marginBottom: '5px', borderRadius: '6px', cursor: 'pointer',
      background: selected ? 'rgba(212,175,55,0.1)' : state === 'completed' ? 'rgba(76,175,80,0.06)' : isLocked ? 'rgba(100,100,100,0.05)' : 'var(--bg)',
      borderLeft: `4px solid ${borderColor}`,
      border: `1px solid ${selected ? 'var(--primary)' : state === 'completed' ? '#4caf5044' : 'var(--border)'}`,
      borderLeftWidth: '4px', opacity: isLocked ? 0.55 : 1
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
        <div style={{ flex: 1, fontSize: '12px' }}>
          <span style={{ marginRight: '4px' }}>{state === 'completed' ? '✓' : isLocked ? '🔒' : typeIcons[m.type]}</span>
          <span style={{ fontWeight: 600, textDecoration: state === 'completed' ? 'line-through' : 'none', opacity: state === 'completed' ? 0.6 : 1 }}>
            {m.text}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
          {isLocked && <span style={pillStyle('#66666622', '#999')}>locked</span>}
          <span style={pillStyle(`${typeColors[m.type]}22`, typeColors[m.type])}>{m.type}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px', fontSize: '10px', color: 'var(--text-secondary)' }}>
        <span>📍 {m.location}</span>
        {m.minLevel && <span>⚔️ Lv.{m.minLevel}+</span>}
        {m.requires.length > 0 && <span>🔗 #{m.requires.join(', #')}</span>}
        {m.rewards?.xp > 0 && <span>🎁 {m.rewards.xp} XP</span>}
        {m.encounter && <span>👑 {m.encounter.enemyHP} HP</span>}
        {m.building && <span>🏛️ {m.building.type}</span>}
      </div>
      {isLocked && unmetReqs.length > 0 && (
        <div style={{ fontSize: '10px', color: '#ef5350', marginTop: '3px' }}>
          Needs: {unmetReqs.map(r => r?.text || '?').join(' + ')}
        </div>
      )}
    </div>
  );
};

// --- Detail panel ---
const MilestoneDetail = ({ m, milestones }) => {
  if (!m) return <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px', fontStyle: 'italic' }}>Select a milestone</div>;

  const state = getMilestoneState(m, milestones);
  const reqs = (m.requires || []).map(id => milestones.find(r => r.id === id)).filter(Boolean);

  const Row = ({ k, v, color }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', fontSize: '12px' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
      <span style={{ color: color || 'var(--text)', fontWeight: 500 }}>{v}</span>
    </div>
  );

  const SubSection = ({ title, children }) => (
    <div style={{ marginBottom: '10px' }}>
      <div style={labelStyle}>{title}</div>
      {children}
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '10px' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--header-font)', color: 'var(--primary)' }}>
          {typeIcons[m.type]} {m.text}
        </div>
        <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
          <span style={pillStyle(`${typeColors[m.type]}22`, typeColors[m.type])}>{m.type}</span>
          <span style={pillStyle(
            state === 'completed' ? '#4caf5022' : state === 'locked' ? '#66666622' : '#66bb6a22',
            state === 'completed' ? '#4caf50' : state === 'locked' ? '#999' : '#66bb6a'
          )}>{state}</span>
        </div>
      </div>

      <SubSection title="Location">
        <Row k="Area" v={m.location} />
        {m.building && <Row k="Building" v={`${m.building.name} (${m.building.type})`} />}
      </SubSection>

      {m.minLevel && (
        <SubSection title="Level Requirement">
          <Row k="Minimum" v={`Level ${m.minLevel}+`} color={typeColors.combat} />
        </SubSection>
      )}

      <SubSection title="Prerequisites">
        {reqs.length === 0
          ? <div style={{ fontSize: '12px', color: '#66bb6a' }}>None</div>
          : reqs.map(r => (
            <div key={r.id} style={{ fontSize: '12px', display: 'flex', gap: '4px', alignItems: 'center' }}>
              <span>{r.completed ? '✓' : '○'}</span>
              <span style={{ opacity: r.completed ? 0.5 : 1, textDecoration: r.completed ? 'line-through' : 'none' }}>#{r.id}: {r.text}</span>
            </div>
          ))
        }
      </SubSection>

      <SubSection title="Spawn">
        <Row k="Type" v={m.spawn.type} />
        <Row k="ID" v={m.spawn.id} />
        <Row k="Name" v={m.spawn.name} />
        {m.spawn.role && <Row k="NPC Role" v={m.spawn.role} />}
        {m.spawn.personality && <Row k="Personality" v={m.spawn.personality} />}
      </SubSection>

      {m.trigger && (
        <SubSection title="Trigger">
          <div style={{ padding: '3px 6px', background: 'var(--bg)', borderRadius: '4px', border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: '11px' }}>
            {m.trigger.action}(<span style={{ color: typeColors[m.type] }}>{Object.values(m.trigger)[0]}</span>)
          </div>
        </SubSection>
      )}

      {m.encounter && (
        <SubSection title="Boss Encounter">
          <Row k="Name" v={`${m.encounter.icon} ${m.encounter.name}`} />
          <Row k="Difficulty" v={m.encounter.difficulty} color={typeColors.combat} />
          <Row k="HP" v={m.encounter.enemyHP} />
          <Row k="Multi-round" v={m.encounter.multiRound ? 'Yes' : 'No'} />
          <div style={{ marginTop: '4px' }}>
            <div style={labelStyle}>Actions</div>
            {m.encounter.suggestedActions.map((a, i) => (
              <div key={i} style={{ fontSize: '11px', padding: '1px 0' }}>
                <strong>{a.label}</strong> <span style={{ color: 'var(--text-secondary)' }}>({a.skill})</span> — {a.description}
              </div>
            ))}
          </div>
          {m.encounter.rewards && (
            <div style={{ marginTop: '4px' }}>
              <div style={labelStyle}>Encounter Loot</div>
              <Row k="XP" v={m.encounter.rewards.xp} />
              <Row k="Gold" v={m.encounter.rewards.gold} />
              {m.encounter.rewards.items?.length > 0 && <Row k="Items" v={m.encounter.rewards.items.join(', ')} color={typeColors.item} />}
            </div>
          )}
        </SubSection>
      )}

      {m.rewards && (
        <SubSection title="Milestone Rewards">
          <Row k="XP" v={`+${m.rewards.xp}`} />
          <Row k="Gold" v={m.rewards.gold} />
          {m.rewards.items?.length > 0 && <Row k="Items" v={m.rewards.items.join(', ')} color={typeColors.item} />}
        </SubSection>
      )}
    </div>
  );
};

// --- Main Component ---
const CampaignMilestoneTest = () => {
  const [selectedCampaign, setSelectedCampaign] = useState('heroic-fantasy');
  const [milestones, setMilestones] = useState(SAMPLE_CAMPAIGNS['heroic-fantasy'].milestones);
  const [eventLog, setEventLog] = useState([]);
  const [lastResult, setLastResult] = useState(null);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState(1);
  const [spawnResult, setSpawnResult] = useState(null);
  const [spawnSeed, setSpawnSeed] = useState(42);
  const [spawnMapData, setSpawnMapData] = useState(null);

  // AI test state
  const [aiModelOptions] = useState(() => buildModelOptions());
  const [aiSelectedOption, setAiSelectedOption] = useState(() => {
    const opts = buildModelOptions();
    return opts.length > 0 ? `${opts[0].provider}::${opts[0].model}` : '';
  });
  const [aiInput, setAiInput] = useState('');
  const [aiConversation, setAiConversation] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiDetections, setAiDetections] = useState([]); // log of marker detections
  const [aiLastPrompt, setAiLastPrompt] = useState('');

  const campaign = SAMPLE_CAMPAIGNS[selectedCampaign];
  const allComplete = milestones.every(m => m.completed);
  const selectedMilestone = milestones.find(m => m.id === selectedMilestoneId) || null;

  const switchCampaign = useCallback((id) => {
    setSelectedCampaign(id);
    setMilestones(SAMPLE_CAMPAIGNS[id].milestones.map(m => ({ ...m, completed: false })));
    setEventLog([]);
    setLastResult(null);
    setSelectedMilestoneId(SAMPLE_CAMPAIGNS[id].milestones[0]?.id || 1);
    setSpawnResult(null);
    setSpawnMapData(null);
  }, []);

  const simulateEvent = useCallback((event) => {
    const result = checkMilestoneCompletion(milestones, event);
    let logResult;

    if (result?.type === 'blocked') {
      const unmet = result.unmetRequirements.map(r => r.text);
      logResult = `BLOCKED — #${result.milestoneId} requires: ${unmet.join(', ')}`;
      setLastResult({ type: 'blocked', milestone: result.milestone, unmetReqs: unmet });
    } else if (result?.type === 'level_blocked') {
      logResult = `LEVEL BLOCKED — #${result.milestoneId} needs Lv.${result.requiredLevel} (current: ${result.currentLevel})`;
      setLastResult({ type: 'blocked', milestone: result.milestone, unmetReqs: [`Level ${result.requiredLevel}+ required`] });
    } else if (result?.type === 'completed') {
      setMilestones(result.updatedMilestones);
      logResult = result.campaignComplete
        ? `#${result.milestoneId} completed! CAMPAIGN COMPLETE!`
        : `#${result.milestoneId} completed!`;
      setLastResult(result.campaignComplete
        ? { type: 'campaign_complete', milestone: result.milestone }
        : { type: 'success', milestone: result.milestone });
    } else {
      logResult = 'No match';
      setLastResult({ type: 'miss', event });
    }
    setEventLog(prev => [{ timestamp: new Date().toLocaleTimeString(), event, result: logResult }, ...prev]);
  }, [milestones]);

  const manualNarrativeComplete = useCallback((milestoneId) => {
    const result = completeNarrativeMilestone(milestones, milestoneId);
    if (!result) return;
    setMilestones(result.updatedMilestones);
    const ms = result.milestone;
    setEventLog(prev => [{
      timestamp: new Date().toLocaleTimeString(),
      event: { type: 'narrative_resolved', id: ms?.spawn?.id },
      result: result.campaignComplete ? `#${milestoneId} narrative resolved! CAMPAIGN COMPLETE!` : `#${milestoneId} narrative resolved`
    }, ...prev]);
    setLastResult(result.campaignComplete ? { type: 'campaign_complete', milestone: ms } : { type: 'narrative', milestone: ms });
  }, [milestones]);

  const resetAll = () => {
    setMilestones(SAMPLE_CAMPAIGNS[selectedCampaign].milestones.map(m => ({ ...m, completed: false })));
    setEventLog([]);
    setLastResult(null);
  };

  // --- AI Milestone Test ---
  const buildMilestonePromptContext = useCallback(() => {
    const completed = milestones.filter(m => m.completed);
    const remaining = milestones.filter(m => !m.completed);
    const active = remaining.filter(m => areRequirementsMet(m, milestones));
    const locked = remaining.filter(m => !areRequirementsMet(m, milestones));

    let text = '';
    if (active.length > 0) {
      text += '\nActive Milestones: ' + active.map(m => {
        const typeTag = m.type ? ` [${m.type}]` : '';
        const levelTag = m.minLevel ? ` (Lv.${m.minLevel}+)` : '';
        return `${m.text}${typeTag}${levelTag}`;
      }).join('; ');
    }
    if (completed.length > 0) {
      text += '\nCompleted: ' + completed.map(m => m.text).join('; ');
    }
    if (locked.length > 0) {
      text += '\nLocked (prerequisites not met): ' + locked.map(m => m.text).join('; ');
    }
    return text;
  }, [milestones]);

  const handleAiSend = useCallback(async () => {
    if (!aiInput.trim() || aiLoading) return;

    const userMsg = { role: 'user', content: aiInput };
    setAiConversation(prev => [...prev, userMsg]);
    setAiInput('');
    setAiLoading(true);
    setAiError(null);

    const [provider, model] = aiSelectedOption.split('::');
    const resolved = resolveProviderAndModel(provider, model);

    const milestonesInfo = buildMilestonePromptContext();
    const gameContext = `Setting: ${campaign.name} campaign.${campaign.campaignGoal ? `\nGoal: ${campaign.campaignGoal}` : ''}${milestonesInfo}\nThe party is on an adventure.`;

    const recentMessages = aiConversation.slice(-6).map(m =>
      `${m.role === 'ai' ? 'DM' : 'Player'}: ${m.content}`
    ).join('\n');

    const prompt = DM_PROTOCOL + `[CONTEXT]\n${gameContext}\n\n[SUMMARY]\n${recentMessages || 'The adventure continues.'}\n\n[PLAYER ACTION]\n${aiInput}\n\n[NARRATE]`;
    setAiLastPrompt(prompt);

    try {
      let response = await llmService.generateUnified({
        provider: resolved.provider,
        model: resolved.model,
        prompt,
        maxTokens: 1200,
        temperature: 0.7
      });

      // Normalize mid-sentence newlines (same fix as useGameInteraction)
      response = response.replace(/([a-z,;:.!?'"\u2014])\n[ \t]*([a-z])/gi, '$1 $2');
      response = response.replace(/\n{3,}/g, '\n\n').trim();

      // Check for milestone marker
      const milestoneMatch = response.match(MILESTONE_COMPLETE_REGEX);
      if (milestoneMatch) {
        const milestoneText = milestoneMatch[1].replace(/\s+/g, ' ').trim();
        const matchedMilestone = milestones.find(m =>
          m.text.toLowerCase().includes(milestoneText.toLowerCase()) ||
          milestoneText.toLowerCase().includes(m.text.toLowerCase())
        );

        setAiDetections(prev => [{
          timestamp: new Date().toLocaleTimeString(),
          marker: milestoneMatch[0],
          extractedText: milestoneText,
          matched: matchedMilestone ? `#${matchedMilestone.id}: ${matchedMilestone.text}` : null,
          type: 'milestone'
        }, ...prev]);

        if (matchedMilestone) {
          setMilestones(prev => prev.map(m =>
            m.id === matchedMilestone.id ? { ...m, completed: true } : m
          ));
        }

        // Strip marker from display
        response = response.replace(milestoneMatch[0], '').trim();
      }

      // Check for campaign completion marker
      const campaignMatch = response.match(CAMPAIGN_COMPLETE_REGEX);
      if (campaignMatch) {
        setAiDetections(prev => [{
          timestamp: new Date().toLocaleTimeString(),
          marker: campaignMatch[0],
          extractedText: 'Campaign Complete',
          matched: 'Campaign goal achieved',
          type: 'campaign'
        }, ...prev]);
        response = response.replace(campaignMatch[0], '').trim();
      }

      if (!milestoneMatch && !campaignMatch) {
        setAiDetections(prev => [{
          timestamp: new Date().toLocaleTimeString(),
          marker: null,
          extractedText: 'No markers found',
          matched: null,
          type: 'none'
        }, ...prev]);
      }

      const aiMsg = { role: 'ai', content: response };
      setAiConversation(prev => [...prev, aiMsg]);
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  }, [aiInput, aiLoading, aiSelectedOption, aiConversation, milestones, campaign, buildMilestonePromptContext]);

  const resultColors = {
    campaign_complete: { bg: 'rgba(212,175,55,0.2)', border: 'var(--primary)', text: 'var(--primary)' },
    success: { bg: 'rgba(76,175,80,0.15)', border: '#4caf50', text: '#4caf50' },
    narrative: { bg: 'rgba(255,167,38,0.15)', border: '#ffa726', text: '#ffa726' },
    blocked: { bg: 'rgba(239,83,80,0.15)', border: '#ef5350', text: '#ef5350' },
    miss: { bg: 'rgba(239,83,80,0.1)', border: '#ef535044', text: '#ef5350' }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto', fontFamily: 'var(--body-font)', color: 'var(--text)' }}>
      <h1 style={{ color: 'var(--primary)', fontFamily: 'var(--header-font)', marginBottom: '6px' }}>Campaign Milestone Test</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '13px' }}>
        Milestone system prototype — encounters, rewards, level gates, prerequisites, and spawned entities.
      </p>

      {/* Campaign selector */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        {Object.entries(SAMPLE_CAMPAIGNS).map(([id, c]) => (
          <button key={id} onClick={() => switchCampaign(id)} style={{
            padding: '6px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: 600,
            border: `2px solid ${selectedCampaign === id ? 'var(--primary)' : 'var(--border)'}`,
            background: selectedCampaign === id ? 'rgba(212,175,55,0.15)' : 'var(--surface)',
            color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--header-font)'
          }}>{c.name}</button>
        ))}
        <button onClick={resetAll} style={{
          padding: '6px 10px', borderRadius: '6px', fontSize: '12px',
          border: '1px solid var(--border)', background: 'var(--surface)',
          color: 'var(--text-secondary)', cursor: 'pointer', marginLeft: 'auto'
        }}>Reset</button>
      </div>

      {/* Campaign goal */}
      <div style={{ padding: '8px 12px', background: 'var(--surface)', borderRadius: '6px', border: '1px solid var(--border)', marginBottom: '16px', fontSize: '13px' }}>
        <strong>Goal:</strong> {campaign.campaignGoal}
      </div>

      {/* Campaign complete banner */}
      {allComplete && (
        <div style={{ padding: '10px', background: 'rgba(212,175,55,0.15)', border: '2px solid var(--primary)', borderRadius: '8px', textAlign: 'center', marginBottom: '16px' }}>
          <strong style={{ color: 'var(--primary)', fontSize: '16px' }}>CAMPAIGN COMPLETE!</strong>
        </div>
      )}

      {/* SECTION 1: Milestones + Detail (2 columns) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
        {/* Milestone list */}
        <div style={sectionBox({ borderColor: 'var(--primary)', borderWidth: '2px' })}>
          <h2 style={sectionTitle}>
            Milestones ({milestones.filter(m => m.completed).length}/{milestones.length})
          </h2>
          {milestones.map(m => (
            <MilestoneCard key={m.id} m={m} milestones={milestones} selected={selectedMilestoneId === m.id} onSelect={setSelectedMilestoneId} />
          ))}
        </div>

        {/* Detail panel */}
        <div style={sectionBox()}>
          <h2 style={sectionTitle}>Milestone Detail</h2>
          <MilestoneDetail m={selectedMilestone} milestones={milestones} />
        </div>
      </div>

      {/* SECTION 2: Event Simulation */}
      <div style={sectionBox({ marginBottom: '14px' })}>
        <h2 style={sectionTitle}>Simulate Game Events</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
          {milestones.filter(m => !m.completed).map((m) => {
            const state = getMilestoneState(m, milestones);
            const isLocked = state === 'locked';

            if (m.type === 'narrative') {
              return (
                <button key={m.id} onClick={() => !isLocked && manualNarrativeComplete(m.id)} disabled={isLocked}
                  style={{
                    padding: '8px 10px', borderRadius: '6px', textAlign: 'left', fontSize: '12px',
                    cursor: isLocked ? 'not-allowed' : 'pointer',
                    border: `1px solid ${isLocked ? '#666' : typeColors.narrative}`,
                    background: isLocked ? 'rgba(100,100,100,0.05)' : `${typeColors.narrative}11`,
                    color: 'var(--text)', opacity: isLocked ? 0.5 : 1
                  }}>
                  <span>{isLocked ? '🔒' : '💬'}</span> <strong>#{m.id}</strong> {m.text}
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {isLocked ? 'Prerequisites not met' : 'Resolve narrative'}
                  </div>
                </button>
              );
            }

            const evtType = m.type === 'item' ? 'item_acquired' : m.type === 'combat' ? 'enemy_defeated' : 'location_visited';
            const evtId = m.type === 'item' ? m.trigger.item : m.type === 'combat' ? m.trigger.enemy : m.trigger.location;
            const evtKey = m.type === 'item' ? 'itemId' : m.type === 'combat' ? 'enemyId' : 'locationId';

            return (
              <button key={m.id} onClick={() => simulateEvent({ type: evtType, [evtKey]: evtId })}
                style={{
                  padding: '8px 10px', borderRadius: '6px', textAlign: 'left', fontSize: '12px', cursor: 'pointer',
                  border: `1px solid ${isLocked ? '#ef535066' : typeColors[m.type]}`,
                  background: isLocked ? 'rgba(239,83,80,0.05)' : `${typeColors[m.type]}11`,
                  color: 'var(--text)'
                }}>
                <span>{isLocked ? '🔒' : typeIcons[m.type]}</span> <strong>#{m.id}</strong>{' '}
                <code style={codeStyle}>{evtType}("{evtId}")</code>
                <div style={{ fontSize: '10px', color: isLocked ? '#ef5350' : 'var(--text-secondary)', marginTop: '2px' }}>
                  {isLocked ? 'BLOCKED' : m.text}
                </div>
              </button>
            );
          })}

          {/* Irrelevant event */}
          <button onClick={() => simulateEvent({ type: 'item_acquired', itemId: 'random_potion' })}
            style={{
              padding: '8px 10px', borderRadius: '6px', textAlign: 'left', fontSize: '12px', cursor: 'pointer',
              border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-secondary)'
            }}>
            ❌ <code style={codeStyle}>item_acquired("random_potion")</code>
            <div style={{ fontSize: '10px', marginTop: '2px' }}>Should not match</div>
          </button>
        </div>
      </div>

      {/* SECTION 2.5: AI Milestone Test */}
      <div style={sectionBox({ marginBottom: '14px', borderColor: '#ffa726', borderWidth: '2px' })}>
        <h2 style={sectionTitle}>AI Milestone Test</h2>
        <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: 0, marginBottom: '10px' }}>
          Chat with the AI using DM_PROTOCOL + milestone context. Narrative milestones should trigger <code style={codeStyle}>[COMPLETE_MILESTONE]</code> markers. Mechanical milestones (item/combat/location) are engine-detected and the AI should <strong>not</strong> mark them.
        </p>

        {/* Provider/model selector */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Provider/Model:</label>
          <select
            value={aiSelectedOption}
            onChange={(e) => setAiSelectedOption(e.target.value)}
            style={{
              padding: '4px 8px', borderRadius: '4px', fontSize: '12px', flex: 1, maxWidth: '320px',
              border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)'
            }}
          >
            {aiModelOptions.map(opt => (
              <option key={`${opt.provider}::${opt.model}`} value={`${opt.provider}::${opt.model}`}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => { setAiConversation([]); setAiDetections([]); setAiError(null); setAiLastPrompt(''); }}
            style={{
              padding: '4px 10px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer',
              border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)'
            }}
          >Clear Chat</button>
        </div>

        {/* Chat area */}
        <div style={{
          maxHeight: '300px', overflowY: 'auto', marginBottom: '10px', padding: '8px',
          background: 'var(--bg)', borderRadius: '6px', border: '1px solid var(--border)'
        }}>
          {aiConversation.length === 0 && (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
              Send a message to test AI milestone detection. Try narrative actions like "I convince the Silver Guard captain to join our cause."
            </div>
          )}
          {aiConversation.map((msg, i) => (
            <div key={i} style={{
              marginBottom: '8px', padding: '8px 10px', borderRadius: '6px',
              background: msg.role === 'user' ? 'rgba(79,195,247,0.08)' : 'rgba(255,167,38,0.08)',
              borderLeft: `3px solid ${msg.role === 'user' ? '#4fc3f7' : '#ffa726'}`
            }}>
              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
                {msg.role === 'user' ? 'Player' : 'DM'}
              </div>
              <div style={{ fontSize: '13px' }}>
                {msg.role === 'ai' ? <SafeMarkdownMessage content={msg.content} /> : msg.content}
              </div>
            </div>
          ))}
          {aiLoading && (
            <div style={{ textAlign: 'center', padding: '10px', color: 'var(--text-secondary)', fontSize: '12px' }}>
              Generating response...
            </div>
          )}
        </div>

        {/* Input */}
        <form onSubmit={(e) => { e.preventDefault(); handleAiSend(); }} style={{ display: 'flex', gap: '6px' }}>
          <input
            type="text"
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            placeholder="Type a player action..."
            disabled={aiLoading}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: '6px', fontSize: '13px',
              border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)'
            }}
          />
          <button
            type="submit"
            disabled={aiLoading || !aiInput.trim()}
            style={{
              padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              border: '1px solid var(--primary)', background: 'rgba(212,175,55,0.15)', color: 'var(--text)',
              opacity: aiLoading || !aiInput.trim() ? 0.5 : 1
            }}
          >Send</button>
        </form>

        {aiError && (
          <div style={{ marginTop: '8px', padding: '6px 10px', borderRadius: '4px', fontSize: '12px', background: 'rgba(239,83,80,0.15)', border: '1px solid #ef5350', color: '#ef5350' }}>
            {aiError}
          </div>
        )}

        {/* Detection log */}
        {aiDetections.length > 0 && (
          <div style={{ marginTop: '10px' }}>
            <div style={labelStyle}>Marker Detection Log</div>
            <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
              {aiDetections.map((d, i) => (
                <div key={i} style={{
                  padding: '4px 6px', marginBottom: '2px', borderRadius: '3px', fontSize: '11px',
                  background: 'var(--bg)', border: '1px solid var(--border)'
                }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{d.timestamp}</span>{' '}
                  {d.type === 'milestone' && d.matched && (
                    <span style={{ color: '#4caf50' }}>MILESTONE DETECTED: <code style={codeStyle}>{d.marker}</code> → {d.matched}</span>
                  )}
                  {d.type === 'milestone' && !d.matched && (
                    <span style={{ color: '#ef5350' }}>MILESTONE NOT MATCHED: <code style={codeStyle}>{d.marker}</code> — "{d.extractedText}" didn't match any milestone</span>
                  )}
                  {d.type === 'campaign' && (
                    <span style={{ color: 'var(--primary)' }}>CAMPAIGN COMPLETE DETECTED: <code style={codeStyle}>{d.marker}</code></span>
                  )}
                  {d.type === 'none' && (
                    <span style={{ color: 'var(--text-secondary)' }}>No markers in response</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Last prompt (collapsible) */}
        {aiLastPrompt && (
          <details style={{ marginTop: '10px' }}>
            <summary style={{ fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}>View last prompt sent to AI</summary>
            <pre style={{
              fontSize: '10px', padding: '8px', marginTop: '4px', borderRadius: '4px', maxHeight: '200px', overflowY: 'auto',
              background: 'rgba(0,0,0,0.3)', color: '#ccc', whiteSpace: 'pre-wrap', wordBreak: 'break-word'
            }}>{aiLastPrompt}</pre>
          </details>
        )}
      </div>

      {/* SECTION 3: Last Result */}
      <div style={sectionBox({ marginBottom: '14px' })}>
        <h2 style={sectionTitle}>Last Result</h2>
        {!lastResult && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No events fired yet</div>}
        {lastResult && (
          <div style={{
            padding: '10px', borderRadius: '6px', fontSize: '13px',
            background: resultColors[lastResult.type]?.bg,
            border: `2px solid ${resultColors[lastResult.type]?.border}`
          }}>
            {lastResult.type === 'campaign_complete' && <><strong style={{ color: resultColors.campaign_complete.text }}>CAMPAIGN COMPLETE!</strong><div style={{ marginTop: '4px' }}>{lastResult.milestone?.text}</div><div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>AI would narrate victory epilogue.</div></>}
            {lastResult.type === 'success' && <><strong style={{ color: resultColors.success.text }}>Completed!</strong><div style={{ marginTop: '4px' }}>{lastResult.milestone?.text}</div>{lastResult.milestone?.rewards && <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Rewards: +{lastResult.milestone.rewards.xp} XP, {lastResult.milestone.rewards.gold} gold{lastResult.milestone.rewards.items?.length > 0 ? `, ${lastResult.milestone.rewards.items.join(', ')}` : ''}</div>}</>}
            {lastResult.type === 'narrative' && <><strong style={{ color: resultColors.narrative.text }}>Narrative Resolved!</strong><div style={{ marginTop: '4px' }}>{lastResult.milestone?.text}</div></>}
            {lastResult.type === 'blocked' && <><strong style={{ color: resultColors.blocked.text }}>Blocked!</strong><div style={{ fontSize: '12px', marginTop: '4px' }}>Requires: {lastResult.unmetReqs?.join(', ')}</div></>}
            {lastResult.type === 'miss' && <><strong style={{ color: resultColors.miss.text }}>No Match</strong><div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Event didn't match any active milestone.</div></>}
          </div>
        )}
      </div>

      {/* SECTION 4: Event Log */}
      <div style={sectionBox({ marginBottom: '20px' })}>
        <h2 style={sectionTitle}>Event Log</h2>
        {eventLog.length === 0 && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No events yet</div>}
        <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
          {eventLog.map((entry, i) => (
            <div key={i} style={{
              padding: '4px 6px', marginBottom: '2px', borderRadius: '3px',
              background: 'var(--bg)', border: '1px solid var(--border)', fontSize: '11px'
            }}>
              <span style={{ color: 'var(--text-secondary)' }}>{entry.timestamp}</span>{' '}
              <code style={codeStyle}>{entry.event.type}("{entry.event.itemId || entry.event.enemyId || entry.event.locationId || entry.event.id}")</code>{' '}
              <span style={{
                color: entry.result.includes('CAMPAIGN COMPLETE') ? 'var(--primary)'
                  : entry.result.includes('completed') || entry.result.includes('resolved') ? '#4caf50'
                  : entry.result.includes('BLOCKED') ? '#ef5350' : 'var(--text-secondary)'
              }}>→ {entry.result}</span>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 5: Engine API Output */}
      {(() => {
        const progress = getCampaignProgress(milestones);
        const spawns = getSpawnRequirements(milestones);
        return (
          <div style={sectionBox({ marginBottom: '20px' })}>
            <h2 style={sectionTitle}>Engine API Output</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <div style={labelStyle}>getCampaignProgress()</div>
                <div style={{ fontSize: '12px', lineHeight: '1.8' }}>
                  <div>Completed: <strong>{progress.completed.length}</strong> / {progress.total}</div>
                  <div>Active: <strong>{progress.active.length}</strong> ({progress.active.map(m => `#${m.id}`).join(', ') || 'none'})</div>
                  <div>Locked: <strong>{progress.locked.length}</strong> ({progress.locked.map(m => `#${m.id}`).join(', ') || 'none'})</div>
                  <div>Current: {progress.current ? <code style={codeStyle}>#{progress.current.id} — {progress.current.text}</code> : <span style={{ color: 'var(--text-secondary)' }}>none</span>}</div>
                  <div>Campaign Complete: <strong style={{ color: progress.isComplete ? '#4caf50' : 'var(--text)' }}>{progress.isComplete ? 'YES' : 'No'}</strong></div>
                </div>
              </div>
              <div>
                <div style={labelStyle}>getSpawnRequirements()</div>
                <div style={{ fontSize: '12px', lineHeight: '1.8' }}>
                  <div>Items: {spawns.items.length > 0 ? spawns.items.map(s => <code key={s.id} style={{ ...codeStyle, marginRight: '4px' }}>{s.id}</code>) : <span style={{ color: 'var(--text-secondary)' }}>none</span>}</div>
                  <div>Enemies: {spawns.enemies.length > 0 ? spawns.enemies.map(s => <code key={s.id} style={{ ...codeStyle, marginRight: '4px' }}>{s.id}</code>) : <span style={{ color: 'var(--text-secondary)' }}>none</span>}</div>
                  <div>NPCs: {spawns.npcs.length > 0 ? spawns.npcs.map(s => <code key={s.id} style={{ ...codeStyle, marginRight: '4px' }}>{s.id}</code>) : <span style={{ color: 'var(--text-secondary)' }}>none</span>}</div>
                  <div>POIs: {spawns.pois.length > 0 ? spawns.pois.map(s => <code key={s.id} style={{ ...codeStyle, marginRight: '4px' }}>{s.id}</code>) : <span style={{ color: 'var(--text-secondary)' }}>none</span>}</div>
                  <div>Buildings: {spawns.buildings.length > 0 ? spawns.buildings.map(s => <code key={s.name} style={{ ...codeStyle, marginRight: '4px' }}>{s.name}</code>) : <span style={{ color: 'var(--text-secondary)' }}>none</span>}</div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* SECTION 6: Spawn Preview */}
      <div style={sectionBox({ marginBottom: '20px' })}>
        <h2 style={sectionTitle}>Spawn Preview</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Seed:</label>
          <input
            type="number"
            value={spawnSeed}
            onChange={(e) => setSpawnSeed(parseInt(e.target.value) || 0)}
            style={{
              width: '80px', padding: '4px 8px', borderRadius: '4px', fontSize: '12px',
              border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)'
            }}
          />
          <button onClick={() => {
            // Pass milestone location names to map generator so they appear on the map
            const customNames = getMilestoneLocationNames(milestones);
            const mapData = generateMapData(10, 10, spawnSeed, customNames);

            // Collect actual map locations for display
            const towns = [];
            const mountains = [];
            for (let y = 0; y < mapData.length; y++) {
              for (let x = 0; x < mapData[y].length; x++) {
                const tile = mapData[y][x];
                if (tile.townName) towns.push({ name: tile.townName, x, y, size: tile.townSize });
                if (tile.mountainName && tile.isFirstMountainInRange) mountains.push({ name: tile.mountainName, x, y });
              }
            }

            // Spawner uses milestone locations directly — they exist on the map
            const result = spawnWorldMapEntities(mapData, milestones);

            const locationResults = milestones.map(m => {
              if (!m.location) return { id: m.id, location: null, resolved: false };
              const target = m.location.toLowerCase();
              for (let y = 0; y < mapData.length; y++) {
                for (let x = 0; x < mapData[y].length; x++) {
                  const tile = mapData[y][x];
                  if (tile.townName?.toLowerCase() === target || tile.mountainName?.toLowerCase() === target || tile.poi === target) {
                    return { id: m.id, location: m.location, resolved: true, x, y };
                  }
                }
              }
              return { id: m.id, location: m.location, resolved: false };
            });

            setSpawnResult({ ...result, locationResults, towns, mountains, seed: spawnSeed });
            setSpawnMapData(mapData);
          }} style={{
            padding: '5px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
            border: '1px solid var(--primary)', background: 'rgba(212,175,55,0.15)',
            color: 'var(--text)', cursor: 'pointer'
          }}>
            Generate Map & Spawn
          </button>
        </div>

        {!spawnResult && (
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            Click "Generate Map &amp; Spawn" to test milestone entity placement. Milestone location names are injected into the map generator.
          </div>
        )}

        {spawnResult && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <div style={labelStyle}>Map Locations (seed {spawnResult.seed})</div>
              <div style={{ fontSize: '11px', lineHeight: '1.8' }}>
                <div style={{ fontWeight: 600, marginBottom: '2px' }}>Towns:</div>
                {spawnResult.towns.map(t => (
                  <div key={t.name}>
                    <code style={codeStyle}>{t.name}</code> ({t.size}) at ({t.x}, {t.y})
                  </div>
                ))}
                <div style={{ fontWeight: 600, marginTop: '6px', marginBottom: '2px' }}>Mountains:</div>
                {spawnResult.mountains.length > 0 ? spawnResult.mountains.map(m => (
                  <div key={m.name}>
                    <code style={codeStyle}>{m.name}</code> at ({m.x}, {m.y})
                  </div>
                )) : <div style={{ color: 'var(--text-secondary)' }}>none</div>}
              </div>
            </div>

            <div>
              <div style={labelStyle}>Milestone Location Resolution</div>
              <div style={{ fontSize: '11px', lineHeight: '1.8' }}>
                {spawnResult.locationResults.map(lr => (
                  <div key={lr.id}>
                    <span style={{ color: lr.resolved ? '#4caf50' : '#ef5350', fontWeight: 600 }}>
                      {lr.resolved ? '✓' : '✗'}
                    </span>{' '}
                    #{lr.id} <code style={codeStyle}>{lr.location || 'no location'}</code>
                    {lr.resolved && <span style={{ color: 'var(--text-secondary)' }}> → ({lr.x}, {lr.y})</span>}
                    {!lr.resolved && lr.location && <span style={{ color: '#ef5350' }}> NOT FOUND</span>}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div style={labelStyle}>Spawned POIs</div>
              <div style={{ fontSize: '11px', lineHeight: '1.8' }}>
                {spawnResult.spawnedPois.length > 0 ? spawnResult.spawnedPois.map(p => (
                  <div key={p.id}>
                    <span style={{ color: '#4caf50' }}>✓</span>{' '}
                    <code style={codeStyle}>{p.id}</code> "{p.name}" at ({p.x}, {p.y})
                  </div>
                )) : <div style={{ color: 'var(--text-secondary)' }}>none needed</div>}
              </div>

              <div style={{ ...labelStyle, marginTop: '8px' }}>Enemy Spawns</div>
              <div style={{ fontSize: '11px', lineHeight: '1.8' }}>
                {spawnResult.enemySpawns.length > 0 ? spawnResult.enemySpawns.map(e => (
                  <div key={e.id}>
                    <span style={{ color: e.mapX !== null ? '#4caf50' : '#ef5350' }}>
                      {e.mapX !== null ? '✓' : '✗'}
                    </span>{' '}
                    <code style={codeStyle}>{e.id}</code> "{e.name}"
                    {e.mapX !== null ? <span style={{ color: 'var(--text-secondary)' }}> at ({e.mapX}, {e.mapY})</span> : <span style={{ color: '#ef5350' }}> NO COORDS</span>}
                  </div>
                )) : <div style={{ color: 'var(--text-secondary)' }}>none</div>}
              </div>
            </div>

            <div>
              <div style={labelStyle}>Required Town Buildings</div>
              <div style={{ fontSize: '11px', lineHeight: '1.8' }}>
                {Object.keys(spawnResult.requiredBuildings).length > 0 ? Object.entries(spawnResult.requiredBuildings).map(([town, buildings]) => (
                  <div key={town}>
                    <strong>{town}:</strong>{' '}
                    {buildings.map((b, i) => (
                      <span key={i}>
                        <code style={codeStyle}>{b.type}</code> "{b.name}"
                        {i < buildings.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </div>
                )) : <div style={{ color: 'var(--text-secondary)' }}>none needed</div>}
              </div>

              <div style={{ ...labelStyle, marginTop: '8px' }}>Item Spawns</div>
              <div style={{ fontSize: '11px', lineHeight: '1.8' }}>
                {spawnResult.itemSpawns.length > 0 ? spawnResult.itemSpawns.map(item => (
                  <div key={item.id}>
                    <span style={{ color: item.mapX !== null ? '#4caf50' : '#ef5350' }}>
                      {item.mapX !== null ? '✓' : '✗'}
                    </span>{' '}
                    <code style={codeStyle}>{item.id}</code> "{item.name}" in {item.location}
                    {item.mapX !== null ? <span style={{ color: 'var(--text-secondary)' }}> ({item.mapX}, {item.mapY})</span> : ''}
                  </div>
                )) : <div style={{ color: 'var(--text-secondary)' }}>none</div>}
              </div>
            </div>
          </div>
        )}

        {spawnMapData && (() => {
          // Compute visible milestone POIs based on current milestone state
          const visible = new Set();
          for (const m of milestones) {
            if (m.spawn?.type === 'poi' && (m.completed || areRequirementsMet(m, milestones))) {
              visible.add(m.spawn.id);
            }
          }
          return (
            <div style={{ marginTop: '14px' }}>
              <div style={labelStyle}>World Map {visible.size < milestones.filter(m => m.spawn?.type === 'poi').length && <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal' }}>(locked POIs hidden)</span>}</div>
              <WorldMapDisplay
                mapData={spawnMapData}
                playerPosition={{ x: -1, y: -1 }}
                onTileClick={() => {}}
                firstHero={null}
                visibleMilestonePois={visible}
              />
            </div>
          );
        })()}
      </div>

      {/* System overview */}
      <div style={{ padding: '12px', background: 'rgba(212,175,55,0.08)', border: '1px solid var(--primary)', borderRadius: '8px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '6px', color: 'var(--primary)', fontFamily: 'var(--header-font)', fontSize: '14px' }}>System Overview</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: '12px', lineHeight: '1.6' }}>
          <div>&#8226; Uses <code style={codeStyle}>milestoneEngine.js</code> — same code as game loop</div>
          <div>&#8226; Combat milestones define full encounter data</div>
          <div>&#8226; Two reward layers: encounter loot + milestone bonus</div>
          <div>&#8226; <code style={codeStyle}>minLevel</code> gates for boss encounters</div>
          <div>&#8226; <code style={codeStyle}>requires</code> enforces milestone ordering</div>
          <div>&#8226; <code style={codeStyle}>building</code> ensures quest buildings exist in towns</div>
          <div>&#8226; Spawned entities placed at map generation</div>
          <div>&#8226; Narrative milestones need NPC system (future)</div>
        </div>
      </div>
    </div>
  );
};

export default CampaignMilestoneTest;
