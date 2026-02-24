import {
  addItem,
  getInventoryValue,
  processRewards,
  removeGold,
  rollDice,
  rollItemDrop
} from './inventorySystem';

describe('inventorySystem', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rollDice handles dice notation with bonus', () => {
    const randomSpy = jest
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0.0) // d6 -> 1
      .mockReturnValueOnce(0.5); // d6 -> 4

    const total = rollDice('2d6+3');

    expect(total).toBe(8);
    expect(randomSpy).toHaveBeenCalledTimes(2);
  });

  it('rollItemDrop respects percentage chance parsing', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.2); // 20
    expect(rollItemDrop('healing_potion:50%')).toMatchObject({
      name: 'healing_potion',
      chance: 50,
      dropped: true
    });

    jest.spyOn(Math, 'random').mockReturnValue(0.9); // 90
    expect(rollItemDrop('healing_potion:50%').dropped).toBe(false);
    expect(rollItemDrop('raw_gems')).toEqual({ name: 'raw_gems', dropped: true });
  });

  it('processRewards zeros rewards on critical failure', () => {
    const rewards = {
      xp: 100,
      gold: '2d6',
      items: ['healing_potion:100%']
    };

    const result = processRewards(rewards, 'criticalFailure');

    expect(result).toEqual({ xp: 0, gold: 0, items: [] });
  });

  it('addItem stacks stackable items and appends non-stackables', () => {
    const withRations = addItem([], 'rations', 2);
    const stacked = addItem(withRations, 'rations', 3);
    const withWeapon = addItem(stacked, 'shortsword', 1);
    const withSecondWeapon = addItem(withWeapon, 'shortsword', 1);

    expect(stacked).toHaveLength(1);
    expect(stacked[0]).toMatchObject({ key: 'rations', quantity: 5 });
    expect(withSecondWeapon.filter((i) => i.key === 'shortsword')).toHaveLength(2);
  });

  it('removeGold returns null for insufficient funds and subtracts when possible', () => {
    const poor = { gold: 5 };
    const rich = { gold: 20 };

    expect(removeGold(poor, 10)).toBeNull();
    expect(removeGold(rich, 7)).toMatchObject({ gold: 13 });
  });

  it('getInventoryValue multiplies value by quantity', () => {
    const inventory = [
      { key: 'rations', value: 5, quantity: 3 },
      { key: 'shortsword', value: 25, quantity: 1 }
    ];

    expect(getInventoryValue(inventory)).toBe(40);
  });
});
