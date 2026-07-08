// Opening rework (2026-07-08): the new-game opening is now AUTHORED and grounded for
// EVERYONE (composeIntro), with only a tightly-bounded LLM POLISH pass for signed-in
// players. The model rewords authored text; it never composes a scene, so it cannot
// invent a chaseable figure. On any polish failure/empty/dropped-fact the start falls
// back to the authored opening verbatim, so the opening is always grounded and the
// start always succeeds. Guests get the authored opening verbatim with no AI call.

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

const heroes = [{ characterName: 'Kael', characterClass: 'Fighter', level: 1 }];

// A milestone whose destination is a DIFFERENT settlement than the start (Millhaven),
// so the authored opening names Briarwood and frames it as travel.
const crossTownMilestone = {
    id: 1,
    text: 'Seek out the militia captain',
    type: 'talk',
    completed: false,
    spawn: { type: 'npc', name: 'Captain Ulric', role: 'Guard' },
    building: { name: 'Briarwood Militia Hall', location: 'Briarwood' },
};

const baseSettings = { shortDescription: 'A test world', responseVerbosity: 'Moderate', milestones: [], sideQuests: [] };

// Drive the hook the way Game.js does: hasAdventureStarted lives OUTSIDE the hook.
const setup = ({ settings = baseSettings, aiAvailable = true } = {}) => {
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
            aiAvailable
        ),
        { initialProps: { started: external.started } }
    );
    return { ...hook, external, setHasAdventureStarted };
};

const aiMessages = (result) => result.current.conversation.filter((m) => m.role === 'ai');

describe('handleStartAdventure — authored opening + bounded polish', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        embedAndStore.mockResolvedValue(undefined);
        ragQuery.mockResolvedValue([]);
    });

    it('guests get the authored opening verbatim with NO AI call', async () => {
        const { result, external } = setup({ aiAvailable: false });

        await act(async () => {
            await result.current.handleStartAdventure();
        });

        expect(llmService.generateUnified).not.toHaveBeenCalled();
        expect(external.started).toBe(true);
        const msgs = aiMessages(result);
        expect(msgs.length).toBe(1);
        // Grounded on the real start town, plus the guest sign-in nudge.
        expect(msgs[0].content).toContain('Millhaven');
        expect(msgs[0].content).toMatch(/Sign in/i);
    });

    it('uses a SAFE polished opening when the model only rewords (keeps grounded names)', async () => {
        const settings = { ...baseSettings, milestones: [crossTownMilestone] };
        // A full reword of comparable length that still contains Millhaven + Briarwood.
        llmService.generateUnified.mockResolvedValue(
            'Kael and the party come within sight of Millhaven at last, a small village ringed by open grassland where the wind never quite settles. Their true road runs onward: Captain Ulric of the Guard waits at the Briarwood Militia Hall, and Briarwood lies well beyond Millhaven, so they must travel there once they are ready to set out.'
        );

        const { result, external } = setup({ settings });

        await act(async () => {
            await result.current.handleStartAdventure();
        });

        expect(external.started).toBe(true);
        const msgs = aiMessages(result);
        expect(msgs[0].content).toContain('Millhaven');
        expect(msgs[0].content).toContain('Briarwood');
        // Polish was attempted (plus a summarize call).
        expect(llmService.generateUnified).toHaveBeenCalled();
    });

    it('falls back to authored verbatim when the polish pass THROWS', async () => {
        const settings = { ...baseSettings, milestones: [crossTownMilestone] };
        llmService.generateUnified.mockRejectedValue(new Error('Request failed with status 400'));

        const { result, external } = setup({ settings });

        await act(async () => {
            await result.current.handleStartAdventure();
        });

        // The start SUCCEEDS on authored text despite the AI failure.
        expect(external.started).toBe(true);
        expect(result.current.error).toBeNull();
        const msgs = aiMessages(result);
        expect(msgs.length).toBe(1);
        // Authored opening is grounded: start town + destination both named.
        expect(msgs[0].content).toContain('Millhaven');
        expect(msgs[0].content).toContain('Briarwood');
    });

    it('falls back to authored verbatim when the polish pass returns EMPTY', async () => {
        const settings = { ...baseSettings, milestones: [crossTownMilestone] };
        llmService.generateUnified.mockResolvedValue('   ');

        const { result, external } = setup({ settings });

        await act(async () => {
            await result.current.handleStartAdventure();
        });

        expect(external.started).toBe(true);
        const msgs = aiMessages(result);
        expect(msgs[0].content).toContain('Millhaven');
        expect(msgs[0].content).toContain('Briarwood');
    });

    it('falls back to authored verbatim when the polish DROPS the destination name', async () => {
        const settings = { ...baseSettings, milestones: [crossTownMilestone] };
        // Comparable length, keeps Millhaven, but silently DROPS Briarwood -> must reject.
        llmService.generateUnified.mockResolvedValue(
            'The party arrives in Millhaven under a grey and heavy sky, weary from the long road behind them. The little village is quiet, its folk wary of strangers, and the way ahead feels uncertain as they gather themselves and consider where the next steps of their journey might carry them from this place.'
        );

        const { result, external } = setup({ settings });

        await act(async () => {
            await result.current.handleStartAdventure();
        });

        expect(external.started).toBe(true);
        const msgs = aiMessages(result);
        // Rejected polish -> authored text, which DOES name Briarwood.
        expect(msgs[0].content).toContain('Briarwood');
    });

    it('a successful start flips the started state true', async () => {
        llmService.generateUnified.mockResolvedValue('The party arrives in Millhaven, ready to begin.');

        const { result, external } = setup();

        await act(async () => {
            await result.current.handleStartAdventure();
        });

        expect(external.started).toBe(true);
        expect(result.current.error).toBeNull();
        expect(aiMessages(result).length).toBe(1);
    });
});
