// SAVE_SYNC_PLAN Phases 1-2: the sync must also run on auth RESTORATION, not just
// on the sign-in event. The component subscribes to supabase.auth.onAuthStateChange
// and re-arms the pass on SIGNED_IN / TOKEN_REFRESHED even though the AuthContext
// user never transitioned through null (silent token refresh mid-session). Phase 2
// adds the PENDING_LOCAL_SAVE_EVENT trigger: a save that reported 'savedLocal'
// requests a reconcile pass without waiting for the next auth event. The mount pass
// itself covers "app start with a session present" (user already set on mount).

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import LocalGameSync from './LocalGameSync';
import { conversationsApi } from '../services/conversationsApi';
import { localGameStore } from '../services/localGameStore';
import { PENDING_LOCAL_SAVE_EVENT } from '../game/saveController';

// "mock"-prefixed so the jest.mock factory may close over it.
const mockAuthEvents = { callback: null };

jest.mock('../services/supabaseClient', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb) => {
        mockAuthEvents.callback = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  },
}));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('../services/conversationsApi', () => ({
  conversationsApi: { save: jest.fn(), getById: jest.fn() },
}));

jest.mock('../services/localGameStore', () => ({
  localGameStore: { list: jest.fn(), remove: jest.fn(), markSynced: jest.fn() },
}));

const localRow = {
  session_id: 'sess-r1',
  conversation_name: 'Adventure - 7/1/2026, 10:00:00 AM',
  conversation_data: [],
  updated_at: '2026-07-01T10:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthEvents.callback = null;
  conversationsApi.getById.mockRejectedValue(new Error('404'));
  conversationsApi.save.mockResolvedValue({ storage: 'cloud' });
  localGameStore.remove.mockResolvedValue({ success: true });
});

describe('LocalGameSync auth restoration', () => {
  test('TOKEN_REFRESHED re-arms and runs another sync pass; SIGNED_OUT does not', async () => {
    // First pass syncs one row (so syncedRef stays armed: not empty, not failed).
    localGameStore.list
      .mockResolvedValueOnce([localRow])
      .mockResolvedValue([]);

    render(<LocalGameSync />);

    await waitFor(() => expect(localGameStore.list).toHaveBeenCalledTimes(1));
    await screen.findByText(/1 game saved to your account/);

    // Silent token refresh mid-session: the user object never changed, but the
    // subscription resets the guard and bumps the tick, so a second pass runs.
    expect(mockAuthEvents.callback).toBeInstanceOf(Function);
    act(() => mockAuthEvents.callback('TOKEN_REFRESHED'));
    await waitFor(() => expect(localGameStore.list).toHaveBeenCalledTimes(2));

    // Signing out must not trigger a pass (count unchanged after a flush).
    act(() => mockAuthEvents.callback('SIGNED_OUT'));
    await act(async () => { await Promise.resolve(); });
    expect(localGameStore.list).toHaveBeenCalledTimes(2);
  });

  test('SIGNED_IN via the subscription also triggers a pass', async () => {
    // First mount pass finds nothing (empty re-arms the guard by design).
    localGameStore.list.mockResolvedValue([]);

    render(<LocalGameSync />);
    await waitFor(() => expect(localGameStore.list).toHaveBeenCalledTimes(1));

    act(() => mockAuthEvents.callback('SIGNED_IN'));
    await waitFor(() => expect(localGameStore.list).toHaveBeenCalledTimes(2));
  });

  test("a 'savedLocal' report (PENDING_LOCAL_SAVE_EVENT) triggers a reconcile pass while signed in", async () => {
    // Mount pass runs first ("app start with a session present"), then a save that
    // landed device-only fires the event: the pass must run again so the pending
    // row is pushed as soon as the cloud is reachable, no auth event required.
    localGameStore.list
      .mockResolvedValueOnce([localRow])
      .mockResolvedValue([]);

    render(<LocalGameSync />);
    await waitFor(() => expect(localGameStore.list).toHaveBeenCalledTimes(1));
    await screen.findByText(/1 game saved to your account/);

    act(() => {
      window.dispatchEvent(new Event(PENDING_LOCAL_SAVE_EVENT));
    });
    await waitFor(() => expect(localGameStore.list).toHaveBeenCalledTimes(2));
  });
});
