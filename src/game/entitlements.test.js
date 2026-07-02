import {
    isPremium,
    isThemePremium,
    isTemplatePremium,
    canUseTheme,
    canUseTemplate,
    PREMIUM_THEMES,
    PREMIUM_DEV_OVERRIDE_KEY,
} from './entitlements';

describe('entitlements', () => {
    afterEach(() => {
        try { localStorage.clear(); } catch { /* ignore */ }
    });

    describe('isPremium', () => {
        it('defaults to false (free tier) with no override set', () => {
            expect(isPremium()).toBe(false);
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

    describe('canUseTheme / canUseTemplate (free tier)', () => {
        it('blocks premium content and allows free content when not premium', () => {
            expect(isPremium()).toBe(false);
            expect(canUseTheme('desert')).toBe(false);
            expect(canUseTheme('snow')).toBe(false);
            expect(canUseTheme('grassland')).toBe(true);
            expect(canUseTemplate({ settings: { theme: 'desert' } })).toBe(false);
            expect(canUseTemplate({ settings: { theme: 'grassland' } })).toBe(true);
        });
    });

    describe('canUseTheme / canUseTemplate (premium via override)', () => {
        beforeEach(() => localStorage.setItem(PREMIUM_DEV_OVERRIDE_KEY, 'true'));

        it('unlocks all content when premium', () => {
            expect(isPremium()).toBe(true);
            expect(canUseTheme('desert')).toBe(true);
            expect(canUseTheme('snow')).toBe(true);
            expect(canUseTemplate({ settings: { theme: 'desert' } })).toBe(true);
            expect(canUseTemplate({ premium: true })).toBe(true);
        });
    });
});
