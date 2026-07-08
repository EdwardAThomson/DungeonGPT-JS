// ENCOUNTERS domain (ENC) — cross-checks the encounter templates
// (src/data/encounters/*) and the weighted encounter tables
// (src/data/encounterTables.js) against the item catalog and the fields the
// encounter UI (EncounterActionModal) and the roll logic (encounterResolver /
// encounterGenerator) actually read. Same contract as items.js. Data from
// ./context.js: encounterTemplates, itemCatalog, encounterTableRefs, stripDropChance.

import { SEVERITY } from './types';

const DOMAIN = 'encounters';

// The consequence tiers the roll resolves to (encounterResolver applyConsequences
// keys outcome text by these). A consequences block must fill every tier or the
// UI renders a blank outcome line.
const CONSEQUENCE_TIERS = ['criticalSuccess', 'success', 'failure', 'criticalFailure'];

// Difficulty labels the DC table (encounters/difficultyDc.js DIFFICULTY_DC) knows.
const VALID_DIFFICULTIES = new Set(['trivial', 'easy', 'medium', 'hard', 'deadly']);

// The climate vocabulary the environmental selector honors (encounterGenerator
// rollEnvironmentalEncounter): 'hot' / 'cold', or 'any' (== untagged) for
// everywhere. Anything else silently never matches a climate and is dead content.
const VALID_CLIMATES = new Set(['hot', 'cold', 'any']);

// -----------------------------------------------------------------------------
// KNOWN ACCEPTED DEBT (ENC-03, advisory).
//
// Environmental encounters that are intentionally climate-NEUTRAL: they fire in
// every climate by design (a storm / fog / earthquake / strange lights is not
// hot- or cold-specific), so they are deliberately untagged. ENC-03 allowlists
// them so the climate-coverage advisory only surfaces a NEW environmental
// encounter that forgot to consider climate. Documented in docs/CONTENT_AUDIT.md.
export const CLIMATE_NEUTRAL_ALLOWLIST = Object.freeze([
  'sudden_storm', 'thick_fog', 'earthquake', 'strange_lights'
]);

// Encounters known to legitimately ship without a static `image` (they render
// their emoji `icon` instead). Empty today: every encounter carries both an image
// and an icon. Kept as the ratchet surface so a new image gap is a conscious add.
export const IMAGE_DEBT_ALLOWLIST = Object.freeze([]);

const isNonBlank = (s) => typeof s === 'string' && s.trim().length > 0;

/**
 * ENC-01 (error): every reward item id an encounter template can drop exists in
 * ITEM_CATALOG. A missing id renders a blank reward line and silently voids a
 * drop. (This is the encounters-domain restatement of the encounter half of
 * ITEM-01; kept here so the encounters report is self-contained.)
 */
const enc01 = {
  id: 'ENC-01',
  domain: DOMAIN,
  title: 'Every encounter reward item id exists in ITEM_CATALOG',
  severity: SEVERITY.ERROR,
  run(ctx) {
    const violations = [];
    const seen = new Set();
    for (const [encId, enc] of Object.entries(ctx.encounterTemplates || {})) {
      const items = enc && enc.rewards && Array.isArray(enc.rewards.items) ? enc.rewards.items : [];
      for (const raw of items) {
        const id = ctx.stripDropChance(raw);
        if (!id || ctx.itemCatalog[id]) continue;
        const key = `${id}@${encId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        violations.push({
          message: `encounter '${encId}' reward item '${id}' (from '${raw}') is missing from ITEM_CATALOG`,
          location: `encounter '${encId}' rewards.items`
        });
      }
    }
    return violations;
  }
};

/**
 * ENC-02 (error): every `template` key in every weighted encounter table resolves
 * to a defined encounter template. A dangling key means weightedRandom can pick a
 * template that encounterTemplates has no entry for, producing a null/blank
 * encounter at that tile. 'none' is the special no-encounter marker and is exempt.
 */
const enc02 = {
  id: 'ENC-02',
  domain: DOMAIN,
  title: 'Every encounter-table entry references a defined encounter template',
  severity: SEVERITY.ERROR,
  run(ctx) {
    const violations = [];
    const seen = new Set();
    for (const ref of ctx.encounterTableRefs) {
      if (ref.template === 'none') continue;
      if (ctx.encounterTemplates[ref.template]) continue;
      const key = `${ref.template}@${ref.tableName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      violations.push({
        message: `encounter table '${ref.tableName}' references template '${ref.template}', which is not defined in encounterTemplates`,
        location: ref.location
      });
    }
    return violations;
  }
};

/**
 * ENC-03 (warn): every encounter carries the fields the UI needs — a `name`, a
 * visual (an `image` OR an emoji `icon`, since EncounterActionModal falls back to
 * the icon when there is no image), and a known `difficulty`. Environmental
 * encounters additionally should carry a `climate` tag now that the selector
 * filters by climate; the intentionally climate-neutral ones are allowlisted so
 * only a NEW environmental encounter that forgot climate is surfaced.
 */
const enc03 = {
  id: 'ENC-03',
  domain: DOMAIN,
  title: 'Every encounter has name, an image/icon, a valid difficulty (and env. encounters a climate)',
  severity: SEVERITY.WARN,
  run(ctx) {
    const violations = [];
    const climateAllow = new Set(CLIMATE_NEUTRAL_ALLOWLIST);
    const imageAllow = new Set(IMAGE_DEBT_ALLOWLIST);
    for (const [encId, enc] of Object.entries(ctx.encounterTemplates || {})) {
      if (!enc) continue;
      const gaps = [];
      if (!isNonBlank(enc.name)) gaps.push('name');
      const hasVisual = isNonBlank(enc.image) || isNonBlank(enc.icon);
      if (!hasVisual && !imageAllow.has(encId)) gaps.push('image/icon');
      if (!isNonBlank(enc.difficulty)) gaps.push('difficulty');
      else if (!VALID_DIFFICULTIES.has(enc.difficulty)) gaps.push(`difficulty '${enc.difficulty}' is not a known DC label`);
      if (enc.environmental && !isNonBlank(enc.climate) && !climateAllow.has(encId)) {
        gaps.push('climate (environmental encounter with no climate tag)');
      }
      if (gaps.length === 0) continue;
      violations.push({
        message: `encounter '${encId}' is missing/invalid: ${gaps.join(', ')}`,
        location: `encounterTemplates['${encId}']`
      });
    }
    return violations;
  }
};

/**
 * ENC-04 (error): rewards are always STATED. EncounterActionModal renders the
 * reward section only when `result.rewards` is truthy, and generateLoot returns
 * null when the encounter has no `rewards` field — so a fully-absent rewards block
 * renders NOTHING (a silently-empty reward). An explicit rewards object (even an
 * empty `{}` or all-zero one) is a stated "none" and is fine; a missing rewards
 * property is the violation.
 */
const enc04 = {
  id: 'ENC-04',
  domain: DOMAIN,
  title: 'Every encounter states a rewards block (absent rewards renders blank)',
  severity: SEVERITY.ERROR,
  run(ctx) {
    const violations = [];
    for (const [encId, enc] of Object.entries(ctx.encounterTemplates || {})) {
      if (!enc) continue;
      if (Object.prototype.hasOwnProperty.call(enc, 'rewards') && enc.rewards != null) continue;
      violations.push({
        message: `encounter '${encId}' has no rewards block — the reward area renders blank; state an explicit rewards object (even {}) instead`,
        location: `encounterTemplates['${encId}'].rewards`
      });
    }
    return violations;
  }
};

/**
 * ENC-05 (error): a consequences block is never partially blank. When an encounter
 * defines `consequences`, every roll tier (criticalSuccess / success / failure /
 * criticalFailure) must carry non-blank outcome text, or that roll renders an empty
 * outcome line to the player.
 */
const enc05 = {
  id: 'ENC-05',
  domain: DOMAIN,
  title: 'Every consequences block fills every roll tier (no blank outcomes)',
  severity: SEVERITY.ERROR,
  run(ctx) {
    const violations = [];
    for (const [encId, enc] of Object.entries(ctx.encounterTemplates || {})) {
      if (!enc || enc.consequences == null) continue; // absence is a design choice; blanks are the bug
      const blanks = CONSEQUENCE_TIERS.filter((tier) => !isNonBlank(enc.consequences[tier]));
      if (blanks.length === 0) continue;
      violations.push({
        message: `encounter '${encId}' consequences has blank/missing tier(s): ${blanks.join(', ')}`,
        location: `encounterTemplates['${encId}'].consequences`
      });
    }
    return violations;
  }
};

/**
 * ENC-06 (warn): remaining completeness invariants — any `climate` tag is from the
 * valid hot/cold/any vocabulary (a typo'd climate silently never matches), and
 * every encounter offers a non-empty `suggestedActions` list (the modal's action
 * buttons; an empty list leaves the player nothing to click).
 */
const enc06 = {
  id: 'ENC-06',
  domain: DOMAIN,
  title: 'Climate tag is from the valid vocabulary and suggestedActions is non-empty',
  severity: SEVERITY.WARN,
  run(ctx) {
    const violations = [];
    for (const [encId, enc] of Object.entries(ctx.encounterTemplates || {})) {
      if (!enc) continue;
      const gaps = [];
      if (enc.climate != null && !VALID_CLIMATES.has(enc.climate)) {
        gaps.push(`climate '${enc.climate}' is not hot/cold/any — it never matches the selector`);
      }
      if (!Array.isArray(enc.suggestedActions) || enc.suggestedActions.length === 0) {
        gaps.push('no suggestedActions (the modal shows no action buttons)');
      }
      if (gaps.length === 0) continue;
      violations.push({
        message: `encounter '${encId}': ${gaps.join(', ')}`,
        location: `encounterTemplates['${encId}']`
      });
    }
    return violations;
  }
};

export const checks = [enc01, enc02, enc03, enc04, enc05, enc06];

export default checks;
