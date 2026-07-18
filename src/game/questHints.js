// Quest hint helpers (pure, no React). The side-quest engine already tracks everything —
// kill counts, site reveals, turn-in readiness — but the journal never SAID any of it
// (docs/SIDEQUEST_UX_PLAN.md, issues #41/#42). These helpers derive the "how do I do
// this?" text from game data at render time, so hints can never go stale and no per-quest
// authoring is needed.

import { SHOP_STOCK } from '../data/shopStock';
import { LOOT, HOARD_BONUS } from './sitePopulator';
import { encounterTemplates } from '../data/encounters';

// Human labels for site types and shop buildings used in hints.
const SITE_LABEL = { cave: 'a cave', ruins: 'ruins', forest: 'a forest', hills: 'the hills', mountain: 'the mountains' };
const SHOP_LABEL = { shop: 'the general store', market: 'the market', blacksmith: 'the blacksmith', alchemist: 'the alchemist', apothecary: 'the apothecary' };
const BUILDING_LABEL = {
  inn: 'an inn', tavern: 'a tavern', townhall: 'the town hall', temple: 'the temple',
  shop: 'the general store', market: 'the market', blacksmith: 'the blacksmith',
  alchemist: 'the alchemist', apothecary: 'the apothecary', archives: 'the archives',
  library: 'the library', guild: 'the guild', bank: 'the bank', barracks: 'the barracks',
  // Water-town venues (#65 Phase 6): the harbour office and the canal-city boathouse.
  harbormaster: 'the harbormaster', boathouse: 'the boathouse'
};

const labelForBuilding = (b) => BUILDING_LABEL[b] || `the ${String(b).replace(/_/g, ' ')}`;

// Do a turn-in target and the giver building overlap (either may be a type or type list)?
const sameBuilding = (a, b) => {
  const as = Array.isArray(a) ? a : [a];
  const bs = Array.isArray(b) ? b : [b];
  return as.some((x) => bs.includes(x));
};

/**
 * Where can this item be obtained? Derived live from encounter reward tables, site loot
 * pools, and shop stock, e.g. "found in the wilds; in forest or hills sites; sold at the
 * apothecary". Returns '' when no source is known (authoring gap — better silent than wrong).
 * @param {string} itemId
 * @returns {string}
 */
export const describeItemSources = (itemId) => {
  if (!itemId) return '';
  const parts = [];

  // Random encounter drops ("itemId" or "itemId:NN%").
  const inEncounters = Object.values(encounterTemplates).some((e) =>
    (e.rewards?.items || []).some((s) => s === itemId || String(s).startsWith(`${itemId}:`))
  );
  if (inEncounters) parts.push('found in the wilds');

  // Site loot pools (walk-onto loot + hoards).
  const siteTypes = Object.keys(LOOT).filter((t) =>
    (LOOT[t] || []).includes(itemId) || (HOARD_BONUS[t] || []).includes(itemId)
  );
  if (siteTypes.length > 0) {
    const labels = siteTypes.map((t) => (SITE_LABEL[t] || t).replace(/^(a |the )/, ''));
    parts.push(`in ${labels.join(' or ')} sites`);
  }

  // Shops.
  const shopTypes = Object.keys(SHOP_STOCK).filter((t) => (SHOP_STOCK[t] || []).includes(itemId));
  if (shopTypes.length > 0) {
    parts.push(`sold at ${shopTypes.map((t) => SHOP_LABEL[t] || t).join(' or ')}`);
  }

  if (parts.length === 0) return '';
  const joined = parts.join('; ');
  return joined.charAt(0).toUpperCase() + joined.slice(1);
};

/**
 * Human label for a turn-in target ('inn' | ['inn','tavern'] | 'townhall' | ...).
 * @param {string|string[]} building
 * @returns {string} e.g. "an inn or a tavern", "the town hall"
 */
export const describeTurnInTarget = (building) => {
  if (!building) return '';
  const list = Array.isArray(building) ? building : [building];
  return list.map(labelForBuilding).join(' or ');
};

/**
 * Progress suffix for a counted step, e.g. " (1/3)". Empty when the step has no count.
 * @param {Object} step
 * @returns {string}
 */
export const formatStepProgress = (step) => {
  const need = step?.trigger?.count;
  if (!need || need <= 1) return '';
  const done = Math.min(step.progress || 0, need);
  return ` (${done}/${need})`;
};

/**
 * The "how do I do this?" hint for a side-quest step. Returns '' when the step needs no
 * hint (or we have nothing accurate to say).
 * @param {Object} step - a quest milestone/step
 * @param {Object} [quest] - the owning quest (for turn-in readiness)
 * @returns {string}
 */
export const getStepHint = (step, quest) => {
  if (!step || step.completed) return '';

  // Turn-in: where to go, and whether it's ready. When the quest is anchored to an origin
  // town (playtest 2026-07-18), name it — and prefer the giver's ACTUAL building name when
  // the turn-in is a return-to-giver at that same building.
  if (step.trigger?.turnIn) {
    const turnIn = step.trigger.turnIn;
    const returnsToGiver = quest?.giver?.building && sameBuilding(turnIn.building, quest.giver.building);
    let target = (returnsToGiver && quest?.giver?.buildingName)
      ? quest.giver.buildingName
      : describeTurnInTarget(turnIn.building);
    if (!target) return '';
    if (turnIn.location) target = `${target} in ${turnIn.location}`;
    const ready = quest ? isStepReady(step, quest.milestones) : false;
    return ready ? `✅ Ready — return to ${target}` : `Return to ${target}`;
  }

  // Site-bound objective: the site was revealed on the map when the quest was accepted.
  if (step.site) {
    const label = SITE_LABEL[step.site.type] || `a ${step.site.type}`;
    // Side quests only un-hide the site's sprite on the world map (a type-wide reveal);
    // they draw no pin, glow, or label. "revealed" describes what actually happens, so
    // neither the journal nor the AI (this string is fed straight into the prompt)
    // promises a marker the map never renders.
    return `In ${label}, now revealed on your world map`;
  }

  // Open bounty: any wilderness victory counts.
  if (step.trigger?.enemy === 'any') {
    return 'Any victory in the wilds counts';
  }

  // Gather: an authored `sites` source hint wins (those sites are also revealed on the
  // map when the quest is active); otherwise derive the sources from live data.
  if (step.trigger?.item) {
    if (Array.isArray(step.sites) && step.sites.length > 0) {
      const labels = step.sites.map((t) => SITE_LABEL[t] || `a ${t}`);
      const marked = step.sites.some((t) => t === 'cave' || t === 'ruins')
        ? ' (revealed on your world map)' : '';
      return `Harvest in ${labels.join(' or ')}${marked}`;
    }
    return describeItemSources(step.trigger.item);
  }

  return '';
};

/**
 * The objective step of a quest: the first non-turn-in milestone (its first "go do a
 * thing" step). Falls back to the first milestone (courier quests are a single turn-in).
 * Returns null when the quest has no milestones.
 * @param {Object} quest
 * @returns {Object|null}
 */
export const getQuestObjectiveStep = (quest) => {
  const milestones = quest?.milestones || [];
  return milestones.find((m) => !m.trigger?.turnIn) || milestones[0] || null;
};

/**
 * Total advertised reward for a quest: every step reward summed with the final quest
 * reward, so a rumour can preview the whole payout (objective XP + turn-in + quest
 * bonus). Item ids are returned verbatim; the caller resolves display names.
 * @param {Object} quest
 * @returns {{ xp: number, gold: number, items: string[] }}
 */
export const summarizeQuestReward = (quest) => {
  const total = { xp: 0, gold: 0, items: [] };
  const add = (r) => {
    if (!r) return;
    total.xp += r.xp || 0;
    total.gold += r.gold || 0;
    (r.items || []).forEach((id) => { if (id) total.items.push(id); });
  };
  (quest?.milestones || []).forEach((m) => add(m.rewards));
  add(quest?.rewards);
  return total;
};

// A step is actionable/ready when all its prerequisite steps are complete.
const isStepReady = (step, milestones) =>
  (step.requires || []).every((id) => (milestones || []).find((m) => m.id === id)?.completed);

/**
 * Is this quest waiting only on its turn-in (objective done, reward unclaimed)?
 * Drives the "ready" sort/badge in the journal.
 * @param {Object} quest
 * @returns {boolean}
 */
export const isQuestReadyToTurnIn = (quest) => {
  if (!quest || quest.status !== 'active') return false;
  return (quest.milestones || []).some((s) =>
    s.trigger?.turnIn && !s.completed && isStepReady(s, quest.milestones)
  );
};
