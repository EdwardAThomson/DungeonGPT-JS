// Tests for the extracted NEW-GAME campaign-start pipeline.
// The parity suite replicates the ORIGINAL NewGame.handleSubmit pipeline inline and
// asserts launchCampaign produces byte-identical results for the same seed, so the
// refactor cannot silently change what New Game generates.

import {
  launchCampaign,
  specFromTemplate,
  mergeLocationNames,
  resolveMilestoneCoords,
  mintGameSessionId,
} from './campaignLauncher';
import { storyTemplates, registerPremiumTemplates } from '../data/storyTemplates';
import { generateMapData } from '../utils/mapGenerator';
import { generateTownMap } from '../utils/townMapGenerator';
import { analyzeTownWater, getTownRoadEdges } from '../utils/townWater';
import { selectSideQuests } from './questEngine';
import { populateTown } from '../utils/npcGenerator';
import { spawnWorldMapEntities, injectQuestBuildings } from './milestoneSpawner';
import { getMilestoneNpcsForTown } from './milestoneEngine';
import { PREMIUM_DEV_OVERRIDE_KEY } from './entitlements';

const SEED = 424242;

// populateTown assigns each NPC a fresh uuidv4() id (pre-existing behavior, not
// seeded), so parity comparisons normalize those ids away; everything else in the
// pipeline is seed-deterministic.
const withoutNpcIds = (townMapsCache) => {
  const clone = JSON.parse(JSON.stringify(townMapsCache));
  Object.values(clone).forEach((tm) => {
    (tm.npcs || []).forEach((npc) => { delete npc.id; });
  });
  return clone;
};

// Verbatim copy of the pre-refactor NewGame.handleSubmit pipeline (steps 2-6 of the
// plan's section 2.1), kept as the parity oracle.
const legacyNewGamePipeline = (template, seedToUse) => {
  const milestones = template.settings.milestones || [];
  const customNames = template.customNames || { towns: [], mountains: [] };
  const worldTheme = template.settings.theme || 'grassland';
  const templateName = template.subtitle ? `${template.name} — ${template.subtitle}` : template.name;

  const mapData = generateMapData(10, 10, seedToUse, mergeLocationNames(customNames, milestones), worldTheme);

  const derivedGoal = template.settings.campaignGoal || (milestones.length > 0
    ? milestones[milestones.length - 1].text
    : '');

  const spawnResult = spawnWorldMapEntities(mapData, milestones);

  const townMapsCache = {};
  for (let y = 0; y < mapData.length; y++) {
    for (let x = 0; x < mapData[y].length; x++) {
      const tile = mapData[y][x];
      if (tile.poi === 'town' && tile.townName) {
        const townSize = tile.townSize || tile.poiType || 'village';
        const seed = parseInt(seedToUse) + (x * 1000) + (y * 10000);
        const townMapData = generateTownMap(townSize, tile.townName, getTownRoadEdges(mapData, x, y), seed, tile.hasRiver, tile.riverDirection, worldTheme, analyzeTownWater(mapData, x, y));
        if (spawnResult.requiredBuildings?.[tile.townName]) {
          injectQuestBuildings(townMapData, spawnResult.requiredBuildings[tile.townName]);
        }
        const npcs = populateTown(townMapData, seed, getMilestoneNpcsForTown(milestones, tile.townName));
        townMapData.npcs = npcs;
        townMapsCache[tile.townName] = townMapData;
      }
    }
  }

  const campaignTier = template.tier || 1;
  const campaignLevelRange = template.levelRange || (campaignTier === 1 ? [1, 2] : [3, 5]);

  const flatTiles = [].concat(...mapData);
  const availableSites = {
    cave: flatTiles.some((t) => t.poi === 'cave_entrance'),
    ruins: flatTiles.some((t) => t.poi === 'ruins'),
    forest: flatTiles.some((t) => t.poi === 'forest'),
    hills: flatTiles.some((t) => t.poi === 'hills'),
    mountain: flatTiles.some((t) => t.poi === 'mountain'),
  };
  const availableBuildings = new Set();
  Object.values(townMapsCache).forEach((tm) => {
    (tm.mapData || []).forEach((row) => row.forEach((t) => {
      if (t.type === 'building' && t.buildingType) availableBuildings.add(t.buildingType);
    }));
  });
  let sqSeed = parseInt(seedToUse) || 1;
  const sqRng = () => { sqSeed = (sqSeed * 9301 + 49297) % 233280; return sqSeed / 233280; };
  const townCount = flatTiles.filter((t) => t.poi === 'town').length;
  const sideQuestCount = Math.min(4, Math.max(2, townCount));
  const selectedSideQuests = selectSideQuests({ sites: availableSites, buildings: [...availableBuildings] }, sideQuestCount, sqRng);

  const settingsData = {
    shortDescription: template.settings.shortDescription,
    grimnessLevel: template.settings.grimnessLevel,
    darknessLevel: template.settings.darknessLevel,
    magicLevel: template.settings.magicLevel,
    technologyLevel: template.settings.technologyLevel,
    responseVerbosity: template.settings.responseVerbosity,
    campaignGoal: derivedGoal,
    milestones: resolveMilestoneCoords(milestones, mapData),
    worldSeed: seedToUse,
    theme: worldTheme,
    mapVersion: 2,
    templateName,
    tier: campaignTier,
    levelRange: campaignLevelRange,
    requiredBuildings: spawnResult.requiredBuildings,
    enemySpawns: spawnResult.enemySpawns,
    itemSpawns: spawnResult.itemSpawns,
    sideQuests: selectedSideQuests,
  };

  return { settingsData, mapData, townMapsCache };
};

describe('launchCampaign parity with the NewGame pipeline', () => {
  it.each(['heroic-fantasy-t1', 'heroic-fantasy-t2', 'grimdark-survival-t1'])(
    'produces an identical same-seed world, towns and settings for %s',
    (templateId) => {
      const template = storyTemplates.find((t) => t.id === templateId);
      expect(template).toBeTruthy();

      const legacy = legacyNewGamePipeline(template, SEED);
      const launch = launchCampaign(specFromTemplate(template), { seed: SEED });

      expect(launch.worldSeed).toBe(SEED);
      expect(launch.mapData).toEqual(legacy.mapData);
      expect(withoutNpcIds(launch.townMapsCache)).toEqual(withoutNpcIds(legacy.townMapsCache));
      // launchCampaign additionally stamps the (additive) templateId
      expect(launch.settings).toEqual({ ...legacy.settingsData, templateId });
    }
  );

  it('is reproducible: two same-seed launches generate identical worlds', () => {
    const template = storyTemplates.find((t) => t.id === 'heroic-fantasy-t1');
    const a = launchCampaign(specFromTemplate(template), { seed: SEED });
    const b = launchCampaign(specFromTemplate(template), { seed: SEED });
    expect(a.mapData).toEqual(b.mapData);
    expect(withoutNpcIds(a.townMapsCache)).toEqual(withoutNpcIds(b.townMapsCache));
    expect(a.settings).toEqual(b.settings);
  });

  it('mints distinct game session ids per launch', () => {
    const a = mintGameSessionId();
    const b = mintGameSessionId();
    expect(a).toMatch(/^game-\d+-/);
    expect(a).not.toBe(b);
  });

  it('respects a pre-generated map instead of regenerating', () => {
    const template = storyTemplates.find((t) => t.id === 'heroic-fantasy-t1');
    const spec = specFromTemplate(template);
    const preBuilt = generateMapData(10, 10, SEED, mergeLocationNames(spec.customNames, spec.milestones), spec.worldTheme);
    const launch = launchCampaign(spec, { seed: SEED, mapData: preBuilt });
    expect(launch.mapData).toBe(preBuilt);
  });
});

describe('premium backstop', () => {
  afterEach(() => localStorage.removeItem(PREMIUM_DEV_OVERRIDE_KEY));

  it('refuses to launch a premium template for a free user', () => {
    const desert = storyTemplates.find((t) => t.id === 'desert-expedition-t1');
    expect(() => launchCampaign(specFromTemplate(desert), { seed: SEED })).toThrow(/Premium/);
  });

  it('launches a premium template once premium is unlocked', () => {
    localStorage.setItem(PREMIUM_DEV_OVERRIDE_KEY, 'true');
    const desert = storyTemplates.find((t) => t.id === 'desert-expedition-t1');
    expect(() => launchCampaign(specFromTemplate(desert), { seed: SEED })).not.toThrow();
  });
});

// #72: tier-2/3 templates are now selectable on New Game, always launching as a
// FRESH world through this same pipeline (the in-save chaining path is separate,
// see campaignChain.js). These pin that higher-tier launches place their authored
// geography and stamp tier/levelRange correctly.
describe('higher-tier launches from New Game (#72)', () => {
  afterEach(() => localStorage.removeItem(PREMIUM_DEV_OVERRIDE_KEY));

  const nameOf = (e) => (typeof e === 'string' ? e : e.name);
  const townsOnMap = (mapData) => {
    const names = new Set();
    mapData.forEach((row) => row.forEach((t) => { if (t.poi === 'town' && t.townName) names.add(t.townName); }));
    return names;
  };
  const mountainsOnMap = (mapData) => {
    const names = new Set();
    mapData.forEach((row) => row.forEach((t) => { if (t.mountainName) names.add(t.mountainName); }));
    return names;
  };

  it('launches a free t2 as a fresh world with its authored geography and band', () => {
    const t2 = storyTemplates.find((t) => t.id === 'heroic-fantasy-t2');
    const launch = launchCampaign(specFromTemplate(t2), { seed: SEED });
    expect(launch.settings.tier).toBe(2);
    expect(launch.settings.levelRange).toEqual([3, 5]);
    const towns = townsOnMap(launch.mapData);
    t2.customNames.towns.map(nameOf).forEach((n) => expect(towns.has(n)).toBe(true));
    // Milestones authored in towns resolve to coordinates on the fresh map.
    launch.settings.milestones
      .filter((m) => m.location && towns.has(m.location))
      .forEach((m) => {
        expect(typeof m.mapX).toBe('number');
        expect(typeof m.mapY).toBe('number');
      });
  });

  it('launches a premium t2 (desert) once unlocked, with theme and geography intact', () => {
    localStorage.setItem(PREMIUM_DEV_OVERRIDE_KEY, 'true');
    const t2 = storyTemplates.find((t) => t.id === 'desert-expedition-t2');
    const launch = launchCampaign(specFromTemplate(t2), { seed: SEED });
    expect(launch.settings.tier).toBe(2);
    expect(launch.settings.theme).toBe('desert');
    const towns = townsOnMap(launch.mapData);
    t2.customNames.towns.map(nameOf).forEach((n) => expect(towns.has(n)).toBe(true));
  });

  // A tier-3 flagship as the server delivers it (#40): registered at runtime,
  // premium-flagged, carrying its own customNames. Built by re-skinning the real
  // heroic-fantasy-t2 authoring onto new geography so every milestone shape is
  // production-real.
  const makeDeliveredT3 = () => {
    const base = storyTemplates.find((t) => t.id === 'heroic-fantasy-t2');
    const renames = [
      ['Willowdale', 'Bellhaven'],
      ['Briarwood', 'Tidemoor'],
      ['Thornfield', 'Saltmarsh'],
      ['Millhaven', 'Drownedgate'],
      ['Greenridge Hills', 'The Sunken Reach'],
    ];
    let json = JSON.stringify(base);
    renames.forEach(([from, to]) => { json = json.split(from).join(to); });
    return {
      ...JSON.parse(json),
      id: 'test-delivered-t3',
      tier: 3,
      levelRange: [5, 7],
      premium: true,
      subtitle: 'Test Flagship',
    };
  };

  it('launches a runtime-registered t3 with premium customNames placed on a fresh world', () => {
    localStorage.setItem(PREMIUM_DEV_OVERRIDE_KEY, 'true');
    const catalog = storyTemplates.map((t) => ({ ...t }));
    registerPremiumTemplates([makeDeliveredT3()], catalog);
    const t3 = catalog.find((t) => t.id === 'test-delivered-t3');
    expect(t3).toBeDefined();

    const launch = launchCampaign(specFromTemplate(t3), { seed: SEED });
    expect(launch.settings.tier).toBe(3);
    expect(launch.settings.levelRange).toEqual([5, 7]);
    expect(launch.settings.templateId).toBe('test-delivered-t3');

    const towns = townsOnMap(launch.mapData);
    ['Bellhaven', 'Tidemoor', 'Saltmarsh', 'Drownedgate'].forEach((n) => expect(towns.has(n)).toBe(true));
    expect(mountainsOnMap(launch.mapData).has('The Sunken Reach')).toBe(true);

    // Its towns are pre-generated with the quest buildings baked in, like any launch.
    ['Bellhaven', 'Tidemoor', 'Saltmarsh', 'Drownedgate'].forEach((n) => {
      expect(launch.townMapsCache[n]).toBeDefined();
    });
    launch.settings.milestones
      .filter((m) => m.location && towns.has(m.location))
      .forEach((m) => expect(typeof m.mapX).toBe('number'));
  });

  it('refuses the delivered premium t3 for a free user (backstop intact)', () => {
    const t3 = makeDeliveredT3();
    expect(() => launchCampaign(specFromTemplate(t3), { seed: SEED })).toThrow(/Premium/);
  });
});

describe('back-compat: a plain new game carries no chain fields', () => {
  it('adds no chain/completedCampaigns/saveName to fresh settings', () => {
    const template = storyTemplates.find((t) => t.id === 'heroic-fantasy-t2');
    const launch = launchCampaign(specFromTemplate(template), { seed: SEED });
    expect(launch.settings.chain).toBeUndefined();
    expect(launch.settings.completedCampaigns).toBeUndefined();
    expect(launch.settings.currentChapter).toBeUndefined();
    expect(launch.settings.saveName).toBeUndefined();
  });
});
