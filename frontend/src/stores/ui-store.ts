import { create } from "zustand";

/**
 * UI state store — modals, sidebar visibility, loading states.
 *
 * Ported from:
 *   - SettingsContext.js: isSettingsModalOpen
 *   - Game.js: various modal and sidebar toggles
 *
 * Theme state is handled by ThemeProvider (React context),
 * not duplicated here.
 */
interface UiState {
  /** Whether the settings modal is open */
  readonly isSettingsModalOpen: boolean;

  /** Whether the help modal is open */
  readonly isHelpModalOpen: boolean;

  /** Whether the debug modal is open */
  readonly isDebugModalOpen: boolean;

  /** Whether the character detail modal is open */
  readonly isCharacterModalOpen: boolean;

  /** Whether the map modal is open */
  readonly isMapModalOpen: boolean;

  /** Whether the encounter modal is open */
  readonly isEncounterModalOpen: boolean;

  /** Whether the inventory modal is open */
  readonly isInventoryModalOpen: boolean;

  /** Whether the dice roller modal is open */
  readonly isDiceRollerOpen: boolean;

  /** Whether the hero sidebar is visible */
  readonly isSidebarVisible: boolean;

  /** ID of the character shown in the character modal, if any */
  readonly activeCharacterId: string | null;
}

interface UiActions {
  readonly setSettingsModalOpen: (open: boolean) => void;
  readonly setHelpModalOpen: (open: boolean) => void;
  readonly setDebugModalOpen: (open: boolean) => void;
  readonly setCharacterModalOpen: (open: boolean, characterId?: string) => void;
  readonly setMapModalOpen: (open: boolean) => void;
  readonly setEncounterModalOpen: (open: boolean) => void;
  readonly setInventoryModalOpen: (open: boolean) => void;
  readonly setDiceRollerOpen: (open: boolean) => void;
  readonly setSidebarVisible: (visible: boolean) => void;
  readonly toggleSidebar: () => void;
  readonly closeAllModals: () => void;
}

type UiStore = UiState & UiActions;

export const useUiStore = create<UiStore>()((set) => ({
  isSettingsModalOpen: false,
  isHelpModalOpen: false,
  isDebugModalOpen: false,
  isCharacterModalOpen: false,
  isMapModalOpen: false,
  isEncounterModalOpen: false,
  isInventoryModalOpen: false,
  isDiceRollerOpen: false,
  isSidebarVisible: true,
  activeCharacterId: null,

  setSettingsModalOpen: (open) => {
    set({ isSettingsModalOpen: open });
  },
  setHelpModalOpen: (open) => {
    set({ isHelpModalOpen: open });
  },
  setDebugModalOpen: (open) => {
    set({ isDebugModalOpen: open });
  },
  setCharacterModalOpen: (open, characterId) => {
    set({
      isCharacterModalOpen: open,
      activeCharacterId: characterId ?? null,
    });
  },
  setMapModalOpen: (open) => {
    set({ isMapModalOpen: open });
  },
  setEncounterModalOpen: (open) => {
    set({ isEncounterModalOpen: open });
  },
  setInventoryModalOpen: (open) => {
    set({ isInventoryModalOpen: open });
  },
  setDiceRollerOpen: (open) => {
    set({ isDiceRollerOpen: open });
  },
  setSidebarVisible: (visible) => {
    set({ isSidebarVisible: visible });
  },
  toggleSidebar: () => {
    set((state) => ({ isSidebarVisible: !state.isSidebarVisible }));
  },
  closeAllModals: () => {
    set({
      isSettingsModalOpen: false,
      isHelpModalOpen: false,
      isDebugModalOpen: false,
      isCharacterModalOpen: false,
      isMapModalOpen: false,
      isEncounterModalOpen: false,
      isInventoryModalOpen: false,
      isDiceRollerOpen: false,
      activeCharacterId: null,
    });
  },
}));
