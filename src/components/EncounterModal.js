import React, { useEffect, useRef } from 'react';
import FocusTrap from 'focus-trap-react';

const EncounterModal = ({ isOpen, onClose, encounter, onEnterLocation, onViewMap }) => {
    const previousFocusRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            previousFocusRef.current = document.activeElement;
        } else if (previousFocusRef.current) {
            previousFocusRef.current.focus();
        }
    }, [isOpen]);

    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            onClose();
        }
    };

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
            <FocusTrap>
                <div 
                    className="modal-content encounter-modal-content" 
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={handleKeyDown}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="encounter-modal-title"
                >
                <div style={{ textAlign: 'center', fontSize: '64px', marginBottom: '20px' }}>
                    {getLocationIcon(encounter.poiType)}
                </div>
                <h2 id="encounter-modal-title">{encounter.name}</h2>
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
                            aria-label={`Enter ${encounter.name}`}
                        >
                            Enter {encounter.name}
                        </button>
                    )}
                    <button className="secondary-button" onClick={onClose} aria-label="Continue journey">
                        Continue Journey
                    </button>
                    <button
                        className="secondary-button"
                        onClick={() => {
                            onClose();
                            if (onViewMap) onViewMap();
                        }}
                        aria-label="View world map"
                    >
                        View Map
                    </button>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--state-muted-strong)', marginTop: '20px', fontStyle: 'italic' }}>
                    💡 Tip: Use the Map button in the top-right to navigate the world
                </p>
                </div>
            </FocusTrap>
        </div>
    );
};

export default EncounterModal;
