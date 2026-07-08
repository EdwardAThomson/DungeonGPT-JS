// Talk-milestone dual completion (feat/talk-dual-completion): the AI [COMPLETE_MILESTONE]
// marker may complete a 'talk' milestone during free-text play, but ONLY through the
// same engine event the Talk button uses (onNpcTalked -> checkMilestoneEvent), so rewards
// are identical and idempotent. This is the anti-flakiness core: the talk path fires only
// when the authored NPC is actually present in the current scene. The narrative marker path
// (findMarkerMilestoneIndex + local setSettings completion) is unchanged.

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
    { x: 0, y: 0, biome: 'plains', poi: 'town', townName: 'Briarwood', townSize: 'village' },
    { x: 1, y: 0, biome: 'plains' },
], [
    { x: 0, y: 1, biome: 'plains' },
    { x: 1, y: 1, biome: 'plains' },
]];

const heroes = [{ characterName: 'Kael', class: 'Fighter', level: 1 }];

const talkMilestone = {
    id: 1,
    text: 'Speak with Captain Ulric about the raids',
    type: 'talk',
    completed: false,
    requires: [],
    trigger: { npc: 'militia_captain', action: 'talk' },
    spawn: { type: 'npc', id: 'militia_captain', name: 'Captain Ulric', role: 'Guard' },
    building: { type: 'barracks', name: 'Briarwood Militia Hall', location: 'Briarwood' },
    rewards: { xp: 25, gold: 10, items: [] }
};

const narrativeMilestone = {
    id: 2,
    text: 'Convince the elders to evacuate the valley',
    type: 'narrative',
    completed: false,
    requires: []
};

// currentTownMap.npcs is the source presentNpcIds is derived from (their milestoneNpcId).
const townMapWithCaptain = {
    mapData: [[{ type: 'town_square' }]],
    npcs: [{ name: 'Captain Ulric', milestoneNpcId: 'militia_captain', location: { x: 0, y: 0 } }]
};
const townMapWithoutCaptain = {
    mapData: [[{ type: 'town_square' }]],
    npcs: [{ name: 'Some Baker', location: { x: 0, y: 0 } }]
};

const setup = ({ milestones, currentTownMap, onNpcTalked, setSettings }) => {
    const settings = {
        shortDescription: 'A test world',
        responseVerbosity: 'Moderate',
        milestones,
        sideQuests: []
    };
    const locationContext = currentTownMap
        ? { isInsideTown: true, currentTownTile: { townName: 'Briarwood', townSize: 'village' }, currentTownMap, townPlayerPosition: { x: 0, y: 0 } }
        : {};

    return renderHook(() => useGameInteraction(
        null,               // loadedConversation
        settings,
        setSettings,
        'cf-workers',
        'test-model',
        heroes,
        worldMap,
        { x: 0, y: 0 },
        true,               // hasAdventureStarted
        jest.fn(),          // setHasAdventureStarted
        locationContext,
        'session-1',
        true,               // aiAvailable
        onNpcTalked
    ));
};

const submitWith = async (result, text) => {
    act(() => { result.current.setUserInput(text); });
    await act(async () => {
        await result.current.handleSubmit({ preventDefault: () => {} });
    });
};

describe('talk-marker dual completion in handleSubmit', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        embedAndStore.mockResolvedValue(undefined);
        ragQuery.mockResolvedValue([]);
    });

    it('routes a present-NPC talk marker through onNpcTalked (reward parity), NOT a local setSettings completion', async () => {
        llmService.generateUnified
            .mockResolvedValueOnce('Ulric nods grimly. [COMPLETE_MILESTONE: Speak with Captain Ulric about the raids]')
            .mockResolvedValue('summary');
        const onNpcTalked = jest.fn();
        const setSettings = jest.fn();

        const { result } = setup({ milestones: [talkMilestone], currentTownMap: townMapWithCaptain, onNpcTalked, setSettings });
        await submitWith(result, 'I ask the captain about the raids');

        // Reward parity: completion routed through the engine event with the right npcId.
        expect(onNpcTalked).toHaveBeenCalledTimes(1);
        expect(onNpcTalked).toHaveBeenCalledWith('militia_captain');
        // The talk path must NOT flip completed locally (that would skip rewards).
        expect(setSettings).not.toHaveBeenCalled();
        // The marker is stripped from the displayed narration.
        const ai = result.current.conversation.filter(m => m.role === 'ai').pop();
        expect(ai.content).not.toMatch(/COMPLETE_MILESTONE/);
        expect(ai.content).toMatch(/Ulric nods grimly/);
    });

    it('ignores a talk marker when the NPC is NOT present (party elsewhere)', async () => {
        llmService.generateUnified
            .mockResolvedValueOnce('A rumour mentions Captain Ulric. [COMPLETE_MILESTONE: Speak with Captain Ulric about the raids]')
            .mockResolvedValue('summary');
        const onNpcTalked = jest.fn();
        const setSettings = jest.fn();

        const { result } = setup({ milestones: [talkMilestone], currentTownMap: townMapWithoutCaptain, onNpcTalked, setSettings });
        await submitWith(result, 'Anyone heard about the captain?');

        // NPC absent => no completion at all, but the marker is still stripped.
        expect(onNpcTalked).not.toHaveBeenCalled();
        expect(setSettings).not.toHaveBeenCalled();
        const ai = result.current.conversation.filter(m => m.role === 'ai').pop();
        expect(ai.content).not.toMatch(/COMPLETE_MILESTONE/);
    });

    it('ignores a talk marker when there is no town context (presentNpcIds empty)', async () => {
        llmService.generateUnified
            .mockResolvedValueOnce('Out in the wild. [COMPLETE_MILESTONE: Speak with Captain Ulric about the raids]')
            .mockResolvedValue('summary');
        const onNpcTalked = jest.fn();

        const { result } = setup({ milestones: [talkMilestone], currentTownMap: null, onNpcTalked, setSettings: jest.fn() });
        await submitWith(result, 'talk to the captain');

        expect(onNpcTalked).not.toHaveBeenCalled();
    });

    it('narrative marker unchanged: completes via setSettings, never via onNpcTalked', async () => {
        llmService.generateUnified
            .mockResolvedValueOnce('The elders relent at last. [COMPLETE_MILESTONE: Convince the elders to evacuate the valley]')
            .mockResolvedValue('summary');
        const onNpcTalked = jest.fn();
        const setSettings = jest.fn();

        const { result } = setup({
            milestones: [talkMilestone, narrativeMilestone],
            currentTownMap: townMapWithCaptain,
            onNpcTalked,
            setSettings
        });
        await submitWith(result, 'I plead with the elders');

        // Narrative path: local functional completion, engine talk event NOT used.
        expect(setSettings).toHaveBeenCalled();
        expect(onNpcTalked).not.toHaveBeenCalled();
        // The functional updater marks the narrative milestone (#2) complete, and leaves
        // the talk milestone (#1) untouched.
        const updater = setSettings.mock.calls[0][0];
        const next = updater({ milestones: [talkMilestone, narrativeMilestone] });
        expect(next.milestones.find(m => m.id === 2).completed).toBe(true);
        expect(next.milestones.find(m => m.id === 1).completed).toBe(false);
    });
});
