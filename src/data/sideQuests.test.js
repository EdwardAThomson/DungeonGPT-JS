// sideQuests.test.js — pool-shape guards for the side-quest data (#45/#50).
// Checks the pool's own completability rules (header comment of sideQuests.js /
// docs/SIDE_QUEST_POOL.md): site objectives are site-bound to cave/ruins,
// overworld combat is count-of-any, gather targets have live drop sources,
// rewards reference real catalog items, and the minLevel curve actually serves
// the mid/top bands. Dice-rolling balance checks live in progressionLint.test.js.

import { SIDE_QUESTS, QUEST_ITEM_ICON_FROM, SIDE_QUEST_BOSSES, initialSideQuests } from './sideQuests';
import { ITEM_CATALOG } from '../utils/inventorySystem';
import { describeItemSources } from '../game/questHints';

const questTotalXp = (q) =>
  q.milestones.reduce((sum, m) => sum + (m.rewards?.xp || 0), 0) + (q.rewards?.xp || 0);

// world sites that can hold a quest objective: hidden cave/ruins plus the open-air sites
const SITE_TYPES = ['cave', 'ruins', 'forest', 'hills', 'mountain'];

describe('side-quest pool size and minLevel distribution (#45/#50)', () => {
  test('pool size', () => {
    expect(SIDE_QUESTS.length).toBe(91);
  });

  test('quest ids are unique', () => {
    const ids = SIDE_QUESTS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('minLevel distribution: the mid/top band is no longer starved', () => {
    const dist = {};
    SIDE_QUESTS.forEach((q) => { dist[q.minLevel || 1] = (dist[q.minLevel || 1] || 0) + 1; });
    // Exact pin: expanding or retiring quests should update this consciously.
    // 2026-07-05: +6 water-town quests (#65 Phase 6): 1: +2, 2: +3, 3: +1.
    // 2026-10-06: +7 multi-step quests: 2: +1, 3: +3, 4: +1, 5: +1, 6: +1.
    // 2026-10-06: +21 trade, law and open-country quests: 1: +8, 2: +3, 3: +4, 4: +3, 5: +2, 6: +1.
    // 2026-10-06: +10 desert/snow quests: 1: +2, 2: +3, 3: +2, 4: +2, 5: +1.
    expect(dist).toEqual({ 1: 23, 2: 23, 3: 21, 4: 10, 5: 9, 6: 4, 7: 1 });
    // The #50 headline: a healthy share of the pool is reserved for Lv 3+.
    const midTop = SIDE_QUESTS.filter((q) => (q.minLevel || 1) >= 3).length;
    expect(midTop).toBeGreaterThanOrEqual(18);
    // And the future t3 band (Lv 6-7) has dedicated content.
    expect(SIDE_QUESTS.filter((q) => (q.minLevel || 1) >= 6).length).toBeGreaterThanOrEqual(3);
  });

  test('every band 1-7 has at least 3 quests in reach (guard-a mirror)', () => {
    for (let level = 1; level <= 7; level++) {
      const inReach = SIDE_QUESTS.filter((q) => (q.minLevel || 1) <= level).length;
      expect(inReach).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('builder well-formedness', () => {
  test.each(SIDE_QUESTS.map((q) => [q.id, q]))('%s', (id, q) => {
    expect(typeof q.title).toBe('string');
    expect(q.title.length).toBeGreaterThan(0);
    expect(typeof q.description).toBe('string');
    expect(q.minLevel).toBeGreaterThanOrEqual(1);
    expect(q.minLevel).toBeLessThanOrEqual(7);
    expect(q.status).toBe('available');

    // giver: a real hook at one or more named buildings
    const giverBuildings = Array.isArray(q.giver.building) ? q.giver.building : [q.giver.building];
    expect(giverBuildings.length).toBeGreaterThan(0);
    giverBuildings.forEach((b) => expect(typeof b).toBe('string'));
    expect(typeof q.giver.hook).toBe('string');

    // milestones: unique step ids, valid requires, the last step is the final turn-in
    expect(q.milestones.length).toBeGreaterThanOrEqual(1);
    const stepIds = q.milestones.map((m) => m.id);
    expect(new Set(stepIds).size).toBe(stepIds.length);
    q.milestones.forEach((m) => {
      expect(m.completed).toBe(false);
      expect(typeof m.text).toBe('string');
      (m.requires || []).forEach((rid) => expect(stepIds).toContain(rid));
      expect(typeof (m.rewards?.xp)).toBe('number');
    });
    const last = q.milestones[q.milestones.length - 1];
    expect(last.trigger?.turnIn).toBeTruthy();
    // the final hand-in waits on every other step
    q.milestones.slice(0, -1).forEach((m) => expect(last.requires).toContain(m.id));
    q.milestones.filter((m) => m.trigger?.turnIn).forEach((m) => {
      const buildings = Array.isArray(m.trigger.turnIn.building) ? m.trigger.turnIn.building : [m.trigger.turnIn.building];
      buildings.forEach((b) => expect(typeof b).toBe('string'));
    });

    // objective steps carry a matching event trigger
    q.milestones.filter((m) => !m.trigger?.turnIn).forEach((m) => {
      if (m.type === 'item') expect(typeof m.trigger.item).toBe('string');
      if (m.type === 'combat') expect(typeof m.trigger.enemy).toBe('string');
      if (m.type === 'location') expect(typeof m.trigger.location).toBe('string');
    });
  });
});

describe('completability rules (docs/SIDE_QUEST_POOL.md)', () => {
  const objectiveSteps = SIDE_QUESTS.flatMap((q) =>
    q.milestones.filter((m) => !m.trigger?.turnIn).map((m) => [q.id, m]));

  test('site objectives bind only to gatable site types, with consistent ids', () => {
    objectiveSteps.forEach(([, m]) => {
      if (!m.site) return;
      expect(SITE_TYPES).toContain(m.site.type);
      expect(m.site.objectiveType).toBe(m.type);
      const triggerId = m.trigger.item || m.trigger.enemy || m.trigger.location;
      expect(m.site.id).toBe(triggerId);
      expect(typeof m.site.name).toBe('string');
    });
  });

  test('overworld (non-site) combat is always count-of-any', () => {
    objectiveSteps.forEach(([, m]) => {
      if (m.type !== 'combat' || m.site) return;
      expect(m.trigger.enemy).toBe('any');
      expect(m.trigger.count).toBeGreaterThanOrEqual(1);
    });
  });

  test('non-site item objectives are gathers of items that actually drop', () => {
    objectiveSteps.forEach(([id, m]) => {
      if (m.type !== 'item' || m.site) return;
      // a specific single item must be site-bound; open-world items are counted gathers
      expect(m.trigger.count).toBeGreaterThanOrEqual(2);
      // live source derivation (encounter drops / site loot pools / shops)
      expect(describeItemSources(m.trigger.item)).not.toBe('');
      expect(ITEM_CATALOG[m.trigger.item]).toBeDefined();
      if (!ITEM_CATALOG[m.trigger.item]) throw new Error(`${id}: gather target ${m.trigger.item} missing`);
    });
  });

  test('every site find-item has an icon source (catalog item or borrowed icon)', () => {
    objectiveSteps.forEach(([, m]) => {
      if (!m.site || m.site.objectiveType !== 'item') return;
      const borrowed = QUEST_ITEM_ICON_FROM[m.site.id];
      expect(Boolean(ITEM_CATALOG[m.site.id]) || Boolean(borrowed && ITEM_CATALOG[borrowed])).toBe(true);
    });
  });

  test('icon borrows all point at real catalog entries', () => {
    Object.values(QUEST_ITEM_ICON_FROM).forEach((key) => {
      expect(ITEM_CATALOG[key]).toBeDefined();
    });
  });
});

describe('water-town quests (#65 Phase 6): venue gating data + icon/hint coverage', () => {
  const WATER_QUEST_IDS = ['dockside_contraband', 'ferry_grievance', 'harbor_fees',
    'quayside_cargo', 'boatwright_resin', 'harbor_pests'];
  const WATER_VENUES = ['harbormaster', 'boathouse'];
  const quest = (id) => SIDE_QUESTS.find((q) => q.id === id);

  test('all six ship in the pool', () => {
    WATER_QUEST_IDS.forEach((id) => expect(quest(id)).toBeDefined());
  });

  test('every water quest is GIVER-gated on a water venue (harbormaster/boathouse)', () => {
    // The eligibility gate: isQuestEligible requires the giver building to exist, and
    // these venues only generate in settlements on water, so a landlocked world can
    // never be offered these quests. Every giver option must be a water venue.
    WATER_QUEST_IDS.forEach((id) => {
      const g = quest(id).giver.building;
      const givers = Array.isArray(g) ? g : [g];
      givers.forEach((b) => expect(WATER_VENUES).toContain(b));
    });
  });

  test('the ferry strongbox find-item borrows a real icon', () => {
    expect(QUEST_ITEM_ICON_FROM.ferry_strongbox).toBe('drowned_treasure');
    expect(ITEM_CATALOG.drowned_treasure).toBeDefined();
  });

  test('pine_resin is a real, sourced gatherable (hint system stays honest)', () => {
    expect(ITEM_CATALOG.pine_resin).toBeDefined();
    expect(ITEM_CATALOG.pine_resin.stackable).toBe(true);
    expect(describeItemSources('pine_resin')).toBe('In forest sites');
    expect(quest('boatwright_resin').milestones[0].sites).toEqual(['forest']);
  });

  test('smuggling-bust contraband reward is a catalog item', () => {
    expect(quest('dockside_contraband').milestones[0].rewards.items).toEqual(['stolen_goods']);
    expect(ITEM_CATALOG.stolen_goods).toBeDefined();
  });

  test('rewards sit in the flavor bands, not progression spikes', () => {
    // Low band (minLevel <= 2) pays 30-200 total XP; the single minLevel-3 quest
    // stays at the bottom of its band (250 vs the 150-450 t2 range).
    WATER_QUEST_IDS.forEach((id) => {
      const q = quest(id);
      const total = questTotalXp(q);
      if ((q.minLevel || 1) <= 2) {
        expect(total).toBeGreaterThanOrEqual(30);
        expect(total).toBeLessThanOrEqual(200);
      } else {
        expect(total).toBeLessThanOrEqual(260);
      }
    });
  });
});

describe('reward integrity and XP curve', () => {
  test('every rewards.items key (quest + steps) exists in ITEM_CATALOG', () => {
    SIDE_QUESTS.forEach((q) => {
      (q.rewards?.items || []).forEach((key) => expect(ITEM_CATALOG[key]).toBeDefined());
      q.milestones.forEach((m) =>
        (m.rewards?.items || []).forEach((key) => expect(ITEM_CATALOG[key]).toBeDefined()));
    });
  });

  test('total XP scales with minLevel band', () => {
    const bandFor = (minLevel) => {
      if (minLevel >= 6) return [450, 700]; // top band (future t3)
      if (minLevel === 5) return [350, 600];
      if (minLevel >= 3) return [150, 450]; // t2 band
      return [30, 200]; // low band
    };
    SIDE_QUESTS.forEach((q) => {
      const [lo, hi] = bandFor(q.minLevel || 1);
      const total = questTotalXp(q);
      if (total < lo || total > hi) {
        throw new Error(`${q.id} (minLevel ${q.minLevel}) pays ${total} XP, outside [${lo}, ${hi}]`);
      }
    });
  });

  test('initialSideQuests returns fresh mutable copies with reset progress', () => {
    const a = initialSideQuests();
    const b = initialSideQuests();
    expect(a.length).toBe(SIDE_QUESTS.length);
    expect(a[0]).not.toBe(b[0]);
    a.forEach((q) => q.milestones.forEach((m) => {
      expect(m.completed).toBe(false);
      expect(m.progress).toBe(0);
    }));
  });
});

describe('authored text', () => {
  test('every quest has its own turn-in line', () => {
    SIDE_QUESTS.forEach((q) => {
      expect(q.milestones[q.milestones.length - 1].text).not.toBe('Return to claim your reward');
    });
  });

  test('every site boss has authored art and text', () => {
    const bossIds = SIDE_QUESTS.flatMap((q) => q.milestones)
      .filter((m) => m.site && m.site.objectiveType === 'combat')
      .map((m) => m.site.id);
    expect(bossIds.length).toBeGreaterThan(0);
    bossIds.forEach((id) => {
      const b = SIDE_QUEST_BOSSES[id];
      if (!b) throw new Error(`${id} has no SIDE_QUEST_BOSSES entry`);
      expect(b.image).toMatch(/^\/assets\/encounters\//);
      expect(typeof b.description).toBe('string');
      expect(b.suggestedActions.length).toBeGreaterThan(0);
      ['criticalSuccess', 'success', 'failure', 'criticalFailure'].forEach((k) => expect(typeof b.consequences[k]).toBe('string'));
    });
  });
});

describe('multi-step quests', () => {
  const siteTypesOf = (m) => (m.site ? [m.site.type] : (m.sites || []));

  test('an ordered step never shares a site type with the step it waits on', () => {
    // Site objectives and gather nodes are placed on site entry, so a later step in the
    // same site would only appear after leaving and re-entering it.
    SIDE_QUESTS.forEach((q) => {
      q.milestones.filter((m) => !m.trigger?.turnIn).forEach((m) => {
        (m.requires || []).forEach((rid) => {
          const prior = q.milestones.find((x) => x.id === rid);
          const shared = siteTypesOf(m).filter((t) => siteTypesOf(prior).includes(t));
          if (shared.length) throw new Error(`${q.id}: ${m.id} waits on ${rid} in the same ${shared[0]}`);
        });
      });
    });
  });

  test('the pool has multi-step quests', () => {
    expect(SIDE_QUESTS.filter((q) => q.milestones.length > 2).length).toBeGreaterThanOrEqual(5);
  });
});

describe('biome-themed quests', () => {
  const BIOMES = ['grassland', 'desert', 'snow'];

  test('themes name real biomes', () => {
    SIDE_QUESTS.filter((q) => q.themes).forEach((q) => {
      expect(q.themes.length).toBeGreaterThan(0);
      q.themes.forEach((t) => expect(BIOMES).toContain(t));
    });
  });

  test('every biome keeps quests at every level band 1-5', () => {
    BIOMES.forEach((biome) => {
      const fits = SIDE_QUESTS.filter((q) => !q.themes || q.themes.includes(biome));
      for (let level = 1; level <= 5; level++) {
        expect(fits.filter((q) => (q.minLevel || 1) === level).length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  test('desert and snow each have their own quests', () => {
    ['desert', 'snow'].forEach((biome) => {
      expect(SIDE_QUESTS.filter((q) => q.themes && q.themes.length === 1 && q.themes[0] === biome).length).toBeGreaterThanOrEqual(5);
    });
  });
});

describe('quest tone', () => {
  test('tone is horror or light', () => {
    SIDE_QUESTS.filter((q) => q.tone !== undefined).forEach((q) => expect(['horror', 'light']).toContain(q.tone));
  });

  test('Dark games get their own horror quests', () => {
    expect(SIDE_QUESTS.filter((q) => q.tone === 'horror').length).toBeGreaterThanOrEqual(5);
  });
});
