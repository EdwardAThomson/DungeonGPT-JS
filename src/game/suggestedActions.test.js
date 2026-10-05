// suggestedActions (#91): engine-derived chips only point at places the player already knows.

import { getSuggestedActions, MAX_SUGGESTIONS } from './suggestedActions';

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
