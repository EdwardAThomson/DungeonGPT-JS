import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { sendEvent } from '../services/telemetry';
import SafeMarkdownMessage from './SafeMarkdownMessage';
import NarrativeHookChips from './NarrativeHookChips';
import SaveSyncIndicator from './SaveSyncIndicator';
import RdDialog from './RdDialog';

// Player-action length guard (maintainer 2026-07-06): the worker rejects
// composed prompts over 32k chars, of which the typed action is one slice
// alongside the DM protocol, context, and history. 2,000 chars is far more
// than any action needs while leaving the composed prompt enormous headroom.
// No auto-truncation: near the limit a live counter appears, over it the
// counter turns red and Send is blocked.
export const MAX_ACTION_CHARS = 2000;
const COUNTER_SHOW_AT = 1700;

// Readable place line for the header ("Open plains", "Willowdale · The Crooked Pint").
// The world coordinates stay as a small suffix: they orient the player on the map and the
// guest save/resume e2e reads this line to detect a move.
const BIOME_LABEL = {
  plains: 'Open plains', grassland: 'Open grassland', grass: 'Open grassland', forest: 'Forest',
  woodland: 'Woodland', hills: 'Hills', mountain: 'Mountains', mountains: 'Mountains',
  beach: 'Coast', water: 'Open water', desert: 'Desert', snow: 'Snowfields', swamp: 'Marsh',
};
const biomeLabel = (b) => BIOME_LABEL[b] || (b ? b.charAt(0).toUpperCase() + b.slice(1) : 'The wilds');

const ICON = {
  map: <><path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4z" /><path d="M8 2v16M16 6v16" /></>,
  journal: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
  look: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
  pack: <><path d="M5 8h14l-1 13H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  help: <><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></>,
  save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></>,
  send: <><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></>,
};
const Icon = ({ name }) => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON[name]}</svg>
);

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
  // Save sync indicator: surfaces the existing save ack (both manual + autosaves).
  saveStatus = 'idle',
  isSaving = false,
  signedIn = false,
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
  // Names for the guest sign-in prompt: naming the player's own hero/campaign
  // beats generic copy. Both optional; the prompt falls back to generic wording.
  partyLeadName = null,
  templateName = null,
  isMapLoaded,
  lastPrompt,
  // Transient narrative-hook affordance (#35/#37): chips + preview image rendered
  // under the ONE Look-around message that carried the hook. Matched by message
  // object identity, so saved/reloaded conversations never resurrect live chips.
  hookChips = null,
  onHookChipAction,
  onHookChipIgnore,
  // #84 workspace spike: 'docked' = the right-hand log pane (tools live in the rail);
  // onCollapse folds the pane away.
  variant,
  onCollapse,
  // Engine-derived suggestion chips (#91), shown above the input in the workspace log.
  suggestions = [],
  onSuggestion,
}) => {
  const docked = variant === 'docked';
  // High-intent conversion prompt: fired when a guest reaches for the gated AI chat.
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  // Keep the newest entry in view as the log grows (new narration, the thinking line).
  const logRef = useRef(null);
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    if (typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    else el.scrollTop = el.scrollHeight;
  }, [conversation.length, isLoading]);
  return (
    <div className={`gm-main${docked ? ' ws-log' : ''}`}>
      <header className="gm-head">
        <div className="game-info-header gm-place">
          <h2 className="gm-eyebrow">Adventure Log</h2>
          <p>
            <span className="gm-place-name">{townName || biomeLabel(currentBiome)}</span>
            {townName && subLocationName && <span className="gm-place-sub"> · {subLocationName}</span>}
            <span className="gm-place-coords"> ({worldPosition.x}, {worldPosition.y})</span>
          </p>
        </div>
        {docked && onCollapse && (
          <button type="button" className="ws-collapse" onClick={onCollapse} aria-label="Collapse the adventure log" title="Collapse log (the map fills the screen)">»</button>
        )}
        {!docked && <nav className="gm-tools" aria-label="Game actions">
          <button type="button" onClick={onOpenMap} className="gm-tool primary" data-tour="open-map" aria-label={townName ? `View ${townName} map` : 'View world map'}>
            <Icon name="map" /><span>{townName ? 'Town map' : 'Map'}</span>
          </button>
          <button type="button" onClick={onOpenSettings} className="gm-tool" aria-label="Open journal">
            <Icon name="journal" /><span>Journal</span>
          </button>
          <button type="button" onClick={onOpenInventory} className="gm-tool" aria-label="Open party inventory">
            <Icon name="pack" /><span>Inventory</span>
          </button>
          <button type="button" onClick={onOpenHowToPlay} className="gm-tool" aria-label="Open how to play guide">
            <Icon name="help" /><span>Help</span>
          </button>
          <button type="button" onClick={onManualSave} className="gm-tool" disabled={!canManualSave} aria-label="Save game manually">
            <Icon name="save" /><span>Save</span>
          </button>
          <SaveSyncIndicator status={saveStatus} isSaving={isSaving} signedIn={signedIn} />
        </nav>}
      </header>

      {/* Quest reminder: pinned above the log, not stored in the conversation */}
      {campaignGoal && !docked && (
        <div className="gm-quest quest-message">
          <span className="gm-quest-label">Quest</span>
          <span>{campaignGoal}</span>
        </div>
      )}

      <div className="gm-log conversation" aria-live="polite" ref={logRef}>
        {!hasAdventureStarted && !isLoading && (
          <div className="gm-start">
            <div className="gm-start-card">
              <p className="gm-eyebrow">Your story begins</p>
              <h3>The road is open.</h3>
              <button onClick={onStartAdventure} className="btn btn-primary gm-start-btn" aria-label="Start the adventure" data-tour="start-adventure">
                Start the Adventure
              </button>
            </div>
          </div>
        )}

        {conversation.map((msg, index) => (
          // Encounter results are stored as ai messages prefixed "⚔️ **Name**:"; tag them so
          // the log can set combat apart from narration (view-only, works on old saves too).
          <div key={index} className={`gm-msg message ${msg.role}${msg.role === 'ai' && typeof msg.content === 'string' && msg.content.startsWith('⚔️') ? ' combat' : ''}`}>
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
          <p className="gm-msg message system gm-thinking">
            <span className="gm-dots" aria-hidden="true"><i /><i /><i /></span>
            {progressStatus?.elapsed > 5
              ? `The Dungeon Master is working... (${progressStatus.elapsed}s)`
              : 'The Dungeon Master is thinking...'}
          </p>
        )}
        {error && <p className="gm-msg message error">{error}</p>}
      </div>

      {hasAdventureStarted && suggestions.length > 0 && onSuggestion && (
        <div className="ws-chips" role="group" aria-label="Suggested actions">
          {suggestions.map((chip) => (
            <button type="button" key={chip.id} className={`ws-chip-action kind-${chip.kind}`} onClick={() => onSuggestion(chip)} disabled={isLoading}>
              {chip.label}
            </button>
          ))}
        </div>
      )}

      <div className="gm-compose">
        <form onSubmit={aiAvailable ? onSubmit : (e) => e.preventDefault()}>
          <label htmlFor="user-action-input" className="sr-only">Your action</label>
          <div className="gm-input-wrap">
            <textarea
              id="user-action-input"
              value={userInput}
              onChange={onInputChange}
              onKeyDown={(e) => {
                // Enter sends, Shift+Enter adds a line (the form's own submit handler runs).
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && aiAvailable) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={
                !aiAvailable
                  ? "Sign in to type actions and unlock the AI Dungeon Master…"
                  : hasAdventureStarted ? "What do you do?" : "Start the adventure first…"
              }
              rows="2"
              className="gm-input"
              disabled={!aiAvailable || !hasAdventureStarted || isLoading}
              aria-label="Type your action or command"
            />
            {aiAvailable && userInput.length >= COUNTER_SHOW_AT && (
              <div className={`gm-counter${userInput.length > MAX_ACTION_CHARS ? ' over' : ''}`} role="status">
                {userInput.length.toLocaleString()} / {MAX_ACTION_CHARS.toLocaleString()}
                {userInput.length > MAX_ACTION_CHARS ? ': too long to send' : ''}
              </div>
            )}
            {/* Guests can't type to the DM; a click here is peak intent, so prompt to sign in. */}
            {!aiAvailable && (
              <button
                type="button"
                className="gm-guest-overlay"
                onClick={() => {
                  sendEvent('ai_gate_shown', {}, { once: true });
                  setShowAuthPrompt(true);
                }}
                aria-label="Sign in to unlock the AI Dungeon Master"
              />
            )}
          </div>
          {/* Actions column: Look around (an in-world action, not navigation) sits above
              Send; side by side on phones. */}
          <div className="gm-actions">
            {hasAdventureStarted && (
              <button type="button" onClick={onLookAround} className="gm-look" disabled={isLoading} aria-label="Look around the current location">
                <Icon name="look" /><span>Look around</span>
              </button>
            )}
            {aiAvailable ? (
              <button type="submit" className="btn btn-primary gm-send" aria-label="Send" disabled={!hasAdventureStarted || !userInput.trim() || isLoading || userInput.length > MAX_ACTION_CHARS}>
                {isLoading ? '...' : <><Icon name="send" /><span>Send</span></>}
              </button>
            ) : (
              <Link to="/login" className="btn btn-primary gm-send">Sign in</Link>
            )}
          </div>
        </form>
        {aiAvailable ? (
          <p className="gm-note">The engine decides outcomes; the AI narrates. Narration may not always be accurate.</p>
        ) : (
          <p className="gm-note guest"><strong>The AI Dungeon Master is resting.</strong> Keep exploring and fighting as a guest; sign in to type your own actions.</p>
        )}

        {showAuthPrompt && (
          <RdDialog
            title="Unlock the AI Dungeon Master"
            onClose={() => setShowAuthPrompt(false)}
            actions={<>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  sendEvent('ai_gate_dismissed');
                  setShowAuthPrompt(false);
                }}
              >Maybe later</button>
              <Link to="/login" className="btn btn-primary" onClick={() => sendEvent('ai_gate_signin_click')}>Sign in</Link>
            </>}
          >
            {partyLeadName ? (
              <p>
                Sign in free to keep {partyLeadName}&apos;s
                {templateName ? ` ${templateName}` : ''} adventure in your account,
                and the AI Dungeon Master will narrate your every move. Right now this
                story lives only in this browser.
              </p>
            ) : (
              <p>Sign in to type free-form actions and get live AI narration, and your adventures save to your account so you can keep playing across devices.</p>
            )}
          </RdDialog>
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
