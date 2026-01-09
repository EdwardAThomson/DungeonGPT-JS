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

export default function AiAssistantPanel({ gameState, backend, model }) {
    const [isOpen, setIsOpen] = useState(false);
    const [prompt, setPrompt] = useState('');
    const [status, setStatus] = useState('idle');
    const [logs, setLogs] = useState([]);

    const logsEndRef = useRef(null);

    // Auto-scroll
    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

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

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                style={{
                    position: 'fixed',
                    bottom: '20px',
                    right: '300px',
                    backgroundColor: 'rgba(76, 29, 149, 0.8)',
                    color: 'white',
                    padding: '12px',
                    borderRadius: '50%',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                    border: '1px solid rgba(139, 92, 246, 0.5)',
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
            backgroundColor: '#0c0a09',
            border: '1px solid rgba(139, 92, 246, 0.3)',
            borderRadius: '8px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            zIndex: 50,
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
                backgroundColor: 'rgba(76, 29, 149, 0.2)',
                padding: '8px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#d8b4fe', fontWeight: 'bold' }}>
                        <span>🤖 Rules & Mechanics Assistant</span>
                        {status === 'running' && <span style={{ color: '#4ade80' }}>●</span>}
                    </div>
                    <div style={{ fontSize: '9px', color: 'rgba(167, 139, 250, 0.7)', textTransform: 'uppercase' }}>
                        Backend: <span style={{ color: 'white' }}>{backend?.toUpperCase()}</span>
                    </div>
                </div>
                <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '18px' }}>✕</button>
            </div>

            {/* Terminal Output */}
            <div style={{
                flex: 1,
                overflow: 'auto',
                padding: '16px',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
            }}>
                {logs.length === 0 && (
                    <div style={{ color: '#4b5563', fontStyle: 'italic' }}>How can I help you, adventurer?</div>
                )}
                {logs.map((log, i) => (
                    <div key={i} style={{ color: log.stream === 'stderr' ? '#f87171' : '#d1d5db', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        <span style={{ color: '#4b5563', marginRight: '8px' }}>[{new Date(log.ts).toLocaleTimeString()}]</span>
                        {log.line}
                    </div>
                ))}
                <div ref={logsEndRef} />
            </div>

            {/* Input Area */}
            <div style={{
                padding: '12px',
                backgroundColor: '#1c1917',
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
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
                        backgroundColor: '#292524',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: 'white',
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
                        backgroundColor: '#7c3aed',
                        color: 'white',
                        border: 'none',
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
