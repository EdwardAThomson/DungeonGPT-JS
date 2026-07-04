// LocalGameSync.js
// Reconcile pass for browser-local saved games (SAVE_SYNC_PLAN Phase 2): pushes
// unsynced local rows to the signed-in player's account, marks or prunes rows that
// are already there, and parks genuinely diverged copies as separate saves. Also
// still the guest-to-account conversion path (docs/GUEST_MODE_PLAN.md, B2), and
// mirrors LocalHeroSync (heroes). Runs on app start with a session present, after
// sign-in, on auth restoration mid-session (token refresh), and whenever a save
// reports 'savedLocal' (PENDING_LOCAL_SAVE_EVENT); renders a small confirmation
// toast when games reach the account.

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { conversationsApi } from '../services/conversationsApi';
import { localGameStore } from '../services/localGameStore';
import { supabase } from '../services/supabaseClient';
import { PENDING_LOCAL_SAVE_EVENT } from '../game/saveController';
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

// The live session keeps its local write-ahead copy (§10 leaning: keep while live);
// only other sessions' local rows may be pruned once they are safely in the cloud.
const getLiveSessionId = () => {
  try {
    return localStorage.getItem('activeGameSessionId') || null;
  } catch (e) {
    return null;
  }
};

// One reconcile pass (exported for tests). For each local row:
// - Rows explicitly marked synced:true are already in the account: the LIVE
//   session's copy is kept (write-ahead cache), any other is pruned (Phase 2, §4).
// - Unsynced rows (synced:false, a Phase 1 pending stamp, or legacy rows with
//   neither field: guest saves must still convert losslessly) are pushed with the
//   timestamp guard: if the cloud already holds a NEWER copy of the same session,
//   do NOT overwrite it (§5/§6.2): park the local copy as a separate save (new
//   session_id, name suffixed "(diverged on this device, <date>)") so both
//   timelines survive. Otherwise (cloud older or missing) upload as-is, same
//   session_id. After a successful push the live session's row is marked synced
//   and kept; other rows are removed.
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

  const liveSessionId = getLiveSessionId();
  let count = 0;
  let failed = false;
  for (const row of rows) {
    const isLive = row.session_id === liveSessionId;
    if (row.synced === true) {
      // Already in the account (write-through confirmed the push). Nothing to
      // upload; prune the cache copy unless this is the live session.
      if (!isLive) {
        try {
          await localGameStore.remove(row.session_id);
        } catch (e) {
          logger.warn(`Failed to prune synced local copy of ${row.session_id}:`, e);
        }
      }
      continue;
    }
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
      if (isLive && !cloudIsNewer) {
        // The live session keeps its write-ahead copy. The write-through inside
        // conversationsApi.save normally re-marks it synced already; this guarded
        // mark covers save paths that skip the local store. ifUpdatedAt makes it a
        // no-op whenever the row was rewritten since the pass listed it, so a
        // fresher unsynced write never gets mislabelled as synced.
        await localGameStore.markSynced(row.session_id, { ifUpdatedAt: row.updated_at });
      } else {
        await localGameStore.remove(row.session_id); // pushed: prune the local copy
      }
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

  // Phase 2 reconcile trigger: a save just reported 'savedLocal' (device-only). If
  // the player still counts as signed in, retry the push now; if auth is truly gone,
  // the pass routes local again, stays armed, and the auth events above pick it up.
  useEffect(() => {
    const onPendingLocalSave = () => {
      syncedRef.current = false;
      setAuthTick((t) => t + 1);
    };
    window.addEventListener(PENDING_LOCAL_SAVE_EVENT, onPendingLocalSave);
    return () => window.removeEventListener(PENDING_LOCAL_SAVE_EVENT, onPendingLocalSave);
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
