import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { conversationsApi } from '../services/conversationsApi';
import SafeMarkdownMessage from '../components/SafeMarkdownMessage';

const ConversationManager = () => {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [selectedConvId, setSelectedConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await conversationsApi.list();
      setConversations(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (convId) => {
    setLoading(true);
    setError(null);
    try {
      const data = await conversationsApi.getById(convId);
      setMessages(data.conversation_data || []);
      setSelectedConvId(convId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteMessage = async (messageIndex) => {
    if (!selectedConvId) return;
    
    const updatedMessages = messages.filter((_, idx) => idx !== messageIndex);
    
    try {
      await conversationsApi.updateMessages(selectedConvId, updatedMessages);
      setMessages(updatedMessages);
    } catch (err) {
      setError(err.message);
    }
  };

  const clearAllMessages = async () => {
    if (!selectedConvId || !window.confirm('Delete ALL messages from this conversation?')) return;
    
    try {
      await conversationsApi.updateMessages(selectedConvId, []);
      setMessages([]);
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteConversation = async (convId) => {
    if (!window.confirm('Delete this entire conversation? This cannot be undone.')) return;
    
    try {
      await conversationsApi.remove(convId);
      if (selectedConvId === convId) {
        setSelectedConvId(null);
        setMessages([]);
      }
      await loadConversations();
    } catch (err) {
      setError(err.message);
    }
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'user': return '#4a90e2';
      case 'ai': return '#8bc34a';
      case 'system': return '#ff9800';
      default: return '#888';
    }
  };

  const getRoleBadge = (role) => {
    switch (role) {
      case 'user': return '👤 User';
      case 'ai': return '🤖 AI';
      case 'system': return '⚙️ System';
      default: return role;
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', color: '#e0e0e0', padding: '40px 20px' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <h1 style={{ margin: 0, fontSize: '2rem', color: '#64b5f6' }}>🗂️ Conversation Manager</h1>
          <button
            onClick={() => navigate('/')}
            style={{
              padding: '10px 20px',
              background: '#444',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            ← Back to Game
          </button>
        </div>

        {error && (
          <div style={{ padding: '15px', background: '#f44336', borderRadius: '8px', marginBottom: '20px' }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '20px' }}>
          {/* Conversations List */}
          <div style={{ background: '#1e1e2e', borderRadius: '8px', padding: '20px', height: 'fit-content' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#64b5f6' }}>Conversations</h3>
              <button
                onClick={loadConversations}
                disabled={loading}
                style={{
                  padding: '6px 12px',
                  background: '#4a90e2',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '12px'
                }}
              >
                🔄
              </button>
            </div>

            {loading && !selectedConvId && <p style={{ color: '#888' }}>Loading...</p>}
            
            {conversations.length === 0 && !loading && (
              <p style={{ color: '#888', fontSize: '14px' }}>No conversations found</p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {conversations.map(conv => (
                <div
                  key={conv.sessionId}
                  style={{
                    padding: '12px',
                    background: selectedConvId === conv.sessionId ? '#2a2a3e' : '#16162a',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    border: selectedConvId === conv.sessionId ? '2px solid #64b5f6' : '1px solid #333',
                    transition: 'all 0.2s'
                  }}
                  onClick={() => loadMessages(conv.sessionId)}
                >
                  <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
                    {conv.timestamp ? new Date(conv.timestamp).toLocaleDateString() : 'No date'}
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
                    {conv.sessionId ? conv.sessionId.substring(0, 16) : 'Unknown'}...
                  </div>
                  <div style={{ fontSize: '11px', color: '#aaa' }}>
                    {JSON.parse(conv.conversation_data || '[]').length} messages
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Messages Panel */}
          <div style={{ background: '#1e1e2e', borderRadius: '8px', padding: '20px' }}>
            {!selectedConvId ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#888' }}>
                <div style={{ fontSize: '48px', marginBottom: '20px' }}>💬</div>
                <p style={{ fontSize: '18px' }}>Select a conversation to view and manage messages</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#64b5f6' }}>
                    Messages ({messages.length})
                  </h3>
                  <button
                    onClick={() => deleteConversation(selectedConvId)}
                    style={{
                      padding: '8px 16px',
                      background: '#f44336',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px'
                    }}
                  >
                    🗑️ Delete Entire Conversation
                  </button>
                </div>

                {messages.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
                    <p>No messages in this conversation</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '70vh', overflowY: 'auto' }}>
                    {messages.map((msg, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: '#16162a',
                          borderRadius: '8px',
                          padding: '15px',
                          borderLeft: `4px solid ${getRoleColor(msg.role)}`
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{
                              padding: '4px 10px',
                              background: getRoleColor(msg.role),
                              borderRadius: '12px',
                              fontSize: '12px',
                              fontWeight: '600',
                              color: '#fff'
                            }}>
                              {getRoleBadge(msg.role)}
                            </span>
                            <span style={{ fontSize: '11px', color: '#888' }}>
                              Message #{idx + 1}
                            </span>
                          </div>
                          <button
                            onClick={() => deleteMessage(idx)}
                            style={{
                              padding: '6px 12px',
                              background: '#f44336',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            🗑️ Delete
                          </button>
                        </div>
                        <div 
                          style={{
                            fontSize: '14px',
                            lineHeight: '1.6',
                            color: '#e0e0e0',
                            wordBreak: 'break-word'
                          }}
                        >
                          <SafeMarkdownMessage content={msg.content} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConversationManager;
