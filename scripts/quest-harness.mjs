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
  'key-file': null
};

function parseArgs(argv) {
  const opts = { ...FLAG_DEFAULTS, live: false, yes: false, help: false };
  const numeric = new Set([
    'steps', 'max-tokens', 'max-prompt-tokens', 'tpm', 'rpm',
    'max-requests', 'max-total-tokens', 'max-usd', 'price-in', 'price-out', 'temperature'
  ]);
  const stringFlags = new Set(['campaign', 'model', 'on-limit', 'key-file']);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { opts.help = true; continue; }
    if (arg === '--live') { opts.live = true; continue; }
    if (arg === '--yes') { opts.yes = true; continue; }
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const name = arg.slice(2);
    if (!(name in FLAG_DEFAULTS)) throw new Error(`Unknown flag: ${arg} (try --help)`);
    const value = argv[++i];
    if (value === undefined) throw new Error(`Flag ${arg} expects a value`);
    if (numeric.has(name)) {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new Error(`Flag ${arg} expects a number, got "${value}"`);
      opts[name] = n;
    } else if (stringFlags.has(name)) {
      opts[name] = value;
    }
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
quest-harness.mjs — headless quest-prompt tester (DRY-RUN by default)

USAGE
  node scripts/quest-harness.mjs [flags]

SAFETY
  DRY-RUN unless you pass BOTH --live AND --yes. In dry-run it builds and prints
  every prompt, estimates tokens, and shows the guard preflight — but makes NO
  network request. A live spend therefore always needs two explicit flags.
  The OpenRouter key is read only from OPENROUTER_API_KEY or --key-file, and is
  never printed or written anywhere.

FLAGS
  --campaign <id>          Story template id                 (default: ${d.campaign})
  --steps <N>              Turns to compose: 1 = opening only (default: ${d.steps})
                           Each extra step adds one follow-up turn.
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
  --live                   Enable real OpenRouter calls (requires --yes too)
  --yes                    Confirm a live run (guard against an accidental --live)
  --help                   This message

EXAMPLES
  node scripts/quest-harness.mjs --campaign heroic-fantasy-t1      # dry-run
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
      contents: `export { storyTemplates } from './storyTemplates.js';\nexport { DM_PROTOCOL } from './prompts.js';\n`,
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

// Replica of generateResponse's DM_PROTOCOL + style-directive wrap.
function wrapWithProtocol(DM_PROTOCOL, prompt, settings) {
  const style = VERBOSITY_DIRECTIVE[settings?.responseVerbosity] || VERBOSITY_DIRECTIVE.Moderate;
  return `${DM_PROTOCOL}${prompt}\n\nStyle directive (shapes how you write; do not repeat it): ${style}`;
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

  const isLive = opts.live;

  // --live requires --yes: a live spend is never a single accidental flag.
  if (isLive && !opts.yes) {
    console.error('Refusing to run live: --live requires an explicit --yes as well.');
    console.error('Re-run with:  --live --yes   (this will spend real OpenRouter credit).');
    process.exit(3);
  }

  // Resolve the key ONLY for live runs. Never print it.
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

  // Load app data + compose the prompts.
  let storyTemplates, DM_PROTOCOL;
  try {
    ({ storyTemplates, DM_PROTOCOL } = await loadAppData());
  } catch (err) {
    console.error(redact(`Failed to load app data (storyTemplates / DM_PROTOCOL): ${err.message}`));
    process.exit(5);
  }

  const template = storyTemplates.find((t) => t.id === opts.campaign);
  if (!template) {
    console.error(`Campaign "${opts.campaign}" not found. Available ids:`);
    for (const t of storyTemplates) console.error(`  - ${t.id}`);
    process.exit(6);
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
