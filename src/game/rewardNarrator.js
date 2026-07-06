// rewardNarrator.js
// Seeded, deterministic prose for the flat reward/loot system lines (#8, de-scoped
// by the maintainer to "no AI narration, just a nicer templated sentence").
//
// Sibling of localNarrator.js: the same xfnv1a-hash -> mulberry32 pattern, seeded
// from the reward CONTENT, so the same payout always narrates the same way and no
// Math.random enters game logic. The underlying data is untouched: XP/gold/item
// values are woven into the sentence verbatim, and the machine-formatted
// rewardMessages arrays other code parses ("+100 XP to each party member",
// Game.js's /^\+\d+ XP$/ filter, the encounterController tests) are never
// rewritten here; call sites narrate a COPY for display only.

// --- Seeded RNG (same shape as localNarrator.js) ---------------------------------
const hashSeed = (parts) => {
  const str = parts.map((p) => String(p)).join('|');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pickShape = (shapes, seedParts) => {
  const rng = mulberry32(hashSeed(seedParts));
  return shapes[Math.floor(rng() * shapes.length)];
};

// "50 XP, 12 gold and the Iron Sword": natural-language list join.
const joinNatural = (parts) => {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
};

// Sentence shapes take the whole list as their object, so no verb has to agree
// with a singular/plural payout.
const REWARD_SHAPES = [
  (list) => `The party claims ${list}.`,
  (list) => `Victory yields ${list}.`,
  (list) => `Well earned: ${list}.`,
  (list) => `The spoils of success: ${list}.`,
];

const LOOT_SHAPES = [
  (list) => `You uncover ${list}.`,
  (list) => `Your search turns up ${list}.`,
  (list) => `Hidden away, you find ${list}.`,
  (list) => `You come away with ${list}.`,
];

const buildParts = ({ xp = 0, gold = 0, items = [], xpPartyWide = false }) => {
  const parts = [];
  if (xp > 0) parts.push(`${xp} XP${xpPartyWide ? ' for each party member' : ''}`);
  if (gold > 0) parts.push(`${gold} gold`);
  (items || []).forEach((name) => { if (name) parts.push(`the ${name}`); });
  return parts;
};

/**
 * Compose one seeded sentence for a quest/milestone reward payout.
 * Returns null when there is nothing to announce.
 * @param {{ xp?: number, gold?: number, items?: string[], xpPartyWide?: boolean }} rewards
 */
export const composeRewardSentence = (rewards) => {
  const parts = buildParts(rewards || {});
  if (parts.length === 0) return null;
  const shape = pickShape(REWARD_SHAPES, ['reward', ...parts]);
  return shape(joinNatural(parts));
};

/**
 * Compose one seeded sentence for found site loot (gold/items, no XP framing).
 * Returns null when there is nothing to announce.
 * @param {{ gold?: number, items?: string[] }} loot
 */
export const composeLootSentence = (loot) => {
  const parts = buildParts({ gold: loot?.gold, items: loot?.items });
  if (parts.length === 0) return null;
  const shape = pickShape(LOOT_SHAPES, ['loot', ...parts]);
  return shape(joinNatural(parts));
};

// Machine-message patterns produced by encounterController's reward helpers.
const XP_PARTY_RE = /^\+(\d+) XP to each party member$/;
const XP_RE = /^\+(\d+) XP$/;
const GOLD_RE = /^\+(\d+) gold$/;
const FOUND_RE = /^Found: (.+)$/;

/**
 * Turn a machine-formatted rewardMessages array (from applyPartyRewardsToAll and
 * friends) into display prose: the recognised flat entries ("+100 XP to each
 * party member", "+30 gold", "Found: Quest Key") collapse into ONE seeded
 * sentence; everything else (level-ups, healing) passes through unchanged, in
 * order, after it. The input array is never mutated, and unrecognisable input
 * comes back as-is, so this is safe to wrap around any reward line.
 * @param {string[]} messages
 * @returns {string[]}
 */
export const narrateRewardMessages = (messages = []) => {
  let xp = 0;
  let gold = 0;
  let xpPartyWide = false;
  const items = [];
  const passthrough = [];
  let recognised = false;

  for (const msg of messages) {
    let m;
    if ((m = XP_PARTY_RE.exec(msg))) {
      xp += parseInt(m[1], 10);
      xpPartyWide = true;
      recognised = true;
    } else if ((m = XP_RE.exec(msg))) {
      xp += parseInt(m[1], 10);
      recognised = true;
    } else if ((m = GOLD_RE.exec(msg))) {
      gold += parseInt(m[1], 10);
      recognised = true;
    } else if ((m = FOUND_RE.exec(msg))) {
      items.push(...m[1].split(', ').filter(Boolean));
      recognised = true;
    } else {
      passthrough.push(msg);
    }
  }

  if (!recognised) return [...messages];
  const sentence = composeRewardSentence({ xp, gold, items, xpPartyWide });
  return sentence ? [sentence, ...passthrough] : passthrough;
};

export const rewardNarrator = { composeRewardSentence, composeLootSentence, narrateRewardMessages };
