import React, { useState, useRef, useEffect, useCallback, useContext } from 'react';
import SettingsContext from '../contexts/SettingsContext';
import { llmService } from '../services/llmService';
import { buildModelOptions, resolveProviderAndModel } from '../llm/modelResolver';
import { ragEngine } from '../game/ragEngine';
import { ragStore } from '../services/ragStore';
import SafeMarkdownMessage from '../components/SafeMarkdownMessage';

// ── Shared styles ──
const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 16 };
const mono = { fontFamily: 'monospace', fontSize: 13, background: 'var(--bg)', padding: 12, borderRadius: 4, whiteSpace: 'pre-wrap', color: 'var(--text)', maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)' };
const labelStyle = { fontSize: 11, color: 'var(--text-muted, #888)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 };
const btnBase = { padding: '8px 16px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#fff' };

const TEST_SESSION_ID = 'rag-test-session';

// ── Mock party ──
const MOCK_HEROES = [
  { characterName: 'Elara', characterClass: 'Ranger', level: 5, race: 'Half-Elf', currentHP: 38, maxHP: 42, xp: 6500 },
  { characterName: 'Thorin', characterClass: 'Fighter', level: 5, race: 'Dwarf', currentHP: 52, maxHP: 52, xp: 7200 },
  { characterName: 'Lyria', characterClass: 'Mage', level: 4, race: 'Human', currentHP: 22, maxHP: 28, xp: 4800 },
];

// ── Sample conversation for quick testing ──
const SAMPLE_EVENTS = [
  "The party arrives at the windswept village of Briarstone. A pall of grey smoke hangs over the thatched rooftops. Near the central well, an elderly woman named Mirabel beckons to Elara. \"Thank the gods — travelers. The mine foreman, Dugan, hasn't returned in three days. He went to investigate strange noises in the lower shafts.\"",
  "Thorin purchases a sturdy rope and three torches from the general store. The shopkeeper, a nervous gnome named Pip, whispers that he saw green lights flickering near the mine entrance last night. He gives Thorin a crude map of the upper mine levels, scrawled on the back of a receipt.",
  "At the tavern, The Rusty Pick, Lyria overhears two miners arguing. One claims the noises are just cave-ins, but the other — a scarred woman named Hilde — insists she heard chanting in a language she didn't recognize. Hilde offers to guide the party to the mine entrance at dawn.",
  "The party enters the mine. The air grows damp and cold. Elara's keen eyes spot fresh bootprints in the dust — Dugan's, by the size — leading deeper into shaft B. Strange phosphorescent moss covers the walls, pulsing faintly with a greenish glow.",
  "In a collapsed side tunnel, Thorin discovers a leather satchel containing Dugan's journal. The last entry reads: \"Found something behind the old seam wall. Not natural. The crystals are warm to the touch and hum when you get close. Going back tomorrow with proper tools. Told no one.\"",
  "The party encounters a nest of shadow spiders blocking the passage to shaft B's lower level. Thorin holds the line while Lyria's fire bolt ignites the webbing. Elara lands a critical arrow shot on the brood mother. The creatures scatter into cracks in the rock.",
  "Beyond the spider nest, the tunnel opens into a vast natural cavern. At its center stands a pillar of dark crystal, roughly ten feet tall, radiating a low hum that Lyria recognizes as arcane resonance. Dugan lies unconscious at its base, his hands burned as if he tried to touch it.",
  "Lyria examines the crystal pillar and determines it's a conduit — drawing magical energy from deep underground and channeling it upward. She finds runes carved into its base that match descriptions in her studies of the Shadow Convergence, an ancient magical catastrophe.",
  "The party carries Dugan out of the mine. He regains consciousness halfway and mumbles about \"the voice in the crystal\" telling him to bring more people down. Mirabel weeps with relief when she sees him alive. She gives the party a silver locket as a reward — inside is a tiny portrait of a young man in armor.",
  "Hilde tells the party that three other mines in the region have been abandoned for similar reasons — strange lights, missing workers, incomprehensible whispers. She marks their locations on Pip's map. The nearest is a two-day journey north, in the foothills near Grimspire Peak.",
  "Before leaving Briarstone, Elara visits the village shrine. The priestess, Sister Calla, examines the silver locket and gasps. \"This is Ser Aldwin's likeness — Mirabel's son. He was lost fifteen years ago investigating ruins near Grimspire. If the crystal is connected to the Shadow Convergence... he may still be alive, trapped in the between-place.\"",
  "The party sets out north toward Grimspire Peak. Along the forest road, they encounter a merchant caravan heading south. The caravan master, a jovial halfling named Bramble, trades information: the road ahead is clear but wolves have been spotted near the river crossing. He sells Lyria a scroll of Detect Magic at a fair price.",
  "At the river crossing, the party finds the bridge partially collapsed. Thorin engineers a repair using timbers from a nearby deadfall while Elara stands watch. She spots wolf tracks on the far bank — unusually large, with a strange fifth toe impression that doesn't match any normal wolf species.",
  "Camp on the second night is interrupted by a lone figure stumbling out of the darkness — a young man in tattered robes, disoriented and muttering. He identifies himself as Fennick, an apprentice mage from the Grimspire Academy. He says the academy has been sealed shut for a week, with a shimmering barrier covering every entrance. His master told him to run before the barrier closed completely.",
  "Fennick explains that his master, Archmage Vesper, was researching the crystal pillars when something went wrong. The barrier appeared overnight. Students and faculty are trapped inside. He draws a diagram of the academy layout from memory and marks where the barrier seems weakest — a service tunnel on the north side that was partially underground when the barrier formed.",
];

const SYSTEM_PROMPT = `You are a dungeon master for a dark fantasy RPG. The party consists of: Elara (Half-Elf Ranger, Lv5), Thorin (Dwarf Fighter, Lv5), and Lyria (Human Mage, Lv4). Keep responses to 2-3 paragraphs. Be vivid and atmospheric.`;

const RagTest = () => {
  const { settings } = useContext(SettingsContext);
  const modelOptions = buildModelOptions(settings);
  const [selectedModel, setSelectedModel] = useState(modelOptions[0]?.value || '');

  // Chat state
  const [conversation, setConversation] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const conversationEndRef = useRef(null);

  // RAG state
  const [indexStatus, setIndexStatus] = useState({ status: 'empty', indexed: 0, total: 0 });
  const [queryInput, setQueryInput] = useState('');
  const [queryResults, setQueryResults] = useState([]);
  const [isQuerying, setIsQuerying] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState(null);
  const [isEmbedding, setIsEmbedding] = useState(false);
  const [ragEnabled, setRagEnabled] = useState(true);

  // Auto-scroll conversation
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation, isLoading]);

  // Refresh index status — accepts optional conversation override for when state hasn't propagated yet
  const refreshStatus = useCallback(async (convOverride) => {
    try {
      const conv = convOverride || conversation;
      const status = await ragEngine.getIndexStatus(TEST_SESSION_ID, conv);
      setIndexStatus(status);
    } catch (err) {
      console.error('Failed to get index status:', err);
    }
  }, [conversation]);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  // ── Chat handlers ──

  const handleSend = async (e) => {
    e.preventDefault();
    if (!userInput.trim() || isLoading) return;

    const userMsg = { role: 'user', content: userInput.trim() };
    const updatedConv = [...conversation, userMsg];
    setConversation(updatedConv);
    setUserInput('');
    setIsLoading(true);
    setError(null);

    try {
      const { provider, model } = resolveProviderAndModel(selectedModel, settings);

      // Build prompt with RAG context if enabled
      let ragContext = '';
      if (ragEnabled && indexStatus.indexed > 0) {
        const results = await ragEngine.query(TEST_SESSION_ID, userMsg.content, { maxResults: 3 });
        if (results.length > 0) {
          ragContext = '\n\n[RECALLED EVENTS]\n' + results.map(r => `- ${r.text.slice(0, 200)}`).join('\n');
        }
      }

      // Recent conversation context (last few exchanges)
      const recentContext = updatedConv.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n');

      const prompt = `${SYSTEM_PROMPT}${ragContext}\n\n[RECENT CONVERSATION]\n${recentContext}\n\n[PLAYER ACTION]\n${userMsg.content}\n\n[NARRATE]`;

      const responseText = await llmService.generateUnified({
        provider,
        model,
        prompt,
        maxTokens: 800,
        temperature: 0.7,
      });

      const aiMsg = { role: 'ai', content: responseText };
      const finalConv = [...updatedConv, aiMsg];
      setConversation(finalConv);

      // Fire-and-forget: embed the AI response
      setIsEmbedding(true);
      const msgIndex = finalConv.length - 1;
      ragEngine.embedAndStore(TEST_SESSION_ID, responseText, { msgIndex }).then(() => {
        setIsEmbedding(false);
        refreshStatus();
      }).catch(() => setIsEmbedding(false));

    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Sample data loader ──

  const loadSampleConversation = async () => {
    const msgs = SAMPLE_EVENTS.map(text => ({ role: 'ai', content: text }));
    setConversation(msgs);
    setIsBackfilling(true);
    setBackfillProgress({ indexed: 0, total: msgs.length });

    try {
      await ragEngine.backfill(TEST_SESSION_ID, msgs, {
        onProgress: (indexed, total) => setBackfillProgress({ indexed, total }),
        batchSize: 5,
      });
    } catch (err) {
      setError('Backfill failed: ' + err.message);
    } finally {
      setIsBackfilling(false);
      setBackfillProgress(null);
      refreshStatus(msgs);
    }
  };

  // ── RAG query handler ──

  const handleQuery = async (e) => {
    e.preventDefault();
    if (!queryInput.trim() || isQuerying) return;
    setIsQuerying(true);
    setQueryResults([]);

    try {
      const results = await ragEngine.query(TEST_SESSION_ID, queryInput, { maxResults: 5, minSimilarity: 0.3 });
      setQueryResults(results);
    } catch (err) {
      setError('Query failed: ' + err.message);
    } finally {
      setIsQuerying(false);
    }
  };

  // ── Clear index ──

  const handleClearIndex = async () => {
    await ragStore.clearSession(TEST_SESSION_ID);
    setQueryResults([]);
    refreshStatus();
  };

  const handleClearAll = async () => {
    await ragStore.clearSession(TEST_SESSION_ID);
    setConversation([]);
    setQueryResults([]);
    setError(null);
    refreshStatus();
  };

  return (
    <div style={{ display: 'flex', gap: 16, minHeight: '70vh' }}>
      {/* Left: Chat Panel */}
      <div style={{ flex: '1 1 60%', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontFamily: 'var(--header-font)' }}>RAG Test — Adventure Chat</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12 }}
              >
                {modelOptions.map((opt, i) => (
                  <option key={`${opt.value}-${i}`} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={ragEnabled} onChange={(e) => setRagEnabled(e.target.checked)} />
                RAG
              </label>
            </div>
          </div>

          {/* Party display */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 12, padding: '8px 12px', background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)' }}>
            {MOCK_HEROES.map(hero => (
              <div key={hero.characterName} style={{ fontSize: 12, lineHeight: 1.4 }}>
                <strong style={{ color: 'var(--primary)' }}>{hero.characterName}</strong>
                <div style={{ color: 'var(--text-secondary)' }}>Lv{hero.level} {hero.race} {hero.characterClass}</div>
                <div style={{ color: hero.currentHP < hero.maxHP * 0.5 ? 'var(--state-danger-bright)' : 'var(--state-success)' }}>
                  HP: {hero.currentHP}/{hero.maxHP}
                </div>
              </div>
            ))}
          </div>

          {/* Conversation area */}
          <div style={{
            height: 400,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: 12,
            background: 'var(--bg)',
            borderRadius: 6,
            border: '1px solid var(--border)',
            marginBottom: 12,
          }}>
            {conversation.length === 0 && !isLoading && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted, #888)', padding: 40, fontStyle: 'italic' }}>
                Send a message or load sample data to begin testing.
              </div>
            )}
            {conversation.map((msg, i) => (
              <div
                key={i}
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  maxWidth: '80%',
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  background: msg.role === 'user' ? 'var(--primary)' : 'var(--surface)',
                  color: msg.role === 'user' ? 'var(--bg)' : 'var(--text)',
                  border: msg.role === 'ai' ? '1px solid var(--border)' : 'none',
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              >
                <SafeMarkdownMessage content={msg.content} />
              </div>
            ))}
            {isLoading && (
              <div style={{ alignSelf: 'flex-start', padding: '10px 14px', color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: 13 }}>
                AI is thinking...
              </div>
            )}
            {error && (
              <div style={{ padding: '10px 14px', background: 'var(--state-danger-bright-10, #ff000015)', color: 'var(--state-danger-bright, #ff4444)', borderRadius: 8, fontSize: 13 }}>
                {error}
              </div>
            )}
            <div ref={conversationEndRef} />
          </div>

          {/* Input area */}
          <form onSubmit={handleSend} style={{ display: 'flex', gap: 8 }}>
            <textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="Type your action..."
              rows={2}
              style={{ flex: 1, padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', resize: 'vertical', fontSize: 14, fontFamily: 'inherit' }}
              disabled={isLoading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
            />
            <button
              type="submit"
              disabled={!userInput.trim() || isLoading}
              style={{ ...btnBase, background: (!userInput.trim() || isLoading) ? '#555' : 'var(--primary)', alignSelf: 'flex-end', padding: '10px 20px' }}
            >
              {isLoading ? '...' : 'Send'}
            </button>
          </form>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={loadSampleConversation} disabled={isBackfilling} style={{ ...btnBase, background: isBackfilling ? '#555' : '#2d7d46' }}>
              {isBackfilling ? `Loading... (${backfillProgress?.indexed || 0}/${backfillProgress?.total || 0})` : 'Load Sample Data'}
            </button>
            <button onClick={handleClearAll} style={{ ...btnBase, background: '#8b3a3a' }}>
              Clear All
            </button>
          </div>
        </div>
      </div>

      {/* Right: RAG Panel */}
      <div style={{ flex: '1 1 40%', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Index Status */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h4 style={{ margin: 0, fontFamily: 'var(--header-font)' }}>RAG Index</h4>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {isEmbedding && <span style={{ fontSize: 11, color: 'var(--state-warning)' }}>Embedding...</span>}
              <span style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 10,
                fontWeight: 600,
                background: indexStatus.status === 'current' ? '#2d7d4620' : indexStatus.status === 'partial' ? '#c9971520' : '#8b3a3a20',
                color: indexStatus.status === 'current' ? '#2d7d46' : indexStatus.status === 'partial' ? '#c99715' : '#8b3a3a',
              }}>
                {indexStatus.status}
              </span>
            </div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
            {indexStatus.indexed} / {indexStatus.total} events indexed
          </div>
          {indexStatus.indexed > 0 && (
            <div style={{ width: '100%', height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                width: `${indexStatus.total > 0 ? (indexStatus.indexed / indexStatus.total) * 100 : 0}%`,
                height: '100%',
                background: 'var(--primary)',
                borderRadius: 3,
                transition: 'width 0.3s ease',
              }} />
            </div>
          )}
          <button onClick={handleClearIndex} style={{ ...btnBase, background: '#666', marginTop: 8, fontSize: 11, padding: '4px 12px' }}>
            Clear Index
          </button>
        </div>

        {/* Query Panel */}
        <div style={card}>
          <h4 style={{ margin: '0 0 8px', fontFamily: 'var(--header-font)' }}>Semantic Search</h4>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 10px' }}>
            Search the indexed events using natural language. Tests cosine similarity retrieval.
          </p>
          <form onSubmit={handleQuery} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              type="text"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="e.g. What did the old woman say about the mine?"
              style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
              disabled={isQuerying || indexStatus.indexed === 0}
            />
            <button
              type="submit"
              disabled={!queryInput.trim() || isQuerying || indexStatus.indexed === 0}
              style={{ ...btnBase, background: (!queryInput.trim() || isQuerying || indexStatus.indexed === 0) ? '#555' : '#4a7ab5' }}
            >
              {isQuerying ? '...' : 'Search'}
            </button>
          </form>

          {/* Quick query buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
            {['Who is Mirabel?', 'What was in the journal?', 'Tell me about the crystal', 'spider encounter', 'Where is Grimspire?'].map(q => (
              <button
                key={q}
                onClick={() => { setQueryInput(q); }}
                style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                {q}
              </button>
            ))}
          </div>

          {/* Results */}
          {queryResults.length > 0 && (
            <div>
              <div style={labelStyle}>Results ({queryResults.length})</div>
              {queryResults.map((result, i) => (
                <div key={i} style={{ marginBottom: 10, padding: 10, background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Event #{result.msgIndex}</span>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: result.similarity > 0.7 ? '#2d7d46' : result.similarity > 0.5 ? '#c99715' : '#8b3a3a',
                    }}>
                      {(result.similarity * 100).toFixed(1)}% match
                    </span>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text)' }}>
                    {result.text.length > 300 ? result.text.slice(0, 300) + '...' : result.text}
                  </div>
                </div>
              ))}
            </div>
          )}

          {queryResults.length === 0 && queryInput && !isQuerying && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: 12 }}>
              No results yet. Run a search above.
            </div>
          )}
        </div>

        {/* Backfill Test */}
        {backfillProgress && (
          <div style={card}>
            <div style={labelStyle}>Backfill Progress</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Syncing memory... ({backfillProgress.indexed}/{backfillProgress.total})
            </div>
            <div style={{ width: '100%', height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                width: `${backfillProgress.total > 0 ? (backfillProgress.indexed / backfillProgress.total) * 100 : 0}%`,
                height: '100%',
                background: '#4a7ab5',
                borderRadius: 3,
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RagTest;
