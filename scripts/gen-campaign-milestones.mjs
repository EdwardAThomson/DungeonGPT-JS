#!/usr/bin/env node
// Regenerates docs/CAMPAIGN_MILESTONES.md from src/data/storyTemplates.js: `npm run docs:campaigns`.
//
// The doc is a maintained, at-a-glance overview of every campaign's milestone
// structure. It is GENERATED so it can never drift from the data. A Jest drift
// test (src/data/campaignMilestonesDoc.test.js) fails CI if the committed file
// falls out of sync with the templates, so regenerate after editing a template.
//
// HOW IT LOADS APP MODULES (same pattern as scripts/content-audit.mjs)
// --------------------------------------------------------------------
// storyTemplates.js is an ESM `.js` under Create React App's Babel pipeline and
// uses webpack's require.context, so plain node cannot import it directly. We let
// esbuild (already a transitive dep) bundle the pure, JSX-free subgraph rooted at
// src/data/campaignMilestonesDoc.js (which imports storyTemplates + the pure
// markdown builder) into a single ESM file in a temp dir, then dynamic-import it.
// esbuild resolves the ESM data modules and leaves the guarded require.context
// alone (it is falsy off webpack), so the load matches what the app sees.
//
// Deterministic: no timestamps or randomness in the output, so running it twice
// produces a byte-identical file and the drift test can diff it.

import { build } from 'esbuild';
import { pathToFileURL } from 'url';
import path from 'path';
import os from 'os';
import fs from 'fs';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const entry = path.join(repoRoot, 'src', 'data', 'campaignMilestonesDoc.js');
const outDoc = path.join(repoRoot, 'docs', 'CAMPAIGN_MILESTONES.md');

async function loadBuilder() {
  const outfile = path.join(os.tmpdir(), `dungeongpt-campaign-milestones.${process.pid}.mjs`);
  await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    logLevel: 'silent'
  });
  try {
    return await import(pathToFileURL(outfile).href + `?t=${process.pid}`);
  } finally {
    fs.rm(outfile, { force: true }, () => {});
  }
}

async function main() {
  let renderCampaignMilestonesDoc;
  try {
    ({ renderCampaignMilestonesDoc } = await loadBuilder());
  } catch (err) {
    console.error('Failed to load the campaign-milestones builder:');
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
    return;
  }

  const markdown = renderCampaignMilestonesDoc();
  fs.writeFileSync(outDoc, markdown, 'utf8');
  console.log(`Wrote ${path.relative(repoRoot, outDoc)} (${markdown.length} bytes).`);
}

main();
