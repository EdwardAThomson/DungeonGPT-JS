// entitlementsApi.js
// Fetches the caller's account tier from the CF Worker (GET /api/db/entitlements),
// following the same authed cfFetch pattern as conversationsApi. The endpoint is
// backed by the account_tiers table (cf-worker/migrations/002_account_tiers.sql)
// and only exists on the Worker: the local Express dev server has no equivalent,
// so local dev relies on the entitlements dev override instead.
//
// This module only does the network hop. Caching, the tier ladder, and every gate
// live in src/game/entitlements.js (the single source of truth for premium status).

import { supabase } from './supabaseClient';
import { getErrorMessage } from './apiClient';

const CF_WORKER_URL = process.env.REACT_APP_CF_WORKER_URL || '';

/**
 * Fetch the current account's entitlements from the Worker.
 *
 * Guests (no auth client or no live session) resolve to `{ tier: 'free' }` without
 * a network call: the endpoint requires auth, so there is nothing to ask. Network
 * or server failures throw; the caller (entitlements.js) fails closed to 'free'.
 *
 * @returns {Promise<{ tier: string, updatedAt: string|null }>}
 */
export async function fetchEntitlements() {
  if (!supabase) return { tier: 'free', updatedAt: null };

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { tier: 'free', updatedAt: null };

  const response = await fetch(`${CF_WORKER_URL}/api/db/entitlements`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Failed to fetch entitlements'));
  }
  return response.json();
}
