// SAVE_SYNC_PLAN Phase 1: the pending_cloud_sync stamp on local game rows.
// The stamp marks an account-holder's fallback save (needs to reach the cloud);
// plain guest rows never carry it, and older rows without the field behave as
// unstamped. fake-indexeddb is not installed, so a minimal in-memory fake covers
// the one-request-per-transaction pattern localGameStore uses.

import { localGameStore, mapPayloadToRow } from './localGameStore';

const makeFakeIndexedDB = () => {
  const data = new Map();
  const request = (execute) => {
    const req = {};
    queueMicrotask(() => {
      try {
        req.result = execute();
        if (req.onsuccess) req.onsuccess({ target: req });
      } catch (error) {
        req.error = error;
        if (req.onerror) req.onerror({ target: req });
      }
    });
    return req;
  };
  const store = {
    get: (key) => request(() => (data.has(key) ? { ...data.get(key) } : undefined)),
    getAll: () => request(() => [...data.values()].map((row) => ({ ...row }))),
    put: (row) => request(() => { data.set(row.session_id, { ...row }); return row.session_id; }),
    delete: (key) => request(() => { data.delete(key); }),
    clear: () => request(() => { data.clear(); }),
  };
  const db = {
    objectStoreNames: { contains: () => true },
    transaction: () => ({ objectStore: () => store }),
  };
  return { open: () => request(() => db) };
};

beforeEach(() => {
  global.indexedDB = makeFakeIndexedDB();
});

describe('mapPayloadToRow pending stamp', () => {
  test('default (plain guest): no pending_cloud_sync field on the row', () => {
    const row = mapPayloadToRow({ sessionId: 's1' });
    expect('pending_cloud_sync' in row).toBe(false);
  });

  test('pendingCloudSync option stamps the row', () => {
    const row = mapPayloadToRow({ sessionId: 's1' }, { pendingCloudSync: true });
    expect(row.pending_cloud_sync).toBe(true);
  });
});

describe('localGameStore stamp persistence', () => {
  test('a stamped save survives reload (persisted on the row)', async () => {
    await localGameStore.save({ sessionId: 's1' }, { pendingCloudSync: true });
    const row = await localGameStore.getById('s1');
    expect(row.pending_cloud_sync).toBe(true);
  });

  test('a plain guest save stays unstamped', async () => {
    await localGameStore.save({ sessionId: 's1' });
    const row = await localGameStore.getById('s1');
    expect(row.pending_cloud_sync).toBeUndefined();
  });

  test('an unstamped overwrite preserves an earlier stamp', async () => {
    await localGameStore.save({ sessionId: 's1' }, { pendingCloudSync: true });
    await localGameStore.save({ sessionId: 's1' }); // later guest-routed write
    const row = await localGameStore.getById('s1');
    expect(row.pending_cloud_sync).toBe(true);
  });

  test('updateMessages stamps when asked and preserves an existing stamp otherwise', async () => {
    await localGameStore.save({ sessionId: 's1' });
    await localGameStore.updateMessages('s1', [{ role: 'user', content: 'a' }], { pendingCloudSync: true });
    expect((await localGameStore.getById('s1')).pending_cloud_sync).toBe(true);

    await localGameStore.updateMessages('s1', [{ role: 'user', content: 'b' }]);
    const row = await localGameStore.getById('s1');
    expect(row.pending_cloud_sync).toBe(true);
    expect(row.conversation_data).toEqual([{ role: 'user', content: 'b' }]);
  });

  test('rows without the field (older saves) behave as unstamped', async () => {
    await localGameStore.save({ sessionId: 'old-row' });
    const row = await localGameStore.getById('old-row');
    expect(row.pending_cloud_sync).toBeFalsy();
  });
});
