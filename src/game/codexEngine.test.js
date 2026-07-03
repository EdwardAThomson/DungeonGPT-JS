import {
  slugify,
  createEmptyCodex,
  normalizeCodex,
  recordItemDiscoveries,
  recordEnemyDiscovery,
  enemyDiscoveryKeys,
  partyItemKeys,
  seedCodexFromParty,
  isItemDiscovered,
  isEnemyDiscovered,
  findBestiaryMatch,
  getItemCodexEntries,
  getBestiaryEntries
} from './codexEngine';
import { ITEM_CATALOG } from '../utils/inventorySystem';

describe('slugify', () => {
  it('slugs display names to enemy-id style keys', () => {
    expect(slugify('Goblin Ambush')).toBe('goblin_ambush');
    expect(slugify("  Hunter's Longbow ")).toBe('hunter_s_longbow');
    expect(slugify('')).toBe('');
    expect(slugify(null)).toBe('');
  });
});

describe('normalizeCodex', () => {
  it('returns the same object when already well-formed (identity contract)', () => {
    const codex = { items: ['torch'], enemies: [] };
    expect(normalizeCodex(codex)).toBe(codex);
  });

  it('coerces missing/malformed values to an empty codex', () => {
    expect(normalizeCodex(undefined)).toEqual({ items: [], enemies: [] });
    expect(normalizeCodex(null)).toEqual({ items: [], enemies: [] });
    expect(normalizeCodex({ items: 'nope' })).toEqual({ items: [], enemies: [] });
    expect(normalizeCodex({ items: ['a'] })).toEqual({ items: ['a'], enemies: [] });
  });
});

describe('recordItemDiscoveries', () => {
  it('adds new keys additively and reports them', () => {
    const { codex, added } = recordItemDiscoveries(createEmptyCodex(), ['torch', 'rope']);
    expect(codex.items).toEqual(['torch', 'rope']);
    expect(added).toEqual(['torch', 'rope']);
  });

  it('is a no-op (same reference) when every key is known', () => {
    const start = { items: ['torch'], enemies: [] };
    const { codex, added } = recordItemDiscoveries(start, ['torch']);
    expect(codex).toBe(start);
    expect(added).toEqual([]);
  });

  it('dedupes within a single call and ignores falsy keys', () => {
    const { codex, added } = recordItemDiscoveries(createEmptyCodex(), ['torch', 'torch', null, '']);
    expect(codex.items).toEqual(['torch']);
    expect(added).toEqual(['torch']);
  });

  it('never removes previously discovered keys', () => {
    const start = { items: ['torch'], enemies: ['wolf_pack'] };
    const { codex } = recordItemDiscoveries(start, ['rope']);
    expect(codex.items).toEqual(['torch', 'rope']);
    expect(codex.enemies).toEqual(['wolf_pack']);
  });

  it('tolerates a malformed stored codex (old saves)', () => {
    const { codex } = recordItemDiscoveries('garbage', ['torch']);
    expect(codex).toEqual({ items: ['torch'], enemies: [] });
  });
});

describe('enemyDiscoveryKeys / recordEnemyDiscovery', () => {
  it('collects enemyId, templateKey, and name slug without duplicates', () => {
    expect(enemyDiscoveryKeys({ enemyId: 'goblin_chieftain', name: 'Goblin Chieftain' }))
      .toEqual(['goblin_chieftain']);
    expect(enemyDiscoveryKeys({ templateKey: 'wolf_pack', name: 'Wolf Pack' }))
      .toEqual(['wolf_pack']);
    expect(enemyDiscoveryKeys({ name: 'Bandit Roadblock' })).toEqual(['bandit_roadblock']);
  });

  it('records all keys for a resolved encounter and reports additions', () => {
    const { codex, added } = recordEnemyDiscovery(createEmptyCodex(), {
      enemyId: 'shadow_overlord',
      name: 'Shadow Overlord'
    });
    expect(codex.enemies).toEqual(['shadow_overlord']);
    expect(added).toEqual(['shadow_overlord']);
  });

  it('is a no-op (same reference) on re-fights', () => {
    const start = { items: [], enemies: ['wolf_pack'] };
    const { codex, added } = recordEnemyDiscovery(start, { templateKey: 'wolf_pack', name: 'Wolf Pack' });
    expect(codex).toBe(start);
    expect(added).toEqual([]);
  });

  it('ignores encounters with no identifiable keys', () => {
    const start = createEmptyCodex();
    const { codex, added } = recordEnemyDiscovery(start, {});
    expect(codex).toBe(start);
    expect(added).toEqual([]);
  });
});

describe('partyItemKeys / seedCodexFromParty', () => {
  const party = [
    {
      inventory: ['torch', { key: 'healing_potion', quantity: 2 }, { name: 'no key' }],
      equipment: { weapon: 'silver_dagger', armor: null }
    },
    { inventory: [], equipment: {} }
  ];

  it('collects string items, object items, and equipped keys', () => {
    expect(partyItemKeys(party).sort()).toEqual(['healing_potion', 'silver_dagger', 'torch']);
  });

  it('seeds an old save (no codex) from current possessions', () => {
    const codex = seedCodexFromParty(undefined, party);
    expect(codex.items.sort()).toEqual(['healing_potion', 'silver_dagger', 'torch']);
    expect(codex.enemies).toEqual([]);
  });

  it('is idempotent: same reference when nothing new is carried', () => {
    const seeded = seedCodexFromParty(undefined, party);
    expect(seedCodexFromParty(seeded, party)).toBe(seeded);
  });

  it('handles an empty/absent party', () => {
    expect(partyItemKeys(undefined)).toEqual([]);
    expect(seedCodexFromParty(undefined, [])).toEqual({ items: [], enemies: [] });
  });
});

describe('discovery queries', () => {
  it('isItemDiscovered checks the persisted set', () => {
    const codex = { items: ['torch'], enemies: [] };
    expect(isItemDiscovered(codex, 'torch')).toBe(true);
    expect(isItemDiscovered(codex, 'rope')).toBe(false);
    expect(isItemDiscovered(undefined, 'torch')).toBe(false);
  });

  it('isEnemyDiscovered matches on ANY match key', () => {
    const codex = { items: [], enemies: ['goblin_ambush'] };
    const entry = { matchKeys: ['goblin_ambush'] };
    expect(isEnemyDiscovered(codex, entry)).toBe(true);
    expect(isEnemyDiscovered(codex, { matchKeys: ['wolf_pack'] })).toBe(false);
    expect(isEnemyDiscovered(undefined, entry)).toBe(false);
  });
});

describe('findBestiaryMatch', () => {
  const entries = getBestiaryEntries();

  it('matches a resolved random-table encounter by templateKey/name slug', () => {
    const match = findBestiaryMatch(entries, { templateKey: 'goblin_ambush', name: 'Goblin Ambush' });
    expect(match?.id).toBe('goblin_ambush');
  });

  it('matches a milestone boss by enemyId', () => {
    const match = findBestiaryMatch(entries, { enemyId: 'goblin_chieftain', name: 'Goblin Chieftain' });
    expect(match?.id).toBe('goblin_chieftain');
  });

  it('returns null for non-hostile narrative encounters (no phantom codex cards)', () => {
    expect(findBestiaryMatch(entries, { templateKey: 'mysterious_stranger', name: 'Mysterious Stranger' })).toBeNull();
    expect(findBestiaryMatch(entries, { name: 'Traveling Merchant' })).toBeNull();
  });

  it('returns null for empty/unidentifiable encounters', () => {
    expect(findBestiaryMatch(entries, {})).toBeNull();
    expect(findBestiaryMatch(entries, null)).toBeNull();
    expect(findBestiaryMatch(undefined, { name: 'Wolf Pack' })).toBeNull();
  });
});

describe('getItemCodexEntries', () => {
  const entries = getItemCodexEntries();

  it('auto-generates an entry for every catalog item except currency', () => {
    const catalogKeys = Object.keys(ITEM_CATALOG).filter((k) => !ITEM_CATALOG[k].isGold);
    expect(entries.map((e) => e.id).sort()).toEqual(catalogKeys.sort());
    expect(entries.find((e) => e.id === 'gold_coins')).toBeUndefined();
  });

  it('exposes only spoiler-light flavor fields (no effect/value/drop data)', () => {
    entries.forEach((e) => {
      expect(Object.keys(e).sort()).toEqual(['description', 'icon', 'id', 'name', 'rarity', 'type']);
    });
  });

  it('sorts by rarity rank then name', () => {
    const firstRare = entries.findIndex((e) => e.rarity === 'rare');
    const lastCommon = entries.map((e) => e.rarity).lastIndexOf('common');
    expect(lastCommon).toBeLessThan(firstRare);
  });
});

describe('getBestiaryEntries', () => {
  const entries = getBestiaryEntries();
  const byId = Object.fromEntries(entries.map((e) => [e.id, e]));

  it('includes storyTemplates bosses, QUEST_ENEMIES, and encounter-table hostiles', () => {
    expect(byId['goblin_chieftain']).toBeDefined(); // template boss + quest enemy (deduped)
    expect(byId['blightspawn']).toBeDefined(); // QUEST_ENEMIES
    expect(byId['goblin_ambush']).toBeDefined(); // encounter-table hostile
    expect(byId['wolf_pack']).toBeDefined();
  });

  it('never includes non-hostile narrative encounters', () => {
    expect(byId['traveling_merchant']).toBeUndefined();
    expect(byId['wandering_minstrel']).toBeUndefined();
  });

  it('deduplicates enemies present in multiple sources', () => {
    const ids = entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('exposes only spoiler-light fields — no HP, damage, DCs, or rewards', () => {
    entries.forEach((e) => {
      expect(Object.keys(e).sort()).toEqual(
        ['category', 'description', 'icon', 'id', 'image', 'matchKeys', 'name', 'tier']
      );
    });
  });

  it('gives every entry match keys covering its id and name slug', () => {
    const wolf = byId['wolf_pack'];
    expect(wolf.matchKeys).toContain('wolf_pack');
    const chieftain = byId['goblin_chieftain'];
    expect(chieftain.matchKeys).toContain('goblin_chieftain');
  });

  it('merges bosses from the current save milestones (premium/local templates)', () => {
    const withCustom = getBestiaryEntries([
      {
        type: 'combat',
        trigger: { enemy: 'sand_tyrant' },
        encounter: { name: 'Sand Tyrant', icon: '🦂', description: 'A colossal scorpion.', enemyHP: 500 }
      }
    ]);
    const tyrant = withCustom.find((e) => e.id === 'sand_tyrant');
    expect(tyrant).toBeDefined();
    expect(tyrant.category).toBe('boss');
    expect(tyrant.enemyHP).toBeUndefined(); // stats stripped
  });

  it('orders hostiles before bosses, bosses by tier', () => {
    const firstBoss = entries.findIndex((e) => e.category === 'boss');
    const lastHostile = entries.map((e) => e.category).lastIndexOf('hostile');
    expect(lastHostile).toBeLessThan(firstBoss);
    const bossTiers = entries.filter((e) => e.category === 'boss' && e.tier != null).map((e) => e.tier);
    expect([...bossTiers].sort((a, b) => a - b)).toEqual(bossTiers);
  });
});
