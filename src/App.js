// App.js

import React, { useContext, Suspense, lazy, useState } from "react";
import { BrowserRouter as Router, Route, Link, Routes, Navigate, useLocation } from "react-router-dom";
import HeroCreation from "./pages/HeroCreation";
import HeroSummary from "./components/HeroSummary";
import AllHeroes from "./pages/AllHeroes";
import HomePage from "./pages/HomePage";
import GameSettings from "./pages/GameSettings";
import HeroSelection from './pages/HeroSelection';
import Game from './pages/Game';
import SavedConversations from './pages/SavedConversations';
import CFWorkerDebug from './pages/CFWorkerDebug';
import Login from './pages/Login';
import Profile from './pages/Profile';
import { useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import UserProfileIndicator from './components/UserProfileIndicator';

import "./styles/index.css";

import DebugMenu from './components/DebugMenu';
import SettingsContext from "./contexts/SettingsContext";
import { AISettingsModalContent } from "./components/Modals";
import ErrorBoundary from "./components/ErrorBoundary";
import NavDropdown from "./components/NavDropdown";

const DebugRoutes = lazy(() => import('./pages/DebugRoutes'));

const AppContent = () => {
  const location = useLocation();
  const { user, loading } = useAuth();
  const isDebugEnabled = process.env.NODE_ENV !== 'production' || process.env.REACT_APP_ENABLE_DEBUG_ROUTES === 'true';
  const isGamePage = location.pathname === '/game';
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

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

  // Show loading screen while checking authentication
  if (loading) {
    return (
      <div className="App" data-theme={theme}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100vh',
          color: 'var(--text)'
        }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="App" data-theme={theme}>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      
      {/* Hamburger button - outside nav so it's visible when nav is hidden */}
      {isGamePage && (
        <button
          className="hamburger-btn"
          onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
          aria-label="Toggle navigation menu"
          aria-expanded={isMobileNavOpen}
        >
          {isMobileNavOpen ? '✕' : '☰'}
        </button>
      )}
      
      {/* Add className="main-nav" here for the nav styles */}
      <nav className={`main-nav ${isGamePage ? 'game-page-nav' : ''} ${isMobileNavOpen ? 'mobile-nav-open' : ''}`}>
        <ul>
          <li><Link to="/">Home</Link></li>
          <NavDropdown 
            label="Heroes" 
            items={[
              { label: "Create New Hero", path: "/hero-creation" },
              { label: "All Heroes", path: "/all-heroes" }
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
              ⚙️ <span className="settings-text">Settings</span>
            </button>
          </li>
          {isGamePage && user && (
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
            <li className="nav-settings-item nav-debug-item">
              <DebugMenu inNav />
            </li>
          )}
          <li className="nav-profile-item">
            <UserProfileIndicator />
          </li>
        </ul>
        {/* Mobile nav overlay */}
        {isGamePage && isMobileNavOpen && (
          <div
            className="mobile-nav-overlay"
            onClick={() => setIsMobileNavOpen(false)}
          />
        )}
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
      <div id="main-content" className={`main-content ${isGamePage ? 'game-page-content' : ''}`}>
        <ErrorBoundary>
          <Suspense fallback={<div className="page-container">Loading...</div>}>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<Login />} />
              <Route path="/hero-creation" element={<HeroCreation />} />
              <Route path="/hero-summary" element={<HeroSummary />} />
              <Route path="/game-settings" element={<GameSettings />} />
              
              {/* Protected routes */}
              <Route path="/all-heroes" element={<ProtectedRoute><AllHeroes /></ProtectedRoute>} />
              <Route path="/hero-selection" element={<ProtectedRoute><HeroSelection /></ProtectedRoute>} />
              <Route path="/game" element={<ProtectedRoute><Game /></ProtectedRoute>} />
              <Route path="/saved-conversations" element={<ProtectedRoute><SavedConversations /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/cf-worker-debug" element={<ProtectedRoute><CFWorkerDebug /></ProtectedRoute>} />
              {isDebugEnabled && <Route path="/debug/*" element={<ProtectedRoute><DebugRoutes /></ProtectedRoute>} />}
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
