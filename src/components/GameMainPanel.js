import React from 'react';
import SafeMarkdownMessage from './SafeMarkdownMessage';

const GameMainPanel = ({
  campaignGoal,
  townName,
  townPosition,
  worldPosition,
  currentBiome,
  onOpenMap,
  onOpenInventory,
  onOpenHowToPlay,
  onOpenSettings,
  onManualSave,
  canManualSave,
  hasAdventureStarted,
  isLoading,
  onStartAdventure,
  conversation,
  progressStatus,
  error,
  onSubmit,
  userInput,
  onInputChange,
  selectedModel,
  selectedProvider,
  sessionId,
  onToggleDebug,
  showDebugInfo,
  onToggleAiNarrative,
  aiNarrativeEnabled,
  isMapLoaded,
  lastPrompt
}) => {
  return (
    <div className="game-main">
      <div className="game-top">
        <h2>Adventure Log</h2>
        <div className="game-info-header">
          <div>
            {campaignGoal && (
              <p><strong>Quest:</strong> <span style={{ color: 'var(--text-secondary)', fontWeight: 'bold' }}>{campaignGoal}</span></p>
            )}
            <p><strong>Location:</strong> {townName
              ? `${townName} (${townPosition?.x}, ${townPosition?.y})`
              : `(${worldPosition.x}, ${worldPosition.y}) - ${currentBiome}`
            }</p>
          </div>
          <div className="header-button-group">
            <button onClick={onOpenMap} className="view-map-button" aria-label={townName ? `View ${townName} map` : 'View world map'}>
              {townName ? `${townName} Map` : 'Map'}
            </button>
            <button onClick={onOpenInventory} className="view-settings-button" aria-label="Open party inventory">
              <span aria-hidden="true">📦</span> Inventory
            </button>
            <button onClick={onOpenHowToPlay} className="how-to-play-button" aria-label="Open how to play guide">
              How to Play
            </button>
            <button onClick={onOpenSettings} className="view-settings-button" aria-label="Open full settings">
              Full Settings
            </button>
            <button onClick={onManualSave} className="manual-save-button" disabled={!canManualSave} aria-label="Save game manually">
              <span aria-hidden="true">💾</span> Save
            </button>
          </div>
        </div>
      </div>

      <div className="conversation">
        {!hasAdventureStarted && !isLoading && (
          <div className="start-adventure-overlay">
            <button onClick={onStartAdventure} className="start-adventure-button" aria-label="Start the adventure">
              Start the Adventure!
            </button>
          </div>
        )}

        {conversation.map((msg, index) => (
          <div key={index} className={`message ${msg.role}`}>
            <SafeMarkdownMessage content={msg.content} />
          </div>
        ))}
        {isLoading && (
          <p className="message system">
            {progressStatus?.elapsed > 5
              ? `AI is working... (${progressStatus.elapsed}s)`
              : 'AI is thinking...'}
          </p>
        )}
        {error && <p className="message error">{error}</p>}
      </div>

      <div className="game-lower-section">
        <form onSubmit={onSubmit}>
          <label htmlFor="user-action-input" className="sr-only">Your action</label>
          <textarea
            id="user-action-input"
            value={userInput}
            onChange={onInputChange}
            placeholder={hasAdventureStarted ? "Type your action..." : "Click 'Start Adventure' above..."}
            rows="4"
            className="user-input"
            disabled={!hasAdventureStarted || isLoading}
            aria-label="Type your action or command"
          />
          <button type="submit" className="game-send-button" disabled={!hasAdventureStarted || !userInput.trim() || isLoading}>
            {isLoading ? '...' : '↑ Send'}
          </button>
        </form>
        <p className="info">AI responses may not always be accurate or coherent.</p>
        <div className="model-info-text">
          <span className="model-label">Active Model:</span>
          <span className="model-value">{selectedModel} ({selectedProvider.toUpperCase()})</span>
        </div>
        <div className="status-bar">
          <div className="api-key-status">
            <span
              className={`status-light ${['codex', 'claude-cli', 'gemini-cli'].includes(selectedProvider)
                ? 'status-cli'
                : 'status-active'
                }`}
              title={
                ['codex', 'claude-cli', 'gemini-cli'].includes(selectedProvider)
                  ? `${selectedProvider} uses local CLI (OAuth login)`
                  : `${selectedProvider} uses server-side API key (.env file)`
              }
            ></span>
            <span className="status-text">
              {['codex', 'claude-cli', 'gemini-cli'].includes(selectedProvider)
                ? 'CLI Mode'
                : 'Cloud API'}
            </span>
          </div>
        </div>

        {showDebugInfo && (
          <div className="debug-info-box">
            <h4>Debug Information</h4>
            <div className="debug-section">
              <strong>Stats:</strong>
              <pre>Session: {sessionId}</pre>
              <pre>Map: {isMapLoaded ? 'Loaded' : 'No'}</pre>
            </div>
            <div className="debug-section" style={{ marginTop: '10px' }}>
              <strong>Last Sent Prompt:</strong>
              <pre className="debug-prompt-pre">
                {lastPrompt || 'No prompt sent yet.'}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GameMainPanel;
