#!/usr/bin/env node

// smoke-prod.mjs - post-deploy smoke test for the production Worker
// (dungeongpt-api). Backlog #21. Runs as the final step of
// .github/workflows/deploy-worker.yml and can be run locally any time; it is
// read-only, needs no credentials, and never generates AI text or touches
// player data.
//
// Checks:
//   1. GET /health                     -> 200 { status: "ok", service: "dungeongpt-api" }
//   2. GET /api/db/entitlements (no token) -> 401 { error: ... }  (auth wall up)
//   3. GET /api/db/conversations (no token) -> 401                (auth wall up)
//   4. GET /nope-<random>              -> 404 { error: "Not found" }
//   5. /health latency within SMOKE_TIME_BUDGET_MS (default 3000ms)
//
// Usage:
//   SMOKE_WORKER_URL=https://<worker-host> node scripts/ops/smoke-prod.mjs
//   SMOKE_WORKER_URL=http://localhost:8787 node scripts/ops/smoke-prod.mjs  # against wrangler dev
//
// Exit code: 0 all green, 1 any check failed, 2 misconfigured (no URL).

const BASE_URL = (process.env.SMOKE_WORKER_URL || process.env.PROD_WORKER_URL || '').replace(/\/+$/, '');
const TIME_BUDGET_MS = Number(process.env.SMOKE_TIME_BUDGET_MS || 3000);
const REQUEST_TIMEOUT_MS = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS || 10000);

if (!BASE_URL) {
  console.error('smoke-prod: set SMOKE_WORKER_URL (or PROD_WORKER_URL) to the Worker base URL.');
  console.error('  e.g. SMOKE_WORKER_URL=https://dungeongpt-api.<subdomain>.workers.dev node scripts/ops/smoke-prod.mjs');
  process.exit(2);
}

let failures = 0;

function pass(name, detail) {
  console.log(`  PASS  ${name}${detail ? ` (${detail})` : ''}`);
}

function fail(name, detail) {
  failures += 1;
  console.error(`  FAIL  ${name}: ${detail}`);
}

async function get(path) {
  const started = Date.now();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const ms = Date.now() - started;
  let body = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON body; individual checks decide whether that matters.
  }
  return { status: res.status, body, ms };
}

async function run() {
  console.log(`smoke-prod: ${BASE_URL}`);

  // 1 + 5. Health shape and latency budget.
  try {
    const { status, body, ms } = await get('/health');
    if (status === 200 && body && body.status === 'ok' && body.service === 'dungeongpt-api') {
      pass('health shape', `${ms}ms, env=${body.environment ?? '?'}`);
    } else {
      fail('health shape', `status=${status} body=${JSON.stringify(body)}`);
    }
    if (ms <= TIME_BUDGET_MS) {
      pass('health latency', `${ms}ms <= ${TIME_BUDGET_MS}ms budget`);
    } else {
      fail('health latency', `${ms}ms exceeds ${TIME_BUDGET_MS}ms budget`);
    }
  } catch (err) {
    fail('health reachable', err.message);
    fail('health latency', 'skipped, health unreachable');
  }

  // 2 + 3. The /api/db group must reject unauthenticated requests. If either
  // of these ever returns 200, the auth wall is down: treat as an incident.
  for (const path of ['/api/db/entitlements', '/api/db/conversations']) {
    try {
      const { status, body } = await get(path);
      if (status === 401 && body && typeof body.error === 'string') {
        pass(`auth wall ${path}`, '401 unauthenticated');
      } else {
        fail(`auth wall ${path}`, `expected 401 + {error}, got status=${status} body=${JSON.stringify(body)}`);
      }
    } catch (err) {
      fail(`auth wall ${path}`, err.message);
    }
  }

  // 4. Unknown routes return the Worker's JSON 404 (proves the Worker, not
  // some interposed error page, is answering).
  try {
    const probe = `/nope-${Math.random().toString(36).slice(2, 10)}`;
    const { status, body } = await get(probe);
    if (status === 404 && body && body.error === 'Not found') {
      pass('404 shape', probe);
    } else {
      fail('404 shape', `expected 404 {error:"Not found"}, got status=${status} body=${JSON.stringify(body)}`);
    }
  } catch (err) {
    fail('404 shape', err.message);
  }

  if (failures > 0) {
    console.error(`smoke-prod: ${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log('smoke-prod: all checks passed');
}

run().catch((err) => {
  console.error(`smoke-prod: unexpected error: ${err.stack || err}`);
  process.exit(1);
});
