import React, { useState } from 'react';
import { llmService } from '../services/llmService';
import { DM_PROTOCOL } from '../data/prompts';

const MilestoneTest = () => {
    const [milestones, setMilestones] = useState([
        { id: 1, text: 'Find the hidden map in the archives of Oakhaven', completed: false },
        { id: 2, text: 'Convince the Silver Guard to join the resistance', completed: false },
        { id: 3, text: 'Locate the Sunfire Vault deep within the Cinder Mountains', completed: false }
    ]);
    const [campaignComplete, setCampaignComplete] = useState(false);
    const [testPrompt, setTestPrompt] = useState('');
    const [aiResponse, setAiResponse] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [detectedToolCall, setDetectedToolCall] = useState(null);
    const [provider, setProvider] = useState('gemini-cli');
    const [model, setModel] = useState('gemini-3-flash-preview');

    const MILESTONE_COMPLETE_REGEX = /\[COMPLETE_MILESTONE:\s*(.+?)\]/i;
    const CAMPAIGN_COMPLETE_REGEX = /\[COMPLETE_CAMPAIGN\]/i;

    const normalizeMilestones = (milestones) => {
        if (!milestones || milestones.length === 0) return [];
        if (typeof milestones[0] === 'object' && milestones[0].hasOwnProperty('text')) {
            return milestones;
        }
        return milestones.map((text, index) => ({ id: index + 1, text, completed: false }));
    };

    const getMilestoneStatus = (milestones) => {
        const normalized = normalizeMilestones(milestones);
        const completed = normalized.filter(m => m.completed);
        const remaining = normalized.filter(m => !m.completed);
        const current = remaining.length > 0 ? remaining[0] : null;

        return { current, completed, remaining, all: normalized };
    };

    const generatePromptContext = () => {
        const milestoneStatus = getMilestoneStatus(milestones);
        let milestonesInfo = '';

        if (milestoneStatus.current) {
            milestonesInfo += `\nCurrent Milestone: ${milestoneStatus.current.text}`;
            if (milestoneStatus.completed.length > 0) {
                milestonesInfo += `\nCompleted Milestones: ${milestoneStatus.completed.map(m => m.text).join(', ')}`;
            }
            if (milestoneStatus.remaining.length > 1) {
                milestonesInfo += `\nRemaining Milestones: ${milestoneStatus.remaining.slice(1).map(m => m.text).join(', ')}`;
            }
        }

        return `Campaign Goal: Recover the Crown of Sunfire and defeat the Shadow Overlord${milestonesInfo}`;
    };

    const handleTestMilestone = async () => {
        if (!testPrompt.trim()) return;

        setIsLoading(true);
        setDetectedToolCall(null);

        const context = generatePromptContext();
        const fullPrompt = DM_PROTOCOL + `[CONTEXT]\n${context}\n\n[PLAYER ACTION]\n${testPrompt}\n\n[NARRATE]`;

        try {
            const response = await llmService.generateUnified({
                provider,
                model,
                prompt: fullPrompt,
                maxTokens: 800,
                temperature: 0.7
            });

            setAiResponse(response);

            // Check for milestone completion
            const match = response.match(MILESTONE_COMPLETE_REGEX);
            if (match) {
                const milestoneText = match[1].trim();
                setDetectedToolCall({ type: 'COMPLETE_MILESTONE', text: milestoneText });

                // Find and mark milestone as complete
                const milestoneIndex = milestones.findIndex(m =>
                    m.text.toLowerCase().includes(milestoneText.toLowerCase()) ||
                    milestoneText.toLowerCase().includes(m.text.toLowerCase())
                );

                if (milestoneIndex !== -1) {
                    const updated = [...milestones];
                    updated[milestoneIndex].completed = true;
                    setMilestones(updated);
                }
            }

            // Check for campaign completion
            const campaignMatch = response.match(CAMPAIGN_COMPLETE_REGEX);
            if (campaignMatch) {
                setDetectedToolCall({ type: 'COMPLETE_CAMPAIGN', text: 'Campaign Complete!' });
                setCampaignComplete(true);
            }
        } catch (error) {
            setAiResponse(`Error: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const resetMilestones = () => {
        setMilestones([
            { id: 1, text: 'Find the hidden map in the archives of Oakhaven', completed: false },
            { id: 2, text: 'Convince the Silver Guard to join the resistance', completed: false },
            { id: 3, text: 'Locate the Sunfire Vault deep within the Cinder Mountains', completed: false }
        ]);
        setCampaignComplete(false);
        setAiResponse('');
        setDetectedToolCall(null);
    };

    const milestoneStatus = getMilestoneStatus(milestones);

    return (
        <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'var(--body-font)', color: 'var(--text)' }}>
            <h1 style={{ color: 'var(--primary)', fontFamily: 'var(--header-font)' }}>🎯 Milestone System Test</h1>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '30px' }}>
                Test the milestone tracking system and tool call detection. Enter player actions that might trigger milestone completion.
            </p>

            {/* AI Configuration */}
            <div style={{ marginBottom: '20px', padding: '15px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <h3 style={{ color: 'var(--primary)', fontFamily: 'var(--header-font)' }}>AI Configuration</h3>
                <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: 'var(--text-secondary)' }}>Provider:</label>
                        <select value={provider} onChange={(e) => setProvider(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}>
                            <option value="gemini-cli">Gemini CLI</option>
                            <option value="gemini">Gemini API</option>
                            <option value="openai">OpenAI</option>
                            <option value="claude">Claude</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: 'var(--text-secondary)' }}>Model:</label>
                        <input
                            type="text"
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                            style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', width: '250px', background: 'var(--bg)', color: 'var(--text)' }}
                        />
                    </div>
                </div>
            </div>

            {/* Milestone Status */}
            <div style={{ marginBottom: '30px', padding: '20px', background: 'var(--surface)', border: '2px solid var(--primary)', borderRadius: '8px' }}>
                <h2 style={{ marginTop: 0, color: 'var(--primary)', fontFamily: 'var(--header-font)' }}>Milestone Status</h2>
                {campaignComplete && (
                    <div style={{ margin: '0 0 15px 0', padding: '12px', background: 'rgba(76, 175, 80, 0.15)', borderLeft: '4px solid #4caf50', borderRadius: '6px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#4caf50' }}>🏆 CAMPAIGN COMPLETE 🏆</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Victory Achieved!</div>
                    </div>
                )}
                <div style={{ marginBottom: '15px', color: 'var(--text)' }}>
                    <strong>Progress:</strong> {milestoneStatus.completed.length}/{milestoneStatus.all.length} Complete
                </div>

                {milestoneStatus.current && (
                    <div style={{ marginBottom: '15px', padding: '12px', background: 'rgba(var(--primary-rgb, 212, 175, 55), 0.1)', borderLeft: '4px solid var(--primary)', borderRadius: '4px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '1px' }}>CURRENT MILESTONE</div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--text)' }}>🎯 {milestoneStatus.current.text}</div>
                    </div>
                )}

                {milestoneStatus.completed.length > 0 && (
                    <div style={{ marginBottom: '15px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>COMPLETED</div>
                        {milestoneStatus.completed.map((m, idx) => (
                            <div key={idx} style={{ padding: '8px', background: 'rgba(76, 175, 80, 0.1)', marginBottom: '5px', borderRadius: '4px', borderLeft: '3px solid #4caf50', color: 'var(--text)' }}>
                                ✓ <span style={{ textDecoration: 'line-through', opacity: 0.7 }}>{m.text}</span>
                            </div>
                        ))}
                    </div>
                )}

                {milestoneStatus.remaining.length > 1 && (
                    <div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>REMAINING</div>
                        {milestoneStatus.remaining.slice(1).map((m, idx) => (
                            <div key={idx} style={{ padding: '8px', background: 'var(--bg)', marginBottom: '5px', borderRadius: '4px', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                                ○ {m.text}
                            </div>
                        ))}
                    </div>
                )}

                <button
                    onClick={resetMilestones}
                    style={{ marginTop: '15px', padding: '8px 16px', background: 'var(--text-secondary)', color: 'var(--bg)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--body-font)' }}
                >
                    Reset All Milestones
                </button>
            </div>

            {/* Test Input */}
            <div style={{ marginBottom: '30px' }}>
                <h2 style={{ color: 'var(--primary)', fontFamily: 'var(--header-font)' }}>Test Player Action</h2>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                    Enter a player action that might complete the current milestone. The AI will respond and potentially mark it complete.
                </p>
                <textarea
                    value={testPrompt}
                    onChange={(e) => setTestPrompt(e.target.value)}
                    placeholder="e.g., 'We search the archives and find the ancient map!'"
                    style={{ width: '100%', minHeight: '100px', padding: '12px', fontSize: '14px', borderRadius: '4px', border: '1px solid var(--border)', boxSizing: 'border-box', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--body-font)' }}
                />
                <button
                    onClick={handleTestMilestone}
                    disabled={isLoading || !testPrompt.trim()}
                    style={{ marginTop: '10px', padding: '12px 24px', background: 'var(--primary)', color: 'var(--bg)', border: 'none', borderRadius: '4px', cursor: isLoading ? 'not-allowed' : 'pointer', fontSize: '16px', fontWeight: 'bold', fontFamily: 'var(--header-font)' }}
                >
                    {isLoading ? 'Testing...' : 'Test Milestone'}
                </button>
            </div>

            {/* Context Preview */}
            <div style={{ marginBottom: '30px', padding: '15px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <h3 style={{ color: 'var(--primary)', fontFamily: 'var(--header-font)' }}>Context Sent to AI</h3>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px', color: 'var(--text)', fontFamily: 'monospace', background: 'var(--bg)', padding: '10px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                    {generatePromptContext()}
                </pre>
            </div>

            {/* AI Response */}
            {aiResponse && (
                <div style={{ marginBottom: '30px' }}>
                    <h2 style={{ color: 'var(--primary)', fontFamily: 'var(--header-font)' }}>AI Response</h2>
                    <div style={{ padding: '15px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                        <pre style={{ whiteSpace: 'pre-wrap', fontSize: '14px', lineHeight: '1.6', color: 'var(--text)', fontFamily: 'var(--body-font)', margin: 0 }}>
                            {aiResponse}
                        </pre>
                    </div>
                </div>
            )}

            {/* Tool Call Detection */}
            {detectedToolCall && (
                <div style={{ padding: '15px', background: 'rgba(76, 175, 80, 0.15)', border: '2px solid #4caf50', borderRadius: '8px', marginBottom: '30px' }}>
                    <h3 style={{ marginTop: 0, color: '#4caf50', fontFamily: 'var(--header-font)' }}>✅ Tool Call Detected!</h3>
                    <div style={{ fontSize: '14px', color: 'var(--text)' }}>
                        <strong>Type:</strong> {detectedToolCall.type}<br />
                        <strong>Milestone Text:</strong> {detectedToolCall.text}
                    </div>
                </div>
            )}

            {/* Instructions */}
            <div style={{ marginTop: '40px', padding: '20px', background: 'rgba(var(--primary-rgb, 212, 175, 55), 0.1)', border: '1px solid var(--primary)', borderRadius: '8px' }}>
                <h3 style={{ marginTop: 0, color: 'var(--primary)', fontFamily: 'var(--header-font)' }}>💡 Testing Tips</h3>
                <ul style={{ marginBottom: 0, color: 'var(--text)' }}>
                    <li>Try actions that clearly complete the current milestone</li>
                    <li>Watch for <code style={{ background: 'var(--bg)', padding: '2px 6px', borderRadius: '3px', border: '1px solid var(--border)' }}>[COMPLETE_MILESTONE: text]</code> in the AI response</li>
                    <li>Check if the milestone status updates automatically</li>
                    <li>Test with partial milestone text to verify fuzzy matching</li>
                    <li>Example: "We found the map!" should match "Find the hidden map..."</li>
                </ul>
            </div>
        </div>
    );
};

export default MilestoneTest;
