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
});

// Per-viewer display preference: storage can be blocked (private windows), so every
// read/write is guarded and the default (gridlines on) stands in.
const readMapGrid = () => {
  try { return localStorage.getItem('dgpt:showMapGrid') !== 'false'; } catch (e) { return true; }
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
      setShowMapGrid
    }}>
      {children}
    </SettingsContext.Provider>
  );
};

export default SettingsContext;
