// questEnemies.test.js — registry-shape guards for the quest-enemy pool (#43/#50).
// Every entry must be a complete encounter definition with an explicit #43
// damage profile (dealsDamage + per-outcome dice) so nothing falls back to the
// deprecated name-keyword damage matching, and the tier legend (HP / XP / DC
// bands in the file header) must stay true as entries are added.

import {
  QUEST_ENEMIES,
  getEnemiesByTier,
  getEnemiesByTheme,
  getEnemiesByTierAndTheme,
  getAllEnemies
} from './questEnemies';
import { ITEM_CATALOG } from '../utils/inventorySystem';
import { encounterDealsDamage } from '../utils/healthSystem';

const DICE = /^\d+d\d+(\+\d+)?$/;
const THEMES = ['heroic-fantasy', 'grimdark-survival', 'arcane-renaissance', 'eldritch-horror'];
const entries = Object.entries(QUEST_ENEMIES);

describe('pool size per tier', () => {
  test('tier counts (t3 band populated, #50)', () => {
    expect(getEnemiesByTier(1).length).toBe(16);
    expect(getEnemiesByTier(2).length).toBe(14);
    expect(getEnemiesByTier(3).length).toBe(5);
    expect(getAllEnemies().length).toBe(entries.length);
  });

  test('every theme has at least one enemy per tier', () => {
    THEMES.forEach((theme) => {
      [1, 2, 3].forEach((tier) => {
        expect(getEnemiesByTierAndTheme(tier, theme).length).toBeGreaterThanOrEqual(1);
      });
      expect(getEnemiesByTheme(theme).length).toBeGreaterThanOrEqual(3);
    });
  });
});

describe('entry well-formedness', () => {
  test.each(entries.map(([id, e]) => [id, e]))('%s', (id, e) => {
    expect(typeof e.name).toBe('string');
    expect(e.name.length).toBeGreaterThan(0);
    expect(typeof e.icon).toBe('string');
    expect(typeof e.image).toBe('string');
    expect([1, 2, 3]).toContain(e.tier);
    expect(THEMES).toContain(e.theme);
    expect(e.encounterTier).toBe('boss');
    expect(e.multiRound).toBe(true);
    expect(typeof e.enemyHP).toBe('number');

    expect(Array.isArray(e.suggestedActions)).toBe(true);
    expect(e.suggestedActions.length).toBeGreaterThanOrEqual(3);
    e.suggestedActions.forEach((a) => {
      expect(typeof a.label).toBe('string');
      expect(typeof a.skill).toBe('string');
      expect(typeof a.description).toBe('string');
    });

    ['criticalSuccess', 'success', 'failure', 'criticalFailure'].forEach((k) => {
      expect(typeof e.consequences[k]).toBe('string');
    });

    expect(typeof e.rewards.xp).toBe('number');
    expect(String(e.rewards.gold)).toMatch(DICE);
    (e.rewards.items || []).forEach((key) => expect(ITEM_CATALOG[key]).toBeDefined());
  });
});

describe('#43 damage profiles (no deprecated keyword fallback)', () => {
  test.each(entries.map(([id, e]) => [id, e]))('%s declares an explicit profile', (id, e) => {
    expect(e.dealsDamage).toBe(true);
    expect(encounterDealsDamage(e)).toBe(true); // the authoritative gate, not the keyword fallback
    expect(e.damage).toBeDefined();
    ['criticalFailure', 'failure', 'success'].forEach((k) => {
      expect(e.damage[k]).toMatch(DICE);
    });
  });

  test('damage scales with tier (mean crit-fail dice grow per tier)', () => {
    const mean = (dice) => {
      const [, n, sides, bonus] = dice.match(/^(\d+)d(\d+)(?:\+(\d+))?$/);
      return Number(n) * (Number(sides) + 1) / 2 + Number(bonus || 0);
    };
    const maxByTier = {};
    const minByTier = {};
    entries.forEach(([, e]) => {
      const m = mean(e.damage.criticalFailure);
      maxByTier[e.tier] = Math.max(maxByTier[e.tier] || 0, m);
      minByTier[e.tier] = Math.min(minByTier[e.tier] || Infinity, m);
    });
    expect(minByTier[2]).toBeGreaterThan(maxByTier[1]);
    expect(maxByTier[3]).toBeGreaterThanOrEqual(maxByTier[2]);
  });
});

describe('tier legend bands (file header)', () => {
  const HP_BAND = { 1: [20, 40], 2: [150, 300], 3: [250, 400] };
  const XP_BAND = { 1: [40, 75], 2: [350, 500], 3: [400, 500] };

  test.each(entries.map(([id, e]) => [id, e]))('%s HP and XP inside its tier band', (id, e) => {
    const [hpLo, hpHi] = HP_BAND[e.tier];
    expect(e.enemyHP).toBeGreaterThanOrEqual(hpLo);
    expect(e.enemyHP).toBeLessThanOrEqual(hpHi);
    const [xpLo, xpHi] = XP_BAND[e.tier];
    expect(e.rewards.xp).toBeGreaterThanOrEqual(xpLo);
    expect(e.rewards.xp).toBeLessThanOrEqual(xpHi);
  });

  test('deadly entries pin an explicit DC in the sim-validated 19-20 band (#43)', () => {
    entries.forEach(([id, e]) => {
      if (e.difficulty !== 'deadly') return;
      if (!Number.isFinite(e.dc)) throw new Error(`${id} is deadly with no dc pin (falls back to DC 25)`);
      expect(e.dc).toBeGreaterThanOrEqual(19);
      expect(e.dc).toBeLessThanOrEqual(20);
    });
  });

  test('tier 3 entries are all deadly with pinned DCs (top-band semantics)', () => {
    getEnemiesByTier(3).forEach((e) => {
      expect(e.difficulty).toBe('deadly');
      expect(Number.isFinite(e.dc)).toBe(true);
    });
  });
});
