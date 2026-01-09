import { createContext, useState } from "react";
import { DEFAULT_MODELS } from "../llm/llm_constants";

const SettingsContext = createContext({
  settings: {},
  setSettings: () => { },
  selectedProvider: 'openai',
  setSelectedProvider: () => { },
  selectedModel: DEFAULT_MODELS['openai'],
  setSelectedModel: () => { },
  assistantProvider: 'openai',
  setAssistantProvider: () => { },
  assistantModel: DEFAULT_MODELS['openai'],
  setAssistantModel: () => { },
  isSettingsModalOpen: false,
  setIsSettingsModalOpen: () => { },
});

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState({});
  const [selectedProvider, setSelectedProvider] = useState('openai');
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODELS['openai']);
  const [assistantProvider, setAssistantProvider] = useState('openai');
  const [assistantModel, setAssistantModel] = useState(DEFAULT_MODELS['openai']);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

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
      setIsSettingsModalOpen
    }}>
      {children}
    </SettingsContext.Provider>
  );
};

export default SettingsContext;
