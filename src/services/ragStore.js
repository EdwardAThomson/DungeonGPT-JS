import { createLogger } from '../utils/logger';

const logger = createLogger('rag-store');

const DB_NAME = 'dungeongpt-rag';
const DB_VERSION = 2;
const STORE_NAME = 'vectors';
const OPEN_BLOCKED_TIMEOUT_MS = 3000;

/**
 * Open (or create) the IndexedDB database.
 */
const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    let blockedTimer;
    let gaveUp = false;

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('sessionId', 'sessionId', { unique: false });
        store.createIndex('sessionId_msgIndex', ['sessionId', 'msgIndex'], { unique: false });
        return;
      }
      // v2: a message is now stored as several chunks sharing one msgIndex, so the
      // (sessionId, msgIndex) index can no longer be unique. Existing rows are kept.
      if (event.oldVersion < 2) {
        const store = event.target.transaction.objectStore(STORE_NAME);
        if (store.indexNames.contains('sessionId_msgIndex')) store.deleteIndex('sessionId_msgIndex');
        store.createIndex('sessionId_msgIndex', ['sessionId', 'msgIndex'], { unique: false });
      }
    };

    request.onsuccess = () => {
      clearTimeout(blockedTimer);
      const db = request.result;
      if (gaveUp) { db.close(); return; } // upgrade finished after we stopped waiting
      // Let a newer build in another tab upgrade the schema instead of waiting on us.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => {
      clearTimeout(blockedTimer);
      logger.error('Failed to open RAG database:', request.error);
      reject(request.error);
    };
    // An open connection in another tab (e.g. an older build) can hold up a schema
    // upgrade indefinitely. Fail fast so callers carry on without memory rather than
    // stalling the turn; the upgrade completes once the other connection closes.
    request.onblocked = () => {
      blockedTimer = setTimeout(() => {
        gaveUp = true;
        logger.warn('RAG database upgrade blocked by another open tab');
        reject(new Error('RAG database upgrade blocked'));
      }, OPEN_BLOCKED_TIMEOUT_MS);
    };
  });
};

/**
 * Store a vector entry.
 * @param {{ id: string, sessionId: string, text: string, vector: number[], msgIndex: number, timestamp: number, tags?: string[] }} entry
 */
export const put = async (entry) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

/**
 * Store multiple vector entries in a single transaction.
 * @param {Array} entries
 */
export const putBatch = async (entries) => {
  if (entries.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    entries.forEach(entry => store.put(entry));
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

/**
 * Delete entries by id in a single transaction. Missing ids are a no-op.
 * @param {string[]} ids
 */
export const deleteBatch = async (ids) => {
  if (ids.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    ids.forEach(id => store.delete(id));
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

/**
 * Get all vector entries for a session.
 * @param {string} sessionId
 * @returns {Promise<Array>}
 */
export const getBySession = async (sessionId) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('sessionId');
    const request = index.getAll(sessionId);
    request.onsuccess = () => { db.close(); resolve(request.result); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
};

/**
 * Count entries for a session.
 * @param {string} sessionId
 * @returns {Promise<number>}
 */
export const countBySession = async (sessionId) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('sessionId');
    const request = index.count(sessionId);
    request.onsuccess = () => { db.close(); resolve(request.result); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
};

/**
 * Delete all entries for a session.
 * @param {string} sessionId
 */
export const clearSession = async (sessionId) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('sessionId');
    const request = index.openCursor(sessionId);
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

/**
 * Delete the entire RAG database (for testing / reset).
 */
export const destroyDB = async () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const ragStore = { put, putBatch, deleteBatch, getBySession, countBySession, clearSession, destroyDB };
