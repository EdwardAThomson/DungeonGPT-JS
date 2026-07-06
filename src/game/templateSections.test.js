// Tests for the New Game picker sections (#72): tier-2/3 campaigns must be
// DISCOVERABLE on the New Game page (previously only tier 1 was listed and
// higher-tier content was invisible until the continue-legend picker offered
// it), with comingSoon stubs excluded from the higher-tier sections and premium
// gating applied per card via canUseTemplate.

import { getTemplateSections } from './templateSections';
import { storyTemplates, registerPremiumTemplates, _resetLocalSlotIdsForTests } from '../data/storyTemplates';
import { canUseTemplate, PREMIUM_DEV_OVERRIDE_KEY, _resetEntitlementsForTests } from './entitlements';

// entitlements -> entitlementsApi -> supabaseClient would construct a real client
// (auto-refresh timer) when .env credentials are present; keep this suite hermetic.
jest.mock('../services/supabaseClient', () => ({ supabase: null }));

afterEach(() => {
  localStorage.clear();
  _resetEntitlementsForTests();
  _resetLocalSlotIdsForTests();
});

describe('getTemplateSections against the shipped catalog', () => {
  const sections = getTemplateSections(storyTemplates);

  it('keeps the tier-1 starter split exactly as before (free vs premium)', () => {
    expect(sections.freeStarters.map((t) => t.id).sort()).toEqual([
      'arcane-renaissance-t1',
      'eldritch-horror-t1',
      'grimdark-survival-t1',
      'heroic-fantasy-t1',
    ]);
    expect(sections.premiumStarters.map((t) => t.id).sort()).toEqual([
      'desert-expedition-t1',
      'frozen-frontier-t1',
    ]);
  });

  it('lists every playable tier-2 campaign in the Seasoned section', () => {
    expect(sections.seasoned.map((t) => t.id).sort()).toEqual([
      'arcane-renaissance-t2',
      'desert-expedition-t2',
      'eldritch-horror-t2',
      'frozen-frontier-t2',
      'grimdark-survival-t2',
      'heroic-fantasy-t2',
    ]);
    sections.seasoned.forEach((t) => expect(t.comingSoon).toBeUndefined());
  });

  it('excludes comingSoon stubs from the tier-3 section (empty until real t3 content ships)', () => {
    // All four built-in t3s are comingSoon stubs, so with public data only the
    // Legendary section is empty and NewGame hides it entirely.
    expect(sections.legendary).toEqual([]);
  });

  it('every playable template lands in exactly one section', () => {
    const all = [
      ...sections.freeStarters,
      ...sections.premiumStarters,
      ...sections.seasoned,
      ...sections.legendary,
    ].map((t) => t.id);
    expect(new Set(all).size).toBe(all.length); // no double listing
    storyTemplates
      .filter((t) => !t.comingSoon)
      .forEach((t) => expect(all).toContain(t.id));
  });
});

describe('server-delivered higher-tier templates (registerPremiumTemplates then re-filter)', () => {
  const makeCatalog = () => storyTemplates.map((t) => ({ ...t }));

  const drownedBells = {
    id: 'tidewater-t3',
    tier: 3,
    levelRange: [5, 7],
    name: 'Tidewater',
    subtitle: 'The Drowned Bells',
    icon: '🔔',
    premium: true,
    minTier: 'premium',
    settings: { theme: 'grassland', milestones: [{ id: 1, text: 'x', minLevel: 5 }] },
  };

  it('a delivered t3 appears in the Legendary section after registration (no reload needed)', () => {
    const catalog = makeCatalog();
    expect(getTemplateSections(catalog).legendary).toEqual([]);
    registerPremiumTemplates([drownedBells], catalog);
    const { legendary } = getTemplateSections(catalog);
    expect(legendary.map((t) => t.id)).toEqual(['tidewater-t3']);
  });

  it('a delivered entry replacing a comingSoon t3 stub becomes visible in Legendary', () => {
    const catalog = makeCatalog();
    registerPremiumTemplates([{
      id: 'heroic-fantasy-t3', tier: 3, levelRange: [5, 7], premium: true,
      name: 'Heroic Fantasy', subtitle: 'The Shattered Throne', comingSoon: false,
      settings: { milestones: [] },
    }], catalog);
    const { legendary } = getTemplateSections(catalog);
    expect(legendary.map((t) => t.id)).toEqual(['heroic-fantasy-t3']);
    // The remaining stubs stay excluded.
    expect(legendary.map((t) => t.id)).not.toContain('eldritch-horror-t3');
  });

  it('a delivered t2 lands in the Seasoned section', () => {
    const catalog = makeCatalog();
    registerPremiumTemplates([{ id: 'delivered-t2', tier: 2, levelRange: [3, 5], premium: true, settings: { milestones: [] } }], catalog);
    expect(getTemplateSections(catalog).seasoned.map((t) => t.id)).toContain('delivered-t2');
  });
});

describe('premium gating on higher-tier cards (canUseTemplate, the card lock)', () => {
  it('locks premium tier-2 templates for a free user, keeps free tier-2 selectable', () => {
    const desertT2 = storyTemplates.find((t) => t.id === 'desert-expedition-t2');
    const hfT2 = storyTemplates.find((t) => t.id === 'heroic-fantasy-t2');
    expect(canUseTemplate(desertT2)).toBe(false); // locked card
    expect(canUseTemplate(hfT2)).toBe(true);      // selectable
  });

  it('unlocks premium tier-2 cards at member tier', () => {
    localStorage.setItem(PREMIUM_DEV_OVERRIDE_KEY, 'true'); // lifts to member
    const desertT2 = storyTemplates.find((t) => t.id === 'desert-expedition-t2');
    expect(canUseTemplate(desertT2)).toBe(true);
  });

  it('a minTier: premium delivered t3 stays locked even for members (The Drowned Bells case)', () => {
    localStorage.setItem(PREMIUM_DEV_OVERRIDE_KEY, 'true'); // member, NOT premium
    const t3 = { id: 'tidewater-t3', tier: 3, premium: true, minTier: 'premium', settings: {} };
    expect(canUseTemplate(t3)).toBe(false);
  });
});
