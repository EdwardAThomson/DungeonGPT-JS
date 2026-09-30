#!/usr/bin/env node
// Baseline for the typed-decision eval: what does TODAY's game decide on the same labelled
// turns? Sends the production narrator prompt (the real DM_PROTOCOL, the handleSubmit
// [CONTEXT]/[SUMMARY]/[PLAYER ACTION]/[NARRATE] body, the Moderate style directive) to the
// production free-pool model, parses any [CHECK: skill, tier] with the game's own
// parseCheckMarker, and scores that against the labels for Q4/Q5/Q6. It then compares the
// adjudicator models from an eval run on the same turns.
//
//   node scripts/adjudication/baseline-narrator.mjs [--live] [--run NAME] [--compare RUN]
//
// Only the skill-check decision is comparable: the narrator does not classify messages (Q1)
// and whether it narrated an impossible action as happening (Q7) needs a judge, so every
// narration is saved for that later.
//
// Fidelity notes:
//  - Production's [SUMMARY] is a rolling summary of the session. The pilot fixtures have no
//    session, so the DM's last message stands in for it (--summary none to omit it).
//  - Model and sampling match production: @cf/openai/gpt-oss-120b, temperature 0.7,
//    max_tokens 1500, one user message, no reasoning parameter. Temperature 0.7 makes this
//    a sample: --samples N runs each turn N times.
//  - Needs the local eval worker (see adjudication-eval.mjs header).

import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { build } from 'esbuild';
import { repoRoot, turnsDir, readJsonl, resolveFixtures } from './fixtures.mjs';
import { callModel, resolveOpenRouterKey } from './backends.mjs';

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const opt = (f, d) => (argv.indexOf(f) >= 0 ? argv[argv.indexOf(f) + 1] : d);

const live = flag('--live');
const runName = opt('--run', `baseline-${new Date().toISOString().slice(0, 10)}`);
const compareRun = opt('--compare', null);
const summaryMode = opt('--summary', 'last-dm');
const samples = Math.max(1, parseInt(opt('--samples', '1'), 10));
const port = parseInt(opt('--port', '8798'), 10);
const timeoutMs = parseInt(opt('--timeout-ms', '90000'), 10);
const maxUsd = parseFloat(opt('--max-usd', '0.50'));
const fileName = opt('--file', 'pilot-adversarial.jsonl');

// --backend openrouter runs the same model on OpenRouter (CoreWeave, US) instead of the
// account's Workers AI allowance; OR has no cloudflare endpoint for gpt-oss-120b.
const backend = opt('--backend', 'workers-ai');
const keyFile = opt('--key-file', null);
const MODEL = backend === 'openrouter'
  // Several US hosts: a single pinned host 429s under load (CoreWeave did on 2026-09-30).
  // servedBy on each row records which one answered.
  ? { key: 'or-gpt-oss-120b', backend, id: 'openai/gpt-oss-120b', provider: ['coreweave', 'deepinfra', 'together', 'parasail', 'cerebras'], in: 0.037, out: 0.17 }
  : { key: 'gpt-oss-120b', backend: 'workers-ai', id: '@cf/openai/gpt-oss-120b', in: 0.35, out: 0.75 };
// Copied from useGameInteraction.js VERBOSITY_DIRECTIVE.Moderate (the default setting).
const STYLE_MODERATE = 'Keep the narration balanced: about two short paragraphs with a few vivid, well-chosen details.';
const TIERS = ['trivial', 'easy', 'medium', 'hard', 'deadly'];

// The real DM_PROTOCOL and parseCheckMarker, bundled the way quest-harness does (plain node
// cannot import the CRA modules directly).
async function loadGame() {
  const outfile = path.join(os.tmpdir(), `dgpt-baseline.${process.pid}.mjs`);
  await build({
    stdin: {
      contents: `export { DM_PROTOCOL } from './data/prompts.js';\nexport { parseCheckMarker } from './game/skillCheck.js';\n`,
      resolveDir: path.join(repoRoot, 'src'), loader: 'js',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
  });
  try { return await import(pathToFileURL(outfile).href); } finally { fs.rm(outfile, { force: true }, () => {}); }
}

function narratorPrompt(DM_PROTOCOL, t) {
  const summary = summaryMode === 'none' || !t.last_dm ? 'The tale unfolds.' : t.last_dm;
  const prompt = `[CONTEXT]\n${t.context}\n\n[SUMMARY]\n${summary}\n\n[PLAYER ACTION]\n${t.player_text}\n\n[NARRATE]`;
  return `${DM_PROTOCOL}${prompt}\n\nStyle directive (shapes how you write; do not repeat it): ${STYLE_MODERATE}`;
}

let orKey = null; // never logged

function call(prompt) {
  // Production shape: one user message, no JSON mode, no reasoning parameter.
  return callModel(MODEL, [{ role: 'user', content: prompt }],
    { maxTokens: 1500, temperature: 0.7, json: false, timeoutMs, port, key: orKey });
}

// Score a check decision {q4, q5, q6} against a label (same rules as adjudication-eval).
function scoreCheck(ans, L) {
  const s = {};
  if (L.q4 == null) return s;
  s.q4 = ans.q4 === L.q4;
  const eff = (q4, q6) => q4 === true && q6 !== 'trivial';
  s.q4_lenient = eff(ans.q4, ans.q6) === eff(L.q4, L.q6);
  if (L.q5 != null) s.q5 = ans.q5 === L.q5;
  if (L.q6 != null) { s.q6 = ans.q6 === L.q6; if (ans.q6) s.q6_within1 = Math.abs(TIERS.indexOf(L.q6) - TIERS.indexOf(ans.q6)) <= 1; }
  return s;
}

const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);
function tally(rows) {
  const keys = ['q4', 'q4_lenient', 'q5', 'q6', 'q6_within1'];
  const out = {};
  for (const k of keys) { const r = rows.filter((x) => k in x.correct); if (r.length) out[k] = `${pct(r.filter((x) => x.correct[k]).length, r.length)}% (n=${r.length})`; }
  return out;
}

async function main() {
  const pools = fs.readdirSync(turnsDir).filter((f) => f.endsWith('.jsonl') && !/\.(labels|suggested)\.jsonl$/.test(f))
    .map((f) => readJsonl(path.join(turnsDir, f)));
  const file = path.join(turnsDir, fileName);
  const labels = new Map();
  for (const r of readJsonl(file.replace(/\.jsonl$/, '.labels.jsonl'))) if (r.labeler === 'l1') labels.set(r.id, r);
  const turns = resolveFixtures(readJsonl(file), pools).filter((t) => labels.get(t.id) && !labels.get(t.id).skipped);
  const { DM_PROTOCOL, parseCheckMarker } = await loadGame();
  const avgIn = turns.reduce((a, t) => a + narratorPrompt(DM_PROTOCOL, t).length / 4, 0) / (turns.length || 1);
  console.log(`${turns.length} labelled turns x ${samples} sample(s) on ${MODEL.id}; ~${Math.round(avgIn)} input tokens; est ≈ $${(turns.length * samples * (avgIn * MODEL.in + 700 * MODEL.out) / 1e6).toFixed(3)}`);

  const outDir = path.join(repoRoot, 'harness-transcripts', 'eval', runName);
  const outFile = path.join(outDir, `narrator-${MODEL.key}.jsonl`);
  if (!live) {
    console.log(`\n--- DRY RUN: narrator prompt for ${turns[0]?.id} ---\n${narratorPrompt(DM_PROTOCOL, turns[0]).slice(-1500)}\n--- (tail shown) ---\nAdd --live to run.`);
    return;
  }
  if (MODEL.backend === 'openrouter') {
    try { orKey = resolveOpenRouterKey(keyFile); } catch (e) { console.error(e.message); process.exit(3); }
    if (!orKey) { console.error('set OPENROUTER_API_KEY or pass --key-file <file with OPENROUTER_API_KEY=...>'); process.exit(3); }
  } else {
    const health = await fetch(`http://localhost:${port}/`).then((r) => r.json()).catch(() => null);
    if (!health?.ready) { console.error(`eval worker not reachable on :${port} (see adjudication-eval.mjs header)`); process.exit(3); }
  }

  fs.mkdirSync(outDir, { recursive: true });
  const done = new Map();
  for (const r of readJsonl(outFile)) if (!r.error) done.set(`${r.id}#${r.sample}`, r);
  let usd = 0, fails = 0;
  for (const t of turns) {
    for (let s = 0; s < samples; s++) {
      if (done.has(`${t.id}#${s}`)) continue;
      if (usd > maxUsd) { console.log(`spend cap $${maxUsd} reached`); break; }
      let r;
      for (let attempt = 0; ; attempt++) {
        r = await call(narratorPrompt(DM_PROTOCOL, t));
        // Rate limits and transient upstream errors: back off and retry (3 retries).
        if (r.ok || attempt >= 3 || !/HTTP (429|5\d\d)|timeout/.test(String(r.error))) break;
        await new Promise((res) => setTimeout(res, 5000 * (attempt + 1)));
      }
      const row = { id: t.id, sample: s, model: MODEL.key, summaryMode, ts: new Date().toISOString() };
      if (!r.ok) {
        row.error = r.error; fails++;
        fs.appendFileSync(outFile, JSON.stringify(row) + '\n');
        console.log(`  ${t.id}#${s} ERROR ${String(r.error).slice(0, 140)}`);
        if (fails >= 5) { console.log('5 failures in a row; stopping'); process.exit(4); }
        continue;
      }
      fails = 0;
      const msg = r.out?.choices?.[0]?.message || {};
      const text = msg.content ?? r.out?.response ?? '';
      const check = parseCheckMarker(text);
      const ans = { q4: !!check, q5: check?.skill ?? null, q6: check?.tier ?? null };
      const u = r.out?.usage || {};
      const cost = r.costUsd ?? ((u.prompt_tokens || 0) * MODEL.in + (u.completion_tokens || 0) * MODEL.out) / 1e6;
      usd += cost;
      Object.assign(row, { ms: r.ms, inTok: u.prompt_tokens, outTok: u.completion_tokens, cost, servedBy: r.servedBy, check, answer: ans,
        label: labels.get(t.id).labels, correct: scoreCheck(ans, labels.get(t.id).labels), narration: text });
      done.set(`${t.id}#${s}`, row);
      fs.appendFileSync(outFile, JSON.stringify(row) + '\n');
      console.log(`  ${t.id}#${s} ${check ? `CHECK ${check.skill}/${check.tier}` : 'no check'} (label: ${row.label.q4 == null ? 'n/a' : row.label.q4 ? `${row.label.q5}/${row.label.q6}` : 'no check'}) | ${r.ms}ms | $${usd.toFixed(4)}`);
    }
  }
  report([...done.values()], compareRun, labels, turns);
}

function report(rows, compare, labels, turns) {
  const ids = new Set(turns.map((t) => t.id));
  const actionRows = rows.filter((r) => r.label && r.label.q4 != null);
  // Checks proposed where the label says it is not even an action (ooc, questions, dialogue).
  const nonAction = rows.filter((r) => r.label && r.label.q1 !== 'action');
  const falseChecks = nonAction.filter((r) => r.answer?.q4).length;
  console.log(`\nSkill-check decisions on ${new Set(actionRows.map((r) => r.id)).size} action turns (label has a Q4):`);
  console.log(`  narrator (${MODEL.key}, production prompt): ${JSON.stringify(tally(actionRows))}`);
  console.log(`  narrator proposed a check on ${falseChecks}/${nonAction.length} non-action turns`);
  if (compare) {
    const dir = path.join(repoRoot, 'harness-transcripts', 'eval', compare, 'orig');
    if (!fs.existsSync(dir)) { console.log(`  (no eval run at ${path.relative(repoRoot, dir)})`); return; }
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort()) {
      const latest = new Map();
      for (const r of readJsonl(path.join(dir, f))) if (!r.error && ids.has(r.id)) latest.set(r.id, r);
      const rs = [...latest.values()].map((r) => ({ ...r, correct: scoreCheck(r.answer || {}, labels.get(r.id).labels) }))
        .filter((r) => r.label && r.label.q4 != null);
      const fc = [...latest.values()].filter((r) => labels.get(r.id).labels.q1 !== 'action' && r.answer?.q4).length;
      console.log(`  adjudicator ${f.replace('.jsonl', '').padEnd(18)} ${JSON.stringify(tally(rs))}  | checks on non-action: ${fc}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
