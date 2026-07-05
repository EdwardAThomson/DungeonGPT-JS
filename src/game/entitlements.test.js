import {
    TIER_LADDER,
    TIER_MIRROR_KEY,
    PREMIUM_DEV_OVERRIDE_KEY,
    PREMIUM_THEMES,
    WATER_TOWN_ARCHETYPES,
    getCurrentTier,
    getUserTier,
    setUserTier,
    clearUserTier,
    hasTier,
    isPremium,
    isThemePremium,
    isTemplatePremium,
    canUseTheme,
    canUseTemplate,
    canUseWaterTown,
    _resetEntitlementsForTests,
} from './entitlements';
import { fetchEntitlements } from '../services/entitlementsApi';

jest.mock('../services/entitlementsApi', () => ({
    fetchEntitlements: jest.fn(),
}));

describe('entitlements', () => {
    beforeEach(() => {
        _resetEntitlementsForTests();
        fetchEntitlements.mockReset();
    });

    afterEach(() => {
        try { localStorage.clear(); } catch { /* ignore */ }
    });

    describe('tier ladder', () => {
        it('orders the four tiers free < member < premium < elite', () => {
            expect([...TIER_LADDER]).toEqual(['free', 'member', 'premium', 'elite']);
        });

        it('is frozen (gates cannot mutate the ladder)', () => {
            expect(Object.isFrozen(TIER_LADDER)).toBe(true);
        });
    });

    describe('hasTier', () => {
        it.each([
            // [current tier, minTier, expected]
            ['free', 'free', true],
            ['free', 'member', false],
            ['free', 'premium', false],
            ['free', 'elite', false],
            ['member', 'free', true],
            ['member', 'member', true],
            ['member', 'premium', false],
            ['premium', 'member', true],
            ['premium', 'premium', true],
            ['premium', 'elite', false],
            ['elite', 'free', true],
            ['elite', 'elite', true],
        ])('tier %s vs minimum %s -> %s', (tier, minTier, expected) => {
            setUserTier(tier);
            expect(hasTier(minTier)).toBe(expected);
        });

        it('fails closed for an unknown minimum tier (a gate typo must not unlock)', () => {
            setUserTier('elite');
            expect(hasTier('gold')).toBe(false);
            expect(hasTier(undefined)).toBe(false);
        });
    });

    describe('getCurrentTier / setUserTier', () => {
        it('defaults to free with no session tier, no mirror, no override', () => {
            expect(getCurrentTier()).toBe('free');
        });

        it('collapses invalid tier values to free (fail closed)', () => {
            setUserTier('platinum');
            expect(getCurrentTier()).toBe('free');
        });

        it('mirrors a resolved tier to localStorage', () => {
            setUserTier('premium');
            expect(localStorage.getItem(TIER_MIRROR_KEY)).toBe('premium');
        });
    });

    describe('localStorage mirror hydration', () => {
        it('hydrates the tier synchronously from the mirror before any fetch', () => {
            localStorage.setItem(TIER_MIRROR_KEY, 'member');
            expect(getCurrentTier()).toBe('member');
            expect(isPremium()).toBe(true);
        });

        it('ignores an invalid mirror value (treated as free)', () => {
            localStorage.setItem(TIER_MIRROR_KEY, 'platinum');
            expect(getCurrentTier()).toBe('free');
        });

        it('a session-resolved tier beats a stale mirror', () => {
            localStorage.setItem(TIER_MIRROR_KEY, 'premium');
            setUserTier('member');
            expect(getCurrentTier()).toBe('member');
        });
    });

    describe('getUserTier (fetch behaviour)', () => {
        it('resolves and caches the tier from the worker', async () => {
            fetchEntitlements.mockResolvedValue({ tier: 'member', updatedAt: '2026-07-05' });
            await expect(getUserTier()).resolves.toBe('member');
            expect(getCurrentTier()).toBe('member');
            expect(localStorage.getItem(TIER_MIRROR_KEY)).toBe('member');
        });

        it('fetches at most once per session (memoised)', async () => {
            fetchEntitlements.mockResolvedValue({ tier: 'member', updatedAt: null });
            await getUserTier();
            await getUserTier();
            expect(fetchEntitlements).toHaveBeenCalledTimes(1);
        });

        it('fails closed to free on fetch failure', async () => {
            fetchEntitlements.mockRejectedValue(new Error('network down'));
            await expect(getUserTier()).resolves.toBe('free');
            expect(isPremium()).toBe(false);
        });

        it('a fetch failure does not wipe the mirror (warm start survives a blip)', async () => {
            localStorage.setItem(TIER_MIRROR_KEY, 'member');
            fetchEntitlements.mockRejectedValue(new Error('network down'));
            await getUserTier();
            // Current session fails closed...
            expect(getCurrentTier()).toBe('free');
            // ...but the next page load can still warm-start from the mirror.
            expect(localStorage.getItem(TIER_MIRROR_KEY)).toBe('member');
        });

        it('an unknown tier from the server collapses to free', async () => {
            fetchEntitlements.mockResolvedValue({ tier: 'platinum', updatedAt: null });
            await expect(getUserTier()).resolves.toBe('free');
        });
    });

    describe('clearUserTier (sign-out)', () => {
        it('resets to free, removes the mirror, and re-arms the fetch memo', async () => {
            fetchEntitlements.mockResolvedValue({ tier: 'premium', updatedAt: null });
            await getUserTier();
            expect(getCurrentTier()).toBe('premium');

            clearUserTier();
            expect(getCurrentTier()).toBe('free');
            expect(localStorage.getItem(TIER_MIRROR_KEY)).toBe(null);

            // Next sign-in fetches again instead of replaying the memo.
            fetchEntitlements.mockResolvedValue({ tier: 'member', updatedAt: null });
            await expect(getUserTier()).resolves.toBe('member');
            expect(fetchEntitlements).toHaveBeenCalledTimes(2);
        });
    });

    describe('isPremium', () => {
        it('defaults to false (free tier) with no override set', () => {
            expect(isPremium()).toBe(false);
        });

        it('is true for member and every tier above', () => {
            for (const tier of ['member', 'premium', 'elite']) {
                setUserTier(tier);
                expect(isPremium()).toBe(true);
            }
        });

        it('honours the localStorage dev override when set to the string "true"', () => {
            localStorage.setItem(PREMIUM_DEV_OVERRIDE_KEY, 'true');
            expect(isPremium()).toBe(true);
        });

        it('stays false for any non-"true" override value', () => {
            localStorage.setItem(PREMIUM_DEV_OVERRIDE_KEY, 'yes');
            expect(isPremium()).toBe(false);
            localStorage.setItem(PREMIUM_DEV_OVERRIDE_KEY, '1');
            expect(isPremium()).toBe(false);
            localStorage.setItem(PREMIUM_DEV_OVERRIDE_KEY, 'TRUE');
            expect(isPremium()).toBe(false);
        });

        it('fails closed (false) if localStorage throws', () => {
            const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
                throw new Error('storage disabled');
            });
            expect(isPremium()).toBe(false);
            spy.mockRestore();
        });
    });

    describe('dev override', () => {
        it('forces member-or-above but does NOT grant premium/elite', () => {
            localStorage.setItem(PREMIUM_DEV_OVERRIDE_KEY, 'true');
            expect(getCurrentTier()).toBe('member');
            expect(hasTier('member')).toBe(true);
            expect(hasTier('premium')).toBe(false);
        });

        it('does not downgrade a real tier above member', () => {
            localStorage.setItem(PREMIUM_DEV_OVERRIDE_KEY, 'true');
            setUserTier('elite');
            expect(getCurrentTier()).toBe('elite');
        });

        it('is compiled out of production builds (debug-routes flag pattern)', () => {
            const prevNodeEnv = process.env.NODE_ENV;
            const prevFlag = process.env.REACT_APP_ENABLE_DEBUG_ROUTES;
            process.env.NODE_ENV = 'production';
            delete process.env.REACT_APP_ENABLE_DEBUG_ROUTES;
            localStorage.setItem(PREMIUM_DEV_OVERRIDE_KEY, 'true');
            try {
                jest.isolateModules(() => {
                    const prod = require('./entitlements');
                    expect(prod.isPremium()).toBe(false);
                    expect(prod.getCurrentTier()).toBe('free');
                });
            } finally {
                process.env.NODE_ENV = prevNodeEnv;
                if (prevFlag === undefined) {
                    delete process.env.REACT_APP_ENABLE_DEBUG_ROUTES;
                } else {
                    process.env.REACT_APP_ENABLE_DEBUG_ROUTES = prevFlag;
                }
            }
        });

        it('re-enables in production when the debug-routes flag is set (staging preview)', () => {
            const prevNodeEnv = process.env.NODE_ENV;
            const prevFlag = process.env.REACT_APP_ENABLE_DEBUG_ROUTES;
            process.env.NODE_ENV = 'production';
            process.env.REACT_APP_ENABLE_DEBUG_ROUTES = 'true';
            localStorage.setItem(PREMIUM_DEV_OVERRIDE_KEY, 'true');
            try {
                jest.isolateModules(() => {
                    const prod = require('./entitlements');
                    expect(prod.isPremium()).toBe(true);
                });
            } finally {
                process.env.NODE_ENV = prevNodeEnv;
                if (prevFlag === undefined) {
                    delete process.env.REACT_APP_ENABLE_DEBUG_ROUTES;
                } else {
                    process.env.REACT_APP_ENABLE_DEBUG_ROUTES = prevFlag;
                }
            }
        });
    });

    describe('isThemePremium', () => {
        it('flags desert and snow world biomes as premium', () => {
            expect(isThemePremium('desert')).toBe(true);
            expect(isThemePremium('snow')).toBe(true);
        });

        it('leaves free/temperate biomes ungated', () => {
            expect(isThemePremium('grassland')).toBe(false);
            expect(isThemePremium('plains')).toBe(false);
            expect(isThemePremium(undefined)).toBe(false);
            expect(isThemePremium(null)).toBe(false);
        });

        it('PREMIUM_THEMES contains exactly desert and snow', () => {
            expect([...PREMIUM_THEMES].sort()).toEqual(['desert', 'snow']);
        });
    });

    describe('isTemplatePremium', () => {
        it('flags a template with an explicit premium flag', () => {
            expect(isTemplatePremium({ id: 'x', premium: true })).toBe(true);
        });

        it('derives premium from a premium world-biome theme', () => {
            expect(isTemplatePremium({ id: 'sunscorch', settings: { theme: 'desert' } })).toBe(true);
            expect(isTemplatePremium({ id: 'tundra', settings: { theme: 'snow' } })).toBe(true);
        });

        it('treats free/temperate templates as not premium', () => {
            expect(isTemplatePremium({ id: 'heroic', settings: { theme: 'grassland' } })).toBe(false);
            expect(isTemplatePremium({ id: 'heroic', settings: {} })).toBe(false);
            expect(isTemplatePremium({ id: 'heroic' })).toBe(false);
        });

        it('handles null/undefined templates safely', () => {
            expect(isTemplatePremium(null)).toBe(false);
            expect(isTemplatePremium(undefined)).toBe(false);
        });
    });

    describe('canUseTheme / canUseTemplate (gate tier: member)', () => {
        it('blocks premium content and allows free content on the free tier', () => {
            expect(isPremium()).toBe(false);
            expect(canUseTheme('desert')).toBe(false);
            expect(canUseTheme('snow')).toBe(false);
            expect(canUseTheme('grassland')).toBe(true);
            expect(canUseTemplate({ settings: { theme: 'desert' } })).toBe(false);
            expect(canUseTemplate({ settings: { theme: 'grassland' } })).toBe(true);
        });

        it('unlocks at member and stays unlocked above', () => {
            for (const tier of ['member', 'premium', 'elite']) {
                setUserTier(tier);
                expect(canUseTheme('desert')).toBe(true);
                expect(canUseTheme('snow')).toBe(true);
                expect(canUseTemplate({ settings: { theme: 'desert' } })).toBe(true);
                expect(canUseTemplate({ premium: true })).toBe(true);
            }
        });

        it('unlocks via the dev override (member-equivalent)', () => {
            localStorage.setItem(PREMIUM_DEV_OVERRIDE_KEY, 'true');
            expect(canUseTheme('desert')).toBe(true);
            expect(canUseTemplate({ premium: true })).toBe(true);
        });
    });

    describe('canUseWaterTown (riverfork: member, canal: premium)', () => {
        it('WATER_TOWN_ARCHETYPES maps riverfork to member and canal to premium', () => {
            expect(WATER_TOWN_ARCHETYPES).toEqual({ riverfork: 'member', canal: 'premium' });
            expect(Object.isFrozen(WATER_TOWN_ARCHETYPES)).toBe(true);
        });

        it('free tier gets neither archetype', () => {
            expect(canUseWaterTown('riverfork')).toBe(false);
            expect(canUseWaterTown('canal')).toBe(false);
        });

        it('member unlocks riverfork but not the canal flagship', () => {
            setUserTier('member');
            expect(canUseWaterTown('riverfork')).toBe(true);
            expect(canUseWaterTown('canal')).toBe(false);
        });

        it('premium and elite unlock both', () => {
            for (const tier of ['premium', 'elite']) {
                setUserTier(tier);
                expect(canUseWaterTown('riverfork')).toBe(true);
                expect(canUseWaterTown('canal')).toBe(true);
            }
        });

        it('plain towns (no archetype) are ungated for everyone', () => {
            expect(canUseWaterTown(undefined)).toBe(true);
            expect(canUseWaterTown(null)).toBe(true);
            expect(canUseWaterTown('fishing-village-someday')).toBe(true);
        });
    });
});
