import React from 'react';

const CharacterModal = ({ isOpen, onClose, character }) => {
    if (!isOpen || !character) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal-content character-details-modal"
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: '500px', width: '90%' }}
            >
                <div className="modal-header-with-image">
                    {character.profilePicture && (
                        <div className="modal-profile-pic-container">
                            <img
                                src={character.profilePicture}
                                alt={`${character.characterName}'s profile`}
                                className="modal-profile-pic"
                            />
                        </div>
                    )}
                    <div className="modal-header-text">
                        <h2>{character.characterName}</h2>
                        <p className="character-subtitle">
                            Level {character.characterLevel} {character.characterGender} {character.characterRace} {character.characterClass}
                        </p>
                    </div>
                </div>

                <div className="modal-section scrollable-modal-section">
                    <h4>Character Stats</h4>
                    {character.stats && (
                        <div className="stats-grid-modal">
                            {Object.entries(character.stats).map(([stat, value]) => (
                                <div key={stat} className="stat-item-modal">
                                    <span className="stat-label">{stat.substring(0, 3).toUpperCase()}</span>
                                    <span className="stat-value">{value}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {character.characterBackground && (
                    <div className="modal-section scrollable-modal-section">
                        <h4>Background</h4>
                        <div className="character-background-text">
                            {character.characterBackground}
                        </div>
                    </div>
                )}

                {character.characterAlignment && (
                    <div className="modal-section">
                        <p><strong>Alignment:</strong> {character.characterAlignment}</p>
                    </div>
                )}

                <button className="modal-close-button" onClick={onClose} style={{ marginTop: '20px' }}>
                    Close
                </button>
            </div>
        </div>
    );
};

export default CharacterModal;
