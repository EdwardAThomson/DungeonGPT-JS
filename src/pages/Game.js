import React, { useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import ApiKeysContext from '../contexts/ApiKeysContext';
import SettingsContext from "../contexts/SettingsContext";
import { StorySettingsModalContent, HowToPlayModalContent } from '../components/Modals';
import MapModal from '../components/MapModal';
import EncounterModal from '../components/EncounterModal';
import EncounterActionModal from '../components/EncounterActionModal';
import { checkForEncounter } from '../utils/encounterGenerator';
import { buildMovementPrompt, messageContainsEngagement } from '../utils/promptBuilder';
import DiceRoller from '../components/DiceRoller';
import useGameSession from '../hooks/useGameSession';
import useGameMap from '../hooks/useGameMap';
import useGameInteraction from '../hooks/useGameInteraction';
import { getTile } from '../utils/mapGenerator';
import AiAssistantPanel from '../components/AiAssistantPanel';
import CharacterModal from '../components/CharacterModal';
import { llmService } from '../services/llmService';
import { DM_PROTOCOL } from '../data/prompts';
import { getHPStatus, calculateMaxHP } from '../utils/healthSystem';
import { awardXP, getLevelUpSummary } from '../utils/progressionSystem';
import { addItem, addGold, ITEM_CATALOG } from '../utils/inventorySystem';

const Game = () => {
  const { state } = useLocation();
  const { selectedHeroes: stateHeroes, loadedConversation, worldSeed: stateSeed, gameSessionId: stateGameSessionId } = state || { selectedHeroes: [], loadedConversation: null, worldSeed: null, gameSessionId: null };
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

  const { apiKeys } = useContext(ApiKeysContext);
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
  const [isCharacterModalOpen, setIsCharacterModalOpen] = useState(false);
  const [selectedHeroForModal, setSelectedHeroForModal] = useState(null);
  const [currentEncounter, setCurrentEncounter] = useState(null);
  const [actionEncounter, setActionEncounter] = useState(null);
  const [isActionEncounterOpen, setIsActionEncounterOpen] = useState(false);
  const [movesSinceEncounter, setMovesSinceEncounter] = useState(
    loadedConversation?.sub_maps?.movesSinceEncounter || 0
  );
  const [narrativeEncounter, setNarrativeEncounter] = useState(null);
  const [showDebugInfo, setShowDebugInfo] = useState(false);

  // --- HOOKS ---
  const {
    sessionId,
    hasAdventureStarted,
    setHasAdventureStarted,
    saveConversationToBackend
  } = useGameSession(loadedConversation, setSettings, setSelectedProvider, setSelectedModel, stateGameSessionId);

  // Pass dummy/empty functions for now where we handle logic in Game.js wrapper
  const mapHook = useGameMap(loadedConversation, hasAdventureStarted, false, () => { }, worldSeed);

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

  // --- REFS FOR SAVING ---
  const conversationRef = useRef(interactionHook.conversation);
  const sessionIdRef = useRef(sessionId);
  const selectedProviderRef = useRef(selectedProvider);
  const selectedModelRef = useRef(selectedModel);
  const worldMapRef = useRef(mapHook.worldMap);
  const playerPositionRef = useRef(mapHook.playerPosition);
  const settingsRef = useRef(settings);
  const currentTownMapRef = useRef(mapHook.currentTownMap);
  const townPlayerPositionRef = useRef(mapHook.townPlayerPosition);
  const currentTownTileRef = useRef(mapHook.currentTownTile);
  const isInsideTownRef = useRef(mapHook.isInsideTown);
  const townMapsCacheRef = useRef(mapHook.townMapsCache);
  const currentMapLevelRef = useRef(mapHook.currentMapLevel);
  const hasAdventureStartedRef = useRef(hasAdventureStarted);
  const selectedHeroesRef = useRef(selectedHeroes);
  const movesSinceEncounterRef = useRef(movesSinceEncounter);
  const lastSaveFingerprintRef = useRef(null);

  useEffect(() => {
    conversationRef.current = interactionHook.conversation;
    sessionIdRef.current = sessionId;
    selectedProviderRef.current = selectedProvider;
    selectedModelRef.current = selectedModel;
    worldMapRef.current = mapHook.worldMap;
    playerPositionRef.current = mapHook.playerPosition;
    settingsRef.current = settings;
    currentTownMapRef.current = mapHook.currentTownMap;
    townPlayerPositionRef.current = mapHook.townPlayerPosition;
    currentTownTileRef.current = mapHook.currentTownTile;
    isInsideTownRef.current = mapHook.isInsideTown;
    townMapsCacheRef.current = mapHook.townMapsCache;
    currentMapLevelRef.current = mapHook.currentMapLevel;
    hasAdventureStartedRef.current = hasAdventureStarted;
    selectedHeroesRef.current = selectedHeroes;
    movesSinceEncounterRef.current = movesSinceEncounter;
  }, [
    interactionHook.conversation, sessionId, selectedProvider, selectedModel,
    mapHook.worldMap, mapHook.playerPosition, settings,
    mapHook.currentTownMap, mapHook.townPlayerPosition, mapHook.currentTownTile,
    mapHook.isInsideTown, mapHook.townMapsCache, mapHook.currentMapLevel,
    hasAdventureStarted, selectedHeroes, movesSinceEncounter
  ]);

  const performSave = (isUnmount = false) => {
    if (!sessionIdRef.current) return;

    // Don't save empty/unstarted sessions
    if (!hasAdventureStartedRef.current) {
      if (isUnmount) console.log('[SAVE] Skipping unmount save - adventure not started');
      return;
    }
    const convo = conversationRef.current;
    if (!convo || convo.length === 0) {
      if (isUnmount) console.log('[SAVE] Skipping unmount save - no conversation data');
      return;
    }
    
    // Don't save if settings are empty but we loaded from a conversation that had settings
    // This prevents race condition where settings haven't been restored yet
    const currentSettings = settingsRef.current;
    if (loadedConversation?.game_settings && (!currentSettings || Object.keys(currentSettings).length === 0)) {
      console.log('[SAVE] Skipping save - settings not yet restored from loaded conversation');
      return;
    }

    // Build a lightweight fingerprint to detect changes
    // Use refs which are synced via useEffect to avoid stale closures in setInterval
    const pos = playerPositionRef.current;
    const townPos = townPlayerPositionRef.current;
    const fingerprint = [
      convo.length,
      pos?.x, pos?.y,
      currentMapLevelRef.current,
      isInsideTownRef.current,
      townPos?.x, townPos?.y,
      interactionHook.currentSummary?.length || 0,
      settingsRef.current?.storyTitle || '',
      JSON.stringify((selectedHeroesRef.current || []).map(h => h.currentHP)),
    ].join('|');

    // Skip save if nothing has changed (unless unmount)
    if (!isUnmount && fingerprint === lastSaveFingerprintRef.current) {
      console.log('[AUTO-SAVE] No changes detected, skipping save');
      return;
    }

    const sub_maps = {
      currentTownMap: currentTownMapRef.current,
      townPlayerPosition: townPlayerPositionRef.current,
      currentTownTile: currentTownTileRef.current,
      isInsideTown: isInsideTownRef.current,
      currentMapLevel: currentMapLevelRef.current,
      townMapsCache: townMapsCacheRef.current,
      visitedBiomes: Array.from(mapHook.visitedBiomes),
      visitedTowns: Array.from(mapHook.visitedTowns),
      movesSinceEncounter: movesSinceEncounterRef.current,
    };

    saveConversationToBackend(sessionIdRef.current, {
      conversation: conversationRef.current,
      provider: selectedProviderRef.current,
      model: selectedModelRef.current,
      gameSettings: settingsRef.current,
      selectedHeroes: selectedHeroesRef.current,
      currentSummary: interactionHook.currentSummary,
      worldMap: worldMapRef.current,
      playerPosition: playerPositionRef.current,
      hasAdventureStarted: hasAdventureStarted,
      sub_maps: sub_maps
    });

    lastSaveFingerprintRef.current = fingerprint;
  };

  useEffect(() => {
    if (!sessionId || !hasAdventureStarted) return;
    const interval = setInterval(() => {
      performSave();
    }, 30000);
    return () => clearInterval(interval);
  }, [sessionId, hasAdventureStarted]);

  useEffect(() => {
    return () => {
      console.log('[UNMOUNT SAVE]');
      performSave(true);
    };
  }, []);

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
      console.log('Opening Dice Modal for:', interactionHook.checkRequest);
      setIsDiceModalOpen(true);
    }
  }, [interactionHook.checkRequest]);

  // --- Map Movement Handler with AI ---
  const handleMoveOnWorldMap = async (clickedX, clickedY) => {
    if (!hasAdventureStarted || interactionHook.isLoading) return;

    const currentX = mapHook.playerPosition.x;
    const currentY = mapHook.playerPosition.y;
    const dx = Math.abs(clickedX - currentX);
    const dy = Math.abs(clickedY - currentY);
    const isAdjacent = dx <= 1 && dy <= 1 && (dx + dy) > 0;

    if (!isAdjacent) {
      interactionHook.setError("You can only move to adjacent tiles.");
      return;
    }

    // Check if tile was previously explored (before marking it)
    const originalTile = getTile(mapHook.worldMap, clickedX, clickedY);
    const wasExplored = originalTile?.isExplored || false;

    // Update Map State
    const newMap = mapHook.worldMap.map(row =>
      row.map(tile =>
        tile.x === clickedX && tile.y === clickedY ? { ...tile, isExplored: true } : tile
      )
    );
    mapHook.setWorldMap(newMap);
    mapHook.setPlayerPosition({ x: clickedX, y: clickedY });

    const targetTile = getTile(newMap, clickedX, clickedY);
    if (!targetTile) return;

    const biomeType = targetTile.biome || 'Unknown Area';
    const townName = targetTile.townName || (targetTile.poi === 'town' ? 'Unknown Town' : null);

    const isBiomeVisited = mapHook.visitedBiomes.has(biomeType);
    const isTownVisited = townName ? mapHook.visitedTowns.has(townName) : true;

    // Track new visits
    if (!isBiomeVisited) {
      mapHook.trackBiomeVisit(biomeType);
    }
    if (townName && !isTownVisited) {
      mapHook.trackTownVisit(townName);
    }

    // POI Check (for location Modal — towns, etc.)
    const isTownPoi = targetTile.poi && ['town', 'city', 'village', 'hamlet'].includes(targetTile.poiType || targetTile.poi);
    if (targetTile.poi) {
      const poiType = targetTile.poiType || targetTile.poi;
      const encounter = {
        name: targetTile.townName || targetTile.poi,
        poiType: poiType,
        description: targetTile.descriptionSeed || `You have arrived at ${targetTile.poi}.`,
        canEnter: ['town', 'city', 'village', 'hamlet', 'dungeon'].includes(poiType),
        tile: targetTile
      };
      setCurrentEncounter(encounter);
      setIsEncounterModalOpen(true);
    }

    // --- Random Encounter Check (Phase 2.4: Two-Tier System) ---
    const isFirstVisitToTile = !wasExplored;
    const randomEncounter = checkForEncounter(targetTile, isFirstVisitToTile, settings, movesSinceEncounter);
    
    if (randomEncounter) {
      if (randomEncounter.encounterTier === 'immediate') {
        // IMMEDIATE: Show modal immediately, suppress AI prompt
        const delay = targetTile.poi ? 800 : 0;
        setTimeout(() => {
          setActionEncounter(randomEncounter);
          setIsActionEncounterOpen(true);
        }, delay);
        setMovesSinceEncounter(0);
        return; // Exit early - no AI movement prompt
        
      } else if (randomEncounter.encounterTier === 'narrative') {
        // NARRATIVE: Store for AI prompt injection
        const encounterContext = {
          type: 'narrative_encounter',
          encounter: randomEncounter,
          hook: randomEncounter.narrativeHook,
          aiContext: randomEncounter.aiContext
        };
        setNarrativeEncounter(encounterContext);
        setMovesSinceEncounter(0);
        // Continue to AI movement prompt with encounter context
      }
    } else {
      setMovesSinceEncounter(prev => prev + 1);
    }

    // Determine if we need an AI description
    const needsAiDescription = !isBiomeVisited || (townName && !isTownVisited);

    if (!needsAiDescription) {
      // Just a system message for revisited areas
      let returnMsg = `You continue through the ${biomeType}.`;
      if (townName) {
        returnMsg = `You have returned to ${townName}.`;
      }
      interactionHook.setConversation(prev => [...prev, { role: 'system', content: returnMsg }]);
      return;
    }

    // AI Description for new areas
    const currentApiKey = apiKeys[selectedProvider];
    // Note: CLI providers don't need a key here, handled inside llmService/InteractionHook
    // But we check interactionHook.selectedProvider logic
    const isCli = ['codex', 'claude-cli', 'gemini-cli'].includes(selectedProvider);
    if (!currentApiKey && !isCli) {
      interactionHook.setError(`API Key for ${selectedProvider} is not set.`);
      return;
    }

    const model = interactionHook.modelOptions.find(opt => opt.provider === selectedProvider)?.model || 'gpt-5';

    let systemMessageContent = `You moved to coordinates (${clickedX}, ${clickedY}).`;
    if (targetTile.poi === 'town' && targetTile.townName) {
      systemMessageContent = `You arrived at ${targetTile.townName}, a ${targetTile.townSize || 'settlement'}.`;
    }
    const systemMessage = { role: 'system', content: systemMessageContent };
    interactionHook.setConversation(prev => [...prev, systemMessage]);
    interactionHook.setIsLoading(true);

    const partyInfo = selectedHeroes.map(h => `${h.characterName} (${h.characterClass})`).join(', ');
    
    // Build movement prompt with optional narrative encounter context
    const movementDescription = buildMovementPrompt(targetTile, settings, narrativeEncounter);
    
    let locationInfo = `Player has moved to coordinates (${clickedX}, ${clickedY}) in a ${targetTile.biome} biome.`;
    if (targetTile.poi === 'town' && targetTile.townName) {
      locationInfo += ` The party has arrived at ${targetTile.townName}, a ${targetTile.townSize || 'settlement'}. They are standing at the edge of the town.`;
    } else if (targetTile.poi) {
      locationInfo += ` POI: ${targetTile.poi}.`;
    }
    locationInfo += ` Description seed: ${targetTile.descriptionSeed || 'Describe the area.'}`;

    const goalInfo = settings.campaignGoal ? `\nCampaign Goal: ${settings.campaignGoal}` : '';
    const milestonesInfo = settings.milestones && settings.milestones.length > 0 ? `\nKey Milestones to achieve: ${settings.milestones.map(m => typeof m === 'object' ? m.text : m).join(', ')}` : '';
    const gameContext = `Setting: ${settings.shortDescription}. Mood: ${settings.grimnessLevel}.${goalInfo}${milestonesInfo}\n${locationInfo}. Party: ${partyInfo}.`;
    const prompt = `Game Context: ${gameContext}\n\nStory summary so far: ${interactionHook.currentSummary}\n\n${movementDescription}`;

    const fullPrompt = DM_PROTOCOL + prompt;
    interactionHook.setLastPrompt(fullPrompt);

    try {
      const aiResponse = await llmService.generateText({
        provider: selectedProvider,
        model,
        prompt: fullPrompt,
        maxTokens: 1600,
        temperature: 0.7
      });
      const aiMessage = { role: 'ai', content: aiResponse };
      interactionHook.setConversation(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Movement AI error:', error);
      interactionHook.setError(error.message);
    } finally {
      interactionHook.setIsLoading(false);
    }
  };

  const currentTile = getTile(mapHook.worldMap, mapHook.playerPosition.x, mapHook.playerPosition.y);
  const currentBiome = currentTile?.biome || 'Unknown Area';
  const townName = mapHook.isInsideTown ? (mapHook.currentTownTile?.townName || 'Town') : null;

  const getCurrentSelection = () => {
    if (selectedProvider && selectedModel) return `${selectedProvider}:${selectedModel}`;
    return '';
  };

  const handleModelSelection = (value) => {
    const selected = interactionHook.modelOptions.find(opt => `${opt.provider}:${opt.model}` === value);
    if (selected) {
      setSelectedProvider(selected.provider);
      setSelectedModel(selected.model);
    }
  };

  const diceSkill = interactionHook.checkRequest?.type === 'skill' ? interactionHook.checkRequest.skill : null;
  const diceMode = interactionHook.checkRequest?.type === 'skill' ? 'skill' : 'dice';

  return (
    <div className="game-page-wrapper">
      <div className="game-container">
        <div className="game-main">
          <div className="game-top">
            <h2>Adventure Log</h2>
            <div className="game-info-header">
              <div>
                {settings.campaignGoal && (
                  <p><strong>Quest:</strong> <span style={{ color: 'var(--text-secondary)', fontWeight: 'bold' }}>{settings.campaignGoal}</span></p>
                )}
                <p><strong>Location:</strong> {townName 
                  ? `${townName} (${mapHook.townPlayerPosition?.x}, ${mapHook.townPlayerPosition?.y})`
                  : `(${mapHook.playerPosition.x}, ${mapHook.playerPosition.y}) - ${currentBiome}`
                }</p>
              </div>
              <div className="header-button-group">
                <button onClick={() => mapHook.setIsMapModalOpen(true)} className="view-map-button">{townName ? `View ${townName} Map` : 'View Map'}</button>
                <button onClick={() => setIsInventoryModalOpen(true)} className="view-settings-button">📦 Inventory</button>
                <button onClick={() => setIsHowToPlayModalOpen(true)} className="how-to-play-button">How to Play</button>
                <button onClick={() => setIsSettingsModalOpen(true)} className="view-settings-button">View Full Settings</button>
                <button
                  onClick={() => performSave()}
                  className="manual-save-button"
                  disabled={!sessionId}
                >
                  💾 Save Now
                </button>
              </div>
            </div>
          </div>

          <div className="conversation">
            {!hasAdventureStarted && !interactionHook.isLoading && (
              <div className="start-adventure-overlay">
                <button onClick={interactionHook.handleStartAdventure} className="start-adventure-button">
                  Start the Adventure!
                </button>
              </div>
            )}

            {interactionHook.conversation.map((msg, index) => (
              <p key={index} className={`message ${msg.role}`}>
                {msg.content}
              </p>
            ))}
            {interactionHook.isLoading && <p className="message system">AI is thinking...</p>}
            {interactionHook.error && <p className="message error">{interactionHook.error}</p>}
          </div>

          <div className="game-lower-section">
            <form onSubmit={interactionHook.handleSubmit}>
              <textarea
                value={interactionHook.userInput}
                onChange={interactionHook.handleInputChange}
                placeholder={hasAdventureStarted ? "Type your action..." : "Click 'Start Adventure' above..."}
                rows="4"
                className="user-input"
                disabled={!hasAdventureStarted || interactionHook.isLoading}
              />
              <button
                type="submit"
                className="game-send-button"
                disabled={!hasAdventureStarted || !interactionHook.userInput.trim() || interactionHook.isLoading}
              >
                {interactionHook.isLoading ? '...' : '↑ Send'}
              </button>
            </form>
            <p className="info">AI responses may not always be accurate or coherent.</p>
            <div className="model-info-text">
              <span className="model-label">Active Model:</span>
              <span className="model-value">{selectedModel} ({selectedProvider.toUpperCase()})</span>
            </div>
            <div className="status-bar">
              <p className="session-info">Session ID: {sessionId || 'Generating...'}</p>
              <div className="api-key-status">
                <span
                  className={`status-light ${['codex', 'claude-cli', 'gemini-cli'].includes(selectedProvider)
                    ? 'status-cli'
                    : (apiKeys[selectedProvider] ? 'status-active' : 'status-inactive')
                    }`}
                  title={
                    ['codex', 'claude-cli', 'gemini-cli'].includes(selectedProvider)
                      ? `${selectedProvider} is a CLI tool (No API Key required)`
                      : (apiKeys[selectedProvider] ? `${selectedProvider} API key is set` : `${selectedProvider} API key is missing`)
                  }
                ></span>
                <span className="status-text">
                  {['codex', 'claude-cli', 'gemini-cli'].includes(selectedProvider)
                    ? 'CLI Mode'
                    : (apiKeys[selectedProvider] ? 'API Key: Set' : 'API Key: Missing')}
                </span>
              </div>
            </div>
            <button
              onClick={() => setShowDebugInfo(!showDebugInfo)}
              className="debug-toggle-button"
            >
              {showDebugInfo ? '🐛 Hide Debug' : '🐛 Show Debug'}
            </button>

            {showDebugInfo && (
              <div className="debug-info-box">
                <h4>Debug Information</h4>
                <div className="debug-section">
                  <strong>Stats:</strong>
                  <pre>Session: {sessionIdRef.current}</pre>
                  <pre>Map: {mapHook.worldMap ? 'Loaded' : 'No'}</pre>
                </div>
                <div className="debug-section" style={{ marginTop: '10px' }}>
                  <strong>Last Sent Prompt:</strong>
                  <pre className="debug-prompt-pre">
                    {interactionHook.lastPrompt || 'No prompt sent yet.'}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="party-bar">
          <h2>Party Members</h2>
          {selectedHeroes && selectedHeroes.length > 0 ? (
            selectedHeroes.map(hero => (
              <div key={hero.characterId || hero.characterName} className="party-member">
                {hero.profilePicture && (
                  <img
                    src={hero.profilePicture}
                    alt={`${hero.characterName}'s profile`}
                    onClick={() => {
                      setSelectedHeroForModal(hero);
                      setIsCharacterModalOpen(true);
                    }}
                  />
                )}
                <h3>{hero.characterName}</h3>
                <p>Level {hero.characterLevel} {hero.characterRace} {hero.characterClass}</p>
                
                {/* HP Bar */}
                {hero.maxHP && (
                  <div style={{ margin: '10px 0', padding: '8px', background: 'var(--surface-light)', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 'bold' }}>HP:</span>
                      <span style={{ color: getHPStatus(hero.currentHP, hero.maxHP).color, fontWeight: 'bold' }}>
                        {hero.currentHP}/{hero.maxHP}
                      </span>
                    </div>
                    <div style={{ 
                      width: '100%', 
                      height: '12px', 
                      background: 'var(--border)', 
                      borderRadius: '6px', 
                      overflow: 'hidden',
                      border: '1px solid var(--border)'
                    }}>
                      <div style={{ 
                        width: `${(hero.currentHP / hero.maxHP) * 100}%`, 
                        height: '100%', 
                        background: getHPStatus(hero.currentHP, hero.maxHP).color,
                        transition: 'width 0.5s ease'
                      }} />
                    </div>
                    {hero.currentHP <= hero.maxHP * 0.25 && hero.currentHP > 0 && (
                      <div style={{ fontSize: '10px', color: '#e74c3c', marginTop: '4px', fontStyle: 'italic' }}>
                        {getHPStatus(hero.currentHP, hero.maxHP).description}
                      </div>
                    )}
                    {hero.currentHP === 0 && (
                      <div style={{ fontSize: '10px', color: '#e74c3c', marginTop: '4px', fontWeight: 'bold' }}>
                        💀 DEFEATED
                      </div>
                    )}
                  </div>
                )}
                
                <div style={{ textAlign: 'center', marginTop: '5px' }}>
                  <button
                    className="view-details-btn"
                    onClick={() => {
                      setSelectedHeroForModal(hero);
                      setIsCharacterModalOpen(true);
                    }}
                  >
                    View Details
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p>No heroes selected.</p>
          )}
        </div>
      </div>

      {/* --- Modals --- */}
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

      {/* AI Assistant Panel */}
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
        onTownTileClick={(x, y) => handleTownTileClick(x, y)}
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
        onResolve={(result) => {
          console.log('[ENCOUNTER] Resolved:', result);
          
          // Apply rewards to character if any
          if (result?.rewards && selectedHeroes.length > 0) {
            let updatedHero = { ...selectedHeroes[0] };
            const rewards = result.rewards;
            let rewardMessages = [];
            
            // Award XP
            if (rewards.xp > 0) {
              const xpResult = awardXP(updatedHero, rewards.xp);
              updatedHero = xpResult.character;
              rewardMessages.push(`+${rewards.xp} XP`);
              
              if (xpResult.leveledUp) {
                const summary = getLevelUpSummary(xpResult.previousLevel, xpResult.newLevel, updatedHero);
                rewardMessages.push(`🎉 LEVEL UP! Now level ${summary.newLevel}!`);
              }
            }
            
            // Award gold
            if (rewards.gold > 0) {
              updatedHero = addGold(updatedHero, rewards.gold);
              rewardMessages.push(`+${rewards.gold} gold`);
            }
            
            // Award items
            if (rewards.items && rewards.items.length > 0) {
              for (const itemName of rewards.items) {
                const itemKey = itemName.replace(/ /g, '_').toLowerCase();
                updatedHero = {
                  ...updatedHero,
                  inventory: addItem(updatedHero.inventory || [], itemKey)
                };
              }
              rewardMessages.push(`Found: ${rewards.items.join(', ')}`);
            }
            
            // Update hero state
            handleHeroUpdate(updatedHero);
            
            // Log rewards
            if (rewardMessages.length > 0) {
              console.log('[PROGRESSION] Rewards applied:', rewardMessages.join(', '));
            }
          }
          
          // Add encounter outcome to conversation
          if (result?.narration) {
            const encounterMsg = { role: 'ai', content: `⚔️ **${actionEncounter?.name || 'Encounter'}**: ${result.narration}` };
            interactionHook.setConversation(prev => [...prev, encounterMsg]);
          }
          setIsActionEncounterOpen(false);
          setActionEncounter(null);
        }}
        onCharacterUpdate={handleHeroUpdate}
      />
      {/* Inventory Modal */}
      {isInventoryModalOpen && (
        <div className="modal-overlay" onClick={() => setIsInventoryModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <h2 style={{ marginBottom: '20px' }}>Party Inventory</h2>
            
            {/* Gold */}
            <div style={{ 
              padding: '15px', 
              background: 'linear-gradient(135deg, #f39c12 0%, #e67e22 100%)', 
              borderRadius: '8px', 
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span style={{ fontSize: '32px' }}>💰</span>
              <div>
                <div style={{ fontSize: '12px', opacity: 0.9 }}>Gold Pieces</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                  {selectedHeroes.reduce((sum, h) => sum + (h.gold || 0), 0)} GP
                </div>
              </div>
            </div>
            
            {/* Items */}
            <h3 style={{ marginBottom: '10px' }}>Items</h3>
            <div style={{ 
              background: 'var(--surface)', 
              borderRadius: '8px', 
              padding: '15px',
              minHeight: '100px'
            }}>
              {(() => {
                const allItems = selectedHeroes.flatMap(h => h.inventory || []);
                if (allItems.length === 0) {
                  return <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No items yet. Complete encounters to find loot!</p>;
                }
                // Group items by key, summing quantities
                const itemMap = {};
                for (const item of allItems) {
                  const key = typeof item === 'string' ? item : (item.key || 'unknown');
                  // Look up in ITEM_CATALOG for proper name, fallback to item.name or formatted key
                  const catalogEntry = ITEM_CATALOG[key];
                  const name = catalogEntry?.name || item.name || key.replace(/_/g, ' ');
                  const qty = item.quantity || 1;
                  const rarity = catalogEntry?.rarity || item.rarity || 'common';
                  if (itemMap[key]) {
                    itemMap[key].quantity += qty;
                  } else {
                    itemMap[key] = { name, quantity: qty, rarity };
                  }
                }
                const rarityColors = { common: '#9d9d9d', uncommon: '#1eff00', rare: '#0070dd', very_rare: '#a335ee', legendary: '#ff8000' };
                return (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {Object.entries(itemMap).map(([key, { name, quantity, rarity }]) => (
                      <div key={key} style={{
                        padding: '8px 12px',
                        background: 'var(--surface-light)',
                        borderRadius: '4px',
                        border: `1px solid ${rarityColors[rarity] || rarityColors.common}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <span style={{ color: rarityColors[rarity] || rarityColors.common }}>{name}</span>
                        {quantity > 1 && <span style={{ 
                          background: 'var(--primary)', 
                          color: 'white', 
                          borderRadius: '50%', 
                          width: '20px', 
                          height: '20px', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          fontSize: '12px'
                        }}>x{quantity}</span>}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
            
            <button 
              onClick={() => setIsInventoryModalOpen(false)}
              style={{
                marginTop: '20px',
                padding: '10px 20px',
                background: 'var(--primary)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                width: '100%'
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
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
    </div>
  );
};

export default Game;
