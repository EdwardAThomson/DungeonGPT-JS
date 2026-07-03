// Tests for the local premium-template MERGE MECHANISM only (storyTemplates.js).
// The premium CONTENT itself lives in the private content repo and is never seen
// by Jest: require.context does not exist under Jest, so the merge is skipped and
// every suite (structural tests, progression lint) runs against public data only.
// These tests exercise mergeLocalTemplates with a mocked local-module shape.

import { storyTemplates, mergeLocalTemplates } from './storyTemplates';
import { premiumTemplates as exampleTemplates } from './premiumTemplates.local.example';

describe('premium local-template merge mechanism', () => {
  const makeBase = () => [
    { id: 'public-t1', tier: 1, name: 'Public Adventure' },
    { id: 'stub-t3', tier: 3, name: 'Stub', comingSoon: true }
  ];

  it('an entry with a matching id REPLACES the public stub (comingSoon card turns playable)', () => {
    const base = makeBase();
    const local = { id: 'stub-t3', tier: 3, name: 'Full Campaign', premium: true, comingSoon: false, settings: { milestones: [{ id: 1 }] } };
    mergeLocalTemplates(base, [local]);
    expect(base).toHaveLength(2);
    expect(base[1]).toBe(local);
    expect(base[1].comingSoon).toBe(false);
    expect(base[1].settings.milestones).toHaveLength(1);
  });

  it('an entry with a new id is APPENDED', () => {
    const base = makeBase();
    mergeLocalTemplates(base, [{ id: 'brand-new-t3', tier: 3 }]);
    expect(base).toHaveLength(3);
    expect(base[2].id).toBe('brand-new-t3');
  });

  it('mutates the given array in place and returns it (consumers keep one shared reference)', () => {
    const base = makeBase();
    expect(mergeLocalTemplates(base, [{ id: 'x' }])).toBe(base);
  });

  it('tolerates a missing/empty/malformed local export', () => {
    const base = makeBase();
    mergeLocalTemplates(base, undefined);
    mergeLocalTemplates(base, []);
    mergeLocalTemplates(base, [null, {}, { name: 'no id' }]);
    expect(base).toEqual(makeBase());
  });

  it('under Jest the merge never runs: storyTemplates is public data, the t3 stub stays comingSoon', () => {
    // require.context is a webpack-only API; its absence here is exactly what keeps
    // the progression lint and structural tests pinned to PUBLIC content.
    expect(typeof require.context).not.toBe('function');
    const t3 = storyTemplates.find((t) => t.id === 'heroic-fantasy-t3');
    expect(t3).toBeDefined();
    expect(t3.comingSoon).toBe(true);
    expect(t3.settings).toBeUndefined();
  });

  it('the tracked example file exports the documented shape (an empty array by default)', () => {
    expect(Array.isArray(exampleTemplates)).toBe(true);
    expect(exampleTemplates).toHaveLength(0);
  });
});
