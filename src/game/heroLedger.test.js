import {
  appendLedgerEvents,
  auditHeroAgainstLedger,
  LEDGER_MAX_EVENTS,
  LEDGER_TRIM_TO,
  ledgerEventIdentity,
  ROLLUP_KIND,
  sumLedger,
  trimLedger,
  unionLedgers
} from './heroLedger';
import { reconcileHeroWithLedger } from './heroInvariants';

const xpEvent = (heroId, amount, extra = {}) => ({ heroId, kind: 'xp', amount, source: 'test', ...extra });
const goldEvent = (heroId, amount) => ({ heroId, kind: 'gold', amount, source: 'test' });
const itemEvent = (heroId, key) => ({ heroId, kind: 'item', key, source: 'test' });

describe('appendLedgerEvents', () => {
  it('starts a ledger on settings that never had one (old saves)', () => {
    const settings = { storyTitle: 'Old Save' };
    const next = appendLedgerEvents(settings, [xpEvent('h1', 50)]);
    expect(next).not.toBe(settings);
    expect(next.heroLedger).toHaveLength(1);
    expect(next.heroLedger[0]).toMatchObject({ heroId: 'h1', kind: 'xp', amount: 50, source: 'test' });
    expect(next.storyTitle).toBe('Old Save');
  });

  it('appends functionally: existing ledger array is not mutated', () => {
    const settings = { heroLedger: [xpEvent('h1', 10)] };
    const next = appendLedgerEvents(settings, [goldEvent('h1', 5)]);
    expect(settings.heroLedger).toHaveLength(1);
    expect(next.heroLedger).toHaveLength(2);
  });

  it('returns the SAME settings object when there is nothing to append', () => {
    const settings = { heroLedger: [] };
    expect(appendLedgerEvents(settings, [])).toBe(settings);
    expect(appendLedgerEvents(settings, null)).toBe(settings);
    expect(appendLedgerEvents(settings, [{ kind: 'xp', amount: 5 }])).toBe(settings); // no heroId
    expect(appendLedgerEvents(settings, [{ heroId: 'h1' }])).toBe(settings); // no kind
    expect(appendLedgerEvents(null, [xpEvent('h1', 5)])).toBe(null);
  });

  it('stamps a timestamp on events missing one and keeps a provided one', () => {
    const before = Date.now();
    const next = appendLedgerEvents({}, [xpEvent('h1', 5), xpEvent('h1', 6, { t: 1234 })]);
    expect(next.heroLedger[0].t).toBeGreaterThanOrEqual(before);
    expect(next.heroLedger[1].t).toBe(1234);
  });
});

describe('sumLedger', () => {
  const events = [
    xpEvent('h1', 100),
    xpEvent('h2', 40),
    goldEvent('h1', 25),
    goldEvent('h1', -10), // a ledgered spend
    itemEvent('h1', 'healing_potion'),
    itemEvent('h1', 'healing_potion'),
    itemEvent('h2', 'rope'),
    { heroId: 'h1', kind: 'level', amount: 2, source: 'test' } // informational only
  ];

  it('sums xp, gold (spends included) and item counts per hero', () => {
    expect(sumLedger(events, 'h1')).toEqual({
      xp: 100,
      gold: 15,
      itemsGranted: { healing_potion: 2 }
    });
    expect(sumLedger(events, 'h2')).toEqual({ xp: 40, gold: 0, itemsGranted: { rope: 1 } });
  });

  it('returns zeros for unknown heroes and bad input', () => {
    expect(sumLedger(events, 'nobody')).toEqual({ xp: 0, gold: 0, itemsGranted: {} });
    expect(sumLedger(null, 'h1')).toEqual({ xp: 0, gold: 0, itemsGranted: {} });
    expect(sumLedger(events, null)).toEqual({ xp: 0, gold: 0, itemsGranted: {} });
  });

  it('includes rollup baseline events in the sums', () => {
    const withRollup = [
      { t: 1, heroId: 'h1', kind: ROLLUP_KIND, xp: 500, gold: 80, items: { rope: 3 }, source: 'rollup' },
      xpEvent('h1', 10)
    ];
    expect(sumLedger(withRollup, 'h1')).toEqual({ xp: 510, gold: 80, itemsGranted: { rope: 3 } });
  });
});

describe('cap and rollup trim', () => {
  it('caps the ledger and preserves per-hero sums exactly across the trim', () => {
    let settings = {};
    // 250 xp events for h1, 250 gold events for h2, interleaved: 500 > cap.
    for (let i = 0; i < 250; i++) {
      settings = appendLedgerEvents(settings, [xpEvent('h1', 3), goldEvent('h2', 2)]);
    }
    expect(settings.heroLedger.length).toBeLessThanOrEqual(LEDGER_MAX_EVENTS);
    // Totals survive the trim byte-for-byte.
    expect(sumLedger(settings.heroLedger, 'h1').xp).toBe(250 * 3);
    expect(sumLedger(settings.heroLedger, 'h2').gold).toBe(250 * 2);
    // The trim left rollup baselines at the head plus recent raw events.
    const rollups = settings.heroLedger.filter((e) => e.kind === ROLLUP_KIND);
    expect(rollups.length).toBeGreaterThan(0);
  });

  it('merges older rollups into the next trim (repeated trims never lose totals)', () => {
    let settings = {};
    for (let i = 0; i < 900; i++) {
      settings = appendLedgerEvents(settings, [itemEvent('h1', 'arrow')]);
    }
    expect(settings.heroLedger.length).toBeLessThanOrEqual(LEDGER_MAX_EVENTS);
    expect(sumLedger(settings.heroLedger, 'h1').itemsGranted.arrow).toBe(900);
    // At most one rollup per hero survives each trim pass.
    const rollups = settings.heroLedger.filter((e) => e.kind === ROLLUP_KIND);
    expect(rollups.filter((e) => e.heroId === 'h1').length).toBe(1);
  });

  it('trimLedger keeps the newest raw events verbatim', () => {
    const events = [];
    for (let i = 0; i < LEDGER_MAX_EVENTS + 1; i++) {
      events.push({ ...xpEvent('h1', 1), t: i });
    }
    const trimmed = trimLedger(events);
    const raw = trimmed.filter((e) => e.kind !== ROLLUP_KIND);
    expect(raw).toHaveLength(LEDGER_TRIM_TO);
    expect(raw[raw.length - 1].t).toBe(LEDGER_MAX_EVENTS); // the newest survived
  });

  it('trimLedger is a no-op at or under the cap', () => {
    const events = [xpEvent('h1', 1)];
    expect(trimLedger(events)).toBe(events);
  });
});

describe('auditHeroAgainstLedger', () => {
  const ledger = [
    xpEvent('h1', 500),
    xpEvent('h1', 390),
    goldEvent('h1', 60),
    goldEvent('h1', -20),
    itemEvent('h1', 'iron_sword'),
    itemEvent('h1', 'healing_potion'),
    itemEvent('h1', 'healing_potion')
  ];

  it('flags xp and gold snapshots BELOW the ledger sums', () => {
    const hero = { heroId: 'h1', xp: 557, gold: 10, inventory: [] };
    const { discrepancies } = auditHeroAgainstLedger(hero, ledger);
    expect(discrepancies).toContainEqual({ code: 'xp_below_ledger', actual: 557, ledger: 890 });
    expect(discrepancies).toContainEqual({ code: 'gold_below_ledger', actual: 10, ledger: 40 });
  });

  it('does not flag snapshots at or above the sums (pre-ledger progress is fine)', () => {
    const hero = {
      heroId: 'h1',
      xp: 2000,
      gold: 40,
      inventory: [
        'iron_sword',
        { key: 'healing_potion', quantity: 2 }
      ]
    };
    expect(auditHeroAgainstLedger(hero, ledger).discrepancies).toEqual([]);
  });

  it('reports granted items the hero no longer holds, with counts', () => {
    const hero = {
      heroId: 'h1',
      xp: 890,
      gold: 40,
      inventory: [{ key: 'healing_potion', quantity: 1 }]
    };
    const { discrepancies } = auditHeroAgainstLedger(hero, ledger);
    expect(discrepancies).toContainEqual({ code: 'item_missing', key: 'iron_sword', granted: 1, held: 0 });
    expect(discrepancies).toContainEqual({ code: 'item_missing', key: 'healing_potion', granted: 2, held: 1 });
  });

  it('is silent for heroes without a stable id', () => {
    const { heroId, discrepancies } = auditHeroAgainstLedger({ xp: 0 }, ledger);
    expect(heroId).toBe(null);
    expect(discrepancies).toEqual([]);
  });
});

describe('unionLedgers (fork resolution, SAVE_SYNC_PLAN 9.2 / 6.2)', () => {
  // Two timelines that diverged after sharing a pre-fork history.
  const preFork = [
    { t: 1000, heroId: 'h1', kind: 'xp', amount: 100, source: 'milestone:1' },
    { t: 1500, heroId: 'h1', kind: 'gold', amount: 20, source: 'sidequest:well' }
  ];
  const cloudOnly = { t: 2000, heroId: 'h1', kind: 'gold', amount: 50, source: 'shop' };
  const localOnly = { t: 3000, heroId: 'h1', kind: 'xp', amount: 75, source: 'encounter' };
  const adopted = [...preFork, cloudOnly];
  const parked = [...preFork, localOnly];

  it('merges events from both timelines, deduping shared pre-fork history by identity', () => {
    const { ledger, added, aborted } = unionLedgers(adopted, parked);
    expect(aborted).toBe(false);
    expect(added).toBe(1);
    expect(ledger).toEqual([...preFork, cloudOnly, localOnly]); // chronological
    // The union sums cover progression EARNED on both sides, counted once.
    expect(sumLedger(ledger, 'h1')).toEqual({ xp: 175, gold: 70, itemsGranted: {} });
  });

  it('identity covers t + heroId + kind + magnitude + source (same-looking grants at different times both count)', () => {
    const again = { ...localOnly, t: 3001 };
    const { ledger } = unionLedgers([localOnly], [again]);
    expect(ledger).toHaveLength(2);
    expect(ledgerEventIdentity(localOnly)).not.toBe(ledgerEventIdentity(again));
    expect(ledgerEventIdentity(localOnly)).toBe(ledgerEventIdentity({ ...localOnly }));
  });

  it('is idempotent: re-running the union adds nothing and returns the same array', () => {
    const first = unionLedgers(adopted, parked).ledger;
    const second = unionLedgers(first, parked);
    expect(second.added).toBe(0);
    expect(second.ledger).toBe(first); // identity contract: unchanged input back
  });

  it('returns the same array when the incoming ledger brings nothing (subset or empty)', () => {
    expect(unionLedgers(adopted, preFork).ledger).toBe(adopted);
    expect(unionLedgers(adopted, []).ledger).toBe(adopted);
    expect(unionLedgers(adopted, null).ledger).toBe(adopted);
  });

  it('refuses (aborted) when the PARKED side carries a rollup the adopted side does not share', () => {
    const parkedRollup = { t: 2500, heroId: 'h1', kind: ROLLUP_KIND, xp: 100, gold: 20, items: {}, source: 'rollup' };
    const { ledger, aborted } = unionLedgers(adopted, [parkedRollup, localOnly]);
    expect(aborted).toBe(true);
    expect(ledger).toBe(adopted); // adopted ledger untouched, nothing double-counts
  });

  it('refuses when the ADOPTED side carries an unshared rollup (incoming raws may be folded inside it)', () => {
    const adoptedRollup = { t: 500, heroId: 'h1', kind: ROLLUP_KIND, xp: 100, gold: 20, items: {}, source: 'rollup' };
    const { aborted } = unionLedgers([adoptedRollup, cloudOnly], parked);
    expect(aborted).toBe(true);
  });

  it('a rollup SHARED by both timelines (trim happened before the fork) dedupes and unions safely', () => {
    const sharedRollup = { t: 500, heroId: 'h1', kind: ROLLUP_KIND, xp: 300, gold: 0, items: {}, source: 'rollup' };
    const { ledger, aborted } = unionLedgers([sharedRollup, cloudOnly], [sharedRollup, localOnly]);
    expect(aborted).toBe(false);
    expect(ledger).toEqual([sharedRollup, cloudOnly, localOnly]);
    expect(sumLedger(ledger, 'h1')).toEqual({ xp: 375, gold: 50, itemsGranted: {} });
  });

  it('drops malformed incoming events (no heroId/kind) instead of merging them', () => {
    const { ledger, added } = unionLedgers(adopted, [{ t: 9, kind: 'xp', amount: 5 }, localOnly]);
    expect(added).toBe(1);
    expect(ledger).toContainEqual(localOnly);
  });

  it('caps an oversized union through the rollup trim (sums preserved)', () => {
    const base = Array.from({ length: LEDGER_MAX_EVENTS }, (_, i) => xpEvent('h1', 1, { t: i + 1 }));
    const extra = [xpEvent('h1', 5, { t: LEDGER_MAX_EVENTS + 1 })];
    const { ledger } = unionLedgers(base, extra);
    expect(ledger.length).toBeLessThanOrEqual(LEDGER_TRIM_TO + 1);
    expect(sumLedger(ledger, 'h1')).toEqual({ xp: LEDGER_MAX_EVENTS + 5, gold: 0, itemsGranted: {} });
  });

  it('the union sums reconcile the ADOPTED heroes upward (losing-timeline earnings survive the fork)', () => {
    // The adopted snapshot only knows its own timeline: 100 xp + 70 gold.
    const adoptedHero = { heroId: 'h1', characterName: 'Wynn', heroClass: 'Wizard', level: 1, xp: 100, gold: 70, maxHP: 8, currentHP: 8, inventory: [] };
    const { ledger } = unionLedgers(adopted, parked);
    const { hero, healed } = reconcileHeroWithLedger(adoptedHero, ledger);
    expect(hero.xp).toBe(175); // + the 75 earned on the parked timeline
    expect(healed.some((line) => line.includes('XP 100 -> 175'))).toBe(true);
    // Re-running against the same union changes nothing (no double-counting).
    const again = reconcileHeroWithLedger(hero, ledger);
    expect(again.hero).toBe(hero);
  });
});
