import React, { useState, useContext } from 'react';
import SettingsContext from '../contexts/SettingsContext';
import { llmService } from '../services/llmService';
import { buildModelOptions, resolveProviderAndModel } from '../llm/modelResolver';

// ── Shared styles ──
const card = { background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: 16, marginBottom: 20 };
const btn = (color, disabled) => ({ padding: '10px 20px', background: disabled ? '#555' : color, color: '#fff', border: 'none', borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600 });
const mono = { fontFamily: 'monospace', fontSize: 13, background: '#0d1117', padding: 12, borderRadius: 4, whiteSpace: 'pre-wrap', color: '#e0e0e0', minHeight: 40, maxHeight: 400, overflowY: 'auto', border: '1px solid #333' };
const labelStyle = { fontSize: 12, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };

const ResultBox = ({ label: lbl, value, style }) => (
  <div style={{ marginTop: 12 }}>
    <div style={labelStyle}>{lbl}</div>
    <div style={{ ...mono, ...style }}>{value || '(no result yet)'}</div>
  </div>
);

// ── Current summarization prompt (matches production in useGameInteraction.js) ──
const buildCurrentPrompt = (oldSummary, recentText) =>
  `You are a concise story summarizer. Combine the old summary with the recent exchange into a single brief summary (2-4 sentences) capturing key events, locations, and character actions. Output ONLY the summary text, nothing else.\n\nOld summary: ${oldSummary}\n\nRecent exchange:\n${recentText}\n\nNew summary:`;

// ── New summarization prompt (narrative thread only, no game-state facts) ──
const buildNewPrompt = (oldSummary, recentText) =>
  `Summarize the narrative thread from this exchange in 3-5 sentences. Focus on: player decisions and intentions, NPC interactions and what was learned, plot developments and discoveries, consequences of actions, unresolved questions or threats. Output ONLY the summary.\n\nPrevious summary: ${oldSummary}\n\nRecent exchange:\n${recentText}\n\nUpdated summary:`;

// ── Simulated game context (what the [CONTEXT] block already provides to the DM) ──
// This is NOT sent to the summarizer — it's displayed to show what's redundant
const SIMULATED_GAME_CONTEXT = `Setting: A dark fantasy kingdom plagued by shadow. Mood: Grim Intensity. Magic: High. Tech: Medieval.
Goal: Defeat the Shadow Overlord and restore light to the realm.
Active Milestones: Find a map to the Crown of Sunfire in Oakhaven's archives [item]; Defeat the Shadow Overlord at the Shadow Fortress [combat]
The party is INSIDE Frostwood, a village. They are in the town square. Nearby: The Frozen Tankard, Temple of Dawn, Market Stalls, Aldric's Cottage.
Party: Marius (Paladin), Genevieve (Cleric), Warrick (Fighter), Finnian (Rogue).`;

// ── Test scenarios with realistic game data ──
const scenarios = [
  {
    name: 'Town Arrival + NPC Interaction',
    oldSummary: 'The adventure begins.',
    messages: [
      { role: 'system', content: 'You have entered Frostwood.' },
      { role: 'ai', content: 'The timber-framed buildings of Frostwood rise from the plains, smoke curling from chimneys. A weathered sign marks The Frozen Tankard inn. In the town square, Marius spots a grizzled old man eyeing the party with suspicion. "Strangers," he mutters. "We don\'t get many of those since the shadow fell over the eastern pass."' },
      { role: 'user', content: 'I approach the old man. "What shadow do you speak of, friend?"' },
      { role: 'ai', content: 'The old man looks Marius up and down, then leans closer. "Name\'s Aldric. Used to be a ranger, before my knees gave out. Three weeks ago, the caravans from Oakhaven stopped coming. Traders who tried the pass came back babbling about living darkness and whispers in the rocks. The archives there hold the map you\'ll need — if Oakhaven still stands." He spits on the ground. "I can mark the safe trails on your map, if you bring me a bottle of Thornberry wine from the inn. Old bones need warming."' },
    ],
    description: 'The AI response mentions Marius, Frostwood, The Frozen Tankard — all already in game context. Only Aldric\'s info and the wine deal are new.',
  },
  {
    name: 'Multi-Turn Town Exploration',
    oldSummary: 'Aldric, an old ranger in Frostwood, warned about living darkness blocking the eastern pass to Oakhaven. He offered to mark safe trails in exchange for Thornberry wine.',
    messages: [
      { role: 'user', content: 'I go to the inn and buy Thornberry wine for Aldric.' },
      { role: 'ai', content: 'The innkeeper at The Frozen Tankard, a stout woman named Berta, slides a dusty bottle across the bar. "Last one," she says. "Thornberry vines don\'t grow this far north. That\'ll be 15 silver." She notices Warrick\'s weapons and Genevieve\'s staff. "You lot heading east? My husband went with the last caravan. Haven\'t heard from him in two weeks." Her eyes are hard but her voice cracks.' },
      { role: 'user', content: 'I pay for the wine and promise to look for her husband. What was his name?' },
      { role: 'ai', content: '"Roderick. Big fellow, red beard, drives the lead wagon. He\'d have a brass compass I gave him — family heirloom." Berta slides back 5 silver. "Keep it. Just bring him home." She pauses. "Or bring back the compass, at least, so I know."' },
    ],
    description: 'AI mentions The Frozen Tankard, Warrick, Genevieve — all in game context. New info: Berta, Roderick, brass compass, the promise.',
  },
  {
    name: 'Combat Aftermath',
    oldSummary: 'Aldric warned about shadow on the eastern pass. Berta at The Frozen Tankard asked the party to find her husband Roderick (red beard, brass compass) who went missing with the last caravan.',
    messages: [
      { role: 'ai', content: 'The shadow wolves dissolve into wisps of dark smoke as the last one falls to Warrick\'s blade. Genevieve tends to a deep scratch on Finnian\'s arm. Among the scattered remains of a merchant wagon, Marius finds a brass compass engraved with the initials "B.R." — Berta and Roderick. The wagon is empty, its cargo long gone, but wheel tracks lead deeper into the pass.' },
    ],
    description: 'AI names all four party members. Only new info: found the compass, wagon destroyed, tracks lead deeper.',
  },
  {
    name: 'Movement Narrative (Should Extract Little)',
    oldSummary: 'Aldric warned about shadow on the eastern pass. Berta asked the party to find her husband Roderick. The party found Roderick\'s brass compass among a destroyed wagon. Wheel tracks lead deeper into the pass.',
    messages: [
      { role: 'system', content: 'You moved to forest (8, 4).' },
      { role: 'ai', content: 'The forest canopy thickens as Marius leads the party along the trail eastward. Ancient oaks tower overhead, their branches intertwined like grasping fingers. Genevieve clutches her staff as the air grows cooler, carrying a faint scent of moss and decay. Shafts of pale sunlight break through gaps in the leaves, casting dappled shadows on the overgrown path. Finnian keeps one hand on his dagger hilt.' },
    ],
    description: 'Pure travel flavor naming Marius, Genevieve, Finnian. Nothing plot-relevant happened. Summary should barely change.',
  },
  {
    name: 'Player Decision Point',
    oldSummary: 'Aldric warned about shadow blocking the eastern pass. Berta asked the party to find her missing husband Roderick. They found his brass compass among a destroyed caravan and followed wheel tracks into the pass.',
    messages: [
      { role: 'user', content: 'The tracks split — one path goes to the cave, the other continues east. What does the group think?' },
      { role: 'ai', content: 'Marius kneels to examine the tracks. "The heavy wagon ruts go toward the cave. Whatever took the cargo went that way." Genevieve points east. "But Oakhaven and the archives are that direction. We came for the map to the Crown of Sunfire." Finnian fidgets with the compass. "Roderick might be in that cave. We promised Berta." Warrick grunts. "Promise to a stranger, or the fate of the realm. Your call, leader."' },
      { role: 'user', content: 'We go to the cave first. A promise is a promise.' },
      { role: 'ai', content: 'Marius nods firmly. "We don\'t leave people behind." The party turns toward the dark mouth of the cave. A cold draft carries the smell of something rotten from within. Genevieve readies her staff, its tip glowing faintly. "Stay close," she whispers. The shadows seem to pulse with a heartbeat of their own.' },
    ],
    description: 'All four names, Oakhaven, Crown of Sunfire — all game context. The KEY new info: party chose the cave over Oakhaven, chose the promise over the quest.',
  },
];

// Helper: highlight words from game context that appear in the summary
const GAME_CONTEXT_TERMS = [
  'Marius', 'Genevieve', 'Warrick', 'Finnian',
  'Paladin', 'Cleric', 'Fighter', 'Rogue',
  'Frostwood', 'Oakhaven', 'Shadow Overlord', 'Crown of Sunfire',
  'The Frozen Tankard', 'Temple of Dawn',
  'dark fantasy', 'Grim',
];

const highlightRedundancy = (text) => {
  if (!text) return text;
  let result = text;
  let count = 0;
  for (const term of GAME_CONTEXT_TERMS) {
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    if (regex.test(result)) {
      count++;
      result = result.replace(regex, `⚠️$1`);
    }
  }
  return { text: result, redundantTerms: count };
};

const SummarizationTest = () => {
  const { selectedProvider, selectedModel } = useContext(SettingsContext);
  const modelOptions = buildModelOptions();
  const [provider, setProvider] = useState(selectedProvider || 'claude');
  const [model, setModel] = useState(selectedModel || 'claude-sonnet-4-20250514');
  const [results, setResults] = useState({});
  const [running, setRunning] = useState(null); // scenario index or 'all'

  const runSummarization = async (prompt, providerName, modelName) => {
    const resolved = resolveProviderAndModel(providerName, modelName);
    return await llmService.generateUnified({
      provider: resolved.provider,
      model: resolved.model,
      prompt,
      maxTokens: 400,
      temperature: 0.3,
    });
  };

  const runScenario = async (index) => {
    const scenario = scenarios[index];

    // Current prompt: gets ALL messages (including system), formatted as the current code does
    const allText = scenario.messages
      .map(msg => `${msg.role === 'ai' ? 'AI' : 'User'}: ${msg.content}`)
      .join('\n');

    // New prompt: filters out system messages (game-state noise)
    const narrativeMessages = scenario.messages.filter(m => m.role !== 'system');
    const narrativeText = narrativeMessages
      .map(msg => `${msg.role === 'ai' ? 'DM' : 'Player'}: ${msg.content}`)
      .join('\n');

    const currentPrompt = buildCurrentPrompt(scenario.oldSummary, allText);
    const newPrompt = buildNewPrompt(scenario.oldSummary, narrativeText);

    setResults(prev => ({
      ...prev,
      [index]: { status: 'running', current: null, new: null, currentPrompt, newPrompt }
    }));

    try {
      const [currentResult, newResult] = await Promise.all([
        runSummarization(currentPrompt, provider, model),
        runSummarization(newPrompt, provider, model),
      ]);

      setResults(prev => ({
        ...prev,
        [index]: {
          status: 'done',
          current: currentResult,
          new: newResult,
          currentPrompt,
          newPrompt,
        }
      }));
    } catch (err) {
      setResults(prev => ({
        ...prev,
        [index]: { status: 'error', error: err.message, currentPrompt, newPrompt }
      }));
    }
  };

  const runAll = async () => {
    setRunning('all');
    for (let i = 0; i < scenarios.length; i++) {
      await runScenario(i);
    }
    setRunning(null);
  };

  const runSingle = async (index) => {
    setRunning(index);
    await runScenario(index);
    setRunning(null);
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 20, color: '#e0e0e0' }}>
      <h1 style={{ color: '#fff', marginBottom: 4 }}>Summarization A/B Test</h1>
      <p style={{ color: '#888', marginTop: 0, marginBottom: 8 }}>
        Compares the current summarization prompt vs the new narrative-only prompt.
        The game context box shows what the AI <em>already receives</em> in every prompt — anything the summary
        repeats from this box is wasted tokens.
      </p>
      <p style={{ color: '#666', marginTop: 0, marginBottom: 20, fontSize: 13 }}>
        Terms marked with ⚠️ in results are redundant with game context.
      </p>

      {/* Game context reference (always visible) */}
      <div style={{ ...card, borderColor: '#ff9800' }}>
        <h3 style={{ marginTop: 0, color: '#ff9800', fontSize: 14 }}>
          Game Context (already in every AI prompt — summary should NOT repeat this)
        </h3>
        <div style={{ ...mono, fontSize: 12, borderColor: '#ff9800', color: '#ccc' }}>
          {SIMULATED_GAME_CONTEXT}
        </div>
      </div>

      {/* Provider / Model selector */}
      <div style={{ ...card, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ color: '#888', fontSize: 13 }}>Provider:</span>
        <select value={provider} onChange={e => setProvider(e.target.value)}
          style={{ padding: 6, background: '#2a2a3e', color: '#e0e0e0', border: '1px solid #444', borderRadius: 4, fontSize: 13 }}>
          {[...new Set(modelOptions.map(m => m.provider))].map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <span style={{ color: '#888', fontSize: 13 }}>Model:</span>
        <select value={model} onChange={e => setModel(e.target.value)}
          style={{ padding: 6, background: '#2a2a3e', color: '#e0e0e0', border: '1px solid #444', borderRadius: 4, fontSize: 13, minWidth: 240 }}>
          {modelOptions.filter(m => m.provider === provider).map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <button onClick={runAll} disabled={running !== null} style={btn('#4caf50', running !== null)}>
          {running === 'all' ? 'Running all...' : 'Run All Scenarios'}
        </button>
      </div>

      {scenarios.map((scenario, i) => {
        const result = results[i];
        const isRunning = running === i || (running === 'all' && result?.status === 'running');

        const currentHighlight = result?.status === 'done' ? highlightRedundancy(result.current) : null;
        const newHighlight = result?.status === 'done' ? highlightRedundancy(result.new) : null;

        return (
          <div key={i} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ marginTop: 0, color: '#64b5f6', fontSize: 18 }}>
                  <span style={{ background: '#64b5f6', color: '#000', borderRadius: '50%', width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginRight: 10, fontSize: 14 }}>{i + 1}</span>
                  {scenario.name}
                </h2>
                <p style={{ color: '#888', marginTop: -4, fontSize: 13 }}>{scenario.description}</p>
              </div>
              <button onClick={() => runSingle(i)} disabled={running !== null} style={btn('#4a90e2', running !== null)}>
                {isRunning ? 'Running...' : 'Run'}
              </button>
            </div>

            {/* Input data */}
            <details style={{ marginBottom: 12 }}>
              <summary style={{ color: '#888', fontSize: 13, cursor: 'pointer' }}>Show input data</summary>
              <ResultBox label="Old Summary" value={scenario.oldSummary} />
              <ResultBox label="Exchange" value={
                scenario.messages.map(m => `[${m.role}] ${m.content}`).join('\n\n')
              } />
            </details>

            {/* Show prompts if available */}
            {result && (
              <details style={{ marginBottom: 12 }}>
                <summary style={{ color: '#888', fontSize: 13, cursor: 'pointer' }}>Show prompts sent to AI</summary>
                <ResultBox label="Current Prompt (includes system msgs)" value={result.currentPrompt} />
                <ResultBox label="New Prompt (narrative only, no system msgs)" value={result.newPrompt} />
              </details>
            )}

            {/* Results side by side */}
            {result && result.status === 'done' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <ResultBox
                    label={`Current — ${currentHighlight.redundantTerms} redundant terms`}
                    value={currentHighlight.text}
                    style={{ borderColor: currentHighlight.redundantTerms > 2 ? '#f44336' : '#ff9800' }}
                  />
                </div>
                <div>
                  <ResultBox
                    label={`New — ${newHighlight.redundantTerms} redundant terms`}
                    value={newHighlight.text}
                    style={{ borderColor: newHighlight.redundantTerms <= 2 ? '#4caf50' : '#ff9800' }}
                  />
                </div>
              </div>
            )}

            {result && result.status === 'running' && (
              <div style={{ color: '#ff9800', padding: 12 }}>Running both prompts...</div>
            )}

            {result && result.status === 'error' && (
              <div style={{ color: '#f44336', padding: 12 }}>Error: {result.error}</div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default SummarizationTest;
