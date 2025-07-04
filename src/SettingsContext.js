import { createContext, useState } from "react";

const SettingsContext = createContext({
  settings: {},
  setSettings: () => {},
  selectedProvider: 'openai', // Default provider
  setSelectedProvider: () => {},
});

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState({});
  const [selectedProvider, setSelectedProvider] = useState('openai'); // Default to OpenAI

  return (
    <SettingsContext.Provider value={{ settings, setSettings, selectedProvider, setSelectedProvider }}>
      {children}
    </SettingsContext.Provider>
  );
};

export default SettingsContext;
