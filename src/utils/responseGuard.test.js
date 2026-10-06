import { detectNarrationProblem } from './responseGuard';
import { DM_PROTOCOL } from '../data/prompts';

describe('detectNarrationProblem', () => {
  // The live-game leak (2026-10-06): Look around after a fight restated the protocol, then looped.
  const LEAK =
    'You are a Dungeon master for a tabletop RPG. You must ALWAYS stay in character. ' +
    '1. NEVER output internal reasoning, plans, or " agentic thoughts (e.g ( e.g., " ' +
    'I will examine any item found in the environment. ' +
    'NEVER '.repeat(40);

  test('flags the live-game leak', () => {
    expect(detectNarrationProblem(LEAK)).toBe('prompt_echo');
  });

  test('flags any verbatim echo of the protocol', () => {
    expect(detectNarrationProblem(DM_PROTOCOL)).toBe('prompt_echo');
  });

  test('flags a single-word loop without any protocol text', () => {
    expect(detectNarrationProblem('The boar falls. ' + 'NEVER NEVER NEVER\n'.repeat(10))).toBe('repetition');
  });

  test('flags a repeated phrase loop', () => {
    expect(detectNarrationProblem('You look around. ' + 'the dark the dark the dark '.repeat(5))).toBe('repetition');
  });

  test.each([
    ['ordinary narration', 'The clearing is quiet. Broken tusks lie in the trampled grass. What do you do?'],
    ['short emphatic dialogue', '"No, no, no, no!" the miller cries. "Not the mill!"'],
    ['a run of numbers', 'Rolls: 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1'],
    ['a dungeon master in the fiction', 'The dungeon master of the keep, a stooped jailer, eyes you warily.'],
    ['empty text', ''],
  ])('passes %s', (_name, text) => {
    expect(detectNarrationProblem(text)).toBeNull();
  });
});
