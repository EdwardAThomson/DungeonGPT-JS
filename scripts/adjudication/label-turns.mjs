#!/usr/bin/env node
// Terminal labeller for the typed-decision eval (docs/TYPED_DECISION_EVAL_PLAN.md §3.2).
//
//   node scripts/adjudication/label-turns.mjs [fixtures.jsonl ...] [options]
//
// Defaults to harness-transcripts/turns/pilot-adversarial.jsonl + pilot-harness.jsonl.
// Shows each turn's scene + player text and asks Q1-Q7; answers are appended to
// <fixtures>.labels.jsonl (latest answer per id+labeler wins), so quitting any time loses
// nothing and re-running resumes at the first unlabelled turn.
//
// Options:
//   --labeler <name>   who is labelling (default: l1)
//   --pass2            double-label a fixed ~15% sample as labeler "l2" (agreement ceiling)
//   --redo             revisit turns this labeler already did
//   --show-probe       show the hand-written turn's intent tag (off by default: it biases)
//   --stats            print label counts and l1-vs-l2 agreement, then exit
//
// Keys at any question: number = choose, b = back, s = skip turn, q = save and quit.
//
// Label rules (keep consistent; from the plan):
//   Q1 npc_dialogue = speech aimed at a NAMED NPC in the scene; "I ask around" is action/persuade.
//   Q4 = would a human DM call for a roll? trivial/obvious = no; contested/uncertain = yes.
//      Unsure -> yes with tier trivial.
//   Q7 = physically impossible or contradicts the state (target not present, ability the
//      party lacks). Not "unwise".

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { turnsDir, readJsonl, resolveFixtures, loadSkills, QUESTIONS, shortHash } from './fixtures.mjs';

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const opt = (f, d) => (argv.indexOf(f) >= 0 ? argv[argv.indexOf(f) + 1] : d);
const files = argv.filter((a, i) => a.endsWith('.jsonl') && argv[i - 1] !== '--labeler');
const inputs = files.length ? files.map((f) => path.resolve(f))
  : ['pilot-adversarial.jsonl', 'pilot-harness.jsonl'].map((f) => path.join(turnsDir, f));
const labeler = flag('--pass2') ? 'l2' : opt('--labeler', 'l1');

const labelsPath = (f) => f.replace(/\.jsonl$/, '.labels.jsonl');
const latestLabels = (f) => {
  const m = new Map();
  for (const r of readJsonl(labelsPath(f))) m.set(`${r.id}|${r.labeler}`, r);
  return m;
};

// Every fixture file in turnsDir is a context_ref pool.
const poolFiles = fs.existsSync(turnsDir)
  ? fs.readdirSync(turnsDir).filter((f) => f.endsWith('.jsonl') && !f.endsWith('.labels.jsonl')).map((f) => path.join(turnsDir, f))
  : [];
const pools = poolFiles.map(readJsonl);

// Deterministic ~15% sample for the second pass (same turns every run).
const inPass2Sample = (id) => parseInt(shortHash('pass2|' + id).slice(0, 4), 16) % 100 < 15;

// ---------------------------------------------------------------- stats
if (flag('--stats')) {
  for (const f of inputs) {
    const labels = [...latestLabels(f).values()].filter((r) => !r.skipped);
    console.log(`\n${path.basename(f)}: ${new Set(labels.map((r) => r.id)).size} turns labelled`);
    for (const q of QUESTIONS) {
      const counts = {};
      for (const r of labels.filter((r) => r.labeler === 'l1')) {
        const v = r.labels[q.key];
        if (v !== null && v !== undefined) counts[v] = (counts[v] || 0) + 1;
      }
      console.log(`  ${q.key} ${q.text}: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' ') || '-'}`);
    }
    const l1 = new Map(labels.filter((r) => r.labeler === 'l1').map((r) => [r.id, r.labels]));
    const both = labels.filter((r) => r.labeler === 'l2' && l1.has(r.id));
    if (both.length) {
      console.log(`  agreement l1 vs l2 over ${both.length} double-labelled turns:`);
      for (const q of QUESTIONS) {
        const pairs = both.map((r) => [l1.get(r.id)[q.key], r.labels[q.key]]).filter(([a, b]) => a != null || b != null);
        if (!pairs.length) continue;
        const agree = pairs.filter(([a, b]) => a === b).length;
        console.log(`    ${q.key}: ${agree}/${pairs.length} (${Math.round((100 * agree) / pairs.length)}%)`);
      }
    }
  }
  process.exit(0);
}

// ---------------------------------------------------------------- labelling
const SKILLS = loadSkills();
const rl = readline.createInterface({ input: process.stdin, terminal: false });
const lines = rl[Symbol.asyncIterator](); // buffers, so piped input (tests) loses nothing
const ask = async (q) => {
  process.stdout.write(q);
  const { value, done } = await lines.next();
  return done ? 'q' : value.trim(); // EOF = save and quit
};
const B = (s) => `\x1b[1m${s}\x1b[0m`;
const DIM = (s) => `\x1b[2m${s}\x1b[0m`;

function optionsFor(q, turn) {
  if (q.type === 'yesno') return ['yes', 'no'];
  if (q.type === 'skill') return SKILLS;
  if (q.type === 'target') return [...turn.targets, 'party member', 'other (not listed)', 'none'];
  return q.options;
}

// Which questions apply given the answers so far (plan §2: Q2-Q7 only matter for actions;
// dialogue still gets a target).
function applies(q, a) {
  if (q.key === 'q1') return true;
  if (q.key === 'q3') return a.q1 === 'action' || a.q1 === 'npc_dialogue';
  if (q.onlyIf === 'action') return a.q1 === 'action';
  if (q.onlyIf === 'check') return a.q1 === 'action' && a.q4 === true;
  return false;
}

function show(turn, i, n) {
  console.log('\n' + '─'.repeat(78));
  console.log(DIM(`[${i + 1}/${n}] ${turn.id}  ${turn.template || ''}  ${turn.turn || ''}`));
  if (flag('--show-probe') && turn.probe) console.log(DIM(`probe: ${turn.probe}`));
  for (const line of (turn.context || '').split('\n')) {
    if (/^Setting:/.test(line)) continue; // long and rarely decisive; Goal/Milestones/location matter
    console.log(DIM('  ' + line));
  }
  console.log('\n' + B('  PLAYER: ') + turn.player_text + '\n');
}

async function labelTurn(turn) {
  const a = {};
  const order = QUESTIONS;
  for (let qi = 0; qi < order.length; ) {
    const q = order[qi];
    if (!applies(q, a)) { a[q.key] = null; qi++; continue; }
    const opts = optionsFor(q, turn);
    const menu = opts.map((o, k) => `${k + 1}) ${o}`);
    const cols = opts.length > 8 ? 3 : 1;
    const rows = [];
    for (let r = 0; r < Math.ceil(menu.length / cols); r++) {
      rows.push(menu.slice(r * cols, r * cols + cols).map((s) => s.padEnd(26)).join(''));
    }
    const ans = (await ask(`${B(q.key.toUpperCase() + ' ' + q.text)}\n  ${rows.join('\n  ')}\n> `)).toLowerCase();
    if (ans === 'q') return 'quit';
    if (ans === 's') return 'skip';
    if (ans === 'b') {
      do { qi--; } while (qi > 0 && !applies(order[qi], a));
      if (qi < 0) qi = 0;
      continue;
    }
    const k = parseInt(ans, 10);
    if (!(k >= 1 && k <= opts.length)) { console.log('  ? pick a number, or b/s/q'); continue; }
    let v = opts[k - 1];
    if (q.type === 'yesno') v = v === 'yes';
    a[q.key] = v;
    qi++;
  }
  const note = await ask(DIM('note (enter to skip): '));
  return { labels: a, note: note || undefined };
}

async function main() {
  let total = 0;
  outer: for (const f of inputs) {
    if (!fs.existsSync(f)) { console.log(`missing ${f} (run turns-from-harness.mjs first?)`); continue; }
    const turns = resolveFixtures(readJsonl(f), pools);
    const done = latestLabels(f);
    const todo = turns.filter((t) =>
      (labeler !== 'l2' || inPass2Sample(t.id)) && (flag('--redo') || !done.has(`${t.id}|${labeler}`)));
    console.log(`\n${B(path.basename(f))}: ${todo.length} to label as ${labeler} (${turns.length} total)`);
    for (let i = 0; i < todo.length; i++) {
      show(todo[i], i, todo.length);
      const r = await labelTurn(todo[i]);
      if (r === 'quit') break outer;
      const row = r === 'skip'
        ? { id: todo[i].id, labeler, ts: new Date().toISOString(), skipped: true }
        : { id: todo[i].id, labeler, ts: new Date().toISOString(), labels: r.labels, ...(r.note ? { note: r.note } : {}) };
      fs.appendFileSync(labelsPath(f), JSON.stringify(row) + '\n');
      total++;
    }
  }
  console.log(`\nsaved ${total} label(s). Resume any time; --stats for counts and agreement.`);
  rl.close();
}

main();
