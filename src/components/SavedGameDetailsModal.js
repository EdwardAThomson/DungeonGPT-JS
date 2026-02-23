import React from 'react';

const SavedGameDetailsModal = ({ isOpen, onClose, conversation, formatDate, formatProvider, formatModel }) => {
  if (!isOpen || !conversation) return null;

  const settings = conversation.game_settings 
    ? (typeof conversation.game_settings === 'string' 
        ? JSON.parse(conversation.game_settings) 
        : conversation.game_settings)
    : null;

  const heroes = conversation.selected_heroes 
    ? JSON.parse(conversation.selected_heroes) 
    : [];

  const position = conversation.player_position 
    ? JSON.parse(conversation.player_position) 
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
                      src={hero.profilePicture} 
                      alt={hero.characterName}
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
                    <p style={{ fontWeight: 'bold', marginBottom: '4px' }}>{hero.characterName}</p>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      Level {hero.level || hero.characterLevel || 1} {hero.characterRace} {hero.characterClass}
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
