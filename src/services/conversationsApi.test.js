// SAVE_SYNC_PLAN Phase 2: local-first write-through + merged reads.
// Every save writes the full row to IndexedDB FIRST (stamped synced:false), then
// pushes to the cloud when auth is present; a confirmed push flips the local row to
// synced:true, a failed push (or absent auth) leaves it pending and the result says
// so honestly. Reads return the newer of the two copies; list() merges both stores.
// The Phase 1 auth-state hardening (failed getSession() is "unknown", not "guest")
// is pinned here too.

import { conversationsApi, getLastKnownAuth, _resetAuthStateForTests } from './conversationsApi';
import { supabase } from './supabaseClient';
import { localGameStore } from './localGameStore';
import { apiFetch } from './apiClient';

jest.mock('./supabaseClient', () => ({
  supabase: { auth: { getSession: jest.fn() } },
}));

jest.mock('./localGameStore', () => ({
  localGameStore: {
    list: jest.fn(),
    getById: jest.fn(),
    save: jest.fn(),
    updateMessages: jest.fn(),
    updateName: jest.fn(),
    remove: jest.fn(),
    markSynced: jest.fn(),
  },
  // Real implementation: unsynced = explicit synced:false or a Phase 1 pending
  // stamp; legacy rows without either field are NOT pending (no invented badges).
  isUnsyncedLocalRow: (row) => !!row && (row.synced === false || row.pending_cloud_sync === true),
}));

jest.mock('./apiClient', () => ({
  apiFetch: jest.fn(),
  getErrorMessage: jest.fn(),
}));

const getSession = supabase.auth.getSession;

const sessionPresent = () =>
  getSession.mockResolvedValueOnce({ data: { session: { access_token: 'tok' } } });
const sessionAbsent = () =>
  getSession.mockResolvedValueOnce({ data: { session: null } });
const sessionThrows = () =>
  getSession.mockRejectedValueOnce(new Error('network blip'));

const LOCAL_UPDATED_AT = '2026-07-05T10:00:00.000Z';

beforeEach(() => {
  // CRA's jest config resets mocks between tests, so implementations live here.
  _resetAuthStateForTests();
  apiFetch.mockImplementation(async () => ({ ok: true, json: async () => ({ success: true }) }));
  localGameStore.save.mockImplementation(async (payload, opts) => ({
    session_id: payload.sessionId,
    updated_at: LOCAL_UPDATED_AT,
    ...(typeof opts?.synced === 'boolean' ? { synced: opts.synced } : {}),
    ...(opts?.pendingCloudSync ? { pending_cloud_sync: true } : {}),
  }));
  localGameStore.updateMessages.mockImplementation(async (sessionId, data, opts) => ({
    session_id: sessionId,
    conversation_data: data,
    updated_at: LOCAL_UPDATED_AT,
    ...(typeof opts?.synced === 'boolean' ? { synced: opts.synced } : {}),
    ...(opts?.pendingCloudSync ? { pending_cloud_sync: true } : {}),
  }));
  localGameStore.getById.mockResolvedValue(null);
  localGameStore.list.mockResolvedValue([]);
  localGameStore.remove.mockResolvedValue({ success: true });
  localGameStore.markSynced.mockResolvedValue(null);
  localGameStore.updateName.mockResolvedValue(null);
});

const cloudFailsOnce = () => apiFetch.mockRejectedValueOnce(new Error('worker down'));

describe('conversationsApi.save write-through (Phase 2)', () => {
  test('signed in, cloud ok: local write-ahead first (synced:false), push, then markSynced', async () => {
    sessionPresent();
    const result = await conversationsApi.save({ sessionId: 's1' });

    // The local write happens unconditionally and BEFORE the cloud push.
    expect(localGameStore.save).toHaveBeenCalledWith(
      { sessionId: 's1' },
      { synced: false, pendingCloudSync: false }
    );
    expect(localGameStore.save.mock.invocationCallOrder[0])
      .toBeLessThan(apiFetch.mock.invocationCallOrder[0]);
    // Confirmed push flips the dirty flag, guarded by the updated_at we wrote.
    expect(localGameStore.markSynced).toHaveBeenCalledWith('s1', { ifUpdatedAt: LOCAL_UPDATED_AT });
    expect(result.storage).toBe('cloud');
    expect(getLastKnownAuth()).toBe('signed-in');
  });

  test('signed in, cloud push fails: honest savedLocal marker, row stays unsynced', async () => {
    sessionPresent();
    cloudFailsOnce();
    const result = await conversationsApi.save({ sessionId: 's1' });

    expect(localGameStore.save).toHaveBeenCalledWith(
      { sessionId: 's1' },
      { synced: false, pendingCloudSync: false }
    );
    expect(localGameStore.markSynced).not.toHaveBeenCalled();
    expect(result.storage).toBe('local');
    expect(result.pendingCloudSync).toBe(true);
  });

  test('signed in, cloud ok but local write-ahead failed: still a clean cloud save', async () => {
    sessionPresent();
    localGameStore.save.mockRejectedValueOnce(new Error('quota exceeded'));
    const result = await conversationsApi.save({ sessionId: 's1' });

    expect(result.storage).toBe('cloud');
    expect(localGameStore.markSynced).not.toHaveBeenCalled();
  });

  test('signed in, BOTH writes fail: throws (the only true save error)', async () => {
    sessionPresent();
    localGameStore.save.mockRejectedValueOnce(new Error('quota exceeded'));
    cloudFailsOnce();
    await expect(conversationsApi.save({ sessionId: 's1' })).rejects.toThrow();
  });

  test('plain guest: local write IS the save, no pending stamp, no cloud call', async () => {
    sessionAbsent();
    const result = await conversationsApi.save({ sessionId: 's1' });
    expect(localGameStore.save).toHaveBeenCalledWith(
      { sessionId: 's1' },
      { synced: false, pendingCloudSync: false }
    );
    expect(apiFetch).not.toHaveBeenCalled();
    expect(result.storage).toBe('local');
    expect(result.pendingCloudSync).toBe(false);
    expect(getLastKnownAuth()).toBe('guest');
  });

  test('guest whose local write fails: throws (nothing was persisted)', async () => {
    sessionAbsent();
    localGameStore.save.mockRejectedValueOnce(new Error('quota exceeded'));
    await expect(conversationsApi.save({ sessionId: 's1' })).rejects.toThrow('quota exceeded');
  });

  test('account-holder whose token died mid-session: local write WITH pending stamp', async () => {
    sessionPresent();
    await conversationsApi.save({ sessionId: 's1' }); // establishes signed-in this session

    sessionAbsent(); // token expired, getSession succeeds but returns no session
    const result = await conversationsApi.save({ sessionId: 's1' });
    expect(localGameStore.save).toHaveBeenLastCalledWith(
      { sessionId: 's1' },
      { synced: false, pendingCloudSync: true }
    );
    expect(result.storage).toBe('local');
    expect(result.pendingCloudSync).toBe(true);
  });

  test('updateMessages carries the same write-through: local first, cloud push, markSynced', async () => {
    sessionPresent();
    const result = await conversationsApi.updateMessages('s1', [{ role: 'user', content: 'hi' }]);
    expect(localGameStore.updateMessages).toHaveBeenCalledWith(
      's1',
      [{ role: 'user', content: 'hi' }],
      { synced: false, pendingCloudSync: false }
    );
    expect(localGameStore.markSynced).toHaveBeenCalledWith('s1', { ifUpdatedAt: LOCAL_UPDATED_AT });
    expect(result.storage).toBe('cloud');
  });

  test('updateMessages on auth failure routes local with the pending stamp', async () => {
    sessionPresent();
    await conversationsApi.save({ sessionId: 's1' });

    sessionThrows();
    const result = await conversationsApi.updateMessages('s1', [{ role: 'user', content: 'hi' }]);
    expect(localGameStore.updateMessages).toHaveBeenLastCalledWith(
      's1',
      [{ role: 'user', content: 'hi' }],
      { synced: false, pendingCloudSync: true }
    );
    expect(result.storage).toBe('local');
    expect(result.pendingCloudSync).toBe(true);
  });
});

describe('conversationsApi.getById newer-of-two-copies (Phase 2)', () => {
  const cloudRow = (updatedAt) => ({ session_id: 's1', sessionId: 's1', summary: 'cloud copy', updated_at: updatedAt });
  const localRow = (updatedAt, extra = {}) => ({ session_id: 's1', sessionId: 's1', summary: 'local copy', updated_at: updatedAt, ...extra });

  const cloudReturns = (row) =>
    apiFetch.mockImplementationOnce(async () => ({ ok: true, json: async () => row }));
  const cloudMisses = () => apiFetch.mockRejectedValueOnce(new Error('404 not found'));

  test('local unsynced and newer: local wins, older cloud copy untouched', async () => {
    sessionPresent();
    cloudReturns(cloudRow('2026-07-01T10:00:00.000Z'));
    localGameStore.getById.mockResolvedValueOnce(localRow('2026-07-02T10:00:00.000Z', { synced: false }));

    const row = await conversationsApi.getById('s1');
    expect(row.summary).toBe('local copy');
    expect(localGameStore.remove).not.toHaveBeenCalled();
  });

  test('cloud newer: cloud wins, the local row is NOT deleted at read time', async () => {
    sessionPresent();
    cloudReturns(cloudRow('2026-07-03T10:00:00.000Z'));
    localGameStore.getById.mockResolvedValueOnce(localRow('2026-07-02T10:00:00.000Z', { synced: false }));

    const row = await conversationsApi.getById('s1');
    expect(row.summary).toBe('cloud copy');
    expect(localGameStore.remove).not.toHaveBeenCalled();
  });

  test('only the cloud copy exists: returned as-is', async () => {
    sessionPresent();
    cloudReturns(cloudRow('2026-07-01T10:00:00.000Z'));
    localGameStore.getById.mockResolvedValueOnce(null);
    expect((await conversationsApi.getById('s1')).summary).toBe('cloud copy');
  });

  test('only the local copy exists (cloud 404): returned instead of throwing', async () => {
    sessionPresent();
    cloudMisses();
    localGameStore.getById.mockResolvedValueOnce(localRow('2026-07-02T10:00:00.000Z', { synced: false }));
    expect((await conversationsApi.getById('s1')).summary).toBe('local copy');
  });

  test('neither exists: the cloud error propagates as before', async () => {
    sessionPresent();
    cloudMisses();
    localGameStore.getById.mockResolvedValueOnce(null);
    await expect(conversationsApi.getById('s1')).rejects.toThrow();
  });

  test('legacy local row without sync fields or comparable timestamp: cloud wins (no invented divergence)', async () => {
    sessionPresent();
    cloudReturns(cloudRow('2026-07-01T10:00:00.000Z'));
    localGameStore.getById.mockResolvedValueOnce({ session_id: 's1', summary: 'local copy' });
    expect((await conversationsApi.getById('s1')).summary).toBe('cloud copy');
  });

  test('tie on updated_at: cloud (the durable home) wins', async () => {
    sessionPresent();
    cloudReturns(cloudRow('2026-07-02T10:00:00.000Z'));
    localGameStore.getById.mockResolvedValueOnce(localRow('2026-07-02T10:00:00.000Z', { synced: true }));
    expect((await conversationsApi.getById('s1')).summary).toBe('cloud copy');
  });

  test('guest route reads local only', async () => {
    sessionAbsent();
    localGameStore.getById.mockResolvedValueOnce(localRow('2026-07-02T10:00:00.000Z'));
    expect((await conversationsApi.getById('s1')).summary).toBe('local copy');
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe('conversationsApi.list merged union (Phase 2)', () => {
  const cloudList = (rows) =>
    apiFetch.mockImplementationOnce(async () => ({ ok: true, json: async () => rows }));

  test('union of both stores by session_id, newest copy winning, rows annotated', async () => {
    sessionPresent();
    cloudList([
      { session_id: 'cloud-only', updated_at: '2026-07-01T10:00:00.000Z' },
      { session_id: 'both-cloud-newer', updated_at: '2026-07-03T10:00:00.000Z', summary: 'cloud' },
      { session_id: 'both-local-newer', updated_at: '2026-07-01T10:00:00.000Z', summary: 'cloud' },
    ]);
    localGameStore.list.mockResolvedValueOnce([
      { session_id: 'local-only', sessionId: 'local-only', updated_at: '2026-07-02T10:00:00.000Z', synced: false },
      { session_id: 'both-cloud-newer', sessionId: 'both-cloud-newer', updated_at: '2026-07-02T10:00:00.000Z', summary: 'local', synced: false },
      { session_id: 'both-local-newer', sessionId: 'both-local-newer', updated_at: '2026-07-04T10:00:00.000Z', summary: 'local', synced: false },
    ]);

    const rows = await conversationsApi.list();
    const bySid = Object.fromEntries(rows.map((r) => [r.session_id, r]));

    expect(rows).toHaveLength(4);
    expect(bySid['cloud-only']).toMatchObject({ storage: 'cloud', pendingCloudSync: false, sessionId: 'cloud-only' });
    expect(bySid['local-only']).toMatchObject({ storage: 'local', pendingCloudSync: true });
    expect(bySid['both-cloud-newer']).toMatchObject({ storage: 'both', pendingCloudSync: false, summary: 'cloud' });
    expect(bySid['both-local-newer']).toMatchObject({ storage: 'both', pendingCloudSync: true, summary: 'local' });
  });

  test('local-only SYNCED row (write-ahead already pushed, cloud list raced): no pending badge', async () => {
    sessionPresent();
    cloudList([]);
    localGameStore.list.mockResolvedValueOnce([
      { session_id: 's1', updated_at: '2026-07-02T10:00:00.000Z', synced: true },
    ]);
    const rows = await conversationsApi.list();
    expect(rows[0]).toMatchObject({ storage: 'local', pendingCloudSync: false });
  });

  test('legacy local row without sync fields: listed but never marked pending', async () => {
    sessionPresent();
    cloudList([]);
    localGameStore.list.mockResolvedValueOnce([
      { session_id: 'old-row', updated_at: '2026-07-02T10:00:00.000Z' },
    ]);
    const rows = await conversationsApi.list();
    expect(rows[0]).toMatchObject({ storage: 'local', pendingCloudSync: false });
  });

  test('guest: local list exactly as today (annotated, no cloud call)', async () => {
    sessionAbsent();
    localGameStore.list.mockResolvedValueOnce([
      { session_id: 'g1', updated_at: '2026-07-02T10:00:00.000Z', synced: false },
    ]);
    const rows = await conversationsApi.list();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(rows).toHaveLength(1);
    expect(rows[0].session_id).toBe('g1');
    expect(rows[0].storage).toBe('local');
  });

  test('cloud list failure with local rows present: local rows still shown', async () => {
    sessionPresent();
    apiFetch.mockRejectedValueOnce(new Error('worker down'));
    localGameStore.list.mockResolvedValueOnce([
      { session_id: 's1', updated_at: '2026-07-02T10:00:00.000Z', synced: false },
    ]);
    const rows = await conversationsApi.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ storage: 'local', pendingCloudSync: true });
  });

  test('cloud list failure with nothing local: the error propagates as before', async () => {
    sessionPresent();
    apiFetch.mockRejectedValueOnce(new Error('worker down'));
    localGameStore.list.mockResolvedValueOnce([]);
    await expect(conversationsApi.list()).rejects.toThrow();
  });
});

describe('conversationsApi.remove and updateName across both stores (Phase 2)', () => {
  test('signed in: remove deletes the cloud row AND any local copy', async () => {
    sessionPresent();
    localGameStore.getById.mockResolvedValueOnce({ session_id: 's1' });
    await conversationsApi.remove('s1');
    expect(apiFetch).toHaveBeenCalled();
    expect(localGameStore.remove).toHaveBeenCalledWith('s1');
  });

  test('signed in, row only local (cloud 404): still succeeds and removes the local copy', async () => {
    sessionPresent();
    localGameStore.getById.mockResolvedValueOnce({ session_id: 's1' });
    apiFetch.mockRejectedValueOnce(new Error('404'));
    const result = await conversationsApi.remove('s1');
    expect(localGameStore.remove).toHaveBeenCalledWith('s1');
    expect(result).toEqual({ success: true });
  });

  test('signed in, no local copy and cloud delete fails: the error propagates', async () => {
    sessionPresent();
    localGameStore.getById.mockResolvedValueOnce(null);
    apiFetch.mockRejectedValueOnce(new Error('404'));
    await expect(conversationsApi.remove('s1')).rejects.toThrow();
    expect(localGameStore.remove).not.toHaveBeenCalled();
  });

  test('guest: remove touches local only', async () => {
    sessionAbsent();
    await conversationsApi.remove('s1');
    expect(localGameStore.remove).toHaveBeenCalledWith('s1');
    expect(apiFetch).not.toHaveBeenCalled();
  });

  test('signed in rename also renames an UNSYNCED local copy (no fork over a rename)', async () => {
    sessionPresent();
    localGameStore.getById.mockResolvedValueOnce({ session_id: 's1', synced: false });
    await conversationsApi.updateName('s1', 'New Name');
    expect(localGameStore.updateName).toHaveBeenCalledWith('s1', 'New Name');
  });

  test('signed in rename leaves a SYNCED local copy untouched (stale content must not win reads)', async () => {
    sessionPresent();
    localGameStore.getById.mockResolvedValueOnce({ session_id: 's1', synced: true });
    await conversationsApi.updateName('s1', 'New Name');
    expect(localGameStore.updateName).not.toHaveBeenCalled();
  });
});

describe('auth-check hardening (failed getSession is not "guest")', () => {
  test('throw after a confirmed sign-in: routes local but stamps pending, last known state kept', async () => {
    sessionPresent();
    await conversationsApi.save({ sessionId: 's1' });
    expect(getLastKnownAuth()).toBe('signed-in');

    sessionThrows();
    await conversationsApi.save({ sessionId: 's1' });
    expect(localGameStore.save).toHaveBeenLastCalledWith(
      { sessionId: 's1' },
      { synced: false, pendingCloudSync: true }
    );
    // The failure did not overwrite the last successful check.
    expect(getLastKnownAuth()).toBe('signed-in');
  });

  test('throw with no prior successful check ("unknown"): pending-eligible, not a plain guest', async () => {
    expect(getLastKnownAuth()).toBe('unknown');
    sessionThrows();
    const result = await conversationsApi.save({ sessionId: 's1' });
    expect(localGameStore.save).toHaveBeenCalledWith(
      { sessionId: 's1' },
      { synced: false, pendingCloudSync: true }
    );
    expect(result.pendingCloudSync).toBe(true);
    expect(getLastKnownAuth()).toBe('unknown');
  });

  test('throw after a confirmed guest check: still a plain guest, no stamp', async () => {
    sessionAbsent();
    await conversationsApi.save({ sessionId: 's1' });
    expect(getLastKnownAuth()).toBe('guest');

    sessionThrows();
    await conversationsApi.save({ sessionId: 's1' });
    expect(localGameStore.save).toHaveBeenLastCalledWith(
      { sessionId: 's1' },
      { synced: false, pendingCloudSync: false }
    );
  });

  test('list/getById route local when the auth check fails', async () => {
    localGameStore.list.mockResolvedValueOnce([]);
    sessionThrows();
    await conversationsApi.list();
    expect(localGameStore.list).toHaveBeenCalled();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
