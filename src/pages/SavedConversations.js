import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { conversationsApi } from '../services/conversationsApi';
import { buildSaveName, parseSaveRoot } from '../game/saveController';
import { createLogger } from '../utils/logger';
import { resolveProfilePicture } from '../utils/assetHelper';
import { useAuth } from '../contexts/AuthContext';
import { hasHadAccount } from '../services/accountFlag';
import { saveCardInfo, timeAgo } from '../game/saveCardInfo';
import RdDialog from '../components/RdDialog';
import '../styles/redesign.css';

// "Your Games": the saved-campaign list, the pilot page for moving the in-app pages onto the
// redesign primitives (#82). Each save is a card with its campaign art, party, objective
// progress and actions. Styles: .rd-page / .rd-app in src/styles/redesign.css.

// Lazy load the details modal for better performance
const SavedGameDetailsModal = lazy(() => import('../components/SavedGameDetailsModal'));

const logger = createLogger('saved-conversations');

const PageHeader = ({ onNewGame }) => (
  <section className="page-header app-header">
    <div className="wrap">
      <p className="eyebrow">Your games</p>
      <div className="app-header-row">
        <div>
          <h1>Pick up where you left off.</h1>
          <p className="lede">Every campaign you have started, newest first.</p>
        </div>
        {onNewGame && <button type="button" className="btn btn-primary" onClick={onNewGame}>Start a new game</button>}
      </div>
    </div>
  </section>
);

const SavedConversations = () => {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingName, setEditingName] = useState(null);
  const [newName, setNewName] = useState('');
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    logger.debug('SavedConversations: Component mounted, fetching conversations...');
    fetchConversations();
  }, []); // Fetch on mount

  // Also refetch when component becomes visible again (navigating back from game)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        logger.debug('SavedConversations: Page visible, refetching...');
        fetchConversations();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const fetchConversations = async () => {
    try {
      setLoading(true);
      const data = await conversationsApi.list();
      logger.debug('Fetched conversations:', data);
      if (data.length > 0) {
        logger.debug('First conversation model field:', data[0]?.model);
        logger.debug('First conversation full object:', data[0]);
        logger.debug('All fields in first conversation:', Object.keys(data[0]));
      }

      // Sort by timestamp descending (newest first)
      const sortedData = data.sort((a, b) => {
        return new Date(b.timestamp) - new Date(a.timestamp);
      });

      setConversations(sortedData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteConversation = async (sessionId) => {
    try {
      await conversationsApi.remove(sessionId);
      // Remove from local state
      setConversations(conversations.filter(conv => conv.sessionId !== sessionId));
      setDeleteConfirmId(null);
    } catch (err) {
      setError(err.message);
    }
  };

  // `root` is the editable base name; the store re-derives the display name as
  // "<root> - <date> <time>" and persists the root so future saves keep it.
  const updateConversationName = async (sessionId, root) => {
    try {
      const updated = await conversationsApi.updateName(sessionId, root);
      const displayName = updated?.conversation_name || buildSaveName(root);
      setConversations(conversations.map(conv =>
        conv.sessionId === sessionId
          ? { ...conv, conversation_name: displayName }
          : conv
      ));
      setEditingName(null);
      setNewName('');
    } catch (err) {
      setError(err.message);
    }
  };

  const loadConversation = async (sessionId) => {
    try {
      const conversationData = await conversationsApi.getById(sessionId);

      // Navigate to game with the loaded conversation data
      navigate('/game', {
        state: {
          loadedConversation: conversationData,
          selectedHeroes: conversationData.selected_heroes || []
        }
      });
    } catch (err) {
      setError(err.message);
    }
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  if (loading) {
    return (
      <div className="rd-page rd-app">
        <PageHeader />
        <section className="band"><div className="wrap"><p className="app-status">Loading your games...</p></div></section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rd-page rd-app">
        <PageHeader />
        <section className="band"><div className="wrap"><p className="app-status error">Couldn't load your games: {error}</p></div></section>
      </div>
    );
  }

  return (
    <div className="rd-page rd-app">
      <PageHeader onNewGame={conversations.length > 0 ? () => navigate('/new-game') : null} />

      <section className="band">
        <div className="wrap">
          {conversations.length === 0 ? (
            !user && hasHadAccount() ? (
              <div className="app-empty">
                <div className="app-empty-icon" aria-hidden="true">🔒</div>
                <h2>Your adventures are in your account</h2>
                <p>You're browsing as a guest on this device. Sign in to see the games saved to your account.</p>
                <button type="button" onClick={() => navigate('/login')} className="btn btn-primary">Sign in</button>
              </div>
            ) : (
              <div className="app-empty">
                <div className="app-empty-icon" aria-hidden="true">📖</div>
                <h2>No campaigns yet</h2>
                <p>Your saved adventures will appear here. Start a new game to create your first one.</p>
                <button type="button" onClick={() => navigate('/new-game')} className="btn btn-primary">Start a new game</button>
              </div>
            )
          ) : (
            <div className="save-grid">
              {conversations.map((conversation) => {
                const { heroes, settings, chapter, progress, art } = saveCardInfo(conversation);
                // Merged-list honesty badge (SAVE_SYNC_PLAN Phase 2): the newest copy of
                // this save is local and still awaiting its cloud push. Signed-in players
                // only; guests see their local list exactly as before (no badge). A completed
                // save continues IN the save: load it and use the Journal's "Continue your legend".
                const showOnThisDeviceBadge = !!user && !!conversation.pendingCloudSync;
                const isEditing = editingName === conversation.sessionId;

                return (
                  <article key={conversation.sessionId} className="save-card">
                    <div className="save-art" style={{ backgroundImage: art }}>
                      <div className="save-badges">
                        {showOnThisDeviceBadge && (
                          <span className="price-badge price-badge-muted" title="This save is stored on this device and will sync to your account automatically">On this device</span>
                        )}
                        {chapter > 1 && <span className="price-badge price-badge-muted">Chapter {chapter}</span>}
                        {settings?.campaignComplete && (
                          <span className="price-badge price-badge-gold" title="Load this game and open the Journal to continue your legend in the same world">Complete</span>
                        )}
                      </div>
                      {heroes.length > 0 && (
                        <div className="save-party">
                          {heroes.slice(0, 4).map((hero, idx) => {
                            const heroName = hero.heroName || hero.characterName || 'Unknown';
                            return hero.profilePicture ? (
                              <img key={idx} src={resolveProfilePicture(hero.profilePicture)} alt={heroName} title={heroName} />
                            ) : null;
                          })}
                        </div>
                      )}
                    </div>

                    <div className="save-body">
                      {isEditing ? (
                        <div className="save-rename">
                          <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Campaign name"
                            title="The date and time are added automatically"
                            maxLength={60}
                            autoFocus
                            aria-label="Campaign name"
                          />
                          <button type="button" className="btn btn-primary" onClick={() => updateConversationName(conversation.sessionId, newName)} disabled={!newName.trim()}>Save</button>
                          <button type="button" className="btn btn-ghost" onClick={() => { setEditingName(null); setNewName(''); }}>Cancel</button>
                        </div>
                      ) : (
                        <div className="save-title-row">
                          <h3>{conversation.conversation_name || 'Untitled Adventure'}</h3>
                          <button
                            type="button"
                            className="icon-button"
                            title="Rename"
                            aria-label="Rename this game"
                            onClick={() => {
                              setEditingName(conversation.sessionId);
                              setNewName(settings?.saveName || parseSaveRoot(conversation.conversation_name));
                            }}
                          >
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                          </button>
                        </div>
                      )}

                      {/* Campaign arc name (settings.templateName is stamped at save time by
                          campaignLauncher/NewGame); older saves simply omit this line. */}
                      <p className="save-meta">
                        {settings?.templateName && <span>{settings.templateName}</span>}
                        {conversation.timestamp && <span>Played {timeAgo(conversation.timestamp)}</span>}
                      </p>

                      {progress && (
                        <div className="save-progress" aria-label={`${progress.completed.length} of ${progress.total} objectives complete`}>
                          <div className="save-progress-bar"><span style={{ width: `${Math.round((progress.completed.length / progress.total) * 100)}%` }} /></div>
                          <p>
                            <b>{progress.completed.length} of {progress.total}</b> objectives
                            {progress.current?.text && !settings?.campaignComplete ? <> · Next: {progress.current.text}</> : null}
                          </p>
                        </div>
                      )}

                      {!progress && settings?.shortDescription && (
                        <p className="save-desc">{settings.shortDescription}</p>
                      )}

                      {heroes.length > 0 && (
                        <p className="save-heroes">{heroes.map((h) => h.heroName || h.characterName || 'Unknown').join(', ')}</p>
                      )}

                      <div className="save-actions">
                        <button type="button" className="btn btn-primary" onClick={() => loadConversation(conversation.sessionId)}>Continue</button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => { setSelectedConversation(conversation); setIsDetailsModalOpen(true); }}
                        >
                          Details
                        </button>
                        <button type="button" className="icon-button danger" onClick={() => setDeleteConfirmId(conversation.sessionId)} title="Delete" aria-label="Delete this game">
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <Suspense fallback={<div style={{ textAlign: 'center', padding: '20px' }}>Loading details...</div>}>
        <SavedGameDetailsModal
          isOpen={isDetailsModalOpen}
          onClose={() => {
            setIsDetailsModalOpen(false);
            setSelectedConversation(null);
          }}
          conversation={selectedConversation}
          formatDate={formatDate}
        />
      </Suspense>

      {deleteConfirmId && (
        <RdDialog
          title="Delete Saved Game?"
          tone="danger"
          onClose={() => setDeleteConfirmId(null)}
          actions={<>
            <button type="button" className="btn btn-ghost" onClick={() => setDeleteConfirmId(null)}>Cancel</button>
            <button type="button" className="btn btn-danger" onClick={() => deleteConversation(deleteConfirmId)}>Delete</button>
          </>}
        >
          <p>This permanently deletes this saved game. It can't be undone.</p>
        </RdDialog>
      )}
    </div>
  );
};

export default SavedConversations;
