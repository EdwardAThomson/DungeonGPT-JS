// The adjudication prompt: the typed questions (fixtures.QUESTIONS, the same definitions
// the human labeller sees) asked about one turn, answered as one JSON object.
//
// Kept separate from the eval runner so a production adjudicator can reuse it. The model
// only classifies: it never narrates and never decides outcomes.

import { QUESTIONS } from './fixtures.mjs';

// Bump when the prompt text changes; every eval row records it so runs stay comparable.
// v1 = pilot-1 (2026-09-30). v2 = + talk_to_npc precedence rule + worked `unclear` examples.
// v3 = Q4-Q6 also asked for talk_to_npc (social checks in dialogue).
// Examples must never be copied from the eval fixtures (that leaks the answers).
export const PROMPT_VERSION = 'v3';

export const TARGET_EXTRAS = ['unnamed locals (crowd/background)', 'party member', 'object/place (not a person)', 'other (not listed)', 'none'];

// Option lists for one turn. `reverse` flips every list (order-sensitivity variant, §4.2).
export function optionsForTurn(turn, skills, { reverse = false } = {}) {
  const r = (xs) => (reverse ? [...xs].reverse() : xs);
  const opts = {};
  for (const q of QUESTIONS) {
    if (q.type === 'yesno') opts[q.key] = [true, false];
    else if (q.type === 'skill') opts[q.key] = r(skills);
    else if (q.type === 'target') opts[q.key] = r([...(turn.targets || []), ...TARGET_EXTRAS]);
    else opts[q.key] = r(q.options);
  }
  return opts;
}

const RULES = `Rules:
- Q1 says what the player is trying to do. talk_to_npc = speech aimed at a specific named NPC, whether or not that NPC is actually here; "I ask around" or unnamed people is action. unclear = you cannot tell what the player means (e.g. a place addressed as a person, "him" with no referent), so the DM should ask. A clear request that cannot happen is NOT unclear: it is action/talk_to_npc with Q7 = true.
- Precedence: a message addressed to a named NPC is talk_to_npc even if it also accepts something ("Mira, you have a deal.") or includes getting there ("Head over to the forge and ask Smith Dorran about the blade."). continue is only for bare acknowledgements with nobody addressed ("sure", "alright then").
- Answer Q2 only when Q1 = action; otherwise null. Answer Q3, Q4 and Q7 when Q1 = action or talk_to_npc; otherwise null. Answer Q5 and Q6 only when Q4 = true; otherwise null.
- Q3 target = what the action is aimed at, not merely where it happens. Pick "other (not listed)" for a specific person not in the list and then give their name in q3_other.
- Q4: would a good human DM call for a roll? Routine or obvious = false; contested or uncertain = true. Combat is its own system and never a check. Plain conversation is not a check, but trying to persuade, deceive, intimidate or read a named NPC in dialogue can be (Persuasion, Deception, Intimidation, Insight).
- Q6 difficulty: trivial (nearly always succeeds), easy (most competent people manage), medium (a real coin-flip), hard (experts usually fail), deadly (near-hopeless).
- Q7 = true if it cannot happen given the scene: the NPC is not here, the party lacks the ability or item, the premise contradicts the state. Not "unwise".
- Judge by the context and what the DM last told the player. Do not narrate.

Examples of unclear (the DM must ask; do not guess a reading). These are illustrations,
not taken from any test turn:
- "We follow her." when no woman is identifiable in the scene -> unclear.
- "Open it." when nothing openable has been mentioned -> unclear.
- "We ask Stonebridge for directions." when Stonebridge is a town, not a person -> unclear.
- "go" with no direction or destination -> unclear.
Not unclear: "We ask the Duke for an audience." while the Duke is in another city -> talk_to_npc, Q7 = true (clear intent, wrong premise).`;

const fmt = (v) => (v === true ? 'true' : v === false ? 'false' : JSON.stringify(v));

export function buildPrompt(turn, skills, opts) {
  const lines = QUESTIONS.map((q) => {
    const o = opts[q.key];
    const help = q.help ? ` (${o.map((x) => (q.help[x] ? `${x}: ${q.help[x]}` : x)).join('; ')})` : '';
    return `${q.key}: ${q.text.replace(/ \(e\.g\..*$/, '')} Options: ${o.map(fmt).join(', ')}${help}`;
  });
  const system = `You classify one player message in a fantasy tabletop RPG for the game engine. You answer fixed questions by choosing from the given options. Reply with ONE JSON object and nothing else, with keys q1, q2, q3, q4, q5, q6, q7 (and q3_other only when q3 is "other (not listed)"). Use null for questions that do not apply.

Questions:
${lines.join('\n')}

${RULES}`;
  const user = `[GAME STATE]
${turn.context || '(none)'}

[DM'S LAST MESSAGE]
${turn.last_dm || '(none)'}

[PLAYER MESSAGE]
${turn.player_text}

Reply with the JSON object only.`;
  return { system, user };
}

// Pull the first JSON object out of a reply (models sometimes wrap it in prose or fences).
// A few narrow repairs for known model slips (gpt-oss writes `"q7":false"}`); a repaired
// parse is flagged so strict schema validity still counts it as a failure.
export function parseAnswer(text) {
  if (!text) return null;
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  const body = text.slice(s, e + 1);
  try { return JSON.parse(body); } catch { /* try repairs */ }
  const fixed = body
    .replace(/\b(null|true|false|-?\d+(?:\.\d+)?)"(\s*[,}])/g, '$1$2') // stray quote after a literal
    .replace(/,\s*}/g, '}');                                         // trailing comma
  try { return Object.assign(JSON.parse(fixed), { __repaired: true }); } catch { return null; }
}

// Validate a parsed answer against this turn's options. Returns { answer, problems }.
// Out-of-range values become null and are reported, so schema validity is measurable.
export function validateAnswer(raw, opts) {
  const problems = [];
  const answer = {};
  if (!raw || typeof raw !== 'object') return { answer: null, problems: ['no-json'] };
  if (raw.__repaired) problems.push('json-repaired');
  for (const q of QUESTIONS) {
    let v = raw[q.key];
    if (v === undefined || v === 'null' || v === '') v = null;
    if (q.type === 'yesno' && typeof v === 'string') v = /^(true|yes)$/i.test(v) ? true : /^(false|no)$/i.test(v) ? false : v;
    if (v !== null && !opts[q.key].includes(v)) {
      // Case-insensitive rescue for choice options (e.g. "Stealth" vs "stealth").
      const hit = typeof v === 'string' && opts[q.key].find((o) => typeof o === 'string' && o.toLowerCase() === v.toLowerCase());
      if (hit) v = hit; else { problems.push(`${q.key}:${JSON.stringify(v)}`); v = null; }
    }
    answer[q.key] = v;
  }
  if (typeof raw.q3_other === 'string' && raw.q3_other.trim()) answer.q3_other = raw.q3_other.trim();
  return { answer, problems };
}
