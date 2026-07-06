// llmService pool plumbing (backlog #7): the cf-workers branch sends the gated
// pool, retries once on premium refusals with a code, and records pool outcomes.

import { llmService } from './llmService';
import {
    setPreferredPool,
    getLastPoolOutcome,
    _resetAiPoolForTests,
} from './aiPool';
import { setUserTier, _resetEntitlementsForTests } from '../game/entitlements';

jest.mock('./supabaseClient', () => ({ supabase: null }));

const jsonResponse = (data, { ok = true, status = 200 } = {}) => ({
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => data,
});

const lastRequestBody = (call) => JSON.parse(call[1].body);

describe('llmService cf-workers pool plumbing', () => {
    beforeEach(() => {
        localStorage.clear();
        _resetAiPoolForTests();
        _resetEntitlementsForTests();
        global.fetch = jest.fn();
    });

    afterEach(() => {
        delete global.fetch;
    });

    const generate = () =>
        llmService.generateText({
            provider: 'cf-workers',
            model: '@cf/openai/gpt-oss-120b',
            prompt: 'Narrate the tavern.',
            maxTokens: 500,
            temperature: 0.7,
        });

    test('guest/free sends pool: free', async () => {
        global.fetch.mockResolvedValueOnce(jsonResponse({ text: 'ok', pool: 'free' }));
        await generate();
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(lastRequestBody(global.fetch.mock.calls[0]).pool).toBe('free');
    });

    test('member with premium preference sends pool: premium and records the pool used', async () => {
        setUserTier('member');
        setPreferredPool('premium');
        global.fetch.mockResolvedValueOnce(jsonResponse({ text: 'grand', pool: 'premium' }));

        const text = await generate();

        expect(text).toBe('grand');
        expect(lastRequestBody(global.fetch.mock.calls[0]).pool).toBe('premium');
        expect(getLastPoolOutcome()).toEqual({
            requestedPool: 'premium',
            usedPool: 'premium',
            reason: null,
        });
    });

    test('429 premium_cap retries once on the free pool and records the fallback', async () => {
        setUserTier('member');
        setPreferredPool('premium');
        global.fetch
            .mockResolvedValueOnce(
                jsonResponse(
                    { error: 'Premium AI allowance used for today', code: 'premium_cap', retryAfterSeconds: 3600 },
                    { ok: false, status: 429 }
                )
            )
            .mockResolvedValueOnce(jsonResponse({ text: 'still going', pool: 'free' }));

        const text = await generate();

        expect(text).toBe('still going');
        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect(lastRequestBody(global.fetch.mock.calls[0]).pool).toBe('premium');
        expect(lastRequestBody(global.fetch.mock.calls[1]).pool).toBe('free');
        expect(getLastPoolOutcome()).toEqual({
            requestedPool: 'premium',
            usedPool: 'free',
            reason: 'premium_cap',
        });
    });

    test('403 premium_required retries once on the free pool and records the refusal', async () => {
        setUserTier('member'); // stale client tier; server disagrees
        setPreferredPool('premium');
        global.fetch
            .mockResolvedValueOnce(
                jsonResponse(
                    { error: 'Premium AI requires a Membership', code: 'premium_required' },
                    { ok: false, status: 403 }
                )
            )
            .mockResolvedValueOnce(jsonResponse({ text: 'free tale', pool: 'free' }));

        const text = await generate();

        expect(text).toBe('free tale');
        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect(getLastPoolOutcome().reason).toBe('premium_required');
    });

    test('server-side premium fallback (fallbackFrom) is surfaced as an outcome', async () => {
        setUserTier('member');
        setPreferredPool('premium');
        global.fetch.mockResolvedValueOnce(
            jsonResponse({
                text: 'free but alive',
                pool: 'free',
                fallbackFrom: 'premium',
                fallbackReason: 'premium_error',
            })
        );

        const text = await generate();

        expect(text).toBe('free but alive');
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(getLastPoolOutcome()).toEqual({
            requestedPool: 'premium',
            usedPool: 'free',
            reason: 'premium_error',
        });
    });

    test('generic rate_limited 429 throws with the retry window in the message', async () => {
        global.fetch.mockResolvedValueOnce(
            jsonResponse(
                { error: 'Rate limit exceeded', code: 'rate_limited', bucket: 'ai-generate', retryAfterSeconds: 42 },
                { ok: false, status: 429 }
            )
        );

        await expect(generate()).rejects.toThrow(/Rate limit exceeded.*42s/);
        expect(global.fetch).toHaveBeenCalledTimes(1); // no premium retry for plain throttling
    });

    test('free-pool requests do not record premium outcomes', async () => {
        global.fetch.mockResolvedValueOnce(jsonResponse({ text: 'ok', pool: 'free' }));
        await generate();
        expect(getLastPoolOutcome()).toBeNull();
    });
});
