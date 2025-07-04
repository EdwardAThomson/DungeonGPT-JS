import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const SavedConversations = () => {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingName, setEditingName] = useState(null);
  const [newName, setNewName] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:5000/conversations');
      if (!response.ok) {
        throw new Error('Failed to fetch conversations');
      }
      const data = await response.json();
      setConversations(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteConversation = async (sessionId) => {
    if (!window.confirm('Are you sure you want to delete this conversation?')) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:5000/api/conversations/${sessionId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete conversation');
      }
      // Remove from local state
      setConversations(conversations.filter(conv => conv.sessionId !== sessionId));
    } catch (err) {
      setError(err.message);
    }
  };

  const updateConversationName = async (sessionId, conversationName) => {
    try {
      const response = await fetch(`http://localhost:5000/api/conversations/${sessionId}/name`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ conversationName }),
      });
      if (!response.ok) {
        throw new Error('Failed to update conversation name');
      }
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
      const response = await fetch(`http://localhost:5000/api/conversations/${sessionId}`);
      if (!response.ok) {
        throw new Error('Failed to load conversation');
      }
      const conversationData = await response.json();
      
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
    return <div className="page-container">Loading conversations...</div>;
  }

  if (error) {
    return <div className="page-container">Error: {error}</div>;
  }

  return (
    <div className="page-container">
      <h1>Saved Conversations</h1>
      <p>Manage your saved game sessions. Click "Load" to continue a previous adventure.</p>
      
      {conversations.length === 0 ? (
        <p>No saved conversations found. Start a new game to create your first adventure!</p>
      ) : (
        <div className="conversations-list">
          {conversations.map((conversation) => (
            <div key={conversation.sessionId} className="conversation-item">
              <div className="conversation-header">
                {editingName === conversation.sessionId ? (
                  <div className="edit-name-form">
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Enter new name"
                      autoFocus
                    />
                    <button
                      onClick={() => updateConversationName(conversation.sessionId, newName)}
                      disabled={!newName.trim()}
                    >
                      Save
                    </button>
                    <button onClick={() => {
                      setEditingName(null);
                      setNewName('');
                    }}>
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
                  >
                    {conversation.conversation_name || 'Untitled Adventure'}
                  </h3>
                )}
              </div>
              
              <div className="conversation-details">
                <p><strong>Date:</strong> {formatDate(conversation.timestamp)}</p>
                <p><strong>Provider:</strong> {conversation.provider}</p>
                <p><strong>Session ID:</strong> {conversation.sessionId}</p>
                {conversation.summary && (
                  <p><strong>Summary:</strong> {conversation.summary.substring(0, 100)}...</p>
                )}
                {conversation.selected_heroes && (
                  <p><strong>Heroes:</strong> {JSON.parse(conversation.selected_heroes).map(h => h.characterName).join(', ')}</p>
                )}
                {conversation.player_position && (
                  <p><strong>Location:</strong> ({JSON.parse(conversation.player_position).x}, {JSON.parse(conversation.player_position).y})</p>
                )}
              </div>
              
              <div className="conversation-actions">
                <button
                  onClick={() => loadConversation(conversation.sessionId)}
                  className="load-button"
                >
                  Load Game
                </button>
                <button
                  onClick={() => deleteConversation(conversation.sessionId)}
                  className="delete-button"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      
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