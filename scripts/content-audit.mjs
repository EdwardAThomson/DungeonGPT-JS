#!/usr/bin/env node
// Friendly content-audit report: `npm run audit`.
//
// Prints every check grouped by domain, showing what PASSES as well as what
// warns or fails, so it doubles as a coverage view. This script always exits 0 —
// it is the human-facing view. The CI gate that actually fails on errors is the
// Jest suite (src/audits/contentAudit.test.js).
//
// HOW IT LOADS APP MODULES
// ------------------------
// The audit modules live in src/ and use ESM `import`, and the app data modules
// they pull in (storyTemplates.js, inventorySystem.js, encounters/*) are authored
// as ESM `.js` under Create React App's Babel pipeline. Node cannot import those
// `.js` files directly (no "type":"module", and one uses webpack's require.context).
// Rather than add a Babel register hook, we let esbuild (already a transitive dep)
// bundle src/audits/index.js — a pure, JSX-free, dependency-light subgraph — into a
// single ESM file in a temp dir, then dynamically import it. esbuild resolves the
// ESM data modules and leaves the guarded `require.context` alone (it is falsy off
// webpack), so the load is faithful to what the app sees.

import { build } from 'esbuild';
import { pathToFileURL } from 'url';
import path from 'path';
import os from 'os';
import fs from 'fs';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const entry = path.join(repoRoot, 'src', 'audits', 'index.js');

const useColor = process.stdout.isTTY && process.env.NO_COLOR == null;
const c = (code, s) => (useColor ? `[${code}m${s}[0m` : s);
const green = (s) => c('32', s);
const yellow = (s) => c('33', s);
const red = (s) => c('31', s);
const dim = (s) => c('2', s);
const bold = (s) => c('1', s);

async function loadRunner() {
  const outfile = path.join(os.tmpdir(), `dungeongpt-content-audit.${process.pid}.mjs`);
  await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    logLevel: 'silent'
  });
  try {
    return await import(pathToFileURL(outfile).href + `?t=${Date.now()}`);
  } finally {
    fs.rm(outfile, { force: true }, () => {});
  }
}

function symbolFor(status) {
  if (status === 'fail') return red('✗'); // ✗
  if (status === 'warn') return yellow('⚠'); // ⚠
  return green('✓'); // ✓
}

async function main() {
  let runAudit;
  try {
    ({ runAudit } = await loadRunner());
  } catch (err) {
    console.error(red('Failed to load the audit modules:'));
    console.error(err && err.stack ? err.stack : err);
    process.exit(0); // friendly view never fails CI
    return;
  }

  const { results, summary } = runAudit();

  console.log(bold('\nContent Integrity Audit'));
  console.log(dim('cross-checks authored game data against the code capability tables\n'));

  // Group by domain, preserving first-seen order.
  const byDomain = new Map();
  for (const r of results) {
    if (!byDomain.has(r.domain)) byDomain.set(r.domain, []);
    byDomain.get(r.domain).push(r);
  }

  for (const [domain, checks] of byDomain) {
    console.log(bold(domain));
    for (const r of checks) {
      const count = r.violations.length ? dim(` (${r.violations.length})`) : '';
      console.log(`  ${symbolFor(r.status)} ${r.id} ${r.title}${count}`);
      if (r.status !== 'pass') {
        for (const v of r.violations) {
          console.log(`      ${dim('-')} ${v.message} ${dim(`[${v.location}]`)}`);
        }
      }
    }
    console.log('');
  }

  const parts = [
    green(`${summary.passed} passed`),
    yellow(`${summary.warnings} warnings`),
    red(`${summary.failed} failed`)
  ];
  console.log(bold(parts.join(', ')));
  if (summary.failed > 0) {
    console.log(dim('the Jest CI gate (src/audits/contentAudit.test.js) fails on the failures above'));
  }
  console.log('');

  process.exit(0);
}

main();
