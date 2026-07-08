// NPCS domain (NPC) — cross-checks authored milestone NPC spawns against the
// placement path (getMilestoneNpcsForTown / addAuthoredNpcToTown) and the talk-
// milestone mechanic. Same contract as items.js. Data from ./context.js:
// npcSpawns and campaigns.

import { SEVERITY } from './types';

const DOMAIN = 'npcs';

// A display name that is really a raw id (all lower snake_case, no spaces) leaked
// into the name field — e.g. 'well_keeper' where 'Keeper Najwa' was meant.
const looksLikeRawId = (s) => typeof s === 'string' && /^[a-z0-9]+(_[a-z0-9]+)+$/.test(s.trim());

// Conversation-objective cue words used by NPC-06 (the Sigrun-class detector) to
// guess that a NON-talk milestone is really a "go talk to this NPC" objective that
// was authored with the wrong type. Kept deliberately small and specific: each cue
// strongly implies speaking to a person, so an accidental narrative/location typing
// stands out. Matched case-insensitively as whole words against the milestone text.
// Widen with care — every added cue trades false negatives for false positives, and
// NPC-06 is only a warn precisely because some of these are legitimately narrative.
const CONVERSATION_CUES = [
  'talk', 'speak', 'win the trust', 'convince', 'persuade', 'ask', 'meet', 'seek out'
];

/** True if `text` contains any conversation cue as a whole-word (phrase) match. */
function readsLikeConversation(text) {
  if (!text || typeof text !== 'string') return false;
  const hay = text.toLowerCase();
  return CONVERSATION_CUES.some((cue) => {
    // Word-boundary match so 'ask' does not fire inside 'flask'/'mask', and
    // multi-word cues ('win the trust') match as a contiguous phrase.
    const re = new RegExp(`\\b${cue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    return re.test(hay);
  });
}

/**
 * NPC-01 (error): every milestone NPC spawn carries the fields
 * getMilestoneNpcsForTown needs to place it — a non-blank `name` and a resolvable
 * venue town (spawn.location or the quest building's location). Missing either
 * makes getMilestoneNpcsForTown silently skip the NPC, so a talk objective anchored
 * to it can never complete.
 */
const npc01 = {
  id: 'NPC-01',
  domain: DOMAIN,
  title: 'Every milestone NPC spawn has a name and a resolvable venue',
  severity: SEVERITY.ERROR,
  run(ctx) {
    const violations = [];
    for (const n of ctx.npcSpawns) {
      const missing = [];
      if (!n.name || !String(n.name).trim()) missing.push('name');
      if (!n.venueTown || !String(n.venueTown).trim()) missing.push('venue (spawn.location / building.location)');
      if (missing.length === 0) continue;
      violations.push({
        message: `NPC spawn '${n.id || '(no id)'}' is missing ${missing.join(', ')} — getMilestoneNpcsForTown will skip it`,
        location: n.loc
      });
    }
    return violations;
  }
};

/**
 * NPC-02 (error): every `talk`-type milestone points at an NPC that is actually
 * spawned in the same template — its `trigger.npc` must match a `spawn.id` of an
 * npc spawn. The Talk button fires `npc_talked` with the spawned NPC's id; if it
 * matches no spawn, the milestone has no NPC to talk to and never completes.
 */
const npc02 = {
  id: 'NPC-02',
  domain: DOMAIN,
  title: 'Every talk milestone references a spawned NPC (trigger.npc matches a spawn.id)',
  severity: SEVERITY.ERROR,
  run(ctx) {
    const violations = [];
    for (const c of ctx.campaigns) {
      const npcSpawnIds = new Set(
        c.milestones
          .filter((m) => m && m.spawn && m.spawn.type === 'npc' && m.spawn.id)
          .map((m) => m.spawn.id)
      );
      for (const m of c.milestones) {
        if (!m || m.type !== 'talk') continue;
        const wanted = m.trigger && m.trigger.npc;
        const loc = `${c.template} / milestone ${m.id} (talk)`;
        if (!wanted) {
          violations.push({
            message: `talk milestone ${m.id} has no trigger.npc, so no NPC can complete it`,
            location: loc
          });
          continue;
        }
        if (!npcSpawnIds.has(wanted)) {
          violations.push({
            message: `talk milestone ${m.id} trigger.npc '${wanted}' matches no npc spawn.id in this template`,
            location: loc
          });
        }
      }
    }
    return violations;
  }
};

/**
 * NPC-03 (warn): NPC name/role completeness. Non-blocking polish: getMilestoneNpcsForTown
 * defaults a missing role to 'Villager' and tolerates a null personality, so these
 * degrade the characterization rather than break placement. Also flags a raw id
 * leaking into the display name.
 */
const npc03 = {
  id: 'NPC-03',
  domain: DOMAIN,
  title: 'NPC role / personality present and no raw id leaks as a name',
  severity: SEVERITY.WARN,
  run(ctx) {
    const violations = [];
    for (const n of ctx.npcSpawns) {
      const gaps = [];
      if (!n.role || !String(n.role).trim()) gaps.push('role (defaults to Villager)');
      if (!n.personality || !String(n.personality).trim()) gaps.push('personality');
      if (looksLikeRawId(n.name)) gaps.push(`name '${n.name}' looks like a raw id`);
      if (gaps.length === 0) continue;
      violations.push({
        message: `NPC spawn '${n.id || '(no id)'}' (${n.name || 'unnamed'}): ${gaps.join(', ')}`,
        location: n.loc
      });
    }
    return violations;
  }
};

/**
 * NPC-04 (warn): every milestone NPC's venue town is a town the campaign actually
 * generates. A venue naming a town not in customNames / milestone locations means
 * the NPC's town is never created, so getMilestoneNpcsForTown never matches it.
 * Advisory (warn) rather than a hard error: BLD-02 already errors on quest-building
 * venues, and an NPC may legitimately be homed via its building's town.
 */
const npc04 = {
  id: 'NPC-04',
  domain: DOMAIN,
  title: 'Every milestone NPC venue is a town the campaign generates',
  severity: SEVERITY.WARN,
  run(ctx) {
    const violations = [];
    for (const n of ctx.npcSpawns) {
      if (!n.venueTown) continue; // absence is NPC-01's (error) concern
      if (n.townNames.has(String(n.venueTown).toLowerCase())) continue;
      violations.push({
        message: `NPC spawn '${n.id || '(no id)'}' venue '${n.venueTown}' is not among the campaign's town names`,
        location: n.loc
      });
    }
    return violations;
  }
};

/**
 * NPC-05 (error): the FULL Talk-button path is wired for every `talk` milestone.
 * This is the authoritative talk-button check: a milestone only renders a
 * click-to-complete Talk button when it is `type: 'talk'` with a `trigger.npc`
 * that (a) matches an npc `spawn.id` in the same template AND (b) that spawn is
 * actually PLACED — it has a venue town (spawn.location or building.location) that
 * the campaign generates, so getMilestoneNpcsForTown drops it into a building and
 * the button can render. Without every link, the player has no Talk button and can
 * only complete the objective by guessing at free text (the Warden Sigrun bug).
 *
 * INTENTIONAL OVERLAP: NPC-01 (spawn has name + venue), NPC-02 (trigger.npc matches
 * a spawn.id) and NPC-04 (venue is a generated town) each guard one link in
 * isolation; NPC-05 ties the whole chain together for `talk` milestones specifically
 * and is the single check that answers "can the player click to complete this?". It
 * only reports the missing LINK, not the sub-facts NPC-01/02/04 already report, so
 * the same defect is not failed twice.
 */
const npc05 = {
  id: 'NPC-05',
  domain: DOMAIN,
  title: 'Talk milestone is fully click-completable (trigger.npc → placed spawn) [ties NPC-01/02/04]',
  severity: SEVERITY.ERROR,
  run(ctx) {
    const violations = [];
    for (const c of ctx.campaigns) {
      // NPC spawns of this template, indexed by spawn.id, carrying the venue town
      // and the campaign's generated-town set (both already resolved on ctx.npcSpawns).
      const spawnById = new Map(
        ctx.npcSpawns
          .filter((n) => n.template === c.template && n.id)
          .map((n) => [n.id, n])
      );
      for (const m of c.milestones) {
        if (!m || m.type !== 'talk') continue;
        const loc = `${c.template} / milestone ${m.id} (talk)`;
        const wanted = m.trigger && m.trigger.npc;
        if (!wanted) {
          violations.push({
            message: `talk milestone ${m.id} has no trigger.npc — no NPC to talk to, so no Talk button renders`,
            location: loc
          });
          continue;
        }
        const spawn = spawnById.get(wanted);
        if (!spawn) {
          violations.push({
            message: `talk milestone ${m.id} trigger.npc '${wanted}' matches no npc spawn.id in this template — the Talk button has no NPC to fire on`,
            location: loc
          });
          continue;
        }
        if (!spawn.venueTown || !String(spawn.venueTown).trim()) {
          violations.push({
            message: `talk milestone ${m.id} NPC '${wanted}' has no venue (spawn.location / building.location) — it is never placed in a town, so no Talk button renders`,
            location: loc
          });
          continue;
        }
        if (!spawn.townNames.has(String(spawn.venueTown).toLowerCase())) {
          violations.push({
            message: `talk milestone ${m.id} NPC '${wanted}' venue '${spawn.venueTown}' is not a town the campaign generates — the NPC's town is never created, so no Talk button renders`,
            location: loc
          });
        }
      }
    }
    return violations;
  }
};

/**
 * NPC-06 (warn): the Sigrun-class detector — a NON-talk milestone that spawns an
 * NPC and whose `text` reads like a "go talk to them" objective. Warden Sigrun's
 * milestone shipped as `type: 'narrative'` with a null trigger despite having an
 * npc spawn and a venue, so she never got a Talk button and could only be completed
 * by guessing free text. This flags that shape: an npc `spawn` present, the type is
 * something OTHER than `talk`, and the text hits a conversation cue (talk / speak /
 * win the trust / convince / persuade / ask / meet / seek out).
 *
 * Advisory (warn), not error: some such milestones are legitimately narrative
 * (AI-judged) or location objectives that merely mention a person, so this is a
 * "did you mean type: 'talk'?" nudge, not a hard failure. The cue list is kept
 * small (see CONVERSATION_CUES) to limit false positives.
 */
const npc06 = {
  id: 'NPC-06',
  domain: DOMAIN,
  title: "Possible mis-typed talk milestone (spawns an NPC, reads like a conversation)",
  severity: SEVERITY.WARN,
  run(ctx) {
    const violations = [];
    for (const c of ctx.campaigns) {
      for (const m of c.milestones) {
        if (!m || m.type === 'talk') continue;
        const hasNpcSpawn = m.spawn && m.spawn.type === 'npc';
        if (!hasNpcSpawn) continue;
        if (!readsLikeConversation(m.text)) continue;
        violations.push({
          message: `milestone ${m.id} spawns an NPC and reads like a conversation objective but is type '${m.type}', so it will not get a Talk button — consider type: 'talk' with trigger.npc`,
          location: `${c.template} / milestone ${m.id} (${m.type})`
        });
      }
    }
    return violations;
  }
};

export const checks = [npc01, npc02, npc03, npc04, npc05, npc06];

export default checks;
