// Tests for the extracted campaign-start pipeline (quest chaining Phase 1).
// The parity suite replicates the ORIGINAL NewGame.handleSubmit pipeline inline and
// asserts launchCampaign produces byte-identical results for the same seed, so the
// refactor cannot silently change what New Game generates.

import {
  launchCampaign,
  specFromTemplate,
  mergeLocationNames,
  resolveMilestoneCoords,
  carryParty,
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

  it('mints distinct game session ids per launch (fresh RAG index per chapter)', () => {
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

describe('carryParty invariants (party carries everything, healed)', () => {
  const sourceParty = () => ([
    {
      heroId: 'h1',
      heroName: 'Vanya',
      characterClass: 'Warrior',
      level: 3,
      xp: 350,
      gold: 77,
      maxHP: 24,
      currentHP: 3,
      isDefeated: false,
      stats: { Strength: 14, Constitution: 12 },
      inventory: [{ key: 'sword', name: 'Sword', quantity: 1 }, { key: 'potion', name: 'Potion', quantity: 2 }],
      equipment: { weapon: { key: 'sword', name: 'Sword' } },
    },
    {
      heroId: 'h2',
      heroName: 'Orin',
      characterClass: 'Mage',
      level: 2,
      xp: 180,
      gold: 12,
      maxHP: 14,
      currentHP: 0,
      isDefeated: true,
      stats: { Intelligence: 16, Constitution: 10 },
      inventory: [],
      equipment: {},
    },
  ]);

  it('heals everyone to full and clears defeat', () => {
    const carried = carryParty(sourceParty());
    expect(carried).toHaveLength(2);
    carried.forEach((hero) => {
      expect(hero.currentHP).toBe(hero.maxHP);
      expect(hero.maxHP).toBeGreaterThan(0);
      expect(hero.isDefeated).toBe(false);
    });
  });

  it('conserves XP, level, gold, inventory and equipment exactly', () => {
    const source = sourceParty();
    const carried = carryParty(source);
    carried.forEach((hero, i) => {
      expect(hero.xp).toBe(source[i].xp);
      expect(hero.level).toBe(source[i].level);
      expect(hero.gold).toBe(source[i].gold);
      expect(hero.inventory).toEqual(source[i].inventory);
      expect(hero.equipment).toEqual(source[i].equipment);
    });
  });

  it('shares no object references with the source save and never mutates it', () => {
    const source = sourceParty();
    const snapshot = JSON.parse(JSON.stringify(source));
    const carried = carryParty(source);

    expect(carried[0]).not.toBe(source[0]);
    expect(carried[0].inventory).not.toBe(source[0].inventory);
    expect(carried[0].equipment).not.toBe(source[0].equipment);

    // mutating the copy leaves the source untouched
    carried[0].inventory.push({ key: 'loot', quantity: 1 });
    carried[0].gold = 9999;
    expect(source).toEqual(snapshot);

    // the source's wounded/defeated state was not healed in place
    expect(source[0].currentHP).toBe(3);
    expect(source[1].isDefeated).toBe(true);
  });

  it('computes maxHP for heroes missing it (schema backfill)', () => {
    const carried = carryParty([{ heroId: 'h3', heroName: 'New', characterClass: 'Rogue', level: 2 }]);
    expect(carried[0].maxHP).toBeGreaterThan(0);
    expect(carried[0].currentHP).toBe(carried[0].maxHP);
  });
});

describe('chain fields (additive settings)', () => {
  const template = () => storyTemplates.find((t) => t.id === 'heroic-fantasy-t2');

  it('stamps chain, completedCampaigns and saveName when chaining', () => {
    const launch = launchCampaign(specFromTemplate(template()), {
      seed: SEED,
      chainFrom: {
        parentSaveId: 'game-123-abc',
        chapter: 2,
        completedCampaigns: ['heroic-fantasy-t1'],
        saveName: 'Adventure — Chapter 2',
      },
    });
    expect(launch.settings.chain).toEqual({ parentSaveId: 'game-123-abc', chapter: 2 });
    expect(launch.settings.completedCampaigns).toEqual(['heroic-fantasy-t1']);
    expect(launch.settings.saveName).toBe('Adventure — Chapter 2');
  });

  it('adds NO chain fields on a plain new game (back-compat)', () => {
    const launch = launchCampaign(specFromTemplate(template()), { seed: SEED });
    expect(launch.settings.chain).toBeUndefined();
    expect(launch.settings.completedCampaigns).toBeUndefined();
    expect(launch.settings.saveName).toBeUndefined();
    expect(launch.party).toBeNull();
  });
});
