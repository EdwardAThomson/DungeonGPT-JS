import { createContext, useState } from "react";
import { DEFAULT_MODELS } from "../llm/llm_constants";

const SettingsContext = createContext({
  settings: {},
  setSettings: () => { },
  selectedProvider: 'gemini-cli',
  setSelectedProvider: () => { },
  selectedModel: DEFAULT_MODELS['gemini-cli'],
  setSelectedModel: () => { },
  assistantProvider: 'gemini-cli',
  setAssistantProvider: () => { },
  assistantModel: DEFAULT_MODELS['gemini-cli'],
  setAssistantModel: () => { },
  isSettingsModalOpen: false,
  setIsSettingsModalOpen: () => { },
  theme: 'dark-fantasy',
  setTheme: () => { },
});

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState({});
  const [selectedProvider, setSelectedProvider] = useState('gemini-cli');
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODELS['gemini-cli']);
  const [assistantProvider, setAssistantProvider] = useState('gemini-cli');
  const [assistantModel, setAssistantModel] = useState(DEFAULT_MODELS['gemini-cli']);
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
