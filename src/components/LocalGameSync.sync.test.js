// SAVE_SYNC_PLAN Phases 1-3 + §6.1 hardening: the reconcile pass
// (runLocalGameSyncPass). The pass itself now owns only two things: it prunes/keeps
// rows already marked synced (Phase 2 write-ahead semantics), and it delegates every
// UNSYNCED row's divergence check + upload/fork to conversationsApi.reconcileLocalRow,
// which runs that whole critical section INSIDE the per-session save queue so a live
// save's own in-flight rev bump can never be mistaken for a cross-device divergence.
// The divergence LOGIC (rev vs timestamp, genuine-fork detection, the race guard)
// lives in reconcileLocalRow and is pinned in conversationsApi.test.js. This file
// pins the pass's status -> count/failed mapping and the synced-prune/keep rules.
// Separate file from LocalGameSync.test.js because these tests mock localGameStore,
// which the round-trip mapping tests need for real.

import { runLocalGameSyncPass } from './LocalGameSync';
import { conversationsApi } from '../services/conversationsApi';
import { localGameStore } from '../services/localGameStore';

jest.mock('../services/conversationsApi', () => ({
  conversationsApi: { reconcileLocalRow: jest.fn() },
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
  conversationsApi.reconcileLocalRow.mockResolvedValue({ status: 'uploaded' });
  localGameStore.remove.mockResolvedValue({ success: true });
  localGameStore.markSynced.mockResolvedValue({ synced: true });
});

describe('runLocalGameSyncPass delegates unsynced rows to the serialized reconcile', () => {
  test('an unsynced row is reconciled under the lock (with its live flag), and a clean upload counts', async () => {
    localGameStore.list.mockResolvedValue([localRow()]);

    const result = await runLocalGameSyncPass();

    expect(conversationsApi.reconcileLocalRow).toHaveBeenCalledTimes(1);
    expect(conversationsApi.reconcileLocalRow).toHaveBeenCalledWith('sess-1', { isLive: false });
    // The pass no longer prunes or marks anything itself: reconcileLocalRow owns
    // the upload, the prune (non-live) and the synced-mark (live).
    expect(localGameStore.remove).not.toHaveBeenCalled();
    expect(result).toEqual({ count: 1, failed: false, empty: false });
  });

  test('the live flag is passed through so the reconcile keeps the write-ahead copy', async () => {
    localStorage.setItem('activeGameSessionId', 'sess-1');
    localGameStore.list.mockResolvedValue([localRow({ synced: false })]);

    await runLocalGameSyncPass();

    expect(conversationsApi.reconcileLocalRow).toHaveBeenCalledWith('sess-1', { isLive: true });
  });

  test("a genuine fork (status 'forked') counts as progress preserved", async () => {
    localGameStore.list.mockResolvedValue([localRow()]);
    conversationsApi.reconcileLocalRow.mockResolvedValue({
      status: 'forked', parkedSessionId: 'sess-1-local-abc', pendingCloudSync: false,
    });

    const result = await runLocalGameSyncPass();

    expect(result).toEqual({ count: 1, failed: false, empty: false });
  });

  test('a fork whose parked copy stayed device-only keeps the pass armed for a retry', async () => {
    localGameStore.list.mockResolvedValue([localRow()]);
    conversationsApi.reconcileLocalRow.mockResolvedValue({
      status: 'forked', parkedSessionId: 'sess-1-local-abc', pendingCloudSync: true,
    });

    const result = await runLocalGameSyncPass();

    expect(result).toEqual({ count: 0, failed: true, empty: false });
  });

  test("'pendingLocal' (auth vanished mid-pass): row kept, pass marked failed", async () => {
    localGameStore.list.mockResolvedValue([localRow()]);
    conversationsApi.reconcileLocalRow.mockResolvedValue({ status: 'pendingLocal' });

    const result = await runLocalGameSyncPass();

    expect(localGameStore.remove).not.toHaveBeenCalled();
    expect(result).toEqual({ count: 0, failed: true, empty: false });
  });

  test("'failed' (local read error): pass marked failed", async () => {
    localGameStore.list.mockResolvedValue([localRow()]);
    conversationsApi.reconcileLocalRow.mockResolvedValue({ status: 'failed' });

    const result = await runLocalGameSyncPass();

    expect(result).toEqual({ count: 0, failed: true, empty: false });
  });

  test("'synced' and 'gone' (settled by the save ahead of us): neither counted nor failed", async () => {
    localGameStore.list.mockResolvedValue([
      localRow({ session_id: 'sess-synced' }),
      localRow({ session_id: 'sess-gone' }),
    ]);
    conversationsApi.reconcileLocalRow
      .mockResolvedValueOnce({ status: 'synced' })
      .mockResolvedValueOnce({ status: 'gone' });

    const result = await runLocalGameSyncPass();

    expect(result).toEqual({ count: 0, failed: false, empty: false });
  });

  test('a reconcile that throws is caught and marks the pass failed (batch continues)', async () => {
    localGameStore.list.mockResolvedValue([
      localRow({ session_id: 'sess-ok' }),
      localRow({ session_id: 'sess-boom' }),
    ]);
    conversationsApi.reconcileLocalRow.mockImplementation(async (sid) => {
      if (sid === 'sess-boom') throw new Error('boom');
      return { status: 'uploaded' };
    });

    const result = await runLocalGameSyncPass();

    expect(result).toEqual({ count: 1, failed: true, empty: false });
  });

  test('empty store: reports empty so the caller can re-arm for a later fallback save', async () => {
    localGameStore.list.mockResolvedValue([]);
    const result = await runLocalGameSyncPass();
    expect(conversationsApi.reconcileLocalRow).not.toHaveBeenCalled();
    expect(result).toEqual({ count: 0, failed: false, empty: true });
  });

  test('a failed list read is reported as failed', async () => {
    localGameStore.list.mockRejectedValue(new Error('IDB unavailable'));
    const result = await runLocalGameSyncPass();
    expect(result).toEqual({ count: 0, failed: true, empty: false });
  });
});

describe('runLocalGameSyncPass synced-row prune/keep (Phase 2, decided outside the lock)', () => {
  test('synced non-live row: pruned without a reconcile (already in the account)', async () => {
    localGameStore.list.mockResolvedValue([localRow({ synced: true })]);

    const result = await runLocalGameSyncPass();

    expect(conversationsApi.reconcileLocalRow).not.toHaveBeenCalled();
    expect(localGameStore.remove).toHaveBeenCalledWith('sess-1');
    expect(result).toEqual({ count: 0, failed: false, empty: false });
  });

  test('synced LIVE row: kept as the write-ahead copy, no reconcile, no prune', async () => {
    localStorage.setItem('activeGameSessionId', 'sess-1');
    localGameStore.list.mockResolvedValue([localRow({ synced: true })]);

    const result = await runLocalGameSyncPass();

    expect(conversationsApi.reconcileLocalRow).not.toHaveBeenCalled();
    expect(localGameStore.remove).not.toHaveBeenCalled();
    expect(result).toEqual({ count: 0, failed: false, empty: false });
  });

  test('mixed batch: synced non-live pruned, unsynced reconciled, counts reflect pushes only', async () => {
    localGameStore.list.mockResolvedValue([
      localRow({ session_id: 'sess-done', synced: true }),
      localRow({ session_id: 'sess-pending', synced: false }),
    ]);

    const result = await runLocalGameSyncPass();

    expect(conversationsApi.reconcileLocalRow).toHaveBeenCalledTimes(1);
    expect(conversationsApi.reconcileLocalRow).toHaveBeenCalledWith('sess-pending', { isLive: false });
    expect(localGameStore.remove).toHaveBeenCalledWith('sess-done');
    expect(result).toEqual({ count: 1, failed: false, empty: false });
  });
});
