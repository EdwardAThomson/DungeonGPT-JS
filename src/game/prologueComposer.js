// prologueComposer.js
// Deterministic local prologue for chained campaigns ("Continue your legend").
// Distills the previous save's rolling summary + the new campaign's intro into the
// opening message of the new chapter's conversation. Sibling of introComposer.js
// and localNarrator.js, and follows their conventions:
//   - Markdown uses *italics* and **bold** only (SafeMarkdownMessage supports `*`).
//   - Fully deterministic: same inputs, byte-identical prose. No Math.random(),
//     no Date.now(), no AI call. Signed-in players get AI narration organically on
//     their first action; guests keep this as their opening text.

import { formatPartyInfo } from './promptComposer';

export const SUMMARY_MAX_CHARS = 600;

// Truncate a rolling summary sensibly: collapse whitespace, then cut at the last
// sentence boundary inside the budget (falling back to a word boundary + ellipsis
// when the text is one giant sentence).
export const truncateSummaryText = (text, maxChars = SUMMARY_MAX_CHARS) => {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;
  const slice = clean.slice(0, maxChars);
  const lastSentenceEnd = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? ')
  );
  if (lastSentenceEnd > maxChars * 0.4) return slice.slice(0, lastSentenceEnd + 1);
  const lastSpace = slice.lastIndexOf(' ');
  return `${slice.slice(0, lastSpace > 0 ? lastSpace : maxChars).trimEnd()}…`;
};

/**
 * Compose the Chapter-n prologue for a chained save.
 *
 * @param {object} args
 * @param {string} [args.previousSummary] - the completed save's rolling summary
 * @param {object} [args.previousSettings] - the completed save's game_settings
 * @param {Array}  [args.party] - the carried party (already healed copies)
 * @param {object} [args.spec] - the NEW campaign's launch spec (specFromTemplate)
 * @param {number} [args.chapter] - chapter number of the NEW save (2, 3, ...)
 * @returns {string} deterministic markdown prologue
 */
export const composePrologue = ({
  previousSummary = '',
  previousSettings = {},
  party = [],
  spec = {},
  chapter = 2,
} = {}) => {
  const partyLine = formatPartyInfo(party) || 'The party';
  const prevName = previousSettings?.templateName
    || previousSettings?.campaignGoal
    || 'their last adventure';

  const lines = [];
  lines.push(`**Chapter ${chapter}**`);

  const distilled = truncateSummaryText(previousSummary);
  if (distilled) lines.push(`**The story so far:** ${distilled}`);

  lines.push(
    `With the deeds of *${prevName}* behind them, ${partyLine} rest, resupply, and set out for new lands, their legend travelling ahead of them.`
  );

  if (spec.shortDescription) lines.push(spec.shortDescription);
  if (spec.campaignGoal) lines.push(`**Goal:** ${spec.campaignGoal}`);

  const milestones = Array.isArray(spec.milestones) ? spec.milestones : [];
  const firstStep = milestones.length
    ? (typeof milestones[0] === 'object' ? milestones[0].text : milestones[0])
    : null;
  if (firstStep) lines.push(`**First steps:** ${firstStep}`);

  return lines.join('\n\n');
};
