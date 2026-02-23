/**
 * useGameSession — session ID management and auto-save.
 *
 * Ported from src/hooks/useGameSession.js (101 lines).
 * Uses Zustand game-store (replacing local state).
 * Uses TanStack Query useSaveConversation (replacing direct fetch).
 * Uses Zustand settings-store (replacing SettingsContext).
 */

import { useCallback, useEffect, useRef } from "react";

import type { EncounterHistoryEntry, HeroMechanicalState } from "@/stores/game-store";
import type { Character } from "@dungeongpt/shared";

import { useConversation, useSaveConversation } from "@/api/client";
import { useGameStore } from "@/stores/game-store";
import { useSettingsStore } from "@/stores/settings-store";

// ── Constants ───────────────────────────────────────────────────────────────

const AUTO_SAVE_INTERVAL_MS = 30_000;

/** Extract hero states and encounter history from sub_maps if saved. */
function hydrateGameplayState(
  subMaps: Record<string, unknown> | null | undefined,
  heroes: readonly Character[] | null | undefined,
  setHeroStatesFn: (states: Record<string, HeroMechanicalState>) => void,
  initHeroStatesFn: (heroes: readonly Character[]) => void,
  setEncounterHistoryFn: (history: readonly EncounterHistoryEntry[]) => void,
) {
  const rawSubMaps = subMaps as Record<string, unknown> | undefined;
  const savedHeroStates = rawSubMaps?.["heroStates"] as Record<string, unknown> | undefined;
  const savedEncounterHistory = rawSubMaps?.["encounterHistory"] as unknown[] | undefined;

  if (savedHeroStates && typeof savedHeroStates === "object" && Object.keys(savedHeroStates).length > 0) {
    setHeroStatesFn(savedHeroStates as Record<string, HeroMechanicalState>);
  } else if (heroes && heroes.length > 0) {
    initHeroStatesFn(heroes);
  }

  if (Array.isArray(savedEncounterHistory) && savedEncounterHistory.length > 0) {
    setEncounterHistoryFn(savedEncounterHistory as EncounterHistoryEntry[]);
  }
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useGameSession() {
  const sessionId = useGameStore((s) => s.sessionId);
  const setSessionId = useGameStore((s) => s.setSessionId);
  const hasAdventureStarted = useGameStore((s) => s.hasAdventureStarted);
  const setHasAdventureStarted = useGameStore(
    (s) => s.setHasAdventureStarted,
  );
  const conversation = useGameStore((s) => s.conversation);
  const currentSummary = useGameStore((s) => s.currentSummary);
  const selectedHeroes = useGameStore((s) => s.selectedHeroes);
  const worldMap = useGameStore((s) => s.worldMap);
  const playerPosition = useGameStore((s) => s.playerPosition);
  const subMaps = useGameStore((s) => s.subMaps);
  const setConversation = useGameStore((s) => s.setConversation);
  const setCurrentSummary = useGameStore((s) => s.setCurrentSummary);
  const setSelectedHeroes = useGameStore((s) => s.setSelectedHeroes);
  const setWorldMap = useGameStore((s) => s.setWorldMap);
  const setPlayerPosition = useGameStore((s) => s.setPlayerPosition);
  const setSubMaps = useGameStore((s) => s.setSubMaps);

  const settings = useSettingsStore((s) => s.settings);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const selectedProvider = useSettingsStore((s) => s.selectedProvider);
  const selectedModel = useSettingsStore((s) => s.selectedModel);
  const setSelectedProvider = useSettingsStore((s) => s.setSelectedProvider);
  const setSelectedModel = useSettingsStore((s) => s.setSelectedModel);

  const heroStates = useGameStore((s) => s.heroStates);
  const encounterHistory = useGameStore((s) => s.encounterHistory);
  const setHeroStates = useGameStore((s) => s.setHeroStates);
  const setEncounterHistory = useGameStore((s) => s.setEncounterHistory);
  const initializeHeroStates = useGameStore((s) => s.initializeHeroStates);

  const saveConversation = useSaveConversation();

  // Load conversation from server if we have a sessionId but no conversation data
  const { data: loadedConversation } = useConversation(
    sessionId && conversation.length === 0 ? sessionId : null,
  );

  // Restore data from loaded conversation
  useEffect(() => {
    if (!loadedConversation) return;

    if (loadedConversation.conversation_data.length > 0) {
      setConversation(loadedConversation.conversation_data);
    }

    if (loadedConversation.summary) {
      setCurrentSummary(loadedConversation.summary);
    }

    if (loadedConversation.selected_heroes) {
      setSelectedHeroes(loadedConversation.selected_heroes);
    }

    if (loadedConversation.world_map) {
      setWorldMap(loadedConversation.world_map);
    }

    if (loadedConversation.player_position) {
      setPlayerPosition(loadedConversation.player_position);
    }

    if (loadedConversation.sub_maps) {
      setSubMaps(loadedConversation.sub_maps);
    }

    if (loadedConversation.game_settings) {
      setSettings(loadedConversation.game_settings);
    }

    if (loadedConversation.provider) {
      setSelectedProvider(loadedConversation.provider);
    }

    if (loadedConversation.model) {
      setSelectedModel(loadedConversation.model);
    }

    // Restore hero mechanical states (backward compat: initialize from heroes if missing)
    hydrateGameplayState(
      loadedConversation.sub_maps as Record<string, unknown> | null | undefined,
      loadedConversation.selected_heroes,
      setHeroStates,
      initializeHeroStates,
      setEncounterHistory,
    );

    // Determine if adventure has started
    const hasAI = loadedConversation.conversation_data.some(
      (msg) => msg.role === "ai",
    );
    if (hasAI) {
      setHasAdventureStarted(true);
    }
  }, [
    loadedConversation,
    setConversation,
    setCurrentSummary,
    setSelectedHeroes,
    setWorldMap,
    setPlayerPosition,
    setSubMaps,
    setSettings,
    setSelectedProvider,
    setSelectedModel,
    setHasAdventureStarted,
    setHeroStates,
    setEncounterHistory,
    initializeHeroStates,
  ]);

  // Initialize session ID if none exists
  useEffect(() => {
    if (!sessionId) {
      try {
        const stored = globalThis.localStorage.getItem("activeGameSessionId");
        if (stored) {
          setSessionId(stored);
          return;
        }
      } catch {
        // Ignore
      }
      const newId = `game-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      setSessionId(newId);
      try {
        globalThis.localStorage.setItem("activeGameSessionId", newId);
      } catch {
        // Ignore
      }
    }
  }, [sessionId, setSessionId]);

  /** Save the current game state to the backend. */
  const saveGame = useCallback(() => {
    if (!sessionId || conversation.length === 0) return;

    // Merge heroStates and encounterHistory into subMaps for persistence
    const enrichedSubMaps: Record<string, unknown> = {
      ...(subMaps as Record<string, unknown> | null),
      heroStates,
      encounterHistory: [...encounterHistory],
    };

    saveConversation.mutate({
      sessionId,
      conversation: [...conversation],
      provider: selectedProvider,
      model: selectedModel,
      timestamp: new Date().toISOString(),
      conversationName: `Adventure - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
      gameSettings: settings,
      selectedHeroes: [...selectedHeroes],
      currentSummary,
      worldMap,
      playerPosition,
      subMaps: enrichedSubMaps,
      hasAdventureStarted,
    });
  }, [
    sessionId,
    conversation,
    selectedProvider,
    selectedModel,
    settings,
    selectedHeroes,
    currentSummary,
    worldMap,
    playerPosition,
    subMaps,
    heroStates,
    encounterHistory,
    hasAdventureStarted,
    saveConversation,
  ]);

  // Auto-save on interval (ported from Game.js 30-second auto-save)
  const saveGameRef = useRef(saveGame);
  saveGameRef.current = saveGame;

  useEffect(() => {
    if (!hasAdventureStarted) return;
    const interval = globalThis.setInterval(() => {
      saveGameRef.current();
    }, AUTO_SAVE_INTERVAL_MS);
    return () => {
      globalThis.clearInterval(interval);
    };
  }, [hasAdventureStarted]);

  return { saveGame };
}
