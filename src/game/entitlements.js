// Entitlements — the single source of truth for premium status.
//
// PLACEHOLDER NOTICE
// ------------------
// Real account-tier / auth wiring does not exist yet ("premium coming soon").
// `isPremium()` below is a stand-in: it returns `false` for everyone by default,
// but honours a dev override in localStorage so the maintainer can preview premium
// content while building it out. When the real entitlement lands (a `userTier`
// field carried on the authenticated user, per the monetization plan), replace the
// body of `isPremium()` with that check — every call site (`isThemePremium`,
// `isTemplatePremium`, the NewGame gates) will "just work" unchanged.
//
// This module is intentionally tiny and pure: no React, no side effects beyond a
// guarded localStorage read. Keep it that way so it stays trivially testable and
// importable from anywhere (UI, engine, tests).

// Dev override key. Set `localStorage.setItem('dungeongpt:premium', 'true')` in the
// browser console to unlock premium content locally; remove it (or set anything else)
// to return to the free-tier default.
export const PREMIUM_DEV_OVERRIDE_KEY = 'dungeongpt:premium';

/**
 * Whether the current user has premium entitlements.
 *
 * PLACEHOLDER: defaults to `false` (free tier). Honours a localStorage dev override
 * so premium content can be tested before real billing/auth-tier wiring exists.
 *
 * @returns {boolean}
 */
export function isPremium() {
    try {
        return localStorage.getItem(PREMIUM_DEV_OVERRIDE_KEY) === 'true';
    } catch {
        // localStorage can throw (SSR, privacy mode, disabled storage). Fail closed.
        return false;
    }
}

/**
 * World-biome theme ids that are a premium unlock. These are the `theme` values passed
 * to the map generator (`generateMapData(..., theme)`) and stamped onto saves, NOT the
 * campaign-genre ids in questPickerData's THEME_DEFAULTS. Free tier = temperate/grassland;
 * desert (sand) and snow world-gen + the quests set there are paid content.
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
 * @param {string} themeId
 * @returns {boolean}
 */
export function canUseTheme(themeId) {
    return !isThemePremium(themeId) || isPremium();
}

/**
 * Convenience: may the current user start this template?
 * @param {object} template
 * @returns {boolean}
 */
export function canUseTemplate(template) {
    return !isTemplatePremium(template) || isPremium();
}
