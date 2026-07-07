// Entitlements: the single source of truth for premium status.
//
// Backed by a real account tier since backlog #39: the CF Worker exposes
// GET /api/db/entitlements (account_tiers table, self-hosted data Postgres), and this
// module caches the resolved tier so every gate stays a plain synchronous call.
//
// TIER LADDER (business plan; launch scope is free + member, all four modelled now):
//   free < member < premium < elite
// The table stores ONLY the tier; the tier-to-benefit mapping lives HERE, next to each
// gate, so the storage can hoist to the Octonion hub later without touching benefits.
//
// Current gate map:
//   desert/snow world themes ......... member  (canUseTheme)
//   premium story templates .......... member  (canUseTemplate)
//   riverfork water towns ............ member  (canUseWaterTown, world integration later)
//   canal water towns ................ premium (canUseWaterTown, world integration later)
//
// How the tier gets here: AuthContext triggers getUserTier() on sign-in (and
// clearUserTier() on sign-out). The fetch happens once per page session and the result
// is cached in module state plus a localStorage mirror, so on the NEXT page load the
// gates are correct synchronously even before the refresh fetch resolves. Guests and
// fetch failures resolve to 'free' (fail closed). Client gating is UX only: server-side
// enforcement of premium content delivery is #40.

import { fetchEntitlements } from '../services/entitlementsApi';

// ── Tier ladder ───────────────────────────────────────────────────────────────

/** Ordered tier ladder, lowest first. Index = rank. */
export const TIER_LADDER = Object.freeze(['free', 'member', 'premium', 'elite']);

/** Rank of a tier on the ladder; unknown tiers rank as 'free' (0). */
function tierRank(tier) {
    const rank = TIER_LADDER.indexOf(tier);
    return rank >= 0 ? rank : 0;
}

/** Is `tier` a valid ladder value? */
function isValidTier(tier) {
    return TIER_LADDER.includes(tier);
}

// ── Tier state (module cache + localStorage mirror) ──────────────────────────

// localStorage mirror of the last SUCCESSFULLY fetched tier. Purely a UX warm-start:
// it makes gates correct on page load before the session's fetch resolves. It is
// never trusted upward beyond that (a fresh fetch always overwrites it), and it is
// cleared on sign-out.
export const TIER_MIRROR_KEY = 'dungeongpt:tier';

// Dev override key. Set `localStorage.setItem('dungeongpt:premium', 'true')` in the
// browser console to force member-or-above locally; remove it (or set anything else)
// to return to the real tier. Disabled in production builds (same pattern as the
// debug-routes flag in App.js), so a console line cannot unlock the live site.
export const PREMIUM_DEV_OVERRIDE_KEY = 'dungeongpt:premium';

const DEV_OVERRIDE_ENABLED =
    process.env.NODE_ENV !== 'production' ||
    process.env.REACT_APP_ENABLE_DEBUG_ROUTES === 'true';

let sessionTier = null;   // tier resolved THIS page session (null = not resolved yet)
let fetchPromise = null;  // in-flight/settled once-per-session fetch memo
// When the effective tier comes from a time-boxed grant (redemption codes, #6),
// the entitlements endpoint reports the grant's end date; null when the stored
// tier already covers it. Session-only (no mirror): it is display metadata for
// the Profile page, never a gate input.
let sessionTierExpiresAt = null;

function readMirror() {
    try {
        const value = localStorage.getItem(TIER_MIRROR_KEY);
        return isValidTier(value) ? value : null;
    } catch {
        // localStorage can throw (SSR, privacy mode, disabled storage). Fail closed.
        return null;
    }
}

function devOverrideActive() {
    if (!DEV_OVERRIDE_ENABLED) return false;
    try {
        return localStorage.getItem(PREMIUM_DEV_OVERRIDE_KEY) === 'true';
    } catch {
        return false;
    }
}

/**
 * The tier every synchronous gate sees, right now.
 * Resolution order: this session's fetched tier, else the localStorage mirror
 * (warm-start), else 'free'. The dev override then lifts the result to at least
 * 'member' (non-production only): it forces member-or-above, it does NOT grant
 * premium/elite, so finer hasTier gates stay testable per tier.
 * @returns {string} one of TIER_LADDER
 */
export function getCurrentTier() {
    const base = sessionTier ?? readMirror() ?? 'free';
    if (devOverrideActive() && tierRank(base) < tierRank('member')) return 'member';
    return base;
}

/**
 * Record a freshly resolved tier: module cache + localStorage mirror.
 * Invalid values collapse to 'free' (fail closed).
 * @param {string} tier
 */
export function setUserTier(tier) {
    sessionTier = isValidTier(tier) ? tier : 'free';
    try {
        localStorage.setItem(TIER_MIRROR_KEY, sessionTier);
    } catch {
        // Mirror is an optimisation; losing it only costs the next page load's warm start.
    }
}

/**
 * Sign-out (or account switch): back to 'free' and forget the mirror, so the next
 * account on this device never inherits a stale tier. Also resets the once-per-session
 * fetch memo so a later sign-in re-fetches.
 */
export function clearUserTier() {
    sessionTier = 'free';
    sessionTierExpiresAt = null;
    fetchPromise = null;
    try {
        localStorage.removeItem(TIER_MIRROR_KEY);
    } catch {
        // ignore
    }
}

/**
 * Resolve the account tier, fetching from the Worker at most once per page session
 * (call sites can safely spam this; only the first call after load or after
 * clearUserTier() hits the network). Guests and fetch failures resolve to 'free'.
 * On failure the mirror is left untouched: the CURRENT session fails closed to
 * 'free', but a transient blip does not wipe a member's warm start for next load.
 * @returns {Promise<string>} one of TIER_LADDER
 */
export async function getUserTier() {
    if (!fetchPromise) {
        fetchPromise = (async () => {
            try {
                const { tier, expiresAt } = await fetchEntitlements();
                setUserTier(tier);
                // expiresAt is additive on the endpoint (#6); older Workers simply
                // omit it and the display falls back to "no end date".
                sessionTierExpiresAt = typeof expiresAt === 'string' ? expiresAt : null;
            } catch {
                sessionTier = 'free';
                sessionTierExpiresAt = null;
            }
        })();
    }
    await fetchPromise;
    return getCurrentTier();
}

/**
 * Force a re-resolve of the account tier (drops the once-per-session memo and
 * fetches again). Used after a successful code redemption so gates unlock without
 * a re-login; the sign-in path keeps using getUserTier().
 * @returns {Promise<string>} one of TIER_LADDER
 */
export async function refreshUserTier() {
    fetchPromise = null;
    return getUserTier();
}

/**
 * End date (ISO string) of the grant backing the current tier, when the effective
 * tier comes from a time-boxed grant; null for stored tiers, guests and unresolved
 * sessions. Display metadata only: never use this in a gate.
 * @returns {string|null}
 */
export function getTierExpiresAt() {
    return sessionTierExpiresAt;
}

/** Test hook: reset all module state (cache, fetch memo). Not for app code. */
export function _resetEntitlementsForTests() {
    sessionTier = null;
    sessionTierExpiresAt = null;
    fetchPromise = null;
}

// ── Gates ─────────────────────────────────────────────────────────────────────

/**
 * Does the current user sit at or above `minTier` on the ladder?
 * Unknown `minTier` values fail closed (false): a typo in a gate must never
 * accidentally unlock content.
 * @param {string} minTier - one of TIER_LADDER
 * @returns {boolean}
 */
export function hasTier(minTier) {
    if (!isValidTier(minTier)) return false;
    return tierRank(getCurrentTier()) >= tierRank(minTier);
}

/**
 * Whether the current user has paid entitlements at all: member or above.
 * Kept as the coarse boolean every pre-tier call site already uses; reach for
 * hasTier() directly when a gate needs a specific rung (e.g. 'premium').
 * @returns {boolean}
 */
export function isPremium() {
    return hasTier('member');
}

/**
 * World-biome theme ids that are a paid unlock. These are the `theme` values passed
 * to the map generator (`generateMapData(..., theme)`) and stamped onto saves, NOT the
 * campaign-genre ids in questPickerData's THEME_DEFAULTS. Free tier = temperate/grassland;
 * desert (sand) and snow world-gen + the quests set there are a MEMBERS benefit
 * (gated at 'member' in canUseTheme/canUseTemplate).
 */
export const PREMIUM_THEMES = Object.freeze(['desert', 'snow']);

/**
 * Is a given world-biome theme id premium-gated?
 * @param {string} themeId - e.g. 'grassland' | 'desert' | 'snow'
 * @returns {boolean}
 */
export function isThemePremium(themeId) {
    return PREMIUM_THEMES.includes(themeId);
}

/**
 * Is a story template premium-gated? Premium either when explicitly flagged
 * (`template.premium === true`) or when its world biome theme is premium
 * (`template.settings.theme` in PREMIUM_THEMES). Deriving from the theme keeps the
 * template gate consistent with the theme gate automatically.
 * @param {object} template
 * @returns {boolean}
 */
export function isTemplatePremium(template) {
    if (!template) return false;
    if (template.premium === true) return true;
    return isThemePremium(template?.settings?.theme);
}

/**
 * Convenience: may the current user use this world-biome theme?
 * Gate tier: 'member' (desert/snow are a Members benefit per the business plan).
 * @param {string} themeId
 * @returns {boolean}
 */
export function canUseTheme(themeId) {
    return !isThemePremium(themeId) || hasTier('member');
}

/**
 * Convenience: may the current user start this template?
 * Default gate tier: 'member' (premium templates ship with Membership).
 * A template may carry an explicit minTier ('member' | 'premium' | 'elite')
 * to gate higher: the server-delivered flagship campaigns need this (#70;
 * e.g. The Drowned Bells is premium-only because the canal city it is set
 * in only exists in premium worlds). minTier wins over the boolean flag.
 * @param {object} template
 * @returns {boolean}
 */
export function canUseTemplate(template) {
    if (template && template.minTier) return hasTier(template.minTier);
    return !isTemplatePremium(template) || hasTier('member');
}

/**
 * Water-town archetypes and the minimum tier that unlocks each
 * (docs/WATER_TOWNS_PLAN.md section 6: river city ships to Members as the tease,
 * canal city is the Premium flagship). Values are TIER_LADDER rungs. The archetypes
 * exist in the town generator today; world-gen integration (NewGame stamping
 * `waterTown` through this gate) is a later Water Towns phase, so the gate simply
 * stands ready. Absent archetypes (plain towns) are free.
 */
export const WATER_TOWN_ARCHETYPES = Object.freeze({
    riverfork: 'member',
    canal: 'premium',
});

/**
 * Convenience: may the current user get this water-town archetype in a new world?
 * Gate tier: per WATER_TOWN_ARCHETYPES ('member' for riverfork, 'premium' for canal);
 * unknown/absent archetypes are ungated. Saves carry the stamp, so like premium
 * themes this is only checked at world creation (lapsed subscribers keep old worlds).
 * @param {string} archetype - 'riverfork' | 'canal' | undefined
 * @returns {boolean}
 */
export function canUseWaterTown(archetype) {
    const minTier = WATER_TOWN_ARCHETYPES[archetype];
    return !minTier || hasTier(minTier);
}
