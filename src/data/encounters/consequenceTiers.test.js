/**
 * Guard test: failure-tier consequence narration must not read as a player victory.
 *
 * Per-round narration is `encounter.consequences[outcomeTier]` where the tier is one of
 * criticalSuccess | success | failure | criticalFailure (see encounterResolver.js). The
 * tier SELECTION is correct; the historic bug was authored CONTENT: some `failure` /
 * `criticalFailure` strings described the player defeating the enemy (e.g. the spider nest's
 * "You defeat the spiders but suffer venomous bites."), so a losing round rendered under a
 * red "Failure" badge while reading like a win.
 *
 * This test fails if any `failure` / `criticalFailure` string phrases the PLAYER as the one
 * defeating/destroying the enemy. It intentionally does NOT flag strings where the ENEMY is
 * the subject ("The Overlord nearly destroys you") which are correct for a failure tier.
 */

import { encounterTemplates } from './index';
import { QUEST_ENEMIES } from '../questEnemies';
import { storyTemplates } from '../storyTemplates';

// Banned player-victory phrasings for failure/criticalFailure tiers. Each pattern requires
// the player ("you") to be the SUBJECT of a victory verb, so:
//   - "you defeat the spiders"  -> flagged (player wins in a failure tier: wrong)
//   - "the overlord nearly destroys you" -> NOT flagged (enemy is the subject: correct)
//   - "your defensive skill holds" -> NOT flagged ("skill" never matches "kill" because we
//     anchor on a leading "you"/"you have" + a whole-word verb)
// Keep this list small and word-anchored; add a verb here only if a new false-negative slips
// through, and prefer the "you <verb>" shape over a bare substring.
const PLAYER_VICTORY_PATTERNS = [
  /\byou\b(?:\s+(?:have|finally|barely|just|somehow|manage to|managed to))?\s+(?:defeat|defeated|destroy|destroyed|slay|slew|slain|vanquish|vanquished|rout|routed|triumph|triumphed|prevail|prevailed|overwhelm|overwhelmed)\b/i,
  /\byou\b\s+(?:cut down|cut them down|fell|felled|put them down|finish (?:it|them) off|wipe them out)\b/i,
];

/**
 * Walk an arbitrary data structure and collect every object that has a `consequences`
 * child object (encounters, quest enemies, and story-template milestone encounters all
 * share this shape at different nesting depths).
 */
const collectConsequences = (node, path, out) => {
  if (!node || typeof node !== 'object') return;
  if (node.consequences && typeof node.consequences === 'object') {
    out.push({ path, consequences: node.consequences });
  }
  if (Array.isArray(node)) {
    node.forEach((child, i) => collectConsequences(child, `${path}[${i}]`, out));
  } else {
    for (const key of Object.keys(node)) {
      if (key === 'consequences') continue;
      collectConsequences(node[key], `${path}.${key}`, out);
    }
  }
};

const gatherAllConsequences = () => {
  const out = [];
  collectConsequences(encounterTemplates, 'encounterTemplates', out);
  collectConsequences(QUEST_ENEMIES, 'QUEST_ENEMIES', out);
  collectConsequences(storyTemplates, 'storyTemplates', out);
  return out;
};

describe('consequence-tier narration', () => {
  const all = gatherAllConsequences();

  it('finds a meaningful number of consequence blocks (sanity guard)', () => {
    // If the walker silently stops matching (e.g. an export shape changes), the offender
    // check below would vacuously pass. This floor keeps the guard honest.
    expect(all.length).toBeGreaterThan(50);
  });

  it('never phrases a failure/criticalFailure round as the player defeating the enemy', () => {
    const offenders = [];
    for (const { path, consequences } of all) {
      for (const tier of ['failure', 'criticalFailure']) {
        const text = consequences[tier];
        if (typeof text !== 'string') continue; // some blocks use non-string tier values
        for (const pattern of PLAYER_VICTORY_PATTERNS) {
          if (pattern.test(text)) {
            offenders.push(`${path}.consequences.${tier}: ${JSON.stringify(text)}`);
            break;
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
