// suggestedActions (#91): engine-derived chips only point at places the player already knows.

import { getSuggestedActions, MAX_SUGGESTIONS, recommendedLevel } from './suggestedActions';

const grid = (w, h, fill = () => ({ biome: 'plains' })) =>
  Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => ({ x, y, ...fill(x, y) })));

const world = () => {
  const g = grid(8, 8);
  g[0][0] = { ...g[0][0], poi: 'town', townName: 'Snowley' };
  g[0][5] = { ...g[0][5], poi: 'town', townName: 'Willowdale' };
  g[7][7] = { ...g[7][7], poi: 'town', townName: 'Briarwood' };
  g[4][4] = { ...g[4][4], poi: 'goblin_hideout', milestonePoi: true, poiName: 'Goblin Hideout' };
  g[6][1] = { ...g[6][1], poi: 'cave' };
  return g;
};

const milestones = () => [
  { id: 1, type: 'item', location: 'Willowdale', requires: [], trigger: { item: 'map' },
    building: { type: 'tavern', name: 'The Crooked Pint', location: 'Willowdale' } },
  { id: 2, type: 'talk', location: 'Briarwood', requires: [], trigger: { npc: 'ulric' },
    spawn: { type: 'npc', name: 'Captain Ulric', location: 'Briarwood' },
    building: { type: 'barracks', name: 'Briarwood Militia Hall', location: 'Briarwood' } },
  { id: 3, type: 'location', location: 'Greenridge Hills', requires: [1, 2],
    trigger: { location: 'goblin_hideout' }, spawn: { type: 'poi', id: 'goblin_hideout', name: 'Goblin Hideout' } },
];

const labels = (chips) => chips.map((c) => c.label);

describe('getSuggestedActions', () => {
  it('offers Enter on a town tile and travel to active milestone towns, nearest first', () => {
    const chips = getSuggestedActions({ worldMap: world(), playerPosition: { x: 0, y: 0 }, milestones: milestones() });
    expect(labels(chips)).toEqual(['Enter Snowley', 'Travel to Willowdale', 'Travel to Briarwood']);
    expect(chips[1]).toMatchObject({ kind: 'travel', target: { x: 5, y: 0 } });
  });

  it('never suggests a locked milestone place (the hideout stays hidden until 1 and 2 are done)', () => {
    const chips = getSuggestedActions({ worldMap: world(), playerPosition: { x: 2, y: 2 }, milestones: milestones() });
    expect(labels(chips)).not.toContain('Travel to Goblin Hideout');
    const done = milestones().map((m) => (m.id < 3 ? { ...m, completed: true } : m));
    const later = getSuggestedActions({ worldMap: world(), playerPosition: { x: 2, y: 2 }, milestones: done });
    expect(labels(later)).toEqual(['Travel to Goblin Hideout']);
  });

  it('sends a POI step to its POI even when its location names a town', () => {
    const ms = [{ id: 1, type: 'location', location: 'Willowdale', requires: [],
      trigger: { location: 'goblin_hideout' }, spawn: { type: 'poi', id: 'goblin_hideout', name: 'Goblin Hideout', location: 'Willowdale' } }];
    const chips = getSuggestedActions({ worldMap: world(), playerPosition: { x: 0, y: 0 }, milestones: ms });
    expect(chips.find((c) => c.kind === 'travel')).toMatchObject({ label: 'Travel to Goblin Hideout', target: { x: 4, y: 4 } });
  });

  it('inside the milestone town, walks to the quest building (Talk to for NPC milestones)', () => {
    const town = grid(5, 5, () => ({ type: 'grass' }));
    town[1][3] = { ...town[1][3], type: 'building', buildingType: 'barracks', buildingName: 'Briarwood Militia Hall' };
    const chips = getSuggestedActions({
      mapLevel: 'town', worldMap: world(), playerPosition: { x: 7, y: 7 },
      townMap: town, townName: 'Briarwood', townPosition: { x: 0, y: 4 }, milestones: milestones(),
    });
    expect(chips[0]).toMatchObject({ label: 'Talk to Captain Ulric', kind: 'walk', target: { x: 3, y: 1 } });
    // The other active milestone's town is still offered, from inside town.
    expect(labels(chips)).toContain('Travel to Willowdale');
    expect(labels(chips)).not.toContain('Enter Briarwood');
  });

  it('offers Leave inside a site only at its entrance, ahead of Look around', () => {
    const site = { mapLevel: 'site', worldMap: world(), playerPosition: { x: 0, y: 0 }, siteName: 'Mossy Cave', hookWaiting: true };
    expect(labels(getSuggestedActions({ ...site, atSiteExit: true }))).toEqual(['Leave Mossy Cave', 'Look around']);
    expect(labels(getSuggestedActions(site))).toEqual(['Look around']);
  });

  it('offers Leave first on the town exit tile, and not elsewhere in town', () => {
    const town = grid(5, 5, () => ({ type: 'grass' }));
    const inTown = { mapLevel: 'town', worldMap: world(), playerPosition: { x: 7, y: 7 },
      townMap: town, townName: 'Briarwood', townPosition: { x: 2, y: 4 }, milestones: milestones() };
    const chips = getSuggestedActions({ ...inTown, atTownExit: true });
    expect(chips[0]).toEqual({ id: 'leave', label: 'Leave Briarwood', kind: 'leave' });
    expect(labels(getSuggestedActions(inTown))).not.toContain('Leave Briarwood');
    // Only inside a town: the flag means nothing on the world map.
    expect(labels(getSuggestedActions({ worldMap: world(), playerPosition: { x: 0, y: 0 }, atTownExit: true })))
      .not.toContain('Leave Snowley');
  });

  it('sends a ready side quest back to its turn-in town, then to the building once there', () => {
    const sideQuests = [{ id: 'q', status: 'active', milestones: [
      { id: 1, completed: true, site: { type: 'cave' } },
      { id: 2, requires: [1], trigger: { turnIn: { building: 'guild', location: 'Briarwood' } } },
    ] }];
    const away = getSuggestedActions({ worldMap: world(), playerPosition: { x: 3, y: 3 }, sideQuests });
    expect(labels(away)).toEqual(['Return to Briarwood']);
    const town = grid(4, 4, () => ({ type: 'grass' }));
    town[0][2] = { ...town[0][2], type: 'building', buildingType: 'guild', buildingName: "Adventurers' Guild" };
    const there = getSuggestedActions({ mapLevel: 'town', worldMap: world(), playerPosition: { x: 7, y: 7 },
      townMap: town, townName: 'Briarwood', townPosition: { x: 0, y: 3 }, sideQuests });
    expect(there[0]).toMatchObject({ label: "Hand in at Adventurers' Guild", kind: 'walk', target: { x: 2, y: 0 } });
  });

  it('routes an unanchored hand-in to the nearest visited town that has the building', () => {
    const sideQuests = [{ id: 'q', status: 'active', milestones: [
      { id: 1, completed: true, site: { type: 'cave' } },
      { id: 2, requires: [1], trigger: { turnIn: { building: 'guild' } } },
    ] }];
    const withGuild = grid(3, 3, () => ({ type: 'grass' }));
    withGuild[1][1] = { ...withGuild[1][1], type: 'building', buildingType: 'guild' };
    const townMapsCache = { Briarwood: { mapData: withGuild }, Snowley: { mapData: grid(3, 3, () => ({ type: 'grass' })) } };
    const chips = getSuggestedActions({ worldMap: world(), playerPosition: { x: 1, y: 1 }, sideQuests, townMapsCache });
    // Snowley is nearer but has no guild; Briarwood does.
    expect(labels(chips)).toEqual(['Return to Briarwood']);
  });

  it('aims a boss step at the nearest tile it can be fought from, not just its named town', () => {
    const g = world();
    g[2][2] = { ...g[2][2], poi: 'rot_tunnels', milestonePoi: true, poiName: 'The Rot Tunnels' };
    g[7][7] = { ...g[7][7], milestoneEnemy: 'rot_heart' }; // also stamped on the town (Briarwood here)
    const ms = [
      { id: 3, type: 'location', completed: true, requires: [], location: 'Briarwood',
        trigger: { location: 'rot_tunnels' }, spawn: { type: 'poi', id: 'rot_tunnels', name: 'The Rot Tunnels', location: 'Briarwood' } },
      { id: 4, type: 'combat', completed: false, requires: [3], location: 'Briarwood',
        trigger: { enemy: 'rot_heart' }, spawn: { type: 'enemy', id: 'rot_heart', name: 'The Rot-Heart', location: 'Briarwood' },
        encounter: { name: 'The Rot-Heart', enemyHP: 60 } },
    ];
    // Standing on the tunnels: fight here, no "Travel to Briarwood".
    const here = getSuggestedActions({ worldMap: g, playerPosition: { x: 2, y: 2 }, milestones: ms });
    expect(here[0]).toMatchObject({ id: 'fight', label: 'Confront The Rot-Heart' });
    expect(labels(here)).not.toContain('Travel to Briarwood');
    // Further away, the nearer fight tile wins.
    const away = getSuggestedActions({ worldMap: g, playerPosition: { x: 1, y: 3 }, milestones: ms });
    expect(away.find((c) => c.kind === 'travel')).toMatchObject({ label: 'Travel to The Rot Tunnels', target: { x: 2, y: 2 } });
  });

  it('offers the milestone action when standing on its tile (Search, then Gather)', () => {
    const g = world();
    g[4][4] = { ...g[4][4], poi: 'goblin_hideout' };
    const ms = [{ id: 3, type: 'location', completed: false, requires: [], location: 'Greenridge Hills',
      trigger: { location: 'goblin_hideout' }, spawn: { type: 'poi', id: 'goblin_hideout', name: 'Goblin Hideout' } }];
    const chips = getSuggestedActions({ worldMap: g, playerPosition: { x: 4, y: 4 }, milestones: ms });
    expect(chips[0]).toMatchObject({ id: 'search', label: 'Search Goblin Hideout', kind: 'search' });

    const moors = grid(3, 3);
    moors[1][1] = { ...moors[1][1], poi: 'mountain', mountainName: 'Grey Moors' };
    const herbs = [{ id: 1, type: 'item', completed: false, requires: [], location: 'Grey Moors',
      trigger: { item: 'moorland_herbs' }, spawn: { type: 'item', id: 'moorland_herbs', name: 'Moorland Herbs', location: 'Grey Moors' }, building: null }];
    const here = getSuggestedActions({ worldMap: moors, playerPosition: { x: 1, y: 1 }, milestones: herbs });
    expect(here[0]).toMatchObject({ id: 'gather', label: 'Gather Moorland Herbs', kind: 'gather' });
  });

  it("heads for a taken side quest's revealed site, but not for one still only offered", () => {
    const step = { id: 1, site: { type: 'cave' }, trigger: { defeat: 'bats' } };
    const taken = getSuggestedActions({ worldMap: world(), playerPosition: { x: 3, y: 3 }, sideQuests: [{ id: 'q', status: 'active', milestones: [step] }] });
    expect(taken[0]).toMatchObject({ label: 'Head for the cave', target: { x: 1, y: 6 } });
    const offered = getSuggestedActions({ worldMap: world(), playerPosition: { x: 3, y: 3 }, sideQuests: [{ id: 'q', status: 'available', milestones: [step] }] });
    expect(offered).toEqual([]);
  });

  it('suggests resting at the inn only when someone is hurt', () => {
    const town = grid(4, 4, () => ({ type: 'grass' }));
    town[2][2] = { ...town[2][2], type: 'building', buildingType: 'inn', buildingName: 'The Warm Hearth' };
    const base = { mapLevel: 'town', worldMap: world(), playerPosition: { x: 0, y: 0 }, townMap: town, townName: 'Snowley', townPosition: { x: 0, y: 0 } };
    expect(getSuggestedActions({ ...base, party: [{ currentHP: 10, maxHP: 10 }] })).toEqual([]);
    expect(labels(getSuggestedActions({ ...base, party: [{ currentHP: 3, maxHP: 10 }] }))).toEqual(['Rest at The Warm Hearth']);
  });

  it('puts Look around first when a hook is waiting, and caps the list', () => {
    const chips = getSuggestedActions({ worldMap: world(), playerPosition: { x: 0, y: 0 }, milestones: milestones(), hookWaiting: true });
    expect(chips[0]).toMatchObject({ kind: 'look' });
    expect(chips).toHaveLength(MAX_SUGGESTIONS);
  });

  it('is empty without a world, and offers only Look around inside a site', () => {
    expect(getSuggestedActions({})).toEqual([]);
    expect(labels(getSuggestedActions({ mapLevel: 'site', hookWaiting: true }))).toEqual(['Look around']);
  });
});

describe('levelling nudges', () => {
  const bossStep = () => [{ id: 9, type: 'combat', location: 'Briarwood', requires: [], trigger: { enemy: 'boss' },
    encounter: { name: 'Boss', rewards: { xp: 75 } }, spawn: { type: 'enemy', location: 'Briarwood' } }];

  it('recommends a step minLevel, else the top of the range for a boss', () => {
    expect(recommendedLevel({ minLevel: 3 }, [1, 2])).toBe(3);
    expect(recommendedLevel({ type: 'combat', encounter: {} }, [1, 2])).toBe(2);
    expect(recommendedLevel({ type: 'talk' }, [1, 2])).toBeNull();
  });

  it('flags an under-levelled step and offers a hunt on unexplored wild ground', () => {
    const g = world();
    g[2][2] = { ...g[2][2], poi: 'forest' };
    g[1][1] = { ...g[1][1], poi: 'forest', isExplored: true }; // explored: low odds, skipped
    const chips = getSuggestedActions({ worldMap: g, playerPosition: { x: 0, y: 0 }, milestones: bossStep(),
      party: [{ level: 1 }], levelRange: [1, 2] });
    expect(chips.map((c) => c.label)).toEqual(['Enter Snowley', 'Travel to Briarwood (level 2 recommended)', 'Hunt in the forest']);
    expect(chips[2].target).toEqual({ x: 2, y: 2 });
    // At the recommended level: plain travel, no hunt.
    const ready = getSuggestedActions({ worldMap: g, playerPosition: { x: 0, y: 0 }, milestones: bossStep(),
      party: [{ level: 2 }], levelRange: [1, 2] });
    expect(ready.map((c) => c.label)).toEqual(['Enter Snowley', 'Travel to Briarwood']);
  });

  it('points at a building offering side-quest work, under the active-quest cap', () => {
    const town = grid(4, 4, () => ({ type: 'grass' }));
    town[1][2] = { ...town[1][2], type: 'building', buildingType: 'tavern', buildingName: 'The Crooked Pint' };
    const offer = { id: 'q1', status: 'available', minLevel: 1, giver: { building: ['inn', 'tavern'] }, milestones: [] };
    const base = { mapLevel: 'town', worldMap: world(), playerPosition: { x: 0, y: 0 }, townMap: town, townName: 'Snowley', townPosition: { x: 0, y: 3 }, party: [{ level: 1 }] };
    expect(getSuggestedActions({ ...base, sideQuests: [offer] })[0]).toMatchObject({ label: 'Ask for work at The Crooked Pint', kind: 'walk', target: { x: 2, y: 1 } });
    const busy = [offer, ...[1, 2, 3].map((i) => ({ id: `a${i}`, status: 'active', milestones: [] }))];
    expect(getSuggestedActions({ ...base, sideQuests: busy })).toEqual([]);
    const tooHard = { ...offer, minLevel: 4 };
    expect(getSuggestedActions({ ...base, sideQuests: [tooHard] })).toEqual([]);
  });
});
