// introComposer: the authored, grounded new-game opening used by everyone.
// It must name the start town, stay grounded (no invented entities), and when the
// current milestone lives in a DIFFERENT settlement, name that destination and frame
// it as somewhere to travel to (#69).

import { composeIntro, formatStartObjective } from './introComposer';

const heroes = [{ characterName: 'Kael', characterClass: 'Fighter' }];

describe('composeIntro', () => {
    it('names the start town and reads as a grounded scene', () => {
        const settings = {
            shortDescription: 'A quiet frontier on the edge of ruin.',
            grimnessLevel: 'Grim',
            darknessLevel: 'Grey',
        };
        const text = composeIntro(settings, heroes, {
            startPlaceName: 'Millhaven',
            isTown: true,
            startSize: 'village',
            biome: 'plains',
            currentMilestone: null,
        });
        expect(text).toContain('Millhaven');
        expect(text).toContain('Kael');
        // Atmosphere from the campaign's own tone, not an invented person/place.
        expect(text).toContain('A quiet frontier on the edge of ruin.');
        expect(text.length).toBeGreaterThan(80);
    });

    it('names the DESTINATION town and frames it as travel when the milestone is elsewhere', () => {
        const settings = { campaignGoal: 'Stop the goblin raids.' };
        const milestone = {
            text: 'Seek out the militia captain',
            type: 'talk',
            spawn: { type: 'npc', name: 'Captain Ulric', role: 'Guard' },
            building: { name: 'Briarwood Militia Hall', location: 'Briarwood' },
        };
        const text = composeIntro(settings, heroes, {
            startPlaceName: 'Millhaven',
            isTown: true,
            biome: 'plains',
            currentMilestone: milestone,
        });
        // Grounded on the real objective NPC + building + destination.
        expect(text).toContain('Captain Ulric');
        expect(text).toContain('Briarwood Militia Hall');
        expect(text).toContain('Briarwood');
        expect(text).toContain('Millhaven');
        expect(text).toContain('Stop the goblin raids.');
        // Framed as travel to a different place.
        expect(text).toMatch(/travel/i);
    });

    it('does not frame travel when the objective is in the start town', () => {
        const settings = {};
        const milestone = {
            text: 'Find the hidden map',
            type: 'item',
            building: { name: 'The Great Archives', location: 'Millhaven' },
        };
        const text = composeIntro(settings, heroes, {
            startPlaceName: 'Millhaven',
            isTown: true,
            biome: 'plains',
            currentMilestone: milestone,
        });
        expect(text).toContain('The Great Archives');
        expect(text).toContain('Millhaven');
        expect(text).not.toMatch(/travel there/i);
    });

    it('references only REAL placed NPCs, never invented ones', () => {
        const text = composeIntro({}, heroes, {
            startPlaceName: 'Millhaven',
            isTown: true,
            biome: 'plains',
            currentMilestone: null,
            placedNpcs: [{ name: 'Old Bram', role: 'innkeeper' }],
        });
        expect(text).toContain('Old Bram');
        expect(text).toContain('innkeeper');
    });

    it('honors a per-campaign openingText override as the scene', () => {
        const text = composeIntro({ openingText: 'A CUSTOM AUTHORED OPENING SCENE.' }, heroes, {
            startPlaceName: 'Millhaven',
            isTown: true,
            biome: 'plains',
            currentMilestone: null,
        });
        expect(text).toContain('A CUSTOM AUTHORED OPENING SCENE.');
    });

    it('is deterministic (same inputs -> same output)', () => {
        const opts = { startPlaceName: 'Millhaven', isTown: true, biome: 'snow', currentMilestone: null };
        const a = composeIntro({ grimnessLevel: 'Bleak' }, heroes, opts);
        const b = composeIntro({ grimnessLevel: 'Bleak' }, heroes, opts);
        expect(a).toBe(b);
    });
});

describe('formatStartObjective', () => {
    it('extracts the destination from an npc/building milestone', () => {
        const { destination } = formatStartObjective({
            text: 'Speak to the captain',
            spawn: { type: 'npc', name: 'Captain Ulric', location: 'Briarwood' },
            building: { name: 'Militia Hall', location: 'Briarwood' },
        });
        expect(destination).toBe('Briarwood');
    });

    it('returns empty for no milestone', () => {
        expect(formatStartObjective(null)).toEqual({ line: '', destination: '' });
    });
});
