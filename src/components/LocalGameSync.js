// LocalGameSync.js
// When a guest who has been playing locally signs in, upload their browser-local
// saved games to the cloud so nothing is lost — mirrors LocalHeroSync (heroes).
// Runs after sign-in AND on auth restoration mid-session (SAVE_SYNC_PLAN Phase 1);
// renders a small confirmation toast. See docs/GUEST_MODE_PLAN.md (B2).

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { conversationsApi } from '../services/conversationsApi';
import { localGameStore } from '../services/localGameStore';
import { supabase } from '../services/supabaseClient';
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

// Short random suffix for parking a diverged local copy under its own session_id.
const shortId = () => Math.random().toString(36).slice(2, 8);

// One sync pass (exported for tests). For each local row:
// - If the cloud already holds a NEWER copy of the same session, do NOT overwrite it
//   (SAVE_SYNC_PLAN §5/§6.2): park the local copy as a separate save (new session_id,
//   name suffixed "(diverged on this device, <date>)") so both timelines survive.
// - Otherwise (cloud older or missing) upload as-is, same session_id.
// Rows whose upload fails, or whose write routed back to local storage because auth
// vanished again mid-pass, stay local for the next pass.
export const runLocalGameSyncPass = async () => {
  let rows;
  try {
    rows = await localGameStore.list();
  } catch (e) {
    logger.error('Failed to read local games:', e);
    return { count: 0, failed: true, empty: false };
  }
  if (!rows || rows.length === 0) {
    return { count: 0, failed: false, empty: true };
  }

  let count = 0;
  let failed = false;
  for (const row of rows) {
    try {
      // Timestamp guard: never clobber a newer cloud row with a stale local one.
      let cloudRow = null;
      try {
        cloudRow = await conversationsApi.getById(row.session_id);
      } catch (e) {
        cloudRow = null; // 404 or fetch failure: treat as "no cloud copy"
      }
      const cloudTime = cloudRow?.updated_at ? Date.parse(cloudRow.updated_at) : NaN;
      const localTime = row.updated_at ? Date.parse(row.updated_at) : NaN;
      const cloudIsNewer = Number.isFinite(cloudTime) && Number.isFinite(localTime) && cloudTime > localTime;

      let payload = rowToPayload(row);
      if (cloudIsNewer) {
        const divergedDate = new Date(localTime).toLocaleDateString();
        payload = {
          ...payload,
          sessionId: `${row.session_id}-local-${shortId()}`,
          conversationName: `${payload.conversationName || 'Adventure'} (diverged on this device, ${divergedDate})`,
        };
        logger.warn(`Cloud copy of ${row.session_id} is newer than the local one; parking local copy as ${payload.sessionId}`);
      } else {
        logger.info(`Uploading local game ${row.session_id} (cloud copy ${cloudRow ? 'older' : 'absent'})`);
      }

      const result = await conversationsApi.save(payload);
      if (result?.storage === 'local') {
        // Auth vanished between the trigger and this write; the save landed back in
        // this store. Keep the original row (and drop the accidental local fork) and
        // retry on the next auth tick.
        logger.warn(`Sync of ${row.session_id} routed back to local storage; will retry`);
        if (cloudIsNewer) await localGameStore.remove(payload.sessionId);
        failed = true;
        continue;
      }
      await localGameStore.remove(row.session_id); // drop synced rows as we go
      count += 1;
    } catch (e) {
      logger.error(`Failed to sync local game ${row.session_id}:`, e);
      failed = true;
    }
  }
  return { count, failed, empty: false };
};

const LocalGameSync = () => {
  const { user } = useAuth();
  const syncedRef = useRef(false);
  const [importedCount, setImportedCount] = useState(0);
  // Bumped when auth is restored mid-session so the sync effect re-runs even though
  // `user` never went through null (token refresh, silent re-login).
  const [authTick, setAuthTick] = useState(0);

  useEffect(() => {
    if (!supabase) return undefined;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        syncedRef.current = false; // auth is live again: allow another pass
        setAuthTick((t) => t + 1);
      }
    });
    return () => subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || syncedRef.current) return;

    syncedRef.current = true;
    (async () => {
      const { count, failed, empty } = await runLocalGameSyncPass();
      // Leave any failed rows in place and allow a retry on the next auth tick; an
      // empty pass also re-arms so a later fallback save still gets synced.
      if (failed || empty) syncedRef.current = false;
      if (count) setImportedCount(count);
    })();
  }, [user, authTick]);

  if (!importedCount) return null;

  return (
    <div className="local-sync-toast" role="status">
      <span>✓ {importedCount} {importedCount === 1 ? 'game' : 'games'} saved to your account.</span>
      <button onClick={() => setImportedCount(0)} aria-label="Dismiss" className="local-sync-toast-close">✕</button>
    </div>
  );
};

export default LocalGameSync;
