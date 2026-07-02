import {
  parseBonus,
  getEquippedBonuses,
  equipItem,
  unequipSlot,
  getEquippedItem,
  getEquippableItemsForSlot,
  getSlotForItem,
  getEquippablePartyItems,
  equipItemFromParty,
  canSellItem,
  SLOT_FOR_TYPE,
  EQUIP_SLOTS
} from './equipment';

// A hero carrying one of each equippable kind, plus a non-equippable item.
const makeHero = (overrides = {}) => ({
  characterId: 'h1',
  inventory: [
    { key: 'magic_weapon' },          // weapon, bonus '+1'
    { key: 'legendary_weapon' },      // weapon, bonus '+2'
    { key: 'ring_protection' },       // ring -> accessory, bonus '+1 defense'
    { key: 'leather_armor' },         // armor, no bonus
    { key: 'magic_plate', type: 'armor', bonus: '+2 defense', name: 'Magic Plate' }, // inline armour with bonus
    { key: 'healing_potion' }         // not equippable
  ],
  ...overrides
});

describe('parseBonus', () => {
  it('parses plain signed numbers', () => {
    expect(parseBonus('+1')).toBe(1);
    expect(parseBonus('+2')).toBe(2);
    expect(parseBonus('-1')).toBe(-1);
  });

  it('parses bonus strings with trailing words', () => {
    expect(parseBonus('+1 defense')).toBe(1);
    expect(parseBonus('+2 to hit')).toBe(2);
  });

  it('passes through numeric input', () => {
    expect(parseBonus(3)).toBe(3);
    expect(parseBonus(0)).toBe(0);
  });

  it('returns 0 for missing or garbage input', () => {
    expect(parseBonus(undefined)).toBe(0);
    expect(parseBonus(null)).toBe(0);
    expect(parseBonus('')).toBe(0);
    expect(parseBonus('no number here')).toBe(0);
    expect(parseBonus({})).toBe(0);
  });
});

describe('SLOT_FOR_TYPE', () => {
  it('maps item types to the right slots', () => {
    expect(SLOT_FOR_TYPE.weapon).toBe('weapon');
    expect(SLOT_FOR_TYPE.armor).toBe('armor');
    expect(SLOT_FOR_TYPE.ring).toBe('accessory');
    expect(SLOT_FOR_TYPE.charm).toBe('accessory');
    expect(SLOT_FOR_TYPE.artifact).toBe('accessory');
  });
});

describe('getSlotForItem', () => {
  it('resolves a carried item to its slot', () => {
    const hero = makeHero();
    expect(getSlotForItem(hero, 'magic_weapon')).toBe('weapon');
    expect(getSlotForItem(hero, 'ring_protection')).toBe('accessory');
  });

  it('returns null for non-equippable or uncarried items', () => {
    const hero = makeHero();
    expect(getSlotForItem(hero, 'healing_potion')).toBeNull();
    expect(getSlotForItem(hero, 'not_in_inventory')).toBeNull();
  });
});

describe('getEquippedBonuses', () => {
  it('returns zero bonuses for an old hero with no equipment', () => {
    const hero = makeHero();
    expect(getEquippedBonuses(hero)).toEqual({ attack: 0, defense: 0, misc: 0 });
  });

  it('returns zero bonuses for a hero object missing inventory and equipment', () => {
    expect(getEquippedBonuses({})).toEqual({ attack: 0, defense: 0, misc: 0 });
  });

  it('sums bonuses from equipped gear across all slots', () => {
    const hero = makeHero({
      equipment: { weapon: 'magic_weapon', armor: 'magic_plate', accessory: 'ring_protection' }
    });
    // weapon '+1' -> attack 1, armour '+2 defense' -> defense 2, ring '+1 defense' -> misc 1
    expect(getEquippedBonuses(hero)).toEqual({ attack: 1, defense: 2, misc: 1 });
  });

  it('gives an accessory with no numeric bonus a default +1 misc', () => {
    const hero = makeHero({
      inventory: [{ key: 'fey_charm' }], // charm -> accessory, no bonus
      equipment: { accessory: 'fey_charm' }
    });
    expect(getEquippedBonuses(hero).misc).toBe(1);
  });

  it('ignores an equipped item that is no longer in the inventory', () => {
    const hero = makeHero({
      inventory: [], // item removed
      equipment: { weapon: 'magic_weapon' }
    });
    expect(getEquippedBonuses(hero)).toEqual({ attack: 0, defense: 0, misc: 0 });
  });
});

describe('equipItem / unequipSlot', () => {
  it('equips a carried item into its slot and is immutable', () => {
    const hero = makeHero();
    const updated = equipItem(hero, 'magic_weapon');
    expect(updated).not.toBe(hero);
    expect(hero.equipment).toBeUndefined();
    expect(updated.equipment.weapon).toBe('magic_weapon');
  });

  it('round-trips equip then unequip back to an empty slot', () => {
    const hero = makeHero();
    const equipped = equipItem(hero, 'magic_weapon');
    const unequipped = unequipSlot(equipped, 'weapon');
    expect(unequipped.equipment.weapon).toBeNull();
    expect(getEquippedItem(unequipped, 'weapon')).toBeNull();
  });

  it('replaces the previous item when equipping into an occupied slot', () => {
    const hero = makeHero();
    const first = equipItem(hero, 'magic_weapon');
    const second = equipItem(first, 'legendary_weapon');
    expect(second.equipment.weapon).toBe('legendary_weapon');
    expect(getEquippedItem(second, 'weapon').key).toBe('legendary_weapon');
  });

  it('does not equip a non-equippable or uncarried item', () => {
    const hero = makeHero();
    expect(equipItem(hero, 'healing_potion')).toBe(hero);
    expect(equipItem(hero, 'not_in_inventory')).toBe(hero);
  });
});

describe('getEquippableItemsForSlot', () => {
  it('lists only items that fit the slot', () => {
    const hero = makeHero();
    const weapons = getEquippableItemsForSlot(hero, 'weapon').map((i) => i.key);
    expect(weapons).toEqual(['magic_weapon', 'legendary_weapon']);

    const accessories = getEquippableItemsForSlot(hero, 'accessory').map((i) => i.key);
    expect(accessories).toEqual(['ring_protection']);

    const armor = getEquippableItemsForSlot(hero, 'armor').map((i) => i.key);
    expect(armor).toEqual(['leather_armor', 'magic_plate']);
  });

  it('exposes exactly the three documented slots', () => {
    expect(EQUIP_SLOTS).toEqual(['weapon', 'armor', 'accessory']);
  });
});

describe('getEquippablePartyItems (pooled)', () => {
  const heroA = { characterId: 'A', inventory: [{ key: 'magic_weapon' }, { key: 'leather_armor' }] };
  const heroB = { characterId: 'B', inventory: [{ key: 'legendary_weapon' }, { key: 'ring_protection' }] };

  it('pools items for a slot across every hero in the party', () => {
    const weapons = getEquippablePartyItems([heroA, heroB], 'weapon').map((i) => i.key).sort();
    expect(weapons).toEqual(['legendary_weapon', 'magic_weapon']);
  });

  it('reports how many copies are available', () => {
    const party = [{ characterId: 'A', inventory: [{ key: 'magic_weapon' }, { key: 'magic_weapon' }] }];
    const [weapon] = getEquippablePartyItems(party, 'weapon');
    expect(weapon.key).toBe('magic_weapon');
    expect(weapon.available).toBe(2);
  });

  it('excludes an item that is fully equipped, but keeps a spare copy', () => {
    const oneCopyWorn = [{ characterId: 'A', inventory: [{ key: 'magic_weapon' }], equipment: { weapon: 'magic_weapon' } }];
    expect(getEquippablePartyItems(oneCopyWorn, 'weapon')).toEqual([]);

    const spareLeft = [{ characterId: 'A', inventory: [{ key: 'magic_weapon' }, { key: 'magic_weapon' }], equipment: { weapon: 'magic_weapon' } }];
    const [weapon] = getEquippablePartyItems(spareLeft, 'weapon');
    expect(weapon.available).toBe(1);
  });

  it('only returns items whose type maps to the requested slot', () => {
    const armor = getEquippablePartyItems([heroA, heroB], 'armor').map((i) => i.key);
    expect(armor).toEqual(['leather_armor']);
    const accessories = getEquippablePartyItems([heroA, heroB], 'accessory').map((i) => i.key);
    expect(accessories).toEqual(['ring_protection']);
  });
});

describe('equipItemFromParty (pooled equip + no duplication)', () => {
  it('fills the slot without transfer when the target already carries the item', () => {
    const target = { characterId: 'A', inventory: [{ key: 'magic_weapon' }] };
    const changed = equipItemFromParty([target], 'A', 'magic_weapon');
    expect(changed).toHaveLength(1);
    expect(changed[0].characterId).toBe('A');
    expect(changed[0].equipment.weapon).toBe('magic_weapon');
    // inventory is unchanged — no copy made
    expect(changed[0].inventory).toEqual([{ key: 'magic_weapon' }]);
  });

  it('moves exactly one instance from another hero (owner loses it, wearer gains it)', () => {
    const owner = { characterId: 'A', inventory: [{ key: 'magic_weapon' }] };
    const wearer = { characterId: 'B', inventory: [] };
    const changed = equipItemFromParty([owner, wearer], 'B', 'magic_weapon');
    expect(changed).toHaveLength(2);
    const updatedOwner = changed.find((h) => h.characterId === 'A');
    const updatedWearer = changed.find((h) => h.characterId === 'B');
    // owner no longer carries it; wearer now carries AND wears it
    expect(updatedOwner.inventory.some((i) => i.key === 'magic_weapon')).toBe(false);
    expect(updatedWearer.inventory.filter((i) => i.key === 'magic_weapon')).toHaveLength(1);
    expect(updatedWearer.equipment.weapon).toBe('magic_weapon');
    // the bonus resolves on the wearer (item is in the wearer's own inventory)
    expect(getEquippedBonuses(updatedWearer).attack).toBe(1);
  });

  it('conserves the total number of copies (no duplication) on transfer', () => {
    const owner = { characterId: 'A', inventory: [{ key: 'magic_weapon' }, { key: 'magic_weapon' }] };
    const wearer = { characterId: 'B', inventory: [] };
    const changed = equipItemFromParty([owner, wearer], 'B', 'magic_weapon');
    const totalAfter = changed.reduce((n, h) => n + h.inventory.filter((i) => i.key === 'magic_weapon').length, 0);
    expect(totalAfter).toBe(2); // 2 before, 2 after
  });

  it('returns [] when every copy is already worn (no strange blocking, just a no-op)', () => {
    const owner = { characterId: 'A', inventory: [{ key: 'magic_weapon' }], equipment: { weapon: 'magic_weapon' } };
    const wearer = { characterId: 'B', inventory: [] };
    expect(equipItemFromParty([owner, wearer], 'B', 'magic_weapon')).toEqual([]);
  });

  it('returns [] for a non-equippable item or an unknown target', () => {
    const party = [{ characterId: 'A', inventory: [{ key: 'healing_potion' }] }];
    expect(equipItemFromParty(party, 'A', 'healing_potion')).toEqual([]);
    expect(equipItemFromParty(party, 'nobody', 'healing_potion')).toEqual([]);
  });

  it('preserves the target\'s other equipped slots', () => {
    const target = { characterId: 'A', inventory: [{ key: 'magic_weapon' }, { key: 'leather_armor' }], equipment: { armor: 'leather_armor' } };
    const [updated] = equipItemFromParty([target], 'A', 'magic_weapon');
    expect(updated.equipment.armor).toBe('leather_armor');
    expect(updated.equipment.weapon).toBe('magic_weapon');
  });
});

describe('canSellItem (equipped items are locked)', () => {
  it('allows selling an item that is carried but not equipped', () => {
    const hero = { characterId: 'A', inventory: [{ key: 'magic_weapon' }] };
    expect(canSellItem(hero, 'magic_weapon')).toBe(true);
  });

  it('blocks selling the only copy while it is equipped', () => {
    const hero = { characterId: 'A', inventory: [{ key: 'magic_weapon' }], equipment: { weapon: 'magic_weapon' } };
    expect(canSellItem(hero, 'magic_weapon')).toBe(false);
  });

  it('allows selling a spare while another copy is equipped', () => {
    const hero = { characterId: 'A', inventory: [{ key: 'magic_weapon' }, { key: 'magic_weapon' }], equipment: { weapon: 'magic_weapon' } };
    expect(canSellItem(hero, 'magic_weapon')).toBe(true);
  });

  it('always allows selling a non-equippable item', () => {
    const hero = { characterId: 'A', inventory: [{ key: 'healing_potion' }] };
    expect(canSellItem(hero, 'healing_potion')).toBe(true);
  });
});
