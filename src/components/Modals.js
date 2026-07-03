import React, { useContext, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { getAvailableModels, DEFAULT_MODELS } from '../llm/llm_constants';
import SettingsContext from '../contexts/SettingsContext';
import { useModal } from '../contexts/ModalContext';
import ModalShell from './ModalShell';

// --- Share QR Code (inline expandable) --- //
export const ShareQRCode = () => {
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

// --- AI engine settings (provider/model pickers) --- //
// Shared by the navbar AI Settings modal and the Adventure Book's ⚙️ AI tab (#52),
// so the two surfaces cannot drift.
export const AiEngineSettings = ({
  selectedProvider, setSelectedProvider,
  selectedModel, setSelectedModel,
  assistantProvider, setAssistantProvider,
  assistantModel, setAssistantModel,
  showActiveStatus = false
}) => {
  const AVAILABLE_MODELS = getAvailableModels();

  const handleProviderChange = (newProvider, type) => {
    if (type === 'game') {
      setSelectedProvider(newProvider);
      setSelectedModel(DEFAULT_MODELS[newProvider]);
    } else {
      setAssistantProvider(newProvider);
      setAssistantModel(DEFAULT_MODELS[newProvider]);
    }
  };

  const renderPicker = (title, type, provider, model, setModel) => (
    <div style={{ marginBottom: '20px', background: 'var(--bg)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)' }}>
      <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: 'var(--primary)', fontFamily: 'var(--header-font)' }}>{title}</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label style={labelStyle}>PROVIDER</label>
          <select value={provider} onChange={(e) => handleProviderChange(e.target.value, type)} style={selectStyle}>
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
          <select value={model} onChange={(e) => setModel(e.target.value)} style={selectStyle}>
            {AVAILABLE_MODELS[provider]?.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            )) || <option value="">Select Provider</option>}
          </select>
        </div>
      </div>
    </div>
  );

  return (
    <div className="modal-section">
      <h3 style={{ margin: '0 0 15px 0', fontSize: '1.1rem', color: 'var(--text)' }}>🤖 AI Configuration</h3>
      {/* AI pool selector: Free is the only live pool today. Premium (the Members
          OpenRouter pool, backlog #7) renders locked until server-side entitlements
          (#39) + the premium AI backend exist — a visible seam, not a fake feature. */}
      <div style={{ marginBottom: '20px', display: 'flex', gap: '8px' }} role="radiogroup" aria-label="AI pool">
        <button
          type="button"
          role="radio"
          aria-checked="true"
          style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', border: '2px solid var(--primary)', background: 'var(--surface)', color: 'var(--primary)', fontWeight: 700, cursor: 'default' }}
        >
          ⚡ Free AI
          <div style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--text-secondary)', marginTop: '2px' }}>Cloudflare open-weights pool — included for everyone</div>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked="false"
          disabled
          title="Premium AI models arrive with Membership — not available yet"
          style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', border: '2px dashed var(--border)', background: 'transparent', color: 'var(--text-secondary)', opacity: 0.65, cursor: 'not-allowed' }}
        >
          🔒 Premium AI
          <div style={{ fontSize: '0.72rem', fontWeight: 400, marginTop: '2px' }}>Stronger models · Members — coming soon</div>
        </button>
      </div>
      {renderPicker('Narrative DM', 'game', selectedProvider, selectedModel, setSelectedModel)}
      {renderPicker('OOC Assistant', 'assistant', assistantProvider || selectedProvider, assistantModel || selectedModel, setAssistantModel)}
      {showActiveStatus && (
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
  const { theme, setTheme } = useContext(SettingsContext);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings-modal-refined" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '20px 20px 10px 20px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ margin: 0, color: 'var(--primary)', fontFamily: 'var(--header-font)', fontSize: '1.4rem' }}>⚙️ AI Settings</h2>
        </div>

        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {/* AI Engine Settings */}
          <AiEngineSettings
            selectedProvider={selectedProvider}
            setSelectedProvider={setSelectedProvider}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            assistantProvider={assistantProvider}
            setAssistantProvider={setAssistantProvider}
            assistantModel={assistantModel}
            setAssistantModel={setAssistantModel}
          />

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
