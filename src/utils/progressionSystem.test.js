import {
  XP_THRESHOLDS,
  awardXP,
  calculateEncounterXP,
  calculateLevel,
  calculateMaxHP,
  getLevelProgress,
  initializeProgression,
  xpForNextLevel
} from './progressionSystem';
import {
  HIT_DICE,
  calculateMaxHP as healthCalculateMaxHP,
  calculateMaxHPForLevel
} from './healthSystem';

const ALL_CLASSES = Object.keys(HIT_DICE);

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

  it('never lowers maxHP on level-up for a creation-time hero (bug #48 repro)', () => {
    // Real heroes store class as `heroClass` (HeroCreation) and get creation HP
    // from healthSystem: Con 14 -> 20 maxHP. Reaching Lv 2 must not drop it.
    const hero = {
      heroClass: 'Fighter',
      stats: { Constitution: 14 },
      xp: 250,
      level: 1,
      maxHP: 20,
      currentHP: 20
    };

    const result = awardXP(hero, 100);

    expect(result.newLevel).toBe(2);
    expect(result.character.maxHP).toBeGreaterThanOrEqual(20);
  });

  it('maxHP is monotonically non-decreasing across level-ups for all classes and Con ranges', () => {
    const constitutions = [3, 6, 8, 10, 12, 14, 16, 18, 20];

    ALL_CLASSES.forEach((cls) => {
      constitutions.forEach((con) => {
        // Start exactly as creation does: healthSystem HP at level 1.
        let hero = { heroClass: cls, stats: { Constitution: con }, xp: 0, level: 1 };
        hero.maxHP = healthCalculateMaxHP(hero);
        hero.currentHP = hero.maxHP;

        for (let target = 2; target <= 10; target++) {
          const prevMaxHP = hero.maxHP;
          const result = awardXP(hero, XP_THRESHOLDS[target - 1] - hero.xp);
          hero = result.character;

          expect(result.newLevel).toBe(target);
          expect(hero.maxHP).toBeGreaterThanOrEqual(prevMaxHP);
          expect(hero.currentHP).toBe(hero.maxHP);
        }
      });
    });
  });

  it('resolves class from heroClass or legacy characterClass identically', () => {
    const base = { stats: { Constitution: 14 }, xp: 0, level: 1, maxHP: 20, currentHP: 20 };
    const viaHeroClass = awardXP({ ...base, heroClass: 'Barbarian' }, XP_THRESHOLDS[1]);
    const viaCharacterClass = awardXP({ ...base, characterClass: 'Barbarian' }, XP_THRESHOLDS[1]);

    expect(viaHeroClass.character.maxHP).toBe(viaCharacterClass.character.maxHP);
    // Barbarian (d12, +2 Con): 20 at Lv1 + 9 per level — proves the class lookup
    // no longer falls through to the d8 default for heroClass heroes.
    expect(viaHeroClass.character.maxHP).toBe(29);
  });

  it('repairs heroes whose maxHP was lowered by the old bug on the next level-up', () => {
    // Old buggy formula gave a Con-14 hero 17 maxHP at Lv 2 (down from 20).
    const damaged = {
      heroClass: 'Fighter',
      stats: { Constitution: 14 },
      xp: XP_THRESHOLDS[1],
      level: 2,
      maxHP: 17,
      currentHP: 17
    };

    const result = awardXP(damaged, XP_THRESHOLDS[2] - damaged.xp);

    expect(result.newLevel).toBe(3);
    // Canonical Fighter (d10, +2): 20 + 8*2 = 36 — repaired well above 17.
    expect(result.character.maxHP).toBe(36);
  });

  it('never lowers maxHP even when a stored value exceeds the canonical formula', () => {
    // Con-10 Wizard at Lv 9 under the old bug had maxHP 48; the canonical
    // formula gives 46 at Lv 10. The stored value must win — no drop.
    const inflated = {
      heroClass: 'Wizard',
      stats: { Constitution: 10 },
      xp: XP_THRESHOLDS[8],
      level: 9,
      maxHP: 48,
      currentHP: 48
    };

    const result = awardXP(inflated, XP_THRESHOLDS[9] - inflated.xp);

    expect(result.newLevel).toBe(10);
    expect(calculateMaxHP('Wizard', 0, 10)).toBe(46);
    expect(result.character.maxHP).toBe(48);
  });

  it('calculateMaxHP delegates to the healthSystem single source of truth', () => {
    ALL_CLASSES.forEach((cls) => {
      [-4, -1, 0, 2, 5].forEach((conMod) => {
        [1, 2, 5, 20].forEach((level) => {
          expect(calculateMaxHP(cls, conMod, level)).toBe(
            calculateMaxHPForLevel(cls, conMod, level)
          );
        });
      });
    });
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
