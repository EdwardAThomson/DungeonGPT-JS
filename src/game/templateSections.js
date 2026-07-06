// templateSections.js
// Grouping for the New Game "Ready-Made" picker (#72). Extracted from NewGame.js
// so the section logic is testable and stays honest against the LIVE storyTemplates
// array (which grows at runtime when server-delivered premium campaigns register,
// see registerPremiumTemplates / premiumContentApi.js).
//
// Historically only tier-1 starters were listed, which made tier-2/3 campaigns
// INVISIBLE on New Game until a save completed a campaign and the continue-legend
// picker offered them (a premium subscriber could not even see that The Drowned
// Bells existed). Maintainer directive 2026-07-06: "we don't open up t2 quest
// cards on the game page, but we probably should. Then t3 as appropriate."
//
// Rules:
// - Tier 1 keeps the historical starter split: free starters + premium starters
//   (locked-card teaser for free users).
// - Tier 2 ("Seasoned Parties") and tier 3+ ("Legendary Campaigns") get their own
//   sections. comingSoon stubs are EXCLUDED there: those sections list only
//   playable campaigns, so the tier-3 section simply does not render until real
//   t3 content exists (local dev slot or server delivery).
// - Premium gating is per card (canUseTemplate), not per section: free and
//   premium templates mix inside the higher-tier sections and locked cards render
//   with the existing premium-locked treatment.

import { storyTemplates } from '../data/storyTemplates';
import { isTemplatePremium } from './entitlements';

/**
 * Split a template catalog into the New Game picker's sections.
 * @param {Array<object>} [templates] - defaults to the live storyTemplates array
 * @returns {{ freeStarters: Array, premiumStarters: Array, seasoned: Array, legendary: Array }}
 */
export const getTemplateSections = (templates = storyTemplates) => {
    const starters = templates.filter((t) => t.tier === 1);
    return {
        freeStarters: starters.filter((t) => !isTemplatePremium(t)),
        premiumStarters: starters.filter((t) => isTemplatePremium(t)),
        seasoned: templates.filter((t) => t.tier === 2 && !t.comingSoon),
        legendary: templates.filter((t) => (t.tier || 1) >= 3 && !t.comingSoon),
    };
};
