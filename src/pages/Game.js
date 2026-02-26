import React, { useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import SettingsContext from "../contexts/SettingsContext";
import { checkForEncounter } from '../utils/encounterGenerator';
import useGameSession from '../hooks/useGameSession';
import useGameMap from '../hooks/useGameMap';
import useGameInteraction from '../hooks/useGameInteraction';
import useGamePersistence from '../hooks/useGamePersistence';
import { getTile } from '../utils/mapGenerator';
import PartySidebar from '../components/PartySidebar';
import GameMainPanel from '../components/GameMainPanel';
import GameModals from '../components/GameModals';
import { calculateMaxHP } from '../utils/healthSystem';
import { composeMovementNarrativePrompt } from '../game/promptComposer';
import { generateMovementNarrative } from '../game/movementController';
import {
  applyWorldMapMove,
  buildMovementSystemMessage,
  buildPendingNarrativeTile,
  buildPoiEncounter,
  getAreaIdentifiers,
  getAreaVisitState,
  isAdjacentWorldMove,
  trackAreaVisits
} from '../game/worldMoveController';
import {
  applyEncounterOutcomeToParty,
  planWorldTileEncounterFlow,
  formatEncounterPenaltyLog,
  formatEncounterRewardLog
} from '../game/encounterController';
import { resolveProviderAndModel } from '../llm/modelResolver';
import { createLogger } from '../utils/logger';

const logger = createLogger('game');

const Game = () => {
  const { state } = useLocation();
  const { selectedHeroes: stateHeroes, loadedConversation, worldSeed: stateSeed, gameSessionId: stateGameSessionId, generatedMap: stateGeneratedMap } = state || { selectedHeroes: [], loadedConversation: null, worldSeed: null, gameSessionId: null, generatedMap: null };
  const [selectedHeroes, setSelectedHeroes] = useState(() => {
    // Initialize heroes with progression fields if missing
    const heroes = loadedConversation?.selected_heroes || stateHeroes || [];
    return heroes.map(hero => {
      if (hero.xp === undefined) {
        // Use healthSystem's calculateMaxHP for consistency
        const maxHP = hero.maxHP || calculateMaxHP(hero);
        return {
          ...hero,
          xp: hero.xp || 0,
          level: hero.level || 1,
          gold: hero.gold || 0,
          inventory: hero.inventory || [],
          maxHP,
          currentHP: hero.currentHP ?? maxHP
        };
      }
      return hero;
    });
  });

  // Robust seed extraction
  const settingsObj = typeof loadedConversation?.game_settings === 'string'
    ? JSON.parse(loadedConversation.game_settings)
    : loadedConversation?.game_settings;
  const worldSeed = settingsObj?.worldSeed || stateSeed;

  const {
    settings,
    setSettings,
    selectedProvider,
    setSelectedProvider,
    selectedModel,
    setSelectedModel,
    assistantProvider,
    setAssistantProvider,
    assistantModel,
    setAssistantModel
  } = useContext(SettingsContext);

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isHowToPlayModalOpen, setIsHowToPlayModalOpen] = useState(false);
  const [isEncounterModalOpen, setIsEncounterModalOpen] = useState(false);
  const [isDiceModalOpen, setIsDiceModalOpen] = useState(false);
  const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false);
  const [isHeroModalOpen, setIsHeroModalOpen] = useState(false);
  const [selectedHeroForModal, setSelectedHeroForModal] = useState(null);
  const [currentEncounter, setCurrentEncounter] = useState(null);
  const [actionEncounter, setActionEncounter] = useState(null);
  const [isActionEncounterOpen, setIsActionEncounterOpen] = useState(false);
  const [movesSinceEncounter, setMovesSinceEncounter] = useState(
    loadedConversation?.sub_maps?.movesSinceEncounter || 0
  );
  const [pendingNarrativeTile, setPendingNarrativeTile] = useState(null);
  const [aiNarrativeEnabled, setAiNarrativeEnabled] = useState(true);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [isMobilePartySidebarOpen, setIsMobilePartySidebarOpen] = useState(false);
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);
  const [savedGameTitle, setSavedGameTitle] = useState('');

  // --- HOOKS ---
  const {
    sessionId,
    hasAdventureStarted,
    setHasAdventureStarted,
    saveConversationToBackend
  } = useGameSession(loadedConversation, setSettings, setSelectedProvider, setSelectedModel, stateGameSessionId);

  // Pass dummy/empty functions for now where we handle logic in Game.js wrapper
  const mapHook = useGameMap(loadedConversation, hasAdventureStarted, false, () => { }, worldSeed, stateGeneratedMap);

  const interactionHook = useGameInteraction(
    loadedConversation,
    settings,
    setSettings,
    selectedProvider,
    selectedModel,
    selectedHeroes,
    mapHook.worldMap,
    mapHook.playerPosition,
    hasAdventureStarted,
    setHasAdventureStarted
  );
  const { performSave } = useGamePersistence({
    sessionId,
    hasAdventureStarted,
    loadedConversation,
    saveConversationToBackend,
    interactionHook,
    mapHook,
    settings,
    selectedProvider,
    selectedModel,
    selectedHeroes,
    movesSinceEncounter,
    logger
  });

  // --- Hero HP Update Handler ---
  const handleHeroUpdate = (updatedHero) => {
    setSelectedHeroes(prev => prev.map(h =>
      h.characterId === updatedHero.characterId ? updatedHero : h
    ));
  };

  // --- Town Tile Click Wrapper (adds encounter checks) ---
  const handleTownTileClick = (clickedX, clickedY) => {
    // Delegate movement to the hook
    mapHook.handleTownTileClick(clickedX, clickedY, interactionHook.setConversation, interactionHook.conversation);

    // Check for town encounter after moving
    // Create a synthetic tile that the encounter generator recognizes as 'town'
    const syntheticTownTile = { poi: 'town', biome: 'plains' };
    const townEncounter = checkForEncounter(syntheticTownTile, false, settings, movesSinceEncounter);

    if (townEncounter) {
      setActionEncounter(townEncounter);
      setIsActionEncounterOpen(true);
      setMovesSinceEncounter(0);
    } else {
      setMovesSinceEncounter(prev => prev + 1);
    }
  };

  // Location is shown in the header bar, no need for chat reminders

  // --- Effect to monitor AI Check Requests ---
  useEffect(() => {
    if (interactionHook.checkRequest) {
      logger.debug('Opening dice modal for check request', interactionHook.checkRequest);
      setIsDiceModalOpen(true);
    }
  }, [interactionHook.checkRequest]);

  // --- Map Movement Handler with AI ---
  const handleMoveOnWorldMap = async (clickedX, clickedY) => {
    if (!hasAdventureStarted || interactionHook.isLoading) return;

    if (!isAdjacentWorldMove(mapHook.playerPosition, clickedX, clickedY)) {
      interactionHook.setError("You can only move to adjacent tiles.");
      return;
    }

    // Close the map modal so encounter modals can be seen
    mapHook.setIsMapModalOpen(false);

    const { newMap, targetTile, wasExplored } = applyWorldMapMove(
      mapHook.worldMap,
      clickedX,
      clickedY
    );
    mapHook.setWorldMap(newMap);
    mapHook.setPlayerPosition({ x: clickedX, y: clickedY });
    if (!targetTile) return;

    const { biomeType, townName } = getAreaIdentifiers(targetTile);
    const { isBiomeVisited, isTownVisited } = getAreaVisitState({
      biomeType,
      townName,
      visitedBiomes: mapHook.visitedBiomes,
      visitedTowns: mapHook.visitedTowns
    });
    trackAreaVisits({
      biomeType,
      townName,
      isBiomeVisited,
      isTownVisited,
      trackBiomeVisit: mapHook.trackBiomeVisit,
      trackTownVisit: mapHook.trackTownVisit
    });

    // POI Check (for location Modal — towns, etc.)
    const encounter = buildPoiEncounter(targetTile);
    if (encounter) {
      setCurrentEncounter(encounter);
      setIsEncounterModalOpen(true);
    }

    // --- Random Encounter Check (Phase 2.4: Two-Tier System) ---
    const isFirstVisitToTile = !wasExplored;
    logger.debug('About to check for encounter', {
      targetTile: { biome: targetTile.biome, poi: targetTile.poi, x: targetTile.x, y: targetTile.y },
      isFirstVisitToTile,
      movesSinceEncounter,
      settings: { grimnessLevel: settings?.grimnessLevel }
    });
    const randomEncounter = checkForEncounter(targetTile, isFirstVisitToTile, settings, movesSinceEncounter);
    logger.debug('checkForEncounter returned', randomEncounter ? randomEncounter.name : null);
    
    const plannedEncounterFlow = planWorldTileEncounterFlow({
      randomEncounter,
      targetTile,
      aiNarrativeEnabled,
      pendingNarrativeTile: buildPendingNarrativeTile({
        targetTile,
        clickedX,
        clickedY,
        biomeType,
        townName,
        isBiomeVisited,
        isTownVisited
      })
    });

    if (plannedEncounterFlow.shouldResetMoves) {
      setMovesSinceEncounter(0);
    } else if (plannedEncounterFlow.shouldIncrementMoves) {
      setMovesSinceEncounter((prev) => prev + 1);
    }

    if (plannedEncounterFlow.openActionEncounter) {
      setTimeout(() => {
        setActionEncounter(randomEncounter);
        setIsActionEncounterOpen(true);
      }, plannedEncounterFlow.delayMs || 0);
    }

    if (plannedEncounterFlow.flowType === 'immediate') {
      setPendingNarrativeTile(plannedEncounterFlow.pendingNarrativeTile || null);
      return; // AI narrative triggers after encounter resolution
    }

    let activeNarrativeEncounter = null;
    if (plannedEncounterFlow.flowType === 'narrative_context') {
      activeNarrativeEncounter = plannedEncounterFlow.narrativeEncounter;
    }

    // Always generate AI narrative for world map movement (unless disabled)
    // First visit to a new biome/town gets a richer description
    const isNewArea = !isBiomeVisited || (townName && !isTownVisited);

    // Skip AI narrative if toggle is disabled (for testing)
    if (!aiNarrativeEnabled) {
      return;
    }

    // API keys are now configured server-side in .env file
    // CLI providers use OAuth/local auth, cloud providers use server .env keys

    const resolvedModel = resolveProviderAndModel(selectedProvider, selectedModel);

    const systemMessage = buildMovementSystemMessage({
      targetTile,
      biomeType,
      clickedX,
      clickedY
    });
    interactionHook.setConversation(prev => [...prev, systemMessage]);
    interactionHook.setIsLoading(true);

    const { fullPrompt } = composeMovementNarrativePrompt({
      tile: targetTile,
      coords: { x: clickedX, y: clickedY },
      settings,
      selectedHeroes,
      currentSummary: interactionHook.currentSummary,
      narrativeEncounter: activeNarrativeEncounter,
      worldMap: mapHook.worldMap,
      isNewArea,
      conversation: interactionHook.conversation,
      includeRecentContext: true
    });
    interactionHook.setLastPrompt(fullPrompt);

    try {
      const aiResponse = await generateMovementNarrative({
        provider: resolvedModel.provider,
        model: resolvedModel.model,
        prompt: fullPrompt,
        onProgress: (p) => interactionHook.setProgressStatus(p)
      });
      interactionHook.setProgressStatus(null);
      if (!aiResponse || !aiResponse.trim()) {
        logger.warn('Empty movement AI response, skipping');
        return;
      }
      const aiMessage = { role: 'ai', content: aiResponse };
      interactionHook.setConversation(prev => [...prev, aiMessage]);
    } catch (error) {
      logger.error('Movement AI error', error);
      interactionHook.setError(error.message);
      interactionHook.setProgressStatus(null);
    } finally {
      interactionHook.setIsLoading(false);
    }
  };

  const handleEncounterResolve = (result) => {
    logger.info('Encounter resolved', result);

    const {
      updatedParty,
      heroIndex,
      rewardMessages,
      penaltyMessages
    } = applyEncounterOutcomeToParty({
      party: selectedHeroes,
      result
    });
    setSelectedHeroes(updatedParty);

    const heroName = updatedParty[heroIndex]?.characterName || 'Hero';
    const rewardLog = formatEncounterRewardLog(heroName, rewardMessages);
    const penaltyLog = formatEncounterPenaltyLog(heroName, penaltyMessages);
    if (rewardLog) logger.info(rewardLog);
    if (penaltyLog) logger.info(penaltyLog);

    const encounterName = actionEncounter?.name || 'Encounter';
    if (result?.narration) {
      const encounterMsg = { role: 'ai', content: `⚔️ **${encounterName}**: ${result.narration}` };
      interactionHook.setConversation((prev) => [...prev, encounterMsg]);
    }

    setIsActionEncounterOpen(false);
    setActionEncounter(null);

    // Trigger immediate save after encounter to preserve rewards
    setTimeout(() => performSave(), 500);

    // Trigger deferred AI narrative if there's a pending tile
    if (!pendingNarrativeTile) return;
    const { tile, coords, needsAiDescription } = pendingNarrativeTile;
    setPendingNarrativeTile(null);

    if (!needsAiDescription || !aiNarrativeEnabled) return;

    (async () => {
      const resolvedModel = resolveProviderAndModel(selectedProvider, selectedModel);
      const { fullPrompt } = composeMovementNarrativePrompt({
        tile,
        coords,
        settings,
        selectedHeroes: updatedParty,
        currentSummary: interactionHook.currentSummary,
        narrativeEncounter: null,
        worldMap: mapHook.worldMap,
        isNewArea: true,
        conversation: interactionHook.conversation,
        includeRecentContext: false
      });

      interactionHook.setIsLoading(true);
      try {
        const aiResponse = await generateMovementNarrative({
          provider: resolvedModel.provider,
          model: resolvedModel.model,
          prompt: fullPrompt,
          onProgress: (p) => interactionHook.setProgressStatus(p)
        });
        interactionHook.setProgressStatus(null);
        if (!aiResponse || !aiResponse.trim()) {
          logger.warn('Empty post-encounter AI response, skipping');
          return;
        }
        const aiMessage = { role: 'ai', content: aiResponse };
        interactionHook.setConversation((prev) => [...prev, aiMessage]);
      } catch (error) {
        logger.error('Post-encounter AI narrative error', error);
        interactionHook.setProgressStatus(null);
      } finally {
        interactionHook.setIsLoading(false);
      }
    })();
  };

  const currentTile = getTile(mapHook.worldMap, mapHook.playerPosition.x, mapHook.playerPosition.y);
  const currentBiome = currentTile?.biome || 'Unknown Area';
  const townName = mapHook.isInsideTown ? (mapHook.currentTownTile?.townName || 'Town') : null;

  const diceSkill = interactionHook.checkRequest?.type === 'skill' ? interactionHook.checkRequest.skill : null;
  const diceMode = interactionHook.checkRequest?.type === 'skill' ? 'skill' : 'dice';

  return (
    <div className="game-page-wrapper">
      <div className="game-container">
        <GameMainPanel
          campaignGoal={settings.campaignGoal}
          townName={townName}
          townPosition={mapHook.townPlayerPosition}
          worldPosition={mapHook.playerPosition}
          currentBiome={currentBiome}
          onOpenMap={() => mapHook.setIsMapModalOpen(true)}
          onOpenInventory={() => setIsInventoryModalOpen(true)}
          onOpenHowToPlay={() => setIsHowToPlayModalOpen(true)}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onManualSave={() => {
            performSave();
            const timestamp = new Date();
            const title = `Adventure - ${timestamp.toLocaleDateString()} ${timestamp.toLocaleTimeString()}`;
            setSavedGameTitle(title);
            setShowSaveConfirmation(true);
          }}
          canManualSave={!!sessionId}
          hasAdventureStarted={hasAdventureStarted}
          isLoading={interactionHook.isLoading}
          onStartAdventure={interactionHook.handleStartAdventure}
          conversation={interactionHook.conversation}
          progressStatus={interactionHook.progressStatus}
          error={interactionHook.error}
          onSubmit={interactionHook.handleSubmit}
          userInput={interactionHook.userInput}
          onInputChange={interactionHook.handleInputChange}
          selectedModel={selectedModel}
          selectedProvider={selectedProvider}
          sessionId={sessionId}
          onToggleDebug={() => setShowDebugInfo((prev) => !prev)}
          showDebugInfo={showDebugInfo}
          onToggleAiNarrative={() => setAiNarrativeEnabled((prev) => !prev)}
          aiNarrativeEnabled={aiNarrativeEnabled}
          isMapLoaded={!!mapHook.worldMap}
          lastPrompt={interactionHook.lastPrompt}
        />

        <PartySidebar
          selectedHeroes={selectedHeroes}
          onOpenCharacter={(hero) => {
            setSelectedHeroForModal(hero);
            setIsHeroModalOpen(true);
            setIsMobilePartySidebarOpen(false); // Close sidebar when opening modal
          }}
          className={isMobilePartySidebarOpen ? 'mobile-open' : ''}
        />

        {/* Mobile party toggle button - uses first hero portrait */}
        <button
          className="mobile-party-toggle"
          onClick={() => setIsMobilePartySidebarOpen(!isMobilePartySidebarOpen)}
          aria-label="Toggle party sidebar"
        >
          {isMobilePartySidebarOpen ? (
            '✕'
          ) : selectedHeroes[0]?.profilePicture ? (
            <img 
              src={selectedHeroes[0].profilePicture} 
              alt="Party" 
              className="mobile-party-toggle-portrait"
            />
          ) : (
            '⚔️'
          )}
        </button>

        {/* Mobile overlay */}
        {isMobilePartySidebarOpen && (
          <div
            className="mobile-party-overlay"
            onClick={() => setIsMobilePartySidebarOpen(false)}
          />
        )}
      </div>

      <GameModals
        isSettingsModalOpen={isSettingsModalOpen}
        setIsSettingsModalOpen={setIsSettingsModalOpen}
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
        isHowToPlayModalOpen={isHowToPlayModalOpen}
        setIsHowToPlayModalOpen={setIsHowToPlayModalOpen}
        selectedHeroes={selectedHeroes}
        mapHook={mapHook}
        handleMoveOnWorldMap={handleMoveOnWorldMap}
        interactionHook={interactionHook}
        currentTile={currentTile}
        hasAdventureStarted={hasAdventureStarted}
        handleTownTileClick={handleTownTileClick}
        isEncounterModalOpen={isEncounterModalOpen}
        setIsEncounterModalOpen={setIsEncounterModalOpen}
        currentEncounter={currentEncounter}
        isHeroModalOpen={isHeroModalOpen}
        setIsHeroModalOpen={setIsHeroModalOpen}
        selectedHeroForModal={selectedHeroForModal}
        isActionEncounterOpen={isActionEncounterOpen}
        setIsActionEncounterOpen={setIsActionEncounterOpen}
        setActionEncounter={setActionEncounter}
        actionEncounter={actionEncounter}
        handleEncounterResolve={handleEncounterResolve}
        handleHeroUpdate={handleHeroUpdate}
        isInventoryModalOpen={isInventoryModalOpen}
        setIsInventoryModalOpen={setIsInventoryModalOpen}
        isDiceModalOpen={isDiceModalOpen}
        setIsDiceModalOpen={setIsDiceModalOpen}
        diceSkill={diceSkill}
        diceMode={diceMode}
      />

      {/* Save Confirmation Modal */}
      {showSaveConfirmation && (
        <div className="modal-overlay" onClick={() => setShowSaveConfirmation(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', textAlign: 'center' }}>
            <h3 style={{ marginBottom: '15px', color: 'var(--state-success)' }}>✓ Game Saved!</h3>
            <p style={{ marginBottom: '10px', color: 'var(--text)' }}>
              Your progress has been saved as:
            </p>
            <p style={{ marginBottom: '20px', fontWeight: 'bold', color: 'var(--primary)' }}>
              {savedGameTitle}
            </p>
            <button
              onClick={() => setShowSaveConfirmation(false)}
              className="primary-button"
              style={{ padding: '10px 30px' }}
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Game;
