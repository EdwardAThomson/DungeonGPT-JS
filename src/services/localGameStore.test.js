// SAVE_SYNC_PLAN Phases 1-2: the pending_cloud_sync stamp and the Phase 2
// write-through `synced` dirty flag on local game rows. The pending stamp marks an
// account-holder's fallback save (needs to reach the cloud); plain guest rows never
// carry it, and older rows without the field behave as unstamped. `synced: false`
// marks a write-ahead copy awaiting its cloud push; markSynced() flips it after a
// confirmed push (guarded against mid-push rewrites). fake-indexeddb is not
// installed, so a minimal in-memory fake covers the one-request-per-transaction
// pattern localGameStore uses.

import { localGameStore, mapPayloadToRow, isUnsyncedLocalRow } from './localGameStore';

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

describe('write-through synced flag (Phase 2)', () => {
  test('save with synced:false stamps the dirty flag; markSynced flips it and records synced_at', async () => {
    const saved = await localGameStore.save({ sessionId: 's1' }, { synced: false });
    expect(saved.synced).toBe(false);

    const marked = await localGameStore.markSynced('s1', { ifUpdatedAt: saved.updated_at, syncedAt: saved.updated_at });
    expect(marked.synced).toBe(true);
    expect(marked.synced_at).toBe(saved.updated_at);

    const row = await localGameStore.getById('s1');
    expect(row.synced).toBe(true);
  });

  test('markSynced clears a Phase 1 pending stamp (the row reached the account)', async () => {
    await localGameStore.save({ sessionId: 's1' }, { synced: false, pendingCloudSync: true });
    await localGameStore.markSynced('s1');
    const row = await localGameStore.getById('s1');
    expect(row.synced).toBe(true);
    expect('pending_cloud_sync' in row).toBe(false);
  });

  test('markSynced with a stale ifUpdatedAt is a no-op: a mid-push rewrite keeps synced:false', async () => {
    await localGameStore.save({ sessionId: 's1' }, { synced: false });
    // The row the push was based on carried a different updated_at than the row
    // now in the store (a newer save rewrote it mid-push): the mark must not apply.
    const marked = await localGameStore.markSynced('s1', { ifUpdatedAt: '2020-01-01T00:00:00.000Z' });
    expect(marked).toBeNull();
    expect((await localGameStore.getById('s1')).synced).toBe(false);
  });

  test('markSynced on a missing row returns null', async () => {
    expect(await localGameStore.markSynced('nope')).toBeNull();
  });

  test('a fresh save after markSynced goes back to synced:false (dirty again)', async () => {
    await localGameStore.save({ sessionId: 's1' }, { synced: false });
    await localGameStore.markSynced('s1');
    await localGameStore.save({ sessionId: 's1' }, { synced: false });
    expect((await localGameStore.getById('s1')).synced).toBe(false);
  });

  test('updateMessages with synced:false marks the row dirty too', async () => {
    await localGameStore.save({ sessionId: 's1' }, { synced: false });
    await localGameStore.markSynced('s1');
    await localGameStore.updateMessages('s1', [{ role: 'user', content: 'x' }], { synced: false });
    expect((await localGameStore.getById('s1')).synced).toBe(false);
  });
});

describe('isUnsyncedLocalRow (badge/reconcile predicate)', () => {
  test('explicit synced:false or a pending stamp counts as unsynced', () => {
    expect(isUnsyncedLocalRow({ synced: false })).toBe(true);
    expect(isUnsyncedLocalRow({ pending_cloud_sync: true })).toBe(true);
  });

  test('synced:true is not unsynced', () => {
    expect(isUnsyncedLocalRow({ synced: true })).toBe(false);
  });

  test('legacy rows without either field are NOT pending (no invented divergence for old saves)', () => {
    expect(isUnsyncedLocalRow({ session_id: 'old' })).toBe(false);
    expect(isUnsyncedLocalRow(null)).toBe(false);
  });
});
