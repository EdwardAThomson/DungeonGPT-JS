import React, { createContext, useState } from 'react';

// Create the context with a default structure
const ApiKeysContext = createContext({
  apiKeys: { openai: '', gemini: '', claude: '' },
  setApiKeys: () => {},
});

// Create a provider component
export const ApiKeysProvider = ({ children }) => {
  const [apiKeys, setApiKeysState] = useState({ openai: '', gemini: '', claude: '' });

  // Function to update specific or multiple keys
  const setApiKeys = (newKeys) => {
    setApiKeysState(prevKeys => ({ ...prevKeys, ...newKeys }));
  };

  return (
    <ApiKeysContext.Provider value={{ apiKeys, setApiKeys }}>
      {children}
    </ApiKeysContext.Provider>
  );
};

export default ApiKeysContext; 