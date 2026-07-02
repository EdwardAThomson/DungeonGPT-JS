import { populateTown } from './npcGenerator';
import { BUILDING_TYPES } from './townTileArt';

// Residential types are populated as family homes (not service staff); a barn is a farm
// worksite staffed via field workers. Everything else is a "service building" that must get
// at least one staff NPC in populateTown.
const NON_SERVICE = ['house', 'manor', 'keep', 'barn'];
const SERVICE_TYPES = BUILDING_TYPES.filter((t) => !NON_SERVICE.includes(t));

// A minimal town: one building tile per requested type in a single row.
const makeTown = (types) => ({
  townName: 'Testville',
  townSize: 'town',
  width: types.length,
  height: 1,
  mapData: [types.map((t, x) => ({ type: 'building', buildingType: t, buildingName: `The ${t}`, x, y: 0 }))]
});

const staffFor = (npcs, type) => npcs.filter((n) => n.location && n.location.buildingType === type);

describe('populateTown staffing coverage', () => {
  it('staffs every service building type (guards against a missing branch like barracks)', () => {
    const npcs = populateTown(makeTown(SERVICE_TYPES), 12345);
    const staffed = new Set(npcs.map((n) => n.location && n.location.buildingType));
    const missing = SERVICE_TYPES.filter((t) => !staffed.has(t));
    expect(missing).toEqual([]);
  });

  it('gives a barracks a commanding officer (the reported gap)', () => {
    const staff = staffFor(populateTown(makeTown(['barracks']), 42), 'barracks');
    expect(staff.length).toBeGreaterThan(0);
    expect(staff.some((n) => /captain|sergeant|lieutenant|commander/i.test(`${n.title} ${n.job}`))).toBe(true);
  });

  it('staffs a workshop', () => {
    const staff = staffFor(populateTown(makeTown(['workshop']), 7), 'workshop');
    expect(staff.length).toBeGreaterThan(0);
  });

  it('is deterministic for the same seed', () => {
    const a = populateTown(makeTown(['barracks', 'workshop', 'bank']), 99);
    const b = populateTown(makeTown(['barracks', 'workshop', 'bank']), 99);
    expect(a.map((n) => `${n.location.buildingType}:${n.name}:${n.job}`))
      .toEqual(b.map((n) => `${n.location.buildingType}:${n.name}:${n.job}`));
  });
});
