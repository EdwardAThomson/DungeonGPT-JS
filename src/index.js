import React from 'react';
import ReactDOM from 'react-dom/client';  // Correct import for React 18+
import './index.css';
import App from './App';
import { SettingsProvider } from "./contexts/SettingsContext";
import { CharacterProvider } from './contexts/CharacterContext';
import { ApiKeysProvider } from "./contexts/ApiKeysContext"; // New context


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
