import React from 'react';
import { Link } from 'react-router-dom';
import SafeMarkdownMessage from './SafeMarkdownMessage';

const GameMainPanel = ({
  campaignGoal,
  townName,
  subLocationName,
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
  aiAvailable = true,
  isMapLoaded,
  lastPrompt
}) => {
  return (
    <div className="game-main">
      <div className="game-top">
        <h2>Adventure Log</h2>
        <div className="game-info-header">
          <div>
            <p><strong>Location:</strong> {townName
              ? `(${worldPosition.x}, ${worldPosition.y}) - ${currentBiome} | ${townName} - ${subLocationName}`
              : `(${worldPosition.x}, ${worldPosition.y}) - ${currentBiome}`
            }</p>
          </div>
          <div className="header-button-group">
            <button onClick={onOpenMap} className="view-map-button" aria-label={townName ? `View ${townName} map` : 'View world map'}>
              <span aria-hidden="true">🗺️</span> {townName ? `${townName} Map` : 'Map'}
            </button>
            <button onClick={onOpenInventory} className="view-settings-button" aria-label="Open party inventory">
              <span aria-hidden="true">📦</span> Inventory
            </button>
            <button onClick={onOpenHowToPlay} className="how-to-play-button" aria-label="Open how to play guide">
              <span aria-hidden="true">📜</span> How to Play
            </button>
            <button onClick={onOpenSettings} className="view-settings-button" aria-label="Open journal">
              <span aria-hidden="true">📖</span> Journal
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

        {/* Quest reminder as virtual first message - not stored in DB */}
        {campaignGoal && (
          <div className="message system quest-message">
            <SafeMarkdownMessage content={`**Quest:** ${campaignGoal}`} />
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
        <form onSubmit={aiAvailable ? onSubmit : (e) => e.preventDefault()}>
          <label htmlFor="user-action-input" className="sr-only">Your action</label>
          <textarea
            id="user-action-input"
            value={userInput}
            onChange={onInputChange}
            placeholder={
              !aiAvailable
                ? "Sign in to type actions and unlock the AI Dungeon Master…"
                : hasAdventureStarted ? "Type your action..." : "Click 'Start Adventure' above..."
            }
            rows="4"
            className="user-input"
            disabled={!aiAvailable || !hasAdventureStarted || isLoading}
            aria-label="Type your action or command"
          />
          {aiAvailable ? (
            <button type="submit" className="game-send-button" disabled={!hasAdventureStarted || !userInput.trim() || isLoading}>
              {isLoading ? '...' : '↑ Send'}
            </button>
          ) : (
            <Link to="/login" className="game-send-button guest-ai-gate-btn">Sign in</Link>
          )}
        </form>
        {aiAvailable ? (
          <p className="info">AI responses may not always be accurate or coherent.</p>
        ) : (
          <p className="info guest-ai-info">✨ <strong>The AI Dungeon Master is resting.</strong> Keep exploring and fighting as a guest — sign in to type free-form actions and unlock full AI narration.</p>
        )}

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
