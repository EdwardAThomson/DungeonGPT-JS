#!/usr/bin/env node

/**
 * Cloudflare Workers AI — Multi-Turn Consistency Test Harness
 *
 * Chains 10 turns of a scripted RPG scenario ("The Cursed Village") through
 * the CF Worker, feeding each AI response back as context for the next turn.
 * Evaluates per-turn protocol compliance AND cross-turn consistency, tone,
 * milestone tracking, combat handling, and NPC characterization.
 *
 * Usage:
 *   1. Start your CF Worker: cd cf-worker && npm run dev
 *   2. Run tests: node scripts/test-cf-models-multiturn.mjs
 *
 * Flags:
 *   --worker-url=http://localhost:8787    (default from .env.local)
 *   --models=gpt-oss-20b,gemma-3-12b     (filter models by name/id substring)
 *   --all-models                           (include optional premium models)
 *   --resume=tests-ai/multiturn-run-...   (resume a previous run)
 *   --no-halt                              (don't stop on model failure)
 *   --timeout=90                           (seconds per turn, default 90)
 *
 * Auth (when worker has SUPABASE_JWT_SECRET configured):
 *   SUPABASE_ACCESS_TOKEN=<token> node scripts/test-cf-models-multiturn.mjs
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { dirname, resolve, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Worker URL ─────────────────────────────────────────────────────────────

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

const DEFAULT_WORKER_URL = getCfWorkerUrl();

// ─── Models ─────────────────────────────────────────────────────────────────

const DEFAULT_MODELS = [
  { id: '@cf/openai/gpt-oss-20b', name: 'GPT-OSS 20B', tier: 'quality' },
  { id: '@cf/google/gemma-3-12b-it', name: 'Gemma 3 12B', tier: 'quality' },
  { id: '@cf/meta/llama-3.1-8b-instruct-fast', name: 'Llama 3.1 8B Fast', tier: 'balanced' },
];

const OPTIONAL_MODELS = [
  { id: '@cf/meta/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B', tier: 'quality' },
  { id: '@cf/openai/gpt-oss-120b', name: 'GPT-OSS 120B', tier: 'ultra' },
  // Candidates under evaluation (not in production registry)
  { id: '@cf/google/gemma-4-26b-a4b-it', name: 'Gemma 4 26B MoE', tier: 'quality' },
  { id: '@cf/zai-org/glm-4.7-flash', name: 'GLM 4.7 Flash', tier: 'balanced' },
];

// ─── DM Protocol (production version from src/data/prompts.js) ──────────────

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
The game has two types of milestones:
- MECHANICAL milestones (item, combat, location) are tracked by the game engine automatically. You do NOT need to mark these complete — the system detects when an item is acquired, an enemy is defeated, or a location is visited. When the system completes one, you will see it noted in the context. Narrate the achievement with flair.
- NARRATIVE milestones require your judgment. When a narrative milestone is truly accomplished through roleplay or conversation (e.g., convincing an NPC, solving a puzzle), mark it complete using:
[COMPLETE_MILESTONE: exact milestone text]
Only use this for narrative milestones. Never use it for item, combat, or location milestones.

CAMPAIGN COMPLETION:
When the party achieves the main campaign goal (the primary objective of the entire adventure), mark it complete using:
[COMPLETE_CAMPAIGN]
This should ONLY be used when the overarching campaign objective is fully accomplished, not for individual milestones.
Use this sparingly - it marks the end of the main story arc.

Failure to follow this protocol breaks player immersion. Output only the game's story and dialogue.
[/STRICT DUNGEON MASTER PROTOCOL]

`;

// ─── Scenario: The Cursed Village ───────────────────────────────────────────

const GAME_CONTEXT = `Setting: A war-torn kingdom where undead armies march from the fallen capital. Mood: Grim Intensity. Magic: High Magic. Tech: Medieval.
Goal of the Campaign: Destroy the Lich King's phylactery hidden in the Obsidian Citadel
Active Milestones: Break the curse on the village of Ashwood [narrative]
Player is at coordinates (5, 6) in a plains biome. Point Of Interest: town (Ashwood, village).
Party: Kael (Fighter, Level 5, HP: 60/60), Lyra (Wizard, Level 5, HP: 35/35), Bram (Cleric, Level 5, HP: 50/50).`;

const INITIAL_SUMMARY = 'The party approaches the village of Ashwood, drawn by rumors of a dark curse that has plagued the settlement.';

const COMBAT_DATA = `[COMBAT ROUND]
Three skeletal warriors burst from the disturbed graves, rusted swords raised.

Kael attacks Skeleton #1 with longsword:
- Attack roll: 16 (HIT)
- Damage: 8 slashing damage

Lyra casts Magic Missile at Skeleton #2:
- Automatic hit
- Damage: 11 force damage

Bram casts Sacred Flame on Skeleton #3:
- Enemy DEX save: 8 (FAILED)
- Damage: 7 radiant damage`;

const TURNS = [
  {
    turnNumber: 1,
    type: 'adventure_start',
    label: 'Arrival at Ashwood',
    playerAction: null,
  },
  {
    turnNumber: 2,
    type: 'interaction',
    label: 'Seeking the Elder',
    playerAction: 'We approach the village and look for the elder or someone in charge.',
  },
  {
    turnNumber: 3,
    type: 'interaction',
    label: 'Learning the Curse',
    playerAction: 'We ask the elder what curse afflicts Ashwood and how we can help.',
  },
  {
    turnNumber: 4,
    type: 'interaction',
    label: 'Cemetery Investigation',
    playerAction: 'We head to the old cemetery to investigate the source of the curse.',
  },
  {
    turnNumber: 5,
    type: 'interaction',
    label: 'Detect Magic',
    playerAction: 'Lyra casts Detect Magic to scan the cemetery for necromantic energy.',
  },
  {
    turnNumber: 6,
    type: 'combat',
    label: 'Skeleton Combat',
    playerAction: null,
  },
  {
    turnNumber: 7,
    type: 'interaction',
    label: 'Post-Combat Search',
    playerAction: 'We search the defeated skeletons and the area around the disturbed graves.',
  },
  {
    turnNumber: 8,
    type: 'interaction',
    label: 'Purification Ritual (Milestone)',
    playerAction: 'Bram performs a purification ritual on the cursed altar using his holy symbol, calling upon divine power to break the dark enchantment.',
    expectMilestone: true,
  },
  {
    turnNumber: 9,
    type: 'interaction',
    label: 'Return to Elder',
    playerAction: 'We return to the village elder to report that the curse has been broken.',
  },
  {
    turnNumber: 10,
    type: 'interaction',
    label: 'Departure',
    playerAction: 'We thank the villagers and prepare to depart Ashwood, heading toward the Frostpeak Mountains.',
  },
];

// ─── Prompt Assembly ────────────────────────────────────────────────────────

function buildTurnPrompt(turn, currentSummary) {
  if (turn.type === 'adventure_start') {
    return DM_PROTOCOL + `[ADVENTURE START]

[CONTEXT]
${GAME_CONTEXT}

Current Summary: ${INITIAL_SUMMARY}

[TASK]
Describe the arrival of the party at Ashwood and the immediate atmosphere of the scene. Present the initial situation to the players. Begin your response directly with the narrative description.`;
  }

  if (turn.type === 'combat') {
    let prompt = DM_PROTOCOL + `[CONTEXT]
${GAME_CONTEXT}

[SUMMARY]
${currentSummary}

${COMBAT_DATA}

[NARRATE]
Describe the results of these attacks. What happens to the skeletons? What do the players see? End by asking what they do next.`;
    return prompt;
  }

  // Standard interaction turn
  let prompt = DM_PROTOCOL + `[CONTEXT]
${GAME_CONTEXT}

[SUMMARY]
${currentSummary}

[PLAYER ACTION]
${turn.playerAction}

[NARRATE]`;

  if (turn.expectMilestone) {
    prompt += `\nRemember: When a narrative milestone is truly accomplished, mark it complete using [COMPLETE_MILESTONE: Break the curse on the village of Ashwood]`;
  }

  return prompt;
}

// ─── Summary Builder ────────────────────────────────────────────────────────

const MAX_SUMMARY_WORDS = 500;

function buildSummary(previousSummary, turn, aiResponse) {
  // Extract first 2 sentences of AI response (strip milestone tags first)
  const cleaned = aiResponse.replace(/\[COMPLETE_MILESTONE:[^\]]*\]/gi, '').trim();
  const sentences = cleaned.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');

  const actionNote = turn.playerAction
    ? ` The party: ${turn.playerAction.toLowerCase()}`
    : '';

  let summary = `${previousSummary}${actionNote} ${sentences}`.trim();

  // Cap at MAX_SUMMARY_WORDS — truncate from the front (keep recent events)
  const words = summary.split(/\s+/);
  if (words.length > MAX_SUMMARY_WORDS) {
    summary = '...' + words.slice(words.length - MAX_SUMMARY_WORDS).join(' ');
  }

  return summary;
}

// ─── Per-Turn Quality Checks ────────────────────────────────────────────────

function runPerTurnChecks(response, turn) {
  const checks = [];

  // Starts with narration (not prompt markers)
  const badStarts = ['[CONTEXT]', '[TASK]', '[ADVENTURE', '[SUMMARY]', '[NARRATE]', '[STRICT',
    'Setting:', 'Game Context:', 'Current Summary:'];
  const startsClean = !badStarts.some(marker => response.trimStart().startsWith(marker));
  checks.push({ name: 'Starts with narration', pass: startsClean });

  // No prompt markers leaked
  const promptMarkers = /\[(CONTEXT|TASK|ADVENTURE START|SUMMARY|PLAYER ACTION|NARRATE|STRICT DUNGEON MASTER PROTOCOL)\]/i;
  const noMarkers = !promptMarkers.test(response);
  checks.push({ name: 'No prompt markers leaked', pass: noMarkers });

  // No OOC/meta commentary
  const metaPhrases = /\b(I will|I plan to|as a language model|as an AI|I cannot|let me|I'll examine|I should)\b/i;
  const noMeta = !metaPhrases.test(response);
  checks.push({ name: 'No OOC/meta commentary', pass: noMeta });

  // Ends with question or options
  const endsWithQuestion = /(\?|what do you do|what will you|what would you|do you wish|how do you proceed|choose|options?:)/i;
  const hasPlayerPrompt = endsWithQuestion.test(response.slice(-300));
  checks.push({ name: 'Ends with player options/question', pass: hasPlayerPrompt });

  // Reasonable length
  const wordCount = response.split(/\s+/).length;
  const goodLength = wordCount >= 30 && wordCount <= 600;
  checks.push({ name: `Good length (${wordCount} words)`, pass: goodLength });

  // Does not echo protocol
  const echoesProtocol = response.includes('STRICT DUNGEON MASTER PROTOCOL') ||
    response.includes('Failure to follow this protocol');
  checks.push({ name: 'Does not echo protocol', pass: !echoesProtocol });

  // Combat-specific
  if (turn.type === 'combat') {
    const describesDamage = /\d+\s*(damage|hit points|hp)/i.test(response);
    checks.push({ name: 'Describes damage/hits', pass: describesDamage });
    const mentionsEnemies = /(skeleton|undead|bones)/i.test(response);
    checks.push({ name: 'Mentions enemies', pass: mentionsEnemies });
  }

  // Milestone-specific
  if (turn.expectMilestone) {
    const hasMilestoneTag = /\[COMPLETE_MILESTONE:\s*[^\]]*\]/i.test(response);
    checks.push({ name: 'Emits [COMPLETE_MILESTONE] tag', pass: hasMilestoneTag });
    if (hasMilestoneTag) {
      const correctText = /\[COMPLETE_MILESTONE:\s*[^\]]*curse[^\]]*Ashwood[^\]]*\]/i.test(response);
      checks.push({ name: 'Correct milestone text', pass: correctText });
    }
  }

  const passed = checks.filter(c => c.pass).length;
  const total = checks.length;
  const score = Math.round((passed / total) * 100);

  return { checks, passed, total, score };
}

// ─── Cross-Turn Quality Checks (5 dimensions, each 1-5) ────────────────────

function scoreConsistency(turnResults) {
  let score = 5;
  const partyNames = ['Kael', 'Lyra', 'Bram'];
  const successfulTurns = turnResults.filter(t => t.success);

  for (const name of partyNames) {
    const mentions = successfulTurns.filter(t => new RegExp(name, 'i').test(t.text)).length;
    // At least 30% of turns should mention each party member
    if (mentions < Math.ceil(successfulTurns.length * 0.3)) score -= 1;
  }

  const ashwoodMentions = successfulTurns.filter(t => /Ashwood/i.test(t.text)).length;
  if (ashwoodMentions < Math.ceil(successfulTurns.length * 0.3)) score -= 1;

  return Math.max(1, Math.min(5, score));
}

function scoreTone(turnResults) {
  let score = 5;
  const toneWords = /\b(dark|grim|shadow|ominous|dread|decay|ash|bone|ruin|bleak|cold|death|undead|curse|haunted|blighted|wither|rot|doom|fear)\b/i;
  const successfulTurns = turnResults.filter(t => t.success);

  let turnsWithTone = 0;
  for (const turn of successfulTurns) {
    const matches = turn.text.match(new RegExp(toneWords.source, 'gi'));
    if (matches && matches.length >= 1) turnsWithTone++;
  }

  // At least 60% of turns should have grim tone words
  const toneRatio = turnsWithTone / successfulTurns.length;
  if (toneRatio < 0.4) score -= 2;
  else if (toneRatio < 0.6) score -= 1;

  return Math.max(1, Math.min(5, score));
}

function scoreMilestoneTracking(turnResults) {
  let score = 5;
  const milestoneRegex = /\[COMPLETE_MILESTONE:\s*[^\]]*\]/i;

  // Turn 8 should emit the tag
  const turn8 = turnResults.find(t => t.turnNumber === 8);
  if (!turn8 || !turn8.success) {
    return 1; // Can't evaluate
  }
  if (!milestoneRegex.test(turn8.text)) {
    score -= 3; // Major failure: didn't emit at the right time
  } else {
    // Check correct text
    const correctText = /\[COMPLETE_MILESTONE:\s*[^\]]*curse[^\]]*Ashwood[^\]]*\]/i.test(turn8.text);
    if (!correctText) score -= 1;
  }

  // No premature emission (turns 1-7)
  for (const turn of turnResults) {
    if (turn.turnNumber < 8 && turn.success && milestoneRegex.test(turn.text)) {
      score -= 2; // Premature milestone
      break;
    }
  }

  return Math.max(1, Math.min(5, score));
}

function scoreCombatHandling(turnResults) {
  let score = 5;
  const turn6 = turnResults.find(t => t.turnNumber === 6);
  if (!turn6 || !turn6.success) return 1;

  const text = turn6.text;

  // Describes attack outcomes
  if (!/\b(hit|strike|slash|cut|impact|blast|flame|burn)\b/i.test(text)) score -= 1;

  // Mentions damage or numbers
  if (!/\d/.test(text)) score -= 1;

  // Names combatants (skeletons and at least one party member)
  if (!/(skeleton|undead|bones)/i.test(text)) score -= 1;
  if (!/(Kael|Lyra|Bram)/i.test(text)) score -= 1;

  // Ends with player prompt
  const endsWithQuestion = /(\?|what do you do|what will you)/i;
  if (!endsWithQuestion.test(text.slice(-300))) score -= 1;

  return Math.max(1, Math.min(5, score));
}

function scoreNpcCharacterization(turnResults) {
  let score = 5;
  // Turns 2, 3, 9 involve the elder
  const elderTurns = [2, 3, 9];
  const results = elderTurns.map(n => turnResults.find(t => t.turnNumber === n)).filter(t => t?.success);

  if (results.length === 0) return 1;

  // Elder should have dialogue (quotes) in at least one turn
  const hasDialogue = results.some(t => /"[^"]+"/.test(t.text) || /\u201c[^\u201d]+\u201d/.test(t.text));
  if (!hasDialogue) score -= 2;

  // Elder should be referenced by some descriptor or name
  const elderRef = /(elder|village leader|chief|old man|old woman|headman|headwoman)/i;
  const elderMentions = results.filter(t => elderRef.test(t.text)).length;
  if (elderMentions < 2) score -= 1;

  // Turn 9 (return to elder) should reference the curse being broken
  const turn9 = turnResults.find(t => t.turnNumber === 9);
  if (turn9?.success) {
    if (!/(curse|purif|cleans|broken|lifted|freed)/i.test(turn9.text)) score -= 1;
  }

  return Math.max(1, Math.min(5, score));
}

function runCrossTurnChecks(turnResults) {
  return {
    consistency: scoreConsistency(turnResults),
    tone: scoreTone(turnResults),
    milestoneTracking: scoreMilestoneTracking(turnResults),
    combatHandling: scoreCombatHandling(turnResults),
    npcCharacterization: scoreNpcCharacterization(turnResults),
  };
}

// ─── Auth Token ─────────────────────────────────────────────────────────────

const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || null;

// ─── CF Worker API Caller ───────────────────────────────────────────────────

async function callWorker(workerUrl, modelId, prompt, maxTokens = 1600, temperature = 0.7, timeoutMs = 90000) {
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
        systemPrompt: '',
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errBody = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${errBody.slice(0, 200)}`, latencyMs, text: null };
    }

    const data = await response.json();

    if (data.error) {
      return { success: false, error: data.error, latencyMs, text: null };
    }

    return { success: true, text: data.text || '', latencyMs, error: null };
  } catch (err) {
    return { success: false, error: err.message, latencyMs: Date.now() - startTime, text: null };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function modelSlug(model) {
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

// ─── Report Generation ──────────────────────────────────────────────────────

function writeModelReport(runDir, model, turnResults, crossTurnScores) {
  const slug = modelSlug(model);
  const successes = turnResults.filter(r => r.success);
  const failures = turnResults.filter(r => !r.success);
  const totalLatency = successes.reduce((s, r) => s + r.latencyMs, 0);
  const avgLatency = successes.length > 0 ? Math.round(totalLatency / successes.length) : 0;
  const avgQuality = successes.length > 0
    ? Math.round(successes.reduce((s, r) => s + r.quality.score, 0) / successes.length)
    : 0;
  const crossTotal = Object.values(crossTurnScores).reduce((a, b) => a + b, 0);

  let md = `# Multi-Turn Report: ${model.name}\n\n`;
  md += `- **Model ID:** \`${model.id}\`\n`;
  md += `- **Tier:** ${model.tier}\n`;
  md += `- **Scenario:** The Cursed Village (10 turns)\n`;
  md += `- **Generated:** ${new Date().toISOString()}\n\n`;

  md += `## Summary\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Turns completed | ${successes.length}/${turnResults.length} |\n`;
  md += `| Total latency | ${totalLatency}ms |\n`;
  md += `| Avg latency/turn | ${avgLatency}ms |\n`;
  md += `| Per-turn quality avg | ${avgQuality}% |\n`;
  md += `| Consistency | ${crossTurnScores.consistency}/5 |\n`;
  md += `| Tone | ${crossTurnScores.tone}/5 |\n`;
  md += `| Milestone Tracking | ${crossTurnScores.milestoneTracking}/5 |\n`;
  md += `| Combat Handling | ${crossTurnScores.combatHandling}/5 |\n`;
  md += `| NPC Characterization | ${crossTurnScores.npcCharacterization}/5 |\n`;
  md += `| **Total Score** | **${crossTotal}/25** ${crossTotal >= 20 ? '(PASS)' : crossTotal >= 16 ? '(MINIMUM)' : '(FAIL)'}|\n\n`;

  for (const result of turnResults) {
    md += `---\n\n### Turn ${result.turnNumber}: ${result.label}\n\n`;

    if (!result.success) {
      md += `**FAILED:** ${result.error}\n`;
      md += `- **Latency:** ${result.latencyMs}ms\n\n`;
      continue;
    }

    md += `- **Latency:** ${result.latencyMs}ms\n`;
    md += `- **Words:** ${result.text.split(/\s+/).length}\n`;
    md += `- **Quality:** ${result.quality.score}% (${result.quality.passed}/${result.quality.total})\n\n`;

    md += `#### Quality Checks\n\n`;
    for (const check of result.quality.checks) {
      md += `- ${check.pass ? '✅' : '❌'} ${check.name}\n`;
    }

    md += `\n#### Response\n\n`;
    md += `\`\`\`\n${result.text}\n\`\`\`\n\n`;
  }

  writeFileSync(join(runDir, `${slug}-multiturn.md`), md, 'utf-8');
  writeFileSync(join(runDir, `${slug}-multiturn.json`), JSON.stringify({
    model,
    scenario: 'cursed_village',
    turns: turnResults,
    crossTurnScores,
    crossTurnTotal: crossTotal,
    totalLatencyMs: totalLatency,
    generated: new Date().toISOString(),
  }, null, 2), 'utf-8');
}

function writeSummary(runDir, allModels, allModelResults, state) {
  let md = `# CF Workers AI — Multi-Turn Test Summary\n\n`;
  md += `- **Run directory:** \`${runDir}\`\n`;
  md += `- **Scenario:** The Cursed Village (10 turns)\n`;
  md += `- **Generated:** ${new Date().toISOString()}\n`;
  md += `- **Models tested:** ${allModels.length}\n`;
  md += `- **Completed:** ${state.completed.length}  |  **Failed:** ${state.failed.length}  |  **Skipped:** ${state.skipped.length}\n\n`;

  md += `## Results Table\n\n`;
  md += `| Model | Tier | Turns | Avg Latency | Quality | Consist. | Tone | Milestone | Combat | NPC | Total | Status |\n`;
  md += `|-------|------|-------|-------------|---------|----------|------|-----------|--------|-----|-------|--------|\n`;

  for (const { model, turnResults, crossTurnScores } of allModelResults) {
    if (state.skipped.includes(model.id)) {
      md += `| ${model.name} | ${model.tier} | — | — | — | — | — | — | — | — | — | Skipped |\n`;
      continue;
    }

    const successes = turnResults.filter(r => r.success);
    if (successes.length === 0) {
      md += `| ${model.name} | ${model.tier} | 0/${turnResults.length} | — | — | — | — | — | — | — | — | Failed |\n`;
      continue;
    }

    const avgLatency = Math.round(successes.reduce((s, r) => s + r.latencyMs, 0) / successes.length);
    const avgQuality = Math.round(successes.reduce((s, r) => s + r.quality.score, 0) / successes.length);
    const ct = crossTurnScores;
    const total = ct.consistency + ct.tone + ct.milestoneTracking + ct.combatHandling + ct.npcCharacterization;
    const status = total >= 20 ? 'PASS' : total >= 16 ? 'MIN' : 'FAIL';

    md += `| ${model.name} | ${model.tier} | ${successes.length}/${turnResults.length} | ${avgLatency}ms | ${avgQuality}% | ${ct.consistency}/5 | ${ct.tone}/5 | ${ct.milestoneTracking}/5 | ${ct.combatHandling}/5 | ${ct.npcCharacterization}/5 | **${total}/25** | ${status} |\n`;
  }

  md += `\n## Per-Model Reports\n\n`;
  for (const { model } of allModelResults) {
    const slug = modelSlug(model);
    if (existsSync(join(runDir, `${slug}-multiturn.md`))) {
      md += `- [${model.name}](./${slug}-multiturn.md)\n`;
    }
  }

  writeFileSync(join(runDir, 'summary.md'), md, 'utf-8');
  writeFileSync(join(runDir, 'summary.json'), JSON.stringify({
    state,
    models: allModels,
    results: allModelResults,
    generated: new Date().toISOString(),
  }, null, 2), 'utf-8');
}

// ─── CLI Argument Parsing ───────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (const arg of args) {
    if (arg === '--no-halt' || arg === '--all-models') {
      opts[arg.replace(/^--/, '')] = true;
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

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();
  const workerUrl = opts['worker-url'] || DEFAULT_WORKER_URL;
  const haltOnFail = !opts['no-halt'];
  const timeoutSec = parseInt(opts.timeout || '90', 10);

  // Model selection
  let allModels = [...DEFAULT_MODELS];
  if (opts['all-models']) {
    allModels = [...DEFAULT_MODELS, ...OPTIONAL_MODELS];
  }

  let modelsToTest = allModels;
  if (opts.models) {
    const requested = opts.models.split(',').map(s => s.trim());
    modelsToTest = allModels.filter(m =>
      requested.some(r => m.id.includes(r) || m.name.toLowerCase().includes(r.toLowerCase()))
    );
    if (modelsToTest.length === 0) {
      console.error('No matching models found. Available:');
      allModels.forEach(m => console.error(`  - ${m.name}  (${m.id})`));
      process.exit(1);
    }
  }

  // Run directory
  let runDir;
  let state;
  if (opts.resume) {
    runDir = resolve(opts.resume);
    if (!existsSync(runDir)) {
      console.error(`Resume directory not found: ${runDir}`);
      process.exit(1);
    }
    state = loadState(runDir);
  } else {
    runDir = resolve('tests-ai', `multiturn-run-${timestamp()}`);
    mkdirSync(runDir, { recursive: true });
    state = { completed: [], failed: [], skipped: [] };
  }

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  CF Workers AI — Multi-Turn Consistency Test                ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Worker URL:    ${workerUrl}`);
  console.log(`  Run directory: ${runDir}`);
  console.log(`  Scenario:      The Cursed Village (10 turns)`);
  console.log(`  Models:        ${modelsToTest.length} selected`);
  console.log(`  Halt on fail:  ${haltOnFail ? 'YES' : 'NO'}`);
  console.log(`  Timeout:       ${timeoutSec}s per turn`);
  console.log('');

  const allModelResults = [];

  for (let mi = 0; mi < modelsToTest.length; mi++) {
    const model = modelsToTest[mi];

    // Skip if already completed (resume)
    if (state.completed.includes(model.id)) {
      console.log(`  [${mi + 1}/${modelsToTest.length}] ${model.name} — SKIPPED (already completed)\n`);
      allModelResults.push({ model, turnResults: [], crossTurnScores: { consistency: 0, tone: 0, milestoneTracking: 0, combatHandling: 0, npcCharacterization: 0 } });
      continue;
    }

    console.log('════════════════════════════════════════════════════════════════');
    console.log(`  [${mi + 1}/${modelsToTest.length}] ${model.name}`);
    console.log(`  Model ID: ${model.id}`);
    console.log(`  Tier:     ${model.tier}`);
    console.log('════════════════════════════════════════════════════════════════\n');

    let currentSummary = INITIAL_SUMMARY;
    const turnResults = [];
    let modelFailed = false;

    for (const turn of TURNS) {
      const prompt = buildTurnPrompt(turn, currentSummary);

      process.stdout.write(`  Turn ${turn.turnNumber}/10: ${turn.label}... `);

      const result = await callWorker(workerUrl, model.id, prompt, 1600, 0.7, timeoutSec * 1000);

      if (!result.success) {
        console.log(`FAILED: ${result.error?.slice(0, 80)}`);
        turnResults.push({
          turnNumber: turn.turnNumber,
          label: turn.label,
          type: turn.type,
          success: false,
          error: result.error,
          latencyMs: result.latencyMs,
          text: null,
          quality: { checks: [], passed: 0, total: 0, score: 0 },
        });
        modelFailed = true;
        break;
      }

      const quality = runPerTurnChecks(result.text, turn);
      const wordCount = result.text.split(/\s+/).length;
      const preview = result.text.slice(0, 120).replace(/\n/g, ' ') + '...';

      console.log(`${result.latencyMs}ms, ${wordCount} words, quality: ${quality.score}%`);

      turnResults.push({
        turnNumber: turn.turnNumber,
        label: turn.label,
        type: turn.type,
        success: true,
        text: result.text,
        latencyMs: result.latencyMs,
        quality,
      });

      // Update rolling summary
      currentSummary = buildSummary(currentSummary, turn, result.text);

      // Rate limiting
      await new Promise(r => setTimeout(r, 500));
    }

    // Cross-turn scoring
    const crossTurnScores = runCrossTurnChecks(turnResults);
    const crossTotal = Object.values(crossTurnScores).reduce((a, b) => a + b, 0);

    console.log('');
    console.log(`  Cross-turn scores:`);
    console.log(`    Consistency:        ${crossTurnScores.consistency}/5`);
    console.log(`    Tone:               ${crossTurnScores.tone}/5`);
    console.log(`    Milestone Tracking: ${crossTurnScores.milestoneTracking}/5`);
    console.log(`    Combat Handling:    ${crossTurnScores.combatHandling}/5`);
    console.log(`    NPC Characterization: ${crossTurnScores.npcCharacterization}/5`);
    console.log(`    TOTAL:              ${crossTotal}/25 ${crossTotal >= 20 ? '(PASS)' : crossTotal >= 16 ? '(MINIMUM)' : '(FAIL)'}`);
    console.log('');

    // Write per-model report
    writeModelReport(runDir, model, turnResults, crossTurnScores);
    console.log(`  Report: ${modelSlug(model)}-multiturn.md\n`);

    // Update state
    if (modelFailed) {
      state.failed.push(model.id);
    } else {
      state.completed.push(model.id);
    }
    saveState(runDir, state);

    allModelResults.push({ model, turnResults, crossTurnScores });

    // Halt on failure
    if (modelFailed && haltOnFail) {
      console.log(`  Halting due to failure. Use --no-halt to continue.\n`);
      break;
    }

    // Pause between models
    if (mi < modelsToTest.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // Write summary
  writeSummary(runDir, modelsToTest, allModelResults, state);

  console.log('════════════════════════════════════════════════════════════════');
  console.log('  MULTI-TURN TEST COMPLETE');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`  Run directory:  ${runDir}`);
  console.log(`  Summary:        summary.md`);
  console.log(`  Completed:      ${state.completed.length}`);
  console.log(`  Failed:         ${state.failed.length}`);
  console.log(`  Skipped:        ${state.skipped.length}`);
  console.log('');
  console.log('  Results by model:');
  for (const { model, crossTurnScores } of allModelResults) {
    const total = Object.values(crossTurnScores).reduce((a, b) => a + b, 0);
    if (state.completed.includes(model.id)) {
      console.log(`    ${model.name}: ${total}/25 ${total >= 20 ? '(PASS)' : total >= 16 ? '(MIN)' : '(FAIL)'}`);
    } else if (state.failed.includes(model.id)) {
      console.log(`    ${model.name}: FAILED`);
    } else {
      console.log(`    ${model.name}: SKIPPED`);
    }
  }
  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
