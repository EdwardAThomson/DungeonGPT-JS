import React from 'react';
import ReactDOM from 'react-dom/client';  // Correct import for React 18+
import './index.css';
import App from './App';
import { SettingsProvider } from "./contexts/SettingsContext";
import { CharacterProvider } from './contexts/CharacterContext';
import { ApiKeysProvider } from "./contexts/ApiKeysContext"; // New context

if (process.env.NODE_ENV === 'production' && process.env.REACT_APP_ENABLE_CONSOLE_LOGS !== 'true') {
  // Keep warn/error visible, suppress noisy debug logs in production.
  // eslint-disable-next-line no-console
  console.log = () => {};
  // eslint-disable-next-line no-console
  console.info = () => {};
  // eslint-disable-next-line no-console
  console.debug = () => {};
}


const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ApiKeysProvider>
      <SettingsProvider>
        <CharacterProvider>
          <App />
        </CharacterProvider>
      </SettingsProvider>
    </ApiKeysProvider>
  </React.StrictMode>
);
