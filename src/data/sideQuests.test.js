// sideQuests.test.js — pool-shape guards for the side-quest data (#45/#50).
// Checks the pool's own completability rules (header comment of sideQuests.js /
// docs/SIDE_QUEST_POOL.md): site objectives are site-bound to cave/ruins,
// overworld combat is count-of-any, gather targets have live drop sources,
// rewards reference real catalog items, and the minLevel curve actually serves
// the mid/top bands. Dice-rolling balance checks live in progressionLint.test.js.

import { SIDE_QUESTS, QUEST_ITEM_ICON_FROM, initialSideQuests } from './sideQuests';
import { ITEM_CATALOG } from '../utils/inventorySystem';
import { describeItemSources } from '../game/questHints';

const questTotalXp = (q) =>
  q.milestones.reduce((sum, m) => sum + (m.rewards?.xp || 0), 0) + (q.rewards?.xp || 0);

const SITE_TYPES = ['cave', 'ruins']; // the only quest-gatable world sites (NewGame.js availableSites)

describe('side-quest pool size and minLevel distribution (#45/#50)', () => {
  test('pool size', () => {
    expect(SIDE_QUESTS.length).toBe(42);
  });

  test('quest ids are unique', () => {
    const ids = SIDE_QUESTS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('minLevel distribution: the mid/top band is no longer starved', () => {
    const dist = {};
    SIDE_QUESTS.forEach((q) => { dist[q.minLevel || 1] = (dist[q.minLevel || 1] || 0) + 1; });
    // Exact pin: expanding or retiring quests should update this consciously.
    expect(dist).toEqual({ 1: 10, 2: 12, 3: 9, 4: 4, 5: 4, 6: 2, 7: 1 });
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

    // milestones: unique step ids, valid requires, exactly one turn-in step (last)
    expect(q.milestones.length).toBeGreaterThanOrEqual(1);
    const stepIds = q.milestones.map((m) => m.id);
    expect(new Set(stepIds).size).toBe(stepIds.length);
    q.milestones.forEach((m) => {
      expect(m.completed).toBe(false);
      expect(typeof m.text).toBe('string');
      (m.requires || []).forEach((rid) => expect(stepIds).toContain(rid));
      expect(typeof (m.rewards?.xp)).toBe('number');
    });
    const turnIns = q.milestones.filter((m) => m.trigger?.turnIn);
    expect(turnIns.length).toBe(1);
    expect(q.milestones[q.milestones.length - 1]).toBe(turnIns[0]);
    const turnInBuildings = Array.isArray(turnIns[0].trigger.turnIn.building)
      ? turnIns[0].trigger.turnIn.building : [turnIns[0].trigger.turnIn.building];
    turnInBuildings.forEach((b) => expect(typeof b).toBe('string'));

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
