import {
  checkHeroInvariants,
  checkPartyInvariants,
  healHeroUpward,
  healPartyUpward,
  reconcileHeroWithLedger
} from './heroInvariants';
import { calculateMaxHPForLevel } from '../utils/healthSystem';

// Fighter, Con 10 (mod 0): level 1 max HP = 10, +6 per level (d10 average + 1).
const makeHero = (overrides = {}) => ({
  heroId: 'h1',
  characterName: 'Ara',
  heroClass: 'Fighter',
  stats: { Constitution: 10 },
  xp: 0,
  level: 1,
  gold: 0,
  maxHP: 10,
  currentHP: 10,
  inventory: [],
  ...overrides
});

const codes = (result) => result.violations.map((v) => v.code);

describe('checkHeroInvariants', () => {
  it('passes a clean hero', () => {
    expect(checkHeroInvariants(makeHero()).violations).toEqual([]);
    expect(checkHeroInvariants(null).violations).toEqual([]);
  });

  it('flags a level below what xp implies', () => {
    // 950 xp implies level 3 (thresholds: 300 for 2, 900 for 3)
    const result = checkHeroInvariants(makeHero({ xp: 950, level: 2, maxHP: 22 }));
    expect(codes(result)).toContain('level_xp_mismatch');
  });

  it('flags a level above what xp implies (stale snapshot suspicion)', () => {
    const result = checkHeroInvariants(makeHero({ xp: 100, level: 3, maxHP: 22 }));
    expect(codes(result)).toContain('level_xp_mismatch');
  });

  it('flags maxHP below the class/level formula but tolerates above (Math.max convention)', () => {
    const low = checkHeroInvariants(makeHero({ xp: 300, level: 2, maxHP: 10 }));
    expect(codes(low)).toContain('maxhp_below_formula');
    const high = checkHeroInvariants(makeHero({ maxHP: 99, currentHP: 10 }));
    expect(codes(high)).not.toContain('maxhp_below_formula');
  });

  it('flags currentHP above maxHP', () => {
    const result = checkHeroInvariants(makeHero({ currentHP: 25 }));
    expect(codes(result)).toContain('currenthp_above_max');
  });

  it('flags equipped item keys missing from inventory', () => {
    const result = checkHeroInvariants(makeHero({
      equipment: { weapon: 'iron_sword', armor: null, accessory: null },
      inventory: []
    }));
    expect(codes(result)).toContain('equipment_dangling');
    // Carried gear (string or object entries) is fine.
    const ok = checkHeroInvariants(makeHero({
      equipment: { weapon: 'iron_sword' },
      inventory: [{ key: 'iron_sword', quantity: 1 }]
    }));
    expect(codes(ok)).not.toContain('equipment_dangling');
  });

  it('flags negative gold and xp', () => {
    const result = checkHeroInvariants(makeHero({ gold: -5, xp: -10 }));
    expect(codes(result)).toEqual(expect.arrayContaining(['negative_gold', 'negative_xp']));
  });
});

describe('healHeroUpward', () => {
  it('returns the SAME hero object when nothing needs healing', () => {
    const hero = makeHero();
    const { hero: healed, healed: messages } = healHeroUpward(hero);
    expect(healed).toBe(hero);
    expect(messages).toEqual([]);
  });

  it('raises level to what xp implies and reports it by name', () => {
    const { hero, healed } = healHeroUpward(makeHero({ xp: 950, level: 2, maxHP: 22 }));
    expect(hero.level).toBe(3);
    expect(healed.join(' ')).toContain('Ara level 2 -> 3 (XP 950 implies level 3)');
  });

  it('never lowers a level higher than xp implies (needs ledger confirmation)', () => {
    const suspicious = makeHero({ xp: 100, level: 3, maxHP: 22 });
    const { hero } = healHeroUpward(suspicious);
    expect(hero.level).toBe(3);
  });

  it('raises maxHP to the formula, never lowers it', () => {
    const { hero } = healHeroUpward(makeHero({ xp: 300, level: 2, maxHP: 10, currentHP: 10 }));
    expect(hero.maxHP).toBe(calculateMaxHPForLevel('Fighter', 0, 2)); // 16
    const generous = makeHero({ maxHP: 99, currentHP: 50 });
    expect(healHeroUpward(generous).hero.maxHP).toBe(99);
  });

  it('a level raise cascades into the maxHP the new level implies', () => {
    const { hero } = healHeroUpward(makeHero({ xp: 950, level: 1, maxHP: 10, currentHP: 10 }));
    expect(hero.level).toBe(3);
    expect(hero.maxHP).toBe(calculateMaxHPForLevel('Fighter', 0, 3)); // 22
  });

  it('clamps currentHP to maxHP', () => {
    const { hero, healed } = healHeroUpward(makeHero({ currentHP: 40 }));
    expect(hero.currentHP).toBe(10);
    expect(healed.some((m) => m.includes('HP 40 -> 10'))).toBe(true);
  });

  it('clears dangling equipment slots and reports them', () => {
    const { hero, healed } = healHeroUpward(makeHero({
      equipment: { weapon: 'iron_sword', armor: 'leather_armor', accessory: null },
      inventory: [{ key: 'leather_armor', quantity: 1 }]
    }));
    expect(hero.equipment.weapon).toBe(null);
    expect(hero.equipment.armor).toBe('leather_armor');
    expect(healed.some((m) => m.includes("unequipped weapon 'iron_sword'"))).toBe(true);
  });

  it('floors negative gold and xp at 0', () => {
    const { hero } = healHeroUpward(makeHero({ gold: -12, xp: -3 }));
    expect(hero.gold).toBe(0);
    expect(hero.xp).toBe(0);
  });
});

describe('party wrappers', () => {
  it('checkPartyInvariants flattens violations with hero identity', () => {
    const party = [makeHero(), makeHero({ heroId: 'h2', characterName: 'Bem', gold: -1 })];
    const { violations } = checkPartyInvariants(party);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ heroId: 'h2', name: 'Bem', code: 'negative_gold' });
  });

  it('healPartyUpward preserves party identity when nothing changed', () => {
    const party = [makeHero()];
    expect(healPartyUpward(party).party).toBe(party);
    const dirty = [makeHero({ currentHP: 99 })];
    const result = healPartyUpward(dirty);
    expect(result.party).not.toBe(dirty);
    expect(result.healed).toHaveLength(1);
  });
});

describe('reconcileHeroWithLedger', () => {
  const grants = (heroId, list) => list.map(([kind, val]) => (
    kind === 'item'
      ? { t: 1, heroId, kind, key: val, source: 'test' }
      : { t: 1, heroId, kind, amount: val, source: 'test' }
  ));

  it('raises xp regressed below the ledger sum, cascading level and maxHP', () => {
    const ledger = grants('h1', [['xp', 500], ['xp', 450]]); // sums to 950 -> level 3
    const hero = makeHero({ xp: 557, level: 2, maxHP: 16 });
    const { hero: healed, healed: messages } = reconcileHeroWithLedger(hero, ledger);
    expect(healed.xp).toBe(950);
    expect(healed.level).toBe(3);
    expect(healed.maxHP).toBe(calculateMaxHPForLevel('Fighter', 0, 3));
    expect(messages.join(' ')).toContain('XP 557 -> 950 (grant ledger)');
  });

  it('raises gold regressed below the ledger sum (spends are ledgered as negatives)', () => {
    const ledger = grants('h1', [['gold', 60], ['gold', -20]]); // net 40
    const { hero } = reconcileHeroWithLedger(makeHero({ gold: 5 }), ledger);
    expect(hero.gold).toBe(40);
  });

  it('lowers a level DOWN only when the ledger confirms the xp exactly', () => {
    // Ledger fully accounts for 300 xp -> level 2; snapshot says level 4.
    const confirmed = grants('h1', [['xp', 300]]);
    const down = reconcileHeroWithLedger(makeHero({ xp: 300, level: 4, maxHP: 28 }), confirmed);
    expect(down.hero.level).toBe(2);
    expect(down.hero.maxHP).toBe(28); // maxHP never lowers

    // Pre-ledger progress (xp above the ledger sum): the higher level is kept.
    const unconfirmed = grants('h1', [['xp', 100]]);
    const kept = reconcileHeroWithLedger(makeHero({ xp: 300, level: 4, maxHP: 28 }), unconfirmed);
    expect(kept.hero.level).toBe(4);
  });

  it('reports missing granted items without re-granting them', () => {
    const ledger = grants('h1', [['item', 'healing_potion']]);
    const hero = makeHero();
    const { hero: after, healed, reported } = reconcileHeroWithLedger(hero, ledger);
    expect(after).toBe(hero); // nothing healed, identity preserved
    expect(healed).toEqual([]);
    expect(reported).toHaveLength(1);
    expect(reported[0]).toContain('healing_potion');
  });

  it('ignores other heroes and empty ledgers', () => {
    const hero = makeHero();
    expect(reconcileHeroWithLedger(hero, []).hero).toBe(hero);
    const otherLedger = grants('someone_else', [['xp', 9999]]);
    expect(reconcileHeroWithLedger(hero, otherLedger).hero).toBe(hero);
  });
});
