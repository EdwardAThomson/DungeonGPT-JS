// Deterministic roll rules for the typed-decision eval: can plain code decide Q4-Q6 (roll?
// which skill? how hard?) as well as a model, given what the player is trying to do?
//
// Two pieces, both pure functions (no model, no randomness):
//  - readIntentByKeywords(turn): a crude keyword reader for Q1/Q2/Q3 from the raw player
//    text. It exists to measure the fully deterministic option end to end.
//  - decideRoll(intent, turn): the roll rule table. Takes a typed intent {q1, q2, q3, q7}
//    from anywhere (the keyword reader, a model's answers, or the human labels) and returns
//    {q4, q5, q6}. Uses only what code can know: the intent, the player text, and the
//    scene's objective list.
//
// The rules encode the design decisions made during labelling (plan §6.1): combat is never
// a skill check; quest items found where the story put them need no roll; plain
// conversation is not a check but persuading/deceiving/intimidating/reading someone is;
// impossible requests are never rolled.

const has = (text, re) => re.test(text.toLowerCase());

// ---------------------------------------------------------------- keyword reader (Q1-Q3)
// Generic out-of-character markers (game, UI, rules, the player themself). Deliberately not
// lifted from the pilot turns; the scores are still in-sample, see rules-eval.mjs.
const OOC = /\b(save|load|settings|button|bug|lol|brb|afk|are you an ai|what model|chatgpt|response(s)?|shorter|longer|hp|hit points|how does .+ work|what does .+ do|in this game|the whole map)\b/;
const CONTINUE = /^(ok|okay|sure|yes|yeah|go on|continue|alright|fine|next)[.!]?$/;
const CLARIFY = /^(wait|what\??|huh|sorry|who is|who's|what do you mean)/;

export function readIntentByKeywords(turn) {
  const text = (turn.player_text || '').trim();
  const t = text.toLowerCase();
  const intent = { q1: null, q2: null, q3: null, q7: false };
  if (CONTINUE.test(t)) return { ...intent, q1: 'continue' };
  if (OOC.test(t)) return { ...intent, q1: 'ooc' };
  if (CLARIFY.test(t)) return { ...intent, q1: 'clarification' };
  if (t.length <= 4) return { ...intent, q1: 'unclear' }; // "n", "atk", "go"
  // A named NPC from the scene mentioned (by any word of their name) = talk_to_npc.
  const named = (turn.targets || []).find((n) => n.split(/\s+/).some((w) => w.length > 3 && t.includes(w.toLowerCase())));
  const speaks = /\b(ask|asks|tell|talk|speak|say|says|convince|persuade|salute)\b|^"/.test(t);
  if (named && speaks) return { ...intent, q1: 'talk_to_npc', q3: named };
  // A question with no action verb, aimed at the narrator.
  if (/\?$/.test(t) && !/\b(i|we|sable|bram|ilma)\b/.test(t)) return { ...intent, q1: 'world_question' };
  intent.q1 = 'action';
  if (/\b(attack|fight|shoot|stab|strike|cast|fireball|atk)\b/.test(t)) intent.q2 = 'attack';
  else if (/\b(sneak|slip|hide|lift|pickpocket|steal|without (him|her|them) noticing)\b/.test(t)) intent.q2 = 'stealth';
  else if (/\b(convince|persuade|demand|threaten|intimidate|lie|bluff|slams)\b/.test(t)) intent.q2 = 'persuade';
  else if (/\b(search|look for|examine|inspect|identify|tracks|watch|lying|investigate|serch)\b/.test(t)) intent.q2 = 'investigate';
  else if (/\b(go|walk|travel|climb|cross|head|teleport|fly|run|move)\b/.test(t)) intent.q2 = 'move';
  else if (/\b(buy|order|open|take|grab|read|unroll|use)\b/.test(t)) intent.q2 = 'interact';
  else intent.q2 = 'other';
  if (/\b(barkeep|innkeeper|guard|fisherman|merchant|caravan master|patrons?|locals?)\b/.test(t)) intent.q3 = 'unnamed locals (crowd/background)';
  else if (named) intent.q3 = named;
  else intent.q3 = 'object/place (not a person)';
  return intent;
}

// ---------------------------------------------------------------- roll rule table (Q4-Q6)
const NO_ROLL = { q4: false, q5: null, q6: null };
const roll = (skill, tier = 'medium') => ({ q4: true, q5: skill, q6: tier });

// Social skill from the verb, for persuade actions and for talk_to_npc.
function socialSkill(t) {
  if (has(t, /\b(demand|threaten|intimidate|slams?|bellow|or else)\b/)) return 'Intimidation';
  if (has(t, /\b(lie|lies|bluff|pretend|deceive|trick)\b/)) return 'Deception';
  if (has(t, /\b(lying|watch(es)? .* closely|read (him|her|them)|sincere|hiding something)\b/)) return 'Insight';
  if (has(t, /\b(convince|persuade|trust|win (him|her|them) over|plead|bargain)\b/)) return 'Persuasion';
  return null;
}

// Is this a search for an item an active objective says is here? (Engine grants it: no roll.)
function isQuestItemSearch(turn) {
  const active = (turn.context || '').split('\n').find((l) => l.startsWith('Active Milestones:')) || '';
  const items = [...active.matchAll(/([^;:]+?)\s*\[item\]/g)].map((m) => m[1].toLowerCase());
  const t = (turn.player_text || '').toLowerCase();
  const words = (s) => s.split(/[^a-z']+/).filter((w) => w.length > 3 && !['find', 'recover', 'from', 'with', 'into', 'that', 'this', 'their', 'lost'].includes(w));
  return items.some((it) => words(it).some((w) => t.includes(w)));
}

export function decideRoll(intent, turn) {
  const t = turn.player_text || '';
  const { q1, q2, q3, q7 } = intent || {};
  if (q1 !== 'action' && q1 !== 'talk_to_npc') return { q4: null, q5: null, q6: null }; // not asked
  if (q7) return NO_ROLL;                               // impossible: corrected, never rolled
  if (q1 === 'talk_to_npc') {
    const s = socialSkill(t);
    return s ? roll(s) : NO_ROLL;                       // plain conversation: no roll
  }
  switch (q2) {
    case 'attack': return NO_ROLL;                      // combat system, never a skill check
    case 'stealth':
      return has(t, /\b(lift|pickpocket|steal|palm|swipe)\b/) ? roll('Sleight of Hand') : roll('Stealth');
    case 'persuade': return roll(socialSkill(t) || 'Persuasion');
    case 'investigate': {
      if (isQuestItemSearch(turn)) return NO_ROLL;      // engine grants authored quest items
      if (has(t, /\b(lying|watch(es)?|read|sincere|nervous|hiding)\b/) || q3 === 'unnamed locals (crowd/background)') return roll('Insight');
      if (has(t, /\b(tracks?|trail|follow)\b/)) return roll('Survival', 'easy');
      if (has(t, /\b(altar|shrine|symbols?|holy|god|ritual)\b/)) return roll('Religion');
      if (has(t, /\b(runes?|arcane|magic|spell)\b/)) return roll('Arcana');
      if (has(t, /\b(ask around|rumou?rs?|anyone (seen|heard))\b/)) return roll('Investigation', 'trivial');
      return roll('Investigation', has(t, /\b(carefully|hidden|secret|compartment)\b/) ? 'medium' : 'easy');
    }
    case 'move':
      return has(t, /\b(climb|scale|swim|leap|jump)\b/) ? roll('Athletics', 'easy') : NO_ROLL;
    default: return NO_ROLL;                            // interact / other
  }
}
