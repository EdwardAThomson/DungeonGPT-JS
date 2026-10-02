// App.js

import React, { useContext, useEffect, Suspense, lazy } from "react";
import { sendEvent } from "./services/telemetry";
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from "react-router-dom";
import HeroCreation from "./pages/HeroCreation";
import HeroSummary from "./components/HeroSummary";
import AllHeroes from "./pages/AllHeroes";
import HomePage from "./pages/HomePage";
import NewGame from "./pages/NewGame";
import HeroSelection from './pages/HeroSelection';
import GameResumeGate from './pages/GameResumeGate';
import SavedConversations from './pages/SavedConversations';
import CFWorkerDebug from './pages/CFWorkerDebug';
import EncounterModalDebug from './pages/EncounterModalDebug';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import Profile from './pages/Profile';
import GettingStarted from './pages/GettingStarted';
import { useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

import "./styles/index.css";

import SettingsContext from "./contexts/SettingsContext";
import { AISettingsModalContent } from "./components/Modals";
import ErrorBoundary from "./components/ErrorBoundary";
import RedesignNav from "./components/RedesignNav";
import DatabaseIndicator from "./components/DatabaseIndicator";
import { GuidedTourProvider } from "./contexts/GuidedTourContext";
import TourOverlay from "./components/TourOverlay";
import LocalHeroSync from "./components/LocalHeroSync";
import LocalGameSync from "./components/LocalGameSync";
import GuestBanner from "./components/GuestBanner";
import ScrollToTop from "./components/ScrollToTop";

const DebugRoutes = lazy(() => import('./pages/DebugRoutes'));
// Redesign marketing depth pages (#82 §12.4), reached from the "The Game" nav dropdown.
const EnginePage = lazy(() => import('./pages/EnginePage'));
const OverviewPage = lazy(() => import('./pages/OverviewPage'));
// Player dashboard, split from the public front page (#82).
const PlayPage = lazy(() => import('./pages/PlayPage'));
// Membership / tier page: /premium with a /membership alias (the nav's Subscribe).
const PremiumPage = lazy(() => import('./pages/PremiumPage'));

const AppContent = () => {
  const location = useLocation();
  const { loading } = useAuth();
  const isDebugEnabled = process.env.NODE_ENV !== 'production' || process.env.REACT_APP_ENABLE_DEBUG_ROUTES === 'true';
  const isGamePage = location.pathname === '/game';
  // Redesign marketing routes (#82 §12.3) go full-bleed; other pages keep the container.
  const isBleedPage = ['/', '/overview', '/engine', '/premium', '/membership', '/getting-started', '/saved-conversations', '/all-heroes', '/login', '/play'].includes(location.pathname);

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

  // Sync theme to document.body so Portal content inherits CSS variables.
  // Redesign branch (#82 §12): the whole app runs on the dark redesign theme; the
  // light-fantasy/dark-fantasy `theme` state machinery is preserved but overridden here
  // (the §12.6 "keep the light/dark toggle?" decision can restore it).
  useEffect(() => {
    document.body.setAttribute('data-theme', 'redesign');
  }, [theme]);

  // Funnel: one app_open per page load (anonymous; D1/D7 return comes from
  // grouping these by anon id server-side).
  useEffect(() => {
    sendEvent('app_open', {}, { once: true });
  }, []);

  // Show loading screen while checking authentication
  if (loading) {
    return (
      <div className="App" data-theme="redesign">
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
    <div className="App" data-theme="redesign">
      <a href="#main-content" className="skip-link">Skip to main content</a>

      <RedesignNav isDebugEnabled={isDebugEnabled} />

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
      <div id="main-content" className={`main-content ${isGamePage ? 'game-page-content' : ''} ${isBleedPage ? 'redesign-bleed' : ''}`}>
        <GuestBanner />
        <ErrorBoundary>
          <Suspense fallback={<div className="page-container">Loading...</div>}>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<Login />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/getting-started" element={<GettingStarted />} />
              <Route path="/play" element={<PlayPage />} />
              <Route path="/overview" element={<OverviewPage />} />
              <Route path="/engine" element={<EnginePage />} />
              <Route path="/premium" element={<PremiumPage />} />
              <Route path="/membership" element={<PremiumPage />} />
              {/* Features & FAQ retired into How to Play (#82 §12 step 5) */}
              <Route path="/features" element={<Navigate to="/getting-started#faq" replace />} />
              <Route path="/how-to-play" element={<Navigate to="/getting-started" replace />} />
              <Route path="/hero-creation" element={<HeroCreation />} />
              <Route path="/hero-summary" element={<HeroSummary />} />
              <Route path="/new-game" element={<NewGame />} />

              {/* Guest-accessible: heroes/games are saved locally until sign-in.
                  The AI Dungeon Master is gated in-page for guests (see useAiAvailable). */}
              <Route path="/all-heroes" element={<AllHeroes />} />
              <Route path="/hero-selection" element={<HeroSelection />} />
              <Route path="/game" element={<GameResumeGate />} />
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
      <ScrollToTop />
      <GuidedTourProvider>
        <AppContent />
      </GuidedTourProvider>
    </Router>
  );
};

export default App;
