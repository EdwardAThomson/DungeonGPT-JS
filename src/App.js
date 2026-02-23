// App.js

import React, { useContext, Suspense, lazy } from "react";
import { BrowserRouter as Router, Route, Link, Routes, Navigate, useLocation } from "react-router-dom";
import CharacterCreation from "./pages/CharacterCreation";
import CharacterSummary from "./components/CharacterSummary";
import AllCharacters from "./pages/AllCharacters";
import HomePage from "./pages/HomePage";
import GameSettings from "./pages/GameSettings";
import HeroSelection from './pages/HeroSelection';
import Game from './pages/Game';
import SavedConversations from './pages/SavedConversations';

import "./styles/index.css";

import DebugMenu from './components/DebugMenu';
import SettingsContext from "./contexts/SettingsContext";
import { AISettingsModalContent } from "./components/Modals";
import ErrorBoundary from "./components/ErrorBoundary";
import NavDropdown from "./components/NavDropdown";

const DebugRoutes = lazy(() => import('./pages/DebugRoutes'));

const AppContent = () => {
  const location = useLocation();
  const isDebugEnabled = process.env.NODE_ENV !== 'production' || process.env.REACT_APP_ENABLE_DEBUG_ROUTES === 'true';
  const isGamePage = location.pathname === '/game';

  const {
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
    theme
  } = useContext(SettingsContext);

  return (
    <div className="App" data-theme={theme}>
      {/* Add className="main-nav" here for the nav styles */}
      <nav className="main-nav">
        <ul>
          <li><Link to="/">Home</Link></li>
          <NavDropdown 
            label="Characters" 
            items={[
              { label: "Create New Character", path: "/character-creation" },
              { label: "All Characters", path: "/all-characters" }
            ]}
          />
          <NavDropdown 
            label="Games" 
            items={[
              { label: "New Game", path: "/game-settings" },
              { label: "Saved Games", path: "/saved-conversations" }
            ]}
          />
          <li className="nav-settings-item">
            <button
              onClick={() => setIsSettingsModalOpen(true)}
              className="nav-settings-btn"
            >
              ⚙️ Settings
            </button>
          </li>
          {isGamePage && (
            <li className="nav-settings-item">
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('open-ai-assistant'))}
                className="nav-settings-btn nav-ai-btn"
                title="Open AI Assistant"
              >
                🤖 AI Assistant
              </button>
            </li>
          )}
          {isDebugEnabled && (
            <li className="nav-settings-item">
              <DebugMenu inNav />
            </li>
          )}
        </ul>
      </nav>

      <AISettingsModalContent
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        selectedProvider={selectedProvider}
        setSelectedProvider={setSelectedProvider}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        assistantProvider={assistantProvider}
        setAssistantProvider={setAssistantProvider}
        assistantModel={assistantModel}
        setAssistantModel={setAssistantModel}
      />

      {/* === Add this wrapper div === */}
      <div className={`main-content ${isGamePage ? 'game-page-content' : ''}`}>
        <ErrorBoundary>
          <Suspense fallback={<div className="page-container">Loading...</div>}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/character-creation" element={<CharacterCreation />} />
              <Route path="/character-summary" element={<CharacterSummary />} />
              <Route path="/all-characters" element={<AllCharacters />} />
              <Route path="/game-settings" element={<GameSettings />} />
              <Route path="/hero-selection" element={<HeroSelection />} />
              <Route path="/game" element={<Game />} />
              <Route path="/saved-conversations" element={<SavedConversations />} />
              {isDebugEnabled && <Route path="/debug/*" element={<DebugRoutes />} />}
              {!isDebugEnabled && <Route path="/debug/*" element={<Navigate to="/" replace />} />}
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </div>

    </div>
  );
};

const App = () => {
  return (
    <Router>
      <AppContent />
    </Router>
  );
};

export default App;
