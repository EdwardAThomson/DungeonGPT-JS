import React, { useState, useRef, useContext } from 'react';
import SettingsContext from '../contexts/SettingsContext';
import { DM_PROTOCOL } from '../data/prompts';
import { apiFetch, buildApiUrl } from '../services/apiClient';

const API_PATH = '/api/llm';

// ── Shared styles ──
const card = { background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: 16, marginBottom: 20 };
const btn = (color, disabled) => ({ padding: '10px 20px', background: disabled ? '#555' : color, color: '#fff', border: 'none', borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600 });
const mono = { fontFamily: 'monospace', fontSize: 13, background: '#0d1117', padding: 12, borderRadius: 4, whiteSpace: 'pre-wrap', color: '#e0e0e0', minHeight: 40, maxHeight: 400, overflowY: 'auto', border: '1px solid #333' };
const label = { fontSize: 12, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const pass = { color: '#4caf50', fontWeight: 700 };
const fail = { color: '#f44336', fontWeight: 700 };

const sanitizeResponse = (text) => {
  if (!text) return '';
  let s = text.replace(/\[STRICT DUNGEON MASTER PROTOCOL\][\s\S]*?\[\/STRICT DUNGEON MASTER PROTOCOL\]/gi, '');
  [/\[ADVENTURE START\]/gi, /\[GAME INFORMATION\]/gi, /\[TASK\]/gi, /\[CONTEXT\]/gi, /\[SUMMARY\]/gi, /\[PLAYER ACTION\]/gi, /\[NARRATE\]/gi].forEach(m => { s = s.replace(m, ''); });
  return s.trim();
};

// ── Test Card wrapper ──
const TestCard = ({ number, title, description, children }) => (
  <div style={card}>
    <h2 style={{ marginTop: 0, color: '#64b5f6', fontSize: 18 }}>
      <span style={{ background: '#64b5f6', color: '#000', borderRadius: '50%', width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginRight: 10, fontSize: 14 }}>{number}</span>
      {title}
    </h2>
    <p style={{ color: '#888', marginTop: -4, fontSize: 13 }}>{description}</p>
    {children}
  </div>
);

const ResultBox = ({ label: lbl, value, isError }) => (
  <div style={{ marginTop: 12 }}>
    <div style={label}>{lbl}</div>
    <div style={{ ...mono, border: isError ? '2px solid #f44336' : '1px solid #333', color: isError ? '#f44336' : '#e0e0e0' }}>
      {value || '(no result yet)'}
    </div>
  </div>
);

const LLMDebug = () => {
  const { selectedProvider, selectedModel } = useContext(SettingsContext);
  const [model, setModel] = useState(selectedModel || 'gemini-3-flash-preview'); // 1 LLM

  // ── Test 1: Server connectivity ──
  const [t1Status, setT1Status] = useState(null);
  const [t1Running, setT1Running] = useState(false);
  const runTest1 = async () => {
    setT1Running(true); setT1Status(null);
    try {
      const resp = await apiFetch(`${API_PATH}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backend: 'gemini', prompt: 'Say hello', model }),
      });
      if (!resp.ok) {
        setT1Status({ ok: false, msg: `Server responded with ${resp.status}: ${await resp.text()}` });
      } else {
        const data = await resp.json();
        setT1Status({ ok: true, msg: `Server is reachable. Task created: ${data.id} (status: ${data.status})`, taskId: data.id });
      }
    } catch (e) {
      setT1Status({ ok: false, msg: `Cannot reach server at ${buildApiUrl(API_PATH)}. Error: ${e.message}\n\nMake sure the backend is running: node src/server.js` });
    }
    setT1Running(false);
  };

  // ── Test 2: SSE Streaming ──
  const [t2Status, setT2Status] = useState(null);
  const [t2Running, setT2Running] = useState(false);
  const [t2Events, setT2Events] = useState([]);
  const [t2Response, setT2Response] = useState('');
  const t2EsRef = useRef(null);
  const runTest2 = async () => {
    setT2Running(true); setT2Status(null); setT2Events([]); setT2Response('');
    // Create task first
    let id;
    try {
      const resp = await apiFetch(`${API_PATH}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backend: 'gemini', prompt: 'Say the word "pineapple" and nothing else.', model }),
      });
      const data = await resp.json();
      id = data.id;
    } catch (e) {
      setT2Status({ ok: false, msg: `Task creation failed: ${e.message}. Run Test 1 first.` });
      setT2Running(false);
      return;
    }

    const events = [];
    let responseText = '';
    const es = new EventSource(buildApiUrl(`${API_PATH}/tasks/${id}/stream`));
    t2EsRef.current = es;
    let gotDone = false;

    es.onmessage = (event) => {
      try {
        const d = JSON.parse(event.data);
        const entry = `${d.type}${d.data?.stream ? ':' + d.data.stream : ''}${d.data?.state ? ':' + d.data.state : ''} ${d.data?.line ? '→ ' + d.data.line.substring(0, 80) : ''}`;
        events.push(entry);
        setT2Events([...events]);

        // Capture stdout content for display
        if (d.type === 'log' && d.data?.stream === 'stdout' && d.data?.line) {
          responseText += d.data.line + '\n';
          setT2Response(responseText);
        }

        if (d.type === 'done') {
          gotDone = true;
          es.close();
          const stdoutEvents = events.filter(e => e.startsWith('log:stdout'));
          setT2Status({
            ok: stdoutEvents.length > 0,
            msg: stdoutEvents.length > 0
              ? `Received ${events.length} SSE events, ${stdoutEvents.length} stdout chunks. Stream working.`
              : `Received ${events.length} SSE events but 0 stdout chunks. The runner may not be extracting assistant messages.`
          });
          setT2Running(false);
        }
        if (d.type === 'error') {
          es.close();
          setT2Status({ ok: false, msg: `Task errored: ${JSON.stringify(d.data)}` });
          setT2Running(false);
        }
      } catch (e) { /* ignore parse errors */ }
    };

    es.onerror = () => {
      if (gotDone) return;
      es.close();
      setT2Status({ ok: false, msg: `SSE connection dropped after ${events.length} events. Server may have crashed.` });
      setT2Running(false);
    };

    setTimeout(() => {
      if (!gotDone) {
        es.close();
        setT2Status({ ok: false, msg: `Timeout after 30s. Got ${events.length} events but no 'done'. This is the race condition bug.` });
        setT2Running(false);
      }
    }, 30000);
  };

  // ── Test 3: Response parsing ──
  const [t3Status, setT3Status] = useState(null);
  const [t3Running, setT3Running] = useState(false);
  const [t3Raw, setT3Raw] = useState('');
  const [t3Sanitized, setT3Sanitized] = useState('');
  const [t3Events, setT3Events] = useState([]);
  const [t3Elapsed, setT3Elapsed] = useState(0);
  const runTest3 = async () => {
    setT3Running(true); setT3Status(null); setT3Raw(''); setT3Sanitized(''); setT3Events([]); setT3Elapsed(0);
    const startTime = Date.now();
    const elapsedInterval = setInterval(() => setT3Elapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);

    const prompt = DM_PROTOCOL + `[CONTEXT]\nSetting: Fantasy kingdom. Party: Marius (Paladin).\nPlayer moved to plains (7, 2).\n\n[TASK]\nDescribe what the party sees. Begin directly with the narrative.`;

    let id;
    try {
      const resp = await apiFetch(`${API_PATH}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backend: 'gemini', prompt, model }),
      });
      const data = await resp.json();
      id = data.id;
    } catch (e) {
      setT3Status({ ok: false, msg: `Task creation failed: ${e.message}` });
      setT3Running(false);
      return;
    }

    const es = new EventSource(buildApiUrl(`${API_PATH}/tasks/${id}/stream`));
    let fullText = '';
    let gotDone = false;
    const events = [];

    es.onmessage = (event) => {
      try {
        const d = JSON.parse(event.data);
        const entry = `${d.type}${d.data?.stream ? ':' + d.data.stream : ''}${d.data?.state ? ':' + d.data.state : ''}`;
        events.push(entry);
        setT3Events([...events]);
        if (d.type === 'log' && d.data.stream === 'stdout') {
          fullText += d.data.line + '\n';
          setT3Raw(fullText); // live update
        }
        if (d.type === 'done') {
          gotDone = true;
          clearInterval(elapsedInterval);
          es.close();
          setT3Raw(fullText);
          const sanitized = sanitizeResponse(fullText);
          setT3Sanitized(sanitized);

          const checks = [];
          if (!fullText.trim()) checks.push('Raw text is EMPTY (no stdout received)');
          if (fullText.includes('[STRICT DUNGEON MASTER')) checks.push('Raw text contains DM_PROTOCOL echo (prompt leaked)');
          if (fullText.includes('[CONTEXT]') || fullText.includes('[TASK]')) checks.push('Raw text contains prompt markers ([CONTEXT]/[TASK])');
          if (!sanitized.trim() && fullText.trim()) checks.push('Sanitizer stripped ALL content (sanitize bug)');
          if (!sanitized.trim() && !fullText.trim()) checks.push('No content at all (runner not capturing assistant messages)');

          setT3Status({
            ok: sanitized.trim().length > 0 && checks.length === 0,
            msg: checks.length === 0
              ? `Response OK. ${fullText.length} chars raw → ${sanitized.length} chars sanitized.`
              : `Issues found:\n${checks.map(c => '  - ' + c).join('\n')}`
          });
          setT3Running(false);
        }
        if (d.type === 'error') {
          es.close();
          setT3Status({ ok: false, msg: `Task error: ${JSON.stringify(d.data)}` });
          setT3Running(false);
        }
      } catch (e) { /* ignore */ }
    };
    es.onerror = () => { if (!gotDone) { clearInterval(elapsedInterval); es.close(); setT3Status({ ok: false, msg: 'SSE connection lost' }); setT3Running(false); } };
    setTimeout(() => { if (!gotDone) { clearInterval(elapsedInterval); es.close(); setT3Status({ ok: false, msg: `Timeout 60s. Got ${events.length} events, ${fullText.length} chars raw text.` }); setT3Running(false); } }, 60000);
  };

  // ── Test 4: Summarization ──
  const [t4Status, setT4Status] = useState(null);
  const [t4Running, setT4Running] = useState(false);
  const [t4Result, setT4Result] = useState('');
  const runTest4 = async () => {
    setT4Running(true); setT4Status(null); setT4Result('');

    const prompt = `You are a concise story summarizer. Combine the old summary with the recent exchange into a single brief summary (2-4 sentences) capturing key events, locations, and character actions. Output ONLY the summary text, nothing else.\n\nOld summary: The party has reached the village of Frostwood.\n\nRecent exchange:\nAI: The rolling grasslands stretch before Marius. The path to Oakhaven lies ahead.\n\nNew summary:`;

    let id;
    try {
      const resp = await apiFetch(`${API_PATH}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backend: 'gemini', prompt, model }),
      });
      const data = await resp.json();
      id = data.id;
    } catch (e) {
      setT4Status({ ok: false, msg: `Task creation failed: ${e.message}` });
      setT4Running(false);
      return;
    }

    const es = new EventSource(buildApiUrl(`${API_PATH}/tasks/${id}/stream`));
    let fullText = '';
    let gotDone = false;

    es.onmessage = (event) => {
      try {
        const d = JSON.parse(event.data);
        if (d.type === 'log' && d.data.stream === 'stdout') fullText += d.data.line + '\n';
        if (d.type === 'done') {
          gotDone = true;
          es.close();
          const result = sanitizeResponse(fullText);
          setT4Result(result);

          const checks = [];
          if (!result.trim()) checks.push('Summary is empty');
          if (result.includes('concise story summarizer')) checks.push('Summary contains the summarization PROMPT (contamination bug)');
          if (result.includes('Old summary:')) checks.push('Summary contains "Old summary:" (prompt echo)');
          if (result.includes('[STRICT DUNGEON')) checks.push('Summary contains DM_PROTOCOL (should not be wrapped)');
          if (result.length > 500) checks.push(`Summary is ${result.length} chars (too long, should be 2-4 sentences)`);

          setT4Status({
            ok: result.trim().length > 0 && checks.length === 0,
            msg: checks.length === 0
              ? `Summary OK (${result.length} chars). Clean, no contamination.`
              : `Issues:\n${checks.map(c => '  - ' + c).join('\n')}`
          });
          setT4Running(false);
        }
        if (d.type === 'error') { es.close(); setT4Status({ ok: false, msg: `Error: ${JSON.stringify(d.data)}` }); setT4Running(false); }
      } catch (e) { /* ignore */ }
    };
    es.onerror = () => { if (!gotDone) { es.close(); setT4Status({ ok: false, msg: 'SSE lost' }); setT4Running(false); } };
    setTimeout(() => { if (!gotDone) { es.close(); setT4Status({ ok: false, msg: 'Timeout 30s' }); setT4Running(false); } }, 30000);
  };

  // ── Test 5: Full game-like flow (message → response → summarize) ──
  const [t5Status, setT5Status] = useState(null);
  const [t5Running, setT5Running] = useState(false);
  const [t5Steps, setT5Steps] = useState([]);
  const runTest5 = async () => {
    setT5Running(true); setT5Status(null); setT5Steps([]);
    const steps = [];
    const addStep = (name, status, detail) => { steps.push({ name, status, detail }); setT5Steps([...steps]); };

    // Step A: Generate narrative
    addStep('Generate AI narrative', 'running', 'Sending DM prompt...');
    const narrativePrompt = DM_PROTOCOL + `[CONTEXT]\nSetting: Fantasy kingdom. Party: Marius (Paladin).\nPlayer moved to plains.\n\n[TASK]\nDescribe the scene. 1 paragraph.`;
    let narrative = '';
    try {
      narrative = await runInlineCliTask(narrativePrompt);
      const sanitized = sanitizeResponse(narrative);
      if (sanitized.trim()) {
        addStep('Generate AI narrative', 'pass', `${sanitized.length} chars: "${sanitized.substring(0, 100)}..."`);
      } else {
        addStep('Generate AI narrative', 'fail', narrative ? `Raw had ${narrative.length} chars but sanitized to empty` : 'Empty response');
        setT5Status({ ok: false, msg: 'Narrative generation failed. Check Tests 2 and 3.' });
        setT5Running(false);
        return;
      }
      narrative = sanitized;
    } catch (e) {
      addStep('Generate AI narrative', 'fail', e.message);
      setT5Status({ ok: false, msg: `Narrative failed: ${e.message}` });
      setT5Running(false);
      return;
    }

    // Step B: Build conversation
    const conversation = [
      { role: 'system', content: 'You moved to plains (7, 2).' },
      { role: 'ai', content: narrative },
    ];
    addStep('Build conversation', 'pass', `${conversation.length} messages. AI message: ${narrative.length} chars`);

    // Step C: Summarize
    addStep('Summarize conversation', 'running', 'Sending summarization prompt...');
    const summaryPrompt = `You are a concise story summarizer. Combine the old summary with the recent exchange into a single brief summary (2-4 sentences). Output ONLY the summary text.\n\nOld summary: The adventure begins.\n\nRecent exchange:\nAI: ${narrative}\n\nNew summary:`;
    try {
      let summary = await runInlineCliTask(summaryPrompt);
      summary = sanitizeResponse(summary);
      if (summary.trim()) {
        const contaminated = summary.includes('story summarizer') || summary.includes('Old summary:');
        addStep('Summarize conversation', contaminated ? 'fail' : 'pass',
          contaminated ? `CONTAMINATED: "${summary.substring(0, 150)}"` : `${summary.length} chars: "${summary.substring(0, 100)}"`);
        if (contaminated) {
          setT5Status({ ok: false, msg: 'Summary contaminated with prompt text.' });
          setT5Running(false);
          return;
        }
      } else {
        addStep('Summarize conversation', 'fail', 'Empty summary');
        setT5Status({ ok: false, msg: 'Summary came back empty.' });
        setT5Running(false);
        return;
      }
    } catch (e) {
      addStep('Summarize conversation', 'fail', e.message);
      setT5Status({ ok: false, msg: `Summary failed: ${e.message}` });
      setT5Running(false);
      return;
    }

    // Step D: Display check
    const wouldDisplay = narrative.trim().length > 0;
    addStep('Chat display check', wouldDisplay ? 'pass' : 'fail',
      wouldDisplay ? `AI message would show: "${narrative.substring(0, 80)}..."` : 'BLANK MESSAGE would show in chat');

    setT5Status({ ok: true, msg: 'Full pipeline passed! All steps completed successfully.' });
    setT5Running(false);
  };

  // Helper: run a CLI task and return raw stdout text
  const runInlineCliTask = (prompt) => {
    return new Promise(async (resolve, reject) => {
      let id;
      try {
        const resp = await apiFetch(`${API_PATH}/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ backend: 'gemini', prompt, model }),
        });
        const data = await resp.json();
        id = data.id;
      } catch (e) { reject(e); return; }

      const es = new EventSource(buildApiUrl(`${API_PATH}/tasks/${id}/stream`));
      let fullText = '';
      let done = false;
      es.onmessage = (event) => {
        try {
          const d = JSON.parse(event.data);
          if (d.type === 'log' && d.data.stream === 'stdout') fullText += d.data.line + '\n';
          if (d.type === 'done') { done = true; es.close(); resolve(fullText); }
          if (d.type === 'error') { done = true; es.close(); reject(new Error(JSON.stringify(d.data))); }
        } catch (e) { /* ignore */ }
      };
      es.onerror = () => { if (!done) { es.close(); reject(new Error('SSE connection lost')); } };
      setTimeout(() => { if (!done) { es.close(); reject(new Error('Timeout 45s')); } }, 45000);
    });
  };

  const anyRunning = t1Running || t2Running || t3Running || t4Running || t5Running;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 20, color: '#e0e0e0' }}>
      <h1 style={{ color: '#fff', marginBottom: 4 }}>LLM Pipeline Debug</h1>
      <p style={{ color: '#888', marginTop: 0, marginBottom: 20 }}>
        Run each test in order. Each tests one piece of the pipeline. If a test fails, the problem is in that stage.
      </p>

      {/* Model selector */}
      <div style={{ ...card, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ color: '#888', fontSize: 13 }}>Model:</span>
        <input value={model} onChange={e => setModel(e.target.value)}
          style={{ padding: 6, background: '#2a2a3e', color: '#e0e0e0', border: '1px solid #444', borderRadius: 4, fontFamily: 'monospace', fontSize: 13, width: 260 }} />
        <span style={{ color: '#666', fontSize: 12 }}>Provider: gemini-cli (hardcoded for debug)</span>
      </div>

      {/* ── TEST 1 ── */}
      <TestCard number="1" title="Server Connectivity" description="Can the browser reach the backend server? Creates a task and checks the response.">
        <button onClick={runTest1} disabled={anyRunning} style={btn('#4a90e2', anyRunning)}>
          {t1Running ? 'Testing...' : 'Test Connection'}
        </button>
        {t1Status && (
          <div style={{ marginTop: 12, padding: 12, background: '#0d1117', borderRadius: 4, border: `1px solid ${t1Status.ok ? '#4caf50' : '#f44336'}` }}>
            <span style={t1Status.ok ? pass : fail}>{t1Status.ok ? 'PASS' : 'FAIL'}</span>
            <span style={{ marginLeft: 12, color: '#ccc' }}>{t1Status.msg}</span>
          </div>
        )}
      </TestCard>

      {/* ── TEST 2 ── */}
      <TestCard number="2" title="SSE Streaming" description="Does the stream deliver events and complete with a 'done' event? Sends a tiny prompt and watches the SSE stream.">
        <button onClick={runTest2} disabled={anyRunning} style={btn('#4a90e2', anyRunning)}>
          {t2Running ? 'Streaming...' : 'Test Streaming'}
        </button>
        {t2Events.length > 0 && (
          <div style={{ ...mono, marginTop: 12, fontSize: 11, maxHeight: 150 }}>
            {t2Events.map((e, i) => <div key={i} style={{ color: e.startsWith('log:stdout') ? '#8bc34a' : e.startsWith('done') ? '#4caf50' : '#aaa' }}>{e}</div>)}
          </div>
        )}
        {t2Response && <ResultBox label="LLM Response (should say 'pineapple')" value={t2Response} isError={!t2Response.toLowerCase().includes('pineapple')} />}
        {t2Status && (
          <div style={{ marginTop: 8, padding: 12, background: '#0d1117', borderRadius: 4, border: `1px solid ${t2Status.ok ? '#4caf50' : '#f44336'}` }}>
            <span style={t2Status.ok ? pass : fail}>{t2Status.ok ? 'PASS' : 'FAIL'}</span>
            <span style={{ marginLeft: 12, color: '#ccc' }}>{t2Status.msg}</span>
          </div>
        )}
      </TestCard>

      {/* ── TEST 3 ── */}
      <TestCard number="3" title="Response Parsing + Sanitization" description="Sends a full DM_PROTOCOL prompt (like the game does). Checks that the response doesn't echo the prompt, and that sanitizeResponse produces clean text.">
        <button onClick={runTest3} disabled={anyRunning} style={btn('#4a90e2', anyRunning)}>
          {t3Running ? `Generating... ${t3Elapsed}s` : 'Test Response Parsing'}
        </button>
        {t3Running && t3Events.length > 0 && (
          <div style={{ ...mono, marginTop: 12, fontSize: 11, maxHeight: 100 }}>
            <div style={{ color: '#888', marginBottom: 4 }}>Events: {t3Events.length} | Elapsed: {t3Elapsed}s | Raw chars: {t3Raw.length}</div>
            {t3Events.slice(-8).map((e, i) => <div key={i} style={{ color: e.startsWith('log:stdout') ? '#8bc34a' : e.startsWith('done') ? '#4caf50' : '#aaa' }}>{e}</div>)}
          </div>
        )}
        {t3Raw && <ResultBox label="Raw assembled text (before sanitize)" value={t3Raw} isError={!t3Raw.trim()} />}
        {t3Sanitized && <ResultBox label="Sanitized text (what the chat would show)" value={t3Sanitized} isError={!t3Sanitized.trim()} />}
        {t3Status && (
          <div style={{ marginTop: 8, padding: 12, background: '#0d1117', borderRadius: 4, border: `1px solid ${t3Status.ok ? '#4caf50' : '#f44336'}`, whiteSpace: 'pre-wrap' }}>
            <span style={t3Status.ok ? pass : fail}>{t3Status.ok ? 'PASS' : 'FAIL'}</span>
            <span style={{ marginLeft: 12, color: '#ccc' }}>{t3Status.msg}</span>
          </div>
        )}
      </TestCard>

      {/* ── TEST 4 ── */}
      <TestCard number="4" title="Summarization" description="Tests summary generation WITHOUT DM_PROTOCOL wrapper. Checks that the result is clean and doesn't contain the summarization prompt itself.">
        <button onClick={runTest4} disabled={anyRunning} style={btn('#ff9800', anyRunning)}>
          {t4Running ? 'Summarizing...' : 'Test Summarization'}
        </button>
        {t4Result && <ResultBox label="Summary result" value={t4Result} isError={!t4Result.trim()} />}
        {t4Status && (
          <div style={{ marginTop: 8, padding: 12, background: '#0d1117', borderRadius: 4, border: `1px solid ${t4Status.ok ? '#4caf50' : '#f44336'}`, whiteSpace: 'pre-wrap' }}>
            <span style={t4Status.ok ? pass : fail}>{t4Status.ok ? 'PASS' : 'FAIL'}</span>
            <span style={{ marginLeft: 12, color: '#ccc' }}>{t4Status.msg}</span>
          </div>
        )}
      </TestCard>

      {/* ── TEST 5 ── */}
      <TestCard number="5" title="Full Pipeline (End-to-End)" description="Simulates a complete game turn: generate narrative → build conversation → summarize → display check. This is the closest to what happens in-game.">
        <button onClick={runTest5} disabled={anyRunning} style={btn('#4caf50', anyRunning)}>
          {t5Running ? 'Running pipeline...' : 'Run Full Pipeline'}
        </button>
        {t5Steps.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {t5Steps.map((s, i) => (
              <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #2a2a3e', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{
                  fontSize: 18,
                  ...(s.status === 'pass' ? { color: '#4caf50' } : s.status === 'fail' ? { color: '#f44336' } : { color: '#ff9800' })
                }}>
                  {s.status === 'pass' ? '\u2714' : s.status === 'fail' ? '\u2718' : '\u25CF'}
                </span>
                <div>
                  <div style={{ fontWeight: 600, color: '#e0e0e0', fontSize: 14 }}>{s.name}</div>
                  <div style={{ color: '#999', fontSize: 12, fontFamily: 'monospace' }}>{s.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {t5Status && (
          <div style={{ marginTop: 8, padding: 12, background: '#0d1117', borderRadius: 4, border: `1px solid ${t5Status.ok ? '#4caf50' : '#f44336'}`, whiteSpace: 'pre-wrap' }}>
            <span style={t5Status.ok ? pass : fail}>{t5Status.ok ? 'ALL PASS' : 'FAILED'}</span>
            <span style={{ marginLeft: 12, color: '#ccc' }}>{t5Status.msg}</span>
          </div>
        )}
      </TestCard>
    </div>
  );
};

export default LLMDebug;
