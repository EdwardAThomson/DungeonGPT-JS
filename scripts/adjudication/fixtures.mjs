// Shared helpers for the typed-decision eval fixtures (docs/TYPED_DECISION_EVAL_PLAN.md).
//
// A fixture file is JSONL, one turn per line:
//   { id, source, context, summary?, player_text, targets, context_ref?, notes?, ... }
// `context` is the rendered [CONTEXT] block the narrator saw (pilot fixtures come from
// harness transcripts, which only have the rendered prompt; real turns from turn_log will
// carry structured state instead). A turn may set `context_ref` to another fixture's id
// to reuse its scene; resolveFixtures() fills `context`/`targets` in from it.
//
// Labels live in a separate `<fixtures>.labels.jsonl` (see label-turns.mjs) so fixtures
// can be regenerated without losing labelling work.
//
// Everything under harness-transcripts/ is gitignored: labelled turns are never committed.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const turnsDir = path.join(repoRoot, 'harness-transcripts', 'turns');

// The typed questions (plan §2). Q5 options are filled from src/utils/rules.js SKILLS at
// runtime (loadSkills) so the list cannot drift from the game; Q3 options are per turn.
export const CHECK_TIERS = ['trivial', 'easy', 'medium', 'hard', 'deadly'];
export const QUESTIONS = [
  { key: 'q1', text: 'What kind of message is this?', type: 'choice',
    options: ['action', 'npc_dialogue', 'world_question', 'ooc', 'clarification'] },
  { key: 'q2', text: 'Action category', type: 'choice', onlyIf: 'action',
    options: ['move', 'attack', 'interact', 'persuade', 'stealth', 'investigate', 'other'] },
  { key: 'q3', text: 'Target', type: 'target' },
  { key: 'q4', text: 'Does this need a skill check?', type: 'yesno', onlyIf: 'action' },
  { key: 'q5', text: 'Which skill', type: 'skill', onlyIf: 'check' },
  { key: 'q6', text: 'Difficulty', type: 'choice', onlyIf: 'check', options: CHECK_TIERS },
  { key: 'q7', text: 'Impossible given the state?', type: 'yesno', onlyIf: 'action' },
];

export const shortHash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 10);

export function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l, i) => {
    try { return JSON.parse(l); } catch (e) { throw new Error(`${file}:${i + 1}: ${e.message}`); }
  });
}

export function writeJsonl(file, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
}

// Candidate targets for Q3, pulled from the rendered context: authored milestone NPCs
// ("speak with Captain Ulric (Guard)") and placed townsfolk ("Present here: ..." /
// "Notable townsfolk: ..."). Pilot fixtures have names only; real turns will use the
// id-bearing roster from turnContext.buildNpcRoster instead.
export function extractTargets(context = '') {
  const names = new Set();
  for (const m of context.matchAll(/speak with ([^(;\n—]+?)(?: \(|;|$| at )/g)) names.add(m[1].trim());
  for (const m of context.matchAll(/(?:Present here|Notable townsfolk): ([^\n]+?)\.(?: |$)/g)) {
    for (const part of m[1].split(';')) {
      const name = part.split(' (')[0].split(' — ')[0].trim();
      if (name) names.add(name);
    }
  }
  return [...names];
}

// Fill context/targets for turns that reuse another fixture's scene via context_ref.
export function resolveFixtures(rows, pools = []) {
  const byId = new Map();
  for (const r of [...pools.flat(), ...rows]) byId.set(r.id, r);
  return rows.map((r) => {
    if (!r.context_ref) return { ...r, targets: r.targets || extractTargets(r.context) };
    const base = byId.get(r.context_ref);
    if (!base) throw new Error(`${r.id}: unknown context_ref ${r.context_ref}`);
    const context = r.context || base.context;
    return { ...r, context, summary: r.summary ?? base.summary, template: r.template || base.template,
      targets: r.targets || extractTargets(context) };
  });
}

// SKILLS keys straight from the game (src/utils/rules.js has no imports but is CRA ESM,
// which plain node won't load as .js; read the object literal instead of bundling).
export function loadSkills() {
  const src = fs.readFileSync(path.join(repoRoot, 'src', 'utils', 'rules.js'), 'utf8');
  const block = src.match(/export const SKILLS = \{([\s\S]*?)\};/);
  if (!block) throw new Error('SKILLS not found in src/utils/rules.js');
  return [...block[1].matchAll(/'([^']+)':/g)].map((m) => m[1]).filter((k) => k !== 'Initiative');
}
