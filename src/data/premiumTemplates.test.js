// Tests for the premium-template MERGE MECHANISMS only (storyTemplates.js).
// The premium CONTENT itself lives in the private content repo and is never seen
// by Jest: require.context does not exist under Jest, so the local-slot merge is
// skipped and every suite (structural tests, progression lint) runs against public
// data only. These tests exercise mergeLocalTemplates (bundle-time local slot) and
// registerPremiumTemplates (runtime server delivery, #40) with mocked shapes.

import {
  storyTemplates,
  mergeLocalTemplates,
  registerPremiumTemplates,
  _resetLocalSlotIdsForTests,
} from './storyTemplates';
import { premiumTemplates as exampleTemplates } from './premiumTemplates.local.example';
import { isTemplatePremium } from '../game/entitlements';

// entitlements -> entitlementsApi -> supabaseClient would construct a real client
// (auto-refresh timer) when .env credentials are present; keep this suite hermetic.
jest.mock('../services/supabaseClient', () => ({ supabase: null }));

describe('premium local-template merge mechanism', () => {
  const makeBase = () => [
    { id: 'public-t1', tier: 1, name: 'Public Adventure' },
    { id: 'stub-t3', tier: 3, name: 'Stub', comingSoon: true }
  ];

  it('an entry with a matching id REPLACES the public stub (comingSoon card turns playable)', () => {
    const base = makeBase();
    const local = { id: 'stub-t3', tier: 3, name: 'Full Campaign', premium: true, comingSoon: false, settings: { milestones: [{ id: 1 }] } };
    mergeLocalTemplates(base, [local]);
    expect(base).toHaveLength(2);
    expect(base[1]).toBe(local);
    expect(base[1].comingSoon).toBe(false);
    expect(base[1].settings.milestones).toHaveLength(1);
  });

  it('an entry with a new id is APPENDED', () => {
    const base = makeBase();
    mergeLocalTemplates(base, [{ id: 'brand-new-t3', tier: 3 }]);
    expect(base).toHaveLength(3);
    expect(base[2].id).toBe('brand-new-t3');
  });

  it('mutates the given array in place and returns it (consumers keep one shared reference)', () => {
    const base = makeBase();
    expect(mergeLocalTemplates(base, [{ id: 'x' }])).toBe(base);
  });

  it('tolerates a missing/empty/malformed local export', () => {
    const base = makeBase();
    mergeLocalTemplates(base, undefined);
    mergeLocalTemplates(base, []);
    mergeLocalTemplates(base, [null, {}, { name: 'no id' }]);
    expect(base).toEqual(makeBase());
  });

  it('under Jest the merge never runs: storyTemplates is public data, stubs carry no settings', () => {
    // require.context is a webpack-only API; its absence here is exactly what keeps
    // the progression lint and structural tests pinned to PUBLIC content.
    expect(typeof require.context).not.toBe('function');
    const t3 = storyTemplates.find((t) => t.id === 'tidewater-t3');
    expect(t3).toBeDefined();
    expect(t3.settings).toBeUndefined(); // playable content never ships in the bundle
    expect(t3.teaser).toBe(true);
  });

  // Maintainer ruling 2026-07-07: a shop-window stub REPLACES a comingSoon
  // built-in with the same id (the built-in's face is strictly less
  // information, and letting it win hid The Shattered Throne from guests).
  // The other comingSoon built-ins, with no stub claiming their id, survive.
  describe('shop-window stubs vs comingSoon built-ins (bundle-time precedence)', () => {
    it('heroic-fantasy-t3 was removed entirely (arc caps at t2, no comingSoon/stub)', () => {
      // 2026-07-20 maintainer decision against a Heroic Fantasy tier 3.
      expect(storyTemplates.find((t) => t.id === 'heroic-fantasy-t3')).toBeUndefined();
    });

    it('no id is duplicated by the stub merge', () => {
      const ids = storyTemplates.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('comingSoon built-ins without a stub keep their comingSoon face', () => {
      ['grimdark-survival-t3', 'arcane-renaissance-t3', 'eldritch-horror-t3'].forEach((id) => {
        expect(storyTemplates.find((t) => t.id === id).comingSoon).toBe(true);
      });
    });

    it('tidewater stubs (no comingSoon built-in) were appended as before', () => {
      ['tidewater-t1', 'tidewater-t2', 'tidewater-t3'].forEach((id) => {
        const stub = storyTemplates.find((t) => t.id === id);
        expect(stub).toMatchObject({ teaser: true, minTier: 'premium' });
      });
    });
  });

  it('the tracked example file exports the documented shape (an empty array by default)', () => {
    expect(Array.isArray(exampleTemplates)).toBe(true);
    expect(exampleTemplates).toHaveLength(0);
  });
});

describe('server-delivered template registration (#40, registerPremiumTemplates)', () => {
  beforeEach(() => {
    _resetLocalSlotIdsForTests();
  });

  const makeBase = () => [
    { id: 'public-t1', tier: 1, name: 'Public Adventure' },
    { id: 'stub-t3', tier: 3, name: 'Stub', comingSoon: true }
  ];

  it('a delivered entry with a matching id REPLACES the built-in stub; new ids append', () => {
    const base = makeBase();
    const delivered = [
      { id: 'stub-t3', tier: 3, name: 'Full Campaign', premium: true, comingSoon: false },
      { id: 'brand-new-t3', tier: 3, premium: true }
    ];
    registerPremiumTemplates(delivered, base);
    expect(base).toHaveLength(3);
    expect(base[1]).toBe(delivered[0]);
    expect(base[1].comingSoon).toBe(false);
    expect(base[2].id).toBe('brand-new-t3');
  });

  it('is idempotent by id: re-registering the same delivery changes nothing', () => {
    const base = makeBase();
    const delivered = [
      { id: 'stub-t3', tier: 3, name: 'Full Campaign', premium: true },
      { id: 'brand-new-t3', tier: 3, premium: true }
    ];
    registerPremiumTemplates(delivered, base);
    const afterFirst = [...base];
    registerPremiumTemplates(delivered, base);
    registerPremiumTemplates(delivered, base);
    expect(base).toEqual(afterFirst);
    expect(base).toHaveLength(3);
  });

  it('PRECEDENCE: an id claimed by the local dev slot is never overridden by delivery', () => {
    const base = makeBase();
    const localCopy = { id: 'stub-t3', tier: 3, name: 'Local Playtest Copy', premium: true };
    mergeLocalTemplates(base, [localCopy]); // bundle-time local slot claims the id
    registerPremiumTemplates([{ id: 'stub-t3', tier: 3, name: 'Server Copy', premium: true }], base);
    expect(base[1]).toBe(localCopy);
    expect(base[1].name).toBe('Local Playtest Copy');
  });

  it('local-slot precedence is per id: other delivered ids still land', () => {
    const base = makeBase();
    mergeLocalTemplates(base, [{ id: 'stub-t3', tier: 3, name: 'Local Copy' }]);
    registerPremiumTemplates([
      { id: 'stub-t3', name: 'Server Copy' },
      { id: 'brand-new-t3', tier: 3, premium: true }
    ], base);
    expect(base.find((t) => t.id === 'stub-t3').name).toBe('Local Copy');
    expect(base.find((t) => t.id === 'brand-new-t3')).toBeDefined();
  });

  it('tolerates a missing/empty/malformed delivery (built-ins untouched)', () => {
    const base = makeBase();
    registerPremiumTemplates(undefined, base);
    registerPremiumTemplates([], base);
    registerPremiumTemplates([null, {}, { name: 'no id' }], base);
    expect(base).toEqual(makeBase());
  });

  it('a delivered tier-1 premium template lands in the buckets NewGame filters (premium section + gate)', () => {
    // NewGame derives its picker sections from the same shared array:
    //   starterTemplates = storyTemplates.filter(t => t.tier === 1)
    //   premiumStarterTemplates = starterTemplates.filter(isTemplatePremium)
    // and canUseTemplate gates launch off isTemplatePremium. A delivered template
    // carrying its own premium flag must sort into the premium section like the
    // local-slot templates do today.
    const base = makeBase();
    const delivered = { id: 'canal-city-t1', tier: 1, premium: true, name: 'Canal City', settings: { theme: 'grassland', milestones: [] } };
    registerPremiumTemplates([delivered], base);
    const starters = base.filter((t) => t.tier === 1);
    const premiumStarters = starters.filter((t) => isTemplatePremium(t));
    expect(starters.map((t) => t.id)).toContain('canal-city-t1');
    expect(premiumStarters.map((t) => t.id)).toEqual(['canal-city-t1']);
  });

  it('defaults to the LIVE storyTemplates array (mutates in place, returns it)', () => {
    const before = storyTemplates.length;
    const delivered = { id: 'jest-register-default-target-probe', tier: 3, premium: true };
    try {
      const result = registerPremiumTemplates([delivered]);
      expect(result).toBe(storyTemplates);
      expect(storyTemplates).toHaveLength(before + 1);
      expect(storyTemplates[before]).toBe(delivered);
    } finally {
      // Restore the shared array so other tests in this file see public data only.
      const i = storyTemplates.findIndex((t) => t.id === delivered.id);
      if (i >= 0) storyTemplates.splice(i, 1);
    }
    expect(storyTemplates).toHaveLength(before);
  });
});
