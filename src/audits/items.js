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

/**
 * ITEM-05 (warn): tracked list of every catalog item whose icon is a BORROWED
 * placeholder (`placeholderIcon: true`, set on the campaign quest items that reuse a
 * lookalike sibling's .webp until dedicated art is generated, see
 * docs/IMAGE_GENERATION_PROMPTS.md). Because the borrowed file exists on disk,
 * artIntegrity and ITEM-01/04 all stay green, so this art debt would otherwise be
 * invisible. This makes it a visible, greppable, tracked list. Purely informational:
 * WARN so it never blocks the build while art is pending. It carries no allowlist:
 * the `placeholderIcon` flag IS the opt-in, and every tagged item is expected to
 * appear here until its dedicated art lands.
 */
const item05 = {
  id: 'ITEM-05',
  domain: DOMAIN,
  title: 'Placeholder/borrowed icons are tracked (placeholderIcon: true)',
  severity: SEVERITY.WARN,
  run(ctx) {
    const violations = [];
    for (const [key, def] of Object.entries(ctx.itemCatalog || {})) {
      if (!def || def.placeholderIcon !== true) continue;
      violations.push({
        message: `item '${key}' uses placeholder/borrowed art (icon '${def.icon}') until dedicated art is generated`,
        location: `ITEM_CATALOG['${key}']`
      });
    }
    return violations;
  }
};

// The bare-filename catalog id an icon path is named after: the item that "owns"
// the file. 'assets/icons/items/map_fragment.webp' -> 'map_fragment'. A quest item
// whose id equals this is the namesake owner of its icon, not a borrower.
const iconNamesake = (icon) =>
  typeof icon === 'string' ? icon.split('/').pop().replace(/\.[^.]+$/, '') : '';

/**
 * ITEM-06 (error): catches the FUTURE silent case that placeholderIcon exists to
 * prevent: a `quest_item` that BORROWS another item's icon (its icon file is also
 * used by a different item id, and the item is not that icon's namesake owner) but
 * is NOT tagged `placeholderIcon: true`. That is exactly how the 12 known placeholders
 * shipped invisibly: the borrowed file exists, so nothing else complains.
 *
 * Scope guards against false positives:
 *   - quest items only, so legitimately shared non-quest icons (armor variants
 *     sharing dragon_scale.webp, the spell-scroll trio) never trip it;
 *   - the namesake owner is exempt (icon basename === id), so treasure_map (whose
 *     own icon hidden_map borrows) is not flagged for owning its file;
 *   - tagged placeholders are exempt (they are surfaced by ITEM-05 instead).
 *
 * ERROR, not warn: an untagged borrow is a genuine NEW regression (silent art debt),
 * and the author can clear it two ways: generate the dedicated .webp, or explicitly
 * tag `placeholderIcon: true` (which downgrades it to the tracked ITEM-05 list). The
 * flag is the ratchet, so this mirrors MAP-01/BLD-03: known debt is acknowledged,
 * a new silent borrow fails the gate. All 12 current borrows are tagged, so today
 * this passes with zero violations.
 */
const item06 = {
  id: 'ITEM-06',
  domain: DOMAIN,
  title: 'No quest_item borrows another item\'s icon without placeholderIcon: true',
  severity: SEVERITY.ERROR,
  run(ctx) {
    const catalog = ctx.itemCatalog || {};
    // icon path -> set of item ids that use it
    const idsByIcon = new Map();
    for (const [id, def] of Object.entries(catalog)) {
      if (!def || !def.icon) continue;
      if (!idsByIcon.has(def.icon)) idsByIcon.set(def.icon, new Set());
      idsByIcon.get(def.icon).add(id);
    }
    const violations = [];
    for (const [id, def] of Object.entries(catalog)) {
      if (!def || def.type !== 'quest_item' || !def.icon) continue;
      if (def.placeholderIcon === true) continue; // tagged borrow, tracked by ITEM-05
      const sharers = idsByIcon.get(def.icon);
      if (!sharers || sharers.size <= 1) continue; // icon is unique to this item
      if (iconNamesake(def.icon) === id) continue;  // this item owns the icon (namesake)
      const others = [...sharers].filter((s) => s !== id).join(', ');
      violations.push({
        message: `quest_item '${id}' borrows icon '${def.icon}' (also used by ${others}) without placeholderIcon: true; tag it (or give it dedicated art)`,
        location: `ITEM_CATALOG['${id}']`
      });
    }
    return violations;
  }
};

export const checks = [item01, item02, item03, item04, item05, item06];

export default checks;
