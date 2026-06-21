// localGameStore.js
// Browser-local saved games for guest play, kept in IndexedDB (game state is far
// larger than heroes — conversation history, world map, town caches). Mirrors the
// conversationsApi interface AND the backend's payload->row mapping (cf-worker
// db.ts /conversations) so the load path is identical to cloud saves. Synced to
// the cloud on sign-in (see LocalGameSync, Phase B2).

import { createLogger } from '../utils/logger';

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
const mapPayloadToRow = (payload) => {
  const now = new Date().toISOString();
  const sessionId = payload.sessionId || payload.session_id;
  return {
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

  async save(payload) {
    const row = mapPayloadToRow(payload);
    if (!row.session_id) throw new Error('localGameStore.save: missing sessionId');
    await _put(row);
    return row;
  },

  async updateMessages(sessionId, conversationData) {
    const row = await _get(sessionId);
    if (!row) return null;
    row.conversation_data = conversationData;
    row.updated_at = new Date().toISOString();
    await _put(row);
    return row;
  },

  async updateName(sessionId, conversationName) {
    const row = await _get(sessionId);
    if (!row) return null;
    row.conversation_name = conversationName;
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
