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

// DM narration as the player saw it: completion markers (retired, #76) and the bold
// "What do you do?" wrapper stripped.
// Dry-run transcripts carry a placeholder instead of narration; treat it as none.
const cleanNarration = (t) => (/^\[dry-run\]/.test((t || '').trim()) ? '' : (t || ''))
  .replace(/\[COMPLETE_MILESTONE:[\s\S]*?\]/gi, '').replace(/\[COMPLETE_CAMPAIGN\]/gi, '')
  .replace(/\*\*(What do you do\?)\*\*/g, '$1').trim();

// Milestone lines of a rendered context (the engine's objective state).
const isMilestoneLine = (l) => /^(Active Milestones|Completed|Locked \(prerequisites not met\)):/.test(l);

const seen = new Map();
for (const file of files) {
  const fileTurns = []; // this transcript's turns, in order, to derive context_after
  const template = file.replace(/^playthrough-/, '').replace(/-\d{4}-\d{2}-\d{2}T.*$/, '');
  const text = fs.readFileSync(path.join(srcDir, file), 'utf8');
  let previousDm = null; // the DM message the player is replying to
  for (const section of text.split(/\n## Turn /).slice(1)) {
    const title = section.split('\n')[0].trim();
    const responseBlock = section.includes('### Response')
      ? between(section.slice(section.indexOf('### Response')), '```text\n', '\n```') : null;
    const openingBlock = section.includes('### Authored opening')
      ? between(section.slice(section.indexOf('### Authored opening')), '\n\n', '\n**Automated checks') : null;
    const dmResponse = cleanNarration(responseBlock || openingBlock) || null;
    const lastDm = previousDm;
    if (dmResponse) previousDm = dmResponse;
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
    // The same scripted turn appears in several transcripts (dry runs, reruns); keep the
    // copy with real narration on both sides.
    const row = {
      id, source: 'harness', template, turn: title.replace(/^\d+: /, ''),
      context, summary, last_dm: lastDm, player_text: input, dm_response: dmResponse,
      targets: extractTargets(context), origin: file,
    };
    fileTurns.push(row);
    const prev = seen.get(id);
    if (prev && (prev.last_dm && prev.dm_response || !(lastDm && dmResponse))) continue;
    seen.set(id, row);
  }
  // `context` is the state BEFORE this turn's action; `dm_response` is from AFTER it (the
  // engine may have completed an objective in between). A turn that borrows this scene's
  // dm_response as its last_dm needs the after-state: the next turn's milestone lines,
  // keeping this turn's location/party lines (the harness moves the party between turns).
  for (let i = 0; i < fileTurns.length; i++) {
    const next = fileTurns[i + 1];
    if (!next) continue;
    const after = next.context.split('\n').filter(isMilestoneLine);
    const lines = fileTurns[i].context.split('\n');
    const at = lines.findIndex(isMilestoneLine);
    if (at < 0) continue;
    fileTurns[i].context_after = [...lines.slice(0, at), ...after, ...lines.filter((l, k) => k > at && !isMilestoneLine(l))].join('\n');
  }
}

const rows = [...seen.values()];
writeJsonl(out, rows);
const byTemplate = rows.reduce((m, r) => ((m[r.template] = (m[r.template] || 0) + 1), m), {});
console.log(`${rows.length} unique turns from ${files.length} transcripts -> ${path.relative(repoRoot, out)}`);
console.log(Object.entries(byTemplate).map(([k, v]) => `  ${k}: ${v}`).join('\n'));
