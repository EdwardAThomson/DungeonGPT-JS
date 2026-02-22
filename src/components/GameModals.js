import React from 'react';
import { StorySettingsModalContent, HowToPlayModalContent } from './Modals';
import MapModal from './MapModal';
import EncounterModal from './EncounterModal';
import EncounterActionModal from './EncounterActionModal';
import CharacterModal from './CharacterModal';
import AiAssistantPanel from './AiAssistantPanel';
import PartyInventoryModal from './PartyInventoryModal';
import DiceRoller from './DiceRoller';

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
  isCharacterModalOpen,
  setIsCharacterModalOpen,
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
      <HowToPlayModalContent
        isOpen={isHowToPlayModalOpen}
        onClose={() => setIsHowToPlayModalOpen(false)}
      />

      <AiAssistantPanel
        gameState={{
          selectedHeroes,
          playerPosition: mapHook.playerPosition,
          isInsideTown: mapHook.isInsideTown,
          currentTownMap: mapHook.currentTownMap
        }}
        backend={assistantProvider || selectedProvider}
        model={assistantModel || selectedModel}
      />
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
      <EncounterModal
        isOpen={isEncounterModalOpen}
        onClose={() => setIsEncounterModalOpen(false)}
        encounter={currentEncounter}
        onEnterLocation={() => mapHook.handleEnterLocation(currentEncounter, interactionHook.setConversation, interactionHook.conversation)}
        onViewMap={() => mapHook.setIsMapModalOpen(true)}
      />
      <CharacterModal
        isOpen={isCharacterModalOpen}
        onClose={() => setIsCharacterModalOpen(false)}
        character={selectedHeroForModal}
      />
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
      <PartyInventoryModal
        isOpen={isInventoryModalOpen}
        onClose={() => setIsInventoryModalOpen(false)}
        selectedHeroes={selectedHeroes}
      />
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
    </>
  );
};

export default GameModals;
