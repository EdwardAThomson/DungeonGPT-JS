#!/usr/bin/env node
// ============================================================================
// quest-harness.mjs — headless quest-prompt tester for DungeonGPT campaigns
// ============================================================================
//
// WHAT IT DOES
// ------------
// Composes the REAL new-game opening prompts for a chosen campaign template
// (scene + objective, exactly as the app builds them at "Start Adventure"),
// optionally a couple of follow-up turns, and — only in --live mode — sends
// them to the OpenRouter premium pool (the same endpoint/model the production
// worker uses), printing each stage's response, token usage, and running cost.
//
// It exists to eyeball prompt/quality behaviour without clicking through the UI.
// Because it can spend real money, it is DRY-RUN by default and every request
// is gated behind hard, enforced guards (see below). Nothing is sent unless you
// pass BOTH --live AND --yes.
//
// HOW TO SUPPLY THE KEY (only needed for --live)
// ----------------------------------------------
//   * Env var:   OPENROUTER_API_KEY=sk-or-...  node scripts/quest-harness.mjs --live --yes
//   * Key file:  node scripts/quest-harness.mjs --live --yes --key-file path/to/file
//                (the file must contain a line  OPENROUTER_API_KEY=sk-or-...)
// The key is read ONLY from process.env.OPENROUTER_API_KEY or the --key-file you
// point at. It is NEVER printed, logged, or written anywhere (all output is
// redacted). This script does NOT scan the filesystem for a key and does NOT
// read .env / .dev.vars unless you explicitly aim --key-file at one.
//
// THE GUARDS (all enforced BEFORE any network request) and their defaults
// -----------------------------------------------------------------------
//   --max-tokens N          per-request output cap        default 400  (hard ceiling 800)
//   --max-prompt-tokens N   per-request input cap (est.)  default 6000 (refuse if over)
//   --tpm N                 tokens/minute (sliding 60s)   default 20000
//   --rpm N                 requests/minute (sliding 60s) default 10
//   --max-requests N        per-run request budget        default 12
//   --max-total-tokens N    per-run cumulative tokens     default 40000
//   --max-usd N             per-run cost ceiling (USD)    default 0.25
//   --price-in N            USD / 1M input tokens         default 1.00  (Haiku 4.5 — VERIFY)
//   --price-out N           USD / 1M output tokens        default 5.00  (Haiku 4.5 — VERIFY)
//   --on-limit abort|wait   rate-window breach behaviour  default abort
//
// SAFETY DEFAULTS: dry-run unless BOTH --live and --yes are passed. Token
// estimate is ~chars/4. In dry-run, completion tokens are estimated as the full
// --max-tokens (worst case) for budget accounting.
//
// NOTE ON PROMPT COMPOSITION: the opening prompts are REPLICATED from
// src/hooks/useGameInteraction.js (handleStartAdventure: the SCENE and OBJECTIVE
// prompt strings + formatStartObjective + generateResponse's DM_PROTOCOL/style
// wrap) and from getMilestoneStatus. This is a copy, so it CAN DRIFT from the
// hook. A future refactor should extract a shared pure builder both consume.
//
// RECORDED PLAYTHROUGH (--playthrough): composes and RECORDS the whole "spine" of
// a campaign — the opening, then ONE scripted player turn per milestone (in
// completion order, respecting `requires`) that would drive that milestone — so a
// maintainer can read the real premium-AI prompts and responses end to end without
// playing turn by turn. The OPENING is faithful to handleStartAdventure: it uses the
// REAL shared introComposer.composeIntro (imported, not replicated) to build the
// authored opening, records it deterministically (no request), then makes the single
// opening REQUEST the bounded [ADVENTURE START - POLISH] reword pass, whose result is
// judged by a REPLICATED isPolishSafe (accept => show polished; reject => fall back to
// the authored text). The polish prompt + isPolishSafe are still copied from the hook
// and CAN DRIFT (a future refactor should share them too). Each milestone turn REPLICATES
// the in-game turn the app
// sends in useGameInteraction.handleSubmit: the `[CONTEXT] … [SUMMARY] … [PLAYER
// ACTION] … [NARRATE]` body (gameContext = Setting/Mood/Goal + formatMilestonePromptText
// grounding + location context + party), wrapped by generateResponse's
// DM_PROTOCOL + style directive. Because this is a COPY of the hook's composition,
// it CAN DRIFT from the app (a future refactor should extract one shared builder the
// hook and this harness both call). It obeys every guard exactly like AI mode and is
// DRY-RUN unless BOTH --live AND --yes are passed. Every prompt + response is written
// to a timestamped Markdown transcript under harness-transcripts/ (gitignored).
//
// SWEEP (--playthrough --all): runs the recorded playthrough for EVERY playable campaign
// (and every premium template when --premium-dir is given), writing one transcript per
// campaign plus a single aggregate sweep-summary. The guards are enforced CUMULATIVELY
// across the whole sweep (the running request/token/USD tallies carry across campaigns),
// so it hard-stops the instant the next request would cross --max-requests /
// --max-total-tokens / --max-usd and marks the remaining campaigns skipped. The aggregate
// summary + all console output stay STRUCTURAL for premium campaigns (ids, counts, flags,
// marker yes/no) — no premium prose leaks; premium prose only ever lands in the local,
// gitignored per-campaign transcript. Dry-run projects the full-sweep request count + cost.
// ============================================================================

import { build } from 'esbuild';
import { pathToFileURL } from 'url';
import path from 'path';
import os from 'os';
import fs from 'fs';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// ---------------------------------------------------------------------------
// Constants mirrored from the app
// ---------------------------------------------------------------------------
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
// cf-worker/src/services/openrouter.ts: DEFAULT_PREMIUM_MODEL_ID (cheap default).
const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5';
// cf-worker clamps premium output; we mirror the hard ceiling.
const HARD_MAX_TOKENS_CEILING = 800;

// VERBOSITY_DIRECTIVE replicated from src/hooks/useGameInteraction.js.
const VERBOSITY_DIRECTIVE = {
  Concise: 'Keep the narration tight and brisk: roughly one short paragraph (2-3 sentences). Favour momentum and clarity over lengthy description.',
  Moderate: 'Keep the narration balanced: about two short paragraphs with a few vivid, well-chosen details.',
  Descriptive: 'Write richly and atmospherically: three or more paragraphs with strong sensory detail, mood, and texture.'
};

// ---------------------------------------------------------------------------
// Key handling — read ONLY from env or --key-file; never print it.
// ---------------------------------------------------------------------------
function readKey(keyFilePath) {
  const envKey = process.env.OPENROUTER_API_KEY;
  if (envKey && envKey.trim()) return envKey.trim();

  if (keyFilePath) {
    let raw;
    try {
      raw = fs.readFileSync(keyFilePath, 'utf8');
    } catch (err) {
      // Redact any accidental key material from the error surface (there is none
      // here, but keep the discipline uniform).
      throw new Error(`Could not read --key-file at "${keyFilePath}": ${err.code || err.message}`);
    }
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*OPENROUTER_API_KEY\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^['"]|['"]$/g, '').trim();
    }
    throw new Error(`--key-file "${keyFilePath}" contains no line of the form OPENROUTER_API_KEY=...`);
  }
  return null;
}

// Defence in depth: strip the key from anything we print, even in errors.
function makeRedactor(key) {
  return (s) => {
    if (!key || typeof s !== 'string') return s;
    return s.split(key).join('***REDACTED***');
  };
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------
const FLAG_DEFAULTS = {
  campaign: 'heroic-fantasy-t1',
  mode: 'ai',
  steps: 1,
  model: DEFAULT_MODEL,
  'max-tokens': 400,
  'max-prompt-tokens': 6000,
  tpm: 20000,
  rpm: 10,
  'max-requests': 12,
  'max-total-tokens': 40000,
  'max-usd': 0.25,
  'price-in': 1.00,   // Haiku 4.5 input $/1M — VERIFY against openrouter.ai pricing
  'price-out': 5.00,  // Haiku 4.5 output $/1M — VERIFY against openrouter.ai pricing
  temperature: 0.7,
  'on-limit': 'abort',
  'key-file': null,
  // Optional directory of external (private-repo) campaign templates to ALSO
  // simulate in guest/member/both mode. No default path: omit the flag and the
  // harness behaves exactly as before. See loadPremiumTemplates + --help.
  'premium-dir': null,
  // Optional NAME for a --playthrough --all sweep. A sweep with a name persists a
  // resumable JSON state file (harness-transcripts/<name>.sweep-state.json) so it can
  // span multiple invocations (chunks). Omit and an auto name (sweep-<timestamp>) is used.
  'sweep-name': null
};

function parseArgs(argv) {
  const opts = {
    ...FLAG_DEFAULTS, live: false, yes: false, help: false,
    all: false, simulate: false, playthrough: false, _modeExplicit: false,
    resume: false, resumeName: null,
    // --sweep-all is the "easy button": one flag that expands to a full, resumable,
    // all-campaigns sweep with sweep-friendly defaults + premium auto-detection.
    sweepAll: false, fresh: false, 'no-premium': false
  };
  // Flags the user passed EXPLICITLY. The --sweep-all preset only fills in the flags
  // the user did NOT pass, so an explicit flag always overrides the preset default.
  const explicit = new Set();
  const numeric = new Set([
    'steps', 'max-tokens', 'max-prompt-tokens', 'tpm', 'rpm',
    'max-requests', 'max-total-tokens', 'max-usd', 'price-in', 'price-out', 'temperature'
  ]);
  const stringFlags = new Set(['campaign', 'mode', 'model', 'on-limit', 'key-file', 'premium-dir', 'sweep-name']);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { opts.help = true; continue; }
    if (arg === '--live') { opts.live = true; continue; }
    if (arg === '--yes') { opts.yes = true; continue; }
    if (arg === '--all') { opts.all = true; continue; }
    if (arg === '--simulate') { opts.simulate = true; continue; }
    if (arg === '--playthrough') { opts.playthrough = true; continue; }
    if (arg === '--sweep-all') { opts.sweepAll = true; continue; }
    if (arg === '--fresh') { opts.fresh = true; continue; }
    if (arg === '--no-premium') { opts['no-premium'] = true; continue; }
    // --resume [name]: resume a sweep. Optional value: if the next argument is not
    // another flag, it is the sweep NAME; otherwise resume the MOST RECENT sweep.
    if (arg === '--resume') {
      opts.resume = true;
      const nxt = argv[i + 1];
      if (nxt !== undefined && !nxt.startsWith('--')) { opts.resumeName = nxt; i++; }
      continue;
    }
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const name = arg.slice(2);
    if (!(name in FLAG_DEFAULTS)) throw new Error(`Unknown flag: ${arg} (try --help)`);
    const value = argv[++i];
    if (value === undefined) throw new Error(`Flag ${arg} expects a value`);
    if (numeric.has(name)) {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new Error(`Flag ${arg} expects a number, got "${value}"`);
      opts[name] = n;
      explicit.add(name);
    } else if (stringFlags.has(name)) {
      opts[name] = value;
      explicit.add(name);
      if (name === 'mode') opts._modeExplicit = true;
    }
  }

  // --resume is a sweep continuation: it always means --playthrough over ALL campaigns
  // (the campaign list comes from the saved state, not the CLI). Normalize before the
  // rest of the mode/all logic runs so isSweep is true downstream.
  if (opts.resume) {
    opts.playthrough = true;
    opts.all = true;
  }

  // --sweep-all: the "easy button" — expand to a full, resumable, all-campaigns sweep.
  // It implies --playthrough --all and fills in sweep-friendly budget defaults SIZED to
  // finish the whole 16-campaign set in one go without a premature stop (a full premium run
  // is ~103 requests / ~$0.32 real; these ceilings leave generous headroom, and the guards
  // account dry-run completions at the worst-case --max-tokens so the ceilings must exceed
  // that worst case, not the real spend). Any EXPLICITLY-passed flag overrides the preset.
  if (opts.sweepAll) {
    opts.playthrough = true;
    opts.all = true;
    const SWEEP_ALL_PRESET = {
      'max-tokens': 800,        // full premium output parity
      'on-limit': 'wait',       // ride out a rate window instead of aborting the run
      'max-requests': 150,      // ~103 needed; headroom for growth
      'max-total-tokens': 400000, // worst-case (800-token) accounting for the full set + headroom
      'max-usd': 0.75,          // ~$0.32 real; covers worst-case dry-run accounting too
      rpm: 30                   // higher than the cautious default so the rate window never chokes
    };
    for (const [k, v] of Object.entries(SWEEP_ALL_PRESET)) {
      if (!explicit.has(k)) opts[k] = v;
    }
    // Stable, resumable name so re-running --sweep-all continues the same sweep.
    if (opts['sweep-name'] == null) opts['sweep-name'] = 'all';
  }

  // --simulate is an alias for the deterministic guest-vs-member comparison, unless
  // an explicit --mode was also given.
  if (opts.simulate && !opts._modeExplicit) opts.mode = 'both';
  // --campaign all (or --all) implies the deterministic sim, EXCEPT under --playthrough,
  // which sweeps every playable campaign in AI mode (a recorded live playthrough of each).
  if (!opts.playthrough && (opts.all || opts.campaign === 'all') && !opts._modeExplicit && opts.mode === 'ai') {
    opts.mode = 'both';
  }
  if (opts.all) opts.campaign = 'all';

  const VALID_MODES = new Set(['ai', 'guest', 'member', 'both']);
  if (!VALID_MODES.has(opts.mode)) {
    throw new Error(`--mode must be one of ai|guest|member|both, got "${opts.mode}"`);
  }
  if (!opts.playthrough && opts.mode === 'ai' && opts.campaign === 'all') {
    throw new Error('--campaign all / --all is only supported for the deterministic sim (--mode guest|member|both), or with --playthrough (a recorded AI sweep of every campaign).');
  }
  if (opts.playthrough) {
    if (opts._modeExplicit && opts.mode !== 'ai') {
      throw new Error('--playthrough extends AI mode; it is not compatible with --mode guest|member|both.');
    }
    opts.mode = 'ai';
    // --playthrough --all / --campaign all sweeps every playable campaign (AI mode); allowed.
    // A full sweep needs raised --max-requests / --max-usd / --max-total-tokens (the
    // conservative defaults stop it early, on purpose): the guards are cumulative.
  }

  // Sweep name / resume validation.
  const safeName = (n) => typeof n === 'string' && /^[A-Za-z0-9._-]+$/.test(n) && n !== '.' && n !== '..';
  if (opts['sweep-name'] != null && !safeName(opts['sweep-name'])) {
    throw new Error(`--sweep-name "${opts['sweep-name']}" must be a simple name (letters, digits, dot, dash, underscore).`);
  }
  if (opts.resumeName != null && !safeName(opts.resumeName)) {
    throw new Error(`--resume "${opts.resumeName}" must be a simple name (letters, digits, dot, dash, underscore).`);
  }
  if (opts.resume && opts['sweep-name'] != null) {
    throw new Error('--resume and --sweep-name are mutually exclusive (name a resume target with "--resume <name>").');
  }
  if (opts['sweep-name'] != null && !(opts.playthrough && opts.all)) {
    throw new Error('--sweep-name only applies to a --playthrough --all sweep.');
  }

  if (opts['no-premium'] && opts['premium-dir']) {
    throw new Error('--no-premium and --premium-dir are mutually exclusive (choose one).');
  }
  if (opts['on-limit'] !== 'abort' && opts['on-limit'] !== 'wait') {
    throw new Error(`--on-limit must be "abort" or "wait", got "${opts['on-limit']}"`);
  }
  // Clamp output cap to the hard ceiling (mirrors the app's clamp).
  if (opts['max-tokens'] > HARD_MAX_TOKENS_CEILING) {
    console.warn(`[guard] --max-tokens ${opts['max-tokens']} exceeds hard ceiling ${HARD_MAX_TOKENS_CEILING}; clamping.`);
    opts['max-tokens'] = HARD_MAX_TOKENS_CEILING;
  }
  return opts;
}

function printHelp() {
  const d = FLAG_DEFAULTS;
  console.log(`
quest-harness.mjs - headless quest tester (DRY-RUN / deterministic by default)

USAGE
  node scripts/quest-harness.mjs [flags]

RECOMMENDED: TEST ALL CAMPAIGNS WITH ONE FLAG (--sweep-all)
  --sweep-all is the "easy button". It expands to a full, resumable, all-campaigns
  quality sweep so you do not have to assemble --playthrough --all --max-tokens ...
  --on-limit wait --max-requests ... etc yourself. It:
    * implies --playthrough --all and applies sweep-friendly budget defaults sized to
      finish the whole set in one go (max-tokens 800, on-limit wait, max-requests 150,
      max-total-tokens 400000, max-usd 0.75, rpm 30). Any flag you pass EXPLICITLY still
      overrides the preset, so power users can tune it.
    * AUTO-RESUMES: it uses a stable sweep name ("all" by default; override --sweep-name).
      Just run it again to continue — it skips done campaigns, resumes pending ones, and
      prints "already complete" once every campaign is done. No separate --resume needed.
    * AUTO-INCLUDES PREMIUM if found (env HARNESS_PREMIUM_DIR, then the conventional
      ../dungeongpt-premium-content/campaigns, then ~/Projects/...); otherwise it runs
      built-in-only and tells you how to point at premium. --no-premium opts out; an
      explicit --premium-dir overrides the auto-detection.
    * stays DRY-RUN unless you also pass --live --yes (unchanged safety).

  Start a real run (and re-run the EXACT same command to continue):
    OPENROUTER_API_KEY=... npm run harness -- --sweep-all --live --yes
  Preview it first (no network, no key):
    npm run harness -- --sweep-all
  Restart a named sweep from scratch (archives the old state, never deletes it):
    npm run harness -- --sweep-all --fresh
  Built-in campaigns only:
    npm run harness -- --sweep-all --no-premium

MODES (--mode, default: ${d.mode})
  ai       Compose the REAL new-game AI prompts and (only with --live --yes) send
           them to the OpenRouter premium pool. This is the original behaviour and
           is unchanged. DRY-RUN unless BOTH --live AND --yes are passed.
  guest    Deterministic simulation of GUEST / no-AI play. Prints the real no-AI
           opening (introComposer.composeIntro), then walks the campaign's
           milestones to completion using ONLY the game engine: it fires each
           mechanical milestone's deterministic event (item/combat/location/talk)
           through the REAL checkMilestoneCompletion. NARRATIVE milestones need the
           AI [COMPLETE_MILESTONE] marker, so a guest can NEVER complete them: they
           block. NO network call, NO API key.
  member   Same deterministic walk, but narrative milestones ARE completed (via the
           engine's completeNarrativeMilestone, simulating the AI marker a signed-in
           member's DM would emit). NO network call, NO API key.
  both     Run guest AND member and report the divergence (which campaigns a member
           can finish but a guest cannot, and exactly which milestones block guests).
           This is the default when --simulate, --all, or --campaign all is used.

SAFETY (ai mode only)
  DRY-RUN unless you pass BOTH --live AND --yes. In dry-run it builds and prints
  every prompt, estimates tokens, and shows the guard preflight — but makes NO
  network request. A live spend therefore always needs two explicit flags.
  The OpenRouter key is read only from OPENROUTER_API_KEY or --key-file, and is
  never printed or written anywhere. guest/member/both modes never touch the
  network and never read a key at all.

FLAGS
  --mode <ai|guest|member|both>  Run mode (see above)         (default: ${d.mode})
  --simulate               Alias for --mode both (deterministic guest vs member)
  --all                    Run across ALL playable campaigns (= --campaign all). With the
                           deterministic sim it walks every campaign; with --playthrough it
                           SWEEPS a recorded playthrough of every campaign (and, with
                           --premium-dir, every premium template too).
  --campaign <id|all>      Story template id, or "all"        (default: ${d.campaign})
  --playthrough            Extend AI mode into a RECORDED, scripted playthrough of the
                           campaign spine: the opening plus ONE scripted player turn per
                           milestone (in completion order) that drives it. Composes the
                           full in-game turn prompt (DM_PROTOCOL + milestone grounding +
                           location + player action + style) for each, sends it (only with
                           --live --yes), runs light automated checks, and writes every
                           prompt + response to a timestamped Markdown transcript under
                           harness-transcripts/ (gitignored). DRY-RUN by default. Ignores
                           --steps (the turn count is opening + milestones).
                           With --all it sweeps EVERY playable campaign (one transcript per
                           campaign) plus a single aggregate sweep-summary; the guards are
                           enforced CUMULATIVELY across the whole sweep, so it hard-stops the
                           moment the next request would cross --max-requests / --max-total-
                           tokens / --max-usd (remaining campaigns are marked skipped). Honors
                           --premium-dir (premium rows in the aggregate stay STRUCTURAL: ids,
                           counts, flags only — no premium prose). A full live sweep needs
                           those budgets raised; the dry-run PROJECTS the total requests/cost.
  --sweep-all              EASY BUTTON (see the section above): expand to a full, resumable
                           sweep of EVERY campaign with sweep-friendly defaults, auto-resume,
                           and premium auto-detection. Re-run the same command to continue.
                           Explicit flags override the preset; DRY-RUN unless --live --yes.
  --fresh                  With --sweep-all, restart the named sweep from scratch: the old
                           state file is ARCHIVED (renamed, never deleted), then a new sweep
                           begins. No effect without a sweep.
  --no-premium             With --sweep-all, run built-in campaigns only even if a premium
                           dir is found (mutually exclusive with --premium-dir).
  --steps <N>              Turns to compose: 1 = opening only (default: ${d.steps})
                           Each extra step adds one follow-up turn. (Ignored with --playthrough.)
  --model <id>             OpenRouter model id               (default: ${d.model})
  --max-tokens <N>         Per-request output cap            (default: ${d['max-tokens']}, hard ceiling ${HARD_MAX_TOKENS_CEILING})
  --max-prompt-tokens <N>  Per-request input cap (estimate)  (default: ${d['max-prompt-tokens']})
  --tpm <N>                Tokens/minute (sliding 60s)       (default: ${d.tpm})
  --rpm <N>                Requests/minute (sliding 60s)     (default: ${d.rpm})
  --max-requests <N>       Per-run request budget            (default: ${d['max-requests']})
  --max-total-tokens <N>   Per-run cumulative token budget   (default: ${d['max-total-tokens']})
  --max-usd <N>            Per-run cost ceiling (USD)        (default: ${d['max-usd']})
  --price-in <N>           USD per 1M input tokens           (default: ${d['price-in']} — Haiku 4.5, VERIFY)
  --price-out <N>          USD per 1M output tokens          (default: ${d['price-out']} — Haiku 4.5, VERIFY)
  --temperature <N>        Sampling temperature              (default: ${d.temperature})
  --on-limit <abort|wait>  Rate-window breach behaviour      (default: ${d['on-limit']})
  --key-file <path>        Read OPENROUTER_API_KEY=... line from this file
  --premium-dir <path>     Directory of EXTERNAL campaign template *.js files to
                           ALSO simulate in guest/member/both mode (and to ALSO sweep in
                           --playthrough --all; premium rows there stay structural). Each file is an
                           ESM module exporting a template object (the first export
                           with an id + settings.milestones is used); files without
                           milestones (teaser stubs) are skipped like built-in stubs.
                           Deterministic: NO network, NO key (same as the guest sim).
                           Omit the flag and behaviour is unchanged (built-ins only).
                           Typical value: the private premium-content repo's
                           campaigns/ dir, e.g.
                           /home/edward/Projects/dungeongpt-premium-content/campaigns
  --sweep-name <name>      NAME a --playthrough --all sweep so it is RESUMABLE across
                           several invocations (chunks). Writes a structural JSON state
                           file harness-transcripts/<name>.sweep-state.json recording the
                           ordered campaign list, which campaigns are DONE (with their
                           structural result row + transcript pointer), and cumulative
                           totals across chunks. Premium rows stay structural (ids/counts/
                           flags only). Omit and an auto name (sweep-<timestamp>) is used.
  --resume [name]          Resume a previously-started sweep instead of starting a new one.
                           With a name, resumes harness-transcripts/<name>.sweep-state.json;
                           without one, resumes the MOST RECENT sweep state (by updated time).
                           Skips campaigns already DONE, runs the remaining PENDING ones
                           under THIS invocation's budget, and updates the state. The
                           campaign selection (and whether premium was included) comes from
                           the saved state; do NOT re-pass --all / --campaign. If premium
                           campaigns are still pending you must re-supply --premium-dir. If
                           nothing is pending it prints "sweep <name> already complete".
  --live                   Enable real OpenRouter calls (requires --yes too)
  --yes                    Confirm a live run (guard against an accidental --live)
  --help                   This message

CHUNKED SWEEPS (budget-per-invocation vs cumulative totals)
  The full --playthrough --all sweep is best run in CHUNKS. The guard ceilings
  (--max-requests / --max-total-tokens / --max-usd) bound the CURRENT invocation/chunk,
  so you size each chunk. A named sweep persists progress; the next --resume continues the
  remaining campaigns under a fresh chunk budget. The state file accumulates totals ACROSS
  all chunks for reporting. A campaign cut off mid-way by the chunk budget stays PENDING and
  re-runs whole on the next resume, so size each chunk to fit a few WHOLE campaigns.

EXAMPLES
  npm run harness -- --sweep-all                                  # preview ALL campaigns (dry-run)
  OPENROUTER_API_KEY=... npm run harness -- --sweep-all --live --yes   # real sweep; re-run to resume
  npm run harness -- --sweep-all --fresh                         # restart the "all" sweep (archives old state)
  npm run harness -- --sweep-all --no-premium                    # built-in campaigns only
  node scripts/quest-harness.mjs --campaign heroic-fantasy-t1      # ai dry-run
  node scripts/quest-harness.mjs --playthrough --campaign heroic-fantasy-t1  # recorded dry-run
  node scripts/quest-harness.mjs --playthrough --all                        # sweep every campaign (dry-run)
  node scripts/quest-harness.mjs --playthrough --all --premium-dir <path>   # + premium templates
  node scripts/quest-harness.mjs --playthrough --all --sweep-name run1 --max-requests 20  # chunk 1
  node scripts/quest-harness.mjs --playthrough --resume run1 --max-requests 20            # chunk 2 (resume)
  node scripts/quest-harness.mjs --playthrough --resume                     # resume most-recent sweep
  OPENROUTER_API_KEY=sk-or-... node scripts/quest-harness.mjs --playthrough --live --yes
  node scripts/quest-harness.mjs --mode guest --campaign heroic-fantasy-t1
  node scripts/quest-harness.mjs --mode both --all                # sim every campaign
  node scripts/quest-harness.mjs --simulate --all                 # same, alias
  node scripts/quest-harness.mjs --mode both --all --premium-dir <path>  # + external templates
  OPENROUTER_API_KEY=sk-or-... node scripts/quest-harness.mjs --live --yes
`);
}

// ---------------------------------------------------------------------------
// Load storyTemplates + DM_PROTOCOL via an esbuild bundle (same approach as
// scripts/content-audit.mjs — plain node cannot import the CRA .js modules,
// one of which uses webpack require.context).
// ---------------------------------------------------------------------------
async function loadAppData() {
  const outfile = path.join(os.tmpdir(), `dungeongpt-quest-harness.${process.pid}.mjs`);
  await build({
    stdin: {
      // The simulation exercises the REAL engine (milestoneEngine.js) and the REAL
      // no-AI opening (introComposer.composeIntro), bundled the same way as the
      // storyTemplates so guest mode is testing production code, not a copy.
      contents:
        `export { storyTemplates } from './storyTemplates.js';\n` +
        `export { DM_PROTOCOL } from './prompts.js';\n` +
        `export { composeIntro, formatStartObjective } from '../game/introComposer.js';\n` +
        `export {\n` +
        `  areRequirementsMet,\n` +
        `  getMilestoneState,\n` +
        `  getCampaignProgress,\n` +
        `  checkMilestoneCompletion,\n` +
        `  completeNarrativeMilestone,\n` +
        `  getMilestoneRewards\n` +
        `} from '../game/milestoneEngine.js';\n`,
      resolveDir: path.join(repoRoot, 'src', 'data'),
      loader: 'js'
    },
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

// ---------------------------------------------------------------------------
// Load EXTERNAL campaign templates from a --premium-dir. These live in a
// SEPARATE repo (never in this one); we only read them at runtime by path. Each
// file is an ESM module exporting a template object of the same shape as a
// src/data/storyTemplates.js entry. We reuse the same esbuild-bundle technique
// as loadAppData (bundle each file to a temp module, dynamic-import it, take the
// first exported value that looks like a template: has an id + settings.milestones).
// Purely deterministic: no network, no key.
// ---------------------------------------------------------------------------
function looksLikeTemplate(v) {
  return v && typeof v === 'object' && v.id != null &&
    (Array.isArray(v.milestones) || Array.isArray(v.settings?.milestones));
}

// Resolve the premium campaigns directory WITHOUT a hardcoded absolute path, for
// --sweep-all's auto-include. Precedence:
//   1. --no-premium       -> skip entirely (built-in only)
//   2. explicit --premium-dir -> use it verbatim (overrides auto-detection)
//   3. env HARNESS_PREMIUM_DIR
//   4. ../dungeongpt-premium-content/campaigns   (conventional, relative to this repo)
//   5. ~/Projects/dungeongpt-premium-content/campaigns
// Returns { dir, source }; dir is null when premium is skipped or nothing was found.
function resolvePremiumDir(opts) {
  if (opts['no-premium']) return { dir: null, source: 'skipped (--no-premium)' };
  if (opts['premium-dir']) return { dir: opts['premium-dir'], source: 'explicit --premium-dir' };
  const candidates = [];
  if (process.env.HARNESS_PREMIUM_DIR && process.env.HARNESS_PREMIUM_DIR.trim()) {
    candidates.push({ p: process.env.HARNESS_PREMIUM_DIR.trim(), s: 'env HARNESS_PREMIUM_DIR' });
  }
  candidates.push({
    p: path.resolve(repoRoot, '..', 'dungeongpt-premium-content', 'campaigns'),
    s: 'conventional ../dungeongpt-premium-content/campaigns'
  });
  candidates.push({
    p: path.join(os.homedir(), 'Projects', 'dungeongpt-premium-content', 'campaigns'),
    s: '~/Projects/dungeongpt-premium-content/campaigns'
  });
  for (const c of candidates) {
    try {
      if (fs.existsSync(c.p) && fs.statSync(c.p).isDirectory()) return { dir: c.p, source: c.s };
    } catch { /* ignore and try the next candidate */ }
  }
  return { dir: null, source: 'not found (auto-detect)' };
}

async function loadPremiumTemplates(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  } catch (err) {
    throw new Error(`Could not read --premium-dir "${dir}": ${err.code || err.message}`);
  }
  entries.sort();
  const templates = [];
  for (const file of entries) {
    const abs = path.join(dir, file);
    const outfile = path.join(
      os.tmpdir(),
      `dungeongpt-quest-harness-ext.${process.pid}.${templates.length}.${Date.now()}.mjs`
    );
    await build({
      entryPoints: [abs],
      bundle: true,
      format: 'esm',
      platform: 'node',
      outfile,
      logLevel: 'silent'
    });
    let mod;
    try {
      mod = await import(pathToFileURL(outfile).href + `?t=${Date.now()}`);
    } finally {
      fs.rm(outfile, { force: true }, () => {});
    }
    // Prefer a default export if it is template-shaped; else the first named
    // export that is. An exported array (e.g. a `premiumTemplates` list) has no
    // `.id`, so it is naturally skipped by looksLikeTemplate.
    const picked = (looksLikeTemplate(mod.default) && mod.default) ||
      Object.values(mod).find(looksLikeTemplate) || null;
    if (picked) {
      templates.push(picked);
    } else {
      // A teaser stub (no milestones) or non-template module: skip, like built-in stubs.
      console.warn(`[premium-dir] ${file}: no template export with id + milestones; skipped.`);
    }
  }
  return templates;
}

// ---------------------------------------------------------------------------
// Prompt composition — REPLICATED from useGameInteraction.js (see file header).
// ---------------------------------------------------------------------------

// A sample party stands in for the player's selected heroes (headless harness).
const SAMPLE_PARTY = [
  { heroName: 'Bram', heroClass: 'Fighter' },
  { heroName: 'Sable', heroClass: 'Rogue' },
  { heroName: 'Ilma', heroClass: 'Cleric' }
];

// Replica of promptComposer.formatPartyInfo (simplified: no HP annotations,
// since the harness party is at full health).
function formatPartyInfo(heroes) {
  return heroes.map((h) => {
    const name = h.heroName || h.characterName || 'Unknown';
    const cls = h.heroClass || h.characterClass || '';
    return cls ? `${name} (${cls})` : name;
  }).join(', ');
}

// Replica of getMilestoneStatus + areRequirementsMet (start-of-game state:
// nothing completed, so the current milestone is the first with met requires).
function getCurrentMilestone(milestones) {
  const list = Array.isArray(milestones) ? milestones : [];
  const completedIds = new Set(); // fresh game: none completed
  const requirementsMet = (m) => {
    const reqs = Array.isArray(m.requires) ? m.requires : [];
    return reqs.every((id) => completedIds.has(id));
  };
  const remaining = list.filter((m) => !m.completed);
  const active = remaining.filter((m) => requirementsMet(m));
  return active[0] || null;
}

// Replica of formatStartObjective from the hook.
function formatStartObjective(current) {
  if (!current) return { line: '', destination: '' };
  const typeTag = current.type ? ` [${current.type}]` : '';
  let line = `${current.text}${typeTag}`;
  const destination = current.building?.location || current.spawn?.location || current.location || '';
  if (current.spawn?.type === 'npc' && current.spawn.name) {
    const who = current.spawn.role ? `${current.spawn.name} (${current.spawn.role})` : current.spawn.name;
    const where = current.building?.name || current.spawn.location;
    line += `: speak with ${who}${where ? ` at ${where}` : ''}`;
    if (current.spawn.personality) line += `; ${current.spawn.personality}`;
  } else if (current.building?.name) {
    line += ` at ${current.building.name}`;
  }
  return { line, destination };
}

// Replica of isPolishSafe from useGameInteraction.js (the polish-pass validation guard:
// length band + start-town-name presence + destination-name presence). REPLICATED here
// (drift risk); a future refactor should extract it alongside the polish prompt so the
// hook and this harness share one. The hook runs it on cleanAIResponse(...).trim(); the
// harness applies it to the trimmed raw response (documented approximation).
function isPolishSafeReplica(polished, authored, { startPlaceName, destination }) {
  if (!polished || !polished.trim()) return false;
  const lo = authored.length * 0.4;
  const hi = authored.length * 1.6;
  if (polished.length < lo || polished.length > hi) return false;
  if (startPlaceName && startPlaceName !== 'this place' && !polished.includes(startPlaceName)) return false;
  if (destination && destination !== startPlaceName && !polished.includes(destination)) return false;
  return true;
}

// Replica of generateResponse's DM_PROTOCOL + style-directive wrap.
function wrapWithProtocol(DM_PROTOCOL, prompt, settings, styleOverride) {
  // styleOverride lets a specific call replace the player's verbosity directive (the opening
  // polish pass passes a "match the original length" directive so it is not told to expand).
  const style = styleOverride !== undefined
    ? styleOverride
    : (VERBOSITY_DIRECTIVE[settings?.responseVerbosity] || VERBOSITY_DIRECTIVE.Moderate);
  return style
    ? `${DM_PROTOCOL}${prompt}\n\nStyle directive (shapes how you write; do not repeat it): ${style}`
    : `${DM_PROTOCOL}${prompt}`;
}

// Build the list of composed requests for a template.
// Returns [{ label, prompt }]. `prompt` is the full, protocol-wrapped user message.
function composeRequests(template, DM_PROTOCOL, steps) {
  const settings = template.settings || {};
  const requests = [];

  // Start location: the app starts the party in the first named settlement.
  // customNames.towns is assigned by importance; the first is the start town.
  const startTown = template.customNames?.towns?.[0] || 'the starting settlement';
  const startTownSize = 'town'; // harness assumption; real value comes from the generated map
  const partyInfo = formatPartyInfo(SAMPLE_PARTY);

  // ---- Stage 1: SCENE (grounded to the start location only) ----
  // In the app, locationInfo comes from buildLocationContext over the generated
  // map. Headless, we synthesise the equivalent inside-town phrasing. This is a
  // documented approximation (no generated town map / placed NPCs here).
  const locationInfo = `The party is INSIDE ${startTown}, a ${startTownSize}.`;
  const sceneContext = `Setting: ${settings.shortDescription || 'A mystery fantasy world'}. Mood: ${settings.grimnessLevel || 'Normal'} Intensity. Magic: ${settings.magicLevel || 'Standard'}. Tech: ${settings.technologyLevel || 'Medieval'}.\n${locationInfo}. Party: ${partyInfo}.`;
  const scenePrompt = `[ADVENTURE START - SCENE]\n\n[CONTEXT]\n${sceneContext}\n\n[TASK]\nDescribe the arrival of the party and the immediate atmosphere of THIS location only. Describe ONLY the location, buildings, and people named in the context above. Do not name, place, or invent any building or NPC that is not listed here, and do not reference other towns as if they are part of this scene. Begin your response directly with the narrative description.`;
  requests.push({ label: 'SCENE (opening)', prompt: wrapWithProtocol(DM_PROTOCOL, scenePrompt, settings) });

  // ---- Stage 2: OBJECTIVE (only the current milestone, framed as elsewhere) ----
  const current = getCurrentMilestone(settings.milestones);
  const { line: objectiveLine, destination: objectiveDest } = formatStartObjective(current);
  const currentPlaceName = startTown;
  if (current && objectiveLine) {
    const goalInfo = settings.campaignGoal ? `Campaign goal: ${settings.campaignGoal}.\n` : '';
    const objectiveContext = `${goalInfo}The party's current location: ${currentPlaceName}.\nThe party's immediate objective (the ONLY next step): ${objectiveLine}.${objectiveDest ? `\nThat objective lies in ${objectiveDest}, a place elsewhere the party must travel to.` : ''}`;
    const objectivePrompt = `[ADVENTURE START - OBJECTIVE]\n\n[CONTEXT]\n${objectiveContext}\n\n[TASK]\nIn one short paragraph (2-3 sentences), point the party toward this immediate objective. Any destination named here is a place ELSEWHERE the party must travel to; never describe it, its buildings, or its people as part of the current scene at ${currentPlaceName}. Do not invent NPCs or places beyond those named above. Close on the concrete next step by its real name. Begin your response directly with the narrative.`;
    requests.push({ label: 'OBJECTIVE (opening)', prompt: wrapWithProtocol(DM_PROTOCOL, objectivePrompt, settings) });
  }

  // ---- Follow-up turns (--steps > 1). Documented scaffold: each is one turn
  // grounded in the current milestone, mirroring a "player acts" movement turn.
  // These are approximations of the movement/interaction path, not exact copies.
  const followUps = Math.max(0, steps - 1);
  if (followUps > 0 && current) {
    const dest = objectiveDest || current.location || 'the objective';
    const followUpTemplates = [
      {
        label: 'FOLLOW-UP 1 (travel toward objective)',
        player: `The party leaves ${currentPlaceName} and travels toward ${dest}, pressing on to their objective: ${current.text}.`
      },
      {
        label: 'FOLLOW-UP 2 (arrive / act on objective)',
        player: `The party reaches ${dest} and moves to act on their objective: ${current.text}.`
      }
    ];
    for (let i = 0; i < followUps && i < followUpTemplates.length; i++) {
      const t = followUpTemplates[i];
      const followContext = `Current location context: the party set out from ${currentPlaceName}.\nActive objective (the ONLY next step): ${objectiveLine}.\nPlayer action: ${t.player}`;
      const followPrompt = `[CONTEXT]\n${followContext}\n\n[TASK]\nNarrate the outcome of the player's action, grounded strictly in the objective and places named above. Do not invent new towns, NPCs, or objectives. Begin your response directly with the narrative.`;
      requests.push({ label: t.label, prompt: wrapWithProtocol(DM_PROTOCOL, followPrompt, settings) });
    }
  }

  return requests;
}

// ===========================================================================
// RECORDED PLAYTHROUGH composition — REPLICATED from useGameInteraction.js
// (handleSubmit: gameContext + [CONTEXT]/[SUMMARY]/[PLAYER ACTION]/[NARRATE] body,
// getMilestoneStatus + formatMilestonePromptText grounding, generateResponse's
// DM_PROTOCOL + style wrap). This is a COPY of the hook and CAN DRIFT; a future
// refactor should extract one shared pure builder the hook and this harness share.
// ===========================================================================

// Replica of getMilestoneStatus (useGameInteraction.js): current/completed/active/
// locked derived from the milestones' own `completed` flags + requires graph.
function getMilestoneStatusReplica(milestones) {
  const list = Array.isArray(milestones) ? milestones : [];
  const reqMet = (m) => {
    const reqs = Array.isArray(m.requires) ? m.requires : [];
    return reqs.every((id) => list.find((x) => x.id === id)?.completed);
  };
  const completed = list.filter((m) => m.completed);
  const remaining = list.filter((m) => !m.completed);
  const active = remaining.filter((m) => reqMet(m));
  const locked = remaining.filter((m) => !reqMet(m));
  return { current: active[0] || null, completed, remaining, active, locked, all: list };
}

// Replica of formatMilestonePromptText (useGameInteraction.js). Kept character-for-
// character (including the em dash the app uses) so the harness prompt matches the
// real in-game prompt; do not "clean up" the punctuation or it drifts.
function formatMilestonePromptTextReplica(milestoneStatus) {
  const { completed, active, locked } = milestoneStatus;
  if (completed.length === 0 && active.length === 0 && locked.length === 0) return '';
  let text = '';
  if (active.length > 0) {
    text += '\nActive Milestones: ' + active.map((m, i) => {
      const typeTag = m.type ? ` [${m.type}]` : '';
      const levelTag = m.minLevel ? ` (Lv.${m.minLevel}+)` : '';
      let line = `${m.text}${typeTag}${levelTag}`;
      if (m.spawn?.type === 'npc' && m.spawn.name) {
        const who = m.spawn.role ? `${m.spawn.name} (${m.spawn.role})` : m.spawn.name;
        const where = m.building?.name || m.spawn.location;
        line += ` — speak with ${who}${where ? ` at ${where}` : ''}`;
        if (m.spawn.personality) line += `; ${m.spawn.personality}`;
      }
      if (i === 0 && m.type === 'talk') {
        const who = m.spawn?.name || 'this person';
        line += ` (you may mark this complete once the party finishes speaking with ${who})`;
      }
      return line;
    }).join('; ');
  }
  if (completed.length > 0) {
    text += '\nCompleted: ' + completed.map((m) => m.text).join('; ');
  }
  if (locked.length > 0) {
    text += '\nLocked (prerequisites not met): ' + locked.map((m) => m.text).join('; ');
  }
  return text;
}

// Topological completion order: repeatedly take the first milestone (in authored
// order) whose `requires` are all already completed. Mirrors the order the engine
// walk would complete them in. Stops if the graph cannot progress (unreachable).
function computeCompletionOrder(milestones) {
  const list = Array.isArray(milestones) ? milestones : [];
  const done = new Set();
  const order = [];
  let guard = list.length * 2 + 4;
  while (order.length < list.length && guard-- > 0) {
    const next = list.find((m) =>
      !done.has(m.id) && (Array.isArray(m.requires) ? m.requires : []).every((r) => done.has(r))
    );
    if (!next) break;
    done.add(next.id);
    order.push(next);
  }
  return order;
}

// Compose ONE short, neutral scripted player input that would drive a milestone,
// derived from the milestone's own fields (see task spec templates per type).
function buildScriptedPlayerTurn(m) {
  const b = m.building || {};
  const s = m.spawn || {};
  const loc = b.location || s.location || m.location || 'the objective';
  switch (m.type) {
    case 'item': {
      const where = b.name || loc;
      const item = s.name || m.trigger?.item || 'the quest item';
      return `We travel to ${b.location || loc} and search ${where} for ${item}.`;
    }
    case 'talk': {
      const who = s.name || 'the contact';
      const where = b.name || loc;
      return `We go to ${where} in ${b.location || loc} and speak with ${who}.`;
    }
    case 'location': {
      const target = s.name || m.trigger?.location || m.location || 'the destination';
      return `We travel to ${target} in ${m.location || loc}.`;
    }
    case 'combat': {
      const foe = s.name || m.encounter?.name || m.trigger?.enemy || 'the enemy';
      return `We confront and fight ${foe} at ${m.location || loc}.`;
    }
    default:
      return `We act on our objective: ${m.text || 'advance the quest'}.`;
  }
}

// A short lowercase paraphrase of the milestone objective, used in the commit line of
// the concluding talk turn ("we are ready to <objective>").
function paraphraseObjective(m) {
  const raw = (m.text || 'take up the quest').trim().replace(/[.!?]+$/, '');
  return raw ? raw.charAt(0).toLowerCase() + raw.slice(1) : 'take up the quest';
}

// Compose the CONCLUDING player turn for a `talk` milestone. The party has BEEN
// speaking with the NPC and now gives their answer and commits. This is the second of
// the two talk turns; it exists so we can observe the dual-completion
// [COMPLETE_MILESTONE] marker actually fire at a true conversation conclusion (the
// single open turn typically ends with the NPC handing the decision back to the party,
// so the marker correctly does NOT fire there).
function buildTalkConcludePlayerTurn(m) {
  const s = m.spawn || {};
  const who = s.name || 'the contact';
  return `We hear ${who} out and tell them we accept: we are ready to ${paraphraseObjective(m)}.`;
}

// The [SUMMARY] seed for the concluding talk turn. Unlike the default seed used for
// other turns, this makes explicit that the party has already been in conversation with
// the NPC and is now giving their final answer, so the model reads the exchange as
// reaching its natural end (and may legitimately mark the talk milestone complete).
function buildTalkConcludeSummary(m) {
  const s = m.spawn || {};
  const b = m.building || {};
  const who = s.name || 'the contact';
  const where = b.name || b.location || s.location || m.location || 'the meeting place';
  return `The party has been speaking with ${who} at ${where}. The conversation is drawing to a close and the party is about to give their answer.`;
}

// Minimal location context for a milestone turn, standing in for buildLocationContext
// (the harness generates no town maps). Inside-town for building milestones; a plain
// wilderness line otherwise. Documented approximation; noted in the transcript.
function buildMinimalLocationContext(m) {
  const b = m.building || {};
  const s = m.spawn || {};
  if (b.name && (b.location || s.location)) {
    return `The party is INSIDE ${b.location || s.location}, a settlement. They are at ${b.name}.`;
  }
  const wild = m.location || s.location || 'the wilds';
  return `The party is traveling through the ${wild} area.`;
}

// Build the full recorded playthrough: opening (reuse composeRequests steps=1) then
// one in-game turn per milestone in completion order. Each returned request carries
// { label, prompt, playerInput?, milestone? } — playerInput/milestone only for turns.
function composePlaythroughRequests(template, DM_PROTOCOL, { composeIntro, formatStartObjective }) {
  const settings = template.settings || {};
  const requests = [];

  // ---- OPENING (authored + bounded polish) — faithful to handleStartAdventure ----
  // The app builds the opening from the REAL introComposer.composeIntro (imported here via
  // the esbuild bundle) and, for signed-in players, runs ONE tightly-bounded
  // [ADVENTURE START - POLISH] reword-only pass over that authored text, validated by
  // isPolishSafe (falling back to the authored text verbatim on reject). We reproduce that
  // exactly: the authored opening is recorded as a DETERMINISTIC entry (no request), and
  // the single opening REQUEST is the polish pass.
  const startTownRaw = template.customNames?.towns?.[0];
  const startTown = (startTownRaw && typeof startTownRaw === 'object') ? startTownRaw.name : startTownRaw;
  // Settlement size may be pinned on a size-tagged customName; otherwise it is unknown
  // headless (the real size comes from the generated map the harness never builds).
  const startSize = (startTownRaw && typeof startTownRaw === 'object') ? (startTownRaw.size || null) : null;
  const openingMilestone = getCurrentMilestone(settings.milestones);

  // The same opts handleStartAdventure passes composeIntro. placedNpcs is empty (the
  // harness builds no town map, matching the app's no-NPC-grounded start case); biome is
  // unknown headless (null -> composeIntro's default atmosphere). Documented approximation.
  const authoredOpening = composeIntro(settings, SAMPLE_PARTY, {
    startPlaceName: startTown,
    isTown: !!startTown,
    startSize,
    biome: null,
    currentMilestone: openingMilestone,
    placedNpcs: [],
  });
  const { destination: openingDest } = formatStartObjective(openingMilestone);

  requests.push({
    label: 'Opening (authored)',
    isAuthored: true,
    authoredText: authoredOpening,
  });

  // The polish prompt is REPLICATED VERBATIM from handleStartAdventure (drift risk noted
  // in the file header; a future refactor should share the prompt + isPolishSafe).
  const polishPrompt = `[ADVENTURE START - POLISH]\n\n[OPENING]\n${authoredOpening}\n\n[TASK]\nLightly reword and vary the phrasing of the opening above for freshness. You MUST NOT change any facts, add or rename any person, place, building, item, or objective, introduce any character not already present, or change the destination or next step. Do not add new sentences or content. Return the same opening, same structure and same facts, only rephrased. Begin your response directly with the reworded opening.`;
  requests.push({
    label: 'Opening (polish)',
    prompt: wrapWithProtocol(DM_PROTOCOL, polishPrompt, settings, 'Match the length and paragraph count of the original exactly. Do not expand, add sentences, or add detail; only rephrase what is there.'),
    isPolish: true,
    authored: authoredOpening,
    startPlaceName: startTown,
    destination: openingDest,
  });

  const milestones = Array.isArray(settings.milestones) ? settings.milestones : [];
  const order = computeCompletionOrder(milestones);
  // Progressive working copy: each turn's context reflects milestones completed on
  // prior turns (so the driven milestone shows as Active, its predecessors Completed).
  const working = milestones.map((m) => ({ ...m, completed: false }));
  const partyInfo = formatPartyInfo(SAMPLE_PARTY);
  const goalInfo = settings.campaignGoal ? `\nGoal: ${settings.campaignGoal}` : '';

  for (const m of order) {
    const status = getMilestoneStatusReplica(working);
    const milestonesInfo = formatMilestonePromptTextReplica(status);
    const locationInfo = buildMinimalLocationContext(m);
    const gameContext = `Setting: ${settings.shortDescription || 'Fantasy Realm'}. Mood: ${settings.grimnessLevel || 'Normal'}.${goalInfo}${milestonesInfo}\n${locationInfo}. Party: ${partyInfo}.`;
    const isTalk = m.type === 'talk';

    // OPEN turn: mirror handleSubmit's body. No RAG/summary in a headless harness: the
    // summary is the app's default seed and ragContext is empty (documented approx).
    const openInput = buildScriptedPlayerTurn(m);
    const openBody = `[CONTEXT]\n${gameContext}\n\n[SUMMARY]\nThe tale unfolds.\n\n[PLAYER ACTION]\n${openInput}\n\n[NARRATE]`;
    requests.push({
      label: `Milestone #${m.id} [${m.type || 'untyped'}]${isTalk ? ' (open)' : ''}`,
      prompt: wrapWithProtocol(DM_PROTOCOL, openBody, settings),
      playerInput: openInput,
      milestone: m
    });

    // CONCLUDE turn (talk only): a SECOND in-game turn whose scripted player input
    // concludes the conversation and commits. The milestone stays ACTIVE for this turn
    // (it is completed by the marker or the Talk button, never by the harness), so the
    // context still presents it as the current talk objective and still carries the
    // "you may mark this complete once the party finishes speaking with <name>" cue.
    // This lets us observe dual-completion's positive path: the marker firing at a true
    // conclusion, which the single open turn does not reach.
    if (isTalk) {
      const concludeInput = buildTalkConcludePlayerTurn(m);
      const concludeBody = `[CONTEXT]\n${gameContext}\n\n[SUMMARY]\n${buildTalkConcludeSummary(m)}\n\n[PLAYER ACTION]\n${concludeInput}\n\n[NARRATE]`;
      requests.push({
        label: `Milestone #${m.id} [${m.type || 'untyped'}] (conclude)`,
        prompt: wrapWithProtocol(DM_PROTOCOL, concludeBody, settings),
        playerInput: concludeInput,
        milestone: m,
        isTalkConclude: true
      });
    }

    const w = working.find((x) => x.id === m.id);
    if (w) w.completed = true;
  }

  return requests;
}

// Light automated CHECKS on a response — flags for the maintainer, NOT pass/fail and
// NOT acted upon. Empty / refusal / prompt-echo are blocking signals; markers are
// reported for presence only.
function runResponseChecks(text) {
  const flags = [];
  const t = (text || '').trim();
  if (!t) { flags.push('BLOCK:empty'); return flags; }
  if (/\b(I'm sorry|I am sorry|I cannot|I can't|I can not|as an AI|I am unable|I'm unable|I won't be able)\b/i.test(t)) {
    flags.push('BLOCK:possible-refusal');
  }
  if (/\[STRICT DUNGEON MASTER PROTOCOL\]|\[TASK\]|\[CONTEXT\]|\[NARRATE\]|\[PLAYER ACTION\]|\[SUMMARY\]|\[ADVENTURE START/i.test(t)) {
    flags.push('BLOCK:prompt-echo');
  }
  if (/\[COMPLETE_MILESTONE/i.test(t)) flags.push('marker:COMPLETE_MILESTONE');
  if (/\[COMPLETE_CAMPAIGN\]/i.test(t)) flags.push('marker:COMPLETE_CAMPAIGN');
  if (/\[(CHECK|ROLL):/i.test(t)) flags.push('marker:CHECK/ROLL');
  if (flags.length === 0) flags.push('ok');
  return flags;
}

// One-line-per-talk-milestone note on whether the concluding talk turn's dual-completion
// [COMPLETE_MILESTONE] marker fired, so a reader immediately knows whether the positive
// path was exercised. Detection only; the marker is never acted upon (no state mutation).
function talkMarkerNotes(turns, isLive) {
  const notes = [];
  for (const t of turns) {
    if (!/\(conclude\)/.test(t.label || '')) continue;
    const mid = (t.label.match(/#(\d+)/) || [])[1] || '?';
    let outcome;
    if (!t.sent) outcome = isLive ? 'no (not sent)' : 'n/a (dry-run: no request)';
    else outcome = (t.flags || []).includes('marker:COMPLETE_MILESTONE') ? 'yes' : 'no';
    notes.push(`talk-marker fired: ${outcome} (Milestone #${mid})`);
  }
  return notes;
}

// ===========================================================================
// DETERMINISTIC SIMULATION (guest / member) - exercises the REAL engine.
//
// No network, no key. For a campaign, starting from all milestones incomplete,
// we repeatedly advance every ACTIVE milestone (requirements met, not completed):
//   * mechanical (item/combat/location/talk): fire its deterministic completion
//     event through the real checkMilestoneCompletion and apply the result.
//   * narrative: needs the AI [COMPLETE_MILESTONE] marker. In GUEST mode it can
//     never fire, so it BLOCKS. In MEMBER mode we simulate the marker by calling
//     the engine's completeNarrativeMilestone.
// We loop until the campaign is complete (OK) or a full pass makes no progress
// (STUCK) - then we report the stuck set and why.
//
// The deterministic event shape for each mechanical type is read straight from
// doesEventMatchTrigger in milestoneEngine.js:
//   item     -> { type: 'item_acquired',    itemId:     trigger.item }
//   combat   -> { type: 'enemy_defeated',   enemyId:    trigger.enemy }
//   location -> { type: 'location_visited', locationId: trigger.location }
//   talk     -> { type: 'npc_talked',       npcId:      trigger.npc }
// Level gates (minLevel) are NOT simulated (currentLevel=null, so the engine's
// level check is skipped): this harness tests the milestone GRAPH's completability
// and the guest-vs-member divergence, not XP/level pacing.
// ===========================================================================

const MECHANICAL_TYPES = new Set(['item', 'combat', 'location', 'talk']);

// Build the deterministic completion event for a mechanical milestone, mirroring
// doesEventMatchTrigger. Returns { event } or { malformed: <reason> } when the
// trigger field the engine keys on is missing (which would make the milestone
// impossible to complete - a real authoring bug).
function buildEventForMilestone(m) {
  const t = m.trigger || null;
  switch (m.type) {
    case 'item':
      if (!t || t.item == null) return { malformed: 'item milestone has no trigger.item' };
      return { event: { type: 'item_acquired', itemId: t.item } };
    case 'combat':
      if (!t || t.enemy == null) return { malformed: 'combat milestone has no trigger.enemy' };
      return { event: { type: 'enemy_defeated', enemyId: t.enemy } };
    case 'location':
      if (!t || t.location == null) return { malformed: 'location milestone has no trigger.location' };
      return { event: { type: 'location_visited', locationId: t.location } };
    case 'talk':
      if (!t || t.npc == null) return { malformed: 'talk milestone has no trigger.npc' };
      return { event: { type: 'npc_talked', npcId: t.npc } };
    default:
      return { malformed: `unknown mechanical type "${m.type}"` };
  }
}

const shortText = (m) => `#${m.id} [${m.type || 'untyped'}] "${m.text || ''}"`;

// Run one deterministic walk. `completeNarrative` decides guest (false) vs member (true).
// Returns { status, completedOrder, blockers, bugs, log }.
function simulateWalk(engine, rawMilestones, completeNarrative) {
  // Fresh, deep-ish clone with completed:false - never mutate the template.
  let milestones = rawMilestones.map((m) => ({ ...m, completed: false }));
  const completedOrder = [];
  const bugs = [];
  const log = [];

  let safety = milestones.length * 4 + 8; // generous; a healthy walk needs <= length passes
  while (safety-- > 0) {
    const progress = engine.getCampaignProgress(milestones);
    if (progress.isComplete) break;

    const active = progress.active;
    let progressed = false;

    for (const m of active) {
      if (m.completed) continue; // (defensive; getCampaignProgress already excludes)

      if (m.type === 'narrative' || !MECHANICAL_TYPES.has(m.type)) {
        // Narrative (or untyped legacy) milestones only complete via the AI marker.
        if (m.type === 'narrative' && completeNarrative) {
          const res = engine.completeNarrativeMilestone(milestones, m.id);
          if (res && res.type === 'completed') {
            milestones = res.updatedMilestones;
            completedOrder.push(m);
            log.push(`  completed ${shortText(m)}  via completeNarrativeMilestone (simulated AI marker)`);
            progressed = true;
          } else {
            bugs.push(`${shortText(m)}: completeNarrativeMilestone returned no completion (unexpected)`);
          }
        }
        // guest mode (or untyped): cannot complete here - leave it to block.
        continue;
      }

      // Mechanical: fire the exact deterministic event the engine consumes.
      const built = buildEventForMilestone(m);
      if (built.malformed) {
        bugs.push(`${shortText(m)}: ${built.malformed} - deterministic event can never complete it`);
        continue;
      }
      const res = engine.checkMilestoneCompletion(milestones, built.event, null);
      if (res && res.type === 'completed' && res.milestoneId === m.id) {
        milestones = res.updatedMilestones;
        completedOrder.push(m);
        log.push(`  completed ${shortText(m)}  via event ${JSON.stringify(built.event)}`);
        progressed = true;
      } else if (res && res.type === 'completed') {
        // The event completed a DIFFERENT milestone than the one we fired it for
        // (two milestones share a trigger). Apply it and note it.
        milestones = res.updatedMilestones;
        completedOrder.push(res.milestone);
        log.push(`  completed #${res.milestoneId} (fired for ${shortText(m)} - shared trigger)`);
        bugs.push(`${shortText(m)}: its own event completed #${res.milestoneId} instead (duplicate/shared trigger)`);
        progressed = true;
      } else {
        // The milestone's own deterministic event did not complete it though it is
        // active. That is a mechanical authoring bug (trigger does not match).
        bugs.push(`${shortText(m)}: active, but its deterministic event ${JSON.stringify(built.event)} did not complete it (checkMilestoneCompletion -> ${res ? res.type : 'null'})`);
      }
    }

    if (!progressed) break; // STUCK - a full pass changed nothing.
  }

  const progress = engine.getCampaignProgress(milestones);
  const status = progress.isComplete ? 'OK' : 'STUCK';
  const blockers = progress.isComplete
    ? []
    // Everything still incomplete: active ones are the immediate blockers; locked
    // ones are downstream of them.
    : milestones.filter((m) => !m.completed);
  return { status, completedOrder, blockers, bugs, log, milestones, progress };
}

// Simulate a campaign in guest and member mode and diff them.
function simulateCampaign(engine, template) {
  const milestones = Array.isArray(template.settings?.milestones)
    ? template.settings.milestones
    : null;
  if (!milestones || milestones.length === 0) {
    return { id: template.id, playable: false };
  }
  const guest = simulateWalk(engine, milestones, false);
  const member = simulateWalk(engine, milestones, true);

  // Guest blockers that a member cleared = the divergence. These are the milestones
  // a member can finish but a guest cannot.
  const memberCompletedIds = new Set(member.completedOrder.map((m) => m.id));
  const divergence = guest.blockers.filter(
    (m) => memberCompletedIds.has(m.id) || (member.status === 'OK')
  ).filter((m) => {
    // Only report as divergence milestones the guest failed to complete but the
    // member did (or that are downstream and would clear once narrative clears).
    return !guest.completedOrder.some((c) => c.id === m.id);
  });

  return {
    id: template.id,
    name: template.name,
    subtitle: template.subtitle,
    playable: true,
    total: milestones.length,
    guest,
    member,
    divergence
  };
}

// Classify a blocker for readable reporting.
function classifyBlocker(m, allMilestones, engine) {
  const active = engine.areRequirementsMet(m, allMilestones);
  if (m.type === 'narrative') {
    return active
      ? 'narrative - needs AI [COMPLETE_MILESTONE] marker (no deterministic event)'
      : 'narrative - locked behind an earlier blocker';
  }
  if (!active) return 'locked - a prerequisite milestone never completed';
  return 'active but did not complete on its own event (see bugs)';
}

// ---------------------------------------------------------------------------
// Guards / accounting
// ---------------------------------------------------------------------------
const estimateTokens = (str) => Math.ceil((str ? str.length : 0) / 4); // ~chars/4

function estimateCostUsd(promptTokens, completionTokens, opts) {
  return (promptTokens / 1e6) * opts['price-in'] + (completionTokens / 1e6) * opts['price-out'];
}

class GuardState {
  constructor(opts) {
    this.opts = opts;
    this.requestsMade = 0;
    this.promptTokensTotal = 0;
    this.completionTokensTotal = 0;
    this.window = []; // { ts, tokens } entries within the last 60s
  }

  _prune(now) {
    const cutoff = now - 60000;
    this.window = this.window.filter((e) => e.ts > cutoff);
  }

  windowTokens(now) { this._prune(now); return this.window.reduce((s, e) => s + e.tokens, 0); }
  windowRequests(now) { this._prune(now); return this.window.length; }

  costUsd() {
    return estimateCostUsd(this.promptTokensTotal, this.completionTokensTotal, this.opts);
  }

  // Per-request input cap. Returns a reason string if the request must be refused.
  checkInputCap(estPrompt) {
    if (estPrompt > this.opts['max-prompt-tokens']) {
      return `prompt ~${estPrompt} tokens exceeds --max-prompt-tokens ${this.opts['max-prompt-tokens']}`;
    }
    return null;
  }

  // Per-run budget: would sending this request cross a run cap? Returns reason or null.
  checkRunBudget(estPrompt, estCompletion) {
    if (this.requestsMade + 1 > this.opts['max-requests']) {
      return `would exceed --max-requests ${this.opts['max-requests']}`;
    }
    const projectedTokens = this.promptTokensTotal + this.completionTokensTotal + estPrompt + estCompletion;
    if (projectedTokens > this.opts['max-total-tokens']) {
      return `would exceed --max-total-tokens ${this.opts['max-total-tokens']} (projected ${projectedTokens})`;
    }
    const projectedCost = estimateCostUsd(
      this.promptTokensTotal + estPrompt,
      this.completionTokensTotal + estCompletion,
      this.opts
    );
    if (projectedCost > this.opts['max-usd']) {
      return `would exceed --max-usd $${this.opts['max-usd']} (projected $${projectedCost.toFixed(4)})`;
    }
    return null;
  }

  // Sliding-window rate check. Returns { ok, waitMs, reason }.
  checkRate(estTokens, now) {
    this._prune(now);
    const tokensIfSent = this.windowTokens(now) + estTokens;
    const requestsIfSent = this.windowRequests(now) + 1;
    if (requestsIfSent > this.opts.rpm) {
      const waitMs = this.window.length ? (this.window[0].ts + 60000) - now : 0;
      return { ok: false, waitMs: Math.max(0, waitMs), reason: `--rpm ${this.opts.rpm} would be exceeded` };
    }
    if (tokensIfSent > this.opts.tpm) {
      // Wait until enough of the oldest tokens age out of the window.
      let freed = 0;
      let waitMs = 0;
      for (const e of this.window) {
        freed += e.tokens;
        if (this.windowTokens(now) - freed + estTokens <= this.opts.tpm) {
          waitMs = (e.ts + 60000) - now;
          break;
        }
      }
      return { ok: false, waitMs: Math.max(0, waitMs), reason: `--tpm ${this.opts.tpm} would be exceeded` };
    }
    return { ok: true, waitMs: 0, reason: null };
  }

  record(promptTokens, completionTokens) {
    const now = Date.now();
    this.requestsMade += 1;
    this.promptTokensTotal += promptTokens;
    this.completionTokensTotal += completionTokens;
    this.window.push({ ts: now, tokens: promptTokens + completionTokens });
  }
}

// ---------------------------------------------------------------------------
// Live call — mirrors cf-worker/src/services/openrouter.ts callOpenRouter.
// Only ever invoked in --live --yes mode.
// ---------------------------------------------------------------------------
async function callOpenRouter(key, model, prompt, maxTokens, temperature, redact) {
  let response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://dungeongpt.xyz',
        'X-Title': 'DungeonGPT'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature
      })
    });
  } catch (err) {
    throw new Error(redact(`OpenRouter network error: ${err.message}`));
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(redact(`OpenRouter HTTP ${response.status}: ${body.slice(0, 300)}`));
  }
  const data = await response.json().catch(() => null);
  const content = data?.choices?.[0]?.message?.content;
  const usage = data?.usage || {};
  return { text: typeof content === 'string' ? content : '', usage };
}

const truncate = (s, n = 700) => {
  if (!s) return '';
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > n ? flat.slice(0, n) + ' …[truncated]' : flat;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Deterministic sim runner (mode: guest | member | both). No network, no key.
// ---------------------------------------------------------------------------
async function runSimMode(opts) {
  let mod;
  try {
    mod = await loadAppData();
  } catch (err) {
    console.error(`Failed to load app data / engine: ${err.message}`);
    process.exit(5);
  }
  const { storyTemplates, composeIntro } = mod;
  const engine = {
    areRequirementsMet: mod.areRequirementsMet,
    getCampaignProgress: mod.getCampaignProgress,
    checkMilestoneCompletion: mod.checkMilestoneCompletion,
    completeNarrativeMilestone: mod.completeNarrativeMilestone,
    getMilestoneRewards: mod.getMilestoneRewards
  };

  // Which templates to run: one, or every PLAYABLE template (has settings.milestones).
  let templates;
  if (opts.campaign === 'all') {
    templates = storyTemplates.filter((t) => Array.isArray(t.settings?.milestones) && t.settings.milestones.length);
  } else {
    const t = storyTemplates.find((x) => x.id === opts.campaign);
    if (!t) {
      console.error(`Campaign "${opts.campaign}" not found. Available ids:`);
      for (const x of storyTemplates) console.error(`  - ${x.id}${Array.isArray(x.settings?.milestones) ? '' : '  (stub - no milestones)'}`);
      process.exit(6);
    }
    templates = [t];
  }

  // Fold in any external (--premium-dir) templates. They are simulated with the
  // exact same guest/member walk; a stub with no milestones is skipped in the loader.
  if (opts['premium-dir']) {
    let premium;
    try {
      premium = await loadPremiumTemplates(opts['premium-dir']);
    } catch (err) {
      console.error(`Failed to load --premium-dir templates: ${err.message}`);
      process.exit(7);
    }
    console.log(`[premium-dir] loaded ${premium.length} external template(s) from ${opts['premium-dir']}`);
    templates = templates.concat(premium);
  }

  const showGuest = opts.mode === 'guest' || opts.mode === 'both';
  const showMember = opts.mode === 'member' || opts.mode === 'both';

  console.log('');
  console.log('============================================================');
  console.log(`quest-harness - DETERMINISTIC SIM (mode: ${opts.mode})`);
  console.log('  no network request, no API key - pure game-engine walk');
  console.log('============================================================');

  const results = [];
  for (const template of templates) {
    const r = simulateCampaign(engine, template);
    results.push(r);
    if (!r.playable) continue;

    // Detailed per-campaign block (always for single-campaign; compact for --all below).
    if (opts.campaign !== 'all') {
      console.log('');
      console.log(`Campaign: ${template.id}  (${template.name || 'unnamed'}${template.subtitle ? ' - ' + template.subtitle : ''})`);
      console.log(`Milestones: ${r.total}`);

      // The guest opening - the real no-AI intro a guest actually sees.
      const startTown = template.customNames?.towns?.[0];
      const startTownName = typeof startTown === 'object' ? startTown?.name : startTown;
      const currentTile = startTownName ? { poi: 'town', townName: startTownName } : null;
      const intro = composeIntro(template.settings || {}, SAMPLE_PARTY, currentTile);
      console.log('\n----- Guest opening (introComposer.composeIntro, no AI) -----');
      console.log(intro.split('\n').map((l) => '  ' + l).join('\n'));

      if (showGuest) {
        console.log('\n----- GUEST walk (narrative milestones BLOCKED) -----');
        for (const line of r.guest.log) console.log(line);
        console.log(`  => ${r.guest.status}  (${r.guest.completedOrder.length}/${r.total} completed)`);
        if (r.guest.status === 'STUCK') {
          for (const m of r.guest.blockers) {
            console.log(`     BLOCKED ${shortText(m)} - ${classifyBlocker(m, r.guest.milestones, engine)}`);
          }
        }
      }
      if (showMember) {
        console.log('\n----- MEMBER walk (narrative completed via simulated AI marker) -----');
        for (const line of r.member.log) console.log(line);
        console.log(`  => ${r.member.status}  (${r.member.completedOrder.length}/${r.total} completed)`);
        if (r.member.status === 'STUCK') {
          for (const m of r.member.blockers) {
            console.log(`     BLOCKED ${shortText(m)} - ${classifyBlocker(m, r.member.milestones, engine)}`);
          }
        }
      }
      const allBugs = [...new Set([...r.guest.bugs, ...r.member.bugs])];
      if (allBugs.length) {
        console.log('\n  MECHANICAL BUGS:');
        for (const b of allBugs) console.log(`     - ${b}`);
      }
    }
  }

  // ---- Summary table (always) ----
  const playable = results.filter((r) => r.playable);
  console.log('');
  console.log('============================================================');
  console.log('SUMMARY - per-campaign completability');
  console.log('============================================================');
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`  ${pad('campaign', 24)} ${pad('guest', 8)} ${pad('member', 8)} blockers`);
  console.log(`  ${pad('--------', 24)} ${pad('-----', 8)} ${pad('------', 8)} --------`);
  for (const r of playable) {
    const guestBlock = r.guest.status === 'STUCK'
      ? r.guest.blockers.filter((m) => !r.guest.completedOrder.some((c) => c.id === m.id)).map((m) => `#${m.id}[${m.type}]`).join(',')
      : '-';
    console.log(`  ${pad(r.id, 24)} ${pad(r.guest.status, 8)} ${pad(r.member.status, 8)} ${guestBlock}`);
  }

  // ---- Guest vs member divergence ----
  const diverged = playable.filter((r) => r.guest.status !== r.member.status);
  console.log('');
  console.log('GUEST vs MEMBER DIVERGENCE (member can finish, guest cannot):');
  if (diverged.length === 0) {
    console.log('  none - guest and member reach the same outcome on every campaign.');
  } else {
    for (const r of diverged) {
      console.log(`  ${r.id}: member=${r.member.status}, guest=${r.guest.status}`);
      const rootBlockers = r.guest.blockers.filter((m) => engine.areRequirementsMet(m, r.guest.milestones));
      for (const m of rootBlockers) {
        console.log(`     guest blocked by ${shortText(m)} - ${classifyBlocker(m, r.guest.milestones, engine)}`);
      }
      const downstream = r.guest.blockers.filter((m) => !engine.areRequirementsMet(m, r.guest.milestones));
      if (downstream.length) {
        console.log(`     (downstream locked: ${downstream.map((m) => `#${m.id}[${m.type}]`).join(', ')})`);
      }
    }
  }

  // ---- Mechanical bugs / both-mode soft-locks ----
  const bothStuck = playable.filter((r) => r.guest.status === 'STUCK' && r.member.status === 'STUCK');
  const withBugs = playable.filter((r) => r.guest.bugs.length || r.member.bugs.length);
  console.log('');
  console.log('MECHANICAL BUGS / SOFT-LOCKS FOR BOTH MODES:');
  if (bothStuck.length === 0 && withBugs.length === 0) {
    console.log('  none - every mechanical milestone completes on its deterministic event,');
    console.log('  and every campaign is completable by a member.');
  } else {
    for (const r of bothStuck) {
      console.log(`  ${r.id}: STUCK for guest AND member (graph cannot complete).`);
    }
    for (const r of withBugs) {
      for (const b of [...new Set([...r.guest.bugs, ...r.member.bugs])]) {
        console.log(`  ${r.id}: ${b}`);
      }
    }
  }

  const skipped = storyTemplates.filter((t) => !Array.isArray(t.settings?.milestones) || !t.settings.milestones.length);
  if (opts.campaign === 'all' && skipped.length) {
    console.log('');
    console.log(`Skipped ${skipped.length} non-playable stub/teaser template(s) (no settings.milestones): ${skipped.map((t) => t.id).join(', ')}`);
  }
  console.log('');
  console.log('(deterministic - no network request, no API key used)');
  console.log('============================================================');
  console.log('');
}

// ---------------------------------------------------------------------------
// Live-mode gate + key resolution. Shared by AI mode and the playthrough. Enforces
// --live requires --yes, reads the key ONLY from env / --key-file, never prints it.
// Exits the process on a misconfigured live run. Returns { isLive, key, redact }.
// ---------------------------------------------------------------------------
function resolveLiveKey(opts) {
  const isLive = opts.live;
  if (isLive && !opts.yes) {
    console.error('Refusing to run live: --live requires an explicit --yes as well.');
    console.error('Re-run with:  --live --yes   (this will spend real OpenRouter credit).');
    process.exit(3);
  }
  let key = null;
  let redact = (s) => s;
  if (isLive) {
    try {
      key = readKey(opts['key-file']);
    } catch (err) {
      console.error(`Error reading key: ${err.message}`);
      process.exit(4);
    }
    if (!key) {
      console.error('No OpenRouter key found. Supply it via one of:');
      console.error('  * environment: OPENROUTER_API_KEY=sk-or-...');
      console.error('  * file:        --key-file <path>  (file has a line OPENROUTER_API_KEY=sk-or-...)');
      console.error('The key is never printed or written anywhere.');
      process.exit(4);
    }
    redact = makeRedactor(key);
  }
  return { isLive, key, redact };
}

// ---------------------------------------------------------------------------
// Recorded playthrough runner. Composes the opening + one turn per milestone,
// runs the SAME guarded request loop as AI mode, records every prompt/response +
// automated check flags to a timestamped Markdown transcript under harness-transcripts/,
// and prints a short console summary pointing at that file. DRY-RUN unless live.
// ---------------------------------------------------------------------------
const TRANSCRIPT_DIR = path.join(repoRoot, 'harness-transcripts');

function fmtGuards(opts) {
  return [
    `per-request: max-tokens=${opts['max-tokens']} (ceiling ${HARD_MAX_TOKENS_CEILING}), max-prompt-tokens=${opts['max-prompt-tokens']}`,
    `rate (60s): tpm=${opts.tpm}, rpm=${opts.rpm}, on-limit=${opts['on-limit']}`,
    `per-run: max-requests=${opts['max-requests']}, max-total-tokens=${opts['max-total-tokens']}, max-usd=$${opts['max-usd']}`,
    `pricing: $${opts['price-in']}/1M in, $${opts['price-out']}/1M out (Haiku 4.5 defaults — VERIFY)`
  ];
}

// Run the guarded per-request loop for ONE campaign's composed requests against a
// SHARED GuardState (so a sweep's request/token/USD tallies carry across campaigns and
// the guards stay cumulative). Returns { turns, stoppedBy }. Mutates `guard`. Never
// prints or records the key; the playthrough loop deliberately does NOT echo prompt or
// response prose to the console (only structural counts/flags), so this is safe to run
// over premium campaigns in a sweep.
async function executePlaythroughTurns(opts, requests, { isLive, key, redact }, guard) {
  let stoppedBy = null;
  const turns = []; // { label, playerInput, prompt, estPrompt, sent, response, promptTokens, completionTokens, flags }

  for (let i = 0; i < requests.length; i++) {
    const req = requests[i];

    // Deterministic authored opening: recorded verbatim, NEVER sent (no request, no
    // guards, no network). This is exactly what the app shows guests and uses as the base
    // for the polish request that follows.
    if (req.isAuthored) {
      turns.push({
        label: req.label,
        playerInput: null,
        prompt: null,
        authoredText: req.authoredText,
        isAuthored: true,
        estPrompt: 0,
        sent: false,
        response: null,
        promptTokens: null,
        completionTokens: null,
        flags: ['deterministic: authored opening (no request)']
      });
      console.log(`----- Entry ${i + 1}/${requests.length}: ${req.label} (deterministic; no request) -----`);
      console.log('');
      continue;
    }

    const estPrompt = estimateTokens(req.prompt);
    const estCompletion = opts['max-tokens'];
    const rec = {
      label: req.label,
      playerInput: req.playerInput || null,
      prompt: req.prompt,
      estPrompt,
      sent: false,
      response: null,
      promptTokens: null,
      completionTokens: null,
      flags: []
    };

    console.log(`----- Request ${i + 1}/${requests.length}: ${req.label} -----`);
    console.log(`  est. prompt tokens: ~${estPrompt}   (est. completion cap: ${estCompletion})`);

    // Guard 1: per-request input cap.
    const inputReason = guard.checkInputCap(estPrompt);
    if (inputReason) {
      console.log(`  [GUARD] refusing this request: ${inputReason}`);
      stoppedBy = `input cap (${inputReason})`;
      rec.flags.push(`GUARD:${inputReason}`);
      turns.push(rec);
      break;
    }

    // Guard 2: per-run budget.
    const budgetReason = guard.checkRunBudget(estPrompt, estCompletion);
    if (budgetReason) {
      console.log(`  [GUARD] hard-abort run: ${budgetReason}`);
      stoppedBy = `run budget (${budgetReason})`;
      rec.flags.push(`GUARD:${budgetReason}`);
      turns.push(rec);
      break;
    }

    // Guard 3: sliding-window rate limit.
    const now = Date.now();
    const rate = guard.checkRate(estPrompt + estCompletion, now);
    if (!rate.ok) {
      if (opts['on-limit'] === 'wait') {
        console.log(`  [GUARD] rate window: ${rate.reason}; waiting ~${Math.ceil(rate.waitMs / 1000)}s ...`);
        if (isLive && rate.waitMs > 0) await sleep(rate.waitMs);
      } else {
        console.log(`  [GUARD] rate window: ${rate.reason}; aborting (--on-limit abort)`);
        stoppedBy = `rate limit (${rate.reason})`;
        rec.flags.push(`GUARD:${rate.reason}`);
        turns.push(rec);
        break;
      }
    }

    if (!isLive) {
      // DRY-RUN: account with estimates, do NOT fetch. Record the prompt only.
      guard.record(estPrompt, estCompletion);
      rec.response = '[dry-run] not sent';
      rec.flags.push('dry-run: not sent');
      if (req.isPolish) {
        // No response to evaluate in dry-run; the app would run isPolishSafe on the live
        // polished text and fall back to the authored opening on reject.
        rec.polishVerdict = 'n/a (dry-run: nothing sent; app would evaluate isPolishSafe on the live polished response)';
      }
      turns.push(rec);
      console.log(`  [dry-run] would send. running tallies: requests=${guard.requestsMade}, tokens≈${guard.promptTokensTotal + guard.completionTokensTotal}, cost≈$${guard.costUsd().toFixed(4)}`);
      console.log('');
      continue;
    }

    // LIVE: send, record actual usage + response + checks.
    try {
      const { text, usage } = await callOpenRouter(
        key, opts.model, req.prompt, opts['max-tokens'], opts.temperature, redact
      );
      const promptTokens = Number.isFinite(usage.prompt_tokens) ? usage.prompt_tokens : estPrompt;
      const completionTokens = Number.isFinite(usage.completion_tokens) ? usage.completion_tokens : estimateTokens(text);
      guard.record(promptTokens, completionTokens);
      rec.sent = true;
      rec.response = text || '';
      rec.promptTokens = promptTokens;
      rec.completionTokens = completionTokens;
      rec.flags = runResponseChecks(text);
      if (req.isPolish) {
        // Replicate the hook's accept/reject decision on the polished opening.
        const polished = (text || '').trim();
        const accepted = isPolishSafeReplica(polished, req.authored, {
          startPlaceName: req.startPlaceName, destination: req.destination
        });
        rec.polishVerdict = accepted
          ? 'ACCEPT (app would show this polished opening)'
          : 'REJECT (app would fall back to the authored opening verbatim)';
        rec.flags.push(accepted ? 'polish:ACCEPT' : 'polish:REJECT');
      }
      turns.push(rec);
      console.log(`  [${req.label}] response recorded (${completionTokens} completion tokens). flags: ${rec.flags.join(', ')}`);
      console.log(`  usage: prompt=${promptTokens}, completion=${completionTokens}. running: requests=${guard.requestsMade}, tokens=${guard.promptTokensTotal + guard.completionTokensTotal}, cost≈$${guard.costUsd().toFixed(4)}`);
      console.log('');
    } catch (err) {
      console.error(`  [error] ${redact(err.message)}`);
      stoppedBy = `request error (${redact(err.message)})`;
      rec.flags.push('BLOCK:request-error');
      rec.response = `[error] ${redact(err.message)}`;
      turns.push(rec);
      break;
    }
  }

  return { turns, stoppedBy };
}

// Snapshot the shared guard's cumulative tallies so a sweep can compute PER-CAMPAIGN
// deltas (requests/tokens/cost this campaign added) from before/after snapshots.
function guardSnapshot(guard) {
  return {
    requestsMade: guard.requestsMade,
    promptTokens: guard.promptTokensTotal,
    completionTokens: guard.completionTokensTotal
  };
}
function accountingDelta(before, after, opts) {
  const promptTokens = after.promptTokens - before.promptTokens;
  const completionTokens = after.completionTokens - before.completionTokens;
  return {
    requestsMade: after.requestsMade - before.requestsMade,
    promptTokens,
    completionTokens,
    cost: estimateCostUsd(promptTokens, completionTokens, opts)
  };
}

// Write a single campaign's transcript to harness-transcripts/ and return its path.
// `accounting` carries PER-CAMPAIGN numbers (from the shared guard's delta in a sweep,
// or the whole guard for a single-campaign run).
function writeCampaignTranscript({ opts, template, isLive, startedAt, stamp, requests, turns, accounting, stoppedBy, redact, networkRequests, milestoneCount }) {
  const transcriptPath = path.join(TRANSCRIPT_DIR, `playthrough-${template.id}-${stamp}.md`);
  try {
    fs.mkdirSync(TRANSCRIPT_DIR, { recursive: true });
    const out = buildTranscriptMarkdown({ opts, template, isLive, startedAt, requests, turns, accounting, stoppedBy, redact, networkRequests, milestoneCount });
    fs.writeFileSync(transcriptPath, out, 'utf8');
  } catch (err) {
    console.error(redact(`Failed to write transcript for ${template.id}: ${err.message}`));
  }
  return transcriptPath;
}

// A guard stop is "cumulative" (halts a whole sweep) when it is a run-budget / rate /
// live-error stop — as opposed to a per-request input-cap refusal, which is specific to
// that one oversized prompt and does not implicate the shared budget.
function isCumulativeStop(stoppedBy) {
  return !!stoppedBy && /^(run budget|rate limit|request error)/.test(stoppedBy);
}

// ---------------------------------------------------------------------------
// Single-campaign recorded playthrough (unchanged behaviour). Builds its own guard.
// ---------------------------------------------------------------------------
async function runPlaythrough(opts, template, DM_PROTOCOL, liveKey, appExports) {
  const { isLive, redact } = liveKey;
  const requests = composePlaythroughRequests(template, DM_PROTOCOL, appExports);
  const startedAt = new Date();
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-');

  // The authored opening is a deterministic entry, NOT a request. Network requests =
  // 1 opening polish + one turn per milestone.
  const milestoneCount = requests.filter((r) => r.milestone).length;
  const networkRequests = requests.filter((r) => !r.isAuthored).length;

  // ---- Preflight (console) ----
  console.log('');
  console.log('============================================================');
  console.log(`quest-harness — RECORDED PLAYTHROUGH — ${isLive ? 'LIVE' : 'DRY-RUN (no network requests)'}`);
  console.log('============================================================');
  console.log(`Campaign:        ${template.id}  (${template.name || 'unnamed'})`);
  console.log(`Model:           ${opts.model}`);
  console.log(`Composed:        1 authored opening (no request) + ${networkRequests} request(s): 1 opening polish + ${milestoneCount} milestone turn(s)`);
  console.log(`Key source:      ${isLive ? (process.env.OPENROUTER_API_KEY ? 'env OPENROUTER_API_KEY (redacted)' : '--key-file (redacted)') : 'n/a (dry-run)'}`);
  console.log('Guards (enforced before each request):');
  for (const g of fmtGuards(opts)) console.log(`  ${g}`);
  console.log('============================================================');
  console.log('');

  const guard = new GuardState(opts);
  const { turns, stoppedBy } = await executePlaythroughTurns(opts, requests, liveKey, guard);

  // ---- Write the transcript ----
  const accounting = {
    requestsMade: guard.requestsMade,
    promptTokens: guard.promptTokensTotal,
    completionTokens: guard.completionTokensTotal,
    cost: guard.costUsd()
  };
  const transcriptPath = writeCampaignTranscript({
    opts, template, isLive, startedAt, stamp, requests, turns, accounting, stoppedBy, redact, networkRequests, milestoneCount
  });

  // ---- Console summary ----
  console.log('============================================================');
  console.log('PLAYTHROUGH SUMMARY');
  console.log(`  mode:            ${isLive ? 'LIVE' : 'DRY-RUN'}`);
  console.log(`  requests ${isLive ? 'made' : 'simulated'}: ${guard.requestsMade} / ${networkRequests} composed (+ 1 authored opening, no request)`);
  console.log(`  tokens (in/out): ${guard.promptTokensTotal} / ${guard.completionTokensTotal}`);
  console.log(`  est. cost:       $${guard.costUsd().toFixed(4)}`);
  console.log(`  stopped by:      ${stoppedBy || 'nothing (composed all turns)'}`);
  for (const note of talkMarkerNotes(turns, isLive)) console.log(`  ${note}`);
  console.log(`  transcript:      ${transcriptPath}`);
  if (!isLive) console.log('  (no network request was made — dry-run; responses are "[dry-run] not sent")');
  console.log('============================================================');
  console.log('');
}

// Build the Markdown transcript string. The prompt/response are recorded IN FULL
// (redacted); only the console output truncates.
function buildTranscriptMarkdown({ opts, template, isLive, startedAt, requests, turns, accounting, stoppedBy, redact, networkRequests, milestoneCount }) {
  const L = [];
  L.push(`# Quest-harness playthrough transcript`);
  L.push('');
  L.push(`- **Campaign:** ${template.id} (${template.name || 'unnamed'}${template.subtitle ? ` — ${template.subtitle}` : ''})`);
  L.push(`- **Model:** ${opts.model}`);
  L.push(`- **Mode:** ${isLive ? 'LIVE (sent to OpenRouter)' : 'DRY-RUN (no network call; responses not sent)'}`);
  L.push(`- **Timestamp:** ${startedAt.toISOString()}`);
  L.push(`- **Composed:** 1 authored opening (no request) + ${networkRequests} request(s): 1 opening polish + ${milestoneCount} milestone turn(s)`);
  L.push('');
  L.push('### Guard settings');
  for (const g of fmtGuards(opts)) L.push(`- ${g}`);
  L.push('');
  L.push('> The OPENING now uses the REAL shared introComposer.composeIntro (imported, not');
  L.push('> replicated): the authored opening is recorded deterministically (no request) and');
  L.push('> the single opening request is the bounded [ADVENTURE START - POLISH] reword pass,');
  L.push('> whose result is judged by a REPLICATED isPolishSafe (accept = show polished;');
  L.push('> reject = fall back to authored). The polish prompt + isPolishSafe are still copied');
  L.push('> from src/hooks/useGameInteraction.js and CAN DRIFT (a future refactor should share');
  L.push('> them too). Each milestone turn is REPLICATED from handleSubmit (gameContext +');
  L.push('> [CONTEXT]/[SUMMARY]/[PLAYER ACTION]/[NARRATE] wrapped by DM_PROTOCOL + style');
  L.push('> directive) and CAN DRIFT. Location context is a minimal stand-in (the harness');
  L.push('> generates no town maps); summary/RAG are omitted.');
  L.push('');
  L.push('---');
  L.push('');

  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    L.push(`## Turn ${i + 1}: ${t.label}`);
    L.push('');

    // Deterministic authored opening: recorded verbatim, never a request.
    if (t.isAuthored) {
      L.push('_Deterministic authored opening (introComposer.composeIntro). No request, no network: the app shows this to guests verbatim and uses it as the base for the polish pass below._');
      L.push('');
      L.push('### Authored opening');
      L.push('');
      L.push('```text');
      L.push(redact(t.authoredText || '(empty)'));
      L.push('```');
      L.push('');
      L.push(`**Automated checks:** ${t.flags.length ? t.flags.join(', ') : '(none)'}`);
      L.push('');
      L.push('---');
      L.push('');
      continue;
    }

    if (t.playerInput) {
      L.push(`**Scripted player input:** ${t.playerInput}`);
      L.push('');
    }
    L.push(`**Est. prompt tokens:** ~${t.estPrompt}`);
    L.push('');
    L.push('### Prompt sent');
    L.push('');
    L.push('```text');
    L.push(redact(t.prompt));
    L.push('```');
    L.push('');
    L.push('### Response');
    L.push('');
    if (t.sent) {
      L.push('```text');
      L.push(redact(t.response || '(empty)'));
      L.push('```');
      L.push('');
      L.push(`**Token usage:** prompt=${t.promptTokens}, completion=${t.completionTokens}`);
    } else {
      L.push('```text');
      L.push(redact(t.response || '[dry-run] not sent'));
      L.push('```');
    }
    L.push('');
    if (t.polishVerdict) {
      L.push(`**isPolishSafe verdict:** ${t.polishVerdict}`);
      L.push('');
    }
    L.push(`**Automated checks:** ${t.flags.length ? t.flags.join(', ') : '(none)'}`);
    L.push('');
    L.push('---');
    L.push('');
  }

  L.push('## Summary');
  L.push('');
  L.push(`- **Requests ${isLive ? 'made' : 'simulated'}:** ${accounting.requestsMade} / ${networkRequests} composed (+ 1 authored opening, no request)`);
  L.push(`- **Tokens (in/out):** ${accounting.promptTokens} / ${accounting.completionTokens}`);
  L.push(`- **Estimated cost:** $${accounting.cost.toFixed(4)}`);
  L.push(`- **Stopped by:** ${stoppedBy || 'nothing (composed all turns)'}`);
  for (const note of talkMarkerNotes(turns, isLive)) L.push(`- **${note}**`);
  L.push('');
  L.push('### Per-turn flags overview');
  L.push('');
  L.push('| # | Turn | Flags |');
  L.push('|---|------|-------|');
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    L.push(`| ${i + 1} | ${t.label} | ${t.flags.length ? t.flags.join(', ') : '(none)'} |`);
  }
  L.push('');
  if (!isLive) L.push('_(dry-run: no network request was made; responses were not sent)_');
  L.push('');
  return L.join('\n');
}

// ===========================================================================
// SWEEP STATE (resumable, chunked sweeps) — a named sweep persists a STRUCTURAL
// JSON state file so it can span multiple invocations. Each invocation (chunk)
// runs the remaining PENDING campaigns under ITS OWN guard budget; the state
// accumulates totals across chunks. The state is STRUCTURAL ONLY (ids, kinds,
// counts, flags, marker yes/no) — never any prose — so it is safe for premium.
// ===========================================================================
const SWEEP_STATE_SUFFIX = '.sweep-state.json';

function sweepStatePath(name) {
  return path.join(TRANSCRIPT_DIR, `${name}${SWEEP_STATE_SUFFIX}`);
}

function saveSweepState(statePath, state) {
  state.updatedAt = new Date().toISOString();
  fs.mkdirSync(TRANSCRIPT_DIR, { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
}

function loadSweepState(statePath) {
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

// Locate the most-recently-updated sweep-state file under harness-transcripts/.
// Returns { path, state } or null when none exist.
function findMostRecentSweepState() {
  let files;
  try {
    files = fs.readdirSync(TRANSCRIPT_DIR).filter((f) => f.endsWith(SWEEP_STATE_SUFFIX));
  } catch {
    return null;
  }
  let best = null;
  for (const f of files) {
    const p = path.join(TRANSCRIPT_DIR, f);
    let state;
    try { state = loadSweepState(p); } catch { continue; }
    const t = Date.parse(state.updatedAt || '') || (() => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } })();
    if (!best || t > best.t) best = { t, path: p, state };
  }
  return best ? { path: best.path, state: best.state } : null;
}

// Build a fresh sweep-state object from the ordered entry list ({ template, isPremium }).
// STRUCTURAL only: we persist ids + kind + status, never any template prose.
function buildFreshSweepState(name, entries, opts, isLive) {
  return {
    sweepName: name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    model: opts.model,
    includesPremium: entries.some((e) => e.isPremium),
    startedDryRun: !isLive,
    campaigns: entries.map((e) => ({
      id: e.template.id,
      kind: e.isPremium ? 'premium' : 'built-in',
      status: 'pending',       // pending | done
      result: null,            // structural result row once done
      transcript: null,        // pointer to the per-campaign transcript file
      doneAt: null
    })),
    // Cumulative tallies ACROSS all chunks (each chunk's guard is per-invocation).
    totals: { requestsMade: 0, promptTokens: 0, completionTokens: 0, cost: 0 }
  };
}

// ===========================================================================
// RECORDED PLAYTHROUGH SWEEP (--playthrough --all) — run the recorded playthrough
// for EVERY playable campaign (+ premium templates when --premium-dir is given).
// The guard budget bounds THIS invocation (chunk); a named/resumable sweep carries
// cumulative totals across chunks in its state file. One per-campaign transcript each
// (prose allowed — those files are local/gitignored), plus one aggregate sweep-summary
// (console + file) that stays STRUCTURAL for premium rows (id + counts + flags only).
// ===========================================================================

// The blocking check flags we surface in the aggregate (empty / refusal / prompt-echo
// / request-error). Marker/ok/dry-run flags are not "blocking".
function extractBlockFlags(turns) {
  const out = [];
  turns.forEach((t, idx) => {
    for (const f of (t.flags || [])) {
      if (f.startsWith('BLOCK:')) out.push(`turn ${idx + 1} ${f}`);
    }
  });
  return out;
}

// Compact one campaign's talk-marker notes to "#<id>:yes|no|n/a" tokens for the row.
function compactTalkNotes(notes) {
  return notes.map((n) => {
    const mid = (n.match(/#(\d+)/) || [])[1] || '?';
    const outcome = /fired: yes/.test(n) ? 'yes' : /fired: no\b/.test(n) ? 'no' : 'n/a';
    return `#${mid}:${outcome}`;
  });
}

// Build the aggregate sweep-summary markdown from the STATE (the full picture across all
// chunks) plus what THIS chunk did. Printed to the console verbatim — it is structural, so
// it is safe even when premium campaigns are included. `doneThisChunk` is a Set of ids the
// current invocation completed; `pendingProjection` is { requests, cost } for the campaigns
// still pending (the budget a further resume needs).
function buildSweepSummary({ opts, state, isLive, startedAt, guard, doneThisChunk, pendingProjection, stopInfo }) {
  const L = [];
  const campaigns = state.campaigns;
  const premiumCount = campaigns.filter((c) => c.kind === 'premium').length;
  const doneCount = campaigns.filter((c) => c.status === 'done').length;
  const pendingCount = campaigns.filter((c) => c.status === 'pending').length;
  const chunkTokens = guard.promptTokensTotal + guard.completionTokensTotal;

  L.push('# Quest-harness playthrough SWEEP summary');
  L.push('');
  L.push(`- **Sweep name:** ${state.sweepName}`);
  L.push(`- **Mode (this chunk):** ${isLive ? 'LIVE (sent to OpenRouter)' : 'DRY-RUN (no network call)'}`);
  L.push(`- **Created:** ${state.createdAt}`);
  L.push(`- **Updated:** ${state.updatedAt || startedAt.toISOString()}`);
  L.push(`- **Model:** ${state.model || opts.model}`);
  L.push(`- **Campaigns:** ${campaigns.length} (${campaigns.length - premiumCount} built-in, ${premiumCount} premium) — ${doneCount} done, ${pendingCount} pending`);
  L.push(`- **This chunk completed:** ${doneThisChunk.size} campaign(s)`);
  L.push(`- **Includes premium:** ${state.includesPremium ? 'yes' : 'no'}`);
  L.push('');
  L.push('### Guard budget (bounds THIS invocation / chunk; state totals accumulate across chunks)');
  for (const g of fmtGuards(opts)) L.push(`- ${g}`);
  L.push('');
  if (stopInfo) {
    L.push(`> **Chunk budget stop:** this chunk hit a cumulative guard while running campaign \`${stopInfo.id}\` (${stopInfo.stoppedBy}). That campaign stays PENDING (it re-runs whole on the next resume); campaigns after it were left pending. Raise --max-requests / --max-total-tokens / --max-usd for a bigger chunk, or run \`--resume ${state.sweepName}\` again.`);
  } else if (pendingCount === 0) {
    L.push('> Sweep COMPLETE: every campaign is done across the chunks run so far.');
  } else {
    L.push(`> This chunk completed all campaigns it could within budget; ${pendingCount} campaign(s) remain pending. Run \`--resume ${state.sweepName}\` to continue.`);
  }
  L.push('');
  L.push('### Per-campaign rows (full picture across all chunks)');
  L.push('');
  L.push('_Premium rows are structural only: id + counts + flags, no premium prose. Full per-campaign prompts/responses live in the individual (gitignored, local-only) transcripts._');
  L.push('');
  L.push('| campaign | kind | milestones | requests (made/composed) | tokens in/out | est cost | blocking flags | talk-markers | status |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const c of campaigns) {
    const r = c.result;
    const mCell = r ? r.milestoneCount : '-';
    const reqCell = r ? `${r.requestsMade}/${r.networkRequests}` : '-';
    const tokCell = r ? `${r.promptTokens}/${r.completionTokens}` : '-';
    const costCell = r ? `$${r.cost.toFixed(4)}` : '-';
    const blockCell = r ? (r.blocks.length ? r.blocks.join('; ') : 'none') : '-';
    const talkCell = r && r.talks.length ? r.talks.join(' ') : '-';
    let status;
    if (c.status === 'done') status = doneThisChunk.has(c.id) ? 'done (this chunk)' : 'done';
    else status = 'pending';
    L.push(`| ${c.id} | ${c.kind} | ${mCell} | ${reqCell} | ${tokCell} | ${costCell} | ${blockCell} | ${talkCell} | ${status} |`);
  }
  L.push('');
  L.push('### Totals');
  L.push('');
  L.push(`- **Cumulative across all chunks (from state):** requests=${state.totals.requestsMade}, tokens=${state.totals.promptTokens}/${state.totals.completionTokens}, est cost=$${state.totals.cost.toFixed(4)}`);
  L.push(`- **This chunk:** requests ${isLive ? 'made' : 'simulated'}=${guard.requestsMade}, tokens=${guard.promptTokensTotal}/${guard.completionTokensTotal} (${chunkTokens} total), est cost=$${guard.costUsd().toFixed(4)}`);
  L.push('');
  if (pendingCount > 0) {
    L.push('### Remaining pending (budget a further resume needs)');
    L.push('');
    L.push(`- **Pending campaigns:** ${pendingCount}`);
    L.push(`- **Projected requests (remaining):** ${pendingProjection.requests}`);
    L.push(`- **Projected est cost (remaining):** $${pendingProjection.cost.toFixed(4)}  (worst-case ${opts['max-tokens']}-token completions at $${opts['price-in']}/1M in, $${opts['price-out']}/1M out)`);
    L.push(`- To finish in one more chunk: \`--resume ${state.sweepName} --max-requests ${pendingProjection.requests} --max-usd ${(Math.ceil(pendingProjection.cost * 100) / 100 + 0.01).toFixed(2)}\` (plus headroom).`);
    L.push('');
  }
  if (!isLive) L.push('_(dry-run: no network request was made; premium rows carry no prose.)_');
  L.push('');
  return L.join('\n');
}

// Project the request count + worst-case cost for a set of state-campaign entries by
// composing (locally, no network) each one's playthrough requests. Used to tell the user
// the budget a further resume of the PENDING campaigns needs.
function projectPending(campaigns, resolver, opts, DM_PROTOCOL, appExports) {
  let requests = 0;
  let cost = 0;
  for (const c of campaigns) {
    const resolved = resolver(c.id);
    if (!resolved) continue; // unresolvable (e.g. premium without --premium-dir) — skip in projection
    const reqs = composePlaythroughRequests(resolved.template, DM_PROTOCOL, appExports);
    for (const r of reqs) {
      if (r.isAuthored) continue;
      requests += 1;
      cost += estimateCostUsd(estimateTokens(r.prompt), opts['max-tokens'], opts);
    }
  }
  return { requests, cost };
}

// Run ONE CHUNK of a (possibly resumed) sweep: iterate the state's campaigns, skip those
// already DONE, and run the PENDING ones under THIS invocation's guard budget. Persists the
// state after each campaign completes. `resolver(id)` -> { template, isPremium } | null.
async function runPlaythroughSweep(opts, state, statePath, resolver, DM_PROTOCOL, liveKey, appExports) {
  const { isLive, redact } = liveKey;
  const startedAt = new Date();
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
  const guard = new GuardState(opts); // FRESH guard per INVOCATION => this chunk's budget.

  const campaigns = state.campaigns;
  const premiumCount = campaigns.filter((c) => c.kind === 'premium').length;
  const alreadyDone = campaigns.filter((c) => c.status === 'done').length;
  const pendingAtStart = campaigns.filter((c) => c.status === 'pending').length;

  console.log('');
  console.log('============================================================');
  console.log(`quest-harness — RECORDED PLAYTHROUGH SWEEP — ${isLive ? 'LIVE' : 'DRY-RUN (no network requests)'}`);
  console.log('============================================================');
  console.log(`Sweep name:      ${state.sweepName}`);
  console.log(`Campaigns:       ${campaigns.length} (${campaigns.length - premiumCount} built-in, ${premiumCount} premium) — ${alreadyDone} done, ${pendingAtStart} pending`);
  console.log(`State file:      ${statePath}`);
  console.log(`Model:           ${opts.model}`);
  console.log(`Key source:      ${isLive ? (process.env.OPENROUTER_API_KEY ? 'env OPENROUTER_API_KEY (redacted)' : '--key-file (redacted)') : 'n/a (dry-run)'}`);
  console.log('Guard budget (bounds THIS invocation / chunk; state carries totals across chunks):');
  for (const g of fmtGuards(opts)) console.log(`  ${g}`);
  console.log('============================================================');
  console.log('');

  // Already complete? Nothing to run: print and refresh the summary.
  if (pendingAtStart === 0) {
    console.log(`sweep ${state.sweepName} already complete`);
    console.log('');
    const summary = buildSweepSummary({
      opts, state, isLive, startedAt, guard,
      doneThisChunk: new Set(), pendingProjection: { requests: 0, cost: 0 }, stopInfo: null
    });
    const summaryPath = path.join(TRANSCRIPT_DIR, `sweep-summary-${state.sweepName}.md`);
    try { fs.writeFileSync(summaryPath, summary, 'utf8'); } catch (err) { console.error(redact(`Failed to write sweep summary: ${err.message}`)); }
    console.log(summary);
    console.log(`Aggregate sweep summary written to: ${summaryPath}`);
    console.log('============================================================');
    console.log('');
    return;
  }

  const doneThisChunk = new Set();
  let chunkStopped = false;
  let stopInfo = null;

  for (const c of campaigns) {
    if (c.status === 'done') continue;       // completed on a prior chunk — skip.
    if (chunkStopped) break;                  // budget hit — leave the rest pending.

    const resolved = resolver(c.id);
    if (!resolved) {
      // Should be prevented by the up-front premium reconciliation, but stay defensive.
      console.error(`----- ${c.id} (${c.kind}): cannot resolve template (missing --premium-dir?) — left PENDING -----`);
      continue;
    }
    const template = resolved.template;
    const requests = composePlaythroughRequests(template, DM_PROTOCOL, appExports);
    const milestoneCount = requests.filter((r) => r.milestone).length;
    const networkRequests = requests.filter((r) => !r.isAuthored).length;

    console.log(`----- Campaign: ${c.id} (${c.kind}) — ${milestoneCount} milestone(s), ${networkRequests} request(s) -----`);
    const before = guardSnapshot(guard);
    const { turns, stoppedBy } = await executePlaythroughTurns(opts, requests, liveKey, guard);
    const accounting = accountingDelta(before, guardSnapshot(guard), opts);
    const isStop = isCumulativeStop(stoppedBy);

    if (isStop) {
      // A cumulative (budget/rate/error) stop cut this campaign off before it finished all
      // its turns. Leave it PENDING so the next resume runs it WHOLE; its partial chunk
      // spend stays in this chunk's guard tally but is NOT persisted to the cumulative
      // state totals (which only accrue completed campaigns). No transcript for a partial.
      chunkStopped = true;
      stopInfo = { id: c.id, stoppedBy, turn: turns.length, label: (turns[turns.length - 1] || {}).label || '?' };
      console.log(`  -> STOPPED mid-campaign (${stoppedBy}); ${c.id} stays PENDING and will re-run whole on the next resume.`);
      console.log(`     Raise --max-requests / --max-total-tokens / --max-usd for a bigger chunk.`);
      console.log('');
      break;
    }

    // Completed all turns this chunk (a non-cumulative input-cap refusal still counts as
    // done — that one oversized prompt is skipped, the rest ran, mirroring single-campaign
    // behaviour — but it is noted in the result so it is not silently lost).
    const transcriptPath = writeCampaignTranscript({
      opts, template, isLive, startedAt, stamp, requests, turns, accounting, stoppedBy, redact, networkRequests, milestoneCount
    });
    const talkNotes = talkMarkerNotes(turns, isLive);
    c.status = 'done';
    c.result = {
      milestoneCount,
      networkRequests,
      requestsMade: accounting.requestsMade,
      promptTokens: accounting.promptTokens,
      completionTokens: accounting.completionTokens,
      cost: accounting.cost,
      blocks: extractBlockFlags(turns),
      talks: compactTalkNotes(talkNotes),
      stoppedBy: stoppedBy || null,
      state: isLive ? 'done' : 'done-dry'
    };
    c.transcript = transcriptPath;
    c.doneAt = new Date().toISOString();
    // Accumulate cumulative totals across chunks, then persist immediately.
    state.totals.requestsMade += accounting.requestsMade;
    state.totals.promptTokens += accounting.promptTokens;
    state.totals.completionTokens += accounting.completionTokens;
    state.totals.cost += accounting.cost;
    saveSweepState(statePath, state);
    doneThisChunk.add(c.id);

    console.log(`  -> DONE${isLive ? '' : ' (dry-run)'}: ${accounting.requestsMade}/${networkRequests} request(s); chunk running: requests=${guard.requestsMade}, tokens=${guard.promptTokensTotal + guard.completionTokensTotal}, cost≈$${guard.costUsd().toFixed(4)}${stoppedBy ? `; note: ${stoppedBy}` : ''}`);
    console.log(`     transcript: ${transcriptPath}`);
    console.log('');
  }

  // Persist once more (refreshes updatedAt even if the chunk stopped without a completion).
  saveSweepState(statePath, state);

  // ---- Aggregate summary (full picture from state; console + per-name file) ----
  const stillPending = campaigns.filter((c) => c.status === 'pending');
  const pendingProjection = projectPending(stillPending, resolver, opts, DM_PROTOCOL, appExports);
  const summary = buildSweepSummary({
    opts, state, isLive, startedAt, guard, doneThisChunk, pendingProjection, stopInfo
  });
  const summaryPath = path.join(TRANSCRIPT_DIR, `sweep-summary-${state.sweepName}.md`);
  try {
    fs.mkdirSync(TRANSCRIPT_DIR, { recursive: true });
    fs.writeFileSync(summaryPath, summary, 'utf8');
  } catch (err) {
    console.error(redact(`Failed to write sweep summary: ${err.message}`));
  }

  console.log('============================================================');
  console.log(summary);
  console.log('============================================================');
  console.log(`State file:               ${statePath}`);
  console.log(`Aggregate sweep summary:  ${summaryPath}`);
  if (stillPending.length > 0) {
    if (opts.sweepAll) {
      const keyPrefix = opts.live ? 'OPENROUTER_API_KEY=... ' : '';
      const liveFlags = opts.live ? ' --live --yes' : '';
      console.log(`${stillPending.length} campaign(s) still pending — re-run the SAME command to continue:`);
      console.log(`  ${keyPrefix}npm run harness -- --sweep-all${liveFlags}`);
    } else {
      console.log(`${stillPending.length} campaign(s) still pending — run:  node scripts/quest-harness.mjs --playthrough --resume ${state.sweepName}${state.includesPremium ? ' --premium-dir <path>' : ''}`);
    }
  } else {
    console.log(`Sweep ${state.sweepName} is COMPLETE.`);
  }
  if (!isLive) console.log('(no network request was made — dry-run)');
  console.log('============================================================');
  console.log('');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }

  if (opts.help) { printHelp(); process.exit(0); }

  // Deterministic sim modes short-circuit the AI path entirely: no key, no network.
  if (opts.mode !== 'ai') {
    await runSimMode(opts);
    return;
  }

  const isSweep = opts.playthrough && opts.campaign === 'all';

  // --sweep-all auto-detects the premium campaigns dir (unless --no-premium or an explicit
  // --premium-dir is given) and folds it into the sweep by setting opts['premium-dir'] so
  // the rest of the sweep code path is unchanged. Only --sweep-all auto-detects; plain
  // --playthrough --all still requires an explicit --premium-dir (unchanged behaviour).
  if (opts.sweepAll) {
    const pr = resolvePremiumDir(opts);
    if (pr.dir) {
      opts['premium-dir'] = pr.dir;
      console.log(`[sweep-all] premium: INCLUDED from ${pr.dir}  (${pr.source})`);
    } else if (opts['no-premium']) {
      console.log('[sweep-all] premium: SKIPPED (--no-premium) — built-in campaigns only.');
    } else {
      console.log('[sweep-all] premium: not found — running built-in campaigns only.');
      console.log('[sweep-all]   to include premium, set HARNESS_PREMIUM_DIR=<dir> or pass --premium-dir <dir>.');
    }
  }

  // --premium-dir affects the guest/member/both sim (handled in runSimMode) and the
  // --playthrough --all sweep. It is ignored in single-campaign AI / playthrough runs.
  if (opts['premium-dir'] && !isSweep) {
    console.warn('[premium-dir] ignored here (it only affects the guest/member/both sim and the --playthrough --all sweep).');
  }

  // Enforce --live/--yes and resolve the key (never printed). Shared with playthrough.
  const { isLive, key, redact } = resolveLiveKey(opts);

  // Load app data + compose the prompts. composeIntro/formatStartObjective are the REAL
  // shared authored-opening builders (used by the playthrough opening).
  let storyTemplates, DM_PROTOCOL, composeIntro, formatStartObjectiveReal;
  try {
    ({ storyTemplates, DM_PROTOCOL, composeIntro, formatStartObjective: formatStartObjectiveReal } = await loadAppData());
  } catch (err) {
    console.error(redact(`Failed to load app data (storyTemplates / DM_PROTOCOL): ${err.message}`));
    process.exit(5);
  }
  const appExports = { composeIntro, formatStartObjective: formatStartObjectiveReal };

  // Recorded playthrough SWEEP: every playable built-in campaign (+ premium templates
  // when --premium-dir is given). One transcript per campaign + one aggregate summary.
  // The guard budget bounds THIS invocation; a NAMED sweep persists resumable state so
  // it can span multiple chunks. --resume continues an existing sweep from its state.
  if (isSweep) {
    // Resolve built-in playable templates + any --premium-dir templates. Both a fresh
    // start and a resume may need these to compose the pending campaigns' turns.
    const builtinPlayable = storyTemplates
      .filter((t) => Array.isArray(t.settings?.milestones) && t.settings.milestones.length);
    const builtinById = new Map(builtinPlayable.map((t) => [t.id, t]));

    let premiumTemplates = [];
    if (opts['premium-dir']) {
      try {
        premiumTemplates = await loadPremiumTemplates(opts['premium-dir']);
      } catch (err) {
        console.error(redact(`Failed to load --premium-dir templates: ${err.message}`));
        process.exit(7);
      }
      console.log(`[premium-dir] loaded ${premiumTemplates.length} external template(s) from ${opts['premium-dir']}`);
    }
    const premiumById = new Map(premiumTemplates.map((t) => [t.id, t]));

    // resolver(id) -> { template, isPremium } | null (premium unresolvable without --premium-dir).
    const resolver = (id) => {
      if (builtinById.has(id)) return { template: builtinById.get(id), isPremium: false };
      if (premiumById.has(id)) return { template: premiumById.get(id), isPremium: true };
      return null;
    };

    // --sweep-all AUTO-RESUME: use the stable sweep name and, without the user having to
    // pass --resume, decide start-vs-resume-vs-complete from the state file. --fresh archives
    // an existing state (never silently deleted) and starts the named sweep over.
    if (opts.sweepAll) {
      const name = opts['sweep-name']; // 'all' by default
      const sPath = sweepStatePath(name);
      if (opts.fresh && fs.existsSync(sPath)) {
        const bak = sPath.replace(/\.json$/, `.archived-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
        try {
          fs.renameSync(sPath, bak);
          console.log(`[sweep-all] --fresh: archived existing sweep "${name}" state to ${bak}`);
        } catch (err) {
          console.error(redact(`[sweep-all] --fresh: could not archive existing state: ${err.message}`));
          process.exit(11);
        }
      }
      if (!opts.fresh && fs.existsSync(sPath)) {
        let existing = null;
        try { existing = loadSweepState(sPath); } catch { existing = null; }
        if (existing) {
          const pending = existing.campaigns.filter((c) => c.status === 'pending').length;
          if (pending === 0) {
            console.log(`sweep ${name} already complete (use --fresh to restart)`);
            return;
          }
          console.log(`[sweep-all] RESUMING sweep "${name}" — ${pending} campaign(s) pending.`);
          opts.resume = true;
          opts.resumeName = name;
        }
      }
      if (!opts.resume) console.log(`[sweep-all] STARTING new sweep "${name}".`);
    }

    let state, statePath;

    if (opts.resume) {
      // ---- RESUME an existing sweep ----
      if (opts.resumeName) {
        statePath = sweepStatePath(opts.resumeName);
        if (!fs.existsSync(statePath)) {
          console.error(`No sweep state found for "${opts.resumeName}" (expected ${statePath}).`);
          process.exit(8);
        }
        try { state = loadSweepState(statePath); } catch (err) {
          console.error(`Could not read sweep state ${statePath}: ${err.message}`); process.exit(8);
        }
      } else {
        const recent = findMostRecentSweepState();
        if (!recent) {
          console.error(`No sweep state files found under ${TRANSCRIPT_DIR} to resume. Start one with --playthrough --all --sweep-name <name>.`);
          process.exit(8);
        }
        state = recent.state;
        statePath = recent.path;
        console.log(`[resume] most recent sweep: ${state.sweepName} (${statePath})`);
      }

      // Premium reconciliation: if any PENDING campaign is premium, --premium-dir must be
      // supplied and must actually provide that template.
      const pendingPremium = state.campaigns.filter((c) => c.status === 'pending' && c.kind === 'premium');
      if (pendingPremium.length > 0) {
        if (!opts['premium-dir']) {
          console.error(`Sweep "${state.sweepName}" has ${pendingPremium.length} pending premium campaign(s); re-supply --premium-dir to resume them.`);
          console.error(`  pending premium: ${pendingPremium.map((c) => c.id).join(', ')}`);
          process.exit(9);
        }
        const missing = pendingPremium.filter((c) => !premiumById.has(c.id)).map((c) => c.id);
        if (missing.length > 0) {
          console.error(`--premium-dir "${opts['premium-dir']}" does not provide pending premium campaign(s): ${missing.join(', ')}`);
          process.exit(9);
        }
      }
    } else {
      // ---- START a new sweep ----
      const builtinEntries = builtinPlayable.map((t) => ({ template: t, isPremium: false }));
      const premiumEntries = premiumTemplates.map((t) => ({ template: t, isPremium: true }));
      const entries = [...builtinEntries, ...premiumEntries];
      if (entries.length === 0) {
        console.error('No playable campaigns found to sweep (none have settings.milestones).');
        process.exit(6);
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const name = opts['sweep-name'] || `sweep-${stamp}`;
      statePath = sweepStatePath(name);
      // Refuse to clobber an existing, unfinished named sweep — point at --resume instead.
      if (fs.existsSync(statePath)) {
        let existing = null;
        try { existing = loadSweepState(statePath); } catch { /* corrupt — allow overwrite below */ }
        const pending = existing ? existing.campaigns.filter((c) => c.status === 'pending').length : 0;
        if (existing && pending > 0) {
          console.error(`A sweep named "${name}" already exists (${statePath}) with ${pending} campaign(s) pending.`);
          console.error(`Resume it with:  node scripts/quest-harness.mjs --playthrough --resume ${name}   (or choose a different --sweep-name).`);
          process.exit(10);
        }
      }
      state = buildFreshSweepState(name, entries, opts, isLive);
      saveSweepState(statePath, state);
      console.log(`[sweep] started "${name}" — ${entries.length} campaign(s), state at ${statePath}`);
    }

    await runPlaythroughSweep(opts, state, statePath, resolver, DM_PROTOCOL, { isLive, key, redact }, appExports);
    return;
  }

  const template = storyTemplates.find((t) => t.id === opts.campaign);
  if (!template) {
    console.error(`Campaign "${opts.campaign}" not found. Available ids:`);
    for (const t of storyTemplates) console.error(`  - ${t.id}`);
    process.exit(6);
  }

  // Recorded playthrough extends AI mode: same guards + key path, transcript output.
  if (opts.playthrough) {
    await runPlaythrough(opts, template, DM_PROTOCOL, { isLive, key, redact }, appExports);
    return;
  }

  const requests = composeRequests(template, DM_PROTOCOL, opts.steps);

  // ---- Preflight summary ----
  console.log('');
  console.log('============================================================');
  console.log(`quest-harness — ${isLive ? 'LIVE' : 'DRY-RUN (no network requests)'}`);
  console.log('============================================================');
  console.log(`Campaign:        ${template.id}  (${template.name || 'unnamed'})`);
  console.log(`Model:           ${opts.model}`);
  console.log(`Composed turns:  ${requests.length} request(s) [steps=${opts.steps}]`);
  console.log(`Key source:      ${isLive ? (process.env.OPENROUTER_API_KEY ? 'env OPENROUTER_API_KEY (redacted)' : '--key-file (redacted)') : 'n/a (dry-run)'}`);
  console.log('Guards (enforced before each request):');
  console.log(`  per-request : max-tokens=${opts['max-tokens']} (ceiling ${HARD_MAX_TOKENS_CEILING}), max-prompt-tokens=${opts['max-prompt-tokens']}`);
  console.log(`  rate (60s)  : tpm=${opts.tpm}, rpm=${opts.rpm}, on-limit=${opts['on-limit']}`);
  console.log(`  per-run     : max-requests=${opts['max-requests']}, max-total-tokens=${opts['max-total-tokens']}, max-usd=$${opts['max-usd']}`);
  console.log(`  pricing     : $${opts['price-in']}/1M in, $${opts['price-out']}/1M out (Haiku 4.5 defaults — VERIFY)`);
  console.log('============================================================');
  console.log('');

  const guard = new GuardState(opts);
  let stoppedBy = null;

  for (let i = 0; i < requests.length; i++) {
    const req = requests[i];
    const estPrompt = estimateTokens(req.prompt);
    // Worst-case completion for accounting = the output cap.
    const estCompletion = opts['max-tokens'];

    console.log(`----- Request ${i + 1}/${requests.length}: ${req.label} -----`);
    console.log(`  est. prompt tokens: ~${estPrompt}   (est. completion cap: ${estCompletion})`);
    console.log(`  prompt (truncated): ${redact(truncate(req.prompt))}`);

    // Guard 1: per-request input cap.
    const inputReason = guard.checkInputCap(estPrompt);
    if (inputReason) {
      console.log(`  [GUARD] refusing this request: ${inputReason}`);
      stoppedBy = `input cap (${inputReason})`;
      break;
    }

    // Guard 2: per-run budget.
    const budgetReason = guard.checkRunBudget(estPrompt, estCompletion);
    if (budgetReason) {
      console.log(`  [GUARD] hard-abort run: ${budgetReason}`);
      stoppedBy = `run budget (${budgetReason})`;
      break;
    }

    // Guard 3: sliding-window rate limit.
    const now = Date.now();
    const rate = guard.checkRate(estPrompt + estCompletion, now);
    if (!rate.ok) {
      if (opts['on-limit'] === 'wait') {
        console.log(`  [GUARD] rate window: ${rate.reason}; waiting ~${Math.ceil(rate.waitMs / 1000)}s ...`);
        if (isLive && rate.waitMs > 0) await sleep(rate.waitMs);
        // In dry-run we do not actually sleep on the wall clock beyond noting it.
      } else {
        console.log(`  [GUARD] rate window: ${rate.reason}; aborting (--on-limit abort)`);
        stoppedBy = `rate limit (${rate.reason})`;
        break;
      }
    }

    // Passed all guards.
    if (!isLive) {
      // DRY-RUN: account with estimates, do NOT fetch.
      guard.record(estPrompt, estCompletion);
      console.log(`  [dry-run] would send. running tallies: requests=${guard.requestsMade}, tokens≈${guard.promptTokensTotal + guard.completionTokensTotal}, cost≈$${guard.costUsd().toFixed(4)}`);
      console.log('');
      continue;
    }

    // LIVE: send and record actual usage.
    try {
      const { text, usage } = await callOpenRouter(
        key, opts.model, req.prompt, opts['max-tokens'], opts.temperature, redact
      );
      const promptTokens = Number.isFinite(usage.prompt_tokens) ? usage.prompt_tokens : estPrompt;
      const completionTokens = Number.isFinite(usage.completion_tokens) ? usage.completion_tokens : estimateTokens(text);
      guard.record(promptTokens, completionTokens);
      console.log(`  [${req.label}] response:`);
      console.log(`    ${redact(truncate(text, 1200))}`);
      console.log(`  usage: prompt=${promptTokens}, completion=${completionTokens}. running: requests=${guard.requestsMade}, tokens=${guard.promptTokensTotal + guard.completionTokensTotal}, cost≈$${guard.costUsd().toFixed(4)}`);
      console.log('');
    } catch (err) {
      console.error(`  [error] ${redact(err.message)}`);
      stoppedBy = `request error (${redact(err.message)})`;
      break;
    }
  }

  // ---- Final summary ----
  console.log('============================================================');
  console.log('SUMMARY');
  console.log(`  mode:            ${isLive ? 'LIVE' : 'DRY-RUN'}`);
  console.log(`  requests ${isLive ? 'made' : 'simulated'}: ${guard.requestsMade} / ${requests.length} composed`);
  console.log(`  tokens (in/out): ${guard.promptTokensTotal} / ${guard.completionTokensTotal}`);
  console.log(`  est. cost:       $${guard.costUsd().toFixed(4)}`);
  console.log(`  stopped by:      ${stoppedBy || 'nothing (completed all composed turns)'}`);
  if (!isLive) console.log('  (no network request was made — dry-run)');
  console.log('============================================================');
  console.log('');
}

main().catch((err) => {
  // Last-resort: never let an unredacted key escape. We do not have the redactor
  // in scope here, but the key never reaches this path with content.
  console.error(`Fatal: ${err && err.message ? err.message : err}`);
  process.exit(1);
});
