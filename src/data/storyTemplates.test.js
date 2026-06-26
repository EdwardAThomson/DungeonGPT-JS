import { storyTemplates } from './storyTemplates';

describe('storyTemplates — Phase 2b biome theme', () => {
  const playable = storyTemplates.filter((t) => !t.comingSoon);

  it('ships exactly one desert-themed adventure with settings.theme = "desert"', () => {
    const desert = storyTemplates.filter((t) => t?.settings?.theme === 'desert');
    expect(desert).toHaveLength(1);
    expect(desert[0].id).toBe('desert-expedition-t1');
    expect(desert[0].tier).toBe(1); // tier 1 so it appears in the starter list
  });

  it('the desert template still carries the data the milestone/map systems need', () => {
    const desert = storyTemplates.find((t) => t.id === 'desert-expedition-t1');
    expect(desert.customNames.towns.length).toBeGreaterThan(0);
    expect(desert.customNames.mountains.length).toBeGreaterThan(0);
    expect(desert.settings.milestones.length).toBeGreaterThan(0);
  });

  it('back-compat: every other playable template omits a biome theme (defaults to grassland)', () => {
    playable
      .filter((t) => t.id !== 'desert-expedition-t1')
      .forEach((t) => {
        expect(t.settings?.theme).toBeUndefined();
      });
  });
});
