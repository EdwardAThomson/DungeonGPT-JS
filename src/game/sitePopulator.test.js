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

  describe('crystal deposits (issue #38 — harvestable 💎)', () => {
    const allTiles = (site) => site.mapData.flat();
    const deposits = (site) => allTiles(site).filter((t) => t.content && t.content.display === 'crystal');

    test('cave and mountain sites get 1-3 harvestable crystal deposits with valid loot', () => {
      ['cave', 'mountain'].forEach((type) => {
        for (let seed = 1; seed <= 25; seed++) {
          const site = make(type, seed);
          const nodes = deposits(site);
          expect(nodes.length).toBeGreaterThanOrEqual(1);
          expect(nodes.length).toBeLessThanOrEqual(3);
          nodes.forEach((tile) => {
            expect(tile.content.kind).toBe('loot'); // reuses the walk-onto-loot flow
            expect(tile.content.consumed).toBe(false);
            expect(tile.content.loot.gold).toBe(0);
            expect(tile.content.loot.items.length).toBe(1);
            tile.content.loot.items.forEach((k) => expect(ITEM_CATALOG[k]).toBeTruthy());
            // the content overlay renders the gem, so the poi must not double-draw
            expect(tile.poi).toBeNull();
            // deposits live on plain walkable floor, never on reserved slots/entrances
            expect(tile.contentSlot).toBeFalsy();
            expect(tile.walkable).toBe(true);
            expect(tile.type).not.toBe('entrance');
          });
        }
      });
    });

    test('deposit items are type-appropriate and tier-safe (uncommon/rare only)', () => {
      const seen = { cave: new Set(), mountain: new Set() };
      for (let seed = 1; seed <= 40; seed++) {
        ['cave', 'mountain'].forEach((type) => {
          deposits(make(type, seed)).forEach((t) => t.content.loot.items.forEach((k) => seen[type].add(k)));
        });
      }
      seen.cave.forEach((k) => expect(['raw_gems']).toContain(k));
      seen.mountain.forEach((k) => expect(['mountain_crystal', 'storm_crystal']).toContain(k));
      [...seen.cave, ...seen.mountain].forEach((k) =>
        expect(['uncommon', 'rare']).toContain(ITEM_CATALOG[k].rarity));
    });

    test('no unpickable crystals remain: every visible 💎 poi was converted or demoted', () => {
      ['cave', 'mountain'].forEach((type) => {
        for (let seed = 1; seed <= 25; seed++) {
          const teasers = allTiles(make(type, seed)).filter((t) => t.poi === 'crystal');
          expect(teasers).toHaveLength(0);
        }
      });
    });

    test('non-crystal site types get no deposits', () => {
      ['ruins', 'forest', 'hills'].forEach((type) => {
        for (let seed = 1; seed <= 10; seed++) {
          expect(deposits(make(type, seed))).toHaveLength(0);
        }
      });
    });

    test('deposits are deterministic per seed and idempotent under re-populate', () => {
      const sig = (site) => JSON.stringify(allTiles(site)
        .filter((t) => t.content && t.content.display === 'crystal')
        .map((t) => [t.x, t.y, t.content.loot.items]));
      const a = make('mountain', 271);
      const b = make('mountain', 271);
      expect(sig(a)).toBe(sig(b));
      const before = JSON.stringify(a.mapData);
      populateSite(a, 271); // guarded by site.populated -> no extra deposits
      expect(JSON.stringify(a.mapData)).toBe(before);
    });

    test('a site with no content slots still gets crystal deposits', () => {
      const site = generateSiteMap('mountain', 'mountain', 'south', 8, { biome: 'plains' });
      site.contentSlots = []; // degenerate layout: no reserved rooms
      populateSite(site, 8);
      expect(site.populated).toBe(true);
      expect(deposits(site).length).toBeGreaterThanOrEqual(1);
    });

    test('old cached sites (populated before #38) are never retro-mutated', () => {
      // Simulate a pre-#38 save: populated flag set, decorative crystals still on poi.
      const site = generateSiteMap('cave', 'cave', 'south', 21, { biome: 'plains' });
      site.populated = true;
      const before = JSON.stringify(site.mapData);
      populateSite(site, 21);
      expect(JSON.stringify(site.mapData)).toBe(before); // decor untouched, no deposits added
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
