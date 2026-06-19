const fs = require('fs');
const path = require('path');

const tmpDir = path.join(__dirname, '__tmp__');
const dbPath = path.join(tmpDir, `llm-validate-${process.pid}.db`);

const closeDb = (db) =>
  new Promise((resolve, reject) => db.close((err) => (err ? reject(err) : resolve())));

describe('validateLlmTaskPayload', () => {
  let validateLlmTaskPayload;
  let MAX_CLI_PROMPT_LENGTH;
  let db;

  beforeAll(() => {
    // Requiring server.js opens a SQLite db; point it at a throwaway file.
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    process.env.SQLITE_DB_PATH = dbPath;
    // Silence the async SQLite table-creation logs so they can't fire after teardown.
    process.env.LOG_LEVEL = 'silent';
    jest.resetModules();
    ({ validateLlmTaskPayload, MAX_CLI_PROMPT_LENGTH, db } = require('../server'));
  });

  // Closing the db flushes the async table-creation statements before teardown.
  afterAll(async () => {
    await closeDb(db);
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  test('accepts a well-formed payload', () => {
    expect(validateLlmTaskPayload({ backend: 'codex', prompt: 'do the thing', model: 'gpt-5' })).toEqual([]);
  });

  test('does not require or reject a cwd field (cwd is no longer client-controlled)', () => {
    expect(validateLlmTaskPayload({ backend: 'codex', prompt: 'hi', cwd: '/etc/evil' })).toEqual([]);
  });

  test('rejects an unknown backend', () => {
    const errors = validateLlmTaskPayload({ backend: 'bash', prompt: 'hi' });
    expect(errors.join(' ')).toMatch(/backend must be one of/);
  });

  test('rejects a missing prompt', () => {
    const errors = validateLlmTaskPayload({ backend: 'codex' });
    expect(errors.join(' ')).toMatch(/prompt is required/);
  });

  test('rejects a prompt over the length cap', () => {
    const errors = validateLlmTaskPayload({ backend: 'codex', prompt: 'x'.repeat(MAX_CLI_PROMPT_LENGTH + 1) });
    expect(errors.join(' ')).toMatch(/at most .* characters/);
  });

  test('accepts a prompt exactly at the length cap', () => {
    expect(validateLlmTaskPayload({ backend: 'codex', prompt: 'x'.repeat(MAX_CLI_PROMPT_LENGTH) })).toEqual([]);
  });

  test('rejects a non-string model', () => {
    const errors = validateLlmTaskPayload({ backend: 'codex', prompt: 'hi', model: 123 });
    expect(errors.join(' ')).toMatch(/model must be/);
  });
});
