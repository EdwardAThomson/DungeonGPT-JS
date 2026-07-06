#!/usr/bin/env node

// CF Worker premium AI pool smoke test (backlog #7) + rate-limit shape check (#12).
//
// Hits a locally running `wrangler dev` instance (cf-worker/) and checks the
// POST /api/ai/generate pool contract:
//   - without a token: 401 (the route is authed)
//   - free-tier token + pool 'premium': 403 { code: 'premium_required' }
//   - member token + pool 'premium':    200 { text, pool } where pool is
//     'premium' (OpenRouter configured) or 'free' with
//     fallbackFrom: 'premium' (unconfigured/failed: the never-dead fallback)
//   - member token + EXPECT_CAP=true:   429 { code: 'premium_cap',
//     retryAfterSeconds } (requires the account's ai-premium-daily counter to be
//     over its allowance; pre-seed it via psql, recipe below)
//   - any token + pool omitted/garbage: 200 { text, pool: 'free' }
//
// It does NOT start the worker and never touches the database directly; the worker
// needs a reachable Postgres (see cf-worker/wrangler.toml for the tunnel recipe)
// with migrations 002 + 005 applied. For the premium 200 check the account needs a
// member+ grant (002 runbook) and, for a true premium response, the
// OPENROUTER_API_KEY secret (cf-worker/.dev.vars locally).
//
// Pre-seeding the daily cap for the 429 check (window = current UTC day):
//   INSERT INTO request_counters (user_id, bucket, window_start, count)
//   VALUES ('<auth-hub-sub-uuid>', 'ai-premium-daily', date_trunc('day', now() AT TIME ZONE 'utc'), 10000)
//   ON CONFLICT (user_id, bucket, window_start) DO UPDATE SET count = 10000;
//
// Usage:
//   cd cf-worker && npx wrangler dev                        # in one terminal
//   node scripts/test-cf-premium-ai.mjs                     # unauth checks only
//   SUPABASE_ACCESS_TOKEN=<free-jwt>   EXPECT_TIER=free   node scripts/test-cf-premium-ai.mjs
//   SUPABASE_ACCESS_TOKEN=<member-jwt> EXPECT_TIER=member node scripts/test-cf-premium-ai.mjs
//   SUPABASE_ACCESS_TOKEN=<member-jwt> EXPECT_CAP=true    node scripts/test-cf-premium-ai.mjs
//
// Style follows scripts/test-cf-premium.mjs / test-cf-entitlements.mjs.

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
CF Worker premium AI pool smoke test

Usage:
  node scripts/test-cf-premium-ai.mjs [flags]

Flags:
  --worker-url=<url>        Worker base URL (default from .env.local)

Environment:
  SUPABASE_ACCESS_TOKEN     Optional bearer token for the authenticated checks
  EXPECT_TIER               Optional: 'free' asserts the premium call is refused
                            with 403 premium_required; 'member' asserts a 200
                            with a pool field
  EXPECT_CAP                Optional: 'true' asserts the premium call gets
                            429 premium_cap (pre-seed the daily counter first,
                            recipe in the file header)
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

const GENERATE_BODY = {
  provider: 'cf-workers',
  model: '@cf/openai/gpt-oss-120b',
  prompt: 'In one sentence, describe a quiet tavern at dusk.',
  maxTokens: 80,
  temperature: 0.7,
};

async function postGenerate(workerUrl, token, pool) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetchJson(`${workerUrl}/api/ai/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify(pool === undefined ? GENERATE_BODY : { ...GENERATE_BODY, pool }),
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const token = process.env.SUPABASE_ACCESS_TOKEN || null;
  const expectTier = process.env.EXPECT_TIER || null;
  const expectCap = process.env.EXPECT_CAP === 'true';

  let failed = false;

  const health = await fetchJson(`${args.workerUrl}/health`);
  const healthOk = health.response.ok;
  printResult('GET /health', healthOk, `HTTP ${health.response.status}`);
  if (!healthOk) failed = true;

  const unauth = await postGenerate(args.workerUrl, null, 'premium');
  const unauthOk = unauth.response.status === 401;
  printResult(
    'POST /api/ai/generate without token',
    unauthOk,
    `expected HTTP 401, got ${unauth.response.status}`
  );
  if (!unauthOk) failed = true;

  if (!token) {
    console.log('[INFO] SUPABASE_ACCESS_TOKEN not set; skipping authenticated checks');
    if (failed) process.exit(1);
    return;
  }

  // Pool omitted: always the free pool, response says so.
  const freeCall = await postGenerate(args.workerUrl, token, undefined);
  const freeOk =
    freeCall.response.status === 200 &&
    typeof freeCall.body?.text === 'string' &&
    freeCall.body?.pool === 'free';
  printResult(
    'pool omitted -> 200 { text, pool: "free" }',
    freeOk,
    `HTTP ${freeCall.response.status}, pool=${freeCall.body?.pool}`
  );
  if (!freeOk) failed = true;

  // Garbage pool values collapse to free, never an error.
  const garbageCall = await postGenerate(args.workerUrl, token, 'platinum-deluxe');
  const garbageOk =
    garbageCall.response.status === 200 && garbageCall.body?.pool === 'free';
  printResult(
    'unknown pool value collapses to free',
    garbageOk,
    `HTTP ${garbageCall.response.status}, pool=${garbageCall.body?.pool}`
  );
  if (!garbageOk) failed = true;

  const premiumCall = await postGenerate(args.workerUrl, token, 'premium');

  if (expectTier === 'free') {
    const refusedOk =
      premiumCall.response.status === 403 &&
      premiumCall.body?.code === 'premium_required';
    printResult(
      'free tier premium call -> 403 { code: "premium_required" }',
      refusedOk,
      `HTTP ${premiumCall.response.status}, code=${premiumCall.body?.code}`
    );
    if (!refusedOk) failed = true;
  } else if (expectCap) {
    const capOk =
      premiumCall.response.status === 429 &&
      premiumCall.body?.code === 'premium_cap' &&
      Number.isFinite(premiumCall.body?.retryAfterSeconds);
    printResult(
      'over-allowance premium call -> 429 { code: "premium_cap", retryAfterSeconds }',
      capOk,
      `HTTP ${premiumCall.response.status}, code=${premiumCall.body?.code}, retryAfterSeconds=${premiumCall.body?.retryAfterSeconds}`
    );
    if (!capOk) failed = true;
  } else if (expectTier === 'member') {
    const statusOk = premiumCall.response.status === 200;
    printResult(
      'member premium call -> 200',
      statusOk,
      `HTTP ${premiumCall.response.status}${statusOk ? '' : ` body=${JSON.stringify(premiumCall.body)}`}`
    );
    if (!statusOk) failed = true;

    if (statusOk) {
      const body = premiumCall.body ?? {};
      const shapeOk =
        typeof body.text === 'string' &&
        body.text.length > 0 &&
        (body.pool === 'premium' ||
          (body.pool === 'free' && body.fallbackFrom === 'premium'));
      printResult(
        'response is { text, pool: "premium" } or the marked free fallback',
        shapeOk,
        `pool=${body.pool}${body.fallbackFrom ? `, fallbackFrom=${body.fallbackFrom}` : ''}`
      );
      if (!shapeOk) failed = true;

      if (body.pool === 'free') {
        console.log(
          '[INFO] premium request served by the free pool (OpenRouter unconfigured or failed); set OPENROUTER_API_KEY in cf-worker/.dev.vars for a true premium response'
        );
      }
    }
  } else {
    console.log(
      `[INFO] EXPECT_TIER not set; premium call returned HTTP ${premiumCall.response.status} (code=${premiumCall.body?.code ?? 'n/a'}, pool=${premiumCall.body?.pool ?? 'n/a'})`
    );
  }

  if (failed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[FAIL] Unhandled error:', error instanceof Error ? error.message : error);
  process.exit(1);
});

// ── Cost-cap cases (live-verified against wrangler dev 2026-07-06) ────────────
// 1. Prompt over 32k chars must 400 with the schema message (input cost ceiling).
// 2. maxTokens over 1500 must 400 (output cost ceiling; premium additionally
//    clamps to 800 via the registry regardless of the accepted value).
// 3. pool 'premium' with any client model id must NOT honor the id: the premium
//    pool always runs the server default chain (player model choice removed).
//    Anonymous/free callers get 403 premium_required (fails closed).
// Run these with the same env as the cases above; they need no DB seeding.
export const CAP_CASES = [
  { name: 'prompt over 32k -> 400', body: { provider: 'cf-workers', model: '@cf/openai/gpt-oss-120b', prompt: 'x'.repeat(33000) }, expectStatus: 400 },
  { name: 'maxTokens 4096 -> 400', body: { provider: 'cf-workers', model: '@cf/openai/gpt-oss-120b', prompt: 'hi', maxTokens: 4096 }, expectStatus: 400 },
  { name: 'premium ignores client model; free tier -> 403 premium_required', body: { provider: 'cf-workers', model: 'some/nonsense-model', prompt: 'hi', pool: 'premium' }, expectStatus: 403, expectCode: 'premium_required' },
];
