import { apiFetch, getErrorMessage } from './apiClient';
import { supabase } from './supabaseClient';
import { localGameStore, isUnsyncedLocalRow } from './localGameStore';
import { createLogger } from '../utils/logger';

const logger = createLogger('conversations-api');

// Use CF Worker in production, Express/SQLite in dev
const forceSQLite = process.env.REACT_APP_USE_SQLITE === 'true';
const isProduction = process.env.REACT_APP_CF_PAGES === 'true';
const useCfWorker = !forceSQLite && isProduction;

if (useCfWorker) {
  console.log('[conversationsApi] Using CF Worker backend (production)');
} else {
  console.log('[conversationsApi] Using Express/SQLite backend (dev)', forceSQLite ? '(forced via REACT_APP_USE_SQLITE)' : '');
}

const CF_WORKER_URL = process.env.REACT_APP_CF_WORKER_URL || '';

async function cfFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  const response = await fetch(`${CF_WORKER_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const msg = await getErrorMessage(response, `Request failed: ${path}`);
    throw new Error(msg);
  }
  return response.json();
}

// CF Worker implementation (production)
const cfWorkerConversationsApi = {
  async list() {
    return cfFetch('/api/db/conversations');
  },

  async getById(sessionId) {
    return cfFetch(`/api/db/conversations/${sessionId}`);
  },

  async save(payload) {
    return cfFetch('/api/db/conversations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateMessages(sessionId, conversationData) {
    return cfFetch(`/api/db/conversations/${sessionId}`, {
      method: 'PUT',
      body: JSON.stringify({ conversation_data: conversationData }),
    });
  },

  async updateName(sessionId, conversationName) {
    return cfFetch(`/api/db/conversations/${sessionId}/name`, {
      method: 'PUT',
      body: JSON.stringify({ conversationName }),
    });
  },

  async remove(sessionId) {
    return cfFetch(`/api/db/conversations/${sessionId}`, {
      method: 'DELETE',
    });
  }
};

// Express implementation (local dev)
const expressConversationsApi = {
  async list() {
    const response = await apiFetch('/api/conversations');
    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to fetch conversations'));
    }
    return response.json();
  },

  async getById(sessionId) {
    const response = await apiFetch(`/api/conversations/${sessionId}`);
    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to load conversation'));
    }
    return response.json();
  },

  async save(payload) {
    const response = await apiFetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to save conversation'));
    }
    return response.json();
  },

  async updateMessages(sessionId, conversationData) {
    const response = await apiFetch(`/api/conversations/${sessionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_data: conversationData }),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to update conversation'));
    }
    return response.json();
  },

  async updateName(sessionId, conversationName) {
    const response = await apiFetch(`/api/conversations/${sessionId}/name`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationName }),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to update conversation name'));
    }
    return response.json();
  },

  async remove(sessionId) {
    const response = await apiFetch(`/api/conversations/${sessionId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Failed to delete conversation'));
    }
    return response.json();
  }
};

const backend = useCfWorker ? cfWorkerConversationsApi : expressConversationsApi;

// Logged-out (guest) players save/load games to a browser-local IndexedDB store;
// signed-in players use the cloud backend. Local games are synced on sign-in.
//
// Auth-state tracking (SAVE_SYNC_PLAN Phase 1, §4): a failed getSession() is
// "unknown", not "guest". A transient auth-check blip must not silently reroute an
// account-holder's saves as if the player were a plain guest. lastKnownAuth
// remembers the last *successful* check; hasSeenSignedIn remembers whether this
// page session ever had a live sign-in, so a token that quietly dies mid-session
// still counts as "this player has an account".
const AUTH_SIGNED_IN = 'signed-in';
const AUTH_GUEST = 'guest';
const AUTH_UNKNOWN = 'unknown';

let lastKnownAuth = AUTH_UNKNOWN;
let hasSeenSignedIn = false;

export const getLastKnownAuth = () => lastKnownAuth;

export const _resetAuthStateForTests = () => {
  lastKnownAuth = AUTH_UNKNOWN;
  hasSeenSignedIn = false;
};

// Route one call: cloud when signed in, local otherwise. `pendingCloudSync` marks a
// local write as a *fallback* for an account-holding player (the row gets stamped so
// the UI can be honest and LocalGameSync can heal it later). Plain guests are never
// stamped: local IS their home store, not a pending state.
async function resolveRoute() {
  if (!supabase) {
    // Auth is disabled entirely (missing env), so local is the only store.
    lastKnownAuth = AUTH_GUEST;
    return { useCloud: false, pendingCloudSync: false };
  }
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const signedIn = !!session?.access_token;
    lastKnownAuth = signedIn ? AUTH_SIGNED_IN : AUTH_GUEST;
    if (signedIn) hasSeenSignedIn = true;
    // Confirmed signed out: still a fallback if the player signed in earlier this
    // session (their token expired mid-game); a never-signed-in guest is not.
    return { useCloud: signedIn, pendingCloudSync: !signedIn && hasSeenSignedIn };
  } catch (e) {
    logger.warn(`Auth check failed; routing local (last known auth: ${lastKnownAuth})`, e);
    // The player could be signed in behind the blip: stamp pending unless we have
    // positive knowledge they are a plain guest ('unknown' counts as pending-eligible).
    return { useCloud: false, pendingCloudSync: hasSeenSignedIn || lastKnownAuth !== AUTH_GUEST };
  }
}

// Row-time helper for the newer-of-two-copies reads (SAVE_SYNC_PLAN §4, timestamp
// comparison until the rev protocol of §6 lands). NaN for missing/unparseable.
const rowTime = (row) => Date.parse(row?.updated_at || row?.timestamp || '');

// The local copy wins only when it is strictly, provably newer; every other case
// (older, tie, unparseable timestamps, legacy rows without them) prefers the cloud
// copy, the durable home. Never invents divergence for old saves.
const localIsNewer = (cloudRow, localRow) => {
  const cloud = rowTime(cloudRow);
  const local = rowTime(localRow);
  return Number.isFinite(local) && (!Number.isFinite(cloud) || local > cloud);
};

export const conversationsApi = {
  // Merged saved-games list (Phase 2, §4): the union of both stores by session_id,
  // newest copy winning the row. Every row is annotated with `storage`
  // ('cloud' | 'local' | 'both') and `pendingCloudSync` (true only when the newest
  // copy is a local one still awaiting its cloud push) so the UI can badge honestly.
  // Guests keep seeing exactly their local list, annotations aside.
  async list() {
    const route = await resolveRoute();
    const localRows = await localGameStore.list(); // [] on store failure
    if (!route.useCloud) {
      return localRows.map((row) => ({ ...row, storage: 'local', pendingCloudSync: isUnsyncedLocalRow(row) }));
    }

    let cloudRows;
    try {
      cloudRows = (await backend.list()) || [];
    } catch (e) {
      // Cloud unreachable: local saves are still worth showing. With nothing local
      // either, surface the original error as before.
      if (!localRows.length) throw e;
      logger.warn('Cloud list failed; showing local saves only', e);
      return localRows.map((row) => ({ ...row, storage: 'local', pendingCloudSync: isUnsyncedLocalRow(row) }));
    }

    const merged = new Map();
    for (const row of cloudRows) {
      const sid = row.session_id || row.sessionId;
      merged.set(sid, { ...row, sessionId: row.sessionId || sid, storage: 'cloud', pendingCloudSync: false });
    }
    for (const localRow of localRows) {
      const sid = localRow.session_id;
      const cloudCopy = merged.get(sid);
      if (!cloudCopy) {
        merged.set(sid, { ...localRow, storage: 'local', pendingCloudSync: isUnsyncedLocalRow(localRow) });
      } else if (localIsNewer(cloudCopy, localRow)) {
        merged.set(sid, { ...localRow, storage: 'both', pendingCloudSync: isUnsyncedLocalRow(localRow) });
      } else {
        merged.set(sid, { ...cloudCopy, storage: 'both' });
      }
    }
    return [...merged.values()];
  },

  // Read path (Phase 2, §4): return the NEWER of the two copies. The older copy is
  // never deleted here; reconcile (LocalGameSync) heals or prunes it later.
  async getById(sessionId) {
    const route = await resolveRoute();
    if (!route.useCloud) return localGameStore.getById(sessionId);

    let cloudRow = null;
    let cloudError = null;
    try {
      cloudRow = await backend.getById(sessionId);
    } catch (e) {
      cloudError = e;
    }
    let localRow = null;
    try {
      localRow = await localGameStore.getById(sessionId);
    } catch (e) {
      localRow = null;
    }

    if (!localRow) {
      if (cloudError) throw cloudError;
      return cloudRow;
    }
    if (!cloudRow) return localRow;
    return localIsNewer(cloudRow, localRow) ? localRow : cloudRow;
  },

  // Write path (Phase 2, §4): local-first write-through. The full row lands in
  // IndexedDB FIRST, unconditionally, stamped synced:false; the cloud push follows
  // when auth is present and flips the flag on success. Results surface WHERE the
  // durable copy is via `storage` ('cloud' | 'local') plus `pendingCloudSync: true`
  // when an account-holder's save is still device-only (auth absent OR the push
  // failed), so useGamePersistence can report an honest 'savedLocal'. The call only
  // throws when even the local write failed (or a cloud-only attempt with no local
  // copy failed). Guests: the local write IS the save.
  async save(payload) {
    const route = await resolveRoute();

    let localRow = null;
    let localWriteError = null;
    try {
      localRow = await localGameStore.save(payload, { synced: false, pendingCloudSync: route.pendingCloudSync });
    } catch (e) {
      localWriteError = e;
      logger.error('Local write-ahead save failed', e);
    }

    if (route.useCloud) {
      try {
        const result = await backend.save(payload);
        if (localRow) {
          // Confirmed in the account: flip the dirty flag (guarded so a save that
          // rewrote the row mid-push keeps its synced:false).
          try {
            await localGameStore.markSynced(localRow.session_id, { ifUpdatedAt: localRow.updated_at });
          } catch (e) {
            logger.warn('markSynced failed (row stays pending, reconcile will retry)', e);
          }
        }
        return { ...(result || {}), storage: 'cloud' };
      } catch (e) {
        if (!localRow) throw e; // nothing landed anywhere: a real save error
        logger.warn('Cloud push failed; the save is on this device pending sync', e);
        return { ...localRow, storage: 'local', pendingCloudSync: true };
      }
    }

    if (!localRow) throw localWriteError;
    return { ...localRow, storage: 'local', pendingCloudSync: !!localRow.pending_cloud_sync };
  },

  // Same write-through contract as save(), for the message-only update path. When
  // no local copy exists (e.g. debug tooling on a cloud-only row) the cloud write
  // proceeds alone, as before.
  async updateMessages(sessionId, conversationData) {
    const route = await resolveRoute();

    let localRow = null;
    let localWriteError = null;
    try {
      localRow = await localGameStore.updateMessages(sessionId, conversationData, {
        synced: false,
        pendingCloudSync: route.pendingCloudSync
      });
    } catch (e) {
      localWriteError = e;
      logger.error('Local write-ahead update failed', e);
    }

    if (route.useCloud) {
      try {
        const result = await backend.updateMessages(sessionId, conversationData);
        if (localRow) {
          try {
            await localGameStore.markSynced(sessionId, { ifUpdatedAt: localRow.updated_at });
          } catch (e) {
            logger.warn('markSynced failed (row stays pending, reconcile will retry)', e);
          }
        }
        return { ...(result || {}), storage: 'cloud' };
      } catch (e) {
        if (!localRow) throw e;
        logger.warn('Cloud push failed; the update is on this device pending sync', e);
        return { ...localRow, storage: 'local', pendingCloudSync: true };
      }
    }

    if (localWriteError) throw localWriteError;
    return localRow ? { ...localRow, storage: 'local', pendingCloudSync: !!localRow.pending_cloud_sync } : localRow;
  },

  async updateName(sessionId, conversationName) {
    const route = await resolveRoute();
    if (!route.useCloud) return localGameStore.updateName(sessionId, conversationName);
    const result = await backend.updateName(sessionId, conversationName);
    // Keep an UNSYNCED local copy's name in step: the cloud rename stamps the cloud
    // row newer, and without this the next reconcile would park real local progress
    // as a "diverged" fork over a mere rename. Synced local copies stay untouched
    // (their content already lives in the account; bumping their updated_at would
    // let stale content win the newer-of-two reads).
    try {
      const localRow = await localGameStore.getById(sessionId);
      if (localRow && isUnsyncedLocalRow(localRow)) {
        await localGameStore.updateName(sessionId, conversationName);
      }
    } catch (e) {
      logger.warn('Local rename skipped', e);
    }
    return result;
  },

  // Deleting while signed in removes BOTH copies, otherwise the merged list would
  // resurrect the row from the surviving store. A cloud miss (e.g. the row only
  // ever lived on this device) still counts as success when a local copy existed.
  async remove(sessionId) {
    const route = await resolveRoute();
    if (!route.useCloud) return localGameStore.remove(sessionId);

    let localRow = null;
    try {
      localRow = await localGameStore.getById(sessionId);
    } catch (e) {
      localRow = null;
    }
    let result = null;
    let cloudError = null;
    try {
      result = await backend.remove(sessionId);
    } catch (e) {
      cloudError = e;
    }
    if (localRow) {
      try {
        await localGameStore.remove(sessionId);
      } catch (e) {
        logger.warn('Local delete failed', e);
      }
    }
    if (cloudError && !localRow) throw cloudError;
    return result || { success: true };
  }
};
