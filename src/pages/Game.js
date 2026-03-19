import React, { useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import SettingsContext from "../contexts/SettingsContext";
import { useModal } from '../contexts/ModalContext';
import { checkForEncounter } from '../utils/encounterGenerator';
import useGameSession from '../hooks/useGameSession';
import useGameMap from '../hooks/useGameMap';
import useGameInteraction from '../hooks/useGameInteraction';
import useGamePersistence from '../hooks/useGamePersistence';
import useRagSync from '../hooks/useRagSync';
import { getTile } from '../utils/mapGenerator';
import PartySidebar from '../components/PartySidebar';
import GameMainPanel from '../components/GameMainPanel';
import GameModals from '../components/GameModals';
import ModalShell from '../components/ModalShell';
import { calculateMaxHP, shortRest, longRest } from '../utils/healthSystem';
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
import { checkMilestoneCompletion, getMilestoneRewards } from '../game/milestoneEngine';
import { embedAndStore, query as ragQuery } from '../game/ragEngine';
import { createLogger } from '../utils/logger';
import { resolveProfilePicture } from '../utils/assetHelper';

const logger = createLogger('game');

const SaveConfirmationModal = () => {
  const { data, close } = useModal('saveConfirmation');
  return (
    <ModalShell modalId="saveConfirmation" ariaLabel="Save Confirmation" style={{ maxWidth: '400px', textAlign: 'center' }}>
      <h3 style={{ marginBottom: '15px', color: 'var(--state-success)' }}>✓ Game Saved!</h3>
      <p style={{ marginBottom: '10px', color: 'var(--text)' }}>
        Your progress has been saved as:
      </p>
      <p style={{ marginBottom: '20px', fontWeight: 'bold', color: 'var(--primary)' }}>
        {data?.title}
      </p>
      <button onClick={close} className="primary-button" style={{ padding: '10px 30px' }}>
        Continue
      </button>
    </ModalShell>
  );
};

const Game = () => {
  const { state } = useLocation();
  const { selectedHeroes: stateHeroes, loadedConversation, worldSeed: stateSeed, gameSessionId: stateGameSessionId, generatedMap: stateGeneratedMap, townMapsCache: stateTownMapsCache } = state || { selectedHeroes: [], loadedConversation: null, worldSeed: null, gameSessionId: null, generatedMap: null, townMapsCache: null };
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

  const subMapsObj = typeof loadedConversation?.sub_maps === 'string'
    ? JSON.parse(loadedConversation.sub_maps)
    : (loadedConversation?.sub_maps || loadedConversation?.subMaps);

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

  // --- Modal Manager hooks ---
  const { open: openHowToPlay } = useModal('howToPlay');
  const { open: openHero } = useModal('hero');
  const { open: openDice } = useModal('dice');
  const { open: openInventory } = useModal('inventory');
  const { open: openSaveConfirmation } = useModal('saveConfirmation');
  const { open: openEncounterInfo, close: closeEncounterInfo } = useModal('encounterInfo');
  const { open: openEncounterAction, close: closeEncounterAction, data: encounterActionData } = useModal('encounterAction');

  // --- Modal states not yet migrated ---
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [movesSinceEncounter, setMovesSinceEncounter] = useState(
    subMapsObj?.movesSinceEncounter || 0
  );
  const [pendingNarrativeTile, setPendingNarrativeTile] = useState(null);
  const [aiNarrativeEnabled, setAiNarrativeEnabled] = useState(true);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [isMobilePartySidebarOpen, setIsMobilePartySidebarOpen] = useState(false);

  // --- HOOKS ---
  const {
    sessionId,
    hasAdventureStarted,
    setHasAdventureStarted,
    saveConversationToBackend
  } = useGameSession(loadedConversation, setSettings, setSelectedProvider, setSelectedModel, stateGameSessionId);

  // Pass dummy/empty functions for now where we handle logic in Game.js wrapper
  const mapHook = useGameMap(loadedConversation, hasAdventureStarted, false, () => { }, worldSeed, stateGeneratedMap, settings?.requiredBuildings, stateTownMapsCache);

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
    setHasAdventureStarted,
    {
      isInsideTown: mapHook.isInsideTown,
      currentTownTile: mapHook.currentTownTile,
      currentTownMap: mapHook.currentTownMap,
      townPlayerPosition: mapHook.townPlayerPosition
    },
    sessionId
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

  // --- RAG Sync (backfill on load) ---
  const { ragStatus, isBackfilling, backfillProgress } = useRagSync(
    sessionId,
    interactionHook.conversation,
    hasAdventureStarted
  );

  // --- Hero HP Update Handler ---
  const handleHeroUpdate = (updatedHero) => {
    setSelectedHeroes(prev => prev.map(h =>
      h.characterId === updatedHero.characterId ? updatedHero : h
    ));
  };

  // --- Milestone Engine: deterministic completion check ---
  const checkMilestoneEvent = (event, currentParty) => {
    const milestones = settings?.milestones;
    if (!milestones || milestones.length === 0) return;

    const heroLevel = currentParty?.[0]?.level || 1;
    const result = checkMilestoneCompletion(milestones, event, heroLevel);
    if (!result) return;

    if (result.type === 'completed') {
      logger.info(`[MILESTONE] Completed: #${result.milestoneId} — ${result.milestone.text}`);
      setSettings(prev => ({ ...prev, milestones: result.updatedMilestones }));

      // Apply milestone rewards to lead hero
      const rewards = getMilestoneRewards(result.milestone);
      if (rewards.xp > 0 || rewards.gold > 0 || rewards.items.length > 0) {
        const rewardResult = applyEncounterOutcomeToParty({
          party: currentParty,
          result: { rewards, heroIndex: 0 }
        });
        setSelectedHeroes(rewardResult.updatedParty);
        const heroName = rewardResult.updatedParty[0]?.characterName || 'Hero';
        const rewardLog = formatEncounterRewardLog(heroName, rewardResult.rewardMessages);
        if (rewardLog) logger.info(rewardLog);
      }

      // Chat celebration message (also serves as context for the AI's next narration)
      const rewardSummary = rewards.xp > 0 || rewards.gold > 0
        ? `\nRewards: ${rewards.xp > 0 ? `+${rewards.xp} XP` : ''}${rewards.gold > 0 ? ` +${rewards.gold} gold` : ''}${rewards.items.length > 0 ? ` + ${rewards.items.join(', ')}` : ''}`
        : '';
      const celebrationMsg = {
        role: 'system',
        content: result.campaignComplete
          ? `🏆 CAMPAIGN COMPLETE! 🏆\n${settings.campaignGoal || 'Victory Achieved!'}\n\nThe tale of your heroic deeds will be sung for generations to come!`
          : `🎉 Milestone Achieved! 🎉\n${result.milestone.text}${rewardSummary}`
      };
      interactionHook.setConversation(prev => [...prev, celebrationMsg]);

      if (result.campaignComplete) {
        setSettings(prev => ({ ...prev, campaignComplete: true }));
      }
    } else if (result.type === 'blocked') {
      logger.debug(`[MILESTONE] Blocked: #${result.milestoneId} — needs: ${result.unmetRequirements.map(r => r.text).join(', ')}`);
    } else if (result.type === 'level_blocked') {
      logger.debug(`[MILESTONE] Level blocked: #${result.milestoneId} — needs Lv.${result.requiredLevel}, have Lv.${result.currentLevel}`);
    }
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
      // Close map modal — conflict rule handles this once map is migrated
      mapHook.setIsMapModalOpen(false);
      openEncounterAction({ encounter: townEncounter });
      setMovesSinceEncounter(0);
    } else {
      setMovesSinceEncounter(prev => prev + 1);
    }
  };

  // Location is shown in the header bar, no need for chat reminders

  // --- Effect to monitor AI Check Requests ---
  useEffect(() => {
    if (interactionHook.checkRequest) {
      const req = interactionHook.checkRequest;
      logger.debug('Opening dice modal for check request', req);
      const skill = req.type === 'skill' ? req.skill : null;
      const mode = req.type === 'skill' ? 'skill' : 'dice';
      openDice({
        skill,
        mode,
        character: selectedHeroes.length > 0 ? selectedHeroes[0] : null,
        onCleanup: () => interactionHook.setCheckRequest(null)
      });
    }
  }, [interactionHook.checkRequest]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const poiEncounter = buildPoiEncounter(targetTile);
    if (poiEncounter) {
      openEncounterInfo({
        encounter: poiEncounter,
        onEnterLocation: () => mapHook.handleEnterLocation(poiEncounter, interactionHook.setConversation, interactionHook.conversation),
        onViewMap: () => mapHook.setIsMapModalOpen(true)
      });
    }

    // Milestone check: location_visited
    if (targetTile.poi || targetTile.townName) {
      const locationId = targetTile.poi || targetTile.townName?.toLowerCase().replace(/\s+/g, '_');
      if (locationId) {
        checkMilestoneEvent({ type: 'location_visited', locationId }, selectedHeroes);
      }
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
        // Conflict rule encounter→closes navigation handles closing encounterInfo automatically
        openEncounterAction({ encounter: randomEncounter });
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

    // Query RAG for relevant past events (appended at end for cache-friendliness)
    let ragContext = '';
    if (sessionId) {
      try {
        const tileDesc = `${targetTile.biome} ${targetTile.poi || ''} ${targetTile.townName || ''}`.trim();
        const ragResults = await ragQuery(sessionId, tileDesc);
        if (ragResults.length > 0) {
          ragContext = '\n\n[RECALLED MEMORIES FROM PAST EVENTS]\n' +
            ragResults.map(r => `- ${r.text.slice(0, 300)}`).join('\n');
        }
      } catch (err) {
        logger.warn('RAG query failed for movement, continuing without:', err);
      }
    }

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
      includeRecentContext: true,
      ragContext
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
      interactionHook.setConversation(prev => {
        const updated = [...prev, aiMessage];
        // Fire-and-forget: embed for RAG
        if (sessionId) {
          embedAndStore(sessionId, aiResponse, { msgIndex: updated.length - 1 })
            .catch(err => logger.warn('RAG embed failed (movement):', err));
        }
        return updated;
      });
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

    // Milestone checks after encounter resolution
    const activeEncounter = encounterActionData?.encounter;
    const encounterName = activeEncounter?.name || 'Encounter';
    if (result?.outcome === 'victory' || result?.outcome === 'success') {
      // Check enemy_defeated milestone
      const enemyId = activeEncounter?.enemyId || activeEncounter?.name?.toLowerCase().replace(/\s+/g, '_');
      if (enemyId) {
        checkMilestoneEvent({ type: 'enemy_defeated', enemyId }, updatedParty);
      }
    }
    // Check item_acquired for any reward items
    if (result?.rewards?.items?.length > 0) {
      for (const itemName of result.rewards.items) {
        const itemId = itemName.replace(/ /g, '_').toLowerCase();
        checkMilestoneEvent({ type: 'item_acquired', itemId }, updatedParty);
      }
    }

    if (result?.narration) {
      const encounterContent = `⚔️ **${encounterName}**: ${result.narration}`;
      const encounterMsg = { role: 'ai', content: encounterContent };
      interactionHook.setConversation((prev) => {
        const updated = [...prev, encounterMsg];
        if (sessionId) {
          embedAndStore(sessionId, encounterContent, { msgIndex: updated.length - 1 })
            .catch(err => logger.warn('RAG embed failed (encounter):', err));
        }
        return updated;
      });
    }

    closeEncounterAction();

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
        interactionHook.setConversation((prev) => {
          const updated = [...prev, aiMessage];
          if (sessionId) {
            embedAndStore(sessionId, aiResponse, { msgIndex: updated.length - 1 })
              .catch(err => logger.warn('RAG embed failed (post-encounter):', err));
          }
          return updated;
        });
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

  let subLocationName = null;
  if (mapHook.isInsideTown && mapHook.currentTownMap && mapHook.townPlayerPosition) {
    const tileX = mapHook.townPlayerPosition.x;
    const tileY = mapHook.townPlayerPosition.y;
    const townMapData = mapHook.currentTownMap.mapData;
    if (townMapData && townMapData[tileY] && townMapData[tileY][tileX]) {
      const townTile = townMapData[tileY][tileX];
      if (townTile.type === 'building') {
        if (townTile.buildingName) {
          subLocationName = townTile.buildingName;
        } else if (townTile.buildingType) {
          subLocationName = townTile.buildingType.charAt(0).toUpperCase() + townTile.buildingType.slice(1);
        } else {
          subLocationName = 'Building';
        }
      } else if (townTile.type === 'town_square') {
        subLocationName = 'Town Square';
      } else if (townTile.type?.includes('path') || townTile.type === 'grass') {
        subLocationName = 'Street';
      } else {
        subLocationName = townTile.type ? townTile.type.charAt(0).toUpperCase() + townTile.type.slice(1).replace('_', ' ') : 'Town';
      }
    }
  }

  return (
    <div className="game-page-wrapper">
      {isBackfilling && backfillProgress && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          padding: '4px 16px',
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <span>Building DM memory index... {backfillProgress.indexed}/{backfillProgress.total}</span>
          <div style={{
            flex: 1,
            height: '4px',
            background: 'var(--border)',
            borderRadius: '2px',
            overflow: 'hidden',
            maxWidth: '200px'
          }}>
            <div style={{
              width: `${Math.round((backfillProgress.indexed / backfillProgress.total) * 100)}%`,
              height: '100%',
              background: 'var(--primary)',
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>
      )}
      <div className="game-container">
        <GameMainPanel
          campaignGoal={settings.campaignGoal}
          townName={townName}
          subLocationName={subLocationName}
          townPosition={mapHook.townPlayerPosition}
          worldPosition={mapHook.playerPosition}
          currentBiome={currentBiome}
          onOpenMap={() => mapHook.setIsMapModalOpen(true)}
          onOpenInventory={() => openInventory({
            selectedHeroes,
            onUseItem: (heroId, itemKey, healedHero) => {
              setSelectedHeroes(prev => prev.map(h =>
                h.characterId === heroId ? healedHero : h
              ));
            }
          })}
          onOpenHowToPlay={openHowToPlay}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onManualSave={async () => {
            const timestamp = new Date();
            const title = `Adventure - ${timestamp.toLocaleDateString()} ${timestamp.toLocaleTimeString()}`;
            const success = await performSave();
            if (success !== false) {
              openSaveConfirmation({ title });
            }
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
            openHero({ hero });
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
              src={resolveProfilePicture(selectedHeroes[0].profilePicture)}
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
        selectedHeroes={selectedHeroes}
        mapHook={mapHook}
        handleMoveOnWorldMap={handleMoveOnWorldMap}
        interactionHook={interactionHook}
        currentTile={currentTile}
        hasAdventureStarted={hasAdventureStarted}
        handleTownTileClick={handleTownTileClick}
        handleEncounterResolve={handleEncounterResolve}
        handleHeroUpdate={handleHeroUpdate}
        onQuestItemFound={(itemId, itemName) => {
          checkMilestoneEvent({ type: 'item_acquired', itemId }, selectedHeroes);
        }}
        party={selectedHeroes}
        onResurrect={(heroId, goldCost) => {
          // Deduct gold from party members (spread cost across heroes with gold)
          let remaining = goldCost;
          const afterGold = selectedHeroes.map(h => {
            if (remaining <= 0) return h;
            const available = h.gold || 0;
            const deducted = Math.min(available, remaining);
            remaining -= deducted;
            return { ...h, gold: available - deducted };
          });

          // Resurrect the hero at 50% HP
          const updatedHeroes = afterGold.map(h => {
            const id = h.characterId || h.heroId;
            if (id !== heroId) return h;
            const halfHP = Math.max(1, Math.floor(h.maxHP * 0.5));
            return { ...h, currentHP: halfHP, isDefeated: false };
          });

          const hero = updatedHeroes.find(h => (h.characterId || h.heroId) === heroId);
          setSelectedHeroes(updatedHeroes);
          return {
            heroName: hero.heroName || hero.characterName || 'Unknown',
            hpRestored: hero.currentHP,
            goldCost
          };
        }}
        onRest={(restType) => {
          const restFn = restType === 'long' ? longRest : shortRest;
          const healingResults = [];
          const updatedHeroes = selectedHeroes.map(hero => {
            if (hero.isDefeated) return hero;
            const name = hero.heroName || hero.characterName || 'Unknown';
            const before = hero.currentHP;
            const healed = restFn(hero);
            healingResults.push({ name, before, after: healed.currentHP, maxHP: healed.maxHP });
            return healed;
          });
          setSelectedHeroes(updatedHeroes);
          return { restType, healingResults };
        }}
      />

      {/* Save Confirmation Modal */}
      <SaveConfirmationModal />
    </div>
  );
};

export default Game;
