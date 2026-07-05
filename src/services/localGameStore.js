// localGameStore.js
// Browser-local saved games for guest play, kept in IndexedDB (game state is far
// larger than heroes — conversation history, world map, town caches). Mirrors the
// conversationsApi interface AND the backend's payload->row mapping (cf-worker
// db.ts /conversations) so the load path is identical to cloud saves. Synced to
// the cloud on sign-in (see LocalGameSync, Phase B2).

import { createLogger } from '../utils/logger';
import { buildSaveName, DEFAULT_SAVE_ROOT } from '../game/saveController';

const logger = createLogger('local-game-store');
const DB_NAME = 'dungeongpt-games';
const DB_VERSION = 1;
const STORE = 'games';

const openDB = () =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'session_id' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });

// One request per transaction keeps us clear of IndexedDB's auto-commit gotcha.
const run = async (mode, op) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE, mode).objectStore(STORE);
    const request = op(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const _get = (sessionId) => run('readonly', (s) => s.get(sessionId));
const _getAll = () => run('readonly', (s) => s.getAll());
const _put = (row) => run('readwrite', (s) => s.put(row));
const _delete = (sessionId) => run('readwrite', (s) => s.delete(sessionId));
const _clear = () => run('readwrite', (s) => s.clear());

// Replicates cf-worker db.ts conversation upsert so local rows match cloud rows.
// Exported for the LocalGameSync round-trip test (must invert rowToPayload).
// `pendingCloudSync` is the Phase 1 honest-fallback stamp (SAVE_SYNC_PLAN §5): set
// when an account-holding player's save fell back to this device because auth was
// absent. Plain guest rows never carry it (local is their home store), and older
// rows without the field behave as unstamped.
// `synced` is the Phase 2 write-through dirty flag (SAVE_SYNC_PLAN §4): every
// write-through save stamps `synced: false`; markSynced() flips it to true after a
// confirmed cloud push. Only stamped when the caller passes an explicit boolean, so
// rows written by other paths keep their legacy shape.
// `baseRev` is the Phase 3 lineage marker (SAVE_SYNC_PLAN §6.1): the cloud rev this
// copy descends from, recorded on load-from-cloud and on every successful push.
// Only stamped when the caller passes a non-negative integer; legacy rows without
// the field behave as "no lineage known" (never invents divergence, §7).
export const mapPayloadToRow = (payload, { pendingCloudSync = false, synced, baseRev } = {}) => {
  const now = new Date().toISOString();
  const sessionId = payload.sessionId || payload.session_id;
  const row = {
    session_id: sessionId,
    sessionId, // frontend convenience (backend getById adds this too)
    conversation_name: payload.conversationName || payload.conversation_name || null,
    conversation_data: payload.conversation || payload.conversationData || [],
    game_settings: payload.gameSettings || payload.settingsSnapshot || payload.game_settings || null,
    selected_heroes: payload.selectedHeroes || payload.selected_heroes || null,
    summary: payload.currentSummary || payload.summary || null,
    world_map: payload.worldMap || payload.world_map || null,
    player_position: payload.playerPosition || payload.player_position || null,
    sub_maps: payload.sub_maps || null,
    provider: payload.provider || null,
    model: payload.model || null,
    timestamp: payload.timestamp || now,
    updated_at: now,
  };
  if (pendingCloudSync) row.pending_cloud_sync = true;
  if (typeof synced === 'boolean') row.synced = synced;
  if (isValidBaseRev(baseRev)) row.base_rev = baseRev;
  return row;
};

// The base_rev contract (SAVE_SYNC_PLAN §6.1/§7): a non-negative integer or
// nothing. Anything else (missing, null, strings from old shapes) means "no cloud
// lineage recorded" and the push protocol falls back to the unconditional write.
export const isValidBaseRev = (value) => Number.isInteger(value) && value >= 0;

// Inverse of mapPayloadToRow: a stored row back to the camelCase payload the save
// backends destructure. Owned here (next to the row shape) so both LocalGameSync
// (sync-pass uploads) and conversationsApi (fork parking, ledger-union write-back
// of a fetched cloud row) share one mapping. Sync/lineage fields (synced,
// pending_cloud_sync, base_rev, rev) intentionally do not travel: a payload built
// from a row is a fresh write, and its lineage is decided by the caller.
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

// A local row counts as unsynced when it still needs to reach the account: the
// Phase 2 dirty flag says so, or a Phase 1 pending stamp survives. Rows without
// either field (guest-era or pre-Phase-1 saves) are NOT reported as pending: we
// never invent an "on this device" divergence badge for old saves. (The reconcile
// pass still uploads them, see LocalGameSync: skipping only rows explicitly marked
// synced keeps guest-to-account conversion lossless.)
export const isUnsyncedLocalRow = (row) =>
  !!row && (row.synced === false || row.pending_cloud_sync === true);

export const localGameStore = {
  async list() {
    try {
      return (await _getAll()) || [];
    } catch (e) {
      logger.error('Failed to list local games:', e);
      return [];
    }
  },

  async getById(sessionId) {
    return (await _get(sessionId)) || null;
  },

  async save(payload, opts = {}) {
    const row = mapPayloadToRow(payload, opts);
    if (!row.session_id) throw new Error('localGameStore.save: missing sessionId');
    const existing = await _get(row.session_id).catch(() => null);
    // Never let an unstamped overwrite erase an earlier fallback stamp: the row
    // still needs to reach the account even if this write was guest-routed.
    if (existing?.pending_cloud_sync && !row.pending_cloud_sync) {
      row.pending_cloud_sync = true;
    }
    // Lineage follows the row: a rewrite without an explicit baseRev keeps
    // descending from the same cloud rev the previous write did (§6.1). An
    // explicit opts.baseRev (fresh load-from-cloud knowledge) wins instead.
    if (row.base_rev === undefined && isValidBaseRev(existing?.base_rev)) {
      row.base_rev = existing.base_rev;
    }
    await _put(row);
    return row;
  },

  async updateMessages(sessionId, conversationData, { pendingCloudSync = false, synced } = {}) {
    const row = await _get(sessionId);
    if (!row) return null;
    row.conversation_data = conversationData;
    row.updated_at = new Date().toISOString();
    // Additive only: an existing stamp survives an unstamped update.
    if (pendingCloudSync) row.pending_cloud_sync = true;
    if (typeof synced === 'boolean') row.synced = synced;
    await _put(row);
    return row;
  },

  // Phase 2 (SAVE_SYNC_PLAN §4): flip the write-through dirty flag after a
  // confirmed cloud push. `ifUpdatedAt` guards against a lost race: if another
  // save rewrote the row while the push was in flight, the newer write's
  // `synced: false` must survive, so the mark is skipped. `syncedAt` records the
  // updated_at we sent to the cloud (timestamp comparisons until the rev
  // protocol, §6). Clearing pending_cloud_sync heals Phase 1 stamps too.
  // Phase 3: `baseRev` records the rev the cloud row now carries after our push.
  // It is applied EVEN when the ifUpdatedAt guard skips the synced flip: the
  // newer write that raced us happened on this same device, in the same session,
  // AFTER the state we just pushed, so it descends from the pushed rev too.
  // Leaving the old base_rev in place would make that successor 409-fork against
  // our own push.
  async markSynced(sessionId, { ifUpdatedAt, syncedAt, baseRev } = {}) {
    const row = await _get(sessionId);
    if (!row) return null;
    const applyBaseRev = isValidBaseRev(baseRev);
    if (ifUpdatedAt && row.updated_at !== ifUpdatedAt) {
      logger.debug(`markSynced skipped for ${sessionId}: row was rewritten mid-push`);
      if (applyBaseRev && row.base_rev !== baseRev) {
        row.base_rev = baseRev;
        await _put(row);
      }
      return null;
    }
    row.synced = true;
    row.synced_at = syncedAt || row.updated_at;
    if (applyBaseRev) row.base_rev = baseRev;
    delete row.pending_cloud_sync;
    await _put(row);
    return row;
  },

  // `root` is the player-editable base name. We persist it in game_settings.saveName so it
  // survives future saves (which re-derive the display name), and refresh the display name
  // off the row's last-saved time so the timestamp still reflects real progress.
  async updateName(sessionId, root) {
    const row = await _get(sessionId);
    if (!row) return null;
    const cleanRoot = (typeof root === 'string' && root.trim()) || DEFAULT_SAVE_ROOT;
    let settings = row.game_settings;
    if (typeof settings === 'string') {
      try { settings = JSON.parse(settings); } catch (e) { settings = {}; }
    }
    row.game_settings = { ...(settings || {}), saveName: cleanRoot };
    const when = row.updated_at ? new Date(row.updated_at) : new Date();
    row.conversation_name = buildSaveName(cleanRoot, when);
    row.updated_at = new Date().toISOString();
    await _put(row);
    return row;
  },

  async remove(sessionId) {
    await _delete(sessionId);
    return { success: true };
  },

  async hasGames() {
    const all = await this.list();
    return all.length > 0;
  },

  async clear() {
    try {
      await _clear();
    } catch (e) {
      logger.error('Failed to clear local games:', e);
    }
  },
};
