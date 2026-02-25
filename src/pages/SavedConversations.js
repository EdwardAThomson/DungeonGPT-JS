import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { conversationsApi } from '../services/conversationsApi';
import { createLogger } from '../utils/logger';

// Lazy load the details modal for better performance
const SavedGameDetailsModal = lazy(() => import('../components/SavedGameDetailsModal'));

const logger = createLogger('saved-conversations');

const SavedConversations = () => {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingName, setEditingName] = useState(null);
  const [newName, setNewName] = useState('');
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const navigate = useNavigate();

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
    if (!window.confirm('Delete this saved game permanently? This cannot be undone.')) {
      return;
    }

    try {
      await conversationsApi.remove(sessionId);
      // Remove from local state
      setConversations(conversations.filter(conv => conv.sessionId !== sessionId));
    } catch (err) {
      setError(err.message);
    }
  };

  const updateConversationName = async (sessionId, conversationName) => {
    try {
      await conversationsApi.updateName(sessionId, conversationName);
      // Update local state
      setConversations(conversations.map(conv =>
        conv.sessionId === sessionId
          ? { ...conv, conversation_name: conversationName }
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

  const formatProvider = (provider) => {
    if (!provider) return 'Not set';
    const providerMap = {
      'openai': 'OpenAI',
      'gemini': 'Gemini',
      'claude': 'Claude'
    };
    return providerMap[provider.toLowerCase()] || provider;
  };

  const formatModel = (model) => {
    if (!model) return 'Not set';
    const modelMap = {
      'gpt-5': 'GPT-5',
      'gpt-5-mini': 'GPT-5 Mini',
      'o4-mini': 'O4 Mini',
      'gemini-2.5-pro': 'Gemini 2.5 Pro',
      'gemini-2.5-flash': 'Gemini 2.5 Flash',
      'claude-sonnet-4-5-20250929': 'Claude Sonnet 4.5'
    };
    return modelMap[model] || model;
  };

  if (loading) {
    return <div className="page-container">Loading conversations...</div>;
  }

  if (error) {
    return <div className="page-container">Error: {error}</div>;
  }

  return (
    <div className="page-container">
      <h1>Saved Conversations</h1>
      <p className="page-instructions">Manage your saved game sessions. Click "Load" to continue a previous adventure.</p>

      {conversations.length === 0 ? (
        <p>No saved conversations found. Start a new game to create your first adventure!</p>
      ) : (
        <div className="conversations-list">
          {conversations.map((conversation) => {
            const heroes = conversation.selected_heroes ? JSON.parse(conversation.selected_heroes) : [];
            const settings = conversation.game_settings 
              ? (typeof conversation.game_settings === 'string' ? JSON.parse(conversation.game_settings) : conversation.game_settings)
              : null;
            
            return (
              <div key={conversation.sessionId} className="conversation-item" style={{ padding: '25px', minHeight: '180px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', gap: '20px', marginBottom: '15px', flex: 1 }}>
                  {/* Hero Portraits */}
                  {heroes.length > 0 && (
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      {heroes.slice(0, 4).map((hero, idx) => (
                        hero.profilePicture ? (
                          <img
                            key={idx}
                            src={hero.profilePicture}
                            alt={hero.characterName}
                            title={hero.characterName}
                            style={{
                              width: '60px',
                              height: '60px',
                              borderRadius: '50%',
                              objectFit: 'cover',
                              border: '2px solid var(--primary)',
                              boxShadow: '0 2px 8px var(--shadow)'
                            }}
                          />
                        ) : null
                      ))}
                    </div>
                  )}
                  
                  {/* Content */}
                  <div style={{ flex: 1 }}>
                    {editingName === conversation.sessionId ? (
                      <div className="edit-name-form" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="text"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          placeholder="Enter new name"
                          autoFocus
                          style={{ flex: 1 }}
                        />
                        <button
                          onClick={() => updateConversationName(conversation.sessionId, newName)}
                          disabled={!newName.trim()}
                          className="save-name-button"
                        >
                          Save
                        </button>
                        <button 
                          onClick={() => {
                            setEditingName(null);
                            setNewName('');
                          }}
                          className="cancel-name-button"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <h3
                        onClick={() => {
                          setEditingName(conversation.sessionId);
                          setNewName(conversation.conversation_name || 'Untitled Adventure');
                        }}
                        className="conversation-title"
                        title="Click to edit name"
                        style={{ margin: '0 0 12px 0', cursor: 'pointer', color: 'var(--primary)', fontSize: '1.2rem' }}
                      >
                        {conversation.conversation_name || 'Untitled Adventure'}
                      </h3>
                    )}
                    {settings?.shortDescription && (
                      <p style={{ margin: '8px 0', fontSize: '0.9rem', lineHeight: '1.5', color: 'var(--text)' }}>
                        {settings.shortDescription.length > 120 
                          ? settings.shortDescription.substring(0, 120) + '...' 
                          : settings.shortDescription}
                      </p>
                    )}
                    {heroes.length > 0 && (
                      <p style={{ margin: '10px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        <strong>Party:</strong> {heroes.map(h => h.characterName).join(', ')}
                      </p>
                    )}
                  </div>
                </div>

                <div className="conversation-actions" style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
                  <button
                    onClick={() => loadConversation(conversation.sessionId)}
                    className="primary-button"
                    style={{ padding: '10px 20px', fontSize: '0.9rem' }}
                  >
                    Load Game
                  </button>
                  <button
                    onClick={() => {
                      setSelectedConversation(conversation);
                      setIsDetailsModalOpen(true);
                    }}
                    className="secondary-button"
                    style={{ padding: '10px 20px', fontSize: '0.9rem' }}
                  >
                    Details
                  </button>
                  <button
                    onClick={() => deleteConversation(conversation.sessionId)}
                    className="danger-button"
                    style={{ padding: '10px 20px', fontSize: '0.9rem' }}
                    title="Delete"
                  >
                    <span className="button-text">Delete</span>
                    <span className="button-icon">🗑️</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Suspense fallback={<div style={{ textAlign: 'center', padding: '20px' }}>Loading details...</div>}>
        <SavedGameDetailsModal
          isOpen={isDetailsModalOpen}
          onClose={() => {
            setIsDetailsModalOpen(false);
            setSelectedConversation(null);
          }}
          conversation={selectedConversation}
          formatDate={formatDate}
          formatProvider={formatProvider}
          formatModel={formatModel}
        />
      </Suspense>

      <div className="navigation-buttons">
        <button onClick={() => navigate('/')} className="back-button">
          Back to Home
        </button>
        <button onClick={() => navigate('/new-game')} className="new-game-button">
          Start New Game
        </button>
      </div>
    </div>
  );
};

export default SavedConversations; 
