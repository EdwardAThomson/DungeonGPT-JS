import { shouldTriggerEncounter } from './encounterGenerator';

// Town encounter tuning (v2): towns are exempt from the pity/streak bonus in
// shouldTriggerEncounter, and the town walk in Game.js only rolls every 3rd tile.
// These tests lock in the town exemption while proving the world-map/site pity
// behavior is unchanged.
describe('encounterGenerator town pity exemption', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Town base = biomeEncounterChance.town (0.12) * revisitEncounterMultiplier.town (0.5)
  // = 0.06 flat, with Gritty grimness (1.0). The pity bonus must NOT be added for towns.
  const townTile = { poi: 'town', biome: 'plains' };
  const grittySettings = { grimnessLevel: 'Gritty' };

  it('town chance is FLAT across movesSinceLastEncounter (no pity bump at >=3 or >=5)', () => {
    // Roll just ABOVE the flat town chance (0.06). If pity were applied the chance
    // would rise past 0.06 at moves >= 3 and the roll would start triggering; it must not.
    jest.spyOn(Math, 'random').mockReturnValue(0.065);

    for (let moves = 0; moves <= 6; moves += 1) {
      const result = shouldTriggerEncounter(townTile, false, grittySettings, moves);
      expect(result).toBe(false);
    }
  });

  it('town still triggers below its flat base regardless of moves', () => {
    // Roll just BELOW the flat town chance (0.06): triggers at every moves value.
    jest.spyOn(Math, 'random').mockReturnValue(0.05);

    for (let moves = 0; moves <= 6; moves += 1) {
      const result = shouldTriggerEncounter(townTile, false, grittySettings, moves);
      expect(result).toBe(true);
    }
  });

  it('NON-town biome still gets the pity bump at >=3 and >=5 (world map preserved)', () => {
    // Plains base 0.25 (first visit, no revisit), Gritty grimness (1.0).
    //   moves 0..2 -> 0.25 ; moves 3..4 -> 0.35 ; moves >=5 -> 0.50
    // A roll of 0.30 fails at low moves but succeeds once pity kicks in.
    jest.spyOn(Math, 'random').mockReturnValue(0.30);
    const plainsTile = { poi: null, biome: 'plains' };

    expect(shouldTriggerEncounter(plainsTile, true, grittySettings, 0)).toBe(false);
    expect(shouldTriggerEncounter(plainsTile, true, grittySettings, 2)).toBe(false);
    // >=3 adds +0.10 -> 0.35, now 0.30 triggers.
    expect(shouldTriggerEncounter(plainsTile, true, grittySettings, 3)).toBe(true);
    // >=5 adds a further +0.15 -> 0.50, still triggers.
    expect(shouldTriggerEncounter(plainsTile, true, grittySettings, 5)).toBe(true);
  });
});

// Documents the every-3rd-tile roll gate used by runTownStep in Game.js: the party
// moves on every entered tile but only rolls for an encounter on tiles 0, 3, 6, ...
// runTownStep itself is bound to React refs, so the gate arithmetic is asserted here
// and the end-to-end walk behavior is verified manually.
describe('town walk roll gate (every 3rd tile)', () => {
  const shouldRollThisStep = (index) => index % 3 === 0;

  it('rolls on tiles 0, 3, 6 and skips the tiles between', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(shouldRollThisStep)).toEqual([
      true, false, false, true, false, false, true,
    ]);
  });

  it('a 6-tile crossing rolls only 2 times (indices 0..5)', () => {
    const rolls = [0, 1, 2, 3, 4, 5].filter(shouldRollThisStep).length;
    expect(rolls).toBe(2);
  });
});
