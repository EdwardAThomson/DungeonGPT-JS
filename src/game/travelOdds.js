// travelOdds: exact per-journey encounter numbers for world-map travel, used to tune
// PASS_THROUGH_ENCOUNTER_MULTIPLIER (encounterGenerator.js). It mirrors checkForEncounter's
// world-tile rolls: the environmental roll, then the biome roll (with the revisit
// multiplier, grimness and the quiet-moves "pity" bonus), each table's 'none' share
// counted as no encounter. POI-specific encounters are left out (routes cross open land).
//
// Exact, not sampled: a small dynamic program over the quiet-moves counter (capped at 5,
// where the pity bonus stops growing). Any encounter interrupts the journey and resets the
// counter; the party then carries on, so `expected` counts interruptions per route.

import { biomeTriggerChance, environmentalTriggerChance } from '../utils/encounterGenerator';
import { encounterTables, environmentalEncounterTable } from '../data/encounterTables';
import { encounterTemplates } from '../data/encounters';

const MAX_MOVES = 5;

// Share of a weighted table that is a real encounter (not 'none').
const firingShare = (table) => {
  const total = table.reduce((s, e) => s + (e.weight || 0), 0);
  const none = table.filter((e) => e.template === 'none').reduce((s, e) => s + (e.weight || 0), 0);
  return total > 0 ? (total - none) / total : 0;
};

// The environmental table after the same temperate climate filter rollEnvironmentalEncounter
// applies (tagged hot/cold hazards drop out of a temperate campaign).
const temperateEnvironmentalShare = () => firingShare(environmentalEncounterTable.filter((entry) => {
  if (entry.template === 'none') return true;
  const tag = encounterTemplates[entry.template]?.climate;
  return !tag || tag === 'any' || tag === 'temperate';
}));

/** Probability that a single world tile produces an encounter. */
export const tileEncounterChance = ({ biome = 'plains', firstVisit = true, moves = 0, settings = {}, multiplier = 1 } = {}) => {
  const tile = { biome };
  const pEnv = Math.min(1, environmentalTriggerChance(tile, settings) * multiplier) * temperateEnvironmentalShare();
  const pBiome = Math.min(1, biomeTriggerChance(tile, firstVisit, settings, moves) * multiplier)
    * firingShare(encounterTables[biome] || encounterTables.plains);
  return 1 - (1 - pEnv) * (1 - pBiome);
};

/**
 * Encounter stats for one auto-travel route of `tiles` steps: every step but the last is
 * pass-through (rolled at `multiplier`), the last is the destination at full odds.
 * @returns {{ expected: number, pClear: number }} expected interruptions, and the chance
 *   the whole route goes by with none.
 */
export const journeyEncounterStats = ({ tiles, biome = 'plains', firstVisit = true, startMoves = 0, settings = {}, multiplier = 1 } = {}) => {
  let dist = new Array(MAX_MOVES + 1).fill(0); // probability over the quiet-moves counter
  dist[Math.min(startMoves, MAX_MOVES)] = 1;
  let expected = 0;
  let pClear = 1;
  for (let i = 0; i < tiles; i++) {
    const m = i === tiles - 1 ? 1 : multiplier;
    const next = new Array(MAX_MOVES + 1).fill(0);
    let pHitThisStep = 0;
    dist.forEach((p, moves) => {
      if (!p) return;
      const hit = tileEncounterChance({ biome, firstVisit, moves, settings, multiplier: m });
      pHitThisStep += p * hit;
      next[0] += p * hit; // an encounter resets the counter
      next[Math.min(moves + 1, MAX_MOVES)] += p * (1 - hit);
    });
    expected += pHitThisStep;
    // Chance of still being clear: only paths with no hit so far. Tracked separately
    // because `dist` merges post-encounter paths back in.
    pClear *= 1 - clearHit(i, tiles, multiplier, { biome, firstVisit, settings, startMoves });
    dist = next;
  }
  return { expected, pClear };
};

// Hit chance at step i GIVEN no encounter yet: the counter is then startMoves + i.
const clearHit = (i, tiles, multiplier, { biome, firstVisit, settings, startMoves }) =>
  tileEncounterChance({
    biome, firstVisit, settings,
    moves: Math.min(startMoves + i, MAX_MOVES),
    multiplier: i === tiles - 1 ? 1 : multiplier,
  });
