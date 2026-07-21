// GuestBanner.js
// A slim, dismissible conversion nudge shown to logged-out (guest) players across
// the app's working surface. Honest framing: progress is saved on this device;
// signing in unlocks the AI Dungeon Master and cross-device saves (which then sync
// up automatically — see LocalHeroSync / LocalGameSync). Dismissal lasts the
// browser session so it doesn't nag on every navigation but returns on a fresh visit.

import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const DISMISS_KEY = 'guestBannerDismissed';

// Pages where the banner adds noise or fights the layout: the landing/auth pages
// (their own CTAs) and the full-height game view (already has its own guest notice).
const HIDDEN_PATHS = ['/', '/login', '/auth/callback', '/game'];

const GuestBanner = () => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === 'true'; } catch (e) { return false; }
  });

  if (loading || user || dismissed || HIDDEN_PATHS.includes(location.pathname)) return null;

  const dismiss = () => {
    try { sessionStorage.setItem(DISMISS_KEY, 'true'); } catch (e) { /* ignore */ }
    setDismissed(true);
  };

  return (
    <div className="guest-banner" role="region" aria-label="Guest account notice">
      <span className="guest-banner-text">
        🎲 <strong>Playing as a guest.</strong> Your heroes &amp; games live only in this
        browser. Sign in free to keep them across devices and unlock the AI Dungeon Master.
      </span>
      <span className="guest-banner-actions">
        <button className="guest-banner-cta" onClick={() => navigate('/login')}>Sign in</button>
        <button className="guest-banner-close" onClick={dismiss} aria-label="Dismiss guest notice">✕</button>
      </span>
    </div>
  );
};

export default GuestBanner;
