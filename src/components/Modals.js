import React, { useContext, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { getAvailableModels, DEFAULT_MODELS } from '../llm/llm_constants';
import { getStepHint, formatStepProgress, isQuestReadyToTurnIn } from '../game/questHints';
import ApiKeysContext from '../contexts/ApiKeysContext';
import SettingsContext from '../contexts/SettingsContext';
import { useModal } from '../contexts/ModalContext';
import ModalShell from './ModalShell';

// --- Share QR Code (inline expandable) --- //
const ShareQRCode = () => {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = window.location.origin;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{ textAlign: 'center', marginTop: '8px' }}>
      <button
        onClick={() => setShow(!show)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-secondary)', fontSize: '0.75rem',
          fontFamily: 'var(--header-font)', letterSpacing: '0.5px',
          opacity: 0.6, transition: 'opacity 0.2s'
        }}
        onMouseEnter={e => e.target.style.opacity = '1'}
        onMouseLeave={e => e.target.style.opacity = '0.6'}
      >
        {show ? '▾ Hide QR Code' : '▸ Share this game'}
      </button>
      {show && (
        <div style={{
          marginTop: '12px', padding: '16px',
          background: '#ffffff', borderRadius: '12px',
          display: 'inline-block', boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <QRCodeSVG value={url} size={160} level="M" />
          <div style={{
            marginTop: '8px', fontSize: '0.7rem',
            color: '#666', wordBreak: 'break-all', maxWidth: '160px'
          }}>
            {url}
          </div>
          <button
            onClick={handleCopyLink}
            style={{
              marginTop: '10px', padding: '6px 16px',
              background: copied ? '#4a7c59' : '#555',
              color: '#fff', border: 'none', borderRadius: '6px',
              cursor: 'pointer', fontSize: '0.7rem',
              fontFamily: 'var(--header-font)', letterSpacing: '0.5px',
              transition: 'background 0.2s'
            }}
          >
            {copied ? '✓ Copied!' : 'Copy Link'}
          </button>
        </div>
      )}
    </div>
  );
};

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
  const AVAILABLE_MODELS = getAvailableModels();

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
                    {Object.keys(AVAILABLE_MODELS).includes('openai') && (
                      <optgroup label="Cloud APIs">
                        {AVAILABLE_MODELS['openai'] && <option value="openai">OpenAI</option>}
                        {AVAILABLE_MODELS['gemini'] && <option value="gemini">Gemini</option>}
                        {AVAILABLE_MODELS['claude'] && <option value="claude">Claude</option>}
                      </optgroup>
                    )}
                    {AVAILABLE_MODELS['cf-workers'] && (
                      <optgroup label="CloudFlare Workers">
                        <option value="cf-workers">CF Workers AI</option>
                      </optgroup>
                    )}
                    {(AVAILABLE_MODELS['codex'] || AVAILABLE_MODELS['claude-cli'] || AVAILABLE_MODELS['gemini-cli']) && (
                      <optgroup label="CLI Tools">
                        {AVAILABLE_MODELS['codex'] && <option value="codex">Codex CLI</option>}
                        {AVAILABLE_MODELS['claude-cli'] && <option value="claude-cli">Claude CLI</option>}
                        {AVAILABLE_MODELS['gemini-cli'] && <option value="gemini-cli">Gemini CLI</option>}
                      </optgroup>
                    )}
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
                    {Object.keys(AVAILABLE_MODELS).includes('openai') && (
                      <optgroup label="Cloud APIs">
                        {AVAILABLE_MODELS['openai'] && <option value="openai">OpenAI</option>}
                        {AVAILABLE_MODELS['gemini'] && <option value="gemini">Gemini</option>}
                        {AVAILABLE_MODELS['claude'] && <option value="claude">Claude</option>}
                      </optgroup>
                    )}
                    {AVAILABLE_MODELS['cf-workers'] && (
                      <optgroup label="CloudFlare Workers">
                        <option value="cf-workers">CF Workers AI</option>
                      </optgroup>
                    )}
                    {(AVAILABLE_MODELS['codex'] || AVAILABLE_MODELS['claude-cli'] || AVAILABLE_MODELS['gemini-cli']) && (
                      <optgroup label="CLI Tools">
                        {AVAILABLE_MODELS['codex'] && <option value="codex">Codex CLI</option>}
                        {AVAILABLE_MODELS['claude-cli'] && <option value="claude-cli">Claude CLI</option>}
                        {AVAILABLE_MODELS['gemini-cli'] && <option value="gemini-cli">Gemini CLI</option>}
                      </optgroup>
                    )}
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
          <ShareQRCode />
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
  // 'story' (campaign goal + milestones) | 'quests' (side quests); 'ai' branch retained but unused.
  const [activeTab, setActiveTab] = useState('story');
  const [expandedQuests, setExpandedQuests] = useState({});
  const { apiKeys, setApiKeys } = useContext(ApiKeysContext);
  const AVAILABLE_MODELS = getAvailableModels();

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
        <div style={{ padding: '20px 20px 0 20px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ margin: '0 0 10px 0', color: 'var(--primary)', fontFamily: 'var(--header-font)', fontSize: '1.4rem' }}>📖 Journal</h2>
          <div role="tablist" aria-label="Journal sections" style={{ display: 'flex', gap: 6 }}>
            {[
              { id: 'story', label: '📜 Campaign' },
              { id: 'quests', label: `🗺️ Side Quests (${(settings.sideQuests || []).filter(q => q.status === 'active').length})` }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '8px 14px',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === tab.id ? '3px solid var(--primary)' : '3px solid transparent',
                  color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-secondary)',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'var(--header-font)'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {activeTab === 'story' ? (
            <>
              {/* Story Profile Section */}
              <div className="modal-section" style={{ marginBottom: '25px' }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--text)', background: 'var(--surface)', padding: '18px 18px 14px', borderRadius: '8px', border: '1px solid var(--border)', boxShadow: 'inset 0 2px 4px var(--shadow)' }}>
                  {/* Quest box (moved up): adventure name + goal */}
                  {(settings.templateName || settings.campaignGoal) && (
                    <div style={{ margin: '0 0 16px 0', padding: '14px 16px', background: 'var(--primary-tint-10)', border: '1px solid var(--primary)', borderRadius: '8px', textAlign: 'center' }}>
                      <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Quest</p>
                      {settings.templateName && (
                        <p style={{ margin: '0 0 8px 0', color: 'var(--primary)', fontWeight: '700', fontSize: '1.3rem', fontFamily: 'var(--header-font)', lineHeight: '1.3' }}>{settings.templateName}</p>
                      )}
                      {settings.campaignGoal && (
                        <p style={{ margin: '0', color: 'var(--text)', fontWeight: '500', fontSize: '1.1rem', lineHeight: '1.45' }}>{settings.campaignGoal}</p>
                      )}
                    </div>
                  )}
                  {settings.campaignComplete && (
                    <div style={{ margin: '0 0 18px 0', padding: '12px', background: 'var(--success-tint-20)', borderLeft: '4px solid var(--state-success)', borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--state-success)' }}>🏆 CAMPAIGN COMPLETE 🏆</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Victory Achieved!</div>
                    </div>
                  )}
                  <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 16px', margin: '0 0 16px 0' }}>
                    <p style={{ margin: 0, fontSize: '1.05rem', lineHeight: '1.55', color: 'var(--text)' }}>
                      {settings.shortDescription || 'Default Fantasy World'}
                    </p>
                  </div>
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
                    const totalCount = normalized.length;
                    const completedCount = normalized.filter(m => m.completed).length;
                    const currentIndex = normalized.findIndex(m => !m.completed);

                    return (
                      <div style={{ margin: '0 0 14px 0', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 16px' }}>
                        {/* Milestones Header with Progress */}
                        {totalCount > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '0 0 10px 0', paddingBottom: '6px', borderBottom: '1px solid var(--border)' }}>
                            <span style={{ fontSize: '0.95rem', color: 'var(--primary)', fontFamily: 'var(--header-font)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                              Milestones
                            </span>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                              {completedCount}/{totalCount} complete
                            </span>
                          </div>
                        )}

                        {/* Milestones list, strict numerical order */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {normalized.map((m, idx) => {
                            const isCurrent = idx === currentIndex;
                            const isCompleted = m.completed;
                            const isFuture = !isCompleted && !isCurrent;

                            return (
                              <div
                                key={m.id ?? idx}
                                style={{
                                  display: 'flex',
                                  alignItems: 'baseline',
                                  gap: '8px',
                                  padding: isCurrent ? '8px 12px' : '4px 12px',
                                  background: isCurrent ? 'var(--primary-tint-10)' : 'transparent',
                                  borderLeft: isCurrent ? '3px solid var(--primary)' : '3px solid transparent',
                                  borderRadius: '4px',
                                  transition: 'background 0.2s'
                                }}
                              >
                                <span style={{
                                  fontSize: '0.95rem',
                                  fontWeight: 700,
                                  color: 'var(--text-secondary)',
                                  opacity: 0.85,
                                  minWidth: '20px',
                                  fontVariantNumeric: 'tabular-nums'
                                }}>
                                  {idx + 1}.
                                </span>
                                <span style={{
                                  fontSize: isCurrent ? '1.15rem' : '1.02rem',
                                  lineHeight: '1.45',
                                  color: isCompleted ? 'var(--text-secondary)' : 'var(--text)',
                                  textDecoration: isCompleted ? 'line-through' : 'none',
                                  opacity: isFuture ? 0.6 : 1,
                                  fontWeight: isCurrent ? '500' : 'normal',
                                  flex: 1
                                }}>
                                  {isCompleted && (
                                    <span style={{ color: 'var(--state-success)', marginRight: '6px', textDecoration: 'none', display: 'inline-block' }}>✓</span>
                                  )}
                                  {isCurrent && <span style={{ marginRight: '6px' }}>🎯</span>}
                                  {m.text}
                                  {(() => {
                                    // For milestones that name an authored NPC, item and/or building,
                                    // show the who/what/where so the player knows the objective target
                                    // (e.g. "Moorland Herbs · Grey Moors"). Milestones without
                                    // spawn/building data render nothing.
                                    const who = (m.spawn?.type === 'npc' || m.spawn?.type === 'item') ? m.spawn.name : null;
                                    const where = m.building?.name
                                      || (m.spawn?.type === 'npc' || m.spawn?.type === 'item' ? m.spawn.location : null);
                                    const sub = [who, where].filter(Boolean).join(' · ');
                                    if (!sub) return null;
                                    return (
                                      <span style={{
                                        display: 'block',
                                        fontSize: '0.85rem',
                                        fontWeight: 'normal',
                                        color: 'var(--text-secondary)',
                                        opacity: 0.85,
                                        marginTop: '2px',
                                        textDecoration: 'none'
                                      }}>
                                        {sub}
                                      </span>
                                    );
                                  })()}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '6px 20px', paddingTop: '12px', borderTop: '1px solid var(--border)', fontSize: '0.92rem', color: 'var(--text-secondary)' }}>
                    <span title="The overall tone and atmosphere of the story - from light-hearted to grim and serious">
                      <span style={{ opacity: 0.7 }}>Mood:</span> {settings.grimnessLevel || 'Neutral'} / {settings.darknessLevel || 'Neutral'}
                    </span>
                    <span title="How prevalent and powerful magic is in this world - from rare and subtle to commonplace and dramatic">
                      <span style={{ opacity: 0.7 }}>Magic:</span> {settings.magicLevel || 'Medium Magic'}
                    </span>
                    <span title="The level of technological advancement - from primitive to futuristic">
                      <span style={{ opacity: 0.7 }}>Tech:</span> {settings.technologyLevel || 'Medieval'}
                    </span>
                  </div>
                </div>
                <p style={{ margin: '10px 0 0 0', fontSize: '0.7rem', color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center', opacity: 0.6 }}>
                  * Story settings are woven at the start and cannot be changed here.
                </p>
              </div>

            </>
          ) : activeTab === 'quests' ? (
            <>
              {/* Side Quests tab — accepted quests with per-step progress + derived how/where
                  hints (questHints), sorted ready-to-turn-in → active → completed. */}
              {(() => {
                const accepted = (settings.sideQuests || []).filter(q => q.status !== 'available');
                if (accepted.length === 0) {
                  return (
                    <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center', marginTop: '30px' }}>
                      No side quests yet. Keep exploring — rumours travel, and folk in taverns and town halls have work for capable hands.
                    </p>
                  );
                }
                const rank = (q) => (isQuestReadyToTurnIn(q) ? 0 : q.status === 'active' ? 1 : 2);
                const sorted = [...accepted].sort((a, b) => rank(a) - rank(b));
                return sorted.map(q => {
                  const total = q.milestones.length;
                  const done = q.milestones.filter(m => m.completed).length;
                  const ready = isQuestReadyToTurnIn(q);
                  const expanded = !!expandedQuests[q.id];
                  return (
                    <div key={q.id} style={{ border: `1px solid ${ready ? 'var(--primary)' : 'var(--border)'}`, borderRadius: '8px', marginBottom: '8px', background: 'var(--bg)' }}>
                      <button
                        onClick={() => setExpandedQuests(p => ({ ...p, [q.id]: !p[q.id] }))}
                        style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '10px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text)' }}
                      >
                        <span style={{ fontWeight: 700, textDecoration: q.status === 'completed' ? 'line-through' : 'none', opacity: q.status === 'completed' ? 0.7 : 1 }}>
                          {q.status === 'completed' ? '✓ ' : ''}{q.title}
                        </span>
                        <span style={{ fontSize: '0.85rem', color: ready ? 'var(--primary)' : 'var(--text-secondary)', fontWeight: ready ? 700 : 400 }}>
                          {ready ? '✅ Ready to turn in' : `${done}/${total}`} {expanded ? '▲' : '▼'}
                        </span>
                      </button>
                      {expanded && (
                        <div style={{ padding: '0 14px 12px' }}>
                          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: '0 0 8px' }}>{q.description}</p>
                          {q.milestones.map(m => {
                            const hint = getStepHint(m, q);
                            return (
                              <div key={m.id} style={{ marginBottom: '6px' }}>
                                <div style={{ fontSize: '0.95rem', color: m.completed ? 'var(--text-secondary)' : 'var(--text)', textDecoration: m.completed ? 'line-through' : 'none' }}>
                                  {m.completed ? '✓' : '•'} {m.text}{formatStepProgress(m)}
                                </div>
                                {hint && (
                                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', opacity: 0.85, marginLeft: '16px' }}>
                                    {hint}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
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
                        {Object.keys(AVAILABLE_MODELS).includes('openai') && (
                          <optgroup label="Cloud APIs">
                            {AVAILABLE_MODELS['openai'] && <option value="openai">OpenAI</option>}
                            {AVAILABLE_MODELS['gemini'] && <option value="gemini">Gemini</option>}
                            {AVAILABLE_MODELS['claude'] && <option value="claude">Claude</option>}
                          </optgroup>
                        )}
                        {AVAILABLE_MODELS['cf-workers'] && (
                          <optgroup label="CloudFlare Workers">
                            <option value="cf-workers">CF Workers AI</option>
                          </optgroup>
                        )}
                        {(AVAILABLE_MODELS['codex'] || AVAILABLE_MODELS['claude-cli'] || AVAILABLE_MODELS['gemini-cli']) && (
                          <optgroup label="CLI Tools">
                            {AVAILABLE_MODELS['codex'] && <option value="codex">Codex CLI</option>}
                            {AVAILABLE_MODELS['claude-cli'] && <option value="claude-cli">Claude CLI</option>}
                            {AVAILABLE_MODELS['gemini-cli'] && <option value="gemini-cli">Gemini CLI</option>}
                          </optgroup>
                        )}
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
                        {Object.keys(AVAILABLE_MODELS).includes('openai') && (
                          <optgroup label="Cloud APIs">
                            {AVAILABLE_MODELS['openai'] && <option value="openai">OpenAI</option>}
                            {AVAILABLE_MODELS['gemini'] && <option value="gemini">Gemini</option>}
                            {AVAILABLE_MODELS['claude'] && <option value="claude">Claude</option>}
                          </optgroup>
                        )}
                        {AVAILABLE_MODELS['cf-workers'] && (
                          <optgroup label="CloudFlare Workers">
                            <option value="cf-workers">CF Workers AI</option>
                          </optgroup>
                        )}
                        {(AVAILABLE_MODELS['codex'] || AVAILABLE_MODELS['claude-cli'] || AVAILABLE_MODELS['gemini-cli']) && (
                          <optgroup label="CLI Tools">
                            {AVAILABLE_MODELS['codex'] && <option value="codex">Codex CLI</option>}
                            {AVAILABLE_MODELS['claude-cli'] && <option value="claude-cli">Claude CLI</option>}
                            {AVAILABLE_MODELS['gemini-cli'] && <option value="gemini-cli">Gemini CLI</option>}
                          </optgroup>
                        )}
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


                {/* Active Model Status */}
                <div style={{ marginTop: '20px', background: 'var(--surface)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Active Model:</span>
                    <span style={{ marginLeft: '8px', fontSize: '0.9rem', color: 'var(--text)', fontWeight: 'bold' }}>{selectedModel}</span>
                    <span style={{ marginLeft: '4px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>({selectedProvider.toUpperCase()})</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        background: ['codex', 'claude-cli', 'gemini-cli'].includes(selectedProvider) ? '#9b59b6' : '#2ecc71'
                      }}
                      title={['codex', 'claude-cli', 'gemini-cli'].includes(selectedProvider) ? 'CLI Mode' : 'Cloud API'}
                    />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {['codex', 'claude-cli', 'gemini-cli'].includes(selectedProvider) ? 'CLI Mode' : 'Cloud API'}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{ padding: '20px', borderTop: '1px solid var(--border)', textAlign: 'center', background: 'var(--bg)' }}>
          <button className="modal-close-button" onClick={onClose} style={{ padding: '12px 60px', borderRadius: '30px', fontFamily: 'var(--header-font)', textTransform: 'uppercase', letterSpacing: '2px' }}>
            Accept & Close
          </button>
          <ShareQRCode />
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
export const HowToPlayModalContent = () => {
  const { close } = useModal('howToPlay');

  return (
    <ModalShell modalId="howToPlay" ariaLabel="How to Play" style={{ maxWidth: '500px' }}>
      <h2 style={{ fontFamily: 'var(--header-font)', color: 'var(--primary)', textAlign: 'center' }}>📜 Rules of Engagement</h2>
      <div style={{ padding: '20px 0', lineHeight: '1.8', color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <p>
          Welcome, traveler! Your journey begins with your party of heroes.
        </p>
        <p>
          ⚔️ <strong>Commanding:</strong> Type your actions in the scroll below and the AI Dungeon Master will weave the tapestry of your fate.
        </p>
        <p>
          🗺️ <strong>Exploration:</strong> Click adjacent tiles on the world map to move your party. Enter towns to visit taverns, shops, temples, and more.
        </p>
        <p>
          🎲 <strong>Encounters:</strong> Beasts and brigands lurk in the wilds. When danger strikes, choose your actions wisely from the options presented.
        </p>
        <p>
          📜 <strong>Quests:</strong> Follow your campaign milestones to advance the story. Track your progress in the quest log.
        </p>
        <p>
          🎒 <strong>Inventory:</strong> Collect loot, potions, and equipment. Open the party inventory to manage your spoils.
        </p>
        <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '15px' }}>
          Note: The sidebar tracks your party's vitality and stats. Keep a keen eye upon it.
        </p>
      </div>
      <div style={{ textAlign: 'center' }}>
        <button className="modal-close-button" onClick={close} style={{ width: '100%', padding: '12px' }}>
          Begone! I have an adventure to start.
        </button>
      </div>
    </ModalShell>
  );
};
