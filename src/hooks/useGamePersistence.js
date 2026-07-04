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
  const currentSiteMapRef = useRef(mapHook.currentSiteMap);
  const sitePlayerPositionRef = useRef(mapHook.sitePlayerPosition);
  const currentSiteTileRef = useRef(mapHook.currentSiteTile);
  const isInsideSiteRef = useRef(mapHook.isInsideSite);
  const siteMapsCacheRef = useRef(mapHook.siteMapsCache);
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
    currentSiteMapRef.current = mapHook.currentSiteMap;
    sitePlayerPositionRef.current = mapHook.sitePlayerPosition;
    currentSiteTileRef.current = mapHook.currentSiteTile;
    isInsideSiteRef.current = mapHook.isInsideSite;
    siteMapsCacheRef.current = mapHook.siteMapsCache;
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
    mapHook.currentSiteMap,
    mapHook.sitePlayerPosition,
    mapHook.currentSiteTile,
    mapHook.isInsideSite,
    mapHook.siteMapsCache,
    hasAdventureStarted,
    selectedHeroes,
    movesSinceEncounter
  ]);

  // Returns a status the caller can act on:
  //   'saved'      - state was written to its home store (cloud account, or this
  //                  device for a plain guest: their local save IS the save)
  //   'savedLocal' - honest fallback (SAVE_SYNC_PLAN Phase 1): an account-holder's
  //                  save landed on this device only, pending cloud sync
  //   'nochange'   - nothing changed since the last save (already up to date)
  //   'skipped'    - nothing to save yet (no session / adventure not started / no data)
  //   'error'      - the write was attempted and failed
  const performSave = useCallback(async (isUnmount = false) => {
    if (!sessionIdRef.current) return 'skipped';

    if (!hasAdventureStartedRef.current) {
      if (isUnmount) logger.debug('Skipping unmount save - adventure not started');
      return 'skipped';
    }

    const convo = conversationRef.current;
    if (!convo || convo.length === 0) {
      if (isUnmount) logger.debug('Skipping unmount save - no conversation data');
      return 'skipped';
    }

    const currentSettings = settingsRef.current;
    if (loadedConversation?.game_settings && (!currentSettings || Object.keys(currentSettings).length === 0)) {
      logger.debug('Skipping save - settings not yet restored from loaded conversation');
      return 'skipped';
    }

    const fingerprint = buildSaveFingerprint({
      conversation: convo,
      playerPosition: playerPositionRef.current,
      townPlayerPosition: townPlayerPositionRef.current,
      currentMapLevel: currentMapLevelRef.current,
      isInsideTown: isInsideTownRef.current,
      currentSummary: currentSummaryRef.current,
      settings: settingsRef.current,
      selectedHeroes: selectedHeroesRef.current,
      sitePlayerPosition: sitePlayerPositionRef.current,
      isInsideSite: isInsideSiteRef.current
    });

    if (!isUnmount && fingerprint === lastSaveFingerprintRef.current) {
      logger.debug('No changes detected, skipping auto-save');
      return 'nochange';
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
      movesSinceEncounter: movesSinceEncounterRef.current,
      currentSiteMap: currentSiteMapRef.current,
      sitePlayerPosition: sitePlayerPositionRef.current,
      currentSiteTile: currentSiteTileRef.current,
      isInsideSite: isInsideSiteRef.current,
      siteMapsCache: siteMapsCacheRef.current
    });

    const result = await saveConversationToBackend(sessionIdRef.current, {
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

    // Only remember the fingerprint on a successful write, so a failed save is retried
    // by the next auto-save instead of being masked as "no change".
    // saveConversationToBackend returns { ok, storage, pendingCloudSync } on success
    // (legacy `true` still counts) and false on failure.
    if (result) {
      lastSaveFingerprintRef.current = fingerprint;
      return result.pendingCloudSync ? 'savedLocal' : 'saved';
    }
    return 'error';
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
