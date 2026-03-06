import React, { useEffect, useRef } from 'react';
import FocusTrap from 'focus-trap-react';
import ClickableImage from './ClickableImage';

const EncounterModal = ({
    isOpen,
    onClose,
    encounter,
    onAction,
    onEnterLocation,
    onViewMap,
    fullSizeImage = false
}) => {
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
                    style={{ padding: '20px 24px' }}
                >
                    <h2 id="encounter-modal-title" style={{ marginTop: '0', marginBottom: '2px', paddingBottom: '6px' }}>{encounter.name}</h2>
                    <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--state-muted-strong)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '10px' }}>
                        Random Encounter
                    </div>
                    {encounter.image && (
                        <ClickableImage
                            src={encounter.image}
                            alt={encounter.name}
                            height={fullSizeImage ? 'auto' : '240px'}
                            maxHeight={fullSizeImage ? '500px' : '240px'}
                            objectPosition={fullSizeImage ? 'center' : 'center 30%'}
                        />
                    )}
                    {!encounter.image && (
                        <div style={{ textAlign: 'center', fontSize: '64px', marginBottom: '12px' }}>
                            {getLocationIcon(encounter.poiType)}
                        </div>
                    )}
                    <p style={{ fontSize: '14px', lineHeight: '1.5', marginBottom: '12px' }}>
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
                                aria-label={`Enter ${encounter.name} `}
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
                    <p style={{ fontSize: '11px', color: 'var(--state-muted-strong)', marginTop: '10px', marginBottom: '0', fontStyle: 'italic' }}>
                        💡 Use the Map button in the top-right to navigate
                    </p>
                </div>
            </FocusTrap>
        </div>
    );
};

export default EncounterModal;
