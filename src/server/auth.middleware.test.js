const fs = require('fs');
const path = require('path');

const tmpDir = path.join(__dirname, '__tmp__');

const closeDb = (db) =>
  new Promise((resolve, reject) => {
    db.close((err) => (err ? reject(err) : resolve()));
  });

const loadServer = (env) => {
  const dbPath = path.join(tmpDir, `auth-${Date.now()}-${Math.random()}.db`);
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  process.env.REQUIRE_API_AUTH = env.REQUIRE_API_AUTH;
  process.env.API_AUTH_TOKEN = env.API_AUTH_TOKEN;
  process.env.SQLITE_DB_PATH = dbPath;

  jest.resetModules();
  const mod = require('../server');
  return { ...mod, dbPath };
};

const createRes = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
  return res;
};

describe('requireApiAuthMiddleware', () => {
  afterEach(() => {
    delete process.env.REQUIRE_API_AUTH;
    delete process.env.API_AUTH_TOKEN;
    delete process.env.SQLITE_DB_PATH;
  });

  it('allows request when auth is disabled', async () => {
    const { db, dbPath, requireApiAuthMiddleware } = loadServer({
      REQUIRE_API_AUTH: 'false',
      API_AUTH_TOKEN: ''
    });

    const req = { get: jest.fn().mockReturnValue(undefined) };
    const res = createRes();
    const next = jest.fn();

    requireApiAuthMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();

    await closeDb(db);
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('rejects request when auth is enabled and token is missing', async () => {
    const { db, dbPath, requireApiAuthMiddleware } = loadServer({
      REQUIRE_API_AUTH: 'true',
      API_AUTH_TOKEN: 'secret-token'
    });

    const req = { get: jest.fn().mockReturnValue(undefined) };
    const res = createRes();
    const next = jest.fn();

    requireApiAuthMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: { message: 'Unauthorized' } });

    await closeDb(db);
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('accepts valid bearer token and valid x-api-token header', async () => {
    const { db, dbPath, requireApiAuthMiddleware } = loadServer({
      REQUIRE_API_AUTH: 'true',
      API_AUTH_TOKEN: 'secret-token'
    });

    const nextA = jest.fn();
    requireApiAuthMiddleware(
      {
        get: (name) => (name.toLowerCase() === 'authorization' ? 'Bearer secret-token' : undefined)
      },
      createRes(),
      nextA
    );
    expect(nextA).toHaveBeenCalledTimes(1);

    const nextB = jest.fn();
    requireApiAuthMiddleware(
      {
        get: (name) => (name.toLowerCase() === 'x-api-token' ? 'secret-token' : undefined)
      },
      createRes(),
      nextB
    );
    expect(nextB).toHaveBeenCalledTimes(1);

    await closeDb(db);
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('returns 500 if auth is enabled but API_AUTH_TOKEN is not configured', async () => {
    const { db, dbPath, requireApiAuthMiddleware } = loadServer({
      REQUIRE_API_AUTH: 'true',
      API_AUTH_TOKEN: ''
    });

    const req = { get: jest.fn().mockReturnValue(undefined) };
    const res = createRes();
    const next = jest.fn();

    requireApiAuthMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { message: 'Server auth is enabled but API_AUTH_TOKEN is missing.' }
    });

    await closeDb(db);
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });
});
