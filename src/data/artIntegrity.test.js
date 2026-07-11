// Art integrity guard: every image/icon path declared in game DATA must exist on disk,
// and every playable template must have its card art (NewGame renders
// /assets/templates/<id>.webp by convention, falling back to a bare gradient).
// Found the hard way: 9 of 10 template bosses shipped pointing at a dagger ITEM icon,
// and two premium template cards were never generated. KNOWN_MISSING pins the gaps that
// are queued for generation (docs/IMAGE_GENERATION_PROMPTS.md) — remove entries as art
// lands; a NEW missing file fails immediately.

import fs from 'fs';
import path from 'path';
import { storyTemplates } from './storyTemplates';

const PUBLIC = path.join(__dirname, '..', '..', 'public');
const exists = (rel) => fs.existsSync(path.join(PUBLIC, rel.replace(/^\//, '')));

// Template cards queued for generation (premium biome adventures shipped without cards;
// they currently render the gradient fallback).
const KNOWN_MISSING_CARDS = [];

// Data-declared art paths that are queued for generation in
// docs/IMAGE_GENERATION_PROMPTS.md but not yet on disk. The maintainer generates
// these via the Gemini pipeline and drops the file in; remove the entry as each
// file lands. A NEW undeclared gap still fails immediately. Paths are matched
// exactly as they appear in source (leading slash preserved where present).
const KNOWN_MISSING_ASSETS = [
  '/assets/encounters/city_arrival.webp',     // Generic settlement arrival art, queued (docs/IMAGE_GENERATION_PROMPTS.md)
  '/assets/encounters/town_arrival.webp',     // Generic settlement arrival art, queued
  '/assets/encounters/village_arrival.webp',  // Generic settlement arrival art, queued
  '/assets/encounters/hamlet_arrival.webp',   // Generic settlement arrival art, queued
];

// Data source files whose string literals declare art paths.
const DATA_SOURCES = [
  'src/data/storyTemplates.js',
  'src/data/questEnemies.js',
  'src/data/sideQuests.js',
  'src/utils/inventorySystem.js',
  'src/game/worldMoveController.js', // POI arrival images (playtest 2026-07-06: these silently 404'd when they pointed at queued-but-ungenerated art)
  ...fs.readdirSync(path.join(__dirname, 'encounters'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => `src/data/encounters/${f}`)
];

const extractPaths = (file) => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8');
  return [...src.matchAll(/['"](\/?assets\/[\w\-./]+\.(?:webp|png|jpg|jpeg|svg))['"]/g)]
    .map((m) => m[1]);
};

describe('art integrity — declared asset paths exist on disk', () => {
  test.each(DATA_SOURCES)('%s', (file) => {
    const known = new Set(KNOWN_MISSING_ASSETS);
    const missing = [...new Set(extractPaths(file))].filter((p) => !exists(p) && !known.has(p));
    expect(missing).toEqual([]);
  });

  test('every playable template has card art (or is pinned as queued)', () => {
    const playable = storyTemplates.filter((t) => !t.comingSoon);
    const missing = playable
      .map((t) => t.id)
      .filter((id) => !exists(`assets/templates/${id}.webp`));
    expect(missing.sort()).toEqual([...KNOWN_MISSING_CARDS].sort());
  });

  test('coming-soon template cards exist too (they render locked in the picker)', () => {
    const stubs = storyTemplates.filter((t) => t.comingSoon);
    const missing = stubs.map((t) => t.id).filter((id) => !exists(`assets/templates/${id}.webp`));
    expect(missing).toEqual([]);
  });
});
