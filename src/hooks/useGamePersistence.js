import { useCallback, useEffect, useRef, useState } from 'react';
import { buildSaveFingerprint, buildSubMapsPayload, PENDING_LOCAL_SAVE_EVENT } from '../game/saveController';

// Maps a performSave outcome to the always-present sync indicator state.
// Indicator states: 'idle' | 'saving' | 'saved' | 'local' | 'error'.
// This is the honest surfacing of the existing save ack (SAVE_SYNC_PLAN):
//   'saved'      -> 'saved'  (state reached its home store)
//   'savedLocal' -> 'local'  (account-holder fallback, pending cloud sync)
//   'forked'     -> 'error'  (rev conflict; progress preserved, but not a clean save)
//   'error'      -> 'error'  (even the local write-ahead failed)
//   'nochange'   -> keep the prior 'saved'/'local' state (a durable save is already
//                   on record); never flip to 'error' just because nothing changed
//   'skipped'    -> keep whatever we were showing (nothing was attempted)
export const deriveSaveIndicatorState = (status, prevState = 'idle') => {
  switch (status) {
    case 'saved':
      return 'saved';
    case 'savedLocal':
      return 'local';
    case 'forked':
    case 'error':
      return 'error';
    case 'nochange':
      return (prevState === 'saved' || prevState === 'local') ? prevState : 'saved';
    case 'skipped':
      return prevState;
    default:
      return prevState;
  }
};

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

  // Always-present sync indicator: 'saving' while a write is in flight, then the
  // resolved state. Fed by BOTH manual saves and every autosave (30s interval and
  // the setTimeout(performSave) callers) because we track it inside the hook seam.
  const [saveStatus, setSaveStatus] = useState('idle');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  // Last RESOLVED indicator state (never 'saving'), read inside performSave without
  // making it a dependency (which would churn the 30s interval / unmount effects).
  const lastResolvedStatusRef = useRef('idle');

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
  //   'saved'      - state reached its home store (the cloud account, or this
  //                  device for a plain guest: their local save IS the save)
  //   'savedLocal' - honest fallback (SAVE_SYNC_PLAN Phase 2): an account-holder's
  //                  save landed on this device only (auth absent OR the cloud push
  //                  failed), pending cloud sync; a reconcile retry is requested
  //                  via PENDING_LOCAL_SAVE_EVENT
  //   'forked'     - rev conflict (SAVE_SYNC_PLAN Phase 3, §6.2): another device
  //                  advanced this save past our common ancestor; the local
  //                  timeline was preserved as a separate "(diverged on this
  //                  device)" save, which this session keeps saving to
  //   'nochange'   - nothing changed since the last save; short-circuits BEFORE any
  //                  write to either store
  //   'skipped'    - nothing to save yet (no session / adventure not started / no data)
  //   'error'      - even the local write-ahead failed (write-through means a cloud
  //                  failure alone is 'savedLocal', not 'error')
  const runSave = useCallback(async (isUnmount = false) => {
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
      isInsideSite: isInsideSiteRef.current,
      // Map state so a map-only change (new revealed POI, freshly cached town/site)
      // is not skipped as 'nochange' and lost.
      worldMap: worldMapRef.current,
      townMapsCache: townMapsCacheRef.current,
      siteMapsCache: siteMapsCacheRef.current
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
      if (result.forked) {
        // The progress is preserved (parked save), but if the parked copy is
        // still device-only a reconcile retry is worth requesting too.
        if (result.pendingCloudSync) {
          try {
            window.dispatchEvent(new Event(PENDING_LOCAL_SAVE_EVENT));
          } catch (e) {
            logger.debug('Could not dispatch pending-local-save event', e);
          }
        }
        return 'forked';
      }
      if (result.pendingCloudSync) {
        // Ask LocalGameSync for a reconcile pass: retries the cloud push now if
        // auth is actually live (transient push failure), otherwise the pass stays
        // armed for the next auth event.
        try {
          window.dispatchEvent(new Event(PENDING_LOCAL_SAVE_EVENT));
        } catch (e) {
          logger.debug('Could not dispatch pending-local-save event', e);
        }
        return 'savedLocal';
      }
      return 'saved';
    }
    return 'error';
  }, [loadedConversation?.game_settings, logger, saveConversationToBackend]);

  // Public save entry point: runs the save and feeds the sync indicator. Returns the
  // raw performSave status string unchanged, so the manual-save modal keeps working.
  const performSave = useCallback(async (isUnmount = false) => {
    setIsSaving(true);
    setSaveStatus('saving');
    let raw = 'error';
    try {
      raw = await runSave(isUnmount);
    } finally {
      setIsSaving(false);
    }
    const next = deriveSaveIndicatorState(raw, lastResolvedStatusRef.current);
    lastResolvedStatusRef.current = next;
    setSaveStatus(next);
    if (raw === 'saved' || raw === 'savedLocal') {
      setLastSavedAt(Date.now());
    }
    return raw;
  }, [runSave]);

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
    performSave,
    saveStatus,
    isSaving,
    lastSavedAt
  };
};

export default useGamePersistence;
