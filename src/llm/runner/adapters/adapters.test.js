const { getAdapter } = require('./index');

describe('CLI adapter buildCommand', () => {
  describe('codex', () => {
    test('places a -- terminator before the positional prompt', () => {
      const inv = getAdapter('codex').buildCommand({ prompt: '--help me', cwd: '/work' });
      const dashIdx = inv.args.indexOf('--');
      expect(dashIdx).toBeGreaterThan(-1);
      // The prompt must follow the terminator and be the final argument, so a
      // prompt starting with - / -- cannot be parsed as a CLI flag.
      expect(inv.args[dashIdx + 1]).toBe('--help me');
      expect(inv.args[inv.args.length - 1]).toBe('--help me');
    });

    test('retains exec flags and -C cwd', () => {
      const inv = getAdapter('codex').buildCommand({ prompt: 'hi', cwd: '/work' });
      expect(inv.command).toBe('codex');
      expect(inv.args).toEqual(
        expect.arrayContaining(['exec', '--full-auto', '--skip-git-repo-check', '-C', '/work'])
      );
    });
  });

  test('claude builds -p prompt with model and stream-json output', () => {
    const inv = getAdapter('claude').buildCommand({ prompt: 'hello', model: 'opus' });
    expect(inv.command).toBe('claude');
    expect(inv.args).toEqual(['-p', 'hello', '--model', 'opus', '--output-format', 'stream-json']);
    expect(inv.responseFormat).toBe('json-stream');
  });

  test('gemini runs from the sandbox cwd and defaults the model', () => {
    const inv = getAdapter('gemini').buildCommand({ prompt: 'hello' });
    expect(inv.command).toBe('gemini');
    expect(inv.cwd).toContain('.gemini-sandbox');
    expect(inv.args).toContain('-p');
    expect(inv.args).toContain('hello');
  });

  test('aliases resolve and unknown backends do not', () => {
    expect(getAdapter('claude-cli')).toBeDefined();
    expect(getAdapter('gemini-cli')).toBeDefined();
    expect(getAdapter('nope')).toBeUndefined();
  });
});
