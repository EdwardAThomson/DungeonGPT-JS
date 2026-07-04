// SAVE_SYNC_PLAN Phases 1-2: the timestamp-guarded reconcile pass
// (runLocalGameSyncPass). A local row must never clobber a NEWER cloud row for the
// same session: the local copy is parked as its own save ("diverged on this
// device") instead. Cloud older or missing uploads normally; failed rows (and
// writes that routed back to local storage mid-pass) stay local for the next pass.
// Phase 2 adds live-session awareness: rows already marked synced:true are pruned
// (non-live) or kept (live write-ahead copy, plan §10), and a pushed live row is
// marked synced instead of removed. Separate file from LocalGameSync.test.js
// because these tests mock localGameStore, which the round-trip mapping tests need
// for real.

import { runLocalGameSyncPass } from './LocalGameSync';
import { conversationsApi } from '../services/conversationsApi';
import { localGameStore } from '../services/localGameStore';

jest.mock('../services/conversationsApi', () => ({
  conversationsApi: { save: jest.fn(), getById: jest.fn() },
}));

jest.mock('../services/localGameStore', () => ({
  localGameStore: { list: jest.fn(), remove: jest.fn(), markSynced: jest.fn() },
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

  test('cloud copy NEWER than local: parks a diverged copy, does not overwrite the cloud row', async () => {
    localGameStore.list.mockResolvedValue([localRow()]);
    conversationsApi.getById.mockResolvedValue({
      session_id: 'sess-1',
      updated_at: '2026-07-02T12:00:00.000Z',
    });

    const result = await runLocalGameSyncPass();

    expect(conversationsApi.save).toHaveBeenCalledTimes(1);
    const uploaded = conversationsApi.save.mock.calls[0][0];
    // New session_id: the cloud row for sess-1 is never written.
    expect(uploaded.sessionId).toMatch(/^sess-1-local-[a-z0-9]+$/);
    expect(uploaded.sessionId).not.toBe('sess-1');
    // Name carries the divergence suffix (SAVE_SYNC_PLAN section 6.2).
    expect(uploaded.conversationName).toMatch(/^Adventure - 7\/1\/2026, 10:00:00 AM \(diverged on this device, .+\)$/);
    // The original local row is removed once the parked copy is safely uploaded.
    expect(localGameStore.remove).toHaveBeenCalledWith('sess-1');
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

  test('unsynced LIVE row with a NEWER cloud copy: parked as diverged, local row removed', async () => {
    localStorage.setItem('activeGameSessionId', 'sess-1');
    localGameStore.list.mockResolvedValue([localRow({ synced: false })]);
    conversationsApi.getById.mockResolvedValue({
      session_id: 'sess-1',
      updated_at: '2026-07-02T12:00:00.000Z',
    });

    const result = await runLocalGameSyncPass();

    const uploaded = conversationsApi.save.mock.calls[0][0];
    expect(uploaded.sessionId).toMatch(/^sess-1-local-[a-z0-9]+$/);
    // The diverged timeline now lives in the cloud under its own id; the stale
    // write-ahead copy goes, and the live game's next autosave recreates it.
    expect(localGameStore.remove).toHaveBeenCalledWith('sess-1');
    expect(localGameStore.markSynced).not.toHaveBeenCalled();
    expect(result.count).toBe(1);
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
