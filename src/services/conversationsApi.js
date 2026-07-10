import { apiFetch, getErrorMessage } from './apiClient';
import { supabase } from './supabaseClient';
import { localGameStore, isUnsyncedLocalRow, isValidBaseRev, rowToPayload } from './localGameStore';
import { ragStore } from './ragStore';
import { unionLedgers } from '../game/heroLedger';
import { buildSaveName } from '../game/saveController';
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

// A 409 from the conversations upsert is the rev protocol speaking (SAVE_SYNC_PLAN
// §6.1): another device advanced the cloud row past this copy's ancestor. The
// error carries the CURRENT row's rev and updated_at (the 409 contract) so the
// caller can fork instead of overwriting.
async function buildRevConflictError(response) {
  let body = null;
  try {
    body = await response.json();
  } catch (e) {
    body = null;
  }
  const err = new Error((body && body.error) || 'Save conflict: another device advanced this save');
  err.status = 409;
  err.code = 'rev_conflict';
  err.rev = Number.isInteger(body?.rev) ? body.rev : undefined;
  err.updatedAt = body?.updated_at;
  return err;
}

// The cloud lineage counter on a backend row/response. Legacy rows and backends
// without the rev column simply have none (renderer-tolerance: never invent one).
const revOf = (row) => (Number.isInteger(row?.rev) && row.rev >= 0 ? row.rev : undefined);

// Attach the optimistic-concurrency guard to an upsert body (only when the caller
// actually holds a lineage marker; legacy saves stay unconditional).
const withExpectedRev = (payload, expectedRev) =>
  isValidBaseRev(expectedRev) ? { ...payload, expectedRev } : payload;

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
    if (response.status === 409) throw await buildRevConflictError(response);
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

  async save(payload, { expectedRev } = {}) {
    return cfFetch('/api/db/conversations', {
      method: 'POST',
      body: JSON.stringify(withExpectedRev(payload, expectedRev)),
    });
  },

  async updateMessages(sessionId, conversationData) {
    return cfFetch(`/api/db/conversations/${sessionId}`, {
      method: 'PUT',
      body: JSON.stringify({ conversation_data: conversationData }),
    });
  },

  async updateName(sessionId, root) {
    // Persist BOTH the editable root (game_settings.saveName, the source of truth that
    // future saves re-derive the display name from) and the derived display name, so the
    // rename survives the next autosave and shows its "<root> - <date> <time>" form now.
    return cfFetch(`/api/db/conversations/${sessionId}/name`, {
      method: 'PUT',
      body: JSON.stringify({ conversationName: buildSaveName(root), saveName: root }),
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

  async save(payload, { expectedRev } = {}) {
    const response = await apiFetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withExpectedRev(payload, expectedRev)),
    });

    if (!response.ok) {
      if (response.status === 409) throw await buildRevConflictError(response);
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

  async updateName(sessionId, root) {
    // See the CF Worker note above: persist the editable root into game_settings.saveName
    // as well as the derived display name, so the next save cannot revert the rename.
    const response = await apiFetch(`/api/conversations/${sessionId}/name`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationName: buildSaveName(root), saveName: root }),
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

// --- Rev-protocol session state (SAVE_SYNC_PLAN §6, Phase 3) -----------------
// sessionBaseRev: the cloud rev the CURRENT page session's copy of a save
// descends from, recorded when getById adopts a cloud copy (load) and after
// every successful push. It seeds base_rev on the local write-ahead row, which
// is what the push protocol sends back as expectedRev.
// forkRedirects: once a live session forks (409), its future saves belong to the
// PARKED timeline, not the adopted cloud row: without the redirect every
// subsequent autosave would 409 again and park a fresh copy each time. The map
// lives only as long as the page session, exactly the lifetime of the in-memory
// game that forked; explicitly loading any copy of the save (getById) clears it.
const sessionBaseRev = new Map();
const forkRedirects = new Map();

// forkRedirects MUST outlive the page session for the resume path (SAVE_SYNC_PLAN
// §6.2 data-recovery fix): after a fork the live session's progress lives in the
// PARKED copy, so a hard reload that reads only the ORIGINAL id would rehydrate the
// abandoned ancestor and strand every post-fork turn. The redirect map is mirrored
// into localStorage so `origId -> parkedId` survives the reload; getById does NOT
// follow it (an explicit load of a copy is deliberate and clears the redirect),
// only the live save path and the resume repoint below rely on it.
const FORK_REDIRECT_STORAGE_KEY = 'dungeongpt:fork-redirects';

const readLocalStorage = (key) => {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
};

const writeLocalStorage = (key, value) => {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch (e) {
    /* private-mode / quota: the in-memory map still works for this page session */
  }
};

const persistForkRedirects = () => {
  if (forkRedirects.size === 0) {
    writeLocalStorage(FORK_REDIRECT_STORAGE_KEY, null);
    return;
  }
  const obj = {};
  for (const [orig, entry] of forkRedirects.entries()) obj[orig] = entry;
  writeLocalStorage(FORK_REDIRECT_STORAGE_KEY, JSON.stringify(obj));
};

const hydrateForkRedirects = () => {
  const raw = readLocalStorage(FORK_REDIRECT_STORAGE_KEY);
  if (!raw) return;
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') {
      for (const [orig, entry] of Object.entries(obj)) {
        if (entry && typeof entry.sessionId === 'string') forkRedirects.set(orig, entry);
      }
    }
  } catch (e) {
    /* corrupt entry: ignore, a fresh fork rewrites it */
  }
};

// Rehydrate persisted redirects once at module load so a post-fork reload still
// steers saves addressed to the original id into the parked copy.
hydrateForkRedirects();

// Per-session save serialization (SAVE_SYNC_PLAN §6.1 hardening). Value is the
// "tail" promise of the most recently queued save for a logical session id; each
// new save chains onto it so two saves for the same id are never in flight at
// once (see conversationsApi.save). Without this, overlapping same-device saves
// race the rev counter and one spuriously forks a "(diverged on this device)"
// copy. Keyed on the ORIGINAL incoming id (before any fork redirect) so a forked
// session's saves stay serialized together. Entries are deleted when the queue
// drains, so the map never grows unbounded.
const saveQueues = new Map();

export const _resetRevStateForTests = () => {
  sessionBaseRev.clear();
  forkRedirects.clear();
  saveQueues.clear();
  writeLocalStorage(FORK_REDIRECT_STORAGE_KEY, null);
};

// Tolerant settings accessor: game_settings may arrive as an object (worker,
// IndexedDB) or a JSON string (older rows/backends).
const parseSettings = (value) => {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (e) {
      return null;
    }
  }
  return value;
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

// The actual save body, run behind the per-session queue in conversationsApi.save.
// Because it is serialized, it reads expectedRev FRESH on every invocation, so a
// save that waited its turn sees the fast-forwarded sessionBaseRev of the save
// ahead of it and cannot false-fork a same-device race.
//
// Write path (Phase 2, §4): local-first write-through. The full row lands in
// IndexedDB FIRST, unconditionally, stamped synced:false; the cloud push follows
// when auth is present and flips the flag on success. Results surface WHERE the
// durable copy is via `storage` ('cloud' | 'local') plus `pendingCloudSync: true`
// when an account-holder's save is still device-only (auth absent OR the push
// failed), so useGamePersistence can report an honest 'savedLocal'. The call only
// throws when even the local write failed (or a cloud-only attempt with no local
// copy failed). Guests: the local write IS the save.
//
// Phase 3 (§6): the cloud push is revision-guarded. expectedRev is the base_rev
// riding on the local write-ahead row (seeded from sessionBaseRev at load time);
// on success the response's new rev becomes the row's base_rev (fast-forward).
// A 409 is a REAL FORK: another device advanced the cloud row past our common
// ancestor. The local timeline is parked as its own save, the cloud row is
// adopted as current, hero-progression ledgers are unioned, and the result says
// `forked: true` so the save UI can be honest (see forkLocalTimeline). Rows and
// sessions without any rev knowledge (legacy saves, guests, pre-migration
// backends) keep today's unconditional push: divergence is never invented.
// Flip the local write-ahead row to synced and advance its base_rev after a
// confirmed cloud push. Retries once, because a silently-swallowed failure here was
// a fork trigger: the row kept base_rev = R while the cloud sat at R+1, so the next
// reconcile read R+1 > R and false-forked. The in-memory sessionBaseRev (set by the
// caller BEFORE this runs) is the authoritative backstop the reconcile pass also
// consults, so even a persistent local-write failure can no longer cause a false
// fork; the retry just keeps the persisted row honest too. Returns nothing (best
// effort): the durable cloud copy already landed.
async function persistSyncedMark(sessionId, mark) {
  try {
    await localGameStore.markSynced(sessionId, mark);
    return;
  } catch (e) {
    logger.warn('markSynced failed; retrying once', e);
  }
  try {
    await localGameStore.markSynced(sessionId, mark);
  } catch (e) {
    logger.error(
      'markSynced failed after retry (row stays pending; sessionBaseRev holds the committed rev so reconcile will not false-fork)',
      e
    );
  }
}

async function runSave(payload) {
  const originalSessionId = payload.sessionId || payload.session_id;
  const redirect = forkRedirects.get(originalSessionId);
  if (redirect) {
    // This live session forked earlier: its timeline continues in the parked
    // copy. The suffix keeps the fork date visible in the saves list.
    payload = {
      ...payload,
      sessionId: redirect.sessionId,
      conversationName: `${payload.conversationName || 'Adventure'}${redirect.suffix}`,
    };
  }
  const sessionId = payload.sessionId || payload.session_id;
  const route = await resolveRoute();

  let localRow = null;
  let localWriteError = null;
  try {
    const opts = { synced: false, pendingCloudSync: route.pendingCloudSync };
    const loadBaseRev = sessionBaseRev.get(sessionId);
    if (isValidBaseRev(loadBaseRev)) opts.baseRev = loadBaseRev;
    localRow = await localGameStore.save(payload, opts);
  } catch (e) {
    localWriteError = e;
    logger.error('Local write-ahead save failed', e);
  }

  if (route.useCloud) {
    const expectedRev = isValidBaseRev(localRow?.base_rev)
      ? localRow.base_rev
      : sessionBaseRev.get(sessionId);
    try {
      const result = await backend.save(payload, { expectedRev });
      const newRev = revOf(result);
      if (newRev !== undefined) sessionBaseRev.set(sessionId, newRev);
      if (localRow) {
        // Confirmed in the account: flip the dirty flag (guarded so a save that
        // rewrote the row mid-push keeps its synced:false) and advance the
        // row's lineage to the rev the cloud row now carries.
        const mark = { ifUpdatedAt: localRow.updated_at };
        if (newRev !== undefined) mark.baseRev = newRev;
        await persistSyncedMark(localRow.session_id, mark);
      }
      return { ...(result || {}), storage: 'cloud' };
    } catch (e) {
      if (e && e.status === 409) {
        logger.warn(`Rev conflict on ${sessionId} (cloud rev ${e.rev}); forking the local timeline`, e);
        return forkLocalTimeline(sessionId, payload);
      }
      if (!localRow) throw e; // nothing landed anywhere: a real save error
      logger.warn('Cloud push failed; the save is on this device pending sync', e);
      return { ...localRow, storage: 'local', pendingCloudSync: true };
    }
  }

  if (!localRow) throw localWriteError;
  return { ...localRow, storage: 'local', pendingCloudSync: !!localRow.pending_cloud_sync };
}

// Per-session serialization primitive (SAVE_SYNC_PLAN §6.1). Chains `task` behind
// the most recently queued work for `sessionId` so two operations for the same
// logical save are never in flight at once. Both save() and reconcileLocalRow()
// share this queue so a live save and a reconcile pass for the same id are ordered,
// never racing the rev counter. The stored tail swallows rejections so a failure
// cannot wedge the chain; the caller still receives the real result/rejection.
function enqueueForSession(sessionId, task) {
  if (!sessionId) return task();
  const prev = saveQueues.get(sessionId) || Promise.resolve();
  const run = prev.then(task, task);
  const tail = run.catch(() => {});
  saveQueues.set(sessionId, tail);
  tail.then(() => {
    if (saveQueues.get(sessionId) === tail) saveQueues.delete(sessionId);
  });
  return run;
}

// The greater of the row's persisted base_rev and the in-memory sessionBaseRev for
// this id. sessionBaseRev is set synchronously right after every successful push,
// so it survives a lagged/failed local markSynced write: consulting it here closes
// the false-fork window where a committed R->R+1 had not yet reached the local row.
const authoritativeBaseRev = (sessionId, localRow) => {
  let best;
  for (const candidate of [localRow?.base_rev, sessionBaseRev.get(sessionId)]) {
    if (isValidBaseRev(candidate) && (best === undefined || candidate > best)) best = candidate;
  }
  return best;
};

// Serialized reconcile of ONE local row against the cloud (SAVE_SYNC_PLAN §6.1
// hardening, the reconcile counterpart of the save serialization). Runs INSIDE the
// per-session queue and re-reads BOTH the local row and the cloud rev FRESH, right
// before deciding, so a save that committed R->R+1 on this device (whether or not
// its local markSynced has landed yet) can never be mistaken for a cross-device
// divergence. A fork is raised only on a GENUINE advance (cloud rev strictly beyond
// the rev this device last synced, or the legacy timestamp fallback), never on this
// device's own in-flight lag. Returns a status the reconcile pass interprets:
//   'gone'         - the row vanished while we waited (parked/pruned by the save ahead)
//   'synced'       - already in the account (the save ahead marked it synced)
//   'pendingLocal' - auth vanished mid-pass, or the upload routed back to local
//   'failed'       - reading the local row failed
//   'uploaded'     - pushed to the cloud (pruned here when non-live)
//   'forked'       - genuine divergence: local timeline parked as its own save
async function runReconcile(sessionId, { isLive } = {}) {
  let localRow;
  try {
    localRow = await localGameStore.getById(sessionId);
  } catch (e) {
    logger.error(`Reconcile could not read local row ${sessionId}:`, e);
    return { status: 'failed' };
  }
  if (!localRow) return { status: 'gone' };
  if (localRow.synced === true) return { status: 'synced' };

  const route = await resolveRoute();
  if (!route.useCloud) return { status: 'pendingLocal' };

  let cloudRow = null;
  try {
    cloudRow = await backend.getById(sessionId);
  } catch (e) {
    cloudRow = null; // 404 or fetch failure: no cloud copy this row must yield to
  }

  const cloudRev = revOf(cloudRow);
  const knownBaseRev = authoritativeBaseRev(sessionId, localRow);

  let diverged;
  if (cloudRev !== undefined && knownBaseRev !== undefined) {
    diverged = cloudRev > knownBaseRev; // genuine cross-device advance only
  } else {
    const cloudTime = cloudRow?.updated_at ? Date.parse(cloudRow.updated_at) : NaN;
    const localTime = localRow.updated_at ? Date.parse(localRow.updated_at) : NaN;
    diverged = Number.isFinite(cloudTime) && Number.isFinite(localTime) && cloudTime > localTime;
  }

  if (diverged) {
    logger.warn(`Cloud copy of ${sessionId} advanced past this device; parking the local timeline`);
    const forkResult = await forkLocalTimeline(sessionId, rowToPayload(localRow));
    return { status: 'forked', ...forkResult };
  }

  // Cloud behind or absent: upload as-is under the same id. runSave (not save()) so
  // we do not re-enter the queue we already hold; a genuine 409 inside still forks.
  logger.info(`Uploading local game ${sessionId} (cloud copy ${cloudRow ? 'behind' : 'absent'})`);
  const result = await runSave(rowToPayload(localRow));
  if (result?.forked) return { status: 'forked', ...result };
  if (result?.storage === 'local') return { status: 'pendingLocal' };
  if (!isLive) {
    // Pushed and this is not the live write-ahead copy: prune it.
    try {
      await localGameStore.remove(sessionId);
    } catch (e) {
      logger.warn(`Failed to prune synced local copy of ${sessionId}:`, e);
    }
  }
  return { status: 'uploaded' };
}

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
  // Phase 3 (§6.1): resolving a copy re-establishes this page session's lineage
  // for the id. Adopting the CLOUD copy records its rev as the session's baseRev
  // (the next save descends from it); adopting the LOCAL copy defers to the
  // base_rev riding on that row. Either way a stale fork redirect is cleared:
  // an explicit load supersedes whatever fork happened earlier in this session.
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

    const adopt = (row, fromCloud) => {
      // An explicit load of this id supersedes any earlier fork: clear the redirect
      // (and its persisted mirror) so future saves target this adopted row directly.
      if (forkRedirects.delete(sessionId)) persistForkRedirects();
      const rev = fromCloud ? revOf(row) : undefined;
      if (rev !== undefined) {
        sessionBaseRev.set(sessionId, rev);
      } else {
        sessionBaseRev.delete(sessionId);
      }
      return row;
    };

    if (!localRow) {
      if (cloudError) throw cloudError;
      return adopt(cloudRow, true);
    }
    if (!cloudRow) return adopt(localRow, false);
    return localIsNewer(cloudRow, localRow) ? adopt(localRow, false) : adopt(cloudRow, true);
  },

  // Write path (Phase 2/3). The heavy lifting lives in runSave (see its doc for the
  // write-through + rev-guard contract); this wrapper only serializes saves per
  // logical session so overlapping same-device saves cannot race the rev counter.
  save(payload) {
    // Serialize saves per logical session (SAVE_SYNC_PLAN §6.1 hardening). Every
    // action schedules a debounced save, and there are also 30s-autosave, unmount
    // and manual saves with no in-flight guard, so two saves overlap routinely.
    // Overlapping saves both capture the same expectedRev: the first commits
    // (rev R -> R+1) and fast-forwards sessionBaseRev, the second still carries the
    // now-stale R, 409s, and spuriously forks a "(diverged on this device)" copy
    // even though NO other device is involved (and re-collides recursively). By
    // chaining each save behind the previous one for the same id, the second runs
    // only after the first has settled and reads expectedRev FRESH, so it matches
    // the server and never false-forks. After serialization a 409 can only mean a
    // genuine other-device advance, so real divergence detection is preserved.
    //
    // Keyed on the ORIGINAL incoming id (before any forkRedirects redirection) so a
    // legitimately-forked session's saves stay serialized with each other too. The
    // recursive parked-copy save inside forkLocalTimeline carries a fresh id, a
    // different key, so it cannot deadlock against the queue it runs within.
    const originalSessionId = payload.sessionId || payload.session_id;
    return enqueueForSession(originalSessionId, () => runSave(payload));
  },

  // Reconcile ONE local row against the cloud, SERIALIZED under the same per-session
  // queue as save() (SAVE_SYNC_PLAN §6.1 hardening). LocalGameSync's pass calls this
  // instead of deciding divergence on data it read outside the lock: routing the
  // check + any fork through the queue means an in-flight save's rev bump is settled
  // (and re-read fresh) before any fork verdict, so a same-device R->R+1 can never be
  // mistaken for a cross-device divergence. See runReconcile for the returned status.
  reconcileLocalRow(sessionId, opts = {}) {
    if (!sessionId) return Promise.resolve({ status: 'gone' });
    return enqueueForSession(sessionId, () => runReconcile(sessionId, opts));
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
        // The PUT bumps the cloud rev (content write): track the new lineage so
        // the next guarded save does not fork against our own update.
        const newRev = revOf(result);
        if (newRev !== undefined) sessionBaseRev.set(sessionId, newRev);
        if (localRow) {
          const mark = { ifUpdatedAt: localRow.updated_at };
          if (newRev !== undefined) mark.baseRev = newRev;
          await persistSyncedMark(sessionId, mark);
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

  async updateName(sessionId, root) {
    // `root` is the player-editable base name (NOT the full display name). Both stores
    // derive "<root> - <date> <time>" and persist the root in game_settings.saveName.
    const route = await resolveRoute();
    if (!route.useCloud) return localGameStore.updateName(sessionId, root);
    const result = await backend.updateName(sessionId, root);
    // Keep an UNSYNCED local copy's name in step: the cloud rename stamps the cloud
    // row newer, and without this the next reconcile would park real local progress
    // as a "diverged" fork over a mere rename. Synced local copies stay untouched
    // (their content already lives in the account; bumping their updated_at would
    // let stale content win the newer-of-two reads).
    try {
      const localRow = await localGameStore.getById(sessionId);
      if (localRow && isUnsyncedLocalRow(localRow)) {
        await localGameStore.updateName(sessionId, root);
      }
    } catch (e) {
      logger.warn('Local rename skipped', e);
    }
    return result;
  },

  // Deleting while signed in removes BOTH copies, otherwise the merged list would
  // resurrect the row from the surviving store. A cloud miss (e.g. the row only
  // ever lived on this device) still counts as success when a local copy existed.
  // Either way the save's RAG vectors are purged too (#17): they are keyed by
  // sessionId in their own IndexedDB, so without this a deleted save strands its
  // embeddings forever. Guests included, and parked diverged copies too: a
  // "<sid>-local-<rand>" copy is its own session id, so deleting it through this
  // same path purges exactly its own index (vectors embedded while the ORIGINAL
  // id was live stay with the original save, which owns them).
  async remove(sessionId) {
    const route = await resolveRoute();
    if (!route.useCloud) {
      const result = await localGameStore.remove(sessionId);
      await purgeRagIndex(sessionId);
      return result;
    }

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
    await purgeRagIndex(sessionId);
    return result || { success: true };
  }
};

// #17: best-effort RAG-index cleanup for a deleted save. Never blocks or fails
// the delete itself; a purge error just means the vectors linger (yesterday's
// status quo) until the next delete or a manual reset.
async function purgeRagIndex(sessionId) {
  try {
    await ragStore.clearSession(sessionId);
  } catch (e) {
    logger.warn(`RAG index purge failed for ${sessionId} (embeddings may linger)`, e);
  }
}

// Short random suffix for parking a diverged local copy under its own session_id
// (same naming as the Phase 1 reconcile parking: "<sid>-local-<rand>").
const shortId = () => Math.random().toString(36).slice(2, 8);

// Ledger-union on fork (SAVE_SYNC_PLAN 9.2): the parked timeline's hero-grant
// events are merged into the ADOPTED cloud row's settings.heroLedger (deduped by
// event identity, see heroLedger.unionLedgers), so XP/gold/items EARNED on the
// losing timeline are not lost even though its narrative fork is parked. The
// heroes themselves are NOT rewritten here: the existing load-time reconcile
// machinery (Game.js -> reconcileHeroWithLedger) raises the adopted heroes up to
// the union sums on the next load and announces it through the existing
// "Restored:" system line. The write-back is itself rev-guarded (expectedRev =
// the fetched row's rev): if yet another device races us, we skip rather than
// clobber; the parked copy still holds every event, nothing is lost. Note the
// guarded write-back bumps the adopted row's rev, so a device CURRENTLY live on
// that row will itself fork once on its next save: rare (requires two
// simultaneously live devices) and lossless by the same mechanism.
// Returns true when the union landed in the cloud row.
const unionLedgerIntoAdoptedRow = async (sessionId, localPayload) => {
  const localSettings = parseSettings(
    localPayload.gameSettings || localPayload.settingsSnapshot || localPayload.game_settings
  );
  const localLedger = localSettings?.heroLedger;
  if (!Array.isArray(localLedger) || localLedger.length === 0) return false;

  const cloudRow = await backend.getById(sessionId);
  const cloudRev = revOf(cloudRow);
  if (cloudRev === undefined) return false; // cannot guard the write-back: skip

  const cloudSettings = parseSettings(cloudRow.game_settings) || {};
  const { ledger, added, aborted } = unionLedgers(cloudSettings.heroLedger, localLedger);
  if (aborted) {
    logger.warn(`Ledger union skipped for ${sessionId}: unshared rollups on the two timelines`);
    return false;
  }
  if (added === 0) return false;

  await backend.save(
    {
      ...rowToPayload(cloudRow),
      gameSettings: { ...cloudSettings, heroLedger: ledger },
    },
    { expectedRev: cloudRev }
  );
  logger.info(`Ledger union merged ${added} event(s) from the parked timeline into ${sessionId}`);
  return true;
};

// Fork resolution (SAVE_SYNC_PLAN §6.2): never merge narrative timelines, never
// silent last-write-wins. The local timeline becomes its OWN save (parked,
// Dropbox-style, uploaded through the normal write-through), the cloud row is
// adopted as current for the original id (its local shadow is dropped so the
// next getById/list resolves to it), hero progression is unioned into the
// adopted row (9.2), and future saves from the still-live session are redirected
// to the parked copy so one fork parks exactly one copy. Exported for the
// reconcile pass (LocalGameSync), which detects divergence before pushing;
// conversationsApi.save reaches it through the 409 path.
export const forkLocalTimeline = async (sessionId, payload) => {
  const parkedSessionId = `${sessionId}-local-${shortId()}`;
  const suffix = ` (diverged on this device, ${new Date().toLocaleDateString()})`;
  const parkedPayload = {
    ...payload,
    sessionId: parkedSessionId,
    conversationName: `${payload.conversationName || 'Adventure'}${suffix}`,
  };

  // 1. Park the local timeline as its own save. Recursion into save() is safe:
  //    a brand-new session_id has no lineage, so its push is unconditional and
  //    cannot 409. If the push fails the parked row stays local and pending; the
  //    reconcile pass uploads it later (no cloud twin exists for the new id).
  const parkedResult = await conversationsApi.save(parkedPayload);

  // 2. Union the hero-grant ledgers into the adopted cloud row (best effort:
  //    a failure here loses nothing, the parked copy holds the full ledger).
  let ledgerMerged = false;
  try {
    ledgerMerged = await unionLedgerIntoAdoptedRow(sessionId, payload);
  } catch (e) {
    logger.warn(`Ledger union failed for ${sessionId} (parked copy keeps the events)`, e);
  }

  // 3. Adopt the cloud row as current: drop the local shadow of the original id
  //    (its content lives on in the parked copy) so newer-of-two reads resolve
  //    to the cloud timeline.
  try {
    await localGameStore.remove(sessionId);
  } catch (e) {
    logger.warn(`Could not drop the local shadow of ${sessionId} after forking`, e);
  }
  // The live session's lineage now belongs to the PARKED copy (its base_rev was
  // established by the parked save above), NOT the ancestor: clear the ancestor's
  // sessionBaseRev so the union write-back's out-of-band rev bump on that row can
  // never make a future save descend from a stale lineage. Redirect + persist so
  // both this runtime's saves AND a subsequent reload steer to the parked copy.
  sessionBaseRev.delete(sessionId);
  forkRedirects.set(sessionId, { sessionId: parkedSessionId, suffix });
  persistForkRedirects();

  // Data-recovery keystone (SAVE_SYNC_PLAN §6.2): if the forked id is the one the
  // app resumes on reload, repoint the resume pointer at the parked copy. Otherwise
  // a hard reload would rehydrate the abandoned ancestor and strand every post-fork
  // turn. Only the LIVE id is repointed; a reconcile parking some other stale copy
  // must not hijack the active game's resume pointer.
  try {
    if (readLocalStorage('activeGameSessionId') === sessionId) {
      writeLocalStorage('activeGameSessionId', parkedSessionId);
    }
  } catch (e) {
    /* ignore: the in-memory redirect still covers this runtime's saves */
  }

  const pendingCloudSync = parkedResult?.storage === 'local' || !!parkedResult?.pendingCloudSync;
  return {
    ...(parkedResult || {}),
    forked: true,
    parkedSessionId,
    ledgerMerged,
    pendingCloudSync,
  };
};
