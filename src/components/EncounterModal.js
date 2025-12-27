import React from 'react';

const EncounterModal = ({ isOpen, onClose, encounter, onEnterLocation }) => {
    if (!isOpen || !encounter) return null;

    const getLocationIcon = (poiType) => {
        const icons = {
            'town': '🏘️',
            'city': '🏰',
            'village': '🏡',
            'hamlet': '🏚️',
            'dungeon': '⚔️',
            'ruins': '🏛️',
            'cave': '🕳️',
            'forest': '🌲',
            'mountain': '⛰️'
        };
        return icons[poiType] || '📍';
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content encounter-modal-content" onClick={(e) => e.stopPropagation()}>
                <div style={{ textAlign: 'center', fontSize: '64px', marginBottom: '20px' }}>
                    {getLocationIcon(encounter.poiType)}
                </div>
                <h2>{encounter.name}</h2>
                <p style={{ fontSize: '16px', lineHeight: '1.6', marginBottom: '20px' }}>
                    {encounter.description}
                </p>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    {encounter.canEnter && (
                        <button
                            className="primary-button"
                            onClick={() => {
                                onEnterLocation();
                                onClose();
                            }}
                        >
                            Enter {encounter.name}
                        </button>
                    )}
                    <button className="secondary-button" onClick={onClose}>
                        Continue Journey
                    </button>
                    <button
                        className="secondary-button"
                        onClick={() => {
                            onClose();
                            // Will open map modal - handled by parent
                        }}
                    >
                        View Map
                    </button>
                </div>
                <p style={{ fontSize: '12px', color: '#666', marginTop: '20px', fontStyle: 'italic' }}>
                    💡 Tip: Use the Map button in the top-right to navigate the world
                </p>
            </div>
        </div>
    );
};

export default EncounterModal;
