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
});

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState({});
  const [selectedProvider, setSelectedProvider] = useState(defaultProvider);
  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [assistantProvider, setAssistantProvider] = useState(defaultProvider);
  const [assistantModel, setAssistantModel] = useState(defaultModel);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark-fantasy');

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
      setTheme: updateTheme
    }}>
      {children}
    </SettingsContext.Provider>
  );
};

export default SettingsContext;
