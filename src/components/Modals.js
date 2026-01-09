import React, { useContext } from 'react';
import { AVAILABLE_MODELS, DEFAULT_MODELS } from '../llm/llm_constants';
import ApiKeysContext from '../contexts/ApiKeysContext';

// --- Settings Modal --- //
export const SettingsModalContent = ({
  isOpen, onClose, settings,
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%' }}>
        <h2>Game Settings</h2>

        <div className="modal-section">
          <h4>Narrative Engine</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#666', display: 'block', marginBottom: '4px' }}>PROVIDER</label>
              <select
                value={selectedProvider}
                onChange={(e) => handleProviderChange(e.target.value, 'game')}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
              >
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
              <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#666', display: 'block', marginBottom: '4px' }}>MODEL</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
              >
                {AVAILABLE_MODELS[selectedProvider]?.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                )) || <option value="">Select Provider First</option>}
              </select>
            </div>
          </div>
          <p style={{ fontSize: '11px', color: '#888', fontStyle: 'italic' }}>Powers the main game story and NPC dialog.</p>
        </div>

        <div className="modal-section">
          <h4>API Key Configuration (Optional)</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            {['openai', 'gemini', 'claude'].map(prov => (
              <div key={prov}>
                <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#666', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>{prov}</label>
                <input
                  type="password"
                  value={apiKeys[prov] || ''}
                  onChange={(e) => setApiKeys({ [prov]: e.target.value })}
                  placeholder="Enter Key..."
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '11px' }}
                />
              </div>
            ))}
          </div>
          <p style={{ fontSize: '11px', color: '#888', fontStyle: 'italic', marginTop: '5px' }}>
            Keys are stored in your browser session. Backend .env keys are used as fallback.
          </p>
        </div>

        <div className="modal-section">
          <h4>AI Assistant (Rules & Mechanics)</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#666', display: 'block', marginBottom: '4px' }}>PROVIDER</label>
              <select
                value={assistantProvider || selectedProvider}
                onChange={(e) => handleProviderChange(e.target.value, 'assistant')}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
              >
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
              <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#666', display: 'block', marginBottom: '4px' }}>MODEL</label>
              <select
                value={assistantModel || selectedModel}
                onChange={(e) => setAssistantModel(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
              >
                {AVAILABLE_MODELS[assistantProvider || selectedProvider]?.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                )) || <option value="">Select Provider First</option>}
              </select>
            </div>
          </div>
          <p style={{ fontSize: '11px', color: '#888', fontStyle: 'italic' }}>Powers the 🤖 terminal on the bottom right (OOC assistance).</p>
        </div>

        <div className="modal-section" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <h4>Story Mood</h4>
            <p><strong>Grimness:</strong> {displaySetting(settings.grimnessLevel)}</p>
            <p><strong>Darkness:</strong> {displaySetting(settings.darknessLevel)}</p>
          </div>
          <div>
            <h4>World Data</h4>
            <p>
              <strong>World Seed:</strong>{' '}
              {worldSeed !== undefined && worldSeed !== null ? (
                <code style={{ background: '#eee', padding: '2px 4px', borderRadius: '3px' }}>{worldSeed}</code>
              ) : (
                <span style={{ color: '#e74c3c', fontWeight: 'bold' }}>⚠️ Missing</span>
              )}
            </p>
          </div>
        </div>

        <button className="modal-close-button" onClick={onClose} style={{ marginTop: '20px' }}>
          Save & Close
        </button>
      </div>
    </div>
  );
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
