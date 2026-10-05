import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import FitToBox from './FitToBox';
import FocusTrap from 'focus-trap-react';
import WorldMapDisplay from './WorldMapDisplay';
import TownMapDisplay from './TownMapDisplay';
import SiteMapDisplay from './SiteMapDisplay';
import MapLegend from './MapLegend';
import { worldLegendGroups, townLegendGroups, siteLegendGroups } from '../utils/mapLegend';

// Docked world map: pick the largest WHOLE-pixel tile that fits the stage (no transform
// scaling, so no seams between tiles), clamped to a readable range.
const FitWorld = ({ mapData, render }) => {
    const ref = useRef(null);
    const [tile, setTile] = useState(56);
    const cols = mapData?.[0]?.length || 10;
    const rows = mapData?.length || 10;
    useEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        const measure = () => {
            const t = Math.floor(Math.min((el.clientWidth - 48) / cols, (el.clientHeight - 48) / rows));
            setTile(Math.max(32, Math.min(120, t || 56)));
        };
        measure();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [cols, rows]);
    return <div ref={ref} className="ws-fit-world">{render(tile)}</div>;
};

const MapModal = ({ isOpen, onClose, mapData, playerPosition, onTileClick, firstHero, mapLevel, townMapData, townPlayerPosition, onLeaveTown, onTownTileClick, currentTile, onEnterCurrentTown, isInsideTown, hasAdventureStarted, townError, markBuildingDiscovered, visibleMilestonePois, activeMilestonePois, revealedSiteTypes, onQuestItemFound, onRest, onResurrect, onBuy, onSell, party, siteMapData, sitePlayerPosition, onSiteTileClick, onAttackSiteMob, onLeaveSite, siteError, siteNotice, partyLevel, sideQuests, onAcceptSideQuest, onTurnInQuest, milestones, onTalkToNpc, onVisitTavern, dockTarget = null, suggestedTravelTargets = null, glideMs = null, buildingRequest = null, onBuildingRequestHandled }) => {
    // Docked (#84 workspace spike): render into the page's map stage instead of a modal.
    const docked = !!dockTarget;
    const previousFocusRef = useRef(null);
    const modalRef = useRef(null);
    const [showLegend, setShowLegend] = useState(!dockTarget);
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

    // Docked stage: the same map views as the modal, scaled to fill the stage, with the
    // view tabs / Enter / Leave actions as a slim toolbar. No overlay, focus trap, title
    // or Close: the map is the page.
    const renderDocked = () => {
        const onTown = mapLevel === 'world' && currentTile && currentTile.poi === 'town';
        const mapView = viewLevel === 'world' ? null : viewLevel === 'site' ? (
            <SiteMapDisplay siteMapData={siteMapData} playerPosition={sitePlayerPosition} onTileClick={onSiteTileClick} onAttackMob={onAttackSiteMob} onLeaveSite={onLeaveSite} showLeaveButton={false} firstHero={firstHero} siteError={siteError} siteNotice={siteNotice} partyLevel={partyLevel} />
        ) : (
            <TownMapDisplay townMapData={townMapData} playerPosition={townPlayerPosition} onLeaveTown={onLeaveTown} onTileClick={onTownTileClick} firstHero={firstHero} townError={townError} showLeaveButton={false} markBuildingDiscovered={markBuildingDiscovered} onQuestItemFound={onQuestItemFound} onRest={onRest} onResurrect={onResurrect} onBuy={onBuy} onSell={onSell} party={party} sideQuests={sideQuests} onAcceptSideQuest={onAcceptSideQuest} onTurnInQuest={onTurnInQuest} milestones={milestones} onTalkToNpc={onTalkToNpc} onVisitTavern={onVisitTavern} buildingRequest={buildingRequest} onBuildingRequestHandled={onBuildingRequestHandled} />
        );
        return (
            <div className="ws-map">
                <div className="ws-map-bar">
                    <span className="ws-map-title">{viewLevel === 'town' ? (townMapData?.townName || 'Town') : viewLevel === 'site' ? (siteMapData?.name || 'Site') : 'World'}</span>
                    {mapLevel === 'town' && (
                        <>
                            <button type="button" className={`ws-chip${mapTab === 'town' ? ' on' : ''}`} onClick={() => setMapTab('town')}>{townMapData?.townName || 'Town'}</button>
                            <button type="button" className={`ws-chip${mapTab === 'world' ? ' on' : ''}`} onClick={() => setMapTab('world')}>World</button>
                            {onLeaveTown && <button type="button" className="ws-chip" onClick={onLeaveTown}>Leave town</button>}
                        </>
                    )}
                    {mapLevel === 'site' && onLeaveSite && <button type="button" className="ws-chip" onClick={onLeaveSite}>Leave</button>}
                    {onTown && hasAdventureStarted && (
                        <button type="button" className="ws-chip gold" onClick={() => onEnterCurrentTown()}>
                            {isInsideTown ? `View ${currentTile.townName || 'town'}` : `Enter ${currentTile.townName || 'town'}`}
                        </button>
                    )}
                    <button type="button" className={`ws-chip${showLegend ? ' on' : ''}`} onClick={() => setShowLegend((v) => !v)} style={{ marginLeft: 'auto' }}>Key</button>
                </div>
                <div className="ws-map-body">
                    {viewLevel === 'world' ? (
                        <FitWorld
                            mapData={mapData}
                            render={(tile) => (
                                <WorldMapDisplay
                                    mapData={mapData}
                                    playerPosition={playerPosition}
                                    onTileClick={mapLevel === 'world' ? onTileClick : undefined}
                                    firstHero={firstHero}
                                    visibleMilestonePois={visibleMilestonePois}
                                    activeMilestonePois={activeMilestonePois}
                                    revealedSiteTypes={revealedSiteTypes}
                                    tileSizeOverride={tile}
                                    suggestedTargets={suggestedTravelTargets}
                                    glideMs={glideMs}
                                />
                            )}
                        />
                    ) : (
                        <FitToBox>{mapView}</FitToBox>
                    )}
                    {showLegend && (
                        <div className="ws-legend">
                            <MapLegend
                                title="Map Key"
                                groups={viewLevel === 'town' ? townLegendGroups(townMapData?.theme) : viewLevel === 'site' ? siteLegendGroups(siteMapData?.theme, currentTile?.biome) : worldLegendGroups()}
                                columns={viewLevel === 'town' ? 2 : 1}
                                onMinimize={() => setShowLegend(false)}
                            />
                        </div>
                    )}
                </div>
                {mapLevel === 'world' && townError && <div className="ws-map-error">{townError}</div>}
            </div>
        );
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            onClose();
        }
    };

    if (!isOpen && !docked) return null;

    // Check if player is on a town tile
    const isOnTown = mapLevel === 'world' && currentTile && currentTile.poi === 'town';

    if (docked) return createPortal(renderDocked(), dockTarget);

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
                        onAttackMob={onAttackSiteMob}
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
                        <button className="modal-close-button secondary-button" onClick={onClose} aria-label="Close map modal">
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
