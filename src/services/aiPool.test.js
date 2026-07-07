// AI pool selection (backlog #7): preference persistence, tier gating of the
// request pool, and outcome notices.

import {
    AI_POOL_KEY,
    autoSelectPoolForTier,
    getPreferredPool,
    setPreferredPool,
    getRequestPool,
    recordPoolOutcome,
    getLastPoolOutcome,
    subscribeAiPool,
    _resetAiPoolForTests,
} from './aiPool';
import { setUserTier, clearUserTier, _resetEntitlementsForTests } from '../game/entitlements';

describe('aiPool', () => {
    beforeEach(() => {
        localStorage.clear();
        _resetAiPoolForTests();
        _resetEntitlementsForTests(); // tier resolves to 'free' (no mirror, no session)
    });

    describe('preference', () => {
        test('defaults to free', () => {
            expect(getPreferredPool()).toBe('free');
        });

        test('persists to localStorage and survives a module-state reset', () => {
            setPreferredPool('premium');
            expect(getPreferredPool()).toBe('premium');
            expect(localStorage.getItem(AI_POOL_KEY)).toBe('premium');

            _resetAiPoolForTests(); // simulate a fresh page load
            expect(getPreferredPool()).toBe('premium');
        });

        test('invalid values collapse to free', () => {
            setPreferredPool('platinum-deluxe');
            expect(getPreferredPool()).toBe('free');
        });

        test('garbage in localStorage resolves to free', () => {
            localStorage.setItem(AI_POOL_KEY, 'nonsense');
            expect(getPreferredPool()).toBe('free');
        });
    });

    describe('getRequestPool (tier gating)', () => {
        test('guest/free tier never sends premium, even when preferred', () => {
            setPreferredPool('premium');
            expect(getRequestPool()).toBe('free');
        });

        test('member with premium preference sends premium', () => {
            setUserTier('member');
            setPreferredPool('premium');
            expect(getRequestPool()).toBe('premium');
        });

        test('higher tiers also qualify', () => {
            setUserTier('elite');
            setPreferredPool('premium');
            expect(getRequestPool()).toBe('premium');
        });

        test('member with free preference sends free', () => {
            setUserTier('member');
            setPreferredPool('free');
            expect(getRequestPool()).toBe('free');
        });

        test('tier loss reverts to free but keeps the preference', () => {
            setUserTier('member');
            setPreferredPool('premium');
            expect(getRequestPool()).toBe('premium');

            clearUserTier();
            expect(getRequestPool()).toBe('free');
            expect(getPreferredPool()).toBe('premium'); // re-arms if tier returns
        });
    });

    describe('outcomes and subscription', () => {
        test('records and exposes the last outcome', () => {
            expect(getLastPoolOutcome()).toBeNull();
            recordPoolOutcome({ requestedPool: 'premium', usedPool: 'free', reason: 'premium_cap' });
            expect(getLastPoolOutcome()).toEqual({
                requestedPool: 'premium',
                usedPool: 'free',
                reason: 'premium_cap',
            });
        });

        test('notifies subscribers on preference and outcome changes; unsubscribe works', () => {
            const listener = jest.fn();
            const unsubscribe = subscribeAiPool(listener);

            setPreferredPool('premium');
            expect(listener).toHaveBeenCalledTimes(1);

            recordPoolOutcome({ requestedPool: 'premium', usedPool: 'premium', reason: null });
            expect(listener).toHaveBeenCalledTimes(2);

            unsubscribe();
            setPreferredPool('free');
            expect(listener).toHaveBeenCalledTimes(2);
        });

        test('a throwing listener does not break others', () => {
            const bad = jest.fn(() => { throw new Error('boom'); });
            const good = jest.fn();
            subscribeAiPool(bad);
            subscribeAiPool(good);
            setPreferredPool('premium');
            expect(good).toHaveBeenCalledTimes(1);
        });
    });
});

describe('autoSelectPoolForTier (auto-bump on gaining member+, 2026-07-07)', () => {
  afterEach(() => {
    localStorage.clear();
    _resetAiPoolForTests();
    clearUserTier();
  });

  it('an untouched default upgrades to premium when member+', () => {
    setUserTier('member');
    localStorage.removeItem(AI_POOL_KEY);
    _resetAiPoolForTests();
    autoSelectPoolForTier();
    expect(getPreferredPool()).toBe('premium');
  });

  it('an explicit Free choice is never overridden', () => {
    setUserTier('member');
    localStorage.setItem(AI_POOL_KEY, 'free'); // the player chose Free on purpose
    _resetAiPoolForTests();
    autoSelectPoolForTier();
    expect(getPreferredPool()).toBe('free');
  });

  it('a free-tier account is never bumped', () => {
    localStorage.removeItem(AI_POOL_KEY);
    _resetAiPoolForTests();
    autoSelectPoolForTier();
    expect(getPreferredPool()).toBe('free');
  });
});
