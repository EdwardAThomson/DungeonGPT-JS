#!/usr/bin/env node

// CF Worker entitlements smoke test (backlog #39).
//
// Hits a locally running `wrangler dev` instance (cf-worker/) and checks the
// GET /api/db/entitlements contract:
//   - without a token: 401 (the /api/db group is authed)
//   - with a token:    200 and { tier, updatedAt } where tier is on the ladder
//
// It does NOT start the worker for you and it never touches a database directly;
// the worker needs a reachable Postgres (see cf-worker/wrangler.toml for the local
// tunnel recipe) for the authed check to return 200.
//
// Usage:
//   cd cf-worker && npx wrangler dev          # in one terminal
//   node scripts/test-cf-entitlements.mjs     # in another
//   SUPABASE_ACCESS_TOKEN=<jwt> node scripts/test-cf-entitlements.mjs
//
// Style follows scripts/test-cf-worker-auth.mjs.

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TIER_LADDER = ['free', 'member', 'premium', 'elite'];

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
CF Worker entitlements smoke test

Usage:
  node scripts/test-cf-entitlements.mjs [flags]

Flags:
  --worker-url=<url>        Worker base URL (default from .env.local)

Environment:
  SUPABASE_ACCESS_TOKEN     Optional bearer token for the authenticated check
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

  let failed = false;

  const health = await fetchJson(`${args.workerUrl}/health`);
  const healthOk = health.response.ok;
  printResult('GET /health', healthOk, `HTTP ${health.response.status}`);
  if (!healthOk) failed = true;

  const unauth = await fetchJson(`${args.workerUrl}/api/db/entitlements`);
  const unauthOk = unauth.response.status === 401;
  printResult(
    'GET /api/db/entitlements without token',
    unauthOk,
    `expected HTTP 401, got ${unauth.response.status}`
  );
  if (!unauthOk) failed = true;

  if (token) {
    const authed = await fetchJson(`${args.workerUrl}/api/db/entitlements`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const statusOk = authed.response.status === 200;
    printResult('GET /api/db/entitlements with token', statusOk, `HTTP ${authed.response.status}`);
    if (!statusOk) failed = true;

    if (statusOk) {
      const tierOk = TIER_LADDER.includes(authed.body?.tier);
      printResult(
        'response tier is on the ladder',
        tierOk,
        `tier=${JSON.stringify(authed.body?.tier)}`
      );
      if (!tierOk) failed = true;

      const shapeOk = 'updatedAt' in (authed.body || {});
      printResult(
        'response carries updatedAt (null for no-row accounts)',
        shapeOk,
        `updatedAt=${JSON.stringify(authed.body?.updatedAt)}`
      );
      if (!shapeOk) failed = true;
    }
  } else {
    console.log('[INFO] SUPABASE_ACCESS_TOKEN not set; skipping authenticated checks');
  }

  if (failed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[FAIL] Unhandled error:', error instanceof Error ? error.message : error);
  process.exit(1);
});
