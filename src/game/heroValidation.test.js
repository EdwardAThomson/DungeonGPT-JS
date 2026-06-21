import {
  totalPointsSpent,
  pointsRemaining,
  canIncreaseStat,
  canDecreaseStat,
  increaseCost,
  decreaseRefund,
  validateHero,
} from './heroValidation';
import { heroTemplates, INITIAL_STATS, POINT_BUY_BUDGET } from '../data/heroData';

const validHero = {
  heroName: 'Aelin',
  heroGender: 'Female',
  profilePicture: 'assets/characters/female_ranger.webp',
  heroRace: 'Elf',
  heroClass: 'Ranger',
  heroLevel: 1,
  heroAlignment: 'Neutral Good',
  heroBackground: 'A skilled hunter from the northern woods.',
  stats: heroTemplates.Ranger.stats,
};

describe('hero point-buy', () => {
  it('treats the all-8 starting array as 0 points spent', () => {
    expect(totalPointsSpent(INITIAL_STATS)).toBe(0);
    expect(pointsRemaining(INITIAL_STATS)).toBe(POINT_BUY_BUDGET);
  });

  it('costs every class template exactly the full budget', () => {
    for (const [cls, tpl] of Object.entries(heroTemplates)) {
      expect([cls, totalPointsSpent(tpl.stats)]).toEqual([cls, POINT_BUY_BUDGET]);
    }
  });

  it('allows raising a stat only when points and the 8..15 range permit', () => {
    expect(canIncreaseStat(INITIAL_STATS, 'Strength')).toBe(true);
    // A maxed template stat (15) cannot go higher.
    expect(canIncreaseStat(heroTemplates.Ranger.stats, 'Dexterity')).toBe(false);
    // Fully-spent template has no points left to raise an unmaxed stat.
    expect(canIncreaseStat(heroTemplates.Ranger.stats, 'Charisma')).toBe(false);
  });

  it('allows lowering a stat only above the minimum', () => {
    expect(canDecreaseStat(INITIAL_STATS, 'Strength')).toBe(false); // already 8
    expect(canDecreaseStat(heroTemplates.Ranger.stats, 'Dexterity')).toBe(true);
  });

  it('reports the non-linear per-step cost (14 and 15 cost 2)', () => {
    expect(increaseCost(12)).toBe(1); // 12 -> 13
    expect(increaseCost(13)).toBe(2); // 13 -> 14
    expect(increaseCost(14)).toBe(2); // 14 -> 15
    expect(increaseCost(15)).toBeNull(); // capped
    expect(decreaseRefund(14)).toBe(2); // 14 -> 13 refunds 2
    expect(decreaseRefund(9)).toBe(1); // 9 -> 8 refunds 1
    expect(decreaseRefund(8)).toBeNull(); // floored
  });
});

describe('validateHero', () => {
  it('accepts a complete, in-budget level-1 hero', () => {
    expect(validateHero(validHero)).toEqual({ valid: true, reasons: [] });
  });

  it('flags missing required fields', () => {
    const { valid, reasons } = validateHero({ ...validHero, heroName: '', heroAlignment: '' });
    expect(valid).toBe(false);
    expect(reasons).toEqual(expect.arrayContaining(['Name is required.', 'Alignment is required.']));
  });

  it('rejects an invalid enum value', () => {
    const { valid, reasons } = validateHero({ ...validHero, heroRace: 'Robot' });
    expect(valid).toBe(false);
    expect(reasons).toContain('Race is invalid.');
  });

  it('rejects stats over the point-buy budget', () => {
    const overBudget = { ...validHero, stats: { Strength: 15, Dexterity: 15, Constitution: 15, Intelligence: 15, Wisdom: 15, Charisma: 15 } };
    const { valid, reasons } = validateHero(overBudget);
    expect(valid).toBe(false);
    expect(reasons.some((r) => /over the .* budget/.test(r))).toBe(true);
  });

  it('grandfathers over-budget stats when point-buy is not enforced (play-time gate)', () => {
    const legacy = { ...validHero, stats: { Strength: 14, Dexterity: 14, Constitution: 14, Intelligence: 14, Wisdom: 14, Charisma: 14 } };
    expect(validateHero(legacy).valid).toBe(false); // creation gate
    expect(validateHero(legacy, { enforcePointBuy: false }).valid).toBe(true); // play gate
  });
});
