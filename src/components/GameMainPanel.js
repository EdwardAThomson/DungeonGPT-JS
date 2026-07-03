import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import SafeMarkdownMessage from './SafeMarkdownMessage';
import NarrativeHookChips from './NarrativeHookChips';

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
  onLookAround,
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
  lastPrompt,
  // Transient narrative-hook affordance (#35/#37): chips + preview image rendered
  // under the ONE Look-around message that carried the hook. Matched by message
  // object identity, so saved/reloaded conversations never resurrect live chips.
  hookChips = null,
  onHookChipAction,
  onHookChipIgnore
}) => {
  // High-intent conversion prompt: fired when a guest reaches for the gated AI chat.
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
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
            <button onClick={onOpenMap} className="view-map-button" data-tour="open-map" aria-label={townName ? `View ${townName} map` : 'View world map'}>
              <span aria-hidden="true">🗺️</span> {townName ? `${townName} Map` : 'Map'}
            </button>
            <button onClick={onOpenSettings} className="view-settings-button" aria-label="Open journal">
              <span aria-hidden="true">📖</span> Journal
            </button>
            {hasAdventureStarted && (
              <button onClick={onLookAround} className="look-around-button" disabled={isLoading} aria-label="Look around the current location">
                <span aria-hidden="true">🔍</span> Look around
              </button>
            )}
            <button onClick={onOpenInventory} className="view-settings-button" aria-label="Open party inventory">
              <span aria-hidden="true">📦</span> Inventory
            </button>
            <button onClick={onOpenHowToPlay} className="how-to-play-button" aria-label="Open how to play guide">
              <span aria-hidden="true">📜</span> How to Play
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
            <button onClick={onStartAdventure} className="start-adventure-button" aria-label="Start the adventure" data-tour="start-adventure">
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
            {hookChips && hookChips.message === msg && (
              <NarrativeHookChips
                encounter={hookChips.encounter}
                onAction={onHookChipAction}
                onIgnore={onHookChipIgnore}
              />
            )}
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
          <div className="user-input-wrap">
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
            {/* Guests can't type to the DM — a click here is peak intent, so prompt to sign in. */}
            {!aiAvailable && (
              <button
                type="button"
                className="guest-ai-overlay"
                onClick={() => setShowAuthPrompt(true)}
                aria-label="Sign in to unlock the AI Dungeon Master"
              />
            )}
          </div>
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

        {showAuthPrompt && (
          <div className="modal-overlay" onClick={() => setShowAuthPrompt(false)}>
            <div className="modal-content guest-ai-prompt" onClick={(e) => e.stopPropagation()}>
              <h2>✨ Unlock the AI Dungeon Master</h2>
              <p>Sign in to type free-form actions and get live AI narration — and your adventures save to your account so you can keep playing across devices.</p>
              <div className="guest-ai-prompt-actions">
                <Link to="/login" className="primary-button">Sign in</Link>
                <button type="button" className="secondary-button" onClick={() => setShowAuthPrompt(false)}>Maybe later</button>
              </div>
            </div>
          </div>
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
