#!/usr/bin/env node

// CF Worker conversation rev-protocol smoke test (SAVE_SYNC_PLAN section 6,
// Phase 3 / backlog #54). Documented, NOT auto-run: it needs a live worker with
// a reachable Postgres carrying migration 003 (the `rev` column).
//
// Hits a locally running `wrangler dev` instance (cf-worker/) and checks the
// guarded-upsert contract on POST /api/db/conversations:
//   1. fresh save (no expectedRev)        -> 201, row rev = 1
//   2. save with matching expectedRev     -> 201, rev bumped to 2 (fast-forward)
//   3. save with a STALE expectedRev      -> 409 { code:'rev_conflict', rev, updated_at }
//   4. save with NO expectedRev on an existing row (legacy client)
//                                         -> 201, unconditional, rev still bumps
//   5. GET by id returns the row with its current rev
//   6. cleanup: DELETE the scratch conversation
//
// Auth: the /api/db group is authed. Provide SUPABASE_ACCESS_TOKEN, or run the
// worker with ALLOW_UNAUTHENTICATED_DEV=true in .dev.vars (local only).
//
// Usage:
//   cd cf-worker && npx wrangler dev          # in one terminal
//   node scripts/test-cf-rev.mjs              # in another
//   SUPABASE_ACCESS_TOKEN=<jwt> node scripts/test-cf-rev.mjs
//
// Style follows scripts/test-cf-entitlements.mjs.

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getCfWorkerUrl() {
  try {
    const envPath = resolve(__dirname, '../.env.local');
    const envContent = readFileSync(envPath, 'utf-8');
    const match = envContent.match(/REACT_APP_CF_WORKER_URL=(.+)/);
    if (match) {
      return match[1].trim().replace('https://localhost', 'http://localhost');
    }
  } catch {
    // Fall back to localhost default.
  }
  return 'http://localhost:8787';
}

function parseArgs(argv) {
  const args = {
    workerUrl: getCfWorkerUrl(),
  };

  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--worker-url=')) {
      args.workerUrl = arg.slice('--worker-url='.length);
    } else if (arg === '--help') {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
CF Worker conversation rev-protocol smoke test

Usage:
  node scripts/test-cf-rev.mjs [flags]

Flags:
  --worker-url=<url>        Worker base URL (default from .env.local)

Environment:
  SUPABASE_ACCESS_TOKEN     Bearer token (or run the worker with
                            ALLOW_UNAUTHENTICATED_DEV=true)
`);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { response, body };
}

function printResult(name, ok, detail) {
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${name}${detail ? ` - ${detail}` : ''}`);
}

async function main() {
  const args = parseArgs(process.argv);
  const token = process.env.SUPABASE_ACCESS_TOKEN || null;
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const base = `${args.workerUrl}/api/db/conversations`;
  const sessionId = `rev-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const payload = (marker, extra = {}) => ({
    sessionId,
    conversationName: `Rev smoke test (${marker})`,
    conversation: [{ role: 'system', content: `rev protocol smoke: ${marker}` }],
    timestamp: new Date().toISOString(),
    ...extra,
  });

  let failed = false;
  const check = (name, ok, detail) => {
    printResult(name, ok, detail);
    if (!ok) failed = true;
  };

  const health = await fetchJson(`${args.workerUrl}/health`);
  check('GET /health', health.response.ok, `HTTP ${health.response.status}`);
  if (!health.response.ok) process.exit(1);

  try {
    // 1. Fresh save: INSERT arm starts the lineage at rev 1.
    const fresh = await fetchJson(base, { method: 'POST', headers, body: JSON.stringify(payload('fresh')) });
    check('fresh save (no expectedRev) -> 201 rev 1',
      fresh.response.status === 201 && fresh.body?.rev === 1,
      `HTTP ${fresh.response.status}, rev=${JSON.stringify(fresh.body?.rev)}`);

    // 2. Fast-forward: expectedRev matches the current rev, guard passes, rev bumps.
    const ff = await fetchJson(base, {
      method: 'POST', headers, body: JSON.stringify(payload('fast-forward', { expectedRev: 1 })),
    });
    check('guarded save (expectedRev=1) -> 201 rev 2',
      ff.response.status === 201 && ff.body?.rev === 2,
      `HTTP ${ff.response.status}, rev=${JSON.stringify(ff.body?.rev)}`);

    // 3. Fork detection: a STALE expectedRev misses the guard, nothing is written,
    // and the 409 body carries the CURRENT rev + updated_at (the client contract).
    const stale = await fetchJson(base, {
      method: 'POST', headers, body: JSON.stringify(payload('stale', { expectedRev: 1 })),
    });
    check('stale save (expectedRev=1 vs rev 2) -> 409 rev_conflict',
      stale.response.status === 409 && stale.body?.code === 'rev_conflict',
      `HTTP ${stale.response.status}, code=${JSON.stringify(stale.body?.code)}`);
    check('409 body carries current rev + updated_at',
      stale.body?.rev === 2 && typeof stale.body?.updated_at === 'string',
      `rev=${JSON.stringify(stale.body?.rev)}, updated_at=${JSON.stringify(stale.body?.updated_at)}`);

    // The stale write must not have advanced the row.
    const afterStale = await fetchJson(`${base}/${sessionId}`, { headers });
    check('stale save wrote nothing (GET still rev 2, fast-forward content)',
      afterStale.body?.rev === 2 && afterStale.body?.conversation_name === 'Rev smoke test (fast-forward)',
      `rev=${JSON.stringify(afterStale.body?.rev)}, name=${JSON.stringify(afterStale.body?.conversation_name)}`);

    // 4. Legacy client: no expectedRev on an existing row stays unconditional
    // (last write wins, as before Phase 3) but the lineage keeps counting.
    const legacy = await fetchJson(base, { method: 'POST', headers, body: JSON.stringify(payload('legacy')) });
    check('legacy save (no expectedRev, row exists) -> 201 rev 3',
      legacy.response.status === 201 && legacy.body?.rev === 3,
      `HTTP ${legacy.response.status}, rev=${JSON.stringify(legacy.body?.rev)}`);

    // 5. Reads expose rev so clients can record base_rev.
    const got = await fetchJson(`${base}/${sessionId}`, { headers });
    check('GET by id includes rev', got.response.ok && got.body?.rev === 3,
      `HTTP ${got.response.status}, rev=${JSON.stringify(got.body?.rev)}`);
  } finally {
    // 6. Cleanup the scratch row regardless of outcome.
    const del = await fetchJson(`${base}/${sessionId}`, { method: 'DELETE', headers });
    printResult('cleanup DELETE', del.response.ok, `HTTP ${del.response.status}`);
  }

  if (failed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[FAIL] Unhandled error:', error instanceof Error ? error.message : error);
  process.exit(1);
});
