// heroValidation.js
// Single source of truth for whether a character is valid. Used both for live
// flagging in the creator and to gate saving / starting a game.
//
// Free-tier rule: level 1, stats spent within the 5e 27-point buy (scores 8..15).
// Premium higher-level templates (added later) will be valid by construction.

import {
  POINT_BUY_COST,
  POINT_BUY_BUDGET,
  POINT_BUY_MIN,
  POINT_BUY_MAX,
  STAT_KEYS,
  heroGenders,
  heroClasses,
  heroRaces,
  alignmentOptions,
} from '../data/heroData';

export const scoreCost = (score) => POINT_BUY_COST[score] ?? null;

export const totalPointsSpent = (stats) =>
  STAT_KEYS.reduce((sum, key) => sum + (POINT_BUY_COST[stats?.[key]] ?? 0), 0);

export const pointsRemaining = (stats) => POINT_BUY_BUDGET - totalPointsSpent(stats);

// Can this score be raised/lowered within range and budget?
export const canIncreaseStat = (stats, key) => {
  const v = stats?.[key];
  if (typeof v !== 'number' || v >= POINT_BUY_MAX) return false;
  const delta = (POINT_BUY_COST[v + 1] ?? Infinity) - (POINT_BUY_COST[v] ?? 0);
  return pointsRemaining(stats) - delta >= 0;
};

export const canDecreaseStat = (stats, key) => {
  const v = stats?.[key];
  return typeof v === 'number' && v > POINT_BUY_MIN;
};

// Point cost of raising a score by one / points refunded by lowering it. The 5e
// curve is non-linear: 13->14 and 14->15 each cost 2, everything below costs 1.
export const increaseCost = (score) =>
  (score == null || score >= POINT_BUY_MAX) ? null : POINT_BUY_COST[score + 1] - POINT_BUY_COST[score];

export const decreaseRefund = (score) =>
  (score == null || score <= POINT_BUY_MIN) ? null : POINT_BUY_COST[score] - POINT_BUY_COST[score - 1];

export const validateStats = (stats) => {
  const reasons = [];
  if (!stats) return ['Stats are missing.'];
  for (const key of STAT_KEYS) {
    const v = stats[key];
    if (typeof v !== 'number' || !Number.isInteger(v)) {
      reasons.push(`${key} must be a whole number.`);
    } else if (v < POINT_BUY_MIN || v > POINT_BUY_MAX) {
      reasons.push(`${key} must be between ${POINT_BUY_MIN} and ${POINT_BUY_MAX}.`);
    }
  }
  const spent = totalPointsSpent(stats);
  if (spent > POINT_BUY_BUDGET) {
    reasons.push(`Stats are over the ${POINT_BUY_BUDGET}-point budget (using ${spent}).`);
  }
  return reasons;
};

// Structural checks: required fields present and enum values valid. These apply
// to every character regardless of when it was made.
const validateStructure = (hero) => {
  const reasons = [];
  if (!hero.heroName || !hero.heroName.trim()) reasons.push('Name is required.');
  if (!hero.heroGender) reasons.push('Gender is required.');
  else if (!heroGenders.includes(hero.heroGender)) reasons.push('Gender is invalid.');
  if (!hero.profilePicture) reasons.push('Profile picture is required.');
  if (!hero.heroRace) reasons.push('Race is required.');
  else if (!heroRaces.includes(hero.heroRace)) reasons.push('Race is invalid.');
  if (!hero.heroClass) reasons.push('Class is required.');
  else if (!heroClasses.includes(hero.heroClass)) reasons.push('Class is invalid.');
  if (!hero.heroAlignment) reasons.push('Alignment is required.');
  else if (!alignmentOptions.includes(hero.heroAlignment)) reasons.push('Alignment is invalid.');
  if (!hero.heroBackground || !hero.heroBackground.trim()) reasons.push('Background is required.');
  return reasons;
};

/**
 * Validate a character.
 * @param {Object} hero
 * @param {Object} [opts]
 * @param {boolean} [opts.enforcePointBuy=true] - also enforce the level-1 point-buy
 *   budget. Pass false at the play-time gate so legacy heroes (created before the
 *   point-buy rule) aren't locked out of campaigns mid-flight.
 * @returns {{ valid: boolean, reasons: string[] }}
 */
export const validateHero = (hero, opts = {}) => {
  const { enforcePointBuy = true } = opts;
  if (!hero) return { valid: false, reasons: ['No character data.'] };

  const reasons = validateStructure(hero);

  // Point-buy is a creation-time rule (the level selector is fixed at 1 in the UI,
  // so we don't validate level here — that keeps legacy/premium higher-level
  // characters from being flagged just for their level).
  if (enforcePointBuy) {
    reasons.push(...validateStats(hero.stats));
  }

  return { valid: reasons.length === 0, reasons };
};
