// ITEMS domain — the fully-worked reference for how to author a domain module.
//
// Copy this file's shape for new domains: a default-exported array of Check
// objects (see ./types.js for the contract). Each check is pure — it reads only
// the audit context and returns Violation[] (empty === pass). Give every check a
// stable id (ITEM-01, ITEM-02, ...) and register it in docs/CONTENT_AUDIT.md.

import { SEVERITY } from './types';

const DOMAIN = 'items';

// Fields the item renderer relies on. `value` may legitimately be 0 (quest items),
// so presence is checked with null/undefined, never falsiness. `type` is included
// per the audit spec: it is intentionally absent on most consumable/loot entries,
// so this check is expected to surface warnings — that is the point (it exercises
// and demonstrates the non-blocking "what needs attention" path).
const REQUIRED_DISPLAY_FIELDS = ['name', 'icon', 'rarity', 'value', 'type'];

/**
 * ITEM-01 (error): every authored item reference resolves to ITEM_CATALOG.
 * Covers milestone spawn(item) ids, trigger.item ids, milestone/encounter reward
 * item ids, and every encounter loot-table drop. A missing id renders a blank
 * item and can silently break a reward, so this is an error.
 */
const item01 = {
  id: 'ITEM-01',
  domain: DOMAIN,
  title: 'Every referenced item id exists in ITEM_CATALOG',
  severity: SEVERITY.ERROR,
  run(ctx) {
    const violations = [];
    const seen = new Set(); // (id@location) de-dupe of identical references
    const allRefs = [...ctx.templateItemRefs, ...ctx.encounterLootRefs];
    for (const ref of allRefs) {
      if (!ref.id) continue;
      if (ctx.itemCatalog[ref.id]) continue;
      const key = `${ref.id}@${ref.location}`;
      if (seen.has(key)) continue;
      seen.add(key);
      violations.push({
        message: `item id '${ref.id}' is referenced but missing from ITEM_CATALOG`,
        location: ref.location
      });
    }
    return violations;
  }
};

/**
 * ITEM-02 (error): every quest-item id (milestone trigger.item) is unique across
 * all templates. Two milestones sharing a quest-item id means acquiring the item
 * for one campaign could complete the other's objective.
 */
const item02 = {
  id: 'ITEM-02',
  domain: DOMAIN,
  title: 'Quest-item ids (trigger.item) are unique across all templates',
  severity: SEVERITY.ERROR,
  run(ctx) {
    const byId = new Map(); // id -> [{ template, milestoneId, location }]
    for (const q of ctx.questItems) {
      if (!byId.has(q.id)) byId.set(q.id, []);
      byId.get(q.id).push(q);
    }
    const violations = [];
    for (const [id, uses] of byId) {
      if (uses.length <= 1) continue;
      const where = uses
        .map((u) => `${u.template} (milestone ${u.milestoneId})`)
        .join(', ');
      violations.push({
        message: `quest-item id '${id}' is used by ${uses.length} milestones: ${where}`,
        location: uses.map((u) => u.location).join(' | ')
      });
    }
    return violations;
  }
};

/**
 * ITEM-03 (error): no quest-item id appears in any encounter loot table.
 * This is the class of bug that was just fixed: a quest item that is also a random
 * loot drop can complete a milestone from an unrelated combat reward. Fail if any
 * trigger.item id is found among encounter drops.
 */
const item03 = {
  id: 'ITEM-03',
  domain: DOMAIN,
  title: 'No quest-item id is also an encounter loot drop',
  severity: SEVERITY.ERROR,
  run(ctx) {
    const questIds = new Set(ctx.questItems.map((q) => q.id));
    const violations = [];
    const reported = new Set();
    for (const loot of ctx.encounterLootRefs) {
      if (!questIds.has(loot.id)) continue;
      const key = `${loot.id}@${loot.encounterId}`;
      if (reported.has(key)) continue;
      reported.add(key);
      violations.push({
        message: `quest-item id '${loot.id}' is a loot drop ('${loot.raw}') and could complete a milestone from combat`,
        location: loot.location
      });
    }
    return violations;
  }
};

/**
 * ITEM-04 (warn): every ITEM_CATALOG entry carries the required display fields so
 * nothing renders blank. Non-blocking: a missing field degrades a tooltip, it does
 * not corrupt a save.
 */
const item04 = {
  id: 'ITEM-04',
  domain: DOMAIN,
  title: 'Every ITEM_CATALOG entry has the required display fields',
  severity: SEVERITY.WARN,
  run(ctx) {
    const violations = [];
    for (const [key, def] of Object.entries(ctx.itemCatalog || {})) {
      const missing = REQUIRED_DISPLAY_FIELDS.filter((f) => def == null || def[f] == null);
      if (missing.length === 0) continue;
      violations.push({
        message: `item '${key}' is missing display field(s): ${missing.join(', ')}`,
        location: `ITEM_CATALOG['${key}']`
      });
    }
    return violations;
  }
};

export const checks = [item01, item02, item03, item04];

export default checks;
