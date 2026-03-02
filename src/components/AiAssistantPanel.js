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
    const [panelSize, setPanelSize] = useState({ width: 450, height: 400 });
    const [isResizing, setIsResizing] = useState(false);

    const logsEndRef = useRef(null);
    const panelRef = useRef(null);
    const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });

    // Auto-scroll
    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    useEffect(() => {
        const handleOpenFromNav = () => setIsOpen(true);
        window.addEventListener('open-ai-assistant', handleOpenFromNav);
        return () => window.removeEventListener('open-ai-assistant', handleOpenFromNav);
    }, []);

    // Resize handlers
    const handleResizeStart = (e) => {
        e.preventDefault();
        setIsResizing(true);
        resizeStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            width: panelSize.width,
            height: panelSize.height
        };
    };

    useEffect(() => {
        if (!isResizing) return;

        const handleMouseMove = (e) => {
            const deltaX = resizeStartRef.current.x - e.clientX;
            const deltaY = resizeStartRef.current.y - e.clientY;
            
            setPanelSize({
                width: Math.max(300, resizeStartRef.current.width + deltaX),
                height: Math.max(250, resizeStartRef.current.height + deltaY)
            });
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing]);

    const handleRun = async () => {
        if (!prompt.trim()) return;

        const userPrompt = prompt;
        setPrompt('');
        setStatus('queued');
        setLogs([{ line: 'AI is thinking...', stream: 'system', ts: new Date().toISOString() }]);

        // --- CLI BACKENDS (Served by Node Backend) ---
        const isCli = ['codex', 'claude-cli', 'gemini-cli'].includes(backend);

        if (isCli) {
            try {
                const contextBlock = serializeGameState(gameState);
                const fullPrompt = `${PROMPT_SNIPPET}\n\n${contextBlock}\n\n[USER COMMAND]\n${userPrompt}`;

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
            const fullPrompt = `${PROMPT_SNIPPET}\n\n${contextBlock}\n\n[USER COMMAND]\n${userPrompt}`;

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
        <div ref={panelRef} style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: `${panelSize.width}px`,
            height: `${panelSize.height}px`,
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
            fontSize: '12px',
            userSelect: isResizing ? 'none' : 'auto'
        }}>
            {/* Resize Handle */}
            <div
                onMouseDown={handleResizeStart}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '24px',
                    height: '24px',
                    cursor: 'nwse-resize',
                    zIndex: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isResizing ? 'var(--primary)' : 'transparent',
                    borderBottomRightRadius: '4px',
                    transition: 'background-color 0.2s'
                }}
                title="Drag to resize"
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--primary-tint-10)'}
                onMouseLeave={(e) => {
                    if (!isResizing) e.currentTarget.style.backgroundColor = 'transparent';
                }}
            >
                <svg width="16" height="16" viewBox="0 0 16 16" style={{ opacity: 0.6, transform: 'rotate(-90deg)' }}>
                    <path d="M0 0 L16 16 M4 0 L16 12 M8 0 L16 8 M12 0 L16 4" 
                          stroke="var(--primary)" 
                          strokeWidth="1.5" 
                          strokeLinecap="round"/>
                </svg>
            </div>
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
                    <div key={i} style={{ 
                        color: log.stream === 'stderr' ? 'var(--state-danger)' : log.stream === 'system' ? 'var(--text-secondary)' : 'var(--text)', 
                        whiteSpace: 'pre-wrap', 
                        wordBreak: 'break-all',
                        fontStyle: log.stream === 'system' ? 'italic' : 'normal'
                    }}>
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
