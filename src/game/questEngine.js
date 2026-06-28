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
  const eligible = pool.filter((q) => isQuestEligible(q, availability));
  // seeded shuffle (Fisher-Yates) then take `count`
  const shuffled = eligible.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count).map((q) => ({
    ...q,
    milestones: q.milestones.map((m) => ({ ...m, completed: false, progress: 0 })),
    status: 'available',
  }));
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
 * Collect the site objectives a quest chain wants, keyed by site type ('cave'|'ruins'),
 * for ACTIVE quests only — so a site reveals/injects only once its quest is picked up.
 * Mirrors requiredBuildings for towns.
 */
export const getActiveSiteObjectives = (sideQuests) => {
  const byType = {};
  getActiveSideQuests(sideQuests).forEach((q) => {
    q.milestones.forEach((m) => {
      if (m.site && !m.completed && !byType[m.site.type]) {
        byType[m.site.type] = { ...m.site, milestoneId: m.id, questId: q.id };
      }
    });
  });
  return byType;
};
