import React from 'react';
import ReactDOM from 'react-dom/client';  // Correct import for React 18+
import './index.css';
import App from './App';
import { SettingsProvider } from "./SettingsContext";
import { CharacterProvider } from './CharacterContext';
import { ApiKeysProvider } from "./ApiKeysContext"; // New context


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
