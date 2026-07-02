import { getMilestoneNpcsForTown } from './milestoneEngine';

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
