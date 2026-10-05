// xpScaling: tier multipliers for milestone vs world XP (2026-10-05 balance pass).

import { campaignTier, scaleMilestoneXP, scaleWorldXP, scaleWorldRewards, scaleEncounterXP } from './xpScaling';

describe('xpScaling', () => {
  it('reads the tier, defaulting older saves to tier 1 and clamping to 1-3', () => {
    expect(campaignTier({})).toBe(1);
    expect(campaignTier(null)).toBe(1);
    expect(campaignTier({ tier: 2 })).toBe(2);
    expect(campaignTier({ tier: 9 })).toBe(3);
  });

  it('scales milestones harder than world rewards, more at higher tiers', () => {
    expect(scaleMilestoneXP(25, { tier: 1 })).toBe(50);
    expect(scaleMilestoneXP(50, { tier: 2 })).toBe(150);
    expect(scaleWorldXP(70, { tier: 1 })).toBe(70);
    expect(scaleWorldXP(70, { tier: 2 })).toBe(105);
    expect(scaleWorldXP(undefined, { tier: 2 })).toBe(0);
  });

  it('keeps gold and items untouched', () => {
    expect(scaleWorldRewards({ xp: 60, gold: 120, items: ['x'] }, { tier: 2 })).toEqual({ xp: 90, gold: 120, items: ['x'] });
  });

  it('scales a milestone boss by the milestone multiplier and never twice', () => {
    const boss = { name: 'Chieftain', isMilestoneBoss: true, milestoneId: 4, rewards: { xp: 75, gold: 5 } };
    const once = scaleEncounterXP(boss, { tier: 1 });
    expect(once.rewards.xp).toBe(150);
    expect(scaleEncounterXP(once, { tier: 1 }).rewards.xp).toBe(150);
    expect(boss.rewards.xp).toBe(75); // input not mutated
    const wolf = scaleEncounterXP({ name: 'Wolves', rewards: { xp: 70 } }, { tier: 2 });
    expect(wolf.rewards.xp).toBe(105);
    expect(scaleEncounterXP({ name: 'No rewards' }, { tier: 2 })).toEqual({ name: 'No rewards' });
  });
});
