// campaignLauncher.js
// The NEW-GAME campaign-start pipeline, extracted from NewGame's handleSubmit so
// it is testable in isolation. Given a campaign spec (from a story template or
// the New Game form) it: merges milestone location names into customNames,
// generates the world map, spawns milestone entities, pre-generates every town
// map (quest buildings + NPCs baked in), picks map-valid side quests, and
// assembles the game_settings snapshot.
//
// In-save continuation ("Continue your legend") does NOT use this pipeline; it
// spawns additively into the existing world instead (see campaignChain.js).
//
// Pure-ish: deterministic given a seed (map/town/NPC/side-quest generation are all
// seeded); the only non-deterministic pieces are the fallback random seed and the
// minted gameSessionId, both overridable via options for tests.
//
// See docs/QUEST_CHAINING_PLAN.md for the design.

import { generateMapData } from '../utils/mapGenerator';
import { generateTownMap } from '../utils/townMapGenerator';
import { analyzeTownWater, getTownRoadEdges } from '../utils/townWater';
import { selectSideQuests } from './questEngine';
import { populateTown } from '../utils/npcGenerator';
import { spawnWorldMapEntities, injectQuestBuildings } from './milestoneSpawner';
import { getMilestoneLocationNames, getMilestoneNpcsForTown } from './milestoneEngine';
import { isPremium, isThemePremium, isTemplatePremium } from './entitlements';
import { createLogger } from '../utils/logger';

const logger = createLogger('campaign-launcher');

// Merge milestone location names into customNames so the map generator places them.
// (Moved verbatim from NewGame.js.)
export const mergeLocationNames = (customNames, milestones) => {
    const milestoneNames = getMilestoneLocationNames(milestones);
    const towns = [...(customNames?.towns || [])];
    const mountains = [...(customNames?.mountains || [])];
    // Town entries may be plain strings or { name, size } objects (size-tagged locations).
    const nameOf = (entry) => (typeof entry === 'string' ? entry : entry?.name || '');

    for (const name of milestoneNames.towns) {
        if (!towns.some(t => nameOf(t).toLowerCase() === name.toLowerCase())) towns.push(name);
    }
    for (const name of milestoneNames.mountains) {
        if (!mountains.some(m => nameOf(m).toLowerCase() === name.toLowerCase())) mountains.push(name);
    }

    return { towns, mountains };
};

// Resolve milestone location names to map coordinates by matching town and mountain
// names. (Moved verbatim from NewGame.js.)
export const resolveMilestoneCoords = (milestones, mapData) => {
    if (!milestones || !mapData) return milestones;

    // Build a lookup of named locations -> coordinates from the map
    const locationLookup = {};
    for (let y = 0; y < mapData.length; y++) {
        for (let x = 0; x < mapData[y].length; x++) {
            const tile = mapData[y][x];
            if (tile.poi === 'town' && tile.townName) {
                locationLookup[tile.townName.toLowerCase()] = { x, y };
            }
            // For mountains, store the first tile found for each range name
            if (tile.poi === 'mountain' && tile.mountainName) {
                const key = tile.mountainName.toLowerCase();
                if (!locationLookup[key]) {
                    locationLookup[key] = { x, y };
                }
            }
        }
    }

    return milestones
        .filter(m => m.text && m.text.trim())
        .map(m => {
            const resolved = { ...m };
            if (m.location) {
                const coords = locationLookup[m.location.toLowerCase()];
                if (coords) {
                    resolved.mapX = coords.x;
                    resolved.mapY = coords.y;
                }
            }
            return resolved;
        });
};

// New game session ids everywhere use this format (NewGame, useGameSession fallback).
export const mintGameSessionId = () =>
    `game-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

// Build a launch spec from a story template (mirrors NewGame's applyTemplate +
// handleSubmit derivations, so chaining launches the exact campaign New Game would).
export const specFromTemplate = (template) => ({
    templateId: template.id,
    templateName: template.subtitle ? `${template.name} — ${template.subtitle}` : template.name,
    shortDescription: template.settings.shortDescription,
    grimnessLevel: template.settings.grimnessLevel,
    darknessLevel: template.settings.darknessLevel,
    magicLevel: template.settings.magicLevel,
    technologyLevel: template.settings.technologyLevel,
    responseVerbosity: template.settings.responseVerbosity,
    campaignGoal: template.settings.campaignGoal || '',
    milestones: template.settings.milestones || [],
    customNames: template.customNames || { towns: [], mountains: [] },
    worldTheme: template.settings.theme || 'grassland',
    tier: template.tier || 1,
    levelRange: template.levelRange || null,
    premium: isTemplatePremium(template),
});

/**
 * Run the full campaign-start pipeline.
 *
 * @param {object} spec - campaign spec (see specFromTemplate; New Game builds one
 *   from its form state): { templateId?, templateName, shortDescription,
 *   grimnessLevel, darknessLevel, magicLevel, technologyLevel, responseVerbosity,
 *   campaignGoal, milestones, customNames, worldTheme, tier, levelRange, premium }
 * @param {object} [options]
 * @param {number|string} [options.seed] - world seed (random when omitted)
 * @param {Array} [options.mapData] - pre-generated map (New Game's manual preview)
 * @param {string} [options.gameSessionId] - session id override (tests)
 * @returns {{ settings, mapData, townMapsCache, worldSeed, gameSessionId }}
 */
export const launchCampaign = (spec, options = {}) => {
    const {
        seed = null,
        mapData: providedMap = null,
        gameSessionId = null,
    } = options;

    // Premium backstop: every path that can start a campaign must hold this gate,
    // not just the New Game screen (which shows a friendlier message first).
    if (!isPremium() && (spec.premium === true || isThemePremium(spec.worldTheme))) {
        throw new Error('This is a Premium adventure. Premium unlock is coming soon — pick a free adventure to begin.');
    }

    const milestones = spec.milestones || [];
    const worldTheme = spec.worldTheme || 'grassland';
    const customNames = spec.customNames || { towns: [], mountains: [] };

    const seedToUse = seed || Math.floor(Math.random() * 1000000);
    const mapData = providedMap
        || generateMapData(10, 10, seedToUse, mergeLocationNames(customNames, milestones), worldTheme);

    // Spawn milestone entities onto the world map before resolving coords
    const spawnResult = spawnWorldMapEntities(mapData, milestones);

    // Pre-generate all town maps so saves are never affected by generator changes
    const townMapsCache = {};
    for (let y = 0; y < mapData.length; y++) {
        for (let x = 0; x < mapData[y].length; x++) {
            const tile = mapData[y][x];
            if (tile.poi === 'town' && tile.townName) {
                const townSize = tile.townSize || tile.poiType || 'village';
                const townSeed = parseInt(seedToUse) + (x * 1000) + (y * 10000);
                const townMapData = generateTownMap(townSize, tile.townName, getTownRoadEdges(mapData, x, y), townSeed, tile.hasRiver, tile.riverDirection, worldTheme, analyzeTownWater(mapData, x, y));

                // Inject quest buildings if needed
                if (spawnResult.requiredBuildings?.[tile.townName]) {
                    injectQuestBuildings(townMapData, spawnResult.requiredBuildings[tile.townName]);
                }

                // Populate town with NPCs (canonical milestone NPCs replace procedural staff)
                const npcs = populateTown(townMapData, townSeed, getMilestoneNpcsForTown(milestones, tile.townName));
                townMapData.npcs = npcs;

                townMapsCache[tile.townName] = townMapData;
                logger.debug(`Pre-generated town map: ${tile.townName} (${townSize})`);
            }
        }
    }

    const campaignTier = spec.tier || 1;
    const campaignLevelRange = spec.levelRange || (campaignTier === 1 ? [1, 2] : [3, 5]);

    // Pick side quests that can be both STARTED and COMPLETED on this map: only quests
    // whose giver building + objective site + turn-in building all exist. Seeded off the
    // world seed so a given world reproducibly offers the same side quests.
    const flatTiles = [].concat(...mapData);
    const availableSites = {
        cave: flatTiles.some((t) => t.poi === 'cave_entrance'),
        ruins: flatTiles.some((t) => t.poi === 'ruins'),
    };
    const availableBuildings = new Set();
    Object.values(townMapsCache).forEach((tm) => {
        (tm.mapData || []).forEach((row) => row.forEach((t) => {
            if (t.type === 'building' && t.buildingType) availableBuildings.add(t.buildingType);
        }));
    });
    let sqSeed = parseInt(seedToUse) || 1;
    const sqRng = () => { sqSeed = (sqSeed * 9301 + 49297) % 233280; return sqSeed / 233280; };
    // Scale the number of side quests to the map (≈1 per town, 2–4).
    const townCount = flatTiles.filter((t) => t.poi === 'town').length;
    const sideQuestCount = Math.min(4, Math.max(2, townCount));
    const selectedSideQuests = selectSideQuests({ sites: availableSites, buildings: [...availableBuildings] }, sideQuestCount, sqRng);

    // Derive campaignGoal from the final milestone if not explicitly set
    const derivedGoal = spec.campaignGoal || (milestones.length > 0
        ? milestones[milestones.length - 1].text
        : '');

    const settings = {
        shortDescription: spec.shortDescription,
        grimnessLevel: spec.grimnessLevel,
        darknessLevel: spec.darknessLevel,
        magicLevel: spec.magicLevel,
        technologyLevel: spec.technologyLevel,
        responseVerbosity: spec.responseVerbosity,
        campaignGoal: derivedGoal,
        milestones: resolveMilestoneCoords(milestones, mapData),
        worldSeed: seedToUse,
        // Biome theme + map-format version travel with the save (the map itself is a bare
        // 2D array, so version/theme live on game_settings — see WORLD_BIOME_PLAN / CLAUDE.md).
        theme: worldTheme,
        mapVersion: 2,
        templateName: spec.templateName,
        tier: campaignTier,
        levelRange: campaignLevelRange,
        requiredBuildings: spawnResult.requiredBuildings,
        enemySpawns: spawnResult.enemySpawns,
        itemSpawns: spawnResult.itemSpawns,
        sideQuests: selectedSideQuests
    };
    // Additive: template id enables clean chain records (completedCampaigns) later.
    if (spec.templateId) settings.templateId = spec.templateId;

    return {
        settings,
        mapData,
        townMapsCache,
        worldSeed: seedToUse,
        gameSessionId: gameSessionId || mintGameSessionId(),
    };
};
