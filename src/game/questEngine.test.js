import {
  acceptSideQuest, checkSideQuestEvent, turnInQuest, getReadyTurnIns, getAvailableQuestsAt,
  getActiveSideQuests, getAvailableSideQuests, getCompletedSideQuests,
  getSideQuestProgress, getActiveSiteObjectives, selectSideQuests, effectivePartyLevel,
  deriveSideQuestAvailability, backfillSideQuests, applySideQuestBackfill,
} from './questEngine';
import { initialSideQuests, SIDE_QUESTS, QUEST_ITEM_ICON_FROM } from '../data/sideQuests';
import { ITEM_CATALOG } from '../utils/inventorySystem';

const seededRng = (seed) => { let s = seed; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };
const accept = (id) => acceptSideQuest(initialSideQuests(), id);
const find = (sq, id) => sq.find((q) => q.id === id);

describe('questEngine — basics', () => {
  test('side quests start available and inactive', () => {
    const sq = initialSideQuests();
    expect(getAvailableSideQuests(sq).length).toBe(sq.length);
    expect(getActiveSideQuests(sq).length).toBe(0);
  });

  test('accepting a quest activates only that one', () => {
    const sq = accept('lost_heirloom');
    expect(getActiveSideQuests(sq).map((q) => q.id)).toEqual(['lost_heirloom']);
  });

  test('events only affect ACTIVE quests', () => {
    const { completions } = checkSideQuestEvent(initialSideQuests(), { type: 'item_acquired', itemId: 'silver_locket' });
    expect(completions.length).toBe(0);
  });

  test('quests are offered by their giver building, not all at the inn', () => {
    const sq = initialSideQuests();
    // the wraith-lord quest is given at a temple/shrine, not an inn
    expect(getAvailableQuestsAt(sq, { buildingType: 'temple' }).map((q) => q.id)).toContain('ruin_menace');
    expect(getAvailableQuestsAt(sq, { buildingType: 'inn' }).map((q) => q.id)).not.toContain('ruin_menace');
    // the relic quest is offered at a library; a warehouse offers nothing
    expect(getAvailableQuestsAt(sq, { buildingType: 'library' }).map((q) => q.id)).toContain('relic_hunt');
    expect(getAvailableQuestsAt(sq, { buildingType: 'warehouse' }).length).toBe(0);
    // accepted/active quests are no longer "available" to offer
    const accepted = acceptSideQuest(sq, 'ruin_menace');
    expect(getAvailableQuestsAt(accepted, { buildingType: 'temple' }).map((q) => q.id)).not.toContain('ruin_menace');
  });

  test('quests are level-tiered: a high-minLevel quest is hidden until the party is strong', () => {
    const sq = initialSideQuests(); // ruin_menace is minLevel 4 (temple giver)
    expect(getAvailableQuestsAt(sq, { buildingType: 'temple', level: 1 }).map((q) => q.id)).not.toContain('ruin_menace');
    expect(getAvailableQuestsAt(sq, { buildingType: 'temple', level: 5 }).map((q) => q.id)).toContain('ruin_menace');
    // with no level in ctx, no level gate is applied
    expect(getAvailableQuestsAt(sq, { buildingType: 'temple' }).map((q) => q.id)).toContain('ruin_menace');
  });

  test('every quest find-item has an icon source (real catalog item or a borrowed icon — no new art)', () => {
    const findIds = new Set();
    initialSideQuests().forEach((q) => q.milestones.forEach((m) => {
      if (m.site && m.site.objectiveType === 'item') findIds.add(m.site.id);
    }));
    expect(findIds.size).toBeGreaterThan(0);
    findIds.forEach((id) => {
      const borrowed = QUEST_ITEM_ICON_FROM[id];
      // either it's already a catalog item, or it borrows an existing catalog item's icon
      expect(Boolean(ITEM_CATALOG[id]) || Boolean(borrowed && ITEM_CATALOG[borrowed])).toBe(true);
    });
  });

  test('effectivePartyLevel = lead level + party-size bonus', () => {
    expect(effectivePartyLevel([{ level: 3 }])).toBe(3);                          // solo
    expect(effectivePartyLevel([{ level: 3 }, { level: 2 }, { level: 1 }, { level: 2 }])).toBe(5); // lead 3 + 2
    expect(effectivePartyLevel([])).toBe(1);
  });

  test('getRevealedSiteTypes: secret until taken, sticky after completion', () => {
    const { getRevealedSiteTypes } = require('./questEngine');
    expect(getRevealedSiteTypes(initialSideQuests())).toEqual({}); // none taken -> all secret
    const active = acceptSideQuest(initialSideQuests(), 'ruin_menace');
    expect(getRevealedSiteTypes(active).ruins).toBe(true);
    expect(getRevealedSiteTypes(active).cave).toBeUndefined();
    // sticky: still revealed once completed
    const completed = active.map((q) => (q.id === 'ruin_menace' ? { ...q, status: 'completed' } : q));
    expect(getRevealedSiteTypes(completed).ruins).toBe(true);
  });

  test('site objectives exposed only for active quests (one list per site type)', () => {
    expect(getActiveSiteObjectives(initialSideQuests())).toEqual({});
    const objs = getActiveSiteObjectives(accept('ruin_menace'));
    expect(objs.ruins).toHaveLength(1);
    expect(objs.ruins[0].id).toBe('wraith_lord');
    expect(objs.cave).toBeUndefined();
  });
});

describe('questEngine: gather-quest site hints (playtest 2026-07-04)', () => {
  const { isQuestEligible, getRevealedSiteTypes } = require('./questEngine');
  const quest = (id) => SIDE_QUESTS.find((q) => q.id === id);
  const ALL_BUILDINGS = ['inn', 'tavern', 'temple', 'shrine', 'library', 'archives', 'magetower',
    'alchemist', 'apothecary', 'blacksmith', 'townhall'];

  test('gather quests carry their item-source sites', () => {
    expect(quest('tend_sick').milestones[0].sites).toEqual(['cave']);
    expect(quest('arcane_reagents').milestones[0].sites).toEqual(['cave']);
    expect(quest('field_samples').milestones[0].sites).toEqual(['cave']);
    expect(quest('storm_crystals').milestones[0].sites).toEqual(['mountain']);
    expect(quest('rare_ore').milestones[0].sites).toEqual(['cave', 'hills', 'mountain']);
  });

  test('an active gather quest reveals its source site type (sticky, like site steps)', () => {
    const active = acceptSideQuest(initialSideQuests(), 'tend_sick');
    expect(getRevealedSiteTypes(active).cave).toBe(true);
    // still merely available -> nothing revealed
    expect(getRevealedSiteTypes(initialSideQuests()).cave).toBeUndefined();
  });

  test('a gather quest is not offered when none of its source sites exist on the map', () => {
    const noMountain = { sites: { cave: true, ruins: true, forest: true, hills: false, mountain: false }, buildings: ALL_BUILDINGS };
    expect(isQuestEligible(quest('storm_crystals'), noMountain)).toBe(false);
    const withMountain = { sites: { ...noMountain.sites, mountain: true }, buildings: ALL_BUILDINGS };
    expect(isQuestEligible(quest('storm_crystals'), withMountain)).toBe(true);
  });

  test('a multi-source gather quest is eligible when ANY source site exists', () => {
    const hillsOnly = { sites: { cave: false, ruins: false, forest: false, hills: true, mountain: false }, buildings: ALL_BUILDINGS };
    expect(isQuestEligible(quest('rare_ore'), hillsOnly)).toBe(true);
    const noSources = { sites: { cave: false, ruins: false, forest: true, hills: false, mountain: false }, buildings: ALL_BUILDINGS };
    expect(isQuestEligible(quest('rare_ore'), noSources)).toBe(false);
  });

  test('several active quests for the same site type ALL expose their objectives', () => {
    let sq = acceptSideQuest(initialSideQuests(), 'lost_heirloom');
    sq = acceptSideQuest(sq, 'cursed_patient');
    const objs = getActiveSiteObjectives(sq);
    expect(objs.cave.map((o) => o.milestoneId).sort()).toEqual(['cp1', 'lh1']);
  });
});

describe('questEngine — return-to-giver (multi-step + turn-in)', () => {
  test('completing the objective advances the quest but does NOT finish it (turn-in remains)', () => {
    const sq = accept('lost_heirloom');
    const { updatedSideQuests, completions } = checkSideQuestEvent(sq, { type: 'item_acquired', itemId: 'silver_locket' });
    expect(completions.length).toBe(1);
    expect(completions[0].questCompleted).toBe(false);          // not done — must turn in
    expect(find(updatedSideQuests, 'lost_heirloom').status).toBe('active');
  });

  test('turning in at the inn after the objective completes the quest + grants quest reward', () => {
    let sq = accept('lost_heirloom');
    sq = checkSideQuestEvent(sq, { type: 'item_acquired', itemId: 'silver_locket' }).updatedSideQuests;
    // turn-in ready only at an inn/tavern
    expect(getReadyTurnIns(sq, { buildingType: 'shop' }).length).toBe(0);
    expect(getReadyTurnIns(sq, { buildingType: 'inn' }).map((q) => q.id)).toEqual(['lost_heirloom']);
    const { updatedSideQuests, completions } = turnInQuest(sq, { buildingType: 'inn' });
    expect(completions.some((c) => c.questCompleted)).toBe(true);
    expect(completions.find((c) => c.questCompleted).questRewards).toEqual({ xp: 60, gold: 120, items: [] });
    expect(find(updatedSideQuests, 'lost_heirloom').status).toBe('completed');
  });

  test('cannot turn in before the objective is done', () => {
    const sq = accept('lost_heirloom'); // objective not done
    expect(getReadyTurnIns(sq, { buildingType: 'inn' }).length).toBe(0);
    expect(turnInQuest(sq, { buildingType: 'inn' }).completions.length).toBe(0);
  });
});

describe('questEngine — count triggers (gather / bounty)', () => {
  test('a count objective completes only at the threshold', () => {
    let sq = accept('alchemist_reagents'); // collect 3 spider_silk
    const ev = { type: 'item_acquired', itemId: 'spider_silk' };
    sq = checkSideQuestEvent(sq, ev).updatedSideQuests;
    sq = checkSideQuestEvent(sq, ev).updatedSideQuests;
    expect(find(sq, 'alchemist_reagents').milestones[0].completed).toBe(false); // 2/3
    const third = checkSideQuestEvent(sq, ev);
    expect(third.completions.length).toBe(1); // 3/3 completes the objective step
    expect(find(third.updatedSideQuests, 'alchemist_reagents').milestones[0].completed).toBe(true);
  });

  test('"any" enemy bounty counts any kill', () => {
    let sq = accept('prove_mettle'); // defeat 3 of any
    for (let i = 0; i < 3; i++) sq = checkSideQuestEvent(sq, { type: 'enemy_defeated', enemyId: `mob_${i}` }).updatedSideQuests;
    expect(find(sq, 'prove_mettle').milestones[0].completed).toBe(true);
  });
});

describe('questEngine — courier / delivery', () => {
  test('letter quest turns in at the town hall, not an inn', () => {
    const sq = accept('sealed_letter'); // single turn-in step at townhall
    expect(getReadyTurnIns(sq, { buildingType: 'inn' }).length).toBe(0);
    expect(getReadyTurnIns(sq, { buildingType: 'townhall' }).map((q) => q.id)).toEqual(['sealed_letter']);
    const { updatedSideQuests, completions } = turnInQuest(sq, { buildingType: 'townhall' });
    expect(completions.find((c) => c.questCompleted)?.questRewards).toEqual({ xp: 50, gold: 100, items: [] });
    expect(find(updatedSideQuests, 'sealed_letter').status).toBe('completed');
  });
});

describe('questEngine — selection + eligibility (startable AND completable)', () => {
  // every giver / turn-in building used by the pool, so building-availability never filters
  // except where a test deliberately omits one.
  const ALL = ['inn', 'tavern', 'shop', 'mill', 'townhall', 'temple', 'shrine', 'library', 'archives', 'magetower', 'alchemist', 'apothecary'];
  const avail = (sites, buildings = ALL) => ({ sites, buildings });

  test('only picks quests whose target site exists (non-site quests always eligible)', () => {
    for (let s = 1; s <= 20; s++) {
      selectSideQuests(avail({ cave: true, ruins: false }), 2, seededRng(s)).forEach((q) => {
        const siteStep = q.milestones.find((m) => m.site);
        if (siteStep) expect(siteStep.site.type).toBe('cave');
      });
    }
  });

  test('fresh + available, capped to count, deterministic per seed', () => {
    const a = selectSideQuests(avail({ cave: true, ruins: true }), 2, seededRng(42));
    const b = selectSideQuests(avail({ cave: true, ruins: true }), 2, seededRng(42));
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
    expect(a.length).toBe(2);
    a.forEach((q) => { expect(q.status).toBe('available'); expect(q.milestones.every((m) => !m.completed)).toBe(true); });
  });

  test('a quest is excluded if its GIVER building is missing (unstartable)', () => {
    // ruin_menace is given at a temple/shrine; without either it can never be started
    const noTemple = ALL.filter((b) => b !== 'temple' && b !== 'shrine');
    const picked = selectSideQuests({ sites: { cave: true, ruins: true }, buildings: noTemple }, 9, seededRng(1));
    expect(picked.map((q) => q.id)).not.toContain('ruin_menace');
  });

  test('a quest is excluded if its TURN-IN building is missing (uncompletable)', () => {
    // sealed_letter must be handed in at a town hall; no town hall -> excluded
    const noHall = ALL.filter((b) => b !== 'townhall');
    const picked = selectSideQuests({ sites: { cave: true, ruins: true }, buildings: noHall }, 9, seededRng(1));
    expect(picked.map((q) => q.id)).not.toContain('sealed_letter');
  });

  test('a site quest is excluded if its site is missing even when buildings exist', () => {
    const picked = selectSideQuests({ sites: { cave: false, ruins: false }, buildings: ALL }, 9, seededRng(1));
    picked.forEach((q) => expect(q.milestones.some((m) => m.site)).toBe(false));
  });

  test('no eligible quests at all -> empty (no dead quests)', () => {
    // no sites and no giver buildings -> nothing is offerable
    expect(selectSideQuests({ sites: {}, buildings: [] }, 5, seededRng(1))).toEqual([]);
  });

  test('progress reporting counts all steps', () => {
    expect(getSideQuestProgress(find(accept('lost_heirloom'), 'lost_heirloom'))).toEqual({ done: 0, total: 2 });
  });
});

// ---------------------------------------------------------------------------
// #45 side-quest backfill: top up in-progress saves when the pool grows.
// ---------------------------------------------------------------------------
describe('questEngine — backfillSideQuests (#45 pool top-up)', () => {
  // A generous building set so availability never filters except where a test
  // deliberately restricts it. townCount 5 -> base 4 -> cap 6.
  const RICH = {
    sites: { cave: true, ruins: true },
    buildings: ['inn', 'tavern', 'shop', 'market', 'mill', 'townhall', 'temple', 'shrine',
      'library', 'archives', 'magetower', 'alchemist', 'apothecary', 'blacksmith', 'barn',
      'stables', 'guild', 'bank', 'warehouse', 'tailor', 'fletcher', 'foundry', 'harbormaster'],
    townCount: 5,
  };
  const asStatus = (ids, status) => ids.map((id) => ({ ...SIDE_QUESTS.find((q) => q.id === id), status }));

  test('excludes every id already present, regardless of status (completed included)', () => {
    const existing = [
      ...asStatus(['lost_heirloom'], 'completed'),
      ...asStatus(['prove_mettle'], 'active'),
      ...asStatus(['sealed_letter'], 'available'),
    ];
    const added = backfillSideQuests(existing, { availability: RICH, level: 99, rng: seededRng(3) });
    expect(added.length).toBeGreaterThan(0);
    const addedIds = added.map((q) => q.id);
    ['lost_heirloom', 'prove_mettle', 'sealed_letter'].forEach((id) => expect(addedIds).not.toContain(id));
  });

  test('cap counts OUTSTANDING quests only: a full open queue adds nothing…', () => {
    const full = asStatus(['lost_heirloom', 'prove_mettle', 'sealed_letter', 'cave_beast', 'tend_sick', 'sealed_vault'], 'available');
    expect(backfillSideQuests(full, { availability: RICH, level: 99, rng: seededRng(3) })).toEqual([]);
  });

  test('…but completed quests free their slots (long saves keep getting content)', () => {
    const done = asStatus(['lost_heirloom', 'prove_mettle', 'sealed_letter', 'cave_beast', 'tend_sick', 'sealed_vault'], 'completed');
    const added = backfillSideQuests(done, { availability: RICH, level: 99, rng: seededRng(3) });
    expect(added.length).toBe(6); // cap 6, nothing outstanding
    const doneIds = new Set(done.map((q) => q.id));
    added.forEach((q) => expect(doneIds.has(q.id)).toBe(false));
  });

  test('cap scales with townCount exactly like the initial selection, plus 2 headroom', () => {
    const empty = undefined;
    // 1 town -> base 2 -> cap 4; 10 towns -> base 4 (clamped) -> cap 6
    expect(backfillSideQuests(empty, { availability: { ...RICH, townCount: 1 }, level: 99, rng: seededRng(5) }).length).toBe(4);
    expect(backfillSideQuests(empty, { availability: { ...RICH, townCount: 10 }, level: 99, rng: seededRng(5) }).length).toBe(6);
  });

  test('deterministic given the rng', () => {
    const existing = asStatus(['lost_heirloom'], 'active');
    const a = backfillSideQuests(existing, { availability: RICH, level: 99, rng: seededRng(42) });
    const b = backfillSideQuests(existing, { availability: RICH, level: 99, rng: seededRng(42) });
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
  });

  test('availability gating matches initial selection: sites + giver + turn-in must exist', () => {
    const innOnly = { sites: {}, buildings: ['inn', 'tavern'], townCount: 3 };
    const added = backfillSideQuests([], { availability: innOnly, level: 99, rng: seededRng(9) });
    expect(added.length).toBeGreaterThan(0);
    added.forEach((q) => {
      const givers = Array.isArray(q.giver.building) ? q.giver.building : [q.giver.building];
      expect(givers.some((b) => b === 'inn' || b === 'tavern')).toBe(true);
      expect(q.milestones.some((m) => m.site)).toBe(false); // no cave/ruins on this map
      q.milestones.forEach((m) => {
        if (m.trigger?.turnIn?.building) {
          const tb = Array.isArray(m.trigger.turnIn.building) ? m.trigger.turnIn.building : [m.trigger.turnIn.building];
          expect(tb.some((b) => b === 'inn' || b === 'tavern')).toBe(true);
        }
      });
    });
  });

  test('level gate: only quests within reach soon (minLevel <= level + 2) are added', () => {
    const added = backfillSideQuests([], { availability: RICH, level: 1, rng: seededRng(11) });
    added.forEach((q) => expect(q.minLevel || 1).toBeLessThanOrEqual(3));
  });

  test('added quests are fresh available copies (no shared progress state)', () => {
    const added = backfillSideQuests([], { availability: RICH, level: 99, rng: seededRng(2) });
    added.forEach((q) => {
      expect(q.status).toBe('available');
      q.milestones.forEach((m) => { expect(m.completed).toBe(false); expect(m.progress).toBe(0); });
    });
  });

  test('degenerate map (no sites, no buildings) adds nothing and does not throw', () => {
    expect(backfillSideQuests(undefined, { availability: { sites: {}, buildings: [], townCount: 0 }, level: 99, rng: seededRng(1) })).toEqual([]);
  });
});

describe('questEngine — deriveSideQuestAvailability (#45 load-time availability)', () => {
  const world = [[
    { poi: 'town', townName: 'Aldwyn' },
    { poi: 'town', townName: 'Brimford' },
    { poi: 'cave_entrance' },
    { poi: 'ruins' },
    { biome: 'plains' },
  ]];
  const cache = {
    Aldwyn: { mapData: [[{ type: 'building', buildingType: 'inn' }, { type: 'building', buildingType: 'tavern' }, { type: 'grass' }]] },
    Brimford: { mapData: [[{ type: 'building', buildingType: 'temple' }, { type: 'building', buildingType: 'townhall' }]] },
  };

  test('sites come off world tiles exactly as at new-game (open types included)', () => {
    expect(deriveSideQuestAvailability(world, cache).sites)
      .toEqual({ cave: true, ruins: true, forest: false, hills: false, mountain: false });
    const noSites = [[{ poi: 'town', townName: 'A' }]];
    expect(deriveSideQuestAvailability(noSites, {}).sites)
      .toEqual({ cave: false, ruins: false, forest: false, hills: false, mountain: false });
    const openSites = [[{ poi: 'forest' }, { poi: 'hills' }, { poi: 'mountain' }]];
    expect(deriveSideQuestAvailability(openSites, {}).sites)
      .toEqual({ cave: false, ruins: false, forest: true, hills: true, mountain: true });
  });

  test('buildings are the union of cached town maps (confirmed-placed only)', () => {
    const { buildings } = deriveSideQuestAvailability(world, cache);
    expect(buildings.sort()).toEqual(['inn', 'tavern', 'temple', 'townhall'].sort());
  });

  test('townCount counts town POIs; tolerates a missing map/cache', () => {
    expect(deriveSideQuestAvailability(world, cache).townCount).toBe(2);
    expect(deriveSideQuestAvailability(undefined, undefined)).toEqual({
      sites: { cave: false, ruins: false, forest: false, hills: false, mountain: false },
      buildings: [],
      townCount: 0,
    });
  });
});

describe('questEngine — applySideQuestBackfill (#45 load-path wrapper + pool-size guard)', () => {
  // Two towns whose cached maps carry every giver/turn-in the pool needs, plus both sites.
  const world = [[
    { poi: 'town', townName: 'Aldwyn' },
    { poi: 'town', townName: 'Brimford' },
    { poi: 'town', townName: 'Carleon' },
    { poi: 'cave_entrance' },
    { poi: 'ruins' },
  ]];
  const b = (buildingType) => ({ type: 'building', buildingType });
  const townMapsCache = {
    Aldwyn: { mapData: [['inn', 'tavern', 'shop', 'market', 'townhall', 'mill'].map(b)] },
    Brimford: { mapData: [['temple', 'shrine', 'library', 'archives', 'magetower', 'blacksmith'].map(b)] },
    Carleon: { mapData: [['alchemist', 'apothecary', 'barn', 'stables', 'guild', 'bank'].map(b)] },
  };
  const party = [{ level: 5 }, { level: 3 }]; // effective level 6 -> gate 8 (whole pool)
  const baseSettings = (sideQuests) => ({ worldSeed: 12345, sideQuests });

  test('pool-size guard: a stamped save skips entirely (same reference back)', () => {
    const settings = { ...baseSettings([]), sideQuestPoolSize: SIDE_QUESTS.length };
    const { settings: out, added } = applySideQuestBackfill(settings, { worldMap: world, townMapsCache, party });
    expect(out).toBe(settings);
    expect(added).toEqual([]);
  });

  test('missing world map: skips WITHOUT stamping so a later good load can retry', () => {
    const settings = baseSettings([]);
    const { settings: out, added } = applySideQuestBackfill(settings, { worldMap: undefined, townMapsCache, party });
    expect(out).toBe(settings);
    expect(out.sideQuestPoolSize).toBeUndefined();
    expect(added).toEqual([]);
  });

  test('unstamped save tops up: appends new available quests, stamps the pool size, and never touches existing quests', () => {
    const existing = [
      { ...SIDE_QUESTS.find((q) => q.id === 'lost_heirloom'), status: 'active' },
      { ...SIDE_QUESTS.find((q) => q.id === 'prove_mettle'), status: 'completed' },
    ];
    const settings = baseSettings(existing);
    const { settings: out, added } = applySideQuestBackfill(settings, { worldMap: world, townMapsCache, party });
    expect(added.length).toBeGreaterThan(0);
    expect(out.sideQuestPoolSize).toBe(SIDE_QUESTS.length);
    // existing entries survive by reference, in order, states untouched
    expect(out.sideQuests.slice(0, existing.length)).toEqual(existing);
    expect(out.sideQuests[0]).toBe(existing[0]);
    expect(out.sideQuests[0].status).toBe('active');
    expect(out.sideQuests[1].status).toBe('completed');
    // appended quests are new ids, fresh 'available'
    const existingIds = new Set(existing.map((q) => q.id));
    added.forEach((q) => { expect(existingIds.has(q.id)).toBe(false); expect(q.status).toBe('available'); });
    expect(out.sideQuests.length).toBe(existing.length + added.length);
  });

  test('idempotent: applying the result again is a pure no-op (same reference)', () => {
    const first = applySideQuestBackfill(baseSettings([]), { worldMap: world, townMapsCache, party });
    const second = applySideQuestBackfill(first.settings, { worldMap: world, townMapsCache, party });
    expect(second.settings).toBe(first.settings);
    expect(second.added).toEqual([]);
  });

  test('deterministic per save: recomputing before the stamp persists adds the same quests', () => {
    const a = applySideQuestBackfill(baseSettings([]), { worldMap: world, townMapsCache, party });
    const b2 = applySideQuestBackfill(baseSettings([]), { worldMap: world, townMapsCache, party });
    expect(a.added.map((q) => q.id)).toEqual(b2.added.map((q) => q.id));
  });

  test('guard recomputes only when the pool size actually changed', () => {
    // stamped at a smaller (old) pool size -> the pool "grew" -> recompute + restamp
    const grown = { ...baseSettings([]), sideQuestPoolSize: SIDE_QUESTS.length - 5 };
    const { settings: out } = applySideQuestBackfill(grown, { worldMap: world, townMapsCache, party });
    expect(out).not.toBe(grown);
    expect(out.sideQuestPoolSize).toBe(SIDE_QUESTS.length);
  });

  test('a very old save with NO sideQuests field gets a fresh selection-equivalent backfill', () => {
    const settings = { worldSeed: 777 }; // no sideQuests key at all
    const { settings: out, added } = applySideQuestBackfill(settings, { worldMap: world, townMapsCache, party });
    expect(added.length).toBeGreaterThanOrEqual(2); // at least the new-game minimum
    expect(out.sideQuests).toEqual(added);
    out.sideQuests.forEach((q) => expect(q.status).toBe('available'));
    expect(out.sideQuestPoolSize).toBe(SIDE_QUESTS.length);
  });

  test('guests included: no auth/provider input exists on the pure path at all', () => {
    // The wrapper depends only on settings + map data; absence of any user context
    // must not throw or change behavior.
    const { added } = applySideQuestBackfill(baseSettings([]), { worldMap: world, townMapsCache, party: [] });
    expect(added.length).toBeGreaterThan(0);
  });

  test('nothing eligible still stamps (cheap skip forever after), without inventing quests', () => {
    const barren = [[{ poi: 'town', townName: 'A' }]]; // no sites, no cached buildings
    const settings = baseSettings([]);
    const { settings: out, added } = applySideQuestBackfill(settings, { worldMap: barren, townMapsCache: {}, party });
    expect(added).toEqual([]);
    expect(out.sideQuestPoolSize).toBe(SIDE_QUESTS.length);
    expect(out.sideQuests).toEqual([]);
    // and the stamped result short-circuits next time
    expect(applySideQuestBackfill(out, { worldMap: barren, townMapsCache: {}, party }).settings).toBe(out);
  });
});
