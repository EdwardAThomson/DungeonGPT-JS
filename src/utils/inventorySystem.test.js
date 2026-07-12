import {
  addItem,
  getInventoryValue,
  processRewards,
  removeGold,
  rollDice,
  diceRange,
  describeHealAmount,
  describeSpellDamage,
  rollItemDrop,
  ITEM_CATALOG,
  resolveTier,
  maxRarityRankForTier,
  isItemAllowedForTier,
  filterDropsByTier,
  RARITY_RANK,
  consumeHealingItem,
  isHealingConsumable,
  isConsumable,
  consumeSpellItem,
  consumeConsumable
} from './inventorySystem';

describe('food consumables restore HP (were no-ops)', () => {
  // Same shape the "Use" flow keys on: effect 'heal' + a rollable amount.
  const foods = ['rations', 'elven_rations', 'ale_mug'];

  it.each(foods)('%s is an edible heal item', (key) => {
    const item = ITEM_CATALOG[key];
    expect(item).toBeDefined();
    expect(item.effect).toBe('heal');
    expect(item.amount).toBeTruthy();
    const rolled = rollDice(item.amount);
    expect(rolled).toBeGreaterThanOrEqual(1);
  });
});

describe('consumeHealingItem (shared heal-a-consumable path)', () => {
  // heroId gives each hero a stable identity (heroUid), matching real app heroes.
  const makeHero = (over = {}) => ({
    heroId: 'h1',
    heroName: 'Aria',
    currentHP: 10,
    maxHP: 30,
    inventory: [{ key: 'healing_potion', quantity: 2 }],
    ...over
  });

  it('identifies healing consumables', () => {
    expect(isHealingConsumable('healing_potion')).toBe(true);
    expect(isHealingConsumable('rations')).toBe(true); // food heals too
    expect(isHealingConsumable('rope')).toBe(false);
    expect(isHealingConsumable('not_a_real_item')).toBe(false);
  });

  it('heals the target by the (injected) rolled amount and decrements the stack by 1', () => {
    const hero = makeHero();
    const res = consumeHealingItem('healing_potion', hero, hero, { rolled: 7 });
    expect(res.ok).toBe(true);
    expect(res.rolled).toBe(7);
    expect(res.actualHeal).toBe(7);
    expect(res.healedTarget.currentHP).toBe(17);
    // owner === target -> the healed hero also carries the decremented stack
    expect(res.sameOwner).toBe(true);
    const stack = res.healedTarget.inventory.find((i) => i.key === 'healing_potion');
    expect(stack.quantity).toBe(1);
    // The heal returns a new hero object; the input's HP is not mutated.
    // (removeItem decrements the stack quantity in place, its long-standing behavior.)
    expect(hero.currentHP).toBe(10);
  });

  it('does not overheal past maxHP', () => {
    const hero = makeHero({ currentHP: 28, maxHP: 30 });
    const res = consumeHealingItem('healing_potion', hero, hero, { rolled: 20 });
    expect(res.ok).toBe(true);
    expect(res.healedTarget.currentHP).toBe(30); // clamped
    expect(res.actualHeal).toBe(2); // only the HP actually restored
  });

  it('handles a pooled owner different from the target (shared party inventory)', () => {
    const target = makeHero({ heroId: 'target', currentHP: 5, inventory: [] });
    const owner = makeHero({ heroId: 'owner', currentHP: 30, inventory: [{ key: 'healing_potion', quantity: 3 }] });
    const res = consumeHealingItem('healing_potion', target, owner, { rolled: 6 });
    expect(res.ok).toBe(true);
    expect(res.sameOwner).toBe(false);
    // Heal lands on the target...
    expect(res.healedTarget.heroId).toBe('target');
    expect(res.healedTarget.currentHP).toBe(11);
    // ...the stack is removed from the owner, and the target keeps its own (empty) inventory
    expect(res.updatedOwner.heroId).toBe('owner');
    expect(res.updatedOwner.inventory.find((i) => i.key === 'healing_potion').quantity).toBe(2);
    expect(res.healedTarget.inventory).toEqual([]);
  });

  it('removes the item entirely when the last one is used', () => {
    const hero = makeHero({ inventory: [{ key: 'healing_potion', quantity: 1 }] });
    const res = consumeHealingItem('healing_potion', hero, hero, { rolled: 4 });
    expect(res.ok).toBe(true);
    expect(res.healedTarget.inventory.find((i) => i.key === 'healing_potion')).toBeUndefined();
  });

  it('rejects a full-HP target (no heal, no stack decrement)', () => {
    const hero = makeHero({ currentHP: 30, maxHP: 30 });
    const res = consumeHealingItem('healing_potion', hero, hero, { rolled: 5 });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('full_health');
    expect(res.healedTarget).toBeUndefined();
  });

  it('rejects a defeated target and a non-consumable item', () => {
    const defeated = makeHero({ currentHP: 0, isDefeated: true });
    expect(consumeHealingItem('healing_potion', defeated, defeated, { rolled: 5 }).reason).toBe('defeated');
    const hero = makeHero();
    expect(consumeHealingItem('rope', hero, hero, { rolled: 5 }).reason).toBe('not_consumable');
  });

  it('rolls via rollDice when no amount is injected (within the item range)', () => {
    const hero = makeHero({ currentHP: 1, maxHP: 100 });
    // healing_potion amount is 2d4+2 -> 4..10
    const res = consumeHealingItem('healing_potion', hero, hero);
    expect(res.ok).toBe(true);
    expect(res.rolled).toBeGreaterThanOrEqual(4);
    expect(res.rolled).toBeLessThanOrEqual(10);
    expect(res.actualHeal).toBe(res.rolled);
  });
});

describe('antidote is now a small heal (was cure_poison, an inert effect)', () => {
  it('is a heal consumable with a 1d4+1 amount', () => {
    expect(ITEM_CATALOG.antidote.effect).toBe('heal');
    expect(ITEM_CATALOG.antidote.amount).toBe('1d4+1');
    expect(isHealingConsumable('antidote')).toBe(true);
    expect(isConsumable('antidote')).toBe(true);
  });

  it('heals a wounded hero through the shared consume path', () => {
    const hero = { heroId: 'h1', currentHP: 5, maxHP: 20, inventory: [{ key: 'antidote', quantity: 1 }] };
    const res = consumeHealingItem('antidote', hero, hero, { rolled: 4 });
    expect(res.ok).toBe(true);
    expect(res.healedTarget.currentHP).toBe(9);
    expect(res.healedTarget.inventory.find((i) => i.key === 'antidote')).toBeUndefined();
  });
});

describe('isConsumable (generalized over heal + spell families)', () => {
  it('is true for heals with an amount and spells with a damage', () => {
    expect(isConsumable('healing_potion')).toBe(true); // heal
    expect(isConsumable('rations')).toBe(true); // food heal
    expect(isConsumable('scroll_fireball')).toBe(true); // spell with damage
  });
  it('is false for non-consumables and unknown ids', () => {
    expect(isConsumable('rope')).toBe(false);
    expect(isConsumable('silver_dagger')).toBe(false); // weapon
    expect(isConsumable('not_a_real_item')).toBe(false);
  });
});

describe('consumeSpellItem (offensive scroll: rolls damage, decrements the scroll)', () => {
  const makeOwner = (over = {}) => ({
    heroId: 'caster',
    currentHP: 20,
    maxHP: 20,
    inventory: [{ key: 'scroll_fireball', quantity: 2 }],
    ...over
  });

  it('rolls the scroll damage (injected) and decrements the stack by 1, without touching HP', () => {
    const owner = makeOwner();
    const res = consumeSpellItem('scroll_fireball', owner, { rolled: 12 });
    expect(res.ok).toBe(true);
    expect(res.itemName).toBe('Fire Scroll');
    expect(res.rolled).toBe(12);
    expect(res.damage).toBe(12);
    // stack decremented, HP untouched (target is the enemy, not the caster)
    expect(res.updatedOwner.inventory.find((i) => i.key === 'scroll_fireball').quantity).toBe(1);
    expect(res.updatedOwner.currentHP).toBe(20);
    // input not mutated at the HP level
    expect(owner.currentHP).toBe(20);
  });

  it('removes the scroll entirely when the last one is used', () => {
    const owner = makeOwner({ inventory: [{ key: 'scroll_fireball', quantity: 1 }] });
    const res = consumeSpellItem('scroll_fireball', owner, { rolled: 9 });
    expect(res.ok).toBe(true);
    expect(res.updatedOwner.inventory.find((i) => i.key === 'scroll_fireball')).toBeUndefined();
  });

  it('rolls via rollDice within the 3d6 range when no damage is injected', () => {
    const owner = makeOwner();
    const res = consumeSpellItem('scroll_fireball', owner);
    expect(res.ok).toBe(true);
    expect(res.rolled).toBeGreaterThanOrEqual(3);
    expect(res.rolled).toBeLessThanOrEqual(18);
  });

  it('rejects a non-spell item and a missing owner', () => {
    expect(consumeSpellItem('healing_potion', makeOwner(), { rolled: 5 }).reason).toBe('not_consumable');
    expect(consumeSpellItem('scroll_fireball', null, { rolled: 5 }).reason).toBe('no_owner');
  });
});

describe('consumeConsumable (single dispatch by effect)', () => {
  it('dispatches heal -> heal result', () => {
    const hero = { heroId: 'h1', currentHP: 5, maxHP: 20, inventory: [{ key: 'healing_potion', quantity: 1 }] };
    const res = consumeConsumable('healing_potion', hero, hero, { rolled: 6 });
    expect(res.ok).toBe(true);
    expect(res.healedTarget.currentHP).toBe(11); // heal-shaped result
  });

  it('dispatches spell -> spell result (owner supplies the scroll)', () => {
    const owner = { heroId: 'caster', currentHP: 20, maxHP: 20, inventory: [{ key: 'scroll_fireball', quantity: 1 }] };
    const res = consumeConsumable('scroll_fireball', null, owner, { rolled: 10 });
    expect(res.ok).toBe(true);
    expect(res.damage).toBe(10); // spell-shaped result
    expect(res.updatedOwner.inventory.find((i) => i.key === 'scroll_fireball')).toBeUndefined();
  });

  it('returns not_consumable for a non-consumable and an unknown id', () => {
    const hero = { heroId: 'h1', currentHP: 5, maxHP: 20, inventory: [] };
    expect(consumeConsumable('rope', hero, hero).reason).toBe('not_consumable');
    expect(consumeConsumable('not_a_real_item', hero, hero).reason).toBe('not_consumable');
  });
});

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

describe('rarity-by-tier loot gating', () => {
  it('resolveTier prefers explicit tier, falls back to level, defaults to 1', () => {
    expect(resolveTier({ tier: 2 })).toBe(2);
    expect(resolveTier({ tier: 2, level: 1 })).toBe(2); // explicit tier wins
    // Level -> tier: Lv 1-2 = T1, Lv 3-4 = T2, Lv 5-6 = T3
    expect(resolveTier({ level: 1 })).toBe(1);
    expect(resolveTier({ level: 2 })).toBe(1);
    expect(resolveTier({ level: 3 })).toBe(2);
    expect(resolveTier({ level: 4 })).toBe(2);
    expect(resolveTier({ level: 5 })).toBe(3);
    expect(resolveTier({})).toBe(1);
    expect(resolveTier()).toBe(1);
  });

  it('maxRarityRankForTier caps Tier 1 at rare and opens up higher tiers', () => {
    expect(maxRarityRankForTier(1)).toBe(RARITY_RANK.rare);
    expect(maxRarityRankForTier(2)).toBe(RARITY_RANK.very_rare);
    expect(maxRarityRankForTier(3)).toBe(RARITY_RANK.legendary);
  });

  it('Tier 1 blocks very_rare and legendary but allows common..rare', () => {
    const t1 = { tier: 1 };
    // Allowed at Tier 1
    expect(isItemAllowedForTier('healing_potion', t1)).toBe(true); // common
    expect(isItemAllowedForTier('silver_dagger', t1)).toBe(true);  // uncommon
    expect(isItemAllowedForTier('magic_weapon', t1)).toBe(true);   // rare
    // Blocked at Tier 1
    expect(isItemAllowedForTier('legendary_weapon', t1)).toBe(false);   // very_rare
    expect(isItemAllowedForTier('legendary_artifact', t1)).toBe(false); // very_rare
    expect(isItemAllowedForTier('dragonscale_plate', t1)).toBe(false);  // very_rare
    expect(isItemAllowedForTier('dragon_egg', t1)).toBe(false);         // legendary
  });

  it('low party level (no explicit tier) also blocks very_rare/legendary', () => {
    const lowLevel = { level: 2 }; // -> Tier 1
    expect(isItemAllowedForTier('legendary_artifact', lowLevel)).toBe(false);
    expect(isItemAllowedForTier('dragon_egg', lowLevel)).toBe(false);
    expect(isItemAllowedForTier('magic_weapon', lowLevel)).toBe(true);
  });

  it('Tier 2 allows very_rare; Tier 3+ allows legendary', () => {
    expect(isItemAllowedForTier('legendary_artifact', { tier: 2 })).toBe(true); // very_rare
    expect(isItemAllowedForTier('dragon_egg', { tier: 2 })).toBe(false);        // legendary still gated
    expect(isItemAllowedForTier('dragon_egg', { tier: 3 })).toBe(true);         // legendary ok
  });

  it('unknown item keys fail open (not blocked)', () => {
    expect(isItemAllowedForTier('not_a_real_item', { tier: 1 })).toBe(true);
  });

  it('filterDropsByTier strips gated rarities at Tier 1 and preserves order', () => {
    const rolled = ['healing_potion', 'legendary_artifact', 'magic_weapon', 'dragon_egg'];
    expect(filterDropsByTier(rolled, { tier: 1 })).toEqual(['healing_potion', 'magic_weapon']);
    // Same list at Tier 3 keeps everything.
    expect(filterDropsByTier(rolled, { tier: 3 })).toEqual(rolled);
    expect(filterDropsByTier(undefined, { tier: 1 })).toEqual([]);
  });
});

describe('diceRange / describeHealAmount (heal-amount display)', () => {
  it('computes min/max from XdY+Z notation', () => {
    // min = X*1 + Z, max = X*Y + Z
    expect(diceRange('2d4+2')).toEqual({ min: 4, max: 10 });
    expect(diceRange('4d4+4')).toEqual({ min: 8, max: 20 });
    expect(diceRange('1d4')).toEqual({ min: 1, max: 4 });
    expect(diceRange('3d6')).toEqual({ min: 3, max: 18 });
  });

  it('treats bare numbers and numeric strings as a fixed value', () => {
    expect(diceRange(5)).toEqual({ min: 5, max: 5 });
    expect(diceRange('7')).toEqual({ min: 7, max: 7 });
  });

  it('returns null for bad/empty input rather than throwing', () => {
    expect(diceRange('')).toBeNull();
    expect(diceRange(null)).toBeNull();
    expect(diceRange(undefined)).toBeNull();
    expect(diceRange('not-dice')).toBeNull();
    expect(diceRange({})).toBeNull();
  });

  it('matches the catalog: derived range always contains a real roll', () => {
    const { min, max } = diceRange(ITEM_CATALOG.healing_potion.amount);
    for (let i = 0; i < 50; i++) {
      const rolled = rollDice(ITEM_CATALOG.healing_potion.amount);
      expect(rolled).toBeGreaterThanOrEqual(min);
      expect(rolled).toBeLessThanOrEqual(max);
    }
  });

  it('describeHealAmount formats formula + range', () => {
    expect(describeHealAmount('2d4+2')).toBe('2d4+2 HP (4 to 10)');
    expect(describeHealAmount('4d4+4')).toBe('4d4+4 HP (8 to 20)');
    expect(describeHealAmount('1d4')).toBe('1d4 HP (1 to 4)');
  });

  it('describeHealAmount collapses a fixed amount to a single number', () => {
    expect(describeHealAmount(5)).toBe('5 HP (5)');
  });

  it('describeHealAmount returns null for bad/empty input', () => {
    expect(describeHealAmount('')).toBeNull();
    expect(describeHealAmount(null)).toBeNull();
    expect(describeHealAmount('garbage')).toBeNull();
  });

  it('describeSpellDamage formats formula + range with no inline unit', () => {
    expect(describeSpellDamage('3d6')).toBe('3d6 (3 to 18)');
    expect(describeSpellDamage(ITEM_CATALOG.scroll_fireball.damage)).toBe('3d6 (3 to 18)');
  });

  it('describeSpellDamage collapses a fixed amount and rejects bad input', () => {
    expect(describeSpellDamage(5)).toBe('5 (5)');
    expect(describeSpellDamage('')).toBeNull();
    expect(describeSpellDamage(null)).toBeNull();
    expect(describeSpellDamage('garbage')).toBeNull();
  });
});
