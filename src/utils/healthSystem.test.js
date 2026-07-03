import {
  HIT_DICE,
  applyDamage,
  applyHealing,
  calculateMaxHP,
  calculateMaxHPForLevel,
  encounterDealsDamage,
  initializeHP,
  rollProfileDamage
} from './healthSystem';

describe('healthSystem calculateMaxHP', () => {
  it('preserves original level-1 creation values exactly (back-compat with saves)', () => {
    // Original formula: 10 + conMod * 5, clamped 5-30, level-independent.
    expect(calculateMaxHP({ stats: { Constitution: 14 } })).toBe(20);
    expect(calculateMaxHP({ stats: { Constitution: 10 } })).toBe(10);
    expect(calculateMaxHP({ stats: { Constitution: 12 } })).toBe(15);
    expect(calculateMaxHP({ stats: { Constitution: 20 } })).toBe(30); // clamp high
    expect(calculateMaxHP({ stats: { Constitution: 3 } })).toBe(5);   // clamp low

    // Explicit level 1 and missing level agree; class is irrelevant at level 1.
    expect(calculateMaxHP({ stats: { Constitution: 14 }, level: 1, heroClass: 'Wizard' })).toBe(20);
    expect(calculateMaxHP({ stats: { Constitution: 14 }, heroClass: 'Barbarian' })).toBe(20);
  });

  it('is level-aware and grows by class hit-die average per level', () => {
    // Fighter (d10), Con 14 (+2): 20 + (5+1+2) per level.
    expect(calculateMaxHP({ stats: { Constitution: 14 }, heroClass: 'Fighter', level: 2 })).toBe(28);
    expect(calculateMaxHP({ stats: { Constitution: 14 }, heroClass: 'Fighter', level: 5 })).toBe(52);
    // Wizard (d6), Con 10 (+0): 10 + (3+1) per level.
    expect(calculateMaxHP({ stats: { Constitution: 10 }, heroClass: 'Wizard', level: 3 })).toBe(18);
  });

  it('resolves class from characterClass or heroClass, defaulting unknown to d8', () => {
    const con14L2 = (cls, field) =>
      calculateMaxHP({ stats: { Constitution: 14 }, [field]: cls, level: 2 });

    expect(con14L2('Barbarian', 'heroClass')).toBe(29);
    expect(con14L2('Barbarian', 'characterClass')).toBe(29);
    // Unknown/missing class falls back to d8: 20 + (4+1+2) = 27.
    expect(con14L2('Artificer', 'heroClass')).toBe(27);
    expect(calculateMaxHP({ stats: { Constitution: 14 }, level: 2 })).toBe(27);
  });

  it('tolerates missing stats and bad levels', () => {
    expect(calculateMaxHP({})).toBe(10);
    expect(calculateMaxHP({ stats: {} })).toBe(10);
    expect(calculateMaxHP({ stats: { Constitution: 14 }, level: 0 })).toBe(20);
    expect(calculateMaxHP({ stats: { Constitution: 14 }, level: NaN })).toBe(20);
  });

  it('calculateMaxHPForLevel is monotonically non-decreasing in level for every class and CON mod', () => {
    Object.keys(HIT_DICE).forEach((cls) => {
      for (let conMod = -4; conMod <= 5; conMod++) {
        let prev = 0;
        for (let level = 1; level <= 20; level++) {
          const hp = calculateMaxHPForLevel(cls, conMod, level);
          expect(hp).toBeGreaterThanOrEqual(prev);
          prev = hp;
        }
      }
    });
  });

  it('guarantees at least +1 HP per level even with very negative CON', () => {
    // Wizard (d6), conMod -4: raw per-level would be 0; clamped to +1.
    expect(calculateMaxHPForLevel('Wizard', -4, 1)).toBe(5);
    expect(calculateMaxHPForLevel('Wizard', -4, 2)).toBe(6);
    expect(calculateMaxHPForLevel('Wizard', -4, 10)).toBe(14);
  });
});

describe('healthSystem HP state helpers', () => {
  it('initializeHP sets max/current HP once and leaves initialized heroes alone', () => {
    const fresh = initializeHP({ stats: { Constitution: 14 } });
    expect(fresh.maxHP).toBe(20);
    expect(fresh.currentHP).toBe(20);

    const existing = { stats: { Constitution: 14 }, maxHP: 17, currentHP: 4 };
    expect(initializeHP(existing)).toBe(existing);
  });

  it('applyDamage floors at 0 and flags defeat; applyHealing caps at maxHP', () => {
    const hero = { maxHP: 20, currentHP: 5 };
    const hurt = applyDamage(hero, 10);
    expect(hurt.currentHP).toBe(0);
    expect(hurt.isDefeated).toBe(true);

    const healed = applyHealing({ maxHP: 20, currentHP: 15 }, 10);
    expect(healed.currentHP).toBe(20);
    expect(healed.isDefeated).toBe(false);
  });
});

// --- #43: explicit damage gate + authored damage profiles ---------------------------

describe('encounterDealsDamage (#43)', () => {
  it('honors an explicit dealsDamage boolean over the keyword fallback', () => {
    expect(encounterDealsDamage({ name: 'Goblin Ambush', dealsDamage: false })).toBe(false);
    expect(encounterDealsDamage({ name: 'Quiet Shrine', dealsDamage: true })).toBe(true);
  });

  it('falls back to the deprecated keyword match for old encounter data', () => {
    expect(encounterDealsDamage({ name: 'Wolf Pack' })).toBe(true);
    expect(encounterDealsDamage({ name: 'Traveling Merchant' })).toBe(false);
    expect(encounterDealsDamage(null)).toBe(false);
  });
});

describe('rollProfileDamage (#43)', () => {
  it('rolls dice-notation tiers deterministically with a seeded rng', () => {
    const rngLow = () => 0; // every die rolls 1
    expect(rollProfileDamage({ failure: '2d6+2' }, 'failure', rngLow)).toBe(4);
    const rngHigh = () => 0.999; // every die rolls max
    expect(rollProfileDamage({ failure: '2d6+2' }, 'failure', rngHigh)).toBe(14);
  });

  it('accepts flat numbers and returns 0 for missing tiers or bad specs', () => {
    expect(rollProfileDamage({ failure: 7 }, 'failure')).toBe(7);
    expect(rollProfileDamage({ failure: 7 }, 'criticalSuccess')).toBe(0);
    expect(rollProfileDamage({ failure: 'not-dice' }, 'failure')).toBe(0);
    expect(rollProfileDamage(null, 'failure')).toBe(0);
  });
});
