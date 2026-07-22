// entitlementsApi.js
// Fetches the caller's entitlements snapshot from the CF Worker
// (GET /api/entitlements), following the same authed fetch pattern as
// conversationsApi. Since hub payments Phase 1 the Worker merges two sources
// behind that route: the Octonion hub's billing tier (GET /api/me/entitlements
// at octonion.io, 60 s worker-side cache, fail-closed) and the game's own
// account_tiers/tier_grants rows (manual grants + redemption codes), reporting
// the higher rung. The endpoint only exists on the Worker: the local Express
// dev server has no equivalent, so local dev relies on the entitlements dev
// override instead.
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
 * @returns {Promise<{ tier: string, updatedAt: string|null, expiresAt?: string|null, hub?: object, usage?: object|null }>}
 *   `tier` is the effective game-ladder tier; `hub` is the raw hub billing
 *   snapshot ({ tier, status, lifetime, currentPeriodEnd, perks, credits }),
 *   display metadata only. `usage` (additive, #6 visibility slice) is the
 *   premium allowance meter for member+ accounts ({ premiumDaily: { used,
 *   limit }, premiumMonthly: { used, limit } }); null for free tier or when
 *   the Worker could not read the counters.
 */
export async function fetchEntitlements() {
  if (!supabase) return { tier: 'free', updatedAt: null };

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { tier: 'free', updatedAt: null };

  const response = await fetch(`${CF_WORKER_URL}/api/entitlements`, {
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
