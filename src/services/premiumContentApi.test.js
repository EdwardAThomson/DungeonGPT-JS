// Tests for the server-delivered premium content channel's CLIENT side (#40):
// once-per-session load, sessionStorage (not localStorage) caching, fail-closed
// guest/failure behaviour, and lapsed-account session isolation. The registration
// semantics themselves (replace/append/local-slot precedence) are covered in
// src/data/premiumTemplates.test.js; here registerPremiumTemplates is mocked so the
// tests observe exactly what the loader hands it.

import {
  fetchPremiumTemplates,
  loadPremiumTemplates,
  retryPremiumTemplates,
  clearPremiumTemplates,
  _resetPremiumContentForTests,
  PREMIUM_TEMPLATES_CACHE_KEY,
} from './premiumContentApi';
import { supabase } from './supabaseClient';
import { registerPremiumTemplates } from '../data/storyTemplates';

jest.mock('./supabaseClient', () => ({
  supabase: { auth: { getSession: jest.fn() } },
}));

jest.mock('./apiClient', () => ({
  getErrorMessage: jest.fn(async (_response, fallback) => fallback),
}));

jest.mock('../data/storyTemplates', () => ({
  registerPremiumTemplates: jest.fn(),
}));

const getSession = supabase.auth.getSession;

const sessionPresent = () =>
  getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
const sessionAbsent = () =>
  getSession.mockResolvedValue({ data: { session: null } });

const TPL = { id: 'heroic-fantasy-t3', tier: 3, premium: true, comingSoon: false };

const fetchDelivers = (templates) =>
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ templates }) });
const fetchFails = () =>
  global.fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });

describe('premiumContentApi', () => {
  beforeEach(() => {
    _resetPremiumContentForTests();
    getSession.mockReset();
    registerPremiumTemplates.mockReset();
    global.fetch = jest.fn();
    sessionStorage.clear();
    localStorage.clear();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
    delete global.fetch;
  });

  describe('fetchPremiumTemplates (network hop)', () => {
    it('guests resolve to an empty delivery WITHOUT a network call', async () => {
      sessionAbsent();
      await expect(fetchPremiumTemplates()).resolves.toEqual({ templates: [] });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('sends the session bearer token to the worker endpoint', async () => {
      sessionPresent();
      fetchDelivers([TPL]);
      await fetchPremiumTemplates();
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/db/premium-templates'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
        })
      );
    });

    it('throws on a non-ok response (the loader fails closed, this hop stays honest)', async () => {
      sessionPresent();
      fetchFails();
      await expect(fetchPremiumTemplates()).rejects.toThrow();
    });
  });

  describe('loadPremiumTemplates', () => {
    it('registers the delivery and caches it in sessionStorage on success', async () => {
      sessionPresent();
      fetchDelivers([TPL]);
      await expect(loadPremiumTemplates()).resolves.toEqual([TPL]);
      expect(registerPremiumTemplates).toHaveBeenCalledWith([TPL]);
      expect(JSON.parse(sessionStorage.getItem(PREMIUM_TEMPLATES_CACHE_KEY))).toEqual([TPL]);
    });

    it('caches in sessionStorage, NEVER localStorage (content must not outlive the session)', async () => {
      sessionPresent();
      fetchDelivers([TPL]);
      await loadPremiumTemplates();
      expect(sessionStorage.getItem(PREMIUM_TEMPLATES_CACHE_KEY)).not.toBeNull();
      expect(localStorage.getItem(PREMIUM_TEMPLATES_CACHE_KEY)).toBeNull();
      expect(localStorage.length).toBe(0);
    });

    it('fetches at most once per session (memoised promise)', async () => {
      sessionPresent();
      fetchDelivers([TPL]);
      const first = loadPremiumTemplates();
      const second = loadPremiumTemplates();
      expect(second).toBe(first);
      await first;
      await loadPremiumTemplates();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('guest = built-ins only: empty delivery, nothing premium registered', async () => {
      sessionAbsent();
      await expect(loadPremiumTemplates()).resolves.toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
      // The loader may register the empty list; it must never register content.
      registerPremiumTemplates.mock.calls.forEach(([delivered]) => {
        expect(delivered).toEqual([]);
      });
    });

    it('fetch failure = built-ins only, resolves quietly (no throw, no console spam)', async () => {
      sessionPresent();
      fetchFails();
      await expect(loadPremiumTemplates()).resolves.toEqual([]);
      expect(registerPremiumTemplates).not.toHaveBeenCalled();
      expect(sessionStorage.getItem(PREMIUM_TEMPLATES_CACHE_KEY)).toBeNull();
      expect(console.error).not.toHaveBeenCalled();
    });

    it('hydrates from the same-session sessionStorage cache before the fetch resolves', async () => {
      sessionStorage.setItem(PREMIUM_TEMPLATES_CACHE_KEY, JSON.stringify([TPL]));
      sessionPresent();
      // Hold the fetch open: hydration must not wait for it.
      let releaseFetch;
      global.fetch.mockReturnValue(new Promise((resolve) => { releaseFetch = resolve; }));
      const load = loadPremiumTemplates();
      expect(registerPremiumTemplates).toHaveBeenCalledWith([TPL]);
      // Release the fetch so the load settles cleanly.
      releaseFetch({ ok: true, json: async () => ({ templates: [TPL] }) });
      await expect(load).resolves.toEqual([TPL]);
    });

    it('on fetch failure the same-session hydration survives (it was delivered this session)', async () => {
      sessionStorage.setItem(PREMIUM_TEMPLATES_CACHE_KEY, JSON.stringify([TPL]));
      sessionPresent();
      fetchFails();
      await expect(loadPremiumTemplates()).resolves.toEqual([TPL]);
      expect(registerPremiumTemplates).toHaveBeenCalledTimes(1);
      expect(registerPremiumTemplates).toHaveBeenCalledWith([TPL]);
    });

    it('a broken cache is treated as no cache', async () => {
      sessionStorage.setItem(PREMIUM_TEMPLATES_CACHE_KEY, 'not json {');
      sessionPresent();
      fetchDelivers([]);
      await expect(loadPremiumTemplates()).resolves.toEqual([]);
    });

    it('tolerates a malformed worker response (non-array templates)', async () => {
      sessionPresent();
      global.fetch.mockResolvedValue({ ok: true, json: async () => ({ templates: 'nope' }) });
      await expect(loadPremiumTemplates()).resolves.toEqual([]);
      expect(registerPremiumTemplates).toHaveBeenCalledWith([]);
    });
  });

  describe('lapsed-account session isolation', () => {
    it('a lapsed account NEXT session gets an empty delivery and the cache is overwritten', async () => {
      // Session 1: entitled, delivery cached.
      sessionPresent();
      fetchDelivers([TPL]);
      await loadPremiumTemplates();
      expect(JSON.parse(sessionStorage.getItem(PREMIUM_TEMPLATES_CACHE_KEY))).toEqual([TPL]);

      // "Next session": sessionStorage dies with the browser session, module state resets.
      sessionStorage.clear();
      _resetPremiumContentForTests();
      registerPremiumTemplates.mockReset();
      global.fetch.mockReset();

      // Session 2: the account lapsed, the worker now delivers nothing.
      fetchDelivers([]);
      await expect(loadPremiumTemplates()).resolves.toEqual([]);
      // No stale premium content re-registered from any cache.
      registerPremiumTemplates.mock.calls.forEach(([delivered]) => {
        expect(delivered).toEqual([]);
      });
      expect(JSON.parse(sessionStorage.getItem(PREMIUM_TEMPLATES_CACHE_KEY))).toEqual([]);
    });

    it('a lapse observed MID-session overwrites the cache with the empty delivery', async () => {
      // A cache from earlier this session exists, but the worker now says empty
      // (tier revoked). The cache must not survive to warm-start anything again.
      sessionStorage.setItem(PREMIUM_TEMPLATES_CACHE_KEY, JSON.stringify([TPL]));
      sessionPresent();
      fetchDelivers([]);
      await expect(loadPremiumTemplates()).resolves.toEqual([]);
      expect(JSON.parse(sessionStorage.getItem(PREMIUM_TEMPLATES_CACHE_KEY))).toEqual([]);
    });
  });

  describe('retryPremiumTemplates (teaser self-heal, maintainer ruling 2026-07-07)', () => {
    it('resets the once-per-session memo: a second fetch really happens', async () => {
      sessionPresent();
      fetchDelivers([]); // first load: nothing delivered (the teaser dead-end state)
      await loadPremiumTemplates();
      expect(global.fetch).toHaveBeenCalledTimes(1);

      fetchDelivers([TPL]); // the row landed server-side in the meantime
      await expect(retryPremiumTemplates()).resolves.toEqual([TPL]);
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(registerPremiumTemplates).toHaveBeenLastCalledWith([TPL]);
      expect(JSON.parse(sessionStorage.getItem(PREMIUM_TEMPLATES_CACHE_KEY))).toEqual([TPL]);
    });

    it('keeps the same-session cache (last good delivery) rather than clearing like sign-out', async () => {
      sessionPresent();
      fetchDelivers([TPL]);
      await loadPremiumTemplates();

      fetchFails(); // the retry itself fails
      await expect(retryPremiumTemplates()).resolves.toEqual([TPL]); // hydrated from cache
      expect(JSON.parse(sessionStorage.getItem(PREMIUM_TEMPLATES_CACHE_KEY))).toEqual([TPL]);
    });

    it('never rejects, even when the retry fetch fails with no cache', async () => {
      sessionPresent();
      fetchFails();
      await loadPremiumTemplates();
      await expect(retryPremiumTemplates()).resolves.toEqual([]);
      expect(console.error).not.toHaveBeenCalled();
    });

    it('re-memoises: calls after a retry reuse the retried load until the next reset', async () => {
      sessionPresent();
      fetchDelivers([TPL]);
      await retryPremiumTemplates();
      const fetches = global.fetch.mock.calls.length;
      await loadPremiumTemplates();
      await loadPremiumTemplates();
      expect(global.fetch.mock.calls.length).toBe(fetches);
    });
  });

  describe('clearPremiumTemplates (sign-out)', () => {
    it('drops the cache and the once-per-session memo', async () => {
      sessionPresent();
      fetchDelivers([TPL]);
      await loadPremiumTemplates();
      expect(sessionStorage.getItem(PREMIUM_TEMPLATES_CACHE_KEY)).not.toBeNull();

      clearPremiumTemplates();
      expect(sessionStorage.getItem(PREMIUM_TEMPLATES_CACHE_KEY)).toBeNull();

      // Next sign-in fetches fresh (memo was reset).
      fetchDelivers([]);
      await loadPremiumTemplates();
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
