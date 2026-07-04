// questEngine.js
// Drives optional SIDE QUESTS (parallel to the main campaign milestone chain). Each side
// quest is a milestone-shaped chain, so it reuses the milestone engine for step
// completion. The game loop checks an event against the main campaign AND every active
// side quest. See docs/QUESTS_AND_SITES_PLAN.md.

import { SIDE_QUESTS } from '../data/sideQuests';

// --- step matching helpers ---------------------------------------------------
// A step's prerequisites (other step ids in the same quest) are all completed.
const requiresMet = (step, milestones) =>
  (step.requires || []).every((rid) => milestones.find((m) => m.id === rid)?.completed);

const stepRewards = (step) => step.rewards || { xp: 0, gold: 0, items: [] };

// Apply a game event to a step's trigger. Supports a `count` (collect/defeat N) — each
// matching event bumps progress, completing only at the threshold. Returns the new
// progress + whether the step is now complete, or null if the event doesn't match.
const applyEventToStep = (step, event) => {
  const t = step.trigger || {};
  let matched = false;
  if (event.type === 'item_acquired' && t.item && event.itemId === t.item) matched = true;
  else if (event.type === 'enemy_defeated' && t.enemy && (t.enemy === 'any' || event.enemyId === t.enemy)) matched = true;
  else if (event.type === 'location_visited' && t.location && event.locationId === t.location) matched = true;
  if (!matched) return null;
  const need = t.count || 1;
  const progress = (step.progress || 0) + 1;
  return { progress, completed: progress >= need };
};

// Does a turn-in step accept being handed in at the given context (building/town)?
const turnInMatches = (turnIn, ctx = {}) => {
  if (!turnIn) return false;
  if (turnIn.building) {
    const buildings = Array.isArray(turnIn.building) ? turnIn.building : [turnIn.building];
    if (!buildings.includes(ctx.buildingType)) return false;
  }
  if (turnIn.location && ctx.townName !== turnIn.location) return false;
  return true;
};

/**
 * Can this quest be both STARTED and COMPLETED on the generated map? It must have a giver
 * building that exists, every site objective's site type must exist, and every turn-in
 * building must exist — otherwise the quest would be unstartable or uncompletable.
 * @param {Object} quest
 * @param {{ sites?: {cave?:boolean, ruins?:boolean}, buildings?: string[] }} availability
 */
export const isQuestEligible = (quest, availability = {}) => {
  const sites = availability.sites || {};
  const buildingSet = new Set(availability.buildings || []);
  const hasBuilding = (b) => (Array.isArray(b) ? b : [b]).some((x) => buildingSet.has(x));

  // startable: the giver building must exist on the map
  if (!quest.giver?.building || !hasBuilding(quest.giver.building)) return false;
  // completable: every step's site / turn-in target must exist
  for (const m of quest.milestones) {
    if (m.site && !sites[m.site.type]) return false;
    // Gather steps carry a `sites` source hint (where the item can actually be
    // harvested); the quest is completable if ANY of those site types exists.
    if (Array.isArray(m.sites) && m.sites.length > 0 && !m.sites.some((t) => sites[t])) return false;
    if (m.trigger?.turnIn?.building && !hasBuilding(m.trigger.turnIn.building)) return false;
  }
  return true;
};

/**
 * Pick a few side quests from the pool that can be fully started AND completed on the
 * generated map (see isQuestEligible). Returns fresh, mutable 'available' copies.
 * @param {{ sites?: object, buildings?: string[] }} availability - map's sites + building types.
 * @param {number} count - how many to include (default 2).
 * @param {() => number} rng - 0..1 RNG for a reproducible pick (default Math.random).
 */
export const selectSideQuests = (availability = {}, count = 2, rng = Math.random, pool = SIDE_QUESTS) => {
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const eligible = pool.filter((q) => isQuestEligible(q, availability));
  // Guarantee at least one low-tier (minLevel<=2) quest so early game has something to do,
  // then fill the rest at random. Tiering then reveals higher quests as the party levels.
  const low = shuffle(eligible.filter((q) => (q.minLevel || 1) <= 2));
  const rest = shuffle(eligible.filter((q) => (q.minLevel || 1) > 2));
  const ordered = low.length ? [low[0], ...shuffle([...low.slice(1), ...rest])] : shuffle(rest);
  return ordered.slice(0, count).map((q) => ({
    ...q,
    milestones: q.milestones.map((m) => ({ ...m, completed: false, progress: 0 })),
    status: 'available',
  }));
};

// --- side-quest backfill (#45) ------------------------------------------------
// A save keeps only the quests selected at world-gen; when the SIDE_QUESTS pool grows,
// in-progress saves top up ON LOAD from the enlarged pool. Additive only: existing
// quests (any status) are never touched, only brand-new 'available' copies append.

/**
 * Availability snapshot for side-quest selection AT LOAD, derived exactly the way the
 * new-game launcher derives it (campaignLauncher) so backfill eligibility matches the
 * initial selection: sites from the persisted world map, building types unioned from
 * the cached town maps. Saves made since town pre-generation carry EVERY town in the
 * cache, so this is the exact placed-building set; older lazy-gen saves list only
 * visited towns, which under-offers (never over-offers): every backfilled quest's
 * giver is confirmed placed. townCount feeds the backfill cap.
 * @returns {{ sites: {cave:boolean, ruins:boolean}, buildings: string[], townCount: number }}
 */
export const deriveSideQuestAvailability = (worldMap, townMapsCache) => {
  const flatTiles = [].concat(...(Array.isArray(worldMap) ? worldMap : []));
  const sites = {
    cave: flatTiles.some((t) => t?.poi === 'cave_entrance'),
    ruins: flatTiles.some((t) => t?.poi === 'ruins'),
    // Open (never-hidden) site types: gather quests hint these as item sources, so
    // eligibility must know whether they exist on the map.
    forest: flatTiles.some((t) => t?.poi === 'forest'),
    hills: flatTiles.some((t) => t?.poi === 'hills'),
    mountain: flatTiles.some((t) => t?.poi === 'mountain'),
  };
  const buildings = new Set();
  Object.values(townMapsCache || {}).forEach((tm) => {
    (tm?.mapData || []).forEach((row) => (row || []).forEach((t) => {
      if (t?.type === 'building' && t.buildingType) buildings.add(t.buildingType);
    }));
  });
  const townCount = flatTiles.filter((t) => t?.poi === 'town').length;
  return { sites, buildings: [...buildings], townCount };
};

/**
 * Which pool quests can be ADDED to a save (pure; deterministic given rng). Eligibility
 * is identical to the initial selection (isQuestEligible via selectSideQuests: giver
 * building exists, every site type + turn-in building exists), excluding every quest id
 * already in the save REGARDLESS of status (completed included, so no repeats).
 *
 * Cap: new-game selection picks base = min(4, max(2, townCount)) quests; backfill tops
 * the save's OUTSTANDING (non-completed) quests up to base + 2. Rationale: the cap
 * limits the player's open queue, not lifetime history (counting completed quests
 * would starve exactly the long-running saves this feature targets), and the +2
 * headroom over the new-game count is what lets a save that already holds its full
 * initial selection actually see new pool content.
 *
 * Level: only quests within reach soon (minLevel <= level + 2, level = effective party
 * level) are added, mirroring the chain-continuation tier gate, so a low-level party's
 * few cap slots aren't consumed by quests it couldn't see for many sessions.
 *
 * @param {Array} existingSideQuests - settings.sideQuests (absent/[] for very old saves)
 * @param {{ availability?: {sites?:object, buildings?:string[], townCount?:number},
 *           level?: number, rng?: () => number, pool?: Array }} opts
 * @returns {Array} fresh 'available' quest copies to APPEND (possibly empty)
 */
export const backfillSideQuests = (existingSideQuests, { availability = {}, level = 1, rng = Math.random, pool = SIDE_QUESTS } = {}) => {
  const existing = Array.isArray(existingSideQuests) ? existingSideQuests : [];
  const baseCount = Math.min(4, Math.max(2, availability.townCount ?? 4));
  const cap = baseCount + 2;
  const outstanding = existing.filter((q) => q?.status !== 'completed').length;
  const room = cap - outstanding;
  if (room <= 0) return [];
  const existingIds = new Set(existing.map((q) => q?.id));
  const candidates = pool.filter((q) => !existingIds.has(q.id) && (q.minLevel || 1) <= level + 2);
  if (candidates.length === 0) return [];
  return selectSideQuests({ sites: availability.sites || {}, buildings: availability.buildings || [] }, room, rng, candidates);
};

/**
 * Load-path wrapper: apply the side-quest backfill to a loaded save's settings.
 * Pure; returns the SAME settings reference when there is nothing to do (cheap skip).
 *
 * Version guard: settings.sideQuestPoolSize records the pool size the save last saw;
 * when it equals the current pool size the whole computation is skipped, so eligibility
 * never reruns on every load, only when the pool actually changed (or the save has
 * never been stamped: pre-feature saves, including ones with NO sideQuests field at
 * all, which get a fresh selection-equivalent backfill).
 *
 * Determinism: the rng is an LCG seeded off worldSeed + poolSize (same LCG family as
 * the launcher/chain), so re-running before the stamp persists (e.g. a crash between
 * compute and autosave) adds the exact same quests, never duplicates or rerolls.
 *
 * A missing/empty world map skips WITHOUT stamping, so a later load with a good map
 * can still backfill.
 *
 * @param {object} settings - parsed game_settings from the save row
 * @param {{ worldMap?: Array, townMapsCache?: object, party?: Array }} ctx
 * @param {Array} [pool]
 * @returns {{ settings: object, added: Array }}
 */
export const applySideQuestBackfill = (settings, { worldMap, townMapsCache, party } = {}, pool = SIDE_QUESTS) => {
  const poolSize = pool.length;
  if (!settings || settings.sideQuestPoolSize === poolSize) return { settings, added: [] };
  if (!Array.isArray(worldMap) || worldMap.length === 0) return { settings, added: [] };
  const availability = deriveSideQuestAvailability(worldMap, townMapsCache);
  let seed = ((parseInt(settings.worldSeed, 10) || 1) + poolSize * 104729) % 233280 || 1;
  const rng = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const added = backfillSideQuests(settings.sideQuests, {
    availability,
    level: effectivePartyLevel(party),
    rng,
    pool,
  });
  const next = { ...settings, sideQuestPoolSize: poolSize };
  if (added.length > 0) next.sideQuests = [...(settings.sideQuests || []), ...added];
  return { settings: next, added };
};

/**
 * Effective party level for quest gating: the lead hero's level plus a bonus for party
 * size (a full party can take on quests above the lead's level — your call). Roughly
 * +1 per two extra members.
 */
export const effectivePartyLevel = (party) => {
  const heroes = (party || []).filter(Boolean);
  if (heroes.length === 0) return 1;
  const lead = Math.max(...heroes.map((h) => h.level || 1));
  return lead + Math.floor(heroes.length / 2);
};

/** Move a side quest from 'available' to 'active' (accept it). Returns a new array. */
export const acceptSideQuest = (sideQuests, questId) =>
  (sideQuests || []).map((q) => (q.id === questId && q.status === 'available' ? { ...q, status: 'active' } : q));

/**
 * Run a game event against every ACTIVE side quest, completing matching event-steps
 * (item / enemy / location, with count support). Turn-in steps are NOT event-driven (see
 * turnInQuest). A quest completes only when ALL its steps (including any turn-in) are done.
 * @returns {{ updatedSideQuests, completions }} completions = one per step completed now.
 */
export const checkSideQuestEvent = (sideQuests, event) => {
  const completions = [];
  const updatedSideQuests = (sideQuests || []).map((q) => {
    if (q.status !== 'active') return q;
    const milestones = q.milestones.map((m) => ({ ...m }));
    let changed = false;
    for (const step of milestones) {
      if (step.completed || step.trigger?.turnIn) continue;     // skip done + turn-in steps
      if (!requiresMet(step, milestones)) continue;
      const res = applyEventToStep(step, event);
      if (!res) continue;
      step.progress = res.progress;
      changed = true;
      if (res.completed) {
        step.completed = true;
        completions.push({ questId: q.id, title: q.title, milestone: step, rewards: stepRewards(step), questCompleted: false });
      }
      break; // one step advances per event
    }
    if (!changed) return q;
    return finishIfDone({ ...q, milestones }, completions);
  });
  return { updatedSideQuests, completions };
};

/**
 * Hand in a quest at a building/town (the return-to-giver / courier turn-in). Completes any
 * READY turn-in step (prereqs met) whose target matches the context.
 * @param {Array} sideQuests
 * @param {{ buildingType?: string, townName?: string }} ctx - where the player is handing in.
 * @returns {{ updatedSideQuests, completions }}
 */
export const turnInQuest = (sideQuests, ctx = {}) => {
  const completions = [];
  const updatedSideQuests = (sideQuests || []).map((q) => {
    if (q.status !== 'active') return q;
    const milestones = q.milestones.map((m) => ({ ...m }));
    let changed = false;
    for (const step of milestones) {
      if (step.completed || !step.trigger?.turnIn) continue;
      if (!requiresMet(step, milestones)) continue;
      if (!turnInMatches(step.trigger.turnIn, ctx)) continue;
      step.completed = true;
      changed = true;
      completions.push({ questId: q.id, title: q.title, milestone: step, rewards: stepRewards(step), questCompleted: false });
      break;
    }
    if (!changed) return q;
    return finishIfDone({ ...q, milestones }, completions);
  });
  return { updatedSideQuests, completions };
};

// Mark a quest completed if every step is done, attaching the quest reward to the last
// completion entry for that quest.
const finishIfDone = (quest, completions) => {
  if (!quest.milestones.every((m) => m.completed)) return quest;
  const last = completions.filter((c) => c.questId === quest.id).pop();
  if (last) { last.questCompleted = true; last.questRewards = quest.rewards || null; }
  return { ...quest, status: 'completed' };
};

/** Available quests OFFERED at this building/town (their giver matches the context). */
export const getAvailableQuestsAt = (sideQuests, ctx = {}) =>
  getAvailableSideQuests(sideQuests).filter((q) => {
    const g = q.giver || {};
    if (!g.building) return false;
    const buildings = Array.isArray(g.building) ? g.building : [g.building];
    if (!buildings.includes(ctx.buildingType)) return false;
    if (g.location && ctx.townName !== g.location) return false;
    if (ctx.level != null && (q.minLevel || 1) > ctx.level) return false; // tiered reveal
    return true;
  });

/** Quests with a turn-in step ready to hand in at this context (for building UI). */
export const getReadyTurnIns = (sideQuests, ctx = {}) =>
  getActiveSideQuests(sideQuests).filter((q) =>
    q.milestones.some((s) => s.trigger?.turnIn && !s.completed && requiresMet(s, q.milestones) && turnInMatches(s.trigger.turnIn, ctx)));

export const getActiveSideQuests = (sideQuests) => (sideQuests || []).filter((q) => q.status === 'active');
export const getAvailableSideQuests = (sideQuests) => (sideQuests || []).filter((q) => q.status === 'available');
export const getCompletedSideQuests = (sideQuests) => (sideQuests || []).filter((q) => q.status === 'completed');

/** Step progress for a quest, e.g. for the quest log. */
export const getSideQuestProgress = (quest) => {
  const total = quest?.milestones?.length || 0;
  const done = (quest?.milestones || []).filter((m) => m.completed).length;
  return { done, total };
};

/**
 * Site types revealed on the world map: a cave/ruins becomes visible (and stays — sticky)
 * once a quest targeting it has been picked up (active) or finished (completed). Quests
 * still merely 'available' don't reveal anything — sites stay secret until you take the quest.
 * @returns {{ cave?: boolean, ruins?: boolean }}
 */
export const getRevealedSiteTypes = (sideQuests) => {
  const revealed = {};
  (sideQuests || []).forEach((q) => {
    if (q.status === 'available') return;
    q.milestones.forEach((m) => {
      if (m.site) revealed[m.site.type] = true;
      // Gather steps reveal their source sites too, so e.g. taking "collect 3 cave
      // mushrooms" uncovers the cave the mushrooms grow in.
      (m.sites || []).forEach((t) => { revealed[t] = true; });
    });
  });
  return revealed;
};

/**
 * Collect the site objectives quest chains want, keyed by site type ('cave'|'ruins'),
 * for ACTIVE quests only — so a site reveals/injects only once its quest is picked up.
 * Mirrors requiredBuildings for towns. Returns an ARRAY per type: several active quests
 * can target the same site type and each objective gets its own content slot (playtest
 * 2026-07-04: first-quest-wins left the second quest's item uncollectable).
 * @returns {{ cave?: Array, ruins?: Array }}
 */
export const getActiveSiteObjectives = (sideQuests) => {
  const byType = {};
  getActiveSideQuests(sideQuests).forEach((q) => {
    q.milestones.forEach((m) => {
      if (m.site && !m.completed) {
        (byType[m.site.type] = byType[m.site.type] || []).push({ ...m.site, milestoneId: m.id, questId: q.id });
      }
    });
  });
  return byType;
};
