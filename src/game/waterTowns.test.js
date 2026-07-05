// Water towns world integration (#65 Phase 3): the tier-gated world-gen shims, the
// one-time `waterTown` stamp, the launch-pipeline pass-through into pre-generated
// towns, and the quest-injection guarantee inside the water archetypes.

import {
  RIVERFORK_STAMP_RATE,
  resolveWaterTownAccess,
  waterTownWorldGenOptions,
  stampWaterTowns,
} from './waterTowns';
import { launchCampaign, specFromTemplate, mergeLocationNames } from './campaignLauncher';
import { injectQuestBuildings, spawnWorldMapEntities } from './milestoneSpawner';
import {
  setUserTier,
  clearUserTier,
  _resetEntitlementsForTests,
  TIER_MIRROR_KEY,
} from './entitlements';
import { generateMapData } from '../utils/mapGenerator';
import { generateTownMap } from '../utils/townMapGenerator';
import { analyzeTownWater } from '../utils/townWater';
import { storyTemplates } from '../data/storyTemplates';

const SEED = 424242;
const SHIMS = { riverToSea: true, estuaryTown: true };
const template = () => storyTemplates.find((t) => t.id === 'heroic-fantasy-t1');

const resetTier = () => {
  _resetEntitlementsForTests();
  localStorage.removeItem(TIER_MIRROR_KEY);
};

afterEach(resetTier);

const flatTowns = (map) => map.flat().filter((t) => t.poi === 'town');
const stamped = (map, kind) => flatTowns(map).filter((t) => t.waterTown === kind);

describe('access resolution + world-gen options', () => {
  it('free tier: no water-town access, empty world-gen options', () => {
    expect(resolveWaterTownAccess()).toEqual({ allowRiverfork: false, allowCanal: false });
    expect(waterTownWorldGenOptions(resolveWaterTownAccess())).toEqual({});
    expect(waterTownWorldGenOptions(null)).toEqual({});
  });

  it('member tier: riverfork only; premium: both', () => {
    setUserTier('member');
    expect(resolveWaterTownAccess()).toEqual({ allowRiverfork: true, allowCanal: false });
    setUserTier('premium');
    expect(resolveWaterTownAccess()).toEqual({ allowRiverfork: true, allowCanal: true });
  });

  it('any water-town access turns both shims on', () => {
    expect(waterTownWorldGenOptions({ allowRiverfork: true, allowCanal: false }))
      .toEqual({ riverToSea: true, estuaryTown: true });
    expect(waterTownWorldGenOptions({ allowRiverfork: true, allowCanal: true }))
      .toEqual({ riverToSea: true, estuaryTown: true });
  });
});

describe('stampWaterTowns', () => {
  it('stamps nothing without access, leaving the map untouched', () => {
    const map = generateMapData(10, 10, SEED, {}, 'grassland', SHIMS);
    const before = JSON.stringify(map);
    const summary = stampWaterTowns(map, SEED, {});
    expect(summary).toEqual({ canal: null, riverforks: [] });
    expect(JSON.stringify(map)).toBe(before);
  });

  it('is deterministic for the same map + seed', () => {
    const a = generateMapData(10, 10, SEED, {}, 'grassland', SHIMS);
    const b = generateMapData(10, 10, SEED, {}, 'grassland', SHIMS);
    const sa = stampWaterTowns(a, SEED, { allowRiverfork: true, allowCanal: true });
    const sb = stampWaterTowns(b, SEED, { allowRiverfork: true, allowCanal: true });
    expect(sa).toEqual(sb);
    expect(a).toEqual(b);
  });

  describe('150-seed stamping survey (premium access)', () => {
    const N = 150;
    const surveys = [];
    beforeAll(() => {
      for (let i = 0; i < N; i++) {
        const s = i * 101 + 7;
        const map = generateMapData(10, 10, s, {}, 'grassland', SHIMS);
        const summary = stampWaterTowns(map, s, { allowRiverfork: true, allowCanal: true });
        surveys.push({ s, map, summary });
      }
    });

    it('a canal city is stamped on essentially every premium world, at most ONE per world', () => {
      const withCanal = surveys.filter(({ summary }) => summary.canal).length;
      // Measured 150/150 (the estuary shim guarantees a coastal city; the lagoon
      // fallback covers occupied mouth tiles). Slack for seed drift.
      expect(withCanal).toBeGreaterThanOrEqual(Math.floor(N * 0.95));
      surveys.forEach(({ map }) => {
        expect(stamped(map, 'canal').length).toBeLessThanOrEqual(1);
      });
    });

    it('the canal city is a coastal CITY and never the starting town', () => {
      surveys.forEach(({ map, summary }) => {
        if (!summary.canal) return;
        const t = map[summary.canal.y][summary.canal.x];
        expect(t.townSize).toBe('city');
        expect(t.isStartingTown).not.toBe(true);
        const water = analyzeTownWater(map, summary.canal.x, summary.canal.y);
        expect(water?.kind).toBe('coast');
      });
    });

    it('the canal city sits on a true estuary (river band) in the large majority of worlds', () => {
      const canals = surveys.filter(({ summary }) => summary.canal);
      const onEstuary = canals.filter(({ map, summary }) => map[summary.canal.y][summary.canal.x].hasRiver);
      // Measured 133/150 (88.7%); the rest are the plan's accepted lagoon fallback.
      expect(onEstuary.length).toBeGreaterThanOrEqual(Math.floor(canals.length * 0.75));
    });

    it('riverfork stamps only land on eligible river settlements (town/city on the river band)', () => {
      surveys.forEach(({ map }) => {
        stamped(map, 'riverfork').forEach((t) => {
          expect(t.hasRiver).toBe(true);
          expect(['town', 'city']).toContain(t.townSize);
        });
      });
    });
  });

  it('member access (riverfork only): no canal ever, and the seeded roll lands near the ~50% rate', () => {
    const N = 150;
    let eligible = 0;
    let forks = 0;
    for (let i = 0; i < N; i++) {
      const s = i * 101 + 7;
      const map = generateMapData(10, 10, s, {}, 'grassland', SHIMS);
      eligible += flatTowns(map).filter(
        (t) => t.hasRiver && (t.townSize === 'town' || t.townSize === 'city')
      ).length;
      const summary = stampWaterTowns(map, s, { allowRiverfork: true, allowCanal: false });
      expect(summary.canal).toBeNull();
      expect(stamped(map, 'canal')).toHaveLength(0);
      forks += summary.riverforks.length;
    }
    // Measured: 144 eligible across 150 worlds, 78 stamped = 54.2%. Band around the
    // configured rate with sampling slack (n~144 -> sd ~4%).
    expect(RIVERFORK_STAMP_RATE).toBe(0.5);
    expect(eligible).toBeGreaterThan(100); // the shims make eligibility routine
    const rate = forks / eligible;
    expect(rate).toBeGreaterThanOrEqual(0.35);
    expect(rate).toBeLessThanOrEqual(0.65);
  });
});

describe('launchCampaign tier flow (entitlement checked once, at New Game)', () => {
  it('free/guest worlds are byte-identical to the legacy pipeline: no shims, no stamps', () => {
    const spec = specFromTemplate(template());
    const launch = launchCampaign(spec, { seed: SEED });
    // the legacy pipeline for the same seed: bare generation + milestone spawning
    const legacyMap = generateMapData(10, 10, SEED, mergeLocationNames(spec.customNames, spec.milestones), spec.worldTheme);
    spawnWorldMapEntities(legacyMap, spec.milestones);
    expect(launch.mapData).toEqual(legacyMap);
    expect(launch.mapData.flat().some((t) => t.waterTown)).toBe(false);
  });

  it('member launch stamps riverfork only', () => {
    setUserTier('member');
    // survey a few seeds so the ~50% roll cannot blank every world
    let sawFork = false;
    for (const s of [SEED, 7, 1717, 90210]) {
      const launch = launchCampaign(specFromTemplate(template()), { seed: s });
      expect(stamped(launch.mapData, 'canal')).toHaveLength(0);
      if (stamped(launch.mapData, 'riverfork').length > 0) sawFork = true;
    }
    expect(sawFork).toBe(true);
  });

  it('premium launch stamps the canal city and pre-generates it as a real canal town', () => {
    setUserTier('premium');
    const launch = launchCampaign(specFromTemplate(template()), { seed: SEED });
    const canals = stamped(launch.mapData, 'canal');
    expect(canals).toHaveLength(1);
    const canalTile = canals[0];
    expect(canalTile.townSize).toBe('city');
    expect(canalTile.isStartingTown).not.toBe(true);

    // End-to-end pass-through: the pre-generated town map for the stamped city was
    // built with water.archetype 'canal' (waterway tiles exist only in the water
    // archetypes), and quest-injection supply survived (free grass remains).
    const townMap = launch.townMapsCache[canalTile.townName];
    expect(townMap).toBeTruthy();
    const tiles = townMap.mapData.flat();
    expect(tiles.some((t) => t.waterway === true)).toBe(true);
    expect(tiles.filter((t) => t.type === 'grass' && !t.poi).length).toBeGreaterThanOrEqual(10);
  });

  it('the starting town is never the canal city (heart experience stays standard)', () => {
    setUserTier('premium');
    for (const s of [SEED, 7, 1717, 90210, 31337]) {
      const launch = launchCampaign(specFromTemplate(template()), { seed: s });
      const start = launch.mapData.flat().find((t) => t.isStartingTown);
      expect(start).toBeTruthy();
      expect(start.waterTown).not.toBe('canal');
    }
  });

  it('a lapsed tier does not touch existing stamps (grandfathering is the save, not the gate)', () => {
    setUserTier('premium');
    const launch = launchCampaign(specFromTemplate(template()), { seed: SEED });
    const before = JSON.stringify(launch.mapData);
    // subscription lapses: the map (the save's world) is not re-evaluated by anything
    clearUserTier();
    expect(JSON.stringify(launch.mapData)).toBe(before);
    expect(stamped(launch.mapData, 'canal')).toHaveLength(1);
  });
});

describe('quest-building injection inside water towns (milestones unaffected)', () => {
  const COAST = { kind: 'coast', edges: { N: false, E: false, S: true, W: false } };

  it('injects a quest building into a generated canal city', () => {
    const town = generateTownMap('city', 'Canalport', 'north', 3131, false, 'NORTH_SOUTH', 'grassland', { ...COAST, archetype: 'canal' });
    expect(town.mapData.flat().some((t) => t.waterway === true)).toBe(true);
    injectQuestBuildings(town, [{ type: 'alchemist', name: 'The Gilded Vial', questItem: { id: 'q_item', name: 'Quest Item' } }]);
    const venue = town.mapData.flat().find((t) => t.buildingName === 'The Gilded Vial');
    expect(venue).toBeTruthy();
    expect(venue.questBuilding).toBe(true);
    expect(venue.questItemId).toBe('q_item');
  });

  it('injects a quest building into a generated riverfork town', () => {
    const town = generateTownMap('town', 'Forkford', 'south', 4242, true, 'NORTH_SOUTH', 'grassland', { archetype: 'riverfork' });
    expect(town.mapData.flat().some((t) => t.waterway === true)).toBe(true);
    injectQuestBuildings(town, [{ type: 'archives', name: 'Hall of Records' }]);
    const venue = town.mapData.flat().find((t) => t.buildingName === 'Hall of Records');
    expect(venue).toBeTruthy();
    expect(venue.questBuilding).toBe(true);
  });
});
