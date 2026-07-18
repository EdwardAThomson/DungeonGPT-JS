import { shouldTriggerEncounter, checkForPoiEncounter, rollEnvironmentalEncounter } from './encounterGenerator';

describe('encounterGenerator.shouldTriggerEncounter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('never triggers encounters on water tiles', () => {
    const result = shouldTriggerEncounter(
      { biome: 'water', poi: null },
      true,
      { grimnessLevel: 'Gritty' },
      0
    );

    expect(result).toBe(false);
  });

  it('applies revisit and move-streak modifiers correctly', () => {
    // plains base 0.25 * revisit(0.3) + move bonus(0.25 when >=5) => 0.325
    jest.spyOn(Math, 'random').mockReturnValue(0.31);

    const result = shouldTriggerEncounter(
      { biome: 'plains', poi: null },
      false,
      { grimnessLevel: 'Gritty' },
      5
    );

    expect(result).toBe(true);
  });

  it('respects grimness modifiers (same roll fails on Noble, succeeds on Grimdark)', () => {
    const randomSpy = jest.spyOn(Math, 'random');

    randomSpy.mockReturnValue(0.32);
    const nobleResult = shouldTriggerEncounter(
      { biome: 'plains', poi: null },
      true,
      { grimnessLevel: 'Noble' },
      0
    );

    randomSpy.mockReturnValue(0.32);
    const grimdarkResult = shouldTriggerEncounter(
      { biome: 'plains', poi: null },
      true,
      { grimnessLevel: 'Grimdark' },
      0
    );

    expect(nobleResult).toBe(false); // 0.25 * 0.8 = 0.2
    expect(grimdarkResult).toBe(true); // 0.25 * 1.4 = 0.35
  });
});

describe('encounterGenerator.checkForPoiEncounter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("recognises the world map's 'cave_entrance' poi and rolls the cave table", () => {
    // Force the trigger roll to pass and the table roll to land on a real entry.
    jest.spyOn(Math, 'random').mockReturnValue(0.01);

    const encounter = checkForPoiEncounter(
      { biome: 'plains', poi: 'cave_entrance' },
      true,
      { grimnessLevel: 'Gritty' }
    );

    expect(encounter).toBeTruthy();
    expect(encounter.sourcePoiType).toBe('cave'); // normalised to the cave table key
  });

  it('still returns null for a poi with no encounter table', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.01);
    expect(checkForPoiEncounter({ biome: 'plains', poi: 'town' }, true, {})).toBeNull();
  });
});

describe('encounterGenerator.rollEnvironmentalEncounter (enclosed-interior setting filter)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Math.random is called twice inside rollEnvironmentalEncounter: first the chance
  // gate (a 0 always passes it), then weightedRandom's selection value. Sweeping the
  // selection value across the whole table lets us assert which templates can/cannot
  // be produced, deterministically.
  const rollAt = (pickValue, options) => {
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(0)          // pass the chance gate
      .mockReturnValueOnce(pickValue); // weightedRandom selection
    const result = rollEnvironmentalEncounter(
      { poi: 'cave', biome: 'plains' },
      { grimnessLevel: 'Gritty' },
      options
    );
    Math.random.mockRestore();
    return result;
  };

  const sweepTemplateKeys = (options) => {
    const keys = new Set();
    for (let i = 0; i < 100; i += 1) {
      const result = rollAt(i / 100, options);
      if (result) keys.add(result.templateKey);
    }
    return keys;
  };

  it('never returns outdoor weather/sky hazards when enclosedInterior is true', () => {
    const keys = sweepTemplateKeys({ enclosedInterior: true });
    expect(keys.has('sudden_storm')).toBe(false);
    expect(keys.has('strange_lights')).toBe(false);
    expect(keys.has('thick_fog')).toBe(false);
  });

  it('still returns the untagged earthquake when enclosedInterior is true (cave-in)', () => {
    const keys = sweepTemplateKeys({ enclosedInterior: true });
    expect(keys.has('earthquake')).toBe(true);
  });

  it('still allows outdoor hazards when not enclosed (open-air default)', () => {
    const keys = sweepTemplateKeys({});
    expect(keys.has('sudden_storm')).toBe(true);
    expect(keys.has('strange_lights')).toBe(true);
  });

  it("honors each template's authored encounterTier (P3), not a hardcoded 'immediate'", () => {
    // Sweep the table; collect the tier each produced template resolves to.
    const tierByTemplate = {};
    for (let i = 0; i < 100; i += 1) {
      const r = rollAt(i / 100, {});
      if (r) tierByTemplate[r.templateKey] = r.encounterTier;
    }
    // sudden_storm/earthquake are authored 'immediate'; thick_fog/strange_lights 'narrative'.
    expect(tierByTemplate.sudden_storm).toBe('immediate');
    expect(tierByTemplate.thick_fog).toBe('narrative');
    expect(tierByTemplate.strange_lights).toBe('narrative');
  });
});

describe('rollSiteWanderingEncounter level gate (top cap)', () => {
  it('caps difficulty by party level, no cap when level is unknown', () => {
    const { maxWanderDifficultyForLevel } = require('./encounterGenerator');
    expect(maxWanderDifficultyForLevel(1)).toBe('medium');
    expect(maxWanderDifficultyForLevel(2)).toBe('medium');
    expect(maxWanderDifficultyForLevel(5)).toBe('hard');
    expect(maxWanderDifficultyForLevel(8)).toBe('deadly');
    expect(maxWanderDifficultyForLevel(null)).toBe('deadly');
  });

  it('never blindsides a level-1 party with the hard nest / deadly guardian', () => {
    const { rollSiteWanderingEncounter } = require('./encounterGenerator');
    const seen = new Set();
    for (let i = 0; i < 4000; i++) {
      const e = rollSiteWanderingEncounter('cave', {}, 4, 1);
      if (e) seen.add(e.templateKey);
    }
    expect(seen.has('cave_spider_nest')).toBe(false);
    expect(seen.has('cave_treasure_guardian')).toBe(false);
    // ...but the level-appropriate cave foes still appear.
    expect(seen.has('cave_kobolds') || seen.has('cave_giant_rats') || seen.has('cave_bats')).toBe(true);
  });

  it('lets a veteran party (level 8) meet the hard nest and deadly guardian', () => {
    const { rollSiteWanderingEncounter } = require('./encounterGenerator');
    const seen = new Set();
    for (let i = 0; i < 6000; i++) {
      const e = rollSiteWanderingEncounter('cave', {}, 5, 8);
      if (e) seen.add(e.templateKey);
    }
    expect(seen.has('cave_spider_nest')).toBe(true);
    expect(seen.has('cave_treasure_guardian')).toBe(true);
  });
});
