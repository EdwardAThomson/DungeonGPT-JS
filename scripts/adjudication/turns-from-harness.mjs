#!/usr/bin/env node
// Convert quest-harness playthrough transcripts (harness-transcripts/playthrough-*.md)
// into pilot eval fixtures: one line per unique (context, player input) turn.
//
//   node scripts/adjudication/turns-from-harness.mjs [--out harness-transcripts/turns/pilot-harness.jsonl]
//
// Harness inputs are scripted and uniformly well-behaved ("We go to X and speak with Y"),
// so these are a dev set and a pool of realistic scenes for hand-written turns to reuse
// (context_ref), never a benchmark. Deterministic; no network.

import fs from 'fs';
import path from 'path';
import { repoRoot, turnsDir, shortHash, writeJsonl, extractTargets } from './fixtures.mjs';

const args = process.argv.slice(2);
const outArg = args.indexOf('--out');
const out = outArg >= 0 ? path.resolve(args[outArg + 1]) : path.join(turnsDir, 'pilot-harness.jsonl');

const srcDir = path.join(repoRoot, 'harness-transcripts');
const files = fs.readdirSync(srcDir).filter((f) => /^playthrough-.*\.md$/.test(f)).sort();

const between = (s, a, b) => {
  const i = s.indexOf(a);
  if (i < 0) return null;
  const j = s.indexOf(b, i + a.length);
  return (j < 0 ? s.slice(i + a.length) : s.slice(i + a.length, j)).trim();
};

const seen = new Map();
for (const file of files) {
  const template = file.replace(/^playthrough-/, '').replace(/-\d{4}-\d{2}-\d{2}T.*$/, '');
  const text = fs.readFileSync(path.join(srcDir, file), 'utf8');
  for (const section of text.split(/\n## Turn /).slice(1)) {
    const title = section.split('\n')[0].trim();
    const input = section.match(/\*\*Scripted player input:\*\* (.+)/)?.[1]?.trim();
    const prompt = between(section, '```text\n', '\n```');
    if (!input || !prompt) continue; // openings have no player input
    const rawContext = between(prompt, '[CONTEXT]\n', '\n[SUMMARY]');
    if (!rawContext) continue;
    // Pre-#76 transcripts carry the retired talk cue; rewrite it to the current
    // formatMilestonePromptText wording (src/game/turnContext.js) so the eval sees
    // today's prompt, not July's.
    const context = rawContext.replace(
      /\(you may mark this complete once the party finishes speaking with ([^)]+)\)/g,
      '(guide the party toward speaking with $1; the game completes this when they do — do not declare it done yourself)');
    const summary = between(prompt, '[SUMMARY]\n', '\n[PLAYER ACTION]');
    const id = `h-${shortHash(context + '\n' + input)}`;
    if (seen.has(id)) continue;
    seen.set(id, {
      id, source: 'harness', template, turn: title.replace(/^\d+: /, ''),
      context, summary, player_text: input, targets: extractTargets(context),
      origin: file,
    });
  }
}

const rows = [...seen.values()];
writeJsonl(out, rows);
const byTemplate = rows.reduce((m, r) => ((m[r.template] = (m[r.template] || 0) + 1), m), {});
console.log(`${rows.length} unique turns from ${files.length} transcripts -> ${path.relative(repoRoot, out)}`);
console.log(Object.entries(byTemplate).map(([k, v]) => `  ${k}: ${v}`).join('\n'));
