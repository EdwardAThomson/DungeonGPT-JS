import React, { useContext } from 'react';
import { AVAILABLE_MODELS, DEFAULT_MODELS } from '../llm/llm_constants';
import ApiKeysContext from '../contexts/ApiKeysContext';

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
        <h2 style={{ borderBottom: '2px solid #3498db', paddingBottom: '10px', marginBottom: '20px' }}>System Configuration</h2>

        <div className="modal-section">
          <h3 style={{ margin: '0 0 15px 0', fontSize: '1.1rem', color: '#2c3e50' }}>🤖 AI Engine Settings</h3>

          <div style={{ marginBottom: '20px', background: '#f8f9fa', padding: '15px', borderRadius: '8px' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#7f8c8d' }}>Narrative AI (The DM)</h4>
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

          <div style={{ marginBottom: '20px', background: '#f8f9fa', padding: '15px', borderRadius: '8px' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#7f8c8d' }}>Assistant AI (OOC Support)</h4>
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

          <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#7f8c8d' }}>API Keys</h4>
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

        <div className="modal-section" style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '15px' }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1rem', color: '#2c3e50' }}>📖 Active Story Profile (Frozen)</h3>
          <div style={{ fontSize: '0.9rem', color: '#444', background: '#fff9e6', padding: '10px', borderRadius: '6px', border: '1px solid #ffeaa7' }}>
            <p style={{ margin: '0 0 5px 0' }}><strong>Setting:</strong> {settings.shortDescription || 'N/A'}</p>
            {settings.campaignGoal && (
              <p style={{ margin: '0 0 5px 0' }}><strong>Quest:</strong> <span style={{ color: '#d35400', fontWeight: 'bold' }}>{settings.campaignGoal}</span></p>
            )}
            <p style={{ margin: '0' }}><strong>Mood:</strong> {settings.grimnessLevel || 'Neutral'} / {settings.darknessLevel || 'Neutral'} | <strong>World:</strong> {settings.magicLevel || 'Low Magic'} ({settings.technologyLevel || 'Medieval'})</p>
          </div>
          <p style={{ margin: '5px 0 0 0', fontSize: '0.75rem', color: '#999', fontStyle: 'italic' }}>
            Story settings are set during new game creation and cannot be changed during active play.
          </p>
        </div>

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <button className="modal-close-button" onClick={onClose} style={{ padding: '10px 30px' }}>
            Close
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
  border: '1px solid #dcdde1',
  backgroundColor: '#fff',
  fontSize: '0.9rem',
  color: '#2f3640',
  boxSizing: 'border-box'
};

const labelStyle = {
  fontSize: '0.7rem',
  fontWeight: 'bold',
  color: '#7f8c8d',
  display: 'block',
  marginBottom: '4px',
  letterSpacing: '0.5px'
};

// --- How to Play Modal --- //
export const HowToPlayModalContent = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>How to Play</h2>
        <p>
          Welcome to the adventure!
        </p>
        <p>
          Simply type what you want your character(s) to do in the text box below the conversation log and press Enter or click the Send button.
        </p>
        <p>
          The AI acts as the Dungeon Master (DM), describing the world, the results of your actions, and controlling any non-player characters (NPCs).
        </p>
        <p>
          Your party members and their stats are shown in the sidebar on the right. The game settings (like mood and magic level) influence the AI's responses.
        </p>
        <button className="modal-close-button" onClick={onClose}>
          Got it!
        </button>
      </div>
    </div>
  );
};
