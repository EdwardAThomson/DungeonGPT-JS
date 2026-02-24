import { shouldTriggerEncounter } from './encounterGenerator';

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
