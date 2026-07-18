import React, { useEffect, useRef, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import WorldMapDisplay from './WorldMapDisplay';
import TownMapDisplay from './TownMapDisplay';
import SiteMapDisplay from './SiteMapDisplay';
import MapLegend from './MapLegend';
import { worldLegendGroups, townLegendGroups, siteLegendGroups } from '../utils/mapLegend';

const MapModal = ({ isOpen, onClose, mapData, playerPosition, onTileClick, firstHero, mapLevel, townMapData, townPlayerPosition, onLeaveTown, onTownTileClick, currentTile, onEnterCurrentTown, isInsideTown, hasAdventureStarted, townError, markBuildingDiscovered, visibleMilestonePois, activeMilestonePois, revealedSiteTypes, onQuestItemFound, onRest, onResurrect, onBuy, onSell, party, siteMapData, sitePlayerPosition, onSiteTileClick, onLeaveSite, siteError, siteNotice, partyLevel, sideQuests, onAcceptSideQuest, onTurnInQuest, milestones, onTalkToNpc, onVisitTavern }) => {
    const previousFocusRef = useRef(null);
    const modalRef = useRef(null);
    const [showLegend, setShowLegend] = useState(true);
    // While inside a town the player can flip to the world map for milestone planning.
    // `mapTab` only matters when mapLevel === 'town'; reset to the town view on entering one.
    const [mapTab, setMapTab] = useState('town');
    useEffect(() => {
        if (mapLevel === 'town') setMapTab('town');
    }, [mapLevel]);
    const viewLevel = mapLevel === 'town' ? mapTab : mapLevel;

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
            {/* allowOutsideClick lets a modal stacked ABOVE the map stay clickable.
                The campaign-completion "Continue your legend" picker auto-opens over
                the map that handleEncounterResolve reopens after a boss finale; without
                this option focus-trap's capture-phase click listener preventDefault +
                stopImmediatePropagation every click outside the map content, deadening
                the picker on top until a hard refresh. ModalShell passes the same
                option for exactly this reason. */}
            <FocusTrap focusTrapOptions={{ allowOutsideClick: true }}>
                <div 
                    ref={modalRef}
                    className="modal-content map-modal-content" 
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={handleKeyDown}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="map-modal-title"
                >
                    <h2 id="map-modal-title">{viewLevel === 'town' ? (townMapData?.townName || 'Town Map') : viewLevel === 'site' ? (siteMapData?.name || 'Site') : 'World Map'}</h2>
                {mapLevel === 'town' && (
                    <div className="map-view-tabs" role="tablist" aria-label="Map view" style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 10 }}>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={mapTab === 'town'}
                            className={mapTab === 'town' ? 'primary-button' : 'secondary-button'}
                            onClick={() => setMapTab('town')}
                        >
                            🏘️ {townMapData?.townName || 'Town'}
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={mapTab === 'world'}
                            className={mapTab === 'world' ? 'primary-button' : 'secondary-button'}
                            onClick={() => setMapTab('world')}
                        >
                            🗺️ World
                        </button>
                    </div>
                )}
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'center', flexWrap: 'wrap', width: '100%' }}>
                    <div style={{ flex: '0 0 auto' }}>
                {viewLevel === 'world' ? (
                    <>
                        <WorldMapDisplay
                            mapData={mapData}
                            playerPosition={playerPosition}
                            onTileClick={mapLevel === 'world' ? onTileClick : undefined}
                            firstHero={firstHero}
                            visibleMilestonePois={visibleMilestonePois}
                            activeMilestonePois={activeMilestonePois}
                            revealedSiteTypes={revealedSiteTypes}
                        />
                        {mapLevel === 'town' && (
                            <p className="map-planning-hint" style={{ textAlign: 'center', opacity: 0.75, fontSize: '0.85rem', margin: '8px 0 0' }}>
                                Planning view. Leave town to travel the world map.
                            </p>
                        )}
                        {mapLevel === 'world' && townError && (
                            <div className="message system error" style={{ margin: '10px auto', display: 'block' }}>
                                {townError}
                            </div>
                        )}
                    </>
                ) : viewLevel === 'site' ? (
                    <SiteMapDisplay
                        siteMapData={siteMapData}
                        playerPosition={sitePlayerPosition}
                        onTileClick={onSiteTileClick}
                        onLeaveSite={onLeaveSite}
                        showLeaveButton={false}
                        firstHero={firstHero}
                        siteError={siteError}
                        siteNotice={siteNotice}
                        partyLevel={partyLevel}
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
                        onBuy={onBuy}
                        onSell={onSell}
                        party={party}
                        sideQuests={sideQuests}
                        onAcceptSideQuest={onAcceptSideQuest}
                        onTurnInQuest={onTurnInQuest}
                        milestones={milestones}
                        onTalkToNpc={onTalkToNpc}
                        onVisitTavern={onVisitTavern}
                    />
                )}
                    </div>
                    {showLegend ? (
                        <MapLegend
                            title="Map Key"
                            groups={viewLevel === 'town' ? townLegendGroups(townMapData?.theme) : viewLevel === 'site' ? siteLegendGroups(siteMapData?.theme, currentTile?.biome) : worldLegendGroups()}
                            columns={viewLevel === 'town' ? 2 : 1}
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
