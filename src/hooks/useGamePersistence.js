import { useCallback, useEffect, useRef } from 'react';
import { buildSaveFingerprint, buildSubMapsPayload } from '../game/saveController';

const useGamePersistence = ({
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
}) => {
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
  const currentSummaryRef = useRef(interactionHook.currentSummary);
  const visitedBiomesRef = useRef(mapHook.visitedBiomes);
  const visitedTownsRef = useRef(mapHook.visitedTowns);
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
    currentSummaryRef.current = interactionHook.currentSummary;
    visitedBiomesRef.current = mapHook.visitedBiomes;
    visitedTownsRef.current = mapHook.visitedTowns;
  }, [
    interactionHook.conversation,
    interactionHook.currentSummary,
    sessionId,
    selectedProvider,
    selectedModel,
    mapHook.worldMap,
    mapHook.playerPosition,
    settings,
    mapHook.currentTownMap,
    mapHook.townPlayerPosition,
    mapHook.currentTownTile,
    mapHook.isInsideTown,
    mapHook.townMapsCache,
    mapHook.currentMapLevel,
    mapHook.visitedBiomes,
    mapHook.visitedTowns,
    hasAdventureStarted,
    selectedHeroes,
    movesSinceEncounter
  ]);

  const performSave = useCallback((isUnmount = false) => {
    if (!sessionIdRef.current) return;

    if (!hasAdventureStartedRef.current) {
      if (isUnmount) logger.debug('Skipping unmount save - adventure not started');
      return;
    }

    const convo = conversationRef.current;
    if (!convo || convo.length === 0) {
      if (isUnmount) logger.debug('Skipping unmount save - no conversation data');
      return;
    }

    const currentSettings = settingsRef.current;
    if (loadedConversation?.game_settings && (!currentSettings || Object.keys(currentSettings).length === 0)) {
      logger.debug('Skipping save - settings not yet restored from loaded conversation');
      return;
    }

    const fingerprint = buildSaveFingerprint({
      conversation: convo,
      playerPosition: playerPositionRef.current,
      townPlayerPosition: townPlayerPositionRef.current,
      currentMapLevel: currentMapLevelRef.current,
      isInsideTown: isInsideTownRef.current,
      currentSummary: currentSummaryRef.current,
      settings: settingsRef.current,
      selectedHeroes: selectedHeroesRef.current
    });

    if (!isUnmount && fingerprint === lastSaveFingerprintRef.current) {
      logger.debug('No changes detected, skipping auto-save');
      return;
    }

    const sub_maps = buildSubMapsPayload({
      currentTownMap: currentTownMapRef.current,
      townPlayerPosition: townPlayerPositionRef.current,
      currentTownTile: currentTownTileRef.current,
      isInsideTown: isInsideTownRef.current,
      currentMapLevel: currentMapLevelRef.current,
      townMapsCache: townMapsCacheRef.current,
      visitedBiomes: visitedBiomesRef.current,
      visitedTowns: visitedTownsRef.current,
      movesSinceEncounter: movesSinceEncounterRef.current
    });

    saveConversationToBackend(sessionIdRef.current, {
      conversation: conversationRef.current,
      provider: selectedProviderRef.current,
      model: selectedModelRef.current,
      gameSettings: settingsRef.current,
      selectedHeroes: selectedHeroesRef.current,
      currentSummary: currentSummaryRef.current,
      worldMap: worldMapRef.current,
      playerPosition: playerPositionRef.current,
      hasAdventureStarted: hasAdventureStartedRef.current,
      sub_maps
    });

    lastSaveFingerprintRef.current = fingerprint;
  }, [loadedConversation?.game_settings, logger, saveConversationToBackend]);

  useEffect(() => {
    if (!sessionId || !hasAdventureStarted) return;
    const interval = setInterval(() => {
      performSave();
    }, 30000);
    return () => clearInterval(interval);
  }, [performSave, sessionId, hasAdventureStarted]);

  useEffect(() => {
    return () => {
      logger.debug('Unmount save triggered');
      performSave(true);
    };
  }, [performSave, logger]);

  return {
    performSave
  };
};

export default useGamePersistence;
