// Start Adventure failure recovery (playtest 2026-07-07): the first Start Adventure
// call failed (worker 400) and the button vanished forever, because
// handleStartAdventure set hasAdventureStarted TRUE before the AI call and the
// catch never reset it (GameMainPanel hides the button once hasAdventureStarted).
// A failed start must NOT count as started: the button stays, the error is
// surfaced, and a retry fires a fresh generation.

import { renderHook, act } from '@testing-library/react';
import useGameInteraction from './useGameInteraction';

jest.mock('../services/llmService', () => ({
    llmService: { generateUnified: jest.fn() },
}));
jest.mock('../game/ragEngine', () => ({
    embedAndStore: jest.fn(),
    query: jest.fn(),
}));
jest.mock('../llm/modelResolver', () => ({
    buildModelOptions: () => [],
    resolveProviderAndModel: () => ({ provider: 'cf-workers', model: 'test-model' }),
}));
jest.mock('../utils/logger', () => ({
    createLogger: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
}));

import { llmService } from '../services/llmService';
import { embedAndStore, query as ragQuery } from '../game/ragEngine';

const worldMap = [[
    { x: 0, y: 0, biome: 'plains', poi: 'town', townName: 'Millhaven', townSize: 'village' },
    { x: 1, y: 0, biome: 'plains' },
], [
    { x: 0, y: 1, biome: 'plains' },
    { x: 1, y: 1, biome: 'plains' },
]];

const heroes = [{ characterName: 'Kael', class: 'Fighter', level: 1 }];
const settings = { shortDescription: 'A test world', responseVerbosity: 'Moderate', milestones: [], sideQuests: [] };

// Drive the hook the way Game.js does: hasAdventureStarted lives OUTSIDE the hook
// (useGameSession state) and is passed in with its setter.
const setup = () => {
    const external = { started: false };
    const setHasAdventureStarted = jest.fn((v) => { external.started = v; });
    const hook = renderHook(
        ({ started }) => useGameInteraction(
            null,            // loadedConversation
            settings,
            jest.fn(),       // setSettings
            'cf-workers',
            'test-model',
            heroes,
            worldMap,
            { x: 0, y: 0 },
            started,
            setHasAdventureStarted,
            {},              // locationContext
            'session-1',
            true             // aiAvailable
        ),
        { initialProps: { started: external.started } }
    );
    return { ...hook, external, setHasAdventureStarted };
};

describe('handleStartAdventure failure recovery', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // CRA's resetMocks wipes factory implementations between tests; restore them.
        embedAndStore.mockResolvedValue(undefined);
        ragQuery.mockResolvedValue([]);
    });

    it('a failed initial generation does NOT count as started, surfaces the error, and a retry works', async () => {
        llmService.generateUnified
            .mockRejectedValueOnce(new Error('Request failed with status 400'))
            .mockResolvedValue('The frontier wind howls as the party arrives.');

        const { result, rerender, external, setHasAdventureStarted } = setup();

        await act(async () => {
            await result.current.handleStartAdventure();
        });

        // The failure must leave the button-gating state FALSE (button stays visible).
        expect(external.started).toBe(false);
        expect(setHasAdventureStarted).toHaveBeenLastCalledWith(false);
        // The error is surfaced to the player.
        expect(result.current.error).toMatch(/Error starting adventure/i);
        expect(result.current.isLoading).toBe(false);
        expect(llmService.generateUnified).toHaveBeenCalledTimes(1);

        // Retry: with started still false, a second attempt must actually fire.
        rerender({ started: external.started });
        await act(async () => {
            await result.current.handleStartAdventure();
        });

        // Second attempt called the AI again (start + summary) and stayed started.
        expect(llmService.generateUnified.mock.calls.length).toBeGreaterThanOrEqual(2);
        expect(external.started).toBe(true);
        const aiMessages = result.current.conversation.filter((m) => m.role === 'ai');
        expect(aiMessages.some((m) => /frontier wind/i.test(m.content))).toBe(true);
    });

    it('an empty AI response also does not count as started', async () => {
        llmService.generateUnified.mockResolvedValue('   ');

        const { result, external } = setup();

        await act(async () => {
            await result.current.handleStartAdventure();
        });

        expect(external.started).toBe(false);
        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBeTruthy();
    });

    it('a successful start still flips the state true exactly as before', async () => {
        llmService.generateUnified.mockResolvedValue('The adventure begins at the village gates.');

        const { result, external } = setup();

        await act(async () => {
            await result.current.handleStartAdventure();
        });

        expect(external.started).toBe(true);
        expect(result.current.error).toBeNull();
        expect(result.current.conversation.some((m) => m.role === 'ai')).toBe(true);
    });
});
