// premiumContentApi.js
// Server-delivered premium story templates (backlog #40), following the same authed
// fetch pattern as entitlementsApi. The Worker's GET /api/db/premium-templates is the
// enforcement point: it returns only the templates the calling account's tier covers
// (free/no-row accounts get an empty list), so premium content never ships in the
// public bundle and never reaches an unentitled client.
//
// Lifecycle: AuthContext calls loadPremiumTemplates() once per session after sign-in
// (memoised like entitlements' getUserTier). Delivered templates are registered into
// the live picker array (storyTemplates.registerPremiumTemplates: idempotent by id,
// local dev slot wins) and cached in sessionStorage, NOT localStorage: the cache is a
// same-session warm start only, and it dies with the session so a lapsed account
// never keeps premium content across sessions. Guests and fetch failures resolve to
// an empty delivery (built-ins plus the local dev slot only), quietly: an empty
// premium catalog is the normal state, not an error.

import { supabase } from './supabaseClient';
import { getErrorMessage } from './apiClient';
import { registerPremiumTemplates } from '../data/storyTemplates';

const CF_WORKER_URL = process.env.REACT_APP_CF_WORKER_URL || '';

// sessionStorage key for the last successful delivery (this session only).
export const PREMIUM_TEMPLATES_CACHE_KEY = 'dungeongpt:premiumTemplates';

let loadPromise = null; // in-flight/settled once-per-session load memo

function readCache() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(PREMIUM_TEMPLATES_CACHE_KEY));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    // sessionStorage can throw (SSR, privacy mode); a broken cache is just no cache.
    return null;
  }
}

function writeCache(templates) {
  try {
    sessionStorage.setItem(PREMIUM_TEMPLATES_CACHE_KEY, JSON.stringify(templates));
  } catch {
    // Cache is an optimisation; losing it only costs the next same-session reload.
  }
}

function removeCache() {
  try {
    sessionStorage.removeItem(PREMIUM_TEMPLATES_CACHE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Network hop only: fetch this account's premium templates from the Worker.
 * Guests (no auth client or no live session) resolve to an empty delivery without a
 * network call: the endpoint requires auth, so there is nothing to ask. Network or
 * server failures throw; loadPremiumTemplates() fails closed to built-ins.
 * @returns {Promise<{ templates: Array<object> }>}
 */
export async function fetchPremiumTemplates() {
  if (!supabase) return { templates: [] };

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { templates: [] };

  const response = await fetch(`${CF_WORKER_URL}/api/db/premium-templates`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Failed to fetch premium templates'));
  }
  return response.json();
}

/**
 * Resolve and register this session's premium delivery, at most one fetch per page
 * session (call sites can safely spam this). Order of operations:
 *   1. Hydrate: a same-session sessionStorage cache registers immediately, so the
 *      picker is complete before the network answers (auth-callback reloads).
 *   2. Fetch: a successful delivery registers and overwrites the cache (an entitled
 *      account that lapsed to an empty delivery mid-session keeps only what is
 *      already registered; next session starts clean).
 *   3. Failure: keep whatever step 1 hydrated, register nothing new, stay quiet.
 * Never rejects.
 * @returns {Promise<Array<object>>} the delivered templates (empty on guest/failure)
 */
export function loadPremiumTemplates() {
  if (!loadPromise) {
    loadPromise = (async () => {
      const cached = readCache();
      if (cached && cached.length > 0) registerPremiumTemplates(cached);
      try {
        const { templates } = await fetchPremiumTemplates();
        const delivered = Array.isArray(templates) ? templates : [];
        registerPremiumTemplates(delivered);
        writeCache(delivered);
        return delivered;
      } catch {
        // Fail closed and graceful: built-ins (plus any same-session hydration) only.
        return cached || [];
      }
    })();
  }
  return loadPromise;
}

/**
 * Teaser self-heal (maintainer ruling 2026-07-07): a fresh delivery attempt on
 * demand. Resets ONLY the once-per-session memo (the sessionStorage cache stays:
 * it is this session's last good delivery and the fetch overwrites it on
 * success), then runs the normal load pipeline again: refetch, re-register,
 * re-cache. Used when a player clicks a teaser-stub chapter that should have
 * been delivered (entitled tier, content missing this session), so the click
 * can resolve itself instead of dead-ending in "sign out and back in".
 * Never rejects, like loadPremiumTemplates.
 * @returns {Promise<Array<object>>} the freshly delivered templates
 */
export function retryPremiumTemplates() {
  loadPromise = null;
  return loadPremiumTemplates();
}

/**
 * Sign-out (or account switch): drop the sessionStorage cache and the once-per-session
 * memo, so the next account on this device fetches its own delivery and never warm
 * starts from a previous account's content. Already-registered templates stay in the
 * array for the rest of the page session; the tier gates (canUseTemplate) lock them.
 */
export function clearPremiumTemplates() {
  loadPromise = null;
  removeCache();
}

/** Test hook: reset module state (load memo). Not for app code. */
export function _resetPremiumContentForTests() {
  loadPromise = null;
}
