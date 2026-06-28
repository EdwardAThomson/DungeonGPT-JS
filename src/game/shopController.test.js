import {
  buyPrice,
  sellPrice,
  canAfford,
  buyItem,
  sellItem,
  isSellable,
  partyGold
} from './shopController';
import { ITEM_CATALOG } from '../utils/inventorySystem';

const makeParty = (gold = 0, inventory = []) => [
  { characterId: 'h1', heroName: 'Lead', gold, inventory }
];

describe('shopController pricing', () => {
  it('buyPrice reads value from the catalog', () => {
    expect(buyPrice('healing_potion')).toBe(ITEM_CATALOG.healing_potion.value);
    expect(buyPrice('rations')).toBe(5);
  });

  it('buyPrice is 0 for unknown items', () => {
    expect(buyPrice('not_a_real_item')).toBe(0);
  });

  it('sellPrice is half the catalog value, rounded', () => {
    expect(sellPrice('healing_potion')).toBe(Math.round(ITEM_CATALOG.healing_potion.value * 0.5));
    expect(sellPrice('rope')).toBe(5); // value 10 -> 5
  });
});

describe('shopController.buyItem', () => {
  it('deducts gold and adds the item to the lead hero', () => {
    const party = makeParty(100);
    const result = buyItem(party, 'healing_potion');

    expect(result.ok).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.party[0].gold).toBe(100 - buyPrice('healing_potion'));
    expect(result.party[0].inventory.some((i) => i.key === 'healing_potion')).toBe(true);
    // Original party is not mutated.
    expect(party[0].gold).toBe(100);
    expect(party[0].inventory).toHaveLength(0);
  });

  it('blocks the purchase when the party is broke and leaves the party unchanged', () => {
    const party = makeParty(10);
    const result = buyItem(party, 'healing_potion'); // costs 50

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('insufficient_gold');
    expect(result.party).toBe(party);
    expect(party[0].gold).toBe(10);
    expect(party[0].inventory).toHaveLength(0);
  });

  it('spends pooled gold across the whole party', () => {
    const party = [
      { characterId: 'h1', heroName: 'Lead', gold: 20, inventory: [] },
      { characterId: 'h2', heroName: 'Second', gold: 40, inventory: [] }
    ];
    const result = buyItem(party, 'healing_potion'); // costs 50

    expect(result.ok).toBe(true);
    expect(partyGold(result.party)).toBe(60 - 50);
    // Lead hero is drained first.
    expect(result.party[0].gold).toBe(0);
    expect(result.party[1].gold).toBe(10);
    // Item goes to the lead hero.
    expect(result.party[0].inventory.some((i) => i.key === 'healing_potion')).toBe(true);
  });

  it('canAfford reflects pooled party gold', () => {
    expect(canAfford(makeParty(50), 'healing_potion')).toBe(true);
    expect(canAfford(makeParty(49), 'healing_potion')).toBe(false);
  });
});

describe('shopController.sellItem', () => {
  it('removes the item and credits the sale price to the lead hero', () => {
    const party = makeParty(0, [{ key: 'healing_potion', name: 'Healing Potion', quantity: 1 }]);
    const result = sellItem(party, 'healing_potion');

    expect(result.ok).toBe(true);
    expect(result.gold).toBe(sellPrice('healing_potion'));
    expect(result.party[0].gold).toBe(sellPrice('healing_potion'));
    expect(result.party[0].inventory.some((i) => i.key === 'healing_potion')).toBe(false);
    // Original party is not mutated.
    expect(party[0].gold).toBe(0);
    expect(party[0].inventory).toHaveLength(1);
  });

  it('refuses to sell quest items', () => {
    expect(isSellable('quest_key')).toBe(false);
    const party = makeParty(0, [{ key: 'quest_key', name: 'Ornate Key', quantity: 1 }]);
    const result = sellItem(party, 'quest_key');

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not_sellable');
    expect(result.party).toBe(party);
    expect(party[0].inventory).toHaveLength(1);
  });

  it('refuses to sell an item the lead hero does not hold', () => {
    const party = makeParty(0, []);
    const result = sellItem(party, 'healing_potion');

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not_in_inventory');
  });
});
