import { populateSite, injectSiteObjective } from './sitePopulator';
import { generateSiteMap } from '../utils/siteMapGenerator';
import { ITEM_CATALOG } from '../utils/inventorySystem';

const make = (type, seed) => populateSite(generateSiteMap(type, type, 'south', seed, { biome: 'plains' }), seed);
const slotTiles = (site) => site.contentSlots.map((s) => site.mapData[s.y][s.x]);

describe('populateSite', () => {
  test('fills every content slot with an encounter or valid loot', () => {
    ['cave', 'ruins'].forEach((type) => {
      for (let seed = 1; seed <= 25; seed++) {
        const site = make(type, seed);
        expect(site.populated).toBe(true);
        slotTiles(site).forEach((tile) => {
          expect(tile.content).toBeTruthy();
          expect(tile.content.consumed).toBe(false);
          if (tile.content.kind === 'encounter') {
            expect(tile.content.encounter.name).toBeTruthy();
            expect(tile.content.encounter.rewards).toBeTruthy();
          } else {
            expect(tile.content.kind).toBe('loot');
            expect(tile.content.loot.gold).toBeGreaterThan(0);
            expect(tile.content.loot.items.length).toBeGreaterThan(0);
            // every loot item is a real catalog key (guards against typos)
            tile.content.loot.items.forEach((k) => expect(ITEM_CATALOG[k]).toBeTruthy());
          }
        });
      }
    });
  });

  test('a multi-room site has at least one encounter and one loot', () => {
    let both = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const site = make('cave', seed);
      if (site.contentSlots.length < 2) continue;
      const kinds = new Set(slotTiles(site).map((t) => t.content.kind));
      if (kinds.has('encounter') && kinds.has('loot')) both++;
    }
    expect(both).toBeGreaterThan(0);
  });

  test('the deepest slot (farthest from entry) is a treasure hoard', () => {
    const site = make('ruins', 9);
    const entry = site.entryPoint;
    const dist = (p) => Math.abs(p.x - entry.x) + Math.abs(p.y - entry.y);
    const deepest = site.contentSlots.reduce((a, b) => (dist(b) > dist(a) ? b : a));
    expect(site.mapData[deepest.y][deepest.x].content.kind).toBe('loot');
  });

  describe('injectSiteObjective', () => {
    const deepestTile = (site) => {
      const entry = site.entryPoint;
      const dist = (p) => Math.abs(p.x - entry.x) + Math.abs(p.y - entry.y);
      const slot = site.contentSlots.reduce((a, b) => (dist(b) > dist(a) ? b : a));
      return site.mapData[slot.y][slot.x];
    };

    test('item objective lands on the deepest room with the milestone id', () => {
      const site = injectSiteObjective(make('cave', 3), { objectiveType: 'item', id: 'control_rod', name: 'the Control Rod', milestoneId: 'm1' });
      const tile = deepestTile(site);
      expect(tile.content.kind).toBe('objective');
      expect(tile.content.objectiveType).toBe('item');
      expect(tile.content.item.id).toBe('control_rod');
      expect(site.objective.milestoneId).toBe('m1');
    });

    test('combat objective is a milestone boss carrying enemyId (so defeat completes it)', () => {
      const site = injectSiteObjective(make('ruins', 4), { objectiveType: 'combat', id: 'cave_tyrant', name: 'the Cave Tyrant', milestoneId: 'm2' });
      const tile = deepestTile(site);
      expect(tile.content.objectiveType).toBe('combat');
      expect(tile.content.encounter.enemyId).toBe('cave_tyrant');
      expect(tile.content.encounter.isMilestoneBoss).toBe(true);
      expect(tile.content.encounter.name).toBe('the Cave Tyrant');
      expect(tile.content.encounter.suggestedActions.length).toBeGreaterThan(0); // valid encounter shape
    });

    test('location objective records the locationId for the reach-room trigger', () => {
      const site = injectSiteObjective(make('cave', 5), { objectiveType: 'location', id: 'inner_sanctum', name: 'the Inner Sanctum', milestoneId: 'm3' });
      const tile = deepestTile(site);
      expect(tile.content.objectiveType).toBe('location');
      expect(tile.content.locationId).toBe('inner_sanctum');
    });
  });

  test('deterministic per seed, and idempotent', () => {
    const a = make('cave', 314);
    const b = make('cave', 314);
    expect(JSON.stringify(slotTiles(a).map((t) => t.content))).toBe(JSON.stringify(slotTiles(b).map((t) => t.content)));
    // calling populate again is a no-op (already populated)
    const before = JSON.stringify(a.mapData);
    populateSite(a, 314);
    expect(JSON.stringify(a.mapData)).toBe(before);
  });
});
