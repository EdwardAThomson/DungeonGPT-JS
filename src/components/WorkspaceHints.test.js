import { pickHint } from './WorkspaceHints';

describe('WorkspaceHints.pickHint', () => {
  const state = { started: true, level: 'world', suggestions: 2, sideSuggestions: 1 };

  it('explains side quests once suggestions have been introduced', () => {
    // The general suggestions tip comes first; the side-quest tip follows it.
    expect(pickHint(state, ['ws-move'])?.id).toBe('ws-suggest');
    expect(pickHint(state, ['ws-move', 'ws-suggest'])?.id).toBe('ws-side');
  });

  it('waits until a side-quest chip is actually showing', () => {
    expect(pickHint({ ...state, sideSuggestions: 0 }, ['ws-move', 'ws-suggest'])?.id).not.toBe('ws-side');
  });
});
