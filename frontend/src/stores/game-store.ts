import { create } from "zustand";

import type { RolledEncounter } from "@/game/encounters/generator";
import type { InventoryItem } from "@/game/inventory/index";
import type {
  Character,
  ConversationMessage,
  PlayerPosition,
} from "@dungeongpt/shared";

import { initializeHP } from "@/game/health/index";
import { initializeProgression } from "@/game/progression/index";

/**
 * Check request triggered by AI response markers like [CHECK: Perception].
 * Ported from useGameInteraction.js checkRequest state.
 */
interface CheckRequest {
  readonly type: "skill";
  readonly skill: string;
}

/**
 * Progress status for LLM generation.
 * Ported from useGameInteraction.js progressStatus state.
 */
interface ProgressStatus {
  readonly status: string;
  readonly elapsed: number;
  readonly hasContent?: boolean | undefined;
}

// ── Mechanical state types ──────────────────────────────────────────────────

/** Per-hero mechanical state for gameplay tracking. */
export interface HeroMechanicalState {
  readonly currentHP: number;
  readonly maxHP: number;
  readonly xp: number;
  readonly level: number;
  readonly gold: number;
  readonly inventory: InventoryItem[];
}

/** A single entry in the encounter history log. */
export interface EncounterHistoryEntry {
  readonly name: string;
  readonly outcome: string;
  readonly heroId: string;
  readonly xpGained: number;
  readonly timestamp: number;
}

const MAX_ENCOUNTER_HISTORY = 20;

/**
 * Game session state — client-side game state managed by Zustand.
 *
 * Ported from:
 *   - useGameSession.js: sessionId, hasAdventureStarted
 *   - useGameInteraction.js: conversation, currentSummary, isLoading,
 *     progressStatus, error, checkRequest, userInput, lastPrompt
 *
 * Server state (characters, saved conversations) lives in TanStack Query.
 * This store holds the ephemeral game session state that changes during gameplay.
 */
interface GameState {
  /** Current game session ID */
  readonly sessionId: string | null;

  /** Whether the adventure has been started (first AI response received) */
  readonly hasAdventureStarted: boolean;

  /** Conversation message history for the current session */
  readonly conversation: readonly ConversationMessage[];

  /** Rolling summary of the conversation for context window management */
  readonly currentSummary: string;

  /** Currently selected hero characters for the party */
  readonly selectedHeroes: readonly Character[];

  /** Player position on the world map */
  readonly playerPosition: PlayerPosition;

  /** World map data (complex runtime object, typed as unknown) */
  readonly worldMap: unknown;

  /** Sub-map state (town maps, visited locations, encounter tracking) */
  readonly subMaps: unknown;

  /** Whether an AI request is in progress */
  readonly isLoading: boolean;

  /** Progress status during LLM generation */
  readonly progressStatus: ProgressStatus | null;

  /** Error message from the last failed operation */
  readonly error: string | null;

  /** Pending check/roll request triggered by AI response */
  readonly checkRequest: CheckRequest | null;

  /** Current user input text */
  readonly userInput: string;

  /** Last prompt sent to the AI (for debugging) */
  readonly lastPrompt: string;

  /** Per-hero mechanical state (HP, XP, gold, inventory) keyed by characterId */
  readonly heroStates: Record<string, HeroMechanicalState>;

  /** Recent encounter history (capped at 20) */
  readonly encounterHistory: readonly EncounterHistoryEntry[];

  /** Number of map moves since the last encounter */
  readonly movesSinceEncounter: number;

  /** Currently active encounter (null when no encounter in progress) */
  readonly activeEncounter: RolledEncounter | null;
}

interface GameActions {
  readonly setSessionId: (id: string | null) => void;
  readonly setHasAdventureStarted: (started: boolean) => void;
  readonly setConversation: (
    messages:
      | readonly ConversationMessage[]
      | ((
          previous: readonly ConversationMessage[],
        ) => readonly ConversationMessage[]),
  ) => void;
  readonly addMessage: (message: ConversationMessage) => void;
  readonly setCurrentSummary: (summary: string) => void;
  readonly setSelectedHeroes: (heroes: readonly Character[]) => void;
  readonly setPlayerPosition: (position: PlayerPosition) => void;
  readonly setWorldMap: (map: unknown) => void;
  readonly setSubMaps: (subMaps: unknown) => void;
  readonly setIsLoading: (loading: boolean) => void;
  readonly setProgressStatus: (status: ProgressStatus | null) => void;
  readonly setError: (error: string | null) => void;
  readonly setCheckRequest: (request: CheckRequest | null) => void;
  readonly setUserInput: (input: string) => void;
  readonly setLastPrompt: (prompt: string) => void;
  readonly resetSession: () => void;

  /** Initialize hero mechanical states from character data. */
  readonly initializeHeroStates: (heroes: readonly Character[]) => void;
  /** Partially update a single hero's mechanical state. */
  readonly updateHeroState: (heroId: string, partial: Partial<HeroMechanicalState>) => void;
  /** Set heroStates directly (used for save/load hydration). */
  readonly setHeroStates: (states: Record<string, HeroMechanicalState>) => void;

  /** Add an entry to encounter history (auto-caps at 20). */
  readonly addEncounterHistoryEntry: (entry: EncounterHistoryEntry) => void;
  /** Increment the moves-since-encounter counter. */
  readonly incrementMovesSinceEncounter: () => void;
  /** Reset the moves-since-encounter counter to 0. */
  readonly resetMovesSinceEncounter: () => void;
  /** Set the currently active encounter. */
  readonly setActiveEncounter: (encounter: RolledEncounter | null) => void;
  /** Set encounter history directly (used for save/load hydration). */
  readonly setEncounterHistory: (history: readonly EncounterHistoryEntry[]) => void;
}

type GameStore = GameState & GameActions;

const initialState: GameState = {
  sessionId: null,
  hasAdventureStarted: false,
  conversation: [],
  currentSummary: "",
  selectedHeroes: [],
  playerPosition: { x: 0, y: 0 },
  worldMap: null,
  subMaps: null,
  isLoading: false,
  progressStatus: null,
  error: null,
  checkRequest: null,
  userInput: "",
  lastPrompt: "",
  heroStates: {},
  encounterHistory: [],
  movesSinceEncounter: 0,
  activeEncounter: null,
};

export const useGameStore = create<GameStore>()((set) => ({
  ...initialState,

  setSessionId: (id) => {
    set({ sessionId: id });
  },
  setHasAdventureStarted: (started) => {
    set({ hasAdventureStarted: started });
  },
  setConversation: (messages) => {
    set((state) => ({
      conversation:
        typeof messages === "function"
          ? messages(state.conversation)
          : messages,
    }));
  },
  addMessage: (message) => {
    set((state) => ({
      conversation: [...state.conversation, message],
    }));
  },
  setCurrentSummary: (summary) => {
    set({ currentSummary: summary });
  },
  setSelectedHeroes: (heroes) => {
    set({ selectedHeroes: heroes });
  },
  setPlayerPosition: (position) => {
    set({ playerPosition: position });
  },
  setWorldMap: (map) => {
    set({ worldMap: map });
  },
  setSubMaps: (subMaps) => {
    set({ subMaps });
  },
  setIsLoading: (loading) => {
    set({ isLoading: loading });
  },
  setProgressStatus: (status) => {
    set({ progressStatus: status });
  },
  setError: (error) => {
    set({ error });
  },
  setCheckRequest: (request) => {
    set({ checkRequest: request });
  },
  setUserInput: (input) => {
    set({ userInput: input });
  },
  setLastPrompt: (prompt) => {
    set({ lastPrompt: prompt });
  },
  resetSession: () => {
    set(initialState);
  },

  // ── Hero mechanical state actions ──────────────────────────────────────

  initializeHeroStates: (heroes) => {
    const states: Record<string, HeroMechanicalState> = {};
    for (const hero of heroes) {
      const id = hero.characterId;
      const withHP = initializeHP(hero);
      const withProg = initializeProgression(hero);
      states[id] = {
        currentHP: withHP.currentHP,
        maxHP: withHP.maxHP,
        xp: withProg.xp ?? 0,
        level: withProg.level ?? 1,
        gold: withProg.gold ?? 0,
        inventory: [],
      };
    }
    set({ heroStates: states });
  },

  updateHeroState: (heroId, partial) => {
    set((state) => {
      const existing = state.heroStates[heroId];
      if (!existing) return state;
      return {
        heroStates: {
          ...state.heroStates,
          [heroId]: { ...existing, ...partial },
        },
      };
    });
  },

  setHeroStates: (states) => {
    set({ heroStates: states });
  },

  // ── Encounter tracking actions ─────────────────────────────────────────

  addEncounterHistoryEntry: (entry) => {
    set((state) => ({
      encounterHistory: [
        ...state.encounterHistory,
        entry,
      ].slice(-MAX_ENCOUNTER_HISTORY),
    }));
  },

  incrementMovesSinceEncounter: () => {
    set((state) => ({
      movesSinceEncounter: state.movesSinceEncounter + 1,
    }));
  },

  resetMovesSinceEncounter: () => {
    set({ movesSinceEncounter: 0 });
  },

  setActiveEncounter: (encounter) => {
    set({ activeEncounter: encounter });
  },

  setEncounterHistory: (history) => {
    set({ encounterHistory: history });
  },
}));
