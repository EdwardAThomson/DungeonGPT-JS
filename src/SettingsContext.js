import { createContext, useState } from "react";

const SettingsContext = createContext({
  settings: {},
  setSettings: () => {},
  selectedProvider: '', // No default provider - must be selected
  setSelectedProvider: () => {},
  selectedModel: '', // No default model - must be selected
  setSelectedModel: () => {},
});

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState({});
  const [selectedProvider, setSelectedProvider] = useState(''); // No default - must be selected
  const [selectedModel, setSelectedModel] = useState(''); // No default - must be selected

  return (
    <SettingsContext.Provider value={{ 
      settings, 
      setSettings, 
      selectedProvider, 
      setSelectedProvider,
      selectedModel,
      setSelectedModel
    }}>
      {children}
    </SettingsContext.Provider>
  );
};

export default SettingsContext;
