import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { GameSettings } from "@dungeongpt/shared";

/**
 * Settings store — game settings, AI model selection, assistant model.
 *
 * Ported from:
 *   - SettingsContext.js: settings, selectedProvider, selectedModel,
 *     assistantProvider, assistantModel
 *
 * GameSettings type imported from @dungeongpt/shared.
 * Theme is managed by ThemeProvider (context), not duplicated here.
 */
interface SettingsState {
  /** Game world settings (grimness, magic, technology, milestones, etc.) */
  readonly settings: GameSettings | null;

  /** Selected AI provider for main game narration */
  readonly selectedProvider: string;

  /** Selected AI model for main game narration */
  readonly selectedModel: string;

  /** Selected AI provider for the assistant panel */
  readonly assistantProvider: string;

  /** Selected AI model for the assistant panel */
  readonly assistantModel: string;
}

interface SettingsActions {
  readonly setSettings: (
    settings:
      | GameSettings
      | null
      | ((previous: GameSettings | null) => GameSettings | null),
  ) => void;
  readonly setSelectedProvider: (provider: string) => void;
  readonly setSelectedModel: (model: string) => void;
  readonly setAssistantProvider: (provider: string) => void;
  readonly setAssistantModel: (model: string) => void;
  readonly resetSettings: () => void;
}

type SettingsStore = SettingsState & SettingsActions;

/**
 * Default model — matches the original codebase's default model selection.
 * The original used gemini-cli as default provider with its DEFAULT_MODELS.
 * For the new backend (AI Gateway), we default to a free tier model.
 */
const DEFAULT_PROVIDER = "workers-ai";
const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

const initialState: SettingsState = {
  settings: null,
  selectedProvider: DEFAULT_PROVIDER,
  selectedModel: DEFAULT_MODEL,
  assistantProvider: DEFAULT_PROVIDER,
  assistantModel: DEFAULT_MODEL,
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...initialState,

      setSettings: (settings) => {
        set((state) => ({
          settings:
            typeof settings === "function"
              ? settings(state.settings)
              : settings,
        }));
      },
      setSelectedProvider: (provider) => {
        set({ selectedProvider: provider });
      },
      setSelectedModel: (model) => {
        set({ selectedModel: model });
      },
      setAssistantProvider: (provider) => {
        set({ assistantProvider: provider });
      },
      setAssistantModel: (model) => {
        set({ assistantModel: model });
      },
      resetSettings: () => {
        set(initialState);
      },
    }),
    {
      name: "dungeongpt-settings",
      partialize: (state) => ({
        selectedProvider: state.selectedProvider,
        selectedModel: state.selectedModel,
        assistantProvider: state.assistantProvider,
        assistantModel: state.assistantModel,
      }),
    },
  ),
);
