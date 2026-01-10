import React, { useContext } from 'react';
import { AVAILABLE_MODELS, DEFAULT_MODELS } from '../llm/llm_constants';
import ApiKeysContext from '../contexts/ApiKeysContext';
import SettingsContext from '../contexts/SettingsContext';

// --- Settings Modal --- //
export const SettingsModalContent = ({
  isOpen, onClose, settings, setSettings,
  selectedProvider, setSelectedProvider,
  selectedModel, setSelectedModel,
  assistantProvider, setAssistantProvider,
  assistantModel, setAssistantModel,
  worldSeed
}) => {
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
      <div className="modal-content settings-modal-refined" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%', maxHeight: '85vh', overflowY: 'auto' }}>
        <h2 style={{ borderBottom: '2px solid var(--primary)', paddingBottom: '10px', marginBottom: '20px', color: 'var(--primary)' }}>System Configuration</h2>

        <div className="modal-section">
          <h3 style={{ margin: '0 0 15px 0', fontSize: '1.1rem', color: 'var(--text)' }}>🤖 AI Engine Settings</h3>

          <div style={{ marginBottom: '20px', background: 'var(--bg)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Narrative AI (The DM)</h4>
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
            <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Assistant AI (OOC Support)</h4>
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
            <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>API Keys</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
              {['openai', 'gemini', 'claude'].map(prov => (
                <div key={prov}>
                  <label style={labelStyle}>{prov.toUpperCase()}</label>
                  <input
                    type="password"
                    value={apiKeys[prov] || ''}
                    onChange={(e) => setApiKeys({ [prov]: e.target.value })}
                    placeholder="Key..."
                    style={{ ...selectStyle, padding: '8px', fontSize: '11px' }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-section" style={{ borderTop: '1px solid var(--border)', paddingTop: '15px', marginTop: '15px' }}>
          <h3 style={{ margin: '0 0 15px 0', fontSize: '1.1rem', color: 'var(--primary)', fontFamily: 'var(--header-font)' }}>🎭 Appearance</h3>
          <div style={{ display: 'flex', gap: '15px' }}>
            <button
              onClick={() => setTheme('light-fantasy')}
              style={{
                flex: 1,
                padding: '12px',
                background: theme === 'light-fantasy' ? 'var(--primary)' : 'var(--bg)',
                color: theme === 'light-fantasy' ? 'var(--bg)' : 'var(--text)',
                border: '1px solid var(--primary)',
                fontFamily: 'var(--header-font)',
                borderRadius: '4px',
                cursor: 'pointer',
                opacity: theme === 'light-fantasy' ? 1 : 0.7,
                boxShadow: theme === 'light-fantasy' ? '0 0 10px var(--primary)' : 'none'
              }}
            >
              📜 Parchment
            </button>
            <button
              onClick={() => setTheme('dark-fantasy')}
              style={{
                flex: 1,
                padding: '12px',
                background: theme === 'dark-fantasy' ? 'var(--primary)' : 'var(--bg)',
                color: theme === 'dark-fantasy' ? 'var(--bg)' : 'var(--text)',
                border: '1px solid var(--primary)',
                fontFamily: 'var(--header-font)',
                borderRadius: '4px',
                cursor: 'pointer',
                opacity: theme === 'dark-fantasy' ? 1 : 0.7,
                boxShadow: theme === 'dark-fantasy' ? '0 0 10px var(--primary)' : 'none'
              }}
            >
              🌑 Stone
            </button>
          </div>
        </div>

        <div className="modal-section" style={{ marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '15px' }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1rem', color: 'var(--primary)', fontFamily: 'var(--header-font)' }}>📖 Active Story Profile (Frozen)</h3>
          <div style={{ fontSize: '0.9rem', color: 'var(--text)', background: 'var(--surface)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
            <p style={{ margin: '0 0 5px 0' }}><strong>Setting:</strong> {settings.shortDescription || 'N/A'}</p>
            {settings.campaignGoal && (
              <p style={{ margin: '0 0 5px 0' }}><strong>Quest:</strong> <span style={{ color: '#d35400', fontWeight: 'bold' }}>{settings.campaignGoal}</span></p>
            )}
            <p style={{ margin: '0' }}><strong>Mood:</strong> {settings.grimnessLevel || 'Neutral'} / {settings.darknessLevel || 'Neutral'} | <strong>World:</strong> {settings.magicLevel || 'Low Magic'} ({settings.technologyLevel || 'Medieval'})</p>
          </div>
          <p style={{ margin: '5px 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            Story settings are set during new game creation and cannot be changed during active play.
          </p>
        </div>

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <button className="modal-close-button" onClick={onClose} style={{ padding: '10px 30px' }}>
            Close
          </button>
        </div>
      </div>
    </div >
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
