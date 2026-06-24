// LocalGameSync.js
// When a guest who has been playing locally signs in, upload their browser-local
// saved games to the cloud so nothing is lost — mirrors LocalHeroSync (heroes).
// Runs after sign-in; renders a small confirmation toast. See docs/GUEST_MODE_PLAN.md (B2).

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { conversationsApi } from '../services/conversationsApi';
import { localGameStore } from '../services/localGameStore';
import { createLogger } from '../utils/logger';

const logger = createLogger('local-game-sync');

// localGameStore rows are stored in the backend's snake_case shape; conversationsApi.save
// expects the camelCase payload. Map back so the upserted cloud row matches the local one
// (session_id preserved → the live game keeps autosaving to the same row after sign-in).
export const rowToPayload = (row) => ({
  sessionId: row.session_id,
  conversationName: row.conversation_name,
  conversation: row.conversation_data,
  gameSettings: row.game_settings,
  selectedHeroes: row.selected_heroes,
  currentSummary: row.summary,
  worldMap: row.world_map,
  playerPosition: row.player_position,
  sub_maps: row.sub_maps,
  provider: row.provider,
  model: row.model,
  timestamp: row.timestamp,
});

const LocalGameSync = () => {
  const { user } = useAuth();
  const syncedRef = useRef(false);
  const [importedCount, setImportedCount] = useState(0);

  useEffect(() => {
    if (!user || syncedRef.current) return;

    syncedRef.current = true;
    (async () => {
      let rows = [];
      try {
        rows = await localGameStore.list();
      } catch (e) {
        logger.error('Failed to read local games:', e);
        syncedRef.current = false;
        return;
      }
      if (rows.length === 0) {
        syncedRef.current = false; // nothing to do; allow a real sync on a later tick
        return;
      }

      let count = 0;
      let failed = false;
      for (const row of rows) {
        try {
          // Session is present now, so conversationsApi.save routes to the cloud backend.
          await conversationsApi.save(rowToPayload(row));
          await localGameStore.remove(row.session_id); // drop synced rows as we go
          count += 1;
        } catch (e) {
          logger.error(`Failed to sync local game ${row.session_id}:`, e);
          failed = true;
        }
      }

      // Leave any failed rows in place and allow a retry on the next auth tick.
      if (failed) syncedRef.current = false;
      if (count) setImportedCount(count);
    })();
  }, [user]);

  if (!importedCount) return null;

  return (
    <div className="local-sync-toast" role="status">
      <span>✓ {importedCount} {importedCount === 1 ? 'game' : 'games'} saved to your account.</span>
      <button onClick={() => setImportedCount(0)} aria-label="Dismiss" className="local-sync-toast-close">✕</button>
    </div>
  );
};

export default LocalGameSync;
