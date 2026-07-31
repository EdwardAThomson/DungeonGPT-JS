import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import NavDropdown from './NavDropdown';
import DebugMenu from './DebugMenu';
import '../styles/redesign.css';

/*
 * Redesign top nav (#82, UI_REDESIGN_PLAN.md §11-12). Auth-aware, RS/WoW-style minimal bar:
 *   logged-out:  The Game ▾ · Subscribe · Play Free · Log in
 *   logged-in:   The Game ▾ · Subscribe · Play · profile chip
 * The Game ▾ carries all the marketing depth (Overview / How to Play / The Engine); app
 * management (heroes/games) lives under the profile chip until the dashboard (§12.3) absorbs it.
 *
 * KNOWN STUBS (branch-only, wired in later steps):
 *   - /overview and /engine routes do not exist yet (§12.4).
 *   - Play Free / Play point at existing entry routes; Quick Start wiring is §12.3.
 *   - Subscribe always shows; hiding it for members needs the tier fetch (later).
 */
const RedesignNav = ({ isDebugEnabled }) => {
  const { user, signOut } = useAuth();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const close = () => setIsMobileOpen(false);

  const gameMenu = [
    { label: 'Overview', path: '/overview' },
    { label: 'How to Play', path: '/getting-started' },
    { label: 'The Engine', path: '/engine' },
  ];

  const profileMenu = [
    { label: 'Your Heroes', path: '/all-heroes' },
    { label: 'Your Games', path: '/saved-conversations' },
    { label: 'New Game', path: '/new-game' },
    { label: 'Profile', path: '/profile' },
    { label: 'Sign Out', onClick: () => { signOut(); close(); } },
  ];

  const accountLabel = user
    ? `${(user.email || '?').charAt(0).toUpperCase()} ${(user.email || 'Account').split('@')[0]}`
    : '';

  return (
    <header className="rd-nav" data-theme="redesign">
      <div className="rd-nav-inner">
        <Link to="/" className="rd-wordmark" onClick={close}>
          <span className="rune" aria-hidden="true">✦</span> DungeonGPT
        </Link>

        <button
          className="rd-burger"
          aria-label="Toggle navigation menu"
          aria-expanded={isMobileOpen}
          onClick={() => setIsMobileOpen((o) => !o)}
        >
          {isMobileOpen ? '✕' : '☰'}
        </button>

        <div className={`rd-nav-cluster ${isMobileOpen ? 'open' : ''}`}>
          <ul className="rd-nav-links">
            <NavDropdown label="The Game" items={gameMenu} onNavClose={close} />
          </ul>

          <div className="rd-nav-cta">
            <Link to="/membership" className="rd-link" onClick={close}>Subscribe</Link>
            {user ? (
              <>
                <Link to="/game" className="btn btn-primary" onClick={close}>Play</Link>
                <ul className="rd-nav-links rd-profile">
                  <NavDropdown label={accountLabel} items={profileMenu} onNavClose={close} />
                </ul>
              </>
            ) : (
              <>
                <Link to="/new-game" className="btn btn-primary" onClick={close}>Play Free</Link>
                <Link to="/login" className="rd-link" onClick={close}>Log in</Link>
              </>
            )}
            {isDebugEnabled && (
              <ul className="rd-nav-links">
                <li className="nav-settings-item nav-debug-item"><DebugMenu inNav /></li>
              </ul>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default RedesignNav;
