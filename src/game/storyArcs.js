// storyArcs.js
// Arc derivation for the New Game "Ready-Made" picker (#73, phase 1 of
// docs/ARC_CARDS_AND_NARRATIVE_PLAN.md). The catalog is already arc-shaped:
// grouping the LIVE storyTemplates array by campaign genre (`theme`) yields one
// arc per theme, each a ladder of chapters (tier rungs). Deriving per render,
// exactly like templateSections.getTemplateSections, keeps the arcs honest
// against runtime registration: a server delivery that replaces a teaser stub
// or a comingSoon entry updates its ladder row in place, and a delivered
// template with a brand-new theme forms a new derived arc card automatically.
//
// Terminology guard (same as the plan doc): "chapter" is a campaign's tier rung
// (t1/t2/t3); "account tier" is the entitlement ladder (free/member/premium/
// elite). "Tier" alone is ambiguous across those two systems.
//
// Derive everything derivable; author only what derivation cannot produce.
// ARC_META below is the authored-only layer (per-theme name/tagline/art
// overrides); every entry is optional and phase 1 ships it empty, so every
// arc card renders purely from chapter-1 data until phase 2 writes the copy.

import { storyTemplates } from '../data/storyTemplates';
import { canUseTemplate, isTemplatePremium, TIER_LADDER } from './entitlements';
import { TIER_LEVEL_BANDS } from './templateSections';
import { retryPremiumTemplates } from '../services/premiumContentApi';

/**
 * Authored arc metadata, keyed by theme id. Entries and every field are
 * OPTIONAL; derivation falls back to chapter 1 (name from the shared
 * template.name, tagline from the entry chapter's one-line description, art
 * from /assets/templates/{entryId}.webp). Phase 2 of the plan fills taglines
 * (and phase 3 adds mythosLine); phase 1 deliberately authors nothing.
 * Shape: { [themeId]: { name?, tagline?, art? } }
 */
export const ARC_META = Object.freeze({});

/**
 * The account-tier rung that gates a single chapter: an explicit valid
 * `minTier` wins; otherwise the premium flag/biome maps to 'member' (the
 * default canUseTemplate gate) and everything else is 'free'. This mirrors
 * canUseTemplate's resolution order so the chip label and the actual gate can
 * never disagree.
 * @param {object} template
 * @returns {string} one of TIER_LADDER
 */
export const chapterGateTier = (template) => {
    if (template?.minTier && TIER_LADDER.includes(template.minTier)) return template.minTier;
    return isTemplatePremium(template) ? 'member' : 'free';
};

// One-line tease for a template: the authored `description` is exactly that;
// shop-window stubs carry only a top-level `shortDescription`.
const teaseOf = (template) =>
    template?.description || template?.shortDescription || '';

// Level band for a chapter, falling back to the canonical tier band so a
// template lacking levelRange still renders an honest "Lv X-Y".
const bandOf = (template) => {
    if (Array.isArray(template?.levelRange)) return template.levelRange;
    return TIER_LEVEL_BANDS[template?.tier || 1] || TIER_LEVEL_BANDS[1];
};

/**
 * Derive the arc cards from a template catalog.
 *
 * Grouping key: `template.theme`, falling back to the template's own id
 * (unknown/theme-less future deliveries form a single-chapter arc rather than
 * crashing or vanishing). Chapters sort by tier; gaps (desert has no t3) and
 * single-chapter arcs are fine. Recompute per render like getTemplateSections:
 * runtime registration (server deliveries, teaser stubs turning playable) must
 * flow in without a reload.
 *
 * @param {Array<object>} [templates] - defaults to the live storyTemplates array
 * @param {object} [meta] - ARC_META override (tests)
 * @returns {Array<object>} arcs: {
 *   id, name, icon, art, tagline, entryTemplate,
 *   chapters: [{ template, id, tier, subtitle, levelRange, description,
 *                gateTier, comingSoon, teaser, locked, startable }],
 *   chapterCount, levelSpan: [floor, ceiling], minTierToEnter, spansTiers,
 * }
 */
export const getStoryArcs = (templates = storyTemplates, meta = ARC_META) => {
    const byTheme = new Map();
    (templates || []).forEach((t) => {
        if (!t?.id) return;
        const key = t.theme || t.id; // unknown-theme fallback: a solo arc
        if (!byTheme.has(key)) byTheme.set(key, []);
        byTheme.get(key).push(t);
    });

    return [...byTheme.entries()].map(([themeId, arcTemplates]) => {
        const sorted = [...arcTemplates].sort((a, b) => (a.tier || 1) - (b.tier || 1));
        const entryTemplate = sorted[0];
        const authored = meta[themeId] || {};

        const chapters = sorted.map((template) => {
            const comingSoon = template.comingSoon === true;
            // A comingSoon entry is not a teaser even if flagged: nothing can heal it.
            const teaser = !comingSoon && template.teaser === true;
            const locked = !comingSoon && !canUseTemplate(template);
            return {
                template,
                id: template.id,
                tier: template.tier || 1,
                subtitle: template.subtitle || template.name || template.id,
                levelRange: bandOf(template),
                description: teaseOf(template),
                gateTier: chapterGateTier(template),
                comingSoon,
                teaser,
                locked,
                // Startable = the current user could apply it right now: not a
                // future stub, not an undelivered teaser, tier gate passed.
                startable: !comingSoon && !teaser && !locked,
            };
        });

        const floor = chapters[0].levelRange[0];
        const ceiling = Math.max(...chapters.map((c) => c.levelRange[1]));

        return {
            id: themeId,
            name: authored.name || entryTemplate.name || themeId,
            icon: entryTemplate.icon || '📜',
            art: authored.art || `/assets/templates/${entryTemplate.id}.webp`,
            tagline: authored.tagline || teaseOf(entryTemplate),
            entryTemplate,
            chapters,
            chapterCount: chapters.length,
            levelSpan: [floor, ceiling],
            minTierToEnter: chapterGateTier(entryTemplate),
            spansTiers: new Set(chapters.map((c) => c.gateTier)).size > 1,
        };
    });
};

/**
 * Group arcs by their ENTRY gate (chapter 1's account-tier requirement) for the
 * New Game sections: free arcs, Members' arcs, Premium arcs. Grouping is by the
 * arc's authored gate, NOT the current user's tier, so a member sees the same
 * three sections a guest does (with the locks open).
 * @param {Array<object>} [arcs] - defaults to deriving from the live catalog
 * @returns {{ free: Array, member: Array, premium: Array }}
 */
export const getArcSections = (arcs = getStoryArcs()) => ({
    free: arcs.filter((a) => a.minTierToEnter === 'free'),
    member: arcs.filter((a) => a.minTierToEnter === 'member'),
    premium: arcs.filter((a) => a.minTierToEnter === 'premium' || a.minTierToEnter === 'elite'),
});

// ── Teaser self-heal (maintainer ruling A, 2026-07-07) ───────────────────────
//
// A teaser stub is a card face whose playable content should have arrived with
// this session's delivery but has not (fresh sign-in race, transient fetch
// failure, mid-session entitlement change). Clicking it must never dead-end in
// "sign out and back in": trigger a fresh delivery attempt and re-evaluate.

/** Signed-out copy: delivery requires auth, so sign-in IS the fix. */
export const TEASER_SIGN_IN_COPY =
    'Sign in to play this chapter. It arrives with your account content when you sign in.';

/** Signed-in retry-failed copy: the delivery really has not landed. */
export const TEASER_RETRY_FAILED_COPY =
    'This chapter has not arrived with your account content yet. Sign out and back in (or refresh) and it will be playable.';

/**
 * Try to turn a clicked teaser-stub chapter into its delivered, playable
 * template. Signed-out users get the sign-in explanation without a network
 * call (the delivery endpoint requires auth; there is nothing to retry).
 * Signed-in users trigger a fresh delivery fetch (retryPremiumTemplates resets
 * the once-per-session memo), then the catalog is re-read:
 *   - delivered and playable -> { status: 'delivered', template } (caller applies it)
 *   - still a teaser (or now gated) -> { status: 'still-teaser', message }
 * Never throws: retry failures resolve like an empty delivery.
 *
 * @param {object} template - the clicked teaser-stub template
 * @param {object} opts
 * @param {boolean} opts.isSignedIn
 * @param {Function} [opts.retry] - injection point for tests
 * @param {Array<object>} [opts.templates] - catalog to re-read (tests)
 * @returns {Promise<{ status: string, template?: object, message?: string }>}
 */
export async function healTeaserChapter(
    template,
    { isSignedIn, retry = retryPremiumTemplates, templates = storyTemplates } = {}
) {
    if (!isSignedIn) {
        return { status: 'sign-in', message: TEASER_SIGN_IN_COPY };
    }
    try {
        await retry();
    } catch {
        // retryPremiumTemplates never rejects, but an injected retry might; a
        // failed retry is just "still not delivered".
    }
    const fresh = (templates || []).find((t) => t?.id === template?.id);
    if (fresh && fresh.teaser !== true && !fresh.comingSoon && canUseTemplate(fresh)) {
        return { status: 'delivered', template: fresh };
    }
    return { status: 'still-teaser', message: TEASER_RETRY_FAILED_COPY };
}
