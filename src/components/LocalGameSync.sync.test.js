// SAVE_SYNC_PLAN Phases 1-3: the divergence-guarded reconcile pass
// (runLocalGameSyncPass). A local row must never clobber a cloud row it does not
// descend from: the local copy is parked as its own save ("diverged on this
// device", forkLocalTimeline) instead. Cloud behind or missing uploads normally;
// failed rows (and writes that routed back to local storage mid-pass) stay local
// for the next pass. Phase 2 adds live-session awareness: rows already marked
// synced:true are pruned (non-live) or kept (live write-ahead copy, plan §10), and
// a pushed live row is marked synced instead of removed. Phase 3 (§6.1): when both
// sides carry lineage (cloud rev + local base_rev) the rev comparison REPLACES the
// timestamp one; the timestamp guard stays as the legacy fallback. Separate file
// from LocalGameSync.test.js because these tests mock localGameStore, which the
// round-trip mapping tests need for real.

import { runLocalGameSyncPass } from './LocalGameSync';
import { conversationsApi, forkLocalTimeline } from '../services/conversationsApi';
import { localGameStore } from '../services/localGameStore';

jest.mock('../services/conversationsApi', () => ({
  conversationsApi: { save: jest.fn(), getById: jest.fn() },
  forkLocalTimeline: jest.fn(),
}));

jest.mock('../services/localGameStore', () => ({
  localGameStore: { list: jest.fn(), remove: jest.fn(), markSynced: jest.fn() },
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

jest.mock('../services/supabaseClient', () => ({ supabase: null }));

const localRow = (overrides = {}) => ({
  session_id: 'sess-1',
  conversation_name: 'Adventure - 7/1/2026, 10:00:00 AM',
  conversation_data: [{ role: 'user', content: 'hello' }],
  game_settings: { saveName: 'Adventure' },
  updated_at: '2026-07-01T10:00:00.000Z',
  timestamp: '2026-07-01T10:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.removeItem('activeGameSessionId');
  conversationsApi.save.mockResolvedValue({ storage: 'cloud' });
  forkLocalTimeline.mockResolvedValue({ forked: true, parkedSessionId: 'sess-1-local-abc123', storage: 'cloud', pendingCloudSync: false });
  localGameStore.remove.mockResolvedValue({ success: true });
  localGameStore.markSynced.mockResolvedValue({ synced: true });
});

describe('runLocalGameSyncPass timestamp guard', () => {
  test('no cloud copy (getById rejects): uploads under the original session_id and removes the local row', async () => {
    localGameStore.list.mockResolvedValue([localRow()]);
    conversationsApi.getById.mockRejectedValue(new Error('404 not found'));

    const result = await runLocalGameSyncPass();

    expect(conversationsApi.save).toHaveBeenCalledTimes(1);
    expect(conversationsApi.save.mock.calls[0][0].sessionId).toBe('sess-1');
    expect(localGameStore.remove).toHaveBeenCalledWith('sess-1');
    expect(result).toEqual({ count: 1, failed: false, empty: false });
  });

  test('cloud copy OLDER than local: uploads normally (fast-forward)', async () => {
    localGameStore.list.mockResolvedValue([localRow()]);
    conversationsApi.getById.mockResolvedValue({
      session_id: 'sess-1',
      updated_at: '2026-06-30T09:00:00.000Z',
    });

    const result = await runLocalGameSyncPass();

    expect(conversationsApi.save.mock.calls[0][0].sessionId).toBe('sess-1');
    expect(localGameStore.remove).toHaveBeenCalledWith('sess-1');
    expect(result.count).toBe(1);
  });

  test('cloud copy NEWER than local: forked (parked as a diverged copy), the cloud row is never written', async () => {
    localGameStore.list.mockResolvedValue([localRow()]);
    conversationsApi.getById.mockResolvedValue({
      session_id: 'sess-1',
      updated_at: '2026-07-02T12:00:00.000Z',
    });

    const result = await runLocalGameSyncPass();

    // Parking (new session_id, "(diverged on this device, <date>)" name, ledger
    // union, removal of the original local row) lives in forkLocalTimeline and is
    // pinned in conversationsApi.test.js; the pass must hand it the local
    // timeline instead of uploading over the cloud row.
    expect(forkLocalTimeline).toHaveBeenCalledTimes(1);
    expect(forkLocalTimeline).toHaveBeenCalledWith(
      'sess-1',
      expect.objectContaining({ sessionId: 'sess-1', conversationName: 'Adventure - 7/1/2026, 10:00:00 AM' })
    );
    expect(conversationsApi.save).not.toHaveBeenCalled();
    expect(result.count).toBe(1);
  });

  test('upload failure: the local row stays for the next pass', async () => {
    localGameStore.list.mockResolvedValue([localRow()]);
    conversationsApi.getById.mockRejectedValue(new Error('404'));
    conversationsApi.save.mockRejectedValue(new Error('worker down'));

    const result = await runLocalGameSyncPass();

    expect(localGameStore.remove).not.toHaveBeenCalled();
    expect(result).toEqual({ count: 0, failed: true, empty: false });
  });

  test('write routed back to local storage (auth vanished mid-pass): row kept, pass marked failed', async () => {
    localGameStore.list.mockResolvedValue([localRow()]);
    conversationsApi.getById.mockRejectedValue(new Error('404'));
    conversationsApi.save.mockResolvedValue({ storage: 'local', pendingCloudSync: true });

    const result = await runLocalGameSyncPass();

    // The original row must NOT be removed: its "upload" never left this device.
    expect(localGameStore.remove).not.toHaveBeenCalledWith('sess-1');
    expect(result).toEqual({ count: 0, failed: true, empty: false });
  });

  test('mixed batch: good rows sync, bad rows stay, counts add up', async () => {
    localGameStore.list.mockResolvedValue([
      localRow({ session_id: 'sess-ok' }),
      localRow({ session_id: 'sess-bad' }),
    ]);
    conversationsApi.getById.mockRejectedValue(new Error('404'));
    conversationsApi.save.mockImplementation(async (payload) => {
      if (payload.sessionId === 'sess-bad') throw new Error('boom');
      return { storage: 'cloud' };
    });

    const result = await runLocalGameSyncPass();

    expect(localGameStore.remove).toHaveBeenCalledWith('sess-ok');
    expect(localGameStore.remove).not.toHaveBeenCalledWith('sess-bad');
    expect(result).toEqual({ count: 1, failed: true, empty: false });
  });

  test('empty store: reports empty so the caller can re-arm for a later fallback save', async () => {
    localGameStore.list.mockResolvedValue([]);
    const result = await runLocalGameSyncPass();
    expect(conversationsApi.save).not.toHaveBeenCalled();
    expect(result).toEqual({ count: 0, failed: false, empty: true });
  });

  test('legacy row without sync fields still uploads (guest-to-account conversion stays lossless)', async () => {
    // localRow() carries neither `synced` nor `pending_cloud_sync`: the pass must
    // treat it as unsynced, not as an already-synced cloud-era row to prune.
    localGameStore.list.mockResolvedValue([localRow()]);
    conversationsApi.getById.mockRejectedValue(new Error('404'));

    const result = await runLocalGameSyncPass();

    expect(conversationsApi.save).toHaveBeenCalledTimes(1);
    expect(result.count).toBe(1);
  });
});

describe('runLocalGameSyncPass live-session and prune semantics (Phase 2)', () => {
  test('synced non-live row: pruned without a push (already in the account)', async () => {
    localGameStore.list.mockResolvedValue([localRow({ synced: true })]);

    const result = await runLocalGameSyncPass();

    expect(conversationsApi.getById).not.toHaveBeenCalled();
    expect(conversationsApi.save).not.toHaveBeenCalled();
    expect(localGameStore.remove).toHaveBeenCalledWith('sess-1');
    expect(result).toEqual({ count: 0, failed: false, empty: false });
  });

  test('synced LIVE row: kept as the write-ahead copy, no push, no prune', async () => {
    localStorage.setItem('activeGameSessionId', 'sess-1');
    localGameStore.list.mockResolvedValue([localRow({ synced: true })]);

    const result = await runLocalGameSyncPass();

    expect(conversationsApi.save).not.toHaveBeenCalled();
    expect(localGameStore.remove).not.toHaveBeenCalled();
    expect(result).toEqual({ count: 0, failed: false, empty: false });
  });

  test('unsynced LIVE row: pushed, then marked synced and KEPT (not removed)', async () => {
    localStorage.setItem('activeGameSessionId', 'sess-1');
    localGameStore.list.mockResolvedValue([localRow({ synced: false })]);
    conversationsApi.getById.mockRejectedValue(new Error('404'));

    const result = await runLocalGameSyncPass();

    expect(conversationsApi.save).toHaveBeenCalledTimes(1);
    expect(conversationsApi.save.mock.calls[0][0].sessionId).toBe('sess-1');
    expect(localGameStore.markSynced).toHaveBeenCalledWith('sess-1', { ifUpdatedAt: '2026-07-01T10:00:00.000Z' });
    expect(localGameStore.remove).not.toHaveBeenCalled();
    expect(result).toEqual({ count: 1, failed: false, empty: false });
  });

  test('unsynced LIVE row with a NEWER cloud copy: forked, never marked synced', async () => {
    localStorage.setItem('activeGameSessionId', 'sess-1');
    localGameStore.list.mockResolvedValue([localRow({ synced: false })]);
    conversationsApi.getById.mockResolvedValue({
      session_id: 'sess-1',
      updated_at: '2026-07-02T12:00:00.000Z',
    });

    const result = await runLocalGameSyncPass();

    // The diverged timeline is parked by forkLocalTimeline (which also drops the
    // stale write-ahead copy); the live game's next save recreates its own.
    expect(forkLocalTimeline).toHaveBeenCalledWith('sess-1', expect.objectContaining({ sessionId: 'sess-1' }));
    expect(conversationsApi.save).not.toHaveBeenCalled();
    expect(localGameStore.markSynced).not.toHaveBeenCalled();
    expect(result.count).toBe(1);
  });

  test('rev fork: cloud rev beyond local base_rev forks even though the LOCAL timestamp is newer', async () => {
    // The case timestamps cannot call (SAVE_SYNC_PLAN §6.1): both timelines
    // advanced from a common ancestor, the local one most recently. The old
    // timestamp guard would upload and clobber the other device's evening; the
    // rev comparison detects the fork.
    localGameStore.list.mockResolvedValue([
      localRow({ synced: false, base_rev: 3, updated_at: '2026-07-03T10:00:00.000Z' }),
    ]);
    conversationsApi.getById.mockResolvedValue({
      session_id: 'sess-1',
      rev: 5,
      updated_at: '2026-07-02T12:00:00.000Z',
    });

    const result = await runLocalGameSyncPass();

    expect(forkLocalTimeline).toHaveBeenCalledWith('sess-1', expect.objectContaining({ sessionId: 'sess-1' }));
    expect(conversationsApi.save).not.toHaveBeenCalled();
    expect(result.count).toBe(1);
  });

  test('rev fast-forward: matching revs upload even though the CLOUD timestamp is newer (e.g. a rename bumped it)', async () => {
    localGameStore.list.mockResolvedValue([
      localRow({ synced: false, base_rev: 5, updated_at: '2026-07-01T10:00:00.000Z' }),
    ]);
    conversationsApi.getById.mockResolvedValue({
      session_id: 'sess-1',
      rev: 5,
      updated_at: '2026-07-02T12:00:00.000Z',
    });

    const result = await runLocalGameSyncPass();

    expect(forkLocalTimeline).not.toHaveBeenCalled();
    expect(conversationsApi.save).toHaveBeenCalledTimes(1);
    expect(conversationsApi.save.mock.calls[0][0].sessionId).toBe('sess-1');
    expect(localGameStore.remove).toHaveBeenCalledWith('sess-1');
    expect(result.count).toBe(1);
  });

  test('legacy local row (no base_rev) against a rev-carrying cloud row: timestamp fallback decides', async () => {
    localGameStore.list.mockResolvedValue([localRow({ synced: false })]);
    conversationsApi.getById.mockResolvedValue({
      session_id: 'sess-1',
      rev: 5,
      updated_at: '2026-07-02T12:00:00.000Z',
    });

    const result = await runLocalGameSyncPass();

    // Cloud newer by timestamp: parked, exactly as in Phases 1-2. The rev on the
    // cloud row alone must not invent a fork verdict beyond what timestamps say.
    expect(forkLocalTimeline).toHaveBeenCalledTimes(1);
    expect(result.count).toBe(1);
  });

  test('mid-pass race: conversationsApi.save reports forked, the pass counts it and leaves cleanup to the helper', async () => {
    localGameStore.list.mockResolvedValue([localRow({ synced: false, base_rev: 5 })]);
    conversationsApi.getById.mockRejectedValue(new Error('404'));
    conversationsApi.save.mockResolvedValue({ forked: true, parkedSessionId: 'sess-1-local-xyz', storage: 'cloud', pendingCloudSync: false });

    const result = await runLocalGameSyncPass();

    // forkLocalTimeline already removed the original row and parked the copy;
    // the pass must not prune or mark anything on top of that.
    expect(localGameStore.remove).not.toHaveBeenCalled();
    expect(localGameStore.markSynced).not.toHaveBeenCalled();
    expect(result).toEqual({ count: 1, failed: false, empty: false });
  });

  test('fork whose parked copy stayed device-only: pass stays armed for a retry', async () => {
    localGameStore.list.mockResolvedValue([
      localRow({ synced: false, base_rev: 3 }),
    ]);
    conversationsApi.getById.mockResolvedValue({ session_id: 'sess-1', rev: 5, updated_at: '2026-07-02T12:00:00.000Z' });
    forkLocalTimeline.mockResolvedValue({ forked: true, parkedSessionId: 'sess-1-local-xyz', storage: 'local', pendingCloudSync: true });

    const result = await runLocalGameSyncPass();

    expect(result).toEqual({ count: 0, failed: true, empty: false });
  });

  test('mixed batch: synced non-live pruned, unsynced pushed and removed, counts reflect pushes only', async () => {
    localGameStore.list.mockResolvedValue([
      localRow({ session_id: 'sess-done', synced: true }),
      localRow({ session_id: 'sess-pending', synced: false }),
    ]);
    conversationsApi.getById.mockRejectedValue(new Error('404'));

    const result = await runLocalGameSyncPass();

    expect(conversationsApi.save).toHaveBeenCalledTimes(1);
    expect(conversationsApi.save.mock.calls[0][0].sessionId).toBe('sess-pending');
    expect(localGameStore.remove).toHaveBeenCalledWith('sess-done');
    expect(localGameStore.remove).toHaveBeenCalledWith('sess-pending');
    expect(result).toEqual({ count: 1, failed: false, empty: false });
  });
});
