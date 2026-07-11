import React, { Suspense, lazy, useMemo } from 'react';
import { computeVisibleMilestonePois, computeActiveMilestonePois } from '../game/milestoneEngine';
import { getRevealedSiteTypes } from '../game/questEngine';

// Lazy load modal components for better performance
const AdventureBook = lazy(() => import('./AdventureBook'));
const HowToPlayModalContent = lazy(() => import('./Modals').then(module => ({ default: module.HowToPlayModalContent })));
const MapModal = lazy(() => import('./MapModal'));
const EncounterModal = lazy(() => import('./EncounterModal'));
const EncounterActionModal = lazy(() => import('./EncounterActionModal'));
const HeroModal = lazy(() => import('./HeroModal'));
const ItemDetailModal = lazy(() => import('./ItemDetailModal'));
const AiAssistantPanel = lazy(() => import('./AiAssistantPanel'));
const DiceRoller = lazy(() => import('./DiceRoller'));

// Loading fallback component
const ModalLoadingFallback = () => (
  <div style={{
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    color: 'var(--text)',
    fontSize: '14px',
    zIndex: 10000
  }}>
    Loading...
  </div>
);

const GameModals = ({
  onContinueLegend,
  settings,
  selectedProvider,
  setSelectedProvider,
  selectedModel,
  setSelectedModel,
  assistantProvider,
  setAssistantProvider,
  assistantModel,
  setAssistantModel,
  selectedHeroes,
  mapHook,
  handleMoveOnWorldMap,
  interactionHook,
  currentTile,
  hasAdventureStarted,
  handleTownTileClick,
  handleSiteTileClick,
  handleEncounterResolve,
  handleHeroUpdate,
  onUseItem,
  onQuestItemFound,
  onRest,
  onResurrect,
  onBuy,
  onSell,
  party,
  sideQuests,
  onAcceptSideQuest,
  onTurnInQuest,
  onTalkToNpc
}) => {
  // Which milestone POIs are visible: current campaign POIs gate on prerequisites;
  // POIs stamped by a COMPLETED previous campaign (in-save continuation) are
  // permanent landmarks and always show. null = no filtering.
  const visibleMilestonePois = useMemo(
    () => computeVisibleMilestonePois(settings?.milestones, mapHook.worldMap),
    [settings?.milestones, mapHook.worldMap]
  );

  // Which milestone POIs still GLOW: only ACTIVE objectives (revealed but not yet
  // completed). Completed POIs stay visible (above) but stop glowing, and prior-chapter
  // landmarks never glow.
  const activeMilestonePois = useMemo(
    () => computeActiveMilestonePois(settings?.milestones),
    [settings?.milestones]
  );

  // Which site types (cave/ruins) a quest has revealed — for hiding un-quested sites.
  // null = no gating (old saves / campaigns with no side quests keep sites visible).
  const revealedSiteTypes = useMemo(
    () => (settings?.sideQuests?.length ? getRevealedSiteTypes(settings.sideQuests) : null),
    [settings?.sideQuests]
  );

  return (
    <>
      <Suspense fallback={<ModalLoadingFallback />}>
        {/* #52: the Adventure Book hub — Journal (campaign), Side Quests, Codex (#51),
            Party inventory, and AI settings in one tabbed modal. */}
        <AdventureBook
        onContinueLegend={onContinueLegend}
        settings={settings}
        selectedProvider={selectedProvider}
        setSelectedProvider={setSelectedProvider}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        assistantProvider={assistantProvider}
        setAssistantProvider={setAssistantProvider}
        assistantModel={assistantModel}
        setAssistantModel={setAssistantModel}
        selectedHeroes={selectedHeroes}
        onUseItem={onUseItem}
        onHeroUpdate={handleHeroUpdate}
        />
      </Suspense>
      <Suspense fallback={<ModalLoadingFallback />}>
        <HowToPlayModalContent />
      </Suspense>

      <Suspense fallback={<ModalLoadingFallback />}>
        <AiAssistantPanel
        gameState={{
          selectedHeroes,
          playerPosition: mapHook.playerPosition,
          isInsideTown: mapHook.isInsideTown,
          currentTownMap: mapHook.currentTownMap
        }}
        backend={assistantProvider || selectedProvider}
        model={assistantModel || selectedModel}
        showFloatingTrigger={false}
        />
      </Suspense>
      <Suspense fallback={<ModalLoadingFallback />}>
        <MapModal
        isOpen={mapHook.isMapModalOpen}
        onClose={() => mapHook.setIsMapModalOpen(false)}
        mapData={mapHook.worldMap}
        playerPosition={mapHook.playerPosition}
        onTileClick={handleMoveOnWorldMap}
        firstHero={selectedHeroes && selectedHeroes.length > 0 ? selectedHeroes[0] : null}
        mapLevel={mapHook.currentMapLevel}
        townMapData={mapHook.currentTownMap}
        townPlayerPosition={mapHook.townPlayerPosition}
        onLeaveTown={() => mapHook.handleLeaveTown(interactionHook.setConversation, interactionHook.conversation)}
        onTownTileClick={handleTownTileClick}
        currentTile={currentTile}
        onEnterCurrentTown={() => mapHook.handleEnterCurrentTown(interactionHook.setConversation, interactionHook.conversation)}
        isInsideTown={mapHook.isInsideTown}
        hasAdventureStarted={hasAdventureStarted}
        townError={mapHook.townError}
        markBuildingDiscovered={mapHook.markBuildingDiscovered}
        visibleMilestonePois={visibleMilestonePois}
        activeMilestonePois={activeMilestonePois}
        revealedSiteTypes={revealedSiteTypes}
        onQuestItemFound={onQuestItemFound}
        onRest={onRest}
        sideQuests={sideQuests}
        onAcceptSideQuest={onAcceptSideQuest}
        onTurnInQuest={onTurnInQuest}
        milestones={settings?.milestones}
        onTalkToNpc={onTalkToNpc}
        onResurrect={onResurrect}
        onBuy={onBuy}
        onSell={onSell}
        party={party}
        siteMapData={mapHook.currentSiteMap}
        sitePlayerPosition={mapHook.sitePlayerPosition}
        onSiteTileClick={handleSiteTileClick}
        onLeaveSite={() => mapHook.handleLeaveSite(interactionHook.setConversation, interactionHook.conversation)}
        siteError={mapHook.siteError}
        siteNotice={mapHook.siteNotice}
        />
      </Suspense>
      <Suspense fallback={<ModalLoadingFallback />}>
        <EncounterModal />
      </Suspense>
      <Suspense fallback={<ModalLoadingFallback />}>
        <HeroModal />
      </Suspense>
      <Suspense fallback={<ModalLoadingFallback />}>
        <ItemDetailModal />
      </Suspense>
      <Suspense fallback={<ModalLoadingFallback />}>
        <EncounterActionModal
        character={selectedHeroes.length > 0 ? selectedHeroes[0] : null}
        party={selectedHeroes}
        onResolve={handleEncounterResolve}
        onCharacterUpdate={handleHeroUpdate}
        />
      </Suspense>
      <Suspense fallback={<ModalLoadingFallback />}>
        <DiceRoller />
      </Suspense>
    </>
  );
};

export default GameModals;
