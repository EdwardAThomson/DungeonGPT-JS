#!/usr/bin/env node
// Score deterministic roll rules (roll-rules.mjs) against the labels, next to the models.
// No model calls, free, instant.
//
//   node scripts/adjudication/rules-eval.mjs [--run pilot-2-or] [--reader or-gpt-6-luna]
//
// Three conditions, same Q4-Q6 scoring as adjudication-eval.mjs:
//   A  pure code:   keyword reader -> rule table                 (no model anywhere)
//   B  hybrid:      a model's Q1-Q3/Q7 answers -> rule table     (model reads, code decides)
//   C  ceiling:     the human labels' Q1-Q3/Q7 -> rule table     (perfect reading)
// plus the pure-code reader's own Q1 accuracy, since reading is its weak point.
//
// Caveat printed with the results: the rules were written after seeing the pilot turns, so
// every rule score is IN-SAMPLE and optimistic. A fair test needs fresh, unseen turns.

import fs from 'fs';
import path from 'path';
import { repoRoot, turnsDir, readJsonl, resolveFixtures } from './fixtures.mjs';
import { readIntentByKeywords, decideRoll } from './roll-rules.mjs';

const argv = process.argv.slice(2);
const opt = (f, d) => (argv.indexOf(f) >= 0 ? argv[argv.indexOf(f) + 1] : d);
const run = opt('--run', 'pilot-2-or');
const readerModel = opt('--reader', 'or-gpt-6-luna');
const TIERS = ['trivial', 'easy', 'medium', 'hard', 'deadly'];

function load(file) {
  const pools = fs.readdirSync(turnsDir).filter((f) => f.endsWith('.jsonl') && !/\.(labels|suggested)\.jsonl$/.test(f))
    .map((f) => readJsonl(path.join(turnsDir, f)));
  const labels = new Map();
  for (const r of readJsonl(path.join(turnsDir, file.replace(/\.jsonl$/, '.labels.jsonl')))) if (r.labeler === 'l1') labels.set(r.id, r);
  return resolveFixtures(readJsonl(path.join(turnsDir, file)), pools)
    .filter((t) => labels.get(t.id) && !labels.get(t.id).skipped)
    .map((t) => ({ ...t, file, L: labels.get(t.id).labels }));
}

function scoreRoll(ans, L, acc) {
  if (L.q4 == null) return;
  const add = (k, ok) => { acc[k] = acc[k] || [0, 0]; acc[k][0] += ok ? 1 : 0; acc[k][1] += 1; };
  add('q4', ans.q4 === L.q4);
  const eff = (q4, q6) => q4 === true && q6 !== 'trivial';
  add('q4_lenient', eff(ans.q4, ans.q6) === eff(L.q4, L.q6));
  if (L.q5 != null) add('q5', ans.q5 === L.q5);
  if (L.q6 != null) { add('q6', ans.q6 === L.q6); if (ans.q6) add('q6_within1', Math.abs(TIERS.indexOf(L.q6) - TIERS.indexOf(ans.q6)) <= 1); }
}
const fmt = (acc) => ['q4', 'q4_lenient', 'q5', 'q6', 'q6_within1']
  .map((k) => (acc[k] ? `${k} ${Math.round((100 * acc[k][0]) / acc[k][1])}% (${acc[k][1]})` : `${k} -`)).join(' | ');

const readerFile = path.join(repoRoot, 'harness-transcripts', 'eval', run, 'orig', `${readerModel}.jsonl`);
const modelRows = new Map();
for (const r of readJsonl(readerFile)) if (!r.error && r.answer) modelRows.set(r.id, r);

for (const file of ['pilot-adversarial.jsonl', 'pilot-harness.jsonl']) {
  const turns = load(file);
  const acc = { A: {}, B: {}, C: {}, model: {} };
  let q1Ok = 0, q1ModelOk = 0, q1ModelN = 0;
  const misses = [];
  for (const t of turns) {
    const kw = readIntentByKeywords(t);
    if (kw.q1 === t.L.q1) q1Ok++;
    scoreRoll(decideRoll(kw, t), t.L, acc.A);
    const m = modelRows.get(t.id);
    if (m) {
      q1ModelN++; if (m.answer.q1 === t.L.q1) q1ModelOk++;
      scoreRoll(decideRoll(m.answer, t), t.L, acc.B);
      scoreRoll(m.answer, t.L, acc.model);
    }
    const c = decideRoll(t.L, t);
    scoreRoll(c, t.L, acc.C);
    if (t.L.q4 != null && (c.q4 !== t.L.q4 || (t.L.q5 && c.q5 !== t.L.q5))) misses.push(`${t.id}: rules ${c.q4 ? `${c.q5}/${c.q6}` : 'no roll'} vs label ${t.L.q4 ? `${t.L.q5}/${t.L.q6}` : 'no roll'} | ${t.player_text.slice(0, 70)}`);
  }
  console.log(`\n== ${file} (${turns.length} labelled turns)`);
  console.log(`  keyword reader Q1 accuracy: ${Math.round((100 * q1Ok) / turns.length)}%   (${readerModel} Q1: ${q1ModelN ? Math.round((100 * q1ModelOk) / q1ModelN) : '-'}%)`);
  console.log(`  A pure code               ${fmt(acc.A)}`);
  console.log(`  B ${readerModel} reads, rules decide  ${fmt(acc.B)}`);
  console.log(`  C labels read, rules decide ${fmt(acc.C)}`);
  console.log(`  (${readerModel} alone        ${fmt(acc.model)})`);
  if (misses.length) console.log(`  rule-table misses given perfect reading (C):\n    ${misses.join('\n    ')}`);
}
console.log('\nCAVEAT: rules were written after seeing these turns; all rule scores are in-sample and optimistic.');
