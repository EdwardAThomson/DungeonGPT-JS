// SAVE_SYNC_PLAN Phase 1: the timestamp-guarded sync pass (runLocalGameSyncPass).
// A local row must never clobber a NEWER cloud row for the same session: the local
// copy is parked as its own save ("diverged on this device") instead. Cloud older
// or missing uploads normally; failed rows (and writes that routed back to local
// storage mid-pass) stay local for the next pass. Separate file from
// LocalGameSync.test.js because these tests mock localGameStore, which the
// round-trip mapping tests need for real.

import { runLocalGameSyncPass } from './LocalGameSync';
import { conversationsApi } from '../services/conversationsApi';
import { localGameStore } from '../services/localGameStore';

jest.mock('../services/conversationsApi', () => ({
  conversationsApi: { save: jest.fn(), getById: jest.fn() },
}));

jest.mock('../services/localGameStore', () => ({
  localGameStore: { list: jest.fn(), remove: jest.fn() },
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
  conversationsApi.save.mockResolvedValue({ storage: 'cloud' });
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
});
