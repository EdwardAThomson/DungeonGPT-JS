// RagCompare: before/after for the DM memory changes. Embeds a set of narrations IN
// MEMORY (never touches the real IndexedDB memory index), then answers one question
// three ways:
//   Before: one vector per whole message; recall injects the first 300 characters.
//   Chunks (#175): messages split by chunkText; best chunk per message, injected whole.
//   Chunks + names (current engine): the same chunks, each embedded with its scene's
//     names in front (sceneNames), so a "she" paragraph still matches its person.
// Same retrieval knobs both sides (top 3, similarity >= 0.5), so the only differences
// are what gets embedded and what gets injected.

import React, { useState } from 'react';
import { embeddingService } from '../services/embeddingService';
import { chunkText, formatRagContext, sceneNames, chunkEmbeddingText, MAX_CHUNK_CHARS } from '../game/ragEngine';
import { conversationsApi } from '../services/conversationsApi';

const MAX_RESULTS = 3;
const MIN_SIMILARITY = 0.5;
const OLD_SLICE = 300; // pre-#175 recall cut
const EMBED_BATCH = 96; // the worker accepts up to 100 texts per call

// Long, multi-paragraph narrations (the shape real DM replies take), each with a fact
// buried past the first 300 characters.
export const SAMPLE = [
  `The party crests the last rise and Briarwood spreads below them: a timber palisade, smoke from a dozen chimneys, and the steady ring of a hammer from somewhere near the gate. Militia in mismatched leather drill in the yard, more enthusiasm than skill.

Captain Ulric meets them at the gate with a nod and little else. He walks them past the stables, talking of patrols that come back short-handed and farms that have stopped sending grain to market.

At the forge, the old smith Harrow leans on his tongs and lowers his voice. "Goblins hate one thing more than steel," he says. "The silver bell in the ruined chapel. Ring it and they scatter like crows. Nobody's dared fetch it since the raids began."`,
  `The Crooked Pint is loud tonight. A fiddler saws through a reel while farmhands argue over dice, and the innkeeper slides tankards down the bar without looking where they land. Rain hammers the shutters.

In the corner a half-drunk bard named Wren insists on singing the party a ballad about a lost prince, and refuses to stop until Thorin buys her a second ale. Her voice is better than the song.

Later, when the room has thinned, the barman beckons the party close. "The goblins at the hideout use a word at the gate," he murmurs. "Thornback. Say it at the door in the hills and the guards think you're one of their runners."`,
  `The forest road narrows under old oaks, and the light turns green and dim. Birdsong fades the deeper they go, replaced by the creak of branches and the occasional crash of something heavy moving off through the undergrowth.

Wolves come at dusk: four of them, lean and grey, circling the party's fire. Elara's arrows drop the leader and the rest melt back into the trees, but not before one has torn a gash in Thorin's sleeve.

Searching the wolves' den afterwards, Lyria finds a scrap of oilcloth wrapped round a hand-drawn map. It marks a hidden ford south of the old mill, a crossing the goblin raiders must use to reach the farms unseen.`,
  `The climb into the Greenridge Hills is steep and loose underfoot. Scree slides away with every step, and the wind up here carries the smell of woodsmoke and something rotten from the high valleys.

From a ledge they watch a goblin patrol pass below: six raiders, laden with stolen sacks, bickering in their harsh tongue. Lyria counts them and notes the path they take back toward the crags.

A captured scout, terrified, tells them about the chieftain. "Grosk wears the iron crown," he gabbles, "but he fears fire. Burned as a whelp. Torches at his door and he'll hide in the deep cave." Then he bolts into the rocks.`,
  `They make camp in a hollow out of the wind. Thorin keeps the first watch, sharpening his axe, while the others eat cold bread and dried apples by a fire banked low to hide its glow.

Elara is quiet tonight. When pressed, she admits she came north looking for her younger brother Tamsin, who joined a caravan two summers ago and never wrote again. She keeps hoping each village will have word of him.

Before turning in, she presses something into Lyria's hand: a ring of pale green jade, carved with a running hare. "If I don't come back from the hills," she says, "give it to Tamsin. He'll know it's mine."`,
  `Back in Briarwood the market is busier than before. Word of the party's scouting has spread, and stallholders call out greetings and offer them the first pick of the morning's bread and cheese.

The healer, Mother Agnes, sells them salves and bandages, and three healing potions at thirty gold apiece. She warns them the potions sour within a week, so they should not hoard them.

Ulric is waiting at the hall. He has made up his mind: when the party moves on the hideout, fifty militia will march with them to hold the valley mouth so no raider escapes back into the hills.`,
];

export const PRESETS = [
  { q: 'What do the goblins fear?', expect: 'silver bell' },
  { q: 'What is the password for the goblin hideout?', expect: 'Thornback' },
  { q: 'Where is the secret crossing the raiders use?', expect: 'south of the old mill' },
  { q: 'What is the goblin chieftain afraid of?', expect: 'fears fire' },
  { q: 'What did Elara give us?', expect: 'jade',
    note: 'The ring paragraph only says "she", so a plain chunk no longer mentions Elara; the names prefix fixes this.' },
  { q: 'How much do healing potions cost?', expect: 'thirty gold',
    note: 'Control: the price sits inside the first 300 characters, so the old cut keeps it too.' },
];

const cosine = (a, b) => {
  let dot = 0; let na = 0; let nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
};

const embedAll = async (texts, embedBatch = (t) => embeddingService.embed(t).then((r) => r.vectors)) => {
  const out = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    out.push(...await embedBatch(texts.slice(i, i + EMBED_BATCH)));
  }
  return out;
};

// The pre-#175 prompt block: first 300 characters of each recalled whole message.
export const formatOld = (results) => (results.length
  ? `\n\n[RECALLED MEMORIES FROM PAST EVENTS]\n${results.map((r) => `- ${r.text.slice(0, OLD_SLICE)}`).join('\n')}`
  : '');

/** Embed narration both ways: one vector per whole message, and one per chunk. */
export const buildMemoryIndex = async (messages, embedBatch) => {
  const chunkRows = messages.flatMap((text, msgIndex) => chunkText(text).map((c, chunkIndex) => ({ text: c, msgIndex, chunkIndex })));
  const wholeVectors = await embedAll(messages, embedBatch);
  const chunkVectors = await embedAll(chunkRows.map((c) => c.text), embedBatch);
  const names = messages.map((m) => sceneNames(m));
  const namedVectors = await embedAll(chunkRows.map((c) => chunkEmbeddingText(c.text, names[c.msgIndex])), embedBatch);
  return {
    whole: messages.map((text, msgIndex) => ({ text, msgIndex, vector: wholeVectors[msgIndex] })),
    chunks: chunkRows.map((c, i) => ({ ...c, vector: chunkVectors[i] })),
    named: chunkRows.map((c, i) => ({ ...c, vector: namedVectors[i] })),
  };
};

/** Recall for one question vector three ways, with the prompt block each produces. */
export const recallBoth = (index, queryVector) => {
  const score = (rows) => rows.map((r) => ({ ...r, similarity: cosine(queryVector, r.vector) }))
    .filter((r) => r.similarity >= MIN_SIMILARITY)
    .sort((a, b) => b.similarity - a.similarity);
  const bestPerMessage = (rows) => score(rows)
    .filter((r, i, all) => all.findIndex((o) => o.msgIndex === r.msgIndex) === i)
    .slice(0, MAX_RESULTS);
  const before = score(index.whole).slice(0, MAX_RESULTS);
  const after = bestPerMessage(index.chunks);
  const named = index.named ? bestPerMessage(index.named) : [];
  return {
    before, after, named,
    beforeBlock: formatOld(before), afterBlock: formatRagContext(after), namedBlock: formatRagContext(named),
  };
};

const box = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 16 };
const mono = { fontFamily: 'monospace', fontSize: 12.5, background: 'var(--bg)', padding: 12, borderRadius: 4, whiteSpace: 'pre-wrap', color: 'var(--text)', border: '1px solid var(--border)', maxHeight: 360, overflowY: 'auto' };
const label = { fontSize: 11, color: 'var(--text-muted, #888)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '10px 0 4px' };

const Verdict = ({ text, expect }) => {
  if (!expect) return null;
  const hit = text.toLowerCase().includes(expect.toLowerCase());
  return (
    <span style={{ marginLeft: 8, fontWeight: 700, color: hit ? 'var(--success, #4caf50)' : '#e06c6c' }}>
      {hit ? `contains "${expect}"` : `missing "${expect}"`}
    </span>
  );
};

const ResultList = ({ results, old }) => (
  <ol style={{ margin: 0, paddingLeft: 18 }}>
    {results.map((r) => {
      const shown = old ? r.text.slice(0, OLD_SLICE) : r.text;
      const dropped = old ? r.text.slice(OLD_SLICE) : '';
      return (
        <li key={`${r.msgIndex}-${r.chunkIndex ?? 'w'}`} style={{ marginBottom: 10, fontSize: 13, lineHeight: 1.5 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #888)' }}>
            message {r.msgIndex + 1}{r.chunkIndex != null ? `, chunk ${r.chunkIndex + 1}` : ''} · similarity {r.similarity.toFixed(3)} · {shown.length} chars injected
          </div>
          <span>{shown}</span>
          {dropped && <span style={{ opacity: 0.35, textDecoration: 'line-through' }}>{dropped}</span>}
        </li>
      );
    })}
  </ol>
);

const RagCompare = () => {
  const [source, setSource] = useState('sample');
  const [pasted, setPasted] = useState('');
  const [saves, setSaves] = useState(null);
  const [saveId, setSaveId] = useState('');
  const [saveMessages, setSaveMessages] = useState(null);
  const [question, setQuestion] = useState(PRESETS[0].q);
  const [expect, setExpect] = useState(PRESETS[0].expect);
  const [index, setIndex] = useState(null); // { key, messages, whole:[{text,vector,msgIndex}], chunks:[...] }
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const messages = source === 'sample' ? SAMPLE
    : source === 'paste' ? pasted.split(/\n-{3,}\n/).map((s) => s.trim()).filter(Boolean)
      : (saveMessages || []);
  const sourceKey = `${source}:${source === 'paste' ? pasted : source === 'save' ? saveId : ''}`;

  const loadSaves = async () => {
    setError(''); setBusy('Loading your saves...');
    try { setSaves(await conversationsApi.list()); } catch (e) { setError(`Could not list saves: ${e.message}`); }
    setBusy('');
  };
  const pickSave = async (id) => {
    setSaveId(id); setSaveMessages(null); setIndex(null); setResult(null);
    if (!id) return;
    setBusy('Loading save...');
    try {
      const row = await conversationsApi.getById(id);
      const raw = row?.conversation_data;
      const data = typeof raw === 'string' ? JSON.parse(raw) : (raw || []);
      setSaveMessages(data.filter((m) => m.role === 'ai' && m.content).map((m) => m.content));
    } catch (e) { setError(`Could not load that save: ${e.message}`); }
    setBusy('');
  };

  const compare = async () => {
    setError(''); setResult(null);
    if (messages.length === 0) { setError('No narration to compare: pick a source with some messages.'); return; }
    if (!question.trim()) { setError('Ask a question first.'); return; }
    try {
      let idx = index && index.key === sourceKey ? index : null;
      if (!idx) {
        setBusy(`Embedding ${messages.length} whole messages and ${chunkCount} chunks (twice: plain and with names)...`);
        idx = { key: sourceKey, ...(await buildMemoryIndex(messages)) };
        setIndex(idx);
      }
      setBusy('Embedding the question...');
      setResult(recallBoth(idx, await embeddingService.embedSingle(question.trim())));
    } catch (e) {
      setError(`Embedding failed: ${e.message}. Embeddings go through the worker and need you to be signed in.`);
    }
    setBusy('');
  };

  const chunkCount = messages.reduce((n, m) => n + chunkText(m).length, 0);

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: '0 auto', color: 'var(--text)', textAlign: 'left' }}>
      <h2 style={{ marginTop: 0 }}>DM memory: before / after</h2>
      <p style={{ fontSize: 14, opacity: 0.85, maxWidth: 900 }}>
        Embeds the narration below in memory only (your real memory index is not touched), then recalls memories for one
        question three ways. <b>Before</b>: one vector per whole message, first {OLD_SLICE} characters injected.
        <b> Chunks</b> (#175): messages split into chunks of up to {MAX_CHUNK_CHARS} characters, best chunk per message
        injected whole. <b>Chunks + names</b> (what the game does now): the same chunks, each embedded with the names its
        scene mentions, so a paragraph that only says "she" still matches its person. All use the top {MAX_RESULTS} with
        similarity of at least {MIN_SIMILARITY}.
      </p>

      <div style={box}>
        <div style={label}>Narration</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 14 }}>
          {[['sample', 'Built-in sample (6 long scenes)'], ['paste', 'Paste your own'], ['save', 'From one of my saves']].map(([v, l]) => (
            <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, textTransform: 'none', letterSpacing: 'normal' }}>
              <input type="radio" name="src" checked={source === v} onChange={() => { setSource(v); setResult(null); if (v === 'save' && !saves) loadSaves(); }} /> {l}
            </label>
          ))}
        </div>
        {source === 'paste' && (
          <textarea value={pasted} onChange={(e) => { setPasted(e.target.value); setResult(null); }} rows={8}
            placeholder={'Paste narration. Separate messages with a line of three dashes:\n---'}
            style={{ width: '100%', marginTop: 10, fontFamily: 'inherit', fontSize: 13, padding: 8, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4 }} />
        )}
        {source === 'save' && (
          <div style={{ marginTop: 10 }}>
            {saves ? (
              <select value={saveId} onChange={(e) => pickSave(e.target.value)} style={{ padding: 6, minWidth: 360 }}>
                <option value="">Pick a save...</option>
                {saves.map((s) => <option key={s.sessionId} value={s.sessionId}>{s.conversation_name || s.sessionId}</option>)}
              </select>
            ) : <button type="button" onClick={loadSaves}>Load my saves</button>}
          </div>
        )}
        <p style={{ fontSize: 13, opacity: 0.75, margin: '10px 0 0' }}>
          {messages.length} message(s) · {chunkCount} chunk(s) after splitting
          {messages.length > 0 && ` · ${messages.filter((m) => m.length > OLD_SLICE).length} longer than the old ${OLD_SLICE}-character cut`}
        </p>
      </div>

      <div style={box}>
        <div style={label}>Question</div>
        {source === 'sample' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {PRESETS.map((p) => (
              <button key={p.q} type="button" onClick={() => { setQuestion(p.q); setExpect(p.expect); setResult(null); }}
                style={{ fontSize: 12, padding: '4px 10px', opacity: question === p.q ? 1 : 0.7 }}>{p.q}</button>
            ))}
          </div>
        )}
        {source === 'sample' && PRESETS.find((p) => p.q === question)?.note && (
          <p style={{ fontSize: 12.5, opacity: 0.8, margin: '0 0 8px' }}>{PRESETS.find((p) => p.q === question).note}</p>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={question} onChange={(e) => { setQuestion(e.target.value); setResult(null); }} style={{ flex: '1 1 420px', padding: 8 }} />
          <input value={expect} onChange={(e) => setExpect(e.target.value)} placeholder="Expected answer text (optional)" style={{ flex: '0 1 260px', padding: 8 }} />
          <button type="button" onClick={compare} disabled={!!busy}>{busy ? 'Working...' : 'Compare'}</button>
        </div>
        {busy && <p style={{ fontSize: 13, opacity: 0.8 }}>{busy}</p>}
        {error && <p style={{ color: '#e06c6c', fontSize: 13 }}>{error}</p>}
      </div>

      {result && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
          {[['Before: whole messages, cut at 300', result.before, result.beforeBlock, true],
            ['Chunks (#175): paragraphs, whole', result.after, result.afterBlock, false],
            ['Chunks + names (current engine)', result.named, result.namedBlock, false]].map(([title, rows, block, old]) => (
            <div key={title} style={box}>
              <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>
                {title}<Verdict text={block} expect={expect} />
              </h3>
              <div style={{ fontSize: 12, opacity: 0.75 }}>{rows.length} recalled · {block.length} characters added to the prompt</div>
              <div style={label}>Recalled</div>
              {rows.length ? <ResultList results={rows} old={old} /> : <p style={{ fontSize: 13, opacity: 0.7 }}>Nothing passed the similarity threshold.</p>}
              <div style={label}>Exactly what the DM prompt gets</div>
              <div style={mono}>{block.trim() || '(nothing)'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RagCompare;
