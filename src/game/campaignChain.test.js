// In-save quest chaining: the next campaign continues INSIDE the same save.
// These tests build a REAL completed t1 world through the launch pipeline, then
// continue the re-authored t2 into it and assert every invariant the design
// demands: additive-only world stamps, cached-town retro-injection, settings
// swap correctness, party healed in place, stale-stamp gating, POI history.

import {
  resolveCompletedTemplateId,
  getPartyLevel,
  getNextCampaignOptions,
  isTemplateCompatibleWithWorld,
  isOpeningAccessible,
  getLevelFitNotice,
  healPartyForNextChapter,
  buildInSaveContinuation,
  applyContinuationToSettings,
} from './campaignChain';
import { launchCampaign, specFromTemplate } from './campaignLauncher';
import { retroInjectQuestContent } from './milestoneSpawner';
import {
  isQuestItemSearchable,
  computeVisibleMilestonePois,
  getMilestoneBossForTile,
  getMilestoneItemForTile,
} from './milestoneEngine';
import { storyTemplates } from '../data/storyTemplates';

const SEED = 424242;
const t1 = () => storyTemplates.find((t) => t.id === 'heroic-fantasy-t1');
const t2 = () => storyTemplates.find((t) => t.id === 'heroic-fantasy-t2');

// A completed t1 save's live state, built through the real pipeline.
const completedT1Save = () => {
  const launch = launchCampaign(specFromTemplate(t1()), { seed: SEED });
  const settings = {
    ...launch.settings,
    milestones: launch.settings.milestones.map((m) => ({ ...m, completed: true })),
    campaignComplete: true,
    saveName: 'Adventure',
  };
  return { launch, settings };
};

const party = () => ([
  {
    heroId: 'h1', heroName: 'Vanya', characterClass: 'Warrior',
    level: 3, xp: 350, gold: 77, maxHP: 24, currentHP: 5, isDefeated: false,
    inventory: [{ key: 'sword', quantity: 1 }],
  },
  {
    heroId: 'h2', heroName: 'Orin', characterClass: 'Mage',
    level: 2, xp: 180, gold: 12, maxHP: 14, currentHP: 0, isDefeated: true,
    inventory: [],
  },
]);

// Tile fields the additive spawn is allowed to touch.
const STAMP_FIELDS = new Set(['poi', 'poiName', 'milestonePoi', 'milestoneEnemy', 'milestoneEnemyName']);

describe('chain records', () => {
  it('resolveCompletedTemplateId prefers templateId, falls back to the label', () => {
    expect(resolveCompletedTemplateId({ templateId: 'heroic-fantasy-t1' })).toBe('heroic-fantasy-t1');
    expect(resolveCompletedTemplateId({ templateName: 'Heroic Fantasy — The Goblin Threat' })).toBe('heroic-fantasy-t1');
    expect(resolveCompletedTemplateId({ templateName: 'Custom Tale' })).toBe('Custom Tale');
    expect(resolveCompletedTemplateId({})).toBeNull();
  });

  it('getPartyLevel reads both level spellings and defaults to 1', () => {
    expect(getPartyLevel([{ level: 2 }, { heroLevel: 4 }])).toBe(4);
    expect(getPartyLevel([])).toBe(1);
    expect(getPartyLevel(null)).toBe(1);
  });
});

describe('geography compatibility (data-driven)', () => {
  it('the re-authored t2 is compatible with a live t1 world', () => {
    const { launch } = completedT1Save();
    expect(isTemplateCompatibleWithWorld(t2(), launch.mapData)).toBe(true);
  });

  it('a template authored for different lands (desert) is NOT compatible', () => {
    const { launch } = completedT1Save();
    const desert = storyTemplates.find((t) => t.id === 'desert-expedition-t1');
    expect(isTemplateCompatibleWithWorld(desert, launch.mapData)).toBe(false);
  });

  it('tolerates a missing world map (nothing is compatible without one)', () => {
    expect(isTemplateCompatibleWithWorld(t2(), null)).toBe(false);
    expect(isTemplateCompatibleWithWorld(t2(), [])).toBe(false);
  });

  it('getNextCampaignOptions flags compatibility and still recommends the next tier', () => {
    const { launch, settings } = completedT1Save();
    const options = getNextCampaignOptions({ settings, party: party(), worldMap: launch.mapData });
    const byId = Object.fromEntries(options.map((o) => [o.template.id, o]));
    expect(options[0].template.id).toBe('heroic-fantasy-t2');
    expect(options[0].recommended).toBe(true);
    expect(byId['heroic-fantasy-t2'].compatible).toBe(true);
    expect(byId['grimdark-survival-t1'].compatible).toBe(false);
    // excluded: the completed campaign and comingSoon stubs
    expect(byId['heroic-fantasy-t1']).toBeUndefined();
    expect(byId['heroic-fantasy-t3']).toBeUndefined();
    // premium stays listed but locked
    expect(byId['desert-expedition-t1'].premiumLocked).toBe(true);
  });

  it('buildInSaveContinuation refuses an incompatible template with a helpful error', () => {
    const { launch, settings } = completedT1Save();
    const grimdark = storyTemplates.find((t) => t.id === 'grimdark-survival-t1');
    expect(() => buildInSaveContinuation({
      template: grimdark,
      worldMap: launch.mapData,
      townMapsCache: launch.townMapsCache,
      worldSeed: SEED,
      existingSideQuests: settings.sideQuests,
    })).toThrow(/different lands/);
  });

  it('buildInSaveContinuation holds the premium gate for free users', () => {
    const { launch } = completedT1Save();
    const desert = storyTemplates.find((t) => t.id === 'desert-expedition-t1');
    expect(() => buildInSaveContinuation({
      template: desert,
      worldMap: launch.mapData,
      townMapsCache: launch.townMapsCache,
      worldSeed: SEED,
    })).toThrow(/Premium/);
  });
});

describe('healPartyForNextChapter (everything, healed, in place)', () => {
  it('heals to full and clears defeat; conserves progression; never mutates input', () => {
    const source = party();
    const snapshot = JSON.parse(JSON.stringify(source));
    const healed = healPartyForNextChapter(source);
    expect(healed).toHaveLength(2);
    healed.forEach((h, i) => {
      expect(h.currentHP).toBe(h.maxHP);
      expect(h.isDefeated).toBe(false);
      expect(h.xp).toBe(source[i].xp);
      expect(h.level).toBe(source[i].level);
      expect(h.gold).toBe(source[i].gold);
      expect(h.inventory).toBe(source[i].inventory); // same save: no deep copy needed
    });
    expect(source).toEqual(snapshot); // input untouched
  });

  it('computes maxHP for heroes missing it', () => {
    const healed = healPartyForNextChapter([{ heroId: 'h3', characterClass: 'Rogue', level: 2 }]);
    expect(healed[0].maxHP).toBeGreaterThan(0);
    expect(healed[0].currentHP).toBe(healed[0].maxHP);
  });
});

describe('buildInSaveContinuation: additive world spawn', () => {
  const setup = () => {
    const { launch, settings } = completedT1Save();
    const worldBefore = JSON.parse(JSON.stringify(launch.mapData));
    const continuation = buildInSaveContinuation({
      template: t2(),
      worldMap: launch.mapData,
      townMapsCache: launch.townMapsCache,
      worldSeed: SEED,
      existingSideQuests: settings.sideQuests,
      party: party(),
      chapter: 2,
    });
    return { launch, settings, worldBefore, continuation };
  };

  it('never mutates the live world map (copy-on-write)', () => {
    const { launch, worldBefore } = setup();
    expect(launch.mapData).toEqual(worldBefore);
  });

  it('the new map is byte-identical EXCEPT the additive spawn stamps', () => {
    const { worldBefore, continuation } = setup();
    const after = continuation.mapData;
    let stampedTiles = 0;
    for (let y = 0; y < worldBefore.length; y++) {
      for (let x = 0; x < worldBefore[y].length; x++) {
        const before = worldBefore[y][x];
        const afterTile = after[y][x];
        const keys = new Set([...Object.keys(before), ...Object.keys(afterTile)]);
        let stamped = false;
        for (const key of keys) {
          if (JSON.stringify(before[key]) !== JSON.stringify(afterTile[key])) {
            expect(STAMP_FIELDS.has(key)).toBe(true); // only spawn stamps may differ
            stamped = true;
          }
        }
        if (stamped) stampedTiles++;
      }
    }
    expect(stampedTiles).toBeGreaterThan(0); // the campaign actually landed
  });

  it('places the new POI with the occupied-tile adjacent fallback; the old POI survives', () => {
    const { worldBefore, continuation } = setup();
    const flatBefore = [].concat(...worldBefore);
    const flatAfter = [].concat(...continuation.mapData);
    // t1's Goblin Hideout tile is untouched
    const hideoutBefore = flatBefore.find((t) => t.poi === 'goblin_hideout');
    const hideoutAfter = flatAfter.find((t) => t.poi === 'goblin_hideout');
    expect(hideoutBefore).toBeTruthy();
    expect(hideoutAfter).toEqual(hideoutBefore);
    // t2's Shadow Fortress landed in the same range without displacing it
    const fortress = flatAfter.find((t) => t.poi === 'shadow_fortress');
    expect(fortress).toBeTruthy();
    expect(fortress.milestonePoi).toBe(true);
    expect(flatBefore.find((t) => t.poi === 'shadow_fortress')).toBeUndefined();
  });

  it('resolves the new milestones against the live map (coords + fresh state)', () => {
    const { continuation } = setup();
    expect(continuation.milestones).toHaveLength(4);
    continuation.milestones.forEach((m) => expect(m.completed).toBeFalsy());
    const m1 = continuation.milestones.find((m) => m.id === 1);
    expect(typeof m1.mapX).toBe('number'); // Millhaven exists on the t1 map
    expect(typeof m1.mapY).toBe('number');
  });

  it('composes a chapter-divider prologue with no "story so far" recap', () => {
    const { continuation } = setup();
    expect(continuation.prologue).toContain('**Chapter 2: Crown of Sunfire**');
    expect(continuation.prologue).toContain('**Goal:**');
    expect(continuation.prologue).not.toMatch(/story so far/i);
  });
});

describe('buildInSaveContinuation: cached-town retro-injection', () => {
  const setup = () => {
    const { launch, settings } = completedT1Save();
    const cacheBefore = JSON.parse(JSON.stringify(launch.townMapsCache));
    const continuation = buildInSaveContinuation({
      template: t2(),
      worldMap: launch.mapData,
      townMapsCache: launch.townMapsCache,
      worldSeed: SEED,
      existingSideQuests: settings.sideQuests,
      chapter: 2,
    });
    return { launch, cacheBefore, continuation };
  };

  const findBuilding = (townMap, predicate) => {
    for (let y = 0; y < townMap.mapData.length; y++) {
      for (let x = 0; x < townMap.mapData[y].length; x++) {
        const tile = townMap.mapData[y][x];
        if (tile.type === 'building' && predicate(tile)) return { x, y, ...tile };
      }
    }
    return null;
  };

  it('never mutates the live cache (copy-on-write)', () => {
    const { launch, cacheBefore } = setup();
    expect(launch.townMapsCache).toEqual(cacheBefore);
  });

  it('adds the quest building (with its item stamp) to the cached target town', () => {
    const { continuation } = setup();
    const millhaven = continuation.townMapsCache['Millhaven'];
    expect(millhaven).toBeTruthy();
    const archives = findBuilding(millhaven, (t) => t.buildingName === 'The Great Archives');
    expect(archives).toBeTruthy();
    expect(archives.questBuilding).toBe(true);
    expect(archives.questItemId).toBe('hidden_map');
  });

  it('adds the milestone NPC to the cached town roster, bound to its venue', () => {
    const { continuation } = setup();
    const thornfield = continuation.townMapsCache['Thornfield'];
    const aldric = (thornfield.npcs || []).find((n) => n.milestoneNpcId === 'thornfield_guard_captain');
    expect(aldric).toBeTruthy();
    expect(aldric.name).toBe('Captain Aldric');
    expect(aldric.personality).toContain('honorable');
    const barracks = findBuilding(thornfield, (t) => t.buildingName === 'Thornfield Guard Barracks');
    expect(barracks).toBeTruthy();
    expect(aldric.location.x).toBe(barracks.x);
    expect(aldric.location.y).toBe(barracks.y);
    expect(aldric.location.buildingName).toBe('Thornfield Guard Barracks');
  });

  it('touches ONLY the towns that receive content; others keep their exact objects', () => {
    const { launch, continuation } = setup();
    // t2 places content in Millhaven and Thornfield only
    expect(continuation.townMapsCache['Willowdale']).toBe(launch.townMapsCache['Willowdale']);
    expect(continuation.townMapsCache['Briarwood']).toBe(launch.townMapsCache['Briarwood']);
  });

  it('changes nothing else in an injected town (one building converted, roster conserved)', () => {
    const { cacheBefore, continuation } = setup();
    const before = cacheBefore['Millhaven'];
    const after = continuation.townMapsCache['Millhaven'];
    // Roster conserved: same NPCs by name; a house-swap may REHOME residents of the
    // converted house (playtest 2026-07-04: the Elder haunting the new archives),
    // but nobody is added or removed, and nobody may still point at the venue.
    expect(after.npcs.map((n) => n.name)).toEqual(before.npcs.map((n) => n.name));
    const convertedCoords = [];
    for (let y = 0; y < before.mapData.length; y++) {
      for (let x = 0; x < before.mapData[y].length; x++) {
        if (before.mapData[y][x].buildingType === 'house' && after.mapData[y][x].buildingType !== 'house') {
          convertedCoords.push(`${x},${y}`);
        }
      }
    }
    after.npcs.filter((n) => !n.milestoneNpcId).forEach((n) => {
      if (!n.location) return;
      expect(convertedCoords).not.toContain(`${n.location.x},${n.location.y}`);
      if (n.location.homeCoords) {
        expect(convertedCoords).not.toContain(`${n.location.homeCoords.x},${n.location.homeCoords.y}`);
      }
    });
    // exactly the tiles of the converted building may differ
    let changed = 0;
    for (let y = 0; y < before.mapData.length; y++) {
      for (let x = 0; x < before.mapData[y].length; x++) {
        if (JSON.stringify(before.mapData[y][x]) !== JSON.stringify(after.mapData[y][x])) {
          changed++;
          expect(after.mapData[y][x].buildingName).toBe('The Great Archives');
        }
      }
    }
    expect(changed).toBeGreaterThan(0);
  });

  it('is idempotent: re-running the injection adds nothing twice', () => {
    const { continuation } = setup();
    const again = retroInjectQuestContent({
      townMapsCache: continuation.townMapsCache,
      requiredBuildings: continuation.spawnResult.requiredBuildings,
      milestones: t2().settings.milestones,
      worldSeed: SEED,
    });
    const npcs = (again['Thornfield'].npcs || []).filter((n) => n.milestoneNpcId === 'thornfield_guard_captain');
    expect(npcs).toHaveLength(1);
    expect(again['Thornfield'].npcs).toHaveLength(continuation.townMapsCache['Thornfield'].npcs.length);
  });
});

describe('shared-venue conflicts (maintainer supplement)', () => {
  it('re-stamps a reused quest building with the NEW campaign item (old stamp overwritten)', () => {
    // t1 stamped Willowdale's tavern (The Crooked Pint) with goblin_scouts_map. A later
    // campaign (t3 deliberately reuses the venue) must overwrite the stamp.
    const { launch } = completedT1Save();
    const cache = retroInjectQuestContent({
      townMapsCache: launch.townMapsCache,
      requiredBuildings: {
        Willowdale: [{ type: 'tavern', name: 'The Crooked Pint', milestoneId: 1, questItem: { id: 'quest_letter', name: 'The King\'s Sealed Testament' } }],
      },
      milestones: [],
      worldSeed: SEED,
    });
    let pint = null;
    for (const row of cache['Willowdale'].mapData) {
      for (const tile of row) {
        if (tile.type === 'building' && tile.buildingName === 'The Crooked Pint') pint = tile;
      }
    }
    expect(pint).toBeTruthy();
    expect(pint.questItemId).toBe('quest_letter'); // overwritten, not goblin_scouts_map
    // the LIVE cache still carries the old stamp (copy-on-write)
    let livePint = null;
    for (const row of launch.townMapsCache['Willowdale'].mapData) {
      for (const tile of row) {
        if (tile.type === 'building' && tile.buildingName === 'The Crooked Pint') livePint = tile;
      }
    }
    expect(livePint.questItemId).toBe('goblin_scouts_map');
  });

  it('REPLACES a prior campaign\'s milestone NPC in the same building (one Ulric, promoted)', () => {
    // t1 placed Captain Ulric (militia_captain) in the Briarwood Militia Hall. A
    // sequel NPC (Marshal Ulric) targeting the SAME building must replace him.
    const { launch } = completedT1Save();
    const rosterBefore = launch.townMapsCache['Briarwood'].npcs || [];
    const ulricBefore = rosterBefore.find((n) => n.milestoneNpcId === 'militia_captain');
    expect(ulricBefore).toBeTruthy();

    const sequelMilestones = [{
      id: 2,
      text: 'Rally Marshal Ulric at Briarwood',
      type: 'talk',
      trigger: { npc: 'marshal_ulric', action: 'talk' },
      spawn: { type: 'npc', id: 'marshal_ulric', name: 'Marshal Ulric', location: 'Briarwood', role: 'Guard', gender: 'Male', personality: 'gruff, wry' },
      building: { type: 'barracks', name: 'Briarwood Militia Hall', location: 'Briarwood' },
    }];
    const cache = retroInjectQuestContent({
      townMapsCache: launch.townMapsCache,
      requiredBuildings: { Briarwood: [{ type: 'barracks', name: 'Briarwood Militia Hall', milestoneId: 2, questItem: null }] },
      milestones: sequelMilestones,
      worldSeed: SEED,
    });

    const rosterAfter = cache['Briarwood'].npcs;
    const milestoneNpcs = rosterAfter.filter((n) => n.milestoneNpcId);
    expect(milestoneNpcs).toHaveLength(1); // exactly one Ulric
    expect(milestoneNpcs[0].milestoneNpcId).toBe('marshal_ulric');
    expect(milestoneNpcs[0].name).toBe('Marshal Ulric');
    // replacement, not accumulation: roster size conserved, procedural staff untouched
    expect(rosterAfter).toHaveLength(rosterBefore.length);
    const proceduralBefore = rosterBefore.filter((n) => !n.milestoneNpcId).map((n) => n.name);
    const proceduralAfter = rosterAfter.filter((n) => !n.milestoneNpcId).map((n) => n.name);
    expect(proceduralAfter).toEqual(proceduralBefore);
  });
});

describe('applyContinuationToSettings (functional settings swap)', () => {
  const setup = () => {
    const { launch, settings } = completedT1Save();
    // give an existing side quest some state to prove it survives
    const prevSettings = {
      ...settings,
      sideQuests: (settings.sideQuests || []).map((q, i) => (i === 0 ? { ...q, status: 'completed' } : q)),
    };
    const continuation = buildInSaveContinuation({
      template: t2(),
      worldMap: launch.mapData,
      townMapsCache: launch.townMapsCache,
      worldSeed: SEED,
      existingSideQuests: prevSettings.sideQuests,
      chapter: 2,
    });
    return { prevSettings, continuation, next: applyContinuationToSettings(prevSettings, continuation) };
  };

  it('swaps to the new campaign: milestones fresh, campaignComplete cleared, identity updated', () => {
    const { next, continuation } = setup();
    expect(next.milestones).toBe(continuation.milestones);
    next.milestones.forEach((m) => expect(m.completed).toBeFalsy());
    expect(next.campaignComplete).toBe(false);
    expect(next.templateId).toBe('heroic-fantasy-t2');
    expect(next.templateName).toBe('Heroic Fantasy — Crown of Sunfire');
    expect(next.campaignGoal).toMatch(/Crown of Sunfire/);
    expect(next.tier).toBe(2);
    expect(next.levelRange).toEqual([3, 5]);
  });

  it('records the chain: completedCampaigns appended, currentChapter incremented', () => {
    const { next } = setup();
    expect(next.completedCampaigns).toEqual(['heroic-fantasy-t1']);
    expect(next.currentChapter).toBe(2);
    // a third chapter would keep accumulating
    const again = applyContinuationToSettings(
      { ...next, campaignComplete: true },
      { spec: { templateId: 'x', templateName: 'X', milestones: [] }, spawnResult: { requiredBuildings: {}, enemySpawns: [], itemSpawns: [] }, milestones: [], sideQuestsToAdd: [] }
    );
    expect(again.completedCampaigns).toEqual(['heroic-fantasy-t1', 'heroic-fantasy-t2']);
    expect(again.currentChapter).toBe(3);
  });

  it('keeps world-scoped fields untouched (seed, theme, mapVersion, saveName)', () => {
    const { prevSettings, next } = setup();
    expect(next.worldSeed).toBe(prevSettings.worldSeed);
    expect(next.theme).toBe(prevSettings.theme);
    expect(next.mapVersion).toBe(prevSettings.mapVersion);
    expect(next.saveName).toBe('Adventure');
  });

  it('APPENDS side quests; existing quests keep their state and order', () => {
    const { prevSettings, next, continuation } = setup();
    const prevIds = prevSettings.sideQuests.map((q) => q.id);
    expect(next.sideQuests.slice(0, prevIds.length).map((q) => q.id)).toEqual(prevIds);
    expect(next.sideQuests[0].status).toBe('completed'); // state preserved
    // appended quests are new ids only
    const appended = next.sideQuests.slice(prevIds.length);
    expect(appended).toEqual(continuation.sideQuestsToAdd);
    appended.forEach((q) => {
      expect(prevIds).not.toContain(q.id);
      expect(q.status).toBe('available');
    });
  });

  it('merges requiredBuildings per town (old entries kept for uncached-town back-compat)', () => {
    const { prevSettings, next } = setup();
    // t1's Willowdale tavern requirement survives
    expect(next.requiredBuildings.Willowdale).toEqual(prevSettings.requiredBuildings.Willowdale);
    // t2's Millhaven archives requirement added
    const millhaven = next.requiredBuildings.Millhaven || [];
    expect(millhaven.some((b) => b.name === 'The Great Archives')).toBe(true);
  });

  it('replaces the campaign-scoped spawn tables', () => {
    const { next, continuation } = setup();
    expect(next.enemySpawns).toBe(continuation.spawnResult.enemySpawns);
    expect(next.itemSpawns).toBe(continuation.spawnResult.itemSpawns);
    expect(next.enemySpawns.some((e) => e.id === 'shadow_overlord')).toBe(true);
  });
});

describe('derived-state conflicts after the swap (maintainer supplement)', () => {
  const continued = () => {
    const { launch, settings } = completedT1Save();
    const continuation = buildInSaveContinuation({
      template: t2(),
      worldMap: launch.mapData,
      townMapsCache: launch.townMapsCache,
      worldSeed: SEED,
      existingSideQuests: settings.sideQuests,
      chapter: 2,
    });
    return { launch, settings, continuation, next: applyContinuationToSettings(settings, continuation) };
  };

  it('stale quest-item stamps are NOT searchable; the new campaign\'s are', () => {
    const { next } = continued();
    // t1's tavern stamp: matches nothing current -> hidden, never resurfaces
    expect(isQuestItemSearchable(next.milestones, 'goblin_scouts_map')).toBe(false);
    // t2's archives stamp: current + uncompleted -> searchable
    expect(isQuestItemSearchable(next.milestones, 'hidden_map')).toBe(true);
    // once completed -> claimed, hidden again
    const done = next.milestones.map((m) => (m.id === 1 ? { ...m, completed: true } : m));
    expect(isQuestItemSearchable(done, 'hidden_map')).toBe(false);
    // tolerant of junk
    expect(isQuestItemSearchable(null, 'x')).toBe(false);
    expect(isQuestItemSearchable(next.milestones, null)).toBe(false);
  });

  it('completed-campaign POIs stay visible on the map; new POIs still gate on prerequisites', () => {
    const { next, continuation } = continued();
    const visible = computeVisibleMilestonePois(next.milestones, continuation.mapData);
    expect(visible).not.toBeNull();
    expect(visible.has('goblin_hideout')).toBe(true); // history never vanishes
    expect(visible.has('shadow_fortress')).toBe(false); // m3 requires [1,2]
    // completing the prerequisites reveals the fortress
    const unlocked = next.milestones.map((m) => (m.id === 1 || m.id === 2 ? { ...m, completed: true } : m));
    expect(computeVisibleMilestonePois(unlocked, continuation.mapData).has('shadow_fortress')).toBe(true);
  });

  it('computeVisibleMilestonePois returns null (no filtering) when nothing needs gating', () => {
    expect(computeVisibleMilestonePois([], [])).toBeNull();
    expect(computeVisibleMilestonePois([{ id: 1, spawn: { type: 'item', id: 'x' } }], [])).toBeNull();
  });

  it('a prior campaign\'s POI/boss tiles offer no dead quest actions under the new milestones', () => {
    const { next, continuation } = continued();
    const flat = [].concat(...continuation.mapData);
    const hideout = flat.find((t) => t.poi === 'goblin_hideout');
    expect(hideout).toBeTruthy();
    // arrival modal gates read CURRENT milestones: no boss, no gather on old tiles
    expect(getMilestoneBossForTile(next.milestones, hideout)).toBeNull();
    expect(getMilestoneItemForTile(next.milestones, hideout)).toBeNull();
    const staleBossTile = flat.find((t) => t.milestoneEnemy === 'goblin_chieftain');
    if (staleBossTile) {
      expect(getMilestoneBossForTile(next.milestones, staleBossTile)).toBeNull();
    }
  });
});

describe('missing quest venues prefer FREE GROUND over house conversion (maintainer decision 2026-07-04)', () => {
  it('places a NEW building on grass; houses are not converted', () => {
    const g = (x, y) => ({ type: 'grass', x, y });
    const town = {
      townName: 'Millhaven',
      mapData: [
        [{ type: 'building', buildingType: 'house', x: 0, y: 0 }, g(1, 0), g(2, 0)],
        [g(0, 1), g(1, 1), g(2, 1)],
        [g(0, 2), g(1, 2), g(2, 2)]
      ],
      npcs: []
    };
    const cache = retroInjectQuestContent({
      townMapsCache: { Millhaven: town },
      requiredBuildings: { Millhaven: [{ type: 'archives', name: 'Hall of Echoes', milestoneId: 1 }] },
      milestones: [],
      worldSeed: 1
    });
    const t = cache.Millhaven;
    expect(t.mapData[0][0].buildingType).toBe('house');
    const placed = t.mapData.flat().find((tile) => tile.buildingType === 'archives');
    expect(placed).toBeDefined();
    expect(placed.questBuilding).toBe(true);
    expect(placed.buildingName).toBe('Hall of Echoes');
    expect(placed.walkable).toBe(false);
  });
});

// The single-row towns below have NO free ground, so they exercise the
// last-resort house swap (and its resident rehoming).
describe('retro house-swap rehomes displaced cached NPCs (playtest 2026-07-04)', () => {
  // The swap takes the FIRST house in scan order and the village Elder lives in
  // the FIRST residential site in scan order: systematically the same tile. Cached
  // towns never re-run populateTown, so without rehoming the Elder haunts the new
  // quest venue forever ("Leader of Millhaven" standing in the archives).
  const makeCachedTown = () => ({
    townName: 'Millhaven',
    mapData: [[
      { type: 'building', buildingType: 'house', x: 0, y: 0 },
      { type: 'building', buildingType: 'house', buildingName: 'The Reed Cottage', x: 1, y: 0 },
      { type: 'grass', x: 2, y: 0 }
    ]],
    npcs: [
      {
        name: 'Elder Anwen', job: 'Leader of Millhaven',
        location: { x: 0, y: 0, buildingType: 'house', buildingName: 'house', homeCoords: { x: 0, y: 0 } }
      },
      {
        name: 'Innkeep Roswyn', job: 'Innkeeper of The Gilded Goose', milestoneNpcId: null,
        location: { x: 2, y: 0, buildingType: 'tavern', buildingName: 'The Gilded Goose', homeCoords: { x: 2, y: 0 } }
      }
    ]
  });

  it('moves residents of the swapped house to another house (home AND workplace)', () => {
    const cache = retroInjectQuestContent({
      townMapsCache: { Millhaven: makeCachedTown() },
      requiredBuildings: { Millhaven: [{ type: 'archives', name: 'Hall of Echoes', milestoneId: 1 }] },
      milestones: [],
      worldSeed: 42
    });
    const town = cache.Millhaven;
    expect(town.mapData[0][0].buildingType).toBe('archives');
    const elder = town.npcs.find((n) => n.name === 'Elder Anwen');
    expect(elder.location.homeCoords).toEqual({ x: 1, y: 0 });
    expect(elder.location.x).toBe(1);
    expect(elder.location.buildingName).toBe('The Reed Cottage');
  });

  it('leaves NPCs in untouched buildings alone', () => {
    const cache = retroInjectQuestContent({
      townMapsCache: { Millhaven: makeCachedTown() },
      requiredBuildings: { Millhaven: [{ type: 'archives', name: 'Hall of Echoes', milestoneId: 1 }] },
      milestones: [],
      worldSeed: 42
    });
    const inn = cache.Millhaven.npcs.find((n) => n.name === 'Innkeep Roswyn');
    expect(inn.location).toEqual(makeCachedTown().npcs[1].location);
  });
});

describe('getNextCampaignOptions: openingAccessible (t1-to-t2 bridge, playtest 2026-07-04)', () => {
  it('marks an under-leveled t2 as accessible when its opening milestone is ungated', () => {
    const options = getNextCampaignOptions({
      settings: { storyTemplateId: 'heroic-fantasy-t1' },
      party: [{ level: 2 }, { level: 2 }, { level: 2 }],
      worldMap: null
    });
    const t2 = options.find((o) => o.template.id === 'heroic-fantasy-t2');
    expect(t2).toBeDefined();
    expect(t2.underLeveled).toBe(true);
    expect(t2.openingAccessible).toBe(true);
  });
});

describe('isOpeningAccessible (shared by picker, New Game note and hero selection)', () => {
  it('true when the first milestone has no minLevel', () => {
    expect(isOpeningAccessible([{ id: 1, text: 'x', minLevel: null }], 1)).toBe(true);
  });

  it('honours the first milestone minLevel against the party level', () => {
    const gated = [{ id: 1, text: 'x', minLevel: 5 }];
    expect(isOpeningAccessible(gated, 4)).toBe(false);
    expect(isOpeningAccessible(gated, 5)).toBe(true);
  });

  it('false with no milestones at all (nothing known to be reachable)', () => {
    expect(isOpeningAccessible([], 10)).toBe(false);
    expect(isOpeningAccessible(undefined, 10)).toBe(false);
  });
});

describe('getLevelFitNotice (hero-selection warning trigger, #72)', () => {
  const t2Settings = {
    levelRange: [3, 5],
    milestones: [{ id: 1, text: 'open', minLevel: null }, { id: 2, text: 'deep', minLevel: 4 }],
  };

  it('triggers when the band start exceeds EVERY selected hero level', () => {
    const notice = getLevelFitNotice(t2Settings, [{ heroLevel: 1 }, { heroLevel: 2 }]);
    expect(notice).toEqual({ levelRange: [3, 5], partyLevel: 2, openingAccessible: true });
  });

  it('stays silent when at least one hero reaches the band', () => {
    expect(getLevelFitNotice(t2Settings, [{ heroLevel: 1 }, { heroLevel: 3 }])).toBeNull();
  });

  it('stays silent with no selected heroes or no authored band (custom/freeform saves)', () => {
    expect(getLevelFitNotice(t2Settings, [])).toBeNull();
    expect(getLevelFitNotice({ milestones: t2Settings.milestones }, [{ heroLevel: 1 }])).toBeNull();
  });

  it('reports a gated opening (t3-style minLevel on milestone #1) as not accessible', () => {
    const t3Settings = { levelRange: [5, 7], milestones: [{ id: 1, text: 'x', minLevel: 5 }] };
    const notice = getLevelFitNotice(t3Settings, [{ heroLevel: 2 }]);
    expect(notice).toEqual({ levelRange: [5, 7], partyLevel: 2, openingAccessible: false });
  });

  it('reads both hero level field spellings (level / heroLevel)', () => {
    expect(getLevelFitNotice(t2Settings, [{ level: 4 }])).toBeNull();
    expect(getLevelFitNotice(t2Settings, [{ level: 2 }])?.partyLevel).toBe(2);
  });
});
