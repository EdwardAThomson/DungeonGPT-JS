// generateUnified narration path: DM_PROTOCOL goes out as the system prompt, and a reply
// that echoes the protocol or loops is rejected instead of shown to the player.

import { llmService, NARRATION_REJECTED_MESSAGE } from './llmService';
import { DM_PROTOCOL } from '../data/prompts';
import { _resetAiPoolForTests } from './aiPool';
import { _resetEntitlementsForTests } from '../game/entitlements';

jest.mock('./supabaseClient', () => ({ supabase: null }));

const jsonResponse = (data) => ({ ok: true, status: 200, statusText: 'OK', json: async () => data });
const requestBody = () => JSON.parse(global.fetch.mock.calls[0][1].body);

describe('llmService.generateUnified narration guard', () => {
    beforeEach(() => {
        localStorage.clear();
        _resetAiPoolForTests();
        _resetEntitlementsForTests();
        global.fetch = jest.fn();
    });

    afterEach(() => {
        delete global.fetch;
    });

    const narrate = (prompt = `${DM_PROTOCOL}Describe the clearing.`) =>
        llmService.generateUnified({ provider: 'cf-workers', model: '@cf/openai/gpt-oss-120b', prompt });

    test('sends DM_PROTOCOL as the system prompt, not in the user turn', async () => {
        global.fetch.mockResolvedValueOnce(jsonResponse({ text: 'The clearing is quiet.', pool: 'free' }));
        await expect(narrate()).resolves.toBe('The clearing is quiet.');
        const body = requestBody();
        expect(body.systemPrompt).toBe(DM_PROTOCOL.trim());
        expect(body.prompt).toBe('Describe the clearing.');
    });

    test('leaves prompts without the protocol untouched', async () => {
        global.fetch.mockResolvedValueOnce(jsonResponse({ text: 'A short summary.', pool: 'free' }));
        await narrate('Summarize this.');
        const body = requestBody();
        expect(body.systemPrompt).toBeUndefined();
        expect(body.prompt).toBe('Summarize this.');
    });

    test('rejects a reply that echoes the protocol and loops', async () => {
        const leak = 'You are a Dungeon master for a tabletop RPG. 1. NEVER output internal reasoning. ' + 'NEVER '.repeat(30);
        global.fetch.mockResolvedValueOnce(jsonResponse({ text: leak, pool: 'free' }));
        await expect(narrate()).rejects.toThrow(NARRATION_REJECTED_MESSAGE);
    });
});
