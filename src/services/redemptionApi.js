// redemptionApi.js
// Redeems a membership code against the CF Worker (POST /api/db/redeem-code,
// backlog #6 first slice), following the same authed fetch pattern as
// entitlementsApi. The Worker owns all the rules (normalization, expiry,
// max_uses, one-redemption-per-account, the daily attempt limit); this module
// only does the network hop and turns the Worker's error contract into a typed
// error the Profile page can map to friendly copy.
//
// Worker error contract:
//   400 { code: 'code_invalid' }       unknown/expired/disabled/exhausted (one
//                                      generic bucket on purpose: no brute-force oracle)
//   409 { code: 'already_redeemed' }   this account already used this code
//   429 { code: 'rate_limited' }       too many attempts today
//   503 { code: 'redeem_unavailable' } attempt counter unreachable (fails closed)
// Success: 200 { tier, expiresAt }.

import { supabase } from './supabaseClient';

const CF_WORKER_URL = process.env.REACT_APP_CF_WORKER_URL || '';

/** Error carrying the Worker's machine-readable `code` for UI mapping. */
export class RedemptionError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'RedemptionError';
    this.code = code;
  }
}

/**
 * Redeem a membership code for the signed-in account.
 * Guests (no auth client or no live session) fail fast with code 'not_signed_in'
 * and no network call: the endpoint requires auth, so there is nothing to ask.
 * @param {string} code - as typed by the user; the Worker normalizes it
 * @returns {Promise<{ tier: string, expiresAt: string }>}
 * @throws {RedemptionError} with .code from the contract above ('unknown' as fallback)
 */
export async function redeemCode(code) {
  if (!supabase) {
    throw new RedemptionError('Sign in to redeem a code', 'not_signed_in');
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new RedemptionError('Sign in to redeem a code', 'not_signed_in');
  }

  const response = await fetch(`${CF_WORKER_URL}/api/db/redeem-code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      // Non-JSON error body; the fallback code below still routes the UI.
    }
    throw new RedemptionError(
      (typeof payload?.error === 'string' && payload.error) || 'Failed to redeem code',
      payload?.code || (response.status === 429 ? 'rate_limited' : 'unknown')
    );
  }

  return response.json();
}
