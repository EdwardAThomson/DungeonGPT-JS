import React, { useEffect, useRef, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import WorldMapDisplay from './WorldMapDisplay';
import TownMapDisplay from './TownMapDisplay';
import SiteMapDisplay from './SiteMapDisplay';
import MapLegend from './MapLegend';
import { worldLegendGroups, townLegendGroups, siteLegendGroups } from '../utils/mapLegend';

const MapModal = ({ isOpen, onClose, mapData, playerPosition, onTileClick, firstHero, mapLevel, townMapData, townPlayerPosition, onLeaveTown, onTownTileClick, currentTile, onEnterCurrentTown, isInsideTown, hasAdventureStarted, townError, markBuildingDiscovered, visibleMilestonePois, onQuestItemFound, onRest, onResurrect, party, siteMapData, sitePlayerPosition, onSiteTileClick, onLeaveSite, siteError }) => {
    const previousFocusRef = useRef(null);
    const modalRef = useRef(null);
    const [showLegend, setShowLegend] = useState(true);

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
                    <h2 id="map-modal-title">{mapLevel === 'town' ? (townMapData?.townName || 'Town Map') : mapLevel === 'site' ? (siteMapData?.name || 'Site') : 'World Map'}</h2>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'center' }}>
                    <div style={{ minWidth: 0 }}>
                {mapLevel === 'world' ? (
                    <>
                        <WorldMapDisplay
                            mapData={mapData}
                            playerPosition={playerPosition}
                            onTileClick={onTileClick}
                            firstHero={firstHero}
                            visibleMilestonePois={visibleMilestonePois}
                        />
                        {townError && (
                            <div className="message system error" style={{ margin: '10px auto', display: 'block' }}>
                                {townError}
                            </div>
                        )}
                    </>
                ) : mapLevel === 'site' ? (
                    <SiteMapDisplay
                        siteMapData={siteMapData}
                        playerPosition={sitePlayerPosition}
                        onTileClick={onSiteTileClick}
                        onLeaveSite={onLeaveSite}
                        showLeaveButton={false}
                        firstHero={firstHero}
                        siteError={siteError}
                    />
                ) : (
                    <TownMapDisplay
                        townMapData={townMapData}
                        playerPosition={townPlayerPosition}
                        onLeaveTown={onLeaveTown}
                        onTileClick={onTownTileClick}
                        firstHero={firstHero}
                        townError={townError}
                        showLeaveButton={false}
                        markBuildingDiscovered={markBuildingDiscovered}
                        onQuestItemFound={onQuestItemFound}
                        onRest={onRest}
                        onResurrect={onResurrect}
                        party={party}
                    />
                )}
                    </div>
                    {showLegend ? (
                        <MapLegend
                            title="Map Key"
                            groups={mapLevel === 'town' ? townLegendGroups() : mapLevel === 'site' ? siteLegendGroups(siteMapData?.theme, currentTile?.biome) : worldLegendGroups()}
                            columns={mapLevel === 'town' ? 2 : 1}
                            onMinimize={() => setShowLegend(false)}
                            style={{ maxHeight: '60vh', overflowY: 'auto', flex: '0 0 auto' }}
                        />
                    ) : (
                        <button
                            className="secondary-button"
                            onClick={() => setShowLegend(true)}
                            aria-label="Show map key"
                            title="Show key"
                            style={{ flex: '0 0 auto', alignSelf: 'flex-start', whiteSpace: 'nowrap' }}
                        >
                            🗺 Key
                        </button>
                    )}
                </div>
                    {/* All actions in one horizontal row to save vertical space */}
                    <div className="map-modal-actions">
                        {mapLevel === 'town' && onLeaveTown && (
                            <button className="secondary-button" onClick={onLeaveTown} aria-label="Leave town">
                                Leave Town
                            </button>
                        )}
                        {mapLevel === 'site' && onLeaveSite && (
                            <button className="secondary-button" onClick={onLeaveSite} aria-label="Leave site">
                                Leave
                            </button>
                        )}
                        {mapLevel === 'world' && isOnTown && (
                            <button
                                className="primary-button"
                                onClick={() => { onEnterCurrentTown(); /* keep modal open; it switches to town view */ }}
                                disabled={!hasAdventureStarted}
                                aria-label={isInsideTown ? `View ${currentTile.townName || currentTile.poi} map` : `Enter ${currentTile.townName || currentTile.poi}`}
                                title={!hasAdventureStarted ? 'Start the adventure first' : ''}
                            >
                                {isInsideTown ? `View ${currentTile.townName || currentTile.poi} Map` : `Enter ${currentTile.townName || currentTile.poi}`}
                            </button>
                        )}
                        <button className="modal-close-button" onClick={onClose} aria-label="Close map modal">
                            Close Map
                        </button>
                    </div>
                    {mapLevel === 'world' && isOnTown && !hasAdventureStarted && (
                        <p className="town-entrance-warning">Start your adventure to enter towns</p>
                    )}
                </div>
            </FocusTrap>
        </div>
    );
};

export default MapModal;
