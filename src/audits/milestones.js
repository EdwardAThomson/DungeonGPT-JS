// MILESTONES domain (MS) — the campaign-progression integrity checks: valid
// types, trigger/spawn coherence, a sound `requires` DAG, and end-to-end
// completability. Same contract as items.js. Data from ./context.js: campaigns
// (per-template town set + raw milestone array).

import { SEVERITY } from './types';

const DOMAIN = 'milestones';

const VALID_TYPES = new Set(['item', 'combat', 'location', 'talk', 'narrative']);

// Per-type expectations: which trigger field carries the reference, and which
// spawn.type that reference must resolve to. `narrative` is AI-judged and carries
// no mechanical trigger, so it is intentionally absent here.
const TYPE_SPEC = {
  item: { triggerField: 'item', spawnType: 'item' },
  talk: { triggerField: 'npc', spawnType: 'npc' },
  location: { triggerField: 'location', spawnType: 'poi' },
  combat: { triggerField: 'enemy', spawnType: 'enemy' }
};

/** spawn.id set for a given spawn.type within one template's milestones. */
function spawnIdsByType(milestones, spawnType) {
  const ids = new Set();
  for (const m of milestones) {
    if (m && m.spawn && m.spawn.type === spawnType && m.spawn.id) ids.add(m.spawn.id);
  }
  return ids;
}

/**
 * Which milestone ids are reachable given the `requires` graph. A milestone is
 * reachable iff every id it requires exists and is itself reachable; empty
 * `requires` is a root. A milestone caught in a cycle resolves to unreachable
 * (the 'visiting' guard returns false). Pure, memoized.
 */
function reachableSet(milestones) {
  const byId = new Map(milestones.filter((m) => m && m.id != null).map((m) => [m.id, m]));
  const state = new Map(); // id -> true | false | 'visiting'
  const reach = (id) => {
    const s = state.get(id);
    if (s === true || s === false) return s;
    if (s === 'visiting') return false; // cycle: treat as unreachable
    const m = byId.get(id);
    if (!m) return false;
    state.set(id, 'visiting');
    const reqs = Array.isArray(m.requires) ? m.requires : [];
    let ok = true;
    for (const r of reqs) {
      if (!byId.has(r) || !reach(r)) { ok = false; break; }
    }
    state.set(id, ok);
    return ok;
  };
  const out = new Set();
  for (const m of byId.values()) if (reach(m.id)) out.add(m.id);
  return out;
}

/**
 * MS-01 (error): every milestone has a valid `type`
 * (item / combat / location / talk / narrative). An unknown type means the engine
 * has no completion path for the milestone.
 */
const ms01 = {
  id: 'MS-01',
  domain: DOMAIN,
  title: 'Every milestone has a valid type',
  severity: SEVERITY.ERROR,
  run(ctx) {
    const violations = [];
    for (const c of ctx.campaigns) {
      for (const m of c.milestones) {
        if (m && VALID_TYPES.has(m.type)) continue;
        violations.push({
          message: `milestone ${m ? m.id : '(null)'} has invalid type '${m ? m.type : ''}' (expected ${[...VALID_TYPES].join('/')})`,
          location: `${c.template} / milestone ${m ? m.id : '?'}`
        });
      }
    }
    return violations;
  }
};

/**
 * MS-02 (error): trigger/spawn coherence per type — item→`trigger.item` matches an
 * item spawn.id; talk→`trigger.npc` matches an npc spawn.id; location→`trigger.location`
 * matches a poi spawn.id; combat→`trigger.enemy` matches an enemy spawn.id. Narrative
 * milestones are skipped (AI-judged, no mechanical trigger).
 *
 * LIMITATION (combat bosses): there is no global boss/enemy registry to validate
 * against — a combat milestone's enemy is authored inline in `spawn` (+ its
 * `encounter` block). So combat coherence is verified structurally (trigger.enemy
 * resolves to an enemy spawn.id in the same template), not against a canonical
 * bestiary. A misspelled boss that is consistent between trigger and spawn would
 * pass here; catching that needs a boss catalog this audit does not yet have.
 */
const ms02 = {
  id: 'MS-02',
  domain: DOMAIN,
  title: 'Milestone trigger matches a spawn of the type-appropriate kind',
  severity: SEVERITY.ERROR,
  run(ctx) {
    const violations = [];
    for (const c of ctx.campaigns) {
      for (const m of c.milestones) {
        if (!m || m.type === 'narrative') continue;
        const spec = TYPE_SPEC[m.type];
        if (!spec) continue; // invalid type is MS-01's concern
        const ref = m.trigger && m.trigger[spec.triggerField];
        const loc = `${c.template} / milestone ${m.id} (${m.type})`;
        if (!ref) {
          violations.push({
            message: `${m.type} milestone ${m.id} is missing trigger.${spec.triggerField}`,
            location: loc
          });
          continue;
        }
        const ids = spawnIdsByType(c.milestones, spec.spawnType);
        if (!ids.has(ref)) {
          violations.push({
            message: `${m.type} milestone ${m.id} trigger.${spec.triggerField} '${ref}' matches no ${spec.spawnType} spawn.id in this template`,
            location: loc
          });
        }
      }
    }
    return violations;
  }
};

/**
 * MS-03 (error): the `requires` graph is sound — every id referenced exists in the
 * same template, and there are no cycles. A dangling id can never be satisfied; a
 * cycle deadlocks the milestones in it forever.
 */
const ms03 = {
  id: 'MS-03',
  domain: DOMAIN,
  title: 'requires references exist and form a DAG (no cycles)',
  severity: SEVERITY.ERROR,
  run(ctx) {
    const violations = [];
    for (const c of ctx.campaigns) {
      const ids = new Set(c.milestones.filter((m) => m && m.id != null).map((m) => m.id));
      // Dangling references
      for (const m of c.milestones) {
        if (!m) continue;
        const reqs = Array.isArray(m.requires) ? m.requires : [];
        for (const r of reqs) {
          if (!ids.has(r)) {
            violations.push({
              message: `milestone ${m.id} requires '${r}', which is not a milestone id in this template`,
              location: `${c.template} / milestone ${m.id}`
            });
          }
        }
      }
      // Cycle detection (DFS with a recursion stack)
      const byId = new Map(c.milestones.filter((m) => m && m.id != null).map((m) => [m.id, m]));
      const color = new Map(); // id -> 1 visiting, 2 done
      const dfs = (id, path) => {
        color.set(id, 1);
        const m = byId.get(id);
        const reqs = m && Array.isArray(m.requires) ? m.requires : [];
        for (const r of reqs) {
          if (!byId.has(r)) continue; // dangling already reported
          if (color.get(r) === 1) {
            violations.push({
              message: `requires cycle detected: ${[...path, id, r].join(' -> ')}`,
              location: `${c.template} / milestone ${id}`
            });
            continue;
          }
          if (!color.get(r)) dfs(r, [...path, id]);
        }
        color.set(id, 2);
      };
      for (const id of byId.keys()) if (!color.get(id)) dfs(id, []);
    }
    return violations;
  }
};

/**
 * MS-04 (error): the campaign is completable — every milestone is reachable through
 * the `requires` graph (no orphans stranded behind a broken/cyclic dependency), and
 * the final milestone in particular is reachable. Complements MS-03: MS-03 finds the
 * structural break, MS-04 states the play consequence.
 */
const ms04 = {
  id: 'MS-04',
  domain: DOMAIN,
  title: 'Campaign is completable: final milestone reachable, no orphans',
  severity: SEVERITY.ERROR,
  run(ctx) {
    const violations = [];
    for (const c of ctx.campaigns) {
      const withIds = c.milestones.filter((m) => m && m.id != null);
      if (withIds.length === 0) continue;
      const reachable = reachableSet(c.milestones);
      for (const m of withIds) {
        if (reachable.has(m.id)) continue;
        violations.push({
          message: `milestone ${m.id} is unreachable (its requires chain is broken or cyclic) — the campaign cannot complete it`,
          location: `${c.template} / milestone ${m.id}`
        });
      }
      const final = withIds[withIds.length - 1];
      if (!reachable.has(final.id)) {
        violations.push({
          message: `final milestone ${final.id} is unreachable — the campaign has no completion path`,
          location: `${c.template} / milestone ${final.id} (final)`
        });
      }
    }
    return violations;
  }
};

/**
 * MS-05 (error): no null/undefined in a milestone's required fields. `id`, `text`
 * and `type` are always required; the type-appropriate trigger field and the
 * `spawn` are required for every mechanical type (narrative may carry a null
 * trigger and no spawn, so it is exempt from those two).
 */
const ms05 = {
  id: 'MS-05',
  domain: DOMAIN,
  title: 'No null/undefined in required milestone fields',
  severity: SEVERITY.ERROR,
  run(ctx) {
    const violations = [];
    for (const c of ctx.campaigns) {
      for (const m of c.milestones) {
        if (!m) {
          violations.push({ message: 'null/undefined milestone entry', location: c.template });
          continue;
        }
        const loc = `${c.template} / milestone ${m.id != null ? m.id : '(no id)'}`;
        const missing = [];
        if (m.id == null) missing.push('id');
        if (m.text == null || String(m.text).trim() === '') missing.push('text');
        if (m.type == null) missing.push('type');
        const spec = TYPE_SPEC[m.type];
        if (spec) {
          if (!m.trigger || m.trigger[spec.triggerField] == null) missing.push(`trigger.${spec.triggerField}`);
          if (!m.spawn) missing.push('spawn');
        }
        if (missing.length === 0) continue;
        violations.push({
          message: `milestone ${m.id != null ? m.id : '(no id)'} is missing required field(s): ${missing.join(', ')}`,
          location: loc
        });
      }
    }
    return violations;
  }
};

/**
 * MS-06 (warn): a non-first milestone with empty `requires` is co-active from turn
 * one (available immediately alongside milestone #1). This is often INTENTIONAL
 * parallel design (two objectives open at once), so it is advisory, not an error —
 * verify each flagged milestone is meant to be a parallel starting objective.
 */
const ms06 = {
  id: 'MS-06',
  domain: DOMAIN,
  title: 'Non-first milestone with empty requires (co-active from turn 1)',
  severity: SEVERITY.WARN,
  run(ctx) {
    const violations = [];
    for (const c of ctx.campaigns) {
      c.milestones.forEach((m, index) => {
        if (!m || index === 0) return;
        const reqs = Array.isArray(m.requires) ? m.requires : [];
        if (reqs.length > 0) return;
        violations.push({
          message: `milestone ${m.id} has empty requires and is co-active from turn 1 — verify this is intentional parallel design`,
          location: `${c.template} / milestone ${m.id}`
        });
      });
    }
    return violations;
  }
};

/**
 * The XP a milestone hands out on completion: its own `rewards.xp` plus, for a
 * combat milestone, the boss `encounter.rewards.xp`. Both land in the party's
 * ledger when the milestone completes.
 */
function completionXp(m) {
  const own = m && m.rewards && typeof m.rewards.xp === 'number' ? m.rewards.xp : 0;
  const boss = m && m.encounter && m.encounter.rewards && typeof m.encounter.rewards.xp === 'number'
    ? m.encounter.rewards.xp : 0;
  return own + boss;
}

/**
 * The XP already banked at the instant a milestone's own level check fires. For a
 * combat milestone the boss `encounter.rewards.xp` is granted on defeat, BEFORE the
 * enemy_defeated event runs the level gate (see checkMilestoneCompletion), so it
 * counts toward reaching the gate; the milestone's own `rewards.xp` is granted only
 * AFTER completion, so it does NOT.
 */
function preCheckXp(m) {
  return m && m.encounter && m.encounter.rewards && typeof m.encounter.rewards.xp === 'number'
    ? m.encounter.rewards.xp : 0;
}

/** Transitive `requires` ancestors of a milestone (dangling refs / cycles are MS-03's job). */
function ancestorIds(milestone, byId) {
  const out = new Set();
  const stack = [...(Array.isArray(milestone.requires) ? milestone.requires : [])];
  while (stack.length) {
    const id = stack.pop();
    if (out.has(id)) continue;
    const p = byId.get(id);
    if (!p) continue; // dangling requirement (reported by MS-03)
    out.add(id);
    for (const r of (Array.isArray(p.requires) ? p.requires : [])) stack.push(r);
  }
  return out;
}

/**
 * MS-07 (error): a milestone's `minLevel` gate must be reachable on the main-quest
 * path. A milestone whose trigger matches but whose party is below `minLevel`
 * returns `level_blocked` from checkMilestoneCompletion, the milestone silently
 * never completes, and the campaign cannot be finished (the tier-1 finale soft-lock).
 *
 * REACHABILITY (main-quest-only, side quests excluded): the XP a party is GUARANTEED
 * to have banked at the gate = the cumulative completion XP of every `requires`
 * ancestor (each ancestor's `rewards.xp` + boss `encounter.rewards.xp`) plus this
 * milestone's own boss `encounter.rewards.xp` (granted on defeat, before the gate
 * fires). If `XP_THRESHOLDS[minLevel-1]` exceeds that, the gate is unreachable.
 *
 * SCOPE (fresh-start campaigns only): this asserts unreachability only when the
 * campaign's entry level is 1 (`levelRange[0] <= 1`), where the party's starting XP
 * is PROVABLY 0. Continuation chapters (tier 2+, `levelRange[0] > 1`) carry unbounded
 * XP from the prior chapter, so main-quest data alone cannot prove their gates
 * unreachable; they are skipped, not passed silently. Side-quest XP is optional and
 * deliberately not counted (a main-quest-focused player must be able to finish).
 */
const ms07 = {
  id: 'MS-07',
  domain: DOMAIN,
  title: 'minLevel gate is reachable on the main-quest path (no silent soft-lock)',
  severity: SEVERITY.ERROR,
  run(ctx) {
    const violations = [];
    const thresholds = Array.isArray(ctx.xpThresholds) ? ctx.xpThresholds : [];
    const xpForLevel = (level) => {
      if (!thresholds.length) return 0;
      const i = Math.max(0, Math.min(thresholds.length - 1, level - 1));
      return thresholds[i];
    };
    for (const c of ctx.campaigns) {
      const entryLevel = (c.levelRange && typeof c.levelRange[0] === 'number') ? c.levelRange[0] : 1;
      // Continuation chapters carry prior-chapter XP; only a fresh start (entry
      // level 1) has a provably-known 0-XP baseline to reason against.
      if (entryLevel > 1) continue;
      const byId = new Map(c.milestones.filter((m) => m && m.id != null).map((m) => [m.id, m]));
      for (const m of c.milestones) {
        if (!m || typeof m.minLevel !== 'number' || m.minLevel <= 1) continue;
        const requiredXp = xpForLevel(m.minLevel);
        let reachableXp = preCheckXp(m);
        for (const aid of ancestorIds(m, byId)) reachableXp += completionXp(byId.get(aid));
        if (requiredXp > reachableXp) {
          violations.push({
            message: `milestone ${m.id} gates on minLevel ${m.minLevel} (needs ${requiredXp} XP) but only ${reachableXp} XP is reachable on the main-quest path from a fresh start; defeating it returns level_blocked and silently soft-locks the campaign; set minLevel: null or lower the gate`,
            location: `${c.template} / milestone ${m.id} (${m.type})`
          });
        }
      }
    }
    return violations;
  }
};

/**
 * MS-08 (error): a `combat` milestone's `encounter` must carry `multiRound: true`. A
 * single-round encounter reports only `outcomeTier` (never `result.outcome === 'victory'`),
 * so `isEncounterVictory` stays false, the `enemy_defeated` event never fires, and the
 * milestone — plus every step gated behind it — silently dead-ends with no error anywhere
 * (audit 2026-07-18). The engine now force-stamps multiRound when it serves a milestone
 * boss, so this catches the authoring slip at build time as defense in depth.
 */
const ms08 = {
  id: 'MS-08',
  domain: DOMAIN,
  title: 'Combat milestone encounter is multi-round (single-round boss never completes)',
  severity: SEVERITY.ERROR,
  run(ctx) {
    const violations = [];
    for (const c of ctx.campaigns) {
      for (const m of c.milestones) {
        if (!m || m.type !== 'combat') continue;
        if (!m.encounter) continue; // missing encounter is MS-05's concern
        if (m.encounter.multiRound === true) continue;
        violations.push({
          message: `combat milestone ${m.id} encounter is not multiRound — a single-round boss can never report 'victory', so enemy_defeated never fires and the milestone silently never completes; add multiRound: true (and enemyHP) to its encounter`,
          location: `${c.template} / milestone ${m.id} (combat)`
        });
      }
    }
    return violations;
  }
};

export const checks = [ms01, ms02, ms03, ms04, ms05, ms06, ms07, ms08];

export default checks;
