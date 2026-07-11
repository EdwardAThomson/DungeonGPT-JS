import { populateSite, injectSiteObjective, injectHarvestResource, resourceDisplayFor, LOOT, HOARD_BONUS, HARVEST_NODES } from './sitePopulator';
import { generateSiteMap } from '../utils/siteMapGenerator';
import { ITEM_CATALOG, filterDropsByTier } from '../utils/inventorySystem';
import { encounterTemplates } from '../data/encounters';

const make = (type, seed) => populateSite(generateSiteMap(type, type, 'south', seed, { biome: 'plains' }), seed);
const slotTiles = (site) => site.contentSlots.map((s) => site.mapData[s.y][s.x]);
// A combat slot is now a MOVING MOB (site.mobs) at the slot coordinate, not tile content.
const mobAt = (site, x, y) => (site.mobs || []).find((m) => m.x === x && m.y === y) || null;

describe('populateSite', () => {
  test('fills every content slot with a moving mob or valid loot', () => {
    ['cave', 'ruins', 'forest', 'hills', 'mountain'].forEach((type) => {
      for (let seed = 1; seed <= 25; seed++) {
        const site = make(type, seed);
        expect(site.populated).toBe(true);
        expect(Array.isArray(site.mobs)).toBe(true);
        site.contentSlots.forEach((slot) => {
          const tile = site.mapData[slot.y][slot.x];
          const mob = mobAt(site, slot.x, slot.y);
          if (mob) {
            // a combat slot: a moving mob, not tile content
            expect(tile.content).toBeFalsy();
            expect(mob.defeated).toBe(false);
            expect(mob.encounter.name).toBeTruthy();
            expect(mob.encounter.rewards).toBeTruthy();
            expect(mob.state).toBe('idle');
            expect(mob.home).toEqual({ x: slot.x, y: slot.y });
          } else {
            expect(tile.content).toBeTruthy();
            expect(tile.content.consumed).toBe(false);
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

  test('a multi-room site has at least one mob and one loot', () => {
    let both = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const site = make('cave', seed);
      if (site.contentSlots.length < 2) continue;
      const hasMob = site.contentSlots.some((s) => mobAt(site, s.x, s.y));
      const hasLoot = slotTiles(site).some((t) => t.content && t.content.kind === 'loot');
      if (hasMob && hasLoot) both++;
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

    test('combat objective is a stationary boss MOB carrying enemyId (so defeat completes it)', () => {
      const site = injectSiteObjective(make('ruins', 4), { objectiveType: 'combat', id: 'cave_tyrant', name: 'the Cave Tyrant', milestoneId: 'm2' });
      const entry = site.entryPoint;
      const dist = (p) => Math.abs(p.x - entry.x) + Math.abs(p.y - entry.y);
      const slot = site.contentSlots.reduce((a, b) => (dist(b) > dist(a) ? b : a));
      // The boss is a guard mob at the deepest slot, not tile content.
      const boss = (site.mobs || []).find((m) => m.isBoss && m.enemyId === 'cave_tyrant');
      expect(boss).toBeTruthy();
      expect(boss.x).toBe(slot.x);
      expect(boss.y).toBe(slot.y);
      expect(boss.speed).toBe(0); // stationary guard, holds its tile
      expect(boss.milestoneId).toBe('m2');
      expect(boss.encounter.isMilestoneBoss).toBe(true);
      expect(boss.encounter.name).toBe('the Cave Tyrant');
      expect(boss.encounter.enemyId).toBe('cave_tyrant');
      expect(boss.encounter.suggestedActions.length).toBeGreaterThan(0); // valid encounter shape
      // idempotent: a re-inject with the same milestone spawns no duplicate boss
      injectSiteObjective(site, { objectiveType: 'combat', id: 'cave_tyrant', name: 'the Cave Tyrant', milestoneId: 'm2' });
      expect((site.mobs || []).filter((m) => m.isBoss && m.milestoneId === 'm2')).toHaveLength(1);
    });

    test('location objective records the locationId for the reach-room trigger', () => {
      const site = injectSiteObjective(make('cave', 5), { objectiveType: 'location', id: 'inner_sanctum', name: 'the Inner Sanctum', milestoneId: 'm3' });
      const tile = deepestTile(site);
      expect(tile.content.objectiveType).toBe('location');
      expect(tile.content.locationId).toBe('inner_sanctum');
    });

    test('an objective injected over the hoard CARRIES its loot (playtest R1: no vanished treasure)', () => {
      const site = make('ruins', 9); // seed 9: deepest slot is the loot hoard (asserted above)
      const hoardLoot = deepestTile(site).content.loot;
      expect(hoardLoot).toBeTruthy();
      injectSiteObjective(site, { objectiveType: 'location', id: 'sealed_vault', name: 'the Sealed Vault', milestoneId: 'sv1' });
      const tile = deepestTile(site);
      expect(tile.content.kind).toBe('objective');
      expect(tile.content.loot).toEqual(hoardLoot); // Game.js grants it on arrival
    });

    test('two objectives inject into DISTINCT slots (multi-quest per site)', () => {
      // find a cave with at least 2 content slots
      let site = null;
      for (let seed = 1; seed <= 30 && !site; seed++) {
        const s = make('cave', seed);
        if (s.contentSlots.length >= 2) site = s;
      }
      expect(site).toBeTruthy();
      injectSiteObjective(site, [
        { objectiveType: 'item', id: 'silver_locket', name: 'the Silver Locket', milestoneId: 'lh1' },
        { objectiveType: 'item', id: 'cure_root', name: 'the Cure-Root', milestoneId: 'cp1' },
      ]);
      const objTiles = site.mapData.flat().filter((t) => t.content?.kind === 'objective');
      expect(objTiles).toHaveLength(2);
      expect(objTiles.map((t) => t.content.milestoneId).sort()).toEqual(['cp1', 'lh1']);
      expect(site.objectives).toHaveLength(2);
    });

    test('injection is idempotent per milestoneId (re-entry with the same active quests)', () => {
      const site = make('cave', 3);
      const list = [{ objectiveType: 'item', id: 'lost_codex', name: 'the Lost Codex', milestoneId: 'lc1' }];
      injectSiteObjective(site, list);
      injectSiteObjective(site, list); // second entry: no duplicate placement
      const objTiles = site.mapData.flat().filter((t) => t.content?.kind === 'objective');
      expect(objTiles).toHaveLength(1);
      expect(site.objectives).toHaveLength(1);
    });

    test('a quest accepted AFTER the first visit still injects on the next entry', () => {
      let site = null;
      for (let seed = 1; seed <= 30 && !site; seed++) {
        const s = make('cave', seed);
        if (s.contentSlots.length >= 2) site = s;
      }
      injectSiteObjective(site, [{ objectiveType: 'item', id: 'silver_locket', name: 'the Silver Locket', milestoneId: 'lh1' }]);
      // player later accepts a second cave quest, then re-enters
      injectSiteObjective(site, [
        { objectiveType: 'item', id: 'silver_locket', name: 'the Silver Locket', milestoneId: 'lh1' },
        { objectiveType: 'item', id: 'cure_root', name: 'the Cure-Root', milestoneId: 'cp1' },
      ]);
      const ids = site.mapData.flat().filter((t) => t.content?.kind === 'objective').map((t) => t.content.milestoneId);
      expect(ids.sort()).toEqual(['cp1', 'lh1']);
    });

    test('legacy cached sites (site.objective only, no site.objectives) are not re-injected', () => {
      const site = make('cave', 3);
      injectSiteObjective(site, { objectiveType: 'item', id: 'lost_codex', name: 'the Lost Codex', milestoneId: 'lc1' });
      delete site.objectives; // simulate a save written before the multi-objective field
      injectSiteObjective(site, [{ objectiveType: 'item', id: 'lost_codex', name: 'the Lost Codex', milestoneId: 'lc1' }]);
      const objTiles = site.mapData.flat().filter((t) => t.content?.kind === 'objective');
      expect(objTiles).toHaveLength(1); // idempotence reads the tiles, not the bookkeeping
    });

    test('overflow: with a single slot, the hard (item) objective wins over the location one', () => {
      const site = generateSiteMap('cave', 'cave', 'south', 11, { biome: 'plains' });
      site.contentSlots = site.contentSlots.slice(0, 1); // degenerate: one room only
      populateSite(site, 11);
      injectSiteObjective(site, [
        { objectiveType: 'location', id: 'echo_hollow', name: 'the Echoing Hollow', milestoneId: 'sc1' },
        { objectiveType: 'item', id: 'cure_root', name: 'the Cure-Root', milestoneId: 'cp1' },
      ]);
      const objTiles = site.mapData.flat().filter((t) => t.content?.kind === 'objective');
      expect(objTiles).toHaveLength(1);
      expect(objTiles[0].content.objectiveType).toBe('item');
      expect(objTiles[0].content.milestoneId).toBe('cp1');
    });
  });

  describe('crystal deposits (issue #38 — harvestable 💎)', () => {
    const allTiles = (site) => site.mapData.flat();
    const deposits = (site) => allTiles(site).filter((t) => t.content && t.content.display === 'crystal');

    test('cave and mountain sites get 3-4 harvestable crystal deposits with valid loot', () => {
      ['cave', 'mountain'].forEach((type) => {
        for (let seed = 1; seed <= 25; seed++) {
          const site = make(type, seed);
          const nodes = deposits(site);
          expect(nodes.length).toBeGreaterThanOrEqual(3);
          expect(nodes.length).toBeLessThanOrEqual(4);
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

  describe('harvest nodes (playtest 2026-07-04: mushrooms, ore, ruins parity)', () => {
    const nodesOf = (site, display) => site.mapData.flat().filter((t) => t.content && t.content.display === display);

    test('caves grow harvestable mushroom and ore nodes with catalog loot', () => {
      for (let seed = 1; seed <= 25; seed++) {
        const site = make('cave', seed);
        const shrooms = nodesOf(site, 'mushroom');
        const ore = nodesOf(site, 'ore');
        // two mushroom specs (cave_mushrooms + glowing_fungi), 3-4 nodes each
        expect(shrooms.length).toBeGreaterThanOrEqual(6);
        expect(ore.length).toBeGreaterThanOrEqual(3);
        [...shrooms, ...ore].forEach((tile) => {
          expect(tile.content.kind).toBe('loot');
          expect(tile.content.loot.gold).toBe(0);
          expect(tile.content.loot.items).toHaveLength(1);
          tile.content.loot.items.forEach((k) => expect(ITEM_CATALOG[k]).toBeTruthy());
          expect(tile.poi).toBeNull();
          expect(tile.contentSlot).toBeFalsy();
          expect(tile.walkable).toBe(true);
        });
      }
    });

    test('every gather quest target is guaranteed by cave nodes: 3+ mushrooms, 3+ fungi, 3+ gems, 3+ ore', () => {
      for (let seed = 1; seed <= 25; seed++) {
        const site = make('cave', seed);
        const itemCounts = {};
        site.mapData.flat().forEach((t) => {
          if (!t.content || !t.content.display) return;
          t.content.loot.items.forEach((k) => { itemCounts[k] = (itemCounts[k] || 0) + 1; });
        });
        expect(itemCounts.cave_mushrooms).toBeGreaterThanOrEqual(3); // tend_sick
        expect(itemCounts.glowing_fungi).toBeGreaterThanOrEqual(3);  // arcane_reagents
        expect(itemCounts.raw_gems).toBeGreaterThanOrEqual(3);       // field_samples
        expect(itemCounts.exposed_minerals).toBeGreaterThanOrEqual(3); // rare_ore / antidote
      }
    });

    test('mountains keep crystals and gain ore nodes', () => {
      for (let seed = 1; seed <= 25; seed++) {
        const site = make('mountain', seed);
        expect(nodesOf(site, 'crystal').length).toBeGreaterThanOrEqual(3);
        const ore = nodesOf(site, 'ore');
        expect(ore.length).toBeGreaterThanOrEqual(2);
        ore.forEach((t) => t.content.loot.items.forEach((k) =>
          expect(['exposed_minerals', 'rare_ore']).toContain(k)));
      }
    });

    test('ruins are no longer pickup-free: urns + overgrowth caches with ruins-pool items', () => {
      for (let seed = 1; seed <= 25; seed++) {
        const site = make('ruins', seed);
        const urns = nodesOf(site, 'urn');
        const caches = nodesOf(site, 'overgrowth');
        expect(urns.length).toBeGreaterThanOrEqual(2);
        expect(caches.length).toBeGreaterThanOrEqual(2);
        [...urns, ...caches].forEach((tile) => {
          expect(tile.content.kind).toBe('loot');
          tile.content.loot.items.forEach((k) => {
            expect(ITEM_CATALOG[k]).toBeTruthy();
            expect(LOOT.ruins).toContain(k); // ruins-appropriate loot only
          });
        });
      }
    });

    test('no unpickable teasers: every decoration of a harvestable kind was converted or demoted', () => {
      Object.keys(HARVEST_NODES).forEach((type) => {
        const harvestKeys = HARVEST_NODES[type].map((s) => s.fromPoi);
        for (let seed = 1; seed <= 25; seed++) {
          const teasers = make(type, seed).mapData.flat().filter((t) => harvestKeys.includes(t.poi));
          expect(teasers).toHaveLength(0);
        }
      });
    });

    test('hills stay node-free (decorative flora only, for now)', () => {
      for (let seed = 1; seed <= 10; seed++) {
        const nodes = make('hills', seed).mapData.flat().filter((t) => t.content && t.content.display);
        expect(nodes).toHaveLength(0);
      }
    });

    test('forests grow tappable resin trees: gather-3 pine_resin completes in one forest (#65 Phase 6)', () => {
      for (let seed = 1; seed <= 25; seed++) {
        const site = make('forest', seed);
        const trees = nodesOf(site, 'tree');
        expect(trees.length).toBeGreaterThanOrEqual(3); // boatwright_resin needs 3
        trees.forEach((tile) => {
          expect(tile.content.kind).toBe('loot');
          expect(tile.content.loot.gold).toBe(0);
          expect(tile.content.loot.items).toEqual(['pine_resin']);
          expect(tile.poi).toBeNull();
          expect(tile.walkable).toBe(true);
        });
        // no unpickable lone-tree teasers remain (thicket walls are structure, not poi)
        expect(site.mapData.flat().filter((t) => t.poi === 'tree')).toHaveLength(0);
      }
    });

    test('node placement is deterministic per seed', () => {
      const sig = (site) => JSON.stringify(site.mapData.flat()
        .filter((t) => t.content && t.content.display)
        .map((t) => [t.x, t.y, t.content.display, t.content.loot.items]));
      expect(sig(make('ruins', 77))).toBe(sig(make('ruins', 77)));
      expect(sig(make('cave', 77))).toBe(sig(make('cave', 77)));
    });
  });

  describe('injectHarvestResource (gather resupply for an already-looted site)', () => {
    const liveNodes = (site, itemId) => site.mapData.flat().filter((t) =>
      t.content && t.content.kind === 'loot' && !t.content.consumed
      && Array.isArray(t.content.loot && t.content.loot.items) && t.content.loot.items.includes(itemId));
    const consumeAll = (site, itemId) => site.mapData.flat().forEach((t) => {
      if (t.content && t.content.loot && (t.content.loot.items || []).includes(itemId)) t.content.consumed = true;
    });

    test('display mapping: every gather item maps to a real node key; spider_silk + unknowns fall back', () => {
      expect(resourceDisplayFor('exposed_minerals')).toBe('ore');
      expect(resourceDisplayFor('rare_ore')).toBe('ore');
      expect(resourceDisplayFor('raw_gems')).toBe('crystal');
      expect(resourceDisplayFor('cave_mushrooms')).toBe('mushroom');
      expect(resourceDisplayFor('glowing_fungi')).toBe('mushroom');
      expect(resourceDisplayFor('pine_resin')).toBe('tree');
      expect(resourceDisplayFor('spider_silk')).toBe('mushroom'); // not in HARVEST_NODES -> borrows a node
      expect(resourceDisplayFor('some_unknown_reagent')).toBe('ore'); // sensible fallback that renders
    });

    test('fresh site that already has enough nodes injects nothing (remaining <= 0)', () => {
      const site = make('cave', 7); // caves guarantee >= 3 exposed_minerals nodes
      const before = liveNodes(site, 'exposed_minerals').length;
      expect(before).toBeGreaterThanOrEqual(3);
      injectHarvestResource(site, [{ itemId: 'exposed_minerals', needed: 3 }]);
      expect(liveNodes(site, 'exposed_minerals').length).toBe(before); // unchanged
    });

    test('re-supplies the shortfall once the original nodes are consumed', () => {
      const site = make('cave', 7);
      consumeAll(site, 'exposed_minerals'); // player looted the cave BEFORE taking the quest
      expect(liveNodes(site, 'exposed_minerals').length).toBe(0);
      injectHarvestResource(site, [{ itemId: 'exposed_minerals', needed: 3 }]);
      const fresh = liveNodes(site, 'exposed_minerals');
      expect(fresh.length).toBe(3);
      fresh.forEach((t) => {
        expect(t.content.kind).toBe('loot');
        expect(t.content.display).toBe('ore');
        expect(t.content.loot.gold).toBe(0);
        expect(t.content.loot.items).toEqual(['exposed_minerals']);
        expect(t.content.consumed).toBe(false);
        expect(t.poi).toBeNull();
        // tile selection: an empty, walkable floor tile with no reserved content slot
        expect(t.walkable).toBe(true);
        expect(t.type).not.toBe('entrance');
        expect(t.contentSlot).toBeFalsy();
      });
    });

    test('bounds strictly by shortfall: only tops up the missing count', () => {
      const site = make('cave', 7);
      const nodes = liveNodes(site, 'exposed_minerals');
      nodes.slice(1).forEach((t) => { t.content.consumed = true; }); // leave exactly one un-consumed
      expect(liveNodes(site, 'exposed_minerals').length).toBe(1);
      injectHarvestResource(site, [{ itemId: 'exposed_minerals', needed: 3 }]);
      expect(liveNodes(site, 'exposed_minerals').length).toBe(3); // 1 kept + 2 injected
    });

    test('idempotent: a second call injects nothing more (new nodes count against remaining)', () => {
      const site = make('cave', 7);
      consumeAll(site, 'exposed_minerals');
      injectHarvestResource(site, [{ itemId: 'exposed_minerals', needed: 3 }]);
      const after1 = liveNodes(site, 'exposed_minerals').length;
      expect(after1).toBe(3);
      injectHarvestResource(site, [{ itemId: 'exposed_minerals', needed: 3 }]);
      expect(liveNodes(site, 'exposed_minerals').length).toBe(after1); // unchanged
    });

    test('respects tile selection: never overwrites content slots or the entrance', () => {
      const site = make('ruins', 12);
      const slotsBefore = site.contentSlots.map((s) => JSON.stringify(site.mapData[s.y][s.x].content));
      const entrance = site.mapData.flat().find((t) => t.type === 'entrance');
      // spider_silk is not a ruins node, so all 2 must land on FREE floor tiles.
      injectHarvestResource(site, [{ itemId: 'spider_silk', needed: 2 }]);
      const silk = liveNodes(site, 'spider_silk');
      expect(silk.length).toBe(2);
      silk.forEach((t) => {
        expect(t.type).not.toBe('entrance');
        expect(t.contentSlot).toBeFalsy();
        expect(t.content.display).toBe('mushroom'); // spider_silk fallback
      });
      site.contentSlots.forEach((s, i) => expect(JSON.stringify(site.mapData[s.y][s.x].content)).toBe(slotsBefore[i]));
      if (entrance) expect(entrance.content).toBeFalsy();
    });
  });

  describe('per-type loot pools (issue #49 — no more cave coercion)', () => {
    const lootItems = (site) => slotTiles(site)
      .filter((t) => t.content && t.content.kind === 'loot')
      .flatMap((t) => t.content.loot.items);

    test('forest/hills/mountain sites draw ONLY from their own LOOT/HOARD_BONUS pools', () => {
      ['forest', 'hills', 'mountain'].forEach((type) => {
        const allowed = [...LOOT[type], ...HOARD_BONUS[type]];
        const seen = new Set();
        for (let seed = 1; seed <= 30; seed++) {
          lootItems(make(type, seed)).forEach((k) => {
            seen.add(k);
            expect(allowed).toContain(k); // never a cave-pool item
          });
        }
        expect(seen.size).toBeGreaterThan(0);
      });
    });

    test('combat mobs on forest/hills/mountain sites still spawn (cave-mob fallback)', () => {
      let mobs = 0;
      ['forest', 'hills', 'mountain'].forEach((type) => {
        for (let seed = 1; seed <= 20; seed++) {
          (make(type, seed).mobs || []).forEach((m) => {
            mobs++;
            expect(m.encounter.name).toBeTruthy();
            expect(m.encounter.rewards).toBeTruthy();
            expect(m.encounter.suggestedActions.length).toBeGreaterThan(0);
          });
        }
      });
      expect(mobs).toBeGreaterThan(0);
    });

    test('hide_armor actually drops from forest and hills hoards (issue #49 obtainability)', () => {
      ['forest', 'hills'].forEach((type) => {
        const seen = new Set();
        for (let seed = 1; seed <= 40; seed++) lootItems(make(type, seed)).forEach((k) => seen.add(k));
        expect(seen.has('hide_armor')).toBe(true);
      });
    });

    test('ring_protection drops from ruins hoards (its single acquisition path)', () => {
      expect(HOARD_BONUS.ruins).toContain('ring_protection');
      expect(ITEM_CATALOG.ring_protection.rarity).toBe('rare'); // within the Tier 1 cap
      const seen = new Set();
      for (let seed = 1; seed <= 40; seed++) lootItems(make('ruins', seed)).forEach((k) => seen.add(k));
      expect(seen.has('ring_protection')).toBe(true);
    });
  });

  describe('issue #49 — tier-gated drop paths', () => {
    test('dragonscale_plate drops from the Dragon\'s Lair, gated to Tier 2+', () => {
      const entries = encounterTemplates.mountain_dragon.rewards.items;
      expect(entries.some((s) => s.startsWith('dragonscale_plate:'))).toBe(true);
      expect(ITEM_CATALOG.dragonscale_plate.rarity).toBe('very_rare');
      // encounterResolver applies filterDropsByTier to encounter loot: T1 strips it, T2 allows it.
      expect(filterDropsByTier(['dragonscale_plate'], { tier: 1 })).toEqual([]);
      expect(filterDropsByTier(['dragonscale_plate'], { tier: 2 })).toEqual(['dragonscale_plate']);
    });

    test('legendary_weapon keeps its vault drop but stays Tier-3-gated (known gap until T3 ships)', () => {
      const entries = encounterTemplates.ruin_treasure_vault.rewards.items;
      expect(entries.some((s) => s.startsWith('legendary_weapon:'))).toBe(true);
      expect(filterDropsByTier(['legendary_weapon'], { tier: 2 })).toEqual([]);
      expect(filterDropsByTier(['legendary_weapon'], { tier: 3 })).toEqual(['legendary_weapon']);
    });
  });

  test('deterministic per seed, and idempotent (loot content + mobs)', () => {
    const a = make('cave', 314);
    const b = make('cave', 314);
    expect(JSON.stringify(slotTiles(a).map((t) => t.content))).toBe(JSON.stringify(slotTiles(b).map((t) => t.content)));
    // mobs are deterministic too (same ids/positions/encounters per seed)
    const mobSig = (site) => JSON.stringify((site.mobs || []).map((m) => [m.id, m.x, m.y, m.speed, m.encounter.name]));
    expect(mobSig(a)).toBe(mobSig(b));
    expect((a.mobs || []).length).toBeGreaterThan(0);
    // calling populate again is a no-op (already populated): no map churn, no extra mobs
    const before = JSON.stringify(a.mapData);
    const mobsBefore = mobSig(a);
    populateSite(a, 314);
    expect(JSON.stringify(a.mapData)).toBe(before);
    expect(mobSig(a)).toBe(mobsBefore);
  });
});
