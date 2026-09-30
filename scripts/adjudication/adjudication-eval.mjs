#!/usr/bin/env node
// Typed-decision adjudication eval (docs/TYPED_DECISION_EVAL_PLAN.md §4): ask each model the
// Q1-Q7 questions for every labelled pilot turn and score the answers against the labels.
//
//   node scripts/adjudication/adjudication-eval.mjs [options]            # DRY RUN (default)
//   node scripts/adjudication/adjudication-eval.mjs --live [options]     # calls models
//   node scripts/adjudication/adjudication-eval.mjs --summarize <run>    # rescore a run
//
// Two backends (scripts/adjudication/backends.mjs):
//  - Workers AI models run through the LOCAL eval worker, which must be running first:
//      cd cf-worker && npx wrangler dev --config ../scripts/adjudication/worker/wrangler.eval.toml --port 8798
//    They draw on the Cloudflare account's Workers AI allowance, which production shares:
//    on the Free plan a full run can exhaust the daily 10k neurons (it did on 2026-09-30).
//  - `or-*` models go to OpenRouter (billed there, provider-pinned). Key from
//    OPENROUTER_API_KEY or --key-file <file with OPENROUTER_API_KEY=...>; never logged.
//
// Options:
//   --models a,b         model keys from MODELS below (default: all)
//   --files a,b          fixture files in harness-transcripts/turns (default: both pilots)
//   --limit N            first N labelled turns per file (smoke tests)
//   --only id,id         just these turns
//   --variant orig|reversed   option order (reversed = order-sensitivity check, plan §4.2)
//   --run NAME           output folder name (default: today's date); re-running resumes
//   --concurrency N      parallel calls per model (default 2)
//   --timeout-ms N       per call (default 45000); --retries N (default 2)
//   --max-usd X          stop when estimated spend passes X (default 0.50)
//   --port N             eval worker port (default 8798)
//
// Output: harness-transcripts/eval/<run>/<variant>/<model>.jsonl (one scored row per turn,
// written as it goes) and harness-transcripts/eval/<run>/summary.json. Gitignored: rows
// contain the fixture text.
//
// Watching a run: every call prints one line (model, turn, answer, ms, tokens, running $).
// A model that fails 5 calls in a row is stopped (usually the daily allowance or a bad
// parameter); the rest carry on. Ctrl+C is safe: completed rows are already on disk.

import fs from 'fs';
import path from 'path';
import { repoRoot, turnsDir, readJsonl, resolveFixtures, loadSkills, QUESTIONS } from './fixtures.mjs';
import { optionsForTurn, buildPrompt, parseAnswer, validateAnswer, PROMPT_VERSION } from './prompt.mjs';
import { callModel, resolveOpenRouterKey } from './backends.mjs';

// ---------------------------------------------------------------- models
// Prices: USD per million tokens from `wrangler ai models list` (2026-09-29). llama-3.1-8b-
// fast is unlisted, so its price is the listed -fp8 sibling's (an estimate).
const WAI = 'workers-ai';
const MODELS = {
  'granite-micro': { backend: WAI, id: '@cf/ibm-granite/granite-4.0-h-micro', in: 0.017, out: 0.112, logprobs: false },
  'llama-3.2-3b': { backend: WAI, id: '@cf/meta/llama-3.2-3b-instruct', in: 0.0509, out: 0.335, logprobs: false },
  'llama-3.1-8b-fast': { backend: WAI, id: '@cf/meta/llama-3.1-8b-instruct-fast', in: 0.152, out: 0.287, logprobs: true },
  'gemma-4-26b': { backend: WAI, id: '@cf/google/gemma-4-26b-a4b-it', in: 0.1, out: 0.3, logprobs: true,
    params: { chat_template_kwargs: { enable_thinking: false } } },
  'glm-4.7-flash': { backend: WAI, id: '@cf/zai-org/glm-4.7-flash', in: 0.0605, out: 0.4, logprobs: true,
    params: { chat_template_kwargs: { enable_thinking: false } } },
  'gpt-oss-20b': { backend: WAI, id: '@cf/openai/gpt-oss-20b', in: 0.2, out: 0.3, logprobs: true, maxTokens: 1200,
    params: { reasoning: { effort: 'low' } } },
  // OpenRouter twins (prices from openrouter.ai/api/v1/models, 2026-09-30; live usage.cost
  // wins when returned). Pinned providers verified against /models/:id/endpoints the same
  // day: `cloudflare` is Workers AI itself resold, so those rows match production inference.
  // llama-3.1-8b on OR's cloudflare is the slow -fp8 variant without logprobs, so it runs on
  // CoreWeave (same weights as -fast, different host); gpt-oss has no cloudflare endpoint.
  'or-gemma-4-26b': { backend: 'openrouter', id: 'google/gemma-4-26b-a4b-it', provider: ['cloudflare'], in: 0.09, out: 0.3, logprobs: true,
    params: { reasoning: { enabled: false } } },
  'or-glm-4.7-flash': { backend: 'openrouter', id: 'z-ai/glm-4.7-flash', provider: ['cloudflare'], in: 0.061, out: 0.4, logprobs: true,
    params: { reasoning: { enabled: false } } },
  'or-llama-3.1-8b': { backend: 'openrouter', id: 'meta-llama/llama-3.1-8b-instruct', provider: ['coreweave'], in: 0.05, out: 0.08, logprobs: true },
  'or-gpt-oss-20b': { backend: 'openrouter', id: 'openai/gpt-oss-20b', provider: ['coreweave'], in: 0.018, out: 0.09, logprobs: true, maxTokens: 1200,
    params: { reasoning: { effort: 'low' } } },
  // GPT-6 Luna as a plain chat model (the model behind OpenAI's Decisions API preview, not
  // that API itself). Reasoning model, no logprobs on OpenRouter; effort low to match gpt-oss.
  'or-gpt-6-luna': { backend: 'openrouter', id: 'openai/gpt-6-luna', provider: ['openai'], in: 0.1, out: 0.5, logprobs: false, maxTokens: 1200,
    params: { reasoning: { effort: 'low' } } },
};

// ---------------------------------------------------------------- args
const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const opt = (f, d) => (argv.indexOf(f) >= 0 ? argv[argv.indexOf(f) + 1] : d);
const list = (f) => (opt(f, '') ? opt(f, '').split(',').map((s) => s.trim()).filter(Boolean) : null);

const live = flag('--live');
const variant = opt('--variant', 'orig');
const runName = opt('--summarize', null) || opt('--run', new Date().toISOString().slice(0, 10));
const runDir = path.join(repoRoot, 'harness-transcripts', 'eval', runName);
const modelKeys = list('--models') || Object.keys(MODELS);
const fileNames = list('--files') || ['pilot-adversarial.jsonl', 'pilot-harness.jsonl'];
const limit = parseInt(opt('--limit', '0'), 10) || 0;
const only = list('--only') ? new Set(list('--only')) : null;
const concurrency = Math.max(1, parseInt(opt('--concurrency', '2'), 10));
const timeoutMs = parseInt(opt('--timeout-ms', '45000'), 10);
const retries = parseInt(opt('--retries', '2'), 10);
const maxUsd = parseFloat(opt('--max-usd', '0.50'));
const port = parseInt(opt('--port', '8798'), 10);
const keyFile = opt('--key-file', null);

for (const k of modelKeys) if (!MODELS[k]) { console.error(`unknown model ${k}; known: ${Object.keys(MODELS).join(', ')}`); process.exit(2); }
if (!['orig', 'reversed'].includes(variant)) { console.error('--variant must be orig or reversed'); process.exit(2); }

// ---------------------------------------------------------------- data
function loadTurns() {
  const pools = fs.readdirSync(turnsDir).filter((f) => f.endsWith('.jsonl') && !/\.(labels|suggested)\.jsonl$/.test(f))
    .map((f) => readJsonl(path.join(turnsDir, f)));
  const out = [];
  for (const name of fileNames) {
    const file = path.join(turnsDir, name);
    const labels = new Map();
    for (const r of readJsonl(file.replace(/\.jsonl$/, '.labels.jsonl'))) if (r.labeler === 'l1') labels.set(r.id, r);
    let turns = resolveFixtures(readJsonl(file), pools)
      .map((t) => ({ ...t, file: name, label: labels.get(t.id) }))
      .filter((t) => t.label && !t.label.skipped && (!only || only.has(t.id)));
    if (limit) turns = turns.slice(0, limit);
    out.push(...turns);
  }
  return out;
}

// ---------------------------------------------------------------- scoring
const TIERS = ['trivial', 'easy', 'medium', 'hard', 'deadly'];

function score(answer, label) {
  const L = label.labels;
  const s = {};
  for (const q of QUESTIONS) {
    if (L[q.key] === null || L[q.key] === undefined) continue; // not applicable per the label
    s[q.key] = answer ? answer[q.key] === L[q.key] : false;
  }
  if (L.q6 && answer?.q6) s.q6_within1 = Math.abs(TIERS.indexOf(L.q6) - TIERS.indexOf(answer.q6)) <= 1;
  // Plan §6.1 rule 4: a trivial check auto-passes, so "check, trivial" and "no check" play
  // identically. Lenient Q4 treats them as equal.
  if (L.q4 !== null && L.q4 !== undefined) {
    const eff = (q4, q6) => q4 === true && q6 !== 'trivial';
    s.q4_lenient = answer ? eff(answer.q4, answer.q6) === eff(L.q4, L.q6) : false;
  }
  return s;
}

// Per-option probabilities for one answer field from the token logprobs: find where the
// field's value starts in the generated JSON and read that token's top alternatives. Only
// tokens that are a prefix of exactly one option count; the rest is reported as unassigned.
function fieldProbs(lp, key, options) {
  const toks = lp?.content;
  if (!Array.isArray(toks) || !toks.length) return null;
  let text = '';
  const starts = toks.map((t) => { const s = text.length; text += t.token; return s; });
  const re = new RegExp(`"${key}"\\s*:\\s*`, 'g');
  let m, at = -1;
  while ((m = re.exec(text))) at = m.index + m[0].length; // last occurrence = the final JSON
  if (at < 0) return null;
  let i = starts.findIndex((s, k) => s <= at && at < s + toks[k].token.length);
  if (i < 0) return null;
  // A bare quote token carries no information; the choice is made on the next token.
  if (/^\s*"\s*$/.test(toks[i].token) && toks[i + 1]) i += 1;
  const names = options.map((o) => String(o).toLowerCase());
  const probs = Object.fromEntries(names.map((n) => [n, 0]));
  let unassigned = 0;
  for (const alt of toks[i].top_logprobs || []) {
    const t = alt.token.replace(/^\s*"?/, '').toLowerCase();
    const p = Math.exp(alt.logprob);
    const hits = t ? names.filter((n) => n.startsWith(t) || t.startsWith(n)) : [];
    if (hits.length === 1) probs[hits[0]] += p; else unassigned += p;
  }
  return { probs, unassigned: +unassigned.toFixed(4) };
}

// ---------------------------------------------------------------- calling
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let orKey = null; // resolved in main() only if an OpenRouter model is selected; never logged

function callAdjudicator(model, system, user) {
  return callModel(model, [{ role: 'system', content: system }, { role: 'user', content: user }],
    { maxTokens: model.maxTokens || 400, temperature: 0, json: true, timeoutMs, port, key: orKey });
}

function extract(out) {
  const choice = out?.choices?.[0];
  let text = choice?.message?.content ?? out?.response ?? null;
  if (text && typeof text === 'object') text = JSON.stringify(text); // JSON mode may return an object
  const usage = out?.usage || {};
  return { text, logprobs: choice?.logprobs || null, inTok: usage.prompt_tokens, outTok: usage.completion_tokens };
}

async function runModel(key, turns, skills, spend) {
  const model = MODELS[key];
  const outFile = path.join(runDir, variant, `${key}.jsonl`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const done = new Set(readJsonl(outFile).filter((r) => !r.error).map((r) => r.id));
  const todo = turns.filter((t) => !done.has(t.id));
  console.log(`\n== ${key} (${model.id}): ${todo.length} to run, ${done.size} already done`);
  let consecutiveFails = 0;
  let idx = 0;
  let stopped = null;

  async function worker() {
    while (idx < todo.length && !stopped) {
      const t = todo[idx++];
      const opts = optionsForTurn(t, skills, { reverse: variant === 'reversed' });
      const { system, user } = buildPrompt(t, skills, opts);
      let r, attempt = 0;
      for (;;) {
        r = await callAdjudicator(model, system, user);
        if (r.ok || attempt >= retries) break;
        attempt++;
        await sleep(1000 * attempt);
      }
      const row = { id: t.id, file: t.file, model: key, backend: model.backend, variant, prompt: PROMPT_VERSION, ts: new Date().toISOString() };
      if (!r.ok) {
        consecutiveFails++;
        row.error = r.error;
        fs.appendFileSync(outFile, JSON.stringify(row) + '\n');
        console.log(`  ${key} ${t.id} ERROR ${String(r.error).slice(0, 160)}`);
        if (consecutiveFails >= 5) stopped = `5 consecutive failures (last: ${String(r.error).slice(0, 120)})`;
        continue;
      }
      consecutiveFails = 0;
      const { text, logprobs, inTok, outTok } = extract(r.out);
      const { answer, problems } = validateAnswer(parseAnswer(text), opts);
      const inT = inTok ?? Math.round((system.length + user.length) / 4);
      const outT = outTok ?? Math.round((text || '').length / 4);
      // OpenRouter reports the real charge; otherwise estimate from list prices.
      const cost = r.costUsd ?? (inT * model.in + outT * model.out) / 1e6;
      spend.usd += cost;
      const probs = {};
      if (logprobs) for (const k of ['q1', 'q2', 'q4', 'q7']) { const p = fieldProbs(logprobs, k, opts[k]); if (p) probs[k] = p; }
      Object.assign(row, {
        answer, problems, ms: r.ms, inTok: inT, outTok: outT, cost: +cost.toFixed(7), servedBy: r.servedBy,
        ...(Object.keys(probs).length ? { probs } : {}),
        label: t.label.labels, correct: score(answer, t.label),
        ...(answer ? {} : { raw: (text || '').slice(0, 400) }),
      });
      fs.appendFileSync(outFile, JSON.stringify(row) + '\n');
      const ok = Object.values(row.correct).filter(Boolean).length;
      console.log(`  ${key} ${t.id} q1=${answer?.q1 ?? '∅'}${answer?.q7 ? ' IMPOSSIBLE' : ''}` +
        ` | ${ok}/${Object.keys(row.correct).length} ok | ${r.ms}ms ${inT}+${outT}tok | $${spend.usd.toFixed(4)}` +
        (problems.length ? ` | bad: ${problems.join(' ')}` : ''));
      if (spend.usd > maxUsd) stopped = `spend cap $${maxUsd} reached`;
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  if (stopped) console.log(`  !! ${key} stopped: ${stopped}`);
}

// ---------------------------------------------------------------- summary
const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);
const quantile = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null; };

function summarize() {
  const summary = { run: runName, generated: new Date().toISOString(), models: {} };
  const variants = fs.existsSync(runDir) ? fs.readdirSync(runDir).filter((d) => fs.statSync(path.join(runDir, d)).isDirectory()) : [];
  const byModelVariant = {};
  for (const v of variants) {
    for (const f of fs.readdirSync(path.join(runDir, v)).filter((f) => f.endsWith('.jsonl'))) {
      const key = f.replace(/\.jsonl$/, '');
      const latest = new Map();
      for (const r of readJsonl(path.join(runDir, v, f))) if (!r.error || !latest.has(r.id)) latest.set(r.id, r);
      byModelVariant[`${key}|${v}`] = [...latest.values()];
    }
  }
  for (const [mv, rows] of Object.entries(byModelVariant)) {
    const [key, v] = mv.split('|');
    const good = rows.filter((r) => !r.error);
    const s = { variant: v, prompt: [...new Set(rows.map((r) => r.prompt || 'v1'))].join('+'), turns: rows.length, errors: rows.length - good.length };
    s.schemaValid = pct(good.filter((r) => r.answer && !r.problems.length).length, good.length);
    const keys = [...QUESTIONS.map((q) => q.key), 'q6_within1', 'q4_lenient'];
    s.accuracy = {};
    for (const k of keys) {
      const scored = good.filter((r) => k in r.correct);
      if (scored.length) s.accuracy[k] = { pct: pct(scored.filter((r) => r.correct[k]).length, scored.length), n: scored.length };
    }
    // Q1 balanced accuracy: mean per-class recall (classes are very imbalanced).
    const classes = [...new Set(good.map((r) => r.label.q1))];
    const recalls = classes.map((c) => { const g = good.filter((r) => r.label.q1 === c); return g.filter((r) => r.answer?.q1 === c).length / g.length; });
    s.q1Balanced = recalls.length ? Math.round((100 * recalls.reduce((a, b) => a + b, 0)) / recalls.length) : null;
    s.q1ByClass = Object.fromEntries(classes.map((c, i) => [c, { recall: Math.round(100 * recalls[i]), n: good.filter((r) => r.label.q1 === c).length }]));
    // Split by source: the hand-written turns are the hard ones; harness turns are easy.
    for (const src of ['pilot-adversarial.jsonl', 'pilot-harness.jsonl']) {
      const g = good.filter((r) => r.file === src);
      if (g.length) s[`q1_${src.startsWith('pilot-adv') ? 'hand' : 'harness'}`] = { pct: pct(g.filter((r) => r.correct.q1).length, g.length), n: g.length };
    }
    const ms = good.map((r) => r.ms).filter(Number.isFinite);
    s.latencyMs = { p50: quantile(ms, 0.5), p95: quantile(ms, 0.95) };
    s.cost = { total: +good.reduce((a, r) => a + (r.cost || 0), 0).toFixed(5), perTurn: good.length ? +(good.reduce((a, r) => a + (r.cost || 0), 0) / good.length).toFixed(7) : null };
    s.meanTokens = { in: Math.round(good.reduce((a, r) => a + (r.inTok || 0), 0) / (good.length || 1)), out: Math.round(good.reduce((a, r) => a + (r.outTok || 0), 0) / (good.length || 1)) };
    // Q1 confidence where logprobs exist: mean probability given to the chosen answer.
    const conf = good.map((r) => r.probs?.q1?.probs?.[String(r.answer?.q1).toLowerCase()]).filter((x) => typeof x === 'number');
    if (conf.length) s.q1MeanConfidence = +(conf.reduce((a, b) => a + b, 0) / conf.length).toFixed(3);
    summary.models[mv] = s;
  }
  // Order consistency: same model, same turn, orig vs reversed option order.
  for (const key of new Set(Object.keys(byModelVariant).map((k) => k.split('|')[0]))) {
    const a = byModelVariant[`${key}|orig`], b = byModelVariant[`${key}|reversed`];
    if (!a || !b) continue;
    const bm = new Map(b.filter((r) => !r.error).map((r) => [r.id, r]));
    const pairs = a.filter((r) => !r.error && bm.has(r.id));
    const same = (k) => pct(pairs.filter((r) => r.answer?.[k] === bm.get(r.id).answer?.[k]).length, pairs.length);
    summary.models[`${key}|orig`].orderConsistency = { q1: same('q1'), q4: same('q4'), q7: same('q7'), n: pairs.length };
  }
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));

  const rows = Object.entries(summary.models).sort();
  const a = (s, k) => (s.accuracy[k] ? `${s.accuracy[k].pct}` : '-');
  console.log(`\nrun ${runName}  (accuracy % vs labels; n per question varies)\n`);
  console.log('model|variant'.padEnd(28) + 'turns valid% Q1 Q1bal Q1hand Q2 Q3 Q4 Q4len Q5 Q6 Q6±1 Q7  p50ms p95ms  $/turn   conf');
  for (const [mv, s] of rows) {
    console.log(mv.padEnd(28) + [s.turns, s.schemaValid, a(s, 'q1'), s.q1Balanced, s.q1_hand?.pct ?? '-', a(s, 'q2'), a(s, 'q3'),
      a(s, 'q4'), a(s, 'q4_lenient'), a(s, 'q5'), a(s, 'q6'), a(s, 'q6_within1'), a(s, 'q7'),
      s.latencyMs.p50, s.latencyMs.p95, s.cost.perTurn, s.q1MeanConfidence ?? '-'].map((x) => String(x ?? '-').padStart(5)).join(' '));
  }
  console.log(`\nsummary -> ${path.relative(repoRoot, path.join(runDir, 'summary.json'))}`);
}

// ---------------------------------------------------------------- main
async function main() {
  if (opt('--summarize', null)) { summarize(); return; }
  const skills = loadSkills();
  const turns = loadTurns();
  const nHand = turns.filter((t) => t.file === 'pilot-adversarial.jsonl').length;
  console.log(`${turns.length} labelled turns (${nHand} hand-written, ${turns.length - nHand} harness); models: ${modelKeys.join(', ')}; variant ${variant}`);

  // Estimate from the real prompts before spending anything.
  let est = 0;
  const sample = turns.slice(0, 20);
  const avgIn = sample.reduce((a, t) => { const { system, user } = buildPrompt(t, skills, optionsForTurn(t, skills)); return a + (system.length + user.length) / 4; }, 0) / (sample.length || 1);
  for (const k of modelKeys) est += turns.length * (avgIn * MODELS[k].in + 150 * MODELS[k].out) / 1e6;
  console.log(`~${Math.round(avgIn)} input tokens per turn; estimated cost ≈ $${est.toFixed(3)} (cap $${maxUsd})`);

  if (!live) {
    const t = turns[0];
    if (t) {
      const { system, user } = buildPrompt(t, skills, optionsForTurn(t, skills, { reverse: variant === 'reversed' }));
      console.log(`\n--- DRY RUN: prompt for ${t.id} ---\n[system]\n${system}\n\n[user]\n${user}\n--- end ---`);
    }
    console.log('\nDry run only. Start the eval worker (see header), then add --live.');
    return;
  }

  if (modelKeys.some((k) => MODELS[k].backend === 'openrouter')) {
    try { orKey = resolveOpenRouterKey(keyFile); } catch (e) { console.error(e.message); process.exit(3); }
    if (!orKey) { console.error('OpenRouter models selected: set OPENROUTER_API_KEY or pass --key-file <file with OPENROUTER_API_KEY=...>'); process.exit(3); }
  }
  if (modelKeys.some((k) => MODELS[k].backend === WAI)) {
    const health = await fetch(`http://localhost:${port}/`).then((r) => r.json()).catch(() => null);
    if (!health?.ready) {
      console.error(`eval worker not reachable on :${port}. Start it:\n  cd cf-worker && npx wrangler dev --config ../scripts/adjudication/worker/wrangler.eval.toml --port ${port}`);
      process.exit(3);
    }
  }
  const spend = { usd: 0 };
  for (const k of modelKeys) {
    if (spend.usd > maxUsd) { console.log(`spend cap reached; skipping ${k}`); continue; }
    await runModel(k, turns, skills, spend);
  }
  summarize();
}

main().catch((e) => { console.error(e); process.exit(1); });
