#!/usr/bin/env node

// CF Worker premium-content smoke test (backlog #40).
//
// Hits a locally running `wrangler dev` instance (cf-worker/) and checks the
// GET /api/db/premium-templates contract:
//   - without a token: 401 (the /api/db group is authed)
//   - with a token:    200 and { templates: [...] } where templates is an array
//     of storyTemplates-shaped entries (each has an id); a free/no-row account
//     gets an EMPTY array, never an error
//   - with EXPECT_TIER=member (and a member-account token): at least one
//     delivered entry, i.e. the member sees member-tier rows
//
// It does NOT start the worker for you and it never touches a database directly;
// the worker needs a reachable Postgres (see cf-worker/wrangler.toml for the local
// tunnel recipe) with migrations 002 + 004 applied, and at least one enabled
// member-tier row in premium_templates for the EXPECT_TIER=member assertion.
//
// Usage:
//   cd cf-worker && npx wrangler dev                        # in one terminal
//   node scripts/test-cf-premium.mjs                        # in another
//   SUPABASE_ACCESS_TOKEN=<jwt> node scripts/test-cf-premium.mjs
//   SUPABASE_ACCESS_TOKEN=<member-jwt> EXPECT_TIER=member node scripts/test-cf-premium.mjs
//   SUPABASE_ACCESS_TOKEN=<free-jwt>   EXPECT_TIER=free   node scripts/test-cf-premium.mjs
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
CF Worker premium-content smoke test

Usage:
  node scripts/test-cf-premium.mjs [flags]

Flags:
  --worker-url=<url>        Worker base URL (default from .env.local)

Environment:
  SUPABASE_ACCESS_TOKEN     Optional bearer token for the authenticated checks
  EXPECT_TIER               Optional: 'free' asserts an EMPTY delivery for the
                            token's account; 'member' asserts a NON-EMPTY one
                            (requires a member grant + a member-tier row)
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
  const expectTier = process.env.EXPECT_TIER || null;

  let failed = false;

  const health = await fetchJson(`${args.workerUrl}/health`);
  const healthOk = health.response.ok;
  printResult('GET /health', healthOk, `HTTP ${health.response.status}`);
  if (!healthOk) failed = true;

  const unauth = await fetchJson(`${args.workerUrl}/api/db/premium-templates`);
  const unauthOk = unauth.response.status === 401;
  printResult(
    'GET /api/db/premium-templates without token',
    unauthOk,
    `expected HTTP 401, got ${unauth.response.status}`
  );
  if (!unauthOk) failed = true;

  if (token) {
    const authed = await fetchJson(`${args.workerUrl}/api/db/premium-templates`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const statusOk = authed.response.status === 200;
    printResult('GET /api/db/premium-templates with token', statusOk, `HTTP ${authed.response.status}`);
    if (!statusOk) failed = true;

    if (statusOk) {
      const templates = authed.body?.templates;
      const shapeOk = Array.isArray(templates);
      printResult(
        'response carries a templates array',
        shapeOk,
        `templates=${shapeOk ? `array(${templates.length})` : JSON.stringify(templates)}`
      );
      if (!shapeOk) failed = true;

      if (shapeOk && templates.length > 0) {
        const entriesOk = templates.every((t) => t && typeof t.id === 'string');
        printResult(
          'every delivered entry is storyTemplates-shaped (has an id)',
          entriesOk,
          `ids=${JSON.stringify(templates.map((t) => t?.id))}`
        );
        if (!entriesOk) failed = true;
      }

      if (shapeOk && expectTier === 'free') {
        const emptyOk = templates.length === 0;
        printResult(
          'free account gets an EMPTY delivery (not an error)',
          emptyOk,
          `count=${templates.length}`
        );
        if (!emptyOk) failed = true;
      }

      if (shapeOk && expectTier === 'member') {
        const nonEmptyOk = templates.length > 0;
        printResult(
          'member account sees member-tier rows (non-empty delivery)',
          nonEmptyOk,
          `count=${templates.length}`
        );
        if (!nonEmptyOk) failed = true;
      }
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
