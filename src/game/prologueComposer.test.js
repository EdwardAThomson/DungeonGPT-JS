import { composePrologue, truncateSummaryText, SUMMARY_MAX_CHARS } from './prologueComposer';

const baseArgs = () => ({
  previousSummary: 'The party found the map fragment in Willowdale. They met Captain Ulric in Briarwood. They stormed the Goblin Hideout and slew the Goblin Chieftain.',
  previousSettings: {
    templateName: 'Heroic Fantasy — The Goblin Threat',
    campaignGoal: 'End the goblin threat',
  },
  party: [
    { heroName: 'Vanya', characterClass: 'Warrior', currentHP: 24, maxHP: 24 },
    { heroName: 'Orin', characterClass: 'Mage', currentHP: 14, maxHP: 14 },
  ],
  spec: {
    shortDescription: 'The kingdom of Eldoria calls for heroes.',
    campaignGoal: 'Recover the Crown of Sunfire',
    milestones: [{ text: 'Find the hidden map in the Great Archives at Oakhaven' }],
  },
  chapter: 2,
});

describe('composePrologue', () => {
  it('is deterministic: same inputs produce byte-identical prose', () => {
    expect(composePrologue(baseArgs())).toBe(composePrologue(baseArgs()));
  });

  it('carries the distilled previous story, the party and the new campaign intro', () => {
    const text = composePrologue(baseArgs());
    expect(text).toContain('**Chapter 2**');
    expect(text).toContain('**The story so far:**');
    expect(text).toContain('Goblin Chieftain');
    expect(text).toContain('Vanya (Warrior)');
    expect(text).toContain('*Heroic Fantasy — The Goblin Threat*');
    expect(text).toContain('The kingdom of Eldoria calls for heroes.');
    expect(text).toContain('**Goal:** Recover the Crown of Sunfire');
    expect(text).toContain('**First steps:** Find the hidden map');
  });

  it('omits the story-so-far line when the old save has no summary', () => {
    const text = composePrologue({ ...baseArgs(), previousSummary: '' });
    expect(text).not.toContain('The story so far');
    expect(text).toContain('**Chapter 2**');
  });

  it('tolerates missing everything (old/partial saves)', () => {
    const text = composePrologue({});
    expect(typeof text).toBe('string');
    expect(text).toContain('**Chapter 2**');
    expect(text).toContain('their last adventure');
  });

  it('never leaks prompt markers', () => {
    const text = composePrologue(baseArgs());
    expect(text).not.toMatch(/\[TASK\]|\[STRICT|COMPLETE_MILESTONE|COMPLETE_CAMPAIGN/);
  });
});

describe('truncateSummaryText', () => {
  it('returns short summaries unchanged (whitespace collapsed)', () => {
    expect(truncateSummaryText('A short  tale.\nIndeed.')).toBe('A short tale. Indeed.');
  });

  it('truncates long summaries at a sentence boundary within the budget', () => {
    const sentence = 'The heroes marched onward through the vale. ';
    const long = sentence.repeat(40); // ~1800 chars
    const out = truncateSummaryText(long);
    expect(out.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS);
    expect(out.endsWith('.')).toBe(true);
    // deterministic
    expect(truncateSummaryText(long)).toBe(out);
  });

  it('falls back to a word boundary with an ellipsis for one giant sentence', () => {
    const long = `The heroes ${'walked and '.repeat(200)}rested`;
    const out = truncateSummaryText(long);
    expect(out.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS + 1);
    expect(out.endsWith('…')).toBe(true);
  });
});
