// Rejects model output that must never reach a player: an echo of the DM protocol
// (the model narrating its own instructions) or a degenerate repetition loop
// ("NEVER NEVER NEVER ..." until max_tokens). Mirrored client-side in
// src/utils/responseGuard.js; keep the two in sync.

// Phrases that only appear in DM_PROTOCOL (src/data/prompts.js), never in narration.
const PROTOCOL_SIGNATURES = [
  "strict dungeon master protocol",
  "you are a dungeon master for a tabletop rpg",
  "never output internal reasoning",
  "do not repeat any part of this prompt",
  "never mention technical details, project structure",
  "never provide meta-commentary",
  "failure to follow this protocol",
  "outcomes are decided by the game, not by you",
  "skill checks (you propose, the game rolls)",
];

const MAX_NGRAM = 8;
// A phrase repeated back-to-back this many times is a loop, not prose.
const MIN_REPEATS = 6;
// ...and the loop must cover at least this many words (keeps "no, no, no" dialogue safe).
const MIN_LOOP_WORDS = 12;

const normalize = (text: string): string =>
  text.toLowerCase().replace(/["'“”‘’]/g, "").replace(/\s+/g, " ");

function hasProtocolEcho(text: string): boolean {
  const norm = normalize(text);
  return PROTOCOL_SIGNATURES.some((sig) => norm.includes(sig));
}

function hasRepetitionLoop(text: string): boolean {
  const words = text
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);

  for (let n = 1; n <= MAX_NGRAM; n++) {
    for (let start = 0; start + n * 2 <= words.length; start++) {
      let repeats = 1;
      let pos = start + n;
      while (pos + n <= words.length) {
        let same = true;
        for (let k = 0; k < n; k++) {
          if (words[pos + k] !== words[start + k]) {
            same = false;
            break;
          }
        }
        if (!same) break;
        repeats++;
        pos += n;
      }
      if (
        repeats >= MIN_REPEATS &&
        repeats * n >= MIN_LOOP_WORDS &&
        // Only loops of words count; a run of numbers (e.g. a stat array) is data.
        words.slice(start, start + n).some((w) => /\p{L}/u.test(w))
      ) {
        return true;
      }
    }
  }
  return false;
}

export type NarrationProblem = "prompt_echo" | "repetition";

export function detectNarrationProblem(text: string): NarrationProblem | null {
  if (!text) return null;
  if (hasProtocolEcho(text)) return "prompt_echo";
  if (hasRepetitionLoop(text)) return "repetition";
  return null;
}
