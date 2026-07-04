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

describe('populateTown canonical (milestone) NPC placement', () => {
  // The authored NPC as returned by getMilestoneNpcsForTown.
  const marta = {
    id: 'militia_captain',
    name: 'Captain Marta',
    role: 'Guard',
    personality: 'gruff, practical, protective of her people',
    milestoneId: 2,
    location: 'Briarwood',
    building: { type: 'barracks', name: 'Briarwood Militia Hall' }
  };

  // A town whose barracks has been renamed to the authored building name (as
  // injectQuestBuildings does), plus a second, ordinary barracks.
  const town = {
    townName: 'Briarwood',
    townSize: 'town',
    width: 2,
    height: 1,
    mapData: [[
      { type: 'building', buildingType: 'barracks', buildingName: 'Briarwood Militia Hall', x: 0, y: 0 },
      { type: 'building', buildingType: 'barracks', buildingName: 'The Old Watchtower', x: 1, y: 0 }
    ]]
  };

  it('places the canonical NPC in the authored building and skips procedural staffing there', () => {
    const npcs = populateTown(town, 555, [marta]);
    const inHall = npcs.filter((n) => n.location?.x === 0 && n.location?.y === 0);
    // Only the canonical NPC staffs the authored building (procedural captain + guards suppressed).
    expect(inHall).toHaveLength(1);
    expect(inHall[0].name).toBe('Captain Marta');
    expect(inHall[0].title).toBe('Captain');
    expect(inHall[0].personality).toBe('gruff, practical, protective of her people');
    expect(inHall[0].milestoneNpcId).toBe('militia_captain');
  });

  it('leaves other barracks with their procedural staff', () => {
    const npcs = populateTown(town, 555, [marta]);
    const inWatchtower = npcs.filter((n) => n.location?.x === 1 && n.location?.y === 0);
    expect(inWatchtower.length).toBeGreaterThan(0);
    expect(inWatchtower.every((n) => n.name !== 'Captain Marta')).toBe(true);
    expect(inWatchtower.some((n) => /commander/i.test(n.job || ''))).toBe(true);
  });

  it('does not place a duplicate captain (only one Captain Marta total)', () => {
    const npcs = populateTown(town, 555, [marta]);
    expect(npcs.filter((n) => n.name === 'Captain Marta')).toHaveLength(1);
  });

  it('leaves towns with no milestone NPCs unchanged (procedural captain remains)', () => {
    const withMilestone = populateTown(makeTown(['barracks']), 321, []);
    const without = populateTown(makeTown(['barracks']), 321);
    // No canonical NPC when none supplied; identical to the no-arg call.
    expect(withMilestone.some((n) => n.milestoneNpcId)).toBe(false);
    expect(withMilestone.map((n) => `${n.name}:${n.job}`))
      .toEqual(without.map((n) => `${n.name}:${n.job}`));
    expect(withMilestone.some((n) => /commander/i.test(n.job || ''))).toBe(true);
  });
});

describe('civic building job strings (unnamed buildings)', () => {
  // The town generator never names civic buildings (harbormaster, stables, mill,
  // magetower, jail, shrine, apothecary, tailor, fletcher, townhall); jobs built
  // from b.name must fall back to the town name, never "of undefined".
  const CIVIC = ['harbormaster', 'stables', 'mill', 'magetower', 'jail', 'shrine', 'apothecary', 'tailor', 'fletcher', 'townhall'];
  const makeUnnamedTown = (types) => ({
    townName: 'Saltmere',
    townSize: 'town',
    width: types.length,
    height: 1,
    mapData: [types.map((t, x) => ({ type: 'building', buildingType: t, x, y: 0 }))]
  });

  it('never produces "undefined" in any job string', () => {
    const npcs = populateTown(makeUnnamedTown(CIVIC), 7);
    const bad = npcs.filter((n) => /undefined/.test(n.job || ''));
    expect(bad.map((n) => ({ job: n.job, type: n.location?.buildingType }))).toEqual([]);
  });

  it('harbormaster reads "<title> of <town>"', () => {
    const npcs = populateTown(makeUnnamedTown(CIVIC), 7);
    const hm = npcs.find((n) => n.location?.buildingType === 'harbormaster');
    expect(hm).toBeDefined();
    expect(hm.job).toMatch(/ of Saltmere$/);
  });
});

describe('gender dealing (balanced deck, maintainer directive 2026-07-04)', () => {
  it('pins every town at near-exact 50/50 (iid coin flips produced streaks that read as bias)', () => {
    for (const seed of [3, 17, 88, 421]) {
      const npcs = populateTown(makeTown(SERVICE_TYPES), seed);
      const f = npcs.filter((n) => n.gender === 'Female').length;
      const m = npcs.filter((n) => n.gender === 'Male').length;
      // Deck deals in pairs and spouses mirror their partner, so the only
      // slack is an unfinished pair plus name-forced proprietors.
      expect(Math.abs(f - m)).toBeLessThanOrEqual(3);
    }
  });
});
