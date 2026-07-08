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
// playing turn by turn. Each milestone turn REPLICATES the in-game turn the app
// sends in useGameInteraction.handleSubmit: the `[CONTEXT] … [SUMMARY] … [PLAYER
// ACTION] … [NARRATE]` body (gameContext = Setting/Mood/Goal + formatMilestonePromptText
// grounding + location context + party), wrapped by generateResponse's
// DM_PROTOCOL + style directive. Because this is a COPY of the hook's composition,
// it CAN DRIFT from the app (a future refactor should extract one shared builder the
// hook and this harness both call). It obeys every guard exactly like AI mode and is
// DRY-RUN unless BOTH --live AND --yes are passed. Every prompt + response is written
// to a timestamped Markdown transcript under harness-transcripts/ (gitignored).
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
  'premium-dir': null
};

function parseArgs(argv) {
  const opts = {
    ...FLAG_DEFAULTS, live: false, yes: false, help: false,
    all: false, simulate: false, playthrough: false, _modeExplicit: false
  };
  const numeric = new Set([
    'steps', 'max-tokens', 'max-prompt-tokens', 'tpm', 'rpm',
    'max-requests', 'max-total-tokens', 'max-usd', 'price-in', 'price-out', 'temperature'
  ]);
  const stringFlags = new Set(['campaign', 'mode', 'model', 'on-limit', 'key-file', 'premium-dir']);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { opts.help = true; continue; }
    if (arg === '--live') { opts.live = true; continue; }
    if (arg === '--yes') { opts.yes = true; continue; }
    if (arg === '--all') { opts.all = true; continue; }
    if (arg === '--simulate') { opts.simulate = true; continue; }
    if (arg === '--playthrough') { opts.playthrough = true; continue; }
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
      if (name === 'mode') opts._modeExplicit = true;
    }
  }

  // --simulate is an alias for the deterministic guest-vs-member comparison, unless
  // an explicit --mode was also given.
  if (opts.simulate && !opts._modeExplicit) opts.mode = 'both';
  // --campaign all (or --all) implies the deterministic sim; the AI path is single-campaign.
  if ((opts.all || opts.campaign === 'all') && !opts._modeExplicit && opts.mode === 'ai') {
    opts.mode = 'both';
  }
  if (opts.all) opts.campaign = 'all';

  const VALID_MODES = new Set(['ai', 'guest', 'member', 'both']);
  if (!VALID_MODES.has(opts.mode)) {
    throw new Error(`--mode must be one of ai|guest|member|both, got "${opts.mode}"`);
  }
  if (opts.mode === 'ai' && opts.campaign === 'all') {
    throw new Error('--campaign all / --all is only supported for the deterministic sim (--mode guest|member|both).');
  }
  if (opts.playthrough) {
    if (opts._modeExplicit && opts.mode !== 'ai') {
      throw new Error('--playthrough extends AI mode; it is not compatible with --mode guest|member|both.');
    }
    opts.mode = 'ai';
    if (opts.campaign === 'all') {
      throw new Error('--playthrough runs a single campaign; --campaign all / --all is not supported.');
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
quest-harness.mjs - headless quest tester (DRY-RUN / deterministic by default)

USAGE
  node scripts/quest-harness.mjs [flags]

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
  --all                    Run the sim across ALL playable campaigns (= --campaign all)
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
                           ALSO simulate in guest/member/both mode. Each file is an
                           ESM module exporting a template object (the first export
                           with an id + settings.milestones is used); files without
                           milestones (teaser stubs) are skipped like built-in stubs.
                           Deterministic: NO network, NO key (same as the guest sim).
                           Omit the flag and behaviour is unchanged (built-ins only).
                           Typical value: the private premium-content repo's
                           campaigns/ dir, e.g.
                           /home/edward/Projects/dungeongpt-premium-content/campaigns
  --live                   Enable real OpenRouter calls (requires --yes too)
  --yes                    Confirm a live run (guard against an accidental --live)
  --help                   This message

EXAMPLES
  node scripts/quest-harness.mjs --campaign heroic-fantasy-t1      # ai dry-run
  node scripts/quest-harness.mjs --playthrough --campaign heroic-fantasy-t1  # recorded dry-run
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
        `export { composeIntro } from '../game/introComposer.js';\n` +
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
function composePlaythroughRequests(template, DM_PROTOCOL) {
  const settings = template.settings || {};
  const requests = [];

  // Opening: exactly the SCENE + OBJECTIVE the existing AI mode composes (steps=1).
  for (const r of composeRequests(template, DM_PROTOCOL, 1)) {
    requests.push({ label: r.label, prompt: r.prompt });
  }

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
    const playerInput = buildScriptedPlayerTurn(m);
    const locationInfo = buildMinimalLocationContext(m);
    const gameContext = `Setting: ${settings.shortDescription || 'Fantasy Realm'}. Mood: ${settings.grimnessLevel || 'Normal'}.${goalInfo}${milestonesInfo}\n${locationInfo}. Party: ${partyInfo}.`;
    // Mirror handleSubmit's body. No RAG/summary in a headless harness: the summary
    // is the app's default seed and ragContext is empty (documented approximation).
    const body = `[CONTEXT]\n${gameContext}\n\n[SUMMARY]\nThe tale unfolds.\n\n[PLAYER ACTION]\n${playerInput}\n\n[NARRATE]`;
    requests.push({
      label: `Milestone #${m.id} [${m.type || 'untyped'}]`,
      prompt: wrapWithProtocol(DM_PROTOCOL, body, settings),
      playerInput,
      milestone: m
    });
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

async function runPlaythrough(opts, template, DM_PROTOCOL, { isLive, key, redact }) {
  const requests = composePlaythroughRequests(template, DM_PROTOCOL);
  const startedAt = new Date();
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-');

  // ---- Preflight (console) ----
  console.log('');
  console.log('============================================================');
  console.log(`quest-harness — RECORDED PLAYTHROUGH — ${isLive ? 'LIVE' : 'DRY-RUN (no network requests)'}`);
  console.log('============================================================');
  console.log(`Campaign:        ${template.id}  (${template.name || 'unnamed'})`);
  console.log(`Model:           ${opts.model}`);
  console.log(`Composed turns:  ${requests.length} request(s) (opening + ${requests.length - 2} milestone turn(s))`);
  console.log(`Key source:      ${isLive ? (process.env.OPENROUTER_API_KEY ? 'env OPENROUTER_API_KEY (redacted)' : '--key-file (redacted)') : 'n/a (dry-run)'}`);
  console.log('Guards (enforced before each request):');
  for (const g of fmtGuards(opts)) console.log(`  ${g}`);
  console.log('============================================================');
  console.log('');

  const guard = new GuardState(opts);
  let stoppedBy = null;
  const turns = []; // { label, playerInput, prompt, estPrompt, sent, response, promptTokens, completionTokens, flags }

  for (let i = 0; i < requests.length; i++) {
    const req = requests[i];
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

  // ---- Write the transcript ----
  const transcriptPath = path.join(TRANSCRIPT_DIR, `playthrough-${template.id}-${stamp}.md`);
  let out;
  try {
    fs.mkdirSync(TRANSCRIPT_DIR, { recursive: true });
    out = buildTranscriptMarkdown({ opts, template, isLive, startedAt, requests, turns, guard, stoppedBy, redact });
    fs.writeFileSync(transcriptPath, out, 'utf8');
  } catch (err) {
    console.error(redact(`Failed to write transcript: ${err.message}`));
  }

  // ---- Console summary ----
  console.log('============================================================');
  console.log('PLAYTHROUGH SUMMARY');
  console.log(`  mode:            ${isLive ? 'LIVE' : 'DRY-RUN'}`);
  console.log(`  requests ${isLive ? 'made' : 'simulated'}: ${guard.requestsMade} / ${requests.length} composed`);
  console.log(`  tokens (in/out): ${guard.promptTokensTotal} / ${guard.completionTokensTotal}`);
  console.log(`  est. cost:       $${guard.costUsd().toFixed(4)}`);
  console.log(`  stopped by:      ${stoppedBy || 'nothing (composed all turns)'}`);
  console.log(`  transcript:      ${transcriptPath}`);
  if (!isLive) console.log('  (no network request was made — dry-run; responses are "[dry-run] not sent")');
  console.log('============================================================');
  console.log('');
}

// Build the Markdown transcript string. The prompt/response are recorded IN FULL
// (redacted); only the console output truncates.
function buildTranscriptMarkdown({ opts, template, isLive, startedAt, requests, turns, guard, stoppedBy, redact }) {
  const L = [];
  L.push(`# Quest-harness playthrough transcript`);
  L.push('');
  L.push(`- **Campaign:** ${template.id} (${template.name || 'unnamed'}${template.subtitle ? ` — ${template.subtitle}` : ''})`);
  L.push(`- **Model:** ${opts.model}`);
  L.push(`- **Mode:** ${isLive ? 'LIVE (sent to OpenRouter)' : 'DRY-RUN (no network call; responses not sent)'}`);
  L.push(`- **Timestamp:** ${startedAt.toISOString()}`);
  L.push(`- **Composed turns:** ${requests.length} (opening + ${Math.max(0, requests.length - 2)} milestone turn(s))`);
  L.push('');
  L.push('### Guard settings');
  for (const g of fmtGuards(opts)) L.push(`- ${g}`);
  L.push('');
  L.push('> Prompt composition is REPLICATED from src/hooks/useGameInteraction.js');
  L.push('> (opening = handleStartAdventure SCENE+OBJECTIVE; each milestone turn = handleSubmit');
  L.push('> gameContext + [CONTEXT]/[SUMMARY]/[PLAYER ACTION]/[NARRATE] wrapped by DM_PROTOCOL +');
  L.push('> style directive). It is a copy and CAN DRIFT from the app. Location context is a');
  L.push('> minimal stand-in (the harness generates no town maps); summary/RAG are omitted.');
  L.push('');
  L.push('---');
  L.push('');

  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    L.push(`## Turn ${i + 1}: ${t.label}`);
    L.push('');
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
    L.push(`**Automated checks:** ${t.flags.length ? t.flags.join(', ') : '(none)'}`);
    L.push('');
    L.push('---');
    L.push('');
  }

  L.push('## Summary');
  L.push('');
  L.push(`- **Requests ${isLive ? 'made' : 'simulated'}:** ${guard.requestsMade} / ${requests.length} composed`);
  L.push(`- **Tokens (in/out):** ${guard.promptTokensTotal} / ${guard.completionTokensTotal}`);
  L.push(`- **Estimated cost:** $${guard.costUsd().toFixed(4)}`);
  L.push(`- **Stopped by:** ${stoppedBy || 'nothing (composed all turns)'}`);
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

  if (opts['premium-dir']) {
    console.warn('[premium-dir] ignored in --mode ai (it only affects the guest/member/both sim).');
  }

  // Enforce --live/--yes and resolve the key (never printed). Shared with playthrough.
  const { isLive, key, redact } = resolveLiveKey(opts);

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

  // Recorded playthrough extends AI mode: same guards + key path, transcript output.
  if (opts.playthrough) {
    await runPlaythrough(opts, template, DM_PROTOCOL, { isLive, key, redact });
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
