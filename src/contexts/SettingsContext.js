import { createContext, useState } from "react";
import { DEFAULT_MODELS, getDefaultProvider } from "../llm/llm_constants";

// Get environment-appropriate default provider
const defaultProvider = getDefaultProvider();
const defaultModel = DEFAULT_MODELS[defaultProvider];

const SettingsContext = createContext({
  settings: {},
  setSettings: () => { },
  selectedProvider: defaultProvider,
  setSelectedProvider: () => { },
  selectedModel: defaultModel,
  setSelectedModel: () => { },
  assistantProvider: defaultProvider,
  setAssistantProvider: () => { },
  assistantModel: defaultModel,
  setAssistantModel: () => { },
  isSettingsModalOpen: false,
  setIsSettingsModalOpen: () => { },
  theme: 'dark-fantasy',
  setTheme: () => { },
  showMapGrid: true,
  setShowMapGrid: () => { },
  classicTownArt: false,
  setClassicTownArt: () => { },
});

// Per-viewer display preference: storage can be blocked (private windows), so every
// read/write is guarded and the default (gridlines on) stands in.
const readMapGrid = () => {
  try { return localStorage.getItem('dgpt:showMapGrid') !== 'false'; } catch (e) { return true; }
};

// Town art: the 3/4 view by default; 'classic' brings back the flat tileset.
const readClassicTownArt = () => {
  try { return localStorage.getItem('dgpt:townArt') === 'classic'; } catch (e) { return false; }
};

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState({});
  const [selectedProvider, setSelectedProvider] = useState(defaultProvider);
  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [assistantProvider, setAssistantProvider] = useState(defaultProvider);
  const [assistantModel, setAssistantModel] = useState(defaultModel);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark-fantasy');
  const [showMapGrid, setShowMapGridState] = useState(readMapGrid);
  const setShowMapGrid = (on) => {
    setShowMapGridState(on);
    try { localStorage.setItem('dgpt:showMapGrid', on ? 'true' : 'false'); } catch (e) { /* in-memory only */ }
  };

  const [classicTownArt, setClassicTownArtState] = useState(readClassicTownArt);
  const setClassicTownArt = (on) => {
    setClassicTownArtState(on);
    try { localStorage.setItem('dgpt:townArt', on ? 'classic' : '3q'); } catch (e) { /* in-memory only */ }
  };

  const updateTheme = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  return (
    <SettingsContext.Provider value={{
      settings,
      setSettings,
      selectedProvider,
      setSelectedProvider,
      selectedModel,
      setSelectedModel,
      assistantProvider,
      setAssistantProvider,
      assistantModel,
      setAssistantModel,
      isSettingsModalOpen,
      setIsSettingsModalOpen,
      theme,
      setTheme: updateTheme,
      showMapGrid,
      setShowMapGrid,
      classicTownArt,
      setClassicTownArt
    }}>
      {children}
    </SettingsContext.Provider>
  );
};

export default SettingsContext;
