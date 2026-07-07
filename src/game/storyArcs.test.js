// Tests for the arc derivation behind the New Game Ready-Made tab (#73 phase 1,
// docs/ARC_CARDS_AND_NARRATIVE_PLAN.md): 7 arcs derived from the shipped
// catalog by theme, chapter order and level spans, delivered/teaser/comingSoon
// ladder-row states, entitlement grouping by ENTRY gate, unknown-theme
// fallback, and the teaser self-heal contract (maintainer ruling A).

import {
  getStoryArcs,
  getArcSections,
  chapterGateTier,
  healTeaserChapter,
  TEASER_SIGN_IN_COPY,
  TEASER_RETRY_FAILED_COPY,
} from './storyArcs';
import { storyTemplates, registerPremiumTemplates, _resetLocalSlotIdsForTests } from '../data/storyTemplates';
import { PREMIUM_DEV_OVERRIDE_KEY, _resetEntitlementsForTests, setUserTier } from './entitlements';

// entitlements -> entitlementsApi -> supabaseClient would construct a real client
// (auto-refresh timer) when .env credentials are present; keep this suite hermetic.
jest.mock('../services/supabaseClient', () => ({ supabase: null }));

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  _resetEntitlementsForTests();
  _resetLocalSlotIdsForTests();
});

const arcById = (arcs, id) => arcs.find((a) => a.id === id);

describe('getStoryArcs against the shipped catalog', () => {
  it('derives exactly the 7 arcs, in catalog order', () => {
    const arcs = getStoryArcs(storyTemplates);
    expect(arcs.map((a) => a.id)).toEqual([
      'heroic-fantasy',
      'desert-expedition',
      'frozen-frontier',
      'grimdark-survival',
      'arcane-renaissance',
      'eldritch-horror',
      'tidewater',
    ]);
  });

  it('sorts every arc\'s chapters by tier', () => {
    getStoryArcs(storyTemplates).forEach((arc) => {
      const tiers = arc.chapters.map((c) => c.tier);
      expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
    });
  });

  it('heroic fantasy is a 3-chapter ladder ending in the Shattered Throne stub', () => {
    const arc = arcById(getStoryArcs(storyTemplates), 'heroic-fantasy');
    expect(arc.chapters.map((c) => c.id)).toEqual([
      'heroic-fantasy-t1', 'heroic-fantasy-t2', 'heroic-fantasy-t3',
    ]);
    expect(arc.chapters.map((c) => c.subtitle)).toEqual([
      'The Goblin Threat', 'Crown of Sunfire', 'The Shattered Throne',
    ]);
    expect(arc.chapterCount).toBe(3);
  });

  it('derives the full level span (chapter-1 floor to finale ceiling)', () => {
    const arcs = getStoryArcs(storyTemplates);
    expect(arcById(arcs, 'heroic-fantasy').levelSpan).toEqual([1, 7]);
    expect(arcById(arcs, 'desert-expedition').levelSpan).toEqual([1, 5]); // no t3: gap tolerated
    expect(arcById(arcs, 'tidewater').levelSpan).toEqual([1, 6]); // t3 stub tops out at 6
  });

  it('derives name/icon/art/tagline from the entry chapter when no ARC_META entry exists', () => {
    const arc = arcById(getStoryArcs(storyTemplates), 'heroic-fantasy');
    expect(arc.name).toBe('Heroic Fantasy');
    expect(arc.icon).toBe('⚔️');
    expect(arc.art).toBe('/assets/templates/heroic-fantasy-t1.webp');
    expect(arc.tagline).toBe(storyTemplates.find((t) => t.id === 'heroic-fantasy-t1').description);
  });

  it('ARC_META overrides (name/tagline/art) win over derivation when present', () => {
    const meta = { 'heroic-fantasy': { name: 'Authored Name', tagline: 'One line to sell the ride.', art: '/assets/arcs/heroic.webp' } };
    const arc = arcById(getStoryArcs(storyTemplates, meta), 'heroic-fantasy');
    expect(arc.name).toBe('Authored Name');
    expect(arc.tagline).toBe('One line to sell the ride.');
    expect(arc.art).toBe('/assets/arcs/heroic.webp');
  });

  it('tidewater stubs carry the shortDescription tease (stubs have no description field)', () => {
    const arc = arcById(getStoryArcs(storyTemplates), 'tidewater');
    expect(arc.tagline).toMatch(/backward tide/i);
    arc.chapters.forEach((c) => expect(c.description).toBeTruthy());
  });
});

describe('ladder-row states per chapter (free/guest user)', () => {
  it('free-arc chapters are startable; the delivered-content stub is a teaser, not locked', () => {
    const arc = arcById(getStoryArcs(storyTemplates), 'heroic-fantasy');
    const [t1, t2, t3] = arc.chapters;
    expect(t1).toMatchObject({ startable: true, locked: false, teaser: false, comingSoon: false });
    expect(t2).toMatchObject({ startable: true, locked: false, teaser: false });
    // Ruling B (2026-07-07): heroic-fantasy-t3 is a FREE chapter delivered at
    // sign-in. For a guest it is a teaser (sign in to play), never a tier upsell.
    expect(t3).toMatchObject({ startable: false, locked: false, teaser: true, comingSoon: false, gateTier: 'free' });
  });

  it('comingSoon chapters render as comingSoon rows (decision 4: visible, greyed)', () => {
    const arc = arcById(getStoryArcs(storyTemplates), 'grimdark-survival');
    const t3 = arc.chapters.find((c) => c.id === 'grimdark-survival-t3');
    expect(t3).toMatchObject({ comingSoon: true, startable: false, teaser: false });
  });

  it('member-gated chapters are locked for a free user, tidewater is premium-locked', () => {
    const arcs = getStoryArcs(storyTemplates);
    arcById(arcs, 'eldritch-horror').chapters
      .filter((c) => !c.comingSoon)
      .forEach((c) => expect(c).toMatchObject({ locked: true, gateTier: 'member' }));
    // The teaser flag stays truthful (the stub's content is undelivered) but
    // locked wins in every consumer (chip precedence, click handling).
    arcById(arcs, 'tidewater').chapters
      .forEach((c) => expect(c).toMatchObject({ locked: true, teaser: true, startable: false, gateTier: 'premium' }));
  });

  it('member tier unlocks the member arcs (dev override lifts to member)', () => {
    localStorage.setItem(PREMIUM_DEV_OVERRIDE_KEY, 'true');
    const arc = arcById(getStoryArcs(storyTemplates), 'eldritch-horror');
    expect(arc.chapters.find((c) => c.id === 'eldritch-horror-t1')).toMatchObject({ locked: false, startable: true });
    // Tidewater needs 'premium'; member stays locked.
    expect(arcById(getStoryArcs(storyTemplates), 'tidewater').chapters[0].locked).toBe(true);
  });

  it('an entitled premium user sees tidewater as teasers until delivery lands, then startable', () => {
    setUserTier('premium');
    const catalog = storyTemplates.map((t) => ({ ...t }));
    let arc = arcById(getStoryArcs(catalog), 'tidewater');
    arc.chapters.forEach((c) => expect(c).toMatchObject({ locked: false, teaser: true, startable: false }));

    // Delivery replaces the stub by id; the ladder row updates in place.
    registerPremiumTemplates([{
      id: 'tidewater-t1', theme: 'tidewater', tier: 1, levelRange: [1, 2],
      name: 'Tidewater', subtitle: 'The Backward Tide', icon: '🔔',
      premium: true, minTier: 'premium',
      settings: { shortDescription: 'x', milestones: [{ id: 1, text: 'x' }] },
    }], catalog);
    arc = arcById(getStoryArcs(catalog), 'tidewater');
    expect(arc.chapters.find((c) => c.id === 'tidewater-t1')).toMatchObject({ teaser: false, startable: true });
    expect(arc.chapters.find((c) => c.id === 'tidewater-t2')).toMatchObject({ teaser: true });
  });
});

describe('unknown-theme fallback', () => {
  it('a theme-less delivered template forms its own single-chapter arc (keyed by id, derived card)', () => {
    const catalog = [...storyTemplates.map((t) => ({ ...t })), {
      id: 'mystery-oneshot', tier: 1, levelRange: [1, 2],
      name: 'The Mystery Oneshot', description: 'A strange new tale.',
      settings: { shortDescription: 'x', milestones: [] },
    }];
    const arc = arcById(getStoryArcs(catalog), 'mystery-oneshot');
    expect(arc).toBeDefined();
    expect(arc.chapterCount).toBe(1);
    expect(arc.name).toBe('The Mystery Oneshot');
    expect(arc.tagline).toBe('A strange new tale.');
    expect(arc.minTierToEnter).toBe('free');
    expect(arc.levelSpan).toEqual([1, 2]);
  });

  it('a chapter without levelRange falls back to the canonical tier band', () => {
    const catalog = [{ id: 'bandless-t2', theme: 'bandless', tier: 2, name: 'Bandless' }];
    const arc = arcById(getStoryArcs(catalog), 'bandless');
    expect(arc.chapters[0].levelRange).toEqual([3, 5]);
  });
});

describe('entitlement grouping (getArcSections, grouped by ENTRY gate)', () => {
  it('groups the shipped catalog free/member/premium exactly as the plan lays out', () => {
    const sections = getArcSections(getStoryArcs(storyTemplates));
    expect(sections.free.map((a) => a.id)).toEqual([
      'heroic-fantasy', 'grimdark-survival', 'arcane-renaissance',
    ]);
    expect(sections.member.map((a) => a.id)).toEqual([
      'desert-expedition', 'frozen-frontier', 'eldritch-horror',
    ]);
    expect(sections.premium.map((a) => a.id)).toEqual(['tidewater']);
  });

  it('grouping is by the arc\'s authored gate, not the current user\'s tier', () => {
    setUserTier('premium');
    const sections = getArcSections(getStoryArcs(storyTemplates));
    expect(sections.premium.map((a) => a.id)).toEqual(['tidewater']); // still its own section
    expect(sections.free).toHaveLength(3);
  });

  it('spansTiers flags an arc whose chapters disagree on gate', () => {
    const catalog = [
      { id: 'mixed-t1', theme: 'mixed', tier: 1, name: 'Mixed', settings: {} },
      { id: 'mixed-t2', theme: 'mixed', tier: 2, name: 'Mixed', minTier: 'member', settings: {} },
    ];
    const arc = arcById(getStoryArcs(catalog), 'mixed');
    expect(arc.spansTiers).toBe(true);
    expect(arc.minTierToEnter).toBe('free'); // entry gate stays the card badge
    // The shipped heroic arc is all-free after ruling B: no span.
    expect(arcById(getStoryArcs(storyTemplates), 'heroic-fantasy').spansTiers).toBe(false);
  });
});

describe('chapterGateTier', () => {
  it('explicit valid minTier wins; premium flag maps to member; plain templates are free', () => {
    expect(chapterGateTier({ minTier: 'premium', premium: true })).toBe('premium');
    expect(chapterGateTier({ minTier: 'free', premium: false })).toBe('free');
    expect(chapterGateTier({ premium: true })).toBe('member');
    expect(chapterGateTier({ settings: { theme: 'snow' } })).toBe('member'); // premium biome
    expect(chapterGateTier({})).toBe('free');
    expect(chapterGateTier({ minTier: 'typo-tier', premium: true })).toBe('member'); // invalid minTier falls through
  });
});

describe('healTeaserChapter (teaser self-heal, maintainer ruling A)', () => {
  const stub = { id: 'tidewater-t1', teaser: true, minTier: 'free' };

  it('signed out: explains sign-in without calling retry (delivery requires auth)', async () => {
    const retry = jest.fn();
    const result = await healTeaserChapter(stub, { isSignedIn: false, retry, templates: [stub] });
    expect(result).toEqual({ status: 'sign-in', message: TEASER_SIGN_IN_COPY });
    expect(retry).not.toHaveBeenCalled();
  });

  it('retry success: the delivered replacement comes back ready to apply/start', async () => {
    const catalog = [{ ...stub }];
    const delivered = {
      id: 'tidewater-t1', minTier: 'free',
      settings: { shortDescription: 'x', milestones: [{ id: 1 }] },
    };
    const retry = jest.fn(async () => { catalog[0] = delivered; }); // the refetch re-registers by id
    const result = await healTeaserChapter(stub, { isSignedIn: true, retry, templates: catalog });
    expect(retry).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('delivered');
    expect(result.template).toBe(delivered);
  });

  it('retry failure (still a teaser): THEN the explanation shows', async () => {
    const catalog = [{ ...stub }];
    const retry = jest.fn(async () => {}); // fetch resolved but delivered nothing
    const result = await healTeaserChapter(stub, { isSignedIn: true, retry, templates: catalog });
    expect(result).toEqual({ status: 'still-teaser', message: TEASER_RETRY_FAILED_COPY });
  });

  it('a rejecting retry is treated as still-not-delivered, never a throw', async () => {
    const retry = jest.fn(async () => { throw new Error('network'); });
    await expect(
      healTeaserChapter(stub, { isSignedIn: true, retry, templates: [{ ...stub }] })
    ).resolves.toMatchObject({ status: 'still-teaser' });
  });

  it('a delivery the user\'s tier cannot use still resolves to still-teaser (fail closed)', async () => {
    // e.g. mid-session lapse: the id is no longer a teaser but is now gated above.
    const catalog = [{ id: 'tidewater-t1', minTier: 'premium', settings: { milestones: [] } }];
    const result = await healTeaserChapter(stub, { isSignedIn: true, retry: async () => {}, templates: catalog });
    expect(result.status).toBe('still-teaser');
  });
});
