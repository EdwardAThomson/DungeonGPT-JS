// Append-only hero grant ledger (SAVE_SYNC_PLAN.md section 9.2).
//
// Every irreversible hero gain (xp, gold, item, level) appends a compact event to
// `settings.heroLedger` at the same chokepoints that already record codex
// discoveries. Current state stays the authoritative snapshot; the ledger is the
// immutable history it can be AUDITED against ("this hero has 557 xp but the
// ledger sums 890: a stale snapshot overwrote progress").
//
// Event shape: { t: <ms>, heroId, kind: 'xp'|'gold'|'item'|'level', amount?, key?, source }
// - 'xp'    -> amount (positive)
// - 'gold'  -> amount (positive for grants; SPENDS are recorded as negative amounts
//              at the spend chokepoints so the ledger gold sum tracks real gold and
//              reconciliation never mints back money the player spent)
// - 'item'  -> key (catalog/quest item key), optional count (default 1)
// - 'level' -> amount (the level reached); informational, level derives from xp
// - source  -> short human string ('milestone:3', 'sidequest:tend_sick', 'shop')
//
// The ledger is capped: on overflow the oldest events are folded into one ROLLUP
// baseline event per hero that preserves the per-hero sums, so trimming never
// loses totals. All helpers are pure and mirror the codex identity contract:
// callers get the SAME settings object back when nothing changed.

/** Hard cap on stored events; overflow triggers a rollup trim. */
export const LEDGER_MAX_EVENTS = 400;
/** Raw (non-rollup) events kept after a trim; the rest fold into rollups. */
export const LEDGER_TRIM_TO = 300;
/** Kind used by rollup baseline events created on trim. */
export const ROLLUP_KIND = 'rollup';

const emptySums = () => ({ xp: 0, gold: 0, itemsGranted: {} });

/** Fold one event into a running per-hero sums accumulator (mutates sums). */
const addEventToSums = (sums, event) => {
  if (!event) return;
  if (event.kind === 'xp') {
    sums.xp += Number(event.amount) || 0;
  } else if (event.kind === 'gold') {
    sums.gold += Number(event.amount) || 0;
  } else if (event.kind === 'item' && event.key) {
    const count = Number(event.count) || 1;
    sums.itemsGranted[event.key] = (sums.itemsGranted[event.key] || 0) + count;
  } else if (event.kind === ROLLUP_KIND) {
    sums.xp += Number(event.xp) || 0;
    sums.gold += Number(event.gold) || 0;
    Object.entries(event.items || {}).forEach(([key, count]) => {
      sums.itemsGranted[key] = (sums.itemsGranted[key] || 0) + (Number(count) || 0);
    });
  }
  // 'level' events carry no sum: level always derives from xp.
};

/**
 * Sum a hero's ledgered grants (rollups included).
 * @param {Array} events - settings.heroLedger
 * @param {string} heroId
 * @returns {{ xp: number, gold: number, itemsGranted: Object<string, number> }}
 */
export const sumLedger = (events, heroId) => {
  const sums = emptySums();
  if (!Array.isArray(events) || !heroId) return sums;
  events.forEach((event) => {
    if (event && event.heroId === heroId) addEventToSums(sums, event);
  });
  return sums;
};

/**
 * Trim an over-cap ledger: fold everything except the newest LEDGER_TRIM_TO raw
 * events into one rollup baseline event per hero. Existing rollups inside the
 * folded slice merge into the new baselines, so per-hero sums are ALWAYS
 * preserved exactly (the invariant the audit depends on).
 * @param {Array} events
 * @returns {Array} new array: [per-hero rollups..., newest raw events...]
 */
export const trimLedger = (events) => {
  if (!Array.isArray(events) || events.length <= LEDGER_MAX_EVENTS) return events;
  const cut = events.length - LEDGER_TRIM_TO;
  const folded = events.slice(0, cut);
  const kept = events.slice(cut);

  const byHero = new Map();
  folded.forEach((event) => {
    if (!event || !event.heroId) return;
    if (!byHero.has(event.heroId)) byHero.set(event.heroId, emptySums());
    addEventToSums(byHero.get(event.heroId), event);
  });

  const now = Date.now();
  const rollups = [...byHero.entries()].map(([heroId, sums]) => ({
    t: now,
    heroId,
    kind: ROLLUP_KIND,
    xp: sums.xp,
    gold: sums.gold,
    items: sums.itemsGranted,
    source: 'rollup'
  }));

  return [...rollups, ...kept];
};

/**
 * Append grant events to settings.heroLedger, returning a NEW settings object
 * (functional, mirrors codex recording). Events missing a timestamp are stamped
 * with now; events without a heroId or kind are dropped (nothing to attribute).
 * Old saves without settings.heroLedger start their ledger on the first grant.
 * @param {Object} settings
 * @param {Array} events - [{ heroId, kind, amount?|key?, source?, t? }]
 * @returns {Object} new settings, or the SAME object when nothing was appended
 */
export const appendLedgerEvents = (settings, events) => {
  if (!settings || !Array.isArray(events) || events.length === 0) return settings;
  const now = Date.now();
  const clean = events
    .filter((event) => event && event.heroId && event.kind)
    .map((event) => ({ ...event, t: Number.isFinite(event.t) ? event.t : now }));
  if (clean.length === 0) return settings;

  const prev = Array.isArray(settings.heroLedger) ? settings.heroLedger : [];
  let next = [...prev, ...clean];
  if (next.length > LEDGER_MAX_EVENTS) next = trimLedger(next);
  return { ...settings, heroLedger: next };
};

/** Count how many of `key` a hero currently holds (string or object entries). */
const countHeld = (inventory, key) => {
  let held = 0;
  (inventory || []).forEach((item) => {
    if (typeof item === 'string') {
      if (item === key) held += 1;
    } else if (item && item.key === key) {
      held += Number(item.quantity) || 1;
    }
  });
  return held;
};

/**
 * Audit a hero snapshot against its ledgered grant history.
 * Only LOWER-than-ledger snapshots are discrepancies: higher is legitimate
 * (pre-ledger progress, unhooked gains) and never flagged.
 * Item discrepancies are informational: items are spendable/sellable, so
 * "granted but absent" is often normal play (a drunk potion, a sold sword).
 * @param {Object} hero
 * @param {Array} events - settings.heroLedger
 * @returns {{ heroId: string|null, sums: Object, discrepancies: Array }}
 */
export const auditHeroAgainstLedger = (hero, events) => {
  const heroId = (hero && (hero.heroId || hero.characterId)) || null;
  const sums = sumLedger(events, heroId);
  const discrepancies = [];
  if (!hero || !heroId) return { heroId, sums, discrepancies };

  const xp = Number(hero.xp) || 0;
  if (xp < sums.xp) {
    discrepancies.push({ code: 'xp_below_ledger', actual: xp, ledger: sums.xp });
  }
  const gold = Number(hero.gold) || 0;
  if (gold < sums.gold) {
    discrepancies.push({ code: 'gold_below_ledger', actual: gold, ledger: sums.gold });
  }
  Object.entries(sums.itemsGranted).forEach(([key, granted]) => {
    const held = countHeld(hero.inventory, key);
    if (held < granted) {
      discrepancies.push({ code: 'item_missing', key, granted, held });
    }
  });

  return { heroId, sums, discrepancies };
};
