import React, { useState, useEffect, useRef } from 'react';
import { llmService } from '../services/llmService';
import { PROMPT_SNIPPET } from '../llm/llm_constants';

/**
 * Simple serializer for game state to provide context to the AI.
 */
function serializeGameState(gameState) {
    if (!gameState) return "No game state available.";

    const heroes = gameState.selectedHeroes?.map(h => `- ${h.characterName} (${h.characterRace} ${h.characterClass})`).join('\n') || "No heroes selected.";
    const position = gameState.playerPosition ? `X: ${gameState.playerPosition.x}, Y: ${gameState.playerPosition.y}` : "Unknown";

    return `
[GAME CONTEXT (OUT-OF-CHARACTER RULES ASSISTANT)]
Heroes:
${heroes}

Current Position: ${position}
Is Inside Town: ${gameState.isInsideTown ? 'Yes' : 'No'}

You are an Out-of-Character (OOC) Rules & Mechanics Assistant. Do NOT speak in-character. 
Your goal is to help the player with rules, strategies, and facts about the world or the code.
`;
}

export default function AiAssistantPanel({ gameState, backend, model, showFloatingTrigger = true }) {
    const [isOpen, setIsOpen] = useState(false);
    const [prompt, setPrompt] = useState('');
    const [status, setStatus] = useState('idle');
    const [logs, setLogs] = useState([]);

    const logsEndRef = useRef(null);

    // Auto-scroll
    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    useEffect(() => {
        const handleOpenFromNav = () => setIsOpen(true);
        window.addEventListener('open-ai-assistant', handleOpenFromNav);
        return () => window.removeEventListener('open-ai-assistant', handleOpenFromNav);
    }, []);

    const handleRun = async () => {
        if (!prompt.trim()) return;

        setStatus('queued');
        setLogs([]);

        // --- CLI BACKENDS (Served by Node Backend) ---
        const isCli = ['codex', 'claude-cli', 'gemini-cli'].includes(backend);

        if (isCli) {
            try {
                const contextBlock = serializeGameState(gameState);
                const fullPrompt = `${PROMPT_SNIPPET}\n\n${contextBlock}\n\n[USER COMMAND]\n${prompt}`;

                let cliBackend = 'codex';
                if (backend === 'claude-cli') cliBackend = 'claude';
                if (backend === 'gemini-cli') cliBackend = 'gemini';

                const { id } = await llmService.createTask(cliBackend, fullPrompt, undefined, model);

                llmService.streamTask(id, (update) => {
                    if (update.type === 'status') {
                        setStatus(update.data.state);
                    } else if (update.type === 'log') {
                        setLogs(prev => [...prev, update.data]);
                    } else if (update.type === 'error') {
                        setStatus('error');
                        setLogs(prev => [...prev, { line: `Error: ${update.data}`, stream: 'stderr', ts: new Date().toISOString() }]);
                    }
                });
            } catch (error) {
                setStatus('error');
                let message = `Failed: ${error.message}`;
                if (error.message.includes('Failed to fetch')) {
                    message += "\n(Is the Backend Server running?)";
                }
                setLogs(prev => [...prev, { line: message, stream: 'stderr', ts: new Date().toISOString() }]);
            }
            return;
        }

        // --- API BACKENDS (Server-side SDKs) ---
        setStatus('running');
        try {
            const contextBlock = serializeGameState(gameState);
            const fullPrompt = `${PROMPT_SNIPPET}\n\n${contextBlock}\n\n[USER COMMAND]\n${prompt}`;

            const response = await llmService.generateText({
                provider: backend,
                model,
                prompt: fullPrompt
            });

            setLogs([{ line: response, stream: 'stdout', ts: new Date().toISOString() }]);
            setStatus('completed');
        } catch (error) {
            setStatus('error');
            setLogs(prev => [...prev, { line: `API Error: ${error.message}`, stream: 'stderr', ts: new Date().toISOString() }]);
        }
    };

    if (!isOpen && !showFloatingTrigger) {
        return null;
    }

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                style={{
                    position: 'fixed',
                    bottom: '20px',
                    right: '300px',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--primary)',
                    padding: '12px',
                    borderRadius: '50%',
                    boxShadow: '0 8px 16px var(--shadow)',
                    border: '1px solid var(--primary)',
                    zIndex: 50,
                    cursor: 'pointer',
                    fontSize: '20px'
                }}
                title="AI Assistant"
            >
                🤖
            </button>
        );
    }

    return (
        <div style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: '450px',
            height: '400px',
            backgroundColor: 'var(--surface)',
            color: 'var(--text)',
            border: '1px solid var(--primary)',
            borderRadius: '8px',
            boxShadow: '0 20px 40px var(--shadow-black-40)',
            zIndex: 1300,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontFamily: 'monospace',
            fontSize: '12px'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'var(--primary-tint-10)',
                padding: '8px',
                borderBottom: '1px solid var(--border)'
            }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', fontWeight: 'bold' }}>
                        <span>🤖 Rules & Mechanics Assistant</span>
                        {status === 'running' && <span style={{ color: 'var(--state-success)' }}>●</span>}
                    </div>
                    <div style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                        Backend: <span style={{ color: 'var(--text)' }}>{backend?.toUpperCase()}</span>
                    </div>
                </div>
                <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
            </div>

            {/* Terminal Output */}
            <div style={{
                flex: 1,
                overflow: 'auto',
                padding: '16px',
                backgroundColor: 'var(--bg)',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
            }}>
                {logs.length === 0 && (
                    <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>How can I help you, adventurer?</div>
                )}
                {logs.map((log, i) => (
                    <div key={i} style={{ color: log.stream === 'stderr' ? 'var(--state-danger)' : 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        <span style={{ color: 'var(--text-secondary)', marginRight: '8px' }}>[{new Date(log.ts).toLocaleTimeString()}]</span>
                        {log.line}
                    </div>
                ))}
                <div ref={logsEndRef} />
            </div>

            {/* Input Area */}
            <div style={{
                padding: '12px',
                backgroundColor: 'var(--surface)',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                gap: '8px'
            }}>
                <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRun()}
                    placeholder="Ask about rules, stats, or mechanics..."
                    style={{
                        flex: 1,
                        backgroundColor: 'var(--bg)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        borderRadius: '4px',
                        padding: '8px',
                        outline: 'none'
                    }}
                    disabled={status === 'running'}
                />
                <button
                    onClick={handleRun}
                    disabled={status === 'running' || !prompt.trim()}
                    style={{
                        backgroundColor: 'var(--primary)',
                        color: 'var(--bg)',
                        border: '1px solid var(--primary)',
                        borderRadius: '4px',
                        padding: '8px 16px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        opacity: (status === 'running' || !prompt.trim()) ? 0.5 : 1
                    }}
                >
                    RUN
                </button>
            </div>
        </div>
    );
}
