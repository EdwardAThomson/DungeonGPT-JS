import React, { useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import ApiKeysContext from '../contexts/ApiKeysContext';
import SettingsContext from "../contexts/SettingsContext";
import { SettingsModalContent, HowToPlayModalContent } from '../components/Modals';
import MapModal from '../components/MapModal';
import EncounterModal from '../components/EncounterModal';
import DiceRoller from '../components/DiceRoller';
import useGameSession from '../hooks/useGameSession';
import useGameMap from '../hooks/useGameMap';
import useGameInteraction from '../hooks/useGameInteraction';
import { getTile } from '../utils/mapGenerator';
import AiAssistantPanel from '../components/AiAssistantPanel';
import CharacterModal from '../components/CharacterModal';
import { llmService } from '../services/llmService';

const Game = () => {
  const { state } = useLocation();
  const { selectedHeroes: stateHeroes, loadedConversation, worldSeed: stateSeed } = state || { selectedHeroes: [], loadedConversation: null, worldSeed: null };
  const selectedHeroes = loadedConversation?.selected_heroes || stateHeroes || [];

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
  const [isCharacterModalOpen, setIsCharacterModalOpen] = useState(false);
  const [selectedHeroForModal, setSelectedHeroForModal] = useState(null);
  const [currentEncounter, setCurrentEncounter] = useState(null);
  const [showDebugInfo, setShowDebugInfo] = useState(false);

  // --- HOOKS ---
  const {
    sessionId,
    hasAdventureStarted,
    setHasAdventureStarted,
    saveConversationToBackend
  } = useGameSession(loadedConversation, setSettings, setSelectedProvider, setSelectedModel);

  // Pass dummy/empty functions for now where we handle logic in Game.js wrapper
  const mapHook = useGameMap(loadedConversation, hasAdventureStarted, false, () => { }, worldSeed);

  const interactionHook = useGameInteraction(
    loadedConversation,
    apiKeys,
    settings,
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
  }, [
    interactionHook.conversation, sessionId, selectedProvider, selectedModel,
    mapHook.worldMap, mapHook.playerPosition, settings,
    mapHook.currentTownMap, mapHook.townPlayerPosition, mapHook.currentTownTile,
    mapHook.isInsideTown, mapHook.townMapsCache, mapHook.currentMapLevel
  ]);

  const performSave = () => {
    if (!sessionIdRef.current) return;

    const sub_maps = {
      currentTownMap: currentTownMapRef.current,
      townPlayerPosition: townPlayerPositionRef.current,
      currentTownTile: currentTownTileRef.current,
      isInsideTown: isInsideTownRef.current,
      currentMapLevel: currentMapLevelRef.current,
      townMapsCache: townMapsCacheRef.current,
      visitedBiomes: Array.from(mapHook.visitedBiomes),
      visitedTowns: Array.from(mapHook.visitedTowns),
    };

    saveConversationToBackend(sessionIdRef.current, {
      conversation: conversationRef.current,
      provider: selectedProviderRef.current,
      model: selectedModelRef.current,
      gameSettings: settingsRef.current,
      selectedHeroes: selectedHeroes,
      currentSummary: interactionHook.currentSummary,
      worldMap: worldMapRef.current,
      playerPosition: playerPositionRef.current,
      hasAdventureStarted: hasAdventureStarted,
      sub_maps: sub_maps
    });
  };

  useEffect(() => {
    if (!sessionId || !hasAdventureStarted) return;
    const interval = setInterval(() => {
      console.log('[AUTO-SAVE]');
      performSave();
    }, 30000);
    return () => clearInterval(interval);
  }, [sessionId, hasAdventureStarted]);

  useEffect(() => {
    return () => {
      console.log('[UNMOUNT SAVE]');
      performSave();
    };
  }, []);

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

    // POI Check (for Modal)
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
    let locationInfo = `Player has moved to coordinates (${clickedX}, ${clickedY}) in a ${targetTile.biome} biome.`;
    if (targetTile.poi === 'town' && targetTile.townName) {
      locationInfo += ` The party has arrived at ${targetTile.townName}, a ${targetTile.townSize || 'settlement'}. They are standing at the edge of the town.`;
    } else if (targetTile.poi) {
      locationInfo += ` POI: ${targetTile.poi}.`;
    }
    locationInfo += ` Description seed: ${targetTile.descriptionSeed || 'Describe the area.'}`;

    const goalInfo = settings.campaignGoal ? `\nCampaign Goal: ${settings.campaignGoal}` : '';
    const milestonesInfo = settings.milestones && settings.milestones.length > 0 ? `\nKey Milestones to achieve: ${settings.milestones.join(', ')}` : '';
    const gameContext = `Setting: ${settings.shortDescription}. Mood: ${settings.grimnessLevel}.${goalInfo}${milestonesInfo}\n${locationInfo}. Party: ${partyInfo}.`;
    const prompt = `Game Context: ${gameContext}\n\nStory summary so far: ${interactionHook.currentSummary}\n\n${locationInfo}\n\nDescribe what the player sees upon arriving at this new location.`;

    try {
      const aiResponse = await llmService.generateText({
        provider: selectedProvider,
        model,
        prompt,
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
                <p><strong>Location:</strong> ({mapHook.playerPosition.x}, {mapHook.playerPosition.y}) - {currentBiome}</p>
              </div>
              <div className="header-button-group">
                <button onClick={() => mapHook.setIsMapModalOpen(true)} className="view-map-button">View Map</button>
                <button onClick={() => setIsDiceModalOpen(true)} className="view-settings-button">🎲 Roll Dice</button>
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
      <SettingsModalContent
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
        onTownTileClick={(x, y) => mapHook.handleTownTileClick(x, y, interactionHook.setConversation, interactionHook.conversation)}
        currentTile={currentTile}
        onEnterCurrentTown={() => mapHook.handleEnterCurrentTown(interactionHook.setConversation, interactionHook.conversation)}
        isInsideTown={mapHook.isInsideTown}
        hasAdventureStarted={hasAdventureStarted}
        townError={mapHook.townError}
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
