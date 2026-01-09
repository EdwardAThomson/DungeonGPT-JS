import React from 'react';
import WorldMapDisplay from './WorldMapDisplay';
import TownMapDisplay from './TownMapDisplay';

const MapModal = ({ isOpen, onClose, mapData, playerPosition, onTileClick, firstHero, mapLevel, townMapData, townPlayerPosition, onLeaveTown, onTownTileClick, currentTile, onEnterCurrentTown, isInsideTown, hasAdventureStarted, townError, markBuildingDiscovered }) => {
    if (!isOpen) return null;

    // Check if player is on a town tile
    const isOnTown = mapLevel === 'world' && currentTile && currentTile.poi === 'town';

    return (
        <div className="modal-overlay" onClick={onClose}>
            {/* Add specific class for map styling if needed */}
            <div className="modal-content map-modal-content" onClick={(e) => e.stopPropagation()}>
                <h2>{mapLevel === 'town' ? (townMapData?.townName || 'Town Map') : 'World Map'}</h2>
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
                                    title={!hasAdventureStarted ? 'Start the adventure first' : ''}
                                >
                                    {isInsideTown ? `View ${currentTile.townName || currentTile.poi} Map` : `Enter ${currentTile.townName || currentTile.poi}`}
                                </button>
                                {!hasAdventureStarted && (
                                    <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
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
                <button className="modal-close-button" onClick={onClose}>
                    Close Map
                </button>
            </div>
        </div>
    );
};

export default MapModal;
