// RagCompare (debug): the before/after recall logic, with fake embeddings. A vector is
// [has "bell", has "wolf", 1], so similarity follows those keywords.

import { buildMemoryIndex, recallBoth, formatOld } from './RagCompare';

const vec = (t) => [/bell/i.test(t) ? 1 : 0, /wolf/i.test(t) ? 1 : 0, 0.2];
const embed = async (texts) => texts.map(vec);
const filler = 'The road was long and the rain did not stop. '.repeat(14); // > 600 chars: splits

describe('RagCompare recall', () => {
  it('old way cuts a long message at 300 characters; #175 injects the matching chunk whole', async () => {
    const messages = [`${filler}\n\nThe smith says the goblins fear the silver bell in the chapel.`, 'Wolves circle the camp at dusk.'];
    const idx = await buildMemoryIndex(messages, embed);
    expect(idx.whole).toHaveLength(2);
    expect(idx.chunks.length).toBeGreaterThan(2); // the long message split
    const r = recallBoth(idx, vec('bell'));
    expect(r.before[0].msgIndex).toBe(0);
    expect(r.beforeBlock).not.toMatch(/silver bell/); // past the 300-character cut
    expect(r.after[0]).toMatchObject({ msgIndex: 0 });
    expect(r.afterBlock).toMatch(/silver bell in the chapel/);
  });

  it('keeps only the best chunk per message and drops weak matches', async () => {
    const messages = ['A bell rang.\n\nAnother bell answered.', 'Nothing here.'];
    const idx = await buildMemoryIndex(messages, embed);
    const r = recallBoth(idx, vec('bell'));
    expect(r.after.filter((x) => x.msgIndex === 0)).toHaveLength(1);
    expect(r.after.some((x) => x.msgIndex === 1)).toBe(false);
  });

  it('formats nothing when nothing is recalled', () => {
    expect(formatOld([])).toBe('');
  });
});
