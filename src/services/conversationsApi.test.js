// SAVE_SYNC_PLAN Phase 1: routing + honest-fallback markers.
// conversationsApi picks cloud vs local per call; these tests pin down (a) the
// `storage` marker on save/updateMessages results, (b) when a local fallback write
// is stamped pendingCloudSync (account-holders yes, plain guests no), and (c) that
// a failed getSession() falls back to the last known auth state instead of
// silently meaning "guest".

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
  },
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

beforeEach(() => {
  // CRA's jest config resets mocks between tests, so implementations live here.
  _resetAuthStateForTests();
  apiFetch.mockImplementation(async () => ({ ok: true, json: async () => ({ success: true }) }));
  localGameStore.save.mockImplementation(async (payload, opts) => ({
    session_id: payload.sessionId,
    ...(opts?.pendingCloudSync ? { pending_cloud_sync: true } : {}),
  }));
  localGameStore.updateMessages.mockImplementation(async (sessionId, data, opts) => ({
    session_id: sessionId,
    conversation_data: data,
    ...(opts?.pendingCloudSync ? { pending_cloud_sync: true } : {}),
  }));
});

describe('conversationsApi.save routing and storage marker', () => {
  test('signed in: routes to the cloud backend and returns storage "cloud"', async () => {
    sessionPresent();
    const result = await conversationsApi.save({ sessionId: 's1' });
    expect(apiFetch).toHaveBeenCalled();
    expect(localGameStore.save).not.toHaveBeenCalled();
    expect(result.storage).toBe('cloud');
    expect(getLastKnownAuth()).toBe('signed-in');
  });

  test('plain guest (confirmed signed out, never signed in): local write, NO pending stamp', async () => {
    sessionAbsent();
    const result = await conversationsApi.save({ sessionId: 's1' });
    expect(localGameStore.save).toHaveBeenCalledWith({ sessionId: 's1' }, { pendingCloudSync: false });
    expect(result.storage).toBe('local');
    expect(result.pendingCloudSync).toBe(false);
    expect(getLastKnownAuth()).toBe('guest');
  });

  test('account-holder whose token died mid-session: local write WITH pending stamp', async () => {
    sessionPresent();
    await conversationsApi.save({ sessionId: 's1' }); // establishes signed-in this session

    sessionAbsent(); // token expired, getSession succeeds but returns no session
    const result = await conversationsApi.save({ sessionId: 's1' });
    expect(localGameStore.save).toHaveBeenCalledWith({ sessionId: 's1' }, { pendingCloudSync: true });
    expect(result.storage).toBe('local');
    expect(result.pendingCloudSync).toBe(true);
  });

  test('updateMessages carries the same routing and stamping', async () => {
    sessionPresent();
    await conversationsApi.save({ sessionId: 's1' });

    sessionThrows();
    const result = await conversationsApi.updateMessages('s1', [{ role: 'user', content: 'hi' }]);
    expect(localGameStore.updateMessages).toHaveBeenCalledWith(
      's1',
      [{ role: 'user', content: 'hi' }],
      { pendingCloudSync: true }
    );
    expect(result.storage).toBe('local');
    expect(result.pendingCloudSync).toBe(true);
  });
});

describe('auth-check hardening (failed getSession is not "guest")', () => {
  test('throw after a confirmed sign-in: routes local but stamps pending, last known state kept', async () => {
    sessionPresent();
    await conversationsApi.save({ sessionId: 's1' });
    expect(getLastKnownAuth()).toBe('signed-in');

    sessionThrows();
    await conversationsApi.save({ sessionId: 's1' });
    expect(localGameStore.save).toHaveBeenLastCalledWith({ sessionId: 's1' }, { pendingCloudSync: true });
    // The failure did not overwrite the last successful check.
    expect(getLastKnownAuth()).toBe('signed-in');
  });

  test('throw with no prior successful check ("unknown"): pending-eligible, not a plain guest', async () => {
    expect(getLastKnownAuth()).toBe('unknown');
    sessionThrows();
    const result = await conversationsApi.save({ sessionId: 's1' });
    expect(localGameStore.save).toHaveBeenCalledWith({ sessionId: 's1' }, { pendingCloudSync: true });
    expect(result.pendingCloudSync).toBe(true);
    expect(getLastKnownAuth()).toBe('unknown');
  });

  test('throw after a confirmed guest check: still a plain guest, no stamp', async () => {
    sessionAbsent();
    await conversationsApi.save({ sessionId: 's1' });
    expect(getLastKnownAuth()).toBe('guest');

    sessionThrows();
    await conversationsApi.save({ sessionId: 's1' });
    expect(localGameStore.save).toHaveBeenLastCalledWith({ sessionId: 's1' }, { pendingCloudSync: false });
  });

  test('list/getById route local when the auth check fails', async () => {
    localGameStore.list.mockResolvedValueOnce([]);
    sessionThrows();
    await conversationsApi.list();
    expect(localGameStore.list).toHaveBeenCalled();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
