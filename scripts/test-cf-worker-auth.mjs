#!/usr/bin/env node

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
    expectPublicModels: false,
    testGenerate: false,
  };

  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--worker-url=')) {
      args.workerUrl = arg.slice('--worker-url='.length);
    } else if (arg === '--expect-public-models') {
      args.expectPublicModels = true;
    } else if (arg === '--test-generate') {
      args.testGenerate = true;
    } else if (arg === '--help') {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
CF Worker auth smoke test

Usage:
  node scripts/test-cf-worker-auth.mjs [flags]

Flags:
  --worker-url=<url>        Worker base URL (default from .env.local)
  --expect-public-models    Expect /api/ai/models to be public (dev fail-open mode)
  --test-generate           Also test POST /api/ai/generate with token

Environment:
  SUPABASE_ACCESS_TOKEN     Optional bearer token for authenticated checks
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
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  let failed = false;

  const health = await fetchJson(`${args.workerUrl}/health`);
  const healthOk = health.response.ok;
  printResult('GET /health', healthOk, `HTTP ${health.response.status}`);
  if (!healthOk) failed = true;

  const unauthModels = await fetchJson(`${args.workerUrl}/api/ai/models`);
  const expectedStatus = args.expectPublicModels ? 200 : 401;
  const unauthOk = unauthModels.response.status === expectedStatus;
  printResult(
    'GET /api/ai/models without token',
    unauthOk,
    `expected HTTP ${expectedStatus}, got ${unauthModels.response.status}`
  );
  if (!unauthOk) failed = true;

  if (token) {
    const authModels = await fetchJson(`${args.workerUrl}/api/ai/models`, {
      headers: authHeaders,
    });
    const authOk = authModels.response.status === 200;
    printResult('GET /api/ai/models with token', authOk, `HTTP ${authModels.response.status}`);
    if (!authOk) failed = true;

    if (args.testGenerate) {
      const generate = await fetchJson(`${args.workerUrl}/api/ai/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          provider: 'cf-workers',
          model: '@cf/meta/llama-3.1-8b-instruct-fast',
          prompt: 'Say hello in one sentence.',
          maxTokens: 64,
          temperature: 0.2,
        }),
      });

      const generateOk =
        generate.response.status === 200 && typeof generate.body?.text === 'string';
      printResult(
        'POST /api/ai/generate with token',
        generateOk,
        `HTTP ${generate.response.status}`
      );
      if (!generateOk) failed = true;
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
