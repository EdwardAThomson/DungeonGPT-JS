import {
    getMilestoneStatus, formatMilestonePromptText, formatSideQuestPromptText,
    buildLocationContext, buildNpcRoster,
} from './turnContext';

const townCtx = (npcs, pos = { x: 1, y: 1 }) => ({
    isInsideTown: true,
    currentTownTile: { townName: 'Oakvale', townSize: 'village' },
    currentTownMap: {
        mapData: [[{ type: 'grass' }, { type: 'grass' }], [{ type: 'grass' }, { type: 'building', buildingName: 'The Gilded Goose' }]],
        npcs,
    },
    townPlayerPosition: pos,
});

const npcs = [
    { id: 'u1', name: 'Roswyn', job: 'Innkeeper', location: { x: 1, y: 1 }, personality: 'warm' },
    { id: 'u2', name: 'Captain Ulric', title: 'Captain', milestoneNpcId: 'ulric', milestoneId: 2, location: { x: 0, y: 0 } },
    { name: 'No Id' },
];

describe('turnContext', () => {
    test('milestone status splits active/locked and grounds talk NPCs', () => {
        const status = getMilestoneStatus([
            { id: 1, text: 'Meet the captain', type: 'talk', completed: false, requires: [],
              spawn: { type: 'npc', name: 'Captain Ulric', role: 'Guard' }, building: { name: 'Barracks' } },
            { id: 2, text: 'Slay the beast', type: 'combat', completed: false, requires: [1] },
        ]);
        expect(status.active.map(m => m.id)).toEqual([1]);
        expect(status.locked.map(m => m.id)).toEqual([2]);
        const text = formatMilestonePromptText(status);
        expect(text).toContain('Active Milestones: Meet the captain [talk] — speak with Captain Ulric (Guard) at Barracks');
        expect(text).toContain('Locked (prerequisites not met): Slay the beast');
    });

    test('legacy string milestones are normalised', () => {
        expect(getMilestoneStatus(['Find the relic']).active[0]).toMatchObject({ id: 1, text: 'Find the relic' });
    });

    test('side quests: only active ones, empty when none', () => {
        expect(formatSideQuestPromptText([])).toBe('');
        expect(formatSideQuestPromptText([{ title: 'Herbs', status: 'done', milestones: [] }])).toBe('');
    });

    test('town location names the building and the placed NPCs', () => {
        const info = buildLocationContext({ biome: 'plains' }, { x: 0, y: 0 }, townCtx(npcs), null);
        expect(info).toContain('INSIDE Oakvale, a village. They are at The Gilded Goose.');
        expect(info).toContain('Present here: Roswyn (Innkeeper) — warm.');
        expect(info).toContain('Notable townsfolk: Captain Ulric (Captain)');
    });

    test('world location lists named landmarks', () => {
        const worldMap = [[{ biome: 'plains' }, { poi: 'town', townName: 'Brindle', townSize: 'town' }]];
        const info = buildLocationContext(worldMap[0][0], { x: 0, y: 0 }, { isInsideTown: false }, worldMap);
        expect(info).toBe('The party is traveling through plains terrain. Landmarks: Brindle (town) (nearby, to the east).');
    });

    test('buildNpcRoster exposes persisted ids, presence and milestone links', () => {
        expect(buildNpcRoster(townCtx(npcs))).toEqual([
            { id: 'u1', name: 'Roswyn', role: 'Innkeeper', here: true },
            { id: 'u2', name: 'Captain Ulric', role: 'Captain', here: false, milestoneNpcId: 'ulric', milestoneId: 2 },
        ]);
    });

    test('buildNpcRoster is empty outside a town or with no npcs', () => {
        expect(buildNpcRoster({ isInsideTown: false })).toEqual([]);
        expect(buildNpcRoster(townCtx(undefined))).toEqual([]);
        expect(buildNpcRoster(undefined)).toEqual([]);
    });
});
