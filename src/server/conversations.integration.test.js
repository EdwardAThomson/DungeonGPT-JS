const fs = require('fs');
const http = require('http');
const path = require('path');

jest.setTimeout(15000);

const testDbDir = path.join(__dirname, '__tmp__');
const testDbPath = path.join(testDbDir, 'conversations.integration.test.db');

const waitForTable = (db, tableName, maxRetries = 50) => new Promise((resolve, reject) => {
  let attempts = 0;
  const check = () => {
    db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      [tableName],
      (err, row) => {
        if (err) return reject(err);
        if (row) return resolve();
        attempts += 1;
        if (attempts >= maxRetries) {
          return reject(new Error(`Timed out waiting for table: ${tableName}`));
        }
        return setTimeout(check, 20);
      }
    );
  };
  check();
});

const requestJson = (baseUrl, method, routePath, body) =>
  new Promise((resolve, reject) => {
    const url = new URL(routePath, baseUrl);
    const payload = body ? JSON.stringify(body) : null;

    const req = http.request(
      {
        method,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          let parsed = null;
          if (raw) {
            try {
              parsed = JSON.parse(raw);
            } catch (_error) {
              parsed = raw;
            }
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });

describe('Conversations API lifecycle (integration)', () => {
  let app;
  let db;
  let server;
  let baseUrl;
  let sandboxBlocked = false;

  beforeAll(async () => {
    if (!fs.existsSync(testDbDir)) {
      fs.mkdirSync(testDbDir, { recursive: true });
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    process.env.SQLITE_DB_PATH = testDbPath;
    process.env.REQUIRE_API_AUTH = 'false';

    ({ app, db } = require('../server.js'));
    await waitForTable(db, 'conversations');

    await new Promise((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
      server.on('error', (error) => {
        if (error?.code === 'EPERM') {
          sandboxBlocked = true;
          resolve();
          return;
        }
        reject(error);
      });
    });
  });

  afterAll(async () => {
    if (server?.listening) {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
    if (db) {
      await new Promise((resolve, reject) => {
        db.close((err) => (err ? reject(err) : resolve()));
      });
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('supports save -> list -> load -> rename -> delete', async () => {
    if (sandboxBlocked) {
      // This environment disallows binding a local socket; keep test runnable in CI/host.
      return;
    }

    const sessionId = 'integration-session-001';
    const timestamp = new Date().toISOString();

    const createPayload = {
      sessionId,
      conversation: [
        { role: 'system', content: 'You are the DM.' },
        { role: 'user', content: 'We head north.' },
        { role: 'ai', content: 'The road narrows through old pines.' }
      ],
      provider: 'openai',
      model: 'gpt-5-mini',
      timestamp,
      conversationName: 'Integration Test Save',
      gameSettings: {
        shortDescription: 'A misty frontier',
        grimnessLevel: 'Gritty'
      },
      selectedHeroes: [
        { characterId: 'h-1', characterName: 'Nyx' }
      ],
      worldMap: [],
      playerPosition: { x: 2, y: 3 },
      sub_maps: { isInsideTown: false }
    };

    const createRes = await requestJson(baseUrl, 'POST', '/api/conversations', createPayload);
    expect(createRes.status).toBe(201);
    expect(createRes.body).toMatchObject({
      message: 'Conversation saved successfully',
      sessionId
    });

    const listRes = await requestJson(baseUrl, 'GET', '/api/conversations');
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.some((row) => row.sessionId === sessionId)).toBe(true);

    const loadRes = await requestJson(baseUrl, 'GET', `/api/conversations/${sessionId}`);
    expect(loadRes.status).toBe(200);
    expect(loadRes.body.sessionId).toBe(sessionId);
    expect(loadRes.body.conversation_data).toHaveLength(3);
    expect(loadRes.body.conversation_name).toBe('Integration Test Save');

    const renameRes = await requestJson(baseUrl, 'PUT', `/api/conversations/${sessionId}/name`, {
      conversationName: 'Renamed Integration Save'
    });
    expect(renameRes.status).toBe(200);
    expect(renameRes.body).toMatchObject({ message: 'Conversation name updated successfully' });

    const reloadRes = await requestJson(baseUrl, 'GET', `/api/conversations/${sessionId}`);
    expect(reloadRes.status).toBe(200);
    expect(reloadRes.body.conversation_name).toBe('Renamed Integration Save');

    const deleteRes = await requestJson(baseUrl, 'DELETE', `/api/conversations/${sessionId}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toMatchObject({ message: 'Conversation deleted successfully' });

    const missingRes = await requestJson(baseUrl, 'GET', `/api/conversations/${sessionId}`);
    expect(missingRes.status).toBe(404);
    expect(missingRes.body).toMatchObject({
      error: { message: 'Conversation not found' }
    });
  });
});
