// SAVE_SYNC_PLAN Phase 2: local-first write-through + merged reads.
// Every save writes the full row to IndexedDB FIRST (stamped synced:false), then
// pushes to the cloud when auth is present; a confirmed push flips the local row to
// synced:true, a failed push (or absent auth) leaves it pending and the result says
// so honestly. Reads return the newer of the two copies; list() merges both stores.
// The Phase 1 auth-state hardening (failed getSession() is "unknown", not "guest")
// is pinned here too.

import { conversationsApi, getLastKnownAuth, _resetAuthStateForTests, _resetRevStateForTests } from './conversationsApi';
import { supabase } from './supabaseClient';
import { localGameStore } from './localGameStore';
import { apiFetch } from './apiClient';
import { ragStore } from './ragStore';

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
  // Real implementations (pure) so the rev protocol behaves as in production.
  isValidBaseRev: (value) => Number.isInteger(value) && value >= 0,
  rowToPayload: (row) => ({
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
  }),
}));

jest.mock('./apiClient', () => ({
  apiFetch: jest.fn(),
  getErrorMessage: jest.fn(),
}));

// #17: save deletion also purges the save's RAG vectors (keyed by sessionId).
jest.mock('./ragStore', () => ({
  ragStore: { clearSession: jest.fn() },
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
  _resetRevStateForTests();
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
  ragStore.clearSession.mockResolvedValue();
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

describe('RAG index purge on save delete (#17)', () => {
  test('signed in: deleting a save purges its RAG vectors too', async () => {
    sessionPresent();
    localGameStore.getById.mockResolvedValueOnce({ session_id: 's1' });
    await conversationsApi.remove('s1');
    expect(ragStore.clearSession).toHaveBeenCalledWith('s1');
  });

  test('guest: local-only deletes purge the vectors as well', async () => {
    sessionAbsent();
    await conversationsApi.remove('s1');
    expect(ragStore.clearSession).toHaveBeenCalledWith('s1');
    expect(apiFetch).not.toHaveBeenCalled();
  });

  test('parked diverged copies purge exactly their own index (own session id)', async () => {
    sessionPresent();
    localGameStore.getById.mockResolvedValueOnce({ session_id: 's1-local-ab12cd' });
    await conversationsApi.remove('s1-local-ab12cd');
    expect(ragStore.clearSession).toHaveBeenCalledTimes(1);
    expect(ragStore.clearSession).toHaveBeenCalledWith('s1-local-ab12cd');
  });

  test('a failed purge never fails the delete (best effort)', async () => {
    sessionAbsent();
    ragStore.clearSession.mockRejectedValueOnce(new Error('IDB unavailable'));
    await expect(conversationsApi.remove('s1')).resolves.toEqual({ success: true });
  });

  test('a delete that failed outright (no copy anywhere) does not purge', async () => {
    sessionPresent();
    localGameStore.getById.mockResolvedValueOnce(null);
    apiFetch.mockRejectedValueOnce(new Error('404'));
    await expect(conversationsApi.remove('s1')).rejects.toThrow();
    expect(ragStore.clearSession).not.toHaveBeenCalled();
  });
});

describe('rev protocol: guarded push, fork-on-conflict, ledger union (Phase 3)', () => {
  const sessionAlways = () =>
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });

  const postCalls = () =>
    apiFetch.mock.calls
      .filter(([, options]) => options?.method === 'POST')
      .map(([path, options]) => ({ path, body: JSON.parse(options.body) }));

  test('load-from-cloud records the baseRev; the next save pushes it as expectedRev and fast-forwards', async () => {
    sessionAlways();
    // Load: the cloud copy (rev 5) is adopted.
    apiFetch.mockImplementationOnce(async () => ({
      ok: true,
      json: async () => ({ session_id: 's1', rev: 5, updated_at: '2026-07-05T10:00:00.000Z' }),
    }));
    await conversationsApi.getById('s1');

    // Save: the write-ahead row is stamped with the adopted lineage...
    apiFetch.mockImplementationOnce(async () => ({
      ok: true,
      json: async () => ({ sessionId: 's1', rev: 6 }),
    }));
    const result = await conversationsApi.save({ sessionId: 's1' });

    expect(localGameStore.save).toHaveBeenCalledWith(
      { sessionId: 's1' },
      { synced: false, pendingCloudSync: false, baseRev: 5 }
    );
    // ...the push carries it as the optimistic-concurrency guard...
    const posts = postCalls();
    expect(posts).toHaveLength(1);
    expect(posts[0].body.expectedRev).toBe(5);
    // ...and the response's new rev becomes the row's base_rev (fast-forward).
    expect(localGameStore.markSynced).toHaveBeenCalledWith('s1', {
      ifUpdatedAt: LOCAL_UPDATED_AT,
      baseRev: 6,
    });
    expect(result.storage).toBe('cloud');
    expect(result.forked).toBeUndefined();
  });

  test('a local row already carrying base_rev (page reload) pushes it as expectedRev', async () => {
    sessionAlways();
    localGameStore.save.mockImplementationOnce(async (payload) => ({
      session_id: payload.sessionId,
      updated_at: LOCAL_UPDATED_AT,
      synced: false,
      base_rev: 4,
    }));
    apiFetch.mockImplementationOnce(async () => ({ ok: true, json: async () => ({ rev: 5 }) }));

    await conversationsApi.save({ sessionId: 's1' });
    expect(postCalls()[0].body.expectedRev).toBe(4);
  });

  test('legacy row without any lineage: unconditional push (no expectedRev), base_rev adopted from the response', async () => {
    sessionAlways();
    apiFetch.mockImplementationOnce(async () => ({ ok: true, json: async () => ({ rev: 1 }) }));

    await conversationsApi.save({ sessionId: 'old-save' });

    const [{ body }] = postCalls();
    expect('expectedRev' in body).toBe(false);
    expect(localGameStore.markSynced).toHaveBeenCalledWith('old-save', {
      ifUpdatedAt: LOCAL_UPDATED_AT,
      baseRev: 1,
    });
  });

  test('backend without a rev column (pre-migration): everything behaves as in Phase 2', async () => {
    sessionAlways();
    // Default apiFetch mock answers { success: true }: no rev anywhere.
    const result = await conversationsApi.save({ sessionId: 's1' });
    const [{ body }] = postCalls();
    expect('expectedRev' in body).toBe(false);
    expect(localGameStore.markSynced).toHaveBeenCalledWith('s1', { ifUpdatedAt: LOCAL_UPDATED_AT });
    expect(result.storage).toBe('cloud');
  });

  test('409 forks: parks the local timeline, unions the hero ledger into the adopted row, adopts the cloud copy, redirects future saves', async () => {
    sessionAlways();
    const preForkEvent = { t: 1000, heroId: 'h1', kind: 'xp', amount: 100, source: 'milestone:1' };
    const cloudOnlyEvent = { t: 2000, heroId: 'h1', kind: 'gold', amount: 50, source: 'sidequest:well' };
    const localOnlyEvent = { t: 3000, heroId: 'h1', kind: 'xp', amount: 75, source: 'encounter' };
    const adoptedCloudRow = {
      session_id: 's1',
      rev: 7,
      updated_at: '2026-07-05T12:00:00.000Z',
      conversation_name: 'Adventure - cloud',
      conversation_data: [{ role: 'user', content: 'cloud timeline' }],
      game_settings: { saveName: 'Adventure', heroLedger: [preForkEvent, cloudOnlyEvent] },
    };
    // Local write-ahead rows descend from rev 5 (the common ancestor) unless the
    // caller stamps a fresher lineage (real-store precedence: opts.baseRev wins
    // over the preserved row value).
    localGameStore.save.mockImplementation(async (payload, opts) => ({
      session_id: payload.sessionId,
      updated_at: LOCAL_UPDATED_AT,
      synced: false,
      ...(Number.isInteger(opts?.baseRev)
        ? { base_rev: opts.baseRev }
        : payload.sessionId === 's1' ? { base_rev: 5 } : {}),
    }));
    apiFetch.mockImplementation(async (path, options = {}) => {
      const method = options.method || 'GET';
      if (method === 'GET') return { ok: true, json: async () => adoptedCloudRow };
      const body = JSON.parse(options.body);
      if (body.sessionId === 's1' && body.expectedRev === 5) {
        // The stale push: another device advanced the row to rev 7.
        return {
          ok: false,
          status: 409,
          json: async () => ({ code: 'rev_conflict', rev: 7, updated_at: adoptedCloudRow.updated_at }),
        };
      }
      return { ok: true, json: async () => ({ sessionId: body.sessionId, rev: (body.expectedRev || 0) + 1 }) };
    });

    const result = await conversationsApi.save({
      sessionId: 's1',
      conversationName: 'Adventure - 7/5/2026',
      gameSettings: { saveName: 'Adventure', heroLedger: [preForkEvent, localOnlyEvent] },
    });

    // The result is an honest fork, not a silent overwrite or an error.
    expect(result.forked).toBe(true);
    expect(result.parkedSessionId).toMatch(/^s1-local-[a-z0-9]+$/);
    expect(result.storage).toBe('cloud');
    expect(result.ledgerMerged).toBe(true);

    const posts = postCalls();
    // 1: stale push (409). 2: parked copy, fresh lineage, suffixed name.
    const parked = posts.find((p) => p.body.sessionId === result.parkedSessionId);
    expect(parked).toBeDefined();
    expect('expectedRev' in parked.body).toBe(false);
    expect(parked.body.conversationName).toMatch(/^Adventure - 7\/5\/2026 \(diverged on this device, .+\)$/);
    // 3: the ledger union write-back into the adopted row, guarded on ITS rev,
    // carrying the deduped union (pre-fork event once, both post-fork events).
    const unionWrite = posts.find((p) => p.body.sessionId === 's1' && p.body.expectedRev === 7);
    expect(unionWrite).toBeDefined();
    expect(unionWrite.body.gameSettings.heroLedger).toEqual([preForkEvent, cloudOnlyEvent, localOnlyEvent]);
    // The adopted row's own timeline fields are preserved, not replaced by ours.
    expect(unionWrite.body.conversation).toEqual(adoptedCloudRow.conversation_data);
    // The local shadow of s1 is dropped: the next read resolves to the cloud row.
    expect(localGameStore.remove).toHaveBeenCalledWith('s1');

    // A later save from the still-live session belongs to the parked timeline:
    // one fork parks exactly one copy (no fork-per-autosave cascade).
    apiFetch.mockClear();
    await conversationsApi.save({ sessionId: 's1', conversationName: 'Adventure - 7/5/2026' });
    const followUp = postCalls();
    expect(followUp).toHaveLength(1);
    expect(followUp[0].body.sessionId).toBe(result.parkedSessionId);
    expect(followUp[0].body.conversationName).toMatch(/\(diverged on this device, .+\)$/);

    // Explicitly loading the save again re-establishes lineage and clears the
    // redirect: saves target s1 with the freshly adopted rev.
    apiFetch.mockClear();
    apiFetch.mockImplementationOnce(async () => ({ ok: true, json: async () => ({ ...adoptedCloudRow, rev: 8 }) }));
    localGameStore.getById.mockResolvedValueOnce(null);
    await conversationsApi.getById('s1');
    apiFetch.mockImplementationOnce(async () => ({ ok: true, json: async () => ({ rev: 9 }) }));
    await conversationsApi.save({ sessionId: 's1' });
    const reloaded = postCalls();
    expect(reloaded[0].body.sessionId).toBe('s1');
    expect(reloaded[0].body.expectedRev).toBe(8);
  });

  test('fork with nothing new in the local ledger: parked, but no union write-back (no double count)', async () => {
    sessionAlways();
    const sharedEvent = { t: 1000, heroId: 'h1', kind: 'xp', amount: 100, source: 'milestone:1' };
    const cloudRow = {
      session_id: 's2',
      rev: 7,
      updated_at: '2026-07-05T12:00:00.000Z',
      conversation_data: [],
      game_settings: { heroLedger: [sharedEvent, { t: 2000, heroId: 'h1', kind: 'gold', amount: 5, source: 'shop' }] },
    };
    localGameStore.save.mockImplementation(async (payload) => ({
      session_id: payload.sessionId,
      updated_at: LOCAL_UPDATED_AT,
      synced: false,
      ...(payload.sessionId === 's2' ? { base_rev: 5 } : {}),
    }));
    apiFetch.mockImplementation(async (path, options = {}) => {
      const method = options.method || 'GET';
      if (method === 'GET') return { ok: true, json: async () => cloudRow };
      const body = JSON.parse(options.body);
      if (body.sessionId === 's2' && body.expectedRev === 5) {
        return { ok: false, status: 409, json: async () => ({ rev: 7 }) };
      }
      return { ok: true, json: async () => ({ rev: 1 }) };
    });

    const result = await conversationsApi.save({
      sessionId: 's2',
      gameSettings: { heroLedger: [sharedEvent] }, // strict subset: all pre-fork
    });

    expect(result.forked).toBe(true);
    expect(result.ledgerMerged).toBe(false);
    const unionWrites = postCalls().filter((p) => p.body.sessionId === 's2' && p.body.expectedRev === 7);
    expect(unionWrites).toHaveLength(0);
  });

  test('updateMessages: the PUT response rev advances the lineage (no self-fork on the next save)', async () => {
    sessionAlways();
    apiFetch.mockImplementationOnce(async () => ({ ok: true, json: async () => ({ rev: 9 }) }));
    await conversationsApi.updateMessages('s1', [{ role: 'user', content: 'hi' }]);
    expect(localGameStore.markSynced).toHaveBeenCalledWith('s1', {
      ifUpdatedAt: LOCAL_UPDATED_AT,
      baseRev: 9,
    });
  });

  test('guest flows never touch the rev machinery', async () => {
    sessionAbsent();
    const result = await conversationsApi.save({ sessionId: 'g1' });
    expect(apiFetch).not.toHaveBeenCalled();
    expect(result.storage).toBe('local');
    expect(result.forked).toBeUndefined();
    expect(localGameStore.save).toHaveBeenCalledWith(
      { sessionId: 'g1' },
      { synced: false, pendingCloudSync: false }
    );
  });
});

describe('save serialization: same-device races do not false-fork (§6.1)', () => {
  const sessionAlways = () =>
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });

  const postBodies = () =>
    apiFetch.mock.calls
      .filter(([, options]) => options?.method === 'POST')
      .map(([, options]) => JSON.parse(options.body));

  // A stateful backend that enforces the SAME optimistic-concurrency guard the
  // worker does: the upsert only commits (and bumps the row's rev) when the
  // incoming expectedRev matches the row's CURRENT rev; otherwise it 409s carrying
  // the current rev. GET returns the current row so a fork's ledger read works.
  const guardedBackend = (initialRev, row = {}) => {
    let currentRev = initialRev;
    apiFetch.mockImplementation(async (path, options = {}) => {
      const method = options.method || 'GET';
      if (method === 'GET') {
        return { ok: true, json: async () => ({ session_id: 's1', ...row, rev: currentRev }) };
      }
      const body = JSON.parse(options.body);
      // A brand-new (parked) id has no lineage: unconditional push, always ok.
      if (!('expectedRev' in body)) {
        return { ok: true, json: async () => ({ sessionId: body.sessionId, rev: 1 }) };
      }
      if (body.expectedRev !== currentRev) {
        return { ok: false, status: 409, json: async () => ({ code: 'rev_conflict', rev: currentRev }) };
      }
      currentRev += 1;
      return { ok: true, json: async () => ({ sessionId: body.sessionId, rev: currentRev }) };
    });
    return {
      advanceExternally: () => { currentRev += 1; }, // a DIFFERENT writer (another device)
    };
  };

  test('two overlapping saves for the same session BOTH commit, neither forks', async () => {
    sessionAlways();
    guardedBackend(5);

    // Establish this session's lineage at rev 5 (adopt the cloud copy on load).
    await conversationsApi.getById('s1');
    apiFetch.mockClear();

    // Fire two saves WITHOUT awaiting the first: the classic same-device race.
    // Pre-fix, both capture expectedRev=5, the first commits (5->6), the second
    // 409s on its now-stale ancestor and forks a "(diverged on this device)" copy.
    const p1 = conversationsApi.save({ sessionId: 's1', conversationName: 'Adventure' });
    const p2 = conversationsApi.save({ sessionId: 's1', conversationName: 'Adventure' });
    const [r1, r2] = await Promise.all([p1, p2]);

    // Both succeed as clean cloud saves.
    expect(r1.storage).toBe('cloud');
    expect(r2.storage).toBe('cloud');
    expect(r1.forked).toBeUndefined();
    expect(r2.forked).toBeUndefined();

    // Serialization means they pushed sequentially: 5 then 6, both accepted.
    const bodies = postBodies();
    expect(bodies).toHaveLength(2);
    expect(bodies.map((b) => b.expectedRev)).toEqual([5, 6]);

    // No fork happened: no parked "-local-" copy, no "(diverged...)" name, and the
    // local shadow of s1 was never dropped (forkLocalTimeline was NOT invoked).
    expect(bodies.some((b) => /-local-/.test(b.sessionId))).toBe(false);
    expect(bodies.some((b) => /diverged on this device/.test(b.conversationName || ''))).toBe(false);
    expect(localGameStore.remove).not.toHaveBeenCalled();
  });

  test('a genuine other-device advance STILL forks (real divergence detection intact)', async () => {
    sessionAlways();
    const backend = guardedBackend(5, {
      conversation_name: 'Adventure',
      conversation_data: [{ role: 'user', content: 'cloud timeline' }],
      game_settings: { saveName: 'Adventure' },
      updated_at: '2026-07-05T12:00:00.000Z',
    });

    await conversationsApi.getById('s1'); // lineage adopted at rev 5
    apiFetch.mockClear();

    // A DIFFERENT writer (another device) advances the cloud row without going
    // through this client's queue: now our expectedRev=5 is genuinely stale.
    backend.advanceExternally(); // rev 5 -> 6

    const result = await conversationsApi.save({
      sessionId: 's1',
      conversationName: 'Adventure',
      gameSettings: { saveName: 'Adventure' },
    });

    // Real divergence: the local timeline is parked and the fork is announced.
    expect(result.forked).toBe(true);
    expect(result.parkedSessionId).toMatch(/^s1-local-[a-z0-9]+$/);
    const bodies = postBodies();
    expect(bodies.some((b) => /-local-/.test(b.sessionId))).toBe(true);
    expect(bodies.some((b) => /diverged on this device/.test(b.conversationName || ''))).toBe(true);
    expect(localGameStore.remove).toHaveBeenCalledWith('s1');
  });
});

// SAVE_SYNC_PLAN §6.1/§6.2 data-loss hardening: the reconcile pass is serialized
// under the SAME per-session queue as save() and re-reads the cloud rev fresh, so a
// device's own in-flight R->R+1 can never be mistaken for a cross-device divergence;
// after a genuine fork the player is never stranded on the ancestor (resume follows
// origId -> parkedId); and a user-set saveName survives autosave + reconcile + fork.
describe('reconcileLocalRow serialization, resume-after-fork, rename persistence (§6.1/§6.2)', () => {
  const sessionAlways = () =>
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });

  const postBodies = () =>
    apiFetch.mock.calls
      .filter(([, options]) => options?.method === 'POST')
      .map(([, options]) => JSON.parse(options.body));

  const parkedPost = () => postBodies().find((b) => /-local-/.test(b.sessionId || ''));

  let ts = 0;
  const nextTs = () => new Date(1_700_000_000_000 + (ts += 1000)).toISOString();

  // Snake_case cloud/local row from a camelCase save payload (the persisted fields
  // the assertions read back).
  const bodyToRow = (body) => ({
    conversation_name: body.conversationName ?? null,
    conversation_data: body.conversation ?? body.conversationData ?? [],
    game_settings: body.gameSettings ?? body.game_settings ?? null,
    summary: body.currentSummary ?? null,
    updated_at: nextTs(),
  });

  // A stateful, per-id cloud backend that mirrors the worker's rev-guarded upsert:
  // a brand-new id INSERTs at rev 1; an UPDATE with a matching expectedRev bumps
  // rev, a mismatch 409s with the current rev, and a missing expectedRev is an
  // unconditional bump. GET returns the row (404 when absent). advance() simulates
  // a DIFFERENT device writing the row out of band.
  const installStatefulBackend = (seed = {}) => {
    const rows = new Map();
    for (const [sid, row] of Object.entries(seed)) rows.set(sid, { updated_at: nextTs(), ...row });
    apiFetch.mockImplementation(async (path, options = {}) => {
      const method = options.method || 'GET';
      if (method === 'GET') {
        const sid = path.split('/').pop();
        const row = rows.get(sid);
        if (!row) return { ok: false, status: 404, json: async () => ({ error: 'not found' }) };
        return { ok: true, json: async () => ({ session_id: sid, sessionId: sid, ...row }) };
      }
      if (method === 'POST') {
        const body = JSON.parse(options.body);
        const sid = body.sessionId || body.session_id;
        const existing = rows.get(sid);
        if (!existing) {
          rows.set(sid, { ...bodyToRow(body), rev: 1 });
          return { ok: true, json: async () => ({ session_id: sid, sessionId: sid, rev: 1 }) };
        }
        if ('expectedRev' in body && body.expectedRev !== existing.rev) {
          return {
            ok: false,
            status: 409,
            json: async () => ({ code: 'rev_conflict', rev: existing.rev, updated_at: existing.updated_at }),
          };
        }
        const rev = existing.rev + 1;
        rows.set(sid, { ...existing, ...bodyToRow(body), rev });
        return { ok: true, json: async () => ({ session_id: sid, sessionId: sid, rev }) };
      }
      return { ok: true, json: async () => ({ success: true }) };
    });
    return { rows, advance: (sid) => { const r = rows.get(sid); if (r) r.rev += 1; } };
  };

  // A stateful IndexedDB-shaped local store: preserves base_rev across rewrites
  // (unless an explicit opts.baseRev supersedes it), and markSynced advances the
  // row's base_rev even when the ifUpdatedAt guard skips the synced flip.
  const installStatefulLocalStore = () => {
    const rows = new Map();
    localGameStore.save.mockImplementation(async (payload, opts = {}) => {
      const sid = payload.sessionId || payload.session_id;
      const existing = rows.get(sid);
      const row = {
        session_id: sid,
        conversation_name: payload.conversationName ?? existing?.conversation_name ?? null,
        conversation_data: payload.conversation ?? existing?.conversation_data ?? [],
        game_settings: payload.gameSettings ?? existing?.game_settings ?? null,
        updated_at: nextTs(),
        synced: typeof opts.synced === 'boolean' ? opts.synced : existing?.synced,
      };
      if (Number.isInteger(opts.baseRev) && opts.baseRev >= 0) row.base_rev = opts.baseRev;
      else if (existing && Number.isInteger(existing.base_rev)) row.base_rev = existing.base_rev;
      if (opts.pendingCloudSync || existing?.pending_cloud_sync) row.pending_cloud_sync = true;
      rows.set(sid, row);
      return { ...row };
    });
    localGameStore.getById.mockImplementation(async (sid) => {
      const r = rows.get(sid);
      return r ? { ...r } : null;
    });
    localGameStore.markSynced.mockImplementation(async (sid, { ifUpdatedAt, baseRev } = {}) => {
      const r = rows.get(sid);
      if (!r) return null;
      const applyRev = Number.isInteger(baseRev) && baseRev >= 0;
      if (ifUpdatedAt && r.updated_at !== ifUpdatedAt) {
        if (applyRev) { r.base_rev = baseRev; rows.set(sid, r); }
        return null;
      }
      r.synced = true;
      if (applyRev) r.base_rev = baseRev;
      delete r.pending_cloud_sync;
      rows.set(sid, r);
      return { ...r };
    });
    localGameStore.remove.mockImplementation(async (sid) => { rows.delete(sid); return { success: true }; });
    return { rows, seed: (sid, row) => rows.set(sid, { session_id: sid, ...row }) };
  };

  beforeEach(() => {
    ts = 0;
    localStorage.removeItem('activeGameSessionId');
    localStorage.removeItem('dungeongpt:fork-redirects');
  });

  test('reconcile-pass race: a live save committing R->R+1 concurrent with a reconcile does NOT fork', async () => {
    sessionAlways();
    installStatefulBackend({ s1: { rev: 5, conversation_name: 'Adventure', game_settings: { saveName: 'Adventure' } } });
    const store = installStatefulLocalStore();

    await conversationsApi.getById('s1');           // adopt cloud rev 5 -> sessionBaseRev = 5
    store.seed('s1', { synced: false, base_rev: 5, conversation_name: 'Adventure', game_settings: { saveName: 'Adventure' }, updated_at: nextTs() });
    localStorage.setItem('activeGameSessionId', 's1');
    apiFetch.mockClear();

    // Fire a save and a reconcile pass WITHOUT awaiting the save first: the classic
    // window the bug exploited. Serialization orders them on the shared 's1' queue,
    // so the reconcile decides only AFTER the save settled (rev 6, row re-marked).
    const pSave = conversationsApi.save({ sessionId: 's1', conversationName: 'Adventure', gameSettings: { saveName: 'Adventure' } });
    const pRec = conversationsApi.reconcileLocalRow('s1', { isLive: true });
    const [rSave, rRec] = await Promise.all([pSave, pRec]);

    expect(rSave.storage).toBe('cloud');
    expect(rSave.forked).toBeUndefined();
    // The reconcile did NOT fork: no parked copy, the live shadow was never dropped.
    expect(rRec.status).not.toBe('forked');
    expect(parkedPost()).toBeUndefined();
    expect(store.rows.has('s1')).toBe(true);
  });

  test('reconcile does not false-fork when the local markSynced write lagged (sessionBaseRev is the backstop)', async () => {
    sessionAlways();
    const backend = installStatefulBackend({ s1: { rev: 5, game_settings: { saveName: 'Adventure' } } });
    const store = installStatefulLocalStore();

    await conversationsApi.getById('s1'); // sessionBaseRev = 5
    store.seed('s1', { synced: false, base_rev: 5, game_settings: { saveName: 'Adventure' }, updated_at: nextTs() });
    localStorage.setItem('activeGameSessionId', 's1');

    // A push commits 5->6 and advances sessionBaseRev, but every local markSynced
    // write fails: the row is stranded at base_rev 5 while the cloud sits at 6.
    localGameStore.markSynced.mockRejectedValue(new Error('IDB write failed'));
    await conversationsApi.save({ sessionId: 's1', gameSettings: { saveName: 'Adventure' } });
    expect(backend.rows.get('s1').rev).toBe(6);
    expect(store.rows.get('s1').base_rev).toBe(5); // the lagged local lineage

    apiFetch.mockClear();
    // Pre-fix this reconcile read 6 > 5 and false-forked. Now knownBaseRev takes the
    // greater of the row's base_rev (5) and sessionBaseRev (6), so 6 > 6 is false.
    const rRec = await conversationsApi.reconcileLocalRow('s1', { isLive: true });

    expect(rRec.status).toBe('uploaded');
    expect(parkedPost()).toBeUndefined();
  });

  test('reconcile forks on a GENUINE other-device advance (real divergence still detected)', async () => {
    sessionAlways();
    const backend = installStatefulBackend({ s1: { rev: 5, conversation_name: 'Adventure', game_settings: { saveName: 'Adventure' } } });
    const store = installStatefulLocalStore();

    await conversationsApi.getById('s1'); // sessionBaseRev = 5
    store.seed('s1', { synced: false, base_rev: 5, conversation_name: 'Adventure', game_settings: { saveName: 'Adventure' }, updated_at: nextTs() });

    backend.advance('s1'); // another device: rev 5 -> 6, no local sync here
    apiFetch.mockClear();

    const rRec = await conversationsApi.reconcileLocalRow('s1', { isLive: false });

    expect(rRec.status).toBe('forked');
    expect(rRec.parkedSessionId).toMatch(/^s1-local-[a-z0-9]+$/);
    expect(parkedPost()).toBeDefined();
    expect(store.rows.has('s1')).toBe(false); // the local shadow was dropped
  });

  test('reconcile uploads under the same id when the cloud copy is absent (guest-to-account) and prunes when non-live', async () => {
    sessionAlways();
    const backend = installStatefulBackend(); // no cloud rows
    const store = installStatefulLocalStore();
    store.seed('s1', { synced: false, conversation_name: 'Adventure', game_settings: { saveName: 'Adventure' }, updated_at: nextTs() });

    const rRec = await conversationsApi.reconcileLocalRow('s1', { isLive: false });

    expect(rRec.status).toBe('uploaded');
    expect(backend.rows.has('s1')).toBe(true);   // uploaded under the SAME id
    expect(store.rows.has('s1')).toBe(false);    // non-live copy pruned after the push
    expect(parkedPost()).toBeUndefined();
  });

  test('resume-after-fork: a fork repoints the resume pointer and getById loads the PARKED copy, not the ancestor', async () => {
    sessionAlways();
    const backend = installStatefulBackend({
      s1: { rev: 5, conversation_name: 'Dragons - 7/9/2026', conversation_data: [{ role: 'user', content: 'ANCESTOR' }], game_settings: { saveName: 'Dragons' } },
    });
    const store = installStatefulLocalStore();

    await conversationsApi.getById('s1'); // sessionBaseRev = 5
    store.seed('s1', { synced: false, base_rev: 5, conversation_name: 'Dragons - 7/9/2026', conversation_data: [{ role: 'user', content: 'MY PROGRESS' }], game_settings: { saveName: 'Dragons' }, updated_at: nextTs() });
    localStorage.setItem('activeGameSessionId', 's1');

    backend.advance('s1'); // another device advances the ancestor: 5 -> 6

    const forkResult = await conversationsApi.save({
      sessionId: 's1',
      conversationName: 'Dragons - 7/9/2026',
      conversation: [{ role: 'user', content: 'MY PROGRESS' }],
      gameSettings: { saveName: 'Dragons' },
    });

    expect(forkResult.forked).toBe(true);
    const parkedId = forkResult.parkedSessionId;
    // The resume pointer now targets the parked copy, so a reload rehydrates THIS
    // device's progress, never the abandoned ancestor.
    expect(localStorage.getItem('activeGameSessionId')).toBe(parkedId);

    // Resume = GameResumeGate reads activeGameSessionId then getById(it).
    const resumed = await conversationsApi.getById(localStorage.getItem('activeGameSessionId'));
    expect(resumed.conversation_data).toEqual([{ role: 'user', content: 'MY PROGRESS' }]);
    expect(resumed.conversation_data).not.toEqual([{ role: 'user', content: 'ANCESTOR' }]);
    // Fix 6: the user-set root survived the fork onto the parked copy.
    expect(resumed.game_settings.saveName).toBe('Dragons');
    expect(resumed.conversation_name).toMatch(/^Dragons - 7\/9\/2026 \(diverged on this device, .+\)$/);
  });

  test('rename persistence: a user-set saveName survives an autosave + a reconcile pass + a fork', async () => {
    sessionAlways();
    const backend = installStatefulBackend({ s1: { rev: 5, conversation_name: 'Dragons - d', game_settings: { saveName: 'Dragons' } } });
    const store = installStatefulLocalStore();

    await conversationsApi.getById('s1'); // sessionBaseRev = 5
    localStorage.setItem('activeGameSessionId', 's1');

    // 1. Autosave with the user-set root.
    await conversationsApi.save({ sessionId: 's1', conversationName: 'Dragons - d', gameSettings: { saveName: 'Dragons' } });
    expect(backend.rows.get('s1').game_settings.saveName).toBe('Dragons');

    // 2. A reconcile pass with no divergence must not disturb the name.
    const rRec = await conversationsApi.reconcileLocalRow('s1', { isLive: true });
    expect(rRec.status).not.toBe('forked');
    expect(backend.rows.get('s1').game_settings.saveName).toBe('Dragons');

    // 3. Another device advances the ancestor -> the next save forks; the parked
    //    copy must carry the user's root (plus the diverged suffix), not lose it.
    backend.advance('s1');
    const forkResult = await conversationsApi.save({ sessionId: 's1', conversationName: 'Dragons - d', gameSettings: { saveName: 'Dragons' } });
    expect(forkResult.forked).toBe(true);

    const resumed = await conversationsApi.getById(localStorage.getItem('activeGameSessionId'));
    expect(resumed.game_settings.saveName).toBe('Dragons');
    expect(resumed.conversation_name).toMatch(/Dragons.*\(diverged on this device, .+\)$/);
  });

  test('persisted redirect survives a simulated reload: a fresh in-memory map still steers origId -> parked', async () => {
    sessionAlways();
    const backend = installStatefulBackend({ s1: { rev: 5, game_settings: { saveName: 'Adventure' } } });
    const store = installStatefulLocalStore();
    await conversationsApi.getById('s1');
    store.seed('s1', { synced: false, base_rev: 5, game_settings: { saveName: 'Adventure' }, updated_at: nextTs() });
    localStorage.setItem('activeGameSessionId', 's1');
    backend.advance('s1');
    const forkResult = await conversationsApi.save({ sessionId: 's1', gameSettings: { saveName: 'Adventure' } });

    // The redirect was mirrored to localStorage (survives a reload's fresh module load).
    const persisted = JSON.parse(localStorage.getItem('dungeongpt:fork-redirects'));
    expect(persisted.s1.sessionId).toBe(forkResult.parkedSessionId);
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
