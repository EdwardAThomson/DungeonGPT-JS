#!/usr/bin/env node

/**
 * Cloudflare Workers AI Model Comparison Test Harness
 *
 * Uses your EXISTING CF Worker endpoint - no credentials needed!
 *
 * Usage:
 *   1. Start your CF Worker: cd cf-worker && npm run dev
 *   2. Run tests: node scripts/test-cf-models-simple.mjs
 *
 * Flags:
 *   --worker-url=http://localhost:8787    (default from .env.local)
 *   --models=llama-3.1-8b,gemma-3-12b     (filter models by name/id substring)
 *   --scenarios=opening,interaction         (filter scenarios)
 *   --resume=tests-ai/run-2026-03-01-...   (resume a previous run, skip completed)
 *   --no-halt                               (don't stop on model failure)
 *   --timeout=60                             (seconds per request, default 60)
 *
 * Auth (required when worker has SUPABASE_JWT_SECRET configured):
 *   SUPABASE_ACCESS_TOKEN=<token> node scripts/test-cf-models-simple.mjs
 *   Get a token from your browser's dev tools (Application > Local Storage > supabase access_token)
 *   or via: curl -X POST https://<project>.supabase.co/auth/v1/token?grant_type=password \
 *     -d '{"email":"...","password":"..."}' | jq .access_token
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { dirname, resolve, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read CF Worker URL from .env.local
function getCfWorkerUrl() {
  try {
    const envPath = resolve(__dirname, '../.env.local');
    const envContent = readFileSync(envPath, 'utf-8');
    const match = envContent.match(/REACT_APP_CF_WORKER_URL=(.+)/);
    if (match) {
      return match[1].trim().replace('https://localhost', 'http://localhost');
    }
  } catch (e) {
    // Fall through to default
  }
  return 'http://localhost:8787';
}

// ─── Configuration ───────────────────────────────────────────────────────────

const DEFAULT_WORKER_URL = getCfWorkerUrl();

// ─── Models to Test ──────────────────────────────────────────────────────────
// NOTE: These must exist in cf-worker/src/services/models.ts MODEL_REGISTRY
// or be added manually for testing

const TEST_MODELS = [
  // Ultra Tier
  { id: '@cf/openai/gpt-oss-120b', name: 'GPT-OSS 120B', tier: 'ultra' },
  { id: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', name: 'DeepSeek R1 32B', tier: 'ultra' },
  { id: '@cf/qwen/qwq-32b', name: 'QwQ 32B Reasoning', tier: 'ultra' },
  // Premium Tier
  { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', name: 'Llama 3.3 70B', tier: 'premium' },
  { id: '@cf/qwen/qwen3-30b-a3b-fp8', name: 'Qwen3 30B MoE', tier: 'premium' },
  // Quality Tier
  { id: '@cf/openai/gpt-oss-20b', name: 'GPT-OSS 20B', tier: 'quality' },
  { id: '@cf/mistralai/mistral-small-3.1-24b-instruct', name: 'Mistral Small 3.1 24B', tier: 'quality' },
  { id: '@cf/meta/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B', tier: 'quality' },
  { id: '@cf/google/gemma-3-12b-it', name: 'Gemma 3 12B', tier: 'quality' },
  // Balanced Tier
  { id: '@cf/meta/llama-3.1-8b-instruct-fast', name: 'Llama 3.1 8B Fast', tier: 'balanced' },
  { id: '@cf/ibm-granite/granite-4.0-h-micro', name: 'Granite 4.0 Micro', tier: 'balanced' },
  { id: '@cf/zai-org/glm-4.7-flash', name: 'GLM 4.7 Flash', tier: 'balanced' },
  // Fast / Budget Tier
  { id: '@cf/meta/llama-3.2-3b-instruct', name: 'Llama 3.2 3B', tier: 'fast' },
  { id: '@cf/meta/llama-3.2-1b-instruct', name: 'Llama 3.2 1B', tier: 'budget' },
];

// ─── DM Protocol (same as src/data/prompts.js) ──────────────────────────────

const DM_PROTOCOL = `[STRICT DUNGEON MASTER PROTOCOL]
You are a Dungeon Master for a tabletop RPG. You must ALWAYS stay in character.
1. NEVER output internal reasoning, plans, or "agentic" thoughts (e.g., "I will examine...", "I plan to...").
2. NEVER mention technical details, project structure, or code files.
3. NEVER provide meta-commentary about your own generation process.
4. NEVER echo or repeat the [CONTEXT], [TASK], or any game setup information in your response.
5. YOUR RESPONSE MUST BE PURELY NARRATIVE OR SYSTEM INFORMATION (e.g. rolls).
6. DO NOT REPEAT ANY PART OF THIS PROMPT OR THE PROTOCOL IN YOUR RESPONSE.
7. START YOUR RESPONSE DIRECTLY WITH THE STORY NARRATION.
8. ALWAYS conclude by asking the player "What do you do?" or presenting options.
9. IMPORTANT: YOUR RESPONSE MUST BEGIN WITH THE NARRATION. DO NOT ECHO THE TASK, CONTEXT, OR GAME INFORMATION.

MILESTONE TRACKING:
When the party achieves a milestone, you may mark it complete using:
[COMPLETE_MILESTONE: exact milestone text]
This will trigger a celebration and mark the milestone as achieved. Only use this when the milestone is truly accomplished.

CAMPAIGN COMPLETION:
When the party achieves the main campaign goal (the primary objective of the entire adventure), mark it complete using:
[COMPLETE_CAMPAIGN]
This should ONLY be used when the overarching campaign objective is fully accomplished, not for individual milestones.
Use this sparingly - it marks the end of the main story arc.

Failure to follow this protocol breaks player immersion. Output only the game's story and dialogue.
[/STRICT DUNGEON MASTER PROTOCOL]

`;

// ─── Test Scenarios ──────────────────────────────────────────────────────────

const SCENARIOS = {
  opening: {
    name: 'Opening Prompt (Adventure Start)',
    description: 'First message when a new game begins. Tests scene-setting, atmosphere, and ending with player options.',
    prompt: DM_PROTOCOL + `[ADVENTURE START]

[CONTEXT]
Setting: A war-torn kingdom where undead armies march from the fallen capital. Mood: Grim Intensity. Magic: High Magic. Tech: Medieval.
Goal of the Campaign: Destroy the Lich King's phylactery hidden in the Obsidian Citadel
Current Milestone: Seek the Oracle in the Frostpeak Mountains

Player starts at coordinates (7, 4) in a plains biome. The party is standing at the edge of Millhaven, a village.
Party: Kael (Fighter), Lyra (Wizard), Bram (Cleric).

Current Summary: They stand ready at the journey's beginning.

[TASK]
Describe the arrival of the party and the immediate atmosphere of the scene. Present the initial situation to the players. Use the context provided to set the stage. Begin your response directly with the narrative description.`,
  },

  interaction: {
    name: 'Player Interaction (Chat Response)',
    description: 'Player asks a question / takes action mid-game. Tests staying in character and responding to player intent.',
    prompt: DM_PROTOCOL + `[CONTEXT]
Setting: A war-torn kingdom where undead armies march from the fallen capital. Mood: Grim.
Goal: Destroy the Lich King's phylactery
Current Milestone: Seek the Oracle in the Frostpeak Mountains
Player is at coordinates (7, 4) in a plains biome. Point Of Interest: town.
Party: Kael (Fighter), Lyra (Wizard), Bram (Cleric).

[SUMMARY]
The party arrived in Millhaven, a small village on the edge of the war-torn plains. The townsfolk are wary but welcoming. They learned that undead patrols have been spotted to the north. The village elder mentioned an old hermit who may know the mountain paths.

[PLAYER ACTION]
We ask the village elder about the hermit and the safest route to the Frostpeak Mountains.

[NARRATE]`,
  },

  movement: {
    name: 'Movement Narration (Map Transition)',
    description: 'Party moves to a new tile on the world map. Tests brief atmospheric description.',
    prompt: DM_PROTOCOL + `Game Context: Setting: A war-torn kingdom where undead armies march from the fallen capital. Mood: Grim.
Goal: Destroy the Lich King's phylactery
Current Milestone: Seek the Oracle in the Frostpeak Mountains
Player has moved to coordinates (8, 3) in a forest biome. Party: Kael (Fighter), Lyra (Wizard), Bram (Cleric).

Story summary so far: The party left Millhaven heading north. The village elder warned them about undead patrols.

The party moves to a new location: dense woodland with towering trees.

Coordinates: (8, 3)
Biome: forest

Describe what the party sees and experiences as they arrive. Keep it brief (2-3 sentences) and atmospheric.`,
  },
};

// ─── Advanced Test Scenarios (Protocol Compliance) ──────────────────────────
// Run with --advanced flag to test protocol features like milestones, combat, etc.

const ADVANCED_SCENARIOS = {
  milestone_completion: {
    name: 'Milestone Completion (Protocol Tag)',
    description: 'Tests if model correctly uses [COMPLETE_MILESTONE: text] tag when milestone is achieved.',
    prompt: DM_PROTOCOL + `[CONTEXT]
Setting: A war-torn kingdom where undead armies march from the fallen capital. Mood: Grim Intensity. Magic: High Magic. Tech: Medieval.
Goal of the Campaign: Destroy the Lich King's phylactery hidden in the Obsidian Citadel
Current Milestone: Slay the Dragon of Frostpeak Mountains
Remaining Milestones: Retrieve the Oracle's prophecy, Infiltrate the Obsidian Citadel

Player is at coordinates (12, 2) in a mountain biome. Point Of Interest: Dragon's Lair.
Party: Kael (Fighter, HP: 45/60), Lyra (Wizard, HP: 28/35), Bram (Cleric, HP: 50/50).

[SUMMARY]
The party climbed the treacherous Frostpeak Mountains and found the ancient dragon Frostclaw guarding the path to the Oracle. After a fierce battle, Kael delivered the final blow with his enchanted sword, and the dragon fell. The party stands victorious but wounded.

[PLAYER ACTION]
We search the dragon's hoard and prepare to continue to the Oracle's sanctuary.

[NARRATE]
Remember: When a milestone is achieved, mark it complete using [COMPLETE_MILESTONE: exact milestone text]`,
  },

  combat_narration: {
    name: 'Combat Narration (Dice Rolls)',
    description: 'Tests combat description with dice roll results. Should describe hit/miss, damage, and enemy status.',
    prompt: DM_PROTOCOL + `[CONTEXT]
Setting: A war-torn kingdom where undead armies march from the fallen capital. Mood: Grim.
Goal: Destroy the Lich King's phylactery
Current Milestone: Seek the Oracle in the Frostpeak Mountains
Player is at coordinates (9, 5) in a plains biome. Party: Kael (Fighter, HP: 60/60), Lyra (Wizard, HP: 35/35), Bram (Cleric, HP: 50/50).

[SUMMARY]
The party encountered a patrol of 3 undead soldiers on the road. Combat has begun. The undead are slow but relentless.

[COMBAT ROUND]
Kael attacks Undead Soldier #1 with longsword:
- Attack roll: 18 (HIT)
- Damage: 9 slashing damage

Lyra casts Magic Missile at Undead Soldier #2:
- Automatic hit
- Damage: 11 force damage

Bram casts Sacred Flame on Undead Soldier #1:
- Enemy DEX save: 8 (FAILED)
- Damage: 7 radiant damage

[NARRATE]
Describe the results of these attacks. What happens to the undead soldiers? What do the players see? End by asking what they do next.`,
  },

  town_entry: {
    name: 'Town Entry (World Building)',
    description: 'Tests entering a town. Should describe atmosphere, NPCs, buildings, and offer options.',
    prompt: DM_PROTOCOL + `[CONTEXT]
Setting: A war-torn kingdom where undead armies march from the fallen capital. Mood: Grim.
Goal: Destroy the Lich King's phylactery
Current Milestone: Seek the Oracle in the Frostpeak Mountains
Player is at coordinates (7, 4) in a plains biome. Point Of Interest: town (Millhaven, village).
Party: Kael (Fighter), Lyra (Wizard), Bram (Cleric).

[SUMMARY]
The party has been traveling for two days across war-torn plains. They are low on supplies and need information about the mountain paths. They can see the village of Millhaven ahead.

[PLAYER ACTION]
We enter the village of Millhaven.

[NARRATE]
Describe what the party sees as they enter the village. What is the atmosphere? Who do they see? What buildings or locations are notable? Present options for what they might do.`,
  },

  skill_check_request: {
    name: 'Skill Check Request (Dangerous Action)',
    description: 'Tests if model requests skill checks for risky actions. Should ask for appropriate skill check.',
    prompt: DM_PROTOCOL + `[CONTEXT]
Setting: A war-torn kingdom where undead armies march from the fallen capital. Mood: Grim.
Goal: Destroy the Lich King's phylactery
Current Milestone: Seek the Oracle in the Frostpeak Mountains
Player is at coordinates (11, 3) in a mountain biome. Party: Kael (Fighter), Lyra (Wizard), Bram (Cleric).

[SUMMARY]
The party is climbing the Frostpeak Mountains. They've reached a treacherous cliff face with a narrow ledge. The path ahead requires crossing a 20-foot gap over a deadly drop. There's a rope bridge, but it looks ancient and unstable.

[PLAYER ACTION]
Kael will carefully cross the rope bridge first to test if it's safe.

[NARRATE]
This is a dangerous action. You may request a skill check using the format: [CHECK: skill_name] or [CHECK_DC15: skill_name]. Describe the situation and request the appropriate check, or narrate the outcome if you determine no check is needed.`,
  },

  invalid_action: {
    name: 'Invalid Action Handling (Edge Case)',
    description: 'Tests how model handles impossible or nonsensical player actions. Should stay in character and redirect.',
    prompt: DM_PROTOCOL + `[CONTEXT]
Setting: A war-torn kingdom where undead armies march from the fallen capital. Mood: Grim.
Goal: Destroy the Lich King's phylactery
Current Milestone: Seek the Oracle in the Frostpeak Mountains
Player is at coordinates (7, 4) in a plains biome. Point Of Interest: town (Millhaven).
Party: Kael (Fighter), Lyra (Wizard), Bram (Cleric).

[SUMMARY]
The party is in Millhaven village, speaking with the village elder about the mountain paths.

[PLAYER ACTION]
I cast fireball at the moon and then teleport to the Lich King's castle.

[NARRATE]
Handle this invalid/impossible action gracefully. Stay in character as DM. Explain what's not possible and redirect the player to reasonable options.`,
  },
};

// ─── Quality Checks ──────────────────────────────────────────────────────────

function runQualityChecks(response, scenarioKey) {
  const checks = [];

  const badStarts = ['[CONTEXT]', '[TASK]', '[ADVENTURE', '[SUMMARY]', '[NARRATE]', '[STRICT',
    'Setting:', 'Game Context:', 'Current Summary:'];
  const startsClean = !badStarts.some(marker => response.trimStart().startsWith(marker));
  checks.push({ name: 'Starts with narration', pass: startsClean });

  const promptMarkers = /\[(CONTEXT|TASK|ADVENTURE START|SUMMARY|PLAYER ACTION|NARRATE|STRICT DUNGEON MASTER PROTOCOL)\]/i;
  const noMarkers = !promptMarkers.test(response);
  checks.push({ name: 'No prompt markers leaked', pass: noMarkers });

  const metaPhrases = /\b(I will|I plan to|as a language model|as an AI|I cannot|let me|I'll examine|I should)\b/i;
  const noMeta = !metaPhrases.test(response);
  checks.push({ name: 'No OOC/meta commentary', pass: noMeta });

  const endsWithQuestion = /(\?|what do you do|what will you|what would you|do you wish|how do you proceed|choose|options?:)/i;
  const hasPlayerPrompt = endsWithQuestion.test(response.slice(-300));
  checks.push({ name: 'Ends with player options/question', pass: hasPlayerPrompt });

  const wordCount = response.split(/\s+/).length;
  const goodLength = wordCount >= 30 && wordCount <= 600;
  checks.push({ name: `Good length (${wordCount} words)`, pass: goodLength });

  if (scenarioKey === 'movement') {
    const sentenceCount = response.split(/[.!?]+/).filter(s => s.trim().length > 10).length;
    const isBrief = sentenceCount <= 8;
    checks.push({ name: `Brief for movement (${sentenceCount} sentences)`, pass: isBrief });
  }

  // Advanced scenario-specific checks
  if (scenarioKey === 'milestone_completion') {
    const hasMilestoneTag = /\[COMPLETE_MILESTONE:\s*[^\]]+\]/i.test(response);
    checks.push({ name: 'Uses [COMPLETE_MILESTONE: text] tag', pass: hasMilestoneTag });
    if (hasMilestoneTag) {
      const correctMilestone = /\[COMPLETE_MILESTONE:\s*Slay the Dragon/i.test(response);
      checks.push({ name: 'Correct milestone text', pass: correctMilestone });
    }
  }

  if (scenarioKey === 'combat_narration') {
    const describesDamage = /\d+\s*(damage|hit points|hp)/i.test(response);
    checks.push({ name: 'Describes damage/hits', pass: describesDamage });
    const describesEnemies = /(undead|soldier)/i.test(response);
    checks.push({ name: 'Mentions enemies', pass: describesEnemies });
  }

  if (scenarioKey === 'town_entry') {
    const describesAtmosphere = response.length > 100;
    checks.push({ name: 'Describes town atmosphere', pass: describesAtmosphere });
    const mentionsNPCsOrBuildings = /(villager|people|inn|tavern|shop|building|house|elder|guard)/i.test(response);
    checks.push({ name: 'Mentions NPCs or buildings', pass: mentionsNPCsOrBuildings });
  }

  if (scenarioKey === 'skill_check_request') {
    const requestsCheck = /\[CHECK[_DC\d]*:\s*\w+\]/i.test(response);
    checks.push({ name: 'Requests skill check [CHECK: skill]', pass: requestsCheck });
    if (requestsCheck) {
      const appropriateSkill = /\[CHECK[_DC\d]*:\s*(athletics|acrobatics|dexterity|strength)\]/i.test(response);
      checks.push({ name: 'Appropriate skill (athletics/acrobatics)', pass: appropriateSkill });
    }
  }

  if (scenarioKey === 'invalid_action') {
    const staysInCharacter = !/(cannot|can't|unable|impossible|not possible)/i.test(response.slice(0, 100));
    const redirectsGracefully = /(instead|however|perhaps|you could|you might|available|possible)/i.test(response);
    checks.push({ name: 'Handles gracefully (no harsh rejection)', pass: redirectsGracefully });
  }

  const echoesProtocol = response.includes('STRICT DUNGEON MASTER PROTOCOL') ||
    response.includes('Failure to follow this protocol');
  checks.push({ name: 'Does not echo protocol', pass: !echoesProtocol });

  const passed = checks.filter(c => c.pass).length;
  const total = checks.length;
  const score = Math.round((passed / total) * 100);

  return { checks, passed, total, score };
}

// ─── Auth Token ───────────────────────────────────────────────────────────────

const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || null;

// ─── CF Worker API Caller ────────────────────────────────────────────────────

async function callWorker(workerUrl, modelId, prompt, maxTokens = 1600, temperature = 0.7, timeoutMs = 60000) {
  const url = `${workerUrl}/api/ai/generate`;
  const startTime = Date.now();

  const headers = { 'Content-Type': 'application/json' };
  if (SUPABASE_ACCESS_TOKEN) {
    headers['Authorization'] = `Bearer ${SUPABASE_ACCESS_TOKEN}`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        provider: 'cf-workers',
        model: modelId,
        prompt,
        maxTokens,
        temperature,
        systemPrompt: '', // Empty - DM_PROTOCOL is in the prompt itself
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errBody = await response.text();
      return {
        success: false,
        error: `HTTP ${response.status}: ${errBody.slice(0, 200)}`,
        latencyMs,
        text: null,
      };
    }

    const data = await response.json();

    if (data.error) {
      return {
        success: false,
        error: data.error,
        latencyMs,
        text: null,
      };
    }

    return { success: true, text: data.text || '', latencyMs, error: null };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      latencyMs: Date.now() - startTime,
      text: null,
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function modelSlug(model) {
  // "@cf/meta/llama-3.1-8b-instruct-fast" → "llama-3.1-8b-instruct-fast"
  return model.id.split('/').pop();
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function loadState(runDir) {
  const stateFile = join(runDir, 'state.json');
  if (existsSync(stateFile)) {
    return JSON.parse(readFileSync(stateFile, 'utf-8'));
  }
  return { completed: [], failed: [], skipped: [] };
}

function saveState(runDir, state) {
  writeFileSync(join(runDir, 'state.json'), JSON.stringify(state, null, 2), 'utf-8');
}

function writeModelReport(runDir, model, scenarioResults) {
  const slug = modelSlug(model);
  let md = `# Model Report: ${model.name}\n\n`;
  md += `- **Model ID:** \`${model.id}\`\n`;
  md += `- **Tier:** ${model.tier}\n`;
  md += `- **Generated:** ${new Date().toISOString()}\n\n`;

  const successes = scenarioResults.filter(r => r.success);
  const failures = scenarioResults.filter(r => !r.success);

  if (successes.length > 0) {
    const avgLatency = Math.round(successes.reduce((s, r) => s + r.latencyMs, 0) / successes.length);
    const avgQuality = Math.round(successes.reduce((s, r) => s + r.quality.score, 0) / successes.length);
    md += `## Summary\n\n`;
    md += `| Metric | Value |\n|--------|-------|\n`;
    md += `| Scenarios passed | ${successes.length}/${scenarioResults.length} |\n`;
    md += `| Avg latency | ${avgLatency}ms |\n`;
    md += `| Avg quality | ${avgQuality}% |\n\n`;
  } else {
    md += `## Summary\n\n**ALL SCENARIOS FAILED**\n\n`;
  }

  for (const result of scenarioResults) {
    md += `---\n\n## Scenario: ${result.scenarioName}\n\n`;

    if (!result.success) {
      md += `### ❌ FAILED\n\n`;
      md += `- **Error:** ${result.error}\n`;
      md += `- **Latency:** ${result.latencyMs}ms\n\n`;
      continue;
    }

    md += `### ✅ PASSED\n\n`;
    md += `- **Latency:** ${result.latencyMs}ms\n`;
    md += `- **Word count:** ${result.text.split(/\s+/).length}\n`;
    md += `- **Quality score:** ${result.quality.score}% (${result.quality.passed}/${result.quality.total})\n\n`;

    md += `#### Quality Checks\n\n`;
    for (const check of result.quality.checks) {
      md += `- ${check.pass ? '✅' : '❌'} ${check.name}\n`;
    }

    md += `\n#### Full Response\n\n`;
    md += `\`\`\`\n${result.text}\n\`\`\`\n\n`;
  }

  writeFileSync(join(runDir, `${slug}.md`), md, 'utf-8');
  writeFileSync(join(runDir, `${slug}.json`), JSON.stringify({
    model,
    results: scenarioResults,
    generated: new Date().toISOString(),
  }, null, 2), 'utf-8');
}

function writeSummary(runDir, allModels, allResults, state) {
  let md = `# CF Workers AI — Test Run Summary\n\n`;
  md += `- **Run directory:** \`${runDir}\`\n`;
  md += `- **Generated:** ${new Date().toISOString()}\n`;
  md += `- **Models tested:** ${allModels.length}\n`;
  md += `- **Completed:** ${state.completed.length}  |  **Failed:** ${state.failed.length}  |  **Skipped:** ${state.skipped.length}\n\n`;

  md += `## Results Table\n\n`;
  md += `| Model | Tier | Avg Latency | Avg Quality | Status |\n`;
  md += `|-------|------|-------------|-------------|--------|\n`;

  for (const model of allModels) {
    const modelResults = allResults.filter(r => r.modelId === model.id && r.success);
    const modelErrors = allResults.filter(r => r.modelId === model.id && !r.success);

    if (state.skipped.includes(model.id)) {
      md += `| ${model.name} | ${model.tier} | — | — | ⏭️ Skipped |\n`;
    } else if (modelResults.length === 0 && modelErrors.length > 0) {
      md += `| ${model.name} | ${model.tier} | — | — | ❌ Failed |\n`;
    } else if (modelResults.length > 0) {
      const avgLatency = Math.round(modelResults.reduce((s, r) => s + r.latencyMs, 0) / modelResults.length);
      const avgQuality = Math.round(modelResults.reduce((s, r) => s + r.quality.score, 0) / modelResults.length);
      md += `| ${model.name} | ${model.tier} | ${avgLatency}ms | ${avgQuality}% | ✅ OK |\n`;
    } else {
      md += `| ${model.name} | ${model.tier} | — | — | ⏳ Pending |\n`;
    }
  }

  md += `\n## Per-Model Reports\n\n`;
  for (const model of allModels) {
    const slug = modelSlug(model);
    if (existsSync(join(runDir, `${slug}.md`))) {
      md += `- [${model.name}](./${slug}.md)\n`;
    }
  }

  writeFileSync(join(runDir, 'summary.md'), md, 'utf-8');
  writeFileSync(join(runDir, 'summary.json'), JSON.stringify({
    state,
    models: allModels,
    results: allResults,
    generated: new Date().toISOString(),
  }, null, 2), 'utf-8');
}

// ─── CLI Argument Parsing ────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (const arg of args) {
    if (arg === '--no-halt') {
      opts['no-halt'] = true;
      continue;
    }
    const eqIdx = arg.indexOf('=');
    if (eqIdx > 0) {
      const key = arg.slice(0, eqIdx).replace(/^--/, '');
      opts[key] = arg.slice(eqIdx + 1);
    } else {
      opts[arg.replace(/^--/, '')] = true;
    }
  }
  return opts;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();
  const workerUrl = opts['worker-url'] || DEFAULT_WORKER_URL;
  const haltOnFail = !opts['no-halt'];
  const timeoutSec = parseInt(opts.timeout || '60', 10);

  // ── Model filtering ──
  let modelsToTest = [...TEST_MODELS];
  if (opts.models) {
    const requested = opts.models.split(',').map(s => s.trim());
    modelsToTest = TEST_MODELS.filter(m =>
      requested.some(r => m.id.includes(r) || m.name.toLowerCase().includes(r.toLowerCase()))
    );
    if (modelsToTest.length === 0) {
      console.error('No matching models found. Available:');
      TEST_MODELS.forEach(m => console.error(`  - ${m.name}  (${m.id})`));
      process.exit(1);
    }
  }

  // ── Scenario filtering ──
  // Use --advanced flag to run advanced scenarios, otherwise run basic scenarios
  const useAdvanced = opts.advanced;
  let scenariosToTest = useAdvanced ? ADVANCED_SCENARIOS : SCENARIOS;
  
  if (opts.scenarios) {
    const requested = opts.scenarios.split(',').map(s => s.trim());
    scenariosToTest = {};
    const sourceScenarios = useAdvanced ? ADVANCED_SCENARIOS : SCENARIOS;
    for (const key of requested) {
      if (sourceScenarios[key]) scenariosToTest[key] = sourceScenarios[key];
    }
    if (Object.keys(scenariosToTest).length === 0) {
      const available = useAdvanced ? Object.keys(ADVANCED_SCENARIOS) : Object.keys(SCENARIOS);
      console.error('No matching scenarios. Available:', available.join(', '));
      process.exit(1);
    }
  }

  // ── Run directory ──
  const projectRoot = resolve(__dirname, '..');
  let runDir;
  let state;
  if (opts.resume) {
    runDir = resolve(projectRoot, opts.resume);
    if (!existsSync(runDir)) {
      console.error(`Resume directory not found: ${runDir}`);
      process.exit(1);
    }
    state = loadState(runDir);
    console.log(`\n🔄 Resuming run from: ${runDir}`);
    console.log(`   Previously completed: ${state.completed.length}  |  Failed: ${state.failed.length}`);
  } else {
    runDir = join(projectRoot, 'tests-ai', `run-${timestamp()}`);
    mkdirSync(runDir, { recursive: true });
    state = { completed: [], failed: [], skipped: [] };
    saveState(runDir, state);
  }

  // ── Banner ──
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  CF Workers AI — Model Comparison Test                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Worker URL:    ${workerUrl}`);
  console.log(`  Run directory: ${runDir}`);
  console.log(`  Test Mode:     ${useAdvanced ? 'ADVANCED (Protocol Compliance)' : 'BASIC (Narrative Quality)'}`);
  console.log(`  Models:        ${modelsToTest.length} selected`);
  console.log(`  Scenarios:     ${Object.keys(scenariosToTest).join(', ')}`);
  console.log(`  Halt on fail:  ${haltOnFail ? 'YES (use --no-halt to disable)' : 'NO'}`);
  console.log(`  Timeout:       ${timeoutSec}s per request`);
  console.log('');
  console.log('  💡 Start your CF Worker: cd cf-worker && npm run dev');
  console.log('');

  const allResults = [];
  let modelIndex = 0;

  for (const model of modelsToTest) {
    modelIndex++;
    const slug = modelSlug(model);

    // ── Skip if already done (resume mode) ──
    if (state.completed.includes(model.id)) {
      console.log(`\n⏭️  [${modelIndex}/${modelsToTest.length}] ${model.name} — already completed, skipping`);
      continue;
    }
    if (state.failed.includes(model.id) && opts.resume) {
      console.log(`\n⏭️  [${modelIndex}/${modelsToTest.length}] ${model.name} — previously failed, skipping`);
      if (!state.skipped.includes(model.id)) {
        state.skipped.push(model.id);
      }
      continue;
    }

    console.log(`\n${'═'.repeat(64)}`);
    console.log(`  [${modelIndex}/${modelsToTest.length}] ${model.name}`);
    console.log(`  Model ID: ${model.id}`);
    console.log(`  Tier:     ${model.tier}`);
    console.log('═'.repeat(64));

    const modelResults = [];
    let modelFailed = false;

    for (const [scenarioKey, scenario] of Object.entries(scenariosToTest)) {
      console.log(`\n  ── ${scenario.name} ──`);
      console.log(`     Sending request...`);

      const result = await callWorker(workerUrl, model.id, scenario.prompt, 1600, 0.7, timeoutSec * 1000);

      if (result.success) {
        const quality = runQualityChecks(result.text, scenarioKey);
        const wordCount = result.text.split(/\s+/).length;

        console.log(`     ✅ Success`);
        console.log(`     Latency:  ${result.latencyMs}ms`);
        console.log(`     Words:    ${wordCount}`);
        console.log(`     Quality:  ${quality.score}% (${quality.passed}/${quality.total} checks)`);

        // Verbose: show each quality check
        for (const check of quality.checks) {
          console.log(`       ${check.pass ? '✅' : '❌'} ${check.name}`);
        }

        // Show first 200 chars of response
        const preview = result.text.slice(0, 200).replace(/\n/g, ' ');
        console.log(`     Preview:  "${preview}..."`);

        const record = {
          modelId: model.id,
          scenarioKey,
          scenarioName: scenario.name,
          success: true,
          text: result.text,
          latencyMs: result.latencyMs,
          quality,
        };
        modelResults.push(record);
        allResults.push(record);
      } else {
        console.log(`     ❌ FAILED`);
        console.log(`     Latency:  ${result.latencyMs}ms`);
        console.log(`     Error:    ${result.error}`);

        const record = {
          modelId: model.id,
          scenarioKey,
          scenarioName: scenario.name,
          success: false,
          error: result.error,
          latencyMs: result.latencyMs,
          text: null,
          quality: { score: 0, passed: 0, total: 0, checks: [] },
        };
        modelResults.push(record);
        allResults.push(record);
        modelFailed = true;
      }

      // Brief pause between scenarios
      await new Promise(r => setTimeout(r, 500));
    }

    // ── Write per-model report ──
    writeModelReport(runDir, model, modelResults);
    console.log(`\n  📄 Report written: ${slug}.md / ${slug}.json`);

    if (modelFailed) {
      state.failed.push(model.id);
      saveState(runDir, state);

      if (haltOnFail) {
        // Write summary so far
        writeSummary(runDir, modelsToTest, allResults, state);

        console.log(`\n${'⚠️'.repeat(30)}`);
        console.log(`\n  🛑 RUN HALTED — Model "${model.name}" failed.`);
        console.log(`\n  To resume (skipping failed models):`);
        console.log(`    node scripts/test-cf-models-simple.mjs --resume=${runDir.replace(projectRoot + '/', '')}`);
        console.log(`\n  To retry just this model:`);
        console.log(`    node scripts/test-cf-models-simple.mjs --models=${slug}`);
        console.log(`\n  To run all without halting:`);
        console.log(`    node scripts/test-cf-models-simple.mjs --no-halt`);
        console.log('');
        process.exit(1);
      } else {
        console.log(`\n  ⚠️  Model failed but continuing (--no-halt)`);
      }
    } else {
      state.completed.push(model.id);
      saveState(runDir, state);
    }

    // Pause between models
    await new Promise(r => setTimeout(r, 1000));
  }

  // ── Final summary ──
  writeSummary(runDir, modelsToTest, allResults, state);

  console.log(`\n${'═'.repeat(64)}`);
  console.log(`  ✅ TEST RUN COMPLETE`);
  console.log(`${'═'.repeat(64)}`);
  console.log(`  Run directory:  ${runDir}`);
  console.log(`  Summary:        summary.md`);
  console.log(`  Completed:      ${state.completed.length}`);
  console.log(`  Failed:         ${state.failed.length}`);
  console.log(`  Skipped:        ${state.skipped.length}`);
  console.log('');

  console.log('  Results by model:');
  for (const model of modelsToTest) {
    const modelResults = allResults.filter(r => r.modelId === model.id && r.success);
    const modelErrors = allResults.filter(r => r.modelId === model.id && !r.success);
    if (state.skipped.includes(model.id)) {
      console.log(`    ⏭️  ${model.name}: skipped (previously failed)`);
    } else if (modelResults.length > 0) {
      const avgScore = Math.round(modelResults.reduce((s, r) => s + r.quality.score, 0) / modelResults.length);
      const avgLatency = Math.round(modelResults.reduce((s, r) => s + r.latencyMs, 0) / modelResults.length);
      console.log(`    ✅ ${model.name}: quality=${avgScore}%, latency=${avgLatency}ms`);
    } else if (modelErrors.length > 0) {
      console.log(`    ❌ ${model.name}: ALL FAILED`);
    } else {
      console.log(`    ⏳ ${model.name}: not tested`);
    }
  }
  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
