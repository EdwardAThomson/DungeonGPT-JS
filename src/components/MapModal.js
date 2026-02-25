import React, { useEffect, useRef } from 'react';
import FocusTrap from 'focus-trap-react';
import WorldMapDisplay from './WorldMapDisplay';
import TownMapDisplay from './TownMapDisplay';

const MapModal = ({ isOpen, onClose, mapData, playerPosition, onTileClick, firstHero, mapLevel, townMapData, townPlayerPosition, onLeaveTown, onTownTileClick, currentTile, onEnterCurrentTown, isInsideTown, hasAdventureStarted, townError, markBuildingDiscovered }) => {
    const previousFocusRef = useRef(null);
    const modalRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            // Save current focus
            previousFocusRef.current = document.activeElement;
        } else if (previousFocusRef.current) {
            // Restore focus when closing
            previousFocusRef.current.focus();
        }
    }, [isOpen]);

    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            onClose();
        }
    };

    if (!isOpen) return null;

    // Check if player is on a town tile
    const isOnTown = mapLevel === 'world' && currentTile && currentTile.poi === 'town';

    return (
        <div className="modal-overlay" onClick={onClose}>
            <FocusTrap>
                <div 
                    ref={modalRef}
                    className="modal-content map-modal-content" 
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={handleKeyDown}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="map-modal-title"
                >
                    <h2 id="map-modal-title">{mapLevel === 'town' ? (townMapData?.townName || 'Town Map') : 'World Map'}</h2>
                {mapLevel === 'world' ? (
                    <>
                        <WorldMapDisplay
                            mapData={mapData}
                            playerPosition={playerPosition}
                            onTileClick={onTileClick}
                            firstHero={firstHero}
                        />
                        {townError && (
                            <div className="message system error" style={{ margin: '10px auto', display: 'block' }}>
                                {townError}
                            </div>
                        )}
                        {isOnTown && (
                            <div style={{ textAlign: 'center', marginTop: '10px' }}>
                                <button
                                    className="primary-button"
                                    onClick={() => {
                                        onEnterCurrentTown();
                                        // Don't close modal - it will switch to town view
                                    }}
                                    style={{ marginRight: '10px' }}
                                    disabled={!hasAdventureStarted}
                                    aria-label={isInsideTown ? `View ${currentTile.townName || currentTile.poi} map` : `Enter ${currentTile.townName || currentTile.poi}`}
                                    title={!hasAdventureStarted ? 'Start the adventure first' : ''}
                                >
                                    {isInsideTown ? `View ${currentTile.townName || currentTile.poi} Map` : `Enter ${currentTile.townName || currentTile.poi}`}
                                </button>
                                {!hasAdventureStarted && (
                                    <p className="town-entrance-warning">
                                        Start your adventure to enter towns
                                    </p>
                                )}
                            </div>
                        )}
                    </>
                ) : (
                    <TownMapDisplay
                        townMapData={townMapData}
                        playerPosition={townPlayerPosition}
                        onLeaveTown={onLeaveTown}
                        onTileClick={onTownTileClick}
                        firstHero={firstHero}
                        townError={townError}
                        markBuildingDiscovered={markBuildingDiscovered}
                    />
                )}
                    <button className="modal-close-button" onClick={onClose} aria-label="Close map modal">
                        Close Map
                    </button>
                </div>
            </FocusTrap>
        </div>
    );
};

export default MapModal;
