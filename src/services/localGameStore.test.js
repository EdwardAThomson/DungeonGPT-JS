// SAVE_SYNC_PLAN Phases 1-2: the pending_cloud_sync stamp and the Phase 2
// write-through `synced` dirty flag on local game rows. The pending stamp marks an
// account-holder's fallback save (needs to reach the cloud); plain guest rows never
// carry it, and older rows without the field behave as unstamped. `synced: false`
// marks a write-ahead copy awaiting its cloud push; markSynced() flips it after a
// confirmed push (guarded against mid-push rewrites). fake-indexeddb is not
// installed, so a minimal in-memory fake covers the one-request-per-transaction
// pattern localGameStore uses.

import { localGameStore, mapPayloadToRow, isUnsyncedLocalRow, isValidBaseRev } from './localGameStore';

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

describe('base_rev lineage marker (Phase 3, SAVE_SYNC_PLAN §6.1)', () => {
  test('mapPayloadToRow stamps base_rev only for a valid non-negative integer', () => {
    expect(mapPayloadToRow({ sessionId: 's1' }, { baseRev: 5 }).base_rev).toBe(5);
    expect(mapPayloadToRow({ sessionId: 's1' }, { baseRev: 0 }).base_rev).toBe(0);
    expect('base_rev' in mapPayloadToRow({ sessionId: 's1' })).toBe(false);
    expect('base_rev' in mapPayloadToRow({ sessionId: 's1' }, { baseRev: -1 })).toBe(false);
    expect('base_rev' in mapPayloadToRow({ sessionId: 's1' }, { baseRev: '5' })).toBe(false);
  });

  test('isValidBaseRev: integers >= 0 only (missing rev on legacy rows means "no lineage")', () => {
    expect(isValidBaseRev(0)).toBe(true);
    expect(isValidBaseRev(7)).toBe(true);
    expect(isValidBaseRev(-1)).toBe(false);
    expect(isValidBaseRev('7')).toBe(false);
    expect(isValidBaseRev(undefined)).toBe(false);
    expect(isValidBaseRev(null)).toBe(false);
  });

  test('a rewrite without an explicit baseRev keeps descending from the same rev (preserved)', async () => {
    await localGameStore.save({ sessionId: 's1' }, { synced: false, baseRev: 4 });
    const rewritten = await localGameStore.save({ sessionId: 's1' }, { synced: false });
    expect(rewritten.base_rev).toBe(4);
    expect((await localGameStore.getById('s1')).base_rev).toBe(4);
  });

  test('an explicit baseRev (fresh load-from-cloud knowledge) wins over the preserved one', async () => {
    await localGameStore.save({ sessionId: 's1' }, { synced: false, baseRev: 4 });
    const rewritten = await localGameStore.save({ sessionId: 's1' }, { synced: false, baseRev: 9 });
    expect(rewritten.base_rev).toBe(9);
  });

  test('updateMessages keeps the row lineage (row is mutated in place)', async () => {
    await localGameStore.save({ sessionId: 's1' }, { synced: false, baseRev: 4 });
    await localGameStore.updateMessages('s1', [{ role: 'user', content: 'hi' }], { synced: false });
    expect((await localGameStore.getById('s1')).base_rev).toBe(4);
  });

  test('markSynced advances base_rev to the pushed rev', async () => {
    const saved = await localGameStore.save({ sessionId: 's1' }, { synced: false, baseRev: 4 });
    await localGameStore.markSynced('s1', { ifUpdatedAt: saved.updated_at, baseRev: 5 });
    const row = await localGameStore.getById('s1');
    expect(row.synced).toBe(true);
    expect(row.base_rev).toBe(5);
  });

  test('markSynced guard-skip still advances base_rev (same-device successor descends from the pushed rev)', async () => {
    await localGameStore.save({ sessionId: 's1' }, { synced: false, baseRev: 4 });
    // A newer save rewrote the row mid-push: the synced flip must not apply, but
    // the successor's next push must guard against the rev we just created, not
    // fork against our own write.
    const marked = await localGameStore.markSynced('s1', { ifUpdatedAt: '2020-01-01T00:00:00.000Z', baseRev: 5 });
    expect(marked).toBeNull();
    const row = await localGameStore.getById('s1');
    expect(row.synced).toBe(false);
    expect(row.base_rev).toBe(5);
  });

  test('legacy rows never gain base_rev on their own', async () => {
    await localGameStore.save({ sessionId: 'old' }, { synced: false });
    expect('base_rev' in (await localGameStore.getById('old'))).toBe(false);
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
