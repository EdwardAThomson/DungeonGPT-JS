import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { conversationsApi } from '../services/conversationsApi';
import { createLogger } from '../utils/logger';
import Game from './Game';

const logger = createLogger('game-resume');

// True when the current document load was a browser reload (Ctrl+R / F5), as opposed to an
// in-app SPA navigation. On a reload React Router still restores location.state from
// window.history.state, but that state is only the game's STARTING snapshot (heroes + initial
// map); it never holds the progress made during play. So on a reload we must ignore it and
// rehydrate the latest saved game from the store instead.
const isPageReload = () => {
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) return nav.type === 'reload';
    return performance.navigation && performance.navigation.type === 1; // legacy fallback
  } catch (e) {
    return false;
  }
};

// Route wrapper for /game that survives a hard browser reload.
//
// On a normal in-app navigation (New Game, Saved Games) the game arrives in React Router's
// location.state and we render <Game/> straight through. On a hard reload the active game's
// session id survives in localStorage; we fetch the latest saved row (IndexedDB for guests,
// backend when signed in) BEFORE mounting <Game/>, so Game's state initializers hydrate from
// the real progress instead of the stale starting snapshot in location.state. Without this,
// a reload silently discarded in-progress games even though the save was on disk.
const GameResumeGate = () => {
  const { state } = useLocation();
  const [resume, setResume] = useState(() => {
    const sid = localStorage.getItem('activeGameSessionId');
    // Resume from the store on a reload (stale/absent state), or any time we have a session
    // id but no router state (e.g. opening /game directly). Fresh in-app navigations keep
    // their location.state and skip the fetch (no flash).
    const needResume = sid && (isPageReload() || !state);
    return needResume ? { status: 'loading', sid } : { status: 'ready' };
  });

  useEffect(() => {
    if (resume.status !== 'loading') return;
    let cancelled = false;
    (async () => {
      try {
        const conv = await conversationsApi.getById(resume.sid);
        if (cancelled) return;
        setResume(conv ? { status: 'resumed', conv } : { status: 'ready' });
      } catch (err) {
        logger.error('Failed to resume active game after reload', err);
        if (!cancelled) setResume({ status: 'ready' });
      }
    })();
    return () => { cancelled = true; };
  }, [resume.status, resume.sid]);

  if (resume.status === 'loading') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          gap: 12,
          color: 'var(--text)'
        }}
      >
        <p style={{ fontSize: '1.1rem' }}>Resuming your adventure…</p>
      </div>
    );
  }

  // Fresh mount of Game with the restored row as a prop. `key` guarantees a clean mount so
  // the state initializers run against the resumed conversation.
  if (resume.status === 'resumed') {
    const sid = resume.conv.sessionId || resume.conv.session_id;
    return <Game key={sid} resumeConversation={resume.conv} />;
  }

  return <Game />;
};

export default GameResumeGate;
