import {
  XP_THRESHOLDS,
  awardXP,
  calculateEncounterXP,
  calculateLevel,
  getLevelProgress,
  initializeProgression,
  xpForNextLevel
} from './progressionSystem';

describe('progressionSystem', () => {
  it('calculateLevel matches threshold boundaries', () => {
    expect(calculateLevel(0)).toBe(1);
    expect(calculateLevel(XP_THRESHOLDS[1] - 1)).toBe(1);
    expect(calculateLevel(XP_THRESHOLDS[1])).toBe(2);
    expect(calculateLevel(XP_THRESHOLDS[19])).toBe(20);
  });

  it('xpForNextLevel returns Infinity at max level', () => {
    expect(xpForNextLevel(1)).toBe(XP_THRESHOLDS[1]);
    expect(xpForNextLevel(20)).toBe(Infinity);
  });

  it('getLevelProgress reports bounded progress and max-level state', () => {
    const nearL2 = getLevelProgress(150);
    expect(nearL2).toEqual({
      current: 150,
      required: 300,
      percentage: 50,
      isMaxLevel: false
    });

    const maxed = getLevelProgress(XP_THRESHOLDS[19]);
    expect(maxed.isMaxLevel).toBe(true);
    expect(maxed.percentage).toBe(100);
  });

  it('awardXP levels up character and restores currentHP to new max', () => {
    const character = {
      characterClass: 'Fighter',
      stats: { Constitution: 14 },
      xp: 250,
      level: 1,
      maxHP: 12,
      currentHP: 3
    };

    const result = awardXP(character, 100);

    expect(result.leveledUp).toBe(true);
    expect(result.previousLevel).toBe(1);
    expect(result.newLevel).toBe(2);
    expect(result.character.level).toBe(2);
    expect(result.character.currentHP).toBe(result.character.maxHP);
    expect(result.character.maxHP).toBeGreaterThan(character.maxHP);
  });

  it('calculateEncounterXP applies outcome and level scaling floor', () => {
    expect(calculateEncounterXP('hard', 'criticalSuccess', 1)).toBe(150);
    expect(calculateEncounterXP('hard', 'success', 30)).toBe(25);
  });

  it('initializeProgression sets core progression defaults', () => {
    const initialized = initializeProgression({
      characterClass: 'Wizard',
      stats: { Constitution: 10 }
    });

    expect(initialized).toMatchObject({
      xp: 0,
      level: 1,
      gold: 0
    });
    expect(initialized.currentHP).toBe(initialized.maxHP);
    expect(Array.isArray(initialized.inventory)).toBe(true);
  });
});
