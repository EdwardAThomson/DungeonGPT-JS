#!/usr/bin/env node

/**
 * Cloudflare Workers AI Model Comparison Test Harness
 *
 * Tests multiple CF models against the same game prompts and produces
 * a markdown comparison report.
 *
 * Usage:
 *   CF_ACCOUNT_ID=xxx CF_API_TOKEN=xxx node scripts/test-cf-models.mjs
 *
 * Optional flags:
 *   --models=llama-3.1-8b-instruct-fast,gemma-3-12b-it   (test subset)
 *   --scenarios=opening,interaction                        (test subset)
 *   --output=test-results/my-report.md                     (custom output)
 *   --delay=2000                                           (ms between calls)
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

// ─── Configuration ───────────────────────────────────────────────────────────

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CF_API_TOKEN;

if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
  console.error('Missing required env vars: CF_ACCOUNT_ID and CF_API_TOKEN');
  console.error('');
  console.error('Get these from the Cloudflare dashboard:');
  console.error('  CF_ACCOUNT_ID  → Workers & Pages → Account ID (right sidebar)');
  console.error('  CF_API_TOKEN   → My Profile → API Tokens → Create Token');
  console.error('                   (needs Workers AI Read + Edit permissions)');
  process.exit(1);
}

const API_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run`;

// ─── Models to Test ──────────────────────────────────────────────────────────

const ALL_MODELS = [
  // Tier 1 — Large
  { id: '@cf/openai/gpt-oss-120b', name: 'GPT-OSS 120B', tier: 'large', params: '120B' },
  { id: '@cf/openai/gpt-oss-20b', name: 'GPT-OSS 20B', tier: 'large', params: '20B' },

  // Tier 2 — Medium
  { id: '@cf/meta/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout', tier: 'medium', params: '17B MoE' },
  { id: '@cf/google/gemma-3-12b-it', name: 'Gemma 3 12B', tier: 'medium', params: '12B' },

  // Tier 3 — Small / Fast
  { id: '@cf/meta/llama-3.1-8b-instruct-fast', name: 'Llama 3.1 8B Fast', tier: 'small', params: '8B' },
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
    description: 'Party moves to a new tile on the world map. Tests brief atmospheric description and encounter weaving.',
    prompt: DM_PROTOCOL + `Game Context: Setting: A war-torn kingdom where undead armies march from the fallen capital. Mood: Grim.
Goal: Destroy the Lich King's phylactery
Current Milestone: Seek the Oracle in the Frostpeak Mountains
Player has moved to coordinates (8, 3) in a forest biome. Description seed: Describe the area.. Party: Kael (Fighter), Lyra (Wizard), Bram (Cleric).

Story summary so far: The party left Millhaven heading north after learning about a hermit in the mountains. The village elder warned them about undead patrols.

The party moves to a new location: dense woodland with towering trees.

Coordinates: (8, 3)
Biome: forest

**Surrounding Terrain:**
North: mountain
East: forest
South: plains
West: Millhaven (town)

**IMPORTANT - Encounter Hook:**
The party notices a faint trail of smoke rising through the canopy ahead. As they approach, they find an abandoned campsite — the fire still warm, bedrolls hastily packed. Whoever was here left in a hurry.

Weave this discovery naturally into your description. The players can choose to engage with it through conversation or ignore it. Don't force interaction - just make them aware of it.

Describe what the party sees and experiences as they arrive. Keep it brief (2-3 sentences) and atmospheric. Base your description on the actual surrounding terrain provided.`,
  },

  town_entry: {
    name: 'Town Entry (Entering a Settlement)',
    description: 'Party enters a town tile. Tests creating a sense of place without specific NPC/building data.',
    prompt: DM_PROTOCOL + `[CONTEXT]
Setting: A war-torn kingdom where undead armies march from the fallen capital. Mood: Grim.
Goal: Destroy the Lich King's phylactery
Current Milestone: Seek the Oracle in the Frostpeak Mountains
Player has moved to coordinates (5, 2) in a town biome. The party has arrived at Ironhold, a fortified town. They are standing at the edge of the town.
Party: Kael (Fighter), Lyra (Wizard), Bram (Cleric).

[SUMMARY]
The party traveled north through dense forest, finding an abandoned campsite with signs of a hasty departure. They pressed on through the night, following mountain paths, and now approach the fortified town of Ironhold.

[TASK]
Describe the party's arrival at Ironhold. Set the atmosphere, describe what they see and hear. Keep it to 2-3 paragraphs. End with options or a question for the player.`,
  },
};

// ─── Quality Checks ──────────────────────────────────────────────────────────

function runQualityChecks(response, scenarioKey) {
  const checks = [];

  // 1. Starts with narration (not echoing context/markers)
  const badStarts = ['[CONTEXT]', '[TASK]', '[ADVENTURE', '[SUMMARY]', '[NARRATE]', '[STRICT',
    'Setting:', 'Game Context:', 'Current Summary:'];
  const startsClean = !badStarts.some(marker => response.trimStart().startsWith(marker));
  checks.push({ name: 'Starts with narration', pass: startsClean });

  // 2. Contains no prompt markers in body
  const promptMarkers = /\[(CONTEXT|TASK|ADVENTURE START|SUMMARY|PLAYER ACTION|NARRATE|STRICT DUNGEON MASTER PROTOCOL)\]/i;
  const noMarkers = !promptMarkers.test(response);
  checks.push({ name: 'No prompt markers leaked', pass: noMarkers });

  // 3. No meta/OOC commentary
  const metaPhrases = /\b(I will|I plan to|as a language model|as an AI|I cannot|let me|I'll examine|I should)\b/i;
  const noMeta = !metaPhrases.test(response);
  checks.push({ name: 'No OOC/meta commentary', pass: noMeta });

  // 4. Ends with question or options for player
  const endsWithQuestion = /(\?|what do you do|what will you|what would you|do you wish|how do you proceed|choose|options?:)/i;
  const hasPlayerPrompt = endsWithQuestion.test(response.slice(-300));
  checks.push({ name: 'Ends with player options/question', pass: hasPlayerPrompt });

  // 5. Reasonable length (not too short, not too long)
  const wordCount = response.split(/\s+/).length;
  const goodLength = wordCount >= 30 && wordCount <= 600;
  checks.push({ name: `Good length (${wordCount} words)`, pass: goodLength });

  // 6. Movement-specific: should be brief (2-3 sentences requested)
  if (scenarioKey === 'movement') {
    const sentenceCount = response.split(/[.!?]+/).filter(s => s.trim().length > 10).length;
    const isBrief = sentenceCount <= 8;
    checks.push({ name: `Brief for movement (${sentenceCount} sentences)`, pass: isBrief });
  }

  // 7. Doesn't echo the DM protocol
  const echoesProtocol = response.includes('STRICT DUNGEON MASTER PROTOCOL') ||
    response.includes('Failure to follow this protocol');
  checks.push({ name: 'Does not echo protocol', pass: !echoesProtocol });

  const passed = checks.filter(c => c.pass).length;
  const total = checks.length;
  const score = Math.round((passed / total) * 100);

  return { checks, passed, total, score };
}

// ─── API Caller ──────────────────────────────────────────────────────────────

async function callModel(modelId, prompt, maxTokens = 1600, temperature = 0.7) {
  const url = `${API_BASE}/${encodeURIComponent(modelId)}`;

  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: prompt },
        ],
        max_tokens: maxTokens,
        temperature,
      }),
    });

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

    if (!data.success) {
      return {
        success: false,
        error: JSON.stringify(data.errors?.slice(0, 2) || 'Unknown error'),
        latencyMs,
        text: null,
      };
    }

    const text = data.result?.response || '';

    return { success: true, text, latencyMs, error: null };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      latencyMs: Date.now() - startTime,
      text: null,
    };
  }
}

// ─── CLI Argument Parsing ────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (const arg of args) {
    const [key, val] = arg.replace(/^--/, '').split('=');
    opts[key] = val;
  }
  return opts;
}

// ─── Report Generation ──────────────────────────────────────────────────────

function generateReport(results, modelsUsed, scenariosUsed) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  let md = `# CF Workers AI — Model Comparison Report\n\n`;
  md += `**Generated:** ${new Date().toISOString()}\n`;
  md += `**Models tested:** ${modelsUsed.length}\n`;
  md += `**Scenarios tested:** ${Object.keys(scenariosUsed).length}\n\n`;

  // Summary table
  md += `## Summary\n\n`;
  md += `| Model | Tier | Params | Avg Latency | Avg Quality | Errors |\n`;
  md += `|-------|------|--------|-------------|-------------|--------|\n`;

  for (const model of modelsUsed) {
    const modelResults = results.filter(r => r.modelId === model.id);
    const successful = modelResults.filter(r => r.success);
    const failed = modelResults.filter(r => !r.success);
    const avgLatency = successful.length > 0
      ? Math.round(successful.reduce((s, r) => s + r.latencyMs, 0) / successful.length)
      : 'N/A';
    const avgQuality = successful.length > 0
      ? Math.round(successful.reduce((s, r) => s + r.quality.score, 0) / successful.length)
      : 'N/A';

    md += `| ${model.name} | ${model.tier} | ${model.params} | ${avgLatency}ms | ${avgQuality}% | ${failed.length}/${modelResults.length} |\n`;
  }

  // Detailed results per scenario
  for (const [scenarioKey, scenario] of Object.entries(scenariosUsed)) {
    md += `\n---\n\n## Scenario: ${scenario.name}\n\n`;
    md += `> ${scenario.description}\n\n`;

    const scenarioResults = results.filter(r => r.scenarioKey === scenarioKey);

    for (const result of scenarioResults) {
      const model = modelsUsed.find(m => m.id === result.modelId);
      md += `### ${model?.name || result.modelId}\n\n`;

      if (!result.success) {
        md += `**ERROR:** ${result.error}\n\n`;
        continue;
      }

      md += `- **Latency:** ${result.latencyMs}ms\n`;
      md += `- **Words:** ${result.text.split(/\s+/).length}\n`;
      md += `- **Quality Score:** ${result.quality.score}% (${result.quality.passed}/${result.quality.total})\n`;

      // Quality check details
      const failedChecks = result.quality.checks.filter(c => !c.pass);
      if (failedChecks.length > 0) {
        md += `- **Failed checks:** ${failedChecks.map(c => c.name).join(', ')}\n`;
      }

      md += `\n**Response:**\n\n`;
      md += `> ${result.text.split('\n').join('\n> ')}\n\n`;
    }
  }

  return { markdown: md, timestamp };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  // Filter models if --models flag provided
  let modelsToTest = ALL_MODELS;
  if (opts.models) {
    const requested = opts.models.split(',').map(s => s.trim());
    modelsToTest = ALL_MODELS.filter(m =>
      requested.some(r => m.id.includes(r) || m.name.toLowerCase().includes(r.toLowerCase()))
    );
    if (modelsToTest.length === 0) {
      console.error('No matching models found. Available:', ALL_MODELS.map(m => m.name).join(', '));
      process.exit(1);
    }
  }

  // Filter scenarios if --scenarios flag provided
  let scenariosToTest = SCENARIOS;
  if (opts.scenarios) {
    const requested = opts.scenarios.split(',').map(s => s.trim());
    scenariosToTest = {};
    for (const key of requested) {
      if (SCENARIOS[key]) scenariosToTest[key] = SCENARIOS[key];
    }
    if (Object.keys(scenariosToTest).length === 0) {
      console.error('No matching scenarios. Available:', Object.keys(SCENARIOS).join(', '));
      process.exit(1);
    }
  }

  const delayMs = parseInt(opts.delay) || 1500;
  const outputFile = opts.output || `test-results/model-comparison-${new Date().toISOString().slice(0, 10)}.md`;

  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  Cloudflare Workers AI — Model Comparison Test      ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Models:    ${modelsToTest.map(m => m.name).join(', ')}`);
  console.log(`  Scenarios: ${Object.keys(scenariosToTest).join(', ')}`);
  console.log(`  Delay:     ${delayMs}ms between calls`);
  console.log(`  Output:    ${outputFile}`);
  console.log('');

  const totalCalls = modelsToTest.length * Object.keys(scenariosToTest).length;
  let completedCalls = 0;
  const results = [];

  for (const [scenarioKey, scenario] of Object.entries(scenariosToTest)) {
    console.log(`\n── Scenario: ${scenario.name} ──\n`);

    for (const model of modelsToTest) {
      completedCalls++;
      const progress = `[${completedCalls}/${totalCalls}]`;
      process.stdout.write(`  ${progress} ${model.name} (${model.params})... `);

      const result = await callModel(model.id, scenario.prompt);

      if (result.success) {
        const quality = runQualityChecks(result.text, scenarioKey);
        console.log(`✓ ${result.latencyMs}ms, ${result.text.split(/\s+/).length} words, quality: ${quality.score}%`);
        results.push({
          modelId: model.id,
          scenarioKey,
          success: true,
          text: result.text,
          latencyMs: result.latencyMs,
          quality,
        });
      } else {
        console.log(`✗ ERROR: ${result.error?.slice(0, 100)}`);
        results.push({
          modelId: model.id,
          scenarioKey,
          success: false,
          error: result.error,
          latencyMs: result.latencyMs,
          text: null,
          quality: { score: 0, passed: 0, total: 0, checks: [] },
        });
      }

      // Rate limiting delay
      if (completedCalls < totalCalls) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }

  // Generate report
  const { markdown } = generateReport(results, modelsToTest, scenariosToTest);

  // Write output
  mkdirSync(dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, markdown, 'utf-8');

  console.log(`\n══════════════════════════════════════════════════════`);
  console.log(`  Report written to: ${outputFile}`);
  console.log(`══════════════════════════════════════════════════════\n`);

  // Print quick summary
  console.log('Quick Summary:');
  const modelScores = {};
  for (const model of modelsToTest) {
    const modelResults = results.filter(r => r.modelId === model.id && r.success);
    if (modelResults.length > 0) {
      const avgScore = Math.round(modelResults.reduce((s, r) => s + r.quality.score, 0) / modelResults.length);
      const avgLatency = Math.round(modelResults.reduce((s, r) => s + r.latencyMs, 0) / modelResults.length);
      modelScores[model.name] = { avgScore, avgLatency };
      console.log(`  ${model.name}: quality=${avgScore}%, latency=${avgLatency}ms`);
    } else {
      console.log(`  ${model.name}: ALL FAILED`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
