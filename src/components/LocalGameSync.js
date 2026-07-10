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
import { localGameStore, rowToPayload } from '../services/localGameStore';
import { supabase } from '../services/supabaseClient';
import { PENDING_LOCAL_SAVE_EVENT } from '../game/saveController';
import { createLogger } from '../utils/logger';

const logger = createLogger('local-game-sync');

// localGameStore rows are stored in the backend's snake_case shape; conversationsApi.save
// expects the camelCase payload. The mapping lives next to the row shape in
// localGameStore (rowToPayload); re-exported here for the round-trip tests and
// any older imports.
export { rowToPayload };

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
//   neither field: guest saves must still convert losslessly) are handed to
//   conversationsApi.reconcileLocalRow, which runs the WHOLE divergence check +
//   upload/fork INSIDE the per-session save queue (SAVE_SYNC_PLAN §6.1 hardening).
//   Deciding under the lock, on a FRESH re-read of the cloud rev and the local row,
//   is what stops a live save's own in-flight R->R+1 from being mistaken for a
//   cross-device divergence and false-forked. A genuine advance still parks the
//   local timeline as its own "(diverged on this device)" save; cloud behind or
//   missing uploads as-is under the same id.
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
      // upload; prune the cache copy unless this is the live session. (Safe outside
      // the lock: pruning a copy already in the cloud makes no fork decision.)
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
      // The divergence check, the upload, and any fork all happen inside the
      // per-session queue: no fork verdict is ever made on data read outside it.
      const result = await conversationsApi.reconcileLocalRow(row.session_id, { isLive });
      switch (result?.status) {
        case 'uploaded':
        case 'forked':
          // Progress reached (or was parked into) the account. A parked copy that
          // stayed device-only (auth vanished mid-pass) is not counted; it uploads
          // under its own id on a later pass.
          if (result.pendingCloudSync) failed = true;
          else count += 1;
          break;
        case 'pendingLocal':
        case 'failed':
          // Auth vanished mid-pass, or the write routed back to local storage: keep
          // the row and retry on the next auth tick.
          failed = true;
          break;
        case 'synced':
        case 'gone':
        default:
          // Already synced by the save ahead of us, or the row was parked/pruned
          // while we waited: nothing to do, nothing failed.
          break;
      }
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
