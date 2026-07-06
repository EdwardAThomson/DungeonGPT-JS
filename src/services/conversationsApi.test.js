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
