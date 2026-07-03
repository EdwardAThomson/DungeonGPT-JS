// GuidedTourContext.js
// A lightweight, cross-route guided tour for new players. It auto-starts once for
// genuinely new players (no heroes and no saved games), can be skipped at any time,
// and replayed later from the "How to Play" menu.
//
// Steps are an ordered list; several can share a route (finer-grained, page-level
// guidance) and the player advances through same-page steps with "Next". Moving to
// a new route re-syncs to that route's first step. Coach-marks are non-blocking
// (outline + tooltip, or a docked card) — no full-screen dimming, no welcome modal.

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import HeroContext from './HeroContext';
import { heroesApi } from '../services/heroesApi';
import { conversationsApi } from '../services/conversationsApi';
import { localHeroStore } from '../services/localHeroStore';
import { createLogger } from '../utils/logger';

const logger = createLogger('guided-tour');
const TUTORIAL_DONE_KEY = 'tutorialDone';

// `target` (a CSS selector) rings a specific element; without it the step shows as
// a docked info card. Steps are ordered; same-route steps form a per-page sequence.
export const TOUR_STEPS = [
  {
    id: 'home-start',
    route: '/',
    target: '[data-tour="start-adventure"]',
    title: 'Welcome — start here',
    body: 'New here? Click Start Adventure to create your first hero and begin your quest.',
  },
  {
    id: 'create-hero-basics',
    route: '/hero-creation',
    target: '[data-tour="hero-identity"]',
    title: 'Create your hero — start at the top',
    body: 'Pick a name and a profile picture first. Choose a gender to reveal matching portraits, and the 🎲 can roll a name for you.',
  },
  {
    id: 'create-hero-template',
    route: '/hero-creation',
    target: '[data-tour="hero-template"]',
    title: 'Optional shortcut — class templates',
    body: 'This is optional. If you want a head start, applying a class template fills in stats, alignment and a background in one click. Prefer to build from scratch? Just skip it.',
  },
  {
    id: 'create-hero-stats',
    route: '/hero-creation',
    target: '[data-tour="hero-stats"]',
    title: 'Then fine-tune',
    body: 'Adjust the lower details and spend your 27 stat points (scores 14 and 15 cost 2 each). When you are happy, click Create Hero.',
  },
  {
    id: 'save-hero',
    route: '/hero-summary',
    target: '[data-tour="save-hero"]',
    title: 'Save your hero',
    body: 'Happy with your hero? Add them to your roster to continue.',
  },
  {
    id: 'start-game',
    route: '/all-heroes',
    target: '[data-tour="start-new-game"]',
    title: 'Start a game',
    body: 'Your hero is ready. Start a new game to choose a story.',
  },
  {
    id: 'configure-game',
    route: '/new-game',
    target: '[data-tour="first-adventure"]',
    title: 'Pick an adventure',
    body: 'Click an adventure card to choose your story — this first one is a great place to begin. Then click “Next: Select Heroes”.',
  },
  {
    id: 'select-party',
    route: '/hero-selection',
    target: '[data-tour="start-game"]',
    title: 'Choose your party',
    body: 'Select 1–4 heroes by clicking them, then click Start Game — your quest begins!',
  },
  {
    id: 'start-adventure',
    route: '/game',
    target: '[data-tour="start-adventure"]',
    title: 'Begin your quest',
    body: 'Click Start the Adventure to enter the world.',
  },
  {
    id: 'open-map',
    route: '/game',
    target: '[data-tour="open-map"]',
    title: 'Travel with the map',
    body: 'Open the map and click a tile to move. It stays open as you explore, so you can travel freely.',
  },
];

const GuidedTourContext = createContext(null);

export const useGuidedTour = () => {
  return useContext(GuidedTourContext) || {
    tourActive: false,
    activeStep: null,
    pageInfo: null,
    hasNextOnPage: false,
    minimizedSteps: [],
    startTour: () => {},
    skipTour: () => {},
    advanceStep: () => {},
    minimizeStep: () => {},
    expandStep: () => {},
  };
};

export const GuidedTourProvider = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { heroes } = useContext(HeroContext);

  const [tourActive, setTourActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [minimizedSteps, setMinimizedSteps] = useState([]);
  const decidedRef = useRef(false);
  const prevPathRef = useRef(location.pathname);

  const markDone = useCallback(() => {
    try { localStorage.setItem(TUTORIAL_DONE_KEY, 'true'); } catch (e) { /* ignore */ }
  }, []);

  const minimizeStep = useCallback((id) => {
    setMinimizedSteps((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const expandStep = useCallback((id) => {
    setMinimizedSteps((prev) => prev.filter((s) => s !== id));
  }, []);

  const advanceStep = useCallback(() => {
    setStepIndex((i) => i + 1);
  }, []);

  // Replay: re-arm the tour from the very start (home) and head there.
  const startTour = useCallback(() => {
    setMinimizedSteps([]);
    setStepIndex(0);
    setTourActive(true);
    if (location.pathname !== '/') navigate('/');
  }, [location.pathname, navigate]);

  const skipTour = useCallback(() => {
    setTourActive(false);
    markDone();
  }, [markDone]);

  // Decide once whether to auto-arm the tour for a genuinely new player. This only
  // enables the coach-marks; nothing shows until the player reaches a tour page.
  useEffect(() => {
    if (decidedRef.current) return;

    let done = false;
    try { done = localStorage.getItem(TUTORIAL_DONE_KEY) === 'true'; } catch (e) { /* ignore */ }
    if (done) { decidedRef.current = true; return; }

    if (!user) {
      // Guest: only auto-arm if they haven't already built a local roster.
      decidedRef.current = true;
      if (!localHeroStore.hasHeroes()) setTourActive(true);
      return;
    }

    decidedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const [heroList, games] = await Promise.all([
          heroesApi.list().catch(() => []),
          conversationsApi.list().catch(() => []),
        ]);
        const isNew =
          (!Array.isArray(heroList) || heroList.length === 0) &&
          (!Array.isArray(games) || games.length === 0);
        if (!cancelled && isNew) setTourActive(true);
      } catch (e) {
        logger.error('Tour auto-start check failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // On navigation (not on manual Next), re-sync to the current route's first step.
  useEffect(() => {
    if (!tourActive) { prevPathRef.current = location.pathname; return; }
    if (prevPathRef.current !== location.pathname) {
      prevPathRef.current = location.pathname;
      const idx = TOUR_STEPS.findIndex((s) => s.route === location.pathname);
      if (idx !== -1) setStepIndex(idx);
    }
  }, [tourActive, location.pathname]);

  // Finishing line: the tour completes once the player advances past the last step
  // (the in-game map coachmark). Driven by Game.js as the player begins and opens
  // the map; the manual "Got it" advances too.
  useEffect(() => {
    if (tourActive && stepIndex >= TOUR_STEPS.length) {
      setTourActive(false);
      markDone();
    }
  }, [tourActive, stepIndex, markDone]);

  const current = TOUR_STEPS[stepIndex];
  const activeStep = tourActive && current && current.route === location.pathname ? current : null;

  let pageInfo = null;
  let hasNextOnPage = false;
  if (activeStep) {
    const pageSteps = TOUR_STEPS.filter((s) => s.route === activeStep.route);
    pageInfo = {
      current: pageSteps.findIndex((s) => s.id === activeStep.id) + 1,
      total: pageSteps.length,
    };
    const next = TOUR_STEPS[stepIndex + 1];
    hasNextOnPage = !!next && next.route === activeStep.route;
  }

  const value = {
    tourActive,
    activeStep,
    pageInfo,
    hasNextOnPage,
    minimizedSteps,
    startTour,
    skipTour,
    advanceStep,
    minimizeStep,
    expandStep,
    heroesCount: heroes?.length || 0,
  };

  return (
    <GuidedTourContext.Provider value={value}>{children}</GuidedTourContext.Provider>
  );
};
