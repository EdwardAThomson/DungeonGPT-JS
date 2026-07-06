// Entitlement filtering for the Custom campaign builder's content sources
// (maintainer directive 2026-07-06: custom/freeform quests must not pull through
// content the account cannot access, and flagship campaign rewards must never be
// custom-quest material for anyone).

import {
    SEARCHABLE_ITEMS,
    CUSTOM_QUEST_EXCLUDED_ITEMS,
    getCustomQuestItems,
    THEME_DEFAULTS,
} from './questPickerData';
import { getEnemiesByTierAndTheme } from './questEnemies';
import { RARITY_RANK, maxRarityRankForTier } from '../utils/inventorySystem';
import {
    TIER_LADDER,
    PREMIUM_THEMES,
    isThemePremium,
    setUserTier,
    _resetEntitlementsForTests,
} from '../game/entitlements';

jest.mock('../services/entitlementsApi', () => ({
    fetchEntitlements: jest.fn(),
}));

describe('questPickerData entitlement filtering', () => {
    beforeEach(() => {
        _resetEntitlementsForTests();
    });

    afterEach(() => {
        try { localStorage.clear(); } catch { /* ignore */ }
    });

    describe('CUSTOM_QUEST_EXCLUDED_ITEMS (flagship/unobtainable set)', () => {
        it('is frozen and pins the legendary shelf plus the premium flagship reward', () => {
            expect(Object.isFrozen(CUSTOM_QUEST_EXCLUDED_ITEMS)).toBe(true);
            expect([...CUSTOM_QUEST_EXCLUDED_ITEMS].sort()).toEqual([
                'aegis_of_dawn',
                'bell_of_the_last_tide',
                'blade_of_the_shattered_throne',
                'clockwork_god_core',
                'crown_of_the_drowned_city',
                'heart_of_the_last_winter',
                'legendary_weapon',
            ]);
        });

        it('covers every legendary-rarity item the raw searchable list exposes (new shelf items must be added here)', () => {
            const legendaries = SEARCHABLE_ITEMS
                .filter((i) => i.rarity === 'legendary')
                .map((i) => i.id);
            expect(legendaries.length).toBeGreaterThan(0);
            for (const id of legendaries) {
                expect(CUSTOM_QUEST_EXCLUDED_ITEMS).toContain(id);
            }
        });

        it('the raw SEARCHABLE_ITEMS view still contains the flagship items (so the filter is doing real work)', () => {
            const rawIds = SEARCHABLE_ITEMS.map((i) => i.id);
            expect(rawIds).toContain('bell_of_the_last_tide');
            expect(rawIds).toContain('blade_of_the_shattered_throne');
        });
    });

    describe('getCustomQuestItems', () => {
        it.each(TIER_LADDER.flatMap((account) => [1, 2, 3].map((tier) => [account, tier])))(
            'never offers a flagship/unobtainable item (account %s, campaign tier %s)',
            (account, tier) => {
                setUserTier(account);
                const ids = getCustomQuestItems(tier).map((i) => i.id);
                for (const excluded of CUSTOM_QUEST_EXCLUDED_ITEMS) {
                    expect(ids).not.toContain(excluded);
                }
            }
        );

        it('bell_of_the_last_tide is never selectable at any tier: it is a campaign reward, not custom-quest material', () => {
            for (const account of TIER_LADDER) {
                setUserTier(account);
                for (const tier of [1, 2, 3, 99]) {
                    expect(getCustomQuestItems(tier).map((i) => i.id))
                        .not.toContain('bell_of_the_last_tide');
                }
            }
        });

        it('caps tier 1 at rare (mirrors the random-drop ceiling)', () => {
            setUserTier('free');
            const items = getCustomQuestItems(1);
            expect(items.length).toBeGreaterThan(0);
            for (const item of items) {
                expect(RARITY_RANK[item.rarity] ?? 0).toBeLessThanOrEqual(RARITY_RANK.rare);
            }
            const ids = items.map((i) => i.id);
            expect(ids).toContain('magic_weapon'); // rare stays in
            expect(ids).not.toContain('runic_greatsword'); // very_rare is above the t1 ceiling
        });

        it('tier 2 adds very_rare but nothing above it', () => {
            setUserTier('free');
            const items = getCustomQuestItems(2);
            const ids = items.map((i) => i.id);
            expect(ids).toContain('runic_greatsword');
            for (const item of items) {
                expect(RARITY_RANK[item.rarity] ?? 0).toBeLessThanOrEqual(RARITY_RANK.very_rare);
            }
        });

        it('coerces tier 3 down to the tier-2 ceiling for non-members (source-level guard, not UI trust)', () => {
            setUserTier('free');
            expect(getCustomQuestItems(3)).toEqual(getCustomQuestItems(2));
        });

        it('members get the true tier-3 ceiling, but the flagship exclusion still holds', () => {
            setUserTier('member');
            expect(maxRarityRankForTier(3)).toBe(RARITY_RANK.legendary);
            const ids = getCustomQuestItems(3).map((i) => i.id);
            // Every legendary in the pool is flagship shelf, so none survive the filter.
            const legendaries = getCustomQuestItems(3).filter((i) => i.rarity === 'legendary');
            expect(legendaries).toEqual([]);
            for (const excluded of CUSTOM_QUEST_EXCLUDED_ITEMS) {
                expect(ids).not.toContain(excluded);
            }
        });

        it('clamps invalid tier input to tier 1', () => {
            setUserTier('free');
            expect(getCustomQuestItems(undefined)).toEqual(getCustomQuestItems(1));
            expect(getCustomQuestItems('nope')).toEqual(getCustomQuestItems(1));
            expect(getCustomQuestItems(-4)).toEqual(getCustomQuestItems(1));
        });
    });

    describe('theme sources (custom builder + enemy picker)', () => {
        it('no campaign genre in the custom theme picker is premium-gated today (finding, not just a guard)', () => {
            for (const genreId of Object.keys(THEME_DEFAULTS)) {
                expect(isThemePremium(genreId)).toBe(false);
            }
        });

        it('premium world-biome theme ids resolve to zero quest enemies (nothing to leak through slot 4)', () => {
            setUserTier('free');
            for (const themeId of [...PREMIUM_THEMES, 'tidewater']) {
                for (const tier of [1, 2, 3]) {
                    expect(getEnemiesByTierAndTheme(tier, themeId)).toEqual([]);
                }
            }
        });
    });
});
