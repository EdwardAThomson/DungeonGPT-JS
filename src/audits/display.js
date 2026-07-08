// DISPLAY domain (DISP) — the cross-cutting "nothing renders blank" view. It
// inspects the same authored data the other domains cover, but from the player's
// eye: does any authored string that reaches a UI surface come out blank,
// undefined, null, or as a raw under_scored_id? Same contract as items.js.
//
// Deliberately NON-DUPLICATIVE with the other domains:
//   - NPC display names / raw-id leaks are covered by NPC-03 (warn).
//   - Item display names / missing fields are covered by ITEM-01 (error) and
//     ITEM-04 (warn).
//   - Milestone POI arrival names are covered by MAP-04 (warn).
// DISP-01 focuses on the surfaces NOT otherwise error-gated (encounter names, and
// the raw-id angle on POI display names); DISP-02 is the display-side restatement
// of the rewards/consequences "always render something" invariant (ENC-04/ENC-05).

import { SEVERITY } from './types';

const DOMAIN = 'display';

// A string that is really a raw id (all lower snake_case, no spaces) leaked into
// a player-facing label.
const looksLikeRawId = (s) => typeof s === 'string' && /^[a-z0-9]+(_[a-z0-9]+)+$/.test(s.trim());
const isBlank = (s) => s == null || (typeof s === 'string' && s.trim().length === 0);

/**
 * DISP-01 (error): no player-facing authored label renders blank, null, undefined,
 * or as a raw underscored id. Concrete surfaces checked here (the ones not already
 * error-gated by another domain):
 *   - encounter `name` (rendered verbatim in EncounterActionModal headers);
 *   - milestone POI display `name` when present (the poiName shown at arrival) —
 *     absence is MAP-04's (warn) concern, but a raw-id leak is a hard display bug.
 */
const disp01 = {
  id: 'DISP-01',
  domain: DOMAIN,
  title: 'No player-facing label is blank, null, undefined, or a raw underscored id',
  severity: SEVERITY.ERROR,
  run(ctx) {
    const violations = [];

    // Encounter names — shown directly to the player, no prettifier in the path.
    for (const [encId, enc] of Object.entries(ctx.encounterTemplates || {})) {
      if (!enc) continue;
      if (isBlank(enc.name)) {
        violations.push({
          message: `encounter '${encId}' has a blank/missing name — the encounter modal header renders empty`,
          location: `encounterTemplates['${encId}'].name`
        });
      } else if (looksLikeRawId(enc.name)) {
        violations.push({
          message: `encounter '${encId}' name '${enc.name}' looks like a raw id — it renders underscored to the player`,
          location: `encounterTemplates['${encId}'].name`
        });
      }
    }

    // Milestone POI display names — a raw-id leak here shows underscored at arrival.
    for (const p of ctx.milestonePois) {
      if (p.name && looksLikeRawId(p.name)) {
        violations.push({
          message: `milestone POI '${p.id || '(no id)'}' display name '${p.name}' looks like a raw id — it renders underscored at arrival`,
          location: p.loc
        });
      }
    }

    return violations;
  }
};

/**
 * DISP-02 (warn): the rewards / consequences areas always render SOMETHING. This
 * is the display-side companion to ENC-04 (absent rewards renders blank) and
 * ENC-05 (blank consequence tiers). It additionally flags the subtler case an
 * error check misses: an encounter whose `rewards` object IS present but is
 * entirely empty (no xp, no truthy gold, no items, no healing) — the reward
 * section header can then render with no line items beneath it. Advisory; the hard
 * failures are already caught by ENC-04/ENC-05.
 */
const disp02 = {
  id: 'DISP-02',
  domain: DOMAIN,
  title: 'Rewards/consequences areas always render something (empty-rewards guard; see ENC-04/05)',
  severity: SEVERITY.WARN,
  run(ctx) {
    const violations = [];
    for (const [encId, enc] of Object.entries(ctx.encounterTemplates || {})) {
      if (!enc || enc.rewards == null) continue; // absent rewards is ENC-04's (error) concern
      const r = enc.rewards;
      const hasXp = typeof r.xp === 'number' && r.xp > 0;
      const hasGold = r.gold != null && String(r.gold).trim() !== '' && String(r.gold).trim() !== '0';
      const hasItems = Array.isArray(r.items) && r.items.length > 0;
      const hasHealing = r.healing != null || enc.healingByTier != null;
      if (hasXp || hasGold || hasItems || hasHealing) continue;
      violations.push({
        message: `encounter '${encId}' has a rewards block with nothing to grant (no xp/gold/items/healing) — the reward area can render an empty section`,
        location: `encounterTemplates['${encId}'].rewards`
      });
    }
    return violations;
  }
};

export const checks = [disp01, disp02];

export default checks;
