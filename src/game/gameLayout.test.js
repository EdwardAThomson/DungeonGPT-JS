import { resolveGameLayout, getStoredLayout, setStoredLayout, DEFAULT_GAME_LAYOUT } from './gameLayout';

beforeEach(() => localStorage.clear());

describe('resolveGameLayout', () => {
  it('defaults to the workspace', () => {
    expect(DEFAULT_GAME_LAYOUT).toBe('workspace');
    expect(resolveGameLayout('')).toBe('workspace');
  });

  it('?layout=classic switches and is remembered for later visits', () => {
    expect(resolveGameLayout('?layout=classic')).toBe('classic');
    expect(getStoredLayout()).toBe('classic');
    expect(resolveGameLayout('')).toBe('classic');
    expect(resolveGameLayout('?layout=workspace')).toBe('workspace');
    expect(resolveGameLayout('')).toBe('workspace');
  });

  it('ignores unknown values', () => {
    setStoredLayout('classic');
    expect(resolveGameLayout('?layout=banana')).toBe('classic');
    setStoredLayout('banana');
    expect(getStoredLayout()).toBe('classic');
  });

  it('falls back to the default when storage throws', () => {
    const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(resolveGameLayout('')).toBe('workspace');
    spy.mockRestore();
  });
});

describe('guided tour steps per layout', () => {
  const { visibleTourSteps } = require('../contexts/GuidedTourContext');
  it('the classic map step is dropped in the workspace, and nothing else', () => {
    const classic = visibleTourSteps('classic').map((s) => s.id);
    const workspace = visibleTourSteps('workspace').map((s) => s.id);
    expect(classic).toContain('open-map');
    expect(workspace).not.toContain('open-map');
    expect(workspace).toEqual(classic.filter((id) => id !== 'open-map'));
    // The classic-only step is the last one, so earlier step indices line up in both.
    expect(classic[classic.length - 1]).toBe('open-map');
  });
});
