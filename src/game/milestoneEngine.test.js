import {
  getMilestoneNpcsForTown,
  checkMilestoneCompletion,
  completeNarrativeMilestone,
  findMarkerMilestoneIndex,
  resolveTalkMarkerMilestone,
  getMilestoneBossForTile,
  isMilestoneItemClaimed,
  getMilestoneItemForTile,
  getMilestoneLocationForTile
} from './milestoneEngine';

// Mirrors the heroic-fantasy-t1 milestone #2 shape (authored NPC + quest building).
const milestones = [
  {
    id: 1,
    text: 'Find the goblin scout\'s map in the Willowdale tavern',
    location: 'Willowdale',
    type: 'item',
    spawn: { type: 'item', id: 'map_fragment', name: 'Goblin Scout\'s Map', location: 'Willowdale' },
    building: { type: 'tavern', name: 'The Crooked Pint', location: 'Willowdale' }
  },
  {
    id: 2,
    text: 'Meet the militia captain at Briarwood',
    location: 'Briarwood',
    type: 'narrative',
    spawn: { type: 'npc', id: 'militia_captain', name: 'Captain Marta', location: 'Briarwood', role: 'Guard', personality: 'gruff, practical, protective of her people' },
    building: { type: 'barracks', name: 'Briarwood Militia Hall', location: 'Briarwood' }
  },
  {
    id: 3,
    text: 'Track the goblins to their hideout',
    location: 'Greenridge Hills',
    type: 'location',
    spawn: { type: 'poi', id: 'goblin_hideout', name: 'Goblin Hideout', location: 'Greenridge Hills' },
    building: null
  }
];

describe('getMilestoneNpcsForTown', () => {
  it('returns the authored NPC (with building + personality) for its town', () => {
    const npcs = getMilestoneNpcsForTown(milestones, 'Briarwood');
    expect(npcs).toHaveLength(1);
    expect(npcs[0]).toMatchObject({
      id: 'militia_captain',
      name: 'Captain Marta',
      role: 'Guard',
      personality: 'gruff, practical, protective of her people',
      milestoneId: 2,
      location: 'Briarwood',
      building: { type: 'barracks', name: 'Briarwood Militia Hall' }
    });
  });

  it('is case-insensitive on the town name', () => {
    expect(getMilestoneNpcsForTown(milestones, 'briarwood')).toHaveLength(1);
  });

  it('ignores non-npc spawns (items, POIs)', () => {
    expect(getMilestoneNpcsForTown(milestones, 'Willowdale')).toEqual([]);
    expect(getMilestoneNpcsForTown(milestones, 'Greenridge Hills')).toEqual([]);
  });

  it('returns [] for towns with no authored NPC and tolerates bad input', () => {
    expect(getMilestoneNpcsForTown(milestones, 'Nowhere')).toEqual([]);
    expect(getMilestoneNpcsForTown(null, 'Briarwood')).toEqual([]);
    expect(getMilestoneNpcsForTown(milestones, null)).toEqual([]);
  });

  it('falls back to the building location when the spawn omits location', () => {
    const ms = [{
      id: 9,
      type: 'narrative',
      spawn: { type: 'npc', id: 'x', name: 'Someone' },
      building: { type: 'inn', name: 'The Rest', location: 'Farhaven' }
    }];
    const npcs = getMilestoneNpcsForTown(ms, 'Farhaven');
    expect(npcs).toHaveLength(1);
    expect(npcs[0].name).toBe('Someone');
    expect(npcs[0].role).toBe('Villager'); // default when role unspecified
  });
});

describe("'talk' milestones (deterministic NPC-talk completion)", () => {
  // Mirrors the heroic-fantasy-t1 milestone #2 shape after the Option C change.
  const talkMilestones = [
    {
      id: 1,
      text: 'Find the goblin scout\'s map',
      type: 'item',
      completed: false,
      requires: [],
      trigger: { item: 'map_fragment', action: 'acquire' }
    },
    {
      id: 2,
      text: 'Meet the militia captain at Briarwood',
      type: 'talk',
      completed: false,
      requires: [],
      trigger: { npc: 'militia_captain', action: 'talk' },
      spawn: { type: 'npc', id: 'militia_captain', name: 'Captain Ulric', role: 'Guard' },
      building: { type: 'barracks', name: 'Briarwood Militia Hall', location: 'Briarwood' },
      rewards: { xp: 25, gold: '1d6', items: ['rations'] }
    }
  ];

  it('completes on npc_talked with the matching npcId', () => {
    const result = checkMilestoneCompletion(talkMilestones, { type: 'npc_talked', npcId: 'militia_captain' });
    expect(result).toMatchObject({ type: 'completed', milestoneId: 2 });
    expect(result.updatedMilestones.find(m => m.id === 2).completed).toBe(true);
  });

  it('ignores npc_talked with the wrong npcId', () => {
    expect(checkMilestoneCompletion(talkMilestones, { type: 'npc_talked', npcId: 'someone_else' })).toBeNull();
  });

  it('ignores other event types for a talk milestone', () => {
    expect(checkMilestoneCompletion(talkMilestones, { type: 'location_visited', locationId: 'militia_captain' })).toBeNull();
    expect(checkMilestoneCompletion(talkMilestones, { type: 'item_acquired', itemId: 'militia_captain' })).toBeNull();
  });

  it('reports blocked when prerequisites are unmet', () => {
    const gated = talkMilestones.map(m => (m.id === 2 ? { ...m, requires: [1] } : m));
    const result = checkMilestoneCompletion(gated, { type: 'npc_talked', npcId: 'militia_captain' });
    expect(result).toMatchObject({ type: 'blocked', milestoneId: 2 });
  });

  it('does not re-complete an already completed talk milestone', () => {
    const done = talkMilestones.map(m => (m.id === 2 ? { ...m, completed: true } : m));
    expect(checkMilestoneCompletion(done, { type: 'npc_talked', npcId: 'militia_captain' })).toBeNull();
  });

  it('completeNarrativeMilestone still refuses non-narrative milestones', () => {
    expect(completeNarrativeMilestone(talkMilestones, 2)).toBeNull(); // 'talk'
    expect(completeNarrativeMilestone(talkMilestones, 1)).toBeNull(); // 'item'
  });
});

describe('findMarkerMilestoneIndex (AI [COMPLETE_MILESTONE] guard)', () => {
  const ms = [
    { id: 1, text: 'Meet the militia captain at Briarwood', type: 'talk', completed: false },
    { id: 2, text: 'Convince the elders to evacuate the valley', type: 'narrative', completed: false },
    { id: 3, text: 'An old string milestone', completed: false } // legacy: no type
  ];

  it('matches narrative milestones by fuzzy text (either direction)', () => {
    expect(findMarkerMilestoneIndex(ms, 'Convince the elders to evacuate the valley')).toBe(1);
    expect(findMarkerMilestoneIndex(ms, 'convince the elders')).toBe(1); // marker is a substring
    expect(findMarkerMilestoneIndex(ms, 'The party managed to convince the elders to evacuate the valley at last')).toBe(1);
  });

  it("never matches mechanical milestones ('talk' here) even on exact text", () => {
    expect(findMarkerMilestoneIndex(ms, 'Meet the militia captain at Briarwood')).toBe(-1);
  });

  it('still matches legacy untyped milestones (old string saves)', () => {
    expect(findMarkerMilestoneIndex(ms, 'An old string milestone')).toBe(2);
  });

  it('skips completed milestones', () => {
    const done = ms.map(m => (m.id === 2 ? { ...m, completed: true } : m));
    expect(findMarkerMilestoneIndex(done, 'convince the elders')).toBe(-1);
  });

  it('tolerates bad input', () => {
    expect(findMarkerMilestoneIndex(null, 'x')).toBe(-1);
    expect(findMarkerMilestoneIndex(ms, '')).toBe(-1);
    expect(findMarkerMilestoneIndex(ms, '   ')).toBe(-1);
    expect(findMarkerMilestoneIndex([{ id: 9, completed: false }], 'anything')).toBe(-1); // no text
  });

  it('refuses a locked narrative milestone whose text leaks into the prompt (hardening)', () => {
    const gated = [
      { id: 1, text: 'Recover the seal', type: 'narrative', completed: false },
      { id: 2, text: 'Convince the elders to evacuate the valley', type: 'narrative', completed: false, requires: [1] }
    ];
    // #2 is locked (requires #1, not done): the marker must NOT complete it.
    expect(findMarkerMilestoneIndex(gated, 'convince the elders')).toBe(-1);
    // Once #1 is done, #2 becomes eligible.
    const unlocked = gated.map(m => (m.id === 1 ? { ...m, completed: true } : m));
    expect(findMarkerMilestoneIndex(unlocked, 'convince the elders')).toBe(1);
  });
});

describe('resolveTalkMarkerMilestone (talk dual-completion, fail-closed)', () => {
  // Two active talk objectives with distinct NPCs, plus a narrative milestone.
  const base = [
    {
      id: 1,
      text: 'Speak with Captain Ulric about the raids',
      type: 'talk',
      completed: false,
      requires: [],
      trigger: { npc: 'militia_captain', action: 'talk' },
      spawn: { type: 'npc', id: 'militia_captain', name: 'Captain Ulric', role: 'Guard' }
    },
    {
      id: 2,
      text: 'Consult the sage Ellara at the archive',
      type: 'talk',
      completed: false,
      requires: [],
      trigger: { npc: 'sage_ellara', action: 'talk' },
      spawn: { type: 'npc', id: 'sage_ellara', name: 'Ellara', role: 'Sage' }
    },
    { id: 3, text: 'Convince the elders to evacuate', type: 'narrative', completed: false }
  ];

  it('resolves the active talk objective when its NPC is present and text matches', () => {
    const m = resolveTalkMarkerMilestone(base, 'Speak with Captain Ulric about the raids', ['militia_captain']);
    expect(m).not.toBeNull();
    expect(m.id).toBe(1);
    expect(m.trigger.npc).toBe('militia_captain');
  });

  it('matches fuzzily (marker is a substring of the milestone text)', () => {
    const m = resolveTalkMarkerMilestone(base, 'speak with captain ulric', ['militia_captain']);
    expect(m?.id).toBe(1);
  });

  it('returns null when the NPC is NOT present (party elsewhere)', () => {
    // Text matches milestone #1, but Ulric is not among the present NPCs.
    expect(resolveTalkMarkerMilestone(base, 'Speak with Captain Ulric', ['sage_ellara'])).toBeNull();
    expect(resolveTalkMarkerMilestone(base, 'Speak with Captain Ulric', [])).toBeNull();
  });

  it('returns null when prerequisites are unmet (locked talk milestone)', () => {
    const gated = base.map(m => (m.id === 1 ? { ...m, requires: [99] } : m)); // 99 never completes
    expect(resolveTalkMarkerMilestone(gated, 'Speak with Captain Ulric', ['militia_captain'])).toBeNull();
  });

  it('returns null when ambiguous: two active talk milestones both text-match', () => {
    const ambiguous = [
      { id: 1, text: 'Speak with the captain', type: 'talk', completed: false, requires: [], trigger: { npc: 'cap_a' } },
      { id: 2, text: 'Speak with the captain', type: 'talk', completed: false, requires: [], trigger: { npc: 'cap_b' } }
    ];
    // Both NPCs present, both texts match the marker => ambiguous => fail closed.
    expect(resolveTalkMarkerMilestone(ambiguous, 'Speak with the captain', ['cap_a', 'cap_b'])).toBeNull();
  });

  it('does not resolve a narrative milestone (talk-only)', () => {
    expect(resolveTalkMarkerMilestone(base, 'Convince the elders to evacuate', ['militia_captain'])).toBeNull();
  });

  it('does not resolve an already-completed talk milestone', () => {
    const done = base.map(m => (m.id === 1 ? { ...m, completed: true } : m));
    expect(resolveTalkMarkerMilestone(done, 'Speak with Captain Ulric', ['militia_captain'])).toBeNull();
  });

  it('tolerates bad input', () => {
    expect(resolveTalkMarkerMilestone(null, 'x', ['a'])).toBeNull();
    expect(resolveTalkMarkerMilestone(base, '', ['militia_captain'])).toBeNull();
    expect(resolveTalkMarkerMilestone(base, '   ', ['militia_captain'])).toBeNull();
    expect(resolveTalkMarkerMilestone(base, 'Speak with Captain Ulric', null)).toBeNull();
  });

  it('idempotency + reward parity: findMarkerMilestoneIndex never claims a talk milestone; talk goes through the resolver only', () => {
    // The narrative marker path (findMarkerMilestoneIndex) must ignore talk milestones,
    // so a talk objective can ONLY complete via resolveTalkMarkerMilestone -> npc_talked.
    expect(findMarkerMilestoneIndex(base, 'Speak with Captain Ulric about the raids')).toBe(-1);
    const m = resolveTalkMarkerMilestone(base, 'Speak with Captain Ulric about the raids', ['militia_captain']);
    expect(m?.trigger.npc).toBe('militia_captain');
    // The engine event is idempotent: once completed, a second npc_talked returns null.
    const after = base.map(x => (x.id === 1 ? { ...x, completed: true } : x));
    expect(checkMilestoneCompletion(after, { type: 'npc_talked', npcId: 'militia_captain' })).toBeNull();
  });
});

describe('getMilestoneBossForTile (milestone boss fights on world tiles)', () => {
  // Mirrors heroic-fantasy-t1 milestones 3 (hideout POI) + 4 (chieftain boss).
  const bossEncounter = {
    name: 'Goblin Chieftain',
    encounterTier: 'boss',
    enemyHP: 30,
    suggestedActions: [{ label: 'Fight', skill: 'Athletics' }],
    consequences: { success: 'ok' },
    rewards: { xp: 75 }
  };
  const campaign = (overrides = {}) => ([
    { id: 3, text: 'Track the goblins to their hideout', location: 'Greenridge Hills', type: 'location', completed: true, requires: [], trigger: { location: 'goblin_hideout', action: 'visit' }, spawn: { type: 'poi', id: 'goblin_hideout', name: 'Goblin Hideout', location: 'Greenridge Hills' } },
    { id: 4, text: 'Defeat the Goblin Chieftain', location: 'Greenridge Hills', type: 'combat', completed: false, requires: [3], trigger: { enemy: 'goblin_chieftain', action: 'defeat' }, spawn: { type: 'enemy', id: 'goblin_chieftain', name: 'Goblin Chieftain', location: 'Greenridge Hills' }, encounter: bossEncounter, ...overrides }
  ]);

  const hideoutTile = { poi: 'goblin_hideout', poiName: 'Goblin Hideout', milestonePoi: true };

  it('offers the boss on the milestone POI tile once prerequisites are met', () => {
    const boss = getMilestoneBossForTile(campaign(), hideoutTile);
    expect(boss).toBeTruthy();
    expect(boss.enemyId).toBe('goblin_chieftain');
    expect(boss.name).toBe('Goblin Chieftain');
    expect(boss.encounter).toMatchObject({ enemyHP: 30, isMilestoneBoss: true, milestoneId: 4 });
  });

  it('offers the boss on a tile stamped with milestoneEnemy directly', () => {
    const tile = { milestoneEnemy: 'goblin_chieftain', milestoneEnemyName: 'Goblin Chieftain' };
    const boss = getMilestoneBossForTile(campaign(), tile);
    expect(boss).toBeTruthy();
    expect(boss.encounter.isMilestoneBoss).toBe(true);
  });

  it('withholds the boss while prerequisites are unmet', () => {
    const locked = campaign().map(m => (m.id === 3 ? { ...m, completed: false } : m));
    expect(getMilestoneBossForTile(locked, hideoutTile)).toBeNull();
  });

  it('withholds the boss once the combat milestone is completed', () => {
    const done = campaign({ completed: true });
    expect(getMilestoneBossForTile(done, hideoutTile)).toBeNull();
  });

  it('returns null for plain tiles and bad input', () => {
    expect(getMilestoneBossForTile(campaign(), { poi: 'mountain' })).toBeNull();
    expect(getMilestoneBossForTile(campaign(), null)).toBeNull();
    expect(getMilestoneBossForTile(null, hideoutTile)).toBeNull();
  });
});

describe('isMilestoneItemClaimed (quest-item search gating)', () => {
  const ms = (completed) => ([{
    id: 1,
    text: 'Find the goblin scout\'s map',
    type: 'item',
    completed,
    trigger: { item: 'map_fragment', action: 'acquire' },
    spawn: { type: 'item', id: 'map_fragment', name: 'Goblin Scout\'s Map' }
  }]);

  it('is false while the item milestone is incomplete (search still offered)', () => {
    expect(isMilestoneItemClaimed(ms(false), 'map_fragment')).toBe(false);
  });

  it('is true once the item milestone completes (search hidden)', () => {
    expect(isMilestoneItemClaimed(ms(true), 'map_fragment')).toBe(true);
  });

  it('matches via spawn id even when trigger is absent', () => {
    const spawnOnly = [{ id: 1, completed: true, spawn: { type: 'item', id: 'map_fragment' } }];
    expect(isMilestoneItemClaimed(spawnOnly, 'map_fragment')).toBe(true);
  });

  it('is false for other items and tolerates bad input', () => {
    expect(isMilestoneItemClaimed(ms(true), 'other_item')).toBe(false);
    expect(isMilestoneItemClaimed(null, 'map_fragment')).toBe(false);
    expect(isMilestoneItemClaimed(ms(true), null)).toBe(false);
  });
});

describe('getMilestoneItemForTile (wilderness item milestones)', () => {
  // Mirrors grimdark-survival-t1 milestone #1 ("Gather healing herbs from the Grey Moors").
  const herbs = (overrides = {}) => ({
    id: 1,
    text: 'Gather healing herbs from the Grey Moors for the village healer',
    location: 'Grey Moors',
    type: 'item',
    completed: false,
    requires: [],
    trigger: { item: 'healing_herbs', action: 'acquire' },
    spawn: { type: 'item', id: 'healing_herbs', name: 'Moorland Herbs', location: 'Grey Moors' },
    building: null,
    ...overrides
  });
  const moorTile = { poi: 'mountain', mountainName: 'Grey Moors' };

  it('offers the gather on a tile of the authored mountain range', () => {
    const g = getMilestoneItemForTile([herbs()], moorTile);
    expect(g).toEqual({ itemId: 'healing_herbs', name: 'Moorland Herbs', milestoneId: 1 });
  });

  it('matches case-insensitively and via poiName/townName too', () => {
    expect(getMilestoneItemForTile([herbs()], { mountainName: 'grey moors' })).toBeTruthy();
    expect(getMilestoneItemForTile([herbs()], { poiName: 'Grey Moors' })).toBeTruthy();
  });

  it('withholds once completed, when requirements are unmet, or elsewhere', () => {
    expect(getMilestoneItemForTile([herbs({ completed: true })], moorTile)).toBeNull();
    const gated = [herbs({ requires: [9] }), { id: 9, type: 'location', completed: false }];
    expect(getMilestoneItemForTile(gated, moorTile)).toBeNull();
    expect(getMilestoneItemForTile([herbs()], { mountainName: 'Cinder Mountains' })).toBeNull();
  });

  it('excludes town-building item milestones (those use the building search)', () => {
    const townItem = herbs({
      location: 'Willowdale',
      spawn: { type: 'item', id: 'map_fragment', name: 'Map', location: 'Willowdale' },
      building: { type: 'tavern', name: 'The Crooked Pint', location: 'Willowdale' }
    });
    expect(getMilestoneItemForTile([townItem], { townName: 'Willowdale' })).toBeNull();
  });

  it('tolerates bad input and unnamed tiles', () => {
    expect(getMilestoneItemForTile(null, moorTile)).toBeNull();
    expect(getMilestoneItemForTile([herbs()], null)).toBeNull();
    expect(getMilestoneItemForTile([herbs()], { poi: 'mountain' })).toBeNull();
  });
});

describe('getMilestoneLocationForTile (searchable location milestones)', () => {
  // Mirrors frozen-frontier-t2 milestone #2 ("Search the silent steading outside Frosthollow").
  const steading = (overrides = {}) => ({
    id: 2,
    text: 'Search the silent steading outside Frosthollow',
    location: 'Frosthollow',
    type: 'location',
    completed: false,
    requires: [],
    trigger: { location: 'silent_steading', action: 'visit' },
    spawn: { type: 'poi', id: 'silent_steading', name: 'The Silent Steading', location: 'Frosthollow' },
    building: null,
    ...overrides
  });
  // The spawner stamps the poi id onto the tile as `tile.poi`.
  const steadingTile = { poi: 'silent_steading', poiName: 'The Silent Steading', milestonePoi: true };

  it('offers the search when the party stands on the milestone POI tile', () => {
    const s = getMilestoneLocationForTile([steading()], steadingTile);
    expect(s).toEqual({ locationId: 'silent_steading', name: 'The Silent Steading', milestoneId: 2 });
  });

  it('withholds once completed', () => {
    expect(getMilestoneLocationForTile([steading({ completed: true })], steadingTile)).toBeNull();
  });

  it('withholds while prerequisites are unmet (locked location milestone)', () => {
    const gated = [steading({ requires: [1] }), { id: 1, type: 'item', completed: false }];
    expect(getMilestoneLocationForTile(gated, steadingTile)).toBeNull();
    const met = [steading({ requires: [1] }), { id: 1, type: 'item', completed: true }];
    expect(getMilestoneLocationForTile(met, steadingTile)).toBeTruthy();
  });

  it('does not fire on a different POI tile', () => {
    expect(getMilestoneLocationForTile([steading()], { poi: 'famine_barrow' })).toBeNull();
    expect(getMilestoneLocationForTile([steading()], { poi: 'mountain' })).toBeNull();
  });

  it('shows even for a minLevel-gated milestone (the click surfaces level_blocked)', () => {
    // Level is checked at completion time, not visibility time (mirrors boss fights).
    const s = getMilestoneLocationForTile([steading({ minLevel: 3 })], steadingTile);
    expect(s).toBeTruthy();
  });

  it('tolerates bad input and unnamed tiles', () => {
    expect(getMilestoneLocationForTile(null, steadingTile)).toBeNull();
    expect(getMilestoneLocationForTile([steading()], null)).toBeNull();
    expect(getMilestoneLocationForTile([steading()], {})).toBeNull();
  });
});

describe('migrateNarrativeMilestones (#76 legacy heal)', () => {
  const { migrateNarrativeMilestones } = require('./milestoneEngine');

  it('converts a narrative milestone with an npc spawn to a talk milestone', () => {
    const ms = [{ id: 2, type: 'narrative', trigger: null, spawn: { type: 'npc', id: 'quest_npc_smith', name: 'Smith' } }];
    const out = migrateNarrativeMilestones(ms);
    expect(out[0].type).toBe('talk');
    expect(out[0].trigger).toEqual({ npc: 'quest_npc_smith' });
  });

  it('converts poi -> location and item -> item off the spawn', () => {
    const out = migrateNarrativeMilestones([
      { id: 1, type: 'narrative', trigger: null, spawn: { type: 'poi', id: 'quest_poi_shrine' } },
      { id: 2, type: 'narrative', trigger: null, spawn: { type: 'item', id: 'quest_relic' } },
    ]);
    expect(out[0]).toMatchObject({ type: 'location', trigger: { location: 'quest_poi_shrine' } });
    expect(out[1]).toMatchObject({ type: 'item', trigger: { item: 'quest_relic' } });
  });

  it('leaves a narrative milestone with no convertible spawn as-is', () => {
    const ms = [{ id: 1, type: 'narrative', trigger: null, spawn: null }];
    expect(migrateNarrativeMilestones(ms)[0].type).toBe('narrative');
  });

  it('is idempotent: returns the SAME array ref when nothing needs migrating', () => {
    const ms = [{ id: 1, type: 'talk', trigger: { npc: 'x' } }, { id: 2, type: 'item', trigger: { item: 'y' } }];
    expect(migrateNarrativeMilestones(ms)).toBe(ms);
    const migrated = migrateNarrativeMilestones([{ id: 1, type: 'narrative', spawn: { type: 'npc', id: 'z' } }]);
    expect(migrateNarrativeMilestones(migrated)).toBe(migrated); // second pass no-ops
  });
});
