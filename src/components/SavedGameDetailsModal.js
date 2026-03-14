import React, { useState, useEffect, useCallback } from 'react';
import { resolveProfilePicture } from '../utils/assetHelper';
import { getIndexStatus, backfill } from '../game/ragEngine';
import { ragStore } from '../services/ragStore';

const SavedGameDetailsModal = ({ isOpen, onClose, conversation, formatDate, formatProvider, formatModel }) => {
  const [ragStatus, setRagStatus] = useState(null); // { status, indexed, total }
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [rebuildProgress, setRebuildProgress] = useState(null);

  // Check RAG index status when modal opens
  useEffect(() => {
    if (!isOpen || !conversation?.sessionId) {
      setRagStatus(null);
      return;
    }
    const raw = conversation.conversation_data;
    const convData = typeof raw === 'string' ? JSON.parse(raw) : (raw || []);
    if (convData.length === 0) return;

    getIndexStatus(conversation.sessionId, convData)
      .then(setRagStatus)
      .catch(() => setRagStatus(null));
  }, [isOpen, conversation?.sessionId]);

  const handleRebuild = useCallback(async () => {
    if (!conversation?.sessionId || isRebuilding) return;
    const raw = conversation.conversation_data;
    const convData = typeof raw === 'string' ? JSON.parse(raw) : (raw || []);
    if (convData.length === 0) return;

    setIsRebuilding(true);
    setRebuildProgress({ indexed: 0, total: convData.filter(m => m.role === 'ai').length });

    try {
      // Clear existing index for this session first
      await ragStore.clearSession(conversation.sessionId);

      await backfill(conversation.sessionId, convData, {
        onProgress: (indexed, total) => setRebuildProgress({ indexed, total })
      });

      const updated = await getIndexStatus(conversation.sessionId, convData);
      setRagStatus(updated);
    } catch (err) {
      // silently fail — status will show whatever was indexed
    } finally {
      setIsRebuilding(false);
      setRebuildProgress(null);
    }
  }, [conversation, isRebuilding]);

  if (!isOpen || !conversation) return null;

  const settings = conversation.game_settings
    ? (typeof conversation.game_settings === 'string'
      ? JSON.parse(conversation.game_settings)
      : conversation.game_settings)
    : null;

  const heroes = conversation.selected_heroes
    ? (typeof conversation.selected_heroes === 'string' ? JSON.parse(conversation.selected_heroes) : conversation.selected_heroes)
    : [];

  const position = conversation.player_position
    ? (typeof conversation.player_position === 'string' ? JSON.parse(conversation.player_position) : conversation.player_position)
    : null;

  const subMaps = conversation.sub_maps
    ? (typeof conversation.sub_maps === 'string'
      ? JSON.parse(conversation.sub_maps)
      : conversation.sub_maps)
    : null;

  const getLocationString = () => {
    if (!position) return 'Unknown';
    if (subMaps?.isInsideTown && subMaps?.currentTownTile?.townName) {
      return `${subMaps.currentTownTile.townName} (world: ${position.x}, ${position.y})`;
    }
    return `(${position.x}, ${position.y})`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '800px', width: '95%', maxHeight: '90vh', overflow: 'auto' }}
      >
        <h2 style={{ fontFamily: 'var(--header-font)', color: 'var(--primary)', marginBottom: '20px' }}>
          {conversation.conversation_name || 'Untitled Adventure'}
        </h2>

        <div className="modal-section">
          <h3 style={{ color: 'var(--primary)', fontSize: '1.1rem', marginBottom: '10px' }}>Session Information</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.9rem' }}>
            <p><strong>Date Saved:</strong> {formatDate(conversation.timestamp)}</p>
            <p><strong>Session ID:</strong> <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{conversation.sessionId}</span></p>
            <p><strong>AI Provider:</strong> {formatProvider(conversation.provider)}</p>
            <p><strong>AI Model:</strong> {formatModel(conversation.model)}</p>
            <p><strong>Location:</strong> {getLocationString()}</p>
          </div>
        </div>

        {heroes.length > 0 && (
          <div className="modal-section" style={{ marginTop: '20px' }}>
            <h3 style={{ color: 'var(--primary)', fontSize: '1.1rem', marginBottom: '10px' }}>Party Members</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '15px' }}>
              {heroes.map((hero, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'var(--surface)',
                    padding: '15px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}
                >
                  {hero.profilePicture && (
                    <img
                      src={resolveProfilePicture(hero.profilePicture)}
                      alt={hero.heroName || hero.characterName || 'Hero'}
                      style={{
                        width: '50px',
                        height: '50px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: '2px solid var(--primary)'
                      }}
                    />
                  )}
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 'bold', marginBottom: '4px' }}>{hero.heroName || hero.characterName || 'Unknown'}</p>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      Level {hero.level || hero.heroLevel || hero.characterLevel || 1} {hero.heroRace || hero.characterRace || ''} {hero.heroClass || hero.characterClass || ''}
                    </p>
                    {hero.currentHP !== undefined && hero.maxHP && (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        HP: {hero.currentHP}/{hero.maxHP}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {settings && (
          <div className="modal-section" style={{ marginTop: '20px' }}>
            <h3 style={{ color: 'var(--primary)', fontSize: '1.1rem', marginBottom: '10px' }}>Game Settings</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.9rem' }}>
              {settings.shortDescription && (
                <p style={{ gridColumn: '1 / -1' }}><strong>Story:</strong> {settings.shortDescription}</p>
              )}
              {settings.campaignGoal && (
                <p style={{ gridColumn: '1 / -1' }}><strong>Quest:</strong> {settings.campaignGoal}</p>
              )}
              {settings.grimnessLevel && <p><strong>Grimness:</strong> {settings.grimnessLevel}</p>}
              {settings.darknessLevel && <p><strong>Darkness:</strong> {settings.darknessLevel}</p>}
              {settings.magicLevel && <p><strong>Magic:</strong> {settings.magicLevel}</p>}
              {settings.technologyLevel && <p><strong>Technology:</strong> {settings.technologyLevel}</p>}
              {settings.responseVerbosity && <p><strong>Verbosity:</strong> {settings.responseVerbosity}</p>}
              {settings.worldSeed && (
                <p><strong>World Seed:</strong> <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{settings.worldSeed}</span></p>
              )}
            </div>
          </div>
        )}

        {conversation.summary && (
          <div className="modal-section" style={{ marginTop: '20px' }}>
            <h3 style={{ color: 'var(--primary)', fontSize: '1.1rem', marginBottom: '10px' }}>Adventure Summary</h3>
            <p style={{ fontSize: '0.9rem', lineHeight: '1.6', color: 'var(--text)' }}>
              {conversation.summary}
            </p>
          </div>
        )}

        {ragStatus && (
          <div className="modal-section" style={{ marginTop: '20px' }}>
            <h3 style={{ color: 'var(--primary)', fontSize: '1.1rem', marginBottom: '10px' }}>DM Memory Index</h3>
            <div style={{ fontSize: '0.9rem' }}>
              <p style={{ marginBottom: '8px' }}>
                <strong>Status:</strong>{' '}
                <span style={{
                  color: ragStatus.status === 'current' ? 'var(--success, #4caf50)' :
                    ragStatus.status === 'partial' ? 'var(--warning, #ff9800)' : 'var(--text-secondary)'
                }}>
                  {ragStatus.status === 'current' ? 'Fully indexed' :
                    ragStatus.status === 'partial' ? 'Partially indexed' : 'Not indexed'}
                </span>
              </p>
              <p style={{ marginBottom: '12px' }}>
                <strong>Events indexed:</strong> {ragStatus.indexed} / {ragStatus.total}
              </p>

              {/* Progress bar */}
              {ragStatus.total > 0 && (
                <div style={{
                  background: 'var(--surface)',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  height: '8px',
                  marginBottom: '12px',
                  border: '1px solid var(--border)'
                }}>
                  <div style={{
                    width: `${Math.round((ragStatus.indexed / ragStatus.total) * 100)}%`,
                    height: '100%',
                    background: ragStatus.status === 'current' ? 'var(--success, #4caf50)' : 'var(--primary)',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              )}

              {/* Rebuild progress */}
              {isRebuilding && rebuildProgress && (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Indexing... {rebuildProgress.indexed} / {rebuildProgress.total}
                </p>
              )}

              <button
                onClick={handleRebuild}
                disabled={isRebuilding}
                className="secondary-button"
                style={{ padding: '8px 16px', fontSize: '0.85rem' }}
              >
                {isRebuilding ? 'Rebuilding...' : ragStatus.status === 'current' ? 'Rebuild Index' : 'Build Index'}
              </button>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
                The memory index helps the DM recall past events during gameplay.
                {ragStatus.status !== 'current' && ' Loading this game will automatically build the index.'}
              </p>
            </div>
          </div>
        )}

        <button
          className="modal-close-button"
          onClick={onClose}
          style={{ marginTop: '20px', width: '100%' }}
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default SavedGameDetailsModal;
