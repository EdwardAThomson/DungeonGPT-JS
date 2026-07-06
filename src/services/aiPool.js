// AI pool selection (backlog #7): which generation pool cf-workers requests ask for.
//
// Two pools exist on the Worker: 'free' (Cloudflare open-weights, included for
// everyone) and 'premium' (the Members OpenRouter pool, tier member+ with a daily
// allowance). The preference is chosen in the AI settings chip row
// (src/components/Modals.js AiEngineSettings) and read at request time by
// llmService.generateText, following the entitlements.js pattern: module state plus
// a localStorage mirror, so every call site stays a plain synchronous read.
//
// Two layers on purpose:
//   getPreferredPool()  what the user picked (persisted; survives tier changes)
//   getRequestPool()    what we actually SEND: 'premium' only while the account is
//                       member+ (hasTier), so guests/free/lapsed accounts never
//                       fire doomed premium requests. Client gating is UX only;
//                       the Worker enforces tier + allowance server-side.
//
// The module also carries the last pool OUTCOME (which pool actually served the
// last response, and why it fell back if it did), so the settings UI can surface
// a quiet "premium allowance used, responses fall back to Free" notice without
// interrupting play.

import { hasTier } from '../game/entitlements';

/** Valid pool ids. Anything else collapses to 'free'. */
export const AI_POOLS = Object.freeze(['free', 'premium']);

/** localStorage key for the persisted pool preference. */
export const AI_POOL_KEY = 'dungeongpt:aiPool';

let preferredPool = null; // lazily hydrated from localStorage
let lastOutcome = null;   // { requestedPool, usedPool, reason } | null
const listeners = new Set();

function notify() {
    listeners.forEach((listener) => {
        try {
            listener();
        } catch {
            // A broken listener must never take the pool machinery down.
        }
    });
}

function normalizePool(pool) {
    return AI_POOLS.includes(pool) ? pool : 'free';
}

/**
 * The user's persisted pool preference ('free' | 'premium'). Defaults to 'free';
 * storage failures also resolve to 'free'.
 * @returns {string}
 */
export function getPreferredPool() {
    if (preferredPool !== null) return preferredPool;
    try {
        preferredPool = normalizePool(localStorage.getItem(AI_POOL_KEY));
    } catch {
        preferredPool = 'free';
    }
    return preferredPool;
}

/**
 * Persist a new pool preference. Invalid values collapse to 'free'.
 * @param {string} pool
 */
export function setPreferredPool(pool) {
    preferredPool = normalizePool(pool);
    try {
        localStorage.setItem(AI_POOL_KEY, preferredPool);
    } catch {
        // Mirror is an optimisation; losing it only costs the next page load.
    }
    notify();
}

/**
 * The pool to actually send on a cf-workers request, right now: the preference
 * gated by entitlement. A 'premium' preference without member+ standing sends
 * 'free' (the preference itself is kept, so regaining the tier re-arms it).
 * @returns {string} 'free' | 'premium'
 */
export function getRequestPool() {
    return getPreferredPool() === 'premium' && hasTier('member') ? 'premium' : 'free';
}

/**
 * Record what actually happened to the last cf-workers generation, for the UI.
 * @param {{ requestedPool: string, usedPool: string, reason: (string|null) }} outcome
 *   reason: null (served as requested) | 'premium_cap' (daily allowance used)
 *         | 'premium_required' (tier refused server-side) | 'premium_error'
 *         (OpenRouter trouble, Worker fell back to free)
 */
export function recordPoolOutcome(outcome) {
    lastOutcome = outcome;
    notify();
}

/** @returns {{ requestedPool: string, usedPool: string, reason: (string|null) }|null} */
export function getLastPoolOutcome() {
    return lastOutcome;
}

/**
 * Subscribe to preference/outcome changes (settings UI). Returns an unsubscribe fn.
 * @param {Function} listener
 * @returns {Function}
 */
export function subscribeAiPool(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** Test hook: reset all module state. Not for app code. */
export function _resetAiPoolForTests() {
    preferredPool = null;
    lastOutcome = null;
    listeners.clear();
}
