// Drift guard for docs/CAMPAIGN_MILESTONES.md.
//
// The doc is GENERATED from storyTemplates by scripts/gen-campaign-milestones.mjs.
// This test rebuilds the markdown from the same pure builder (no esbuild shell-out:
// under Jest/CRA babel, storyTemplates imports fine because require.context is
// undefined, exactly as the content-audit test loads it) and byte-compares it to the
// committed file. If someone edits a template without running `npm run docs:campaigns`,
// this fails and tells them how to fix it.
//
// A handful of invariant assertions document the specific facts the doc must reflect,
// so a regression is legible even before the byte diff is read.

import fs from 'fs';
import path from 'path';
import { buildCampaignMilestonesMarkdown } from './campaignMilestonesDoc';
import { storyTemplates } from './storyTemplates';

const DOC_PATH = path.resolve(__dirname, '..', '..', 'docs', 'CAMPAIGN_MILESTONES.md');

describe('CAMPAIGN_MILESTONES.md generation', () => {
  const generated = buildCampaignMilestonesMarkdown(storyTemplates);

  it('matches the committed doc byte-for-byte (run `npm run docs:campaigns` if this fails)', () => {
    const committed = fs.readFileSync(DOC_PATH, 'utf8');
    if (committed !== generated) {
      throw new Error(
        'docs/CAMPAIGN_MILESTONES.md is out of date with src/data/storyTemplates.js.\n' +
          'Regenerate it with:  npm run docs:campaigns\n'
      );
    }
    expect(committed).toBe(generated);
  });

  it('is deterministic (building twice yields the same string)', () => {
    expect(buildCampaignMilestonesMarkdown(storyTemplates)).toBe(generated);
  });

  it('documents every playable campaign', () => {
    const playable = storyTemplates.filter(
      (t) => t.settings && Array.isArray(t.settings.milestones) && t.settings.milestones.length > 0
    );
    expect(playable.length).toBeGreaterThan(0);
    for (const t of playable) {
      expect(generated).toContain(`### ${t.id}: "${t.subtitle}"`);
    }
  });

  it('shows frozen-frontier-t2 opening with exactly 2 co-active milestones', () => {
    // Data invariant: M1 and M2 have requires:[]; M3 now requires [1,2].
    expect(generated).toMatch(/\| frozen-frontier-t2 \| member \| 2 \| 3-5 \| 5 \| 2 \(M1, M2\) \|/);
  });

  it('shows the two retyped beats as type `talk`', () => {
    // heroic-fantasy-t2 M2 and desert-expedition-t1 M2 are talk milestones now.
    expect(generated).toContain('| 2 | talk | Convince the Thornfield Guard to join the resistance |');
    expect(generated).toContain('| 2 | talk | Win the trust of the well-keeper at Oasis Karn |');
  });
});
