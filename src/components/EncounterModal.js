import React from 'react';
import ClickableImage from './ClickableImage';
import { useModal } from '../contexts/ModalContext';
import ModalShell from './ModalShell';

const EncounterModal = () => {
    const { data, close } = useModal('encounterInfo');
    const encounter = data?.encounter;
    const onEnterLocation = data?.onEnterLocation;
    const onViewMap = data?.onViewMap;

    if (!encounter) return null;

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
        <ModalShell modalId="encounterInfo" className="encounter-modal-content" ariaLabel="Encounter" style={{ padding: '20px 24px' }}>
                    <h2 style={{ marginTop: '0', marginBottom: '2px', paddingBottom: '6px' }}>{encounter.name}</h2>
                    <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--state-muted-strong)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '10px' }}>
                        Random Encounter
                    </div>
                    {encounter.image && (
                        <ClickableImage
                            src={encounter.image}
                            alt={encounter.name}
                            height='240px'
                            maxHeight='240px'
                            objectPosition='center 30%'
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
                                    if (onEnterLocation) onEnterLocation();
                                    close();
                                }}
                                aria-label={`Enter ${encounter.name} `}
                            >
                                Enter {encounter.name}
                            </button>
                        )}
                        <button className="secondary-button" onClick={close} aria-label="Continue journey">
                            Continue Journey
                        </button>
                        <button
                            className="secondary-button"
                            onClick={() => {
                                close();
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
        </ModalShell>
    );
};

export default EncounterModal;
