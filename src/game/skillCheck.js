// skillCheck.js
// #83 Phase 1: engine-rolled skill checks for NON-COMBAT actions (persuade, intimidate,
// sneak, perceive, recall lore, ...). The determinism boundary is the same as everywhere
// else (#76): the ENGINE rolls and decides the tier; the LLM only narrates the result it is
// handed. The model PROPOSES a check ([CHECK: skill, tier]) as bounded judgment — it says a
// check is happening and roughly how hard — but never picks the outcome, and can never hand
// itself an arbitrary DC (a raw number is clamped to the nearest tier).
//
// The roll math mirrors encounterResolver's combat stack exactly (stat mod + gear + level
// bonus + Lead/Support), so social checks and combat use the same dice truth. This module is
// pure aside from rollCheck's RNG (Math.random), matching the combat resolver.

import { rollCheck } from '../utils/dice';
import { SKILLS, calculateModifier } from '../utils/rules';
import { DIFFICULTY_DC } from '../data/encounters';
import { getEquippedBonuses } from './equipment';
import { getLevelBonus } from '../utils/progressionSystem';

const PHYSICAL_STATS = ['Strength', 'Dexterity'];

// The one difficulty ladder for the whole game (reused verbatim from DIFFICULTY_DC).
export const CHECK_TIERS = ['trivial', 'easy', 'medium', 'hard', 'deadly'];
export const DEFAULT_CHECK_TIER = 'medium';

// A few common verbs/nouns the model reaches for, mapped to canonical SKILLS keys. Anything
// that resolves to a real skill (directly or via alias) is accepted; everything else is
// rejected so a malformed marker never silently rolls the wrong thing.
const SKILL_ALIASES = {
  persuade: 'Persuasion', persuasion: 'Persuasion', convince: 'Persuasion', diplomacy: 'Persuasion',
  intimidate: 'Intimidation', intimidation: 'Intimidation', threaten: 'Intimidation', coerce: 'Intimidation',
  deceive: 'Deception', deception: 'Deception', lie: 'Deception', bluff: 'Deception',
  sneak: 'Stealth', stealth: 'Stealth', hide: 'Stealth',
  perceive: 'Perception', perception: 'Perception', spot: 'Perception', notice: 'Perception', search: 'Perception',
  insight: 'Insight', 'read intentions': 'Insight', 'sense motive': 'Insight',
  investigate: 'Investigation', investigation: 'Investigation',
  lore: 'History', 'recall lore': 'History', history: 'History', knowledge: 'History',
  arcana: 'Arcana', magic: 'Arcana',
  nature: 'Nature', survival: 'Survival', tracking: 'Survival',
  medicine: 'Medicine', heal: 'Medicine',
  athletics: 'Athletics', climb: 'Athletics', 'break free': 'Athletics', force: 'Athletics',
  acrobatics: 'Acrobatics', balance: 'Acrobatics', tumble: 'Acrobatics',
  'sleight of hand': 'Sleight of Hand', pickpocket: 'Sleight of Hand', 'pick lock': 'Sleight of Hand', lockpicking: 'Sleight of Hand',
  performance: 'Performance', perform: 'Performance',
  religion: 'Religion', 'animal handling': 'Animal Handling',
};

/** Normalize a model-proposed skill word to a canonical SKILLS key, or null if unrecognizable. */
export const canonicalSkill = (raw) => {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  const direct = Object.keys(SKILLS).find((k) => k.toLowerCase() === s);
  if (direct) return direct;
  return SKILL_ALIASES[s] || null;
};

/**
 * Clamp a proposed difficulty to a valid tier. A tier WORD passes through; a raw NUMBER maps
 * to the nearest tier by DC distance (so "[CHECK: x, 2]" becomes trivial, never an auto-win at
 * an arbitrary DC — the model must not adjudicate through a number); anything else -> medium.
 */
export const canonicalTier = (raw) => {
  if (raw == null || raw === '') return DEFAULT_CHECK_TIER;
  const s = String(raw).trim().toLowerCase();
  if (CHECK_TIERS.includes(s)) return s;
  const n = parseInt(s, 10);
  if (Number.isFinite(n)) {
    let best = DEFAULT_CHECK_TIER;
    let bestDist = Infinity;
    for (const t of CHECK_TIERS) {
      const d = Math.abs(DIFFICULTY_DC[t] - n);
      if (d < bestDist) { bestDist = d; best = t; }
    }
    return best;
  }
  return DEFAULT_CHECK_TIER;
};

// Matches [CHECK: <skill>] or [CHECK: <skill>, <tier>]. Kept separate from the CHECK/ROLL
// TRIGGER_REGEX so the two-argument form parses cleanly.
export const CHECK_MARKER_REGEX = /\[CHECK:\s*([^\]]+)\]/i;

/** Parse a [CHECK: skill, tier] marker into { skill, tier, raw } (canonicalized) or null. */
export const parseCheckMarker = (text) => {
  if (!text) return null;
  const m = text.match(CHECK_MARKER_REGEX);
  if (!m) return null;
  const parts = m[1].split(',').map((p) => p.trim());
  const skill = canonicalSkill(parts[0]);
  if (!skill) return null;
  return { skill, tier: canonicalTier(parts[1]), raw: m[0] };
};

/**
 * Resolve a skill check for the party Lead (mirrors the combat modifier stack in
 * encounterResolver): stat modifier + gear (attack bonus for physical skills, misc always) +
 * level bonus + a deterministic party support bonus. Returns the roll, the tier it resolved
 * to, and the breakdown pieces the log line needs. rollCheck reads Math.random (as combat does).
 *
 * @param {Object} args
 * @param {string} args.skill canonical SKILLS key
 * @param {string} [args.tier] difficulty tier (default medium)
 * @param {Object} args.hero the rolling hero (the Lead)
 * @param {number} [args.supportBonus] deterministic party assist (getSupportBonus)
 */
export const resolveSkillCheck = ({ skill, tier = DEFAULT_CHECK_TIER, hero, supportBonus = 0 }) => {
  const statName = SKILLS[skill] || 'Charisma';
  const statValue = (hero && hero.stats && hero.stats[statName]) || 10;
  let modifier = calculateModifier(statValue);

  const equip = getEquippedBonuses(hero || {});
  if (PHYSICAL_STATS.includes(statName)) modifier += equip.attack;
  modifier += equip.misc;
  modifier += getLevelBonus((hero && hero.level) || 1);

  const heroModifier = modifier;
  const support = Number.isFinite(supportBonus) ? supportBonus : 0;
  const dc = DIFFICULTY_DC[tier] != null ? DIFFICULTY_DC[tier] : DIFFICULTY_DC.medium;
  const rollResult = rollCheck(modifier + support);

  let outcomeTier;
  if (rollResult.isCriticalSuccess) outcomeTier = 'criticalSuccess';
  else if (rollResult.isCriticalFailure) outcomeTier = 'criticalFailure';
  else if (rollResult.total >= dc) outcomeTier = 'success';
  else outcomeTier = 'failure';

  const success = outcomeTier === 'success' || outcomeTier === 'criticalSuccess';
  return { skill, tier, dc, statName, heroModifier, supportBonus: support, rollResult, outcomeTier, success };
};

const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);

/**
 * The visible d20 roll-breakdown line for the log (the "result card"). Mirrors combat's
 * determinism-on-show presentation so social play reads the same way. This is the PLAYER's
 * immediate feedback; the AI narrates the consequence on its next turn (no extra AI call).
 */
export const formatCheckRollLine = (r, heroName) => {
  const icon = r.success ? '🎲 ✅' : '🎲 ❌';
  const verdict = {
    criticalSuccess: 'CRITICAL SUCCESS', success: 'SUCCESS',
    failure: 'FAILURE', criticalFailure: 'CRITICAL FAILURE',
  }[r.outcomeTier] || (r.success ? 'SUCCESS' : 'FAILURE');
  const support = r.supportBonus ? ` ${sign(r.supportBonus)} support` : '';
  const who = heroName || 'The party';
  return `${icon} **${r.skill}** check (${r.tier}, DC ${r.dc}) — ${who} rolled `
    + `**${r.rollResult.total}** (d20 ${r.rollResult.naturalRoll} ${sign(r.heroModifier)}${support}): ${verdict}.`;
};

/**
 * The fact line injected into the NEXT prompt so the AI narrates the story around the result
 * (never re-adjudicates it). The failure guidance carries the anti-retry intent even before
 * the Phase 2 persisted ledger exists: the refusal stands for this beat.
 */
export const formatCheckResultForPrompt = (r) => {
  const verdict = {
    criticalSuccess: 'CRITICAL SUCCESS', success: 'SUCCESS',
    failure: 'FAILURE', criticalFailure: 'CRITICAL FAILURE',
  }[r.outcomeTier] || (r.success ? 'SUCCESS' : 'FAILURE');
  const guidance = r.success
    ? 'Narrate the attempt succeeding, in proportion to how strong the result was.'
    : 'Narrate the attempt failing. The failure stands for this scene — do not let further talking simply reverse it; steer toward another approach.';
  return `[CHECK RESULT: ${r.skill} check (rolled ${r.rollResult.total} vs DC ${r.dc}): ${verdict}. ${guidance}]`;
};
