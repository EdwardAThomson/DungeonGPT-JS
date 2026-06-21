// LocalHeroSync.js
// When a player who built a local (guest) roster signs in, import those heroes
// into their account and clear the local store. Renders a small confirmation toast.

import React, { useEffect, useRef, useContext, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import HeroContext from '../contexts/HeroContext';
import { heroesApi } from '../services/heroesApi';
import { localHeroStore } from '../services/localHeroStore';
import { createLogger } from '../utils/logger';

const logger = createLogger('local-hero-sync');

const LocalHeroSync = () => {
  const { user } = useAuth();
  const { setHeroes } = useContext(HeroContext);
  const syncedRef = useRef(false);
  const [importedCount, setImportedCount] = useState(0);

  useEffect(() => {
    if (!user || syncedRef.current) return;
    const localHeroes = localHeroStore.listSync();
    if (localHeroes.length === 0) return;

    syncedRef.current = true;
    (async () => {
      try {
        let count = 0;
        for (const hero of localHeroes) {
          // Session is present now, so heroesApi.create routes to the cloud backend.
          await heroesApi.create(hero);
          count += 1;
        }
        localHeroStore.clear();
        try {
          const data = await heroesApi.list();
          setHeroes(data);
        } catch (e) {
          logger.error('Failed to refresh roster after import:', e);
        }
        setImportedCount(count);
      } catch (e) {
        logger.error('Failed to import local heroes after sign-in:', e);
        syncedRef.current = false; // allow a retry on the next auth tick
      }
    })();
  }, [user, setHeroes]);

  if (!importedCount) return null;

  return (
    <div className="local-sync-toast" role="status">
      <span>✓ {importedCount} {importedCount === 1 ? 'hero' : 'heroes'} added to your account.</span>
      <button onClick={() => setImportedCount(0)} aria-label="Dismiss" className="local-sync-toast-close">✕</button>
    </div>
  );
};

export default LocalHeroSync;
