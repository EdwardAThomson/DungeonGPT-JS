import { storyTemplates } from './storyTemplates';
import { ITEM_CATALOG } from '../utils/inventorySystem';

describe('storyTemplates — biome-themed (premium) adventures', () => {
  const playable = storyTemplates.filter((t) => !t.comingSoon);

  // The only two biome-themed (premium) adventures that currently ship. Update this list
  // when a new themed-region template lands so the back-compat assertion below stays honest.
  const BIOME_THEMED = [
    { id: 'desert-expedition-t1', theme: 'desert' },
    { id: 'frozen-frontier-t1', theme: 'snow' },
  ];

  it('ships exactly one desert-themed adventure with settings.theme = "desert"', () => {
    const desert = storyTemplates.filter((t) => t?.settings?.theme === 'desert');
    expect(desert).toHaveLength(1);
    expect(desert[0].id).toBe('desert-expedition-t1');
    expect(desert[0].tier).toBe(1); // tier 1 so it appears in the starter list
  });

  it('ships exactly one snow-themed adventure with settings.theme = "snow"', () => {
    const snow = storyTemplates.filter((t) => t?.settings?.theme === 'snow');
    expect(snow).toHaveLength(1);
    expect(snow[0].id).toBe('frozen-frontier-t1');
    expect(snow[0].tier).toBe(1); // tier 1 so it appears in the starter list
    expect(snow[0].premium).toBe(true); // premium biome → premium adventure
  });

  it('ships exactly two biome-themed adventures in total (desert + snow)', () => {
    const themed = storyTemplates.filter((t) => t?.settings?.theme);
    expect(themed).toHaveLength(2);
  });

  it('the desert template still carries the data the milestone/map systems need', () => {
    const desert = storyTemplates.find((t) => t.id === 'desert-expedition-t1');
    expect(desert.customNames.towns.length).toBeGreaterThan(0);
    expect(desert.customNames.mountains.length).toBeGreaterThan(0);
    expect(desert.settings.milestones.length).toBeGreaterThan(0);
  });

  it('the snow template carries the data the milestone/map systems need', () => {
    const snow = storyTemplates.find((t) => t.id === 'frozen-frontier-t1');
    expect(snow.customNames.towns.length).toBeGreaterThan(0);
    expect(snow.customNames.mountains.length).toBeGreaterThan(0);
    expect(snow.settings.milestones.length).toBeGreaterThan(0);
    // The starting village is size-tagged so the generator honours "the village of Hearthmere".
    const hearthmere = snow.customNames.towns.find(
      (t) => (typeof t === 'object' ? t.name : t) === 'Hearthmere'
    );
    expect(hearthmere).toMatchObject({ name: 'Hearthmere', size: 'village' });
  });

  it('back-compat: every non-biome-themed playable template omits a biome theme (defaults to grassland)', () => {
    const themedIds = BIOME_THEMED.map((t) => t.id);
    playable
      .filter((t) => !themedIds.includes(t.id))
      .forEach((t) => {
        expect(t.settings?.theme).toBeUndefined();
      });
  });
});

describe('storyTemplates — structural integrity', () => {
  const playable = storyTemplates.filter((t) => !t.comingSoon);

  it('every template has a unique id', () => {
    const ids = storyTemplates.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Collect every item id referenced anywhere in a playable template's rewards
  // (milestone rewards + inline encounter rewards) and assert each exists in the catalog.
  const collectItemIds = (template) => {
    const ids = [];
    (template.settings?.milestones || []).forEach((m) => {
      (m.rewards?.items || []).forEach((i) => ids.push(i));
      (m.encounter?.rewards?.items || []).forEach((i) => ids.push(i));
    });
    return ids;
  };

  it('every reward item id references a real ITEM_CATALOG entry', () => {
    playable.forEach((t) => {
      collectItemIds(t).forEach((itemId) => {
        expect(ITEM_CATALOG[itemId]).toBeDefined();
      });
    });
  });

  it('Tier 1 templates never award very_rare or legendary items', () => {
    playable
      .filter((t) => t.tier === 1)
      .forEach((t) => {
        collectItemIds(t).forEach((itemId) => {
          const rarity = ITEM_CATALOG[itemId]?.rarity;
          expect(['very_rare', 'legendary']).not.toContain(rarity);
        });
      });
  });

  it("every 'talk' milestone carries an npc trigger matching its authored NPC spawn", () => {
    playable.forEach((t) => {
      (t.settings?.milestones || [])
        .filter((m) => m.type === 'talk')
        .forEach((m) => {
          expect(m.trigger?.npc).toBeTruthy();
          expect(m.spawn?.type).toBe('npc');
          expect(m.spawn?.id).toBe(m.trigger.npc); // Talk button fires spawn.id as npcId
        });
    });
  });

  it('heroic-fantasy-t1 milestone #2 is a deterministic talk milestone (Option C)', () => {
    const t = storyTemplates.find((x) => x.id === 'heroic-fantasy-t1');
    const m2 = t.settings.milestones.find((m) => m.id === 2);
    expect(m2.type).toBe('talk');
    expect(m2.trigger).toEqual({ npc: 'militia_captain', action: 'talk' });
    expect(m2.spawn.id).toBe('militia_captain');
  });

  it('every combat milestone carries a well-formed inline encounter', () => {
    playable.forEach((t) => {
      (t.settings?.milestones || [])
        .filter((m) => m.type === 'combat')
        .forEach((m) => {
          expect(m.encounter).toBeDefined();
          expect(typeof m.encounter.enemyHP).toBe('number');
          expect(m.encounter.suggestedActions.length).toBeGreaterThanOrEqual(3);
          const c = m.encounter.consequences;
          expect(c.criticalSuccess).toBeTruthy();
          expect(c.success).toBeTruthy();
          expect(c.failure).toBeTruthy();
          expect(c.criticalFailure).toBeTruthy();
        });
    });
  });
});
