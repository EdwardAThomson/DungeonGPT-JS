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
import { storyTemplates } from '../data/storyTemplates';
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
