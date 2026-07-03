// balanceSim.test.js — unit tests for the balance-sim harness (#46).
// The progression lint (progressionLint.test.js) consumes the harness against live
// content; this file tests the harness machinery itself on small, fast runs.

import {
  mulberry32,
  buildSimHero,
  bestObtainableLoadout,
  resolveLoadout,
  LOADOUT_PRESETS,
  effectiveActionModifier,
  projectedSupportBonus,
  simulateEncounter,
  sweepEncounter,
  auditWorldXpBudget,
  questTotalXp
} from './balanceSim';
import { getEquippedBonuses } from './equipment';
import { ITEM_CATALOG, RARITY_RANK, maxRarityRankForTier } from '../utils/inventorySystem';
import { storyTemplates } from '../data/storyTemplates';

jest.setTimeout(60000);

const TRIALS = 800;

// A hostile multi-round block (wolf => the incoming-damage keyword gate applies).
const wolfBoss = {
  name: 'Wolf Pack Alpha',
  encounterTier: 'boss',
  difficulty: 'medium',
  multiRound: true,
  enemyHP: 30,
  suggestedActions: [
    { label: 'Fight', skill: 'Athletics', description: 'Meet the alpha head on' },
    { label: 'Read the Pack', skill: 'Insight', description: 'Watch for an opening' }
  ],
  consequences: {
    criticalSuccess: 'cs', success: 's', failure: 'f', criticalFailure: 'cf'
  },
  rewards: { xp: 50, gold: '2d10', items: ['wolf_pelt:50%'] }
};

// A single-round, non-hostile block (easy DC, no damage keywords).
const quietShrine = {
  name: 'Quiet Shrine',
  encounterTier: 'immediate',
  difficulty: 'easy',
  suggestedActions: [
    { label: 'Pray', skill: 'Religion', description: 'Offer a prayer' },
    { label: 'Inspect', skill: 'Investigation', description: 'Study the carvings' }
  ],
  consequences: {
    criticalSuccess: 'cs', success: 's', failure: 'f', criticalFailure: 'cf'
  },
  rewards: { xp: 10, gold: '1d6', items: [] }
};

describe('mulberry32', () => {
  test('deterministic per seed, in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 8 }, a);
    const seqB = Array.from({ length: 8 }, b);
    expect(seqA).toEqual(seqB);
    seqA.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    });
    expect(Array.from({ length: 8 }, mulberry32(43))).not.toEqual(seqA);
  });
});

describe('loadouts', () => {
  test('bestObtainableLoadout respects the rarity tier gate', () => {
    for (const tier of [1, 2, 3]) {
      const loadout = bestObtainableLoadout(tier);
      const maxRank = maxRarityRankForTier(tier);
      Object.values(loadout).filter(Boolean).forEach((key) => {
        expect(RARITY_RANK[ITEM_CATALOG[key].rarity]).toBeLessThanOrEqual(maxRank);
      });
    }
  });

  test('tier gates change what "best" means (t1 rare cap vs t3 legendary)', () => {
    const t1 = bestObtainableLoadout(1);
    const t3 = bestObtainableLoadout(3);
    // t1 caps at rare (no very_rare armor/accessory, no legendary weapon)
    expect(RARITY_RANK[ITEM_CATALOG[t1.armor].rarity]).toBeLessThanOrEqual(RARITY_RANK.rare);
    // t3 unlocks the only +2 weapon in the catalog
    expect(t3.weapon).toBe('legendary_weapon');
  });

  test('resolveLoadout: names, explicit objects, unknown -> none', () => {
    expect(resolveLoadout('mid', 1)).toEqual(LOADOUT_PRESETS.mid);
    expect(resolveLoadout('nope', 1)).toEqual(LOADOUT_PRESETS.none);
    const custom = { weapon: 'shortsword', armor: null, accessory: null };
    expect(resolveLoadout(custom, 1)).toBe(custom);
  });
});

describe('buildSimHero', () => {
  test('mid loadout yields the documented +1/+2/+1 equip bonuses', () => {
    const hero = buildSimHero({ level: 2, loadout: 'mid' });
    expect(getEquippedBonuses(hero)).toEqual({ attack: 1, defense: 2, misc: 1 });
    expect(hero.level).toBe(2);
    expect(hero.maxHP).toBeGreaterThan(0);
    expect(hero.currentHP).toBe(hero.maxHP);
    expect(hero.stats.Strength).toBe(15); // Fighter template, standard array cap
  });

  test('none loadout has zero equip bonuses', () => {
    const hero = buildSimHero({ level: 1, loadout: 'none' });
    expect(getEquippedBonuses(hero)).toEqual({ attack: 0, defense: 0, misc: 0 });
  });
});

describe('effectiveActionModifier', () => {
  test('weapon applies to physical checks; accessory applies to all', () => {
    const hero = buildSimHero({ level: 1, loadout: 'mid' }); // +1 weapon, +1 misc
    const fight = { label: 'Fight', skill: 'Athletics' };
    const talk = { label: 'Talk', skill: 'Persuasion' };
    const calm = { name: 'Quiet Shrine' }; // not hostile-named
    // Fighter: Str 15 (+2) + weapon 1 + misc 1 = 4; Cha 10 (0) + misc 1 = 1
    expect(effectiveActionModifier(fight, hero, calm)).toBe(4);
    expect(effectiveActionModifier(talk, hero, calm)).toBe(1);
    // Hostile-named encounter: weapon applies to every check
    const hostile = { name: 'Wolf Pack Alpha' };
    expect(effectiveActionModifier(talk, hero, hostile)).toBe(2);
  });
});

describe('simulateEncounter', () => {
  test('same seed => identical results; different seed => different stream', async () => {
    const hero = buildSimHero({ level: 2, loadout: 'mid' });
    const opts = { trials: TRIALS, seed: 11, settings: { tier: 1 } };
    const a = await simulateEncounter(wolfBoss, hero, opts);
    const b = await simulateEncounter(wolfBoss, hero, opts);
    expect(a).toEqual(b);
    const c = await simulateEncounter(wolfBoss, hero, { ...opts, seed: 12 });
    expect(c.outcomeDistribution).not.toEqual(a.outcomeDistribution);
    expect(Math.abs(c.winRate - a.winRate)).toBeLessThan(0.1);
  });

  test('restores the global Math.random', async () => {
    const original = Math.random;
    const hero = buildSimHero({ level: 1 });
    await simulateEncounter(wolfBoss, hero, { trials: 50, seed: 1, settings: { tier: 1 } });
    expect(Math.random).toBe(original);
  });

  test('multi-round hostile boss: outcomes, damage and reward accounting', async () => {
    const hero = buildSimHero({ level: 2, loadout: 'mid' });
    const r = await simulateEncounter(wolfBoss, hero, { trials: TRIALS, seed: 3, settings: { tier: 1 } });
    expect(r.multiRound).toBe(true);
    const { victory, defeat, stalemate, escaped } = r.outcomeDistribution;
    expect(victory + defeat + stalemate + escaped).toBe(TRIALS);
    expect(r.winRate).toBeGreaterThan(0.2);
    expect(r.winRate).toBeLessThan(0.8);
    expect(r.meanRounds).toBeGreaterThan(1);
    expect(r.meanRounds).toBeLessThanOrEqual(3);
    expect(r.meanHeroHpLoss).toBeGreaterThan(0); // wolf-named => damage gate applies
    expect(r.meanXpOnWin).toBeGreaterThan(0);
    expect(r.expectedAttemptsToWin).toBeCloseTo(1 / r.winRate, 10);
    expect(r.tpkRisk).toBe(r.koRate);
    expect(r.partyProjection).toBeNull();
  });

  test('single-round path for non-multi-round encounters', async () => {
    const hero = buildSimHero({ level: 1, loadout: 'none' });
    const r = await simulateEncounter(quietShrine, hero, { trials: TRIALS, seed: 5, settings: { tier: 1 } });
    expect(r.multiRound).toBe(false);
    expect(r.meanRounds).toBe(1);
    expect(r.stalemateRate).toBe(0);
    expect(r.winRate + r.defeatRate).toBeCloseTo(1, 10);
    expect(r.meanHeroHpLoss).toBe(0); // not hostile-named
  });

  test('best-modifier policy picks the highest-modifier action', async () => {
    // Fighter: Athletics (Str +2 + weapon) beats Insight (Wis +1).
    const hero = buildSimHero({ level: 2, loadout: 'mid' });
    const r = await simulateEncounter(wolfBoss, hero, { trials: 20, seed: 1, settings: { tier: 1 } });
    expect(r.action).toBe('Fight');
  });

  test('fixed policy forces the named action, and a worse action wins less', async () => {
    const hero = buildSimHero({ level: 2, loadout: 'mid' });
    const best = await simulateEncounter(wolfBoss, hero, { trials: TRIALS, seed: 9, settings: { tier: 1 } });
    const worse = await simulateEncounter(wolfBoss, hero, {
      trials: TRIALS, seed: 9, settings: { tier: 1 }, policy: 'fixed:Read the Pack'
    });
    expect(worse.action).toBe('Read the Pack');
    expect(worse.winRate).toBeLessThan(best.winRate);
  });

  test('party of 4 projects the Phase 5 support bonus and lifts the win rate', async () => {
    const lead = buildSimHero({ level: 2, loadout: 'mid' });
    const party = [
      lead,
      buildSimHero({ level: 2, characterClass: 'Wizard', loadout: 'none' }),
      buildSimHero({ level: 2, characterClass: 'Cleric', loadout: 'none' }),
      buildSimHero({ level: 2, characterClass: 'Rogue', loadout: 'none' })
    ];
    expect(projectedSupportBonus(party)).toBe(3); // each supporter: max(1, floor(+2 / 2)) = 1
    const solo = await simulateEncounter(wolfBoss, lead, { trials: TRIALS, seed: 21, settings: { tier: 1 } });
    const team = await simulateEncounter(wolfBoss, party, { trials: TRIALS, seed: 21, settings: { tier: 1 } });
    expect(team.partyProjection).toMatchObject({ partySize: 4, supportBonus: 3 });
    expect(team.partyProjection.note).toMatch(/PROJECTION/);
    expect(team.winRate).toBeGreaterThan(solo.winRate);
  });
});

describe('sweepEncounter', () => {
  test('produces the levels x loadouts matrix, gear monotonically not worse', async () => {
    const matrix = await sweepEncounter(wolfBoss, {
      levels: [2],
      loadouts: ['none', 'mid'],
      tier: 1,
      trials: TRIALS,
      seed: 2
    });
    expect(Object.keys(matrix)).toEqual(['2']);
    expect(matrix[2].none.winRate).toBeLessThanOrEqual(matrix[2].mid.winRate);
  });
});

describe('auditWorldXpBudget', () => {
  test('sums milestones + simulated boss XP + top side quests', async () => {
    const heroicT1 = storyTemplates.find((t) => t.id === 'heroic-fantasy-t1');
    const quests = [
      { milestones: [{ rewards: { xp: 60 } }], rewards: { xp: 60 } }, // 120
      { milestones: [{ rewards: { xp: 40 } }], rewards: { xp: 40 } } // 80
    ];
    expect(questTotalXp(quests[0])).toBe(120);
    const audit = await auditWorldXpBudget(heroicT1, {
      sideQuests: quests, questCount: 1, trials: TRIALS, seed: 1
    });
    expect(audit.milestoneXp).toBe(150); // 25 + 25 + 50 + 50
    expect(audit.bossName).toBe('Goblin Chieftain');
    expect(audit.expectedBossXpOnVictory).toBeGreaterThan(0);
    expect(audit.questXp).toBe(120); // top 1 of the 2
    expect(audit.totalXp).toBeCloseTo(audit.milestoneXp + audit.expectedBossXpOnVictory + audit.questXp, 10);
  });
});
