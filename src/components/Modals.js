import React, { useContext, useState } from 'react';
import { AVAILABLE_MODELS, DEFAULT_MODELS } from '../llm/llm_constants';
import ApiKeysContext from '../contexts/ApiKeysContext';
import SettingsContext from '../contexts/SettingsContext';

// --- AI-Only Settings Modal (for Navbar/Homepage) --- //
export const AISettingsModalContent = ({
  isOpen, onClose,
  selectedProvider, setSelectedProvider,
  selectedModel, setSelectedModel,
  assistantProvider, setAssistantProvider,
  assistantModel, setAssistantModel
}) => {
  const { apiKeys, setApiKeys } = useContext(ApiKeysContext);
  const { theme, setTheme } = useContext(SettingsContext);

  if (!isOpen) return null;

  const handleProviderChange = (newProvider, type) => {
    if (type === 'game') {
      setSelectedProvider(newProvider);
      setSelectedModel(DEFAULT_MODELS[newProvider]);
    } else {
      setAssistantProvider(newProvider);
      setAssistantModel(DEFAULT_MODELS[newProvider]);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings-modal-refined" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '20px 20px 10px 20px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ margin: 0, color: 'var(--primary)', fontFamily: 'var(--header-font)', fontSize: '1.4rem' }}>⚙️ AI Settings</h2>
        </div>

        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {/* AI Engine Settings */}
          <div className="modal-section">
            <h3 style={{ margin: '0 0 15px 0', fontSize: '1.1rem', color: 'var(--text)' }}>🤖 AI Configuration</h3>

            <div style={{ marginBottom: '20px', background: 'var(--bg)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: 'var(--primary)', fontFamily: 'var(--header-font)' }}>Narrative DM</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>PROVIDER</label>
                  <select value={selectedProvider} onChange={(e) => handleProviderChange(e.target.value, 'game')} style={selectStyle}>
                    <optgroup label="Cloud APIs">
                      <option value="openai">OpenAI</option>
                      <option value="gemini">Gemini</option>
                      <option value="claude">Claude</option>
                    </optgroup>
                    <optgroup label="CLI Tools">
                      <option value="codex">Codex CLI</option>
                      <option value="claude-cli">Claude CLI</option>
                      <option value="gemini-cli">Gemini CLI</option>
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>MODEL</label>
                  <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} style={selectStyle}>
                    {AVAILABLE_MODELS[selectedProvider]?.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    )) || <option value="">Select Provider</option>}
                  </select>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '20px', background: 'var(--bg)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: 'var(--primary)', fontFamily: 'var(--header-font)' }}>OOC Assistant</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>PROVIDER</label>
                  <select value={assistantProvider || selectedProvider} onChange={(e) => handleProviderChange(e.target.value, 'assistant')} style={selectStyle}>
                    <optgroup label="Cloud APIs">
                      <option value="openai">OpenAI</option>
                      <option value="gemini">Gemini</option>
                      <option value="claude">Claude</option>
                    </optgroup>
                    <optgroup label="CLI Tools">
                      <option value="codex">Codex CLI</option>
                      <option value="claude-cli">Claude CLI</option>
                      <option value="gemini-cli">Gemini CLI</option>
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>MODEL</label>
                  <select value={assistantModel || selectedModel} onChange={(e) => setAssistantModel(e.target.value)} style={selectStyle}>
                    {AVAILABLE_MODELS[assistantProvider || selectedProvider]?.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    )) || <option value="">Select Provider</option>}
                  </select>
                </div>
              </div>
            </div>

            <div style={{ background: 'var(--bg)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: 'var(--primary)', fontFamily: 'var(--header-font)' }}>API Keys</h4>
              <p style={{ margin: '0', fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6', textAlign: 'left' }}>
                Cloud API keys are configured in the <code style={{ background: 'var(--surface-soft)', padding: '2px 6px', borderRadius: '3px' }}>.env</code> file on the server. Use <strong>gemini-cli</strong>, <strong>claude-cli</strong>, or <strong>codex</strong> providers for CLI-based access without API keys.
              </p>
            </div>
          </div>

          {/* Theme Selection */}
          <div className="modal-section" style={{ marginTop: '25px' }}>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '1.1rem', color: 'var(--primary)', fontFamily: 'var(--header-font)' }}>🎭 Appearance</h3>
            <div style={{ display: 'flex', gap: '15px' }}>
              <button
                onClick={() => setTheme('light-fantasy')}
                style={{
                  flex: 1,
                  padding: '16px',
                  background: theme === 'light-fantasy' ? 'var(--primary)' : 'var(--bg)',
                  color: theme === 'light-fantasy' ? 'var(--bg)' : 'var(--text)',
                  border: '1px solid var(--primary)',
                  fontFamily: 'var(--header-font)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  boxShadow: theme === 'light-fantasy' ? '0 4px 12px var(--shadow)' : 'none'
                }}
              >
                📜 Parchment (Light)
              </button>
              <button
                onClick={() => setTheme('dark-fantasy')}
                style={{
                  flex: 1,
                  padding: '16px',
                  background: theme === 'dark-fantasy' ? 'var(--primary)' : 'var(--bg)',
                  color: theme === 'dark-fantasy' ? 'var(--bg)' : 'var(--text)',
                  border: '1px solid var(--primary)',
                  fontFamily: 'var(--header-font)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  boxShadow: theme === 'dark-fantasy' ? '0 4px 12px var(--shadow)' : 'none'
                }}
              >
                🌑 Stone (Dark)
              </button>
            </div>
          </div>
        </div>

        <div style={{ padding: '20px', borderTop: '1px solid var(--border)', textAlign: 'center', background: 'var(--bg)' }}>
          <button className="modal-close-button" onClick={onClose} style={{ padding: '12px 60px', borderRadius: '30px', fontFamily: 'var(--header-font)', textTransform: 'uppercase', letterSpacing: '2px' }}>
            Accept & Close
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Story Settings Modal (for Game Page) --- //
export const StorySettingsModalContent = ({
  isOpen, onClose, settings, setSettings,
  selectedProvider, setSelectedProvider,
  selectedModel, setSelectedModel,
  assistantProvider, setAssistantProvider,
  assistantModel, setAssistantModel,
  worldSeed
}) => {
  const [activeTab, setActiveTab] = useState('story'); // 'story' or 'ai'
  const { apiKeys, setApiKeys } = useContext(ApiKeysContext);
  const { theme, setTheme } = useContext(SettingsContext);

  if (!isOpen) return null;

  const displaySetting = (value) => value || 'Not set';

  const handleProviderChange = (newProvider, type) => {
    if (type === 'game') {
      setSelectedProvider(newProvider);
      setSelectedModel(DEFAULT_MODELS[newProvider]);
    } else {
      setAssistantProvider(newProvider);
      setAssistantModel(DEFAULT_MODELS[newProvider]);
    }
  };

  const updateSetting = (key, value) => {
    setSettings({ ...settings, [key]: value });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings-modal-refined" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '20px 20px 10px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, color: 'var(--primary)', fontFamily: 'var(--header-font)', fontSize: '1.4rem' }}>⚙️ System Scroll</h2>
            {worldSeed && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                Session ID: {worldSeed}
              </span>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
          <button
            onClick={() => setActiveTab('story')}
            style={{
              flex: 1,
              padding: '12px',
              background: activeTab === 'story' ? 'var(--surface)' : 'transparent',
              color: activeTab === 'story' ? 'var(--primary)' : 'var(--text-secondary)',
              border: 'none',
              borderBottom: activeTab === 'story' ? '3px solid var(--primary)' : 'none',
              fontFamily: 'var(--header-font)',
              fontSize: '0.85rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}
          >
            📖 Story & Style
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            style={{
              flex: 1,
              padding: '12px',
              background: activeTab === 'ai' ? 'var(--surface)' : 'transparent',
              color: activeTab === 'ai' ? 'var(--primary)' : 'var(--text-secondary)',
              border: 'none',
              borderBottom: activeTab === 'ai' ? '3px solid var(--primary)' : 'none',
              fontFamily: 'var(--header-font)',
              fontSize: '0.85rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}
          >
            🤖 AI Engine
          </button>
        </div>

        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {activeTab === 'story' ? (
            <>
              {/* Story Profile Section */}
              <div className="modal-section" style={{ marginBottom: '25px' }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '1.1rem', color: 'var(--primary)', fontFamily: 'var(--header-font)' }}>📖 Active Story Profile</h3>
                <div style={{ fontSize: '0.9rem', color: 'var(--text)', background: 'var(--surface)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)', boxShadow: 'inset 0 2px 4px var(--shadow)' }}>
                  {settings.templateName && (
                    <p style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: 'var(--primary)', letterSpacing: '0.5px', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                      <strong>Template:</strong> {settings.templateName}
                    </p>
                  )}
                  <p style={{ margin: '0 0 8px 0', fontSize: '1rem' }}><strong>Setting:</strong> {settings.shortDescription || 'Default Fantasy World'}</p>
                  {settings.campaignComplete && (
                    <div style={{ margin: '12px 0', padding: '12px', background: 'var(--success-tint-20)', borderLeft: '4px solid var(--state-success)', borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--state-success)' }}>🏆 CAMPAIGN COMPLETE 🏆</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Victory Achieved!</div>
                    </div>
                  )}
                  {settings.campaignGoal && (
                    <div style={{ margin: '12px 0', padding: '14px', background: 'var(--primary-tint-10)', borderLeft: '4px solid var(--primary)', borderRadius: '6px', boxShadow: '0 2px 4px var(--shadow)' }}>
                      <p style={{ margin: '0', fontSize: '1rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1.2px', fontWeight: '600' }}>Quest</p>
                      <p style={{ margin: '8px 0 0 0', color: 'var(--primary)', fontWeight: 'bold', fontSize: '1.35rem', lineHeight: '1.4' }}>{settings.campaignGoal}</p>
                    </div>
                  )}
                  {settings.milestones && settings.milestones.length > 0 && (() => {
                    // Normalize milestones for display
                    const normalizeMilestones = (milestones) => {
                      if (!milestones || milestones.length === 0) return [];
                      if (typeof milestones[0] === 'object' && milestones[0].hasOwnProperty('text')) {
                        return milestones;
                      }
                      return milestones.map((text, index) => ({ id: index + 1, text, completed: false, location: null }));
                    };

                    const normalized = normalizeMilestones(settings.milestones);
                    const completed = normalized.filter(m => m.completed);
                    const remaining = normalized.filter(m => !m.completed);
                    const current = remaining.length > 0 ? remaining[0] : null;
                    const totalCount = normalized.length;
                    const completedCount = completed.length;

                    return (
                      <>
                        {/* Progress Indicator */}
                        {totalCount > 0 && (
                          <div style={{ margin: '12px 0 8px 0', textAlign: 'center' }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '600', letterSpacing: '1px' }}>
                              PROGRESS: {completedCount}/{totalCount} MILESTONES COMPLETE
                            </span>
                          </div>
                        )}

                        {/* Current Milestone */}
                        {current && (
                          <div style={{ margin: '12px 0', padding: '12px', background: 'var(--primary-tint-10)', borderLeft: '4px solid var(--primary)', borderRadius: '6px' }}>
                            <p style={{ margin: '0', fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                              Current Milestone
                            </p>
                            <p style={{ margin: '6px 0 0 0', color: 'var(--text)', fontSize: '1.05rem', lineHeight: '1.4' }}>
                              🎯 {current.text}
                            </p>
                          </div>
                        )}

                        {/* Completed Milestones */}
                        {completed.length > 0 && (
                          <div style={{ margin: '12px 0', padding: '10px', background: 'var(--primary-tint-05)', borderLeft: '3px solid var(--state-success)', borderRadius: '6px' }}>
                            <p style={{ margin: '0 0 6px 0', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                              Completed
                            </p>
                            {completed.map((m, idx) => (
                              <p key={idx} style={{ margin: '4px 0', color: 'var(--text)', fontSize: '0.9rem', lineHeight: '1.3' }}>
                                ✓ <span style={{ textDecoration: 'line-through', opacity: 0.7 }}>{m.text}</span>
                              </p>
                            ))}
                          </div>
                        )}

                        {/* Remaining Milestones (excluding current) */}
                        {remaining.length > 1 && (
                          <div style={{ margin: '12px 0', padding: '10px', background: 'var(--primary-tint-05)', borderLeft: '2px solid var(--border)', borderRadius: '6px' }}>
                            <p style={{ margin: '0 0 6px 0', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                              Remaining ({remaining.length - 1})
                            </p>
                            {remaining.slice(1).map((m, idx) => (
                              <p key={idx} style={{ margin: '4px 0', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.3' }}>
                                ○ {m.text}
                              </p>
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })()}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    <span title="The overall tone and atmosphere of the story - from light-hearted to grim and serious">
                      <strong>Mood:</strong> {settings.grimnessLevel || 'Neutral'} / {settings.darknessLevel || 'Neutral'}
                    </span>
                    <span title="How prevalent and powerful magic is in this world - from rare and subtle to commonplace and dramatic">
                      <strong>Magic:</strong> {settings.magicLevel || 'Medium Magic'}
                    </span>
                    <span title="The level of technological advancement - from primitive to futuristic">
                      <strong>Tech:</strong> {settings.technologyLevel || 'Medieval'}
                    </span>
                  </div>
                </div>
                <p style={{ margin: '10px 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center' }}>
                  * Story settings are woven at the start and cannot be changed here.
                </p>
              </div>

              {/* Appearance Section */}
              <div className="modal-section" style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '1.1rem', color: 'var(--primary)', fontFamily: 'var(--header-font)' }}>🎭 Appearance</h3>
                <div style={{ display: 'flex', gap: '15px' }}>
                  <button
                    onClick={() => setTheme('light-fantasy')}
                    style={{
                      flex: 1,
                      padding: '16px',
                      background: theme === 'light-fantasy' ? 'var(--primary)' : 'var(--bg)',
                      color: theme === 'light-fantasy' ? 'var(--bg)' : 'var(--text)',
                      border: '1px solid var(--primary)',
                      fontFamily: 'var(--header-font)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      boxShadow: theme === 'light-fantasy' ? '0 4px 12px var(--shadow)' : 'none'
                    }}
                  >
                    📜 Parchment (Light)
                  </button>
                  <button
                    onClick={() => setTheme('dark-fantasy')}
                    style={{
                      flex: 1,
                      padding: '16px',
                      background: theme === 'dark-fantasy' ? 'var(--primary)' : 'var(--bg)',
                      color: theme === 'dark-fantasy' ? 'var(--bg)' : 'var(--text)',
                      border: '1px solid var(--primary)',
                      fontFamily: 'var(--header-font)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      boxShadow: theme === 'dark-fantasy' ? '0 4px 12px var(--shadow)' : 'none'
                    }}
                  >
                    🌑 Stone (Dark)
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* AI Engine Settings */}
              <div className="modal-section">
                <h3 style={{ margin: '0 0 15px 0', fontSize: '1.1rem', color: 'var(--text)' }}>🤖 AI Configuration</h3>

                <div style={{ marginBottom: '20px', background: 'var(--bg)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: 'var(--primary)', fontFamily: 'var(--header-font)' }}>Narrative DM</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={labelStyle}>PROVIDER</label>
                      <select value={selectedProvider} onChange={(e) => handleProviderChange(e.target.value, 'game')} style={selectStyle}>
                        <optgroup label="Cloud APIs">
                          <option value="openai">OpenAI</option>
                          <option value="gemini">Gemini</option>
                          <option value="claude">Claude</option>
                        </optgroup>
                        <optgroup label="CLI Tools">
                          <option value="codex">Codex CLI</option>
                          <option value="claude-cli">Claude CLI</option>
                          <option value="gemini-cli">Gemini CLI</option>
                        </optgroup>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>MODEL</label>
                      <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} style={selectStyle}>
                        {AVAILABLE_MODELS[selectedProvider]?.map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        )) || <option value="">Select Provider</option>}
                      </select>
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: '20px', background: 'var(--bg)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: 'var(--primary)', fontFamily: 'var(--header-font)' }}>OOC Assistant</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={labelStyle}>PROVIDER</label>
                      <select value={assistantProvider || selectedProvider} onChange={(e) => handleProviderChange(e.target.value, 'assistant')} style={selectStyle}>
                        <optgroup label="Cloud APIs">
                          <option value="openai">OpenAI</option>
                          <option value="gemini">Gemini</option>
                          <option value="claude">Claude</option>
                        </optgroup>
                        <optgroup label="CLI Tools">
                          <option value="codex">Codex CLI</option>
                          <option value="claude-cli">Claude CLI</option>
                          <option value="gemini-cli">Gemini CLI</option>
                        </optgroup>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>MODEL</label>
                      <select value={assistantModel || selectedModel} onChange={(e) => setAssistantModel(e.target.value)} style={selectStyle}>
                        {AVAILABLE_MODELS[assistantProvider || selectedProvider]?.map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        )) || <option value="">Select Provider</option>}
                      </select>
                    </div>
                  </div>
                </div>

                <div style={{ background: 'var(--bg)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: 'var(--primary)', fontFamily: 'var(--header-font)' }}>API Keys</h4>
                  <p style={{ margin: '0', fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6', textAlign: 'left' }}>
                    Cloud API keys are configured in the <code style={{ background: 'var(--surface-soft)', padding: '2px 6px', borderRadius: '3px' }}>.env</code> file on the server. Use <strong>gemini-cli</strong>, <strong>claude-cli</strong>, or <strong>codex</strong> providers for CLI-based access without API keys.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{ padding: '20px', borderTop: '1px solid var(--border)', textAlign: 'center', background: 'var(--bg)' }}>
          <button className="modal-close-button" onClick={onClose} style={{ padding: '12px 60px', borderRadius: '30px', fontFamily: 'var(--header-font)', textTransform: 'uppercase', letterSpacing: '2px' }}>
            Accept & Close
          </button>
        </div>
      </div>
    </div>
  );
};

const selectStyle = {
  width: '100%',
  padding: '10px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--surface)',
  fontSize: '0.9rem',
  color: 'var(--text)',
  boxSizing: 'border-box'
};

const labelStyle = {
  fontSize: '0.7rem',
  fontWeight: 'bold',
  color: 'var(--text-secondary)',
  display: 'block',
  marginBottom: '4px',
  letterSpacing: '0.5px'
};

// --- How to Play Modal --- //
export const HowToPlayModalContent = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <h2 style={{ fontFamily: 'var(--header-font)', color: 'var(--primary)', textAlign: 'center' }}>📜 Rules of Engagement</h2>
        <div style={{ padding: '20px 0', lineHeight: '1.8', color: 'var(--text)' }}>
          <p>
            Welcome, traveler! Your journey begins with your characters.
          </p>
          <p>
            ⚔️ <strong>Commanding:</strong> Type your actions in the scroll (text box) and the AI (Dungeon Master) will weave the tapestry of your fate.
          </p>
          <p>
            🎲 <strong>Probability:</strong> The DM handles the unseen dice of the realm, determining if your steel strikes true or your spells flicker out.
          </p>
          <p>
            🏰 <strong>World:</strong> Explore the map, visit keeps, and speak to NPCs. Every choice ripples across the fabric of the story.
          </p>
          <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '15px' }}>
            Note: The sidebar tracks your party's vitality and equipment. Keep a keen eye upon it.
          </p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <button className="modal-close-button" onClick={onClose} style={{ width: '100%', padding: '12px' }}>
            Begone! I have an adventure to start.
          </button>
        </div>
      </div>
    </div>
  );
};
