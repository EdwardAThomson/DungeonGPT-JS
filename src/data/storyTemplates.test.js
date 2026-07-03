import { storyTemplates } from './storyTemplates';
import { ITEM_CATALOG } from '../utils/inventorySystem';

describe('storyTemplates — biome-themed (premium) adventures', () => {
  const playable = storyTemplates.filter((t) => !t.comingSoon);

  // The biome-themed (premium) adventures that currently ship: a t1 + t2 chain per
  // biome (#50). Update this list when a new themed-region template lands so the
  // back-compat assertion below stays honest.
  const BIOME_THEMED = [
    { id: 'desert-expedition-t1', theme: 'desert' },
    { id: 'desert-expedition-t2', theme: 'desert' },
    { id: 'frozen-frontier-t1', theme: 'snow' },
    { id: 'frozen-frontier-t2', theme: 'snow' },
  ];

  it('ships exactly the desert chain (t1 + t2) with settings.theme = "desert"', () => {
    const desert = storyTemplates.filter((t) => t?.settings?.theme === 'desert');
    expect(desert.map((t) => t.id).sort()).toEqual(['desert-expedition-t1', 'desert-expedition-t2']);
    expect(desert.find((t) => t.id === 'desert-expedition-t1').tier).toBe(1); // tier 1 so it appears in the starter list
    expect(desert.find((t) => t.id === 'desert-expedition-t2').tier).toBe(2); // the in-save sequel band
    desert.forEach((t) => expect(t.premium).toBe(true)); // premium biome → premium adventures
  });

  it('ships exactly the snow chain (t1 + t2) with settings.theme = "snow"', () => {
    const snow = storyTemplates.filter((t) => t?.settings?.theme === 'snow');
    expect(snow.map((t) => t.id).sort()).toEqual(['frozen-frontier-t1', 'frozen-frontier-t2']);
    expect(snow.find((t) => t.id === 'frozen-frontier-t1').tier).toBe(1); // tier 1 so it appears in the starter list
    expect(snow.find((t) => t.id === 'frozen-frontier-t2').tier).toBe(2); // the in-save sequel band
    snow.forEach((t) => expect(t.premium).toBe(true)); // premium biome → premium adventures
  });

  it('ships exactly four biome-themed adventures in total (desert + snow, t1 + t2 each)', () => {
    const themed = storyTemplates.filter((t) => t?.settings?.theme);
    expect(themed).toHaveLength(4);
  });

  it('the biome t2 sequels serve the Lv 3-5 band their t1s strand parties in', () => {
    ['desert-expedition-t2', 'frozen-frontier-t2'].forEach((id) => {
      const t = storyTemplates.find((x) => x.id === id);
      expect(t.comingSoon).toBeUndefined();
      expect(t.tier).toBe(2);
      expect(t.levelRange).toEqual([3, 5]);
    });
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

  // Regression lint for the "authored but never consumed" family: every item milestone
  // must be collectible by one of the two shipped paths — a quest BUILDING in a named
  // town (building-search path), or a WILDERNESS spawn location in customNames.mountains
  // (the Gather-on-arrival path via getMilestoneItemForTile). An item milestone matching
  // neither would be un-completable (the Grey Moors herbs bug).
  it('every item milestone is collectible (town building or named wilderness location)', () => {
    playable.forEach((t) => {
      const townNames = (t.customNames?.towns || []).map((e) => (typeof e === 'string' ? e : e.name));
      const mountainNames = t.customNames?.mountains || [];
      (t.settings?.milestones || [])
        .filter((m) => m.type === 'item')
        .forEach((m) => {
          const viaBuilding = !!m.building && townNames.includes(m.building.location);
          const loc = m.spawn?.location || m.location;
          const viaWilderness = !m.building && mountainNames.includes(loc);
          if (!(viaBuilding || viaWilderness)) {
            throw new Error(`${t.id} milestone #${m.id} ("${m.text}") is an item milestone with no collection path (no town building, no named wilderness location)`);
          }
        });
    });
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

  // Same-world sequel invariants (QUEST_CHAINING_PLAN): heroic-fantasy-t2 is
  // re-authored onto t1's geography so a completed t1 save can continue it
  // in-save. If either template's geography drifts, in-save continuation of the
  // flagship chain silently breaks, so lock it down here.
  describe('heroic-fantasy-t2 is a same-world sequel to t1', () => {
    const hf1 = storyTemplates.find((x) => x.id === 'heroic-fantasy-t1');
    const hf2 = storyTemplates.find((x) => x.id === 'heroic-fantasy-t2');
    const nameOf = (e) => (typeof e === 'string' ? e : e.name);

    it('reuses t1 customNames exactly (towns, sizes and mountains)', () => {
      expect(hf2.customNames).toEqual(hf1.customNames);
    });

    it('authors every milestone at a location that exists in the shared geography', () => {
      const known = [
        ...hf1.customNames.towns.map(nameOf),
        ...hf1.customNames.mountains,
      ];
      hf2.settings.milestones.forEach((m) => {
        expect(known).toContain(m.location);
        if (m.spawn?.location) expect(known).toContain(m.spawn.location);
        if (m.building?.location) expect(known).toContain(m.building.location);
      });
    });

    it('avoids t1 quest venues so cached-town retro-injection never collides', () => {
      const t1Venues = hf1.settings.milestones
        .filter((m) => m.building)
        .map((m) => `${m.building.location}:${m.building.type}`);
      hf2.settings.milestones
        .filter((m) => m.building)
        .forEach((m) => {
          expect(t1Venues).not.toContain(`${m.building.location}:${m.building.type}`);
        });
    });

    it('carries no remnants of the retired Eldoria geography anywhere in its text', () => {
      const blob = JSON.stringify(hf2);
      ['Eldoria', 'Oakhaven', 'Silverton', 'Cinder Mountains', 'Silver Guard'].forEach((old) => {
        expect(blob).not.toContain(old);
      });
    });
  });

  // Same-world sequel invariants for the biome chains (#50, mirroring the
  // heroic-fantasy lock above): each premium-genre t2 is authored onto its t1's
  // geography so a completed t1 save offers it under "Continue here". If either
  // side's geography drifts, in-save continuation silently breaks.
  describe.each([
    ['desert-expedition', 'desert'],
    ['frozen-frontier', 'snow'],
  ])('%s-t2 is a same-world sequel to its t1', (chain, biome) => {
    const t1 = storyTemplates.find((x) => x.id === `${chain}-t1`);
    const t2 = storyTemplates.find((x) => x.id === `${chain}-t2`);
    const nameOf = (e) => (typeof e === 'string' ? e : e.name);

    it('reuses t1 customNames exactly (towns, sizes and mountains)', () => {
      expect(t2.customNames).toEqual(t1.customNames);
    });

    it('keeps the t1 world biome so the sequel spawns into the same terrain', () => {
      expect(t2.settings.theme).toBe(biome);
      expect(t2.settings.theme).toBe(t1.settings.theme);
    });

    it('shares its t1 chain genre so campaignChain recommends it as the next tier', () => {
      expect(t2.theme).toBe(t1.theme);
      expect(t2.theme).toBe(chain); // the chain IS the genre, distinct from heroic-fantasy
      expect(t2.premium).toBe(true);
    });

    it('authors every milestone at a location that resolves in the shared geography', () => {
      const known = [
        ...t1.customNames.towns.map(nameOf),
        ...t1.customNames.mountains,
      ];
      t2.settings.milestones.forEach((m) => {
        expect(known).toContain(m.location);
        if (m.spawn?.location) expect(known).toContain(m.spawn.location);
        if (m.building?.location) expect(known).toContain(m.building.location);
      });
    });

    it('avoids t1 quest venues so cached-town retro-injection never collides', () => {
      const t1Venues = t1.settings.milestones
        .filter((m) => m.building)
        .map((m) => `${m.building.location}:${m.building.type}`);
      t2.settings.milestones
        .filter((m) => m.building)
        .forEach((m) => {
          expect(t1Venues).not.toContain(`${m.building.location}:${m.building.type}`);
        });
    });

    it('spawns fresh ids (POIs, NPCs, enemies) that never shadow t1 spawns in the shared world', () => {
      const t1SpawnIds = new Set(
        t1.settings.milestones.map((m) => m.spawn?.id).filter(Boolean)
      );
      t2.settings.milestones.forEach((m) => {
        if (m.spawn?.id) expect(t1SpawnIds.has(m.spawn.id)).toBe(false);
      });
    });
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
