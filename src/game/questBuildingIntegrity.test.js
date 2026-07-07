// Quest-building integrity: every building-typed milestone must land its venue in
// the correct town for EVERY launch path New Game can take (playtest 2026-07-07:
// frozen-frontier-t1's "The Hearthmere Trading Post" never existed because the
// player launched with a STALE preview map that had no Hearthmere on it; NewGame
// hands `generatedMap` to launchCampaign verbatim, and applyTemplate never
// invalidated a preview built under different customNames/theme).
//
// Three layers:
//  1. The exact playtest repro: stale preview map + frozen-frontier-t1 must still
//     produce the trading post (launchCampaign discards a map that cannot host the
//     campaign and regenerates).
//  2. A seed-invariant sweep of ALL launchable templates' building milestones, on
//     both the fresh-map path and the stale-preview path.
//  3. The server-delivered mechanism (registerPremiumTemplates + specFromTemplate,
//     authored venue names like tidewater's) flows through the same guarantee.

import { launchCampaign, specFromTemplate, mergeLocationNames } from './campaignLauncher';
import { storyTemplates, registerPremiumTemplates } from '../data/storyTemplates';
import { generateMapData } from '../utils/mapGenerator';
import { findMissingMilestoneLocations } from './milestoneSpawner';
import { isQuestItemSearchable } from './milestoneEngine';
import { PREMIUM_DEV_OVERRIDE_KEY } from './entitlements';

jest.mock('../utils/logger', () => ({
    createLogger: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
}));

const SEEDS = [11, 424242, 987654];

// A preview map generated from New Game's DEFAULT form state (no template applied:
// empty customNames, grassland theme, no milestones) — exactly what handleSubmit
// passes as options.mapData when the player previewed a world BEFORE picking a card.
const stalePreviewMap = (seed) =>
    generateMapData(10, 10, seed, mergeLocationNames({ towns: [], mountains: [] }, []), 'grassland');

const buildingMilestones = (tpl) =>
    (tpl.settings?.milestones || []).filter((m) => m.building && m.building.location);

const launchableTemplates = () =>
    storyTemplates.filter((t) => t.settings?.milestones?.length && !t.teaser && !t.comingSoon);

// The tile the player can walk onto and open in BuildingModal.
const findQuestBuildingTile = (townMap, name) =>
    [].concat(...(townMap?.mapData || [])).find(
        (t) => t.type === 'building' && t.buildingName === name && t.questBuilding === true
    );

const worldHasLocation = (mapData, name) => {
    const target = name.toLowerCase();
    return [].concat(...mapData).some(
        (t) => (t.townName && t.townName.toLowerCase() === target)
            || (t.mountainName && t.mountainName.toLowerCase() === target)
    );
};

// Assert every building milestone of a launched campaign is present + interactable.
const expectQuestBuildingsIntact = (tpl, launch, label) => {
    for (const m of buildingMilestones(tpl)) {
        const where = `${tpl.id} milestone ${m.id} (${label})`;
        expect({ where, townOnMap: worldHasLocation(launch.mapData, m.building.location) })
            .toEqual({ where, townOnMap: true });
        const townMap = launch.townMapsCache[m.building.location];
        expect({ where, townCached: !!townMap }).toEqual({ where, townCached: true });
        const tile = findQuestBuildingTile(townMap, m.building.name);
        expect({ where, building: tile ? tile.buildingName : null })
            .toEqual({ where, building: m.building.name });
        // Interactable: it is a real building tile (town click handler lets the party
        // enter `type === 'building'` tiles), and for item milestones the BuildingModal
        // search action must be live (questItemId stamped + searchable).
        expect(tile.type).toBe('building');
        if (m.type === 'item' && m.trigger?.item) {
            expect(tile.questItemId).toBe(m.trigger.item);
            expect(isQuestItemSearchable(launch.settings.milestones, tile.questItemId)).toBe(true);
        }
    }
};

describe('quest-building integrity across launch paths', () => {
    beforeAll(() => localStorage.setItem(PREMIUM_DEV_OVERRIDE_KEY, 'true'));
    afterAll(() => localStorage.removeItem(PREMIUM_DEV_OVERRIDE_KEY));

    it('playtest repro: frozen-frontier-t1 launched over a stale preview map still has The Hearthmere Trading Post', () => {
        const tpl = storyTemplates.find((t) => t.id === 'frozen-frontier-t1');
        const seed = 424242;
        const stale = stalePreviewMap(seed);
        // Sanity: the stale preview genuinely lacks the milestone town (that is the bug's trigger).
        expect(worldHasLocation(stale, 'Hearthmere')).toBe(false);

        const launch = launchCampaign(specFromTemplate(tpl), { seed, mapData: stale, gameSessionId: 'e2e' });

        expectQuestBuildingsIntact(tpl, launch, 'stale-preview');
        // The regenerated world is the campaign's world: snow biome, milestone coords resolved.
        expect(worldHasLocation(launch.mapData, 'Hearthmere')).toBe(true);
        const m1 = launch.settings.milestones.find((m) => m.id === 1);
        expect(typeof m1.mapX).toBe('number');
        expect(typeof m1.mapY).toBe('number');
    });

    it('seed-invariant sweep: every launchable template keeps its quest buildings on fresh AND stale-preview launches', () => {
        for (const tpl of launchableTemplates()) {
            if (buildingMilestones(tpl).length === 0) continue;
            const spec = specFromTemplate(tpl);
            for (const seed of SEEDS) {
                const fresh = launchCampaign(spec, { seed, gameSessionId: 'x' });
                expectQuestBuildingsIntact(tpl, fresh, `fresh seed ${seed}`);

                const stale = launchCampaign(spec, { seed, mapData: stalePreviewMap(seed), gameSessionId: 'x' });
                expectQuestBuildingsIntact(tpl, stale, `stale-preview seed ${seed}`);
            }
        }
    });

    it('a valid preview map (built AFTER applying the template) is kept, not regenerated', () => {
        const tpl = storyTemplates.find((t) => t.id === 'frozen-frontier-t1');
        const spec = specFromTemplate(tpl);
        const seed = 424242;
        // What NewGame's Generate World Map builds once the template is applied.
        const preview = generateMapData(10, 10, seed, mergeLocationNames(spec.customNames, spec.milestones), spec.worldTheme);
        expect(findMissingMilestoneLocations(preview, spec.milestones)).toEqual([]);
        const launch = launchCampaign(spec, { seed, mapData: preview, gameSessionId: 'x' });
        // Same array instance: the player's previewed world IS the world they start in.
        expect(launch.mapData).toBe(preview);
        expectQuestBuildingsIntact(tpl, launch, 'valid-preview');
    });

    it('server-delivered template mechanism (authored venue names) gets the same guarantee', () => {
        // A tidewater-shaped delivered template: authored venue names, a building type
        // no village roster carries, registered at runtime like premiumContentApi does.
        const delivered = {
            id: 'delivered-integrity-test-t1',
            theme: 'tidewater',
            tier: 1,
            levelRange: [1, 2],
            premium: true,
            name: 'Delivered Integrity',
            subtitle: 'Test Chapter',
            customNames: { towns: [{ name: 'Gullwash', size: 'village' }, 'Eelford'], mountains: [] },
            settings: {
                theme: 'grassland',
                shortDescription: 'Delivered-template integrity check.',
                campaignGoal: 'Recover the barnacled bell fragment.',
                milestones: [
                    {
                        id: 1,
                        text: 'Recover the bell fragment from the Gullwash fishmarket',
                        location: 'Gullwash',
                        type: 'item',
                        requires: [],
                        trigger: { item: 'bell_fragment', action: 'acquire' },
                        spawn: { type: 'item', id: 'bell_fragment', name: 'Barnacled Bell Fragment', location: 'Gullwash' },
                        building: { type: 'fishmarket', name: 'The Gullwash Fishmarket', location: 'Gullwash' },
                        rewards: { xp: 25, gold: '1d6', items: [] },
                        minLevel: null
                    }
                ],
                grimnessLevel: 'Neutral',
                darknessLevel: 'Grey',
                magicLevel: 'Low Magic',
                technologyLevel: 'Medieval',
                responseVerbosity: 'Descriptive'
            }
        };
        const registry = registerPremiumTemplates([delivered], []);
        const tpl = registry.find((t) => t.id === delivered.id);
        expect(tpl).toBe(delivered);

        for (const seed of SEEDS) {
            const fresh = launchCampaign(specFromTemplate(tpl), { seed, gameSessionId: 'x' });
            expectQuestBuildingsIntact(tpl, fresh, `delivered fresh seed ${seed}`);
            const stale = launchCampaign(specFromTemplate(tpl), { seed, mapData: stalePreviewMap(seed), gameSessionId: 'x' });
            expectQuestBuildingsIntact(tpl, stale, `delivered stale-preview seed ${seed}`);
        }
    });
});
