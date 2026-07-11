// mobMovement.js
// Pure, headless-testable core for MOVING MOBS inside explorable wilderness sites
// (caves / ruins / forests). Site combat used to be static tile `content` the party
// could route around; now a site's fightable foes are ENTITIES that live in
// `site.mobs`, wake when the party comes near, and chase (or, for a boss, guard their
// tile). This module owns the entity shape and the per-step decision; the React seam
// (advancing them on the player's step, opening the fight, marking a mob defeated) lives
// in Game.js / useGameMap.js and only calls into the pure functions here.
//
// stepMobs is the keystone (analogous to computeWalkPath): given the mobs, the party
// position, and the site grid, it returns the next mob array plus the first mob now in
// contact with the party. It is deterministic (no Math.random, stable iteration order)
// so the chase can be proven in a unit test with no React and no timers.

import { computeWalkPath } from './tileWalk';

// --- Tunable constants (one place). ------------------------------------------------
// Distances are Manhattan (|dx| + |dy|), matching the rest of the site/town code.
// AGGRO_RADIUS: how close the party must come for an idle mob to wake.
// LEASH_RADIUS: how far a mob may stray from its home before it gives up and returns.
// DEAGGRO_RADIUS: how far the party must get for a chasing mob to lose interest.
export const AGGRO_RADIUS = 4;
export const LEASH_RADIUS = 7;
export const DEAGGRO_RADIUS = 6;

// Default mob covers one tile per step (the party's pace). A subset are `speed: 2`
// "hunters" that close two tiles per step, so once alerted they are unavoidable.
export const DEFAULT_MOB_SPEED = 1;
export const HUNTER_SPEED = 2;

// FLEE_DEAGGRO_STEPS: after the party SUCCESSFULLY flees a mob's fight, that mob is
// stamped with fleeCooldown = this many player-steps. While the cooldown is running the
// mob is forced idle and cannot re-aggro or re-contact, so the party (repositioned one
// tile back by the flee, see PR #117) actually breaks contact instead of being dropped
// straight back into the fight. Four steps gives the repositioned party room to reach the
// exit or leave aggro range even against a speed-2 hunter.
export const FLEE_DEAGGRO_STEPS = 4;

export const DEFAULT_MOB_CONFIG = {
  aggroRadius: AGGRO_RADIUS,
  leashRadius: LEASH_RADIUS,
  deaggroRadius: DEAGGRO_RADIUS,
};

// Manhattan distance between two {x,y} points.
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

// Site walkability predicate. Sites mark every tile with `t.walkable`; the only
// non-walkable type is `wall`. Deliberately NOT isTownTileWalkable (towns gate on water
// and building tiles instead). Reused for both chase and leash-return pathing.
export const isSiteWalkable = (t) => !!t && t.walkable === true;

/**
 * Build a mob entity. Random slot mobs default to speed 1; bosses/guards default to
 * speed 0 (stationary) so they hold the objective tile instead of wandering off it.
 *
 * @param {Object} args
 * @param {number} args.x @param {number} args.y spawn coordinate (also the home tile).
 * @param {Object} args.encounter the combat encounter this mob resolves as.
 * @param {string} [args.id] stable id (defaults derive from role + coordinate).
 * @param {string} [args.enemyId] milestone enemy id (boss); its defeat completes a milestone.
 * @param {boolean} [args.isBoss] guardian boss (stationary, holds its tile).
 * @param {string} [args.milestoneId] owning milestone (idempotence key for injection).
 * @param {number} [args.speed] tiles closed per step; defaults 0 for bosses, 1 otherwise.
 * @param {{x:number,y:number}} [args.home] leash anchor (defaults to spawn).
 * @returns {Object} the mob entity.
 */
export function makeMob({ id, x, y, encounter, enemyId = null, isBoss = false, milestoneId = null, speed, home } = {}) {
  const resolvedSpeed = Number.isFinite(speed) ? speed : (isBoss ? 0 : DEFAULT_MOB_SPEED);
  const mob = {
    id: id || (isBoss ? `bossmob_${milestoneId != null ? milestoneId : (enemyId || 'x')}_${x}_${y}` : `mob_${x}_${y}`),
    x, y,
    home: home || { x, y },
    state: 'idle', // 'idle' | 'alerted' | 'aggro'
    encounter,
    speed: resolvedSpeed,
    defeated: false,
    fleeCooldown: 0, // >0 means the party just fled this mob; it stays disengaged until 0
  };
  if (enemyId) mob.enemyId = enemyId;
  if (isBoss) mob.isBoss = true;
  if (milestoneId != null) mob.milestoneId = milestoneId;
  return mob;
}

/**
 * Turn a site's chosen `encounter` slots into moving mobs. Pure: the caller decides the
 * per-slot `kinds` (the SAME decision populateSite already makes) and supplies an
 * `encounterForSlot(index)` provider (which is where the caller's seeded rng is consumed,
 * so mob selection stays deterministic per site). Only 'encounter' slots become mobs;
 * loot / harvest / objective-item / location slots stay as static tile content.
 *
 * @param {Object} site the generated site (reads site.contentSlots for coordinates).
 * @param {Array<string>} kinds per-slot kind ('encounter' | 'loot' | ...).
 * @param {(index:number)=>Object|null} encounterForSlot returns the encounter for slot i.
 * @returns {Array<Object>} the mob entities (does NOT mutate `site`).
 */
export function spawnMobsFromSlots(site, kinds, encounterForSlot) {
  const slots = Array.isArray(site && site.contentSlots) ? site.contentSlots : [];
  const mobs = [];
  slots.forEach((slot, i) => {
    if (kinds[i] !== 'encounter') return;
    const encounter = encounterForSlot(i);
    if (!encounter) return;
    // Tougher foes become fast "hunters" (deterministic, no extra rng draw), so a site
    // has some unavoidable-once-alerted pursuers. Bands cap `hard` for low parties, so
    // early sites see few hunters and they scale in naturally.
    const speed = encounter.difficulty === 'hard' ? HUNTER_SPEED : DEFAULT_MOB_SPEED;
    mobs.push(makeMob({ x: slot.x, y: slot.y, encounter, speed }));
  });
  return mobs;
}

// Take up to `speed` steps along a BFS path, stopping before the goal tile when the goal
// is the party (adjacency is contact, no need to overlap the party marker). Returns the
// final {x,y}. Leash-return pathing passes stopBeforeGoal=false so it can settle home.
const walkAlong = (mapData, from, goal, speed, stopBeforeGoal) => {
  if (speed <= 0) return { x: from.x, y: from.y };
  const path = computeWalkPath(mapData, from, goal, isSiteWalkable);
  let pos = { x: from.x, y: from.y };
  for (let s = 0; s < speed && s < path.length; s++) {
    const next = path[s];
    if (stopBeforeGoal && next.x === goal.x && next.y === goal.y) break;
    pos = { x: next.x, y: next.y };
  }
  return pos;
};

/**
 * Advance every mob one player-step. For each non-defeated mob: update its alert state
 * from the distance to the party (and, for chasers, the distance from home), move it one
 * BFS step toward the party per unit of `speed` (or back toward home when it has given
 * up), and detect contact (co-located with, or orthogonally adjacent to, the party).
 *
 * Deterministic: no Math.random, mobs are processed in array order, and the FIRST mob in
 * contact is returned as `combatMob` (ties broken by that stable order). Bosses/guards
 * (speed 0) never move; they only flip to a visual 'aggro' when the party is near and
 * fire on contact, so they hold the objective tile.
 *
 * @param {Array<Object>} mobs current mob entities.
 * @param {{x:number,y:number}} playerPos the party's (already-updated) position.
 * @param {{mapData:Array<Array<Object>>}} siteMap the site grid (for pathing).
 * @param {Object} [config] radii overrides (defaults to DEFAULT_MOB_CONFIG).
 * @returns {{mobs:Array<Object>, combatMob:(Object|null)}} next mobs + first contact.
 */
export function stepMobs(mobs, playerPos, siteMap, config = DEFAULT_MOB_CONFIG) {
  const list = Array.isArray(mobs) ? mobs : [];
  const mapData = siteMap && siteMap.mapData;
  const { aggroRadius, leashRadius, deaggroRadius } = { ...DEFAULT_MOB_CONFIG, ...(config || {}) };

  let combatMob = null;
  const nextMobs = list.map((mob) => {
    if (!mob || mob.defeated) return mob; // defeated wins over everything (incl. cooldown)

    const speed = Number.isFinite(mob.speed) ? mob.speed : DEFAULT_MOB_SPEED;

    // --- Flee cooldown. -----------------------------------------------------------------
    // The party just fled this mob (PR #117 repositioned them a tile back). Force the mob
    // idle, decrement the cooldown, and refuse to re-aggro or make contact this step even
    // if the party is within AGGRO_RADIUS. It still walks one step back toward home so it
    // decisively breaks contact rather than lingering next to the party. Normal aggro/
    // contact resumes on the first step after the cooldown reaches 0.
    if (Number.isFinite(mob.fleeCooldown) && mob.fleeCooldown > 0) {
      let pos = { x: mob.x, y: mob.y };
      if (!mob.isBoss && speed > 0 && mapData && mob.home &&
          (mob.x !== mob.home.x || mob.y !== mob.home.y)) {
        pos = walkAlong(mapData, mob, mob.home, speed, false); // leash return, no contact
      }
      return { ...mob, x: pos.x, y: pos.y, state: 'idle', fleeCooldown: mob.fleeCooldown - 1 };
    }

    const dPlayer = manhattan(mob, playerPos);
    const dHome = manhattan(mob, mob.home || mob);

    // --- State machine. ---
    let state = mob.state || 'idle';
    if (mob.isBoss) {
      // Guardian: visual-only alert, never leaves its tile.
      state = dPlayer <= aggroRadius ? 'aggro' : 'idle';
    } else if (state === 'aggro') {
      if (dPlayer > deaggroRadius || dHome > leashRadius) state = 'idle'; // give up, head home
    } else if (state === 'alerted') {
      state = 'aggro'; // committed after the one-step tell
    } else { // idle
      if (dPlayer <= aggroRadius) state = 'alerted'; // the telegraph (no move this step)
    }

    // --- Movement. ---
    let pos = { x: mob.x, y: mob.y };
    if (!mob.isBoss && speed > 0 && mapData) {
      if (state === 'aggro') {
        pos = walkAlong(mapData, mob, playerPos, speed, true);
      } else if (state === 'idle' && (mob.x !== mob.home.x || mob.y !== mob.home.y)) {
        pos = walkAlong(mapData, mob, mob.home, speed, false); // leash return
      }
      // 'alerted' deliberately does not move: the one-step warning.
    }

    const nextMob = (pos.x === mob.x && pos.y === mob.y && state === mob.state)
      ? mob
      : { ...mob, x: pos.x, y: pos.y, state };

    // Contact: co-located or orthogonally adjacent. First one wins (stable order).
    if (!combatMob && manhattan(pos, playerPos) <= 1) combatMob = nextMob;
    return nextMob;
  });

  return { mobs: nextMobs, combatMob };
}

/**
 * Downgrade any persisted alerted/aggro mob back to idle. A save taken mid-chase must not
 * resume an in-flight pursuit against a freshly rehydrated map, so this runs where a site
 * map is loaded / entered. Mutates in place (the loaded/cached site object is shared with
 * its cache entry, mirroring how content.consumed heals) and returns the same array.
 *
 * @param {Array<Object>} mobs the site's mobs.
 * @returns {Array<Object>} the same array, healed.
 */
export function healMobsToIdle(mobs) {
  if (!Array.isArray(mobs)) return mobs;
  mobs.forEach((m) => {
    if (m && (m.state === 'alerted' || m.state === 'aggro')) m.state = 'idle';
  });
  return mobs;
}

// NOTE: an isMobBlocking(mob, tile) helper (treat a live boss/guard tile as impassable so
// the objective room is gated) is intentionally NOT implemented. Guardian gating was not
// wired: a boss is a stationary speed-0 guard that fires on contact when the party reaches
// its (deepest) room, which already forces the fight without making the tile impassable.
