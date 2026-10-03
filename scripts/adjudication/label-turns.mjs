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
//   --only <id,id,..>  just these turns (re-answering replaces the earlier answer)
//   --show-probe       show the hand-written turn's intent tag (off by default: it biases)
//   --spot-check <N>   review N random auto-labelled turns (autolabel-harness.mjs), answers
//                      pre-filled; your answer replaces the auto label
//   --no-suggest       ignore <fixtures>.suggested.jsonl (--pass2 always ignores it)
//   --stats            print label counts, suggestion override rates and l1-vs-l2
//                      agreement, then exit
//
// Keys at any question: number = choose, Enter = accept the suggestion (when one is shown),
// b = back, s = skip turn, q = save and quit.
//
// Suggestions (<fixtures>.suggested.jsonl, one {id, labels} per line) are pre-filled
// answers. They speed labelling up but anchor the labeller, so every row records which
// answers overrode a suggestion, --stats reports override rates, and --pass2 runs without
// them so the double-labelled sample measures agreement free of that anchor.
//
// Label rules (keep consistent; from the plan):
//   Q1 talk_to_npc = speech aimed at a specific named NPC, present or not (Q7 then says
//      whether they are actually here); "I ask around" is action/persuade.
//   Q4 = would a human DM call for a roll? trivial/obvious = no; contested/uncertain = yes.
//      Asked for talk_to_npc too: plain conversation = no, but persuading, deceiving,
//      intimidating or reading a named NPC can be a roll.
//      Unsure -> yes with tier trivial.
//   Precedence: addressed to a named NPC -> talk_to_npc, even if it is also an acceptance or
//      includes a move ("go to X and speak with Y"); continue = bare acknowledgement only.
//      It matters: talk_to_npc routes to the talk path, which completes talk objectives.
//   Q1 unclear = no clear reading (place addressed as a person, "him" with no referent):
//      the DM should ask. A clear request that cannot happen is action + Q7 instead.
//   Q7 = physically impossible or contradicts the state (target not present, ability the
//      party lacks), including player mistakes whose intent is clear: the DM corrects the
//      premise. Not "unwise". Unclear intent -> Q1 unclear.

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { turnsDir, readJsonl, resolveFixtures, loadSkills, QUESTIONS, shortHash } from './fixtures.mjs';

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const opt = (f, d) => (argv.indexOf(f) >= 0 ? argv[argv.indexOf(f) + 1] : d);
const files = argv.filter((a, i) => a.endsWith('.jsonl') && argv[i - 1] !== '--labeler');
const only = opt('--only', '') ? new Set(opt('--only', '').split(',').map((x) => x.trim())) : null;
const inputs = files.length ? files.map((f) => path.resolve(f))
  : ['pilot-adversarial.jsonl', 'pilot-harness.jsonl'].map((f) => path.join(turnsDir, f));
const labeler = flag('--pass2') ? 'l2' : opt('--labeler', 'l1');
const spotCheck = parseInt(opt('--spot-check', '0'), 10) || 0;
const useSuggestions = !flag('--pass2') && !flag('--no-suggest');
const suggestedPath = (f) => f.replace(/\.jsonl$/, '.suggested.jsonl');
const loadSuggestions = (f) => new Map(readJsonl(suggestedPath(f)).map((r) => [r.id, r.labels]));

const labelsPath = (f) => f.replace(/\.jsonl$/, '.labels.jsonl');
const latestLabels = (f) => {
  const m = new Map();
  for (const r of readJsonl(labelsPath(f))) m.set(`${r.id}|${r.labeler}`, r);
  return m;
};

// Every fixture file in turnsDir is a context_ref pool.
const poolFiles = fs.existsSync(turnsDir)
  ? fs.readdirSync(turnsDir).filter((f) => f.endsWith('.jsonl') && !/\.(labels|suggested)\.jsonl$/.test(f)).map((f) => path.join(turnsDir, f))
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
    const auto = labels.filter((r) => r.labeler === 'l1' && r.auto).length;
    if (auto) console.log(`  (${auto} of these are auto-labelled; spot-check with --spot-check N)`);
    const reviewed = labels.filter((r) => r.suggested);
    if (reviewed.length) {
      const over = {};
      for (const r of reviewed) for (const k of r.overrides || []) over[k] = (over[k] || 0) + 1;
      const turnsChanged = reviewed.filter((r) => (r.overrides || []).length).length;
      console.log(`  suggestions: ${turnsChanged}/${reviewed.length} turns overridden` +
        (Object.keys(over).length ? ` (${Object.entries(over).map(([k, v]) => `${k}=${v}`).join(' ')})` : ''));
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
  // Named NPCs from the scene, then: unnamed background people who are plausibly present
  // (tavern patrons, a crowd), a party member, an object or place (the bar, a door, the
  // ridge), one specific person not in the list (e.g. an innkeeper in the wilderness; pair
  // with Q7), or no target at all.
  if (q.type === 'target') return [...turn.targets, 'unnamed locals (crowd/background)', 'party member', 'object/place (not a person)', 'other (not listed)', 'none'];
  return q.options;
}

// Which questions apply given the answers so far (plan §2: Q2-Q7 only matter for actions;
// dialogue still gets a target).
function applies(q, a) {
  if (q.key === 'q1') return true;
  if (q.key === 'q3') return a.q1 === 'action' || a.q1 === 'talk_to_npc';
  if (q.onlyIf === 'action') return a.q1 === 'action';
  if (q.onlyIf === 'action_or_talk') return a.q1 === 'action' || a.q1 === 'talk_to_npc';
  if (q.onlyIf === 'check') return (a.q1 === 'action' || a.q1 === 'talk_to_npc') && a.q4 === true;
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
  if (turn.last_dm) {
    // The DM message being replied to; long narrations are cut from the front, since the
    // end (the offer / question) is what a reply answers.
    const dm = turn.last_dm.length > 900 ? '…' + turn.last_dm.slice(-900) : turn.last_dm;
    console.log('\n' + B('  DM (last message):'));
    for (const para of dm.split(/\n+/)) console.log('  ' + para);
  } else {
    console.log('\n' + DIM('  (no previous DM message)'));
  }
  console.log('\n' + B('  PLAYER: ') + turn.player_text + '\n');
}

const fmt = (v) => (v === true ? 'yes' : v === false ? 'no' : v);

async function labelTurn(turn, sug) {
  const a = {};
  const order = QUESTIONS;
  for (let qi = 0; qi < order.length; ) {
    const q = order[qi];
    if (!applies(q, a)) { a[q.key] = null; qi++; continue; }
    const opts = optionsFor(q, turn);
    const menu = opts.map((o, k) => `${k + 1}) ${o}${q.help?.[o] ? DIM('  ' + q.help[o]) : ''}`);
    const cols = opts.length > 8 ? 3 : 1;
    const rows = [];
    for (let r = 0; r < Math.ceil(menu.length / cols); r++) {
      rows.push(menu.slice(r * cols, r * cols + cols).map((s) => s.padEnd(26)).join(''));
    }
    // A suggestion only counts if it is a valid option on this menu.
    const sv = sug && sug[q.key] != null && opts.includes(fmt(sug[q.key])) ? sug[q.key] : undefined;
    const hint = sv !== undefined ? `\n  ${B('Enter = ' + fmt(sv))}` : '';
    let ans = (await ask(`${B(q.key.toUpperCase() + ' ' + q.text)}\n  ${rows.join('\n  ')}${hint}\n> `)).toLowerCase();
    if (ans === '' && sv !== undefined) ans = String(opts.indexOf(fmt(sv)) + 1);
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
    // A specific person the menu could not list: record who, for later review.
    if (q.type === 'target' && v === 'other (not listed)') {
      const def = sug?.q3 === v && sug.q3_other ? sug.q3_other : '';
      const who = await ask(DIM(`  who? (name or description${def ? `, Enter = ${def}` : ', enter to skip'}): `)) || def;
      if (who) a.q3_other = who; else delete a.q3_other;
    } else if (q.type === 'target') {
      delete a.q3_other;
    }
    qi++;
  }
  const note = await ask(DIM('note (enter to skip): '));
  const overrides = sug
    // Only questions that carried a suggestion can be overridden.
    ? [...QUESTIONS.map((q) => q.key), 'q3_other'].filter((k) => k in sug && (sug[k] ?? null) !== (a[k] ?? null))
    : undefined;
  return { labels: a, note: note || undefined, overrides };
}

async function main() {
  let total = 0;
  outer: for (const f of inputs) {
    if (!fs.existsSync(f)) { console.log(`missing ${f} (run turns-from-harness.mjs first?)`); continue; }
    const turns = resolveFixtures(readJsonl(f), pools);
    const done = latestLabels(f);
    const suggestions = useSuggestions ? loadSuggestions(f) : new Map();
    let todo;
    if (spotCheck) {
      // A fixed pseudo-random sample of auto-labelled turns, reviewed with the auto answer
      // pre-filled (from the suggestions file, or the auto label itself).
      const autoIds = new Set([...done.values()].filter((r) => r.labeler === labeler && r.auto).map((r) => r.id));
      todo = turns.filter((t) => autoIds.has(t.id))
        .sort((x, y) => shortHash('spot|' + x.id).localeCompare(shortHash('spot|' + y.id)))
        .slice(0, spotCheck);
      for (const t of todo) if (!suggestions.has(t.id)) suggestions.set(t.id, done.get(`${t.id}|${labeler}`).labels);
    } else {
      todo = turns.filter((t) =>
        only ? only.has(t.id)
          : (labeler !== 'l2' || inPass2Sample(t.id)) && (flag('--redo') || !done.has(`${t.id}|${labeler}`)));
    }
    console.log(`\n${B(path.basename(f))}: ${todo.length} to label as ${labeler} (${turns.length} total)`);
    for (let i = 0; i < todo.length; i++) {
      show(todo[i], i, todo.length);
      const sug = suggestions.get(todo[i].id);
      const r = await labelTurn(todo[i], sug);
      if (r === 'quit') break outer;
      const row = r === 'skip'
        ? { id: todo[i].id, labeler, ts: new Date().toISOString(), skipped: true }
        : { id: todo[i].id, labeler, ts: new Date().toISOString(), labels: r.labels, ...(r.note ? { note: r.note } : {}),
            ...(sug ? { suggested: true, overrides: r.overrides } : {}) };
      fs.appendFileSync(labelsPath(f), JSON.stringify(row) + '\n');
      total++;
    }
  }
  console.log(`\nsaved ${total} label(s). Resume any time; --stats for counts and agreement.`);
  rl.close();
}

main();
