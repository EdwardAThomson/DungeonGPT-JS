/**
 * @jest-environment node
 */
const { EventEmitter } = require('events');

jest.mock('child_process', () => ({ spawn: jest.fn() }));

function makeFakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn();
  return child;
}

// Let the setImmediate(() => runTask(...)) callback fire.
const flush = () => new Promise((resolve) => setImmediate(resolve));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('llm runner', () => {
  let runner;
  let childProcess;
  let lastChild;

  beforeEach(() => {
    jest.resetModules();
    process.env.CLI_TASK_TIMEOUT_MS = '40';
    process.env.CLI_MAX_CONCURRENT_TASKS = '2';
    // Re-grab the mocked module after resetModules so it's the same instance runner.js uses.
    childProcess = require('child_process');
    childProcess.spawn.mockReset();
    childProcess.spawn.mockImplementation(() => {
      lastChild = makeFakeChild();
      return lastChild;
    });
    runner = require('./runner');
  });

  test('throws on an unknown backend', () => {
    expect(() => runner.createTask({ backend: 'nope', prompt: 'x' })).toThrow(/Unknown backend/);
    expect(childProcess.spawn).not.toHaveBeenCalled();
  });

  test('ignores client-supplied cwd and runs in process.cwd()', async () => {
    runner.createTask({ backend: 'codex', prompt: 'hi', cwd: '/etc/evil' });
    await flush();
    const opts = childProcess.spawn.mock.calls[0][2];
    expect(opts.cwd).toBe(process.cwd());
    expect(opts.cwd).not.toBe('/etc/evil');
  });

  test('passes an env allowlist, not the full server environment', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'super-secret';
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';
    runner.createTask({ backend: 'claude', prompt: 'hi' });
    await flush();
    const opts = childProcess.spawn.mock.calls[0][2];
    expect(opts.env.PATH).toBeDefined();
    expect(opts.env.ANTHROPIC_API_KEY).toBe('anthropic-key'); // allowlisted CLI auth
    expect(opts.env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined(); // server secret withheld
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  test('spawns with shell disabled', async () => {
    runner.createTask({ backend: 'codex', prompt: 'hi' });
    await flush();
    expect(childProcess.spawn.mock.calls[0][2].shell).toBe(false);
  });

  test('enforces the max concurrent task limit', () => {
    runner.createTask({ backend: 'codex', prompt: 'a' });
    runner.createTask({ backend: 'codex', prompt: 'b' });
    expect(() => runner.createTask({ backend: 'codex', prompt: 'c' })).toThrow(/concurrent/i);
  });

  test('kills a task that exceeds the timeout', async () => {
    runner.createTask({ backend: 'codex', prompt: 'slow' });
    await flush();
    expect(lastChild.kill).not.toHaveBeenCalled();
    await wait(150); // timeout is 40ms
    expect(lastChild.kill).toHaveBeenCalledWith('SIGKILL');
  });

  test('clears the timeout when a task completes normally', async () => {
    runner.createTask({ backend: 'codex', prompt: 'fast' });
    await flush();
    lastChild.emit('close', 0); // process exits before the timeout
    await wait(150);
    expect(lastChild.kill).not.toHaveBeenCalled();
  });
});
