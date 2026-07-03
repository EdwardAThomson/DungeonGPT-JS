import { composeChapterPrologue } from './prologueComposer';
import { specFromTemplate } from './campaignLauncher';
import { storyTemplates } from '../data/storyTemplates';

const t2Spec = () => specFromTemplate(storyTemplates.find((t) => t.id === 'heroic-fantasy-t2'));

const party = [
  { heroName: 'Vanya', characterName: 'Vanya', characterClass: 'Warrior', level: 3 },
  { heroName: 'Orin', characterName: 'Orin', characterClass: 'Mage', level: 2 },
];

describe('composeChapterPrologue (in-save chapter divider)', () => {
  it('opens with the chapter header including the campaign subtitle', () => {
    const text = composeChapterPrologue({ spec: t2Spec(), chapter: 2, party });
    expect(text.startsWith('**Chapter 2: Crown of Sunfire**')).toBe(true);
  });

  it('carries the new campaign opening: description, goal and first steps', () => {
    const spec = t2Spec();
    const text = composeChapterPrologue({ spec, chapter: 2, party });
    expect(text).toContain(spec.shortDescription);
    expect(text).toContain(`**Goal:** ${spec.campaignGoal}`);
    expect(text).toContain(`**First steps:** ${spec.milestones[0].text}`);
  });

  it('has NO "story so far" recap: the ongoing journal IS the story', () => {
    const text = composeChapterPrologue({ spec: t2Spec(), chapter: 2, party });
    expect(text).not.toMatch(/story so far/i);
  });

  it('is deterministic: same inputs, byte-identical prose', () => {
    const a = composeChapterPrologue({ spec: t2Spec(), chapter: 3, party });
    const b = composeChapterPrologue({ spec: t2Spec(), chapter: 3, party });
    expect(a).toBe(b);
    expect(a).toContain('**Chapter 3');
  });

  it('degrades gracefully with minimal inputs', () => {
    const text = composeChapterPrologue({});
    expect(text).toContain('**Chapter 2**');
    expect(text).toContain('The party');
  });
});
