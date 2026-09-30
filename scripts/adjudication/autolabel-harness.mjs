#!/usr/bin/env node
// Auto-label the pilot harness turns from their scripted patterns (plan §3.2 speed-up).
//
//   node scripts/adjudication/autolabel-harness.mjs [--force]
//
// quest-harness inputs come in four fixed shapes, one per milestone type, so their labels
// follow from the turn type. Rows are written as labeler l1 with `auto: "harness-pattern"`
// (never over a human label unless --force), plus the same answers to
// pilot-harness.suggested.jsonl so `label-turns.mjs --spot-check N` can show a random sample
// with the auto answer pre-filled for a human to confirm or override.
//
// Judgement calls baked in (the spot-check is where to disagree):
//   - fights are Q4 = no: combat has its own system and is never a skill check;
//   - searching an authored location for a quest item is Q4 = no: the engine grants it;
//   - the boss of a fight is not in the scene's NPC list, so Q3 = other + q3_other = boss.

import path from 'path';
import { turnsDir, readJsonl, writeJsonl } from './fixtures.mjs';

const force = process.argv.includes('--force');
const fixtures = path.join(turnsDir, 'pilot-harness.jsonl');
const labelsFile = path.join(turnsDir, 'pilot-harness.labels.jsonl');
const suggestedFile = path.join(turnsDir, 'pilot-harness.suggested.jsonl');

const blank = { q1: null, q2: null, q3: null, q4: null, q5: null, q6: null, q7: null };

function labelFor(turn) {
  const kind = (turn.turn.match(/\[(\w+)\]/) || [])[1];
  const text = turn.player_text;
  if (kind === 'combat') {
    const boss = text.match(/^We confront and fight (.+?) at /)?.[1];
    return { ...blank, q1: 'action', q2: 'attack', q3: 'other (not listed)', ...(boss ? { q3_other: boss } : {}), q4: false, q7: false };
  }
  if (kind === 'item' && /^We travel to .+ and search /.test(text)) {
    return { ...blank, q1: 'action', q2: 'investigate', q3: 'object/place (not a person)', q4: false, q7: false };
  }
  if (kind === 'location' && /^We travel to /.test(text)) {
    return { ...blank, q1: 'action', q2: 'move', q3: 'object/place (not a person)', q4: false, q7: false };
  }
  if (kind === 'talk') {
    const who = text.match(/speak with (.+?)\.$/)?.[1] || text.match(/^We hear (.+?) out /)?.[1];
    const target = who && turn.targets.find((t) => t === who);
    return target
      ? { ...blank, q1: 'talk_to_npc', q3: target, q7: false }
      : { ...blank, q1: 'talk_to_npc', q3: 'other (not listed)', ...(who ? { q3_other: who } : {}), q7: false };
  }
  return null;
}

const turns = readJsonl(fixtures);
const existing = new Map();
for (const r of readJsonl(labelsFile)) if (r.labeler === 'l1') existing.set(r.id, r);

const ts = new Date().toISOString();
const suggested = [];
const newLabels = [];
const unmatched = [];
let keptHuman = 0;
for (const t of turns) {
  const labels = labelFor(t);
  if (!labels) { unmatched.push(`${t.id} ${t.turn}: ${t.player_text}`); continue; }
  suggested.push({ id: t.id, labels });
  const prev = existing.get(t.id);
  if (prev && !prev.auto && !force) { keptHuman++; continue; }
  newLabels.push({ id: t.id, labeler: 'l1', ts, labels, auto: 'harness-pattern' });
}

writeJsonl(suggestedFile, suggested);
// Append (latest row per id+labeler wins), so earlier history stays in the file.
const all = [...readJsonl(labelsFile), ...newLabels];
writeJsonl(labelsFile, all);

console.log(`auto-labelled ${newLabels.length}/${turns.length} harness turns` +
  (keptHuman ? ` (kept ${keptHuman} human labels)` : ''));
if (unmatched.length) console.log(`no pattern for ${unmatched.length}:\n  ${unmatched.join('\n  ')}`);
