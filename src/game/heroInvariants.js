// Hero mechanics invariant checker (SAVE_SYNC_PLAN.md section 9.1).
//
// Hero state is stored as a mutable snapshot, so a skipped write, a stale-twin
// load, or a field-shape change can silently rewrite history (playtests lost
// equipment, then XP/levels, both "after a save"). These pure helpers verify a
// hero snapshot against the mechanical sources of truth and SELF-HEAL UPWARD,
// never downward:
// - level must match what xp implies (XP_THRESHOLDS); heal up when xp implies
//   more, never lower without ledger confirmation (see reconcileHeroWithLedger)
// - maxHP must be at least calculateMaxHPForLevel(class, con, level); heal up,
//   respecting the Math.max convention awardXP already uses (never lower)
// - currentHP is clamped to maxHP
// - equipped item keys must exist in inventory (equipment.js already drops the
//   bonus for a dangling slot; here the slot is cleared and reported)
// - gold/xp are floored at 0
//
// With a grant ledger present (heroLedger.js, section 9.2) reconciliation can
// also raise xp/gold snapshots that regressed BELOW the ledger sums, and may
// lower a level the ledger-confirmed xp no longer supports. Missing granted
// items are report-only: items are spendable/sellable, never auto-re-granted.

import { calculateLevel } from '../utils/progressionSystem';
import { calculateMaxHPForLevel } from '../utils/healthSystem';
import { EQUIP_SLOTS } from './equipment';
import { auditHeroAgainstLedger } from './heroLedger';

const heroName = (hero) => hero?.characterName || hero?.heroName || 'Hero';
// Heroes store their class as `heroClass` (HeroCreation); debug/legacy
// characters use `characterClass`. Same resolution as progressionSystem.
const resolveClass = (hero) => hero?.characterClass || hero?.heroClass;
const conModOf = (hero) => Math.floor(((hero?.stats?.Constitution || 10) - 10) / 2);
const inventoryHas = (inventory, key) =>
  (inventory || []).some((item) => (typeof item === 'string' ? item : item?.key) === key);

/**
 * Check one hero snapshot against the mechanics invariants.
 * Pure; reports only, never mutates or heals.
 * @param {Object} hero
 * @returns {{ violations: Array<{ code: string, detail: string }> }}
 */
export const checkHeroInvariants = (hero) => {
  const violations = [];
  if (!hero || typeof hero !== 'object') return { violations };

  const xp = Number(hero.xp) || 0;
  const gold = Number(hero.gold) || 0;
  if (xp < 0) {
    violations.push({ code: 'negative_xp', detail: `xp is ${xp}` });
  }
  if (gold < 0) {
    violations.push({ code: 'negative_gold', detail: `gold is ${gold}` });
  }

  const storedLevel = Number(hero.level) || 1;
  const impliedLevel = calculateLevel(Math.max(0, xp));
  if (storedLevel !== impliedLevel) {
    violations.push({
      code: 'level_xp_mismatch',
      detail: `level ${storedLevel} stored but XP ${Math.max(0, xp)} implies level ${impliedLevel}`
    });
  }

  const formulaMaxHP = calculateMaxHPForLevel(resolveClass(hero), conModOf(hero), storedLevel);
  const maxHP = Number(hero.maxHP) || 0;
  // Stored maxHP above the formula is legitimate (awardXP's Math.max convention
  // keeps repaired values); only BELOW the formula is a violation.
  if (maxHP < formulaMaxHP) {
    violations.push({
      code: 'maxhp_below_formula',
      detail: `maxHP ${maxHP} stored but level ${storedLevel} implies at least ${formulaMaxHP}`
    });
  }

  const currentHP = Number(hero.currentHP);
  if (Number.isFinite(currentHP) && currentHP > Math.max(maxHP, formulaMaxHP)) {
    violations.push({
      code: 'currenthp_above_max',
      detail: `currentHP ${currentHP} exceeds maxHP ${Math.max(maxHP, formulaMaxHP)}`
    });
  }

  EQUIP_SLOTS.forEach((slot) => {
    const key = hero.equipment?.[slot];
    if (key && !inventoryHas(hero.inventory, key)) {
      violations.push({
        code: 'equipment_dangling',
        detail: `equipped ${slot} '${key}' is not in inventory`
      });
    }
  });

  return { violations };
};

/**
 * Heal a hero snapshot UPWARD to what the mechanics imply. Never heals
 * downward: a level higher than xp implies is kept (only ledger-confirmed
 * reconciliation may lower it), and maxHP is only ever raised.
 * Pure; returns the SAME hero object when nothing needed healing.
 * @param {Object} hero
 * @returns {{ hero: Object, healed: string[] }} healed holds one human-readable
 *   message per repair, prefixed with the hero's name
 */
export const healHeroUpward = (hero) => {
  if (!hero || typeof hero !== 'object') return { hero, healed: [] };

  const healed = [];
  const name = heroName(hero);
  let h = hero;
  const patch = (fields) => { h = { ...h, ...fields }; };

  if (Number(h.xp) < 0) {
    healed.push(`${name} XP ${h.xp} -> 0 (floored)`);
    patch({ xp: 0 });
  }
  if (Number(h.gold) < 0) {
    healed.push(`${name} gold ${h.gold} -> 0 (floored)`);
    patch({ gold: 0 });
  }

  const xp = Number(h.xp) || 0;
  const storedLevel = Number(h.level) || 1;
  const impliedLevel = calculateLevel(xp);
  if (impliedLevel > storedLevel) {
    healed.push(`${name} level ${storedLevel} -> ${impliedLevel} (XP ${xp} implies level ${impliedLevel})`);
    patch({ level: impliedLevel });
  }

  const formulaMaxHP = calculateMaxHPForLevel(resolveClass(h), conModOf(h), Number(h.level) || 1);
  const maxHP = Number(h.maxHP) || 0;
  if (maxHP < formulaMaxHP) {
    healed.push(`${name} max HP ${maxHP} -> ${formulaMaxHP}`);
    // Math.max convention (awardXP): monotonically non-decreasing.
    // Raising the CEILING must preserve DAMAGE TAKEN, not the raw number:
    // a full hero (15/15) raised to max 22 must arrive full (22/22), else the
    // raise reads as "my tavern heal did not stick" (playtest 2026-07-05).
    // A hero missing 3 HP stays missing exactly 3.
    const prevCurrent = Number(h.currentHP);
    if (Number.isFinite(prevCurrent) && maxHP > 0 && prevCurrent <= maxHP) {
      const damageTaken = maxHP - prevCurrent;
      const carried = Math.max(formulaMaxHP, maxHP) - damageTaken;
      if (carried !== prevCurrent) {
        healed.push(`${name} HP ${prevCurrent} -> ${carried} (damage taken preserved)`);
      }
      patch({ maxHP: Math.max(formulaMaxHP, maxHP), currentHP: carried });
    } else {
      patch({ maxHP: Math.max(formulaMaxHP, maxHP) });
    }
  }

  const currentHP = Number(h.currentHP);
  if (Number.isFinite(currentHP) && currentHP > (Number(h.maxHP) || 0)) {
    healed.push(`${name} HP ${currentHP} -> ${h.maxHP} (clamped to max)`);
    patch({ currentHP: h.maxHP });
  }

  EQUIP_SLOTS.forEach((slot) => {
    const key = h.equipment?.[slot];
    if (key && !inventoryHas(h.inventory, key)) {
      healed.push(`${name} unequipped ${slot} '${key}' (missing from inventory)`);
      patch({ equipment: { ...h.equipment, [slot]: null } });
    }
  });

  return { hero: h, healed };
};

/**
 * Check every hero in a party. Violations are flattened with hero identity.
 * @param {Array} party
 * @returns {{ violations: Array<{ heroId, name, code, detail }> }}
 */
export const checkPartyInvariants = (party) => {
  const violations = [];
  (Array.isArray(party) ? party : []).forEach((hero) => {
    checkHeroInvariants(hero).violations.forEach((v) => {
      violations.push({
        heroId: (hero && (hero.heroId || hero.characterId)) || null,
        name: heroName(hero),
        ...v
      });
    });
  });
  return { violations };
};

/**
 * Heal every hero in a party upward. Party identity is preserved when nothing
 * needed healing (safe as a setState no-op).
 * @param {Array} party
 * @returns {{ party: Array, healed: string[] }}
 */
export const healPartyUpward = (party) => {
  if (!Array.isArray(party) || party.length === 0) return { party, healed: [] };
  const healed = [];
  let changed = false;
  const next = party.map((hero) => {
    const result = healHeroUpward(hero);
    if (result.hero !== hero) changed = true;
    healed.push(...result.healed);
    return result.hero;
  });
  return { party: changed ? next : party, healed };
};

/**
 * Reconcile a hero snapshot against the grant ledger (section 9.2): the ledger
 * is the source of truth that lets DOWNWARD-looking snapshot regressions be
 * healed UPWARD to the ledger sums.
 * - xp below the ledger sum is raised to the sum (xp is never legitimately spent)
 * - gold below the ledger sum is raised to the sum (spends are ledgered as
 *   negative grants at the spend chokepoints, so the sum tracks real gold)
 * - a stored level HIGHER than the (reconciled) xp implies is lowered ONLY when
 *   the ledger fully confirms the xp (hero xp equals the ledger xp sum exactly);
 *   pre-ledger progress means an unconfirmable higher level is kept
 * - items granted but absent are REPORT-ONLY: items are spendable/sellable, so
 *   they are never auto-re-granted
 * After any raise, the standard upward heal runs so a raised xp also raises the
 * level/maxHP it implies.
 * Pure; hero identity is preserved when nothing changed.
 * @param {Object} hero
 * @param {Array} ledgerEvents - settings.heroLedger
 * @returns {{ hero: Object, healed: string[], reported: string[] }}
 */
export const reconcileHeroWithLedger = (hero, ledgerEvents) => {
  if (!hero || typeof hero !== 'object' || !Array.isArray(ledgerEvents) || ledgerEvents.length === 0) {
    return { hero, healed: [], reported: [] };
  }

  const name = heroName(hero);
  const { sums, discrepancies } = auditHeroAgainstLedger(hero, ledgerEvents);
  const healed = [];
  const reported = [];
  let h = hero;

  discrepancies.forEach((d) => {
    if (d.code === 'xp_below_ledger') {
      healed.push(`${name} XP ${d.actual} -> ${d.ledger} (grant ledger)`);
      h = { ...h, xp: d.ledger };
    } else if (d.code === 'gold_below_ledger') {
      healed.push(`${name} gold ${d.actual} -> ${d.ledger} (grant ledger)`);
      h = { ...h, gold: d.ledger };
    } else if (d.code === 'item_missing') {
      reported.push(`${name} ledger shows ${d.granted}x '${d.key}', holding ${d.held} (items are spendable, not re-granted)`);
    }
  });

  // Ledger-confirmed DOWNWARD level heal (9.1): trust xp over a higher stored
  // level only when the ledger fully accounts for that xp.
  const xp = Number(h.xp) || 0;
  const storedLevel = Number(h.level) || 1;
  const impliedLevel = calculateLevel(xp);
  if (storedLevel > impliedLevel && xp === sums.xp) {
    healed.push(`${name} level ${storedLevel} -> ${impliedLevel} (ledger confirms XP ${xp})`);
    h = { ...h, level: impliedLevel };
  }

  // A raised xp may imply a higher level / maxHP; run the standard upward heal.
  if (h !== hero) {
    const up = healHeroUpward(h);
    h = up.hero;
    healed.push(...up.healed);
  }

  return { hero: h, healed, reported };
};
