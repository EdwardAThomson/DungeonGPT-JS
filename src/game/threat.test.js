import { getRelativeThreat, THREAT_TIERS, DIFFICULTY_ORDINAL } from './threat';

describe('getRelativeThreat (relative to party level)', () => {
  test('a medium foe is "fair" at low levels and turns "trivial" once outgrown', () => {
    // L1-2 band [easy, medium]: medium sits at the top of the band -> fair.
    expect(getRelativeThreat('medium', 1).tier).toBe('fair');
    expect(getRelativeThreat('medium', 2).tier).toBe('fair');
    // L3-4 band [medium, hard]: still inside the band -> fair.
    expect(getRelativeThreat('medium', 3).tier).toBe('fair');
    expect(getRelativeThreat('medium', 4).tier).toBe('fair');
    // L5+ band [hard]: medium is below the band -> trivial (the ring shifts green).
    expect(getRelativeThreat('medium', 5).tier).toBe('trivial');
    expect(getRelativeThreat('medium', 8).tier).toBe('trivial');
  });

  test('a hard foe is "tough" for a low party and eases to "fair" at higher levels', () => {
    expect(getRelativeThreat('hard', 1).tier).toBe('tough');
    expect(getRelativeThreat('hard', 2).tier).toBe('tough');
    expect(getRelativeThreat('hard', 3).tier).toBe('fair');
    expect(getRelativeThreat('hard', 5).tier).toBe('fair');
  });

  test('an easy foe reads trivial for anyone past the earliest levels', () => {
    expect(getRelativeThreat('easy', 1).tier).toBe('fair');
    expect(getRelativeThreat('easy', 3).tier).toBe('trivial');
    expect(getRelativeThreat('easy', 5).tier).toBe('trivial');
  });

  test('a deadly foe (boss) is always deadly regardless of level', () => {
    expect(getRelativeThreat('deadly', 1).tier).toBe('deadly');
    expect(getRelativeThreat('deadly', 5).tier).toBe('deadly');
    expect(getRelativeThreat('deadly', 99).tier).toBe('deadly');
  });

  test('non-finite / unknown party level does not throw and falls back to neutral fair', () => {
    expect(() => getRelativeThreat('medium', undefined)).not.toThrow();
    expect(getRelativeThreat('medium', undefined).tier).toBe('fair');
    expect(getRelativeThreat('hard', NaN).tier).toBe('fair');
    expect(getRelativeThreat('easy', null).tier).toBe('fair');
  });

  test('missing / unknown difficulty returns null (no ring) without throwing', () => {
    expect(getRelativeThreat(undefined, 3)).toBeNull();
    expect(getRelativeThreat(null, 3)).toBeNull();
    expect(getRelativeThreat('bogus', 3)).toBeNull();
  });

  test('every tier descriptor exposes a color and a label (shared by ring + badge)', () => {
    ['trivial', 'fair', 'tough', 'deadly'].forEach((tier) => {
      expect(THREAT_TIERS[tier].tier).toBe(tier);
      expect(typeof THREAT_TIERS[tier].color).toBe('string');
      expect(THREAT_TIERS[tier].label.length).toBeGreaterThan(0);
    });
    expect(DIFFICULTY_ORDINAL).toEqual({ easy: 1, medium: 2, hard: 3, deadly: 4 });
  });
});
