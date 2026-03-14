import { createLogger } from '../utils/logger';

const logger = createLogger('rag-store');

const DB_NAME = 'dungeongpt-rag';
const DB_VERSION = 1;
const STORE_NAME = 'vectors';

/**
 * Open (or create) the IndexedDB database.
 */
const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('sessionId', 'sessionId', { unique: false });
        store.createIndex('sessionId_msgIndex', ['sessionId', 'msgIndex'], { unique: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      logger.error('Failed to open RAG database:', request.error);
      reject(request.error);
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

export const ragStore = { put, putBatch, getBySession, countBySession, clearSession, destroyDB };
