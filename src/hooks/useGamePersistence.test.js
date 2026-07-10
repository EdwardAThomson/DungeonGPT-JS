// SAVE_SYNC_PLAN Phases 1-2: performSave must report an honest status. A cloud
// write stays 'saved'; a device-only write for an account-holder (pendingCloudSync
// from conversationsApi via saveConversationToBackend, whether auth was absent or
// the cloud push failed) becomes 'savedLocal' so the confirmation modal can say
// "saved on this device", and fires PENDING_LOCAL_SAVE_EVENT so LocalGameSync
// retries the push. With write-through saves, 'error' is reserved for "even the
// local write failed". Legacy boolean `true` results keep meaning 'saved' (guests:
// their local save IS the save).

import { renderHook } from '@testing-library/react';
import useGamePersistence, { deriveSaveIndicatorState } from './useGamePersistence';
import { PENDING_LOCAL_SAVE_EVENT } from '../game/saveController';

const noopLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

const buildArgs = (saveConversationToBackend, overrides = {}) => ({
  sessionId: 'sess-1',
  hasAdventureStarted: true,
  loadedConversation: null,
  saveConversationToBackend,
  interactionHook: {
    conversation: [{ role: 'user', content: 'hello' }],
    currentSummary: '',
  },
  mapHook: {
    worldMap: null,
    playerPosition: { x: 1, y: 2 },
    currentTownMap: null,
    townPlayerPosition: null,
    currentTownTile: null,
    isInsideTown: false,
    townMapsCache: {},
    currentMapLevel: 'world',
    visitedBiomes: [],
    visitedTowns: [],
    currentSiteMap: null,
    sitePlayerPosition: null,
    currentSiteTile: null,
    isInsideSite: false,
    siteMapsCache: {},
  },
  settings: { saveName: 'Adventure' },
  selectedProvider: 'cf-workers',
  selectedModel: 'gpt-oss',
  selectedHeroes: [],
  movesSinceEncounter: 0,
  logger: noopLogger,
  ...overrides,
});

const renderPersistence = (saveMock, overrides) =>
  renderHook(() => useGamePersistence(buildArgs(saveMock, overrides)));

describe('performSave status reporting', () => {
  test('cloud write: status stays "saved"', async () => {
    const saveMock = jest.fn().mockResolvedValue({ ok: true, storage: 'cloud', pendingCloudSync: false });
    const { result } = renderPersistence(saveMock);
    expect(await result.current.performSave()).toBe('saved');
  });

  test('account-holder fallback (pendingCloudSync): status is "savedLocal"', async () => {
    const saveMock = jest.fn().mockResolvedValue({ ok: true, storage: 'local', pendingCloudSync: true });
    const { result } = renderPersistence(saveMock);
    expect(await result.current.performSave()).toBe('savedLocal');
  });

  test('guest local write (no pending stamp): status stays "saved"', async () => {
    const saveMock = jest.fn().mockResolvedValue({ ok: true, storage: 'local', pendingCloudSync: false });
    const { result } = renderPersistence(saveMock);
    expect(await result.current.performSave()).toBe('saved');
  });

  test('legacy boolean true still means "saved"', async () => {
    const saveMock = jest.fn().mockResolvedValue(true);
    const { result } = renderPersistence(saveMock);
    expect(await result.current.performSave()).toBe('saved');
  });

  test('failed write: status is "error" and the next save retries (no "nochange" mask)', async () => {
    const saveMock = jest.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce({ ok: true, storage: 'cloud', pendingCloudSync: false });
    const { result } = renderPersistence(saveMock);
    expect(await result.current.performSave()).toBe('error');
    // The fingerprint was not remembered, so the retry actually writes.
    expect(await result.current.performSave()).toBe('saved');
    expect(saveMock).toHaveBeenCalledTimes(2);
  });

  test('unchanged state after a successful save: "nochange"', async () => {
    const saveMock = jest.fn().mockResolvedValue({ ok: true, storage: 'cloud', pendingCloudSync: false });
    const { result } = renderPersistence(saveMock);
    expect(await result.current.performSave()).toBe('saved');
    expect(await result.current.performSave()).toBe('nochange');
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  test('no session id: "skipped"', async () => {
    const saveMock = jest.fn();
    const { result } = renderPersistence(saveMock, { sessionId: null });
    expect(await result.current.performSave()).toBe('skipped');
    expect(saveMock).not.toHaveBeenCalled();
  });

  test('rev-conflict fork (Phase 3): status is "forked" so the modal can be honest', async () => {
    const saveMock = jest.fn().mockResolvedValue({ ok: true, storage: 'cloud', pendingCloudSync: false, forked: true });
    const { result } = renderPersistence(saveMock);
    expect(await result.current.performSave()).toBe('forked');
  });
});

describe('reconcile trigger on savedLocal (Phase 2)', () => {
  const listen = () => {
    const listener = jest.fn();
    window.addEventListener(PENDING_LOCAL_SAVE_EVENT, listener);
    return { listener, stop: () => window.removeEventListener(PENDING_LOCAL_SAVE_EVENT, listener) };
  };

  test("'savedLocal' fires PENDING_LOCAL_SAVE_EVENT so the push is retried once auth returns", async () => {
    const { listener, stop } = listen();
    try {
      const saveMock = jest.fn().mockResolvedValue({ ok: true, storage: 'local', pendingCloudSync: true });
      const { result } = renderPersistence(saveMock);
      expect(await result.current.performSave()).toBe('savedLocal');
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      stop();
    }
  });

  test("a fork whose parked copy is still device-only fires the reconcile event too", async () => {
    const { listener, stop } = listen();
    try {
      const saveMock = jest.fn().mockResolvedValue({ ok: true, storage: 'local', pendingCloudSync: true, forked: true });
      const { result } = renderPersistence(saveMock);
      expect(await result.current.performSave()).toBe('forked');
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      stop();
    }
  });

  test("'saved' and 'nochange' never fire the reconcile event ('nochange' writes nothing at all)", async () => {
    const { listener, stop } = listen();
    try {
      const saveMock = jest.fn().mockResolvedValue({ ok: true, storage: 'cloud', pendingCloudSync: false });
      const { result } = renderPersistence(saveMock);
      expect(await result.current.performSave()).toBe('saved');
      // 'nochange' short-circuits before saveConversationToBackend, i.e. before
      // BOTH stores: exactly one write happened across the two calls.
      expect(await result.current.performSave()).toBe('nochange');
      expect(saveMock).toHaveBeenCalledTimes(1);
      expect(listener).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  });
});

// The always-present sync indicator is a pure surfacing of the performSave ack.
// These tests pin the mapping from each performSave outcome to the indicator state
// ('idle' | 'saving' | 'saved' | 'local' | 'error').
describe('deriveSaveIndicatorState', () => {
  test("'saved' (durable cloud write) -> 'saved'", () => {
    expect(deriveSaveIndicatorState('saved', 'idle')).toBe('saved');
    expect(deriveSaveIndicatorState('saved', 'local')).toBe('saved');
    expect(deriveSaveIndicatorState('saved', 'error')).toBe('saved');
  });

  test("'savedLocal' (account-holder fallback) -> 'local'", () => {
    expect(deriveSaveIndicatorState('savedLocal', 'idle')).toBe('local');
    expect(deriveSaveIndicatorState('savedLocal', 'saved')).toBe('local');
  });

  test("'forked' (rev conflict) -> 'error'", () => {
    expect(deriveSaveIndicatorState('forked', 'saved')).toBe('error');
  });

  test("'error' (local write-ahead failed) -> 'error'", () => {
    expect(deriveSaveIndicatorState('error', 'saved')).toBe('error');
  });

  test("'nochange' keeps a prior 'saved' state", () => {
    expect(deriveSaveIndicatorState('nochange', 'saved')).toBe('saved');
  });

  test("'nochange' keeps a prior 'local' state (does not upgrade to cloud)", () => {
    expect(deriveSaveIndicatorState('nochange', 'local')).toBe('local');
  });

  test("'nochange' from a fresh load implies a durable save on record -> 'saved'", () => {
    expect(deriveSaveIndicatorState('nochange', 'idle')).toBe('saved');
  });

  test("'nochange' never flips a prior 'error' into a red state", () => {
    // A matched fingerprint means a prior write succeeded, so 'saved' is honest.
    expect(deriveSaveIndicatorState('nochange', 'error')).toBe('saved');
  });

  test("'skipped' (nothing to save) preserves whatever was shown", () => {
    expect(deriveSaveIndicatorState('skipped', 'idle')).toBe('idle');
    expect(deriveSaveIndicatorState('skipped', 'saved')).toBe('saved');
    expect(deriveSaveIndicatorState('skipped', 'local')).toBe('local');
  });

  test('an unknown status preserves the prior state', () => {
    expect(deriveSaveIndicatorState('something-new', 'saved')).toBe('saved');
  });

  test('defaults prevState to idle when omitted', () => {
    expect(deriveSaveIndicatorState('skipped')).toBe('idle');
  });
});
