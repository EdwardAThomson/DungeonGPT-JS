import React, { useState } from 'react';
import { llmService } from '../services/llmService';
import { DM_PROTOCOL } from '../data/prompts';
import { buildModelOptions, resolveProviderAndModel } from '../llm/modelResolver';
import SafeMarkdownMessage from '../components/SafeMarkdownMessage';

const typeColors = { item: '#4fc3f7', combat: '#ef5350', location: '#66bb6a', narrative: '#ffa726' };
const typeIcons = { item: '📦', combat: '⚔️', location: '📍', narrative: '💬' };

const DEFAULT_MILESTONES = [
    { id: 1, text: 'Find the hidden map in the archives of Oakhaven', type: 'item', completed: false },
    { id: 2, text: 'Convince the Silver Guard to join the resistance', type: 'narrative', completed: false },
    { id: 3, text: 'Locate the Sunfire Vault deep within the Cinder Mountains', type: 'location', completed: false },
    { id: 4, text: 'Defeat the Shadow Overlord', type: 'combat', completed: false }
];

const MilestoneTest = () => {
    const [milestones, setMilestones] = useState(DEFAULT_MILESTONES);
    const [campaignComplete, setCampaignComplete] = useState(false);
    const [testPrompt, setTestPrompt] = useState('');
    const [aiResponse, setAiResponse] = useState('');
    const [rawAiResponse, setRawAiResponse] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [detectedMarker, setDetectedMarker] = useState(null);
    const [showRaw, setShowRaw] = useState(false);

    // Use buildModelOptions for full provider/model support
    const [modelOptions] = useState(() => buildModelOptions());
    const [selectedOption, setSelectedOption] = useState(() => {
        const opts = buildModelOptions();
        return opts.length > 0 ? `${opts[0].provider}::${opts[0].model}` : '';
    });

    const MILESTONE_COMPLETE_REGEX = /\[COMPLETE_MILESTONE:\s*([\s\S]+?)\]/i;
    const CAMPAIGN_COMPLETE_REGEX = /\[COMPLETE_CAMPAIGN\]/i;

    const generatePromptContext = () => {
        const completed = milestones.filter(m => m.completed);
        const remaining = milestones.filter(m => !m.completed);

        let milestonesInfo = '';
        if (remaining.length > 0) {
            milestonesInfo += '\nActive Milestones: ' + remaining.map(m => {
                const typeTag = m.type ? ` [${m.type}]` : '';
                return `${m.text}${typeTag}`;
            }).join('; ');
        }
        if (completed.length > 0) {
            milestonesInfo += '\nCompleted: ' + completed.map(m => m.text).join('; ');
        }

        return `Campaign Goal: Recover the Crown of Sunfire and defeat the Shadow Overlord.${milestonesInfo}`;
    };

    const handleTestMilestone = async () => {
        if (!testPrompt.trim()) return;

        setIsLoading(true);
        setDetectedMarker(null);

        const [provider, model] = selectedOption.split('::');
        const resolved = resolveProviderAndModel(provider, model);

        const context = generatePromptContext();
        const fullPrompt = DM_PROTOCOL + `[CONTEXT]\n${context}\n\nThe party is adventuring in a fantasy realm.\n\n[PLAYER ACTION]\n${testPrompt}\n\n[NARRATE]`;

        try {
            let response = await llmService.generateUnified({
                provider: resolved.provider,
                model: resolved.model,
                prompt: fullPrompt,
                maxTokens: 800,
                temperature: 0.7
            });

            setRawAiResponse(response);

            // Normalize mid-sentence newlines (same fix as useGameInteraction)
            response = response.replace(/([a-z,;:.!?'"\u2014])\n[ \t]*([a-z])/gi, '$1 $2');
            response = response.replace(/\n{3,}/g, '\n\n').trim();

            // Check for milestone completion
            const match = response.match(MILESTONE_COMPLETE_REGEX);
            if (match) {
                const milestoneText = match[1].replace(/\s+/g, ' ').trim();
                setDetectedMarker({ type: 'COMPLETE_MILESTONE', text: milestoneText, raw: match[0] });

                // Find and mark milestone as complete
                const milestoneIndex = milestones.findIndex(m =>
                    m.text.toLowerCase().includes(milestoneText.toLowerCase()) ||
                    milestoneText.toLowerCase().includes(m.text.toLowerCase())
                );

                if (milestoneIndex !== -1) {
                    const updated = [...milestones];
                    updated[milestoneIndex] = { ...updated[milestoneIndex], completed: true };
                    setMilestones(updated);
                }

                // Strip marker from display
                response = response.replace(match[0], '').trim();
            }

            // Check for campaign completion
            const campaignMatch = response.match(CAMPAIGN_COMPLETE_REGEX);
            if (campaignMatch) {
                setDetectedMarker({ type: 'COMPLETE_CAMPAIGN', text: 'Campaign Complete!', raw: campaignMatch[0] });
                setCampaignComplete(true);
                response = response.replace(campaignMatch[0], '').trim();
            }

            setAiResponse(response);
        } catch (error) {
            setAiResponse(`Error: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const resetMilestones = () => {
        setMilestones(DEFAULT_MILESTONES.map(m => ({ ...m, completed: false })));
        setCampaignComplete(false);
        setAiResponse('');
        setRawAiResponse('');
        setDetectedMarker(null);
    };

    const completedCount = milestones.filter(m => m.completed).length;

    return (
        <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto', fontFamily: 'var(--body-font)', color: 'var(--text)' }}>
            <h1 style={{ color: 'var(--primary)', fontFamily: 'var(--header-font)', marginBottom: '6px' }}>Milestone Marker Test</h1>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '13px' }}>
                Test AI milestone marker detection. Narrative milestones should trigger <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 4px', borderRadius: '3px', color: '#ddd' }}>[COMPLETE_MILESTONE]</code>.
                Mechanical milestones (item/combat/location) are engine-detected — the AI should <strong>not</strong> mark those.
            </p>

            {/* AI Configuration */}
            <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Provider/Model:</label>
                    <select
                        value={selectedOption}
                        onChange={(e) => setSelectedOption(e.target.value)}
                        style={{
                            padding: '6px 10px', borderRadius: '4px', fontSize: '13px', flex: 1, maxWidth: '350px',
                            border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)'
                        }}
                    >
                        {modelOptions.map(opt => (
                            <option key={`${opt.provider}::${opt.model}`} value={`${opt.provider}::${opt.model}`}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Milestone Status */}
            <div style={{ marginBottom: '16px', padding: '14px', background: 'var(--surface)', border: '2px solid var(--primary)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h2 style={{ margin: 0, color: 'var(--primary)', fontFamily: 'var(--header-font)', fontSize: '15px' }}>
                        Milestones ({completedCount}/{milestones.length})
                    </h2>
                    <button
                        onClick={resetMilestones}
                        style={{
                            padding: '4px 10px', fontSize: '11px', borderRadius: '4px', cursor: 'pointer',
                            border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)'
                        }}
                    >Reset</button>
                </div>

                {campaignComplete && (
                    <div style={{ margin: '0 0 10px 0', padding: '10px', background: 'rgba(212,175,55,0.15)', border: '2px solid var(--primary)', borderRadius: '6px', textAlign: 'center' }}>
                        <strong style={{ color: 'var(--primary)', fontSize: '14px' }}>CAMPAIGN COMPLETE!</strong>
                    </div>
                )}

                {milestones.map(m => (
                    <div key={m.id} style={{
                        padding: '6px 10px', marginBottom: '4px', borderRadius: '5px',
                        background: m.completed ? 'rgba(76,175,80,0.06)' : 'var(--bg)',
                        borderLeft: `4px solid ${m.completed ? '#4caf50' : typeColors[m.type]}`,
                        border: `1px solid ${m.completed ? '#4caf5044' : 'var(--border)'}`,
                        borderLeftWidth: '4px',
                        opacity: m.completed ? 0.6 : 1
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '12px' }}>
                                <span style={{ marginRight: '4px' }}>{m.completed ? '✓' : typeIcons[m.type]}</span>
                                <span style={{ fontWeight: 600, textDecoration: m.completed ? 'line-through' : 'none' }}>{m.text}</span>
                            </span>
                            <span style={{
                                fontSize: '10px', padding: '1px 6px', borderRadius: '8px',
                                background: `${typeColors[m.type]}22`, color: typeColors[m.type], fontWeight: 600
                            }}>{m.type}</span>
                        </div>
                        {m.type === 'narrative' && !m.completed && (
                            <div style={{ fontSize: '10px', color: '#ffa726', marginTop: '2px' }}>
                                AI should use [COMPLETE_MILESTONE] for this type
                            </div>
                        )}
                        {m.type !== 'narrative' && !m.completed && (
                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                Engine-detected — AI should NOT mark this
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Test Input */}
            <div style={{ marginBottom: '16px', padding: '14px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <h2 style={{ margin: '0 0 8px 0', color: 'var(--primary)', fontFamily: 'var(--header-font)', fontSize: '15px' }}>Test Player Action</h2>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: 0, marginBottom: '8px' }}>
                    Enter a player action. For narrative milestones (#2), the AI should output a [COMPLETE_MILESTONE] marker when achieved.
                </p>
                <form onSubmit={(e) => { e.preventDefault(); handleTestMilestone(); }} style={{ display: 'flex', gap: '6px' }}>
                    <input
                        type="text"
                        value={testPrompt}
                        onChange={(e) => setTestPrompt(e.target.value)}
                        placeholder='e.g., "I passionately convince Captain Aldric to join our resistance"'
                        disabled={isLoading}
                        style={{
                            flex: 1, padding: '10px 12px', borderRadius: '6px', fontSize: '13px',
                            border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)'
                        }}
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !testPrompt.trim()}
                        style={{
                            padding: '10px 20px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                            border: '1px solid var(--primary)', background: 'rgba(212,175,55,0.15)', color: 'var(--text)',
                            opacity: isLoading || !testPrompt.trim() ? 0.5 : 1,
                            fontFamily: 'var(--header-font)'
                        }}
                    >{isLoading ? 'Testing...' : 'Send'}</button>
                </form>
            </div>

            {/* Response Marker Detection */}
            {detectedMarker && (
                <div style={{
                    padding: '12px', marginBottom: '14px', borderRadius: '8px',
                    background: 'rgba(76, 175, 80, 0.15)', border: '2px solid #4caf50'
                }}>
                    <strong style={{ color: '#4caf50' }}>Marker Detected!</strong>
                    <div style={{ fontSize: '13px', marginTop: '4px', color: 'var(--text)' }}>
                        <div><strong>Type:</strong> {detectedMarker.type}</div>
                        <div><strong>Raw:</strong> <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 4px', borderRadius: '3px', color: '#ddd' }}>{detectedMarker.raw}</code></div>
                        <div><strong>Extracted:</strong> {detectedMarker.text}</div>
                    </div>
                </div>
            )}

            {aiResponse && !detectedMarker && (
                <div style={{
                    padding: '8px 12px', marginBottom: '14px', borderRadius: '6px', fontSize: '12px',
                    background: 'rgba(239,83,80,0.1)', border: '1px solid #ef535044', color: '#ef5350'
                }}>
                    No [COMPLETE_MILESTONE] or [COMPLETE_CAMPAIGN] marker found in this response.
                </div>
            )}

            {/* AI Response */}
            {aiResponse && (
                <div style={{ marginBottom: '16px', padding: '14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <h2 style={{ margin: 0, color: 'var(--primary)', fontFamily: 'var(--header-font)', fontSize: '15px' }}>AI Response</h2>
                        <button
                            onClick={() => setShowRaw(!showRaw)}
                            style={{
                                padding: '2px 8px', fontSize: '10px', borderRadius: '4px', cursor: 'pointer',
                                border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-secondary)'
                            }}
                        >{showRaw ? 'Rendered' : 'Raw'}</button>
                    </div>
                    {showRaw ? (
                        <pre style={{
                            whiteSpace: 'pre-wrap', fontSize: '12px', color: '#ccc', fontFamily: 'monospace',
                            background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '4px', margin: 0, wordBreak: 'break-word'
                        }}>{rawAiResponse}</pre>
                    ) : (
                        <div style={{ fontSize: '14px', lineHeight: '1.6' }}>
                            <SafeMarkdownMessage content={aiResponse} />
                        </div>
                    )}
                </div>
            )}

            {/* Context Preview */}
            <details style={{ marginBottom: '16px' }}>
                <summary style={{ fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px 0' }}>View context sent to AI</summary>
                <pre style={{
                    whiteSpace: 'pre-wrap', fontSize: '11px', color: '#ccc', fontFamily: 'monospace',
                    background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '4px', marginTop: '6px', wordBreak: 'break-word'
                }}>{generatePromptContext()}</pre>
            </details>

            {/* Instructions */}
            <div style={{ padding: '12px', background: 'rgba(212,175,55,0.08)', border: '1px solid var(--primary)', borderRadius: '8px' }}>
                <h3 style={{ marginTop: 0, marginBottom: '6px', color: 'var(--primary)', fontFamily: 'var(--header-font)', fontSize: '14px' }}>Testing Tips</h3>
                <div style={{ fontSize: '12px', lineHeight: '1.6', color: 'var(--text)' }}>
                    <div>&#8226; <strong>Narrative milestones</strong> (#2 "Convince the Silver Guard") — AI should output <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 4px', borderRadius: '3px', color: '#ddd' }}>[COMPLETE_MILESTONE: text]</code></div>
                    <div>&#8226; <strong>Mechanical milestones</strong> (item #1, location #3, combat #4) — AI should <strong>not</strong> mark these, the game engine handles them</div>
                    <div>&#8226; The type tags [item], [narrative], [location], [combat] in the prompt tell the AI which system handles each milestone</div>
                    <div>&#8226; Toggle "Raw" to see the unprocessed AI response including any markers before they're stripped</div>
                </div>
            </div>
        </div>
    );
};

export default MilestoneTest;
