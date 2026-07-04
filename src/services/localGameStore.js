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
export const mapPayloadToRow = (payload, { pendingCloudSync = false } = {}) => {
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
  return row;
};

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
    if (!row.pending_cloud_sync) {
      // Never let an unstamped overwrite erase an earlier fallback stamp: the row
      // still needs to reach the account even if this write was guest-routed.
      const existing = await _get(row.session_id).catch(() => null);
      if (existing?.pending_cloud_sync) row.pending_cloud_sync = true;
    }
    await _put(row);
    return row;
  },

  async updateMessages(sessionId, conversationData, { pendingCloudSync = false } = {}) {
    const row = await _get(sessionId);
    if (!row) return null;
    row.conversation_data = conversationData;
    row.updated_at = new Date().toISOString();
    // Additive only: an existing stamp survives an unstamped update.
    if (pendingCloudSync) row.pending_cloud_sync = true;
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
