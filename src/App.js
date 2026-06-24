// App.js

import React, { useContext, useEffect, Suspense, lazy, useState } from "react";
import { BrowserRouter as Router, Route, Link, Routes, Navigate, useLocation } from "react-router-dom";
import HeroCreation from "./pages/HeroCreation";
import HeroSummary from "./components/HeroSummary";
import AllHeroes from "./pages/AllHeroes";
import HomePage from "./pages/HomePage";
import NewGame from "./pages/NewGame";
import HeroSelection from './pages/HeroSelection';
import Game from './pages/Game';
import SavedConversations from './pages/SavedConversations';
import CFWorkerDebug from './pages/CFWorkerDebug';
import EncounterModalDebug from './pages/EncounterModalDebug';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import Profile from './pages/Profile';
import HowToPlay from './pages/HowToPlay';
import GettingStarted from './pages/GettingStarted';
import { useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import UserProfileIndicator from './components/UserProfileIndicator';

import "./styles/index.css";

import DebugMenu from './components/DebugMenu';
import SettingsContext from "./contexts/SettingsContext";
import { AISettingsModalContent } from "./components/Modals";
import ErrorBoundary from "./components/ErrorBoundary";
import NavDropdown from "./components/NavDropdown";
import DatabaseIndicator from "./components/DatabaseIndicator";
import { GuidedTourProvider, useGuidedTour } from "./contexts/GuidedTourContext";
import TourOverlay from "./components/TourOverlay";
import LocalHeroSync from "./components/LocalHeroSync";
import LocalGameSync from "./components/LocalGameSync";
import GuestBanner from "./components/GuestBanner";

const DebugRoutes = lazy(() => import('./pages/DebugRoutes'));

const AppContent = () => {
  const location = useLocation();
  const { user, loading } = useAuth();
  const isDebugEnabled = process.env.NODE_ENV !== 'production' || process.env.REACT_APP_ENABLE_DEBUG_ROUTES === 'true';
  const isGamePage = location.pathname === '/game';
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const { startTour } = useGuidedTour();

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
    theme,
    setTheme
  } = useContext(SettingsContext);

  // Sync theme to document.body so Portal content inherits CSS variables
  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

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

      {/* Hamburger button - visible on mobile for all pages */}
      <button
        className="hamburger-btn"
        onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
        aria-label="Toggle navigation menu"
        aria-expanded={isMobileNavOpen}
      >
        {isMobileNavOpen ? '✕' : '☰'}
      </button>

      {/* Add className="main-nav" here for the nav styles */}
      <nav className={`main-nav ${isGamePage ? 'game-page-nav' : ''} ${isMobileNavOpen ? 'mobile-nav-open' : ''}`}>
        <ul>
          <li><Link to="/" onClick={() => setIsMobileNavOpen(false)}>Home</Link></li>
          <NavDropdown
            label="How to Play"
            items={[
              { label: "Getting Started", path: "/getting-started" },
              { label: "Features & FAQ", path: "/features" },
              { label: "Replay Tutorial", onClick: startTour }
            ]}
            onNavClose={() => setIsMobileNavOpen(false)}
          />
          <NavDropdown
            label="Heroes"
            items={[
              { label: "Create New Hero", path: "/hero-creation" },
              { label: "All Heroes", path: "/all-heroes" }
            ]}
            onNavClose={() => setIsMobileNavOpen(false)}
          />
          <NavDropdown
            label="Games"
            items={[
              { label: "New Game", path: "/new-game" },
              { label: "Saved Games", path: "/saved-conversations" }
            ]}
            onNavClose={() => setIsMobileNavOpen(false)}
          />
          <li className="nav-settings-item">
            <button
              onClick={() => setTheme(theme === 'light-fantasy' ? 'dark-fantasy' : 'light-fantasy')}
              className="nav-settings-btn"
              title={theme === 'light-fantasy' ? 'Switch to dark mode' : 'Switch to light mode'}
              aria-label="Toggle light/dark theme"
            >
              {theme === 'light-fantasy' ? '🌙' : '☀️'} <span className="settings-text">{theme === 'light-fantasy' ? 'Dark' : 'Light'}</span>
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
            <UserProfileIndicator isMobileNavOpen={isMobileNavOpen} onNavClose={() => setIsMobileNavOpen(false)} />
          </li>
        </ul>
      </nav>

      {/* Mobile nav overlay - moved outside nav to prevent filter nesting issues */}
      {isMobileNavOpen && (
        <div
          className="mobile-nav-overlay"
          onClick={() => setIsMobileNavOpen(false)}
        />
      )}

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
        <GuestBanner />
        <ErrorBoundary>
          <Suspense fallback={<div className="page-container">Loading...</div>}>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<Login />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/getting-started" element={<GettingStarted />} />
              <Route path="/features" element={<HowToPlay />} />
              <Route path="/how-to-play" element={<Navigate to="/getting-started" replace />} />
              <Route path="/hero-creation" element={<HeroCreation />} />
              <Route path="/hero-summary" element={<HeroSummary />} />
              <Route path="/new-game" element={<NewGame />} />

              {/* Guest-accessible: heroes/games are saved locally until sign-in.
                  The AI Dungeon Master is gated in-page for guests (see useAiAvailable). */}
              <Route path="/all-heroes" element={<AllHeroes />} />
              <Route path="/hero-selection" element={<HeroSelection />} />
              <Route path="/game" element={<Game />} />
              <Route path="/saved-conversations" element={<SavedConversations />} />

              {/* Protected routes */}
              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/cf-worker-debug" element={<ProtectedRoute><CFWorkerDebug /></ProtectedRoute>} />
              {isDebugEnabled && <Route path="/encounter-debug" element={<EncounterModalDebug />} />}
              {isDebugEnabled && <Route path="/debug/*" element={<ProtectedRoute><DebugRoutes /></ProtectedRoute>} />}
              {!isDebugEnabled && <Route path="/debug/*" element={<Navigate to="/" replace />} />}
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </div>

      <DatabaseIndicator />
      <TourOverlay />
      <LocalHeroSync />
      <LocalGameSync />

      <footer className="app-footer">
        © 2026 Edward Thomson (<a href="https://octonion.io" target="_blank" rel="noopener noreferrer">Octonion Software</a>)
      </footer>

    </div>
  );
};

const App = () => {
  return (
    <Router>
      <GuidedTourProvider>
        <AppContent />
      </GuidedTourProvider>
    </Router>
  );
};

export default App;
