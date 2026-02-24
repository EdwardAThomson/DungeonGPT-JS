import React, { Suspense, lazy } from 'react';

// Lazy load modal components for better performance
const StorySettingsModalContent = lazy(() => import('./Modals').then(module => ({ default: module.StorySettingsModalContent })));
const HowToPlayModalContent = lazy(() => import('./Modals').then(module => ({ default: module.HowToPlayModalContent })));
const MapModal = lazy(() => import('./MapModal'));
const EncounterModal = lazy(() => import('./EncounterModal'));
const EncounterActionModal = lazy(() => import('./EncounterActionModal'));
const HeroModal = lazy(() => import('./HeroModal'));
const AiAssistantPanel = lazy(() => import('./AiAssistantPanel'));
const PartyInventoryModal = lazy(() => import('./PartyInventoryModal'));
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
  isSettingsModalOpen,
  setIsSettingsModalOpen,
  settings,
  setSettings,
  selectedProvider,
  setSelectedProvider,
  selectedModel,
  setSelectedModel,
  assistantProvider,
  setAssistantProvider,
  assistantModel,
  setAssistantModel,
  worldSeed,
  isHowToPlayModalOpen,
  setIsHowToPlayModalOpen,
  selectedHeroes,
  mapHook,
  handleMoveOnWorldMap,
  interactionHook,
  currentTile,
  hasAdventureStarted,
  handleTownTileClick,
  isEncounterModalOpen,
  setIsEncounterModalOpen,
  currentEncounter,
  isHeroModalOpen,
  setIsHeroModalOpen,
  selectedHeroForModal,
  isActionEncounterOpen,
  setIsActionEncounterOpen,
  setActionEncounter,
  actionEncounter,
  handleEncounterResolve,
  handleHeroUpdate,
  isInventoryModalOpen,
  setIsInventoryModalOpen,
  isDiceModalOpen,
  setIsDiceModalOpen,
  diceSkill,
  diceMode
}) => {
  return (
    <>
      <Suspense fallback={<ModalLoadingFallback />}>
        <StorySettingsModalContent
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={settings}
        setSettings={setSettings}
        selectedProvider={selectedProvider}
        setSelectedProvider={setSelectedProvider}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        assistantProvider={assistantProvider}
        setAssistantProvider={setAssistantProvider}
        assistantModel={assistantModel}
        setAssistantModel={setAssistantModel}
        worldSeed={worldSeed}
        />
      </Suspense>
      <Suspense fallback={<ModalLoadingFallback />}>
        <HowToPlayModalContent
        isOpen={isHowToPlayModalOpen}
        onClose={() => setIsHowToPlayModalOpen(false)}
        />
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
        />
      </Suspense>
      <Suspense fallback={<ModalLoadingFallback />}>
        <EncounterModal
        isOpen={isEncounterModalOpen}
        onClose={() => setIsEncounterModalOpen(false)}
        encounter={currentEncounter}
        onEnterLocation={() => mapHook.handleEnterLocation(currentEncounter, interactionHook.setConversation, interactionHook.conversation)}
        onViewMap={() => mapHook.setIsMapModalOpen(true)}
        />
      </Suspense>
      <Suspense fallback={<ModalLoadingFallback />}>
        <HeroModal
        isOpen={isHeroModalOpen}
        onClose={() => setIsHeroModalOpen(false)}
        hero={selectedHeroForModal}
        />
      </Suspense>
      <Suspense fallback={<ModalLoadingFallback />}>
        <EncounterActionModal
        isOpen={isActionEncounterOpen}
        onClose={() => {
          setIsActionEncounterOpen(false);
          setActionEncounter(null);
        }}
        encounter={actionEncounter}
        character={selectedHeroes.length > 0 ? selectedHeroes[0] : null}
        party={selectedHeroes}
        onResolve={handleEncounterResolve}
        onCharacterUpdate={handleHeroUpdate}
        />
      </Suspense>
      <Suspense fallback={<ModalLoadingFallback />}>
        <PartyInventoryModal
        isOpen={isInventoryModalOpen}
        onClose={() => setIsInventoryModalOpen(false)}
        selectedHeroes={selectedHeroes}
        />
      </Suspense>
      <Suspense fallback={<ModalLoadingFallback />}>
        <DiceRoller
        isOpen={isDiceModalOpen}
        onClose={() => {
          setIsDiceModalOpen(false);
          if (interactionHook.checkRequest) {
            interactionHook.setCheckRequest(null);
          }
        }}
        preselectedSkill={diceSkill}
        initialMode={diceMode}
        character={selectedHeroes.length > 0 ? selectedHeroes[0] : null}
        />
      </Suspense>
    </>
  );
};

export default GameModals;
