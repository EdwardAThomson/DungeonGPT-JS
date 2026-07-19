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

// Wandering-monster spawn tuning (see spawnWanderingMob). A site's per-step wandering roll
// no longer opens a fight out of nowhere: it spawns a VISIBLE, already-aggro'd mob near the
// party that chases and engages on contact like any other mob, so the party can see it and
// flee. These constants keep corridors from flooding and keep the spawn reachable.
// WANDERING_MOB_CAP: max simultaneous non-defeated WANDERING mobs in a site (placed mobs and
//   bosses do not count against it). At the cap the roll is consumed without a new spawn.
// WANDERING_SPAWN_MIN_DIST / _MAX_DIST: Manhattan band (from the party) the spawn tile must
//   fall in: far enough not to appear on top of the party, near enough to actually close in.
export const WANDERING_MOB_CAP = 3;
export const WANDERING_SPAWN_MIN_DIST = 2;
export const WANDERING_SPAWN_MAX_DIST = 4;

// AMBIENT_ROAMER_TARGET: how many roaming, non-boss mobs a site should hold so it reads as
// INHABITED rather than a couple of fixed slot mobs. Seeded at population time and topped up
// on every re-entry (repopulateSiteRoamers in sitePopulator), so a cleared site re-colonises
// with wildlife WITHOUT the layout ever regenerating (additive, cache-safe). Roamers are
// ordinary `wandering` mobs — they count against WANDERING_MOB_CAP and behave identically —
// just placed proactively instead of rolled per-step. Kept below the cap so the per-step roll
// can still add the occasional extra pursuer on top.
// A wandering mob spawns already committed so it approaches immediately (no idle telegraph
// tell): the "surprise" is now a visible pursuer instead of an out-of-nowhere modal.
export const WANDERING_SPAWN_STATE = 'aggro';

export const AMBIENT_ROAMER_TARGET = 2;

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
 * @param {string} [args.state] initial alert state ('idle' | 'alerted' | 'aggro').
 *   Defaults to 'idle'; a wandering-monster spawn passes 'aggro' so it approaches at once.
 * @param {boolean} [args.wandering] marks a mob spawned by a per-step wandering roll (vs a
 *   placed slot mob or a milestone boss), so cap/analytics logic can tell them apart.
 * @returns {Object} the mob entity.
 */
export function makeMob({ id, x, y, encounter, enemyId = null, isBoss = false, milestoneId = null, speed, home, state, wandering = false } = {}) {
  const resolvedSpeed = Number.isFinite(speed) ? speed : (isBoss ? 0 : DEFAULT_MOB_SPEED);
  const mob = {
    id: id || (isBoss ? `bossmob_${milestoneId != null ? milestoneId : (enemyId || 'x')}_${x}_${y}` : `mob_${x}_${y}`),
    x, y,
    home: home || { x, y },
    state: state || 'idle', // 'idle' | 'alerted' | 'aggro'
    encounter,
    speed: resolvedSpeed,
    defeated: false,
    fleeCooldown: 0, // >0 means the party just fled this mob; it stays disengaged until 0
  };
  if (enemyId) mob.enemyId = enemyId;
  if (isBoss) mob.isBoss = true;
  if (milestoneId != null) mob.milestoneId = milestoneId;
  if (wandering) mob.wandering = true;
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

/**
 * Decide where up to `count` AMBIENT ROAMER mobs spawn across a site. Pure: returns the mobs
 * to add (the caller appends to site.mobs); does NOT mutate `site`. Roamers sit on random
 * walkable floor tiles that are not the entrance, carry no content/slot, are not already held
 * by a live mob, and lie at least `minFromEntry` from the entry point (so a fresh entry never
 * drops the party straight into a fight). They spawn IDLE, so they hold position until the
 * party wanders within AGGRO_RADIUS, then wake and engage like any mob. Tagged `wandering` so
 * they share the cap + lifecycle of a per-step spawn.
 *
 * @param {Object} site the site (reads mapData, entryPoint, mobs).
 * @param {Object} opts
 * @param {number} opts.count how many to place.
 * @param {(rng:()=>number)=>Object|null} opts.encounterFor supplies each roamer's encounter.
 * @param {()=>number} [opts.rng] uniform [0,1) source (defaults Math.random).
 * @param {number} [opts.minFromEntry] min Manhattan distance from the entry (defaults AGGRO_RADIUS+1).
 * @returns {Array<Object>} the roamer mobs to append.
 */
export function seedAmbientRoamers(site, { count, encounterFor, rng = Math.random, minFromEntry = AGGRO_RADIUS + 1 } = {}) {
  const mapData = site && site.mapData;
  if (!Array.isArray(mapData) || !(count > 0) || typeof encounterFor !== 'function') return [];
  const entry = site.entryPoint || { x: 0, y: 0 };
  const existing = Array.isArray(site.mobs) ? site.mobs : [];
  const occupied = new Set();
  existing.forEach((m) => { if (m && !m.defeated) occupied.add(`${m.x},${m.y}`); });

  const candidates = [];
  for (let y = 0; y < mapData.length; y++) {
    const row = mapData[y];
    if (!Array.isArray(row)) continue;
    for (let x = 0; x < row.length; x++) {
      const tile = row[x];
      if (!isSiteWalkable(tile) || tile.type === 'entrance') continue;
      if (tile.content || tile.contentSlot) continue;
      if (occupied.has(`${x},${y}`)) continue;
      if (Math.abs(x - entry.x) + Math.abs(y - entry.y) < minFromEntry) continue;
      candidates.push({ x, y });
    }
  }

  const roamers = [];
  const baseCount = existing.length;
  for (let i = 0; i < count && candidates.length > 0; i++) {
    const pick = candidates.splice(Math.floor(rng() * candidates.length), 1)[0];
    const encounter = encounterFor(rng);
    if (!encounter) break;
    // Roamers are gentle wildlife (never a hard hunter) so speed stays 1; the id carries a
    // growing suffix so a roamer placed where a defeated one fell never reuses its id.
    const speed = encounter.difficulty === 'hard' ? HUNTER_SPEED : DEFAULT_MOB_SPEED;
    roamers.push(makeMob({
      id: `roamer_${pick.x}_${pick.y}_${baseCount + i}`,
      x: pick.x, y: pick.y, encounter, speed, state: 'idle', wandering: true,
    }));
    occupied.add(`${pick.x},${pick.y}`);
  }
  return roamers;
}

/**
 * Count the live (non-defeated) WANDERING mobs currently in a site. Placed slot mobs and
 * milestone bosses are excluded, so the wandering cap only limits the roaming spawns.
 *
 * @param {Array<Object>} mobs the site's mobs.
 * @returns {number} count of non-defeated mobs flagged `wandering`.
 */
export function countActiveWanderingMobs(mobs) {
  if (!Array.isArray(mobs)) return 0;
  return mobs.reduce((n, m) => (m && m.wandering && !m.defeated ? n + 1 : n), 0);
}

/**
 * Decide where a per-step site wandering roll spawns its VISIBLE mob. Pure and testable: it
 * does not mutate `site` (the caller pushes the returned mob onto site.mobs). Returns the mob
 * to spawn, or null when it should NOT spawn one: either the wandering cap is already met, or
 * no walkable, unoccupied, in-range, party-reachable tile exists (the caller then falls back
 * to opening the fight so a wandering monster is never silently lost).
 *
 * The spawn tile is chosen from every walkable tile in the [minDist, maxDist] Manhattan band
 * around the party that is not occupied by the party or a live mob and is reachable from the
 * party via the site BFS (so the mob can actually path in to engage). One is picked with the
 * supplied `rng` (defaults to Math.random; tests inject a deterministic function).
 *
 * @param {{mapData:Array<Array<Object>>, mobs?:Array<Object>}} site the site grid + its mobs.
 * @param {{x:number,y:number}} playerPos the party's current tile.
 * @param {Object} encounter the rolled encounter the mob resolves as (carries difficulty).
 * @param {Object} [config] tuning overrides.
 * @param {number} [config.cap] max live wandering mobs (defaults WANDERING_MOB_CAP).
 * @param {number} [config.minDist] closest a spawn may sit (defaults WANDERING_SPAWN_MIN_DIST).
 * @param {number} [config.maxDist] farthest a spawn may sit (defaults WANDERING_SPAWN_MAX_DIST).
 * @param {string} [config.state] spawn alert state (defaults WANDERING_SPAWN_STATE, 'aggro').
 * @param {()=>number} [config.rng] uniform [0,1) source for the tile pick.
 * @returns {Object|null} the mob to spawn, or null to skip (cap met / no reachable tile).
 */
export function spawnWanderingMob(site, playerPos, encounter, config = {}) {
  const {
    cap = WANDERING_MOB_CAP,
    minDist = WANDERING_SPAWN_MIN_DIST,
    maxDist = WANDERING_SPAWN_MAX_DIST,
    state = WANDERING_SPAWN_STATE,
    rng = Math.random,
  } = config;
  if (!encounter || !playerPos) return null;
  const mapData = site && site.mapData;
  if (!Array.isArray(mapData) || mapData.length === 0) return null;
  const mobs = Array.isArray(site.mobs) ? site.mobs : [];
  if (countActiveWanderingMobs(mobs) >= cap) return null; // cap met: consume the roll, no spawn

  // Off-limits tiles: the party's tile and every live mob's tile (defeated mobs vacate).
  const occupied = new Set([`${playerPos.x},${playerPos.y}`]);
  mobs.forEach((m) => { if (m && !m.defeated) occupied.add(`${m.x},${m.y}`); });

  // Gather all walkable, unoccupied, in-band, party-reachable candidate tiles.
  const candidates = [];
  for (let y = 0; y < mapData.length; y++) {
    const row = mapData[y];
    if (!Array.isArray(row)) continue;
    for (let x = 0; x < row.length; x++) {
      if (!isSiteWalkable(row[x])) continue;
      const d = Math.abs(x - playerPos.x) + Math.abs(y - playerPos.y);
      if (d < minDist || d > maxDist) continue;
      if (occupied.has(`${x},${y}`)) continue;
      // Reachable from the party (undirected grid: reachable to the party too) so the mob
      // can path in. computeWalkPath returns [] when there is no route.
      const path = computeWalkPath(mapData, playerPos, { x, y }, isSiteWalkable);
      if (!path || path.length === 0) continue;
      candidates.push({ x, y });
    }
  }
  if (candidates.length === 0) return null; // no reachable spot: caller falls back to modal

  const idx = Math.min(candidates.length - 1, Math.max(0, Math.floor(rng() * candidates.length)));
  const pick = candidates[idx];
  // Tougher foes chase as fast "hunters" (mirrors spawnMobsFromSlots). Unique id keyed on the
  // live mob count so successive wandering spawns never collide with each other or a slot mob.
  const speed = encounter.difficulty === 'hard' ? HUNTER_SPEED : DEFAULT_MOB_SPEED;
  return makeMob({
    id: `wmob_${pick.x}_${pick.y}_${mobs.length}`,
    x: pick.x, y: pick.y, encounter, speed, state, wandering: true,
  });
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
