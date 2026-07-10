// prologueComposer.js
// Deterministic chapter-divider prologue for in-save campaign continuation
// ("Continue your legend"). The next campaign begins INSIDE the same save — same
// world, same journal — so no "story so far" recap is needed: the journal above
// this message IS the story. This just marks the chapter break and opens the new
// campaign. Sibling of introComposer.js and localNarrator.js, and follows their
// conventions:
//   - Markdown uses *italics* and **bold** only (SafeMarkdownMessage supports `*`).
//   - Fully deterministic: same inputs, byte-identical prose. No Math.random(),
//     no Date.now(), no AI call.

// A fresh chapter opens with the party rested, healed, and levelled (the standing
// "everything, healed" continuation rule), so the roster line names heroes ONLY,
// never combat-status tags like [badly wounded] or [DEFEATED]. We deliberately do
// NOT reuse formatPartyInfo (which annotates HP for in-play prompts): this prologue
// is composed from the party BEFORE the new-campaign heal lands in React state, and
// a new adventure never opens describing heroes as wounded or downed.
const formatHealedRoster = (party = []) =>
  (party || [])
    .map((hero) => {
      const name = hero?.heroName || hero?.characterName || 'Unknown';
      const charClass = hero?.heroClass || hero?.characterClass || '';
      return charClass ? `${name} (${charClass})` : name;
    })
    .filter(Boolean)
    .join(', ');

/**
 * Compose the Chapter-n divider appended to the ONGOING conversation when the
 * player continues the next campaign in the same save.
 *
 * @param {object} args
 * @param {object} [args.spec] - the NEW campaign's launch spec (specFromTemplate)
 * @param {number} [args.chapter] - chapter number of the new campaign (2, 3, ...)
 * @param {Array}  [args.party] - the party (already healed)
 * @returns {string} deterministic markdown prologue
 */
export const composeChapterPrologue = ({ spec = {}, chapter = 2, party = [] } = {}) => {
  const partyLine = formatHealedRoster(party) || 'The party';
  // "Heroic Fantasy — Crown of Sunfire" -> "Crown of Sunfire" for the header.
  const label = spec.templateName || '';
  const title = label.includes('—') ? label.split('—').pop().trim() : label;

  const lines = [];
  lines.push(`**Chapter ${chapter}${title ? `: ${title}` : ''}**`);

  lines.push(
    `Their last deeds done, ${partyLine} rest, resupply, and take to familiar roads once more; new trouble stirs in these same lands.`
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
